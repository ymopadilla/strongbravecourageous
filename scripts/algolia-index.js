#!/usr/bin/env node
/*
  Push the stories search index to Algolia.
  Runs on Netlify right after `npm run build` (see netlify.toml). Flow:
    Becky publishes in Decap CMS → commit to GitHub → Netlify builds → this script re-indexes.

  Needs one secret, set in Netlify → Site configuration → Environment variables:
    ALGOLIA_WRITE_KEY   (the Write API key — never commit it)
  Optional overrides: ALGOLIA_APP_ID, ALGOLIA_INDEX (defaults match build.js).

  Without the key the script prints a note and exits 0 so the site still deploys.
*/
const fs = require('fs');
const path = require('path');

const APP_ID = process.env.ALGOLIA_APP_ID || 'GJ31SC1NW3';
const INDEX = process.env.ALGOLIA_INDEX || 'stories';
const WRITE_KEY = process.env.ALGOLIA_WRITE_KEY;
const file = path.join(process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(__dirname, '..', 'dist'), 'search-index.json');

(async () => {
  if (!WRITE_KEY) { console.log('[algolia] ALGOLIA_WRITE_KEY not set — skipping index push.'); return; }
  if (!fs.existsSync(file)) { console.log('[algolia] dist/search-index.json missing — run the build first.'); return; }
  const records = JSON.parse(fs.readFileSync(file, 'utf8'));
  const base = `https://${APP_ID}.algolia.net/1/indexes/${encodeURIComponent(INDEX)}`;
  const headers = { 'X-Algolia-Application-Id': APP_ID, 'X-Algolia-API-Key': WRITE_KEY, 'Content-Type': 'application/json' };
  const call = async (url, method, body) => {
    const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${url} → ${r.status}: ${text}`);
    return text ? JSON.parse(text) : {};
  };

  // 1) Index settings (idempotent)
  await call(`${base}/settings`, 'PUT', {
    searchableAttributes: ['title', 'excerpt', 'body', 'category'],
    attributesForFaceting: ['category'],
    numericAttributesForFiltering: ['date_ts'],
    attributesToSnippet: ['body:30'],
    attributesToHighlight: ['title', 'excerpt'],
    customRanking: ['desc(date_ts)'],
    ranking: ['typo', 'geo', 'words', 'filters', 'proximity', 'attribute', 'exact', 'custom'],
    typoTolerance: true,
    removeStopWords: true,
    ignorePlurals: true,
    queryLanguages: ['en'],
  });

  // 2) Replace everything in one batch: clear + add (removes deleted/unpublished stories too)
  const requests = [{ action: 'clear' }, ...records.map((body) => ({ action: 'addObject', body }))];
  const res = await call(`${base}/batch`, 'POST', { requests });
  console.log(`[algolia] Indexed ${records.length} stor${records.length === 1 ? 'y' : 'ies'} → "${INDEX}" (taskID ${res.taskID}).`);
})().catch((e) => { console.error('[algolia] Index push failed:', e.message); process.exit(1); });
