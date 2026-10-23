const LICENSE_LABELS = {
  basic: 'Licencia Básica',
  premium: 'Licencia Premium',
  unlimited: 'Licencia Ilimitada',
  exclusive: 'Licencia Exclusiva',
  pack: 'Licencia de Sample Pack',
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
  pack: [
    'Archivos entregados: el Sample Pack completo (archivo comprimido).',
    'Puede usar los sonidos dentro de sus propias canciones y producciones, incluso monetizadas, sin pagar regalías.',
    'NO autoriza revender, regalar ni compartir el pack o los sonidos sueltos.',
    'NO autoriza incluir los sonidos en otros sample packs, kits o librerías de sonidos.',
    'Licencia NO exclusiva: el productor puede vender el mismo pack a otras personas.',
    'No otorga la propiedad de los sonidos.',
  ],
};

// El PDF usa fuentes Latin-1: primero se pasan a Latin-1 los signos comunes y lo demás (emojis, otros
// alfabetos) queda como «?». Si no, un carácter fuera de Latin-1 podía convertirse en «(» o «)» y
// romper el PDF o permitir meter texto falso en la licencia.
function aLatin1(str) {
  return String(str)
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'").replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-').replace(/\u2026/g, '...').replace(/\u20AC/g, 'EUR')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[^\u0000-\u00FF]/gu, '?');
}
function escapePdfText(str) {
  return aLatin1(str).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
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
    ...(data.ejemplo ? [
      { text: 'MODELO DE CONTRATO - NO ES UNA LICENCIA VÁLIDA', size: 12, bold: true, gap: 4, color: '0.75 0.10 0.20' },
      { text: 'Así será el documento que recibirás al comprar. Tu nombre, el número de licencia y el hash se completan cuando el vendedor aprueba tu pago.', size: 9, gap: 12, color: '0.45 0.45 0.50' },
    ] : []),
    { text: 'CERTIFICADO DE LICENCIA', size: 18, bold: true, gap: 2 },
    { text: data.platformName || 'Zona Beats', size: 11, gap: 14, color: '0.45 0.45 0.50' },
    { rule: true, gap: 16 },

    { text: `Número de licencia: ${data.certificateId}`, size: 12, bold: true, gap: 10 },

    { text: 'DATOS DE LA COMPRA', size: 9, bold: true, gap: 8, color: '0.45 0.45 0.50' },
    { text: `${data.licenseType === 'pack' ? 'Sample Pack' : 'Beat'}: ${data.trackTitle}`, size: 11, gap: 3 },
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
      text: 'Este documento acredita los términos otorgados al comprador y el uso autorizado del contenido. El hash permite comprobar que no fue alterado. Cualquier uso fuera de lo indicado aquí constituye un incumplimiento de la licencia.',
      size: 9,
      gap: 6,
      color: '0.35 0.35 0.40',
    },
  ];

  return buildPdf(blocks);
}

// Certificado de registro: prueba de que un productor subió un beat o un pack en una fecha,
// con la huella (SHA-256) de cada archivo. Cualquiera puede comprobarlo en /verify con el código.
function buildRegistroPdf(data) {
  const archivos = data.archivos || [];
  const tipo = data.tipo === 'pack' ? 'Sample Pack' : 'Beat';
  const blocks = [
    { text: 'CERTIFICADO DE REGISTRO DE AUTORÍA', size: 17, bold: true, gap: 2 },
    { text: data.platformName || 'Zona Beats', size: 11, gap: 14, color: '0.45 0.45 0.50' },
    { rule: true, gap: 16 },
    { text: `Código de registro: ${data.codigo}`, size: 12, bold: true, gap: 10 },
    { text: 'OBRA REGISTRADA', size: 9, bold: true, gap: 8, color: '0.45 0.45 0.50' },
    { text: `${tipo}: ${data.titulo}`, size: 11, gap: 3 },
    { text: `Autor declarado: ${data.productor}`, size: 11, gap: 3 },
    { text: `Fecha y hora de subida (UTC): ${String(data.fecha || '').replace('T', ' ').slice(0, 19)}`, size: 11, gap: 3 },
    data.declarado ? { text: `Declaró ser el autor el: ${String(data.declarado).replace('T', ' ').slice(0, 19)} (UTC)`, size: 11, gap: 14 } : { spacer: 11 },
    { text: 'HUELLA DIGITAL DE CADA ARCHIVO (SHA-256)', size: 9, bold: true, gap: 8, color: '0.45 0.45 0.50' },
    { text: 'La huella identifica el archivo exacto: si se cambia un solo bit, la huella cambia.', size: 10, gap: 6 },
    ...archivos.flatMap(a => [
      { text: `${a.etiqueta}:`, size: 10, bold: true, gap: 2 },
      { text: String(a.hash || '').slice(0, 32), size: 9, gap: 1, indent: 6 },
      { text: String(a.hash || '').slice(32), size: 9, gap: 6, indent: 6 },
    ]),
    { spacer: 6 },
    { text: 'VERIFICACIÓN', size: 9, bold: true, gap: 8, color: '0.45 0.45 0.50' },
    { text: 'Escribe el código de registro, o la huella de uno de los archivos, en:', size: 10, gap: 4 },
    { text: data.verifyUrl, size: 10, gap: 14, color: '0.10 0.35 0.75' },
    { rule: true, gap: 14 },
    {
      text: 'Este certificado acredita que el autor indicado subió estos archivos a la plataforma en la fecha indicada. El autor conserva la propiedad de su obra; la plataforma solo puede vender licencias de uso mientras la obra esté publicada. El registro no se puede modificar ni borrar desde la plataforma, aunque la obra se elimine de la tienda.',
      size: 9, gap: 6, color: '0.35 0.35 0.40',
    },
  ];
  return buildPdf(blocks);
}

