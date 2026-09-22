#!/usr/bin/env node
/*
  Strong. Brave. Courageous. — site builder
  -------------------------------------------------
  Plain Node script (no framework). Reads:
    src/templates/layout.html   – site shell (header, nav, footer)
    src/pages/*.html            – page bodies with a small front-matter block
    content/stories/*.md        – blog posts written in Decap CMS
    content/fingerprints/*.md   – approved Fingerprints submissions
    content/comments/*.md       – approved story comments
    content/pages/*.md          – About / Newsletter / Contact text
  Writes everything to dist/ (the folder Netlify publishes).

  Run:  npm run build      (Netlify runs this automatically on every publish)
*/
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const CONTENT = path.join(ROOT, 'content');
const DIST = path.join(ROOT, 'dist');
const SITE_URL = (process.env.URL || 'https://strongbravecourageous.com').replace(/\/$/, '');
const CATEGORIES = ['Grief', 'Healing', 'Faith', 'Perseverance'];

marked.setOptions({ gfm: true, breaks: false });

/* ---------- helpers ---------- */
const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);
const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });
const write = (rel, html) => { const out = path.join(DIST, rel); ensureDir(path.dirname(out)); fs.writeFileSync(out, html); };
const escapeHtml = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n?---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  const data = {};
  m[1].split(/\r?\n/).forEach((line) => {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) return;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v === 'true') v = true; else if (v === 'false') v = false;
    data[kv[1]] = v;
  });
  return { data, body: m[2] };
}

function isPlaceholder(body) {
  const t = (body || '').trim();
  return t.startsWith('[') && t.endsWith(']');
}

/* Markdown → HTML. Bare YouTube/Vimeo links on their own line become responsive embeds.
   Placeholder text in [BRACKETS] renders as a gold dashed instruction box. */
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

function loadCollection(dir) {
  const full = path.join(CONTENT, dir);
  if (!exists(full)) return [];
  return fs.readdirSync(full)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data, body } = parseFrontMatter(read(path.join(full, f)));
      const slug = data.slug || slugify(f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''));
      return { file: f, slug, data, body };
    });
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : ''));
}

/* ---------- layout ---------- */
const layout = read(path.join(SRC, 'templates', 'layout.html'));

function renderPage({ title, description, nav, pathname, content, og_type = 'website', head_extra = '', structured_data }) {
  const active = {};
  ['home', 'stories', 'about', 'fingerprints', 'newsletter', 'contact'].forEach((n) => {
    active[`active_${n}`] = nav === n ? 'aria-current="page"' : '';
  });
  const sd = structured_data || {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Strong. Brave. Courageous.',
    url: SITE_URL,
    description: 'A faith-rooted community by Becky. Real stories. Braver tomorrows.',
  };
  return fill(layout, {
    title: escapeHtml(title),
    description: escapeHtml(description),
    site_url: SITE_URL,
    path: pathname,
    og_type,
    head_extra,
    structured_data: JSON.stringify(sd),
    content,
    year: String(new Date().getFullYear()),
    ...active,
  });
}

function loadPageTemplate(name) {
  const { data, body } = parseFrontMatter(read(path.join(SRC, 'pages', `${name}.html`)));
  return { data, body };
}

/* ---------- content ---------- */
const stories = loadCollection('stories')
  .filter((s) => s.data.draft !== true)
  .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));

const fingerprints = loadCollection('fingerprints')
  .filter((f) => f.data.approved === true)
  .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));

const comments = loadCollection('comments')
  .filter((c) => c.data.approved === true)
  .sort((a, b) => new Date(a.data.date) - new Date(b.data.date));

const pageContent = {};
['about', 'newsletter', 'contact'].forEach((n) => {
  const p = path.join(CONTENT, 'pages', `${n}.md`);
  pageContent[n] = exists(p) ? parseFrontMatter(read(p)) : { data: {}, body: '' };
});

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

/* ---------- story cards ---------- */
function storyCard(s) {
  const cat = CATEGORIES.includes(s.data.category) ? s.data.category : 'Healing';
  const catSlug = slugify(cat);
  return `
      <article class="card" data-category="${catSlug}">
        <div class="meta">
          <time datetime="${isoDate(s.data.date)}">${formatDate(s.data.date)}</time>
          <span class="tag tag-${catSlug}">${cat}</span>
        </div>
        <h3><a href="/stories/${s.slug}.html">${escapeHtml(s.data.title)}</a></h3>
        <p class="excerpt">${escapeHtml(s.data.excerpt || '')}</p>
        <a class="more" href="/stories/${s.slug}.html">Read the story &rarr;</a>
      </article>`;
}

