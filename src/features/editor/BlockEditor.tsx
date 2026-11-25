'use client';
import { useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/shared/Icon';
import { useAdminLang } from '@/features/admin/lang';
import { MediaPicker } from '@/features/admin/MediaPicker';
import { createBlock, moveItem, newId } from '@/lib/utils/blocks';
import { resolveVideo } from '@/lib/utils/embed';
import { safeHref } from '@/lib/utils/inline';
import { BLOCK_TYPES, type Block, type BlockType, type CalloutTone, type MediaItem } from '@/types';
import { applyFormat, type Fmt } from './format';

const META: Record<BlockType, { icon: IconName; en: string; bn: string }> = {
  heading: { icon: 'edit', en: 'Heading', bn: 'শিরোনাম' },
  paragraph: { icon: 'file', en: 'Paragraph', bn: 'অনুচ্ছেদ' },
  image: { icon: 'image', en: 'Image', bn: 'ছবি' },
  gallery: { icon: 'image', en: 'Image gallery', bn: 'ছবির গ্যালারি' },
  video: { icon: 'play', en: 'Video embed', bn: 'ভিডিও' },
  code: { icon: 'edit', en: 'Code', bn: 'কোড' },
  quote: { icon: 'edit', en: 'Quote', bn: 'উদ্ধৃতি' },
  callout: { icon: 'shield', en: 'Callout', bn: 'কলআউট' },
  button: { icon: 'link', en: 'Button', bn: 'বাটন' },
  table: { icon: 'dashboard', en: 'Table', bn: 'টেবিল' },
  divider: { icon: 'plus', en: 'Divider', bn: 'বিভাজক' },
  list: { icon: 'file', en: 'List', bn: 'তালিকা' }
};

/** A textarea with a bold / italic / code / link toolbar. Formatting is stored as plain, strictly-parsed markup (never HTML). */
function RichText({ value, onChange, rows = 3, label }: { value: string; onChange: (v: string) => void; rows?: number; label: string }) {
  const { L } = useAdminLang();
  const ref = useRef<HTMLTextAreaElement>(null);
  const apply = (kind: Fmt) => {
    const el = ref.current;
    if (!el) return;
    let url: string | undefined;
    if (kind === 'link') {
      const asked = window.prompt(L('Link address (https://…, mailto:…, or /page)', 'লিংকের ঠিকানা (https://…, mailto:…, বা /page)'), 'https://');
      if (!asked) return;
      if (!safeHref(asked)) {
        window.alert(L('That address is not allowed. Use https://, mailto:, tel: or a /path.', 'এই ঠিকানা চলবে না। https://, mailto:, tel: বা /path ব্যবহার করুন।'));
        return;
      }
      url = asked.trim();
    }
    const r = applyFormat(value, el.selectionStart, el.selectionEnd, kind, url);
    onChange(r.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  };
  return (
    <div className="stack" style={{ gap: '0.4rem' }}>
      <div className="fmtbar" role="toolbar" aria-label={L('Text formatting', 'টেক্সট ফরম্যাট')}>
        <button type="button" className="btn btn--sm" onClick={() => apply('bold')} aria-label={L('Bold', 'বোল্ড')}><b>B</b></button>
        <button type="button" className="btn btn--sm" onClick={() => apply('italic')} aria-label={L('Italic', 'ইটালিক')}><i>I</i></button>
        <button type="button" className="btn btn--sm" onClick={() => apply('code')} aria-label={L('Code', 'কোড')}>{'</>'}</button>
        <button type="button" className="btn btn--sm" onClick={() => apply('link')} aria-label={L('Link', 'লিংক')}><Icon name="link" /></button>
      </div>
      <textarea ref={ref} className="textarea" aria-label={label} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span className="label">{label}</span>{children}</label>;
}

function BlockForm({ block, onChange, pick }: { block: Block; onChange: (b: Block) => void; pick: (cb: (m: MediaItem) => void) => void }) {
  const { L } = useAdminLang();
  switch (block.type) {
    case 'heading':
      return (
        <div className="stack">
          <Labeled label={L('Level', 'স্তর')}>
            <select className="select" value={block.level} onChange={(e) => onChange({ ...block, level: Number(e.target.value) as 2 | 3 | 4 })} style={{ maxWidth: '12rem' }}>
              <option value={2}>H2 — {L('Section', 'বিভাগ')}</option><option value={3}>H3 — {L('Sub-section', 'উপ-বিভাগ')}</option><option value={4}>H4</option>
            </select>
          </Labeled>
          <Labeled label={L('Heading text', 'শিরোনামের লেখা')}><input className="input" maxLength={400} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} /></Labeled>
        </div>
      );
    case 'paragraph':
      return <RichText label={L('Paragraph', 'অনুচ্ছেদ')} value={block.text} rows={4} onChange={(text) => onChange({ ...block, text })} />;
    case 'image':
      return (
        <div className="stack">
          <div className="row">
            {block.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={block.url} alt={block.alt} style={{ maxHeight: '8rem', borderRadius: 'var(--radius-s)' }} />
            ) : <span className="muted">{L('No image chosen', 'কোনো ছবি বাছা হয়নি')}</span>}
            <button type="button" className="btn btn--sm" onClick={() => pick((m) => onChange({ ...block, url: m.url, storagePath: m.path, width: m.width, height: m.height, alt: block.alt || m.alt.en || m.alt.bn || '' }))}>{block.url ? L('Replace image', 'ছবি বদলান') : L('Choose image', 'ছবি বাছুন')}</button>
          </div>
          <Labeled label={L('Alt text (describes the image for screen readers)', 'অল্ট টেক্সট (স্ক্রিন রিডারের জন্য ছবির বিবরণ)')}><input className="input" maxLength={300} value={block.alt} onChange={(e) => onChange({ ...block, alt: e.target.value })} aria-required="true" /></Labeled>
          {block.url && !block.alt.trim() && <p className="field__error">{L('Add alt text, or the image is invisible to screen-reader users.', 'অল্ট টেক্সট দিন, নইলে স্ক্রিন-রিডার ব্যবহারকারী ছবিটি পাবেন না।')}</p>}
          <Labeled label={L('Caption (optional)', 'ক্যাপশন (ঐচ্ছিক)')}><input className="input" maxLength={500} value={block.caption ?? ''} onChange={(e) => onChange({ ...block, caption: e.target.value })} /></Labeled>
        </div>
      );
    case 'gallery':
      return (
        <div className="stack">
          <ul className="media-grid">
            {block.images.map((img, i) => (
              <li key={`${img.url}-${i}`} className="media-item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt} />
                <input className="input" aria-label={L('Alt text', 'অল্ট টেক্সট')} placeholder={L('Alt text', 'অল্ট টেক্সট')} value={img.alt} onChange={(e) => onChange({ ...block, images: block.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) })} />
                <button type="button" className="btn btn--sm btn--danger" onClick={() => onChange({ ...block, images: block.images.filter((_, j) => j !== i) })}><Icon name="trash" />{L('Remove', 'সরান')}</button>
              </li>
            ))}
          </ul>
          <div><button type="button" className="btn btn--sm" onClick={() => pick((m) => onChange({ ...block, images: [...block.images, { url: m.url, alt: m.alt.en || m.alt.bn || '', storagePath: m.path, width: m.width, height: m.height }].slice(0, 40) }))}><Icon name="plus" />{L('Add image', 'ছবি যোগ করুন')}</button></div>
        </div>
      );
    case 'video': {
      const v = block.url.trim() ? resolveVideo(block.url) : null;
      return (
        <div className="stack">
          <Labeled label={L('Video address (YouTube, Vimeo, or a direct .mp4 / .webm https link)', 'ভিডিওর ঠিকানা (ইউটিউব, ভিমিও, বা সরাসরি .mp4 / .webm https লিংক)')}><input className="input" inputMode="url" value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} /></Labeled>
          {block.url.trim() && <p className={v ? 'field__hint' : 'field__error'}>{v ? (v.kind === 'embed' ? `✓ ${v.provider === 'youtube' ? 'YouTube' : 'Vimeo'}` : '✓ video file') : L('Not a supported video address — it will not be shown.', 'সমর্থিত ভিডিও ঠিকানা নয় — এটি দেখানো হবে না।')}</p>}
          <Labeled label={L('Title (for accessibility)', 'শিরোনাম (অ্যাক্সেসিবিলিটির জন্য)')}><input className="input" maxLength={200} value={block.title ?? ''} onChange={(e) => onChange({ ...block, title: e.target.value })} /></Labeled>
        </div>
      );
    }
    case 'code':
      return (
        <div className="stack">
          <div className="adm-two">
            <Labeled label={L('Language', 'ভাষা')}><input className="input" maxLength={30} value={block.language} onChange={(e) => onChange({ ...block, language: e.target.value })} /></Labeled>
            <Labeled label={L('File name (optional)', 'ফাইলের নাম (ঐচ্ছিক)')}><input className="input" maxLength={120} value={block.filename ?? ''} onChange={(e) => onChange({ ...block, filename: e.target.value })} /></Labeled>
          </div>
          <Labeled label={L('Code', 'কোড')}><textarea className="textarea codearea" rows={8} spellCheck={false} value={block.code} onChange={(e) => onChange({ ...block, code: e.target.value })} /></Labeled>
        </div>
      );
    case 'quote':
      return (
        <div className="stack">
          <RichText label={L('Quote', 'উদ্ধৃতি')} value={block.text} rows={3} onChange={(text) => onChange({ ...block, text })} />
          <Labeled label={L('Source (optional)', 'সূত্র (ঐচ্ছিক)')}><input className="input" maxLength={200} value={block.cite ?? ''} onChange={(e) => onChange({ ...block, cite: e.target.value })} /></Labeled>
        </div>
      );
    case 'callout':
      return (
        <div className="stack">
          <div className="adm-two">
            <Labeled label={L('Type', 'ধরন')}>
              <select className="select" value={block.tone} onChange={(e) => onChange({ ...block, tone: e.target.value as CalloutTone })}>
                <option value="info">{L('Info', 'তথ্য')}</option><option value="success">{L('Success', 'সফল')}</option><option value="warning">{L('Warning', 'সতর্কতা')}</option><option value="danger">{L('Danger', 'বিপদ')}</option>
              </select>
            </Labeled>
            <Labeled label={L('Title (optional)', 'শিরোনাম (ঐচ্ছিক)')}><input className="input" maxLength={200} value={block.title ?? ''} onChange={(e) => onChange({ ...block, title: e.target.value })} /></Labeled>
          </div>
          <RichText label={L('Text', 'লেখা')} value={block.text} rows={3} onChange={(text) => onChange({ ...block, text })} />
        </div>
      );
    case 'button':
      return (
        <div className="stack">
          <div className="adm-two">
            <Labeled label={L('Label', 'লেবেল')}><input className="input" maxLength={80} value={block.label} onChange={(e) => onChange({ ...block, label: e.target.value })} /></Labeled>
            <Labeled label={L('Style', 'স্টাইল')}>
              <select className="select" value={block.variant} onChange={(e) => onChange({ ...block, variant: e.target.value as 'primary' | 'ghost' })}><option value="primary">{L('Solid', 'সলিড')}</option><option value="ghost">{L('Outline', 'আউটলাইন')}</option></select>
            </Labeled>
          </div>
          <Labeled label={L('Link address', 'লিংকের ঠিকানা')}><input className="input" inputMode="url" value={block.href} onChange={(e) => onChange({ ...block, href: e.target.value })} /></Labeled>
          {block.href.trim() && !safeHref(block.href) && <p className="field__error">{L('Not allowed — use https://, mailto:, tel: or a /path.', 'চলবে না — https://, mailto:, tel: বা /path ব্যবহার করুন।')}</p>}
        </div>
      );
    case 'table': {
      const cols = Math.max(block.headers.length, 1);
      const setHeader = (i: number, v: string) => onChange({ ...block, headers: block.headers.map((h, j) => (j === i ? v : h)) });
      const setCell = (r: number, c: number, v: string) => onChange({ ...block, rows: block.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
      return (
        <div className="stack">
          <div className="tbl-edit">
            <table>
              <thead><tr>{block.headers.map((h, i) => <th key={i}><input className="input" aria-label={`${L('Header', 'হেডার')} ${i + 1}`} value={h} onChange={(e) => setHeader(i, e.target.value)} /></th>)}</tr></thead>
              <tbody>{block.rows.map((row, r) => <tr key={r}>{Array.from({ length: cols }, (_, c) => <td key={c}><input className="input" aria-label={`${L('Row', 'সারি')} ${r + 1}, ${L('column', 'কলাম')} ${c + 1}`} value={row[c] ?? ''} onChange={(e) => setCell(r, c, e.target.value)} /></td>)}</tr>)}</tbody>
            </table>
          </div>
          <div className="row">
            <button type="button" className="btn btn--sm" disabled={block.rows.length >= 200} onClick={() => onChange({ ...block, rows: [...block.rows, Array(cols).fill('')] })}><Icon name="plus" />{L('Row', 'সারি')}</button>
            <button type="button" className="btn btn--sm" disabled={block.headers.length >= 12} onClick={() => onChange({ ...block, headers: [...block.headers, ''], rows: block.rows.map((r) => [...r, '']) })}><Icon name="plus" />{L('Column', 'কলাম')}</button>
            <button type="button" className="btn btn--sm btn--ghost" disabled={block.rows.length <= 1} onClick={() => onChange({ ...block, rows: block.rows.slice(0, -1) })}>{L('Remove row', 'সারি সরান')}</button>
            <button type="button" className="btn btn--sm btn--ghost" disabled={block.headers.length <= 1} onClick={() => onChange({ ...block, headers: block.headers.slice(0, -1), rows: block.rows.map((r) => r.slice(0, block.headers.length - 1)) })}>{L('Remove column', 'কলাম সরান')}</button>
          </div>
        </div>
      );
    }
    case 'divider':
      return <hr style={{ border: 0, borderTop: '1px solid var(--border-strong)' }} />;
    case 'list':
      return (
        <div className="stack">
          <label className="check"><input type="checkbox" checked={block.ordered} onChange={(e) => onChange({ ...block, ordered: e.target.checked })} />{L('Numbered list', 'নম্বর দেওয়া তালিকা')}</label>
          <Labeled label={L('Items — one per line', 'আইটেম — প্রতি লাইনে একটি')}><textarea className="textarea" rows={5} value={block.items.join('\n')} onChange={(e) => onChange({ ...block, items: e.target.value.split('\n').slice(0, 200) })} /></Labeled>
        </div>
      );
  }
}

function InsertMenu({ onInsert, label }: { onInsert: (t: BlockType) => void; label: string }) {
  const { L } = useAdminLang();
  const [open, setOpen] = useState(false);
  return (
    <div className="insert" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <button type="button" className="btn btn--sm btn--ghost" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}><Icon name="plus" />{label}</button>
      {open && (
        <div className="insert__menu" role="menu">
          {BLOCK_TYPES.map((t) => (
            <button key={t} type="button" role="menuitem" onClick={() => { onInsert(t); setOpen(false); }}><Icon name={META[t].icon} />{L(META[t].en, META[t].bn)}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Block-based writing surface. Blocks are structured objects (never HTML). Reorder by drag & drop or with the move buttons
 * (keyboard / touch friendly), insert anywhere, duplicate and delete, with inline formatting in every text block.
 */
export function BlockEditor({ blocks, onChange }: { blocks: Block[]; onChange: (b: Block[]) => void }) {
  const { L } = useAdminLang();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [picker, setPicker] = useState<((m: MediaItem) => void) | null>(null);

  const insertAt = (i: number, t: BlockType) => onChange([...blocks.slice(0, i), createBlock(t), ...blocks.slice(i)]);
  const update = (i: number, b: Block) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const remove = (i: number) => onChange(blocks.filter((_, j) => j !== i));
  const duplicate = (i: number) => {
    const b = blocks[i];
    if (b) onChange([...blocks.slice(0, i + 1), { ...structuredClone(b), id: newId() }, ...blocks.slice(i + 1)]);
  };
  const move = (from: number, to: number) => onChange(moveItem(blocks, from, to));

  return (
    <div className="stack">
      {blocks.length === 0 && <p className="alert">{L('This article has no content in this language yet. Add the first block.', 'এই ভাষায় লেখাটির কোনো কনটেন্ট এখনো নেই। প্রথম ব্লক যোগ করুন।')}</p>}
      <ul className="blocks">
        {blocks.map((b, i) => (
          <li key={b.id}>
            <InsertMenu onInsert={(t) => insertAt(i, t)} label={L('Insert block here', 'এখানে ব্লক যোগ করুন')} />
            <div
              className="block"
              data-dragging={dragIndex === i}
              data-over={overIndex === i && dragIndex !== null && dragIndex !== i}
              onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); setOverIndex(i); } }}
              onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) move(dragIndex, i); setDragIndex(null); setOverIndex(null); }}
            >
              <div className="block__head">
                <span className="block__grip" draggable aria-hidden="true" title={L('Drag to reorder', 'টেনে সাজান')} onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }} onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}><Icon name="grip" /></span>
                <span className="block__type">{i + 1}. {L(META[b.type].en, META[b.type].bn)}</span>
                <button type="button" className="btn btn--icon btn--sm btn--ghost" disabled={i === 0} aria-label={L('Move up', 'উপরে সরান')} onClick={() => move(i, i - 1)}><Icon name="up" /></button>
                <button type="button" className="btn btn--icon btn--sm btn--ghost" disabled={i === blocks.length - 1} aria-label={L('Move down', 'নিচে সরান')} onClick={() => move(i, i + 1)}><Icon name="chevron" /></button>
                <button type="button" className="btn btn--icon btn--sm btn--ghost" aria-label={L('Duplicate', 'কপি করুন')} onClick={() => duplicate(i)}><Icon name="copy" /></button>
                <button type="button" className="btn btn--icon btn--sm btn--danger" aria-label={L('Delete block', 'ব্লক মুছুন')} onClick={() => remove(i)}><Icon name="trash" /></button>
              </div>
              <BlockForm block={b} onChange={(nb) => update(i, nb)} pick={(cb) => setPicker(() => cb)} />
            </div>
          </li>
        ))}
      </ul>
      <InsertMenu onInsert={(t) => insertAt(blocks.length, t)} label={L('Add block', 'ব্লক যোগ করুন')} />
      {picker && <MediaPicker onPick={(m) => picker(m)} onClose={() => setPicker(null)} />}
    </div>
  );
}
