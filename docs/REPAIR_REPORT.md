# Repair report — what was found, what was changed, what is still yours to do

Base: the repository at commit `780f5df` ("Initial project upload", branch `main`). Nothing was committed or pushed. 39 tracked files changed (+1,223 / −361 lines) and 21 files were added (listed at the end).
How things were checked, and what could **not** be checked from the sandbox where this was done, is in the README's [Verification](../README.md#verification). This page is the detail behind it.

| | Before | After |
|---|---|---|
| `npm run check` | ESLint: **8 errors** | typecheck, ESLint (0 errors) and **263 tests** (105 before) pass |
| Hydration | React hydration error from `ShareBar`; dates could differ between server and browser | none found (10 routes × desktop/touch in headless Chromium; tests in 5 time zones) |
| `[firestore] … HTTP 400` | status code only, then silently treated as "no posts" | cause named with the fix, never hidden, diagnostic command, safe fallback |
| Footer | long vertical list on phones, links under 36 px tall, brand block with a large empty gap, no e-mail/CV | redesigned, see section 7 |
| Blog editor | could create duplicates, drop edits made during a save, or save an article the site could not display | guarded and tested, see section 5 |
| Blog list | one endless page | 9 per page with an accessible pager |

---

## 1. The eight ESLint errors (fixed, not silenced)
No `eslint-disable`, no rule changed, no `any`, no `@ts-ignore` was added; the `eslint.config.mjs` / `tsconfig.json` changes make the checks stricter (`tools/*.ts` are now linted and type-checked).

| # | File | Rule | Cause | Fix |
|---|---|---|---|---|
| 1 | `admin/analytics/page.tsx` | `react-hooks/purity` | `Date.now()` while rendering | the clock is read when the data is loaded (`loadedAt`) |
| 2–7 | admin `media`, `messages`, `posts`, `projects`, `MediaPicker`, `TaxonomyManager` | `react-hooks/set-state-in-effect` | `setState` called straight from an effect to load data | new hook `src/features/admin/useResource.ts`: one request per question, state is written only when the request settles, the newest answer wins, a stale or unmounted answer is ignored, StrictMode sends one request, `reload()` keeps the old data visible. Used by the list screens (`projects`, `posts`, `media`, `messages`, `analytics`) and by the two shared components `MediaPicker` and `TaxonomyManager` (which serves `categories` and `tags`) |
| 8 | `lib/nature/atmosphere.ts` | `react-hooks/rules-of-hooks` | a function named `useCss` was not a hook | renamed `switchToCssMist()` — same behaviour |

## 2. Nature background (WebGL → CSS fallback)
* `atmosphere.ts` was read in full. A lost WebGL context (`webglcontextlost`) calls `preventDefault()`, removes the canvas and continues with the CSS mist; if the device profile says "no mist" it ends in `none`. The frame task goes to sleep without drawing on a dead context. `destroy()` removes the resize and context-loss listeners and the frame task, hands the GPU context back (`WEBGL_lose_context`, in a try/catch) and removes the layer. Reduced motion renders a single still frame. The loop runs at 24 fps on the shared ticker; the shader is one oversized triangle.
* **`tests/atmosphere.test.ts`** (a small fake browser with a recording WebGL context): starts in WebGL; context loss → CSS mist, no throw, nothing drawn afterwards, colours still follow the scene; repeated loss and loss-after-destroy are harmless; "no mist" profile; `getContext` returning nothing / throwing / shader compile failure / link failure → CSS mist from the start; CSS/none profiles never touch WebGL; reduced motion; `destroy()` is complete and idempotent, also when `loseContext` throws.
* Limits: a real GPU context loss in a real browser was not provoked. After a loss the page stays on the CSS mist until reload (there is no `webglcontextrestored` handler — simple and robust, at the cost of staying on the lighter look). The rest of the nature engine (scene manager, ticker, quality profile) was read for how it connects to the mist layer but not rewritten. The repository ships footage for all six scenes (`public/nature`, about 22 MB — it is why the ZIP is that big); video playback and frame rate on real devices were not measured here.

