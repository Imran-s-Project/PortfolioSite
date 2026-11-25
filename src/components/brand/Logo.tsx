import { cx } from '@/lib/utils/cx';

/**
 * The mark: an eight-pointed star (two squares, one turned 45° — the symbol of the original identity) holding an "IA" monogram.
 * Strokes use theme tokens, so it re-colours with every theme. `draw` plays the stroke-reveal used by the intro loader.
 */
export function LogoMark({ size = 36, draw = false, className }: { size?: number; draw?: boolean; className?: string }) {
  return (
    <svg className={cx('logo', draw && 'logo--draw', className)} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g fill="none" strokeLinejoin="round" strokeLinecap="round">
        <path className="logo__star" d="M15 15H49V49H15Z" pathLength={1} />
        <path className="logo__star logo__star--2" d="M32 7.96L56.04 32L32 56.04L7.96 32Z" pathLength={1} />
        <path className="logo__mono logo__i" d="M22.25 23V41" pathLength={1} />
        <path className="logo__mono logo__a" d="M28.75 41L35.25 23L41.75 41" pathLength={1} />
        <path className="logo__mono logo__bar" d="M30.8 35.5H39.7" pathLength={1} />
      </g>
    </svg>
  );
}
