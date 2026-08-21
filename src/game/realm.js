// Ruling.
//
// Winning the throne is where most of this kind of game stops. Holding it is a
// different problem, and the whole point of the postgame: the houses you walked
// over on the way up are still there, they still remember, and now they have a
// reason to move.
//
// A reign runs in turns. Each turn you hold court — you get petitions, you
// decide them, and every decision moves gold, stability, or somebody's opinion
// of you. Let stability fall far enough and a house rises against you.

import { game, standing, changeStanding } from './state.js';
import { HOUSES, HOUSE_IDS, standingBand } from '../data/houses.js';

export const MAX_STABILITY = 100;

/** Below this, the realm starts producing rebels rather than petitioners. */
export const UNREST = 35;

export function realm() {
  game.state.realm = game.state.realm ?? {
    reigning: false,
    turn: 0,
    stability: 60,
    treasury: 5000,
    rebellions: [],      // house ids currently in open revolt
    putDown: [],         // house ids whose risings you have broken
    council: [],         // house ids given a seat
    log: [],             // the last few things that happened, for the court page
  };
  return game.state.realm;
}

export function beginReign() {
  const r = realm();
  r.reigning = true;
  r.turn = 1;
  // You inherit the realm you made. A claimant who wronged half of Westeros
  // takes the chair with the country already half against them.
  const opinions = HOUSE_IDS.map((id) => standing(id));
  const average = opinions.reduce((a, b) => a + b, 0) / opinions.length;
  r.stability = Math.max(10, Math.min(MAX_STABILITY, Math.round(55 + average * 0.4)));
  r.treasury = 5000;
  return r;
}

export function reigning() {
  return realm().reigning;
}

export function stability() {
  return realm().stability;
}

export function treasury() {
  return realm().treasury;
}

export function changeStability(delta) {
  const r = realm();
  const before = r.stability;
  r.stability = Math.max(0, Math.min(MAX_STABILITY, before + delta));
  return r.stability - before;
}

export function spend(amount) {
  const r = realm();
  if (r.treasury < amount) return false;
  r.treasury -= amount;
  return true;
}

export function collect(amount) {
  realm().treasury += amount;
}

/** A short note for the court page, newest first. */
export function record(text) {
  const r = realm();
  r.log.unshift(text);
  r.log = r.log.slice(0, 5);
}

// -------------------------------------------------------------- council ---

export const COUNCIL_SEATS = 3;

export function council() {
  return realm().council;
}

export function seated(houseId) {
  return council().includes(houseId);
}

/**
 * Giving a house a seat. It buys their goodwill and steadies the realm, and it
 * costs you with everyone who hates them — which, if you have been thorough, is
 * most of the map.
 */
export function seat(houseId) {
  const r = realm();
  if (r.council.includes(houseId)) return false;
  if (r.council.length >= COUNCIL_SEATS) return false;
  r.council.push(houseId);
  changeStanding(houseId, 25);
  changeStability(6);
  for (const rival of HOUSES[houseId].rivals ?? []) changeStanding(rival, -8);
  return true;
}

export function unseat(houseId) {
  const r = realm();
  const index = r.council.indexOf(houseId);
  if (index < 0) return false;
  r.council.splice(index, 1);
  changeStanding(houseId, -20);
  changeStability(-4);
  return true;
}

/** Every seat held steadies the realm a little each turn. */
export function councilSupport() {
  return council().length * 2;
}

// ------------------------------------------------------------ rebellion ---

export function rebellions() {
  return realm().rebellions;
}

export function inRevolt(houseId) {
  return rebellions().includes(houseId);
}

/**
 * Who rises, given how the realm stands. A house that hates you and holds no
 * seat is a candidate; the worse the realm is doing, the likelier they are to
 * take the chance. Returns the house that rose, or null.
 */
export function checkRising(roll) {
  const r = realm();
  if (r.stability >= UNREST) return null;

  const candidates = HOUSE_IDS.filter((id) => (
    standing(id) <= -40 && !seated(id) && !inRevolt(id)
  ));
  if (!candidates.length) return null;

  // The further below the line the realm is, the likelier it happens at all.
  const chance = Math.min(0.85, (UNREST - r.stability) / 40);
  if (roll() > chance) return null;

  // Whoever hates you most goes first.
  candidates.sort((a, b) => standing(a) - standing(b));
  const rising = candidates[0];
  r.rebellions.push(rising);
  changeStability(-10);
  return rising;
}

/** A rising you have beaten. They stay broken and the realm settles. */
export function crushRising(houseId) {
  const r = realm();
  const index = r.rebellions.indexOf(houseId);
  if (index < 0) return false;
  r.rebellions.splice(index, 1);
  if (!r.putDown.includes(houseId)) r.putDown.push(houseId);
  changeStability(14);
  changeStanding(houseId, -20);
  // The rest of the realm takes note of what happens to rebels.
  for (const id of HOUSE_IDS) {
    if (id !== houseId && standing(id) < 0) changeStanding(id, 4);
  }
  return true;
}

/** Buying one off. Cheaper in blood, dearer in gold and in what people think. */
export function buyOffRising(houseId, cost) {
  const r = realm();
  if (!inRevolt(houseId)) return false;
  if (!spend(cost)) return false;
  r.rebellions.splice(r.rebellions.indexOf(houseId), 1);
  changeStanding(houseId, 20);
  changeStability(4);
  // Everyone else now knows the price of raising banners against you.
  for (const id of HOUSE_IDS) {
    if (id !== houseId) changeStability(-1);
  }
  return true;
}

// ------------------------------------------------------------ each turn ---

/**
 * A turn of the reign: taxes come in, the council earns its keep, open revolts
 * bleed you, and the realm drifts toward whatever the country actually thinks
 * of you. Returns a summary the court scene reads out.
 */
export function advanceTurn() {
  const r = realm();
  r.turn++;

  const taxes = Math.round(300 + r.stability * 12);
  collect(taxes);

  const revoltCost = r.rebellions.length * 8;
  const drift = Math.round(HOUSE_IDS.reduce((sum, id) => sum + standing(id), 0)
    / HOUSE_IDS.length / 20);

  const change = changeStability(councilSupport() + drift - revoltCost);

  return { taxes, revoltCost, drift, change, stability: r.stability, treasury: r.treasury };
}

/** A word for the state of the realm, for the court page. */
export function realmWord() {
  const value = stability();
  if (value >= 80) return 'At peace';
  if (value >= 60) return 'Settled';
  if (value >= UNREST) return 'Uneasy';
  if (value >= 15) return 'Fraying';
  return 'In open revolt';
}

/** How the houses stand, summarised for the court page. */
export function courtSummary() {
  return HOUSE_IDS.map((id) => ({
    id,
    name: HOUSES[id].name,
    standing: standing(id),
    band: standingBand(standing(id)),
    seated: seated(id),
    revolt: inRevolt(id),
  }));
}
