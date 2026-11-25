'use client';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { LogoMark } from '@/components/brand/Logo';
import { Icon, type IconName } from '@/components/shared/Icon';
import { ThemeSelector } from '@/components/theme/ThemeSelector';
import { MotionToggle } from '@/components/motion/MotionToggle';
import { getDb } from '@/lib/firebase/client';
import { useAuth } from './auth';
import { useAdminLang } from './lang';
import { dirtyFlag } from './ui';

interface NavItem { href: string; icon: IconName; en: string; bn: string; exact?: boolean }
const NAV: NavItem[] = [
  { href: '/admin', icon: 'dashboard', en: 'Dashboard', bn: 'ড্যাশবোর্ড', exact: true },
  { href: '/admin/posts', icon: 'file', en: 'Blog posts', bn: 'ব্লগ পোস্ট' },
  { href: '/admin/projects', icon: 'folder', en: 'Projects', bn: 'প্রজেক্ট' },
  { href: '/admin/media', icon: 'image', en: 'Media library', bn: 'মিডিয়া লাইব্রেরি' },
  { href: '/admin/categories', icon: 'folder', en: 'Categories', bn: 'ক্যাটাগরি' },
  { href: '/admin/tags', icon: 'tag', en: 'Tags', bn: 'ট্যাগ' },
  { href: '/admin/messages', icon: 'inbox', en: 'Messages', bn: 'বার্তা' },
  { href: '/admin/seo', icon: 'globe', en: 'SEO', bn: 'এসইও' },
  { href: '/admin/settings', icon: 'settings', en: 'Website settings', bn: 'ওয়েবসাইট সেটিংস' },
  { href: '/admin/theme', icon: 'palette', en: 'Theme', bn: 'থিম' },
  { href: '/admin/analytics', icon: 'chart', en: 'Analytics', bn: 'অ্যানালিটিক্স' },
  { href: '/admin/profile', icon: 'user', en: 'Profile', bn: 'প্রোফাইল' },
  { href: '/admin/security', icon: 'shield', en: 'Security', bn: 'নিরাপত্তা' }
];

function Centered({ children }: { children: ReactNode }) {
  return <div className="adm-boot">{children}</div>;
}

/** Everything under /admin except the login page: waits for sign-in, refuses non-admins, then shows the dashboard shell. */
export function AdminGate({ children }: { children: ReactNode }) {
  const { status, user, signOut } = useAuth();
  const { L } = useAdminLang();
  const router = useRouter();
  useEffect(() => {
    if (status === 'signedOut') router.replace('/admin/login');
  }, [status, router]);

  if (status === 'loading' || status === 'signedOut') return <Centered><span className="spinner" aria-label={L('Loading', 'লোড হচ্ছে')} /></Centered>;
  if (status === 'unauthorized') {
    return (
      <Centered>
        <div className="panel stack" style={{ maxWidth: '34rem' }}>
          <h1 style={{ fontSize: 'var(--fs-3)' }}>{L('No administrator access', 'অ্যাডমিন অনুমতি নেই')}</h1>
          <p>{L('You are signed in, but this account is not an administrator of the site. Public visitors cannot create or change anything.', 'আপনি সাইন ইন করেছেন, কিন্তু এই অ্যাকাউন্টটি সাইটের অ্যাডমিন নয়। সাধারণ দর্শক কিছু তৈরি বা পরিবর্তন করতে পারে না।')}</p>
          <p className="muted">{L('First-time setup: in Firebase console → Firestore, create the document adminProfiles/<your UID> with role = "admin". Your UID:', 'প্রথমবারের সেটআপ: ফায়ারবেস কনসোল → Firestore-এ adminProfiles/<আপনার UID> নামে একটি ডকুমেন্ট বানান, role = "admin" দিয়ে। আপনার UID:')}</p>
          <code className="kbd" style={{ overflowWrap: 'anywhere', padding: '0.5rem' }}>{user?.uid}</code>
          <button type="button" className="btn" onClick={() => void signOut()}>{L('Sign out', 'সাইন আউট')}</button>
        </div>
      </Centered>
    );
  }
  return <Shell>{children}</Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  const { profile, user, signOut } = useAuth();
  const { L, lang, setLang } = useAdminLang();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    void getCountFromServer(query(collection(getDb(), 'contactMessages'), where('read', '==', false)))
      .then((s) => alive && setUnread(s.data().count))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [pathname]);

  const guard = (e: MouseEvent) => {
    if (dirtyFlag.current && !window.confirm(L('You have unsaved changes. Leave this page anyway?', 'সংরক্ষণ না করা পরিবর্তন আছে। তবুও এই পাতা ছেড়ে যাবেন?'))) e.preventDefault();
    else setOpen(false);
  };
  const isActive = (n: NavItem) => (n.exact ? pathname === n.href : pathname.startsWith(n.href));

  return (
    <div className="adm" data-open={open}>
      <a className="skip" href="#adm-main">{L('Skip to content', 'মূল অংশে যান')}</a>
      <aside className="adm-side" aria-label={L('Admin navigation', 'অ্যাডমিন নেভিগেশন')}>
        <Link href="/admin" className="adm-brand" onClick={guard}><LogoMark size={34} /><span>{L('Admin', 'অ্যাডমিন')}</span></Link>
        <nav>
          <ul>
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="adm-link" aria-current={isActive(n) ? 'page' : undefined} onClick={guard}>
                  <Icon name={n.icon} />
                  <span>{L(n.en, n.bn)}</span>
                  {n.href === '/admin/messages' && unread > 0 && <span className="badge badge--warn" aria-label={`${unread} ${L('unread', 'অপঠিত')}`}>{unread}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="adm-col">
        <header className="adm-top">
          <button type="button" className="btn btn--icon btn--sm adm-menu" aria-expanded={open} aria-label={L('Menu', 'মেনু')} onClick={() => setOpen((v) => !v)}><Icon name={open ? 'close' : 'menu'} /></button>
          <div className="row" style={{ marginInlineStart: 'auto' }}>
            <a className="btn btn--sm btn--ghost" href="/" target="_blank" rel="noopener noreferrer"><Icon name="external" />{L('View site', 'সাইট দেখুন')}</a>
            <button type="button" className="btn btn--sm" onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')} aria-label={L('Switch language', 'ভাষা পরিবর্তন')} lang={lang === 'bn' ? 'en' : 'bn'}>{lang === 'bn' ? 'EN' : 'বাং'}</button>
            <MotionToggle className="btn btn--icon btn--sm" />
            <ThemeSelector />
            <span className="adm-user" title={user?.email ?? ''}>{profile?.displayName || user?.email}</span>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => void signOut()}><Icon name="logout" />{L('Sign out', 'সাইন আউট')}</button>
          </div>
        </header>
        <main id="adm-main" className="adm-main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
