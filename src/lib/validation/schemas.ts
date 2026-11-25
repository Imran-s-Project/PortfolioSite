import { z } from 'zod';
import { safeHref } from '@/lib/utils/inline';
import { isValidSlug } from '@/lib/utils/slug';
import { BLOCK_SCHEMA_VERSION, type Block, type Localized, type Post, type Project, type SiteSettings, type Taxonomy } from '@/types';

/* ───────────────────────────── helpers ───────────────────────────── */
const str = (max: number) => z.string().max(max);
/** Localized text; a missing side becomes ''. */
const loc = (max = 2000) =>
  z
    .object({ bn: z.string().max(max).optional(), en: z.string().max(max).optional() })
    .optional()
    .transform((v): Localized => ({ bn: v?.bn ?? '', en: v?.en ?? '' }));
/** '' (not chosen yet) or an https:// URL. Everything else — http:, data:, javascript: … — is rejected. */
const httpsUrl = z.string().max(2048).refine((v) => v === '' || /^https:\/\//i.test(v), 'https only');
const linkUrl = z.string().max(2000).refine((v) => v === '' || safeHref(v) !== null, 'unsafe link');
const slug = z.string().min(1).max(80).refine(isValidSlug, 'invalid slug');
const id = z.string().min(1).max(64);
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ───────────────────────────── content blocks ───────────────────────────── */
const dim = z.number().int().positive().max(20000).optional();
const imageRef = z.object({ url: httpsUrl, alt: str(300).optional().transform((v) => v ?? ''), storagePath: str(500).optional(), width: dim, height: dim });

export const blockSchema = z.discriminatedUnion('type', [
  z.object({ id, type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3), z.literal(4)]), text: str(400) }),
  z.object({ id, type: z.literal('paragraph'), text: str(10000) }),
  z.object({ id, type: z.literal('image'), url: httpsUrl, alt: str(300), caption: str(500).optional(), storagePath: str(500).optional(), width: dim, height: dim }),
  z.object({ id, type: z.literal('gallery'), images: z.array(imageRef).max(40) }),
  z.object({ id, type: z.literal('video'), url: str(2048), title: str(200).optional() }),
  z.object({ id, type: z.literal('code'), language: str(30), code: str(50000), filename: str(120).optional() }),
  z.object({ id, type: z.literal('quote'), text: str(2000), cite: str(200).optional() }),
  z.object({ id, type: z.literal('callout'), tone: z.enum(['info', 'success', 'warning', 'danger']), title: str(200).optional(), text: str(4000) }),
  z.object({ id, type: z.literal('button'), label: str(80), href: linkUrl, variant: z.enum(['primary', 'ghost']) }),
  z.object({ id, type: z.literal('table'), headers: z.array(str(300)).max(12), rows: z.array(z.array(str(1000)).max(12)).max(200) }),
  z.object({ id, type: z.literal('divider') }),
  z.object({ id, type: z.literal('list'), ordered: z.boolean(), items: z.array(str(1000)).max(200) })
]);

/** Keeps every valid block and silently drops invalid ones, so one bad block can never take a whole article down. */
export function parseBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];
  for (const item of raw.slice(0, 500)) {
    const r = blockSchema.safeParse(item);
    if (r.success) out.push(r.data as Block);
  }
  return out;
}