// Comprobante de pedido: lo recibe el comprador al enviar su pago.
function buildPedidoPdf(data) {
  const blocks = [
    { text: 'COMPROBANTE DE PEDIDO', size: 18, bold: true, gap: 2 },
    { text: data.platformName || 'Zona Beats', size: 11, gap: 14, color: '0.45 0.45 0.50' },
    { rule: true, gap: 16 },
    { text: `Pedido: ${data.codigo}`, size: 12, bold: true, gap: 10 },
    { text: 'DATOS DEL PEDIDO', size: 9, bold: true, gap: 8, color: '0.45 0.45 0.50' },
    { text: `${data.esPack ? 'Sample Pack' : 'Beat'}: ${data.titulo}`, size: 11, gap: 3 },
    { text: `Licencia: ${data.licencia}`, size: 11, gap: 3 },
    { text: `Precio: ${data.precio}`, size: 11, gap: 3 },
    { text: `Comprador: ${data.comprador}`, size: 11, gap: 3 },
    { text: `Pago enviado el: ${String(data.fecha || '').replace('T', ' ').slice(0, 16)} (UTC)`, size: 11, gap: 3 },
    { text: `Estado al emitir este comprobante: ${data.estado}`, size: 11, gap: 14 },
    { text: 'QUÉ PASA AHORA', size: 9, bold: true, gap: 8, color: '0.45 0.45 0.50' },
    { text: `- El vendedor revisa que tu pago haya llegado. Plazo: ${data.horas} ${Number(data.horas) === 1 ? 'hora' : 'horas'} desde el envío.`, size: 10, gap: 2, indent: 6 },
    { text: '- Cuando lo apruebe, descargas tus archivos y tu licencia en «Mis compras».', size: 10, gap: 2, indent: 6 },
    { text: '- Si pasa el plazo sin respuesta, puedes reclamar desde «Mis compras».', size: 10, gap: 2, indent: 6 },
    { text: '- Si el pago se rechaza por error, escribe al vendedor con este comprobante.', size: 10, gap: 14, indent: 6 },
    { text: 'VENDEDOR', size: 9, bold: true, gap: 8, color: '0.45 0.45 0.50' },
    ...(data.titular ? [{ text: `Titular: ${data.titular}`, size: 11, gap: 3 }] : []),
    ...(data.figura ? [{ text: `Figura legal: ${data.figura}`, size: 11, gap: 3 }] : []),
    ...(data.contacto ? [{ text: `Contacto (WhatsApp): ${data.contacto}`, size: 11, gap: 3 }] : []),
    { spacer: 10 },
    { text: 'VERIFICACIÓN', size: 9, bold: true, gap: 8, color: '0.45 0.45 0.50' },
    { text: 'Comprueba que este pedido está registrado escribiendo el código de pedido en:', size: 10, gap: 4 },
    { text: data.verifyUrl, size: 10, gap: 14, color: '0.10 0.35 0.75' },
    { rule: true, gap: 14 },
    { text: 'Guarda este comprobante: acredita que enviaste el pago y lo que compraste. No es la licencia; la licencia se emite cuando el pago se aprueba.', size: 9, gap: 6, color: '0.35 0.35 0.40' },
  ];
  return buildPdf(blocks);
}

