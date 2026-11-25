import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { Hind_Siliguri, JetBrains_Mono, Sora } from 'next/font/google';
import type { ReactNode } from 'react';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';
import '@/styles/nature.css';
import '@/styles/site.css';
import { LOCALES, OG_LOCALE, SITE_URL } from '@/config/site';
import { getMessages } from '@/i18n';
import { isLocale } from '@/i18n/locales';
import { getSettings } from '@/lib/firestore/public';
import { jsonLdString, personLd, websiteLd } from '@/lib/seo/jsonld';
import { BrandedPanel } from '@/components/layout/BrandedPanel';
import { IntroLoader } from '@/components/layout/IntroLoader';
import { LocaleProvider } from '@/components/layout/LocaleProvider';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { HtmlSync } from '@/components/motion/HtmlSync';
import { ScrollProgress } from '@/components/motion/ScrollProgress';
import { NatureBackground } from '@/components/nature/NatureBackground';
import { CommandPalette } from '@/components/search/CommandPalette';
import { Boot } from '@/components/shared/Boot';
import { ThemeScript } from '@/components/theme/ThemeScript';

// Fonts are downloaded at build time and served from this site (no request to Google when a visitor loads the page).
const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' });
const bn = Hind_Siliguri({ subsets: ['bengali', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-bn', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap', weight: ['500'] });

export const revalidate = 60;
export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));
export const viewport: Viewport = { themeColor: '#07090b', width: 'device-width', initialScale: 1 };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const [m, settings] = await Promise.all([Promise.resolve(getMessages(locale)), getSettings()]);
  const other = locale === 'bn' ? 'en' : 'bn';
  const description = settings.seo.description[locale] || m.meta.description;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: m.meta.title, template: settings.seo.titleTemplate },
    description,
    applicationName: 'Imran Ahmed',
    authors: [{ name: 'Imran Ahmed', url: SITE_URL }],
    robots: settings.seo.noindex ? { index: false, follow: false } : undefined,
    alternates: { canonical: `${SITE_URL}/${locale}`, languages: { [locale]: `${SITE_URL}/${locale}`, [other]: `${SITE_URL}/${other}`, 'x-default': `${SITE_URL}/bn` } },
    openGraph: { type: 'website', siteName: 'Imran Ahmed', locale: OG_LOCALE[locale], alternateLocale: [OG_LOCALE[other]], title: m.meta.title, description, url: `${SITE_URL}/${locale}`, images: [{ url: settings.seo.ogImage, width: 1200, height: 630, alt: m.meta.title }] },
    twitter: { card: 'summary_large_image', title: m.meta.title, description, images: [settings.seo.ogImage] }
  };
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const settings = await getSettings();
  const description = settings.seo.description[locale] || m.meta.description;

  return (
    <html lang={locale} data-theme={settings.defaultTheme} className={`${sora.variable} ${bn.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript defaultTheme={settings.defaultTheme} />
        <noscript><style>{'[class*="IntroLoader"]{display:none!important}'}</style></noscript>
      </head>
      <body>
        <LocaleProvider locale={locale} messages={m}>
          <a className="skip" href="#main">{m.a11y.skip}</a>
          {settings.maintenance.enabled ? (
            <BrandedPanel title={m.maintenance.title} text={settings.maintenance.message[locale]} />
          ) : (
            <>
              <NatureBackground />
              <ScrollProgress />
              <HtmlSync />
              <Boot />
              <IntroLoader />
              <SiteHeader />
              <main id="main" tabIndex={-1}>{children}</main>
              <SiteFooter locale={locale} messages={m} settings={settings} />
              <CommandPalette />
            </>
          )}
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString([personLd(locale), websiteLd(locale, description)]) }} />
        </LocaleProvider>
      </body>
    </html>
  );
}
