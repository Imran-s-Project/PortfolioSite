'use client';
import { useState, type FormEvent } from 'react';
import { appCheckSiteKey, useEmulators } from '@/config/firebase';
import { useAuth } from '@/features/admin/auth';
import { useAdminLang } from '@/features/admin/lang';
import { PageHead, useToast } from '@/features/admin/ui';

export default function SecurityPage() {
  const { L } = useAdminLang();
  const { user, changePassword, sendVerification, signOut } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const hasPassword = !!user?.providerData.some((p) => p.providerId === 'password');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const current = String(f.get('current') ?? ''), next = String(f.get('next') ?? ''), again = String(f.get('again') ?? '');
    if (next.length < 10) return toast.error(L('Use at least 10 characters.', 'কমপক্ষে ১০টি অক্ষর দিন।'));
    if (next !== again) return toast.error(L('The two new passwords do not match.', 'দুটি নতুন পাসওয়ার্ড মেলেনি।'));
    setBusy(true);
    try {
      await changePassword(current, next);
      form.reset();
      toast.success(L('Password changed.', 'পাসওয়ার্ড বদলেছে।'));
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
      toast.error(/invalid-credential|wrong-password/.test(code) ? L('The current password is wrong.', 'বর্তমান পাসওয়ার্ড ভুল।') : code.includes('weak') ? L('The new password is too weak.', 'নতুন পাসওয়ার্ড দুর্বল।') : L('Could not change the password.', 'পাসওয়ার্ড বদলানো যায়নি।'));
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    try {
      await sendVerification();
      toast.success(L('Verification email sent.', 'ভেরিফিকেশন ইমেইল পাঠানো হয়েছে।'));
    } catch {
      toast.error(L('Could not send the email.', 'ইমেইল পাঠানো যায়নি।'));
    }
  };
  const check = (ok: boolean, text: string) => <li className="adm-check"><span className={ok ? 'badge badge--ok' : 'badge badge--warn'}>{ok ? 'OK' : '!'}</span><span>{text}</span></li>;

  return (
    <>
      <PageHead title={L('Security', 'নিরাপত্তা')} />
      <div className="adm-split">
        <div className="stack">
          {hasPassword && (
            <form className="adm-card form" onSubmit={(e) => void submit(e)}>
              <h2>{L('Change password', 'পাসওয়ার্ড বদলান')}</h2>
              <div className="field"><label htmlFor="cur">{L('Current password', 'বর্তমান পাসওয়ার্ড')}</label><input id="cur" name="current" type="password" className="input" autoComplete="current-password" required /></div>
              <div className="field"><label htmlFor="nw">{L('New password (10+ characters)', 'নতুন পাসওয়ার্ড (১০+ অক্ষর)')}</label><input id="nw" name="next" type="password" className="input" autoComplete="new-password" minLength={10} required /></div>
              <div className="field"><label htmlFor="ag">{L('Repeat new password', 'নতুন পাসওয়ার্ড আবার')}</label><input id="ag" name="again" type="password" className="input" autoComplete="new-password" required /></div>
              <div><button type="submit" className="btn btn--primary" disabled={busy}>{L('Change password', 'পাসওয়ার্ড বদলান')}</button></div>
            </form>
          )}
          <div className="adm-card">
            <h2>{L('This session', 'এই সেশন')}</h2>
            <p className="muted">{L('Signed in with', 'সাইন ইন করা হয়েছে')}: {user?.providerData.map((p) => p.providerId.replace('.com', '')).join(', ') || '—'}</p>
            <p className="muted">{L('Last sign-in', 'সর্বশেষ সাইন ইন')}: {user?.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : '—'}</p>
            <div className="row">
              {!user?.emailVerified && hasPassword && <button type="button" className="btn btn--sm" onClick={() => void verify()}>{L('Send verification email', 'ভেরিফিকেশন ইমেইল পাঠান')}</button>}
              <button type="button" className="btn btn--sm btn--danger" onClick={() => void signOut()}>{L('Sign out of this device', 'এই ডিভাইস থেকে সাইন আউট')}</button>
            </div>
          </div>
        </div>
        <section className="adm-card" aria-labelledby="cl">
          <h2 id="cl">{L('Security checklist', 'নিরাপত্তা চেকলিস্ট')}</h2>
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {check(!!user?.emailVerified, L('Your email address is verified.', 'আপনার ইমেইল যাচাই করা।'))}
            {check(!!appCheckSiteKey, L('App Check (reCAPTCHA v3) is configured in this build.', 'এই বিল্ডে App Check (reCAPTCHA v3) কনফিগার করা।'))}
            {check(!useEmulators, L('Not pointing at local emulators.', 'লোকাল এমুলেটরের দিকে নয়।'))}
            <li className="adm-check"><span className="badge">i</span><span>{L('Security Rules are enforced by Firebase on every request — deploy firestore.rules and storage.rules after any change (docs/FIREBASE_SETUP.md).', 'প্রতিটি রিকোয়েস্টে ফায়ারবেস সিকিউরিটি রুলস প্রয়োগ করে — পরিবর্তনের পর firestore.rules ও storage.rules ডিপ্লয় করুন (docs/FIREBASE_SETUP.md)।')}</span></li>
            <li className="adm-check"><span className="badge">i</span><span>{L('Recommended: turn on multi-factor authentication for admin accounts in Firebase Authentication, and restrict the web API key to your domains in Google Cloud.', 'প্রস্তাবিত: ফায়ারবেস অথেনটিকেশনে অ্যাডমিন অ্যাকাউন্টের জন্য মাল্টি-ফ্যাক্টর চালু করুন, আর গুগল ক্লাউডে ওয়েব API কী আপনার ডোমেইনে সীমিত করুন।')}</span></li>
          </ul>
        </section>
      </div>
    </>
  );
}
