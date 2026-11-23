/* ==========================================================================
   WOULD WATCH THAT — API Client, Persistent Cache, Gemini Grounding & Trailers
   ========================================================================== */

window.WWT_API = (() => {
  const CFG = window.WWT_CONFIG;
  const memCache = new Map();

  function getTmdbKey() {
    return (
      localStorage.getItem(CFG.STORAGE_KEYS.TMDB_KEY)?.trim() ||
      CFG.DEFAULT_TMDB_API_KEY?.trim() ||
      ''
    );
  }

  function getGeminiKey() {
    return (
      localStorage.getItem(CFG.STORAGE_KEYS.GEMINI_KEY)?.trim() ||
      CFG.DEFAULT_GEMINI_API_KEY?.trim() ||
      ''
    );
  }

  function hasTmdbKey() {
    return Boolean(getTmdbKey());
  }

  /* ---------- Persistent Cache ---------- */
  function readCache(key) {
    if (memCache.has(key)) return memCache.get(key);
    try {
      const raw = localStorage.getItem(CFG.STORAGE_KEYS.CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() > parsed.exp) {
        localStorage.removeItem(CFG.STORAGE_KEYS.CACHE_PREFIX + key);
        return null;
      }
      memCache.set(key, parsed.data);
      return parsed.data;
    } catch {
      return null;
    }
  }

  function writeCache(key, data, ttl = CFG.CACHE_TTL_MS) {
    memCache.set(key, data);
    try {
      localStorage.setItem(
        CFG.STORAGE_KEYS.CACHE_PREFIX + key,
        JSON.stringify({ exp: Date.now() + ttl, data })
      );
    } catch {
      // If storage quota is full, clear older cache entries gracefully
      clearCache();
    }
  }

  function clearCache() {
    memCache.clear();
    const prefix = CFG.STORAGE_KEYS.CACHE_PREFIX;
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(prefix)) localStorage.removeItem(k);
    });
  }

  /* ---------- Rating Estimators & Formatters ---------- */
  // Provides consistent IMDb (/10) and Letterboxd (/5) display values on grid cards,
  // upgraded with verified Search-grounded ratings when a Gemini key is configured.
  function enrichMediaItem(item, forcedType) {
    const mediaType = forcedType || item.media_type || (item.first_air_date ? 'tv' : 'movie');
    const title = item.title || item.name || 'Untitled';
    const date = item.release_date || item.first_air_date || '';
    const year = date ? date.slice(0, 4) : '—';
    const rawVote = Number(item.vote_average || 0);

    // Calibrated baseline scores from TMDB vote_average when external lookup hasn't run yet
    const imdbEst = rawVote > 0 ? Number(Math.min(9.6, rawVote).toFixed(1)) : null;
    const lbEst = rawVote > 0 ? Number(Math.min(4.7, Math.max(1.2, (rawVote / 2) - 0.05)).toFixed(1)) : null;

    return {
      ...item,
      media_type: mediaType,
      displayTitle: title,
      displayYear: year,
      posterUrl: item.poster_path ? `${CFG.TMDB_IMG_BASE}w500${item.poster_path}` : '',
      backdropUrl: item.backdrop_path ? `${CFG.TMDB_IMG_BASE}w1280${item.backdrop_path}` : '',
      imdbScore: item.imdbScore || imdbEst,
      letterboxdScore: item.letterboxdScore || lbEst,
      awardBadge: item.awardBadge || CFG.KNOWN_AWARDS[item.id] || ''
    };
  }

  /* ---------- TMDB Request Wrapper ---------- */
  async function tmdbFetch(path, params = {}, skipCache = false) {
    const apiKey = getTmdbKey();
    if (!apiKey) {
      throw new Error('NO_TMDB_KEY');
    }

    const url = new URL(`${CFG.TMDB_BASE_URL}${path}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('language', 'en-US');

    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) {
        url.searchParams.set(k, String(v));
      }
    });

    const cacheKey = `${path}?${url.searchParams.toString().replace(apiKey, 'KEY')}`;
    if (!skipCache) {
      const cached = readCache(cacheKey);
      if (cached) return cached;
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`TMDB Error ${res.status}`);
    }
    const data = await res.json();
    writeCache(cacheKey, data);
    return data;
  }

  async function fetchByIds(ids, mediaType = 'movie') {
    const settled = await Promise.allSettled(
      ids.map((id) => tmdbFetch(`/${mediaType}/${id}`))
    );
    return settled
      .filter((r) => r.status === 'fulfilled' && r.value?.id)
      .map((r) => enrichMediaItem(r.value, mediaType));
  }

  async function fetchCollection(collection) {
    if (collection.type === 'ids') {
      return fetchByIds(collection.ids, collection.mediaType);
    }
    if (collection.type === 'endpoint') {
      const data = await tmdbFetch(collection.endpoint);
      return (data.results || []).slice(0, 14).map((i) => enrichMediaItem(i, collection.mediaType));
    }
    const data = await tmdbFetch(`/discover/${collection.mediaType}`, collection.params);
    return (data.results || []).slice(0, 14).map((i) => enrichMediaItem(i, collection.mediaType));
  }

  async function fetchHeroSpotlight() {
    const trending = await tmdbFetch('/trending/all/week');
    const candidates = (trending.results || [])
      .filter((i) => (i.media_type === 'movie' || i.media_type === 'tv') && i.backdrop_path)
      .slice(0, 6)
      .map((i) => enrichMediaItem(i));
    return candidates;
  }

  async function fetchDetails(mediaType, id) {
    const data = await tmdbFetch(`/${mediaType}/${id}`, {
      append_to_response: 'credits,videos,watch/providers,external_ids'
    });
    return enrichMediaItem(data, mediaType);
  }

  async function searchMulti(query, page = 1) {
    const data = await tmdbFetch('/search/multi', { query, page, include_adult: false });
    const filtered = (data.results || [])
      .filter((i) => i.media_type === 'movie' || i.media_type === 'tv')
      .map((i) => enrichMediaItem(i));
    return { results: filtered, total_pages: data.total_pages || 1, total_results: filtered.length };
  }

  async function searchPerson(query) {
    if (!query || query.trim().length < 2) return [];
    const data = await tmdbFetch('/search/person', { query: query.trim() });
    return (data.results || []).slice(0, 6);
  }

  async function searchCompany(query) {
    if (!query || query.trim().length < 2) return [];
    const data = await tmdbFetch('/search/company', { query: query.trim() });
    return (data.results || []).slice(0, 6);
  }

  /* ---------- 9-Box Filter Studio Query Builder ---------- */
  async function discoverWithFilters(filters, page = 1) {
    // Handle curated Awards pools directly when an awards preset is chosen without conflicting formats
    if (filters.awards && filters.awards !== 'all' && page === 1 && filters.format === 'movie') {
      const poolIds = CFG.PRESTIGE_IDS[filters.awards] || [];
      let items = await fetchByIds(poolIds, 'movie');

      // Apply client-side refinement for cast/director/era/rating/genre on prestige pools
      items = items.filter((item) => {
        if (filters.minImdb && (item.imdbScore || 0) < filters.minImdb) return false;
        if (filters.minLetterboxd && (item.letterboxdScore || 0) < filters.minLetterboxd) return false;
        if (filters.language && item.original_language !== filters.language) return false;
        if (filters.yearFrom && Number(item.displayYear) < Number(filters.yearFrom)) return false;
        if (filters.yearTo && Number(item.displayYear) > Number(filters.yearTo)) return false;
        if (filters.genres.length) {
          const ids = (item.genres || []).map((g) => g.id);
          if (!filters.genres.every((gId) => ids.includes(gId))) return false;
        }
        return true;
      });

      // Verify cast/director on prestige items if selected
      if (filters.cast.length || filters.directors.length) {
        const detailed = await Promise.all(items.map((it) => fetchDetails('movie', it.id)));
        items = detailed.filter((d) => {
          const castIds = (d.credits?.cast || []).map((c) => c.id);
          const dirIds = (d.credits?.crew || [])
            .filter((c) => c.job === 'Director')
            .map((c) => c.id);
          const castOk = filters.cast.every((p) => castIds.includes(p.id));
          const dirOk = filters.directors.every((p) => dirIds.includes(p.id));
          return castOk && dirOk;
        });
      }

      return { results: sortItems(items, filters.sort), total_pages: 1, total_results: items.length };
    }

    const isTv = filters.format === 'tv';
    const mediaType = isTv ? 'tv' : 'movie';
    const params = {
      page,
      include_adult: false,
      'vote_count.gte': filters.minImdb >= 7 ? 250 : 60
    };

    // Map UI sort to TMDB discover sort
    if (filters.sort === 'imdb.desc' || filters.sort === 'letterboxd.desc') {
      params.sort_by = 'vote_average.desc';
      params['vote_count.gte'] = 400;
    } else if (filters.sort === 'primary_release_date.desc') {
      params.sort_by = isTv ? 'first_air_date.desc' : 'primary_release_date.desc';
    } else if (filters.sort === 'primary_release_date.asc') {
      params.sort_by = isTv ? 'first_air_date.asc' : 'primary_release_date.asc';
    } else {
      params.sort_by = 'popularity.desc';
    }

    // Format presets (Anime / Documentary)
    const genreIds = new Set(
      filters.genres.map((gId) => {
        if (!isTv) return gId;
        const found = CFG.GENRES.find((g) => g.id === gId);
        return found?.tvId || gId;
      })
    );
    if (filters.format === 'anime') {
      genreIds.add(16);
      params.with_original_language = 'ja';
    } else if (filters.format === 'documentary') {
      genreIds.add(99);
    }

    if (genreIds.size) params.with_genres = [...genreIds].join(',');
    if (filters.language) params.with_original_language = filters.language;

    // Ratings thresholds
    const minScore = Math.max(
      Number(filters.minImdb || 0),
      filters.minLetterboxd ? Number(filters.minLetterboxd) * 2 : 0
    );
    if (minScore > 0) params['vote_average.gte'] = minScore.toFixed(1);

    // Cast & Directors
    if (!isTv) {
      if (filters.cast.length) params.with_cast = filters.cast.map((p) => p.id).join(',');
      if (filters.directors.length) params.with_crew = filters.directors.map((p) => p.id).join(',');
    } else if (filters.cast.length || filters.directors.length) {
      // TV discover doesn't support with_cast natively; fetch via person combined_credits
      const personId = (filters.cast[0] || filters.directors[0]).id;
      const credits = await tmdbFetch(`/person/${personId}/tv_credits`);
      const list = [...(credits.cast || []), ...(credits.crew || [])]
        .filter((v, idx, arr) => arr.findIndex((x) => x.id === v.id) === idx)
        .map((i) => enrichMediaItem(i, 'tv'));
      return { results: sortItems(list, filters.sort), total_pages: 1, total_results: list.length };
    }

    // Studios & Networks
    const companies = filters.studios.filter((s) => !s.isNetwork).map((s) => s.id);
    const networks = filters.studios.filter((s) => s.isNetwork).map((s) => s.id);
    if (companies.length) params.with_companies = companies.join('|');
    if (networks.length && isTv) params.with_networks = networks.join('|');

    // Era / Year range
    if (filters.yearFrom) {
      params[isTv ? 'first_air_date.gte' : 'primary_release_date.gte'] = `${filters.yearFrom}-01-01`;
    }
    if (filters.yearTo) {
      params[isTv ? 'first_air_date.lte' : 'primary_release_date.lte'] = `${filters.yearTo}-12-31`;
    }

    // Runtime & Streaming
    if (filters.maxRuntime && filters.maxRuntime < 240) {
      params['with_runtime.lte'] = filters.maxRuntime;
    }
    if (filters.providers.length) {
      params.with_watch_providers = filters.providers.join('|');
      params.watch_region = 'US';
    }

    const data = await tmdbFetch(`/discover/${mediaType}`, params);
    const results = (data.results || []).map((i) => enrichMediaItem(i, mediaType));
    return {
      results: sortItems(results, filters.sort),
      total_pages: Math.min(data.total_pages || 1, 20),
      total_results: data.total_results || results.length
    };
  }

  function sortItems(items, sortMode) {
    const copy = [...items];
    if (sortMode === 'imdb.desc') return copy.sort((a, b) => (b.imdbScore || 0) - (a.imdbScore || 0));
    if (sortMode === 'letterboxd.desc') return copy.sort((a, b) => (b.letterboxdScore || 0) - (a.letterboxdScore || 0));
    if (sortMode === 'primary_release_date.desc') return copy.sort((a, b) => Number(b.displayYear || 0) - Number(a.displayYear || 0));
    if (sortMode === 'primary_release_date.asc') return copy.sort((a, b) => Number(a.displayYear || 9999) - Number(b.displayYear || 9999));
    return copy;
  }

  /* ---------- Google Gemini Search Grounding (AI Discovery & Verified Awards) ---------- */
  async function geminiGroundedJson(promptText, cacheKey) {
    const geminiKey = getGeminiKey();
    if (!geminiKey) return null;

    if (cacheKey) {
      const cached = readCache(cacheKey);
      if (cached) return cached;
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${CFG.GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2 }
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) return null;
    const payload = await res.json();
    const rawText = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n') || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (cacheKey) writeCache(cacheKey, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  async function aiNaturalLanguageDiscover(userPrompt) {
    const prompt = `You are a film archivist. Using Google Search to verify facts, return a JSON array of up to 10 exact movie or TV series recommendations matching: "${userPrompt}".
Return ONLY valid JSON with objects containing: {"title": string, "year": number, "media_type": "movie" | "tv", "reason": string}.`;

    const recs = await geminiGroundedJson(prompt, `ai_discover_${userPrompt.toLowerCase()}`);
    if (!Array.isArray(recs) || !recs.length) return null;

    const resolved = [];
    for (const rec of recs.slice(0, 10)) {
      try {
        const search = await tmdbFetch(`/search/${rec.media_type === 'tv' ? 'tv' : 'movie'}`, {
          query: rec.title,
          year: rec.media_type === 'tv' ? undefined : rec.year
        });
        const match = (search.results || [])[0];
        if (match) {
          resolved.push({
            ...enrichMediaItem(match, rec.media_type === 'tv' ? 'tv' : 'movie'),
            aiReason: rec.reason || ''
          });
        }
      } catch {
        // skip unmatched
      }
    }
    return resolved;
  }

  async function verifyTitlePrestige(title, year, mediaType) {
    const prompt = `Verify the exact IMDb rating (out of 10), Letterboxd rating (out of 5), and major awards won (Oscars, Emmys, Golden Globes, Cannes, BAFTA) for the ${mediaType} "${title}" (${year}).
Return ONLY JSON: {"imdb": number|null, "letterboxd": number|null, "awardsSummary": string}`;
    return geminiGroundedJson(prompt, `verify_${mediaType}_${title}_${year}`);
  }

  /* ---------- Error-153-Free YouTube Trailer Builder ---------- */
  function extractYouTubeVideos(details) {
    const list = details?.videos?.results || [];
    const yt = list.filter((v) => v.site === 'YouTube' && v.key);
    const rank = (v) => {
      if (v.type === 'Trailer' && v.official) return 0;
      if (v.type === 'Trailer') return 1;
      if (v.type === 'Teaser') return 2;
      return 3;
    };
    return yt.sort((a, b) => rank(a) - rank(b));
  }

  // Fixes YouTube Error 153 by using youtube-nocookie.com + strict-origin-when-cross-origin referrer policy
  function buildSafeTrailerIframe(youtubeKey, title) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeKey)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
    iframe.title = `${title} — Official Trailer`;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    return iframe;
  }

  return {
    getTmdbKey,
    getGeminiKey,
    hasTmdbKey,
    clearCache,
    fetchCollection,
    fetchHeroSpotlight,
    fetchDetails,
    searchMulti,
    searchPerson,
    searchCompany,
    discoverWithFilters,
    aiNaturalLanguageDiscover,
    verifyTitlePrestige,
    extractYouTubeVideos,
    buildSafeTrailerIframe
  };
})();
