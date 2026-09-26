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
const { enviarBackup, restaurarDesdeZip, limpiarRestosRestauracion } = require('./backup');
const { DatabaseSync } = require('node:sqlite');
const { buildLicensePdf, LICENSE_LABELS } = require('./license');
const producerAuth = require('./producerAuth');
const { applyWatermark, getDurationSeconds, transcodificarMp3, miniaturaImagen } = require('./watermark');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cambiaesto123';
const EN_PRODUCCION = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME ||
  process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_VOLUME_MOUNT_PATH) || process.env.NODE_ENV === 'production';
// En el servidor de verdad no se deja entrar con la contraseña de ejemplo: cualquiera la conoce.
const PASSWORD_DE_EJEMPLO = !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'cambiaesto123';
if (EN_PRODUCCION && PASSWORD_DE_EJEMPLO) {
  console.warn('ATENCIÓN: falta la variable ADMIN_PASSWORD (o sigue siendo la de ejemplo). El panel de administración queda bloqueado hasta que la pongas en Railway > Variables.');
} else if (EN_PRODUCCION && ADMIN_PASSWORD.length < 10) {
  console.warn('ATENCIÓN: ADMIN_PASSWORD es corta. Usa una de al menos 10 caracteres.');
}
// Si no se define ADMIN_SESSION_SECRET se genera una vez y se guarda en la base de datos,
// así un reinicio o un deploy no cierra la sesión del administrador.
function secretoDeSesion() {
  if (process.env.ADMIN_SESSION_SECRET) return process.env.ADMIN_SESSION_SECRET;
  const fila = db.prepare("SELECT valor FROM app_secrets WHERE clave = 'admin_session'").get();
  if (fila && fila.valor) return fila.valor;
  const nuevo = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT OR REPLACE INTO app_secrets (clave, valor) VALUES ('admin_session', ?)").run(nuevo);
  return nuevo;
}
const ADMIN_SESSION_SECRET = secretoDeSesion();
// La firma depende también de la contraseña: si la cambias, todas las sesiones abiertas se cierran.
const CLAVE_FIRMA_ADMIN = crypto.createHash('sha256').update(`${ADMIN_SESSION_SECRET}|${ADMIN_PASSWORD}`).digest();

const DATA_ROOT = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const UPLOADS_AUDIO = path.join(DATA_ROOT, 'uploads', 'audio');
const UPLOADS_COVERS = path.join(DATA_ROOT, 'uploads', 'covers');
const UPLOADS_RECEIPTS = path.join(DATA_ROOT, 'uploads', 'receipts');
const UPLOADS_WATERMARK = path.join(DATA_ROOT, 'uploads', 'watermark');
const TMP_PROCESSING = path.join(DATA_ROOT, 'uploads', 'tmp');
const UPLOADS_MASTERS = path.join(DATA_ROOT, 'uploads', 'masters');
[UPLOADS_AUDIO, UPLOADS_COVERS, UPLOADS_RECEIPTS, UPLOADS_WATERMARK, TMP_PROCESSING, UPLOADS_MASTERS].forEach(d => fs.mkdirSync(d, { recursive: true }));

const MAX_COVER_BYTES = 8 * 1024 * 1024;  // 8MB portada
const MAX_RECEIPT_BYTES = 12 * 1024 * 1024; // 12MB comprobante (fotos de capturas de pantalla pueden pesar más que una portada)
const MAX_WATERMARK_BYTES = 10 * 1024 * 1024; // 10MB para el audio corto de la voz de marca de agua

function signSession() {
  const payload = `admin:${Date.now()}`;
  const sig = crypto.createHmac('sha256', CLAVE_FIRMA_ADMIN).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64');
}

function verifySession(cookieValue) {
  try {
    if (EN_PRODUCCION && PASSWORD_DE_EJEMPLO) return false;
    const decoded = Buffer.from(String(cookieValue), 'base64').toString('utf8');
    const [payload, sig] = decoded.split('.');
    if (!payload || !sig) return false;
    const expectedSig = crypto.createHmac('sha256', CLAVE_FIRMA_ADMIN).update(payload).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const ts = Number(payload.split(':')[1]);
    return Number.isFinite(ts) && Date.now() - ts < 1000 * 60 * 60 * 12 && ts <= Date.now() + 60000;
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
  return Boolean(cookie && verifySession(cookie));
}

function getAuthedProducer(req) {
  const token = getCookie(req, 'producer_session');
  return producerAuth.getProducerFromSession(token);
}

// Si se responde antes de leer todo el cuerpo (un archivo demasiado grande, un trozo cortado),
// la conexión no se puede reutilizar: se avisa con «Connection: close» y se cierra al terminar.
function cerrarSiQuedoCuerpo(res, headers) {
  const req = res.req;
  if (!req || req.complete) return;
  const tieneCuerpo = Number(req.headers['content-length']) > 0 || Boolean(req.headers['transfer-encoding']);
  if (!tieneCuerpo) return;
  headers.Connection = 'close';
  res.once('finish', () => {
    const socket = req.socket;
    if (socket && !socket.destroyed) setTimeout(() => socket.destroy(), 1500).unref();
  });
}

function sendJSON(res, status, obj) {
  if (res.headersSent || res.destroyed) return;
  const body = JSON.stringify(obj);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  };
  cerrarSiQuedoCuerpo(res, headers);
  res.writeHead(status, headers);
  res.end(body);
}

function sendFile(res, filePath, contentType, cacheSeconds = 0) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return sendJSON(res, 404, { error: 'No encontrado' });
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': st.size,
      'Cache-Control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-cache',
    });
    fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
  });
}

function aplicarCabecerasSeguridad(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function esHttps(req) {
  return String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function cookieSegura(req, nombre, valor, maxAge) {
  return `${nombre}=${encodeURIComponent(valor)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${esHttps(req) ? '; Secure' : ''}`;
}

// Límite simple de intentos por IP (en memoria) para frenar fuerza bruta.
const rateBuckets = new Map();
// Detrás del proxy de Railway, la IP real es la ÚLTIMA de X-Forwarded-For (la que agrega el proxy);
// la primera la puede inventar cualquiera.
function clientIp(req) {
  const partes = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  return partes.length ? partes[partes.length - 1] : String((req.socket && req.socket.remoteAddress) || '');
}
function limiteAlcanzado(clave, max) {
  const b = rateBuckets.get(clave);
  return Boolean(b && Date.now() <= b.reset && b.count >= max);
}
function sumarIntento(clave, windowMs) {
  const now = Date.now();
  let b = rateBuckets.get(clave);
  if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; rateBuckets.set(clave, b); }
  b.count++;
}
function limpiarIntentos(clave) { rateBuckets.delete(clave); }
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
    let excedido = false;
    req.on('data', (chunk) => {
      if (excedido) return; // lo que sigue se descarta; la respuesta cierra la conexión
      size += chunk.length;
      if (size > maxBytes) {
        excedido = true;
        chunks.length = 0;
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!excedido) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('ABORTED')));
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

// Convierte lo que escribe una persona en un número: "10.000" = 10000, "1.500,50" = 1500.5, "400" = 400.
function parsePrecio(valor) {
  let t = String(valor ?? '').trim().replace(/\s/g, '').replace(/[^0-9.,-]/g, '');
  if (!t) return 0;
  const tienePunto = t.includes('.'), tieneComa = t.includes(',');
  if (tienePunto && tieneComa) {
    // el último separador es el decimal
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
  } else if (tieneComa) {
    t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (tienePunto) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  }
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n * 100) / 100, 1e9);
}

function limpiarTexto(v, max) {
  return String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
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

// ---------- Envío de archivos con soporte de Range (reanudar descargas y adelantar el audio) ----------
function enviarArchivo(req, res, filePath, contentType, extra = {}) {
  let stat;
  try { stat = fs.statSync(filePath); } catch { return sendJSON(res, 404, { error: 'Archivo no encontrado' }); }
  if (!stat.isFile()) return sendJSON(res, 404, { error: 'Archivo no encontrado' });
  const base = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Last-Modified': stat.mtime.toUTCString(), ...extra };
  const range = req.headers.range;
  const m = range ? String(range).match(/^bytes=(\d*)-(\d*)$/) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (!m[1] && m[2]) { start = Math.max(0, stat.size - parseInt(m[2], 10)); end = stat.size - 1; }
    if (end >= stat.size) end = stat.size - 1;
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(filePath, { start, end }).on('error', () => res.destroy()).pipe(res);
    return;
  }
  res.writeHead(200, { ...base, 'Content-Length': stat.size });
  fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
}

