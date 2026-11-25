'use client';
import { useEffect, useRef } from 'react';

/** Thin bar under the header showing how far through the article (#targetId) you are. */
export function ReadingProgress({ targetId }: { targetId: string }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = target.getBoundingClientRect();
      const total = rect.height - innerHeight * 0.6;
      const read = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1;
      bar.current?.style.setProperty('--read', read.toFixed(4));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [targetId]);
  return (
    <div className="readbar" aria-hidden="true">
      <i ref={bar} />
    </div>
  );
}
