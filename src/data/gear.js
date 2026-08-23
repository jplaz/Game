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

  // --- bare hands ----------------------------------------------------------
  // What you have before you have taken anything off anybody. Weak, cheap and
  // quick: enough to win a first fight against somebody as poor as you are, and
  // not enough to want to keep using once there is steel to be had.
  // Appended at the end on purpose: the export numbers these by their order
  // here, so anything inserted above would move every weapon's techniques.
  jab: {
    name: 'Jab', power: 55, accuracy: 100, stamina: 1, priority: 1,
    desc: 'Short, straight, and it always lands. It just does not land hard.',
  },
  grapple: {
    name: 'Grapple', power: 48, accuracy: 95, stamina: 2,
    effect: { guardBreak: true }, chance: 0.4,
    desc: 'Get inside their guard and stay there. May break it for good.',
  },
  headbutt: {
    name: 'Headbutt', power: 78, accuracy: 75, stamina: 3,
    desc: 'Desperate, and it hurts you too. Sometimes it is what there is.',
  },

  // --- the middle of the ladder --------------------------------------------
  // Added with the weapons that teach them, and appended here for the same
  // reason the bare-hand moves are: the export numbers techniques by the order
  // of this table, so anything inserted higher up would silently re-point every
  // weapon above it.
  feint: {
    name: 'Feint', power: 60, accuracy: 100, stamina: 2, highCrit: true,
    desc: 'Show them one line and take another. Cheap, certain, and it finds gaps.',
  },
  harry: {
    name: 'Harry', power: 40, accuracy: 100, stamina: 1, priority: 2,
    effect: { hits: [2, 3] },
    desc: 'Two or three quick ones before they have set their feet.',
  },
  overhand: {
    name: 'Overhand', power: 88, accuracy: 88, stamina: 3,
    effect: { guardBreak: true }, chance: 0.3,
    desc: 'Down through the collarbone. Shields do not like it.',
  },
  whirl: {
    name: 'Whirl', power: 108, accuracy: 78, stamina: 5,
    effect: { bleed: true }, chance: 0.3,
    desc: 'Both hands, all the way round, and whatever is standing there wears it.',
  },

  // --- what has teeth ------------------------------------------------------
  // Beasts do not carry anything, so how they fight is all they are. Appended
  // last, as everything is, because the export numbers this table in order.
  bite: {
    name: 'Bite', power: 76, accuracy: 95, stamina: 2,
    effect: { bleed: true }, chance: 0.3,
    desc: 'Closes on whatever is nearest and does not let go.',
  },
  claw: {
    name: 'Claw', power: 58, accuracy: 100, stamina: 1, highCrit: true,
    desc: 'Quick, shallow, and it finds the soft places.',
  },
  gore: {
    name: 'Gore', power: 96, accuracy: 85, stamina: 4,
    effect: { guardBreak: true }, chance: 0.3,
    desc: 'Head down and all the weight behind it.',
  },
  coil: {
    name: 'Coil', power: 70, accuracy: 90, stamina: 3,
    effect: { stun: true }, chance: 0.3,
    desc: 'Winds round and squeezes. Hard to answer while it is happening.',
  },
  gust: {
    name: 'Gust', power: 54, accuracy: 100, stamina: 1, priority: 1,
    desc: 'A beat of wings across the eyes. Always first.',
  },
  fireBreath: {
    name: 'Fire Breath', power: 104, accuracy: 85, stamina: 5,
    effect: { burn: true }, chance: 0.3,
    desc: 'What the Targaryens conquered a continent with, at close range.',
  },
};

/**
 * What fighting itself teaches you, whatever is in your hand.
 *
 * A weapon teaches its own techniques, and until now that was the only way a
 * moveset ever changed - so levelling up altered two numbers and nothing you
 * could see. These are learned by standing, not by shopping: the third of your
 * four slots is whichever of these you have reached, so climbing visibly
 * changes how you fight.
 */
