# Strong. Brave. Courageous. — strongbravecourageous.com

Static site for Becky, built by Digital Navigation Solutions. Hosted on Netlify. Content edited in Decap CMS (the maintained continuation of Netlify CMS) at `/admin/`.

## What's in the box

| Path | What it is |
|---|---|
| `src/templates/layout.html` | Site shell: head/meta, header + nav, footer (memorial line, Philippians 1:25, footer signup) |
| `src/pages/*.html` | Page bodies: `index`, `stories`, `story-template`, `about`, `fingerprints`, `newsletter`, `contact`, `thanks`, `404` |
| `src/css/styles.css` | All styling — brand palette, Plus Jakarta Sans / Inter, mobile-first |
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

## Newsletter service

Both signup forms (Newsletter page and footer) currently land in Netlify Forms. When Mailchimp is chosen:
- **Option A (simplest):** in `src/pages/newsletter.html` and the footer form in `layout.html`, replace `action="/thanks.html"` and the Netlify attributes with the Mailchimp embedded-form `action` URL and field name (`EMAIL`).
- **Option B (keep Netlify Forms):** connect Netlify Forms → Mailchimp with Zapier or Make so each submission becomes a subscriber.

## Copy rules honored in this build

All visible text uses the approved branding-card language, functional labels (form fields, buttons, nav), the memorial line, the Philippians 1:25 reference (KJV text, public domain), and the 988 crisis line. Every spot Becky needs to fill is a gold dashed box — search the CMS or the code for `[` placeholders.

## Tested

Build verified locally; every internal link resolves; pages rendered at 375px, 768px, and 1280px.
