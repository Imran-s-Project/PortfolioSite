// Generates the raster brand assets (favicon sizes, Apple icon, PWA icons, Open Graph image) from the vector logo.
// Usage:  npm i -D sharp && node tools/make-brand-assets.mjs
// Optional: SITE_URL=https://your-domain node tools/make-brand-assets.mjs  — prints that address on the Open Graph card (none is hard-coded).
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';

// Logo geometry (64×64): an eight-pointed star — two squares, one turned 45° — the symbol of the original identity — with an "IA" monogram inside.
const STAR = ['M15 15H49V49H15Z', 'M32 7.96L56.04 32L32 56.04L7.96 32Z'];
const MONO = ['M22.25 23V41', 'M28.75 41L35.25 23L41.75 41', 'M30.8 35.5H39.7'];
const mark = (star, mono, sw = { s: 2.1, m: 3 }) =>
  `<g fill="none" stroke-linejoin="round" stroke-linecap="round">` +
  STAR.map((d) => `<path d="${d}" stroke="${star}" stroke-width="${sw.s}"/>`).join('') +
  MONO.map((d) => `<path d="${d}" stroke="${mono}" stroke-width="${sw.m}"/>`).join('') + `</g>`;

const svg = (inner, w = 64, h = 64, vb = '0 0 64 64') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${inner}</svg>`;
const DARK = { star: '#22d3ee', mono: '#e6eef2', bg: '#07090b' };
const LIGHT = { star: '#2563eb', mono: '#0f1722', bg: '#f3f6fa' };
const FONT = `font-family="Sora, Inter, 'Segoe UI', system-ui, sans-serif"`;
const siteHost = (process.env.SITE_URL ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

mkdirSync('public/logo', { recursive: true });
mkdirSync('public/icons', { recursive: true });
mkdirSync('public/og', { recursive: true });
writeFileSync('public/logo/mark-dark.svg', svg(mark(DARK.star, DARK.mono)));
writeFileSync('public/logo/mark-light.svg', svg(mark(LIGHT.star, LIGHT.mono)));
// Lock-ups use live text (Sora → system fallback). Outline the text in a vector editor before using them in print.
const lockup = (c) => svg(`<g transform="translate(0 4)">${mark(c.star, c.mono)}</g><text x="76" y="43" ${FONT} font-size="26" font-weight="650" letter-spacing="-0.6" fill="${c.mono}">Imran Ahmed</text>`, 296, 72, '0 0 296 72');
writeFileSync('public/logo/lockup-dark.svg', lockup(DARK));
writeFileSync('public/logo/lockup-light.svg', lockup(LIGHT));

// App icon: rounded tile (also used as the browser tab icon). Next.js serves src/app/icon.svg automatically.
const tile = (pad = 0) => svg(`<rect width="64" height="64" rx="14" fill="${DARK.bg}"/><g transform="translate(${32 - 32 * (1 - pad)} ${32 - 32 * (1 - pad)}) scale(${1 - pad})">${mark(DARK.star, DARK.mono)}</g>`);
writeFileSync('src/app/icon.svg', tile());
const png = (s, out, pad = 0, maskable = false) =>
  sharp(Buffer.from(maskable ? svg(`<rect width="64" height="64" fill="${DARK.bg}"/><g transform="translate(6.4 6.4) scale(0.8)">${mark(DARK.star, DARK.mono)}</g>`) : tile(pad)), { density: 512 })
    .resize(s, s).png().toFile(out);
await png(180, 'src/app/apple-icon.png', 0.04);
await png(192, 'public/icons/icon-192.png');
await png(512, 'public/icons/icon-512.png');
await png(512, 'public/icons/maskable-512.png', 0, true);

// Open Graph / social share card, 1200×630. Latin text only (no Bangla font is needed or assumed on the build machine).
const og = svg(`
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1115"/><stop offset="1" stop-color="#05070a"/></linearGradient>
    <radialGradient id="r" cx="0.82" cy="0.1" r="0.7"><stop offset="0" stop-color="#22d3ee" stop-opacity="0.26"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/><rect width="1200" height="630" fill="url(#r)"/>
  <g transform="translate(700 -40) scale(8.4)" opacity="0.22">${mark('#22d3ee', '#22d3ee', { s: 0.5, m: 0.7 })}</g>
  <g transform="translate(88 96) scale(2.4)">${mark(DARK.star, DARK.mono, { s: 2.1, m: 3 })}</g>
  <text x="88" y="372" ${FONT} font-size="104" font-weight="650" letter-spacing="-3" fill="#e6eef2">Imran Ahmed</text>
  <text x="92" y="440" ${FONT} font-size="38" font-weight="500" fill="#9db0ba">Web developer · PWAs · Firebase</text>
  <rect x="92" y="486" width="160" height="4" rx="2" fill="#22d3ee"/>
  ${siteHost ? `<text x="92" y="552" ${FONT} font-size="28" fill="#6f838e">${xmlEscape(siteHost)}</text>` : ''}`, 1200, 630, '0 0 1200 630');
await sharp(Buffer.from(og), { density: 144 }).resize(1200, 630).png({ compressionLevel: 9 }).toFile('public/og/og-default.png');
console.log('brand assets written');
