# Strong. Brave. Courageous. — strongbravecourageous.com

Static site for Becky, built by Digital Navigation Solutions. Hosted on Netlify. Content edited in Decap CMS (the maintained continuation of Netlify CMS) at `/admin/`.

## What's in the box

| Path | What it is |
|---|---|
| `src/templates/layout.html` | Site shell: head/meta, celebration line ("In celebration of Steve, Mason, and Josh."), header + nav, footer (nav, signup, copyright, Disclaimers link) |
| `src/pages/*.html` | Page bodies: `index`, `stories`, `story-template`, `scripture`, `about`, `fingerprints`, `resources`, `newsletter` (hidden from nav until Jan 1, 2027), `contact`, `thanks`, `404` |
| `lib/scripture.js` | Bible-reference detection: book table (canonical order + short names), the regex, BibleGateway links, `BIBLE_VERSION` |
| `qa/fixtures/` | Test stories + resources for local QA only (`QA_FIXTURES=1 npm run build`); never published |
| `src/css/styles.css` | All styling — Sept 2026 brand palette (brown / rose / blue on cream), Lora + Plus Jakarta Sans, mobile-first |
| `src/js/search.js` + `src/js/vendor/` | Algolia InstantSearch on the Stories page (self-hosted libraries, no CDN) |
| `scripts/algolia-index.js` | Pushes stories to the Algolia index after every Netlify build |
| `netlify/functions/submission-created.js` | Adds newsletter signups (Netlify Forms) to the Mailchimp audience |
| `src/js/main.js` | Mobile menu, static story filters (fallback when Algolia is down), Resources tabs + filter box (no libraries) |
| `src/images/` + `src/*.png|ico` | Approved logo files exactly as provided (favicons included) |
| `content/` | Everything Becky edits: stories, resources (one file per item), fingerprints, comments, page text |
| `admin/` | Decap CMS editor (`index.html` + `config.yml`) |
| `build.js` | Plain Node script — turns `src/` + `content/` into `dist/` |
| `netlify.toml` | Build command, publish folder, headers, friendly redirects |
| `BECKY-CHEAT-SHEET.md` | Plain-English instructions for Becky |

Only dependency: `marked` (Markdown → HTML). No frameworks.

## Why there's a build step

Decap CMS saves Becky's posts as Markdown files in GitHub. Plain HTML can't display those on its own, so `build.js` runs on Netlify every time she publishes (about 20 seconds) and writes real HTML pages into `dist/`. Result: true static HTML, full SEO, every story is its own page.

## Local preview

```bash
npm install
npm run build          # writes dist/
npx serve dist         # open the URL it prints
```

## Deploy — step by step

1. **GitHub**: create a new private repo (e.g. `strongbravecourageous`), push this folder to the `main` branch (`dist/` and `node_modules/` are git-ignored).
2. **Netlify → Add new site → Import from Git** → pick the repo. Netlify reads `netlify.toml`, so build command (`npm run build`) and publish folder (`dist`) fill in automatically. Deploy.
3. **Forms**: Netlify → Site configuration → Forms → *Enable form detection*. Redeploy once. You'll then see `contact`, `newsletter`, `newsletter-footer`, `fingerprint`, and `comment` under Forms. Add Becky's email under *Form notifications* so she gets each submission.
4. **Identity (CMS login)**: Site configuration → Identity → *Enable Identity*. Under *Registration* choose **Invite only**. Under *Services → Git Gateway* click **Enable Git Gateway**.
5. **Invite Becky**: Identity tab → *Invite users* → her email. She clicks the link in the email, sets a password, and lands in `/admin/`.
6. **Domain**: Domain management → add `strongbravecourageous.com`. At WordPress.com, point the domain at Netlify's nameservers (Netlify shows them). HTTPS is automatic once DNS propagates.
7. **Analytics (later)**: paste the GA4 `gtag` snippet where the comment says so in `src/templates/layout.html`, commit, done.

### Drag-and-drop alternative (no CMS)
Run `npm run build` locally and drag the `dist/` folder onto Netlify. Works for a preview, but the CMS needs the GitHub connection, so use the Git route for the live site.

## How moderation works

Netlify Forms is the inbox; Decap CMS is the publisher. Nothing appears on the site until Becky puts it there.

