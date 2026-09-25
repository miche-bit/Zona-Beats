(function loadEnv() {
  const fs = require('node:fs');
  const path = require('node:path');
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  });
})();

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const db = require('./db');
const { issueStreamToken, validateStreamToken } = require('./streamAuth');
const { createBackup, restoreBackup, buildZip } = require('./backup');
const { buildLicensePdf, LICENSE_LABELS } = require('./license');
const producerAuth = require('./producerAuth');
const { applyWatermark } = require('./watermark');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cambiaesto123';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const DATA_ROOT = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const UPLOADS_AUDIO = path.join(DATA_ROOT, 'uploads', 'audio');
const UPLOADS_COVERS = path.join(DATA_ROOT, 'uploads', 'covers');
const UPLOADS_RECEIPTS = path.join(DATA_ROOT, 'uploads', 'receipts');
const UPLOADS_WATERMARK = path.join(DATA_ROOT, 'uploads', 'watermark');
const TMP_PROCESSING = path.join(DATA_ROOT, 'uploads', 'tmp');
const UPLOADS_MASTERS = path.join(DATA_ROOT, 'uploads', 'masters');
[UPLOADS_AUDIO, UPLOADS_COVERS, UPLOADS_RECEIPTS, UPLOADS_WATERMARK, TMP_PROCESSING, UPLOADS_MASTERS].forEach(d => fs.mkdirSync(d, { recursive: true }));

const MAX_AUDIO_BYTES = 150 * 1024 * 1024; // 150MB por pista (para WAV sin comprimir)
const MAX_COVER_BYTES = 8 * 1024 * 1024;  // 8MB portada
const MAX_RECEIPT_BYTES = 12 * 1024 * 1024; // 12MB comprobante (fotos de capturas de pantalla pueden pesar más que una portada)
const MAX_WATERMARK_BYTES = 10 * 1024 * 1024; // 10MB para el audio corto de la voz de marca de agua

function signSession() {
  const payload = `admin:${Date.now()}`;
  const sig = crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64');
}

function verifySession(cookieValue) {
  try {
    const decoded = Buffer.from(cookieValue, 'base64').toString('utf8');
    const [payload, sig] = decoded.split('.');
    const expectedSig = crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(payload).digest('hex');
    if (sig !== expectedSig) return false;
    const ts = Number(payload.split(':')[1]);
    return Date.now() - ts < 1000 * 60 * 60 * 12;
  } catch {
    return false;
  }
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  const parts = header.split(';').map(p => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + '=')) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

function isAdminAuthed(req) {
  const cookie = getCookie(req, 'admin_session');
  return cookie && verifySession(cookie);
}

function getAuthedProducer(req) {
  const token = getCookie(req, 'producer_session');
  return producerAuth.getProducerFromSession(token);
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) return sendJSON(res, 404, { error: 'No encontrado' });
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// Límite simple de intentos por IP (en memoria) para frenar fuerza bruta.
const rateBuckets = new Map();
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}
function rateLimit(req, key, max, windowMs) {
  const k = key + '|' + clientIp(req);
  const now = Date.now();
  let b = rateBuckets.get(k);
  if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; rateBuckets.set(k, b); }
  b.count++;
  return b.count <= max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of rateBuckets) if (now > b.reset) rateBuckets.delete(k);
}, 10 * 60 * 1000).unref();

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(boundaryBuf);
  while (start !== -1) {
    const next = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (next === -1) break;
    let part = buffer.slice(start + boundaryBuf.length, next);
    if (part.slice(0, 2).toString() === '\r\n') part = part.slice(2);
    part = part.slice(0, part.length - 2); // quitar CRLF final antes del siguiente boundary
    if (part.length > 0) parts.push(part);
    start = next;
  }

  return parts.map(part => {
    const headerEnd = part.indexOf('\r\n\r\n');
    const headerStr = part.slice(0, headerEnd).toString('utf8');
    const content = part.slice(headerEnd + 4);

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]*)"/);
    const typeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

    return {
      name: nameMatch ? nameMatch[1] : null,
      filename: filenameMatch ? filenameMatch[1] : null,
      contentType: typeMatch ? typeMatch[1].trim() : null,
      data: content,
    };
  });
}

function safeExt(filename, fallback) {
  const ext = path.extname(filename || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return ext || fallback;
}

const ALLOWED_AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.ogg', '.flac'];
const ALLOWED_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

function contentTypeForAudio(ext) {
  return {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
  }[ext] || 'application/octet-stream';
}

function contentTypeForImage(ext) {
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  }[ext] || 'application/octet-stream';
}

const routes = [];
function route(method, pattern, handler) {
  routes.push({ method, pattern, handler });
}

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const paramNames = [];
    const regexStr = '^' + r.pattern.replace(/:[^/]+/g, (m) => {
      paramNames.push(m.slice(1));
      return '([^/]+)';
    }) + '$';
    const match = pathname.match(new RegExp(regexStr));
    if (match) {
      const params = {};
      paramNames.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
      return { handler: r.handler, params };
    }
  }
  return null;
}

// GET /api/tracks?type=catalog|playlist|vip
route('GET', '/api/tracks', (req, res, params, query) => {
  const type = query.get('type') || 'catalog';
  let rows;

  if (type === 'playlist') {
    rows = db.prepare(`
      SELECT t.id, t.title, t.genre, t.description, t.artist_credit, t.cover_filename, t.duration_seconds, t.plays, t.likes, t.created_at,
             p.name as producer_name
      FROM tracks t LEFT JOIN producers p ON p.id = t.producer_id
      WHERE t.is_playlist = 1 AND t.approval_status = 'approved' ORDER BY t.created_at DESC
    `).all();
  } else if (type === 'vip') {
    rows = db.prepare(`
      SELECT t.id, t.title, t.genre, t.description, t.cover_filename, t.duration_seconds, t.plays,
             t.price_label, t.price_cup, t.for_sale, t.is_exclusive, t.sold, t.created_at,
             p.name as producer_name
      FROM tracks t
      LEFT JOIN producers p ON p.id = t.producer_id
      WHERE t.is_playlist = 0 AND t.is_exclusive = 1 AND t.sold = 1 AND t.approval_status = 'approved'
      ORDER BY t.created_at DESC
    `).all();
  } else {
    rows = db.prepare(`
      SELECT t.id, t.title, t.genre, t.description, t.cover_filename, t.duration_seconds, t.plays,
             t.price_label, t.price_cup, t.for_sale, t.is_exclusive, t.sold, t.created_at,
             p.name as producer_name
      FROM tracks t
      LEFT JOIN producers p ON p.id = t.producer_id
      WHERE t.is_playlist = 0 AND t.sold = 0 AND t.approval_status = 'approved'
      ORDER BY t.created_at DESC
    `).all();
  }

  const pct = descuentoActivo();
  if (type === 'catalog') {
    rows = rows.map(t => ({
      ...t,
      price_cup: aplicarDescuento(t.price_cup, pct),
      original_cup: t.price_cup,
      licenses: getTrackLicenses(t.id).map(l => ({ ...l, price_cup: aplicarDescuento(l.price_cup, pct), original_cup: l.price_cup })),
    }));
  }

  sendJSON(res, 200, { tracks: rows, discountPercent: pct });
});

route('GET', '/api/profile', (req, res) => {
  const profile = db.prepare('SELECT artist_name, bio, avatar_filename FROM profile WHERE id = 1').get();
  sendJSON(res, 200, { profile });
});

route('GET', '/api/site-config', (req, res) => {
  const config = db.prepare('SELECT promo_text, promo_active, schedule_text FROM site_config WHERE id = 1').get();
  sendJSON(res, 200, {
    promoText: config.promo_text || '',
    promoActive: Boolean(config.promo_active),
    scheduleText: config.schedule_text || '',
    discountPercent: descuentoActivo(),
  });
});

route('GET', '/api/exchange-rates', (req, res) => {
  const row = db.prepare('SELECT rates_json FROM exchange_rates WHERE id = 1').get();
  let rates = [];
  try { rates = JSON.parse(row.rates_json || '[]'); } catch { rates = []; }
  sendJSON(res, 200, { rates });
});

route('GET', '/api/payment-info', (req, res) => {
  const info = db.prepare('SELECT contact_phone, accounts_json FROM payment_info WHERE id = 1').get();
  let accounts = [];
  try { accounts = JSON.parse(info.accounts_json || '[]'); } catch { accounts = []; }
  sendJSON(res, 200, { contactPhone: info.contact_phone || '', accounts });
});

function findApprovedOrderByCertificate(certificateId) {
  return db.prepare(`
    SELECT o.*, p.name as producer_name
    FROM orders o
    LEFT JOIN producers p ON p.id = o.producer_id
    WHERE o.certificate_id = ? AND o.status = 'approved'
  `).get(certificateId);
}

