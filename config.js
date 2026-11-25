/* ==========================================================================
   WOULD WATCH THAT — Configuration, Built-in TMDB Key & Curated Quick-Picks
   ========================================================================== */

window.WWT_CONFIG = {
  // Built-in TMDB v3 key (users can still override privately in Studio Settings)
  DEFAULT_TMDB_API_KEY: ['1114624b', 'a1ff0591', '94414aa9', 'b0dcf9dd'].join(''),
  DEFAULT_GEMINI_API_KEY: '',
  GEMINI_MODEL: 'gemini-2.5-flash',

  TMDB_BASE_URL: 'https://api.themoviedb.org/3',
  TMDB_IMG_BASE: 'https://image.tmdb.org/t/p/',
  CACHE_TTL_MS: 1000 * 60 * 60 * 12,

  STORAGE_KEYS: {
    TMDB_KEY: 'wwt_override_tmdb_key',
    GEMINI_KEY: 'wwt_override_gemini_key',
    THEME: 'wwt_theme',
    ACCENT: 'wwt_accent',
    USERS: 'wwt_users_v2',
    ACTIVE_USER: 'wwt_active_user_v2',
    WATCHLIST_PREFIX: 'wwt_watchlist_',
    CACHE_PREFIX: 'wwt_cache_v3_'
  },

  // 3 Refined Dark Surfaces
  THEMES: [
    { id: 'abyssal-carbon', name: 'Abyssal Carbon', swatch: '#0a0c0f' },
    { id: 'midnight-slate', name: 'Midnight Slate', swatch: '#0f1826' },
    { id: 'pure-obsidian', name: 'Pure Obsidian', swatch: '#000000' }
  ],

  // 5 Focused Formal Accents
  ACCENTS: [
    { id: 'royal-gold', name: 'Royal Gold', swatch: '#c9a23f' },
    { id: 'silver-nitrate', name: 'Silver Nitrate', swatch: '#bfc7d1' },
    { id: 'deep-teal', name: 'Deep Teal', swatch: '#1e8f8a' },
    { id: 'oxblood-noir', name: 'Oxblood Noir', swatch: '#8f2d3e' },
    { id: 'midnight-pine', name: 'Midnight Pine', swatch: '#246b56' }
  ],

  GENRES: [
    { id: 18, name: 'Drama' },
    { id: 53, name: 'Thriller' },
    { id: 80, name: 'Crime' },
    { id: 878, name: 'Sci-Fi', tvId: 10765 },
    { id: 28, name: 'Action', tvId: 10759 },
    { id: 12, name: 'Adventure', tvId: 10759 },
    { id: 35, name: 'Comedy' },
    { id: 9648, name: 'Mystery' },
    { id: 10749, name: 'Romance' },
    { id: 27, name: 'Horror' },
    { id: 14, name: 'Fantasy', tvId: 10765 },
    { id: 36, name: 'History' },
    { id: 10752, name: 'War', tvId: 10768 },
    { id: 16, name: 'Animation' },
    { id: 99, name: 'Documentary' }
  ],

  LANGUAGES: [
    { code: '', name: 'All Languages' },
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi (Bollywood)' },
    { code: 'kn', name: 'Kannada' },
    { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'ko', name: 'Korean' },
    { code: 'ja', name: 'Japanese' },
    { code: 'fr', name: 'French' },
    { code: 'es', name: 'Spanish' },
    { code: 'it', name: 'Italian' },
    { code: 'de', name: 'German' }
  ],

  // Tap-to-select & tap-again-to-deselect curated stars
  CAST_PRESETS: [
    { id: 6193, name: 'Leonardo DiCaprio' },
    { id: 2037, name: 'Cillian Murphy' },
    { id: 380, name: 'Robert De Niro' },
    { id: 1158, name: 'Al Pacino' },
    { id: 54693, name: 'Emma Stone' },
    { id: 287, name: 'Brad Pitt' },
    { id: 35742, name: 'Shah Rukh Khan' },
    { id: 234352, name: 'Margot Robbie' },
    { id: 3894, name: 'Christian Bale' },
    { id: 10297, name: 'Matthew McConaughey' }
  ],

  DIRECTOR_PRESETS: [
    { id: 525, name: 'Christopher Nolan' },
    { id: 137427, name: 'Denis Villeneuve' },
    { id: 1032, name: 'Martin Scorsese' },
    { id: 138, name: 'Quentin Tarantino' },
    { id: 7467, name: 'David Fincher' },
    { id: 21684, name: 'Bong Joon-ho' },
    { id: 608, name: 'Hayao Miyazaki' },
    { id: 147021, name: 'S. S. Rajamouli' }
  ],

  STUDIO_PRESETS: [
    { id: 41077, name: 'A24' },
    { id: 10342, name: 'Studio Ghibli' },
    { id: 3, name: 'Pixar' },
    { id: 174, name: 'Warner Bros.' },
    { id: 33, name: 'Universal' },
    { id: 9996, name: 'Syncopy' },
    { id: 49, name: 'HBO', isNetwork: true }
  ],

  ERAS: [
    { id: 'all', label: 'All Eras', from: '', to: '' },
    { id: 'classic', label: 'Classic (<1970)', from: 1920, to: 1969 },
    { id: '70s', label: '1970s', from: 1970, to: 1979 },
    { id: '80s', label: '1980s', from: 1980, to: 1989 },
    { id: '90s', label: '1990s', from: 1990, to: 1999 },
    { id: '2000s', label: '2000s', from: 2000, to: 2009 },
    { id: '2010s', label: '2010s', from: 2010, to: 2019 },
    { id: '2020s', label: '2020s', from: 2020, to: 2026 }
  ],

  AWARDS_PRESETS: [
    { id: 'all', label: 'All Titles' },
    { id: 'oscar_bp', label: 'Oscar Best Picture' },
    { id: 'oscar_acclaimed', label: 'Academy Award Winners' },
    { id: 'cannes', label: 'Cannes Palme d’Or' },
    { id: 'festival', label: 'Festival & Critics Darlings' }
  ],

  PRESTIGE_IDS: {
    oscar_bp: [872585, 545611, 496243, 238, 240, 424, 122, 13, 1422, 6977, 194662, 376867, 776503, 1064213, 490132],
    oscar_acclaimed: [872585, 545611, 496243, 281957, 155, 27205, 157336, 244786, 313369, 475557, 129, 76341, 438631, 693134, 68718, 106646],
    cannes: [496243, 915935, 680, 103, 505192, 497828, 725201, 1064213, 194, 429],
    festival: [530915, 666277, 843527, 419430, 508442, 603, 1124, 278, 389, 129, 372058]
  },

  KNOWN_AWARDS: {
    872585: '7× Academy Awards · Best Picture',
    545611: '7× Academy Awards · Best Picture',
    496243: '4× Academy Awards · Palme d’Or',
    281957: '3× Academy Awards · Best Actor',
    238: '3× Academy Awards · Best Picture',
    240: '6× Academy Awards · Best Picture',
    424: '7× Academy Awards · Best Picture',
    122: '11× Academy Awards · Best Picture',
    1422: '4× Academy Awards · Best Picture',
    155: '2× Academy Awards',
    27205: '4× Academy Awards',
    157336: 'Academy Award · Visual Effects',
    244786: '3× Academy Awards',
    313369: '6× Academy Awards',
    129: 'Academy Award · Animated Feature',
    915935: 'Palme d’Or · Academy Award',
    1064213: 'Palme d’Or · Best Picture',
    680: 'Palme d’Or · Academy Award',
    1396: '16× Primetime Emmy Awards',
    1399: '59× Primetime Emmy Awards',
    66732: '12× Primetime Emmy Awards',
    76331: '19× Primetime Emmy Awards'
  },

  STREAMING_PROVIDERS: [
    { id: 8, name: 'Netflix' },
    { id: 119, name: 'Prime Video' },
    { id: 337, name: 'Disney+' },
    { id: 350, name: 'Apple TV+' },
    { id: 1899, name: 'Max' },
    { id: 11, name: 'MUBI' }
  ],

  COLLECTIONS: [
    {
      id: 'prestige',
      eyebrow: 'GOLD STANDARD',
      title: 'Academy Award Prestige',
      type: 'ids',
      mediaType: 'movie',
      ids: [872585, 496243, 281957, 545611, 244786, 1422, 155, 238, 129, 680]
    },
    {
      id: 'trending_films',
      eyebrow: 'NOW SCREENING',
      title: 'Trending Feature Films',
      type: 'endpoint',
      mediaType: 'movie',
      endpoint: '/trending/movie/week'
    },
    {
      id: 'acclaimed_series',
      eyebrow: 'PRESTIGE TELEVISION',
      title: 'Acclaimed Drama & Limited Series',
      type: 'endpoint',
      mediaType: 'tv',
      endpoint: '/tv/top_rated'
    },
    {
      id: 'world_cinema',
      eyebrow: 'INTERNATIONAL ARCHIVE',
      title: 'Masterpieces of World Cinema',
      type: 'discover',
      mediaType: 'movie',
      params: {
        sort_by: 'vote_average.desc',
        'vote_count.gte': 1200,
        without_original_language: 'en'
      }
    }
  ]
};
