import { DEFAULT_THEME, STORAGE_KEYS, THEMES, isThemeId } from '@/config/site';
import type { ThemeId } from '@/types';

/** The <html data-theme> attribute IS the source of truth (the pre-hydration script sets it before first paint). */
const listeners = new Set<() => void>();

export function getTheme(): ThemeId {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const attr = document.documentElement.dataset.theme;
  return isThemeId(attr) ? attr : DEFAULT_THEME;
}

export function setTheme(id: ThemeId): void {
  const root = document.documentElement;
  try {
    localStorage.setItem(STORAGE_KEYS.theme, id);
  } catch {
    /* private mode: the choice just will not persist */
  }
  // A short cross-fade of surfaces (see base.css) — only while switching, so nothing animates the rest of the time.
  root.classList.add('theme-switching');
  root.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES.find((t) => t.id === id)?.themeColor ?? '#07090b');
  window.setTimeout(() => root.classList.remove('theme-switching'), 450);
  listeners.forEach((fn) => fn());
}

export function subscribeTheme(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
