(() => {
  window.ZB_PANEL = 'admin';
  const loginScreen = document.getElementById('login-screen');
  const adminShell = document.getElementById('admin-shell');
  const passwordInput = document.getElementById('password-input');
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');

  const uploadForm = document.getElementById('upload-form');
  const uploadBtn = document.getElementById('upload-btn');
  const uploadProgressWrap = document.getElementById('upload-progress-wrap');
  const uploadProgressFill = document.getElementById('upload-progress-fill');
  const uploadProgressLabel = document.getElementById('upload-progress-label');
  const titleInput = document.getElementById('title-input');
  const genreInput = document.getElementById('genre-input');
  const descriptionInput = document.getElementById('description-input');
  const isPlaylistInput = document.getElementById('is-playlist-input');
  const artistCreditInput = document.getElementById('artist-credit-input');
  const playlistOnlyFields = document.getElementById('playlist-only-fields');
  const catalogOnlyFields = document.getElementById('catalog-only-fields');
  const isExclusiveInput = document.getElementById('is-exclusive-input');
  const priceBasicInput = document.getElementById('price-basic-input');
  const pricePremiumInput = document.getElementById('price-premium-input');
  const priceUnlimitedInput = document.getElementById('price-unlimited-input');
  const priceExclusiveInput = document.getElementById('price-exclusive-input');
  const licenseModeFields = document.getElementById('license-mode-fields');
  const exclusiveModeFields = document.getElementById('exclusive-mode-fields');
  const audioInput = document.getElementById('audio-input');
  const coverInput = document.getElementById('cover-input');
  const audioDrop = document.getElementById('audio-drop');
  const coverDrop = document.getElementById('cover-drop');

  const trackList = document.getElementById('track-list');

  const ordersList = document.getElementById('orders-list');
  const ordersCount = document.getElementById('orders-count');
  const receiptModalOverlay = document.getElementById('receipt-modal-overlay');
  const receiptModalImg = document.getElementById('receipt-modal-img');
  const receiptModalClose = document.getElementById('receipt-modal-close');

  const paymentForm = document.getElementById('payment-form');
  const contactPhoneInput = document.getElementById('contact-phone-input');
  const accountsList = document.getElementById('accounts-list');
  const addAccountBtn = document.getElementById('add-account-btn');

  const watermarkVoiceInput = document.getElementById('watermark-voice-input');
  const watermarkVoiceDrop = document.getElementById('watermark-voice-drop');
  const watermarkVoiceDropLabel = document.getElementById('watermark-voice-drop-label');
  const watermarkIntervalInput = document.getElementById('watermark-interval-input');
  const watermarkVolumeInput = document.getElementById('watermark-volume-input');
  const watermarkSaveBtn = document.getElementById('watermark-save-btn');
  const watermarkPreviewBtn = document.getElementById('watermark-preview-btn');
  const watermarkRemoveBtn = document.getElementById('watermark-remove-btn');
  const watermarkPreviewAudio = document.getElementById('watermark-preview-audio');
  const watermarkStatusBadge = document.getElementById('watermark-status-badge');

  const profileForm = document.getElementById('profile-form');
  const artistNameInput = document.getElementById('artist-name-input');
  const artistBioInput = document.getElementById('artist-bio-input');
  const avatarInput = document.getElementById('avatar-input');
  const avatarDrop = document.getElementById('avatar-drop');

  const socialLinksList = document.getElementById('social-links-list');
  const addSocialLinkBtn = document.getElementById('add-social-link-btn');
  const socialLinksSaveBtn = document.getElementById('social-links-save-btn');

  const exchangeRatesForm = document.getElementById('exchange-rates-form');
  const exchangeRatesList = document.getElementById('exchange-rates-list');

  const siteConfigForm = document.getElementById('site-config-form');
  const promoActiveInput = document.getElementById('promo-active-input');
  const promoTextInput = document.getElementById('promo-text-input');
  const scheduleTextInput = document.getElementById('schedule-text-input');

  const toast = document.getElementById('toast');
  let toastTimer = null;

  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = 'toast'; }, isError ? 5500 : 3500);
  }

  // Si la sesión vence (o se cerró desde otro lado), cualquier llamada 401 vuelve al login
  // en vez de dejar el panel mudo.
  const fetchOriginal = window.fetch.bind(window);
  let avisoSesion = false;
  window.fetch = async (...args) => {
    const res = await fetchOriginal(...args);
    const url = String(args[0] && args[0].url ? args[0].url : args[0]);
    if (res.status === 401 && url.includes('/api/admin/') && !url.includes('/api/admin/login') && !url.includes('/api/admin/check')) {
      if (!avisoSesion) {
        avisoSesion = true;
        showToast('Tu sesión expiró. Vuelve a entrar.', true);
        setTimeout(() => { avisoSesion = false; }, 4000);
      }
      showLogin();
    }
    return res;
  };

  const toggleAdminPass = document.getElementById('toggle-admin-password');
  toggleAdminPass.addEventListener('click', () => {
    const ver = passwordInput.type === 'password';
    passwordInput.type = ver ? 'text' : 'password';
    toggleAdminPass.textContent = ver ? 'Ocultar' : 'Mostrar';
  });

  function setUploadProgress(pct, label) {
    if (pct !== null && pct !== undefined) uploadProgressFill.style.width = `${pct}%`;
    uploadProgressLabel.textContent = label;
  }

  // ---------- Navegación: secciones y subpestañas ----------
  // Seis secciones; cada una muestra una sola parte a la vez, para no tener que bajar.
  const CATEGORIAS = ['ventas', 'productores', 'pagos', 'musica', 'tienda', 'ajustes'];
  // nombres de antes y atajos → sección/subpestaña
  const ALIAS_CAT = {
    packs: 'musica/packs', coincidencias: 'musica/coincidencias', originalidad: 'ajustes/originalidad',
    retiros: 'pagos/retiros', planes: 'pagos/planes', hots: 'pagos/hots', reglas: 'pagos/reglas',
  };
  const menuMas = document.getElementById('menu-mas');
  const navMas = document.getElementById('nav-mas');
  function cerrarMas() { menuMas.hidden = true; navMas.setAttribute('aria-expanded', 'false'); }
  function abrirCategoria(destino) {
    const ruta = String(ALIAS_CAT[destino] || destino || 'ventas').split('/');
    const cat = CATEGORIAS.includes(ruta[0]) ? ruta[0] : 'ventas';
    const sub = ruta[1] || '';
    const antes = document.querySelector('.cat-page.active');
    // crossfade entre secciones
    ZBUI.transicion(() => {
      document.querySelectorAll('.admin-nav-btn').forEach(b => { const on = b.dataset.cat === cat; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
      navMas.classList.toggle('active', cat === 'tienda' || cat === 'ajustes');
      document.querySelectorAll('.cat-page').forEach(p => p.classList.toggle('active', p.dataset.cat === cat));
      if (sub) ZBUI.irSub(cat, sub, { silencio: true });
    });
    cerrarMas();
    try { sessionStorage.setItem('zb_admin_cat', cat); } catch { /* sin almacenamiento */ }
    if (antes && antes.dataset.cat !== cat) window.scrollTo({ top: 0 });
  }
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.addEventListener('click', () => abrirCategoria(b.dataset.cat)));
  navMas.addEventListener('click', () => {
    const abrir = menuMas.hidden;
    menuMas.hidden = !abrir;
    navMas.setAttribute('aria-expanded', String(abrir));
    if (abrir) { const b = menuMas.querySelector('.admin-nav-btn'); if (b) b.focus({ preventScroll: true }); }
  });
  document.addEventListener('click', (e) => { if (!menuMas.hidden && !menuMas.contains(e.target) && !navMas.contains(e.target)) cerrarMas(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menuMas.hidden) { cerrarMas(); navMas.focus(); } });
  // Cualquier botón con data-ir="seccion/sub" lleva a esa parte del panel
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-ir]');
    if (!b || !adminShell.contains(b)) return;
    e.preventDefault();
    abrirCategoria(b.dataset.ir);
  });

  // Contadores: cada pendiente se suma a su subpestaña y a su sección
  const NAV_MAPA = {
    'ventas:': ['ventas', 'comprobantes'],
    'productores:aprobar': ['productores', 'cuentas'],
    'productores:beats': ['productores', 'revisar'],
    'productores:denuncias': ['productores', 'reclamos', 'reclamos', 'denuncias'],
    'productores:contentid': ['productores', 'reclamos', 'reclamos', 'cid'],
    'productores:planes': ['pagos', 'planes'],
    'productores:hots': ['pagos', 'hots'],
    'productores:retiros': ['pagos', 'retiros'],
    'musica:coincidencias': ['musica', 'coincidencias'],
    'musica:packs': ['musica', 'packs'],
    'ajustes:audd': ['ajustes', 'originalidad'],
  };
  const conteos = {};
  const sumar = (o) => Object.values(o || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  function actualizarNav(cat, key, n) {
    const [c, sub, grupoInterno, subInterna] = NAV_MAPA[cat + ':' + (key || '')] || [cat, ''];
    const clave = c + '/' + sub;
    conteos[clave] = conteos[clave] || {};
    conteos[clave][key || '_'] = Number(n) || 0;
    if (sub) ZBUI.contarSub(c, sub, sumar(conteos[clave]));
    if (grupoInterno) ZBUI.contarSub(grupoInterno, subInterna, Number(n) || 0);
    const totalDe = (categoria) => Object.keys(conteos).filter(k => k.startsWith(categoria + '/')).reduce((t, k) => t + sumar(conteos[k]), 0);
    document.querySelectorAll('.nav-badge[data-for="' + c + '"]').forEach(el => { const t = totalDe(c); el.textContent = t ? String(t) : ''; });
    const mas = totalDe('tienda') + totalDe('ajustes');
    document.getElementById('nav-mas-badge').textContent = mas ? String(mas) : '';
  }

  async function loadConfianzaAdmin() {
    const r = await fetch('/api/admin/confianza');
    if (!r.ok) return;
    const d = await r.json();
    document.getElementById('conf-titular').value = d.titular || '';
    document.getElementById('conf-figura').value = d.figura || '';
    document.getElementById('conf-horas').value = d.horas || 24;
  }
  document.getElementById('conf-save').addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    const r = await fetch('/api/admin/confianza', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titular: document.getElementById('conf-titular').value, figura: document.getElementById('conf-figura').value, horas: document.getElementById('conf-horas').value }),
    });
    const d = await r.json().catch(() => ({}));
    ev.target.disabled = false;
    showToast(r.ok ? 'Datos guardados. Ya se ven en la tienda.' : (d.error || 'No se pudo guardar.'), !r.ok);
  });

  let packsUI = null;
  function showApp() {
    loginScreen.style.display = 'none';
    adminShell.classList.add('on');
    let cat = 'ventas';
    try { cat = sessionStorage.getItem('zb_admin_cat') || 'ventas'; } catch { /* nada */ }
    abrirCategoria(cat);
    loadTracks();
    loadProfile();
    loadPaymentInfo();
    loadOrders();
    loadWatermarkConfig();
    loadSocialLinks();
    loadExchangeRates();
    loadSiteConfig();
    loadProducers();
    loadPendingTracks();
    loadCommission();
    loadHistory();
    loadPlanRequests();
    loadHotsAdmin();
    loadDenuncias();
    loadReclamosCid();
    loadResenasAdmin();
    loadConfianzaAdmin();
    loadOrigEstado();
    loadCoincidencias();
    if (!packsUI) {
      packsUI = window.ZBPacks.montar({
        modo: 'admin', form: document.getElementById('packs-form'), lista: document.getElementById('packs-list'),
        cuenta: document.getElementById('packs-count'), aviso: (msg, err) => showToast(msg, err), sesionVencida: showLogin,
        avisoAlmacen: document.getElementById('packs-almacen-aviso'),
        pager: document.getElementById('packs-pager'), porPagina: () => ZBUI.filasPorPagina(4, 6), pasos: true,
        alEnviar: () => abrirCategoria('musica/packs'),
        alCargar: (d) => actualizarNav('musica', 'packs', d.pendientes || 0),
      });
    } else packsUI.cargar();
    loadPayouts();
    loadSummary();
  }

  function showLogin() {
    loginScreen.style.display = 'flex';
    adminShell.classList.remove('on');
  }

  async function checkAuth() {
    const res = await fetch('/api/admin/check');
    const { authenticated } = await res.json();
    if (authenticated) showApp(); else showLogin();
  }

  loginBtn.addEventListener('click', async () => {
    loginError.classList.remove('show');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value }),
    });
    if (res.ok) {
      passwordInput.value = '';
      showApp();
    } else {
      const d = await res.json().catch(() => ({}));
      loginError.textContent = d.error || 'Contraseña incorrecta.';
      void loginError.offsetWidth;
      loginError.classList.add('show');
    }
  });

  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    showLogin();
  });

  // el label ya abre el input solo con tocarlo, no hace falta click() manual
  const tamanoTxt = (b) => (window.ZBSubidas ? window.ZBSubidas.tamano(b) : Math.round(b / 1024 / 1024) + ' MB');
  function wireFileDrop(dropEl, inputEl, labelEl, defaultLabel) {
    inputEl.addEventListener('change', () => {
      if (inputEl.files.length > 0) {
        labelEl.textContent = inputEl.files[0].name + ' · ' + tamanoTxt(inputEl.files[0].size);
        dropEl.classList.add('has-file');
      } else {
        labelEl.textContent = defaultLabel;
        dropEl.classList.remove('has-file');
      }
    });
  }
  const AUDIO_LABEL = 'MP3, WAV, M4A, OGG o FLAC · máx 250 MB';
  const COVER_LABEL = 'Cuadrada 3000x3000 px · JPG, PNG o WEBP · máx 8 MB';
  const WAV_LABEL = 'WAV en alta calidad · máx 1 GB';
  const STEMS_LABEL = 'ZIP (o RAR/7Z) con las pistas separadas · máx 4 GB';
  wireFileDrop(audioDrop, audioInput, document.getElementById('audio-drop-label'), AUDIO_LABEL);
  wireFileDrop(coverDrop, coverInput, document.getElementById('cover-drop-label'), COVER_LABEL);
  const adminWavInput = document.getElementById('admin-wav-input');
  const adminStemsInput = document.getElementById('admin-stems-input');
  wireFileDrop(document.getElementById('admin-wav-drop'), adminWavInput, document.getElementById('admin-wav-label'), WAV_LABEL);
  wireFileDrop(document.getElementById('admin-stems-drop'), adminStemsInput, document.getElementById('admin-stems-label'), STEMS_LABEL);

  // Vista previa de la portada y aviso si no es cuadrada
  coverInput.addEventListener('change', async () => {
    const prev = document.getElementById('cover-preview');
    const aviso = document.getElementById('cover-note');
    prev.style.display = 'none';
    coverDrop.classList.remove('con-portada');
    aviso.textContent = '';
    const f = coverInput.files[0];
    if (!f || !window.ZBSubidas) return;
    const m = await window.ZBSubidas.medirImagen(f);
    if (!m) { aviso.textContent = 'No se pudo leer la imagen. Prueba con otro JPG o PNG.'; return; }
    if (prev.src && prev.src.startsWith('blob:')) URL.revokeObjectURL(prev.src);
    prev.src = m.url;
    prev.style.display = 'block';
    coverDrop.classList.add('con-portada');
    if (Math.abs(m.w - m.h) > Math.max(m.w, m.h) * 0.02) aviso.textContent = 'La portada mide ' + m.w + 'x' + m.h + ' px: no es cuadrada y se mostrará recortada.';
    else if (m.w < 1000) aviso.textContent = 'La portada mide ' + m.w + 'x' + m.h + ' px: se verá borrosa. Lo ideal es 3000x3000 px.';
  });

  // Marca «obligatorio» en WAV/STEMS según las licencias con precio
  const precioDe = (v) => (window.ZBSubidas ? window.ZBSubidas.precio(v) : parseFloat(String(v || '').replace(',', '.')) || 0);
  const numPos = (v) => precioDe(v) > 0;
  function actualizarArchivosAdmin() {
    const pl = isPlaylistInput.checked;
    const ex = isExclusiveInput.checked;
    const audioEsWav = audioInput.files.length > 0 && /\.wav$/i.test(audioInput.files[0].name);
    const wav = !pl && !audioEsWav && (ex ? numPos(priceExclusiveInput.value) : (numPos(pricePremiumInput.value) || numPos(priceUnlimitedInput.value)));
    const stems = !pl && (ex ? numPos(priceExclusiveInput.value) : numPos(priceUnlimitedInput.value));
    document.getElementById('admin-wav-field').style.display = pl ? 'none' : '';
    document.getElementById('admin-stems-field').style.display = pl ? 'none' : '';
    document.getElementById('admin-wav-req').style.display = wav ? '' : 'none';
    document.getElementById('admin-wav-note').textContent = audioEsWav && !pl ? 'El audio principal ya es WAV y se usará para la entrega.' : '';
    document.getElementById('admin-stems-req').style.display = stems ? '' : 'none';
    document.getElementById('admin-wav-drop').classList.toggle('required', wav && !adminWavInput.files.length);
    document.getElementById('admin-stems-drop').classList.toggle('required', stems && !adminStemsInput.files.length);
  }
  [pricePremiumInput, priceUnlimitedInput, priceExclusiveInput].forEach(el => el.addEventListener('input', actualizarArchivosAdmin));
  [adminWavInput, adminStemsInput, audioInput].forEach(el => el.addEventListener('change', actualizarArchivosAdmin));
  wireFileDrop(avatarDrop, avatarInput, document.getElementById('avatar-drop-label'), 'JPG, PNG o WEBP · máx 8MB');

  isPlaylistInput.addEventListener('change', () => {
    const isPlaylist = isPlaylistInput.checked;
    playlistOnlyFields.style.display = isPlaylist ? 'block' : 'none';
    catalogOnlyFields.style.display = isPlaylist ? 'none' : 'block';
    if (isPlaylist) {
      isExclusiveInput.checked = false;
      licenseModeFields.style.display = 'block';
      exclusiveModeFields.style.display = 'none';
      priceBasicInput.value = '';
      pricePremiumInput.value = '';
      priceUnlimitedInput.value = '';
      priceExclusiveInput.value = '';
    }
    actualizarArchivosAdmin();
  });

  isExclusiveInput.addEventListener('change', () => {
    const exclusive = isExclusiveInput.checked;
    licenseModeFields.style.display = exclusive ? 'none' : 'block';
    exclusiveModeFields.style.display = exclusive ? 'block' : 'none';
    if (exclusive) {
      priceBasicInput.value = '';
      pricePremiumInput.value = '';
      priceUnlimitedInput.value = '';
    } else {
      priceExclusiveInput.value = '';
    }
    actualizarArchivosAdmin();
  });

  // Subida en trozos (se retoma sola si se corta la conexión) y después se crea la pista.
  let subiendo = false;
  let controlSubida = null;
  const extDe = (f) => (String(f.name || '').toLowerCase().match(/\.[a-z0-9]+$/) || [''])[0];

  function resetUploadForm() {
    uploadForm.reset();
    isExclusiveInput.checked = false;
    isPlaylistInput.checked = false;
    playlistOnlyFields.style.display = 'none';
    catalogOnlyFields.style.display = 'block';
    licenseModeFields.style.display = 'block';
    exclusiveModeFields.style.display = 'none';
    document.getElementById('audio-drop-label').textContent = AUDIO_LABEL;
    document.getElementById('cover-drop-label').textContent = COVER_LABEL;
    document.getElementById('admin-wav-label').textContent = WAV_LABEL;
    document.getElementById('admin-stems-label').textContent = STEMS_LABEL;
    ['admin-wav-drop', 'admin-stems-drop'].forEach(id => document.getElementById(id).classList.remove('has-file'));
    audioDrop.classList.remove('has-file');
    coverDrop.classList.remove('has-file');
    document.getElementById('cover-preview').style.display = 'none';
    coverDrop.classList.remove('con-portada');
    document.getElementById('cover-note').textContent = '';
    actualizarArchivosAdmin();
    pasoMaxA = 1;
    irPasoA(1);
  }

  // ---------- Publicar pista en tres pasos: datos → precios → archivos ----------
  let pasoA = 1;
  let pasoMaxA = 1;
  const siguienteA = (n) => (n === 1 && isPlaylistInput.checked ? 3 : n + 1);
  const anteriorA = (n) => (n === 3 && isPlaylistInput.checked ? 1 : n - 1);
  function irPasoA(n, enfocar) {
    pasoA = Math.min(3, Math.max(1, n));
    pasoMaxA = Math.max(pasoMaxA, pasoA);
    const pl = isPlaylistInput.checked;
    ZBUI.transicion(() => {
      uploadForm.querySelectorAll('.up-paso').forEach(c => { c.hidden = Number(c.dataset.paso) !== pasoA; });
      document.querySelectorAll('#aup-stepper .stp').forEach(b => {
        const k = Number(b.dataset.paso);
        b.classList.toggle('on', k === pasoA); b.classList.toggle('hecho', k < pasoA);
        b.classList.toggle('salta', k === 2 && pl);
        b.disabled = subiendo || k > pasoMaxA || (k === 2 && pl);
        if (k === pasoA) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      const t2 = document.querySelector('#aup-stepper .stp[data-paso="2"] .stp-t');
      if (t2) t2.textContent = pl ? 'Sin precio' : 'Precios';
      document.getElementById('aup-playlist-nota').hidden = !pl;
      document.getElementById('aup-prev').hidden = pasoA === 1;
      document.getElementById('aup-prev').disabled = subiendo;
      document.getElementById('aup-next').hidden = pasoA === 3;
      uploadBtn.hidden = pasoA !== 3;
    });
    if (enfocar) {
      const caja = uploadForm.querySelector('.up-paso[data-paso="' + pasoA + '"]');
      if (caja) { caja.setAttribute('tabindex', '-1'); setTimeout(() => caja.focus({ preventScroll: true }), 30); }
    }
  }
  function problemaPasoA(n) {
    const pl = isPlaylistInput.checked;
    if (n === 1 && !titleInput.value.trim()) return { msg: 'Ponle título a la pista.', el: titleInput };
    if (n === 2 && !pl) {
      if (isExclusiveInput.checked) { if (!numPos(priceExclusiveInput.value)) return { msg: 'Ponle el precio exclusivo a la pista.', el: priceExclusiveInput }; }
      else if (![priceBasicInput, pricePremiumInput, priceUnlimitedInput].some(el => numPos(el.value))) return { msg: 'Ponle precio a al menos una licencia (Básica, Premium o Ilimitada).', el: priceBasicInput };
    }
    return null;
  }
  function avanzarA() {
    const p = problemaPasoA(pasoA);
    if (p) { showToast(p.msg, true); p.el.focus({ preventScroll: true }); return; }
    irPasoA(siguienteA(pasoA), true);
  }
  document.getElementById('aup-next').addEventListener('click', avanzarA);
  document.getElementById('aup-prev').addEventListener('click', () => { if (!subiendo) irPasoA(anteriorA(pasoA), true); });
  document.getElementById('aup-stepper').addEventListener('click', (e) => {
    const b = e.target.closest('.stp');
    if (!b || b.disabled || subiendo) return;
    const destino = Number(b.dataset.paso);
    for (let k = pasoA; k < destino; k++) { const p = problemaPasoA(k); if (p) { irPasoA(k, true); showToast(p.msg, true); return; } }
    irPasoA(destino, true);
  });
  isPlaylistInput.addEventListener('change', () => irPasoA(pasoA));

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (subiendo) return;
    // Enter en un campo de los primeros pasos = «Siguiente»
    if (pasoA < 3) { avanzarA(); return; }
    const Z = window.ZBSubidas;
    if (!Z) { showToast('Error al iniciar la subida. Recarga la página.', true); return; }
    for (const k of [1, 2]) { const p = problemaPasoA(k); if (p) { irPasoA(k, true); showToast(p.msg, true); return; } }
    const audio = audioInput.files[0];
    const cover = coverInput.files[0];
    if (!audio) { showToast('Selecciona un archivo de audio.', true); return; }
    if (!cover) { showToast('La portada es obligatoria (cuadrada, 3000x3000 px).', true); return; }

    const esPlaylist = isPlaylistInput.checked;
    const isExclusiveMode = isExclusiveInput.checked && !esPlaylist;
    const prices = esPlaylist ? { basic: '', premium: '', unlimited: '', exclusive: '' }
      : isExclusiveMode
        ? { basic: '', premium: '', unlimited: '', exclusive: priceExclusiveInput.value }
        : { basic: priceBasicInput.value, premium: pricePremiumInput.value, unlimited: priceUnlimitedInput.value, exclusive: '' };
    const wav = esPlaylist ? null : adminWavInput.files[0];
    const stems = esPlaylist ? null : adminStemsInput.files[0];

    if (!['.mp3', '.wav', '.m4a', '.ogg', '.flac'].includes(extDe(audio))) { showToast('El audio tiene que ser MP3, WAV, M4A, OGG o FLAC.', true); return; }
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extDe(cover))) { showToast('La portada tiene que ser JPG, PNG o WEBP.', true); return; }
    if (wav && extDe(wav) !== '.wav') { showToast('El archivo WAV tiene que terminar en .wav.', true); return; }
    if (stems && !['.zip', '.rar', '.7z'].includes(extDe(stems))) { showToast('Los STEMS tienen que ir en ZIP, RAR o 7Z.', true); return; }
    for (const [kind, f] of [['audio', audio], ['cover', cover], ['wav', wav], ['stems', stems]]) {
      if (!f) continue;
      const err = Z.validarTamano(kind, f);
      if (err) { showToast(err, true); return; }
    }
    if (!esPlaylist) {
      if (!Object.values(prices).some(numPos)) {
        showToast(isExclusiveMode ? 'Ponle el precio exclusivo a la pista.' : 'Ponle precio a al menos una licencia (Básica, Premium o Ilimitada).', true);
        return;
      }
      const hayWav = Boolean(wav) || extDe(audio) === '.wav';
      if ((numPos(prices.premium) || numPos(prices.unlimited) || numPos(prices.exclusive)) && !hayWav) {
        showToast('Esta licencia requiere el archivo WAV.', true);
        return;
      }
      if ((numPos(prices.unlimited) || numPos(prices.exclusive)) && !stems) {
        showToast('Esta licencia requiere los STEMS.', true);
        return;
      }
    }

    const lista = [
      { kind: 'cover', file: cover, etiqueta: 'la portada' },
      { kind: 'audio', file: audio, etiqueta: 'el audio' },
    ];
    if (wav) lista.push({ kind: 'wav', file: wav, etiqueta: 'el WAV' });
    if (stems) lista.push({ kind: 'stems', file: stems, etiqueta: 'los STEMS' });

    subiendo = true;
    irPasoA(3);
    controlSubida = new AbortController();
    uploadBtn.disabled = true;
    uploadProgressWrap.style.display = 'block';
    document.getElementById('upload-cancel').style.display = '';
    setUploadProgress(0, 'Preparando…');
    try {
      const ids = await Z.subirVarios(lista, {
        senal: controlSubida.signal,
        alAvanzar: (p) => setUploadProgress(p.pct, 'Subiendo ' + p.etiqueta + '… ' + p.pct + '% (' + Z.tamano(p.enviado) + ' de ' + Z.tamano(p.total) + ')'),
        alReintentar: (etiqueta, n) => setUploadProgress(null, 'Se cortó la conexión. Reintentando ' + etiqueta + ' (intento ' + n + ')…'),
      });
      document.getElementById('upload-cancel').style.display = 'none';
      setUploadProgress(100, 'Procesando: creando el preview y el MP3 de entrega…');
      const res = await fetch('/api/admin/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleInput.value, genre: genreInput.value, description: descriptionInput.value,
          isPlaylist: esPlaylist, artistCredit: esPlaylist ? artistCreditInput.value : '',
          priceBasic: prices.basic, pricePremium: prices.premium, priceUnlimited: prices.unlimited, priceExclusive: prices.exclusive,
          audioUploadId: ids.audio, coverUploadId: ids.cover, wavUploadId: ids.wav || '', stemsUploadId: ids.stems || '',
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        lista.forEach(x => Z.olvidar(x.kind, x.file));
        showToast('Pista publicada correctamente.');
        resetUploadForm();
        loadTracks();
      } else if (res.status !== 401) {
        showToast(d.error || 'Error al guardar la pista (código ' + res.status + ').', true);
      }
    } catch (err) {
      if (err && err.status === -1) showToast('Subida en pausa. Puedes reanudarla con los mismos archivos.');
      else if (err && err.status === 401) showLogin();
      else showToast((err && err.message) || 'No se pudo subir. Intenta de nuevo.', true);
    } finally {
      subiendo = false;
      controlSubida = null;
      uploadBtn.disabled = false;
      uploadProgressWrap.style.display = 'none';
      irPasoA(pasoA);
    }
  });
  document.getElementById('upload-cancel').addEventListener('click', () => { if (controlSubida) controlSubida.abort(); });
  window.addEventListener('beforeunload', (e) => {
    if (!subiendo) return;
    e.preventDefault();
    e.returnValue = '';
  });

  let currentAdminListSection = 'catalog';

  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      currentAdminListSection = tab.dataset.listSection;
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t === tab));
      loadTracks();
    });
  });

  async function loadTracks() {
    const res = await fetch(`/api/admin/tracks?type=${currentAdminListSection}`);
    if (!res.ok) return;
    const { tracks } = await res.json();
    renderTrackList(tracks);
  }

  function renderTrackList(tracks) {
    trackList.innerHTML = '';
    if (!tracks.length) {
      const hints = {
        catalog: 'Aún no hay pistas en el catálogo.',
        playlist: 'Aún no hay colaboraciones.',
        vip: 'Aún no hay ventas exclusivas.',
      };
      trackList.innerHTML = `<div class="empty-hint">${hints[currentAdminListSection]}</div>`;
      return;
    }
    tracks.forEach((track) => {
      const item = document.createElement('div');
      item.className = 'track-list-item';
      const coverSrc = track.cover_filename ? `/api/cover/${track.id}` : '';
      const metaExtra = track.artist_credit ? ` · ${escapeHtml(track.artist_credit)}` : '';

      let priceEditHtml = '';
      if (currentAdminListSection === 'catalog' && track.sold) {
        priceEditHtml = `<div class="vip-sold-tag">${track.is_exclusive ? 'Vendida (Exclusiva) · en Beats VIP' : 'Vendida (Ilimitada) · fuera del catálogo'}</div>`;
      } else if (currentAdminListSection === 'catalog') {
        const licMap = {};
        (track.licenses || []).forEach(l => { licMap[l.license_type] = l.price_cup; });
        priceEditHtml = `
          <div class="price-edit">
            <div class="license-price-grid">
              <label>Básica <input type="text" class="lic-price" data-type="basic" placeholder="CUP" value="${licMap.basic || ''}"></label>
              <label>Premium <input type="text" class="lic-price" data-type="premium" placeholder="CUP" value="${licMap.premium || ''}"></label>
              <label>Ilimitada <input type="text" class="lic-price" data-type="unlimited" placeholder="CUP" value="${licMap.unlimited || ''}"></label>
              <label>Exclusiva <input type="text" class="lic-price" data-type="exclusive" placeholder="CUP" value="${licMap.exclusive || ''}"></label>
            </div>
            <button type="button" class="btn-save-price" data-id="${track.id}">Guardar precios</button>
          </div>
        `;
      } else if (currentAdminListSection === 'vip') {
        priceEditHtml = `<div class="vip-sold-tag">Vendida · ${escapeHtml(track.price_label || '')}</div>`;
      }

      const archivos = track.archivos || {};
      const archivosTxt = track.is_playlist ? '' : ' · archivos: MP3' + (archivos.wav ? ' + WAV' : '') + (archivos.stems ? ' + STEMS' : '');
      const estado = track.approval_status && track.approval_status !== 'approved'
        ? ` <span class="tag-pending">${track.approval_status === 'pending' ? 'en revisión' : 'rechazada'}</span>` : '';
      item.innerHTML = `
        ${coverSrc ? `<img src="${coverSrc}?s=160" alt="" loading="lazy">` : `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'/%3E" alt="">`}
        <div class="info">
          <div class="t">${escapeHtml(track.title)}${estado}</div>
          <div class="m">${escapeHtml(track.genre || 'Sin género')}${metaExtra} · ${track.plays} repr. · ${track.likes || 0} me gusta${archivosTxt}</div>
          <div class="m">${track.producer_id ? 'Productor: ' + escapeHtml(track.producer_name || '') : 'Tuya'}</div>
          ${lineaOrigAdmin(track.originalidad)}
        </div>
        ${priceEditHtml}
        <div class="track-row-actions">
          ${priceEditHtml.includes('price-edit') ? '<button type="button" class="btn-secondary btn-precios" aria-expanded="false">Precios</button>' : ''}
          <button type="button" class="btn-secondary btn-edit-info">Editar</button>
          <button type="button" class="btn-delete" data-id="${track.id}">Eliminar</button>
        </div>
      `;
      // los precios se editan en la misma fila, al pulsar «Precios»
      const bPrecios = item.querySelector('.btn-precios');
      if (bPrecios) bPrecios.addEventListener('click', () => {
        const abrir = !item.classList.contains('precios-abiertos');
        item.classList.toggle('precios-abiertos', abrir);
        bPrecios.setAttribute('aria-expanded', String(abrir));
        if (abrir) { const i = item.querySelector('.lic-price'); if (i) i.focus({ preventScroll: true }); }
      });
      item.querySelector('.btn-delete').addEventListener('click', () => deleteTrack(track.id, track.title));
      item.querySelector('.btn-edit-info').addEventListener('click', () => abrirEditorPista(track));

      const saveBtn = item.querySelector('.btn-save-price');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const priceInputs = item.querySelectorAll('.lic-price');
          const prices = {};
          priceInputs.forEach(inp => { prices[inp.dataset.type] = inp.value; });
          const anyPrice = Object.values(prices).some(v => parseFloat(v) > 0);
          if (!anyPrice) {
            showToast('Ponle precio a al menos una licencia.', true);
            return;
          }
          savePrice(track.id, prices);
        });
      }

      trackList.appendChild(item);
    });
  }

  // ---------- Editar título / género / descripción ----------
  const editOverlay = document.getElementById('edit-track-overlay');
  let pistaEditando = null;
  function abrirEditorPista(track) {
    pistaEditando = track;
    document.getElementById('edit-track-heading').textContent = 'Editar «' + track.title + '»';
    document.getElementById('edit-track-title').value = track.title || '';
    document.getElementById('edit-track-genre').value = track.genre || '';
    document.getElementById('edit-track-description').value = track.description || '';
    document.getElementById('edit-track-credit').value = track.artist_credit || '';
    document.getElementById('edit-track-credit-field').style.display = track.is_playlist ? '' : 'none';
    editOverlay.classList.add('active');
  }
  document.getElementById('edit-track-close').addEventListener('click', () => editOverlay.classList.remove('active'));
  editOverlay.addEventListener('click', (e) => { if (e.target === editOverlay) editOverlay.classList.remove('active'); });
  document.getElementById('edit-track-save').addEventListener('click', async () => {
    if (!pistaEditando) return;
    const btn = document.getElementById('edit-track-save');
    btn.disabled = true;
    try {
      const res = await fetch('/api/admin/tracks/' + pistaEditando.id + '/info', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: document.getElementById('edit-track-title').value,
          genre: document.getElementById('edit-track-genre').value,
          description: document.getElementById('edit-track-description').value,
          artistCredit: document.getElementById('edit-track-credit').value,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { editOverlay.classList.remove('active'); showToast('Cambios guardados.'); loadTracks(); loadPendingTracks(); }
      else if (res.status !== 401) showToast(d.error || 'No se pudieron guardar los cambios.', true);
    } catch {
      showToast('Se perdió la conexión. Intenta de nuevo.', true);
    } finally {
      btn.disabled = false;
    }
  });

  async function savePrice(id, prices) {
    const res = await fetch(`/api/admin/tracks/${id}/price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceBasic: prices.basic,
        pricePremium: prices.premium,
        priceUnlimited: prices.unlimited,
        priceExclusive: prices.exclusive,
      }),
    });
    if (res.ok) {
      showToast('Precios actualizados.');
      loadTracks();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'No se pudo guardar el precio.', true);
    }
  }

  async function deleteTrack(id, title) {
    if (!confirm(`¿Eliminar "${title}"? Se eliminarán todos sus archivos. Esta acción es definitiva.`)) return;
    let res = await fetch(`/api/admin/tracks/${id}`, { method: 'DELETE' });
    if (res.status === 409) {
      const err = await res.json().catch(() => ({}));
      if (!confirm((err.error || 'Esta pista tiene ventas.') + '\n\n¿Eliminarla de todas formas?')) return;
      res = await fetch(`/api/admin/tracks/${id}?force=1`, { method: 'DELETE' });
    }
    if (res.ok) {
      showToast('Pista eliminada.');
      loadTracks(); loadSummary();
    } else if (res.status !== 401) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'No se pudo eliminar.', true);
    }
  }

  // Escapa también las comillas: el texto puede ir dentro de un atributo (alt, aria-label, href, title)
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Resultado de la verificación de originalidad en «Mi música»
  let origTracksTimer = null;
  function lineaOrigAdmin(o) {
    if (!o) return '';
    if (o.estado === 'pendiente') { if (!origTracksTimer) origTracksTimer = setTimeout(() => { origTracksTimer = null; if (document.visibilityState === 'visible') loadTracks(); }, 8000); return '<div class="m orig-mini proc">Verificando originalidad…</div>'; }
    if (o.estado === 'error') return '<div class="m orig-mini warn">La verificación de originalidad falló' + (o.error ? ': ' + escapeHtml(o.error) : '') + '</div>';
    if (o.estado === 'limpio') return '<div class="m orig-mini ok">✓ Sin coincidencias' + (o.servicio ? ' (catálogo y ' + escapeHtml(o.servicio) + ')' : ' en el catálogo') + '</div>';
    const lista = (o.externas || []).map(x => '«' + escapeHtml(x.titulo) + '» de ' + escapeHtml(x.artista))
      .concat((o.internas || []).map(x => '«' + escapeHtml(x.titulo) + '» (' + x.similitud + ' %)'));
    return '<div class="m orig-mini warn"><strong>Coincide con:</strong> ' + lista.join(' · ') + '</div>';
  }

  // ---------- Coincidencias de originalidad (prioridad máxima) ----------
  const mmss = (n) => { n = Math.max(0, Math.round(Number(n) || 0)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); };
  async function loadCoincidencias() {
    const r = await fetch('/api/admin/coincidencias');
    if (!r.ok) return;
    const d = await r.json();
    const n = d.obras.length;
    const panel = document.getElementById('coincidencias-panel');
    const alerta = document.getElementById('orig-alerta');
    panel.hidden = !n;
    alerta.hidden = !n;
    const sub = document.querySelector('.subtabs[data-grupo="musica"] .subtab[data-sub="coincidencias"]');
    if (sub) sub.hidden = !n;
    actualizarNav('musica', 'coincidencias', n);
    if (!n) {
      document.getElementById('coincidencias-list').innerHTML = '';
      // si estaba abierta esa parte y ya no queda nada, se vuelve a la música
      if (sub && sub.classList.contains('active')) ZBUI.irSub('musica', 'catalogo', { silencio: true });
      return;
    }
    document.getElementById('orig-alerta-n').textContent = n === 1 ? '1 obra con coincidencias.' : n + ' obras con coincidencias.';
    document.getElementById('orig-alerta-det').textContent = 'Quien ' + (n === 1 ? 'la' : 'las') + ' licencie puede recibir reclamos de Content ID.';
    // en el teléfono la alerta va en la barra de arriba, como una ficha roja con el número
    const bAlerta = document.getElementById('orig-alerta-btn');
    bAlerta.dataset.n = String(n);
    bAlerta.setAttribute('aria-label', 'Revisar ahora: ' + (n === 1 ? '1 obra con coincidencias' : n + ' obras con coincidencias'));
    document.getElementById('coincidencias-count').textContent = n;
    document.getElementById('coincidencias-hint').textContent = d.autoRetiro
      ? 'Las que coinciden con canciones publicadas se retiran solas de la tienda. Escucha y decide: retirarla definitivamente o mantenerla si es original.'
      : 'Escucha y decide: retirarla de la tienda o mantenerla si es original.';
    const estadoTxt = (o) => o.retiradaAuto ? '<span class="tag-vencido">retirada automáticamente</span>'
      : o.estado === 'approved' ? '<span class="tag-vencido">a la venta</span>' : '<span class="tag-pending">en revisión</span>';
    document.getElementById('coincidencias-list').innerHTML = d.obras.map(o => `
      <div class="coin-item" data-id="${o.id}">
        <div class="coin-head">
          ${o.portada ? `<img src="/api/cover/${o.id}?s=160" alt="" loading="lazy">` : ''}
          <div class="coin-info">
            <div class="coin-title">${escapeHtml(o.titulo)} ${estadoTxt(o)}</div>
            <div class="coin-meta">${o.productor ? 'Productor: ' + escapeHtml(o.productor) : 'Tuya'} · subida ${escapeHtml(fechaHora(o.subida))}${o.ventas ? ` · <strong class="coin-ventas">${o.ventas} licencia${o.ventas === 1 ? '' : 's'} vendida${o.ventas === 1 ? '' : 's'}</strong>` : ''}</div>
          </div>
        </div>
        <div class="coin-player">
          <span class="coin-label">En Zona Beats</span>
          <audio controls preload="none" src="/api/admin/preview-audio/${o.id}" aria-label="Escuchar ${escapeHtml(o.titulo)}"></audio>
        </div>
        ${o.externas.map(x => `
          <div class="coin-match ext">
            <div class="coin-label">Canción publicada</div>
            <div class="coin-song"><strong>${escapeHtml(x.titulo)}</strong> — ${escapeHtml(x.artista)}${x.sello ? ' · ' + escapeHtml(x.sello) : ''}${x.fecha ? ' · ' + escapeHtml(x.fecha) : ''}</div>
            <div class="coin-meta">Suena en tu pista en el ${mmss(x.segundo)}${x.enOriginal ? ' · en la original, en el ' + escapeHtml(x.enOriginal) : ''}</div>
            <div class="coin-actions-row">
              <button type="button" class="btn-secondary coin-ir" data-seg="${Number(x.segundo) || 0}">Escuchar tu pista desde el ${mmss(x.segundo)}</button>
              ${x.enlace ? `<a class="btn-secondary coin-link" href="${escapeHtml(x.enlace)}" target="_blank" rel="noopener noreferrer">Escuchar la original</a>` : ''}
            </div>
          </div>`).join('')}
        ${o.internas.map(x => `
          <div class="coin-match int">
            <div class="coin-label">Otra obra de la tienda</div>
            <div class="coin-song"><strong>${escapeHtml(x.titulo)}</strong> — ${escapeHtml(x.productor)}${x.mismoProductor ? ' (mismo productor)' : ''}</div>
            <div class="coin-meta">${x.similitud} % igual en ${x.segundos} s</div>
            ${x.existe ? `<audio controls preload="none" src="/api/admin/preview-audio/${x.trackId}" aria-label="Escuchar ${escapeHtml(x.titulo)}"></audio>` : '<div class="coin-meta">Esa obra ya fue eliminada.</div>'}
          </div>`).join('')}
        <div class="coin-decision">
          <label class="coin-motivo-l">Si es original, di por qué <input type="text" class="coin-motivo" maxlength="300" placeholder="Motivo (mínimo 10 caracteres)"></label>
          <button type="button" class="btn-secondary coin-ok">Mantener${o.retiradaAuto ? ' y devolver a la tienda' : ''}</button>
          <button type="button" class="btn-delete coin-retirar">${o.retiradaAuto ? 'Confirmar retiro' : o.estado === 'approved' ? 'Retirar de la tienda' : 'Rechazar'}</button>
          <button type="button" class="btn-secondary coin-reverif">Verificar de nuevo</button>
          ${o.productorTel ? `<a class="btn-secondary coin-link" href="https://wa.me/${soloDigitos(o.productorTel)}?text=${encodeURIComponent('Hola ' + o.productor + ', tu obra «' + o.titulo + '» en Zona Beats coincide con ' + (o.externas[0] ? '«' + o.externas[0].titulo + '» de ' + o.externas[0].artista : 'otra obra de la tienda') + '. ¿Puedes aclararlo?')}" target="_blank" rel="noopener">Escribir al productor</a>` : ''}
        </div>
      </div>`).join('');
  }
  document.getElementById('coincidencias-list').addEventListener('click', async (e) => {
    const item = e.target.closest('.coin-item');
    if (!item) return;
    const id = item.dataset.id;
    if (e.target.classList.contains('coin-ir')) {
      const a = item.querySelector('.coin-player audio');
      a.currentTime = Number(e.target.dataset.seg) || 0;
      a.play().catch(() => {});
      return;
    }
    const recargar = () => { loadCoincidencias(); loadTracks(); loadPendingTracks(); loadSummary(); loadOrigEstado(); };
    if (e.target.classList.contains('coin-retirar')) {
      e.target.disabled = true;
      const r = await fetch('/api/admin/coincidencias/' + id + '/retirar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      e.target.disabled = false;
      if (r.ok) { showToast('Obra retirada de la tienda.'); recargar(); } else if (r.status !== 401) showToast('No se pudo retirar.', true);
    }
    if (e.target.classList.contains('coin-ok')) {
      const motivo = item.querySelector('.coin-motivo').value.trim();
      if (motivo.length < 10) { showToast('Indica el motivo (mínimo 10 caracteres).', true); item.querySelector('.coin-motivo').focus(); return; }
      e.target.disabled = true;
      const r = await fetch('/api/admin/coincidencias/' + id + '/mantener', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) });
      const d = await r.json().catch(() => ({}));
      e.target.disabled = false;
      if (r.ok) { showToast(d.vuelveATienda ? 'Obra mantenida y de vuelta en la tienda.' : 'Obra mantenida.'); recargar(); } else if (r.status !== 401) showToast(d.error || 'No se pudo guardar.', true);
    }
    if (e.target.classList.contains('coin-reverif')) {
      e.target.disabled = true;
      const r = await fetch('/api/admin/tracks/' + id + '/originalidad', { method: 'POST' });
      if (r.ok) { showToast('Verificando de nuevo…'); setTimeout(recargar, 6000); } else { e.target.disabled = false; showToast('No se pudo verificar.', true); }
    }
  });
  document.getElementById('orig-alerta-btn').addEventListener('click', () => abrirCategoria('musica/coincidencias'));
  document.getElementById('orig-auto-retiro').addEventListener('change', async (ev) => {
    const r = await fetch('/api/admin/originalidad/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoRetiro: ev.target.checked }) });
    if (r.ok) { showToast(ev.target.checked ? 'Retiro automático activado.' : 'Retiro automático desactivado.'); loadCoincidencias(); }
    else { ev.target.checked = !ev.target.checked; showToast('No se pudo guardar.', true); }
  });

  function pintarConsumoAudd(c, activo) {
    const box = document.getElementById('audd-uso');
    box.hidden = !activo || !c;
    if (box.hidden) return;
    const pct = c.incluidas ? Math.min(100, Math.round(c.usadas / c.incluidas * 100)) : 100;
    document.getElementById('audd-quedan-canciones').textContent = c.alcanzaPara + ' de ' + c.cancionesPlan;
    document.getElementById('audd-quedan-txt').textContent = 'Quedan ' + c.quedan.toLocaleString('es') + ' de ' + c.incluidas.toLocaleString('es') + ' consultas · usadas ' + c.usadas.toLocaleString('es') + ' · unas ' + c.porCancion + ' por canción';
    const barra = document.getElementById('audd-barra');
    barra.style.width = pct + '%';
    box.classList.toggle('poco', c.alcanzaPara <= 5);
    const inc = document.getElementById('audd-incluidas');
    if (document.activeElement !== inc) inc.value = c.incluidas;
  }
  document.getElementById('audd-guardar').addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    const r = await fetch('/api/admin/originalidad/consumo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incluidas: Number(document.getElementById('audd-incluidas').value), usadas: document.getElementById('audd-usadas').value.trim() }) });
    const d = await r.json().catch(() => ({}));
    ev.target.disabled = false;
    if (!r.ok) { if (r.status !== 401) showToast(d.error || 'No se pudo guardar.', true); return; }
    document.getElementById('audd-usadas').value = '';
    showToast('Contador de AudD actualizado.');
    pintarConsumoAudd(d.consumo, true); loadSummary();
  });

  async function loadOrigEstado() {
    const r = await fetch('/api/admin/originalidad/estado');
    if (!r.ok) return;
    const d = await r.json();
    document.getElementById('orig-estado').innerHTML =
      (d.servicioExterno ? 'Reconocimiento externo (AudD): <strong>configurado</strong>.' : 'Reconocimiento externo (AudD): <strong>sin configurar</strong>. Solo se compara con el catálogo de la tienda.') +
      '<br>Verificados: ' + d.limpio + ' sin coincidencias · ' + d.coincidencias + ' con coincidencias · ' + d.pendiente + ' en curso · ' + d.error + ' con error' +
      (d.ultimoError ? '<br>Último error: ' + escapeHtml(d.ultimoError) : '');
    document.getElementById('orig-probar').hidden = !d.servicioExterno;
    pintarConsumoAudd(d.consumo, d.servicioExterno);
    document.getElementById('orig-auto-retiro').checked = d.autoRetiro !== false;
  }
  document.getElementById('orig-probar').addEventListener('click', async (ev) => {
    const out = document.getElementById('orig-probar-res');
    ev.target.disabled = true; out.textContent = 'Probando…';
    const r = await fetch('/api/admin/originalidad/probar', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    ev.target.disabled = false;
    if (!r.ok) { out.textContent = d.error || 'No se pudo probar.'; return; }
    out.textContent = d.ok
      ? (d.canciones.length ? 'Conexión correcta. AudD reconoció la canción de prueba: ' + d.canciones.join(', ') + '.' : 'AudD respondió, pero no reconoció la canción de prueba.')
      : 'AudD respondió con un error: ' + d.error;
    loadOrigEstado();
  });

  async function loadProfile() {
    const res = await fetch('/api/profile');
    const { profile } = await res.json();
    artistNameInput.value = profile.artist_name || '';
    artistBioInput.value = profile.bio || '';
  }

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('artist_name', artistNameInput.value);
    formData.append('bio', artistBioInput.value);
    if (avatarInput.files.length) formData.append('avatar', avatarInput.files[0]);

    const res = await fetch('/api/admin/profile', { method: 'POST', body: formData });
    if (res.ok) {
      showToast('Perfil actualizado.');
      avatarInput.value = '';
      document.getElementById('avatar-drop-label').textContent = 'JPG, PNG o WEBP · máx 8MB';
      avatarDrop.classList.remove('has-file');
    } else {
      showToast('No se pudo guardar el perfil.', true);
    }
  });


  function addAccountRow(currency = 'CUP', bank = '', number = '') {
    const row = document.createElement('div');
    row.className = 'account-row with-currency';
    const options = currencyOptionsHtml(currency);
    row.innerHTML = `
      <select class="account-currency" aria-label="Moneda de la cuenta">${options}</select>
      <input type="text" class="account-bank" placeholder="Banco / plataforma" value="${escapeHtml(bank)}">
      <input type="text" class="account-number" placeholder="Número de cuenta/tarjeta" value="${escapeHtml(number)}">
      <button type="button" class="account-remove-btn" aria-label="Quitar cuenta">&times;</button>
    `;
    row.querySelector('.account-remove-btn').addEventListener('click', () => row.remove());
    accountsList.appendChild(row);
  }

  addAccountBtn.addEventListener('click', () => {
    addAccountRow();
    // la cuenta nueva queda a la vista aunque caiga en otra página
    setTimeout(() => { if (PAGINAS['accounts-list']) PAGINAS['accounts-list'].ultima(); const ult = accountsList.lastElementChild && accountsList.lastElementChild.querySelector('input'); if (ult) ult.focus({ preventScroll: true }); }, 0);
  });

  async function loadPaymentInfo() {
    const res = await fetch('/api/admin/payment-info');
    if (!res.ok) return;
    const { contactPhone, accounts } = await res.json();
    contactPhoneInput.value = contactPhone || '';
    accountsList.innerHTML = '';
    if (accounts.length) {
      accounts.forEach(acc => addAccountRow(acc.currency, acc.bank, acc.number));
    } else {
      addAccountRow();
    }
  }

  paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const accounts = Array.from(accountsList.querySelectorAll('.account-row')).map(row => ({
      currency: row.querySelector('.account-currency').value,
      bank: row.querySelector('.account-bank').value.trim(),
      number: row.querySelector('.account-number').value.trim(),
    })).filter(a => a.bank || a.number);

    const res = await fetch('/api/admin/payment-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactPhone: contactPhoneInput.value.trim(), accounts }),
    });

    if (res.ok) {
      showToast('Datos de cobro guardados.');
    } else {
      showToast('No se pudieron guardar los datos de cobro.', true);
    }
  });

  // ---------- Resumen del negocio ----------
  async function loadSummary(fresco) {
    const res = await fetch('/api/admin/summary' + (fresco ? '?fresco=1' : ''));
    if (!res.ok) return;
    const d = await res.json();
    const cup = (n) => Number(n || 0).toLocaleString('es', { maximumFractionDigits: 0 }) + ' CUP';
    const gb = (b) => b >= 1024 * 1024 * 1024 ? (b / 1024 / 1024 / 1024).toLocaleString('es', { maximumFractionDigits: 1 }) + ' GB'
      : b >= 1024 * 1024 ? Math.round(b / 1024 / 1024) + ' MB' : 'menos de 1 MB';
    const tarjeta = (titulo, grande, sub, clase) => '<div class="summary-card ' + (clase || '') + '"><span>' + titulo + '</span><strong>' + grande + '</strong><em>' + sub + '</em></div>';
    document.getElementById('admin-summary').innerHTML =
      tarjeta('Este mes', cup(d.mes.total), d.mes.ventas + ' venta' + (d.mes.ventas === 1 ? '' : 's') + ' · para ti ' + cup(d.mes.tuyo), 'highlight') +
      tarjeta(d.contadorDesde ? 'Desde el ' + fechaHora(d.contadorDesde) : 'Desde el inicio', cup(d.siempre.total), d.siempre.ventas + ' venta' + (d.siempre.ventas === 1 ? '' : 's') + ' · para ti ' + cup(d.siempre.tuyo)) +
      tarjeta('Debes a productores', cup(d.deudaProductores), 'ventas y bonos sin pagar', d.deudaProductores > 0 ? 'warn' : '') +
      tarjeta('Espacio usado', gb(d.discoBytes || 0), 'audios, portadas y base de datos');
    document.getElementById('reset-deshacer').hidden = !d.contadorDesde;
    const p = d.pendientes;
    const chips = [
      ['musica/coincidencias', p.coincidencias || 0, 'obra con coincidencias', 'obras con coincidencias', 'prioridad'],
      ['ajustes/originalidad', (p.auddPocas !== undefined && p.auddPocas >= 0) ? 1 : 0, 'AudD: ' + (p.auddPocas === 0 ? 'sin consultas disponibles' : 'quedan ' + p.auddPocas + ' canciones por verificar'), '', 'prioridad', true],
      ['ventas/comprobantes', p.pedidos, 'comprobante', 'comprobantes'],
      ['ventas/comprobantes', p.reclamos || 0, 'reclamo de comprador', 'reclamos de compradores'],
      ['productores/reclamos', p.contentId || 0, 'reclamo de Content ID', 'reclamos de Content ID'],
      ['productores/revisar', p.beats, 'beat por revisar', 'beats por revisar'],
      ['musica/packs', p.packs || 0, 'sample pack por revisar', 'sample packs por revisar'],
      ['productores/cuentas', p.productores, 'productor por aprobar', 'productores por aprobar'],
      ['pagos/planes', p.planes, 'compra de plan', 'compras de plan'],
      ['pagos/retiros', p.retiros, 'retiro por pagar', 'retiros por pagar'],
    ].filter(c => c[1] > 0);
    actualizarNav('ajustes', 'audd', (p.auddPocas !== undefined && p.auddPocas >= 0) ? 1 : 0);
    const cont = document.getElementById('admin-pending');
    cont.innerHTML = chips.length
      ? chips.map(c => '<button type="button" class="pending-chip' + (c[4] ? ' chip-prioridad' : '') + '" data-cat="' + c[0] + '">' + (c[5] ? c[2] : c[1] + ' ' + (c[1] === 1 ? c[2] : c[3])) + '</button>').join('')
      : '<span class="all-done">Todo al día: no hay nada pendiente.</span>';
    cont.querySelectorAll('.pending-chip').forEach(b => b.addEventListener('click', () => abrirCategoria(b.dataset.cat)));
  }
  document.getElementById('summary-refresh').addEventListener('click', () => { loadSummary(true); loadOrders(); showToast('Actualizado.'); });

  // ---------- Reiniciar ventas ----------
  async function reiniciarContador(deshacer) {
    const r = await fetch('/api/admin/ventas/reiniciar-contador', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deshacer: Boolean(deshacer) }) });
    if (r.ok) { showToast(deshacer ? 'El Resumen vuelve a contar todas las ventas.' : 'Totales reiniciados.'); loadSummary(true); }
    else showToast('No se pudo cambiar el contador.', true);
  }
  document.getElementById('reset-contador').addEventListener('click', () => {
    if (confirm('¿Reiniciar el contador? «Este mes» y «Desde el inicio» quedan en 0 y cuentan desde ahora. No se borra ninguna venta.')) reiniciarContador(false);
  });
  document.getElementById('reset-deshacer').addEventListener('click', () => reiniciarContador(true));
  document.getElementById('reset-borrar').addEventListener('click', async (ev) => {
    const txt = prompt('Se eliminarán todas las ventas, licencias, bonos y retiros. Esta acción es definitiva.\n\nEscribe BORRAR para confirmar:');
    if (txt === null) return;
    if (txt.trim().toUpperCase() !== 'BORRAR') { showToast('No se borró nada: hay que escribir BORRAR.', true); return; }
    ev.target.disabled = true;
    const r = await fetch('/api/admin/ventas/borrar-todo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmar: 'BORRAR' }) });
    const d = await r.json().catch(() => ({}));
    ev.target.disabled = false;
    if (!r.ok) { showToast(d.error || 'No se pudo borrar.', true); return; }
    showToast('Listo: se borraron ' + d.ventas + ' ventas y ' + d.retiros + ' retiros. Todo quedó en 0.');
    loadSummary(true); loadOrders(); loadHistory(); loadProducers(); loadPayouts(); loadTracks();
  });

  async function loadOrders() {
    const res = await fetch('/api/admin/orders');
    if (!res.ok) return;
    const { orders } = await res.json();
    actualizarNav('ventas', null, orders.length);
    renderOrders(orders);
  }

  const ESTADO_PEDIDO = { approved: 'aprobado', pending: 'pendiente', rejected: 'rechazado', esperando_pago: 'esperando el pago' };
  function formatOrderDate(isoLike) {
    const txt = String(isoLike || '');
    const d = new Date(txt.includes('T') ? txt : txt.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return txt;
    return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  const LIC_NOMBRES = { basic: 'Básica', premium: 'Premium', unlimited: 'Ilimitada', exclusive: 'Exclusiva', pack: 'Sample Pack' };
  const soloDigitos = (t) => String(t || '').replace(/[^0-9]/g, '');
  const etiquetaDe = (code) => { const c = configuredCurrencies.find(x => x.code === code); return (c && c.label) || code || 'CUP'; };
  const unidades = (n, code) => Number(n || 0).toLocaleString('es', { minimumFractionDigits: ZBUI.decimales(code), maximumFractionDigits: ZBUI.decimales(code) }) + ' ' + etiquetaDe(code);
  // Lo que irá a la billetera del productor (en la moneda en que pagó el comprador, menos la comisión)
  function paraProductor(o) {
    if (!o.producer_id) return '';
    const moneda = o.wallet_currency || 'CUP';
    const pagado = o.wallet_currency ? o.paid_units : o.price_cup_at_sale;
    const pct = Number(o.commission_percent_at_sale || 0);
    const neto = o.status === 'approved' ? o.producer_earning_units : pagado * (1 - pct / 100);
    return ' · al productor ' + unidades(neto, moneda) + ' (−' + pct + '%)';
  }

  function mensajeLinkCompra(o, linkCompra, certificado) {
    return 'Hola ' + o.buyer_name + ' \u{1F44B} Tu compra de "' + o.track_title + '" (licencia ' + (LIC_NOMBRES[o.license_type] || o.license_type) + ') está aprobada.\n\n' +
      (linkCompra ? 'Tu beat y tu licencia (enlace privado):\n' + linkCompra + '\n\n' : '') +
      (certificado ? 'Número de licencia: ' + certificado + '\nCualquiera puede verificarla en: ' + location.origin + '/verify/' + certificado + '\n\n' : '') +
      '¡Gracias por tu compra!';
  }

  // «Pago posiblemente repetido»: un motivo y, como mucho, dos pedidos con nombre.
  function avisoRepetido(lista) {
    const motivos = [...new Set(lista.map(r => r.motivo))];
    const motivo = motivos.length === 1 ? motivos[0] : 'mismo comprobante o transacción';
    const pedido = (r) => (r.codigo ? String(r.codigo).split('-').slice(0, 2).join('-') : 'el pedido ' + r.id) +
      ' (' + r.comprador + ', ' + (ESTADO_PEDIDO[r.estado] || r.estado) + ')';
    const nombrados = lista.slice(0, 2).map(pedido);
    const resto = lista.length - nombrados.length;
    const texto = motivo.charAt(0).toUpperCase() + motivo.slice(1) + ' que ' +
      (resto > 0 ? nombrados.join(', ') + ' y ' + resto + ' más' : nombrados.join(' y ')) + '. Confirma que entraron los dos pagos.';
    return '<div class="order-reclamo"><strong>Pago posiblemente repetido.</strong> ' + escapeHtml(texto) + '</div>';
  }

  function renderOrders(orders) {
    ordersList.innerHTML = '';

    if (!orders.length) {
      ordersList.innerHTML = '<div class="empty-hint">No hay pagos pendientes.</div>';
      ordersCount.classList.remove('show');
      return;
    }

    ordersCount.textContent = orders.length;
    ordersCount.classList.add('show');

    orders.forEach((order) => {
      const item = document.createElement('div');
      item.className = 'order-item' + (order.conReclamo || (order.repetidos || []).length ? ' is-reclamo' : '');
      const rechazada = order.status === 'rejected';
      const reclamoHtml = order.conReclamo
        ? '<div class="order-reclamo"><strong>Reclamo del comprador</strong> (' + formatOrderDate(order.reclamo_at) + '): ' + escapeHtml(order.reclamo_texto) + '</div>' : '';
      const plazoHtml = order.vencido ? '<div class="order-warning">Plazo de confirmación vencido.</div>' : '';
      const repetidoHtml = (order.repetidos || []).length ? avisoRepetido(order.repetidos) : '';

      const lic = LIC_NOMBRES[order.license_type] || order.license_type || '';
      const avisoVendida = order.track_sold
        ? '<div class="order-warning">' + (order.track_exclusive ? 'Este beat ya se vendió en Exclusiva.' : 'Este beat ya se cerró con una licencia Ilimitada.') +
          (['unlimited', 'exclusive'].includes(order.license_type) ? ' No se puede aprobar: rechaza y devuelve el dinero.' : ' Revisa antes de aprobar.') + '</div>'
        : '';
      const waRecibido = soloDigitos(order.buyer_phone)
        ? 'https://wa.me/' + soloDigitos(order.buyer_phone) + '?text=' + encodeURIComponent('Hola ' + order.buyer_name + ' \u{1F44B} Recibí tu comprobante por "' + order.track_title + '" (licencia ' + lic + '). Ya lo estoy revisando y en breve te confirmo.')
        : '';

      item.innerHTML = `
        ${order.pago_metodo === 'qvapay'
          ? '<div class="receipt-thumb receipt-qvapay" aria-hidden="true">QvaPay</div>'
          : `<img class="receipt-thumb" src="/api/admin/orders/${order.id}/receipt" alt="Comprobante de ${escapeHtml(order.buyer_name)}" loading="lazy">`}
        <div class="info">
          <div class="buyer">${escapeHtml(order.buyer_name)}${rechazada ? ' <span class="tag-vencido">rechazada</span>' : ''}</div>
          ${order.codigo ? `<div class="order-code">Pedido ${escapeHtml(order.codigo)}</div>` : ''}
          <div class="track">${escapeHtml(order.track_title)} · <strong>${escapeHtml(lic)}</strong>${order.price_label ? ` · ${escapeHtml(order.price_label)}` : ''}</div>
          <div class="meta">${escapeHtml(order.buyer_phone)} · ${formatOrderDate(order.created_at)} · pagó ${escapeHtml(unidades(order.wallet_currency ? order.paid_units : order.price_cup_at_sale, order.wallet_currency || 'CUP'))}${order.producer_name ? ' · productor: ' + escapeHtml(order.producer_name) + escapeHtml(paraProductor(order)) : ''}${order.license_type === 'exclusive' ? (order.vip_public ? ' · acepta salir en Beats VIP' : ' · no quiere salir en Beats VIP') : ''}</div>
          ${order.pago_metodo === 'qvapay'
            ? `<div class="order-reclamo"><strong>Pagado con QvaPay</strong> (${escapeHtml(order.transaction_ref || order.qvapay_uuid || '')}). No se entregó automáticamente: ${escapeHtml(order.qvapay_error || 'revísalo')}</div>`
            : (order.transaction_ref ? `<div class="order-code">Transacción: ${escapeHtml(order.transaction_ref)}</div>` : '<div class="order-code">Sin número de transacción</div>')}
          ${avisoVendida}${repetidoHtml}${plazoHtml}${reclamoHtml}
        </div>
        <div class="actions">
          <button class="btn-approve-order" type="button">Aprobar</button>
          ${rechazada ? '' : '<button class="btn-reject-track btn-reject-order" type="button">Rechazar</button>'}
          ${order.conReclamo ? '<button class="btn-toggle-producer btn-reclamo-ok" type="button">Reclamo atendido</button>' : ''}
          ${waRecibido ? `<a class="btn-toggle-producer" href="${waRecibido}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          ${rechazada ? '' : '<button class="btn-delete" type="button" title="Borrar sin avisar (spam)">Borrar</button>'}
        </div>
      `;

      const thumbOrden = item.querySelector('img.receipt-thumb');
      if (thumbOrden) thumbOrden.addEventListener('click', () => {
        receiptModalImg.src = `/api/admin/orders/${order.id}/receipt`;
        receiptModalOverlay.classList.add('active');
      });
      item.querySelector('.btn-approve-order').addEventListener('click', (ev) => approveOrder(order, item, ev.target));
      const bRech = item.querySelector('.btn-reject-order');
      if (bRech) bRech.addEventListener('click', () => rejectOrder(order));
      const bDel = item.querySelector('.btn-delete');
      if (bDel) bDel.addEventListener('click', () => deleteOrder(order.id, order.buyer_name, order.certificate_id));
      const bRec = item.querySelector('.btn-reclamo-ok');
      if (bRec) bRec.addEventListener('click', async () => {
        const r = await fetch('/api/admin/orders/' + order.id + '/reclamo-atendido', { method: 'POST' });
        showToast(r.ok ? 'Reclamo atendido.' : 'No se pudo marcar.', !r.ok);
        loadOrders(); loadSummary();
      });

      ordersList.appendChild(item);
    });
  }

  async function approveOrder(order, item, btn) {
    btn.disabled = true;
    const res = await fetch(`/api/admin/orders/${order.id}/approve`, { method: 'POST' });
    if (res.ok) {
      const result = await res.json();
      let msg = 'Pedido aprobado.';
      if (result.wentToVip) msg = 'Aprobado. La pista pasó a Beats VIP.';
      else if (result.trackMarkedSold) msg = 'Aprobado. La pista salió del catálogo.';
      if (result.billetera) msg += ' Se sumaron ' + unidades(result.billetera.unidades, result.billetera.moneda) + ' a la billetera del productor.';
      showToast(msg + ' Ahora mándale su link de descarga.');
      if (result.warning) alert(result.warning);
      // El link se manda con un toque (así el navegador no bloquea WhatsApp).
      const tel = soloDigitos(order.buyer_phone);
      const texto = mensajeLinkCompra(order, result.purchaseUrl, result.certificateId);
      item.classList.add('order-done');
      item.querySelector('.actions').innerHTML =
        (tel ? '<a class="btn-whatsapp-order" href="https://wa.me/' + tel + '?text=' + encodeURIComponent(texto) + '" target="_blank" rel="noopener">Enviar por WhatsApp</a>' : '') +
        '<button type="button" class="btn-toggle-producer btn-copy-now">Copiar link</button>' +
        '<button type="button" class="btn-toggle-producer btn-done-now">Listo</button>';
      const listo = () => { loadOrders(); };
      const wa = item.querySelector('.btn-whatsapp-order');
      if (wa) wa.addEventListener('click', () => setTimeout(listo, 800));
      item.querySelector('.btn-done-now').addEventListener('click', listo);
      item.querySelector('.btn-copy-now').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(result.purchaseUrl); showToast('Enlace privado copiado.'); }
        catch { prompt('Copia este link y mándaselo al comprador:', result.purchaseUrl); }
      });
      loadTracks(); loadProducers(); loadHistory(); loadSummary(); loadPayouts();
    } else if (res.status !== 401) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'No se pudo aprobar el pedido.', true);
      btn.disabled = false;
      loadOrders();
    }
  }

  async function rejectOrder(order) {
    const reason = prompt('¿Por qué rechazas la compra de ' + order.buyer_name + '?', 'El pago no llegó a la cuenta.');
    if (reason === null) return;
    const res = await fetch('/api/admin/orders/' + order.id + '/reject', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    });
    if (res.ok) {
      showToast('Compra rechazada.');
      const tel = soloDigitos(order.buyer_phone);
      if (tel && confirm('¿Avisarle también por WhatsApp?')) {
        window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent('Hola ' + order.buyer_name + ', no pude aprobar tu compra de "' + order.track_title + '"' + (reason ? ': ' + reason : '.') + ' Escríbeme si tienes dudas.'), '_blank', 'noopener');
      }
      loadOrders(); loadHistory(); loadSummary();
    } else if (res.status !== 401) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'No se pudo rechazar.', true);
      loadOrders();
    }
  }

  async function deleteOrder(id, buyerName, certificateId, rechazado) {
    const aviso = certificateId
      ? '¿Borrar la foto del comprobante de "' + buyerName + '"?\n\nLa licencia ' + certificateId + ' se mantiene vigente.'
      : rechazado
        ? '¿Borrar la foto del comprobante rechazado de "' + buyerName + '"? El pedido sigue apareciendo como rechazado.'
        : '¿Borrar el pedido de "' + buyerName + '"? Para pagos no recibidos, usa «Rechazar».';
    if (!confirm(aviso)) return;
    const res = await fetch('/api/admin/orders/' + id, { method: 'DELETE' });
    if (res.ok) {
      const r = await res.json().catch(() => ({}));
      showToast(r.keptLicense
        ? 'Foto eliminada. La licencia ' + r.certificateId + ' sigue activa.'
        : (r.keptRejected ? 'Foto eliminada.' : 'Pedido borrado.'));
      loadOrders(); loadHistory();
    } else if (res.status !== 401) {
      showToast('No se pudo eliminar el comprobante.', true);
    }
  }

  receiptModalClose.addEventListener('click', () => receiptModalOverlay.classList.remove('active'));
  receiptModalOverlay.addEventListener('click', (e) => {
    if (e.target === receiptModalOverlay) receiptModalOverlay.classList.remove('active');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') receiptModalOverlay.classList.remove('active');
  });

  let watermarkHasVoice = false;
  let watermarkPendingFile = null;

  watermarkVoiceInput.addEventListener('change', () => {
    if (watermarkVoiceInput.files.length > 0) {
      watermarkPendingFile = watermarkVoiceInput.files[0];
      watermarkVoiceDropLabel.textContent = watermarkPendingFile.name;
      watermarkVoiceDrop.classList.add('has-file');
    }
  });

  async function loadWatermarkConfig() {
    const res = await fetch('/api/admin/watermark');
    if (!res.ok) return;
    const config = await res.json();
    watermarkHasVoice = config.active;
    watermarkIntervalInput.value = config.intervalSeconds;
    watermarkVolumeInput.value = config.volume;
    updateWatermarkStatusUI();
  }

  function updateWatermarkStatusUI() {
    if (watermarkHasVoice) {
      watermarkStatusBadge.textContent = 'ACTIVA';
      watermarkStatusBadge.classList.add('show');
      watermarkStatusBadge.classList.remove('badge-inactive');
      watermarkPreviewBtn.style.display = 'inline-block';
      watermarkRemoveBtn.style.display = 'inline-block';
      watermarkVoiceDropLabel.textContent = 'Tag configurado. Sube otro para reemplazarlo.';
    } else {
      watermarkStatusBadge.textContent = 'INACTIVA';
      watermarkStatusBadge.classList.add('show', 'badge-inactive');
      watermarkPreviewBtn.style.display = 'none';
      watermarkRemoveBtn.style.display = 'none';
      if (!watermarkPendingFile) {
        watermarkVoiceDropLabel.textContent = 'MP3, WAV, M4A, OGG o FLAC · máx 10MB · unos segundos bastan';
      }
    }
  }

  watermarkSaveBtn.addEventListener('click', async () => {
    const interval = parseInt(watermarkIntervalInput.value, 10);
    const volume = parseFloat(watermarkVolumeInput.value);

    if (!watermarkPendingFile && !watermarkHasVoice) {
      showToast('Sube el tag de voz para activar la marca de agua.', true);
      return;
    }
    if (isNaN(interval) || interval < 5 || interval > 600) {
      showToast('El intervalo debe ser un número entre 5 y 600 segundos.', true);
      return;
    }
    if (isNaN(volume) || volume < 0.05 || volume > 1) {
      showToast('El volumen debe ser un número entre 0.05 y 1.', true);
      return;
    }

    const formData = new FormData();
    if (watermarkPendingFile) formData.append('voice', watermarkPendingFile);
    formData.append('intervalSeconds', String(interval));
    formData.append('volume', String(volume));

    watermarkSaveBtn.disabled = true;
    watermarkSaveBtn.textContent = 'Guardando…';

    try {
      const res = await fetch('/api/admin/watermark', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo guardar la configuración');
      }
      showToast('Marca de agua guardada.');
      watermarkPendingFile = null;
      watermarkVoiceInput.value = '';
      watermarkVoiceDrop.classList.remove('has-file');
      await loadWatermarkConfig();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      watermarkSaveBtn.disabled = false;
      watermarkSaveBtn.textContent = 'Guardar configuración';
    }
  });

  watermarkPreviewBtn.addEventListener('click', () => {
    watermarkPreviewAudio.src = '/api/admin/watermark/preview?_=' + Date.now();
    watermarkPreviewAudio.play();
    watermarkPreviewBtn.textContent = '▶ Reproduciendo…';
    watermarkPreviewAudio.onended = () => {
      watermarkPreviewBtn.textContent = '▶ Escuchar la voz actual';
    };
  });

  watermarkRemoveBtn.addEventListener('click', async () => {
    if (!confirm('¿Quitar la marca de agua de las próximas publicaciones?')) return;
    const res = await fetch('/api/admin/watermark', { method: 'DELETE' });
    if (res.ok) {
      showToast('Marca de agua desactivada.');
      await loadWatermarkConfig();
    } else {
      showToast('No se pudo quitar la marca de agua.', true);
    }
  });

  function addSocialLinkRow(label = '', url = '') {
    const row = document.createElement('div');
    row.className = 'account-row';
    row.innerHTML = `
      <input type="text" class="social-label" placeholder="Nombre (ej: Spotify, TikTok...)" value="${escapeHtml(label)}">
      <input type="text" class="social-url" placeholder="https://..." value="${escapeHtml(url)}">
      <button type="button" class="account-remove-btn" aria-label="Quitar red social">&times;</button>
    `;
    row.querySelector('.account-remove-btn').addEventListener('click', () => row.remove());
    socialLinksList.appendChild(row);
  }

  addSocialLinkBtn.addEventListener('click', () => {
    addSocialLinkRow();
    setTimeout(() => { if (PAGINAS['social-links-list']) PAGINAS['social-links-list'].ultima(); }, 0);
  });

  async function loadSocialLinks() {
    const res = await fetch('/api/admin/social-links');
    if (!res.ok) return;
    const { links } = await res.json();
    socialLinksList.innerHTML = '';
    if (links.length) {
      links.forEach(l => addSocialLinkRow(l.label, l.url));
    } else {
      addSocialLinkRow();
    }
  }

  socialLinksSaveBtn.addEventListener('click', async () => {
    const links = Array.from(socialLinksList.querySelectorAll('.account-row')).map(row => ({
      label: row.querySelector('.social-label').value.trim(),
      url: row.querySelector('.social-url').value.trim(),
    })).filter(l => l.label || l.url);

    socialLinksSaveBtn.disabled = true;
    socialLinksSaveBtn.textContent = 'Guardando…';

    try {
      const res = await fetch('/api/admin/social-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudieron guardar las redes sociales');
      }
      showToast('Redes sociales guardadas.');
      await loadSocialLinks();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      socialLinksSaveBtn.disabled = false;
      socialLinksSaveBtn.textContent = 'Guardar redes sociales';
    }
  });

  const CURRENCY_LABELS = {
    CUP: 'CUP',
    MLC: 'MLC',
    USD: 'USD',
    USDT_BEP20: 'USDT (BEP20)',
    USDT_TRC20: 'USDT (TRC20)',
    USDT_POLYGON: 'USDT (Polygon)',
    SALDO_MOVIL: 'Saldo Móvil',
  };

  function renderExchangeRates(rates) {
    exchangeRatesList.innerHTML = '';
    rates.forEach(appendRateRow);
  }

  function appendRateRow(rate) {
    const row = document.createElement('div');
    const isCup = rate.code === 'CUP';
    // el CUP es la moneda base (siempre 1): no hace falta mostrarlo como fila editable
    row.className = 'rate-row' + (isCup ? ' rate-base' : '');
    row.innerHTML = `
      <div class="rate-row-label">${escapeHtml(rate.label)}${rate.custom ? ' <span class="custom-tag">agregado por ti</span>' : ''}</div>
      <div class="rate-row-input-wrap">
        ${isCup
          ? `<span>Moneda base — siempre 1</span>`
          : `<input type="text" class="rate-value" inputmode="decimal" data-code="${escapeHtml(rate.code)}" data-label="${escapeHtml(rate.label)}" placeholder="0" value="${rate.cupPerUnit || ''}" aria-label="CUP por 1 ${escapeHtml(rate.label)}"><span>CUP</span>`
        }
        ${rate.custom ? '<button type="button" class="account-remove-btn rate-remove" aria-label="Quitar método">&times;</button>' : ''}
      </div>
    `;
    const rm = row.querySelector('.rate-remove');
    if (rm) rm.addEventListener('click', () => {
      if (confirm('¿Quitar "' + rate.label + '"? Las cuentas en esa moneda dejarán de mostrarse.')) row.remove();
    });
    exchangeRatesList.appendChild(row);
  }

  let configuredCurrencies = Object.entries(CURRENCY_LABELS).map(([code, label]) => ({ code, label }));

  async function loadExchangeRates() {
    const res = await fetch('/api/admin/exchange-rates');
    if (!res.ok) return;
    const { rates, planUsdRate, qvapay } = await res.json();
    const qvEl = document.getElementById('qvapay-estado');
    if (qvapay && qvapay.claves) {
      qvEl.hidden = false;
      qvEl.textContent = qvapay.moneda
        ? 'QvaPay activo: esos pagos se aprueban solos.'
        : 'QvaPay: claves configuradas. Agrega el método «QvaPay» con su tasa (CUP por 1 USD) para activarlo en la tienda.';
    } else qvEl.hidden = true;
    const planIn = document.getElementById('plan-usd-rate');
    if (document.activeElement !== planIn) planIn.value = planUsdRate ? String(planUsdRate) : '';
    const byCode = Object.fromEntries(rates.map(r => [r.code, r]));
    const fullList = Object.entries(CURRENCY_LABELS).map(([code, label]) => ({
      code,
      label,
      cupPerUnit: byCode[code] ? byCode[code].cupPerUnit : (code === 'CUP' ? 1 : 0),
    }));
    // monedas / métodos que el admin agregó a mano
    rates.forEach(r => { if (!CURRENCY_LABELS[r.code]) fullList.push({ ...r, custom: true }); });
    configuredCurrencies = fullList.map(r => ({ code: r.code, label: r.label }));
    renderExchangeRates(fullList);
    refreshAccountCurrencySelects();
    if (typeof loadCommission === 'function') loadCommission();
  }

  function refreshAccountCurrencySelects() {
    accountsList.querySelectorAll('.account-currency').forEach(sel => {
      const cur = sel.value;
      sel.innerHTML = currencyOptionsHtml(cur);
    });
  }

  function currencyOptionsHtml(selected) {
    const list = configuredCurrencies.slice();
    if (selected && !list.some(c => c.code === selected)) list.push({ code: selected, label: selected });
    return list.map(c => `<option value="${escapeHtml(c.code)}" ${c.code === selected ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('');
  }

  document.getElementById('add-currency-btn').addEventListener('click', () => {
    const labelEl = document.getElementById('new-currency-label');
    const rateEl = document.getElementById('new-currency-rate');
    const label = labelEl.value.trim();
    if (!label) { showToast('Indica el método o la moneda.', true); return; }
    const code = label.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
    if (!code) { showToast('Nombre no válido.', true); return; }
    if (exchangeRatesList.querySelector(`[data-code="${code}"]`) || code === 'CUP') { showToast('Ese método ya existe.', true); return; }
    appendRateRow({ code, label, cupPerUnit: parseFloat(rateEl.value.replace(',', '.')) || 0, custom: true });
    // la fila nueva queda a la vista aunque caiga en otra página
    setTimeout(() => { if (PAGINAS['exchange-rates-list']) PAGINAS['exchange-rates-list'].ultima(); }, 0);
    labelEl.value = ''; rateEl.value = '';
    showToast('Agregado. Guarda las tasas para publicarlo.');
  });

  exchangeRatesForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rates = [{ code: 'CUP', label: 'CUP', cupPerUnit: 1 }];
    exchangeRatesList.querySelectorAll('.rate-value').forEach((input) => {
      rates.push({
        code: input.dataset.code,
        label: input.dataset.label,
        // se manda como está escrito («280.000»): el servidor entiende miles y decimales
        cupPerUnit: input.value.trim() || '0',
      });
    });

    const res = await fetch('/api/admin/exchange-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rates, planUsdRate: document.getElementById('plan-usd-rate').value.trim() || '0' }),
    });

    if (res.ok) {
      showToast('Tasas de cambio guardadas.');
      loadExchangeRates();
    } else {
      showToast('No se pudieron guardar las tasas.', true);
    }
  });

  async function loadSiteConfig() {
    const res = await fetch('/api/admin/site-config');
    if (!res.ok) return;
    const config = await res.json();
    promoActiveInput.checked = config.promoActive;
    promoTextInput.value = config.promoText || '';
    scheduleTextInput.value = config.scheduleText || '';
    document.getElementById('discount-input').value = config.discountPercent || 0;
  }

  siteConfigForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch('/api/admin/site-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promoActive: promoActiveInput.checked,
        promoText: promoTextInput.value.trim(),
        scheduleText: scheduleTextInput.value.trim(),
        discountPercent: document.getElementById('discount-input').value.trim() || '0',
      }),
    });

    if (res.ok) {
      showToast('Promoción guardada.');
      loadTracks();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'No se pudo guardar la configuración.', true);
    }
  });

  // ---------- Restaurar backup (se sube por partes y el servidor lo extrae sin cargarlo en memoria) ----------
  const restoreInput = document.getElementById('restore-input');
  const restoreLabel = document.getElementById('restore-label');
  const restoreProgress = document.getElementById('restore-progress');
  const restoreFill = document.getElementById('restore-fill');
  const restoreStatus = document.getElementById('restore-status');
  function estadoRestauracion(pct, texto) {
    if (pct !== null) restoreFill.style.width = pct + '%';
    restoreStatus.textContent = texto;
  }
  async function esperarReinicio() {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const r = await fetch('/api/admin/check', { cache: 'no-store' });
        if (r.ok) { window.location.reload(); return; }
      } catch { /* todavía reiniciando */ }
    }
    estadoRestauracion(100, 'Recarga la página en un minuto.');
  }
  restoreInput.addEventListener('change', async () => {
    const file = restoreInput.files[0];
    if (!file) return;
    const Z = window.ZBSubidas;
    if (!Z) { showToast('Error al iniciar la subida. Recarga la página.', true); return; }
    if (!/\.zip$/i.test(file.name)) { showToast('El backup es un archivo .zip.', true); restoreInput.value = ''; return; }
    if (!confirm(`¿Restaurar el backup "${file.name}" (${Z.tamano(file.size)})?\n\nLa información actual se reemplazará por la de esta copia.`)) {
      restoreInput.value = '';
      return;
    }
    if (!confirm('Esta acción no se puede deshacer. ¿Confirmas?')) { restoreInput.value = ''; return; }

    restoreLabel.textContent = file.name + ' · ' + Z.tamano(file.size);
    restoreProgress.style.display = 'block';
    subiendo = true;
    try {
      const uploadId = await Z.subirArchivo('backup', file, {
        alAvanzar: (n, total) => { const pct = Math.floor(n / total * 100); estadoRestauracion(pct, 'Subiendo el backup… ' + pct + '% (' + Z.tamano(n) + ' de ' + Z.tamano(total) + ')'); },
        alReintentar: (n) => estadoRestauracion(null, 'Se cortó la conexión. Reintentando (intento ' + n + ')…'),
      });
      estadoRestauracion(100, 'Comprobando y restaurando… (no cierres esta página)');
      const res = await fetch('/api/admin/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'No se pudo restaurar el backup');
      Z.olvidar('backup', file);
      subiendo = false;
      estadoRestauracion(100, 'Copia restaurada (' + d.restoredCount + ' archivos). Recargando…');
      showToast('Copia restaurada. Recargando…');
      esperarReinicio();
    } catch (err) {
      subiendo = false;
      estadoRestauracion(0, '');
      restoreProgress.style.display = 'none';
      restoreLabel.textContent = 'Elegir el archivo .zip del backup';
      if (!err || err.status !== 401) showToast((err && err.message) || 'No se pudo restaurar el backup', true);
    } finally {
      restoreInput.value = '';
    }
  });

  const createProducerForm = document.getElementById('create-producer-form');
  const producersList = document.getElementById('producers-list');
  const producersCount = document.getElementById('producers-count');

  const togglePasswordBtn = document.getElementById('toggle-producer-password');
  togglePasswordBtn.addEventListener('click', () => {
    const input = document.getElementById('producer-password-input');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    togglePasswordBtn.textContent = showing ? 'Mostrar' : 'Ocultar';
  });

  async function loadProducers() {
    const res = await fetch('/api/admin/producers');
    if (!res.ok) return;
    const { producers } = await res.json();
    ultimosProductores = producers;
    renderProducers(producers);
  }

  // Dos vistas: los que esperan aprobación y los ya aprobados (activos o desactivados)
  let ultimosProductores = [];
  let filtroProd = '';
  try { filtroProd = sessionStorage.getItem('zb_admin_filtro_prod') || ''; } catch { /* nada */ }
  document.querySelectorAll('.prod-filtro').forEach((b) => b.addEventListener('click', () => {
    filtroProd = b.dataset.filtro;
    try { sessionStorage.setItem('zb_admin_filtro_prod', filtroProd); } catch { /* nada */ }
    renderProducers(ultimosProductores);
  }));

  const PLAN_INFO = {
    free:   { label: 'Free',   com: 30, beats: '5 beats' },
    pro:    { label: 'Pro',    com: 20, beats: '50 beats' },
    studio: { label: 'Studio', com: 10, beats: 'ilimitados' },
  };

  function renderProducers(producers) {
    producersList.innerHTML = '';
    const pendientes = producers.filter(p => !p.approved).length;
    actualizarNav('productores', 'aprobar', pendientes);
    producersCount.textContent = pendientes ? pendientes + ' por aprobar' : (producers.length || '');
    producersCount.classList.toggle('show', producers.length > 0);

    const nAct = producers.length - pendientes;
    document.getElementById('prod-n-pend').textContent = '(' + pendientes + ')';
    document.getElementById('prod-n-act').textContent = '(' + nAct + ')';
    const filtro = filtroProd || (pendientes ? 'pendientes' : 'activos');
    document.querySelectorAll('.prod-filtro').forEach((b) => {
      const on = b.dataset.filtro === filtro;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    if (!producers.length) {
      producersList.innerHTML = '<div class="empty-hint">Aún no hay productores.</div>';
      return;
    }
    const visibles = producers.filter(p => filtro === 'pendientes' ? !p.approved : p.approved);
    if (!visibles.length) {
      producersList.innerHTML = '<div class="empty-hint">' + (filtro === 'pendientes' ? 'No hay productores esperando aprobación.' : 'Todavía no hay productores aprobados.') + '</div>';
      return;
    }

    visibles.forEach((p) => {
      const plan = PLAN_INFO[p.plan] || PLAN_INFO.free;
      const vencido = p.plan !== 'free' && p.plan_paid_until && new Date(p.plan_paid_until + 'T23:59:59') < new Date();
      const item = document.createElement('div');
      item.className = 'producer-item' + (p.approved ? '' : ' pending-approval');
      item.innerHTML =
        '<span class="status-dot ' + (p.active ? 'active' : 'inactive') + '"></span>' +
        '<div class="info">' +
          '<div class="name">' + escapeHtml(p.name) + (p.approved ? '' : ' <span class="tag-pending">por aprobar</span>') +
            (p.approved && !p.active ? ' <span class="tag-vencido">desactivado</span>' : '') +
            (p.identidad_verificada_at ? ' <span class="tag-verif">✓ Identidad verificada</span>' : '') + '</div>' +
          '<div class="email">' + escapeHtml(p.email) +
            (p.contact_phone ? ' · <a class="wa-link" href="https://wa.me/' + String(p.contact_phone).replace(/[^0-9]/g, '') + '" target="_blank" rel="noopener">WhatsApp ' + escapeHtml(p.contact_phone) + '</a>' : ' · <span class="muted">sin teléfono</span>') +
          '</div>' +
          (p.disabled_reason === 'plan_vencido' ? '<div class="stats"><span class="tag-vencido">DESACTIVADO POR FALTA DE PAGO</span> — 15 días sin renovar.</div>' : '') +
          '<div class="stats">Plan <strong>' + plan.label + '</strong> · ' + plan.com + '% comisión · ' + plan.beats +
            (p.plan_paid_until ? ' · paga hasta ' + escapeHtml(p.plan_paid_until) : '') +
            (vencido ? ' <span class="tag-vencido">VENCIDO</span>' : '') + '</div>' +
          '<div class="stats">' + p.trackCount + ' beats · ' + Number(p.totalSalesCup || 0).toLocaleString('es') + ' CUP vendidos · ' + Number(p.pendingPayoutCup || 0).toLocaleString('es', { maximumFractionDigits: 2 }) + ' CUP pendientes de pagarle · ' + (p.referidos || 0) + ' referidos que cuentan' +
            (p.pendingOrders ? ' · <strong>' + p.pendingOrders + ' compra(s) por aprobar</strong>' : '') + '</div>' +
          '<div class="plan-edit">' +
            '<select class="plan-select" aria-label="Plan de ' + escapeHtml(p.name) + '">' +
              ['free','pro','studio'].map(k => '<option value="' + k + '"' + (p.plan === k ? ' selected' : '') + '>' + PLAN_INFO[k].label + '</option>').join('') +
            '</select>' +
            '<input type="date" class="plan-until" aria-label="Pagado hasta" value="' + escapeHtml(p.plan_paid_until || '') + '">' +
            '<button type="button" class="btn-save-plan">Guardar plan</button>' +
          '</div>' +
        '</div>' +
        // Ley de Hick: a la vista solo lo de todos los días; lo demás en «Más opciones»
        '<div class="actions">' +
          (p.approved ? '' : '<button type="button" class="btn-approve-order btn-approve-prod">Aprobar</button>') +
          '<button type="button" class="btn-toggle-producer btn-movs-prod">Movimientos</button>' +
          '<details class="more-actions">' +
            '<summary>Más opciones</summary>' +
            '<div class="more-actions-menu">' +
              '<button type="button" class="btn-toggle-exclusive ' + (p.exclusive_enabled ? 'is-on' : '') + '">' + (p.exclusive_enabled ? 'Quitar Exclusiva' : 'Habilitar Exclusiva') + '</button>' +
              '<button type="button" class="btn-toggle-producer btn-active-prod ' + (p.active ? 'is-active' : '') + '">' + (p.active ? 'Desactivar' : 'Activar') + '</button>' +
              '<button type="button" class="btn-toggle-producer btn-identidad-prod">' + (p.identidad_verificada_at ? 'Quitar identidad verificada' : 'Marcar identidad verificada') + '</button>' +
              '<button type="button" class="btn-toggle-producer btn-pass-prod">Nueva contraseña</button>' +
              '<button type="button" class="btn-delete">Eliminar</button>' +
            '</div>' +
          '</details>' +
        '</div>' +
        '<div class="prod-movs" hidden></div>';

      item.querySelector('.btn-movs-prod').addEventListener('click', async (ev) => {
        const box = item.querySelector('.prod-movs');
        if (!box.hidden) { box.hidden = true; ev.target.textContent = 'Movimientos'; return; }
        ev.target.disabled = true;
        const listo = await pintarMovsProductor(box, p);
        ev.target.disabled = false;
        if (!listo) return;
        box.hidden = false;
        ev.target.textContent = 'Ocultar movimientos';
      });

      const telProd = soloDigitos(p.contact_phone);
      const apr = item.querySelector('.btn-approve-prod');
      if (apr) apr.addEventListener('click', async () => {
        apr.disabled = true;
        const r = await fetch('/api/admin/producers/' + p.id + '/approve', { method: 'POST' });
        if (!r.ok) { if (r.status !== 401) showToast('No se pudo aprobar.', true); apr.disabled = false; return; }
        showToast('Productor aprobado. Ya puede entrar y subir beats.');
        if (telProd) {
          // se avisa con un toque para que el navegador no bloquee WhatsApp
          apr.outerHTML = '<a class="btn-whatsapp-order btn-wa-aprobado" href="https://wa.me/' + telProd + '?text=' +
            encodeURIComponent('Hola ' + p.name + ' \u{1F44B} Tu cuenta de productor en Zona Beats ya está aprobada. Entra en ' + location.origin + '/productores para publicar tus beats.') +
            '" target="_blank" rel="noopener">Avisarle por WhatsApp</a>';
          const wa = item.querySelector('.btn-wa-aprobado');
          wa.addEventListener('click', () => setTimeout(loadProducers, 800));
        } else {
          loadProducers();
        }
        loadSummary();
      });

      item.querySelector('.btn-identidad-prod').addEventListener('click', async () => {
        const marcar = !p.identidad_verificada_at;
        if (marcar && !confirm('¿Marcar a ' + p.name + ' con «Identidad verificada»?\n\nConfírmalo solo tras verificar su documento de identidad.')) return;
        const r = await fetch('/api/admin/producers/' + p.id + '/identidad', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verificada: marcar }),
        });
        if (r.ok) { showToast(marcar ? 'Identidad verificada.' : 'Se quitó la insignia.'); loadProducers(); }
        else if (r.status !== 401) showToast('No se pudo cambiar.', true);
      });

      item.querySelector('.btn-pass-prod').addEventListener('click', async () => {
        const nueva = prompt('Nueva contraseña para ' + p.name + ' (mínimo 6 caracteres).', '');
        if (nueva === null) return;
        if (nueva.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres.', true); return; }
        const r = await fetch('/api/admin/producers/' + p.id + '/password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: nueva }),
        });
        if (r.ok) {
          showToast('Contraseña cambiada.');
          if (telProd && confirm('¿Mandársela por WhatsApp ahora?')) {
            window.open('https://wa.me/' + telProd + '?text=' + encodeURIComponent('Hola ' + p.name + ', tu nueva contraseña del portal de productores de Zona Beats es: ' + nueva + '\nEntra en ' + location.origin + '/productores y cámbiala en tu Perfil.'), '_blank', 'noopener');
          }
        } else if (r.status !== 401) {
          const e2 = await r.json().catch(() => ({}));
          showToast(e2.error || 'No se pudo cambiar la contraseña.', true);
        }
      });

      item.querySelector('.btn-save-plan').addEventListener('click', async () => {
        const plan = item.querySelector('.plan-select').value;
        const paidUntil = item.querySelector('.plan-until').value;
        if (plan !== 'free' && !paidUntil) {
          showToast('Ponle hasta qué fecha tiene pagado el plan.', true);
          return;
        }
        const r = await fetch('/api/admin/producers/' + p.id + '/plan', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan, paidUntil }),
        });
        showToast(r.ok ? 'Plan actualizado.' : 'No se pudo guardar el plan.', !r.ok);
        loadProducers();
      });

      item.querySelector('.btn-toggle-exclusive').addEventListener('click', async () => {
        const r = await fetch('/api/admin/producers/' + p.id + '/toggle-exclusive', { method: 'POST' });
        if (r.ok) { const d = await r.json(); showToast(d.exclusiveEnabled ? 'Exclusiva habilitada.' : 'Exclusiva quitada.'); loadProducers(); }
        else showToast('No se pudo cambiar.', true);
      });

      item.querySelector('.btn-active-prod').addEventListener('click', async () => {
        const r = await fetch('/api/admin/producers/' + p.id + '/toggle', { method: 'POST' });
        if (r.ok) { showToast(p.active ? 'Productor desactivado.' : 'Productor activado.'); loadProducers(); }
        else showToast('No se pudo cambiar el estado.', true);
      });

      item.querySelector('.btn-delete').addEventListener('click', async () => {
        const deuda = Number(p.pendingPayoutCup || 0);
        const pend = Number(p.pendingOrders || 0);
        if (!confirm('¿Eliminar a ' + p.name + '?\n\nSe eliminarán sus beats y archivos; las licencias vendidas se conservan. Esta acción es definitiva.' +
          (pend > 0 ? '\n\nOJO: tiene ' + pend + ' compra(s) pendiente(s), que se rechazarán y deberán reembolsarse.' : '') +
          (deuda > 0 ? '\n\nATENCIÓN: todavía le debes ' + deuda.toLocaleString('es') + ' CUP pendientes de pago.' : ''))) return;
        const r = await fetch('/api/admin/producers/' + p.id, { method: 'DELETE' });
        if (r.ok) {
          const d = await r.json();
          showToast('Productor eliminado (' + d.tracksEliminados + ' beats borrados, ' + d.ventasConservadas + ' ventas conservadas).' +
            (d.comprasPendientes > 0 ? ' Se rechazaron ' + d.comprasPendientes + ' compra(s) pendientes.' : '') +
            (d.deudaPendienteCup > 0 ? ' Ojo: le quedaban ' + d.deudaPendienteCup + ' CUP sin pagar.' : ''));
          loadProducers(); loadTracks(); loadPayouts(); loadPlanRequests(); loadOrders(); loadHistory(); loadSummary();
        } else {
          const e = await r.json().catch(() => ({}));
          showToast(e.error || 'No se pudo eliminar.', true);
        }
      });

      producersList.appendChild(item);
    });
  }

  createProducerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('producer-name-input').value.trim();
    const email = document.getElementById('producer-email-input').value.trim();
    const password = document.getElementById('producer-password-input').value;
    const phone = document.getElementById('producer-phone-input').value.trim();

    const res = await fetch('/api/admin/producers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, phone }),
    });

    if (res.ok) {
      showToast('Productor creado.');
      createProducerForm.reset();
      loadProducers();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'No se pudo crear el productor.', true);
    }
  });

  const pendingTracksList = document.getElementById('pending-tracks-list');
  const pendingTracksCount = document.getElementById('pending-tracks-count');

  // refresco automático: no se repinta si el admin está escribiendo un motivo
  function loadPendingTracksAuto() {
    if ([...document.querySelectorAll('.forzar-motivo')].some(i => i.value.trim() || i === document.activeElement)) {
      clearTimeout(origTimer); origTimer = setTimeout(loadPendingTracksAuto, 5000); return;
    }
    loadPendingTracks();
  }
  async function loadPendingTracks() {
    const res = await fetch('/api/admin/pending-tracks');
    if (!res.ok) return;
    const { tracks, servicioExterno } = await res.json();
    servicioExternoActivo = Boolean(servicioExterno);
    renderPendingTracks(tracks);
    // mientras haya verificaciones en curso se refresca solo
    clearTimeout(origTimer);
    if (tracks.some(t => t.originalidad && t.originalidad.estado === 'pendiente')) origTimer = setTimeout(loadPendingTracksAuto, 5000);
  }
  let servicioExternoActivo = false;
  let origTimer = null;

  function bloqueOriginalidad(t) {
    const o = t.originalidad || { estado: 'pendiente' };
    const declarado = t.prelanzado
      ? '<div class="orig-decl warn">Publicado antes en: <strong>' + escapeHtml(t.prelanzado) + '</strong></div>'
      : (t.authorship_declared_at ? '<div class="orig-decl">Declarado inédito y sin Content ID.</div>' : '');
    const sinExterno = servicioExternoActivo ? '' : '<div class="orig-decl muted">Verificado solo contra el catálogo de la tienda.</div>';
    let cuerpo;
    if (o.estado === 'pendiente') cuerpo = '<div class="orig-estado proc">Verificando originalidad…</div>';
    else if (o.estado === 'error') cuerpo = '<div class="orig-estado warn">La verificación falló' + (o.error ? ': ' + escapeHtml(o.error) : '') + '.</div>';
    else if (o.estado === 'limpio') cuerpo = '<div class="orig-estado ok">✓ Sin coincidencias' + (o.servicio ? ' (catálogo de la tienda y ' + escapeHtml(o.servicio) + ')' : ' en el catálogo de la tienda') + (o.error ? ' · ' + escapeHtml(o.error) : '') + '</div>';
    else {
      const filas = (o.internas || []).map(x => '<li>Se parece un <strong>' + x.similitud + ' %</strong> (' + x.segundos + ' s) a «' + escapeHtml(x.titulo) + '» de ' + escapeHtml(x.productor) + (x.mismoProductor ? ' (del mismo productor)' : '') + '</li>')
        .concat((o.externas || []).map(x => '<li>Coincide con «' + escapeHtml(x.titulo) + '» de <strong>' + escapeHtml(x.artista) + '</strong>' + (x.sello ? ' · ' + escapeHtml(x.sello) : '') + (x.fecha ? ' · ' + escapeHtml(x.fecha) : '') + ' · en el segundo ' + x.segundo + (x.enlace ? ' · <a href="' + escapeHtml(x.enlace) + '" target="_blank" rel="noopener">escuchar</a>' : '') + '</li>'));
      cuerpo = '<div class="orig-estado warn">Coincidencias encontradas</div><ul class="orig-lista">' + filas.join('') + '</ul>';
    }
    const reverif = o.estado === 'pendiente' ? '' : '<button type="button" class="btn-secondary btn-reverif">Verificar de nuevo</button>';
    return '<div class="orig-box"><div class="orig-title">Originalidad / Content ID</div>' + cuerpo + declarado + sinExterno + reverif + '</div>';
  }

  function renderPendingTracks(tracks) {
    pendingTracksList.innerHTML = '';
    pendingTracksCount.textContent = tracks.length || '';
    actualizarNav('productores', 'beats', tracks.length);
    pendingTracksCount.classList.toggle('show', tracks.length > 0);

    if (!tracks.length) {
      pendingTracksList.innerHTML = '<div class="empty-hint">No hay beats pendientes.</div>';
      return;
    }

    tracks.forEach((t) => {
      const item = document.createElement('div');
      item.className = 'pending-track-item';
      const coverSrc = t.cover_filename ? `/api/cover/${t.id}?s=160` : '';
      const a = t.archivos || {};
      const fileLink = (f, txt) => `<a class="file-badge" href="/api/admin/tracks/${t.id}/file?f=${f}" target="_blank" rel="noopener">${txt} ↓</a>`;
      const archivos = t.is_playlist ? '' :
        '<div class="file-badges">' + fileLink('mp3', 'MP3') + (a.wav ? fileLink('wav', 'WAV') : '<span class="file-badge missing">sin WAV</span>') +
        (a.stems ? fileLink('stems', 'STEMS') : '<span class="file-badge missing">sin STEMS</span>') + '</div>';
      const licencias = (t.licenses || []).map(l => (LIC_NOMBRES[l.license_type] || l.license_type) + ' ' + Number(l.price_cup).toLocaleString('es') + ' CUP').join(' · ');
      item.innerHTML = `
        ${coverSrc ? `<img src="${coverSrc}" alt="" loading="lazy">` : `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'/%3E" alt="">`}
        <div class="info">
          <div class="t">${escapeHtml(t.title)}${t.is_playlist ? ' <span class="tag-pending">Playlist</span>' : ''}</div>
          <div class="m">${escapeHtml(t.genre || 'Sin género')}${licencias ? ' · ' + escapeHtml(licencias) : ''}</div>
          <div class="producer">${escapeHtml(t.producer_name || 'Sin productor')} · plan ${escapeHtml(PLAN_INFO[t.producer_plan] ? PLAN_INFO[t.producer_plan].label : (t.producer_plan || 'Free'))} · ${escapeHtml(t.producer_email || '')}</div>
          ${t.description ? `<div class="m desc">${escapeHtml(t.description)}</div>` : ''}
          ${archivos}
          ${t.is_playlist ? '' : bloqueOriginalidad(t)}
          <div class="forzar-box" hidden>
            <label>Hay coincidencias. Si igual lo publicas, escribe por qué (queda en el registro del productor):
              <input type="text" class="forzar-motivo" maxlength="300" placeholder="Ej: el productor mostró el proyecto original; el otro beat es suyo">
            </label>
            <button type="button" class="btn-forzar">Publicar igual</button>
          </div>
        </div>
        <audio controls preload="none" src="/api/admin/preview-audio/${t.id}"></audio>
        <div class="actions">
          <button type="button" class="btn-approve-order btn-approve-track">Aprobar</button>
          <button type="button" class="btn-reject-track">Rechazar</button>
        </div>
      `;
      const aprobar = async (boton, cuerpo) => {
        boton.disabled = true;
        const viejo = boton.textContent;
        boton.textContent = 'Verificando…';
        const res = await fetch(`/api/admin/tracks/${t.id}/approve`, cuerpo
          ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }
          : { method: 'POST' });
        boton.textContent = viejo;
        if (res.ok) {
          showToast('Beat aprobado, ya está visible en la tienda.');
          loadPendingTracks(); loadTracks(); loadSummary();
          return;
        }
        boton.disabled = false;
        if (res.status === 401) return;
        const e2 = await res.json().catch(() => ({}));
        showToast(e2.error || 'No se pudo aprobar.', true);
        if (e2.verificacion === 'coincidencias') {
          const box = item.querySelector('.forzar-box');
          box.hidden = false;
          box.querySelector('.forzar-motivo').focus();
        }
        if (e2.verificacion === 'pendiente' || e2.verificacion === 'error') loadPendingTracksPronto();
      };
      item.querySelector('.btn-approve-track').addEventListener('click', (ev) => aprobar(ev.target));
      item.querySelector('.btn-forzar').addEventListener('click', (ev) => {
        const motivo = item.querySelector('.forzar-motivo').value.trim();
        if (motivo.length < 10) { showToast('Escribe el motivo (mínimo 10 caracteres).', true); return; }
        aprobar(ev.target, { forzar: true, motivo });
      });
      const rv = item.querySelector('.btn-reverif');
      if (rv) rv.addEventListener('click', async () => {
        rv.disabled = true;
        const r = await fetch(`/api/admin/tracks/${t.id}/originalidad`, { method: 'POST' });
        if (r.ok) { showToast('Verificando de nuevo…'); loadPendingTracks(); }
        else { rv.disabled = false; if (r.status !== 401) showToast('No se pudo iniciar la verificación.', true); }
      });
      item.querySelector('.btn-reject-track').addEventListener('click', async () => {
        const reason = prompt(`¿Por qué rechazas "${t.title}"?`, '');
        if (reason === null) return;
        const res = await fetch(`/api/admin/tracks/${t.id}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        });
        if (res.ok) {
          showToast('Beat rechazado.');
          loadPendingTracks(); loadSummary();
        } else if (res.status !== 401) {
          showToast('No se pudo rechazar.', true);
        }
      });
      pendingTracksList.appendChild(item);
    });
  }

  function loadPendingTracksPronto() { clearTimeout(origTimer); origTimer = setTimeout(loadPendingTracksAuto, 1500); }

  const platformForm = document.getElementById('platform-config-form');
  const adminPhoneInput = document.getElementById('admin-phone-input');
  const planProPriceInput = document.getElementById('plan-pro-price-input');
  const planStudioPriceInput = document.getElementById('plan-studio-price-input');
  let usdRateAdmin = 0;

  function pintarCupPlanes() {
    const n = (v) => parseFloat(String(v || '').replace(',', '.')) || 0;
    const txt = (usd) => usdRateAdmin
      ? '≈ ' + Math.round(usd * usdRateAdmin).toLocaleString('es') + ' CUP/mes con tu tasa (1 USD = ' + usdRateAdmin.toLocaleString('es') + ' CUP)'
      : 'Falta la tasa del USD para mostrar el precio en CUP.';
    document.getElementById('plan-pro-cup').textContent = txt(n(planProPriceInput.value));
    document.getElementById('plan-studio-cup').textContent = txt(n(planStudioPriceInput.value));
  }
  [planProPriceInput, planStudioPriceInput].forEach(el => el.addEventListener('input', pintarCupPlanes));

  let payoutRatesCfg = {};
  function pintarTasasRetiro() {
    const cont = document.getElementById('payout-rates-list');
    const monedas = configuredCurrencies.filter(c => c.code !== 'CUP');
    cont.innerHTML = monedas.map(c => {
      const v = payoutRatesCfg[c.code] || {};
      return '<div class="payout-rate-row" data-code="' + escapeHtml(c.code) + '">' +
        '<div class="rate-row-label">' + escapeHtml(c.label) + '</div>' +
        '<label class="mini-field"><span class="sr-only">Fee de red en ' + escapeHtml(c.label) + '</span><input type="text" class="pr-fee" inputmode="decimal" placeholder="0" value="' + (v.fee || '') + '"></label>' +
      '</div>';
    }).join('') || '<div class="empty-hint">Sin monedas configuradas.</div>';
  }

  async function loadCommission() {
    const res = await fetch('/api/admin/platform-config');
    if (!res.ok) return;
    const d = await res.json();
    adminPhoneInput.value = d.adminPhone || '';
    planProPriceInput.value = d.planPriceProUsd || '';
    planStudioPriceInput.value = d.planPriceStudioUsd || '';
    usdRateAdmin = d.usdRate || 0;
    document.getElementById('likes-per-bonus').value = d.likesPerBonus;
    document.getElementById('likes-bonus-cup').value = d.likesBonusCup;
    document.getElementById('referrals-per-bonus').value = d.referralsPerBonus;
    document.getElementById('referral-min-sales').value = d.referralMinSalesCup != null ? d.referralMinSalesCup : 500;
    document.getElementById('referral-min-beats').value = d.referralMinBeats != null ? d.referralMinBeats : 3;
    document.getElementById('referral-bonus-cup').value = d.referralBonusCup;
    payoutRatesCfg = d.payoutRates || {};
    for (const k of ['free', 'pro', 'studio']) document.getElementById('payout-days-' + k).value = (d.payoutDays && d.payoutDays[k]) || '';
    pintarCupPlanes();
    pintarTasasRetiro();
  }

  platformForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payoutRates = {};
    document.querySelectorAll('.payout-rate-row').forEach(r => {
      payoutRates[r.dataset.code] = { fee: r.querySelector('.pr-fee').value.trim() };
    });
    const res = await fetch('/api/admin/platform-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminPhone: adminPhoneInput.value,
        planPriceProUsd: planProPriceInput.value,
        planPriceStudioUsd: planStudioPriceInput.value,
        likesPerBonus: document.getElementById('likes-per-bonus').value,
        likesBonusCup: document.getElementById('likes-bonus-cup').value,
        referralsPerBonus: document.getElementById('referrals-per-bonus').value,
        referralMinSalesCup: document.getElementById('referral-min-sales').value.trim() || '0',
        referralMinBeats: document.getElementById('referral-min-beats').value.trim() || '0',
        referralBonusCup: document.getElementById('referral-bonus-cup').value,
        payoutRates,
        payoutDays: Object.fromEntries(['free', 'pro', 'studio'].map(k => [k, document.getElementById('payout-days-' + k).value.trim()])),
      }),
    });
    if (res.ok) { showToast('Configuración de planes, bonos y retiros guardada.'); loadCommission(); }
    else { const e2 = await res.json().catch(() => ({})); showToast(e2.error || 'No se pudo guardar.', true); }
  });

  // ---------- Movimientos de un productor (desde Productores) ----------
  const MOV_TIPOS_ADMIN = { venta: 'Venta', bono: 'Bono', plan: 'Plan', retiro: 'Retiro', hot: 'Hot' };
  async function pintarMovsProductor(box, p) {
    const r = await fetch('/api/admin/producers/' + p.id + '/movimientos');
    if (!r.ok) { showToast('No se pudieron cargar los movimientos.', true); return false; }
    const d = await r.json();
    box._movs = d.movimientos;
    const saldo = (d.billeteras || []).length ? d.billeteras.map(b => escapeHtml(unidades(b.unidades, b.code))).join(' · ') : '0 CUP';
    box.innerHTML = '<div class="prod-movs-head">Saldo actual: <strong>' + saldo + '</strong></div>' +
      '<div class="hist-tools">' +
        '<button type="button" class="hist-btn hist-download"' + (d.movimientos.length ? '' : ' disabled') + '>⭳ Descargar</button>' +
        '<button type="button" class="hist-btn danger hist-clear"' + (d.movimientos.some(m => m.borrable) ? '' : ' disabled') + '>Borrar historial</button>' +
        (d.ocultos ? '<button type="button" class="hist-btn hist-restore">Restaurar borrados (' + d.ocultos + ')</button>' : '') +
      '</div>' +
      (d.movimientos.length ? '<ul>' + d.movimientos.slice(0, 200).map(m =>
        '<li class="hist-item"><span class="muted">' + fechaHora(m.fecha) + '</span> · ' + escapeHtml(m.titulo) +
        (m.estado ? ' <span class="muted">(' + escapeHtml(m.estado) + ')</span>' : '') +
        (m.unidades ? ' = <strong class="' + (m.unidades > 0 ? 'mv-in' : 'mv-out') + '">' + (m.unidades > 0 ? '+' : '−') + escapeHtml(unidades(Math.abs(m.unidades), m.moneda)) + '</strong>' : '') +
        (m.detalle ? '<div class="muted small">' + escapeHtml(m.detalle) + '</div>' : '') +
        (m.borrable ? botonBorrarHist(m.clave) : '') + '</li>').join('') + '</ul>'
        : '<div class="empty-hint">Sin movimientos' + (d.ocultos ? ' a la vista.' : ' todavía.') + '</div>');
    if (!box._conectado) {
      box._conectado = true;
      const qs = '?productor=' + p.id;
      box.addEventListener('click', async (e) => {
        const del = e.target.closest('.hist-del');
        if (del) {
          del.disabled = true;
          const r2 = await cambiarHistorialAdmin('movs', { accion: 'ocultar', claves: [del.dataset.clave] }, qs);
          if (r2) { showToast('Se borró del historial. El saldo no cambia.'); pintarMovsProductor(box, p); } else del.disabled = false;
          return;
        }
        if (e.target.closest('.hist-clear')) {
          const claves = (box._movs || []).filter(m => m.borrable).map(m => m.clave);
          if (!claves.length || !confirm('¿Borrar ' + claves.length + ' movimientos de ' + p.name + ' de este historial?\n\nEl saldo del productor no cambia.')) return;
          const r2 = await cambiarHistorialAdmin('movs', { accion: 'ocultar', claves }, qs);
          if (r2) { showToast('Se borraron ' + r2.borrados + ' movimientos.'); pintarMovsProductor(box, p); }
          return;
        }
        if (e.target.closest('.hist-restore')) {
          const r2 = await cambiarHistorialAdmin('movs', { accion: 'restaurar' }, qs);
          if (r2) { showToast('Se restauraron ' + r2.restaurados + '.'); pintarMovsProductor(box, p); }
          return;
        }
        if (e.target.closest('.hist-download')) {
          const filas = box._movs || [];
          if (!filas.length) return;
          H.descargarCSV('movimientos-' + String(p.name || 'productor').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), [
            { titulo: 'Fecha y hora', valor: m => H.fechaHoraArchivo(m.fecha) },
            { titulo: 'Tipo', valor: m => MOV_TIPOS_ADMIN[m.tipo] || m.tipo },
            { titulo: 'Concepto', valor: m => m.titulo },
            { titulo: 'Detalle', valor: m => m.detalle },
            { titulo: 'Monto', valor: m => H.numero(m.unidades || 0, ZBUI.decimales(m.moneda)) },
            { titulo: 'Moneda', valor: m => m.label || m.moneda },
            { titulo: 'Estado', valor: m => m.estado || 'hecho' },
          ], filas);
          showToast('Historial descargado (se abre con Excel).');
        }
      });
    }
    return true;
  }

  // ---------- Historiales: borrar, restaurar y descargar ----------
  const H = window.ZBHistorial;
  const fechaHora = (f) => H.fechaHora(f);
  const botonBorrarHist = (clave) => '<button type="button" class="hist-del" data-clave="' + escapeHtml(clave) + '" title="Borrar del historial" aria-label="Borrar del historial">×</button>';
  const toolsHist = (k) => document.querySelector('.hist-tools[data-hist="' + k + '"]');
  function pintarToolsHist(k, ocultos, borrables, filas) {
    const t = toolsHist(k);
    if (!t) return;
    const r = t.querySelector('.hist-restore');
    r.hidden = !ocultos;
    r.textContent = 'Restaurar borrados (' + ocultos + ')';
    t.querySelector('.hist-clear').disabled = !borrables;
    t.querySelector('.hist-download').disabled = !filas;
  }
  async function cambiarHistorialAdmin(lista, cuerpo, qs) {
    const res = await fetch('/api/admin/historial/' + lista + (qs || ''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { if (res.status !== 401) showToast(d.error || 'No se pudo cambiar el historial.', true); return null; }
    return d;
  }
  // Conecta la barra (Descargar / Borrar historial / Restaurar) y los botones × de una lista
  function conectarHistorial(k, cont, opciones) {
    const t = toolsHist(k);
    const recargar = opciones.recargar;
    cont.addEventListener('click', async (e) => {
      const b = e.target.closest('.hist-del');
      if (!b || !cont.contains(b)) return;
      b.disabled = true;
      const d = await cambiarHistorialAdmin(k, { accion: 'ocultar', claves: [b.dataset.clave] }, opciones.qs && opciones.qs());
      if (d) { showToast('Se borró del historial.'); recargar(); } else b.disabled = false;
    });
    t.querySelector('.hist-clear').addEventListener('click', async () => {
      const claves = opciones.borrables();
      if (!claves.length) return;
      if (!confirm('¿Borrar ' + claves.length + ' ' + opciones.nombre + ' del historial?\n\n' + opciones.aviso + '')) return;
      const d = await cambiarHistorialAdmin(k, { accion: 'ocultar', claves }, opciones.qs && opciones.qs());
      if (d) { showToast('Se borraron ' + d.borrados + ' del historial.'); recargar(); }
    });
    t.querySelector('.hist-restore').addEventListener('click', async () => {
      const d = await cambiarHistorialAdmin(k, { accion: 'restaurar' }, opciones.qs && opciones.qs());
      if (d) { showToast('Se restauraron ' + d.restaurados + '.'); recargar(); }
    });
    t.querySelector('.hist-download').addEventListener('click', () => {
      const filas = opciones.filas();
      if (!filas.length) return;
      H.descargarCSV(opciones.archivo, opciones.columnas, filas);
      showToast('Historial descargado (se abre con Excel).');
    });
  }
  const textoPlano = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

  const historyList = document.getElementById('history-list');
  const historyCount = document.getElementById('history-count');

  let historial = [];
  let historialVisible = [];
  let comprasOcultas = 0;
  const historySearch = document.getElementById('history-search');
  historySearch.addEventListener('input', () => renderHistory());

  async function loadHistory() {
    const res = await fetch('/api/admin/orders-history');
    if (!res.ok) return;
    const { orders, ocultos } = await res.json();
    historial = orders;
    comprasOcultas = ocultos || 0;
    const aprobadas = orders.filter(o => o.status === 'approved').length;
    historyCount.textContent = aprobadas || '';
    historyCount.classList.toggle('show', aprobadas > 0);
    renderHistory();
  }

  function renderHistory() {
    const q = historySearch.value.trim().toLowerCase();
    const lista = q ? historial.filter(o => [o.buyer_name, o.buyer_phone, o.track_title, o.certificate_id, o.producer_name]
      .some(v => String(v || '').toLowerCase().includes(q))) : historial;
    historialVisible = lista;
    pintarToolsHist('compras', comprasOcultas, lista.length, lista.length);
    historyList.innerHTML = '';
    if (!historial.length) {
      historyList.innerHTML = '<div class="empty-hint">Aún no hay ventas registradas.</div>';
      return;
    }
    if (!lista.length) {
      historyList.innerHTML = '<div class="empty-hint">Nada coincide con «' + escapeHtml(q) + '».</div>';
      return;
    }
    lista.slice(0, 300).forEach((o) => {
      const item = document.createElement('div');
      const rechazada = o.status === 'rejected';
      item.className = 'order-item' + (rechazada ? ' order-rejected' : '');
      const vendedor = o.producer_name ? ('Productor: ' + escapeHtml(o.producer_name)) : 'Tuyo';
      const wa = soloDigitos(o.buyer_phone);
      const linkCompra = !rechazada && o.buyer_token ? location.origin + '/?compra=' + o.buyer_token : '';
      const waText = encodeURIComponent(mensajeLinkCompra(o, linkCompra, o.certificate_id));
      const lic = LIC_NOMBRES[o.license_type] || o.license_type || '';
      item.innerHTML =
        (o.receipt_filename
          ? '<img class="receipt-thumb" src="/api/admin/orders/' + o.id + '/receipt" alt="" loading="lazy">'
          : (o.pago_metodo === 'qvapay' ? '<div class="receipt-thumb receipt-qvapay" aria-hidden="true">QvaPay</div>' : '<div class="receipt-thumb receipt-gone">sin foto</div>')) +
        '<div class="info">' +
          '<div class="buyer">' + escapeHtml(o.buyer_name) + (rechazada ? ' <span class="tag-vencido">rechazada</span>' : '') + (o.pago_metodo === 'qvapay' ? ' <span class="tag-verif">QvaPay</span>' : '') + '</div>' +
          '<div class="track">' + escapeHtml(o.track_title) + ' · <strong>' + escapeHtml(lic) + '</strong> · ' + escapeHtml(o.price_label || '') + '</div>' +
          '<div class="meta">' + escapeHtml(o.buyer_phone) + ' · ' + fechaHora(o.approved_at || o.rejected_at || o.created_at) + ' · ' + vendedor + escapeHtml(rechazada ? '' : paraProductor(o)) +
            (o.certificate_id ? ' · <span class="cert-line">Licencia <strong>' + escapeHtml(o.certificate_id) + '</strong></span>' : '') + '</div>' +
          (rechazada && o.reject_reason ? '<div class="meta">Motivo: ' + escapeHtml(o.reject_reason) + '</div>' : '') +
        '</div>' +
        '<div class="actions">' +
          (o.certificate_id ? '<a class="btn-whatsapp-order" href="/api/license/' + encodeURIComponent(o.certificate_id) + '/pdf" target="_blank" rel="noopener">PDF</a>' : '') +
          (wa && !rechazada ? '<a class="btn-toggle-producer" href="https://wa.me/' + wa + '?text=' + waText + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
          (linkCompra ? '<button type="button" class="btn-toggle-producer btn-copy-link">Copiar link</button>' : '') +
          (rechazada ? '<button type="button" class="btn-approve-order btn-approve-late">Aprobar igual</button>' : '') +
          (o.receipt_filename ? '<button type="button" class="btn-delete btn-del-photo">Borrar foto</button>' : '') +
        '</div>' + botonBorrarHist('orden:' + o.id);
      item.classList.add('hist-item');
      const cp = item.querySelector('.btn-copy-link');
      if (cp) cp.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(linkCompra); showToast('Enlace privado copiado.'); }
        catch { prompt('Copia este link y mándaselo al comprador:', linkCompra); }
      });
      const late = item.querySelector('.btn-approve-late');
      if (late) late.addEventListener('click', (ev) => {
        if (!confirm('¿Aprobar la compra de ' + o.buyer_name + ' pese a haberla rechazado?')) return;
        approveOrder(o, item, ev.target);
      });
      const delFoto = item.querySelector('.btn-del-photo');
      if (delFoto) delFoto.addEventListener('click', () => deleteOrder(o.id, o.buyer_name, o.certificate_id, rechazada));
      if (o.receipt_filename) {
        item.querySelector('.receipt-thumb').addEventListener('click', () => {
          receiptModalImg.src = '/api/admin/orders/' + o.id + '/receipt';
          receiptModalOverlay.classList.add('active');
        });
      }
      historyList.appendChild(item);
    });
    if (lista.length > 300) {
      const mas = document.createElement('div');
      mas.className = 'empty-hint';
      mas.textContent = 'Se muestran 300 de ' + lista.length + '. Usa el buscador para encontrar una compra.';
      historyList.appendChild(mas);
    }
  }

  conectarHistorial('compras', historyList, {
    recargar: () => loadHistory(),
    nombre: 'compras',
    aviso: 'Licencias, descargas y saldos no cambian.',
    borrables: () => historialVisible.map(o => 'orden:' + o.id),
    filas: () => historialVisible,
    archivo: 'historial-compras',
    columnas: [
      { titulo: 'Fecha y hora', valor: o => H.fechaHoraArchivo(o.approved_at || o.rejected_at || o.created_at) },
      { titulo: 'Estado', valor: o => o.status === 'approved' ? 'aprobada' : 'rechazada' },
      { titulo: 'Comprador', valor: o => o.buyer_name },
      { titulo: 'Teléfono', valor: o => o.buyer_phone },
      { titulo: 'Beat', valor: o => o.track_title },
      { titulo: 'Licencia', valor: o => LIC_NOMBRES[o.license_type] || o.license_type },
      { titulo: 'Precio', valor: o => o.price_label || '' },
      { titulo: 'Pagó', valor: o => o.paid_units != null ? H.numero(o.paid_units, ZBUI.decimales(o.wallet_currency || 'CUP')) + ' ' + etiquetaDe(o.wallet_currency || 'CUP') : '' },
      { titulo: 'Vendedor', valor: o => o.producer_name || 'Tuyo' },
      { titulo: 'Al productor', valor: o => o.producer_id && o.status === 'approved' ? textoPlano(paraProductor(o)).replace(/^\s*·\s*/, '') : '' },
      { titulo: 'N° de licencia', valor: o => o.certificate_id || '' },
      { titulo: 'Motivo del rechazo', valor: o => o.reject_reason || '' },
    ],
  });

  // ---------- Compras de planes (productores) ----------
  const planRequestsList = document.getElementById('plan-requests-list');
  const planRequestsCount = document.getElementById('plan-requests-count');
  const PLAN_NAMES = { pro: 'Pro', studio: 'Studio', free: 'Free' };
  let planesLista = [];
  const ESTADO_PLAN = { pending: 'por revisar', approved: 'aprobado', rejected: 'rechazado' };

  async function loadPlanRequests() {
    const res = await fetch('/api/admin/plan-requests');
    if (!res.ok) return;
    const { requests, ocultos } = await res.json();
    planesLista = requests;
    pintarToolsHist('planes', ocultos || 0, requests.some(r => r.status !== 'pending'), requests.length);
    const pend = requests.filter(r => r.status === 'pending');
    planRequestsCount.textContent = pend.length || '';
    actualizarNav('productores', 'planes', pend.length);
    planRequestsCount.classList.toggle('show', pend.length > 0);
    planRequestsList.innerHTML = '';
    if (!requests.length) {
      planRequestsList.innerHTML = '<div class="empty-hint">Aún no hay compras de planes.</div>';
      return;
    }
    requests.forEach((r) => {
      const item = document.createElement('div');
      item.className = 'order-item plan-request-item status-' + r.status;
      const wa = String(r.producer_phone || '').replace(/[^0-9]/g, '');
      const estado = r.status === 'pending' ? '<span class="tag-pending">por revisar</span>'
        : r.status === 'approved' ? '<span class="tag-ok">aprobado · hasta ' + escapeHtml(r.paid_until_result || '') + '</span>'
        : '<span class="tag-vencido">rechazado</span>' + (r.reject_reason ? ' — ' + escapeHtml(r.reject_reason) : '');
      item.innerHTML =
        (r.receipt_filename
          ? '<img class="receipt-thumb" src="/api/admin/plan-requests/' + r.id + '/receipt" alt="Comprobante">'
          : '<div class="receipt-thumb receipt-gone">sin foto</div>') +
        '<div class="info">' +
          '<div class="buyer">' + escapeHtml(r.producer_name || 'Productor eliminado') + '</div>' +
          '<div class="track">Plan <strong>' + (PLAN_NAMES[r.plan] || r.plan) + '</strong> · ' + r.months + (r.months === 1 ? ' mes' : ' meses') +
            ' · ' + Number(r.amount_cup).toLocaleString('es') + ' CUP' + (r.currency && r.currency !== 'CUP' ? ' (pagó en ' + escapeHtml(r.currency) + ')' : '') + '</div>' +
          '<div class="meta">' + escapeHtml(r.producer_email || '') + (r.producer_phone ? ' · ' + escapeHtml(r.producer_phone) : '') +
            ' · ' + fechaHora(r.created_at) + ' · plan actual: ' + (PLAN_NAMES[r.current_plan] || r.current_plan || '—') + '</div>' +
          '<div class="meta">' + estado + '</div>' +
        '</div>' +
        '<div class="actions">' +
          (r.status === 'pending'
            ? '<button type="button" class="btn-approve-order btn-approve-plan">Aprobar y activar</button>' +
              '<button type="button" class="btn-reject-track btn-reject-plan">Rechazar</button>'
            : '') +
          (wa ? '<a class="btn-toggle-producer" href="https://wa.me/' + wa + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
        '</div>' + (r.status !== 'pending' ? botonBorrarHist('plan:' + r.id) : '');
      item.classList.add('hist-item');
      const thumb = item.querySelector('img.receipt-thumb');
      if (thumb) thumb.addEventListener('click', () => {
        receiptModalImg.src = '/api/admin/plan-requests/' + r.id + '/receipt';
        receiptModalOverlay.classList.add('active');
      });
      const ap = item.querySelector('.btn-approve-plan');
      if (ap) ap.addEventListener('click', async () => {
        if (!confirm('¿Confirmas que recibiste ' + Number(r.amount_cup).toLocaleString('es') + ' CUP de ' + r.producer_name + '? Se activará el plan ' + (PLAN_NAMES[r.plan] || r.plan) + ' por ' + r.months + ' mes(es).')) return;
        ap.disabled = true;
        const res2 = await fetch('/api/admin/plan-requests/' + r.id + '/approve', { method: 'POST' });
        if (res2.ok) {
          const d = await res2.json();
          showToast('Plan ' + (PLAN_NAMES[d.plan] || d.plan) + ' activo hasta ' + d.paidUntil + (d.extendido ? ' (se sumó a lo que ya tenía).' : '.'));
          loadPlanRequests(); loadProducers(); loadPayouts();
        } else {
          const e2 = await res2.json().catch(() => ({}));
          showToast(e2.error || 'No se pudo aprobar.', true);
          ap.disabled = false;
        }
      });
      const rj = item.querySelector('.btn-reject-plan');
      if (rj) rj.addEventListener('click', async () => {
        const reason = prompt('Motivo del rechazo:');
        if (reason === null) return;
        const res2 = await fetch('/api/admin/plan-requests/' + r.id + '/reject', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
        });
        showToast(res2.ok ? 'Compra de plan rechazada.' : 'No se pudo rechazar.', !res2.ok);
        loadPlanRequests();
      });
      planRequestsList.appendChild(item);
    });
  }

  // ---------- Retiros de productores ----------
  const payoutsList = document.getElementById('payouts-list');
  const payoutsCount = document.getElementById('payouts-count');
  const payoutsHistory = document.getElementById('payouts-history');
  const fmtCup = (n) => Number(n || 0).toLocaleString('es', { maximumFractionDigits: 2 }) + ' CUP';
  const fmtN = (n, d) => Number(n || 0).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });
  let retirosTimer = null;

  conectarHistorial('planes', planRequestsList, {
    recargar: () => loadPlanRequests(),
    nombre: 'compras de planes',
    aviso: 'Los planes activos no cambian.',
    borrables: () => planesLista.filter(r => r.status !== 'pending').map(r => 'plan:' + r.id),
    filas: () => planesLista,
    archivo: 'historial-planes',
    columnas: [
      { titulo: 'Fecha y hora', valor: r => H.fechaHoraArchivo(r.created_at) },
      { titulo: 'Productor', valor: r => r.producer_name || 'Productor eliminado' },
      { titulo: 'Correo', valor: r => r.producer_email || '' },
      { titulo: 'Plan', valor: r => PLAN_NAMES[r.plan] || r.plan },
      { titulo: 'Meses', valor: r => r.months },
      { titulo: 'Monto CUP', valor: r => H.numero(r.amount_cup, 0) },
      { titulo: 'Pagó con', valor: r => r.currency || 'CUP' },
      { titulo: 'Estado', valor: r => ESTADO_PLAN[r.status] || r.status },
      { titulo: 'Activo hasta', valor: r => r.paid_until_result || '' },
      { titulo: 'Motivo del rechazo', valor: r => r.reject_reason || '' },
    ],
  });

  // ---------- Hots ----------
  const semTxt = (w) => w + (w === 1 ? ' semana' : ' semanas');
  // ---------- Denuncias de derechos de autor ----------
  async function loadDenuncias() {
    const res = await fetch('/api/admin/denuncias');
    if (!res.ok) return;
    const d = await res.json();
    const cont = document.getElementById('denuncias-list');
    document.getElementById('denuncias-count').textContent = d.pendientes ? d.pendientes + ' sin resolver' : '';
    actualizarNav('productores', 'denuncias', d.pendientes);
    if (!d.denuncias.length) { cont.innerHTML = '<div class="empty-hint">No hay denuncias.</div>'; return; }
    cont.innerHTML = d.denuncias.map(r => `
      <div class="denuncia-item ${r.status === 'pending' ? '' : 'resuelta'}">
        <div class="denuncia-head">
          <strong>${escapeHtml(r.beat)}</strong>
          <span class="denuncia-estado">${r.status === 'pending' ? 'Sin resolver' : 'Resuelta'}</span>
        </div>
        <div class="denuncia-meta">${escapeHtml(r.motivoTexto)} · ${fechaHora(r.created_at)}</div>
        <p class="denuncia-detalle">${escapeHtml(r.detalle)}</p>
        <div class="denuncia-meta">Denuncia: <strong>${escapeHtml(r.nombre)}</strong> · ${escapeHtml(r.contacto)}</div>
        <div class="denuncia-actions">
          <button type="button" class="btn-secondary" data-den-res="${r.id}">${r.status === 'pending' ? 'Marcar resuelta' : 'Volver a abrir'}</button>
          <button type="button" class="btn-delete" data-den-del="${r.id}">Borrar</button>
        </div>
      </div>`).join('');
    cont.querySelectorAll('[data-den-res]').forEach(b => b.addEventListener('click', async () => {
      await fetch('/api/admin/denuncias/' + b.dataset.denRes + '/resolver', { method: 'POST' });
      loadDenuncias();
    }));
    cont.querySelectorAll('[data-den-del]').forEach(b => b.addEventListener('click', async () => {
      if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.textContent = '¿Seguro? Pulsa otra vez'; return; }
      await fetch('/api/admin/denuncias/' + b.dataset.denDel, { method: 'DELETE' });
      loadDenuncias();
    }));
  }

  // ---------- Reclamos de Content ID ----------
  async function loadReclamosCid() {
    const res = await fetch('/api/admin/reclamos-cid');
    if (!res.ok) return;
    const d = await res.json();
    const cont = document.getElementById('cid-list');
    document.getElementById('cid-count').textContent = d.abiertos ? d.abiertos + ' abierto' + (d.abiertos > 1 ? 's' : '') : '';
    actualizarNav('productores', 'contentid', d.abiertos);
    if (!d.reclamos.length) { cont.innerHTML = '<div class="empty-hint">Sin reclamos de Content ID.</div>'; return; }
    const wa = (tel, txt) => { const n = soloDigitos(tel); return n ? '<a class="wa-link" href="https://wa.me/' + n + '?text=' + encodeURIComponent(txt) + '" target="_blank" rel="noopener">WhatsApp</a>' : ''; };
    cont.innerHTML = d.reclamos.map(r => `
      <div class="denuncia-item cid-item ${r.estado === 'abierto' ? '' : 'resuelta'}" data-id="${r.id}">
        <div class="denuncia-head">
          <strong>${escapeHtml(r.track_title)}</strong>
          <span class="denuncia-estado">${r.estado === 'abierto' ? 'Abierto' : 'Resuelto'}</span>
        </div>
        <div class="denuncia-meta">${escapeHtml(r.plataforma)} · reclama <strong>${escapeHtml(r.reclamante)}</strong> · ${fechaHora(r.created_at)}</div>
        ${r.detalle ? `<p class="denuncia-detalle">${escapeHtml(r.detalle)}</p>` : ''}
        ${r.enlace ? `<div class="denuncia-meta">Enlace: <a href="${escapeHtml(/^https?:\/\//i.test(r.enlace) ? r.enlace : 'https://' + r.enlace)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.enlace)}</a></div>` : ''}
        <div class="denuncia-meta">Comprador: <strong>${escapeHtml(r.buyer_name || '')}</strong> · ${escapeHtml(r.licencia || '')} · licencia ${escapeHtml(r.certificate_id || '')} ${wa(r.buyer_phone, 'Hola, sobre tu reclamo de Content ID de «' + r.track_title + '» en Zona Beats:')}</div>
        <div class="denuncia-meta">Productor: <strong>${escapeHtml(r.productor || '')}</strong> ${wa(r.producer_phone, 'Hola, un comprador con licencia de «' + r.track_title + '» recibió un reclamo de Content ID de «' + r.reclamante + '» en ' + r.plataforma + '. Si el reclamo es tuyo o de tu distribuidora, libéralo por favor: la licencia es ' + (r.certificate_id || '') + '.')}</div>
        ${r.estado === 'abierto'
          ? `<div class="cid-resolver"><label>Resolución<input type="text" class="cid-nota" maxlength="300" placeholder="Ej: reclamo liberado el 12/10"></label><button type="button" class="btn-approve-order cid-ok">Marcar resuelto</button></div>`
          : `<div class="denuncia-meta">Resuelto ${fechaHora(r.resuelto_at)}: ${escapeHtml(r.nota || '')}</div>`}
      </div>`).join('');
    cont.querySelectorAll('.cid-ok').forEach(b => b.addEventListener('click', async () => {
      const it = b.closest('.cid-item');
      const nota = it.querySelector('.cid-nota').value.trim();
      if (nota.length < 5) { showToast('Escribe cómo se resolvió.', true); return; }
      b.disabled = true;
      const r = await fetch('/api/admin/reclamos-cid/' + it.dataset.id + '/resolver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nota }) });
      const e = await r.json().catch(() => ({}));
      b.disabled = false;
      if (!r.ok) { if (r.status !== 401) showToast(e.error || 'No se pudo guardar.', true); return; }
      showToast('Reclamo cerrado. El comprador ya lo ve.');
      loadReclamosCid(); loadSummary();
    }));
  }

  // ---------- Reseñas ----------
  async function loadResenasAdmin() {
    const res = await fetch('/api/admin/resenas');
    if (!res.ok) return;
    const d = await res.json();
    const cont = document.getElementById('resenas-list');
    document.getElementById('resenas-count').textContent = d.resenas.length || '';
    if (!d.resenas.length) { cont.innerHTML = '<div class="empty-hint">Aún no hay reseñas.</div>'; return; }
    cont.innerHTML = d.resenas.map(r => `
      <div class="denuncia-item rev-item ${r.oculta ? 'resuelta' : ''}" data-id="${r.id}">
        <div class="denuncia-head">
          <strong><span class="rev-stars" aria-label="${r.estrellas} de 5 estrellas">${'★'.repeat(r.estrellas)}${'☆'.repeat(5 - r.estrellas)}</span> ${escapeHtml(r.titulo || '')}</strong>
          <span class="denuncia-estado">${r.oculta ? 'Oculta' : 'Visible'}</span>
        </div>
        <div class="denuncia-meta">${escapeHtml(r.comprador || r.nombre)} · de ${escapeHtml(r.productor || '')} · ${fechaHora(r.fecha)}</div>
        ${r.texto ? `<p class="denuncia-detalle">${escapeHtml(r.texto)}</p>` : ''}
        ${r.respuesta ? `<div class="denuncia-meta">Respuesta del productor: ${escapeHtml(r.respuesta)}</div>` : ''}
        ${r.oculta ? `<div class="denuncia-meta">Motivo: ${escapeHtml(r.motivo || '')}</div>` : ''}
        <div class="denuncia-actions">
          ${r.oculta
            ? '<button type="button" class="btn-secondary rev-mostrar">Volver a mostrar</button>'
            : '<input type="text" class="rev-motivo" maxlength="200" aria-label="Motivo para ocultar" placeholder="Motivo (insultos, datos personales…)"><button type="button" class="btn-delete rev-ocultar">Ocultar</button>'}
        </div>
      </div>`).join('');
    cont.querySelectorAll('.rev-ocultar, .rev-mostrar').forEach(b => b.addEventListener('click', async () => {
      const it = b.closest('.rev-item');
      const ocultar = b.classList.contains('rev-ocultar');
      const motivo = ocultar ? it.querySelector('.rev-motivo').value.trim() : '';
      if (ocultar && motivo.length < 5) { showToast('Escribe el motivo para ocultarla.', true); return; }
      b.disabled = true;
      const r = await fetch('/api/admin/resenas/' + it.dataset.id + '/ocultar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ocultar, motivo }) });
      const e = await r.json().catch(() => ({}));
      b.disabled = false;
      if (!r.ok) { if (r.status !== 401) showToast(e.error || 'No se pudo cambiar.', true); return; }
      showToast(ocultar ? 'Reseña oculta.' : 'Reseña visible otra vez.');
      loadResenasAdmin();
    }));
  }

  async function loadHotsAdmin() {
    const res = await fetch('/api/admin/hots');
    if (!res.ok) return;
    const d = await res.json();
    const precioIn = document.getElementById('hot-price-usd'), cuposIn = document.getElementById('hot-slots');
    if (document.activeElement !== precioIn) precioIn.value = d.precioSemanaUsd || '';
    if (document.activeElement !== cuposIn) cuposIn.value = d.cupos;
    document.getElementById('hots-status').innerHTML = (d.precioSemanaCup ? 'Precio: <strong>' + fmtCup(d.precioSemanaCup) + '</strong> por semana. ' : '<strong>Hots sin precio configurado.</strong> ') +
      'Cupos: <strong>' + d.ocupados + ' de ' + d.cupos + '</strong> ocupados' + (d.proximoLibre && !d.libres ? ' · el próximo se libera el ' + fechaHora(d.proximoLibre) : '') + '.';
    const cnt = document.getElementById('hots-count');
    cnt.textContent = d.pendientes.length || ''; cnt.classList.toggle('show', d.pendientes.length > 0);
    actualizarNav('productores', 'hots', d.pendientes.length);

    const pend = document.getElementById('hots-pending');
    pend.innerHTML = d.pendientes.length ? '' : '<div class="empty-hint">No hay Hots pendientes.</div>';
    d.pendientes.forEach((h) => {
      const item = document.createElement('div');
      item.className = 'order-item';
      const wa = soloDigitos(h.producer_phone);
      item.innerHTML =
        (h.receipt_filename ? '<img class="receipt-thumb" src="/api/admin/hots/' + h.id + '/receipt" alt="Comprobante">' : '<div class="receipt-thumb receipt-gone">sin foto</div>') +
        '<div class="info">' +
          '<div class="buyer">' + escapeHtml(h.producer_name || 'Productor') + '</div>' +
          '<div class="track"><span aria-hidden="true">🔥</span> ' + escapeHtml(h.track_title || 'Beat eliminado') + ' · <strong>' + semTxt(h.weeks) + '</strong> · ' + fmtCup(h.amount_cup) + (h.currency && h.currency !== 'CUP' ? ' (pagó en ' + escapeHtml(etiquetaDe(h.currency)) + ')' : '') + '</div>' +
          '<div class="meta">' + fechaHora(h.created_at) + '</div>' +
        '</div>' +
        '<div class="actions">' +
          '<button type="button" class="btn-approve-order hot-ok">Aprobar y publicar</button>' +
          '<button type="button" class="btn-reject-track hot-no">Rechazar</button>' +
          (wa ? '<a class="btn-toggle-producer" href="https://wa.me/' + wa + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
        '</div>';
      const th = item.querySelector('img.receipt-thumb');
      if (th) th.addEventListener('click', () => { receiptModalImg.src = '/api/admin/hots/' + h.id + '/receipt'; receiptModalOverlay.classList.add('active'); });
      item.querySelector('.hot-ok').addEventListener('click', async (ev) => {
        if (!confirm('¿Recibiste ' + fmtCup(h.amount_cup) + ' de ' + (h.producer_name || 'el productor') + '? «' + h.track_title + '» sale en la portada ' + semTxt(h.weeks) + '.')) return;
        ev.target.disabled = true;
        const r = await fetch('/api/admin/hots/' + h.id + '/approve', { method: 'POST' });
        const e2 = await r.json().catch(() => ({}));
        if (r.ok) { showToast('Publicado en Hots hasta el ' + fechaHora(e2.hasta) + (e2.extendido ? ' (se sumó al tiempo que ya tenía).' : '.')); loadHotsAdmin(); }
        else { showToast(e2.error || 'No se pudo aprobar.', true); ev.target.disabled = false; }
      });
      item.querySelector('.hot-no').addEventListener('click', async () => {
        const reason = prompt('Motivo del rechazo:');
        if (reason === null) return;
        const r = await fetch('/api/admin/hots/' + h.id + '/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
        showToast(r.ok ? 'Pedido rechazado.' : 'No se pudo rechazar.', !r.ok);
        loadHotsAdmin();
      });
      pend.appendChild(item);
    });

    const act = document.getElementById('hots-active');
    act.innerHTML = d.activos.length ? d.activos.map(h =>
      '<div class="payout-history-row hot-row"><span>' + (h.visible || new Date(h.starts_at) <= new Date() ? 'hasta ' + fechaHora(h.ends_at) : 'empieza ' + fechaHora(h.starts_at)) + '</span>' +
      '<span><span aria-hidden="true">🔥</span> ' + escapeHtml(h.track_title || '') + ' · ' + escapeHtml(h.producer_id ? h.producer_name : 'tuyo') + '</span>' +
      '<strong>' + (h.currency === 'Gratis' ? 'gratis' : fmtCup(h.amount_cup)) + '</strong>' +
      '<button type="button" class="btn-link hot-quitar" data-id="' + h.id + '">Quitar</button></div>').join('')
      : '<div class="empty-hint">No hay beats en portada.</div>';
    act.querySelectorAll('.hot-quitar').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Quitar este beat de la portada? El reembolso no es automático.')) return;
      const r = await fetch('/api/admin/hots/' + b.dataset.id + '/quitar', { method: 'POST' });
      showToast(r.ok ? 'Quitado de la portada.' : 'No se pudo quitar.', !r.ok);
      loadHotsAdmin();
    }));

    const selBeat = document.getElementById('hot-free-track');
    const antes = selBeat.value;
    selBeat.innerHTML = d.beats.map(b => '<option value="' + b.id + '">' + escapeHtml(b.title) + ' · ' + escapeHtml(b.producer_name) + '</option>').join('') || '<option value="">No hay beats a la venta</option>';
    if (d.beats.some(b => String(b.id) === antes)) selBeat.value = antes;

    const ESTADO_HOT = (h) => h.status === 'rejected' ? 'rechazado' : (h.reject_reason ? 'quitado' : 'terminó');
    hotsHist = d.historial.map(h => ({ ...h, estadoTxt: ESTADO_HOT(h) }));
    pintarToolsHist('hots', d.ocultos || 0, hotsHist.length, hotsHist.length);
    document.getElementById('hots-history').innerHTML = hotsHist.length ? hotsHist.map(h =>
      '<div class="payout-history-row hist-item"><span>' + fechaHora(h.resolved_at || h.created_at) + '</span>' +
      '<span>' + escapeHtml(h.track_title || '') + ' · ' + escapeHtml(h.producer_id ? h.producer_name : 'tuyo') + '</span>' +
      '<strong>' + (h.currency === 'Gratis' ? 'gratis' : fmtCup(h.amount_cup)) + '</strong>' +
      '<span class="muted">' + escapeHtml(h.estadoTxt) + ' · ' + semTxt(h.weeks) + (h.status === 'rejected' && h.reject_reason ? ' · ' + escapeHtml(h.reject_reason) : '') + '</span>' +
      botonBorrarHist('hot:' + h.id) + '</div>').join('') : '<div class="empty-hint">Aún no hay Hots finalizados.</div>';
  }
  let hotsHist = [];
  document.getElementById('hots-config').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await fetch('/api/admin/hots/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceUsd: document.getElementById('hot-price-usd').value, slots: document.getElementById('hot-slots').value }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { showToast('Hots guardado: ' + (d.precioSemanaCup ? fmtCup(d.precioSemanaCup) + ' por semana' : 'sin precio') + ', ' + d.cupos + ' cupos.'); loadHotsAdmin(); }
    else showToast(d.error || 'No se pudo guardar.', true);
  });
  document.getElementById('hot-free-btn').addEventListener('click', async (ev) => {
    const trackId = document.getElementById('hot-free-track').value;
    if (!trackId) return;
    ev.target.disabled = true;
    const r = await fetch('/api/admin/hots/gratis', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackId: Number(trackId), weeks: Number(document.getElementById('hot-free-weeks').value) }) });
    const d = await r.json().catch(() => ({}));
    ev.target.disabled = false;
    if (r.ok) { showToast('Destacado en la portada hasta el ' + fechaHora(d.hasta) + '.'); loadHotsAdmin(); }
    else showToast(d.error || 'No se pudo destacar.', true);
  });
  conectarHistorial('hots', document.getElementById('hots-history'), {
    recargar: () => loadHotsAdmin(),
    nombre: 'Hots terminados',
    aviso: 'Solo se quitan de esta lista.',
    borrables: () => hotsHist.map(h => 'hot:' + h.id),
    filas: () => hotsHist,
    archivo: 'historial-hots',
    columnas: [
      { titulo: 'Fecha y hora', valor: h => H.fechaHoraArchivo(h.resolved_at || h.created_at) },
      { titulo: 'Beat', valor: h => h.track_title || '' },
      { titulo: 'Productor', valor: h => h.producer_id ? h.producer_name : 'Tuyo' },
      { titulo: 'Semanas', valor: h => h.weeks },
      { titulo: 'Monto CUP', valor: h => H.numero(h.amount_cup, 0) },
      { titulo: 'Pagó con', valor: h => h.currency || '' },
      { titulo: 'Desde', valor: h => h.starts_at ? H.fechaHoraArchivo(h.starts_at) : '' },
      { titulo: 'Hasta', valor: h => h.ends_at ? H.fechaHoraArchivo(h.ends_at) : '' },
      { titulo: 'Estado', valor: h => h.estadoTxt },
      { titulo: 'Motivo', valor: h => h.reject_reason || '' },
    ],
  });

  function montoW(w) {
    return w.currency === 'CUP' ? fmtCup(w.net_units) : fmtN(w.net_units, ZBUI.decimales(w.currency)) + ' ' + escapeHtml(w.currency_label || w.currency);
  }
  function cuentaRegresiva(dueIso) {
    const falta = new Date(dueIso).getTime() - Date.now();
    if (falta <= 0) return { txt: 'ATRASADO — el plazo venció el ' + new Date(dueIso).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }), late: true };
    const d = Math.floor(falta / 86400000), h = Math.floor((falta % 86400000) / 3600000), m = Math.floor((falta % 3600000) / 60000);
    return { txt: 'Págale en ' + (d ? d + ' d ' : '') + h + ' h ' + (d ? '' : m + ' min'), late: false };
  }

  let retirosFilas = [];
  conectarHistorial('retiros', payoutsHistory, {
    recargar: () => loadPayouts(),
    nombre: 'retiros resueltos',
    aviso: 'Los saldos no cambian.',
    borrables: () => retirosFilas.map(h => h.clave),
    filas: () => retirosFilas,
    archivo: 'historial-retiros',
    columnas: [
      { titulo: 'Fecha y hora', valor: h => H.fechaHoraArchivo(h.fecha) },
      { titulo: 'Pedido el', valor: h => H.fechaHoraArchivo(h.pedido) },
      { titulo: 'Productor', valor: h => h.productor || '' },
      { titulo: 'Sale de su saldo', valor: h => h.saleDe },
      { titulo: 'Recibe', valor: h => H.numero(h.neto, h.dec) },
      { titulo: 'Moneda', valor: h => h.moneda },
      { titulo: 'Estado', valor: h => h.estado },
      { titulo: 'Cuenta', valor: h => h.cuenta },
      { titulo: 'Nota', valor: h => h.nota },
    ],
  });

  async function loadPayouts() {
    const res = await fetch('/api/admin/withdrawals');
    if (!res.ok) return;
    const { pendientes, historial, antiguos, sinSolicitar, ocultos } = await res.json();
    const atrasados = pendientes.filter(w => new Date(w.due_at) < new Date()).length;
    payoutsCount.textContent = pendientes.length ? (atrasados ? atrasados + ' atrasado' + (atrasados > 1 ? 's' : '') : pendientes.length) : '';
    payoutsCount.classList.toggle('show', pendientes.length > 0);
    actualizarNav('productores', 'retiros', pendientes.length);
    payoutsList.innerHTML = '';
    if (!pendientes.length) payoutsList.innerHTML = '<div class="empty-hint">No hay retiros pendientes.</div>';

    pendientes.forEach((w) => {
      const item = document.createElement('div');
      const cr = cuentaRegresiva(w.due_at);
      item.className = 'payout-item' + (cr.late ? ' is-late' : '');
      const wa = String(w.producer_phone || '').replace(/[^0-9]/g, '');
      const movs = (w.movimientos || []).map(m =>
        '<li>' + formatOrderDate(m.fecha) + ' · ' + escapeHtml(m.titulo) + (m.estado ? ' <span class="muted">(' + escapeHtml(m.estado) + ')</span>' : '') + ' = <strong>' +
        (m.unidades ? (m.unidades > 0 ? '+' : '−') + escapeHtml(unidades(Math.abs(m.unidades), m.moneda)) : '<s>' + escapeHtml(unidades(Math.abs(m.montoOriginal || 0), m.moneda)) + '</s>') + '</strong></li>').join('');
      const detalle = (movs || '<li>Sin movimientos.</li>') +
        '<li class="payout-rest">Después de este retiro le quedan <strong>' + escapeHtml(unidades(w.saldoRestante || 0, w.wallet || 'CUP')) + '</strong> en su saldo.</li>';
      const conversion = w.currency === 'CUP' ? '' : (w.wallet === w.currency)
        ? (Number(w.fee_units) > 0 ? '<div class="payout-conv">' + fmtN(w.amount_units, ZBUI.decimales(w.currency)) + ' ' + escapeHtml(w.currency_label || w.currency) + ' − ' + fmtN(w.fee_units, ZBUI.decimales(w.currency)) + ' (fee de red) = <strong>' + montoW(w) + '</strong> a transferir</div>' : '') :
        '<div class="payout-conv">' + fmtCup(w.amount_cup) + ' ÷ ' + fmtN(w.rate_cup_per_unit, 2) + ' (tasa) = ' + fmtN(w.amount_units, 2) + ' − ' + fmtN(w.fee_units, 2) + ' (fee) = <strong>' + montoW(w) + '</strong></div>';
      item.innerHTML =
        '<div class="payout-head">' +
          '<div>' +
            '<div class="buyer">' + escapeHtml(w.producer_name) + ' <span class="muted">· plan ' + escapeHtml(w.producer_plan || '') + '</span></div>' +
            '<div class="meta">' + escapeHtml(w.producer_email || '') + (w.producer_phone ? ' · ' + escapeHtml(w.producer_phone) : '') + ' · pedido ' + formatOrderDate(w.created_at) + '</div>' +
          '</div>' +
          '<div class="payout-amount">' + montoW(w) + '<span>a transferir en ' + escapeHtml(w.currency_label || w.currency) + '</span></div>' +
        '</div>' +
        '<div class="payout-due ' + (cr.late ? 'late' : '') + '">' + cr.txt + '</div>' +
        conversion +
        '<div class="payout-accounts"><div class="payout-account"><strong>' + escapeHtml(w.currency_label || w.currency) + '</strong> · <code>' + escapeHtml(w.account_text) + '</code></div></div>' +
        '<details class="payout-detail"><summary>Ver movimientos de su saldo en ' + escapeHtml(w.wallet_label || w.wallet || 'CUP') + '</summary><ul>' + detalle + '</ul></details>' +
        '<div class="actions">' +
          '<button type="button" class="btn-approve-order btn-mark-paid">Marcar como pagado</button>' +
          '<button type="button" class="btn-reject-track btn-cancel-w">Cancelar</button>' +
          (wa ? '<a class="btn-toggle-producer" href="https://wa.me/' + wa + '?text=' + encodeURIComponent('Hola ' + w.producer_name + ', ya te transferí ' + montoW(w).replace(/<[^>]+>/g, '') + ' de tu retiro en Zona Beats.') + '" target="_blank" rel="noopener">Avisar por WhatsApp</a>' : '') +
        '</div>' +
        '<div class="paid-form" hidden>' +
          '<div class="field"><label for="paid-proof-' + w.id + '">Captura de la transferencia</label>' +
          '<input type="file" id="paid-proof-' + w.id + '" accept="image/jpeg,image/png,image/webp">' +
          '<span class="field-hint">Comprobante visible para el productor.</span></div>' +
          '<div class="field"><label for="paid-note-' + w.id + '">Nota (opcional)</label><input type="text" id="paid-note-' + w.id + '" maxlength="300" placeholder="Ej: número de transferencia"></div>' +
          '<div class="paid-form-actions"><button type="button" class="btn-approve-order btn-confirm-paid">Confirmar pago</button>' +
          '<button type="button" class="btn-toggle-producer btn-cancel-paid">Cancelar</button></div>' +
        '</div>';
      const formPago = item.querySelector('.paid-form');
      item.querySelector('.btn-mark-paid').addEventListener('click', () => { formPago.hidden = false; formPago.querySelector('input[type=file]').focus(); });
      item.querySelector('.btn-cancel-paid').addEventListener('click', () => { formPago.hidden = true; });
      item.querySelector('.btn-confirm-paid').addEventListener('click', async (ev) => {
        const archivo = formPago.querySelector('input[type=file]').files[0];
        const note = formPago.querySelector('input[type=text]').value;
        if (!archivo && ev.target.dataset.sinCaptura !== '1') {
          ev.target.dataset.sinCaptura = '1';
          ev.target.textContent = 'Confirmar sin captura';
          showToast('Sin comprobante adjunto. Pulsa de nuevo para confirmar.', true);
          return;
        }
        ev.target.disabled = true;
        let comprobante = '';
        try {
          if (archivo) {
            const chica = window.ZBSubidas ? await window.ZBSubidas.comprimirImagen(archivo, 1600, 0.82) : archivo;
            comprobante = await new Promise((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = mal; fr.readAsDataURL(chica); });
          }
        } catch { showToast('No se pudo leer la imagen.', true); ev.target.disabled = false; return; }
        const r2 = await fetch('/api/admin/withdrawals/' + w.id + '/paid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note, comprobante }) });
        if (r2.ok) { showToast('Retiro pagado.'); loadPayouts(); loadProducers(); }
        else { const e2 = await r2.json().catch(() => ({})); showToast(e2.error || 'No se pudo marcar.', true); ev.target.disabled = false; }
      });
      item.querySelector('.btn-cancel-w').addEventListener('click', async () => {
        const note = prompt('Motivo de la cancelación (el saldo vuelve al productor):', '');
        if (note === null) return;
        const r2 = await fetch('/api/admin/withdrawals/' + w.id + '/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
        showToast(r2.ok ? 'Retiro cancelado.' : 'No se pudo cancelar.', !r2.ok);
        loadPayouts();
      });
      payoutsList.appendChild(item);
    });

    document.getElementById('payouts-unrequested').innerHTML = sinSolicitar.length
      ? sinSolicitar.map(x => '<div class="payout-history-row"><span>Saldo</span><span>' + escapeHtml(x.name) + '</span><strong>' +
          ((x.billeteras || []).length ? x.billeteras.map(b => escapeHtml(unidades(b.unidades, b.code))).join(' · ') : fmtCup(x.totalCup)) + '</strong></div>').join('')
      : '<div class="empty-hint">Sin saldos pendientes.</div>';

    retirosFilas = historial.map(h => ({
      clave: 'retiro:' + h.id, fecha: h.resolved_at || h.created_at, pedido: h.created_at, productor: h.producer_name,
      montoHtml: montoW(h), moneda: h.currency_label || h.currency, neto: h.net_units, dec: ZBUI.decimales(h.currency),
      saleDe: unidades(h.debit_units != null ? h.debit_units : h.amount_cup, h.wallet || 'CUP'),
      estado: h.status === 'paid' ? 'pagado' : 'cancelado', cuenta: h.account_text || '', nota: h.note || '',
      captura: h.proof_filename ? '/api/admin/withdrawals/' + h.id + '/comprobante' : '',
    })).concat(antiguos.map(h => ({
      clave: 'pago:' + h.id, fecha: h.created_at, pedido: h.created_at, productor: h.producer_name,
      montoHtml: fmtCup(h.amount_cup), moneda: 'CUP', neto: h.amount_cup, dec: 0, saleDe: fmtCup(h.amount_cup),
      estado: 'pagado (sistema anterior)', cuenta: '', nota: h.note || '',
    }))).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    pintarToolsHist('retiros', ocultos || 0, retirosFilas.length, retirosFilas.length);
    payoutsHistory.innerHTML = retirosFilas.length ? retirosFilas.map(h =>
      '<div class="payout-history-row hist-item"><span>' + fechaHora(h.fecha) + '</span><span>' + escapeHtml(h.productor || '') + '</span><strong>' + h.montoHtml + '</strong>' +
      '<span class="muted">' + escapeHtml(h.estado) + (h.nota ? ' · ' + escapeHtml(h.nota) : '') +
      (h.captura ? ' · <a class="proof-link" href="' + h.captura + '" target="_blank" rel="noopener">captura</a>' : '') + '</span>' + botonBorrarHist(h.clave) + '</div>').join('')
      : '<div class="empty-hint">Aún no hay retiros resueltos.</div>';

    clearTimeout(retirosTimer);
    if (pendientes.length) retirosTimer = setTimeout(loadPayouts, 60000);
  }

  // Filas plegables en el teléfono: se ve lo esencial (quién, qué y cuánto) y el
  // detalle con los botones se abre con la flecha. Los avisos importantes se resumen
  // en etiquetas para que no pasen inadvertidos con la fila cerrada.
  const AVISOS_FILA = '.order-reclamo strong, .order-warning, .payout-due.late, .orig-estado.warn, .forzar-box:not([hidden]) label';
  function plegarFilas(lista, filaSel) {
    if (!lista) return;
    const aplicar = () => {
      lista.querySelectorAll(':scope > ' + filaSel).forEach((fila) => {
        if (fila.querySelector(':scope > .row-mas')) return;
        fila.classList.add('plegable');
        const destino = fila.querySelector(':scope > .info') || fila.querySelector(':scope > .payout-head > div') || fila;
        const vistos = new Set();
        const avisos = [...fila.querySelectorAll(AVISOS_FILA)]
          .map(el => el.textContent.trim().split(/\.\s|:\s/)[0].replace(/[.:]+$/, ''))
          .filter(t => t && !vistos.has(t) && vistos.add(t)).slice(0, 3);
        if (avisos.length) {
          const chips = document.createElement('div');
          chips.className = 'row-chips';
          chips.innerHTML = avisos.map(t => '<span class="row-chip">' + escapeHtml(t.length > 34 ? t.slice(0, 32) + '…' : t) + '</span>').join('');
          destino.appendChild(chips);
        }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'row-mas';
        b.setAttribute('aria-expanded', 'false');
        b.setAttribute('aria-label', 'Ver el detalle y las acciones');
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 10 5 5 5-5"/></svg>';
        fila.appendChild(b);
      });
    };
    new MutationObserver(aplicar).observe(lista, { childList: true });
    aplicar();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.row-mas');
    if (!b) return;
    const fila = b.closest('.plegable');
    const abrir = !fila.classList.contains('open');
    fila.classList.toggle('open', abrir);
    b.setAttribute('aria-expanded', String(abrir));
  });
  [['orders-list', '.order-item'], ['history-list', '.order-item'], ['plan-requests-list', '.order-item'], ['hots-pending', '.order-item'],
   ['pending-tracks-list', '.pending-track-item'], ['producers-list', '.producer-item'], ['track-list', '.track-list-item'], ['payouts-list', '.payout-item']]
    .forEach(([id, sel]) => plegarFilas(document.getElementById(id), sel));

  // Listas largas en páginas: pocas filas en el teléfono, más en pantallas grandes
  const PAGINAS = {};
  [['orders-list', 4, 3], ['history-list', 4, 4], ['pending-tracks-list', 3, 4], ['producers-list', 4, 6],
   ['payouts-list', 3, 5], ['payouts-unrequested', 7, 10], ['payouts-history', 7, 10], ['plan-requests-list', 4, 6],
   ['hots-pending', 3, 5], ['hots-active', 6, 8], ['hots-history', 7, 10], ['denuncias-list', 3, 5], ['cid-list', 3, 5],
   ['resenas-list', 4, 6], ['track-list', 5, 4], ['coincidencias-list', 1, 2], ['exchange-rates-list', 4, 8], ['payout-rates-list', 7, 12], ['accounts-list', 2, 6], ['social-links-list', 4, 6]]
    .forEach(([id, movil, pc]) => { PAGINAS[id] = ZBUI.paginarDom(document.getElementById(id), { porPagina: () => ZBUI.filasPorPagina(movil, pc), filas: ':not(.rate-base)' }); });
  document.getElementById('history-search').addEventListener('input', () => { if (PAGINAS['history-list']) PAGINAS['history-list'].primera(); });
  document.querySelectorAll('.admin-tab').forEach(t => t.addEventListener('click', () => { if (PAGINAS['track-list']) PAGINAS['track-list'].primera(); }));

  irPasoA(1);
  checkAuth();
})();