// Nombre de descarga con tildes (RFC 5987) y una versión simple para navegadores viejos.
function dispositionAdjunto(nombre) {
  const simple = String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 ._()-]/g, '').trim() || 'archivo';
  return `attachment; filename="${simple}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

function hashArchivo(filePath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(filePath).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

function leerTrozo(filePath, offset, largo) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const b = Buffer.alloc(largo);
    const n = fs.readSync(fd, b, 0, largo, offset);
    return b.subarray(0, n);
  } finally { fs.closeSync(fd); }
}

// ---------- Miniaturas de portadas y fotos (la tienda no descarga imágenes de varios MB) ----------
const UPLOADS_THUMBS = path.join(UPLOADS_COVERS, 'thumbs');
fs.mkdirSync(UPLOADS_THUMBS, { recursive: true });
const TAMANOS_MINIATURA = [160, 300, 600];
const miniaturasEnCurso = new Map();
let trabajosImagen = 0;
const colaImagen = [];
function conCupoImagen(fn) {
  return new Promise((resolve, reject) => {
    const correr = () => {
      trabajosImagen++;
      fn().then(resolve, reject).finally(() => { trabajosImagen--; const sig = colaImagen.shift(); if (sig) sig(); });
    };
    if (trabajosImagen < 2) correr(); else colaImagen.push(correr);
  });
}

// ffmpeg con audio es pesado: como mucho 2 procesos a la vez para no ahogar el servidor.
let trabajosAudio = 0;
const colaAudio = [];
function conCupoAudio(fn) {
  return new Promise((resolve, reject) => {
    const correr = () => {
      trabajosAudio++;
      Promise.resolve().then(fn).then(resolve, reject).finally(() => { trabajosAudio--; const sig = colaAudio.shift(); if (sig) sig(); });
    };
    if (trabajosAudio < 2) correr(); else colaAudio.push(correr);
  });
}

async function servirImagen(req, res, dir, filename, query, cacheSeg) {
  if (!filename) return sendJSON(res, 404, { error: 'Sin imagen' });
  const original = path.join(dir, path.basename(filename));
  if (!fs.existsSync(original)) return sendJSON(res, 404, { error: 'Imagen no encontrada' });
  const lado = Number(query && query.get('s'));
  if (!TAMANOS_MINIATURA.includes(lado)) {
    return sendFile(res, original, contentTypeForImage(path.extname(filename).toLowerCase()), cacheSeg);
  }
  const miniatura = path.join(UPLOADS_THUMBS, `${path.basename(filename)}-${lado}.jpg`);
  if (!fs.existsSync(miniatura)) {
    let tarea = miniaturasEnCurso.get(miniatura);
    if (!tarea) {
      const tmp = miniatura + '.tmp.jpg';
      tarea = conCupoImagen(() => miniaturaImagen(original, tmp, lado)).then(() => fs.renameSync(tmp, miniatura))
        .finally(() => miniaturasEnCurso.delete(miniatura));
      miniaturasEnCurso.set(miniatura, tarea);
    }
    try { await tarea; } catch (e) {
      // sin ffmpeg o imagen rara: se manda la original
      return sendFile(res, original, contentTypeForImage(path.extname(filename).toLowerCase()), 3600);
    }
  }
  sendFile(res, miniatura, 'image/jpeg', cacheSeg);
}

function borrarMiniaturas(filename) {
  if (!filename) return;
  const base = path.basename(filename);
  for (const lado of TAMANOS_MINIATURA) {
    try { fs.unlinkSync(path.join(UPLOADS_THUMBS, `${base}-${lado}.jpg`)); } catch { /* no existía */ }
  }
}

// ---------- Subidas por partes (reanudables) ----------
// Railway corta cualquier petición cuyo cuerpo tarde más de 5 minutos en subir y con los datos
// de Cuba un WAV o unos STEMS nunca entran en ese tiempo. Por eso los archivos grandes se mandan
// en trozos de pocos MB: si se cae la conexión se sigue desde el último trozo, y el servidor
// escribe directo al disco sin cargar el archivo en memoria.
const UPLOAD_KINDS = {
  audio: { exts: ALLOWED_AUDIO_EXT, max: 250 * 1024 * 1024, etiqueta: 'el audio' },
  wav: { exts: ['.wav'], max: 1024 * 1024 * 1024, etiqueta: 'el WAV' },
  stems: { exts: ['.zip', '.rar', '.7z'], max: 4 * 1024 * 1024 * 1024, etiqueta: 'los STEMS' },
  cover: { exts: ALLOWED_IMAGE_EXT, max: MAX_COVER_BYTES, etiqueta: 'la portada' },
  backup: { exts: ['.zip'], max: 64 * 1024 * 1024 * 1024, etiqueta: 'el backup', soloAdmin: true },
};
const CHUNK_SIZE = 4 * 1024 * 1024;
const CHUNK_MAX = 8 * 1024 * 1024;
const subidasOcupadas = new Set();

function fmtMB(bytes) {
  return bytes >= 1024 * 1024 * 1024 ? `${Math.round(bytes / 1024 / 1024 / 1024 * 10) / 10} GB` : `${Math.round(bytes / 1024 / 1024)} MB`;
}
function rutaSubida(id) { return path.join(TMP_PROCESSING, `up-${id}.part`); }
// Quien tenga abiertos el panel y el portal en el mismo navegador tiene las dos sesiones:
// cada página dice para quién sube (cabecera X-Panel) y así la subida queda a nombre correcto.
function duenoSubida(req) {
  const panel = String(req.headers['x-panel'] || '');
  const productor = () => { const p = getAuthedProducer(req); return p ? `p:${p.id}` : null; };
  if (panel === 'productor') return productor();
  if (panel === 'admin') return isAdminAuthed(req) ? 'admin' : null;
  if (isAdminAuthed(req)) return 'admin';
  return productor();
}
function subidaDe(id, owner) {
  if (!/^[a-f0-9]{32}$/.test(String(id || ''))) return null;
  const up = db.prepare('SELECT * FROM uploads WHERE id = ?').get(String(id));
  return up && up.owner === owner ? up : null;
}

function limpiarSubidasViejas() {
  const limite = Date.now() - 48 * 3600 * 1000;
  for (const up of db.prepare('SELECT id FROM uploads WHERE updated_at < ?').all(limite)) {
    try { fs.unlinkSync(rutaSubida(up.id)); } catch { /* ya no estaba */ }
    db.prepare('DELETE FROM uploads WHERE id = ?').run(up.id);
  }
  // restos de procesamientos cortados a la mitad
  try {
    for (const f of fs.readdirSync(TMP_PROCESSING)) {
      if (f === '.gitkeep') continue;
      const fp = path.join(TMP_PROCESSING, f);
      const st = fs.statSync(fp);
      if (st.mtimeMs < limite && !f.startsWith('up-')) fs.unlinkSync(fp);
      if (f.startsWith('up-') && !db.prepare('SELECT 1 FROM uploads WHERE id = ?').get(f.slice(3, -5)) && st.mtimeMs < Date.now() - 3600 * 1000) fs.unlinkSync(fp);
    }
  } catch (e) { console.error('Limpieza de temporales:', e.message); }
}

// Toma un archivo ya subido completo para usarlo; lanza un error claro si falta o está a medias.
function tomarSubida(id, owner, kind) {
  if (!id) return null;
  const tipo = UPLOAD_KINDS[kind];
  const up = subidaDe(id, owner);
  if (!up || up.kind !== kind) throw { status: 400, error: `No encontramos ${tipo.etiqueta}. Vuelve a elegir el archivo.` };
  let st = null;
  try { st = fs.statSync(rutaSubida(up.id)); } catch { st = null; }
  if (!st || up.received !== up.size || st.size !== up.size) {
    throw { status: 400, error: `${tipo.etiqueta.charAt(0).toUpperCase() + tipo.etiqueta.slice(1)} no terminó de subirse. Espera a que llegue al 100%.` };
  }
  return { ...up, path: rutaSubida(up.id) };
}

function moverSubida(up, dir, prefijo) {
  const nombre = `${prefijo}${crypto.randomUUID()}${up.ext}`;
  fs.renameSync(up.path, path.join(dir, nombre));
  db.prepare('DELETE FROM uploads WHERE id = ?').run(up.id);
  return nombre;
}

const routes = [];
function route(method, pattern, handler) {
  const paramNames = [];
  const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => {
    paramNames.push(m.slice(1));
    return '([^/]+)';
  }) + '$');
  routes.push({ method, pattern, regex, paramNames, handler });
}

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const match = pathname.match(r.regex);
    if (!match) continue;
    const params = {};
    try {
      r.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
    } catch {
      return null; // %XX mal formado: se trata como ruta inexistente en vez de tumbar el servidor
    }
    return { handler: r.handler, params };
  }
  return null;
}

route('POST', '/api/uploads', async (req, res) => {
  const owner = duenoSubida(req);
  if (!owner) return sendJSON(res, 401, { error: 'Tu sesión expiró. Vuelve a entrar.' });
  let d;
  try { d = JSON.parse((await readBody(req, 4096)).toString('utf8') || '{}'); }
  catch { return sendJSON(res, 400, { error: 'Solicitud inválida' }); }
  const kind = String(d.kind || '');
  const tipo = UPLOAD_KINDS[kind];
  if (!tipo) return sendJSON(res, 400, { error: 'Tipo de archivo desconocido' });
  if (tipo.soloAdmin && owner !== 'admin') return sendJSON(res, 403, { error: 'No autorizado' });
  const size = Number(d.size);
  if (!Number.isInteger(size) || size <= 0) return sendJSON(res, 400, { error: `El archivo de ${tipo.etiqueta} está vacío` });
  if (size > tipo.max) return sendJSON(res, 413, { error: `${tipo.etiqueta.charAt(0).toUpperCase() + tipo.etiqueta.slice(1)} pesa ${fmtMB(size)} y el máximo es ${fmtMB(tipo.max)}.` });
  const ext = safeExt(String(d.name || ''), '');
  if (!tipo.exts.includes(ext)) {
    return sendJSON(res, 400, { error: `Formato no permitido para ${tipo.etiqueta}. Usa: ${tipo.exts.join(', ').toUpperCase().replace(/\./g, '')}.` });
  }
  if (owner !== 'admin') {
    const full = producerFull(Number(owner.slice(2)));
    if (!full || !full.approved) return sendJSON(res, 403, { error: 'Tu cuenta todavía no fue aprobada por el administrador.' });
    if (!full.active || !planVigente(full)) return sendJSON(res, 403, { error: 'Tu plan está vencido o tu cuenta desactivada. Renueva para subir beats.' });
    // se avisa antes de subir nada si el plan no permite ese archivo
    const plan = planEfectivo(full);
    if (kind === 'wav' && !plan.wav) return sendJSON(res, 403, { error: `Tu plan ${plan.label} no incluye entrega en WAV. Sube al plan Pro o Studio.` });
    if (kind === 'stems' && !plan.stems) return sendJSON(res, 403, { error: `Tu plan ${plan.label} no incluye STEMS. Solo el plan Studio permite subir STEMS.` });
    if (kind === 'audio' && !plan.audioExt.includes(ext)) {
      return sendJSON(res, 403, { error: plan.audioExt.length === 1 ? `Tu plan ${plan.label} solo permite subir audio en MP3 (320 kbps).` : `Tu plan ${plan.label} permite subir el audio en MP3 (320 kbps) o WAV.` });
    }
  }
  // si alguien deja muchas subidas a medias, se borran las más viejas
  const abiertas = db.prepare('SELECT id FROM uploads WHERE owner = ? ORDER BY updated_at DESC').all(owner);
  for (const vieja of abiertas.slice(39)) {
    try { fs.unlinkSync(rutaSubida(vieja.id)); } catch { /* nada */ }
    db.prepare('DELETE FROM uploads WHERE id = ?').run(vieja.id);
  }
  if (owner !== 'admin') {
    const enCurso = db.prepare('SELECT COALESCE(SUM(size), 0) as s FROM uploads WHERE owner = ?').get(owner).s;
    if (enCurso + size > 6 * 1024 * 1024 * 1024) {
      return sendJSON(res, 413, { error: 'Tienes demasiados archivos a medio subir. Termina de publicar tu beat o espera 2 días a que se borren solos.' });
    }
  }
  const id = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(rutaSubida(id), Buffer.alloc(0));
  const ahora = Date.now();
  db.prepare('INSERT INTO uploads (id, owner, kind, original_name, ext, size, received, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)')
    .run(id, owner, kind, limpiarTexto(d.name, 200), ext, size, ahora, ahora);
  sendJSON(res, 201, { id, chunkSize: CHUNK_SIZE, received: 0, size });
});

route('GET', '/api/uploads/:id', (req, res, params) => {
  const owner = duenoSubida(req);
  if (!owner) return sendJSON(res, 401, { error: 'Tu sesión expiró. Vuelve a entrar.' });
  const up = subidaDe(params.id, owner);
  if (!up) return sendJSON(res, 404, { error: 'Esa subida ya no existe' });
  sendJSON(res, 200, { id: up.id, kind: up.kind, size: up.size, received: up.received, chunkSize: CHUNK_SIZE });
});

route('DELETE', '/api/uploads/:id', (req, res, params) => {
  const owner = duenoSubida(req);
  if (!owner) return sendJSON(res, 401, { error: 'Tu sesión expiró. Vuelve a entrar.' });
  const up = subidaDe(params.id, owner);
  if (up) {
    try { fs.unlinkSync(rutaSubida(up.id)); } catch { /* nada */ }
    db.prepare('DELETE FROM uploads WHERE id = ?').run(up.id);
  }
  sendJSON(res, 200, { ok: true });
});

function drenar(req) {
  return new Promise((resolve) => { req.on('end', resolve); req.on('error', resolve); req.on('close', resolve); req.resume(); });
}

route('PUT', '/api/uploads/:id/chunk', async (req, res, params, query) => {
  const owner = duenoSubida(req);
  if (!owner) { await drenar(req); return sendJSON(res, 401, { error: 'Tu sesión expiró. Vuelve a entrar.' }); }
  const up = subidaDe(params.id, owner);
  if (!up) { await drenar(req); return sendJSON(res, 404, { error: 'Esa subida ya no existe. Vuelve a elegir el archivo.' }); }
  const offset = Number(query.get('offset'));
  if (!Number.isInteger(offset) || offset < 0) { await drenar(req); return sendJSON(res, 400, { error: 'Posición inválida' }); }
  if (subidasOcupadas.has(up.id)) { await drenar(req); return sendJSON(res, 409, { error: 'Ocupado', received: up.received, busy: true }); }
  if (offset !== up.received) { await drenar(req); return sendJSON(res, offset < up.received ? 200 : 409, { received: up.received }); }
  const restante = up.size - up.received;
  if (restante <= 0) { await drenar(req); return sendJSON(res, 200, { received: up.received, done: true }); }

  subidasOcupadas.add(up.id);
  const destino = rutaSubida(up.id);
  let escritos = 0;
  try {
    // si el servidor se cayó justo después de escribir un trozo (y antes de anotarlo), el archivo
    // puede tener bytes de más: se recorta a lo anotado para que el siguiente trozo caiga en su lugar
    try {
      const st = fs.statSync(destino);
      if (st.size !== up.received) fs.truncateSync(destino, up.received);
    } catch {
      fs.writeFileSync(destino, Buffer.alloc(0));
      if (up.received > 0) {
        db.prepare('UPDATE uploads SET received = 0, updated_at = ? WHERE id = ?').run(Date.now(), up.id);
        await drenar(req);
        return sendJSON(res, 409, { error: 'El archivo parcial se perdió. Se vuelve a empezar.', received: 0 });
      }
    }
    const limite = Math.min(CHUNK_MAX, restante);
    const contador = new Transform({
      transform(chunk, enc, cb) {
        escritos += chunk.length;
        if (escritos > limite) return cb(Object.assign(new Error('Trozo demasiado grande'), { code: 'TROZO_GRANDE' }));
        cb(null, chunk);
      },
    });
    await pipeline(req, contador, fs.createWriteStream(destino, { flags: 'a' }));
    const declarado = Number(req.headers['content-length']);
    if (Number.isFinite(declarado) && declarado !== escritos) throw Object.assign(new Error('Trozo incompleto'), { code: 'INCOMPLETO' });
    const recibido = up.received + escritos;
    db.prepare('UPDATE uploads SET received = ?, updated_at = ? WHERE id = ?').run(recibido, Date.now(), up.id);
    sendJSON(res, 200, { received: recibido, done: recibido >= up.size });
  } catch (err) {
    // se deshace lo que haya entrado a medias para que el archivo nunca quede corrupto
    try { fs.truncateSync(destino, up.received); } catch { /* nada */ }
    if (!res.headersSent && !res.destroyed) {
      const grande = err && err.code === 'TROZO_GRANDE';
      const body = JSON.stringify({ error: grande ? 'El trozo es demasiado grande.' : 'El trozo no llegó completo. Se reintenta.', received: up.received });
      res.writeHead(grande ? 413 : 400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), Connection: 'close' });
      res.end(body);
      res.once('finish', () => { if (req.socket && !req.socket.destroyed) setTimeout(() => req.socket.destroy(), 1500).unref(); });
    }
  } finally {
    subidasOcupadas.delete(up.id);
  }
});

// Un beat de un productor desactivado o sin aprobar no se muestra ni se vende.
function pistaVisible(track) {
  if (!track || !track.producer_id) return true;
  const p = db.prepare('SELECT active, approved FROM producers WHERE id = ?').get(track.producer_id);
  return Boolean(p && p.active && p.approved);
}
const FILTRO_PRODUCTOR_ACTIVO = '(t.producer_id IS NULL OR (p.active = 1 AND p.approved = 1))';

// GET /api/tracks?type=catalog|playlist|vip
route('GET', '/api/tracks', (req, res, params, query) => {
  const type = query.get('type') || 'catalog';
  let rows;

  if (type === 'playlist') {
    rows = db.prepare(`
      SELECT t.id, t.title, t.genre, t.description, t.artist_credit, t.cover_filename, t.duration_seconds, t.plays, t.likes, t.created_at,
             t.producer_id, p.name as producer_name
      FROM tracks t LEFT JOIN producers p ON p.id = t.producer_id
      WHERE t.is_playlist = 1 AND t.approval_status = 'approved' AND ${FILTRO_PRODUCTOR_ACTIVO} ORDER BY t.created_at DESC
    `).all();
  } else if (type === 'vip') {
    rows = db.prepare(`
      SELECT t.id, t.title, t.genre, t.description, t.cover_filename, t.duration_seconds, t.plays,
             t.price_label, t.price_cup, t.for_sale, t.is_exclusive, t.sold, t.created_at,
             p.name as producer_name,
             (SELECT CASE WHEN o.vip_public = 1 THEN o.buyer_name ELSE '' END FROM orders o
               WHERE o.track_id = t.id AND o.status = 'approved' AND o.license_type = 'exclusive'
               ORDER BY o.id DESC LIMIT 1) as vip_owner
      FROM tracks t
      LEFT JOIN producers p ON p.id = t.producer_id
      WHERE t.is_playlist = 0 AND t.is_exclusive = 1 AND t.sold = 1 AND t.approval_status = 'approved'
      ORDER BY t.created_at DESC
    `).all();
  } else {
    rows = db.prepare(`
      SELECT t.id, t.title, t.genre, t.description, t.cover_filename, t.duration_seconds, t.plays, t.likes,
             t.price_label, t.price_cup, t.for_sale, t.is_exclusive, t.sold, t.created_at,
             t.producer_id, p.name as producer_name
      FROM tracks t
      LEFT JOIN producers p ON p.id = t.producer_id
      WHERE t.is_playlist = 0 AND t.sold = 0 AND t.approval_status = 'approved' AND ${FILTRO_PRODUCTOR_ACTIVO}
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
    SELECT t.id, t.title, t.created_at, p.name as producer_name,
           CASE WHEN t.stems_hash = ? THEN 'stems' WHEN t.wav_hash = ? THEN 'wav' WHEN t.mp3_hash = ? THEN 'mp3' ELSE 'master' END as tipo_archivo
    FROM tracks t LEFT JOIN producers p ON p.id = t.producer_id
    WHERE t.master_hash = ? OR t.mp3_hash = ? OR t.wav_hash = ? OR t.stems_hash = ?
  `).get(hash, hash, hash, hash, hash, hash, hash);
  if (track) {
    const profile = db.prepare('SELECT artist_name FROM profile WHERE id = 1').get();
    const licencias = db.prepare(`
      SELECT certificate_id, license_type, created_at FROM orders
      WHERE track_id = ? AND status = 'approved' ORDER BY created_at ASC
    `).all(track.id);
    return sendJSON(res, 200, {
      type: 'audio',
      fileKind: track.tipo_archivo,
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
  if (!rateLimit(req, 'license', 240, 60 * 1000)) return sendJSON(res, 429, { error: 'Demasiadas consultas. Espera un minuto.' });
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

// Qué archivos recibe cada licencia: Básica MP3 · Premium MP3 + WAV · Ilimitada/Exclusiva MP3 + WAV + STEMS
function archivosDeCompra(order) {
  const t = db.prepare('SELECT title, master_filename, mp3_filename, wav_filename, stems_filename FROM tracks WHERE id = ?').get(order.track_id);
  if (!t) return [];
  const lista = [];
  const vistos = new Set();
  const nombreBonito = (ext, tipo) => {
    if (tipo === 'stems') return `STEMS (${ext.replace('.', '').toUpperCase()})`;
    return ext.replace('.', '').toUpperCase();
  };
  const agregar = (tipo, nombre) => {
    if (!nombre || vistos.has(nombre)) return;
    const p = path.join(UPLOADS_MASTERS, nombre);
    let st = null;
    try { st = fs.statSync(p); } catch { st = null; }
    if (!st) return;
    vistos.add(nombre);
    const ext = path.extname(nombre).toLowerCase();
    lista.push({ f: tipo, etiqueta: nombreBonito(ext, tipo), nombre, path: p, ext, size: st.size, titulo: t.title });
  };
  agregar('mp3', t.mp3_filename || t.master_filename);
  if (['premium', 'unlimited', 'exclusive'].includes(order.license_type)) agregar('wav', t.wav_filename);
  if (SINGLE_SALE_LICENSES.includes(order.license_type)) agregar('stems', t.stems_filename);
  return lista;
}

function contentTypeDescarga(ext) {
  if (['.zip'].includes(ext)) return 'application/zip';
  if (['.rar', '.7z'].includes(ext)) return 'application/octet-stream';
  return contentTypeForAudio(ext);
}

route('GET', '/api/purchase/:token', (req, res, params) => {
  if (!rateLimit(req, 'purchase', 400, 60 * 1000)) return sendJSON(res, 429, { error: 'Demasiadas consultas. Espera un minuto.' });
  const order = findOrderByBuyerToken(params.token);
  if (!order) return sendJSON(res, 404, { error: 'No encontramos esta compra. Escríbele al vendedor por WhatsApp.' });
  const aprobada = order.status === 'approved';
  const archivos = aprobada ? archivosDeCompra(order) : [];
  const base = `/api/purchase/${order.buyer_token}/download`;
  sendJSON(res, 200, {
    status: aprobada ? 'approved' : (order.status === 'rejected' ? 'rejected' : 'pending'),
    rejectReason: order.status === 'rejected' ? (order.reject_reason || '') : '',
    trackTitle: order.track_title,
    licenseType: order.license_type,
    licenseLabel: LICENSE_LABELS[order.license_type] || order.license_type,
    priceLabel: order.price_label,
    createdAt: order.created_at,
    certificateId: aprobada ? order.certificate_id : null,
    pdfUrl: aprobada ? `/api/license/${encodeURIComponent(order.certificate_id)}/pdf` : null,
    files: archivos.map(a => ({ f: a.f, label: a.etiqueta, size: a.size, url: `${base}?f=${a.f}` })),
    downloadUrl: archivos.length ? `${base}?f=${archivos[0].f}` : null,
  });
});

route('GET', '/api/purchase/:token/download', (req, res, params, query) => {
  if (!rateLimit(req, 'purchase-dl', 120, 60 * 1000)) return sendJSON(res, 429, { error: 'Demasiadas descargas seguidas. Espera un minuto.' });
  const order = findOrderByBuyerToken(params.token);
  if (!order || order.status !== 'approved') return sendJSON(res, 404, { error: 'Esta compra no existe o todavía no fue aprobada' });
  const archivos = archivosDeCompra(order);
  const pedido = String(query.get('f') || '');
  const archivo = archivos.find(a => a.f === pedido) || archivos[0];
  if (!archivo) {
    return sendJSON(res, 404, { error: 'El archivo de esta compra todavía no está disponible para descarga automática. Escríbele al vendedor.' });
  }
  const nombre = `${archivo.titulo || 'beat'} - ${archivo.etiqueta.replace(/[()]/g, '')}${archivo.ext}`;
  enviarArchivo(req, res, archivo.path, contentTypeDescarga(archivo.ext), {
    'Content-Disposition': dispositionAdjunto(nombre),
    'Cache-Control': 'private, no-store',
  });
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
  if (!rateLimit(req, 'register', 40, 60 * 60 * 1000)) {
    return sendJSON(res, 429, { error: 'Demasiados registros desde esta conexión. Intenta más tarde.' });
  }
  try {
    const body = await readBody(req, 1024 * 5);
    const { name, email, password, phone, referralCode } = JSON.parse(body.toString('utf8'));
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
    const codigo = String(referralCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const padrino = codigo ? db.prepare('SELECT id FROM producers WHERE referral_code = ?').get(codigo) : null;
    db.prepare(`INSERT INTO producers (name, email, password_hash, password_salt, active, approved, plan, contact_phone, referral_code, referred_by)
                VALUES (?, ?, ?, ?, 1, 0, 'free', ?, ?, ?)`)
      .run(cleanName, cleanEmail, hash, salt, cleanPhone, nuevoCodigoReferido(), padrino ? padrino.id : null);
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
    exclusiveEnabled: licenciasPermitidas(full).includes('exclusive'),
    licenciasPermitidas: licenciasPermitidas(full),
    puedePlaylist: planEfectivo(full).playlist,
    puedeStats: planEfectivo(full).stats,
    usdRate: tasaUsd().rate,
    referralCode: codigoReferido(full),
    plan: full.plan || 'free',
    planLabel: plan.label,
    planCommission: plan.commission,
    planMaxBeats: plan.maxBeats === Infinity ? null : plan.maxBeats,
    planPayout: plan.payout,
    planPaidUntil: full.plan_paid_until || '',
    planVigente: planVigente(full),
    diasRestantes: diasRestantesPlan(full),
    diasParaEliminar: diasParaEliminar(full),
    puedeRedes: planEfectivo(full).social,
    puedeWav: plan.wav,
    puedeStems: plan.stems,
    soloMp3: Boolean(plan.audioExt && plan.audioExt.length === 1),
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
      priceUsd: planPriceUsd(k), priceCup: planPriceCup(k), payout: v.payout, exclusiveAuto: v.exclusiveAuto,
      wav: v.wav, stems: v.stems, social: v.social, watermarkPreview: v.watermarkPreview,
      playlist: v.playlist, stats: v.stats, licenses: v.licenses,
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
    const telefono = String(contactPhone || '').replace(/[^0-9+]/g, '').slice(0, 20);
    if (telefono.replace(/[^0-9]/g, '').length < 8) {
      return sendJSON(res, 400, { error: 'Escribe tu WhatsApp completo (el administrador te contacta ahí para pagarte)' });
    }

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
        telefono,
        producer.id
      );
    sendJSON(res, 200, { ok: true, rechazadas: [...new Set(rechazadas)], monedasPermitidas: permitidas });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('POST', '/api/producer/password', async (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });
  let d;
  try { d = JSON.parse((await readBody(req, 2048)).toString('utf8')); }
  catch { return sendJSON(res, 400, { error: 'Solicitud inválida' }); }
  const full = producerFull(producer.id);
  let ok = false;
  try { ok = producerAuth.verifyPassword(String(d.current || ''), full.password_hash, full.password_salt); } catch { ok = false; }
  if (!ok) return sendJSON(res, 400, { error: 'La contraseña actual no es correcta' });
  const nueva = String(d.password || '');
  if (nueva.length < 6) return sendJSON(res, 400, { error: 'La contraseña nueva debe tener al menos 6 caracteres' });
  const { hash, salt } = producerAuth.hashPassword(nueva);
  db.prepare('UPDATE producers SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, producer.id);
  // cierra las otras sesiones abiertas (por si alguien más tenía la contraseña)
  const actual = getCookie(req, 'producer_session');
  db.prepare('DELETE FROM producer_sessions WHERE producer_id = ? AND token != ?').run(producer.id, actual || '');
  sendJSON(res, 200, { ok: true });
});

// Teléfono del administrador para el enlace «¿Olvidaste tu contraseña?»
route('GET', '/api/contact', (req, res) => {
  sendJSON(res, 200, { adminPhone: telefonoAdmin() });
});

route('GET', '/api/producer/avatar/:id', async (req, res, params, query) => {
  const row = db.prepare('SELECT avatar_filename FROM producers WHERE id = ?').get(params.id);
  if (!row || !row.avatar_filename) return sendJSON(res, 404, { error: 'Sin foto' });
  await servirImagen(req, res, UPLOADS_COVERS, row.avatar_filename, query, 600);
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

// Activa o extiende un plan: si ya tenía ese mismo plan vigente, los meses se suman a su fecha.
function activarPlan(p, plan, months) {
  const hoy = hoyISO();
  const mismoPlanVigente = p.plan === plan && p.plan_paid_until && p.plan_paid_until >= hoy;
  const base = mismoPlanVigente ? p.plan_paid_until : hoy;
  const hasta = sumarMeses(base, months);
  db.prepare("UPDATE producers SET plan = ?, plan_paid_until = ?, approved = 1, active = CASE WHEN disabled_reason = 'plan_vencido' THEN 1 ELSE active END, disabled_reason = CASE WHEN disabled_reason = 'plan_vencido' THEN '' ELSE disabled_reason END WHERE id = ?")
    .run(plan, hasta, p.id);
  return { hasta, extendido: Boolean(mismoPlanVigente) };
}

// Lo que cuesta un plan en la moneda de una billetera (con la tasa de venta del admin).
function costoPlanEn(precioCup, moneda) {
  if (moneda === 'CUP') return { ok: true, unidades: precioCup, tasa: 1 };
  const r = ratesMap()[moneda];
  const tasa = r ? Number(r.cupPerUnit) || 0 : 0;
  if (!(tasa > 0)) return { ok: false };
  // se redondea hacia arriba para no cobrar de menos
  const dec = MONEDAS_SIN_DECIMALES.includes(moneda) ? 0 : 2;
  const f = Math.pow(10, dec);
  return { ok: true, unidades: Math.ceil((precioCup / tasa) * f - 1e-9) / f, tasa };
}

// El productor paga (o renueva) su plan con el saldo que tiene en el portal: se activa al instante.
route('POST', '/api/producer/plan-con-saldo', async (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });
  let d;
  try { d = JSON.parse((await readBody(req, 2048)).toString('utf8') || '{}'); }
  catch { return sendJSON(res, 400, { error: 'Solicitud inválida' }); }
  const plan = String(d.plan || '');
  const months = parseInt(d.months, 10);
  const moneda = String(d.wallet || 'CUP').slice(0, 30);
  if (plan !== 'pro' && plan !== 'studio') return sendJSON(res, 400, { error: 'Elige el plan Pro o Studio' });
  if (!PLAN_MESES_PERMITIDOS.includes(months)) return sendJSON(res, 400, { error: 'Elige cuántos meses vas a pagar' });
  const precioMes = planPriceCup(plan);
  if (!precioMes) return sendJSON(res, 400, { error: 'El administrador todavía no puso precio a ese plan' });
  const totalCup = precioMes * months;
  const costo = costoPlanEn(totalCup, moneda);
  if (!costo.ok) return sendJSON(res, 400, { error: 'El administrador no tiene tasa para esa moneda. Elige otro saldo.' });

  acreditarBonos(producer.id);
  const saldo = saldoDisponible(producer.id);
  const b = saldo.billeteras.find(x => x.code === moneda);
  if (!b || b.unidades + 1e-9 < costo.unidades) {
    return sendJSON(res, 400, { error: `Tu saldo en ${etiquetaMoneda(moneda)} no alcanza: el plan cuesta ${costo.unidades} y tienes ${b ? b.unidades : 0}.` });
  }
  const full = producerFull(producer.id);
  const nombre = PRODUCER_PLANS[plan].label;
  const { hasta, extendido } = activarPlan(full, plan, months);
  db.prepare("INSERT INTO producer_credits (producer_id, kind, amount_cup, detail, currency, amount_units) VALUES (?, 'plan', ?, ?, ?, ?)")
    .run(producer.id, -totalCup, `Plan ${nombre} · ${months} ${months === 1 ? 'mes' : 'meses'} pagado con tu saldo`, moneda, -costo.unidades);
  db.prepare(`INSERT INTO plan_requests (producer_id, plan, months, amount_cup, currency, receipt_filename, status, paid_until_result, resolved_at)
              VALUES (?, ?, ?, ?, ?, '', 'approved', ?, datetime('now'))`)
    .run(producer.id, plan, months, totalCup, `Saldo ${etiquetaMoneda(moneda)}`, hasta);
  const previewsSinMarca = quitarMarcaDePreviews(producer.id);
  sendJSON(res, 201, { ok: true, plan, paidUntil: hasta, extendido, cobrado: costo.unidades, moneda: etiquetaMoneda(moneda), previewsSinMarca });
});

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
    ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC, r.id DESC
    LIMIT 300
  `).all();
  const oc = clavesOcultas('admin:planes');
  sendJSON(res, 200, { requests: rows.filter(r => r.status === 'pending' || !oc.has('plan:' + r.id)), ocultos: contarOcultas('admin:planes') });
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

  const { hasta, extendido } = activarPlan(p, r.plan, r.months);
  db.prepare("UPDATE plan_requests SET status = 'approved', paid_until_result = ?, resolved_at = datetime('now') WHERE id = ?").run(hasta, r.id);
  const previewsLimpios = quitarMarcaDePreviews(r.producer_id);
  sendJSON(res, 200, { ok: true, plan: r.plan, paidUntil: hasta, extendido, previewsSinMarca: previewsLimpios });
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
    SELECT id, name, bio, avatar_filename, social_links_json, plan, plan_paid_until
    FROM producers WHERE approved = 1 AND active = 1 ORDER BY name ASC
  `).all();
  const producers = rows.map(r => {
    let social = [];
    if (planEfectivo(r).social) {
      try { social = JSON.parse(r.social_links_json || '[]'); } catch {}
    }
    const beats = db.prepare("SELECT COUNT(*) as c FROM tracks WHERE producer_id = ? AND approval_status = 'approved' AND sold = 0").get(r.id).c;
    return { id: r.id, name: r.name, bio: r.bio || '', avatar: r.avatar_filename || '', socialLinks: social, beats };
  });
  sendJSON(res, 200, { producers });
});

route('GET', '/api/producers/:id/tracks', (req, res, params) => {
  const prod = db.prepare('SELECT id, name, bio, avatar_filename, social_links_json, plan, plan_paid_until FROM producers WHERE id = ? AND approved = 1 AND active = 1').get(params.id);
  if (!prod) return sendJSON(res, 404, { error: 'Productor no encontrado' });
  let social = [];
  if (planEfectivo(prod).social) {
    try { social = JSON.parse(prod.social_links_json || '[]'); } catch {}
  }
  let tracks = db.prepare(`
    SELECT id, title, genre, description, cover_filename, duration_seconds, plays, likes,
           price_label, price_cup, for_sale, is_exclusive, sold, created_at, producer_id
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
  if (!rateLimit(req, 'orders', 40, 60 * 60 * 1000)) {
    return sendJSON(res, 429, { error: 'Demasiados comprobantes desde esta conexión. Espera un rato y vuelve a intentar.' });
  }
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
  if (buyerPhone.replace(/[^0-9]/g, '').length < 8) {
    return sendJSON(res, 400, { error: 'Escribe un teléfono válido (con WhatsApp) para poder contactarte' });
  }
  const vipPublico = licenseType === 'exclusive' && (fields.vipPublic === '1' || fields.vipPublic === 'true') ? 1 : 0;

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
  if (!pistaVisible(track)) {
    return sendJSON(res, 403, { error: 'Esta pista ya no está disponible' });
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
  // Lo que el comprador pagó en SU moneda, con la tasa de ese momento (va a la billetera del productor en esa moneda)
  const pago = montoEnMoneda(priceCupAtSale, currency);

  const buyerToken = crypto.randomBytes(24).toString('hex');
  db.prepare(`
    INSERT INTO orders (track_id, track_title, price_label, currency, buyer_name, buyer_phone, receipt_filename,
                         producer_id, price_cup_at_sale, commission_percent_at_sale, producer_earning_cup, license_type, buyer_token, vip_public,
                         wallet_currency, paid_units, rate_at_sale, producer_earning_units)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    track.id, track.title, displayedPrice || `${priceCupAtSale} CUP`, currency, buyerName, buyerPhone, receiptFilename,
    track.producer_id || null, priceCupAtSale, commissionPercent, redondear(producerEarning), licenseType, buyerToken, vipPublico,
    pago.moneda, pago.unidades, pago.tasa, track.producer_id ? redondearMoneda(pago.unidades * (1 - commissionPercent / 100), pago.moneda) : 0
  );

  sendJSON(res, 201, { ok: true, orderToken: buyerToken });
});

const reproduccionesRecientes = new Map();
setInterval(() => {
  const ahora = Date.now();
  for (const [k, t] of reproduccionesRecientes) if (ahora - t > 10 * 60 * 1000) reproduccionesRecientes.delete(k);
}, 5 * 60 * 1000).unref();

route('POST', '/api/tracks/:id/token', (req, res, params) => {
  const track = db.prepare('SELECT id, approval_status, producer_id, sold FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });
  if (track.approval_status !== 'approved') return sendJSON(res, 403, { error: 'Esta pista todavía no está disponible' });
  if (!track.sold && !pistaVisible(track)) return sendJSON(res, 403, { error: 'Esta pista ya no está disponible' });
  if (!rateLimit(req, 'stream-token', 600, 60 * 1000)) return sendJSON(res, 429, { error: 'Demasiadas reproducciones seguidas. Espera un momento.' });
  const token = issueStreamToken(track.id);
  // una reproducción por conexión y pista cada 10 minutos (las estadísticas no se inflan con recargas)
  const clave = `${clientIp(req)}|${track.id}`;
  if (!reproduccionesRecientes.has(clave)) {
    db.prepare('UPDATE tracks SET plays = plays + 1 WHERE id = ?').run(track.id);
  }
  reproduccionesRecientes.set(clave, Date.now());
  sendJSON(res, 200, { token, expiresInSeconds: 1800 });
});

// Un "me gusta" por dispositivo y pista; además límite por IP para frenar trampas (los likes dan bonos en Studio).
async function leerVotante(req) {
  try {
    const body = await readBody(req, 1024);
    const d = body.length ? JSON.parse(body.toString('utf8')) : {};
    const id = String(d.voterId || '').slice(0, 80);
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(id)) return null;
    return crypto.createHash('sha256').update('zb-like|' + id).digest('hex');
  } catch { return null; }
}

route('POST', '/api/tracks/:id/like', async (req, res, params) => {
  const track = db.prepare('SELECT id, likes, producer_id FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });
  const voter = await leerVotante(req);
  if (!voter) return sendJSON(res, 400, { error: 'Solicitud inválida' });
  if (!rateLimit(req, 'like', 300, 60 * 60 * 1000)) return sendJSON(res, 429, { error: 'Demasiados me gusta seguidos. Intenta más tarde.' });
  const r = db.prepare('INSERT OR IGNORE INTO track_likes (track_id, voter) VALUES (?, ?)').run(track.id, voter);
  if (r.changes) db.prepare('UPDATE tracks SET likes = likes + 1 WHERE id = ?').run(track.id);
  const likes = db.prepare('SELECT likes FROM tracks WHERE id = ?').get(track.id).likes;
  if (r.changes && track.producer_id) { try { acreditarBonos(track.producer_id); } catch (e) { console.error(e); } }
  sendJSON(res, 200, { likes });
});

route('POST', '/api/tracks/:id/unlike', async (req, res, params) => {
  const track = db.prepare('SELECT id FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });
  const voter = await leerVotante(req);
  if (!voter) return sendJSON(res, 400, { error: 'Solicitud inválida' });
  const r = db.prepare('DELETE FROM track_likes WHERE track_id = ? AND voter = ?').run(track.id, voter);
  if (r.changes) db.prepare('UPDATE tracks SET likes = MAX(0, likes - 1) WHERE id = ?').run(track.id);
  const likes = db.prepare('SELECT likes FROM tracks WHERE id = ?').get(track.id).likes;
  sendJSON(res, 200, { likes });
});

// solo playlist puede descargarse
route('GET', '/api/download/:id', (req, res, params) => {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });
  if (!track.is_playlist) return sendJSON(res, 403, { error: 'Esta pista no está disponible para descarga' });
  if (track.approval_status !== 'approved') return sendJSON(res, 403, { error: 'Esta pista todavía no está disponible' });
  if (!pistaVisible(track)) return sendJSON(res, 403, { error: 'Esta pista ya no está disponible' });
  // se descarga el MP3 de 320 kbps si existe; si no, el preview
  let filePath = path.join(UPLOADS_AUDIO, track.audio_filename);
  if (track.mp3_filename && fs.existsSync(path.join(UPLOADS_MASTERS, track.mp3_filename))) filePath = path.join(UPLOADS_MASTERS, track.mp3_filename);
  const ext = path.extname(filePath).toLowerCase();
  enviarArchivo(req, res, filePath, contentTypeForAudio(ext), { 'Content-Disposition': dispositionAdjunto(`${track.title}${ext}`) });
});

route('GET', '/api/stream/:id', (req, res, params, query) => {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });
  const token = query.get('t');
  if (!token || !validateStreamToken(token, track.id)) {
    return sendJSON(res, 403, { error: 'Token inválido o expirado' });
  }
  const ext = path.extname(track.audio_filename).toLowerCase();
  enviarArchivo(req, res, path.join(UPLOADS_AUDIO, track.audio_filename), contentTypeForAudio(ext), {
    'Content-Disposition': 'inline',
    'Cache-Control': 'no-store',
  });
});

route('GET', '/api/cover/:id', async (req, res, params, query) => {
  const track = db.prepare('SELECT cover_filename FROM tracks WHERE id = ?').get(params.id);
  if (!track || !track.cover_filename) return sendJSON(res, 404, { error: 'Sin portada' });
  await servirImagen(req, res, UPLOADS_COVERS, track.cover_filename, query, 7 * 86400);
});

route('GET', '/api/avatar', async (req, res, params, query) => {
  const profile = db.prepare('SELECT avatar_filename FROM profile WHERE id = 1').get();
  if (!profile || !profile.avatar_filename) return sendJSON(res, 404, { error: 'Sin avatar' });
  await servirImagen(req, res, UPLOADS_COVERS, profile.avatar_filename, query, 600);
});

route('POST', '/api/admin/login', async (req, res) => {
  if (EN_PRODUCCION && PASSWORD_DE_EJEMPLO) {
    return sendJSON(res, 503, { error: 'Por seguridad el panel está bloqueado: pon la variable ADMIN_PASSWORD (una contraseña tuya) en Railway > Variables y vuelve a entrar.' });
  }
  const clave = 'admin-login-fallo|' + clientIp(req);
  if (limiteAlcanzado(clave, 10)) {
    return sendJSON(res, 429, { error: 'Demasiados intentos fallidos. Espera 15 minutos.' });
  }
  try {
    const body = await readBody(req, 1024 * 10);
    const { password } = JSON.parse(body.toString('utf8'));
    const a = Buffer.from(String(password || ''));
    const b = Buffer.from(ADMIN_PASSWORD);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) {
      sumarIntento(clave, 15 * 60 * 1000);
      return sendJSON(res, 401, { error: 'Contraseña incorrecta' });
    }
    limpiarIntentos(clave);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': cookieSegura(req, 'admin_session', signSession(), 43200),
    });
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('POST', '/api/admin/logout', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': cookieSegura(req, 'admin_session', '', 0),
  });
  res.end(JSON.stringify({ ok: true }));
});

route('GET', '/api/admin/check', (req, res) => {
  sendJSON(res, 200, { authenticated: isAdminAuthed(req) });
});

route('POST', '/api/producer/login', async (req, res) => {
  const claveIp = 'plogin-ip|' + clientIp(req);
  if (limiteAlcanzado(claveIp, 60)) {
    return sendJSON(res, 429, { error: 'Demasiados intentos fallidos desde esta conexión. Espera 15 minutos.' });
  }
  try {
    const body = await readBody(req, 1024 * 10);
    const { email, password } = JSON.parse(body.toString('utf8'));
    const correo = String(email || '').trim().toLowerCase().slice(0, 120);
    const claveCorreo = 'plogin-mail|' + correo;
    if (limiteAlcanzado(claveCorreo, 8)) {
      return sendJSON(res, 429, { error: 'Demasiados intentos con este correo. Espera 15 minutos o pídele al administrador que te cambie la contraseña.' });
    }
    const producer = db.prepare('SELECT * FROM producers WHERE email = ?').get(correo);
    let valid = false;
    if (producer) {
      try { valid = producerAuth.verifyPassword(String(password || ''), producer.password_hash, producer.password_salt); } catch { valid = false; }
    }
    if (!valid) {
      sumarIntento(claveIp, 15 * 60 * 1000);
      sumarIntento(claveCorreo, 15 * 60 * 1000);
      return sendJSON(res, 401, { error: 'Correo o contraseña incorrectos' });
    }
    limpiarIntentos(claveCorreo);
    if (!producer.approved) {
      return sendJSON(res, 403, { error: 'Tu cuenta todavía está esperando la aprobación del administrador.' });
    }
    if (!producer.active && producer.disabled_reason !== 'plan_vencido') {
      const cfgTel = db.prepare('SELECT admin_phone FROM platform_config WHERE id = 1').get();
      const pinfo = db.prepare('SELECT contact_phone FROM payment_info WHERE id = 1').get();
      const tel = (cfgTel && cfgTel.admin_phone) || (pinfo && pinfo.contact_phone) || '';
      return sendJSON(res, 403, {
        error: 'Su cuenta ha sido desactivada. Contacte con el administrador.',
        desactivada: true,
        adminPhone: tel,
      });
    }
    const token = producerAuth.createProducerSession(producer.id);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': cookieSegura(req, 'producer_session', token, 604800),
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
    'Set-Cookie': cookieSegura(req, 'producer_session', '', 0),
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
  const tracks = db.prepare('SELECT * FROM tracks WHERE producer_id = ? ORDER BY created_at DESC').all(producer.id).map(t => ({
    id: t.id, title: t.title, genre: t.genre, description: t.description, artist_credit: t.artist_credit,
    cover_filename: t.cover_filename, plays: t.plays, likes: t.likes, price_label: t.price_label, price_cup: t.price_cup,
    is_playlist: t.is_playlist, is_exclusive: t.is_exclusive, sold: t.sold, approval_status: t.approval_status,
    rejection_reason: t.rejection_reason, created_at: t.created_at, duration_seconds: t.duration_seconds,
    licenses: getTrackLicenses(t.id),
    archivos: archivosDePista(t),
    ventas: db.prepare("SELECT COUNT(*) as c FROM orders WHERE track_id = ? AND status = 'approved'").get(t.id).c,
  }));
  sendJSON(res, 200, { tracks });
});

// El productor corrige su beat: título, género, descripción y precios.
// Si estaba rechazado, al corregirlo vuelve a revisión.
route('POST', '/api/producer/tracks/:id', async (req, res, params) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });
  const track = db.prepare('SELECT * FROM tracks WHERE id = ? AND producer_id = ?').get(params.id, producer.id);
  if (!track) return sendJSON(res, 404, { error: 'Beat no encontrado' });
  if (track.sold) return sendJSON(res, 409, { error: 'Este beat ya se vendió con licencia única y no se puede editar.' });
  let d;
  try { d = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8')); }
  catch { return sendJSON(res, 400, { error: 'Solicitud inválida' }); }
  const full = producerFull(producer.id);
  const titulo = limpiarTexto(d.title, 120);
  if (!titulo) return sendJSON(res, 400, { error: 'El título no puede quedar vacío' });

  if (!track.is_playlist) {
    const precios = parseLicensePrices(d);
    const permitidas = licenciasPermitidas(full);
    const noPermitidas = LICENSE_TYPES.filter(t => precios[t] > 0 && !permitidas.includes(t));
    if (noPermitidas.length) {
      return sendJSON(res, 403, { error: `Tu plan ${getPlan(full).label} no permite vender: ${noPermitidas.map(t => LICENSE_LABELS[t] || t).join(', ')}.` });
    }
    const validacion = validateLicenseCombination(precios);
    if (!validacion.ok) return sendJSON(res, 400, { error: validacion.error });
    const falta = faltanArchivosPara(precios, archivosDePista(track));
    if (falta) return sendJSON(res, 400, { error: falta + ' Súbelo de nuevo como un beat nuevo con todos los archivos.' });
    if (validacion.isExclusive) {
      const vendidas = db.prepare("SELECT COUNT(*) as c FROM orders WHERE track_id = ? AND status = 'approved'").get(track.id).c;
      if (vendidas > 0) return sendJSON(res, 409, { error: 'No puedes volver exclusivo un beat que ya vendió licencias normales.' });
    }
    aplicarPrecios(track.id, precios, validacion);
  }
  const volverARevision = track.approval_status === 'rejected';
  db.prepare(`UPDATE tracks SET title = ?, genre = ?, description = ?, artist_credit = ?,
              approval_status = CASE WHEN ? THEN 'pending' ELSE approval_status END,
              rejection_reason = CASE WHEN ? THEN '' ELSE rejection_reason END WHERE id = ?`)
    .run(titulo, limpiarTexto(d.genre, 60), limpiarTexto(d.description, 1000), track.is_playlist ? limpiarTexto(d.artistCredit, 120) : '',
      volverARevision ? 1 : 0, volverARevision ? 1 : 0, track.id);
  sendJSON(res, 200, { ok: true, reenviado: volverARevision });
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
  const pendientes = db.prepare("SELECT COUNT(*) as c FROM orders WHERE track_id = ? AND status = 'pending'").get(params.id).c;
  if (pendientes > 0) {
    return sendJSON(res, 409, { error: 'Este beat tiene una compra esperando aprobación. Espera a que el administrador la resuelva.' });
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

  acreditarBonos(producer.id);
  const saldo = saldoDisponible(producer.id);
  const paidCup = redondear(
    db.prepare("SELECT COALESCE(SUM(amount_cup),0) as t FROM producer_withdrawals WHERE producer_id = ? AND status = 'paid'").get(producer.id).t +
    approved.filter(o => o.producer_paid && !o.withdrawal_id).reduce((s, o) => s + (o.producer_earning_cup || 0), 0));
  const enRetiro = retiroPendiente(producer.id);

  sendJSON(res, 200, {
    summary: {
      totalSales: approved.length,
      totalSalesCup,
      totalEarningsCup,
      availableCup: saldo.total,
      bonusCup: saldo.totalBonos,
      inWithdrawalCup: enRetiro ? enRetiro.amount_cup : 0,
      paidCup,
      billeteras: saldo.billeteras.map(b => ({ code: b.code, label: b.label, unidades: b.unidades, cupEquivalente: b.cupEquivalente })),
    },
    orders: orders.map(o => ({ ...o, buyer_phone: undefined, buyer_token: undefined, receipt_filename: undefined, wallet_label: etiquetaMoneda(o.wallet_currency || 'CUP') })),
  });
});

function borrarArchivosTrack(t) {
  borrarMiniaturas(t.cover_filename);
  const pares = [[UPLOADS_AUDIO, t.audio_filename], [UPLOADS_COVERS, t.cover_filename], [UPLOADS_MASTERS, t.master_filename],
                 [UPLOADS_MASTERS, t.stems_filename], [UPLOADS_MASTERS, t.wav_filename], [UPLOADS_MASTERS, t.mp3_filename]];
  for (const [dir, file] of pares) {
    if (!file) continue;
    try { const fp = path.join(dir, file); if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch { /* ya no existe */ }
  }
}

// Lee la calidad (kbps) de un MP3 sin librerías: primer frame + cabecera Xing si es VBR.
// buf empieza donde empieza el audio (después de la etiqueta ID3); totalBytes es el tamaño del audio.
function mp3Kbps(buf, totalBytes) {
  try {
    const BR = {
      '1-1': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
      '2-1': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    };
    const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
    const limite = buf.length - 4;
    for (let i = 0; i < limite; i++) {
      if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
      const version = (buf[i + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
      const layer = (buf[i + 1] >> 1) & 3;   // 1 = Layer III
      const brIdx = (buf[i + 2] >> 4) & 15;
      const srIdx = (buf[i + 2] >> 2) & 3;
      if (version === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) continue;
      const tabla = version === 3 ? BR['1-1'] : BR['2-1'];
      const kbps = tabla[brIdx];
      const sampleRate = SR[version][srIdx];
      const mono = ((buf[i + 3] >> 6) & 3) === 3;
      const sideInfo = version === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17);
      const x = i + 4 + sideInfo;
      if (x + 12 <= buf.length && buf.toString('latin1', x, x + 4) === 'Xing') {
        const flags = buf.readUInt32BE(x + 4);
        if (flags & 1) {
          const frames = buf.readUInt32BE(x + 8);
          const muestras = version === 3 ? 1152 : 576;
          const segundos = frames * muestras / sampleRate;
          if (segundos > 0) return Math.round((totalBytes * 8) / segundos / 1000);
        }
      }
      return kbps;
    }
  } catch { /* no se pudo leer: se deja pasar */ }
  return 0;
}

function mp3KbpsArchivo(filePath, size) {
  try {
    let inicio = 0;
    const cab = leerTrozo(filePath, 0, 10);
    if (cab.length === 10 && cab.toString('latin1', 0, 3) === 'ID3') {
      inicio = 10 + (((cab[6] & 0x7f) << 21) | ((cab[7] & 0x7f) << 14) | ((cab[8] & 0x7f) << 7) | (cab[9] & 0x7f));
    }
    return mp3Kbps(leerTrozo(filePath, inicio, 128 * 1024), Math.max(0, size - inicio));
  } catch { return 0; }
}

// Crea una pista a partir de archivos ya subidos por partes. Valida TODO antes de tocar los archivos,
// así si falta algo (por ejemplo el WAV) la persona corrige y reenvía sin volver a subir el resto.
async function crearPistaDesdeSubidas(d, owner, opts = {}) {
  const titulo = limpiarTexto(d.title, 120);
  if (!titulo) throw { status: 400, error: 'Ponle título al beat' };
  const genero = limpiarTexto(d.genre, 60);
  const descripcion = limpiarTexto(d.description, 1000);
  const credito = limpiarTexto(d.artistCredit, 120);
  const esPlaylist = d.isPlaylist === true || d.isPlaylist === 1 || d.isPlaylist === '1' || d.isPlaylist === 'true';
  if (esPlaylist && opts.allowPlaylist === false) throw { status: 403, error: 'La Playlist es solo del plan Studio.' };

  const precios = esPlaylist ? { basic: 0, premium: 0, unlimited: 0, exclusive: 0 } : parseLicensePrices(d);
  let validacion = { ok: true, offered: [], isExclusive: false };
  if (!esPlaylist) {
    if (opts.allowedLicenses) {
      const noPermitidas = LICENSE_TYPES.filter(t => precios[t] > 0 && !opts.allowedLicenses.includes(t));
      if (noPermitidas.length) {
        throw { status: 403, error: `Tu plan ${opts.planLabel} no permite vender: ${noPermitidas.map(t => LICENSE_LABELS[t] || t).join(', ')}.` };
      }
    }
    validacion = validateLicenseCombination(precios);
    if (!validacion.ok) throw { status: 400, error: validacion.error };
  }

  const audio = tomarSubida(d.audioUploadId, owner, 'audio');
  if (!audio) throw { status: 400, error: 'Falta el archivo de audio' };
  const cover = tomarSubida(d.coverUploadId, owner, 'cover');
  if (!cover) throw { status: 400, error: 'La portada es obligatoria. Sube una imagen cuadrada de 3000x3000 px.' };
  const wav = esPlaylist ? null : tomarSubida(d.wavUploadId, owner, 'wav');
  const stems = esPlaylist ? null : tomarSubida(d.stemsUploadId, owner, 'stems');

  if (opts.audioExt && !opts.audioExt.includes(audio.ext)) {
    throw { status: 403, error: opts.audioExt.length === 1
      ? `Tu plan ${opts.planLabel} solo permite subir audio en MP3 (320 kbps).`
      : `Tu plan ${opts.planLabel} permite subir el audio en MP3 (320 kbps) o WAV.` };
  }
  if (wav && opts.allowWav === false) throw { status: 403, error: `Tu plan ${opts.planLabel} no incluye entrega en WAV. Sube al plan Pro o Studio.` };
  if (stems && opts.allowStems === false) throw { status: 403, error: `Tu plan ${opts.planLabel} no incluye STEMS. Solo el plan Studio permite subir STEMS.` };

  const hayWav = Boolean(wav) || audio.ext === '.wav';
  if (!esPlaylist) {
    if (precios.premium > 0 && !hayWav) throw { status: 400, error: 'Pusiste precio a la licencia Premium: sube el archivo WAV (es obligatorio).' };
    if ((precios.unlimited > 0 || precios.exclusive > 0) && (!hayWav || !stems)) {
      throw { status: 400, error: 'Pusiste precio a la licencia Ilimitada o Exclusiva: sube el WAV y los STEMS, son obligatorios.' };
    }
  }
  if (opts.requireMp3_320 && audio.ext === '.mp3') {
    const kbps = mp3KbpsArchivo(audio.path, audio.size);
    if (kbps && kbps < 310) throw { status: 400, error: `El MP3 tiene que ser de 320 kbps y este es de ${kbps} kbps. Expórtalo de nuevo a 320 kbps.` };
  }

  // --- a partir de aquí se mueven archivos: si algo falla se deshace todo
  return conCupoAudio(() => procesarPista({ titulo, genero, descripcion, credito, esPlaylist, precios, validacion, audio, cover, wav, stems }, opts));
}

async function procesarPista({ titulo, genero, descripcion, credito, esPlaylist, precios, validacion, audio, cover, wav, stems }, opts) {
  const creados = [];
  const quitarCreados = () => {
    for (const [dir, f] of creados) { try { fs.unlinkSync(path.join(dir, f)); } catch { /* nada */ } }
  };
  try {
    const masterFilename = moverSubida(audio, UPLOADS_MASTERS, 'master-');
    creados.push([UPLOADS_MASTERS, masterFilename]);
    const masterPath = path.join(UPLOADS_MASTERS, masterFilename);
    const masterHash = await hashArchivo(masterPath);

    const coverFilename = moverSubida(cover, UPLOADS_COVERS, '');
    creados.push([UPLOADS_COVERS, coverFilename]);

    let wavFilename = '', wavHash = '';
    if (wav) {
      wavFilename = moverSubida(wav, UPLOADS_MASTERS, 'wav-');
      creados.push([UPLOADS_MASTERS, wavFilename]);
      wavHash = await hashArchivo(path.join(UPLOADS_MASTERS, wavFilename));
    } else if (audio.ext === '.wav' && !esPlaylist) {
      wavFilename = masterFilename; wavHash = masterHash;
    }

    let stemsFilename = '', stemsHash = '';
    if (stems) {
      stemsFilename = moverSubida(stems, UPLOADS_MASTERS, 'stems-');
      creados.push([UPLOADS_MASTERS, stemsFilename]);
      stemsHash = await hashArchivo(path.join(UPLOADS_MASTERS, stemsFilename));
    }

    // MP3 que recibe el comprador (o que se descarga gratis en la Playlist):
    // si el audio principal no era MP3, se convierte a 320 kbps.
    let mp3Filename = '', mp3Hash = '';
    if (audio.ext === '.mp3') { mp3Filename = masterFilename; mp3Hash = masterHash; }
    else {
      const nombre = `mp3-${crypto.randomUUID()}.mp3`;
      try {
        await transcodificarMp3(masterPath, path.join(UPLOADS_MASTERS, nombre), 320);
        creados.push([UPLOADS_MASTERS, nombre]);
        mp3Filename = nombre;
        mp3Hash = await hashArchivo(path.join(UPLOADS_MASTERS, nombre));
      } catch (e) { console.error('No se pudo crear el MP3 de entrega:', e.message); }
    }

    // Preview que escucha el público: MP3 de 192 kbps (liviano para los datos móviles)
    const wm = db.prepare('SELECT * FROM watermark_config WHERE id = 1').get();
    let audioFilename = `${crypto.randomUUID()}.mp3`;
    const previewPath = path.join(UPLOADS_AUDIO, audioFilename);
    const conMarca = Boolean(opts.watermark && wm && wm.voice_filename);
    if (conMarca) {
      try {
        await applyWatermark({
          inputPath: masterPath,
          watermarkPath: path.join(UPLOADS_WATERMARK, wm.voice_filename),
          outputPath: previewPath,
          intervalSeconds: wm.interval_seconds,
          volume: wm.volume,
          kbps: 192,
        });
        creados.push([UPLOADS_AUDIO, audioFilename]);
      } catch (e) {
        console.error('Marca de agua:', e.message);
        throw { status: 500, error: 'No se pudo procesar el audio con la marca de agua. Verifica que el archivo no esté dañado.' };
      }
    } else {
      try {
        await transcodificarMp3(masterPath, previewPath, 192);
        creados.push([UPLOADS_AUDIO, audioFilename]);
      } catch (e) {
        // sin ffmpeg: se sirve una copia del original
        audioFilename = `${crypto.randomUUID()}${audio.ext}`;
        fs.copyFileSync(masterPath, path.join(UPLOADS_AUDIO, audioFilename));
        creados.push([UPLOADS_AUDIO, audioFilename]);
      }
    }

    let duracion = 0;
    try { duracion = Math.round(await getDurationSeconds(masterPath)); } catch { duracion = 0; }

    return {
      titulo, genero, descripcion, credito, esPlaylist, precios, validacion,
      masterFilename, masterHash, coverFilename, wavFilename, wavHash, stemsFilename, stemsHash,
      mp3Filename, mp3Hash, audioFilename, duracion, conMarca,
      deshacer: quitarCreados,
    };
  } catch (err) {
    quitarCreados();
    throw err;
  }
}

function archivosDePista(t) {
  const existe = (f) => { if (!f) return false; try { return fs.statSync(path.join(UPLOADS_MASTERS, f)).isFile(); } catch { return false; } };
  return { wav: existe(t.wav_filename), stems: existe(t.stems_filename), mp3: existe(t.mp3_filename || t.master_filename) };
}

// Revisa que cada licencia con precio tenga el archivo que entrega.
function faltanArchivosPara(precios, archivos) {
  if (precios.premium > 0 && !archivos.wav) return 'La licencia Premium entrega el WAV y este beat no tiene WAV subido.';
  if ((precios.unlimited > 0 || precios.exclusive > 0) && (!archivos.wav || !archivos.stems)) {
    return 'Las licencias Ilimitada y Exclusiva entregan WAV y STEMS, y este beat no los tiene subidos.';
  }
  return null;
}

function aplicarPrecios(trackId, precios, validacion) {
  const { lowest, label } = etiquetaPrecio(precios, validacion);
  db.prepare('UPDATE tracks SET price_label = ?, price_cup = ?, for_sale = 1, is_exclusive = ? WHERE id = ?')
    .run(label, lowest, validacion.isExclusive ? 1 : 0, trackId);
  saveLicensesForTrack(trackId, precios);
}

function etiquetaPrecio(precios, validacion) {
  const ofrecidas = validacion.offered || [];
  if (!ofrecidas.length) return { lowest: 0, label: '' };
  const lowest = Math.min(...ofrecidas.map(t => precios[t]));
  if (validacion.isExclusive) return { lowest: precios.exclusive, label: `${precios.exclusive} CUP` };
  return { lowest, label: ofrecidas.length > 1 ? `Desde ${lowest} CUP` : `${lowest} CUP` };
}

function insertarPista(r, { producerId, estado }) {
  const { lowest, label } = etiquetaPrecio(r.precios, r.validacion);
  const result = db.prepare(`
    INSERT INTO tracks (title, genre, description, artist_credit, audio_filename, cover_filename,
                        price_label, price_cup, for_sale, is_playlist, is_exclusive, producer_id, approval_status,
                        master_filename, master_hash, stems_filename, stems_hash, wav_filename, wav_hash,
                        mp3_filename, mp3_hash, duration_seconds, preview_marca)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    r.titulo, r.genero, r.descripcion, r.esPlaylist ? r.credito : '', r.audioFilename, r.coverFilename,
    label, lowest, r.esPlaylist ? 0 : 1, r.esPlaylist ? 1 : 0, r.validacion.isExclusive ? 1 : 0, producerId, estado,
    r.masterFilename, r.masterHash, r.stemsFilename, r.stemsHash, r.wavFilename, r.wavHash,
    r.mp3Filename, r.mp3Hash, r.duracion, r.conMarca ? 1 : 0
  );
  const trackId = Number(result.lastInsertRowid);
  if (!r.esPlaylist) saveLicensesForTrack(trackId, r.precios);
  return trackId;
}

