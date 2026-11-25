'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Icon } from '@/components/shared/Icon';
import { useAuth } from '@/features/admin/auth';
import { logActivity, plainDoc, revalidateSite } from '@/features/admin/data';
import { useAdminLang } from '@/features/admin/lang';
import { MediaPicker } from '@/features/admin/MediaPicker';
import { loadSettings, saveSettingsPart } from '@/features/admin/settings';
import { ErrorState, LocField, PageHead, useDirtyFlag, useToast } from '@/features/admin/ui';
import { getDb } from '@/lib/firebase/client';
import { parsePost } from '@/lib/validation/schemas';
import type { Post, SiteSettings } from '@/types';

export default function SeoPage() {
  const { L, lang } = useAdminLang();
  const { user, profile, idToken } = useAuth();
  const toast = useToast();
  const [s, setS] = useState<SiteSettings | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  useDirtyFlag(dirty);

  useEffect(() => {
    loadSettings().then(setS).catch(() => setFailed(true));
    void getDocs(query(collection(getDb(), 'blogPosts'), where('status', '==', 'published'), orderBy('publishedAt', 'desc'), limit(100))).then((r) => setPosts(r.docs.map((d) => parsePost(plainDoc(d.id, d.data()))).filter((p): p is Post => p !== null))).catch(() => setPosts([]));
  }, []);

  if (failed) return <ErrorState text={L('Could not load.', 'লোড করা যায়নি।')} />;
  if (!s) return <div className="skeleton" style={{ height: '14rem' }} aria-busy="true" />;
  const setSeo = (patch: Partial<SiteSettings['seo']>) => { setS({ ...s, seo: { ...s.seo, ...patch } }); setDirty(true); };

  const save = async () => {
    if (!user || !profile) return;
    if (!s.seo.titleTemplate.includes('%s')) return toast.error(L('The title template must contain %s (the page title goes there).', 'টাইটেল টেমপ্লেটে %s থাকতে হবে (পেজের শিরোনাম সেখানে বসবে)।'));
    setSaving(true);
    try {
      await saveSettingsPart({ seo: s.seo });
      setDirty(false);
      toast.success(L('SEO settings saved.', 'এসইও সেটিংস সংরক্ষিত।'));
      void logActivity({ uid: user.uid, name: profile.displayName || user.email || '' }, 'update', 'settings', 'seo', 'site SEO');
      void idToken().then(revalidateSite);
    } catch {
      toast.error(L('Could not save.', 'সংরক্ষণ করা যায়নি।'));
    } finally {
      setSaving(false);
    }
  };
  const issues = (p: Post): string[] => {
    const out: string[] = [];
    const desc = (p.seo.metaDescription[lang] || p.excerpt[lang]).trim();
    if (!desc) out.push(L('no description', 'বর্ণনা নেই'));
    else if (desc.length < 50 || desc.length > 160) out.push(L(`description ${desc.length} chars (aim 50–160)`, `বর্ণনা ${desc.length} অক্ষর (লক্ষ্য ৫০–১৬০)`));
    if ((p.seo.metaTitle[lang] || p.title[lang]).length > 70) out.push(L('title over 70 chars', 'শিরোনাম ৭০ অক্ষরের বেশি'));
    if (!p.coverImage && !p.seo.ogImage) out.push(L('no share image', 'শেয়ার ছবি নেই'));
    if (!p.content[lang].length) out.push(L('not written in this language', 'এই ভাষায় লেখা নেই'));
    return out;
  };

  return (
    <>
      <PageHead title={L('SEO', 'এসইও')} sub={L('Site-wide defaults, plus a quick audit of every published article.', 'পুরো সাইটের ডিফল্ট, আর প্রতিটি প্রকাশিত লেখার দ্রুত অডিট।')} />
      <div className="adm-card">
        <h2>{L('Site defaults', 'সাইটের ডিফল্ট')}</h2>
        <div className="field"><label htmlFor="tt">{L('Page title template', 'পেজ টাইটেল টেমপ্লেট')}</label><input id="tt" className="input" value={s.seo.titleTemplate} onChange={(e) => setSeo({ titleTemplate: e.target.value })} /><span className="field__hint">{L('Example: %s | Imran Ahmed', 'উদাহরণ: %s | Imran Ahmed')}</span></div>
        <LocField label={L('Default description', 'ডিফল্ট বর্ণনা')} value={s.seo.description} multiline rows={2} max={400} onChange={(description) => setSeo({ description })} />
        <div className="field"><label htmlFor="ogi">{L('Default share image (1200×630 recommended)', 'ডিফল্ট শেয়ার ছবি (১২০০×৬৩০ ভালো)')}</label>
          <div className="row"><input id="ogi" className="input" value={s.seo.ogImage} onChange={(e) => setSeo({ ogImage: e.target.value })} /><button type="button" className="btn btn--sm" onClick={() => setPicker(true)}>{L('Choose', 'বাছুন')}</button></div>
        </div>
        <label className="check"><input type="checkbox" checked={s.seo.noindex} onChange={(e) => setSeo({ noindex: e.target.checked })} />{L('Ask search engines not to index the whole site (noindex)', 'সার্চ ইঞ্জিনকে পুরো সাইট ইনডেক্স না করতে বলুন (noindex)')}</label>
        {s.seo.noindex && <p className="alert alert--bad" role="note">{L('The site will disappear from search results. Turn this off for a live portfolio.', 'সাইট সার্চ ফলাফল থেকে হারিয়ে যাবে। লাইভ পোর্টফোলিওতে এটি বন্ধ রাখুন।')}</p>}
        <div><button type="button" className="btn btn--primary" disabled={saving || !dirty} onClick={() => void save()}><Icon name="save" />{L('Save', 'সংরক্ষণ')}</button></div>
      </div>
      <div className="adm-card">
        <h2>{L('Article audit', 'লেখার অডিট')}</h2>
        {posts === null ? <div className="skeleton" style={{ height: '5rem' }} /> : posts.length === 0 ? <p className="muted">{L('No published articles yet.', 'এখনো কোনো প্রকাশিত লেখা নেই।')}</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>{L('Article', 'লেখা')}</th><th>{L('Findings', 'পর্যবেক্ষণ')}</th></tr></thead>
            <tbody>{posts.map((p) => { const i = issues(p); return (
              <tr key={p.id}><td><Link href={`/admin/posts/${p.id}`}>{p.title[lang] || p.title.en || p.title.bn}</Link></td><td>{i.length ? i.map((x) => <span key={x} className="badge badge--warn" style={{ marginInlineEnd: '0.3rem' }}>{x}</span>) : <span className="badge badge--ok">{L('looks good', 'ঠিক আছে')}</span>}</td></tr>
            ); })}</tbody>
          </table></div>
        )}
      </div>
      {picker && <MediaPicker onClose={() => setPicker(false)} onPick={(m) => setSeo({ ogImage: m.url })} />}
    </>
  );
}
