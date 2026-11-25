/**
 * Tiny, strict inline markup used inside text blocks:  **bold**  *italic*  `code`  [label](https://url)
 * The output is a node tree that React renders as elements — there is NO html pass-through anywhere,
 * so stored content can never inject markup or script.
 */
export type InlineNode =
  | { k: 'text'; v: string }
  | { k: 'code'; v: string }
  | { k: 'strong' | 'em'; c: InlineNode[] }
  | { k: 'link'; href: string; c: InlineNode[] };

/** Only http(s), mailto, tel, same-site paths and in-page anchors are allowed. Everything else (javascript:, data:, …) is rejected. */
export function safeHref(raw: string): string | null {
  const v = raw.trim();
  if (!v || v.length > 2000 || /[\u0000-\u001f\u007f\s]/.test(v)) return null;
  if (/^(https?:|mailto:|tel:)/i.test(v)) {
    try {
      new URL(v);
      return v;
    } catch {
      return null;
    }
  }
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  if (v.startsWith('#') && v.length > 1) return v;
  return null;
}

const MAX_DEPTH = 3;

export function parseInline(src: string, depth = 0): InlineNode[] {
  const out: InlineNode[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ k: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    const ch = src.charAt(i);
    if (ch === '\\' && i + 1 < src.length) {
      buf += src.charAt(i + 1);
      i += 2;
      continue;
    }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ k: 'code', v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '[' && depth < MAX_DEPTH) {
      const close = src.indexOf(']', i + 1);
      if (close > i + 1 && src.charAt(close + 1) === '(') {
        const endParen = src.indexOf(')', close + 2);
        if (endParen > close + 1) {
          const href = safeHref(src.slice(close + 2, endParen));
          if (href) {
            flush();
            out.push({ k: 'link', href, c: parseInline(src.slice(i + 1, close), depth + 1) });
            i = endParen + 1;
            continue;
          }
        }
      }
    }
    if (src.startsWith('***', i) && depth < MAX_DEPTH) {
      const end = src.indexOf('***', i + 3);
      if (end > i + 3) {
        flush();
        out.push({ k: 'strong', c: [{ k: 'em', c: parseInline(src.slice(i + 3, end), depth + 1) }] });
        i = end + 3;
        continue;
      }
    }
    if (ch === '*' && src.charAt(i + 1) === '*' && depth < MAX_DEPTH) {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ k: 'strong', c: parseInline(src.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }
    if (ch === '*' && src.charAt(i + 1) !== '*' && depth < MAX_DEPTH) {
      let end = src.indexOf('*', i + 1);
      while (end !== -1 && src.charAt(end + 1) === '*') end = src.indexOf('*', end + 2);
      if (end > i + 1) {
        flush();
        out.push({ k: 'em', c: parseInline(src.slice(i + 1, end), depth + 1) });
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

export function toPlainText(nodes: InlineNode[]): string {
  return nodes.map((n) => (n.k === 'text' || n.k === 'code' ? n.v : toPlainText(n.c))).join('');
}
/** Plain text of a marked-up string (used for search, excerpts and reading time). */
export const stripInline = (src: string): string => toPlainText(parseInline(src));
