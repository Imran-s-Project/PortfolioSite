import { Fragment, type ReactNode } from 'react';
import { parseInline, type InlineNode } from '@/lib/utils/inline';

function render(nodes: InlineNode[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.k) {
      case 'text': return <Fragment key={i}>{n.v}</Fragment>;
      case 'code': return <code key={i}>{n.v}</code>;
      case 'strong': return <strong key={i}>{render(n.c)}</strong>;
      case 'em': return <em key={i}>{render(n.c)}</em>;
      case 'link': {
        const external = /^https?:/i.test(n.href);
        return <a key={i} href={n.href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{render(n.c)}</a>;
      }
    }
  });
}

/** Renders **bold**, *italic*, `code` and [links](https://…) from stored text — as React elements, never as raw HTML. */
export function Inline({ text }: { text: string }) {
  return <>{render(parseInline(text))}</>;
}

/** Plain paragraphs separated by blank lines (used for project descriptions). */
export function Paragraphs({ text }: { text: string }) {
  return <>{text.split(/\n{2,}/).map((p, i) => (p.trim() ? <p key={i}><Inline text={p.trim()} /></p> : null))}</>;
}
