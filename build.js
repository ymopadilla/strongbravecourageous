#!/usr/bin/env node
/*
  Strong. Brave. Courageous. — site builder
  -------------------------------------------------
  Plain Node script (no framework). Reads:
    src/templates/layout.html   – site shell (celebration line, header, nav, footer)
    src/pages/*.html            – page bodies with a small front-matter block
    content/stories/*.md        – blog posts written in Decap CMS
    content/resources/*.md      – one file per resource (book, song, podcast episode, article, service)
    content/fingerprints/*.md   – approved Fingerprints submissions
    content/comments/*.md       – approved story comments
    content/pages/*.md          – About / Newsletter / Contact text
  Writes everything to dist/ (the folder Netlify publishes).

  Run:  npm run build      (Netlify runs this automatically on every publish)
        QA_FIXTURES=1 npm run build   also includes qa/fixtures/** (test stories + resources)
*/
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const scripture = require('./lib/scripture');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const CONTENT = path.join(ROOT, 'content');
const FIXTURES = process.env.QA_FIXTURES ? path.join(ROOT, 'qa', 'fixtures') : null;
const DIST = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(ROOT, 'dist');
const SITE_URL = (process.env.URL || 'https://strongbravecourageous.com').replace(/\/$/, '');

/* Story categories are labels, not folders: a story can carry several. Order here = order of pills/tags. */
const CATEGORIES = ['Grief', 'Healing', 'Faith', 'Perseverance', 'Humor'];

/* Bible translation for every BibleGateway link (chips, story text, /scripture.html). Change in lib/scripture.js. */
const BIBLE_VERSION = scripture.BIBLE_VERSION;

/* Resource types → tab id, tab label, secondary-line label, and empty-state wording. Order = tab order.
   Professional help (Find a Counselor + 988) is a fixed block under the tabs, not a type. */
const RESOURCE_TYPES = [
  { type: 'Book', id: 'books', label: 'Books', by: 'Author', empty: 'books that are helping' },
  { type: 'Music', id: 'music', label: 'Music', by: 'Artist', empty: 'music that is helping' },
  { type: 'Podcast', id: 'podcasts', label: 'Podcasts', by: 'Show', empty: 'podcasts that are helping' },
  { type: 'Publication', id: 'publications', label: 'Publications', by: 'Publication', empty: 'publications that are helping' },
];
const ARCHIVE_YEARS = 10; // Podcasts + Publications older than this collapse into "Older"

/* Algolia search (Stories page). The Search API key is public by design (search-only).
   The Write API key is NEVER stored here — it lives in Netlify → Environment variables as ALGOLIA_WRITE_KEY
   and is used only by scripts/algolia-index.js after each build. */
const ALGOLIA = {
  appId: process.env.ALGOLIA_APP_ID || 'GJ31SC1NW3',
  searchKey: process.env.ALGOLIA_SEARCH_KEY || 'e64adedb439574d6facf60bf1712dc75',
  index: process.env.ALGOLIA_INDEX || 'stories',
};
const SITE_NAME = 'Strong. Brave. Courageous.';
const TAGLINE = 'One foot in front of the other.';
const OG_IMAGE = '/images/og-image.jpg';
const BUILD_DATE = new Date();
const CURRENT_YEAR = BUILD_DATE.getFullYear();

marked.setOptions({ gfm: true, breaks: false });

/* ---------- helpers ---------- */
const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);
const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });
const write = (rel, html) => { const out = path.join(DIST, rel); ensureDir(path.dirname(out)); fs.writeFileSync(out, html); };
const escapeHtml = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const unquote = (v) => ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) ? v.slice(1, -1) : v;
const coerce = (v) => (v === 'true' ? true : v === 'false' ? false : v);

/* Minimal YAML front matter: scalars, `key: [a, b]`, and block lists (`key:` + indented `- item` lines) —
   the shapes Decap CMS writes for string, boolean, datetime, and select widgets (single or multiple). */
