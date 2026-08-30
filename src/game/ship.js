// Owning a ship, sailing it, and what happens when somebody rams it.
//
// The rule this file exists to enforce: a hull is a real number. It goes down
// when you are hit, it does not come back on its own, and when it reaches
// nothing you lose the ship — not a menu option, the ship. Everything else
// here is arithmetic in service of that.
//
// Nothing in here asks what your house is or how many sigils you hold. A ship
// is bought with gold and sunk with a bronze beak, and neither of those cares
// who your father was.

import { game, formatMoney } from './state.js';
import { SHIPS, FLEETS, SEA_LANES } from '../data/ships.js';

/** The ship you own, or null. */
export function ship() {
  return game.state.ship ?? null;
}

export function ownsShip() {
  return Boolean(ship());
}

/** True while you are standing on your own deck rather than on the ground. */
export function aboard() {
  return Boolean(game.state.ship?.aboard);
}

/**
 * Buys a hull. Returns 'bought', 'already', 'poor' or 'sold' — 'sold' when an
 * older ship went towards it, because a shipwright who will not take your last
 * one in trade is a shipwright nobody buys a second ship from.
 *
 * The trade-in is half the old hull's price and only ever helps: a better ship
 * for the difference is the whole reason to come back to this dock.
 */
export function buyShip(id) {
  const def = SHIPS[id];
  if (!def) throw new Error(`Unknown ship: ${id}`);
  const have = ship();
  if (have?.id === id) return 'already';

  const traded = have ? Math.floor((SHIPS[have.id]?.price ?? 0) / 2) : 0;
  const owed = Math.max(0, def.price - traded);
  if (game.state.player.money < owed) return 'poor';

  game.state.player.money -= owed;
  game.state.ship = {
    id,
    name: have?.name ?? null,           // a ship you have named keeps her name
    hull: def.hull,
    aboard: false,
    /* Where she is tied up. You cannot board a ship in Winterfell because she
       is not in Winterfell — she is wherever you last stepped off her. */
    berth: have?.berth ?? null,
    took: have?.took ?? 0,              // hulls taken, which nobody forgets
  };
  return traded ? 'sold' : 'bought';
}

/** What a shipwright would put towards a new hull for the one you have. */
export function tradeIn() {
  const have = ship();
  return have ? Math.floor((SHIPS[have.id]?.price ?? 0) / 2) : 0;
}

export function shipDef(s = ship()) {
  return s ? SHIPS[s.id] ?? null : null;
}

export function shipName(s = ship()) {
  if (!s) return 'your ship';
  return s.name ?? (SHIPS[s.id]?.name ?? 'your ship');
}

export function nameShip(name) {
  const s = ship();
  if (!s) return false;
  const clean = String(name ?? '').trim().slice(0, 16);
  if (!clean) return false;
  s.name = clean;
  return true;
}

// ------------------------------------------------------------- condition --

export function hullMax() {
  return shipDef()?.hull ?? 0;
}

/** 0 to 1. Below a third she is answering slowly and everyone aboard knows it. */
export function condition() {
  const s = ship();
  if (!s) return 0;
  return hullMax() ? Math.max(0, Math.min(1, s.hull / hullMax())) : 0;
}

export function conditionWord() {
  const c = condition();
  if (c >= 0.99) return 'sound';
  if (c >= 0.7) return 'scraped';
  if (c >= 0.4) return 'holed and bailing';
  if (c > 0) return 'going down by the head';
  return 'lost';
}

/**
 * Takes damage. Returns what is left. A ship at nothing is not sunk here —
 * `sink()` is a separate call, because losing a ship costs the player things
 * this function has no business deciding.
 */
export function damageShip(n) {
  const s = ship();
  if (!s) return 0;
  s.hull = Math.max(0, s.hull - Math.max(0, Math.round(n)));
  return s.hull;
}

