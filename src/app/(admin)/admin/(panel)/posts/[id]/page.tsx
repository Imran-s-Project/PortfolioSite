'use client';
import { useCallback, useEffect, useMemo, useState, useEffectEvent } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { Timestamp, addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where, type Firestore } from 'firebase/firestore';
import { BlockRenderer } from '@/components/blog/BlockRenderer';
import { Icon } from '@/components/shared/Icon';
import { logActivity, plainDoc, revalidateSite, stripUndefined } from '@/features/admin/data';
import { useAuth } from '@/features/admin/auth';
import { useAdminLang } from '@/features/admin/lang';
import { MediaPicker } from '@/features/admin/MediaPicker';
import { ErrorState, LocField, PageHead, useDirtyFlag, useToast } from '@/features/admin/ui';
import { BlockEditor } from '@/features/editor/BlockEditor';
import { BLOCK_SCHEMA_VERSION, blockProblems, cleanContent, emptyPost, fromLocalInput, optionalUrl, postToEditor, problems, readingTimes, suggestSlug, toLocalInput, unreadBlocks, type EditorPost, type SaveProblem } from '@/features/editor/model';
import { createSaveGate, type SaveTicket } from '@/features/editor/save-gate';
import { getDb } from '@/lib/firebase/client';
import { newId } from '@/lib/utils/blocks';
import { parsePost, parseTaxonomy } from '@/lib/validation/schemas';
import { pick } from '@/i18n/locales';
import type { Block, Locale, Taxonomy } from '@/types';

type SaveKind = 'draft' | 'publish' | 'unpublish' | 'autosave';
const REVISION_LIMIT = 30;
const NEW_POST_PATH = /\/admin\/posts\/new\/?$/;

/** Other posts that already use this address, whatever their status: a second one would make /blog/<address> ambiguous. */
async function postsUsingSlug(db: Firestore, slug: string, ownId: string | null): Promise<string[]> {
  const snap = await getDocs(query(collection(db, 'blogPosts'), where('slug', '==', slug), limit(3)));
  return snap.docs.filter((d) => d.id !== ownId).map(() => slug);
}

export default function PostEditorPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  // After the first save the address changes from /new to /<id> without leaving the page. Opening "New post" again must then start
  // a fresh, empty post — not show (and then overwrite) the one that was just saved — so every visit to /new gets its own editor.
  const [visit, setVisit] = useState(0);
  const [seen, setSeen] = useState(pathname);
  if (pathname !== seen) {
    setSeen(pathname);
    if (NEW_POST_PATH.test(pathname)) setVisit((v) => v + 1);
  }
  return <PostEditor key={visit} routeId={params.id} />;
}

