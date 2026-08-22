#!/usr/bin/env node
// Exports the browser game into C, so the cartridge is drawn from the same
// source of truth rather than a hand-copied approximation that drifts.
//
// The tiles and the people are rendered by the real painters, in a real browser,
// and read back pixel for pixel. The maps, the collision, the warps, the signs,
// the writing, the houses, the techniques and the duellists' stats all come out
// of src/data. Change the browser game and the cartridge changes with it.
//
//   node gba/export.mjs   ->  gba/data.h

import { writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = resolve(process.cwd());

// The North, and as far south as Riverrun: everything reachable on foot from
// the yard you start in.
const MAP_IDS = [
  'winterfell', 'heroHouse', 'maesterHallWinterfell', 'greatKeep', 'winterfellForge',
  'wolfswood', 'kingsroadNorth', 'castleBlack', 'maesterHallCastleBlack',
  'castleBlackArmoury', 'beyondTheWall', 'moatCailin', 'maesterHallMoat',
  'moatCailinForge',
  'riverlands', 'riverrun', 'maesterHallRiverrun', 'riverrunForge', 'riverrunInn',
  'riverrunKeep', 'bloodyGate',
  // The road south, so every house can begin at its own seat rather than all
  // five of them starting in the Stark yard.
  'theEyrie', 'maesterHallEyrie', 'eyrieArmoury',
  'goldRoad', 'lannisport', 'maesterHallLannisport', 'lannisportForge', 'casterlyRock',
  'kingsroad', 'kingsLanding', 'maesterHallKL', 'klArmoury',
  'dragonstone', 'maesterHallDragonstone',
];

// What the cartridge's hardware will hold.
const BG_TILE_LIMIT = 512;      // charblocks 0-1, 8bpp
const NPC_ACTOR_LIMIT = 12;     // object VRAM, 4bpp, after the player's frames
const PLAYER_FRAMES = 16;       // four facings, four steps
const NPC_FRAMES = 8;           // four facings, two steps

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
page.on('pageerror', (e) => { console.error('page error:', e.message); });
await page.goto(`http://127.0.0.1:${PORT}/gba/blank.html`);

const harvest = await page.evaluate(async ({ mapIds }) => {
  const tiles = await import('/src/art/tiles.js');
  const actors = await import('/src/art/actors.js');
  const pixels = await import('/src/art/pixels.js');
  const { MAPS, REGIONS } = await import('/src/data/maps.js');
  const { DUELLISTS, ROAMERS, makeRoamer } = await import('/src/data/duellists.js');
  const { TRAINERS, trainerAsDuellist } = await import('/src/data/trainers.js');
  const { ITEMS } = await import('/src/data/items.js');
  const { WEAPONS, ARMOUR, SHIELDS } = await import('/src/data/gear.js');
  const { HOUSES, SWEARABLE } = await import('/src/data/houses.js');
  const { TECHNIQUES, LEARNED } = await import('/src/data/gear.js');
  const { baseStats } = await import('/src/game/player.js');

  const { tileCanvas, isSolid, tileDef, TILE_GROUP, N, E, S, W } = tiles;

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

  // --- people ---------------------------------------------------------------
  // Every appearance is exported as sixteen frames: four facings by four walk
  // steps, in the order the cartridge indexes them.

  const actorList = [];
  const actorIndex = new Map();

  function actorFor(who, id) {
    if (actorIndex.has(id)) return actorIndex.get(id);
    const at = actorList.length;
    actorIndex.set(id, at);
    const frames = [];
    for (const dir of actors.DIRECTIONS) {
      for (let step = 0; step < 4; step++) {
        frames.push(read(actors.paintActorFrame(who, dir, step)));
      }
    }
    actorList.push({ id, w: actors.ACTOR_W, h: actors.ACTOR_H, frames });
    return at;
  }

  // A darker and a lighter shade of a house colour, for the cloak's fold and
  // its lit edge, so the player reads as that house without a new drawing.
  function shade(hex, by) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.max(0, Math.min(255, Math.round(c + by)));
    return '#' + [mix(n >> 16), mix((n >> 8) & 255), mix(n & 255)]
      .map((c) => c.toString(16).padStart(2, '0')).join('');
  }

  // Four looks per house: what you are wearing shows. The cartridge keeps one
  // resident at a time and swaps it when you put something else on.
  const KIT = [
    { outfit: 'cloak', shield: 'none' },
    { outfit: 'leathers', shield: 'buckler' },
    { outfit: 'mail', shield: 'oakShield' },
    { outfit: 'plate', shield: 'towerShield' },
  ];
  const houses = SWEARABLE.map((id) => {
    const h = HOUSES[id];
    const palette = {
      hair: '#5a3a20', hairLight: '#7a5230',
      skin: '#e8b88c', skinDark: '#c08f66',
      cloak: h.colour, cloakDark: shade(h.colour, -34),
      trim: h.accent, legs: '#3d3a44', boots: '#2a2730',
    };
    const looks = KIT.map((kit, tier) => actorFor(
      { build: 'man', hair: 'short', weapon: 'blade', palette, ...kit },
      `hero:${id}:${tier}`));
    return {
      id, name: h.name, full: h.full, words: h.words, sworn: h.sworn,
      seat: h.seat, colour: h.colour, accent: h.accent, looks,
    };
  });

  // Where a sworn sword of each house walks out of their own gate. Every one of
  // these is a tile some door already lands you on, so it is walkable ground
  // that the audit has already checked rather than a coordinate picked by eye.
  // The ironborn have no Pyke on the cartridge; they hold Moat Cailin instead,
  // which is where they take hold in the story anyway.
  // `level` is what you begin at, and it is not the same for everybody. The
  // ground around a seat decides it: the weakest fighter within one door of
  // Winterfell is level three, and of Casterly Rock, twenty-seven. Starting a
  // Lannister at level five would put them somewhere they cannot beat a single
  // person, which is not a harder game, it is no game. A sworn sword of a great
  // house in the richest seat in Westeros was never a nobody anyway.
  const SEAT_START = {
    stark:     { map: 'winterfell',   x: 12, y: 12, dir: 0, level: 5 },
    lannister: { map: 'casterlyRock', x: 8,  y: 16, dir: 0, level: 23 },
    tully:     { map: 'riverrun',     x: 10, y: 17, dir: 1, level: 12 },
    targaryen: { map: 'dragonstone',  x: 11, y: 18, dir: 1, level: 21 },
    greyjoy:   { map: 'moatCailin',   x: 11, y: 18, dir: 1, level: 6 },
  };
  for (const h of houses) {
    const seat = SEAT_START[h.id];
    if (!seat) throw new Error(`no starting seat for ${h.id}`);
    h.start = seat;
  }

  // --- techniques and duellists --------------------------------------------

  const techniques = Object.keys(TECHNIQUES)
    .map((id) => ({
      id, name: TECHNIQUES[id].name,
      power: TECHNIQUES[id].power, accuracy: TECHNIQUES[id].accuracy,
      defend: TECHNIQUES[id].effect?.defend ? 1 : 0,
      highCrit: TECHNIQUES[id].highCrit ? 1 : 0,
    }));
  const techSlot = new Map(techniques.map((t, i) => [t.id, i]));
  // What levelling teaches, in the order it teaches it.
  const learned = LEARNED.map((l) => ({ level: l.level, tech: techSlot.get(l.id) }));
  const guardSlot = techSlot.get('guard');

  const duellists = [];
  const duellistIndex = new Map();

  /* The writing puts the speaker inside the line. The cartridge has a plate for
     that, so lift it out rather than saying it twice. */
  function unprefix(line, name) {
    const m = String(line ?? '').match(/^([A-Z][A-Za-z'\- ]{1,22}):\s+([\s\S]+)$/);
    return m && (name.indexOf(m[1]) >= 0 || m[1].indexOf(name) >= 0 || true) ? m[2] : line;
  }

  function pushDuellist(record) {
    record.intro = unprefix(record.intro, record.name);
    record.defeat = unprefix(record.defeat, record.name);
    const key = record.name + '|' + record.level;
    if (duellistIndex.has(key)) return duellistIndex.get(key);
    const at = duellists.length;
    duellistIndex.set(key, at);
    duellists.push(record);
    return at;
  }

  function techSlots(ids) {
    const picked = (ids ?? []).map((id) => techSlot.get(id)).filter((n) => n !== undefined);
    while (picked.length < 3) picked.push(techSlot.get('slash'));
    return [...picked.slice(0, 3), guardSlot];
  }

  /* What somebody on the road is worth in a fight. Named duellists carry their
     own numbers; everyone else is built from how they are dressed, the same way
     the browser builds a roamer. */
  const ROAD = {
    guard:   { v: 1.15, m: 1.0,  g: 1.3,  s: 0.9,  techs: ['slash', 'shieldBash', 'thrust'] },
    stark:   { v: 1.1,  m: 1.05, g: 1.1,  s: 1.0,  techs: ['slash', 'thrust', 'riposte'] },
    nightswatch: { v: 1.1, m: 1.05, g: 1.15, s: 0.95, techs: ['slash', 'thrust', 'riposte'] },
    ironborn:{ v: 1.0,  m: 1.2,  g: 0.85, s: 1.1,  techs: ['cleave', 'hook', 'quickCut'] },
    wildling:{ v: 1.15, m: 1.2,  g: 0.8,  s: 1.0,  techs: ['cleave', 'sweep', 'crush'] },
    wildlingWoman: { v: 1.0, m: 1.05, g: 0.8, s: 1.2, techs: ['quickCut', 'lunge', 'slash'] },
    sellsword: { v: 1.0, m: 1.1, g: 0.95, s: 1.1, techs: ['slash', 'quickCut', 'thrust'] },
    noble:   { v: 0.9,  m: 0.9,  g: 1.0,  s: 1.0,  techs: ['thrust', 'riposte', 'slash'] },
    maester: { v: 0.7,  m: 0.55, g: 0.7,  s: 0.85, techs: ['quickCut', 'slash', 'slash'] },
    septa:   { v: 0.65, m: 0.5,  g: 0.7,  s: 0.85, techs: ['quickCut', 'slash', 'slash'] },
    smallfolk: { v: 0.8, m: 0.7, g: 0.75, s: 0.95, techs: ['quickCut', 'slash', 'slash'] },
  };

  function roadFighter(name, sprite, level) {
    const b = ROAD[sprite] ?? ROAD.smallfolk;
    const s = baseStats(level);
    return {
      name, level,
      vigour: Math.round(s.vigour * b.v),
      might: Math.round(s.might * b.m),
      guard: Math.round(s.guard * b.g),
      swiftness: Math.round(s.swiftness * b.s),
      techs: techSlots(b.techs),
      reward: 20 + level * 14,
      exp: 18 + level * 9,
      mortal: 1,
      intro: `${name} squares up.`,
      defeat: `${name} goes down and does not get up.`,
    };
  }

  // What can be bought. Only what a person with no beasts has any use for:
  // something to drink when you are hurt, and better steel.
  const wares = [];
  const wareIndex = new Map();
  function ware(id, def, kind, heal) {
    const key = `${kind}:${id}`;
    if (wareIndex.has(key)) return wareIndex.get(key);
    const at = wares.length;
    wareIndex.set(key, at);
    wares.push({
      id, kind, name: def.name, price: def.price ?? 0, heal: heal ?? 0,
      might: def.might ?? 0, guard: def.guard ?? 0, swiftness: def.swiftness ?? 0,
      techs: def.techniques ?? [],
    });
    return at;
  }
  for (const [id, def] of Object.entries(ITEMS)) {
    if (def.pocket !== 'medicine') continue;
    if (def.use?.kind === 'heal') ware(id, def, 'potion', def.use.amount * 4);
    else if (def.use?.kind === 'fullHeal') ware(id, def, 'potion', 9999);
  }
  for (const [id, def] of Object.entries(WEAPONS)) if (def.price) ware(id, def, 'weapon');
  for (const [id, def] of Object.entries(ARMOUR)) if (def.price) ware(id, def, 'armour');
  for (const [id, def] of Object.entries(SHIELDS)) if (def.price) ware(id, def, 'shield');

  const potions = wares.map((w, i) => (w.kind === 'potion' ? i : -1)).filter((i) => i >= 0);
  const forSale = {
    apothecary: potions,
    armourer: wares.map((w, i) => (w.kind !== 'potion' ? i : -1)).filter((i) => i >= 0),
  };

  const out = { maps: [], houses, techniques, learned, duellists, wares, forSale, actors: null };

  for (const id of mapIds) {
    const map = MAPS[id];
    const width = map.width ?? map.grid[0].length;
    const height = map.height ?? map.grid.length;
    const cells = [];
    const solid = [];
    const cover = [];
    const ledge = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const char = map.grid[y][x] ?? '.';
        const canvas = tileCanvas(char, 0, maskFor(map, char, x, y),
          map.ground ?? 'grass', pixels.variantFor(x, y, 4));
        cells.push(read(canvas));
        solid.push(isSolid(char) ? 1 : 0);
        // Cover: the tall grass and the reeds. Nothing jumps you on a paved road.
        cover.push(tileDef(char).kind === 'encounter' ? 1 : 0);
        // A ledge you can drop off but not climb.
        ledge.push(tileDef(char).kind === 'ledge' ? 1 : 0);
      }
    }

    const npcs = (map.npcs ?? []).map((n) => {
      const sprite = n.sprite ?? 'smallfolk';
      // Anyone the browser game already has numbers for fights with those
      // numbers: a named duellist directly, a trainer through the same
      // conversion the browser uses when they draw on you in person.
      const named = n.data?.duel ? DUELLISTS[n.data.duel]
        : (n.data?.trainer && TRAINERS[n.data.trainer] ? trainerAsDuellist(n.data.trainer)
        : null);
      const level = named?.level ?? Math.max(2, Math.min(30, 3 + mapIds.indexOf(id) * 2));
      const fighter = named
        ? {
            name: named.name, level: named.level,
            vigour: named.vigour, might: named.might,
            guard: named.guard, swiftness: named.swiftness,
            techs: techSlots(named.techniques),
            reward: named.reward, exp: named.exp,
            mortal: named.canYield === false ? 0 : 1,
            intro: named.intro, defeat: named.defeat,
          }
        : roadFighter(n.name ?? 'Stranger', sprite, level);
      // What this person actually says. Most of it is authored on the duellist
      // or the trainer rather than in the script, and some scripts hold their
      // lines in an array, so ask in that order before falling back.
      const said = (n.data?.duel && DUELLISTS[n.data.duel]?.intro)
        || (n.data?.trainer && TRAINERS[n.data.trainer]?.intro)
        || n.data?.line
        || null;
      // Who trades, and who watches the road. A trainer in the browser game has
      // a sight range; the same number decides how far down their nose they
      // spot you here.
      const trade = /shop|merchant/i.test(n.script ?? '') ? 1
        : /smith|forge|armour/i.test(n.script ?? '') ? 2 : 0;
      const sight = n.data?.trainer && TRAINERS[n.data.trainer]
        ? Math.min(5, TRAINERS[n.data.trainer].sight ?? 0) : 0;
      return {
        x: n.x, y: n.y, dir: actors.DIRECTIONS.indexOf(n.dir ?? 'down'), said,
        name: n.name ?? '', script: n.script ?? '', sprite, trade, sight,
        actor: actorFor(sprite, sprite),
        duellist: pushDuellist(fighter),
        // A town is not a waxwork. Everybody has somewhere to be except the
        // people whose whole job is to stand behind something.
        roams: /healer|merchant|shop|smith|innkeep|steward|harbour|ship|court|stable/i
          .test(n.script ?? '') ? 0 : 1,
        // A maester will put you back together. A maester will not fight you,
        // and neither will a child or a septa.
        heals: /healer|maester/i.test(n.script ?? '') || /Maester/.test(n.name ?? '') ? 1 : 0,
        fights: ['child', 'girl', 'septa', 'maester', 'whitewalker'].includes(sprite) ? 0 : 1,
      };
    });

    /* Who is out on this road. The browser rolls these as you walk; the
       cartridge picks from the same table, with the same numbers. */
    const ambushes = [];
    for (const row of map.encounters ?? []) {
      if (!row.roamer || !ROAMERS[row.roamer]) continue;
      const level = Math.max(2, Math.round((row.min + row.max) / 2));
      const made = makeRoamer(row.roamer, level, (list) => list[0]);
      ambushes.push({
        actor: actorFor(made.sprite, made.sprite),
        duellist: pushDuellist({
          name: made.name, level: made.level, vigour: made.vigour,
          might: made.might, guard: made.guard, swiftness: made.swiftness,
          techs: techSlots(made.techniques),
          reward: made.reward, exp: made.exp, mortal: 1,
          intro: made.intro, defeat: made.defeat,
        }),
      });
      if (ambushes.length >= 4) break;
    }

    // Which sky a duel fought here is fought under. Every fight in the game
    // used the same dusk, which made the most repeated screen in the whole
    // cartridge the one screen that never changed.
    const region = REGIONS[id] ?? '';
    const scene = map.indoor ? 5
      : id === 'dragonstone' || id === 'dragonmont' ? 4
      : (map.ground ?? 'grass') === 'snow' ? 1
      : /Wolfswood|Neck/.test(region) || /wolfswood|kingsroad/i.test(id) ? 2
      : /Riverlands|Vale/.test(region) ? 3
      : 0;

    out.maps.push({
      id, name: map.name, width, height, cells, solid, cover, ledge, npcs, ambushes,
      scene,
      frost: (map.ground ?? 'grass') === 'snow' ? 1 : 0,
      warps: (map.warps ?? []).map((w) => ({ ...w })),
      signs: (map.signs ?? []).map((s) => ({ x: s.x, y: s.y, text: s.text })),
    });
  }

  out.actors = actorList;
  return out;
}, { mapIds: MAP_IDS });

// The font is compiled inside font.js; re-read it through the same module.
const FONT_CHARS = [...' !\'",-./0123456789:;?()ABCDEFGHIJKLMNOPQRSTUVWXYZ[]abcdefghijklmnopqrstuvwxyz'];
const fontData = await page.evaluate(async (chars) => {
  const font = await import('/src/engine/font.js');
  return chars.map((char) => {
    const hits = [];
    font.drawText({ fillStyle: '', fillRect(x, y) { hits.push([x, y]); } }, char, 0, 0, { shadow: null });
    const rows = new Array(10).fill(0);
    for (const [x, y] of hits) if (y >= 0 && y < 10 && x >= 0 && x < 16) rows[y] |= 1 << x;
    return { rows, advance: font.charWidth(char) };
  });
}, FONT_CHARS);

await browser.close();
server.close();

// ------------------------------------------------------------- packing -----

const bgr555 = (r, g, b) => ((b >> 3) << 10) | ((g >> 3) << 5) | (r >> 3);
const hexColour = (h) => {
  const n = parseInt(h.slice(1), 16);
  return bgr555(n >> 16, (n >> 8) & 255, n & 255);
};

/** Builds a palette of at most `room` colours; index 0 is transparent. */
function buildPalette(sources, room) {
  const counts = new Map();
  for (const rgba of sources) {
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] < 128) continue;
      const c = bgr555(rgba[i], rgba[i + 1], rgba[i + 2]);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const palette = ordered.slice(0, room);
  const lookup = new Map(palette.map((c, i) => [c, i + 1]));
  for (const c of ordered.slice(room)) {
    let best = 1, bestD = Infinity;
    const r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i];
      const d = ((p & 31) - r) ** 2 + (((p >> 5) & 31) - g) ** 2 + (((p >> 10) & 31) - b) ** 2;
      if (d < bestD) { bestD = d; best = i + 1; }
    }
    lookup.set(c, best);
  }
  return { palette, lookup, dropped: Math.max(0, ordered.length - room) };
}

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

