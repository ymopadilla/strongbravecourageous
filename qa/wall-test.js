/* Memorial wall tests (browser). Run against a local build:

     DIST_DIR=/tmp/sbc-dist node build.js
     npx serve /tmp/sbc-dist -l 8123            (any static server)
     node qa/wall-test.js http://localhost:8123 /path/to/big-photo.jpg [http://localhost:8124]

   The optional third argument is a second server holding a build of the code that is LIVE today
   (git archive <live commit> | tar -x, then build). The last tests load that older page and its approval
   screen against the stand-in for the changed database, to prove a database change did not break the live site.

   Needs Playwright (npm i -D playwright). The second argument is a photo of 10 MB or more.

   Supabase is replaced by an in-memory stand-in that follows the same rules as the database
   (supabase/migrations/001 to 006), so the tests never touch real data. The database rules themselves are
   tested separately in SQL (qa/wall-rules-test.sql). Since Oct 8, 2026 the wall is for everyone's losses: a
   memory has a first name, the loved one's name, an optional photo, optional words, and an optional email. */
const { chromium } = require('playwright');
const fs = require('fs');
const [,, BASE = 'http://localhost:8123', BIG_PHOTO, LIVE_BASE] = process.argv;
const SB = 'https://weaoqfeujfgakjogzepq.supabase.co';
const ADMIN = { id: '99999999-9999-4999-8999-999999999999', email: 'approver@example.test' };

let db, log;
const reset = () => { db = { memories: [], comments: [], hearts: [], contacts: [], pending: {}, pub: {} }; log = []; };
const uid = () => require('crypto').randomUUID();
const TAGS = ['steve', 'mason', 'josh', 'family']; // still accepted from the older page (migration 005)
let tick = 0; const stamp = () => new Date(Date.now() + (tick += 1000)).toISOString(); // every approval gets a later time
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const blank = (v) => !String(v == null ? '' : v).trim();
const like = (q) => (v) => String(v || '').toLowerCase().includes(q);

