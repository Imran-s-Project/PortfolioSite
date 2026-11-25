/**
 * npm run diagnose:firestore
 *
 * Asks Firestore the very same questions the public site asks (the same query definitions) and says plainly what is wrong when
 * one cannot be answered: a composite index that is not deployed, a rejected API key, Security Rules, a network problem …
 * It needs no credentials — only the public web configuration the site itself uses — and it never prints the API key.
 * It only reads, and it changes nothing.
 */
import { firebaseConfig } from '@/config/firebase';
import { SITE_URL } from '@/config/site';
import { publicQueries } from '@/lib/firestore/public';
import { queryDocuments, readDocument, type FirestoreRequestError, type Outcome } from '@/lib/firestore/rest';

let problems = 0;
const show = (ok: boolean, name: string, detail: string): void => console.log(`${ok ? '✔' : '✖'} ${name.padEnd(34)} ${detail}`);

function failed(name: string, error: FirestoreRequestError): void {
  problems += 1;
  show(false, name, `${error.httpStatus === null ? 'no answer' : `HTTP ${error.httpStatus}`}${error.code ? ` ${error.code}` : ''} [${error.kind}]`);
  if (error.detail) console.log(`    · ${error.detail}`);
  console.log(`    → ${error.hint}`);
  if (error.indexUrl) console.log(`    → create the index: ${error.indexUrl}`);
}

/** Runs one query WITHOUT the missing-index fallback, so the raw problem is visible. */
async function check<T>(name: string, outcome: Outcome<T>, describe: (value: T) => string): Promise<Outcome<T>> {
  if (outcome.ok) show(true, name, describe(outcome.value));
  else failed(name, outcome.error);
  return outcome;
}
const count = (noun: string) => (docs: unknown[]) => `${docs.length} ${noun}`;

async function main(): Promise<void> {
  const log = console.error;
  console.error = () => undefined; // the data layer logs failures too; this report replaces those lines
  try {
    console.log(`Firebase project : ${firebaseConfig.projectId}`);
    console.log(`Sent as Referer  : ${SITE_URL}/`);
    console.log('');

    await check('siteSettings/main', await readDocument('siteSettings/main', 0), (d) => (d ? 'found' : 'not created yet — the built-in defaults are used (fine)'));
    await check('projects (published)', await queryDocuments(publicQueries.projects(), 0, { fallback: false }), count('project(s)'));
    const categories = await check('blogCategories', await queryDocuments(publicQueries.taxonomy('blogCategories'), 0, { fallback: false }), count('categorie(s)'));
    await check('blogTags', await queryDocuments(publicQueries.taxonomy('blogTags'), 0, { fallback: false }), count('tag(s)'));

    const latest = await check('blogPosts: newest first', await queryDocuments(publicQueries.posts(), 0, { fallback: false }), count('published post(s)'));
    if (!latest.ok && latest.error.kind === 'missing-index') {
      const meanwhile = await queryDocuments(publicQueries.posts(), 0);
      if (meanwhile.ok) console.log(`    → until the index exists the site still shows ${meanwhile.value.length} post(s), sorted in memory`);
    }

    const firstCategory = categories.ok ? categories.value[0]?.id : undefined;
    if (firstCategory) await check('blogPosts: one category', await queryDocuments(publicQueries.posts({ categoryId: firstCategory }), 0, { fallback: false }), count('post(s) in it'));
    else console.log(`– blogPosts: one category          skipped (${categories.ok ? 'no category exists yet' : 'the categories could not be read'}; its index is listed in firestore.indexes.json)`);

    const firstSlug = latest.ok ? latest.value[0]?.slug : undefined;
    if (typeof firstSlug === 'string') await check('blogPosts: one article', await queryDocuments(publicQueries.post(firstSlug), 0, { fallback: false }), (d) => (d.length === 1 ? 'found' : 'not found'));
  } finally {
    console.error = log;
  }

  console.log('');
  if (problems === 0) console.log('All checks passed.');
  else console.log(`${problems} problem(s) found — fix the lines marked ✖ above (docs/FIREBASE_SETUP.md explains each one).`);
  process.exitCode = problems === 0 ? 0 : 1;
}

void main();
