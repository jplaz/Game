// Walks every map: is every door, person, sign and chest standing somewhere a
// player can actually get to?
import { MAPS } from '/home/user/Game/src/data/maps.js';
import { TILE_DEFS } from '/home/user/Game/src/art/tiles.js';

const kindOf = (c) => TILE_DEFS[c]?.kind ?? 'missing';
const WALK = new Set(['floor', 'encounter', 'ledge']);
let problems = 0;
const say = (s) => { problems++; console.log('  ✗ ' + s); };

for (const [id, map] of Object.entries(MAPS)) {
  const { grid, width, height } = map;
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height) ? '#' : grid[y][x];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (kindOf(at(x, y)) === 'missing') say(`${id}: unknown tile '${at(x, y)}' at ${x},${y}`);
  }

  // Flood from the first warp, which is how you got here.
  const start = (map.warps ?? [])[0];
  if (!start) { if (!map.indoor) say(`${id}: no way in or out`); continue; }
  const seen = new Set();
  const q = [[start.x, start.y]];
  seen.add(`${start.x},${start.y}`);
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (!WALK.has(kindOf(at(nx, ny)))) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  const reached = (x, y) => seen.has(`${x},${y}`);
  const beside = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reached(x + dx, y + dy));

  for (const w of map.warps ?? []) {
    if (!reached(w.x, w.y)) say(`${id}: the door to ${w.to} at ${w.x},${w.y} cannot be reached`);
    const there = MAPS[w.to];
    if (!there) { say(`${id}: a door to ${w.to}, which does not exist`); continue; }
    if (!WALK.has(kindOf(there.grid[w.ty]?.[w.tx] ?? '#'))) {
      say(`${id}: the door to ${w.to} lands on ${w.tx},${w.ty}, which is '${there.grid[w.ty]?.[w.tx]}'`);
    }
  }
  /* A shopkeeper stands behind a counter on purpose: the game lets you speak
     across one, so being walled in by counters is not being walled in. */
  const servedOver = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
    at(x + dx, y + dy) === 'K' && reached(x + dx * 2, y + dy * 2));
  for (const p of map.npcs ?? []) {
    if (!reached(p.x, p.y) && !servedOver(p.x, p.y)) {
      say(`${id}: ${p.name ?? 'somebody'} at ${p.x},${p.y} is standing somewhere unreachable`);
    }
  }
  for (const s of map.signs ?? []) {
    if (!beside(s.x, s.y)) say(`${id}: a sign at ${s.x},${s.y} nobody can stand next to`);
  }
  for (const it of map.items ?? []) {
    if (!beside(it.x, it.y)) say(`${id}: ${it.item} at ${it.x},${it.y} cannot be got at`);
    if ((map.items ?? []).length > 8) say(`${id}: more than eight things in the ground`);
  }
  // Every door tile has to be a door.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (at(x, y) === 'D' && !(map.warps ?? []).some((w) => w.x === x && w.y === y)) {
      say(`${id}: a door at ${x},${y} that opens onto nothing`);
    }
  }
}
console.log(problems ? `\n${problems} problems` : `\n${Object.keys(MAPS).length} maps, nothing wrong`);
