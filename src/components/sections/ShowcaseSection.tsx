import { COPY } from '@/data/site-data';
import { resolveVideo } from '@/lib/utils/embed';
import type { Locale } from '@/types';

/** The optional "A closer look" video. Shown only when a valid YouTube / Vimeo / .mp4 / .webm address is set in Admin → Settings. */
export function ShowcaseSection({ locale, url }: { locale: Locale; url: string }) {
  const v = resolveVideo(url);
  if (!v) return null;
  const s = COPY.showcase;
  return (
    <section className="section" id="showcase" aria-labelledby="showcase-title">
      <div className="container">
        <div className="section__head" data-reveal>
          <p className="section__eyebrow">{s.eyebrow[locale]}</p>
          <h2 id="showcase-title" className="section__title">{s.heading[locale]}</h2>
          <p className="section__intro">{s.intro[locale]}</p>
        </div>
        <div className="showcase__frame" data-reveal>
          {v.kind === 'embed' ? (
            <iframe src={v.src} title={s.heading[locale]} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" allow="encrypted-media; picture-in-picture" />
          ) : (
            <video src={v.src} controls preload="metadata" playsInline aria-label={s.heading[locale]} />
          )}
        </div>
      </div>
    </section>
  );
}
