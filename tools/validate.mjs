#!/usr/bin/env node
// Data integrity check for the world tables. Catches the class of typo that a
// browser only reveals when a player happens to walk into it: a warp pointing
// at a wall, an NPC standing inside a tree, a learnset naming a move that was
// renamed, a script that no longer exists.
//
//   node tools/validate.mjs

import { MAPS } from '../src/data/maps.js';
import { SPECIES, SPECIES_IDS } from '../src/data/species.js';
import { MOVES } from '../src/data/moves.js';
import { ITEMS, item } from '../src/data/items.js';
import { TRAINERS, trainerAsDuellist } from '../src/data/trainers.js';
import { DUELLISTS, ROAMERS, ROAMER_TABLES, makeRoamer } from '../src/data/duellists.js';
import { HOUSES, HOUSE_IDS, SWEARABLE, SPRITE_HOUSE } from '../src/data/houses.js';
import { COMPANIONS, AID_DESCRIPTION } from '../src/data/companions.js';
import { QUESTS } from '../src/data/quests.js';
import { CUTSCENES } from '../src/data/cutscenes.js';

import { ROAMERS as ROAMER_TABLE } from '../src/data/duellists.js';
import { WEAPONS, ARMOUR, SHIELDS, TECHNIQUES, HELMS, GLOVES } from '../src/data/gear.js';
import { MATERIALS, SNARES, RELICS, OATHS, EGG_ITEMS } from '../src/data/craft.js';

/* Everything gba/export.mjs will turn into a ware, in the same order it tries
   them. If it is in none of these the chest is empty. */
const WARE_TABLES = [WEAPONS, ARMOUR, SHIELDS, HELMS, GLOVES,
                     MATERIALS, SNARES, RELICS, OATHS, EGG_ITEMS];
/* A medicine only becomes a ware if the exporter knows what its use does, so
   "on the medicine shelf" is not the test - six of the ten were on that shelf
   and none of those six existed on the cartridge. */
const MEDICINE_USES = new Set(['heal', 'fullHeal', 'cure', 'revive']);
const wareExists = (id) =>
  WARE_TABLES.some((t) => t[id])
  || (ITEMS[id]?.pocket === 'medicine' && MEDICINE_USES.has(ITEMS[id].use?.kind));
import { SCRIPTS } from '../src/data/scripts.js';
import { TILE_DEFS } from '../src/art/tiles.js';
import { ARCHETYPES } from '../src/art/creatures.js';
import { ACTOR_PALETTES } from '../src/art/actors.js';
import { TRACKS } from '../src/data/music.js';

const problems = [];
const warnings = [];
const fail = (msg) => problems.push(msg);
const warn = (msg) => warnings.push(msg);

/* The four tiles you can be standing on when you are facing a thing. */
const BESIDE = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const tileAt = (map, x, y) => (
  x < 0 || y < 0 || y >= map.height || x >= map.width ? '#' : map.grid[y][x]
);
const kindAt = (map, x, y) => TILE_DEFS[tileAt(map, x, y)]?.kind ?? 'solid';
const walkable = (map, x, y) => {
  const kind = kindAt(map, x, y);
  /* On the open sea the water is the road. A map marked `sea` is one you cross
     in a ship, so a warp standing on water there is a crossing rather than a
     mistake -- see the same rule in tools/checkmaps.mjs. */
  if (map?.sea && kind === 'water') return true;
  return kind === 'floor' || kind === 'encounter' || kind === 'ledge';
};