/** 64 index bytes -> 16 words, 8bpp. */
const words8 = (tile) => {
  const out = [];
  for (let i = 0; i < 64; i += 4) {
    out.push((tile[i] | (tile[i + 1] << 8) | (tile[i + 2] << 16) | (tile[i + 3] << 24)) >>> 0);
  }
  return out;
};

/** 64 index bytes -> 8 words, 4bpp, low nibble first. */
const words4 = (tile) => {
  const out = [];
  for (let i = 0; i < 64; i += 8) {
    let w = 0;
    for (let n = 0; n < 8; n++) w |= (tile[i + n] & 15) << (n * 4);
    out.push(w >>> 0);
  }
  return out;
};

// --- backgrounds ------------------------------------------------------------
// One palette for the whole world, so a warp never has to repaint it, but each
// map carries its own character tiles: video memory holds the map you are on.

const allCells = harvest.maps.flatMap((m) => m.cells);
const bg = buildPalette(allCells, 239);     /* bank 15 is kept for the text layer */

for (const map of harvest.maps) {
  const bank = [new Uint8Array(64)];
  const seen = new Map([[bank[0].join(','), 0]]);
  const entries = [];
  for (let y = 0; y < map.height * 2; y++) entries.push(new Array(map.width * 2).fill(0));

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const quad = cut8(indexify(map.cells[y * map.width + x], bg.lookup), 16, 16);
      quad.forEach((tile, q) => {
        const key = tile.join(',');
        let at = seen.get(key);
        if (at === undefined) { at = bank.length; bank.push(tile); seen.set(key, at); }
        entries[y * 2 + (q >> 1)][x * 2 + (q & 1)] = at;
      });
    }
  }
  if (bank.length > BG_TILE_LIMIT) {
    throw new Error(`${map.id} needs ${bank.length} tiles; video memory holds ${BG_TILE_LIMIT}`);
  }
  map.bank = bank;
  map.entries = entries;
  delete map.cells;
}

