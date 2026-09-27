// Zona Beats — piezas de interfaz compartidas: skeletons y accesibilidad.
(function () {
  // ---------- Skeletons ----------
  const FORMAS = {
    filas: (n) => '<div class="skel skel-row"></div>'.repeat(n),
    'filas-chicas': (n) => '<div class="skel skel-row sm"></div>'.repeat(n),
    tarjetas: (n) => '<div class="skel skel-card"></div>'.repeat(n),
    plaquitas: (n) => '<span class="skel skel-chip"></span>'.repeat(n),
    lineas: (n) => Array.from({ length: n }, (_, i) => '<div class="skel skel-line" style="width:' + (92 - i * 17 % 40) + '%"></div>').join(''),
  };
  function skeleton(forma, n) {
    const pinta = FORMAS[forma] || FORMAS.filas;
    return '<div class="skel-wrap skel-' + forma + '" role="status"><span class="sr-only">Cargando…</span>' + pinta(n || 3) + '</div>';
  }
  function mostrarSkeleton(el, forma, n) { if (el) el.innerHTML = skeleton(forma, n); }

  // ---------- Accesibilidad ----------
  const MODALES = '.modal-overlay, .plan-modal-overlay, .receipt-modal-overlay, [role="dialog"]';
  const FOCO = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const abiertos = () => [...document.querySelectorAll(MODALES)].filter(m => m.classList.contains('active') && visible(m));
  const focoPrevio = new WeakMap();

  function cerrar(modal) {
    const btn = modal.querySelector('[aria-label="Cerrar"], .modal-close, .plan-modal-close, .receipt-modal-close');
    if (btn) btn.click(); else modal.classList.remove('active');
  }

  // Escape cierra el modal de arriba; Tab no se escapa del modal abierto
  document.addEventListener('keydown', (e) => {
    const lista = abiertos();
    const modal = lista[lista.length - 1];
    if (!modal) return;
    if (e.key === 'Escape') { e.preventDefault(); cerrar(modal); return; }
    if (e.key !== 'Tab') return;
    const foc = [...modal.querySelectorAll(FOCO)].filter(visible);
    if (!foc.length) return;
    const primero = foc[0], ultimo = foc[foc.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    else if (!modal.contains(document.activeElement)) { e.preventDefault(); primero.focus(); }
  });

  // Estados de pestañas y filtros para lectores de pantalla
  const CON_ESTADO = '.dash-tab, .admin-nav-btn, .section-tab, .mov-chip, .month-opt, .week-opt, .admin-subnav-btn';
  function sincronizar(el) {
    if (!el.matches) return;
    if (el.matches(CON_ESTADO)) el.setAttribute('aria-pressed', el.classList.contains('active') ? 'true' : 'false');
    if (el.matches(MODALES)) {
      if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      const abierto = el.classList.contains('active');
      if (abierto && !focoPrevio.has(el)) {
        focoPrevio.set(el, document.activeElement);
        // al abrir, el foco va al modal (primero un campo, si no el primer botón)
        // (sin enfocar un campo, para no abrir el teclado del teléfono)
        setTimeout(() => {
          if (!el.classList.contains('active') || el.contains(document.activeElement)) return;
          if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
          el.focus({ preventScroll: true });
        }, 60);
      } else if (!abierto && focoPrevio.has(el)) {
        const antes = focoPrevio.get(el);
        focoPrevio.delete(el);
        if (antes && antes.focus && document.contains(antes)) antes.focus({ preventScroll: true });
      }
    }
  }
  // Campos que se crean con JavaScript sin etiqueta: usan su placeholder como nombre accesible
  function nombrar(raiz) {
    if (!raiz.querySelectorAll) return;
    raiz.querySelectorAll('input:not([type="hidden"]):not([aria-label]), select:not([aria-label]), textarea:not([aria-label])').forEach((c) => {
      if (c.labels && c.labels.length) return;
      if (c.getAttribute('aria-labelledby')) return;
      const txt = c.getAttribute('placeholder') || c.getAttribute('title') || c.dataset.nombre;
      if (txt) c.setAttribute('aria-label', txt);
    });
    raiz.querySelectorAll('img:not([alt])').forEach((i) => i.setAttribute('alt', ''));
  }
  function revisarTodo(raiz) {
    const r = raiz || document;
    if (r.querySelectorAll) r.querySelectorAll(CON_ESTADO + ', ' + MODALES).forEach(sincronizar);
    nombrar(r);
  }
  const obs = new MutationObserver((cambios) => {
    for (const c of cambios) {
      if (c.type === 'attributes') sincronizar(c.target);
      else c.addedNodes.forEach((n) => { if (n.nodeType === 1) { sincronizar(n); revisarTodo(n); } });
    }
  });
  function arrancar() {
    revisarTodo(document);
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();

  // Decimales por moneda (igual que el servidor): CUP y Saldo Móvil enteros, cripto 6, el resto 2
  function decimales(code) {
    const c = String(code || '').toUpperCase();
    if (c === 'CUP' || c === 'SALDO_MOVIL') return 0;
    if (/^(BNB|BTC|ETH|SOL|TRX)(_|$)/.test(c)) return 6;
    return 2;
  }
  // Lee un monto escrito a mano: 1.500 / 1,500 / 1500,50 / 0,016234
  function leerMonto(txt, dec) {
    let t = String(txt == null ? '' : txt).replace(/\s/g, '');
    if (!t) return NaN;
    if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (t.includes(',')) t = (dec > 2 || !/^[1-9]\d{0,2}(,\d{3})+$/.test(t)) ? t.replace(',', '.') : t.replace(/,/g, '');
    else if (dec <= 2 && /^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }

  window.ZBUI = { skeleton, mostrarSkeleton, decimales, leerMonto };
})();
