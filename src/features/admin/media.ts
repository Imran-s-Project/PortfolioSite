import { addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getAuthClient, getDb } from '@/lib/firebase/client';
import type { Localized, MediaItem } from '@/types';
import { plainDoc } from './data';
import { hostImage, ImgbbError, type ImgbbImage } from './imgbb';
import { validateImage, type UploadError } from './media-utils';

export class UploadFailure extends Error {
  constructor(public reason: UploadError | 'failed' | 'config') {
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

const idToken = async (): Promise<string | null> => (await getAuthClient().currentUser?.getIdToken()) ?? null;

/** Validates, uploads to ImgBB (with progress), then records the image in /media. Throws UploadFailure. */
export async function uploadImage(file: File, uid: string, onProgress?: (fraction: number) => void): Promise<MediaItem> {
  const bad = validateImage(file);
  if (bad) throw new UploadFailure(bad);
  let image: ImgbbImage;
  try {
    image = await hostImage(file, idToken, onProgress);
  } catch (err) {
    throw new UploadFailure(err instanceof ImgbbError ? err.reason : 'failed');
  }
  // ImgBB reports the dimensions itself; decoding the file here is only the fallback.
  const size = image.width && image.height ? { width: image.width, height: image.height } : await imageSize(file);
  const meta = {
    path: `imgbb/${image.id}`,
    url: image.url,
    name: file.name.slice(0, 120),
    size: file.size,
    contentType: file.type,
    alt: { bn: '', en: '' },
    uploadedBy: uid,
    ...(size ?? {}),
    ...(image.deleteUrl ? { deleteUrl: image.deleteUrl } : {})
  };
  let docRef;
  try {
    docRef = await addDoc(collection(getDb(), 'media'), { ...meta, createdAt: serverTimestamp() });
  } catch {
    // ImgBB's free API cannot take the file back, so it stays there unlisted; uploading again is safe.
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
/** Removes the image from the library. ImgBB's free API has no delete call, so the file itself stays on ImgBB (README → Images). */
export async function deleteMedia(item: MediaItem): Promise<void> {
  await deleteDoc(doc(getDb(), 'media', item.id));
}