const PRODUCER_PLANS = {
  free: {
    label: 'Free', commission: 30, maxBeats: 5, watermarkPreview: true, exclusiveAuto: false,
    payout: '7-14 días', payoutDays: 14, audioExt: ['.mp3'], wav: false, stems: false,
    social: false, playlist: false, stats: false, licenses: ['basic'],
  },
  pro: {
    label: 'Pro', commission: 20, maxBeats: 50, watermarkPreview: false, exclusiveAuto: false,
    payout: '3 días', payoutDays: 3, audioExt: ['.mp3', '.wav'], wav: true, stems: false,
    social: true, playlist: false, stats: true, licenses: ['basic', 'premium'],
  },
  studio: {
    label: 'Studio', commission: 10, maxBeats: Infinity, watermarkPreview: false, exclusiveAuto: true,
    payout: '24 horas', payoutDays: 1, audioExt: ['.mp3', '.wav'], wav: true, stems: true,
    social: true, playlist: true, stats: true, licenses: ['basic', 'premium', 'unlimited', 'exclusive'],
  },
};

// Licencias que el productor puede vender hoy (Pro puede tener la Exclusiva si el admin se la habilitó a mano)
function licenciasPermitidas(full) {
  const plan = planEfectivo(full);
  const lista = plan.licenses.slice();
  if (!lista.includes('exclusive') && full && full.exclusive_enabled && (full.plan || 'free') !== 'free' && planVigente(full)) lista.push('exclusive');
  return lista;
}

