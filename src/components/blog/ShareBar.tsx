'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/shared/Icon';
import { useMessages } from '@/components/layout/LocaleProvider';
import { useIsClient } from '@/hooks/useIsClient';
import { shareTargets } from '@/lib/utils/share';

/**
 * Share buttons under an article.
 *
 * Hydration: whether the browser has `navigator.share` is something only the browser knows. The server therefore renders the
 * bar WITHOUT the native-share button, and so does the first client render (`useIsClient()` is false while hydrating). Only
 * after hydration, where the API exists, the button is added. The social links and "copy link" are always there, so a
 * browser without native sharing (most desktop browsers) simply never gets the extra button.
 */
export function ShareBar({ url, title }: { url: string; title: string }) {
  const m = useMessages();
  const isClient = useIsClient();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const canNativeShare = isClient && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard API missing (plain http) or refused: let the visitor copy it by hand.
      window.prompt(m.blog.copyLink, url);
    }
  };
  const nativeShare = async () => {
    try {
      await navigator.share({ title, url });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // the visitor closed the share sheet — not an error
      await copy(); // the sheet could not open: fall back to copying the link
    }
  };

  return (
    <div className="share">
      <span className="share__label">{m.blog.share}</span>
      {canNativeShare && (
        <button type="button" className="chip" onClick={() => void nativeShare()}><Icon name="share" />{m.blog.share}</button>
      )}
      {shareTargets(url, title).map((s) => (
        <a key={s.name} className="chip" href={s.href} target="_blank" rel="noopener noreferrer">{s.name}<span className="sr-only"> {m.a11y.external}</span></a>
      ))}
      <button type="button" className="chip" onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} />{m.blog.copyLink}</button>
      <span role="status" className="sr-only">{copied ? m.blog.copied : ''}</span>
    </div>
  );
}
