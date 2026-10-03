// Formulario de denuncia de derechos de autor
(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('denuncia-form'), msg = $('denuncia-msg'), btn = $('denuncia-btn');
  const previo = new URLSearchParams(location.search).get('beat');
  if (previo) $('d-beat').value = previo.slice(0, 160);
  function decir(texto, ok) { msg.textContent = texto; msg.className = 'legal-msg ' + (ok ? 'ok' : 'err'); }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    try {
      const res = await fetch('/api/denuncias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beat: $('d-beat').value, motivo: $('d-motivo').value, nombre: $('d-nombre').value,
          contacto: $('d-contacto').value, detalle: $('d-detalle').value, declara: $('d-declara').checked,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { form.reset(); decir('Denuncia enviada. El administrador la revisará y te contactará.', true); }
      else decir(d.error || 'No se pudo enviar. Intenta de nuevo.', false);
    } catch { decir('No hay conexión. Intenta de nuevo.', false); }
    btn.disabled = false;
  });
})();
