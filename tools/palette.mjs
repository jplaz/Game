#!/usr/bin/env node
// How many colours a person costs.
//
// An appearance gets one palette of fifteen colours plus transparent on the
// hardware. Go over and the exporter merges the excess into their nearest
// neighbours, which is how a careful bit of shading turns into mud on a
// console and stays perfect in every preview drawn on this machine.
//
//   node tools/palette.mjs hero,guard,maester,...
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = resolve(process.cwd());
const WHO = (process.argv[2] ?? '').split(',').filter(Boolean);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const target = join(ROOT, normalize(path));
  if (!target.startsWith(ROOT)) return void res.writeHead(403).end();
  try {
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/gba/blank.html`);

const rows = await page.evaluate(async (who) => {
  const actors = await import('/src/art/actors.js');
  const names = who.length ? who : Object.keys(actors.ACTOR_PALETTES);
  const out = [];
  for (const name of names) {
    /* Every facing and every step, because the palette has to cover the whole
       sheet and not the one frame somebody happened to look at. */
    const seen = new Map();
    for (const dir of actors.DIRECTIONS) {
      for (let step = 0; step < 4; step++) {
        const c = actors.paintActorFrame(name, dir, step, false);
        const g = c.getContext('2d', { willReadFrequently: true });
        const d = g.getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          /* The console keeps five bits a channel, so two tones a hair apart
             cost one entry there and two here unless they are rounded first. */
          const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
      }
    }
    out.push({ name, colours: seen.size,
      rare: [...seen.entries()].filter(([, n]) => n <= 6).length });
  }
  return out;
}, WHO);

await browser.close();
server.close();

rows.sort((a, b) => b.colours - a.colours);
let over = 0;
for (const r of rows) {
  if (r.colours > 15) over++;
  console.log(`  ${String(r.colours).padStart(3)}  ${r.colours > 15 ? 'OVER ' : '     '}`
    + `${r.name}${r.rare ? `   (${r.rare} of them used six pixels or fewer)` : ''}`);
}
console.log(`\n  ${over} of ${rows.length} appearances are over the fifteen the hardware gives them.`);
