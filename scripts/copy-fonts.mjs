// Copies the latin woff2 files we use out of the @fontsource packages into public/fonts/.
// Run with `npm run fonts` after installing or upgrading the font packages.
import fs from 'node:fs';
import path from 'node:path';

const FILES = [
  ['figtree', 'figtree-latin-800-normal.woff2', 'figtree-800.woff2'],
  ['bricolage-grotesque', 'bricolage-grotesque-latin-700-normal.woff2', 'bricolage-700.woff2'],
  ['bricolage-grotesque', 'bricolage-grotesque-latin-800-normal.woff2', 'bricolage-800.woff2'],
  ['ibm-plex-mono', 'ibm-plex-mono-latin-400-normal.woff2', 'plex-mono-400.woff2'],
];

fs.mkdirSync('public/fonts', { recursive: true });
for (const [pkg, from, to] of FILES) {
  fs.copyFileSync(path.join('node_modules', '@fontsource', pkg, 'files', from), path.join('public/fonts', to));
  console.log(`public/fonts/${to}`);
}
