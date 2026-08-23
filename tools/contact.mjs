#!/usr/bin/env node
// Tiles a run of screen captures into one sheet, so the opening of the game can
// be read as a strip in the order a player meets it.
//
//   node tools/contact.mjs dir out.png [cols] [scale] [first] [count]
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const [dir, out, COLS = 5, SCALE = 1, FIRST = 1, COUNT = 40, PREFIX = 'story-']
  = process.argv.slice(2);
const cols = Number(COLS), scale = Number(SCALE);

const names = (await readdir(dir)).filter((n) => n.startsWith(PREFIX) && n.endsWith('.ppm'))
  .sort().slice(Number(FIRST) - 1, Number(FIRST) - 1 + Number(COUNT));
if (!names.length) { console.error('no frames'); process.exit(1); }

const frames = [];
for (const n of names) {
  const buf = await readFile(join(dir, n));
  const m = buf.subarray(0, 32).toString('ascii').match(/^P6\s+(\d+)\s+(\d+)\s+255\s/);
  frames.push({ w: +m[1], h: +m[2], rgb: buf.subarray(m[0].length), label: n });
}
const fw = frames[0].w, fh = frames[0].h, pad = 2;
const rows = Math.ceil(frames.length / cols);
const W = cols * (fw * scale + pad) + pad, H = rows * (fh * scale + pad) + pad;
const px = Buffer.alloc(W * H * 3, 0x14);
for (let i = 0; i < frames.length; i++) {
  const f = frames[i];
  const ox = pad + (i % cols) * (fw * scale + pad), oy = pad + Math.floor(i / cols) * (fh * scale + pad);
  for (let y = 0; y < fh * scale; y++) for (let x = 0; x < fw * scale; x++) {
    const s = (Math.floor(y / scale) * fw + Math.floor(x / scale)) * 3;
    const d = ((oy + y) * W + ox + x) * 3;
    px[d] = f.rgb[s]; px[d + 1] = f.rgb[s + 1]; px[d + 2] = f.rgb[s + 2];
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xFFFFFFFF; for (const v of b) c = crcTable[(c ^ v) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const b = Buffer.concat([Buffer.from(t, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(b)); return Buffer.concat([l, b, c]); };
const raw = Buffer.alloc(H * (W * 3 + 1));
let at = 0;
for (let y = 0; y < H; y++) { raw[at++] = 0; px.copy(raw, at, y * W * 3, (y + 1) * W * 3); at += W * 3; }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
await writeFile(out, Buffer.concat([Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
console.log(`${out}: ${frames.length} frames, ${W}x${H}`);
