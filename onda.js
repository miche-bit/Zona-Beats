// Forma de onda de cada beat, para dibujarla en la tienda y en el reproductor.
// Se calcula una sola vez por pista con ffmpeg y se guarda como texto corto: 64 barras con
// alturas de 1 a 35 escritas en base 36 (un carácter por barra).
'use strict';

const { spawn } = require('child_process');

const BARRAS = 64;

function decodificar(archivo) {
  return new Promise((resolve, reject) => {
    let p;
    // mono a 4000 Hz alcanza para el dibujo y es muy rápido (hasta 10 minutos de audio)
    try { p = spawn('ffmpeg', ['-v', 'error', '-i', archivo, '-t', '600', '-ac', '1', '-ar', '4000', '-f', 's16le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { reject(e); return; }
    const partes = []; let err = '';
    const reloj = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('ffmpeg tardó demasiado')); }, 90000);
    p.stdout.on('data', (d) => partes.push(d));
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(reloj); reject(e); });
    p.on('close', (code) => {
      clearTimeout(reloj);
      if (code !== 0) { reject(new Error('ffmpeg: ' + err.slice(0, 160))); return; }
      resolve(Buffer.concat(partes));
    });
  });
}

// Devuelve el texto de la onda ('' si el audio es demasiado corto para dibujarla)
async function calcular(archivo) {
  const pcm = await decodificar(archivo);
  const muestras = pcm.length >> 1;
  if (muestras < BARRAS * 8) return '';
  const tam = Math.floor(muestras / BARRAS);
  const niveles = [];
  for (let b = 0; b < BARRAS; b++) {
    let suma = 0, pico = 0;
    for (let i = b * tam, fin = (b + 1) * tam; i < fin; i++) {
      const v = Math.abs(pcm.readInt16LE(i * 2));
      suma += v * v;
      if (v > pico) pico = v;
    }
    // mezcla de energía y pico: se ven los golpes sin que todo quede al tope
    niveles.push(Math.sqrt(suma / tam) * 0.75 + pico * 0.25);
  }
  const max = Math.max(...niveles);
  if (!max) return '';
  // los beats masterizados suenan parejo: se estira el rango para que se lean las partes del tema
  const ordenados = [...niveles].sort((a, b) => a - b);
  const piso = ordenados[Math.floor(BARRAS * 0.1)] * 0.55;
  return niveles.map((v) => {
    const r = Math.max(0, (v - piso) / (max - piso || 1));
    return Math.max(2, Math.round(Math.pow(r, 0.85) * 35)).toString(36);
  }).join('');
}

module.exports = { calcular, BARRAS };
