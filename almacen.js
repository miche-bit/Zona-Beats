// Almacenamiento externo compatible con S3 (Railway Storage Buckets, Cloudflare R2, Backblaze B2…).
// Sirve para los archivos enormes (Sample Packs de hasta 20 GB y STEMS): Railway corta cualquier
// petición a la app a los 15 minutos, así que una descarga de varios GB con conexión lenta nunca
// terminaría pasando por el servidor. Desde el almacenamiento, el comprador descarga directo con un
// enlace firmado y su navegador puede retomar si se corta.
// Sin dependencias: firma AWS Signature V4 con el módulo crypto de Node.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');

const env = (...nombres) => { for (const n of nombres) if (process.env[n]) return process.env[n]; return ''; };
const CFG = {
  endpoint: env('S3_ENDPOINT', 'BUCKET_ENDPOINT', 'ENDPOINT').replace(/\/+$/, ''),
  bucket: env('S3_BUCKET', 'BUCKET'),
  region: env('S3_REGION', 'BUCKET_REGION', 'REGION') || 'auto',
  accessKey: env('S3_ACCESS_KEY_ID', 'BUCKET_ACCESS_KEY_ID', 'ACCESS_KEY_ID'),
  secretKey: env('S3_SECRET_ACCESS_KEY', 'BUCKET_SECRET_ACCESS_KEY', 'SECRET_ACCESS_KEY'),
  pathStyle: /^(1|true|si|sí)$/i.test(env('S3_PATH_STYLE', 'BUCKET_PATH_STYLE')),
};
const PARTE = Math.max(5, Number(env('S3_PART_MB')) || 64) * 1024 * 1024;

function activo() {
  return Boolean(CFG.endpoint && CFG.bucket && CFG.accessKey && CFG.secretKey);
}

const sha256 = (d) => crypto.createHash('sha256').update(d).digest('hex');
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
// codificación RFC 3986 que exige la firma
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encRuta = (key) => key.split('/').map(enc).join('/');

function destino(key) {
  const u = new URL(CFG.endpoint);
  if (CFG.pathStyle) return { protocolo: u.protocol, host: u.host, ruta: `/${enc(CFG.bucket)}/${encRuta(key)}` };
  return { protocolo: u.protocol, host: `${CFG.bucket}.${u.host}`, ruta: `/${encRuta(key)}` };
}

function fechas() {
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amz, dia: amz.slice(0, 8) };
}
function claveFirma(dia) {
  return hmac(hmac(hmac(hmac('AWS4' + CFG.secretKey, dia), CFG.region), 's3'), 'aws4_request');
}
function consultaCanonica(q) {
  return Object.keys(q).sort().map(k => `${enc(k)}=${enc(String(q[k]))}`).join('&');
}

// Firma una petición con cabecera Authorization
function firmar(metodo, key, consulta, hashCuerpo, extra = {}) {
  const d = destino(key);
  const { amz, dia } = fechas();
  const cab = { host: d.host, 'x-amz-content-sha256': hashCuerpo, 'x-amz-date': amz, ...extra };
  const nombres = Object.keys(cab).map(k => k.toLowerCase()).sort();
  const canon = [metodo, d.ruta, consultaCanonica(consulta),
    nombres.map(n => `${n}:${String(cab[Object.keys(cab).find(k => k.toLowerCase() === n)]).trim()}\n`).join(''),
    nombres.join(';'), hashCuerpo].join('\n');
  const alcance = `${dia}/${CFG.region}/s3/aws4_request`;
  const firma = hmac(claveFirma(dia), ['AWS4-HMAC-SHA256', amz, alcance, sha256(canon)].join('\n')).toString('hex');
  cab.Authorization = `AWS4-HMAC-SHA256 Credential=${CFG.accessKey}/${alcance}, SignedHeaders=${nombres.join(';')}, Signature=${firma}`;
  const q = consultaCanonica(consulta);
  return { d, cab, ruta: d.ruta + (q ? '?' + q : '') };
}