// ---------------------------------------------------------------- species --
for (const [id, def] of Object.entries(SPECIES)) {
  if (!ARCHETYPES[def.archetype]) fail(`species ${id}: unknown archetype "${def.archetype}"`);
  if (!def.learnset.length) fail(`species ${id}: empty learnset`);
  for (const [level, moveId] of def.learnset) {
    if (!MOVES[moveId]) fail(`species ${id}: learnset names unknown move "${moveId}"`);
    if (level < 1 || level > 100) fail(`species ${id}: learnset level ${level} out of range`);
  }
  const firstLevelMoves = def.learnset.filter(([lvl]) => lvl === 1).length;
  if (!firstLevelMoves) fail(`species ${id}: nothing known at level 1`);
  if (def.evolve && !SPECIES[def.evolve.into]) {
    fail(`species ${id}: evolves into unknown species "${def.evolve.into}"`);
  }
  for (const key of ['dark', 'body', 'light', 'belly', 'accent', 'eye']) {
    if (!/^#[0-9a-f]{6}$/i.test(def.palette[key] ?? '')) {
      fail(`species ${id}: palette.${key} is not a #rrggbb colour`);
    }
  }
  const total = Object.values(def.base).reduce((a, b) => a + b, 0);
  if (total < 200 || total > 700) warn(`species ${id}: base stat total ${total} looks off`);
}

// ------------------------------------------------------------------ moves --
for (const [id, def] of Object.entries(MOVES)) {
  if (!['physical', 'special', 'status'].includes(def.category)) {
    fail(`move ${id}: bad category "${def.category}"`);
  }
  if (def.category === 'status' && def.power !== 0) fail(`move ${id}: status move with power`);
  if (def.category !== 'status' && def.power <= 0) fail(`move ${id}: damaging move with no power`);
  if (def.pp <= 0) fail(`move ${id}: non-positive PP`);
  if (def.accuracy <= 0 || def.accuracy > 100) fail(`move ${id}: accuracy ${def.accuracy}`);
}

// A move nothing can learn is dead weight; flag it so the table stays honest.
const taught = new Set();
for (const def of Object.values(SPECIES)) for (const [, m] of def.learnset) taught.add(m);
for (const id of Object.keys(MOVES)) {
  if (!taught.has(id)) warn(`move ${id}: no species learns it`);
}

// --------------------------------------------------------------- trainers --
for (const [id, def] of Object.entries(TRAINERS)) {
  if (!ACTOR_PALETTES[def.sprite]) fail(`trainer ${id}: unknown sprite "${def.sprite}"`);
  if (!def.party?.length) fail(`trainer ${id}: empty party`);
  for (const entry of def.party ?? []) {
    if (!SPECIES[entry.species]) fail(`trainer ${id}: unknown species "${entry.species}"`);
    if (entry.level < 1 || entry.level > 100) fail(`trainer ${id}: level ${entry.level} out of range`);
  }
  for (const field of ['intro', 'defeat', 'after']) {
    if (!def[field]) fail(`trainer ${id}: missing "${field}" line`);
  }
  if (typeof def.reward !== 'number') fail(`trainer ${id}: missing reward`);
  if (def.house && !HOUSES[def.house]) fail(`trainer ${id}: unknown house "${def.house}"`);
}

// Every trainer has to convert cleanly into somebody who fights you themselves.
for (const id of Object.keys(TRAINERS)) {
  const built = trainerAsDuellist(id);
  for (const key of ['vigour', 'might', 'guard', 'swiftness', 'wind', 'level']) {
    if (!(built[key] > 0)) fail(`trainer ${id}: converts to ${key} of ${built[key]}`);
  }
  for (const t of built.techniques) {
    if (!TECHNIQUES[t]) fail(`trainer ${id}: converts to unknown technique "${t}"`);
  }
  if (!SPECIES[built.beast.species]) fail(`trainer ${id}: converts to unknown beast`);
  for (const field of ['intro', 'defeat', 'after']) {
    if (!built[field]) fail(`trainer ${id}: converts without "${field}"`);
  }
}

// ------------------------------------------------------------------ items --
for (const [id, def] of Object.entries(ITEMS)) {
  if (!def.name) fail(`item ${id}: no name`);
  if (!def.desc) fail(`item ${id}: no description`);
  if (!def.key && !def.use) fail(`item ${id}: non-key item with no effect`);
}

