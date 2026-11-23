/* ==========================================================================
   WOULD WATCH THAT — Main Application Controller
   Popover Filter Studio, Separate IMDb/Letterboxd Filters & Sorter, Auth & Graphics
   ========================================================================== */

(() => {
  const CFG = window.WWT_CONFIG;
  const API = window.WWT_API;

  const SVG_LAUREL = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 4C3.5 7 3.5 14 8 19M17 4c3.5 3 3.5 10-1 15M8 19h8"/></svg>`;
  const SVG_LB_DOTS = `<svg viewBox="0 0 30 10" width="18" height="7" aria-hidden="true"><circle cx="5" cy="5" r="3.6" fill="#ff8000"/><circle cx="15" cy="5" r="3.6" fill="#00e054"/><circle cx="25" cy="5" r="3.6" fill="#40bcf4"/></svg>`;

  const state = {
    view: 'home',
    heroItems: [],
    heroIndex: 0,
    heroTimer: null,
    discoverPage: 1,
    discoverTotalPages: 1,
    discoverMode: 'filter', // 'filter' | 'search' | 'ai'
    currentResults: [],
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

  const $ = (id) => document.getElementById(id);

  /* ---------- Init ---------- */
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
            <p class="eyebrow">WOULD WATCH THAT</p>
            <h2 style="font-family: var(--font-display); margin: 0.4rem 0 1rem;">Connect Your TMDB API Key to Enter the Archive</h2>
            <button class="btn-accent" id="heroSetupKeyBtn">Open Studio Settings</button>
          </div>
        </div>`;
      $('heroSetupKeyBtn')?.addEventListener('click', openSettings);
    } else {
      loadHomeContent();
    }
  });

  /* ---------- Appearance ---------- */
  function applySavedAppearance() {
    const savedTheme = localStorage.getItem(CFG.STORAGE_KEYS.THEME);
    const savedAccent = localStorage.getItem(CFG.STORAGE_KEYS.ACCENT);
    const theme = CFG.THEMES.some((t) => t.id === savedTheme) ? savedTheme : 'abyssal-carbon';
    const accent = CFG.ACCENTS.some((a) => a.id === savedAccent) ? savedAccent : 'royal-gold';
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
    closeAllPopovers();
    document.querySelectorAll('.view-section').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === viewName));
    $(`${viewName}View`).classList.add('active');

    if (viewName === 'discover' && !state.currentResults.length && API.hasTmdbKey()) {
      runDiscover(1, false);
    }
    if (viewName === 'watchlist') renderWatchlistView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Popover Controls ---------- */
  function closeAllPopovers(exceptBox = null) {
    document.querySelectorAll('.filter-popover').forEach((box) => {
      if (box === exceptBox) return;
      box.classList.remove('open');
      box.querySelector('.filter-panel')?.classList.add('hidden');
      box.querySelector('.filter-trigger')?.setAttribute('aria-expanded', 'false');
    });
  }

  /* ---------- Home Content ---------- */
  async function loadHomeContent() {
    try {
      state.heroItems = await API.fetchHeroSpotlight();
      state.heroIndex = 0;
      renderHeroSlide();
      startHeroAutoRotate();
    } catch {
      $('heroTrack').innerHTML = `<div class="hero-skeleton">Unable to load spotlight. Verify your TMDB key in Settings.</div>`;
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
          <div class="empty-state" style="min-width:250px;">Loading archive…</div>
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
            ${item.hasImdb ? `<span class="rating-pill rating-imdb">IMDb ${item.imdbScore}</span>` : ''}
            ${item.hasLetterboxd ? `<span class="rating-pill rating-lb">${SVG_LB_DOTS} ${item.letterboxdScore}★</span>` : ''}
            ${item.awardBadge ? `<span class="award-badge">${SVG_LAUREL} ${escapeHtml(item.awardBadge)}</span>` : ''}
          </div>
          <h1 class="hero-title">${escapeHtml(item.displayTitle)}</h1>
          <p class="hero-overview">${escapeHtml(item.overview || 'Explore cast, verified ratings, and trailers.')}</p>
          <div class="hero-cta-row">
            <button class="btn-accent" data-action="hero-trailer" data-type="${item.media_type}" data-id="${item.id}">▶ Watch Trailer</button>
            <button class="btn-outline" data-action="open-detail" data-type="${item.media_type}" data-id="${item.id}">Dossier</button>
            <button class="btn-outline" data-action="toggle-watchlist" data-type="${item.media_type}" data-id="${item.id}">
              ${saved ? '✓ In Watchlist' : '+ Watchlist'}
            </button>
          </div>
        </div>
      </div>`;

    $('heroDots').innerHTML = state.heroItems
      .map((_, i) => `<button class="hero-dot ${i === state.heroIndex ? 'active' : ''}" data-hero-dot="${i}" aria-label="Slide ${i + 1}"></button>`)
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

  /* ---------- Filter Studio Controls ---------- */
  function renderFilterControls() {
    $('genrePills').innerHTML = CFG.GENRES.map(
      (g) => `<button type="button" class="chip" data-genre="${g.id}">${g.name}</button>`
    ).join('');

    $('languageSelect').innerHTML = CFG.LANGUAGES.map(
      (l) => `<option value="${l.code}">${l.name}</option>`
    ).join('');

    $('studioPresets').innerHTML = CFG.STUDIO_PRESETS.map(
      (s) => `<button type="button" class="chip" data-studio-preset="${s.id}" data-network="${Boolean(s.isNetwork)}">${s.name}</button>`
    ).join('');

    $('eraPresets').innerHTML = CFG.ERAS.map(
      (e) => `<button type="button" class="chip ${e.id === 'all' ? 'active' : ''}" data-era="${e.id}">${e.label}</button>`
    ).join('');

    $('awardsPills').innerHTML = CFG.AWARDS_PRESETS.map(
      (a) => `<button type="button" class="chip ${a.id === 'all' ? 'active' : ''}" data-award="${a.id}">${a.label}</button>`
    ).join('');

    $('streamingPills').innerHTML = CFG.STREAMING_PROVIDERS.map(
      (p) => `<button type="button" class="chip" data-provider="${p.id}">${p.name}</button>`
    ).join('');

    syncFilterBadges();
  }

  function syncFilterBadges() {
    const f = state.filters;
    const fmtLabel = f.format === 'tv' ? 'TV Series' : f.format.charAt(0).toUpperCase() + f.format.slice(1);
    const langLabel = f.language ? f.language.toUpperCase() : 'Any';
    $('badge-format').textContent = `${fmtLabel} · ${langLabel}`;

    $('badge-genre').textContent = f.genres.length
      ? f.genres.map((id) => CFG.GENRES.find((g) => g.id === id)?.name).filter(Boolean).slice(0, 2).join(', ') +
        (f.genres.length > 2 ? ` +${f.genres.length - 2}` : '')
      : 'Any';

    $('badge-imdb').textContent = f.minImdb > 0 ? `${f.minImdb.toFixed(1)}+ / 10` : 'Any';
    $('badge-letterboxd').textContent = f.minLetterboxd > 0 ? `${f.minLetterboxd.toFixed(1)}★+ / 5` : 'Any';
    $('badge-cast').textContent = f.cast.length ? f.cast.map((c) => c.name).join(', ') : 'Any';
    $('badge-director').textContent = f.directors.length ? f.directors.map((d) => d.name).join(', ') : 'Any';
    $('badge-studio').textContent = f.studios.length ? f.studios.map((s) => s.name).join(', ') : 'Any';
    $('badge-era').textContent = f.yearFrom || f.yearTo ? `${f.yearFrom || '…'}–${f.yearTo || '…'}` : 'All Eras';
    $('badge-awards').textContent = CFG.AWARDS_PRESETS.find((a) => a.id === f.awards)?.label || 'All Titles';

    const rtParts = [];
    if (f.maxRuntime < 240) rtParts.push(`≤${f.maxRuntime}m`);
    if (f.providers.length) rtParts.push(`${f.providers.length} stream`);
    $('badge-runtime').textContent = rtParts.length ? rtParts.join(' · ') : 'Any';

    // Highlight active filter triggers
    setPopoverActive('format', f.format !== 'movie' || Boolean(f.language));
    setPopoverActive('genre', f.genres.length > 0);
    setPopoverActive('imdb', f.minImdb > 0);
    setPopoverActive('letterboxd', f.minLetterboxd > 0);
    setPopoverActive('cast', f.cast.length > 0);
    setPopoverActive('director', f.directors.length > 0);
    setPopoverActive('studio', f.studios.length > 0);
    setPopoverActive('era', Boolean(f.yearFrom || f.yearTo));
    setPopoverActive('awards', f.awards !== 'all');
    setPopoverActive('runtime', f.maxRuntime < 240 || f.providers.length > 0);

    renderActiveFilterStrip();
  }

  function setPopoverActive(boxKey, isActive) {
    document.querySelector(`[data-filter-box="${boxKey}"]`)?.classList.toggle('has-value', isActive);
  }

  function renderActiveFilterStrip() {
    const f = state.filters;
    const pills = [];
    if (f.language) pills.push(`Language: ${f.language.toUpperCase()}`);
    if (f.minImdb > 0) pills.push(`IMDb ≥ ${f.minImdb.toFixed(1)}`);
    if (f.minLetterboxd > 0) pills.push(`Letterboxd ≥ ${f.minLetterboxd.toFixed(1)}★`);
    f.genres.forEach((id) => {
      const g = CFG.GENRES.find((x) => x.id === id);
      if (g) pills.push(g.name);
    });
    f.cast.forEach((p) => pills.push(`Cast: ${p.name}`));
    f.directors.forEach((p) => pills.push(`Dir: ${p.name}`));
    f.studios.forEach((s) => pills.push(`Studio: ${s.name}`));
    if (f.yearFrom || f.yearTo) pills.push(`Years: ${f.yearFrom || '…'}–${f.yearTo || '…'}`);
    if (f.awards !== 'all') pills.push(CFG.AWARDS_PRESETS.find((a) => a.id === f.awards)?.label || f.awards);
    if (f.maxRuntime < 240) pills.push(`Under ${f.maxRuntime}m`);

    const strip = $('activeFiltersStrip');
    if (!pills.length) {
      strip.classList.add('hidden');
      strip.innerHTML = '';
      return;
    }
    strip.classList.remove('hidden');
    strip.innerHTML = pills.map((p) => `<span class="tag-removable">${escapeHtml(p)}</span>`).join('');
  }

  function renderSelectedTags(containerId, items, type) {
    $(containerId).innerHTML = items
      .map(
        (item) => `
      <span class="tag-removable">
        ${escapeHtml(item.name)}
        <button type="button" data-remove-tag="${type}" data-tag-id="${item.id}" aria-label="Remove">&times;</button>
      </span>`
      )
      .join('');
  }

  /* ---------- Discovery, Search & Universal Sorter ---------- */
  function syncSorterUI(sortVal) {
    state.filters.sort = sortVal;
    $('sortSelect').value = sortVal;
    document.querySelectorAll('.sort-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.sortVal === sortVal);
    });
  }

  function renderDiscoverGrid(items, append = false, metaPrefix = '') {
    const grid = $('discoverGrid');
    const isRatingSort = ['imdb.desc', 'imdb.asc', 'letterboxd.desc', 'letterboxd.asc'].includes(state.filters.sort);

    if (!append) state.currentResults = items;
    else {
      const seen = new Set(state.currentResults.map((x) => `${x.media_type}_${x.id}`));
      items.forEach((it) => {
        const key = `${it.media_type}_${it.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          state.currentResults.push(it);
        }
      });
    }

    const displayList = API.sortAndSanitize(state.currentResults, state.filters.sort);

    const ratedNote = isRatingSort ? ' · unrated titles hidden' : '';
    $('resultsMeta').textContent = `${metaPrefix}${displayList.length} curated title${displayList.length === 1 ? '' : 's'}${ratedNote}`;

    if (!displayList.length) {
      grid.innerHTML = `<div class="empty-state">No rated titles match that exact selection. Try relaxing a filter or switching sort mode.</div>`;
      return;
    }

    grid.innerHTML = displayList.map((item) => createCardHTML(item)).join('');
  }

  async function runDiscover(page = 1, append = false) {
    if (!API.hasTmdbKey()) {
      openSettings();
      return;
    }

    closeAllPopovers();
    state.discoverMode = 'filter';
    state.discoverPage = page;
    if (!append) {
      $('discoverGrid').innerHTML = `<div class="empty-state">Curating titles from the archive…</div>`;
    }

    try {
      const data = await API.discoverWithFilters(state.filters, page);
      state.discoverTotalPages = data.total_pages;
      renderDiscoverGrid(data.results, append, 'Showing ');
      $('paginationBar').classList.toggle('hidden', page >= state.discoverTotalPages);
    } catch (err) {
      $('discoverGrid').innerHTML = `<div class="empty-state">Error loading catalog (${escapeHtml(err.message)}). Verify your TMDB key in Settings.</div>`;
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
    $('paginationBar').classList.add('hidden');

    if (useAI && !API.getGeminiKey()) {
      showToast('Add a Gemini API Key in Studio Settings for AI Search. Using TMDB Search.');
      useAI = false;
    }

    $('discoverGrid').innerHTML = `<div class="empty-state">${
      useAI ? '✦ Consulting Gemini Search Grounding for verified cinema picks…' : `Searching archive for “${escapeHtml(clean)}”…`
    }</div>`;

    try {
      let results = [];
      let prefix = `Search “${clean}” — `;
      if (useAI) {
        state.discoverMode = 'ai';
        results = (await API.aiNaturalLanguageDiscover(clean)) || [];
        prefix = `✦ AI Grounded “${clean}” — `;
      }
      if (!useAI || !results.length) {
        state.discoverMode = 'search';
        const data = await API.searchMulti(clean, 1);
        results = data.results;
      }
      renderDiscoverGrid(results, false, prefix);
    } catch (err) {
      $('discoverGrid').innerHTML = `<div class="empty-state">Search failed: ${escapeHtml(err.message)}</div>`;
    }
  }

  function handleSortChange(newSort) {
    syncSorterUI(newSort);
    if (state.discoverMode === 'filter' && API.hasTmdbKey()) {
      // Re-query TMDB with proper server-side sort & vote floor
      runDiscover(1, false);
    } else if (state.currentResults.length) {
      // Re-sort search / AI results locally and strip unrated titles when sorting by IMDb or Letterboxd
      const prefix = state.discoverMode === 'ai' ? `✦ AI Grounded “${state.lastQuery}” — ` : `Search “${state.lastQuery}” — `;
      renderDiscoverGrid(state.currentResults, false, prefix);
    }
  }

  /* ---------- Card HTML ---------- */
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
        hasImdb: item.hasImdb,
        hasLetterboxd: item.hasLetterboxd,
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
          ${item.awardBadge ? `<span class="card-laurel">${SVG_LAUREL} PRESTIGE</span>` : ''}
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
            ${
              item.hasImdb
                ? `<span class="rating-pill rating-imdb">IMDb ${item.imdbScore}</span>`
                : ''
            }
            ${
              item.hasLetterboxd
                ? `<span class="rating-pill rating-lb">${SVG_LB_DOTS} ${item.letterboxdScore}</span>`
                : ''
            }
            ${
              !item.hasImdb && !item.hasLetterboxd
                ? `<span class="rating-pill rating-unrated">Unrated</span>`
                : ''
            }
          </div>
        </div>
      </article>`;
  }

  /* ---------- Detail Modal ---------- */
  async function openDetailModal(mediaType, id) {
    const modal = $('detailModal');
    const body = $('detailModalBody');
    modal.classList.remove('hidden');
    body.innerHTML = `<div class="empty-state" style="border:none;">Retrieving dossier…</div>`;

    try {
      const d = await API.fetchDetails(mediaType, id);
      const saved = isInWatchlist(mediaType, d.id);
      const directors =
        mediaType === 'tv'
          ? (d.created_by || []).map((p) => p.name).join(', ')
          : (d.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name).slice(0, 3).join(', ');
      const topCast = (d.credits?.cast || []).slice(0, 5).map((c) => c.name).join(', ');
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

            <div class="detail-badges-row">
              ${d.hasImdb ? `<span class="rating-pill rating-imdb" id="detailImdbPill">IMDb ${d.imdbScore}/10</span>` : ''}
              ${d.hasLetterboxd ? `<span class="rating-pill rating-lb" id="detailLbPill">${SVG_LB_DOTS} ${d.letterboxdScore}/5</span>` : ''}
              ${
                d.awardBadge
                  ? `<span class="award-badge" id="detailAwardBadge">${SVG_LAUREL} ${escapeHtml(d.awardBadge)}</span>`
                  : '<span class="award-badge hidden" id="detailAwardBadge"></span>'
              }
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

      if (API.getGeminiKey()) {
        API.verifyTitlePrestige(d.displayTitle, d.displayYear, mediaType).then((verified) => {
          if (!verified) return;
          if (verified.imdb && $('detailImdbPill')) $('detailImdbPill').textContent = `IMDb ${verified.imdb}/10 ✓`;
          if (verified.letterboxd && $('detailLbPill')) $('detailLbPill').innerHTML = `${SVG_LB_DOTS} ${verified.letterboxd}/5 ✓`;
          if (verified.awardsSummary && $('detailAwardBadge')) {
            $('detailAwardBadge').innerHTML = `${SVG_LAUREL} ${escapeHtml(verified.awardsSummary)}`;
            $('detailAwardBadge').classList.remove('hidden');
          }
        });
      }
    } catch (err) {
      body.innerHTML = `<div class="empty-state">Unable to load details (${escapeHtml(err.message)}).</div>`;
    }
  }

  /* ---------- Screening Room (Error-153-Free) ---------- */
  function openTrailerTheater(title, videos) {
    if (!videos.length) {
      showToast('No official trailer found for this title.');
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

  /* ---------- Watchlist ---------- */
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
      hasImdb: Boolean(item.imdbScore),
      hasLetterboxd: Boolean(item.letterboxdScore),
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
    const users = JSON.parse(localStorage.getItem(CFG.STORAGE_KEYS.USERS) || '{}');
    const displayName = state.activeUser ? users[state.activeUser]?.displayName || state.activeUser : 'Guest';
    $('watchlistHeading').textContent = `${displayName}’s Watchlist`;

    const list = getWatchlist();
    const filtered = list.filter((i) => {
      if (state.watchlistFilter === 'watched') return i.watched;
      if (state.watchlistFilter === 'towatch') return !i.watched;
      return true;
    });

    const grid = $('watchlistGrid');
    if (!filtered.length) {
      grid.innerHTML = `<div class="empty-state">No titles saved here yet. Click <strong>+</strong> on any poster to curate your archive.</div>`;
      return;
    }

    grid.innerHTML = filtered
      .map(
        (item) => `
      <article class="media-card" data-action="open-detail" data-type="${item.media_type}" data-id="${item.id}">
        <div class="poster-wrap">
          ${item.posterUrl ? `<img src="${item.posterUrl}" alt="${escapeHtml(item.displayTitle)}" />` : `<div class="poster-placeholder">${escapeHtml(item.displayTitle)}</div>`}
          <button type="button" class="card-wl-btn ${item.watched ? 'saved' : ''}" data-action="toggle-watched" data-type="${item.media_type}" data-id="${item.id}" title="Toggle Watched">
            ${item.watched ? '✓' : '○'}
          </button>
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(item.displayTitle)}</h3>
          <div class="card-sub">${item.displayYear} · ${item.watched ? 'Watched' : 'To Watch'}</div>
          <div class="ratings-strip">
            ${item.imdbScore ? `<span class="rating-pill rating-imdb">IMDb ${item.imdbScore}</span>` : ''}
            ${item.letterboxdScore ? `<span class="rating-pill rating-lb">${SVG_LB_DOTS} ${item.letterboxdScore}</span>` : ''}
          </div>
        </div>
      </article>`
      )
      .join('');
  }

  /* ---------- Member Auth (Log In & Sign Up with SHA-256) ---------- */
  async function sha256(text) {
    const buf = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function openAuthModal(mode = 'login') {
    state.authMode = mode;
    $('authErrorText').classList.add('hidden');
    $('authForm').reset();
    updateAuthUI();
    $('authModal').classList.remove('hidden');
  }

  function updateAuthUI() {
    const users = JSON.parse(localStorage.getItem(CFG.STORAGE_KEYS.USERS) || '{}');
    const isSignedIn = Boolean(state.activeUser && users[state.activeUser]);

    $('guestAuthButtons').classList.toggle('hidden', isSignedIn);
    $('memberProfileBtn').classList.toggle('hidden', !isSignedIn);

    if (isSignedIn) {
      const profile = users[state.activeUser];
      const name = profile.displayName || state.activeUser;
      $('memberAvatarInitial').textContent = name.charAt(0).toUpperCase();
      $('memberHandleLabel').textContent = `@${state.activeUser}`;
      $('signedInUserLabel').textContent = `${name} (@${state.activeUser})`;
      $('signedInStats').textContent = `${getWatchlist().length} saved title${getWatchlist().length === 1 ? '' : 's'} in archive`;

      $('authTabs').classList.add('hidden');
      $('authForm').classList.add('hidden');
      $('signedInPanel').classList.remove('hidden');
      $('authModalTitle').textContent = 'Member Archive';
    } else {
      const isSignup = state.authMode === 'signup';
      $('authTabs').classList.remove('hidden');
      $('authForm').classList.remove('hidden');
      $('signedInPanel').classList.add('hidden');
      $('authDisplayNameRow').classList.toggle('hidden', !isSignup);
      $('authConfirmRow').classList.toggle('hidden', !isSignup);
      $('authConfirmPassword').required = isSignup;
      $('authSubmitBtn').textContent = isSignup ? 'Create Account' : 'Log In';
      $('authModalTitle').textContent = isSignup ? 'Join Would Watch That' : 'Log In to Would Watch That';

      document.querySelectorAll('.auth-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.authMode === state.authMode);
      });
    }
    updateWatchlistBadge();
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const username = $('authUsername').value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const password = $('authPassword').value;
    const errEl = $('authErrorText');
    errEl.classList.add('hidden');

    if (username.length < 3) {
      errEl.textContent = 'Username must be at least 3 letters or numbers.';
      errEl.classList.remove('hidden');
      return;
    }

    const users = JSON.parse(localStorage.getItem(CFG.STORAGE_KEYS.USERS) || '{}');
    const hashed = await sha256(`${username}::wwt_archive_salt::${password}`);

    if (state.authMode === 'signup') {
      const confirmPw = $('authConfirmPassword').value;
      if (password !== confirmPw) {
        errEl.textContent = 'Passwords do not match.';
        errEl.classList.remove('hidden');
        return;
      }
      if (users[username]) {
        errEl.textContent = 'That username is already registered. Please log in.';
        errEl.classList.remove('hidden');
        return;
      }
      const displayName = $('authDisplayName').value.trim() || username;
      users[username] = { hash: hashed, displayName, createdAt: Date.now() };
      localStorage.setItem(CFG.STORAGE_KEYS.USERS, JSON.stringify(users));
      state.activeUser = username;
      localStorage.setItem(CFG.STORAGE_KEYS.ACTIVE_USER, username);
      showToast(`Welcome to the Archive, ${displayName}!`);
    } else {
      if (!users[username] || users[username].hash !== hashed) {
        errEl.textContent = 'Incorrect username or password.';
        errEl.classList.remove('hidden');
        return;
      }
      state.activeUser = username;
      localStorage.setItem(CFG.STORAGE_KEYS.ACTIVE_USER, username);
      showToast(`Signed in as @${username}`);
    }

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

    // Popover Filter Triggers
    document.querySelectorAll('.filter-popover').forEach((box) => {
      const trigger = box.querySelector('.filter-trigger');
      const panel = box.querySelector('.filter-panel');
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !box.classList.contains('open');
        closeAllPopovers(willOpen ? box : null);
        box.classList.toggle('open', willOpen);
        panel.classList.toggle('hidden', !willOpen);
        trigger.setAttribute('aria-expanded', String(willOpen));
      });
      panel.addEventListener('click', (e) => e.stopPropagation());
    });
    document.addEventListener('click', () => closeAllPopovers());

    // Search
    $('conciergeSearchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      runConciergeSearch($('conciergeInput').value, false);
    });
    $('aiConciergeBtn').addEventListener('click', () => runConciergeSearch($('conciergeInput').value, true));
    $('conciergeInput').addEventListener('input', (e) => $('clearSearchBtn').classList.toggle('hidden', !e.target.value));
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

    // Card & Hero Actions
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
        const found = list.find((x) => x.media_type === target.dataset.type && Number(x.id) === Number(target.dataset.id));
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

    // Filter Controls: Format & Language
    $('formatPills').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-format]');
      if (!btn) return;
      $('formatPills').querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      state.filters.format = btn.dataset.format;
      syncFilterBadges();
    });
    $('languageSelect').addEventListener('change', (e) => {
      state.filters.language = e.target.value;
      syncFilterBadges();
    });

    // Genres
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

    // Separate IMDb Filter
    $('imdbPresets').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-imdb-preset]');
      if (!btn) return;
      const val = Number(btn.dataset.imdbPreset);
      $('imdbPresets').querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      state.filters.minImdb = val;
      $('minImdbRange').value = val;
      $('minImdbVal').textContent = val > 0 ? `${val.toFixed(1)}+` : 'Any';
      syncFilterBadges();
    });
    $('minImdbRange').addEventListener('input', (e) => {
      const val = Number(e.target.value);
      state.filters.minImdb = val;
      $('minImdbVal').textContent = val > 0 ? `${val.toFixed(1)}+` : 'Any';
      $('imdbPresets').querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.imdbPreset) === val));
      syncFilterBadges();
    });

    // Separate Letterboxd Filter
    $('lbPresets').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lb-preset]');
      if (!btn) return;
      const val = Number(btn.dataset.lbPreset);
      $('lbPresets').querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      state.filters.minLetterboxd = val;
      $('minLbRange').value = val;
      $('minLbVal').textContent = val > 0 ? `${val.toFixed(1)}★+` : 'Any';
      syncFilterBadges();
    });
    $('minLbRange').addEventListener('input', (e) => {
      const val = Number(e.target.value);
      state.filters.minLetterboxd = val;
      $('minLbVal').textContent = val > 0 ? `${val.toFixed(1)}★+` : 'Any';
      $('lbPresets').querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.lbPreset) === val));
      syncFilterBadges();
    });

    // Autocompletes
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

    $('filterBarShell').addEventListener('click', (e) => {
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

    // Proper Universal Sorter Events (Quick Pills + Full Dropdown)
    $('sorterQuickPills').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sort-val]');
      if (!btn) return;
      handleSortChange(btn.dataset.sortVal);
    });
    $('sortSelect').addEventListener('change', (e) => handleSortChange(e.target.value));

    $('applyFiltersBtn').addEventListener('click', () => runDiscover(1, false));
    $('loadMoreBtn').addEventListener('click', () => runDiscover(state.discoverPage + 1, true));

    $('resetAllFiltersBtn').addEventListener('click', () => {
      const currentSort = state.filters.sort;
      state.filters = createDefaultFilters();
      state.filters.sort = currentSort;
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
      document.querySelectorAll('#filterBarShell .chip').forEach((c) => c.classList.remove('active'));
      $('formatPills').querySelector('[data-format="movie"]')?.classList.add('active');
      $('imdbPresets').querySelector('[data-imdb-preset="0"]')?.classList.add('active');
      $('lbPresets').querySelector('[data-lb-preset="0"]')?.classList.add('active');
      $('eraPresets').querySelector('[data-era="all"]')?.classList.add('active');
      $('awardsPills').querySelector('[data-award="all"]')?.classList.add('active');
      syncFilterBadges();
      runDiscover(1, false);
    });

    // Watchlist Controls
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

    // Settings
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

    // Explicit Log In, Sign Up & Member Profile Triggers
    $('headerLoginBtn').addEventListener('click', () => openAuthModal('login'));
    $('headerSignupBtn').addEventListener('click', () => openAuthModal('signup'));
    $('memberProfileBtn').addEventListener('click', () => openAuthModal('login'));
    $('closeAuthModalBtn').addEventListener('click', () => $('authModal').classList.add('hidden'));
    $('authModal').addEventListener('click', (e) => {
      if (e.target === $('authModal')) $('authModal').classList.add('hidden');
    });
    document.querySelectorAll('.auth-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.authMode = tab.dataset.authMode;
        $('authErrorText').classList.add('hidden');
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

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeAllPopovers();
      closeTrailerTheater();
      $('detailModal').classList.add('hidden');
      $('authModal').classList.add('hidden');
      closeSettings();
    });
  }

  /* ---------- Helpers ---------- */
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
              <span style="color:var(--text-muted);font-size:0.72rem;">${escapeHtml(item.known_for_department || '')}</span>
            </div>`
            )
            .join('');
          menu.classList.remove('hidden');
        } catch {
          menu.classList.add('hidden');
        }
      }, 280);
    });

    menu.addEventListener('click', (e) => {
      const row = e.target.closest('.autocomplete-item');
      if (!row) return;
      onSelect({ id: Number(row.dataset.acId), name: row.dataset.acName });
      input.value = '';
      menu.classList.add('hidden');
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
