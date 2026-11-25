import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AboutSection } from '@/components/sections/AboutSection';
import { ContactSection } from '@/components/sections/ContactSection';
import { getMessages } from '@/i18n';
import { isLocale } from '@/i18n/locales';
import { getSettings } from '@/lib/firestore/public';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getMessages(locale);
  return pageMetadata({ locale, path: '/about', title: m.meta.about, description: m.meta.description });
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const settings = await getSettings();
  return (
    <div className="page">
      <AboutSection locale={locale} messages={m} id="about" headingLevel={1} />
      <ContactSection locale={locale} messages={m} settings={settings} />
    </div>
  );
}
