/* Strong. Brave. Courageous. — Memorial wall approval screen (Becky and Yvonne)
   Uses the public key plus the signed-in person's own session. There is no secret key in this file or
   anywhere in the site. The database refuses every approval request from anyone not on the wall_admins list.

   SAFETY RULE: everything a visitor wrote is put on the page with textContent. Never innerHTML. */
(function () {
  'use strict';
  var tag = document.currentScript || document.querySelector('script[data-url][data-key]');
  if (!tag) return;
  var URL_BASE = tag.getAttribute('data-url');
  var KEY = tag.getAttribute('data-key');
  var PAGE = location.origin + location.pathname;
  var PENDING = 'memorial-pending', PUBLIC = 'memorial-photos';
  var DAY = 86400000, KEEP_REJECTED_DAYS = 30, ORPHAN_DAYS = 7;
  var PHOTO_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
  var VIDEO_RE = /^[A-Za-z0-9_-]{11}$/;
  var $ = function (id) { return document.getElementById(id); };
  var msg = $('wa-msg');
  var session = null;

  /* ---------- helpers ---------- */
  function el(name, cls, text) {
    var n = document.createElement(name);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; // plain text only
    return n;
  }
  function say(text) { msg.textContent = text; msg.hidden = !text; if (text) msg.scrollIntoView({ block: 'nearest' }); }
  function show(id) { ['wa-signin', 'wa-setpw', 'wa-main'].forEach(function (x) { $(x).hidden = x !== id; }); }
  function formatDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function save(s) {
    session = s;
    try { s ? localStorage.setItem('sbc_wall_admin', JSON.stringify(s)) : localStorage.removeItem('sbc_wall_admin'); } catch (e) { /* keep it in memory */ }
  }
  function restore() {
    try { return JSON.parse(localStorage.getItem('sbc_wall_admin') || 'null'); } catch (e) { return null; }
  }
  function toSession(d) {
    return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000, user: d.user || (session && session.user) || null };
  }
  function authFetch(path, opts) {
    opts = opts || {};
    var h = { apikey: KEY, 'Content-Type': 'application/json' };
    for (var k in opts.headers || {}) h[k] = opts.headers[k];
    return fetch(URL_BASE + '/auth/v1/' + path, { method: opts.method || 'POST', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.msg || d.error_description || d.message || 'request failed'); e.status = r.status; throw e; } return d; }); });
  }
  function refresh() {
    if (!session || !session.refresh_token) return Promise.reject(new Error('signed out'));
    return authFetch('token?grant_type=refresh_token', { body: { refresh_token: session.refresh_token } }).then(function (d) { save(toSession(d)); });
  }
  /* Signed-in request to the database or storage. Renews the session once when it has run out. */
  function api(path, opts, retried) {
    opts = opts || {};
    var h = { apikey: KEY, Authorization: 'Bearer ' + session.access_token };
    if (opts.json !== undefined) h['Content-Type'] = 'application/json';
    for (var k in opts.headers || {}) h[k] = opts.headers[k];
    var go = function () {
      return fetch(URL_BASE + path, { method: opts.method || 'GET', headers: h, body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined });
    };
    var start = (session.expires_at && session.expires_at - Date.now() < 60000 && !retried)
      ? refresh().then(function () { return api(path, opts, true); })
      : go().then(function (r) {
          if (r.status === 401 && !retried) return refresh().then(function () { return api(path, opts, true); });
          return r;
        });
    return start;
  }
  function json(path, opts) {
    return api(path, opts).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { var e = new Error(t || 'request failed'); e.status = r.status; throw e; });
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }
  function patch(table, id, body) {
    return json('/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), { method: 'PATCH', json: body, headers: { Prefer: 'return=minimal' } });
  }
  function removeFiles(bucket, names) {
    if (!names.length) return Promise.resolve();
    return api('/storage/v1/object/' + bucket, { method: 'DELETE', json: { prefixes: names } }).then(function (r) { if (!r.ok && r.status !== 404) throw new Error('remove'); });
  }
  function publishPhoto(name) {
    return api('/storage/v1/object/copy', { method: 'POST', json: { bucketId: PENDING, sourceKey: name, destinationBucket: PUBLIC, destinationKey: name } })
      .then(function (r) {
        if (r.ok || r.status === 409) return;
        return r.text().then(function (t) { if (/exist|duplicate/i.test(t)) return; throw new Error('The photo could not be published, so the memory was not approved.'); });
      });
  }
  function stamp(status) { return { status: status, reviewed_at: new Date().toISOString(), reviewed_by: session.user && session.user.id || null }; }

  /* ---------- actions ---------- */
  function approveMemory(m) {
    return (m.photo_path ? publishPhoto(m.photo_path) : Promise.resolve()).then(function () { return patch('memories', m.id, stamp('approved')); });
  }
  function rejectMemory(m) {
    // The pending copy of the photo stays for 30 days so the decision can be undone. The public copy goes now.
    return patch('memories', m.id, stamp('rejected')).then(function () { return m.photo_path ? removeFiles(PUBLIC, [m.photo_path]) : null; });
  }
  function deleteMemory(m) {
    return (m.photo_path ? removeFiles(PUBLIC, [m.photo_path]).then(function () { return removeFiles(PENDING, [m.photo_path]); }) : Promise.resolve())
      .then(function () { return json('/rest/v1/memories?id=eq.' + encodeURIComponent(m.id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); });
  }
  function button(label, cls, work) {
    var b = el('button', 'btn ' + cls, label); b.type = 'button';
    b.addEventListener('click', function () {
      var row = b.parentNode; var all = row.querySelectorAll('button');
      Array.prototype.forEach.call(all, function (x) { x.disabled = true; });
      say('');
      Promise.resolve().then(work).then(load, function (e) {
        say(e && e.message && e.message.length < 160 ? e.message : 'That did not work. Please try again.');
        Array.prototype.forEach.call(all, function (x) { x.disabled = false; });
      });
    });
    return b;
  }

  /* ---------- cards ---------- */
  function photoPreview(m) {
    var img = el('img', 'wall-photo'); img.alt = 'Photo sent by ' + m.first_name;
    api('/storage/v1/object/authenticated/' + PENDING + '/' + m.photo_path).then(function (r) {
      if (!r.ok) throw new Error('missing');
      return r.blob();
    }).then(function (blob) { img.src = URL.createObjectURL(blob); }, function () {
      img.replaceWith(el('p', 'hint', 'The photo for this memory is no longer stored.'));
    });
    return img;
  }
  /* The loved one's name. An approver can correct it at any time, before or after approving.
     The database accepts 1 to 80 characters and refuses an empty name. */
  function nameEditor(m) {
    var f = el('form', 'wa-name-edit'); f.noValidate = true;
    var id = 'wa-loved-' + m.id;
    var label = el('label', null, 'Loved one\u2019s name'); label.htmlFor = id;
    var input = el('input'); input.type = 'text'; input.id = id; input.maxLength = 80; input.value = m.loved_one || ''; input.autocomplete = 'off';
    var save = el('button', 'btn btn-outline', 'Save name'); save.type = 'submit';
    var note = el('span', 'hint wa-saved'); note.setAttribute('role', 'status');
    f.appendChild(label); f.appendChild(input); f.appendChild(save); f.appendChild(note);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = input.value.trim(); note.textContent = '';
      if (!v) { note.textContent = 'Please add a name.'; input.focus(); return; }
      if (v === (m.loved_one || '')) { note.textContent = 'Saved.'; return; }
      save.disabled = true;
      patch('memories', m.id, { loved_one: v }).then(function () {
        m.loved_one = v; input.value = v; note.textContent = 'Saved.';
        var head = f.parentNode && f.parentNode.querySelector('.wa-name'); if (head) head.textContent = v;
      }, function () { say('The name could not be saved. Please try again.'); }).then(function () { save.disabled = false; });
    });
    return f;
  }
  function memoryCard(m, email, comments) {
    var art = el('article', 'wall-card');
    art.appendChild(el('p', 'wa-name', m.loved_one || 'No loved one\u2019s name (sent from the form used before Oct 8)'));
    if (m.photo_path && PHOTO_RE.test(m.photo_path)) art.appendChild(photoPreview(m));
    if (m.memory) art.appendChild(el('p', 'wall-text', m.memory));
    if (m.youtube_id && VIDEO_RE.test(m.youtube_id)) {
      var p = el('p', 'hint', 'Video: ');
      var a = el('a', null, 'youtube.com/watch?v=' + m.youtube_id);
      a.href = 'https://www.youtube.com/watch?v=' + m.youtube_id; a.target = '_blank'; a.rel = 'noopener noreferrer';
      p.appendChild(a); art.appendChild(p);
    }
    var by = el('p', 'wall-by');
    by.appendChild(el('span', 'from', '— ' + m.first_name));
    by.appendChild(el('time', null, formatDate(m.created_at)));
    art.appendChild(by);
    art.appendChild(nameEditor(m));
    var facts = [];
    if (email) facts.push('Email (private): ' + email);
    if (m.photo_path) facts.push(m.photo_permission ? 'Photo permission box: ticked' : 'Photo permission box: not ticked');
    if (m.status === 'approved') facts.push(m.heart_count + (m.heart_count === 1 ? ' heart' : ' hearts') + ', ' + comments + (comments === 1 ? ' comment' : ' comments'));
    if (m.status === 'rejected' && m.photo_path && m.reviewed_at) {
      var left = Math.ceil(KEEP_REJECTED_DAYS - (Date.now() - new Date(m.reviewed_at).getTime()) / DAY);
      facts.push('Photo kept for ' + Math.max(left, 0) + ' more day' + (left === 1 ? '' : 's'));
    }
    facts.forEach(function (f) { art.appendChild(el('p', 'hint wa-fact', f)); });
    var row = el('div', 'btn-row wa-actions');
    if (m.status !== 'approved') row.appendChild(button('Approve', 'btn-primary', function () { return approveMemory(m); }));
    if (m.status !== 'rejected') row.appendChild(button(m.status === 'approved' ? 'Take off the wall' : 'Reject', 'btn-outline', function () { return rejectMemory(m); }));
    row.appendChild(button('Delete for good', 'btn-outline', function () {
      if (!window.confirm('Delete this memory, its photo, its comments, and its hearts for good? This cannot be undone.')) return Promise.reject(new Error(''));
      return deleteMemory(m);
    }));
    art.appendChild(row);
    return art;
  }
  function commentCard(c, memory) {
    var art = el('article', 'wall-card');
    art.appendChild(el('p', 'wall-text', c.comment));
    var by = el('p', 'wall-by');
    by.appendChild(el('span', 'from', '— ' + c.first_name));
    by.appendChild(el('time', null, formatDate(c.created_at)));
    art.appendChild(by);
    if (memory) {
      var words = memory.memory || '';
      art.appendChild(el('p', 'hint wa-fact', 'On the memory ' + (memory.loved_one ? 'of ' + memory.loved_one + ', ' : '') + 'shared by ' + memory.first_name + (words ? ': ' + words.slice(0, 120) + (words.length > 120 ? '…' : '') : '')));
    }
    var row = el('div', 'btn-row wa-actions');
    row.appendChild(button('Approve', 'btn-primary', function () { return patch('comments', c.id, stamp('approved')); }));
    row.appendChild(button('Reject', 'btn-outline', function () { return patch('comments', c.id, stamp('rejected')); }));
    art.appendChild(row);
    return art;
  }
  function fill(id, nodes, emptyText) {
    var box = $(id); box.textContent = '';
    if (!nodes.length) box.appendChild(el('p', 'muted', emptyText));
    nodes.forEach(function (n) { box.appendChild(n); });
  }

  /* ---------- load everything ---------- */
  var orphans = [];
  function listPending() {
    return json('/storage/v1/object/list/' + PENDING, { method: 'POST', json: { prefix: '', limit: 1000, offset: 0, sortBy: { column: 'created_at', order: 'asc' } } })
      .then(function (rows) { return (rows || []).filter(function (f) { return f && f.name && f.id; }); });
  }
  function load() {
    return Promise.all([
      json('/rest/v1/memories?select=*&order=created_at.desc&limit=2000'),
      json('/rest/v1/memory_contacts?select=memory_id,email&limit=2000'),
      json('/rest/v1/comments?select=*&order=created_at.desc&limit=5000'),
      listPending()
    ]).then(function (out) {
      var memories = out[0] || [], contacts = out[1] || [], comments = out[2] || [], files = out[3];
      var emailOf = {}; contacts.forEach(function (c) { emailOf[c.memory_id] = c.email; });
      var byId = {}; memories.forEach(function (m) { byId[m.id] = m; });
      var nComments = function (m) { return comments.filter(function (c) { return c.memory_id === m.id && c.status === 'approved'; }).length; };
      var card = function (m) { return memoryCard(m, emailOf[m.id], nComments(m)); };
      var of = function (s) { return memories.filter(function (m) { return m.status === s; }); };
      var pc = comments.filter(function (c) { return c.status === 'pending'; });
      fill('wa-pending-memories', of('pending').map(card), 'Nothing is waiting.');
      fill('wa-pending-comments', pc.map(function (c) { return commentCard(c, byId[c.memory_id]); }), 'Nothing is waiting.');
      fill('wa-approved', of('approved').map(card), 'Nothing is on the wall yet.');
      fill('wa-rejected', of('rejected').map(card), 'Nothing here.');
      $('wa-n-pm').textContent = of('pending').length; $('wa-n-pc').textContent = pc.length;
      $('wa-n-ok').textContent = of('approved').length; $('wa-n-no').textContent = of('rejected').length;

      // Housekeeping 1: uploaded files more than 7 days old that no memory points to.
      var used = {}; memories.forEach(function (m) { if (m.photo_path) used[m.photo_path] = true; });
      orphans = files.filter(function (f) { return !used[f.name] && Date.now() - new Date(f.created_at).getTime() > ORPHAN_DAYS * DAY; });
      var ul = $('wa-orphans'); ul.textContent = '';
      orphans.forEach(function (f) { ul.appendChild(el('li', null, f.name + ' · uploaded ' + formatDate(f.created_at))); });
      if (!orphans.length) ul.appendChild(el('li', 'muted', 'No leftover files.'));
      $('wa-orphans-remove').hidden = !orphans.length;
      $('wa-n-orph').textContent = orphans.length;

      // Housekeeping 2: photos of memories rejected more than 30 days ago are removed now.
      var old = of('rejected').filter(function (m) { return m.photo_path && m.reviewed_at && Date.now() - new Date(m.reviewed_at).getTime() > KEEP_REJECTED_DAYS * DAY; });
      if (!old.length) return;
      return removeFiles(PENDING, old.map(function (m) { return m.photo_path; }))
        .then(function () { return Promise.all(old.map(function (m) { return patch('memories', m.id, { photo_path: null }); })); })
        .then(function () { $('wa-clean-note').textContent = 'Removed ' + old.length + (old.length === 1 ? ' photo' : ' photos') + ' from memories rejected more than 30 days ago.'; });
    });
  }
  $('wa-orphans-remove').addEventListener('click', function () {
    var b = $('wa-orphans-remove'); b.disabled = true;
    removeFiles(PENDING, orphans.map(function (f) { return f.name; })).then(load, function () { say('The files could not be removed. Please try again.'); }).then(function () { b.disabled = false; });
  });
  $('wa-refresh').addEventListener('click', function () { say(''); load().catch(function () { say('Could not load. Please try again.'); }); });

  /* ---------- signing in ---------- */
  function enter() {
    return json('/rest/v1/wall_admins?select=user_id').then(function (rows) {
      if (!rows || !rows.length) { save(null); show('wa-signin'); say('This account is not on the approval list. Ask Yvonne to add it.'); return; }
      $('wa-who').textContent = 'Signed in as ' + ((session.user && session.user.email) || 'an approver') + '.';
      show('wa-main');
      return load();
    }).catch(function () { save(null); show('wa-signin'); say('Please sign in again.'); });
  }
  $('wa-signin-form').addEventListener('submit', function (ev) {
    ev.preventDefault(); say('');
    authFetch('token?grant_type=password', { body: { email: $('wa-email').value.trim(), password: $('wa-password').value } })
      .then(function (d) { $('wa-password').value = ''; save(toSession(d)); return enter(); })
      .catch(function () { say('That email and password did not match. Please try again.'); });
  });
  $('wa-forgot').addEventListener('click', function () {
    var email = $('wa-email').value.trim();
    if (!email) { say('Type your email address first, then choose this again.'); $('wa-email').focus(); return; }
    authFetch('recover?redirect_to=' + encodeURIComponent(PAGE), { body: { email: email } })
      .then(function () { say('If that address is on the approval list, a link is on its way. Open it on this device.'); })
      .catch(function () { say('The link could not be sent. Please try again in a few minutes.'); });
  });
  $('wa-setpw-form').addEventListener('submit', function (ev) {
    ev.preventDefault(); say('');
    var pw = $('wa-newpw').value;
    if (pw.length < 10) { say('Please use at least 10 characters.'); return; }
    authFetch('user', { method: 'PUT', body: { password: pw }, headers: { Authorization: 'Bearer ' + session.access_token } })
      .then(function () { $('wa-newpw').value = ''; return enter(); })
      .catch(function (e) { say(e.message && e.message.length < 160 ? e.message : 'The password could not be saved. Please try again.'); });
  });
  $('wa-signout').addEventListener('click', function () {
    var token = session && session.access_token;
    save(null); show('wa-signin'); say('');
    if (token) authFetch('logout', { headers: { Authorization: 'Bearer ' + token } }).catch(function () {});
  });

  /* ---------- start ---------- */
  (function start() {
    // Invitation and reset links arrive with the session in the address after "#".
    var hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (hash.get('access_token') || hash.get('error')) history.replaceState(null, '', location.pathname);
    if (hash.get('error')) { show('wa-signin'); say('That link has expired or was already used. Ask for a new one below.'); return; }
    if (hash.get('access_token')) {
      save(toSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token'), expires_in: Number(hash.get('expires_in')) || 3600 }));
      var type = hash.get('type');
      authFetch('user', { method: 'GET', headers: { Authorization: 'Bearer ' + session.access_token } })
        .then(function (u) { session.user = u; save(session); })
        .catch(function () {})
        .then(function () { if (type === 'invite' || type === 'recovery') show('wa-setpw'); else enter(); });
      return;
    }
    session = restore();
    if (session && session.access_token) enter(); else show('wa-signin');
  })();
})();
