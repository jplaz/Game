// Walks every map the way the cartridge walks it, and complains about anything
// you could not actually get to.
//
// This used to flood the map treating a ledge as ordinary ground, which is not
// what the game does: a ledge is a one-way drop southward and can never be
// stood on or climbed. So a whole quarter of a map reachable only by going up a
// drop looked fine here and was a wall in your hands. Somebody standing still
// is a wall too - roamers step aside, but a stationary body in a one-tile
// corridor closes the road for good.
import { MAPS } from '/home/user/Game/src/data/maps.js';
import { TILE_DEFS } from '/home/user/Game/src/art/tiles.js';
import { PORTS, PORT_MAPS } from '/home/user/Game/src/data/ports.js';

const kindOf = (c) => TILE_DEFS[c]?.kind ?? 'missing';
const SOLID = new Set(['solid', 'water']);
let problems = 0;
const say = (s) => { problems++; console.log('  x ' + s); };

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

for (const [id, map] of Object.entries(MAPS)) {
  const { grid, width, height } = map;
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height) ? '#' : grid[y][x];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (kindOf(at(x, y)) === 'missing') say(`${id}: unknown tile '${at(x, y)}' at ${x},${y}`);
  }

  /* Open water is a wall everywhere except on the open water, where it is the
     road. A map marked `sea` is one you cross in a ship, so its rules are the
     other way up: the water carries you and the islands are what stops you.
     Without this every beach on every islet reads as ground walled off from
     every door, which is exactly what it is on foot and exactly not the
     point. */
  const sea = Boolean(map.sea);
  const solid = (x, y) => x < 0 || y < 0 || x >= width || y >= height
    || (SOLID.has(kindOf(at(x, y))) && !(sea && kindOf(at(x, y)) === 'water'));
  const ledge = (x, y) => kindOf(at(x, y)) === 'ledge';
  // Ground you can come to rest on: not solid, and not the drop itself.
  const stand = (x, y) => !solid(x, y) && !ledge(x, y);

  /* A thing in the ground is a chest, and a chest is solid once the exporter
     has put one there. Somebody standing on one is standing inside furniture:
     the boatman who is the only way off Hardhome was doing exactly that, and
     nothing here was looking, because this file reads the grid as written
     rather than as the cartridge ends up drawing it. */
  for (const it of map.items ?? []) {
    for (const p of map.npcs ?? []) {
      if (p.x === it.x && p.y === it.y) {
        say(`${id}: ${p.name ?? 'somebody'} stands on the ${it.item} at ${it.x},${it.y}`);
      }
    }
    for (const w of map.warps ?? []) {
      if (w.x === it.x && w.y === it.y) {
        say(`${id}: the door to ${w.to} at ${w.x},${w.y} has a ${it.item} in it`);
      }
    }
  }

  /* Somebody who never moves is part of the wall. Somebody who roams shuffles
     about and the cartridge already keeps them out of corridors and doorways,
     so they are not a blockage. */
  /* And somebody who keeps hours is only part of the wall while they are
     about. A night porter and a day washerwoman are two different casts
     standing in two different places, and a map that is walkable with one of
     them out can be cut in half with the other one in — which is exactly what
     happened the first time anybody was given a reason to stand in Flea Bottom
     after dark. Check the worst of both. */
  /* A warden is standing in the road on purpose and is gone the moment you
     have the seats they are waiting on, so they are a gate rather than a wall
     and the road behind them is not walled off — it is not open yet. */
  const castAt = (phase) => new Set((map.npcs ?? [])
    .filter((p) => !p.roams && !p.warden && (!p.abroad || p.abroad === phase))
    .map((p) => `${p.x},${p.y}`));
  const dayCast = castAt('day');
  const nightCast = castAt('night');
  const planted = new Set([...dayCast, ...nightCast]);

  // Where you can go from here, obeying the drop rule.
  const from = (x, y) => {
    const out = [];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (ledge(nx, ny)) {
        // Southward only, and it puts you down on the far side of the drop.
        if (dy === 1 && stand(nx, ny + 1)) out.push([nx, ny + 1]);
      } else if (stand(nx, ny)) {
        out.push([nx, ny]);
      }
    }
    return out;
  };

  const flood = (seeds, throughPeople) => {
    const seen = new Set(), q = [];
    for (const [x, y] of seeds) {
      const k = `${x},${y}`;
      if (!seen.has(k)) { seen.add(k); q.push([x, y]); }
    }
    for (let h = 0; h < q.length; h++) {
      for (const [nx, ny] of from(q[h][0], q[h][1])) {
        const k = `${nx},${ny}`;
        if (seen.has(k)) continue;
        if (!throughPeople && planted.has(k)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return seen;
  };

  const ways = (map.warps ?? []);
  /* A berth is a way in and out that is not a door. Hardhome has no road to
     it at all - a ship out of Eastwatch is the only way anybody gets there,
     which is most of the point of the place. */
  const berth = PORT_MAPS.includes(id);
  /* And a berth has to be somewhere a person can stand. A ship that puts you
     down in the water is worse than a ship that does not sail: the audit found
     Hardhome landing you on open sea, and nothing in this file was looking. */
  if (berth) {
    const p = PORTS.find((q) => q.map === id);
    const there = kindOf(at(p.x, p.y));
    if (SOLID.has(there) || there === 'ledge') {
      say(`${id}: the berth at ${p.x},${p.y} is '${at(p.x, p.y)}', which is not somewhere to stand`);
    }
  }
  if (!ways.length && !berth) {
    if (!map.indoor) say(`${id}: no way in or out`);
    continue;
  }
  if (!ways.length) continue;
  // You may arrive by any door, so everything any door reaches counts as reached.
  const seen = flood(ways.map((w) => [w.x, w.y]), false);
  const loose = flood(ways.map((w) => [w.x, w.y]), true);
  const reached = (x, y) => seen.has(`${x},${y}`);
  const beside = (x, y) => DIRS.some(([dx, dy]) => reached(x + dx, y + dy));
  /* The difference between the two floods is exactly what a standing body
     costs you, which is the sort of thing worth being told about by name. */
  const shutIn = (x, y) => !seen.has(`${x},${y}`) && loose.has(`${x},${y}`);

  for (const w of ways) {
    if (!reached(w.x, w.y)) {
      say(shutIn(w.x, w.y)
        ? `${id}: the door to ${w.to} at ${w.x},${w.y} is shut off by somebody standing still`
        : `${id}: the door to ${w.to} at ${w.x},${w.y} cannot be walked to`);
    }
    const there = MAPS[w.to];
    if (!there) { say(`${id}: a door to ${w.to}, which does not exist`); continue; }
    const land = there.grid[w.ty]?.[w.tx] ?? '#';
    if (SOLID.has(kindOf(land)) || kindOf(land) === 'ledge') {
      say(`${id}: the door to ${w.to} lands on ${w.tx},${w.ty}, which is '${land}'`);
    }
  }
  /* A shopkeeper stands behind a counter on purpose: the game lets you speak
     across one, so being walled in by counters is not being walled in. */
  const servedOver = (x, y) => DIRS.some(([dx, dy]) =>
    at(x + dx, y + dy) === 'K' && reached(x + dx * 2, y + dy * 2));
  /* You speak to somebody from the tile beside them, never from under their
     feet, so what matters is whether you can stand next to them. */
  for (const p of map.npcs ?? []) {
    if (!beside(p.x, p.y) && !reached(p.x, p.y) && !servedOver(p.x, p.y)) {
      say(`${id}: ${p.name ?? 'somebody'} at ${p.x},${p.y} cannot be spoken to`);
    }
  }
  for (const s of map.signs ?? []) {
    if (!beside(s.x, s.y)) say(`${id}: a sign at ${s.x},${s.y} nobody can stand next to`);
  }
  for (const it of map.items ?? []) {
    if (!beside(it.x, it.y)) say(`${id}: ${it.item} at ${it.x},${it.y} cannot be got at`);
  }
  if ((map.items ?? []).length > 8) say(`${id}: more than eight things in the ground`);

  /* The trap. Coming in by one door, you have to be able to leave by some
     door - a drop you cannot climb back up, with no way on, is a dead end you
     have to reset the cartridge to get out of. */
  /* Every door has to reach EVERY other door, not merely some other door.
     Asking only for one was the hole Storm's End went through: an inn, a
     cellar and a house drawn side by side walled the yard clean across, and
     because there were doors on both sides of the wall every one of them
     could still reach a door, so this said nothing at all while a third of
     the castle sat behind a building nobody could walk round. */
  for (const w of ways) {
    if (!stand(w.x, w.y)) continue;
    const out = flood([[w.x, w.y]], false);
    const cut = ways.filter((v) => v !== w && stand(v.x, v.y) && !out.has(`${v.x},${v.y}`));
    if (cut.length) {
      say(`${id}: coming in at ${w.x},${w.y} from ${w.to}, you cannot reach `
        + `${cut.length === 1 ? 'the way' : `${cut.length} of the ways`} out `
        + `(${cut.slice(0, 3).map((v) => `${v.x},${v.y}`).join(' ')})`);
      break;   /* one report a map: they all say the same thing */
    }
    if (!ways.some((v) => out.has(`${v.x},${v.y}`))) {
      say(`${id}: coming in at ${w.x},${w.y} from ${w.to}, there is no way back out`);
    }
  }

  // Ground nobody can ever set foot on, in quantity, means a carve went wrong.
  let open = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (stand(x, y)) open++;
  }
  const marooned = open - seen.size;
  if (marooned > 12) {
    say(`${id}: ${marooned} tiles of ground are walled off from every door`);
  }

  /* Ground at the very edge of an outdoor map reads as a road going on. If
     there is no door on it you walk up to the border of the world and stop,
     which is the single most common way this game has of looking broken. */
  if (!map.indoor) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (x && y && x !== width - 1 && y !== height - 1) continue;
      if (!stand(x, y) || !reached(x, y)) continue;
      if (ways.some((w) => w.x === x && w.y === y)) continue;
      say(`${id}: the ground runs off the edge at ${x},${y} with no way on`);
    }
  }

  // Every door tile has to be a door.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (at(x, y) === 'D' && !ways.some((w) => w.x === x && w.y === y)) {
      say(`${id}: a door at ${x},${y} that opens onto nothing`);
    }
  }
}
/* And the check that has to look at two maps at once: where a door puts you
   down, can you walk from that spot to a door out? A room you can be dropped
   into and not walk out of is the worst thing this game can do to you, and
   nothing that looks at one map at a time can see it. */