// --- people -----------------------------------------------------------------
// Four bits a pixel with a palette apiece, which is what lets a town's worth of
// different people be resident at once.

for (const actor of harvest.actors) {
  const pal = buildPalette(actor.frames, 15);
  actor.colours = pal.palette;
  actor.tiles = actor.frames.flatMap((rgba) => cut8(indexify(rgba, pal.lookup), actor.w, actor.h));
  actor.crushed = pal.dropped;
  delete actor.frames;
}

// Which appearances each map has to have resident, and where each sits.
for (const map of harvest.maps) {
  const used = [];
  const bankOf = (actor) => {
    let at = used.indexOf(actor);
    if (at < 0) { at = used.length; used.push(actor); }
    return at;
  };
  for (const npc of map.npcs) npc.bank = bankOf(npc.actor);
  for (const a of map.ambushes) a.bank = bankOf(a.actor);
  if (used.length > NPC_ACTOR_LIMIT) {
    throw new Error(`${map.id} needs ${used.length} appearances resident; there is room for ${NPC_ACTOR_LIMIT}`);
  }
  map.residents = used;
}

// --- writing ----------------------------------------------------------------

const scriptSource = await readFile(join(ROOT, 'src/data/scripts.js'), 'utf8');
function scriptLine(script) {
  if (!script) return null;
  const at = scriptSource.indexOf(`\n  async ${script}(`);
  if (at < 0) return null;
  const rest = scriptSource.slice(at + 1);
  const end = rest.indexOf('\n  async ');
  const body = end < 0 ? rest : rest.slice(0, end);
  // Dialogue is not always passed straight to say(): plenty of scripts hold it
  // in an array and loop, or build it up with +. So take every string literal in
  // the function that is shaped like a sentence, and keep the longest.
  const run = /((?:(['"])(?:\\.|(?!\2)[^\\])*\2\s*\+\s*)*(['"])(?:\\.|(?!\3)[^\\])*\3)/g;
  const piece = /(['"])((?:\\.|(?!\1)[^\\])*)\1/g;
  const lines = [...body.matchAll(run)]
    .map((m) => [...m[0].matchAll(piece)].map((p) => p[2]).join(''))
    .map((t) => t.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"'))
    .filter((t) => t.length > 24 && / /.test(t) && /[.!?]/.test(t) && !/^[a-z_]+$/.test(t))
    .sort((a, b) => b.length - a.length);
  return lines[0] ?? null;
}

/* Nobody in Westeros has nothing to say. When neither the script nor the data
   yields a line, the person says something their trade would say. */
const ROLE_LINES = {
  guard: ['Move along. Nothing up there for you.',
          'Cold watch. Colder if you make trouble.'],
  stark: ['The North remembers. So does Lord Rickard, and he has a longer memory.',
          'Winter is coming. It always is, up here.'],
  nightswatch: ['Night gathers. Some of us have been gathering with it for years.',
                'The Wall does not care who your father was.'],
  wildling: ['Kneelers. Every one of you, born on your knees.',
             'South of the Wall you all smell of smoke and rules.'],
  wildlingWoman: ['You know nothing, and you walk like it too.',
                  'We took what we needed. You buy it. Which of us is the thief?'],
  merchant: ['Good steel, fair prices, and no questions about either.',
             'Everything here has come a long way. So has the price.'],
  smallfolk: ['Lords fight, and we bury what falls.',
              'Long as the harvest holds, the rest is somebody else\'s trouble.'],
  goodwife: ['Mind the mud, and mind your manners.',
             'There is broth if you have coin, and broth if you have not.'],
  oldman: ['I have seen three winters. I do not recommend the third.',
           'Roads were safer once. So was everything.'],
  noble: ['You have the look of somebody about to be useful.',
          'Titles are cheap this season. Loyalty is not.'],
  maester: ['Every chain has a link for something. Mine is mostly patience.',
            'Read more. It costs less than being wrong.'],
  septa: ['The Seven watch, even out here where nobody builds them a sept.',
          'Say your words and mean them, or do not say them.'],
  child: ['Are you a knight? You do not look like a knight.',
          'I am not supposed to talk to strangers. Hello.'],
  sellsword: ['Coin first. Then we discuss whose side I am on.',
              'I have fought for four houses. Two of them still exist.'],
  ironborn: ['We do not sow. Somebody has to not sow.',
             'Salt and iron. Everything else is decoration.'],
  tully: ['Family, duty, honour. In that order, whatever the singers say.',
          'The rivers keep the Riverlands fed and the Riverlands fought over.'],
  lannister: ['A Lannister pays his debts. Try not to become one.',
              'Gold buys the sword. The sword buys the rest.'],
};
const DEFAULT_LINES = ['Keep to the road and keep your hood up.',
                       'Nothing happens here, which is how we like it.'];

function roleLine(npc) {
  const set = ROLE_LINES[npc.sprite] ?? DEFAULT_LINES;
  return set[(npc.x + npc.y) % set.length];
}

// ------------------------------------------------------------- writing out --

const hex = (n) => `0x${(n >>> 0).toString(16)}`;
const techSlotOf = (id) => harvest.techniques.findIndex((t) => t.id === id);
/* The cartridge draws bytes, one glyph each. The writing uses real typography —
   curly quotes, em dashes — which is three bytes a character and a hole in the
   middle of a word on a Game Boy. Everything bound for the ROM is folded down
   to what the font has a glyph for, and anything left over is reported rather
   than shipped as a hole. */
const FOLD = {
  '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201B': "'",
  '\u201C': '"', '\u201D': '"', '\u201E': '"',
  '\u2013': '-', '\u2014': '-', '\u2015': '-', '\u2212': '-',
  '\u2026': '...', '\u00A0': ' ', '\u00AD': '', '\u2022': '*',
  '\u00E9': 'e', '\u00E8': 'e', '\u00EF': 'i', '\u00F6': 'o', '\u00FC': 'u',
};
const strange = new Map();

function plain(text) {
  let out = '';
  for (const ch of String(text ?? '')) {
    if (FOLD[ch] !== undefined) { out += FOLD[ch]; continue; }
    if (ch === '\n' || (ch >= ' ' && ch <= '~')) { out += ch; continue; }
    strange.set(ch, (strange.get(ch) ?? 0) + 1);
    out += '?';
  }
  return out;
}

const cstr = (s) => JSON.stringify(plain(s)).replace(/\\n/g, '\\n');

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
L.push('typedef signed char    s8;');
L.push('');

// Font.
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

// Background palette.
L.push('static const u16 bg_pal[240] = {');
L.push(block([0, ...bg.palette, ...new Array(239 - bg.palette.length).fill(0)].map(hex), 12));
L.push('};');
L.push('');

// People.
L.push('#define ACTOR_FRAME_TILES 8      /* a 16x32 body is 2 x 4 character tiles */');
L.push('#define PLAYER_FRAMES 16         /* four facings, four walk steps */');
L.push(`#define NPC_FRAMES ${NPC_FRAMES}`);
L.push(`#define ACTOR_COUNT ${harvest.actors.length}`);
L.push('typedef struct { const u16 *pal; const u32 *tiles; } Actor;');
harvest.actors.forEach((actor, i) => {
  L.push(`static const u16 actorpal_${i}[16] = {`);
  L.push(block([0, ...actor.colours, ...new Array(15 - actor.colours.length).fill(0)].map(hex), 8));
  L.push('};');
  L.push(`static const u32 actortiles_${i}[${actor.tiles.length * 8}] = {`);
  L.push(block(actor.tiles.flatMap(words4).map(hex), 8));
  L.push('};');
});
L.push('static const Actor actors[ACTOR_COUNT] = {');
harvest.actors.forEach((a, i) => L.push(`  { actorpal_${i}, actortiles_${i} },  /* ${a.id} */`));
L.push('};');
L.push('');

// Houses.
L.push(`#define HOUSE_COUNT ${harvest.houses.length}`);
L.push('typedef struct { const char *name, *full, *words, *sworn, *seat; u16 colour, accent;'
     + ' u16 looks[4]; u8 startMap, startX, startY, startDir, startLevel; } House;');
L.push('static const House houses[HOUSE_COUNT] = {');
for (const h of harvest.houses) {
  L.push(`  { ${cstr(h.name)}, ${cstr(h.full)}, ${cstr(h.words)},`);
  L.push(`    ${cstr(h.sworn)}, ${cstr(h.seat)}, ${hex(hexColour(h.colour))}, ${hex(hexColour(h.accent))},`);
  {
    const at = MAP_IDS.indexOf(h.start.map);
    if (at < 0) throw new Error(`${h.id} starts on ${h.start.map}, which is not exported`);
    L.push(`    { ${h.looks.join(', ')} }, ${at}, ${h.start.x}, ${h.start.y}, `
      + `${h.start.dir}, ${h.start.level} },`);
  }
}
L.push('};');
L.push('');

// What can be bought, and who sells it.
L.push(`#define WARE_COUNT ${harvest.wares.length}`);
L.push('#define WARE_POTION 0');
L.push('#define WARE_WEAPON 1');
L.push('#define WARE_ARMOUR 2');
L.push('#define WARE_SHIELD 3');
L.push('typedef struct {');
L.push('  const char *name;');
L.push('  u16 price, heal;');
L.push('  u8 kind, might, guard, tier;');
L.push('  s8 swiftness;');
L.push('  u8 tech[3], techCount;');
L.push('} Ware;');
L.push('static const Ware wares[WARE_COUNT] = {');
{
  const kindOf = { potion: 0, weapon: 1, armour: 2, shield: 3 };
  // Which of the four looks a piece of armour puts you in.
  const LOOK = { gambeson: 0, boiledLeather: 1, ringmail: 2, scaleArmour: 2, knightPlate: 3 };
  for (const w of harvest.wares) {
    const techs = (w.techs ?? []).map((id) => techSlotOf(id)).filter((n) => n >= 0).slice(0, 3);
    L.push(`  { ${cstr(w.name)}, ${w.price}, ${Math.min(9999, w.heal)}, ${kindOf[w.kind]},`);
    L.push(`    ${w.might}, ${w.guard}, ${LOOK[w.id] ?? 0}, ${w.swiftness},`);
    L.push(`    { ${[...techs, 0, 0, 0].slice(0, 3).join(', ')} }, ${techs.length} },`);
  }
}
L.push('};');
L.push('');
L.push(`#define START_WEAPON ${harvest.wares.findIndex((w) => w.id === 'ironSword')}`);
/* The floor under a player who has been beaten with nothing in their hands. */
L.push(`#define FLOOR_WEAPON ${harvest.wares.findIndex((w) => w.id === 'huntingKnife')}`);
L.push(`#define START_ARMOUR ${harvest.wares.findIndex((w) => w.id === 'gambeson')}`);
L.push(`#define START_POTION ${harvest.wares.findIndex((w) => w.id === 'maesterKit')}`);
L.push('typedef struct { const u8 *ware; u8 count; } Stall;');
{
  const stalls = [harvest.forSale.apothecary, harvest.forSale.armourer];
  stalls.forEach((list, i) => {
    L.push(`static const u8 stall_${i}[${Math.max(1, list.length)}] = { ${list.join(', ') || '0'} };`);
  });
  L.push('static const Stall stalls[2] = {');
  stalls.forEach((list, i) => L.push(`  { stall_${i}, ${list.length} },`));
  L.push('};');
}
L.push('');

// Techniques.
L.push(`#define TECH_COUNT ${harvest.techniques.length}`);
L.push('typedef struct { const char *name; u8 power, accuracy, defend, highCrit; } Tech;');
L.push('static const Tech techniques[TECH_COUNT] = {');
for (const t of harvest.techniques) {
  L.push(`  { ${cstr(t.name)}, ${t.power}, ${t.accuracy}, ${t.defend}, ${t.highCrit} },`);
}
L.push('};');
L.push('');
/* What you fight with when you have nothing: the cartridge falls back to these
   whenever no weapon is held, which is now how everybody starts. */
const playerTechs = ['jab', 'grapple', 'headbutt', 'guard']
  .map((id) => harvest.techniques.findIndex((t) => t.id === id));
L.push('static const u8 player_techs[4] = { ' + playerTechs.join(', ') + ' };');
/* And what fills the empty slots once there is a weapon in your hand: a knife
   teaches two things, and the third slot should not be a headbutt. */
const armedTechs = ['riposte', 'slash', 'thrust']
  .map((id) => harvest.techniques.findIndex((t) => t.id === id));
L.push('static const u8 armed_techs[3] = { ' + armedTechs.join(', ') + ' };');
L.push('');
/* What standing itself teaches, whatever is in your hand. */
L.push(`#define LEARN_COUNT ${harvest.learned.length}`);
L.push('typedef struct { u8 level, tech; } Learned;');
L.push('static const Learned learned[LEARN_COUNT] = {');
for (const l of harvest.learned) L.push(`  { ${l.level}, ${l.tech} },`);
L.push('};');
L.push('');

// Duellists.
L.push(`#define DUELLIST_COUNT ${harvest.duellists.length}`);
L.push('typedef struct {');
L.push('  const char *name;');
L.push('  u16 vigour; u8 level, might, guard, swiftness, mortal;');
L.push('  u8 tech[4];');
L.push('  u16 reward, exp;');
L.push('  const char *intro, *defeat;');
L.push('} Duellist;');
L.push('static const Duellist duellists[DUELLIST_COUNT] = {');
for (const d of harvest.duellists) {
  L.push(`  { ${cstr(d.name)}, ${d.vigour}, ${d.level}, ${d.might}, ${d.guard}, ${d.swiftness}, ${d.mortal},`);
  L.push(`    { ${d.techs.join(', ')} }, ${d.reward}, ${d.exp},`);
  L.push(`    ${cstr(d.intro)}, ${cstr(d.defeat)} },`);
}
L.push('};');
L.push('');

// Maps.
L.push('typedef struct { u8 x, y, to, tx, ty; } Warp;');
L.push('typedef struct { u8 x, y; const char *text; } Sign;');
L.push('typedef struct { u16 duellist; u8 bank; } Ambush;');
L.push('typedef struct {');
L.push('  u8 x, y, dir, bank, roams, heals, fights, trade, sight;');
L.push('  u16 duellist;');
L.push('  const char *name, *line;');
L.push('} Npc;');
L.push('typedef struct {');
L.push('  const char *name;');
L.push('  u8 w, h;');
L.push('  u16 tileCount;');
L.push('  const u32 *tiles;');
L.push('  const u16 *entries;');
L.push('  const u8  *solid;');
L.push('  const u8  *cover;     /* where something can be hiding */');
L.push('  const u8  *ledge;     /* a drop you can take but not climb */');
L.push('  u8 frost;             /* whether the cover here is under snow */');
L.push('  u8 scene;             /* which sky a duel fought here is fought under */');
L.push('  const u16 *residents; u8 residentCount;');
L.push('  const Warp *warps; u8 warpCount;');
L.push('  const Sign *signs; u8 signCount;');
L.push('  const Npc  *npcs;  u8 npcCount;');
L.push('  const Ambush *ambushes; u8 ambushCount;');
L.push('} Map;');
L.push('');

const mapSlot = new Map(harvest.maps.map((m, i) => [m.id, i]));
harvest.maps.forEach((map, i) => {
  L.push(`/* ---- ${map.name} ---- */`);
  L.push(`static const u32 tiles_${i}[${map.bank.length} * 16] = {`);
  L.push(block(map.bank.flatMap(words8).map(hex), 8));
  L.push('};');
  L.push(`static const u16 entries_${i}[${map.height * 2} * ${map.width * 2}] = {`);
  L.push(block(map.entries.flat(), 24));
  L.push('};');
  L.push(`static const u8 solid_${i}[${map.height} * ${map.width}] = {`);
  L.push(block(map.solid, 24));
  L.push('};');
  L.push(`static const u8 cover_${i}[${map.height} * ${map.width}] = {`);
  L.push(block(map.cover, 24));
  L.push('};');
  L.push(`static const u8 ledge_${i}[${map.height} * ${map.width}] = {`);
  L.push(block(map.ledge, 24));
  L.push('};');
  L.push(`static const u16 residents_${i}[${Math.max(1, map.residents.length)}] = { ${map.residents.join(', ') || '0'} };`);

  const warps = map.warps.filter((w) => mapSlot.has(w.to));
  L.push(`static const Warp warps_${i}[${Math.max(1, warps.length)}] = {`);
  for (const w of warps) L.push(`  { ${w.x}, ${w.y}, ${mapSlot.get(w.to)}, ${w.tx}, ${w.ty} },`);
  if (!warps.length) L.push('  { 255, 255, 0, 0, 0 },');
  L.push('};');
  map.liveWarps = warps.length;

  L.push(`static const Sign signs_${i}[${Math.max(1, map.signs.length)}] = {`);
  for (const s of map.signs) L.push(`  { ${s.x}, ${s.y}, ${cstr(s.text)} },`);
  if (!map.signs.length) L.push('  { 255, 255, "" },');
  L.push('};');

  L.push(`static const Ambush ambushes_${i}[${Math.max(1, map.ambushes.length)}] = {`);
  for (const a of map.ambushes) L.push(`  { ${a.duellist}, ${a.bank} },`);
  if (!map.ambushes.length) L.push('  { 0, 0 },');
  L.push('};');

  L.push(`static const Npc npcs_${i}[${Math.max(1, map.npcs.length)}] = {`);
  for (const n of map.npcs) {
    let line = n.said ?? scriptLine(n.script) ?? roleLine(n);
    let name = n.name;
    const spoken = line.match(/^([A-Z][A-Za-z'\- ]{1,22}):\s+([\s\S]+)$/);
    if (spoken) {
      name = n.name.startsWith(spoken[1]) ? n.name : spoken[1];
      line = spoken[2];
    }
    L.push(`  { ${n.x}, ${n.y}, ${n.dir < 0 ? 0 : n.dir}, ${n.bank}, ${n.roams}, ${n.heals}, ${n.fights}, ${n.trade}, ${n.sight}, ${n.duellist},`);
    L.push(`    ${cstr(name)}, ${cstr(line.trim())} },`);
  }
  if (!map.npcs.length) L.push('  { 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, "", "" },');
  L.push('};');
  L.push('');
});

L.push(`#define MAP_COUNT ${harvest.maps.length}`);
L.push('static const Map maps[MAP_COUNT] = {');
harvest.maps.forEach((map, i) => {
  L.push(`  { ${cstr(map.name)}, ${map.width}, ${map.height}, ${map.bank.length}, tiles_${i},`);
  L.push(`    entries_${i}, solid_${i}, cover_${i}, ledge_${i}, ${map.frost}, ${map.scene}, residents_${i}, ${map.residents.length},`);
  L.push(`    warps_${i}, ${map.liveWarps}, signs_${i}, ${map.signs.length},`);
  L.push(`    npcs_${i}, ${map.npcs.length}, ambushes_${i}, ${map.ambushes.length} },`);
});
L.push('};');
L.push('');
L.push('#endif');

await writeFile(new URL('./data.h', import.meta.url), L.join('\n') + '\n', 'utf8');

const bgTiles = harvest.maps.reduce((n, m) => n + m.bank.length, 0);
const objTiles = harvest.actors.reduce((n, a) => n + a.tiles.length, 0);
const worst = harvest.maps.reduce((a, b) => (a.bank.length > b.bank.length ? a : b));
const crushed = harvest.actors.filter((a) => a.crushed).length;
console.log(`data.h`);
console.log(`  ${harvest.maps.length} maps, worst fit ${worst.bank.length}/${BG_TILE_LIMIT} tiles (${worst.id})`);
console.log(`  ${bgTiles} background tiles, ${bg.palette.length}/239 colours`
  + (bg.dropped ? `, ${bg.dropped} merged to their nearest` : ''));
console.log(`  ${harvest.actors.length} appearances, ${objTiles} tiles`
  + (crushed ? `, ${crushed} needed more than 15 colours` : ''));
console.log(`  ${harvest.duellists.length} people you can fight, ${harvest.techniques.length} techniques`);
console.log(`  ${((bgTiles * 64 + objTiles * 32) / 1024).toFixed(0)} KB of graphics`);
if (strange.size) {
  console.log(`  ${strange.size} character${strange.size === 1 ? '' : 's'} the font has no glyph for, `
    + `replaced with a question mark: ${[...strange].map(([c, n]) => `${JSON.stringify(c)} x${n}`).join(', ')}`);
}
