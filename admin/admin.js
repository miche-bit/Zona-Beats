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

  // ---------- Navegación por categorías ----------
  function abrirCategoria(cat) {
    document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
    document.querySelectorAll('.admin-main > .panel').forEach(p => p.classList.toggle('cat-hidden', p.dataset.cat !== cat));
    try { sessionStorage.setItem('zb_admin_cat', cat); } catch { /* sin almacenamiento */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.addEventListener('click', () => abrirCategoria(b.dataset.cat)));
  let navCounts = { ventas: 0, productores: {} };
  function actualizarNav(cat, key, n) {
    if (cat === 'ventas') navCounts.ventas = n;
    else navCounts.productores[key] = n;
    const setB = (c, v) => { const el = document.querySelector('.nav-badge[data-for="' + c + '"]'); if (el) { el.textContent = v ? String(v) : ''; } };
    setB('ventas', navCounts.ventas);
    setB('productores', Object.values(navCounts.productores).reduce((a, b) => a + b, 0));
  }

  function showApp() {
    loginScreen.style.display = 'none';
    adminShell.style.display = 'block';
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
    loadPayouts();
    loadSummary();
  }

  function showLogin() {
    loginScreen.style.display = 'flex';
    adminShell.style.display = 'none';
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
    aviso.textContent = '';
    const f = coverInput.files[0];
    if (!f || !window.ZBSubidas) return;
    const m = await window.ZBSubidas.medirImagen(f);
    if (!m) { aviso.textContent = 'No se pudo leer la imagen. Prueba con otro JPG o PNG.'; return; }
    if (prev.src && prev.src.startsWith('blob:')) URL.revokeObjectURL(prev.src);
    prev.src = m.url;
    prev.style.display = 'block';
    if (Math.abs(m.w - m.h) > Math.max(m.w, m.h) * 0.02) aviso.textContent = 'La portada mide ' + m.w + 'x' + m.h + ' px: no es cuadrada, en la tienda se verá recortada al centro.';
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
    document.getElementById('admin-wav-note').textContent = audioEsWav && !pl ? 'El audio principal ya es WAV: se entrega ese mismo, no hace falta subirlo otra vez.' : '';
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
    document.getElementById('cover-note').textContent = '';
    actualizarArchivosAdmin();
  }

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (subiendo) return;
    const Z = window.ZBSubidas;
    if (!Z) { showToast('No se pudo cargar el sistema de subidas. Recarga la página.', true); return; }
    if (!titleInput.value.trim()) { showToast('Ponle título a la pista.', true); return; }
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
        showToast('Esa licencia exige el archivo WAV. Súbelo para continuar.', true);
        return;
      }
      if ((numPos(prices.unlimited) || numPos(prices.exclusive)) && !stems) {
        showToast('Esa licencia exige los STEMS (ZIP). Súbelos para continuar.', true);
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
      if (err && err.status === -1) showToast('Subida pausada. Si eliges los mismos archivos y pulsas «Publicar», sigue donde quedó.');
      else if (err && err.status === 401) showLogin();
      else showToast((err && err.message) || 'No se pudo subir. Intenta de nuevo.', true);
    } finally {
      subiendo = false;
      controlSubida = null;
      uploadBtn.disabled = false;
      uploadProgressWrap.style.display = 'none';
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
        catalog: 'Todavía no has subido ninguna pista al catálogo.',
        playlist: 'Todavía no has subido ninguna colaboración gratuita.',
        vip: 'Todavía no se ha vendido ninguna pista exclusiva.',
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
        </div>
        ${priceEditHtml}
        <div class="track-row-actions">
          <button type="button" class="btn-secondary btn-edit-info">Editar</button>
          <button type="button" class="btn-delete" data-id="${track.id}">Eliminar</button>
        </div>
      `;
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
    if (!confirm(`¿Eliminar "${title}"? Se borran el audio, la portada, el WAV y los STEMS. Esta acción no se puede deshacer.`)) return;
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

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
      <select class="account-currency">${options}</select>
      <input type="text" class="account-bank" placeholder="Banco / plataforma" value="${escapeHtml(bank)}">
      <input type="text" class="account-number" placeholder="Número de cuenta/tarjeta" value="${escapeHtml(number)}">
      <button type="button" class="account-remove-btn" aria-label="Quitar cuenta">&times;</button>
    `;
    row.querySelector('.account-remove-btn').addEventListener('click', () => row.remove());
    accountsList.appendChild(row);
  }

  addAccountBtn.addEventListener('click', () => addAccountRow());

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
      tarjeta('Desde el inicio', cup(d.siempre.total), d.siempre.ventas + ' ventas · para ti ' + cup(d.siempre.tuyo)) +
      tarjeta('Debes a productores', cup(d.deudaProductores), 'ventas y bonos sin pagar', d.deudaProductores > 0 ? 'warn' : '') +
      tarjeta('Espacio usado', gb(d.discoBytes || 0), 'audios, portadas y base de datos');
    const p = d.pendientes;
    const chips = [
      ['ventas', p.pedidos, 'comprobante', 'comprobantes'],
      ['productores', p.beats, 'beat por revisar', 'beats por revisar'],
      ['productores', p.productores, 'productor por aprobar', 'productores por aprobar'],
      ['productores', p.planes, 'compra de plan', 'compras de plan'],
      ['productores', p.retiros, 'retiro por pagar', 'retiros por pagar'],
    ].filter(c => c[1] > 0);
    const cont = document.getElementById('admin-pending');
    cont.innerHTML = chips.length
      ? chips.map(c => '<button type="button" class="pending-chip" data-cat="' + c[0] + '">' + c[1] + ' ' + (c[1] === 1 ? c[2] : c[3]) + '</button>').join('')
      : '<span class="all-done">Todo al día: no hay nada pendiente.</span>';
    cont.querySelectorAll('.pending-chip').forEach(b => b.addEventListener('click', () => abrirCategoria(b.dataset.cat)));
  }
  document.getElementById('summary-refresh').addEventListener('click', () => { loadSummary(true); loadOrders(); showToast('Actualizado.'); });

  async function loadOrders() {
    const res = await fetch('/api/admin/orders');
    if (!res.ok) return;
    const { orders } = await res.json();
    actualizarNav('ventas', null, orders.length);
    renderOrders(orders);
  }

  function formatOrderDate(isoLike) {
    const txt = String(isoLike || '');
    const d = new Date(txt.includes('T') ? txt : txt.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return txt;
    return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  const LIC_NOMBRES = { basic: 'Básica', premium: 'Premium', unlimited: 'Ilimitada', exclusive: 'Exclusiva' };
  const soloDigitos = (t) => String(t || '').replace(/[^0-9]/g, '');
  const etiquetaDe = (code) => { const c = configuredCurrencies.find(x => x.code === code); return (c && c.label) || code || 'CUP'; };
  const unidades = (n, code) => Number(n || 0).toLocaleString('es', { minimumFractionDigits: ['CUP', 'SALDO_MOVIL'].includes(code) ? 0 : 2, maximumFractionDigits: ['CUP', 'SALDO_MOVIL'].includes(code) ? 0 : 2 }) + ' ' + etiquetaDe(code);
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
      (linkCompra ? 'Descarga tu beat y tu licencia aquí (este link es solo tuyo, no lo compartas):\n' + linkCompra + '\n\n' : '') +
      (certificado ? 'Número de licencia: ' + certificado + '\nCualquiera puede verificarla en: ' + location.origin + '/verify/' + certificado + '\n\n' : '') +
      '¡Gracias por tu compra!';
  }

  function renderOrders(orders) {
    ordersList.innerHTML = '';

    if (!orders.length) {
      ordersList.innerHTML = '<div class="empty-hint">No hay comprobantes pendientes por revisar.</div>';
      ordersCount.classList.remove('show');
      return;
    }

    ordersCount.textContent = orders.length;
    ordersCount.classList.add('show');

    orders.forEach((order) => {
      const item = document.createElement('div');
      item.className = 'order-item';

      const lic = LIC_NOMBRES[order.license_type] || order.license_type || '';
      const avisoVendida = order.track_sold
        ? '<div class="order-warning">' + (order.track_exclusive ? 'Este beat ya se vendió en Exclusiva.' : 'Este beat ya se cerró con una licencia Ilimitada.') +
          (['unlimited', 'exclusive'].includes(order.license_type) ? ' No se puede aprobar: rechaza y devuelve el dinero.' : ' Revisa antes de aprobar.') + '</div>'
        : '';
      const waRecibido = soloDigitos(order.buyer_phone)
        ? 'https://wa.me/' + soloDigitos(order.buyer_phone) + '?text=' + encodeURIComponent('Hola ' + order.buyer_name + ' \u{1F44B} Recibí tu comprobante por "' + order.track_title + '" (licencia ' + lic + '). Ya lo estoy revisando y en breve te confirmo.')
        : '';

      item.innerHTML = `
        <img class="receipt-thumb" src="/api/admin/orders/${order.id}/receipt" alt="Comprobante de ${escapeHtml(order.buyer_name)}" loading="lazy">
        <div class="info">
          <div class="buyer">${escapeHtml(order.buyer_name)}</div>
          <div class="track">${escapeHtml(order.track_title)} · <strong>${escapeHtml(lic)}</strong>${order.price_label ? ` · ${escapeHtml(order.price_label)}` : ''}</div>
          <div class="meta">${escapeHtml(order.buyer_phone)} · ${formatOrderDate(order.created_at)} · pagó ${escapeHtml(unidades(order.wallet_currency ? order.paid_units : order.price_cup_at_sale, order.wallet_currency || 'CUP'))}${order.producer_name ? ' · productor: ' + escapeHtml(order.producer_name) + escapeHtml(paraProductor(order)) : ''}${order.license_type === 'exclusive' ? (order.vip_public ? ' · acepta salir en Beats VIP' : ' · no quiere salir en Beats VIP') : ''}</div>
          ${avisoVendida}
        </div>
        <div class="actions">
          <button class="btn-approve-order" type="button">Aprobar</button>
          <button class="btn-reject-track btn-reject-order" type="button">Rechazar</button>
          ${waRecibido ? `<a class="btn-toggle-producer" href="${waRecibido}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          <button class="btn-delete" type="button" title="Borrar sin avisar (spam)">Borrar</button>
        </div>
      `;

      item.querySelector('.receipt-thumb').addEventListener('click', () => {
        receiptModalImg.src = `/api/admin/orders/${order.id}/receipt`;
        receiptModalOverlay.classList.add('active');
      });
      item.querySelector('.btn-approve-order').addEventListener('click', (ev) => approveOrder(order, item, ev.target));
      item.querySelector('.btn-reject-order').addEventListener('click', () => rejectOrder(order));
      item.querySelector('.btn-delete').addEventListener('click', () => deleteOrder(order.id, order.buyer_name, order.certificate_id));

      ordersList.appendChild(item);
    });
  }

  async function approveOrder(order, item, btn) {
    btn.disabled = true;
    const res = await fetch(`/api/admin/orders/${order.id}/approve`, { method: 'POST' });
    if (res.ok) {
      const result = await res.json();
      let msg = 'Pedido aprobado.';
      if (result.wentToVip) msg = 'Aprobado — la pista exclusiva se retiró del catálogo y pasó a Beats VIP.';
      else if (result.trackMarkedSold) msg = 'Aprobado — licencia Ilimitada: la pista se retiró del catálogo.';
      if (result.billetera) msg += ' Se sumaron ' + unidades(result.billetera.unidades, result.billetera.moneda) + ' a la billetera del productor.';
      showToast(msg + ' Ahora mándale su link de descarga.');
      if (result.warning) alert(result.warning);
      // El link se manda con un toque (así el navegador no bloquea WhatsApp).
      const tel = soloDigitos(order.buyer_phone);
      const texto = mensajeLinkCompra(order, result.purchaseUrl, result.certificateId);
      item.classList.add('order-done');
      item.querySelector('.actions').innerHTML =
        (tel ? '<a class="btn-whatsapp-order" href="https://wa.me/' + tel + '?text=' + encodeURIComponent(texto) + '" target="_blank" rel="noopener">Enviar link por WhatsApp</a>' : '') +
        '<button type="button" class="btn-toggle-producer btn-copy-now">Copiar link</button>' +
        '<button type="button" class="btn-toggle-producer btn-done-now">Listo</button>';
      const listo = () => { loadOrders(); };
      const wa = item.querySelector('.btn-whatsapp-order');
      if (wa) wa.addEventListener('click', () => setTimeout(listo, 800));
      item.querySelector('.btn-done-now').addEventListener('click', listo);
      item.querySelector('.btn-copy-now').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(result.purchaseUrl); showToast('Link copiado. Es privado: solo mándaselo al comprador.'); }
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
    const reason = prompt('¿Por qué rechazas la compra de ' + order.buyer_name + '? Lo verá en «Mis compras».\n\nEj: el pago no llegó, el monto no coincide, la foto no se ve.', 'El pago no llegó a la cuenta.');
    if (reason === null) return;
    const res = await fetch('/api/admin/orders/' + order.id + '/reject', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    });
    if (res.ok) {
      showToast('Compra rechazada. El comprador ve el motivo en «Mis compras».');
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
      ? '¿Borrar la foto del comprobante de "' + buyerName + '"?\n\nLa licencia ' + certificateId + ' se conserva: el comprador sigue pudiendo verificarla y descargar. Solo se borra la imagen para liberar espacio.'
      : rechazado
        ? '¿Borrar la foto del comprobante rechazado de "' + buyerName + '"? El pedido sigue apareciendo como rechazado.'
        : '¿Borrar el pedido de "' + buyerName + '" sin avisarle? Úsalo solo para spam. Si el pago no llegó, mejor usa «Rechazar» para que vea el motivo.';
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
      watermarkVoiceDropLabel.textContent = 'Ya hay un audio configurado — sube otro para reemplazarlo';
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
      showToast('Sube un audio de voz para activar la marca de agua.', true);
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
      showToast('Protección de audio guardada. Se aplicará a las próximas pistas que subas.');
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
    if (!confirm('¿Quitar la marca de agua? Las pistas que subas después de esto ya no la incluirán. Las que ya están publicadas no cambian.')) return;
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

  addSocialLinkBtn.addEventListener('click', () => addSocialLinkRow());

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
    row.className = 'rate-row';
    const isCup = rate.code === 'CUP';
    row.innerHTML = `
      <div class="rate-row-label">${escapeHtml(rate.label)}${rate.custom ? ' <span class="custom-tag">agregado por ti</span>' : ''}</div>
      <div class="rate-row-input-wrap">
        ${isCup
          ? `<span>Moneda base — siempre 1</span>`
          : `<input type="text" class="rate-value" data-code="${escapeHtml(rate.code)}" data-label="${escapeHtml(rate.label)}" placeholder="0" value="${rate.cupPerUnit || ''}"><span>CUP por unidad</span>`
        }
        ${rate.custom ? '<button type="button" class="account-remove-btn rate-remove" aria-label="Quitar método">&times;</button>' : ''}
      </div>
    `;
    const rm = row.querySelector('.rate-remove');
    if (rm) rm.addEventListener('click', () => {
      if (confirm('¿Quitar "' + rate.label + '"? Pulsa «Guardar tasas» después para confirmarlo. Las cuentas en esa moneda dejarán de mostrarse.')) row.remove();
    });
    exchangeRatesList.appendChild(row);
  }

  let configuredCurrencies = Object.entries(CURRENCY_LABELS).map(([code, label]) => ({ code, label }));

  async function loadExchangeRates() {
    const res = await fetch('/api/admin/exchange-rates');
    if (!res.ok) return;
    const { rates } = await res.json();
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
    if (!label) { showToast('Escribe el nombre del método o moneda (ej: Zelle, USD efectivo, Bizum).', true); return; }
    const code = label.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
    if (!code) { showToast('Nombre no válido.', true); return; }
    if (exchangeRatesList.querySelector(`[data-code="${code}"]`) || code === 'CUP') { showToast('Ese método ya existe.', true); return; }
    appendRateRow({ code, label, cupPerUnit: parseFloat(rateEl.value.replace(',', '.')) || 0, custom: true });
    labelEl.value = ''; rateEl.value = '';
    showToast('Agregado. Pulsa «Guardar tasas» para que se vea en la tienda.');
  });

  exchangeRatesForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rates = [{ code: 'CUP', label: 'CUP', cupPerUnit: 1 }];
    exchangeRatesList.querySelectorAll('.rate-value').forEach((input) => {
      rates.push({
        code: input.dataset.code,
        label: input.dataset.label,
        cupPerUnit: parseFloat(input.value) || 0,
      });
    });

    const res = await fetch('/api/admin/exchange-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rates }),
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
      showToast('Promoción guardada. Los precios del catálogo ya reflejan el descuento.');
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
    estadoRestauracion(100, 'El servidor tarda en volver. Recarga la página en un minuto.');
  }
  restoreInput.addEventListener('change', async () => {
    const file = restoreInput.files[0];
    if (!file) return;
    const Z = window.ZBSubidas;
    if (!Z) { showToast('No se pudo cargar el sistema de subidas. Recarga la página.', true); return; }
    if (!/\.zip$/i.test(file.name)) { showToast('El backup es un archivo .zip.', true); restoreInput.value = ''; return; }
    if (!confirm(`¿Restaurar el backup "${file.name}" (${Z.tamano(file.size)})?\n\nSe REEMPLAZAN las ventas, licencias, productores, saldos, portadas y comprobantes actuales por los del backup. Todo lo que pasó después de esa copia se pierde.`)) {
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
      estadoRestauracion(100, 'Backup restaurado (' + d.restoredCount + ' archivos). El servidor se está reiniciando…');
      showToast('Backup restaurado. Esperando a que el servidor vuelva…');
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
    renderProducers(producers);
  }

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

    if (!producers.length) {
      producersList.innerHTML = '<div class="empty-hint">Todavía no hay productores registrados.</div>';
      return;
    }

    producers.forEach((p) => {
      const plan = PLAN_INFO[p.plan] || PLAN_INFO.free;
      const vencido = p.plan !== 'free' && p.plan_paid_until && new Date(p.plan_paid_until + 'T23:59:59') < new Date();
      const item = document.createElement('div');
      item.className = 'producer-item' + (p.approved ? '' : ' pending-approval');
      item.innerHTML =
        '<span class="status-dot ' + (p.active ? 'active' : 'inactive') + '"></span>' +
        '<div class="info">' +
          '<div class="name">' + escapeHtml(p.name) + (p.approved ? '' : ' <span class="tag-pending">por aprobar</span>') + '</div>' +
          '<div class="email">' + escapeHtml(p.email) +
            (p.contact_phone ? ' · <a class="wa-link" href="https://wa.me/' + String(p.contact_phone).replace(/[^0-9]/g, '') + '" target="_blank" rel="noopener">WhatsApp ' + escapeHtml(p.contact_phone) + '</a>' : ' · <span class="muted">sin teléfono</span>') +
          '</div>' +
          (p.disabled_reason === 'plan_vencido' ? '<div class="stats"><span class="tag-vencido">DESACTIVADO POR FALTA DE PAGO</span> — pasaron 15 días sin renovar. Puedes eliminarlo o esperar a que pague.</div>' : '') +
          '<div class="stats">Plan <strong>' + plan.label + '</strong> · ' + plan.com + '% comisión · ' + plan.beats +
            (p.plan_paid_until ? ' · paga hasta ' + escapeHtml(p.plan_paid_until) : '') +
            (vencido ? ' <span class="tag-vencido">VENCIDO</span>' : '') + '</div>' +
          '<div class="stats">' + p.trackCount + ' beats · ' + Number(p.totalSalesCup || 0).toLocaleString('es') + ' CUP vendidos · ' + Number(p.pendingPayoutCup || 0).toLocaleString('es', { maximumFractionDigits: 2 }) + ' CUP pendientes de pagarle · ' + (p.referidos || 0) + ' referidos aprobados' +
            (p.pendingOrders ? ' · <strong>' + p.pendingOrders + ' compra(s) por aprobar</strong>' : '') + '</div>' +
          '<div class="plan-edit">' +
            '<select class="plan-select">' +
              ['free','pro','studio'].map(k => '<option value="' + k + '"' + (p.plan === k ? ' selected' : '') + '>' + PLAN_INFO[k].label + '</option>').join('') +
            '</select>' +
            '<input type="date" class="plan-until" value="' + escapeHtml(p.plan_paid_until || '') + '">' +
            '<button type="button" class="btn-save-plan">Guardar plan</button>' +
          '</div>' +
        '</div>' +
        '<div class="actions">' +
          (p.approved ? '' : '<button type="button" class="btn-approve-order btn-approve-prod">Aprobar</button>') +
          '<button type="button" class="btn-toggle-exclusive ' + (p.exclusive_enabled ? 'is-on' : '') + '">' + (p.exclusive_enabled ? 'Quitar Exclusiva' : 'Habilitar Exclusiva') + '</button>' +
          '<button type="button" class="btn-toggle-producer ' + (p.active ? 'is-active' : '') + '">' + (p.active ? 'Desactivar' : 'Activar') + '</button>' +
          '<button type="button" class="btn-toggle-producer btn-movs-prod">Movimientos</button>' +
          '<button type="button" class="btn-toggle-producer btn-pass-prod">Nueva contraseña</button>' +
          '<button type="button" class="btn-delete">Eliminar</button>' +
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
            encodeURIComponent('Hola ' + p.name + ' \u{1F44B} Tu cuenta de productor en Zona Beats ya está aprobada. Entra en ' + location.origin + '/productores con tu correo y contraseña para subir tus beats.') +
            '" target="_blank" rel="noopener">Avisarle por WhatsApp</a>';
          const wa = item.querySelector('.btn-wa-aprobado');
          wa.addEventListener('click', () => setTimeout(loadProducers, 800));
        } else {
          loadProducers();
        }
        loadSummary();
      });

      item.querySelector('.btn-pass-prod').addEventListener('click', async () => {
        const nueva = prompt('Nueva contraseña para ' + p.name + ' (mínimo 6 caracteres).\n\nSe cierra su sesión en todos lados. Mándasela por WhatsApp y pídele que la cambie en su Perfil.', '');
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

      item.querySelector('.btn-toggle-producer').addEventListener('click', async () => {
        const r = await fetch('/api/admin/producers/' + p.id + '/toggle', { method: 'POST' });
        if (r.ok) { showToast(p.active ? 'Productor desactivado.' : 'Productor activado.'); loadProducers(); }
        else showToast('No se pudo cambiar el estado.', true);
      });

      item.querySelector('.btn-delete').addEventListener('click', async () => {
        const deuda = Number(p.pendingPayoutCup || 0);
        const pend = Number(p.pendingOrders || 0);
        if (!confirm('¿Eliminar a ' + p.name + '?\n\nSe borran TODOS sus beats y archivos de la app. Las ventas ya aprobadas y sus licencias se conservan. Esto no se puede deshacer.' +
          (pend > 0 ? '\n\nOJO: tiene ' + pend + ' compra(s) esperando aprobación. Se rechazan solas y tendrás que devolverles el dinero a esos compradores.' : '') +
          (deuda > 0 ? '\n\nATENCIÓN: todavía le debes ' + deuda.toLocaleString('es') + ' CUP. Si lo eliminas, esa deuda desaparece del panel de retiros.' : ''))) return;
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
      showToast('Productor creado. Ya puede entrar en /productores con ese correo y contraseña.');
      createProducerForm.reset();
      loadProducers();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'No se pudo crear el productor.', true);
    }
  });

  const pendingTracksList = document.getElementById('pending-tracks-list');
  const pendingTracksCount = document.getElementById('pending-tracks-count');

  async function loadPendingTracks() {
    const res = await fetch('/api/admin/pending-tracks');
    if (!res.ok) return;
    const { tracks } = await res.json();
    renderPendingTracks(tracks);
  }

  function renderPendingTracks(tracks) {
    pendingTracksList.innerHTML = '';
    pendingTracksCount.textContent = tracks.length || '';
    actualizarNav('productores', 'beats', tracks.length);
    pendingTracksCount.classList.toggle('show', tracks.length > 0);

    if (!tracks.length) {
      pendingTracksList.innerHTML = '<div class="empty-hint">No hay beats pendientes por revisar.</div>';
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
        </div>
        <audio controls preload="none" src="/api/admin/preview-audio/${t.id}"></audio>
        <div class="actions">
          <button type="button" class="btn-approve-order">Aprobar</button>
          <button type="button" class="btn-reject-track">Rechazar</button>
        </div>
      `;
      item.querySelector('.btn-approve-order').addEventListener('click', async (ev) => {
        ev.target.disabled = true;
        const res = await fetch(`/api/admin/tracks/${t.id}/approve`, { method: 'POST' });
        if (res.ok) {
          showToast('Beat aprobado, ya está visible en la tienda.');
          loadPendingTracks(); loadTracks(); loadSummary();
        } else if (res.status !== 401) {
          const e2 = await res.json().catch(() => ({}));
          showToast(e2.error || 'No se pudo aprobar.', true);
          ev.target.disabled = false;
        }
      });
      item.querySelector('.btn-reject-track').addEventListener('click', async () => {
        const reason = prompt(`¿Por qué rechazas "${t.title}"? El productor lo verá en su portal y puede corregirlo.`, '');
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

  const platformForm = document.getElementById('platform-config-form');
  const adminPhoneInput = document.getElementById('admin-phone-input');
  const planProPriceInput = document.getElementById('plan-pro-price-input');
  const planStudioPriceInput = document.getElementById('plan-studio-price-input');
  let usdRateAdmin = 0;

  function pintarCupPlanes() {
    const n = (v) => parseFloat(String(v || '').replace(',', '.')) || 0;
    const txt = (usd) => usdRateAdmin
      ? '≈ ' + Math.round(usd * usdRateAdmin).toLocaleString('es') + ' CUP/mes con tu tasa (1 USD = ' + usdRateAdmin.toLocaleString('es') + ' CUP)'
      : 'Pon la tasa del USD en «Tasas de cambio» para calcular el precio en CUP.';
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
        '<label class="mini-field"><span>Tasa del remesero (CUP)</span><input type="text" class="pr-rate" inputmode="decimal" placeholder="= venta" value="' + (v.rate || '') + '"></label>' +
        '<label class="mini-field"><span>Fee de red</span><input type="text" class="pr-fee" inputmode="decimal" placeholder="0" value="' + (v.fee || '') + '"></label>' +
      '</div>';
    }).join('') || '<div class="empty-hint">Configura primero tus monedas en «Tasas de cambio».</div>';
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
    document.getElementById('referral-bonus-cup').value = d.referralBonusCup;
    payoutRatesCfg = d.payoutRates || {};
    pintarCupPlanes();
    pintarTasasRetiro();
  }

  platformForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payoutRates = {};
    document.querySelectorAll('.payout-rate-row').forEach(r => {
      payoutRates[r.dataset.code] = { rate: r.querySelector('.pr-rate').value.trim(), fee: r.querySelector('.pr-fee').value.trim() };
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
        referralBonusCup: document.getElementById('referral-bonus-cup').value,
        payoutRates,
      }),
    });
    if (res.ok) { showToast('Configuración de planes, bonos y retiros guardada.'); loadCommission(); }
    else { const e2 = await res.json().catch(() => ({})); showToast(e2.error || 'No se pudo guardar.', true); }
  });

  // ---------- Movimientos de un productor (desde Productores) ----------
  const MOV_TIPOS_ADMIN = { venta: 'Venta', bono: 'Bono', plan: 'Plan', retiro: 'Retiro' };
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
          if (!claves.length || !confirm('¿Borrar ' + claves.length + ' movimientos de ' + p.name + ' de este historial?\n\nSolo se quitan de tu vista: su saldo no cambia y él sigue viendo los suyos. Lo que está en curso no se borra.')) return;
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
            { titulo: 'Monto', valor: m => H.numero(m.unidades || 0, ['CUP', 'SALDO_MOVIL'].includes(m.moneda) ? 0 : 2) },
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
      if (!confirm('¿Borrar ' + claves.length + ' ' + opciones.nombre + ' del historial?\n\n' + opciones.aviso + '\nLo que está en curso no se borra. Puedes restaurarlos después.')) return;
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
      historyList.innerHTML = '<div class="empty-hint">Todavía no hay compras aprobadas ni rechazadas.</div>';
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
          : '<div class="receipt-thumb receipt-gone">sin foto</div>') +
        '<div class="info">' +
          '<div class="buyer">' + escapeHtml(o.buyer_name) + (rechazada ? ' <span class="tag-vencido">rechazada</span>' : '') + '</div>' +
          '<div class="track">' + escapeHtml(o.track_title) + ' · <strong>' + escapeHtml(lic) + '</strong> · ' + escapeHtml(o.price_label || '') + '</div>' +
          '<div class="meta">' + escapeHtml(o.buyer_phone) + ' · ' + fechaHora(o.approved_at || o.rejected_at || o.created_at) + ' · ' + vendedor + escapeHtml(rechazada ? '' : paraProductor(o)) + '</div>' +
          (rechazada && o.reject_reason ? '<div class="meta">Motivo: ' + escapeHtml(o.reject_reason) + '</div>' : '') +
          (o.certificate_id ? '<div class="cert-line">Licencia <strong>' + escapeHtml(o.certificate_id) + '</strong></div>' : '') +
        '</div>' +
        '<div class="actions">' +
          (o.certificate_id ? '<a class="btn-whatsapp-order" href="/api/license/' + encodeURIComponent(o.certificate_id) + '/pdf" target="_blank" rel="noopener">PDF</a>' : '') +
          (wa && !rechazada ? '<a class="btn-toggle-producer" href="https://wa.me/' + wa + '?text=' + waText + '" target="_blank" rel="noopener">Enviar link por WhatsApp</a>' : '') +
          (linkCompra ? '<button type="button" class="btn-toggle-producer btn-copy-link">Copiar link</button>' : '') +
          (rechazada ? '<button type="button" class="btn-approve-order btn-approve-late">Aprobar igual</button>' : '') +
          (o.receipt_filename ? '<button type="button" class="btn-delete btn-del-photo">Borrar foto</button>' : '') +
        '</div>' + botonBorrarHist('orden:' + o.id);
      item.classList.add('hist-item');
      const cp = item.querySelector('.btn-copy-link');
      if (cp) cp.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(linkCompra); showToast('Link copiado. Es privado: solo mándaselo al comprador.'); }
        catch { prompt('Copia este link y mándaselo al comprador:', linkCompra); }
      });
      const late = item.querySelector('.btn-approve-late');
      if (late) late.addEventListener('click', (ev) => {
        if (!confirm('¿Aprobar la compra de ' + o.buyer_name + ' aunque la rechazaste? Hazlo solo si el pago sí llegó.')) return;
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
    aviso: 'Solo se quitan de esta lista: las licencias, las descargas de los compradores y los saldos de los productores siguen igual.',
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
      { titulo: 'Pagó', valor: o => o.paid_units != null ? H.numero(o.paid_units, ['CUP', 'SALDO_MOVIL'].includes(o.wallet_currency || 'CUP') ? 0 : 2) + ' ' + etiquetaDe(o.wallet_currency || 'CUP') : '' },
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
      planRequestsList.innerHTML = '<div class="empty-hint">Ningún productor ha comprado un plan todavía.</div>';
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
        const reason = prompt('¿Por qué lo rechazas? El productor lo verá en su portal (ej: el monto no coincide, no llegó la transferencia).');
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
  const LIC = { basic: 'Básica', premium: 'Premium', unlimited: 'Ilimitada', exclusive: 'Exclusiva' };
  let retirosTimer = null;

  conectarHistorial('planes', planRequestsList, {
    recargar: () => loadPlanRequests(),
    nombre: 'compras de planes',
    aviso: 'Solo se quitan de esta lista: los planes activos siguen igual.',
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

  function montoW(w) {
    return w.currency === 'CUP' ? fmtCup(w.net_units) : fmtN(w.net_units, w.currency === 'SALDO_MOVIL' ? 0 : 2) + ' ' + escapeHtml(w.currency_label || w.currency);
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
    aviso: 'Solo se quitan de esta lista: los saldos de los productores siguen igual.',
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
      const conversion = w.currency === 'CUP' ? '' : (w.wallet && w.wallet !== 'CUP')
        ? '<div class="payout-conv">Saldo en ' + escapeHtml(w.wallet_label || w.wallet) + ' (lo que pagaron los compradores, menos la comisión): ' + fmtN(w.amount_units, 2) + ' − ' + fmtN(w.fee_units, 2) + ' (fee) = <strong>' + montoW(w) + '</strong></div>' :
        '<div class="payout-conv">' + fmtCup(w.amount_cup) + ' ÷ ' + fmtN(w.rate_cup_per_unit, 2) + ' (tasa) = ' + fmtN(w.amount_units, 2) + ' − ' + fmtN(w.fee_units, 2) + ' (fee) = <strong>' + montoW(w) + '</strong></div>';
      item.innerHTML =
        '<div class="payout-head">' +
          '<div>' +
            '<div class="buyer">' + escapeHtml(w.producer_name) + ' <span class="muted">· plan ' + escapeHtml(w.producer_plan || '') + '</span></div>' +
            '<div class="meta">' + escapeHtml(w.producer_email || '') + (w.producer_phone ? ' · ' + escapeHtml(w.producer_phone) : '') + ' · pedido ' + formatOrderDate(w.created_at) + '</div>' +
          '</div>' +
          '<div class="payout-amount">' + montoW(w) + '<span>' + (w.wallet && w.wallet !== 'CUP' ? 'saldo en ' + escapeHtml(w.wallet_label || w.wallet) + ' · ≈ ' + fmtCup(w.amount_cup) : fmtCup(w.amount_cup) + ' de saldo') + '</span></div>' +
        '</div>' +
        '<div class="payout-due ' + (cr.late ? 'late' : '') + '">' + cr.txt + '</div>' +
        conversion +
        '<div class="payout-accounts"><div class="payout-account"><strong>' + escapeHtml(w.currency_label || w.currency) + '</strong> · <code>' + escapeHtml(w.account_text) + '</code></div></div>' +
        '<details class="payout-detail"><summary>Ver movimientos de su saldo en ' + escapeHtml(w.wallet_label || w.wallet || 'CUP') + '</summary><ul>' + detalle + '</ul></details>' +
        '<div class="actions">' +
          '<button type="button" class="btn-approve-order btn-mark-paid">Marcar como pagado</button>' +
          '<button type="button" class="btn-reject-track btn-cancel-w">Cancelar</button>' +
          (wa ? '<a class="btn-toggle-producer" href="https://wa.me/' + wa + '?text=' + encodeURIComponent('Hola ' + w.producer_name + ', ya te transferí ' + montoW(w).replace(/<[^>]+>/g, '') + ' de tu retiro en Zona Beats.') + '" target="_blank" rel="noopener">Avisar por WhatsApp</a>' : '') +
        '</div>';
      item.querySelector('.btn-mark-paid').addEventListener('click', async (ev) => {
        const note = prompt('¿Ya le transferiste ' + montoW(w).replace(/<[^>]+>/g, '') + ' a ' + w.producer_name + '?\n\nNota opcional (ej: número de transferencia):', '');
        if (note === null) return;
        ev.target.disabled = true;
        const r2 = await fetch('/api/admin/withdrawals/' + w.id + '/paid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
        if (r2.ok) { showToast('Retiro marcado como pagado. El productor lo verá en su portal.'); loadPayouts(); loadProducers(); }
        else { const e2 = await r2.json().catch(() => ({})); showToast(e2.error || 'No se pudo marcar.', true); ev.target.disabled = false; }
      });
      item.querySelector('.btn-cancel-w').addEventListener('click', async () => {
        const note = prompt('¿Por qué cancelas este retiro? El saldo vuelve a estar disponible para el productor.', '');
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
      : '<div class="empty-hint">Nadie tiene saldo esperando.</div>';

    retirosFilas = historial.map(h => ({
      clave: 'retiro:' + h.id, fecha: h.resolved_at || h.created_at, pedido: h.created_at, productor: h.producer_name,
      montoHtml: montoW(h), moneda: h.currency_label || h.currency, neto: h.net_units, dec: ['CUP', 'SALDO_MOVIL'].includes(h.currency) ? 0 : 2,
      saleDe: unidades(h.debit_units != null ? h.debit_units : h.amount_cup, h.wallet || 'CUP'),
      estado: h.status === 'paid' ? 'pagado' : 'cancelado', cuenta: h.account_text || '', nota: h.note || '',
    })).concat(antiguos.map(h => ({
      clave: 'pago:' + h.id, fecha: h.created_at, pedido: h.created_at, productor: h.producer_name,
      montoHtml: fmtCup(h.amount_cup), moneda: 'CUP', neto: h.amount_cup, dec: 0, saleDe: fmtCup(h.amount_cup),
      estado: 'pagado (sistema anterior)', cuenta: '', nota: h.note || '',
    }))).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    pintarToolsHist('retiros', ocultos || 0, retirosFilas.length, retirosFilas.length);
    payoutsHistory.innerHTML = retirosFilas.length ? retirosFilas.map(h =>
      '<div class="payout-history-row hist-item"><span>' + fechaHora(h.fecha) + '</span><span>' + escapeHtml(h.productor || '') + '</span><strong>' + h.montoHtml + '</strong>' +
      '<span class="muted">' + escapeHtml(h.estado) + (h.nota ? ' · ' + escapeHtml(h.nota) : '') + '</span>' + botonBorrarHist(h.clave) + '</div>').join('')
      : '<div class="empty-hint">Todavía no hay retiros resueltos.</div>';

    clearTimeout(retirosTimer);
    if (pendientes.length) retirosTimer = setTimeout(loadPayouts, 60000);
  }

  checkAuth();
})();
