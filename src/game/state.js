// The single mutable game state. Everything the save file needs lives here.

import {
  HOUSES, HOUSE_IDS, MIN_STANDING, MAX_STANDING, standingBand,
  REGION_HOUSE, PRICE_FACTOR,
} from '../data/houses.js';
import { healFully } from './creature.js';

export const PARTY_LIMIT = 6;

/** The eight house sigils, awarded in story order. */
export const SIGILS = [
  { id: 'wolf', house: 'Stark', town: 'Winterfell', motto: 'Winter is Coming' },
  { id: 'trout', house: 'Tully', town: 'Riverrun', motto: 'Family, Duty, Honour' },
  { id: 'lion', house: 'Lannister', town: 'Lannisport', motto: 'Hear Me Roar' },
  { id: 'stag', house: 'Baratheon', town: "King's Landing", motto: 'Ours is the Fury' },
];

export function newGame(playerName = 'Snow') {
  return {
    version: 1,
    player: {
      name: playerName,
      sprite: 'hero',
      money: 3000,
      playtime: 0,
      steps: 0,
      // You are a fighter too, on your own level track.
      level: 1,
      exp: 0,
      hp: 34,
      wounded: false,
      equipment: { weapon: 'fists', armour: 'roughspun', shield: 'none',
                   helm: 'bareHead', gloves: 'bareHands' },
      gearOwned: { weapon: ['fists'], armour: ['roughspun'], shield: ['none'] },
      duelsWon: 0,
      duelsLost: 0,
    },
    party: [],
    box: [],
    bag: {},          // itemId -> count
    sigils: [],       // earned sigil ids
    flags: {},        // story flags
    dex: { seen: {}, caught: {} },
    // Who you swore to, and what every house makes of you since.
    allegiance: null,
    localHouse: null,
    reputation: {},
    // Decisions worth remembering. Scenes later read these back.
    choices: {},
    // Everyone you killed rather than spared.
    dead: [],
    position: { map: 'heroHouse', x: 4, y: 5, dir: 'down' },
    // Where the player wakes after a whiteout.
    respawn: { map: 'winterfell', x: 15, y: 20, dir: 'down' },
    rival: { name: 'Joffrey', defeats: 0 },
  };
}

export const game = { state: newGame() };

export function setState(next) {
  game.state = next;
}

// ------------------------------------------------------------------ party --

export function party() {
  return game.state.party;
}

export function activeCreature() {
  return game.state.party.find((c) => c.hp > 0) ?? game.state.party[0] ?? null;
}

export function partyIsWiped() {
  return game.state.party.length > 0 && game.state.party.every((c) => c.hp <= 0);
}

/** Adds to the party, or to the box when the party is full. */
export function addCreature(creature) {
  markCaught(creature.speciesId);
  if (game.state.party.length < PARTY_LIMIT) {
    game.state.party.push(creature);
    return 'party';
  }
  game.state.box.push(creature);
  return 'box';
}

export function healParty() {
  for (const creature of game.state.party) healFully(creature);
  // Resting mends the rider as much as the beasts. The player's maximum health
  // depends on gear, so the actual figure is settled by restorePlayer().
  const p = game.state.player;
  p.wounded = false;
  p.hp = null;
  restorePlayer?.();
}

// Set by game/player.js at import time; kept as a hook so state.js does not
// have to import the equipment tables just to know a health maximum.
let restorePlayer = null;
export function setPlayerRestorer(fn) { restorePlayer = fn; }

// -------------------------------------------------------------------- bag --

export function giveItem(id, count = 1) {
  game.state.bag[id] = (game.state.bag[id] ?? 0) + count;
}

export function takeItem(id, count = 1) {
  const have = game.state.bag[id] ?? 0;
  if (have < count) return false;
  if (have === count) delete game.state.bag[id];
  else game.state.bag[id] = have - count;
  return true;
}

export function itemCount(id) {
  return game.state.bag[id] ?? 0;
}

export function hasItem(id) {
  return itemCount(id) > 0;
}

// ------------------------------------------------------------------ money --

export function addMoney(amount) {
  game.state.player.money = Math.max(0, Math.min(999999, game.state.player.money + amount));
}

export function canAfford(amount) {
  return game.state.player.money >= amount;
}

// ------------------------------------------------------------------ flags --

