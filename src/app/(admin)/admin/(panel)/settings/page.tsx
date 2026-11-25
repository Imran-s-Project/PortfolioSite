'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/shared/Icon';
import { ICON_PATHS } from '@/data/site-data';
import { useAuth } from '@/features/admin/auth';
import { logActivity, revalidateSite } from '@/features/admin/data';
import { useAdminLang } from '@/features/admin/lang';
import { loadSettings, saveSettingsPart } from '@/features/admin/settings';
import { ErrorState, LocField, PageHead, useDirtyFlag, useToast } from '@/features/admin/ui';
import { resolveVideo } from '@/lib/utils/embed';
import { safeHref } from '@/lib/utils/inline';
import type { SiteSettings, SocialLink } from '@/types';

export default function SettingsPage() {
  const { L } = useAdminLang();
  const { user, profile, idToken } = useAuth();
  const toast = useToast();
  const [s, setS] = useState<SiteSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useDirtyFlag(dirty);
  useEffect(() => {
    loadSettings().then(setS).catch(() => setFailed(true));
  }, []);

  if (failed) return <ErrorState text={L('Could not load settings.', 'সেটিংস লোড করা যায়নি।')} />;
  if (!s) return <div className="skeleton" style={{ height: '16rem' }} aria-busy="true" />;
  const set = (patch: Partial<SiteSettings>) => { setS({ ...s, ...patch }); setDirty(true); };
  const setSocial = (i: number, patch: Partial<SocialLink>) => set({ socials: s.socials.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const video = s.showcaseVideoUrl.trim() ? resolveVideo(s.showcaseVideoUrl) : null;

  const save = async () => {
    if (!user || !profile) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.email)) return toast.error(L('Enter a valid contact email.', 'সঠিক যোগাযোগের ইমেইল দিন।'));
    if (s.socials.some((x) => !x.name.trim() || !safeHref(x.url))) return toast.error(L('Every social link needs a name and a valid address.', 'প্রতিটি সোশ্যাল লিংকের নাম ও সঠিক ঠিকানা দরকার।'));
    if (s.resumeUrl.trim() && !safeHref(s.resumeUrl)) return toast.error(L('The CV address must start with https:// or / (a file on this site).', 'সিভির ঠিকানা https:// বা / দিয়ে শুরু হতে হবে (এই সাইটের কোনো ফাইল)।'));
    if (s.showcaseVideoUrl.trim() && !video) return toast.error(L('The showcase video address is not supported (YouTube, Vimeo, or an https .mp4/.webm).', 'শোকেস ভিডিওর ঠিকানা সমর্থিত নয় (ইউটিউব, ভিমিও, বা https .mp4/.webm)।'));
    setSaving(true);
    try {
      await saveSettingsPart({ availability: s.availability, availabilityNote: s.availabilityNote, email: s.email.trim(), resumeUrl: s.resumeUrl.trim(), showcaseVideoUrl: s.showcaseVideoUrl.trim(), maintenance: s.maintenance, socials: s.socials });
      setDirty(false);
      toast.success(L('Settings saved.', 'সেটিংস সংরক্ষিত।'));
      void logActivity({ uid: user.uid, name: profile.displayName || user.email || '' }, 'update', 'settings', 'main', 'website settings');
      void idToken().then(revalidateSite);
    } catch {
      toast.error(L('Could not save settings.', 'সেটিংস সংরক্ষণ করা যায়নি।'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHead title={L('Website settings', 'ওয়েবসাইট সেটিংস')} />
      <div className="stack">
        <div className="adm-card">
          <h2>{L('Availability badge (home page)', 'অ্যাভেইলেবিলিটি ব্যাজ (হোম পেজ)')}</h2>
          <p className="muted">{L('Shown only when you choose to — never assumed.', 'আপনি চাইলেই দেখানো হয় — ধরে নেওয়া হয় না।')}</p>
          <div className="field"><label htmlFor="avail">{L('Status', 'অবস্থা')}</label>
            <select id="avail" className="select" value={s.availability} onChange={(e) => set({ availability: e.target.value as SiteSettings['availability'] })}>
              <option value="hidden">{L('Hidden', 'লুকানো')}</option><option value="available">{L('Open to new projects', 'নতুন প্রজেক্টের জন্য প্রস্তুত')}</option><option value="busy">{L('Fully booked', 'পুরোপুরি ব্যস্ত')}</option>
            </select>
          </div>
          <LocField label={L('Custom text (optional)', 'নিজের লেখা (ঐচ্ছিক)')} value={s.availabilityNote} max={200} onChange={(availabilityNote) => set({ availabilityNote })} />
        </div>

        <div className="adm-card">
          <h2>{L('Contact and files', 'যোগাযোগ ও ফাইল')}</h2>
          <div className="adm-two">
            <div className="field"><label htmlFor="email">{L('Contact email', 'যোগাযোগের ইমেইল')}</label><input id="email" type="email" className="input" value={s.email} onChange={(e) => set({ email: e.target.value })} /></div>
            <div className="field"><label htmlFor="cv">{L('CV file address', 'সিভি ফাইলের ঠিকানা')}</label><input id="cv" className="input" value={s.resumeUrl} onChange={(e) => set({ resumeUrl: e.target.value })} /></div>
          </div>
          <div className="field"><label htmlFor="vid">{L('Showcase video (optional section on the home page)', 'শোকেস ভিডিও (হোম পেজের ঐচ্ছিক অংশ)')}</label><input id="vid" className="input" inputMode="url" placeholder="https://www.youtube.com/watch?v=…" value={s.showcaseVideoUrl} onChange={(e) => set({ showcaseVideoUrl: e.target.value })} />
            {s.showcaseVideoUrl.trim() && <span className={video ? 'field__hint' : 'field__error'}>{video ? L('✓ Supported — the section will be shown.', '✓ সমর্থিত — অংশটি দেখানো হবে।') : L('Not supported.', 'সমর্থিত নয়।')}</span>}
          </div>
        </div>

        <div className="adm-card">
          <h2>{L('Social links', 'সোশ্যাল লিংক')}</h2>
          {s.socials.map((x, i) => (
            <div key={x.id + i} className="adm-two" style={{ alignItems: 'end' }}>
              <div className="field"><label htmlFor={`sn-${i}`}>{L('Name', 'নাম')}</label><input id={`sn-${i}`} className="input" value={x.name} onChange={(e) => setSocial(i, { name: e.target.value })} /></div>
              <div className="field"><label htmlFor={`sh-${i}`}>{L('Handle shown', 'দেখানো হ্যান্ডেল')}</label><input id={`sh-${i}`} className="input" value={x.handle} onChange={(e) => setSocial(i, { handle: e.target.value })} /></div>
              <div className="field"><label htmlFor={`su-${i}`}>{L('Address', 'ঠিকানা')}</label><input id={`su-${i}`} className="input" inputMode="url" value={x.url} onChange={(e) => setSocial(i, { url: e.target.value })} aria-invalid={!safeHref(x.url)} /></div>
              <div className="row">
                <select className="select" aria-label={L('Icon', 'আইকন')} value={x.icon} onChange={(e) => setSocial(i, { icon: e.target.value })} style={{ width: 'auto' }}>{Object.keys(ICON_PATHS).map((k) => <option key={k} value={k}>{k}</option>)}</select>
                <button type="button" className="btn btn--sm btn--danger btn--icon" aria-label={L('Remove', 'সরান')} onClick={() => set({ socials: s.socials.filter((_, j) => j !== i) })}><Icon name="trash" /></button>
              </div>
            </div>
          ))}
          <div><button type="button" className="btn btn--sm" disabled={s.socials.length >= 20} onClick={() => set({ socials: [...s.socials, { id: `link-${Date.now().toString(36)}`, name: '', handle: '', url: 'https://', icon: 'github' }] })}><Icon name="plus" />{L('Add link', 'লিংক যোগ করুন')}</button></div>
        </div>

        <div className="adm-card">
          <h2>{L('Maintenance mode', 'রক্ষণাবেক্ষণ মোড')}</h2>
          <label className="check"><input type="checkbox" checked={s.maintenance.enabled} onChange={(e) => set({ maintenance: { ...s.maintenance, enabled: e.target.checked } })} />{L('Show a maintenance page to all visitors', 'সব দর্শককে রক্ষণাবেক্ষণের পাতা দেখান')}</label>
          {s.maintenance.enabled && <p className="alert alert--bad" role="note">{L('While this is on, the public site shows only the message below. This admin area keeps working.', 'এটি চালু থাকলে পাবলিক সাইটে শুধু নিচের বার্তা দেখাবে। এই অ্যাডমিন এলাকা চালু থাকবে।')}</p>}
          <LocField label={L('Message', 'বার্তা')} value={s.maintenance.message} multiline rows={2} max={600} onChange={(message) => set({ maintenance: { ...s.maintenance, message } })} />
        </div>
      </div>
      <div className="savebar"><span data-state={dirty ? 'dirty' : 'clean'} role="status">{dirty ? L('Unsaved changes', 'সংরক্ষণ হয়নি') : L('All changes saved', 'সব পরিবর্তন সংরক্ষিত')}</span><button type="button" className="btn btn--primary" disabled={saving || !dirty} onClick={() => void save()}><Icon name="save" />{L('Save settings', 'সেটিংস সংরক্ষণ')}</button></div>
    </>
  );
}
