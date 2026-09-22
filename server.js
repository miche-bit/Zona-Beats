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
const { createBackup, restoreBackup } = require('./backup');
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
[UPLOADS_AUDIO, UPLOADS_COVERS, UPLOADS_RECEIPTS, UPLOADS_WATERMARK, TMP_PROCESSING].forEach(d => fs.mkdirSync(d, { recursive: true }));

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
      SELECT id, title, genre, description, artist_credit, cover_filename, duration_seconds, plays, likes, created_at
      FROM tracks WHERE is_playlist = 1 AND approval_status = 'approved' ORDER BY created_at DESC
    `).all();
  } else if (type === 'vip') {
    rows = db.prepare(`
      SELECT id, title, genre, description, cover_filename, duration_seconds, plays,
             price_label, price_cup, for_sale, is_exclusive, sold, created_at
      FROM tracks WHERE is_playlist = 0 AND is_exclusive = 1 AND sold = 1 AND approval_status = 'approved' ORDER BY created_at DESC
    `).all();
  } else {
    rows = db.prepare(`
      SELECT id, title, genre, description, cover_filename, duration_seconds, plays,
             price_label, price_cup, for_sale, is_exclusive, sold, created_at
      FROM tracks WHERE is_playlist = 0 AND sold = 0 AND approval_status = 'approved' ORDER BY created_at DESC
    `).all();
  }

  if (type === 'catalog') {
    rows = rows.map(t => ({ ...t, licenses: getTrackLicenses(t.id) }));
  }

  sendJSON(res, 200, { tracks: rows });
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
    return sendJSON(res, 409, { error: 'Esta pista ya fue comprada de forma exclusiva por otra persona' });
  }
  if (!track.for_sale) {
    return sendJSON(res, 400, { error: 'Esta pista no está a la venta' });
  }

  const licenseRow = db.prepare('SELECT price_cup FROM track_licenses WHERE track_id = ? AND license_type = ?').get(trackId, licenseType);
  if (!licenseRow) {
    return sendJSON(res, 400, { error: 'Esa licencia no está disponible para esta pista' });
  }
  const priceCupAtSale = licenseRow.price_cup;

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
    const platformConfig = db.prepare('SELECT commission_percent FROM platform_config WHERE id = 1').get();
    commissionPercent = platformConfig.commission_percent;
    producerEarning = priceCupAtSale * (1 - commissionPercent / 100);
  }

  db.prepare(`
    INSERT INTO orders (track_id, track_title, price_label, currency, buyer_name, buyer_phone, receipt_filename,
                         producer_id, price_cup_at_sale, commission_percent_at_sale, producer_earning_cup, license_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    track.id, track.title, displayedPrice || `${priceCupAtSale} CUP`, currency, buyerName, buyerPhone, receiptFilename,
    track.producer_id || null, priceCupAtSale, commissionPercent, producerEarning, licenseType
  );

  sendJSON(res, 201, { ok: true });
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

  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    let start = match[1] ? parseInt(match[1], 10) : 0;
    let end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (end >= stat.size) end = stat.size - 1;
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
  try {
    const body = await readBody(req, 1024 * 10);
    const { email, password } = JSON.parse(body.toString('utf8'));
    const producer = db.prepare('SELECT * FROM producers WHERE email = ?').get((email || '').trim().toLowerCase());
    if (!producer || !producer.active) {
      return sendJSON(res, 401, { error: 'Correo o contraseña incorrectos' });
    }
    const valid = producerAuth.verifyPassword(password || '', producer.password_hash, producer.password_salt);
    if (!valid) {
      return sendJSON(res, 401, { error: 'Correo o contraseña incorrectos' });
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
  sendJSON(res, 200, { authenticated: Boolean(producer), name: producer ? producer.name : null });
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

  const audioPath = path.join(UPLOADS_AUDIO, track.audio_filename);
  if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  if (track.cover_filename) {
    const coverPath = path.join(UPLOADS_COVERS, track.cover_filename);
    if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
  }
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

  sendJSON(res, 200, {
    orders,
    summary: {
      totalSales: approved.length,
      totalSalesCup,
      totalEarningsCup,
    },
  });
});

