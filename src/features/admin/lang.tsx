'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { LOCALE_COOKIE, STORAGE_KEYS } from '@/config/site';
import { getMessages } from '@/i18n';
import { isLocale } from '@/i18n/locales';
import { LocaleProvider } from '@/components/layout/LocaleProvider';
import type { Locale } from '@/types';

interface Ctx {
  lang: Locale;
  setLang: (l: Locale) => void;
  /** L('Save', 'সংরক্ষণ') — both languages sit next to each other at the place of use, so none can be forgotten. */
  L: (en: string, bn: string) => string;
}
const LangCtx = createContext<Ctx | null>(null);

function initialLang(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.adminLang);
    if (isLocale(stored)) return stored;
    const cookie = document.cookie.split('; ').find((c) => c.startsWith(`${LOCALE_COOKIE}=`))?.split('=')[1];
    if (isLocale(cookie)) return cookie;
  } catch {
    /* fall through */
  }
  return 'bn';
}

/** Mount only on the client (AdminRoot waits for hydration), so reading storage in the initializer is safe. */
export function AdminLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Locale>(initialLang);
  const setLang = useCallback((l: Locale) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEYS.adminLang, l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l;
  }, []);
  const value = useMemo<Ctx>(() => ({ lang, setLang, L: (en, bn) => (lang === 'bn' ? bn : en) }), [lang, setLang]);
  return (
    <LangCtx.Provider value={value}>
      <LocaleProvider locale={lang} messages={getMessages(lang)}>{children}</LocaleProvider>
    </LangCtx.Provider>
  );
}

export function useAdminLang(): Ctx {
  const c = useContext(LangCtx);
  if (!c) throw new Error('AdminLangProvider is missing');
  return c;
}
