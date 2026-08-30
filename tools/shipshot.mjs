#!/usr/bin/env node
// Draws the four hulls, both facings, on open water.
//
//   node tools/shipshot.mjs out.png [scale]

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const ROOT = resolve(process.cwd());
const OUT = process.argv[2] ?? 'tools/shipshot.png';
const SCALE = Number(process.argv[3] ?? 6);

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

const shot = await page.evaluate(async () => {
  const { shipSprite, SHIP_IDS, SHIP_SIZE } = await import('/src/art/ship.js');
  const tiles = await import('/src/art/tiles.js');
  const S = SHIP_SIZE;
  const c = document.createElement('canvas');
  c.width = SHIP_IDS.length * S; c.height = S * 2;
  const g = c.getContext('2d', { willReadFrequently: true });
  // Water underneath, so the hulls are judged where they will be seen.
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < SHIP_IDS.length * 2; x++) {
      g.drawImage(tiles.tileCanvas('~', 0, 15, 'stone', 0), x * 16, y * 16);
    }
  }
  SHIP_IDS.forEach((id, i) => {
    g.drawImage(shipSprite(id, 'up'), i * S, 0);
    g.drawImage(shipSprite(id, 'left'), i * S, S);
  });
  const d = g.getImageData(0, 0, c.width, c.height).data;
  return { w: c.width, h: c.height, rgba: Array.from(d), ids: SHIP_IDS };
});
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
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const w = shot.w * SCALE, h = shot.h * SCALE;
const raw = Buffer.alloc(h * (w * 3 + 1));
let p = 0;
for (let y = 0; y < h; y++) {
  raw[p++] = 0;
  const sy = (y / SCALE) | 0;
  for (let x = 0; x < w; x++) {
    const i = (sy * shot.w + ((x / SCALE) | 0)) * 4;
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
console.log(`${shot.ids.join(', ')} -> ${OUT}`);