## 3. Hydration
* **Cause 1 — `ShareBar`:** it decided on `navigator.share` while rendering, so the server HTML (no button) differed from the browser's first render (button). Now the first render never depends on the browser (`useIsClient()`); the native-share button is added after hydration. The share URLs moved to `src/lib/utils/share.ts` (properly encoded, tested).
* **Cause 2 — dates:** `formatDate` used the machine's time zone, so the server (UTC) and a reader elsewhere could print different days — a mismatch for React and a wrong date for readers. Dates and the copyright year now use the site's zone (`SITE_TIME_ZONE = 'Asia/Dhaka'`).
* **Audit:** the source was searched for render-time use of `window`, `navigator`, `localStorage`, `Date`, `Intl` and randomness; the two causes above are what it found. `tests/hydration.test.tsx` renders `ShareBar` and `PostCard` while pretending to be different browsers and five time zones (UTC, Dhaka, Los Angeles, Kiritimati, Pago Pago) and requires identical output. In headless Chromium, 10 routes (`/en`, `/bn`, blog, about, projects, a project, privacy, admin login — desktop and touch) produced no hydration or runtime errors.
* Limit: pages that need Firestore data (blog index, articles) cannot render with real data in the sandbox; the blog list and pager were exercised through a temporary route with fake posts, which was removed afterwards.

## 4. Firestore `HTTP 400` on `blogPosts`
* **Finding:** the public blog runs two queries that combine a filter with a sort order (`status == published` + newest first, with and without a category). Firestore answers these only with a **composite index**; both are defined in `firestore.indexes.json`, but a deploy of the rules alone does not create them, and without them Firestore replies **HTTP 400 `FAILED_PRECONDITION`**. The original code logged only the status and then returned an empty list — so an index problem looked like "the blog is empty", and Next could cache that page.
* **What you will see now:** `[firestore] query on "blogPosts" failed: HTTP 400 FAILED_PRECONDITION [missing-index] — … <link that creates the index> — <what to do>`. Twelve failure kinds are told apart (missing index, invalid API key, other malformed query, API-key restriction, disabled API, rules, no database, not found, quota, unreachable, bad response, unknown); Google's error text is read, stripped of anything key-shaped, clipped, and logged at most once every few minutes per cause. The API key is never printed.
* **Behaviour:** a missing index no longer takes the page down — the query is repeated without its sort order and sorted in memory (and the cause is still logged). Any other failure at run time is *not* turned into "no posts" or a 404: the page keeps serving its last good version (or the error page when there is none). During `next build` a failure is tolerated (empty value, regenerated within a minute) so a short outage cannot fail a deploy. Decoration reads (filter-chip names, related posts, home-page teasers) may be empty (`required: false`).
* **Server calls send `Referer: <site URL>/`**, so an API key restricted to HTTP referrers accepts them (the cause of a different 403).
* **Diagnostics:** `npm run diagnose:firestore` asks the same queries and prints cause + fix + index link for each failure.
* **What I could not do:** reach your Firestore. Which cause produced *your* 400 is therefore not observed; a missing index is by far the most likely, and the command tells you for certain. Firebase Console action needed: deploy the indexes (see `docs/FIREBASE_SETUP.md`). Nothing was deployed, App Check was not enforced on Firestore, no collection was made public, no rule was weakened, no production data was touched.

## 5. Blog CMS (`/admin/posts`, `/admin/posts/new`, `/admin/posts/[id]`)
The screens, block editor (12 block types), draft/publish/unpublish, live preview, revisions, SEO fields and categories/tags were already there. This pass fixed the ways they could lose or corrupt data:

