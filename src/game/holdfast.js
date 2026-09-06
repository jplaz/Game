// A seat of your own.
//
// Somewhere in the world that belongs to you rather than to whoever let you in.
// You name it, you furnish it, you stock its larder from what you find on the
// road, and you feast people in it — which is the only reliable way in this
// world to make somebody who dislikes you sit down at your table.

import { game, changeStanding, addMoney, canAfford } from './state.js';
import { HOUSES } from '../data/houses.js';

export function holdfast() {
  game.state.holdfast = game.state.holdfast ?? {
    owned: false,
    name: 'the Holdfast',
    seat: null,          // map id of your hall
    furnishings: [],     // ids of what you have installed
    larder: {},          // ingredient -> count
    dishes: {},          // cooked dish -> count
    feasts: 0,
    renown: 0,           // how well regarded your table is
  };
  return game.state.holdfast;
}

export function ownsHoldfast() {
  return holdfast().owned;
}

export function grantHoldfast(seat, name) {
  const h = holdfast();
  h.owned = true;
  h.seat = seat;
  h.name = name ?? h.name;
  return h;
}

export function renameHoldfast(name) {
  holdfast().name = name;
}

// ----------------------------------------------------------- furnishings ---

/**
 * What you can put in the hall. Each one does something: a table lets you seat
 * more people at a feast, a hearth lets you cook, a godswood steadies whoever
 * sits under it. Cost is in gold.
 */
export const FURNISHINGS = {
  longTable: {
    name: 'Long Table', cost: 1200, seats: 4, tile: 'T', wide: 4,
    desc: 'Oak, badly scarred, long enough for an argument at either end.',
  },
  hearth: {
    name: 'Great Hearth', cost: 900, cooking: true, tile: 'h', wall: true,
    desc: 'You can cook here rather than over a campfire like a poacher.',
  },
  banners: {
    name: 'House Banners', cost: 600, renown: 2, tile: 'V', wall: true, wide: 2,
    desc: 'Your colours on the wall, so nobody has to ask whose hall this is.',
  },
  godswood: {
    name: 'Godswood', cost: 2000, renown: 3, seats: 2, tile: 'W',
    desc: 'A heart tree in the yard. Northerners relax; southerners do not.',
  },
  armoury: {
    name: 'Armoury', cost: 1500, renown: 1, tile: 'l', wide: 2,
    desc: 'Racks, a grindstone, and somewhere to hang what you took off people.',
  },
  kennels: {
    name: 'Kennels', cost: 1100, renown: 1, tile: 'N', wide: 2,
    desc: 'Your beasts sleep warm, and sleep well, and it shows in them.',
  },
  minstrelGallery: {
    name: "Minstrel's Gallery", cost: 1800, renown: 4, tile: 'B', wide: 2,
    desc: 'Somewhere for a singer to stand where nobody can reach him.',
  },
  /* Three more, because seven things in a hall this size left it looking like
     a room somebody had moved out of. */
  ravenry: {
    name: 'Ravenry', cost: 1400, renown: 2, tile: 'u',
    desc: 'A post, a cage, and word of the realm arriving before the riders do.',
  },
  bed: {
    name: 'A Bed of Your Own', cost: 700, tile: 'b', rests: true,
    desc: 'Rope, straw and a chest at the foot. You wake here from now on.',
  },
  forge: {
    name: 'Household Forge', cost: 2200, renown: 2, tile: 'a', wide: 2,
    desc: 'Your own anvil, so a nicked blade is a morning rather than a journey.',
  },
};

/* Which pieces go against a wall and which stand in the room. A banner on a
   flagstone in the middle of the floor is not a banner, it is a flag somebody
   dropped. */
export function wantsWall(id) {
  return Boolean(FURNISHINGS[id]?.wall);
}

/** How many tiles across a piece is. */
export function widthOf(id) {
  return FURNISHINGS[id]?.wide ?? 1;
}

export function installed(id) {
  return holdfast().furnishings.includes(id);
}

// ------------------------------------------------------- where it stands ---
//
// Buying a thing used to change nothing you could see. The hall was a sixteen
// by twelve room with a carpet and two people in it, and you could spend nine
// thousand gold on it and walk back in to exactly the same empty floor. A hall
// you cannot look at is a spreadsheet with a door.
//
// So each piece has a tile and a place, and the place is yours to choose.

/** Where each installed piece stands: id -> {x, y}. */
export function placements() {
  const h = holdfast();
  h.placed = h.placed ?? {};
  return h.placed;
}

export function placedAt(id) {
  return placements()[id] ?? null;
}

/** Whichever piece covers this tile, or null. Pieces can be several wide. */
export function pieceOn(x, y) {
  for (const [id, at] of Object.entries(placements())) {
    if (at.y !== y) continue;
    if (x >= at.x && x < at.x + widthOf(id)) return id;
  }
  return null;
}

