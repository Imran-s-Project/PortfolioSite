import type { CSSProperties } from 'react';
import Link from 'next/link';
import { COPY } from '@/data/site-data';
import { localizePath } from '@/i18n/locales';
import type { Messages } from '@/i18n';
import type { Locale, SiteSettings } from '@/types';
import { SocialLinks } from '@/components/shared/SocialLinks';
import { Icon } from '@/components/shared/Icon';
import { Orbit } from './Orbit';
import { RoleCycler } from './RoleCycler';

const enter = (i: number) => ({ '--i': i }) as CSSProperties;

export function Hero({ locale, messages: m, settings }: { locale: Locale; messages: Messages; settings: SiteSettings }) {
  const h = COPY.hero;
  const note = settings.availabilityNote[locale] || (settings.availability === 'available' ? m.hero.available : m.hero.busy);
  return (
    <section className="hero" data-scene="hero" aria-labelledby="hero-title">
      <Orbit />
      <div className="container hero__grid">
        <div className="hero__copy">
          <p className="hero__eyebrow" data-enter style={enter(0)}>{h.eyebrow[locale]}</p>
          <h1 id="hero-title" className="hero__name" data-enter style={enter(1)}>{h.name[locale]}</h1>
          <div data-enter style={enter(2)}><RoleCycler roles={m.hero.roles} label={m.hero.roleLabel} /></div>
          <p className="hero__lead" data-enter style={enter(3)}>{h.tagline[locale]}</p>
          <div className="hero__cta" data-enter style={enter(4)}>
            <Link className="btn btn--primary" href={localizePath(locale, '/projects')}>{h.ctaPrimary[locale]}</Link>
            <a className="btn btn--ghost" href="#contact">{h.ctaGhost[locale]}</a>
          </div>
          {settings.socials.length > 0 && (
            <div data-enter style={enter(5)}>
              <nav aria-label={m.hero.social}><SocialLinks links={settings.socials} externalLabel={m.a11y.external} /></nav>
            </div>
          )}
          {settings.availability !== 'hidden' && (
            <p className="hero__avail" data-state={settings.availability} data-enter style={enter(6)}><i aria-hidden="true" />{note}</p>
          )}
        </div>
      </div>
      <a className="hero__scroll" href="#projects" aria-label={h.scrollHint[locale]}>
        <span aria-hidden="true" />
        <small>{h.scrollHint[locale]}</small>
        <Icon name="arrow-down" size="1em" />
      </a>
    </section>
  );
}