function baseUrlFrom(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

route('GET', '/api/verify-hash/:hash', (req, res, params) => {
  const hash = String(params.hash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return sendJSON(res, 400, { error: 'Eso no es un hash SHA-256 válido (deben ser 64 caracteres hexadecimales).' });
  }

  const lic = db.prepare("SELECT certificate_id FROM orders WHERE certificate_hash = ? AND status = 'approved'").get(hash);
  if (lic) return sendJSON(res, 200, { type: 'license', certificateId: lic.certificate_id });

  const track = db.prepare(`
    SELECT t.id, t.title, t.created_at, p.name as producer_name
    FROM tracks t LEFT JOIN producers p ON p.id = t.producer_id
    WHERE t.master_hash = ?
  `).get(hash);
  if (track) {
    const profile = db.prepare('SELECT artist_name FROM profile WHERE id = 1').get();
    const licencias = db.prepare(`
      SELECT certificate_id, license_type, created_at FROM orders
      WHERE track_id = ? AND status = 'approved' ORDER BY created_at ASC
    `).all(track.id);
    return sendJSON(res, 200, {
      type: 'audio',
      trackTitle: track.title,
      producerName: track.producer_name || (profile && profile.artist_name) || 'Zona Beats',
      uploadedAt: track.created_at,
      licenciasEmitidas: licencias.map(l => ({
        certificateId: l.certificate_id,
        licenseLabel: LICENSE_LABELS[l.license_type] || l.license_type,
        createdAt: l.created_at,
      })),
    });
  }

  sendJSON(res, 404, { error: 'Ese hash no corresponde a ninguna licencia ni a ningún archivo registrado en esta plataforma.' });
});

route('GET', '/api/license/:certificateId', (req, res, params) => {
  if (!rateLimit(req, 'license', 60, 60 * 1000)) return sendJSON(res, 429, { error: 'Demasiadas consultas. Espera un minuto.' });
  const order = findApprovedOrderByCertificate(params.certificateId);
  if (!order) return sendJSON(res, 404, { error: 'No existe una licencia con ese numero' });
  const profile = db.prepare('SELECT artist_name FROM profile WHERE id = 1').get();
  sendJSON(res, 200, {
    valid: true,
    certificateId: order.certificate_id,
    certificateHash: order.certificate_hash,
    trackTitle: order.track_title,
    producerName: order.producer_name || (profile && profile.artist_name) || 'Zona Beats',
    buyerName: order.buyer_name,
    licenseType: order.license_type,
    licenseLabel: LICENSE_LABELS[order.license_type] || order.license_type,
    priceLabel: order.price_label,
    createdAt: order.created_at,
  });
});

// ---------- Compras del comprador (link privado, no se comparte) ----------
// El número LIC es público (sirve para verificar), por eso NO permite descargar.
// La descarga usa un token secreto que solo tiene el comprador.
function findOrderByBuyerToken(token) {
  const t = String(token || '').toLowerCase();
  if (!/^[a-f0-9]{48}$/.test(t)) return null;
  return db.prepare('SELECT * FROM orders WHERE buyer_token = ?').get(t) || null;
}

function archivoDeCompra(order) {
  const track = db.prepare('SELECT title, master_filename, stems_filename, wav_filename FROM tracks WHERE id = ?').get(order.track_id);
  if (!track) return null;
  // Básica: MP3/original · Premium: WAV si lo hay · Ilimitada/Exclusiva: ZIP con WAV + STEMS
  const tieneDerechoAlZip = SINGLE_SALE_LICENSES.includes(order.license_type);
  const usarZip = Boolean(tieneDerechoAlZip && track.stems_filename);
  let fileName = track.master_filename || '';
  if (usarZip) fileName = track.stems_filename;
  else if (order.license_type === 'premium' && track.wav_filename) fileName = track.wav_filename;
  const filePath = fileName ? path.join(UPLOADS_MASTERS, fileName) : '';
  if (!fileName || !fs.existsSync(filePath)) return null;
  return { track, fileName, filePath, usarZip };
}

route('GET', '/api/purchase/:token', (req, res, params) => {
  if (!rateLimit(req, 'purchase', 60, 60 * 1000)) return sendJSON(res, 429, { error: 'Demasiadas consultas. Espera un minuto.' });
  const order = findOrderByBuyerToken(params.token);
  if (!order) return sendJSON(res, 404, { error: 'No encontramos esta compra. Puede que el vendedor haya rechazado el comprobante; escríbele por WhatsApp.' });
  const aprobada = order.status === 'approved';
  const archivo = aprobada ? archivoDeCompra(order) : null;
  sendJSON(res, 200, {
    status: aprobada ? 'approved' : 'pending',
    trackTitle: order.track_title,
    licenseType: order.license_type,
    licenseLabel: LICENSE_LABELS[order.license_type] || order.license_type,
    priceLabel: order.price_label,
    createdAt: order.created_at,
    certificateId: aprobada ? order.certificate_id : null,
    pdfUrl: aprobada ? `/api/license/${encodeURIComponent(order.certificate_id)}/pdf` : null,
    downloadUrl: aprobada && archivo ? `/api/purchase/${order.buyer_token}/download` : null,
    fileKind: archivo ? (archivo.usarZip ? 'zip' : 'audio') : null,
  });
});

route('GET', '/api/purchase/:token/download', (req, res, params) => {
  if (!rateLimit(req, 'purchase-dl', 30, 60 * 1000)) return sendJSON(res, 429, { error: 'Demasiadas descargas seguidas. Espera un minuto.' });
  const order = findOrderByBuyerToken(params.token);
  if (!order || order.status !== 'approved') return sendJSON(res, 404, { error: 'Esta compra no existe o todavía no fue aprobada' });
  const archivo = archivoDeCompra(order);
  if (!archivo) {
    return sendJSON(res, 404, { error: 'El archivo de esta compra todavía no está disponible para descarga automática. Escríbele al vendedor.' });
  }
  const ext = path.extname(archivo.fileName).toLowerCase();
  const safeTitle = String(archivo.track.title || 'beat').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'beat';
  res.writeHead(200, {
    'Content-Type': archivo.usarZip ? 'application/zip' : contentTypeForAudio(ext),
    'Content-Disposition': `attachment; filename="${safeTitle}${ext}"`,
    'Content-Length': fs.statSync(archivo.filePath).size,
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(archivo.filePath).pipe(res);
});

route('GET', '/api/license/:certificateId/pdf', (req, res, params) => {
  const order = findApprovedOrderByCertificate(params.certificateId);
  if (!order) return sendJSON(res, 404, { error: 'No existe una licencia con ese numero' });
  const profile = db.prepare('SELECT artist_name FROM profile WHERE id = 1').get();
  try {
    const pdf = buildLicensePdf({
      certificateId: order.certificate_id,
      certificateHash: order.certificate_hash,
      trackTitle: order.track_title,
      producerName: order.producer_name || (profile && profile.artist_name) || 'Zona Beats',
      buyerName: order.buyer_name,
      licenseType: order.license_type,
      priceLabel: order.price_label,
      createdAt: order.created_at,
      verifyUrl: `${baseUrlFrom(req)}/verify/${order.certificate_id}`,
      platformName: (profile && profile.artist_name) || 'Zona Beats',
    });
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${order.certificate_id}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  } catch (err) {
    console.error('Error generando licencia PDF:', err.message);
    sendJSON(res, 500, { error: 'No se pudo generar el PDF de la licencia' });
  }
});

route('POST', '/api/producer/register', async (req, res) => {
  if (!rateLimit(req, 'register', 10, 60 * 60 * 1000)) {
    return sendJSON(res, 429, { error: 'Demasiados registros desde esta conexión. Intenta más tarde.' });
  }
  try {
    const body = await readBody(req, 1024 * 5);
    const { name, email, password, phone } = JSON.parse(body.toString('utf8'));
    const cleanName = (name || '').trim().slice(0, 80);
    const cleanEmail = (email || '').trim().toLowerCase().slice(0, 120);
    const cleanPhone = String(phone || '').replace(/[^0-9+]/g, '').slice(0, 20);
    if (!cleanName || !cleanEmail || !password || password.length < 6) {
      return sendJSON(res, 400, { error: 'Nombre, correo y contraseña (mínimo 6 caracteres) son obligatorios' });
    }
    if (cleanPhone.replace(/[^0-9]/g, '').length < 8) {
      return sendJSON(res, 400, { error: 'Escribe tu número de teléfono (WhatsApp) para que el administrador pueda contactarte' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return sendJSON(res, 400, { error: 'Escribe un correo válido' });
    }
    if (db.prepare('SELECT id FROM producers WHERE email = ?').get(cleanEmail)) {
      return sendJSON(res, 409, { error: 'Ya existe una cuenta con ese correo' });
    }
    const { hash, salt } = producerAuth.hashPassword(password);
    db.prepare(`INSERT INTO producers (name, email, password_hash, password_salt, active, approved, plan, contact_phone)
                VALUES (?, ?, ?, ?, 1, 0, 'free', ?)`).run(cleanName, cleanEmail, hash, salt, cleanPhone);
    sendJSON(res, 201, { ok: true, pending: true });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('GET', '/api/producer/me', (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });
  const full = producerFull(producer.id);
  const plan = getPlan(full);
  const cfg = db.prepare('SELECT admin_phone FROM platform_config WHERE id = 1').get();
  const usados = db.prepare("SELECT COUNT(*) as c FROM tracks WHERE producer_id = ? AND approval_status != 'rejected' AND sold = 0").get(producer.id).c;
  let social = []; let accounts = [];
  try { social = JSON.parse(full.social_links_json || '[]'); } catch {}
  try { accounts = JSON.parse(full.accounts_json || '[]'); } catch {}
  sendJSON(res, 200, {
    id: full.id,
    name: full.name,
    email: full.email,
    bio: full.bio || '',
    avatar: full.avatar_filename || '',
    approved: Boolean(full.approved),
    active: Boolean(full.active),
    desactivadoPorPago: !full.active && full.disabled_reason === 'plan_vencido',
    exclusiveEnabled: Boolean(full.exclusive_enabled) || plan.exclusiveAuto,
    plan: full.plan || 'free',
    planLabel: plan.label,
    planCommission: plan.commission,
    planMaxBeats: plan.maxBeats === Infinity ? null : plan.maxBeats,
    planPayout: plan.payout,
    planPaidUntil: full.plan_paid_until || '',
    planVigente: planVigente(full),
    diasRestantes: diasRestantesPlan(full),
    diasParaEliminar: diasParaEliminar(full),
    puedeRedes: plan.social,
    puedeWav: plan.wav,
    puedeStems: plan.stems,
    soloMp3: Boolean(plan.audioExt),
    previewConMarca: plan.watermarkPreview,
    beatsUsados: usados,
    socialLinks: social,
    accounts,
    contactPhone: full.contact_phone || '',
    adminPhone: (cfg && cfg.admin_phone) || '',
    monedasPermitidas: adminCurrencies(),
    planes: Object.entries(PRODUCER_PLANS).map(([k, v]) => ({
      key: k, label: v.label, commission: v.commission,
      maxBeats: v.maxBeats === Infinity ? null : v.maxBeats,
      priceUsd: v.priceUsd, priceCup: planPriceCup(k), payout: v.payout, exclusiveAuto: v.exclusiveAuto,
      wav: v.wav, stems: v.stems, social: v.social, watermarkPreview: v.watermarkPreview,
    })),
    planRequest: ultimaSolicitudPlan(full.id),
  });
});

route('POST', '/api/producer/profile', async (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });
  try {
    const body = await readBody(req, 1024 * 30);
    const { name, bio, socialLinks, accounts, contactPhone } = JSON.parse(body.toString('utf8'));
    const permitidas = adminCurrencies();

    const cleanSocial = Array.isArray(socialLinks) ? socialLinks
      .filter(l => l && l.url && /^https?:\/\//i.test(l.url))
      .slice(0, 8)
      .map(l => ({ label: String(l.label || '').slice(0, 40).trim(), url: String(l.url).slice(0, 300).trim() })) : [];

    const rechazadas = [];
    const cleanAccounts = Array.isArray(accounts) ? accounts
      .filter(a => a && (a.bank || a.number))
      .slice(0, 10)
      .filter(a => {
        const ok = permitidas.includes(String(a.currency || ''));
        if (!ok) rechazadas.push(String(a.currency || '?'));
        return ok;
      })
      .map(a => ({
        currency: String(a.currency).slice(0, 20).trim(),
        bank: String(a.bank || '').slice(0, 60).trim(),
        number: String(a.number || '').slice(0, 60).trim(),
      })) : [];

    db.prepare('UPDATE producers SET name = ?, bio = ?, social_links_json = ?, accounts_json = ?, contact_phone = ? WHERE id = ?')
      .run(
        String(name || producer.name).slice(0, 80).trim() || producer.name,
        String(bio || '').slice(0, 400).trim(),
        JSON.stringify(cleanSocial),
        JSON.stringify(cleanAccounts),
        String(contactPhone || '').slice(0, 40).trim(),
        producer.id
      );
    sendJSON(res, 200, { ok: true, rechazadas: [...new Set(rechazadas)], monedasPermitidas: permitidas });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('GET', '/api/producer/avatar/:id', (req, res, params) => {
  const row = db.prepare('SELECT avatar_filename FROM producers WHERE id = ?').get(params.id);
  if (!row || !row.avatar_filename) return sendJSON(res, 404, { error: 'Sin foto' });
  const filePath = path.join(UPLOADS_COVERS, row.avatar_filename);
  sendFile(res, filePath, contentTypeForImage(path.extname(row.avatar_filename).toLowerCase()));
});

route('POST', '/api/producer/avatar', async (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });
  const contentType = req.headers['content-type'] || '';
  const bm = contentType.match(/boundary=(.+)$/);
  if (!bm) return sendJSON(res, 400, { error: 'Falta boundary multipart' });
  let buffer;
  try { buffer = await readBody(req, MAX_COVER_BYTES + 1024 * 50); }
  catch { return sendJSON(res, 413, { error: 'Imagen demasiado grande' }); }

  const parts = parseMultipart(buffer, bm[1]);
  const avatarPart = parts.find(p => p.filename && p.name === 'avatar');
  if (!avatarPart) return sendJSON(res, 400, { error: 'Falta la imagen' });
  const ext = safeExt(avatarPart.filename, '.jpg');
  if (!ALLOWED_IMAGE_EXT.includes(ext)) return sendJSON(res, 400, { error: 'Formato no permitido' });

  const prev = db.prepare('SELECT avatar_filename FROM producers WHERE id = ?').get(producer.id);
  if (prev && prev.avatar_filename) {
    const old = path.join(UPLOADS_COVERS, prev.avatar_filename);
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }
  const filename = `prod-${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_COVERS, filename), avatarPart.data);
  db.prepare('UPDATE producers SET avatar_filename = ? WHERE id = ?').run(filename, producer.id);
  sendJSON(res, 200, { ok: true, avatar: filename });
});

const PLAN_MESES_PERMITIDOS = [1, 3, 6, 12];

route('POST', '/api/producer/plan-request', async (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });

  const contentType = req.headers['content-type'] || '';
  const bm = contentType.match(/boundary=(.+)$/);
  if (!bm) return sendJSON(res, 400, { error: 'Falta boundary multipart' });

  let buffer;
  try { buffer = await readBody(req, MAX_RECEIPT_BYTES + 1024 * 20); }
  catch { return sendJSON(res, 413, { error: 'La imagen del comprobante es demasiado grande (máx 12MB)' }); }

  const parts = parseMultipart(buffer, bm[1]);
  const fields = {};
  let receiptPart = null;
  for (const part of parts) {
    if (part.filename && part.name === 'receipt') receiptPart = part;
    else if (part.name) fields[part.name] = part.data.toString('utf8');
  }

  const plan = String(fields.plan || '');
  const months = parseInt(fields.months, 10);
  const currency = String(fields.currency || 'CUP').slice(0, 30).trim();
  if (plan !== 'pro' && plan !== 'studio') return sendJSON(res, 400, { error: 'Elige el plan Pro o Studio' });
  if (!PLAN_MESES_PERMITIDOS.includes(months)) return sendJSON(res, 400, { error: 'Elige cuántos meses vas a pagar' });
  if (!receiptPart || !receiptPart.data.length) return sendJSON(res, 400, { error: 'Adjunta la foto del comprobante de pago' });

  const ext = safeExt(receiptPart.filename, '.jpg');
  if (!ALLOWED_IMAGE_EXT.includes(ext)) return sendJSON(res, 400, { error: 'El comprobante debe ser una imagen (JPG, PNG o WEBP)' });

  const pendiente = db.prepare("SELECT id FROM plan_requests WHERE producer_id = ? AND status = 'pending'").get(producer.id);
  if (pendiente) return sendJSON(res, 409, { error: 'Ya tienes una solicitud de plan en revisión. Espera a que el administrador la responda.' });

  const precio = planPriceCup(plan);
  if (!precio) return sendJSON(res, 400, { error: 'El administrador todavía no puso precio a ese plan' });

  const filename = `plan-${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_RECEIPTS, filename), receiptPart.data);
  db.prepare(`INSERT INTO plan_requests (producer_id, plan, months, amount_cup, currency, receipt_filename)
              VALUES (?, ?, ?, ?, ?, ?)`).run(producer.id, plan, months, precio * months, currency, filename);
  sendJSON(res, 201, { ok: true });
});

route('GET', '/api/admin/plan-requests', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const rows = db.prepare(`
    SELECT r.*, p.name as producer_name, p.email as producer_email, p.contact_phone as producer_phone,
           p.plan as current_plan, p.plan_paid_until as current_paid_until
    FROM plan_requests r LEFT JOIN producers p ON p.id = r.producer_id
    ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.id DESC
    LIMIT 100
  `).all();
  sendJSON(res, 200, { requests: rows });
});

route('GET', '/api/admin/plan-requests/:id/receipt', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const r = db.prepare('SELECT receipt_filename FROM plan_requests WHERE id = ?').get(params.id);
  if (!r || !r.receipt_filename) return sendJSON(res, 404, { error: 'Comprobante no encontrado' });
  sendFile(res, path.join(UPLOADS_RECEIPTS, r.receipt_filename), contentTypeForImage(path.extname(r.receipt_filename).toLowerCase()));
});

route('POST', '/api/admin/plan-requests/:id/approve', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const r = db.prepare('SELECT * FROM plan_requests WHERE id = ?').get(params.id);
  if (!r) return sendJSON(res, 404, { error: 'Solicitud no encontrada' });
  if (r.status !== 'pending') return sendJSON(res, 409, { error: 'Esta solicitud ya fue respondida' });
  const p = producerFull(r.producer_id);
  if (!p) return sendJSON(res, 404, { error: 'El productor ya no existe' });

  const hoy = hoyISO();
  const mismoPlanVigente = p.plan === r.plan && p.plan_paid_until && p.plan_paid_until >= hoy;
  const base = mismoPlanVigente ? p.plan_paid_until : hoy;
  const hasta = sumarMeses(base, r.months);

  db.prepare("UPDATE producers SET plan = ?, plan_paid_until = ?, approved = 1, active = CASE WHEN disabled_reason = 'plan_vencido' THEN 1 ELSE active END, disabled_reason = CASE WHEN disabled_reason = 'plan_vencido' THEN '' ELSE disabled_reason END WHERE id = ?")
    .run(r.plan, hasta, r.producer_id);
  db.prepare("UPDATE plan_requests SET status = 'approved', paid_until_result = ?, resolved_at = datetime('now') WHERE id = ?").run(hasta, r.id);
  sendJSON(res, 200, { ok: true, plan: r.plan, paidUntil: hasta, extendido: Boolean(mismoPlanVigente) });
});

route('POST', '/api/admin/plan-requests/:id/reject', async (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const r = db.prepare('SELECT id, status FROM plan_requests WHERE id = ?').get(params.id);
  if (!r) return sendJSON(res, 404, { error: 'Solicitud no encontrada' });
  if (r.status !== 'pending') return sendJSON(res, 409, { error: 'Esta solicitud ya fue respondida' });
  let reason = '';
  try {
    const body = await readBody(req, 1024 * 2);
    if (body.length) reason = String(JSON.parse(body.toString('utf8')).reason || '').slice(0, 300).trim();
  } catch { /* sin motivo */ }
  db.prepare("UPDATE plan_requests SET status = 'rejected', reject_reason = ?, resolved_at = datetime('now') WHERE id = ?").run(reason, r.id);
  sendJSON(res, 200, { ok: true });
});

route('GET', '/api/producers', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, bio, avatar_filename, social_links_json, plan
    FROM producers WHERE approved = 1 AND active = 1 ORDER BY name ASC
  `).all();
  const producers = rows.map(r => {
    let social = [];
    if (getPlan(r).social) {
      try { social = JSON.parse(r.social_links_json || '[]'); } catch {}
    }
    const beats = db.prepare("SELECT COUNT(*) as c FROM tracks WHERE producer_id = ? AND approval_status = 'approved' AND sold = 0").get(r.id).c;
    return { id: r.id, name: r.name, bio: r.bio || '', avatar: r.avatar_filename || '', socialLinks: social, beats };
  });
  sendJSON(res, 200, { producers });
});

route('GET', '/api/producers/:id/tracks', (req, res, params) => {
  const prod = db.prepare('SELECT id, name, bio, avatar_filename, social_links_json, plan FROM producers WHERE id = ? AND approved = 1 AND active = 1').get(params.id);
  if (!prod) return sendJSON(res, 404, { error: 'Productor no encontrado' });
  let social = [];
  if (getPlan(prod).social) {
    try { social = JSON.parse(prod.social_links_json || '[]'); } catch {}
  }
  let tracks = db.prepare(`
    SELECT id, title, genre, description, cover_filename, duration_seconds, plays,
           price_label, price_cup, for_sale, is_exclusive, sold, created_at
    FROM tracks WHERE producer_id = ? AND approval_status = 'approved' AND sold = 0 AND is_playlist = 0
    ORDER BY created_at DESC
  `).all(params.id);
  const pct = descuentoActivo();
  tracks = tracks.map(t => ({
    ...t,
    producer_name: prod.name,
    licenses: getTrackLicenses(t.id).map(l => ({ ...l, price_cup: aplicarDescuento(l.price_cup, pct), original_cup: l.price_cup })),
    price_cup: aplicarDescuento(t.price_cup, pct),
  }));
  sendJSON(res, 200, {
    producer: { id: prod.id, name: prod.name, bio: prod.bio || '', avatar: prod.avatar_filename || '', socialLinks: social },
    tracks,
    discountPercent: pct,
  });
});

route('GET', '/api/social-links', (req, res) => {
  const row = db.prepare('SELECT links_json FROM social_links WHERE id = 1').get();
  let links = [];
  try { links = JSON.parse(row.links_json || '[]'); } catch { links = []; }
  sendJSON(res, 200, { links });
});

route('POST', '/api/orders', async (req, res) => {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) return sendJSON(res, 400, { error: 'Falta boundary multipart' });

  let buffer;
  try {
    buffer = await readBody(req, MAX_RECEIPT_BYTES + 1024 * 50);
  } catch {
    return sendJSON(res, 413, { error: 'La imagen del comprobante es demasiado grande' });
  }

  const parts = parseMultipart(buffer, boundaryMatch[1]);
  const fields = {};
  let receiptPart = null;
  for (const part of parts) {
    if (part.filename && part.name === 'receipt') receiptPart = part;
    else if (part.name) fields[part.name] = part.data.toString('utf8');
  }

  const trackId = Number(fields.trackId);
  const buyerName = (fields.buyerName || '').trim().slice(0, 100);
  const buyerPhone = (fields.buyerPhone || '').trim().slice(0, 40);
  const currency = (fields.currency || 'CUP').trim().slice(0, 20);
  const displayedPrice = (fields.displayedPrice || '').trim().slice(0, 60);
  const licenseType = LICENSE_TYPES.includes(fields.licenseType) ? fields.licenseType : null;

  if (!trackId || !buyerName || !buyerPhone || !receiptPart || !licenseType) {
    return sendJSON(res, 400, { error: 'Faltan datos: nombre, teléfono, comprobante o tipo de licencia' });
  }

  const track = db.prepare('SELECT id, title, for_sale, is_playlist, is_exclusive, sold, producer_id, approval_status FROM tracks WHERE id = ?').get(trackId);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });

  if (track.is_playlist) {
    return sendJSON(res, 400, { error: 'Esta pista es gratuita, no está a la venta' });
  }
  if (track.approval_status !== 'approved') {
    return sendJSON(res, 403, { error: 'Esta pista todavía no está disponible' });
  }
  if (track.sold) {
    return sendJSON(res, 409, {
      error: track.is_exclusive
        ? 'Esta pista ya fue comprada de forma exclusiva por otra persona'
        : 'Esta pista ya no está a la venta: alguien compró la licencia Ilimitada y se retiró del catálogo',
    });
  }
  if (!track.for_sale) {
    return sendJSON(res, 400, { error: 'Esta pista no está a la venta' });
  }

  const licenseRow = db.prepare('SELECT price_cup FROM track_licenses WHERE track_id = ? AND license_type = ?').get(trackId, licenseType);
  if (!licenseRow) {
    return sendJSON(res, 400, { error: 'Esa licencia no está disponible para esta pista' });
  }
  const priceCupAtSale = aplicarDescuento(licenseRow.price_cup, descuentoActivo());

  const receiptExt = safeExt(receiptPart.filename, '.jpg');
  if (!ALLOWED_IMAGE_EXT.includes(receiptExt)) {
    return sendJSON(res, 400, { error: 'El comprobante debe ser una imagen (JPG, PNG o WEBP)' });
  }
  if (receiptPart.data.length > MAX_RECEIPT_BYTES) {
    return sendJSON(res, 413, { error: 'La imagen del comprobante es demasiado grande' });
  }

  const receiptFilename = `${crypto.randomUUID()}${receiptExt}`;
  fs.writeFileSync(path.join(UPLOADS_RECEIPTS, receiptFilename), receiptPart.data);

  let commissionPercent = 0;
  let producerEarning = 0;
  if (track.producer_id) {
    const prodRow = producerFull(track.producer_id);
    const plan = planEfectivo(prodRow);
    commissionPercent = plan.commission;
    producerEarning = priceCupAtSale * (1 - commissionPercent / 100);
  }

  const buyerToken = crypto.randomBytes(24).toString('hex');
  db.prepare(`
    INSERT INTO orders (track_id, track_title, price_label, currency, buyer_name, buyer_phone, receipt_filename,
                         producer_id, price_cup_at_sale, commission_percent_at_sale, producer_earning_cup, license_type, buyer_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    track.id, track.title, displayedPrice || `${priceCupAtSale} CUP`, currency, buyerName, buyerPhone, receiptFilename,
    track.producer_id || null, priceCupAtSale, commissionPercent, producerEarning, licenseType, buyerToken
  );

  sendJSON(res, 201, { ok: true, orderToken: buyerToken });
});

route('POST', '/api/tracks/:id/token', (req, res, params) => {
  const track = db.prepare('SELECT id, approval_status FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });
  if (track.approval_status !== 'approved') return sendJSON(res, 403, { error: 'Esta pista todavía no está disponible' });
  const token = issueStreamToken(track.id);
  db.prepare('UPDATE tracks SET plays = plays + 1 WHERE id = ?').run(track.id);
  sendJSON(res, 200, { token, expiresInSeconds: 1800 });
});

route('POST', '/api/tracks/:id/like', (req, res, params) => {
  const track = db.prepare('SELECT id, likes FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });
  db.prepare('UPDATE tracks SET likes = likes + 1 WHERE id = ?').run(track.id);
  sendJSON(res, 200, { likes: track.likes + 1 });
});

route('POST', '/api/tracks/:id/unlike', (req, res, params) => {
  const track = db.prepare('SELECT id, likes FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });
  const newLikes = Math.max(0, track.likes - 1);
  db.prepare('UPDATE tracks SET likes = ? WHERE id = ?').run(newLikes, track.id);
  sendJSON(res, 200, { likes: newLikes });
});

// solo playlist puede descargarse
route('GET', '/api/download/:id', (req, res, params) => {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });

  if (!track.is_playlist) {
    return sendJSON(res, 403, { error: 'Esta pista no está disponible para descarga' });
  }
  if (track.approval_status !== 'approved') {
    return sendJSON(res, 403, { error: 'Esta pista todavía no está disponible' });
  }

  const filePath = path.join(UPLOADS_AUDIO, track.audio_filename);
  if (!fs.existsSync(filePath)) return sendJSON(res, 404, { error: 'Archivo no encontrado' });

  const ext = path.extname(track.audio_filename).toLowerCase();
  const safeName = track.title.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'pista';

  res.writeHead(200, {
    'Content-Type': contentTypeForAudio(ext),
    'Content-Disposition': `attachment; filename="${safeName}${ext}"`,
    'Content-Length': fs.statSync(filePath).size,
  });
  fs.createReadStream(filePath).pipe(res);
});

route('GET', '/api/stream/:id', (req, res, params, query) => {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });

  const token = query.get('t');
  if (!token || !validateStreamToken(token, track.id)) {
    return sendJSON(res, 403, { error: 'Token inválido o expirado' });
  }

  const filePath = path.join(UPLOADS_AUDIO, track.audio_filename);
  if (!fs.existsSync(filePath)) return sendJSON(res, 404, { error: 'Archivo no encontrado' });

  const stat = fs.statSync(filePath);
  const ext = path.extname(track.audio_filename).toLowerCase();
  const contentType = contentTypeForAudio(ext);
  const range = req.headers.range;

  const baseHeaders = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Content-Disposition': 'inline',
    'Cache-Control': 'no-store',
  };

  const match = range ? range.match(/bytes=(\d*)-(\d*)/) : null;
  if (match) {
    let start = match[1] ? parseInt(match[1], 10) : 0;
    let end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (!match[1] && match[2]) { start = Math.max(0, stat.size - parseInt(match[2], 10)); end = stat.size - 1; }
    if (end >= stat.size) end = stat.size - 1;
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Content-Length': chunkSize,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...baseHeaders, 'Content-Length': stat.size });
    fs.createReadStream(filePath).pipe(res);
  }
});

