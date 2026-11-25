'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/shared/Icon';
import { useAuth } from '@/features/admin/auth';
import { logActivity } from '@/features/admin/data';
import { useAdminLang } from '@/features/admin/lang';
import { deleteMedia, listMedia, updateMediaAlt } from '@/features/admin/media';
import { formatBytes } from '@/features/admin/media-utils';
import { UploadZone } from '@/features/admin/MediaPicker';
import { EmptyState, ErrorState, LocField, PageHead, TableSkeleton, useConfirm, useToast } from '@/features/admin/ui';
import { useResource } from '@/features/admin/useResource';
import type { Localized, MediaItem } from '@/types';

const fetchMedia = (): Promise<MediaItem[]> => listMedia(200);

export default function MediaPage() {
  const { L } = useAdminLang();
  const { user, profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const { data: items, failed, reload, update } = useResource(fetchMedia);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const [alt, setAlt] = useState<Localized>({ bn: '', en: '' });
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (open && el && !el.open) el.showModal();
  }, [open]);

  const choose = (m: MediaItem) => { setAlt(m.alt); setOpen(m); };
  const close = () => dialog.current?.close();
  const saveAlt = async () => {
    if (!open) return;
    try {
      await updateMediaAlt(open.id, alt);
      update((cur) => cur.map((x) => (x.id === open.id ? { ...x, alt } : x)));
      toast.success(L('Saved.', 'সংরক্ষিত।'));
      close();
    } catch {
      toast.error(L('Could not save.', 'সংরক্ষণ করা যায়নি।'));
    }
  };
  const remove = async () => {
    if (!open) return;
    close();
    if (!(await confirm({ title: L('Delete this image?', 'ছবিটি মুছবেন?'), body: L('It is removed from storage. Articles that still use it will show a broken image.', 'এটি স্টোরেজ থেকে মুছে যাবে। যেসব লেখায় এটি আছে সেখানে ছবি ভাঙা দেখাবে।'), confirmLabel: L('Delete', 'মুছুন'), danger: true }))) return;
    try {
      await deleteMedia(open);
      update((cur) => cur.filter((x) => x.id !== open.id));
      toast.success(L('Image deleted.', 'ছবি মুছে গেছে।'));
      if (user && profile) void logActivity({ uid: user.uid, name: profile.displayName || user.email || '' }, 'delete', 'media', open.id, open.name);
    } catch {
      toast.error(L('Could not delete.', 'মোছা যায়নি।'));
    }
  };
  const copy = async () => {
    if (!open) return;
    try {
      await navigator.clipboard.writeText(open.url);
      toast.success(L('Address copied.', 'ঠিকানা কপি হয়েছে।'));
    } catch {
      window.prompt(L('Copy the address:', 'ঠিকানা কপি করুন:'), open.url);
    }
  };

  return (
    <>
      <PageHead title={L('Media library', 'মিডিয়া লাইব্রেরি')} sub={L('Images are validated (type and size), stored in Firebase Storage and recorded here.', 'ছবি যাচাই (ধরন ও আকার) হয়ে ফায়ারবেস স্টোরেজে জমা হয় এবং এখানে নথিভুক্ত হয়।')} />
      <UploadZone onUploaded={(m) => update((cur) => [m, ...cur])} />
      {failed ? <ErrorState text={L('Could not load media.', 'মিডিয়া লোড করা যায়নি।')} onRetry={reload} /> : items === null ? <TableSkeleton rows={3} /> : items.length === 0 ? <EmptyState title={L('No images yet', 'এখনো কোনো ছবি নেই')} text={L('Upload your first image above.', 'উপরে প্রথম ছবিটি আপলোড করুন।')} /> : (
        <ul className="media-grid">
          {items.map((m) => (
            <li key={m.id}>
              <button type="button" className="media-item" style={{ width: '100%' }} onClick={() => choose(m)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.alt.en || m.name} loading="lazy" />
                <small>{m.name}</small>
                <small>{formatBytes(m.size)}{m.width ? ` · ${m.width}×${m.height}` : ''}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      <dialog ref={dialog} className="dialog" aria-label={L('Image details', 'ছবির বিবরণ')} onClose={() => setOpen(null)}>
        {open && (
          <div className="dialog__body">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open.url} alt={alt.en || open.name} style={{ maxHeight: '14rem', objectFit: 'contain', borderRadius: 'var(--radius-s)' }} />
            <p className="muted" style={{ overflowWrap: 'anywhere' }}>{open.name} · {formatBytes(open.size)} · {open.contentType}</p>
            <LocField label={L('Alt text (default for new uses)', 'অল্ট টেক্সট (নতুন ব্যবহারের ডিফল্ট)')} value={alt} max={300} onChange={setAlt} />
            <div className="dialog__actions">
              <button type="button" className="btn btn--danger" onClick={() => void remove()}><Icon name="trash" />{L('Delete', 'মুছুন')}</button>
              <button type="button" className="btn" onClick={() => void copy()}><Icon name="copy" />{L('Copy address', 'ঠিকানা কপি')}</button>
              <button type="button" className="btn" onClick={close}>{L('Close', 'বন্ধ')}</button>
              <button type="button" className="btn btn--primary" onClick={() => void saveAlt()}>{L('Save', 'সংরক্ষণ')}</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