// ------------------------------------------------------------------- maps --
const referencedTrainers = new Set();

for (const [mapId, map] of Object.entries(MAPS)) {
  // Grid sanity: every character must be in the tile legend.
  const raw = map.tiles;
  const widths = new Set(raw.map((row) => row.length));
  if (widths.size > 1) {
    warn(`map ${mapId}: rows of differing width ${[...widths].join('/')} (padded on load)`);
  }
  raw.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!TILE_DEFS[row[x]]) fail(`map ${mapId}: unknown tile "${row[x]}" at ${x},${y}`);
    }
  });

  if (map.music && !TRACKS[map.music]) fail(`map ${mapId}: unknown music track "${map.music}"`);

  // Warps must land somewhere the player can stand, on a map that exists.
  for (const warp of map.warps ?? []) {
    const target = MAPS[warp.to];
    if (!target) {
      fail(`map ${mapId}: warp at ${warp.x},${warp.y} points at unknown map "${warp.to}"`);
      continue;
    }
    if (!walkable(map, warp.x, warp.y)) {
      fail(`map ${mapId}: warp tile ${warp.x},${warp.y} is not walkable ("${tileAt(map, warp.x, warp.y)}")`);
    }
    if (!walkable(target, warp.tx, warp.ty)) {
      fail(`map ${mapId}: warp to ${warp.to} lands on a solid tile at ${warp.tx},${warp.ty} `
         + `("${tileAt(target, warp.tx, warp.ty)}")`);
    }
    // Arriving on the destination's own warp tile would bounce you straight back.
    const bounce = (target.warps ?? []).find((w) => w.x === warp.tx && w.y === warp.ty);
    if (bounce) {
      fail(`map ${mapId}: warp to ${warp.to} lands on another warp at ${warp.tx},${warp.ty}`);
    }
  }

  for (const npc of map.npcs ?? []) {
    if (!ACTOR_PALETTES[npc.sprite]) fail(`map ${mapId}: NPC "${npc.name}" has unknown sprite "${npc.sprite}"`);
    if (!SCRIPTS[npc.script]) fail(`map ${mapId}: NPC "${npc.name}" runs unknown script "${npc.script}"`);
    if (!walkable(map, npc.x, npc.y)) {
      fail(`map ${mapId}: NPC "${npc.name}" stands on a solid tile at ${npc.x},${npc.y} `
         + `("${tileAt(map, npc.x, npc.y)}")`);
    }
    if ((map.warps ?? []).some((w) => w.x === npc.x && w.y === npc.y)) {
      fail(`map ${mapId}: NPC "${npc.name}" is standing on a warp at ${npc.x},${npc.y}`);
    }
    if (npc.data?.trainer) {
      if (!TRAINERS[npc.data.trainer]) {
        fail(`map ${mapId}: NPC "${npc.name}" references unknown trainer "${npc.data.trainer}"`);
      } else {
        if (referencedTrainers.has(npc.data.trainer)) {
          fail(`trainer ${npc.data.trainer} is placed on more than one map`);
        }
        referencedTrainers.add(npc.data.trainer);
      }
    }
    // A merchant stocks a flat list of items; a smith stocks gear by slot.
    const stock = npc.data?.stock;
    if (Array.isArray(stock)) {
      for (const id of stock) {
        if (!ITEMS[id]) fail(`map ${mapId}: shop stocks unknown item "${id}"`);
      }
    } else if (stock && typeof stock === 'object') {
      /* All five slots. helm and gloves were missing, so every armoury in the
         game -- twelve of them -- reported two failures apiece for stocking
         perfectly ordinary kit, and the noise sat in the backlog looking like
         somebody else's problem. */
      const tables = { weapon: WEAPONS, armour: ARMOUR, shield: SHIELDS,
                       helm: HELMS, gloves: GLOVES };
      for (const [slot, ids] of Object.entries(stock)) {
        if (!tables[slot]) { fail(`map ${mapId}: smith stocks unknown slot "${slot}"`); continue; }
        for (const id of ids) {
          if (!tables[slot][id]) fail(`map ${mapId}: smith stocks unknown ${slot} "${id}"`);
        }
      }
    }
    // A duel may name a duellist or a roaming archetype; the script builds the
    // archetype at the player's level. Only a name that is neither is broken.
    if (npc.data?.duel && !DUELLISTS[npc.data.duel] && !ROAMER_TABLE[npc.data.duel]) {
      fail(`map ${mapId}: NPC "${npc.name}" references unknown duellist "${npc.data.duel}"`);
    }
  }

  // Two people cannot occupy one tile.
  const occupied = new Map();
  for (const npc of map.npcs ?? []) {
    const key = `${npc.x},${npc.y}`;
    if (occupied.has(key)) fail(`map ${mapId}: "${npc.name}" and "${occupied.get(key)}" share tile ${key}`);
    occupied.set(key, npc.name);
  }

  // Encounters are people on the road, so each entry names a roaming archetype
  // and the levels the region builds it at.
  for (const entry of map.encounters ?? []) {
    // An entry is either somebody on the road or something living in the cover.
    if (entry.beast) {
      if (!SPECIES[entry.beast]) {
        fail(`map ${mapId}: encounter table names unknown beast "${entry.beast}"`);
        continue;
      }
    } else if (!ROAMERS[entry.roamer]) {
      fail(`map ${mapId}: encounter table names unknown roamer "${entry.roamer}"`);
      continue;
    }
    const what = entry.beast ?? entry.roamer;
    if (entry.min > entry.max) fail(`map ${mapId}: encounter ${what} has min > max`);
    if (!(entry.min >= 1 && entry.max <= 100)) {
      fail(`map ${mapId}: encounter ${what} levels ${entry.min}-${entry.max} out of range`);
    }
    if (!(entry.weight > 0)) fail(`map ${mapId}: encounter ${what} has no weight`);
  }
  const hasGrass = map.grid.some((row) => [...row].some((c) => TILE_DEFS[c]?.kind === 'encounter'));
  /* Somewhere with a counter or a healer in it is somewhere people live, and
     nobody is ambushed in the middle of their own town. This warned about
     Castle Black, which has a patch of grass in the yard and is the safest
     ground north of Winterfell. */
  const settled = (map.npcs ?? []).some((n) => n.data?.stock || n.data?.shop
    || /heal|maester|shop|merchant|smith|innkeep|steward|septa|aemon/i
         .test(`${n.script ?? ''} ${n.name ?? ''}`));
  if (hasGrass && !settled && !(map.encounters ?? []).length) {
    warn(`map ${mapId}: has cover to ambush from but no encounter table`);
  }

  const seenFlags = new Set();
  for (const it of map.items ?? []) {
    /* Against every table the cartridge can draw a ware from, not just the
       pouch. Checking ITEMS alone called two hundred real chests unknown and
       said nothing at all about the thirteen that really were empty, which is
       the worst of both: noise where there was no fault, and silence where
       there was. A chest holding something the console has no ware for hands
       the player a lid and some coins. */
    if (!wareExists(it.item)) {
      fail(`map ${mapId}: ground item "${it.item}" is nothing the cartridge can hand over`);
    }
    /* And the same question of this build, which is not the same question.
       wareExists asks what the cartridge can produce, and the cartridge has
       systems the browser does not - crafting, relics, snares, a gear ladder -
       so forty-two kinds of thing passed this check and still threw "Unknown
       item" the moment a player opened the chest. */
    try {
      item(it.item);
    } catch {
      fail(`map ${mapId}: ground item "${it.item}" is nothing this build can name`);
    }
    if (!it.flag) fail(`map ${mapId}: ground item at ${it.x},${it.y} has no flag`);
    if (seenFlags.has(it.flag)) fail(`map ${mapId}: duplicate item flag "${it.flag}"`);
    seenFlags.add(it.flag);
    /* A pickup is a chest, in both builds: you walk up to it and open it, and
       the tile it stands on is furniture whether or not the map drew a chest
       there. So the question is not whether you can walk onto it - twenty of
       these are sitting on a drawn chest and were meant to be - but whether
       there is anywhere at all to stand and open it. */
    if (!BESIDE.some(([dx, dy]) => walkable(map, it.x + dx, it.y + dy))) {
      fail(`map ${mapId}: ground item at ${it.x},${it.y} has nowhere to stand to open it`);
    }
  }

  for (const sign of map.signs ?? []) {
    if (!sign.text) fail(`map ${mapId}: sign at ${sign.x},${sign.y} has no text`);
    // Signs are read by facing them, so they must sit on something solid;
    // on a walkable tile the player simply steps over the text forever.
    if (walkable(map, sign.x, sign.y)) {
      fail(`map ${mapId}: sign at ${sign.x},${sign.y} is on a walkable tile `
         + `("${tileAt(map, sign.x, sign.y)}") and can never be faced`);
    } else if (!BESIDE.some(([dx, dy]) => walkable(map, sign.x + dx, sign.y + dy))) {
      /* And solid is only half of it. A sign in the middle of a wall is as
         unread as one underfoot, and neither reads as a fault to anyone
         looking at the map - it just quietly says nothing forever. */
      fail(`map ${mapId}: sign at ${sign.x},${sign.y} has nowhere to stand to read it`);
    }
  }

  // Every map except the starting room needs a way out.
  if (!(map.warps ?? []).length) fail(`map ${mapId}: no warps — the player would be trapped`);
}

