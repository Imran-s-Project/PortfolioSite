'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getCountFromServer, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Icon } from '@/components/shared/Icon';
import { appCheckSiteKey, analyticsEnabled, useEmulators } from '@/config/firebase';
import { plainDoc } from '@/features/admin/data';
import { useAdminLang } from '@/features/admin/lang';
import { PageHead } from '@/features/admin/ui';
import { useAuth } from '@/features/admin/auth';
import { getDb } from '@/lib/firebase/client';
import { formatDate } from '@/lib/utils/dates';
import { parsePost } from '@/lib/validation/schemas';
import type { ActivityLog, PostSummary } from '@/types';

interface Stats { published: number; drafts: number; projects: number; unread: number; media: number }

export default function DashboardPage() {
  const { L, lang } = useAdminLang();
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<ActivityLog[] | null>(null);
  const [top, setTop] = useState<PostSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const db = getDb();
    const count = (name: string, ...w: ReturnType<typeof where>[]) => getCountFromServer(query(collection(db, name), ...w)).then((s) => s.data().count);
    void Promise.all([count('blogPosts', where('status', '==', 'published')), count('blogPosts', where('status', '==', 'draft')), count('projects'), count('contactMessages', where('read', '==', false)), count('media')])
      .then(([published, drafts, projects, unread, media]) => alive && setStats({ published, drafts, projects, unread, media }))
      .catch(() => alive && setFailed(true));
    void getDocs(query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(8))).then((s) => alive && setLogs(s.docs.map((d) => plainDoc(d.id, d.data()) as unknown as ActivityLog))).catch(() => alive && setLogs([]));
    void getDocs(query(collection(db, 'blogPosts'), orderBy('views', 'desc'), limit(5))).then((s) => alive && setTop(s.docs.map((d) => parsePost(plainDoc(d.id, d.data()))).filter((p): p is NonNullable<typeof p> => p !== null && p.views > 0))).catch(() => alive && setTop([]));
    return () => {
      alive = false;
    };
  }, []);

  const card = (n: number | undefined, label: string, href: string) => (
    <Link href={href} className="adm-stat"><strong>{n ?? '—'}</strong><span>{label}</span></Link>
  );
  return (
    <>
      <PageHead title={`${L('Welcome', 'স্বাগতম')}${profile?.displayName ? `, ${profile.displayName}` : ''}`} sub={L('What is happening on the site.', 'সাইটে এখন কী চলছে।')} actions={<><Link className="btn btn--primary btn--sm" href="/admin/posts/new"><Icon name="plus" />{L('New post', 'নতুন পোস্ট')}</Link><Link className="btn btn--sm" href="/admin/media"><Icon name="upload" />{L('Upload media', 'মিডিয়া আপলোড')}</Link></>} />
      {failed && <p className="alert alert--bad" role="alert">{L('Could not read the database. Deploy firestore.rules and make sure your account has an adminProfiles document.', 'ডেটাবেজ পড়া যায়নি। firestore.rules ডিপ্লয় করুন এবং আপনার অ্যাকাউন্টের adminProfiles ডকুমেন্ট আছে কি না দেখুন।')}</p>}
      <div className="adm-stats">
        {card(stats?.published, L('Published posts', 'প্রকাশিত পোস্ট'), '/admin/posts')}
        {card(stats?.drafts, L('Drafts', 'খসড়া'), '/admin/posts')}
        {card(stats?.projects, L('Edited / custom projects', 'সম্পাদিত / নতুন প্রজেক্ট'), '/admin/projects')}
        {card(stats?.unread, L('Unread messages', 'অপঠিত বার্তা'), '/admin/messages')}
        {card(stats?.media, L('Media files', 'মিডিয়া ফাইল'), '/admin/media')}
      </div>
      <div className="adm-split">
        <section className="adm-card" aria-labelledby="act">
          <h2 id="act">{L('Recent activity', 'সাম্প্রতিক কার্যক্রম')}</h2>
          {logs === null ? <div className="skeleton" style={{ height: '6rem' }} /> : logs.length === 0 ? <p className="muted">{L('Nothing yet — actions you take are logged here.', 'এখনো কিছু নেই — আপনার কাজগুলো এখানে লগ হবে।')}</p> : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
              {logs.map((l) => <li key={l.id}><strong>{l.actorName || '—'}</strong> · {l.action} {l.entity} <span className="muted">— {l.summary}</span> <small className="muted">{formatDate(l.createdAt, lang, { dateStyle: 'medium', timeStyle: 'short' })}</small></li>)}
            </ul>
          )}
        </section>
        <section className="adm-card" aria-labelledby="top">
          <h2 id="top">{L('Most read articles', 'সবচেয়ে বেশি পড়া লেখা')}</h2>
          {top === null ? <div className="skeleton" style={{ height: '6rem' }} /> : top.length === 0 ? <p className="muted">{L('No article views counted yet.', 'এখনো কোনো ভিউ গোনা হয়নি।')}</p> : (
            <div className="adm-bars">
              {top.map((p) => <div className="adm-bar" key={p.id}><Link href={`/admin/posts/${p.id}`}>{p.title[lang] || p.title.en || p.title.bn}</Link><i style={{ width: `${Math.max(4, (p.views / (top[0]?.views || 1)) * 100)}%` }} /><span>{p.views}</span></div>)}
            </div>
          )}
        </section>
      </div>
      <section className="adm-card" aria-labelledby="sys">
        <h2 id="sys">{L('System status', 'সিস্টেমের অবস্থা')}</h2>
        <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
          <li className="adm-check"><span className={appCheckSiteKey ? 'badge badge--ok' : 'badge badge--warn'}>{appCheckSiteKey ? 'OK' : '!'}</span><span>{appCheckSiteKey ? L('App Check key is configured.', 'App Check কী কনফিগার করা আছে।') : L('App Check is not configured (NEXT_PUBLIC_RECAPTCHA_SITE_KEY is empty). See docs/FIREBASE_SETUP.md.', 'App Check কনফিগার করা নেই (NEXT_PUBLIC_RECAPTCHA_SITE_KEY ফাঁকা)। docs/FIREBASE_SETUP.md দেখুন।')}</span></li>
          <li className="adm-check"><span className="badge">{analyticsEnabled ? 'ON' : 'OFF'}</span><span>{L('Analytics (GA4) switch', 'অ্যানালিটিক্স (GA4) সুইচ')}</span></li>
          {useEmulators && <li className="adm-check"><span className="badge badge--warn">DEV</span><span>{L('The browser is talking to the local Firebase emulators.', 'ব্রাউজার লোকাল ফায়ারবেস এমুলেটরের সাথে কথা বলছে।')}</span></li>}
        </ul>
      </section>
    </>
  );
}
