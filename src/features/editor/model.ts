import { isBlockEmpty, readingMinutes } from '@/lib/utils/blocks';
import { isValidSlug, slugify } from '@/lib/utils/slug';
import { blockSchema } from '@/lib/validation/schemas';
import { BLOCK_SCHEMA_VERSION, type Block, type BlockType, type Locale, type Localized, type Post, type PostSeo, type PostStatus } from '@/types';

/** The editor's working copy of a post (everything the form can change). */
export interface EditorPost {
  id: string | null;
  slug: string;
  slugTouched: boolean;
  status: PostStatus;
  featured: boolean;
  title: Localized;
  excerpt: Localized;
  content: { bn: Block[]; en: Block[] };
  coverImage?: { url: string; alt: Localized; storagePath?: string };
  categoryId: string | null;
  tagIds: string[];
  publishedAt: string | null;
  seo: PostSeo;
}

export const emptyLoc = (): Localized => ({ bn: '', en: '' });
export const emptyPost = (): EditorPost => ({
  id: null, slug: '', slugTouched: false, status: 'draft', featured: false, title: emptyLoc(), excerpt: emptyLoc(),
  content: { bn: [], en: [] }, categoryId: null, tagIds: [], publishedAt: null,
  seo: { metaTitle: emptyLoc(), metaDescription: emptyLoc(), noindex: false }
});
export const postToEditor = (p: Post): EditorPost => ({
  id: p.id, slug: p.slug, slugTouched: true, status: p.status, featured: p.featured, title: p.title, excerpt: p.excerpt, content: p.content,
  coverImage: p.coverImage, categoryId: p.categoryId, tagIds: p.tagIds, publishedAt: p.publishedAt, seo: p.seo
});

/** The URL slug suggested from the English title (Bangla-only titles fall back to "post"). */
export const suggestSlug = (title: Localized): string => slugify(title.en, '') || (title.bn.trim() ? 'post' : '');

/**
 * A full https:// address — the only kind the site accepts for the share image and the canonical address. The reader refuses a
 * post as a whole when one of these two is anything else, so the editor must never save such a value.
 */
export function isHttpsUrl(value: string): boolean {
  try {
    return value.length <= 2048 && new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
/** A text box that was left empty means "not set": nothing is stored for it. */
export const optionalUrl = (value: string | undefined): string | undefined => value?.trim() || undefined;

/** The reader keeps at most this many blocks per language and ignores the rest. */
const MAX_BLOCKS = 500;

export interface BlockProblem {
  lang: Locale;
  /** 1-based position of the block in that language's content. */
  number: number;
  type: BlockType;
}
/**
 * Blocks the site would silently drop when it reads the article back (a paragraph over 10 000 characters, a link that is not
 * allowed, more than 500 blocks …). It uses the very same schema as the reader, so the editor can never save what it cannot show.
 */
export function blockProblems(content: { bn: Block[]; en: Block[] }): BlockProblem[] {
  const out: BlockProblem[] = [];
  for (const lang of ['bn', 'en'] as const) {
    content[lang].forEach((block, i) => {
      if (i >= MAX_BLOCKS || !blockSchema.safeParse(block).success) out.push({ lang, number: i + 1, type: block.type });
    });
  }
  return out;
}
/** How many stored blocks the reader dropped when it opened the article — saving would delete them for good. */
export function unreadBlocks(raw: unknown, post: Pick<Post, 'content'>): number {
  const stored = (raw as { content?: { bn?: unknown; en?: unknown } } | null | undefined)?.content;
  const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return Math.max(0, count(stored?.bn) - post.content.bn.length) + Math.max(0, count(stored?.en) - post.content.en.length);
}

export type SaveProblem = 'title' | 'slug' | 'slug-taken' | 'content' | 'cover-alt' | 'seo-image' | 'seo-canonical' | 'blocks';
/** Checks that run before every save. `publish` adds the stricter rules a live article must meet. */
export function problems(s: EditorPost, takenSlugs: string[], publish: boolean): SaveProblem[] {
  const out: SaveProblem[] = [];
  if (!s.title.bn.trim() && !s.title.en.trim()) out.push('title');
  if (!isValidSlug(s.slug)) out.push('slug');
  else if (takenSlugs.includes(s.slug)) out.push('slug-taken');
  const image = optionalUrl(s.seo.ogImage);
  if (image && !isHttpsUrl(image)) out.push('seo-image');
  const canonical = optionalUrl(s.seo.canonical);
  if (canonical && !isHttpsUrl(canonical)) out.push('seo-canonical');
  if (blockProblems(s.content).length > 0) out.push('blocks');
  if (publish) {
    if (![...s.content.bn, ...s.content.en].some((b) => !isBlockEmpty(b))) out.push('content');
    if (s.coverImage && !s.coverImage.alt.bn.trim() && !s.coverImage.alt.en.trim()) out.push('cover-alt');
  }
  return out;
}

/** A live article never contains empty blocks. */
export const cleanContent = (c: { bn: Block[]; en: Block[] }): { bn: Block[]; en: Block[] } => ({ bn: c.bn.filter((b) => !isBlockEmpty(b)), en: c.en.filter((b) => !isBlockEmpty(b)) });
export const readingTimes = (c: { bn: Block[]; en: Block[] }): { bn: number; en: number } => ({ bn: readingMinutes(c.bn), en: readingMinutes(c.en) });
export { BLOCK_SCHEMA_VERSION };

/** datetime-local input value ↔ ISO string (kept in the visitor's local time zone). */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Projects store pairs (bn+en); the form edits two "one per line" boxes. */
export function zipLines(bn: string, en: string): Localized[] {
  const a = bn.split('\n'), b = en.split('\n');
  const n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_, i) => ({ bn: (a[i] ?? '').trim(), en: (b[i] ?? '').trim() })).filter((x) => x.bn || x.en);
}
export const unzipLines = (list: Localized[] | undefined): { bn: string; en: string } => ({ bn: (list ?? []).map((x) => x.bn).join('\n'), en: (list ?? []).map((x) => x.en).join('\n') });
