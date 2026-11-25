import { ICON_PATHS } from '@/data/site-data';

/** Brand glyphs (filled) from the legacy icon set; unknown names render nothing. */
export function SocialIcon({ name, size = '1.25em' }: { name: string; size?: string }) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
