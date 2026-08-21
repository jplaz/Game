#!/usr/bin/env node
// Renders the game's tiles and people large, in one sheet, so the art can be
// looked at rather than guessed at.
//
//   node tools/tilesheet.mjs [out.png] [scale]

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = resolve(process.cwd());
const OUT = process.argv[2] ?? 'tools/tilesheet.png';
const SCALE = Number(process.argv[3] ?? 4);

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

/* Each row is a patch of one thing, drawn the way the map would draw it, so a
   forest is looked at as a forest and not as one tile in isolation. */
const PATCHES = [
  { label: 'grass',      chars: '................', ground: 'grass', w: 8, h: 2 },
  { label: 'tall grass', chars: ',,,,,,,,,,,,,,,,', ground: 'grass', w: 8, h: 2 },
  { label: 'flowers',    chars: '****************', ground: 'grass', w: 8, h: 2 },
  { label: 'wood',       chars: '################', ground: 'grass', w: 8, h: 2 },
  { label: 'lone trees', rows: ['.#..#..#', '....#..#'], ground: 'grass' },
  { label: 'pine',       chars: 'PPPPPPPPPPPPPPPP', ground: 'snow',  w: 8, h: 2 },
  { label: 'lone pines', rows: ['.P..P..P', '....P..P'], ground: 'snow' },
  { label: 'weirwood',   rows: ['.W...W..', '....W..W'], ground: 'snow' },
  { label: 'snow',       chars: 'SSSSSSSSSSSSSSSS', ground: 'snow',  w: 8, h: 2 },
  { label: 'snow grass', chars: ';;;;;;;;;;;;;;;;', ground: 'snow',  w: 8, h: 2 },
  { label: 'road',       chars: '----------------', ground: 'grass', w: 8, h: 2 },
  { label: 'water',      chars: '~~~~~~~~~~~~~~~~', ground: 'grass', w: 8, h: 2 },
  { label: 'roof',       chars: 'rrrrRRRRrrrrRRRR', ground: 'grass', w: 8, h: 2 },
  { label: 'wall',       chars: 'HwHDHwHDHwHDHwHD', ground: 'grass', w: 8, h: 2 },
  { label: 'castle',     chars: 'MMMMvvvvMMMMvvvv', ground: 'snow',  w: 8, h: 2 },
  { label: 'cliff',      chars: 'CCCCCCCCCCCCCCCC', ground: 'grass', w: 8, h: 2 },
];

const shot = await page.evaluate(async ({ patches, scale }) => {
  const tiles = await import('/src/art/tiles.js');
  const actors = await import('/src/art/actors.js');
  const pixels = await import('/src/art/pixels.js');
  const { TILE, tileCanvas, TILE_GROUP, N, E, S, W } = tiles;

  const rows = patches.length;
  const cols = 8;
  const cast = ['hero', 'stark', 'nightswatch', 'wildling', 'maester', 'goodwife',
    'child', 'sellsword', 'ironborn', 'guard'];

  const W_PX = cols * TILE + 8;
  const H_PX = rows * 2 * TILE + 8 + 2 * actors.ACTOR_H + 8;
  const c = document.createElement('canvas');
  c.width = W_PX; c.height = H_PX;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#101018';
  g.fillRect(0, 0, W_PX, H_PX);

  patches.forEach((patch, row) => {
    const grid = patch.rows
      ? patch.rows.map((r) => r.padEnd(cols, '.').slice(0, cols))
      : [patch.chars.slice(0, cols), patch.chars.slice(0, cols)];
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
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < cols; x++) {
        const char = at(x, y);
        g.drawImage(tileCanvas(char, 0, mask(char, x, y), patch.ground, pixels.variantFor(x, y, 4)),
          4 + x * TILE, 4 + row * 2 * TILE + y * TILE);
      }
    }
  });

  // The cast, standing on the grass they will be seen on.
  const baseY = 4 + rows * 2 * TILE + 8;
  for (let x = 0; x < cols + 1; x++) {
    for (let y = 0; y < 2; y++) {
      g.drawImage(tileCanvas('.', 0, 15, 'grass', 0), 4 + x * TILE, baseY + y * TILE);
    }
  }
  cast.slice(0, cols).forEach((who, i) => {
    actors.drawActor(g, who, i % 2 ? 'down' : 'right', i % 4, 4 + i * TILE, baseY);
  });

  const data = g.getImageData(0, 0, W_PX, H_PX).data;
  return { w: W_PX, h: H_PX, rgba: Array.from(data) };
}, { patches: PATCHES, scale: SCALE });

await browser.close();
server.close();

// --- PNG -------------------------------------------------------------------
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
let at = 0;
for (let y = 0; y < h; y++) {
  raw[at++] = 0;
  const sy = Math.floor(y / SCALE);
  for (let x = 0; x < w; x++) {
    const from = (sy * shot.w + Math.floor(x / SCALE)) * 4;
    raw[at++] = shot.rgba[from];
    raw[at++] = shot.rgba[from + 1];
    raw[at++] = shot.rgba[from + 2];
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
ihdr[8] = 8; ihdr[9] = 2;
await writeFile(OUT, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]));
console.log(`${OUT} — ${PATCHES.map((p) => p.label).join(', ')}, then the cast`);
