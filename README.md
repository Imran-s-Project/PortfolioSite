# Imran Ahmed — portfolio & content platform

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Firebase (Auth, Firestore, App Check) · ImgBB (image hosting) · Vercel.
A complete rebuild of the original vanilla-JS portfolio: same identity, same **ten projects**, same cinematic nature background — plus five full-site themes, a Bangla/English site, case-study pages, a block-based blog and a protected admin dashboard.

> **Status.** `npm run check` (type-check + ESLint + 263 tests) passes and the production build compiles. [Verification](#verification) says exactly what was run, how, and what could not be run in the sandbox where the latest repair pass was done.
> **Still to do on your side:** deploy the Firestore indexes (`firebase deploy --only firestore:indexes`), run `npm run build` and `npm run rules:test` once in Codespaces, and click through the admin once against your live Firebase project. Details: [docs/REPAIR_REPORT.md](docs/REPAIR_REPORT.md).

## Quick start
```bash
npm install
npm run check      # type-check + lint + all tests (about 30 seconds)
npm run build      # production build
npm run dev        # http://localhost:3000   (redirects to /bn or /en)
```
Node ≥ 20.9 (developed and tested on Node 22). Then follow **[docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)** (enable services, deploy rules **and indexes**, create the first admin) and deploy to Vercel.

### Commands
| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Development server / production build / serve the build |
| `npm run typecheck` | `tsc --noEmit` over the app, tests and tools |
| `npm run lint` | ESLint (Next.js + React Hooks v7 rules); no rule is switched off in the config |
| `npm test` | Unit and render tests (`tsx --test`, Node's own runner — no browser needed) |
| `npm run check` | typecheck + lint + test |
| `npm run diagnose:firestore` | Asks Firestore the same questions the public site asks and says what is wrong when one fails (missing index, rejected key, rules, network). Read-only; never prints the API key |
| `npm --prefix firebase-rules-tests install` then `npm run rules:test` | Security-rules tests in the Firebase emulator (needs Java 11+ and the Firebase CLI) |

### Environment variables
Copy `.env.example` to `.env.local` (never committed, never part of a ZIP) and fill in the values from the Firebase console.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | *Optional.* The site's own address is detected automatically — Vercel's production domain on Vercel, `http://localhost:3000` locally — and used for canonical URLs, the sitemap, share cards and the `Referer` the server sends with its Firestore reads. Set it only to force one specific address (for example a custom domain, or a host other than Vercel) |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `…_AUTH_DOMAIN`, `…_PROJECT_ID`, `…_STORAGE_BUCKET`, `…_MESSAGING_SENDER_ID`, `…_APP_ID`, `…_MEASUREMENT_ID` | Firebase web-app config. These identifiers are **public by design**; security comes from the Security Rules, App Check and the API-key restrictions in the setup guide. If a variable is missing the project's public web config in `src/config/firebase.ts` is used |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | App Check (reCAPTCHA v3) site key |
| `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN` | Local development only |
| `NEXT_PUBLIC_ENABLE_ANALYTICS`, `NEXT_PUBLIC_USE_EMULATORS` | Optional switches, both off by default |
| `IMGBB_API_KEY` | **Server-only** (no `NEXT_PUBLIC_`). The free API key from [api.imgbb.com](https://api.imgbb.com/) that the Admin Panel's image uploads use. Set it in `.env.local` and on Vercel (Settings → Environment Variables), then redeploy |

`IMGBB_API_KEY` is the only server-side secret in this app. Do not put it, a service-account file, a private key or any token into a variable that starts with `NEXT_PUBLIC_` — those are shipped to every browser.

### Images (ImgBB)
Images uploaded in the Admin Panel (media library, post covers, the editor, project screenshots) are hosted on ImgBB's free plan, not in Firebase Storage. Only the drag-and-drop zone's back end changed.
* **Key handling:** `/api/imgbb-key` gives the key to a signed-in administrator only (the same check as `/api/revalidate`); the browser keeps it in memory and uploads the file straight to ImgBB. The file does not pass through this site's server because Vercel Functions refuse request bodies over 4.5 MB and the Admin Panel accepts up to 5 MB.
* **Records:** each upload is still recorded in the `media` collection (url, size, dimensions, alt text …). `path` now holds `imgbb/<ImgBB id>` and `deleteUrl` holds ImgBB's delete link (readable by administrators only). No Firestore rules change is needed.
* **Deleting:** ImgBB's free API has no delete call, so *Delete* in the media library removes the image from the library but the file stays on ImgBB (articles that still use it keep working). To erase it completely, delete it in your ImgBB account.
* **Older images** stay where they are (Firebase Storage) and keep working: they are still listed, displayed and optimised. `storage.rules` is unchanged and only matters while that bucket is in use.

### Working from Codespaces and Termux
* **Codespaces** is the place to run everything: open the repository, `npm install`, `npm run check`, `npm run dev` (port 3000 is forwarded), later `npm run build` and, with Java and the Firebase CLI, `npm run rules:test`.
* **Termux** is good for git and for applying a ZIP. Next.js may not ship its native compiler for Android, in which case `npm run dev` / `build` there depend on a slower fallback or fail — *not tested here*; use Codespaces for those.
  Applying `NewLook-Fixed-Complete.zip` safely from Termux:
  ```bash
  cd ~/NewLook && git pull && git checkout -b fix/complete-audit
  unzip -q ~/storage/downloads/NewLook-Fixed-Complete.zip -d ~/newlook-fixed      # pkg install unzip rsync
  rsync -a ~/newlook-fixed/NewLook/ ./        # does not delete anything; .git and .env.local are not in the ZIP
  git status && git diff --stat               # review before you commit
  ```
  Because it is built from the repository state at the time of the repair, a `git pull` first and a review of `git diff` afterwards keep newer work of yours from being overwritten.

## What you get
| Area | What it does | Where |
|---|---|---|
| **Brand** | New logo: eight-pointed star (the original symbol) around an "IA" monogram; SVG mark, favicon, Apple/PWA icons, OG card | `src/components/brand`, `public/logo`, `src/app/icon.svg`, `tools/make-brand-assets.mjs` |
| **5 themes** | Obsidian Circuit · Aurora Matrix · Arctic Studio (light) · Terminal Forge · Ember Creative. One token file re-skins everything incl. admin; no flash on load; WCAG-AA contrast is **tested** | `src/styles/tokens.css`, `src/components/theme`, `tests/themes.test.ts` |
| **Intro** | Logo draws itself, name rises, light beam, progress bar driven by real readiness signals; once per session; skipped for reduced motion; skippable; hard 3.2 s ceiling | `src/components/layout/IntroLoader*` |
| **Header** | Glass capsule that condenses on scroll, sliding active pill, scroll-linked gradient edge, magnetic links (desktop), language switch, theme picker, motion pause/play, search (Ctrl/⌘K), mobile sheet | `src/components/layout/SiteHeader*` |
| **Footer** | Three steps, top to bottom: an invitation to get in touch → who the site belongs to (name, one line, social icons) beside where to go, what to take (CV, privacy, sitemap) and how to reach the owner (e-mail, availability) → the small print. Server-rendered, no client JavaScript, follows every theme, one column on a phone, four on a desktop; hides parts that have no data (no social links ⇒ no empty "Follow" heading) | `src/components/layout/SiteFooter.tsx`, footer block of `src/styles/site.css`, `tests/footer.test.tsx` |
| **Nature engine** | 6 scroll-crossfaded scenes, adaptive quality tiers, Save-Data, frame-rate guard, visibility pausing, poster/gradient fallbacks, WebGL → CSS → none mist, pointer parallax, pause control. If the GPU takes the WebGL context away the layer switches to the CSS mist (`switchToCssMist()`) with no error; destroying the layer hands the GPU context back. Light themes get a pale veil. The repository ships Mixkit footage for all six scenes (`public/nature`, credits in `CREDITS.md`); a scene without footage falls back to its gradient look. Replace or add clips: `docs/nature/README.md` | `src/lib/nature`, `src/styles/nature.css`, `tests/atmosphere.test.ts` |
| **Projects** | All 10 preserved. Cards with generated theme-coloured tiles (no invented screenshots), category/technology filters, search, featured, **case-study pages** that show only data that exists, related projects | `src/data/seed-projects.ts`, `src/components/projects` |
| **Blog + CMS** | Categories, tags, search, **pagination (9 per page)**, reading time, TOC, reading-progress bar, share, related, view counter, JSON-LD; **block editor** (12 block types, drag/keyboard reorder, inline formatting, image upload, live preview, autosave of drafts, publish/unpublish, revision history, SEO fields) that refuses to save what the public site could not show. How-to: [docs/BLOG_PUBLISHING.md](docs/BLOG_PUBLISHING.md) | `src/app/(site)/[locale]/blog`, `src/features/editor`, `src/components/blog` |
| **Admin** (`/admin`) | Dashboard, posts, projects (+import the 10), media library, categories, tags, messages inbox, SEO (+audit), settings, theme, analytics (real data only), profile, security | `src/app/(admin)`, `src/features/admin` |
| **Security** | Rules-enforced admin allow-list (`adminProfiles`), strict contact-form rules, view-counter rule, image-only/5 MB uploads, App Check wiring, no raw HTML anywhere (content is typed blocks + a strict inline parser), safe links only, `/api/revalidate` callable by administrators only | `firestore.rules`, `storage.rules`, `src/lib/utils/inline.ts`, `src/lib/server/admin-auth.ts` |
| **SEO** | Per-page metadata, canonical + hreflang, OG/Twitter, sitemap, robots, Person/WebSite/BlogPosting/Breadcrumb JSON-LD, correct `lang`, installable manifest | `src/lib/seo`, `src/app/sitemap.ts` |
| **i18n** | `/bn` and `/en` routes (cookie remembers choice), full UI + admin in both languages, Bangla typography (Hind Siliguri). Dates are always formatted in `Asia/Dhaka`, so the server and the browser print the same text | `src/i18n`, `src/proxy.ts`, `src/lib/utils/dates.ts` |

## Editing content
* **Projects:** Admin → Projects → *Import built-in projects* (optional) → edit. Add real case-study text, technologies and screenshots; empty sections never show.
* **Articles:** Admin → Posts → New. Bangla and English content are separate tabs; a visitor gets their language, or the other with a notice. Step by step: [docs/BLOG_PUBLISHING.md](docs/BLOG_PUBLISHING.md).
* **Site facts** (email, CV, social links, availability badge, showcase video, maintenance mode, default theme, SEO): Admin → Settings / SEO / Theme. A social-links list you empty on purpose stays empty on the site (hero, contact section and footer all hide it).
* Owner copy that is not editable in Admin (hero, about, skills) lives in `src/data/legacy/*.json` (generated from the old site; edit the JSON).
* New nature footage: see `docs/nature/README.md` (`npm run nature:assets`).

## Decisions worth knowing
* **No GSAP / Three.js.** IntersectionObserver + CSS + Motion for React cover every effect here with far less JavaScript.
* **Publishing is immediate — no scheduled posts.** True scheduling needs a backend scheduler (Cloud Function/cron with Admin credentials); a front-end-only version would leak "unpublished" text. Not faked.
* **Server reads use the Firestore REST API** (works without credentials; same rules as any visitor). Therefore keep **App Check in *monitor* mode for Firestore** (details in the setup guide). A failed read is **never** turned into "no posts" or a 404 at run time — the page keeps serving its last good version and the log names the cause. Only `next build` degrades, so a short Firestore outage cannot fail a deploy.
* **The blog queries need two composite indexes** (`firestore.indexes.json`). They must be *deployed*; until they are, the site still works (it falls back to sorting in memory and logs the link to create the index), but fix it — see the setup guide.
* **Blog lists show the newest 100 published posts**, paginated in the browser (9 per page). Category pages show the newest 100 of the category, the search index covers the newest 200 posts and the sitemap the newest 500; every published post stays reachable by its own URL. A server-side "page N" route is the follow-up if you ever publish far more than that.
* **The view counter is a vanity counter.** The rules let any visitor add 1 to a published post, so a determined visitor can inflate it. Do not use it for decisions.
* **Slug uniqueness is checked by the editor before saving.** Two administrators saving the same brand-new slug in the same second could still both succeed; with one author this does not happen in practice.
* **Single-author blog.** A post stores `authorId` (the administrator who created it) and its structured data names the site owner; there is no per-post byline field.
* **In articles the editor offers headings H2–H4** — the page title is the only H1.
* **Collections not created:** `users` (no public accounts), `testimonials` (none exist — nothing invented), `navigation` (static). `adminProfiles`, `projects`, `blogPosts` (+`revisions`), `blogCategories`, `blogTags`, `media`, `contactMessages`, `siteSettings`, `activityLogs` are.
* **No email notifications** (would need a server-side provider key). Messages arrive in Admin → Messages.
* **No service worker** (installable manifest only): offline-caching 20 MB of footage would hurt more than help.
* **No Content-Security-Policy header yet.** A strict CSP needs per-request nonces, which would make every page dynamic. Basic hardening headers are set in `next.config.ts`.
* Admin lists load the newest 100–200 records and paginate in the browser. Revision history keeps the latest 30 saves per post.

## Verification
What was run in the sandbox where the latest repair pass was done (Linux, Node 22, no access to Google services):

| Check | Result |
|---|---|
| `npm run typecheck` | passed — 0 errors |
| `npm run lint` | passed — 0 errors; **no new `eslint-disable`, no rule turned off, no `any`, no `@ts-ignore`** (the 8 one-line `@next/next/no-img-element` exceptions for user-uploaded images were already in the original and are unchanged); the ESLint and `tsconfig` changes make the checks *stricter* (the `tools/*.ts` scripts are now linted and type-checked too) |
| `npm test` | passed — 263 tests in 55 suites (utilities incl. XSS cases, Zod schemas, Firestore REST codec and failure classification, hydration safety in several time zones, blog data layer, pagination, editor save logic, settings parsing, admin check for `/api/revalidate`, footer, social links, WebGL context-loss recovery, themes, i18n parity, SEO/JSON-LD, server rendering of the public components with React 19) |
| `npm run check` | passed |
| Production build | `next build --webpack` **compiled, type-checked and generated all 53 pages**. Run with Google Fonts mocked (the sandbox cannot reach fonts.googleapis.com) and with Firestore unreachable, so those pages were built from defaults |
| Headless Chromium (dev server, fonts mocked) | footer at 320 / 390 / 820 / 1360 px in English and Bangla, and at 320 / 390 / 1360 px in each of the five themes: no horizontal overflow, no link or button under 38 px tall. Blog pager at 320 / 390 / 1280 px with a temporary route of fake posts (page turns, focus moves to the list, filters reset to page 1). 10 routes (desktop and touch) logged no hydration or runtime errors |

**Not run — please do:**
* `npm run build` with Next's default bundler (Turbopack) and real fonts, in Codespaces or on Vercel. Turbopack cannot use the font mock, so the sandbox could only build with webpack.
* `npm run rules:test` — the Firebase emulator could not be downloaded in the sandbox. `firestore.rules`, `storage.rules` and `firebase-rules-tests/` were **not changed**.
* Anything that needs your live Firebase project: sign-in, the admin screens, uploads, publishing, the contact form, App Check. The editor's save logic is covered by unit tests, but the screens themselves have not been clicked through.
* A real GPU context loss in a real browser (the recovery is unit-tested with a stand-in WebGL context).
* Lighthouse / Core Web Vitals on the deployed site.

Documentation: [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) · [docs/BLOG_PUBLISHING.md](docs/BLOG_PUBLISHING.md) · [docs/REPAIR_REPORT.md](docs/REPAIR_REPORT.md) (what was found and fixed) · [docs/AUDIT.md](docs/AUDIT.md) (the original vanilla site and how it was migrated) · [docs/nature/README.md](docs/nature/README.md).
