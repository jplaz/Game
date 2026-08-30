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

// The berth list is plain data with nothing browser-shaped in it, so it is read
// here rather than harvested out of the page.
const { PORTS } = await import('../src/data/ports.js');

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = resolve(process.cwd());

// The North, and as far south as Riverrun: everything reachable on foot from
// the yard you start in.
const MAP_IDS = [
  'winterfell', 'heroHouse', 'maesterHallWinterfell', 'greatKeep', 'winterfellForge',
  'winterfellInn', 'winterfellHouse', 'winterfellCrypt',
  'wolfswood', 'kingsroadNorth', 'castleBlack', 'maesterHallCastleBlack',
  'castleBlackArmoury', 'castleBlackHall', 'beyondTheWall', 'moatCailin',
  'maesterHallMoat',
  'moatCailinForge',
  'riverlands', 'riverrun', 'maesterHallRiverrun', 'riverrunForge', 'riverrunInn',
  'riverrunKeep', 'bloodyGate',
  // The road south, so every house can begin at its own seat rather than all
  // five of them starting in the Stark yard.
  'theEyrie', 'maesterHallEyrie', 'eyrieArmoury', 'eyrieKeep',
  'goldRoad', 'lannisport', 'maesterHallLannisport', 'lannisportForge', 'casterlyRock',
  'kingsroad', 'kingsLanding', 'maesterHallKL', 'klArmoury',
  // The capital, and the four places in it you have to go and find.
  'greatSept', 'dragonpit', 'fleaBottom', 'mudGate',
  /* The five deeds anybody can buy are browser-only for now: the cartridge has
     no deedBroker, so shipping their interiors put five maps on the ROM with no
     way into any of them, which the audit rightly called out. They come back
     when the C side can sell a deed. */
  'dragonstone', 'maesterHallDragonstone', 'dragonstoneArmoury', 'dragonmont',
  'redKeep', 'barrowCave',
  // The south. Three more seats to begin at, three more leaders holding a
  // sigil, and somewhere to go once the Kingsroad runs out.
  'roseroad', 'highgarden', 'maesterHallHighgarden', 'highgardenArmoury',
  'highgardenKeep',
  'princesPass', 'sunspear', 'maesterHallSunspear', 'sunspearArmoury', 'sunspearKeep',
  'stormlands', 'stormsEnd', 'maesterHallStormsEnd', 'stormsEndArmoury', 'stormsEndKeep',
  // The seventh kingdom. Greyjoy held a seat that was not on the cartridge.
  'ironCoast', 'seaCave', 'pykeBridge', 'pyke', 'maesterHallPyke', 'pykeForge',
  'pykeKeep', 'lordsportDocks',
  // The Dreadfort, and the road to it.
  'weepingWater', 'dreadfort', 'maesterHallDreadfort', 'dreadfortForge', 'dreadfortKeep',
  // North of the Wall, where the story about the dead stops being a story.
  'hauntedForest', 'fistOfTheFirstMen',
  // Holes in the ground with people in them.
  'hollowHill', 'stoneCrypt',
  // And east, over the Narrow Sea.
  'narrowSea', 'braavos', 'houseOfBlackAndWhite', 'pentos', 'illyriosManse',
  'volantis', 'templeOfRhllor', 'meereen', 'greatPyramid',
  // Two doors at the bottom of every town: the inn, and the house with the red
  // lamp over the door. Somewhere for the smallfolk to actually be.
  // And what is under the eastern quarter of each of them.
  'theEyrieCellar', 'highgardenCellar', 'sunspearCellar', 'stormsEndCellar',
  'dragonstoneCellar', 'braavosCellar', 'pentosCellar', 'volantisCellar',
  'meereenCellar', 'pykeCellar', 'dreadfortCellar',
  'theEyrieInn', 'theEyrieHouse', 'highgardenInn', 'highgardenHouse', 'sunspearInn', 'sunspearHouse',
  'stormsEndInn', 'stormsEndHouse', 'dragonstoneInn', 'dragonstoneHouse', 'braavosInn', 'braavosHouse',
  'pentosInn', 'pentosHouse', 'volantisInn', 'volantisHouse', 'meereenInn', 'meereenHouse',
  'pykeInn', 'pykeHouse', 'dreadfortInn', 'dreadfortHouse',
  // Somebody else's walls: the far gate of nine towns used to be a road that
  // stopped at the edge of the world, and now opens onto a garrison.
  'stoneCrowHold', 'stoneCrowCave', 'seaDragonHold', 'seaDragonVault',
  'kennelHold', 'flayedHall', 'sealordHold', 'sealordPalace',
  'cheesemongerHold', 'cheesemongerCellar', 'blackWallHold', 'elephantCourt',
  'fightingPits', 'pitMasterRooms', 'waterGardens', 'pavilionOfOranges',
  'wreckersHold', 'wreckersHall',
  // East along the Wall to Eastwatch, where the raven that starts all of this
  // was written and signed, and then past it.
  'theGift', 'eastwatch', 'maesterHallEastwatch', 'eastwatchArmoury',
  'eastwatchKeep', 'eastwatchInn', 'eastwatchHouse', 'eastwatchCellar',
  'frostfangs', 'crastersKeep', 'crastersHall', 'hardhome',
  // The river road: the bridge the Freys charge for, the inn where every road
  // in the realm meets, and the ruin nobody who has held it has died well in.
  'theGreenFork', 'theTwins', 'twinsHall', 'maesterHallTwins',
  'theCrossroads', 'crossroadsInn', 'harrenhal', 'harrenhalHall',
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
  const { DUELLISTS, ROAMERS, ROAMER_TABLES, makeRoamer } = await import('/src/data/duellists.js');
  const { TRAINERS, trainerAsDuellist } = await import('/src/data/trainers.js');
  const { ITEMS } = await import('/src/data/items.js');
  const { WEAPONS, ARMOUR, SHIELDS, HELMS, GLOVES } = await import('/src/data/gear.js');
  const { HOUSES, SWEARABLE, SPRITE_HOUSE, REGION_HOUSE } = await import('/src/data/houses.js');
  const { TALES, TALE_ORDER, TALE_HOUSES } = await import('/src/data/tale.js');
  const { MATERIALS, MATERIAL_IDS, SPOILS, FORAGE, RECIPES, SNARES, EGG_ITEMS,
          RELICS, OATHS } =
    await import('/src/data/craft.js');
  const { SPECIES } = await import('/src/data/species.js');
  const { CUTSCENES, CUTSCENE_IDS } = await import('/src/data/cutscenes.js');
  const { QUESTS } = await import('/src/data/quests.js');
  const { REGARD } = await import('/src/data/regard.js');
  const { PETITIONS, PETITION_IDS } = await import('/src/data/petitions.js');
  const { BEAST_TECHNIQUES, GROWS_INTO, NEVER_TAMED, EGGS, NESTS } =
    await import('/src/data/beasts.js');
  const creatures = await import('/src/art/creatures.js');
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

  /* ------------------------------------------------------ one body each ---
     Everybody sharing a sprite class was drawn from one body, so every guard in
     Westeros was the same man with the same haircut standing in a different
     town, and a street of eight people was two drawings. A person's own name is
     the seed now: their hair, its colour, the shade of their skin and the exact
     dye of their coat all move, while what the class actually means - a
     maester's chain, a guard's helm, a Lannister's crimson - stays put, so the
     town still reads at a glance and nobody in it is a copy. */
  function bodyHash(key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function nudge(hex, dr, dg, db) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v, d) => Math.max(0, Math.min(255, v + d));
    return '#' + [c(n >> 16, dr), c((n >> 8) & 255, dg), c(n & 255, db)]
      .map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  const HAIR_FOR = {
    man: ['short', 'crop', 'long'],
    woman: ['long', 'braid', 'bun'],
    child: ['crop', 'short'],
  };

  function personLook(sprite, name) {
    const base = actors.ACTOR_PALETTES[sprite] ?? actors.ACTOR_PALETTES.smallfolk;
    let h = bodyHash(`${sprite}|${name}`);
    const roll = (n) => { h = (Math.imul(h ^ (h >>> 13), 1274126177) >>> 0); return (h >>> 9) % n; };
    const spec = { ...base, palette: { ...(base.palette ?? base) } };
    const p = spec.palette;
    // Hair, but only for people whose heads are not already saying something.
    const set = HAIR_FOR[spec.build ?? 'man'];
    if (set && ['short', 'crop', 'long', 'braid', 'bun'].includes(spec.hair ?? 'short')) {
      spec.hair = set[roll(set.length)];
    }
    // Their colouring. Hair moves furthest, skin a little, the coat least of
    // all - a Lannister still has to look like a Lannister from across a room.
    const hairShift = [-40, -22, -8, 0, 14, 30][roll(6)];
    p.hair = nudge(p.hair, hairShift, hairShift - roll(8), hairShift - roll(12));
    p.hairLight = nudge(p.hairLight, hairShift, hairShift - roll(8), hairShift - roll(12));
    const skinShift = [-26, -14, -6, 0, 8, 16][roll(6)];
    p.skin = nudge(p.skin, skinShift, skinShift - roll(6), skinShift - roll(10));
    p.skinDark = nudge(p.skinDark, skinShift, skinShift - roll(6), skinShift - roll(10));
    const coat = roll(11) - 5;
    p.cloak = nudge(p.cloak, coat * 2, coat * 2, coat * 2);
    p.cloakDark = nudge(p.cloakDark, coat * 2, coat * 2, coat * 2);
    const leg = roll(9) - 4;
    p.legs = nudge(p.legs, leg * 3, leg * 3, leg * 3);
    p.boots = nudge(p.boots, leg * 3, leg * 3, leg * 3);
    return spec;
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
      /* Who they cannot stand and who they can, as bits over the nine. The
         browser has had this since the beginning and the cartridge has never
         seen it, which is why swearing to Stark and swearing to Lannister were
         the same game with a different colour on the frames. */
      rivals: (h.rivals ?? []).reduce((m, r) =>
        SWEARABLE.indexOf(r) < 0 ? m : m | (1 << SWEARABLE.indexOf(r)), 0),
      allies: (h.allies ?? []).reduce((m, a) =>
        SWEARABLE.indexOf(a) < 0 ? m : m | (1 << SWEARABLE.indexOf(a)), 0),
    };
  });
  /* Which of the nine somebody on the road answers to, read off how they are
     dressed. Outlaws, hedge knights, the Watch and the free folk answer to
     nobody who can be sworn to, so killing them costs you nothing with anyone -
     which is most of the reason the roads are full of them. */
  const houseOfSprite = (sprite) => {
    const id = SPRITE_HOUSE[sprite];
    const at = id ? SWEARABLE.indexOf(id) : -1;
    return at < 0 ? 255 : at;
  };
  /* The same thing for a house named outright. makeRoamer hands back a house
     as a string, and a string carried into the Duellist table comes out the
     other end as a bare identifier in the generated C. */
  const houseIndexOf = (id) => {
    const at = id ? SWEARABLE.indexOf(id) : -1;
    return at < 0 ? 255 : at;
  };

  // Where a sworn sword of each house walks out of their own gate. Every one of
  // these is a tile some door already lands you on, so it is walkable ground
  // that the audit has already checked rather than a coordinate picked by eye.
  // `level` is what you begin at, and it is not the same for everybody. The
  // ground around a seat decides it: the weakest fighter within one door of
  // Winterfell is level three, and of Casterly Rock, twenty-seven. Starting a
  // Lannister at level five would put them somewhere they cannot beat a single
  // person, which is not a harder game, it is no game. A sworn sword of a great
  // house in the richest seat in Westeros was never a nobody anyway.
  // Everybody starts at five, outdoors, in a town. Nobody starts at
  // twenty-three inside somebody's hall, which is what happens if you pick a
  // seat by its name without checking whether it is a building - Casterly Rock
  // is an interior map, and a Lannister woke up in a room.
  //
  /* The levels these people begin at do not need setting against the ground any
     more, because the ground is set against them: see `stride` below.
     These coordinates are load-bearing and nothing else in the build checks
     them: redraw a seat and three houses start the game standing inside a
     wall. tools/checkstarts.mjs is the check. */
  const SEAT_START = {
    stark:     { map: 'winterfell',  x: 12, y: 12, dir: 0, level: 5 },
    lannister: { map: 'lannisport',  x: 9,  y: 15, dir: 0, level: 5 },
    tully:     { map: 'riverrun',    x: 10, y: 17, dir: 1, level: 5 },
    targaryen: { map: 'dragonstone', x: 11, y: 18, dir: 1, level: 5 },
    greyjoy:   { map: 'pyke',        x: 11, y: 12, dir: 1, level: 5 },
    arryn:     { map: 'theEyrie',    x: 11, y: 5,  dir: 0, level: 5 },
    tyrell:    { map: 'highgarden',  x: 11, y: 14, dir: 0, level: 5 },
    martell:   { map: 'sunspear',    x: 14, y: 9,  dir: 0, level: 5 },
    baratheon: { map: 'stormsEnd',   x: 11, y: 17, dir: 0, level: 5 },
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
      /* How the blow arrives, which is the whole of why one technique is worth
         choosing over another: something heavy is what you answer plate with,
         and something with a point is what you answer a fast man in leather
         with. 0 an edge, 1 a weight, 2 a point. */
      bite: ['crush', 'sweep', 'headbutt', 'gore', 'shieldBash', 'grapple'].includes(id) ? 1
          : ['thrust', 'lunge', 'skewer', 'backstab', 'loose', 'volley', 'harry',
             'bite', 'claw'].includes(id) ? 2 : 0,
      /* And everything a technique has always had in the browser and had no
         field to arrive in: what it costs you in wind, whether it goes first,
         and what it does to somebody besides taking their health off. All of
         this was written years ago and never once reached the cartridge, which
         is why every fight in it was pick the biggest number and press A. */
      wind: Math.min(15, TECHNIQUES[id].stamina ?? 0),
      first: Math.min(3, TECHNIQUES[id].priority ?? 0),
      stun: TECHNIQUES[id].effect?.stun ? 1 : 0,
      guardBreak: TECHNIQUES[id].effect?.guardBreak ? 1 : 0,
      bleed: TECHNIQUES[id].effect?.bleed || TECHNIQUES[id].effect?.burn ? 1 : 0,
      /* A wound that keeps costing you is one idea; whether it is a cut or a
         burn only changes the word, and the word is worth having. */
      burn: TECHNIQUES[id].effect?.burn ? 1 : 0,
      /* How often the effect lands, in a hundred. */
      chance: Math.round((TECHNIQUES[id].chance ?? 0) * 100),
      needsShield: TECHNIQUES[id].needsShield ? 1 : 0,
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
    record.fixed = record.fixed ? 1 : 0;
    if (record.house === undefined) record.house = 255;
    /* Every one of these is written into a u8 slot. A string that reaches one
       becomes a bare identifier in the generated C and the failure surfaces
       seventy thousand lines into data.h as "use of undeclared identifier
       tyrell", which says nothing at all about where it came from. Fail here,
       where the record still has a name on it. */
    for (const slot of ['house', 'sworn', 'host', 'level', 'vigour', 'might',
                        'guard', 'swiftness', 'reward', 'exp']) {
      const v = record[slot];
      if (v !== undefined && typeof v !== 'number') {
        throw new Error(`duellist "${record.name}" has ${slot}=${JSON.stringify(v)}, `
          + 'which is not a number and cannot go into the table');
      }
    }
    const key = record.name + '|' + record.level;
    if (duellistIndex.has(key)) return duellistIndex.get(key);
    const at = duellists.length;
    duellistIndex.set(key, at);
    duellists.push(record);
    return at;
  }

  /* The sixteen sorts of person who walk the roads, as things you can take
     into your own service rather than only things to knock down. Their numbers
     are read off the same generator that dresses them as opponents, sampled at
     two levels so the cartridge can work out the rest with a multiply. */
  const SWORN_IDS = Object.keys(ROAMERS);
  const swornKinds = SWORN_IDS.map((id) => {
    const low = makeRoamer(id, 10, (l) => l[0]);
    const high = makeRoamer(id, 40, (l) => l[0]);
    return {
      name: low.name,
      might10: low.might, might40: high.might,
      guard10: low.guard, guard40: high.guard,
      vigour10: low.vigour, vigour40: high.vigour,
    };
  });
  const swornOf = (id) => {
    const at = SWORN_IDS.indexOf(id);
    return at < 0 ? 255 : at;
  };
  /* Anybody standing on a road can be sworn, whether or not they were written
     with a roamer's name on them: whoever this region breeds is who they turn
     out to have been. */
  const swornForRegion = (region) => {
    const table = ROAMER_TABLES[region] ?? ROAMER_TABLES['The Crownlands'];
    return swornOf(table[0]);
  };

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
      reward: 12 + level * 6,
      exp: 18 + level * 9,
      mortal: 1, dead: sprite === 'whitewalker' ? 1 : 0,
      intro: `${name} squares up.`,
      defeat: `${name} goes down and does not get up.`,
    };
  }

  /* What each region's greenery is seen under, as a multiplier on red, green
     and blue. A one is the baseline - the Riverlands and the Crownlands are
     what everything else is a departure from. */
  /* Which of the ten tunes a region is heard under. Indoors anywhere is the
     room tune; the rest is country. */
  /* Five deep beyond the Wall down to nothing in Dorne. Paired with the
     winter's own count in the cartridge, this is the whole map of how far the
     dead have walked. */
  const COLD_OF = {
    'Beyond the Wall': 6,
    'The Wall': 5,
    'The North': 4,
    'The Neck': 3,
    'The Riverlands': 3, 'The Vale': 3, 'The Iron Islands': 3,
    'The Westerlands': 2, 'The Crownlands': 2,
    'The Reach': 2, 'The Stormlands': 2,
    Dorne: 1,
    /* Nought is not "warm" - it is "the cold never comes here". Every room in
       the game is nought, and so is everything on the far side of the Narrow
       Sea: salt water and eight thousand miles. Whatever is coming, it is not
       coming to Meereen. */
    'The Narrow Sea': 0, Braavos: 0, Pentos: 0, Volantis: 0, Meereen: 0,
  };
  const TUNE_FOR = {
    'The North': 3, 'The Wall': 3, 'Beyond the Wall': 7, 'The Neck': 3,
    'The Vale': 3,
    'The Riverlands': 4, 'The Reach': 4, 'The Crownlands': 4,
    'The Westerlands': 4,
    'Dorne': 5, 'Pentos': 5, 'Volantis': 5, 'Meereen': 5, 'Braavos': 6,
    'The Iron Islands': 6, 'The Stormlands': 6, 'The Narrow Sea': 6,
    'Dragonstone': 7,
  };

  const CLIMATE = {
    'The North':       [0.84, 0.94, 1.02],   // cold, blue, the light thin
    'The Wall':        [0.84, 0.94, 1.06],
    'Beyond the Wall': [0.80, 0.90, 1.06],
    'The Neck':        [0.86, 1.00, 0.78],   // bog: yellow-green and murky
    'The Vale':        [0.92, 0.98, 1.04],   // high and pale
    'The Westerlands': [1.10, 1.02, 0.80],   // dry gold over the hills
    'The Reach':       [1.06, 1.06, 0.76],   // the richest country in the world
    'The Stormlands':  [0.86, 0.94, 1.00],   // dark under weather
    'Dorne':           [1.16, 1.00, 0.72],   // sun, and not much else
    'The Iron Islands':[0.88, 0.96, 0.94],   // salt-burnt and slate
    'Dragonstone':     [0.94, 0.84, 0.86],   // ash on everything
    'Braavos':         [0.92, 0.98, 1.00],
    'Pentos':          [1.12, 1.02, 0.80],
    'Volantis':        [1.14, 1.00, 0.76],
    'Meereen':         [1.16, 1.02, 0.74],
  };

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
      hold: def.hold ?? 0,
      /* Obsidian, or Valyrian steel, which is obsidian's cleverer cousin: the
         two things in the world that cut the dead. Read off the name rather
         than flagged by hand, so a new dragonglass weapon works the day it is
         written. */
      obsidian: /dragonglass|valyrian|ancestral/i.test(id) ? 1 : 0,
      /* Which of the seven things a relic does. Read off the name so that a
         relic added to the table works without touching the cartridge. */
      relic: ['huntersDraught', 'warhorn', 'maestersSalts', 'shadeOfTheEvening',
              'wildfire', 'weirwoodPaste', 'dragonHorn'].indexOf(id) + 1,
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
  for (const [id, def] of Object.entries(HELMS)) if (def.price) ware(id, def, 'helm');
  for (const [id, def] of Object.entries(GLOVES)) if (def.price) ware(id, def, 'gloves');
  /* And the things a recipe makes that nobody sells: they still have to exist
     as wares, or there is nothing for the forge to hand you. */
  for (const r of RECIPES) {
    const from = WEAPONS[r.makes] ? ['weapon', WEAPONS] : ARMOUR[r.makes] ? ['armour', ARMOUR]
               : SHIELDS[r.makes] ? ['shield', SHIELDS] : HELMS[r.makes] ? ['helm', HELMS]
               : GLOVES[r.makes] ? ['gloves', GLOVES] : null;
    if (from && !wareIndex.has(`${from[0]}:${r.makes}`)) ware(r.makes, from[1][r.makes], from[0]);
  }
  /* Materials are wares too - they live in the same pouch and the same record.
     The common ones are on the pedlar's table at a price, because a forge you
     can only use when the road happens to have given you an ash haft is a
     forge you use twice; the two rarest are not for sale at any price, so the
     best blades in the game are still something you have to go and find. */
  const matSlot = new Map();
  for (const id of MATERIAL_IDS) {
    const m = MATERIALS[id];
    const price = m.tier >= 3 ? 0 : 40 + m.tier * 140;
    matSlot.set(id, ware(id, { ...m, price }, 'stuff'));
  }
  /* What you throw over an animal, and what you carry home from a nest. */
  for (const [id, def] of Object.entries(SNARES)) ware(id, def, 'snare');
  /* And what you put in front of somebody who has yielded, which is the same
     idea aimed at a person: they swear instead of dying. */
  for (const [id, def] of Object.entries(OATHS)) ware(id, def, 'oath');
  for (const [id, def] of Object.entries(EGG_ITEMS)) ware(id, def, 'egg');
  /* And the relics, which are the reason a chest is still worth opening once
     you are wearing the best of everything. */
  for (const id of Object.keys(RELICS)) ware(id, RELICS[id], 'relic');

  const potions = wares.map((w, i) => (w.kind === 'potion' ? i : -1)).filter((i) => i >= 0);
  /* A writ under a seal is a maester's business, not a smith's, so the oaths
     go on the same counter as the remedies. */
  const oathWares = wares.map((w, i) => (w.kind === 'oath' && w.price ? i : -1))
    .filter((i) => i >= 0);
  /* Nets belong on a maester's counter as well as a smith's. They were only
     ever on the armourer's, which is the one counter a player looking for a way
     to take something alive has no reason to open - so the whole half of the
     game that is about catching things was behind a door marked ARMS AND
     ARMOUR. */
  const snareWares = wares.map((w, i) => (w.kind === 'snare' && w.price ? i : -1))
    .filter((i) => i >= 0);
  const ofKind = (...kinds) => wares
    .map((w, i) => (kinds.includes(w.kind) && w.price ? i : -1))
    .filter((i) => i >= 0);
  const forSale = {
    apothecary: potions.concat(snareWares).concat(oathWares),
    /* Steel on one counter and everything you put on over it on another, so
       looking for a helm is not reading past twenty-four swords first. */
    weapons: ofKind('weapon'),
    armour: ofKind('armour', 'shield', 'helm', 'gloves'),
    /* And the table by the door with the rest of it: relics, and the makings
       a smith or a maester will want off you when you ask them to build
       something. */
    oddments: ofKind('relic').concat(ofKind('stuff')),
  };

  /* The recipe book, in ware numbers. */
  const wareOf = (id) => {
    for (const k of ['weapon', 'armour', 'shield', 'helm', 'gloves',
                     'potion', 'stuff', 'snare', 'egg', 'relic', 'oath']) {
      if (wareIndex.has(`${k}:${id}`)) return wareIndex.get(`${k}:${id}`);
    }
    throw new Error(`recipe makes ${id}, which is not a ware`);
  };
  const recipes = RECIPES.map((r) => ({
    at: r.at === 'forge' ? 1 : 0,
    makes: wareOf(r.makes),
    gold: r.gold,
    needs: r.needs.map(([m, n]) => [wareOf(m), n]),
  }));
  const spoils = SPOILS.map((band) => ({
    upTo: band.upTo, drops: band.drops.map(wareOf),
  }));
  const forage = FORAGE.map(wareOf);

  /* ----------------------------------------------------------- the beasts ---
     Thirty-five animals the browser game already knows how to draw and how to
     grow. A duel here is fought with four numbers rather than six, so what
     comes across is: how big it is, how hard it hits, how hard it is to hurt,
     how fast, what it does when it is angry, how hard it is to take alive, and
     what it turns into. The picture comes over whole, centred in a
     sixty-four-square so the hardware can draw it in one object. */
  const beastIds = Object.keys(SPECIES);
  const beastSlot = new Map(beastIds.map((id, i) => [id, i]));
  const beasts = beastIds.map((id) => {
    const sp = { id, ...SPECIES[id] };
    const drawn = creatures.creatureSprite(sp);
    const big = document.createElement('canvas');
    big.width = 64; big.height = 64;
    big.getContext('2d').drawImage(drawn, (64 - drawn.width) >> 1, (64 - drawn.height) >> 1);
    const grow = GROWS_INTO[id];
    return {
      id, name: sp.name,
      hp: sp.base.hp, atk: sp.base.atk, def: sp.base.def, spe: sp.base.spe,
      techs: techSlots(BEAST_TECHNIQUES[sp.archetype] ?? BEAST_TECHNIQUES.wolf),
      hold: sp.catchRate ?? 45,
      tame: NEVER_TAMED.includes(id) ? 0 : 1,
      into: grow ? beastSlot.get(grow.into) : 255,
      growAt: grow ? grow.at : 0,
      /* Something that was already dead when it got up. Steel is nearly no use
         against these and obsidian takes them apart, the same as it does for
         the Walkers who raise them. */
      dead: sp.archetype === 'wight' || /wight|barrowlord|palewalker|ghostfang/i.test(id) ? 1 : 0,
      w: 64, h: 64, frames: [read(big)],
    };
  });
  const eggs = EGGS.map((e) => ({
    ware: wareIndex.get(`egg:${e.item}`),
    beast: beastSlot.get(e.hatches),
    wins: e.wins,
  }));

  /* The last act. The per-house lines are indexed by the cartridge with
     you.house, so the order here has to be the order the houses are exported
     in - checked rather than assumed, because getting it wrong would give a
     Stark the Greyjoy ending and nothing would ever say so. */
  for (let i = 0; i < SWEARABLE.length; i++) {
    if (SWEARABLE[i] !== TALE_HOUSES[i]) {
      throw new Error(`the last act lists houses in a different order: `
        + `${TALE_HOUSES[i]} where ${SWEARABLE[i]} belongs`);
    }
  }
  const tales = TALE_ORDER.map((id) => ({
    id, name: TALES[id].name,
    pages: TALES[id].pages.map((p) => ({
      sky: p.sky ?? 0, mark: p.mark ?? 0, title: p.title, body: p.body,
      byHouse: p.byHouse ?? null,
    })),
  }));

  /* The story calls this one by name; no map has him standing on it, so he has
     to be pushed into the table by hand or he would not be in the cartridge. */
  const throneChampion = pushDuellist({
    fixed: 1,
    name: DUELLISTS.throneChampion.name, level: DUELLISTS.throneChampion.level,
    vigour: DUELLISTS.throneChampion.vigour, might: DUELLISTS.throneChampion.might,
    guard: DUELLISTS.throneChampion.guard, swiftness: DUELLISTS.throneChampion.swiftness,
    techs: techSlots(DUELLISTS.throneChampion.techniques),
    reward: DUELLISTS.throneChampion.reward, exp: DUELLISTS.throneChampion.exp,
    mortal: 0, dead: 0,
    intro: DUELLISTS.throneChampion.intro, defeat: DUELLISTS.throneChampion.defeat,
  });

  const out = { maps: [], houses, techniques, learned, duellists, wares, forSale,
                recipes, spoils, forage, beasts, eggs, tales, throneChampion,
                swornKinds,
                leaders: [], actors: null };

  /* The spine of the game, in the order it is meant to be walked. Nine seats,
     nine sigils; the cartridge rotates this so that your own liege is the last
     one you fight rather than the first, which is why swearing to a different
     house is a different route through the same world rather than the same
     route with a different colour on the status card. */
  const LEADER_ORDER = ['gymStark', 'gymTully', 'gymArryn', 'gymTyrell', 'gymLannister',
                        'gymGreyjoy', 'gymMartell', 'gymBaratheon', 'gymTargaryen',
                        'gymThrone'];

  /* How hard the road is here.
   *
   * This used to be the map's position in the export list, which meant
   * difficulty was an accident of the order somebody typed the names in: append
   * a map and it became endgame ground whatever it was. Appending the road
   * south is exactly what happened, and it is why a new sworn sword of House
   * Lannister woke among level thirties.
   *
   * It is distance now. Every house's seat is nought, everything one door away
   * is one, and the level of anybody without a name of their own goes up as you
   * walk out from the nearest of them - which is the arrangement every
   * handheld role-playing game has used since the first one: a gentle town, and
   * the world getting harder the further you go from it. Named characters keep
   * their own numbers, so the people worth being frightened of stay frightening
   * wherever they happen to stand. */
  function walkFrom(fromIds) {
    const seen = new Map(fromIds.map((id) => [id, 0]));
    const queue = [...fromIds];
    while (queue.length) {
      const at = queue.shift();
      const here = seen.get(at);
      for (const w of (MAPS[at]?.warps ?? [])) {
        if (!mapIds.includes(w.to) || seen.has(w.to)) continue;
        seen.set(w.to, here + 1);
        queue.push(w.to);
      }
    }
    return seen;
  }

  /* And whose seat you count from is the player's, not the world's.
   *
   * One table of distances shared by everybody meant the world was laid out
   * around whichever seat happened to be nearest, so a Targaryen who never
   * left Dragonstone found the same gentle ground a Stark found at Winterfell
   * and then hit a wall the moment either of them travelled - and a Lannister
   * woke up surrounded by people twenty levels above them. Each house gets its
   * own table: nought at your own seat, and everything harder the further you
   * walk from it, whoever you are. The numbers baked into the cartridge use the
   * northern table, and the cartridge shifts every nameless person on the road
   * by the difference between that and yours. */
  const strideBy = {};
  for (const h of houses) {
    strideBy[h.id] = mapIds.includes(h.start.map) ? walkFrom([h.start.map]) : new Map();
  }

  /* Doors are not the unit. House Tully's whole world is seven doors across and
     House Martell's is thirteen, so three levels a door gave a Tully a world
     that topped out at twenty-four while the last two sigils wanted thirty-eight
     and forty-four - a wall with nothing to climb it on. What matters is how far
     through your own world you are, not how many doorways the mapmaker happened
     to put in it, so each house's road is stretched over the same span: level
     three at your own gate, level forty-four at the far end of everything. */
  const groundBy = houses.map((h) => {
    const st = strideBy[h.id];
    const far = Math.max(1, ...mapIds.map((id) => st.get(id) ?? 0));
    return mapIds.map((id) => Math.min(44, 3 + Math.round(41 * (st.get(id) ?? far) / far)));
  });
  out.groundBy = groundBy;
  const stride = strideBy[houses[0].id];
  out.stride = Object.fromEntries(stride);

  for (const id of mapIds) {
    const map = MAPS[id];
    const width = map.width ?? map.grid[0].length;
    const height = map.height ?? map.grid.length;
    const cells = [];
    const solid = [];
    const cover = [];
    const ledge = [];
    const counter = [];
    const water = [];
    /* Every pickup the browser game puts on the ground becomes a chest here:
       a thing you walk up to and open, rather than a tile you happen to tread
       on and a line of text you may not have read. */
    const chestAt = new Set((map.items ?? []).map((it) => `${it.x},${it.y}`));
    /* Something worth finding, in the corners of the world.
     *
     * Twenty of the fifty-four places you can walk outdoors had nothing on them
     * at all, and every one of those twenty was a town - so the biggest, most
     * carefully built spaces in the game were the ones with the least reason to
     * walk into a corner of. You could cross Braavos end to end and be certain,
     * correctly, that there was nothing off the road.
     *
     * These are placed rather than written: the map is read for its dead ends
     * and blind alcoves - a walkable tile with one way in, or two - and the
     * best of them, furthest from any door and well apart from each other, get
     * something in them. Somewhere you only stand if you went looking.
     *
     * Deterministic in the map's own name, so the same alcove holds the same
     * thing in every build and a player can be told where something is. */
    const hidden = (() => {
      if (map.indoor) return [];
      const solidGrid = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) solidGrid.push(isSolid(map.grid[y][x] ?? '.') ? 1 : 0);
      }
      const walkable = (x, y) => x >= 0 && y >= 0 && x < width && y < height
        && !solidGrid[y * width + x];
      const doors = (map.warps ?? []).map((w) => [w.x, w.y]);
      const people = new Set((map.npcs ?? []).map((n) => `${n.x},${n.y}`));
      const away = (x, y) => doors.reduce((best, [dx, dy]) =>
        Math.min(best, Math.abs(dx - x) + Math.abs(dy - y)), 99);
      /* A chest is furniture: solid, and standing where it stands. Drop one
         into a two-way nook and everything behind it is walled off, and narrow
         a corridor with one and somebody roaming can plug what is left. So
         every candidate is tried before it is kept - the map is flooded from a
         door with the chest in place, and if a single tile stops being
         reachable, or a neighbour is left with one way out, it does not go
         there. Generated placement has to be checked, not trusted. */
      const blocked = new Set();
      const reach = () => {
        const start = (map.warps ?? []).find((w) => walkable(w.x, w.y))
          ?? (() => {
            for (let y = 0; y < height; y++) {
              for (let x = 0; x < width; x++) if (walkable(x, y)) return { x, y };
            }
            return null;
          })();
        if (!start) return 0;
        const seen = new Set([`${start.x},${start.y}`]);
        const queue = [[start.x, start.y]];
        let n = 0;
        while (queue.length) {
          const [cx, cy] = queue.pop();
          n++;
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + ox, ny = cy + oy, key = `${nx},${ny}`;
            if (!walkable(nx, ny) || blocked.has(key) || seen.has(key)) continue;
            seen.add(key);
            queue.push([nx, ny]);
          }
        }
        return n;
      };
      const whole = reach();
      const openAt = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .filter(([ox, oy]) => walkable(x + ox, y + oy)
          && !blocked.has(`${x + ox},${y + oy}`)).length;

      const spots = [];
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          if (!walkable(x, y)) continue;
          if (chestAt.has(`${x},${y}`) || people.has(`${x},${y}`)) continue;
          if ((map.grid[y][x] ?? '.') === 'D') continue;
          /* Never against another chest. A chest is solid, so one set down
             beside a chest that was written into the map by hand can be the
             only tile anybody could have stood on to open it - which is how
             the ransom at the Bloody Gate came to be walled in by a purse. */
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]]
              .some(([ox, oy]) => chestAt.has(`${x + ox},${y + oy}`))) continue;
          const open = openAt(x, y);
          if (open < 1 || open > 2) continue;      /* a nook, not a thoroughfare */
          const far = away(x, y);
          if (far < 5) continue;                   /* not on anybody's doorstep */
          /* And well clear of where anybody stands, so a chest and a person
             cannot pinch a way through between them. */
          let crowded = 0;
          for (const who of people) {
            const [px, py] = who.split(',').map(Number);
            if (Math.abs(px - x) + Math.abs(py - y) < 3) crowded = 1;
          }
          if (crowded) continue;
          spots.push({ x, y, score: far * 4 + (open === 1 ? 30 : 0) });
        }
      }
      spots.sort((a, b) => b.score - a.score);
      let seed = 0;
      for (const c of id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
      const roll = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
      const want = Math.min(4, Math.max(2, Math.round((width * height) / 240)));
      const took = [];
      for (const spot of spots) {
        if (took.length >= want) break;
        if (took.some((t) => Math.abs(t.x - spot.x) + Math.abs(t.y - spot.y) < 6)) continue;
        blocked.add(`${spot.x},${spot.y}`);
        /* Nothing behind it, and nothing beside it left with one way out. */
        const severs = reach() !== whole - blocked.size;
        const pinches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => {
          const nx = spot.x + ox, ny = spot.y + oy;
          return walkable(nx, ny) && !blocked.has(`${nx},${ny}`) && openAt(nx, ny) < 2;
        });
        if (severs || pinches) { blocked.delete(`${spot.x},${spot.y}`); continue; }
        /* Two in three are a purse somebody hid and did not come back for; the
           rest are makings, so that walking into corners feeds the forge. */
        took.push({ x: spot.x, y: spot.y, stuff: roll() < 0.34 });
      }
      return took;
    })();
    for (const h of hidden) chestAt.add(`${h.x},${h.y}`);
    /* The light a region is seen under.
     *
     * Seven regions are floored in the same grass, walled with the same trees
     * and dressed with the same flowers, so the Wolfswood, the Reach and the
     * Stormlands were three names for one picture. This shifts the living
     * ground - and only the living ground - towards the colour each place is
     * actually described in.
     *
     * Only grass, reeds, trees and blossom, because the palette is two hundred
     * and thirty-nine colours shared by every map on the cartridge and the
     * frequent colours win the slots. Tinting the whole world would spend the
     * palette on nine versions of a roof tile. */
    const tint = CLIMATE[REGIONS[id] ?? ''] ?? null;
    const LIVING = new Set([',', ';', '#', 'P', 'W', '*', '.']);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const char = chestAt.has(`${x},${y}`) ? 'j' : (map.grid[y][x] ?? '.');
        const canvas = tileCanvas(char, 0, maskFor(map, char, x, y),
          map.ground ?? 'grass', pixels.variantFor(x, y, 4));
        const px = read(canvas);
        if (tint && LIVING.has(char)) {
          for (let q = 0; q < px.length; q += 4) {
            px[q] = Math.max(0, Math.min(255, Math.round(px[q] * tint[0])));
            px[q + 1] = Math.max(0, Math.min(255, Math.round(px[q + 1] * tint[1])));
            px[q + 2] = Math.max(0, Math.min(255, Math.round(px[q + 2] * tint[2])));
          }
        }
        cells.push(px);
        solid.push(isSolid(char) ? 1 : 0);
        // Cover: the tall grass and the reeds. Nothing jumps you on a paved road.
        cover.push(tileDef(char).kind === 'encounter' ? 1 : 0);
        // A ledge you can drop off but not climb.
        ledge.push(tileDef(char).kind === 'ledge' ? 1 : 0);
        // A counter is solid, but you can lean over one and speak to whoever
        // is behind it. Without this a stallholder could only be reached by
        // walking round the end of their own stall and standing beside them.
        counter.push(char === 'K' ? 1 : 0);
        /* Open water. It is already in `solid`, because on foot it is a wall --
           but a ship needs to know WHICH walls are the sea, since under sail
           those are the only ground there is and everything else is the wall.
           One bit a tile, and the cartridge can turn a map inside out. */
        water.push(tileDef(char).kind === 'water' ? 1 : 0);
      }
    }

    /* How hard this ground is, in the northern reckoning. The cartridge shifts
       it to whichever seat the player actually started from - so this has to be
       the same number the first row of that table holds, or the shift lands
       somewhere nobody meant. */
    const roadLevel = groundBy[0][mapIds.indexOf(id)];

    const npcs = (map.npcs ?? []).map((n) => {
      const sprite = n.sprite ?? 'smallfolk';
      // Anyone the browser game already has numbers for fights with those
      // numbers: a named duellist directly, a trainer through the same
      // conversion the browser uses when they draw on you in person.
      /* Several people are written with `duel: 'hedgeKnight'` and the like,
         which names a roamer rather than one of the cast. Those were quietly
         falling through to a generic body with generic numbers, so a sworn
         brother of the Watch and a Dornish spear fought identically. */
      const named = n.data?.duel
        ? (DUELLISTS[n.data.duel]
           ?? (ROAMERS[n.data.duel] ? makeRoamer(n.data.duel, roadLevel, (l) => l[0]) : null))
        : (n.data?.trainer && TRAINERS[n.data.trainer] ? trainerAsDuellist(n.data.trainer)
        : null);
      const level = named?.level ?? roadLevel;
      const fighter = named
        ? {
            /* Somebody the story knows by name keeps their own numbers
               wherever they stand. Everybody else is dressed by the road. */
            fixed: n.data?.duel && DUELLISTS[n.data.duel] ? 1
              : n.data?.trainer && TRAINERS[n.data.trainer] ? 1 : 0,
            name: named.name, level: named.level,
            vigour: named.vigour, might: named.might,
            guard: named.guard, swiftness: named.swiftness,
            techs: techSlots(named.techniques),
            reward: named.reward, exp: named.exp,
            mortal: named.canYield === false ? 0 : 1,
            /* One of the dead. Steel is nearly useless against these; obsidian
               takes them apart. It is the reason to walk the Haunted Forest
               picking dragonglass up off the ground. */
            dead: sprite === 'whitewalker' ? 1 : 0,
            intro: named.intro, defeat: named.defeat,
          }
        : roadFighter(n.name ?? 'Stranger', sprite, level);
      /* Which sort of sworn sword this person turns out to have been, if you
         put a purse in front of them instead of finishing it. Somebody the
         story knows by name is not for hire at any price. */
      fighter.sworn = (n.data?.duel && DUELLISTS[n.data.duel])
        || (n.data?.trainer && TRAINERS[n.data.trainer]) ? 255
        : n.data?.duel && ROAMERS[n.data.duel] ? swornOf(n.data.duel)
        : swornForRegion(REGIONS[id] ?? '');
      /* How many swords stand behind them. A captain on his own gate is not a
         captain; this is what makes a fight at a stronghold a fight between
         two companies rather than two people. */
      fighter.host = n.data?.host ?? 0;
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
      /* Which counter this one keeps. One stall carrying seventy-six things is
         not a shop, it is a warehouse: a player looking for a helm had to read
         past every sword in the game to find one. Four counters now - the
         apothecary, the weaponsmith, the armourer and the oddments table - and
         a town has somebody standing behind each. */
      /* Name as well as script, and the narrowest rule first. Three people in
         the world are called Armourer and every one of them was filed as a
         smith or a shopkeeper by their script alone, so the armour shelf was
         one nobody in Westeros stood behind. */
      const keeps = `${n.script ?? ''} ${n.name ?? ''}`;
      const trade = /armour|quartermaster|bellows/i.test(keeps) ? 3
        : /smith|forge/i.test(keeps) ? 2
        : /pedlar|oddment|trader|harbour|stable|factor/i.test(keeps) ? 4
        : /shop|merchant|apothec|healer|maester|steward/i.test(keeps) ? 1 : 0;
      const sight = n.data?.trainer && TRAINERS[n.data.trainer]
        ? Math.min(5, TRAINERS[n.data.trainer].sight ?? 0) : 0;
      if (n.data?.trainer && TRAINERS[n.data.trainer]?.leader) {
        const def = TRAINERS[n.data.trainer];
        out.leaders.push({
          id: n.data.trainer, order: LEADER_ORDER.indexOf(n.data.trainer),
          duellist: pushDuellist(fighter), house: def.house ?? '',
          sigil: def.sigil ?? '', name: def.name, seat: MAPS[id].name, map: id,
        });
      }
      return {
        x: n.x, y: n.y, dir: actors.DIRECTIONS.indexOf(n.dir ?? 'down'), said,
        name: n.name ?? '', script: n.script ?? '', sprite, trade, sight,
        actor: actorFor(personLook(sprite, n.name ?? ''), `${sprite}|${n.name ?? ''}`),
        duellist: pushDuellist({ ...fighter, house: houseOfSprite(sprite) }),
        // A town is not a waxwork. Everybody has somewhere to be except the
        // people whose whole job is to stand behind something.
        roams: /healer|merchant|shop|smith|innkeep|steward|harbour|ship|court|stable|kennel/i
          .test(n.script ?? '') ? 0 : 1,
        // A maester will put you back together. A maester will not fight you,
        // and neither will a child or a septa.
        heals: /healer|maester/i.test(n.script ?? '') || /Maester/.test(n.name ?? '') ? 1 : 0,
        /* Who will not draw on you: children, and people sworn not to. A White
           Walker was on this list, which meant the Night King and every risen
           man on the Fist could be walked up to, spoken to and not fought - the
           whole reason for going north was a conversation. */
        fights: ['child', 'girl', 'septa', 'maester'].includes(sprite) ? 0 : 1,
        // Somebody whose whole purpose is to fight you draws when you speak to
        // them. Challenging was bound to SELECT, which is not a button anybody
        // presses at a lord standing in his own hall: a house leader would say
        // his piece and then stand there, and that read as not being allowed to
        // fight him at all.
        challenges: /^(duel|gym|trainer)/i.test(n.script ?? '')
          && !/hint/i.test(n.script ?? '') ? 1 : 0,
        /* A harbourmaster is not a shopkeeper: speaking to one opens the
           passage list rather than a counter. */
        /* Exact names, not prefixes. This decides who sells passage across the
           Narrow Sea, and it read as a prefix -- so the moment a shipwright and
           a harbourmaster existed, both of them silently became ferry captains
           on the cartridge and neither of them said anything about it here.
           Deriving a capability from the spelling of a script name is a trap
           every time; at least make it an exact one. */
        sails: /^(ship|harbour)$/i.test(n.script ?? '') ? 1 : 0,
        /* A kennelmaster boards what you cannot carry. Speaking to one opens
           the holdfast rather than a counter or a conversation. */
        holds: /^kennel/i.test(n.script ?? '') ? 1 : 0,
        /* Somebody who will arrange a match. A sept is where that has always
           been done, so it is whoever is standing in one: no new role, no new
           art, and a septa is already somebody who will not fight you. */
        weds: sprite === 'septa' || /sept(on|a)/i.test(n.name ?? '') ? 1 : 0,
        /* Who will send you over the Wall. A ranging is the one thing in the
           game that pushes the winter back instead of watching it come, so it
           wants somebody standing in every place a player who has just been
           frightened by a raven would think to go. */
        ranges: /blackBrother|wallHint|palewalker/i.test(n.script ?? '')
          || sprite === 'nightswatch'
          || /commander|ranger|watch/i.test(n.name ?? '') ? 1 : 0,
        /* Who keeps the house with the red lamp. The browser game gave every
           town one and gave the keeper a script the cartridge never read, so
           the loudest room in every town was furniture. */
        evening: /houseKeeper/i.test(n.script ?? '') ? 1 : 0,
        /* Somebody standing in the road who is gone the moment you hold this
           many of the great seats. Without this the browser's wardens would be
           permanent walls on the cartridge and the roads behind them would
           never open at all. */
        gate: n.warden ?? 0,
      };
    });

    /* Who is out on this road. The browser rolls these as you walk; the
       cartridge picks from the same table, with the same numbers. */
    const ambushes = [];
    for (const row of map.encounters ?? []) {
      if (!row.roamer || !ROAMERS[row.roamer]) continue;
      /* Who is on this road comes from the encounter table; how hard they are
         does not. Those numbers were written for a game that always began at
         Winterfell, so the Dragonmont was full of level forties and a Targaryen
         who started there walked out of the gate into them. Distance decides,
         the same as it does for everybody standing still. */
      const level = Math.max(2, roadLevel + (ambushes.length % 3) - 1);
      const made = makeRoamer(row.roamer, level, (list) => list[0]);
      ambushes.push({
        actor: actorFor(personLook(made.sprite, made.name),
                        `${made.sprite}|${made.name}`),
        duellist: pushDuellist({
          name: made.name, level: made.level, vigour: made.vigour,
          might: made.might, guard: made.guard, swiftness: made.swiftness,
          techs: techSlots(made.techniques),
          reward: made.reward, exp: made.exp, mortal: 1,
          sworn: swornOf(row.roamer), host: 0,
          dead: made.sprite === 'whitewalker' ? 1 : 0,
          intro: made.intro, defeat: made.defeat,
        }),
      });
      if (ambushes.length >= 4) break;
    }

    /* And what lives here that is not a person. The browser's encounter tables
       already say; the cartridge simply never read those rows. */
    const wilds = [];
    for (const row of map.encounters ?? []) {
      if (!row.beast || !beastSlot.has(row.beast)) continue;
      wilds.push({
        beast: beastSlot.get(row.beast),
        level: Math.max(2, roadLevel + (wilds.length % 3) - 1),
      });
      if (wilds.length >= 4) break;
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

    /* A door tile with no warp behind it is a lie told to the player: they walk
       up to it and the world does not answer. Cheap to draw and impossible to
       spot by playing, since you have to try every door in every town. */
    {
      const open = new Set((map.warps ?? []).map((w) => `${w.x},${w.y}`));
      const dead = [];
      (map.grid ?? map.tiles).forEach((row, y) => {
        [...row].forEach((c, x) => {
          if (c === 'D' && !open.has(`${x},${y}`)) dead.push(`${x},${y}`);
        });
      });
      if (dead.length) {
        throw new Error(`${id}: door tiles that open onto nothing at ${dead.join(' ')}`);
      }
    }

    out.maps.push({
      id, name: map.name, width, height, cells, solid, cover, ledge, counter, water,
      /* What plays here. Three tunes covered a hundred and fifty-seven maps
         and a hundred and one of them asked for the same one, so the Wall,
         Dorne, Braavos and Winterfell were the same piece of music. */
      tune: TUNE_FOR[REGIONS[id] ?? ''] ?? (map.indoor ? 8 : 0),
      npcs, ambushes, wilds,
      chests: (map.items ?? []).map((it) => ({
        x: it.x, y: it.y,
        /* What is in it: the thing the map names if this game has such a thing,
           otherwise the road decides, which is what makes a chest at the far end
           of the world worth the walk. */
        ware: wareIndex.get(`potion:${it.item}`) ?? wareIndex.get(`weapon:${it.item}`)
          ?? wareIndex.get(`armour:${it.item}`) ?? wareIndex.get(`shield:${it.item}`)
          ?? wareIndex.get(`helm:${it.item}`) ?? wareIndex.get(`gloves:${it.item}`)
          ?? wareIndex.get(`stuff:${it.item}`) ?? 255,
        gold: 40 + roadLevel * 22,
      })).concat(hidden.map((h, n) => ({
        x: h.x, y: h.y,
        /* Makings scale with how hard the road is, so a nook at the Wall is
           worth going into and one outside Winterfell is worth a hafted stick. */
        ware: h.stuff
          ? forage[Math.min(forage.length - 1, Math.floor(roadLevel / 6) + (n % 2))] ?? 255
          : 255,
        gold: 55 + roadLevel * 30,
      }))),
      /* Nests: the one place in the world a given egg is ever found. */
      nest: (NESTS[id] ?? []).map((it) => wareIndex.get(`egg:${it}`))
        .filter((n) => n !== undefined)[0] ?? 255,
      scene,
      /* What somebody will take for this hall once you have cleared it out, in
         hundreds of gold. Zero everywhere but the halls behind a stronghold
         gate: a house you can buy on the high street is not a house. */
      seat: Math.min(255, map.seat ?? 0),
      /* Who holds this ground. Standing with them is what a merchant here is
         reading when they name a price, and what the men-at-arms in the street
         are reading when they decide whether to let you past. */
      holder: (() => {
        const id = REGION_HOUSE[region];
        const at = id ? SWEARABLE.indexOf(id) : -1;
        return at < 0 ? 255 : at;
      })(),
      /* Where the Iron Throne stands, on the one map that has one. */
      courtX: map.court ? map.court.x : 255,
      courtY: map.court ? map.court.y : 255,
      frost: (map.ground ?? 'grass') === 'snow' ? 1 : 0,
      /* How far north this ground is, which is the only thing the Long Night
         reads. The dead come down the map a region at a time as the winter
         deepens, so every road in the game needs to know where it stands
         between the Wall and the Water Gardens. Indoors is warm, and the cold
         does not cross the Narrow Sea. */
      cold: map.indoor ? 0 : (COLD_OF[region] ?? 2),
      warps: (map.warps ?? []).map((w) => ({ ...w })),
      signs: (map.signs ?? []).map((s) => ({ x: s.x, y: s.y, text: s.text })),
    });
  }

  /* The cutscenes.
     These were written a long time ago and never once reached the cartridge:
     nothing in the exporter had ever imported the file. Five scenes, and the
     road they are on is the reason walking it feels like nothing but fighting.
     A scene is a run of beats; the cartridge steps them one at a time. */
  const BEAT = { say: 0, wait: 1, shake: 2, flash: 3, spawn: 4, walk: 5,
                 face: 6, despawn: 7, sky: 8, flag: 9, choose: 10 };
  const sceneFlags = [];
  const flagAt = (name) => {
    let at = sceneFlags.indexOf(name);
    if (at < 0) { at = sceneFlags.length; sceneFlags.push(name); }
    /* Four words of them. One was not enough the moment the scenes became a
       story: ten scenes with three answers apiece is thirty flags before a
       single quest is counted. Three was not enough either — the count stood
       at ninety-five of ninety-six with four side quests written, so the fifth
       quest anybody added was always going to be the one that broke the
       build. Widening the record invalidates saves written by an older
       cartridge, which fail the checksum and are treated as no save rather
       than as a corrupt one. */
    if (at >= 128) throw new Error('more story flags than four words hold');
    return at;
  };
  const scenes = [];
  const beats = [];
  const choices = [];
  /* A scene stands on a tile, and the tile written down for it is a wish: the
     roads are carved fresh every build, so a coordinate that was open grass
     last month is inside a wood now. This walks outwards until it finds ground
     somebody can actually stand on, which is the difference between a scene
     that fires and a scene that is in the file. */
  const openTileNear = (map, wx, wy, why) => {
    for (let r = 0; r < 24; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = wx + dx, y = wy + dy;
          if (x < 1 || y < 1 || x >= map.width - 1 || y >= map.height - 1) continue;
          if (map.solid[y * map.width + x]) continue;
          if (map.ledge[y * map.width + x]) continue;
          if ((map.npcs ?? []).some((n) => n.x === x && n.y === y)) continue;
          if ((map.warps ?? []).some((w) => w.x === x && w.y === y)) continue;
          return { x, y };
        }
      }
    }
    throw new Error(`nowhere on ${map.id} for ${why} to happen`);
  };
  for (const id of CUTSCENE_IDS) {
    const cs = CUTSCENES[id];
    const map = out.maps.find((m) => m.id === cs.map);
    if (!map) throw new Error(`the cutscene ${id} stands on ${cs.map}, which is not on the cartridge`);
    const where = openTileNear(map, cs.x, cs.y, id);
    const slots = [];
    const slotOf = (who) => {
      let at = slots.indexOf(who);
      if (at < 0) { at = slots.length; slots.push(who); }
      return at;
    };
    const first = beats.length;
    for (const beat of cs.beats) {
      const [kind] = beat;
      const row = { kind: BEAT[kind], slot: 0, a: 0, b: 0, c: 0, d: 0, text: '' };
      if (BEAT[kind] === undefined) throw new Error(`${id} has a beat called ${kind}`);
      if (kind === 'say') row.text = beat[1];
      else if (kind === 'wait' || kind === 'shake' || kind === 'flash') {
        row.a = Math.min(255, Math.round(beat[1] * 60));
      } else if (kind === 'spawn') {
        const at = beat[2];
        row.slot = slotOf(beat[1]);
        row.a = at.x; row.b = at.y;
        row.c = actors.DIRECTIONS.indexOf(at.dir ?? 'down');
        /* The person who walks in has to have their art resident on that map,
           the same as anybody standing on it does. */
        const actor = actorFor(personLook(at.sprite ?? 'smallfolk', at.name ?? ''),
                               `${at.sprite}|${at.name ?? ''}`);
        (map.sceneActors ??= []).push(actor);
        row.actor = actor;
        row.mapId = cs.map;
        row.text = at.name ?? '';
      } else if (kind === 'walk') {
        row.slot = slotOf(beat[1]);
        row.a = actors.DIRECTIONS.indexOf(beat[2]);
        row.b = beat[3];
      } else if (kind === 'face') {
        row.slot = slotOf(beat[1]);
        row.a = actors.DIRECTIONS.indexOf(beat[2]);
      } else if (kind === 'despawn') {
        row.slot = slotOf(beat[1]);
      } else if (kind === 'flag') {
        row.a = flagAt(beat[1]);
      } else if (kind === 'choose') {
        const opts = beat[2].slice(0, 3);
        const how = beat[3] ?? {};
        row.a = choices.length;
        choices.push({ ask: beat[1], opts,
          /* What you said is remembered, one flag per answer - and the name of
             the flag is the scene's own, not a shared one. It used to fall back
             to "said", so every unrecorded answer in the game set the same
             three bits: agreeing with a man in the Riverlands and agreeing with
             a man at the Wall were the same fact, and anything waiting on
             either of them fired on both. */
          flags: opts.map((_, i) => flagAt(`${how.record ?? id}_${i}`)),
          gold: opts.map(() => 0), result: opts.map(() => ''),
          /* And what it does to the nine. Answers that cost nothing and please
             nobody are a menu; these are the reason to think before pressing A.
             Authored per option as { stark: +12, lannister: -8 }. */
          favour: opts.map((_, i) => {
            const moves = Object.entries((how.favour ?? [])[i] ?? {})
              .map(([h, d]) => [SWEARABLE.indexOf(h), d])
              .filter(([at]) => at >= 0);
            if (moves.length > 2) {
              throw new Error(`a choice in ${id} moves ${moves.length} houses; there is room for two`);
            }
            return {
              a: moves[0] ? moves[0][0] : 255, da: moves[0] ? moves[0][1] : 0,
              b: moves[1] ? moves[1][0] : 255, db: moves[1] ? moves[1][1] : 0,
            };
          }),
          duel: opts.map(() => 0xFFFF) });
      }
      beats.push(row);
    }
    scenes.push({ id, map: cs.map, x: where.x, y: where.y,
      flag: flagAt(cs.flag), first, count: beats.length - first,
      people: slots.length,
      /* What has to have happened first. Without these a scene is a thing that
         occurs; with them a run of scenes is a story, because the fourth one
         only happens to somebody the second one happened to. */
      needs: cs.needs ? flagAt(cs.needs) : 255,
      denies: cs.unless ? flagAt(cs.unless) : 255,
      sigils: cs.sigils ?? 0,
      name: cs.name ?? id });
  }

  /* The side quests, which are the same machinery pointed at a person rather
     than at a tile: somebody says their piece, you are given three ways to
     answer, and the answer costs gold, is remembered, and sometimes has to be
     argued with steel first.
     These were written for the browser and had never reached the cartridge
     either - and they had no map or tile on them, because the browser hung
     them off a region. Here is where each one stands. */
  const QUEST_PLACES = {
    hangingTree:      { map: 'riverlands',    x: 4,  y: 20 },
    brokenTower:      { map: 'kingsroadNorth', x: 4, y: 20 },
    maestersDebt:     { map: 'roseroad',      x: 4,  y: 20 },
    deserterAtTheGate:{ map: 'castleBlack',   x: 3,  y: 16 },
    // The later five stand where the browser's giver stands, so the two builds
    // agree about who is where rather than drifting apart quest by quest.
    saltWivesOfPyke:  { map: 'pyke',          x: 11, y: 5 },
    theGrainCount:    { map: 'highgarden',    x: 11, y: 5 },
    theDornishHostage:{ map: 'sunspear',      x: 11, y: 5 },
    theBastardsLetter:{ map: 'weepingWater',  x: 12, y: 5 },
    theSellswordsWage:{ map: 'mudGate',       x: 9,  y: 5 },
  };
  for (const [id, q] of Object.entries(QUESTS)) {
    const place = QUEST_PLACES[id];
    if (!place) throw new Error(`the quest ${id} has nowhere to stand`);
    const map = out.maps.find((m) => m.id === place.map);
    if (!map) throw new Error(`the quest ${id} stands on ${place.map}, which is not on the cartridge`);
    /* A tile that is actually open. The coordinate written here is a wish; the
       carved roads move about between builds and a quest-giver standing inside
       a hedge is a quest nobody can start. */
    const spot = openTileNear(map, place.x, place.y, id);
    const opts = q.resolve.slice(0, 3);
    const first = beats.length;
    beats.push({ kind: BEAT.say, slot: 0, a: 0, b: 0, c: 0, d: 0, text: q.giver });
    beats.push({ kind: BEAT.say, slot: 0, a: 0, b: 0, c: 0, d: 0, text: q.open });
    beats.push({ kind: BEAT.choose, slot: 0, a: choices.length, b: 0, c: 0, d: 0, text: '' });
    choices.push({
      ask: q.summary,
      opts: opts.map((o) => o.label),
      flags: opts.map((o) => flagAt(`${o.choice[0]}_${o.choice[1]}`)),
      gold: opts.map((o) => o.gold ?? 0),
      result: opts.map((o) => o.result ?? ''),
      /* And who is pleased or offended by how you settled it. */
      favour: opts.map((o) => {
        const moves = Object.entries(o.favour ?? {})
          .map(([h, dd]) => [SWEARABLE.indexOf(h), dd])
          .filter(([at]) => at >= 0);
        if (moves.length > 2) {
          throw new Error(`the quest ${id} moves ${moves.length} houses on one answer`);
        }
        return {
          a: moves[0] ? moves[0][0] : 255, da: moves[0] ? moves[0][1] : 0,
          b: moves[1] ? moves[1][0] : 255, db: moves[1] ? moves[1][1] : 0,
        };
      }),
      /* One of these has to be argued with steel before it is settled. */
      /* makeRoamer hands back `techniques`; the cartridge writes `techs`, and
         nothing here was translating between them. It only ever worked because
         pushDuellist dedupes on name-and-level and every quest roamer written
         so far happened to collide with one an ambush had already pushed
         properly. The first quest to name a pairing nobody had used crashed the
         export on d.techs.join. */
      duel: opts.map((o) => {
        if (!o.roamer) return 0xFFFF;
        const made = makeRoamer(typeof o.roamer === 'string' ? o.roamer : o.roamer.id,
                                typeof o.roamer === 'string'
                                  ? groundBy[0][mapIds.indexOf(place.map)]
                                  : (o.roamer.level ?? groundBy[0][mapIds.indexOf(place.map)]),
                                (l) => l[0]);
        /* makeRoamer names the house as a string; the struct wants the index
           SWEARABLE puts it at, and Object.assign was carrying the string
           straight through into the generated C as a bare identifier. */
        return pushDuellist(Object.assign(made, {
          techs: techSlots(made.techniques),
          house: houseIndexOf(made.house),
          mortal: 1, fixed: 0, sworn: 255, host: 0, dead: 0,
        }));
      }),
    });
    scenes.push({ id, map: place.map, x: spot.x, y: spot.y,
      flag: flagAt(`quest_${id}`), first, count: beats.length - first, people: 0,
      quest: 1, name: q.name,
      needs: q.needs ? flagAt(q.needs) : 255, denies: 255, sigils: q.sigils ?? 0 });
  }

  {
    const seen = new Set();
    for (const sc of scenes) {
      const key = `${sc.map} ${sc.x},${sc.y}`;
      if (seen.has(key)) throw new Error(`two scenes stand on ${key}; the second can never fire`);
      seen.add(key);
    }
  }

  /* How the world looks at you. A flag named here has to be one a scene or a
     quest actually sets, or the line is one nobody will ever read: the whole
     point of the list is that it fires, so a name that matches nothing is a
     build error rather than a quiet nothing. */
  const known = new Set(sceneFlags);
  const regard = REGARD.map((r) => {
    for (const name of [r.needs, r.unless]) {
      if (name && !known.has(name)) {
        throw new Error(`a regard line waits on ${name}, which nothing ever sets`);
      }
    }
    return {
      line: r.line,
      sigils: r.sigils ?? 0,
      host: r.host ?? 0,
      kills: r.kills ?? 0,
      needs: r.needs ? flagAt(r.needs) : 255,
      denies: r.unless ? flagAt(r.unless) : 255,
    };
  });
  out.regard = regard;

  /* What comes before the throne once the throne is yours.
     Written a long time ago, imported by nothing, and so never once read by
     anybody playing the cartridge - which is the whole of the postgame sitting
     in a file. Each answer moves the treasury, how steady the realm is, and
     what at most two houses make of you; a house named here that nobody can
     swear to (the Watch, the free folk, the Boltons) has no slot to move, so
     what it would have moved goes into steadiness instead, which is the honest
     translation rather than a silent nothing. */
  const houseAt = (id) => houses.findIndex((h) => h.id === id);
  const petitions = PETITION_IDS.map((id) => {
    const p = PETITIONS[id];
    return {
      id,
      text: p.text,
      /* The only gate any of them has is an empty treasury. */
      needsPoor: p.requires?.treasuryBelow ?? 0,
      options: p.options.map((o) => {
        const named = Object.entries(o.standing ?? {});
        const placed = named.filter(([h]) => houseAt(h) >= 0);
        const homeless = named.filter(([h]) => houseAt(h) < 0);
        if (placed.length > 2) {
          throw new Error(`${id}: "${o.label}" moves ${placed.length} houses; there is room for two`);
        }
        let steady = o.stability ?? 0;
        for (const [, d] of homeless) steady += Math.round(d / 6);
        return {
          label: o.label,
          result: o.result,
          gold: o.gold ?? 0,
          steady,
          houseA: placed[0] ? houseAt(placed[0][0]) : 255,
          shiftA: placed[0] ? placed[0][1] : 0,
          houseB: placed[1] ? houseAt(placed[1][0]) : 255,
          shiftB: placed[1] ? placed[1][1] : 0,
        };
      }),
    };
  });
  if (petitions.some((p) => p.options.length < 2)) {
    throw new Error('a petition with fewer than two answers is not a decision');
  }
  out.petitions = petitions;

  out.scenes = scenes;
  out.beats = beats;
  out.choices = choices;
  out.sceneFlags = sceneFlags;

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

