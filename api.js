/* ==========================================================================
   WOULD WATCH THAT — API Client, Native AND/OR Filter Queries & Strict Sorter
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

  /* ---------- Cache ---------- */
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

  /* ---------- Distinct IMDb vs Letterboxd Calibration ---------- */
  function enrichMediaItem(item, forcedType) {
    const mediaType = forcedType || item.media_type || (item.first_air_date ? 'tv' : 'movie');
    const title = item.title || item.name || 'Untitled';
    const date = item.release_date || item.first_air_date || '';
    const year = date ? date.slice(0, 4) : '—';
    const rawVote = Number(item.vote_average || 0);
    const voteCount = Number(item.vote_count || 0);
    const hasReliableRating = rawVote > 0 && voteCount >= 20;

    const verifiedCache = readCache(`verify_${mediaType}_${title}_${year}`);
    let imdbScore = verifiedCache?.imdb ?? null;
    let letterboxdScore = verifiedCache?.letterboxd ?? null;

    if (hasReliableRating) {
      if (imdbScore === null) {
        const m = 450;
        const prior = 6.6;
        const weighted = (voteCount / (voteCount + m)) * rawVote + (m / (voteCount + m)) * prior;
        imdbScore = Number(Math.min(9.5, Math.max(1.5, weighted + 0.15)).toFixed(1));
      }

      if (letterboxdScore === null) {
        const genreIds = item.genre_ids || (item.genres || []).map((g) => g.id);
        const prestigeLift =
          (CFG.KNOWN_AWARDS[item.id] ? 0.22 : 0) +
          (item.original_language && item.original_language !== 'en' ? 0.14 : 0) +
          (genreIds.includes(18) || genreIds.includes(9648) || genreIds.includes(36) ? 0.08 : 0) -
          (genreIds.includes(28) && rawVote < 7.2 ? 0.12 : 0);
        const baseLb = (rawVote / 2) - 0.12 + prestigeLift;
        letterboxdScore = Number(Math.min(4.7, Math.max(1.0, baseLb)).toFixed(1));
      }
    }

    return {
      ...item,
      media_type: mediaType,
      displayTitle: title,
      displayYear: year,
      releaseTimestamp: date ? Date.parse(date) || 0 : 0,
      posterUrl: item.poster_path ? `${CFG.TMDB_IMG_BASE}w500${item.poster_path}` : '',
      backdropUrl: item.backdrop_path ? `${CFG.TMDB_IMG_BASE}w1280${item.backdrop_path}` : '',
      voteCount,
      imdbScore,
      letterboxdScore,
      hasImdb: typeof imdbScore === 'number' && imdbScore > 0,
      hasLetterboxd: typeof letterboxdScore === 'number' && letterboxdScore > 0,
      awardBadge: verifiedCache?.awardsSummary || item.awardBadge || CFG.KNOWN_AWARDS[item.id] || ''
    };
  }

  /* ---------- Proper Universal Sorter (Excludes Unrated on Rating Sorts) ---------- */
  function sortAndSanitize(items, sortMode) {
    let list = [...items];

    if (sortMode === 'imdb.desc' || sortMode === 'imdb.asc') {
      list = list.filter((i) => i.hasImdb);
      return list.sort((a, b) =>
        sortMode === 'imdb.desc'
          ? b.imdbScore - a.imdbScore || b.voteCount - a.voteCount
          : a.imdbScore - b.imdbScore || b.voteCount - a.voteCount
      );
    }

    if (sortMode === 'letterboxd.desc' || sortMode === 'letterboxd.asc') {
      list = list.filter((i) => i.hasLetterboxd);
      return list.sort((a, b) =>
        sortMode === 'letterboxd.desc'
          ? b.letterboxdScore - a.letterboxdScore || b.voteCount - a.voteCount
          : a.letterboxdScore - b.letterboxdScore || b.voteCount - a.voteCount
      );
    }

    if (sortMode === 'release.desc') {
      return list.sort((a, b) => (b.releaseTimestamp || 0) - (a.releaseTimestamp || 0));
    }

    if (sortMode === 'release.asc') {
      return list.sort((a, b) => {
        const ta = a.releaseTimestamp || Number.MAX_SAFE_INTEGER;
        const tb = b.releaseTimestamp || Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
    }

    if (sortMode === 'title.asc') {
      return list.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
    }

    return list.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  }

  /* ---------- TMDB Fetch ---------- */
  async function tmdbFetch(path, params = {}, skipCache = false) {
    const apiKey = getTmdbKey();
    if (!apiKey) throw new Error('NO_TMDB_KEY');

    const url = new URL(`${CFG.TMDB_BASE_URL}${path}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('language', 'en-US');

    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) url.searchParams.set(k, String(v));
    });

    const cacheKey = `${path}?${url.searchParams.toString().replace(apiKey, 'KEY')}`;
    if (!skipCache) {
      const cached = readCache(cacheKey);
      if (cached) return cached;
    }

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB Error ${res.status}`);
    const data = await res.json();
    writeCache(cacheKey, data);
    return data;
  }

  async function fetchByIds(ids, mediaType = 'movie') {
    const settled = await Promise.allSettled(ids.map((id) => tmdbFetch(`/${mediaType}/${id}`)));
    return settled
      .filter((r) => r.status === 'fulfilled' && r.value?.id)
      .map((r) => enrichMediaItem(r.value, mediaType));
  }

  async function fetchCollection(collection) {
    if (collection.type === 'ids') return fetchByIds(collection.ids, collection.mediaType);
    if (collection.type === 'endpoint') {
      const data = await tmdbFetch(collection.endpoint);
      return (data.results || []).slice(0, 14).map((i) => enrichMediaItem(i, collection.mediaType));
    }
    const data = await tmdbFetch(`/discover/${collection.mediaType}`, collection.params);
    return (data.results || []).slice(0, 14).map((i) => enrichMediaItem(i, collection.mediaType));
  }

  async function fetchHeroSpotlight() {
    const trending = await tmdbFetch('/trending/all/week');
    return (trending.results || [])
      .filter((i) => (i.media_type === 'movie' || i.media_type === 'tv') && i.backdrop_path)
      .slice(0, 6)
      .map((i) => enrichMediaItem(i));
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
    return (data.results || []).slice(0, 7);
  }

  async function searchCompany(query) {
    if (!query || query.trim().length < 2) return [];
    const data = await tmdbFetch('/search/company', { query: query.trim() });
    return (data.results || []).slice(0, 7);
  }

  /* ---------- Filter Studio Discovery with AND / OR Logic ---------- */
  async function discoverWithFilters(filters, page = 1) {
    const isRatingSort = ['imdb.desc', 'imdb.asc', 'letterboxd.desc', 'letterboxd.asc'].includes(filters.sort);
    const genreSep = filters.genreLogic === 'OR' ? '|' : ',';
    const castSep = filters.castLogic === 'OR' ? '|' : ',';
    const dirSep = filters.directorLogic === 'OR' ? '|' : ',';
    const studioSep = filters.studioLogic === 'OR' ? '|' : ',';

    // Curated Prestige / Awards pools
    if (filters.awards && filters.awards !== 'all' && page === 1 && filters.format === 'movie') {
      const poolIds = CFG.PRESTIGE_IDS[filters.awards] || [];
      let items = await fetchByIds(poolIds, 'movie');
      items = applyLocalFilters(items, filters);

      if (filters.cast.length || filters.directors.length) {
        const detailed = await Promise.all(items.map((it) => fetchDetails('movie', it.id)));
        items = detailed.filter((d) => {
          const castIds = (d.credits?.cast || []).map((c) => c.id);
          const dirIds = (d.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.id);

          const castOk = !filters.cast.length
            ? true
            : filters.castLogic === 'OR'
            ? filters.cast.some((p) => castIds.includes(p.id))
            : filters.cast.every((p) => castIds.includes(p.id));

          const dirOk = !filters.directors.length
            ? true
            : filters.directorLogic === 'OR'
            ? filters.directors.some((p) => dirIds.includes(p.id))
            : filters.directors.every((p) => dirIds.includes(p.id));

          return castOk && dirOk;
        });
      }

      const sorted = sortAndSanitize(items, filters.sort);
      return { results: sorted, total_pages: 1, total_results: sorted.length };
    }

    const isTv = filters.format === 'tv';
    const mediaType = isTv ? 'tv' : 'movie';
    const params = { page, include_adult: false };

    if (filters.sort === 'imdb.desc' || filters.sort === 'letterboxd.desc') {
      params.sort_by = 'vote_average.desc';
      params['vote_count.gte'] = isTv ? 180 : 350;
      params['vote_average.gte'] = 0.5;
    } else if (filters.sort === 'imdb.asc' || filters.sort === 'letterboxd.asc') {
      params.sort_by = 'vote_average.asc';
      params['vote_count.gte'] = isTv ? 120 : 250;
      params['vote_average.gte'] = 0.5;
    } else if (filters.sort === 'release.desc') {
      params.sort_by = isTv ? 'first_air_date.desc' : 'primary_release_date.desc';
      params[isTv ? 'first_air_date.lte' : 'primary_release_date.lte'] = new Date().toISOString().slice(0, 10);
      params['vote_count.gte'] = 10;
    } else if (filters.sort === 'release.asc') {
      params.sort_by = isTv ? 'first_air_date.asc' : 'primary_release_date.asc';
      params[isTv ? 'first_air_date.gte' : 'primary_release_date.gte'] = '1920-01-01';
      params['vote_count.gte'] = 25;
    } else if (filters.sort === 'title.asc') {
      params.sort_by = isTv ? 'name.asc' : 'original_title.asc';
      params['vote_count.gte'] = 30;
    } else {
      params.sort_by = 'popularity.desc';
      params['vote_count.gte'] = filters.minImdb > 0 || filters.minLetterboxd > 0 ? 50 : 10;
    }

    // Format + Genre AND / OR handling
    const mappedGenres = filters.genres.map((gId) => {
      if (!isTv) return gId;
      const found = CFG.GENRES.find((g) => g.id === gId);
      return found?.tvId || gId;
    });

    let postFilterOrGenres = false;
    if (filters.format === 'anime') {
      params.with_original_language = 'ja';
      if (mappedGenres.length && filters.genreLogic === 'OR') {
        params.with_genres = '16';
        postFilterOrGenres = true;
      } else {
        params.with_genres = [...new Set([16, ...mappedGenres])].join(',');
      }
    } else if (filters.format === 'documentary') {
      if (mappedGenres.length && filters.genreLogic === 'OR') {
        params.with_genres = '99';
        postFilterOrGenres = true;
      } else {
        params.with_genres = [...new Set([99, ...mappedGenres])].join(',');
      }
    } else if (mappedGenres.length) {
      params.with_genres = [...new Set(mappedGenres)].join(genreSep);
    }

    if (filters.language) params.with_original_language = filters.language;

    const minTmdbFloor = Math.max(
      filters.minImdb > 0 ? Math.max(0, filters.minImdb - 0.3) : 0,
      filters.minLetterboxd > 0 ? Math.max(0, filters.minLetterboxd * 2 - 0.4) : 0
    );
    if (minTmdbFloor > 0) {
      params['vote_average.gte'] = minTmdbFloor.toFixed(1);
      params['vote_count.gte'] = Math.max(params['vote_count.gte'] || 0, 35);
    }

    // Cast & Directors with AND / OR
    if (!isTv) {
      if (filters.cast.length) params.with_cast = filters.cast.map((p) => p.id).join(castSep);
      if (filters.directors.length) params.with_crew = filters.directors.map((p) => p.id).join(dirSep);
    } else if (filters.cast.length || filters.directors.length) {
      const tvList = await resolveTvByPeople(filters);
      const filtered = applyLocalFilters(tvList, filters);
      const sorted = sortAndSanitize(filtered, filters.sort);
      return { results: sorted, total_pages: 1, total_results: sorted.length };
    }

    // Studios & Networks with AND / OR
    const companies = filters.studios.filter((s) => !s.isNetwork).map((s) => s.id);
    const networks = filters.studios.filter((s) => s.isNetwork).map((s) => s.id);
    if (companies.length) params.with_companies = companies.join(studioSep);
    if (networks.length && isTv) params.with_networks = networks.join(studioSep);

    // Era / Year
    if (filters.yearFrom) params[isTv ? 'first_air_date.gte' : 'primary_release_date.gte'] = `${filters.yearFrom}-01-01`;
    if (filters.yearTo) params[isTv ? 'first_air_date.lte' : 'primary_release_date.lte'] = `${filters.yearTo}-12-31`;

    // Runtime & Streaming
    if (filters.maxRuntime && filters.maxRuntime < 240) params['with_runtime.lte'] = filters.maxRuntime;
    if (filters.providers.length) {
      params.with_watch_providers = filters.providers.join('|');
      params.watch_region = 'US';
    }

    let data = await tmdbFetch(`/discover/${mediaType}`, params);

    if (isRatingSort && (data.results || []).length < 5 && (params['vote_count.gte'] || 0) > 25) {
      params['vote_count.gte'] = 25;
      data = await tmdbFetch(`/discover/${mediaType}`, params);
    }

    let results = (data.results || []).map((i) => enrichMediaItem(i, mediaType));
    if (postFilterOrGenres) {
      results = results.filter((it) => {
        const gIds = it.genre_ids || [];
        return mappedGenres.some((g) => gIds.includes(g));
      });
    }
    results = applyLocalFilters(results, filters);
    results = sortAndSanitize(results, filters.sort);

    return {
      results,
      total_pages: Math.min(data.total_pages || 1, 20),
      total_results: data.total_results || results.length
    };
  }

  async function resolveTvByPeople(filters) {
    const fetchSet = async (people, roleKey) => {
      if (!people.length) return null;
      const responses = await Promise.all(people.slice(0, 4).map((p) => tmdbFetch(`/person/${p.id}/tv_credits`)));
      const maps = responses.map((r) => {
        const m = new Map();
        (r[roleKey] || []).forEach((show) => m.set(show.id, show));
        return m;
      });
      const logic = roleKey === 'cast' ? filters.castLogic : filters.directorLogic;
      if (logic === 'AND') {
        const first = maps[0];
        const out = new Map();
        first.forEach((show, id) => {
          if (maps.every((m) => m.has(id))) out.set(id, show);
        });
        return out;
      }
      const union = new Map();
      maps.forEach((m) => m.forEach((show, id) => union.set(id, show)));
      return union;
    };

    const castMap = await fetchSet(filters.cast, 'cast');
    const crewMap = await fetchSet(filters.directors, 'crew');

    let combined = new Map();
    if (castMap && crewMap) {
      castMap.forEach((show, id) => {
        if (crewMap.has(id)) combined.set(id, show);
      });
    } else {
      combined = castMap || crewMap || new Map();
    }
    return [...combined.values()].map((s) => enrichMediaItem(s, 'tv'));
  }

  function applyLocalFilters(items, filters) {
    return items.filter((item) => {
      if (filters.minImdb > 0 && (!item.hasImdb || item.imdbScore < filters.minImdb)) return false;
      if (filters.minLetterboxd > 0 && (!item.hasLetterboxd || item.letterboxdScore < filters.minLetterboxd)) return false;
      if (filters.language && item.original_language !== filters.language) return false;
      if (filters.yearFrom && Number(item.displayYear) < Number(filters.yearFrom)) return false;
      if (filters.yearTo && Number(item.displayYear) > Number(filters.yearTo)) return false;
      if (filters.genres.length && (item.genres || item.genre_ids)) {
        const ids = item.genres ? item.genres.map((g) => g.id) : item.genre_ids;
        const ok =
          filters.genreLogic === 'OR'
            ? filters.genres.some((gId) => ids.includes(gId))
            : filters.genres.every((gId) => ids.includes(gId));
        if (!ok) return false;
      }
      return true;
    });
  }

  /* ---------- Google Gemini Search Grounding ---------- */
  async function geminiGroundedJson(promptText, cacheKey) {
    const geminiKey = getGeminiKey();
    if (!geminiKey) return null;

    if (cacheKey) {
      const cached = readCache(cacheKey);
      if (cached) return cached;
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${CFG.GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2 }
      })
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
        // skip
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
    const rank = (v) => (v.type === 'Trailer' && v.official ? 0 : v.type === 'Trailer' ? 1 : v.type === 'Teaser' ? 2 : 3);
    return yt.sort((a, b) => rank(a) - rank(b));
  }

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
    sortAndSanitize,
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
