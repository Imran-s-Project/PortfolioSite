import legacy from './legacy/content.json';
import social from './legacy/social.json';
import iconPaths from './legacy/icon-paths.json';
import ui from './legacy/ui.json';
import type { Localized, SiteSettings, SocialLink } from '@/types';

/** The owner's own copy, carried over unchanged from the legacy site (js/data/content.js). Marked-up with **bold** where it had <strong>. */
export const COPY = legacy.content;
export const OWNER_EMAIL: string = legacy.site.email;
/** The legacy CV link pointed at assets/imran-ahmed-cv.pdf, but the file in the repo is imran_ahmed_cv.pdf — this is the real path. */
export const RESUME_URL = '/assets/imran_ahmed_cv.pdf';
export const SOCIAL_LINKS: SocialLink[] = social;
export const ICON_PATHS: Record<string, string[]> = iconPaths;

export const SKILL_GROUPS: { name: Localized; items: number[] }[] = ui.groups.map((g) => ({ name: { bn: g.bn, en: g.en }, items: g.i }));
export const PROJECT_FILTERS: { key: string; label: Localized }[] = ui.filters
  .filter((f) => f[0] !== 'all')
  .map((f) => ({ key: f[0] as string, label: { bn: f[1] as string, en: f[2] as string } }));
export const FOOTER_DESC: Localized = { bn: ui.footerDesc.bn, en: ui.footerDesc.en };

export const DEFAULT_SETTINGS: SiteSettings = {
  availability: 'hidden',
  availabilityNote: { bn: '', en: '' },
  defaultTheme: 'obsidian',
  email: OWNER_EMAIL,
  resumeUrl: RESUME_URL,
  // The legacy showcase video URL (…/ad.vd/imran's.mp4) is not part of the repository, so the section stays hidden until a URL is set in Admin → Settings.
  showcaseVideoUrl: '',
  maintenance: { enabled: false, message: { bn: 'সাইটটি কিছুক্ষণের জন্য রক্ষণাবেক্ষণে আছে। একটু পরে আবার দেখুন।', en: 'The site is briefly down for maintenance. Please check back soon.' } },
  seo: {
    titleTemplate: '%s | Imran Ahmed',
    description: {
      bn: 'ইমরান আহমেদ — ইন্ডিপেন্ডেন্ট ওয়েব ডেভেলপার। ভ্যানিলা জাভাস্ক্রিপ্ট ও ফায়ারবেস দিয়ে তৈরি দশটি লাইভ প্রজেক্ট, কেস স্টাডি ও ব্লগ।',
      en: 'Imran Ahmed — independent web developer. Ten live projects built with vanilla JavaScript and Firebase, with case studies and a blog.'
    },
    ogImage: '/og/og-default.png',
    noindex: false
  },
  socials: SOCIAL_LINKS
};
