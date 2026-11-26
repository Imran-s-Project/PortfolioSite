# Firebase setup (project `imransiteinfo`)

Everything below is done **once**, by the site owner, in the Firebase console / CLI. Nothing here needs a secret key in the code, and nothing in this repository deploys anything on its own — you run every deploy command yourself.

## 1. Services to switch on
| Service | Where | Why |
|---|---|---|
| **Authentication** → Sign-in method | Email/Password (and Google if you want it) | Admin login |
| **Firestore Database** | Production mode, region near you | Content, messages |
| *(optional)* **Storage** | Production mode | Only for images uploaded before the move to ImgBB. New images are hosted on ImgBB (README → Images) and need no Firebase service |
| **App Check** | Register the web app with **reCAPTCHA v3**, copy the *site key* into `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Blocks scripts/bots from using your quota |
| *(optional)* Analytics | already created | only used if `NEXT_PUBLIC_ENABLE_ANALYTICS=true` |

Authentication → Settings → **Authorized domains**: add your Vercel domain(s) (`<your-project>.vercel.app`, preview domains, custom domain).

## 2. Deploy the rules **and the indexes**
```bash
npm i -g firebase-tools && firebase login
firebase deploy --only firestore:rules,firestore:indexes
```
Files: `firestore.rules`, `firestore.indexes.json` (already pointing at project `imransiteinfo` via `.firebaserc`).
> Still using the Storage bucket for older images? Add `,storage` to the command (`storage.rules` is kept for that). Those rules read `/adminProfiles/{uid}` from Firestore, so the first deploy may ask you to grant that cross-service access — answer **yes**.

Deploying only the rules (for example by pasting them into the console) is **not enough**: the indexes are a separate deploy, and the blog needs them.

### Why the indexes matter — the `HTTP 400` on `blogPosts`
The public blog asks Firestore for *published posts, newest first* and *published posts of one category, newest first*. Each combines a filter with a sort order, and Firestore answers such a query only when a **composite index** exists. Both are listed in `firestore.indexes.json`:

| Query | Index |
|---|---|
| all published posts, newest first | `blogPosts`: `status` ↑, `publishedAt` ↓ |
| published posts of one category | `blogPosts`: `status` ↑, `categoryId` ↑, `publishedAt` ↓ |

If they were never deployed, Firestore refuses the server's request with **HTTP 400 `FAILED_PRECONDITION` ("The query requires an index")** and the log line looks like this:

```
[firestore] query on "blogPosts" failed: HTTP 400 FAILED_PRECONDITION [missing-index] — … https://console.firebase.google.com/… — A composite index is not deployed yet …
```

**Fix:** `firebase deploy --only firestore:indexes` (or open the link in the log line, which creates exactly the missing index), then wait until Firebase console → Firestore → Indexes → Composite shows both as **Enabled** (seconds to a few minutes).
Until then the site keeps working: the query is repeated without its sort order and the posts are sorted in memory, and the cause is still logged (at most once every few minutes). That fallback is a safety net, not the plan — fix the index.

> The sandbox this repair was done in cannot reach Firestore, so **which** cause produced your original HTTP 400 could not be observed directly. A missing composite index is by far the most likely; `npm run diagnose:firestore` (below) tells you for certain on your side.

### Find out what is wrong: `npm run diagnose:firestore`
Run it in Codespaces (or anywhere with internet). It asks Firestore the very same questions the public site asks — settings, projects, categories, tags, the newest posts, one category, one article — and, for each that fails, prints the HTTP status, Google's reason, what to do about it and, for a missing index, the link that creates it. It only reads, needs no credentials and never prints the API key.

### What the log line `[kind]` means
| `[kind]` | Meaning | What to do |
|---|---|---|
| `missing-index` | HTTP 400 `FAILED_PRECONDITION`: a composite index is not deployed or still building | `firebase deploy --only firestore:indexes`, wait for *Enabled* |
| `invalid-api-key` | HTTP 400 `API_KEY_INVALID`: the web API key is wrong, expired or deleted | Compare `NEXT_PUBLIC_FIREBASE_API_KEY` on Vercel with Project settings → Your apps |
| `invalid-query` | Any other 400: the request itself is malformed | A code bug — see `src/lib/firestore/public.ts` |
| `api-key-blocked` | HTTP 403: an API-key restriction rejects the server's call | Allow your site URL under HTTP referrers (section 4) and keep *Cloud Firestore API* allowed |
| `api-disabled` | The Cloud Firestore API is switched off for the Google Cloud project | Enable it in Google Cloud console → APIs & Services → Library |
| `permission-denied` | The Security Rules refuse the read | Public reads need `status == "published"`; deploy `firestore.rules` |
| `no-database` | HTTP 404: the database was never created | Create it in Firestore Database |
| `not-found` | HTTP 404 for one document | Normal for optional documents (for example settings that were never saved) |
| `quota` | HTTP 429 | Recovers on its own; check usage |
| `unavailable` | Network error, timeout, 5xx | Transient; pages keep serving their last good version |
| `bad-response` | A 2xx answer that is not the JSON Firestore sends | A proxy or captive portal between the server and Google? |
| `unknown` | Anything else | The log line carries Google's own message |

At run time a failed read is **never** shown as "no posts" or a 404 (Next would cache that page): the visitor keeps getting the last good version, or the error page when there is none. Only during `next build` is an unreachable Firestore tolerated — the page is built empty and regenerated within a minute — so a short outage cannot fail a deployment.

## 3. Create the first administrator (one-time bootstrap)
Security rules mean *nobody* can make themselves an admin, so the first one is created by hand:
1. Firebase console → Authentication → **Add user** (email + strong password). Copy the user's **UID**.
2. Firestore → **Start collection** `adminProfiles` → Document ID = **that UID** → fields:
   `role` (string) = `admin`, `displayName` (string) = your name, `email` (string) = your email.
3. Open `/admin/login` on the site and sign in. (If the UID is not an admin yet, the login page shows your UID so you can copy it.)

More admins: create their Auth user, then add an `adminProfiles/<uid>` document the same way (or from an existing admin session in the console).
**Turn on multi-factor authentication** for admin accounts (Authentication → Sign-in method → Multi-factor).

`/api/revalidate` (called by the admin after publishing) is protected the same way: it checks the caller's Firebase ID token with Google, then reads `adminProfiles/<uid>` *with the caller's own token*, and requires `role == "admin"`. No service-account key is involved. Everyone else gets 401 or 403.

## 4. Restrict the web API key
The `apiKey` in the web config is public by design, but restrict it: Google Cloud console → APIs & Services → Credentials → the browser key:
* **Application restrictions → HTTP referrers:** your production domain(s) (`https://your-domain/*`), preview domains if you use them, and `http://localhost:3000/*` for development. **The site URL must be on the list:** the server renders public pages by calling Firestore itself, and it sends the site's own address (detected automatically — your Vercel production domain, or `NEXT_PUBLIC_SITE_URL` if you set it) as the `Referer` so a referrer-restricted key accepts it. (Restricting the key by IP address cannot work on a serverless host.)
* **API restrictions** (optional): if you also limit the key to specific APIs, include at least Cloud Firestore API, Identity Toolkit API, Token Service API, Cloud Storage for Firebase API, Firebase App Check API and Firebase Installations API — and test the public site and the admin sign-in right after changing it. A restriction that is too narrow shows up as `api-key-blocked` in the log.

