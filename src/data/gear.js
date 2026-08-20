// Weapons, armour and the techniques they grant.
//
// You fight in person, so your gear is your moveset: a longsword teaches you to
// thrust and riposte, a warhammer teaches you to crush. Armour trades swiftness
// for guard. Nothing here touches the creature battle system.

/**
 * Techniques.
 *   power     base damage
 *   accuracy  percent
 *   stamina   cost per use; you regain some each round
 *   effect    optional rider
 *     { bleed }        damage over time that ignores guard
 *     { stun }         the foe loses their next action
 *     { guardBreak }   halves the foe's guard for the rest of the duel
 *     { drain }        fraction of damage returned as health
 *     { defend }       raises your own guard until your next turn
 *   priority  higher goes first regardless of swiftness
 */
export const TECHNIQUES = {
  // --- universal -----------------------------------------------------------
  guard: {
    name: 'Guard', power: 0, accuracy: 100, stamina: 0, priority: 2,
    effect: { defend: 0.5 },
    desc: 'Raise your guard. Halves damage until your next turn and recovers wind.',
  },
  shieldBash: {
    name: 'Shield Bash', power: 45, accuracy: 95, stamina: 2,
    effect: { stun: true }, chance: 0.35, needsShield: true,
    desc: 'Drive the shield boss into them. May stagger.',
  },

  // --- longsword -----------------------------------------------------------
  slash: {
    name: 'Slash', power: 70, accuracy: 95, stamina: 2,
    desc: 'A clean cut across the body.',
  },
  thrust: {
    name: 'Thrust', power: 85, accuracy: 90, stamina: 3, highCrit: true,
    desc: 'Point-first, through the gaps in the plate.',
  },
  riposte: {
    name: 'Riposte', power: 55, accuracy: 100, stamina: 2, priority: 1,
    desc: 'Turn their blade and answer at once. Always lands first.',
  },
  // --- axe -----------------------------------------------------------------
  cleave: {
    name: 'Cleave', power: 95, accuracy: 80, stamina: 4,
    desc: 'Everything behind the swing. Wild, but it ends arguments.',
  },
  hook: {
    name: 'Hook', power: 55, accuracy: 95, stamina: 3,
    effect: { guardBreak: true }, chance: 0.5,
    desc: 'Drag the shield aside. May break their guard for good.',
  },
  // --- warhammer -----------------------------------------------------------
  crush: {
    name: 'Crush', power: 110, accuracy: 75, stamina: 5,
    effect: { stun: true }, chance: 0.3,
    desc: 'Plate does not help. May stagger.',
  },
  sweep: {
    name: 'Sweep', power: 60, accuracy: 90, stamina: 3,
    effect: { guardBreak: true }, chance: 0.4,
    desc: 'Take the legs out from under them.',
  },
  // --- spear ---------------------------------------------------------------
  lunge: {
    name: 'Lunge', power: 65, accuracy: 95, stamina: 2, priority: 1,
    desc: 'Reach beats speed. Strikes before most answers.',
  },
  skewer: {
    name: 'Skewer', power: 100, accuracy: 85, stamina: 4,
    effect: { bleed: true }, chance: 0.4,
    desc: 'Run them through. They will keep bleeding.',
  },
  // --- dagger --------------------------------------------------------------
  quickCut: {
    name: 'Quick Cut', power: 45, accuracy: 100, stamina: 1, priority: 2,
    desc: 'Fast, cheap and first.',
  },
  backstab: {
    name: 'Backstab', power: 120, accuracy: 70, stamina: 4, highCrit: true,
    effect: { bleed: true }, chance: 0.5,
    desc: 'Wait for the turn of their shoulder. Rarely lands. Ends things when it does.',
  },
  // --- bow -----------------------------------------------------------------
  loose: {
    name: 'Loose', power: 70, accuracy: 100, stamina: 2,
    desc: 'Nock, draw, loose. Never misses a standing man.',
  },
  volley: {
    name: 'Volley', power: 45, accuracy: 90, stamina: 3,
    effect: { hits: [2, 3] },
    desc: 'Two or three arrows before they close the distance.',
  },
  // --- Valyrian steel ------------------------------------------------------
  valyrianArc: {
    name: 'Valyrian Arc', power: 105, accuracy: 95, stamina: 4, highCrit: true,
    effect: { guardBreak: true }, chance: 0.35,
    desc: 'Rippled steel goes through mail like cloth.',
  },
  // --- monstrous (used by beasts that duel you in person) ------------------
  savage: {
    name: 'Savage Blow', power: 90, accuracy: 90, stamina: 3,
    effect: { bleed: true }, chance: 0.35,
    desc: 'Claws and weight.',
  },
};

