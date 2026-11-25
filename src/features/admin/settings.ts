import { doc, getDoc, setDoc } from 'firebase/firestore';
import { DEFAULT_SETTINGS } from '@/data/site-data';
import { getDb } from '@/lib/firebase/client';
import { parseSettings } from '@/lib/validation/schemas';
import type { SiteSettings } from '@/types';
import { plainDoc, stripUndefined } from './data';

/** The live site settings (admin edits layered over the built-in defaults). */
export async function loadSettings(): Promise<SiteSettings> {
  const snap = await getDoc(doc(getDb(), 'siteSettings', 'main'));
  return parseSettings(snap.exists() ? plainDoc(snap.id, snap.data()) : undefined, DEFAULT_SETTINGS);
}
/** Writes only the given top-level sections (deep-merged), so each admin page owns its own part of the document. */
export async function saveSettingsPart(part: Record<string, unknown>): Promise<void> {
  await setDoc(doc(getDb(), 'siteSettings', 'main'), stripUndefined(part), { merge: true });
}