function tasaUsd() {
  const row = db.prepare('SELECT rates_json FROM exchange_rates WHERE id = 1').get();
  let rates = [];
  try { rates = JSON.parse(row.rates_json || '[]'); } catch { rates = []; }
  for (const code of ['USD', 'USDT_TRC20', 'USDT_BEP20', 'USDT_POLYGON']) {
    const r = rates.find(x => x.code === code && Number(x.cupPerUnit) > 0);
    if (r) return { code, rate: Number(r.cupPerUnit) };
  }
  return { code: '', rate: 0 };
}

function planPriceUsd(planKey) {
  if (planKey === 'free') return 0;
  const cfg = db.prepare('SELECT plan_price_pro_usd, plan_price_studio_usd FROM platform_config WHERE id = 1').get();
  return Number(planKey === 'studio' ? cfg.plan_price_studio_usd : cfg.plan_price_pro_usd) || 0;
}


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

// El precio del plan se fija en USD y se pasa a CUP con la tasa que el admin tenga puesta.
function planPriceCup(planKey) {
  if (planKey === 'free') return 0;
  const usd = planPriceUsd(planKey);
  const { rate } = tasaUsd();
  if (usd > 0 && rate > 0) return Math.round(usd * rate);
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

// Cuando un productor pasa de Free a Pro/Studio, sus previews se rehacen sin la marca de agua
// (en segundo plano, de a poco, para no frenar el servidor).
function quitarMarcaDePreviews(producerId) {
  const full = producerFull(producerId);
  if (!full || planEfectivo(full).watermarkPreview) return 0;
  const pistas = db.prepare('SELECT id, master_filename FROM tracks WHERE producer_id = ? AND preview_marca = 1').all(producerId);
  for (const t of pistas) {
    conCupoAudio(async () => {
      const master = path.join(UPLOADS_MASTERS, t.master_filename || '-');
      if (!fs.existsSync(master)) return;
      const nuevo = `${crypto.randomUUID()}.mp3`;
      await transcodificarMp3(master, path.join(UPLOADS_AUDIO, nuevo), 192);
      const actual = db.prepare('SELECT audio_filename FROM tracks WHERE id = ?').get(t.id);
      if (!actual) { try { fs.unlinkSync(path.join(UPLOADS_AUDIO, nuevo)); } catch { /* nada */ } return; }
      db.prepare('UPDATE tracks SET audio_filename = ?, preview_marca = 0 WHERE id = ?').run(nuevo, t.id);
      try { fs.unlinkSync(path.join(UPLOADS_AUDIO, actual.audio_filename)); } catch { /* nada */ }
    }).catch((e) => console.error(`No se pudo quitar la marca de agua del preview ${t.id}:`, e.message));
  }
  if (pistas.length) console.log(`Rehaciendo ${pistas.length} preview(s) sin marca de agua del productor ${producerId}`);
  return pistas.length;
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
    basic: parsePrecio(fields.priceBasic),
    premium: parsePrecio(fields.pricePremium),
    unlimited: parsePrecio(fields.priceUnlimited),
    exclusive: parsePrecio(fields.priceExclusive),
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
  let d;
  try { d = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}'); }
  catch { return sendJSON(res, 400, { error: 'Solicitud inválida' }); }
  let r;
  try {
    r = await crearPistaDesdeSubidas(d, 'admin', { watermark: false });
  } catch (err) {
    if (!err || !err.status) console.error(err);
    return sendJSON(res, (err && err.status) || 500, { error: (err && err.error) || 'Error al procesar la pista' });
  }
  const id = insertarPista(r, { producerId: null, estado: 'approved' });
  sendJSON(res, 201, { id });
});

