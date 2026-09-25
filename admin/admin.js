(() => {
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

  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => { toast.className = 'toast'; }, 3000);
  }

  function setUploadProgress(pct, label) {
    uploadProgressFill.style.width = `${pct}%`;
    uploadProgressLabel.textContent = label;
  }

  function showApp() {
    loginScreen.style.display = 'none';
    adminShell.style.display = 'block';
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
  function wireFileDrop(dropEl, inputEl, labelEl, defaultLabel) {
    inputEl.addEventListener('change', () => {
      if (inputEl.files.length > 0) {
        labelEl.textContent = inputEl.files[0].name;
        dropEl.classList.add('has-file');
      } else {
        labelEl.textContent = defaultLabel;
        dropEl.classList.remove('has-file');
      }
    });
  }
  wireFileDrop(audioDrop, audioInput, document.getElementById('audio-drop-label'), 'MP3, WAV, M4A, OGG o FLAC · máx 150MB');
  wireFileDrop(coverDrop, coverInput, document.getElementById('cover-drop-label'), 'JPG, PNG o WEBP · máx 8MB');
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
  });

  uploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!audioInput.files.length) {
      showToast('Selecciona un archivo de audio.', true);
      return;
    }

    const MAX_AUDIO_MB = 150;
    if (audioInput.files[0].size > MAX_AUDIO_MB * 1024 * 1024) {
      showToast(`El audio pesa más de ${MAX_AUDIO_MB}MB. Comprime el archivo o usa un formato con compresión (MP3/FLAC).`, true);
      return;
    }

    const isExclusiveMode = isExclusiveInput.checked;
    const prices = isExclusiveMode
      ? { basic: '', premium: '', unlimited: '', exclusive: priceExclusiveInput.value }
      : { basic: priceBasicInput.value, premium: pricePremiumInput.value, unlimited: priceUnlimitedInput.value, exclusive: '' };

    if (!isPlaylistInput.checked) {
      const anyPrice = Object.values(prices).some(v => parseFloat(v) > 0);
      if (!anyPrice) {
        showToast(isExclusiveMode
          ? 'Ponle el precio exclusivo a la pista.'
          : 'Ponle precio a al menos una licencia (Básica, Premium o Ilimitada).', true);
        return;
      }
    }

    const formData = new FormData();
    formData.append('title', titleInput.value);
    formData.append('genre', genreInput.value);
    formData.append('description', descriptionInput.value);
    formData.append('isPlaylist', isPlaylistInput.checked ? '1' : '0');
    formData.append('artistCredit', artistCreditInput.value);
    formData.append('priceBasic', prices.basic);
    formData.append('pricePremium', prices.premium);
    formData.append('priceUnlimited', prices.unlimited);
    formData.append('priceExclusive', prices.exclusive);
    formData.append('audio', audioInput.files[0]);
    if (coverInput.files.length) formData.append('cover', coverInput.files[0]);

    uploadBtn.disabled = true;
    uploadProgressWrap.style.display = 'block';
    setUploadProgress(0, 'Subiendo… 0%');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/tracks');

    xhr.upload.addEventListener('progress', (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      setUploadProgress(pct, pct < 100 ? `Subiendo… ${pct}%` : 'Procesando en el servidor…');
    });

    xhr.onload = () => {
      uploadBtn.disabled = false;
      uploadProgressWrap.style.display = 'none';

      let response = {};
      try { response = JSON.parse(xhr.responseText); } catch { /* respuesta no-JSON */ }

      if (xhr.status >= 200 && xhr.status < 300) {
        showToast('Pista publicada correctamente.');
        uploadForm.reset();
        isExclusiveInput.checked = false;
        isPlaylistInput.checked = false;
        playlistOnlyFields.style.display = 'none';
        catalogOnlyFields.style.display = 'block';
        licenseModeFields.style.display = 'block';
        exclusiveModeFields.style.display = 'none';
        document.getElementById('audio-drop-label').textContent = 'MP3, WAV, M4A, OGG o FLAC · máx 150MB';
        document.getElementById('cover-drop-label').textContent = 'JPG, PNG o WEBP · máx 8MB';
        audioDrop.classList.remove('has-file');
        coverDrop.classList.remove('has-file');
        loadTracks();
      } else if (xhr.status === 413) {
        showToast('El archivo es demasiado grande (máx 150MB de audio).', true);
      } else {
        showToast(response.error || `Error al subir (código ${xhr.status}).`, true);
      }
    };

    xhr.onerror = () => {
      uploadBtn.disabled = false;
      uploadProgressWrap.style.display = 'none';
      showToast('Se perdió la conexión durante la subida. Revisa tu internet e intenta de nuevo.', true);
    };

    xhr.ontimeout = () => {
      uploadBtn.disabled = false;
      uploadProgressWrap.style.display = 'none';
      showToast('La subida tardó demasiado y se agotó el tiempo de espera. Intenta con mejor conexión.', true);
    };

    xhr.timeout = 10 * 60 * 1000; // 10 minutos, igual que el servidor
    xhr.send(formData);
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

      item.innerHTML = `
        ${coverSrc ? `<img src="${coverSrc}" alt="">` : `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'/%3E" alt="">`}
        <div class="info">
          <div class="t">${escapeHtml(track.title)}</div>
          <div class="m">${escapeHtml(track.genre || 'Sin género')}${metaExtra} · ${track.plays} reproducciones</div>
        </div>
        ${priceEditHtml}
        <button class="btn-delete" data-id="${track.id}">Eliminar</button>
      `;
      item.querySelector('.btn-delete').addEventListener('click', () => deleteTrack(track.id, track.title));

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
    if (!confirm(`¿Eliminar "${title}"? Esta acción no se puede deshacer.`)) return;
    let res = await fetch(`/api/admin/tracks/${id}`, { method: 'DELETE' });
    if (res.status === 409) {
      const err = await res.json().catch(() => ({}));
      if (!confirm((err.error || 'Esta pista tiene ventas.') + '\n\n¿Eliminarla de todas formas?')) return;
      res = await fetch(`/api/admin/tracks/${id}?force=1`, { method: 'DELETE' });
    }
    if (res.ok) {
      showToast('Pista eliminada.');
      loadTracks();
    } else {
      showToast('No se pudo eliminar.', true);
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

  async function loadOrders() {
    const res = await fetch('/api/admin/orders');
    if (!res.ok) return;
    const { orders } = await res.json();
    renderOrders(orders);
  }

  function formatOrderDate(isoLike) {
    const d = new Date(isoLike.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return isoLike;
    return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
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

      const verifyUrl = order.certificate_id ? location.origin + '/verify/' + order.certificate_id : '';
      const message = encodeURIComponent(
        order.certificate_id
          ? 'Hola ' + order.buyer_name + ' \u{1F44B} Tu compra de "' + order.track_title + '"'
            + (order.price_label ? ' (' + order.price_label + ')' : '') + ' quedo aprobada.\n\n'
            + 'Tu licencia: ' + order.certificate_id + '\n'
            + 'Descarga tu certificado y compruebalo aqui: ' + verifyUrl + '\n\n'
            + 'Guarda ese enlace, es tu comprobante oficial. Gracias por tu compra!'
          : 'Hola ' + order.buyer_name + ' \u{1F44B} Recibi tu comprobante por "' + order.track_title + '"'
            + (order.price_label ? ' (' + order.price_label + ')' : '') + '. Ya lo estoy revisando, en breve te envio tu pista. Gracias por tu compra!'
      );
      const phoneDigits = (order.buyer_phone || '').replace(/[^0-9]/g, '');
      const whatsappHref = phoneDigits ? `https://wa.me/${phoneDigits}?text=${message}` : null;

      item.innerHTML = `
        <img class="receipt-thumb" src="/api/admin/orders/${order.id}/receipt" alt="Comprobante de ${escapeHtml(order.buyer_name)}">
        <div class="info">
          <div class="buyer">${escapeHtml(order.buyer_name)}</div>
          <div class="track">${escapeHtml(order.track_title)}${order.price_label ? ` · ${escapeHtml(order.price_label)}` : ''}</div>
          <div class="meta">${escapeHtml(order.buyer_phone)} · ${formatOrderDate(order.created_at)}${order.status === 'approved' ? ' · <span class=\"order-approved-tag\">Aprobado</span>' : ''}</div>
          ${order.certificate_id ? `<div class="cert-line">Licencia <strong>${escapeHtml(order.certificate_id)}</strong> · <a href="/api/license/${encodeURIComponent(order.certificate_id)}/pdf" target="_blank" rel="noopener">ver PDF</a></div>` : ''}
        </div>
        <div class="actions">
          ${whatsappHref ? `<a class="btn-whatsapp-order" href="${whatsappHref}" target="_blank" rel="noopener">${order.certificate_id ? 'Enviar licencia' : 'WhatsApp'}</a>` : ''}
          ${order.status !== 'approved' ? `<button class="btn-approve-order" type="button">Aprobar</button>` : ''}
          <button class="btn-delete" type="button">Eliminar</button>
        </div>
      `;

      item.querySelector('.receipt-thumb').addEventListener('click', () => {
        receiptModalImg.src = `/api/admin/orders/${order.id}/receipt`;
        receiptModalOverlay.classList.add('active');
      });

      const approveBtn = item.querySelector('.btn-approve-order');
      if (approveBtn) {
        approveBtn.addEventListener('click', () => approveOrder(order.id));
      }

      item.querySelector('.btn-delete').addEventListener('click', () => deleteOrder(order.id, order.buyer_name, order.certificate_id));

      ordersList.appendChild(item);
    });
  }

  async function approveOrder(id) {
    const res = await fetch(`/api/admin/orders/${id}/approve`, { method: 'POST' });
    if (res.ok) {
      const result = await res.json();
      let msg = 'Pedido aprobado.';
      if (result.wentToVip) {
        msg = 'Aprobado — la pista exclusiva se retiró del catálogo y pasó a Beats VIP.';
      } else if (result.trackMarkedSold) {
        msg = 'Aprobado — licencia Ilimitada: la pista se retiró del catálogo (no va a Beats VIP).';
      }
      showToast(msg + ' El comprador ya puede descargar desde «Mis compras».');
      if (result.warning) alert(result.warning);
      loadOrders();
      loadTracks();
      loadProducers();
      loadHistory();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'No se pudo aprobar el pedido.', true);
      loadOrders();
    }
  }

  async function deleteOrder(id, buyerName, certificateId) {
    const aviso = certificateId
      ? '¿Eliminar la foto del comprobante de "' + buyerName + '"?\n\nLa licencia ' + certificateId + ' se conserva: el comprador va a poder seguir verificándola y descargando su PDF. Solo se borra la imagen para liberar espacio.'
      : '¿Eliminar el comprobante de "' + buyerName + '"? Este pedido no tiene licencia emitida, así que se borra por completo.';
    if (!confirm(aviso)) return;
    const res = await fetch('/api/admin/orders/' + id, { method: 'DELETE' });
    if (res.ok) {
      const r = await res.json().catch(() => ({}));
      showToast(r.keptLicense
        ? 'Foto eliminada. La licencia ' + r.certificateId + ' sigue activa.'
        : 'Comprobante eliminado.');
      loadOrders();
    } else {
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

  const restoreInput = document.getElementById('restore-input');
  restoreInput.addEventListener('change', async () => {
    const file = restoreInput.files[0];
    if (!file) return;

    const firstConfirm = confirm(
      `¿Restaurar el backup "${file.name}"?\n\nEsto va a BORRAR todas las pistas, imágenes y comprobantes que estén guardados ahora mismo, y los va a reemplazar por los del backup.`
    );
    if (!firstConfirm) {
      restoreInput.value = '';
      return;
    }
    const secondConfirm = confirm('Esta acción no se puede deshacer. ¿Confirmas que quieres continuar?');
    if (!secondConfirm) {
      restoreInput.value = '';
      return;
    }

    showToast('Restaurando backup, esto puede tardar unos segundos…');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const res = await fetch('/api/admin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: arrayBuffer,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo restaurar el backup');
      }

      const result = await res.json();
      showToast(`Backup restaurado (${result.restoredCount} archivos). El servidor se está reiniciando…`);
      setTimeout(() => window.location.reload(), 4000);
    } catch (err) {
      showToast(err.message, true);
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
          '<div class="stats">' + p.trackCount + ' beats · ' + p.totalSalesCup + ' CUP vendidos · ' + Number(p.pendingPayoutCup || 0).toLocaleString('es', { maximumFractionDigits: 2 }) + ' CUP pendientes de pagarle</div>' +
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
          '<button type="button" class="btn-delete">Eliminar</button>' +
        '</div>';

      const apr = item.querySelector('.btn-approve-prod');
      if (apr) apr.addEventListener('click', async () => {
        const r = await fetch('/api/admin/producers/' + p.id + '/approve', { method: 'POST' });
        showToast(r.ok ? 'Productor aprobado. Ya puede entrar y subir beats.' : 'No se pudo aprobar.', !r.ok);
        loadProducers();
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
        if (!confirm('¿Eliminar a ' + p.name + '?\n\nSe borran TODOS sus beats y archivos de la app. Las ventas ya aprobadas y sus licencias se conservan. Esto no se puede deshacer.' +
          (deuda > 0 ? '\n\nATENCIÓN: todavía le debes ' + deuda.toLocaleString('es') + ' CUP por ventas. Si lo eliminas, esa deuda desaparece del panel «Pagos a productores».' : ''))) return;
        const r = await fetch('/api/admin/producers/' + p.id, { method: 'DELETE' });
        if (r.ok) {
          const d = await r.json();
          showToast('Productor eliminado (' + d.tracksEliminados + ' beats borrados, ' + d.ventasConservadas + ' ventas conservadas).' +
            (d.deudaPendienteCup > 0 ? ' Ojo: le quedaban ' + d.deudaPendienteCup + ' CUP sin pagar.' : ''));
          loadProducers(); loadTracks(); loadPayouts(); loadPlanRequests();
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

    const res = await fetch('/api/admin/producers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
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
    pendingTracksCount.classList.toggle('show', tracks.length > 0);

    if (!tracks.length) {
      pendingTracksList.innerHTML = '<div class="empty-hint">No hay beats pendientes por revisar.</div>';
      return;
    }

    tracks.forEach((t) => {
      const item = document.createElement('div');
      item.className = 'pending-track-item';
      const coverSrc = t.cover_filename ? `/api/cover/${t.id}` : '';
      item.innerHTML = `
        ${coverSrc ? `<img src="${coverSrc}" alt="">` : `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'/%3E" alt="">`}
        <div class="info">
          <div class="t">${escapeHtml(t.title)}</div>
          <div class="m">${escapeHtml(t.genre || 'Sin género')} · ${escapeHtml(t.price_label || '')}</div>
          <div class="producer">${escapeHtml(t.producer_name || 'Sin productor')} · ${escapeHtml(t.producer_email || '')}</div>
        </div>
        <audio controls preload="none" src="/api/admin/preview-audio/${t.id}"></audio>
        <div class="actions">
          <button type="button" class="btn-approve-order">Aprobar</button>
          <button type="button" class="btn-reject-track">Rechazar</button>
        </div>
      `;
      item.querySelector('.btn-approve-order').addEventListener('click', async () => {
        const res = await fetch(`/api/admin/tracks/${t.id}/approve`, { method: 'POST' });
        if (res.ok) {
          showToast('Beat aprobado, ya está visible en la tienda.');
          loadPendingTracks();
        } else {
          showToast('No se pudo aprobar.', true);
        }
      });
      item.querySelector('.btn-reject-track').addEventListener('click', async () => {
        if (!confirm(`¿Rechazar "${t.title}"? No aparecerá en la tienda.`)) return;
        const reason = prompt('¿Por qué lo rechazas? (opcional, se lo va a mostrar al productor)') || '';
        const res = await fetch(`/api/admin/tracks/${t.id}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        });
        if (res.ok) {
          showToast('Beat rechazado.');
          loadPendingTracks();
        } else {
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

  async function loadCommission() {
    const res = await fetch('/api/admin/platform-config');
    if (!res.ok) return;
    const d = await res.json();
    adminPhoneInput.value = d.adminPhone || '';
    planProPriceInput.value = d.planPriceProCup || '';
    planStudioPriceInput.value = d.planPriceStudioCup || '';
  }

  platformForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch('/api/admin/platform-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminPhone: adminPhoneInput.value,
        planPriceProCup: planProPriceInput.value,
        planPriceStudioCup: planStudioPriceInput.value,
      }),
    });
    if (res.ok) showToast('Precios de los planes guardados.');
    else { const e2 = await res.json().catch(() => ({})); showToast(e2.error || 'No se pudo guardar.', true); }
  });

  const historyList = document.getElementById('history-list');
  const historyCount = document.getElementById('history-count');

  async function loadHistory() {
    const res = await fetch('/api/admin/orders-history');
    if (!res.ok) return;
    const { orders } = await res.json();
    historyCount.textContent = orders.length || '';
    historyCount.classList.toggle('show', orders.length > 0);
    historyList.innerHTML = '';
    if (!orders.length) {
      historyList.innerHTML = '<div class="empty-hint">Todavía no hay compras aprobadas.</div>';
      return;
    }
    orders.forEach((o) => {
      const item = document.createElement('div');
      item.className = 'order-item';
      const vendedor = o.producer_name ? ('Productor: ' + escapeHtml(o.producer_name)) : 'Tuyo';
      const wa = (o.buyer_phone || '').replace(/[^0-9]/g, '');
      const linkCompra = o.buyer_token ? location.origin + '/?compra=' + o.buyer_token : '';
      const waText = encodeURIComponent('Hola ' + o.buyer_name + ' \u{1F44B} Tu compra de "' + o.track_title + '" está aprobada.\n\n' +
        (linkCompra ? 'Descarga tu beat y tu licencia aquí (este link es solo tuyo, no lo compartas):\n' + linkCompra + '\n\n' : '') +
        'Número de licencia: ' + (o.certificate_id || '') + '\nCualquiera puede verificarla en: ' + location.origin + '/verify/' + (o.certificate_id || '') + '\n\n¡Gracias por tu compra!');
      item.innerHTML =
        (o.receipt_filename
          ? '<img class="receipt-thumb" src="/api/admin/orders/' + o.id + '/receipt" alt="">'
          : '<div class="receipt-thumb receipt-gone">sin foto</div>') +
        '<div class="info">' +
          '<div class="buyer">' + escapeHtml(o.buyer_name) + '</div>' +
          '<div class="track">' + escapeHtml(o.track_title) + ' · ' + escapeHtml(o.price_label || '') + '</div>' +
          '<div class="meta">' + escapeHtml(o.buyer_phone) + ' · ' + formatOrderDate(o.created_at) + ' · ' + vendedor + '</div>' +
          (o.certificate_id ? '<div class="cert-line">Licencia <strong>' + escapeHtml(o.certificate_id) + '</strong></div>' : '') +
        '</div>' +
        '<div class="actions">' +
          (o.certificate_id ? '<a class="btn-whatsapp-order" href="/api/license/' + encodeURIComponent(o.certificate_id) + '/pdf" target="_blank" rel="noopener">Descargar PDF</a>' : '') +
          (wa ? '<a class="btn-toggle-producer" href="https://wa.me/' + wa + '?text=' + waText + '" target="_blank" rel="noopener">Enviar link por WhatsApp</a>' : '') +
          (linkCompra ? '<button type="button" class="btn-toggle-producer btn-copy-link">Copiar link de descarga</button>' : '') +
        '</div>';
      const cp = item.querySelector('.btn-copy-link');
      if (cp) cp.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(linkCompra); showToast('Link copiado. Es privado: solo mándaselo al comprador.'); }
        catch { prompt('Copia este link y mándaselo al comprador:', linkCompra); }
      });
      if (o.receipt_filename) {
        item.querySelector('.receipt-thumb').addEventListener('click', () => {
          receiptModalImg.src = '/api/admin/orders/' + o.id + '/receipt';
          receiptModalOverlay.classList.add('active');
        });
      }
      historyList.appendChild(item);
    });
  }

  // ---------- Compras de planes (productores) ----------
  const planRequestsList = document.getElementById('plan-requests-list');
  const planRequestsCount = document.getElementById('plan-requests-count');
  const PLAN_NAMES = { pro: 'Pro', studio: 'Studio', free: 'Free' };

  async function loadPlanRequests() {
    const res = await fetch('/api/admin/plan-requests');
    if (!res.ok) return;
    const { requests } = await res.json();
    const pend = requests.filter(r => r.status === 'pending');
    planRequestsCount.textContent = pend.length || '';
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
            ' · ' + formatOrderDate(r.created_at) + ' · plan actual: ' + (PLAN_NAMES[r.current_plan] || r.current_plan || '—') + '</div>' +
          '<div class="meta">' + estado + '</div>' +
        '</div>' +
        '<div class="actions">' +
          (r.status === 'pending'
            ? '<button type="button" class="btn-approve-order btn-approve-plan">Aprobar y activar</button>' +
              '<button type="button" class="btn-reject-track btn-reject-plan">Rechazar</button>'
            : '') +
          (wa ? '<a class="btn-toggle-producer" href="https://wa.me/' + wa + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
        '</div>';
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

  // ---------- Pagos a productores ----------
  const payoutsList = document.getElementById('payouts-list');
  const payoutsCount = document.getElementById('payouts-count');
  const payoutsHistory = document.getElementById('payouts-history');
  const fmtCup = (n) => Number(n || 0).toLocaleString('es', { maximumFractionDigits: 2 }) + ' CUP';

  async function loadPayouts() {
    const res = await fetch('/api/admin/payouts');
    if (!res.ok) return;
    const { pendientes, historial } = await res.json();
    const vencidos = pendientes.filter(p => p.vencido).length;
    payoutsCount.textContent = pendientes.length ? (vencidos ? vencidos + ' atrasado' + (vencidos > 1 ? 's' : '') : pendientes.length) : '';
    payoutsCount.classList.toggle('show', pendientes.length > 0);
    payoutsList.innerHTML = '';
    if (!pendientes.length) {
      payoutsList.innerHTML = '<div class="empty-hint">No le debes nada a ningún productor ahora mismo.</div>';
    }
    pendientes.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'payout-item' + (p.vencido ? ' is-late' : '');
      const wa = String(p.phone || '').replace(/[^0-9]/g, '');
      const vence = p.venceEl ? new Date(p.venceEl) : null;
      const cuentas = p.cuentas.length
        ? p.cuentas.map(c => '<div class="payout-account"><strong>' + escapeHtml(c.currency) + '</strong> · ' + escapeHtml(c.bank || '') + ' · <code>' + escapeHtml(c.number || '') + '</code></div>').join('')
        : '<div class="payout-account muted">No ha puesto cuentas de cobro todavía — pídeselas por WhatsApp.</div>';
      const detalle = p.ordenes.map(o =>
        '<li>' + escapeHtml(o.track_title) + ' · ' + escapeHtml(o.license_type || '') + ' · vendido en ' + fmtCup(o.price_cup_at_sale) +
        ' − ' + Number(o.commission_percent_at_sale || 0) + '% = <strong>' + fmtCup(o.producer_earning_cup) + '</strong></li>').join('');
      item.innerHTML =
        '<div class="payout-head">' +
          '<div>' +
            '<div class="buyer">' + escapeHtml(p.name) + ' <span class="muted">· plan ' + escapeHtml(p.plan) + ' (paga en ' + escapeHtml(p.plazo) + ')</span></div>' +
            '<div class="meta">' + escapeHtml(p.email) + (p.phone ? ' · ' + escapeHtml(p.phone) : '') + '</div>' +
          '</div>' +
          '<div class="payout-amount">' + fmtCup(p.totalCup) + '<span>' + p.ventas + ' venta' + (p.ventas > 1 ? 's' : '') + '</span></div>' +
        '</div>' +
        '<div class="payout-due ' + (p.vencido ? 'late' : '') + '">' +
          (vence ? (p.vencido ? 'ATRASADO — debías pagarle antes del ' : 'Págale antes del ') + vence.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '') +
        '</div>' +
        '<div class="payout-accounts">' + cuentas + '</div>' +
        '<details class="payout-detail"><summary>Ver ventas</summary><ul>' + detalle + '</ul></details>' +
        '<div class="actions">' +
          '<button type="button" class="btn-approve-order btn-mark-paid">Marcar como pagado</button>' +
          (wa ? '<a class="btn-toggle-producer" href="https://wa.me/' + wa + '?text=' + encodeURIComponent('Hola ' + p.name + ', te acabo de transferir ' + fmtCup(p.totalCup) + ' por tus ventas en Zona Beats.') + '" target="_blank" rel="noopener">Avisar por WhatsApp</a>' : '') +
        '</div>';
      item.querySelector('.btn-mark-paid').addEventListener('click', async (ev) => {
        const note = prompt('¿Ya le transferiste ' + fmtCup(p.totalCup) + ' a ' + p.name + '?\n\nNota opcional (ej: número de transferencia):', '');
        if (note === null) return;
        ev.target.disabled = true;
        const r2 = await fetch('/api/admin/payouts/' + p.producerId, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note, orderIds: p.ordenes.map(o => o.id) }),
        });
        if (r2.ok) { showToast('Pago registrado. ' + p.name + ' lo verá como cobrado en su portal.'); loadPayouts(); loadProducers(); }
        else { const e2 = await r2.json().catch(() => ({})); showToast(e2.error || 'No se pudo registrar el pago.', true); ev.target.disabled = false; }
      });
      payoutsList.appendChild(item);
    });

    payoutsHistory.innerHTML = historial.length
      ? historial.map(h => '<div class="payout-history-row"><span>' + formatOrderDate(h.created_at) + '</span><span>' + escapeHtml(h.producer_name) + '</span><strong>' + fmtCup(h.amount_cup) + '</strong><span class="muted">' + h.orders_count + ' venta(s)' + (h.note ? ' · ' + escapeHtml(h.note) : '') + '</span></div>').join('')
      : '<div class="empty-hint">Todavía no has registrado pagos.</div>';
  }

  checkAuth();
})();
