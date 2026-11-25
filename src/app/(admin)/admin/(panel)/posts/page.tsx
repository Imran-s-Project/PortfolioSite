'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, deleteDoc, doc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Icon } from '@/components/shared/Icon';
import { logActivity, plainDoc, revalidateSite } from '@/features/admin/data';
import { useAuth } from '@/features/admin/auth';
import { useAdminLang } from '@/features/admin/lang';
import { EmptyState, ErrorState, PageHead, Pager, StatusBadge, TableSkeleton, usePaged, useConfirm, useToast } from '@/features/admin/ui';
import { useResource } from '@/features/admin/useResource';
import { getDb } from '@/lib/firebase/client';
import { formatDate } from '@/lib/utils/dates';
import { pick } from '@/i18n/locales';
import { parsePost, parseTaxonomy } from '@/lib/validation/schemas';
import type { Post, Taxonomy } from '@/types';

/**
 * The newest-edited posts plus the categories that label them. A category failure must never hide the posts, and a stored post the
 * site cannot read is reported (by id) instead of silently missing from the list.
 */
async function fetchPosts(): Promise<{ posts: Post[]; cats: Taxonomy[]; unreadable: string[] }> {
  const db = getDb();
  const [postSnap, catSnap] = await Promise.all([
    getDocs(query(collection(db, 'blogPosts'), orderBy('updatedAt', 'desc'), limit(100))),
    getDocs(collection(db, 'blogCategories')).catch(() => null)
  ]);
  const parsed = postSnap.docs.map((d) => ({ id: d.id, post: parsePost(plainDoc(d.id, d.data())) }));
  return {
    posts: parsed.flatMap((x) => (x.post ? [x.post] : [])),
    unreadable: parsed.filter((x) => x.post === null).map((x) => x.id),
    cats: catSnap ? catSnap.docs.map((d) => parseTaxonomy(plainDoc(d.id, d.data()))).filter((x): x is Taxonomy => x !== null) : []
  };
}

