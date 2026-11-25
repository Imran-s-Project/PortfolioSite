import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { analyticsEnabled } from '@/config/firebase';
import { fmt } from '@/i18n';
import { getMessages } from '@/i18n';
import { isLocale } from '@/i18n/locales';
import { getSettings } from '@/lib/firestore/public';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getMessages(locale);
  return pageMetadata({ locale, path: '/privacy', title: m.privacy.title, description: m.privacy.sections[0]?.body ?? m.meta.description });
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const settings = await getSettings();
  const sections = analyticsEnabled ? [...m.privacy.sections.slice(0, -1), m.privacy.analytics, ...m.privacy.sections.slice(-1)] : m.privacy.sections;
  return (
    <div className="page" data-scene="river">
      <div className="container-narrow section" style={{ paddingTop: '1rem' }}>
        <div className="panel legal">
          <header data-enter style={{ '--i': 0 } as CSSProperties}>
            <h1 className="section__title">{m.privacy.title}</h1>
            <p className="muted">{m.privacy.updated}</p>
          </header>
          {sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              <p>{fmt(s.body, { email: settings.email })}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