/* ───────────────────────────── blog ───────────────────────────── */
const rawPost = z.object({
  id: z.string().min(1),
  slug,
  status: z.enum(['draft', 'published']).optional(),
  schemaVersion: z.number().optional(),
  title: loc(300),
  excerpt: loc(800),
  content: z.object({ bn: z.unknown().optional(), en: z.unknown().optional() }).optional(),
  coverImage: z.object({ url: httpsUrl, alt: loc(300), storagePath: str(500).optional() }).nullish(),
  categoryId: z.string().max(80).nullish(),
  tagIds: z.array(str(80)).max(30).optional(),
  featured: z.boolean().optional(),
  publishedAt: z.string().nullish(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  authorId: z.string().optional(),
  seo: z
    .object({ metaTitle: loc(200), metaDescription: loc(400), ogImage: httpsUrl.optional(), canonical: httpsUrl.optional(), noindex: z.boolean().optional() })
    .optional(),
  readingMinutes: z.object({ bn: z.number().optional(), en: z.number().optional() }).optional(),
  views: z.number().optional()
});

export function parsePost(raw: unknown): Post | null {
  const r = rawPost.safeParse(raw);
  if (!r.success) return null;
  const d = r.data;
  return {
    id: d.id,
    slug: d.slug,
    status: d.status ?? 'draft',
    schemaVersion: d.schemaVersion ?? BLOCK_SCHEMA_VERSION,
    title: d.title,
    excerpt: d.excerpt,
    content: { bn: parseBlocks(d.content?.bn), en: parseBlocks(d.content?.en) },
    coverImage: d.coverImage && d.coverImage.url ? { url: d.coverImage.url, alt: d.coverImage.alt, storagePath: d.coverImage.storagePath } : undefined,
    categoryId: d.categoryId ?? null,
    tagIds: d.tagIds ?? [],
    featured: d.featured ?? false,
    publishedAt: d.publishedAt ?? null,
    createdAt: d.createdAt ?? '',
    updatedAt: d.updatedAt ?? '',
    authorId: d.authorId ?? '',
    seo: {
      metaTitle: d.seo?.metaTitle ?? { bn: '', en: '' },
      metaDescription: d.seo?.metaDescription ?? { bn: '', en: '' },
      ogImage: d.seo?.ogImage || undefined,
      canonical: d.seo?.canonical || undefined,
      noindex: d.seo?.noindex ?? false
    },
    readingMinutes: { bn: Math.max(1, d.readingMinutes?.bn ?? 1), en: Math.max(1, d.readingMinutes?.en ?? 1) },
    views: d.views ?? 0
  };
}

/* ───────────────────────────── projects ───────────────────────────── */
const projectImage = z.object({ url: httpsUrl, alt: loc(300), storagePath: str(500).optional() });
const rawProject = z.object({
  slug,
  legacyId: str(40).optional(),
  mark: str(8).optional(),
  url: z.string().max(2048).refine((v) => /^https:\/\//i.test(v), 'https only'),
  categories: z.array(str(30)).max(10).optional(),
  name: loc(200),
  category: loc(200),
  summary: loc(600),
  description: z.object({ bn: str(8000).optional(), en: str(8000).optional() }).optional(),
  objectives: z.array(loc(600)).max(20).optional(),
  features: z.array(loc(600)).max(40).optional(),
  technologies: z.array(str(60)).max(40).optional(),
  process: z.object({ bn: str(8000).optional(), en: str(8000).optional() }).optional(),
  challenges: z.array(z.object({ challenge: loc(1200), solution: loc(1200) })).max(20).optional(),
  screenshots: z.array(projectImage).max(30).optional(),
  thumbnail: projectImage.nullish(),
  featured: z.boolean().optional(),
  order: z.number().optional(),
  status: z.enum(['published', 'draft']).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

const some = (v: Localized | undefined): Localized | undefined => (v && (v.bn || v.en) ? v : undefined);

export function parseProject(raw: unknown): Project | null {
  const r = rawProject.safeParse(raw);
  if (!r.success) return null;
  const d = r.data;
  const text = (v: { bn?: string; en?: string } | undefined) => some(v ? { bn: v.bn ?? '', en: v.en ?? '' } : undefined);
  return {
    slug: d.slug,
    legacyId: d.legacyId,
    mark: d.mark || d.name.en.slice(0, 3).toUpperCase(),
    url: d.url,
    categories: d.categories ?? [],
    name: d.name,
    category: d.category,
    summary: d.summary,
    description: text(d.description),
    objectives: d.objectives?.filter((o) => o.bn || o.en),
    features: d.features?.filter((o) => o.bn || o.en),
    technologies: d.technologies ?? [],
    process: text(d.process),
    challenges: d.challenges?.filter((c) => c.challenge.bn || c.challenge.en),
    screenshots: (d.screenshots ?? []).filter((s) => s.url),
    thumbnail: d.thumbnail && d.thumbnail.url ? d.thumbnail : undefined,
    featured: d.featured ?? false,
    order: d.order ?? 999,
    status: d.status ?? 'draft',
    createdAt: d.createdAt,
    updatedAt: d.updatedAt
  };
}

/* ───────────────────────────── taxonomy, settings ───────────────────────────── */
const rawTaxonomy = z.object({ id: z.string().min(1), slug, name: loc(120), description: z.object({ bn: str(500).optional(), en: str(500).optional() }).optional(), order: z.number().optional(), createdAt: z.string().optional(), updatedAt: z.string().optional() });
export function parseTaxonomy(raw: unknown): Taxonomy | null {
  const r = rawTaxonomy.safeParse(raw);
  if (!r.success) return null;
  const d = r.data;
  return { id: d.id, slug: d.slug, name: d.name, description: d.description ? { bn: d.description.bn ?? '', en: d.description.en ?? '' } : undefined, order: d.order ?? 0, createdAt: d.createdAt, updatedAt: d.updatedAt };
}

const THEME_IDS = ['obsidian', 'aurora', 'arctic', 'terminal', 'ember'] as const;
/**
 * Each setting is read on its own: one that cannot be read is replaced by the built-in default for THAT setting only. A single
 * bad value (a mistyped address, an old format) must never switch off the others — maintenance mode least of all.
 */
const lenient = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);
const noText: Localized = { bn: '', en: '' };
const socialLink = z.object({ id: str(30), name: str(40), handle: str(120), url: str(500).refine((v) => safeHref(v) !== null), icon: str(20) });
const rawSettings = z.object({
  availability: lenient(z.enum(['available', 'busy', 'hidden'])),
  availabilityNote: loc(200).catch(noText),
  defaultTheme: lenient(z.enum(THEME_IDS)),
  email: lenient(str(200).refine((v) => v === '' || emailRe.test(v))),
  resumeUrl: lenient(str(500).refine((v) => v === '' || safeHref(v) !== null)),
  showcaseVideoUrl: lenient(str(2048)),
  maintenance: lenient(z.object({ enabled: lenient(z.boolean()), message: loc(600).catch(noText) })),
  seo: lenient(z.object({ titleTemplate: lenient(str(120)), description: loc(400).catch(noText), ogImage: lenient(str(500)), noindex: lenient(z.boolean()) })),
  socials: lenient(z.array(z.unknown()).max(20))
});
/**
 * Admin-editable settings layered over the built-in defaults. A missing or invalid setting falls back to `base`.
 * Social links: an explicitly empty list means "none" (the owner removed them all); links that are not valid are skipped one by
 * one, and if none of the stored ones is valid the defaults are kept rather than showing no links by accident.
 */
export function parseSettings(raw: unknown, base: SiteSettings): SiteSettings {
  const r = rawSettings.safeParse(raw);
  if (!r.success) return base;
  const d = r.data;
  const pickLoc = (v: Localized, b: Localized): Localized => (v.bn || v.en ? v : b);
  const stored = d.socials?.flatMap((item) => {
    const link = socialLink.safeParse(item);
    return link.success ? [link.data] : [];
  });
  return {
    availability: d.availability ?? base.availability,
    availabilityNote: pickLoc(d.availabilityNote, base.availabilityNote),
    defaultTheme: d.defaultTheme ?? base.defaultTheme,
    email: d.email || base.email,
    resumeUrl: d.resumeUrl || base.resumeUrl,
    showcaseVideoUrl: d.showcaseVideoUrl ?? base.showcaseVideoUrl,
    maintenance: { enabled: d.maintenance?.enabled ?? base.maintenance.enabled, message: pickLoc(d.maintenance?.message ?? noText, base.maintenance.message) },
    seo: {
      titleTemplate: d.seo?.titleTemplate || base.seo.titleTemplate,
      description: pickLoc(d.seo?.description ?? noText, base.seo.description),
      ogImage: d.seo?.ogImage || base.seo.ogImage,
      noindex: d.seo?.noindex ?? base.seo.noindex
    },
    socials: stored === undefined || (stored.length === 0 && (d.socials?.length ?? 0) > 0) ? base.socials : stored
  };
}

/* ───────────────────────────── contact form (shared by the form and its tests) ───────────────────────────── */
export const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().max(200).refine((v) => emailRe.test(v)),
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(4000)
});
export type ContactInput = z.infer<typeof contactSchema>;
export type ContactField = keyof ContactInput;
export function validateContact(input: unknown): { ok: true; data: ContactInput } | { ok: false; fields: ContactField[] } {
  const r = contactSchema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const fields = [...new Set(r.error.issues.map((i) => i.path[0] as ContactField))];
  return { ok: false, fields };
}
