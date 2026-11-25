import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyAdmin } from '@/lib/server/admin-auth';

/**
 * Called by the admin area after publishing, so visitors see changes immediately instead of after the cache window
 * (60 s for pages, 5 minutes for the search index, an hour for the sitemap).
 * Only an administrator may call it (see `verifyAdmin`): everyone else gets 401 or 403 and nothing is revalidated.
 */
export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  revalidatePath('/[locale]', 'layout');
  revalidatePath('/sitemap.xml');
  revalidatePath('/api/search-index');
  return NextResponse.json({ revalidated: true });
}
