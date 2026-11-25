import type { Block, BlockType } from '@/types';
import { stripInline } from './inline';

export const newId = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`).replace(/-/g, '').slice(0, 16);

export function createBlock(type: BlockType): Block {
  const id = newId();
  switch (type) {
    case 'heading': return { id, type, level: 2, text: '' };
    case 'paragraph': return { id, type, text: '' };
    case 'image': return { id, type, url: '', alt: '' };
    case 'gallery': return { id, type, images: [] };
    case 'video': return { id, type, url: '' };
    case 'code': return { id, type, language: 'javascript', code: '' };
    case 'quote': return { id, type, text: '' };
    case 'callout': return { id, type, tone: 'info', text: '' };
    case 'button': return { id, type, label: '', href: '', variant: 'primary' };
    case 'table': return { id, type, headers: ['', ''], rows: [['', '']] };
    case 'divider': return { id, type };
    case 'list': return { id, type, ordered: false, items: [''] };
  }
}

/** Does the block carry anything a reader would see? Empty blocks are dropped when publishing. */
export function isBlockEmpty(b: Block): boolean {
  switch (b.type) {
    case 'divider': return false;
    case 'heading': case 'paragraph': case 'quote': case 'callout': return !b.text.trim();
    case 'image': case 'video': return !b.url.trim();
    case 'gallery': return b.images.length === 0;
    case 'code': return !b.code.trim();
    case 'button': return !b.label.trim() || !b.href.trim();
    case 'table': return b.headers.every((h) => !h.trim()) && b.rows.every((r) => r.every((c) => !c.trim()));
    case 'list': return b.items.every((i) => !i.trim());
  }
}

export function blockToPlainText(b: Block): string {
  switch (b.type) {
    case 'heading': case 'paragraph': case 'quote': return stripInline(b.text);
    case 'callout': return `${b.title ?? ''} ${stripInline(b.text)}`;
    case 'list': return b.items.map(stripInline).join(' ');
    case 'table': return [...b.headers, ...b.rows.flat()].map(stripInline).join(' ');
    case 'image': return b.caption ? stripInline(b.caption) : '';
    case 'button': return b.label;
    default: return '';
  }
}
export const blocksToPlainText = (blocks: Block[]): string => blocks.map(blockToPlainText).join(' ').replace(/\s+/g, ' ').trim();

export const countWords = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0);
/** Reading time in whole minutes (≥ 1) at 200 words per minute. */
export const readingMinutes = (blocks: Block[]): number => Math.max(1, Math.ceil(countWords(blocksToPlainText(blocks)) / 200));

export interface TocItem { id: string; text: string; level: 2 | 3 }
export const headingAnchor = (blockId: string): string => `h-${blockId}`;
export function buildToc(blocks: Block[]): TocItem[] {
  return blocks.flatMap((b) =>
    b.type === 'heading' && b.level <= 3 && b.text.trim()
      ? [{ id: headingAnchor(b.id), text: stripInline(b.text), level: b.level as 2 | 3 }]
      : []
  );
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}
