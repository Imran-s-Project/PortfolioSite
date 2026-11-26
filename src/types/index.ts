/** Domain types. Dates are ISO-8601 strings everywhere in the app (converted from Firestore Timestamps at the edge). */
export type Locale = 'bn' | 'en';
export type Localized = { bn: string; en: string };
export type ThemeId = 'obsidian' | 'aurora' | 'arctic' | 'terminal' | 'ember';

/* ───────────── block-based content (schema version 1) ───────────── */
export const BLOCK_SCHEMA_VERSION = 1;
type Base = { id: string };
export type ImageRef = { url: string; alt: string; storagePath?: string; width?: number; height?: number };
export type HeadingBlock = Base & { type: 'heading'; level: 2 | 3 | 4; text: string };
export type ParagraphBlock = Base & { type: 'paragraph'; text: string };
export type ImageBlock = Base & { type: 'image'; url: string; alt: string; caption?: string; storagePath?: string; width?: number; height?: number };
export type GalleryBlock = Base & { type: 'gallery'; images: ImageRef[] };
export type VideoBlock = Base & { type: 'video'; url: string; title?: string };
export type CodeBlock = Base & { type: 'code'; language: string; code: string; filename?: string };
export type QuoteBlock = Base & { type: 'quote'; text: string; cite?: string };
export type CalloutTone = 'info' | 'success' | 'warning' | 'danger';
export type CalloutBlock = Base & { type: 'callout'; tone: CalloutTone; title?: string; text: string };
export type ButtonBlock = Base & { type: 'button'; label: string; href: string; variant: 'primary' | 'ghost' };
export type TableBlock = Base & { type: 'table'; headers: string[]; rows: string[][] };
export type DividerBlock = Base & { type: 'divider' };
export type ListBlock = Base & { type: 'list'; ordered: boolean; items: string[] };
export type Block =
  | HeadingBlock | ParagraphBlock | ImageBlock | GalleryBlock | VideoBlock | CodeBlock
  | QuoteBlock | CalloutBlock | ButtonBlock | TableBlock | DividerBlock | ListBlock;
export type BlockType = Block['type'];
export const BLOCK_TYPES: BlockType[] = [
  'heading', 'paragraph', 'image', 'gallery', 'video', 'code', 'quote', 'callout', 'button', 'table', 'divider', 'list'
];

/* ───────────── blog ───────────── */
export type PostStatus = 'draft' | 'published';
export interface PostSeo {
  metaTitle: Localized;
  metaDescription: Localized;
  ogImage?: string;
  canonical?: string;
  noindex: boolean;
}
export interface Post {
  id: string;
  slug: string;
  status: PostStatus;
  schemaVersion: number;
  title: Localized;
  excerpt: Localized;
  content: { bn: Block[]; en: Block[] };
  coverImage?: { url: string; alt: Localized; storagePath?: string };
  categoryId: string | null;
  tagIds: string[];
  featured: boolean;
  /** When the post went live (set by the publish action; editable in the editor). null while it is a draft. */
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  seo: PostSeo;
  /** Whole minutes to read, per language (computed from the blocks when the post is saved). */
  readingMinutes: { bn: number; en: number };
  views: number;
}
export type PostSummary = Omit<Post, 'content'>;
export interface Taxonomy {
  id: string;
  slug: string;
  name: Localized;
  description?: Localized;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

/* ───────────── projects ───────────── */
export type ProjectImage = { url: string; alt: Localized; storagePath?: string };
export interface Project {
  slug: string;
  legacyId?: string;
  mark: string;
  url: string;
  categories: string[];
  name: Localized;
  category: Localized;
  summary: Localized;
  description?: Localized;
  objectives?: Localized[];
  features?: Localized[];
  technologies: string[];
  process?: Localized;
  challenges?: { challenge: Localized; solution: Localized }[];
  screenshots: ProjectImage[];
  thumbnail?: ProjectImage;
  featured: boolean;
  order: number;
  status: 'published' | 'draft';
  createdAt?: string;
  updatedAt?: string;
}

/* ───────────── site, admin, messages ───────────── */
export interface SocialLink { id: string; name: string; handle: string; url: string; icon: string }
export interface SiteSettings {
  availability: 'available' | 'busy' | 'hidden';
  availabilityNote: Localized;
  defaultTheme: ThemeId;
  email: string;
  resumeUrl: string;
  showcaseVideoUrl: string;
  maintenance: { enabled: boolean; message: Localized };
  seo: { titleTemplate: string; description: Localized; ogImage: string; noindex: boolean };
  socials: SocialLink[];
}
export interface AdminProfile {
  uid: string;
  role: 'admin';
  displayName: string;
  email: string;
  photoURL?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface MediaItem {
  id: string;
  path: string;
  url: string;
  name: string;
  size: number;
  contentType: string;
  width?: number;
  height?: number;
  alt: Localized;
  uploadedBy: string;
  createdAt: string;
  /** ImgBB's own "delete this image" link (images uploaded to ImgBB only). Admin-only: /media is readable by administrators alone. */
  deleteUrl?: string;
}
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  locale: Locale;
  read: boolean;
  createdAt: string;
}
export interface ActivityLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  createdAt: string;
}