route('GET', '/api/cover/:id', (req, res, params) => {
  const track = db.prepare('SELECT cover_filename FROM tracks WHERE id = ?').get(params.id);
  if (!track || !track.cover_filename) return sendJSON(res, 404, { error: 'Sin portada' });
  const filePath = path.join(UPLOADS_COVERS, track.cover_filename);
  const ext = path.extname(track.cover_filename).toLowerCase();
  sendFile(res, filePath, contentTypeForImage(ext));
});

route('GET', '/api/avatar', (req, res) => {
  const profile = db.prepare('SELECT avatar_filename FROM profile WHERE id = 1').get();
  if (!profile || !profile.avatar_filename) return sendJSON(res, 404, { error: 'Sin avatar' });
  const filePath = path.join(UPLOADS_COVERS, profile.avatar_filename);
  const ext = path.extname(profile.avatar_filename).toLowerCase();
  sendFile(res, filePath, contentTypeForImage(ext));
});

route('POST', '/api/admin/login', async (req, res) => {
  if (!rateLimit(req, 'admin-login', 10, 15 * 60 * 1000)) {
    return sendJSON(res, 429, { error: 'Demasiados intentos. Espera 15 minutos.' });
  }
  try {
    const body = await readBody(req, 1024 * 10);
    const { password } = JSON.parse(body.toString('utf8'));
    if (password !== ADMIN_PASSWORD) {
      return sendJSON(res, 401, { error: 'Contraseña incorrecta' });
    }
    const sessionValue = signSession();
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `admin_session=${encodeURIComponent(sessionValue)}; HttpOnly; Path=/; Max-Age=43200; SameSite=Strict`,
    });
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('POST', '/api/admin/logout', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': 'admin_session=; HttpOnly; Path=/; Max-Age=0',
  });
  res.end(JSON.stringify({ ok: true }));
});

