import { notFound } from 'next/navigation';

/** Any unknown URL under /bn or /en lands here and renders the custom 404 (not-found.tsx) inside the normal layout. */
export default function CatchAll() {
  notFound();
}