export function repairShip(gold) {
  const s = ship();
  if (!s) return 0;
  const missing = hullMax() - s.hull;
  if (missing <= 0) return 0;
  /* Eight gold a point, and you may pay for as much of it as you can afford —
     a shipwright who will only work for the whole sum is a shipwright who
     leaves a holed ship at his own dock. */
  const canPay = Math.floor((gold ?? game.state.player.money) / 8);
  const done = Math.min(missing, canPay);
  if (done <= 0) return 0;
  game.state.player.money -= done * 8;
  s.hull += done;
  return done;
}

export function repairCost() {
  const s = ship();
  if (!s) return 0;
  return Math.max(0, hullMax() - s.hull) * 8;
}

/**
 * She goes down. You keep your life, your party and your name; you lose the
 * ship, and half the coin that was in her hold.
 */
export function sink() {
  const s = ship();
  if (!s) return 0;
  const lost = Math.floor(game.state.player.money * 0.5);
  game.state.player.money -= lost;
  game.state.ship = null;
  return lost;
}

// ---------------------------------------------------------------- sailing --

export function board(mapId, x, y) {
  const s = ship();
  if (!s) return false;
  s.aboard = true;
  s.berth = { map: mapId, x, y };
  return true;
}

export function goAshore(mapId, x, y) {
  const s = ship();
  if (!s) return false;
  s.aboard = false;
  s.berth = { map: mapId, x, y };
  return true;
}

/** Where she is tied up, so a berth can say "she is not here" and mean it. */
export function berth() {
  return ship()?.berth ?? null;
}

export function berthedAt(mapId) {
  const b = berth();
  return Boolean(b && b.map === mapId);
}

// ------------------------------------------------------------- sea fights --

/**
 * What a fight at sea comes down to before anybody draws anything.
 *
 * Ram is what you do going in; crew is what you do once the rails touch. A
 * skiff with six men can beat a galley with seventy exactly never, which is the
 * point of the ladder in data/ships.js — but a holed galley is a galley, and
 * condition is in here so that limping home matters.
 */
export function shipStrength(s = ship()) {
  const def = shipDef(s);
  if (!def || !s) return 0;
  return Math.round((def.ram * 2 + def.crew) * (0.4 + 0.6 * condition()));
}

export function fleetStrength(id) {
  const f = FLEETS[id];
  return f ? f.ram * 2 + f.crew : 0;
}

/** Who might find you on a given water. */
export function lane(mapId) {
  return SEA_LANES[mapId] ?? null;
}

export function rollFleet(mapId, roll = Math.random()) {
  const rows = lane(mapId);
  if (!rows?.length) return null;
  const total = rows.reduce((n, r) => n + r.weight, 0);
  let pick = roll * total;
  for (const r of rows) {
    pick -= r.weight;
    if (pick <= 0) return r.fleet;
  }
  return rows[rows.length - 1].fleet;
}

/**
 * One exchange: you go in bow-first, she does the same, and both hulls take it.
 * Returns what happened so the script can say it rather than compute it.
 */
export function exchange(fleetId, enemyHull) {
  const def = shipDef();
  const f = FLEETS[fleetId];
  if (!def || !f) return null;
  const mine = Math.round(def.ram * (0.5 + 0.5 * condition()) * (0.75 + Math.random() * 0.5));
  const theirs = Math.round(f.ram * (0.75 + Math.random() * 0.5));
  const left = Math.max(0, enemyHull - mine);
  damageShip(theirs);
  return {
    dealt: mine, taken: theirs, enemyHull: left,
    yours: ship()?.hull ?? 0,
    /* She runs when she is hurt enough and not before. Ironborn barely run. */
    fled: left > 0 && left / f.hull < f.flees,
  };
}

/** Taking her. Returns the purse, and remembers the hull for the tally. */
export function taken(fleetId) {
  const f = FLEETS[fleetId];
  if (!f) return 0;
  game.state.player.money += f.bounty;
  const s = ship();
  if (s) s.took = (s.took ?? 0) + 1;
  return f.bounty;
}

export function tally() {
  return ship()?.took ?? 0;
}

/** The line a harbourmaster uses when you walk up with a bill outstanding. */
export function repairLine() {
  const due = repairCost();
  if (due <= 0) return null;
  return `She is ${conditionWord()}. ${formatMoney(due)} puts her right.`;
}