function pedir(metodo, key, consulta, { cuerpo = null, flujo = null, largo = null, hashCuerpo, extra = {} } = {}) {
  const hash = hashCuerpo || (cuerpo != null ? sha256(cuerpo) : flujo ? 'UNSIGNED-PAYLOAD' : sha256(''));
  const { d, cab, ruta } = firmar(metodo, key, consulta, hash, extra);
  if (cuerpo != null) cab['Content-Length'] = Buffer.byteLength(cuerpo);
  else if (largo != null) cab['Content-Length'] = largo;
  const lib = d.protocolo === 'http:' ? http : https;
  const [nombreHost, puerto] = d.host.split(':');
  return new Promise((resolve, reject) => {
    const req = lib.request({ method: metodo, host: nombreHost, port: puerto || undefined, path: ruta, headers: cab, timeout: 10 * 60 * 1000 }, (res) => {
      const trozos = [];
      res.on('data', (c) => trozos.push(c));
      res.on('end', () => {
        const texto = Buffer.concat(trozos).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ status: res.statusCode, headers: res.headers, texto });
        else reject(Object.assign(new Error(`Almacenamiento respondió ${res.statusCode}: ${texto.slice(0, 300)}`), { status: res.statusCode }));
      });
    });
    req.on('timeout', () => req.destroy(new Error('El almacenamiento tardó demasiado en responder')));
    req.on('error', reject);
    if (flujo) { flujo.on('error', (e) => req.destroy(e)); flujo.pipe(req); }
    else req.end(cuerpo != null ? cuerpo : undefined);
  });
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));
async function conReintentos(fn, veces = 4) {
  let ultimo;
  for (let i = 0; i < veces; i++) {
    try { return await fn(); } catch (e) { ultimo = e; if (e.status && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) break; await esperar(2000 * (i + 1)); }
  }
  throw ultimo;
}

// Sube un archivo del disco por partes (subida multiparte de S3). Devuelve el tamaño subido.
async function subirArchivo(ruta, key, { tipo = 'application/octet-stream', alAvanzar } = {}) {
  if (!activo()) throw new Error('Almacenamiento externo no configurado');
  const tam = fs.statSync(ruta).size;
  if (tam <= PARTE) {
    await conReintentos(() => pedir('PUT', key, {}, { flujo: fs.createReadStream(ruta), largo: tam, extra: { 'content-type': tipo } }));
    if (alAvanzar) alAvanzar(tam, tam);
    return tam;
  }
  const ini = await conReintentos(() => pedir('POST', key, { uploads: '' }, { cuerpo: '', extra: { 'content-type': tipo } }));
  const uploadId = (ini.texto.match(/<UploadId>([^<]+)<\/UploadId>/) || [])[1];
  if (!uploadId) throw new Error('El almacenamiento no devolvió un número de subida');
  const partes = [];
  try {
    for (let n = 1, pos = 0; pos < tam; n++, pos += PARTE) {
      const fin = Math.min(tam, pos + PARTE) - 1;
      const r = await conReintentos(() => pedir('PUT', key, { partNumber: n, uploadId },
        { flujo: fs.createReadStream(ruta, { start: pos, end: fin }), largo: fin - pos + 1 }));
      partes.push({ n, etag: r.headers.etag });
      if (alAvanzar) alAvanzar(fin + 1, tam);
    }
    const xml = '<CompleteMultipartUpload>' + partes.map(p => `<Part><PartNumber>${p.n}</PartNumber><ETag>${p.etag}</ETag></Part>`).join('') + '</CompleteMultipartUpload>';
    const fin = await conReintentos(() => pedir('POST', key, { uploadId }, { cuerpo: xml, extra: { 'content-type': 'application/xml' } }));
    if (/<Error>/.test(fin.texto)) throw new Error('El almacenamiento rechazó unir las partes: ' + fin.texto.slice(0, 200));
    return tam;
  } catch (e) {
    pedir('DELETE', key, { uploadId }).catch(() => {});
    throw e;
  }
}

async function tamano(key) {
  const r = await pedir('HEAD', key, {});
  return Number(r.headers['content-length']) || 0;
}

function borrar(key) {
  if (!activo() || !key) return Promise.resolve();
  return conReintentos(() => pedir('DELETE', key, {}), 3).catch((e) => console.error('No se pudo borrar del almacenamiento:', key, e.message));
}

// Enlace de descarga firmado: el navegador baja directo del almacenamiento y puede retomar.
function enlaceFirmado(key, { segundos = 6 * 24 * 3600, nombre } = {}) {
  const d = destino(key);
  const { amz, dia } = fechas();
  const alcance = `${dia}/${CFG.region}/s3/aws4_request`;
  const q = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${CFG.accessKey}/${alcance}`,
    'X-Amz-Date': amz,
    'X-Amz-Expires': String(Math.min(segundos, 7 * 24 * 3600)),
    'X-Amz-SignedHeaders': 'host',
  };
  if (nombre) {
    const ascii = String(nombre).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    q['response-content-disposition'] = `attachment; filename="${ascii}"; filename*=UTF-8''${enc(nombre)}`;
  }
  const canon = ['GET', d.ruta, consultaCanonica(q), `host:${d.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const firma = hmac(claveFirma(dia), ['AWS4-HMAC-SHA256', amz, alcance, sha256(canon)].join('\n')).toString('hex');
  return `${d.protocolo}//${d.host}${d.ruta}?${consultaCanonica(q)}&X-Amz-Signature=${firma}`;
}

module.exports = { activo, subirArchivo, tamano, borrar, enlaceFirmado, CFG_PUBLICA: () => ({ activo: activo(), endpoint: CFG.endpoint, bucket: CFG.bucket ? CFG.bucket.slice(0, 4) + '…' : '' }) };
