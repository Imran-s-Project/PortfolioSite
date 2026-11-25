'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LogoMark } from '@/components/brand/Logo';
import { ThemeSelector } from '@/components/theme/ThemeSelector';
import { useAdminLang } from '@/features/admin/lang';
import { useAuth } from '@/features/admin/auth';

export default function LoginPage() {
  const { status, user, signIn, signInWithGoogle, signOut } = useAuth();
  const { L, lang, setLang } = useAdminLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'admin') router.replace('/admin');
  }, [status, router]);

  const explain = (err: unknown): string => {
    const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
    if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) return L('Wrong email or password.', 'ইমেইল বা পাসওয়ার্ড ভুল।');
    if (code.includes('too-many-requests')) return L('Too many attempts. Wait a few minutes and try again.', 'অনেকবার চেষ্টা হয়েছে। কয়েক মিনিট পর আবার চেষ্টা করুন।');
    if (code.includes('popup-closed') || code.includes('cancelled-popup')) return '';
    if (code.includes('network')) return L('Network problem. Check your connection.', 'নেটওয়ার্ক সমস্যা। সংযোগ দেখুন।');
    if (code.includes('operation-not-allowed')) return L('This sign-in method is not enabled in Firebase Authentication.', 'এই সাইন-ইন পদ্ধতি ফায়ারবেস অথেনটিকেশনে চালু করা নেই।');
    return L('Could not sign in.', 'সাইন ইন করা যায়নি।');
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  };
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(() => signIn(String(f.get('email') ?? '').trim(), String(f.get('password') ?? '')));
  };

  return (
    <main className="adm-login">
      <div className="row" style={{ position: 'absolute', top: '1rem', insetInlineEnd: '1rem' }}>
        <button type="button" className="btn btn--sm" onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')} lang={lang === 'bn' ? 'en' : 'bn'}>{lang === 'bn' ? 'EN' : 'বাং'}</button>
        <ThemeSelector />
      </div>
      <div className="panel stack" style={{ width: 'min(100%, 26rem)' }}>
        <div className="row" style={{ justifyContent: 'center' }}><LogoMark size={64} /></div>
        <h1 style={{ fontSize: 'var(--fs-3)', textAlign: 'center' }}>{L('Admin sign in', 'অ্যাডমিন সাইন ইন')}</h1>
        {status === 'unauthorized' ? (
          <div className="stack">
            <p className="alert alert--bad" role="alert">{L('This account is not an administrator. Public visitors cannot sign in to the dashboard.', 'এই অ্যাকাউন্টটি অ্যাডমিন নয়। সাধারণ দর্শক ড্যাশবোর্ডে ঢুকতে পারে না।')}</p>
            <p className="muted" style={{ fontSize: 'var(--fs-0)' }}>{L('First-time setup — create the document adminProfiles/<UID> (role = "admin") in the Firebase console. Your UID:', 'প্রথমবারের সেটআপ — ফায়ারবেস কনসোলে adminProfiles/<UID> ডকুমেন্ট (role = "admin") বানান। আপনার UID:')}</p>
            <code className="kbd" style={{ overflowWrap: 'anywhere', padding: '0.5rem' }}>{user?.uid}</code>
            <button type="button" className="btn" onClick={() => void signOut()}>{L('Use another account', 'অন্য অ্যাকাউন্ট ব্যবহার করুন')}</button>
          </div>
        ) : (
          <>
            <form className="form" onSubmit={onSubmit} noValidate>
              <div className="field"><label htmlFor="email">{L('Email', 'ইমেইল')}</label><input id="email" name="email" type="email" className="input" autoComplete="username" required /></div>
              <div className="field"><label htmlFor="password">{L('Password', 'পাসওয়ার্ড')}</label><input id="password" name="password" type="password" className="input" autoComplete="current-password" required /></div>
              <button type="submit" className="btn btn--primary" disabled={busy || status === 'loading'}>{busy ? <span className="spinner" aria-hidden="true" /> : null}{L('Sign in', 'সাইন ইন')}</button>
            </form>
            <button type="button" className="btn btn--ghost" disabled={busy || status === 'loading'} onClick={() => void run(signInWithGoogle)}>{L('Continue with Google', 'গুগল দিয়ে চালিয়ে যান')}</button>
            <div role="alert">{error && <p className="alert alert--bad">{error}</p>}</div>
          </>
        )}
      </div>
    </main>
  );
}
