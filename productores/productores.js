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

  function showApp(name) {
    loginScreen.style.display = 'none';
    dashShell.style.display = 'block';
    producerNameLabel.textContent = name || '';
    loadTracks();
    loadEarnings();
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
    const res = await fetch('/api/producer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value }),
    });
    if (res.ok) {
      const { name } = await res.json();
      passwordInput.value = '';
      showApp(name);
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

    const prices = {
      basic: priceBasicInput.value,
      premium: pricePremiumInput.value,
      unlimited: priceUnlimitedInput.value,
      exclusive: priceExclusiveInput.value,
    };
    const anyPrice = Object.values(prices).some(v => parseFloat(v) > 0);
    if (!anyPrice) {
      showToast('Ponle precio a al menos una licencia (Básica, Premium, Ilimitada o Exclusiva).', true);
      return;
    }

    const formData = new FormData();
    formData.append('title', titleInput.value);
    formData.append('genre', genreInput.value);
    formData.append('description', descriptionInput.value);
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
        audioDropLabel.textContent = 'MP3, WAV, M4A, OGG o FLAC · máx 150MB';
        coverDropLabel.textContent = 'JPG, PNG o WEBP · máx 8MB';
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
        ? { text: 'Vendido (exclusiva)', className: 'sold' }
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
    statEarnings.textContent = summary.totalEarningsCup.toLocaleString('es', { maximumFractionDigits: 2 });

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
          <div class="m">${formatOrderDate(o.created_at)} ${isPending ? '· pendiente de aprobación' : ''}</div>
        </div>
        <div class="amount">${isPending ? '—' : `+${Number(o.producer_earning_cup).toLocaleString('es', { maximumFractionDigits: 2 })} CUP`}</div>
      `;
      earningsList.appendChild(item);
    });
  }

  checkAuth();
})();
