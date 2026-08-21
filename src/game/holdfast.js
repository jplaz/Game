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
    name: 'Long Table', cost: 1200, seats: 4,
    desc: 'Oak, badly scarred, long enough for an argument at either end.',
  },
  hearth: {
    name: 'Great Hearth', cost: 900, cooking: true,
    desc: 'You can cook here rather than over a campfire like a poacher.',
  },
  banners: {
    name: 'House Banners', cost: 600, renown: 2,
    desc: 'Your colours on the wall, so nobody has to ask whose hall this is.',
  },
  godswood: {
    name: 'Godswood', cost: 2000, renown: 3, seats: 2,
    desc: 'A heart tree in the yard. Northerners relax; southerners do not.',
  },
  armoury: {
    name: 'Armoury', cost: 1500, renown: 1,
    desc: 'Racks, a grindstone, and somewhere to hang what you took off people.',
  },
  kennels: {
    name: 'Kennels', cost: 1100, renown: 1,
    desc: 'Your beasts sleep warm, and sleep well, and it shows in them.',
  },
  minstrelGallery: {
    name: "Minstrel's Gallery", cost: 1800, renown: 4,
    desc: 'Somewhere for a singer to stand where nobody can reach him.',
  },
};

export function installed(id) {
  return holdfast().furnishings.includes(id);
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
