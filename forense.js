// Marca de agua forense: deja escondido dentro del sonido el código de cada pedido, para saber de qué
// compra salió un beat filtrado. No se oye (va unos 42 dB por debajo de la música, en la banda de 1,5 a
// 7 kHz) y aguanta convertir a MP3, recortar el inicio y bajar la calidad.
//
// Cómo se lee: con el archivo original a mano (la plataforma lo tiene), se alinea el archivo sospechoso,
// se le resta el original y lo que queda se compara con la marca de cada comprador de ese beat.
// El que da una correlación muy por encima del azar es el pedido del que salió.
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

// la marca se pone y se lee a la frecuencia de muestreo del WAV original (44,1 kHz, 48 kHz, 96 kHz…)
const BLOQUE = 2048;                       // muestras por bloque (la marca sigue el volumen de la música)
const ALFA = Math.pow(10, -42 / 20);       // nivel de la marca respecto de la música
const UMBRAL_Z = 8;                         // a partir de aquí la coincidencia no es casualidad

// ---------- utilidades de audio con ffmpeg ----------
function correr(args, entrada) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: [entrada ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err.trim().slice(-300) || 'ffmpeg falló'))));
    if (entrada) entrada(p);
  });
}
// frecuencia de muestreo de un archivo (44100 si no se puede leer)
function frecuencia(archivo) {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', archivo]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(44100));
    p.on('close', () => { const n = parseInt(out, 10); resolve(n >= 8000 && n <= 192000 ? n : 44100); });
  });
}
// audio en mono, float 32, a la frecuencia `sr` (hasta `maxSeg` segundos)
function decodificarMono(archivo, sr, maxSeg = 600) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', archivo, '-t', String(maxSeg), '-vn',
      '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const partes = []; let err = '';
    p.stdout.on('data', (d) => partes.push(d));
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (c) => {
      if (c !== 0) return reject(new Error(err.trim().slice(-300) || 'no se pudo leer el audio'));
      const b = Buffer.concat(partes);
      const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 4));
      resolve(new Float32Array(ab));
    });
  });
}