/** Puts a piece down. The caller decides whether the spot is a legal one. */
export function place(id, x, y) {
  if (!FURNISHINGS[id]) return false;
  placements()[id] = { x, y };
  return true;
}

export function install(id) {
  const def = FURNISHINGS[id];
  const h = holdfast();
  if (!def || h.furnishings.includes(id)) return false;
  if (!canAfford(def.cost)) return false;
  addMoney(-def.cost);
  h.furnishings.push(id);
  h.renown += def.renown ?? 0;
  return true;
}

/** Whether a bed of your own means you wake here. */
export function hasBed() {
  return installed('bed');
}

/* ------------------------------------------------------------ dressing ----
 *
 * The hall's own plan is a bare room. What is in it is whatever you have
 * bought and wherever you have put it, so the grid is rebuilt from the plan
 * every time rather than edited in place - otherwise moving a table leaves the
 * old one behind, which is exactly the bug this shape avoids.
 */

/** The bare room, kept aside the first time so the dressing has a base. */
let barePlan = null;

/**
 * Stamps everything you own onto the hall's grid.
 *
 * @param {{grid: string[], width: number, height: number}} hall the map
 */
export function dressHall(hall) {
  if (!hall) return hall;
  if (!barePlan) barePlan = [...hall.grid];
  const rows = barePlan.map((row) => [...row]);
  for (const id of holdfast().furnishings) {
    const at = placedAt(id);
    const def = FURNISHINGS[id];
    if (!at || !def?.tile) continue;
    for (let i = 0; i < widthOf(id); i++) {
      const x = at.x + i;
      if (at.y < 0 || at.y >= rows.length) continue;
      if (x < 0 || x >= rows[at.y].length) continue;
      rows[at.y][x] = def.tile;
    }
  }
  hall.grid = rows.map((row) => row.join(''));
  return hall;
}

/** The bare room, for a check that wants to know what was there to begin with. */
export function hallPlan() {
  return barePlan ? [...barePlan] : null;
}

/**
 * Whether a piece this wide may stand here: on the hall's own floor, clear of
 * the door and of anything already standing, and against a wall if it wants
 * one. Answers a reason rather than a bare no, because a placing cursor that
 * only says "no" is a cursor you fight.
 *
 * @returns {string|null} why not, or null if it may
 */
export function whyNotHere(hall, id, x, y) {
  const plan = barePlan ?? hall.grid;
  const wide = widthOf(id);
  for (let i = 0; i < wide; i++) {
    const col = x + i;
    if (y < 0 || y >= plan.length || col < 0 || col >= plan[y].length) {
      return 'That is outside the hall.';
    }
    const base = plan[y][col];
    if (base !== '=' && base !== 'c' && base !== '_') return 'There is no floor there.';
    /* The doorway and the tile in front of it stay clear, or you can wall
       yourself into your own hall with a table. */
    for (const w of hall.warps ?? []) {
      if (w.x === col && (w.y === y || w.y === y + 1)) return 'That is the doorway.';
    }
    const other = pieceOn(col, y);
    if (other && other !== id) return `${FURNISHINGS[other].name} is already there.`;
  }
  if (wantsWall(id)) {
    const above = y > 0 ? plan[y - 1][x] : 'I';
    if (above !== 'I' && above !== 'p' && above !== 'A') return 'That wants a wall behind it.';
  }
  /* And it must not cut the room in half. Every door in this world is checked
     walkable and it would be a poor joke if the one room the player builds
     themselves were the one they could seal shut with a table. */
  if (sealsSomethingOff(hall, id, x, y)) return 'That would shut off part of the hall.';
  return null;
}

/**
 * Would standing this piece here leave any of the hall's floor unreachable
 * from the door? A flood fill over a sixteen-by-twelve room, which is nothing.
 */
function sealsSomethingOff(hall, id, x, y) {
  const plan = barePlan ?? hall.grid;
  const w = plan[0].length;
  const hgt = plan.length;
  const solid = [];
  for (let row = 0; row < hgt; row++) {
    solid.push([...plan[row]].map((c) => !(c === '=' || c === 'c' || c === '_' || c === 'D')));
  }
  /* Everything already standing, and then the piece in its proposed spot. */
  for (const [other, at] of Object.entries(placements())) {
    if (other === id) continue;
    if (!FURNISHINGS[other]?.tile) continue;
    for (let i = 0; i < widthOf(other); i++) {
      if (solid[at.y] && at.x + i < w) solid[at.y][at.x + i] = true;
    }
  }
  for (let i = 0; i < widthOf(id); i++) {
    if (solid[y] && x + i < w) solid[y][x + i] = true;
  }

  const door = (hall.warps ?? [])[0];
  const from = door ? [door.x, Math.max(0, door.y - 1)] : null;
  if (!from || solid[from[1]]?.[from[0]]) return false;   // nothing to judge from

  const seen = new Set([`${from[0]},${from[1]}`]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const [cx, cy] = queue[head];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= hgt) continue;
      if (solid[ny][nx]) continue;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  for (let row = 0; row < hgt; row++) {
    for (let col = 0; col < w; col++) {
      if (!solid[row][col] && !seen.has(`${col},${row}`)) return true;
    }
  }
  return false;
}

