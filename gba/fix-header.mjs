#!/usr/bin/env node
// The BIOS refuses a cartridge whose header does not check out: the 156-byte
// Nintendo logo has to be byte-perfect and the complement at 0xBD has to close
// the sum over 0xA0..0xBC. Linking cannot know that byte, so it is patched here.
import { readFile, writeFile } from 'node:fs/promises';

const path = process.argv[2];
const rom = await readFile(path);

if (rom.length < 0xC0) throw new Error('too short to be a cartridge');

let sum = 0;
for (let i = 0xA0; i <= 0xBC; i++) sum += rom[i];
rom[0xBD] = (-(0x19 + sum)) & 0xFF;

// A cartridge is read in 2^n-sized chunks; pad so no emulator reads past the end.
let size = 512;
while (size < rom.length) size *= 2;
const out = Buffer.alloc(size, 0);
rom.copy(out);

await writeFile(path, out);

const title = out.toString('ascii', 0xA0, 0xAC).replace(/\0/g, '');
console.log(`${path}: ${(out.length / 1024).toFixed(0)} KB, title "${title}", `
  + `complement 0x${out[0xBD].toString(16).padStart(2, '0')}, `
  + `fixed byte 0x${out[0xB2].toString(16)}`);