- **Stories** — written directly in the CMS. Editorial workflow is on, so each story moves Draft → In review → Ready → Publish.
- **Fingerprints** — visitor submits the form → arrives in Netlify Forms (and Becky's email). To publish one, Becky opens CMS → Fingerprints → New, pastes the name and text, adds the photo if there was one, ticks **Approved**, and publishes.
- **Comments** — same pattern: form → Netlify Forms → Becky adds it under CMS → Comments, picks the story, ticks **Approved**, publishes. Approved comments show under the story in Inter with a soft background box; the story itself is in Plus Jakarta Sans.
- **Spam** — every form has a honeypot field. Netlify also filters with Akismet.

## Environment variables (Netlify → Site configuration → Environment variables)

| Name | Used by | Notes |
|---|---|---|
| `ALGOLIA_WRITE_KEY` | `scripts/algolia-index.js` (build) | Algolia **Write** API key. Never commit it. Without it the build still succeeds; the index just isn't refreshed. |
| `MAILCHIMP_API_KEY` | `netlify/functions/submission-created.js` | Mailchimp API key (ends in `-us18`). |
| `MAILCHIMP_AUDIENCE_ID` | same | ID of the "Story Subscribers" audience (Mailchimp → Audience → Settings → *Audience name and defaults*). |
| `MAILCHIMP_DOUBLE_OPT_IN` | same, optional | `true` sends a confirmation email first. Default: subscribe immediately. |
| `PREVIEW` | `build.js` | Set to `true` **only on the preview site** (sbc-preview.netlify.app, built from the `redesign` branch). Every page gets `noindex, nofollow` and the build writes a `_headers` file with `X-Robots-Tag: noindex, nofollow`. Never set it on production. |

**Site address.** `SITE_URL` in `build.js` is fixed to `https://strongbravecourageous.com`. Canonical, Open Graph, Twitter, sitemap, robots, feed, and structured data all use it on every build, including the preview site, so a preview page never claims to be the real one. It no longer reads Netlify's `URL` variable.

**Preview site.** A second Netlify site builds the `redesign` branch for Becky's review. It has `PREVIEW=true` and nothing else: no `ALGOLIA_WRITE_KEY` (the index script skips itself), no Mailchimp keys (signups stay in that site's Netlify Forms only), no form notifications, and Identity off. Its search box reads the live `stories` index (read-only).

**Placeholder stories.** A story whose title or body is still `[bracketed instructions]` is a placeholder (`isPlaceholderStory` in `build.js`). Its page is built so Becky can see it, and it carries `noindex`, but it stays out of `sitemap.xml` and `feed.xml`.

**Structured data.** Homepage: `WebSite` + `Person` (Becky). Stories: `BlogPosting` with Becky as author and publisher. Other pages: `WebPage`. Keep the Person description identical to the homepage intro sentence.

**Security headers** (`netlify.toml`): `Strict-Transport-Security: max-age=31536000` with no `includeSubDomains` and no `preload` (subdomains belong to WordPress.com), plus `Permissions-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy`.

**Analytics.** Cloudflare Web Analytics (cookieless, no banner needed). The snippet and token live in `build.js` (`CF_BEACON_TOKEN`) and are added before `</body>` only when Netlify reports `CONTEXT=production` and `PREVIEW` is not set, so the preview site and local builds are never counted. **Never delete the site from the Cloudflare dashboard**: the token would stop working.

**Thank-you pages.** Each form lands on its own page: newsletter and footer signup → `/thanks-signup.html`; contact → `/thanks-message.html`; fingerprint → `/thanks-fingerprint.html`; comment → `/thanks-comment.html`. All are `noindex`. `/thanks.html` remains as a general fallback. The signup page tells readers to confirm by email, so the production site needs `MAILCHIMP_DOUBLE_OPT_IN=true`.

**Share image per story.** Stories have an optional "Share image" field (`share_image`). When set, it becomes that story's `og:image`, `twitter:image`, and `BlogPosting` image; otherwise `images/og-image.jpg` is used.

**Logo files.** Pages load WebP copies (`sbc-logo-64/128/256/280/560/840.webp`) made from `sbc-logo-1200.png`. The PNG originals stay in `src/images/` and are still used for the feed and the share picture.

**Crisis line.** The footer on every page carries the 988 line (`.footer-crisis` in `layout.html`).

