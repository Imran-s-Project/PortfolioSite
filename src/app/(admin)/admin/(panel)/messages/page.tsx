'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, updateDoc } from 'firebase/firestore';
import { Icon } from '@/components/shared/Icon';
import { plainDoc } from '@/features/admin/data';
import { useAdminLang } from '@/features/admin/lang';
import { EmptyState, ErrorState, PageHead, Pager, StatusBadge, TableSkeleton, usePaged, useConfirm, useToast } from '@/features/admin/ui';
import { useResource } from '@/features/admin/useResource';
import { getDb } from '@/lib/firebase/client';
import { formatDate } from '@/lib/utils/dates';
import type { ContactMessage } from '@/types';

async function fetchMessages(): Promise<ContactMessage[]> {
  const snap = await getDocs(query(collection(getDb(), 'contactMessages'), orderBy('createdAt', 'desc'), limit(200)));
  return snap.docs.map((d) => plainDoc(d.id, d.data()) as unknown as ContactMessage);
}

export default function MessagesPage() {
  const { L, lang } = useAdminLang();
  const confirm = useConfirm();
  const toast = useToast();
  const { data: items, failed, reload, update } = useResource(fetchMessages);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<ContactMessage | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (open && el && !el.open) el.showModal();
  }, [open]);

  const setRead = async (m: ContactMessage, read: boolean) => {
    try {
      await updateDoc(doc(getDb(), 'contactMessages', m.id), { read });
      update((cur) => cur.map((x) => (x.id === m.id ? { ...x, read } : x)));
      setOpen((o) => (o && o.id === m.id ? { ...o, read } : o));
    } catch {
      toast.error(L('Could not update.', 'হালনাগাদ করা যায়নি।'));
    }
  };
  const show = (m: ContactMessage) => {
    setOpen(m);
    if (!m.read) void setRead(m, true);
  };
  const remove = async (m: ContactMessage) => {
    dialog.current?.close();
    if (!(await confirm({ title: L('Delete this message?', 'বার্তাটি মুছবেন?'), body: `${m.name} — ${m.subject}`, confirmLabel: L('Delete', 'মুছুন'), danger: true }))) return;
    try {
      await deleteDoc(doc(getDb(), 'contactMessages', m.id));
      update((cur) => cur.filter((x) => x.id !== m.id));
      toast.success(L('Message deleted.', 'বার্তা মুছে গেছে।'));
    } catch {
      toast.error(L('Could not delete.', 'মোছা যায়নি।'));
    }
  };

  const filtered = useMemo(() => (items ?? []).filter((m) => (filter === 'all' || !m.read) && (!q.trim() || `${m.name} ${m.email} ${m.subject} ${m.message}`.toLowerCase().includes(q.trim().toLowerCase()))), [items, filter, q]);
  const paged = usePaged(filtered, 12);

  return (
    <>
      <PageHead title={L('Messages', 'বার্তা')} sub={L('Sent through the contact form. Only administrators can read them.', 'যোগাযোগ ফর্ম থেকে এসেছে। শুধু অ্যাডমিনরা পড়তে পারেন।')} />
      <div className="adm-toolbar">
        <input className="input" type="search" placeholder={L('Search messages…', 'বার্তা খুঁজুন…')} aria-label={L('Search messages', 'বার্তা খুঁজুন')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" aria-label={L('Filter', 'ফিল্টার')} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">{L('All', 'সব')}</option><option value="unread">{L('Unread', 'অপঠিত')}</option></select>
      </div>
      {failed ? <ErrorState text={L('Could not load messages.', 'বার্তা লোড করা যায়নি।')} onRetry={reload} /> : items === null ? <TableSkeleton /> : filtered.length === 0 ? <EmptyState title={items.length === 0 ? L('No messages yet', 'এখনো কোনো বার্তা নেই') : L('No message matches', 'কোনো বার্তা মেলেনি')} /> : (
        <>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>{L('From', 'প্রেরক')}</th><th>{L('Subject', 'বিষয়')}</th><th>{L('Received', 'প্রাপ্তি')}</th><th>{L('Status', 'অবস্থা')}</th><th><span className="sr-only">{L('Actions', 'কাজ')}</span></th></tr></thead>
            <tbody>{paged.slice.map((m) => (
              <tr key={m.id} style={{ fontWeight: m.read ? 400 : 650 }}>
                <td><button type="button" className="btn btn--sm btn--ghost" onClick={() => show(m)}>{m.name}</button><br /><small className="muted">{m.email}</small></td>
                <td>{m.subject}</td><td>{formatDate(m.createdAt, lang, { dateStyle: 'medium', timeStyle: 'short' })}</td><td><StatusBadge status={m.read ? 'read' : 'unread'} /></td>
                <td><div className="adm-actions">
                  <button type="button" className="btn btn--sm btn--icon" aria-label={L('Open', 'খুলুন')} onClick={() => show(m)}><Icon name="eye" /></button>
                  <button type="button" className="btn btn--sm btn--icon btn--danger" aria-label={L('Delete', 'মুছুন')} onClick={() => void remove(m)}><Icon name="trash" /></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
          <Pager {...paged} />
        </>
      )}
      <dialog ref={dialog} className="dialog" aria-label={L('Message', 'বার্তা')} onClose={() => setOpen(null)}>
        {open && (
          <div className="dialog__body">
            <h2 style={{ fontSize: 'var(--fs-2)' }}>{open.subject}</h2>
            <p className="muted">{open.name} · <a href={`mailto:${open.email}`}>{open.email}</a> · {formatDate(open.createdAt, lang, { dateStyle: 'long', timeStyle: 'short' })} · {open.locale === 'bn' ? 'বাংলা' : 'English'}</p>
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{open.message}</p>
            <div className="dialog__actions">
              <button type="button" className="btn btn--danger" onClick={() => void remove(open)}><Icon name="trash" />{L('Delete', 'মুছুন')}</button>
              <button type="button" className="btn" onClick={() => void setRead(open, !open.read)}>{open.read ? L('Mark unread', 'অপঠিত করুন') : L('Mark read', 'পঠিত করুন')}</button>
              <a className="btn btn--primary" href={`mailto:${open.email}?subject=${encodeURIComponent(`Re: ${open.subject}`)}`}><Icon name="mail" />{L('Reply by email', 'ইমেইলে উত্তর')}</a>
              <button type="button" className="btn" onClick={() => dialog.current?.close()}>{L('Close', 'বন্ধ')}</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