route('GET', '/api/admin/check', (req, res) => {
  sendJSON(res, 200, { authenticated: isAdminAuthed(req) });
});

route('POST', '/api/producer/login', async (req, res) => {
  if (!rateLimit(req, 'producer-login', 15, 15 * 60 * 1000)) {
    return sendJSON(res, 429, { error: 'Demasiados intentos. Espera 15 minutos.' });
  }
  try {
    const body = await readBody(req, 1024 * 10);
    const { email, password } = JSON.parse(body.toString('utf8'));
    const producer = db.prepare('SELECT * FROM producers WHERE email = ?').get((email || '').trim().toLowerCase());
    if (!producer) {
      return sendJSON(res, 401, { error: 'Correo o contraseña incorrectos' });
    }
    const valid = producerAuth.verifyPassword(password || '', producer.password_hash, producer.password_salt);
    if (!valid) {
      return sendJSON(res, 401, { error: 'Correo o contraseña incorrectos' });
    }
    if (!producer.approved) {
      return sendJSON(res, 403, { error: 'Tu cuenta todavía está esperando la aprobación del administrador.' });
    }
    if (!producer.active && producer.disabled_reason !== 'plan_vencido') {
      return sendJSON(res, 403, { error: 'Tu cuenta está desactivada. Contacta al administrador.' });
    }
    const token = producerAuth.createProducerSession(producer.id);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `producer_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=604800; SameSite=Strict`,
    });
    res.end(JSON.stringify({ ok: true, name: producer.name }));
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('POST', '/api/producer/logout', (req, res) => {
  const token = getCookie(req, 'producer_session');
  producerAuth.destroyProducerSession(token);
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': 'producer_session=; HttpOnly; Path=/; Max-Age=0',
  });
  res.end(JSON.stringify({ ok: true }));
});

route('GET', '/api/producer/check', (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 200, { authenticated: false, name: null, exclusiveEnabled: false });
  const row = db.prepare('SELECT exclusive_enabled FROM producers WHERE id = ?').get(producer.id);
  sendJSON(res, 200, {
    authenticated: true,
    name: producer.name,
    exclusiveEnabled: Boolean(row && row.exclusive_enabled),
  });
});

route('GET', '/api/producer/tracks', (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });
  const tracks = db.prepare('SELECT * FROM tracks WHERE producer_id = ? ORDER BY created_at DESC').all(producer.id);
  sendJSON(res, 200, { tracks });
});

route('DELETE', '/api/producer/tracks/:id', (req, res, params) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });
  const track = db.prepare('SELECT * FROM tracks WHERE id = ? AND producer_id = ?').get(params.id, producer.id);
  if (!track) return sendJSON(res, 404, { error: 'Beat no encontrado' });

  const soldCount = db.prepare("SELECT COUNT(*) as c FROM orders WHERE track_id = ? AND status = 'approved'").get(params.id).c;
  if (track.sold || soldCount > 0) {
    return sendJSON(res, 409, { error: 'No puedes eliminar un beat que ya tiene ventas aprobadas' });
  }

  borrarArchivosTrack(track);
  db.prepare('DELETE FROM track_licenses WHERE track_id = ?').run(params.id);
  db.prepare('DELETE FROM tracks WHERE id = ?').run(params.id);
  sendJSON(res, 200, { ok: true });
});

route('GET', '/api/producer/earnings', (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });

  const orders = db.prepare(`
    SELECT o.*, t.title as current_title FROM orders o
    LEFT JOIN tracks t ON t.id = o.track_id
    WHERE o.producer_id = ? ORDER BY o.created_at DESC
  `).all(producer.id);

  const approved = orders.filter(o => o.status === 'approved');
  const totalSalesCup = approved.reduce((sum, o) => sum + (o.price_cup_at_sale || 0), 0);
  const totalEarningsCup = approved.reduce((sum, o) => sum + (o.producer_earning_cup || 0), 0);

  const full = producerFull(producer.id);
  const pago = resumenPago(full);
  const paidCup = Math.round(approved.filter(o => o.producer_paid).reduce((s, o) => s + (o.producer_earning_cup || 0), 0) * 100) / 100;
  const payouts = db.prepare('SELECT id, amount_cup, orders_count, note, created_at FROM producer_payouts WHERE producer_id = ? ORDER BY created_at DESC LIMIT 50').all(producer.id);

  sendJSON(res, 200, {
    orders,
    summary: {
      totalSales: approved.length,
      totalSalesCup,
      totalEarningsCup,
      pendingCup: pago.total,
      paidCup,
      nextPayoutDue: pago.venceEl,
      payoutTerm: pago.plazo,
    },
    payouts,
  });
});

function borrarArchivosTrack(t) {
  const pares = [[UPLOADS_AUDIO, t.audio_filename], [UPLOADS_COVERS, t.cover_filename], [UPLOADS_MASTERS, t.master_filename],
                 [UPLOADS_MASTERS, t.stems_filename], [UPLOADS_MASTERS, t.wav_filename]];
  for (const [dir, file] of pares) {
    if (!file) continue;
    try { const fp = path.join(dir, file); if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch { /* ya no existe */ }
  }
}

function discardUpload(upload) {
  if (!upload) return;
  const pares = [
    [UPLOADS_AUDIO, upload.savedAudioFilename],
    [UPLOADS_COVERS, upload.coverFilename],
    [UPLOADS_MASTERS, upload.masterFilename],
    [UPLOADS_MASTERS, upload.stemsFilename],
    [UPLOADS_MASTERS, upload.wavFilename],
  ];
  for (const [dir, file] of pares) {
    if (!file) continue;
    const fp = path.join(dir, file);
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch { /* sin efecto si ya no existe */ }
  }
}

async function processTrackUpload(req, opts = {}) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) throw { status: 400, error: 'Falta boundary multipart' };

  let buffer;
  try {
    buffer = await readBody(req, MAX_AUDIO_BYTES + MAX_COVER_BYTES + 1024 * 100);
  } catch {
    throw { status: 413, error: 'Archivo demasiado grande' };
  }

  const parts = parseMultipart(buffer, boundaryMatch[1]);
  const fields = {};
  let audioPart = null;
  let coverPart = null;
  let wavPart = null;
  let stemsPart = null;

  for (const part of parts) {
    if (part.filename && part.name === 'audio') audioPart = part;
    else if (part.filename && part.name === 'cover') coverPart = part;
    else if (part.filename && part.name === 'wavFile') wavPart = part;
    else if (part.filename && part.name === 'stemsFile') stemsPart = part;
    else if (part.name) fields[part.name] = part.data.toString('utf8');
  }

  if (!fields.title || !audioPart) {
    throw { status: 400, error: 'Falta título o archivo de audio' };
  }
  if (!coverPart || !coverPart.data || coverPart.data.length === 0) {
    throw { status: 400, error: 'La portada es obligatoria. Sube una imagen cuadrada de 3000x3000 px.' };
  }

  const audioExt = safeExt(audioPart.filename, '.mp3');
  if (!ALLOWED_AUDIO_EXT.includes(audioExt)) {
    throw { status: 400, error: 'Formato de audio no permitido' };
  }
  if (opts.audioExt && !opts.audioExt.includes(audioExt)) {
    throw { status: 403, error: `Tu plan ${opts.planLabel} solo permite subir audio en MP3. Sube al plan Pro para usar WAV u otros formatos.` };
  }
  if (wavPart && opts.allowWav === false) {
    throw { status: 403, error: `Tu plan ${opts.planLabel} no incluye entrega en WAV. Sube al plan Pro o Studio.` };
  }
  if (stemsPart && opts.allowStems === false) {
    throw { status: 403, error: `Tu plan ${opts.planLabel} no incluye STEMS. Solo el plan Studio permite subir STEMS.` };
  }
  if (audioPart.data.length > MAX_AUDIO_BYTES) {
    throw { status: 413, error: `Audio demasiado grande (máx ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)}MB)` };
  }

  const tmpUploadPath = path.join(TMP_PROCESSING, `${crypto.randomUUID()}${audioExt}`);
  fs.writeFileSync(tmpUploadPath, audioPart.data);

  const masterHash = crypto.createHash('sha256').update(audioPart.data).digest('hex');
  const masterFilename = `master-${crypto.randomUUID()}${audioExt}`;
  fs.writeFileSync(path.join(UPLOADS_MASTERS, masterFilename), audioPart.data);

  const watermarkConfig = db.prepare('SELECT * FROM watermark_config WHERE id = 1').get();
  let savedAudioFilename;

  if (watermarkConfig && watermarkConfig.voice_filename && !opts.skipWatermark) {
    const watermarkPath = path.join(UPLOADS_WATERMARK, watermarkConfig.voice_filename);
    const watermarkedFilename = `${crypto.randomUUID()}.wav`;
    try {
      await applyWatermark({
        inputPath: tmpUploadPath,
        watermarkPath,
        outputPath: path.join(UPLOADS_AUDIO, watermarkedFilename),
        intervalSeconds: watermarkConfig.interval_seconds,
        volume: watermarkConfig.volume,
      });
      savedAudioFilename = watermarkedFilename;
    } catch (err) {
      fs.unlinkSync(tmpUploadPath);
      fs.unlinkSync(path.join(UPLOADS_MASTERS, masterFilename));
      throw { status: 500, error: 'No se pudo procesar el audio con la marca de agua. Verifica que el archivo no esté dañado.' };
    }
    fs.unlinkSync(tmpUploadPath);
  } else {
    savedAudioFilename = `${crypto.randomUUID()}${audioExt}`;
    fs.renameSync(tmpUploadPath, path.join(UPLOADS_AUDIO, savedAudioFilename));
  }

  let coverFilename = '';
  if (coverPart && coverPart.data.length > 0) {
    const coverExt = safeExt(coverPart.filename, '.jpg');
    if (ALLOWED_IMAGE_EXT.includes(coverExt) && coverPart.data.length <= MAX_COVER_BYTES) {
      coverFilename = `${crypto.randomUUID()}${coverExt}`;
      fs.writeFileSync(path.join(UPLOADS_COVERS, coverFilename), coverPart.data);
    }
  }

  // WAV suelto para la licencia Premium (MP3 + WAV, sin STEMS)
  let wavFilename = '';
  if (wavPart) {
    wavFilename = `wav-${crypto.randomUUID()}${safeExt(wavPart.filename, '.wav')}`;
    fs.writeFileSync(path.join(UPLOADS_MASTERS, wavFilename), wavPart.data);
  }

  let stemsFilename = '';
  if (wavPart || stemsPart) {
    const entradas = [];
    if (wavPart) entradas.push({ name: `Master${safeExt(wavPart.filename, '.wav')}`, data: wavPart.data });
    if (stemsPart) entradas.push({ name: `Stems${safeExt(stemsPart.filename, '.zip')}`, data: stemsPart.data });
    stemsFilename = `stems-${crypto.randomUUID()}.zip`;
    fs.writeFileSync(path.join(UPLOADS_MASTERS, stemsFilename), buildZip(entradas));
  }

  return { fields, savedAudioFilename, coverFilename, masterFilename, masterHash, stemsFilename, wavFilename };
}