export function canCook() {
  return installed('hearth');
}

/** How many guests your hall will seat, which caps how big a feast can be. */
export function seats() {
  return 2 + holdfast().furnishings.reduce((n, id) => n + (FURNISHINGS[id].seats ?? 0), 0);
}

// --------------------------------------------------------------- cooking ---

/** What the road gives you, and what it is good for. */
export const INGREDIENTS = {
  venison: { name: 'Venison', from: 'the hunt' },
  fish: { name: 'River Fish', from: 'the water' },
  grain: { name: 'Grain', from: 'a village' },
  honey: { name: 'Honey', from: 'a hive' },
  spice: { name: 'Spice', from: 'across the sea' },
  wine: { name: 'Arbor Wine', from: 'the Reach' },
};

/**
 * Dishes. Eating one heals and steadies you; serving one at a feast is what
 * actually moves people, and the dearer the dish the further it moves them.
 */
export const DISHES = {
  broth: {
    name: 'Barley Broth', needs: { grain: 2 }, heal: 40, worth: 1,
    desc: 'Thin, hot and honest. It has kept more people alive than any maester.',
  },
  bakedFish: {
    name: 'Baked Trout', needs: { fish: 1, grain: 1 }, heal: 70, worth: 2,
    desc: 'Trout, salt, and whatever the fire decides.',
  },
  honeyedVenison: {
    name: 'Honeyed Venison', needs: { venison: 2, honey: 1 }, heal: 130, worth: 4,
    desc: 'The thing you cook when somebody important is coming.',
  },
  lemonCakes: {
    name: 'Lemon Cakes', needs: { grain: 2, honey: 2, spice: 1 }, heal: 60, worth: 5,
    desc: 'Everyone claims not to care about these. Everyone eats four.',
  },
  feastRoast: {
    name: 'Whole Roast Boar', needs: { venison: 3, spice: 1, wine: 1 }, heal: 200, worth: 8,
    desc: 'A boar, an apple, and a hall that smells of it for two days.',
  },
};

export function larder() {
  return holdfast().larder;
}

export function gather(id, count = 1) {
  const h = holdfast();
  h.larder[id] = (h.larder[id] ?? 0) + count;
}

export function ingredientCount(id) {
  return holdfast().larder[id] ?? 0;
}

export function canCookDish(id) {
  const def = DISHES[id];
  if (!def) return false;
  return Object.entries(def.needs).every(([what, n]) => ingredientCount(what) >= n);
}

export function cook(id) {
  const def = DISHES[id];
  if (!canCookDish(id)) return false;
  const h = holdfast();
  for (const [what, n] of Object.entries(def.needs)) h.larder[what] -= n;
  h.dishes[id] = (h.dishes[id] ?? 0) + 1;
  return true;
}

export function dishCount(id) {
  return holdfast().dishes[id] ?? 0;
}

export function takeDish(id) {
  const h = holdfast();
  if (!(h.dishes[id] > 0)) return false;
  h.dishes[id]--;
  return true;
}

// --------------------------------------------------------------- feasting --

/**
 * A feast. You serve what you have cooked to as many houses as your hall will
 * seat; how far it moves each of them depends on what was on the table and how
 * well regarded your hall already is. Rivals seated together do not enjoy it.
 */
export function holdFeast(guestHouses, dishIds) {
  const h = holdfast();
  const worth = dishIds.reduce((n, id) => n + (DISHES[id]?.worth ?? 0), 0);
  if (!worth) return null;

  for (const id of dishIds) takeDish(id);
  h.feasts++;

  const results = [];
  for (const houseId of guestHouses) {
    let gain = Math.round(worth * 2 + h.renown);
    // Sitting somebody down with their enemy sours it.
    const rivalsPresent = (HOUSES[houseId].rivals ?? [])
      .filter((r) => guestHouses.includes(r)).length;
    gain -= rivalsPresent * 8;
    changeStanding(houseId, gain);
    results.push({ house: houseId, gain, rivalsPresent });
  }
  return { worth, results };
}

export function feastCount() {
  return holdfast().feasts;
}
