/*
 * Where the nine houses begin.
 *
 * These nine coordinates live in src/data/houses.js, they are the very first
 * tile of a new game, and until this file existed nothing in the build looked
 * at them. Redrawing four seats put three houses -- Greyjoy inside the Great
 * Keep's battlements, Tyrell inside Highgarden's keep, Baratheon inside the
 * drum tower at Storm's End -- through a wall on the title screen, and the ROM
 * built clean every time.
 *
 *   node tools/checkstarts.mjs
 */
import { MAPS } from '../src/data/maps.js';
import { TILE_DEFS } from '../src/art/tiles.js';
import { HOUSE_SEATS } from '../src/data/houses.js';

const SOLID = new Set(['solid', 'water']);
/* Read straight out of the table both builds start from, rather than scraped
   back out of the exporter it used to be typed into. */
const seats = Object.entries(HOUSE_SEATS);
if (seats.length < 9) {
  console.log(`x only nine houses can be sworn to and HOUSE_SEATS has ${seats.length}`);
  process.exit(1);
}

let bad = 0;
const say = (s) => { bad++; console.log('  x ' + s); };

for (const [house, seat] of seats) {
  const { map: id, x, y } = seat;
  const map = MAPS[id];
  if (!map) { say(`${house} begins on '${id}', which is not a map`); continue; }
  const c = (map.tiles[y] ?? '')[x];
  const kind = TILE_DEFS[c]?.kind ?? 'missing';
  if (kind === 'missing') {
    say(`${house} begins at ${id} ${x},${y}, which is off the edge of it`);
  } else if (SOLID.has(kind) || kind === 'ledge') {
    say(`${house} begins at ${id} ${x},${y}, which is '${c}' -- not somewhere to stand`);
  }
  /* And not on top of somebody. Two people on one tile is not a crash, but the
     one underneath cannot be spoken to and the game looks broken from the
     first frame. */
  const who = (map.npcs ?? []).find((p) => p.x === x && p.y === y);
  if (who) say(`${house} begins at ${id} ${x},${y}, standing on ${who.name ?? 'somebody'}`);
}

console.log(bad ? `\n${bad} problems` : `\n${seats.length} houses, all begin on their own two feet`);
process.exit(bad ? 1 : 0);
