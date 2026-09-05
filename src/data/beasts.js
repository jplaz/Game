// The wolves, dragons and everything else, as the cartridge needs them.
//
// The browser game has thirty-five species with full movesets and a six-stat
// spread. The cartridge fights with four numbers and a handful of techniques, so
// this is the translation: what each kind of animal does when it is angry, how
// hard it is to take alive, and what it grows into.
//
// Nothing here invents a creature. It reads SPECIES and says how that creature
// behaves in a duel fought the cartridge's way.

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
 * What a beast grows into, and when. A snowpup you take out of the Wolfswood at
 * level six is a direwolf by twenty and a winterfang by thirty-six, which is
 * most of the reason to keep the one you caught rather than trading up.
 */
export const GROWS_INTO = {
  palfrey: { into: 'courser', at: 24 },
  snowpup:    { into: 'direwolf',    at: 20 },
  direwolf:   { into: 'winterfang',  at: 36 },
  emberling:  { into: 'scaleflight', at: 22 },
  scaleflight:{ into: 'dreadwyrm',   at: 38 },
  riverfry:   { into: 'silverfin',   at: 18 },
  silverfin:  { into: 'tridentide',  at: 34 },
  ravenling:  { into: 'corvarch',    at: 24 },
  cubmane:    { into: 'goldmane',    at: 26 },
  fawnhart:   { into: 'crownstag',   at: 26 },
  krakenling: { into: 'deepmaw',     at: 30 },
  sandviper:  { into: 'dornspine',   at: 28 },
  bearcub:    { into: 'bearhold',    at: 28 },
  falconet:   { into: 'skytalon',    at: 26 },
  boartusk:   { into: 'tuskrend',    at: 30 },
  wightling:  { into: 'barrowlord',  at: 32 },
  emberwisp:  { into: 'pyremaw',     at: 34 },
  sapling:    { into: 'heartwarden', at: 30 },
};

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
