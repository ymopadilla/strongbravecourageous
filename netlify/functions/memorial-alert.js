/*
  Netlify Function: memorial-alert
  Called by the Memorial wall database (Supabase) when a new memory or comment is waiting, at most once
  every 10 minutes. It files a "memorial-alert" Netlify form entry, and Netlify's form notifications
  email Becky and Yvonne. No visitor text and no visitor email pass through here: only counts.

  Needs, on the PRODUCTION site only (Netlify → Site configuration → Environment variables):
    WALL_ALERT_SECRET   the value stored in Supabase Vault under the name "wall_alert_secret"
  Without it this function refuses every call and no alert is sent. The wall itself keeps working.
*/
const crypto = require('crypto');

const same = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};
const count = (v) => (Number.isInteger(v) && v >= 0 && v < 100000 ? v : 0);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const secret = process.env.WALL_ALERT_SECRET;
  if (!secret) return { statusCode: 503, body: 'Alert not configured' };
  if (!same(event.headers['x-wall-secret'], secret)) return { statusCode: 401, body: 'Not allowed' };

  let data = {};
  try { data = JSON.parse(event.body || '{}'); } catch (e) { /* counts fall back to 0 */ }
  const memories = count(data.waiting_memories), comments = count(data.waiting_comments);
  const site = process.env.URL || 'https://strongbravecourageous.com';
  const form = new URLSearchParams({
    'form-name': 'memorial-alert',
    message: `Something new is waiting on the Memorial wall. Open ${site}/wall-admin.html to read it.`,
    waiting_memories: String(memories),
    waiting_comments: String(comments),
  });
  const res = await fetch(`${site}/`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  return { statusCode: res.ok ? 200 : 502, body: res.ok ? 'Alert filed' : 'Form not accepted' };
};
