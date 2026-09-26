/* Strong. Brave. Courageous. — Stories search (Algolia InstantSearch.js)
   Progressive enhancement: the Stories page ships with every story already in the HTML,
   grouped by year. When Algolia loads, this script takes over the pills, search box, and
   date range. Any active search text, category pill, scripture pill, or date range swaps
   the year view for one flat list (newest first); clearing everything restores the year view.
   If Algolia fails, the static pills in main.js keep working. */
(function () {
  var app = document.getElementById('search-app');
  if (!app || !window.algoliasearch || !window.instantsearch) return;
  var appId = app.getAttribute('data-app-id');
  var searchKey = app.getAttribute('data-search-key');
  var indexName = app.getAttribute('data-index') || 'stories';
  if (!appId || !searchKey) return;

  var years = document.getElementById('story-years');
  var grid = document.getElementById('story-grid');
  var input = document.getElementById('search-input');
  var clearBtn = document.getElementById('search-clear');
  var catButtons = document.querySelectorAll('#category-filters .filter-btn');
  var bookButtons = document.querySelectorAll('#scripture-filters .filter-btn');
  var dateWrap = document.getElementById('date-filters');
  var dateFrom = document.getElementById('date-from');
  var dateTo = document.getElementById('date-to');
  var dateClear = document.getElementById('date-clear');
  var stats = document.getElementById('search-stats');
  var moreWrap = document.getElementById('search-more');
  var moreBtn = document.getElementById('search-more-btn');
  var note = document.getElementById('search-note');
  var emptyNote = document.getElementById('empty-note');

  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var slug = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); };
  var fmtDate = function (iso) {
    if (!iso) return '';
    var d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    return isNaN(d) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };
  var hl = function (hit, attr) {
    var h = hit._highlightResult && hit._highlightResult[attr];
    return h && h.value ? h.value : esc(hit[attr]);
  };
  var snip = function (hit) {
    var s = hit._snippetResult && hit._snippetResult.body;
    if (input.value.trim() && s && s.matchLevel !== 'none') return s.value + '…';
    return hl(hit, 'excerpt');
  };
  var gateway = function (ref) {
    return 'https://www.biblegateway.com/passage/?search=' + encodeURIComponent(String(ref).replace(/[–—]/g, '-')) + '&version=' + (app.getAttribute('data-bible') || 'NIV');
  };
  var BOOK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';

  var card = function (hit) {
    var cats = Array.isArray(hit.categories) ? hit.categories : (hit.category ? [hit.category] : ['Healing']);
    var refs = Array.isArray(hit.scriptures) ? hit.scriptures : [];
    var books = Array.isArray(hit.scripture_books) ? hit.scripture_books : [];
    return '<article class="card" data-categories="' + esc(cats.map(slug).join(' ')) + '" data-books="' + esc(books.map(slug).join(' ')) + '">' +
      '<div class="meta"><time datetime="' + esc(hit.date) + '">' + esc(fmtDate(hit.date)) + '</time>' +
      cats.map(function (c) { return '<span class="tag tag-' + slug(c) + '">' + esc(c) + '</span>'; }).join('') + '</div>' +
      '<h3><a href="' + esc(hit.url) + '">' + hl(hit, 'title') + '</a></h3>' +
      '<p class="excerpt">' + snip(hit) + '</p>' +
      (refs.length ? '<div class="verse-chips">' + refs.map(function (r) { return '<a class="verse-chip" href="' + gateway(r) + '" target="_blank" rel="noopener">' + BOOK_ICON + esc(r) + '</a>'; }).join('') + '</div>' : '') +
      '<a class="more" href="' + esc(hit.url) + '">Read the story &rarr;</a></article>';
  };

  var client = window.algoliasearch(appId, searchKey);
  var search = window.instantsearch({
    indexName: indexName,
    searchClient: client,
    future: { preserveSharedStateOnUnmount: true },
    routing: false,
  });
  var is = window.instantsearch;
  var connectors = is.connectors;

  /* Is anything narrowing the list? Read straight from the helper state so every widget agrees. */
  var isRefined = function () {
    var st = search.helper && search.helper.state;
    if (!st) return false;
    if ((st.query || '').trim()) return true;
    var d = st.disjunctiveFacetsRefinements || {};
    for (var k in d) if (d[k] && d[k].length) return true;
    var n = st.numericRefinements || {};
    for (var a in n) for (var op in n[a]) if (n[a][op] && n[a][op].length) return true;
    return false;
  };
  var showYears = function () { years.hidden = false; grid.hidden = true; grid.innerHTML = ''; moreWrap.hidden = true; if (emptyNote) emptyNote.style.display = 'none'; };

  // Search box → our own input
  var searchBox = connectors.connectSearchBox(function (opts, isFirst) {
    if (isFirst) {
      var t;
      input.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () { opts.refine(input.value); }, 120);
        clearBtn.hidden = !input.value;
      });
      clearBtn.addEventListener('click', function () { input.value = ''; clearBtn.hidden = true; opts.refine(''); input.focus(); });
    }
  });

  /* Pills → refinementList (OR). Each pill toggles; "All" clears every pill (categories + scripture).
     Render params are re-read on every render (latestCat / latestBook) so clicks never act on stale items. */
  var latestCat = null, latestBook = null;
  var clearAll = function (params) {
    if (!params) return;
    params.items.filter(function (i) { return i.isRefined; }).forEach(function (i) { params.refine(i.value); });
  };
  var bookActive = function () { return !!(latestBook && latestBook.items.some(function (i) { return i.isRefined; })); };
  var refinement = connectors.connectRefinementList(function (opts, isFirst) {
    latestCat = opts;
    if (isFirst) {
      catButtons.forEach(function (b) {
        b.addEventListener('click', function () {
          var f = b.getAttribute('data-filter');
          if (f === 'all') { clearAll(latestCat); clearAll(latestBook); return; }
          latestCat.refine(b.textContent.trim()); // toggles the pill
        });
      });
    }
    var active = opts.items.filter(function (i) { return i.isRefined; }).map(function (i) { return slug(i.value); });
    catButtons.forEach(function (b) {
      var f = b.getAttribute('data-filter');
      b.setAttribute('aria-pressed', (f === 'all' ? active.length === 0 && !bookActive() : active.indexOf(f) !== -1) ? 'true' : 'false');
    });
  });

  var bookRefinement = connectors.connectRefinementList(function (opts, isFirst) {
    latestBook = opts;
    if (isFirst) {
      bookButtons.forEach(function (b) {
        b.addEventListener('click', function () { latestBook.refine(b.getAttribute('data-name')); });
      });
    }
    var activeBooks = opts.items.filter(function (i) { return i.isRefined; }).map(function (i) { return slug(i.value); });
    bookButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', activeBooks.indexOf(b.getAttribute('data-book')) !== -1 ? 'true' : 'false');
    });
    var all = document.querySelector('#category-filters .filter-btn[data-filter="all"]');
    if (all && activeBooks.length) all.setAttribute('aria-pressed', 'false');
  });

  // Date range → numeric range on "date_ts" (unix seconds)
  var range = connectors.connectRange(function (opts, isFirst) {
    if (isFirst) {
      dateWrap.hidden = false;
      var apply = function () {
        var lo = dateFrom.value ? Math.floor(new Date(dateFrom.value + 'T00:00:00Z').getTime() / 1000) : undefined;
        var hi = dateTo.value ? Math.floor(new Date(dateTo.value + 'T23:59:59Z').getTime() / 1000) : undefined;
        opts.refine([lo, hi]);
      };
      dateFrom.addEventListener('change', apply);
      dateTo.addEventListener('change', apply);
      dateClear.addEventListener('click', function () { dateFrom.value = ''; dateTo.value = ''; opts.refine([undefined, undefined]); });
    }
  });

  // Hits → flat list in #story-grid while refined; year view otherwise
  var hits = connectors.connectInfiniteHits(function (opts) {
    if (!opts.results) return;
    window.__sbcSearchActive = true; // Algolia answered: static fallback stands down
    if (!isRefined()) { showYears(); return; }
    var q = input.value.trim();
    years.hidden = true; grid.hidden = false;
    if (opts.items.length) {
      grid.innerHTML = opts.items.map(card).join('');
    } else {
      grid.innerHTML = '<div class="search-empty"><h3>No stories found</h3><p>' +
        (q ? 'Nothing matched “' + esc(q) + '”. Try another word, or clear the filters.' : 'No stories match these filters yet.') + '</p></div>';
    }
    if (emptyNote) emptyNote.style.display = 'none';
    moreWrap.hidden = opts.isLastPage;
    moreBtn.onclick = function () { opts.showMore(); };
  });

  var statsW = connectors.connectStats(function (opts) {
    if (!isRefined()) { stats.textContent = ''; return; }
    var n = opts.nbHits;
    stats.innerHTML = '<mark>' + n + '</mark> stor' + (n === 1 ? 'y' : 'ies') + (input.value.trim() ? ' for “' + esc(input.value.trim()) + '”' : '') + ' &middot; newest first';
  });

  var widgets = [
    is.widgets.configure({ hitsPerPage: 12, attributesToSnippet: ['body:30'], snippetEllipsisText: '…' }),
    searchBox({}),
    refinement({ attribute: 'categories', operator: 'or', limit: 10 }),
    range({ attribute: 'date_ts' }),
    hits({}),
    statsW({}),
  ];
  if (bookButtons.length) widgets.push(bookRefinement({ attribute: 'scripture_books', operator: 'or', limit: 66 }));
  search.addWidgets(widgets);

  search.on('error', function () { window.__sbcSearchActive = false; /* static year view + fallback pills remain usable */ });
  search.start();
  note.hidden = false;

  // Deep link: /stories.html#grief (or any category slug)
  var hash = (location.hash || '').replace('#', '').toLowerCase();
  if (hash) {
    var b = document.querySelector('#category-filters .filter-btn[data-filter="' + hash + '"]');
    if (b && hash !== 'all') setTimeout(function () { b.click(); }, 50);
  }
})();