function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n?---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  const data = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let v = kv[2].trim();
    if (v === '' && lines[i + 1] && /^\s+-\s/.test(lines[i + 1])) {
      const list = [];
      while (lines[i + 1] && /^\s+-\s/.test(lines[i + 1])) { list.push(coerce(unquote(lines[++i].replace(/^\s+-\s*/, '').trim()))); }
      data[key] = list;
    } else if (v.startsWith('[') && v.endsWith(']')) {
      data[key] = v.slice(1, -1).split(',').map((s) => coerce(unquote(s.trim()))).filter((s) => s !== '');
    } else {
      data[key] = coerce(unquote(v));
    }
  }
  return { data, body: m[2] };
}

function isPlaceholder(body) {
  const t = (body || '').trim();
  return t.startsWith('[') && t.endsWith(']');
}

/* Markdown → HTML. Bare YouTube/Vimeo links on their own line become responsive embeds.
   Placeholder text in [BRACKETS] renders as a rose dashed instruction box. */
function renderBody(md) {
  if (isPlaceholder(md)) return `<div class="ph">${escapeHtml(md.trim())}</div>`;
  const withEmbeds = md.replace(
    /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})\S*$/gm,
    (_, id) => `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
  ).replace(
    /^(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)\S*$/gm,
    (_, id) => `<div class="video"><iframe src="https://player.vimeo.com/video/${id}" title="Video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
  );
  return marked.parse(withEmbeds);
}

function formatDate(d) {
  const dt = new Date(String(d).length === 10 ? `${d}T12:00:00` : d);
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
const isoDate = (d) => new Date(String(d).length === 10 ? `${d}T12:00:00` : d).toISOString().slice(0, 10);
const yearOf = (d) => parseInt(isoDate(d).slice(0, 4), 10);
const plainText = (md) => marked.parse(md || '').replace(/<[^>]+>/g, ' ')
  .replace(/&#39;/g, '’').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();

function loadCollection(dir) {
  const dirs = [path.join(CONTENT, dir)];
  if (FIXTURES) dirs.push(path.join(FIXTURES, dir));
  const out = [];
  dirs.filter(exists).forEach((full) => {
    fs.readdirSync(full).filter((f) => f.endsWith('.md')).forEach((f) => {
      const { data, body } = parseFrontMatter(read(path.join(full, f)));
      const slug = data.slug || slugify(f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''));
      out.push({ file: f, slug, data, body });
    });
  });
  return out;
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : ''));
}

/* ---------- layout ---------- */
/* Cache-busting: netlify.toml caches /css and /js for a year, so every build stamps a short
   content hash onto the stylesheet and script URLs. Returning visitors always get the current files. */
const ASSET_V = require('crypto').createHash('md5')
  .update(['css/styles.css', 'js/main.js', 'js/search.js'].map((f) => (exists(path.join(SRC, f)) ? read(path.join(SRC, f)) : '')).join('\n'))
  .digest('hex').slice(0, 8);
