'use client';
import { useSyncExternalStore } from 'react';
import { DEFAULT_THEME } from '@/config/site';
import { getTheme, setTheme, subscribeTheme } from '@/lib/theme';
import type { ThemeId } from '@/types';

export function useTheme(): [ThemeId, (id: ThemeId) => void] {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => DEFAULT_THEME);
  return [theme, setTheme];
}
