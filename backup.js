// Copias de seguridad en ZIP que se generan y se restauran por partes (streaming):
// nunca se carga el backup entero en memoria, así sirve aunque haya WAV y STEMS de varios GB.
// Soporta ZIP64 (archivos o backups de más de 4 GB).
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');

const MAX32 = 0xffffffff;

// ---------- CRC32 con tabla ----------
const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crcActualizar(crc, buf) {
  let c = crc ^ -1;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function dosFechaHora(fecha) {
  const d = fecha instanceof Date && !isNaN(fecha) ? fecha : new Date();
  const anio = Math.max(1980, d.getFullYear());
  return {
    hora: ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f),
    dia: (((anio - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f),
  };
}

// Qué carpetas lleva cada tipo de backup.
//  - datos: base de datos + portadas/fotos + comprobantes + marca de agua (pesa poco)
//  - completo: además los previews, los masters, WAV y STEMS
const CARPETAS = {
  datos: ['covers', 'receipts', 'watermark'],
  completo: ['audio', 'covers', 'receipts', 'watermark', 'masters'],
};
const CARPETAS_VALIDAS = new Set(CARPETAS.completo);
const MANIFIESTO = 'zonabeats-backup.json';

function listarArchivos(root, relDir, out) {
  let items;
  try { items = fs.readdirSync(path.join(root, relDir), { withFileTypes: true }); } catch { return; }
  for (const it of items) {
    if (it.name === '.gitkeep' || it.name.endsWith('.tmp.jpg')) continue;
    const rel = `${relDir}/${it.name}`;
    if (rel === 'uploads/covers/thumbs') continue; // miniaturas: se regeneran solas
    if (it.isDirectory()) listarArchivos(root, rel, out);
    else if (it.isFile()) {
      try {
        const st = fs.statSync(path.join(root, rel));
        out.push({ nombre: rel, ruta: path.join(root, rel), tamano: st.size, fecha: st.mtime });
      } catch { /* se borró mientras se listaba */ }
    }
  }
}

function esperarDrenaje(salida) {
  return new Promise((resolve, reject) => {
    const alDrenar = () => { limpiar(); resolve(); };
    const alCerrar = () => { limpiar(); reject(new Error('La descarga se cortó')); };
    const limpiar = () => { salida.off('drain', alDrenar); salida.off('close', alCerrar); salida.off('error', alCerrar); };
    salida.on('drain', alDrenar);
    salida.on('close', alCerrar);
    salida.on('error', alCerrar);
  });
}

class EscritorZip {
  constructor(salida) {
    this.salida = salida;
    this.offset = 0;
    this.entradas = [];
  }

  async escribir(buf) {
    if (this.salida.destroyed) throw new Error('La descarga se cortó');
    this.offset += buf.length;
    if (!this.salida.write(buf)) await esperarDrenaje(this.salida);
  }

  cabeceraLocal(nombreBuf, metodo, fecha, zip64, conDescriptor, crc, comprimido, original) {
    const extra = zip64 ? Buffer.alloc(20) : Buffer.alloc(0);
    if (zip64) {
      extra.writeUInt16LE(0x0001, 0);
      extra.writeUInt16LE(16, 2);
      extra.writeBigUInt64LE(BigInt(conDescriptor ? 0 : original), 4);
      extra.writeBigUInt64LE(BigInt(conDescriptor ? 0 : comprimido), 12);
    }
    const { hora, dia } = dosFechaHora(fecha);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(zip64 ? 45 : 20, 4);
    h.writeUInt16LE((conDescriptor ? 0x0008 : 0) | 0x0800, 6); // 0x0800 = nombres en UTF-8
    h.writeUInt16LE(metodo, 8);
    h.writeUInt16LE(hora, 10);
    h.writeUInt16LE(dia, 12);
    h.writeUInt32LE(conDescriptor ? 0 : crc, 14);
    h.writeUInt32LE(zip64 ? MAX32 : (conDescriptor ? 0 : comprimido), 18);
    h.writeUInt32LE(zip64 ? MAX32 : (conDescriptor ? 0 : original), 22);
    h.writeUInt16LE(nombreBuf.length, 26);
    h.writeUInt16LE(extra.length, 28);
    return Buffer.concat([h, nombreBuf, extra]);
  }

  // Un buffer ya en memoria (la base de datos y el manifiesto): se comprime y se conocen sus datos antes.
  async agregarBuffer(nombre, datos, fecha) {
    const nombreBuf = Buffer.from(nombre, 'utf8');
    const comprimido = zlib.deflateRawSync(datos, { level: 6 });
    const crc = crcActualizar(0, datos);
    const inicio = this.offset;
    await this.escribir(this.cabeceraLocal(nombreBuf, 8, fecha, false, false, crc, comprimido.length, datos.length));
    await this.escribir(comprimido);
    this.entradas.push({ nombreBuf, metodo: 8, fecha, crc, comprimido: comprimido.length, original: datos.length, inicio, flags: 0x0800, zip64Local: false });
  }

  // Un archivo del disco: se copia tal cual (audio e imágenes ya vienen comprimidos) leyendo por partes.
  async agregarArchivo(nombre, ruta, tamanoEsperado, fecha) {
    const nombreBuf = Buffer.from(nombre, 'utf8');
    const zip64Local = tamanoEsperado >= 0xffff0000;
    const inicio = this.offset;
    await this.escribir(this.cabeceraLocal(nombreBuf, 0, fecha, zip64Local, true, 0, 0, 0));
    let crc = 0;
    let leidos = 0;
    const lector = fs.createReadStream(ruta, { highWaterMark: 1024 * 1024 });
    try {
      for await (const trozo of lector) {
        crc = crcActualizar(crc, trozo);
        leidos += trozo.length;
        await this.escribir(trozo);
      }
    } finally {
      lector.destroy();
    }
    const desc = Buffer.alloc(zip64Local ? 24 : 16);
    desc.writeUInt32LE(0x08074b50, 0);
    desc.writeUInt32LE(crc, 4);
    if (zip64Local) {
      desc.writeBigUInt64LE(BigInt(leidos), 8);
      desc.writeBigUInt64LE(BigInt(leidos), 16);
    } else {
      desc.writeUInt32LE(leidos, 8);
      desc.writeUInt32LE(leidos, 12);
    }
    await this.escribir(desc);
    this.entradas.push({ nombreBuf, metodo: 0, fecha, crc, comprimido: leidos, original: leidos, inicio, flags: 0x0808, zip64Local });
  }

  async terminar() {
    const inicioCentral = this.offset;
    for (const e of this.entradas) {
      const grandes = [];
      if (e.original >= MAX32) grandes.push(e.original);
      if (e.comprimido >= MAX32) grandes.push(e.comprimido);
      if (e.inicio >= MAX32) grandes.push(e.inicio);
      const extra = grandes.length ? Buffer.alloc(4 + grandes.length * 8) : Buffer.alloc(0);
      if (grandes.length) {
        extra.writeUInt16LE(0x0001, 0);
        extra.writeUInt16LE(grandes.length * 8, 2);
        grandes.forEach((v, i) => extra.writeBigUInt64LE(BigInt(v), 4 + i * 8));
      }
      const necesita64 = grandes.length > 0 || e.zip64Local;
      const { hora, dia } = dosFechaHora(e.fecha);
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(necesita64 ? 45 : 20, 4);
      c.writeUInt16LE(necesita64 ? 45 : 20, 6);
      c.writeUInt16LE(e.flags, 8);
      c.writeUInt16LE(e.metodo, 10);
      c.writeUInt16LE(hora, 12);
      c.writeUInt16LE(dia, 14);
      c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(Math.min(e.comprimido, MAX32), 20);
      c.writeUInt32LE(Math.min(e.original, MAX32), 24);
      c.writeUInt16LE(e.nombreBuf.length, 28);
      c.writeUInt16LE(extra.length, 30);
      c.writeUInt16LE(0, 32);
      c.writeUInt16LE(0, 34);
      c.writeUInt16LE(0, 36);
      c.writeUInt32LE(0, 38);
      c.writeUInt32LE(Math.min(e.inicio, MAX32), 42);
      await this.escribir(Buffer.concat([c, e.nombreBuf, extra]));
    }
    const tamanoCentral = this.offset - inicioCentral;
    const total = this.entradas.length;
    if (inicioCentral >= MAX32 || tamanoCentral >= MAX32 || total >= 0xffff) {
      const inicioZ64 = this.offset;
      const z = Buffer.alloc(56);
      z.writeUInt32LE(0x06064b50, 0);
      z.writeBigUInt64LE(44n, 4);
      z.writeUInt16LE(45, 12);
      z.writeUInt16LE(45, 14);
      z.writeUInt32LE(0, 16);
      z.writeUInt32LE(0, 20);
      z.writeBigUInt64LE(BigInt(total), 24);
      z.writeBigUInt64LE(BigInt(total), 32);
      z.writeBigUInt64LE(BigInt(tamanoCentral), 40);
      z.writeBigUInt64LE(BigInt(inicioCentral), 48);
      const loc = Buffer.alloc(20);
      loc.writeUInt32LE(0x07064b50, 0);
      loc.writeUInt32LE(0, 4);
      loc.writeBigUInt64LE(BigInt(inicioZ64), 8);
      loc.writeUInt32LE(1, 16);
      await this.escribir(Buffer.concat([z, loc]));
    }
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0);
    fin.writeUInt16LE(Math.min(total, 0xffff), 8);
    fin.writeUInt16LE(Math.min(total, 0xffff), 10);
    fin.writeUInt32LE(Math.min(tamanoCentral, MAX32), 12);
    fin.writeUInt32LE(Math.min(inicioCentral, MAX32), 16);
    await this.escribir(fin);
  }
}

/**
 * Escribe el backup en `salida` (la respuesta HTTP) mientras se genera.
 * La base de datos se copia con VACUUM INTO para tener una foto coherente aunque haya ventas entrando.
 */
async function enviarBackup(salida, { root, db, tipo }) {
  const clase = CARPETAS[tipo] ? tipo : 'datos';
  const tmpDir = path.join(root, 'uploads', 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const foto = path.join(tmpDir, `backup-db-${process.pid}-${Date.now()}.db`);
  try {
    db.exec(`VACUUM INTO '${foto.replace(/'/g, "''")}'`);
    const datosDb = fs.readFileSync(foto);
    const archivos = [];
    for (const carpeta of CARPETAS[clase]) listarArchivos(root, `uploads/${carpeta}`, archivos);
    const zip = new EscritorZip(salida);
    const ahora = new Date();
    await zip.agregarBuffer(MANIFIESTO, Buffer.from(JSON.stringify({
      app: 'zona-beats', version: 2, tipo: clase, creado: ahora.toISOString(), archivos: archivos.length,
    }, null, 2)), ahora);
    await zip.agregarBuffer('db/app.db', datosDb, ahora);
    for (const a of archivos) {
      try {
        await zip.agregarArchivo(a.nombre, a.ruta, a.tamano, a.fecha);
      } catch (err) {
        if (salida.destroyed) throw err;
        // un archivo que se borró justo ahora no frena el backup
        if (err && err.code === 'ENOENT') continue;
        throw err;
      }
    }
    await zip.terminar();
    return { archivos: archivos.length + 1, bytes: zip.offset };
  } finally {
    try { fs.unlinkSync(foto); } catch { /* nada */ }
  }
}

// ---------- Lectura del ZIP desde el disco ----------
async function leerDirectorio(fh, tamanoArchivo) {
  const cola = Math.min(tamanoArchivo, 22 + 65535 + 20);
  const buf = Buffer.alloc(cola);
  await fh.read(buf, 0, cola, tamanoArchivo - cola);
  let i = buf.length - 22;
  while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < 0) throw new Error('El archivo no es un ZIP válido (¿se descargó completo?).');
  let total = buf.readUInt16LE(i + 10);
  let tamanoCentral = buf.readUInt32LE(i + 12);
  let inicioCentral = buf.readUInt32LE(i + 16);
  if (total === 0xffff || tamanoCentral === MAX32 || inicioCentral === MAX32) {
    const loc = i - 20;
    if (loc < 0 || buf.readUInt32LE(loc) !== 0x07064b50) throw new Error('ZIP64 inválido: falta el localizador.');
    const posZ64 = Number(buf.readBigUInt64LE(loc + 8));
    const z = Buffer.alloc(56);
    await fh.read(z, 0, 56, posZ64);
    if (z.readUInt32LE(0) !== 0x06064b50) throw new Error('ZIP64 inválido.');
    total = Number(z.readBigUInt64LE(32));
    tamanoCentral = Number(z.readBigUInt64LE(40));
    inicioCentral = Number(z.readBigUInt64LE(48));
  }
  if (tamanoCentral > 256 * 1024 * 1024 || inicioCentral + tamanoCentral > tamanoArchivo) throw new Error('El ZIP está dañado (directorio fuera de rango).');
  const cd = Buffer.alloc(tamanoCentral);
  await fh.read(cd, 0, tamanoCentral, inicioCentral);
  const entradas = [];
  let p = 0;
  for (let k = 0; k < total; k++) {
    if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) throw new Error('El ZIP está dañado (entrada corrupta).');
    const metodo = cd.readUInt16LE(p + 10);
    const crc = cd.readUInt32LE(p + 16);
    let comprimido = cd.readUInt32LE(p + 20);
    let original = cd.readUInt32LE(p + 24);
    const largoNombre = cd.readUInt16LE(p + 28);
    const largoExtra = cd.readUInt16LE(p + 30);
    const largoComentario = cd.readUInt16LE(p + 32);
    let inicio = cd.readUInt32LE(p + 42);
    const nombre = cd.toString('utf8', p + 46, p + 46 + largoNombre);
    const extra = cd.subarray(p + 46 + largoNombre, p + 46 + largoNombre + largoExtra);
    let q = 0;
    while (q + 4 <= extra.length) {
      const id = extra.readUInt16LE(q);
      const largo = extra.readUInt16LE(q + 2);
      if (id === 0x0001) {
        let r = q + 4;
        if (original === MAX32) { original = Number(extra.readBigUInt64LE(r)); r += 8; }
        if (comprimido === MAX32) { comprimido = Number(extra.readBigUInt64LE(r)); r += 8; }
        if (inicio === MAX32) { inicio = Number(extra.readBigUInt64LE(r)); r += 8; }
      }
      q += 4 + largo;
    }
    entradas.push({ nombre, metodo, crc, comprimido, original, inicio });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

// Una ruta que intenta salirse de la carpeta invalida todo el backup.
function nombrePeligroso(nombre) {
  const n = String(nombre || '');
  if (!n || n.includes('\\') || n.includes('\0') || n.startsWith('/') || /^[a-zA-Z]:/.test(n)) return true;
  return n.split('/').some(parte => parte === '..');
}

// Solo se restaura lo que la app usa; lo demás (temporales, miniaturas, backups viejos que traían
// uploads/tmp) se ignora sin frenar la restauración.
function nombreUtil(nombre) {
  if (nombre === 'db/app.db' || nombre === MANIFIESTO) return true;
  const partes = nombre.split('/');
  if (partes[0] !== 'uploads' || !CARPETAS_VALIDAS.has(partes[1]) || partes.length < 3) return false;
  if (partes.some(parte => parte === '' || parte === '.')) return false;
  if (partes[1] === 'covers' && partes[2] === 'thumbs') return false;
  return true;
}

async function extraerEntrada(fh, e, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const cab = Buffer.alloc(30);
  await fh.read(cab, 0, 30, e.inicio);
  if (cab.readUInt32LE(0) !== 0x04034b50) throw new Error(`El ZIP está dañado en «${e.nombre}».`);
  const datos = e.inicio + 30 + cab.readUInt16LE(26) + cab.readUInt16LE(28);
  if (e.comprimido === 0) {
    if (e.original !== 0) throw new Error(`«${e.nombre}» está dañado.`);
    fs.writeFileSync(destino, Buffer.alloc(0));
    return;
  }
  if (e.metodo !== 0 && e.metodo !== 8) throw new Error(`«${e.nombre}» usa una compresión que no se puede leer.`);
  let crc = 0;
  let escritos = 0;
  const control = new Transform({
    transform(trozo, enc, cb) {
      crc = crcActualizar(crc, trozo);
      escritos += trozo.length;
      if (escritos > e.original) return cb(new Error(`«${e.nombre}» es más grande de lo que dice el ZIP.`));
      cb(null, trozo);
    },
  });
  const lector = fh.createReadStream({ start: datos, end: datos + e.comprimido - 1, autoClose: false, highWaterMark: 1024 * 1024 });
  const pasos = [lector];
  if (e.metodo === 8) pasos.push(zlib.createInflateRaw());
  pasos.push(control, fs.createWriteStream(destino));
  await pipeline(...pasos);
  if (escritos !== e.original || crc !== e.crc) throw new Error(`«${e.nombre}» llegó dañado (no coincide su control). Descarga el backup de nuevo.`);
}

function moverSiExiste(de, a) {
  if (!fs.existsSync(de)) return false;
  fs.mkdirSync(path.dirname(a), { recursive: true });
  fs.renameSync(de, a);
  return true;
}

/**
 * Restaura un backup desde un ZIP en el disco. Primero lo extrae entero a una carpeta aparte y
 * comprueba la base de datos; solo si todo está bien reemplaza los datos actuales.
 * cerrarDb() se llama justo antes de cambiar el archivo de la base de datos.
 */
async function restaurarDesdeZip(root, rutaZip, { cerrarDb, abrirDbPrueba } = {}) {
  const fh = await fsp.open(rutaZip, 'r');
  const sello = Date.now();
  const staging = path.join(root, `restaurando-${sello}`);
  const viejo = path.join(root, `reemplazado-${sello}`);
  let tipo = 'completo';
  let entradas;
  try {
    const { size } = await fh.stat();
    entradas = (await leerDirectorio(fh, size)).filter(e => !e.nombre.endsWith('/'));
    if (!entradas.some(e => e.nombre === 'db/app.db')) throw new Error('Ese archivo no es un backup de Zona Beats: no contiene la base de datos (db/app.db).');
    const malos = entradas.filter(e => nombrePeligroso(e.nombre));
    if (malos.length) throw new Error(`El backup tiene rutas no permitidas (${malos.slice(0, 3).map(e => e.nombre).join(', ')}).`);
    entradas = entradas.filter(e => nombreUtil(e.nombre));

    const man = entradas.find(e => e.nombre === MANIFIESTO);
    if (man) {
      await extraerEntrada(fh, man, path.join(staging, MANIFIESTO));
      try {
        const m = JSON.parse(fs.readFileSync(path.join(staging, MANIFIESTO), 'utf8'));
        if (CARPETAS[m.tipo]) tipo = m.tipo;
      } catch { /* manifiesto ilegible: se trata como completo */ }
    }

    const necesario = entradas.reduce((s, e) => s + e.original, 0) + 64 * 1024 * 1024;
    try {
      const st = fs.statfsSync(root);
      const libre = Number(st.bavail) * Number(st.bsize);
      if (libre < necesario) {
        throw new Error(`No hay espacio suficiente en el disco para restaurar con seguridad: hacen falta ${Math.ceil(necesario / 1024 / 1024)} MB y quedan ${Math.floor(libre / 1024 / 1024)} MB.`);
      }
    } catch (err) {
      if (err && /espacio/.test(err.message)) throw err;
    }

    const carpetas = CARPETAS[tipo];
    for (const e of entradas) {
      if (e.nombre === MANIFIESTO) continue;
      const partes = e.nombre.split('/');
      if (partes[0] === 'uploads' && !carpetas.includes(partes[1])) continue;
      await extraerEntrada(fh, e, path.join(staging, e.nombre));
    }

    if (abrirDbPrueba) abrirDbPrueba(path.join(staging, 'db', 'app.db'));
  } catch (err) {
    await fh.close().catch(() => {});
    fs.rmSync(staging, { recursive: true, force: true });
    throw err;
  }
  await fh.close().catch(() => {});

  // --- a partir de aquí se cambian los datos de verdad (con vuelta atrás si algo falla)
  const movidos = [];
  try {
    if (cerrarDb) cerrarDb();
    for (const carpeta of CARPETAS[tipo]) {
      const actual = path.join(root, 'uploads', carpeta);
      if (moverSiExiste(actual, path.join(viejo, 'uploads', carpeta))) movidos.push([actual, path.join(viejo, 'uploads', carpeta)]);
      const nueva = path.join(staging, 'uploads', carpeta);
      if (!moverSiExiste(nueva, actual)) fs.mkdirSync(actual, { recursive: true });
      try { fs.writeFileSync(path.join(actual, '.gitkeep'), ''); } catch { /* nada */ }
    }
    const dbActual = path.join(root, 'db', 'app.db');
    if (moverSiExiste(dbActual, path.join(viejo, 'db', 'app.db'))) movidos.push([dbActual, path.join(viejo, 'db', 'app.db')]);
    for (const sufijo of ['-journal', '-wal', '-shm']) { try { fs.unlinkSync(dbActual + sufijo); } catch { /* no había */ } }
    fs.mkdirSync(path.dirname(dbActual), { recursive: true });
    fs.renameSync(path.join(staging, 'db', 'app.db'), dbActual);
  } catch (err) {
    // vuelta atrás: se deja todo como estaba
    for (const [original, guardado] of movidos.reverse()) {
      try { fs.rmSync(original, { recursive: true, force: true }); fs.renameSync(guardado, original); } catch (e2) { console.error('No se pudo deshacer:', e2.message); }
    }
    fs.rmSync(staging, { recursive: true, force: true });
    throw new Error('No se pudo reemplazar los datos: ' + err.message + '. Se dejaron los datos anteriores.');
  }
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(viejo, { recursive: true, force: true });
  return { tipo, archivos: entradas.length };
}

// Restos de una restauración cortada a la mitad (por ejemplo, si se reinició el servidor).
// La copia «reemplazado-*» solo queda si el servidor se cayó justo al cambiar los datos:
// se guarda 3 días por si hay que recuperar algo a mano.
function limpiarRestosRestauracion(root) {
  try {
    for (const f of fs.readdirSync(root)) {
      const ruta = path.join(root, f);
      if (/^restaurando-\d+$/.test(f)) fs.rmSync(ruta, { recursive: true, force: true });
      else if (/^reemplazado-\d+$/.test(f)) {
        const edad = Date.now() - Number(f.split('-')[1]);
        if (edad > 3 * 24 * 3600 * 1000) fs.rmSync(ruta, { recursive: true, force: true });
        else console.warn(`Quedó una copia de datos anteriores en ${ruta} (de una restauración interrumpida). Se borra sola en 3 días.`);
      }
    }
  } catch { /* nada */ }
}

module.exports = { enviarBackup, restaurarDesdeZip, limpiarRestosRestauracion, leerDirectorio, CARPETAS };
