#!/usr/bin/env node
// Exports the browser game's own art and data into C, so the cartridge is drawn
// from the same source of truth rather than a hand-copied approximation that
// drifts. The tiles and the people are rendered by the real painters, in a real
// browser, and read back pixel for pixel — the ROM shows what the browser shows.
//
//   node gba/export.mjs   ->  gba/data.h

import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = resolve(process.cwd());

// Which of the fifty-five maps fit on a cartridge. They warp into each other,
// so this is a corner of the world you can actually walk around rather than a
// single screen.
const MAP_IDS = ['winterfell', 'heroHouse', 'greatKeep', 'wolfswood', 'winterfellForge'];
const PLAYER_SPRITE = 'hero';

// ------------------------------------------------------------ the server ---

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
const PORT = server.address().port;

// ------------------------------------------------------------ the browser --

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/gba/blank.html`);

const harvest = await page.evaluate(async ({ mapIds, playerSprite }) => {
  const tiles = await import('/src/art/tiles.js');
  const actors = await import('/src/art/actors.js');
  const pixels = await import('/src/art/pixels.js');
  const { MAPS } = await import('/src/data/maps.js');
  const { DUELLISTS } = await import('/src/data/duellists.js');

  const { TILE, tileCanvas, tileDef, isSolid, TILE_GROUP, N, E, S, W } = tiles;

  /** Reads a canvas back as a flat RGBA array. */
  function read(canvas) {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(canvas, 0, 0);
    return Array.from(g.getImageData(0, 0, c.width, c.height).data);
  }

  // The overworld's own neighbour rule, so autotiled edges match the browser.
  function maskFor(map, char, x, y) {
    const group = TILE_GROUP[char];
    if (!group) return 0;
    const outsideMatches = group !== 'forest';
    const at = (nx, ny) => (map.grid[ny] ?? '')[nx] ?? '.';
    const same = (nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) return outsideMatches;
      return TILE_GROUP[at(nx, ny)] === group;
    };
    return (same(x, y - 1) ? N : 0) | (same(x + 1, y) ? E : 0)
         | (same(x, y + 1) ? S : 0) | (same(x - 1, y) ? W : 0);
  }

  const out = { maps: [], sprites: [], tile: TILE };
  const spriteIndex = new Map();

  function spriteSlot(who, dir) {
    const key = `${who}:${dir}`;
    if (spriteIndex.has(key)) return spriteIndex.get(key);
    const slot = out.sprites.length;
    spriteIndex.set(key, slot);
    out.sprites.push({ who, dir, w: actors.ACTOR_W, h: actors.ACTOR_H,
      rgba: read(actors.paintActorFrame(who, dir, 0)) });
    return slot;
  }

  // The player animates, so all four facings and all four walk steps.
  const playerFrames = [];
  for (const dir of actors.DIRECTIONS) {
    for (let step = 0; step < 4; step++) {
      playerFrames.push(out.sprites.length);
      out.sprites.push({ who: playerSprite, dir, step, w: actors.ACTOR_W, h: actors.ACTOR_H,
        rgba: read(actors.paintActorFrame(playerSprite, dir, step)) });
    }
  }
  out.playerFrames = playerFrames;

  for (const id of mapIds) {
    const map = MAPS[id];
    const width = map.width ?? map.tiles[0].length;
    const height = map.height ?? map.tiles.length;
    const grid = map.grid ?? map.tiles;
    const cells = [];
    const solid = [];
    for (let y = 0; y < height; y++) {
      const solidRow = [];
      for (let x = 0; x < width; x++) {
        const char = grid[y][x] ?? '.';
        const canvas = tileCanvas(char, 0, maskFor({ grid, width, height }, char, x, y),
          map.ground ?? 'grass', pixels.variantFor(x, y, 4));
        cells.push(read(canvas));
        solidRow.push(isSolid(char) ? 1 : 0);
      }
      solid.push(solidRow);
    }

    out.maps.push({
      id, name: map.name, width, height, cells, solid,
      warps: (map.warps ?? []).map((w) => ({ ...w })),
      signs: (map.signs ?? []).map((s) => ({ x: s.x, y: s.y, text: s.text })),
      npcs: (map.npcs ?? []).map((n) => ({
        x: n.x, y: n.y, name: n.name ?? '', script: n.script ?? '',
        // A duel's opening line is authored on the duellist, not in the script,
        // so take it from there rather than guessing at the script's branches.
        said: n.script === 'duel' && DUELLISTS[n.data?.duel]
          ? DUELLISTS[n.data.duel].intro : null,
        slot: spriteSlot(n.sprite ?? 'smallfolk', n.dir ?? 'down'),
      })),
    });
  }
  return out;
}, { mapIds: MAP_IDS, playerSprite: PLAYER_SPRITE });

// The font is compiled inside font.js; re-read it through the same module.
const fontData = await page.evaluate(async (chars) => {
  const font = await import('/src/engine/font.js');
  return chars.map((char) => {
    const hits = [];
    font.drawText({ fillStyle: '', fillRect(x, y) { hits.push([x, y]); } }, char, 0, 0, { shadow: null });
    const rows = new Array(10).fill(0);
    for (const [x, y] of hits) if (y >= 0 && y < 10 && x >= 0 && x < 16) rows[y] |= 1 << x;
    return { rows, advance: font.charWidth(char) };
  });
}, [...' !\'",-.0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZ[]abcdefghijklmnopqrstuvwxyz']);

await browser.close();
server.close();

// ------------------------------------------------------------- packing -----
// Everything below turns RGBA into the shapes GBA hardware actually reads:
// BGR555 palettes, 8bpp 8x8 character tiles, and a screen map of indices.

const bgr555 = (r, g, b) => ((b >> 3) << 10) | ((g >> 3) << 5) | (r >> 3);

/** Builds a <=255 colour palette (index 0 reserved for transparent). */
function buildPalette(sources) {
  const counts = new Map();
  for (const rgba of sources) {
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] < 128) continue;
      const c = bgr555(rgba[i], rgba[i + 1], rgba[i + 2]);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const palette = ordered.slice(0, 255);
  const lookup = new Map(palette.map((c, i) => [c, i + 1]));
  // Anything that did not make the cut snaps to its nearest neighbour, which on
  // art this flat is visually the same colour.
  for (const c of ordered.slice(255)) {
    let best = 0, bestD = Infinity;
    const r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i];
      const d = ((p & 31) - r) ** 2 + (((p >> 5) & 31) - g) ** 2 + (((p >> 10) & 31) - b) ** 2;
      if (d < bestD) { bestD = d; best = i + 1; }
    }
    lookup.set(c, best);
  }
  return { palette, lookup };
}

/** RGBA image -> palette indices, one byte per pixel. */
function indexify(rgba, lookup) {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    if (rgba[i + 3] < 128) { out[p] = 0; continue; }
    out[p] = lookup.get(bgr555(rgba[i], rgba[i + 1], rgba[i + 2])) ?? 0;
  }
  return out;
}

/** Cuts an indexed image into 8x8 character tiles, row-major. */
function cut8(indexed, w, h) {
  const tiles = [];
  for (let ty = 0; ty < h / 8; ty++) {
    for (let tx = 0; tx < w / 8; tx++) {
      const tile = new Uint8Array(64);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) tile[y * 8 + x] = indexed[(ty * 8 + y) * w + tx * 8 + x];
      }
      tiles.push(tile);
    }
  }
  return tiles;
}

// --- backgrounds ------------------------------------------------------------

const allCells = harvest.maps.flatMap((m) => m.cells);
const bg = buildPalette(allCells);

const bank = [];                       // unique 8x8 tiles
const bankIndex = new Map();
bank.push(new Uint8Array(64));         // tile 0 is blank, for anything off-map
bankIndex.set(bank[0].join(','), 0);

function intern(tile) {
  const key = tile.join(',');
  let at = bankIndex.get(key);
  if (at === undefined) { at = bank.length; bank.push(tile); bankIndex.set(key, at); }
  return at;
}

for (const map of harvest.maps) {
  map.entries = [];                    // [ty][tx] -> bank index, in 8x8 tiles
  for (let y = 0; y < map.height * 2; y++) map.entries.push(new Array(map.width * 2).fill(0));
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const quad = cut8(indexify(map.cells[y * map.width + x], bg.lookup), 16, 16);
      map.entries[y * 2][x * 2] = intern(quad[0]);
      map.entries[y * 2][x * 2 + 1] = intern(quad[1]);
      map.entries[y * 2 + 1][x * 2] = intern(quad[2]);
      map.entries[y * 2 + 1][x * 2 + 1] = intern(quad[3]);
    }
  }
  delete map.cells;
}

if (bank.length > 512) throw new Error(`${bank.length} background tiles; the cartridge holds 512`);

// --- people -----------------------------------------------------------------

const obj = buildPalette(harvest.sprites.map((s) => s.rgba));
const objTiles = [];                   // 8bpp, 1D mapped: 2 wide x 4 tall per frame
for (const sprite of harvest.sprites) {
  const quad = cut8(indexify(sprite.rgba, obj.lookup), sprite.w, sprite.h);
  objTiles.push(...quad);              // already row-major, which is 1D order
}

// --- writing it out ---------------------------------------------------------

const hex = (n) => `0x${(n >>> 0).toString(16)}`;

/** 64 index bytes -> 16 little-endian words, which is how VRAM wants them. */
function tileWords(tile) {
  const words = [];
  for (let i = 0; i < 64; i += 4) {
    words.push((tile[i] | (tile[i + 1] << 8) | (tile[i + 2] << 16) | (tile[i + 3] << 24)) >>> 0);
  }
  return words;
}

/** Wraps a long list of numbers so the header stays readable. */
function block(values, perLine = 12) {
  const lines = [];
  for (let i = 0; i < values.length; i += perLine) {
    lines.push('  ' + values.slice(i, i + perLine).join(', ') + ',');
  }
  return lines.join('\n');
}

const L = [];
L.push('// Generated by gba/export.mjs from the browser game. Do not edit by hand.');
L.push('#ifndef THRONEBOUND_DATA_H');
L.push('#define THRONEBOUND_DATA_H');
L.push('');
L.push('typedef unsigned char  u8;');
L.push('typedef unsigned short u16;');
L.push('typedef unsigned int   u32;');
L.push('');

// Font.
const FONT_CHARS = [...' !\'",-.0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZ[]abcdefghijklmnopqrstuvwxyz'];
L.push(`#define FONT_COUNT ${FONT_CHARS.length}`);
L.push('#define FONT_ROWS 10');
L.push('static const char font_chars[FONT_COUNT + 1] = ' + JSON.stringify(FONT_CHARS.join('')) + ';');
L.push('static const u16 font_rows[FONT_COUNT][FONT_ROWS] = {');
L.push(fontData.map((g) => `  { ${g.rows.map(hex).join(', ')} },`).join('\n'));
L.push('};');
L.push('static const u8 font_advance[FONT_COUNT] = {');
L.push(block(fontData.map((g) => g.advance), 24));
L.push('};');
L.push('');

