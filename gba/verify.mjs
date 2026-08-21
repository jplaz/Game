#!/usr/bin/env node
// What a real Game Boy Advance checks before it will run a cartridge, checked
// here so a bad build is caught on this machine rather than on a handset.
import { readFile } from 'node:fs/promises';

const LOGO = Buffer.from(
  '24ffae51699aa2213d84820a84e409ad11248b98c0817f21a352be199309ce20'
+ '10464a4af82731ec58c7e83382e3cebf85f4df94ce4b09c194568ac01372a7fc'
+ '9f844d73a3ca9a615897a327fc039876231dc7610304ae56bf38840040a70efd'
+ 'ff52fe036f9530f197fbc08560d68025a963be03014e38e2f9a234ffbb3e0344'
+ '780090cb88113a9465c07c6387f03cafd625e48b380aac7221d4f807', 'hex');

const path = process.argv[2] ?? 'gba/thronebound.gba';
const rom = await readFile(path);
const problems = [];
const notes = [];

if (rom.length < 0xC0) problems.push('shorter than a cartridge header');
if ((rom[3] & 0xFE) !== 0xEA) problems.push('entry point is not an ARM branch');
if (!rom.subarray(0x04, 0xA0).equals(LOGO)) problems.push('boot logo does not match');
if (rom[0xB2] !== 0x96) problems.push(`fixed byte is 0x${rom[0xB2].toString(16)}, must be 0x96`);

let sum = 0;
for (let i = 0xA0; i <= 0xBC; i++) sum += rom[i];
const wanted = (-(0x19 + sum)) & 0xFF;
if (rom[0xBD] !== wanted) problems.push(`header complement is 0x${rom[0xBD].toString(16)}, must be 0x${wanted.toString(16)}`);

if ((rom.length & (rom.length - 1)) !== 0) problems.push('size is not a power of two');
if (rom.length > 32 * 1024 * 1024) problems.push('larger than the cartridge bus can address');

notes.push(`title      ${JSON.stringify(rom.toString('ascii', 0xA0, 0xAC).replace(/\0/g, ''))}`);
notes.push(`game code  ${rom.toString('ascii', 0xAC, 0xB0)}`);
notes.push(`size       ${(rom.length / 1024).toFixed(0)} KB`);
notes.push(`complement 0x${rom[0xBD].toString(16).padStart(2, '0')}`);

console.log(notes.map((n) => `  ${n}`).join('\n'));
if (problems.length) {
  console.log('\nNOT A VALID CARTRIDGE:');
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\n  header valid: this is a bootable GBA ROM image.');