/** Weapons. `techniques` is what the weapon teaches you while it is drawn. */
export const WEAPONS = {
  fists: {
    name: 'Bare Hands', might: 0, swiftness: 0, price: 0,
    techniques: ['quickCut'], tier: 0,
    desc: 'Better than nothing, and not by much.',
  },
  huntingKnife: {
    name: 'Hunting Knife', might: 6, swiftness: 3, price: 250,
    techniques: ['quickCut', 'backstab'], tier: 1,
    desc: 'For skinning, mostly. It will do for worse.',
  },
  ironSword: {
    name: 'Iron Sword', might: 12, swiftness: 0, price: 700,
    techniques: ['slash', 'riposte'], tier: 1,
    desc: 'Common castle-forged steel. Honest and heavy.',
  },
  woodAxe: {
    name: 'Woodsman\'s Axe', might: 15, swiftness: -2, price: 800,
    techniques: ['cleave', 'hook'], tier: 1,
    desc: 'Meant for timber. Unfussy about what it meets.',
  },
  huntingBow: {
    name: 'Hunting Bow', might: 11, swiftness: 4, price: 900,
    techniques: ['loose', 'volley'], tier: 1,
    desc: 'Ash and horn. Reach is its own kind of armour.',
  },
  castleForged: {
    name: 'Castle-Forged Blade', might: 20, swiftness: 1, price: 2200,
    techniques: ['slash', 'thrust', 'riposte'], tier: 2,
    desc: 'A knight\'s sword, balanced a handspan above the guard.',
  },
  warhammer: {
    name: 'Warhammer', might: 26, swiftness: -5, price: 2800,
    techniques: ['crush', 'sweep'], tier: 2,
    desc: 'Answers plate armour with physics.',
  },
  boarSpear: {
    name: 'Boar Spear', might: 21, swiftness: 3, price: 2400,
    techniques: ['lunge', 'skewer'], tier: 2,
    desc: 'A crossbar below the head, so what you stab cannot walk up the shaft.',
  },
  valyrian: {
    name: 'Valyrian Steel', might: 38, swiftness: 4, price: 0, unique: true,
    techniques: ['valyrianArc', 'thrust', 'riposte'], tier: 3,
    desc: 'Dark rippled steel. The forging of it is lost and it has never needed sharpening.',
  },
  dragonglassDagger: {
    name: 'Dragonglass Dagger', might: 18, swiftness: 6, price: 0, unique: true,
    techniques: ['quickCut', 'backstab'], tier: 2,
    desc: 'Obsidian worked to an edge. Cold things come apart on it.',
  },
};

/** Armour. Guard reduces incoming damage; weight costs swiftness. */
export const ARMOUR = {
  roughspun: {
    name: 'Roughspun', guard: 0, swiftness: 0, price: 0, tier: 0,
    desc: 'Wool and hope.',
  },
  gambeson: {
    name: 'Gambeson', guard: 8, swiftness: -1, price: 400, tier: 1,
    desc: 'Quilted linen. Turns a glancing cut and soaks up rain.',
  },
  boiledLeather: {
    name: 'Boiled Leather', guard: 14, swiftness: -2, price: 900, tier: 1,
    desc: 'Hardened in wax. What most men-at-arms actually own.',
  },
  ringmail: {
    name: 'Ringmail', guard: 22, swiftness: -4, price: 1900, tier: 2,
    desc: 'Riveted rings over a padded coat. Heavy, and worth it.',
  },
  scaleArmour: {
    name: 'Scale Armour', guard: 28, swiftness: -5, price: 3000, tier: 2,
    desc: 'Overlapping steel scales on leather. Northern make.',
  },
  knightPlate: {
    name: "Knight's Plate", guard: 38, swiftness: -8, price: 5200, tier: 3,
    desc: 'Full harness. You will not be quick, and you will not need to be.',
  },
  kingsguardPlate: {
    name: 'White Plate', guard: 44, swiftness: -6, price: 0, unique: true, tier: 3,
    desc: 'Enamelled white, gold-chased. Worn by seven men at a time and no others.',
  },
};

/** Shields. Enable Shield Bash and add flat guard. */
export const SHIELDS = {
  none: { name: 'No Shield', guard: 0, swiftness: 0, price: 0, tier: 0, desc: 'Both hands free.' },
  buckler: {
    name: 'Buckler', guard: 5, swiftness: 0, price: 350, tier: 1,
    desc: 'A steel fist-shield. Small, fast, better than air.',
  },
  oakShield: {
    name: 'Oak Shield', guard: 12, swiftness: -2, price: 1100, tier: 2,
    desc: 'Planked oak with an iron rim, painted with somebody\'s sigil.',
  },
  towerShield: {
    name: 'Tower Shield', guard: 20, swiftness: -5, price: 2600, tier: 3,
    desc: 'A wall you can carry. Slow, and nearly impossible to get past.',
  },
};

export const GEAR_SLOTS = ['weapon', 'armour', 'shield'];
const TABLES = { weapon: WEAPONS, armour: ARMOUR, shield: SHIELDS };

export function gear(slot, id) {
  const table = TABLES[slot];
  const found = table?.[id];
  if (!found) throw new Error(`Unknown ${slot}: ${id}`);
  return { id, slot, ...found };
}

export function gearTable(slot) {
  return TABLES[slot];
}

export function technique(id) {
  const found = TECHNIQUES[id];
  if (!found) throw new Error(`Unknown technique: ${id}`);
  return { id, ...found };
}
