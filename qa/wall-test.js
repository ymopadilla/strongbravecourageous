/* Memorial wall tests (browser). Run against a local build:

     DIST_DIR=/tmp/sbc-dist node build.js
     npx serve /tmp/sbc-dist -l 8123            (any static server)
     node qa/wall-test.js http://localhost:8123 /path/to/big-photo.jpg

   Needs Playwright (npm i -D playwright). The second argument is a photo of 10 MB or more.

   Supabase is replaced by an in-memory stand-in that follows the same rules as the database
   (supabase/migrations/001_memorial_wall.sql), so the tests never touch real data. The database rules
   themselves are tested separately in SQL (see README, "Memorial wall", "Tests"). */
const { chromium } = require('playwright');
const fs = require('fs');
const [,, BASE = 'http://localhost:8123', BIG_PHOTO] = process.argv;
const SB = 'https://weaoqfeujfgakjogzepq.supabase.co';
const ADMIN = { id: '99999999-9999-4999-8999-999999999999', email: 'approver@example.test' };

let db, log;
const reset = () => { db = { memories: [], comments: [], hearts: [], contacts: [], pending: {}, pub: {} }; log = []; };
const uid = () => require('crypto').randomUUID();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };

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
    if (p === '/rest/v1/comments' && m === 'GET') return json(200, db.comments.filter((c) => admin || (c.status === 'approved' && db.memories.some((x) => x.id === c.memory_id && x.status === 'approved'))));
    if (p === '/rest/v1/memory_contacts') return admin ? json(200, db.contacts) : json(403, { code: '42501' });
    // ----- public entry points -----
    if (p === '/rest/v1/rpc/submit_memory') {
      const b = body();
      if (db.memories.filter((x) => x.status === 'pending').length >= 200) return json(400, { code: 'WB001', message: 'wall_busy' });
      if (b.p_photo_path && !db.pending[b.p_photo_path]) return json(400, { code: 'WB002', message: 'bad_photo' });
      const row = { id: uid(), created_at: new Date().toISOString(), first_name: b.p_first_name, memory: b.p_memory, photo_path: b.p_photo_path, youtube_id: b.p_youtube_id, photo_permission: b.p_photo_permission, status: 'pending', heart_count: 0, reviewed_at: null };
      db.memories.push(row); if (b.p_email) db.contacts.push({ memory_id: row.id, email: b.p_email });
      return json(204);
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
      if (m === 'PATCH') { Object.assign(table.find((x) => x.id === id), body()); return json(204); }
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

    // 1. zero memories
    await page.goto(wall); await page.waitForSelector('#wall-empty:not([hidden])');
    check('zero memories: calm empty line, no cards', (await page.locator('.wall-card').count()) === 0 && (await page.locator('#wall-status').isHidden()));

    // 2. submit (with markup in the name and the memory, a YouTube link, and an email)
    await page.fill('#wall-name', XSS_NAME); await page.fill('#wall-memory', XSS_TEXT);
    await page.fill('#wall-video', 'https://youtu.be/dQw4w9WgXcQ?t=3'); await page.fill('#wall-email', 'friend@example.test');
    await page.click('#wall-submit'); await page.waitForSelector('#wall-thanks:not([hidden])');
    const sub = log.find((l) => l.p.includes('submit_memory'));
    check('submit: arrives pending, thank-you shown', db.memories.length === 1 && db.memories[0].status === 'pending');
    check('submit: the insert does not ask for the row back', sub.prefer === 'return=minimal');
    check('submit: YouTube link reduced to its video ID', sub.body.p_youtube_id === 'dQw4w9WgXcQ');
    check('submit: email stored apart from the memory', db.contacts.length === 1 && !('email' in db.memories[0]));
    await page.reload(); await page.waitForSelector('#wall-empty:not([hidden])');
    check('pending memory is not on the wall', (await page.locator('.wall-card').count()) === 0);

    // 3. approval screen: sign in, see it as text, approve
    const admin = await ctx.newPage(); admin.on('pageerror', (e) => errors.push(e.message)); await mock(admin);
    await admin.goto(BASE + '/wall-admin.html'); await admin.waitForSelector('#wa-signin:not([hidden])');
    await admin.fill('#wa-email', ADMIN.email); await admin.fill('#wa-password', 'wrong'); await admin.click('#wa-signin-form button[type=submit]');
    await admin.waitForSelector('#wa-msg:not([hidden])');
    check('approval screen: wrong password is refused', await admin.locator('#wa-main').isHidden());
    await admin.fill('#wa-password', 'right-password'); await admin.click('#wa-signin-form button[type=submit]');
    await admin.waitForSelector('#wa-pending-memories .wall-card');
    const adminText = await admin.locator('#wa-pending-memories .wall-card').innerText();
    check('approval screen: markup shows as text', adminText.includes('<script>') && adminText.includes('<img src=x onerror') && (await admin.locator('#wa-main script, #wa-main img[onerror], #wa-main b').count()) === 0 && (await admin.evaluate(() => window.__xss)) === undefined);
    check('approval screen: private email visible to approvers', adminText.includes('friend@example.test'));
    await admin.click('#wa-pending-memories .wall-card >> text=Approve'); await admin.waitForSelector('#wa-pending-memories .muted');
    check('approve: memory moves to "On the wall"', db.memories[0].status === 'approved' && (await admin.locator('#wa-n-ok').innerText()) === '1');

    // 4. wall shows it as plain text
    await page.reload(); await page.waitForSelector('.wall-card');
    const cardText = await page.locator('.wall-card').first().innerText();
    check('wall: <script> and <img onerror> display as text and do not run',
      cardText.includes('<script>window.__xss = 1</script>') && cardText.includes('<img src=x onerror="window.__xss = 2">') && cardText.includes('<b>day</b>')
      && (await page.locator('#wall-list script, #wall-list img[onerror], #wall-list b').count()) === 0 && (await page.evaluate(() => window.__xss)) === undefined);
    check('wall: email never reaches the public page', !(await page.content()).includes('friend@example.test'));
    check('wall: video plays through youtube-nocookie', (await page.locator('.wall-card iframe').getAttribute('src')) === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

    // 5. heart: once per device
    await page.click('.wall-heart'); await page.waitForSelector('.wall-heart[aria-pressed="true"]');
    await page.click('.wall-heart', { force: true }); await page.waitForTimeout(300);
    check('heart: counts once, second press sends nothing', (await page.locator('.wall-heart-count').innerText()) === '1' && log.filter((l) => l.p.includes('add_heart')).length === 1);
    await page.reload(); await page.waitForSelector('.wall-heart[aria-pressed="true"]');
    check('heart: remembered on this device after reload', (await page.locator('.wall-heart-count').innerText()) === '1');

    // 6. comment: held, then approved
    await page.click('.wall-comment-form summary');
    await page.fill('.wall-comment-form input[type=text]:not(.hp)', 'Pat'); await page.fill('.wall-comment-form textarea', 'Thinking of you <i>all</i>');
    await page.click('.wall-comment-form button[type=submit]'); await page.waitForSelector('.wall-comment-form .comment-note');
    await page.reload(); await page.waitForSelector('.wall-card');
    check('comment: held for approval', db.comments.length === 1 && (await page.locator('.wall-comments .comment').count()) === 0);
    await admin.click('#wa-refresh'); await admin.waitForSelector('#wa-pending-comments .wall-card');
    await admin.click('#wa-pending-comments .wall-card >> text=Approve'); await admin.waitForSelector('#wa-pending-comments .muted');
    await page.reload(); await page.waitForSelector('.wall-comments .comment');
    check('comment: appears after approval, as text', (await page.locator('.wall-comments .comment').innerText()).includes('<i>all</i>') && (await page.locator('.wall-comments i').count()) === 0);

    // 7. reject (take off the wall), then undo
    await admin.click('#wa-refresh'); await admin.click('details.wa-group >> nth=0'); await admin.click('#wa-approved .wall-card >> text=Take off the wall');
    await admin.waitForFunction(() => document.getElementById('wa-n-no').textContent === '1');
    await page.reload(); await page.waitForSelector('#wall-empty:not([hidden])');
    check('reject: memory and its comments leave the wall', (await page.locator('.wall-card').count()) === 0);

    // 8. a photo of 10 MB or more
    if (BIG_PHOTO) {
      const size = fs.statSync(BIG_PHOTO).size;
      await page.fill('#wall-name', 'Photo person'); await page.fill('#wall-memory', 'A photo memory');
      await page.setInputFiles('#wall-photo', BIG_PHOTO);
      await page.click('#wall-submit'); await page.waitForSelector('#wall-msg:not([hidden])');
      check('photo: permission box is required with a photo', Object.keys(db.pending).length === 0);
      await page.check('#wall-permission'); await page.click('#wall-submit'); await page.waitForSelector('#wall-thanks:not([hidden])', { timeout: 60000 });
      const name = Object.keys(db.pending)[0]; const bytes = db.pending[name].bytes;
      const dims = await page.evaluate(async (b64) => { const r = await fetch('data:image/jpeg;base64,' + b64); const bmp = await createImageBitmap(await r.blob()); return [bmp.width, bmp.height]; }, bytes.toString('base64'));
      check(`photo: ${(size / 1048576).toFixed(1)} MB original is resized in the browser`, size >= 10 * 1048576 && Math.max(...dims) === 1600 && bytes.length < 5 * 1048576 && bytes[0] === 0xff && bytes[1] === 0xd8, `${dims.join('x')}, ${(bytes.length / 1024).toFixed(0)} KB JPEG`);
      check('photo: file name matches the expected pattern and the memory points to it', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/.test(name) && db.memories.some((x) => x.photo_path === name && x.photo_permission === true));
      await admin.click('#wa-refresh'); await admin.waitForSelector('#wa-pending-memories .wall-photo[src^="blob:"]');
      await admin.click('#wa-pending-memories .wall-card >> text=Approve'); await admin.waitForSelector('#wa-pending-memories .muted');
      await page.reload(); await page.waitForSelector('.wall-card .wall-photo');
      check('photo: shown on the wall after approval', !!db.pub[name] && (await page.locator('.wall-card .wall-photo').evaluate((i) => i.complete && i.naturalWidth > 0)));
      await admin.click('#wa-refresh'); await admin.click('#wa-approved .wall-card >> text=Take off the wall');
      await admin.waitForFunction(() => document.getElementById('wa-n-no').textContent === '2');
      check('reject: public photo removed, pending copy kept for an undo', !db.pub[name] && !!db.pending[name]);
      // older than 30 days: photo removed on the next visit to the approval screen
      db.memories.find((x) => x.photo_path === name).reviewed_at = new Date(Date.now() - 31 * 86400000).toISOString();
      await admin.click('#wa-refresh'); await admin.waitForFunction(() => document.getElementById('wa-clean-note').textContent !== '');
      check('reject: photo deleted after 30 days', !db.pending[name] && db.memories.every((x) => x.photo_path !== name));
    } else console.log('SKIP  photo tests (no photo path given)');

    // 9. leftover files older than 7 days
    db.pending['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'] = { bytes: Buffer.from([0xff, 0xd8]), created_at: new Date(Date.now() - 8 * 86400000).toISOString() };
    db.pending['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'] = { bytes: Buffer.from([0xff, 0xd8]), created_at: new Date().toISOString() };
    await admin.click('#wa-refresh'); await admin.waitForFunction(() => document.getElementById('wa-n-orph').textContent === '1');
    await admin.click('details.wa-group >> nth=2'); await admin.click('#wa-orphans-remove');
    await admin.waitForFunction(() => document.getElementById('wa-n-orph').textContent === '0');
    check('housekeeping: only leftover files older than 7 days are listed and removed', !db.pending['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'] && !!db.pending['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg']);

    // 10. flood cap
    for (let i = 0; i < 200; i++) db.memories.push({ id: uid(), created_at: new Date().toISOString(), first_name: 'f', memory: 'f', status: 'pending', heart_count: 0 });
    await page.goto(wall); await page.waitForSelector('#wall-empty:not([hidden])');
    await page.fill('#wall-name', 'Late'); await page.fill('#wall-memory', 'One more'); await page.click('#wall-submit');
    await page.waitForSelector('#wall-msg:not([hidden])');
    check('flood cap: kind "try again later" message', (await page.locator('#wall-msg').innerText()).includes('Please try again later'));

    // 11. honeypot
    reset(); await page.goto(wall); await page.waitForSelector('#wall-empty:not([hidden])');
    await page.fill('#wall-name', 'Bot'); await page.fill('#wall-memory', 'spam'); await page.evaluate(() => { document.getElementById('wall-hp').value = 'x'; });
    await page.click('#wall-submit'); await page.waitForSelector('#wall-thanks:not([hidden])');
    check('honeypot: robot gets a thank-you and nothing is sent', db.memories.length === 0 && !log.some((l) => l.p.includes('submit_memory')));

    // 12. signed-out visitor cannot use the approval screen
    await admin.click('#wa-signout'); await admin.waitForSelector('#wa-signin:not([hidden])');
    check('approval screen: signed out shows only the sign-in form', await admin.locator('#wa-main').isHidden());
    check('no script errors on either page', errors.length === 0, errors.join(' | '));
    await page.screenshot({ path: `wall-${width}.png`, fullPage: true });
    await ctx.close();
  }
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