export const LEARNED = [
  { level: 8,  id: 'quickCut' },
  { level: 12, id: 'riposte' },
  { level: 16, id: 'sweep' },
  { level: 20, id: 'lunge' },
  { level: 24, id: 'hook' },
  { level: 28, id: 'cleave' },
  { level: 32, id: 'skewer' },
  { level: 36, id: 'backstab' },
  { level: 42, id: 'valyrianArc' },
];

/** Weapons. `techniques` is what the weapon teaches you while it is drawn. */
export const WEAPONS = {
  fists: {
    name: 'Bare Hands', might: 0, swiftness: 0, price: 0,
    techniques: ['quickCut'], tier: 0,
    desc: 'Better than nothing, and not by much.',
  },
  cudgel: {
    name: 'Oaken Cudgel', might: 3, swiftness: 0, price: 120,
    techniques: ['grapple', 'headbutt'], tier: 0,
    desc: 'A shaped length of oak. Every village has a barrel of them by the door.',
  },
  huntingKnife: {
    name: 'Hunting Knife', might: 6, swiftness: 3, price: 250,
    techniques: ['quickCut', 'backstab'], tier: 1,
    desc: 'For skinning, mostly. It will do for worse.',
  },
  sellswordBlade: {
    name: "Sellsword's Blade", might: 9, swiftness: 1, price: 450,
    techniques: ['slash', 'feint'], tier: 1,
    desc: 'Notched, re-hilted twice, and it has been paid for in three languages.',
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
  longsword: {
    name: 'Longsword', might: 16, swiftness: 0, price: 1300,
    techniques: ['slash', 'thrust', 'feint'], tier: 2,
    desc: 'A hand and a half of grip. What a household guard is issued.',
  },
  arakh: {
    name: 'Dothraki Arakh', might: 17, swiftness: 4, price: 1500,
    techniques: ['quickCut', 'slash', 'harry'], tier: 2,
    desc: 'A curved horse-sword out of the grass. Made for cutting on the move.',
  },
  morningstar: {
    name: 'Morningstar', might: 20, swiftness: -3, price: 1700,
    techniques: ['crush', 'hook'], tier: 2,
    desc: 'A flanged head on a haft. Nothing about it is subtle and nothing needs to be.',
  },
  halberd: {
    name: 'Halberd', might: 24, swiftness: -2, price: 2000,
    techniques: ['lunge', 'hook', 'overhand'], tier: 2,
    desc: 'Axe, spike and hook on six feet of ash. Three weapons and a fence post.',
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
  bastardSword: {
    name: 'Bastard Sword', might: 23, swiftness: -1, price: 1750,
    techniques: ['slash', 'thrust', 'overhand'], tier: 2,
    desc: 'Too long for one hand and too short for two, which is the whole idea.',
  },
  greatsword: {
    name: 'Greatsword', might: 31, swiftness: -6, price: 3600,
    techniques: ['whirl', 'cleave', 'overhand'], tier: 3,
    desc: 'Carried across the back because no belt will hold it. Swung with the hips.',
  },
  dragonboneBow: {
    name: 'Dragonbone Bow', might: 27, swiftness: 5, price: 4200,
    techniques: ['loose', 'volley', 'harry'], tier: 3,
    desc: 'Black bone, lighter than yew and stiffer than horn. Draws like a whisper.',
  },
  ancestralBlade: {
    name: 'Ancestral Blade', might: 34, swiftness: 2, price: 9800, tier: 3,
    techniques: ['thrust', 'riposte', 'overhand'],
    desc: 'A great house sword with four hundred years of names cut into the ricasso.',
  },
  direWarhammer: {
    name: 'Warhammer of the North', might: 35, swiftness: -7, price: 0, unique: true,
    techniques: ['crush', 'sweep', 'whirl'], tier: 3,
    desc: 'Ironwood haft, dragonglass wedge. It was made for something that does not bleed.',
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
  furCloak: {
    name: 'Fur Cloak', guard: 4, swiftness: 0, price: 180, tier: 1,
    desc: 'Wolf over the shoulders. It will not stop steel, but it stops a lot of nights.',
  },
  gambeson: {
    name: 'Gambeson', guard: 8, swiftness: -1, price: 400, tier: 1,
    desc: 'Quilted linen. Turns a glancing cut and soaks up rain.',
  },
  boiledLeather: {
    name: 'Boiled Leather', guard: 14, swiftness: -2, price: 900, tier: 1,
    desc: 'Hardened in wax. What most men-at-arms actually own.',
  },
  studdedBrigandine: {
    name: 'Studded Brigandine', guard: 18, swiftness: -3, price: 1300, tier: 2,
    desc: 'Steel plates riveted between two skins of canvas. The rivets are the fashion.',
  },
  ringmail: {
    name: 'Ringmail', guard: 22, swiftness: -4, price: 1900, tier: 2,
    desc: 'Riveted rings over a padded coat. Heavy, and worth it.',
  },
  scaleArmour: {
    name: 'Scale Armour', guard: 28, swiftness: -5, price: 3000, tier: 2,
    desc: 'Overlapping steel scales on leather. Northern make.',
  },
  bandedMail: {
    name: 'Banded Mail', guard: 25, swiftness: -4, price: 2300, tier: 2,
    desc: 'Overlapping hoops of iron on a leather carcass. Cheap for what it turns.',
  },
  splintMail: {
    name: 'Splinted Mail', guard: 33, swiftness: -6, price: 3900, tier: 3,
    desc: 'Iron splints laced down the limbs over a mail coat. A half-step short of harness.',
  },
  knightPlate: {
    name: "Knight's Plate", guard: 38, swiftness: -8, price: 5200, tier: 3,
    desc: 'Full harness. You will not be quick, and you will not need to be.',
  },
  dragonscaleMail: {
    name: 'Dragonscale Mail', guard: 42, swiftness: -6, price: 9000, tier: 3,
    desc: 'Scales off something that was not a fish, sewn onto a coat by somebody very patient.',
  },
  castellanPlate: {
    name: "Castellan's Plate", guard: 46, swiftness: -9, price: 0, unique: true,
    desc: 'Fluted, blackened and fitted to one man. Somebody had to be measured for this.',
  },
  kingsguardPlate: {
    name: 'White Plate', guard: 44, swiftness: -6, price: 0, unique: true, tier: 3,
    desc: 'Enamelled white, gold-chased. Worn by seven men at a time and no others.',
  },
};

/** Shields. Enable Shield Bash and add flat guard. */
export const SHIELDS = {
  none: { name: 'No Shield', guard: 0, swiftness: 0, price: 0, tier: 0, desc: 'Both hands free.' },
  hideTarge: {
    name: 'Hide Targe', guard: 3, swiftness: 0, price: 150, tier: 1,
    desc: 'Boiled hide stretched over a withy hoop. It is what you can afford.',
  },
  buckler: {
    name: 'Buckler', guard: 5, swiftness: 0, price: 350, tier: 1,
    desc: 'A steel fist-shield. Small, fast, better than air.',
  },
  heaterShield: {
    name: 'Heater Shield', guard: 8, swiftness: -1, price: 700, tier: 1,
    desc: 'A flat-topped kite cut down for a man on foot. Plain, painted, everywhere.',
  },
  oakShield: {
    name: 'Oak Shield', guard: 12, swiftness: -2, price: 1100, tier: 2,
    desc: 'Planked oak with an iron rim, painted with somebody\'s sigil.',
  },
  ironboundShield: {
    name: 'Iron-Bound Shield', guard: 16, swiftness: -3, price: 1700, tier: 2,
    desc: 'Oak banded edge to edge in iron. Heavy on the arm and very hard to split.',
  },
  towerShield: {
    name: 'Tower Shield', guard: 20, swiftness: -5, price: 2600, tier: 3,
    desc: 'A wall you can carry. Slow, and nearly impossible to get past.',
  },
  kiteShield: {
    name: 'Kite Shield', guard: 18, swiftness: -4, price: 2000, tier: 2,
    desc: 'Long enough to cover a leg, which is where most people are actually hit.',
  },
  ironwoodTower: {
    name: 'Ironwood Tower', guard: 26, swiftness: -6, price: 4400, tier: 3,
    desc: 'Ironwood banded in steel. It does not splinter, and it does not move.',
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