const PRODUCER_PLANS = {
  free:   { label: 'Free',   commission: 30, maxBeats: 5,        priceUsd: 0,  watermarkPreview: true,  exclusiveAuto: false, payout: '7-14 días', payoutDays: 14, audioExt: ['.mp3'], wav: false, stems: false, social: false },
  pro:    { label: 'Pro',    commission: 20, maxBeats: 50,       priceUsd: 7,  watermarkPreview: false, exclusiveAuto: false, payout: '3 días',    payoutDays: 3,  audioExt: null,     wav: true,  stems: false, social: true },
  studio: { label: 'Studio', commission: 10, maxBeats: Infinity, priceUsd: 19, watermarkPreview: false, exclusiveAuto: true,  payout: '24 horas',  payoutDays: 1,  audioExt: null,     wav: true,  stems: true,  social: true },
};

function getPlan(producerRow) {
  return PRODUCER_PLANS[(producerRow && producerRow.plan) || 'free'] || PRODUCER_PLANS.free;
}

// Plan que realmente aplica hoy: si el plan pagado venció, cobra como Free.
function planEfectivo(producerRow) {
  return planVigente(producerRow) ? getPlan(producerRow) : PRODUCER_PLANS.free;
}

function planVigente(producerRow) {
  if (!producerRow) return false;
  const plan = (producerRow.plan || 'free');
  if (plan === 'free') return true;
  if (!producerRow.plan_paid_until) return false;
  return new Date(producerRow.plan_paid_until + 'T23:59:59') >= new Date();
}

function diasRestantesPlan(producerRow) {
  if (!producerRow || !producerRow.plan_paid_until) return null;
  const fin = new Date(producerRow.plan_paid_until + 'T23:59:59');
  return Math.ceil((fin - new Date()) / (1000 * 60 * 60 * 24));
}

const DIAS_GRACIA = 15;

function diasParaEliminar(producerRow) {
  if (!producerRow || (producerRow.plan || 'free') === 'free' || !producerRow.plan_paid_until) return null;
  const vence = new Date(producerRow.plan_paid_until + 'T23:59:59');
  if (vence >= new Date()) return null;
  const diasVencido = Math.floor((new Date() - vence) / (1000 * 60 * 60 * 24));
  return Math.max(0, DIAS_GRACIA - diasVencido);
}

function desactivarVencidos() {
  const candidatos = db.prepare("SELECT * FROM producers WHERE active = 1 AND plan != 'free' AND plan_paid_until != ''").all();
  let n = 0;
  for (const p of candidatos) {
    if (diasParaEliminar(p) === 0) {
      db.prepare("UPDATE producers SET active = 0, disabled_reason = 'plan_vencido' WHERE id = ?").run(p.id);
      db.prepare('DELETE FROM producer_sessions WHERE producer_id = ?').run(p.id);
      n++;
    }
  }
  if (n) console.log(`Cuentas desactivadas por plan vencido hace más de ${DIAS_GRACIA} días: ${n}`);
  return n;
}

function planPriceCup(planKey) {
  if (planKey === 'free') return 0;
  const cfg = db.prepare('SELECT plan_price_pro_cup, plan_price_studio_cup FROM platform_config WHERE id = 1').get();
  return planKey === 'studio' ? Number(cfg.plan_price_studio_cup || 0) : Number(cfg.plan_price_pro_cup || 0);
}

function ultimaSolicitudPlan(producerId) {
  const r = db.prepare('SELECT id, plan, months, amount_cup, currency, status, reject_reason, paid_until_result, created_at, resolved_at FROM plan_requests WHERE producer_id = ? ORDER BY id DESC LIMIT 1').get(producerId);
  return r || null;
}

function sumarMeses(fechaISO, meses) {
  const d = new Date(fechaISO + 'T12:00:00');
  const dia = d.getDate();
  d.setMonth(d.getMonth() + meses);
  if (d.getDate() < dia) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function producerFull(id) {
  return db.prepare('SELECT * FROM producers WHERE id = ?').get(id);
}

function adminCurrencies() {
  const info = db.prepare('SELECT accounts_json FROM payment_info WHERE id = 1').get();
  let accounts = [];
  try { accounts = JSON.parse(info.accounts_json || '[]'); } catch { accounts = []; }
  return [...new Set(accounts.map(a => a.currency).filter(Boolean))];
}

function descuentoActivo() {
  const cfg = db.prepare('SELECT promo_active FROM site_config WHERE id = 1').get();
  const plat = db.prepare('SELECT discount_percent FROM platform_config WHERE id = 1').get();
  const pct = plat && plat.discount_percent ? Number(plat.discount_percent) : 0;
  if (!cfg || !cfg.promo_active || pct <= 0) return 0;
  return Math.min(90, pct);
}

function aplicarDescuento(precio, pct) {
  if (!pct) return precio;
  return Math.round(precio * (1 - pct / 100));
}

const LICENSE_TYPES = ['basic', 'premium', 'unlimited', 'exclusive'];
const SINGLE_SALE_LICENSES = ['unlimited', 'exclusive'];

function parseLicensePrices(fields) {
  return {
    basic: Math.max(0, parseFloat(fields.priceBasic) || 0),
    premium: Math.max(0, parseFloat(fields.pricePremium) || 0),
    unlimited: Math.max(0, parseFloat(fields.priceUnlimited) || 0),
    exclusive: Math.max(0, parseFloat(fields.priceExclusive) || 0),
  };
}

function saveLicensesForTrack(trackId, prices) {
  db.prepare('DELETE FROM track_licenses WHERE track_id = ?').run(trackId);
  const offered = [];
  for (const type of LICENSE_TYPES) {
    if (prices[type] > 0) {
      db.prepare('INSERT INTO track_licenses (track_id, license_type, price_cup) VALUES (?, ?, ?)').run(trackId, type, prices[type]);
      offered.push(type);
    }
  }
  return offered;
}

function validateLicenseCombination(prices) {
  const offered = LICENSE_TYPES.filter(t => prices[t] > 0);
  if (offered.length === 0) {
    return { ok: false, error: 'Pon precio a al menos una licencia en CUP' };
  }
  const hasExclusive = prices.exclusive > 0;
  const hasOthers = prices.basic > 0 || prices.premium > 0 || prices.unlimited > 0;
  if (hasExclusive && hasOthers) {
    return {
      ok: false,
      error: 'Un beat con licencia Exclusiva no puede ofrecer otras licencias. La Exclusiva le promete al comprador que nadie más tendrá el audio, así que no puede convivir con licencias que otras personas ya compraron.',
    };
  }
  return { ok: true, offered, isExclusive: hasExclusive };
}

function getTrackLicenses(trackId) {
  return db.prepare('SELECT license_type, price_cup FROM track_licenses WHERE track_id = ? ORDER BY price_cup ASC').all(trackId);
}

route('POST', '/api/admin/tracks', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });

  let upload;
  try {
    upload = await processTrackUpload(req);
  } catch (err) {
    return sendJSON(res, err.status || 500, { error: err.error || 'Error al subir' });
  }
  const { fields, savedAudioFilename, coverFilename, masterFilename, masterHash, stemsFilename, wavFilename } = upload;

  const isPlaylist = fields.isPlaylist === '1' || fields.isPlaylist === 'true' ? 1 : 0;
  const artistCredit = (fields.artistCredit || '').trim();
  const prices = isPlaylist ? { basic: 0, premium: 0, unlimited: 0, exclusive: 0 } : parseLicensePrices(fields);

  let offeredTypes = [];
  let isExclusive = 0;
  if (!isPlaylist) {
    const validation = validateLicenseCombination(prices);
    if (!validation.ok) {
      discardUpload(upload);
      return sendJSON(res, 400, { error: validation.error });
    }
    offeredTypes = validation.offered;
    isExclusive = validation.isExclusive ? 1 : 0;
  }

  const forSale = isPlaylist ? 0 : 1;
  const lowestPrice = offeredTypes.length ? Math.min(...offeredTypes.map(t => prices[t])) : 0;
  const priceLabel = lowestPrice > 0
    ? (offeredTypes.length > 1 ? `Desde ${lowestPrice} CUP` : `${lowestPrice} CUP`)
    : '';

  const result = db.prepare(`
    INSERT INTO tracks (title, genre, description, artist_credit, audio_filename, cover_filename,
                         price_label, price_cup, for_sale, is_playlist, is_exclusive, producer_id, approval_status,
                         master_filename, master_hash, stems_filename, wav_filename)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'approved', ?, ?, ?, ?)
  `).run(
    fields.title, fields.genre || '', fields.description || '', artistCredit,
    savedAudioFilename, coverFilename, priceLabel, lowestPrice, forSale, isPlaylist, isExclusive,
    masterFilename, masterHash, stemsFilename, wavFilename
  );

  const trackId = Number(result.lastInsertRowid);
  if (!isPlaylist) saveLicensesForTrack(trackId, prices);

  sendJSON(res, 201, { id: trackId });
});