const stampAssets = (html) => html
  .replace(/(\/css\/styles\.css)(?=["'])/g, `$1?v=${ASSET_V}`)
  .replace(/(\/js\/(?:main|search)\.js)(?=["'])/g, `$1?v=${ASSET_V}`);

const layout = stampAssets(read(path.join(SRC, 'templates', 'layout.html')));

const ORGANIZATION = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: { '@type': 'ImageObject', url: `${SITE_URL}/images/sbc-logo-512.png`, width: 512, height: 512 },
  founder: { '@type': 'Person', name: 'Becky' },
  description: `I'm Becky. I share my stories of loss, love, and faith to help others see God's movement in their pain. ${TAGLINE}`,
};

function renderPage({ title, description, nav, pathname, content, og_type = 'website', og_image = OG_IMAGE, head_extra = '', body_extra = '', structured_data }) {
  const active = {};
  ['home', 'stories', 'scripture', 'about', 'fingerprints', 'resources', 'newsletter', 'contact'].forEach((n) => {
    active[`active_${n}`] = nav === n ? 'aria-current="page"' : '';
  });
  const sd = structured_data || (nav === 'home'
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          ORGANIZATION,
          {
            '@type': 'WebSite',
            '@id': `${SITE_URL}/#website`,
            name: SITE_NAME,
            url: SITE_URL,
            description,
            publisher: { '@id': `${SITE_URL}/#organization` },
            potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/stories.html?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
          },
        ],
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        url: `${SITE_URL}${pathname}`,
        description,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        publisher: { '@id': `${SITE_URL}/#organization` },
      });
  return fill(layout, {
    title: escapeHtml(title),
    description: escapeHtml(description),
    site_url: SITE_URL,
    path: pathname,
    og_type,
    og_image,
    head_extra,
    body_extra,
    structured_data: JSON.stringify(sd),
    content,
    year: String(CURRENT_YEAR),
    ...active,
  });
}

function loadPageTemplate(name) {
  const { data, body } = parseFrontMatter(stampAssets(read(path.join(SRC, 'pages', `${name}.html`))));
  return { data, body };
}

/* ---------- content ---------- */
/* Categories: accept the new `categories` list and the old single `category` string. */
function storyCategories(s) {
  let list = s.data.categories;
  if (!Array.isArray(list)) list = list ? [list] : (s.data.category ? [s.data.category] : []);
  const valid = CATEGORIES.filter((c) => list.some((x) => String(x).trim().toLowerCase() === c.toLowerCase()));
  return valid.length ? valid : ['Healing'];
}

const stories = loadCollection('stories')
  .filter((s) => s.data.draft !== true)
  .sort((a, b) => new Date(b.data.date) - new Date(a.data.date))
  .map((s) => {
    const cats = storyCategories(s);
    const bodyHtml = renderBody(s.body);
    const refs = isPlaceholder(s.body) ? [] : scripture.canonicalRefs(`${s.data.title || ''}\n${s.data.excerpt || ''}\n${plainText(s.body)}`);
    const books = scripture.sortRefs(refs).map(scripture.bookOf).filter((b, i, a) => a.indexOf(b) === i);
    return { ...s, cats, catSlugs: cats.map(slugify), refs, books, bookSlugs: books.map(slugify), bodyHtml: scripture.linkReferences(bodyHtml), year: yearOf(s.data.date) };
  });

const fingerprints = loadCollection('fingerprints')
  .filter((f) => f.data.approved === true)
  .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));

const comments = loadCollection('comments')
  .filter((c) => c.data.approved === true)
  .sort((a, b) => new Date(a.data.date) - new Date(b.data.date));

const resources = loadCollection('resources')
  .filter((r) => r.data.show !== false && r.data.title)
  .map((r) => ({
    ...r,
    type: RESOURCE_TYPES.find((t) => t.type.toLowerCase() === String(r.data.type || '').trim().toLowerCase()) || null,
    title: String(r.data.title).trim(),
    by: String(r.data.by || '').trim(),
    link: String(r.data.link || '').trim(),
    note: String(r.data.note || r.body || '').trim(),
    date: r.data.date ? isoDate(r.data.date) : '',
  }))
  .filter((r) => r.type);

const pageContent = {};
['about', 'newsletter', 'contact'].forEach((n) => {
  const p = path.join(CONTENT, 'pages', `${n}.md`);
  pageContent[n] = exists(p) ? parseFrontMatter(read(p)) : { data: {}, body: '' };
});

/* All scripture books that appear anywhere, in Bible order (drives the Scripture pill row + facet). */
const allBooks = scripture.BOOKS.map((b) => b.name).filter((name) => stories.some((s) => s.books.includes(name)));

/* ---------- reset dist ---------- */
fs.rmSync(DIST, { recursive: true, force: true });
ensureDir(DIST);

// copy static assets
function copyDir(from, to) {
  ensureDir(to);
  fs.readdirSync(from, { withFileTypes: true }).forEach((e) => {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  });
}
['css', 'js', 'images'].forEach((d) => copyDir(path.join(SRC, d), path.join(DIST, d)));
fs.readdirSync(SRC).filter((f) => /\.(ico|png|txt|xml)$/.test(f)).forEach((f) => fs.copyFileSync(path.join(SRC, f), path.join(DIST, f)));
copyDir(path.join(ROOT, 'admin'), path.join(DIST, 'admin'));
if (exists(path.join(ROOT, 'uploads'))) copyDir(path.join(ROOT, 'uploads'), path.join(DIST, 'uploads'));

/* ---------- shared fragments ---------- */
const BOOK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
const verseChip = (ref) => `<a class="verse-chip" href="${scripture.gatewayUrl(ref)}" target="_blank" rel="noopener" title="${escapeHtml(ref)} (${BIBLE_VERSION}) on BibleGateway">${BOOK_ICON}${escapeHtml(ref)}</a>`;
const categoryTags = (s) => s.cats.map((c) => `<span class="tag tag-${slugify(c)}">${c}</span>`).join('');

function storyCard(s) {
  return `
      <article class="card" data-categories="${s.catSlugs.join(' ')}" data-books="${s.bookSlugs.join(' ')}" data-year="${s.year}">
        <div class="meta">
          <time datetime="${isoDate(s.data.date)}">${formatDate(s.data.date)}</time>
          ${categoryTags(s)}
        </div>
        <h3><a href="/stories/${s.slug}.html">${escapeHtml(s.data.title)}</a></h3>
        <p class="excerpt">${escapeHtml(s.data.excerpt || '')}</p>
        ${s.refs.length ? `<div class="verse-chips">${s.refs.map(verseChip).join('')}</div>` : ''}
        <a class="more" href="/stories/${s.slug}.html">Read the story &rarr;</a>
      </article>`;
}

/* Year view: newest year first; the current year (from today's date at build time) is open, earlier years collapse.
   Nothing is hidden from search — this is only how the unfiltered feed is presented. */
function storyYearView() {
  if (!stories.length) return '<p class="muted text-center">No stories published yet.</p>';
  const years = [...new Set(stories.map((s) => s.year))].sort((a, b) => b - a);
  const openYear = years.includes(CURRENT_YEAR) ? CURRENT_YEAR : years[0];
  return years.map((y) => {
    const list = stories.filter((s) => s.year === y);
    const n = list.length;
    return `
    <details class="year-group"${y === openYear ? ' open' : ''} data-year="${y}">
      <summary><span class="year">${y}</span><span class="count">${n} stor${n === 1 ? 'y' : 'ies'}</span></summary>
      <div class="grid-3 year-grid">${list.map(storyCard).join('\n')}</div>
    </details>`;
  }).join('\n');
}

/* ---------- static pages ---------- */
const GLOBAL_VARS = {
  algolia_app_id: ALGOLIA.appId,
  algolia_search_key: ALGOLIA.searchKey,
  algolia_index: ALGOLIA.index,
  site_url: SITE_URL,
  bible_version: BIBLE_VERSION,
  joshua_url: scripture.gatewayUrl('Joshua 1:9'),
};

function buildSimple(name, vars = {}) {
  const { data, body } = loadPageTemplate(name);
  const all = { ...GLOBAL_VARS, ...vars };
  const html = renderPage({
    title: data.title, description: data.description, nav: data.nav, pathname: data.path,
    head_extra: fill(data.head_extra || '', all), body_extra: fill(data.body_extra || '', all), content: fill(body, all),
  });
  write(name === 'index' ? 'index.html' : `${name}.html`, html);
}

buildSimple('index');
buildSimple('thanks');
buildSimple('404');

// Stories
buildSimple('stories', {
  story_years: storyYearView(),
  category_pills: CATEGORIES.map((c) => `<button class="filter-btn" data-filter="${slugify(c)}" aria-pressed="false">${c}</button>`).join('\n        '),
  scripture_pills: allBooks.length
    ? `<div class="search-filters filters scripture-filters" id="scripture-filters" role="group" aria-label="Filter stories by Bible book">
        <span class="filters-label">${BOOK_ICON} Scripture</span>
        ${allBooks.map((b) => `<button class="filter-btn filter-book" data-book="${slugify(b)}" data-name="${escapeHtml(b)}" aria-pressed="false">${escapeHtml(b)}</button>`).join('\n        ')}
      </div>`
    : '<div class="search-filters filters scripture-filters" id="scripture-filters" role="group" aria-label="Filter stories by Bible book" hidden></div>',
});

// Scripture index (/scripture.html)
{
  const byBook = allBooks.map((book) => {
    const refs = scripture.sortRefs([...new Set(stories.flatMap((s) => s.refs.filter((r) => scripture.bookOf(r) === book)))]);
    return { book, refs };
  });
  const scripture_body = byBook.length
    ? byBook.map(({ book, refs }) => `
      <section class="scripture-book" id="${slugify(book)}">
        <h2>${escapeHtml(book)}</h2>
        <ul class="passage-list">
          ${refs.map((ref) => {
            const inStories = stories.filter((s) => s.refs.includes(ref));
            return `<li class="passage">
            ${verseChip(ref)}
            <ul class="passage-stories">
              ${inStories.map((s) => `<li><a href="/stories/${s.slug}.html">${escapeHtml(s.data.title)}</a><small>${formatDate(s.data.date)}</small></li>`).join('\n              ')}
            </ul>
          </li>`;
          }).join('\n          ')}
        </ul>
      </section>`).join('\n')
    : '<div class="ph text-center" style="max-width:640px;margin:0 auto;">Passages from Becky&rsquo;s stories will appear here as she writes.</div>';
  const passageCount = byBook.reduce((n, b) => n + b.refs.length, 0);
  buildSimple('scripture', {
    scripture_body,
    scripture_summary: byBook.length
      ? `<p class="muted small text-center">${passageCount} passage${passageCount === 1 ? '' : 's'} across ${byBook.length} book${byBook.length === 1 ? '' : 's'} &middot; links open the ${BIBLE_VERSION} on BibleGateway</p>`
      : '',
    book_nav: byBook.length > 1 ? `<nav class="book-nav" aria-label="Jump to a book">${byBook.map(({ book }) => `<a href="#${slugify(book)}">${escapeHtml(book)}</a>`).join('')}</nav>` : '',
  });
}

// About
{
  const { data, body } = pageContent.about;
  buildSimple('about', {
    about_body: renderBody(body),
    about_photo: data.photo
      ? `<img src="${escapeHtml(data.photo)}" alt="Becky" style="border-radius:12px;box-shadow:0 6px 24px rgba(31,41,55,.12);">`
      : '<div class="ph">[PHOTO &mdash; new headshot coming from Becky. Upload it in Site Pages &rarr; About.]</div>',
  });
}

// Newsletter (hidden from nav until Jan 1, 2027 — page still builds)
buildSimple('newsletter', { newsletter_body: renderBody(pageContent.newsletter.body) });

// Resources — one CMS entry per item; build.js does all the sorting (see README → Resources)
{
  const stripArticle = (t) => String(t).replace(/^(a|an|the)\s+/i, '').trim();
  const byTitle = (a, b) => stripArticle(a.title).localeCompare(stripArticle(b.title), 'en', { sensitivity: 'base' }) || a.title.localeCompare(b.title);
  const byName = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
  const newestFirst = (a, b) => (b.date || '').localeCompare(a.date || '') || byTitle(a, b);
  const cutoff = new Date(BUILD_DATE); cutoff.setFullYear(cutoff.getFullYear() - ARCHIVE_YEARS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const isOld = (r) => r.date && r.date < cutoffIso;

  const item = (r, secondary) => {
    const title = r.link ? `<a href="${escapeHtml(r.link)}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>` : escapeHtml(r.title);
    const text = [r.title, r.by, r.note, secondary].join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
    return `<li class="res-item" data-text="${escapeHtml(text)}">
            <span class="res-title">${title}</span>${secondary ? `<span class="res-by">${secondary}</span>` : ''}${r.note ? `<span class="res-note">${escapeHtml(r.note)}</span>` : ''}
          </li>`;
  };
  const list = (items, secondaryOf) => `<ul class="res-list">${items.map((r) => item(r, secondaryOf(r))).join('\n')}</ul>`;
  const group = (name, items, secondaryOf) => `<section class="res-group" data-group>
          <h3>${escapeHtml(name)}</h3>
          ${list(items, secondaryOf)}
        </section>`;
  const grouped = (items, keyOf, sortWithin, secondaryOf) => {
    const keys = [...new Set(items.map(keyOf))].sort(byName);
    return keys.map((k) => group(k || 'Other', items.filter((r) => keyOf(r) === k).sort(sortWithin), secondaryOf)).join('\n');
  };
  const older = (items, secondaryOf) => items.length
    ? `<details class="res-older" data-group>
          <summary>Older <span class="count">${items.length} item${items.length === 1 ? '' : 's'} from more than ${ARCHIVE_YEARS} years ago</span></summary>
          ${list(items.sort(newestFirst), secondaryOf)}
        </details>`
    : '';
  const dateOnly = (r) => (r.date ? formatDate(r.date) : '');
  const byAndDate = (r) => [escapeHtml(r.by), dateOnly(r)].filter(Boolean).join(' &middot; ');

  const panels = RESOURCE_TYPES.map((t) => {
    const items = resources.filter((r) => r.type === t);
    let body = '';
    if (items.length) {
      switch (t.id) {
        case 'books':
        case 'music':
          body = list([...items].sort(byTitle), (r) => escapeHtml(r.by));
          break;
        case 'podcasts': {
          const current = items.filter((r) => !isOld(r)), old = items.filter(isOld);
          body = grouped(current, (r) => r.by, newestFirst, dateOnly) + older(old, byAndDate);
          break;
        }
        case 'publications': {
          const current = items.filter((r) => !isOld(r)), old = items.filter(isOld);
          body = grouped(current, (r) => r.by, byTitle, dateOnly) + older(old, byAndDate);
          break;
        }
      }
    }
    const empty = `<div class="ph res-empty">Becky is gathering ${t.empty}. Check back soon.</div>`;
    return `
    <section class="res-panel" id="${t.id}" role="tabpanel" aria-labelledby="tab-${t.id}"${t.id === 'books' ? '' : ' hidden'}>
      ${items.length ? `<div class="res-filter"><label for="filter-${t.id}" class="visually-hidden">Filter ${t.label}</label><input type="search" id="filter-${t.id}" placeholder="Filter this list…" autocomplete="off"></div>` : ''}
      <div class="res-body">${body}</div>
      ${items.length ? '<p class="res-nomatch muted small" hidden>Nothing here matches. Try another word.</p>' : empty}
    </section>`;
  });

  buildSimple('resources', {
    resource_tabs: RESOURCE_TYPES.map((t) => `<button class="tab" id="tab-${t.id}" role="tab" data-tab="${t.id}" aria-selected="${t.id === 'books'}" aria-controls="${t.id}"${t.id === 'books' ? '' : ' tabindex="-1"'}>${t.label}${resources.some((r) => r.type === t) ? ` <span class="count">${resources.filter((r) => r.type === t).length}</span>` : ''}</button>`).join('\n      '),
    resource_panels: panels.join('\n'),
  });
}

// Contact — the form is the only channel (no email address on the page)
{
  const { data, body } = pageContent.contact;
  const socials = [];
  const icon = {
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM17.5 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.4H7.4V14h2.8v8h3.3z"/></svg>',
  };
  if (data.instagram) socials.push(`<a href="${escapeHtml(data.instagram)}" aria-label="Instagram" rel="noopener" target="_blank">${icon.instagram}</a>`);
  if (data.facebook) socials.push(`<a href="${escapeHtml(data.facebook)}" aria-label="Facebook" rel="noopener" target="_blank">${icon.facebook}</a>`);
  buildSimple('contact', {
    contact_body: renderBody(body),
    social_links: socials.length ? `<div class="social">${socials.join('')}</div>` : '',
  });
}

// Fingerprints
buildSimple('fingerprints', {
  fingerprint_cards: fingerprints.length
    ? fingerprints.map((f) => `
      <article class="card fingerprint">
        ${f.data.photo ? `<img src="${escapeHtml(f.data.photo)}" alt="" style="border-radius:8px;">` : ''}
        <div>${renderBody(f.body)}</div>
        <p class="from">— ${escapeHtml(f.data.name || 'Anonymous')}</p>
        <p class="meta"><time datetime="${isoDate(f.data.date)}">${formatDate(f.data.date)}</time></p>
      </article>`).join('\n')
    : '<div class="ph" style="grid-column:1/-1;"><strong>Approved Fingerprints appear here.</strong> When someone shares a moment marked &ldquo;Share it with everyone,&rdquo; Becky reviews it in Netlify Forms, then adds it under Fingerprints in the site editor and ticks &ldquo;Approved&rdquo;.</div>',
});

/* ---------- story pages ---------- */
{
  const { data: tData, body: tBody } = loadPageTemplate('story-template');
  stories.forEach((s) => {
    const shared = (o) => o.cats.filter((c) => s.cats.includes(c)).length;
    const related = stories.filter((o) => o.slug !== s.slug)
      .sort((a, b) => shared(b) - shared(a) || new Date(b.data.date) - new Date(a.data.date))
      .slice(0, 4);
    const storyComments = comments.filter((c) => c.data.story === s.slug);
    const vars = {
      story_title: escapeHtml(s.data.title),
      story_excerpt: escapeHtml(s.data.excerpt || ''),
      story_slug: s.slug,
      story_path: `/stories/${s.slug}.html`,
      story_date: formatDate(s.data.date),
      story_date_iso: isoDate(s.data.date),
      story_tags: categoryTags(s),
      story_verses: s.refs.length ? `<div class="verse-chips">${s.refs.map(verseChip).join('')}</div>` : '',
      story_body: s.bodyHtml,
      story_comments: storyComments.length
        ? storyComments.map((c) => `
            <li class="comment">
              <span class="who">${escapeHtml(c.data.name || 'Anonymous')}</span><span class="when">${formatDate(c.data.date)}</span>
              ${marked.parse(escapeHtml(c.body.trim()))}
            </li>`).join('\n')
        : '<li class="comment-note">No comments yet.</li>',
      related_posts: related.length
        ? related.map((r) => `<li><a href="/stories/${r.slug}.html">${escapeHtml(r.data.title)}</a><small>${formatDate(r.data.date)} &middot; ${r.cats.join(', ')}</small></li>`).join('\n')
        : '<li class="muted small">More stories are on the way.</li>',
    };
    const html = renderPage({
      title: fill(tData.title, vars),
      description: fill(tData.description, vars),
      nav: 'stories',
      pathname: vars.story_path,
      og_type: 'article',
      content: fill(tBody, vars),
      structured_data: {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        '@id': `${SITE_URL}${vars.story_path}`,
        headline: s.data.title,
        datePublished: isoDate(s.data.date),
        dateModified: isoDate(s.data.date),
        author: { '@type': 'Person', name: 'Becky', url: `${SITE_URL}/about.html` },
        publisher: { '@id': `${SITE_URL}/#organization` },
        description: s.data.excerpt || '',
        image: `${SITE_URL}${OG_IMAGE}`,
        mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}${vars.story_path}` },
        url: `${SITE_URL}${vars.story_path}`,
        articleSection: s.cats.join(', '),
        keywords: [...s.cats, ...s.refs, 'grief', 'faith', 'healing', 'hope'].filter((k, i, a) => a.indexOf(k) === i).join(', '),
        isPartOf: { '@id': `${SITE_URL}/#website` },
      },
    });
    write(`stories/${s.slug}.html`, html);
  });
}

/* ---------- sitemap + robots ---------- */
{
  const today = BUILD_DATE.toISOString().slice(0, 10);
  const pages = [
    ['/', 'weekly', '1.0', today], ['/stories.html', 'weekly', '0.9', stories[0] ? isoDate(stories[0].data.date) : today],
    ['/scripture.html', 'weekly', '0.7', stories[0] ? isoDate(stories[0].data.date) : today],
    ['/about.html', 'monthly', '0.7', today], ['/fingerprints.html', 'weekly', '0.6', today],
    ['/resources.html', 'monthly', '0.6', today], ['/contact.html', 'yearly', '0.4', today],
    ...stories.map((s) => [`/stories/${s.slug}.html`, 'yearly', '0.8', isoDate(s.data.date)]),
  ];
  // /newsletter.html is intentionally left out until it returns to the menu (Jan 1, 2027).
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(([u, f, p, d]) => `  <url><loc>${SITE_URL}${u}</loc><lastmod>${d}</lastmod><changefreq>${f}</changefreq><priority>${p}</priority></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /thanks.html\nSitemap: ${SITE_URL}/sitemap.xml\n`);
}

/* ---------- RSS feed (Mailchimp "RSS to email" reads this) ---------- */
{
  const cdata = (s) => `<![CDATA[${String(s || '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
  const rfc822 = (d) => new Date(String(d).length === 10 ? `${d}T12:00:00Z` : d).toUTCString();
  const items = stories.filter((s) => !isPlaceholder(s.body) && !String(s.data.title || '').startsWith('[')).slice(0, 20).map((s) => {
    const url = `${SITE_URL}/stories/${s.slug}.html`;
    return `    <item>
      <title>${cdata(s.data.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${rfc822(s.data.date)}</pubDate>
${s.cats.map((c) => `      <category>${cdata(c)}</category>`).join('\n')}
      <dc:creator>Becky</dc:creator>
      <description>${cdata(s.data.excerpt || '')}</description>
      <content:encoded>${cdata(s.bodyHtml)}</content:encoded>
    </item>`;
  });
  write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${SITE_NAME} — Stories</title>
    <link>${SITE_URL}/stories.html</link>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>My stories of loss, love, and faith. ${TAGLINE}</description>
    <language>en-us</language>
    <image><url>${SITE_URL}/images/sbc-logo-512.png</url><title>${SITE_NAME}</title><link>${SITE_URL}</link></image>
    <lastBuildDate>${BUILD_DATE.toUTCString()}</lastBuildDate>
${items.join('\n')}
  </channel>
</rss>
`);
}

/* ---------- search index (pushed to Algolia by scripts/algolia-index.js) ---------- */
{
  const records = stories.map((s) => ({
    objectID: s.slug,
    title: s.data.title,
    excerpt: s.data.excerpt || '',
    body: plainText(s.body).slice(0, 9000),
    categories: s.cats,
    scriptures: s.refs,
    scripture_books: s.books,
    date: isoDate(s.data.date),
    date_ts: Math.floor(new Date(`${isoDate(s.data.date)}T12:00:00Z`).getTime() / 1000),
    year: s.year,
    url: `/stories/${s.slug}.html`,
  }));
  write('search-index.json', JSON.stringify(records));
}

console.log(`Built ${stories.length} stor${stories.length === 1 ? 'y' : 'ies'} (${allBooks.length} Bible book${allBooks.length === 1 ? '' : 's'} referenced), ${resources.length} resource(s), ${fingerprints.length} fingerprint(s), ${comments.length} approved comment(s) → ${path.relative(ROOT, DIST) || 'dist'}/${FIXTURES ? '  [QA fixtures included]' : ''}`);
