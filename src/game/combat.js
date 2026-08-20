// Battle mathematics, with no rendering in sight. The battle scene drives this
// and narrates whatever it returns.

import { move as getMove } from '../data/moves.js';
import { typeEffectiveness, stab } from '../data/types.js';
import { creatureSpecies, maxHp, displayName } from './creature.js';
import { rng } from '../engine/rng.js';

export const STATUSES = {
  burn:     { name: 'BRN', color: '#e07040', short: 'burned' },
  freeze:   { name: 'FRZ', color: '#7fd0ea', short: 'frozen solid' },
  paralyze: { name: 'PAR', color: '#e8cc4a', short: 'paralysed' },
  poison:   { name: 'PSN', color: '#b060c0', short: 'poisoned' },
  sleep:    { name: 'SLP', color: '#9aa0b8', short: 'asleep' },
};

const STAT_NAMES = { atk: 'ATTACK', def: 'DEFENCE', spa: 'SP.ATK', spd: 'SP.DEF', spe: 'SPEED' };

/** Per-battle mutable wrapper around a creature. */
export function makeCombatant(creature, side) {
  return {
    creature,
    side,
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    flinched: false,
    // Creatures that took part earn a share of the EXP.
    participated: side === 'player',
  };
}

function stageMultiplier(stage) {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

export function effectiveStat(combatant, key) {
  const base = combatant.creature.stats[key];
  let value = base * stageMultiplier(combatant.stages[key]);
  if (key === 'atk' && combatant.creature.status === 'burn') value *= 0.5;
  if (key === 'spe' && combatant.creature.status === 'paralyze') value *= 0.5;
  return Math.max(1, Math.floor(value));
}

export function changeStage(combatant, key, delta) {
  const before = combatant.stages[key];
  const after = Math.max(-6, Math.min(6, before + delta));
  combatant.stages[key] = after;
  if (after === before) {
    return { changed: false, text: `${displayName(combatant.creature)}'s ${STAT_NAMES[key]} won't go ${delta > 0 ? 'higher' : 'lower'}!` };
  }
  const word = delta > 0
    ? (delta >= 2 ? 'sharply rose' : 'rose')
    : (delta <= -2 ? 'sharply fell' : 'fell');
  return { changed: true, text: `${displayName(combatant.creature)}'s ${STAT_NAMES[key]} ${word}!` };
}

/** Damage roll. Returns { damage, effectiveness, critical }. */
export function calcDamage(attacker, defender, moveDef) {
  const attackerSpecies = creatureSpecies(attacker.creature);
  const defenderSpecies = creatureSpecies(defender.creature);
  const level = attacker.creature.level;

  const physical = moveDef.category === 'physical';
  const attackStat = effectiveStat(attacker, physical ? 'atk' : 'spa');
  const defenceStat = effectiveStat(defender, physical ? 'def' : 'spd');

  const critChance = moveDef.highCrit ? 0.125 : 0.0625;
  const critical = rng.chance(critChance);

  let damage = Math.floor(
    Math.floor(Math.floor((2 * level) / 5 + 2) * moveDef.power * attackStat / defenceStat) / 50,
  ) + 2;

  if (critical) damage *= 2;
  damage = Math.floor(damage * stab(moveDef.type, attackerSpecies.types));

  const effectiveness = typeEffectiveness(moveDef.type, defenderSpecies.types);
  damage = Math.floor(damage * effectiveness);
  damage = Math.floor(damage * (rng.int(85, 100) / 100));

  return { damage: Math.max(effectiveness === 0 ? 0 : 1, damage), effectiveness, critical };
}

export function accuracyCheck(moveDef) {
  if (moveDef.accuracy >= 100) return true;
  return rng.int(1, 100) <= moveDef.accuracy;
}

export function effectivenessText(multiplier) {
  if (multiplier === 0) return 'It had no effect at all.';
  if (multiplier >= 2) return "It's brutally effective!";
  if (multiplier > 1) return "It's very effective!";
  if (multiplier < 1) return "It's barely effective.";
  return null;
}

/** Applies a status if the target can take it. Returns a message or null. */
export function applyStatus(target, status) {
  const creature = target.creature;
  if (creature.status) return null;
  const types = creatureSpecies(creature).types;

  // Type immunities that would otherwise feel unfair.
  if (status === 'burn' && types.includes('flame')) return null;
  if (status === 'freeze' && types.includes('frost')) return null;
  if (status === 'poison' && types.includes('venom')) return null;
  if (status === 'paralyze' && types.includes('storm')) return null;

  creature.status = status;
  creature.statusCounter = status === 'sleep' ? rng.int(1, 3) : 0;
  return `${displayName(creature)} is ${STATUSES[status].short}!`;
}

/**
 * Checks whether a status stops the combatant acting this turn.
 * Returns { canAct, text, cured }.
 */
export function statusBeforeMove(combatant) {
  const creature = combatant.creature;
  if (combatant.flinched) {
    combatant.flinched = false;
    return { canAct: false, text: `${displayName(creature)} flinched!` };
  }
  switch (creature.status) {
    case 'sleep':
      if (creature.statusCounter <= 0) {
        creature.status = null;
        return { canAct: true, text: `${displayName(creature)} woke up!` };
      }
      creature.statusCounter--;
      return { canAct: false, text: `${displayName(creature)} is fast asleep.` };
    case 'freeze':
      if (rng.chance(0.2)) {
        creature.status = null;
        return { canAct: true, text: `${displayName(creature)} thawed out!` };
      }
      return { canAct: false, text: `${displayName(creature)} is frozen solid!` };
    case 'paralyze':
      if (rng.chance(0.25)) {
        return { canAct: false, text: `${displayName(creature)} is paralysed and can't move!` };
      }
      return { canAct: true, text: null };
    default:
      return { canAct: true, text: null };
  }
}

/** Burn and poison chip damage. Returns { damage, text } or null. */
export function statusAfterTurn(combatant) {
  const creature = combatant.creature;
  if (creature.hp <= 0) return null;
  if (creature.status === 'burn' || creature.status === 'poison') {
    const damage = Math.max(1, Math.floor(maxHp(creature) / 8));
    creature.hp = Math.max(0, creature.hp - damage);
    const verb = creature.status === 'burn' ? 'burn' : 'venom';
    return { damage, text: `${displayName(creature)} is hurt by its ${verb}!` };
  }
  return null;
}

export function moveOrder(a, b, moveA, moveB) {
  const priorityA = moveA?.priority ?? 0;
  const priorityB = moveB?.priority ?? 0;
  if (priorityA !== priorityB) return priorityA > priorityB ? [a, b] : [b, a];
  const speedA = effectiveStat(a, 'spe');
  const speedB = effectiveStat(b, 'spe');
  if (speedA !== speedB) return speedA > speedB ? [a, b] : [b, a];
  return rng.chance(0.5) ? [a, b] : [b, a];
}

/** EXP awarded for defeating `foe`, split between participants. */
export function expFor(foe, participantCount, isTrainerBattle) {
  const yieldValue = creatureSpecies(foe.creature).expYield;
  const base = Math.floor((yieldValue * foe.creature.level) / 7);
  const scaled = Math.floor(base * (isTrainerBattle ? 1.5 : 1));
  return Math.max(1, Math.floor(scaled / Math.max(1, participantCount)));
}

/**
 * Gen-III style capture check. Returns the number of shakes (0-3) and whether
 * the creature was caught, so the scene can animate the banner properly.
 */
export function attemptCatch(target, ballBonus) {
  const creature = target.creature;
  const rate = creatureSpecies(creature).catchRate;
  const statusBonus = creature.status === 'sleep' || creature.status === 'freeze'
    ? 2
    : creature.status
      ? 1.5
      : 1;

  const max = maxHp(creature);
  const a = ((3 * max - 2 * creature.hp) * rate * ballBonus) / (3 * max) * statusBonus;
  if (a >= 255) return { caught: true, shakes: 3 };

  const b = 1048560 / Math.sqrt(Math.sqrt(16711680 / a));
  let shakes = 0;
  for (let i = 0; i < 4; i++) {
    if (rng.int(0, 65535) >= b) return { caught: false, shakes };
    shakes++;
  }
  return { caught: true, shakes: 3 };
}

/**
 * Opponent move choice. It is not merely random: it strongly prefers moves that
 * are super effective and avoids ones that do nothing, which makes gym leaders
 * feel like they are actually paying attention.
 */
export function chooseFoeMove(foe, target) {
  const usable = foe.creature.moves.filter((slot) => slot.pp > 0);
  if (!usable.length) return null;

  const targetTypes = creatureSpecies(target.creature).types;
  const scored = usable.map((slot) => {
    const def = getMove(slot.id);
    let score = 10;
    if (def.category === 'status') {
      // Status moves early, but never when they would be wasted.
      score = target.creature.status && def.effect?.status ? 1 : 14;
      if (def.effect?.heal && foe.creature.hp > maxHp(foe.creature) * 0.6) score = 2;
    } else {
      const multiplier = typeEffectiveness(def.type, targetTypes);
      score = def.power * multiplier * stab(def.type, creatureSpecies(foe.creature).types) / 10;
      if (multiplier === 0) score = 0.1;
    }
    return { slot, weight: Math.max(0.1, score) };
  });

  return rng.weighted(scored).slot;
}

export function moveDefinition(id) {
  return getMove(id);
}
