'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGroup, motion } from 'motion/react';
import { LogoMark } from '@/components/brand/Logo';
import { Icon } from '@/components/shared/Icon';
import { MotionToggle } from '@/components/motion/MotionToggle';
import { ThemeSelector } from '@/components/theme/ThemeSelector';
import { useMagnetic } from '@/hooks/useMagnetic';
import { LOCALE_COOKIE } from '@/config/site';
import { localizePath, swapLocale } from '@/i18n/locales';
import { useLocale, useMessages } from './LocaleProvider';
import styles from './SiteHeader.module.css';

interface Item { key: string; href: string; label: string; current: boolean }

function NavLink({ item }: { item: Item }) {
  const ref = useMagnetic<HTMLAnchorElement>();
  return (
    <li>
      <Link ref={ref} href={item.href} className={styles.link} aria-current={item.current ? 'page' : undefined}>
        {item.current && <motion.span layoutId="nav-pill" className={styles.pill} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
        <span className={styles.label}>{item.label}</span>
      </Link>
    </li>
  );
}

export function SiteHeader() {
  const locale = useLocale();
  const m = useMessages();
  const pathname = usePathname();
  const [compact, setCompact] = useState(false);
  const [menu, setMenu] = useState(false);
  const [onContact, setOnContact] = useState(false);
  const home = localizePath(locale, '/');
  const isHome = pathname === home;
  const other = locale === 'bn' ? 'en' : 'bn';

  // scroll-aware: the bar condenses into a glass capsule once the page moves
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setCompact(scrollY > 24);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    return () => {
      removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // on the home page, highlight "Contact" while that section is on screen
  useEffect(() => {
    const el = isHome ? document.getElementById('contact') : null;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setOnContact(!!entry?.isIntersecting), { rootMargin: '-40% 0px -40% 0px' });
    io.observe(el);
    return () => {
      io.disconnect();
      setOnContact(false);
    };
  }, [isHome]);

  // mobile sheet: Escape closes, page scroll is locked while open
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.documentElement.dataset.lock = 'true';
    addEventListener('keydown', onKey);
    return () => {
      delete document.documentElement.dataset.lock;
      removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const items: Item[] = [
    { key: 'home', href: home, label: m.nav.home, current: isHome && !onContact },
    { key: 'projects', href: localizePath(locale, '/projects'), label: m.nav.projects, current: pathname.startsWith(localizePath(locale, '/projects')) },
    { key: 'blog', href: localizePath(locale, '/blog'), label: m.nav.blog, current: pathname.startsWith(localizePath(locale, '/blog')) },
    { key: 'about', href: localizePath(locale, '/about'), label: m.nav.about, current: pathname.startsWith(localizePath(locale, '/about')) },
    { key: 'contact', href: `${home}#contact`, label: m.nav.contact, current: onContact }
  ];

  return (
    <header className={styles.header} data-compact={compact}>
      <div className={styles.bar}>
        <Link href={home} className={styles.brand} aria-label={`${m.meta.siteName} — ${m.nav.home}`}>
          <LogoMark size={compact ? 30 : 36} />
          <span className={styles.wordmark}>{m.meta.siteName}</span>
        </Link>

        <nav className={styles.nav} aria-label={m.a11y.primaryNav}>
          <LayoutGroup id="primary-nav">
            <ul>{items.map((it) => <NavLink key={it.key} item={it} />)}</ul>
          </LayoutGroup>
        </nav>

        <div className={styles.tools}>
          <button type="button" className={styles.tool} onClick={() => window.dispatchEvent(new Event('open-search'))} aria-label={m.controls.search} title={m.controls.searchTitle}>
            <Icon name="search" />
            <span className={`kbd ${styles.kbdHint}`} aria-hidden="true">Ctrl K</span>
          </button>
          <MotionToggle className={styles.tool} />
          <Link
            href={swapLocale(pathname, other)}
            className={styles.tool}
            lang={other}
            hrefLang={other}
            prefetch={false}
            aria-label={m.controls.language}
            title={m.controls.language}
            onClick={() => {
              document.cookie = `${LOCALE_COOKIE}=${other}; path=/; max-age=31536000; samesite=lax`;
            }}
          >
            {m.controls.switchTo}
          </Link>
          <ThemeSelector />
          <button type="button" className={styles.menuBtn} aria-expanded={menu} aria-controls="mobile-nav" aria-label={m.a11y.menu} onClick={() => setMenu((v) => !v)}>
            <Icon name={menu ? 'close' : 'menu'} />
          </button>
        </div>
      </div>

      {menu && (
        <nav id="mobile-nav" className={styles.sheet} aria-label={m.a11y.primaryNav}>
          <ul>
            {items.map((it) => (
              <li key={it.key}>
                <Link href={it.href} className={styles.sheetLink} aria-current={it.current ? 'page' : undefined} onClick={() => setMenu(false)}>
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
