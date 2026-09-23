# Strong. Brave. Courageous. — strongbravecourageous.com

Static site for Becky, built by Digital Navigation Solutions. Hosted on Netlify. Content edited in Decap CMS (the maintained continuation of Netlify CMS) at `/admin/`.

## What's in the box

| Path | What it is |
|---|---|
| `src/templates/layout.html` | Site shell: head/meta, header + nav, footer (memorial line, Philippians 1:25, footer signup) |
| `src/pages/*.html` | Page bodies: `index`, `stories`, `story-template`, `about`, `fingerprints`, `resources`, `newsletter` (hidden from nav until Jan 1, 2027), `contact`, `thanks`, `404` |
| `src/css/styles.css` | All styling — Sept 2026 brand palette (brown / rose / blue on cream), Lora + Plus Jakarta Sans, mobile-first |
| `src/js/search.js` + `src/js/vendor/` | Algolia InstantSearch on the Stories page (self-hosted libraries, no CDN) |
| `scripts/algolia-index.js` | Pushes stories to the Algolia index after every Netlify build |
| `netlify/functions/submission-created.js` | Adds newsletter signups (Netlify Forms) to the Mailchimp audience |
| `src/js/main.js` | Mobile menu + story category filters (no libraries) |
| `src/images/` + `src/*.png|ico` | Approved logo files exactly as provided (favicons included) |
| `content/` | Everything Becky edits: stories, fingerprints, comments, page text |
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

The Algolia Application ID and **Search-only** key are in `build.js` on purpose — the search key is public by design.

## Search (Algolia)

Flow: Becky publishes in Decap CMS → commit → Netlify runs `npm run build && node scripts/algolia-index.js` → `dist/search-index.json` is pushed to the `stories` index (settings + a clear-and-replace batch, so unpublished stories disappear too). The Stories page (`src/js/search.js`) searches title, excerpt, body, and category; filters by category; and filters by date range (`date_ts`). If Algolia is unreachable, the page still shows every story with the plain category buttons.

## Newsletter (Mailchimp)

- **Signup:** both forms (Newsletter page + footer) still post to Netlify Forms. The `submission-created` function fires on every submission and, for `newsletter` / `newsletter-footer`, upserts the email into the Mailchimp audience (tagged "Website footer" or "Newsletter page"). Other forms are ignored.
- **Auto-email on publish:** `dist/feed.xml` is a standard RSS 2.0 feed of published stories (placeholder posts are skipped). In Mailchimp, create an **RSS campaign** (Create → Email → Automations / "Share blog updates") pointing at `https://strongbravecourageous.com/feed.xml`, sent daily; Mailchimp emails subscribers only when a new item appears. The branded email template is in `mailchimp/rss-email-template.html`.
- **Newsletter page:** hidden from the menu until **January 1, 2027** (uncomment the two lines in `src/templates/layout.html`). `/newsletter.html` still works when shared and is `noindex` until then.

## Resources page

`content/pages/resources.md` (Site Pages → Resources page in the CMS). Until Becky fills it in, the page shows the placeholder plus four example category cards. The disclaimer / "Find a Counselor" / liability notice is fixed just under the site header and scrolls with the visitor.

## Brand (Sept 2026 identity guide)

Warm earth brown `#6B4733` (headings, buttons, dividers), story rose `#C85F69` (accents, links, tags), mountain blue `#648FA8` (quiet panels), cream `#F7F1E3`, charcoal `#1F2937`. Lora for headings, Plus Jakarta Sans for nav/body/buttons. Logo = the supplied circular illustration (PNG master `src/images/sbc-logo-1200.png`; sizes 16–512 + favicon + `og-image.jpg` generated from it). The brand guide asks for a simplified icon for favicons and a vector master — both still to come from Becky.

## Copy rules honored in this build

All visible text uses the approved branding-card language, functional labels (form fields, buttons, nav), the memorial line, the Philippians 1:25 reference (KJV text, public domain), and the 988 crisis line. Every spot Becky needs to fill is a gold dashed box — search the CMS or the code for `[` placeholders.

## Tested

Build verified locally; every internal link resolves; pages rendered at 375px, 768px, and 1280px.