export default function PostsPage() {
  const { L, lang } = useAdminLang();
  const { user, profile, idToken } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const { data, failed, reload, update } = useResource(fetchPosts);
  const posts = data?.posts ?? null;
  const cats = useMemo(() => data?.cats ?? [], [data]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'published' | 'draft'>('all');

  const filtered = useMemo(() => (posts ?? []).filter((p) => (status === 'all' || p.status === status) && (!q.trim() || `${p.title.bn} ${p.title.en} ${p.slug}`.toLowerCase().includes(q.trim().toLowerCase()))), [posts, q, status]);
  const paged = usePaged(filtered, 10);
  const catName = (id: string | null) => { const c = cats.find((x) => x.id === id); return c ? pick(c.name, lang) : '—'; };

  const remove = async (p: Post) => {
    if (!(await confirm({ title: L('Delete this post?', 'পোস্টটি মুছবেন?'), body: `${p.title[lang] || p.title.en || p.title.bn} — ${L('its revision history is deleted too. This cannot be undone.', 'এর রিভিশন ইতিহাসও মুছে যাবে। এটি ফেরানো যাবে না।')}`, confirmLabel: L('Delete', 'মুছুন'), danger: true }))) return;
    try {
      const db = getDb();
      const revs = await getDocs(collection(db, 'blogPosts', p.id, 'revisions'));
      await Promise.all(revs.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'blogPosts', p.id));
      update((cur) => ({ ...cur, posts: cur.posts.filter((x) => x.id !== p.id) }));
      toast.success(L('Post deleted.', 'পোস্ট মুছে গেছে।'));
      if (user && profile) void logActivity({ uid: user.uid, name: profile.displayName || user.email || '' }, 'delete', 'post', p.id, p.title.en || p.title.bn);
      void idToken().then(revalidateSite);
    } catch {
      toast.error(L('Could not delete the post.', 'পোস্ট মোছা যায়নি।'));
    }
  };

  return (
    <>
      <PageHead title={L('Blog posts', 'ব্লগ পোস্ট')} actions={<Link href="/admin/posts/new" className="btn btn--primary btn--sm"><Icon name="plus" />{L('New post', 'নতুন পোস্ট')}</Link>} />
      <div className="adm-toolbar">
        <input className="input" type="search" placeholder={L('Search posts…', 'পোস্ট খুঁজুন…')} aria-label={L('Search posts', 'পোস্ট খুঁজুন')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" aria-label={L('Filter by status', 'অবস্থা অনুযায়ী')} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">{L('All', 'সব')}</option><option value="published">{L('Published', 'প্রকাশিত')}</option><option value="draft">{L('Drafts', 'খসড়া')}</option>
        </select>
      </div>
      {data && data.unreadable.length > 0 && (
        <p className="alert alert--bad" role="alert">
          {L(
            `${data.unreadable.length} stored post(s) cannot be read by the site (invalid data), so they are hidden everywhere. Fix or delete them in the Firebase console → Firestore → blogPosts. Document id: ${data.unreadable.join(', ')}`,
            `${data.unreadable.length}টি সংরক্ষিত পোস্ট সাইট পড়তে পারছে না (তথ্য অবৈধ), তাই সেগুলো সবখানে লুকানো আছে। ফায়ারবেস কনসোল → Firestore → blogPosts-এ গিয়ে ঠিক করুন বা মুছুন। ডকুমেন্ট আইডি: ${data.unreadable.join(', ')}`
          )}
        </p>
      )}
      {failed ? <ErrorState text={L('Could not load posts.', 'পোস্ট লোড করা যায়নি।')} onRetry={reload} /> : posts === null ? <TableSkeleton /> : filtered.length === 0 ? (
        <EmptyState title={posts.length === 0 ? L('No posts yet', 'এখনো কোনো পোস্ট নেই') : L('No post matches', 'কোনো পোস্ট মেলেনি')} text={posts.length === 0 ? L('Write your first article with the block editor.', 'ব্লক এডিটর দিয়ে প্রথম লেখাটি লিখুন।') : undefined} action={posts.length === 0 ? <Link href="/admin/posts/new" className="btn btn--primary btn--sm">{L('New post', 'নতুন পোস্ট')}</Link> : undefined} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{L('Title', 'শিরোনাম')}</th><th>{L('Status', 'অবস্থা')}</th><th>{L('Category', 'ক্যাটাগরি')}</th><th>{L('Updated', 'হালনাগাদ')}</th><th>{L('Views', 'ভিউ')}</th><th><span className="sr-only">{L('Actions', 'কাজ')}</span></th></tr></thead>
              <tbody>
                {paged.slice.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/admin/posts/${p.id}`}><strong>{p.title[lang] || p.title.en || p.title.bn}</strong></Link><br /><small className="muted">/{p.slug}</small></td>
                    <td><StatusBadge status={p.status} /></td>
                    <td>{catName(p.categoryId)}</td>
                    <td>{formatDate(p.updatedAt, lang, { dateStyle: 'medium' })}</td>
                    <td>{p.views}</td>
                    <td><div className="adm-actions">
                      <Link href={`/admin/posts/${p.id}`} className="btn btn--sm btn--icon" aria-label={L('Edit', 'সম্পাদনা')}><Icon name="edit" /></Link>
                      {p.status === 'published' && <a href={`/${lang}/blog/${p.slug}`} className="btn btn--sm btn--icon" target="_blank" rel="noopener noreferrer" aria-label={L('View live', 'লাইভ দেখুন')}><Icon name="external" /></a>}
                      <button type="button" className="btn btn--sm btn--icon btn--danger" aria-label={L('Delete', 'মুছুন')} onClick={() => void remove(p)}><Icon name="trash" /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...paged} />
        </>
      )}
    </>
  );
}
