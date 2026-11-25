import { SmartImage } from '@/components/shared/SmartImage';
import type { CSSProperties } from 'react';
import type { Locale, Project } from '@/types';

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * Custom project thumbnail. No screenshots are invented: until the owner uploads one (Admin → Projects) every project gets a
 * generated tile — the logo's star pattern, the project's own mark and its web address — coloured by the active theme.
 */
export function ProjectThumb({ project, index, locale, sizes = '(min-width: 62rem) 24rem, 90vw' }: { project: Project; index: number; locale: Locale; sizes?: string }) {
  const style = { '--i': index % 10 } as CSSProperties;
  if (project.thumbnail) {
    return (
      <div className="thumb" style={style}>
        <SmartImage src={project.thumbnail.url} alt={project.thumbnail.alt[locale] || project.thumbnail.alt.en || ''} fill sizes={sizes} />
      </div>
    );
  }
  return (
    <div className="thumb" style={style} aria-hidden="true">
      <span className="thumb__mark">{project.mark}</span>
      <span className="thumb__host">{hostOf(project.url)}</span>
    </div>
  );
}
