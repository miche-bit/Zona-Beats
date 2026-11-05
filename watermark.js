const { spawn } = require('node:child_process');
const fs = require('node:fs');

const MAX_DURATION_SECONDS = 60 * 60; // 1 hora

function runFfmpeg(args, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);
    let stderr = '';
    const timer = setTimeout(() => { proc.kill('SIGKILL'); }, timeoutMs);
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); if (stderr.length > 20000) stderr = stderr.slice(-4000); });
    proc.on('error', (err) => { clearTimeout(timer); reject(new Error(`No se pudo ejecutar ffmpeg: ${err.message}`)); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg terminó con código ${code}: ${stderr.slice(-800)}`));
    });
  });
}

// Bits por muestra de un WAV (16, 24, 32…). 0 si no se pudo leer.
function bitsWav(filePath) {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=bits_per_sample,bits_per_raw_sample,sample_fmt', '-of', 'json', filePath]);
    let out = '';
    proc.stdout.on('data', (c) => { out += c; });
    proc.on('error', () => resolve(0));
    proc.on('close', () => {
      try {
        const s = (JSON.parse(out).streams || [])[0] || {};
        const b = Number(s.bits_per_raw_sample) || Number(s.bits_per_sample) || 0;
        resolve(b || (/^(s32|flt|dbl)/.test(s.sample_fmt || '') ? 32 : 0));
      } catch { resolve(0); }
    });
  });
}

function getDurationSeconds(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath,
    ]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => reject(new Error(`No se pudo ejecutar ffprobe: ${err.message}`)));
    proc.on('close', (code) => {
      const seconds = parseFloat(stdout.trim());
      if (code !== 0 || isNaN(seconds)) {
        reject(new Error(`No se pudo leer la duración del audio: ${stderr.slice(-400)}`));
        return;
      }
      resolve(seconds);
    });
  });
}

// Parámetros de salida según la extensión: los previews van en MP3 (livianos para los datos móviles).
function salidaAudio(outputPath, kbps) {
  if (/\.mp3$/i.test(outputPath)) return ['-codec:a', 'libmp3lame', '-b:a', `${kbps}k`];
  return [];
}

/**
 * Mezcla una marca de agua de voz sobre una pista completa, repitiéndola cada
 * `intervalSeconds` a volumen `volume` (0 a 1). Si outputPath termina en .mp3 sale en MP3.
 * Si algo falla, lanza un error — quien llama decide si aborta la subida o no.
 */
async function applyWatermark({ inputPath, watermarkPath, outputPath, intervalSeconds, volume, kbps = 192 }) {
  if (!fs.existsSync(inputPath)) throw new Error('Archivo de audio de entrada no encontrado');
  if (!fs.existsSync(watermarkPath)) throw new Error('Archivo de marca de agua no encontrado');

  const duration = await getDurationSeconds(inputPath);
  if (duration > MAX_DURATION_SECONDS) {
    throw new Error(`El audio dura más de ${MAX_DURATION_SECONDS / 60} minutos, no se puede procesar`);
  }

  const safeInterval = Math.max(5, Math.min(600, Number(intervalSeconds) || 20));
  const safeVolume = Math.max(0.05, Math.min(1, Number(volume) || 0.35));

  // aloop repite el bloque voz+silencio hasta cubrir toda la pista
  const loopBufferSamples = Math.round(safeInterval * 44100);

  const filterComplex =
    `[1:a]aformat=sample_rates=44100:channel_layouts=mono,` +
    `apad=whole_dur=${safeInterval},` +
    `aloop=loop=-1:size=${loopBufferSamples}[wm];` +
    `[0:a][wm]amix=inputs=2:duration=first:dropout_transition=0:weights=1 ${safeVolume}[out]`;

  await runFfmpeg([
    '-y',
    '-i', inputPath,
    '-i', watermarkPath,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-ar', '44100',
    '-ac', '2',
    '-t', String(duration),
    ...salidaAudio(outputPath, kbps),
    outputPath,
  ]);

  return outputPath;
}

// Convierte cualquier audio a MP3 (para el preview liviano o para entregar el MP3 de la licencia).
async function transcodificarMp3(inputPath, outputPath, kbps) {
  await runFfmpeg(['-y', '-i', inputPath, '-vn', '-map_metadata', '-1', '-ar', '44100', '-ac', '2',
    '-codec:a', 'libmp3lame', '-b:a', `${kbps}k`, outputPath]);
  return outputPath;
}

// Miniatura cuadrada en JPG para que la tienda no descargue portadas de 3000x3000.
async function miniaturaImagen(inputPath, outputPath, lado) {
  await runFfmpeg(['-y', '-i', inputPath,
    '-vf', `scale=${lado}:${lado}:force_original_aspect_ratio=increase,crop=${lado}:${lado}`,
    '-frames:v', '1', '-q:v', '4', outputPath], 60 * 1000);
  return outputPath;
}

// Demo de la Básica práctica: el primer minuto del beat, con un fundido corto al final.
// Sale en MP3 de 320 kbps o en WAV, según la extensión de salida.
async function cortarDemo(inputPath, outputPath, segundos = 60) {
  const wav = /\.wav$/i.test(outputPath);
  await runFfmpeg(['-y', '-i', inputPath, '-vn', '-map_metadata', '-1', '-t', String(segundos),
    '-af', `afade=t=out:st=${Math.max(0, segundos - 3)}:d=3`, '-ar', '44100', '-ac', '2',
    ...(wav ? ['-codec:a', 'pcm_s16le'] : ['-codec:a', 'libmp3lame', '-b:a', '320k']), outputPath]);
  return outputPath;
}

// Muestra de la tienda (plan Free): un tramo de `segundos` desde `inicio`, con fundido al entrar y al salir.
async function cortarMuestra(inputPath, outputPath, inicio = 0, segundos = 60, kbps = 192) {
  const st = Math.max(0, Number(inicio) || 0);
  await runFfmpeg(['-y', '-ss', String(st), '-i', inputPath, '-vn', '-map_metadata', '-1', '-t', String(segundos),
    '-af', `afade=t=in:st=0:d=1,afade=t=out:st=${Math.max(0, segundos - 2)}:d=2`, '-ar', '44100', '-ac', '2',
    '-codec:a', 'libmp3lame', '-b:a', `${kbps}k`, outputPath]);
  return outputPath;
}

// Marca invisible: deja dentro del archivo (metadatos) a quién se entregó y el número de su licencia.
// No cambia el sonido; si el archivo aparece en otro lado, dice de qué compra salió.
async function marcarEntrega(inputPath, outputPath, { comentario, titulo, artista }) {
  await runFfmpeg(['-y', '-i', inputPath, '-map', '0:a', '-c', 'copy', '-map_metadata', '-1',
    '-metadata', `title=${titulo || ''}`, '-metadata', `artist=${artista || ''}`,
    '-metadata', `comment=${comentario || ''}`, '-metadata', `copyright=${comentario || ''}`, outputPath]);
  return outputPath;
}

module.exports = { applyWatermark, bitsWav, getDurationSeconds, transcodificarMp3, miniaturaImagen, cortarDemo, cortarMuestra, marcarEntrega };
