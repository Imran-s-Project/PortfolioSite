import type { MetadataRoute } from 'next';

/** Makes the site installable ("Add to home screen"). Deliberately no service worker: caching 20 MB of footage offline would do more harm than good. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Imran Ahmed — Web Developer',
    short_name: 'Imran Ahmed',
    description: 'Portfolio, case studies and blog of Imran Ahmed, independent web developer.',
    start_url: '/',
    display: 'standalone',
    background_color: '#07090b',
    theme_color: '#07090b',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
