'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/shared/Icon';
import { THEMES } from '@/config/site';
import { useAuth } from '@/features/admin/auth';
import { logActivity, revalidateSite } from '@/features/admin/data';
import { useAdminLang } from '@/features/admin/lang';
import { loadSettings, saveSettingsPart } from '@/features/admin/settings';
import { PageHead, useToast } from '@/features/admin/ui';
import { useTheme } from '@/hooks/useTheme';
import { useMessages } from '@/components/layout/LocaleProvider';
import type { ThemeId } from '@/types';

export default function ThemePage() {
  const { L } = useAdminLang();
  const m = useMessages();
  const { user, profile, idToken } = useAuth();
  const toast = useToast();
  const [current, setTheme] = useTheme();
  const [saved, setSaved] = useState<ThemeId | null>(null);
  const [saving, setSaving] = useState<ThemeId | null>(null);
  useEffect(() => {
    loadSettings().then((s) => setSaved(s.defaultTheme)).catch(() => undefined);
  }, []);

  const makeDefault = async (id: ThemeId) => {
    if (!user || !profile) return;
    setSaving(id);
    try {
      await saveSettingsPart({ defaultTheme: id });
      setSaved(id);
      toast.success(L('Default theme saved.', 'ডিফল্ট থিম সংরক্ষিত।'));
      void logActivity({ uid: user.uid, name: profile.displayName || user.email || '' }, 'update', 'settings', 'theme', id);
      void idToken().then(revalidateSite);
    } catch {
      toast.error(L('Could not save.', 'সংরক্ষণ করা যায়নি।'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <PageHead title={L('Theme', 'থিম')} sub={L('Pick the look new visitors see first. Anyone can still switch themes from the header — their choice is remembered on their device.', 'নতুন দর্শক প্রথমে যে লুক দেখবেন তা বেছে নিন। হেডার থেকে যে কেউ থিম বদলাতে পারেন — তাঁর পছন্দ তাঁর ডিভাইসে মনে রাখা হয়।')} />
      <div className="adm-stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))' }}>
        {THEMES.map((t) => (
          <div key={t.id} className="adm-card" style={{ outline: saved === t.id ? '2px solid var(--accent)' : undefined }}>
            <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 4, padding: 6, borderRadius: 'var(--radius-m)', background: t.swatch[0], border: '1px solid var(--border)', height: '4.5rem' }}>
              <i style={{ background: t.swatch[1], borderRadius: 6 }} /><i style={{ background: t.swatch[2], borderRadius: 6 }} /><i style={{ background: t.swatch[2], borderRadius: 6, opacity: 0.45 }} />
            </div>
            <div><h2>{m.themes[t.id].name}</h2><p className="muted">{m.themes[t.id].blurb}</p></div>
            <div className="row">
              <button type="button" className="btn btn--sm" aria-pressed={current === t.id} onClick={() => setTheme(t.id)}>{current === t.id ? <><Icon name="check" />{L('Previewing', 'প্রিভিউ চলছে')}</> : L('Preview here', 'এখানে প্রিভিউ')}</button>
              <button type="button" className="btn btn--sm btn--primary" disabled={saved === t.id || saving !== null} onClick={() => void makeDefault(t.id)}>{saved === t.id ? L('Site default', 'সাইটের ডিফল্ট') : L('Make default', 'ডিফল্ট করুন')}</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
