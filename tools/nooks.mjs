#!/usr/bin/env node
/*
 * What the exporter will hide, and what it will leave open - in a couple of
 * seconds rather than at the end of a half-hour export.
 *
 *   node tools/nooks.mjs              every map, and the worst tile in the world
 *   node tools/nooks.mjs harrenhal    one map, and where its chests land
 *
 * This runs gba/nooks.mjs itself, not a copy of it, so it cannot drift from
 * what the cartridge actually gets. Three builds in a row were spent asking the
 * audit a question that could have been asked here.
 */
import { MAPS } from '../src/data/maps.js';
import { TILE_DEFS } from '../src/art/tiles.js';
import { hiddenNooks } from '../gba/nooks.mjs';

/* The exporter's own rule, from the same tables the browser draws with. */
const isSolid = (char) => {
  const kind = TILE_DEFS[char]?.kind ?? 'solid';
  return kind === 'solid' || kind === 'water';
};

const NEAR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const only = process.argv[2];

/* The question the audit will ask afterwards: with everything standing where
   it stands, how much can one person shut behind them by not moving?

   Read this as a comparison, not a verdict. The audit forgives a bridge and a
   ledge gap and this does not, so a canal city reads as catastrophic here and
   passes there - Braavos is nothing but one-tile bridges. What it is good for
   is the same map before and after a change. */
function worstStanding(map, nooks) {
  const solid = new Set([
    ...(map.items ?? []).map((i) => `${i.x},${i.y}`),
    ...(map.npcs ?? []).map((n) => `${n.x},${n.y}`),
    ...nooks.map((h) => `${h.x},${h.y}`),
  ]);
  const walk = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height
    && !isSolid(map.grid[y][x] ?? '.');
  const reach = (extra) => {
    const from = (map.warps ?? []).find((w) => walk(w.x, w.y) && !solid.has(`${w.x},${w.y}`));
    if (!from) return 0;
    const seen = new Set([`${from.x},${from.y}`]);
    const queue = [[from.x, from.y]];
    let n = 0;
    while (queue.length) {
      const [cx, cy] = queue.pop();
      n++;
      for (const [ox, oy] of NEAR) {
        const nx = cx + ox, ny = cy + oy, key = `${nx},${ny}`;
        if (!walk(nx, ny) || solid.has(key) || key === extra || seen.has(key)) continue;
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
    return n;
  };
  const whole = reach(null);
  let worst = 0, where = '';
  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      const key = `${x},${y}`;
      if (!walk(x, y) || solid.has(key)) continue;
      /* A doorway is a corridor by construction, and nobody is put in one. */
      if ((map.warps ?? []).some((w) => Math.abs(w.x - x) + Math.abs(w.y - y) <= 1)) continue;
      /* And nowhere anybody could come to rest. */
      if (!(map.npcs ?? []).some((n) => Math.abs(n.x - x) <= 3 && Math.abs(n.y - y) <= 3)) continue;
      const lost = whole - 1 - reach(key);
      if (lost > worst) { worst = lost; where = `${x},${y}`; }
    }
  }
  return { worst, where };
}

let total = 0, outdoor = 0, worstSeen = 0, worstAt = '';
for (const [id, map] of Object.entries(MAPS)) {
  if (only && id !== only) continue;
  const chestAt = new Set((map.items ?? []).map((it) => `${it.x},${it.y}`));
  const nooks = hiddenNooks(map, chestAt, id, isSolid);
  total += nooks.length;
  if (!map.indoor) outdoor++;
  const { worst, where } = map.indoor ? { worst: 0, where: '' } : worstStanding(map, nooks);
  if (only || worst > worstSeen) {
    if (!only && worst > worstSeen) { worstSeen = worst; worstAt = `${map.name} ${where}`; }
    if (only) {
      console.log(`${map.name}: ${nooks.length} hidden `
        + `(${nooks.map((h) => `${h.x},${h.y} ${h.find}`).join('; ') || 'none'})`);
      console.log(`  the most one person could shut: ${worst}${where ? ` at ${where}` : ''}`);
    }
  }
}
if (!only) {
  console.log(`${total} hidden over ${outdoor} outdoor maps`);
  console.log(`the most one person could shut anywhere: ${worstSeen} at ${worstAt}`);
  console.log('(counted without the bridges and ledges the audit forgives, so '
    + 'compare it against itself rather than reading it as a fault)');
}
