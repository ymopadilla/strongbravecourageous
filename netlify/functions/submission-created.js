/*
  Netlify Function: runs automatically on EVERY Netlify Forms submission (the file name "submission-created" is the trigger).
  Job: when the form is a newsletter signup, add the email to the Mailchimp audience.

  Needs, in Netlify → Site configuration → Environment variables:
    MAILCHIMP_API_KEY      e.g. xxxxxxxx-us18   (the "-us18" suffix is the data center)
    MAILCHIMP_AUDIENCE_ID  the "Story Subscribers" audience ID (Mailchimp → Audience → Settings → Audience name and defaults)
  Optional:
    MAILCHIMP_DOUBLE_OPT_IN=true   → status "pending" (confirmation email) instead of "subscribed"
*/
const crypto = require('crypto');

const NEWSLETTER_FORMS = new Set(['newsletter', 'newsletter-footer']);

exports.handler = async (event) => {
  let payload;
  try { payload = JSON.parse(event.body).payload; } catch (e) { return { statusCode: 400, body: 'Bad payload' }; }

  const formName = payload && payload.form_name;
  if (!NEWSLETTER_FORMS.has(formName)) return { statusCode: 200, body: `Ignored form "${formName}"` };

  const email = String((payload.data && payload.data.email) || payload.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { statusCode: 200, body: 'No valid email' };

  const key = process.env.MAILCHIMP_API_KEY;
  const listId = process.env.MAILCHIMP_AUDIENCE_ID;
  if (!key || !listId) { console.warn('[mailchimp] MAILCHIMP_API_KEY / MAILCHIMP_AUDIENCE_ID not set — signup kept in Netlify Forms only.'); return { statusCode: 200, body: 'Mailchimp not configured' }; }

  const dc = key.split('-').pop();
  const hash = crypto.createHash('md5').update(email).digest('hex');
  const url = `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members/${hash}`;
  const status = process.env.MAILCHIMP_DOUBLE_OPT_IN === 'true' ? 'pending' : 'subscribed';

  const res = await fetch(url, {
    method: 'PUT', // upsert: new subscriber, or re-activate an unsubscribed one only via status_if_new
    headers: { Authorization: `Basic ${Buffer.from(`anystring:${key}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email_address: email,
      status_if_new: status,
      tags: [formName === 'newsletter-footer' ? 'Website footer' : 'Newsletter page'],
      merge_fields: {},
    }),
  });
  const text = await res.text();
  if (!res.ok) { console.error('[mailchimp] error', res.status, text); return { statusCode: 200, body: `Mailchimp error ${res.status}` }; }
  console.log(`[mailchimp] ${email} → ${listId} (${status}) via ${formName}`);
  return { statusCode: 200, body: 'Subscribed' };
};
