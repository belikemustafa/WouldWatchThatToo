/* ==========================================================================
   WOULD WATCH THAT — Main Application Controller
   Hero Carousel, 9-Box Filter Studio, Detail & Trailer Modals, Auth & Watchlist
   ========================================================================== */

(() => {
  const CFG = window.WWT_CONFIG;
  const API = window.WWT_API;

  /* ---------- Application State ---------- */
  const state = {
    view: 'home',
    heroItems: [],
    heroIndex: 0,
    heroTimer: null,
    discoverPage: 1,
    discoverTotalPages: 1,
    discoverMode: 'filter', // 'filter' | 'search' | 'ai'
    lastQuery: '',
    watchlistFilter: 'all',
    activeUser: localStorage.getItem(CFG.STORAGE_KEYS.ACTIVE_USER) || null,
    authMode: 'login',
    filters: createDefaultFilters()
  };

  function createDefaultFilters() {
    return {
      format: 'movie',
      genres: [],
      minImdb: 0,
      minLetterboxd: 0,
      language: '',
      cast: [],
      directors: [],
      studios: [],
      era: 'all',
      yearFrom: '',
      yearTo: '',
      awards: 'all',
      maxRuntime: 240,
      providers: [],
      sort: 'popularity.desc'
    };
  }

  /* ---------- DOM References ---------- */
  const $ = (id) => document.getElementById(id);

  /* ---------- Initialization ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    applySavedAppearance();
    renderSettingsControls();
    renderFilterControls();
    bindGlobalEvents();
    updateAuthUI();
    updateWatchlistBadge();

    if (!API.hasTmdbKey()) {
      $('apiSetupBanner').classList.remove('hidden');
      $('heroTrack').innerHTML = `
        <div class="hero-skeleton">
          <div style="text-align:center; padding: 2rem;">
            <p class="eyebrow">WELCOME TO WOULD WATCH THAT</p>
            <h2 style="font-family: var(--font-display); margin: 0.4rem 0 0.8rem;">Add Your TMDB API Key to Launch the Archive</h2>
            <button class="btn-accent" id="heroSetupKeyBtn">Open Studio Settings</button>
          </div>
        </div>`;
      $('heroSetupKeyBtn')?.addEventListener('click', openSettings);
    } else {
      loadHomeContent();
    }
  });

  /* ---------- Appearance & Settings ---------- */
  function applySavedAppearance() {
    const theme = localStorage.getItem(CFG.STORAGE_KEYS.THEME) || 'abyssal-carbon';
    const accent = localStorage.getItem(CFG.STORAGE_KEYS.ACCENT) || 'royal-gold';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-accent', accent);
  }

  function renderSettingsControls() {
    const curTheme = document.documentElement.getAttribute('data-theme');
    const curAccent = document.documentElement.getAttribute('data-accent');

    $('themeSelectorGrid').innerHTML = CFG.THEMES.map(
      (t) => `
      <button type="button" class="swatch-btn ${t.id === curTheme ? 'active' : ''}" data-set-theme="${t.id}">
        <span class="swatch-dot" style="background:${t.swatch}"></span>
        <span>${t.name}</span>
      </button>`
    ).join('');

    $('accentSelectorGrid').innerHTML = CFG.ACCENTS.map(
      (a) => `
      <button type="button" class="swatch-btn ${a.id === curAccent ? 'active' : ''}" data-set-accent="${a.id}">
        <span class="swatch-dot" style="background:${a.swatch}"></span>
        <span>${a.name}</span>
      </button>`
    ).join('');

    $('tmdbKeyInput').value = localStorage.getItem(CFG.STORAGE_KEYS.TMDB_KEY) || '';
    $('geminiKeyInput').value = localStorage.getItem(CFG.STORAGE_KEYS.GEMINI_KEY) || '';
  }

  function openSettings() {
    renderSettingsControls();
    $('settingsDrawer').classList.remove('hidden');
  }

  function closeSettings() {
    $('settingsDrawer').classList.add('hidden');
  }

  /* ---------- Navigation ---------- */
  function switchView(viewName) {
    state.view = viewName;
    document.querySelectorAll('.view-section').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === viewName);
    });
    $(`${viewName}View`).classList.add('active');

    if (viewName === 'discover' && !$('discoverGrid').children.length && API.hasTmdbKey()) {
      runDiscover(1, false);
    }
    if (viewName === 'watchlist') {
      renderWatchlistView();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Home: Hero Carousel & Collections ---------- */
  async function loadHomeContent() {
    try {
      const heroItems = await API.fetchHeroSpotlight();
      state.heroItems = heroItems;
      state.heroIndex = 0;
      renderHeroSlide();
      startHeroAutoRotate();
    } catch {
      $('heroTrack').innerHTML = `<div class="hero-skeleton">Unable to load spotlight. Check your TMDB API key in Settings.</div>`;
    }

    const container = $('collectionsContainer');
    container.innerHTML = CFG.COLLECTIONS.map(
      (col) => `
      <div class="collection-block" id="col-${col.id}">
        <div class="collection-head">
          <div>
            <p class="eyebrow">${col.eyebrow}</p>
            <h2 class="collection-title">${col.title}</h2>
          </div>
        </div>
        <div class="collection-row" id="col-row-${col.id}">
          <div class="empty-state" style="min-width:260px;">Loading collection...</div>
        </div>
      </div>`
    ).join('');

    for (const col of CFG.COLLECTIONS) {
      API.fetchCollection(col)
        .then((items) => {
          const row = $(`col-row-${col.id}`);
          row.innerHTML = items.map((item) => createCardHTML(item)).join('');
        })
        .catch(() => {
          const row = $(`col-row-${col.id}`);
          if (row) row.innerHTML = `<div class="empty-state">Could not load ${col.title}.</div>`;
        });
    }
  }

  function renderHeroSlide() {
    if (!state.heroItems.length) return;
    const item = state.heroItems[state.heroIndex];
    const saved = isInWatchlist(item.media_type, item.id);

    $('heroTrack').innerHTML = `
      <div class="hero-slide" style="background-image: url('${item.backdropUrl}')">
        <div class="hero-content">
          <div class="hero-badges">
            <span class="award-badge">${item.media_type === 'tv' ? 'SERIES' : 'FEATURE FILM'} · ${item.displayYear}</span>
            ${item.imdbScore ? `<span class="rating-pill rating-imdb">IMDb ${item.imdbScore}</span>` : ''}
            ${item.letterboxdScore ? `<span class="rating-pill rating-lb">LB ${item.letterboxdScore}★</span>` : ''}
            ${item.awardBadge ? `<span class="award-badge">🏆 ${item.awardBadge}</span>` : ''}
          </div>
          <h1 class="hero-title">${escapeHtml(item.displayTitle)}</h1>
          <p class="hero-overview">${escapeHtml(item.overview || 'Explore cast, verified ratings, and trailers.')}</p>
          <div class="hero-cta-row">
            <button class="btn-accent" data-action="hero-trailer" data-type="${item.media_type}" data-id="${item.id}">▶ Watch Trailer</button>
            <button class="btn-outline" data-action="open-detail" data-type="${item.media_type}" data-id="${item.id}">View Details</button>
            <button class="btn-outline" data-action="toggle-watchlist" data-type="${item.media_type}" data-id="${item.id}">
              ${saved ? '✓ In Watchlist' : '+ Watchlist'}
            </button>
          </div>
        </div>
      </div>`;

    $('heroDots').innerHTML = state.heroItems
      .map(
        (_, i) =>
          `<button class="hero-dot ${i === state.heroIndex ? 'active' : ''}" data-hero-dot="${i}" aria-label="Slide ${i + 1}"></button>`
      )
      .join('');
  }

  function startHeroAutoRotate() {
    clearInterval(state.heroTimer);
    state.heroTimer = setInterval(() => {
      if (state.view !== 'home' || !state.heroItems.length) return;
      state.heroIndex = (state.heroIndex + 1) % state.heroItems.length;
      renderHeroSlide();
    }, 7500);
  }

  /* ---------- 9-Box Filter Studio Controls ---------- */
  function renderFilterControls() {
    // 2. Genres
    $('genrePills').innerHTML = CFG.GENRES.map(
      (g) => `<button type="button" class="chip" data-genre="${g.id}">${g.name}</button>`
    ).join('');

    // 3. Languages
    $('languageSelect').innerHTML = CFG.LANGUAGES.map(
      (l) => `<option value="${l.code}">${l.name}</option>`
    ).join('');

    // 6. Studios
    $('studioPresets').innerHTML = CFG.STUDIO_PRESETS.map(
      (s) => `<button type="button" class="chip" data-studio-preset="${s.id}" data-network="${Boolean(s.isNetwork)}">${s.name}</button>`
    ).join('');

    // 7. Eras
    $('eraPresets').innerHTML = CFG.ERAS.map(
      (e) => `<button type="button" class="chip ${e.id === 'all' ? 'active' : ''}" data-era="${e.id}">${e.label}</button>`
    ).join('');

    // 8. Awards
    $('awardsPills').innerHTML = CFG.AWARDS_PRESETS.map(
      (a) => `<button type="button" class="chip ${a.id === 'all' ? 'active' : ''}" data-award="${a.id}">${a.label}</button>`
    ).join('');

    // 9. Streaming
    $('streamingPills').innerHTML = CFG.STREAMING_PROVIDERS.map(
      (p) => `<button type="button" class="chip" data-provider="${p.id}">${p.name}</button>`
    ).join('');

    syncFilterBadges();
  }

  function syncFilterBadges() {
    const f = state.filters;
    $('badge-format').textContent = f.format.toUpperCase();
    $('badge-genre').textContent = f.genres.length ? `${f.genres.length} selected` : 'Any';

    const ratingParts = [];
    if (f.minImdb > 0) ratingParts.push(`IMDb ${f.minImdb}+`);
    if (f.minLetterboxd > 0) ratingParts.push(`LB ${f.minLetterboxd}+`);
    if (f.language) ratingParts.push(f.language.toUpperCase());
    $('badge-rating').textContent = ratingParts.length ? ratingParts.join(' · ') : 'Any';

    $('badge-cast').textContent = f.cast.length ? `${f.cast.length} selected` : 'Any';
    $('badge-director').textContent = f.directors.length ? `${f.directors.length} selected` : 'Any';
    $('badge-studio').textContent = f.studios.length ? `${f.studios.length} selected` : 'Any';
    $('badge-era').textContent = f.yearFrom || f.yearTo ? `${f.yearFrom || '…'}–${f.yearTo || '…'}` : 'All Eras';
    $('badge-awards').textContent = CFG.AWARDS_PRESETS.find((a) => a.id === f.awards)?.label || 'All';

    const rtParts = [];
    if (f.maxRuntime < 240) rtParts.push(`≤${f.maxRuntime}m`);
    if (f.providers.length) rtParts.push(`${f.providers.length} stream`);
    $('badge-runtime').textContent = rtParts.length ? rtParts.join(' · ') : 'Any';
  }

  function renderSelectedTags(containerId, items, onRemoveType) {
    $(containerId).innerHTML = items
      .map(
        (item) => `
      <span class="tag-removable">
        ${escapeHtml(item.name)}
        <button type="button" data-remove-tag="${onRemoveType}" data-tag-id="${item.id}" aria-label="Remove">&times;</button>
      </span>`
      )
      .join('');
  }

  /* ---------- Discovery & Search Execution ---------- */
  async function runDiscover(page = 1, append = false) {
    if (!API.hasTmdbKey()) {
      openSettings();
      return;
    }

    state.discoverMode = 'filter';
    state.discoverPage = page;
    const grid = $('discoverGrid');
    if (!append) {
      grid.innerHTML = `<div class="empty-state">Curating titles from the archive...</div>`;
    }

    try {
      const data = await API.discoverWithFilters(state.filters, page);
      state.discoverTotalPages = data.total_pages;
      $('resultsMeta').textContent = `Showing ${append ? grid.children.length + data.results.length : data.results.length} of ${data.total_results.toLocaleString()} matches`;

      if (!data.results.length && !append) {
        grid.innerHTML = `<div class="empty-state">No titles match that exact combination. Try relaxing one of the 9 filter boxes.</div>`;
      } else {
        const html = data.results.map((item) => createCardHTML(item)).join('');
        if (append) grid.insertAdjacentHTML('beforeend', html);
        else grid.innerHTML = html;
      }

      $('paginationBar').classList.toggle('hidden', page >= state.discoverTotalPages);
    } catch (err) {
      grid.innerHTML = `<div class="empty-state">Error loading catalog (${escapeHtml(err.message)}). Verify your TMDB key in Settings.</div>`;
    }
  }

  async function runConciergeSearch(query, useAI = false) {
    const clean = query.trim();
    if (!clean) return;
    if (!API.hasTmdbKey()) {
      openSettings();
      return;
    }

    switchView('discover');
    state.lastQuery = clean;
    const grid = $('discoverGrid');
    $('paginationBar').classList.add('hidden');

    if (useAI) {
      if (!API.getGeminiKey()) {
        showToast('Add a Gemini API Key in Studio Settings for AI Search. Falling back to TMDB search.');
        useAI = false;
      }
    }

    grid.innerHTML = `<div class="empty-state">${useAI ? '✦ Consulting Gemini Search Grounding for verified cinema picks...' : `Searching archive for "${escapeHtml(clean)}"...`}</div>`;

    try {
      let results = [];
      if (useAI) {
        state.discoverMode = 'ai';
        results = (await API.aiNaturalLanguageDiscover(clean)) || [];
        $('resultsMeta').textContent = `✦ AI Grounded Discovery for “${clean}” — ${results.length} verified picks`;
      }

      if (!useAI || !results.length) {
        state.discoverMode = 'search';
        const data = await API.searchMulti(clean, 1);
        results = data.results;
        $('resultsMeta').textContent = `Search results for “${clean}” — ${results.length} titles found`;
      }

      grid.innerHTML = results.length
        ? results.map((item) => createCardHTML(item)).join('')
        : `<div class="empty-state">No matching titles found for “${escapeHtml(clean)}”.</div>`;
    } catch (err) {
      grid.innerHTML = `<div class="empty-state">Search failed: ${escapeHtml(err.message)}</div>`;
    }
  }

  /* ---------- Media Card Renderer ---------- */
  function createCardHTML(item) {
    const saved = isInWatchlist(item.media_type, item.id);
    const metaData = encodeURIComponent(
      JSON.stringify({
        id: item.id,
        media_type: item.media_type,
        displayTitle: item.displayTitle,
        displayYear: item.displayYear,
        posterUrl: item.posterUrl,
        imdbScore: item.imdbScore,
        letterboxdScore: item.letterboxdScore,
        awardBadge: item.awardBadge
      })
    );

    return `
      <article class="media-card" data-action="open-detail" data-type="${item.media_type}" data-id="${item.id}">
        <div class="poster-wrap">
          ${
            item.posterUrl
              ? `<img src="${item.posterUrl}" alt="${escapeHtml(item.displayTitle)}" loading="lazy" />`
              : `<div class="poster-placeholder">${escapeHtml(item.displayTitle)}</div>`
          }
          ${item.awardBadge ? `<span class="card-award-ribbon">🏆 PRESTIGE</span>` : ''}
          <button
            type="button"
            class="card-wl-btn ${saved ? 'saved' : ''}"
            data-action="card-watchlist"
            data-payload="${metaData}"
            title="${saved ? 'Remove from Watchlist' : 'Add to Watchlist'}"
            aria-label="Toggle Watchlist"
          >${saved ? '✓' : '+'}</button>
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(item.displayTitle)}</h3>
          <div class="card-sub">${item.displayYear} · ${item.media_type === 'tv' ? 'Series' : 'Film'}</div>
          ${item.aiReason ? `<div class="card-sub" style="color:var(--accent);">${escapeHtml(item.aiReason)}</div>` : ''}
          <div class="ratings-strip">
            ${item.imdbScore ? `<span class="rating-pill rating-imdb">IMDb ${item.imdbScore}</span>` : ''}
            ${item.letterboxdScore ? `<span class="rating-pill rating-lb">LB ${item.letterboxdScore}★</span>` : ''}
          </div>
        </div>
      </article>`;
  }

  /* ---------- Title Detail Modal & Verified Awards ---------- */
  async function openDetailModal(mediaType, id) {
    const modal = $('detailModal');
    const body = $('detailModalBody');
    modal.classList.remove('hidden');
    body.innerHTML = `<div class="empty-state" style="border:none;">Loading dossier...</div>`;

    try {
      const d = await API.fetchDetails(mediaType, id);
      const saved = isInWatchlist(mediaType, d.id);
      const directors =
        mediaType === 'tv'
          ? (d.created_by || []).map((p) => p.name).join(', ')
          : (d.credits?.crew || [])
              .filter((c) => c.job === 'Director')
              .map((c) => c.name)
              .slice(0, 3)
              .join(', ');
      const topCast = (d.credits?.cast || [])
        .slice(0, 5)
        .map((c) => c.name)
        .join(', ');
      const runtime =
        mediaType === 'tv'
          ? `${d.number_of_seasons || 1} Season${d.number_of_seasons > 1 ? 's' : ''}`
          : d.runtime
          ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m`
          : '—';
      const genres = (d.genres || []).map((g) => g.name).join(' · ');
      const videos = API.extractYouTubeVideos(d);

      body.innerHTML = `
        <div class="detail-banner" style="background-image:url('${d.backdropUrl || d.posterUrl}')"></div>
        <div class="detail-content">
          <img class="detail-poster" src="${d.posterUrl}" alt="${escapeHtml(d.displayTitle)}" />
          <div>
            <p class="eyebrow">${mediaType === 'tv' ? 'TELEVISION SERIES' : 'FEATURE FILM'} · ${d.displayYear} · ${runtime}</p>
            <h2 class="detail-title" id="detailTitle">${escapeHtml(d.displayTitle)}</h2>
            <div class="detail-meta-line">${escapeHtml(genres || 'Cinema')}</div>

            <div class="detail-badges-row" id="detailVerifiedBadges">
              ${d.imdbScore ? `<span class="rating-pill rating-imdb" id="detailImdbPill">IMDb ${d.imdbScore}/10</span>` : ''}
              ${d.letterboxdScore ? `<span class="rating-pill rating-lb" id="detailLbPill">Letterboxd ${d.letterboxdScore}/5</span>` : ''}
              ${d.awardBadge ? `<span class="award-badge" id="detailAwardBadge">🏆 ${escapeHtml(d.awardBadge)}</span>` : '<span class="award-badge hidden" id="detailAwardBadge"></span>'}
            </div>

            <p class="detail-overview">${escapeHtml(d.overview || 'No synopsis available.')}</p>

            <div class="detail-credits">
              <div><strong>${mediaType === 'tv' ? 'Creators' : 'Director'}</strong>${escapeHtml(directors || '—')}</div>
              <div><strong>Starring</strong>${escapeHtml(topCast || '—')}</div>
            </div>

            <div class="detail-actions">
              ${
                videos.length
                  ? `<button class="btn-accent" id="detailPlayTrailerBtn">▶ Play Trailer</button>`
                  : `<a class="btn-outline" target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/results?search_query=${encodeURIComponent(d.displayTitle + ' ' + d.displayYear + ' official trailer')}">Find Trailer on YouTube ↗</a>`
              }
              <button class="btn-outline" id="detailWatchlistBtn">${saved ? '✓ In Watchlist' : '+ Add to Watchlist'}</button>
              ${
                d.external_ids?.imdb_id
                  ? `<a class="btn-ghost" target="_blank" rel="noopener noreferrer" href="https://www.imdb.com/title/${d.external_ids.imdb_id}/">IMDb ↗</a>`
                  : ''
              }
              <a class="btn-ghost" target="_blank" rel="noopener noreferrer" href="https://letterboxd.com/search/${encodeURIComponent(d.displayTitle)}/">Letterboxd ↗</a>
            </div>
          </div>
        </div>`;

      $('detailPlayTrailerBtn')?.addEventListener('click', () => openTrailerTheater(d.displayTitle, videos));
      $('detailWatchlistBtn')?.addEventListener('click', () => {
        const nowSaved = toggleWatchlistItem(d);
        $('detailWatchlistBtn').textContent = nowSaved ? '✓ In Watchlist' : '+ Add to Watchlist';
      });

      // Upgrade ratings & awards via Gemini Search Grounding when key is present
      if (API.getGeminiKey()) {
        API.verifyTitlePrestige(d.displayTitle, d.displayYear, mediaType).then((verified) => {
          if (!verified) return;
          if (verified.imdb && $('detailImdbPill')) {
            $('detailImdbPill').textContent = `IMDb ${verified.imdb}/10 ✓`;
          }
          if (verified.letterboxd && $('detailLbPill')) {
            $('detailLbPill').textContent = `Letterboxd ${verified.letterboxd}/5 ✓`;
          }
          if (verified.awardsSummary && $('detailAwardBadge')) {
            $('detailAwardBadge').textContent = `🏆 ${verified.awardsSummary}`;
            $('detailAwardBadge').classList.remove('hidden');
          }
        });
      }
    } catch (err) {
      body.innerHTML = `<div class="empty-state">Unable to load details (${escapeHtml(err.message)}).</div>`;
    }
  }

  /* ---------- Error-153-Free Trailer Theater ---------- */
  function openTrailerTheater(title, videos) {
    if (!videos.length) {
      showToast('No official trailer available for this title.');
      return;
    }
    const modal = $('trailerModal');
    const select = $('trailerVariantSelect');
    $('trailerTitleText').textContent = `${title} — Screening Room`;

    if (videos.length > 1) {
      select.classList.remove('hidden');
      select.innerHTML = videos
        .slice(0, 6)
        .map((v, idx) => `<option value="${v.key}">${escapeHtml(v.name || `Trailer ${idx + 1}`)}</option>`)
        .join('');
    } else {
      select.classList.add('hidden');
    }

    const mountVideo = (key) => {
      const stage = $('trailerStage');
      stage.innerHTML = '';
      stage.appendChild(API.buildSafeTrailerIframe(key, title));
      $('trailerExternalLink').href = `https://www.youtube.com/watch?v=${encodeURIComponent(key)}`;
    };

    select.onchange = () => mountVideo(select.value);
    mountVideo(videos[0].key);
    modal.classList.remove('hidden');
  }

  function closeTrailerTheater() {
    $('trailerStage').innerHTML = '';
    $('trailerModal').classList.add('hidden');
  }

  /* ---------- Watchlist Storage & View ---------- */
  function getWatchlistKey() {
    return CFG.STORAGE_KEYS.WATCHLIST_PREFIX + (state.activeUser || 'guest');
  }

  function getWatchlist() {
    try {
      return JSON.parse(localStorage.getItem(getWatchlistKey()) || '[]');
    } catch {
      return [];
    }
  }

  function saveWatchlist(list) {
    localStorage.setItem(getWatchlistKey(), JSON.stringify(list));
    updateWatchlistBadge();
  }

  function isInWatchlist(mediaType, id) {
    return getWatchlist().some((x) => x.media_type === mediaType && Number(x.id) === Number(id));
  }

  function toggleWatchlistItem(item) {
    const list = getWatchlist();
    const idx = list.findIndex((x) => x.media_type === item.media_type && Number(x.id) === Number(item.id));
    if (idx >= 0) {
      list.splice(idx, 1);
      saveWatchlist(list);
      showToast(`Removed “${item.displayTitle}” from Watchlist`);
      if (state.view === 'watchlist') renderWatchlistView();
      return false;
    }
    list.unshift({
      id: item.id,
      media_type: item.media_type,
      displayTitle: item.displayTitle,
      displayYear: item.displayYear,
      posterUrl: item.posterUrl,
      imdbScore: item.imdbScore,
      letterboxdScore: item.letterboxdScore,
      awardBadge: item.awardBadge || '',
      watched: false,
      addedAt: Date.now()
    });
    saveWatchlist(list);
    showToast(`Saved “${item.displayTitle}” to Watchlist`);
    return true;
  }

  function updateWatchlistBadge() {
    $('watchlistCountBadge').textContent = getWatchlist().length;
  }

  function renderWatchlistView() {
    const list = getWatchlist();
    $('watchlistHeading').textContent = state.activeUser
      ? `${state.activeUser}’s Watchlist`
      : 'Guest Watchlist';

    const filtered = list.filter((i) => {
      if (state.watchlistFilter === 'watched') return i.watched;
      if (state.watchlistFilter === 'towatch') return !i.watched;
      return true;
    });

    const grid = $('watchlistGrid');
    if (!filtered.length) {
      grid.innerHTML = `<div class="empty-state">No titles in this list yet. Click <strong>+</strong> on any poster to curate your archive.</div>`;
      return;
    }

    grid.innerHTML = filtered
      .map(
        (item) => `
      <article class="media-card" data-action="open-detail" data-type="${item.media_type}" data-id="${item.id}">
        <div class="poster-wrap">
          ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${escapeHtml(item.displayTitle)}" />` : `<div class="poster-placeholder">${escapeHtml(item.displayTitle)}</div>`}
          <button type="button" class="card-wl-btn ${item.watched ? 'saved' : ''}" data-action="toggle-watched" data-type="${item.media_type}" data-id="${item.id}" title="Mark Watched">
            ${item.watched ? '👁' : '○'}
          </button>
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(item.displayTitle)}</h3>
          <div class="card-sub">${item.displayYear} · ${item.watched ? 'Watched' : 'To Watch'}</div>
          <div class="ratings-strip">
            ${item.imdbScore ? `<span class="rating-pill rating-imdb">IMDb ${item.imdbScore}</span>` : ''}
            ${item.letterboxdScore ? `<span class="rating-pill rating-lb">LB ${item.letterboxdScore}★</span>` : ''}
          </div>
        </div>
      </article>`
      )
      .join('');
  }

  /* ---------- Member Authentication (SHA-256) ---------- */
  async function sha256(text) {
    const buf = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function updateAuthUI() {
    const btn = $('authTriggerBtn');
    if (state.activeUser) {
      btn.textContent = `@${state.activeUser}`;
      $('signedInUserLabel').textContent = state.activeUser;
      $('signedInPanel').classList.remove('hidden');
      $('authForm').classList.add('hidden');
      $('authModalTitle').textContent = 'Member Profile';
    } else {
      btn.textContent = 'Sign In';
      $('signedInPanel').classList.add('hidden');
      $('authForm').classList.remove('hidden');
      $('authModalTitle').textContent = state.authMode === 'signup' ? 'Join Would Watch That' : 'Sign In to W·W·T';
    }
    updateWatchlistBadge();
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const username = $('authUsername').value.trim().toLowerCase();
    const password = $('authPassword').value;
    const errEl = $('authErrorText');
    errEl.classList.add('hidden');

    const users = JSON.parse(localStorage.getItem(CFG.STORAGE_KEYS.USERS) || '{}');
    const hashed = await sha256(`${username}::wwt_salt::${password}`);

    if (state.authMode === 'signup') {
      if (users[username]) {
        errEl.textContent = 'That username already exists. Try signing in.';
        errEl.classList.remove('hidden');
        return;
      }
      users[username] = { hash: hashed, createdAt: Date.now() };
      localStorage.setItem(CFG.STORAGE_KEYS.USERS, JSON.stringify(users));
      state.activeUser = username;
      localStorage.setItem(CFG.STORAGE_KEYS.ACTIVE_USER, username);
      showToast(`Welcome, @${username}!`);
    } else {
      if (!users[username] || users[username].hash !== hashed) {
        errEl.textContent = 'Invalid username or password.';
        errEl.classList.remove('hidden');
        return;
      }
      state.activeUser = username;
      localStorage.setItem(CFG.STORAGE_KEYS.ACTIVE_USER, username);
      showToast(`Signed in as @${username}`);
    }

    $('authForm').reset();
    $('authModal').classList.add('hidden');
    updateAuthUI();
    if (state.view === 'watchlist') renderWatchlistView();
  }

  /* ---------- Event Wiring ---------- */
  function bindGlobalEvents() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    $('brandHomeBtn').addEventListener('click', (e) => {
      e.preventDefault();
      switchView('home');
    });

    // Concierge Search
    $('conciergeSearchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      runConciergeSearch($('conciergeInput').value, false);
    });
    $('aiConciergeBtn').addEventListener('click', () => {
      runConciergeSearch($('conciergeInput').value, true);
    });
    $('conciergeInput').addEventListener('input', (e) => {
      $('clearSearchBtn').classList.toggle('hidden', !e.target.value);
    });
    $('clearSearchBtn').addEventListener('click', () => {
      $('conciergeInput').value = '';
      $('clearSearchBtn').classList.add('hidden');
    });

    // Hero Controls
    $('heroPrevBtn').addEventListener('click', () => {
      if (!state.heroItems.length) return;
      state.heroIndex = (state.heroIndex - 1 + state.heroItems.length) % state.heroItems.length;
      renderHeroSlide();
      startHeroAutoRotate();
    });
    $('heroNextBtn').addEventListener('click', () => {
      if (!state.heroItems.length) return;
      state.heroIndex = (state.heroIndex + 1) % state.heroItems.length;
      renderHeroSlide();
      startHeroAutoRotate();
    });
    $('heroDots').addEventListener('click', (e) => {
      const dot = e.target.closest('[data-hero-dot]');
      if (!dot) return;
      state.heroIndex = Number(dot.dataset.heroDot);
      renderHeroSlide();
      startHeroAutoRotate();
    });

    // Delegated Card / Hero Actions
    document.addEventListener('click', async (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;

      if (action === 'card-watchlist') {
        e.stopPropagation();
        const item = JSON.parse(decodeURIComponent(target.dataset.payload));
        const nowSaved = toggleWatchlistItem(item);
        target.classList.toggle('saved', nowSaved);
        target.textContent = nowSaved ? '✓' : '+';
        return;
      }

      if (action === 'toggle-watched') {
        e.stopPropagation();
        const list = getWatchlist();
        const found = list.find(
          (x) => x.media_type === target.dataset.type && Number(x.id) === Number(target.dataset.id)
        );
        if (found) {
          found.watched = !found.watched;
          saveWatchlist(list);
          renderWatchlistView();
        }
        return;
      }

      if (action === 'toggle-watchlist') {
        const item = state.heroItems[state.heroIndex];
        if (item) {
          toggleWatchlistItem(item);
          renderHeroSlide();
        }
        return;
      }

      if (action === 'hero-trailer') {
        try {
          const d = await API.fetchDetails(target.dataset.type, target.dataset.id);
          openTrailerTheater(d.displayTitle, API.extractYouTubeVideos(d));
        } catch {
          showToast('Unable to load trailer.');
        }
        return;
      }

      if (action === 'open-detail') {
        openDetailModal(target.dataset.type, target.dataset.id);
      }
    });

    // Filter Studio Interactions
    $('formatPills').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-format]');
      if (!btn) return;
      $('formatPills').querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      state.filters.format = btn.dataset.format;
      syncFilterBadges();
    });

    $('genrePills').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-genre]');
      if (!btn) return;
      const id = Number(btn.dataset.genre);
      const idx = state.filters.genres.indexOf(id);
      if (idx >= 0) state.filters.genres.splice(idx, 1);
      else state.filters.genres.push(id);
      btn.classList.toggle('active');
      syncFilterBadges();
    });

    $('minImdbRange').addEventListener('input', (e) => {
      const val = Number(e.target.value);
      state.filters.minImdb = val;
      $('minImdbVal').textContent = val > 0 ? `${val.toFixed(1)}+` : 'Any';
      syncFilterBadges();
    });

    $('minLbRange').addEventListener('input', (e) => {
      const val = Number(e.target.value);
      state.filters.minLetterboxd = val;
      $('minLbVal').textContent = val > 0 ? `${val.toFixed(1)}★+` : 'Any';
      syncFilterBadges();
    });

    $('languageSelect').addEventListener('change', (e) => {
      state.filters.language = e.target.value;
      syncFilterBadges();
    });

    // Live Autocomplete: Cast, Directors, Studios
    wireAutocomplete('castSearchInput', 'castSuggestions', API.searchPerson, (person) => {
      if (!state.filters.cast.some((p) => p.id === person.id)) {
        state.filters.cast.push({ id: person.id, name: person.name });
        renderSelectedTags('selectedCastTags', state.filters.cast, 'cast');
        syncFilterBadges();
      }
    });

    wireAutocomplete('directorSearchInput', 'directorSuggestions', API.searchPerson, (person) => {
      if (!state.filters.directors.some((p) => p.id === person.id)) {
        state.filters.directors.push({ id: person.id, name: person.name });
        renderSelectedTags('selectedDirectorTags', state.filters.directors, 'director');
        syncFilterBadges();
      }
    });

    wireAutocomplete('studioSearchInput', 'studioSuggestions', API.searchCompany, (company) => {
      if (!state.filters.studios.some((s) => s.id === company.id)) {
        state.filters.studios.push({ id: company.id, name: company.name, isNetwork: false });
        renderSelectedTags('selectedStudioTags', state.filters.studios, 'studio');
        syncFilterBadges();
      }
    });

    // Remove Tag Buttons
    $('filterStudioGrid').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-tag]');
      if (!btn) return;
      const type = btn.dataset.removeTag;
      const id = Number(btn.dataset.tagId);
      if (type === 'cast') {
        state.filters.cast = state.filters.cast.filter((x) => x.id !== id);
        renderSelectedTags('selectedCastTags', state.filters.cast, 'cast');
      } else if (type === 'director') {
        state.filters.directors = state.filters.directors.filter((x) => x.id !== id);
        renderSelectedTags('selectedDirectorTags', state.filters.directors, 'director');
      } else if (type === 'studio') {
        state.filters.studios = state.filters.studios.filter((x) => x.id !== id);
        renderSelectedTags('selectedStudioTags', state.filters.studios, 'studio');
      }
      syncFilterBadges();
    });

    $('studioPresets').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-studio-preset]');
      if (!btn) return;
      const id = Number(btn.dataset.studioPreset);
      const isNetwork = btn.dataset.network === 'true';
      const idx = state.filters.studios.findIndex((s) => s.id === id);
      if (idx >= 0) state.filters.studios.splice(idx, 1);
      else state.filters.studios.push({ id, name: btn.textContent, isNetwork });
      btn.classList.toggle('active');
      renderSelectedTags('selectedStudioTags', state.filters.studios, 'studio');
      syncFilterBadges();
    });

    $('eraPresets').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-era]');
      if (!btn) return;
      $('eraPresets').querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const preset = CFG.ERAS.find((x) => x.id === btn.dataset.era);
      state.filters.era = preset.id;
      state.filters.yearFrom = preset.from;
      state.filters.yearTo = preset.to;
      $('yearFromInput').value = preset.from;
      $('yearToInput').value = preset.to;
      syncFilterBadges();
    });

    $('yearFromInput').addEventListener('input', (e) => {
      state.filters.yearFrom = e.target.value;
      syncFilterBadges();
    });
    $('yearToInput').addEventListener('input', (e) => {
      state.filters.yearTo = e.target.value;
      syncFilterBadges();
    });

    $('awardsPills').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-award]');
      if (!btn) return;
      $('awardsPills').querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      state.filters.awards = btn.dataset.award;
      syncFilterBadges();
    });

    $('maxRuntimeRange').addEventListener('input', (e) => {
      const val = Number(e.target.value);
      state.filters.maxRuntime = val;
      $('maxRuntimeVal').textContent = val >= 240 ? 'Any' : `Under ${val} min`;
      syncFilterBadges();
    });

    $('streamingPills').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-provider]');
      if (!btn) return;
      const id = Number(btn.dataset.provider);
      const idx = state.filters.providers.indexOf(id);
      if (idx >= 0) state.filters.providers.splice(idx, 1);
      else state.filters.providers.push(id);
      btn.classList.toggle('active');
      syncFilterBadges();
    });

    $('sortSelect').addEventListener('change', (e) => {
      state.filters.sort = e.target.value;
      if (state.discoverMode === 'filter') runDiscover(1, false);
    });

    $('applyFiltersBtn').addEventListener('click', () => runDiscover(1, false));
    $('loadMoreBtn').addEventListener('click', () => runDiscover(state.discoverPage + 1, true));

    $('toggleFilterGridBtn').addEventListener('click', () => {
      const grid = $('filterStudioGrid');
      const hidden = grid.classList.toggle('hidden');
      $('toggleFilterGridBtn').textContent = hidden ? 'Show 9 Filters' : 'Collapse Filters';
    });

    $('resetAllFiltersBtn').addEventListener('click', () => {
      state.filters = createDefaultFilters();
      $('minImdbRange').value = 0;
      $('minLbRange').value = 0;
      $('minImdbVal').textContent = 'Any';
      $('minLbVal').textContent = 'Any';
      $('languageSelect').value = '';
      $('yearFromInput').value = '';
      $('yearToInput').value = '';
      $('maxRuntimeRange').value = 240;
      $('maxRuntimeVal').textContent = 'Any';
      $('selectedCastTags').innerHTML = '';
      $('selectedDirectorTags').innerHTML = '';
      $('selectedStudioTags').innerHTML = '';
      document.querySelectorAll('#filterStudioGrid .chip').forEach((c) => c.classList.remove('active'));
      $('formatPills').querySelector('[data-format="movie"]')?.classList.add('active');
      $('eraPresets').querySelector('[data-era="all"]')?.classList.add('active');
      $('awardsPills').querySelector('[data-award="all"]')?.classList.add('active');
      syncFilterBadges();
      runDiscover(1, false);
    });

    // Watchlist Filter & Import/Export
    $('watchlistFilterPills').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-wl-filter]');
      if (!btn) return;
      $('watchlistFilterPills').querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      state.watchlistFilter = btn.dataset.wlFilter;
      renderWatchlistView();
    });

    $('exportWatchlistBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(getWatchlist(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `wwt-watchlist-${state.activeUser || 'guest'}.json`;
      a.click();
    });

    $('importWatchlistInput').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (!Array.isArray(imported)) throw new Error();
          saveWatchlist(imported);
          renderWatchlistView();
          showToast(`Imported ${imported.length} watchlist titles.`);
        } catch {
          showToast('Invalid watchlist JSON file.');
        }
      };
      reader.readAsText(file);
    });

    // Settings Drawer
    $('openSettingsBtn').addEventListener('click', openSettings);
    $('bannerOpenSettingsBtn').addEventListener('click', openSettings);
    $('closeSettingsBtn').addEventListener('click', closeSettings);
    $('settingsDrawer').addEventListener('click', (e) => {
      if (e.target === $('settingsDrawer')) closeSettings();
    });

    $('themeSelectorGrid').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-set-theme]');
      if (!btn) return;
      const theme = btn.dataset.setTheme;
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(CFG.STORAGE_KEYS.THEME, theme);
      renderSettingsControls();
    });

    $('accentSelectorGrid').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-set-accent]');
      if (!btn) return;
      const accent = btn.dataset.setAccent;
      document.documentElement.setAttribute('data-accent', accent);
      localStorage.setItem(CFG.STORAGE_KEYS.ACCENT, accent);
      renderSettingsControls();
    });

    $('saveApiKeysBtn').addEventListener('click', () => {
      const tmdb = $('tmdbKeyInput').value.trim();
      const gemini = $('geminiKeyInput').value.trim();
      if (tmdb) localStorage.setItem(CFG.STORAGE_KEYS.TMDB_KEY, tmdb);
      else localStorage.removeItem(CFG.STORAGE_KEYS.TMDB_KEY);
      if (gemini) localStorage.setItem(CFG.STORAGE_KEYS.GEMINI_KEY, gemini);
      else localStorage.removeItem(CFG.STORAGE_KEYS.GEMINI_KEY);
      API.clearCache();
      $('apiSetupBanner').classList.toggle('hidden', API.hasTmdbKey());
      closeSettings();
      showToast('API settings saved.');
      if (API.hasTmdbKey()) loadHomeContent();
    });

    $('clearCacheBtn').addEventListener('click', () => {
      API.clearCache();
      showToast('Local metadata cache cleared.');
    });

    // Modals Close
    $('closeDetailModalBtn').addEventListener('click', () => $('detailModal').classList.add('hidden'));
    $('detailModal').addEventListener('click', (e) => {
      if (e.target === $('detailModal')) $('detailModal').classList.add('hidden');
    });
    $('closeTrailerModalBtn').addEventListener('click', closeTrailerTheater);
    $('trailerModal').addEventListener('click', (e) => {
      if (e.target === $('trailerModal')) closeTrailerTheater();
    });

    // Auth Modal
    $('authTriggerBtn').addEventListener('click', () => {
      updateAuthUI();
      $('authModal').classList.remove('hidden');
    });
    $('closeAuthModalBtn').addEventListener('click', () => $('authModal').classList.add('hidden'));
    $('authModal').addEventListener('click', (e) => {
      if (e.target === $('authModal')) $('authModal').classList.add('hidden');
    });
    document.querySelectorAll('.auth-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.authMode = tab.dataset.authMode;
        document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        $('authSubmitBtn').textContent = state.authMode === 'signup' ? 'Create Account' : 'Sign In';
        updateAuthUI();
      });
    });
    $('authForm').addEventListener('submit', handleAuthSubmit);
    $('logoutBtn').addEventListener('click', () => {
      state.activeUser = null;
      localStorage.removeItem(CFG.STORAGE_KEYS.ACTIVE_USER);
      $('authModal').classList.add('hidden');
      updateAuthUI();
      showToast('Signed out.');
      if (state.view === 'watchlist') renderWatchlistView();
    });

    // Escape key closes modals/drawer
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeTrailerTheater();
      $('detailModal').classList.add('hidden');
      $('authModal').classList.add('hidden');
      closeSettings();
    });
  }

  /* ---------- Utilities ---------- */
  function wireAutocomplete(inputId, menuId, searchFn, onSelect) {
    const input = $(inputId);
    const menu = $(menuId);
    let timer = null;

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) {
        menu.classList.add('hidden');
        return;
      }
      timer = setTimeout(async () => {
        try {
          const items = await searchFn(q);
          if (!items.length) {
            menu.classList.add('hidden');
            return;
          }
          menu.innerHTML = items
            .map(
              (item) => `
            <div class="autocomplete-item" data-ac-id="${item.id}" data-ac-name="${escapeHtml(item.name)}">
              <span>${escapeHtml(item.name)}</span>
              <span style="color:var(--text-muted);font-size:0.75rem;">${escapeHtml(item.known_for_department || '')}</span>
            </div>`
            )
            .join('');
          menu.classList.remove('hidden');
        } catch {
          menu.classList.add('hidden');
        }
      }, 300);
    });

    menu.addEventListener('click', (e) => {
      const row = e.target.closest('.autocomplete-item');
      if (!row) return;
      onSelect({ id: Number(row.dataset.acId), name: row.dataset.acName });
      input.value = '';
      menu.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && e.target !== input) menu.classList.add('hidden');
    });
  }

  let toastTimer = null;
  function showToast(message) {
    const el = $('toastEl');
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
