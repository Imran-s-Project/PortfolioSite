import Link from 'next/link';
import { LogoMark } from '@/components/brand/Logo';
import { Icon } from '@/components/shared/Icon';
import { SocialIcon } from '@/components/shared/SocialIcon';
import { FOOTER_DESC } from '@/data/site-data';
import { fmt, type Messages } from '@/i18n';
import { localizePath } from '@/i18n/locales';
import { currentYear } from '@/lib/utils/dates';
import type { Locale, SiteSettings } from '@/types';

const isWeb = (url: string): boolean => /^https?:/i.test(url);

/**
 * The footer, top to bottom in three steps:
 *   1. an invitation to get in touch;
 *   2. who the site belongs to (name, a line about it, social icons) beside where to go (pages), what to take (CV, privacy,
 *      sitemap) and how to reach the owner (email, availability);
 *   3. the small print (copyright, credit, back to top).
 * Server-rendered, no client JavaScript; every colour comes from the theme tokens, so it follows all five themes.
 */
export function SiteFooter({ locale, messages: m, settings }: { locale: Locale; messages: Messages; settings: SiteSettings }) {
  const home = localizePath(locale, '/');
  const [before, after] = m.footer.credit.split('♥');
  // the e-mail address has its own place in the "Get in touch" column, so it is not repeated among the icons
  const socials = settings.socials.filter((s) => s.icon !== 'mail');
  const availabilityNote = settings.availabilityNote[locale] || (settings.availability === 'available' ? m.hero.available : m.hero.busy);
  // a long address may break only before the "@", never in the middle of a word
  const [mailName, mailHost] = settings.email.split('@');

  return (
    <footer className="footer" data-scene="blue-hour">
      <div className="container">
        <div className="footer__panel">
          {/* 1 · invitation */}
          <div className="footer__cta">
            <div>
              <h2>{m.footer.ctaTitle}</h2>
              <p>{m.footer.ctaText}</p>
            </div>
            <Link className="btn btn--primary" href={`${home}#contact`}>
              <Icon name="mail" />
              {m.footer.ctaButton}
            </Link>
          </div>

          {/* 2 · who, where to go, what to take, how to reach me */}
          <div className="footer__grid">
            <div className="footer__brand">
              <Link href={home} className="footer__name" aria-label={m.meta.siteName}>
                <LogoMark size={40} />
                <span>{m.meta.siteName}</span>
              </Link>
              <p className="footer__about">{FOOTER_DESC[locale]}</p>
              {socials.length > 0 && (
                <div>
                  <h2 id="footer-follow">{m.footer.follow}</h2>
                  <ul className="footer__social" role="list" aria-labelledby="footer-follow">
                    {socials.map((s) => (
                      <li key={s.id}>
                        <a href={s.url} title={s.name} {...(isWeb(s.url) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                          <SocialIcon name={s.icon} size="1.2em" />
                          <span className="sr-only">
                            {s.name}
                            {isWeb(s.url) ? ` ${m.a11y.external}` : ''}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <nav className="footer__col" aria-labelledby="footer-explore">
              <h2 id="footer-explore">{m.footer.explore}</h2>
              <ul role="list">
                <li><Link href={home}>{m.nav.home}</Link></li>
                <li><Link href={localizePath(locale, '/projects')}>{m.nav.projects}</Link></li>
                <li><Link href={localizePath(locale, '/blog')}>{m.nav.blog}</Link></li>
                <li><Link href={localizePath(locale, '/about')}>{m.nav.about}</Link></li>
                <li><Link href={`${home}#contact`}>{m.nav.contact}</Link></li>
              </ul>
            </nav>

            <nav className="footer__col" aria-labelledby="footer-resources">
              <h2 id="footer-resources">{m.footer.resources}</h2>
              <ul role="list">
                <li>
                  <a href={settings.resumeUrl} download>
                    <Icon name="download" />
                    {m.footer.resume}
                  </a>
                </li>
                <li><Link href={localizePath(locale, '/privacy')}>{m.footer.privacy}</Link></li>
                <li><a href="/sitemap.xml">{m.footer.sitemap}</a></li>
              </ul>
            </nav>

            <div className="footer__col footer__contact">
              <h2>{m.footer.getInTouch}</h2>
              <a className="footer__mail" href={`mailto:${settings.email}`}>
                <Icon name="mail" />
                <span>{mailHost ? <>{mailName}<wbr />@{mailHost}</> : settings.email}</span>
              </a>
              {settings.availability !== 'hidden' && (
                <p className="footer__avail" data-state={settings.availability}>
                  <i aria-hidden="true" />
                  {availabilityNote}
                </p>
              )}
            </div>
          </div>

          {/* 3 · small print */}
          <div className="footer__bottom">
            <span>{fmt(m.footer.copyright, { year: currentYear() })}</span>
            <span>
              {before}
              <span className="heart" role="img" aria-label={m.footer.heart}>♥</span>
              {after}
            </span>
            <a href="#main" className="chip footer__top">
              <Icon name="up" />
              {m.footer.top}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
