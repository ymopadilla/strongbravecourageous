/* Strong. Brave. Courageous. — Stories search (Algolia InstantSearch.js)
   Progressive enhancement: the Stories page ships with all cards already in the HTML.
   When Algolia loads, this script takes over the grid; if anything fails, the static
   category buttons in main.js keep working. */
(function () {
  var app = document.getElementById('search-app');
  if (!app || !window.algoliasearch || !window.instantsearch) return;
  var appId = app.getAttribute('data-app-id');
  var searchKey = app.getAttribute('data-search-key');
  var indexName = app.getAttribute('data-index') || 'stories';
  if (!appId || !searchKey) return;

  var grid = document.getElementById('story-grid');
  var input = document.getElementById('search-input');
  var clearBtn = document.getElementById('search-clear');
  var catButtons = document.querySelectorAll('#category-filters .filter-btn');
  var dateWrap = document.getElementById('date-filters');
  var dateFrom = document.getElementById('date-from');
  var dateTo = document.getElementById('date-to');
  var dateClear = document.getElementById('date-clear');
  var stats = document.getElementById('search-stats');
  var moreWrap = document.getElementById('search-more');
  var moreBtn = document.getElementById('search-more-btn');
  var note = document.getElementById('search-note');
  var emptyNote = document.getElementById('empty-note');
  var CATS = { grief: 'Grief', healing: 'Healing', faith: 'Faith', perseverance: 'Perseverance' };

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

  var card = function (hit) {
    var cat = CATS[slug(hit.category)] ? hit.category : 'Healing';
    var cs = slug(cat);
    return '<article class="card" data-category="' + cs + '">' +
      '<div class="meta"><time datetime="' + esc(hit.date) + '">' + esc(fmtDate(hit.date)) + '</time>' +
      '<span class="tag tag-' + cs + '">' + esc(cat) + '</span></div>' +
      '<h3><a href="' + esc(hit.url) + '">' + hl(hit, 'title') + '</a></h3>' +
      '<p class="excerpt">' + snip(hit) + '</p>' +
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

  // Category pills → refinementList on "category"
  var refinement = connectors.connectRefinementList(function (opts, isFirst) {
    if (isFirst) {
      catButtons.forEach(function (b) {
        b.addEventListener('click', function () {
          var f = b.getAttribute('data-filter');
          var current = opts.items.filter(function (i) { return i.isRefined; }).map(function (i) { return i.value; });
          current.forEach(function (v) { opts.refine(v); }); // clear all
          if (f !== 'all') opts.refine(CATS[f]);
        });
      });
    }
    var active = opts.items.filter(function (i) { return i.isRefined; }).map(function (i) { return slug(i.value); });
    catButtons.forEach(function (b) {
      var f = b.getAttribute('data-filter');
      b.setAttribute('aria-pressed', (f === 'all' ? active.length === 0 : active.indexOf(f) !== -1) ? 'true' : 'false');
    });
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

  // Hits → cards in the existing grid
  var hits = connectors.connectInfiniteHits(function (opts) {
    var q = input.value.trim();
    if (!opts.results) return;
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
    if (!opts.nbHits && !input.value.trim()) { stats.textContent = ''; return; }
    var n = opts.nbHits;
    stats.innerHTML = '<mark>' + n + '</mark> stor' + (n === 1 ? 'y' : 'ies') + (input.value.trim() ? ' for “' + esc(input.value.trim()) + '”' : '');
  });

  search.addWidgets([
    is.widgets.configure({ hitsPerPage: 12, attributesToSnippet: ['body:30'], snippetEllipsisText: '…' }),
    searchBox({}),
    refinement({ attribute: 'category', operator: 'or', limit: 10 }),
    range({ attribute: 'date_ts' }),
    hits({}),
    statsW({}),
  ]);

  search.on('error', function () { /* keep the static grid; static filters remain usable */ });
  search.start();
  note.hidden = false;

  // Deep link: /stories.html#grief
  var hash = (location.hash || '').replace('#', '').toLowerCase();
  if (CATS[hash]) {
    var b = document.querySelector('#category-filters .filter-btn[data-filter="' + hash + '"]');
    if (b) setTimeout(function () { b.click(); }, 50);
  }
})();
