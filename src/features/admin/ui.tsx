'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/shared/Icon';
import type { Localized } from '@/types';
import { useAdminLang } from './lang';

/* ───────────── toasts ───────────── */
type Tone = 'success' | 'error' | 'info';
interface Toast { id: number; tone: Tone; text: string }
const ToastCtx = createContext<((tone: Tone, text: string) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const push = useCallback((tone: Tone, text: string) => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast" data-tone={t.tone}>
            <Icon name={t.tone === 'error' ? 'close' : 'check'} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToast() {
  const push = useContext(ToastCtx);
  if (!push) throw new Error('ToastProvider is missing');
  return useMemo(() => ({ success: (t: string) => push('success', t), error: (t: string) => push('error', t), info: (t: string) => push('info', t) }), [push]);
}

/* ───────────── confirmation dialog (promise based) ───────────── */
interface ConfirmOpts { title: string; body?: string; confirmLabel?: string; danger?: boolean }
const ConfirmCtx = createContext<((o: ConfirmOpts) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { L } = useAdminLang();
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setOpts(o);
  }), []);
  useEffect(() => {
    if (opts && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [opts]);
  const finish = (v: boolean) => {
    dialog.current?.close();
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <dialog ref={dialog} className="dialog" aria-labelledby="confirm-title" onCancel={(e) => { e.preventDefault(); finish(false); }}>
        {opts && (
          <div className="dialog__body">
            <h2 id="confirm-title" style={{ fontSize: 'var(--fs-2)' }}>{opts.title}</h2>
            {opts.body && <p className="muted">{opts.body}</p>}
            <div className="dialog__actions">
              <button type="button" className="btn" onClick={() => finish(false)} autoFocus>{L('Cancel', 'বাতিল')}</button>
              <button type="button" className={`btn ${opts.danger ? 'btn--danger' : 'btn--primary'}`} onClick={() => finish(true)}>{opts.confirmLabel ?? L('Confirm', 'নিশ্চিত করুন')}</button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmCtx.Provider>
  );
}
export function useConfirm() {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error('ConfirmProvider is missing');
  return c;
}

/* ───────────── small presentational helpers ───────────── */
export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="adm-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { L } = useAdminLang();
  const map: Record<string, [string, string]> = { published: ['badge badge--ok', L('Published', 'প্রকাশিত')], draft: ['badge badge--warn', L('Draft', 'খসড়া')], unread: ['badge badge--warn', L('Unread', 'অপঠিত')], read: ['badge', L('Read', 'পঠিত')] };
  const [cls, label] = map[status] ?? ['badge', status];
  return <span className={cls}>{label}</span>;
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="stack" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: '2.8rem' }} />)}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name="folder" size="2rem" />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const { L } = useAdminLang();
  return (
    <div className="alert alert--bad" role="alert">
      <p>{text}</p>
      {onRetry && <button type="button" className="btn btn--sm" style={{ marginTop: '0.6rem' }} onClick={onRetry}>{L('Try again', 'আবার চেষ্টা করুন')}</button>}
    </div>
  );
}

/** Client-side pagination of an already-loaded list. */
export function usePaged<T>(items: T[], pageSize = 10) {
  const [requested, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requested, pages - 1);
  return { page, pages, setPage, slice: items.slice(page * pageSize, page * pageSize + pageSize), total: items.length };
}
export function Pager({ page, pages, setPage, total }: { page: number; pages: number; setPage: (p: number) => void; total: number }) {
  const { L } = useAdminLang();
  if (pages <= 1) return <p className="muted" style={{ fontSize: 'var(--fs-0)' }}>{total} {L('items', 'টি')}</p>;
  return (
    <nav className="row adm-pager" aria-label={L('Pagination', 'পৃষ্ঠা')}>
      <button type="button" className="btn btn--sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{L('Previous', 'আগের')}</button>
      <span aria-live="polite">{page + 1} / {pages} · {total}</span>
      <button type="button" className="btn btn--sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>{L('Next', 'পরের')}</button>
    </nav>
  );
}

/** Two inputs side by side: Bangla and English. */
export function LocField({ label, value, onChange, multiline, rows = 3, max, hint }: { label: string; value: Localized; onChange: (v: Localized) => void; multiline?: boolean; rows?: number; max?: number; hint?: string }) {
  const { L } = useAdminLang();
  const base = `loc-${label}`.replace(/\s+/g, '-');
  const one = (k: 'bn' | 'en', tag: string) => (
    <div className="field" key={k}>
      <label htmlFor={`${base}-${k}`}>{label} <span className="badge">{tag}</span></label>
      {multiline ? (
        <textarea id={`${base}-${k}`} className="textarea" rows={rows} maxLength={max} value={value[k]} lang={k} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
      ) : (
        <input id={`${base}-${k}`} className="input" maxLength={max} value={value[k]} lang={k} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
      )}
    </div>
  );
  return (
    <div className="stack" style={{ gap: '0.5rem' }}>
      <div className="adm-two">{one('bn', L('Bangla', 'বাংলা'))}{one('en', 'English')}</div>
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

/** Warn before closing/reloading the tab while there are unsaved changes. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    addEventListener('beforeunload', onUnload);
    return () => removeEventListener('beforeunload', onUnload);
  }, [dirty]);
}

/** Tracks "there are unsaved changes" globally so the sidebar can ask before navigating away. */
export const dirtyFlag = { current: false };
export function useDirtyFlag(dirty: boolean) {
  useEffect(() => {
    dirtyFlag.current = dirty;
    return () => {
      dirtyFlag.current = false;
    };
  }, [dirty]);
  useUnsavedWarning(dirty);
}