async function processTrackUpload(req) {
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

  for (const part of parts) {
    if (part.filename && part.name === 'audio') audioPart = part;
    else if (part.filename && part.name === 'cover') coverPart = part;
    else if (part.name) fields[part.name] = part.data.toString('utf8');
  }

  if (!fields.title || !audioPart) {
    throw { status: 400, error: 'Falta título o archivo de audio' };
  }

  const audioExt = safeExt(audioPart.filename, '.mp3');
  if (!ALLOWED_AUDIO_EXT.includes(audioExt)) {
    throw { status: 400, error: 'Formato de audio no permitido' };
  }
  if (audioPart.data.length > MAX_AUDIO_BYTES) {
    throw { status: 413, error: `Audio demasiado grande (máx ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)}MB)` };
  }

  const tmpUploadPath = path.join(TMP_PROCESSING, `${crypto.randomUUID()}${audioExt}`);
  fs.writeFileSync(tmpUploadPath, audioPart.data);

  const watermarkConfig = db.prepare('SELECT * FROM watermark_config WHERE id = 1').get();
  let savedAudioFilename;

  if (watermarkConfig && watermarkConfig.voice_filename) {
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

  return { fields, savedAudioFilename, coverFilename };
}

const LICENSE_TYPES = ['basic', 'premium', 'unlimited', 'exclusive'];

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
  const { fields, savedAudioFilename, coverFilename } = upload;

  const isPlaylist = fields.isPlaylist === '1' || fields.isPlaylist === 'true' ? 1 : 0;
  const artistCredit = (fields.artistCredit || '').trim();
  const prices = isPlaylist ? { basic: 0, premium: 0, unlimited: 0, exclusive: 0 } : parseLicensePrices(fields);
  const offeredTypes = LICENSE_TYPES.filter(t => prices[t] > 0);

  if (!isPlaylist && offeredTypes.length === 0) {
    return sendJSON(res, 400, { error: 'Pon precio a al menos una licencia (Básica, Premium, Ilimitada o Exclusiva) en CUP' });
  }

  const forSale = isPlaylist ? 0 : 1;
  const isExclusive = !isPlaylist && prices.exclusive > 0 ? 1 : 0;
  const lowestPrice = offeredTypes.length ? Math.min(...offeredTypes.map(t => prices[t])) : 0;
  const priceLabel = lowestPrice > 0 ? `Desde ${lowestPrice} CUP` : '';

  const result = db.prepare(`
    INSERT INTO tracks (title, genre, description, artist_credit, audio_filename, cover_filename,
                         price_label, price_cup, for_sale, is_playlist, is_exclusive, producer_id, approval_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'approved')
  `).run(
    fields.title, fields.genre || '', fields.description || '', artistCredit,
    savedAudioFilename, coverFilename, priceLabel, lowestPrice, forSale, isPlaylist, isExclusive
  );

  const trackId = Number(result.lastInsertRowid);
  if (!isPlaylist) saveLicensesForTrack(trackId, prices);

  sendJSON(res, 201, { id: trackId });
});

route('POST', '/api/producer/tracks', async (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });

  let upload;
  try {
    upload = await processTrackUpload(req);
  } catch (err) {
    return sendJSON(res, err.status || 500, { error: err.error || 'Error al subir' });
  }
  const { fields, savedAudioFilename, coverFilename } = upload;

  const prices = parseLicensePrices(fields);
  const offeredTypes = LICENSE_TYPES.filter(t => prices[t] > 0);

  if (offeredTypes.length === 0) {
    return sendJSON(res, 400, { error: 'Pon precio a al menos una licencia en CUP' });
  }

  const isExclusive = prices.exclusive > 0 ? 1 : 0;
  const lowestPrice = Math.min(...offeredTypes.map(t => prices[t]));
  const priceLabel = `Desde ${lowestPrice} CUP`;

  const result = db.prepare(`
    INSERT INTO tracks (title, genre, description, audio_filename, cover_filename,
                         price_label, price_cup, for_sale, is_playlist, is_exclusive, producer_id, approval_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, 'pending')
  `).run(
    fields.title, fields.genre || '', fields.description || '',
    savedAudioFilename, coverFilename, priceLabel, lowestPrice, isExclusive, producer.id
  );

  const trackId = Number(result.lastInsertRowid);
  saveLicensesForTrack(trackId, prices);

  sendJSON(res, 201, { id: trackId });
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
    const offeredTypes = LICENSE_TYPES.filter(t => prices[t] > 0);

    if (offeredTypes.length === 0) {
      return sendJSON(res, 400, { error: 'Pon precio a al menos una licencia' });
    }

    const forSale = 1;
    const isExclusive = prices.exclusive > 0 ? 1 : 0;
    const lowestPrice = Math.min(...offeredTypes.map(t => prices[t]));
    const priceLabel = `Desde ${lowestPrice} CUP`;

    db.prepare('UPDATE tracks SET price_label = ?, price_cup = ?, for_sale = ?, is_exclusive = ? WHERE id = ?')
      .run(priceLabel, lowestPrice, forSale, isExclusive, params.id);
    saveLicensesForTrack(params.id, prices);
    sendJSON(res, 200, { ok: true });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('DELETE', '/api/admin/tracks/:id', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'No encontrada' });

  const audioPath = path.join(UPLOADS_AUDIO, track.audio_filename);
  if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  if (track.cover_filename) {
    const coverPath = path.join(UPLOADS_COVERS, track.cover_filename);
    if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
  }
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

    const cleanRates = rates.map(r => ({
      code: String(r.code || '').slice(0, 30).trim(),
      label: String(r.label || '').slice(0, 40).trim(),
      cupPerUnit: r.code === 'CUP' ? 1 : Math.max(0, parseFloat(r.cupPerUnit) || 0),
    })).filter(r => r.code);

    db.prepare('UPDATE exchange_rates SET rates_json = ? WHERE id = 1').run(JSON.stringify(cleanRates));
    sendJSON(res, 200, { ok: true });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('GET', '/api/admin/site-config', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const config = db.prepare('SELECT promo_text, promo_active, schedule_text FROM site_config WHERE id = 1').get();
  sendJSON(res, 200, {
    promoText: config.promo_text || '',
    promoActive: Boolean(config.promo_active),
    scheduleText: config.schedule_text || '',
  });
});

