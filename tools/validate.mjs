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
import { ITEMS } from '../src/data/items.js';
import { TRAINERS } from '../src/data/trainers.js';
import { DUELLISTS } from '../src/data/duellists.js';
import { WEAPONS, ARMOUR, SHIELDS, TECHNIQUES } from '../src/data/gear.js';
import { SCRIPTS } from '../src/data/scripts.js';
import { TILE_DEFS } from '../src/art/tiles.js';
import { ARCHETYPES } from '../src/art/creatures.js';
import { ACTOR_PALETTES } from '../src/art/actors.js';
import { TRACKS } from '../src/data/music.js';

const problems = [];
const warnings = [];
const fail = (msg) => problems.push(msg);
const warn = (msg) => warnings.push(msg);

const tileAt = (map, x, y) => (
  x < 0 || y < 0 || y >= map.height || x >= map.width ? '#' : map.grid[y][x]
);
const kindAt = (map, x, y) => TILE_DEFS[tileAt(map, x, y)]?.kind ?? 'solid';
const walkable = (map, x, y) => {
  const kind = kindAt(map, x, y);
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
      const tables = { weapon: WEAPONS, armour: ARMOUR, shield: SHIELDS };
      for (const [slot, ids] of Object.entries(stock)) {
        if (!tables[slot]) { fail(`map ${mapId}: smith stocks unknown slot "${slot}"`); continue; }
        for (const id of ids) {
          if (!tables[slot][id]) fail(`map ${mapId}: smith stocks unknown ${slot} "${id}"`);
        }
      }
    }
    if (npc.data?.duel && !DUELLISTS[npc.data.duel]) {
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

  for (const entry of map.encounters ?? []) {
    if (!SPECIES[entry.species]) fail(`map ${mapId}: encounter table names unknown species "${entry.species}"`);
    if (entry.min > entry.max) fail(`map ${mapId}: encounter ${entry.species} has min > max`);
    if (!(entry.weight > 0)) fail(`map ${mapId}: encounter ${entry.species} has no weight`);
  }
  const hasGrass = map.grid.some((row) => [...row].some((c) => TILE_DEFS[c]?.kind === 'encounter'));
  if (hasGrass && !(map.encounters ?? []).length) {
    warn(`map ${mapId}: has tall grass but no encounter table`);
  }

  const seenFlags = new Set();
  for (const it of map.items ?? []) {
    if (!ITEMS[it.item]) fail(`map ${mapId}: ground item "${it.item}" is unknown`);
    if (!it.flag) fail(`map ${mapId}: ground item at ${it.x},${it.y} has no flag`);
    if (seenFlags.has(it.flag)) fail(`map ${mapId}: duplicate item flag "${it.flag}"`);
    seenFlags.add(it.flag);
    if (!walkable(map, it.x, it.y)) {
      fail(`map ${mapId}: ground item at ${it.x},${it.y} sits on a solid tile`);
    }
  }

  for (const sign of map.signs ?? []) {
    if (!sign.text) fail(`map ${mapId}: sign at ${sign.x},${sign.y} has no text`);
    // Signs are read by facing them, so they must sit on something solid;
    // on a walkable tile the player simply steps over the text forever.
    if (walkable(map, sign.x, sign.y)) {
      fail(`map ${mapId}: sign at ${sign.x},${sign.y} is on a walkable tile `
         + `("${tileAt(map, sign.x, sign.y)}") and can never be faced`);
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
