#!/usr/bin/env node
// Renders a named map straight out of src/data/maps.js, so a town can be looked
// at whole rather than a screen at a time through an emulator.
//
//   node tools/mapshot.mjs out.png mapId [scale] [x y w h]
//
// With no window given it draws the entire map. The window is in tiles, so
// `... winterfell 6 18 24 14 14` is the south grounds at six times size.

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = resolve(process.cwd());
const OUT = process.argv[2] ?? 'tools/mapshot.png';
const MAP_ID = process.argv[3];
const SCALE = Number(process.argv[4] ?? 6);
const WINDOW = process.argv.slice(5).map(Number);

if (!MAP_ID) {
  console.error('usage: node tools/mapshot.mjs out.png mapId [scale] [x y w h]');
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

const shot = await page.evaluate(async ({ mapId, win }) => {
  const tiles = await import('/src/art/tiles.js');
  const pixels = await import('/src/art/pixels.js');
  const { MAPS } = await import('/src/data/maps.js');
  const { TILE, tileCanvas, TILE_GROUP, N, E, S, W } = tiles;

  const map = MAPS[mapId];
  if (!map) return { error: `no map "${mapId}". Try one of: ${Object.keys(MAPS).slice(0, 40).join(', ')}` };

  // The whole map is the collision truth; the window is only what gets drawn,
  // so autotiling at the window's edge still reads its real neighbours.
  const full = map.tiles;
  const fullCols = Math.max(...full.map((r) => r.length));
  const grid = full.map((r) => r.padEnd(fullCols, map.ground === 'snow' ? 'S' : '.'));
  const at = (x, y) => (grid[y] ?? '')[x] ?? (map.ground === 'snow' ? 'S' : '.');
  const mask = (char, x, y) => {
    const group = TILE_GROUP[char];
    if (!group) return 0;
    const outside = group !== 'forest';
    const same = (nx, ny) => (nx < 0 || ny < 0 || nx >= fullCols || ny >= grid.length)
      ? outside : TILE_GROUP[at(nx, ny)] === group;
    return (same(x, y - 1) ? N : 0) | (same(x + 1, y) ? E : 0)
         | (same(x, y + 1) ? S : 0) | (same(x - 1, y) ? W : 0);
  };

  const [wx, wy, ww, wh] = win.length === 4 ? win : [0, 0, fullCols, grid.length];
  const c = document.createElement('canvas');
  c.width = ww * TILE; c.height = wh * TILE;
  const g = c.getContext('2d', { willReadFrequently: true });
  const ground = map.ground ?? 'grass';
  for (let y = 0; y < wh; y++) {
    for (let x = 0; x < ww; x++) {
      const mx = wx + x, my = wy + y;
      const char = at(mx, my);
      g.drawImage(tileCanvas(char, 0, mask(char, mx, my), ground, pixels.variantFor(mx, my, 4)),
        x * TILE, y * TILE);
    }
  }
  const d = g.getImageData(0, 0, c.width, c.height).data;
  return { w: c.width, h: c.height, rgba: Array.from(d), name: map.name,
           size: `${fullCols}x${grid.length}` };
}, { mapId: MAP_ID, win: WINDOW });

await browser.close();
server.close();

if (shot.error) { console.error(shot.error); process.exit(1); }

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
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
await writeFile(OUT, png);
console.log(`${shot.name} (${shot.size} tiles) -> ${OUT} at ${w}x${h}`);
