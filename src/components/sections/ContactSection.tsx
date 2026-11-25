import { ContactForm } from '@/components/contact/ContactForm';
import { Icon } from '@/components/shared/Icon';
import { SocialIcon } from '@/components/shared/SocialIcon';
import { COPY } from '@/data/site-data';
import type { Messages } from '@/i18n';
import type { Locale, SiteSettings } from '@/types';

export function ContactSection({ locale, messages: m, settings }: { locale: Locale; messages: Messages; settings: SiteSettings }) {
  const c = COPY.contactSection;
  // the e-mail address has its own button above, so it is not repeated among the profiles
  const socials = settings.socials.filter((s) => s.icon !== 'mail');
  return (
    <section className="section" id="contact" data-scene="lake" aria-labelledby="contact-title">
      <div className="container">
        <div className="section__head" data-reveal>
          <p className="section__eyebrow">{c.eyebrow[locale]}</p>
          <h2 id="contact-title" className="section__title">{c.heading[locale]}</h2>
        </div>
        <div className="contact__grid">
          <div className="panel contact__primary" data-reveal>
            <p>{c.primaryBlurb[locale]}</p>
            <a className="contact__email" href={`mailto:${settings.email}`}>{settings.email}</a>
            <div className="row">
              <a className="btn btn--primary" href={`mailto:${settings.email}`}><Icon name="mail" />{c.primaryCta[locale]}</a>
              <a className="btn btn--ghost" href={settings.resumeUrl} download><Icon name="download" />{c.resumeCta[locale]}</a>
            </div>
            {socials.length > 0 && (
              <ul className="contact__social">
                {socials.map((s) => {
                  const web = /^https?:/i.test(s.url); // a phone number or e-mail link does not open a new tab
                  return (
                    <li key={s.id}>
                      <a href={s.url} {...(web ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                        <SocialIcon name={s.icon} />
                        <span>{s.name}</span>
                        <small>{s.handle}</small>
                        {web && <span className="sr-only">{m.a11y.external}</span>}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="panel" data-reveal><ContactForm /></div>
        </div>
      </div>
    </section>
  );
}