| Problem | Fix |
|---|---|
| Two saves at once (double click, autosave during a manual save) created **two posts** | one save at a time (`src/features/editor/save-gate.ts`); test: "two simultaneous saves create exactly one post" |
| Text typed *while* a save ran was marked as saved and lost | a revision counter notices edits during a save; the editor stays "unsaved" |
| After a failed save the autosave retried the same text forever | a failed text is not retried until you type something new; the save bar shows why |
| Two posts with the same address | strict check against the database before saving ("Another post already uses this address.") |
| The public site **silently drops** what it cannot read (a paragraph over 10,000 characters, an unsafe link, more than 500 blocks) and drops the **whole article** when the social image or canonical URL is not `https://` | the editor validates with the *same schema* as the reader before saving and says which block (language + number) to fix; SEO URLs are checked |
| Opening an article that holds blocks the reader cannot parse, then saving, would delete them for good | warning before saving; the posts list names unreadable articles instead of hiding them |
| `/admin/posts/new` vs an id, a missing or failed load, a stale answer after navigating | explicit loading / ready / missing / failed states with Retry; stale answers ignored |
| Article beyond Firestore's document limit | refused with a message (about 900 KB) |
| Admin sign-in: a slow `adminProfiles` lookup for a previous user could overwrite the current user's state | each lookup is numbered; only the latest counts |
| Media: an upload whose record failed stayed orphaned in Storage; a failed Storage delete still removed the record | the orphan is removed; the record is kept unless the file is gone or its deletion succeeded |
| Categories/tags: saving a new entry on an existing address overwrote it | the database is asked first |
| Settings: one invalid field discarded **all** settings; an emptied social list reappeared as the defaults | per-field parsing; an empty list stays empty (hero, contact section and footer hide it); the CV link must be a safe link |

Tests: `tests/editor-save.test.ts` (validation vs the reader, all 12 block types round-trip, unread blocks, the save gate), `tests/settings.test.ts`, `tests/empty-socials.test.tsx`.
Not verified: the admin screens themselves against live Firebase (the sandbox cannot sign in); the logic above is covered by unit tests, typecheck and lint.

