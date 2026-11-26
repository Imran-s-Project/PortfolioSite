'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/shared/Icon';
import type { MediaItem } from '@/types';
import { useAuth } from './auth';
import { useAdminLang } from './lang';
import { listMedia, uploadImage, UploadFailure } from './media';
import { MAX_IMAGE_BYTES, formatBytes } from './media-utils';
import { ErrorState, useToast } from './ui';
import { useResource } from './useResource';

const fetchRecentMedia = (): Promise<MediaItem[]> => listMedia(60);

/** Upload area shared by the library page and the picker: drag & drop or choose files, with validation and progress. */
export function UploadZone({ onUploaded, multiple = true }: { onUploaded: (item: MediaItem) => void; multiple?: boolean }) {
  const { L } = useAdminLang();
  const { user } = useAuth();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const run = async (files: FileList | File[]) => {
    if (!user) return;
    for (const file of Array.from(files)) {
      setProgress(0);
      try {
        onUploaded(await uploadImage(file, user.uid, setProgress));
        toast.success(`${L('Uploaded', 'আপলোড হয়েছে')}: ${file.name}`);
      } catch (err) {
        const reason = err instanceof UploadFailure ? err.reason : 'failed';
        toast.error(
          reason === 'type' ? L('Only JPEG, PNG, WebP, AVIF or GIF images are allowed (SVG is refused for safety).', 'শুধু JPEG, PNG, WebP, AVIF বা GIF ছবি চলবে (নিরাপত্তার জন্য SVG নেওয়া হয় না)।')
          : reason === 'size' ? `${L('The image must be smaller than', 'ছবি অবশ্যই ছোট হতে হবে')} ${formatBytes(MAX_IMAGE_BYTES)}.`
          : reason === 'empty' ? L('The file is empty.', 'ফাইলটি খালি।')
          : reason === 'config' ? L('Image hosting (ImgBB) is not set up yet — the site owner needs to add IMGBB_API_KEY on the server.', 'ছবি হোস্টিং (ImgBB) এখনো চালু করা হয়নি — সাইটের মালিককে সার্ভারে IMGBB_API_KEY যোগ করতে হবে।')
          : L('Upload failed. Check your connection and permissions.', 'আপলোড ব্যর্থ। সংযোগ ও অনুমতি দেখুন।')
        );
      }
    }
    setProgress(null);
  };

  return (
    <div
      className="dropzone"
      data-over={over}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void run(e.dataTransfer.files); }}
    >
      <Icon name="upload" size="1.6rem" />
      <p>{L('Drag images here or', 'ছবি এখানে টেনে আনুন, অথবা')}</p>
      <button type="button" className="btn btn--sm" onClick={() => input.current?.click()} disabled={progress !== null}>{L('Choose files', 'ফাইল বেছে নিন')}</button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple={multiple} hidden onChange={(e) => { if (e.target.files) void run(e.target.files); e.target.value = ''; }} />
      <small>{L('JPEG, PNG, WebP, AVIF, GIF · under 5 MB', 'JPEG, PNG, WebP, AVIF, GIF · ৫ MB এর কম')}</small>
      {progress !== null && <progress className="upload" value={progress} max={1} aria-label={L('Upload progress', 'আপলোডের অগ্রগতি')} />}
    </div>
  );
}

/** Modal that lets the editor choose an existing image or upload a new one. */
export function MediaPicker({ onPick, onClose }: { onPick: (item: MediaItem) => void; onClose: () => void }) {
  const { L } = useAdminLang();
  const dialog = useRef<HTMLDialogElement>(null);
  const { data: items, failed, reload, update } = useResource(fetchRecentMedia);

  // Show the dialog as a modal as soon as it exists. The guard keeps React StrictMode's second effect run from re-opening it.
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="dialog picker" aria-label={L('Choose an image', 'একটি ছবি বেছে নিন')} onClose={onClose} onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
      <div className="dialog__body">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 'var(--fs-2)' }}>{L('Choose an image', 'একটি ছবি বেছে নিন')}</h2>
          <button type="button" className="btn btn--icon btn--sm" aria-label={L('Close', 'বন্ধ')} onClick={() => dialog.current?.close()}><Icon name="close" /></button>
        </div>
        <UploadZone onUploaded={(item) => update((cur) => [item, ...cur])} />
        {failed ? <ErrorState text={L('Could not load the library.', 'লাইব্রেরি লোড করা যায়নি।')} onRetry={reload} /> : items === null ? <div className="skeleton" style={{ height: '8rem' }} /> : items.length === 0 ? <p className="muted">{L('No images yet — upload the first one above.', 'এখনো কোনো ছবি নেই — উপরে প্রথমটি আপলোড করুন।')}</p> : (
          <ul className="media-grid">
            {items.map((m) => (
              <li key={m.id}>
                <button type="button" className="media-item" style={{ width: '100%' }} onClick={() => { onPick(m); dialog.current?.close(); }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.alt.en || m.name} loading="lazy" />
                  <small>{m.name}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
