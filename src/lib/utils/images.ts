/** Only images from this project's own Firebase Storage bucket (older uploads) and from ImgBB (current uploads) go through the Next.js image optimiser (see next.config.ts). */
export const bucketPrefix = (bucket: string): string => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/`;
export const isBucketImage = (url: string, bucket: string): boolean => url.startsWith(bucketPrefix(bucket));

/** Where ImgBB serves uploaded images from. */
export const IMGBB_IMAGE_HOST = 'i.ibb.co';
export const isImgbbImage = (url: string): boolean => url.startsWith(`https://${IMGBB_IMAGE_HOST}/`);
