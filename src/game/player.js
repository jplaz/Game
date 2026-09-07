// The player as a fighter in their own right: levels, stats, wounds and gear.
//
// Creatures still level on their own curve; this is the separate track that
// makes *you* stronger. Duels award it, and creature battles pay a smaller
// share, so neither style of play locks you out of the other.

import { game, setPlayerRestorer } from './state.js';
import { gear, technique, GEAR_SLOTS } from '../data/gear.js';
import { ACTOR_PALETTES } from '../art/actors.js';

export const MAX_PLAYER_LEVEL = 50;

/** Levels get steadily dearer: 60, 180, 360, 600 ... */
export function expForPlayerLevel(level) {
  if (level <= 1) return 0;
  return 30 * (level - 1) * level;
}

export function expToNextLevel() {
  const p = game.state.player;
  if (p.level >= MAX_PLAYER_LEVEL) return 0;
  return Math.max(0, expForPlayerLevel(p.level + 1) - p.exp);
}

/** Base stats before equipment, derived from level and a fixed growth. */
export function baseStats(level) {
  return {
    vigour: 28 + level * 6,     // health pool
    might: 10 + level * 3,      // damage dealt
    guard: 6 + level * 2,       // damage resisted
    swiftness: 10 + level * 2,  // who strikes first
    wind: 12 + Math.floor(level * 1.5), // stamina pool
  };
}

export function equipped(slot) {
  const id = game.state.player.equipment?.[slot];
  const fallback = { weapon: 'fists', armour: 'roughspun', shield: 'none',
                     helm: 'bareHead', gloves: 'bareHands' }[slot];
  try {
    return gear(slot, id ?? fallback);
  } catch {
    return gear(slot, fallback);
  }
}

// --------------------------------------------------------------- the wear --
//
// Steel against steel. Your own blow takes an edge off whatever you swung it
// with, and whatever lands on you takes a piece out of what you were wearing
// when it did.
//
// Nothing in this build ever wore out. The cartridge has had this since the
// gear ladder was written, which is what a forge in every town is *for*: a
// blade that never dulls turns seventeen smiths into seventeen shops. Here a
// sword bought at Winterfell was the same sword at the Iron Throne, in the
// same condition, having been through nine hundred fights.

/**
 * Whether a piece is beyond wearing out.
 *
 * Your bare hands, and the nine things in the tables that carry no price:
 * Valyrian steel, dragonglass, dragonscale, the Kingsguard's plate. None of
 * them is sold anywhere, so none of them could ever be replaced — and a rule
 * that quietly destroys the best sword in the game with no way to get another
 * is not a rule, it is a punishment for having won something. It also happens
 * to be true of the material: Valyrian steel does not dull.
 */
export function neverWears(slot, id) {
  try {
    return !(gear(slot, id).price > 0);
  } catch {
    return true;
  }
}

/** How many blows a piece has in it. Dearer things last longer, up to a point. */
export function gearLife(slot, id) {
  const def = gear(slot, id);
  return Math.min(140, 30 + Math.floor((def.price ?? 0) / 40));
}

/** The wear record, made on demand so an older save grows one. */
export function wearOf() {
  const p = game.state.player;
  p.wear = p.wear ?? {};
  return p.wear;
}

/** How much life is left in what is in that slot. */
export function lifeLeft(slot) {
  const w = wearOf();
  if (w[slot] === undefined) w[slot] = gearLife(slot, equipped(slot).id);
  return w[slot];
}

/**
 * A word for the state of a thing, for the gear page. The same four the
 * cartridge uses, on the same thresholds.
 */
export function conditionWord(slot) {
  const id = equipped(slot).id;
  if (neverWears(slot, id)) return 'sound';
  const full = gearLife(slot, id);
  if (full < 1) return 'sound';
  const left = lifeLeft(slot);
  if (left * 4 >= full * 3) return 'sound';
  if (left * 2 >= full) return 'worn';
  if (left * 4 >= full) return 'notched';
  return 'about to go';
}

/** The best thing you own for that slot that is not the one that just broke. */
function spareFor(slot, notThis) {
  const owned = [...new Set(game.state.player.gearOwned?.[slot] ?? [])]
    .filter((id) => id !== notThis);
  let best = null;
  for (const id of owned) {
    try {
      const def = gear(slot, id);
      const worth = (def.might ?? 0) + (def.guard ?? 0);
      if (!best || worth > best.worth) best = { id, worth };
    } catch { /* a piece the tables no longer know about */ }
  }
  return best?.id ?? null;
}

