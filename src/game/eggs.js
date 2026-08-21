// Eggs, and the bond between a rider and what comes out of one.
//
// An egg is not an item you use. It is carried, and it hatches because you
// travelled far enough with it — which is the only thing that ever hatches a
// dragon egg in the stories either. What comes out has no name until you give
// it one, and no interest in carrying you until it trusts you.

import { game } from './state.js';
import { createCreature } from './creature.js';
import { species as getSpecies } from '../data/species.js';

export const MAX_BOND = 100;

/** A dragon will not take a rider until it trusts you this far. */
export const RIDING_BOND = 40;

/** How much a hatchling starts with, having only just met you. */
const STARTING_BOND = 5;

export function eggs() {
  game.state.eggs = game.state.eggs ?? [];
  return game.state.eggs;
}

/**
 * Puts an egg in your care. `steps` is how far you must travel before it
 * hatches; a dragon takes considerably longer than anything else.
 */
export function giveEgg(speciesId, { steps = 500, level = 1, from = null } = {}) {
  eggs().push({
    speciesId,
    steps,
    walked: 0,
    level,
    from,
  });
}

/**
 * Counts a step against every egg you are carrying and returns the ones that
 * are ready. The overworld calls this and hatches whatever comes back.
 */
export function walkEggs(count = 1) {
  const ready = [];
  for (const egg of eggs()) {
    if (egg.walked >= egg.steps) continue;
    egg.walked += count;
    if (egg.walked >= egg.steps) ready.push(egg);
  }
  return ready;
}

/** How close an egg is to hatching, for the party screen. */
export function eggProgress(egg) {
  return Math.max(0, Math.min(1, egg.walked / egg.steps));
}

/** Removes a hatched egg and returns the creature that came out of it. */
export function hatch(egg) {
  const list = eggs();
  const index = list.indexOf(egg);
  if (index >= 0) list.splice(index, 1);

  const creature = createCreature(egg.speciesId, egg.level, {
    originalTrainer: game.state.player.name,
  });
  creature.bond = STARTING_BOND;
  creature.hatched = true;
  return creature;
}

// ------------------------------------------------------------------ bond ---

export function bondOf(creature) {
  return creature?.bond ?? 0;
}

/**
 * Deepens the bond. Fighting beside you and carrying you both count; so does
 * simply keeping it alive, which is why the increments are small.
 */
export function deepenBond(creature, amount) {
  if (!creature) return 0;
  const before = creature.bond ?? 0;
  creature.bond = Math.max(0, Math.min(MAX_BOND, before + amount));
  return creature.bond - before;
}

export const BOND_WORDS = [
  [0, 'Wary of you'],
  [15, 'Watchful'],
  [35, 'Settled'],
  [55, 'Loyal'],
  [80, 'Bonded'],
];

export function bondWord(creature) {
  const value = bondOf(creature);
  let word = BOND_WORDS[0][1];
  for (const [threshold, text] of BOND_WORDS) {
    if (value >= threshold) word = text;
  }
  return word;
}

/**
 * Whether this creature will carry you. Anything you raised from a beast you
 * met on the road only needs to be grown; a dragon needs to trust you as well,
 * and says so by refusing until it does.
 */
export function willCarry(creature) {
  const def = getSpecies(creature.speciesId);
  if (!def.mount) return { ok: false, reason: 'tooYoung' };
  if (def.mount === 'fly' && bondOf(creature) < RIDING_BOND) {
    return { ok: false, reason: 'untrusting' };
  }
  return { ok: true, kind: def.mount };
}