// ------------------------------------------------------------ allegiance ---

/**
 * Swears you to a house. Their rivals mistrust you from the outset and their
 * allies think a little better of you, which is the whole point of choosing.
 */
export function swearTo(houseId) {
  const state = game.state;
  state.allegiance = houseId;
  state.reputation = {};
  for (const id of HOUSE_IDS) state.reputation[id] = 0;

  const def = HOUSES[houseId];
  state.reputation[houseId] = 70;
  for (const ally of def.allies ?? []) state.reputation[ally] = 30;
  for (const rival of def.rivals ?? []) state.reputation[rival] = -40;
}

export function allegiance() {
  return game.state.allegiance;
}

export function standing(houseId) {
  return game.state.reputation?.[houseId] ?? 0;
}

/**
 * Moves a house's opinion of you, and drags their allies and rivals a little
 * way with it — the realm talks. Returns the change actually applied.
 */
export function changeStanding(houseId, delta) {
  const state = game.state;
  if (!HOUSES[houseId] || !delta) return 0;
  state.reputation = state.reputation ?? {};

  const apply = (id, amount) => {
    const before = state.reputation[id] ?? 0;
    state.reputation[id] = Math.max(MIN_STANDING, Math.min(MAX_STANDING, before + amount));
    return state.reputation[id] - before;
  };

  const applied = apply(houseId, delta);
  const echo = Math.trunc(delta / 3);
  if (echo) {
    for (const ally of HOUSES[houseId].allies ?? []) apply(ally, echo);
    for (const rival of HOUSES[houseId].rivals ?? []) apply(rival, -echo);
  }
  return applied;
}

export function standingWord(houseId) {
  return standingBand(standing(houseId));
}

/** Which house holds the ground you are standing on. Set when a map loads. */
export function setLocalRegion(region) {
  game.state.localHouse = REGION_HOUSE[region] ?? null;
}

export function localHouse() {
  return game.state.localHouse ?? null;
}

/**
 * What the local house's opinion of you does to a price. Merchants answer to
 * whoever holds the town, and they price accordingly.
 */
export function priceFactor() {
  const id = localHouse();
  if (!id) return 1;
  return PRICE_FACTOR[standingBand(standing(id))] ?? 1;
}

// ------------------------------------------------------------------ dead ---

/**
 * Everyone you have killed. Death here is final: they are gone from the world,
 * their scenes do not run, and nothing anywhere brings them back.
 */
export function markDead(id) {
  game.state.dead = game.state.dead ?? [];
  if (!game.state.dead.includes(id)) game.state.dead.push(id);
}

export function isDead(id) {
  return (game.state.dead ?? []).includes(id);
}

export function theDead() {
  return game.state.dead ?? [];
}

// --------------------------------------------------------------- choices ---

/** Remembers a decision so a later scene can ask what you did. */
export function recordChoice(id, value = true) {
  game.state.choices = game.state.choices ?? {};
  game.state.choices[id] = value;
}

/** What you decided, or undefined if it never came up. */
export function choice(id) {
  return game.state.choices?.[id];
}

export function setFlag(name, value = true) {
  game.state.flags[name] = value;
}

export function flag(name) {
  return Boolean(game.state.flags[name]);
}

export function awardSigil(id) {
  if (!game.state.sigils.includes(id)) game.state.sigils.push(id);
}

export function hasSigil(id) {
  return game.state.sigils.includes(id);
}

export function sigilCount() {
  return game.state.sigils.length;
}

// -------------------------------------------------------------------- dex --

export function markSeen(speciesId) {
  game.state.dex.seen[speciesId] = true;
}

export function markCaught(speciesId) {
  game.state.dex.seen[speciesId] = true;
  game.state.dex.caught[speciesId] = true;
}

export function dexCounts() {
  return {
    seen: Object.keys(game.state.dex.seen).length,
    caught: Object.keys(game.state.dex.caught).length,
  };
}

// ----------------------------------------------------------------- levels --

/**
 * Obedience cap: creatures traded or caught above your standing will not always
 * listen. Sigils raise the ceiling, which paces the difficulty curve.
 */
export function obedienceCap() {
  return [20, 35, 50, 70, 100][sigilCount()] ?? 100;
}

export function formatMoney(amount) {
  return `${amount}g`;
}

export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
