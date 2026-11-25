'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Icon } from '@/components/shared/Icon';
import { PROJECT_FILTERS } from '@/data/site-data';
import { SEED_PROJECTS } from '@/data/seed-projects';
import { logActivity, plainDoc, revalidateSite, stripUndefined } from '@/features/admin/data';
import { useAuth } from '@/features/admin/auth';
import { useAdminLang } from '@/features/admin/lang';
import { MediaPicker } from '@/features/admin/MediaPicker';
import { ErrorState, LocField, PageHead, useDirtyFlag, useToast } from '@/features/admin/ui';
import { emptyLoc, unzipLines, zipLines } from '@/features/editor/model';
import { getDb } from '@/lib/firebase/client';
import { slugify, isValidSlug } from '@/lib/utils/slug';
import { parseProject } from '@/lib/validation/schemas';
import type { Localized, Project, ProjectImage } from '@/types';

const blank = (): Project => ({ slug: '', mark: '', url: 'https://', categories: [], name: emptyLoc(), category: emptyLoc(), summary: emptyLoc(), technologies: [], screenshots: [], featured: false, order: 100, status: 'published' });

export default function ProjectEditorPage() {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const isNew = routeSlug === 'new';
  const router = useRouter();
  const { L, lang } = useAdminLang();
  const { user, profile, idToken } = useAuth();
  const toast = useToast();
  const [p, setP] = useState<Project>(blank);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(isNew ? 'ready' : 'loading');
  const [exists, setExists] = useState(false);
  const [createdAt, setCreatedAt] = useState<string | undefined>();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<'thumb' | 'shot' | null>(null);
  const [tx, setTx] = useState({ objBn: '', objEn: '', featBn: '', featEn: '', tech: '' });
  useDirtyFlag(dirty);

  const apply = (proj: Project) => {
    setP(proj);
    const o = unzipLines(proj.objectives), f = unzipLines(proj.features);
    setTx({ objBn: o.bn, objEn: o.en, featBn: f.bn, featEn: f.en, tech: proj.technologies.join(', ') });
  };
  useEffect(() => {
    if (isNew) return;
    let alive = true;
    getDoc(doc(getDb(), 'projects', routeSlug))
      .then((snap) => {
        if (!alive) return;
        const remote = snap.exists() ? parseProject({ ...plainDoc(snap.id, snap.data()), slug: snap.id }) : null;
        const seed = SEED_PROJECTS.find((s) => s.slug === routeSlug);
        const chosen = remote ?? seed ?? null;
        if (!chosen) return setState('error');
        setExists(snap.exists());
        setCreatedAt(remote?.createdAt);
        apply(chosen);
        setState('ready');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [routeSlug, isNew]);

  const set = (patch: Partial<Project>) => { setP((cur) => ({ ...cur, ...patch })); setDirty(true); };
  const setText = (patch: Partial<typeof tx>) => { setTx((cur) => ({ ...cur, ...patch })); setDirty(true); };
  const toggleCat = (k: string) => set({ categories: p.categories.includes(k) ? p.categories.filter((c) => c !== k) : [...p.categories, k] });

  const save = async () => {
    if (!user || !profile || saving) return;
    const slug = isNew ? (p.slug || slugify(p.name.en)) : p.slug;
    if (!isValidSlug(slug)) return toast.error(L('The address (slug) must use lowercase letters, numbers and hyphens.', 'অ্যাড্রেস (স্লাগ) ছোট হাতের অক্ষর, সংখ্যা ও হাইফেন দিয়ে হতে হবে।'));
    if (!p.name.bn.trim() && !p.name.en.trim()) return toast.error(L('Add a project name.', 'প্রজেক্টের নাম দিন।'));
    if (!p.summary.bn.trim() && !p.summary.en.trim()) return toast.error(L('Add a short description.', 'সংক্ষিপ্ত বর্ণনা দিন।'));
    if (!/^https:\/\/.+/i.test(p.url)) return toast.error(L('The live address must start with https://', 'লাইভ ঠিকানা https:// দিয়ে শুরু হতে হবে।'));
    const loc = (v: Localized | undefined) => (v && (v.bn.trim() || v.en.trim()) ? v : undefined);
    const body = stripUndefined({
      slug, legacyId: p.legacyId, mark: (p.mark || p.name.en.slice(0, 3)).toUpperCase().slice(0, 8), url: p.url.trim(), categories: p.categories,
      name: p.name, category: p.category, summary: p.summary, description: loc(p.description), objectives: zipLines(tx.objBn, tx.objEn), features: zipLines(tx.featBn, tx.featEn),
      technologies: tx.tech.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 40), process: loc(p.process),
      challenges: (p.challenges ?? []).filter((c) => c.challenge.bn || c.challenge.en), screenshots: p.screenshots, thumbnail: p.thumbnail,
      featured: p.featured, order: Number.isFinite(p.order) ? p.order : 100, status: p.status,
      createdAt: createdAt ? Timestamp.fromDate(new Date(createdAt)) : serverTimestamp(), updatedAt: serverTimestamp()
    });
    setSaving(true);
    try {
      await setDoc(doc(getDb(), 'projects', slug), body);
      setDirty(false);
      setExists(true);
      toast.success(L('Project saved.', 'প্রজেক্ট সংরক্ষিত।'));
      void logActivity({ uid: user.uid, name: profile.displayName || user.email || '' }, exists ? 'update' : 'create', 'project', slug, p.name.en || p.name.bn);
      void idToken().then(revalidateSite);
      if (isNew) router.replace(`/admin/projects/${slug}`);
    } catch {
      toast.error(L('Could not save. Check your connection and permissions.', 'সংরক্ষণ করা যায়নি। সংযোগ ও অনুমতি দেখুন।'));
    } finally {
      setSaving(false);
    }
  };

  if (state === 'loading') return <div className="skeleton" style={{ height: '20rem' }} aria-busy="true" />;
  if (state === 'error') return <ErrorState text={L('Project not found.', 'প্রজেক্ট পাওয়া যায়নি।')} />;
  const img = (i: ProjectImage | undefined, onAlt: (a: Localized) => void, onRemove: () => void) => i && (
    <div className="stack">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={i.url} alt={i.alt[lang]} style={{ maxHeight: '8rem', borderRadius: 'var(--radius-s)' }} />
      <LocField label={L('Alt text', 'অল্ট টেক্সট')} value={i.alt} max={300} onChange={onAlt} />
      <div><button type="button" className="btn btn--sm btn--danger" onClick={onRemove}><Icon name="trash" />{L('Remove', 'সরান')}</button></div>
    </div>
  );
  const challenges = p.challenges ?? [];

  return (
    <>
      <PageHead title={isNew ? L('New project', 'নতুন প্রজেক্ট') : L('Edit project', 'প্রজেক্ট সম্পাদনা')} sub={!isNew && !exists ? L('Built-in project: saving creates your edited copy; the original stays available.', 'বিল্ট-ইন প্রজেক্ট: সংরক্ষণ করলে আপনার সম্পাদিত কপি তৈরি হবে; মূলটি থেকে যাবে।') : undefined} actions={<Link href="/admin/projects" className="btn btn--sm btn--ghost"><Icon name="arrow-left" />{L('All projects', 'সব প্রজেক্ট')}</Link>} />
      <div className="stack">
        <div className="adm-card">
          <h2>{L('Basics', 'মৌলিক তথ্য')}</h2>
          <LocField label={L('Name', 'নাম')} value={p.name} max={200} onChange={(name) => set({ name })} />
          <LocField label={L('Category label', 'ক্যাটাগরির নাম')} value={p.category} max={200} onChange={(category) => set({ category })} />
          <LocField label={L('Short description', 'সংক্ষিপ্ত বর্ণনা')} value={p.summary} multiline rows={3} max={600} onChange={(summary) => set({ summary })} />
          <div className="adm-two">
            <div className="field"><label htmlFor="url">{L('Live address (https://)', 'লাইভ ঠিকানা (https://)')}</label><input id="url" className="input" inputMode="url" value={p.url} onChange={(e) => set({ url: e.target.value })} /></div>
            <div className="field"><label htmlFor="slug">{L('Address on this site (slug)', 'এই সাইটের অ্যাড্রেস (স্লাগ)')}</label><input id="slug" className="input" value={p.slug} disabled={!isNew} placeholder={slugify(p.name.en)} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} /></div>
          </div>
          <div className="adm-two">
            <div className="field"><label htmlFor="mark">{L('Thumbnail mark (2–4 letters)', 'থাম্বনেইল মার্ক (২–৪ অক্ষর)')}</label><input id="mark" className="input" maxLength={8} value={p.mark} onChange={(e) => set({ mark: e.target.value })} /></div>
            <div className="field"><label htmlFor="order">{L('Order', 'ক্রম')}</label><input id="order" type="number" className="input" value={p.order} onChange={(e) => set({ order: Number(e.target.value) })} /></div>
          </div>
          <div role="group" aria-label={L('Categories', 'ক্যাটাগরি')} className="chip-pick">
            {PROJECT_FILTERS.map((f) => <button key={f.key} type="button" className="chip" aria-pressed={p.categories.includes(f.key)} onClick={() => toggleCat(f.key)}>{f.label[lang]}</button>)}
          </div>
          <div className="row">
            <label className="check"><input type="checkbox" checked={p.featured} onChange={(e) => set({ featured: e.target.checked })} />{L('Featured', 'নির্বাচিত')}</label>
            <select className="select" style={{ width: 'auto' }} aria-label={L('Status', 'অবস্থা')} value={p.status} onChange={(e) => set({ status: e.target.value as Project['status'] })}><option value="published">{L('Published', 'প্রকাশিত')}</option><option value="draft">{L('Draft (hidden)', 'খসড়া (লুকানো)')}</option></select>
          </div>
        </div>

        <div className="adm-card">
          <h2>{L('Case study', 'কেস স্টাডি')}</h2>
          <p className="muted">{L('Only fill in what is true. Empty sections are simply not shown on the website.', 'শুধু সত্য তথ্য দিন। ফাঁকা অংশ ওয়েবসাইটে দেখানো হয় না।')}</p>
          <LocField label={L('Full description (blank line = new paragraph)', 'পূর্ণ বর্ণনা (ফাঁকা লাইন = নতুন অনুচ্ছেদ)')} value={p.description ?? emptyLoc()} multiline rows={5} max={8000} onChange={(description) => set({ description })} />
          <div className="adm-two">
            <div className="field"><label htmlFor="obj-bn">{L('Objectives — Bangla (one per line)', 'লক্ষ্য — বাংলা (প্রতি লাইনে একটি)')}</label><textarea id="obj-bn" className="textarea" rows={4} lang="bn" value={tx.objBn} onChange={(e) => setText({ objBn: e.target.value })} /></div>
            <div className="field"><label htmlFor="obj-en">{L('Objectives — English (same order)', 'লক্ষ্য — ইংরেজি (একই ক্রমে)')}</label><textarea id="obj-en" className="textarea" rows={4} lang="en" value={tx.objEn} onChange={(e) => setText({ objEn: e.target.value })} /></div>
            <div className="field"><label htmlFor="feat-bn">{L('Key features — Bangla', 'প্রধান ফিচার — বাংলা')}</label><textarea id="feat-bn" className="textarea" rows={4} lang="bn" value={tx.featBn} onChange={(e) => setText({ featBn: e.target.value })} /></div>
            <div className="field"><label htmlFor="feat-en">{L('Key features — English', 'প্রধান ফিচার — ইংরেজি')}</label><textarea id="feat-en" className="textarea" rows={4} lang="en" value={tx.featEn} onChange={(e) => setText({ featEn: e.target.value })} /></div>
          </div>
          <div className="field"><label htmlFor="tech">{L('Technologies (comma separated — only ones really used)', 'প্রযুক্তি (কমা দিয়ে — শুধু যেগুলো সত্যিই ব্যবহৃত)')}</label><input id="tech" className="input" value={tx.tech} onChange={(e) => setText({ tech: e.target.value })} /></div>
          <LocField label={L('Development process', 'ডেভেলপমেন্ট প্রক্রিয়া')} value={p.process ?? emptyLoc()} multiline rows={4} max={8000} onChange={(process) => set({ process })} />
          <h3>{L('Challenges and solutions', 'চ্যালেঞ্জ ও সমাধান')}</h3>
          {challenges.map((c, i) => (
            <div key={i} className="adm-card">
              <LocField label={L('Challenge', 'চ্যালেঞ্জ')} value={c.challenge} multiline rows={2} max={1200} onChange={(challenge) => set({ challenges: challenges.map((x, j) => (j === i ? { ...x, challenge } : x)) })} />
              <LocField label={L('Solution', 'সমাধান')} value={c.solution} multiline rows={2} max={1200} onChange={(solution) => set({ challenges: challenges.map((x, j) => (j === i ? { ...x, solution } : x)) })} />
              <div><button type="button" className="btn btn--sm btn--danger" onClick={() => set({ challenges: challenges.filter((_, j) => j !== i) })}><Icon name="trash" />{L('Remove', 'সরান')}</button></div>
            </div>
          ))}
          <div><button type="button" className="btn btn--sm" disabled={challenges.length >= 20} onClick={() => set({ challenges: [...challenges, { challenge: emptyLoc(), solution: emptyLoc() }] })}><Icon name="plus" />{L('Add challenge', 'চ্যালেঞ্জ যোগ করুন')}</button></div>
        </div>

        <div className="adm-card">
          <h2>{L('Images', 'ছবি')}</h2>
          <h3>{L('Thumbnail (replaces the generated tile)', 'থাম্বনেইল (তৈরি করা টাইলের বদলে)')}</h3>
          {p.thumbnail ? img(p.thumbnail, (alt) => set({ thumbnail: { ...p.thumbnail!, alt } }), () => set({ thumbnail: undefined })) : <div><button type="button" className="btn btn--sm" onClick={() => setPicker('thumb')}><Icon name="image" />{L('Choose thumbnail', 'থাম্বনেইল বাছুন')}</button></div>}
          <h3>{L('Screenshots', 'স্ক্রিনশট')}</h3>
          {p.screenshots.map((s, i) => <div key={`${s.url}-${i}`}>{img(s, (alt) => set({ screenshots: p.screenshots.map((x, j) => (j === i ? { ...x, alt } : x)) }), () => set({ screenshots: p.screenshots.filter((_, j) => j !== i) }))}</div>)}
          <div><button type="button" className="btn btn--sm" disabled={p.screenshots.length >= 30} onClick={() => setPicker('shot')}><Icon name="plus" />{L('Add screenshot', 'স্ক্রিনশট যোগ করুন')}</button></div>
        </div>
      </div>

      <div className="savebar">
        <span data-state={dirty ? 'dirty' : 'clean'} role="status">{dirty ? L('Unsaved changes', 'সংরক্ষণ হয়নি') : L('All changes saved', 'সব পরিবর্তন সংরক্ষিত')}</span>
        <button type="button" className="btn btn--primary" disabled={saving || (!dirty && exists)} onClick={() => void save()}>{saving ? <span className="spinner" aria-hidden="true" /> : <Icon name="save" />}{L('Save project', 'প্রজেক্ট সংরক্ষণ')}</button>
      </div>
      {picker && <MediaPicker onClose={() => setPicker(null)} onPick={(m) => { const image: ProjectImage = { url: m.url, alt: m.alt, storagePath: m.path }; if (picker === 'thumb') set({ thumbnail: image }); else set({ screenshots: [...p.screenshots, image] }); }} />}
    </>
  );
}
