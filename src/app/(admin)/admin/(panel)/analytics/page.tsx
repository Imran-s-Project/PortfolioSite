'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { collection, getCountFromServer, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { analyticsEnabled } from '@/config/firebase';
import { plainDoc } from '@/features/admin/data';
import { useAdminLang } from '@/features/admin/lang';
import { ErrorState, PageHead } from '@/features/admin/ui';
import { useResource } from '@/features/admin/useResource';
import { getDb } from '@/lib/firebase/client';
import { parsePost } from '@/lib/validation/schemas';
import type { ContactMessage, Post } from '@/types';

const WEEK = 7 * 24 * 3600 * 1000;

interface Stats {
  posts: Post[];
  messages: ContactMessage[];
  /** null when the count could not be read (it is only a nice-to-have number). */
  media: number | null;
  /** The clock the weekly buckets are counted back from — read when the data is loaded, never while rendering. */
  loadedAt: number;
}

async function fetchStats(): Promise<Stats> {
  const db = getDb();
  const [postSnap, messageSnap, media] = await Promise.all([
    getDocs(query(collection(db, 'blogPosts'), orderBy('views', 'desc'), limit(100))),
    getDocs(query(collection(db, 'contactMessages'), orderBy('createdAt', 'desc'), limit(200))),
    getCountFromServer(collection(db, 'media')).then((s) => s.data().count).catch(() => null)
  ]);
  return {
    posts: postSnap.docs.map((d) => parsePost(plainDoc(d.id, d.data()))).filter((p): p is Post => p !== null),
    messages: messageSnap.docs.map((d) => plainDoc(d.id, d.data()) as unknown as ContactMessage),
    media,
    loadedAt: Date.now()
  };
}

/** Real numbers only — computed from your own data. (No invented traffic charts.) */
export default function AnalyticsPage() {
  const { L, lang } = useAdminLang();
  const { data, failed } = useResource(fetchStats);
  const posts = data?.posts ?? null;
  const messages = data?.messages ?? null;
  const media = data?.media ?? null;

  const totalViews = useMemo(() => (posts ?? []).reduce((n, p) => n + p.views, 0), [posts]);
  const weekly = useMemo(() => {
    if (!data) return [];
    return Array.from({ length: 8 }, (_, i) => {
      const end = data.loadedAt - (7 - i) * WEEK, start = end - WEEK;
      return { label: new Date(end).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' }), n: data.messages.filter((m) => { const t = new Date(m.createdAt).getTime(); return t > start && t <= end; }).length };
    });
  }, [data, lang]);
  const top = (posts ?? []).filter((p) => p.views > 0).slice(0, 8);
  const maxWeek = Math.max(1, ...weekly.map((w) => w.n));

  if (failed) return <ErrorState text={L('Could not read the data.', 'ডেটা পড়া যায়নি।')} />;
  return (
    <>
      <PageHead title={L('Analytics', 'অ্যানালিটিক্স')} sub={L('Counted from your own database. Page-visit traffic needs Google Analytics (see below).', 'আপনার নিজের ডেটাবেজ থেকে গোনা। পেজ-ভিজিটের ট্রাফিকের জন্য গুগল অ্যানালিটিক্স লাগবে (নিচে দেখুন)।')} />
      <div className="adm-stats">
        <div className="adm-stat"><strong>{posts?.filter((p) => p.status === 'published').length ?? '—'}</strong><span>{L('Published articles', 'প্রকাশিত লেখা')}</span></div>
        <div className="adm-stat"><strong>{posts ? totalViews : '—'}</strong><span>{L('Article views (all time)', 'লেখার ভিউ (সর্বমোট)')}</span></div>
        <div className="adm-stat"><strong>{messages?.length ?? '—'}</strong><span>{L('Messages received', 'প্রাপ্ত বার্তা')}</span></div>
        <div className="adm-stat"><strong>{media ?? '—'}</strong><span>{L('Media files', 'মিডিয়া ফাইল')}</span></div>
      </div>
      <div className="adm-split">
        <section className="adm-card" aria-labelledby="tp">
          <h2 id="tp">{L('Most read articles', 'সবচেয়ে বেশি পড়া লেখা')}</h2>
          {posts === null ? <div className="skeleton" style={{ height: '6rem' }} /> : top.length === 0 ? <p className="muted">{L('No article views yet. Views are counted once per visitor session.', 'এখনো কোনো ভিউ নেই। প্রতি দর্শক সেশনে একবার গোনা হয়।')}</p> : (
            <div className="adm-bars">{top.map((p) => <div className="adm-bar" key={p.id}><Link href={`/admin/posts/${p.id}`}>{p.title[lang] || p.title.en || p.title.bn}</Link><i style={{ width: `${Math.max(4, (p.views / (top[0]?.views || 1)) * 100)}%` }} /><span>{p.views}</span></div>)}</div>
          )}
        </section>
        <section className="adm-card" aria-labelledby="wk">
          <h2 id="wk">{L('Messages per week (last 8 weeks)', 'সপ্তাহ অনুযায়ী বার্তা (শেষ ৮ সপ্তাহ)')}</h2>
          {messages === null ? <div className="skeleton" style={{ height: '6rem' }} /> : (
            <div className="adm-bars">{weekly.map((w) => <div className="adm-bar" key={w.label}><span>{w.label}</span><i style={{ width: `${Math.max(w.n ? 4 : 0, (w.n / maxWeek) * 100)}%` }} /><span>{w.n}</span></div>)}</div>
          )}
        </section>
      </div>
      <section className="adm-card" aria-labelledby="ga">
        <h2 id="ga">{L('Site traffic (Google Analytics 4)', 'সাইটের ট্রাফিক (গুগল অ্যানালিটিক্স ৪)')}</h2>
        <p>{analyticsEnabled ? L('GA4 collection is switched on for the public site. Open your reports in Google Analytics — they are not duplicated here.', 'পাবলিক সাইটে GA4 সংগ্রহ চালু আছে। রিপোর্ট গুগল অ্যানালিটিক্সে দেখুন — এখানে নকল করা হয়নি।') : L('Collection is off. To measure visits, set NEXT_PUBLIC_ENABLE_ANALYTICS=true in Vercel (the privacy page then mentions it automatically).', 'সংগ্রহ বন্ধ আছে। ভিজিট মাপতে Vercel-এ NEXT_PUBLIC_ENABLE_ANALYTICS=true দিন (তখন গোপনীয়তা পাতায় নিজে থেকেই উল্লেখ হবে)।')}</p>
        <div><a className="btn btn--sm" href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">{L('Open Google Analytics', 'গুগল অ্যানালিটিক্স খুলুন')}</a></div>
      </section>
    </>
  );
}
