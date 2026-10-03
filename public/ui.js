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

  // ---------- Movimiento: crossfade, elemento compartido y lupa ----------
  const sinMovimiento = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Crossfade: lo viejo se desvanece mientras aparece lo nuevo. Sin soporte (o con
  // «reducir movimiento») el cambio se hace directo, igual que antes.
  function transicion(cambiar) {
    if (!document.startViewTransition || sinMovimiento()) { cambiar(); return null; }
    if (document.visibilityState !== 'visible') { cambiar(); return null; }
    let vt, hecho = false;
    const unaVez = () => { if (!hecho) { hecho = true; cambiar(); } };
    try { vt = document.startViewTransition(unaVez); }
    catch { unaVez(); return null; }
    // red de seguridad: si el navegador no llega a pintar (pestaña tapada, equipo lento),
    // el cambio se aplica igual, sin animación. Nunca se queda la pantalla vieja.
    setTimeout(() => { if (!hecho) { unaVez(); try { vt.skipTransition(); } catch { /* nada */ } } }, 180);
    vt.ready.catch(() => {});
    vt.finished.catch(() => {});
    return vt;
  }

  // Elemento compartido: los elementos de «origen» viajan hasta los de «destino».
  // Devuelve una promesa: quien pinte después debe esperarla para no pisarse con el cambio.
  // origen: { nombre: elemento }   destino: función que devuelve { nombre: elemento } ya con la pantalla nueva
  function marcar(mapa, poner) {
    Object.keys(mapa || {}).forEach(n => { if (mapa[n]) mapa[n].style.viewTransitionName = poner ? n : ''; });
  }
  function viaje(origen, cambiar, destino) {
    if (!document.startViewTransition || sinMovimiento()) { cambiar(); return Promise.resolve(); }
    marcar(origen, true);
    let llegada = {};
    const vt = transicion(() => {
      marcar(origen, false);
      cambiar();
      llegada = (destino && destino()) || {};
      marcar(llegada, true);
    });
    if (!vt) { marcar(origen, false); return Promise.resolve(); }
    vt.finished.catch(() => {}).then(() => marcar(llegada, false));
    // se resuelve cuando la pantalla nueva ya está puesta (no cuando termina la animación)
    return vt.updateCallbackDone.catch(() => {});
  }

  // Lupa: los íconos crecen según se acerca el cursor, como en un dock. Solo con ratón.
  const LUPA_SEL = '.hero-social, [data-lupa]';
  const LUPA_RADIO = 110, LUPA_MAX = 0.35;
  let lupaPend = null, lupaActivas = [];
  function soltarLupa() {
    lupaActivas.forEach(a => { a.style.transform = ''; a.style.zIndex = ''; });
    lupaActivas = [];
  }
  function aplicarLupa() {
    const e = lupaPend; lupaPend = null;
    if (!e) return;
    soltarLupa();
    document.querySelectorAll(LUPA_SEL).forEach(caja => {
      const r = caja.getBoundingClientRect();
      if (e.clientX < r.left - LUPA_RADIO || e.clientX > r.right + LUPA_RADIO || e.clientY < r.top - 40 || e.clientY > r.bottom + 40) return;
      Array.from(caja.children).forEach(a => {
        const b = a.getBoundingClientRect();
        const d = Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2));
        const f = Math.max(0, 1 - d / LUPA_RADIO);
        if (!f) return;
        // curva suave: crece más cerca del cursor
        const esc = 1 + LUPA_MAX * f * f * (3 - 2 * f);
        a.style.transform = 'translateY(' + (-(esc - 1) * 10).toFixed(1) + 'px) scale(' + esc.toFixed(3) + ')';
        a.style.zIndex = '2';
        lupaActivas.push(a);
      });
    });
  }
  function arrancarLupa() {
    if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (sinMovimiento()) return;
      const habia = lupaPend; lupaPend = e;
      if (!habia) requestAnimationFrame(aplicarLupa);
    }, { passive: true });
    document.addEventListener('pointerleave', soltarLupa);
    window.addEventListener('blur', soltarLupa);
  }
  arrancarLupa();

  window.ZBUI = { skeleton, mostrarSkeleton, decimales, leerMonto, transicion, viaje };
})();
