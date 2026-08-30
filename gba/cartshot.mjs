#!/usr/bin/env node
// Draws a map out of data.h — the cartridge's own tiles through the
// cartridge's own palette — rather than out of the browser game it was made
// from.
//
//   node gba/cartshot.mjs out.png "Dragonstone" [scale]
//
// mapshot answers "what did I draw"; this answers "what does the console
// actually show", and they are not the same question. The background palette
// is two hundred and thirty-nine colours shared by every map on the cartridge
// and it has been full for a long time: a colour that does not win a slot is
// snapped to the nearest one that did, so anything drawn in a shade the rest
// of the world does not use arrives changed and nothing in the browser build
// can see it happen. Every visual check in this project until now has looked
// at the source and not at the cartridge.

import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2];
const WANT = process.argv[3];
const SCALE = Number(process.argv[4] ?? 6);
if (!OUT || !WANT) {
  console.error('usage: node gba/cartshot.mjs out.png "Map Name" [scale]');
  process.exit(1);
}

const src = await readFile(resolve(HERE, 'data.h'), 'utf8');

/** Pulls the numbers out of one `... name[...] = { ... };` table. */
function table(name) {
  const at = src.indexOf(`${name}[`);
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  const shut = src.indexOf('};', open);
  const body = src.slice(open + 1, shut);
  const out = [];
  for (const m of body.matchAll(/0x[0-9a-fA-F]+|\b\d+\b/g)) out.push(Number(m[0]));
  return { values: out, decl: src.slice(at, open) };
}

const pal = table('bg_pal');
if (!pal) { console.error('no bg_pal in data.h — has the export run?'); process.exit(1); }

// Which map. The exporter writes a `/* ---- Name ---- */` banner over each.
const banners = [...src.matchAll(/\/\* ---- (.*?) ---- \*\/\s*\nstatic const u32 tiles_(\d+)\[/g)]
  .map((m) => ({ name: m[1], at: Number(m[2]) }));
const hit = banners.find((b) => b.name.toLowerCase() === WANT.toLowerCase())
  ?? banners.find((b) => b.name.toLowerCase().includes(WANT.toLowerCase()));
if (!hit) {
  console.error(`no map called "${WANT}" on the cartridge. It knows:\n  `
    + banners.map((b) => b.name).join('\n  '));
  process.exit(1);
}

const tiles = table(`tiles_${hit.at}`);
const entries = table(`entries_${hit.at}`);
// The entries table is declared [height*2 * width*2], which is where the size
// of the map comes from — nothing else in the file says it in one place.
const dims = entries.decl.match(/\[(\d+) \* (\d+)\]/);
const rows = Number(dims[1]), cols = Number(dims[2]);
const W = cols * 8, H = rows * 8;

// 0xBGR555 to eight bits a channel, the way the hardware widens it.
const five = (v) => (v << 3) | (v >> 2);
const colour = (i) => {
  const c = pal.values[i] ?? 0;
  return [five(c & 31), five((c >> 5) & 31), five((c >> 10) & 31)];
};

// Each 8x8 tile is 64 index bytes packed four to a word, low byte first.
const pixelOf = (tile, x, y) => {
  const word = tiles.values[tile * 16 + ((y * 8 + x) >> 2)] ?? 0;
  return (word >>> (((y * 8 + x) & 3) * 8)) & 0xFF;
};

const rgb = Buffer.alloc(W * H * 3);
for (let ty = 0; ty < rows; ty++) {
  for (let tx = 0; tx < cols; tx++) {
    const tile = entries.values[ty * cols + tx] ?? 0;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const [r, g, b] = colour(pixelOf(tile, x, y));
        const p = ((ty * 8 + y) * W + tx * 8 + x) * 3;
        rgb[p] = r; rgb[p + 1] = g; rgb[p + 2] = b;
      }
    }
  }
}

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
const w = W * SCALE, h = H * SCALE;
const raw = Buffer.alloc(h * (w * 3 + 1));
let p = 0;
for (let y = 0; y < h; y++) {
  raw[p++] = 0;
  const sy = (y / SCALE) | 0;
  for (let x = 0; x < w; x++) {
    const i = (sy * W + ((x / SCALE) | 0)) * 3;
    raw[p++] = rgb[i]; raw[p++] = rgb[i + 1]; raw[p++] = rgb[i + 2];
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
console.log(`${hit.name} as the cartridge holds it `
  + `(${cols / 2}x${rows / 2} tiles, ${tiles.values.length / 16} in its bank) -> ${OUT}`);
