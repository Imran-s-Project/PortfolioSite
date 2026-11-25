/** Only images from this project's own Firebase Storage bucket go through the Next.js image optimiser (see next.config.ts). */
export const bucketPrefix = (bucket: string): string => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/`;
export const isBucketImage = (url: string, bucket: string): boolean => url.startsWith(bucketPrefix(bucket));