// Background graphics.
L.push(`#define BG_TILE_COUNT ${bank.length}`);
L.push(`static const u16 bg_pal[256] = {`);
L.push(block([0, ...bg.palette, ...new Array(255 - bg.palette.length).fill(0)].map(hex), 12));
L.push('};');
L.push('static const u32 bg_tiles[BG_TILE_COUNT * 16] = {');
L.push(block(bank.flatMap(tileWords).map(hex), 8));
L.push('};');
L.push('');

// Sprite graphics.
L.push(`#define OBJ_TILE_COUNT ${objTiles.length}`);
L.push(`#define FRAME_TILES 8            /* a 16x32 body is 2 x 4 character tiles */`);
L.push('static const u16 obj_pal[256] = {');
L.push(block([0, ...obj.palette, ...new Array(255 - obj.palette.length).fill(0)].map(hex), 12));
L.push('};');
L.push('static const u32 obj_tiles[OBJ_TILE_COUNT * 16] = {');
L.push(block(objTiles.flatMap(tileWords).map(hex), 8));
L.push('};');
L.push('');
L.push(`#define PLAYER_FRAME_BASE ${harvest.playerFrames[0]}`);
L.push('');

// Dialogue, lifted out of the scripts the browser game runs.
const scriptSource = await readFile(join(ROOT, 'src/data/scripts.js'), 'utf8');
function firstLine(script) {
  if (!script) return null;
  const at = scriptSource.indexOf(`\n  async ${script}(`);
  if (at < 0) return null;
  // Stop at the next script, or a run-on match would quote the wrong person.
  const rest = scriptSource.slice(at + 1);
  const end = rest.indexOf('\n  async ');
  const body = end < 0 ? rest : rest.slice(0, end);
  // A script branches on flags, so there is no single "first" line. The longest
  // one is reliably the substantive one rather than a one-clause follow-up.
  // A line is often written as several string literals joined with +, so take
  // the whole run rather than the first piece of it.
  const run = /say\(\s*((?:(['"])(?:\\.|(?!\2)[^\\])*\2\s*\+?\s*)+)/g;
  const piece = /(['"])((?:\\.|(?!\1)[^\\])*)\1/g;
  const lines = [...body.matchAll(run)]
    .map((m) => [...m[1].matchAll(piece)].map((p) => p[2]).join(''))
    .map((t) => t.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"'))
    .sort((a, b) => b.length - a.length);
  return lines[0] ?? null;
}

const cstr = (s) => JSON.stringify(String(s ?? '')).replace(/\\n/g, '\\n');

// Maps.
L.push('typedef struct { u8 x, y; u8 to; u8 tx, ty; } Warp;');
L.push('typedef struct { u8 x, y; const char *text; } Sign;');
L.push('typedef struct { u8 x, y; u16 slot; const char *name; const char *line; } Npc;');
L.push('typedef struct {');
L.push('  const char *name;');
L.push('  u8 w, h;');
L.push('  const u16 *entries;   /* (h*2) rows of (w*2) background tile indices */');
L.push('  const u8  *solid;     /* h rows of w flags */');
L.push('  const Warp *warps; u8 warpCount;');
L.push('  const Sign *signs; u8 signCount;');
L.push('  const Npc  *npcs;  u8 npcCount;');
L.push('} Map;');
L.push('');

const mapSlot = new Map(harvest.maps.map((m, i) => [m.id, i]));
harvest.maps.forEach((map, i) => {
  L.push(`/* ---- ${map.name} ---- */`);
  L.push(`static const u16 entries_${i}[${map.height * 2} * ${map.width * 2}] = {`);
  L.push(block(map.entries.flat(), 24));
  L.push('};');
  L.push(`static const u8 solid_${i}[${map.height} * ${map.width}] = {`);
  L.push(block(map.solid.flat(), 24));
  L.push('};');

  const warps = map.warps.filter((w) => mapSlot.has(w.to));
  L.push(`static const Warp warps_${i}[${Math.max(1, warps.length)}] = {`);
  for (const w of warps) L.push(`  { ${w.x}, ${w.y}, ${mapSlot.get(w.to)}, ${w.tx}, ${w.ty} },`);
  if (!warps.length) L.push('  { 255, 255, 0, 0, 0 },');
  L.push('};');

  L.push(`static const Sign signs_${i}[${Math.max(1, map.signs.length)}] = {`);
  for (const s of map.signs) L.push(`  { ${s.x}, ${s.y}, ${cstr(s.text)} },`);
  if (!map.signs.length) L.push('  { 255, 255, "" },');
  L.push('};');

  L.push(`static const Npc npcs_${i}[${Math.max(1, map.npcs.length)}] = {`);
  for (const n of map.npcs) {
    const said = n.said ?? firstLine(n.script);
    let line = said ?? `${n.name} has nothing to say to you today.`;
    let name = n.name;
    // The writing puts the speaker inside the line. The cartridge shows the
    // speaker on its own plate, so lift it out rather than saying it twice —
    // and trust what the line calls them over what the map does.
    const spoken = line.match(/^([A-Z][A-Za-z'\- ]{1,22}):\s+([\s\S]+)$/);
    if (spoken) {
      // Keep the fuller of the two names: the map's, when the line is only
      // using a shorter form of it.
      name = n.name.startsWith(spoken[1]) ? n.name : spoken[1];
      line = spoken[2];
    }
    L.push(`  { ${n.x}, ${n.y}, ${n.slot}, ${cstr(name)}, ${cstr(line.trim())} },`);
  }
  if (!map.npcs.length) L.push('  { 255, 255, 0, "", "" },');
  L.push('};');
  L.push('');
});

L.push(`#define MAP_COUNT ${harvest.maps.length}`);
L.push('static const Map maps[MAP_COUNT] = {');
harvest.maps.forEach((map, i) => {
  L.push(`  { ${cstr(map.name)}, ${map.width}, ${map.height}, entries_${i}, solid_${i},`);
  L.push(`    warps_${i}, ${map.warps.filter((w) => mapSlot.has(w.to)).length},`);
  L.push(`    signs_${i}, ${map.signs.length}, npcs_${i}, ${map.npcs.length} },`);
});
L.push('};');
L.push('');
L.push('#endif');

await writeFile(new URL('./data.h', import.meta.url), L.join('\n') + '\n', 'utf8');

const bytes = bank.length * 64 + objTiles.length * 64;
console.log(`data.h — ${harvest.maps.length} maps, ${bank.length}/512 background tiles, `
  + `${harvest.sprites.length} actor frames (${objTiles.length} tiles), `
  + `${bg.palette.length}+${obj.palette.length} colours, ${(bytes / 1024).toFixed(1)} KB of graphics`);
