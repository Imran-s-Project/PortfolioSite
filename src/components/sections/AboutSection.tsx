import { Inline } from '@/components/shared/Inline';
import { COPY, SKILL_GROUPS } from '@/data/site-data';
import type { Messages } from '@/i18n';
import type { Locale } from '@/types';

export function AboutSection({ locale, messages: m, id = 'about', headingLevel = 2 }: { locale: Locale; messages: Messages; id?: string; headingLevel?: 1 | 2 }) {
  const a = COPY.about;
  const H = `h${headingLevel}` as 'h1' | 'h2';
  return (
    <>
      <section className="section" id={id} data-scene="forest" aria-labelledby={`${id}-title`}>
        <div className="container">
          <div className="section__head" data-reveal>
            <p className="section__eyebrow">{a.eyebrow[locale]}</p>
            <H id={`${id}-title`} className="section__title">{a.heading[locale]}</H>
          </div>
          <div className="about__grid">
            <div className="panel about__copy" data-reveal>
              {a.paragraphs.map((p, i) => <p key={i}><Inline text={p[locale]} /></p>)}
            </div>
            <div className="panel skills" data-reveal aria-label={m.about.skills}>
              {SKILL_GROUPS.map((g) => (
                <div key={g.name.en}>
                  <h3>{g.name[locale]}</h3>
                  <ul>{g.items.map((i) => <li key={i}>{a.skills[i]}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
