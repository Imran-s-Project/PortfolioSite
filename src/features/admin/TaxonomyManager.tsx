'use client';
import { useCallback, useState } from 'react';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { Icon } from '@/components/shared/Icon';
import { getDb } from '@/lib/firebase/client';
import { slugify } from '@/lib/utils/slug';
import { parseTaxonomy } from '@/lib/validation/schemas';
import type { Localized, Taxonomy } from '@/types';
import { useAuth } from './auth';
import { logActivity, plainDoc, revalidateSite, stripUndefined } from './data';
import { useAdminLang } from './lang';
import { EmptyState, ErrorState, LocField, PageHead, TableSkeleton, useConfirm, useToast } from './ui';
import { useResource } from './useResource';

interface Form { slug: string; isNew: boolean; name: Localized; description: Localized; order: number }
const blank = (order: number): Form => ({ slug: '', isNew: true, name: { bn: '', en: '' }, description: { bn: '', en: '' }, order });

/** Create / edit / delete for blog categories and tags (document id = slug). */
export function TaxonomyManager({ collectionName, withDescription }: { collectionName: 'blogCategories' | 'blogTags'; withDescription?: boolean }) {
  const { L, lang } = useAdminLang();
  const { user, profile, idToken } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const label = collectionName === 'blogCategories' ? L('category', 'ক্যাটাগরি') : L('tag', 'ট্যাগ');
  const entity = collectionName === 'blogCategories' ? 'category' : 'tag';

  // Stable per collection: switching between categories and tags is a new question for useResource.
  const fetchItems = useCallback(async (): Promise<Taxonomy[]> => {
    const snap = await getDocs(collection(getDb(), collectionName));
    return snap.docs.map((d) => parseTaxonomy(plainDoc(d.id, d.data()))).filter((x): x is Taxonomy => x !== null).sort((a, b) => a.order - b.order || a.name.en.localeCompare(b.name.en));
  }, [collectionName]);
  const { data: items, failed, reload } = useResource(fetchItems);

  const actor = () => ({ uid: user?.uid ?? '', name: profile?.displayName || user?.email || '' });
  const save = async () => {
    if (!form) return;
    const slug = form.isNew ? (form.slug.trim() || slugify(form.name.en)) : form.slug;
    if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return toast.error(L('Give it an English name or a slug (letters, numbers, hyphens).', 'একটি ইংরেজি নাম বা স্লাগ দিন (অক্ষর, সংখ্যা, হাইফেন)।'));
    if (!form.name.bn.trim() && !form.name.en.trim()) return toast.error(L('Add a name.', 'নাম দিন।'));
    if (form.isNew && items?.some((i) => i.slug === slug)) return toast.error(L('That address already exists.', 'এই অ্যাড্রেস আগে থেকেই আছে।'));
    setSaving(true);
    try {
      // The list on screen may be stale or still loading, so ask the database: writing to an address that is taken would silently
      // replace that entry (the address is the document id).
      if (form.isNew && (await getDoc(doc(getDb(), collectionName, slug))).exists()) {
        toast.error(L('That address already exists.', 'এই অ্যাড্রেস আগে থেকেই আছে।'));
        return;
      }
      const existing = items?.find((i) => i.slug === slug);
      await setDoc(doc(getDb(), collectionName, slug), stripUndefined({ slug, name: form.name, ...(withDescription && (form.description.bn || form.description.en) ? { description: form.description } : {}), order: form.order, createdAt: existing?.createdAt ? new Date(existing.createdAt) : serverTimestamp(), updatedAt: serverTimestamp() }));
      toast.success(L('Saved.', 'সংরক্ষিত।'));
      void logActivity(actor(), form.isNew ? 'create' : 'update', entity, slug, form.name.en || form.name.bn);
      void idToken().then(revalidateSite);
      setForm(null);
      reload();
    } catch {
      toast.error(L('Could not save.', 'সংরক্ষণ করা যায়নি।'));
    } finally {
      setSaving(false);
    }
  };
  const remove = async (t: Taxonomy) => {
    if (!(await confirm({ title: `${L('Delete', 'মুছুন')}: ${t.name[lang] || t.name.en}?`, body: L('Posts that use it simply lose this label.', 'যেসব পোস্টে এটি আছে সেগুলো শুধু এই লেবেল হারাবে।'), confirmLabel: L('Delete', 'মুছুন'), danger: true }))) return;
    try {
      await deleteDoc(doc(getDb(), collectionName, t.id));
      toast.success(L('Deleted.', 'মুছে গেছে।'));
      void logActivity(actor(), 'delete', entity, t.id, t.name.en || t.name.bn);
      void idToken().then(revalidateSite);
      reload();
    } catch {
      toast.error(L('Could not delete.', 'মোছা যায়নি।'));
    }
  };

  return (
    <>
      <PageHead title={collectionName === 'blogCategories' ? L('Categories', 'ক্যাটাগরি') : L('Tags', 'ট্যাগ')} actions={<button type="button" className="btn btn--primary btn--sm" onClick={() => setForm(blank((items?.length ?? 0) + 1))}><Icon name="plus" />{L('New', 'নতুন')} {label}</button>} />
      {form && (
        <div className="adm-card">
          <h2>{form.isNew ? `${L('New', 'নতুন')} ${label}` : `${L('Edit', 'সম্পাদনা')} ${label}`}</h2>
          <LocField label={L('Name', 'নাম')} value={form.name} max={120} onChange={(name) => setForm({ ...form, name })} />
          {withDescription && <LocField label={L('Description (optional)', 'বর্ণনা (ঐচ্ছিক)')} value={form.description} multiline rows={2} max={500} onChange={(description) => setForm({ ...form, description })} />}
          <div className="adm-two">
            <div className="field"><label htmlFor="tslug">{L('Address (slug)', 'অ্যাড্রেস (স্লাগ)')}</label><input id="tslug" className="input" disabled={!form.isNew} value={form.slug} placeholder={slugify(form.name.en)} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} /></div>
            <div className="field"><label htmlFor="tord">{L('Order', 'ক্রম')}</label><input id="tord" type="number" className="input" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} /></div>
          </div>
          <div className="row"><button type="button" className="btn btn--primary" disabled={saving} onClick={() => void save()}>{L('Save', 'সংরক্ষণ')}</button><button type="button" className="btn" onClick={() => setForm(null)}>{L('Cancel', 'বাতিল')}</button></div>
        </div>
      )}
      {failed ? <ErrorState text={L('Could not load.', 'লোড করা যায়নি।')} onRetry={reload} /> : items === null ? <TableSkeleton rows={3} /> : items.length === 0 ? <EmptyState title={L('Nothing here yet', 'এখনো কিছু নেই')} /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>{L('Name', 'নাম')}</th><th>{L('Address', 'অ্যাড্রেস')}</th><th>{L('Order', 'ক্রম')}</th><th><span className="sr-only">{L('Actions', 'কাজ')}</span></th></tr></thead>
          <tbody>{items.map((t) => (
            <tr key={t.id}>
              <td><strong>{t.name.bn || '—'}</strong> / {t.name.en || '—'}</td><td><code>{t.slug}</code></td><td>{t.order}</td>
              <td><div className="adm-actions">
                <button type="button" className="btn btn--sm btn--icon" aria-label={L('Edit', 'সম্পাদনা')} onClick={() => setForm({ slug: t.slug, isNew: false, name: t.name, description: t.description ?? { bn: '', en: '' }, order: t.order })}><Icon name="edit" /></button>
                <button type="button" className="btn btn--sm btn--icon btn--danger" aria-label={L('Delete', 'মুছুন')} onClick={() => void remove(t)}><Icon name="trash" /></button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