## 6. Public blog, security, admin routes
* **Pagination:** `BlogExplorer` shows 9 articles per page with `BlogPager` (a labelled `nav`, `aria-current="page"`, "Previous/Next", gaps as "…", a polite status line "Showing 10–18 of N articles"). Search and filters return to page 1; turning a page moves focus to the list. Checked in Chromium at 320, 390 and 1280 px with a temporary route of fake posts (three pages' worth): turning to page 2, to the partial last page, a filter, a search with few results (→ no pager). Page logic in `src/lib/utils/paginate.ts` (clamps bad input).
* The other public features (category/tag filter, search, reading time, TOC, progress bar, share, related, view counter, JSON-LD, sitemap, bn/en) existed and were left alone, covered by the existing render/SEO tests.
* **`/api/revalidate`** (called by the admin after publishing) already checked for an administrator; that check now lives in a testable module (`src/lib/server/admin-auth.ts`, 11 tests) and was tightened: the ID token is verified with Google, `adminProfiles/<uid>` is read with the caller's own token and must say `role: "admin"` (as the rules require — before, any readable document passed), unreadable or failing answers refuse (fail closed), both Google calls have an 8-second limit, the user id is escaped in the URL, and the server sends the site as `Referer` — without it an API key restricted to HTTP referrers rejects these server-side calls and publishing would silently stop refreshing the site. It also refreshes `/sitemap.xml` and the search index now, not only the pages. 401 without a valid token, 403 for a non-administrator; no service-account key.
* **Rules:** `firestore.rules` and `storage.rules` were reviewed against what the app writes and **not changed**; they could not be executed (emulator download blocked).
* **Admin routes** (`/admin`, posts, posts/[id], projects, projects/[slug], media, categories, tags, messages, SEO, settings, theme, analytics, profile, security, login) were walked through for the same problems: all except `login` sit behind the admin gate (`adminProfiles` role), the list screens load through the new hook, and the editors got the fixes of section 5.
* **Secrets:** `.gitignore` now excludes every `.env*` except `.env.example`, `serviceAccount*.json`, `*-firebase-adminsdk-*.json`, `*.pem`, `*.key`. The Firebase *web* config is public by design (it ships in every browser bundle); restrict the API key as described in `docs/FIREBASE_SETUP.md`. No private key, service-account file, token or `.env.local` is in the repository or the ZIP.

## 7. Footer
Before: on a phone a single long column (the links were about 34 px tall — too small for a finger), social links as a vertical list with each icon above its label, a brand block with a large empty gap, no e-mail, CV or sitemap. After (`SiteFooter.tsx` + footer block of `site.css`):
1. **Invitation** — "Have an idea or a project in mind?" + a *Start a conversation* button;
2. **Link columns** — four on a desktop, three on a tablet (brand on its own row), two on a phone (brand and contact full width): brand + one line + round social icons · *Explore* (Home, Projects, Blog, About, Contact) · *Resources* (Download CV, Privacy, Sitemap) · *Get in touch* (e-mail that may break only before the "@", availability badge);
3. **Small print** — copyright (year in the site's time zone), credit, *Back to top*.
Server-rendered, no JavaScript, follows all five themes, Bangla and English text, nothing is shown for data that does not exist. Measured in headless Chromium: no horizontal overflow and no link or button under 38 px tall at 320 / 390 / 820 / 1360 px (English and Bangla) and, at 320 / 390 / 1360 px, in each of the five themes; the old footer had six links 33–36 px tall on a phone. `tests/footer.test.tsx`.

## 8. Known limitations and follow-ups
1. The blog index lists the newest 100 posts (paginated in the browser); older ones stay reachable by URL, category page, search (newest 200) and sitemap (newest 500).
2. The view counter is publicly incrementable by design of the rules — a vanity number.
3. Slug uniqueness is checked by the editor, not by the database (needs a transaction on a slug-index document to be airtight).
4. No per-post author byline (the author is recorded as `authorId`; the structured data names the site owner).
5. No scheduled publishing, no Content-Security-Policy header, no email notifications (see the README's decisions).
6. After a WebGL context loss the page stays on the CSS mist until reload.

## 9. Your checklist
1. Apply the ZIP (README → *Working from Codespaces and Termux*) and run `npm install && npm run check`.
2. `firebase deploy --only firestore:indexes` (and `firestore:rules,storage` if not yet deployed); wait until the indexes show *Enabled*.
3. `npm run diagnose:firestore` — every line should be ✔.
4. `npm run build` (Turbopack, real fonts) — not run in the sandbox.
5. `npm --prefix firebase-rules-tests install && npm run rules:test` — not run in the sandbox.
6. Restrict the web API key (HTTP referrers including your site URL) — `docs/FIREBASE_SETUP.md` section 4.
7. Deploy to Vercel with the variables of `.env.example` (the site's domain is detected automatically; `NEXT_PUBLIC_SITE_URL` is only an optional override).
8. Click through the admin once on the live site: sign in → category/tag → post with a cover image → publish → open it → edit → unpublish → delete; send a test message through the contact form.

## 10. Files
**Added:** `src/features/admin/useResource.ts`, `src/features/editor/save-gate.ts`, `src/components/blog/BlogPager.tsx`, `src/lib/utils/paginate.ts`, `src/lib/utils/share.ts`, `src/lib/server/admin-auth.ts`, `tools/diagnose-firestore.ts`, `package-lock.json`, `docs/BLOG_PUBLISHING.md`, `docs/REPAIR_REPORT.md`; tests `admin-auth`, `atmosphere`, `blog-data`, `editor-save`, `empty-socials`, `firestore-failures`, `footer`, `hydration`, `pagination`, `settings` and `tests/helpers/firestore-fake.ts`.
**Changed (by area):** admin screens and helpers (`analytics`, `media`, `messages`, `posts`, `posts/[id]`, `projects`, `settings`, `MediaPicker`, `TaxonomyManager`, `auth.tsx`, `media.ts`), editor model, Firestore data layer (`rest.ts`, `public.ts`), public blog pages and `BlogExplorer`, `ShareBar`, `SiteFooter`, `Hero`, `ContactSection`, `dates.ts`, `site.ts`, `schemas.ts`, `atmosphere.ts`, `api/revalidate`, i18n (`en.ts`, `bn.ts`), `site.css`, `.gitignore`, `eslint.config.mjs`, `tsconfig.json`, `package.json`, `README.md`, `docs/FIREBASE_SETUP.md`, `docs/AUDIT.md`.
