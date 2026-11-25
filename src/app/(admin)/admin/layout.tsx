import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Hind_Siliguri, JetBrains_Mono, Sora } from 'next/font/google';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';
import '@/styles/site.css';
import '@/styles/admin.css';
import { ThemeScript } from '@/components/theme/ThemeScript';
import { AdminRoot } from '@/features/admin/AdminRoot';

const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' });
const bn = Hind_Siliguri({ subsets: ['bengali', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-bn', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap', weight: ['500'] });

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Admin' }, robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: '#07090b', width: 'device-width', initialScale: 1 };

/** A second root layout: the admin area is a separate, never-indexed client application that shares only the design system. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn" data-theme="obsidian" className={`${sora.variable} ${bn.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><ThemeScript defaultTheme="obsidian" /></head>
      <body><AdminRoot>{children}</AdminRoot></body>
    </html>
  );
}
