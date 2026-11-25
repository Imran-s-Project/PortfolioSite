// Run from the project root:  npm --prefix firebase-rules-tests install && npm run rules:test
// (needs the Firebase CLI; `firebase emulators:exec` starts the Firestore + Storage emulators and sets their host variables)
import { test, before, after, beforeEach, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, serverTimestamp, Timestamp, increment } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

const rules = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-imran', firestore: { rules: rules('firestore.rules') }, storage: { rules: rules('storage.rules') } });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'adminProfiles/admin1'), { role: 'admin', displayName: 'Admin', email: 'a@b.co' });
    await setDoc(doc(db, 'projects/live-one'), project('live-one', 'published'));
    await setDoc(doc(db, 'projects/hidden-one'), project('hidden-one', 'draft'));
    await setDoc(doc(db, 'blogPosts/p1'), post('hello', 'published'));
    await setDoc(doc(db, 'blogPosts/p2'), post('secret', 'draft'));
  });
});

const project = (slug, status) => ({ slug, status, url: 'https://example.com', name: { bn: 'ক', en: 'A' }, summary: { bn: 'ক', en: 'A' } });
const post = (slug, status) => ({ slug, status, schemaVersion: 1, title: { bn: '', en: 'T' }, excerpt: { bn: '', en: '' }, content: { bn: [], en: [] }, views: 0, publishedAt: status === 'published' ? Timestamp.now() : null });
const anon = () => env.unauthenticatedContext().firestore();
const user = () => env.authenticatedContext('user1').firestore();
const admin = () => env.authenticatedContext('admin1').firestore();
const message = (over = {}) => ({ name: 'Rafi', email: 'rafi@example.com', subject: 'Hello', message: 'I would like to talk about a project.', locale: 'en', read: false, createdAt: serverTimestamp(), ...over });

describe('public visitors', () => {
  test('can read published projects and posts, but not drafts', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'projects/live-one')));
    await assertFails(getDoc(doc(anon(), 'projects/hidden-one')));
    await assertSucceeds(getDoc(doc(anon(), 'blogPosts/p1')));
    await assertFails(getDoc(doc(anon(), 'blogPosts/p2')));
    await assertSucceeds(getDocs(query(collection(anon(), 'projects'), where('status', '==', 'published'))));
    await assertFails(getDocs(collection(anon(), 'projects')));
    await assertFails(getDocs(collection(anon(), 'blogPosts')));
  });
  test('can never write content', async () => {
    await assertFails(setDoc(doc(anon(), 'projects/x'), project('x', 'published')));
    await assertFails(updateDoc(doc(anon(), 'projects/live-one'), { status: 'draft' }));
    await assertFails(deleteDoc(doc(anon(), 'projects/live-one')));
    await assertFails(setDoc(doc(anon(), 'siteSettings/main'), { defaultTheme: 'ember' }));
    await assertFails(setDoc(doc(anon(), 'blogCategories/x'), { slug: 'x', name: { en: 'X' } }));
    await assertFails(setDoc(doc(anon(), 'media/m1'), { url: 'x' }));
    await assertFails(addDoc(collection(anon(), 'activityLogs'), { actorId: 'x' }));
  });
  test('can read settings and taxonomies', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'siteSettings/main')));
    await assertSucceeds(getDocs(collection(anon(), 'blogCategories')));
  });
  test('may bump a published post view counter by exactly one — and nothing else', async () => {
    await assertSucceeds(updateDoc(doc(anon(), 'blogPosts/p1'), { views: increment(1) }));
    await assertFails(updateDoc(doc(anon(), 'blogPosts/p1'), { views: increment(5) }));
    await assertFails(updateDoc(doc(anon(), 'blogPosts/p1'), { views: increment(1), title: { en: 'hacked' } }));
    await assertFails(updateDoc(doc(anon(), 'blogPosts/p2'), { views: increment(1) }));
  });
});

describe('contact messages', () => {
  test('a well-formed message can be created by anyone', async () => {
    await assertSucceeds(addDoc(collection(anon(), 'contactMessages'), message()));
  });
  test('malformed messages are refused', async () => {
    for (const bad of [{ message: 'short' }, { email: 'nope' }, { name: 'R' }, { read: true }, { locale: 'fr' }, { createdAt: Timestamp.fromMillis(1) }, { extra: 'field' }, { message: 'x'.repeat(4001) }])
      await assertFails(addDoc(collection(anon(), 'contactMessages'), message(bad)));
  });
  test('only admins can read, mark as read or delete', async () => {
    const id = (await addDoc(collection(anon(), 'contactMessages'), message())).id;
    await assertFails(getDoc(doc(anon(), `contactMessages/${id}`)));
    await assertFails(getDoc(doc(user(), `contactMessages/${id}`)));
    await assertSucceeds(getDoc(doc(admin(), `contactMessages/${id}`)));
    await assertSucceeds(updateDoc(doc(admin(), `contactMessages/${id}`), { read: true }));
    await assertFails(updateDoc(doc(admin(), `contactMessages/${id}`), { message: 'edited by admin' }));
    await assertSucceeds(deleteDoc(doc(admin(), `contactMessages/${id}`)));
  });
});