function PostEditor({ routeId }: { routeId: string }) {
  const { L, lang } = useAdminLang();
  const { user, profile, idToken } = useAuth();
  const toast = useToast();
  const [gate] = useState(createSaveGate);

  const [post, setPost] = useState<EditorPost>(emptyPost);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'failed'>(routeId === 'new' ? 'ready' : 'loading');
  const [attempt, setAttempt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  /** Why the last save was refused or failed — shown in the save bar, so an autosave that cannot run is never silent. */
  const [issue, setIssue] = useState<string | null>(null);
  /** Stored blocks the reader could not read: saving would delete them for good. */
  const [unread, setUnread] = useState(0);
  const [editLang, setEditLang] = useState<Locale>('bn');
  const [preview, setPreview] = useState(false);
  const [categories, setCategories] = useState<Taxonomy[]>([]);
  const [tags, setTags] = useState<Taxonomy[]>([]);
  const [picker, setPicker] = useState<'cover' | 'og' | null>(null);
  const [history, setHistory] = useState<{ id: string; savedAt: string; title: string; post: Pick<EditorPost, 'title' | 'excerpt' | 'content'> }[] | null>(null);
  useDirtyFlag(dirty);

  const change = useCallback((patch: Partial<EditorPost>) => {
    gate.edited(); // a save that is running right now must not overwrite this edit when it finishes
    setPost((p) => ({ ...p, ...patch }));
    setDirty(true);
  }, [gate]);

  /* ───── load the post (existing) and the taxonomies ───── */
  useEffect(() => {
    let alive = true;
    const db = getDb();
    void Promise.all([getDocs(collection(db, 'blogCategories')), getDocs(collection(db, 'blogTags'))])
      .then(([c, t]) => {
        if (!alive) return;
        const read = (docs: typeof c.docs) => docs.map((d) => parseTaxonomy(plainDoc(d.id, d.data()))).filter((x): x is Taxonomy => x !== null).sort((a, b) => a.order - b.order);
        setCategories(read(c.docs));
        setTags(read(t.docs));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (routeId === 'new') return;
    let alive = true;
    getDoc(doc(getDb(), 'blogPosts', routeId))
      .then((snap) => {
        if (!alive) return;
        const raw = snap.exists() ? plainDoc(snap.id, snap.data()) : null;
        const parsed = raw ? parsePost(raw) : null;
        if (!parsed) return setLoadState('missing');
        setPost(postToEditor(parsed));
        setUnread(unreadBlocks(raw, parsed));
        setLoadState('ready');
      })
      .catch((err: unknown) => {
        console.error('[editor] could not load the post', err);
        if (alive) setLoadState('failed');
      });
    return () => {
      alive = false;
    };
  }, [routeId, attempt]);

  /* ───── saving ───── */
  /** The first thing wrong with the post, in the admin's language. */
  const explain = (found: SaveProblem[], s: EditorPost): string => {
    const first = found[0]!;
    if (first === 'blocks') {
      const b = blockProblems(s.content)[0]!;
      const where = `${b.number} (${b.lang === 'bn' ? 'বাংলা' : 'English'})`;
      return L(`Block ${where} has a value that cannot be saved — it may be too long, or a link in it is not allowed.`, `ব্লক ${where}-এ এমন মান আছে যা সংরক্ষণ করা যাবে না — হয়তো অতিরিক্ত লম্বা, বা এর কোনো লিংক অনুমোদিত নয়।`);
    }
    const msg: Record<Exclude<SaveProblem, 'blocks'>, [string, string]> = {
      title: ['Add a title (in at least one language).', 'কমপক্ষে একটি ভাষায় শিরোনাম দিন।'],
      slug: ['The address (slug) must use only lowercase letters, numbers and hyphens.', 'অ্যাড্রেস (স্লাগ) শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও হাইফেন দিয়ে হতে হবে।'],
      'slug-taken': ['Another post already uses this address.', 'এই অ্যাড্রেস অন্য একটি পোস্ট ব্যবহার করছে।'],
      content: ['Add some content before publishing.', 'প্রকাশের আগে কিছু কনটেন্ট যোগ করুন।'],
      'cover-alt': ['Add alt text for the cover image.', 'কভার ছবির অল্ট টেক্সট দিন।'],
      'seo-image': ['The social share image must be a full https:// address.', 'শেয়ার ছবির ঠিকানা পুরো https:// ঠিকানা হতে হবে।'],
      'seo-canonical': ['The canonical URL must be a full https:// address.', 'ক্যানোনিক্যাল URL পুরো https:// ঠিকানা হতে হবে।']
    };
    return L(...msg[first]);
  };

  const save = async (kind: SaveKind): Promise<void> => {
    if (!user || !profile) return;
    const ticket = gate.begin();
    if (!ticket) return; // a save is already running — never start a second one (it could create a duplicate post)
    const refuse = (t: SaveTicket, message: string): void => {
      gate.failed(t); // the autosave will not try this exact text again; typing something new re-arms it
      setIssue(message);
      if (kind !== 'autosave') toast.error(message);
    };
    setSaving(true);
    try {
      const s = post; // exactly this copy is checked and saved
      const publishing = kind === 'publish' || (kind !== 'unpublish' && s.status === 'published');
      const db = getDb();

      let taken: string[];
      try {
        taken = await postsUsingSlug(db, s.slug, s.id);
      } catch (err) {
        // never guess: saving without knowing whether the address is free could put two posts at one address
        console.error('[editor] could not check the address', err);
        return refuse(ticket, L('Could not check whether this address is free. Check your connection and try again.', 'অ্যাড্রেসটি ফাঁকা কি না যাচাই করা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।'));
      }
      const found = problems(s, taken, publishing);
      if (found.length) return refuse(ticket, explain(found, s));

      const status = kind === 'publish' ? 'published' : kind === 'unpublish' ? 'draft' : s.status;
      const content = status === 'published' ? cleanContent(s.content) : s.content;
      if (new Blob([JSON.stringify(content)]).size > 900_000) return refuse(ticket, L('The article is too large to save (limit about 900 KB).', 'লেখাটি সংরক্ষণের জন্য অনেক বড় (সীমা প্রায় ৯০০ KB)।'));
      const publishedAtIso = status === 'published' ? (s.publishedAt ?? new Date().toISOString()) : s.publishedAt;
      const body = {
        slug: s.slug, status, schemaVersion: BLOCK_SCHEMA_VERSION, title: s.title, excerpt: s.excerpt, content,
        categoryId: s.categoryId, tagIds: s.tagIds, featured: s.featured,
        publishedAt: publishedAtIso ? Timestamp.fromDate(new Date(publishedAtIso)) : null,
        seo: { metaTitle: s.seo.metaTitle, metaDescription: s.seo.metaDescription, ogImage: optionalUrl(s.seo.ogImage), canonical: optionalUrl(s.seo.canonical), noindex: s.seo.noindex },
        readingMinutes: readingTimes(content), updatedAt: serverTimestamp()
      };

      let id: string;
      if (s.id) {
        id = s.id;
        await updateDoc(doc(db, 'blogPosts', id), stripUndefined({ ...body, coverImage: s.coverImage ?? deleteField() }));
      } else {
        const ref = doc(collection(db, 'blogPosts'));
        await setDoc(ref, stripUndefined({ ...body, ...(s.coverImage ? { coverImage: s.coverImage } : {}), createdAt: serverTimestamp(), authorId: user.uid, views: 0 }));
        id = ref.id;
        window.history.replaceState(null, '', `/admin/posts/${id}`);
      }

      // Anything typed while the save was running stays on screen and stays "unsaved" — the older, saved copy never replaces it.
      const untouched = gate.untouched(ticket);
      setPost((p) => ({ ...p, id, status, publishedAt: p.publishedAt === s.publishedAt ? publishedAtIso : p.publishedAt, ...(untouched ? { content } : {}) }));
      if (untouched) setDirty(false);
      setIssue(null);
      setSavedAt(new Date());
      if (kind !== 'autosave') {
        const rev = collection(db, 'blogPosts', id, 'revisions');
        await addDoc(rev, { savedAt: serverTimestamp(), savedBy: user.uid, note: kind, title: s.title, excerpt: s.excerpt, content }).catch(() => undefined);
        void getDocs(query(rev, orderBy('savedAt', 'desc'), limit(REVISION_LIMIT + 10))).then((r) => Promise.all(r.docs.slice(REVISION_LIMIT).map((d) => deleteDoc(d.ref)))).catch(() => undefined);
        toast.success(kind === 'publish' ? L('Published.', 'প্রকাশ হয়েছে।') : kind === 'unpublish' ? L('Moved back to drafts.', 'খসড়ায় ফিরেছে।') : status === 'published' ? L('Changes published.', 'পরিবর্তন প্রকাশ হয়েছে।') : L('Draft saved.', 'খসড়া সংরক্ষিত।'));
        void logActivity({ uid: user.uid, name: profile.displayName || user.email || '' }, kind, 'post', id, s.title.en || s.title.bn);
        if (status === 'published' || kind === 'unpublish') void idToken().then(revalidateSite);
      }
    } catch (err) {
      console.error('[editor] save failed', err);
      refuse(ticket, L('Could not save. Check your connection and that your account is an administrator.', 'সংরক্ষণ করা যায়নি। সংযোগ ও অ্যাডমিন অনুমতি দেখুন।'));
    } finally {
      gate.end(ticket);
      setSaving(false);
    }
  };

  /* autosave: drafts only (a published post is never changed while you type), after 3 s of quiet; not again after a failure until you type */
  const autosave = useEffectEvent(() => void save('autosave'));
  useEffect(() => {
    if (!dirty || saving || post.status !== 'draft' || !gate.retryable()) return;
    if (!post.slug || (!post.title.bn.trim() && !post.title.en.trim())) return;
    const t = window.setTimeout(() => autosave(), 3000);
    return () => clearTimeout(t);
  }, [post, dirty, saving, gate]);

  const openHistory = async () => {
    if (!post.id) return;
    setHistory(null);
    const snap = await getDocs(query(collection(getDb(), 'blogPosts', post.id, 'revisions'), orderBy('savedAt', 'desc'), limit(REVISION_LIMIT)));
    setHistory(snap.docs.map((d) => {
      const x = plainDoc(d.id, d.data());
      const parsed = parsePost({ id: 'rev', slug: 'rev', title: x.title, excerpt: x.excerpt, content: x.content });
      return { id: d.id, savedAt: String(x.savedAt ?? ''), title: pick(parsed?.title ?? { bn: '', en: '' }, lang), post: { title: parsed?.title ?? post.title, excerpt: parsed?.excerpt ?? post.excerpt, content: parsed?.content ?? post.content } };
    }));
  };

  const blocks = post.content[editLang];
  const setBlocks = (b: Block[]) => change({ content: { ...post.content, [editLang]: b } });
  const status = useMemo(() => (saving ? 'saving' : dirty ? 'dirty' : savedAt ? 'saved' : 'clean'), [saving, dirty, savedAt]);
  const metaDescLen = post.seo.metaDescription[lang].length;

  if (loadState === 'loading') return <div className="skeleton" style={{ height: '20rem' }} aria-busy="true" />;
  if (loadState === 'missing') return <ErrorState text={L('This post could not be loaded (it may have been deleted or is malformed).', 'পোস্টটি লোড করা যায়নি (মুছে ফেলা বা ত্রুটিপূর্ণ হতে পারে)।')} />;
  if (loadState === 'failed') return <ErrorState text={L('This post could not be loaded. Check your connection and try again.', 'পোস্টটি লোড করা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।')} onRetry={() => { setLoadState('loading'); setAttempt((n) => n + 1); }} />;

  return (
    <>
      <PageHead
        title={post.id ? L('Edit post', 'পোস্ট সম্পাদনা') : L('New post', 'নতুন পোস্ট')}
        actions={
          <>
            <Link href="/admin/posts" className="btn btn--sm btn--ghost"><Icon name="arrow-left" />{L('All posts', 'সব পোস্ট')}</Link>
            <button type="button" className="btn btn--sm" aria-pressed={preview} onClick={() => setPreview((v) => !v)}><Icon name="eye" />{L('Live preview', 'লাইভ প্রিভিউ')}</button>
            {post.id && <button type="button" className="btn btn--sm" onClick={() => void openHistory()}><Icon name="history" />{L('History', 'ইতিহাস')}</button>}
            {post.status === 'published' && post.slug && <a className="btn btn--sm btn--ghost" href={`/${lang}/blog/${post.slug}`} target="_blank" rel="noopener noreferrer"><Icon name="external" />{L('View live', 'লাইভ দেখুন')}</a>}
          </>
        }
      />
      {unread > 0 && (
        <p className="alert alert--bad" role="alert">
          {L(`${unread} block(s) stored in this article could not be read (invalid or too long). They are not shown here, and saving will remove them for good.`, `এই লেখায় সংরক্ষিত ${unread}টি ব্লক পড়া যায়নি (অবৈধ বা অতিরিক্ত লম্বা)। সেগুলো এখানে দেখানো হচ্ছে না, আর সংরক্ষণ করলে চিরতরে মুছে যাবে।`)}
        </p>
      )}

      <div className="ed-layout">
        <div className="stack">
          <div className="adm-card">
            <LocField label={L('Title', 'শিরোনাম')} value={post.title} max={300} onChange={(title) => change({ title, ...(post.slugTouched ? {} : { slug: suggestSlug(title) }) })} />
            <LocField label={L('Excerpt (shown in lists and search results)', 'সারাংশ (তালিকা ও সার্চে দেখায়)')} value={post.excerpt} multiline rows={2} max={600} onChange={(excerpt) => change({ excerpt })} />
          </div>

          <div className="adm-card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>{L('Content', 'কনটেন্ট')}</h2>
              <div className="row">
                <div className="tabs" role="tablist" aria-label={L('Language of the content', 'কনটেন্টের ভাষা')}>
                  {(['bn', 'en'] as const).map((l) => (
                    <button key={l} type="button" role="tab" aria-selected={editLang === l} onClick={() => setEditLang(l)}>{l === 'bn' ? 'বাংলা' : 'English'} ({post.content[l].length})</button>
                  ))}
                </div>
                {blocks.length === 0 && post.content[editLang === 'bn' ? 'en' : 'bn'].length > 0 && (
                  <button type="button" className="btn btn--sm" onClick={() => { const src = post.content[editLang === 'bn' ? 'en' : 'bn']; setBlocks(src.map((b) => ({ ...structuredClone(b), id: newId() }))); }}>{L('Copy blocks from the other language', 'অন্য ভাষা থেকে ব্লক কপি করুন')}</button>
                )}
              </div>
            </div>
            <div className="ed" data-preview={preview}>
              <BlockEditor blocks={blocks} onChange={setBlocks} />
              {preview && (
                <div className="ed__preview panel" aria-label={L('Preview', 'প্রিভিউ')}>
                  <h2 style={{ marginBottom: '1rem' }}>{pick(post.title, editLang)}</h2>
                  <BlockRenderer blocks={blocks.filter((b) => b.type !== 'image' || b.url)} />
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="ed-side" aria-label={L('Post settings', 'পোস্টের সেটিংস')}>
          <div className="adm-card">
            <h2>{L('Publishing', 'প্রকাশনা')}</h2>
            <p>{L('Status', 'অবস্থা')}: <span className={post.status === 'published' ? 'badge badge--ok' : 'badge badge--warn'}>{post.status === 'published' ? L('Published', 'প্রকাশিত') : L('Draft', 'খসড়া')}</span></p>
            {post.status === 'published' && (
              <div className="field"><label htmlFor="pubdate">{L('Publish date', 'প্রকাশের তারিখ')}</label><input id="pubdate" type="datetime-local" className="input" value={toLocalInput(post.publishedAt)} onChange={(e) => change({ publishedAt: fromLocalInput(e.target.value) })} /></div>
            )}
            <label className="check"><input type="checkbox" checked={post.featured} onChange={(e) => change({ featured: e.target.checked })} />{L('Featured article', 'নির্বাচিত লেখা')}</label>
            <div className="field">
              <label htmlFor="slug">{L('Address (slug)', 'অ্যাড্রেস (স্লাগ)')}</label>
              <input id="slug" className="input" value={post.slug} maxLength={80} spellCheck={false} onChange={(e) => change({ slug: e.target.value.toLowerCase().replace(/\s+/g, '-'), slugTouched: true })} />
              <span className="field__hint">/blog/{post.slug || '…'}</span>
            </div>
          </div>

          <div className="adm-card">
            <h2>{L('Category and tags', 'ক্যাটাগরি ও ট্যাগ')}</h2>
            <div className="field">
              <label htmlFor="cat">{L('Category', 'ক্যাটাগরি')}</label>
              <select id="cat" className="select" value={post.categoryId ?? ''} onChange={(e) => change({ categoryId: e.target.value || null })}>
                <option value="">{L('— none —', '— নেই —')}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{pick(c.name, lang)}</option>)}
              </select>
            </div>
            <div role="group" aria-label={L('Tags', 'ট্যাগ')} className="chip-pick">
              {tags.length === 0 && <span className="muted">{L('No tags yet — create them in Tags.', 'এখনো ট্যাগ নেই — ট্যাগ পেজে বানান।')}</span>}
              {tags.map((t) => (
                <button key={t.id} type="button" className="chip" aria-pressed={post.tagIds.includes(t.id)} onClick={() => change({ tagIds: post.tagIds.includes(t.id) ? post.tagIds.filter((x) => x !== t.id) : [...post.tagIds, t.id] })}>#{pick(t.name, lang)}</button>
              ))}
            </div>
          </div>

          <div className="adm-card cover-pick">
            <h2>{L('Cover image', 'কভার ছবি')}</h2>
            {post.coverImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={post.coverImage.url} alt={post.coverImage.alt[lang]} />
                <LocField label={L('Alt text', 'অল্ট টেক্সট')} value={post.coverImage.alt} max={300} onChange={(alt) => change({ coverImage: { ...post.coverImage!, alt } })} />
                <div className="row">
                  <button type="button" className="btn btn--sm" onClick={() => setPicker('cover')}>{L('Replace', 'বদলান')}</button>
                  <button type="button" className="btn btn--sm btn--danger" onClick={() => change({ coverImage: undefined })}>{L('Remove', 'সরান')}</button>
                </div>
              </>
            ) : <button type="button" className="btn btn--sm" onClick={() => setPicker('cover')}><Icon name="image" />{L('Choose cover image', 'কভার ছবি বাছুন')}</button>}
          </div>

          <div className="adm-card">
            <h2>{L('SEO', 'এসইও')}</h2>
            <LocField label={L('Meta title', 'মেটা টাইটেল')} value={post.seo.metaTitle} max={120} hint={L('Leave empty to use the post title. About 60 characters works best.', 'ফাঁকা রাখলে পোস্টের শিরোনাম ব্যবহার হবে। প্রায় ৬০ অক্ষর ভালো।')} onChange={(metaTitle) => change({ seo: { ...post.seo, metaTitle } })} />
            <LocField label={L('Meta description', 'মেটা বর্ণনা')} value={post.seo.metaDescription} multiline rows={2} max={400} hint={L('Leave empty to use the excerpt. 120–160 characters works best.', 'ফাঁকা রাখলে সারাংশ ব্যবহার হবে। ১২০–১৬০ অক্ষর ভালো।')} onChange={(metaDescription) => change({ seo: { ...post.seo, metaDescription } })} />
            <span className="counter" data-over={metaDescLen > 160}>{metaDescLen}/160 ({lang === 'bn' ? 'বাংলা' : 'English'})</span>
            <div className="field">
              <label htmlFor="og">{L('Social share image', 'শেয়ার ছবি')}</label>
              <div className="row">
                <input id="og" className="input" inputMode="url" placeholder="https://…" value={post.seo.ogImage ?? ''} onChange={(e) => change({ seo: { ...post.seo, ogImage: e.target.value } })} />
                <button type="button" className="btn btn--sm" onClick={() => setPicker('og')}>{L('Choose', 'বাছুন')}</button>
              </div>
              <span className="field__hint">{L('Empty = the cover image, then the site default.', 'ফাঁকা = কভার ছবি, তারপর সাইটের ডিফল্ট।')}</span>
            </div>
            <div className="field"><label htmlFor="canon">{L('Canonical URL (optional)', 'ক্যানোনিক্যাল URL (ঐচ্ছিক)')}</label><input id="canon" className="input" inputMode="url" placeholder="https://…" value={post.seo.canonical ?? ''} onChange={(e) => change({ seo: { ...post.seo, canonical: e.target.value } })} /></div>
            <label className="check"><input type="checkbox" checked={post.seo.noindex} onChange={(e) => change({ seo: { ...post.seo, noindex: e.target.checked } })} />{L('Hide from search engines (noindex)', 'সার্চ ইঞ্জিন থেকে লুকান (noindex)')}</label>
          </div>
        </aside>
      </div>

      <div className="savebar" role="region" aria-label={L('Save', 'সংরক্ষণ')}>
        <span data-state={status} role="status">
          {status === 'saving' ? L('Saving…', 'সংরক্ষণ হচ্ছে…') : status === 'dirty' ? L('Unsaved changes', 'সংরক্ষণ হয়নি') + (issue ? ` · ${issue}` : post.status === 'draft' ? ` · ${L('autosaves in a moment', 'একটু পরে অটোসেভ হবে')}` : '') : status === 'saved' && savedAt ? `${L('Saved', 'সংরক্ষিত')} ${savedAt.toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}` : L('All changes saved', 'সব পরিবর্তন সংরক্ষিত')}
        </span>
        <div className="row">
          {post.status === 'published' ? (
            <>
              <button type="button" className="btn" disabled={saving} onClick={() => void save('unpublish')}>{L('Unpublish', 'প্রকাশ বন্ধ করুন')}</button>
              <button type="button" className="btn btn--primary" disabled={saving || !dirty} onClick={() => void save('draft')}>{L('Update published post', 'প্রকাশিত পোস্ট আপডেট')}</button>
            </>
          ) : (
            <>
              <button type="button" className="btn" disabled={saving} onClick={() => void save('draft')}><Icon name="save" />{L('Save draft', 'খসড়া সংরক্ষণ')}</button>
              <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void save('publish')}>{L('Publish', 'প্রকাশ করুন')}</button>
            </>
          )}
        </div>
      </div>

      {picker && (
        <MediaPicker
          onClose={() => setPicker(null)}
          onPick={(m) => {
            if (picker === 'cover') change({ coverImage: { url: m.url, alt: post.coverImage?.alt ?? m.alt, storagePath: m.path } });
            else change({ seo: { ...post.seo, ogImage: m.url } });
          }}
        />
      )}

      {history !== undefined && history !== null && (
        <dialog className="dialog" open aria-label={L('Revision history', 'রিভিশন ইতিহাস')} style={{ position: 'fixed', zIndex: 'var(--z-modal)' }}>
          <div className="dialog__body">
            <h2 style={{ fontSize: 'var(--fs-2)' }}>{L('Revision history', 'রিভিশন ইতিহাস')}</h2>
            {history.length === 0 ? <p className="muted">{L('No saved revisions yet.', 'এখনো কোনো রিভিশন নেই।')}</p> : (
              <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
                {history.map((h) => (
                  <li key={h.id} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{new Date(h.savedAt).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB')} — {h.title || L('(untitled)', '(শিরোনামহীন)')}</span>
                    <button type="button" className="btn btn--sm" onClick={() => { change(h.post); setHistory(null); toast.info(L('Revision loaded — review it, then save.', 'রিভিশন লোড হয়েছে — দেখে সংরক্ষণ করুন।')); }}>{L('Restore', 'ফিরিয়ে আনুন')}</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="dialog__actions"><button type="button" className="btn" onClick={() => setHistory(null)}>{L('Close', 'বন্ধ')}</button></div>
          </div>
        </dialog>
      )}
    </>
  );
}