route('POST', '/api/admin/site-config', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  try {
    const body = await readBody(req, 1024 * 10);
    const { promoText, promoActive, scheduleText } = JSON.parse(body.toString('utf8'));
    db.prepare('UPDATE site_config SET promo_text = ?, promo_active = ?, schedule_text = ? WHERE id = 1')
      .run(String(promoText || '').slice(0, 300).trim(), promoActive ? 1 : 0, String(scheduleText || '').slice(0, 300).trim());
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
  const producers = db.prepare('SELECT id, name, email, active, created_at FROM producers ORDER BY created_at DESC').all();
  const withStats = producers.map(p => {
    const stats = db.prepare(`
      SELECT COUNT(*) as totalTracks,
             COALESCE(SUM(CASE WHEN status = 'approved' THEN price_cup_at_sale ELSE 0 END), 0) as totalSalesCup,
             COALESCE(SUM(CASE WHEN status = 'approved' THEN producer_earning_cup ELSE 0 END), 0) as totalEarningsCup
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

route('POST', '/api/admin/producers/:id/toggle', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const producer = db.prepare('SELECT active FROM producers WHERE id = ?').get(params.id);
  if (!producer) return sendJSON(res, 404, { error: 'Productor no encontrado' });
  db.prepare('UPDATE producers SET active = ? WHERE id = ?').run(producer.active ? 0 : 1, params.id);
  sendJSON(res, 200, { ok: true, active: !producer.active });
});

route('DELETE', '/api/admin/producers/:id', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const producer = db.prepare('SELECT id FROM producers WHERE id = ?').get(params.id);
  if (!producer) return sendJSON(res, 404, { error: 'Productor no encontrado' });
  const trackCount = db.prepare('SELECT COUNT(*) as c FROM tracks WHERE producer_id = ?').get(params.id).c;
  if (trackCount > 0) {
    return sendJSON(res, 409, { error: 'Este productor tiene beats subidos. Desactívalo en vez de eliminarlo.' });
  }
  db.prepare('DELETE FROM producers WHERE id = ?').run(params.id);
  db.prepare('DELETE FROM producer_sessions WHERE producer_id = ?').run(params.id);
  sendJSON(res, 200, { ok: true });
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

  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    let start = match[1] ? parseInt(match[1], 10) : 0;
    let end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (end >= stat.size) end = stat.size - 1;
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
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  sendJSON(res, 200, { orders });
});

route('GET', '/api/admin/orders/:id/receipt', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const order = db.prepare('SELECT receipt_filename FROM orders WHERE id = ?').get(params.id);
  if (!order) return sendJSON(res, 404, { error: 'Pedido no encontrado' });
  const filePath = path.join(UPLOADS_RECEIPTS, order.receipt_filename);
  const ext = path.extname(order.receipt_filename).toLowerCase();
  sendFile(res, filePath, contentTypeForImage(ext));
});

function generateCertificateId() {
  const year = new Date().getFullYear();
  const row = db.prepare("SELECT COUNT(*) as c FROM orders WHERE certificate_id LIKE ?").get(`LIC-${year}-%`);
  const seq = String(row.c + 1).padStart(4, '0');
  return `LIC-${year}-${seq}`;
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
  if (order.license_type === 'exclusive') {
    const track = db.prepare('SELECT id, sold FROM tracks WHERE id = ?').get(order.track_id);
    if (track && track.sold) {
      return sendJSON(res, 409, { error: 'La licencia exclusiva de este beat ya fue aprobada para otro comprador. No apruebes este pedido — coordina la devolución con este cliente.' });
    }
    if (track) {
      db.prepare('UPDATE tracks SET sold = 1 WHERE id = ?').run(track.id);
      trackMarkedSold = true;
    }
  }

  const certificateId = generateCertificateId();
  const certificateHash = generateCertificateHash(order, certificateId);
  db.prepare("UPDATE orders SET status = 'approved', certificate_id = ?, certificate_hash = ? WHERE id = ?")
    .run(certificateId, certificateHash, params.id);

  sendJSON(res, 200, { ok: true, trackMarkedSold, certificateId });
});

route('DELETE', '/api/admin/orders/:id', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(params.id);
  if (!order) return sendJSON(res, 404, { error: 'Pedido no encontrado' });

  const receiptPath = path.join(UPLOADS_RECEIPTS, order.receipt_filename);
  if (fs.existsSync(receiptPath)) fs.unlinkSync(receiptPath);

  db.prepare('DELETE FROM orders WHERE id = ?').run(params.id);
  sendJSON(res, 200, { ok: true });
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

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Panel admin en http://localhost:${PORT}/admin`);
});

// subida de audio grande necesita más de los 2 min por defecto
server.timeout = 10 * 60 * 1000;
server.headersTimeout = 10 * 60 * 1000 + 5000;
server.requestTimeout = 10 * 60 * 1000;
server.keepAliveTimeout = 10 * 60 * 1000;