// ---------- la marca de cada pedido ----------
function semilla(secreto, codigo) {
  const h = crypto.createHmac('sha256', String(secreto)).update('zb-forense:' + codigo).digest();
  return [h.readUInt32LE(0) || 1, h.readUInt32LE(4) || 2, h.readUInt32LE(8) || 3, h.readUInt32LE(12) || 4];
}
// generador de ruido pseudoaleatorio (xorshift128) + filtro pasa banda: siempre igual para el mismo código
function crearPatron(secreto, codigo, SR) {
  let [x, y, z, w] = semilla(secreto, codigo);
  const rnd = () => {
    const t = (x ^ (x << 11)) >>> 0; x = y; y = z; z = w;
    w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
    return w / 2147483648 - 1;
  };
  const biquad = (tipo, fc) => {
    const w0 = 2 * Math.PI * fc / SR, c = Math.cos(w0), a = Math.sin(w0) / (2 * Math.SQRT1_2);
    const b0 = tipo === 'lp' ? (1 - c) / 2 : (1 + c) / 2, b1 = tipo === 'lp' ? 1 - c : -(1 + c), b2 = b0;
    const a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
    const k = [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (v) => { const o = k[0] * v + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; return o; };
  };
  const lp = biquad('lp', 7000), hp = biquad('hp', 1500);
  // un bloque de marca ya escalado al volumen de ese bloque de música
  return (salida, n, rmsMusica) => {
    let e = 0;
    for (let i = 0; i < n; i++) { const v = hp(lp(rnd())); salida[i] = v; e += v * v; }
    const rmsPat = Math.sqrt(e / Math.max(1, n));
    const g = rmsMusica > 1e-4 && rmsPat > 0 ? ALFA * rmsMusica / rmsPat : 0;
    for (let i = 0; i < n; i++) salida[i] *= g;
  };
}

// ---------- poner la marca: WAV de entrada → WAV marcado (se procesa por partes, poca memoria) ----------
async function marcar(entrada, salidaWav, { secreto, codigo }) {
  const SR = await frecuencia(entrada);
  const bloque = crearPatron(secreto, codigo, SR);
  const marca = new Float32Array(BLOQUE);
  const dec = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', entrada, '-vn', '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  let errDec = '';
  dec.stderr.on('data', (d) => { errDec += d; });
  const fin = new Promise((resolve, reject) => {
    dec.on('error', reject);
    dec.on('close', (c) => (c === 0 ? resolve() : reject(new Error(errDec.trim().slice(-300) || 'no se pudo leer el WAV'))));
  });
  await Promise.all([fin, correr(['-y', '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-i', '-', '-c:a', 'pcm_s24le', salidaWav], (enc) => {
    let resto = Buffer.alloc(0);
    const procesar = (buf, ultimo) => {
      const bytesBloque = BLOQUE * 8;                       // 2 canales × 4 bytes
      let off = 0;
      const salidas = [];
      while (buf.length - off >= bytesBloque || (ultimo && buf.length - off >= 8)) {
        const frames = Math.min(BLOQUE, Math.floor((buf.length - off) / 8));
        const f = new Float32Array(frames * 2);
        for (let i = 0; i < frames * 2; i++) f[i] = buf.readFloatLE(off + i * 4);
        let e = 0;
        for (let i = 0; i < frames; i++) { const m = (f[2 * i] + f[2 * i + 1]) / 2; e += m * m; }
        bloque(marca, frames, Math.sqrt(e / frames));
        for (let i = 0; i < frames; i++) {
          f[2 * i] = Math.max(-1, Math.min(1, f[2 * i] + marca[i]));
          f[2 * i + 1] = Math.max(-1, Math.min(1, f[2 * i + 1] + marca[i]));
        }
        salidas.push(Buffer.from(f.buffer));
        off += frames * 8;
      }
      return { salida: salidas.length ? Buffer.concat(salidas) : null, resto: buf.subarray(off) };
    };
    dec.stdout.on('data', (d) => {
      const r = procesar(Buffer.concat([resto, d]), false);
      resto = Buffer.from(r.resto);
      if (r.salida && !enc.stdin.write(r.salida)) { dec.stdout.pause(); enc.stdin.once('drain', () => dec.stdout.resume()); }
    });
    dec.stdout.on('end', () => {
      const r = procesar(resto, true);
      if (r.salida) enc.stdin.write(r.salida);
      enc.stdin.end();
    });
    enc.stdin.on('error', () => {});
  })]);
  return salidaWav;
}

// ---------- leer la marca ----------
// FFT compleja in situ (radix 2)
function fft(re, im, inversa) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inversa ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
// dónde empieza el sospechoso dentro del original (en muestras), con correlación cruzada
function alinear(orig, sosp, SR) {
  // se busca primero en baja resolución (más baja cuanto más largo el beat, para no gastar memoria)
  const D = Math.max(8, Math.ceil(orig.length / (1 << 20)));
  const dec = (s, max) => { const n = Math.min(Math.floor(s.length / D), max); const o = new Float64Array(n); for (let i = 0; i < n; i++) { let a = 0; for (let k = 0; k < D; k++) a += s[i * D + k]; o[i] = a; } return o; };
  const o = dec(orig, 1 << 20), s = dec(sosp, Math.min(1 << 17, Math.floor(sosp.length / D)));
  let n = 1; while (n < o.length + s.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(o); br.set(s);
  fft(ar, ai, false); fft(br, bi, false);
  for (let i = 0; i < n; i++) { const r = ar[i] * br[i] + ai[i] * bi[i], m = ai[i] * br[i] - ar[i] * bi[i]; ar[i] = r; ai[i] = m; }
  fft(ar, ai, true);
  let mejor = 0, lag = 0;
  for (let i = 0; i < o.length; i++) if (ar[i] > mejor) { mejor = ar[i]; lag = i; }
  // ajuste fino a la muestra
  const L = Math.min(sosp.length, 5 * SR);
  let fino = lag * D, mejorFino = -Infinity;
  for (let d = lag * D - 2 * D; d <= lag * D + 2 * D; d++) {
    if (d < 0 || d + L > orig.length) continue;
    let c = 0;
    for (let i = 0; i < L; i += 2) c += orig[d + i] * sosp[i];
    if (c > mejorFino) { mejorFino = c; fino = d; }
  }
  return fino;
}
// marca completa de un código, del largo del original (mono)
function patronCompleto(orig, secreto, codigo, SR) {
  const bloque = crearPatron(secreto, codigo, SR);
  const w = new Float32Array(orig.length), m = new Float32Array(BLOQUE);
  for (let p = 0; p < orig.length; p += BLOQUE) {
    const n = Math.min(BLOQUE, orig.length - p);
    let e = 0;
    for (let i = 0; i < n; i++) e += orig[p + i] * orig[p + i];
    bloque(m, n, Math.sqrt(e / n));
    w.set(m.subarray(0, n), p);
  }
  return w;
}
// archivoOriginal: el WAV sin marca del beat · archivoSospechoso: lo que apareció · codigos: pedidos candidatos
async function detectar(archivoOriginal, archivoSospechoso, { secreto, codigos }) {
  const SR = await frecuencia(archivoOriginal);
  const orig = await decodificarMono(archivoOriginal, SR);
  // se analizan hasta 10 minutos del original y 5 del archivo sospechoso (sobra para encontrar la marca)
  const sosp = await decodificarMono(archivoSospechoso, SR, 300);
  if (sosp.length < SR * 5) throw new Error('El archivo es muy corto: hacen falta al menos 5 segundos.');
  const lag = alinear(orig, sosp, SR);
  const n = Math.min(sosp.length, orig.length - lag);
  // se resta el original (con la misma ganancia) y queda la marca + el ruido de la conversión
  let so = 0, oo = 0;
  for (let i = 0; i < n; i++) { so += sosp[i] * orig[lag + i]; oo += orig[lag + i] * orig[lag + i]; }
  const g = oo > 0 ? so / oo : 1;
  const res = new Float32Array(n);
  for (let i = 0; i < n; i++) res[i] = sosp[i] - g * orig[lag + i];
  const corr = (codigo) => {
    const w = patronCompleto(orig, secreto, codigo, SR);
    let rw = 0, ww = 0;
    for (let i = 0; i < n; i++) { const v = w[lag + i]; rw += res[i] * v; ww += v * v; }
    return ww > 0 ? rw / Math.sqrt(ww) : 0;
  };
  // referencia del azar: códigos que nunca se usaron
  const nulos = [];
  for (let k = 0; k < 8; k++) nulos.push(corr('nulo-' + k));
  const media = nulos.reduce((a, b) => a + b, 0) / nulos.length;
  const desv = Math.sqrt(nulos.reduce((a, b) => a + (b - media) * (b - media), 0) / nulos.length) || 1e-9;
  const resultados = codigos.map(c => ({ codigo: c, z: (corr(c) - media) / desv }))
    .sort((a, b) => b.z - a.z);
  const mejor = resultados[0];
  return {
    desplazamientoSeg: Math.round(lag / SR * 10) / 10, segundosAnalizados: Math.round(n / SR),
    resultados, encontrado: Boolean(mejor && mejor.z >= UMBRAL_Z && (!resultados[1] || mejor.z - resultados[1].z >= 4)) ? mejor.codigo : null,
  };
}

module.exports = { marcar, detectar, UMBRAL_Z };
