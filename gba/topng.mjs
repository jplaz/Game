#!/usr/bin/env node
// PPM out of the host test -> PNG, so the frames can actually be looked at.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

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

function png(width, height, rgb, scale = 1) {
  const w = width * scale, h = height * scale;
  const raw = Buffer.alloc(h * (w * 3 + 1));
  let at = 0;
  for (let y = 0; y < h; y++) {
    raw[at++] = 0;
    const sy = Math.floor(y / scale);
    for (let x = 0; x < w; x++) {
      const sx = Math.floor(x / scale);
      const from = (sy * width + sx) * 3;
      raw[at++] = rgb[from]; raw[at++] = rgb[from + 1]; raw[at++] = rgb[from + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = process.argv[2] ?? 'gba/shots';
const scale = Number(process.argv[3] ?? 2);
for (const name of (await readdir(dir)).filter((n) => n.endsWith('.ppm'))) {
  const buf = await readFile(join(dir, name));
  // P6\n<w> <h>\n255\n
  const head = buf.subarray(0, 32).toString('ascii');
  const m = head.match(/^P6\s+(\d+)\s+(\d+)\s+255\s/);
  if (!m) throw new Error(`${name} is not the expected PPM`);
  const rgb = buf.subarray(m[0].length);
  await writeFile(join(dir, name.replace(/\.ppm$/, '.png')),
    png(Number(m[1]), Number(m[2]), rgb, scale));
}
console.log(`wrote PNGs into ${dir}`);