/**
 * Takes some life out of what is in that slot.
 *
 * @returns {{broke: string|null, drew: string|null}} what went, and what you
 *   reached for. A broken thing comes off and does not go back in the pack —
 *   a snapped sword is not a sword you can put on again — and the best spare
 *   you own is drawn on the spot. Nobody draws a spare by opening a bag in the
 *   middle of a fight; they draw it because the first one broke.
 */
export function wearOn(slot, by = 1) {
  const p = game.state.player;
  const id = equipped(slot).id;
  if (neverWears(slot, id) || by <= 0) return { slot, broke: null, drew: null };

  const w = wearOf();
  const left = lifeLeft(slot);
  if (left > by) { w[slot] = left - by; return { slot, broke: null, drew: null }; }

  w[slot] = 0;
  const owned = p.gearOwned?.[slot];
  if (owned) {
    const at = owned.indexOf(id);
    if (at >= 0) owned.splice(at, 1);
  }
  const spare = spareFor(slot, id);
  const fallback = { weapon: 'fists', armour: 'roughspun', shield: 'none',
                     helm: 'bareHead', gloves: 'bareHands' }[slot];
  p.equipment[slot] = spare ?? fallback;
  w[slot] = gearLife(slot, p.equipment[slot]);
  reconcileHp();
  return { slot, broke: id, drew: spare };
}

/** What a smith wants to put everything you are wearing right. */
export function mendCost() {
  let sum = 0;
  for (const slot of GEAR_SLOTS) {
    const id = equipped(slot).id;
    if (neverWears(slot, id)) continue;
    const full = gearLife(slot, id);
    const left = lifeLeft(slot);
    if (left >= full) continue;
    sum += Math.floor((full - left) * (gear(slot, id).price ?? 0) / (full * 3)) + 4;
  }
  return sum;
}

/** Everything you are wearing, put right. */
export function mendAll() {
  const w = wearOf();
  for (const slot of GEAR_SLOTS) w[slot] = gearLife(slot, equipped(slot).id);
}

/** Whether anything you have on wants a smith. */
export function wantsMending() {
  return GEAR_SLOTS.some((slot) => !neverWears(slot, equipped(slot).id)
    && lifeLeft(slot) < gearLife(slot, equipped(slot).id));
}

/** Stats after gear. This is what the duel actually reads. */
export function playerStats() {
  const p = game.state.player;
  const base = baseStats(p.level);
  /* Five slots now, not three. A helm and a pair of gauntlets are the two
     pieces of kit a man of this age would never have gone without and the game
     had no room for; they add guard the way a coat does, and past the kettle
     hat they start costing you the ability to see what is coming. */
  const worn = GEAR_SLOTS.map((slot) => equipped(slot));
  const sum = (key) => worn.reduce((n, g) => n + (g[key] ?? 0), 0);

  return {
    vigour: base.vigour,
    might: base.might + sum('might'),
    guard: base.guard + sum('guard'),
    swiftness: Math.max(1, base.swiftness + sum('swiftness')),
    wind: base.wind,
  };
}

export function maxVigour() {
  return playerStats().vigour;
}

/** Techniques currently available: the weapon's, plus what anyone can do. */
export function playerTechniques() {
  const weapon = equipped('weapon');
  const shield = equipped('shield');
  const ids = [...weapon.techniques];
  if (shield.id !== 'none') ids.push('shieldBash');
  // Guard always keeps the last slot. It is the only way to catch a breath, so
  // a weapon with a full set of techniques must not crowd it out.
  return [...ids.slice(0, 3), 'guard'].map((id) => technique(id));
}

export function healPlayer() {
  game.state.player.hp = maxVigour();
  game.state.player.wounded = false;
}

export function playerHpRatio() {
  const max = maxVigour();
  return Math.max(0, Math.min(1, (game.state.player.hp ?? max) / max));
}

/** Clamps stored HP to the current maximum — called after levelling or equipping. */
export function reconcileHp() {
  const p = game.state.player;
  const max = maxVigour();
  if (p.hp === undefined || p.hp === null) p.hp = max;
  p.hp = Math.max(0, Math.min(max, p.hp));
}

/**
 * Adds player experience. Returns { levels, gained } so the scene can narrate
 * it, and tops up health by the amount the level-up added.
 */
export function gainPlayerExp(amount) {
  const p = game.state.player;
  const result = { gained: amount, levels: 0, paid: 0 };
  /* Fifty is as high as anybody goes, and a run reaches fifty with a hundred
     maps still unwalked - so from there on every fight paid nothing at all and
     the back half of the game stopped rewarding anything you did. What you
     learn past that point is worth money to somebody instead, which is what
     the halls, the oaths, the feasts and the campaigns all want. */
  if (p.level >= MAX_PLAYER_LEVEL) {
    result.paid = Math.floor(amount / 2) + 1;
    p.money = Math.max(0, Math.min(999999, p.money + result.paid));
    return result;
  }

  p.exp += amount;
  while (p.level < MAX_PLAYER_LEVEL && p.exp >= expForPlayerLevel(p.level + 1)) {
    const before = maxVigour();
    p.level++;
    result.levels++;
    // A level grants the health it added, so levelling mid-quest is a reprieve.
    p.hp = Math.min(maxVigour(), p.hp + (maxVigour() - before));
  }
  reconcileHp();
  return result;
}

