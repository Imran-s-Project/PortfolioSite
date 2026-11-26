import { slugify } from '@/lib/utils/slug';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // the Admin Panel's own limit (ImgBB's free plan would take up to 32 MB)

export type UploadError = 'type' | 'size' | 'empty';
/** SVG and HTML are refused on purpose: they can carry script. */
export function validateImage(file: { type: string; size: number }): UploadError | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size <= 0) return 'empty';
  if (file.size >= MAX_IMAGE_BYTES) return 'size';
  return null;
}

/** The name ImgBB gives the image: an ASCII slug of the file name (Bangla and other non-latin names become "image"). ImgBB adds the extension itself. */
export function imageName(file: { name: string }): string {
  return slugify(file.name.replace(/\.[^.]+$/, ''), 'image').slice(0, 40).replace(/-+$/g, '') || 'image';
}

export const formatBytes = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
