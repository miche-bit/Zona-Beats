(() => {
  window.ZB_PANEL = 'productor';
  const $ = (id) => document.getElementById(id);
  const loginScreen = $('login-screen');
  const dashShell = $('dash-shell');
  const emailInput = $('email-input');
  const passwordInput = $('password-input');
  const loginBtn = $('login-btn');
  const loginError = $('login-error');
  const disabledBox = $('disabled-box');

  const uploadForm = $('upload-form');
  const uploadBtn = $('upload-btn');
  const titleInput = $('title-input');
  const genreInput = $('genre-input');
  const descriptionInput = $('description-input');
  const priceBasicInput = $('price-basic-input');
  const pricePremiumInput = $('price-premium-input');
  const priceUnlimitedInput = $('price-unlimited-input');
  const priceExclusiveInput = $('price-exclusive-input');
  const isPlaylistInput = $('is-playlist-input');
  const artistCreditInput = $('artist-credit-input');
  const makeExclusiveInput = $('make-exclusive-input');
  const audioInput = $('audio-input');
  const coverInput = $('cover-input');
  const wavInput = $('wav-input');
  const stemsInput = $('stems-input');

  const toast = $('toast');
  let toastTimer = null;
  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = 'toast'; }, isError ? 5000 : 3200);
  }

  // Escapa también las comillas: el texto puede ir dentro de un atributo (alt, aria-label, href, title)
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const fmt = (n, d = 0) => Number(n || 0).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
  const formatCup = (n) => fmt(n, 0) + ' CUP';
  function parseFecha(isoLike) {
    const s = String(isoLike || '');
    return new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  }
  function formatOrderDate(isoLike) {
    const d = parseFecha(isoLike);
    if (isNaN(d.getTime())) return isoLike || '';
    return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  const waLink = (tel, text) => 'https://wa.me/' + String(tel || '').replace(/[^0-9]/g, '') + (text ? '?text=' + encodeURIComponent(text) : '');

  // ---------- Mostrar contraseña ----------
  document.querySelectorAll('.btn-show-pass').forEach((b) => {
    b.addEventListener('click', () => {
      const input = $(b.dataset.target);
      const ver = input.type === 'password';
      input.type = ver ? 'text' : 'password';
      b.textContent = ver ? 'Ocultar' : 'Mostrar';
    });
  });

  // ---------- Secciones y subpestañas ----------
  // Cinco secciones; cada una muestra una sola parte a la vez (subpestañas), para no tener que bajar.
  const tabs = document.querySelectorAll('.dash-tab');
  const SECCIONES = ['resumen', 'subir', 'catalogo', 'dinero', 'cuenta'];
  // nombres de antes y atajos → sección/subpestaña
  const ALIAS = {
    beats: 'catalogo/beats', packs: 'catalogo/packs', resenas: 'catalogo/resenas', registro: 'catalogo/registro',
    stats: 'catalogo/beats', bonos: 'dinero/bonos', actividad: 'cuenta/clave', seguridad: 'cuenta/clave', movimientos: 'dinero/movimientos', saldo: 'dinero/saldo',
    plan: 'cuenta/plan', perfil: 'cuenta/perfil', cobros: 'cuenta/cobros', clave: 'cuenta/clave',
  };
  const subActiva = (seccion) => { const b = document.querySelector('.subtabs[data-grupo="' + seccion + '"] .subtab.active'); return b ? b.dataset.sub : ''; };
  function abrirPestana(destino) {
    const ruta = String(ALIAS[destino] || destino || 'resumen').split('/');
    const seccion = SECCIONES.includes(ruta[0]) ? ruta[0] : 'resumen';
    const sub = ruta[1] || '';
    const antes = document.querySelector('.tab-page.active');
    ZBUI.transicion(() => {
      tabs.forEach(t => { const on = t.dataset.tab === seccion; t.classList.toggle('active', on); if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
      document.querySelectorAll('.tab-page').forEach(p => p.classList.toggle('active', p.dataset.page === seccion));
      if (sub) ZBUI.irSub(seccion, sub, { silencio: true });
    });
    try { sessionStorage.setItem('zb_prod_tab', seccion); } catch { /* sin almacenamiento */ }
    cargarVista(seccion, sub || subActiva(seccion));
    if (antes && antes.dataset.page !== seccion) window.scrollTo({ top: 0 });
  }
  // Datos que se piden al abrir cada parte
  function cargarVista(seccion, sub) {
    if (seccion === 'resumen') { loadEarnings(); loadWithdrawals(); }
    else if (seccion === 'subir' && sub === 'pack') abrirPacks();
    else if (seccion === 'catalogo') {
      if (sub === 'packs') abrirPacks();
      else if (sub === 'resenas') loadResenasProductor();
      else if (sub === 'registro') loadRegistro();
      else pintarBeats();
    }
    else if (seccion === 'dinero') {
      if (sub === 'bonos') loadStats();
      else { loadWithdrawals(); loadEarnings(); }
    }
    else if (seccion === 'cuenta' && sub === 'clave') loadActividad();
  }
  document.addEventListener('zb:subtab', (e) => { if (SECCIONES.includes(e.detail.grupo)) cargarVista(e.detail.grupo, e.detail.sub); });
  tabs.forEach(t => t.addEventListener('click', () => abrirPestana(t.dataset.tab)));
  // Cualquier botón con data-ir="seccion/sub" (o un alias) lleva a esa parte del portal
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-ir]');
    if (!b || !dashShell.contains(b)) return;
    e.preventDefault();
    abrirPestana(b.dataset.ir);
  });
  document.querySelectorAll('input[name="publicado-antes"]').forEach(r => r.addEventListener('change', () => { $('publicado-donde').hidden = r.value !== 'si' || !r.checked; }));
  document.querySelectorAll('input[name="content-id"]').forEach(r => r.addEventListener('change', () => { $('cid-aviso').hidden = !(r.value === 'si' && r.checked); }));

  // ---------- Sample Packs (solo planes Pro y Studio) ----------
  let packsUI = null;
  async function abrirPacks() {
    let d = null;
    try {
      const res = await fetch('/api/producer/packs', { cache: 'no-store' });
      if (res.status === 401) return showLogin();
      d = await res.json();
    } catch { return; }
    $('packs-lock').hidden = $('packs-lock-lista').hidden = d.permitido;
    $('packs-zona').hidden = $('packs-zona-lista').hidden = !d.permitido;
    if (!d.permitido) return;
    if (packsUI) { packsUI.cargar(); return; }
    packsUI = window.ZBPacks.montar({
      modo: 'productor', form: $('packs-form'), lista: $('packs-list'), cuenta: $('packs-count'),
      pager: $('packs-pager'), porPagina: () => ZBUI.filasPorPagina(4, 6), pasos: true,
      aviso: (msg, err) => showToast(msg, err), sesionVencida: showLogin,
      alEnviar: () => abrirPestana('catalogo/packs'),
    });
  }

  // ---------- Registro: certificados de autoría y actividad del administrador ----------
  let actividad = [];
  let registros = [];
  const pag = { reg: 0, act: 0, rev: 0, mov: 0, beats: 0, ref: 0 };
  async function loadRegistro() {
    if (!registros.length) ZBUI.mostrarSkeleton($('reg-list'), 'lineas', 2);
    let reg;
    try {
      const r1 = await fetch('/api/producer/registros', { cache: 'no-store' });
      if (r1.status === 401) return showLogin();
      reg = (await r1.json()).registros || [];
    } catch {
      $('reg-list').innerHTML = '<div class="empty-hint">No se pudo cargar. Revisa tu conexión.</div>';
      return;
    }
    registros = reg;
    $('reg-count').textContent = reg.length ? reg.length + ' obra' + (reg.length === 1 ? '' : 's') : '';
    pintarRegistros();
  }
  async function loadActividad() {
    if (!actividad.length) ZBUI.mostrarSkeleton($('act-list'), 'lineas', 3);
    let act;
    try {
      const r2 = await fetch('/api/producer/actividad', { cache: 'no-store' });
      if (r2.status === 401) return showLogin();
      act = (await r2.json()).actividad || [];
    } catch {
      $('act-list').innerHTML = '<div class="empty-hint">No se pudo cargar. Revisa tu conexión.</div>';
      return;
    }
    actividad = act;
    $('act-count').textContent = act.length ? String(act.length) : '';
    $('act-download').disabled = !act.length;
    pintarActividad();
  }
  function pintarRegistros() {
    const box = $('reg-list');
    if (!registros.length) {
      box.innerHTML = '<div class="empty-hint">Cuando subas tu primer beat o pack, aquí tendrás su certificado.</div>';
      ZBUI.paginar($('reg-pager'), 0, 0, 1);
      return;
    }
    pag.reg = ZBUI.paginarEncajado(box, $('reg-pager'), registros.length, pag.reg, ZBUI.filasPorPagina(5, 7),
      (p) => { pag.reg = p; pintarRegistros(); },
      (desde, hasta) => { box.innerHTML = registros.slice(desde, hasta).map(filaRegistro).join(''); }).pagina;
  }
  function filaRegistro(r) {
    return '<div class="reg-item">' +
        '<div class="info"><div class="t">' + escapeHtml(r.titulo) + ' <span class="mini-tag">' + (r.tipo === 'pack' ? 'Sample pack' : 'Beat') + '</span>' + (r.sigue ? '' : ' <span class="mini-tag ghost">ya no está en la tienda</span>') + '</div>' +
        '<div class="m"><span class="code">' + escapeHtml(r.codigo) + '</span><span>Registrado el ' + ZBHistorial.fechaHora(r.fecha) + '</span><span>' + (r.archivos.length ? r.archivos.length + ' archivo' + (r.archivos.length === 1 ? '' : 's') + ' con huella' : 'Solo fecha, sin huellas') + '</span></div></div>' +
        '<a class="btn-link-p" href="/api/producer/registros/' + encodeURIComponent(r.codigo) + '/pdf" download>Certificado</a>' +
      '</div>';
  }
  function pintarActividad() {
    const box = $('act-list');
    if (!actividad.length) {
      box.innerHTML = '<div class="empty-hint">Sin actividad registrada.</div>';
      ZBUI.paginar($('act-pager'), 0, 0, 1);
      return;
    }
    pag.act = ZBUI.paginarEncajado(box, $('act-pager'), actividad.length, pag.act, ZBUI.filasPorPagina(3, 5),
      (p) => { pag.act = p; pintarActividad(); },
      (desde, hasta) => {
        box.innerHTML = actividad.slice(desde, hasta).map(a =>
          '<div class="act-item"><div class="act-when">' + ZBHistorial.fechaHora(a.created_at) + '</div>' +
          '<div class="act-what"><strong>' + escapeHtml(a.accion) + '</strong>' + (a.detalle ? '<span>' + escapeHtml(a.detalle) + '</span>' : '') + '</div>' +
          (a.detalle ? '<button type="button" class="mov-mas act-mas" aria-expanded="false" aria-label="Ver el detalle"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 10 5 5 5-5"/></svg></button>' : '') +
          '</div>').join('');
      }).pagina;
  }
  $('act-list').addEventListener('click', (e) => {
    const b = e.target.closest('.act-mas');
    if (!b) return;
    const fila = b.closest('.act-item');
    const abrir = !fila.classList.contains('open');
    fila.classList.toggle('open', abrir);
    b.setAttribute('aria-expanded', String(abrir));
  });
  $('act-download').addEventListener('click', () => {
    ZBHistorial.descargarCSV('actividad-administrador', [
      { titulo: 'Fecha y hora', valor: a => ZBHistorial.fechaHora(a.created_at) },
      { titulo: 'Acción', valor: a => a.accion },
      { titulo: 'Detalle', valor: a => a.detalle || '' },
    ], actividad);
  });

  // ---------- Sesión ----------
  function ponerNombre(name) {
    $('producer-name-label').textContent = name || '';
    $('hola-nombre').textContent = name ? ', ' + name : '';
    const av = $('rail-avatar');
    if (!av.querySelector('img')) av.textContent = String(name || '').trim().charAt(0).toUpperCase();
  }
  function showApp(name) {
    loginScreen.style.display = 'none';
    dashShell.classList.add('on');
    ponerNombre(name);
    let tab = 'resumen';
    try { tab = sessionStorage.getItem('zb_prod_tab') || 'resumen'; } catch { /* nada */ }
    loadPerfil().then(() => { loadTracks(); loadEarnings(); loadWithdrawals(); loadStats(); abrirPestana(tab); });
  }
  function showLogin() {
    loginScreen.style.display = 'flex';
    dashShell.classList.remove('on');
  }
  async function checkAuth() {
    const res = await fetch('/api/producer/check');
    const { authenticated, name } = await res.json();
    if (authenticated) showApp(name); else showLogin();
  }

  loginBtn.addEventListener('click', async () => {
    loginError.classList.remove('show');
    disabledBox.classList.remove('show');
    const res = await fetch('/api/producer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      passwordInput.value = '';
      showApp(d.name);
      return;
    }
    if (d.desactivada) {
      const tel = d.adminPhone;
      disabledBox.innerHTML = '<strong>Su cuenta ha sido desactivada.</strong> Contacte con el administrador' +
        (tel ? ':<a class="disabled-wa" href="' + waLink(tel, 'Hola, mi cuenta de productor en Zona Beats (' + emailInput.value.trim() + ') aparece desactivada.') + '" target="_blank" rel="noopener">WhatsApp ' + escapeHtml(tel) + '</a>' : '.');
      disabledBox.classList.add('show');
      return;
    }
    loginError.textContent = d.error || 'Correo o contraseña incorrectos.';
    void loginError.offsetWidth;
    loginError.classList.add('show');
  });
  passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginBtn.click(); });
  emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') passwordInput.focus(); });

  $('logout-btn').addEventListener('click', async () => {
    await fetch('/api/producer/logout', { method: 'POST' });
    showLogin();
  });

  // ---------- Registro ----------
  const params = new URLSearchParams(location.search);
  const refParam = params.get('ref');
  if (refParam) $('reg-ref').value = refParam.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  // ?ref=CODIGO (enlace de un productor) o ?unirse (botón «Únete» de la tienda) abren directo «Crear cuenta»
  if (refParam || params.has('unirse')) {
    $('login-mode').style.display = 'none';
    $('register-mode').style.display = 'block';
  }
  $('go-register').addEventListener('click', () => {
    $('login-mode').style.display = 'none';
    $('register-mode').style.display = 'block';
  });
  $('go-login').addEventListener('click', () => {
    $('register-mode').style.display = 'none';
    $('login-mode').style.display = 'block';
  });
  $('register-btn').addEventListener('click', async () => {
    const err = $('register-error');
    const ok = $('register-ok');
    err.classList.remove('show'); ok.classList.remove('show');
    const body = {
      name: $('reg-name').value.trim(),
      phone: $('reg-phone').value.trim(),
      email: $('reg-email').value.trim(),
      password: $('reg-password').value,
      referralCode: $('reg-ref').value.trim(),
      acepta: $('reg-acepta').checked,
    };
    if (!body.acepta) {
      err.textContent = 'Acepta los Términos y la Política de privacidad para continuar.';
      err.classList.add('show');
      $('reg-acepta').focus();
      return;
    }
    const res = await fetch('/api/producer/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok) {
      ok.classList.add('show');
      ['reg-name', 'reg-email', 'reg-password', 'reg-phone', 'reg-ref'].forEach(id => { $(id).value = ''; });
      $('reg-acepta').checked = false;
    } else {
      const d = await res.json().catch(() => ({}));
      err.textContent = d.error || 'No se pudo crear la cuenta.';
      void err.offsetWidth;
      err.classList.add('show');
    }
  });

  // ---------- ¿Olvidaste tu contraseña? ----------
  // No hay correo saliente: el administrador te pone una contraseña nueva desde su panel.
  $('forgot-pass').addEventListener('click', async () => {
    const box = $('forgot-box');
    box.classList.add('show');
    box.textContent = 'Buscando el contacto del administrador…';
    let tel = '';
    try { tel = (await (await fetch('/api/contact')).json()).adminPhone || ''; } catch { tel = ''; }
    const correo = emailInput.value.trim();
    box.innerHTML = tel
      ? 'Solicita una contraseña nueva por WhatsApp: <a class="disabled-wa" href="' +
        waLink(tel, 'Hola, olvidé mi contraseña del portal de productores de Zona Beats.' + (correo ? ' Mi correo es ' + correo + '.' : '')) +
        '" target="_blank" rel="noopener">WhatsApp ' + escapeHtml(tel) + '</a>'
      : 'Solicita una contraseña nueva a la administración.';
  });

  // ---------- Perfil y plan ----------
  let perfil = null;

  async function loadPerfil() {
    const res = await fetch('/api/producer/me');
    if (res.status === 401) { showLogin(); return; }
    if (!res.ok) return;
    perfil = await res.json();

    $('plan-chip').textContent = perfil.planLabel;
    $('rail-plan').textContent = 'Plan ' + perfil.planLabel;
    $('home-plan-name').textContent = perfil.planLabel;
    ponerNombre(perfil.name);
    const nombresLic = { basic: 'Básica', premium: 'Premium', unlimited: 'Ilimitada', exclusive: 'Exclusiva', pack: 'Sample pack' };
    const medidorBeats = medidor(perfil.beatsUsados, perfil.planMaxBeats, 'beats activos');
    $('plan-facts').innerHTML =
      '<div class="plan-fact wide">' + medidorBeats + '</div>' +
      (perfil.planPaidUntil && perfil.plan !== 'free' ? fact('Pagado hasta', perfil.planPaidUntil) : '') +
      fact('Comisión de la plataforma', perfil.planCommission + '%', 'dup') +
      fact('Te pagamos en', perfil.planPayout, 'dup') +
      fact('Licencias que puedes vender', perfil.licenciasPermitidas.map(l => nombresLic[l]).join(', '), 'dup');
    $('home-meter').innerHTML = medidorBeats +
      '<div class="hp-meta"><span>Comisión ' + escapeHtml(perfil.planCommission) + '%</span><span>Cobras en ' + escapeHtml(perfil.planPayout) + '</span>' +
      (perfil.planPaidUntil && perfil.plan !== 'free' ? '<span>Pagado hasta ' + escapeHtml(perfil.planPaidUntil) + '</span>' : '') + '</div>';

    const warn = $('plan-warning');
    const renovar = ' <button type="button" class="btn-link-p" data-ir="cuenta/plan">Renovar plan</button>';
    if (perfil.plan !== 'free' && !perfil.planVigente) {
      warn.className = 'plan-warning danger';
      warn.innerHTML = '<span>' + escapeHtml(perfil.diasParaEliminar > 0
        ? 'Tu plan venció. Si no lo renuevas en ' + perfil.diasParaEliminar + ' día(s), tu cuenta se desactiva. Mientras tanto no puedes subir beats y cobras con la comisión del plan Free.'
        : 'Tu plan venció hace más de 15 días.') + '</span>' + renovar;
      warn.style.display = '';
    } else if (perfil.diasRestantes !== null && perfil.diasRestantes <= 15 && perfil.plan !== 'free') {
      warn.className = 'plan-warning';
      warn.innerHTML = '<span>Tu plan vence en ' + escapeHtml(perfil.diasRestantes) + ' día(s).</span>' + renovar;
      warn.style.display = '';
    } else {
      warn.style.display = 'none';
    }

    const tel = perfil.adminPhone;
    $('plan-contact').innerHTML = tel
      ? 'Consultas sobre tu plan: <a href="' + waLink(tel) + '" target="_blank" rel="noopener"><strong>WhatsApp ' + escapeHtml(tel) + '</strong></a>.'
      : '';

    renderPlanes();
    renderPlanRequestStatus(perfil.planRequest, perfil);
    renderIncentivo();

    $('profile-name').value = perfil.name || '';
    $('profile-bio').value = perfil.bio || '';
    $('profile-phone').value = perfil.contactPhone || '';
    const av = $('avatar-preview');
    const rail = $('rail-avatar');
    if (perfil.avatar) {
      const src = '/api/producer/avatar/' + perfil.id + '?s=300&t=' + Date.now();
      av.src = src; av.style.display = 'block';
      $('avatar-vacio').hidden = true;
      rail.innerHTML = '<img src="' + src.replace('s=300', 's=80') + '" alt="">';
    } else {
      av.style.display = 'none';
      $('avatar-vacio').hidden = false;
      $('avatar-vacio').textContent = String(perfil.name || '').trim().charAt(0).toUpperCase();
    }

    $('currency-hint').textContent = perfil.monedasPermitidas.length
      ? 'Solo puedes usar las monedas que acepta la plataforma: ' + perfil.monedasPermitidas.map(m => (perfil.etiquetasMonedas || {})[m] || m).join(', ') + '. Aquí te pagamos cuando retires.'
      : 'Métodos de cobro no disponibles por ahora.';

    renderSocial(perfil.socialLinks || []);
    renderAccounts(perfil.accounts || []);
    applyPlanLimits(perfil);

    const link = location.origin + '/productores?ref=' + perfil.referralCode;
    $('ref-link').value = link;
  }

  function fact(label, value, clase) {
    return '<div class="plan-fact' + (clase ? ' ' + clase : '') + '"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
  }

  // Medidor por segmentos, como el vúmetro de un canal: se enciende según lo usado
  // y los últimos segmentos cambian de color cuando te acercas al límite.
  // progreso: true = es un avance (bono), no un límite: sin colores de aviso
  function medidor(usado, maximo, etiqueta, progreso) {
    const u = Math.max(0, Number(usado) || 0);
    if (!maximo) return '<div class="meter-txt"><strong>' + fmt(u) + '</strong> ' + escapeHtml(u === 1 ? etiqueta.replace(/s\b/g, '') : etiqueta) + ', sin límite</div>';
    const segs = Math.min(20, Math.max(5, maximo));
    const llenos = u > 0 ? Math.max(1, Math.min(segs, Math.round(u / maximo * segs))) : 0;
    let html = '';
    for (let i = 0; i < segs; i++) {
      const zona = !progreso && i >= segs * 0.8 ? ' alto' : '';
      html += '<i class="' + (i < llenos ? 'on' : '') + zona + '"></i>';
    }
    const quedan = Math.max(0, maximo - u);
    const aviso = !progreso && quedan <= Math.ceil(maximo * 0.2)
      ? ' <span class="' + (quedan ? 'warn' : 'danger') + '">' + (quedan ? '(te quedan ' + quedan + ')' : '(llegaste al límite)') + '</span>' : '';
    return '<div class="meter' + (progreso ? ' progreso' : '') + '" role="meter" aria-valuemin="0" aria-valuemax="' + maximo + '" aria-valuenow="' + Math.min(u, maximo) + '" aria-label="' + escapeHtml(etiqueta) + '">' + html + '</div>' +
      '<div class="meter-txt"><strong>' + fmt(u) + '</strong> de ' + fmt(maximo) + ' ' + escapeHtml(etiqueta) + aviso + '</div>';
  }

  function precioPlanHtml(pl) {
    if (!pl.priceUsd && !pl.priceCup) return '<div class="plan-card-price">Gratis</div>';
    return '<div class="plan-card-price">' +
      '<span class="price-usd">$' + fmt(pl.priceUsd, pl.priceUsd % 1 ? 2 : 0) + ' USD/mes</span>' +
      (pl.priceCup ? '<span class="price-cup">' + formatCup(pl.priceCup) + '/mes</span>' : '') +
    '</div>';
  }

  let planVisto = '';
  $('plan-picker').addEventListener('click', (e) => {
    const b = e.target.closest('[data-plan-ver]');
    if (!b) return;
    planVisto = b.dataset.planVer;
    ZBUI.transicion(() => {
      $('plan-picker').querySelectorAll('[data-plan-ver]').forEach(x => x.classList.toggle('active', x === b));
      $('plans-grid').querySelectorAll('[data-plan-card]').forEach(c => c.classList.toggle('sel', c.dataset.planCard === planVisto));
    });
  });
  function renderPlanes() {
    const solicitudPendiente = perfil.planRequest && perfil.planRequest.status === 'pending';
    // el plazo de pago lo pone el administrador
    const pago = (k) => { const pl = perfil.planes.find(x => x.key === k); return 'Pago en ' + (pl && pl.payout ? pl.payout : ''); };
    const feats = {
      free: ['5 beats activos', 'Comisión 30%', 'Previews con tag', 'Solo MP3 (320 kbps)', 'Solo licencia Básica', pago('free'), 'Estadística de referidos'],
      pro: ['50 beats activos', 'Comisión 20%', 'Previews sin tag', 'WAV / MP3 (320 kbps)', 'Licencias Básica y Premium', 'Sample Packs', 'Estadísticas', 'Tus redes en tu perfil', pago('pro')],
      studio: ['Beats ilimitados', 'Playlist', 'Sample Packs', 'Comisión 10%', 'Estadísticas', 'STEMS + WAV + MP3', 'Todas las licencias + Exclusivas', pago('studio'), 'Bono por me gusta en Playlist'],
    };
    // En el teléfono se ve un plan a la vez (se elige arriba); en pantallas grandes, los tres juntos
    if (!perfil.planes.some(pl => pl.key === planVisto)) planVisto = perfil.plan === 'free' ? 'pro' : perfil.plan;
    $('plan-picker').innerHTML = perfil.planes.map(pl =>
      '<button type="button" class="subtab' + (pl.key === planVisto ? ' active' : '') + '" data-plan-ver="' + escapeHtml(pl.key) + '">' + escapeHtml(pl.label) +
      (pl.key === perfil.plan ? '<span class="pp-tu"><span class="sr-only"> (tu plan)</span></span>' : '') + '</button>').join('');
    $('plans-grid').innerHTML = perfil.planes.map(pl => {
      const esActual = pl.key === perfil.plan;
      let boton = '';
      if (pl.key !== 'free') {
        const texto = esActual ? 'Renovar' : 'Comprar ' + pl.label;
        boton = '<button type="button" class="btn-buy-plan" data-plan="' + pl.key + '"' + (solicitudPendiente ? ' disabled' : '') + '>' + texto + '</button>';
      }
      return '<div class="plan-card' + (esActual ? ' current' : '') + (pl.key === 'studio' ? ' studio' : '') + (pl.key === planVisto ? ' sel' : '') + '" data-plan-card="' + escapeHtml(pl.key) + '">' +
        '<div class="plan-card-name">' + escapeHtml(pl.label) + (esActual ? ' <span class="plan-current-tag">tu plan</span>' : '') + '</div>' +
        precioPlanHtml(pl) +
        '<ul class="plan-card-list">' + (feats[pl.key] || []).map(f => '<li>' + escapeHtml(f) + '</li>').join('') + '</ul>' + boton +
      '</div>';
    }).join('');
    document.querySelectorAll('.btn-buy-plan').forEach(b => b.addEventListener('click', () => openPlanModal(b.dataset.plan)));
    $('plan-rate-note').textContent = perfil.usdRate
      ? 'Precios en CUP a la tasa de 1 USD = ' + fmt(perfil.usdRate, 0) + ' CUP.'
      : '';
  }

  function renderIncentivo() {
    const box = $('incentive-card');
    const esStudio = perfil.plan === 'studio' && perfil.planVigente;
    const b = perfil.bonoLikes || { cada: 1000, cup: 0 };
    const studio = (perfil.planes || []).find(x => x.key === 'studio') || {};
    const bono = b.cup > 0 ? formatCup(b.cup) + ' por cada ' + fmt(b.cada) + ' me gusta de una canción en la Playlist' : '';
    box.className = 'incentive-card' + (esStudio ? ' active' : '');
    if (esStudio) {
      // con Studio el bono ya está activo: su avance se ve en Dinero › Bonos
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    // una sola línea de beneficio: el resto está en la tarjeta del plan
    box.innerHTML = '<div class="inc-txt"><strong>Plan Studio</strong><span>' +
      escapeHtml(bono ? bono + '.' : 'Beats ilimitados, STEMS, Exclusivas y ' + (studio.commission != null ? studio.commission + '% de comisión' : 'menos comisión') + '.') +
      '</span></div><button type="button" class="btn-inc" data-ir="cuenta/plan">Ver plan</button>';
  }

  function renderPlanRequestStatus(r, p) {
    const box = $('plan-request-status');
    if (p.desactivadoPorPago) {
      box.className = 'plan-request-status danger';
      box.innerHTML = 'Tu cuenta está <strong>desactivada por falta de pago</strong>. Renueva tu plan para reactivarla.';
      box.style.display = 'block';
      if (!r || r.status !== 'pending') return;
    }
    if (!r) { if (!p.desactivadoPorPago) box.style.display = 'none'; return; }
    const nombre = r.plan === 'studio' ? 'Studio' : 'Pro';
    const meses = r.months + (r.months === 1 ? ' mes' : ' meses');
    if (r.status === 'pending') {
      box.className = 'plan-request-status pending';
      box.innerHTML = 'Tu pago del plan <strong>' + nombre + '</strong> (' + meses + ', ' + formatCup(r.amount_cup) + ') está en revisión.';
      box.style.display = 'block';
    } else if (r.status === 'approved') {
      const reciente = r.resolved_at && (Date.now() - parseFecha(r.resolved_at).getTime()) < 7 * 24 * 3600 * 1000;
      if (!reciente) { box.style.display = 'none'; return; }
      box.className = 'plan-request-status ok';
      box.innerHTML = 'Pago aprobado: tu plan <strong>' + nombre + '</strong> está activo hasta el <strong>' + escapeHtml(r.paid_until_result) + '</strong>.';
      box.style.display = 'block';
    } else if (r.status === 'rejected') {
      box.className = 'plan-request-status danger';
      box.innerHTML = 'Tu pago del plan <strong>' + nombre + '</strong> fue rechazado' + (r.reject_reason ? ': ' + escapeHtml(r.reject_reason) : '.') + ' Puedes enviar un comprobante nuevo.';
      box.style.display = 'block';
    }
  }

  // ---------- Límites del plan en el formulario ----------
  function applyPlanLimits(p) {
    const lic = p.licenciasPermitidas || ['basic'];
    document.querySelectorAll('.lic-field').forEach(f => {
      const ok = lic.includes(f.dataset.lic);
      f.style.display = ok ? '' : 'none';
      if (!ok) f.querySelector('input').value = '';
    });
    const exWrap = $('exclusive-toggle-wrap');
    exWrap.style.display = lic.includes('exclusive') && !isPlaylistInput.checked ? '' : 'none';
    if (!lic.includes('exclusive')) makeExclusiveInput.checked = false;
    $('playlist-toggle-wrap').style.display = p.puedePlaylist ? '' : 'none';
    if (!p.puedePlaylist) isPlaylistInput.checked = false;

    $('wav-stems-field').dataset.allowed = p.puedeWav ? '1' : '0';
    $('stems-field').dataset.allowed = p.puedeStems ? '1' : '0';
    if (!p.puedeWav) wavInput.value = '';
    if (!p.puedeStems) stemsInput.value = '';

    audioInput.accept = p.soloMp3 ? '.mp3,audio/mpeg' : '.mp3,.wav,audio/mpeg,audio/wav';
    audioDefault = p.soloMp3 ? 'MP3 320 kbps · máx 250 MB' : 'MP3 320 kbps o WAV · máx 250 MB';
    if (!audioInput.files.length) $('audio-drop-label').textContent = audioDefault;

    const nombres = { basic: 'Básica', premium: 'Premium', unlimited: 'Ilimitada', exclusive: 'Exclusiva', pack: 'Sample Pack' };
    const reglas = [
      'Plan ' + p.planLabel + ': puedes vender ' + lic.map(l => nombres[l]).join(', ') + '.',
      p.soloMp3 ? 'Audio solo en MP3 de 320 kbps.' : 'Audio en MP3 de 320 kbps o WAV.',
      p.previewConMarca ? 'Tus previews llevan el tag de la plataforma.' : 'Tus previews van sin marca de agua.',
    ];
    if (!p.puedePlaylist) reglas.push('La Playlist es solo del plan Studio.');
    $('plan-format-note').textContent = reglas.join(' ');

    $('social-field').style.display = p.puedeRedes ? '' : 'none';
    $('redes-plan-note').textContent = '';
    actualizarFormulario();
  }

  let audioDefault = 'MP3 320 kbps · máx 250 MB';

  // Muestra/oculta WAV y STEMS y marca «obligatorio» según los precios puestos.
  function actualizarFormulario() {
    if (!perfil) return;
    const esPlaylist = isPlaylistInput.checked;
    const exclusivo = makeExclusiveInput.checked && !esPlaylist;
    $('artist-credit-field').style.display = esPlaylist ? 'block' : 'none';
    $('sale-fields').style.display = esPlaylist ? 'none' : 'block';
    $('precio-playlist-nota').hidden = !esPlaylist;
    const stp2 = document.querySelector('#up-stepper .stp[data-paso="2"]');
    if (stp2) { stp2.classList.toggle('salta', esPlaylist); stp2.querySelector('.stp-t').textContent = esPlaylist ? 'Sin precio' : 'Precios'; }
    $('license-mode-fields').style.display = exclusivo ? 'none' : 'block';
    $('exclusive-mode-fields').style.display = exclusivo ? 'block' : 'none';
    const lic = perfil.licenciasPermitidas || [];
    $('exclusive-toggle-wrap').style.display = lic.includes('exclusive') && !esPlaylist ? '' : 'none';

    const val = (el) => (window.ZBSubidas ? window.ZBSubidas.precio(el.value) : parseFloat(String(el.value).replace(',', '.'))) > 0;
    // si el audio principal ya es WAV, ese mismo archivo es el WAV que se entrega
    const audioEsWav = audioInput.files.length > 0 && /\.wav$/i.test(audioInput.files[0].name);
    const necesitaWav = !esPlaylist && !audioEsWav && (exclusivo ? val(priceExclusiveInput) : (val(pricePremiumInput) || val(priceUnlimitedInput)));
    const necesitaStems = !esPlaylist && (exclusivo ? val(priceExclusiveInput) : val(priceUnlimitedInput));
    const puedeWav = $('wav-stems-field').dataset.allowed === '1';
    const puedeStems = $('stems-field').dataset.allowed === '1';
    $('wav-stems-field').style.display = puedeWav && !esPlaylist ? '' : 'none';
    $('stems-field').style.display = puedeStems && !esPlaylist ? '' : 'none';
    $('wav-req').style.display = necesitaWav ? '' : 'none';
    $('wav-note').textContent = audioEsWav && !esPlaylist ? 'Tu audio principal ya es WAV: se entrega ese mismo, no hace falta subirlo otra vez.' : '';
    $('stems-req').style.display = necesitaStems ? '' : 'none';
    $('wav-drop').classList.toggle('required', necesitaWav && !wavInput.files.length);
    $('stems-drop').classList.toggle('required', necesitaStems && !stemsInput.files.length);
  }
  [pricePremiumInput, priceUnlimitedInput, priceExclusiveInput, priceBasicInput].forEach(el => el.addEventListener('input', actualizarFormulario));
  isPlaylistInput.addEventListener('change', () => { if (isPlaylistInput.checked) makeExclusiveInput.checked = false; actualizarFormulario(); });
  makeExclusiveInput.addEventListener('change', () => {
    if (makeExclusiveInput.checked) { priceBasicInput.value = ''; pricePremiumInput.value = ''; priceUnlimitedInput.value = ''; }
    else priceExclusiveInput.value = '';
    actualizarFormulario();
  });

  const tamanoTxt = (b) => (window.ZBSubidas ? window.ZBSubidas.tamano(b) : Math.round(b / 1024 / 1024) + ' MB');
  function wireFileDrop(dropEl, inputEl, labelEl, defaultLabel) {
    inputEl.addEventListener('change', () => {
      if (inputEl.files.length > 0) {
        labelEl.textContent = inputEl.files[0].name + ' · ' + tamanoTxt(inputEl.files[0].size);
        dropEl.classList.add('has-file');
      } else {
        labelEl.textContent = typeof defaultLabel === 'function' ? defaultLabel() : defaultLabel;
        dropEl.classList.remove('has-file');
      }
      actualizarFormulario();
    });
  }
  const COVER_LABEL = 'Cuadrada 3000x3000 px · JPG, PNG o WEBP · máx 8 MB';
  const WAV_LABEL = 'WAV en alta calidad · máx 1 GB';
  const STEMS_LABEL = 'ZIP (o RAR/7Z) con las pistas separadas · máx 4 GB';
  wireFileDrop($('audio-drop'), audioInput, $('audio-drop-label'), () => audioDefault);
  wireFileDrop($('cover-drop'), coverInput, $('cover-drop-label'), COVER_LABEL);
  wireFileDrop($('wav-drop'), wavInput, $('wav-drop-label'), WAV_LABEL);
  wireFileDrop($('stems-drop'), stemsInput, $('stems-drop-label'), STEMS_LABEL);

  // Vista previa de la portada y aviso si no es cuadrada (la tienda la recorta al centro).
  coverInput.addEventListener('change', async () => {
    const prev = $('cover-preview');
    const aviso = $('cover-note');
    prev.style.display = 'none';
    $('cover-drop').classList.remove('con-portada');
    aviso.textContent = '';
    const f = coverInput.files[0];
    if (!f || !window.ZBSubidas) return;
    const m = await window.ZBSubidas.medirImagen(f);
    if (!m) { aviso.textContent = 'No se pudo leer la imagen. Prueba con otro JPG o PNG.'; return; }
    if (prev.src && prev.src.startsWith('blob:')) URL.revokeObjectURL(prev.src);
    prev.src = m.url;
    prev.style.display = 'block';
    $('cover-drop').classList.add('con-portada');
    if (Math.abs(m.w - m.h) > Math.max(m.w, m.h) * 0.02) aviso.textContent = 'Tu portada mide ' + m.w + 'x' + m.h + ' px: no es cuadrada y se mostrará recortada.';
    else if (m.w < 1000) aviso.textContent = 'Tu portada mide ' + m.w + 'x' + m.h + ' px: se verá borrosa. Lo ideal es 3000x3000 px.';
  });

  function resetUploadForm() {
    uploadForm.reset();
    $('publicado-donde').hidden = true; $('cid-aviso').hidden = true;
    ['audio-drop', 'cover-drop', 'wav-drop', 'stems-drop'].forEach(id => $(id).classList.remove('has-file'));
    $('audio-drop-label').textContent = audioDefault;
    $('cover-drop-label').textContent = COVER_LABEL;
    $('wav-drop-label').textContent = WAV_LABEL;
    $('stems-drop-label').textContent = STEMS_LABEL;
    $('cover-preview').style.display = 'none';
    $('cover-drop').classList.remove('con-portada');
    $('cover-note').textContent = '';
    actualizarFormulario();
    pasoMax = 1;
    irPaso(1, false);
  }

  // ---------- Subida en cuatro pasos: datos → precios → archivos → enviar ----------
  // Cada paso cabe en la pantalla; «Siguiente» revisa lo del paso antes de avanzar.
  let pasoActual = 1;
  let pasoMax = 1;
  const leerPrecio = (el) => (window.ZBSubidas ? window.ZBSubidas.precio(el.value) : parseFloat(String(el.value).replace(',', '.'))) || 0;
  // licencia que el plan permite (el paso puede estar oculto: se mira lo que puso applyPlanLimits)
  const licPermitida = (el) => { const f = el && el.closest('.lic-field'); return Boolean(f) && f.style.display !== 'none'; };
  function siguienteDe(n) { return n === 1 && isPlaylistInput.checked ? 3 : n + 1; }
  function anteriorDe(n) { return n === 3 && isPlaylistInput.checked ? 1 : n - 1; }
  function irPaso(n, enfocar) {
    pasoActual = Math.min(4, Math.max(1, n));
    pasoMax = Math.max(pasoMax, pasoActual);
    ZBUI.transicion(() => {
      uploadForm.querySelectorAll('.up-paso').forEach(p => { p.hidden = Number(p.dataset.paso) !== pasoActual; });
      document.querySelectorAll('#up-stepper .stp').forEach(b => {
        const k = Number(b.dataset.paso);
        b.classList.toggle('on', k === pasoActual);
        b.classList.toggle('hecho', k < pasoActual);
        b.disabled = subiendo || k > pasoMax || (k === 2 && isPlaylistInput.checked);
        if (k === pasoActual) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      $('up-prev').hidden = pasoActual === 1;
      $('up-prev').disabled = subiendo;
      $('up-next').hidden = pasoActual === 4;
      uploadBtn.hidden = pasoActual !== 4;
      if (pasoActual === 4) pintarResumenSubida();
    });
    if (enfocar) {
      // el foco va al paso (no a un campo, para no abrir el teclado del teléfono)
      const caja = uploadForm.querySelector('.up-paso[data-paso="' + pasoActual + '"]');
      if (caja) { caja.setAttribute('tabindex', '-1'); setTimeout(() => caja.focus({ preventScroll: true }), 30); }
      const panel = uploadForm.closest('.up-panel');
      if (panel && panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ block: 'start' });
    }
  }
  function problemaDelPaso(n) {
    const esPlaylist = isPlaylistInput.checked;
    if (n === 1 && !titleInput.value.trim()) return { msg: 'Ponle título al beat.', el: titleInput };
    if (n === 2 && !esPlaylist) {
      if (makeExclusiveInput.checked) {
        if (!(leerPrecio(priceExclusiveInput) > 0)) return { msg: 'Ponle el precio exclusivo al beat.', el: priceExclusiveInput };
      } else {
        const campos = [priceBasicInput, pricePremiumInput, priceUnlimitedInput].filter(licPermitida);
        if (!campos.some(el => leerPrecio(el) > 0)) return { msg: 'Ponle precio a al menos una licencia.', el: campos[0] || priceBasicInput };
      }
    }
    if (n === 3) {
      if (!audioInput.files.length) return { msg: 'Elige el archivo de audio.', el: audioInput };
      if (!coverInput.files.length) return { msg: 'La portada es obligatoria (cuadrada, 3000x3000 px).', el: coverInput };
      if ($('wav-req').style.display !== 'none' && !wavInput.files.length) return { msg: 'Las licencias que pusiste requieren el archivo WAV.', el: wavInput };
      if ($('stems-req').style.display !== 'none' && !stemsInput.files.length) return { msg: 'Las licencias que pusiste requieren los STEMS.', el: stemsInput };
    }
    return null;
  }
  function avanzarPaso() {
    const p = problemaDelPaso(pasoActual);
    if (p) { showToast(p.msg, true); if (p.el && p.el.focus) p.el.focus({ preventScroll: true }); return; }
    irPaso(siguienteDe(pasoActual), true);
  }
  $('up-next').addEventListener('click', avanzarPaso);
  $('up-prev').addEventListener('click', () => { if (!subiendo) irPaso(anteriorDe(pasoActual), true); });
  $('up-stepper').addEventListener('click', (e) => {
    const b = e.target.closest('.stp');
    if (!b || b.disabled || subiendo) return;
    const destino = Number(b.dataset.paso);
    // hacia delante solo si los pasos de en medio están completos
    for (let k = pasoActual; k < destino; k++) {
      const p = problemaDelPaso(k);
      if (p) { irPaso(k, true); showToast(p.msg, true); return; }
    }
    irPaso(destino, true);
  });
  function pintarResumenSubida() {
    const esPlaylist = isPlaylistInput.checked;
    const exclusivo = makeExclusiveInput.checked && !esPlaylist;
    const precio = (el) => fmt(leerPrecio(el), leerPrecio(el) % 1 ? 2 : 0) + ' CUP';
    const precios = esPlaylist ? 'Colaboración gratuita en la Playlist'
      : exclusivo ? 'Exclusiva ' + precio(priceExclusiveInput)
      : [['Básica', priceBasicInput], ['Premium', pricePremiumInput], ['Ilimitada', priceUnlimitedInput]]
        .filter(([, el]) => licPermitida(el) && leerPrecio(el) > 0).map(([n, el]) => n + ' ' + precio(el)).join(', ');
    const audio = audioInput.files[0];
    const archivos = [audio ? (/\.wav$/i.test(audio.name) ? 'WAV' : 'MP3') : '', !esPlaylist && wavInput.files.length ? 'WAV' : '', !esPlaylist && stemsInput.files.length ? 'STEMS' : '', coverInput.files.length ? 'portada' : '']
      .filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
    const prev = $('cover-preview');
    $('up-resumen').innerHTML =
      (prev.style.display !== 'none' && prev.src ? '<img src="' + escapeHtml(prev.src) + '" alt="">' : '<span class="ur-vacio" aria-hidden="true"></span>') +
      '<div class="ur-info"><div class="ur-t">' + escapeHtml(titleInput.value.trim() || 'Sin título') + '</div>' +
      '<div class="ur-m">' + escapeHtml(precios || 'Sin precio') + '</div>' +
      '<div class="ur-m">' + escapeHtml(archivos ? 'Archivos: ' + archivos : 'Faltan los archivos') + '</div></div>';
  }

  // Subida en trozos: si se corta la conexión sigue sola, y si se cierra la página basta con
  // volver a elegir los mismos archivos y pulsar el botón para que siga donde quedó.
  let subiendo = false;
  let controlSubida = null;
  const extDe = (f) => (String(f.name || '').toLowerCase().match(/\.[a-z0-9]+$/) || [''])[0];

  async function validarArchivosAntesDeSubir(esPlaylist, precios) {
    const Z = window.ZBSubidas;
    const audio = audioInput.files[0];
    const cover = coverInput.files[0];
    if (!audio) return 'Selecciona el archivo de audio.';
    if (!cover) return 'La portada es obligatoria (cuadrada, 3000x3000 px).';
    if (perfil && perfil.planMaxBeats && perfil.beatsUsados >= perfil.planMaxBeats) {
      return 'Tu plan ' + perfil.planLabel + ' permite ' + perfil.planMaxBeats + ' beats activos y ya tienes ' + perfil.beatsUsados + '. Elimina alguno o sube de plan.';
    }
    const extAudio = extDe(audio);
    const permitidos = perfil && perfil.soloMp3 ? ['.mp3'] : ['.mp3', '.wav'];
    if (!permitidos.includes(extAudio)) {
      return perfil && perfil.soloMp3 ? 'Con el plan ' + perfil.planLabel + ' el audio tiene que ser MP3 de 320 kbps.' : 'El audio tiene que ser MP3 (320 kbps) o WAV.';
    }
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extDe(cover))) return 'La portada tiene que ser JPG, PNG o WEBP.';
    const wav = !esPlaylist ? wavInput.files[0] : null;
    const stems = !esPlaylist ? stemsInput.files[0] : null;
    if (wav && extDe(wav) !== '.wav') return 'El archivo WAV tiene que terminar en .wav.';
    if (stems && !['.zip', '.rar', '.7z'].includes(extDe(stems))) return 'Los STEMS tienen que ir comprimidos en ZIP, RAR o 7Z.';
    for (const [kind, f] of [['audio', audio], ['cover', cover], ['wav', wav], ['stems', stems]]) {
      if (!f) continue;
      const err = Z.validarTamano(kind, f);
      if (err) return err;
    }
    if (!esPlaylist) {
      const hayWav = Boolean(wav) || extAudio === '.wav';
      if ((precios.premium > 0 || precios.unlimited > 0 || precios.exclusive > 0) && !hayWav) return 'Esta licencia requiere el archivo WAV.';
      if ((precios.unlimited > 0 || precios.exclusive > 0) && !stems) return 'Esta licencia requiere los STEMS.';
    }
    if (extAudio === '.mp3') {
      const kbps = await Z.kbpsMp3(audio);
      if (kbps && kbps < 310) return 'Tu MP3 es de ' + kbps + ' kbps y tiene que ser de 320 kbps. Expórtalo de nuevo a 320 kbps.';
    }
    return '';
  }

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (subiendo) return;
    // Enter en un campo de los primeros pasos = «Siguiente»
    if (pasoActual < 4) { avanzarPaso(); return; }
    if (!window.ZBSubidas) return showToast('Error al iniciar la subida. Recarga la página.', true);
    for (const k of [1, 2, 3]) {
      if (k === 2 && isPlaylistInput.checked) continue;
      const p = problemaDelPaso(k);
      if (p) { irPaso(k, true); return showToast(p.msg, true); }
    }

    const esPlaylist = isPlaylistInput.checked;
    const exclusivo = makeExclusiveInput.checked && !esPlaylist;
    const leer = (el) => (window.ZBSubidas ? window.ZBSubidas.precio(el.value) : 0);
    const precios = esPlaylist ? { basic: 0, premium: 0, unlimited: 0, exclusive: 0 }
      : exclusivo ? { basic: 0, premium: 0, unlimited: 0, exclusive: leer(priceExclusiveInput) }
      : { basic: leer(priceBasicInput), premium: leer(pricePremiumInput), unlimited: leer(priceUnlimitedInput), exclusive: 0 };
    if (!esPlaylist && !Object.values(precios).some(v => v > 0)) {
      irPaso(2, true);
      return showToast(exclusivo ? 'Ponle el precio exclusivo al beat.' : 'Ponle precio a al menos una licencia.', true);
    }

    const prev = document.querySelector('input[name="publicado-antes"]:checked');
    const cid = document.querySelector('input[name="content-id"]:checked');
    if (!prev || !cid) {
      document.querySelector('input[name="' + (!prev ? 'publicado-antes' : 'content-id') + '"]').focus();
      return showToast('Responde las preguntas de originalidad y Content ID.', true);
    }
    if (cid.value === 'si') { $('cid-aviso').hidden = false; return showToast('No se aceptan beats registrados en Content ID.', true); }
    if (prev.value === 'si' && $('publicado-donde').value.trim().length < 3) {
      $('publicado-donde').focus();
      return showToast('Indica dónde se publicó el beat.', true);
    }
    if (!$('declara-autoria').checked) {
      $('declara-autoria').focus();
      return showToast('Confirma la declaración de autoría.', true);
    }

    uploadBtn.disabled = true;
    const problema = await validarArchivosAntesDeSubir(esPlaylist, precios);
    if (problema) {
      uploadBtn.disabled = false;
      // lo del límite de beats del plan se lee aquí mismo; lo de los archivos, en su paso
      if (!/beats activos/.test(problema)) irPaso(3, true);
      return showToast(problema, true);
    }

    const Z = window.ZBSubidas;
    const lista = [
      { kind: 'cover', file: coverInput.files[0], etiqueta: 'la portada' },
      { kind: 'audio', file: audioInput.files[0], etiqueta: 'el audio' },
    ];
    if (!esPlaylist && wavInput.files[0]) lista.push({ kind: 'wav', file: wavInput.files[0], etiqueta: 'el WAV' });
    if (!esPlaylist && stemsInput.files[0]) lista.push({ kind: 'stems', file: stemsInput.files[0], etiqueta: 'los STEMS' });

    subiendo = true;
    irPaso(4);
    controlSubida = new AbortController();
    $('upload-progress-wrap').style.display = 'block';
    $('upload-cancel').style.display = '';
    setUploadProgress(0, 'Preparando…');
    try {
      const ids = await Z.subirVarios(lista, {
        senal: controlSubida.signal,
        alAvanzar: (p) => setUploadProgress(p.pct, 'Subiendo ' + p.etiqueta + '… ' + p.pct + '% (' + Z.tamano(p.enviado) + ' de ' + Z.tamano(p.total) + ')'),
        alReintentar: (etiqueta, n) => setUploadProgress(null, 'Se cortó la conexión. Reintentando ' + etiqueta + ' (intento ' + n + ')…'),
      });
      $('upload-cancel').style.display = 'none';
      setUploadProgress(100, perfil && perfil.previewConMarca ? 'Procesando el preview…' : 'Procesando: creando el preview…');
      const res = await fetch('/api/producer/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          declaraAutoria: $('declara-autoria').checked,
          publicadoAntes: document.querySelector('input[name="publicado-antes"]:checked').value === 'si',
          publicadoDonde: $('publicado-donde').value,
          contentId: document.querySelector('input[name="content-id"]:checked').value === 'si',
          title: titleInput.value, genre: genreInput.value, description: descriptionInput.value,
          isPlaylist: esPlaylist, artistCredit: esPlaylist ? artistCreditInput.value : '',
          priceBasic: precios.basic, pricePremium: precios.premium, priceUnlimited: precios.unlimited, priceExclusive: precios.exclusive,
          audioUploadId: ids.audio, coverUploadId: ids.cover, wavUploadId: ids.wav || '', stemsUploadId: ids.stems || '',
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        lista.forEach(x => Z.olvidar(x.kind, x.file));
        showToast('Beat enviado a revisión.');
        resetUploadForm();
        loadTracks(); loadPerfil();
      } else if (res.status === 401) {
        showToast('Tu sesión expiró. Inicia sesión de nuevo; tus archivos se conservan.', true);
        showLogin();
      } else {
        showToast(d.error || 'Error al guardar el beat (código ' + res.status + ').', true);
      }
    } catch (err) {
      if (err && err.status === -1) showToast('Subida en pausa. Puedes reanudarla con los mismos archivos.');
      else if (err && err.status === 401) { showToast(err.message, true); showLogin(); }
      else showToast((err && err.message) || 'No se pudo subir. Intenta de nuevo.', true);
    } finally {
      subiendo = false;
      controlSubida = null;
      uploadBtn.disabled = false;
      $('upload-progress-wrap').style.display = 'none';
      irPaso(pasoActual);
    }
  });
  $('upload-cancel').addEventListener('click', () => { if (controlSubida) controlSubida.abort(); });
  window.addEventListener('beforeunload', (e) => {
    if (!subiendo) return;
    e.preventDefault();
    e.returnValue = '';
  });
  function setUploadProgress(pct, label) {
    if (pct !== null && pct !== undefined) $('upload-progress-fill').style.width = `${pct}%`;
    $('upload-progress-label').textContent = label;
  }

  // ---------- Catálogo: tus beats ----------
  const STATUS_LABELS = {
    pending: { text: 'En revisión', className: 'pending' },
    approved: { text: 'En la tienda', className: 'approved' },
    rejected: { text: 'Rechazado', className: 'rejected' },
  };
  const FILTROS_BEATS = [['', 'Todos'], ['approved', 'En la tienda'], ['pending', 'En revisión'], ['rejected', 'Rechazados'], ['sold', 'Vendidos']];
  // íconos pequeños para las cifras de cada beat (como en cualquier reproductor)
  const ICO = {
    play: '<svg class="n-ico" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5 3.5v9l7-4.5z"/></svg>',
    like: '<svg class="n-ico" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 13.2 3.1 8.6a2.9 2.9 0 0 1 4.1-4.1l.8.8.8-.8a2.9 2.9 0 0 1 4.1 4.1z"/></svg>',
    venta: '<svg class="n-ico" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 5.5h9l-.7 7.5h-7.6z"/><path d="M6 5.5V5a2 2 0 0 1 4 0v.5" fill="none"/></svg>',
  };
  let misBeats = null;
  let filtroBeats = '';
  let statsPistas = {};       // ganado por beat (solo planes con estadísticas)
  const abiertos = new Set(); // filas desplegadas en el teléfono

  async function loadTracks() {
    const [res, hres] = await Promise.all([fetch('/api/producer/tracks'), fetch('/api/producer/hots')]);
    if (!res.ok) return;
    const { tracks } = await res.json();
    hotsInfo = hres.ok ? await hres.json() : null;
    misBeats = tracks;
    $('beats-count').textContent = tracks.length ? String(tracks.length) : '';
    pintarBeats();
  }
  const estadoBeat = (t) => (t.sold ? 'sold' : (STATUS_LABELS[t.approval_status] ? t.approval_status : 'pending'));

  function pintarBeats() {
    const list = $('track-list');
    if (!list || !misBeats) return;
    // filtros: solo los estados que tienes (si todos están igual, no hacen falta)
    const cuenta = {};
    misBeats.forEach(t => { const k = estadoBeat(t); cuenta[k] = (cuenta[k] || 0) + 1; });
    if (filtroBeats && !cuenta[filtroBeats]) filtroBeats = '';
    const estados = FILTROS_BEATS.filter(([k]) => k && cuenta[k]);
    $('beat-filters').innerHTML = estados.length > 1 ? FILTROS_BEATS.filter(([k]) => !k || cuenta[k]).map(([k, n]) =>
      '<button type="button" class="mov-chip' + (k === filtroBeats ? ' active' : '') + '" data-estado="' + k + '">' + n +
      (k ? ' <span class="cnt">' + cuenta[k] + '</span>' : '') + '</button>').join('') : '';
    if (!misBeats.length) {
      list.innerHTML = '<div class="empty-hint">Todavía no has subido ningún beat. <button type="button" class="btn-link-p" data-ir="subir/beat">Subir beat</button></div>';
      ZBUI.paginar($('track-pager'), 0, 0, 1);
      return;
    }
    const lista = misBeats.filter(t => !filtroBeats || estadoBeat(t) === filtroBeats);
    pag.beats = ZBUI.paginarEncajado(list, $('track-pager'), lista.length, pag.beats, ZBUI.filasPorPagina(5, 6),
      (p) => { pag.beats = p; pintarBeats(); },
      (desde, hasta) => { list.innerHTML = lista.slice(desde, hasta).map(filaBeat).join(''); },
      filtroBeats + '|' + lista.length).pagina;
  }

  function filaBeat(t) {
    const est = estadoBeat(t);
    const info = t.sold ? { text: t.is_exclusive ? 'Vendido (exclusiva)' : 'Vendido (ilimitada)', className: 'sold' } : STATUS_LABELS[est];
    const archivos = t.archivos || {};
    const puedeHot = hotsInfo && hotsInfo.precioSemanaCup > 0 && !t.sold && !t.is_playlist && t.approval_status === 'approved';
    const hotHasta = hotsInfo && hotsInfo.activos[t.id];
    const hotRevision = hotsInfo && hotsInfo.enRevision.includes(t.id);
    const st = statsPistas[t.id];
    const chips = [
      t.is_playlist ? '' : '<span class="chip">' + ['MP3', archivos.wav ? 'WAV' : '', archivos.stems ? 'STEMS' : ''].filter(Boolean).join(' + ') + '</span>',
      hotHasta ? '<span class="chip hot"><span aria-hidden="true">🔥</span> En Hots hasta el ' + ZBHistorial.fechaHora(hotHasta) + '</span>'
        : hotRevision ? '<span class="chip"><span aria-hidden="true">🔥</span> Hot: falta confirmar el pago</span>' : '',
      chipOriginalidad(t.originalidad),
      t.rating && t.rating.total ? '<span class="chip gold">★ ' + t.rating.promedio.toLocaleString('es') + ' de 5 (' + t.rating.total + ' reseña' + (t.rating.total === 1 ? '' : 's') + ')</span>' : '',
    ].filter(Boolean).join('');
    const acciones = [
      puedeHot && !hotRevision ? '<button type="button" class="act-btn hot" data-acc="hot">' + (hotHasta ? 'Extender Hot' : '<span aria-hidden="true">🔥</span> Poner en Hots') + '</button>' : '',
      t.registro ? '<a class="act-btn" href="/api/producer/registros/' + encodeURIComponent(t.registro) + '/pdf" download>Certificado</a>' : '',
      !t.sold ? '<button type="button" class="act-btn" data-acc="editar">Editar</button>' : '',
      !t.sold && !t.ventas ? '<button type="button" class="act-btn danger" data-acc="borrar">Eliminar</button>' : '',
    ].join('');
    const abierto = abiertos.has(t.id);
    return '<div class="beat-row' + (abierto ? ' open' : '') + '" data-id="' + t.id + '">' +
      (t.cover_filename ? '<img class="br-cover" src="/api/cover/' + t.id + '?s=160" alt="" loading="lazy">' : '<span class="br-cover vacia" aria-hidden="true"></span>') +
      '<div class="br-main">' +
        '<div class="br-title">' + escapeHtml(t.title) + (t.is_playlist ? ' <span class="mini-tag">Playlist</span>' : '') + '</div>' +
        '<div class="br-meta"><span>' + escapeHtml(t.genre || 'Sin género') + '</span>' + (t.price_label && !t.is_playlist ? '<span class="price">' + escapeHtml(t.price_label) + '</span>' : '') + '</div>' +
      '</div>' +
      ZBUI.onda(t.onda, 'br-onda') +
      (t.approval_status === 'rejected' && t.rejection_reason
        ? '<div class="br-nums br-motivo">Motivo: ' + escapeHtml(t.rejection_reason) + '</div>'
        : '<div class="br-nums">' +
          '<span title="Reproducciones">' + ICO.play + '<strong>' + fmt(t.plays) + '</strong><span class="sr-only"> reproducciones</span></span>' +
          '<span title="Me gusta">' + ICO.like + '<strong>' + fmt(t.likes) + '</strong><span class="sr-only"> me gusta</span></span>' +
          (t.is_playlist ? '' : '<span title="Ventas">' + ICO.venta + '<strong>' + fmt(t.ventas) + '</strong><span class="sr-only"> venta' + (t.ventas === 1 ? '' : 's') + '</span></span>') +
          (st && !t.is_playlist ? '<span class="gold" title="Ganado"><strong>' + fmt(st.ganado, 0) + '</strong> CUP<span class="sr-only"> ganados</span></span>' : '') +
        '</div>') +
      '<span class="status-badge ' + info.className + '">' + info.text + '</span>' +
      '<button type="button" class="br-mas" aria-expanded="' + abierto + '" aria-controls="br-b-' + t.id + '" aria-label="Detalles de ' + escapeHtml(t.title) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 10 5 5 5-5"/></svg></button>' +
      '<div class="br-body" id="br-b-' + t.id + '">' +
        (chips ? '<div class="br-chips">' + chips + '</div>' : '') +
        (t.approval_status === 'rejected' && t.rejection_reason ? '<p class="br-reject">Motivo: ' + escapeHtml(t.rejection_reason) + '. Corrígelo con «Editar» y vuelve a revisión.</p>' : '') +
        (acciones ? '<div class="br-actions">' + acciones + '</div>' : '') +
      '</div>' +
    '</div>';
  }

  function chipOriginalidad(o) {
    if (!o) return '';
    if (o.estado === 'pendiente') return '<span class="chip">Verificando originalidad…</span>';
    if (o.estado === 'limpio') return '<span class="chip ok">✓ Original' + (o.servicio ? ' (catálogo y ' + escapeHtml(o.servicio) + ')' : '') + '</span>';
    if (o.estado === 'coincidencias') return '<span class="chip warn">Originalidad en revisión</span>';
    return '<span class="chip warn">La verificación falló; se reintenta sola</span>';
  }

  $('beat-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-estado]');
    if (!b) return;
    filtroBeats = b.dataset.estado;
    pag.beats = 0;
    ZBUI.transicion(pintarBeats);
  });
  $('track-list').addEventListener('click', (e) => {
    const fila = e.target.closest('.beat-row');
    if (!fila) return;
    const id = Number(fila.dataset.id);
    const mas = e.target.closest('.br-mas');
    if (mas) {
      const abrir = !fila.classList.contains('open');
      fila.classList.toggle('open', abrir);
      mas.setAttribute('aria-expanded', String(abrir));
      abiertos.delete(id); abiertos.delete(-id);
      abiertos.add(abrir ? id : -id);
      return;
    }
    const b = e.target.closest('[data-acc]');
    if (!b) return;
    const t = (misBeats || []).find(x => x.id === id);
    if (!t) return;
    if (b.dataset.acc === 'hot') abrirModalHot(t);
    else if (b.dataset.acc === 'editar') abrirEditor(t);
    else if (b.dataset.acc === 'borrar') deleteTrack(t.id, t.title);
  });

  // ---------- Reseñas de tus compradores ----------
  let resenas = [];
  async function loadResenasProductor() {
    const box = $('rev-list');
    if (!box) return;
    let d;
    try { const r = await fetch('/api/producer/resenas', { cache: 'no-store' }); if (!r.ok) return; d = await r.json(); } catch { return; }
    resenas = d.resenas || [];
    $('rev-count').textContent = d.total ? '★ ' + d.promedio.toLocaleString('es') + ' · ' + d.total : '';
    pintarResenas();
  }
  function pintarResenas() {
    const box = $('rev-list');
    // lo que el productor está escribiendo no se pierde al cambiar de página
    box.querySelectorAll('.rev-p-item input').forEach(i => { const r = resenas.find(x => String(x.id) === i.closest('.rev-p-item').dataset.id); if (r) r.borrador = i.value; });
    if (!resenas.length) {
      box.innerHTML = '<div class="empty-hint">Cuando alguien compre y califique tus beats, sus reseñas aparecen aquí y puedes responderlas.</div>';
      ZBUI.paginar($('rev-pager'), 0, 0, 1);
      return;
    }
    pag.rev = ZBUI.paginarEncajado(box, $('rev-pager'), resenas.length, pag.rev, ZBUI.filasPorPagina(3, 5),
      (p) => { pag.rev = p; pintarResenas(); },
      (desde, hasta) => { box.innerHTML = resenas.slice(desde, hasta).map(filaResena).join(''); }).pagina;
  }
  function filaResena(r) {
    return (
      '<div class="rev-p-item" data-id="' + r.id + '">' +
        '<div class="rev-p-head"><span class="estrellas" role="img" aria-label="' + r.estrellas + ' de 5 estrellas">' + '★★★★★'.slice(0, r.estrellas) + '<span class="off">' + '★★★★★'.slice(0, 5 - r.estrellas) + '</span></span>' +
        '<strong>' + escapeHtml(r.nombre) + '</strong><span class="rev-p-meta">' + escapeHtml(r.titulo) + '</span><span class="rev-p-meta">' + ZBHistorial.fechaHora(r.fecha) + '</span>' +
        (r.oculta ? '<span class="mini-tag ghost">oculta: ' + escapeHtml(r.motivo || '') + '</span>' : '') + '</div>' +
        (r.texto ? '<p>' + escapeHtml(r.texto) + '</p>' : '') +
        '<div class="rev-p-form"><label class="sr-only" for="rev-r-' + r.id + '">Tu respuesta</label><input type="text" id="rev-r-' + r.id + '" maxlength="600" placeholder="Responder (se ve en la tienda)" value="' + escapeHtml(r.borrador != null ? r.borrador : (r.respuesta || '')) + '">' +
        '<button type="button" class="btn-link-p rev-p-send">Guardar respuesta</button></div></div>');
  }
  $('rev-list').addEventListener('click', async (e) => {
    const b = e.target.closest('.rev-p-send');
    if (!b) return;
    const item = b.closest('.rev-p-item');
    const texto = item.querySelector('input').value;
    b.disabled = true;
    const r = await fetch('/api/producer/resenas/' + item.dataset.id + '/respuesta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) }).catch(() => null);
    b.disabled = false;
    const ok = Boolean(r && r.ok);
    if (ok) { const x = resenas.find(z => String(z.id) === item.dataset.id); if (x) { x.respuesta = texto; delete x.borrador; } }
    showToast(ok ? 'Respuesta guardada.' : 'No se pudo guardar.', !ok);
  });

  // ---------- Editar beat ----------
  const editModal = $('edit-modal');
  let editando = null;
  function abrirEditor(t) {
    editando = t;
    $('edit-title').textContent = t.title;
    $('edit-title-input').value = t.title || '';
    $('edit-genre-input').value = t.genre || '';
    $('edit-description-input').value = t.description || '';
    $('edit-credit-field').style.display = t.is_playlist ? '' : 'none';
    $('edit-credit-input').value = t.artist_credit || '';
    $('edit-hint').textContent = t.approval_status === 'rejected'
      ? 'Beat rechazado. Al guardar, vuelve a revisión.'
      : 'Los cambios se publican al instante.';
    const lic = (perfil && perfil.licenciasPermitidas) || ['basic'];
    const actuales = {};
    (t.licenses || []).forEach(l => { actuales[l.license_type] = l.price_cup; });
    const nombres = { basic: 'Básica', premium: 'Premium', unlimited: 'Ilimitada', exclusive: 'Exclusiva (única venta)' };
    const esExclusivo = Boolean(t.is_exclusive);
    const tipos = (esExclusivo ? ['exclusive'] : ['basic', 'premium', 'unlimited']).filter(k => lic.includes(k) || actuales[k]);
    $('edit-prices').innerHTML = t.is_playlist ? '' :
      '<span class="ff-lbl">Precios</span><div class="lic-grid' + (tipos.length > 1 ? ' tres' : '') + '">' +
      tipos.map(k =>
        '<div class="field"><label for="edit-p-' + k + '">' + nombres[k] + '</label>' +
        '<div class="price-input"><input type="text" inputmode="decimal" id="edit-p-' + k + '" data-lic="' + k + '" value="' + (actuales[k] || '') + '"' + (lic.includes(k) ? '' : ' disabled') + '><span aria-hidden="true">CUP</span></div></div>'
      ).join('') + '</div>' +
      (tipos.length > 1 ? '<p class="field-hint edit-lic-hint">Premium requiere WAV; Ilimitada, WAV y STEMS. Deja vacía la licencia que no ofrezcas.</p>' : '');
    const a = t.archivos || {};
    $('edit-files-note').textContent = t.is_playlist ? '' :
      'Este beat tiene: MP3' + (a.wav ? ', WAV' : '') + (a.stems ? ', STEMS' : '') + '. ' +
      (!a.wav ? 'Premium, Ilimitada y Exclusiva requieren WAV. ' : (!a.stems ? 'Ilimitada y Exclusiva requieren STEMS. ' : '')) +
      'Los archivos no se pueden reemplazar.';
    editModal.classList.add('active');
  }
  $('edit-close').addEventListener('click', () => editModal.classList.remove('active'));
  editModal.addEventListener('click', (e) => { if (e.target === editModal) editModal.classList.remove('active'); });
  $('edit-save').addEventListener('click', async () => {
    if (!editando) return;
    const btn = $('edit-save');
    const valor = (k) => { const el = $('edit-p-' + k); return el && !el.disabled ? el.value : ''; };
    btn.disabled = true;
    try {
      const res = await fetch('/api/producer/tracks/' + editando.id, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: $('edit-title-input').value, genre: $('edit-genre-input').value,
          description: $('edit-description-input').value, artistCredit: $('edit-credit-input').value,
          priceBasic: valor('basic'), pricePremium: valor('premium'), priceUnlimited: valor('unlimited'), priceExclusive: valor('exclusive'),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        editModal.classList.remove('active');
        showToast(d.reenviado ? 'Cambios guardados. El beat volvió a revisión.' : 'Cambios guardados.');
        loadTracks(); loadPerfil();
      } else if (res.status === 401) { showLogin(); }
      else showToast(d.error || 'No se pudieron guardar los cambios.', true);
    } catch {
      showToast('Se perdió la conexión. Intenta de nuevo.', true);
    } finally {
      btn.disabled = false;
    }
  });

  async function deleteTrack(id, title) {
    if (!confirm(`¿Eliminar "${title}"? Esta acción es definitiva.`)) return;
    const res = await fetch(`/api/producer/tracks/${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Beat eliminado.'); loadTracks(); loadPerfil(); }
    else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'No se pudo eliminar.', true);
    }
  }

  // ---------- Ventas ----------
  async function loadEarnings() {
    const res = await fetch('/api/producer/earnings');
    if (!res.ok) return;
    const { summary } = await res.json();
    $('stat-sales').textContent = fmt(summary.totalSales);
    $('stat-total').textContent = formatCup(summary.totalSalesCup) + ' en ventas';
    const bills = summary.billeteras || [];
    $('stat-available').innerHTML = chipsSaldo(bills);
    $('stat-withdrawing').textContent = fmt(summary.inWithdrawalCup, 0);
    $('stat-paid').textContent = fmt(summary.paidCup, 0);

  }

  // Montos en la moneda en que pagó el comprador
  const decimalesDe = (code) => ZBUI.decimales(code);
  function montoUnidades(n, code, label) { return fmt(n, decimalesDe(code)) + ' ' + escapeHtml(label || code); }
  // Plaquitas: una por cada moneda en que le pagaron los compradores
  function chipsSaldo(bills) {
    const lista = bills.length ? bills : [{ code: 'CUP', label: 'CUP', unidades: 0 }];
    return lista.map(b => '<span class="wallet-chip"><strong>' + fmt(b.unidades, decimalesDe(b.code)) + '</strong> ' + escapeHtml(b.label || b.code) + '</span>').join('');
  }


  // ---------- Retiros ----------
  let retiros = null;
  let countdownTimer = null;

  async function loadWithdrawals() {
    const res = await fetch('/api/producer/withdrawals');
    if (!res.ok) return;
    retiros = await res.json();
    const bills = retiros.billeteras || [];
    $('w-available').innerHTML = chipsSaldo(bills);
    $('w-term').textContent = 'Con tu plan te pagamos en ' + retiros.plazo + ' desde que pulsas «Retirar dinero».';
    [$('withdraw-btn'), $('home-withdraw')].forEach(btn => {
      btn.disabled = Boolean(retiros.pendiente) || !bills.length;
      btn.textContent = retiros.pendiente ? 'Retiro en curso' : 'Retirar dinero';
    });

    const cur = $('w-current');
    const notice = $('withdraw-notice');
    clearInterval(countdownTimer);
    if (retiros.pendiente) {
      const w = retiros.pendiente;
      const pinta = () => {
        cur.innerHTML = avisoRetiroHtml(w);
        notice.innerHTML = avisoRetiroCorto(w);
      };
      pinta();
      notice.style.display = 'block';
      countdownTimer = setInterval(pinta, 30000);
    } else {
      cur.innerHTML = '';
      const ultimo = retiros.historial.find(w => w.status !== 'pending');
      if (ultimo && ultimo.status === 'paid' && Date.now() - parseFecha(ultimo.resolved_at).getTime() < 3 * 86400000) {
        notice.innerHTML = '<div class="w-mini paid"><span class="w-mini-t">Te pagamos ' + montoRetiro(ultimo) + '. Revisa tu cuenta.</span>' + (ultimo.note ? '<span>Nota: ' + escapeHtml(ultimo.note) + '</span>' : '') +
          (ultimo.proof_filename ? '<a class="mov-proof" href="/api/producer/withdrawals/' + ultimo.id + '/comprobante" target="_blank" rel="noopener">Comprobante de pago</a>' : '') + '</div>';
        notice.style.display = 'block';
      } else {
        notice.style.display = 'none';
      }
    }

    loadMovimientos();
  }

  function montoRetiro(w) {
    return w.currency === 'CUP' ? formatCup(w.net_units) : fmt(w.net_units, decimalesDe(w.currency)) + ' ' + escapeHtml(w.currency_label || w.currency);
  }

  // Versión de una o dos líneas para el inicio (el detalle está en Dinero › Saldo)
  function avisoRetiroCorto(w) {
    const falta = parseFecha(w.due_at).getTime() - Date.now();
    let cuando;
    if (falta <= 0) cuando = '<span class="w-late">Pasó el plazo de tu plan</span>';
    else {
      const d = Math.floor(falta / 86400000), h = Math.floor((falta % 86400000) / 3600000), m = Math.floor((falta % 3600000) / 60000);
      cuando = '<span>Te pagamos en <strong>' + (d ? d + ' d ' : '') + h + ' h' + (d ? '' : ' ' + m + ' min') + '</strong></span>';
    }
    return '<div class="w-mini"><span class="w-mini-t">Retiro de ' + montoRetiro(w) + ' en curso</span>' + cuando + '</div>';
  }

  function avisoRetiroHtml(w) {
    const due = parseFecha(w.due_at).getTime();
    const falta = due - Date.now();
    let tiempo;
    if (falta <= 0) {
      const atraso = -falta;
      const dA = Math.floor(atraso / 86400000), hA = Math.floor((atraso % 86400000) / 3600000);
      const tel = String((retiros && retiros.adminPhone) || '').replace(/[^0-9]/g, '');
      tiempo = '<span class="w-late">El plazo de tu plan venció hace ' + (dA ? dA + ' d ' : '') + hA + ' h.</span>' +
        (tel ? ' <a class="mov-proof" href="https://wa.me/' + tel + '?text=' + encodeURIComponent('Hola, mi retiro de ' + montoRetiro(w).replace(/<[^>]+>/g, '') + ' en Zona Beats pasó el plazo de mi plan. ¿Me confirmas cuándo me pagas?') + '" target="_blank" rel="noopener">Consultar por WhatsApp</a>' : '');
    }
    else {
      const d = Math.floor(falta / 86400000), h = Math.floor((falta % 86400000) / 3600000), m = Math.floor((falta % 3600000) / 60000);
      tiempo = 'Te pagamos en <strong>' + (d ? d + ' d ' : '') + h + ' h ' + (d ? '' : m + ' min') + '</strong>' +
        (perfil && perfil.plan === 'free' ? ' (plan Free: entre 7 y 14 días)' : '');
    }
    return '<div class="w-card"><div class="w-card-top"><span>Retiro solicitado</span><strong>' + montoRetiro(w) + '</strong></div>' +
      '<div class="w-card-time">' + tiempo + '</div>' +
      '<div class="m">Pedido el ' + formatOrderDate(w.created_at) + ' · a ' + escapeHtml(w.account_text) + '</div></div>';
  }

  const wModal = $('withdraw-modal');
  function billeteraElegida() {
    const code = $('withdraw-wallet').value;
    return (retiros.billeteras || []).find(b => b.code === code);
  }
  // cada saldo se cobra en su misma moneda, a la cuenta que el productor tenga en esa moneda
  const opcionDe = (b) => (b && b.opciones && b.opciones[0]) || null;
  function abrirRetiro() {
    if (!retiros) return;
    const bills = retiros.billeteras || [];
    if (!bills.some(b => b.opciones.length)) {
      showToast('Agrega primero una cuenta de cobro.', true);
      abrirPestana('cuenta/cobros');
      return;
    }
    const wsel = $('withdraw-wallet');
    wsel.innerHTML = bills.map(b => '<option value="' + escapeHtml(b.code) + '">' + montoUnidades(b.unidades, b.code, b.label) + '</option>').join('');
    const conCuenta = bills.find(b => b.opciones.length);
    if (conCuenta) wsel.value = conCuenta.code;
    ponerMontoTodo();
    $('withdraw-foot').textContent = 'Te pagamos en ' + retiros.plazo + '.';
    wModal.classList.add('active');
  }
  $('withdraw-btn').addEventListener('click', abrirRetiro);
  $('home-withdraw').addEventListener('click', abrirRetiro);
  $('withdraw-wallet').addEventListener('change', ponerMontoTodo);
  $('withdraw-amount').addEventListener('input', pintarResumenRetiro);
  $('withdraw-all').addEventListener('click', ponerMontoTodo);

  // Monto que escribe el productor (acepta 1.500,50 / 1500.5 / 1500)
  function leerMonto(txt) {
    const bw = billeteraElegida();
    return ZBUI.leerMonto(txt, bw ? decimalesDe(bw.code) : 2);
  }
  function ponerMontoTodo() {
    const b = billeteraElegida();
    const dec = b ? decimalesDe(b.code) : 0;
    $('withdraw-amount').value = b ? String(Math.floor(b.unidades * Math.pow(10, dec) + 1e-9) / Math.pow(10, dec)) : '';
    pintarResumenRetiro();
  }
  const bajar = (n, dec) => Math.floor(n * Math.pow(10, dec) + 1e-9) / Math.pow(10, dec);
  $('withdraw-close').addEventListener('click', () => wModal.classList.remove('active'));
  wModal.addEventListener('click', (e) => { if (e.target === wModal) wModal.classList.remove('active'); });

  function pintarResumenRetiro() {
    const b = billeteraElegida();
    const o = opcionDe(b);
    const dec = o && o.decimals != null ? o.decimals : 2;
    const monto = leerMonto($('withdraw-amount').value);
    $('withdraw-amount-label').textContent = '¿Cuánto quieres retirar?' + (b ? ' (en ' + b.label + ')' : '');
    $('withdraw-amount-hint').textContent = b ? 'Tienes ' + fmt(b.unidades, decimalesDe(b.code)) + ' ' + b.label + '.' : '';
    let error = '';
    if (!b) error = 'No tienes saldo para retirar.';
    else if (!o || !o.ok) error = (o && o.error) || 'Agrega en tu Perfil una cuenta de cobro en ' + b.label + '.';
    else if (!(monto > 0)) error = 'Escribe cuánto quieres retirar.';
    else if (monto > b.unidades + 1e-9) error = 'No puedes retirar más de lo que tienes (' + fmt(b.unidades, decimalesDe(b.code)) + ' ' + b.label + ').';
    let html = '<div class="w-row"><span>Sale de tu saldo</span><strong>' + (b && monto > 0 ? montoUnidades(monto, b.code, b.label) : '—') + '</strong></div>';
    let neto = 0;
    if (!error) {
      neto = bajar(monto - (o.fee || 0), dec);
      if (neto <= 0) error = 'Ese monto no alcanza para cubrir el fee de red de ' + o.label + '.';
    }
    if (error) {
      html += '<div class="w-row error">' + escapeHtml(error) + '</div>';
      $('withdraw-confirm').disabled = true;
    } else {
      if (o.fee > 0) html += '<div class="w-row"><span>Fee de red</span><strong>− ' + fmt(o.fee, dec) + ' ' + escapeHtml(o.label) + '</strong></div>';
      html += '<div class="w-row total"><span>Recibirás</span><strong>' + fmt(neto, dec) + ' ' + escapeHtml(o.label) + '</strong></div>';
      const queda = b.unidades - monto;
      if (queda > 0.004) html += '<div class="w-row"><span>Te queda en tu saldo</span><strong>' + montoUnidades(queda, b.code, b.label) + '</strong></div>';
      html += '<div class="w-accounts"><span>Datos de pago</span>' + o.cuentas.map(c => '<div class="plan-account"><div><div class="pa-bank">' + escapeHtml(c.bank) + '</div><div class="pa-num">' + escapeHtml(c.number) + '</div></div></div>').join('') + '</div>';
      $('withdraw-confirm').disabled = false;
    }
    $('w-summary').innerHTML = html;
  }

  $('withdraw-confirm').addEventListener('click', async () => {
    const btn = $('withdraw-confirm');
    btn.disabled = true;
    // Se abre la ventana antes del await para que el navegador no la bloquee.
    const ventana = window.open('', '_blank');
    try {
      const res = await fetch('/api/producer/withdrawals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: $('withdraw-wallet').value, amount: leerMonto($('withdraw-amount').value) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (ventana) ventana.close();
        showToast(d.error || 'No se pudo solicitar el retiro.', true);
        btn.disabled = false;
        return;
      }
      wModal.classList.remove('active');
      showToast('Retiro solicitado.');
      const url = d.adminPhone ? waLink(d.adminPhone, d.whatsappText) : '';
      if (ventana && url) ventana.location.href = url;
      else if (ventana) ventana.close();
      loadWithdrawals(); loadEarnings();
    } catch {
      if (ventana) ventana.close();
      showToast('Se perdió la conexión. Intenta de nuevo.', true);
    }
    btn.disabled = false;
  });

  // ---------- Movimientos ----------
  let movimientos = [];
  let movOcultos = 0;
  const MOV_TIPOS = { venta: 'Venta', bono: 'Bono', plan: 'Plan', retiro: 'Retiro', hot: 'Hot' };
  let movFiltro = '';
  const MOV_ICONOS = { venta: '♪', bono: '★', plan: '◆', retiro: '↗', hot: '🔥' };
  async function loadMovimientos() {
    const res = await fetch('/api/producer/movimientos');
    if (!res.ok) return;
    const d = await res.json();
    movimientos = d.movimientos || [];
    movOcultos = d.ocultos || 0;
    pintarMovimientos();
  }
  function montoMovimiento(m) {
    const n = m.unidades || 0;
    if (!n) {
      if (m.montoOriginal) return '<span class="mov-zero">' + montoUnidades(Math.abs(m.montoOriginal), m.moneda, m.label) + '</span>';
      return '';
    }
    return '<span class="' + (n > 0 ? 'mov-in' : 'mov-out') + '">' + (n > 0 ? '+' : '−') + montoUnidades(Math.abs(n), m.moneda, m.label) + '</span>';
  }
  function pintarMovimientos() {
    const list = $('mov-list');
    const filtrados = movimientos.filter(m => !movFiltro || m.tipo === movFiltro);
    const rest = $('mov-restore');
    rest.hidden = !movOcultos;
    rest.textContent = 'Restaurar borrados (' + movOcultos + ')';
    $('mov-download').disabled = !filtrados.length;
    $('mov-clear').disabled = !filtrados.some(m => m.borrable);
    if (!filtrados.length) {
      list.innerHTML = '<div class="empty-hint">' + (movFiltro ? 'No hay movimientos de este tipo.' : 'Sin movimientos todavía.') + '</div>';
      ZBUI.paginar($('mov-pager'), 0, 0, 1);
      return;
    }
    pag.mov = ZBUI.paginarEncajado(list, $('mov-pager'), filtrados.length, pag.mov, ZBUI.filasPorPagina(6, 8),
      (p) => { pag.mov = p; pintarMovimientos(); },
      (desde, hasta) => { list.innerHTML = filtrados.slice(desde, hasta).map(filaMovimiento).join(''); },
      movFiltro + '|' + filtrados.length).pagina;
  }
  function filaMovimiento(m) {
    return (
      '<div class="mov-item mov-' + m.tipo + '">' +
        '<div class="mov-icon" aria-hidden="true">' + (MOV_ICONOS[m.tipo] || '•') + '</div>' +
        '<div class="info"><div class="t">' + escapeHtml(m.titulo) + '</div>' +
        '<div class="m"><span class="mov-when">' + ZBHistorial.fechaHora(m.fecha) + '</span>' + (m.detalle ? '<span>' + escapeHtml(m.detalle) + '</span>' : '') +
          (m.comprobanteUrl ? '<a class="mov-proof" href="' + escapeHtml(m.comprobanteUrl) + '" target="_blank" rel="noopener">Comprobante de pago</a>' : '') +
          (m.fueraDePlazo ? '<span class="mov-late">Fuera del plazo de tu plan</span>' : '') + '</div></div>' +
        '<div class="amount">' + montoMovimiento(m) +
          (m.estado ? '<span class="paid-tag ' + (/pagado|aprobado/.test(m.estado) ? 'is-paid' : '') + '">' + escapeHtml(m.estado) + '</span>' : '') +
        '</div>' +
        '<div class="mov-ctl">' +
          (m.borrable ? '<button type="button" class="hist-del" data-clave="' + escapeHtml(m.clave) + '" aria-label="Borrar del historial" title="Borrar del historial">×</button>' : '') +
          '<button type="button" class="mov-mas" aria-expanded="false" aria-label="Ver el detalle"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 10 5 5 5-5"/></svg></button>' +
        '</div>' +
        '</div>');
  }
  $('mov-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.mov-chip');
    if (!chip) return;
    document.querySelectorAll('#mov-filters .mov-chip').forEach(c => c.classList.toggle('active', c === chip));
    movFiltro = chip.dataset.tipo;
    pag.mov = 0;
    ZBUI.transicion(pintarMovimientos);
  });

  async function cambiarHistorial(cuerpo) {
    const res = await fetch('/api/producer/historial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(d.error || 'No se pudo cambiar el historial.', true); return null; }
    await loadMovimientos();
    return d;
  }
  $('mov-list').addEventListener('click', async (e) => {
    const mas = e.target.closest('.mov-mas');
    if (mas) {
      const fila = mas.closest('.mov-item');
      const abrir = !fila.classList.contains('open');
      fila.classList.toggle('open', abrir);
      mas.setAttribute('aria-expanded', String(abrir));
      return;
    }
    const b = e.target.closest('.hist-del');
    if (!b) return;
    b.disabled = true;
    const d = await cambiarHistorial({ accion: 'ocultar', claves: [b.dataset.clave] });
    if (d) showToast('Entrada eliminada del historial.');
    else b.disabled = false;
  });
  $('mov-clear').addEventListener('click', async () => {
    const claves = movimientos.filter(m => (!movFiltro || m.tipo === movFiltro) && m.borrable).map(m => m.clave);
    if (!claves.length) return;
    const que = movFiltro ? 'los movimientos de tipo «' + MOV_TIPOS[movFiltro] + '»' : 'todo tu historial';
    if (!confirm('¿Borrar ' + que + ' (' + claves.length + ')?\n\nTu saldo no cambia.')) return;
    const d = await cambiarHistorial({ accion: 'ocultar', claves });
    if (d) showToast('Se borraron ' + d.borrados + ' movimientos del historial.');
  });
  $('mov-restore').addEventListener('click', async () => {
    const d = await cambiarHistorial({ accion: 'restaurar' });
    if (d) showToast('Se restauraron ' + d.restaurados + ' movimientos.');
  });
  $('mov-download').addEventListener('click', () => {
    const filas = movimientos.filter(m => !movFiltro || m.tipo === movFiltro);
    if (!filas.length) return;
    const H = ZBHistorial;
    H.descargarCSV('movimientos' + (movFiltro ? '-' + movFiltro + 's' : ''), [
      { titulo: 'Fecha y hora', valor: m => H.fechaHoraArchivo(m.fecha) },
      { titulo: 'Tipo', valor: m => MOV_TIPOS[m.tipo] || m.tipo },
      { titulo: 'Concepto', valor: m => m.titulo },
      { titulo: 'Detalle', valor: m => m.detalle },
      { titulo: 'Monto', valor: m => H.numero(m.unidades || 0, decimalesDe(m.moneda)) },
      { titulo: 'Moneda', valor: m => m.label || m.moneda },
      { titulo: 'Estado', valor: m => m.estado || 'hecho' },
    ], filas);
    showToast('Historial descargado.');
  });

  // ---------- Estadísticas y bonos ----------
  async function loadStats() {
    const res = await fetch('/api/producer/stats');
    if (!res.ok) return;
    const st = await res.json();
    const r = st.referidos;
    const enCiclo = r.aprobados % r.cadaCuantos;
    const requisitos = !r.habilitado && (r.minVentasCup > 0 || r.minBeats > 0) ? (() => {
      const falVentas = Math.max(0, r.minVentasCup - r.ventasCup), falBeats = Math.max(0, r.minBeats - r.beatsSubidos);
      const req = (ok, txt) => '<li class="' + (ok ? 'ok' : '') + '"><span aria-hidden="true">' + (ok ? '✓' : '○') + '</span> ' + txt + '</li>';
      return '<div class="ref-lock"><strong>Requisitos para cobrar bonos por referidos</strong><ul class="ref-reqs">' +
        (r.minVentasCup > 0 ? req(!falVentas, 'Ganancias por ventas: ' + formatCup(r.minVentasCup) + '. Llevas ' + formatCup(r.ventasCup) + (falVentas ? ' (faltan ' + formatCup(falVentas) + ')' : '')) : '') +
        (r.minBeats > 0 ? req(!falBeats, r.minBeats + ' beats publicados. Tienes ' + r.beatsSubidos + (falBeats ? ' (faltan ' + falBeats + ')' : '')) : '') +
        '</ul>' + (r.enEsperaCup > 0 ? '<p class="panel-hint compact">Tienes <strong>' + formatCup(r.enEsperaCup) + '</strong> en bonos retenidos hasta cumplir los requisitos.</p>' : '') + '</div>';
    })() : '';

    // Inicio: solo el avance hacia el próximo bono
    $('ref-progress').innerHTML = medidor(enCiclo, r.cadaCuantos, 'altas para el próximo bono', true);
    $('ref-hint').textContent = formatCup(r.bonoCup) + ' de bono cada ' + r.cadaCuantos + ' productores que se den de alta con tu enlace y cumplan los requisitos.';

    // Dinero › Bonos: el detalle
    const tam = ZBUI.filasPorPagina(4, 6);
    const lista = r.lista || [];
    $('stats-referidos').innerHTML =
      '<div class="ref-stats four">' +
        '<div><strong>' + r.aprobados + '</strong><span>válidos</span></div>' +
        '<div><strong>' + (r.enCamino || 0) + '</strong><span>incompletos</span></div>' +
        '<div><strong>' + r.pendientes + '</strong><span>por aprobar</span></div>' +
        '<div><strong class="gold">' + formatCup(r.ganadoCup) + '</strong><span>ganado</span></div>' +
      '</div>' +
      medidor(enCiclo, r.cadaCuantos, 'altas para el próximo bono', true) +
      '<p class="panel-hint compact ref-regla">Bono de ' + formatCup(r.bonoCup) + ' cada ' + r.cadaCuantos + ' referidos válidos.</p>' +
      requisitos +
      (lista.length ? '<div class="mini-list" id="ref-lista"></div><nav class="pager" id="ref-pager" aria-label="Páginas de referidos" hidden></nav>'
        : '<div class="empty-hint">Aún no hay altas con tu enlace.</div>');
    pag.ref = 0;
    const pintarRef = () => {
      const box = $('ref-lista');
      if (!box) return;
      pag.ref = ZBUI.paginarEncajado(box, $('ref-pager'), lista.length, pag.ref, tam, (p) => { pag.ref = p; pintarRef(); },
        (desde, hasta) => { box.innerHTML = lista.slice(desde, hasta).map(filaRef).join(''); }).pagina;
    };
    const filaRef = (x) => {
        const est = !x.approved ? 'esperando aprobación' : x.cuenta ? 'cuenta ✓' : 'le falta ' + [x.faltaVentas ? 'vender' : '', x.faltaBeats ? 'subir beats' : ''].filter(Boolean).join(' y ');
        return '<div class="mini-row"><span>' + escapeHtml(x.name) + '</span><em class="' + (x.cuenta ? 'ok' : '') + '">' + est + '</em></div>';
    };
    if (lista.length) pintarRef();

    const bonoPanel = $('stats-bono-panel');
    if (st.bonoLikes) {
      bonoPanel.style.display = '';
      const b = st.bonoLikes;
      $('stats-bono').innerHTML = '<p class="panel-hint compact">Cada ' + fmt(b.cadaCuantos) + ' me gusta en una canción de tu Playlist ganas ' + formatCup(b.bonoCup) + '. Ganado hasta ahora: <strong class="gold">' + formatCup(b.ganadoCup) + '</strong>.</p>' +
        (b.pistas.length ? b.pistas.slice(0, 6).map(t => {
          const resto = (t.likes || 0) % b.cadaCuantos;
          return '<div class="stat-track"><div class="st-name">' + escapeHtml(t.title) + '</div><div class="bar"><div class="bar-fill" style="width:' + Math.round(resto / b.cadaCuantos * 100) + '%"></div></div><div class="st-num">' + fmt(t.likes) + ' me gusta, faltan ' + fmt(b.cadaCuantos - resto) + '</div></div>';
        }).join('') + (b.pistas.length > 6 ? '<p class="panel-hint compact">Y ' + (b.pistas.length - 6) + ' canciones más en tu Playlist.</p>' : '')
          : '<div class="empty-hint">Aún no tienes canciones en la Playlist.</div>');
    } else {
      bonoPanel.style.display = 'none';
    }

    // Catálogo › Beats: totales y ganancia por beat
    const beats = $('stats-beats');
    if (!st.statsPermitidas) {
      statsPistas = {};
      beats.innerHTML = '<p class="locked-line"><span>Las ganancias por beat y los totales son de los planes <strong>Pro</strong> y <strong>Studio</strong>.</span><button type="button" class="btn-link-p" data-ir="cuenta/plan">Ver planes</button></p>';
    } else {
      const tot = st.totales;
      statsPistas = {};
      (st.pistas || []).forEach(t => { statsPistas[t.id] = { ganado: t.ganado || 0 }; });
      beats.innerHTML = '<ul class="cat-kpis" aria-label="Totales de tus beats">' +
        '<li><strong>' + fmt(tot.reproducciones) + '</strong><span>reproducciones</span></li>' +
        '<li><strong>' + fmt(tot.likes) + '</strong><span>me gusta</span></li>' +
        '<li><strong>' + fmt(tot.ventas) + '</strong><span>ventas</span></li>' +
        '<li><strong class="gold">' + fmt(tot.ganado, 0) + '<small>CUP</small></strong><span>ganado</span></li></ul>';
    }
    pintarBeats();
  }

  $('ref-copy').addEventListener('click', async () => {
    const v = $('ref-link').value;
    try { await navigator.clipboard.writeText(v); showToast('Enlace copiado.'); }
    catch { $('ref-link').closest('.ref-box').classList.add('ver-enlace'); $('ref-link').select(); showToast('Mantén pulsado el enlace para copiarlo.'); }
  });

  // ---------- Compra de plan ----------
  const planModal = $('plan-modal');
  let planModalState = { plan: 'pro', months: 1, price: 0 };
  let adminPago = { accounts: [], rates: [] };

  async function cargarDatosDePago() {
    try {
      const [pi, er] = await Promise.all([
        fetch('/api/payment-info').then(r => r.json()),
        fetch('/api/exchange-rates').then(r => r.json()),
      ]);
      adminPago = { accounts: pi.accounts || [], rates: er.rates || [] };
    } catch { adminPago = { accounts: [], rates: [] }; }
  }

  function montoEnMoneda(cup, code) {
    const rate = adminPago.rates.find(r => r.code === code);
    if (!rate || code === 'CUP' || !rate.cupPerUnit) return formatCup(cup);
    const v = cup / rate.cupPerUnit;
    const dec = decimalesDe(code);
    return fmt(v, dec) + ' ' + (rate.label || code);
  }

  // ---------- Pagar el plan con el saldo ----------
  function costoEnBilletera(totalCup, code) {
    if (code === 'CUP') return totalCup;
    const r = adminPago.rates.find(x => x.code === code);
    if (!r || !(r.cupPerUnit > 0)) return null;
    const f = Math.pow(10, decimalesDe(code));
    return Math.ceil((totalCup / r.cupPerUnit) * f - 1e-9) / f;
  }
  function pintarPagoConSaldo() {
    const box = $('plan-balance-box');
    const bills = (retiros && retiros.billeteras) || [];
    const total = planModalState.price * planModalState.months;
    const opciones = bills.map(b => ({ b, costo: costoEnBilletera(total, b.code) })).filter(x => x.costo !== null);
    if (!opciones.length) { box.style.display = 'none'; return; }
    box.style.display = '';
    const sel = $('plan-wallet');
    const antes = sel.value;
    sel.innerHTML = opciones.map(x => '<option value="' + escapeHtml(x.b.code) + '">' + montoUnidades(x.b.unidades, x.b.code, x.b.label) +
      (x.b.unidades + 1e-9 < x.costo ? ' (no alcanza)' : '') + '</option>').join('');
    const alcanza = opciones.find(x => x.b.unidades + 1e-9 >= x.costo);
    // si ningún saldo alcanza, basta una línea: no hace falta mostrar el formulario
    box.classList.toggle('corto', !alcanza);
    $('plan-balance-falta').textContent = alcanza ? '' : 'Tu saldo no alcanza para este pago. Tienes ' + opciones.map(o => montoUnidades(o.b.unidades, o.b.code, o.b.label)).join(', ') + '.';
    sel.value = opciones.some(x => x.b.code === antes) ? antes : (alcanza ? alcanza.b.code : opciones[0].b.code);
    const x = opciones.find(o => o.b.code === sel.value);
    const ok = x.b.unidades + 1e-9 >= x.costo;
    $('plan-wallet-cost').textContent = fmt(x.costo, decimalesDe(x.b.code)) + ' ' + x.b.label;
    $('plan-wallet-rest').textContent = ok ? fmt(x.b.unidades - x.costo, decimalesDe(x.b.code)) + ' ' + x.b.label : 'Tu saldo no alcanza';
    $('plan-wallet-rest').classList.toggle('falta', !ok);
    $('plan-balance-btn').disabled = !ok;
  }
  $('plan-wallet').addEventListener('change', pintarPagoConSaldo);
  $('plan-balance-btn').addEventListener('click', async () => {
    const btn = $('plan-balance-btn');
    const x = $('plan-wallet').selectedOptions[0];
    const pl = perfil.planes.find(p => p.key === planModalState.plan);
    if (!confirm('¿Activar el plan ' + (pl ? pl.label : '') + ' por ' + planModalState.months + (planModalState.months === 1 ? ' mes' : ' meses') + ' pagando ' + $('plan-wallet-cost').textContent + ' de tu saldo?')) return;
    btn.disabled = true;
    try {
      const res = await fetch('/api/producer/plan-con-saldo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planModalState.plan, months: planModalState.months, wallet: x ? x.value : 'CUP' }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        planModal.classList.remove('active');
        showToast('¡Listo! Plan ' + (pl ? pl.label : '') + ' activo hasta el ' + d.paidUntil + '. Se descontaron ' + fmt(d.cobrado, 2).replace(/,00$/, '') + ' ' + d.moneda + ' de tu saldo.');
        loadPerfil().then(() => { loadTracks(); loadStats(); });
        loadWithdrawals(); loadEarnings();
      } else if (res.status === 401) showLogin();
      else { showToast(d.error || 'No se pudo activar el plan.', true); btn.disabled = false; }
    } catch {
      showToast('Se perdió la conexión. Intenta de nuevo.', true);
      btn.disabled = false;
    }
  });

  // Ventanas de pago en dos pasos: 1) duración y saldo  2) transferencia
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-ir-paso]');
    if (!b) return;
    const caja = b.closest('.plan-modal-box');
    if (!caja) return;
    ZBUI.transicion(() => { caja.dataset.paso = b.dataset.irPaso; caja.scrollTop = 0; });
    setTimeout(() => { const t = caja.querySelector('.m-paso[data-paso="' + b.dataset.irPaso + '"] button, .m-paso[data-paso="' + b.dataset.irPaso + '"] select'); if (t) t.focus({ preventScroll: true }); }, 60);
  });

  function actualizarModalPlan() {
    pintarPagoConSaldo();
    const total = planModalState.price * planModalState.months;
    $('plan-total-cup').textContent = formatCup(total);
    $('plan-paso-resumen').textContent = planModalState.months + (planModalState.months === 1 ? ' mes' : ' meses') + ', ' + formatCup(total);
    const code = $('plan-currency').value || 'CUP';
    $('plan-total').textContent = code === 'CUP' ? formatCup(total) : montoEnMoneda(total, code) + ' (' + formatCup(total) + ')';
    const cuentas = adminPago.accounts.filter(a => a.currency === code);
    $('plan-accounts').innerHTML = cuentas.length
      ? cuentas.map(a => '<div class="plan-account"><div><div class="pa-bank">' + escapeHtml(a.bank) + '</div><div class="pa-num">' + escapeHtml(a.number) + '</div></div><button type="button" class="pa-copy" data-n="' + escapeHtml(a.number) + '">Copiar</button></div>').join('')
      : '<p class="panel-hint">No hay cuenta configurada para esa moneda.</p>';
    document.querySelectorAll('.pa-copy').forEach(b => b.addEventListener('click', () => {
      if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.n).then(() => { b.textContent = 'Copiado'; setTimeout(() => { b.textContent = 'Copiar'; }, 1400); });
    }));
  }

  async function openPlanModal(planKey) {
    const pl = perfil.planes.find(x => x.key === planKey);
    if (!pl) return;
    if (!pl.priceCup) { showToast('Precio no disponible por ahora.', true); return; }
    await Promise.all([cargarDatosDePago(), loadWithdrawals()]);
    planModalState = { plan: planKey, months: 1, price: pl.priceCup };
    $('plan-modal-title').textContent = (planKey === perfil.plan ? 'Renovar plan ' : 'Plan ') + pl.label;
    $('plan-modal-benefits').textContent = '$' + fmt(pl.priceUsd, pl.priceUsd % 1 ? 2 : 0) + ' USD/mes = ' + formatCup(pl.priceCup) + '/mes · ' +
      pl.commission + '% de comisión · te pagamos en ' + pl.payout +
      (planKey === perfil.plan && perfil.planVigente ? '. Los meses se suman a tu fecha actual (' + perfil.planPaidUntil + ').' : '.');
    const monedas = [...new Set(adminPago.accounts.map(a => a.currency))];
    const sel = $('plan-currency');
    sel.innerHTML = (monedas.length ? monedas : ['CUP']).map(m => {
      const r = adminPago.rates.find(x => x.code === m);
      return '<option value="' + escapeHtml(m) + '">' + escapeHtml((r && r.label) || m) + '</option>';
    }).join('');
    document.querySelectorAll('.month-opt').forEach(b => {
      const m = Number(b.dataset.m);
      b.classList.toggle('active', m === 1);
      b.innerHTML = '<span>' + m + (m === 1 ? ' mes' : ' meses') + '</span><span class="opt-p">' + formatCup(pl.priceCup * m) + '</span>';
    });
    $('plan-receipt-input').value = '';
    $('plan-receipt-label').textContent = 'Adjuntar comprobante de pago';
    $('plan-receipt-drop').classList.remove('has-file');
    $('plan-modal-box').dataset.paso = '1';
    actualizarModalPlan();
    planModal.classList.add('active');
  }

  document.querySelectorAll('.month-opt').forEach(b => b.addEventListener('click', () => {
    planModalState.months = Number(b.dataset.m);
    document.querySelectorAll('.month-opt').forEach(x => x.classList.toggle('active', x === b));
    actualizarModalPlan();
  }));
  $('plan-currency').addEventListener('change', actualizarModalPlan);
  $('plan-modal-close').addEventListener('click', () => planModal.classList.remove('active'));
  planModal.addEventListener('click', (e) => { if (e.target === planModal) planModal.classList.remove('active'); });
  wireFileDrop($('plan-receipt-drop'), $('plan-receipt-input'), $('plan-receipt-label'), 'Adjuntar comprobante de pago');

  $('plan-send-btn').addEventListener('click', async () => {
    let f = $('plan-receipt-input').files[0];
    if (!f) { showToast('Adjunta la foto del comprobante.', true); return; }
    const btn = $('plan-send-btn');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    // la foto se achica antes de subirla: con datos móviles llega en segundos
    if (window.ZBSubidas) f = await window.ZBSubidas.comprimirImagen(f, 1600, 0.82);
    const fd = new FormData();
    fd.append('plan', planModalState.plan);
    fd.append('months', String(planModalState.months));
    fd.append('currency', $('plan-currency').value || 'CUP');
    fd.append('receipt', f, f.name || 'comprobante.jpg');
    try {
      const res = await fetch('/api/producer/plan-request', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        planModal.classList.remove('active');
        showToast('Comprobante enviado. Tu plan se activará al confirmarse el pago.');
        loadPerfil();
      } else {
        showToast(d.error || 'No se pudo enviar el comprobante.', true);
      }
    } catch {
      showToast('Se perdió la conexión. Intenta de nuevo.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar comprobante';
    }
  });

  // ---------- Hots ----------
  let hotsInfo = null;
  const hotModal = $('hot-modal');
  let hotState = { track: null, weeks: 1 };
  const semanasTxt = (w) => w + (w === 1 ? ' semana' : ' semanas');

  function pintarHotSaldo() {
    const box = $('hot-balance-box');
    const bills = (retiros && retiros.billeteras) || [];
    const total = hotsInfo.precioSemanaCup * hotState.weeks;
    const opciones = bills.map(b => ({ b, costo: costoEnBilletera(total, b.code) })).filter(x => x.costo !== null);
    if (!opciones.length) { box.style.display = 'none'; return; }
    box.style.display = '';
    const sel = $('hot-wallet');
    const antes = sel.value;
    sel.innerHTML = opciones.map(x => '<option value="' + escapeHtml(x.b.code) + '">' + montoUnidades(x.b.unidades, x.b.code, x.b.label) +
      (x.b.unidades + 1e-9 < x.costo ? ' (no alcanza)' : '') + '</option>').join('');
    const alcanza = opciones.find(x => x.b.unidades + 1e-9 >= x.costo);
    box.classList.toggle('corto', !alcanza);
    $('hot-balance-falta').textContent = alcanza ? '' : 'Tu saldo no alcanza para este pago. Tienes ' + opciones.map(o => montoUnidades(o.b.unidades, o.b.code, o.b.label)).join(', ') + '.';
    sel.value = opciones.some(x => x.b.code === antes) ? antes : (alcanza ? alcanza.b.code : opciones[0].b.code);
    const x = opciones.find(o => o.b.code === sel.value);
    const ok = x.b.unidades + 1e-9 >= x.costo;
    $('hot-wallet-cost').textContent = fmt(x.costo, decimalesDe(x.b.code)) + ' ' + x.b.label;
    $('hot-wallet-rest').textContent = ok ? fmt(x.b.unidades - x.costo, decimalesDe(x.b.code)) + ' ' + x.b.label : 'Tu saldo no alcanza';
    $('hot-wallet-rest').classList.toggle('falta', !ok);
    $('hot-balance-btn').disabled = !ok;
  }
  function actualizarModalHot() {
    pintarHotSaldo();
    const total = hotsInfo.precioSemanaCup * hotState.weeks;
    $('hot-paso-resumen').textContent = semanasTxt(hotState.weeks) + ', ' + formatCup(total);
    const code = $('hot-currency').value || 'CUP';
    $('hot-total').textContent = code === 'CUP' ? formatCup(total) : montoEnMoneda(total, code) + ' (' + formatCup(total) + ')';
    const cuentas = adminPago.accounts.filter(a => a.currency === code);
    $('hot-accounts').innerHTML = cuentas.length
      ? cuentas.map(a => '<div class="plan-account"><div><div class="pa-bank">' + escapeHtml(a.bank) + '</div><div class="pa-num">' + escapeHtml(a.number) + '</div></div><button type="button" class="pa-copy" data-n="' + escapeHtml(a.number) + '">Copiar</button></div>').join('')
      : '<p class="panel-hint">No hay cuenta configurada para esa moneda.</p>';
    $('hot-accounts').querySelectorAll('.pa-copy').forEach(b => b.addEventListener('click', () => {
      if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.n).then(() => { b.textContent = 'Copiado'; setTimeout(() => { b.textContent = 'Copiar'; }, 1400); });
    }));
  }
  async function abrirModalHot(t) {
    await Promise.all([cargarDatosDePago(), loadWithdrawals()]);
    const hres = await fetch('/api/producer/hots');
    if (hres.ok) hotsInfo = await hres.json();
    if (!hotsInfo || !hotsInfo.precioSemanaCup) { showToast('Los Hots aún no están disponibles.', true); return; }
    const hasta = hotsInfo.activos[t.id];
    if (!hasta && hotsInfo.libres <= 0) {
      showToast('Los cupos de Hots están llenos.' + (hotsInfo.proximoLibre ? ' El próximo se libera el ' + ZBHistorial.fechaHora(hotsInfo.proximoLibre) + '.' : ''), true);
      return;
    }
    hotState = { track: t, weeks: 1 };
    $('hot-modal-title').textContent = (hasta ? 'Extender Hot: ' : 'Poner en Hots: ') + t.title;
    $('hot-modal-info').textContent = 'Tu beat sale en el carrusel de la portada de la tienda. ' + formatCup(hotsInfo.precioSemanaCup) + ' por semana' +
      (hotsInfo.precioSemanaUsd ? ' ($' + fmt(hotsInfo.precioSemanaUsd, hotsInfo.precioSemanaUsd % 1 ? 2 : 0) + ' USD)' : '') + '. ' +
      (hasta ? 'Ya está en Hots hasta el ' + ZBHistorial.fechaHora(hasta) + ': el tiempo nuevo se suma a esa fecha.' : 'Quedan ' + hotsInfo.libres + ' de ' + hotsInfo.cupos + ' cupos libres.');
    const monedas = [...new Set(adminPago.accounts.map(a => a.currency))];
    $('hot-currency').innerHTML = (monedas.length ? monedas : ['CUP']).map(m => {
      const r = adminPago.rates.find(x => x.code === m);
      return '<option value="' + escapeHtml(m) + '">' + escapeHtml((r && r.label) || m) + '</option>';
    }).join('');
    hotModal.querySelectorAll('.week-opt').forEach(b => {
      b.classList.toggle('active', b.dataset.w === '1');
      b.innerHTML = '<span>' + semanasTxt(Number(b.dataset.w)) + '</span><span class="opt-p">' + formatCup(hotsInfo.precioSemanaCup * Number(b.dataset.w)) + '</span>';
    });
    $('hot-receipt-input').value = '';
    $('hot-receipt-label').textContent = 'Adjuntar comprobante de pago';
    $('hot-receipt-drop').classList.remove('has-file');
    $('hot-modal-box').dataset.paso = '1';
    actualizarModalHot();
    hotModal.classList.add('active');
  }
  hotModal.querySelectorAll('.week-opt').forEach(b => b.addEventListener('click', () => {
    hotState.weeks = Number(b.dataset.w);
    hotModal.querySelectorAll('.week-opt').forEach(x => x.classList.toggle('active', x === b));
    actualizarModalHot();
  }));
  $('hot-currency').addEventListener('change', actualizarModalHot);
  $('hot-wallet').addEventListener('change', pintarHotSaldo);
  $('hot-modal-close').addEventListener('click', () => hotModal.classList.remove('active'));
  hotModal.addEventListener('click', (e) => { if (e.target === hotModal) hotModal.classList.remove('active'); });
  wireFileDrop($('hot-receipt-drop'), $('hot-receipt-input'), $('hot-receipt-label'), 'Adjuntar comprobante de pago');

  $('hot-balance-btn').addEventListener('click', async () => {
    const btn = $('hot-balance-btn');
    const x = $('hot-wallet').selectedOptions[0];
    if (!confirm('¿Poner «' + hotState.track.title + '» en Hots por ' + semanasTxt(hotState.weeks) + ' pagando ' + $('hot-wallet-cost').textContent + ' de tu saldo?')) return;
    btn.disabled = true;
    try {
      const res = await fetch('/api/producer/hots/saldo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId: hotState.track.id, weeks: hotState.weeks, wallet: x ? x.value : 'CUP' }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        hotModal.classList.remove('active');
        showToast('¡Listo! «' + hotState.track.title + '» está en la portada hasta el ' + ZBHistorial.fechaHora(d.hasta) + '.');
        loadTracks(); loadWithdrawals(); loadEarnings();
      } else if (res.status === 401) showLogin();
      else { showToast(d.error || 'No se pudo activar el Hot.', true); btn.disabled = false; }
    } catch {
      showToast('Se perdió la conexión. Intenta de nuevo.', true);
      btn.disabled = false;
    }
  });

  $('hot-send-btn').addEventListener('click', async () => {
    let f = $('hot-receipt-input').files[0];
    if (!f) { showToast('Adjunta la foto del comprobante.', true); return; }
    const btn = $('hot-send-btn');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    if (window.ZBSubidas) f = await window.ZBSubidas.comprimirImagen(f, 1600, 0.82);
    const fd = new FormData();
    fd.append('trackId', String(hotState.track.id));
    fd.append('weeks', String(hotState.weeks));
    fd.append('currency', $('hot-currency').value || 'CUP');
    fd.append('receipt', f, f.name || 'comprobante.jpg');
    try {
      const res = await fetch('/api/producer/hots', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        hotModal.classList.remove('active');
        showToast('Comprobante enviado. Tu beat saldrá en portada al confirmarse el pago.');
        loadTracks(); loadMovimientos();
      } else showToast(d.error || 'No se pudo enviar el comprobante.', true);
    } catch {
      showToast('Se perdió la conexión. Intenta de nuevo.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar comprobante';
    }
  });

  // ---------- Redes y cuentas ----------
  function renderSocial(links) {
    const cont = $('social-list');
    cont.innerHTML = '';
    (links.length ? links : [{ label: '', url: '' }]).forEach(l => addSocialRow(l.label, l.url));
  }
  function addSocialRow(label = '', url = '') {
    const row = document.createElement('div');
    row.className = 'row-pair';
    row.innerHTML =
      '<input type="text" class="s-label" placeholder="Instagram" maxlength="40" value="' + escapeHtml(label) + '">' +
      '<input type="text" class="s-url" placeholder="https://…" maxlength="300" value="' + escapeHtml(url) + '">' +
      '<button type="button" class="row-remove" aria-label="Quitar">&times;</button>';
    row.querySelector('.row-remove').addEventListener('click', () => row.remove());
    $('social-list').appendChild(row);
  }
  function renderAccounts(accounts) {
    const cont = $('accounts-list');
    cont.innerHTML = '';
    (accounts.length ? accounts : [{ currency: '', bank: '', number: '' }]).forEach(a => addAccountRow(a.currency, a.bank, a.number));
  }
  function addAccountRow(currency = '', bank = '', number = '') {
    const permitidas = (perfil && perfil.monedasPermitidas) || [];
    const row = document.createElement('div');
    row.className = 'row-triple';
    row.innerHTML =
      '<select class="a-currency" aria-label="Moneda de la cuenta">' + permitidas.map(m => '<option value="' + escapeHtml(m) + '"' + (m === currency ? ' selected' : '') + '>' + escapeHtml(((perfil && perfil.etiquetasMonedas) || {})[m] || m) + '</option>').join('') + '</select>' +
      '<input type="text" class="a-bank" placeholder="Banco / plataforma" maxlength="60" value="' + escapeHtml(bank) + '">' +
      '<input type="text" class="a-number" placeholder="Número de cuenta / wallet" maxlength="60" value="' + escapeHtml(number) + '">' +
      '<button type="button" class="row-remove" aria-label="Quitar">&times;</button>';
    row.querySelector('.row-remove').addEventListener('click', () => row.remove());
    $('accounts-list').appendChild(row);
  }
  // Cuentas de cobro y redes: por páginas, con las filas que quepan en la pantalla
  const pagRedes = ZBUI.paginarDom($('social-list'), { porPagina: () => ZBUI.filasPorPagina(3, 4), etiqueta: 'Páginas de redes sociales' });
  const pagCuentas = ZBUI.paginarDom($('accounts-list'), { porPagina: () => ZBUI.filasPorPagina(3, 4), etiqueta: 'Páginas de cuentas' });
  // la fila nueva queda a la vista (última página) y lista para escribir
  function irAlaNueva(pag, lista) {
    if (pag) pag.ultima();
    const ult = $(lista).lastElementChild;
    const campo = ult && ult.querySelector('input');
    if (campo) campo.focus({ preventScroll: true });
  }
  $('add-social').addEventListener('click', () => { addSocialRow(); irAlaNueva(pagRedes, 'social-list'); });
  $('add-account').addEventListener('click', () => { addAccountRow(); irAlaNueva(pagCuentas, 'accounts-list'); });

  async function guardarPerfil(e) {
    const btn = e && e.currentTarget;
    const socialLinks = Array.from(document.querySelectorAll('#social-list .row-pair')).map(r => ({
      label: r.querySelector('.s-label').value.trim(),
      url: r.querySelector('.s-url').value.trim(),
    })).filter(l => l.url);
    const accounts = Array.from(document.querySelectorAll('#accounts-list .row-triple')).map(r => ({
      currency: r.querySelector('.a-currency').value,
      bank: r.querySelector('.a-bank').value.trim(),
      number: r.querySelector('.a-number').value.trim(),
    })).filter(a => a.bank || a.number);
    if (btn) btn.disabled = true;
    let res;
    try {
      res = await fetch('/api/producer/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: $('profile-name').value,
          bio: $('profile-bio').value,
          contactPhone: $('profile-phone').value,
          socialLinks: perfil && perfil.puedeRedes ? socialLinks : (perfil ? perfil.socialLinks : []),
          accounts,
        }),
      });
    } catch {
      if (btn) btn.disabled = false;
      showToast('Se perdió la conexión. Intenta de nuevo.', true);
      return;
    }
    if (btn) btn.disabled = false;
    const que = btn && btn.id === 'save-accounts' ? 'Cuentas guardadas' : 'Perfil guardado';
    if (res.ok) {
      const d = await res.json();
      if (d.rechazadas && d.rechazadas.length) showToast(que + ', pero no se aceptaron: ' + d.rechazadas.join(', ') + '.', true);
      else showToast(que + '.');
      loadPerfil(); loadWithdrawals();
    } else if (res.status === 401) {
      showLogin();
    } else {
      const d = await res.json().catch(() => ({}));
      // si el problema está en otra subpestaña (el WhatsApp está en Perfil), se lleva allí
      if (/WhatsApp/i.test(d.error || '')) abrirPestana('cuenta/perfil');
      showToast(d.error || 'No se pudo guardar.', true);
    }
  }
  $('save-profile').addEventListener('click', guardarPerfil);
  $('save-accounts').addEventListener('click', guardarPerfil);

  $('save-password').addEventListener('click', async () => {
    const actual = $('pass-current').value;
    const nueva = $('pass-new').value;
    if (!actual) return showToast('Escribe tu contraseña actual.', true);
    if (nueva.length < 6) return showToast('La contraseña nueva debe tener al menos 6 caracteres.', true);
    const btn = $('save-password');
    btn.disabled = true;
    try {
      const res = await fetch('/api/producer/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: actual, password: nueva }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        $('pass-current').value = ''; $('pass-new').value = '';
        showToast('Contraseña cambiada.');
      } else if (res.status === 401) showLogin();
      else showToast(d.error || 'No se pudo cambiar la contraseña.', true);
    } catch {
      showToast('Se perdió la conexión. Intenta de nuevo.', true);
    } finally {
      btn.disabled = false;
    }
  });

  $('avatar-input').addEventListener('change', async () => {
    let f = $('avatar-input').files[0];
    if (!f) return;
    if (window.ZBSubidas) f = await window.ZBSubidas.comprimirImagen(f, 1200, 0.85);
    if (f.size > 8 * 1024 * 1024) { showToast('La foto pesa más de 8 MB.', true); return; }
    const fd = new FormData();
    fd.append('avatar', f, f.name || 'foto.jpg');
    try {
      const res = await fetch('/api/producer/avatar', { method: 'POST', body: fd });
      if (res.ok) { showToast('Foto actualizada.'); loadPerfil(); }
      else { const d = await res.json().catch(() => ({})); showToast(d.error || 'No se pudo subir la foto.', true); }
    } catch {
      showToast('Se perdió la conexión. Intenta de nuevo.', true);
    }
    $('avatar-input').value = '';
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    planModal.classList.remove('active');
    wModal.classList.remove('active');
    editModal.classList.remove('active');
  });

  irPaso(1, false);
  checkAuth();
})();
