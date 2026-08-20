// The player as a fighter in their own right: levels, stats, wounds and gear.
//
// Creatures still level on their own curve; this is the separate track that
// makes *you* stronger. Duels award it, and creature battles pay a smaller
// share, so neither style of play locks you out of the other.

import { game, setPlayerRestorer } from './state.js';
import { gear, technique } from '../data/gear.js';
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
  const fallback = { weapon: 'fists', armour: 'roughspun', shield: 'none' }[slot];
  try {
    return gear(slot, id ?? fallback);
  } catch {
    return gear(slot, fallback);
  }
}

/** Stats after gear. This is what the duel actually reads. */
export function playerStats() {
  const p = game.state.player;
  const base = baseStats(p.level);
  const weapon = equipped('weapon');
  const armour = equipped('armour');
  const shield = equipped('shield');

  return {
    vigour: base.vigour,
    might: base.might + weapon.might,
    guard: base.guard + armour.guard + shield.guard,
    swiftness: Math.max(1, base.swiftness + (weapon.swiftness ?? 0)
      + (armour.swiftness ?? 0) + (shield.swiftness ?? 0)),
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
  const result = { gained: amount, levels: 0 };
  if (p.level >= MAX_PLAYER_LEVEL) return result;

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
  p.gearOwned = p.gearOwned ?? { weapon: [], armour: [], shield: [] };
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
