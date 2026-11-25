import { STORAGE_KEYS, THEMES } from '@/config/site';
import type { ThemeId } from '@/types';

/**
 * Runs before first paint (inline, render-blocking by design) so the correct theme, motion setting and intro state are on
 * <html> before anything is drawn — no flash of the wrong theme, no hydration jump.
 * Visitor's saved choice → site default (from Admin → Theme) → Arctic only when the default is untouched and the OS prefers light.
 */
export function ThemeScript({ defaultTheme }: { defaultTheme: ThemeId }) {
  const colors = Object.fromEntries(THEMES.map((t) => [t.id, t.themeColor]));
  const code = `(function(){var d=document.documentElement;d.setAttribute('data-js','true');try{var L=localStorage,ok=${JSON.stringify(THEMES.map((t) => t.id))},t=L.getItem(${JSON.stringify(STORAGE_KEYS.theme)});if(ok.indexOf(t)<0){t=${JSON.stringify(defaultTheme)};if(t==='obsidian'&&matchMedia('(prefers-color-scheme: light)').matches)t='arctic'}d.setAttribute('data-theme',t);var c=${JSON.stringify(colors)}[t],m=document.querySelector('meta[name="theme-color"]');if(m&&c)m.setAttribute('content',c);var r=matchMedia('(prefers-reduced-motion: reduce)').matches,o=L.getItem(${JSON.stringify(STORAGE_KEYS.motion)});if(o==='off'||(o!=='on'&&r))d.setAttribute('data-motion','off');if(r||sessionStorage.getItem(${JSON.stringify(STORAGE_KEYS.intro)}))d.setAttribute('data-intro','seen')}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
