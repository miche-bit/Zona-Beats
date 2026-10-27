(() => {
  const audioEl = document.getElementById('audio-el');
  const playerBar = document.getElementById('player-bar');
  const playerCover = document.getElementById('player-cover');
  const playerTitle = document.getElementById('player-title');
  const playBtn = document.getElementById('player-play-btn');
  const iconPlay = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  const progressTrack = document.getElementById('progress-track');
  const timeCurrent = document.getElementById('time-current');
  const timeTotal = document.getElementById('time-total');
  const trackGrid = document.getElementById('track-grid');
  const seccionesCargadas = new Set(); // secciones cuya lista ya llegó (antes: skeleton)
  const emptyState = document.getElementById('empty-state');
  const emptyStateTitle = document.getElementById('empty-state-title');
  const emptyStateText = document.getElementById('empty-state-text');
  const noResultsState = document.getElementById('no-results-state');
  const trackCount = document.getElementById('track-count');
  const sectionTitle = document.getElementById('section-title');
  const searchInput = document.getElementById('search-input');
  const currencySelect = document.getElementById('currency-select');
  const paymentMethodsList = document.getElementById('payment-methods-list');
  const trackPager = document.getElementById('track-pager');
  const genreChips = document.getElementById('genre-chips');

  const buyBtn = document.getElementById('player-buy-btn');
  const buyPriceLabel = document.getElementById('player-buy-price');
  const downloadBtn = document.getElementById('player-download-btn');
  const modalOverlay = document.getElementById('buy-modal-overlay');
  const modalClose = document.getElementById('modal-close-btn');
  const modalTrackTitle = document.getElementById('modal-track-title');
  const modalPrice = document.getElementById('modal-price');
  const modalAccounts = document.getElementById('modal-accounts');
  const modalWhatsappBtn = document.getElementById('modal-whatsapp-btn');
  const receiptDrop = document.getElementById('receipt-drop');
  const receiptInput = document.getElementById('receipt-input');
  const receiptDropText = document.getElementById('receipt-drop-text');
  const receiptPreview = document.getElementById('receipt-preview');

  let currentTrackId = null;
  let currentSection = 'catalog'; // catalog | playlist | vip | packs | producers
  let tracksBySection = { catalog: [], playlist: [], vip: [], packs: [] };
  let discountPercent = 0;
  let paymentInfo = { contactPhone: '', accounts: [] };
  let exchangeRates = [];
  let selectedCurrency = 'CUP';
  let activeModalTrack = null;
  let searchQuery = '';

  // Se bloquea el menú de «guardar imagen/audio» sobre portadas y el reproductor,
  // pero no en campos de texto ni enlaces (hay que poder pegar el teléfono o copiar un link).
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select, a, [contenteditable="true"]')) return;
    e.preventDefault();
  });

  document.addEventListener('keydown', (e) => {
    const k = String(e.key || '').toLowerCase();
    if (
      (e.ctrlKey || e.metaKey) && ['s', 'u'].includes(k) ||
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(k))
    ) {
      e.preventDefault();
    }
  });

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // Escapa también las comillas: el texto puede ir dentro de un atributo (alt, aria-label, href, title)
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  async function loadProfile() {
    const res = await fetch('/api/profile');
    const { profile } = await res.json();
    document.getElementById('artist-name').textContent = profile.artist_name || 'Zona Beats';
    document.getElementById('artist-bio').textContent = profile.bio || '';
    document.title = profile.artist_name ? `${profile.artist_name} · Zona Beats` : 'Zona Beats';
    if (profile.avatar_filename) {
      const avatarImg = document.getElementById('avatar');
      avatarImg.src = '/api/avatar?s=300&_=' + Date.now();
      avatarImg.style.display = 'block';
    }
  }

  async function loadSiteConfig() {
    try {
      const res = await fetch('/api/site-config');
      const config = await res.json();

      const promoBanner = document.getElementById('promo-banner');
      const pct = Number(config.discountPercent) || 0;
      if (config.promoActive && (config.promoText || pct > 0)) {
        const texto = config.promoText || 'Descuento en todo el catálogo';
        // El % sale del mismo campo que baja los precios, así nunca hay dos números distintos.
        document.getElementById('promo-banner-text').textContent = pct > 0 ? '−' + pct + '% · ' + texto : texto;
        promoBanner.style.display = 'flex';
      } else {
        promoBanner.style.display = 'none';
      }

      const scheduleWrap = document.getElementById('hero-schedule');
      if (config.scheduleText) {
        document.getElementById('hero-schedule-text').textContent = config.scheduleText;
        scheduleWrap.style.display = 'flex';
      } else {
        scheduleWrap.style.display = 'none';
      }
    } catch {
      /* si falla, simplemente no se muestran */
    }
  }

  const SOCIAL_ICONS = {
    spotify: '<svg viewBox="0 0 24 24"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141 4.32-1.32 9.66-.66 13.32 1.621.361.181.54.78.421 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.18-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743l-.002-.001.002.001a2.895 2.895 0 0 1 3.183-4.51v-3.5a6.329 6.329 0 0 0-5.394 10.692 6.33 6.33 0 0 0 10.857-4.424V8.687a8.182 8.182 0 0 0 4.773 1.526V6.79a4.831 4.831 0 0 1-1.003-.104z"/></svg>',
    soundcloud: '<svg viewBox="0 0 24 24"><path d="M1.175 12.225c-.051 0-.094.046-.101.104l-.233 2.154.233 2.105c.007.058.05.104.101.104.05 0 .092-.046.099-.104l.267-2.105-.267-2.154c-.007-.058-.049-.104-.099-.104zm-.899.828c-.06 0-.091.037-.104.09L0 14.479l.172 1.308c.013.053.044.09.104.09.06 0 .097-.037.108-.09l.148-1.308-.148-1.336c-.011-.053-.048-.09-.108-.09zm1.83-1.229c-.06 0-.109.05-.116.113l-.219 2.542.219 2.457c.007.063.056.113.116.113.061 0 .11-.05.117-.115l.248-2.455-.248-2.543c-.007-.063-.056-.112-.117-.112zm.937-.238c-.069 0-.124.058-.13.129l-.202 2.752.202 2.657c.006.071.061.129.13.129.068 0 .124-.058.132-.13l.229-2.656-.229-2.753c-.008-.07-.064-.128-.132-.128zm.983-.135c-.077 0-.138.064-.144.144l-.187 2.882.187 2.766c.006.08.067.144.144.144.076 0 .138-.064.145-.145l.212-2.765-.212-2.883c-.007-.08-.069-.143-.145-.143zm1.06-.174c-.084 0-.153.071-.158.16l-.169 3.05.169 2.87c.005.089.074.159.158.159.085 0 .154-.071.16-.16l.191-2.869-.191-3.052c-.006-.088-.075-.159-.16-.159zm1.153 3.209l-.174 2.964c.005.098.081.174.174.174.093 0 .17-.076.175-.174l.196-2.964-.196-4.85c-.005-.097-.082-.174-.175-.174-.093 0-.169.076-.174.174zm1.243-5.222c-.006-.107-.09-.19-.192-.19-.104 0-.187.083-.192.19l-.177 5.038.177 2.938c.005.107.088.19.192.19.102 0 .186-.083.192-.19l.201-2.938-.201-5.038zm1.048-.398c-.005-.113-.099-.203-.209-.203-.111 0-.204.09-.208.204l-.16 5.435.16 2.907c.004.113.097.203.208.203.11 0 .204-.09.209-.204l.181-2.906-.181-5.436zm1.062-.31c0-.122-.107-.222-.226-.222-.121 0-.221.1-.224.222l-.145 5.744.145 2.867c.003.122.103.222.224.222.119 0 .226-.1.226-.223l.163-2.866-.163-5.744zm1.106.006c-.004-.13-.116-.238-.245-.238-.132 0-.24.108-.244.24l-.128 5.735.128 2.822c.004.132.112.24.244.24.129 0 .241-.108.245-.24l.144-2.822-.144-5.737zm.792-.462c-.14 0-.256.116-.259.257l-.113 6.198.113 2.767c.003.141.119.256.259.256.139 0 .254-.115.259-.258l.127-2.766-.127-6.2c-.005-.141-.12-.254-.259-.254zm2.937 1.096c-.297-.048-.591-.02-.868.079-.036-3.19-2.625-5.766-5.822-5.766-.752 0-1.483.146-2.146.404-.256.101-.324.204-.326.406v10.978c.003.208.166.377.372.395l.028.001h8.762c1.745 0 3.161-1.417 3.161-3.163 0-1.607-1.203-2.928-2.759-3.128"/></svg>',
    generic: '<svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
  };

  function detectPlatform(url) {
    const lower = url.toLowerCase();
    if (lower.includes('spotify.com')) return 'spotify';
    if (lower.includes('facebook.com') || lower.includes('fb.com')) return 'facebook';
    if (lower.includes('youtube.com') || lower.includes('youtu.be') || lower.includes('music.youtube.com')) return 'youtube';
    if (lower.includes('instagram.com')) return 'instagram';
    if (lower.includes('tiktok.com')) return 'tiktok';
    if (lower.includes('soundcloud.com')) return 'soundcloud';
    return 'generic';
  }

  async function loadSocialLinks() {
    const container = document.getElementById('hero-social');
    try {
      const res = await fetch('/api/social-links');
      const { links } = await res.json();
      if (!links.length) {
        container.style.display = 'none';
        return;
      }
      container.innerHTML = links.map((link) => {
        const platform = detectPlatform(link.url);
        const icon = SOCIAL_ICONS[platform] || SOCIAL_ICONS.generic;
        const label = link.label || platform;
        return `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon}</a>`;
      }).join('');
    } catch {
      container.style.display = 'none';
    }
  }

  async function loadExchangeRates() {
    try {
      const res = await fetch('/api/exchange-rates');
      const { rates } = await res.json();
      exchangeRates = rates;
      renderCurrencyOptions();
    } catch {
      exchangeRates = [{ code: 'CUP', label: 'CUP', cupPerUnit: 1 }];
      renderCurrencyOptions();
    }
  }

  function renderCurrencyOptions() {
    const usable = exchangeRates.filter(r => r.code === 'CUP' || r.cupPerUnit > 0);
    currencySelect.innerHTML = usable.map(r => `<option value="${escapeHtml(r.code)}">${escapeHtml(r.label)}</option>`).join('');
    if (usable.some(r => r.code === selectedCurrency)) {
      currencySelect.value = selectedCurrency;
    } else {
      selectedCurrency = 'CUP';
      currencySelect.value = 'CUP';
    }
    renderPaymentMethodsRail();
  }

  function convertFromCup(priceCup, currencyCode) {
    const rate = exchangeRates.find(r => r.code === currencyCode);
    if (!rate || !rate.cupPerUnit) return null;
    if (currencyCode === 'CUP') return priceCup;
    return priceCup / rate.cupPerUnit;
  }

  function formatPriceInCurrency(priceCup, currencyCode) {
    const rate = exchangeRates.find(r => r.code === currencyCode);
    const converted = convertFromCup(priceCup, currencyCode);
    if (converted == null) return `${Number(priceCup || 0).toLocaleString('es')} CUP`;
    const decimals = ZBUI.decimales(currencyCode);
    const formatted = converted.toLocaleString('es', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return `${formatted} ${rate.label}`;
  }

  currencySelect.addEventListener('change', () => {
    selectedCurrency = currencySelect.value;
    renderPaymentMethodsRail();
    renderCurrentSection();
    if (hotsLista.length) pintarHots();
    if (currentTrack) actualizarBotonCompra(currentTrack);
  });

  // Los botones verdes de métodos de pago hacen lo mismo que «Ver precios en»
  function renderPaymentMethodsRail() {
    const usable = exchangeRates.filter(r => r.code === 'CUP' || r.cupPerUnit > 0);
    paymentMethodsList.innerHTML = usable.map(r =>
      `<button type="button" class="payment-method-chip${r.code === selectedCurrency ? ' active' : ''}" data-code="${escapeHtml(r.code)}" aria-pressed="${r.code === selectedCurrency}">${escapeHtml(r.label)}</button>`
    ).join('');
    paymentMethodsList.querySelectorAll('.payment-method-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        selectedCurrency = chip.dataset.code;
        currencySelect.value = selectedCurrency;
        renderPaymentMethodsRail();
        renderCurrentSection();
        if (hotsLista.length) pintarHots();
        if (currentTrack) actualizarBotonCompra(currentTrack);
      });
    });
  }

  async function loadPaymentInfo() {
    const res = await fetch('/api/payment-info');
    if (!res.ok) return;
    paymentInfo = await res.json();
  }

  const searchBarWrap = document.querySelector('.search-bar-wrap');
  const producersGrid = document.getElementById('producers-grid');
  const producerDetail = document.getElementById('producer-detail');

  const TITULOS = { catalog: 'Beats', playlist: 'Playlist', vip: 'Beats VIP', packs: 'Sample Packs', producers: 'Productores' };
  const BUSCAR = { catalog: 'Buscar beats', playlist: 'Buscar en la Playlist', vip: 'Buscar beats VIP', packs: 'Buscar packs' };
  document.querySelectorAll('.section-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const section = tab.dataset.section;
      if (section === currentSection) return;
      // crossfade: la sección anterior se desvanece mientras entra la nueva
      ZBUI.transicion(() => {
      currentSection = section;

      document.querySelectorAll('.section-tab').forEach(t => t.classList.toggle('active', t === tab));
      sectionTitle.textContent = TITULOS[section];

      const isProducers = section === 'producers';
      trackGrid.style.display = isProducers ? 'none' : '';
      searchBarWrap.style.display = isProducers ? 'none' : '';
      producersGrid.style.display = isProducers ? 'grid' : 'none';
      producerDetail.style.display = 'none';
      if (!isProducers) producersPager.hidden = true;
      trackPager.hidden = true;
      verHots();
      trackCount.textContent = '';
      if (!isProducers) searchInput.placeholder = BUSCAR[section] || 'Buscar';
      pintarGeneros();

      if (isProducers) {
        // el aviso «Aún no hay…» es de las otras secciones: en Productores no se muestra
        emptyState.style.display = 'none';
        noResultsState.style.display = 'none';
        loadProducersList();
        return;
      }
      if (!seccionesCargadas.has(section)) {
        // mientras llega la lista: filas de carga, no el aviso de «no hay pistas»
        emptyState.style.display = 'none';
        noResultsState.style.display = 'none';
        ZBUI.mostrarSkeleton(trackGrid, 'filas', 6);
      } else {
        renderCurrentSection();
      }
      if (!tracksBySection[section].length) loadTracksForSection(section);
      });
    });
  });

  function getFavProducers() {
    try { return JSON.parse(localStorage.getItem('zonabeats_fav_producers') || '[]'); } catch { return []; }
  }
  function toggleFavProducer(id) {
    const favs = getFavProducers();
    const i = favs.indexOf(id);
    if (i === -1) favs.push(id); else favs.splice(i, 1);
    try { localStorage.setItem('zonabeats_fav_producers', JSON.stringify(favs)); } catch { /* modo privado */ }
    return favs.includes(id);
  }

  async function loadProducersList() {
    ZBUI.mostrarSkeleton(producersGrid, 'tarjetas', 6);
    const res = await fetch('/api/producers');
    const { producers } = await res.json();
    const favs = getFavProducers();
    const ordenados = [...producers].sort((a, b) => favs.includes(b.id) - favs.includes(a.id));

    if (!ordenados.length) {
      producersGrid.innerHTML = '<div class="empty-hint">Aún no hay productores.</div>';
      ZBUI.paginar(producersPager, 0, 0, 1);
      return;
    }
    listaProductores = ordenados;
    pintarProductores();
  }

  // Productores por páginas: las tarjetas que caben en la pantalla
  const producersPager = document.getElementById('producers-pager');
  let listaProductores = [];
  let paginaProductores = 0;
  function pintarProductores() {
    const lista = listaProductores;
    paginaProductores = ZBUI.paginarEncajado(producersGrid, producersPager, lista.length, paginaProductores,
      mqAncho.matches ? 9 : 6, (p) => { paginaProductores = p; pintarProductores(); },
      (desde, hasta) => tarjetasProductores(lista.slice(desde, hasta))).pagina;
  }
  function tarjetasProductores(ordenados) {
    const favs = getFavProducers();
    producersGrid.innerHTML = ordenados.map(p => {
      const ins = p.insignias || {};
      const datos = [p.beats + ' beat' + (p.beats === 1 ? '' : 's')];
      if (ins.ventasEntregadas > 0) datos.push(ins.ventasEntregadas + ' venta' + (ins.ventasEntregadas === 1 ? '' : 's'));
      if (ins.resenas && ins.resenas.total) datos.push('★ ' + numEs(ins.resenas.promedio));
      return `
      <div class="producer-card" data-id="${p.id}">
        <button type="button" class="card-hit" aria-label="Ver los beats de ${escapeHtml(p.name)}"></button>
        ${p.avatar ? `<img class="producer-avatar" src="/api/producer/avatar/${p.id}?s=300" alt="" loading="lazy">` : `<div class="producer-avatar producer-avatar-fallback">${escapeHtml((p.name||'?').charAt(0).toUpperCase())}</div>`}
        <div class="pc-info">
          <div class="producer-card-name">${escapeHtml(p.name)}${ins.identidadVerificada ? '<span class="prod-verif" title="Identidad verificada"><span aria-hidden="true">✓</span><span class="sr-only"> (identidad verificada)</span></span>' : ''}</div>
          <div class="producer-card-bio">${escapeHtml(p.bio || '')}</div>
          <div class="producer-card-count">${escapeHtml(datos.join(' · '))}</div>
        </div>
        <button type="button" class="fav-btn ${favs.includes(p.id) ? 'active' : ''}" data-fav="${p.id}" aria-label="Favorito" aria-pressed="${favs.includes(p.id)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
      </div>`;
    }).join('');

    producersGrid.querySelectorAll('.fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.fav);
        const fav = toggleFavProducer(id);
        btn.classList.toggle('active', fav);
        btn.setAttribute('aria-pressed', String(fav));
      });
    });
    producersGrid.querySelectorAll('.producer-card').forEach(card => {
      card.addEventListener('click', () => openProducerDetail(Number(card.dataset.id), card));
    });
  }

  // Cabecera del productor: se pinta ya con lo que trae la tarjeta, para que el nombre y la
  // foto «viajen» de la tarjeta a la página (elemento compartido) sin esperar al servidor.
  function cabeceraProductor(id, nombre, conFoto, bio, socialHtml, insignias) {
    return `
      <button type="button" class="back-to-producers">&larr; Todos los productores</button>
      <div class="producer-detail-head">
        ${conFoto ? `<img class="producer-avatar-lg" src="/api/producer/avatar/${id}?s=300" alt="">` : `<div class="producer-avatar-lg producer-avatar-fallback">${escapeHtml((nombre||'?').charAt(0).toUpperCase())}</div>`}
        <div>
          <h2>${escapeHtml(nombre)}</h2>
          <p>${escapeHtml(bio || '')}</p>
          ${insigniasHtml(insignias)}
          ${socialHtml ? `<div class="hero-social">${socialHtml}</div>` : ''}
        </div>
      </div>`;
  }
  function volverAProductores(id) {
    const card = producersGrid.querySelector('.producer-card[data-id="' + id + '"]');
    ZBUI.viaje(
      { 'zb-titulo': producerDetail.querySelector('.producer-detail-head h2'), 'zb-avatar': producerDetail.querySelector('.producer-avatar-lg') },
      () => { producerDetail.style.display = 'none'; producersGrid.style.display = 'grid'; producersPager.hidden = !pagerProdVisible; },
      () => card ? { 'zb-titulo': card.querySelector('.producer-card-name'), 'zb-avatar': card.querySelector('.producer-avatar') } : {}
    );
  }

  let pagerProdVisible = false;
  async function openProducerDetail(id, card) {
    const nombreCard = card ? card.querySelector('.producer-card-name') : null;
    const fotoCard = card ? card.querySelector('.producer-avatar') : null;
    await ZBUI.viaje(
      { 'zb-titulo': nombreCard, 'zb-avatar': fotoCard },
      () => {
        pagerProdVisible = !producersPager.hidden;
        producersPager.hidden = true;
        producersGrid.style.display = 'none';
        producerDetail.style.display = 'block';
        producerDetail.innerHTML = (card
          ? cabeceraProductor(id, nombreCard.textContent, fotoCard && fotoCard.tagName === 'IMG', card.querySelector('.producer-card-bio').textContent, '')
          : ZBUI.skeleton('lineas', 3)) + '<div class="tracklist">' + ZBUI.skeleton('filas', 4) + '</div>';
        const atras = producerDetail.querySelector('.back-to-producers');
        if (atras) atras.addEventListener('click', () => volverAProductores(id));
      },
      () => ({ 'zb-titulo': producerDetail.querySelector('.producer-detail-head h2'), 'zb-avatar': producerDetail.querySelector('.producer-avatar-lg') })
    );
    const res = await fetch(`/api/producers/${id}/tracks`);
    if (!res.ok) { producerDetail.innerHTML = '<div class="empty-hint">Perfil no disponible.</div>'; return; }
    const { producer, tracks, discountPercent: dp } = await res.json();
    discountPercent = dp || 0;

    const socialHtml = (producer.socialLinks || []).map(l => {
      const platform = detectPlatform(l.url);
      const icon = SOCIAL_ICONS[platform] || SOCIAL_ICONS.generic;
      return `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(l.label || platform)}">${icon}</a>`;
    }).join('');

    producerDetail.innerHTML = cabeceraProductor(producer.id, producer.name, producer.avatar, producer.bio, socialHtml, producer.insignias)
      + '<div class="tracklist" id="producer-track-grid"></div><nav class="pager" id="producer-pager" aria-label="Páginas de beats del productor" hidden></nav>';

    producerDetail.querySelector('.back-to-producers').addEventListener('click', () => volverAProductores(producer.id));

    const grid = document.getElementById('producer-track-grid');
    if (!tracks.length) { grid.innerHTML = '<div class="empty-hint">Este productor no tiene beats a la venta ahora mismo.</div>'; return; }
    // sus beats, por páginas que caben en la pantalla
    let paginaDetalle = 0;
    const pintarDetalle = () => {
      paginaDetalle = ZBUI.paginarEncajado(grid, document.getElementById('producer-pager'), tracks.length, paginaDetalle, porPagina(),
        (p) => { paginaDetalle = p; pintarDetalle(); },
        (desde, hasta) => {
          const savedSection = currentSection;
          currentSection = 'catalog';
          renderTracks(tracks.slice(desde, hasta), tracks.length, grid, { total: tracks.length, desde });
          currentSection = savedSection;
        }, 'prod' + producer.id + '|' + tracks.length).pagina;
    };
    pintarDetalle();
  }

  async function loadTracksForSection(section) {
    const res = await fetch(`/api/tracks?type=${section}`);
    const data = await res.json();
    tracksBySection[section] = data.tracks;
    seccionesCargadas.add(section);
    if (section === 'catalog' && typeof data.discountPercent === 'number') discountPercent = data.discountPercent;
    renderCurrentSection();
  }

  let searchDebounceTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchQuery = searchInput.value.trim().toLowerCase();
      if (paginas[currentSection] != null) paginas[currentSection] = 0;
      verHots();
      renderCurrentSection();
    }, 200);
  });

  function matchesSearch(track) {
    if (!searchQuery) return true;
    const haystacks = [track.title, track.genre, track.artist_credit, track.price_label, track.producer_display, track.producer_name]
      .filter(Boolean)
      .map(s => s.toLowerCase());
    return haystacks.some(h => h.includes(searchQuery));
  }

  // ---------- Lista de beats con páginas y filtro de género ----------
  const paginas = { catalog: 0, playlist: 0, vip: 0, packs: 0 };
  const generos = { catalog: '', playlist: '', vip: '', packs: '' };
  const mqAncho = window.matchMedia('(min-width: 900px)');
  const porPagina = () => (mqAncho.matches ? 12 : 8);
  const normalizar = (t) => String(t || '').trim().toLowerCase();

  function filtrados(section) {
    const g = generos[section];
    return (tracksBySection[section] || []).filter(t => matchesSearch(t) && (!g || normalizar(t.genre) === g));
  }
  function pintarGeneros() {
    if (currentSection === 'producers') { genreChips.innerHTML = ''; return; }
    const cuenta = new Map();
    (tracksBySection[currentSection] || []).forEach((t) => {
      const g = normalizar(t.genre);
      if (!g) return;
      const v = cuenta.get(g) || { n: 0, txt: String(t.genre).trim() };
      v.n++; cuenta.set(g, v);
    });
    const lista = [...cuenta.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    if (lista.length < 2) { genreChips.innerHTML = ''; generos[currentSection] = ''; return; }
    const activo = generos[currentSection];
    genreChips.innerHTML = '<button type="button" class="genre-chip' + (!activo ? ' active' : '') + '" data-g="">Todos</button>' +
      lista.map(([g, v]) => '<button type="button" class="genre-chip' + (activo === g ? ' active' : '') + '" data-g="' + escapeHtml(g) + '">' + escapeHtml(v.txt) + '</button>').join('');
  }
  genreChips.addEventListener('click', (e) => {
    const b = e.target.closest('.genre-chip');
    if (!b) return;
    generos[currentSection] = b.dataset.g || '';
    paginas[currentSection] = 0;
    pintarGeneros();
    verHots();
    renderCurrentSection();
  });

  // filas por página de cada sección (lo que cabe en la pantalla, medido al pintar)
  const tams = {};
  function renderCurrentSection() {
    if (!seccionesCargadas.has(currentSection)) return; // sigue la carga hasta que llegue la lista
    const seccion = currentSection;
    const todos = tracksBySection[seccion] || [];
    const lista = filtrados(seccion);
    const firma = [seccion, generos[seccion] || '', searchQuery, lista.length, hotsSection.hidden ? 0 : 1].join('|');
    ZBUI.encajar(trackGrid, porPagina(), (tam) => {
      // si cambia el tamaño de página, sigue a la vista la primera fila
      if (tams[seccion] && tams[seccion] !== tam) paginas[seccion] = Math.floor((paginas[seccion] * tams[seccion]) / tam);
      tams[seccion] = tam;
      const total = Math.max(1, Math.ceil(lista.length / tam));
      if (paginas[seccion] >= total) paginas[seccion] = total - 1;
      const desde = paginas[seccion] * tam;
      renderTracks(lista.slice(desde, desde + tam), todos.length, null, { total: lista.length, desde });
      pintarPager(lista.length, tam);
    }, firma);
  }
  function pintarPager(n, tam) {
    const total = Math.ceil(n / tam);
    if (total <= 1 || currentSection === 'producers') { trackPager.hidden = true; trackPager.innerHTML = ''; return; }
    const p = paginas[currentSection];
    trackPager.hidden = false;
    trackPager.innerHTML = '<button type="button" data-p="' + (p - 1) + '"' + (p === 0 ? ' disabled' : '') + ' aria-label="Página anterior">‹</button>' +
      '<span class="pager-txt">' + (p + 1) + ' de ' + total + '</span>' +
      '<button type="button" data-p="' + (p + 1) + '"' + (p >= total - 1 ? ' disabled' : '') + ' aria-label="Página siguiente">›</button>';
  }
  trackPager.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-p]');
    if (!b || b.disabled) return;
    paginas[currentSection] = Number(b.dataset.p);
    ZBUI.transicion(() => renderCurrentSection());
    // si la lista quedó arriba de la pantalla, se vuelve a su comienzo
    const arriba = trackGrid.getBoundingClientRect().top + window.scrollY - 90;
    if (window.scrollY > arriba) window.scrollTo({ top: arriba, behavior: 'smooth' });
  });
  mqAncho.addEventListener('change', () => { if (currentSection !== 'producers') renderCurrentSection(); });
  // lleva la página a la que contiene esa pista (al compartir un enlace o al pasar a la siguiente)
  function mostrarPaginaDe(id) {
    if (!(currentSection in paginas)) return;
    const idx = filtrados(currentSection).findIndex(t => Number(t.id) === Number(id));
    if (idx < 0) return;
    const p = Math.floor(idx / (tams[currentSection] || porPagina()));
    if (p !== paginas[currentSection]) { paginas[currentSection] = p; renderCurrentSection(); }
  }

  // Quién hizo cada tema: en Playlist van los artistas (la colaboración); en Catálogo y VIP, género y productor.
  const nombreProductor = (t) => t.producer_display || t.producer_name || 'Zona Beats';
  const numEs = (n) => Number(n).toLocaleString('es', { maximumFractionDigits: 1 });
  const estrellasTxt = (n) => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));
  const notaHtml = (r) => r && r.total ? `<span class="track-rating" title="${numEs(r.promedio)} de 5 en ${r.total} reseña${r.total === 1 ? '' : 's'} verificada${r.total === 1 ? '' : 's'}"><span aria-hidden="true">★</span> ${numEs(r.promedio)} <span class="track-rating-n">(${r.total})</span><span class="sr-only"> de 5, ${r.total} reseñas</span></span>` : '';
  const verifHtml = (t) => t.producer_verificado ? '<span class="prod-verif" title="Identidad verificada"><span aria-hidden="true">✓</span><span class="sr-only"> (identidad verificada)</span></span>' : '';
  function insigniasHtml(ins) {
    if (!ins) return '';
    const items = [];
    if (ins.identidadVerificada) items.push('<span class="badge-prod ok">✓ Identidad verificada</span>');
    if (ins.miembroDesde) items.push('<span class="badge-prod">Miembro desde ' + new Date(String(ins.miembroDesde).replace(' ', 'T') + 'Z').toLocaleDateString('es', { month: 'short', year: 'numeric' }) + '</span>');
    if (ins.ventasEntregadas > 0) items.push('<span class="badge-prod">' + ins.ventasEntregadas + ' venta' + (ins.ventasEntregadas === 1 ? '' : 's') + ' entregada' + (ins.ventasEntregadas === 1 ? '' : 's') + '</span>');
    if (ins.resenas && ins.resenas.total) items.push('<span class="badge-prod">★ ' + numEs(ins.resenas.promedio) + ' (' + ins.resenas.total + ')</span>');
    return items.length ? '<div class="badges-prod">' + items.join('') + '</div>' : '';
  }
  function creditosHtml(track, seccion) {
    const artistas = seccion === 'playlist' && track.artist_credit
      ? `<div class="track-artists"><span aria-hidden="true">🎤</span><span class="sr-only">Artistas:</span> ${escapeHtml(track.artist_credit)}</div>` : '';
    return artistas + `<div class="track-credits">${track.genre ? `<span class="track-genre">${escapeHtml(track.genre)}</span><span class="dot" aria-hidden="true">·</span>` : ''}<span class="track-prod">prod. ${escapeHtml(nombreProductor(track))}${verifHtml(track)}</span>${notaHtml(track.rating)}</div>`;
  }
  function creditosTexto(track, seccion, conComa) {
    const partes = [];
    if (seccion === 'playlist' && track.artist_credit) partes.push(track.artist_credit);
    if (track.genre) partes.push(track.genre);
    partes.push('prod. ' + nombreProductor(track));
    return (conComa ? ', ' : '') + partes.join(' · ');
  }

  const ICONO_CORAZON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  const ICONO_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

  function renderTracks(tracks, totalBeforeFilter, targetGrid, pag) {
    const grid = targetGrid || trackGrid;
    grid.innerHTML = '';
    const enDetalleProductor = Boolean(targetGrid);
    const seccion = enDetalleProductor ? 'catalog' : currentSection;
    const esPacks = seccion === 'packs';
    const cuantos = pag ? pag.total : tracks.length;
    if (!enDetalleProductor) {
      trackCount.textContent = !cuantos ? '' : cuantos + ' ' + (esPacks ? (cuantos === 1 ? 'pack' : 'packs') : (cuantos === 1 ? 'beat' : 'beats'));
    }

    const hasSearch = Boolean(searchQuery) || Boolean(generos[seccion]);
    emptyState.style.display = (!enDetalleProductor && !totalBeforeFilter && !hasSearch) ? 'block' : 'none';
    noResultsState.style.display = (!enDetalleProductor && totalBeforeFilter > 0 && cuantos === 0) ? 'block' : 'none';

    if (seccion === 'vip') {
      emptyStateTitle.textContent = 'Aún no hay Beats VIP';
      emptyStateText.textContent = 'Aquí aparecen los beats vendidos en exclusiva.';
    } else if (esPacks) {
      emptyStateTitle.textContent = 'Aún no hay Sample Packs';
      emptyStateText.textContent = 'Loops, drums y one-shots para tus producciones, muy pronto.';
    } else if (seccion === 'playlist') {
      emptyStateTitle.textContent = 'Playlist vacía';
      emptyStateText.textContent = 'Todavía no hay colaboraciones gratuitas publicadas.';
    } else {
      emptyStateTitle.textContent = 'Aún no hay beats';
      emptyStateText.textContent = 'Se está preparando el primer set. Vuelve pronto.';
    }

    const desde = pag ? pag.desde : 0;
    tracks.forEach((track, i) => {
      track._section = track._section || seccion;
      const row = document.createElement('div');
      row.className = 'track-row' + (Number(track.id) === Number(currentTrackId) ? ' playing' : '');
      row.dataset.id = track.id;

      const cover = track.cover_filename
        ? `<img src="/api/cover/${track.id}?s=160" alt="" loading="lazy" decoding="async" draggable="false">`
        : `<span class="tr-cover-fallback">${escapeHtml((track.title || '?').charAt(0).toUpperCase())}</span>`;
      const badge = track.is_pack ? '<span class="tr-badge">Pack</span>' : (track.is_exclusive ? '<span class="tr-badge tr-badge-ex">Exclusiva</span>' : '');

      let fin = '';
      if ((seccion === 'catalog' || esPacks) && track.for_sale && track.price_cup > 0) {
        const priceText = formatPriceInCurrency(track.price_cup, selectedCurrency);
        const multiples = (track.licenses || []).length > 1;
        const tieneDescuento = discountPercent > 0 && track.original_cup && track.original_cup > track.price_cup;
        fin = `<button type="button" class="tr-buy" aria-label="Comprar ${escapeHtml(track.title)}, ${multiples ? 'desde ' : ''}${escapeHtml(priceText)}">` +
          (multiples ? '<span class="tr-desde">desde</span>' : '') +
          (tieneDescuento ? `<s class="price-strike">${escapeHtml(formatPriceInCurrency(track.original_cup, selectedCurrency))}</s>` : '') +
          `<span class="tr-price">${escapeHtml(priceText)}</span></button>`;
      } else if (seccion === 'vip') {
        fin = '<span class="tr-sold">Vendida' + (track.price_cup > 0 ? '<span class="tr-price-sold">' + escapeHtml(formatPriceInCurrency(track.price_cup, selectedCurrency)) + '</span>' : '') + '</span>';
      } else if (seccion === 'playlist') {
        const liked = isTrackLiked(track.id);
        fin = `<span class="track-stats"><button type="button" class="track-like-btn${liked ? ' liked' : ''}" data-track-id="${track.id}" aria-label="Me gusta" aria-pressed="${liked}">${ICONO_CORAZON}<span class="track-like-count">${track.likes || 0}</span></button>` +
          `<span class="track-plays-count" title="Reproducciones">${ICONO_PLAY}${track.plays || 0}</span></span>`;
      }
      const vip = seccion === 'vip' ? `<div class="track-vip-owner">${track.vip_owner ? 'Dueño: ' + escapeHtml(track.vip_owner) : 'Dueño anónimo'}</div>` : '';

      row.innerHTML =
        `<span class="tr-num" aria-hidden="true"><span class="tr-n">${String(desde + i + 1).padStart(2, '0')}</span><span class="eq-mini"><span></span><span></span><span></span><span></span></span></span>` +
        `<span class="tr-cover">${cover}<span class="tr-play" aria-hidden="true">${ICONO_PLAY}</span></span>` +
        `<div class="tr-main"><div class="tr-title"><span class="tr-title-txt">${escapeHtml(track.title)}</span>${badge}</div>${creditosHtml(track, seccion)}${vip}</div>` +
        `<span class="tr-wave">${ZBUI.onda(track.onda)}</span>` +
        `<span class="tr-dur">${track.duration_seconds ? formatTime(track.duration_seconds) : ''}</span>` +
        `<span class="tr-end">${fin}</span>` +
        '<button type="button" class="card-hit"></button>';
      // toda la fila reproduce; el botón que la cubre la hace usable con teclado y lector de pantalla
      row.querySelector('.card-hit').setAttribute('aria-label', 'Escuchar ' + track.title + creditosTexto(track, seccion, true));
      row.addEventListener('click', () => playTrack(track));
      const buy = row.querySelector('.tr-buy');
      if (buy) buy.addEventListener('click', (e) => { e.stopPropagation(); openBuyModal(track); });
      const likeBtn = row.querySelector('.track-like-btn');
      if (likeBtn) likeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(track.id, likeBtn); });
      grid.appendChild(row);
    });
  }

  // ---------- Hots: carrusel de la portada ----------
  const hotsSection = document.getElementById('hots');
  const hotsViewport = document.getElementById('hots-viewport');
  const hotsTrack = document.getElementById('hots-track');
  const hotsPause = document.getElementById('hots-pause');
  let hotsLista = [];
  const hotsMov = { pausaUsuario: false, pausaTemporal: false, anchoSet: 0, ultimo: 0, raf: 0, velocidad: 28, pos: 0 };
  const reducirMovimiento = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function tarjetaHot(track, clon) {
    const precio = track.price_cup > 0 ? formatPriceInCurrency(track.price_cup, selectedCurrency) : '';
    const multiples = (track.licenses || []).length > 1;
    const cover = track.cover_filename
      ? `<img src="/api/cover/${track.id}?s=300" alt="" loading="lazy" draggable="false">`
      : `<div class="hot-cover-fallback" aria-hidden="true">♪</div>`;
    return `<div class="hot-card" data-id="${track.id}" ${clon ? 'aria-hidden="true" tabindex="-1"' : 'role="button" tabindex="0"'}
              aria-label="Escuchar ${escapeHtml(track.title)}${', ' + escapeHtml(creditosTexto(track, 'catalog', false))}${precio ? ', ' + escapeHtml((multiples ? 'desde ' : '') + precio) : ''}">
      <div class="hot-cover">${cover}<span class="hot-badge" aria-hidden="true">🔥 HOT</span>
        <span class="hot-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></div>
      <div class="hot-info">
        <div class="hot-name">${escapeHtml(track.title)}</div>
        <div class="hot-by">${track.genre ? escapeHtml(track.genre) + ' · ' : ''}prod. ${escapeHtml(nombreProductor(track))}</div>
        ${precio ? `<div class="hot-price">${multiples ? 'Desde ' : ''}${escapeHtml(precio)}</div>` : ''}
      </div>
    </div>`;
  }

  const hotsALaVista = () => hotsLista.length > 0 && currentSection === 'catalog' && !searchQuery && !generos.catalog;
  // muestra u oculta la franja según la sección; las listas vuelven a medir el sitio que queda
  function verHots() {
    const ver = hotsALaVista();
    if (hotsSection.hidden === !ver) return;
    if (ver) pintarHots(); else { cancelAnimationFrame(hotsMov.raf); hotsSection.hidden = true; }
  }
  function pintarHots() {
    cancelAnimationFrame(hotsMov.raf);
    if (!hotsALaVista()) { hotsSection.hidden = true; return; }
    hotsSection.hidden = false;
    hotsTrack.classList.remove('is-loop');
    hotsTrack.innerHTML = hotsLista.map(t => tarjetaHot(t, false)).join('');
    hotsViewport.scrollLeft = 0;
    // Con una sola pista no hay carrusel. Con dos o más, siempre gira: aunque quepan todas en
    // la pantalla, la fila se repite las veces necesarias para que el movimiento no tenga fin.
    const gira = hotsLista.length > 1;
    hotsPause.hidden = !gira;
    if (!gira) return;
    const gap = parseFloat(getComputedStyle(hotsTrack).columnGap) || 0;
    const anchoUno = hotsTrack.scrollWidth + gap;
    if (anchoUno <= gap) return;
    const veces = Math.max(1, Math.ceil((hotsViewport.clientWidth + 50) / anchoUno));
    hotsMov.anchoSet = anchoUno * veces;
    hotsTrack.insertAdjacentHTML('beforeend', hotsLista.map(t => tarjetaHot(t, true)).join('').repeat(veces * 2 - 1));
    hotsTrack.classList.add('is-loop');
    hotsViewport.scrollLeft = hotsMov.anchoSet;
    hotsMov.pos = hotsViewport.scrollLeft;
    hotsMov.ultimo = 0;
    hotsMov.raf = requestAnimationFrame(moverHots);
  }

  // Avanza de izquierda a derecha: las tarjetas se desplazan hacia la derecha
  function moverHots(ts) {
    // «reducir movimiento» solo hace que empiece en pausa: si la persona pulsa ▶, se mueve
    const quieto = hotsMov.pausaUsuario || hotsMov.pausaTemporal || document.hidden;
    // si la persona deslizó con el dedo, se sigue desde donde lo dejó
    if (Math.abs(hotsViewport.scrollLeft - hotsMov.pos) > 2) hotsMov.pos = hotsViewport.scrollLeft;
    if (hotsMov.ultimo && !quieto) {
      const dt = Math.min(64, ts - hotsMov.ultimo);
      // la posición se lleva con decimales: el navegador redondea scrollLeft a píxeles enteros
      hotsMov.pos -= (hotsMov.velocidad * dt) / 1000;
      if (hotsMov.pos <= 1) hotsMov.pos += hotsMov.anchoSet;
      hotsViewport.scrollLeft = hotsMov.pos;
    }
    // si desliza hasta el final, vuelve a la copia equivalente
    if (hotsMov.pos >= hotsMov.anchoSet * 2 - hotsViewport.clientWidth - 1) { hotsMov.pos -= hotsMov.anchoSet; hotsViewport.scrollLeft = hotsMov.pos; }
    hotsMov.ultimo = ts;
    hotsMov.raf = requestAnimationFrame(moverHots);
  }

  function pausaHots(pausar) {
    hotsMov.pausaUsuario = pausar;
    hotsPause.setAttribute('aria-pressed', String(pausar));
    hotsPause.setAttribute('aria-label', pausar ? 'Reanudar el carrusel' : 'Pausar el carrusel');
    hotsPause.classList.toggle('is-paused', pausar);
  }
  hotsPause.addEventListener('click', () => pausaHots(!hotsMov.pausaUsuario));
  if (reducirMovimiento.matches) pausaHots(true);
  // se detiene mientras la persona lo toca, lo recorre con el teclado o pasa el mouse
  let reanudarTimer = null;
  const detener = () => { clearTimeout(reanudarTimer); hotsMov.pausaTemporal = true; };
  const seguir = (ms) => { clearTimeout(reanudarTimer); reanudarTimer = setTimeout(() => { hotsMov.pausaTemporal = false; }, ms); };
  hotsViewport.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') detener(); });
  hotsViewport.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') seguir(300); });
  hotsViewport.addEventListener('touchstart', detener, { passive: true });
  hotsViewport.addEventListener('touchend', () => seguir(2500), { passive: true });
  hotsViewport.addEventListener('focusin', detener);
  hotsViewport.addEventListener('focusout', () => seguir(600));
  hotsViewport.addEventListener('wheel', () => { detener(); seguir(2500); }, { passive: true });

  hotsTrack.addEventListener('click', (e) => {
    const card = e.target.closest('.hot-card');
    if (!card) return;
    const track = hotsLista.find(t => t.id === Number(card.dataset.id));
    if (track) playTrack(track);
  });
  hotsTrack.addEventListener('keydown', (e) => {
    const card = e.target.closest('.hot-card');
    if (!card || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    card.click();
  });
  let anchoVentana = window.innerWidth;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - anchoVentana) < 40) return;
    anchoVentana = window.innerWidth;
    pintarHots();
  });

  async function loadHots() {
    try {
      const res = await fetch('/api/hots');
      if (!res.ok) throw new Error();
      hotsLista = (await res.json()).hots || [];
    } catch { hotsLista = []; }
    pintarHots();
    // con o sin la franja, la lista vuelve a medir el sitio que le queda
    if (seccionesCargadas.has(currentSection)) renderCurrentSection();
  }

  // Identificador anónimo de este dispositivo para que cada persona cuente un solo «me gusta» por pista
  function idVotante() {
    let id = null;
    try { id = localStorage.getItem('zonabeats_voter'); } catch { /* sin almacenamiento */ }
    if (!id || !/^[a-zA-Z0-9-]{16,80}$/.test(id)) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
      try { localStorage.setItem('zonabeats_voter', id); } catch { /* nada */ }
    }
    return id;
  }

  function getLikedTracks() {
    try {
      return JSON.parse(localStorage.getItem('zonabeats_liked') || '[]');
    } catch {
      return [];
    }
  }

  function isTrackLiked(trackId) {
    return getLikedTracks().includes(trackId);
  }

  function setTrackLiked(trackId, liked) {
    const current = getLikedTracks();
    const next = liked
      ? [...new Set([...current, trackId])]
      : current.filter(id => id !== trackId);
    try { localStorage.setItem('zonabeats_liked', JSON.stringify(next)); } catch { /* sin almacenamiento */ }
  }

  async function toggleLike(trackId, btn) {
    const alreadyLiked = isTrackLiked(trackId);
    const endpoint = alreadyLiked ? 'unlike' : 'like';

    btn.disabled = true;
    try {
      const res = await fetch(`/api/tracks/${trackId}/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voterId: idVotante() }),
      });
      if (!res.ok) throw new Error();
      const { likes } = await res.json();

      setTrackLiked(trackId, !alreadyLiked);
      btn.classList.toggle('liked', !alreadyLiked);
      btn.setAttribute('aria-pressed', String(!alreadyLiked));
      btn.querySelector('.track-like-count').textContent = likes;

      const track = tracksBySection.playlist.find(t => t.id === trackId);
      if (track) track.likes = likes;
    } catch {
      console.error('No se pudo registrar el like');
    } finally {
      btn.disabled = false;
    }
  }

  function markPlayingCard(trackId) {
    document.querySelectorAll('.track-row').forEach((row) => {
      const suena = Number(row.dataset.id) === Number(trackId);
      row.classList.toggle('playing', suena);
      if (!suena) { const w = row.querySelector('.tr-wave'); if (w) w.style.removeProperty('--p'); }
    });
  }

  async function playTrack(track) {
    try {
      const res = await fetch(`/api/tracks/${track.id}/token`, { method: 'POST' });
      if (!res.ok) throw new Error('No se pudo obtener acceso a la pista');
      const { token } = await res.json();

      currentTrackId = track.id;
      currentTrack = track;
      audioEl.src = `/api/stream/${track.id}?t=${token}`;
      audioEl.play().catch(() => {});

      playerTitle.textContent = track.title;
      const pc = document.getElementById('player-credits');
      if (pc) pc.textContent = creditosTexto(track, track._section || currentSection, false);
      playerCover.src = track.cover_filename ? `/api/cover/${track.id}?s=160` : '';
      // la onda del beat es la barra de avance
      progressTrack.innerHTML = ZBUI.onda(track.onda, 'wf-player');
      progressTrack.style.setProperty('--p', '0%');
      progressTrack.setAttribute('aria-valuenow', '0');
      playerBar.classList.add('active');
      if (!document.body.classList.contains('con-reproductor')) {
        document.body.classList.add('con-reproductor');
        ZBUI.reencajar();
        mostrarPaginaDe(track.id);
      }
      markPlayingCard(track.id);

      actualizarBotonCompra(track);
    } catch (err) {
      console.error(err);
      alert('No se pudo reproducir esta pista. Intenta de nuevo.');
    }
  }

  let currentTrack = null;

  // Decide si el reproductor muestra Comprar o Descargar según la pista (sirve en Catálogo, Playlist y Productores)
  function actualizarBotonCompra(track) {
    const esPlaylist = track._section === 'playlist';
    const canBuy = !esPlaylist && track.for_sale && track.price_cup > 0 && !track.sold && (track.licenses || []).length > 0;
    if (esPlaylist) {
      buyBtn.style.display = 'none';
      buyBtn.onclick = null;
      downloadBtn.style.display = 'inline-flex';
      downloadBtn.onclick = () => { window.location.href = `/api/download/${track.id}`; };
    } else if (canBuy) {
      const priceText = formatPriceInCurrency(track.price_cup, selectedCurrency);
      const multipleLicenses = (track.licenses || []).length > 1;
      // «Desde» va aparte: en teléfonos se oculta para que el precio se lea entero
      buyPriceLabel.innerHTML = (multipleLicenses ? '<span class="pb-desde">Desde </span>' : '') + escapeHtml(priceText);
      buyPriceLabel.title = (multipleLicenses ? 'Desde ' : '') + priceText;
      buyBtn.style.display = 'inline-flex';
      buyBtn.onclick = () => openBuyModal(track);
      downloadBtn.style.display = 'none';
      downloadBtn.onclick = null;
    } else {
      buyBtn.style.display = 'none';
      buyBtn.onclick = null;
      downloadBtn.style.display = 'none';
      downloadBtn.onclick = null;
    }
  }

  // ---------- Descripción y Compartir ----------
  const descOverlay = document.getElementById('desc-overlay');
  let descTrack = null;
  function enlacePista(track) { return location.origin + '/?pista=' + track.id; }
  function abrirDescripcion(track, conReproducir) {
    descTrack = track;
    const cover = document.getElementById('desc-cover');
    if (track.cover_filename) { cover.src = '/api/cover/' + track.id + '?s=300'; cover.style.display = ''; } else { cover.style.display = 'none'; }
    document.getElementById('desc-title').textContent = track.title || '';
    const meta = [];
    if (track._section === 'playlist' && track.artist_credit) meta.push(track.artist_credit);
    if (track.genre) meta.push(track.genre);
    meta.push('prod. ' + nombreProductor(track));
    if (track._section === 'playlist') meta.push('Playlist · descarga gratis');
    else if (track.for_sale && track.price_cup > 0 && !track.sold) meta.push((track.licenses || []).length > 1 ? 'Desde ' + formatPriceInCurrency(track.price_cup, selectedCurrency) : formatPriceInCurrency(track.price_cup, selectedCurrency));
    document.getElementById('desc-meta').textContent = meta.join(' · ');
    const txt = String(track.description || '').trim();
    const p = document.getElementById('desc-text');
    p.textContent = txt || 'Esta pista todavía no tiene descripción.';
    p.classList.toggle('empty', !txt);
    document.getElementById('desc-play').style.display = conReproducir ? '' : 'none';
    const confianza = [];
    if (track.originalidadVerificada) confianza.push('<li><span aria-hidden="true">✓</span> Originalidad verificada antes de su publicación.</li>');
    if (track.producer_verificado) confianza.push('<li><span aria-hidden="true">✓</span> Productor con identidad verificada.</li>');
    if (track._section !== 'playlist' && track.for_sale) confianza.push('<li><span aria-hidden="true">✓</span> Contrato de licencia disponible antes de comprar.</li>');
    const ulT = document.getElementById('desc-trust');
    ulT.innerHTML = confianza.join(''); ulT.hidden = !confianza.length;
    pintarResenas(track);
    descOverlay.classList.add('active');
  }
  async function pintarResenas(track) {
    const caja = document.getElementById('desc-reviews');
    caja.hidden = true; caja.innerHTML = '';
    if (track._section === 'playlist') return;
    let d;
    try { const r = await fetch('/api/tracks/' + track.id + '/resenas'); if (!r.ok) return; d = await r.json(); } catch { return; }
    if (descTrack !== track) return;
    if (!d.total && !d.ocultas) {
      caja.innerHTML = '<p class="rev-empty">Aún sin reseñas.</p>';
      caja.hidden = false; return;
    }
    caja.innerHTML = '<div class="rev-head"><strong>' + (d.total ? estrellasTxt(d.promedio) + ' ' + numEs(d.promedio) + ' de 5' : 'Sin reseñas visibles') + '</strong>' +
      '<span>' + d.total + ' reseña' + (d.total === 1 ? '' : 's') + ' de compradores verificados' + (d.ocultas ? ' · ' + d.ocultas + ' oculta' + (d.ocultas === 1 ? '' : 's') + ' por moderación' : '') + '</span></div>' +
      '<div class="rev-list" id="desc-rev-list">' +
      d.resenas.slice(0, 30).map(r => '<div class="rev-item"><div class="rev-top"><span class="rev-stars" aria-label="' + r.estrellas + ' de 5">' + estrellasTxt(r.estrellas) + '</span> <strong>' + escapeHtml(r.nombre) + '</strong> <span class="rev-check">compra verificada</span></div>' +
        (r.texto ? '<p>' + escapeHtml(r.texto) + '</p>' : '') +
        (r.respuesta ? '<p class="rev-reply"><strong>Respuesta del productor:</strong> ' + escapeHtml(r.respuesta) + '</p>' : '') + '</div>').join('') + '</div>';
    caja.hidden = false;
    // las reseñas por páginas: las que caben en la ventana
    ZBUI.paginarDom(document.getElementById('desc-rev-list'), { porPagina: () => 4, filas: '.rev-item', etiqueta: 'Páginas de reseñas', caja: descOverlay.querySelector('.modal-box') });
  }
  async function compartirPista(track, labelEl) {
    const url = enlacePista(track);
    const data = { title: track.title, text: 'Escucha "' + track.title + '" en Zona Beats', url };
    try {
      if (navigator.share) { await navigator.share(data); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try {
      await navigator.clipboard.writeText(url);
      if (labelEl) { const prev = labelEl.textContent; labelEl.textContent = '¡Enlace copiado!'; labelEl.classList.add('pl-flash'); setTimeout(() => { labelEl.textContent = prev; labelEl.classList.remove('pl-flash'); }, 1800); }
    } catch {
      prompt('Copia este enlace para compartir:', url);
    }
  }
  document.getElementById('player-desc-btn').addEventListener('click', () => { if (currentTrack) abrirDescripcion(currentTrack, false); });
  document.getElementById('player-share-btn').addEventListener('click', () => { if (currentTrack) compartirPista(currentTrack, document.getElementById('player-share-label')); });
  document.getElementById('desc-close').addEventListener('click', () => descOverlay.classList.remove('active'));
  descOverlay.addEventListener('click', (e) => { if (e.target === descOverlay) descOverlay.classList.remove('active'); });
  document.getElementById('desc-play').addEventListener('click', () => { if (descTrack) { descOverlay.classList.remove('active'); playTrack(descTrack); } });
  document.getElementById('desc-share').addEventListener('click', (e) => { if (descTrack) compartirPista(descTrack, e.currentTarget); });

  // Enlace compartido: /?pista=ID abre esa pista
  async function abrirPistaCompartida() {
    const id = Number(new URLSearchParams(location.search).get('pista'));
    if (!id) return;
    history.replaceState(null, '', location.pathname);
    let track = (tracksBySection.catalog || []).find(t => t.id === id);
    let seccion = 'catalog';
    if (!track) {
      try {
        // si no está en el Catálogo, se busca en Playlist y después en Sample Packs
        for (const otra of ['playlist', 'packs']) {
          const r = await fetch('/api/tracks?type=' + otra);
          const d = await r.json();
          tracksBySection[otra] = d.tracks;
          seccionesCargadas.add(otra); // si no, la pestaña se quedaba cargando para siempre
          track = d.tracks.find(t => t.id === id);
          seccion = otra;
          if (track) break;
        }
      } catch { /* sin conexión */ }
    }
    if (!track) return;
    const tab = document.querySelector('.section-tab[data-section="' + seccion + '"]');
    if (tab && seccion !== currentSection) tab.click();
    track._section = seccion;
    setTimeout(() => {
      mostrarPaginaDe(id);
      const fila = document.querySelector('.track-row[data-id="' + id + '"]');
      if (fila) { fila.scrollIntoView({ behavior: 'smooth', block: 'center' }); fila.classList.add('shared-highlight'); setTimeout(() => fila.classList.remove('shared-highlight'), 3000); }
      abrirDescripcion(track, true);
    }, 400);
  }

  playBtn.addEventListener('click', () => {
    if (audioEl.paused) audioEl.play();
    else audioEl.pause();
  });

  audioEl.addEventListener('play', () => {
    iconPlay.style.display = 'none';
    iconPause.style.display = 'block';
    document.getElementById('player-eq').style.animationPlayState = 'running';
  });

  audioEl.addEventListener('pause', () => {
    iconPlay.style.display = 'block';
    iconPause.style.display = 'none';
  });

  audioEl.addEventListener('timeupdate', () => {
    if (!audioEl.duration) return;
    const pct = (audioEl.currentTime / audioEl.duration) * 100;
    progressTrack.style.setProperty('--p', pct.toFixed(2) + '%');
    progressTrack.setAttribute('aria-valuenow', String(Math.round(pct)));
    progressTrack.setAttribute('aria-valuetext', formatTime(audioEl.currentTime) + ' de ' + formatTime(audioEl.duration));
    const ondaFila = document.querySelector('.track-row.playing .tr-wave');
    if (ondaFila) ondaFila.style.setProperty('--p', pct.toFixed(2) + '%');
    timeCurrent.textContent = formatTime(audioEl.currentTime);
    timeTotal.textContent = formatTime(audioEl.duration);
  });

  audioEl.addEventListener('ended', () => {
    markPlayingCard(null);
    const list = tracksBySection[currentSection] || [];
    const idx = list.findIndex(t => t.id === currentTrackId);
    if (idx !== -1 && idx < list.length - 1) {
      playTrack(list[idx + 1]);
      mostrarPaginaDe(list[idx + 1].id);
    }
  });

  progressTrack.addEventListener('click', (e) => {
    if (!audioEl.duration) return;
    const rect = progressTrack.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audioEl.currentTime = pct * audioEl.duration;
  });
  // con el teclado: flechas para adelantar o atrasar 5 segundos
  progressTrack.addEventListener('keydown', (e) => {
    if (!audioEl.duration || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    e.preventDefault();
    audioEl.currentTime = Math.min(audioEl.duration, Math.max(0, audioEl.currentTime + (e.key === 'ArrowRight' ? 5 : -5)));
  });

  // Si el token venció se pide otro UNA vez; si el archivo está dañado no se reintenta en bucle.
  let ultimoReintento = { id: null, at: 0 };
  audioEl.addEventListener('error', async () => {
    if (currentTrackId == null) return;
    const track = currentTrack;
    if (!track) return;
    if (ultimoReintento.id === track.id && Date.now() - ultimoReintento.at < 60000) {
      markPlayingCard(null);
      return;
    }
    ultimoReintento = { id: track.id, at: Date.now() };
    const wasTime = audioEl.currentTime;
    const res = await fetch(`/api/tracks/${track.id}/token`, { method: 'POST' });
    if (!res.ok) return;
    const { token } = await res.json();
    audioEl.src = `/api/stream/${track.id}?t=${token}`;
    audioEl.currentTime = wasTime;
    audioEl.play().catch(() => {});
  });

  const orderForm = document.getElementById('order-form');
  const buyerNameInput = document.getElementById('buyer-name-input');
  const buyerPhoneInput = document.getElementById('buyer-phone-input');
  const orderSubmitBtn = document.getElementById('order-submit-btn');
  const modalSuccess = document.getElementById('modal-success');
  const termsAcceptInput = document.getElementById('terms-accept-input');
  const termsModalOverlay = document.getElementById('terms-modal-overlay');
  const vipPublicWrap = document.getElementById('vip-public-wrap');
  const vipPublicInput = document.getElementById('vip-public-input');
  const buyerPhoneError = document.getElementById('buyer-phone-error');

  let receiptFile = null;

  const LICENSE_INFO = {
    basic: {
      label: 'Básica',
      description: 'MP3. Distribución sin monetización. No exclusiva.',
    },
    premium: {
      label: 'Premium',
      description: 'MP3 + WAV. Distribución sin monetización, en máxima calidad. No exclusiva.',
    },
    unlimited: {
      label: 'Ilimitada',
      description: 'MP3 + WAV + STEMS. Distribución y monetización ilimitadas. Venta única: el beat sale del catálogo.',
    },
    pack: {
      label: 'Sample Pack',
      description: 'Pack completo. Uso en tus producciones, incluso monetizadas, libre de regalías. Prohibida su reventa o distribución.',
    },
    exclusive: {
      label: 'Exclusiva',
      description: 'MP3 + WAV + STEMS. Exclusividad y todos los derechos comerciales. El beat pasa a Beats VIP a tu nombre.',
    },
  };
  const LICENSE_ORDER = ['basic', 'premium', 'unlimited', 'exclusive', 'pack'];

  let selectedLicenseType = null;
  const buyBox = document.getElementById('buy-box');
  const buyNextBtn = document.getElementById('buy-next-btn');
  const buyResumen = document.getElementById('buy-resumen');
  function irPaso(n) {
    buyBox.dataset.paso = String(n);
    buyBox.scrollTop = 0;
  }
  buyNextBtn.addEventListener('click', () => { if (selectedLicenseType) irPaso(2); });
  document.getElementById('buy-back-btn').addEventListener('click', () => irPaso(1));
  // Pago → Tus datos (cada paso cabe en la pantalla del teléfono)
  const pagoNextBtn = document.getElementById('pago-next-btn');
  pagoNextBtn.addEventListener('click', () => { if (pagoListo()) irPaso(3); });
  document.getElementById('buy-back-pago').addEventListener('click', () => irPaso(2));

  function openBuyModal(track) {
    activeModalTrack = track;
    modalTrackTitle.textContent = track.title;
    selectedLicenseType = null;
    irPaso(1);
    buyNextBtn.disabled = true;
    buyNextBtn.textContent = 'Elige una licencia';

    const licenseList = document.getElementById('modal-license-list');
    const licenses = (track.licenses || []).slice().sort((a, b) => LICENSE_ORDER.indexOf(a.license_type) - LICENSE_ORDER.indexOf(b.license_type));

    if (!licenses.length) {
      licenseList.innerHTML = '<div class="modal-no-accounts">Sin licencias disponibles por ahora.</div>';
      document.getElementById('modal-price').style.display = 'none';
      document.getElementById('modal-instructions').style.display = 'none';
      modalAccounts.innerHTML = '';
      document.getElementById('modal-confirm-phone').style.display = 'none';
      orderForm.style.display = 'none';
      modalSuccess.style.display = 'none';
      modalOverlay.classList.add('active');
      return;
    }

    licenseList.innerHTML = licenses.map((lic) => {
      const info = LICENSE_INFO[lic.license_type] || { label: lic.license_type, description: '' };
      const priceText = formatPriceInCurrency(lic.price_cup, selectedCurrency);
      return `
        <button type="button" class="license-option" data-type="${lic.license_type}">
          <div class="license-option-top">
            <span class="license-option-label">${escapeHtml(info.label)}</span>
            <span class="license-option-price">${escapeHtml(priceText)}</span>
          </div>
          <div class="license-option-desc">${escapeHtml(info.description)}</div>
        </button>
      `;
    }).join('');

    licenseList.querySelectorAll('.license-option').forEach((btn) => {
      btn.addEventListener('click', () => selectLicense(btn.dataset.type));
    });

    document.getElementById('modal-price').style.display = 'none';
    document.getElementById('modal-contract-link').hidden = true;
    document.getElementById('modal-instructions').style.display = 'none';
    modalAccounts.innerHTML = '';
    document.getElementById('modal-confirm-phone').style.display = 'none';
    orderForm.style.display = 'none';
    modalSuccess.style.display = 'none';
    receiptFile = null;
    receiptDrop.classList.remove('has-receipt');
    receiptDropText.style.display = 'block';
    receiptPreview.style.display = 'none';
    receiptPreview.src = '';
    termsAcceptInput.checked = false;
    orderForm.reset();
    vipPublicWrap.style.display = 'none';
    buyerPhoneError.textContent = '';
    orderSubmitBtn.classList.add('disabled');

    modalOverlay.classList.add('active');
    // si solo hay una licencia, ya queda elegida
    if (licenses.length === 1) selectLicense(licenses[0].license_type);
  }

  function selectLicense(type) {
    selectedLicenseType = type;
    const track = activeModalTrack;
    const lic = (track.licenses || []).find(l => l.license_type === type);
    if (!lic) return;

    document.querySelectorAll('.license-option').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.type === type);
    });

    modalPrice.textContent = formatPriceInCurrency(lic.price_cup, selectedCurrency);
    document.getElementById('modal-price').style.display = 'block';
    const contrato = document.getElementById('modal-contract-link');
    contrato.href = '/api/tracks/' + track.id + '/contrato/' + encodeURIComponent(type) + '?moneda=' + encodeURIComponent(selectedCurrency);
    contrato.hidden = false;
    document.getElementById('modal-instructions').style.display = 'block';

    const accountsForCurrency = paymentInfo.accounts.filter(a => a.currency === selectedCurrency);
    const qv = esPagoQvapay();
    modoQvapay(qv);

    modalAccounts.innerHTML = '';
    if (qv) {
      modalAccounts.innerHTML = '<div class="modal-qvapay">Pago con tu saldo QvaPay. La licencia y los archivos se entregan en cuanto se confirma el pago.</div>';
    } else if (!accountsForCurrency.length) {
      modalAccounts.innerHTML = `<div class="modal-no-accounts">Pago en ${escapeHtml(selectedCurrency)} no disponible por ahora. Elige otra moneda.</div>`;
    } else {
      accountsForCurrency.forEach((acc) => {
        const row = document.createElement('div');
        row.className = 'modal-account-row';
        row.innerHTML = `
          <div>
            <div class="modal-account-bank">${escapeHtml(acc.bank)}</div>
            <div class="modal-account-number">${escapeHtml(acc.number)}</div>
          </div>
          <button class="modal-account-copy" type="button">Copiar</button>
        `;
        row.querySelector('.modal-account-copy').addEventListener('click', (e) => {
          navigator.clipboard.writeText(acc.number).then(() => {
            const btn = e.target;
            btn.textContent = '✓';
            btn.classList.add('copied');
            setTimeout(() => { btn.textContent = 'Copiar'; btn.classList.remove('copied'); }, 1500);
          });
        });
        modalAccounts.appendChild(row);
      });
    }

    const confirmPhoneBlock = document.getElementById('modal-confirm-phone');
    if (!qv && accountsForCurrency.length && paymentInfo.contactPhone) {
      document.getElementById('modal-confirm-phone-number').textContent = paymentInfo.contactPhone;
      confirmPhoneBlock.style.display = 'flex';
    } else {
      confirmPhoneBlock.style.display = 'none';
    }

    orderForm.style.display = qv || accountsForCurrency.length ? 'block' : 'none';
    vipPublicWrap.style.display = type === 'exclusive' ? 'flex' : 'none';
    if (type !== 'exclusive') vipPublicInput.checked = false;
    updateSubmitButtonState();
    const etiqueta = (LICENSE_INFO[type] || {}).label || type;
    buyNextBtn.disabled = false;
    buyNextBtn.textContent = 'Continuar con ' + etiqueta;
    buyResumen.textContent = 'Licencia ' + etiqueta + ' · ' + modalPrice.textContent;
  }

  const telefonoValido = (v) => String(v || '').replace(/[^0-9]/g, '').length >= 8;
  // QvaPay: pago automático con el saldo del artista (sin comprobante ni número de transacción)
  const esPagoQvapay = () => Boolean(paymentInfo.qvapay && selectedCurrency === paymentInfo.qvapay.moneda);
  const textoInstrucciones = document.getElementById('modal-instructions').innerHTML;
  function modoQvapay(qv) {
    const tx = document.getElementById('tx-ref-input');
    tx.closest('.modal-field').hidden = qv;
    tx.required = !qv; // un campo oculto y obligatorio impediría enviar el formulario
    document.querySelector('.modal-receipt-step').hidden = qv;
    document.getElementById('modal-instructions').innerHTML = qv
      ? 'Al continuar, se abrirá QvaPay para completar el pago con tu saldo.'
      : textoInstrucciones;
  }
  const txValido = () => String(document.getElementById('tx-ref-input').value || '').replace(/[^A-Za-z0-9]/g, '').length >= 4;
  const pagoListo = () => esPagoQvapay() || (txValido() && Boolean(receiptFile));
  function updateSubmitButtonState() {
    const qv = esPagoQvapay();
    const txOk = qv || txValido();
    const pagoOk = qv || receiptFile;
    // botón del paso «Pago»: dice qué falta
    pagoNextBtn.disabled = !pagoListo();
    pagoNextBtn.textContent = qv ? 'Continuar' : !receiptFile ? 'Adjunta el comprobante' : !txOk ? 'Escribe el número de la transacción' : 'Continuar';
    document.getElementById('pago-resumen').textContent = qv ? 'Pago con QvaPay' : 'Pago: comprobante adjunto';
    const ready = selectedLicenseType && buyerNameInput.value.trim() && telefonoValido(buyerPhoneInput.value) && txOk && pagoOk && termsAcceptInput.checked;
    orderSubmitBtn.disabled = !ready;
    orderSubmitBtn.classList.toggle('disabled', !ready);
    if (!termsAcceptInput.checked && selectedLicenseType && buyerNameInput.value.trim() && buyerPhoneInput.value.trim() && pagoOk) {
      orderSubmitBtn.textContent = 'Acepta los términos para continuar';
    } else {
      orderSubmitBtn.textContent = ready
        ? (qv ? 'Pagar con QvaPay' : 'Enviar comprobante')
        : 'Completa tus datos';
    }
  }

  buyerNameInput.addEventListener('input', updateSubmitButtonState);
  document.getElementById('tx-ref-input').addEventListener('input', updateSubmitButtonState);
  buyerPhoneInput.addEventListener('input', () => {
    buyerPhoneError.textContent = '';
    updateSubmitButtonState();
  });
  buyerPhoneInput.addEventListener('blur', () => {
    const v = buyerPhoneInput.value.trim();
    buyerPhoneError.textContent = v && !telefonoValido(v) ? 'Incluye el código de país (ej: 5351234567).' : '';
  });
  termsAcceptInput.addEventListener('change', updateSubmitButtonState);

  function openTermsModal() {
    termsModalOverlay.classList.add('active');
  }

  function closeTermsModal() {
    termsModalOverlay.classList.remove('active');
  }

  document.getElementById('modal-terms-link').addEventListener('click', openTermsModal);
  document.getElementById('modal-terms-link-inline').addEventListener('click', openTermsModal);
  document.getElementById('terms-modal-close-btn').addEventListener('click', closeTermsModal);
  document.getElementById('terms-modal-accept-btn').addEventListener('click', closeTermsModal);
  termsModalOverlay.addEventListener('click', (e) => {
    if (e.target === termsModalOverlay) closeTermsModal();
  });

  // La foto del comprobante se achica (~1600 px, JPG) antes de subirla: con datos móviles
  // pasa de varios MB a unos cientos de KB y sigue siendo legible. Si no se puede, va la original.
  function comprimirFoto(file) {
    return new Promise((resolve) => {
      const tipoAceptado = /^image\/(jpeg|png|webp)$/i.test(file.type || '');
      const esImagen = /^image\//i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');
      if (!esImagen || (tipoAceptado && file.size < 300 * 1024)) { resolve(file); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * escala));
          const h = Math.max(1, Math.round(img.naturalHeight * escala));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            if (!blob || (tipoAceptado && blob.size >= file.size)) { resolve(file); return; }
            const nombre = String(file.name || 'comprobante').replace(/\.[^.]+$/, '') + '.jpg';
            try { resolve(new File([blob], nombre, { type: 'image/jpeg' })); } catch { blob.name = nombre; resolve(blob); }
          }, 'image/jpeg', 0.82);
        } catch {
          URL.revokeObjectURL(url);
          resolve(file);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  receiptInput.addEventListener('change', async () => {
    const original = receiptInput.files[0];
    if (!original) return;
    receiptDropText.style.display = 'block';
    receiptDropText.textContent = 'Preparando la foto…';
    const file = await comprimirFoto(original);
    receiptFile = file;
    receiptDrop.classList.add('has-receipt');
    receiptDropText.style.display = 'block';
    receiptDropText.textContent = 'Comprobante adjunto · toca para cambiarlo';
    if (receiptPreview.src && receiptPreview.src.startsWith('blob:')) URL.revokeObjectURL(receiptPreview.src);
    receiptPreview.src = URL.createObjectURL(file);
    receiptPreview.style.display = 'block';
    updateSubmitButtonState();
  });

  orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (esPagoQvapay()) { pagarConQvapay(); return; }
    if (!receiptFile || !activeModalTrack || !termsAcceptInput.checked || !selectedLicenseType) return;

    const buyerName = buyerNameInput.value.trim();
    const buyerPhone = buyerPhoneInput.value.trim();
    if (!telefonoValido(buyerPhone)) {
      buyerPhoneError.textContent = 'Incluye el código de país (ej: 5351234567).';
      buyerPhoneInput.focus();
      return;
    }
    const lic = (activeModalTrack.licenses || []).find(l => l.license_type === selectedLicenseType);
    const displayedPrice = formatPriceInCurrency(lic ? lic.price_cup : 0, selectedCurrency);
    const licenseLabel = (LICENSE_INFO[selectedLicenseType] || {}).label || selectedLicenseType;

    orderSubmitBtn.disabled = true;
    orderSubmitBtn.textContent = 'Enviando…';

    try {
      const formData = new FormData();
      formData.append('trackId', activeModalTrack.id);
      formData.append('buyerName', buyerName);
      formData.append('buyerPhone', buyerPhone);
      formData.append('transactionRef', document.getElementById('tx-ref-input').value.trim());
      formData.append('currency', selectedCurrency);
      formData.append('displayedPrice', displayedPrice);
      formData.append('licenseType', selectedLicenseType);
      formData.append('vipPublic', selectedLicenseType === 'exclusive' && vipPublicInput.checked ? '1' : '0');
      formData.append('receipt', receiptFile, receiptFile.name || 'comprobante.jpg');

      const res = await fetch('/api/orders', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo enviar el comprobante');
      }

      const orderData = await res.json().catch(() => ({}));
      if (orderData.orderToken) {
        guardarCompra({ token: orderData.orderToken, title: activeModalTrack.title, license: licenseLabel, createdAt: new Date().toISOString(), codigo: orderData.codigo || '' });
      }
      const codigoEl = document.getElementById('modal-order-code');
      const recibo = document.getElementById('modal-receipt-btn');
      if (orderData.codigo) {
        codigoEl.textContent = 'Tu pedido: ' + orderData.codigo + '. El vendedor tiene ' + horasTxt(orderData.horasAprobacion || 24) + ' para aprobarlo.';
        codigoEl.hidden = false;
      } else codigoEl.hidden = true;
      if (orderData.comprobanteUrl) { recibo.href = orderData.comprobanteUrl; recibo.hidden = false; } else recibo.hidden = true;

      orderForm.style.display = 'none';
      modalSuccess.style.display = 'block';
      irPaso(4);

      if (paymentInfo.contactPhone) {
        const message = encodeURIComponent(
          `Hola, soy ${buyerName} 👋 Acabo de comprar "${activeModalTrack.title}" (Licencia ${licenseLabel})` +
          ` (${displayedPrice}). ` + (orderData.codigo ? `Pedido ${orderData.codigo}. ` : '') +
          `El comprobante ya está adjunto en el pedido. ¡Gracias!`
        );
        const phoneDigits = paymentInfo.contactPhone.replace(/[^0-9]/g, '');
        modalWhatsappBtn.href = `https://wa.me/${phoneDigits}?text=${message}`;
        modalWhatsappBtn.style.display = '';
      } else {
        modalWhatsappBtn.style.display = 'none';
      }
    } catch (err) {
      alert(err.message);
      orderSubmitBtn.disabled = false;
      updateSubmitButtonState();
    }
  });

  async function pagarConQvapay() {
    if (!activeModalTrack || !termsAcceptInput.checked || !selectedLicenseType) return;
    const buyerName = buyerNameInput.value.trim();
    const buyerPhone = buyerPhoneInput.value.trim();
    if (!telefonoValido(buyerPhone)) {
      buyerPhoneError.textContent = 'Incluye el código de país (ej: 5351234567).';
      buyerPhoneInput.focus();
      return;
    }
    const licenseLabel = (LICENSE_INFO[selectedLicenseType] || {}).label || selectedLicenseType;
    orderSubmitBtn.disabled = true;
    orderSubmitBtn.textContent = 'Conectando con QvaPay…';
    try {
      const res = await fetch('/api/orders/qvapay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId: activeModalTrack.id, buyerName, buyerPhone, licenseType: selectedLicenseType,
          vipPublic: selectedLicenseType === 'exclusive' && vipPublicInput.checked }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) throw new Error(d.error || 'No se pudo iniciar el pago con QvaPay.');
      guardarCompra({ token: d.orderToken, title: activeModalTrack.title, license: licenseLabel, createdAt: new Date().toISOString(), codigo: d.codigo || '' });
      orderSubmitBtn.textContent = 'Abriendo QvaPay…';
      location.href = d.url;
    } catch (err) {
      alert(err.message);
      orderSubmitBtn.disabled = false;
      updateSubmitButtonState();
    }
  }

  function closeBuyModal() {
    modalOverlay.classList.remove('active');
  }

  modalClose.addEventListener('click', closeBuyModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeBuyModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (termsModalOverlay.classList.contains('active')) closeTermsModal();
    else if (purchasesOverlay.classList.contains('active')) purchasesOverlay.classList.remove('active');
    else if (descOverlay.classList.contains('active')) descOverlay.classList.remove('active');
    else closeBuyModal();
  });

  // ---------- Mis compras: el comprador ve el estado y descarga solo al aprobarse ----------
  const COMPRAS_KEY = 'zonabeats_compras';
  const purchasesBtn = document.getElementById('my-purchases-btn');
  const purchasesBadge = document.getElementById('my-purchases-badge');
  const purchasesOverlay = document.getElementById('purchases-overlay');
  const purchasesList = document.getElementById('purchases-list');
  let comprasEstado = {};
  let comprasTimer = null;

  function leerCompras() {
    try { return JSON.parse(localStorage.getItem(COMPRAS_KEY) || '[]').filter(c => c && /^[a-f0-9]{48}$/.test(c.token)); }
    catch { return []; }
  }
  function escribirCompras(lista) {
    try { localStorage.setItem(COMPRAS_KEY, JSON.stringify(lista.slice(0, 50))); } catch { /* modo privado: solo en memoria */ }
    comprasMemoria = lista;
  }
  let comprasMemoria = leerCompras();
  function compras() { const l = leerCompras(); return l.length ? l : comprasMemoria; }

  function guardarCompra(c) {
    const lista = compras().filter(x => x.token !== c.token);
    lista.unshift({ downloaded: false, ...c });
    escribirCompras(lista);
    actualizarBotonCompras();
    revisarCompras();
  }

  function actualizarBotonCompras() {
    const lista = compras();
    purchasesBtn.style.display = lista.length ? 'inline-flex' : 'none';
    const listas = lista.filter(c => comprasEstado[c.token] && comprasEstado[c.token].status === 'approved' && !c.downloaded).length;
    purchasesBadge.textContent = listas ? String(listas) : '';
  }

  function descargarAhora(url) {
    const a = document.createElement('a');
    a.href = url; a.download = ''; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function revisarCompras() {
    const lista = compras();
    if (!lista.length) return;
    let hayPendientes = false;
    let pagoEnCurso = false;
    let cambio = false;
    for (const c of lista) {
      try {
        const r = await fetch('/api/purchase/' + c.token, { cache: 'no-store' });
        if (r.status === 404) { comprasEstado[c.token] = { status: 'missing' }; continue; }
        if (!r.ok) { hayPendientes = true; continue; }
        const d = await r.json();
        const antes = comprasEstado[c.token] && comprasEstado[c.token].status;
        comprasEstado[c.token] = d;
        if (d.status === 'pending') hayPendientes = true;
        if (d.status === 'esperando_pago') { hayPendientes = true; pagoEnCurso = true; }
        if (d.status === 'approved' && !c.downloaded && d.downloadUrl) {
          c.downloaded = true; cambio = true;
          descargarAhora(d.downloadUrl);
          if (antes === 'pending' || antes === 'esperando_pago') abrirCompras();
        }
        if (d.status === 'rejected' && antes === 'pending') abrirCompras();
      } catch { hayPendientes = true; }
    }
    if (cambio) escribirCompras(lista);
    actualizarBotonCompras();
    // mientras la persona escribe una reseña o un reclamo no se repinta
    if (purchasesOverlay.classList.contains('active') && !purchasesList.contains(document.activeElement)) pintarCompras();
    clearTimeout(comprasTimer);
    // tras volver de QvaPay se consulta más seguido hasta que llegue la confirmación
    if (hayPendientes) comprasTimer = setTimeout(revisarCompras, pagoEnCurso ? 5000 : 30000);
  }

  // qué fichas de «Mis compras» dejó abiertas la persona (por defecto, la más reciente)
  const comprasAbiertas = new Map();
  let firmaCompras = '';
  function pintarCompras(forzar) {
    const lista = compras();
    // si nada cambió no se repinta (no se pierde lo que se está escribiendo ni el desplazamiento)
    const firma = JSON.stringify(lista.map(c => [c.token, comprasEstado[c.token] || null]));
    if (!forzar && firma === firmaCompras) return;
    firmaCompras = firma;
    if (!lista.length) {
      purchasesList.innerHTML = '<p class="purchases-hint">Aún no tienes compras en este dispositivo.</p>';
      return;
    }
    const pesoTxt = (b) => {
      const n = Number(b) || 0;
      if (!n) return '';
      if (n >= 1024 * 1024 * 1024) return ' · ' + (n / 1024 / 1024 / 1024).toLocaleString('es', { maximumFractionDigits: 1 }) + ' GB';
      return ' · ' + Math.max(1, Math.round(n / 1024 / 1024)) + ' MB';
    };
    const CHIP = { approved: ['ok', 'Lista'], pending: ['pend', 'En revisión'], esperando_pago: ['pend', 'Sin pagar'], rejected: ['bad', 'No aprobada'], missing: ['bad', 'No encontrada'] };
    purchasesList.innerHTML = lista.map((c, idx) => {
      const d = comprasEstado[c.token] || {};
      const fecha = new Date(d.createdAt || c.createdAt || Date.now()).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
      let estado = '<span class="purchase-status pending">Comprobando…</span>';
      let acciones = '';
      if (d.status === 'pending') {
        estado = '<span class="purchase-status pending">Esperando confirmación del pago</span>';
        if (d.limiteAprobacion) {
          const lim = new Date(d.limiteAprobacion);
          const txtLim = lim.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
          estado += d.puedeReclamar
            ? '<span class="purchase-plazo vencido">Pasó el plazo de ' + horasTxt(d.horasAprobacion || 24) + ' (' + txtLim + ') sin confirmar tu pago.</span>'
            : '<span class="purchase-plazo">Confirmación antes del ' + txtLim + '.</span>';
        }
      }
      if (d.status === 'esperando_pago') {
        estado = '<span class="purchase-status pending">Pago con QvaPay sin completar</span>' +
          (d.qvapay && d.qvapay.url ? '<span class="purchase-meta">Si ya pagaste, la confirmación llega en unos segundos.</span>' : '');
        if (d.qvapay && d.qvapay.url) acciones = '<div class="purchase-actions"><a class="purchase-dl" href="' + escapeHtml(d.qvapay.url) + '">Completar pago en QvaPay</a></div>';
      }
      if (d.status === 'pending' && d.qvapay && d.qvapay.pagado) {
        estado = '<span class="purchase-status pending">Pago recibido por QvaPay · en revisión</span>';
      }
      if (d.status === 'missing') estado = '<span class="purchase-status missing">Compra no encontrada. Contáctanos por WhatsApp.</span>';
      if (d.status === 'rejected') {
        estado = '<span class="purchase-status missing">Pago no aprobado</span>' +
          '<span class="purchase-meta">' + (d.rejectReason ? 'Motivo: ' + escapeHtml(d.rejectReason) : 'No se pudo confirmar tu pago.') + '</span>';
      }
      if (d.status === 'approved') {
        estado = '<span class="purchase-status approved">Aprobada · Licencia ' + escapeHtml(d.certificateId || '') + '</span>';
        const archivos = Array.isArray(d.files) ? d.files : [];
        acciones = '<div class="purchase-actions">' +
          (archivos.length
            ? archivos.map((f, i) => '<a class="' + (i === 0 ? 'purchase-dl' : 'purchase-pdf') + '" href="' + escapeHtml(f.url) + '" download>Descargar ' + escapeHtml(f.label || f.f) + pesoTxt(f.size) + '</a>').join('')
            : '<span class="purchase-meta">Recibirás tus archivos por WhatsApp.</span>') +
          (d.pdfUrl ? '<a class="purchase-pdf" href="' + escapeHtml(d.pdfUrl) + '" target="_blank" rel="noopener">Licencia en PDF</a>' : '') +
          '</div>' +
          ((archivos.length > 1 || archivos.some(f => f.f === 'pack')) ? '<span class="purchase-meta">Para WAV, STEMS y packs se recomienda una conexión estable.</span>' : '');
      }
      // reclamo: si pasó el plazo sin aprobar, o si rechazaron el pago
      let reclamo = '';
      if (d.reclamo) {
        const fr = new Date(String(d.reclamo.fecha).replace(' ', 'T') + 'Z').toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        reclamo = '<span class="purchase-reclamo-ok">' + (d.reclamo.atendido ? 'Tu reclamo del ' + fr + ' fue atendido.' : 'Reclamo enviado el ' + fr + '.') + '</span>';
      }
      if (d.puedeReclamar && !(d.reclamo && !d.reclamo.atendido)) {
        const idR = 'reclamo-' + c.token.slice(0, 8);
        reclamo += '<div class="purchase-reclamo">' +
          '<label for="' + idR + '">' + (d.status === 'rejected' ? 'Solicitar revisión' : 'Reclamar') + '</label>' +
          '<textarea id="' + idR + '" maxlength="600" placeholder="Detalles del pago"></textarea>' +
          '<button type="button" class="purchase-reclamar" data-token="' + c.token + '">Enviar reclamo</button></div>';
      }
      // reseña verificada y ayuda con Content ID (solo compras aprobadas)
      let extras = '';
      if (d.status === 'approved') {
        const rs = d.resena;
        const idT = c.token.slice(0, 8);
        extras += '<details class="purchase-more"' + (rs ? '' : ' open') + '><summary>' + (rs ? 'Tu reseña: ' + estrellasTxt(rs.estrellas) : 'Califica tu compra') + '</summary>' +
          (rs && rs.oculta ? '<span class="purchase-meta">Tu reseña no está visible.</span>' :
          '<div class="rev-form" data-token="' + c.token + '"><div class="rev-pick" role="radiogroup" aria-label="Estrellas">' +
            [1, 2, 3, 4, 5].map(n => '<button type="button" role="radio" class="rev-star' + (rs && rs.estrellas >= n ? ' on' : '') + '" data-n="' + n + '" aria-checked="' + String(Boolean(rs && rs.estrellas === n)) + '" aria-label="' + n + ' estrella' + (n === 1 ? '' : 's') + '">★</button>').join('') +
          '</div><label class="sr-only" for="rev-txt-' + idT + '">Tu opinión</label><textarea id="rev-txt-' + idT + '" maxlength="600" placeholder="¿Qué te pareció? (opcional)">' + escapeHtml(rs ? rs.texto : '') + '</textarea>' +
          '<button type="button" class="rev-send">' + (rs ? 'Cambiar reseña' : 'Publicar reseña') + '</button></div>') + '</details>';
        if (d.contentId) {
          const reps = d.contentId.reportes || [];
          extras += '<details class="purchase-more"' + (reps.some(x => x.estado === 'abierto') ? ' open' : '') + '><summary>¿Te saltó un reclamo de derechos de autor?</summary>' +
            '<p class="purchase-meta">' + (d.contentId.monetiza ? 'Tu licencia incluye monetización. Presenta esta carta para impugnar cualquier reclamo y repórtalo aquí.' : 'Tu licencia incluye distribución. Presenta esta carta para mantener tu publicación.') + '</p>' +
            '<div class="purchase-actions"><a class="purchase-pdf" href="' + escapeHtml(d.contentId.cartaUrl) + '" target="_blank" rel="noopener">Carta de licencia</a></div>' +
            reps.map(x => '<span class="purchase-meta">Reporte del ' + new Date(String(x.created_at).replace(' ', 'T') + 'Z').toLocaleDateString('es') + ' (' + escapeHtml(x.plataforma) + ', ' + escapeHtml(x.reclamante) + '): ' + (x.estado === 'abierto' ? 'en gestión' : 'resuelto · ' + escapeHtml(x.nota)) + '</span>').join('') +
            '<div class="cid-form" data-token="' + c.token + '">' +
              '<label for="cid-pl-' + idT + '">Plataforma</label><select id="cid-pl-' + idT + '"><option value="">Elige…</option>' + ['YouTube', 'Facebook / Instagram', 'TikTok', 'SoundCloud', 'Twitch', 'Spotify / Apple Music / distribuidora', 'Otra'].map(o => '<option>' + o + '</option>').join('') + '</select>' +
              '<label for="cid-rc-' + idT + '">Reclamante</label><input type="text" id="cid-rc-' + idT + '" maxlength="150" placeholder="Sello o distribuidora">' +
              '<label for="cid-ln-' + idT + '">Enlace (opcional)</label><input type="text" id="cid-ln-' + idT + '" maxlength="300">' +
              '<button type="button" class="cid-send">Reportar reclamo</button></div></details>';
        }
      }
      const codigo = d.codigo || c.codigo || '';
      const comprobante = d.comprobanteUrl ? '<a class="purchase-pdf" href="' + escapeHtml(d.comprobanteUrl) + '" target="_blank" rel="noopener">Comprobante del pedido</a>' : '';
      if (comprobante && d.status === 'esperando_pago' && acciones) acciones = acciones.replace('</div>', comprobante + '</div>');
      else if (comprobante && d.status !== 'approved') acciones = '<div class="purchase-actions">' + comprobante + '</div>';
      else if (comprobante) acciones = acciones.replace('</div>', comprobante + '</div>');
      const chip = CHIP[d.status] || ['pend', 'Comprobando'];
      const abierta = comprasAbiertas.has(c.token) ? comprasAbiertas.get(c.token) : idx === 0;
      return '<details class="purchase-card' + (d.status === 'approved' ? ' is-approved' : (d.status === 'rejected' ? ' is-rejected' : '')) + '" data-token="' + c.token + '"' + (abierta ? ' open' : '') + '>' +
        '<summary class="purchase-sum"><span class="purchase-sum-main"><span class="purchase-title">' + escapeHtml(c.title || d.trackTitle || 'Beat') + '</span>' +
        '<span class="purchase-meta">Licencia ' + escapeHtml(String(c.license || d.licenseLabel || '').replace(/^Licencia (de )?/i, '')) + ' · ' + fecha + '</span></span>' +
        '<span class="purchase-chip ' + chip[0] + '">' + chip[1] + '</span></summary>' +
        '<div class="purchase-body">' +
        (codigo ? '<div class="purchase-code">Pedido ' + escapeHtml(codigo) + '</div>' : '') +
        estado + acciones + extras + reclamo +
        '<button type="button" class="purchase-forget" data-token="' + c.token + '">Quitar de este dispositivo</button>' +
        '</div></details>';
    }).join('');
    purchasesList.querySelectorAll('details.purchase-card').forEach((dt) => {
      dt.addEventListener('toggle', () => {
        comprasAbiertas.set(dt.dataset.token, dt.open);
        // una compra abierta a la vez: así «Mis compras» cabe sin desplazarse
        if (dt.open) purchasesList.querySelectorAll('details.purchase-card[open]').forEach((o) => { if (o !== dt) o.open = false; });
      });
    });
    purchasesList.querySelectorAll('.rev-form').forEach((f) => {
      let elegidas = (f.querySelectorAll('.rev-star.on') || []).length;
      f.querySelectorAll('.rev-star').forEach((b) => b.addEventListener('click', () => {
        elegidas = Number(b.dataset.n);
        f.querySelectorAll('.rev-star').forEach((x) => { x.classList.toggle('on', Number(x.dataset.n) <= elegidas); x.setAttribute('aria-checked', String(Number(x.dataset.n) === elegidas)); });
      }));
      f.querySelector('.rev-send').addEventListener('click', async (ev) => {
        if (!elegidas) { alert('Elige de 1 a 5 estrellas.'); return; }
        ev.target.disabled = true;
        const r = await fetch('/api/purchase/' + f.dataset.token + '/resena', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estrellas: elegidas, texto: f.querySelector('textarea').value }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { alert(d.error || 'No se pudo publicar.'); ev.target.disabled = false; return; }
        await revisarCompras(); pintarCompras(true);
      });
    });
    purchasesList.querySelectorAll('.cid-form').forEach((f) => {
      f.querySelector('.cid-send').addEventListener('click', async (ev) => {
        const [pl, rc, ln] = f.querySelectorAll('select, input');
        if (!pl.value) { pl.focus(); return; }
        if (rc.value.trim().length < 2) { rc.focus(); return; }
        ev.target.disabled = true;
        const r = await fetch('/api/purchase/' + f.dataset.token + '/content-id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plataforma: pl.value, reclamante: rc.value, enlace: ln.value }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { alert(d.error || 'No se pudo enviar.'); ev.target.disabled = false; return; }
        await revisarCompras(); pintarCompras(true);
      });
    });
    purchasesList.querySelectorAll('.purchase-reclamar').forEach((b) => b.addEventListener('click', async () => {
      const caja = b.closest('.purchase-reclamo');
      const texto = caja.querySelector('textarea').value.trim();
      if (texto.length < 5) { caja.querySelector('textarea').focus(); return; }
      b.disabled = true;
      try {
        const r = await fetch('/api/purchase/' + b.dataset.token + '/reclamo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { alert(d.error || 'No se pudo enviar el reclamo.'); b.disabled = false; return; }
        const tel = String(d.adminPhone || '').replace(/[^0-9]/g, '');
        if (tel) window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent('Hola, hice un reclamo por mi pedido ' + (d.codigo || '') + ': ' + texto), '_blank', 'noopener');
        await revisarCompras();
        pintarCompras(true);
      } catch { alert('No hay conexión. Intenta de nuevo.'); b.disabled = false; }
    }));
    purchasesList.querySelectorAll('.purchase-forget').forEach((b) => b.addEventListener('click', () => {
      if (!confirm('¿Quitar esta compra de este dispositivo? Solo podrás recuperarla con su enlace privado.')) return;
      escribirCompras(compras().filter(x => x.token !== b.dataset.token));
      pintarCompras(true); actualizarBotonCompras();
    }));
  }

  // «Mis compras» por páginas: las fichas que caben en la ventana
  ZBUI.paginarDom(purchasesList, { porPagina: () => 6, filas: '.purchase-card', etiqueta: 'Páginas de compras', caja: document.querySelector('#purchases-overlay .modal-box') });

  function abrirCompras() {
    modalOverlay.classList.remove('active');
    pintarCompras(true);
    purchasesOverlay.classList.add('active');
  }
  purchasesBtn.addEventListener('click', () => { abrirCompras(); revisarCompras(); });
  document.getElementById('modal-see-purchases-btn').addEventListener('click', abrirCompras);
  document.getElementById('purchases-close-btn').addEventListener('click', () => purchasesOverlay.classList.remove('active'));
  purchasesOverlay.addEventListener('click', (e) => { if (e.target === purchasesOverlay) purchasesOverlay.classList.remove('active'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarCompras(); });

  // Regreso desde QvaPay: /?pago=ok o /?pago=cancelado
  (function volverDeQvapay() {
    const pago = new URLSearchParams(location.search).get('pago');
    if (pago !== 'ok' && pago !== 'cancelado') return;
    history.replaceState(null, '', location.pathname);
    setTimeout(() => { abrirCompras(); revisarCompras(); }, 300);
  })();

  // Link privado que manda el vendedor por WhatsApp: /?compra=TOKEN
  (function tomarCompraDeLaUrl() {
    const params = new URLSearchParams(location.search);
    const t = (params.get('compra') || '').toLowerCase();
    if (/^[a-f0-9]{48}$/.test(t)) {
      if (!compras().some(c => c.token === t)) {
        const lista = compras(); lista.unshift({ token: t, createdAt: new Date().toISOString(), downloaded: false }); escribirCompras(lista);
      }
      history.replaceState(null, '', location.pathname);
      setTimeout(abrirCompras, 300);
    }
  })();

  // ---------- Compra con confianza: quién vende y cifras reales ----------
  const horasTxt = (h) => h + (Number(h) === 1 ? ' hora' : ' horas');
  function duracionTexto(min) {
    if (min < 1) return 'menos de 1 min';
    if (min < 60) return Math.round(min) + ' min';
    if (min < 48 * 60) { const h = Math.floor(min / 60), m = Math.round(min % 60); return h + ' h' + (m ? ' ' + m + ' min' : ''); }
    return Math.round(min / 1440) + ' días';
  }
  async function loadConfianza() {
    let d;
    try { const r = await fetch('/api/confianza'); if (!r.ok) return; d = await r.json(); } catch { return; }
    const $t = (id) => document.getElementById(id);
    $t('trust').hidden = false;
    if (d.titular) {
      $t('trust-titular').textContent = d.titular;
      $t('trust-figura').textContent = d.figura || '';
      $t('trust-vende').hidden = false;
    }
    $t('trust-plazo').textContent = 'Confirmación del pago en menos de ' + horasTxt(d.horasAprobacion) + '.';
    const c = d.cifras || {};
    const items = [];
    if (c.entregadas > 0) items.push(['' + c.entregadas.toLocaleString('es'), c.entregadas === 1 ? 'compra entregada' : 'compras entregadas']);
    if (c.aprobacion && c.aprobacion.muestras >= 3) items.push([duracionTexto(c.aprobacion.mediana), 'tiempo medio de confirmación']);
    if (c.productores > 0) items.push(['' + c.productores, c.productores === 1 ? 'productor activo' : 'productores activos']);
    if (items.length) {
      $t('trust-cifras').innerHTML = items.map(i => '<li><strong>' + escapeHtml(i[0]) + '</strong><span>' + escapeHtml(i[1]) + '</span></li>').join('');
      $t('trust-cifras-card').hidden = false;
    }
    const tel = String(d.contacto || '').replace(/[^0-9]/g, '');
    if (tel) {
      $t('trust-wa').href = 'https://wa.me/' + tel;
      $t('trust-wa').textContent = 'WhatsApp +' + tel;
      $t('trust-contacto-card').hidden = false;
    }
  }

  // ---------- Quién vende: columna lateral en el ordenador, hoja «Info» en el teléfono ----------
  const lado = document.getElementById('lado');
  const ladoExtra = document.getElementById('lado-extra');
  const infoOverlay = document.getElementById('info-overlay');
  const infoCuerpo = document.getElementById('info-cuerpo');
  const infoBtn = document.getElementById('info-btn');
  const mqLado = window.matchMedia('(min-width: 900px) and (min-height: 700px)');
  function abrirInfo() { infoOverlay.classList.add('active'); infoBtn.setAttribute('aria-expanded', 'true'); }
  function cerrarInfo() { infoOverlay.classList.remove('active'); infoBtn.setAttribute('aria-expanded', 'false'); }
  function ubicarInfo() {
    if (mqLado.matches) {
      cerrarInfo();
      if (ladoExtra.parentElement !== lado) lado.appendChild(ladoExtra);
    } else if (ladoExtra.parentElement !== infoCuerpo) infoCuerpo.appendChild(ladoExtra);
  }
  infoBtn.addEventListener('click', abrirInfo);
  document.getElementById('info-close').addEventListener('click', cerrarInfo);
  infoOverlay.addEventListener('click', (e) => { if (e.target === infoOverlay) cerrarInfo(); });
  mqLado.addEventListener('change', ubicarInfo);
  ubicarInfo();

  async function init() {
    loadConfianza();
    await loadExchangeRates();
    loadProfile();
    loadSiteConfig();
    loadPaymentInfo();
    loadSocialLinks();
    actualizarBotonCompras();
    revisarCompras();
    loadHots();
    await loadTracksForSection('catalog');
    abrirPistaCompartida();
  }

  init();
})();