async function mock(page) {
  await page.route(SB + '/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const p = u.pathname; const m = req.method();
    const h = req.headers(); const admin = (h.authorization || '') === 'Bearer admin-token';
    const body = () => { try { return req.postDataJSON(); } catch (e) { return null; } };
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: data === undefined ? '' : JSON.stringify(data) });
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    log.push({ m, p: p + u.search, prefer: h.prefer || '', body: p.includes('/storage/') ? null : body() });
    // ----- auth -----
    if (p === '/auth/v1/token') { const b = body(); return b.password === 'right-password' || b.refresh_token ? json(200, { access_token: 'admin-token', refresh_token: 'r', expires_in: 3600, user: ADMIN }) : json(400, { error_description: 'Invalid login credentials' }); }
    if (p === '/auth/v1/logout') return json(204);
    if (p === '/rest/v1/wall_admins') return json(200, admin ? [{ user_id: ADMIN.id }] : []);
    // ----- public reads -----
    if (p === '/rest/v1/memories' && m === 'GET') return json(200, db.memories.filter((x) => admin || x.status === 'approved').sort((a, b) => b.created_at.localeCompare(a.created_at)));
    if (p === '/rest/v1/comments' && m === 'GET') {
      const only = (u.searchParams.get('memory_id') || '').match(/^in\.\((.*)\)$/);
      return json(200, db.comments.filter((c) => admin || (c.status === 'approved' && db.memories.some((x) => x.id === c.memory_id && x.status === 'approved')))
        .filter((c) => !only || only[1].split(',').includes(c.memory_id)));
    }
    if (p === '/rest/v1/memory_contacts') return admin ? json(200, db.contacts) : json(403, { code: '42501' });
    // ----- public entry points -----
    const addMemory = (b, extra) => {
      if (db.memories.filter((x) => x.status === 'pending').length >= 200) return json(400, { code: 'WB001', message: 'wall_busy' });
      if (b.p_photo_path && !db.pending[b.p_photo_path]) return json(400, { code: 'WB002', message: 'bad_photo' });
      const row = { id: uid(), created_at: new Date().toISOString(), first_name: b.p_first_name, loved_one: null, memory: blank(b.p_memory) ? null : String(b.p_memory).trim(), photo_path: b.p_photo_path || null, youtube_id: b.p_youtube_id || null, photo_permission: !!b.p_photo_permission, status: 'pending', heart_count: 0, reviewed_at: null, approved_at: null, tags: [], ...extra };
      db.memories.push(row); if (b.p_email) db.contacts.push({ memory_id: row.id, email: String(b.p_email).toLowerCase() });
      return json(204);
    };
    if (p === '/rest/v1/rpc/submit_wall_memory') {   // the new page (migration 006)
      const b = body();
      if (blank(b.p_loved_one)) return json(400, { code: 'WB006', message: 'need_loved_one' });
      if (String(b.p_loved_one).trim().length > 80) return json(400, { code: '23514' });
      return addMemory(b, { loved_one: String(b.p_loved_one).trim() });
    }
    if (p === '/rest/v1/rpc/submit_memory') {          // the older page (migrations 001 and 005)
      const b = body();
      if ((b.p_tags || []).some((x) => !TAGS.includes(x))) return json(400, { code: 'WB005', message: 'bad_tag' });
      return addMemory(b, { tags: [...new Set(b.p_tags || [])] });
    }
    const page_of = (rows, b) => rows.sort((a, c) => (c.approved_at || '').localeCompare(a.approved_at || '') || c.id.localeCompare(a.id))
      .slice(b.p_offset || 0, (b.p_offset || 0) + Math.min(b.p_limit || 21, 51));
    if (p === '/rest/v1/rpc/wall_list') {               // the new page: loved one's name, first name, words
      const b = body(); const q = (b.p_query || '').trim().toLowerCase(); const has = like(q);
      return json(200, page_of(db.memories.filter((x) => x.status === 'approved').filter((x) => !q || has(x.loved_one) || has(x.first_name) || has(x.memory)), b)
        .map(({ id, created_at, approved_at, first_name, loved_one, memory, photo_path, heart_count }) => ({ id, created_at, approved_at, first_name, loved_one, memory, photo_path, heart_count })));
    }
    if (p === '/rest/v1/rpc/wall_page') {               // the older page: first name and words, tags
      const b = body(); const q = (b.p_query || '').trim().toLowerCase(); const has = like(q);
      return json(200, page_of(db.memories.filter((x) => x.status === 'approved').filter((x) => !q || has(x.first_name) || has(x.memory))
        .filter((x) => !b.p_tag || (x.tags || []).includes(b.p_tag)), b)
        .map(({ id, created_at, approved_at, first_name, memory, photo_path, youtube_id, heart_count, tags }) => ({ id, created_at, approved_at, first_name, memory, photo_path, youtube_id, heart_count, tags })));
    }
    if (p === '/rest/v1/rpc/submit_comment') {
      const b = body();
      if (db.comments.filter((x) => x.status === 'pending').length >= 500) return json(400, { code: 'WB001', message: 'wall_busy' });
      db.comments.push({ id: uid(), memory_id: b.p_memory_id, created_at: new Date().toISOString(), first_name: b.p_first_name, comment: b.p_comment, status: 'pending' });
      return json(204);
    }
    if (p === '/rest/v1/rpc/add_heart') {
      const b = body(); const row = db.memories.find((x) => x.id === b.p_memory_id);
      if (!db.hearts.some((x) => x.m === b.p_memory_id && x.d === b.p_device_id)) db.hearts.push({ m: b.p_memory_id, d: b.p_device_id });
      row.heart_count = db.hearts.filter((x) => x.m === row.id).length;
      return json(200, row.heart_count);
    }
    // ----- admin writes -----
    if (p === '/rest/v1/memories' || p === '/rest/v1/comments') {
      if (!admin) return json(403, { code: '42501' });
      const table = p.endsWith('memories') ? db.memories : db.comments; const id = u.searchParams.get('id').replace('eq.', '');
      if (m === 'PATCH') {
        const row = table.find((x) => x.id === id), b = body();
        if (b.tags && b.tags.some((x) => !TAGS.includes(x))) return json(400, { code: '23514' });
        if ('loved_one' in b && (blank(b.loved_one) || String(b.loved_one).trim().length > 80)) return json(400, { code: '23514' });
        if (b.status === 'approved' && row.status !== 'approved') row.approved_at = stamp(); // the database stamps approvals
        Object.assign(row, b); return json(204);
      }
      if (m === 'DELETE') { table.splice(table.findIndex((x) => x.id === id), 1); db.comments = db.comments.filter((c) => c.memory_id !== id); return json(204); }
    }
    // ----- storage -----
    let s;
    if ((s = p.match(/^\/storage\/v1\/object\/memorial-pending\/(.+)$/)) && m === 'POST') {
      if (!/^[0-9a-f-]{36}\.jpg$/.test(s[1]) || h['content-type'] !== 'image/jpeg') return json(400, { message: 'refused' });
      db.pending[s[1]] = { bytes: req.postDataBuffer(), created_at: new Date().toISOString() }; return json(200, { Key: s[1] });
    }
    if (p === '/storage/v1/object/copy') { if (!admin) return json(403, {}); const b = body(); db.pub[b.destinationKey] = db.pending[b.sourceKey]; return json(200, { Key: b.destinationKey }); }
    if ((s = p.match(/^\/storage\/v1\/object\/authenticated\/memorial-pending\/(.+)$/))) return admin && db.pending[s[1]] ? route.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' }, body: db.pending[s[1]].bytes }) : json(404, {});
    if ((s = p.match(/^\/storage\/v1\/object\/public\/memorial-photos\/(.+)$/))) return db.pub[s[1]] ? route.fulfill({ status: 200, contentType: 'image/jpeg', body: db.pub[s[1]].bytes }) : json(404, {});
    if (p === '/storage/v1/object/list/memorial-pending') return admin ? json(200, Object.entries(db.pending).map(([name, f]) => ({ name, id: name, created_at: f.created_at }))) : json(200, []);
    if ((s = p.match(/^\/storage\/v1\/object\/(memorial-pending|memorial-photos)$/)) && m === 'DELETE') { if (!admin) return json(403, {}); const store = s[1] === 'memorial-pending' ? db.pending : db.pub; body().prefixes.forEach((n) => delete store[n]); return json(200, []); }
    return json(404, { message: 'not mocked: ' + m + ' ' + p });
  });
}

