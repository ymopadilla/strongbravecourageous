/* Strong. Brave. Courageous. — Memorial wall (public page)
   Talks to Supabase with the public key only. The database rules decide what this key may do:
   read approved memories and comments, and call three functions (submit_memory, submit_comment, add_heart).

   SAFETY RULE: everything a visitor wrote (names, memories, comments) is put on the page with
   textContent. Never innerHTML, never insertAdjacentHTML. Markup typed by a visitor shows as text. */
(function () {
  'use strict';
  var tag = document.currentScript || document.querySelector('script[data-url][data-key]');
  if (!tag) return;
  var URL_BASE = tag.getAttribute('data-url');
  var KEY = tag.getAttribute('data-key');
  var list = document.getElementById('wall-list');
  var statusLine = document.getElementById('wall-status');
  var emptyLine = document.getElementById('wall-empty');
  var form = document.getElementById('wall-form');
  if (!list || !form || !URL_BASE || !KEY) return;

  var MSG = {
    loadFail: 'The memories could not be loaded right now. Please try again in a little while.',
    busy: 'The wall has a lot waiting to be read right now. Please try again later.',
    fail: 'Something went wrong and this was not sent. Please try again.',
    needName: 'Please add your first name.',
    needMemory: 'Please write your memory.',
    needPermission: 'Please tick the permission box to share this photo.',
    badPhoto: 'That photo could not be read. Please try a JPEG or PNG picture.',
    badVideo: 'That does not look like a YouTube link. Please check it, or leave it empty.',
    badEmail: 'That email address does not look right. Please check it, or leave it empty.',
    commentThanks: 'Thank you. I read every comment before it appears.',
    needComment: 'Please add your first name and a comment.'
  };

  /* ---------- small helpers ---------- */
  function headers(extra) {
    var h = { apikey: KEY, Authorization: 'Bearer ' + KEY };
    for (var k in extra || {}) h[k] = extra[k];
    return h;
  }
  function el(name, cls, text) {
    var n = document.createElement(name);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; // plain text only
    return n;
  }
  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (e) { /* private window or blocked storage: the page still works */ }
    return null;
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  var PHOTO_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
  var VIDEO_RE = /^[A-Za-z0-9_-]{11}$/;
  function deviceId() {
    var id = store('sbc_wall_device');
    if (!id || !UUID_RE.test(id)) { id = uuid(); store('sbc_wall_device', id); }
    return id;
  }
  function hearted() {
    try { return JSON.parse(store('sbc_wall_hearts') || '[]'); } catch (e) { return []; }
  }
  function formatDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function rpc(name, body) {
    // "return=minimal": the public never asks for a row back. Pending rows are not readable.
    return fetch(URL_BASE + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(body)
    }).then(function (res) {
      if (res.ok) return res.status === 204 ? null : res.json().catch(function () { return null; });
      return res.json().catch(function () { return {}; }).then(function (err) {
        var e = new Error((err && err.message) || 'request failed'); e.code = err && err.code; throw e;
      });
    });
  }
  function youtubeId(text) {
    var t = String(text || '').trim();
    if (!t) return '';
    var m = t.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
    return m ? m[1] : null; // null = something was typed, and it is not a YouTube link
  }

  /* ---------- the wall ---------- */
  function heartButton(m) {
    var btn = el('button', 'wall-heart');
    btn.type = 'button';
    var icon = el('span', 'wall-heart-icon', '♥'); icon.setAttribute('aria-hidden', 'true');
    var count = el('span', 'wall-heart-count', String(m.heart_count || 0));
    btn.appendChild(icon); btn.appendChild(count);
    var done = hearted().indexOf(m.id) !== -1;
    function paint() {
      btn.setAttribute('aria-pressed', done ? 'true' : 'false');
      btn.setAttribute('aria-label', (done ? 'You sent a heart. ' : 'Send a heart. ') + count.textContent + (count.textContent === '1' ? ' heart' : ' hearts'));
    }
    paint();
    btn.addEventListener('click', function () {
      if (done || btn.disabled) return;
      btn.disabled = true;
      rpc('add_heart', { p_memory_id: m.id, p_device_id: deviceId() }).then(function (n) {
        if (typeof n === 'number') count.textContent = String(n);
        done = true;
        var all = hearted(); all.push(m.id); store('sbc_wall_hearts', JSON.stringify(all.slice(-500)));
      }).catch(function () { /* leave the count as it was */ }).then(function () { btn.disabled = false; paint(); });
    });
    return btn;
  }

  function commentForm(m) {
    var wrap = el('details', 'wall-comment-form');
    wrap.appendChild(el('summary', null, 'Leave a comment'));
    var f = el('form'); f.noValidate = true;
    var idn = 'wc-name-' + m.id, idc = 'wc-text-' + m.id;
    var f1 = el('div', 'field'); var l1 = el('label', null, 'First name'); l1.htmlFor = idn;
    var name = el('input'); name.type = 'text'; name.id = idn; name.maxLength = 40; name.autocomplete = 'given-name';
    f1.appendChild(l1); f1.appendChild(name);
    var f2 = el('div', 'field'); var l2 = el('label', null, 'Comment'); l2.htmlFor = idc;
    var text = el('textarea'); text.id = idc; text.maxLength = 1000;
    f2.appendChild(l2); f2.appendChild(text);
    var hp = el('input'); hp.type = 'text'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.className = 'hp'; hp.setAttribute('aria-hidden', 'true');
    var msg = el('p', 'wall-msg'); msg.hidden = true; msg.setAttribute('role', 'alert');
    var send = el('button', 'btn btn-outline', 'Post comment'); send.type = 'submit';
    f.appendChild(hp); f.appendChild(f1); f.appendChild(f2); f.appendChild(msg); f.appendChild(send);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var n = name.value.trim(), c = text.value.trim();
      if (!n || !c) { msg.textContent = MSG.needComment; msg.hidden = false; return; }
      send.disabled = true; msg.hidden = true;
      var done = function () {
        f.hidden = true;
        var ok = el('p', 'comment-note', MSG.commentThanks); ok.setAttribute('role', 'status'); wrap.appendChild(ok);
      };
      if (hp.value) return done(); // a robot filled the hidden box: say thanks, send nothing
      rpc('submit_comment', { p_memory_id: m.id, p_first_name: n, p_comment: c }).then(done).catch(function (e) {
        msg.textContent = e.code === 'WB001' ? MSG.busy : MSG.fail; msg.hidden = false; send.disabled = false;
      });
    });
    wrap.appendChild(f);
    return wrap;
  }

  function memoryCard(m, comments) {
    var art = el('article', 'wall-card');
    if (m.photo_path && PHOTO_RE.test(m.photo_path)) {
      var img = el('img', 'wall-photo');
      img.src = URL_BASE + '/storage/v1/object/public/memorial-photos/' + m.photo_path;
      img.alt = 'Photo shared by ' + m.first_name;
      img.loading = 'lazy'; img.decoding = 'async';
      art.appendChild(img);
    }
    art.appendChild(el('p', 'wall-text', m.memory));
    if (m.youtube_id && VIDEO_RE.test(m.youtube_id)) {
      var v = el('div', 'video'); var fr = el('iframe');
      fr.src = 'https://www.youtube-nocookie.com/embed/' + m.youtube_id;
      fr.title = 'Video shared by ' + m.first_name;
      fr.loading = 'lazy'; fr.allowFullscreen = true;
      fr.setAttribute('allow', 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      v.appendChild(fr); art.appendChild(v);
    }
    var foot = el('div', 'wall-foot');
    var by = el('p', 'wall-by');
    by.appendChild(el('span', 'from', '— ' + m.first_name));
    var when = el('time', null, formatDate(m.created_at)); when.dateTime = String(m.created_at).slice(0, 10);
    by.appendChild(when);
    foot.appendChild(by); foot.appendChild(heartButton(m));
    art.appendChild(foot);
    if (comments.length) {
      var ul = el('ul', 'comment-list wall-comments');
      comments.forEach(function (c) {
        var li = el('li', 'comment');
        li.appendChild(el('span', 'who', c.first_name));
        li.appendChild(el('span', 'when', formatDate(c.created_at)));
        li.appendChild(el('p', 'wall-text', c.comment));
        ul.appendChild(li);
      });
      art.appendChild(ul);
    }
    art.appendChild(commentForm(m));
    return art;
  }

  function load() {
    var get = function (path) {
      return fetch(URL_BASE + '/rest/v1/' + path, { headers: headers() }).then(function (r) { if (!r.ok) throw new Error('load'); return r.json(); });
    };
    Promise.all([
      get('memories?select=id,created_at,first_name,memory,photo_path,youtube_id,heart_count&status=eq.approved&order=created_at.desc&limit=500'),
      get('comments?select=id,memory_id,created_at,first_name,comment&status=eq.approved&order=created_at.asc&limit=2000')
    ]).then(function (out) {
      var memories = out[0], comments = out[1];
      statusLine.hidden = true;
      list.textContent = '';
      if (!memories.length) { emptyLine.hidden = false; return; }
      emptyLine.hidden = true;
      memories.forEach(function (m) {
        list.appendChild(memoryCard(m, comments.filter(function (c) { return c.memory_id === m.id; })));
      });
    }).catch(function () { statusLine.textContent = MSG.loadFail; statusLine.hidden = false; });
  }

  /* ---------- photo: made smaller in the browser, re-saved as JPEG (this also drops location data) ---------- */
  var MAX_SIDE = 1600;
  function resizePhoto(file) {
    var decode = window.createImageBitmap
      ? createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); })
      : new Promise(function (resolve, reject) {
          var img = new Image(), u = URL.createObjectURL(file);
          img.onload = function () { URL.revokeObjectURL(u); resolve(img); };
          img.onerror = function () { URL.revokeObjectURL(u); reject(new Error('decode')); };
          img.src = u;
        });
    return decode.then(function (bmp) {
      var w = bmp.width, h = bmp.height;
      if (!w || !h) throw new Error('decode');
      var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // transparent PNGs get a white ground
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      if (bmp.close) bmp.close();
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('encode')); }, 'image/jpeg', 0.85);
      });
    });
  }
  window.__sbcWallResize = resizePhoto; // used by the tests

  /* ---------- the form ---------- */
  var msg = document.getElementById('wall-msg');
  var submit = document.getElementById('wall-submit');
  var thanks = document.getElementById('wall-thanks');
  var photo = document.getElementById('wall-photo');
  var permission = document.getElementById('wall-permission');
  function say(text, field) {
    msg.textContent = text; msg.hidden = false;
    if (field) field.focus();
  }
  function showThanks() {
    form.hidden = true; thanks.hidden = false; thanks.focus();
  }
  document.getElementById('wall-again').addEventListener('click', function () {
    form.reset(); form.hidden = false; thanks.hidden = true; msg.hidden = true; submit.disabled = false;
    submit.textContent = 'Share your memory';
    document.getElementById('wall-name').focus();
  });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    msg.hidden = true;
    var nameEl = document.getElementById('wall-name'), memEl = document.getElementById('wall-memory');
    var videoEl = document.getElementById('wall-video'), emailEl = document.getElementById('wall-email');
    var name = nameEl.value.trim(), memory = memEl.value.trim(), email = emailEl.value.trim();
    var file = photo.files && photo.files[0];
    var video = youtubeId(videoEl.value);
    if (!name) return say(MSG.needName, nameEl);
    if (!memory) return say(MSG.needMemory, memEl);
    if (file && !permission.checked) return say(MSG.needPermission, permission);
    if (video === null) return say(MSG.badVideo, videoEl);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say(MSG.badEmail, emailEl);
    if (document.getElementById('wall-hp').value) return showThanks(); // a robot filled the hidden box

    submit.disabled = true; submit.textContent = 'Sending…';
    var photoName = null;
    var upload = !file ? Promise.resolve() : resizePhoto(file).then(function (blob) {
      photoName = uuid() + '.jpg';
      return fetch(URL_BASE + '/storage/v1/object/memorial-pending/' + photoName, {
        method: 'POST', headers: headers({ 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }), body: blob
      }).then(function (res) { if (!res.ok) { var e = new Error('upload'); e.code = 'UPLOAD'; throw e; } });
    }, function () { var e = new Error('decode'); e.code = 'DECODE'; throw e; });

    upload.then(function () {
      return rpc('submit_memory', {
        p_first_name: name, p_memory: memory, p_photo_path: photoName, p_youtube_id: video || null,
        p_photo_permission: !!(file && permission.checked), p_email: email || null
      });
    }).then(showThanks).catch(function (e) {
      submit.disabled = false; submit.textContent = 'Share your memory';
      if (e.code === 'DECODE') return say(MSG.badPhoto, photo);
      say(e.code === 'WB001' ? MSG.busy : MSG.fail);
    });
  });

  load();
})();