describe('signed-in non-admins', () => {
  test('have no extra powers', async () => {
    await assertFails(setDoc(doc(user(), 'projects/x'), project('x', 'published')));
    await assertFails(updateDoc(doc(user(), 'blogPosts/p1'), { title: { en: 'x' } }));
    await assertFails(setDoc(doc(user(), 'adminProfiles/user1'), { role: 'admin' }));
    await assertFails(getDoc(doc(user(), 'adminProfiles/admin1')));
    await assertSucceeds(getDoc(doc(user(), 'adminProfiles/user1'))); // may look up their own (missing) profile
  });
});

describe('admins', () => {
  test('can manage projects, but only valid ones', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'projects/new-one'), project('new-one', 'published')));
    await assertSucceeds(updateDoc(doc(admin(), 'projects/new-one'), { status: 'draft' }));
    await assertFails(setDoc(doc(admin(), 'projects/bad-url'), { ...project('bad-url', 'published'), url: 'http://insecure.example' }));
    await assertFails(setDoc(doc(admin(), 'projects/one'), project('another', 'published')));
    await assertFails(updateDoc(doc(admin(), 'projects/live-one'), { slug: 'renamed' }));
    await assertSucceeds(deleteDoc(doc(admin(), 'projects/new-one')));
  });
  test('can manage posts, but a published post needs a publish time', async () => {
    await assertSucceeds(addDoc(collection(admin(), 'blogPosts'), post('fresh', 'draft')));
    await assertSucceeds(addDoc(collection(admin(), 'blogPosts'), post('fresh-two', 'published')));
    await assertFails(addDoc(collection(admin(), 'blogPosts'), { ...post('x', 'published'), publishedAt: null }));
    await assertFails(addDoc(collection(admin(), 'blogPosts'), post('Bad Slug', 'draft')));
    await assertSucceeds(setDoc(doc(admin(), 'blogPosts/p1/revisions/r1'), { savedAt: Timestamp.now() }));
    await assertFails(setDoc(doc(anon(), 'blogPosts/p1/revisions/r2'), { savedAt: Timestamp.now() }));
  });
  test('can edit settings and taxonomies', async () => {
    await assertSucceeds(setDoc(doc(admin(), 'siteSettings/main'), { defaultTheme: 'ember' }));
    await assertSucceeds(setDoc(doc(admin(), 'blogCategories/web'), { slug: 'web', name: { en: 'Web' } }));
    await assertFails(setDoc(doc(admin(), 'blogCategories/web'), { slug: 'other', name: { en: 'Web' } }));
  });
  test('the activity log is append-only', async () => {
    const col = collection(admin(), 'activityLogs');
    const r = await assertSucceeds(addDoc(col, { actorId: 'admin1', action: 'x', createdAt: serverTimestamp() }));
    await assertFails(addDoc(col, { actorId: 'someone-else', action: 'x', createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(admin(), `activityLogs/${r.id}`), { action: 'y' }));
    await assertFails(deleteDoc(doc(admin(), `activityLogs/${r.id}`)));
  });
  test('cannot delete their own admin profile', async () => {
    await assertFails(deleteDoc(doc(admin(), 'adminProfiles/admin1')));
  });
});

describe('storage', () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const st = (ctx) => ctx.storage();
  test('only admins upload images (png/jpeg/webp/avif/gif, under 5 MB, under /media)', async () => {
    const adminCtx = env.authenticatedContext('admin1');
    await assertSucceeds(uploadBytes(ref(st(adminCtx), 'media/2026/11/a.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(st(env.authenticatedContext('user1')), 'media/2026/11/b.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(st(env.unauthenticatedContext()), 'media/2026/11/c.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(st(adminCtx), 'media/2026/11/d.svg'), png, { contentType: 'image/svg+xml' }));
    await assertFails(uploadBytes(ref(st(adminCtx), 'media/2026/11/e.html'), png, { contentType: 'text/html' }));
    await assertFails(uploadBytes(ref(st(adminCtx), 'media/2026/11/big.png'), new Uint8Array(5 * 1024 * 1024 + 1), { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(st(adminCtx), 'elsewhere/a.png'), png, { contentType: 'image/png' }));
  });
  test('uploaded images are publicly readable', async () => {
    await assertSucceeds(uploadBytes(ref(st(env.authenticatedContext('admin1')), 'media/2026/11/r.png'), png, { contentType: 'image/png' }));
    await assertSucceeds(getBytes(ref(st(env.unauthenticatedContext()), 'media/2026/11/r.png')));
  });
});
