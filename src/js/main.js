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

  // Resources page: keep the disclaimer pinned just below the sticky site header
  var notice = document.getElementById('resources-notice');
  var header = document.querySelector('.site-header');
  if (notice && header) {
    var pin = function () { notice.style.top = header.offsetHeight + 'px'; };
    pin();
    window.addEventListener('resize', pin);
    if (toggle) toggle.addEventListener('click', function () { setTimeout(pin, 0); });
  }

  // Story category filters (Stories page fallback when search is not loaded)
  var buttons = document.querySelectorAll('.filter-btn[data-filter]');
  var grid = document.getElementById('story-grid');
  var empty = document.getElementById('empty-note');
  if (buttons.length && grid && !document.getElementById('search-app')) {
    var apply = function (filter) {
      var shown = 0;
      Array.prototype.forEach.call(grid.children, function (card) {
        var match = filter === 'all' || card.getAttribute('data-category') === filter;
        card.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      if (empty) empty.style.display = shown ? 'none' : 'block';
      buttons.forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-filter') === filter ? 'true' : 'false');
      });
    };
    buttons.forEach(function (b) {
      b.addEventListener('click', function () { apply(b.getAttribute('data-filter')); });
    });
    var hash = (location.hash || '').replace('#', '').toLowerCase();
    if (hash && ['grief', 'healing', 'faith', 'perseverance'].indexOf(hash) !== -1) apply(hash);
  }
})();
