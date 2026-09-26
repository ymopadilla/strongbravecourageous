/* Strong. Brave. Courageous. — small, dependency-free helpers */
(function () {
  // Mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
  }

  /* ---------- Stories: static fallback filters (used only when Algolia search does not load) ----------
     Pills are multi-select with OR logic; "All" clears. Any active pill switches the year view to a
     flat, newest-first list. search.js replaces this when Algolia is available. */
  var years = document.getElementById('story-years');
  var grid = document.getElementById('story-grid');
  var empty = document.getElementById('empty-note');
  var catButtons = document.querySelectorAll('#category-filters .filter-btn');
  var bookButtons = document.querySelectorAll('#scripture-filters .filter-btn');
  if (years && grid && catButtons.length) {
    var cats = [], books = [];
    var has = function (attr, card, list) {
      if (!list.length) return true;
      var own = (card.getAttribute(attr) || '').split(/\s+/);
      return list.some(function (v) { return own.indexOf(v) !== -1; });
    };
    var paint = function () {
      catButtons.forEach(function (b) {
        var f = b.getAttribute('data-filter');
        b.setAttribute('aria-pressed', (f === 'all' ? cats.length === 0 : cats.indexOf(f) !== -1) ? 'true' : 'false');
      });
      bookButtons.forEach(function (b) { b.setAttribute('aria-pressed', books.indexOf(b.getAttribute('data-book')) !== -1 ? 'true' : 'false'); });
    };
    var apply = function () {
      paint();
      if (!cats.length && !books.length) {
        years.hidden = false; grid.hidden = true; grid.innerHTML = ''; if (empty) empty.style.display = 'none';
        return;
      }
      // Year groups are already newest-first, so a straight walk keeps date order across years.
      var cards = years.querySelectorAll('.card');
      var shown = 0; grid.innerHTML = '';
      Array.prototype.forEach.call(cards, function (card) {
        if (has('data-categories', card, cats) && has('data-books', card, books)) { grid.appendChild(card.cloneNode(true)); shown++; }
      });
      years.hidden = true; grid.hidden = false;
      if (empty) empty.style.display = shown ? 'none' : 'block';
    };
    window.__sbcStaticFilters = { apply: apply }; // search.js disables this when it takes over
    var togglePill = function (list, value) {
      var i = list.indexOf(value);
      if (i === -1) list.push(value); else list.splice(i, 1);
    };
    catButtons.forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.__sbcSearchActive) return;
        var f = b.getAttribute('data-filter');
        if (f === 'all') { cats = []; books = []; } else togglePill(cats, f);
        apply();
      });
    });
    bookButtons.forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.__sbcSearchActive) return;
        togglePill(books, b.getAttribute('data-book'));
        apply();
      });
    });
    var hash = (location.hash || '').replace('#', '').toLowerCase();
    if (hash && document.querySelector('#category-filters .filter-btn[data-filter="' + hash + '"]')) {
      setTimeout(function () { if (!window.__sbcSearchActive) { cats = [hash]; apply(); } }, 300);
    }
  }

  /* ---------- Resources: tabs (state in URL hash) + per-tab filter box ---------- */
  var tabs = document.querySelectorAll('#res-tabs .tab');
  if (tabs.length) {
    var panels = document.querySelectorAll('.res-panel');
    var select = function (id, push) {
      var found = false;
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-tab') === id;
        if (on) found = true;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      if (!found) return select('books', push);
      panels.forEach(function (p) { p.hidden = p.id !== id; });
      if (push && history.replaceState) history.replaceState(null, '', '#' + id);
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t.getAttribute('data-tab'), true); t.focus(); });
      t.addEventListener('keydown', function (e) {
        var next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
        if (next < 0 || next >= tabs.length) return;
        e.preventDefault();
        tabs[next].click();
      });
    });
    var fromHash = function () {
      var h = (location.hash || '').replace('#', '').toLowerCase();
      if (h === 'disclaimers') return;
      select(h || 'books', false);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);

    // Filter box: narrows the visible entries by any text (title, author/artist/show/publication, note)
    panels.forEach(function (panel) {
      var input = panel.querySelector('.res-filter input');
      if (!input) return;
      var items = panel.querySelectorAll('.res-item');
      var groups = panel.querySelectorAll('[data-group]');
      var nomatch = panel.querySelector('.res-nomatch');
      input.addEventListener('input', function () {
        var q = input.value.trim().toLowerCase();
        var shown = 0;
        items.forEach(function (li) {
          var ok = !q || (li.getAttribute('data-text') || '').indexOf(q) !== -1;
          li.hidden = !ok; if (ok) shown++;
        });
        groups.forEach(function (g) {
          var any = g.querySelector('.res-item:not([hidden])');
          g.hidden = !any;
          if (q && any && g.tagName === 'DETAILS') g.open = true;
        });
        if (nomatch) nomatch.hidden = shown > 0;
      });
    });
  }
})();
