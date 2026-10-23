// Verificación de originalidad de cada audio que se sube.
//  1. Huella acústica propia (Chromaprint, la misma tecnología de AcoustID): se compara con todos
//     los beats de la plataforma y detecta un mismo beat subido dos veces (aunque esté recortado o
//     reconvertido), por ejemplo alguien que compró un beat y lo resube como suyo.
//  2. Servicio externo de reconocimiento (AudD): compara el audio con decenas de millones de
//     canciones publicadas y detecta si el beat ya salió en otra parte o usa samples de canciones
//     conocidas sin aclarar, que es lo que después dispara los reclamos de Content ID.
// Ninguna herramienta pública puede consultar la base privada de Content ID de YouTube: esto
// reduce el riesgo mucho, pero no lo elimina.
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const AUDD_TOKEN = () => process.env.AUDD_API_TOKEN || '';
const AUDD_URL = () => process.env.AUDD_URL || 'https://enterprise.audd.io/';

function ejecutar(cmd, args, { comoBuffer = false, limite = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    let p;
    try { p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { reject(e); return; }
    const out = []; let err = '';
    const reloj = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} tardó demasiado`)); }, limite);
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(reloj); reject(e); });
    p.on('close', (code) => {
      clearTimeout(reloj);
      if (code !== 0) { reject(new Error(`${cmd} terminó con código ${code}: ${err.slice(0, 200)}`)); return; }
      const b = Buffer.concat(out);
      resolve(comoBuffer ? b : b.toString('utf8'));
    });
  });
}

// Huella Chromaprint (enteros de 32 bits, ~8 por segundo). Primero con ffmpeg; si esa versión de
// ffmpeg no trae Chromaprint, con fpcalc (paquete libchromaprint-tools).
async function huella(archivo) {
  let b = null;
  try {
    b = await ejecutar('ffmpeg', ['-v', 'error', '-i', archivo, '-t', '900', '-ac', '1', '-f', 'chromaprint', '-fp_format', 'raw', '-'], { comoBuffer: true });
  } catch { b = null; /* este ffmpeg no trae Chromaprint: se prueba con fpcalc */ }
  if (b) {
    // un audio muy corto da una huella corta (o vacía); quien llama decide si alcanza para comparar
    const arr = new Uint32Array(b.length >> 2);
    for (let i = 0; i < arr.length; i++) arr[i] = b.readUInt32LE(i * 4);
    return arr;
  }
  const txt = await ejecutar('fpcalc', ['-raw', '-json', '-length', '900', archivo]);
  const j = JSON.parse(txt);
  return Uint32Array.from((j.fingerprint || []).map((n) => n >>> 0));
}

const aTexto = (arr) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
const deTexto = (txt) => { const b = Buffer.from(String(txt || ''), 'base64'); const a = new Uint32Array(b.length >> 2); for (let i = 0; i < a.length; i++) a[i] = b.readUInt32LE(i * 4); return a; };

function bits(x) { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; }

// Compara dos huellas buscando el mejor desfase (por si uno está recortado). Devuelve la similitud
// 0..1 (1 = idénticos; dos audios distintos dan alrededor de 0,5) y cuántos segundos coinciden.
function comparar(a, b) {
  if (a.length < 40 || b.length < 40) return { similitud: 0, segundos: 0 };
  const indice = new Map();
  for (let j = 0; j < b.length; j++) {
    const k = b[j] >>> 12;
    let l = indice.get(k); if (!l) { l = []; indice.set(k, l); } if (l.length < 64) l.push(j);
  }
  const votos = new Map();
  for (let i = 0; i < a.length; i++) {
    const l = indice.get(a[i] >>> 12);
    if (!l) continue;
    for (const j of l) { const d = j - i; votos.set(d, (votos.get(d) || 0) + 1); }
  }
  const candidatos = [...votos.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([d]) => d);
  if (!candidatos.includes(0)) candidatos.push(0);
  let mejor = { similitud: 0, segundos: 0 };
  for (const base of candidatos) {
    for (let d = base - 2; d <= base + 2; d++) {
      const ini = Math.max(0, -d), fin = Math.min(a.length, b.length - d);
      const n = fin - ini;
      if (n < 40) continue;
      let dif = 0;
      for (let i = ini; i < fin; i++) dif += bits(a[i] ^ b[i + d]);
      const sim = 1 - dif / (32 * n);
      if (sim > mejor.similitud) mejor = { similitud: sim, segundos: Math.round(n / 7.8) };
    }
  }
  return mejor;
}

// Duración en segundos (ffprobe)
async function duracion(archivo) {
  try {
    const txt = await ejecutar('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', archivo], { limite: 30000 });
    return Math.max(0, Number(String(txt).trim()) || 0);
  } catch { return 0; }
}
// AudD cobra 1 consulta por cada trozo de 12 s que analiza. Con every=1 y skip=2 analiza 1 de cada 3.
const CADA = 1, SALTO = 2, LIMITE = 25;
function consultasPara(segundos, limite = LIMITE, cada = CADA, salto = SALTO) {
  const trozos = Math.max(1, Math.ceil((Number(segundos) || 0) / 12));
  const analizados = Math.ceil(trozos / (cada + salto)) * cada;
  return Math.min(limite, analizados);
}

// Muestra liviana para el servicio externo: mono, 64 kbps, hasta 10 minutos.
async function muestra(archivo) {
  const salida = path.join(os.tmpdir(), `zb-muestra-${crypto.randomUUID()}.mp3`);
  await ejecutar('ffmpeg', ['-v', 'error', '-y', '-i', archivo, '-t', '600', '-ac', '1', '-ar', '22050', '-b:a', '64k', salida]);
  return salida;
}

function externoActivo() { return Boolean(AUDD_TOKEN()); }

// "01:24" o "1:02:03" → segundos
function aSegundos(t) {
  if (typeof t === 'number') return Math.max(0, Math.round(t));
  const partes = String(t || '').split(':').map(Number);
  if (!partes.length || partes.some(n => !Number.isFinite(n))) return 0;
  return partes.reduce((acc, n) => acc * 60 + n, 0);
}

// Reconocimiento externo con AudD: revisa 12 s de cada 36 s del audio (unas 5 consultas por beat
// de 3 minutos). Devuelve las canciones publicadas que coinciden.
async function reconocerExterno(archivo) {
  if (!externoActivo()) return null;
  const tmp = await muestra(archivo);
  try {
    const fd = new FormData();
    fd.append('api_token', AUDD_TOKEN());
    fd.append('every', String(CADA));
    fd.append('skip', String(SALTO));
    fd.append('limit', String(LIMITE));
    fd.append('accurate_offsets', 'true');
    fd.append('file', new Blob([fs.readFileSync(tmp)], { type: 'audio/mpeg' }), 'muestra.mp3');
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), 5 * 60 * 1000);
    let res;
    try { res = await fetch(AUDD_URL(), { method: 'POST', body: fd, signal: ctrl.signal }); } finally { clearTimeout(reloj); }
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.status !== 'success') {
      const msg = (d.error && (d.error.error_message || d.error.message)) || `respuesta ${res.status}`;
      throw new Error('El servicio de reconocimiento falló: ' + msg);
    }
    const vistos = new Map();
    for (const trozo of (Array.isArray(d.result) ? d.result : [])) {
      for (const s of (trozo.songs || [])) {
        const clave = `${s.artist}|${s.title}`.toLowerCase();
        const previo = vistos.get(clave);
        if (previo) { previo.veces++; continue; }
        vistos.set(clave, {
          titulo: String(s.title || ''), artista: String(s.artist || ''), album: String(s.album || ''),
          sello: String(s.label || ''), fecha: String(s.release_date || ''), enlace: String(s.song_link || ''),
          segundo: aSegundos(trozo.offset) + Math.round((Number(s.start_offset) || 0) / 1000),
          enOriginal: String(s.timecode || ''), score: Number(s.score) || 0, veces: 1,
        });
      }
    }
    const lista = [...vistos.values()].slice(0, 15);
    lista.consultas = consultasPara(await duracion(tmp));
    return lista;
  } finally {
    fs.promises.unlink(tmp).catch(() => {});
  }
}

// Prueba de conexión: AudD reconoce su propia canción de ejemplo (gasta 1 o 2 consultas)
async function probarExterno() {
  if (!externoActivo()) return { ok: false, error: 'Falta AUDD_API_TOKEN' };
  try {
    // se descarga la canción de ejemplo de AudD y se envía como archivo
    // (enviar solo el enlace está reservado a los planes de pago)
    const ej = await fetch(process.env.AUDD_EJEMPLO_URL || 'https://audd.tech/example.mp3'); // la variable solo sirve para pruebas
    if (!ej.ok) return { ok: false, error: 'No se pudo descargar la canción de prueba de AudD' };
    const audio = Buffer.from(await ej.arrayBuffer());
    if (audio.length > 15 * 1024 * 1024) return { ok: false, error: 'La canción de prueba es demasiado grande' };
    const fd = new FormData();
    fd.append('api_token', AUDD_TOKEN());
    fd.append('limit', '2');
    fd.append('file', new Blob([audio], { type: 'audio/mpeg' }), 'example.mp3');
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), 60000);
    let res;
    try { res = await fetch(AUDD_URL(), { method: 'POST', body: fd, signal: ctrl.signal }); } finally { clearTimeout(reloj); }
    const d = await res.json().catch(() => ({}));
    if (d.status !== 'success') return { ok: false, error: (d.error && (d.error.error_message || d.error.message)) || `respuesta ${res.status}` };
    const canciones = [];
    for (const t of (Array.isArray(d.result) ? d.result : [])) for (const c of (t.songs || [])) canciones.push(`${c.artist} — ${c.title}`);
    return { ok: true, canciones: [...new Set(canciones)], consultas: Math.max(1, Math.min(2, (Array.isArray(d.result) ? d.result.length : 1))) };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'AudD no respondió a tiempo' : e.message };
  }
}

module.exports = { huella, comparar, aTexto, deTexto, reconocerExterno, externoActivo, probarExterno, consultasPara };
