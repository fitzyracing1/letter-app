#!/usr/bin/env node
/*
 * Rebuilds the static site from letters.log (W3C Extended Log File Format).
 *   node scripts/build.js                 regenerate letters/*.html, letters/index.html, sitemap.xml, robots.txt
 *   node scripts/build.js --add x.log     merge entries from an exported log into letters.log first, then rebuild
 *   node scripts/build.js --check         parse letters.log and report errors only (non-zero exit on errors)
 * Config: site.config.json (baseUrl must be the public GitHub Pages URL, ending in /).
 * No dependencies (Node 16+).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const LL = require('../lib/letterlog.js');

const ROOT = path.resolve(__dirname, '..');
const LOG = path.join(ROOT, 'letters.log');
const OUT = path.join(ROOT, 'letters');
const args = process.argv.slice(2);

const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
if (process.env.SITE_BASE_URL) site.baseUrl = process.env.SITE_BASE_URL; // e.g. set by the Pages workflow
if (!/\/$/.test(site.baseUrl)) site.baseUrl += '/';

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
let parsed = LL.parseLog(read(LOG));
parsed.errors.forEach((e) => console.warn('letters.log ' + e));

if (args.includes('--check')) {
  console.log(`${parsed.letters.length} letters, ${parsed.errors.length} errors`);
  process.exit(parsed.errors.length ? 1 : 0);
}

for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--add') continue;
  const f = args[++i];
  if (!f) { console.error('--add needs a file'); process.exit(2); }
  // Concatenate so later entries with the same x-letter-id replace earlier ones.
  const merged = LL.parseLog(read(LOG) + '\n' + read(f));
  merged.errors.forEach((e) => console.warn('merge ' + e));
  fs.writeFileSync(LOG, LL.serializeLog(merged.letters));
  console.log(`merged ${f} -> letters.log (${merged.letters.length} letters)`);
  parsed = merged;
}

const letters = parsed.letters;
fs.mkdirSync(OUT, { recursive: true });

// Remove generated letter pages that are no longer in the log (only files we generated).
const keep = new Set(letters.map((L) => L.id + '.html').concat(['index.html']));
for (const f of fs.readdirSync(OUT)) {
  if (!f.endsWith('.html') || keep.has(f)) continue;
  const p = path.join(OUT, f);
  if (read(p).includes('name="generator" content="' + LL.SOFTWARE + '"')) { fs.unlinkSync(p); console.log('removed stale ' + f); }
}

for (const L of letters) fs.writeFileSync(path.join(OUT, L.id + '.html'), LL.renderLetterPage(L, site));
fs.writeFileSync(path.join(OUT, 'index.html'), LL.renderIndex(letters, site));
fs.writeFileSync(path.join(OUT, 'letter.css'), LL.LETTER_CSS);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), LL.renderSitemap(letters, site));
fs.writeFileSync(path.join(ROOT, 'robots.txt'), LL.renderRobots(site));
console.log(`built ${letters.length} letter pages + letters/index.html, sitemap.xml, robots.txt for ${site.baseUrl}`);
