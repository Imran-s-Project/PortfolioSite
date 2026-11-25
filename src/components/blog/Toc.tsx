import type { TocItem } from '@/lib/utils/blocks';

export function Toc({ items, title }: { items: TocItem[]; title: string }) {
  if (items.length < 2) return null;
  return (
    <nav className="toc" aria-label={title}>
      <h2>{title}</h2>
      <ol>
        {items.map((it) => (
          <li key={it.id} data-level={it.level}><a href={`#${it.id}`}>{it.text}</a></li>
        ))}
      </ol>
    </nav>
  );
}
