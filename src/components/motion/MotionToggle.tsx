'use client';
import { useMotionEnabled } from '@/hooks/useMotion';
import { toggleMotion } from '@/lib/motion-pref';
import { useMessages } from '@/components/layout/LocaleProvider';
import { Icon } from '@/components/shared/Icon';

/** Pause / play the living background (WCAG 2.2.2). The choice is remembered. */
export function MotionToggle({ className }: { className?: string }) {
  const m = useMessages();
  const on = useMotionEnabled();
  const label = on ? m.controls.motionPause : m.controls.motionPlay;
  return (
    <button type="button" className={className} onClick={toggleMotion} aria-pressed={!on} aria-label={label} title={label}>
      <Icon name={on ? 'pause' : 'play'} />
    </button>
  );
}
