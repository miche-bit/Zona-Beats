// Ayudas para los historiales del panel y del portal: fecha y hora, y descarga en CSV (se abre en Excel).
(function () {
  function aFecha(isoLike) {
    const txt = String(isoLike || '');
    if (!txt) return null;
    const d = new Date(txt.includes('T') ? txt : txt.replace(' ', 'T') + 'Z');
    return isNaN(d.getTime()) ? null : d;
  }
  const dos = (n) => String(n).padStart(2, '0');

  // "26/09/2026 · 10:28 a. m." en la hora del teléfono o la computadora
  function fechaHora(isoLike) {
    const d = aFecha(isoLike);
    if (!d) return String(isoLike || '');
    const hora = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    return dos(d.getDate()) + '/' + dos(d.getMonth() + 1) + '/' + d.getFullYear() + ' · ' + hora;
  }
  // Para el archivo: "2026-09-26 10:28" (Excel lo ordena bien)
  function fechaHoraArchivo(isoLike) {
    const d = aFecha(isoLike);
    if (!d) return String(isoLike || '');
    return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes());
  }

  function celda(v) {
    let t = v == null ? '' : String(v);
    // evita que Excel interprete una celda como fórmula
    if (/^[=+\-@]/.test(t) && !/^-?\d+([.,]\d+)?$/.test(t)) t = "'" + t;
    return /[";\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  // columnas: [{ titulo, valor: (fila) => texto }]
  function descargarCSV(nombre, columnas, filas) {
    const lineas = [columnas.map(c => celda(c.titulo)).join(';')]
      .concat(filas.map(f => columnas.map(c => celda(c.valor(f))).join(';')));
    const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const hoy = new Date();
    const archivo = nombre + '-' + hoy.getFullYear() + dos(hoy.getMonth() + 1) + dos(hoy.getDate()) + '-' + dos(hoy.getHours()) + dos(hoy.getMinutes()) + '.csv';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = archivo;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return archivo;
  }

  // número con coma decimal para Excel en español
  function numero(n, dec) {
    const v = Number(n || 0);
    return v.toFixed(dec == null ? 2 : dec).replace('.', ',');
  }

  window.ZBHistorial = { fechaHora, fechaHoraArchivo, descargarCSV, numero };
})();
