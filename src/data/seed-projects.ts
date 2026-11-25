import legacy from './legacy/projects.json';
import type { Project } from '@/types';

/**
 * The ten projects of the legacy site, unchanged: same URLs, same bilingual names, categories and descriptions.
 * Nothing is invented — there are no technology lists, screenshots or statistics here because the owner never supplied any.
 * They are the baseline of the public site; a document with the same slug in Firestore (edited in Admin → Projects) overrides one of them.
 */
const SLUGS: Record<string, string> = {
  rupsha: 'rupsha-jonokollan-foundation',
  quranbangla: 'quran-bangla',
  tvcedit: 'tech-verse-code-editor',
  tvsites: 'tech-verse-site',
  tvcourse: 'tech-verse-course',
  tvexam: 'tech-verse-exam',
  buyzen: 'buyzen-shop',
  mazeflow: 'mazeflow',
  tvqrcode: 'teach-qr-code-generate',
  questiongen: 'exam-paper-master'
};
/** The four the owner's own "what I work on" text singles out (Quran app, web IDE, foundation site, exam platform). Editable in Admin. */
const FEATURED = new Set(['quranbangla', 'tvcedit', 'rupsha', 'tvexam']);

export const SEED_PROJECTS: Project[] = legacy.map((p, i) => ({
  slug: SLUGS[p.id] ?? p.id,
  legacyId: p.id,
  mark: p.mark,
  url: p.url,
  categories: p.cats,
  name: { bn: p.name.bn.trim(), en: p.name.en.trim() },
  category: { bn: p.cat.bn.trim(), en: p.cat.en.trim() },
  summary: { bn: p.desc.bn.trim(), en: p.desc.en.trim() },
  technologies: [],
  screenshots: [],
  featured: FEATURED.has(p.id),
  order: i + 1,
  status: 'published'
}));
