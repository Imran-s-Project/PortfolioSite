'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Icon } from '@/components/shared/Icon';
import { SEED_PROJECTS } from '@/data/seed-projects';
import { logActivity, plainDoc, revalidateSite, stripUndefined } from '@/features/admin/data';
import { useAuth } from '@/features/admin/auth';
import { useAdminLang } from '@/features/admin/lang';
import { EmptyState, ErrorState, PageHead, StatusBadge, TableSkeleton, useConfirm, useToast } from '@/features/admin/ui';
import { useResource } from '@/features/admin/useResource';
import { getDb } from '@/lib/firebase/client';
import { parseProject } from '@/lib/validation/schemas';
import { pick } from '@/i18n/locales';
import type { Project } from '@/types';

type Row = Project & { source: 'built-in' | 'edited' | 'custom' };

/** Projects that were edited or added in Admin, keyed by slug (= document id). The ten built-in ones are merged in below. */
async function fetchRemoteProjects(): Promise<Map<string, Project>> {
  const snap = await getDocs(collection(getDb(), 'projects'));
  return new Map(snap.docs.flatMap((d) => { const p = parseProject({ ...plainDoc(d.id, d.data()), slug: d.id }); return p ? [[d.id, p] as const] : []; }));
}

export default function ProjectsAdminPage() {
  const { L, lang } = useAdminLang();
  const { user, profile, idToken } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const { data: remote, failed, reload } = useResource(fetchRemoteProjects);
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[] | null>(() => {
    if (!remote) return null;
    const seedSlugs = new Set(SEED_PROJECTS.map((p) => p.slug));
    const base: Row[] = SEED_PROJECTS.map((s) => (remote.has(s.slug) ? { ...(remote.get(s.slug) as Project), source: 'edited' as const } : { ...s, source: 'built-in' as const }));
    const custom: Row[] = [...remote.values()].filter((p) => !seedSlugs.has(p.slug)).map((p) => ({ ...p, source: 'custom' as const }));
    return [...base, ...custom].sort((a, b) => a.order - b.order);
  }, [remote]);

  const actor = () => ({ uid: user?.uid ?? '', name: profile?.displayName || user?.email || '' });
  const importAll = async () => {
    if (!remote) return;
    const missing = SEED_PROJECTS.filter((s) => !remote.has(s.slug));
    if (!missing.length) return toast.info(L('All built-in projects are already in the database.', 'সব বিল্ট-ইন প্রজেক্ট ইতিমধ্যে ডেটাবেজে আছে।'));
    setBusy(true);
    try {
      const db = getDb();
      const batch = writeBatch(db);
      for (const s of missing) batch.set(doc(db, 'projects', s.slug), stripUndefined({ ...s, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
      await batch.commit();
      toast.success(`${missing.length} ${L('projects imported — you can now edit every field.', 'টি প্রজেক্ট ইমপোর্ট হয়েছে — এখন সব ফিল্ড সম্পাদনা করতে পারবেন।')}`);
      void logActivity(actor(), 'import', 'project', 'built-in', `${missing.length} projects`);
      void idToken().then(revalidateSite);
      reload();
    } catch {
      toast.error(L('Import failed.', 'ইমপোর্ট ব্যর্থ।'));
    } finally {
      setBusy(false);
    }
  };
  const removeRemote = async (p: Row) => {
    const builtIn = p.source === 'edited';
    if (!(await confirm({ title: builtIn ? L('Reset to the built-in version?', 'বিল্ট-ইন সংস্করণে ফেরাবেন?') : L('Delete this project?', 'প্রজেক্টটি মুছবেন?'), body: builtIn ? L('Your edits are removed; the original project from the old site stays on the website.', 'আপনার সম্পাদনা মুছে যাবে; পুরনো সাইটের মূল প্রজেক্টটি ওয়েবসাইটে থাকবে।') : L('It disappears from the website. This cannot be undone.', 'এটি ওয়েবসাইট থেকে সরে যাবে। ফেরানো যাবে না।'), confirmLabel: builtIn ? L('Reset', 'রিসেট') : L('Delete', 'মুছুন'), danger: true }))) return;
    try {
      await deleteDoc(doc(getDb(), 'projects', p.slug));
      toast.success(L('Done.', 'সম্পন্ন।'));
      void logActivity(actor(), builtIn ? 'reset' : 'delete', 'project', p.slug, p.name.en || p.name.bn);
      void idToken().then(revalidateSite);
      reload();
    } catch {
      toast.error(L('Could not complete the action.', 'কাজটি করা যায়নি।'));
    }
  };

  return (
    <>
      <PageHead
        title={L('Projects', 'প্রজেক্ট')}
        sub={L('The ten projects from the original site are always shown. Edit one to add a case study, screenshots and more; add new ones below.', 'পুরনো সাইটের দশটি প্রজেক্ট সবসময় দেখানো হয়। কেস স্টাডি, স্ক্রিনশট ইত্যাদি যোগ করতে সম্পাদনা করুন; নতুন প্রজেক্ট যোগ করুন।')}
        actions={<><button type="button" className="btn btn--sm" disabled={busy || !remote} onClick={() => void importAll()}>{busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="download" />}{L('Import built-in projects', 'বিল্ট-ইন প্রজেক্ট ইমপোর্ট')}</button><Link href="/admin/projects/new" className="btn btn--primary btn--sm"><Icon name="plus" />{L('New project', 'নতুন প্রজেক্ট')}</Link></>}
      />
      {failed ? <ErrorState text={L('Could not load projects.', 'প্রজেক্ট লোড করা যায়নি।')} onRetry={reload} /> : !rows ? <TableSkeleton /> : rows.length === 0 ? <EmptyState title={L('No projects', 'কোনো প্রজেক্ট নেই')} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>{L('Project', 'প্রজেক্ট')}</th><th>{L('Category', 'ক্যাটাগরি')}</th><th>{L('Status', 'অবস্থা')}</th><th>{L('Source', 'উৎস')}</th><th><span className="sr-only">{L('Actions', 'কাজ')}</span></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.slug}>
                  <td>{p.order}</td>
                  <td><Link href={`/admin/projects/${p.slug}`}><strong>{pick(p.name, lang)}</strong></Link> {p.featured && <span className="badge">{L('Featured', 'নির্বাচিত')}</span>}<br /><small className="muted">{p.url}</small></td>
                  <td>{pick(p.category, lang)}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td><span className="badge">{p.source === 'built-in' ? L('Built-in', 'বিল্ট-ইন') : p.source === 'edited' ? L('Edited', 'সম্পাদিত') : L('Custom', 'নতুন')}</span></td>
                  <td><div className="adm-actions">
                    <Link href={`/admin/projects/${p.slug}`} className="btn btn--sm btn--icon" aria-label={L('Edit', 'সম্পাদনা')}><Icon name="edit" /></Link>
                    <a href={`/${lang}/projects/${p.slug}`} className="btn btn--sm btn--icon" target="_blank" rel="noopener noreferrer" aria-label={L('View live', 'লাইভ দেখুন')}><Icon name="external" /></a>
                    {p.source !== 'built-in' && <button type="button" className="btn btn--sm btn--icon btn--danger" aria-label={p.source === 'edited' ? L('Reset', 'রিসেট') : L('Delete', 'মুছুন')} onClick={() => void removeRemote(p)}><Icon name="trash" /></button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
