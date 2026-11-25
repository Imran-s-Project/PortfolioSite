'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import type { Messages } from '@/i18n';
import type { Locale } from '@/types';

const Ctx = createContext<{ locale: Locale; messages: Messages } | null>(null);

/** Gives client components the active language and its UI strings, and makes every Motion animation honour prefers-reduced-motion. */
export function LocaleProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  return (
    <Ctx.Provider value={{ locale, messages }}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </Ctx.Provider>
  );
}

function useCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error('LocaleProvider is missing');
  return c;
}
export const useLocale = (): Locale => useCtx().locale;
export const useMessages = (): Messages => useCtx().messages;
