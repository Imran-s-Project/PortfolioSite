import { Inline } from '@/components/shared/Inline';
import { SmartImage } from '@/components/shared/SmartImage';
import { headingAnchor } from '@/lib/utils/blocks';
import { resolveVideo } from '@/lib/utils/embed';
import { safeHref } from '@/lib/utils/inline';
import type { Block } from '@/types';

const SIZES = '(min-width: 62rem) 46rem, 100vw';

function Picture({ url, alt, width, height }: { url: string; alt: string; width?: number; height?: number }) {
  if (width && height) return <SmartImage src={url} alt={alt} width={width} height={height} sizes={SIZES} />;
  return (
    <div className="imgbox">
      <SmartImage src={url} alt={alt} fill sizes={SIZES} />
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading': {
      const Tag = (`h${block.level}`) as 'h2' | 'h3' | 'h4';
      return <Tag id={headingAnchor(block.id)}><Inline text={block.text} /></Tag>;
    }
    case 'paragraph':
      return <p><Inline text={block.text} /></p>;
    case 'image':
      return block.url ? (
        <figure>
          <Picture url={block.url} alt={block.alt} width={block.width} height={block.height} />
          {block.caption && <figcaption><Inline text={block.caption} /></figcaption>}
        </figure>
      ) : null;
    case 'gallery':
      return block.images.length ? (
        <div className="gallery">
          {block.images.map((img, i) => (
            <SmartImage key={`${img.url}-${i}`} src={img.url} alt={img.alt} width={img.width ?? 640} height={img.height ?? 480} sizes="(min-width: 62rem) 15rem, 45vw" />
          ))}
        </div>
      ) : null;
    case 'video': {
      const v = resolveVideo(block.url);
      if (!v) return null;
      return v.kind === 'embed' ? (
        <div className="embed">
          <iframe src={v.src} title={block.title || 'Video'} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" />
        </div>
      ) : (
        <div className="embed"><video src={v.src} controls preload="metadata" playsInline aria-label={block.title || 'Video'} /></div>
      );
    }
    case 'code':
      return (
        <div className="codeblock">
          <header><span>{block.filename || block.language}</span><span>{block.filename ? block.language : ''}</span></header>
          <pre tabIndex={0}><code>{block.code}</code></pre>
        </div>
      );
    case 'quote':
      return (
        <blockquote>
          <p><Inline text={block.text} /></p>
          {block.cite && <cite>{block.cite}</cite>}
        </blockquote>
      );
    case 'callout':
      return (
        <aside className="callout" data-tone={block.tone} role="note">
          {block.title && <strong>{block.title}</strong>}
          <div><Inline text={block.text} /></div>
        </aside>
      );
    case 'button': {
      const href = safeHref(block.href);
      if (!href || !block.label) return null;
      const external = /^https?:/i.test(href);
      return (
        <p>
          <a className={`btn btn--${block.variant}`} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{block.label}</a>
        </p>
      );
    }
    case 'table':
      return (
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            {block.headers.some(Boolean) && <thead><tr>{block.headers.map((h, i) => <th key={i} scope="col"><Inline text={h} /></th>)}</tr></thead>}
            <tbody>{block.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><Inline text={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case 'divider':
      return <hr />;
    case 'list': {
      const items = block.items.filter((t) => t.trim()).map((t, i) => <li key={i}><Inline text={t} /></li>);
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
  }
}

/** Renders stored blocks. Every block type is mapped explicitly to React elements — there is no raw-HTML path. */
export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <div className="prose">
      {blocks.map((b) => <BlockView key={b.id} block={b} />)}
    </div>
  );
}
