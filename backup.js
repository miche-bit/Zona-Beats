const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

function dosDateTime(date) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f);
  const dateNum = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, dateNum };
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const { time, dateNum } = dosDateTime(entry.date || new Date());

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(dateNum, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(dateNum, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralSize = centralParts.reduce((sum, b) => sum + b.length, 0);
  const centralOffset = offset;

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralSize, 12);
  endRecord.writeUInt32LE(centralOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, endRecord]);
}

function collectFiles(dir, baseDir, out) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.name === '.gitkeep') continue;
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      collectFiles(fullPath, baseDir, out);
    } else {
      const relPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
      out.push({ name: relPath, data: fs.readFileSync(fullPath), date: fs.statSync(fullPath).mtime });
    }
  }
}

function createBackup(projectRoot) {
  const entries = [];
  const dbPath = path.join(projectRoot, 'db', 'app.db');
  if (fs.existsSync(dbPath)) {
    entries.push({ name: 'db/app.db', data: fs.readFileSync(dbPath), date: fs.statSync(dbPath).mtime });
  }
  collectFiles(path.join(projectRoot, 'uploads'), projectRoot, entries);
  return buildZip(entries);
}

function findEndOfCentralDirectory(buf) {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('Archivo ZIP inválido: no se encontró el End of Central Directory');
}

function extractZip(buf) {
  const eocdOffset = findEndOfCentralDirectory(buf);
  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let offset = centralDirOffset;

  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Archivo ZIP inválido: entrada de directorio central corrupta');
    }
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const name = buf.slice(offset + 46, offset + 46 + nameLength).toString('utf8');

    const localNameLength = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressedData = buf.slice(dataStart, dataStart + compressedSize);
    const data = zlib.inflateRawSync(compressedData);

    entries.push({ name, data });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function restoreBackup(projectRoot, zipBuffer) {
  const entries = extractZip(zipBuffer);

  const hasDb = entries.some(e => e.name === 'db/app.db');
  if (!hasDb) {
    throw new Error('El archivo no contiene una base de datos válida (falta db/app.db)');
  }

  for (const entry of entries) {
    const normalized = entry.name.replace(/\\/g, '/');
    if (normalized.includes('..')) {
      throw new Error(`Ruta inválida en el backup: ${entry.name}`);
    }
    const allowed = normalized === 'db/app.db' || normalized.startsWith('uploads/');
    if (!allowed) {
      throw new Error(`Ruta no permitida en el backup: ${entry.name}`);
    }
  }

  for (const dir of ['uploads/audio', 'uploads/covers', 'uploads/receipts', 'uploads/watermark', 'uploads/tmp']) {
    const fullDir = path.join(projectRoot, dir);
    if (fs.existsSync(fullDir)) {
      for (const file of fs.readdirSync(fullDir)) {
        if (file === '.gitkeep') continue;
        fs.unlinkSync(path.join(fullDir, file));
      }
    } else {
      fs.mkdirSync(fullDir, { recursive: true });
    }
  }

  for (const entry of entries) {
    const fullPath = path.join(projectRoot, entry.name);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, entry.data);
  }

  return entries.length;
}

module.exports = { createBackup, restoreBackup };
