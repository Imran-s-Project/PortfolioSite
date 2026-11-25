'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { NatureEngine } from '@/lib/nature/engine';

/**
 * Hosts the Cinematic Nature Engine. The engine is code-split and started when the browser is idle, so it can never
 * delay or break the portfolio itself; if anything fails the calm gradient fallback of each scene stays.
 */
export function NatureBackground() {
  const host = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const engine = useRef<NatureEngine | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const hostEl = host.current;
    if (!hostEl) return;
    const ctl = new AbortController();
    const start = () => {
      import('@/lib/nature/engine')
        .then(({ initNature }) => initNature(hostEl, veil.current, ctl.signal))
        .then((e) => {
          if (!e) return;
          if (ctl.signal.aborted) e.destroy();
          else engine.current = e;
        })
        .catch((err: unknown) => console.error('[nature] could not start', err));
    };
    const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback(start, { timeout: 1500 }) : window.setTimeout(start, 250);
    return () => {
      ctl.abort();
      if (typeof requestIdleCallback === 'function') cancelIdleCallback(idle);
      else clearTimeout(idle);
      engine.current?.destroy();
      engine.current = null;
    };
  }, []);

  // A new page has a new layout: let the engine re-measure where each [data-scene] section sits.
  useEffect(() => {
    const id = requestAnimationFrame(() => engine.current?.remeasure());
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <>
      <div id="scenes" ref={host} aria-hidden="true" />
      <div className="veil" ref={veil} aria-hidden="true" />
    </>
  );
}
