const LICENSE_LABELS = {
  basic: 'Licencia Básica',
  premium: 'Licencia Premium',
  unlimited: 'Licencia Ilimitada',
  exclusive: 'Licencia Exclusiva',
};

const LICENSE_TERMS = {
  basic: [
    'Archivos entregados: MP3.',
    'Puede crear una canción con el beat y distribuirla en plataformas digitales.',
    'NO autoriza monetizar la canción en ninguna plataforma ni red social.',
    'Licencia NO exclusiva: el productor puede vender el mismo beat a otros artistas.',
    'No otorga propiedad del beat ni derecho a revenderlo o sublicenciarlo.',
    'Crédito obligatorio al productor.',
  ],
  premium: [
    'Archivos entregados: MP3 + WAV.',
    'Puede crear una canción con el beat y distribuirla en plataformas digitales.',
    'NO autoriza monetizar la canción en ninguna plataforma ni red social.',
    'Licencia NO exclusiva: el productor puede vender el mismo beat a otros artistas.',
    'No otorga propiedad del beat ni derecho a revenderlo o sublicenciarlo.',
    'Crédito obligatorio al productor.',
  ],
  unlimited: [
    'Archivos entregados: MP3 + WAV + STEMS.',
    'SÍ autoriza distribución y monetización en plataformas digitales y redes sociales, sin límite de streams ni ventas.',
    'El beat se retira de forma definitiva del catálogo de ventas.',
    'No se publica en la sección Beats VIP.',
    'No otorga exclusividad total ni propiedad del beat.',
    'Las licencias Básica o Premium vendidas antes siguen vigentes, pero sin derecho a monetizar.',
    'Crédito obligatorio al productor.',
  ],
  exclusive: [
    'Archivos entregados: MP3 + WAV + STEMS.',
    'Compra única: el beat se vende una sola vez y se retira del catálogo para siempre.',
    'Ningún otro artista podrá obtener una copia de este audio para uso comercial.',
    'Otorga derechos de uso comercial, masterización y sincronización de la pista.',
    'El beat se publica en la sección Beats VIP a nombre del comprador, si este lo autoriza.',
    'Crédito obligatorio al productor.',
  ],
};

function escapePdfText(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function toWinAnsi(str) {
  return Buffer.from(String(str), 'latin1');
}

function estimateWidth(text, fontSize) {
  return text.length * fontSize * 0.5;
}

function wrapText(text, fontSize, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (estimateWidth(candidate, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildContentStream(blocks) {
  const PAGE_HEIGHT = 842;
  const MARGIN_LEFT = 56;
  const MAX_WIDTH = 483;
  let y = PAGE_HEIGHT - 70;
  const parts = [];

  for (const block of blocks) {
    const { text = '', size = 10, bold = false, gap = 6, indent = 0 } = block;
    if (block.spacer) {
      y -= block.spacer;
      continue;
    }
    if (block.rule) {
      parts.push(`0.75 w 0.78 0.78 0.80 RG ${MARGIN_LEFT} ${y + 4} m ${MARGIN_LEFT + MAX_WIDTH} ${y + 4} l S`);
      y -= block.gap || 12;
      continue;
    }
    const font = bold ? '/F2' : '/F1';
    const lines = wrapText(text, size, MAX_WIDTH - indent);
    for (const line of lines) {
      const color = block.color || '0 0 0';
      parts.push(`BT ${color} rg ${font} ${size} Tf 1 0 0 1 ${MARGIN_LEFT + indent} ${y} Tm (${escapePdfText(line)}) Tj ET`);
      y -= size + 3;
    }
    y -= gap;
  }

  return parts.join('\n');
}

function buildPdf(blocks) {
  const content = buildContentStream(blocks);
  const contentBuf = toWinAnsi(content);

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];

  const chunks = [];
  const offsets = [];
  let position = 0;

  function push(buf) {
    chunks.push(buf);
    position += buf.length;
  }

  push(Buffer.from('%PDF-1.4\n', 'latin1'));

  for (let i = 0; i < objects.length; i++) {
    offsets[i] = position;
    if (i === 3) {
      push(Buffer.from(`4 0 obj\n<< /Length ${contentBuf.length} >>\nstream\n`, 'latin1'));
      push(contentBuf);
      push(Buffer.from('\nendstream\nendobj\n', 'latin1'));
    } else {
      push(Buffer.from(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`, 'latin1'));
    }
  }

  const xrefStart = position;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 0; i < objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  push(Buffer.from(xref, 'latin1'));

  return Buffer.concat(chunks);
}

function formatDate(isoLike) {
  const d = new Date(String(isoLike || '').replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return String(isoLike || '');
  return d.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });
}

function buildLicensePdf(data) {
  const licenseLabel = LICENSE_LABELS[data.licenseType] || data.licenseType;
  const terms = LICENSE_TERMS[data.licenseType] || [];

  const blocks = [
    { text: 'CERTIFICADO DE LICENCIA', size: 18, bold: true, gap: 2 },
    { text: data.platformName || 'Zona Beats', size: 11, gap: 14, color: '0.45 0.45 0.50' },
    { rule: true, gap: 16 },

    { text: `Número de licencia: ${data.certificateId}`, size: 12, bold: true, gap: 10 },

    { text: 'DATOS DE LA COMPRA', size: 9, bold: true, gap: 8, color: '0.45 0.45 0.50' },
    { text: `Beat: ${data.trackTitle}`, size: 11, gap: 3 },
    { text: `Productor: ${data.producerName || data.platformName || 'Zona Beats'}`, size: 11, gap: 3 },
    { text: `Comprador: ${data.buyerName}`, size: 11, gap: 3 },
    { text: `Tipo de licencia: ${licenseLabel}`, size: 11, gap: 3 },
    { text: `Precio pagado: ${data.priceLabel}`, size: 11, gap: 3 },
    { text: `Fecha de la compra: ${formatDate(data.createdAt)}`, size: 11, gap: 14 },

    { text: 'QUÉ AUTORIZA ESTA LICENCIA', size: 9, bold: true, gap: 8, color: '0.45 0.45 0.50' },
    ...terms.map(t => ({ text: `- ${t}`, size: 10, gap: 2, indent: 6 })),
    { spacer: 10 },

    { text: 'VERIFICACIÓN', size: 9, bold: true, gap: 8, color: '0.45 0.45 0.50' },
    { text: 'Esta licencia se puede comprobar en línea con el número y el hash de abajo:', size: 10, gap: 4 },
    { text: data.verifyUrl, size: 10, gap: 8, color: '0.10 0.35 0.75' },
    { text: 'Hash SHA-256 del contrato:', size: 9, gap: 3, color: '0.45 0.45 0.50' },
    { text: (data.certificateHash || '').slice(0, 32), size: 9, gap: 1 },
    { text: (data.certificateHash || '').slice(32), size: 9, gap: 14 },

    { rule: true, gap: 14 },
    {
      text: 'Este documento acredita los términos otorgados al comprador y el uso autorizado del beat. El hash permite comprobar que no fue alterado. Cualquier uso fuera de lo indicado aquí constituye un incumplimiento de la licencia.',
      size: 9,
      gap: 6,
      color: '0.35 0.35 0.40',
    },
  ];

  return buildPdf(blocks);
}

module.exports = { buildLicensePdf, LICENSE_LABELS };