route('POST', '/api/producer/tracks', async (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });
  const full = producerFull(producer.id);
  const plan = getPlan(full);
  if (!full.approved) return sendJSON(res, 403, { error: 'Tu cuenta todavía no fue aprobada por el administrador.' });
  if (!planVigente(full)) return sendJSON(res, 403, { error: `Tu plan ${plan.label} está vencido. Renuévalo para volver a subir beats.` });
  if (!full.active) return sendJSON(res, 403, { error: 'Tu cuenta está desactivada. Renueva tu plan o contacta al administrador.' });
  const activos = db.prepare("SELECT COUNT(*) as c FROM tracks WHERE producer_id = ? AND approval_status != 'rejected' AND sold = 0").get(producer.id).c;
  if (plan.maxBeats !== Infinity && activos >= plan.maxBeats) {
    return sendJSON(res, 403, { error: `Tu plan ${plan.label} permite ${plan.maxBeats} beats activos y ya tienes ${activos}. Elimina alguno o sube de plan para publicar más.` });
  }
  let d;
  try { d = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}'); }
  catch { return sendJSON(res, 400, { error: 'Solicitud inválida' }); }
  let r;
  try {
    r = await crearPistaDesdeSubidas(d, `p:${producer.id}`, {
      watermark: plan.watermarkPreview,
      audioExt: plan.audioExt,
      allowWav: plan.wav,
      allowStems: plan.stems,
      allowPlaylist: plan.playlist,
      allowedLicenses: licenciasPermitidas(full),
      requireMp3_320: true,
      planLabel: plan.label,
    });
  } catch (err) {
    if (!err || !err.status) console.error(err);
    return sendJSON(res, (err && err.status) || 500, { error: (err && err.error) || 'Error al procesar el beat' });
  }
  const id = insertarPista(r, { producerId: producer.id, estado: 'pending' });
  sendJSON(res, 201, { id });
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

  const nombres = Object.fromEntries(db.prepare('SELECT id, name FROM producers').all().map(p => [p.id, p.name]));
  tracks = tracks.map(t => ({
    ...t,
    producer_name: t.producer_id ? (nombres[t.producer_id] || 'Productor eliminado') : '',
    licenses: type === 'catalog' ? getTrackLicenses(t.id) : [],
    archivos: archivosDePista(t),
  }));

  sendJSON(res, 200, { tracks });
});

route('POST', '/api/admin/tracks/:id/price', async (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'No encontrada' });
  if (track.is_playlist) return sendJSON(res, 400, { error: 'Las pistas de Playlist no tienen precio' });
  if (track.sold) return sendJSON(res, 409, { error: 'Esta pista ya se vendió con licencia única: ya no se le pueden cambiar los precios.' });

  try {
    const body = await readBody(req, 1024 * 5);
    const raw = JSON.parse(body.toString('utf8'));
    const prices = {
      basic: parsePrecio(raw.priceBasic ?? raw.priceCup),
      premium: parsePrecio(raw.pricePremium),
      unlimited: parsePrecio(raw.priceUnlimited),
      exclusive: parsePrecio(raw.priceExclusive),
    };

    const validation = validateLicenseCombination(prices);
    if (!validation.ok) {
      return sendJSON(res, 400, { error: validation.error });
    }
    const falta = faltanArchivosPara(prices, archivosDePista(track));
    if (falta) return sendJSON(res, 400, { error: falta });

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

    aplicarPrecios(track.id, prices, validation);
    sendJSON(res, 200, { ok: true });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('POST', '/api/admin/tracks/:id/info', async (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const track = db.prepare('SELECT id, is_playlist FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'No encontrada' });
  let d;
  try { d = JSON.parse((await readBody(req, 8192)).toString('utf8')); }
  catch { return sendJSON(res, 400, { error: 'Solicitud inválida' }); }
  const titulo = limpiarTexto(d.title, 120);
  if (!titulo) return sendJSON(res, 400, { error: 'El título no puede quedar vacío' });
  db.prepare('UPDATE tracks SET title = ?, genre = ?, description = ?, artist_credit = ? WHERE id = ?')
    .run(titulo, limpiarTexto(d.genre, 60), limpiarTexto(d.description, 1000), track.is_playlist ? limpiarTexto(d.artistCredit, 120) : '', track.id);
  sendJSON(res, 200, { ok: true });
});

route('DELETE', '/api/admin/tracks/:id', (req, res, params, query) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'No encontrada' });

  const ventasAprobadas = db.prepare("SELECT COUNT(*) as c FROM orders WHERE track_id = ? AND status = 'approved'").get(params.id).c;
  const pendientes = db.prepare("SELECT COUNT(*) as c FROM orders WHERE track_id = ? AND status = 'pending'").get(params.id).c;
  if ((ventasAprobadas > 0 || pendientes > 0) && query.get('force') !== '1') {
    const partes = [];
    if (ventasAprobadas) partes.push(`${ventasAprobadas} venta(s) aprobada(s): esos compradores ya no podrán volver a descargar sus archivos (sus licencias sí siguen siendo verificables)`);
    if (pendientes) partes.push(`${pendientes} compra(s) esperando aprobación: tendrás que rechazarlas y devolver el dinero`);
    return sendJSON(res, 409, { error: `Esta pista tiene ${partes.join('; y ')}.`, ventasAprobadas, pendientes });
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
  const producers = db.prepare('SELECT id, name, email, active, exclusive_enabled, approved, plan, plan_paid_until, contact_phone, accounts_json, disabled_reason, referred_by, created_at FROM producers ORDER BY approved ASC, created_at DESC').all();
  const withStats = producers.map(p => {
    const stats = db.prepare(`
      SELECT COUNT(*) as totalTracks,
             COALESCE(SUM(CASE WHEN status = 'approved' THEN price_cup_at_sale ELSE 0 END), 0) as totalSalesCup,
             COALESCE(SUM(CASE WHEN status = 'approved' THEN producer_earning_cup ELSE 0 END), 0) as totalEarningsCup,
             COALESCE(SUM(CASE WHEN status = 'approved' AND COALESCE(producer_paid, 0) = 0 THEN producer_earning_cup ELSE 0 END), 0) as pendingPayoutCup
      FROM orders WHERE producer_id = ?
    `).get(p.id);
    stats.pendingPayoutCup = deudaConProductor(p.id);
    stats.referidos = referidosAprobados(p.id);
    stats.pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE producer_id = ? AND status = 'pending'").get(p.id).c;
    const trackCount = db.prepare('SELECT COUNT(*) as c FROM tracks WHERE producer_id = ?').get(p.id).c;
    return { ...p, trackCount, ...stats };
  });
  sendJSON(res, 200, { producers: withStats });
});

