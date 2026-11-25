'use client';
import { useEffect, useRef, useState } from 'react';
import { LogoMark } from '@/components/brand/Logo';
import { STORAGE_KEYS } from '@/config/site';
import { useMessages } from './LocaleProvider';
import styles from './IntroLoader.module.css';

const MIN_MS = 1100; // long enough for the logo to draw — never longer than that on purpose
const MAX_MS = 3200; // hard ceiling: the visitor is never trapped behind the loader

/**
 * First-visit introduction: the logo draws itself, the name rises, a light beam passes, a progress line fills as REAL
 * readiness signals arrive (fonts → window load). Then it dissolves into the page and the hero enters.
 * It plays once per browser session, is skipped for reduced motion, is hidden without JS (see ThemeScript / globals) and
 * can be skipped with a click or Escape.
 */
export function IntroLoader() {
  const m = useMessages();
  const [phase, setPhase] = useState<'show' | 'exit' | 'gone'>('show');
  const fill = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.intro === 'seen') {
      const id = requestAnimationFrame(() => {
        root.dataset.entered = 'true';
      });
      return () => cancelAnimationFrame(id);
    }
    const progress = (p: number) => fill.current?.style.setProperty('--p', String(p));
    const t0 = performance.now();
    let finished = false;
    const timers: number[] = [];

    const finish = () => {
      if (finished) return;
      finished = true;
      progress(1);
      setPhase('exit');
      root.dataset.entered = 'true'; // the hero starts entering underneath the dissolving overlay
      try {
        sessionStorage.setItem(STORAGE_KEYS.intro, '1');
      } catch {
        /* storage unavailable: the intro may replay, harmless */
      }
      timers.push(
        window.setTimeout(() => {
          root.dataset.intro = 'seen';
          setPhase('gone');
        }, 750)
      );
    };

    progress(0.18);
    const fonts = (document.fonts?.ready ?? Promise.resolve()).then(() => progress(0.55));
    const loaded = new Promise<void>((resolve) => {
      if (document.readyState === 'complete') resolve();
      else addEventListener('load', () => resolve(), { once: true });
    }).then(() => progress(0.88));
    timers.push(window.setTimeout(finish, MAX_MS));
    void Promise.all([fonts, loaded]).then(() => {
      timers.push(window.setTimeout(finish, Math.max(0, MIN_MS - (performance.now() - t0))));
    });

    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish();
    addEventListener('keydown', onKey);
    return () => {
      timers.forEach(clearTimeout);
      removeEventListener('keydown', onKey);
    };
  }, []);

  if (phase === 'gone') return null;
  return (
    <div className={styles.intro} data-phase={phase} role="status" aria-live="polite">
      <span className="sr-only">{m.intro.label}</span>
      <div className={styles.beam} aria-hidden="true" />
      <div className={styles.center} aria-hidden="true">
        <LogoMark size={132} draw className={styles.mark} />
        <div className={styles.name}>{m.meta.siteName}</div>
        <div className={styles.track}>
          <span ref={fill} className={styles.fill} />
        </div>
      </div>
      <button type="button" className={styles.skip} onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))}>
        {m.a11y.close}
      </button>
    </div>
  );
}
