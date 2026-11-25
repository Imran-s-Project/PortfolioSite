import { LogoMark } from '@/components/brand/Logo';

/** Full-page notice (maintenance mode). Uses only server-safe markup. */
export function BrandedPanel({ title, text }: { title: string; text: string }) {
  return (
    <main id="main" className="center-page" style={{ minHeight: '100svh', alignContent: 'center' }}>
      <LogoMark size={96} draw />
      <h1>{title}</h1>
      <p>{text}</p>
    </main>
  );
}
