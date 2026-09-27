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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
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

  // ---------- Pestañas ----------
  const tabs = document.querySelectorAll('.dash-tab');
  function abrirPestana(nombre) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === nombre));
    document.querySelectorAll('.tab-page').forEach(p => p.classList.toggle('active', p.dataset.page === nombre));
    try { sessionStorage.setItem('zb_prod_tab', nombre); } catch { /* sin almacenamiento */ }
    if (nombre === 'stats') loadStats();
    if (nombre === 'dinero') { loadWithdrawals(); loadEarnings(); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const activo = document.querySelector('.dash-tab.active');
    if (activo && activo.scrollIntoView) activo.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  tabs.forEach(t => t.addEventListener('click', () => abrirPestana(t.dataset.tab)));

  // ---------- Sesión ----------
  function showApp(name) {
    loginScreen.style.display = 'none';
    dashShell.style.display = 'block';
    $('producer-name-label').textContent = name || '';
    let tab = 'resumen';
    try { tab = sessionStorage.getItem('zb_prod_tab') || 'resumen'; } catch { /* nada */ }
    loadPerfil().then(() => { loadTracks(); loadEarnings(); loadWithdrawals(); loadStats(); abrirPestana(tab); });
  }
  function showLogin() {
    loginScreen.style.display = 'flex';
    dashShell.style.display = 'none';
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
  const refParam = new URLSearchParams(location.search).get('ref');
  if (refParam) {
    $('reg-ref').value = refParam.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
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
    };
    const res = await fetch('/api/producer/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok) {
      ok.classList.add('show');
      ['reg-name', 'reg-email', 'reg-password', 'reg-phone', 'reg-ref'].forEach(id => { $(id).value = ''; });
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
      ? 'Escríbele al administrador y te pone una contraseña nueva: <a class="disabled-wa" href="' +
        waLink(tel, 'Hola, olvidé mi contraseña del portal de productores de Zona Beats.' + (correo ? ' Mi correo es ' + correo + '.' : '')) +
        '" target="_blank" rel="noopener">WhatsApp ' + escapeHtml(tel) + '</a>'
      : 'Escríbele al administrador para que te ponga una contraseña nueva.';
  });

  // ---------- Perfil y plan ----------
  let perfil = null;

  async function loadPerfil() {
    const res = await fetch('/api/producer/me');
    if (res.status === 401) { showLogin(); return; }
    if (!res.ok) return;
    perfil = await res.json();

    $('plan-chip').textContent = perfil.planLabel;
    const nombresLic = { basic: 'Básica', premium: 'Premium', unlimited: 'Ilimitada', exclusive: 'Exclusiva' };
    $('plan-facts').innerHTML =
      fact('Comisión de la plataforma', perfil.planCommission + '%') +
      fact('Beats activos', perfil.beatsUsados + (perfil.planMaxBeats ? ' / ' + perfil.planMaxBeats : ' / ilimitados')) +
      fact('Te pagamos en', perfil.planPayout) +
      fact('Licencias que puedes vender', perfil.licenciasPermitidas.map(l => nombresLic[l]).join(', ')) +
      (perfil.planPaidUntil && perfil.plan !== 'free' ? fact('Pagado hasta', perfil.planPaidUntil) : '');

    const warn = $('plan-warning');
    if (perfil.plan !== 'free' && !perfil.planVigente) {
      warn.className = 'plan-warning danger';
      warn.textContent = perfil.diasParaEliminar > 0
        ? 'Tu plan venció. Si no lo renuevas en ' + perfil.diasParaEliminar + ' día(s), tu cuenta se desactiva. Mientras tanto no puedes subir beats y cobras con la comisión del plan Free.'
        : 'Tu plan venció y pasó el plazo de 15 días. Renueva ya en la pestaña Plan.';
      warn.style.display = 'block';
    } else if (perfil.diasRestantes !== null && perfil.diasRestantes <= 15 && perfil.plan !== 'free') {
      warn.className = 'plan-warning';
      warn.textContent = 'Tu plan vence en ' + perfil.diasRestantes + ' día(s). Renuévalo en la pestaña Plan.';
      warn.style.display = 'block';
    } else {
      warn.style.display = 'none';
    }

    const tel = perfil.adminPhone;
    $('plan-contact').innerHTML = tel
      ? 'Dudas sobre tu plan: escríbele al administrador por <a href="' + waLink(tel) + '" target="_blank" rel="noopener"><strong>WhatsApp ' + escapeHtml(tel) + '</strong></a>.'
      : '';

    renderPlanes();
    renderPlanRequestStatus(perfil.planRequest, perfil);
    renderIncentivo();

    $('profile-name').value = perfil.name || '';
    $('profile-bio').value = perfil.bio || '';
    $('profile-phone').value = perfil.contactPhone || '';
    const av = $('avatar-preview');
    if (perfil.avatar) { av.src = '/api/producer/avatar/' + perfil.id + '?s=300&t=' + Date.now(); av.style.display = 'block'; }

    $('currency-hint').textContent = perfil.monedasPermitidas.length
      ? 'Solo puedes usar las monedas que acepta la plataforma: ' + perfil.monedasPermitidas.join(', ') + '. Aquí te pagamos cuando retires.'
      : 'El administrador todavía no configuró métodos de cobro.';

    renderSocial(perfil.socialLinks || []);
    renderAccounts(perfil.accounts || []);
    applyPlanLimits(perfil);

    const link = location.origin + '/productores?ref=' + perfil.referralCode;
    $('ref-link').value = link;
  }

  function fact(label, value) {
    return '<div class="plan-fact"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
  }

  function precioPlanHtml(pl) {
    if (!pl.priceUsd && !pl.priceCup) return '<div class="plan-card-price">Gratis</div>';
    return '<div class="plan-card-price">' +
      '<span class="price-usd">$' + fmt(pl.priceUsd, pl.priceUsd % 1 ? 2 : 0) + ' USD/mes</span>' +
      (pl.priceCup ? '<span class="price-cup">' + formatCup(pl.priceCup) + '/mes</span>' : '') +
    '</div>';
  }

  function renderPlanes() {
    const solicitudPendiente = perfil.planRequest && perfil.planRequest.status === 'pending';
    const feats = {
      free: ['5 beats activos', 'Comisión 30%', 'Previews con tag', 'Solo MP3 (320 kbps)', 'Solo licencia Básica', 'Pago en 7-14 días', 'Estadística de referidos'],
      pro: ['50 beats activos', 'Comisión 20%', 'Previews sin tag', 'WAV / MP3 (320 kbps)', 'Licencias Básica y Premium', 'Estadísticas', 'Tus redes en tu perfil', 'Pago en 3 días'],
      studio: ['Beats ilimitados', 'Playlist', 'Comisión 10%', 'Estadísticas', 'STEMS + WAV + MP3', 'Todas las licencias + Exclusivas', 'Pago en 24 horas', 'Bono por me gusta en Playlist'],
    };
    $('plans-grid').innerHTML = perfil.planes.map(pl => {
      const esActual = pl.key === perfil.plan;
      let boton = '';
      if (pl.key !== 'free') {
        const texto = esActual ? 'Renovar' : 'Comprar ' + pl.label;
        boton = '<button type="button" class="btn-buy-plan" data-plan="' + pl.key + '"' + (solicitudPendiente ? ' disabled' : '') + '>' + texto + '</button>';
      }
      return '<div class="plan-card' + (esActual ? ' current' : '') + (pl.key === 'studio' ? ' studio' : '') + '">' +
        '<div class="plan-card-name">' + pl.label + (esActual ? ' <span class="plan-current-tag">tu plan</span>' : '') + '</div>' +
        precioPlanHtml(pl) +
        '<ul class="plan-card-list">' + (feats[pl.key] || []).map(f => '<li>' + escapeHtml(f) + '</li>').join('') + '</ul>' + boton +
      '</div>';
    }).join('');
    document.querySelectorAll('.btn-buy-plan').forEach(b => b.addEventListener('click', () => openPlanModal(b.dataset.plan)));
    $('plan-rate-note').textContent = perfil.usdRate
      ? 'Precios en CUP calculados con la tasa del administrador: 1 USD = ' + fmt(perfil.usdRate, 0) + ' CUP.'
      : '';
  }

  function renderIncentivo() {
    const box = $('incentive-card');
    const esStudio = perfil.plan === 'studio' && perfil.planVigente;
    box.className = 'incentive-card' + (esStudio ? ' active' : '');
    box.innerHTML = esStudio
      ? '<div class="inc-kicker">BONO STUDIO ACTIVO</div><div class="inc-title">Cada 1000 me gusta por canción en Playlist, la plataforma te regala 2000 CUP.</div><div class="inc-sub">Mira tu avance en la pestaña Estadísticas. El bono se suma solo a tu saldo.</div>'
      : '<div class="inc-kicker">PLAN STUDIO</div><div class="inc-title">Cada 1000 me gusta por canción en Playlist, la plataforma te regala 2000 CUP.</div><div class="inc-sub">Además: Playlist, beats ilimitados, STEMS, Exclusivas, 10% de comisión y pago en 24 horas.</div><button type="button" class="btn-inc" id="inc-go">Ver plan Studio</button>';
    const go = $('inc-go');
    if (go) go.addEventListener('click', () => abrirPestana('plan'));
  }

  function renderPlanRequestStatus(r, p) {
    const box = $('plan-request-status');
    if (p.desactivadoPorPago) {
      box.className = 'plan-request-status danger';
      box.innerHTML = 'Tu cuenta está <strong>desactivada por falta de pago</strong>: no apareces en la tienda y no puedes subir beats. Compra o renueva tu plan aquí abajo para reactivarla.';
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

    const nombres = { basic: 'Básica', premium: 'Premium', unlimited: 'Ilimitada', exclusive: 'Exclusiva' };
    const reglas = [
      'Plan ' + p.planLabel + ': puedes vender ' + lic.map(l => nombres[l]).join(', ') + '.',
      p.soloMp3 ? 'Audio solo en MP3 de 320 kbps.' : 'Audio en MP3 de 320 kbps o WAV.',
      p.previewConMarca ? 'Tus previews llevan la marca de agua de la plataforma.' : 'Tus previews van sin marca de agua.',
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
    aviso.textContent = '';
    const f = coverInput.files[0];
    if (!f || !window.ZBSubidas) return;
    const m = await window.ZBSubidas.medirImagen(f);
    if (!m) { aviso.textContent = 'No se pudo leer la imagen. Prueba con otro JPG o PNG.'; return; }
    if (prev.src && prev.src.startsWith('blob:')) URL.revokeObjectURL(prev.src);
    prev.src = m.url;
    prev.style.display = 'block';
    if (Math.abs(m.w - m.h) > Math.max(m.w, m.h) * 0.02) aviso.textContent = 'Tu portada mide ' + m.w + 'x' + m.h + ' px: no es cuadrada, en la tienda se verá recortada al centro.';
    else if (m.w < 1000) aviso.textContent = 'Tu portada mide ' + m.w + 'x' + m.h + ' px: se verá borrosa. Lo ideal es 3000x3000 px.';
  });

  function resetUploadForm() {
    uploadForm.reset();
    ['audio-drop', 'cover-drop', 'wav-drop', 'stems-drop'].forEach(id => $(id).classList.remove('has-file'));
    $('audio-drop-label').textContent = audioDefault;
    $('cover-drop-label').textContent = COVER_LABEL;
    $('wav-drop-label').textContent = WAV_LABEL;
    $('stems-drop-label').textContent = STEMS_LABEL;
    $('cover-preview').style.display = 'none';
    $('cover-note').textContent = '';
    actualizarFormulario();
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
      if ((precios.premium > 0 || precios.unlimited > 0 || precios.exclusive > 0) && !hayWav) return 'Esa licencia exige el archivo WAV. Súbelo para continuar.';
      if ((precios.unlimited > 0 || precios.exclusive > 0) && !stems) return 'Esa licencia exige los STEMS (ZIP). Súbelos para continuar.';
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
    if (!window.ZBSubidas) return showToast('No se pudo cargar el sistema de subidas. Recarga la página.', true);
    if (!titleInput.value.trim()) return showToast('Ponle título al beat.', true);

    const esPlaylist = isPlaylistInput.checked;
    const exclusivo = makeExclusiveInput.checked && !esPlaylist;
    const leer = (el) => (window.ZBSubidas ? window.ZBSubidas.precio(el.value) : 0);
    const precios = esPlaylist ? { basic: 0, premium: 0, unlimited: 0, exclusive: 0 }
      : exclusivo ? { basic: 0, premium: 0, unlimited: 0, exclusive: leer(priceExclusiveInput) }
      : { basic: leer(priceBasicInput), premium: leer(pricePremiumInput), unlimited: leer(priceUnlimitedInput), exclusive: 0 };
    if (!esPlaylist && !Object.values(precios).some(v => v > 0)) {
      return showToast(exclusivo ? 'Ponle el precio exclusivo al beat.' : 'Ponle precio a al menos una licencia.', true);
    }

    uploadBtn.disabled = true;
    const problema = await validarArchivosAntesDeSubir(esPlaylist, precios);
    if (problema) { uploadBtn.disabled = false; return showToast(problema, true); }

    const Z = window.ZBSubidas;
    const lista = [
      { kind: 'cover', file: coverInput.files[0], etiqueta: 'la portada' },
      { kind: 'audio', file: audioInput.files[0], etiqueta: 'el audio' },
    ];
    if (!esPlaylist && wavInput.files[0]) lista.push({ kind: 'wav', file: wavInput.files[0], etiqueta: 'el WAV' });
    if (!esPlaylist && stemsInput.files[0]) lista.push({ kind: 'stems', file: stemsInput.files[0], etiqueta: 'los STEMS' });

    subiendo = true;
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
      setUploadProgress(100, perfil && perfil.previewConMarca ? 'Procesando: creando el preview con marca de agua…' : 'Procesando: creando el preview…');
      const res = await fetch('/api/producer/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleInput.value, genre: genreInput.value, description: descriptionInput.value,
          isPlaylist: esPlaylist, artistCredit: esPlaylist ? artistCreditInput.value : '',
          priceBasic: precios.basic, pricePremium: precios.premium, priceUnlimited: precios.unlimited, priceExclusive: precios.exclusive,
          audioUploadId: ids.audio, coverUploadId: ids.cover, wavUploadId: ids.wav || '', stemsUploadId: ids.stems || '',
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        lista.forEach(x => Z.olvidar(x.kind, x.file));
        showToast('Beat enviado a revisión. Aparecerá en la tienda cuando el administrador lo apruebe.');
        resetUploadForm();
        loadTracks(); loadPerfil();
      } else if (res.status === 401) {
        showToast('Tu sesión expiró. Vuelve a entrar: los archivos ya subidos no se pierden.', true);
        showLogin();
      } else {
        showToast(d.error || 'Error al guardar el beat (código ' + res.status + ').', true);
      }
    } catch (err) {
      if (err && err.status === -1) showToast('Subida pausada. Si eliges los mismos archivos y pulsas el botón, sigue donde quedó.');
      else if (err && err.status === 401) { showToast(err.message, true); showLogin(); }
      else showToast((err && err.message) || 'No se pudo subir. Intenta de nuevo.', true);
    } finally {
      subiendo = false;
      controlSubida = null;
      uploadBtn.disabled = false;
      $('upload-progress-wrap').style.display = 'none';
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

  // ---------- Mis beats ----------
  const STATUS_LABELS = {
    pending: { text: 'En revisión', className: 'pending' },
    approved: { text: 'En la tienda', className: 'approved' },
    rejected: { text: 'Rechazado', className: 'rejected' },
  };

  async function loadTracks() {
    const [res, hres] = await Promise.all([fetch('/api/producer/tracks'), fetch('/api/producer/hots')]);
    if (!res.ok) return;
    const { tracks } = await res.json();
    hotsInfo = hres.ok ? await hres.json() : null;
    const list = $('track-list');
    list.innerHTML = '';
    $('beats-count').textContent = tracks.length ? tracks.length + ' beat' + (tracks.length > 1 ? 's' : '') : '';
    if (!tracks.length) {
      list.innerHTML = '<div class="empty-hint">Todavía no has subido ningún beat. Ve a «Subir beat».</div>';
      return;
    }
    tracks.forEach((t) => {
      const item = document.createElement('div');
      item.className = 'track-item';
      const statusInfo = t.sold
        ? { text: t.is_exclusive ? 'Vendido (Exclusiva)' : 'Vendido (Ilimitada)', className: 'sold' }
        : (STATUS_LABELS[t.approval_status] || STATUS_LABELS.pending);
      const archivos = t.archivos || {};
      const entregables = t.is_playlist ? '' : '<div class="m files-line">Archivos: MP3' + (archivos.wav ? ' · WAV' : '') + (archivos.stems ? ' · STEMS' : '') + (t.ventas ? ' · ' + t.ventas + ' venta' + (t.ventas > 1 ? 's' : '') : '') + '</div>';
      const puedeHot = hotsInfo && hotsInfo.precioSemanaCup > 0 && !t.sold && !t.is_playlist && t.approval_status === 'approved';
      const hotHasta = hotsInfo && hotsInfo.activos[t.id];
      const hotRevision = hotsInfo && hotsInfo.enRevision.includes(t.id);
      const hotLinea = hotHasta ? '<div class="m hot-line"><span aria-hidden="true">🔥</span> En Hots hasta el ' + ZBHistorial.fechaHora(hotHasta) + '</div>'
        : hotRevision ? '<div class="m hot-line pending"><span aria-hidden="true">🔥</span> Hot en revisión: sale en la portada cuando el administrador apruebe el pago</div>' : '';
      item.innerHTML =
        (t.cover_filename ? '<img src="/api/cover/' + t.id + '?s=160" alt="" loading="lazy">' : '<div class="cover-empty"></div>') +
        '<div class="info">' +
          '<div class="t">' + escapeHtml(t.title) + (t.is_playlist ? ' <span class="mini-tag">Playlist</span>' : '') + '</div>' +
          '<div class="m">' + escapeHtml(t.genre || 'Sin género') + (t.price_label ? ' · ' + escapeHtml(t.price_label) : '') + ' · ' + (t.plays || 0) + ' repr. · ' + (t.likes || 0) + ' me gusta</div>' +
          entregables + hotLinea +
          (t.approval_status === 'rejected' && t.rejection_reason ? '<div class="m reject">Motivo: ' + escapeHtml(t.rejection_reason) + '. Corrígelo con «Editar» y vuelve a revisión.</div>' : '') +
        '</div>' +
        '<div class="track-actions">' +
          '<span class="status-badge ' + statusInfo.className + '">' + statusInfo.text + '</span>' +
          (puedeHot && !hotRevision ? '<button type="button" class="btn-hot-track">' + (hotHasta ? 'Extender Hot' : '<span aria-hidden="true">🔥</span> Poner en Hots') + '</button>' : '') +
          (!t.sold ? '<button type="button" class="btn-edit-track">Editar</button>' : '') +
          (!t.sold ? '<button type="button" class="btn-delete-track">Eliminar</button>' : '') +
        '</div>';
      const del = item.querySelector('.btn-delete-track');
      if (del) del.addEventListener('click', () => deleteTrack(t.id, t.title));
      const hb = item.querySelector('.btn-hot-track');
      if (hb) hb.addEventListener('click', () => abrirModalHot(t));
      const ed = item.querySelector('.btn-edit-track');
      if (ed) ed.addEventListener('click', () => abrirEditor(t));
      list.appendChild(item);
    });
  }

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
      ? 'Este beat fue rechazado. Al guardar los cambios vuelve a revisión.'
      : 'Los cambios se ven en la tienda enseguida.';
    const lic = (perfil && perfil.licenciasPermitidas) || ['basic'];
    const actuales = {};
    (t.licenses || []).forEach(l => { actuales[l.license_type] = l.price_cup; });
    const nombres = { basic: 'Básica (MP3)', premium: 'Premium (MP3 + WAV)', unlimited: 'Ilimitada (MP3 + WAV + STEMS)', exclusive: 'Exclusiva (única venta)' };
    const esExclusivo = Boolean(t.is_exclusive);
    const tipos = esExclusivo ? ['exclusive'] : ['basic', 'premium', 'unlimited'];
    $('edit-prices').innerHTML = t.is_playlist ? '' :
      '<p class="panel-hint compact">Precios en CUP. Deja vacío lo que no quieras vender.</p>' +
      tipos.filter(k => lic.includes(k) || actuales[k]).map(k =>
        '<div class="field"><label for="edit-p-' + k + '">' + nombres[k] + '</label>' +
        '<input type="text" inputmode="decimal" id="edit-p-' + k + '" data-lic="' + k + '" value="' + (actuales[k] || '') + '"' + (lic.includes(k) ? '' : ' disabled') + '></div>'
      ).join('');
    const a = t.archivos || {};
    $('edit-files-note').textContent = t.is_playlist ? '' :
      'Este beat tiene: MP3' + (a.wav ? ', WAV' : '') + (a.stems ? ', STEMS' : '') + '. ' +
      (!a.wav ? 'Sin WAV no puedes poner precio a Premium, Ilimitada ni Exclusiva. ' : (!a.stems ? 'Sin STEMS no puedes poner precio a Ilimitada ni Exclusiva. ' : '')) +
      'Para cambiar los archivos, elimina el beat y súbelo de nuevo.';
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
    if (!confirm(`¿Eliminar "${title}"? Se borra de la tienda y de la app. No se puede deshacer.`)) return;
    const res = await fetch(`/api/producer/tracks/${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Beat eliminado.'); loadTracks(); loadPerfil(); }
    else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'No se pudo eliminar.', true);
    }
  }

  // ---------- Ventas ----------
  const LICENSE_LABELS = { basic: 'Básica', premium: 'Premium', unlimited: 'Ilimitada', exclusive: 'Exclusiva' };
  async function loadEarnings() {
    const res = await fetch('/api/producer/earnings');
    if (!res.ok) return;
    const { orders, summary } = await res.json();
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
    const btn = $('withdraw-btn');
    btn.disabled = Boolean(retiros.pendiente) || !bills.length;
    btn.textContent = retiros.pendiente ? 'Retiro en curso' : 'Retirar dinero';

    const cur = $('w-current');
    const notice = $('withdraw-notice');
    clearInterval(countdownTimer);
    if (retiros.pendiente) {
      const w = retiros.pendiente;
      const pinta = () => {
        const html = avisoRetiroHtml(w);
        cur.innerHTML = html;
        notice.innerHTML = html;
      };
      pinta();
      notice.style.display = 'block';
      countdownTimer = setInterval(pinta, 30000);
    } else {
      cur.innerHTML = '';
      const ultimo = retiros.historial.find(w => w.status !== 'pending');
      if (ultimo && ultimo.status === 'paid' && Date.now() - parseFecha(ultimo.resolved_at).getTime() < 3 * 86400000) {
        notice.innerHTML = '<div class="w-card paid"><strong>Te pagamos ' + montoRetiro(ultimo) + '.</strong> Revisa tu cuenta.' + (ultimo.note ? ' Nota: ' + escapeHtml(ultimo.note) : '') + '</div>';
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

  function avisoRetiroHtml(w) {
    const due = parseFecha(w.due_at).getTime();
    const falta = due - Date.now();
    let tiempo;
    if (falta <= 0) tiempo = 'El plazo ya se cumplió: el administrador debe pagarte hoy.';
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
  $('withdraw-btn').addEventListener('click', () => {
    if (!retiros) return;
    const bills = retiros.billeteras || [];
    if (!bills.some(b => b.opciones.length)) {
      showToast('Primero agrega una cuenta de cobro en la pestaña Perfil (en la moneda de tu saldo).', true);
      abrirPestana('perfil');
      return;
    }
    const wsel = $('withdraw-wallet');
    wsel.innerHTML = bills.map(b => '<option value="' + escapeHtml(b.code) + '">' + montoUnidades(b.unidades, b.code, b.label) + '</option>').join('');
    const conCuenta = bills.find(b => b.opciones.length);
    if (conCuenta) wsel.value = conCuenta.code;
    ponerMontoTodo();
    $('withdraw-foot').textContent = 'Te pagamos en ' + retiros.plazo + '. Al confirmar se abre WhatsApp para avisar al administrador.';
    wModal.classList.add('active');
  });
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
    $('withdraw-amount-hint').textContent = b ? 'Tienes ' + fmt(b.unidades, decimalesDe(b.code)) + ' ' + b.label + '. Puedes sacar una parte y dejar el resto.' : '';
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
      showToast('Retiro solicitado. Avísale al administrador por WhatsApp.');
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
  let movMostrar = 20;
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
      list.innerHTML = '<div class="empty-hint">' + (movFiltro ? 'No hay movimientos de este tipo.' : 'Todavía no tienes movimientos. Aquí verás tus ventas, bonos, planes y retiros.') + '</div>';
      $('mov-more').style.display = 'none';
      return;
    }
    list.innerHTML = filtrados.slice(0, movMostrar).map(m =>
      '<div class="earning-item mov-item mov-' + m.tipo + '">' +
        '<div class="mov-icon" aria-hidden="true">' + (MOV_ICONOS[m.tipo] || '•') + '</div>' +
        '<div class="info"><div class="t">' + escapeHtml(m.titulo) + '</div>' +
        '<div class="m"><span class="mov-when">' + ZBHistorial.fechaHora(m.fecha) + '</span>' + (m.detalle ? ' · ' + escapeHtml(m.detalle) : '') + '</div></div>' +
        '<div class="amount">' + montoMovimiento(m) +
          (m.estado ? '<span class="paid-tag ' + (/pagado|aprobado/.test(m.estado) ? 'is-paid' : '') + '">' + escapeHtml(m.estado) + '</span>' : '') +
        '</div>' +
        (m.borrable ? '<button type="button" class="hist-del" data-clave="' + escapeHtml(m.clave) + '" aria-label="Borrar del historial" title="Borrar del historial">×</button>' : '') +
        '</div>'
    ).join('');
    $('mov-more').style.display = filtrados.length > movMostrar ? '' : 'none';
  }
  $('mov-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.mov-chip');
    if (!chip) return;
    document.querySelectorAll('#mov-filters .mov-chip').forEach(c => c.classList.toggle('active', c === chip));
    movFiltro = chip.dataset.tipo;
    movMostrar = 20;
    pintarMovimientos();
  });
  $('mov-more').addEventListener('click', () => { movMostrar += 20; pintarMovimientos(); });

  async function cambiarHistorial(cuerpo) {
    const res = await fetch('/api/producer/historial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(d.error || 'No se pudo cambiar el historial.', true); return null; }
    await loadMovimientos();
    return d;
  }
  $('mov-list').addEventListener('click', async (e) => {
    const b = e.target.closest('.hist-del');
    if (!b) return;
    b.disabled = true;
    const d = await cambiarHistorial({ accion: 'ocultar', claves: [b.dataset.clave] });
    if (d) showToast('Se borró del historial. Tu saldo no cambia.');
    else b.disabled = false;
  });
  $('mov-clear').addEventListener('click', async () => {
    const claves = movimientos.filter(m => (!movFiltro || m.tipo === movFiltro) && m.borrable).map(m => m.clave);
    if (!claves.length) return;
    const que = movFiltro ? 'los movimientos de tipo «' + MOV_TIPOS[movFiltro] + '»' : 'todo tu historial';
    if (!confirm('¿Borrar ' + que + ' (' + claves.length + ')?\n\nSolo se quitan de esta lista: tu saldo no cambia. Lo que está en curso no se borra. Puedes restaurarlos después.')) return;
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
    showToast('Historial descargado (se abre con Excel).');
  });

  // ---------- Estadísticas ----------
  async function loadStats() {
    const res = await fetch('/api/producer/stats');
    if (!res.ok) return;
    const st = await res.json();
    const r = st.referidos;
    const pct = Math.min(100, Math.round(((r.aprobados % r.cadaCuantos) / r.cadaCuantos) * 100));
    const progreso =
      '<div class="ref-stats">' +
        '<div><strong>' + r.aprobados + '</strong><span>aprobados</span></div>' +
        '<div><strong>' + r.pendientes + '</strong><span>esperando aprobación</span></div>' +
        '<div><strong>' + formatCup(r.ganadoCup) + '</strong><span>ganado en bonos</span></div>' +
      '</div>' +
      '<div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      '<p class="panel-hint compact">Cada ' + r.cadaCuantos + ' referidos aprobados ganas ' + formatCup(r.bonoCup) + '. Te faltan ' + r.faltanParaBono + '.</p>';
    $('ref-progress').innerHTML = progreso;
    $('ref-hint').textContent = 'Comparte tu enlace. Cada ' + r.cadaCuantos + ' productores que el administrador apruebe, ganas ' + formatCup(r.bonoCup) + ' (se suma a tu saldo).';
    $('stats-referidos').innerHTML = progreso + (r.lista.length
      ? '<div class="mini-list">' + r.lista.map(x => '<div class="mini-row"><span>' + escapeHtml(x.name) + '</span><em class="' + (x.approved ? 'ok' : '') + '">' + (x.approved ? 'aprobado' : 'pendiente') + '</em></div>').join('') + '</div>'
      : '<div class="empty-hint">Todavía nadie se registró con tu enlace.</div>');

    const bonoPanel = $('stats-bono-panel');
    if (st.bonoLikes) {
      bonoPanel.style.display = '';
      const b = st.bonoLikes;
      $('stats-bono').innerHTML = '<p class="panel-hint compact">Cada ' + fmt(b.cadaCuantos) + ' me gusta en una canción de tu Playlist ganas ' + formatCup(b.bonoCup) + '. Ganado hasta ahora: <strong>' + formatCup(b.ganadoCup) + '</strong>.</p>' +
        (b.pistas.length ? b.pistas.map(t => {
          const resto = (t.likes || 0) % b.cadaCuantos;
          return '<div class="stat-track"><div class="st-name">' + escapeHtml(t.title) + '</div><div class="bar"><div class="bar-fill" style="width:' + Math.round(resto / b.cadaCuantos * 100) + '%"></div></div><div class="st-num">' + fmt(t.likes) + ' me gusta · faltan ' + fmt(b.cadaCuantos - resto) + '</div></div>';
        }).join('') : '<div class="empty-hint">Sube canciones a la Playlist para empezar a ganar.</div>');
    } else {
      bonoPanel.style.display = 'none';
    }

    const beats = $('stats-beats');
    if (!st.statsPermitidas) {
      beats.innerHTML = '<div class="locked-box">Las estadísticas de tus beats (reproducciones, me gusta, ventas y ganancias por beat) son de los planes <strong>Pro</strong> y <strong>Studio</strong>. Con Free solo ves tus referidos.</div>';
      return;
    }
    const tot = st.totales;
    beats.innerHTML =
      '<div class="ref-stats four">' +
        '<div><strong>' + fmt(tot.reproducciones) + '</strong><span>reproducciones</span></div>' +
        '<div><strong>' + fmt(tot.likes) + '</strong><span>me gusta</span></div>' +
        '<div><strong>' + fmt(tot.ventas) + '</strong><span>ventas</span></div>' +
        '<div><strong>' + formatCup(tot.ganado) + '</strong><span>ganado</span></div>' +
      '</div>' +
      (st.pistas.length ? '<div class="stats-table-wrap" tabindex="0" role="region" aria-label="Tabla de tus beats (se desliza a los lados)"><table class="stats-table"><thead><tr><th>Beat</th><th>Repr.</th><th>Me gusta</th><th>Ventas</th><th>Ganado</th></tr></thead><tbody>' +
        st.pistas.map(t => '<tr><td>' + escapeHtml(t.title) + '</td><td>' + fmt(t.plays) + '</td><td>' + fmt(t.likes) + '</td><td>' + fmt(t.ventas) + '</td><td>' + fmt(t.ganado, 0) + '</td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty-hint">Todavía no hay datos.</div>');
  }

  $('ref-copy').addEventListener('click', async () => {
    const v = $('ref-link').value;
    try { await navigator.clipboard.writeText(v); showToast('Enlace copiado.'); }
    catch { $('ref-link').select(); showToast('Mantén pulsado el enlace para copiarlo.'); }
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

  function actualizarModalPlan() {
    pintarPagoConSaldo();
    const total = planModalState.price * planModalState.months;
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
    if (!pl.priceCup) { showToast('El administrador todavía no puso la tasa del USD para calcular el precio.', true); return; }
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
    document.querySelectorAll('.month-opt').forEach(b => b.classList.toggle('active', b.dataset.m === '1'));
    $('plan-receipt-input').value = '';
    $('plan-receipt-label').textContent = 'Toca para subir la captura de la transferencia';
    $('plan-receipt-drop').classList.remove('has-file');
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
  wireFileDrop($('plan-receipt-drop'), $('plan-receipt-input'), $('plan-receipt-label'), 'Toca para subir la captura de la transferencia');

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
        showToast('Comprobante enviado. Te avisamos aquí cuando el administrador active tu plan.');
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
    if (!hotsInfo || !hotsInfo.precioSemanaCup) { showToast('Los Hots todavía no tienen precio. Avísale al administrador.', true); return; }
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
      b.textContent = semanasTxt(Number(b.dataset.w)) + ' · ' + formatCup(hotsInfo.precioSemanaCup * Number(b.dataset.w));
    });
    $('hot-receipt-input').value = '';
    $('hot-receipt-label').textContent = 'Toca para subir la captura de la transferencia';
    $('hot-receipt-drop').classList.remove('has-file');
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
  wireFileDrop($('hot-receipt-drop'), $('hot-receipt-input'), $('hot-receipt-label'), 'Toca para subir la captura de la transferencia');

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
        showToast('Comprobante enviado. Tu beat sale en la portada cuando el administrador apruebe el pago.');
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
  $('add-social').addEventListener('click', () => addSocialRow());
  $('add-account').addEventListener('click', () => addAccountRow());

  $('save-profile').addEventListener('click', async () => {
    const socialLinks = Array.from(document.querySelectorAll('#social-list .row-pair')).map(r => ({
      label: r.querySelector('.s-label').value.trim(),
      url: r.querySelector('.s-url').value.trim(),
    })).filter(l => l.url);
    const accounts = Array.from(document.querySelectorAll('#accounts-list .row-triple')).map(r => ({
      currency: r.querySelector('.a-currency').value,
      bank: r.querySelector('.a-bank').value.trim(),
      number: r.querySelector('.a-number').value.trim(),
    })).filter(a => a.bank || a.number);
    const res = await fetch('/api/producer/profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: $('profile-name').value,
        bio: $('profile-bio').value,
        contactPhone: $('profile-phone').value,
        socialLinks: perfil && perfil.puedeRedes ? socialLinks : (perfil ? perfil.socialLinks : []),
        accounts,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.rechazadas && d.rechazadas.length) showToast('Perfil guardado, pero no se aceptaron: ' + d.rechazadas.join(', ') + '.', true);
      else showToast('Perfil guardado.');
      loadPerfil(); loadWithdrawals();
    } else if (res.status === 401) {
      showLogin();
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'No se pudo guardar el perfil.', true);
    }
  });

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

  checkAuth();
})();
