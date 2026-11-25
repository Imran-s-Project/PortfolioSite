import { newId } from '@/lib/utils/blocks';
import { slugify } from '@/lib/utils/slug';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // keep in sync with storage.rules
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };

export type UploadError = 'type' | 'size' | 'empty';
/** SVG and HTML are refused on purpose: they can carry script. The Storage rules enforce the same limits. */
export function validateImage(file: { type: string; size: number }): UploadError | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size <= 0) return 'empty';
  if (file.size >= MAX_IMAGE_BYTES) return 'size';
  return null;
}

/** media/2026/11/<id>-<safe-name>.<ext> — the exact 4-segment shape storage.rules allows. */
export function mediaPath(file: { name: string; type: string }, now = new Date()): string {
  const base = slugify(file.name.replace(/\.[^.]+$/, ''), 'image').slice(0, 40);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `media/${now.getUTCFullYear()}/${mm}/${newId()}-${base}.${EXT[file.type] ?? 'bin'}`;
}

export const formatBytes = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