// Carta para impugnar un reclamo de derechos de autor en cualquier plataforma (Content ID y equivalentes)
function buildCartaContentIdPdf(data) {
  const lic = LICENSE_LABELS[data.licenseType] || data.licenseType;
  const fecha = formatDate(data.createdAt);
  const blocks = [
    { text: 'CARTA DE LICENCIA PARA RECLAMOS DE DERECHOS DE AUTOR', size: 15, bold: true, gap: 2 },
    { text: 'Content ID / Rights Manager / Copyright claim - License letter', size: 10, gap: 4, color: '0.45 0.45 0.50' },
    { text: data.platformName || 'Zona Beats', size: 11, gap: 14, color: '0.45 0.45 0.50' },
    { rule: true, gap: 14 },
    { text: 'A quien corresponda (YouTube, Facebook, Instagram, TikTok, SoundCloud, Twitch, Spotify, Apple Music, distribuidoras digitales y cualquier otra plataforma):', size: 11, gap: 8 },
    { text: `${data.platformName || 'Zona Beats'} certifica que ${data.buyerName} tiene la ${lic} número ${data.certificateId} del ${data.licenseType === 'pack' ? 'Sample Pack' : 'beat'} «${data.trackTitle}», del productor ${data.producerName}, emitida el ${fecha}.`, size: 11, gap: 8 },
    data.monetiza
      ? { text: 'Esta licencia autoriza a distribuir y MONETIZAR en plataformas digitales y redes sociales la obra creada con el beat. Cualquier reclamo de derechos de autor sobre esa obra que provenga del beat licenciado, hecho por Content ID o por el sistema de identificación de contenido de cualquier plataforma, no tiene fundamento y debe liberarse.', size: 11, gap: 8 }
      : { text: 'Esta licencia autoriza a distribuir la obra creada con el beat, pero no a monetizarla. El titular tiene derecho a mantener su publicación; para monetizar necesita una licencia superior.', size: 11, gap: 8 },
    { text: 'English: This letter certifies that the person named above holds a valid ' + (data.monetiza ? 'license that allows distribution and monetization' : 'license that allows distribution (not monetization)') + ` of works made with the beat "${data.trackTitle}" (license ${data.certificateId}). Verify it at the link below.`, size: 9, gap: 12, color: '0.35 0.35 0.40' },
    { text: 'COMPROBACIÓN', size: 9, bold: true, gap: 8, color: '0.45 0.45 0.50' },
    { text: 'La licencia se puede comprobar en línea:', size: 10, gap: 4 },
    { text: data.verifyUrl, size: 10, gap: 6, color: '0.10 0.35 0.75' },
    { text: `Hash SHA-256 de la licencia: ${(data.certificateHash || '').slice(0, 32)}`, size: 9, gap: 1 },
    { text: (data.certificateHash || '').slice(32), size: 9, gap: 12 },
    { text: 'CÓMO IMPUGNAR EL RECLAMO', size: 9, bold: true, gap: 8, color: '0.45 0.45 0.50' },
    { text: '1. Abre el aviso de derechos de autor del video o de la canción y elige impugnar o disputar el reclamo.', size: 10, gap: 2, indent: 6 },
    { text: '2. Como motivo, elige que tienes una licencia o permiso del titular.', size: 10, gap: 2, indent: 6 },
    { text: `3. Escribe el número de licencia ${data.certificateId} y pega el enlace de comprobación.`, size: 10, gap: 2, indent: 6 },
    { text: '4. Avísanos desde «Mis compras» > «¿Te saltó un reclamo de derechos de autor?» para que hablemos con el productor.', size: 10, gap: 12, indent: 6 },
    { rule: true, gap: 12 },
    { text: `Contacto de la tienda: ${data.contacto || 'WhatsApp de la tienda'}${data.titular ? ' · Titular: ' + data.titular : ''}`, size: 9, gap: 4, color: '0.35 0.35 0.40' },
  ];
  return buildPdf(blocks);
}

module.exports = { buildLicensePdf, buildRegistroPdf, buildPedidoPdf, buildCartaContentIdPdf, LICENSE_LABELS };
