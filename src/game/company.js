// Who is riding with you, and who used to be.
//
// One companion at a time. They are stored on the save with their current
// health, because a companion who was hurt in the last fight is still hurt in
// this one — and if they run out, they are moved to the fallen list and never
// come back.

import { game, standing } from './state.js';
import { COMPANIONS } from '../data/companions.js';

export function companionState() {
  game.state.company = game.state.company ?? { active: null, fallen: [] };
  game.state.company.fallen = game.state.company.fallen ?? [];
  return game.state.company;
}

/** The companion currently travelling with you, or null. */
export function activeCompanion() {
  const active = companionState().active;
  if (!active) return null;
  return active;
}

export function hasFallen(id) {
  return companionState().fallen.includes(id);
}

/**
 * Whether someone will ride with you. The dead never will again, and most of
 * them want their house to think well of you first.
 */
export function willJoin(id) {
  const def = COMPANIONS[id];
  if (!def) return { ok: false, reason: 'unknown' };
  if (hasFallen(id)) return { ok: false, reason: 'dead' };
  const active = activeCompanion();
  if (active && active.id === id) return { ok: false, reason: 'already' };
  if (active) return { ok: false, reason: 'occupied', current: active.name };
  if (def.requires && standing(def.requires.house) < def.requires.standing) {
    return { ok: false, reason: 'standing' };
  }
  return { ok: true };
}

export function recruit(id) {
  const def = COMPANIONS[id];
  companionState().active = {
    id,
    name: def.name,
    sprite: def.sprite,
    house: def.house,
    level: def.level,
    hp: def.vigour,
    maxHp: def.vigour,
    might: def.might,
    guard: def.guard,
    aid: def.aid,
    // How many times they have stepped in for you, purely so the game can say
    // something true about them when they die.
    saves: 0,
  };
  return companionState().active;
}

/** They ride on without you. Not death — just a parting. */
export function dismiss() {
  const active = activeCompanion();
  companionState().active = null;
  return active;
}

/** They are gone. This is not reversible and nothing in the game undoes it. */
export function kill() {
  const state = companionState();
  const active = state.active;
  if (!active) return null;
  if (!state.fallen.includes(active.id)) state.fallen.push(active.id);
  state.active = null;
  return active;
}

/** Between fights they recover somewhat, but never for free and never fully. */
export function restCompanion() {
  const active = activeCompanion();
  if (!active) return;
  active.hp = active.maxHp;
}

export function hurtCompanion(amount) {
  const active = activeCompanion();
  if (!active) return 0;
  const before = active.hp;
  active.hp = Math.max(0, active.hp - amount);
  return before - active.hp;
}

export function companionDown() {
  const active = activeCompanion();
  return Boolean(active) && active.hp <= 0;
}
