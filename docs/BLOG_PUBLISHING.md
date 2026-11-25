# Publishing on the blog

Everything is done in the admin area (`/admin`). You need an administrator account first — see [FIREBASE_SETUP.md](FIREBASE_SETUP.md), section 3.

## 1. Categories and tags (once, then whenever you need a new one)
* **Admin → Categories** and **Admin → Tags** → *New*. Give a name in Bangla and/or English; the **address (slug)** is suggested from the English name (lowercase letters, numbers and single hyphens) and **cannot be changed afterwards** because it is the entry's identity. A category may also have a short description.
* *Order* decides the order of the filter chips on the site.
* Creating an entry whose address already exists is refused (the database is asked, not just the list on screen), so an existing category can never be overwritten by accident.
* Deleting a category or tag does not delete posts; they simply lose that label.

## 2. Write a post: Admin → Posts → New post
Work top to bottom; the save bar at the top shows what is going on ("Unsaved changes · autosaves in a moment", "Saved 14:32").

1. **Language.** Bangla and English content are separate; switch with *Language of the content*. A post may exist in one language only — a visitor then sees it with a notice. *Copy blocks from the other language* is a starting point for a translation.
2. **Title** and **Excerpt** (shown in lists, search results and share cards).
3. **Content** — a list of typed blocks. Add, edit, delete and reorder them (drag, or the keyboard buttons). The twelve types:

   | Block | Notes |
   |---|---|
   | Heading | H2, H3 or H4 (the page title is the only H1) · up to 400 characters |
   | Paragraph | up to 10,000 characters; inline **bold**, *italic*, `code` and links |
   | Image | needs an `https://` address (use the media library) and **alt text** · optional caption |
   | Gallery | up to 40 images |
   | Video | a YouTube or Vimeo address · optional title |
   | Code | language name, optional file name, up to 50,000 characters |
   | Quote | optional source |
   | Callout | info / success / warning / danger, optional title |
   | Button | label and link (only safe links: `http(s):`, `mailto:`, `tel:`, a site path such as `/en/blog`, or an in-page `#anchor`) |
   | Table | up to 12 columns and 200 rows |
   | Divider | |
   | List | bulleted or numbered, up to 200 items |

   A whole article holds at most 500 blocks and about 900 KB of data. The editor checks all of this **before** it saves, with the same rules the public site uses to read an article, so it can never store something the site would silently leave out. If a block is too long or a link is not allowed, the save bar says which block (language and number) to fix.
4. **Cover image** (*Post settings → Cover image*): *Choose cover image* opens the media library, where you can also upload (JPEG, PNG, WebP, AVIF or GIF, up to 5 MB). A cover needs **alt text** before the post can be published.
5. **Category and tags**, the **address (slug)** — suggested from the English title until you edit it yourself; it must be unique, up to 80 characters — and **Featured article** (up to two featured posts are shown in a "Featured" strip at the top of the blog page).
6. **SEO** (*Post settings → SEO*): meta title, meta description, social share image (a full `https://` address; empty = the cover image, then the site default), canonical URL (full `https://`, optional) and *Hide from search engines (noindex)*.
7. **Live preview** shows the article as visitors will see it, in the language you are editing.

## 3. Save, publish, unpublish
| Button | What it does |
|---|---|
| **Save draft** | Saves without publishing. **Drafts autosave** after three seconds without typing. A published post is *never* changed while you type — use *Update published post*. |
| **Publish** | Makes the post public (needs a title, at least one non-empty block, and alt text for the cover). Pages refresh immediately; otherwise within a minute. |
| **Update published post** | Saves your changes to the live article. |
| **Unpublish** | Moves the post back to drafts; it disappears from the site. |
| **View live** | Opens the public page (published posts). |

* The **publish date** is shown on the article and decides its position in the list. It does **not** schedule anything: publishing is immediate.
* **History** keeps the latest 30 saves. *Restore* loads an old version into the editor — review it, then save to keep it.
* Two safety nets: if you close or reload the tab with unsaved changes the browser warns you (and the sidebar asks before you navigate away); if a save fails, the save bar says why and the autosave does not retry the same text in a loop (typing something new re-arms it).
* If an article contains blocks the site could not read (an older save, or data edited by hand), the editor shows a warning **before** you save, because saving would remove them. The posts list also names any post that cannot be read at all instead of silently hiding it.

## 4. Delete a post
**Admin → Posts → Delete** asks for confirmation, then deletes the post and its revision history. Images stay in the media library (delete them there if you want them gone).

## 5. What visitors get
* `/bn/blog` and `/en/blog`: all published posts, **9 per page**, with search and category/tag filters (changing the search or a filter returns to page 1; turning a page moves focus to the list for keyboard and screen-reader users). The list holds the newest 100 posts — see the README for how older ones stay reachable.
* An article page: reading time, table of contents, reading-progress bar, share buttons, related posts, view counter, JSON-LD, canonical + hreflang, Open Graph/Twitter cards; it is also in the sitemap.
* Dates are always printed in the `Asia/Dhaka` time zone, so the server and every visitor's browser agree.

## 6. If something does not work
| What you see | Likely cause |
|---|---|
| "Another post already uses this address." | Pick another slug. (The check runs in the editor; two administrators saving the same new slug in the same second could still collide.) |
| "Add alt text for the cover image." | Publishing needs alt text in at least one language. |
| "The social share image / canonical URL must be a full https:// address." | Use the complete address, or leave the field empty. |
| "The article is too large to save (limit about 900 KB)." | Split it, or compress/shrink what the article embeds. |
| A published post is not on the site | Wait a minute (or check that the admin's revalidation call succeeded), and run `npm run diagnose:firestore` if the whole blog is empty — most often the composite indexes are not deployed. |
| The blog is empty and the server log shows `[firestore] … HTTP 400` | See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) → *Why the indexes matter*. |