export function equip(slot, id) {
  const p = game.state.player;
  p.equipment = p.equipment ?? {};
  const previous = p.equipment[slot];
  p.equipment[slot] = id;
  /* A piece you have just put on is however worn it is, and a piece you have
     never worn is whole. Held per slot rather than per piece, the way the
     cartridge holds it: swapping back and forth to dodge the wear would be a
     dull thing to have to police. */
  if (id !== previous) wearOf()[slot] = gearLife(slot, id);
  reconcileHp();
  return previous;
}

/** Gear you own but are not currently wearing, per slot. */
export function ownedGear(slot) {
  const owned = game.state.player.gearOwned?.[slot] ?? [];
  return [...new Set(owned)];
}

export function giveGear(slot, id) {
  const p = game.state.player;
  p.gearOwned = p.gearOwned ?? Object.fromEntries(GEAR_SLOTS.map((s) => [s, []]));
  p.gearOwned[slot] = p.gearOwned[slot] ?? [];
  if (!p.gearOwned[slot].includes(id)) p.gearOwned[slot].push(id);
}

export function ownsGear(slot, id) {
  return (game.state.player.gearOwned?.[slot] ?? []).includes(id);
}

/** A short label for the trainer card and duel HUD. */
export function playerTitle() {
  const sigils = game.state.sigils.length;
  if (game.state.flags.gameComplete) return 'Ruler of the Seven Kingdoms';
  return ['Ward of Winterfell', 'Sworn Rider', 'Banner-Knight', 'Lord Commander', 'Claimant'][sigils]
    ?? 'Ward of Winterfell';
}

// ------------------------------------------------------------ appearance ---

/** Which weapon silhouette a given arm is drawn with. */
const WEAPON_SHAPE = {
  fists: 'none',
  huntingKnife: 'dagger',
  dragonglassDagger: 'dagger',
  ironSword: 'blade',
  castleForged: 'blade',
  valyrian: 'blade',
  woodAxe: 'axe',
  warhammer: 'hammer',
  boarSpear: 'spear',
  huntingBow: 'bow',
};

/** Armour decides the cut of what you are wearing and its colours. */
const ARMOUR_LOOK = {
  roughspun:      { outfit: 'tunic',    cloak: '#6a6154', cloakDark: '#4b4438', trim: '#8f8674' },
  gambeson:       { outfit: 'leathers', cloak: '#c4b48c', cloakDark: '#9a8c68', trim: '#e0d4b0' },
  boiledLeather:  { outfit: 'leathers', cloak: '#7a5330', cloakDark: '#553722', trim: '#a8783f' },
  ringmail:       { outfit: 'mail',     cloak: '#8b93a0', cloakDark: '#5f6672', trim: '#c2cad8' },
  scaleArmour:    { outfit: 'mail',     cloak: '#6f7f92', cloakDark: '#4a5666', trim: '#a8bcd0' },
  knightPlate:    { outfit: 'plate',    cloak: '#a8b0bc', cloakDark: '#767e8c', trim: '#e8eef8' },
  kingsguardPlate:{ outfit: 'plate',    cloak: '#eceef4', cloakDark: '#b8bcc8', trim: '#f0d878' },
};

/**
 * What the player looks like right now. The overworld, the duel and the gear
 * screen all draw from this, so a change of armour is visible everywhere the
 * moment it is equipped.
 */
export function playerAppearance() {
  const base = ACTOR_PALETTES[game.state.player.sprite] ?? ACTOR_PALETTES.hero;
  const armour = equipped('armour');
  const look = ARMOUR_LOOK[armour.id] ?? ARMOUR_LOOK.roughspun;

  return {
    build: base.build ?? 'man',
    hair: base.hair ?? 'short',
    outfit: look.outfit,
    weapon: WEAPON_SHAPE[equipped('weapon').id] ?? 'none',
    shield: equipped('shield').id,
    palette: {
      ...base.palette,
      cloak: look.cloak,
      cloakDark: look.cloakDark,
      trim: look.trim,
    },
  };
}

// state.js calls this after a rest so it can heal the player without needing to
// know how gear affects the health maximum.
setPlayerRestorer(() => healPlayer());
