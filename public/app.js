(() => {
  const audioEl = document.getElementById('audio-el');
  const playerBar = document.getElementById('player-bar');
  const playerCover = document.getElementById('player-cover');
  const playerTitle = document.getElementById('player-title');
  const playBtn = document.getElementById('player-play-btn');
  const iconPlay = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  const progressTrack = document.getElementById('progress-track');
  const progressFill = document.getElementById('progress-fill');
  const timeCurrent = document.getElementById('time-current');
  const timeTotal = document.getElementById('time-total');
  const trackGrid = document.getElementById('track-grid');
  const emptyState = document.getElementById('empty-state');
  const emptyStateTitle = document.getElementById('empty-state-title');
  const emptyStateText = document.getElementById('empty-state-text');
  const noResultsState = document.getElementById('no-results-state');
  const trackCount = document.getElementById('track-count');
  const sectionTitle = document.getElementById('section-title');
  const searchInput = document.getElementById('search-input');
  const currencySelect = document.getElementById('currency-select');
  const paymentMethodsRail = document.getElementById('payment-methods-rail');
  const paymentMethodsList = document.getElementById('payment-methods-list');
  const catalogLayout = document.querySelector('.catalog-layout');

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
  let currentSection = 'catalog'; // catalog | playlist | vip | producers
  let tracksBySection = { catalog: [], playlist: [], vip: [] };
  let discountPercent = 0;
  let paymentInfo = { contactPhone: '', accounts: [] };
  let exchangeRates = [];
  let selectedCurrency = 'CUP';
  let activeModalTrack = null;
  let searchQuery = '';

  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  async function loadProfile() {
    const res = await fetch('/api/profile');
    const { profile } = await res.json();
    document.getElementById('artist-name').textContent = profile.artist_name || '';
    document.getElementById('artist-bio').textContent = profile.bio || '';
    document.title = profile.artist_name ? `${profile.artist_name} · Zona Beats` : 'Zona Beats';
    if (profile.avatar_filename) {
      const avatarImg = document.getElementById('avatar');
      avatarImg.src = '/api/avatar?_=' + Date.now();
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
    if (converted == null) return `${priceCup} CUP`;
    const wholeNumberCurrencies = ['CUP', 'SALDO_MOVIL'];
    const decimals = wholeNumberCurrencies.includes(currencyCode) ? 0 : 2;
    const formatted = converted.toLocaleString('es', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return `${formatted} ${rate.label}`;
  }

  currencySelect.addEventListener('change', () => {
    selectedCurrency = currencySelect.value;
    renderPaymentMethodsRail();
    renderCurrentSection();
  });

  function renderPaymentMethodsRail() {
    const usable = exchangeRates.filter(r => r.code === 'CUP' || r.cupPerUnit > 0);
    paymentMethodsList.innerHTML = usable.map(r => `<div class="payment-method-chip">${escapeHtml(r.label)}</div>`).join('');
  }

  async function loadPaymentInfo() {
    const res = await fetch('/api/payment-info');
    if (!res.ok) return;
    paymentInfo = await res.json();
  }

  const searchBarWrap = document.querySelector('.search-bar-wrap');
  const producersGrid = document.getElementById('producers-grid');
  const producerDetail = document.getElementById('producer-detail');

  document.querySelectorAll('.section-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const section = tab.dataset.section;
      if (section === currentSection) return;
      currentSection = section;

      document.querySelectorAll('.section-tab').forEach(t => t.classList.toggle('active', t === tab));

      const titles = { catalog: 'Catálogo', playlist: 'Playlist', vip: 'Beats VIP', producers: 'Productores' };
      sectionTitle.textContent = titles[section];

      const isProducers = section === 'producers';
      catalogLayout.classList.toggle('no-sidebar', section === 'playlist' || isProducers);
      paymentMethodsRail.style.display = (section === 'playlist' || isProducers) ? 'none' : 'block';
      trackGrid.style.display = isProducers ? 'none' : '';
      searchBarWrap.style.display = isProducers ? 'none' : '';
      producersGrid.style.display = isProducers ? 'grid' : 'none';
      producerDetail.style.display = 'none';
      trackCount.textContent = '';

      searchInput.placeholder = section === 'playlist'
        ? 'Buscar por nombre o género…'
        : 'Buscar por nombre, género o precio…';

      if (isProducers) {
        loadProducersList();
        return;
      }
      renderCurrentSection();
      if (!tracksBySection[section].length) loadTracksForSection(section);
    });
  });

  function getFavProducers() {
    try { return JSON.parse(localStorage.getItem('zonabeats_fav_producers') || '[]'); } catch { return []; }
  }
  function toggleFavProducer(id) {
    const favs = getFavProducers();
    const i = favs.indexOf(id);
    if (i === -1) favs.push(id); else favs.splice(i, 1);
    localStorage.setItem('zonabeats_fav_producers', JSON.stringify(favs));
    return favs.includes(id);
  }

  async function loadProducersList() {
    producersGrid.innerHTML = '<div class="empty-hint">Cargando…</div>';
    const res = await fetch('/api/producers');
    const { producers } = await res.json();
    const favs = getFavProducers();
    const ordenados = [...producers].sort((a, b) => favs.includes(b.id) - favs.includes(a.id));

    if (!ordenados.length) {
      producersGrid.innerHTML = '<div class="empty-hint">Todavía no hay productores en la plataforma.</div>';
      return;
    }

    producersGrid.innerHTML = ordenados.map(p => `
      <div class="producer-card" data-id="${p.id}">
        <button type="button" class="fav-btn ${favs.includes(p.id) ? 'active' : ''}" data-fav="${p.id}" aria-label="Favorito">
          <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
        ${p.avatar ? `<img class="producer-avatar" src="/api/producer/avatar/${p.id}" alt="">` : `<div class="producer-avatar producer-avatar-fallback">${escapeHtml((p.name||'?').charAt(0).toUpperCase())}</div>`}
        <div class="producer-card-name">${escapeHtml(p.name)}</div>
        <div class="producer-card-bio">${escapeHtml(p.bio || '')}</div>
        <div class="producer-card-count">${p.beats} beat${p.beats === 1 ? '' : 's'}</div>
      </div>
    `).join('');

    producersGrid.querySelectorAll('.fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.fav);
        btn.classList.toggle('active', toggleFavProducer(id));
      });
    });
    producersGrid.querySelectorAll('.producer-card').forEach(card => {
      card.addEventListener('click', () => openProducerDetail(Number(card.dataset.id)));
    });
  }

  async function openProducerDetail(id) {
    producersGrid.style.display = 'none';
    producerDetail.style.display = 'block';
    producerDetail.innerHTML = '<div class="empty-hint">Cargando…</div>';
    const res = await fetch(`/api/producers/${id}/tracks`);
    if (!res.ok) { producerDetail.innerHTML = '<div class="empty-hint">No se pudo cargar este productor.</div>'; return; }
    const { producer, tracks, discountPercent: dp } = await res.json();
    discountPercent = dp || 0;

    const socialHtml = (producer.socialLinks || []).map(l => {
      const platform = detectPlatform(l.url);
      const icon = SOCIAL_ICONS[platform] || SOCIAL_ICONS.generic;
      return `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(l.label || platform)}">${icon}</a>`;
    }).join('');

    producerDetail.innerHTML = `
      <button type="button" class="back-to-producers">&larr; Todos los productores</button>
      <div class="producer-detail-head">
        ${producer.avatar ? `<img class="producer-avatar-lg" src="/api/producer/avatar/${producer.id}" alt="">` : `<div class="producer-avatar-lg producer-avatar-fallback">${escapeHtml((producer.name||'?').charAt(0).toUpperCase())}</div>`}
        <div>
          <h2>${escapeHtml(producer.name)}</h2>
          <p>${escapeHtml(producer.bio || '')}</p>
          ${socialHtml ? `<div class="hero-social">${socialHtml}</div>` : ''}
        </div>
      </div>
      <div class="track-grid" id="producer-track-grid"></div>
    `;

    producerDetail.querySelector('.back-to-producers').addEventListener('click', () => {
      producerDetail.style.display = 'none';
      producersGrid.style.display = 'grid';
    });

    const grid = document.getElementById('producer-track-grid');
    const savedSection = currentSection;
    currentSection = 'catalog';
    renderTracks(tracks, tracks.length, grid);
    currentSection = savedSection;

    if (!tracks.length) grid.innerHTML = '<div class="empty-hint">Este productor todavía no tiene beats en venta.</div>';
  }

  async function loadTracksForSection(section) {
    const res = await fetch(`/api/tracks?type=${section}`);
    const data = await res.json();
    tracksBySection[section] = data.tracks;
    if (section === 'catalog' && typeof data.discountPercent === 'number') discountPercent = data.discountPercent;
    renderCurrentSection();
  }

  let searchDebounceTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderCurrentSection();
    }, 200);
  });

  function matchesSearch(track) {
    if (!searchQuery) return true;
    const haystacks = [track.title, track.genre, track.artist_credit, track.price_label]
      .filter(Boolean)
      .map(s => s.toLowerCase());
    return haystacks.some(h => h.includes(searchQuery));
  }

  function renderCurrentSection() {
    const allTracks = tracksBySection[currentSection] || [];
    const filtered = allTracks.filter(matchesSearch);
    renderTracks(filtered, allTracks.length);
  }

  function renderTracks(tracks, totalBeforeFilter, targetGrid) {
    const grid = targetGrid || trackGrid;
    grid.innerHTML = '';
    trackCount.textContent = tracks.length ? `${tracks.length} PISTA${tracks.length === 1 ? '' : 'S'}` : '';

    const hasSearch = Boolean(searchQuery);
    emptyState.style.display = (!totalBeforeFilter && !hasSearch) ? 'block' : 'none';
    noResultsState.style.display = (totalBeforeFilter > 0 && tracks.length === 0) ? 'block' : 'none';

    if (currentSection === 'vip') {
      emptyStateTitle.textContent = 'Aún no hay Beats VIP';
      emptyStateText.textContent = 'Cuando se vendan pistas exclusivas, aparecerán aquí.';
    } else if (currentSection === 'playlist') {
      emptyStateTitle.textContent = 'Playlist vacía';
      emptyStateText.textContent = 'Todavía no hay colaboraciones gratuitas publicadas.';
    } else {
      emptyStateTitle.textContent = 'Aún no hay pistas';
      emptyStateText.textContent = 'Está preparando el primer set. Vuelve pronto.';
    }

    tracks.forEach((track) => {
      const card = document.createElement('button');
      card.className = 'track-card';
      card.dataset.id = track.id;
      card.setAttribute('aria-label', `Reproducir ${track.title}`);

      const coverHtml = track.cover_filename
        ? `<img src="/api/cover/${track.id}" alt="" oncontextmenu="return false;">`
        : `<div class="track-cover-fallback">${(track.title || '?').charAt(0).toUpperCase()}</div>`;

      const genreBadge = track.genre
        ? `<div class="track-genre-badge">${escapeHtml(track.genre)}</div>`
        : '';

      const producerBadge = track.producer_name
        ? `<div class="track-producer-badge${track.genre ? ' below-genre' : ''}">prod. ${escapeHtml(track.producer_name)}</div>`
        : '';

      const exclusiveBadge = track.is_exclusive
        ? `<div class="track-exclusive-badge">★ Exclusiva</div>`
        : '';

      let priceChip = '';
      if (currentSection === 'catalog' && track.for_sale && track.price_cup > 0) {
        const priceText = formatPriceInCurrency(track.price_cup, selectedCurrency);
        const multipleLicenses = (track.licenses || []).length > 1;
        const label = multipleLicenses ? `Desde ${priceText}` : priceText;
        const tieneDescuento = discountPercent > 0 && track.original_cup && track.original_cup > track.price_cup;
        const originalText = tieneDescuento ? formatPriceInCurrency(track.original_cup, selectedCurrency) : '';
        priceChip = `
          <div class="track-price-chip">
            <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12L8.1 13h7.45c.75 0 1.41-.41 1.75-1.03L20.9 4H4.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
            ${tieneDescuento ? `<span class="price-strike">${escapeHtml(originalText)}</span>` : ''}
            <span title="${escapeHtml(label)}">${escapeHtml(label)}</span>
          </div>
        `;
      } else if (currentSection === 'vip' && track.price_cup > 0) {
        const priceText = formatPriceInCurrency(track.price_cup, selectedCurrency);
        priceChip = `
          <div class="track-price-chip track-price-chip-sold">
            <span title="Vendida en ${escapeHtml(priceText)}">Vendida · ${escapeHtml(priceText)}</span>
          </div>
        `;
      }

      let playlistStats = '';
      if (currentSection === 'playlist') {
        const liked = isTrackLiked(track.id);
        playlistStats = `
          <div class="track-stats">
            <button type="button" class="track-like-btn${liked ? ' liked' : ''}" data-track-id="${track.id}" aria-label="Me gusta">
              <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              <span class="track-like-count">${track.likes || 0}</span>
            </button>
            <span class="track-plays-count">
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              ${track.plays || 0}
            </span>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="track-cover-wrap">
          ${coverHtml}
          ${exclusiveBadge}
          ${genreBadge}
          ${producerBadge}
          <div class="play-overlay">
            <div class="play-btn-circle">
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        </div>
        <div class="track-info-row">
          <div class="track-title">${escapeHtml(track.title)}</div>
          ${priceChip}
        </div>
        ${playlistStats}
      `;
      card.addEventListener('click', () => playTrack(track));

      const likeBtn = card.querySelector('.track-like-btn');
      if (likeBtn) {
        likeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleLike(track.id, likeBtn);
        });
      }

      grid.appendChild(card);
    });
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
    localStorage.setItem('zonabeats_liked', JSON.stringify(next));
  }

  async function toggleLike(trackId, btn) {
    const alreadyLiked = isTrackLiked(trackId);
    const endpoint = alreadyLiked ? 'unlike' : 'like';

    btn.disabled = true;
    try {
      const res = await fetch(`/api/tracks/${trackId}/${endpoint}`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const { likes } = await res.json();

      setTrackLiked(trackId, !alreadyLiked);
      btn.classList.toggle('liked', !alreadyLiked);
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
    document.querySelectorAll('.track-card').forEach((card) => {
      card.classList.toggle('playing', Number(card.dataset.id) === Number(trackId));
    });
  }

  async function playTrack(track) {
    try {
      const res = await fetch(`/api/tracks/${track.id}/token`, { method: 'POST' });
      if (!res.ok) throw new Error('No se pudo obtener acceso a la pista');
      const { token } = await res.json();

      currentTrackId = track.id;
      audioEl.src = `/api/stream/${track.id}?t=${token}`;
      audioEl.play().catch(() => {});

      playerTitle.textContent = track.title;
      playerCover.src = track.cover_filename ? `/api/cover/${track.id}` : '';
      playerBar.classList.add('active');
      markPlayingCard(track.id);

      const canBuy = currentSection === 'catalog' && track.for_sale && track.price_cup > 0;

      if (currentSection === 'playlist') {
        buyBtn.style.display = 'none';
        buyBtn.onclick = null;
        downloadBtn.style.display = 'inline-flex';
        downloadBtn.onclick = () => { window.location.href = `/api/download/${track.id}`; };
      } else if (canBuy) {
        const priceText = formatPriceInCurrency(track.price_cup, selectedCurrency);
        const multipleLicenses = (track.licenses || []).length > 1;
        buyPriceLabel.textContent = multipleLicenses ? `Desde ${priceText}` : priceText;
        buyPriceLabel.title = buyPriceLabel.textContent;
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
    } catch (err) {
      console.error(err);
      alert('No se pudo reproducir esta pista. Intenta de nuevo.');
    }
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
    progressFill.style.width = `${pct}%`;
    timeCurrent.textContent = formatTime(audioEl.currentTime);
    timeTotal.textContent = formatTime(audioEl.duration);
  });

  audioEl.addEventListener('ended', () => {
    markPlayingCard(null);
    const list = tracksBySection[currentSection] || [];
    const idx = list.findIndex(t => t.id === currentTrackId);
    if (idx !== -1 && idx < list.length - 1) {
      playTrack(list[idx + 1]);
    }
  });

  progressTrack.addEventListener('click', (e) => {
    if (!audioEl.duration) return;
    const rect = progressTrack.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioEl.currentTime = pct * audioEl.duration;
  });

  // Si el token venció se pide otro UNA vez; si el archivo está dañado no se reintenta en bucle.
  let ultimoReintento = { id: null, at: 0 };
  audioEl.addEventListener('error', async () => {
    if (currentTrackId == null) return;
    const list = tracksBySection[currentSection] || [];
    const track = list.find(t => t.id === currentTrackId);
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

  let receiptFile = null;

  const LICENSE_INFO = {
    basic: {
      label: 'Básica',
      description: 'Nivel 1. Puedes crear y distribuir tu canción, pero NO monetizarla en ningún medio. No exclusiva: el beat sigue a la venta.',
    },
    premium: {
      label: 'Premium',
      description: 'Nivel 2. Mismos derechos que la Básica con mejor calidad de archivo. Tampoco permite monetizar. No exclusiva.',
    },
    unlimited: {
      label: 'Ilimitada',
      description: 'Nivel 3. Permite distribuir y MONETIZAR sin límite. Incluye WAV y STEMS si el productor los subió. Compra única: el beat se retira del catálogo. No es exclusiva ni va a Beats VIP.',
    },
    exclusive: {
      label: 'Exclusiva',
      description: 'Nivel 4. Todos los derechos comerciales y exclusividad. Incluye WAV y STEMS si el productor los subió. El beat se retira para siempre y aparece en Beats VIP a tu nombre.',
    },
  };
  const LICENSE_ORDER = ['basic', 'premium', 'unlimited', 'exclusive'];

  let selectedLicenseType = null;

  function openBuyModal(track) {
    activeModalTrack = track;
    modalTrackTitle.textContent = track.title;
    selectedLicenseType = null;

    const licenseList = document.getElementById('modal-license-list');
    const licenses = (track.licenses || []).slice().sort((a, b) => LICENSE_ORDER.indexOf(a.license_type) - LICENSE_ORDER.indexOf(b.license_type));

    if (!licenses.length) {
      licenseList.innerHTML = '<div class="modal-no-accounts">Esta pista no tiene ninguna licencia disponible en este momento.</div>';
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
    orderSubmitBtn.classList.add('disabled');

    modalOverlay.classList.add('active');
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
    document.getElementById('modal-instructions').style.display = 'block';

    const accountsForCurrency = paymentInfo.accounts.filter(a => a.currency === selectedCurrency);

    modalAccounts.innerHTML = '';
    if (!accountsForCurrency.length) {
      modalAccounts.innerHTML = `<div class="modal-no-accounts">No hay una cuenta configurada para ${escapeHtml(selectedCurrency)} todavía. Elige otra moneda arriba en "Ver precios en".</div>`;
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
    if (accountsForCurrency.length && paymentInfo.contactPhone) {
      document.getElementById('modal-confirm-phone-number').textContent = paymentInfo.contactPhone;
      confirmPhoneBlock.style.display = 'flex';
    } else {
      confirmPhoneBlock.style.display = 'none';
    }

    orderForm.style.display = accountsForCurrency.length ? 'block' : 'none';
    updateSubmitButtonState();
  }

  function updateSubmitButtonState() {
    const ready = selectedLicenseType && buyerNameInput.value.trim() && buyerPhoneInput.value.trim() && receiptFile && termsAcceptInput.checked;
    orderSubmitBtn.disabled = !ready;
    orderSubmitBtn.classList.toggle('disabled', !ready);
    if (!termsAcceptInput.checked && selectedLicenseType && buyerNameInput.value.trim() && buyerPhoneInput.value.trim() && receiptFile) {
      orderSubmitBtn.textContent = 'Acepta los términos para continuar';
    } else {
      orderSubmitBtn.textContent = ready
        ? 'Enviar comprobante'
        : 'Completa tus datos y el comprobante';
    }
  }

  buyerNameInput.addEventListener('input', updateSubmitButtonState);
  buyerPhoneInput.addEventListener('input', updateSubmitButtonState);
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

  receiptInput.addEventListener('change', () => {
    const file = receiptInput.files[0];
    if (!file) return;

    receiptFile = file;
    receiptDrop.classList.add('has-receipt');
    receiptDropText.style.display = 'none';

    const reader = new FileReader();
    reader.onload = (e) => {
      receiptPreview.src = e.target.result;
      receiptPreview.style.display = 'block';
    };
    reader.readAsDataURL(file);

    updateSubmitButtonState();
  });

  orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!receiptFile || !activeModalTrack || !termsAcceptInput.checked || !selectedLicenseType) return;

    const buyerName = buyerNameInput.value.trim();
    const buyerPhone = buyerPhoneInput.value.trim();
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
      formData.append('currency', selectedCurrency);
      formData.append('displayedPrice', displayedPrice);
      formData.append('licenseType', selectedLicenseType);
      formData.append('receipt', receiptFile);

      const res = await fetch('/api/orders', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo enviar el comprobante');
      }

      const orderData = await res.json().catch(() => ({}));
      if (orderData.orderToken) {
        guardarCompra({ token: orderData.orderToken, title: activeModalTrack.title, license: licenseLabel, createdAt: new Date().toISOString() });
      }

      orderForm.style.display = 'none';
      modalSuccess.style.display = 'block';

      if (paymentInfo.contactPhone) {
        const message = encodeURIComponent(
          `Hola, soy ${buyerName} 👋 Acabo de comprar "${activeModalTrack.title}" (Licencia ${licenseLabel})` +
          ` (${displayedPrice}). ` +
          `Ya te envié el comprobante de mi transferencia a través de la plataforma. ¡Gracias!`
        );
        const phoneDigits = paymentInfo.contactPhone.replace(/[^0-9]/g, '');
        modalWhatsappBtn.href = `https://wa.me/${phoneDigits}?text=${message}`;
      } else {
        modalWhatsappBtn.style.display = 'none';
      }
    } catch (err) {
      alert(err.message);
      orderSubmitBtn.disabled = false;
      updateSubmitButtonState();
    }
  });

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
        if (d.status === 'approved' && !c.downloaded && d.downloadUrl) {
          c.downloaded = true; cambio = true;
          descargarAhora(d.downloadUrl);
          if (antes === 'pending') abrirCompras();
        }
      } catch { hayPendientes = true; }
    }
    if (cambio) escribirCompras(lista);
    actualizarBotonCompras();
    if (purchasesOverlay.classList.contains('active')) pintarCompras();
    clearTimeout(comprasTimer);
    if (hayPendientes) comprasTimer = setTimeout(revisarCompras, 30000);
  }

  function pintarCompras() {
    const lista = compras();
    if (!lista.length) {
      purchasesList.innerHTML = '<p class="purchases-hint">Todavía no has comprado nada desde este dispositivo.</p>';
      return;
    }
    purchasesList.innerHTML = lista.map((c) => {
      const d = comprasEstado[c.token] || {};
      const fecha = new Date(c.createdAt || d.createdAt || Date.now()).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
      let estado = '<span class="purchase-status pending">Comprobando…</span>';
      let acciones = '';
      if (d.status === 'pending') estado = '<span class="purchase-status pending">Esperando que el vendedor apruebe tu pago</span>';
      if (d.status === 'missing') estado = '<span class="purchase-status missing">No encontramos esta compra. Escríbele al vendedor por WhatsApp.</span>';
      if (d.status === 'approved') {
        estado = '<span class="purchase-status approved">Aprobada · Licencia ' + escapeHtml(d.certificateId || '') + '</span>';
        acciones = '<div class="purchase-actions">' +
          (d.downloadUrl ? '<a class="purchase-dl" href="' + d.downloadUrl + '" download>' + (d.fileKind === 'zip' ? 'Descargar WAV + STEMS (.zip)' : 'Descargar beat') + '</a>'
                         : '<span class="purchase-meta">El vendedor te enviará el archivo por WhatsApp.</span>') +
          (d.pdfUrl ? '<a class="purchase-pdf" href="' + d.pdfUrl + '" target="_blank" rel="noopener">Licencia en PDF</a>' : '') +
          '</div>';
      }
      return '<div class="purchase-card' + (d.status === 'approved' ? ' is-approved' : '') + '">' +
        '<div class="purchase-title">' + escapeHtml(c.title || d.trackTitle || 'Beat') + '</div>' +
        '<div class="purchase-meta">Licencia ' + escapeHtml(c.license || d.licenseLabel || '') + ' · ' + fecha + '</div>' +
        estado + acciones +
        '<button type="button" class="purchase-forget" data-token="' + c.token + '">Quitar de este dispositivo</button>' +
        '</div>';
    }).join('');
    purchasesList.querySelectorAll('.purchase-forget').forEach((b) => b.addEventListener('click', () => {
      if (!confirm('¿Quitar esta compra de este dispositivo? Si no guardaste el link que te mandó el vendedor, no podrás volver a verla aquí.')) return;
      escribirCompras(compras().filter(x => x.token !== b.dataset.token));
      pintarCompras(); actualizarBotonCompras();
    }));
  }

  function abrirCompras() {
    modalOverlay.classList.remove('active');
    pintarCompras();
    purchasesOverlay.classList.add('active');
  }
  purchasesBtn.addEventListener('click', () => { abrirCompras(); revisarCompras(); });
  document.getElementById('modal-see-purchases-btn').addEventListener('click', abrirCompras);
  document.getElementById('purchases-close-btn').addEventListener('click', () => purchasesOverlay.classList.remove('active'));
  purchasesOverlay.addEventListener('click', (e) => { if (e.target === purchasesOverlay) purchasesOverlay.classList.remove('active'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarCompras(); });

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

  async function init() {
    await loadExchangeRates();
    loadProfile();
    loadSiteConfig();
    loadPaymentInfo();
    loadSocialLinks();
    actualizarBotonCompras();
    revisarCompras();
    await loadTracksForSection('catalog');
  }

  init();
})();