route('POST', '/api/admin/producers', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  try {
    const body = await readBody(req, 1024 * 5);
    const { name, email, password, phone } = JSON.parse(body.toString('utf8'));
    const cleanEmail = limpiarTexto(email, 120).toLowerCase();
    const cleanName = limpiarTexto(name, 80);
    const cleanPhone = String(phone || '').replace(/[^0-9+]/g, '').slice(0, 20);

    if (!cleanName || !cleanEmail || !password || password.length < 6) {
      return sendJSON(res, 400, { error: 'Nombre, correo y contraseña (mínimo 6 caracteres) son obligatorios' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return sendJSON(res, 400, { error: 'Escribe un correo válido' });
    }

    const existing = db.prepare('SELECT id FROM producers WHERE email = ?').get(cleanEmail);
    if (existing) {
      return sendJSON(res, 409, { error: 'Ya existe un productor con ese correo' });
    }

    const { hash, salt } = producerAuth.hashPassword(password);
    const result = db.prepare(`INSERT INTO producers (name, email, password_hash, password_salt, active, approved, plan, contact_phone, referral_code)
                                VALUES (?, ?, ?, ?, 1, 1, 'free', ?, ?)`)
      .run(cleanName, cleanEmail, hash, salt, cleanPhone, nuevoCodigoReferido());
    sendJSON(res, 201, { id: Number(result.lastInsertRowid) });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('POST', '/api/admin/producers/:id/approve', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const p = db.prepare('SELECT id, referred_by FROM producers WHERE id = ?').get(params.id);
  if (!p) return sendJSON(res, 404, { error: 'Productor no encontrado' });
  db.prepare('UPDATE producers SET approved = 1 WHERE id = ?').run(params.id);
  if (p.referred_by) { try { acreditarBonos(p.referred_by); } catch (e) { console.error(e); } }
  sendJSON(res, 200, { ok: true });
});

// El admin le pone una contraseña nueva a un productor que la olvidó
route('POST', '/api/admin/producers/:id/password', async (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const p = db.prepare('SELECT id FROM producers WHERE id = ?').get(params.id);
  if (!p) return sendJSON(res, 404, { error: 'Productor no encontrado' });
  let password = '';
  try { password = String(JSON.parse((await readBody(req, 2048)).toString('utf8')).password || ''); }
  catch { return sendJSON(res, 400, { error: 'Solicitud inválida' }); }
  if (password.length < 6) return sendJSON(res, 400, { error: 'La contraseña debe tener al menos 6 caracteres' });
  const { hash, salt } = producerAuth.hashPassword(password);
  db.prepare('UPDATE producers SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, p.id);
  db.prepare('DELETE FROM producer_sessions WHERE producer_id = ?').run(p.id);
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
    db.prepare(`UPDATE producers SET plan = ?, plan_paid_until = ?,
                active = CASE WHEN ? AND disabled_reason = 'plan_vencido' THEN 1 ELSE active END,
                disabled_reason = CASE WHEN ? AND disabled_reason = 'plan_vencido' THEN '' ELSE disabled_reason END
                WHERE id = ?`).run(plan, fecha, plan !== 'free' ? 1 : 0, plan !== 'free' ? 1 : 0, params.id);
    const previewsLimpios = quitarMarcaDePreviews(Number(params.id));
    sendJSON(res, 200, { ok: true, previewsSinMarca: previewsLimpios });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

route('GET', '/api/admin/platform-config', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const cfg = db.prepare('SELECT admin_phone, plan_price_pro_usd, plan_price_studio_usd FROM platform_config WHERE id = 1').get();
  const bonos = configBonos();
  const tu = tasaUsd();
  sendJSON(res, 200, {
    adminPhone: cfg.admin_phone || '',
    planPriceProUsd: cfg.plan_price_pro_usd || 0,
    planPriceStudioUsd: cfg.plan_price_studio_usd || 0,
    planPriceProCup: planPriceCup('pro'),
    planPriceStudioCup: planPriceCup('studio'),
    usdRate: tu.rate, usdRateCode: tu.code,
    likesPerBonus: bonos.likesPorBono, likesBonusCup: bonos.bonoLikesCup,
    referralsPerBonus: bonos.referidosPorBono, referralBonusCup: bonos.bonoReferidosCup,
    payoutRates: bonos.tasasRetiro,
  });
});

route('POST', '/api/admin/platform-config', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  try {
    const body = await readBody(req, 1024 * 10);
    const d = JSON.parse(body.toString('utf8'));
    const num = (v) => parseFloat(String(v ?? '').replace(',', '.'));
    const pro = num(d.planPriceProUsd), studio = num(d.planPriceStudioUsd);
    if (!(pro > 0) || !(studio > 0)) return sendJSON(res, 400, { error: 'Pon el precio mensual en USD de los planes Pro y Studio' });
    const lpb = parseInt(d.likesPerBonus, 10), lbc = num(d.likesBonusCup), rpb = parseInt(d.referralsPerBonus, 10), rbc = num(d.referralBonusCup);
    if (!(lpb >= 1) || !(rpb >= 1) || !(lbc >= 0) || !(rbc >= 0)) return sendJSON(res, 400, { error: 'Revisa los números de los bonos' });
    const tasas = {};
    if (d.payoutRates && typeof d.payoutRates === 'object') {
      for (const [code, v] of Object.entries(d.payoutRates)) {
        const c = String(code).toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 30);
        if (!c || c === 'CUP') continue;
        const rate = Math.max(0, num(v && v.rate) || 0), fee = Math.max(0, num(v && v.fee) || 0);
        tasas[c] = { rate, fee };
      }
    }
    db.prepare(`UPDATE platform_config SET admin_phone = ?, plan_price_pro_usd = ?, plan_price_studio_usd = ?,
                likes_per_bonus = ?, likes_bonus_cup = ?, referrals_per_bonus = ?, referral_bonus_cup = ?, payout_rates_json = ? WHERE id = 1`)
      .run(String(d.adminPhone || '').slice(0, 40).trim(), pro, studio, lpb, lbc, rpb, rbc, JSON.stringify(tasas));
    sendJSON(res, 200, { ok: true, planPriceProCup: planPriceCup('pro'), planPriceStudioCup: planPriceCup('studio') });
  } catch {
    sendJSON(res, 400, { error: 'Solicitud inválida' });
  }
});

// ---------- Saldo, bonos, referidos y retiros de productores ----------
function redondear(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function configBonos() {
  const c = db.prepare('SELECT likes_per_bonus, likes_bonus_cup, referrals_per_bonus, referral_bonus_cup, payout_rates_json FROM platform_config WHERE id = 1').get();
  let tasas = {};
  try { tasas = JSON.parse(c.payout_rates_json || '{}'); } catch { tasas = {}; }
  return {
    likesPorBono: Math.max(1, Number(c.likes_per_bonus) || 1000),
    bonoLikesCup: Math.max(0, Number(c.likes_bonus_cup) || 0),
    referidosPorBono: Math.max(1, Number(c.referrals_per_bonus) || 10),
    bonoReferidosCup: Math.max(0, Number(c.referral_bonus_cup) || 0),
    tasasRetiro: tasas,
  };
}

function nuevoCodigoReferido() {
  for (let i = 0; i < 20; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 7);
    if (!db.prepare('SELECT id FROM producers WHERE referral_code = ?').get(code)) return code;
  }
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

function codigoReferido(full) {
  if (full.referral_code) return full.referral_code;
  const code = nuevoCodigoReferido();
  db.prepare('UPDATE producers SET referral_code = ? WHERE id = ?').run(code, full.id);
  return code;
}

function referidosAprobados(producerId) {
  return db.prepare('SELECT COUNT(*) as c FROM producers WHERE referred_by = ? AND approved = 1').get(producerId).c;
}

// Convierte likes (Studio, pistas de Playlist) y referidos en créditos a favor del productor. Idempotente.
function acreditarBonos(producerId) {
  const full = producerFull(producerId);
  if (!full) return;
  const cfg = configBonos();
  const plan = planEfectivo(full);
  if ((full.plan || 'free') === 'studio' && plan === PRODUCER_PLANS.studio && cfg.bonoLikesCup > 0) {
    const pistas = db.prepare('SELECT id, title, likes, bonus_units_credited FROM tracks WHERE producer_id = ? AND is_playlist = 1 AND approval_status = ?').all(producerId, 'approved');
    for (const t of pistas) {
      const unidades = Math.floor((t.likes || 0) / cfg.likesPorBono);
      const nuevas = unidades - (t.bonus_units_credited || 0);
      if (nuevas > 0) {
        db.prepare('INSERT INTO producer_credits (producer_id, kind, amount_cup, detail) VALUES (?, ?, ?, ?)')
          .run(producerId, 'likes', nuevas * cfg.bonoLikesCup, `"${t.title}" llegó a ${unidades * cfg.likesPorBono} me gusta en Playlist`);
        db.prepare('UPDATE tracks SET bonus_units_credited = ? WHERE id = ?').run(unidades, t.id);
      }
    }
  }
  if (cfg.bonoReferidosCup > 0) {
    const total = referidosAprobados(producerId);
    const unidades = Math.floor(total / cfg.referidosPorBono);
    const nuevas = unidades - (full.referral_units_credited || 0);
    if (nuevas > 0) {
      db.prepare('INSERT INTO producer_credits (producer_id, kind, amount_cup, detail) VALUES (?, ?, ?, ?)')
        .run(producerId, 'referidos', nuevas * cfg.bonoReferidosCup, `Llegaste a ${unidades * cfg.referidosPorBono} productores referidos aprobados`);
      db.prepare('UPDATE producers SET referral_units_credited = ? WHERE id = ?').run(unidades, producerId);
    }
  }
}

const MONEDAS_SIN_DECIMALES = ['CUP', 'SALDO_MOVIL'];
function redondearMoneda(n, moneda) {
  const dec = MONEDAS_SIN_DECIMALES.includes(moneda) ? 0 : 2;
  const f = Math.pow(10, dec);
  return Math.round((Number(n) || 0) * f) / f;
}
function etiquetaMoneda(code) {
  if (!code || code === 'CUP') return 'CUP';
  const r = ratesMap()[code];
  return (r && r.label) || code;
}
// Pasa un precio en CUP a la moneda en que pagó el comprador, con la tasa de venta actual.
// Si esa moneda no tiene tasa, queda en CUP.
function montoEnMoneda(priceCup, currency) {
  const code = String(currency || 'CUP');
  if (code === 'CUP') return { moneda: 'CUP', unidades: redondearMoneda(priceCup, 'CUP'), tasa: 1 };
  const r = ratesMap()[code];
  const tasa = r ? Number(r.cupPerUnit) || 0 : 0;
  if (!(tasa > 0)) return { moneda: 'CUP', unidades: redondearMoneda(priceCup, 'CUP'), tasa: 1 };
  return { moneda: code, unidades: redondearMoneda(priceCup / tasa, code), tasa };
}

// Saldo del productor por billetera (moneda), como un libro de movimientos:
//   ventas aprobadas (en la moneda que pagó el comprador, menos la comisión)
// + bonos y cargos (planes pagados con saldo)
// − retiros pedidos o pagados (los cancelados no cuentan)
// Las ventas marcadas como pagadas con el sistema viejo (sin retiro) ya no suman.
function saldoDisponible(producerId) {
  const ordenes = db.prepare(`
    SELECT id, track_title, license_type, price_cup_at_sale, commission_percent_at_sale, producer_earning_cup,
           COALESCE(NULLIF(wallet_currency, ''), 'CUP') as moneda, paid_units, producer_earning_units,
           COALESCE(NULLIF(approved_at, ''), created_at) as fecha
    FROM orders
    WHERE producer_id = ? AND status = 'approved' AND NOT (COALESCE(producer_paid, 0) = 1 AND withdrawal_id IS NULL)
    ORDER BY fecha ASC
  `).all(producerId);
  const creditos = db.prepare('SELECT * FROM producer_credits WHERE producer_id = ? ORDER BY id').all(producerId);
  const retiros = db.prepare("SELECT * FROM producer_withdrawals WHERE producer_id = ? AND status IN ('pending', 'paid')").all(producerId);
  const mapa = {};
  const billetera = (code) => {
    if (!mapa[code]) mapa[code] = { code, label: etiquetaMoneda(code), unidades: 0, cupEquivalente: 0, ventas: 0, bonos: 0, cargos: 0, retirado: 0 };
    return mapa[code];
  };
  let totalVentas = 0, totalBonos = 0;
  for (const o of ordenes) {
    const b = billetera(o.moneda);
    const u = Number(o.producer_earning_units) || 0;
    b.unidades += u; b.ventas += u;
    b.cupEquivalente += o.producer_earning_cup || 0;
    totalVentas += o.producer_earning_cup || 0;
  }
  for (const c of creditos) {
    const moneda = c.currency || 'CUP';
    const b = billetera(moneda);
    const u = moneda === 'CUP' || c.amount_units == null ? (c.amount_cup || 0) : Number(c.amount_units) || 0;
    b.unidades += u;
    b.cupEquivalente += c.amount_cup || 0;
    if (u > 0) { b.bonos += u; totalBonos += c.amount_cup || 0; } else b.cargos += u;
  }
  for (const w of retiros) {
    const b = billetera(w.wallet || 'CUP');
    const u = w.debit_units != null ? Number(w.debit_units) : ((w.wallet || 'CUP') === 'CUP' ? w.amount_cup : w.amount_units);
    b.unidades -= u; b.retirado += u;
    b.cupEquivalente -= w.amount_cup || 0;
  }
  const billeteras = Object.values(mapa).map(b => ({
    ...b,
    unidades: redondearMoneda(b.unidades, b.code),
    ventas: redondearMoneda(b.ventas, b.code),
    bonos: redondearMoneda(b.bonos, b.code),
    cargos: redondearMoneda(b.cargos, b.code),
    retirado: redondearMoneda(b.retirado, b.code),
    cupEquivalente: redondear(Math.max(0, b.cupEquivalente)),
  })).filter(b => b.unidades > 0.0001).sort((a, b) => (a.code === 'CUP' ? -1 : b.code === 'CUP' ? 1 : a.code.localeCompare(b.code)));
  const total = redondear(billeteras.reduce((s, b) => s + b.cupEquivalente, 0));
  return { ordenes, creditos, billeteras, totalVentas: redondear(totalVentas), totalBonos: redondear(totalBonos), total };
}

// Lo que la plataforma le debe a un productor (saldo + retiro en curso), en CUP de referencia.
function deudaConProductor(producerId) {
  const pend = db.prepare("SELECT COALESCE(SUM(amount_cup), 0) as t FROM producer_withdrawals WHERE producer_id = ? AND status = 'pending'").get(producerId).t;
  return redondear(saldoDisponible(producerId).total + pend);
}

function normalizarFecha(f) {
  const t = String(f || '');
  if (!t) return '';
  return t.includes('T') ? t : t.replace(' ', 'T') + 'Z';
}

// Historial de todo lo que pasa con el dinero del productor.
function movimientosProductor(producerId) {
  const lista = [];
  const ventas = db.prepare(`
    SELECT id, track_title, license_type, commission_percent_at_sale, producer_earning_cup, producer_paid, withdrawal_id,
           COALESCE(NULLIF(wallet_currency, ''), 'CUP') as moneda, paid_units, producer_earning_units, price_cup_at_sale,
           COALESCE(NULLIF(approved_at, ''), created_at) as fecha
    FROM orders WHERE producer_id = ? AND status = 'approved'
  `).all(producerId);
  for (const o of ventas) {
    const antiguo = o.producer_paid && !o.withdrawal_id;
    lista.push({
      clave: 'venta:' + o.id, id: o.id, borrable: true,
      fecha: normalizarFecha(o.fecha), tipo: 'venta',
      titulo: `Venta · ${o.track_title}`,
      detalle: `${LICENSE_LABELS[o.license_type] || o.license_type} · el comprador pagó ${redondearMoneda(o.paid_units || o.price_cup_at_sale, o.moneda)} ${etiquetaMoneda(o.moneda)} · comisión ${o.commission_percent_at_sale || 0}%`,
      moneda: o.moneda, label: etiquetaMoneda(o.moneda), unidades: Number(o.producer_earning_units) || 0,
      estado: antiguo ? 'cobrada antes' : '',
    });
  }
  // Ventas que el administrador todavía no aprueba: se ven, pero no suman hasta aprobarse
  for (const o of db.prepare(`
    SELECT id, track_title, license_type, created_at, COALESCE(NULLIF(wallet_currency, ''), 'CUP') as moneda, paid_units, price_cup_at_sale
    FROM orders WHERE producer_id = ? AND status = 'pending'
  `).all(producerId)) {
    lista.push({
      clave: 'venta:' + o.id, id: o.id, borrable: false,
      fecha: normalizarFecha(o.created_at), tipo: 'venta',
      titulo: `Venta · ${o.track_title}`,
      detalle: `${LICENSE_LABELS[o.license_type] || o.license_type} · el comprador pagó ${redondearMoneda(o.paid_units || o.price_cup_at_sale, o.moneda)} ${etiquetaMoneda(o.moneda)} · se suma cuando el administrador apruebe el pago`,
      moneda: o.moneda, label: etiquetaMoneda(o.moneda), unidades: 0, estado: 'esperando aprobación',
    });
  }
  for (const c of db.prepare('SELECT * FROM producer_credits WHERE producer_id = ?').all(producerId)) {
    const moneda = c.currency || 'CUP';
    const u = moneda === 'CUP' || c.amount_units == null ? c.amount_cup : Number(c.amount_units);
    const titulos = { likes: 'Bono por me gusta', referidos: 'Bono por referidos', plan: 'Plan pagado con tu saldo' };
    lista.push({
      clave: 'credito:' + c.id, id: c.id, borrable: true,
      fecha: normalizarFecha(c.created_at), tipo: c.kind === 'plan' ? 'plan' : 'bono',
      titulo: titulos[c.kind] || 'Ajuste', detalle: c.detail || '',
      moneda, label: etiquetaMoneda(moneda), unidades: u, estado: '',
    });
  }
  for (const r of db.prepare("SELECT * FROM plan_requests WHERE producer_id = ? AND COALESCE(receipt_filename, '') != ''").all(producerId)) {
    const nombre = (PRODUCER_PLANS[r.plan] || {}).label || r.plan;
    const estados = { pending: 'en revisión', approved: 'aprobado', rejected: 'rechazado' };
    lista.push({
      clave: 'plan:' + r.id, id: r.id, borrable: r.status !== 'pending',
      fecha: normalizarFecha(r.created_at), tipo: 'plan',
      titulo: `Compra de plan ${nombre} por transferencia`,
      detalle: `${r.months} ${r.months === 1 ? 'mes' : 'meses'} · ${Number(r.amount_cup).toLocaleString('es')} CUP` +
        (r.status === 'approved' && r.paid_until_result ? ` · activo hasta ${r.paid_until_result}` : '') +
        (r.status === 'rejected' && r.reject_reason ? ` · ${r.reject_reason}` : '') + ' · no toca tu saldo',
      moneda: 'CUP', label: 'CUP', unidades: 0, estado: estados[r.status] || r.status,
    });
  }
  for (const w of db.prepare('SELECT * FROM producer_withdrawals WHERE producer_id = ?').all(producerId)) {
    const moneda = w.wallet || 'CUP';
    const u = w.debit_units != null ? Number(w.debit_units) : (moneda === 'CUP' ? w.amount_cup : w.amount_units);
    const estados = { pending: 'en curso', paid: 'pagado', cancelled: 'cancelado (se devolvió a tu saldo)' };
    const dec = MONEDAS_SIN_DECIMALES.includes(w.currency) ? 0 : 2;
    lista.push({
      clave: 'retiro:' + w.id, id: w.id, borrable: w.status !== 'pending',
      fecha: normalizarFecha(w.created_at), tipo: 'retiro',
      titulo: 'Retiro de dinero',
      detalle: `Recibes ${Number(w.net_units).toLocaleString('es', { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${w.currency_label || w.currency}` +
        (w.fee_units ? ` (fee ${w.fee_units})` : '') + ` · ${w.account_text}` + (w.note ? ` · ${w.note}` : ''),
      moneda, label: etiquetaMoneda(moneda), unidades: w.status === 'cancelled' ? 0 : -u, montoOriginal: -u,
      estado: estados[w.status] || w.status,
    });
  }
  for (const pgo of db.prepare('SELECT * FROM producer_payouts WHERE producer_id = ?').all(producerId)) {
    lista.push({
      clave: 'pago:' + pgo.id, id: pgo.id, borrable: true,
      fecha: normalizarFecha(pgo.created_at), tipo: 'retiro', titulo: 'Pago recibido (sistema anterior)',
      detalle: `${pgo.orders_count || 0} ventas${pgo.note ? ' · ' + pgo.note : ''}`,
      moneda: 'CUP', label: 'CUP', unidades: 0, montoOriginal: -pgo.amount_cup, estado: 'pagado',
    });
  }
  // más nuevo primero; si dos pasan en el mismo segundo, el último creado arriba
  lista.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || (b.id - a.id));
  return lista;
}

// ---------- Historiales: borrar (ocultar) y restaurar ----------
function clavesOcultas(lista) {
  return new Set(db.prepare('SELECT clave FROM historial_oculto WHERE lista = ?').all(lista).map(r => r.clave));
}
function contarOcultas(lista) {
  return db.prepare('SELECT COUNT(*) as n FROM historial_oculto WHERE lista = ?').get(lista).n;
}
function sinOcultos(lista, items, claveDe) {
  const oc = clavesOcultas(lista);
  return oc.size ? items.filter(x => !oc.has(claveDe(x))) : items;
}
// accion 'ocultar' con las claves permitidas, o 'restaurar' para volver a mostrar todo
async function cambiarHistorial(req, res, lista, permitidas) {
  let d;
  try { d = JSON.parse((await readBody(req, 256 * 1024)).toString('utf8') || '{}'); }
  catch { return sendJSON(res, 400, { error: 'Solicitud inválida' }); }
  if (d.accion === 'restaurar') {
    const n = db.prepare('DELETE FROM historial_oculto WHERE lista = ?').run(lista).changes;
    return sendJSON(res, 200, { ok: true, restaurados: n });
  }
  if (d.accion !== 'ocultar' || !Array.isArray(d.claves)) return sendJSON(res, 400, { error: 'Solicitud inválida' });
  const ok = permitidas();
  const claves = [...new Set(d.claves.map(String))].filter(c => ok.has(c));
  if (!claves.length) return sendJSON(res, 400, { error: 'No hay nada que se pueda borrar (lo que está en curso no se borra).' });
  const st = db.prepare('INSERT OR IGNORE INTO historial_oculto (lista, clave) VALUES (?, ?)');
  db.exec('BEGIN');
  try { for (const c of claves) st.run(lista, c); db.exec('COMMIT'); }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  sendJSON(res, 200, { ok: true, borrados: claves.length, ignorados: d.claves.length - claves.length });
}
const clavesBorrables = (items) => new Set(items.filter(m => m.borrable).map(m => m.clave));

route('GET', '/api/producer/movimientos', (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });
  acreditarBonos(producer.id);
  const lista = 'p:' + producer.id;
  sendJSON(res, 200, {
    movimientos: sinOcultos(lista, movimientosProductor(producer.id), m => m.clave),
    ocultos: contarOcultas(lista),
    billeteras: saldoDisponible(producer.id).billeteras,
  });
});

route('POST', '/api/producer/historial', async (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });
  return cambiarHistorial(req, res, 'p:' + producer.id, () => clavesBorrables(movimientosProductor(producer.id)));
});

route('GET', '/api/admin/producers/:id/movimientos', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const p = producerFull(Number(params.id));
  if (!p) return sendJSON(res, 404, { error: 'Productor no encontrado' });
  const lista = 'admin:movs:' + p.id;
  sendJSON(res, 200, {
    nombre: p.name,
    movimientos: sinOcultos(lista, movimientosProductor(p.id), m => m.clave),
    ocultos: contarOcultas(lista),
    billeteras: saldoDisponible(p.id).billeteras,
  });
});

