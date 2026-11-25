'use client';
import { useEffect } from 'react';
import { motionEnabled, subscribeMotion } from '@/lib/motion-pref';

/** Mirrors the motion preference onto <html data-motion> so plain CSS can pause decorative animation. Renders nothing. */
export function HtmlSync() {
  useEffect(() => {
    const apply = (on: boolean) => document.documentElement.setAttribute('data-motion', on ? 'on' : 'off');
    apply(motionEnabled());
    return subscribeMotion(apply);
  }, []);
  return null;
}