route('POST', '/api/producer/tracks', async (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });

  const full = producerFull(producer.id);
  const plan = getPlan(full);

  if (!full.approved) {
    return sendJSON(res, 403, { error: 'Tu cuenta todavía no fue aprobada por el administrador.' });
  }
  if (!planVigente(full)) {
    return sendJSON(res, 403, { error: `Tu plan ${plan.label} está vencido. Renuévalo para volver a subir beats.` });
  }

  const activos = db.prepare("SELECT COUNT(*) as c FROM tracks WHERE producer_id = ? AND approval_status != 'rejected' AND sold = 0").get(producer.id).c;
  if (plan.maxBeats !== Infinity && activos >= plan.maxBeats) {
    return sendJSON(res, 403, {
      error: `Tu plan ${plan.label} permite ${plan.maxBeats} beats activos y ya tienes ${activos}. Elimina alguno o sube de plan para publicar más.`,
    });
  }

  let upload;
  try {
    upload = await processTrackUpload(req, {
      skipWatermark: !plan.watermarkPreview,
      audioExt: plan.audioExt,
      allowWav: plan.wav,
      allowStems: plan.stems,
      planLabel: plan.label,
    });
  } catch (err) {
    return sendJSON(res, err.status || 500, { error: err.error || 'Error al subir' });
  }
  const { fields, savedAudioFilename, coverFilename, masterFilename, masterHash, stemsFilename, wavFilename } = upload;

  const isPlaylist = fields.isPlaylist === '1' || fields.isPlaylist === 'true' ? 1 : 0;
  const artistCredit = (fields.artistCredit || '').trim();

  let isExclusive = 0;
  let lowestPrice = 0;
  let priceLabel = '';

  if (!isPlaylist) {
    const prices = parseLicensePrices(fields);
    const validation = validateLicenseCombination(prices);
    if (!validation.ok) {
      discardUpload(upload);
      return sendJSON(res, 400, { error: validation.error });
    }
    if (validation.isExclusive && !plan.exclusiveAuto && !full.exclusive_enabled) {
      discardUpload(upload);
      return sendJSON(res, 403, {
        error: 'Tu plan no incluye la licencia Exclusiva. Contacta al administrador para habilitarla o sube al plan Studio.',
      });
    }
    isExclusive = validation.isExclusive ? 1 : 0;
    lowestPrice = Math.min(...validation.offered.map(t => prices[t]));
    priceLabel = isExclusive
      ? `${prices.exclusive} CUP`
      : (validation.offered.length > 1 ? `Desde ${lowestPrice} CUP` : `${lowestPrice} CUP`);
  }

  const result = db.prepare(`
    INSERT INTO tracks (title, genre, description, artist_credit, audio_filename, cover_filename,
                         price_label, price_cup, for_sale, is_playlist, is_exclusive, producer_id, approval_status,
                         master_filename, master_hash, stems_filename, wav_filename)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).run(
    fields.title, fields.genre || '', fields.description || '', artistCredit,
    savedAudioFilename, coverFilename, priceLabel, lowestPrice, isPlaylist ? 0 : 1, isPlaylist, isExclusive, producer.id,
    masterFilename, masterHash, stemsFilename, wavFilename
  );

  if (!isPlaylist) {
    const pricesGuardar = parseLicensePrices(fields);
    saveLicensesForTrack(Number(result.lastInsertRowid), pricesGuardar);
  }

  sendJSON(res, 201, { id: Number(result.lastInsertRowid) });
});

route('GET', '/api/admin/tracks', (req, res, params, query) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const type = query.get('type') || 'catalog';

  let tracks;
  if (type === 'playlist') {
    tracks = db.prepare('SELECT * FROM tracks WHERE is_playlist = 1 ORDER BY created_at DESC').all();
  } else if (type === 'vip') {
    tracks = db.prepare('SELECT * FROM tracks WHERE is_playlist = 0 AND is_exclusive = 1 AND sold = 1 ORDER BY created_at DESC').all();
  } else {
    tracks = db.prepare('SELECT * FROM tracks WHERE is_playlist = 0 ORDER BY created_at DESC').all();
  }

  if (type === 'catalog') {
    tracks = tracks.map(t => ({ ...t, licenses: getTrackLicenses(t.id) }));
  }

  sendJSON(res, 200, { tracks });
});

route('POST', '/api/admin/tracks/:id/price', async (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const track = db.prepare('SELECT id, is_playlist, sold FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'No encontrada' });
  if (track.is_playlist) return sendJSON(res, 400, { error: 'Las pistas de Playlist no tienen precio' });

  try {
    const body = await readBody(req, 1024 * 5);
    const raw = JSON.parse(body.toString('utf8'));
    const prices = {
      basic: Math.max(0, parseFloat(raw.priceBasic ?? raw.priceCup) || 0),
      premium: Math.max(0, parseFloat(raw.pricePremium) || 0),
      unlimited: Math.max(0, parseFloat(raw.priceUnlimited) || 0),
      exclusive: Math.max(0, parseFloat(raw.priceExclusive) || 0),
    };

    const validation = validateLicenseCombination(prices);
    if (!validation.ok) {
      return sendJSON(res, 400, { error: validation.error });
    }

    if (validation.isExclusive) {
      const soldNonExclusive = db.prepare(`
        SELECT COUNT(*) as c FROM orders
        WHERE track_id = ? AND status = 'approved' AND license_type != 'exclusive'
      `).get(params.id).c;
      if (soldNonExclusive > 0) {
        return sendJSON(res, 409, {
          error: `No puedes convertir este beat en exclusivo: ya vendiste ${soldNonExclusive} licencia(s) normal(es). Esos compradores tienen derecho a seguir usando el beat, así que no le puedes prometer exclusividad a nadie más.`,
        });
      }
    }

    const offeredTypes = validation.offered;
    const forSale = 1;
    const isExclusive = validation.isExclusive ? 1 : 0;
    const lowestPrice = Math.min(...offeredTypes.map(t => prices[t]));
    const priceLabel = offeredTypes.length > 1 ? `Desde ${lowestPrice} CUP` : `${lowestPrice} CUP`;

    db.prepare('UPDATE tracks SET price_label = ?, price_cup = ?, for_sale = ?, is_exclusive = ? WHERE id = ?')
      .run(priceLabel, lowestPrice, forSale, isExclusive, params.id);
    saveLicensesForTrack(params.id, prices);
    sendJSON(res, 200, { ok: true });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('DELETE', '/api/admin/tracks/:id', (req, res, params, query) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'No encontrada' });

  const ventasAprobadas = db.prepare("SELECT COUNT(*) as c FROM orders WHERE track_id = ? AND status = 'approved'").get(params.id).c;
  if (ventasAprobadas > 0 && query.get('force') !== '1') {
    return sendJSON(res, 409, {
      error: `Esta pista tiene ${ventasAprobadas} venta(s) aprobada(s). Si la eliminas, esos compradores ya no podrán volver a descargar sus archivos (sus licencias sí siguen siendo verificables).`,
      ventasAprobadas,
    });
  }

  borrarArchivosTrack(track);
  db.prepare('DELETE FROM track_licenses WHERE track_id = ?').run(params.id);
  db.prepare('DELETE FROM tracks WHERE id = ?').run(params.id);
  sendJSON(res, 200, { ok: true });
});

route('POST', '/api/admin/profile', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });

  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) return sendJSON(res, 400, { error: 'Falta boundary multipart' });

  let buffer;
  try {
    buffer = await readBody(req, MAX_COVER_BYTES + 1024 * 50);
  } catch {
    return sendJSON(res, 413, { error: 'Archivo demasiado grande' });
  }

  const parts = parseMultipart(buffer, boundaryMatch[1]);
  const fields = {};
  let avatarPart = null;
  for (const part of parts) {
    if (part.filename && part.name === 'avatar') avatarPart = part;
    else if (part.name) fields[part.name] = part.data.toString('utf8');
  }

  const current = db.prepare('SELECT * FROM profile WHERE id = 1').get();
  let avatarFilename = current.avatar_filename;

  if (avatarPart && avatarPart.data.length > 0) {
    const ext = safeExt(avatarPart.filename, '.jpg');
    if (ALLOWED_IMAGE_EXT.includes(ext) && avatarPart.data.length <= MAX_COVER_BYTES) {
      avatarFilename = `${crypto.randomUUID()}${ext}`;
      fs.writeFileSync(path.join(UPLOADS_COVERS, avatarFilename), avatarPart.data);
    }
  }

  db.prepare('UPDATE profile SET artist_name = ?, bio = ?, avatar_filename = ? WHERE id = 1')
    .run(fields.artist_name || current.artist_name, fields.bio ?? current.bio, avatarFilename);

  sendJSON(res, 200, { ok: true });
});

route('GET', '/api/admin/payment-info', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const info = db.prepare('SELECT contact_phone, accounts_json FROM payment_info WHERE id = 1').get();
  let accounts = [];
  try { accounts = JSON.parse(info.accounts_json || '[]'); } catch { accounts = []; }
  sendJSON(res, 200, { contactPhone: info.contact_phone || '', accounts });
});

route('POST', '/api/admin/payment-info', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  try {
    const body = await readBody(req, 1024 * 20);
    const { contactPhone, accounts } = JSON.parse(body.toString('utf8'));

    if (!Array.isArray(accounts)) {
      return sendJSON(res, 400, { error: 'Formato de cuentas inválido' });
    }
    const cleanAccounts = accounts
      .filter(a => a && (a.bank || a.number))
      .map(a => ({
        currency: String(a.currency || 'CUP').slice(0, 20).trim(),
        bank: String(a.bank || '').slice(0, 60).trim(),
        number: String(a.number || '').slice(0, 60).trim(),
      }));

    db.prepare('UPDATE payment_info SET contact_phone = ?, accounts_json = ? WHERE id = 1')
      .run(String(contactPhone || '').slice(0, 40).trim(), JSON.stringify(cleanAccounts));

    const monedasVigentes = [...new Set(cleanAccounts.map(a => a.currency))];
    const productores = db.prepare('SELECT id, accounts_json FROM producers').all();
    for (const prod of productores) {
      let cuentasProd = [];
      try { cuentasProd = JSON.parse(prod.accounts_json || '[]'); } catch { cuentasProd = []; }
      const filtradas = cuentasProd.filter(a => monedasVigentes.includes(a.currency));
      if (filtradas.length !== cuentasProd.length) {
        db.prepare('UPDATE producers SET accounts_json = ? WHERE id = ?').run(JSON.stringify(filtradas), prod.id);
      }
    }

    sendJSON(res, 200, { ok: true });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('GET', '/api/admin/social-links', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const row = db.prepare('SELECT links_json FROM social_links WHERE id = 1').get();
  let links = [];
  try { links = JSON.parse(row.links_json || '[]'); } catch { links = []; }
  sendJSON(res, 200, { links });
});

route('POST', '/api/admin/social-links', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  try {
    const body = await readBody(req, 1024 * 20);
    const { links } = JSON.parse(body.toString('utf8'));

    if (!Array.isArray(links)) {
      return sendJSON(res, 400, { error: 'Formato de redes sociales inválido' });
    }

    const cleanLinks = links
      .filter(l => l && (l.label || l.url))
      .map(l => ({
        label: String(l.label || '').slice(0, 40).trim(),
        url: String(l.url || '').slice(0, 500).trim(),
      }))
      .filter(l => l.url); // sin URL no tiene sentido guardar la entrada

    for (const l of cleanLinks) {
      if (!/^https?:\/\//i.test(l.url)) {
        return sendJSON(res, 400, { error: `El link "${l.url}" debe empezar con http:// o https://` });
      }
    }

    db.prepare('UPDATE social_links SET links_json = ? WHERE id = 1').run(JSON.stringify(cleanLinks));
    sendJSON(res, 200, { ok: true });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('GET', '/api/admin/exchange-rates', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const row = db.prepare('SELECT rates_json FROM exchange_rates WHERE id = 1').get();
  let rates = [];
  try { rates = JSON.parse(row.rates_json || '[]'); } catch { rates = []; }
  sendJSON(res, 200, { rates });
});

