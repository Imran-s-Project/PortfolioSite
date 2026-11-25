'use client';
import { useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/features/admin/auth';
import { useAdminLang } from '@/features/admin/lang';
import { PageHead, useToast } from '@/features/admin/ui';
import { getDb } from '@/lib/firebase/client';

export default function ProfilePage() {
  const { L, lang, setLang } = useAdminLang();
  const { user, profile, renameSelf } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(profile?.displayName ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(getDb(), 'adminProfiles', user.uid), { displayName: name.trim(), updatedAt: serverTimestamp() });
      await renameSelf(name.trim());
      toast.success(L('Profile saved.', 'প্রোফাইল সংরক্ষিত।'));
    } catch {
      toast.error(L('Could not save.', 'সংরক্ষণ করা যায়নি।'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <PageHead title={L('Profile', 'প্রোফাইল')} />
      <div className="adm-card" style={{ maxWidth: '36rem' }}>
        <div className="field"><label htmlFor="dn">{L('Display name', 'প্রদর্শিত নাম')}</label><input id="dn" className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <dl className="stack">
          <div><dt className="muted">{L('Email', 'ইমেইল')}</dt><dd>{user?.email}</dd></div>
          <div><dt className="muted">{L('Role', 'ভূমিকা')}</dt><dd><span className="badge badge--ok">{profile?.role}</span></dd></div>
          <div><dt className="muted">UID</dt><dd><code style={{ overflowWrap: 'anywhere' }}>{user?.uid}</code></dd></div>
        </dl>
        <div className="field"><label htmlFor="al">{L('Admin language', 'অ্যাডমিনের ভাষা')}</label><select id="al" className="select" value={lang} onChange={(e) => setLang(e.target.value as 'bn' | 'en')}><option value="bn">বাংলা</option><option value="en">English</option></select></div>
        <div><button type="button" className="btn btn--primary" disabled={saving || !name.trim()} onClick={() => void save()}>{L('Save profile', 'প্রোফাইল সংরক্ষণ')}</button></div>
      </div>
    </>
  );
}
