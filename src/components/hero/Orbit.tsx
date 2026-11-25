/** Decorative: the logo's eight-pointed star drawn large, its two squares turning slowly in opposite directions. */
export function Orbit() {
  return (
    <div className="orbit" aria-hidden="true">
      <svg viewBox="0 0 100 100" focusable="false">
        <circle cx="50" cy="50" r="49" opacity="0.5" />
        <g className="orbit__a"><path d="M16 16H84V84H16Z" /></g>
        <g className="orbit__b"><path d="M16 16H84V84H16Z" transform="rotate(45 50 50)" /></g>
        <circle cx="50" cy="50" r="23" opacity="0.7" />
      </svg>
    </div>
  );
}