If the key was ever pasted somewhere public that it should not have been (a chat, an issue, a screenshot of a `.env` file), create a new key in the same console, update Vercel, and delete the old one.

## 5. App Check — read this before you "Enforce"
* Storage and Authentication can be **enforced** safely.
* **Firestore: keep App Check in *monitor* mode.** The public pages are rendered on Vercel's servers and read published content over the Firestore REST API; a server cannot solve reCAPTCHA, so enforcing App Check on Firestore would blank the site. Firestore stays protected by the Security Rules (public = read published content + create one well-shaped contact message; everything else = admins only).
* To enforce Firestore later you must move the server reads to the Firebase **Admin SDK** (service-account credentials as Vercel server-only env vars). That is a deliberate follow-up, not done here.
* Local development: set `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN=true`, open the site, copy the token printed in the browser console into App Check → Apps → *Manage debug tokens*. Never commit a debug token.

## 6. Vercel environment variables
Copy every key of `.env.example` into Vercel → Project → Settings → Environment Variables (Production + Preview) and fill in the values from Firebase console → Project settings → Your apps. `NEXT_PUBLIC_SITE_URL` is optional — on Vercel the domain is detected automatically; set it only to force one specific address (for example a custom domain). There are **no server-side secrets** in this app, and `.env.local` is never committed or shipped in a ZIP.

## 7. Verify the rules (recommended)
```bash
npm --prefix firebase-rules-tests install
npm run rules:test     # needs Java 11+ and the Firebase CLI; runs the security-rules suite against the local emulators
```
The emulator is downloaded on first use (it needs access to `storage.googleapis.com`). The rules in this repository have not been changed by the latest repair pass; the suite could not be run in the sandbox it was done in — please run it once.

## What each role can do (summary of the rules)
| | Public visitor | Signed-in non-admin | Admin |
|---|---|---|---|
| Read published projects/posts, settings, categories, tags | ✔ | ✔ | ✔ |
| Read drafts, messages, media, logs | ✘ | ✘ | ✔ |
| Create a contact message (strict shape) | ✔ | ✔ | ✔ |
| Add `+1` to a published post's view counter | ✔ | ✔ | ✔ |
| Create/edit/delete content, upload images | ✘ | ✘ | ✔ |
| Give themselves admin rights | ✘ | ✘ | ✘ |