// Gym leaders and rivals are reached through bespoke scripts rather than the
// generic trainer script, so exclude them from the "placed somewhere" check.
const SCRIPTED_TRAINERS = new Set([
  'gymStark', 'gymTully', 'gymLannister', 'gymThrone', 'rival1', 'rival2', 'rival3',
]);
for (const id of Object.keys(TRAINERS)) {
  if (!referencedTrainers.has(id) && !SCRIPTED_TRAINERS.has(id)) {
    warn(`trainer ${id}: defined but never placed on a map`);
  }
}

// ------------------------------------------------------------- duellists --
for (const [id, def] of Object.entries(DUELLISTS)) {
  if (!ACTOR_PALETTES[def.sprite]) fail(`duellist ${id}: unknown sprite "${def.sprite}"`);
  for (const t of def.techniques) {
    if (!TECHNIQUES[t]) fail(`duellist ${id}: unknown technique "${t}"`);
  }
  for (const field of ['intro', 'defeat', 'after']) {
    if (!def[field]) fail(`duellist ${id}: missing "${field}" line`);
  }
  for (const key of ['vigour', 'might', 'guard', 'swiftness', 'level']) {
    if (typeof def[key] !== 'number') fail(`duellist ${id}: missing numeric ${key}`);
  }
  if (def.loot) {
    const [slot, gid] = def.loot;
    const tables = { weapon: WEAPONS, armour: ARMOUR, shield: SHIELDS };
    if (!tables[slot]?.[gid]) fail(`duellist ${id}: loot "${slot}/${gid}" does not exist`);
  }
  if (def.house && !HOUSES[def.house]) fail(`duellist ${id}: unknown house "${def.house}"`);
  if (def.beast) {
    if (!SPECIES[def.beast.species]) {
      fail(`duellist ${id}: beast species "${def.beast.species}" does not exist`);
    }
    if (!(def.beast.level >= 1 && def.beast.level <= 100)) {
      fail(`duellist ${id}: beast level ${def.beast.level} is out of range`);
    }
  }
}

