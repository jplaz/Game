/*
 * Where to hide something worth finding, and where not to.
 *
 * Lifted out of export.mjs so the same code can be run against the live tables
 * in a couple of seconds - see tools/nooks.mjs - instead of only at the far end
 * of a half-hour export. Three builds in a row were spent learning from the
 * audit what this could have said straight away.
 *
 * It imports nothing on purpose. The exporter runs it inside a browser page,
 * where module paths are served URLs, and the tool runs it in node, where they
 * are files; so the one thing it needs from the tile tables - whether a
 * character is something you can walk on - is handed in instead.
 */

/**
 * Pick the hidden chests for one map.
 *
 * `map` is a prepared map from src/data/maps.js, `chestAt` the set of "x,y"
 * the map already puts something on by hand, `id` the map's key (the placement
 * is deterministic in it), and `isSolid` the tile rule. Returns [{x, y, find}].
 */
export function hiddenNooks(map, chestAt, id, isSolid) {
  const width = map.width, height = map.height;
  if (map.indoor) return [];
  const solidGrid = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) solidGrid.push(isSolid(map.grid[y][x] ?? '.') ? 1 : 0);
  }
  const walkable = (x, y) => x >= 0 && y >= 0 && x < width && y < height
    && !solidGrid[y * width + x];
  const doors = (map.warps ?? []).map((w) => [w.x, w.y]);
  const people = new Set((map.npcs ?? []).map((n) => `${n.x},${n.y}`));
  const signs = new Set((map.signs ?? []).map((n) => `${n.x},${n.y}`));
  const away = (x, y) => doors.reduce((best, [dx, dy]) =>
    Math.min(best, Math.abs(dx - x) + Math.abs(dy - y)), 99);
  /* A chest is furniture: solid, and standing where it stands. Drop one
     into a two-way nook and everything behind it is walled off, and narrow
     a corridor with one and somebody roaming can plug what is left. So
     every candidate is tried before it is kept - the map is flooded from a
     door with the chest in place, and if a single tile stops being
     reachable, or a neighbour is left with one way out, it does not go
     there. Generated placement has to be checked, not trusted. */
  /* And the walk has to know what is already standing on the map. This
     asked the tile grid alone, so it strolled through the chests the map
     places by hand and through the people standing on it - and a nook that
     severs nothing on an empty floor severs plenty once the furniture is
     counted. Harrenhal's west wing had two ways round; the poppy milk sat
     in one of them, this dropped a purse in the other, and the whole wing
     then hung on a single tile in the yard. */
  const blocked = new Set([...chestAt, ...people]);
  const seeded = blocked.size;
  const reach = () => {
    const start = (map.warps ?? []).find((w) => walkable(w.x, w.y)
        && !blocked.has(`${w.x},${w.y}`))
      ?? (() => {
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (walkable(x, y) && !blocked.has(`${x},${y}`)) return { x, y };
          }
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
  /* The most any one person standing still could shut behind them, as the
     map stands. Doorways and tiles nobody can reach are somebody else's
     problem - this is the same question the audit asks. */
  const worstCut = () => {
    let worst = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const key = `${x},${y}`;
        if (!walkable(x, y) || blocked.has(key)) continue;
        if (![...people].some((who) => {
          const [px, py] = who.split(',').map(Number);
          return Math.abs(px - x) <= 3 && Math.abs(py - y) <= 3;
        })) continue;
        if (doors.some(([dx, dy]) => Math.abs(dx - x) + Math.abs(dy - y) <= 1)) continue;
        blocked.add(key);
        const left = reach();
        blocked.delete(key);
        const lost = whole - (blocked.size - seeded) - 1 - left;
        if (lost > worst) worst = lost;
      }
    }
    return worst;
  };
  const baseWorst = worstCut();

  const spots = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (!walkable(x, y)) continue;
      if (chestAt.has(`${x},${y}`) || people.has(`${x},${y}`)) continue;
      if ((map.grid[y][x] ?? '.') === 'D') continue;
      /* And never beside a sign. A sign is read from the tile next to it,
         so a chest set down there is a sign nobody can read -- exactly the
         same failure as a chest in a doorway, which this already knew
         about. Alyssa's Tears at the Eyrie had one tile it could be read
         from and a purse ended up on it. */
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]]
          .some(([ox, oy]) => signs.has(`${x + ox},${y + oy}`))) continue;
      /* Never against another chest. A chest is solid, so one set down
         beside a chest that was written into the map by hand can be the
         only tile anybody could have stood on to open it - which is how
         the ransom at the Bloody Gate came to be walled in by a purse. */
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]]
          .some(([ox, oy]) => chestAt.has(`${x + ox},${y + oy}`))) continue;
      const open = openAt(x, y);
      if (open < 1 || open > 2) continue;      /* a nook, not a thoroughfare */
      const far = away(x, y);
      /* And never on a doorstep. Distance from a door was only ever a
         score, so a nook could sit against one - and a chest is furniture,
         so that is a door you arrive inside of. */
      if (far < 2) continue;
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
    /* Nothing behind it, and nothing beside it left with one way out.
       `whole` was already measured with the furniture standing, so only
       the nooks laid since then come off the count. */
    const severs = reach() !== whole - (blocked.size - seeded);
    const pinches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => {
      const nx = spot.x + ox, ny = spot.y + oy;
      return walkable(nx, ny) && !blocked.has(`${nx},${ny}`) && openAt(nx, ny) < 2;
    });
    /* And nothing that leaves somebody else able to shut the map. Asking
       only whether this chest severs anything is the same one-at-a-time
       question that has now been wrong three times: at Harrenhal no single
       thing cut the castle, and a roamer in the yard plus a purse on each
       of the two outer walks cut it in half. So the map is measured the way
       the audit measures it - with this chest down, is there any tile a
       person could stand on and shut more than a handful behind them - and
       the chest only stays if the answer is no worse than it already was. */
    const opens = severs || pinches ? true : worstCut() > Math.max(8, baseWorst);
    if (severs || pinches || opens) { blocked.delete(`${spot.x},${spot.y}`); continue; }
    /* What is in it. Under half are a purse somebody hid and did not come
       back for, three in ten are makings so that walking into corners
       feeds the forge, and a quarter are something you can actually put
       on -- which is the whole reason to open one. */
    const what = roll();
    took.push({ x: spot.x, y: spot.y,
      find: what < 0.30 ? 'makings' : what < 0.55 ? 'gear' : 'gold' });
  }
  return took;
}
