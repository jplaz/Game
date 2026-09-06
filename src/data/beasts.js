// The wolves, dragons and everything else, as the cartridge needs them.
//
// The browser game has thirty-five species with full movesets and a six-stat
// spread. The cartridge fights with four numbers and a handful of techniques, so
// this is the translation: what each kind of animal does when it is angry, how
// hard it is to take alive, and what it grows into.
//
// Nothing here invents a creature. It reads SPECIES and says how that creature
// behaves in a duel fought the cartridge's way.

import { SPECIES } from './species.js';

/** How each shape of animal fights. Three techniques and no weapon. */
export const BEAST_TECHNIQUES = {
  wolf:     ['bite', 'claw', 'savage'],
  /* A horse rears, sweeps a hoof and kicks. These were 'tackle', 'lastcharge'
     and 'rally' - three names no technique has ever had - so all three were
     quietly dropped on the way to the cartridge and every horse in the game
     fought with one blow, four times over. */
  horse:    ['headbutt', 'sweep', 'gore'],
  bear:     ['gore', 'crush', 'savage'],
  dragon:   ['fireBreath', 'bite', 'claw'],
  fish:     ['coil', 'bite', 'gust'],
  raven:    ['gust', 'claw', 'bite'],
  lion:     ['claw', 'bite', 'savage'],
  stag:     ['gore', 'headbutt', 'claw'],
  kraken:   ['coil', 'crush', 'bite'],
  serpent:  ['coil', 'bite', 'claw'],
  falcon:   ['gust', 'claw', 'bite'],
  boar:     ['gore', 'headbutt', 'crush'],
  wight:    ['coil', 'claw', 'headbutt'],
  flame:    ['fireBreath', 'gust', 'claw'],
  treefolk: ['crush', 'gore', 'coil'],
  crab:     ['crush', 'coil', 'claw'],
};

/**
 * What a beast grows into, and when.
 *
 * Read off SPECIES rather than written out again. It used to be a second copy
 * of the same eighteen facts, and a second copy drifts: thirteen of the
 * eighteen had come apart, so a snowpup out of the Wolfswood was a direwolf at
 * sixteen in one build of this game and at twenty in the other, an emberling
 * was a scaleflight at sixteen here and twenty-two there, and every one of
 * those numbers is something a player counts on. A species knows what it grows
 * into; this only says so in the shape the cartridge reads.
 */
export const GROWS_INTO = Object.fromEntries(
  Object.entries(SPECIES)
    .filter(([, sp]) => sp.evolve)
    .map(([id, sp]) => [id, { into: sp.evolve.into, at: sp.evolve.level }]),
);

/**
 * Which beasts will not be taken alive at any price.
 *
 * This used to hold the grown wyrm as well, which meant the answer to "can you
 * catch a dragon" was no: the only dragon anybody could ever have was one they
 * hatched out of an egg and walked for twelve wins. A wyrm off the Dragonmont
 * can be taken now — at a catch rate of twelve it will cost you a fistful of
 * banners and a very good day, which is the right price for the best mount in
 * the game. What is left on this list is the four that are not animals so much
 * as weather: the Black Dread, the white wolf, the thing in the ice, and the
 * Walker. Those are beaten, not kept.
 */
export const NEVER_TAMED = ['blackdread', 'ghostfang', 'palewalker'];

/** What comes out of an egg, and how long it sits before it does. */
export const EGGS = [
  { item: 'dragonEgg', hatches: 'emberling', wins: 12 },
  { item: 'direwolfPup', hatches: 'snowpup', wins: 4 },
];

/**
 * Where the things worth finding are. A beast worth having is not standing on
 * the first road, and an egg is not lying in the grass on the way to the shops.
 */
export const NESTS = {
  dragonmont: ['dragonEgg'],
  /* Forty years shut, and the reason to go looking. */
  dragonpit: ['dragonEgg'],
  beyondTheWall: ['direwolfPup'],
  barrowCave: ['direwolfPup'],
  wolfswood: ['direwolfPup'],
  /* The far north, and the one place a dragon egg is found outside Targaryen
     ground - Valyria's people put ships in a lot of places. */
  fistOfTheFirstMen: ['direwolfPup'],
  seaCave: ['dragonEgg'],
  hauntedForest: ['direwolfPup'],
};
