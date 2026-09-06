// The Long Night, as a number.
//
// Everything north of the Neck used to be a place rather than a clock: the
// dead stood on the same three roads at the same strength from the first
// morning to the last, so the one thread in this world that is supposed to
// grow while everybody else is busy killing each other did not grow at all.
// The cartridge has had this since it was written. The browser build has not,
// which is why the two of them tell different stories about the same realm.
//
// One counter drives it. It climbs when the realm tears itself apart — every
// sigil taken, every step of the last act, every sixth grave — and it comes
// back down only when somebody goes over the Wall and does something about it.
// What it drives is a single question: how far south the dead have walked.
//
// This module is data and arithmetic only. It imports nothing, which is what
// lets the cartridge exporter read the same table out of it in node rather
// than keeping a second copy that can drift.

/** How much cold makes one more stage. */
export const WINTER_STEP = 20;

/** The Long Night, everywhere, Dorne included. */
export const WINTER_DEEPEST = 6;

/**
 * How cold the ground is under each region, five deep beyond the Wall down to
 * nothing in Dorne. Paired with the winter's own count, this is the whole map
 * of how far the dead have walked.
 *
 * Nought is not "warm" — it is "the cold never comes here". Every room in the
 * game is nought, and so is everything on the far side of the Narrow Sea: salt
 * water and eight thousand miles. Whatever is coming, it is not coming to
 * Meereen.
 */
export const COLD_OF = {
  'Beyond the Wall': 6,
  'The Wall': 5,
  'The North': 4,
  'The Neck': 3,
  'The Riverlands': 3, 'The Vale': 3, 'The Iron Islands': 3,
  'The Westerlands': 2, 'The Crownlands': 2,
  'The Reach': 2, 'The Stormlands': 2,
  Dorne: 1,
  'The Narrow Sea': 0, Braavos: 0, Pentos: 0, Volantis: 0, Meereen: 0,
};

/** A region nobody wrote a row for is middling cold, the same as the Reach. */
export const COLD_DEFAULT = 2;

/**
 * How cold a map is. Indoors is warm — the dead are a thing on roads, and a
 * wight coming out of the panelling of an inn is a different game.
 */
export function coldOf(region, indoor = false) {
  if (indoor) return 0;
  return COLD_OF[region] ?? COLD_DEFAULT;
}

/**
 * What the maesters would call it. The card says this, so a player who has
 * never been north of Winterfell still watches it get worse.
 */
export const SEASONS = [
  'a long summer',
  'the summer turning',
  'a hard autumn',
  'the nights drawing in',
  'the first winter snow',
  'deep winter',
  'the Long Night',
];

/**
 * And how far down the map they have got, in the name of a place rather than a
 * number, because "cold 3" means nothing to anybody.
 */
export const DEAD_REACH = [
  'The dead are a story told to children.',
  'Beyond the Wall, something is moving.',
  'The dead walk beyond the Wall.',
  'The dead are over the Wall.',
  'The dead are in the North.',
  'The dead are past the Neck.',
  'The dead are everywhere. There is no south left.',
];

/**
 * What the raven says when it gets worse. Written from the Wall, in the order
 * it gets worse, and the last of them is not asking for anything.
 */
export const RAVENS = [
  'A raven from Castle Black: the Watch is under strength and the Gift is '
    + 'empty. Nothing else to report. Nothing yet.',
  'A raven from Castle Black: rangers went out past the Shadow Tower and two '
    + 'of the three came back. The one who did not was seen again afterwards, '
    + 'walking.',
  'A raven from Eastwatch: the wildlings are coming south in numbers and they '
    + 'are not raiding. They are running. Something is behind them.',
  'A raven from Castle Black: the dead came to the gate in the night and the '
    + 'gate held. It will not hold twice. Bring fire, or dragonglass, or both.',
  'A raven from Winterfell: the Wall is down. The North is theirs from the '
    + 'Last Hearth to the Long Lake, and the snow is coming south with them.',
  'A raven from Moat Cailin: they are past the Neck. Every road in the '
    + 'Riverlands has something on it that used to be somebody.',
  'There are no more ravens. The maesters who kept them are walking now, and '
    + 'the night is the whole of the sky.',
];

/**
 * The three things that get up after they are dead, weakest first. The world
 * puts these on roads whose own encounter table never mentioned them, which is
 * the whole of how the Long Night spreads.
 */
export const THE_DEAD = { wight: 'wightling', risen: 'barrowlord', walker: 'palewalker' };

/** Whether a species is one of them, for the fights that buy the winter back. */
export function isOneOfTheDead(speciesId) {
  return Object.values(THE_DEAD).includes(speciesId);
}