for (const actor of [...harvest.actors, ...harvest.beasts]) {
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
  /* And anybody a cutscene walks onto this map, who has to be drawn from the
     same object memory as everybody else standing on it. */
  for (const actor of map.sceneActors ?? []) bankOf(actor);
  if (used.length > NPC_ACTOR_LIMIT) {
    throw new Error(`${map.id} needs ${used.length} appearances resident; there is room for ${NPC_ACTOR_LIMIT}`);
  }
  map.residents = used;
}

/* And now the cutscene spawns can be told which of their map's resident
   appearances they are, which is only knowable once every map has been dealt
   its own. */
for (const b of harvest.beats) {
  if (b.actor === undefined) continue;
  const map = harvest.maps.find((m) => m.id === b.mapId);
  b.bank = map.residents.indexOf(b.actor);
  if (b.bank < 0) throw new Error(`a cutscene spawn on ${b.mapId} has no bank`);
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

// The beasts. One picture apiece, sixty-four square, which is one object on the
// hardware and the whole of what a wolf is on this cartridge.
L.push(`#define BEAST_COUNT ${harvest.beasts.length}`);
/* The three things that get up after they are dead, by name, because the
   cartridge has to be able to put them on a road the encounter table for that
   road never mentioned. That is the whole of how the Long Night spreads. */
{
  const at = (id) => harvest.beasts.findIndex((b) => b.id === id);
  const wight = at('wightling'), risen = at('barrowlord'), walker = at('palewalker');
  if (wight < 0 || walker < 0) throw new Error('the dead are missing from the bestiary');
  L.push(`#define BEAST_WIGHT ${wight}`);
  L.push(`#define BEAST_RISEN ${risen < 0 ? wight : risen}`);
  L.push(`#define BEAST_WALKER ${walker}`);
  /* And the two that come out of the sky, for the same reason: the cartridge
     puts them on roads no encounter table mentions. */
  const drake = at('scaleflight'), wyrm = at('dreadwyrm');
  if (drake < 0 || wyrm < 0) throw new Error('the dragons are missing from the bestiary');
  L.push(`#define BEAST_DRAKE ${drake}`);
  L.push(`#define BEAST_WYRM ${wyrm}`);
}
L.push('#define BEAST_TILES 64          /* a 64x64 sprite, four bits a pixel */');
harvest.beasts.forEach((b, i) => {
  L.push(`static const u16 beastpal_${i}[16] = {`);
  L.push(block([0, ...b.colours, ...new Array(15 - b.colours.length).fill(0)].map(hex), 8));
  L.push('};');
  L.push(`static const u32 beasttiles_${i}[${b.tiles.length * 8}] = {`);
  L.push(block(b.tiles.flatMap(words4).map(hex), 8));
  L.push('};');
});
L.push('typedef struct {');
L.push('  const char *name;');
L.push('  const u16 *pal; const u32 *tiles;');
L.push('  u8 hp, atk, def, spe;   /* what it is made of, before its level */');
L.push('  u8 tech[4], hold, tame, into, growAt, dead;');
L.push('} Beast;');
L.push('static const Beast beasts[BEAST_COUNT] = {');
harvest.beasts.forEach((b, i) => {
  /* Four, because the duel picks one of four when it is the animal's turn.
     Three kinds of blow and the first one twice is a fair reading of a wolf. */
  const t3 = [...b.techs, 0, 0, 0].slice(0, 3);
  const t = [...t3, t3[0]];
  L.push(`  { ${cstr(b.name)}, beastpal_${i}, beasttiles_${i},`);
  L.push(`    ${b.hp}, ${b.atk}, ${b.def}, ${b.spe},`);
  L.push(`    { ${t.join(', ')} }, ${b.hold}, ${b.tame}, ${b.into}, ${b.growAt}, ${b.dead} },`);
});
L.push('};');
L.push(`#define EGG_COUNT ${harvest.eggs.length}`);
L.push('typedef struct { u8 ware, beast, wins; } Egg;');
L.push('static const Egg eggs[EGG_COUNT] = {');
for (const e of harvest.eggs) L.push(`  { ${e.ware}, ${e.beast}, ${e.wins} },`);
L.push('};');
L.push('');

// Houses.
L.push(`#define HOUSE_COUNT ${harvest.houses.length}`);
L.push('typedef struct { const char *name, *full, *words, *sworn, *seat; u16 colour, accent;'
     + ' u16 looks[4]; u8 startMap, startX, startY, startDir, startLevel;'
     + ' u16 rivals, allies; } House;');
L.push('static const House houses[HOUSE_COUNT] = {');
for (const h of harvest.houses) {
  L.push(`  { ${cstr(h.name)}, ${cstr(h.full)}, ${cstr(h.words)},`);
  L.push(`    ${cstr(h.sworn)}, ${cstr(h.seat)}, ${hex(hexColour(h.colour))}, ${hex(hexColour(h.accent))},`);
  {
    const at = MAP_IDS.indexOf(h.start.map);
    if (at < 0) throw new Error(`${h.id} starts on ${h.start.map}, which is not exported`);
    L.push(`    { ${h.looks.join(', ')} }, ${at}, ${h.start.x}, ${h.start.y}, `
      + `${h.start.dir}, ${h.start.level}, ${h.rivals}, ${h.allies} },`);
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
L.push('#define WARE_STUFF  4    /* what a recipe is made of; never on a counter */');
L.push('#define WARE_SNARE  5    /* thrown over an animal to take it alive */');
L.push('#define WARE_EGG    6    /* carried until it is not an egg any more */');
L.push('#define WARE_HELM   7');
L.push('#define WARE_GLOVES 8');
L.push('#define WARE_RELIC  9    /* used up in a fight, and does what steel cannot */');
L.push('#define WARE_OATH   10   /* put in front of somebody who has yielded */');
L.push('#define WARE_KINDS  11   /* how many kinds there are, worn or not */');
L.push('typedef struct {');
L.push('  const char *name;');
L.push('  u16 price, heal;');
L.push('  u8 kind, might, guard, tier, hold, obsidian, relic;');
L.push('  s8 swiftness;');
L.push('  u8 tech[3], techCount;');
L.push('} Ware;');
L.push('static const Ware wares[WARE_COUNT] = {');
{
  const kindOf = { potion: 0, weapon: 1, armour: 2, shield: 3, stuff: 4,
                   snare: 5, egg: 6, helm: 7, gloves: 8, relic: 9, oath: 10 };
  // Which of the four looks a piece of armour puts you in.
  const LOOK = { gambeson: 0, boiledLeather: 1, ringmail: 2, scaleArmour: 2, knightPlate: 3 };
  for (const w of harvest.wares) {
    const techs = (w.techs ?? []).map((id) => techSlotOf(id)).filter((n) => n >= 0).slice(0, 3);
    L.push(`  { ${cstr(w.name)}, ${w.price}, ${Math.min(9999, w.heal)}, ${kindOf[w.kind]},`);
    L.push(`    ${w.might}, ${w.guard}, ${LOOK[w.id] ?? 0}, ${w.hold ?? 0}, ${w.obsidian ?? 0}, ${w.relic ?? 0}, ${w.swiftness},`);
    L.push(`    { ${[...techs, 0, 0, 0].slice(0, 3).join(', ')} }, ${techs.length} },`);
  }
}
L.push('};');
L.push('');
L.push(`#define THRONE_CHAMPION ${harvest.throneChampion}`);
/* The thing at the end of the cold. What it is worth fighting depends on how
   long you left it, so the cartridge has to be able to find it by name. */
L.push(`#define NIGHT_KING ${harvest.duellists.findIndex((d) => d.name === 'The Night King')}`);
L.push(`#define THRONE_MAP ${MAP_IDS.indexOf('redKeep')}`);
/* The tile the Red Keep's door is on, so a test can start one step from it. */
{
  const kl = harvest.maps[MAP_IDS.indexOf('kingsLanding')];
  const door = kl.warps.find((w) => w.to === 'redKeep');
  if (!door) throw new Error('nothing in the capital leads to the Red Keep');
  L.push(`#define THRONE_GATE_MAP ${MAP_IDS.indexOf('kingsLanding')}`);
  L.push(`#define THRONE_GATE_X ${door.x}`);
  L.push(`#define THRONE_GATE_Y ${door.y + 1}`);
}
L.push(`#define START_WEAPON ${harvest.wares.findIndex((w) => w.id === 'ironSword')}`);
/* The floor under a player who has been beaten with nothing in their hands. */
L.push(`#define FLOOR_WEAPON ${harvest.wares.findIndex((w) => w.id === 'huntingKnife')}`);
L.push(`#define START_ARMOUR ${harvest.wares.findIndex((w) => w.id === 'gambeson')}`);
L.push(`#define START_POTION ${harvest.wares.findIndex((w) => w.id === 'maesterKit')}`);
L.push('typedef struct { const u8 *ware; u8 count; } Stall;');
/* The recipe book. */
{
  const R = harvest.recipes;
  L.push(`#define RECIPE_COUNT ${R.length}`);
  L.push('#define RECIPE_MAX_NEEDS 3');
  L.push('typedef struct { u8 at, makes, count; u16 gold; u8 mat[RECIPE_MAX_NEEDS],'
       + ' many[RECIPE_MAX_NEEDS]; } Recipe;');
  L.push('static const Recipe recipes[RECIPE_COUNT] = {');
  for (const r of R) {
    if (r.needs.length > 3) throw new Error(`recipe for ${r.makes} wants ${r.needs.length} things`);
    const mat = [...r.needs.map((n) => n[0]), 0, 0, 0].slice(0, 3);
    const many = [...r.needs.map((n) => n[1]), 0, 0, 0].slice(0, 3);
    L.push(`  { ${r.at}, ${r.makes}, ${r.needs.length}, ${r.gold},`
      + ` { ${mat.join(', ')} }, { ${many.join(', ')} } },`);
  }
  L.push('};');
  L.push('');
  L.push(`#define SPOIL_BANDS ${harvest.spoils.length}`);
  L.push('#define SPOIL_WIDE 5');
  L.push('typedef struct { u8 upTo, drop[SPOIL_WIDE]; } Spoil;');
  L.push('static const Spoil spoils[SPOIL_BANDS] = {');
  for (const b of harvest.spoils) {
    const d = [...b.drops, ...new Array(5).fill(b.drops[0])].slice(0, 5);
    L.push(`  { ${b.upTo}, { ${d.join(', ')} } },`);
  }
  L.push('};');
  L.push(`#define FORAGE_COUNT ${harvest.forage.length}`);
  L.push(`static const u8 forage[FORAGE_COUNT] = { ${harvest.forage.join(', ')} };`);
  L.push('');
}
{
  const stalls = [harvest.forSale.apothecary, harvest.forSale.weapons,
                  harvest.forSale.armour, harvest.forSale.oddments];
  stalls.forEach((list, i) => {
    L.push(`static const u8 stall_${i}[${Math.max(1, list.length)}] = { ${list.join(', ') || '0'} };`);
  });
  L.push(`#define STALL_COUNT ${stalls.length}`);
  L.push('static const Stall stalls[STALL_COUNT] = {');
  stalls.forEach((list, i) => L.push(`  { stall_${i}, ${list.length} },`));
  L.push('};');
  /* What the sign over each counter says. */
  L.push('static const char *const stallName[STALL_COUNT] = {');
  L.push('  "REMEDIES", "ARMS", "ARMOUR", "ODDS",');
  L.push('};');
}
L.push('');

// Techniques.
L.push(`#define TECH_COUNT ${harvest.techniques.length}`);
L.push('typedef struct {');
L.push('  const char *name;');
L.push('  u8 power, accuracy, defend, highCrit, bite;');
L.push('  u8 wind;         /* what swinging it costs you */');
L.push('  u8 first;        /* 0 in turn, higher goes before */');
L.push('  u8 stun, guardBreak, bleed, burn, chance, needsShield;');
L.push('} Tech;');
L.push('static const Tech techniques[TECH_COUNT] = {');
for (const t of harvest.techniques) {
  L.push(`  { ${cstr(t.name)}, ${t.power}, ${t.accuracy}, ${t.defend}, ${t.highCrit}, ${t.bite},`
    + ` ${t.wind}, ${t.first}, ${t.stun}, ${t.guardBreak}, ${t.bleed}, ${t.burn},`
    + ` ${t.chance}, ${t.needsShield} },`);
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
L.push('  u16 vigour; u8 level, might, guard, swiftness, mortal, fixed, dead;');
L.push('  u8 sworn;             /* which sort of sworn sword, or 255 for nobody */');
L.push('  u8 host;              /* how many swords stand behind them */');
L.push('  u8 house;             /* whose colours they are in, 255 for nobody */');
L.push('  u8 tech[4];');
L.push('  u16 reward, exp;');
L.push('  const char *intro, *defeat;');
L.push('} Duellist;');
L.push('static const Duellist duellists[DUELLIST_COUNT] = {');
for (const d of harvest.duellists) {
  L.push(`  { ${cstr(d.name)}, ${d.vigour}, ${d.level}, ${d.might}, ${d.guard}, ${d.swiftness}, ${d.mortal}, ${d.fixed ?? 0}, ${d.dead ?? 0},`);
  L.push(`    ${d.sworn ?? 255}, ${d.host ?? 0}, ${d.house ?? 255},`);
  L.push(`    { ${d.techs.join(', ')} }, ${d.reward}, ${d.exp},`);
  L.push(`    ${cstr(d.intro)}, ${cstr(d.defeat)} },`);
}
L.push('};');
L.push('');

// The cutscenes: five scenes, a run of beats each, and what you said when one
// asked. Nothing in this exporter had ever imported the file they live in, so
// none of them had reached the cartridge.
L.push(`#define CUT_COUNT ${harvest.scenes.length}`);
L.push(`#define BEAT_COUNT ${harvest.beats.length}`);
L.push(`#define CHOICE_COUNT ${Math.max(1, harvest.choices.length)}`);
L.push(`#define STORY_FLAGS ${harvest.sceneFlags.length}`);
L.push('#define STORY_WORDS 4   /* a hundred and twenty-eight, in four words */');
L.push('#define BEAT_SAY     0');
L.push('#define BEAT_WAIT    1');
L.push('#define BEAT_SHAKE   2');
L.push('#define BEAT_FLASH   3');
L.push('#define BEAT_SPAWN   4');
L.push('#define BEAT_WALK    5');
L.push('#define BEAT_FACE    6');
L.push('#define BEAT_DESPAWN 7');
L.push('#define BEAT_SKY     8');
L.push('#define BEAT_FLAG    9');
L.push('#define BEAT_CHOOSE 10');
L.push('#define CUT_PEOPLE   3   /* how many a scene may put on the map at once */');
L.push('typedef struct {');
L.push('  u8 kind, slot, a, b, c, bank;');
L.push('  const char *text;');
L.push('} Beat;');
L.push('static const Beat beats[BEAT_COUNT] = {');
for (const b of harvest.beats) {
  L.push(`  { ${b.kind}, ${b.slot}, ${b.a}, ${b.b}, ${b.c}, ${b.bank ?? 0}, ${cstr(b.text)} },`);
}
L.push('};');
L.push('typedef struct {');
L.push('  const char *ask;');
L.push('  const char *opt[3];');
L.push('  const char *said[3];   /* what happens when you say it */');
L.push('  short gold[3];         /* what saying it costs, or pays */');
L.push('  u16 duel[3];           /* whoever has to be argued with first, or 65535 */');
L.push('  u8 count, flag[3];');
L.push('  /* Who is pleased and who is not, per answer. Two houses is as many as');
L.push('     one sentence can honestly move. 255 is nobody. */');
L.push('  u8 houseA[3], houseB[3];');
L.push('  s8 shiftA[3], shiftB[3];');
L.push('} Choice;');
L.push('static const Choice choices[CHOICE_COUNT] = {');
if (!harvest.choices.length) {
  L.push('  { 0, { 0, 0, 0 }, { 0, 0, 0 }, { 0, 0, 0 }, { 65535, 65535, 65535 }, 0, { 0, 0, 0 },'
       + ' { 255, 255, 255 }, { 255, 255, 255 }, { 0, 0, 0 }, { 0, 0, 0 } },');
}
for (const c of harvest.choices) {
  const opts = [0, 1, 2].map((i) => (c.opts[i] ? cstr(c.opts[i]) : '0')).join(', ');
  const said = [0, 1, 2].map((i) => (c.result?.[i] ? cstr(c.result[i]) : '0')).join(', ');
  const gold = [0, 1, 2].map((i) => c.gold?.[i] ?? 0).join(', ');
  const duel = [0, 1, 2].map((i) => c.duel?.[i] ?? 65535).join(', ');
  const flags = [0, 1, 2].map((i) => c.flags[i] ?? 0).join(', ');
  const fv = (i) => c.favour?.[i] ?? { a: 255, da: 0, b: 255, db: 0 };
  const hA = [0, 1, 2].map((i) => fv(i).a).join(', ');
  const hB = [0, 1, 2].map((i) => fv(i).b).join(', ');
  const sA = [0, 1, 2].map((i) => fv(i).da).join(', ');
  const sB = [0, 1, 2].map((i) => fv(i).db).join(', ');
  L.push(`  { ${cstr(c.ask)}, { ${opts} }, { ${said} }, { ${gold} }, { ${duel} }, `
    + `${c.opts.length}, { ${flags} },`);
  L.push(`    { ${hA} }, { ${hB} }, { ${sA} }, { ${sB} } },`);
}
L.push('};');
L.push('typedef struct {');
L.push('  u8 map, x, y, flag, people, quest;');
L.push('  u8 needs, denies, sigils;   /* what has to have happened first */');
L.push('  u16 first, count;');
L.push('  const char *name;');
L.push('} Cut;');
L.push('static const Cut cuts[CUT_COUNT] = {');
for (const sc of harvest.scenes) {
  L.push(`  { ${MAP_IDS.indexOf(sc.map)}, ${sc.x}, ${sc.y}, ${sc.flag}, ${sc.people}, `
    + `${sc.quest ?? 0}, ${sc.needs ?? 255}, ${sc.denies ?? 255}, ${sc.sigils ?? 0}, `
    + `${sc.first}, ${sc.count}, ${cstr(sc.name ?? sc.id)} },`);
}
L.push('};');
L.push('');

// How the world looks at you: what somebody adds when they notice the sigils on
// your arm, the swords at your back, or that you have been north and come back.
L.push(`#define REGARD_COUNT ${harvest.regard.length}`);
L.push('typedef struct {');
L.push('  const char *line;');
L.push('  u8 sigils, host, kills, needs, denies;');
L.push('} Regard;');
L.push('static const Regard regard[REGARD_COUNT] = {');
for (const r of harvest.regard) {
  L.push(`  { ${cstr(r.line)}, ${r.sigils}, ${r.host}, `
    + `${Math.min(255, r.kills)}, ${r.needs}, ${r.denies} },`);
}
L.push('};');
L.push('');

// What comes before the throne once the throne is yours. Every answer costs
// something: the treasury, how steady the realm is, or what a house makes of
// you. That is the whole of ruling, which is why the postgame is a run of these
// rather than another run of fights.
{
  const opts = harvest.petitions.flatMap((p) => p.options);
  L.push(`#define PETITION_COUNT ${harvest.petitions.length}`);
  L.push(`#define ANSWER_COUNT ${opts.length}`);
  L.push('typedef struct {');
  L.push('  const char *label, *result;');
  L.push('  short gold;');
  L.push('  signed char steady, shiftA, shiftB;');
  L.push('  u8 houseA, houseB;');
  L.push('} Answer;');
  L.push('static const Answer answers[ANSWER_COUNT] = {');
  for (const o of opts) {
    L.push(`  { ${cstr(o.label)}, ${cstr(o.result)}, ${o.gold}, ${o.steady}, `
      + `${o.shiftA}, ${o.shiftB}, ${o.houseA}, ${o.houseB} },`);
  }
  L.push('};');
  L.push('typedef struct {');
  L.push('  const char *text;');
  L.push('  u16 needsPoor;        /* only asked of a crown with less than this */');
  L.push('  u8 first, count;');
  L.push('} Petition;');
  L.push('static const Petition petitions[PETITION_COUNT] = {');
  let at = 0;
  for (const p of harvest.petitions) {
    L.push(`  { ${cstr(p.text)}, ${p.needsPoor}, ${at}, ${p.options.length} },`);
    at += p.options.length;
  }
  L.push('};');
  L.push('');
}

// Who can be taken into service, and what they are worth at any level.
L.push(`#define SWORN_KINDS ${harvest.swornKinds.length}`);
L.push('typedef struct {');
L.push('  const char *name;');
L.push('  u16 might10, might40, guard10, guard40, vigour10, vigour40;');
L.push('} SwornKind;');
L.push('static const SwornKind swornKinds[SWORN_KINDS] = {');
for (const k of harvest.swornKinds) {
  L.push(`  { ${cstr(k.name)}, ${k.might10}, ${k.might40}, ${k.guard10}, `
    + `${k.guard40}, ${k.vigour10}, ${k.vigour40} },`);
}
L.push('};');
L.push('');

// The nine seats, and how far every road is from every one of them.
// ------------------------------------------------------------- the last act --
// Five sequences, nineteen pages. The pages that read differently for each
// house carry a table indexed by the house you swore to; the rest carry one
// line and a null where that table would be.
{
  let pageAt = 0;
  const rows = [];
  const tales = [];
  for (const t of harvest.tales) {
    const first = pageAt;
    for (const p of t.pages) {
      if (p.byHouse) {
        L.push(`static const char *const houseLines_${pageAt}[HOUSE_COUNT] = {`);
        for (const line of p.byHouse) L.push(`  ${cstr(line)},`);
        L.push('};');
      }
      rows.push(`  { ${p.sky}, ${p.mark}, ${cstr(p.title)}, ${cstr(p.body)}, `
        + `${p.byHouse ? `houseLines_${pageAt}` : '0'} },`);
      pageAt++;
    }
    tales.push(`  { ${cstr(t.name)}, ${first}, ${t.pages.length} },`);
  }
  L.push('typedef struct { u8 sky, mark; const char *title, *body;');
  L.push('                 const char *const *byHouse; } Page;');
  L.push(`static const Page talePages[${pageAt}] = {`);
  L.push(...rows);
  L.push('};');
  L.push(`#define TALE_COUNT ${tales.length}`);
  L.push('typedef struct { const char *name; u8 first, count; } Tale;');
  L.push('static const Tale tales[TALE_COUNT] = {');
  L.push(...tales);
  L.push('};');
  /* The order they fire in, by name, so the cartridge can say which is which. */
  harvest.tales.forEach((t, i) => L.push(`#define TALE_${t.id.toUpperCase()} ${i}`));
  L.push('');
}

L.push(`#define MAP_COUNT ${harvest.maps.length}`);
{
  const order = [...harvest.leaders].sort((a, b) => a.order - b.order);
  if (order.some((l) => l.order < 0)) {
    throw new Error(`leader missing from the ladder: ${order.filter((l) => l.order < 0).map((l) => l.id).join(', ')}`);
  }
  L.push(`#define LEADER_COUNT ${order.length}`);
  L.push('typedef struct { u16 duellist; u8 house, map; const char *sigil, *name, *seat; } Leader;');
  L.push('static const Leader leaders[LEADER_COUNT] = {');
  for (const l of order) {
    const house = harvest.houses.findIndex((h) => h.id === l.house);
    const at = MAP_IDS.indexOf(l.map);
    L.push(`  { ${l.duellist}, ${house < 0 ? 255 : house}, ${at}, ${cstr(l.sigil)}, `
      + `${cstr(l.name)}, ${cstr(l.seat)} },`);
  }
  L.push('};');
  /* What each rung of that ladder is worth. Nine evenly spaced steps from a
     first fight you can take at ten to a last one that expects everything. */
  L.push('static const u8 leaderLevel[LEADER_COUNT] = { 9, 12, 15, 19, 22, 26, 30, 34, 38, 43 };');
  L.push('');
  /* Where a ship will take you, and what the captain wants for it. A port that
     is not on the cartridge is not a port. */
  {
    const berths = PORTS.filter((p) => MAP_IDS.includes(p.map));
    L.push(`#define PORT_COUNT ${berths.length}`);
    L.push('typedef struct { const char *name; u8 map, x, y, dir; u16 fare; } Port;');
    L.push('static const Port ports[PORT_COUNT] = {');
    for (const p of berths) {
      const dir = ['down', 'up', 'left', 'right'].indexOf(p.dir ?? 'down');
      L.push(`  { ${cstr(p.name)}, ${MAP_IDS.indexOf(p.map)}, ${p.x}, ${p.y}, `
        + `${dir < 0 ? 0 : dir}, ${p.fare} },`);
    }
    L.push('};');
  }
  L.push('');
  L.push('/* How hard the ground is on every map, measured from each house seat in');
  L.push('   turn: level three at your own gate and level forty-four at the far end');
  L.push('   of the world, however many doors that happens to be. */');
  L.push('static const u8 groundBy[HOUSE_COUNT][MAP_COUNT] = {');
  for (const row of harvest.groundBy) L.push(`  { ${row.join(', ')} },`);
  L.push('};');
  L.push('');
}

// Maps.
L.push('typedef struct { u8 x, y, to, tx, ty; } Warp;');
L.push('typedef struct { u8 x, y; const char *text; } Sign;');
L.push('typedef struct { u16 duellist; u8 bank; } Ambush;');
L.push('typedef struct { u8 beast, level; } Wild;');
L.push('typedef struct { u8 x, y, ware; u16 gold; } Chest;');
L.push('typedef struct {');
L.push('  u8 x, y, dir, bank, roams, heals, fights, trade, sight, challenges, sails, holds, weds, ranges, evening, gate;');
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
L.push('  const u8  *counter;   /* solid, but you can speak across it */');
L.push('  const u8  *water;     /* solid on foot; the only road under sail */');
L.push('  u8 frost;             /* whether the cover here is under snow */');
L.push('  u8 cold;              /* how far north, 0 Dorne to 5 beyond the Wall */');
L.push('  u8 tune;              /* what plays here */');
L.push('  u8 scene;             /* which sky a duel fought here is fought under */');
L.push('  const u16 *residents; u8 residentCount;');
L.push('  const Warp *warps; u8 warpCount;');
L.push('  const Sign *signs; u8 signCount;');
L.push('  const Npc  *npcs;  u8 npcCount;');
L.push('  const Ambush *ambushes; u8 ambushCount;');
L.push('  const Wild *wilds; u8 wildCount;');
L.push('  const Chest *chests; u8 chestCount;');
L.push('  u8 nest;              /* the egg that is found here, or 255 */');
L.push('  u8 seat;              /* what this hall costs in hundreds, 0 not for sale */');
L.push('  u8 courtX, courtY;    /* where the chair is, 255 if there is no chair */');
L.push('  u8 holder;            /* which of the nine holds this ground, 255 none */');
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
  L.push(`static const u8 counter_${i}[${map.height} * ${map.width}] = {`);
  L.push(block(map.counter, 24));
  L.push('};');
  L.push(`static const u8 water_${i}[${map.height} * ${map.width}] = {`);
  L.push(block(map.water, 24));
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
  L.push(`static const Wild wilds_${i}[${Math.max(1, map.wilds.length)}] = {`);
  for (const w of map.wilds) L.push(`  { ${w.beast}, ${w.level} },`);
  if (!map.wilds.length) L.push('  { 0, 0 },');
  L.push('};');
  if (map.chests.length > 8) throw new Error(`${map.id} has ${map.chests.length} chests; the record holds 8`);
  L.push(`static const Chest chests_${i}[${Math.max(1, map.chests.length)}] = {`);
  for (const c of map.chests) L.push(`  { ${c.x}, ${c.y}, ${c.ware}, ${c.gold} },`);
  if (!map.chests.length) L.push('  { 255, 255, 255, 0 },');
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
    L.push(`  { ${n.x}, ${n.y}, ${n.dir < 0 ? 0 : n.dir}, ${n.bank}, ${n.roams}, ${n.heals}, ${n.fights}, ${n.trade}, ${n.sight}, ${n.challenges}, ${n.sails}, ${n.holds}, ${n.weds}, ${n.ranges}, ${n.evening}, ${n.gate}, ${n.duellist},`);
    L.push(`    ${cstr(name)}, ${cstr(line.trim())} },`);
  }
  if (!map.npcs.length) L.push('  { 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, "", "" },');
  L.push('};');
  L.push('');
});

L.push('static const Map maps[MAP_COUNT] = {');
harvest.maps.forEach((map, i) => {
  L.push(`  { ${cstr(map.name)}, ${map.width}, ${map.height}, ${map.bank.length}, tiles_${i},`);
  L.push(`    entries_${i}, solid_${i}, cover_${i}, ledge_${i}, counter_${i}, water_${i}, ${map.frost}, ${map.cold}, ${map.tune}, ${map.scene}, residents_${i}, ${map.residents.length},`);
  L.push(`    warps_${i}, ${map.liveWarps}, signs_${i}, ${map.signs.length},`);
  L.push(`    npcs_${i}, ${map.npcs.length}, ambushes_${i}, ${map.ambushes.length},`);
  L.push(`    wilds_${i}, ${map.wilds.length}, chests_${i}, ${map.chests.length},`);
  L.push(`    ${map.nest}, ${map.seat}, ${map.courtX}, ${map.courtY}, ${map.holder} },`);
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
