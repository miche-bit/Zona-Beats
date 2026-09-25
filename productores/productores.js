(() => {
  const loginScreen = document.getElementById('login-screen');
  const dashShell = document.getElementById('dash-shell');
  const emailInput = document.getElementById('email-input');
  const passwordInput = document.getElementById('password-input');
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');
  const producerNameLabel = document.getElementById('producer-name-label');

  const uploadForm = document.getElementById('upload-form');
  const uploadBtn = document.getElementById('upload-btn');
  const uploadProgressWrap = document.getElementById('upload-progress-wrap');
  const uploadProgressFill = document.getElementById('upload-progress-fill');
  const uploadProgressLabel = document.getElementById('upload-progress-label');
  const titleInput = document.getElementById('title-input');
  const genreInput = document.getElementById('genre-input');
  const descriptionInput = document.getElementById('description-input');
  const priceBasicInput = document.getElementById('price-basic-input');
  const pricePremiumInput = document.getElementById('price-premium-input');
  const priceUnlimitedInput = document.getElementById('price-unlimited-input');
  const priceExclusiveInput = document.getElementById('price-exclusive-input');
  const isPlaylistInput = document.getElementById('is-playlist-input');
  const artistCreditField = document.getElementById('artist-credit-field');
  const artistCreditInput = document.getElementById('artist-credit-input');
  const saleFields = document.getElementById('sale-fields');
  const wavInput = document.getElementById('wav-input');
  const stemsInput = document.getElementById('stems-input');
  const wavStemsField = document.getElementById('wav-stems-field');
  const stemsField = document.getElementById('stems-field');
  const makeExclusiveInput = document.getElementById('make-exclusive-input');
  const licenseModeFields = document.getElementById('license-mode-fields');
  const exclusiveModeFields = document.getElementById('exclusive-mode-fields');
  const audioInput = document.getElementById('audio-input');
  const coverInput = document.getElementById('cover-input');
  const audioDrop = document.getElementById('audio-drop');
  const coverDrop = document.getElementById('cover-drop');
  const audioDropLabel = document.getElementById('audio-drop-label');
  const coverDropLabel = document.getElementById('cover-drop-label');

  const trackList = document.getElementById('track-list');
  const earningsList = document.getElementById('earnings-list');
  const statSales = document.getElementById('stat-sales');
  const statTotal = document.getElementById('stat-total');
  const statEarnings = document.getElementById('stat-earnings');

  const toast = document.getElementById('toast');

  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => { toast.className = 'toast'; }, 3000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function setUploadProgress(pct, label) {
    uploadProgressFill.style.width = `${pct}%`;
    uploadProgressLabel.textContent = label;
  }

  function applyExclusivePermission(enabled) {
    const wrap = document.getElementById('exclusive-toggle-wrap');
    if (!wrap) return;
    if (enabled) {
      wrap.classList.remove('locked');
      makeExclusiveInput.disabled = false;
      const note = wrap.querySelector('.exclusive-locked-note');
      if (note) note.remove();
    } else {
      wrap.classList.add('locked');
      makeExclusiveInput.disabled = true;
      makeExclusiveInput.checked = false;
      licenseModeFields.style.display = 'block';
      exclusiveModeFields.style.display = 'none';
      if (!wrap.querySelector('.exclusive-locked-note')) {
        const note = document.createElement('div');
        note.className = 'exclusive-locked-note';
        note.textContent = 'La licencia Exclusiva (etiqueta EXCLUSIVA + aparecer en Beats VIP) es un beneficio aparte. Contacta al administrador para activarla en tu cuenta.';
        wrap.appendChild(note);
      }
    }
  }

  function showApp(name, exclusiveEnabled) {
    loginScreen.style.display = 'none';
    dashShell.style.display = 'block';
    producerNameLabel.textContent = name || '';
    applyExclusivePermission(Boolean(exclusiveEnabled));
    loadTracks();
    loadEarnings();
    loadPerfil();
  }

  function showLogin() {
    loginScreen.style.display = 'flex';
    dashShell.style.display = 'none';
  }

  async function checkAuth() {
    const res = await fetch('/api/producer/check');
    const { authenticated, name, exclusiveEnabled } = await res.json();
    if (authenticated) showApp(name, exclusiveEnabled); else showLogin();
  }

  loginBtn.addEventListener('click', async () => {
    loginError.classList.remove('show');
    const res = await fetch('/api/producer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value }),
    });
    if (res.ok) {
      const { name } = await res.json();
      passwordInput.value = '';
      const check = await (await fetch('/api/producer/check')).json();
      showApp(name, check.exclusiveEnabled);
    } else {
      void loginError.offsetWidth;
      loginError.classList.add('show');
    }
  });

  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
  });
  emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') passwordInput.focus();
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/producer/logout', { method: 'POST' });
    showLogin();
  });

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
  wireFileDrop(audioDrop, audioInput, audioDropLabel, 'MP3, WAV, M4A, OGG o FLAC · máx 150MB');
  wireFileDrop(coverDrop, coverInput, coverDropLabel, 'JPG, PNG o WEBP · máx 8MB');
  wireFileDrop(document.getElementById('wav-drop'), wavInput, document.getElementById('wav-drop-label'), 'WAV en alta calidad');
  wireFileDrop(document.getElementById('stems-drop'), stemsInput, document.getElementById('stems-drop-label'), 'Archivo ZIP con los stems');

  isPlaylistInput.addEventListener('change', () => {
    const esPlaylist = isPlaylistInput.checked;
    artistCreditField.style.display = esPlaylist ? 'block' : 'none';
    saleFields.style.display = esPlaylist ? 'none' : 'block';
    document.getElementById('exclusive-toggle-wrap').style.display = esPlaylist ? 'none' : 'block';
    wavStemsField.style.display = (esPlaylist || wavStemsField.dataset.allowed === '0') ? 'none' : 'block';
    stemsField.style.display = (esPlaylist || stemsField.dataset.allowed === '0') ? 'none' : 'block';
    if (esPlaylist) makeExclusiveInput.checked = false;
  });

  makeExclusiveInput.addEventListener('change', () => {
    const exclusive = makeExclusiveInput.checked;
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
    if (!coverInput.files.length) {
      showToast('La portada es obligatoria (cuadrada, 3000x3000 px).', true);
      return;
    }

    const MAX_AUDIO_MB = 150;
    if (audioInput.files[0].size > MAX_AUDIO_MB * 1024 * 1024) {
      showToast(`El audio pesa más de ${MAX_AUDIO_MB}MB. Comprime el archivo o usa un formato con compresión (MP3/FLAC).`, true);
      return;
    }

    const esPlaylist = isPlaylistInput.checked;
    let prices = { basic: '', premium: '', unlimited: '', exclusive: '' };

    if (!esPlaylist) {
      const isExclusiveMode = makeExclusiveInput.checked;
      prices = isExclusiveMode
        ? { basic: '', premium: '', unlimited: '', exclusive: priceExclusiveInput.value }
        : { basic: priceBasicInput.value, premium: pricePremiumInput.value, unlimited: priceUnlimitedInput.value, exclusive: '' };

      const anyPrice = Object.values(prices).some(v => parseFloat(v) > 0);
      if (!anyPrice) {
        showToast(isExclusiveMode
          ? 'Ponle el precio exclusivo al beat.'
          : 'Ponle precio a al menos una licencia (Básica, Premium o Ilimitada).', true);
        return;
      }
    }

    const formData = new FormData();
    formData.append('title', titleInput.value);
    formData.append('genre', genreInput.value);
    formData.append('description', descriptionInput.value);
    formData.append('isPlaylist', esPlaylist ? '1' : '0');
    formData.append('artistCredit', esPlaylist ? artistCreditInput.value : '');
    formData.append('priceBasic', prices.basic);
    formData.append('pricePremium', prices.premium);
    formData.append('priceUnlimited', prices.unlimited);
    formData.append('priceExclusive', prices.exclusive);
    formData.append('audio', audioInput.files[0]);
    formData.append('cover', coverInput.files[0]);
    if (!esPlaylist && wavInput.files.length) formData.append('wavFile', wavInput.files[0]);
    if (!esPlaylist && stemsInput.files.length) formData.append('stemsFile', stemsInput.files[0]);

    uploadBtn.disabled = true;
    uploadProgressWrap.style.display = 'block';
    setUploadProgress(0, 'Subiendo… 0%');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/producer/tracks');

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
        showToast('Beat enviado a revisión. Aparecerá en la tienda cuando el administrador lo apruebe.');
        uploadForm.reset();
        makeExclusiveInput.checked = false;
        isPlaylistInput.checked = false;
        artistCreditField.style.display = 'none';
        saleFields.style.display = 'block';
        document.getElementById('exclusive-toggle-wrap').style.display = 'block';
        wavStemsField.style.display = wavStemsField.dataset.allowed === '0' ? 'none' : 'block';
        stemsField.style.display = stemsField.dataset.allowed === '0' ? 'none' : 'block';
        licenseModeFields.style.display = 'block';
        exclusiveModeFields.style.display = 'none';
        audioDropLabel.textContent = 'MP3, WAV, M4A, OGG o FLAC · máx 150MB';
        coverDropLabel.textContent = 'JPG, PNG o WEBP · máx 8MB';
        document.getElementById('wav-drop-label').textContent = 'WAV en alta calidad';
        document.getElementById('stems-drop-label').textContent = 'Archivo ZIP con los stems';
        audioDrop.classList.remove('has-file');
        coverDrop.classList.remove('has-file');
        loadTracks();
      } else if (xhr.status === 401) {
        showToast('Tu sesión expiró. Vuelve a entrar.', true);
        showLogin();
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

    xhr.timeout = 10 * 60 * 1000;
    xhr.send(formData);
  });

  const STATUS_LABELS = {
    pending: { text: 'En revisión', className: 'pending' },
    approved: { text: 'En la tienda', className: 'approved' },
    rejected: { text: 'Rechazado', className: 'rejected' },
  };

  async function loadTracks() {
    const res = await fetch('/api/producer/tracks');
    if (!res.ok) return;
    const { tracks } = await res.json();
    renderTracks(tracks);
  }

  function renderTracks(tracks) {
    trackList.innerHTML = '';
    if (!tracks.length) {
      trackList.innerHTML = '<div class="empty-hint">Todavía no has subido ningún beat.</div>';
      return;
    }

    tracks.forEach((t) => {
      const item = document.createElement('div');
      item.className = 'track-item';
      const coverSrc = t.cover_filename ? `/api/cover/${t.id}` : '';
      const statusInfo = t.sold
        ? (t.is_exclusive
            ? { text: 'Vendido (Exclusiva)', className: 'sold' }
            : { text: 'Vendido (Ilimitada)', className: 'sold' })
        : (STATUS_LABELS[t.approval_status] || STATUS_LABELS.pending);
      const rejectionNote = (t.approval_status === 'rejected' && t.rejection_reason)
        ? `<div class="m" style="color:var(--danger);margin-top:4px;">Motivo: ${escapeHtml(t.rejection_reason)}</div>`
        : '';

      item.innerHTML = `
        ${coverSrc ? `<img src="${coverSrc}" alt="">` : `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='46' height='46'/%3E" alt="">`}
        <div class="info">
          <div class="t">${escapeHtml(t.title)}</div>
          <div class="m">${escapeHtml(t.genre || 'Sin género')} · ${escapeHtml(t.price_label || '')} · ${t.plays || 0} reproducciones</div>
          ${rejectionNote}
        </div>
        <span class="status-badge ${statusInfo.className}">${statusInfo.text}</span>
        ${!t.sold ? `<button type="button" class="btn-delete-track" data-id="${t.id}">Eliminar</button>` : ''}
      `;

      const deleteBtn = item.querySelector('.btn-delete-track');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => deleteTrack(t.id, t.title));
      }

      trackList.appendChild(item);
    });
  }

  async function deleteTrack(id, title) {
    if (!confirm(`¿Eliminar "${title}"? Esta acción no se puede deshacer.`)) return;
    const res = await fetch(`/api/producer/tracks/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Beat eliminado.');
      loadTracks();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'No se pudo eliminar.', true);
    }
  }

  function formatOrderDate(isoLike) {
    const d = new Date((isoLike || '').replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return isoLike || '';
    return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  const LICENSE_LABELS = { basic: 'Básica', premium: 'Premium', unlimited: 'Ilimitada', exclusive: 'Exclusiva' };

  async function loadEarnings() {
    const res = await fetch('/api/producer/earnings');
    if (!res.ok) return;
    const { orders, summary } = await res.json();

    statSales.textContent = summary.totalSales;
    statTotal.textContent = summary.totalSalesCup.toLocaleString('es');
    statEarnings.textContent = Number(summary.pendingCup || 0).toLocaleString('es', { maximumFractionDigits: 2 });
    document.getElementById('stat-paid').textContent = Number(summary.paidCup || 0).toLocaleString('es', { maximumFractionDigits: 2 });
    const due = document.getElementById('stat-due');
    if (summary.nextPayoutDue && summary.pendingCup > 0) {
      const d = new Date(summary.nextPayoutDue);
      due.textContent = 'Pago previsto antes del ' + d.toLocaleDateString('es', { day: '2-digit', month: 'short' }) + ' (plazo de tu plan: ' + (summary.payoutTerm || '') + ')';
    } else {
      due.textContent = '';
    }

    renderEarnings(orders);
  }

  function renderEarnings(orders) {
    earningsList.innerHTML = '';
    if (!orders.length) {
      earningsList.innerHTML = '<div class="empty-hint">Todavía no tienes ventas.</div>';
      return;
    }

    orders.forEach((o) => {
      const item = document.createElement('div');
      item.className = 'earning-item';
      const licenseLabel = LICENSE_LABELS[o.license_type] || o.license_type;
      const isPending = o.status !== 'approved';
      item.innerHTML = `
        <div class="info">
          <div class="t">${escapeHtml(o.current_title || o.track_title)} · ${escapeHtml(licenseLabel)}</div>
          <div class="m">${formatOrderDate(o.created_at)} ${isPending ? '· pendiente de aprobación' : `· comisión ${Number(o.commission_percent_at_sale || 0)}%`}</div>
        </div>
        <div class="amount">${isPending ? '—' : `+${Number(o.producer_earning_cup).toLocaleString('es', { maximumFractionDigits: 2 })} CUP<span class="paid-tag ${o.producer_paid ? 'is-paid' : ''}">${o.producer_paid ? 'cobrado' : 'por cobrar'}</span>`}</div>
      `;
      earningsList.appendChild(item);
    });
  }

  document.getElementById('go-register').addEventListener('click', () => {
    document.getElementById('login-mode').style.display = 'none';
    document.getElementById('register-mode').style.display = 'block';
  });
  document.getElementById('go-login').addEventListener('click', () => {
    document.getElementById('register-mode').style.display = 'none';
    document.getElementById('login-mode').style.display = 'block';
  });

  document.getElementById('register-btn').addEventListener('click', async () => {
    const err = document.getElementById('register-error');
    const ok = document.getElementById('register-ok');
    err.classList.remove('show'); ok.classList.remove('show');
    const body = {
      name: document.getElementById('reg-name').value.trim(),
      phone: document.getElementById('reg-phone').value.trim(),
      email: document.getElementById('reg-email').value.trim(),
      password: document.getElementById('reg-password').value,
    };
    const res = await fetch('/api/producer/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.ok) {
      ok.classList.add('show');
      document.getElementById('reg-name').value = '';
      document.getElementById('reg-email').value = '';
      document.getElementById('reg-password').value = '';
      document.getElementById('reg-phone').value = '';
    } else {
      const d = await res.json().catch(() => ({}));
      err.textContent = d.error || 'No se pudo crear la cuenta.';
      void err.offsetWidth;
      err.classList.add('show');
    }
  });

  let perfil = null;

  async function loadPerfil() {
    const res = await fetch('/api/producer/me');
    if (!res.ok) return;
    perfil = await res.json();

    document.getElementById('plan-chip').textContent = perfil.planLabel;
    document.getElementById('plan-facts').innerHTML =
      '<div class="plan-fact"><span>Comisión de la plataforma</span><strong>' + perfil.planCommission + '%</strong></div>' +
      '<div class="plan-fact"><span>Beats activos</span><strong>' + perfil.beatsUsados + (perfil.planMaxBeats ? ' / ' + perfil.planMaxBeats : ' / ilimitados') + '</strong></div>' +
      '<div class="plan-fact"><span>Pago de tus ventas</span><strong>' + perfil.planPayout + '</strong></div>' +
      '<div class="plan-fact"><span>Licencia Exclusiva</span><strong>' + (perfil.exclusiveEnabled ? 'habilitada' : 'no habilitada') + '</strong></div>';

    const warn = document.getElementById('plan-warning');
    if (perfil.plan !== 'free' && !perfil.planVigente) {
      warn.className = 'plan-warning danger';
      warn.textContent = perfil.diasParaEliminar > 0
        ? 'Tu plan venció. Si no lo renuevas en ' + perfil.diasParaEliminar + ' día(s), tu cuenta se desactiva y el administrador puede eliminarla con todos tus beats. Mientras tanto no puedes subir beats nuevos.'
        : 'Tu plan venció y pasó el plazo de 15 días. Tu cuenta puede ser eliminada en cualquier momento. Renueva ya.';
      warn.style.display = 'block';
    } else if (perfil.diasRestantes !== null && perfil.diasRestantes <= 15 && perfil.plan !== 'free') {
      warn.className = 'plan-warning';
      warn.textContent = 'Tu plan vence en ' + perfil.diasRestantes + ' día(s). Renuévalo con el administrador para no perder tu cuenta ni tus beats.';
      warn.style.display = 'block';
    } else {
      warn.style.display = 'none';
    }

    const tel = perfil.adminPhone;
    document.getElementById('plan-contact').innerHTML = tel
      ? 'Para cambiar de plan, renovar o pedir la licencia Exclusiva, escríbele al administrador: <a href="https://wa.me/' + tel.replace(/[^0-9]/g, '') + '" target="_blank" rel="noopener"><strong>' + escapeHtml(tel) + '</strong></a>'
      : 'Para cambiar de plan o renovar, contacta al administrador.';

    const solicitudPendiente = perfil.planRequest && perfil.planRequest.status === 'pending';
    document.getElementById('plans-grid').innerHTML = perfil.planes.map(pl => {
      const esActual = pl.key === perfil.plan;
      let boton = '';
      if (pl.key !== 'free') {
        const texto = esActual ? 'Renovar' : 'Comprar ' + pl.label;
        boton = '<button type="button" class="btn-buy-plan" data-plan="' + pl.key + '"' + (solicitudPendiente ? ' disabled' : '') + '>' + texto + '</button>';
      }
      return '<div class="plan-card' + (esActual ? ' current' : '') + '">' +
        '<div class="plan-card-name">' + pl.label + (esActual ? ' <span class="plan-current-tag">tu plan</span>' : '') + '</div>' +
        '<div class="plan-card-price">' + (pl.priceCup ? formatCup(pl.priceCup) + '/mes' : 'Gratis') + (pl.priceUsd ? ' <span class="plan-usd">(~$' + pl.priceUsd + ')</span>' : '') + '</div>' +
        '<ul class="plan-card-list">' +
          '<li>' + pl.commission + '% de comisión por venta</li>' +
          '<li>' + (pl.maxBeats ? pl.maxBeats + ' beats activos' : 'Beats ilimitados') + '</li>' +
          '<li>' + (pl.stems ? 'MP3 + WAV + STEMS' : (pl.wav ? 'MP3 + WAV' : 'Solo MP3')) + '</li>' +
          '<li>' + (pl.watermarkPreview ? 'Previews con marca de agua' : 'Previews sin marca de agua') + '</li>' +
          '<li>' + (pl.social ? 'Tus redes en tu perfil' : 'Sin redes en tu perfil') + '</li>' +
          '<li>Te pagamos en ' + pl.payout + '</li>' +
          '<li>' + (pl.exclusiveAuto ? 'Exclusivas incluidas' : 'Exclusivas a pedido') + '</li>' +
        '</ul>' + boton +
      '</div>';
    }).join('');
    document.querySelectorAll('.btn-buy-plan').forEach(b => b.addEventListener('click', () => openPlanModal(b.dataset.plan)));
    renderPlanRequestStatus(perfil.planRequest, perfil);

    document.getElementById('profile-name').value = perfil.name || '';
    document.getElementById('profile-bio').value = perfil.bio || '';
    document.getElementById('profile-phone').value = perfil.contactPhone || '';

    const av = document.getElementById('avatar-preview');
    if (perfil.avatar) { av.src = '/api/producer/avatar/' + perfil.id + '?t=' + Date.now(); av.style.display = 'block'; }

    document.getElementById('currency-hint').textContent = perfil.monedasPermitidas.length
      ? 'Solo puedes usar las monedas que acepta la plataforma: ' + perfil.monedasPermitidas.join(', ') + '.'
      : 'El administrador todavía no configuró métodos de cobro.';

    renderSocial(perfil.socialLinks || []);
    renderAccounts(perfil.accounts || []);
    applyExclusivePermission(perfil.exclusiveEnabled);
    applyPlanLimits(perfil);
  }

  function formatCup(n) {
    return Number(n || 0).toLocaleString('es') + ' CUP';
  }

  function renderPlanRequestStatus(r, p) {
    const box = document.getElementById('plan-request-status');
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
      box.innerHTML = 'Tu pago del plan <strong>' + nombre + '</strong> (' + meses + ', ' + formatCup(r.amount_cup) + ') está en revisión. Te activamos el plan en cuanto el administrador confirme la transferencia.';
      box.style.display = 'block';
    } else if (r.status === 'approved') {
      const reciente = r.resolved_at && (Date.now() - new Date(r.resolved_at.replace(' ', 'T') + 'Z').getTime()) < 7 * 24 * 3600 * 1000;
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

  const planModal = document.getElementById('plan-modal');
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
    const dec = code === 'SALDO_MOVIL' ? 0 : 2;
    return v.toLocaleString('es', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' ' + (rate.label || code);
  }

  function actualizarModalPlan() {
    const total = planModalState.price * planModalState.months;
    const code = document.getElementById('plan-currency').value || 'CUP';
    document.getElementById('plan-total').textContent = code === 'CUP' ? formatCup(total) : montoEnMoneda(total, code) + ' (' + formatCup(total) + ')';
    const cuentas = adminPago.accounts.filter(a => a.currency === code);
    document.getElementById('plan-accounts').innerHTML = cuentas.length
      ? cuentas.map(a => '<div class="plan-account"><div><div class="pa-bank">' + escapeHtml(a.bank) + '</div><div class="pa-num">' + escapeHtml(a.number) + '</div></div><button type="button" class="pa-copy" data-n="' + escapeHtml(a.number) + '">Copiar</button></div>').join('')
      : '<p class="panel-hint">No hay cuenta configurada para esa moneda.</p>';
    document.querySelectorAll('.pa-copy').forEach(b => b.addEventListener('click', () => {
      navigator.clipboard && navigator.clipboard.writeText(b.dataset.n).then(() => { b.textContent = 'Copiado'; setTimeout(() => { b.textContent = 'Copiar'; }, 1400); });
    }));
  }

  async function openPlanModal(planKey) {
    const pl = perfil.planes.find(x => x.key === planKey);
    if (!pl) return;
    if (!pl.priceCup) { showToast('El administrador todavía no puso precio a ese plan.', true); return; }
    await cargarDatosDePago();
    planModalState = { plan: planKey, months: 1, price: pl.priceCup };
    document.getElementById('plan-modal-title').textContent = (planKey === perfil.plan ? 'Renovar plan ' : 'Plan ') + pl.label;
    document.getElementById('plan-modal-benefits').textContent =
      pl.commission + '% de comisión · ' + (pl.maxBeats ? pl.maxBeats + ' beats' : 'beats ilimitados') + ' · ' +
      (pl.stems ? 'MP3 + WAV + STEMS' : 'MP3 + WAV') + ' · te pagamos en ' + pl.payout +
      (planKey === perfil.plan && perfil.planVigente ? '. Los meses se suman a tu fecha actual (' + perfil.planPaidUntil + ').' : '.');
    const monedas = [...new Set(adminPago.accounts.map(a => a.currency))];
    const sel = document.getElementById('plan-currency');
    sel.innerHTML = (monedas.length ? monedas : ['CUP']).map(m => {
      const r = adminPago.rates.find(x => x.code === m);
      return '<option value="' + escapeHtml(m) + '">' + escapeHtml((r && r.label) || m) + '</option>';
    }).join('');
    document.querySelectorAll('.month-opt').forEach(b => b.classList.toggle('active', b.dataset.m === '1'));
    document.getElementById('plan-receipt-input').value = '';
    document.getElementById('plan-receipt-label').textContent = 'Toca para subir la captura de la transferencia';
    document.getElementById('plan-receipt-drop').classList.remove('has-file');
    actualizarModalPlan();
    planModal.classList.add('active');
  }

  document.querySelectorAll('.month-opt').forEach(b => b.addEventListener('click', () => {
    planModalState.months = Number(b.dataset.m);
    document.querySelectorAll('.month-opt').forEach(x => x.classList.toggle('active', x === b));
    actualizarModalPlan();
  }));
  document.getElementById('plan-currency').addEventListener('change', actualizarModalPlan);
  document.getElementById('plan-modal-close').addEventListener('click', () => planModal.classList.remove('active'));
  planModal.addEventListener('click', (e) => { if (e.target === planModal) planModal.classList.remove('active'); });
  wireFileDrop(document.getElementById('plan-receipt-drop'), document.getElementById('plan-receipt-input'), document.getElementById('plan-receipt-label'), 'Toca para subir la captura de la transferencia');

  document.getElementById('plan-send-btn').addEventListener('click', async () => {
    const f = document.getElementById('plan-receipt-input').files[0];
    if (!f) { showToast('Adjunta la foto del comprobante.', true); return; }
    const btn = document.getElementById('plan-send-btn');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    const fd = new FormData();
    fd.append('plan', planModalState.plan);
    fd.append('months', String(planModalState.months));
    fd.append('currency', document.getElementById('plan-currency').value || 'CUP');
    fd.append('receipt', f);
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

  function applyPlanLimits(p) {
    const wavF = document.getElementById('wav-stems-field');
    const stemsF = document.getElementById('stems-field');
    const esPlaylist = isPlaylistInput.checked;
    wavF.dataset.allowed = p.puedeWav ? '1' : '0';
    stemsF.dataset.allowed = p.puedeStems ? '1' : '0';
    wavF.style.display = (p.puedeWav && !esPlaylist) ? 'block' : 'none';
    stemsF.style.display = (p.puedeStems && !esPlaylist) ? 'block' : 'none';
    if (!p.puedeWav) wavInput.value = '';
    if (!p.puedeStems) stemsInput.value = '';

    audioInput.accept = p.soloMp3 ? '.mp3' : '.mp3,.wav,.m4a,.ogg,.flac';
    audioDropLabel.textContent = p.soloMp3 ? 'Solo MP3 con tu plan Free · máx 150MB' : 'MP3, WAV, M4A, OGG o FLAC · máx 150MB';

    let note = document.getElementById('plan-format-note');
    if (!note) {
      note = document.createElement('p');
      note.id = 'plan-format-note';
      note.className = 'panel-hint';
      note.style.margin = '0 0 12px';
      document.getElementById('upload-form').prepend(note);
    }
    const partes = [];
    if (p.soloMp3) partes.push('solo puedes subir MP3');
    if (!p.puedeWav) partes.push('no incluye entrega en WAV');
    if (!p.puedeStems) partes.push('no incluye STEMS');
    if (p.previewConMarca) partes.push('tus previews llevan la marca de agua');
    note.textContent = partes.length
      ? 'Con tu plan ' + p.planLabel + ': ' + partes.join(', ') + '.'
      : 'Tu plan ' + p.planLabel + ' incluye todos los formatos y previews sin marca de agua.';

    let redesNote = document.getElementById('redes-plan-note');
    if (!redesNote) {
      redesNote = document.createElement('p');
      redesNote.id = 'redes-plan-note';
      redesNote.className = 'panel-hint';
      redesNote.style.margin = '0 0 8px';
      document.getElementById('social-list').before(redesNote);
    }
    redesNote.textContent = p.puedeRedes
      ? ''
      : 'Con el plan Free tus redes no se muestran en la tienda. Puedes guardarlas ahora y aparecerán cuando pases a Pro o Studio.';
  }

  function renderSocial(links) {
    const cont = document.getElementById('social-list');
    cont.innerHTML = '';
    (links.length ? links : [{ label: '', url: '' }]).forEach(l => addSocialRow(l.label, l.url));
  }

  function addSocialRow(label = '', url = '') {
    const row = document.createElement('div');
    row.className = 'row-pair';
    row.innerHTML =
      '<input type="text" class="s-label" placeholder="Instagram" value="' + escapeHtml(label) + '">' +
      '<input type="text" class="s-url" placeholder="https://…" value="' + escapeHtml(url) + '">' +
      '<button type="button" class="row-remove">&times;</button>';
    row.querySelector('.row-remove').addEventListener('click', () => row.remove());
    document.getElementById('social-list').appendChild(row);
  }

  function renderAccounts(accounts) {
    const cont = document.getElementById('accounts-list');
    cont.innerHTML = '';
    (accounts.length ? accounts : [{ currency: '', bank: '', number: '' }]).forEach(a => addAccountRow(a.currency, a.bank, a.number));
  }

  function addAccountRow(currency = '', bank = '', number = '') {
    const permitidas = (perfil && perfil.monedasPermitidas) || [];
    const row = document.createElement('div');
    row.className = 'row-triple';
    row.innerHTML =
      '<select class="a-currency">' + permitidas.map(m => '<option value="' + m + '"' + (m === currency ? ' selected' : '') + '>' + m + '</option>').join('') + '</select>' +
      '<input type="text" class="a-bank" placeholder="Banco / plataforma" value="' + escapeHtml(bank) + '">' +
      '<input type="text" class="a-number" placeholder="Número de cuenta" value="' + escapeHtml(number) + '">' +
      '<button type="button" class="row-remove">&times;</button>';
    row.querySelector('.row-remove').addEventListener('click', () => row.remove());
    document.getElementById('accounts-list').appendChild(row);
  }

  document.getElementById('add-social').addEventListener('click', () => addSocialRow());
  document.getElementById('add-account').addEventListener('click', () => addAccountRow());

  document.getElementById('save-profile').addEventListener('click', async () => {
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
        name: document.getElementById('profile-name').value,
        bio: document.getElementById('profile-bio').value,
        contactPhone: document.getElementById('profile-phone').value,
        socialLinks, accounts,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.rechazadas && d.rechazadas.length) {
        showToast('Perfil guardado, pero no se aceptaron: ' + d.rechazadas.join(', ') + ' (la plataforma no cobra en esas monedas).', true);
      } else {
        showToast('Perfil guardado.');
      }
      loadPerfil();
    } else {
      showToast('No se pudo guardar el perfil.', true);
    }
  });

  document.getElementById('avatar-input').addEventListener('change', async () => {
    const f = document.getElementById('avatar-input').files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('avatar', f);
    const res = await fetch('/api/producer/avatar', { method: 'POST', body: fd });
    if (res.ok) { showToast('Foto actualizada.'); loadPerfil(); }
    else showToast('No se pudo subir la foto.', true);
  });

  checkAuth();
})();