const XSS_NAME = 'Sam <script>window.__xss = 1</script>';
const XSS_LOVED = 'Grandpa <img src=x onerror="window.__xss = 4">';
const XSS_TEXT = 'Remember this <img src=x onerror="window.__xss = 2"> <b>day</b>';

(async () => {
  const browser = await chromium.launch();
  for (const width of [375, 1280]) {
    console.log(`\n--- width ${width} ---`);
    reset();
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await mock(page);
    const wall = BASE + '/memorial-wall.html';
    const share = async (first, loved, words = '', email = '') => {
      await page.fill('#wall-name', first); await page.fill('#wall-loved', loved); await page.fill('#wall-memory', words);
      if (email) await page.fill('#wall-email', email);
    };

    // 1. zero memories, and the form as Yvonne set it out
    await page.goto(wall); await page.waitForSelector('#wall-empty:not([hidden])');
    check('zero memories: calm empty line, no cards', (await page.locator('.wall-card').count()) === 0 && (await page.locator('#wall-status').isHidden()));
    const labels = (await page.locator('#wall-form label:not(.radio), #wall-form .radio').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => !t.startsWith('Don'));
    check('form: first name, loved one’s name, photo with permission, a few words, email (in that order)',
      /^Your first name/.test(labels[0]) && /^Your loved one’s name \(required\)/.test(labels[1]) && /^Photo/.test(labels[2]) && /^I have permission/.test(labels[3]) && /^A few words \(optional\)/.test(labels[4]) && /^Email/.test(labels[5]), labels.join(' | '));
    check('form: no "Who is this memory about?" and no YouTube field', (await page.locator('#wall-form fieldset, #wall-video, input[name="tags"]').count()) === 0);
    check('wall: no Steve, Mason, Josh, or family filters', (await page.locator('#wall-filters, .wall-filters, [data-tag]').count()) === 0);
    check('wall: the intro no longer names only Steve, Mason, and Josh', await (async () => { const t = await page.locator('.wall-intro').innerText(); return t.includes('someone you love and have lost') && !/Steve|Mason|Josh/.test(t); })());

    // 2. required fields
    await share('Sam', ''); await page.click('#wall-submit'); await page.waitForSelector('#wall-msg:not([hidden])');
    check('form: the loved one’s name is required', (await page.locator('#wall-msg').innerText()).includes('loved one') && !log.some((l) => l.p.includes('submit')) && (await page.evaluate(() => document.activeElement.id)) === 'wall-loved');

    // 3. submit (markup in every text field, an email)
    await share(XSS_NAME, XSS_LOVED, XSS_TEXT, 'Friend@Example.test');
    await page.click('#wall-submit'); await page.waitForSelector('#wall-thanks:not([hidden])');
    const sub = log.find((l) => l.p.includes('submit_wall_memory'));
    check('submit: arrives pending, thank-you shown', db.memories.length === 1 && db.memories[0].status === 'pending');
    check('submit: sent through submit_wall_memory, no row asked back', !!sub && sub.prefer === 'return=minimal' && !log.some((l) => l.p.endsWith('/rpc/submit_memory')));
    check('submit: no tags and no video are sent', !('p_tags' in sub.body) && !('p_youtube_id' in sub.body) && sub.body.p_loved_one === XSS_LOVED);
    check('submit: email stored apart from the memory', db.contacts.length === 1 && !('email' in db.memories[0]));
    await page.reload(); await page.waitForSelector('#wall-empty:not([hidden])');
    check('pending memory is not on the wall', (await page.locator('.wall-card').count()) === 0);

    // 4. a memory with no words
    await share('Nina', 'Aunt May'); await page.click('#wall-submit'); await page.waitForSelector('#wall-thanks:not([hidden])');
    const noWords = db.memories.find((x) => x.loved_one === 'Aunt May');
    check('submit: the words are optional (stored as no words)', !!noWords && noWords.memory === null && log.filter((l) => l.p.includes('submit_wall_memory')).pop().body.p_memory === null);

    // 5. approval screen: sign in, see it as text, approve both
    const admin = await ctx.newPage(); admin.on('pageerror', (e) => errors.push(e.message)); await mock(admin);
    await admin.goto(BASE + '/wall-admin.html'); await admin.waitForSelector('#wa-signin:not([hidden])');
    await admin.fill('#wa-email', ADMIN.email); await admin.fill('#wa-password', 'wrong'); await admin.click('#wa-signin-form button[type=submit]');
    await admin.waitForSelector('#wa-msg:not([hidden])');
    check('approval screen: wrong password is refused', await admin.locator('#wa-main').isHidden());
    await admin.fill('#wa-password', 'right-password'); await admin.click('#wa-signin-form button[type=submit]');
    await admin.waitForSelector('#wa-pending-memories .wall-card');
    const first = admin.locator('#wa-pending-memories .wall-card', { hasText: 'Sam' });
    const adminText = await first.innerText();
    check('approval screen: markup shows as text', adminText.includes('<script>') && adminText.includes('<img src=x onerror') && (await admin.locator('#wa-main script, #wa-main img[onerror], #wa-main b').count()) === 0 && (await admin.evaluate(() => window.__xss)) === undefined);
    check('approval screen: the loved one’s name leads the card, in an editable box', (await first.locator('.wa-name').innerText()) === XSS_LOVED && (await first.locator('.wa-name-edit input').inputValue()) === XSS_LOVED);
    check('approval screen: no tag editor', (await admin.locator('.wa-tags, input[value="josh"]').count()) === 0);
    check('approval screen: private email visible to approvers', adminText.includes('friend@example.test'));
    const nw = admin.locator('#wa-pending-memories .wall-card', { hasText: 'Nina' });  // by the sharer: the name itself is about to change
    check('approval screen: a memory with no words shows no empty text', (await nw.locator('.wall-text').count()) === 0);
    await nw.locator('.wa-name-edit input').fill('  '); await nw.locator('.wa-name-edit button').click();
    check('approval screen: a blank name is refused', (await nw.locator('.wa-saved').innerText()) === 'Please add a name.' && noWords.loved_one === 'Aunt May');
    await nw.locator('.wa-name-edit input').fill('Aunt Mae'); await nw.locator('.wa-name-edit button').click();
    await nw.locator('.wa-saved', { hasText: 'Saved.' }).waitFor();
    check('approval screen: an approver corrects the name before approving', noWords.loved_one === 'Aunt Mae' && (await nw.locator('.wa-name').innerText()) === 'Aunt Mae');
    await first.locator('text=Approve').click(); await admin.waitForFunction(() => document.getElementById('wa-n-ok').textContent === '1');
    await nw.locator('text=Approve').click();
    await admin.waitForFunction(() => document.getElementById('wa-n-ok').textContent === '2');
    check('approve: both memories move to "On the wall"', db.memories.every((x) => x.status === 'approved'));

    // 6. the wall: each card reads loved one, "Shared by", photo, words, date
    await page.goto(wall); await page.waitForSelector('.wall-card');
    const top = page.locator('.wall-card').first(), second = page.locator('.wall-card').nth(1);
    check('wall: newest approved first', (await top.locator('h3').innerText()) === 'Aunt Mae');
    check('wall: the loved one’s name is the heading, then "Shared by"', (await second.locator('h3.wall-name').innerText()) === XSS_LOVED && (await second.locator('.wall-shared').innerText()) === 'Shared by ' + XSS_NAME);
    const order = await second.evaluate((c) => [...c.children].map((n) => n.className).join(','));
    check('wall: card order is name, shared by, words, date, then hearts and comments', order.startsWith('wall-name,wall-shared,wall-text,wall-foot'), order);
    const cardText = await second.innerText();
    check('wall: markup in the names and words displays as text and does not run',
      cardText.includes('<script>window.__xss = 1</script>') && cardText.includes('<img src=x onerror="window.__xss = 4">') && cardText.includes('<b>day</b>')
      && (await page.locator('#wall-list script, #wall-list img[onerror], #wall-list b').count()) === 0 && (await page.evaluate(() => window.__xss)) === undefined);
    check('wall: a memory with no words shows no empty text', (await top.locator('.wall-text').count()) === 0 && (await top.locator('time').count()) === 1);
    check('wall: email never reaches the public page', !(await page.content()).toLowerCase().includes('friend@example.test'));

    // 7. heart: once per device
    await second.locator('.wall-heart').click(); await page.waitForSelector('.wall-heart[aria-pressed="true"]');
    await second.locator('.wall-heart').click({ force: true }); await page.waitForTimeout(300);
    check('heart: counts once, second press sends nothing', (await second.locator('.wall-heart-count').innerText()) === '1' && log.filter((l) => l.p.includes('add_heart')).length === 1);
    await page.reload(); await page.waitForSelector('.wall-heart[aria-pressed="true"]');
    check('heart: remembered on this device after reload', (await page.locator('.wall-card').nth(1).locator('.wall-heart-count').innerText()) === '1');

    // 8. comment: held, then approved (on the memory with no words)
    const c0 = page.locator('.wall-card').first();
    await c0.locator('.wall-comment-form summary').click();
    await c0.locator('.wall-comment-form input[type=text]:not(.hp)').fill('Pat');
    await c0.locator('.wall-comment-form textarea').fill('Thinking of you <i>all</i>');
    await c0.locator('.wall-comment-form button[type=submit]').click(); await page.waitForSelector('.wall-comment-form .comment-note');
    await page.reload(); await page.waitForSelector('.wall-card');
    check('comment: held for approval', db.comments.length === 1 && (await page.locator('.wall-comments .comment').count()) === 0);
    await admin.click('#wa-refresh'); await admin.waitForSelector('#wa-pending-comments .wall-card');
    check('approval screen: a comment names its memory by the loved one', (await admin.locator('#wa-pending-comments .wa-fact').innerText()).includes('of Aunt Mae, shared by Nina'));
    await admin.click('#wa-pending-comments .wall-card >> text=Approve'); await admin.waitForSelector('#wa-pending-comments .muted');
    await page.reload(); await page.waitForSelector('.wall-comments .comment');
    check('comment: appears after approval, as text', (await page.locator('.wall-comments .comment').innerText()).includes('<i>all</i>') && (await page.locator('.wall-comments i').count()) === 0);

    // 9. an approver corrects a name after approving
    await admin.evaluate(() => { document.querySelectorAll('details.wa-group')[0].open = true; });
    const onWall = admin.locator('#wa-approved .wall-card', { hasText: 'Aunt Mae' });
    await onWall.locator('.wa-name-edit input').fill('Aunt Mae Johnson'); await onWall.locator('.wa-name-edit button').click();
    await onWall.locator('.wa-saved', { hasText: 'Saved.' }).waitFor();
    await page.reload(); await page.waitForSelector('.wall-card');
    check('approval screen: a name corrected after approving shows on the wall', (await page.locator('.wall-card h3').first().innerText()) === 'Aunt Mae Johnson');

    // 10. reject (take off the wall)
    await admin.click('#wa-refresh'); await admin.evaluate(() => { document.querySelectorAll('details.wa-group')[0].open = true; });
    for (let i = 0; i < 2; i++) { await admin.locator('#wa-approved .wall-card').first().locator('text=Take off the wall').click(); await admin.waitForFunction((n) => document.getElementById('wa-n-no').textContent === String(n), i + 1); }
    await page.reload(); await page.waitForSelector('#wall-empty:not([hidden])');
    check('reject: memories and their comments leave the wall', (await page.locator('.wall-card').count()) === 0);

    // 11. a photo of 10 MB or more
    if (BIG_PHOTO) {
      const size = fs.statSync(BIG_PHOTO).size;
      await page.goto(wall); await page.waitForSelector('#wall-empty:not([hidden])');
      await share('Photo person', 'Grandma Lou');
      await page.setInputFiles('#wall-photo', BIG_PHOTO);
      await page.click('#wall-submit'); await page.waitForSelector('#wall-msg:not([hidden])');
      check('photo: permission box is required with a photo', Object.keys(db.pending).length === 0);
      await page.check('#wall-permission'); await page.click('#wall-submit'); await page.waitForSelector('#wall-thanks:not([hidden])', { timeout: 60000 });
      const name = Object.keys(db.pending)[0]; const bytes = db.pending[name].bytes;
      const dims = await page.evaluate(async (b64) => { const r = await fetch('data:image/jpeg;base64,' + b64); const bmp = await createImageBitmap(await r.blob()); return [bmp.width, bmp.height]; }, bytes.toString('base64'));
      check(`photo: ${(size / 1048576).toFixed(1)} MB original is resized in the browser`, size >= 10 * 1048576 && Math.max(...dims) === 1600 && bytes.length < 5 * 1048576 && bytes[0] === 0xff && bytes[1] === 0xd8, `${dims.join('x')}, ${(bytes.length / 1024).toFixed(0)} KB JPEG`);
      check('photo: a photo with a name and no words is accepted', db.memories.some((x) => x.photo_path === name && x.photo_permission === true && x.memory === null && x.loved_one === 'Grandma Lou'));
      await admin.click('#wa-refresh'); await admin.waitForSelector('#wa-pending-memories .wall-photo[src^="blob:"]');
      await admin.click('#wa-pending-memories .wall-card >> text=Approve'); await admin.waitForSelector('#wa-pending-memories .muted');
      await page.reload(); await page.waitForSelector('.wall-card .wall-photo');
      const ph = page.locator('.wall-card .wall-photo');
      check('photo: shown on the wall after approval, alt names both people', !!db.pub[name] && (await ph.evaluate((i) => i.complete && i.naturalWidth > 0)) && (await ph.getAttribute('alt')) === 'Photo of Grandma Lou, shared by Photo person');
      await admin.click('#wa-refresh'); await admin.evaluate(() => { document.querySelectorAll('details.wa-group')[0].open = true; });
      await admin.click('#wa-approved .wall-card >> text=Take off the wall');
      await admin.waitForFunction(() => document.getElementById('wa-n-no').textContent === '3');
      check('reject: public photo removed, pending copy kept for an undo', !db.pub[name] && !!db.pending[name]);
      db.memories.find((x) => x.photo_path === name).reviewed_at = new Date(Date.now() - 31 * 86400000).toISOString();
      await admin.click('#wa-refresh'); await admin.waitForFunction(() => document.getElementById('wa-clean-note').textContent !== '');
      check('reject: photo deleted after 30 days', !db.pending[name] && db.memories.every((x) => x.photo_path !== name));
    } else console.log('SKIP  photo tests (no photo path given)');

    // 12. leftover files older than 7 days
    db.pending['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'] = { bytes: Buffer.from([0xff, 0xd8]), created_at: new Date(Date.now() - 8 * 86400000).toISOString() };
    db.pending['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'] = { bytes: Buffer.from([0xff, 0xd8]), created_at: new Date().toISOString() };
    await admin.click('#wa-refresh'); await admin.waitForFunction(() => document.getElementById('wa-n-orph').textContent === '1');
    await admin.click('details.wa-group >> nth=2'); await admin.click('#wa-orphans-remove');
    await admin.waitForFunction(() => document.getElementById('wa-n-orph').textContent === '0');
    check('housekeeping: only leftover files older than 7 days are listed and removed', !db.pending['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'] && !!db.pending['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg']);

    // 13. flood cap
    for (let i = 0; i < 200; i++) db.memories.push({ id: uid(), created_at: new Date().toISOString(), first_name: 'f', loved_one: 'f', memory: 'f', status: 'pending', heart_count: 0, tags: [] });
    await page.goto(wall); await page.waitForSelector('#wall-empty:not([hidden])');
    await share('Late', 'One more'); await page.click('#wall-submit');
    await page.waitForSelector('#wall-msg:not([hidden])');
    check('flood cap: kind "try again later" message', (await page.locator('#wall-msg').innerText()).includes('Please try again later'));

    // 14. honeypot
    reset(); await page.goto(wall); await page.waitForSelector('#wall-empty:not([hidden])');
    await share('Bot', 'spam', 'spam'); await page.evaluate(() => { document.getElementById('wall-hp').value = 'x'; });
    await page.click('#wall-submit'); await page.waitForSelector('#wall-thanks:not([hidden])');
    check('honeypot: robot gets a thank-you and nothing is sent', db.memories.length === 0 && !log.some((l) => l.p.includes('submit')));

    // ===== Show more, approval-date sort, search =====
    reset();
    const seed = (first_name, loved_one, memory, o = {}) => { const row = { id: uid(), created_at: o.created || new Date().toISOString(), first_name, loved_one, memory, photo_path: null, youtube_id: null, photo_permission: false, status: 'approved', heart_count: 0, reviewed_at: null, approved_at: o.approved || stamp(), tags: o.tags || [] }; db.memories.push(row); return row; };
    for (let i = 1; i <= 45; i++) seed('Person ' + i, 'Loved one ' + i, 'Memory number ' + i);
    await page.goto(wall); await page.waitForSelector('.wall-card');
    const count = () => page.locator('.wall-card').count();
    check('show more: the first 20 load', (await count()) === 20 && (await page.locator('#wall-more').isVisible()));
    await page.click('#wall-more'); await page.waitForFunction(() => document.querySelectorAll('.wall-card').length === 40);
    check('show more: the button loads the next 20', (await page.locator('#wall-more').isVisible()) && (await page.evaluate(() => document.activeElement.classList.contains('wall-card'))));
    await page.click('#wall-more'); await page.waitForFunction(() => document.querySelectorAll('.wall-card').length === 45);
    check('show more: the button disappears at the end (no cutoff)', await page.locator('#wall-more').isHidden());

    reset();
    seed('Submitted later', 'Approved first', 'x', { created: '2026-09-20T12:00:00Z', approved: '2026-09-21T12:00:00Z' });
    seed('Submitted earlier', 'Approved later', 'y', { created: '2026-09-01T12:00:00Z', approved: '2026-09-25T12:00:00Z' });
    await page.goto(wall); await page.waitForSelector('.wall-card');
    const firstCard = await page.locator('.wall-card').first().innerText();
    check('sort: a memory approved later appears above one submitted later', firstCard.includes('Approved later'));
    check('sort: the card shows the submitted date, not the approval date', firstCard.includes('September 1, 2026') && !firstCard.includes('September 25'));

    reset();
    seed('Marigold', 'Grandpa Walt', 'We went FISHING at the lake');
    seed('Robin', 'My brother Theo', 'Fishing again, and nothing bit');
    seed('Lee', 'Coach Dan', 'He taught me <b>everything</b> about engines');
    seed('Old form', null, 'Sent before Oct 8', { tags: ['josh'] });
    for (let i = 1; i <= 30; i++) seed('Person ' + i, 'Loved one ' + i, 'Memory number ' + i);
    await page.goto(wall); await page.waitForSelector('.wall-card');
    check('search: the box is labelled "Search memories" for screen readers', (await page.getByLabel('Search memories').count()) === 1);
    const search = async (text) => { await page.fill('#wall-q', text); await page.press('#wall-q', 'Enter'); await page.waitForTimeout(250); };
    await search('walt');
    check('search: the loved one’s name (partial, any case), found beyond the loaded cards', (await count()) === 1 && (await page.locator('.wall-card h3').innerText()) === 'Grandpa Walt');
    await search('marig');
    check('search: the first name', (await count()) === 1 && (await page.locator('.wall-card').innerText()).includes('Shared by Marigold'));
    await search('fishing');
    check('search: the words, not case-sensitive, newest approved first', (await count()) === 2 && (await page.locator('.wall-card h3').first().innerText()) === 'My brother Theo');
    await search('zzzz');
    check('search: no match shows the message', (await count()) === 0 && (await page.locator('#wall-nomatch').innerText()) === 'No memories match. Try another name or word.' && (await page.locator('#wall-empty').isHidden()));
    await search('<b>');
    check('search: markup in the search is shown as text', (await count()) === 1 && (await page.locator('#wall-result').innerText()).includes('<b>') && (await page.locator('#wall-result b, #wall-result script').count()) === 0);
    await search('<script>window.__xss = 3</script>');
    check('search: a <script> search does not run', (await page.evaluate(() => window.__xss)) === undefined && (await page.locator('#wall-nomatch').isVisible()));
    await search('loved one');
    check('search: results come 20 at a time with "Show more"', (await count()) === 20 && (await page.locator('#wall-more').isVisible()));
    await page.click('#wall-clear'); await page.waitForSelector('#wall-result', { state: 'hidden' }); await page.waitForFunction(() => document.querySelectorAll('.wall-card').length === 20);
    check('search: Clear restores the full wall', (await page.inputValue('#wall-q')) === '' && (await page.locator('#wall-clear').isHidden()) && (await page.locator('#wall-result').isHidden()));
    await search('sent before');
    check('wall: a memory from the older form (no loved one’s name) shows with no heading', (await count()) === 1 && (await page.locator('.wall-card h3').count()) === 0 && (await page.locator('.wall-card .wall-shared').innerText()) === 'Shared by Old form');

    // ===== the site live today (abe3d26) against the changed database =====
    if (LIVE_BASE) {
      const live = await ctx.newPage(); live.on('pageerror', (e) => errors.push('live: ' + e.message)); await mock(live);
      seed('Nora', 'Uncle Sid', null);   // a memory with no words, as the new form can send
      await live.goto(LIVE_BASE + '/memorial-wall.html'); await live.waitForSelector('.wall-card');
      check('live page (current code): still loads memories from the changed database, including one with no words', (await live.locator('.wall-card').count()) === 20 && (await live.locator('#wall-more').isVisible()));
      const before = db.memories.length;
      await live.fill('#wall-name', 'Live page'); await live.fill('#wall-memory', 'sent by the older page'); await live.check('#wall-form input[name="tags"][value="josh"]');
      await live.click('#wall-submit'); await live.waitForSelector('#wall-thanks:not([hidden])');
      const call = log.filter((l) => l.p.endsWith('/rpc/submit_memory')).pop();
      const row = db.memories.find((x) => x.first_name === 'Live page');
      check('live page (current code): still submits through submit_memory (seven values)', db.memories.length === before + 1 && !!call && Array.isArray(call.body.p_tags) && row.loved_one === null && row.tags.join() === 'josh');
      await live.click('#wall-filters >> text="Josh"'); await live.waitForTimeout(300);
      check('live page (current code): its Josh filter still answers', (await live.locator('.wall-card').count()) === 1);
      const liveAdmin = await ctx.newPage(); await mock(liveAdmin);
      await liveAdmin.goto(LIVE_BASE + '/wall-admin.html'); await liveAdmin.waitForSelector('#wa-signin:not([hidden])');
      await liveAdmin.fill('#wa-email', ADMIN.email); await liveAdmin.fill('#wa-password', 'right-password'); await liveAdmin.click('#wa-signin-form button[type=submit]');
      await liveAdmin.waitForSelector('#wa-pending-memories .wall-card');
      check('live approval screen (current code): still loads the changed database, including a memory with no words', (await liveAdmin.locator('#wa-n-pm').innerText()) === '1' && (await liveAdmin.locator('#wa-n-ok').innerText()) === String(db.memories.filter((x) => x.status === 'approved').length));
      // Known limit, reported rather than counted: the older approval screen reads a comment's memory text, so a comment
      // on a memory with no words (possible only once the new form is in use, e.g. on the preview site) stops it loading.
      const nora = db.memories.find((x) => x.first_name === 'Nora');
      db.comments.push({ id: uid(), memory_id: nora.id, created_at: new Date().toISOString(), first_name: 'Kim', comment: 'With you', status: 'pending' });
      const liveErrs = []; liveAdmin.on('pageerror', (e) => liveErrs.push(e.message));
      await liveAdmin.click('#wa-refresh'); await liveAdmin.waitForTimeout(800);
      const loaded = (await liveAdmin.locator('#wa-n-pc').innerText()) === '1';
      console.log(`INFO  older approval screen with a comment on a memory with no words: ${loaded ? 'loads' : 'does not load (known limit until the new code is live)'}${liveErrs.length ? ' [' + liveErrs.join(' | ') + ']' : ''}`);
      db.comments = db.comments.filter((c) => c.memory_id !== nora.id);
      await live.close(); await liveAdmin.close();
    } else console.log('SKIP  live page test (no second server given)');

    // 15. signed-out visitor cannot use the approval screen
    await admin.click('#wa-signout'); await admin.waitForSelector('#wa-signin:not([hidden])');
    check('approval screen: signed out shows only the sign-in form', await admin.locator('#wa-main').isHidden());
    check('no script errors on any page', errors.length === 0, errors.join(' | '));
    await page.screenshot({ path: `wall-${width}.png`, fullPage: true });
    await ctx.close();
  }
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
