// A dragon that has come down and stayed.
//
// The browser build has had dragons crossing the sky since they were drawn,
// and one in six of them stoops on you as you walk — but that is weather that
// occasionally bites. The cartridge has the other half: once three of the nine
// seats have been broken, a realm at war is a realm not watching its skies,
// and one of them settles over a southern town and starts on the livestock.
//
// That is an errand with a clock on it. You have a couple of dozen fights to
// get there and drive it off. Go, and the granary men pay you and the house
// that holds the ground remembers who came; do not, and the town burns and
// they remember that instead. It is the only thing in this world that costs
// you something for being somewhere else.

import { game, sigilCount, addMoney, changeStanding } from './state.js';
import { MAPS, REGIONS } from '../data/maps.js';
import { REGION_HOUSE } from '../data/houses.js';
import { COLD_OF } from '../data/winter.js';
import { tileDef } from '../art/tiles.js';
import { reigning, changeStability } from './realm.js';

/** They wake once the realm has started tearing itself apart. */
export function dragonsLoose() {
  return sigilCount() >= 3;
}

/* News about a dragon, held like a raven until the screen is clear. */
let news = null;

/** The line a dragon is owed, taken once. */
export function takeDragonNews() {
  const said = news;
  news = null;
  return said;
}

/** Forgets any news in flight — a new game or a load starts quiet. */
export function clearDragonNews() {
  news = null;
}

/**
 * Where the next one settles: a southern town somebody holds and somebody
 * lives in. Cold one and two is everything from the Neck down; nought is
 * indoors and Essos, and dragons do not cross the Narrow Sea any more than the
 * cold does.
 */
export function swoopTowns() {
  return Object.keys(MAPS).filter((id) => {
    const map = MAPS[id];
    if (map.indoor) return false;
    const cold = COLD_OF[REGIONS[id] ?? ''] ?? 2;
    if (cold < 1 || cold > 2) return false;
    if (!REGION_HOUSE[REGIONS[id] ?? '']) return false;
    if (!(map.npcs?.length ?? 0)) return false;
    /* And somewhere on it you can actually be jumped. An errand you cannot
       reach is not an errand, it is a town that burns on a timer: half the
       places that pass every other test here are paved end to end, and a
       dragon on the granary roof of one of those could never be fought at
       all. */
    return (map.grid ?? []).some((row) => [...row].some((c) => tileDef(c).kind === 'encounter'));
  });
}

/** Which town one is sitting on, or null. */
export function settledOn() {
  return game.state.player.swoopMap ?? null;
}

/** Whose ground a town is. */
function holderOf(mapId) {
  return REGION_HOUSE[REGIONS[mapId] ?? ''] ?? null;
}

/**
 * One tick per fight won. Arms the first swoop, lands it, and burns the town
 * if it has been left too long.
 *
 * @param {() => number} roll a 0..1 source, so a test can steer it
 */
export function dragonAfterWin(roll = Math.random) {
  const p = game.state.player;
  if (!dragonsLoose()) return;

  if (p.swoopMap) {
    /* Settled, and eating. */
    if (p.swoopAt > 0) p.swoopAt--;
    if (p.swoopAt > 0) return;
    const town = MAPS[p.swoopMap]?.name ?? 'the town';
    const holder = holderOf(p.swoopMap);
    p.swoopsBurned = (p.swoopsBurned ?? 0) + 1;
    if (holder) changeStanding(holder, -6);
    if (reigning()) changeStability(-6);
    news = `The fire over ${town} has gone out, and so has the town. Nobody `
      + 'came. The house that held it will remember that longer than the '
      + 'dragon will.';
    p.swoopMap = null;
    p.swoopAt = 46 + Math.floor(roll() * 30);
    return;
  }

  if (!p.swoopAt) { p.swoopAt = 26 + Math.floor(roll() * 20); return; }
  p.swoopAt--;
  if (p.swoopAt > 0) return;

  const towns = swoopTowns();
  if (!towns.length) { p.swoopAt = 40; return; }
  const at = towns[Math.floor(roll() * towns.length) % towns.length];
  p.swoopMap = at;
  p.swoopAt = 22 + Math.floor(roll() * 12);      // fights before it burns
  news = `A dragon has come down over ${MAPS[at].name ?? at}. It is not `
    + 'passing through: it has settled on the granary roof and started on the '
    + 'livestock. Every fight you spend elsewhere, it eats deeper. Go and '
    + 'drive it off, or do not.';
}

/**
 * The dragon put down, on the town it had settled over. Returns the line to
 * say, or null when this was not that fight.
 *
 * @param {string} mapId  where the fight was
 * @param {string} species what you beat
 */
export function dragonBeaten(mapId, species, roll = Math.random) {
  const p = game.state.player;
  if (!p.swoopMap || p.swoopMap !== mapId) return null;
  if (species !== 'dreadwyrm' && species !== 'scaleflight') return null;

  const town = MAPS[mapId]?.name ?? 'the town';
  const holder = holderOf(mapId);
  const purse = 260 + p.level * 6;
  p.swoopsBeaten = (p.swoopsBeaten ?? 0) + 1;
  addMoney(purse);
  if (holder) changeStanding(holder, 10);
  if (reigning()) changeStability(4);
  p.swoopMap = null;
  p.swoopAt = 46 + Math.floor(roll() * 30);
  return `It labours up off ${town} trailing smoke and does not circle back. `
    + 'The bells start up behind you — the other kind of bells, this time. The '
    + `purse is ${purse} gold from the granary men, and the house that holds `
    + 'this ground saw who came.';
}