for (const [id, map] of Object.entries(MAPS)) {
  for (const w of map.warps ?? []) {
    const there = MAPS[w.to];
    if (!there) continue;
    const at = (x, y) => (x < 0 || y < 0 || x >= there.width || y >= there.height)
      ? '#' : there.grid[y][x];
    const solid = (x, y) => x < 0 || y < 0 || x >= there.width || y >= there.height
      || SOLID.has(kindOf(at(x, y)));
    const ledge = (x, y) => kindOf(at(x, y)) === 'ledge';
    const stand = (x, y) => !solid(x, y) && !ledge(x, y);
    const planted = new Set((there.npcs ?? [])
      .filter((p) => !p.roams).map((p) => `${p.x},${p.y}`));
    if (planted.has(`${w.tx},${w.ty}`)) {
      say(`${id}: the door to ${w.to} puts you down on top of somebody at ${w.tx},${w.ty}`);
      continue;
    }
    const seen = new Set([`${w.tx},${w.ty}`]);
    const q = [[w.tx, w.ty]];
    for (let h = 0; h < q.length; h++) {
      const [x, y] = q[h];
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        let lx = nx, ly = ny;
        if (ledge(nx, ny)) { if (dy !== 1 || !stand(nx, ny + 1)) continue; ly = ny + 1; }
        else if (!stand(nx, ny)) continue;
        const k = `${lx},${ly}`;
        if (seen.has(k) || planted.has(k)) continue;
        seen.add(k); q.push([lx, ly]);
      }
    }
    if (!(there.warps ?? []).some((v) => seen.has(`${v.x},${v.y}`))) {
      say(`${id}: going to ${w.to} drops you at ${w.tx},${w.ty}, where there is no door out`);
    }
  }
}

console.log(problems ? `\n${problems} problems` : `\n${Object.keys(MAPS).length} maps, nothing wrong`);
/* And say so in the exit code, so the cartridge build can refuse to spend
   twenty-five minutes packing a world you cannot walk across. */
process.exit(problems ? 1 : 0);