**Favicons.** `src/favicon.ico`, `sbc-logo-16.png`, `sbc-logo-32.png`, `favicon-48.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, and `site.webmanifest`, all generated from `src/images/sbc-logo-1200.png`. Any `.ico`, `.png`, `.txt`, `.xml`, or `.webmanifest` file directly inside `src/` is copied to the site root.

The Algolia Application ID and **Search-only** key are in `build.js` on purpose — the search key is public by design.

## Stories: categories, year groups, search

**Categories are labels, not folders.** Five: Grief, Healing, Faith, Perseverance, Humor (`CATEGORIES` in `build.js`; also in `admin/config.yml`, the pill row in `src/pages/stories.html` is generated). A story carries a `categories` list (Decap select, `multiple: true`); `build.js` also accepts the old single `category` string, so older posts still build. Cards, story pages, the feed, JSON-LD, and the search record all list every category.

**Year groups.** The unfiltered Stories page is rendered server-side as one `<details class="year-group">` per year, newest first. The current year (from the build date, `CURRENT_YEAR`) is open; earlier years are collapsed with a "2025 · 41 stories" summary. Netlify rebuilds on every publish, so when January comes the previous year folds up on its own. Nothing is archived or hidden from search.

**Search (Algolia).** Flow: Becky publishes in Decap CMS → commit → Netlify runs `npm run build && node scripts/algolia-index.js` → `dist/search-index.json` is pushed to the `stories` index (settings + a clear-and-replace batch, so unpublished stories disappear too). Records carry `categories` (array), `scriptures` (canonical references), `scripture_books`, `date_ts`, `year`. Index settings (`scripts/algolia-index.js`): `searchableAttributes` title, excerpt, scriptures, scripture_books, categories, body; `attributesForFaceting` categories + scripture_books; `customRanking desc(date_ts)` so every result list is newest first.

`src/js/search.js`: category pills and Scripture pills are `refinementList` widgets with `operator: 'or'` (multi-select; "All" clears both rows). Any active query, pill, or date range hides the year view and shows one flat `#story-grid` of hits; clearing everything restores the year view. `main.js` provides the same OR/flat behavior statically (`data-categories` / `data-books` on each card) if Algolia never answers.

## Scripture detection

`lib/scripture.js` scans each story (title + excerpt + body text) at build time. It supports full and common short book names ("1 Cor", "Jn", "Ps", "Phil"), chapter-only references ("Psalm 23"), single verses, ranges with a hyphen or en dash, and verse lists ("John 3:16, 17"), normalizing to canonical form ("1 Corinthians 13:4–7"). A book name is required, so times like "10:30" never match. Two deliberate limits: books whose names are also first names (John, Mark, Luke, James, Ruth, Daniel, Job, …) need chapter:verse, so "John 3 came over" stays a person; and **"Josh" is not an abbreviation for Joshua on this site** because Josh is one of the people the site celebrates — write "Joshua". The book table (`BOOK_TABLE`, canonical order for sorting) and the regex (`REF_RE`) live in that file, as does `BIBLE_VERSION` (`'NIV'`) — one constant that changes every BibleGateway link (chips, in-text links, /scripture.html, homepage Joshua 1:9).

