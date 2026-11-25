// Dumps the legacy (vanilla-JS) data modules to JSON so the Next.js app reuses the owner's exact copy.
// Usage: node tools/migrate-legacy-data.mjs <path-to-legacy-js/data> <out-dir>
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const [src = './js/data', out = './src/data/legacy'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const load = (f) => import(pathToFileURL(resolve(src, f)).href);
const toInline = (s) =>
  typeof s === 'string'
    ? s.replace(/<\/?strong>/g, '**').replace(/<span class="heart">♥<\/span>/g, '♥')
    : Array.isArray(s) ? s.map(toInline)
    : s && typeof s === 'object' ? Object.fromEntries(Object.entries(s).map(([k, v]) => [k, toInline(v)])) : s;
const dump = (name, data) => writeFileSync(resolve(out, name), JSON.stringify(data, null, 2) + '\n');

const content = await load('content.js');
dump('content.json', toInline({ site: content.SITE, content: content.CONTENT }));
dump('projects.json', (await load('projects.js')).projects);
const social = await load('social.js');
dump('social.json', social.socialLinks);
// keep only the SVG path data; the app renders icons as React components
dump('icon-paths.json', Object.fromEntries(Object.entries(social.ICONS).map(([k, v]) => [k, [...v.matchAll(/ d="([^"]+)"/g)].map((m) => m[1])])));
const ui = await load('ui.js');
dump('ui.json', ui.UI);
dump('scenes.json', (await load('scenes.js')).SCENES);
console.log('legacy data written to', out);