// Historiales del panel: compras, planes, retiros y movimientos de cada productor
route('POST', '/api/admin/historial/:lista', async (req, res, params, query) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  if (params.lista === 'compras') {
    return cambiarHistorial(req, res, 'admin:compras', () =>
      new Set(db.prepare("SELECT id FROM orders WHERE status IN ('approved', 'rejected')").all().map(r => 'orden:' + r.id)));
  }
  if (params.lista === 'planes') {
    return cambiarHistorial(req, res, 'admin:planes', () =>
      new Set(db.prepare("SELECT id FROM plan_requests WHERE status != 'pending'").all().map(r => 'plan:' + r.id)));
  }
  if (params.lista === 'retiros') {
    return cambiarHistorial(req, res, 'admin:retiros', () => new Set([
      ...db.prepare("SELECT id FROM producer_withdrawals WHERE status != 'pending'").all().map(r => 'retiro:' + r.id),
      ...db.prepare('SELECT id FROM producer_payouts').all().map(r => 'pago:' + r.id),
    ]));
  }
  if (params.lista === 'movs') {
    const p = producerFull(Number(query.get('productor')));
    if (!p) return sendJSON(res, 404, { error: 'Productor no encontrado' });
    return cambiarHistorial(req, res, 'admin:movs:' + p.id, () => clavesBorrables(movimientosProductor(p.id)));
  }
  sendJSON(res, 404, { error: 'Historial desconocido' });
});

function ratesMap() {
  const row = db.prepare('SELECT rates_json FROM exchange_rates WHERE id = 1').get();
  let rates = [];
  try { rates = JSON.parse(row.rates_json || '[]'); } catch { rates = []; }
  return Object.fromEntries(rates.map(r => [r.code, r]));
}

// Tasa del remesero y fee de red para retirar en otra moneda (si el admin no la puso, se usa la tasa de venta).
function condicionesRetiro(code) {
  if (code === 'CUP') return { rate: 1, fee: 0, label: 'CUP' };
  const cfg = configBonos();
  const r = ratesMap()[code] || {};
  const t = cfg.tasasRetiro[code] || {};
  const rate = Number(t.rate) > 0 ? Number(t.rate) : Number(r.cupPerUnit) || 0;
  return { rate, fee: Math.max(0, Number(t.fee) || 0), label: r.label || code };
}

// Retiro de una billetera: la de una moneda extranjera se paga en esa misma moneda (menos el fee de red);
// la de CUP se puede cobrar en CUP o convertir a otra moneda con la tasa del remesero.
function calcularRetiroBilletera(b, code, monto) {
  const cantidad = monto == null ? b.unidades : monto;
  if (b.code === 'CUP') return calcularRetiro(cantidad, code);
  if (code !== b.code) return { ok: false, error: `El saldo en ${b.label} se cobra en ${b.label}.`, label: b.label, rate: 0, fee: 0 };
  const c = condicionesRetiro(code);
  const dec = MONEDAS_SIN_DECIMALES.includes(code) ? 0 : 2;
  const f = (n) => Math.floor(n * Math.pow(10, dec) + 1e-9) / Math.pow(10, dec);
  const neto = cantidad - c.fee;
  if (neto <= 0) return { ...c, label: b.label, ok: false, error: 'Ese monto no alcanza para cubrir el fee de red de esa moneda.' };
  return { ...c, label: b.label, ok: true, directo: true, amountUnits: f(cantidad), netUnits: f(neto), netCup: redondear(neto * (c.rate || 0)), decimals: dec };
}

function calcularRetiro(amountCup, code) {
  const c = condicionesRetiro(code);
  if (!c.rate) return { ...c, ok: false, error: 'El administrador todavía no puso la tasa para esa moneda.' };
  const bruto = code === 'CUP' ? amountCup : amountCup / c.rate;
  const neto = bruto - c.fee;
  const dec = ['CUP', 'SALDO_MOVIL'].includes(code) ? 0 : 2;
  const f = (n) => Math.floor(n * Math.pow(10, dec)) / Math.pow(10, dec);
  if (neto <= 0) return { ...c, ok: false, error: 'Ese monto no alcanza para cubrir el fee de red de esa moneda.' };
  return { ...c, ok: true, amountUnits: f(bruto), netUnits: f(neto), netCup: redondear(neto * (code === 'CUP' ? 1 : c.rate)), decimals: dec };
}

function retiroPendiente(producerId) {
  return db.prepare("SELECT * FROM producer_withdrawals WHERE producer_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1").get(producerId) || null;
}

function telefonoAdmin() {
  const cfgTel = db.prepare('SELECT admin_phone FROM platform_config WHERE id = 1').get();
  const pinfo = db.prepare('SELECT contact_phone FROM payment_info WHERE id = 1').get();
  return (cfgTel && cfgTel.admin_phone) || (pinfo && pinfo.contact_phone) || '';
}

route('GET', '/api/producer/withdrawals', (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });
  acreditarBonos(producer.id);
  const full = producerFull(producer.id);
  const saldo = saldoDisponible(producer.id);
  let cuentas = [];
  try { cuentas = JSON.parse(full.accounts_json || '[]'); } catch { cuentas = []; }
  const monedas = [...new Set(cuentas.map(c => c.currency))];
  const billeteras = saldo.billeteras.map(b => ({
    code: b.code, label: b.label, unidades: b.unidades, cupEquivalente: b.cupEquivalente, ventas: b.ventas, bonos: b.bonos,
    decimales: MONEDAS_SIN_DECIMALES.includes(b.code) ? 0 : 2,
    opciones: (b.code === 'CUP' ? monedas : monedas.filter(m => m === b.code)).map(code => ({
      code, cuentas: cuentas.filter(c => c.currency === code), ...calcularRetiroBilletera(b, code),
    })),
  }));
  // compatibilidad: opciones de la billetera de CUP
  const cupB = billeteras.find(b => b.code === 'CUP');
  const opciones = cupB ? cupB.opciones : [];
  const historial = db.prepare('SELECT * FROM producer_withdrawals WHERE producer_id = ? ORDER BY id DESC LIMIT 30').all(producer.id);
  const plan = planEfectivo(full);
  sendJSON(res, 200, {
    saldo: { total: saldo.total, ventas: saldo.totalVentas, bonos: saldo.totalBonos, creditos: saldo.creditos },
    billeteras,
    pendiente: retiroPendiente(producer.id),
    historial,
    opciones,
    plazo: plan.payout,
    plazoDias: plan.payoutDays,
    adminPhone: telefonoAdmin(),
  });
});

route('POST', '/api/producer/withdrawals', async (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });
  let currency = 'CUP';
  let walletPedida = '';
  let montoPedido = null;
  try {
    const body = JSON.parse((await readBody(req, 1024 * 2)).toString('utf8') || '{}');
    currency = String(body.currency || 'CUP').slice(0, 30);
    walletPedida = String(body.wallet || '').slice(0, 30);
    montoPedido = body.amount == null || body.amount === '' ? null : parsePrecio(body.amount);
  } catch { return sendJSON(res, 400, { error: 'Solicitud inválida' }); }

  if (retiroPendiente(producer.id)) return sendJSON(res, 409, { error: 'Ya tienes un retiro en curso. Espera a que el administrador te pague.' });
  acreditarBonos(producer.id);
  const full = producerFull(producer.id);
  const saldo = saldoDisponible(producer.id);
  if (!saldo.billeteras.length) return sendJSON(res, 400, { error: 'No tienes saldo disponible para retirar.' });
  // sin billetera indicada: la de la moneda pedida si existe, si no la de CUP
  const codigoB = walletPedida || (saldo.billeteras.some(b => b.code === currency) ? currency : 'CUP');
  const b = saldo.billeteras.find(x => x.code === codigoB);
  if (!b) return sendJSON(res, 400, { error: 'No tienes saldo en esa moneda.' });

  let cuentas = [];
  try { cuentas = JSON.parse(full.accounts_json || '[]'); } catch { cuentas = []; }
  const cuentasMoneda = cuentas.filter(c => c.currency === currency);
  if (!cuentasMoneda.length) return sendJSON(res, 400, { error: 'Primero agrega en tu perfil una cuenta de cobro en esa moneda.' });

  // se puede retirar la cantidad que quiera, siempre que no pase de lo que tiene en esa billetera
  const monto = montoPedido == null ? b.unidades : redondearMoneda(montoPedido, b.code);
  if (!(monto > 0)) return sendJSON(res, 400, { error: 'Escribe cuánto quieres retirar.' });
  if (monto > b.unidades + 1e-9) return sendJSON(res, 400, { error: `No puedes retirar más de lo que tienes: ${b.unidades} ${b.label}.` });
  const calc = calcularRetiroBilletera(b, currency, monto);
  if (!calc.ok) return sendJSON(res, 400, { error: calc.error });
  const montoCup = b.code === 'CUP' ? monto : redondear(b.cupEquivalente * (monto / b.unidades));

  const plan = planEfectivo(full);
  const due = new Date(Date.now() + plan.payoutDays * 86400000).toISOString();
  const cuentaTxt = cuentasMoneda.map(c => `${c.bank} ${c.number}`.trim()).join(' | ');
  const info = db.prepare(`INSERT INTO producer_withdrawals
      (producer_id, producer_name, amount_cup, currency, currency_label, rate_cup_per_unit, fee_units, amount_units, net_units, account_text, due_at, wallet, debit_units)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(full.id, full.name, montoCup, currency, calc.label, calc.rate, calc.fee, calc.amountUnits, calc.netUnits, cuentaTxt, due, b.code, monto);
  const wid = Number(info.lastInsertRowid);

  const fmt = (n, d) => Number(n).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
  const dec = MONEDAS_SIN_DECIMALES.includes(currency) ? 0 : 2;
  const recibe = `${fmt(calc.netUnits, dec)} ${calc.label}`;
  let detalle;
  if (b.code !== 'CUP') detalle = `de mi saldo en ${b.label}: ${fmt(monto, dec)} ${b.label}` + (calc.fee ? ` − fee ${calc.fee} = ${recibe}` : '');
  else if (currency === 'CUP') detalle = `de ${fmt(monto, 0)} CUP`;
  else detalle = `de ${fmt(monto, 0)} CUP, a cobrar en ${calc.label}: ${recibe} (tasa ${fmt(calc.rate, 2)} CUP, fee ${calc.fee})`;
  const mensaje = `Hola, soy ${full.name} (productor de Zona Beats). Acabo de solicitar un retiro ${detalle}.` +
    `\nCuenta: ${cuentaTxt}\nPlazo de mi plan ${plan.label}: ${plan.payout}.`;
  sendJSON(res, 201, { ok: true, id: wid, dueAt: due, adminPhone: telefonoAdmin(), whatsappText: mensaje });
});

route('GET', '/api/admin/withdrawals', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const pendientes = db.prepare(`
    SELECT w.*, p.contact_phone as producer_phone, p.email as producer_email, p.plan as producer_plan
    FROM producer_withdrawals w LEFT JOIN producers p ON p.id = w.producer_id
    WHERE w.status = 'pending' ORDER BY w.due_at ASC
  `).all().map(w => ({
    ...w,
    ventas: db.prepare(`SELECT track_title, license_type, price_cup_at_sale, commission_percent_at_sale, producer_earning_cup,
                        COALESCE(NULLIF(wallet_currency, ''), 'CUP') as moneda, paid_units, producer_earning_units
                        FROM orders WHERE withdrawal_id = ?`).all(w.id),
    movimientos: movimientosProductor(w.producer_id).filter(m => m.moneda === (w.wallet || 'CUP') && (m.unidades || m.tipo === 'retiro')).slice(0, 15),
    saldoRestante: (saldoDisponible(w.producer_id).billeteras.find(b => b.code === (w.wallet || 'CUP')) || { unidades: 0 }).unidades,
    wallet_label: etiquetaMoneda(w.wallet || 'CUP'),
    bonos: db.prepare("SELECT kind, amount_cup, detail, COALESCE(currency, 'CUP') as moneda, amount_units FROM producer_credits WHERE withdrawal_id = ?").all(w.id),
  }));
  const ocR = clavesOcultas('admin:retiros');
  const historial = db.prepare("SELECT * FROM producer_withdrawals WHERE status != 'pending' ORDER BY COALESCE(NULLIF(resolved_at, ''), created_at) DESC, id DESC LIMIT 500").all()
    .filter(w => !ocR.has('retiro:' + w.id));
  const antiguos = db.prepare('SELECT * FROM producer_payouts ORDER BY created_at DESC, id DESC LIMIT 200').all()
    .filter(p => !ocR.has('pago:' + p.id));
  const retirosOcultos = contarOcultas('admin:retiros');
  // Saldos que todavía nadie pidió retirar (solo informativo)
  const sinSolicitar = db.prepare('SELECT id, name FROM producers').all().map(p => {
    const sd = saldoDisponible(p.id);
    return { producerId: p.id, name: p.name, totalCup: sd.total, billeteras: sd.billeteras.map(b => ({ code: b.code, label: b.label, unidades: b.unidades })) };
  }).filter(x => x.totalCup > 0 || x.billeteras.length);
  sendJSON(res, 200, { pendientes, historial, antiguos, sinSolicitar, ocultos: retirosOcultos });
});

route('POST', '/api/admin/withdrawals/:id/paid', async (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  let note = '';
  try { const b = await readBody(req, 2048); if (b.length) note = String(JSON.parse(b.toString('utf8')).note || '').slice(0, 300).trim(); }
  catch { return sendJSON(res, 400, { error: 'Solicitud inválida' }); }
  const w = db.prepare('SELECT * FROM producer_withdrawals WHERE id = ?').get(params.id);
  if (!w) return sendJSON(res, 404, { error: 'Retiro no encontrado' });
  if (w.status !== 'pending') return sendJSON(res, 409, { error: 'Este retiro ya fue resuelto' });
  db.prepare("UPDATE producer_withdrawals SET status = 'paid', note = ?, resolved_at = datetime('now') WHERE id = ?").run(note, w.id);
  db.prepare('UPDATE orders SET producer_paid = 1 WHERE withdrawal_id = ?').run(w.id);
  db.prepare('UPDATE producer_credits SET paid = 1 WHERE withdrawal_id = ?').run(w.id);
  sendJSON(res, 200, { ok: true });
});

route('POST', '/api/admin/withdrawals/:id/cancel', async (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  let note = '';
  try { const b = await readBody(req, 2048); if (b.length) note = String(JSON.parse(b.toString('utf8')).note || '').slice(0, 300).trim(); }
  catch { return sendJSON(res, 400, { error: 'Solicitud inválida' }); }
  const w = db.prepare('SELECT * FROM producer_withdrawals WHERE id = ?').get(params.id);
  if (!w) return sendJSON(res, 404, { error: 'Retiro no encontrado' });
  if (w.status !== 'pending') return sendJSON(res, 409, { error: 'Este retiro ya fue resuelto' });
  db.prepare("UPDATE producer_withdrawals SET status = 'cancelled', note = ?, resolved_at = datetime('now') WHERE id = ?").run(note, w.id);
  db.prepare('UPDATE orders SET withdrawal_id = NULL WHERE withdrawal_id = ?').run(w.id);
  db.prepare('UPDATE producer_credits SET withdrawal_id = NULL WHERE withdrawal_id = ?').run(w.id);
  sendJSON(res, 200, { ok: true });
});

route('GET', '/api/producer/stats', (req, res) => {
  const producer = getAuthedProducer(req);
  if (!producer) return sendJSON(res, 401, { error: 'No autorizado' });
  acreditarBonos(producer.id);
  const full = producerFull(producer.id);
  const plan = planEfectivo(full);
  const cfg = configBonos();
  const referidos = db.prepare('SELECT name, approved, created_at FROM producers WHERE referred_by = ? ORDER BY id DESC').all(full.id);
  const aprobados = referidos.filter(r => r.approved).length;
  const bonosRef = db.prepare("SELECT COALESCE(SUM(amount_cup),0) as t FROM producer_credits WHERE producer_id = ? AND kind = 'referidos'").get(full.id).t;
  const out = {
    referidos: {
      code: codigoReferido(full),
      total: referidos.length,
      aprobados,
      pendientes: referidos.length - aprobados,
      cadaCuantos: cfg.referidosPorBono,
      bonoCup: cfg.bonoReferidosCup,
      faltanParaBono: cfg.referidosPorBono - (aprobados % cfg.referidosPorBono),
      ganadoCup: bonosRef,
      lista: referidos.map(r => ({ name: r.name, approved: Boolean(r.approved), createdAt: r.created_at })),
    },
    statsPermitidas: plan.stats,
  };
  if (plan.stats) {
    const pistas = db.prepare(`
      SELECT t.id, t.title, t.plays, t.likes, t.is_playlist, t.approval_status, t.sold,
             (SELECT COUNT(*) FROM orders o WHERE o.track_id = t.id AND o.status = 'approved') as ventas,
             (SELECT COALESCE(SUM(o.producer_earning_cup),0) FROM orders o WHERE o.track_id = t.id AND o.status = 'approved') as ganado
      FROM tracks t WHERE t.producer_id = ? ORDER BY t.plays DESC
    `).all(full.id);
    out.pistas = pistas;
    out.totales = {
      reproducciones: pistas.reduce((s, t) => s + (t.plays || 0), 0),
      likes: pistas.reduce((s, t) => s + (t.likes || 0), 0),
      ventas: pistas.reduce((s, t) => s + (t.ventas || 0), 0),
      ganado: redondear(pistas.reduce((s, t) => s + (t.ganado || 0), 0)),
    };
  }
  if ((full.plan || 'free') === 'studio' && plan === PRODUCER_PLANS.studio) {
    out.bonoLikes = {
      cadaCuantos: cfg.likesPorBono,
      bonoCup: cfg.bonoLikesCup,
      pistas: db.prepare("SELECT id, title, likes, bonus_units_credited FROM tracks WHERE producer_id = ? AND is_playlist = 1 AND approval_status = 'approved' ORDER BY likes DESC").all(full.id),
      ganadoCup: db.prepare("SELECT COALESCE(SUM(amount_cup),0) as t FROM producer_credits WHERE producer_id = ? AND kind = 'likes'").get(full.id).t,
    };
  }
  sendJSON(res, 200, out);
});

route('GET', '/api/admin/orders-history', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const orders = db.prepare(`
    SELECT o.*, p.name as producer_name
    FROM orders o LEFT JOIN producers p ON p.id = o.producer_id
    WHERE o.status IN ('approved', 'rejected') ORDER BY COALESCE(NULLIF(o.approved_at, ''), NULLIF(o.rejected_at, ''), o.created_at) DESC, o.id DESC
    LIMIT 3000
  `).all();
  const oc = clavesOcultas('admin:compras');
  sendJSON(res, 200, { orders: orders.filter(o => !oc.has('orden:' + o.id)), ocultos: contarOcultas('admin:compras') });
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
  const deudaPendienteCup = fullProd ? redondear(saldoDisponible(fullProd.id).total + ((retiroPendiente(fullProd.id) || {}).amount_cup || 0)) : 0;

  for (const r of db.prepare('SELECT receipt_filename FROM plan_requests WHERE producer_id = ?').all(params.id)) {
    if (!r.receipt_filename) continue;
    const fp = path.join(UPLOADS_RECEIPTS, r.receipt_filename);
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch { /* ya no existe */ }
  }
  db.prepare('DELETE FROM plan_requests WHERE producer_id = ?').run(params.id);
  db.prepare("UPDATE producer_withdrawals SET status = 'cancelled', note = 'Productor eliminado', resolved_at = datetime('now') WHERE producer_id = ? AND status = 'pending'").run(params.id);
  db.prepare('DELETE FROM producer_credits WHERE producer_id = ? AND paid = 0').run(params.id);
  db.prepare('UPDATE producers SET referred_by = NULL WHERE referred_by = ?').run(params.id);
  db.prepare('DELETE FROM producer_sessions WHERE producer_id = ?').run(params.id);
  db.prepare('DELETE FROM producers WHERE id = ?').run(params.id);
  const comprasPendientes = db.prepare("SELECT COUNT(*) as c FROM orders WHERE producer_id = ? AND status = 'pending'").get(params.id).c;
  db.prepare("UPDATE orders SET status = 'rejected', reject_reason = 'El productor fue eliminado de la plataforma', rejected_at = datetime('now') WHERE producer_id = ? AND status = 'pending'").run(params.id);
  sendJSON(res, 200, { ok: true, tracksEliminados: tracks.length, ventasConservadas: ventas, deudaPendienteCup, comprasPendientes });
});

route('GET', '/api/admin/preview-audio/:id', (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const track = db.prepare('SELECT audio_filename FROM tracks WHERE id = ?').get(params.id);
  if (!track) return sendJSON(res, 404, { error: 'Pista no encontrada' });
  const ext = path.extname(track.audio_filename).toLowerCase();
  enviarArchivo(req, res, path.join(UPLOADS_AUDIO, track.audio_filename), contentTypeForAudio(ext), { 'Cache-Control': 'no-store' });
});

// El admin puede bajar los archivos que subió un productor para revisarlos antes de aprobar.
route('GET', '/api/admin/tracks/:id/file', (req, res, params, query) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const t = db.prepare('SELECT title, master_filename, mp3_filename, wav_filename, stems_filename FROM tracks WHERE id = ?').get(params.id);
  if (!t) return sendJSON(res, 404, { error: 'Pista no encontrada' });
  const mapa = { master: t.master_filename, mp3: t.mp3_filename || t.master_filename, wav: t.wav_filename, stems: t.stems_filename };
  const nombre = mapa[String(query.get('f') || 'master')];
  if (!nombre) return sendJSON(res, 404, { error: 'Ese archivo no existe' });
  const ext = path.extname(nombre).toLowerCase();
  enviarArchivo(req, res, path.join(UPLOADS_MASTERS, nombre), contentTypeDescarga(ext), {
    'Content-Disposition': dispositionAdjunto(`${t.title} - ${String(query.get('f') || 'master').toUpperCase()}${ext}`),
    'Cache-Control': 'no-store',
  });
});

route('GET', '/api/admin/pending-tracks', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const tracks = db.prepare(`
    SELECT t.*, p.name as producer_name, p.email as producer_email, p.plan as producer_plan
    FROM tracks t
    LEFT JOIN producers p ON p.id = t.producer_id
    WHERE t.approval_status = 'pending'
    ORDER BY t.created_at ASC
  `).all().map(t => ({ ...t, licenses: getTrackLicenses(t.id), archivos: archivosDePista(t) }));
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

// Backup en ZIP que se genera mientras se descarga (no ocupa memoria ni disco).
//  ?tipo=datos     base de datos, portadas/fotos, comprobantes y marca de agua (pesa poco)
//  ?tipo=completo  además previews, masters, WAV y STEMS (puede pesar varios GB)
route('GET', '/api/admin/backup', async (req, res, params, query) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const tipo = query.get('tipo') === 'completo' ? 'completo' : 'datos';
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="zona-beats-${tipo}-${stamp}.zip"`,
    'Cache-Control': 'no-store',
  });
  try {
    const r = await enviarBackup(res, { root: DATA_ROOT, db, tipo });
    res.end();
    console.log(`Backup ${tipo} descargado: ${r.archivos} archivos, ${Math.round(r.bytes / 1024 / 1024)} MB`);
  } catch (err) {
    console.error('Backup interrumpido:', err.message);
    res.destroy();
  }
});