route('POST', '/api/admin/exchange-rates', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  try {
    const body = await readBody(req, 1024 * 10);
    const { rates } = JSON.parse(body.toString('utf8'));
    if (!Array.isArray(rates)) return sendJSON(res, 400, { error: 'Formato de tasas inválido' });

    const vistos = new Set();
    const cleanRates = rates.map(r => {
      const code = String(r.code || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
      return {
        code,
        label: String(r.label || code).slice(0, 40).trim() || code,
        cupPerUnit: code === 'CUP' ? 1 : Math.max(0, parseFloat(String(r.cupPerUnit).replace(',', '.')) || 0),
      };
    }).filter(r => r.code && !vistos.has(r.code) && vistos.add(r.code));
    if (!cleanRates.some(r => r.code === 'CUP')) cleanRates.unshift({ code: 'CUP', label: 'CUP', cupPerUnit: 1 });

    db.prepare('UPDATE exchange_rates SET rates_json = ? WHERE id = 1').run(JSON.stringify(cleanRates));
    sendJSON(res, 200, { ok: true });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('GET', '/api/admin/site-config', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const config = db.prepare('SELECT promo_text, promo_active, schedule_text FROM site_config WHERE id = 1').get();
  const plat = db.prepare('SELECT discount_percent FROM platform_config WHERE id = 1').get();
  sendJSON(res, 200, {
    promoText: config.promo_text || '',
    promoActive: Boolean(config.promo_active),
    scheduleText: config.schedule_text || '',
    discountPercent: Number(plat && plat.discount_percent) || 0,
  });
});

route('POST', '/api/admin/site-config', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  try {
    const body = await readBody(req, 1024 * 10);
    const { promoText, promoActive, scheduleText, discountPercent } = JSON.parse(body.toString('utf8'));
    const pct = parseFloat(String(discountPercent ?? '0').replace(',', '.'));
    if (!Number.isFinite(pct) || pct < 0 || pct > 90) {
      return sendJSON(res, 400, { error: 'El descuento debe ser un número entre 0 y 90' });
    }
    db.prepare('UPDATE site_config SET promo_text = ?, promo_active = ?, schedule_text = ? WHERE id = 1')
      .run(String(promoText || '').slice(0, 300).trim(), promoActive ? 1 : 0, String(scheduleText || '').slice(0, 300).trim());
    db.prepare('UPDATE platform_config SET discount_percent = ? WHERE id = 1').run(Math.round(pct * 100) / 100);
    sendJSON(res, 200, { ok: true });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('GET', '/api/admin/commission', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const config = db.prepare('SELECT commission_percent FROM platform_config WHERE id = 1').get();
  sendJSON(res, 200, { commissionPercent: config.commission_percent });
});

route('POST', '/api/admin/commission', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  try {
    const body = await readBody(req, 1024 * 5);
    const { commissionPercent } = JSON.parse(body.toString('utf8'));
    const clean = Math.max(0, Math.min(100, parseFloat(commissionPercent) || 0));
    db.prepare('UPDATE platform_config SET commission_percent = ? WHERE id = 1').run(clean);
    sendJSON(res, 200, { ok: true });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('GET', '/api/admin/producers', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const producers = db.prepare('SELECT id, name, email, active, exclusive_enabled, approved, plan, plan_paid_until, contact_phone, accounts_json, disabled_reason, created_at FROM producers ORDER BY approved ASC, created_at DESC').all();
  const withStats = producers.map(p => {
    const stats = db.prepare(`
      SELECT COUNT(*) as totalTracks,
             COALESCE(SUM(CASE WHEN status = 'approved' THEN price_cup_at_sale ELSE 0 END), 0) as totalSalesCup,
             COALESCE(SUM(CASE WHEN status = 'approved' THEN producer_earning_cup ELSE 0 END), 0) as totalEarningsCup,
             COALESCE(SUM(CASE WHEN status = 'approved' AND COALESCE(producer_paid, 0) = 0 THEN producer_earning_cup ELSE 0 END), 0) as pendingPayoutCup
      FROM orders WHERE producer_id = ?
    `).get(p.id);
    const trackCount = db.prepare('SELECT COUNT(*) as c FROM tracks WHERE producer_id = ?').get(p.id).c;
    return { ...p, trackCount, ...stats };
  });
  sendJSON(res, 200, { producers: withStats });
});

route('POST', '/api/admin/producers', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  try {
    const body = await readBody(req, 1024 * 5);
    const { name, email, password } = JSON.parse(body.toString('utf8'));
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();

    if (!cleanName || !cleanEmail || !password || password.length < 6) {
      return sendJSON(res, 400, { error: 'Nombre, correo y contraseña (mínimo 6 caracteres) son obligatorios' });
    }

    const existing = db.prepare('SELECT id FROM producers WHERE email = ?').get(cleanEmail);
    if (existing) {
      return sendJSON(res, 409, { error: 'Ya existe un productor con ese correo' });
    }

    const { hash, salt } = producerAuth.hashPassword(password);
    const result = db.prepare('INSERT INTO producers (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)')
      .run(cleanName, cleanEmail, hash, salt);
    sendJSON(res, 201, { id: Number(result.lastInsertRowid) });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('POST', '/api/admin/producers/:id/approve', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const p = db.prepare('SELECT id FROM producers WHERE id = ?').get(params.id);
  if (!p) return sendJSON(res, 404, { error: 'Productor no encontrado' });
  db.prepare('UPDATE producers SET approved = 1 WHERE id = ?').run(params.id);
  sendJSON(res, 200, { ok: true });
});

route('POST', '/api/admin/producers/:id/plan', async (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const p = db.prepare('SELECT id FROM producers WHERE id = ?').get(params.id);
  if (!p) return sendJSON(res, 404, { error: 'Productor no encontrado' });
  try {
    const body = await readBody(req, 1024 * 5);
    const { plan, paidUntil } = JSON.parse(body.toString('utf8'));
    if (!PRODUCER_PLANS[plan]) return sendJSON(res, 400, { error: 'Plan inválido' });
    const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(String(paidUntil || ''));
    if (plan !== 'free') {
      if (!fechaValida) {
        return sendJSON(res, 400, { error: 'Los planes Pro y Studio necesitan una fecha de pago (hasta cuándo tiene pagado).' });
      }
      if (new Date(paidUntil + 'T23:59:59') < new Date()) {
        return sendJSON(res, 400, { error: 'La fecha de pago no puede ser en el pasado.' });
      }
    }
    const fecha = plan === 'free' ? '' : paidUntil;
    db.prepare('UPDATE producers SET plan = ?, plan_paid_until = ? WHERE id = ?').run(plan, fecha, params.id);
    sendJSON(res, 200, { ok: true });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('GET', '/api/admin/platform-config', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const cfg = db.prepare('SELECT admin_phone, plan_price_pro_cup, plan_price_studio_cup FROM platform_config WHERE id = 1').get();
  sendJSON(res, 200, {
    adminPhone: cfg.admin_phone || '',
    planPriceProCup: cfg.plan_price_pro_cup || 0,
    planPriceStudioCup: cfg.plan_price_studio_cup || 0,
  });
});

route('POST', '/api/admin/platform-config', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  try {
    const body = await readBody(req, 1024 * 5);
    const { adminPhone, planPriceProCup, planPriceStudioCup } = JSON.parse(body.toString('utf8'));
    const pro = Math.max(0, parseFloat(planPriceProCup) || 0);
    const studio = Math.max(0, parseFloat(planPriceStudioCup) || 0);
    if (!pro || !studio) return sendJSON(res, 400, { error: 'Pon el precio mensual en CUP de los planes Pro y Studio' });
    db.prepare('UPDATE platform_config SET admin_phone = ?, plan_price_pro_cup = ?, plan_price_studio_cup = ? WHERE id = 1')
      .run(String(adminPhone || '').slice(0, 40).trim(), pro, studio);
    sendJSON(res, 200, { ok: true });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

// ---------- Pagos a productores ----------
function pendientesDePago(producerId) {
  return db.prepare(`
    SELECT id, track_title, license_type, price_cup_at_sale, commission_percent_at_sale, producer_earning_cup,
           COALESCE(approved_at, created_at) as fecha
    FROM orders
    WHERE producer_id = ? AND status = 'approved' AND COALESCE(producer_paid, 0) = 0
    ORDER BY fecha ASC
  `).all(producerId);
}

function resumenPago(prod) {
  const ordenes = pendientesDePago(prod.id);
  const total = Math.round(ordenes.reduce((s, o) => s + (o.producer_earning_cup || 0), 0) * 100) / 100;
  const plan = getPlan(prod);
  let venceEl = null, vencido = false;
  if (ordenes.length) {
    const base = new Date(String(ordenes[0].fecha).replace(' ', 'T') + (String(ordenes[0].fecha).includes('Z') ? '' : 'Z'));
    const limite = new Date(base.getTime() + plan.payoutDays * 86400000);
    venceEl = limite.toISOString();
    vencido = limite < new Date();
  }
  let cuentas = [];
  try { cuentas = JSON.parse(prod.accounts_json || '[]'); } catch { cuentas = []; }
  return { total, ordenes, venceEl, vencido, plazo: plan.payout, planLabel: plan.label, cuentas };
}

route('GET', '/api/admin/payouts', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const prods = db.prepare('SELECT * FROM producers').all();
  const pendientes = prods.map(p => {
    const r = resumenPago(p);
    return {
      producerId: p.id, name: p.name, email: p.email, phone: p.contact_phone || '',
      plan: r.planLabel, plazo: r.plazo, cuentas: r.cuentas,
      totalCup: r.total, ventas: r.ordenes.length, venceEl: r.venceEl, vencido: r.vencido,
      ordenes: r.ordenes,
    };
  }).filter(x => x.ventas > 0)
    .sort((a, b) => String(a.venceEl).localeCompare(String(b.venceEl)));
  const historial = db.prepare('SELECT * FROM producer_payouts ORDER BY created_at DESC LIMIT 100').all();
  sendJSON(res, 200, { pendientes, historial });
});

route('POST', '/api/admin/payouts/:producerId', async (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  let note = '';
  let ids = null;
  try {
    const body = await readBody(req, 1024 * 10);
    const data = body.length ? JSON.parse(body.toString('utf8')) : {};
    note = String(data.note || '').slice(0, 300).trim();
    if (Array.isArray(data.orderIds)) ids = data.orderIds.map(Number).filter(Boolean);
  } catch { return sendJSON(res, 400, { error: 'Solicitud inválida' }); }

  const prod = db.prepare('SELECT * FROM producers WHERE id = ?').get(params.producerId);
  if (!prod) return sendJSON(res, 404, { error: 'Productor no encontrado' });
  let ordenes = pendientesDePago(prod.id);
  if (ids) ordenes = ordenes.filter(o => ids.includes(o.id));
  if (!ordenes.length) return sendJSON(res, 409, { error: 'Este productor no tiene ventas pendientes de pago' });

  const total = Math.round(ordenes.reduce((s, o) => s + (o.producer_earning_cup || 0), 0) * 100) / 100;
  let cuentas = [];
  try { cuentas = JSON.parse(prod.accounts_json || '[]'); } catch { cuentas = []; }
  const cuentaTxt = cuentas.map(c => `${c.currency}: ${c.bank} ${c.number}`.trim()).join(' | ');

  const info = db.prepare(`INSERT INTO producer_payouts (producer_id, producer_name, amount_cup, orders_count, account_text, note)
                           VALUES (?, ?, ?, ?, ?, ?)`)
    .run(prod.id, prod.name, total, ordenes.length, cuentaTxt, note);
  const payoutId = Number(info.lastInsertRowid);
  const upd = db.prepare('UPDATE orders SET producer_paid = 1, payout_id = ? WHERE id = ?');
  for (const o of ordenes) upd.run(payoutId, o.id);
  sendJSON(res, 200, { ok: true, payoutId, totalCup: total, ventas: ordenes.length });
});

route('GET', '/api/admin/orders-history', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const orders = db.prepare(`
    SELECT o.*, p.name as producer_name
    FROM orders o LEFT JOIN producers p ON p.id = o.producer_id
    WHERE o.status = 'approved' ORDER BY o.created_at DESC
  `).all();
  sendJSON(res, 200, { orders });
});

route('POST', '/api/admin/producers/:id/toggle-exclusive', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const producer = db.prepare('SELECT exclusive_enabled FROM producers WHERE id = ?').get(params.id);
  if (!producer) return sendJSON(res, 404, { error: 'Productor no encontrado' });
  const next = producer.exclusive_enabled ? 0 : 1;
  db.prepare('UPDATE producers SET exclusive_enabled = ? WHERE id = ?').run(next, params.id);
  sendJSON(res, 200, { ok: true, exclusiveEnabled: Boolean(next) });
});

route('POST', '/api/admin/producers/:id/toggle', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const producer = db.prepare('SELECT active FROM producers WHERE id = ?').get(params.id);
  if (!producer) return sendJSON(res, 404, { error: 'Productor no encontrado' });
  db.prepare("UPDATE producers SET active = ?, disabled_reason = '' WHERE id = ?").run(producer.active ? 0 : 1, params.id);
  sendJSON(res, 200, { ok: true, active: !producer.active });
});

route('DELETE', '/api/admin/producers/:id', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const producer = db.prepare('SELECT id FROM producers WHERE id = ?').get(params.id);
  if (!producer) return sendJSON(res, 404, { error: 'Productor no encontrado' });
  const ventas = db.prepare("SELECT COUNT(*) as c FROM orders WHERE producer_id = ? AND status = 'approved'").get(params.id).c;
  const tracks = db.prepare('SELECT * FROM tracks WHERE producer_id = ?').all(params.id);

  for (const t of tracks) {
    borrarArchivosTrack(t);
    db.prepare('DELETE FROM track_licenses WHERE track_id = ?').run(t.id);
    db.prepare('DELETE FROM tracks WHERE id = ?').run(t.id);
  }

  const prodRow = db.prepare('SELECT avatar_filename FROM producers WHERE id = ?').get(params.id);
  if (prodRow && prodRow.avatar_filename) {
    const av = path.join(UPLOADS_COVERS, prodRow.avatar_filename);
    if (fs.existsSync(av)) fs.unlinkSync(av);
  }

  const fullProd = producerFull(params.id);
  const deudaPendienteCup = fullProd ? resumenPago(fullProd).total : 0;

  for (const r of db.prepare('SELECT receipt_filename FROM plan_requests WHERE producer_id = ?').all(params.id)) {
    if (!r.receipt_filename) continue;
    const fp = path.join(UPLOADS_RECEIPTS, r.receipt_filename);
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch { /* ya no existe */ }
  }
  db.prepare('DELETE FROM plan_requests WHERE producer_id = ?').run(params.id);
  db.prepare('DELETE FROM producer_sessions WHERE producer_id = ?').run(params.id);
  db.prepare('DELETE FROM producers WHERE id = ?').run(params.id);
  sendJSON(res, 200, { ok: true, tracksEliminados: tracks.length, ventasConservadas: ventas, deudaPendienteCup });
});

route('GET', '/api/admin/preview-audio/:id', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const track = db.prepare('SELECT audio_filename FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });

  const filePath = path.join(UPLOADS_AUDIO, track.audio_filename);
  if (!fs.existsSync(filePath)) return sendJSON(res, 404, { error: 'Archivo no encontrado' });

  const stat = fs.statSync(filePath);
  const ext = path.extname(track.audio_filename).toLowerCase();
  const contentType = contentTypeForAudio(ext);
  const range = req.headers.range;

  const match = range ? range.match(/bytes=(\d*)-(\d*)/) : null;
  if (match) {
    let start = match[1] ? parseInt(match[1], 10) : 0;
    let end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (!match[1] && match[2]) { start = Math.max(0, stat.size - parseInt(match[2], 10)); end = stat.size - 1; }
    if (end >= stat.size) end = stat.size - 1;
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Type': contentType,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Content-Length': stat.size });
    fs.createReadStream(filePath).pipe(res);
  }
});

route('GET', '/api/admin/pending-tracks', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const tracks = db.prepare(`
    SELECT t.*, p.name as producer_name, p.email as producer_email
    FROM tracks t
    LEFT JOIN producers p ON p.id = t.producer_id
    WHERE t.approval_status = 'pending'
    ORDER BY t.created_at ASC
  `).all();
  sendJSON(res, 200, { tracks });
});

route('POST', '/api/admin/tracks/:id/approve', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const track = db.prepare('SELECT id FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });
  db.prepare("UPDATE tracks SET approval_status = 'approved' WHERE id = ?").run(params.id);
  sendJSON(res, 200, { ok: true });
});

route('POST', '/api/admin/tracks/:id/reject', async (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const track = db.prepare('SELECT id FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });
  let reason = '';
  try {
    const body = await readBody(req, 1024 * 2);
    if (body.length) reason = (JSON.parse(body.toString('utf8')).reason || '').slice(0, 300).trim();
  } catch { /* rechazo sin motivo también es válido */ }
  db.prepare("UPDATE tracks SET approval_status = 'rejected', rejection_reason = ? WHERE id = ?").run(reason, params.id);
  sendJSON(res, 200, { ok: true });
});

route('GET', '/api/admin/backup', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  try {
    const zipBuffer = createBackup(DATA_ROOT);
    const stamp = new Date().toISOString().slice(0, 10);
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="zona-beats-backup-${stamp}.zip"`,
      'Content-Length': zipBuffer.length,
    });
    res.end(zipBuffer);
  } catch (err) {
    console.error('Error generando backup:', err.message);
    sendJSON(res, 500, { error: 'No se pudo generar el backup' });
  }
});

route('POST', '/api/admin/restore', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });

  let zipBuffer;
  try {
    zipBuffer = await readBody(req, 200 * 1024 * 1024);
  } catch {
    return sendJSON(res, 413, { error: 'El archivo de backup es demasiado grande' });
  }

  try {
    const restoredCount = restoreBackup(DATA_ROOT, zipBuffer);
    sendJSON(res, 200, { ok: true, restoredCount });
    setTimeout(() => process.exit(0), 300);
  } catch (err) {
    console.error('Error restaurando backup:', err.message);
    sendJSON(res, 400, { error: err.message || 'No se pudo restaurar el backup' });
  }
});

route('GET', '/api/admin/orders', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const orders = db.prepare("SELECT * FROM orders WHERE status != 'approved' ORDER BY created_at DESC").all();
  sendJSON(res, 200, { orders });
});

route('GET', '/api/admin/orders/:id/receipt', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const order = db.prepare('SELECT receipt_filename FROM orders WHERE id = ?').get(params.id);
  if (!order) return sendJSON(res, 404, { error: 'Pedido no encontrado' });
  if (!order.receipt_filename) return sendJSON(res, 404, { error: 'El comprobante de este pedido ya fue eliminado' });
  const filePath = path.join(UPLOADS_RECEIPTS, order.receipt_filename);
  const ext = path.extname(order.receipt_filename).toLowerCase();
  sendFile(res, filePath, contentTypeForImage(ext));
});

function generateCertificateId() {
  const year = new Date().getFullYear();
  const rows = db.prepare("SELECT certificate_id FROM orders WHERE certificate_id LIKE ?").all(`LIC-${year}-%`);
  let max = 0;
  for (const r of rows) {
    const m = String(r.certificate_id || '').match(/^LIC-\d{4}-(\d{4})/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }

  for (let intento = 0; intento < 20; intento++) {
    const seq = String(max + 1 + intento).padStart(4, '0');
    const sufijo = crypto.randomBytes(2).toString('hex').toUpperCase();
    const candidato = `LIC-${year}-${seq}-${sufijo}`;
    const existe = db.prepare('SELECT 1 FROM orders WHERE certificate_id = ?').get(candidato);
    if (!existe) return candidato;
  }
  return `LIC-${year}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function generateCertificateHash(order, certificateId) {
  const payload = `${certificateId}|${order.track_id}|${order.buyer_name}|${order.buyer_phone}|${order.price_cup_at_sale}|${order.license_type}|${order.created_at}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

route('POST', '/api/admin/orders/:id/approve', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(params.id);
  if (!order) return sendJSON(res, 404, { error: 'Pedido no encontrado' });
  if (order.status === 'approved') return sendJSON(res, 409, { error: 'Este pedido ya estaba aprobado' });

  let trackMarkedSold = false;
  let wentToVip = false;
  let warning = null;
  const trackRow = db.prepare('SELECT id, sold, is_exclusive FROM tracks WHERE id = ?').get(order.track_id);

  if (SINGLE_SALE_LICENSES.includes(order.license_type)) {
    if (trackRow && trackRow.sold) {
      return sendJSON(res, 409, { error: 'Este beat ya se vendió con una licencia de compra única (Ilimitada o Exclusiva) a otro comprador. No apruebes este pedido — coordina la devolución con este cliente.' });
    }
    if (trackRow) {
      db.prepare('UPDATE tracks SET sold = 1 WHERE id = ?').run(trackRow.id);
      trackMarkedSold = true;
      wentToVip = order.license_type === 'exclusive';
    }
  } else if (trackRow && trackRow.sold) {
    warning = trackRow.is_exclusive
      ? 'Ojo: este beat ya se vendió como Exclusiva. Esta licencia se pagó antes de esa venta, pero aprobarla contradice la exclusividad prometida. Considera devolverle el dinero a este comprador en vez de aprobar.'
      : 'Ojo: este beat ya se cerró con una licencia Ilimitada. Esta licencia se pagó antes de ese cierre, así que es legítima, pero avísale al comprador de la Ilimitada para evitar malentendidos.';
  }

  // La comisión se recalcula con el plan que el productor tiene HOY (al aprobar),
  // no con el que tenía cuando el cliente mandó el comprobante.
  let commissionPercent = order.commission_percent_at_sale || 0;
  let producerEarning = order.producer_earning_cup || 0;
  if (order.producer_id) {
    const prodRow = producerFull(order.producer_id);
    if (prodRow) {
      commissionPercent = planEfectivo(prodRow).commission;
      producerEarning = Math.round((order.price_cup_at_sale || 0) * (1 - commissionPercent / 100) * 100) / 100;
    }
  }

  const certificateId = generateCertificateId();
  const certificateHash = generateCertificateHash(order, certificateId);
  const buyerToken = order.buyer_token || crypto.randomBytes(24).toString('hex');
  db.prepare(`UPDATE orders SET status = 'approved', certificate_id = ?, certificate_hash = ?,
              commission_percent_at_sale = ?, producer_earning_cup = ?, approved_at = ?, buyer_token = ? WHERE id = ?`)
    .run(certificateId, certificateHash, commissionPercent, producerEarning, new Date().toISOString(), buyerToken, params.id);

  sendJSON(res, 200, {
    ok: true, trackMarkedSold, wentToVip, warning, certificateId, commissionPercent, producerEarning,
    purchaseUrl: `${baseUrlFrom(req)}/?compra=${buyerToken}`,
  });
});

route('DELETE', '/api/admin/orders/:id', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(params.id);
  if (!order) return sendJSON(res, 404, { error: 'Pedido no encontrado' });

  if (order.receipt_filename) {
    const receiptPath = path.join(UPLOADS_RECEIPTS, order.receipt_filename);
    if (fs.existsSync(receiptPath)) fs.unlinkSync(receiptPath);
  }

  if (order.certificate_id) {
    db.prepare("UPDATE orders SET receipt_filename = '' WHERE id = ?").run(params.id);
    return sendJSON(res, 200, {
      ok: true,
      keptLicense: true,
      certificateId: order.certificate_id,
    });
  }

  db.prepare('DELETE FROM orders WHERE id = ?').run(params.id);
  sendJSON(res, 200, { ok: true, keptLicense: false });
});

const ALLOWED_WATERMARK_EXT = ['.mp3', '.wav', '.m4a', '.ogg', '.flac'];

route('GET', '/api/admin/watermark', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const config = db.prepare('SELECT * FROM watermark_config WHERE id = 1').get();
  sendJSON(res, 200, {
    active: Boolean(config.voice_filename),
    intervalSeconds: config.interval_seconds,
    volume: config.volume,
  });
});

route('POST', '/api/admin/watermark', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });

  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) return sendJSON(res, 400, { error: 'Falta boundary multipart' });

  let buffer;
  try {
    buffer = await readBody(req, MAX_WATERMARK_BYTES + 1024 * 50);
  } catch {
    return sendJSON(res, 413, { error: 'Archivo demasiado grande' });
  }

  const parts = parseMultipart(buffer, boundaryMatch[1]);
  const fields = {};
  let voicePart = null;
  for (const part of parts) {
    if (part.filename && part.name === 'voice') voicePart = part;
    else if (part.name) fields[part.name] = part.data.toString('utf8');
  }

  const current = db.prepare('SELECT * FROM watermark_config WHERE id = 1').get();
  let voiceFilename = current.voice_filename;

  if (voicePart && voicePart.data.length > 0) {
    const ext = safeExt(voicePart.filename, '.mp3');
    if (!ALLOWED_WATERMARK_EXT.includes(ext)) {
      return sendJSON(res, 400, { error: 'Formato de audio no permitido para la marca de agua' });
    }
    if (voicePart.data.length > MAX_WATERMARK_BYTES) {
      return sendJSON(res, 413, { error: `El audio de marca de agua debe pesar menos de ${MAX_WATERMARK_BYTES / 1024 / 1024}MB` });
    }
    if (current.voice_filename) {
      const oldPath = path.join(UPLOADS_WATERMARK, current.voice_filename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    voiceFilename = `${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(UPLOADS_WATERMARK, voiceFilename), voicePart.data);
  }

  const intervalSeconds = fields.intervalSeconds ? Math.max(5, Math.min(600, parseInt(fields.intervalSeconds, 10) || 20)) : current.interval_seconds;
  const volume = fields.volume ? Math.max(0.05, Math.min(1, parseFloat(fields.volume) || 0.35)) : current.volume;

  db.prepare('UPDATE watermark_config SET voice_filename = ?, interval_seconds = ?, volume = ? WHERE id = 1')
    .run(voiceFilename, intervalSeconds, volume);

  sendJSON(res, 200, { ok: true, active: Boolean(voiceFilename) });
});

route('DELETE', '/api/admin/watermark', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const current = db.prepare('SELECT * FROM watermark_config WHERE id = 1').get();
  if (current.voice_filename) {
    const voicePath = path.join(UPLOADS_WATERMARK, current.voice_filename);
    if (fs.existsSync(voicePath)) fs.unlinkSync(voicePath);
  }
  db.prepare("UPDATE watermark_config SET voice_filename = '' WHERE id = 1").run();
  sendJSON(res, 200, { ok: true });
});

route('GET', '/api/admin/watermark/preview', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const config = db.prepare('SELECT voice_filename FROM watermark_config WHERE id = 1').get();
  if (!config.voice_filename) return sendJSON(res, 404, { error: 'No hay marca de agua configurada' });
  const filePath = path.join(UPLOADS_WATERMARK, config.voice_filename);
  const ext = path.extname(config.voice_filename).toLowerCase();
  sendFile(res, filePath, contentTypeForAudio(ext));
});

