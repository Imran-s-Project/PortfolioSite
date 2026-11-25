'use client';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useLocale, useMessages } from '@/components/layout/LocaleProvider';
import { validateContact, type ContactField } from '@/lib/validation/schemas';

const COOLDOWN_MS = 60_000;
const LAST_KEY = 'imran-portfolio-contact-last';
type Status = 'idle' | 'sending' | 'success' | 'error' | 'wait';

/**
 * Saves a message to Firestore (collection contactMessages). Spam defences: a hidden honeypot field, a minimum fill time,
 * a one-minute cooldown per browser, App Check, and Security Rules that accept only a strictly shaped document
 * (lengths, types, read=false, server timestamp) and allow nobody but admins to read it back.
 */
export function ContactForm() {
  const locale = useLocale();
  const m = useMessages();
  const c = m.contact;
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<ContactField[]>([]);
  const openedAt = useRef(0);
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === 'sending') return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const parsed = validateContact({ name: data.get('name'), email: data.get('email'), subject: data.get('subject'), message: data.get('message') });
    if (!parsed.ok) {
      setErrors(parsed.fields);
      setStatus('idle');
      return;
    }
    setErrors([]);
    // Bots: they fill the hidden field or submit instantly. Pretend success, store nothing.
    if (data.get('website') || (openedAt.current && Date.now() - openedAt.current < 2500)) {
      setStatus('success');
      form.reset();
      return;
    }
    try {
      const last = Number(localStorage.getItem(LAST_KEY) ?? 0);
      if (last && Date.now() - last < COOLDOWN_MS) {
        setStatus('wait');
        return;
      }
    } catch {
      /* storage unavailable: skip the cooldown */
    }
    setStatus('sending');
    try {
      const [{ addDoc, collection, serverTimestamp }, { getDb }] = await Promise.all([import('firebase/firestore'), import('@/lib/firebase/client')]);
      await addDoc(collection(getDb(), 'contactMessages'), { ...parsed.data, locale, read: false, createdAt: serverTimestamp() });
      try {
        localStorage.setItem(LAST_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
      setStatus('success');
      form.reset();
    } catch (err) {
      console.error('[contact] could not save the message', err);
      setStatus('error');
    }
  };

  const bad = (f: ContactField) => errors.includes(f);
  const describe = (f: ContactField) => (bad(f) ? `${id(f)}-err` : undefined);
  return (
    <form className="form" onSubmit={(e) => void onSubmit(e)} onFocus={() => { if (!openedAt.current) openedAt.current = Date.now(); }} noValidate aria-label={c.formTitle}>
      <h3 className="section__title" style={{ fontSize: 'var(--fs-3)' }}>{c.formTitle}</h3>
      <div className="form__row">
        <div className="field">
          <label htmlFor={id('name')}>{c.name}</label>
          <input id={id('name')} name="name" className="input" autoComplete="name" maxLength={80} required aria-invalid={bad('name')} aria-describedby={describe('name')} />
          {bad('name') && <p id={id('name-err')} className="field__error">{c.errors.name}</p>}
        </div>
        <div className="field">
          <label htmlFor={id('email')}>{c.email}</label>
          <input id={id('email')} name="email" type="email" className="input" autoComplete="email" maxLength={200} required aria-invalid={bad('email')} aria-describedby={describe('email')} />
          {bad('email') && <p id={id('email-err')} className="field__error">{c.errors.email}</p>}
        </div>
      </div>
      <div className="field">
        <label htmlFor={id('subject')}>{c.subject}</label>
        <input id={id('subject')} name="subject" className="input" maxLength={120} required aria-invalid={bad('subject')} aria-describedby={describe('subject')} />
        {bad('subject') && <p id={id('subject-err')} className="field__error">{c.errors.subject}</p>}
      </div>
      <div className="field">
        <label htmlFor={id('message')}>{c.message}</label>
        <textarea id={id('message')} name="message" className="textarea" maxLength={4000} required aria-invalid={bad('message')} aria-describedby={describe('message')} />
        {bad('message') && <p id={id('message-err')} className="field__error">{c.errors.message}</p>}
      </div>
      <div className="hp" aria-hidden="true">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div className="row">
        <button type="submit" className="btn btn--primary" disabled={status === 'sending'}>
          {status === 'sending' ? <><span className="spinner" aria-hidden="true" />{c.sending}</> : c.send}
        </button>
      </div>
      <div role="status" aria-live="polite">
        {status === 'success' && <p className="alert">{c.success}</p>}
        {status === 'wait' && <p className="alert">{c.wait}</p>}
      </div>
      <div role="alert">{status === 'error' && <p className="alert alert--bad">{c.error}</p>}</div>
    </form>
  );
}