let restaurando = false;
route('POST', '/api/admin/restore', async (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  let d;
  try { d = JSON.parse((await readBody(req, 4096)).toString('utf8') || '{}'); }
  catch { return sendJSON(res, 400, { error: 'Solicitud inválida. Actualiza la página del panel y vuelve a intentarlo.' }); }
  let up;
  try { up = tomarSubida(d.uploadId, 'admin', 'backup'); }
  catch (err) { return sendJSON(res, (err && err.status) || 400, { error: (err && err.error) || 'No se encontró el backup subido' }); }
  if (!up) return sendJSON(res, 400, { error: 'Primero sube el archivo del backup.' });
  if (restaurando) return sendJSON(res, 409, { error: 'Ya hay una restauración en curso. Espera a que termine.' });
  restaurando = true;
  let dbCerrada = false;
  try {
    const r = await restaurarDesdeZip(DATA_ROOT, up.path, {
      abrirDbPrueba: (ruta) => {
        const prueba = new DatabaseSync(ruta);
        try {
          const chequeo = prueba.prepare('PRAGMA quick_check').get();
          if (!chequeo || Object.values(chequeo)[0] !== 'ok') throw new Error('La base de datos del backup está dañada.');
          const tablas = prueba.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(t => t.name);
          if (!tablas.includes('tracks') || !tablas.includes('orders')) throw new Error('Ese archivo no es un backup de Zona Beats.');
        } finally { prueba.close(); }
      },
      cerrarDb: () => { db.close(); dbCerrada = true; },
    });
    try { fs.unlinkSync(up.path); } catch { /* nada */ }
    sendJSON(res, 200, { ok: true, restoredCount: r.archivos, tipo: r.tipo });
    console.log(`Backup restaurado (${r.tipo}, ${r.archivos} archivos). Reiniciando para abrir los datos restaurados…`);
    // Código 1 para que Railway (o Docker) vuelva a levantar el servicio con los datos nuevos.
    setTimeout(() => process.exit(1), 600);
  } catch (err) {
    restaurando = false;
    console.error('Error restaurando backup:', err && err.message);
    sendJSON(res, 400, { error: (err && err.message) || 'No se pudo restaurar el backup' });
    if (dbCerrada) setTimeout(() => process.exit(1), 600);
  }
});

let cacheDisco = { at: 0, bytes: 0 };
function tamanoCarpeta(dir) {
  let total = 0;
  try {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, item.name);
      if (item.isDirectory()) total += tamanoCarpeta(fp);
      else { try { total += fs.statSync(fp).size; } catch { /* nada */ } }
    }
  } catch { /* nada */ }
  return total;
}

route('GET', '/api/admin/summary', (req, res, params, query) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  if (query.get('fresco') === '1') cacheDisco.at = 0;
  // 'YYYY-MM-01' compara bien tanto con fechas '2026-09-01 10:00:00' como '2026-09-01T10:00:00Z'
  const desde = new Date().toISOString().slice(0, 8) + '01';
  const mes = db.prepare(`SELECT COUNT(*) as ventas, COALESCE(SUM(price_cup_at_sale),0) as total,
      COALESCE(SUM(CASE WHEN producer_id IS NULL THEN price_cup_at_sale ELSE price_cup_at_sale - producer_earning_cup END),0) as tuyo
      FROM orders WHERE status = 'approved' AND COALESCE(NULLIF(approved_at, ''), created_at) >= ?`).get(desde);
  const siempre = db.prepare(`SELECT COUNT(*) as ventas, COALESCE(SUM(price_cup_at_sale),0) as total,
      COALESCE(SUM(CASE WHEN producer_id IS NULL THEN price_cup_at_sale ELSE price_cup_at_sale - producer_earning_cup END),0) as tuyo
      FROM orders WHERE status = 'approved'`).get();
  const deuda = db.prepare('SELECT id FROM producers').all().reduce((s, p) => s + deudaConProductor(p.id), 0);
  if (Date.now() - cacheDisco.at > 10 * 60 * 1000) {
    cacheDisco = { at: Date.now(), bytes: tamanoCarpeta(path.join(DATA_ROOT, 'uploads')) + (() => { try { return fs.statSync(path.join(DATA_ROOT, 'db', 'app.db')).size; } catch { return 0; } })() };
  }
  sendJSON(res, 200, {
    mes: { ventas: mes.ventas, total: redondear(mes.total), tuyo: redondear(mes.tuyo) },
    siempre: { ventas: siempre.ventas, total: redondear(siempre.total), tuyo: redondear(siempre.tuyo) },
    deudaProductores: redondear(deuda),
    pendientes: {
      pedidos: db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'").get().c,
      beats: db.prepare("SELECT COUNT(*) as c FROM tracks WHERE approval_status = 'pending'").get().c,
      productores: db.prepare('SELECT COUNT(*) as c FROM producers WHERE approved = 0').get().c,
      planes: db.prepare("SELECT COUNT(*) as c FROM plan_requests WHERE status = 'pending'").get().c,
      retiros: db.prepare("SELECT COUNT(*) as c FROM producer_withdrawals WHERE status = 'pending'").get().c,
    },
    discoBytes: cacheDisco.bytes,
  });
});

route('GET', '/api/admin/orders', (req, res) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const orders = db.prepare(`
    SELECT o.*, p.name as producer_name, t.sold as track_sold, t.is_exclusive as track_exclusive
    FROM orders o LEFT JOIN producers p ON p.id = o.producer_id LEFT JOIN tracks t ON t.id = o.track_id
    WHERE o.status = 'pending' ORDER BY o.created_at ASC
  `).all();
  sendJSON(res, 200, { orders });
});

route('POST', '/api/admin/orders/:id/reject', async (req, res, params) => {
  if (!isAdminAuthed(req)) return sendJSON(res, 401, { error: 'No autorizado' });
  const order = db.prepare('SELECT id, status FROM orders WHERE id = ?').get(params.id);
  if (!order) return sendJSON(res, 404, { error: 'Pedido no encontrado' });
  if (order.status !== 'pending') return sendJSON(res, 409, { error: 'Este pedido ya fue respondido' });
  let reason = '';
  try { const b = await readBody(req, 2048); if (b.length) reason = limpiarTexto(JSON.parse(b.toString('utf8')).reason, 300); }
  catch { return sendJSON(res, 400, { error: 'Solicitud inválida' }); }
  db.prepare("UPDATE orders SET status = 'rejected', reject_reason = ?, rejected_at = datetime('now') WHERE id = ?").run(reason, order.id);
  sendJSON(res, 200, { ok: true });
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
  const trackExiste = db.prepare('SELECT id FROM tracks WHERE id = ?').get(order.track_id);
  if (!trackExiste) {
    return sendJSON(res, 409, { error: 'El beat de este pedido ya fue eliminado, así que no hay archivos que entregar. Recházalo y coordina la devolución con el comprador.' });
  }

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

  // Beats viejos (de antes de exigir los archivos) pueden no tener lo que la licencia promete.
  const pistaCompleta = db.prepare('SELECT * FROM tracks WHERE id = ?').get(order.track_id);
  const arch = archivosDePista(pistaCompleta);
  const faltan = [];
  if (['premium', 'unlimited', 'exclusive'].includes(order.license_type) && !arch.wav) faltan.push('WAV');
  if (['unlimited', 'exclusive'].includes(order.license_type) && !arch.stems) faltan.push('STEMS');
  if (faltan.length) {
    const aviso = `Ojo: este beat no tiene ${faltan.join(' ni ')} subido, así que el comprador solo va a recibir lo que hay. Pídele esos archivos al productor y mándaselos por WhatsApp.`;
    warning = warning ? `${warning}\n\n${aviso}` : aviso;
  }

  // La comisión se recalcula con el plan que el productor tiene HOY (al aprobar),
  // no con el que tenía cuando el cliente mandó el comprobante.
  let commissionPercent = order.commission_percent_at_sale || 0;
  let producerEarning = order.producer_earning_cup || 0;
  const monedaBilletera = order.wallet_currency || 'CUP';
  const pagado = order.wallet_currency ? Number(order.paid_units) || 0 : Number(order.price_cup_at_sale) || 0;
  let producerEarningUnits = Number(order.producer_earning_units) || 0;
  if (order.producer_id) {
    const prodRow = producerFull(order.producer_id);
    if (prodRow) {
      commissionPercent = planEfectivo(prodRow).commission;
      producerEarning = Math.round((order.price_cup_at_sale || 0) * (1 - commissionPercent / 100) * 100) / 100;
      // a la billetera del productor va lo que pagó el comprador, en su moneda, menos la comisión del plan
      producerEarningUnits = redondearMoneda(pagado * (1 - commissionPercent / 100), monedaBilletera);
    }
  }

  const certificateId = generateCertificateId();
  const certificateHash = generateCertificateHash(order, certificateId);
  const buyerToken = order.buyer_token || crypto.randomBytes(24).toString('hex');
  db.prepare(`UPDATE orders SET status = 'approved', certificate_id = ?, certificate_hash = ?,
              commission_percent_at_sale = ?, producer_earning_cup = ?, approved_at = ?, buyer_token = ?, reject_reason = '',
              wallet_currency = ?, paid_units = ?, producer_earning_units = ? WHERE id = ?`)
    .run(certificateId, certificateHash, commissionPercent, producerEarning, new Date().toISOString(), buyerToken,
      monedaBilletera, pagado, order.producer_id ? producerEarningUnits : 0, params.id);

  sendJSON(res, 200, {
    ok: true, trackMarkedSold, wentToVip, warning, certificateId, commissionPercent, producerEarning,
    billetera: order.producer_id ? { moneda: monedaBilletera, etiqueta: etiquetaMoneda(monedaBilletera), unidades: producerEarningUnits, pagado } : null,
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
  // un pedido rechazado se conserva (sin la foto) para que el comprador siga viendo el motivo
  if (order.status === 'rejected') {
    db.prepare("UPDATE orders SET receipt_filename = '' WHERE id = ?").run(params.id);
    return sendJSON(res, 200, { ok: true, keptLicense: false, keptRejected: true });
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

function escaparAtributo(v) {
  return String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Cuando alguien comparte /?pista=ID por WhatsApp, la vista previa muestra la portada y el nombre del beat.
function htmlConVistaPrevia(html, req, query) {
  const perfil = db.prepare('SELECT artist_name, bio FROM profile WHERE id = 1').get() || {};
  const base = baseUrlFrom(req);
  let titulo = perfil.artist_name ? `${perfil.artist_name} · Zona Beats` : 'Zona Beats';
  let descripcion = perfil.bio || 'Beats, licencias y colaboraciones.';
  let imagen = perfil && fs.existsSync(path.join(UPLOADS_COVERS, String((db.prepare('SELECT avatar_filename FROM profile WHERE id = 1').get() || {}).avatar_filename || '-'))) ? `${base}/api/avatar?s=600` : '';
  const id = Number(query && query.get('pista'));
  if (id) {
    const t = db.prepare(`SELECT t.id, t.title, t.genre, t.cover_filename, t.approval_status, p.name as producer_name
                          FROM tracks t LEFT JOIN producers p ON p.id = t.producer_id WHERE t.id = ?`).get(id);
    if (t && t.approval_status === 'approved') {
      titulo = `${t.title}${t.producer_name ? ' · prod. ' + t.producer_name : ''}`;
      descripcion = `${t.genre ? t.genre + ' · ' : ''}Escúchalo en Zona Beats`;
      if (t.cover_filename) imagen = `${base}/api/cover/${t.id}?s=600`;
    }
  }
  const metas = [
    `<meta name="description" content="${escaparAtributo(descripcion)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escaparAtributo(titulo)}">`,
    `<meta property="og:description" content="${escaparAtributo(descripcion)}">`,
    imagen ? `<meta property="og:image" content="${escaparAtributo(imagen)}">` : '',
    `<meta name="twitter:card" content="summary_large_image">`,
  ].filter(Boolean).join('\n');
  return html.replace('<!--OG-->', metas);
}

function serveStatic(req, res, pathname, query) {
  let baseDir = STATIC_DIRS[''];
  let relativePath = pathname;

  if (pathname === '/verify' || pathname.startsWith('/verify/')) {
    return sendFile(res, path.join(STATIC_DIRS[''], 'verify.html'), 'text/html; charset=utf-8');
  }
  if (pathname === '/' || pathname === '/index.html') {
    return fs.readFile(path.join(STATIC_DIRS[''], 'index.html'), 'utf8', (err, html) => {
      if (err) return sendJSON(res, 404, { error: 'No encontrado' });
      let out = html;
      try { out = htmlConVistaPrevia(html, req, query); } catch (e) { console.error('Vista previa:', e.message); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(out);
    });
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
  if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) {
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
      '.webmanifest': 'application/manifest+json',
    };
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.svg' ? 'public, max-age=86400' : 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  aplicarCabecerasSeguridad(res);
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return sendJSON(res, 400, { error: 'Dirección inválida' });
  }
  const pathname = url.pathname;

  try {
    if (pathname.startsWith('/api/')) {
      const matched = matchRoute(req.method, pathname);
      if (!matched) return sendJSON(res, 404, { error: 'Ruta no encontrada' });
      await matched.handler(req, res, matched.params, url.searchParams);
      return;
    }
    serveStatic(req, res, pathname, url.searchParams);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJSON(res, 500, { error: 'Error interno' });
    else res.destroy();
  }
});

// Un error inesperado se registra en los logs en vez de tumbar el servidor para todos.
process.on('unhandledRejection', (err) => { console.error('Promesa rechazada sin manejar:', err); });

limpiarRestosRestauracion(DATA_ROOT);
desactivarVencidos();
limpiarSubidasViejas();
setInterval(() => { desactivarVencidos(); limpiarSubidasViejas(); }, 60 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Panel admin en http://localhost:${PORT}/admin`);
});

// subida de audio grande necesita más de los 2 min por defecto
server.timeout = 10 * 60 * 1000;
server.headersTimeout = 10 * 60 * 1000 + 5000;
server.requestTimeout = 10 * 60 * 1000;
server.keepAliveTimeout = 10 * 60 * 1000;
