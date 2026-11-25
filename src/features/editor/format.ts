export type Fmt = 'bold' | 'italic' | 'code' | 'link';
export interface Edit { value: string; start: number; end: number }

const MARK: Record<Exclude<Fmt, 'link'>, [string, string]> = { bold: ['**', '**'], italic: ['*', '*'], code: ['`', '`'] };

/**
 * Applies inline formatting to the selected range of a text block and returns the new text + selection.
 * Toggles when the selection is already wrapped. Empty selection inserts a placeholder that ends up selected.
 */
export function applyFormat(value: string, start: number, end: number, kind: Fmt, url = 'https://'): Edit {
  const a = Math.max(0, Math.min(start, end));
  const b = Math.min(value.length, Math.max(start, end));
  const picked = value.slice(a, b);

  if (kind === 'link') {
    const label = picked || 'link text';
    const out = `${value.slice(0, a)}[${label}](${url})${value.slice(b)}`;
    return { value: out, start: a + 1, end: a + 1 + label.length };
  }
  const [open, close] = MARK[kind];
  const before = value.slice(a - open.length, a);
  const after = value.slice(b, b + close.length);
  const doubleNeighbour = kind === 'italic' && (value.charAt(a - 2) === '*' || value.charAt(b + 1) === '*');
  if (before === open && after === close && !doubleNeighbour) {
    return { value: value.slice(0, a - open.length) + picked + value.slice(b + close.length), start: a - open.length, end: b - open.length };
  }
  const label = picked || 'text';
  return { value: `${value.slice(0, a)}${open}${label}${close}${value.slice(b)}`, start: a + open.length, end: a + open.length + label.length };
}
