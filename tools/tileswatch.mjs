#!/usr/bin/env node
// Draws a hand-typed patch of tiles, with no map behind it.
//
//   node tools/tileswatch.mjs out.png [ground] [scale] row row row ...
//
// e.g. node tools/tileswatch.mjs /tmp/s.png stone 8 'CCCC' '@@@@' '%%%%' 'oooo'
//
// mapshot answers "what does this place look like"; this answers "what does
// this tile look like", which is the question you actually have while choosing
// a palette. Autotiling sees the patch as the whole world, so a block of one
// character reads the same here as it will in the middle of a map.

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = resolve(process.cwd());
const OUT = process.argv[2] ?? 'tools/tileswatch.png';
const GROUND = process.argv[3] ?? 'grass';
const SCALE = Number(process.argv[4] ?? 8);
const ROWS = process.argv.slice(5);

if (!ROWS.length) {
  console.error('usage: node tools/tileswatch.mjs out.png [ground] [scale] row row ...');
  process.exit(1);
}

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

const shot = await page.evaluate(async ({ rows, ground }) => {
  const tiles = await import('/src/art/tiles.js');
  const pixels = await import('/src/art/pixels.js');
  const { TILE, tileCanvas, TILE_GROUP, N, E, S, W } = tiles;

  const cols = Math.max(...rows.map((r) => r.length));
  const grid = rows.map((r) => r.padEnd(cols, r[r.length - 1] ?? '.'));
  const at = (x, y) => (grid[y] ?? '')[x] ?? '.';
  const mask = (char, x, y) => {
    const group = TILE_GROUP[char];
    if (!group) return 0;
    const outside = group !== 'forest';
    const same = (nx, ny) => (nx < 0 || ny < 0 || nx >= cols || ny >= grid.length)
      ? outside : TILE_GROUP[at(nx, ny)] === group;
    return (same(x, y - 1) ? N : 0) | (same(x + 1, y) ? E : 0)
         | (same(x, y + 1) ? S : 0) | (same(x - 1, y) ? W : 0);
  };

  const c = document.createElement('canvas');
  c.width = cols * TILE; c.height = grid.length * TILE;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < cols; x++) {
      g.drawImage(tileCanvas(at(x, y), 0, mask(at(x, y), x, y), ground,
        pixels.variantFor(x, y, 4)), x * TILE, y * TILE);
    }
  }
  const d = g.getImageData(0, 0, c.width, c.height).data;
  return { w: c.width, h: c.height, rgba: Array.from(d) };
}, { rows: ROWS, ground: GROUND });

await browser.close();
server.close();

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const w = shot.w * SCALE, h = shot.h * SCALE;
const raw = Buffer.alloc(h * (w * 3 + 1));
let p = 0;
for (let y = 0; y < h; y++) {
  raw[p++] = 0;
  const sy = (y / SCALE) | 0;
  for (let x = 0; x < w; x++) {
    const sx = (x / SCALE) | 0;
    const i = (sy * shot.w + sx) * 4;
    raw[p++] = shot.rgba[i]; raw[p++] = shot.rgba[i + 1]; raw[p++] = shot.rgba[i + 2];
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
ihdr[8] = 8; ihdr[9] = 2;
await writeFile(OUT, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]));
console.log(`${ROWS.length} rows -> ${OUT} at ${w}x${h}`);