Output: verse chips on cards and under story titles (`.verse-chip`, brown outline, opens BibleGateway in a new tab); the same references linked in the story body (`linkReferences` wraps only text nodes outside existing `<a>` tags — Becky's words are untouched); `scriptures` + `scripture_books` on each search record; a Scripture pill row on the Stories page listing the books that appear; and `/scripture.html` — every referenced passage grouped by book in Bible order, each chip followed by the stories it appears in (newest first). With no references yet, that page shows a rose placeholder. No CMS field is involved.

## Newsletter (Mailchimp)

- **Signup:** both forms (Newsletter page + footer) still post to Netlify Forms. The `submission-created` function fires on every submission and, for `newsletter` / `newsletter-footer`, upserts the email into the Mailchimp audience (tagged "Website footer" or "Newsletter page"). Other forms are ignored.
- **Auto-email on publish:** `dist/feed.xml` is a standard RSS 2.0 feed of published stories (placeholder posts are skipped). In Mailchimp, create an **RSS campaign** (Create → Email → Automations / "Share blog updates") pointing at `https://strongbravecourageous.com/feed.xml`, sent daily; Mailchimp emails subscribers only when a new item appears. The branded email template is in `mailchimp/rss-email-template.html`.
- **Newsletter page:** hidden from the menu until **January 1, 2027** (uncomment the two lines in `src/templates/layout.html`). `/newsletter.html` still works when shared and is `noindex` until then.

## Resources

A CMS collection, `content/resources/*.md`, one file per item (Decap: **Resources** → New Resource; slug `{{type}}-{{slug}}`). Fields: `type` (Book · Music · Podcast · Publication), `title`, `by` (author / artist / show / publication / organization), `date` (optional; drives podcast + publication ordering and the archive), `link`, `note`, `show` (boolean, default true — hide without deleting).

`build.js` does all ordering (`RESOURCE_TYPES`, `ARCHIVE_YEARS`); Becky never orders by hand:

| Tab | Grouping | Order |
|---|---|---|
| Books | none | title A–Z, ignoring a leading "A", "An", "The"; author on the secondary line |
| Music | none | song title A–Z; artist on the secondary line |
| Podcasts | by show, shows A–Z | episodes newest first within a show; date shown |
| Publications | by publication, A–Z | titles A–Z within a publication; date shown |

Podcasts and Publications dated more than `ARCHIVE_YEARS` (10) years before the build date fold into a collapsed "Older" group at the bottom of that tab; Books and Music never archive. The Psychology Today "Find a Counselor" button and the 988 panel are a fixed block under the tabs (`#professional-help`), not a resource type. Tabs are buttons with the active tab in the URL hash (`#podcasts`); each tab has a client-side filter box (`main.js`) matching title, by-line, and note. Empty tabs show a rose placeholder. Disclaimer + liability text sit at the bottom at `#disclaimers` (the footer "Disclaimers" link points there); the old sticky red notice is gone. The old `content/pages/resources.md` markdown page was removed.

## Brand: Wildflower palette (Oct 2026)

Mountain blue opens the page, clay rose frames the logo and marks the actions, and the brown of the wooden cross carries the words. All colors are CSS custom properties at the top of `src/css/styles.css`; change a value there, never in a rule.

| Token | Hex | Role |
|---|---|---|
| `--field` | `#4A7590` | Opening section on Home. All text on it is paper. |
| `--ridge` | `#3D6474` | Back ridge layer (decoration). |
| `--blue` | `#648FA8` | Decoration and chip edges only, never text. |
| `--rose` | `#B4505B` | Logo ring, ridge line, primary buttons on paper, active nav item. |
| `--rose-deep` | `#93404A` | Text on paper buttons, hover. |
| `--link` | `#A9454F` | Links and small rose text. |
| `--brown` | `#5A3D2B` | Celebration bar, header text, headings, the one band. |
| `--ink` / `--muted` | `#3A2A20` / `#6E5A4E` | Body text / dates and meta. |
| `--paper` / `--blush` | `#FFFDFA` / `#F7EDEC` | Page / quiet panels. |
| `--tag-bg` / `--tag-text` | `#F7E1E2` / `#8E3540` | Category tags. |
| `--chip-bg` / `--chip-text` | `#E3ECF2` / `#21444E` | Scripture chips. |
| `--wood` | `#3A281D` | Footer (text `#F1E7E1`, muted `#C2B0A5`, button `#E99AA1` with `#1F1A17` text). |
| `--rule` / `--line` | `#E8DAD6` / `#8C7A6E` | Hairlines / form and control borders (3:1). |

Rules: mountain blue is the only full color field at the top of a page, and the one other band uses cross-brown (`.band`). The button on blue is paper with rose-deep text (`.btn-field`). Rose stays small. Focus outlines are brown on paper and paper on the blue field, the band, and the footer. Every text pairing passes WCAG 2.2 AA; re-check after any hex change. `theme-color` is `#5A3D2B`. Retired: cream `#F7F1E3`, earth brown `#6B4733`, story rose `#C85F69`, footer `#3E2A20`, charcoal `#1F2937`.

Logo: the supplied circular illustration, never altered (PNG master `src/images/sbc-logo-1200.png`). On the opening it sits in a 5px paper ring and a 7px clay-rose ring (CSS `box-shadow` on `.hero-logo`). The three-layer ridge at the bottom of the opening is an inline SVG in `src/pages/index.html`, traced from the logo's mountain skyline. The share picture `src/images/og-image.jpg` (1200 × 630) shows the framed logo on the blue field with the ridge. The Mailchimp email uses paper background, a mountain-blue header bar, clay-rose buttons, and cross-brown text (`mailchimp/rss-email-template.html` is the reference; the live email is edited in Mailchimp).

## Copy rules honored in this build

First-person voice everywhere (Becky is talking: "my", never "our"; buttons say "Read the Stories", not "Becky's"). No past tense about healing anywhere. Tagline is "One foot in front of the other." (site-wide constant `TAGLINE` in `build.js` for meta/feed; literal in templates). "Brighter tomorrow", never "braver". "In celebration of Steve, Mason, and Josh." is the celebration line at the top of every page (`layout.html`). Joshua 1:9 (NIV) sits on the homepage under the primary button, linked to BibleGateway. Every spot Becky still needs to fill is a rose dashed `.ph` box — search the CMS or the code for `[` placeholders.

Fingerprints form: a required `audience` radio (`everyone` / `becky`) arrives in the Netlify Forms submission; the CMS Approved toggle reminds Becky to approve only "Share it with everyone" moments.

Logo: raster art only (1254px master). Every logo `<img>` carries `srcset` (hero 512/1200, header + footer 128/256) with `sizes`, plus `width`/`height`; never display the logo larger than 300px.

## Local QA

```bash
QA_FIXTURES=1 DIST_DIR=/tmp/sbc-qa node build.js   # includes qa/fixtures (test stories with two categories + three verses, resources for every sort rule)
npm run build                                       # production build, fixtures excluded
```

Build verified locally with fixtures; every internal link resolves; pages rendered at 375px, 768px, and 1280px; pills, search, date range, year/flat swap, Resources tabs and filter, and the fallback path exercised in a headless browser.
