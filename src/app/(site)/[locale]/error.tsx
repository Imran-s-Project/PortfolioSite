'use client';
import { useEffect } from 'react';
import { useMessages } from '@/components/layout/LocaleProvider';

/** Error boundary for every public page: the header and footer stay, only the page area shows the notice. */
export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const m = useMessages();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="page">
      <div className="container center-page" role="alert">
        <h1>{m.error.title}</h1>
        <p>{m.error.text}</p>
        <button type="button" className="btn btn--primary" onClick={reset}>{m.error.retry}</button>
      </div>
    </div>
  );
}
