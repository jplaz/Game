// A live creature: the species template plus level, EXP, IVs, moves, HP and
// status. Stat maths follows the Gen-III shape closely enough that the numbers
// in species.js behave the way anyone familiar with them would expect.

import { species } from '../data/species.js';
import { move } from '../data/moves.js';
import { rng } from '../engine/rng.js';

export const MAX_LEVEL = 100;
export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

const GROWTH = {
  fast: (n) => Math.floor((4 * n ** 3) / 5),
  medium: (n) => n ** 3,
  slow: (n) => Math.floor((5 * n ** 3) / 4),
};

export function expForLevel(growth, level) {
  const curve = GROWTH[growth] ?? GROWTH.medium;
  return curve(Math.max(1, level));
}

export function levelFromExp(growth, exp) {
  let level = 1;
  while (level < MAX_LEVEL && exp >= expForLevel(growth, level + 1)) level++;
  return level;
}

function computeStats(base, ivs, level) {
  const stats = {};
  stats.hp = Math.floor(((2 * base.hp + ivs.hp) * level) / 100) + level + 10;
  for (const key of STAT_KEYS.slice(1)) {
    stats[key] = Math.floor(((2 * base[key] + ivs[key]) * level) / 100) + 5;
  }
  return stats;
}

function rollIvs() {
  const ivs = {};
  for (const key of STAT_KEYS) ivs[key] = rng.int(0, 31);
  return ivs;
}

/** The four most recent level-up moves at or below `level`. */
export function movesAtLevel(speciesId, level) {
  const def = species(speciesId);
  const known = [];
  for (const [lvl, moveId] of def.learnset) {
    if (lvl > level) break;
    if (!known.includes(moveId)) known.push(moveId);
    if (known.length > 4) known.shift();
  }
  return known;
}

export function createCreature(speciesId, level, options = {}) {
  const def = species(speciesId);
  const ivs = options.ivs ?? rollIvs();
  const stats = computeStats(def.base, ivs, level);
  const moveIds = options.moves ?? movesAtLevel(speciesId, level);

  return {
    speciesId,
    nickname: options.nickname ?? null,
    level,
    exp: expForLevel(def.growth, level),
    ivs,
    stats,
    hp: options.hp ?? stats.hp,
    status: options.status ?? null,
    statusCounter: 0,
    moves: moveIds.map((id) => {
      const m = move(id);
      return { id, pp: m.pp, maxPp: m.pp };
    }),
    originalTrainer: options.originalTrainer ?? null,
    // Set when the creature was caught rather than bred/given, purely for flavour.
    caughtAt: options.caughtAt ?? null,
  };
}

export function creatureSpecies(creature) {
  return species(creature.speciesId);
}

export function displayName(creature) {
  return creature.nickname ?? creatureSpecies(creature).name;
}

export function isFainted(creature) {
  return creature.hp <= 0;
}

export function maxHp(creature) {
  return creature.stats.hp;
}

export function hpRatio(creature) {
  return Math.max(0, creature.hp) / maxHp(creature);
}

export function healFully(creature) {
  creature.hp = maxHp(creature);
  creature.status = null;
  creature.statusCounter = 0;
  for (const slot of creature.moves) slot.pp = slot.maxPp;
}

export function healBy(creature, amount) {
  const before = creature.hp;
  creature.hp = Math.min(maxHp(creature), creature.hp + amount);
  return creature.hp - before;
}

/** Recomputes stats after a level change, preserving current HP damage. */
function refreshStats(creature) {
  const def = creatureSpecies(creature);
  const damage = maxHp(creature) - creature.hp;
  creature.stats = computeStats(def.base, creature.ivs, creature.level);
  creature.hp = Math.max(1, maxHp(creature) - damage);
}

/**
 * Adds EXP and reports what happened, so the battle scene can narrate it.
 * Returns { levels: number, learned: string[], evolveTo: string|null }.
 */
export function gainExp(creature, amount) {
  const def = creatureSpecies(creature);
  const result = { gained: amount, levels: 0, learned: [], evolveTo: null };
  if (creature.level >= MAX_LEVEL) return result;

  creature.exp += amount;
  while (creature.level < MAX_LEVEL && creature.exp >= expForLevel(def.growth, creature.level + 1)) {
    creature.level++;
    result.levels++;
    refreshStats(creature);

    for (const [lvl, moveId] of def.learnset) {
      if (lvl === creature.level) result.learned.push(moveId);
    }
    if (def.evolve && creature.level >= def.evolve.level) {
      result.evolveTo = def.evolve.into;
    }
  }
  return result;
}

/** Teaches a move, replacing `slotIndex` if the creature already knows four. */
export function learnMove(creature, moveId, slotIndex = -1) {
  const m = move(moveId);
  const entry = { id: moveId, pp: m.pp, maxPp: m.pp };
  if (creature.moves.length < 4) {
    creature.moves.push(entry);
    return true;
  }
  if (slotIndex >= 0 && slotIndex < 4) {
    creature.moves[slotIndex] = entry;
    return true;
  }
  return false;
}

export function knowsMove(creature, moveId) {
  return creature.moves.some((slot) => slot.id === moveId);
}

/** Applies an evolution in place, keeping level, EXP, moves and nickname. */
export function evolve(creature, intoSpeciesId) {
  creature.speciesId = intoSpeciesId;
  refreshStats(creature);
  return creature;
}

/** Wild creature for an encounter table entry. */
export function wildCreature(speciesId, minLevel, maxLevel) {
  const level = rng.int(minLevel, maxLevel);
  return createCreature(speciesId, level);
}
