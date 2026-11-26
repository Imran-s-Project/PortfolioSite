import { NextResponse, type NextRequest } from 'next/server';
import { verifyAdmin } from '@/lib/server/admin-auth';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Gives the ImgBB API key to a signed-in administrator — and to nobody else — so the key can stay out of the JavaScript every visitor
 * downloads. The Admin Panel then uploads straight from the browser to ImgBB (see src/features/admin/imgbb.ts for why).
 * Same check as /api/revalidate (`verifyAdmin`): no token → 401, not an administrator → 403. No key configured on the server → 503.
 */
export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status, headers: NO_STORE });

  const key = process.env.IMGBB_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: 'IMGBB_API_KEY is not set' }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ key }, { headers: NO_STORE });
}
