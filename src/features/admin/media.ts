import { addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { getDb, getStorageClient } from '@/lib/firebase/client';
import type { Localized, MediaItem } from '@/types';
import { plainDoc } from './data';
import { mediaPath, validateImage, type UploadError } from './media-utils';

export class UploadFailure extends Error {
  constructor(public reason: UploadError | 'failed') {
    super(reason);
  }
}

async function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return null; // e.g. AVIF in an old browser — dimensions are optional
  }
}

/** Validates, uploads to Storage (with progress), then records the file in /media. Throws UploadFailure. */
export async function uploadImage(file: File, uid: string, onProgress?: (fraction: number) => void): Promise<MediaItem> {
  const bad = validateImage(file);
  if (bad) throw new UploadFailure(bad);
  const path = mediaPath(file);
  const task = uploadBytesResumable(ref(getStorageClient(), path), file, { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' });
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed', (s) => onProgress?.(s.bytesTransferred / s.totalBytes), () => reject(new UploadFailure('failed')), () => resolve());
  });
  const url = await getDownloadURL(task.snapshot.ref);
  const size = await imageSize(file);
  const meta = { path, url, name: file.name.slice(0, 120), size: file.size, contentType: file.type, alt: { bn: '', en: '' }, uploadedBy: uid, ...(size ?? {}) };
  let docRef;
  try {
    docRef = await addDoc(collection(getDb(), 'media'), { ...meta, createdAt: serverTimestamp() });
  } catch {
    // an uploaded file with no record would sit in Storage, unlisted and unremovable from Admin — take it back out
    await deleteObject(task.snapshot.ref).catch(() => undefined);
    throw new UploadFailure('failed');
  }
  return { id: docRef.id, createdAt: new Date().toISOString(), ...meta };
}

export async function listMedia(max = 120): Promise<MediaItem[]> {
  const snap = await getDocs(query(collection(getDb(), 'media'), orderBy('createdAt', 'desc'), limit(max)));
  return snap.docs.map((d) => plainDoc(d.id, d.data()) as unknown as MediaItem);
}
export async function updateMediaAlt(id: string, alt: Localized): Promise<void> {
  await updateDoc(doc(getDb(), 'media', id), { alt });
}
export async function deleteMedia(item: MediaItem): Promise<void> {
  // A file that is already gone is fine. Any other failure (no permission, offline) stops here: deleting the record anyway would
  // leave the file in Storage, still public, and no longer listed anywhere.
  await deleteObject(ref(getStorageClient(), item.path)).catch((err: { code?: string }) => {
    if (err?.code !== 'storage/object-not-found') throw err;
  });
  await deleteDoc(doc(getDb(), 'media', item.id));
}
