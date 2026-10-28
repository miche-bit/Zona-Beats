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
  const CON_ESTADO = '.dash-tab, .admin-nav-btn, .section-tab, .mov-chip, .month-opt, .week-opt, .admin-subnav-btn, .subtab, .genre-chip';
  function sincronizar(el) {
    if (!el.matches) return;
    if (el.matches(CON_ESTADO)) el.setAttribute('aria-pressed', el.classList.contains('active') ? 'true' : 'false');
    if (el.matches(MODALES)) {
      if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      // el diálogo se anuncia con su título (el primer encabezado que tenga)
      if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
        const t = el.querySelector('h1, h2, h3, .modal-track-title, .modal-eyebrow, .login-badge');
        if (t) {
          if (!t.id) t.id = 'dlg-t-' + Math.random().toString(36).slice(2, 8);
          el.setAttribute('aria-labelledby', t.id);
        }
      }
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

  // ---------- Forma de onda ----------
  // Texto de 64 caracteres en base 36 (lo calcula el servidor) → SVG con dos capas:
  // gris de fondo y de color recortada según --p, para mostrar el avance de la reproducción.
  const cacheOnda = new Map();
  function rutaOnda(txt) {
    if (cacheOnda.has(txt)) return cacheOnda.get(txt);
    const n = txt.length;
    let d = '';
    for (let i = 0; i < n; i++) {
      const v = parseInt(txt[i], 36);
      const h = Math.max(1.2, (Number.isFinite(v) ? v : 2) / 35 * 19);
      const y = (20 - h) / 2;
      d += 'M' + (i + 0.2).toFixed(2) + ' ' + y.toFixed(2) + 'h0.6v' + h.toFixed(2) + 'h-0.6z';
    }
    if (cacheOnda.size > 400) cacheOnda.clear();
    cacheOnda.set(txt, d);
    return d;
  }
  function onda(txt, clase) {
    const t = String(txt || '');
    if (!/^[0-9a-z]{16,128}$/.test(t)) return '<span class="wf-vacia ' + (clase || '') + '" aria-hidden="true"></span>';
    const d = rutaOnda(t);
    return '<span class="wf ' + (clase || '') + '" aria-hidden="true"><svg viewBox="0 0 ' + t.length + ' 20" preserveAspectRatio="none" focusable="false">' +
      '<path class="wf-base" d="' + d + '"/><path class="wf-fill" d="' + d + '"/></svg></span>';
  }

  // ---------- Subpestañas ----------
  // <div class="subtabs" data-grupo="X"><button class="subtab" data-sub="a">…</button></div>
  // <section data-grupo-panel="X" data-sub="a">…</section>  (se ve solo la elegida)
  function irSub(grupo, sub, opciones) {
    const barra = document.querySelector('.subtabs[data-grupo="' + grupo + '"]');
    if (!barra) return;
    const botones = [...barra.querySelectorAll('.subtab[data-sub]')];
    const elegido = botones.find(b => b.dataset.sub === sub) || botones[0];
    if (!elegido) return;
    botones.forEach(b => { const on = b === elegido; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    document.querySelectorAll('[data-grupo-panel="' + grupo + '"]').forEach(p => { p.hidden = p.dataset.sub !== elegido.dataset.sub; });
    try { sessionStorage.setItem('zb-sub-' + grupo, elegido.dataset.sub); } catch { /* sin almacenamiento */ }
    if (!(opciones && opciones.silencio)) document.dispatchEvent(new CustomEvent('zb:subtab', { detail: { grupo, sub: elegido.dataset.sub } }));
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.subtabs[data-grupo] .subtab[data-sub]');
    if (!b) return;
    const grupo = b.closest('.subtabs').dataset.grupo;
    transicion(() => irSub(grupo, b.dataset.sub));
  });
  function arrancarSubs() {
    document.querySelectorAll('.subtabs[data-grupo]').forEach(barra => {
      let guardada = null;
      try { guardada = sessionStorage.getItem('zb-sub-' + barra.dataset.grupo); } catch { guardada = null; }
      const activa = barra.querySelector('.subtab.active');
      const sub = (guardada && barra.querySelector('.subtab[data-sub="' + guardada + '"]')) ? guardada : (activa ? activa.dataset.sub : '');
      irSub(barra.dataset.grupo, sub, { silencio: true });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancarSubs); else arrancarSubs();
  // número junto a una subpestaña (vacío = se oculta)
  function contarSub(grupo, sub, n) {
    const el = document.querySelector('.subtabs[data-grupo="' + grupo + '"] .subtab[data-sub="' + sub + '"] .n');
    if (el) el.textContent = n ? String(n) : '';
  }

  // Si una tira de subpestañas no cabe en la pantalla, se compacta (en dos grados)
  // antes de tener que desplazarla de lado. Solo cambia el interior de los botones,
  // así la tira conserva su tamaño y el observador no se vuelve a disparar.
  function ajustarTira(t) {
    t.classList.remove('apretada', 'muy-apretada');
    if (!t.clientWidth || t.scrollWidth <= t.clientWidth) return;
    t.classList.add('apretada');
    if (t.scrollWidth > t.clientWidth) t.classList.add('muy-apretada');
  }
  function vigilarTiras() {
    const tiras = [...document.querySelectorAll('.subtabs, .section-tabs')];
    const anchos = new WeakMap();
    const ro = 'ResizeObserver' in window ? new ResizeObserver((es) => es.forEach((e) => {
      const w = Math.round(e.contentRect.width);
      if (anchos.get(e.target) === w) return;
      anchos.set(e.target, w);
      ajustarTira(e.target);
    })) : null;
    tiras.forEach((t) => {
      if (ro) ro.observe(t);
      new MutationObserver(() => ajustarTira(t)).observe(t, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
      ajustarTira(t);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => tiras.forEach(ajustarTira));
    if (!ro) window.addEventListener('resize', () => tiras.forEach(ajustarTira));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vigilarTiras); else vigilarTiras();

  // ---------- Paginador (listas largas en páginas, sin scroll) ----------
  // Pinta «‹ 2 de 5 ›» en el <nav class="pager"> y devuelve la página válida (empieza en 0).
  // alCambiar(página) se llama al pulsar una flecha.
  function paginar(nav, total, pagina, porPagina, alCambiar) {
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const p = Math.min(Math.max(0, Number(pagina) || 0), paginas - 1);
    if (!nav) return p;
    if (paginas <= 1) { nav.hidden = true; nav.innerHTML = ''; return p; }
    nav.hidden = false;
    nav.innerHTML = '<button type="button" data-p="' + (p - 1) + '"' + (p === 0 ? ' disabled' : '') + ' aria-label="Página anterior">‹</button>' +
      '<span class="pager-txt">' + (p + 1) + ' de ' + paginas + '</span>' +
      '<button type="button" data-p="' + (p + 1) + '"' + (p >= paginas - 1 ? ' disabled' : '') + ' aria-label="Página siguiente">›</button>';
    nav.onclick = (e) => {
      const b = e.target.closest('button[data-p]');
      if (!b || b.disabled) return;
      const lado = b.getAttribute('aria-label');
      const teniaFoco = document.activeElement === b;
      const vt = transicion(() => alCambiar(Number(b.dataset.p)));
      // el foco sigue en el paginador aunque se vuelva a pintar
      const enfocar = () => {
        if (!teniaFoco) return;
        const igual = nav.querySelector('button[aria-label="' + lado + '"]:not([disabled])') || nav.querySelector('button:not([disabled])');
        if (igual) igual.focus({ preventScroll: true });
      };
      if (vt && vt.updateCallbackDone) vt.updateCallbackDone.then(enfocar, enfocar); else enfocar();
    };
    return p;
  }
  // Máximo de filas por página: pocas en el teléfono, más en pantallas grandes.
  // (Luego «encajar» quita las que no quepan en la pantalla de cada quien.)
  function filasPorPagina(movil, escritorio) {
    return window.matchMedia && window.matchMedia('(min-width: 900px)').matches ? escritorio : movil;
  }

  // ---------- Encaje: listas que caben en la pantalla ----------
  // Una lista por páginas muestra tantas filas como entren sin bajar. Se mide en la pantalla real
  // (con las barras del navegador): se pinta con el máximo y, mientras el contenido se pase del
  // borde de abajo, se prueba con una fila menos (mínimo 1). Lo medido se recuerda por lista hasta
  // que cambian la ventana o los datos, así las páginas no «bailan» al pasar de una a otra.
  const encajes = new Map(); // lista → { max, pintar, firma, tam, vh, vw, medida }
  const enPantalla = (el) => !!(el && el.isConnected && el.getClientRects().length);
  function raizContenido() { return document.querySelector('[data-encaje]') || document.getElementById('contenido') || document.querySelector('main') || document.body; }
  function sePasa() {
    const r = raizContenido().getBoundingClientRect();
    const reserva = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    return r.bottom + window.scrollY + reserva > window.innerHeight + 1;
  }
  let ro = null;
  function vigilarLista(lista) {
    if (!('ResizeObserver' in window) || !lista) return;
    if (!ro) {
      ro = new ResizeObserver((es) => es.forEach(({ target }) => {
        const e = encajes.get(target);
        if (!e || !enPantalla(target)) return;
        // apareció (estaba oculta al pintarse) o cambió la ventana: se vuelve a medir
        if (!e.tam || e.vh !== window.innerHeight || e.vw !== window.innerWidth) encajar(target, e.max, e.pintar, e.firma, e.caja);
      }));
    }
    if (!encajes.get(lista).vigilada) { ro.observe(lista); encajes.get(lista).vigilada = true; }
  }
  // caja: si la lista vive dentro de una ventana con su propio alto (p. ej. «Mis compras»),
  // lo que se mide es que esa ventana no tenga que desplazarse.
  function encajar(lista, max, pintar, firma, caja) {
    const e = encajes.get(lista) || {};
    e.max = Math.max(1, Number(max) || 1); e.pintar = pintar; e.firma = String(firma == null ? '' : firma);
    if (caja) e.caja = caja;
    encajes.set(lista, e);
    vigilarLista(lista);
    const vh = window.innerHeight, vw = window.innerWidth, medida = e.firma + '|' + e.max;
    if (e.tam && e.vh === vh && e.vw === vw && e.medida === medida) { pintar(e.tam); return e.tam; }
    let tam = e.max;
    pintar(tam);
    if (!enPantalla(lista)) { e.tam = 0; return tam; } // se mide cuando aparezca
    const pasa = e.caja ? () => e.caja.scrollHeight > e.caja.clientHeight + 1 : sePasa;
    while (tam > 1 && pasa()) { tam--; pintar(tam); }
    Object.assign(e, { tam, vh, vw, medida });
    return tam;
  }
  // vuelve a medir las listas a la vista (p. ej. al aparecer el reproductor o al cerrar un desplegable)
  function reencajar() {
    encajes.forEach((e, lista) => {
      if (!lista.isConnected) { encajes.delete(lista); return; }
      e.tam = 0;
      if (enPantalla(lista)) encajar(lista, e.max, e.pintar, e.firma, e.caja);
    });
  }
  let tEncaje = 0;
  window.addEventListener('resize', () => {
    clearTimeout(tEncaje);
    tEncaje = setTimeout(() => {
      // con el teclado del teléfono abierto no se toca nada (si no, el campo podría irse de la página)
      const a = document.activeElement;
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
      // en el teléfono la barra de direcciones aparece y se esconde (cambia el alto ~60 px): eso no cuenta,
      // si no, la lista se volvería a pintar bajo el dedo y cerraría lo que se acaba de abrir
      encajes.forEach((e, lista) => {
        const cambio = e.vw !== window.innerWidth || Math.abs((e.vh || 0) - window.innerHeight) > 120;
        if (enPantalla(lista) && cambio) encajar(lista, e.max, e.pintar, e.firma, e.caja);
      });
    }, 160);
  });
  // al cerrar un desplegable queda sitio: las listas recuperan sus filas
  // (no los que van dentro de una lista por páginas: esa lista no debe cambiar de página bajo el dedo)
  document.addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (d && d.tagName === 'DETAILS' && !d.open && !d.closest('[data-paginada]')) reencajar();
  }, true);

  // Paginador + encaje para listas que se pintan por tramos:
  // pintarFilas(desde, hasta) dibuja esas filas; devuelve { pagina, tam }.
  function paginarEncajado(lista, nav, total, pagina, max, alCambiar, pintarFilas, firma) {
    const res = { pagina: Math.max(0, Number(pagina) || 0), tam: max };
    let tamPrevio = 0;
    encajar(lista, max, (tam) => {
      let p = res.pagina;
      if (tamPrevio && tamPrevio !== tam) p = Math.floor((p * tamPrevio) / tam); // sigue a la vista la primera fila
      tamPrevio = tam;
      p = paginar(nav, total, p, tam, alCambiar);
      res.pagina = p; res.tam = tam;
      pintarFilas(p * tam, p * tam + tam);
    }, firma == null ? total : firma);
    return res;
  }

  // Paginador para listas que ya se pintan solas (con sus botones y eventos):
  // deja a la vista solo las filas de la página actual y se vuelve a aplicar
  // cada vez que la lista cambia. El paginador se coloca justo debajo de la lista.
  function paginarDom(lista, op) {
    if (!lista || lista.dataset.paginada) return null;
    const o = op || {};
    lista.dataset.paginada = '1';
    const nav = document.createElement('nav');
    nav.className = 'pager';
    nav.hidden = true;
    nav.setAttribute('aria-label', o.etiqueta || 'Páginas');
    lista.after(nav);
    let pagina = 0;
    let tamPrevio = 0;
    const filas = () => [...lista.children].filter(el => !el.matches('.skel-wrap, .empty-hint') && (!o.filas || el.matches(o.filas)));
    function alCambiar(p) {
      pagina = p;
      aplicar();
      // la lista vuelve a quedar a la vista si se había quedado arriba
      const r = lista.getBoundingClientRect();
      if (r.top < 0) window.scrollBy({ top: r.top - 80 });
    }
    function aplicar() {
      const todas = filas();
      const max = typeof o.porPagina === 'function' ? o.porPagina() : (o.porPagina || 6);
      encajar(lista, max, (tam) => {
        if (tamPrevio && tamPrevio !== tam && isFinite(pagina)) pagina = Math.floor((pagina * tamPrevio) / tam);
        tamPrevio = tam;
        pagina = paginar(nav, todas.length, pagina, tam, alCambiar);
        todas.forEach((el, i) => { el.hidden = i < pagina * tam || i >= pagina * tam + tam; });
      }, todas.length, o.caja);
    }
    new MutationObserver(aplicar).observe(lista, { childList: true });
    if (window.matchMedia) window.matchMedia('(min-width: 900px)').addEventListener('change', aplicar);
    aplicar();
    return { aplicar, primera: () => { pagina = 0; aplicar(); }, ultima: () => { pagina = Infinity; aplicar(); } };
  }

  window.ZBUI = { skeleton, mostrarSkeleton, decimales, leerMonto, transicion, viaje, onda, irSub, contarSub, paginar, filasPorPagina, paginarDom, encajar, paginarEncajado, reencajar };
})();
