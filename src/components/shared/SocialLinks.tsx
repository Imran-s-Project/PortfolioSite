import { SocialIcon } from './SocialIcon';
import type { SocialLink } from '@/types';

/** Icon-only social links (each has an accessible name). */
export function SocialLinks({ links, externalLabel }: { links: SocialLink[]; externalLabel: string }) {
  return (
    <ul className="hero__social">
      {links.map((s) => {
        const external = /^https?:/i.test(s.url);
        return (
          <li key={s.id}>
            <a className="social-link" href={s.url} aria-label={`${s.name}${external ? ` ${externalLabel}` : ''}`} title={s.name} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              <SocialIcon name={s.icon} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