/* ---------- static pages ---------- */
function buildSimple(name, vars = {}) {
  const { data, body } = loadPageTemplate(name);
  const html = renderPage({
    title: data.title, description: data.description, nav: data.nav, pathname: data.path,
    head_extra: data.head_extra || '', content: fill(body, vars),
  });
  write(name === 'index' ? 'index.html' : `${name}.html`, html);
}

buildSimple('index');
buildSimple('thanks');
buildSimple('404');

buildSimple('stories', {
  story_cards: stories.length ? stories.map(storyCard).join('\n') : '<p class="muted text-center">No stories published yet.</p>',
});

// About
{
  const { data, body } = pageContent.about;
  buildSimple('about', {
    about_body: renderBody(body),
    about_photo: data.photo
      ? `<img src="${escapeHtml(data.photo)}" alt="Becky" style="border-radius:12px;box-shadow:0 6px 24px rgba(31,41,55,.12);">`
      : '<div class="ph"><strong>[PHOTO]</strong> Upload a recent photo of yourself in the Site Pages → About screen.</div>',
  });
}

// Newsletter
buildSimple('newsletter', { newsletter_body: renderBody(pageContent.newsletter.body) });

// Contact
{
  const { data, body } = pageContent.contact;
  const email = data.email || '';
  const socials = [];
  const icon = {
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM17.5 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.4H7.4V14h2.8v8h3.3z"/></svg>',
  };
  if (data.instagram) socials.push(`<a href="${escapeHtml(data.instagram)}" aria-label="Instagram" rel="noopener" target="_blank">${icon.instagram}</a>`);
  if (data.facebook) socials.push(`<a href="${escapeHtml(data.facebook)}" aria-label="Facebook" rel="noopener" target="_blank">${icon.facebook}</a>`);
  buildSimple('contact', {
    contact_body: renderBody(body),
    contact_email: email.startsWith('[') ? `<span class="ph" style="padding:4px 10px;">${escapeHtml(email)}</span>` : `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`,
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
    : '<div class="ph" style="grid-column:1/-1;"><strong>Approved Fingerprints appear here.</strong> When someone shares a moment, Becky reviews it in Netlify Forms, then adds it under Fingerprints in the site editor and ticks "Approved".</div>',
});

/* ---------- story pages ---------- */
{
  const { data: tData, body: tBody } = loadPageTemplate('story-template');
  stories.forEach((s) => {
    const cat = CATEGORIES.includes(s.data.category) ? s.data.category : 'Healing';
    const related = stories.filter((o) => o.slug !== s.slug)
      .sort((a, b) => (b.data.category === cat) - (a.data.category === cat))
      .slice(0, 4);
    const storyComments = comments.filter((c) => c.data.story === s.slug);
    const vars = {
      story_title: escapeHtml(s.data.title),
      story_excerpt: escapeHtml(s.data.excerpt || ''),
      story_slug: s.slug,
      story_path: `/stories/${s.slug}.html`,
      story_date: formatDate(s.data.date),
      story_date_iso: isoDate(s.data.date),
      story_category: cat,
      story_category_slug: slugify(cat),
      story_body: renderBody(s.body),
      story_comments: storyComments.length
        ? storyComments.map((c) => `
            <li class="comment">
              <span class="who">${escapeHtml(c.data.name || 'Anonymous')}</span><span class="when">${formatDate(c.data.date)}</span>
              ${marked.parse(escapeHtml(c.body.trim()))}
            </li>`).join('\n')
        : '<li class="comment-note">No comments yet.</li>',
      related_posts: related.length
        ? related.map((r) => `<li><a href="/stories/${r.slug}.html">${escapeHtml(r.data.title)}</a><small>${formatDate(r.data.date)} &middot; ${r.data.category}</small></li>`).join('\n')
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
        headline: s.data.title,
        datePublished: isoDate(s.data.date),
        author: { '@type': 'Person', name: 'Becky' },
        description: s.data.excerpt || '',
        url: `${SITE_URL}${vars.story_path}`,
        articleSection: cat,
      },
    });
    write(`stories/${s.slug}.html`, html);
  });
}

/* ---------- sitemap + robots ---------- */
{
  const urls = ['/', '/stories.html', '/about.html', '/fingerprints.html', '/newsletter.html', '/contact.html',
    ...stories.map((s) => `/stories/${s.slug}.html`)];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${SITE_URL}/sitemap.xml\n`);
}

console.log(`Built ${stories.length} stor${stories.length === 1 ? 'y' : 'ies'}, ${fingerprints.length} fingerprint(s), ${comments.length} approved comment(s) → dist/`);
