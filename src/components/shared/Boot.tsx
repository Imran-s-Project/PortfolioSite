'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { analyticsEnabled } from '@/config/firebase';

/** Small one-time and per-navigation client chores: scroll-reveal observer and (optional) analytics. Renders nothing. */
export function Boot() {
  const pathname = usePathname();

  // Firebase is loaded lazily and only when analytics is switched on, so ordinary visitors never download the Firebase SDK on page load.
  useEffect(() => {
    if (!analyticsEnabled) return;
    void import('@/lib/firebase/analytics').then((m) => m.startAnalytics()).catch(() => undefined);
  }, []);

  // reveal-on-scroll for every [data-reveal] element of the current page
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)'));
    if (!nodes.length) return;
    if (typeof IntersectionObserver === 'undefined') {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [pathname]);

  return null;
}
