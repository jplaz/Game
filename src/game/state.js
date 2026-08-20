// The single mutable game state. Everything the save file needs lives here.

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
    },
    party: [],
    box: [],
    bag: {},          // itemId -> count
    sigils: [],       // earned sigil ids
    flags: {},        // story flags
    dex: { seen: {}, caught: {} },
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
}

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