const STATIC_DIRS = {
  '/admin': path.join(__dirname, 'admin'),
  '/productores': path.join(__dirname, 'productores'),
  '': path.join(__dirname, 'public'),
};

function serveStatic(req, res, pathname) {
  let baseDir = STATIC_DIRS[''];
  let relativePath = pathname;

  if (pathname === '/verify' || pathname.startsWith('/verify/')) {
    return sendFile(res, path.join(STATIC_DIRS[''], 'verify.html'), 'text/html; charset=utf-8');
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    baseDir = STATIC_DIRS['/admin'];
    relativePath = pathname.replace(/^\/admin/, '') || '/index.html';
  } else if (pathname === '/productores' || pathname.startsWith('/productores/')) {
    baseDir = STATIC_DIRS['/productores'];
    relativePath = pathname.replace(/^\/productores/, '') || '/index.html';
  }
  if (relativePath === '/' || relativePath === '') relativePath = '/index.html';

  const filePath = path.join(baseDir, relativePath);
  if (!filePath.startsWith(baseDir)) {
    return sendJSON(res, 403, { error: 'Prohibido' });
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(baseDir, 'index.html'), (err2, indexData) => {
        if (err2) return sendJSON(res, 404, { error: 'No encontrado' });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexData);
      });
      return;
    }
    const ext = path.extname(filePath);
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    const matched = matchRoute(req.method, pathname);
    if (matched) {
      try {
        await matched.handler(req, res, matched.params, url.searchParams);
      } catch (err) {
        console.error(err);
        if (!res.headersSent) sendJSON(res, 500, { error: 'Error interno' });
      }
      return;
    }
    return sendJSON(res, 404, { error: 'Ruta no encontrada' });
  }

  serveStatic(req, res, pathname);
});

desactivarVencidos();
setInterval(desactivarVencidos, 60 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Panel admin en http://localhost:${PORT}/admin`);
});

// subida de audio grande necesita más de los 2 min por defecto
server.timeout = 10 * 60 * 1000;
server.headersTimeout = 10 * 60 * 1000 + 5000;
server.requestTimeout = 10 * 60 * 1000;
server.keepAliveTimeout = 10 * 60 * 1000;