// ---------------------------------------------------------------- houses --
for (const [id, def] of Object.entries(HOUSES)) {
  for (const field of ['name', 'full', 'short', 'seat', 'words', 'sworn']) {
    if (!def[field]) fail(`house ${id}: missing "${field}"`);
  }
  for (const key of ['colour', 'accent']) {
    if (!/^#[0-9a-f]{6}$/i.test(def[key] ?? '')) fail(`house ${id}: ${key} is not a #rrggbb colour`);
  }
  for (const other of [...(def.rivals ?? []), ...(def.allies ?? [])]) {
    if (!HOUSES[other]) fail(`house ${id}: names unknown house "${other}"`);
    if (other === id) fail(`house ${id}: is its own rival or ally`);
  }
  const both = (def.rivals ?? []).filter((r) => (def.allies ?? []).includes(r));
  if (both.length) fail(`house ${id}: ${both.join(', ')} listed as both rival and ally`);
}
for (const id of SWEARABLE) {
  if (!HOUSES[id]) fail(`swearable house "${id}" does not exist`);
}
for (const [sprite, houseId] of Object.entries(SPRITE_HOUSE)) {
  if (!ACTOR_PALETTES[sprite]) fail(`SPRITE_HOUSE: unknown sprite "${sprite}"`);
  if (!HOUSES[houseId]) fail(`SPRITE_HOUSE: sprite "${sprite}" names unknown house "${houseId}"`);
}

// ------------------------------------------------------------- cutscenes --
const BEATS = new Set(['say', 'wait', 'shake', 'flash', 'spawn', 'walk', 'face',
  'despawn', 'sky', 'flag', 'choose', 'fight']);

for (const [id, def] of Object.entries(CUTSCENES)) {
  const map = MAPS[def.map];
  if (!map) {
    fail(`cutscene ${id}: unknown map "${def.map}"`);
    continue;
  }
  if (!def.flag) fail(`cutscene ${id}: no flag, so it would fire every time`);
  // The trigger tile has to be somewhere the player can actually stand.
  if (!walkable(map, def.x, def.y)) {
    fail(`cutscene ${id}: trigger at ${def.x},${def.y} on ${def.map} is not walkable `
       + `("${tileAt(map, def.x, def.y)}")`);
  }
  if ((map.warps ?? []).some((w) => w.x === def.x && w.y === def.y)) {
    fail(`cutscene ${id}: trigger sits on a warp, so it would never fire`);
  }
  if (!def.beats?.length) fail(`cutscene ${id}: no beats`);

  /* Somebody has to be in it.
   *
   * Twelve of twenty-three scenes had nobody on the map at all, and four of
   * those had a named speaker: a child called Little Bird talked to an empty
   * street for three screens, and the player quite reasonably reported that
   * most of the cutscenes have no one in them. A scene is a camera pointed at
   * something. */
  {
    const spawns = (def.beats ?? []).filter((b) => b[0] === 'spawn');
    const speaks = (def.beats ?? []).some(
      (b) => b[0] === 'say' && /^[A-Z][A-Za-z' -]{1,24}:/.test(b[1] ?? ''));
    if (!spawns.length) {
      fail(`cutscene ${id}: nobody is in it`
        + (speaks ? ', and somebody speaks by name' : ''));
    }
    for (const [, who, at] of spawns) {
      if (!at) continue;
      /* On the ground, and on the screen. The GBA shows fifteen tiles across
         and ten down with the player in the middle of them, so anybody more
         than seven across or five down is being acted out off-camera. */
      if (!walkable(map, at.x, at.y)) {
        fail(`cutscene ${id}: ${who} is spawned at ${at.x},${at.y}, `
          + `which is "${tileAt(map, at.x, at.y)}"`);
      }
      if (Math.abs(at.x - def.x) > 7 || Math.abs(at.y - def.y) > 5) {
        fail(`cutscene ${id}: ${who} is spawned off the edge of the screen `
          + `(${Math.abs(at.x - def.x)} across, ${Math.abs(at.y - def.y)} down)`);
      }
    }
  }

  const spawned = new Set(['player']);
  for (const beat of def.beats ?? []) {
    const [kind, ...args] = beat;
    if (!BEATS.has(kind)) fail(`cutscene ${id}: unknown beat "${kind}"`);
    if (kind === 'spawn') {
      spawned.add(args[0]);
      if (!ACTOR_PALETTES[args[1]?.sprite]) {
        fail(`cutscene ${id}: spawns unknown sprite "${args[1]?.sprite}"`);
      }
    }
    if ((kind === 'walk' || kind === 'face' || kind === 'despawn') && !spawned.has(args[0])) {
      fail(`cutscene ${id}: "${kind}" refers to "${args[0]}" before it is spawned`);
    }
    if (kind === 'say' && !args[0]) fail(`cutscene ${id}: an empty line`);
    if (kind === 'choose' && !(args[1]?.length >= 2)) {
      fail(`cutscene ${id}: a choice with fewer than two options`);
    }
  }
}

// ---------------------------------------------------------------- quests --
for (const [id, def] of Object.entries(QUESTS)) {
  for (const field of ['name', 'region', 'summary', 'giver', 'open']) {
    if (!def[field]) fail(`quest ${id}: missing "${field}"`);
  }
  if (!def.resolve?.length) fail(`quest ${id}: no way to resolve it`);
  for (const option of def.resolve ?? []) {
    if (!option.label) fail(`quest ${id}: an option has no label`);
    if (!option.result) fail(`quest ${id}: option "${option.label}" has no outcome text`);
    for (const house of Object.keys(option.standing ?? {})) {
      if (!HOUSES[house]) fail(`quest ${id}: option "${option.label}" names unknown house "${house}"`);
    }
    if (option.roamer && !ROAMER_TABLE[option.roamer.id]) {
      fail(`quest ${id}: option "${option.label}" names unknown roamer "${option.roamer.id}"`);
    }
  }
}

const placedQuests = new Set();
for (const map of Object.values(MAPS)) {
  for (const npc of map.npcs ?? []) {
    if (npc.data?.quest) placedQuests.add(npc.data.quest);
  }
}
for (const id of Object.keys(QUESTS)) {
  if (!placedQuests.has(id)) warn(`quest ${id}: defined but nobody gives it`);
}
for (const id of placedQuests) {
  if (!QUESTS[id]) fail(`a map gives unknown quest "${id}"`);
}

// ------------------------------------------------------------ companions --
for (const [id, def] of Object.entries(COMPANIONS)) {
  if (!ACTOR_PALETTES[def.sprite]) fail(`companion ${id}: unknown sprite "${def.sprite}"`);
  if (def.house && !HOUSES[def.house]) fail(`companion ${id}: unknown house "${def.house}"`);
  if (!AID_DESCRIPTION[def.aid]) fail(`companion ${id}: unknown aid "${def.aid}"`);
  for (const field of ['name', 'recruit', 'refuse', 'death']) {
    if (!def[field]) fail(`companion ${id}: missing "${field}"`);
  }
  if (!def.lines?.length) fail(`companion ${id}: no road lines`);
  for (const key of ['level', 'vigour', 'might', 'guard']) {
    if (!(def[key] > 0)) fail(`companion ${id}: ${key} is ${def[key]}`);
  }
  if (def.requires && !HOUSES[def.requires.house]) {
    fail(`companion ${id}: requires unknown house "${def.requires.house}"`);
  }
}

// Everyone who can be recruited has to be standing somewhere.
const placedCompanions = new Set();
for (const map of Object.values(MAPS)) {
  for (const npc of map.npcs ?? []) {
    if (npc.data?.companion) placedCompanions.add(npc.data.companion);
  }
}
for (const id of Object.keys(COMPANIONS)) {
  if (!placedCompanions.has(id)) warn(`companion ${id}: defined but never placed on a map`);
}
for (const id of placedCompanions) {
  if (!COMPANIONS[id]) fail(`a map places unknown companion "${id}"`);
}

// --------------------------------------------------------------- roamers --
for (const [id, def] of Object.entries(ROAMERS)) {
  if (!def.sprites?.length) fail(`roamer ${id}: no sprites`);
  for (const sprite of def.sprites ?? []) {
    if (!ACTOR_PALETTES[sprite]) fail(`roamer ${id}: unknown sprite "${sprite}"`);
  }
  if (!def.lines?.length) fail(`roamer ${id}: no opening lines`);
  for (const t of def.techniques ?? []) {
    if (!TECHNIQUES[t]) fail(`roamer ${id}: unknown technique "${t}"`);
  }
  if (def.beast && !SPECIES[def.beast.species]) {
    fail(`roamer ${id}: beast species "${def.beast.species}" does not exist`);
  }
  if (def.house && !HOUSES[def.house]) fail(`roamer ${id}: unknown house "${def.house}"`);
  // Build one at each end of the scale, in every look it comes in, and check
  // the numbers and the name both come out sane.
  for (const level of [1, 50]) {
    for (let i = 0; i < def.sprites.length; i++) {
      const built = makeRoamer(id, level, (list) => list[i % list.length]);
      for (const key of ['vigour', 'might', 'guard', 'swiftness', 'wind']) {
        if (!(built[key] > 0)) fail(`roamer ${id}: ${key} is ${built[key]} at level ${level}`);
      }
      if (!built.name || built.name.includes('undefined')) {
        fail(`roamer ${id}: bad name "${built.name}" for sprite "${def.sprites[i % def.sprites.length]}"`);
      }
      if (built.house && !HOUSES[built.house]) fail(`roamer ${id}: built with unknown house`);
    }
  }
}

for (const [region, table] of Object.entries(ROAMER_TABLES)) {
  for (const id of table) {
    if (!ROAMERS[id]) fail(`roamer table for ${region}: unknown roamer "${id}"`);
  }
}

// ------------------------------------------------------------------ gear --
for (const [table, name] of [[WEAPONS, 'weapon'], [ARMOUR, 'armour'], [SHIELDS, 'shield']]) {
  for (const [id, def] of Object.entries(table)) {
    if (!def.name) fail(`${name} ${id}: no name`);
    if (!def.desc) fail(`${name} ${id}: no description`);
    if (name === 'weapon') {
      if (!def.techniques?.length) fail(`weapon ${id}: teaches no techniques`);
      for (const t of def.techniques ?? []) {
        if (!TECHNIQUES[t]) fail(`weapon ${id}: unknown technique "${t}"`);
      }
    }
  }
}

const duelPlaced = new Set();
for (const map of Object.values(MAPS)) {
  for (const npc of map.npcs ?? []) if (npc.data?.duel) duelPlaced.add(npc.data.duel);
}
// A few duellists are reached through a bespoke script rather than a data.duel
// NPC; name them here so the "never placed" warning stays meaningful.
// The throne champion stands nowhere on purpose: the last act puts him in front
// of you once Cersei falls, which is the one fight in the game that has no
// person on a map behind it.
for (const id of ['joryCassel', 'cersei', 'throneChampion']) duelPlaced.add(id);
for (const id of Object.keys(DUELLISTS)) {
  if (!duelPlaced.has(id)) warn(`duellist ${id}: defined but never placed on a map`);
}

// ---------------------------------------------------------------- summary --
console.log(`Checked ${Object.keys(MAPS).length} maps, ${SPECIES_IDS.length} species, `
  + `${Object.keys(MOVES).length} moves, ${Object.keys(TRAINERS).length} trainers, `
  + `${Object.keys(DUELLISTS).length} duellists.`);

for (const w of warnings) console.log(`  warn  ${w}`);
for (const p of problems) console.log(`  FAIL  ${p}`);

if (problems.length) {
  console.log(`\n${problems.length} problem(s) found.`);
  process.exit(1);
}
console.log(`\nAll good${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`);
