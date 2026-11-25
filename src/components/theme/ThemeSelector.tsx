'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { THEMES } from '@/config/site';
import { useTheme } from '@/hooks/useTheme';
import { useMessages } from '@/components/layout/LocaleProvider';
import { Icon } from '@/components/shared/Icon';
import type { ThemeId } from '@/types';

/** Full-site theme picker: an accessible listbox popover (arrow keys, Home/End, Enter/Space, Esc, click-away). */
export function ThemeSelector({ align = 'end' }: { align?: 'start' | 'end' }) {
  const m = useMessages();
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const uid = useId();
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const openList = () => {
    setActive(Math.max(0, THEMES.findIndex((t) => t.id === theme)));
    setOpen(true);
  };
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) button.current?.focus();
  };
  const choose = (id: ThemeId) => {
    setTheme(id);
    close(true);
  };
  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const last = THEMES.length - 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i >= last ? 0 : i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? last : i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(last); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const t = THEMES[active]; if (t) choose(t.id); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close(false);
  };

  return (
    <div className="tsel" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="tsel__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${m.controls.chooseTheme}: ${m.themes[theme].name}`}
        title={m.controls.chooseTheme}
        onClick={() => (open ? close(false) : openList())}
      >
        <span className="tsel__swatch" style={{ background: `linear-gradient(135deg, ${current?.swatch[2]} 50%, ${current?.swatch[1]} 50%)` }} aria-hidden="true" />
        <Icon name="palette" />
      </button>
      {open && (
        <ul ref={list} role="listbox" tabIndex={-1} aria-label={m.controls.chooseTheme} aria-activedescendant={optionId(active)} className="tsel__list" data-align={align} onKeyDown={onKey}>
          {THEMES.map((t, i) => (
            <li key={t.id} id={optionId(i)} role="option" aria-selected={t.id === theme} data-active={i === active} className="tsel__opt" onClick={() => choose(t.id)} onPointerMove={() => setActive(i)}>
              <span className="tsel__preview" aria-hidden="true" style={{ background: t.swatch[0], borderColor: t.swatch[2] }}>
                <i style={{ background: t.swatch[1] }} />
                <i style={{ background: t.swatch[2] }} />
              </span>
              <span className="tsel__text">
                <strong>{m.themes[t.id].name}</strong>
                <small>{m.themes[t.id].blurb}</small>
              </span>
              {t.id === theme && <Icon name="check" className="tsel__check" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
