'use client';
import Link from 'next/link';
import { LogoMark } from '@/components/brand/Logo';
import { useLocale, useMessages } from '@/components/layout/LocaleProvider';
import { localizePath } from '@/i18n/locales';

export default function LocaleNotFound() {
  const locale = useLocale();
  const m = useMessages();
  return (
    <div className="page" data-scene="river">
      <div className="container center-page">
        <LogoMark size={88} />
        <p className="section__eyebrow">404</p>
        <h1>{m.notFound.title}</h1>
        <p>{m.notFound.text}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn btn--primary" href={localizePath(locale, '/')}>{m.notFound.home}</Link>
          <Link className="btn btn--ghost" href={localizePath(locale, '/projects')}>{m.nav.projects}</Link>
        </div>
      </div>
    </div>
  );
}
