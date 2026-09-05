// Ships you can buy, and what they are worth in a fight.
//
// Until now the sea was a menu. You stood on a deck somebody else owned, told
// somebody else's captain a port, paid, and the screen changed — which is a
// warp with a coat of paint on it and is not sailing.
//
// These are yours. A hull is a real number that goes down when somebody rams
// it and does not come back on its own; a crew is who you have to swing a line
// or hold a rail when the fighting starts. The skiff will not survive a war
// galley and is not meant to: it is the cheapest way onto open water, which is
// where everything else in this file becomes worth having.
//
//   price   what the shipwright asks, in gold
//   hull    how much she will take before she goes down
//   crew    how many hands, which is most of what wins a boarding
//   ram     what she does to another hull when she goes in bow-first
//   draught how shallow she will run: a skiff crosses shoals a galley cannot
//   berth   what the shipwright calls her when the money changes hands

export const SHIPS = {
  skiff: {
    name: 'A Fishing Skiff',
    price: 1200,
    hull: 40, crew: 6, ram: 4, draught: 1,
    summary: 'Two oars, a patched sail and a bailing bucket that is not optional.',
    broker: 'Shipwright: She is a skiff. She leaks, she is slow, and she has been '
          + 'to Braavos twice, which is two more times than anybody expected. '
          + 'Twelve hundred and she is yours.',
    bought: 'Shipwright: Twelve hundred. Do not fight anybody in her. Do not fight '
          + 'anybody NEAR her. Bail when she asks and she will keep you dry.',
    poor: 'Shipwright: Twelve hundred. I have taken worse offers, but not this week.',
  },
  cog: {
    name: 'A Trading Cog',
    price: 6500,
    hull: 95, crew: 16, ram: 9, draught: 2,
    summary: 'Fat, slow, and built to carry rather than to catch. Room below for cargo.',
    broker: 'Shipwright: A cog. She carries, she does not chase, and pirates like '
          + 'the look of her — which is a problem you can solve with sixteen '
          + 'hands and a bad temper. Six thousand five hundred.',
    bought: 'Shipwright: Six and a half thousand. She will take a ram and grumble '
          + 'about it. Two rams and you will be swimming.',
    poor: 'Shipwright: Six thousand five hundred, and I do not haggle before noon.',
  },
  longship: {
    name: 'An Ironborn Longship',
    price: 15000,
    hull: 130, crew: 38, ram: 22, draught: 1,
    summary: 'Shallow, fast, and built for exactly one purpose. Runs up a beach.',
    broker: 'Shipwright: Ironborn built, and I did not ask how she came to be for '
          + 'sale. She draws nothing, she goes where a galley cannot follow, and '
          + 'she is made to come alongside somebody. Fifteen thousand.',
    bought: 'Shipwright: Fifteen thousand. What is dead may never die — and if you '
          + 'say that anywhere near her, forty men will say it back.',
    poor: 'Shipwright: Fifteen thousand. She is worth twice that and we both know it.',
  },
  galley: {
    name: 'A War Galley',
    price: 34000,
    hull: 210, crew: 70, ram: 40, draught: 3,
    summary: 'Three banks of oars and a bronze beak. Nothing afloat wants her bow.',
    broker: 'Shipwright: A war galley. Three banks, a bronze beak, and seventy men '
          + 'who will want feeding whether you sail her or not. Thirty-four '
          + 'thousand, and you will need a reason.',
    bought: 'Shipwright: Thirty-four thousand. Nothing on this sea will come at you '
          + 'bow-first ever again. They will come at you some other way.',
    poor: 'Shipwright: Thirty-four thousand. This is not a ship one saves up for by '
          + 'accident.',
  },
};

/* What is out there, and what it will do to you.
 *
 * A fleet is fought as a ship first and a person second: you trade rams and
 * arrows until one hull gives, and only then does anybody set foot on anybody
 * else's deck. `duel` is who you meet when they do.
 *
 *   hull/crew/ram   the same numbers yours has, so the arithmetic is one rule
 *   bounty          gold off the deck if you take her
 *   duel            the captain, once it comes to boarding
 *   flees           how badly hurt she has to be before she runs
 */
export const FLEETS = {
  pirateSkiff: {
    name: 'A Stepstones Raider', hull: 45, crew: 10, ram: 6, bounty: 300,
    duel: 'bandit', flees: 0.35,
    hail: 'She comes out of the sun with no colours up and closes fast.',
  },
  pirateGalley: {
    name: 'A Stepstones Galley', hull: 110, crew: 30, ram: 18, bounty: 1400,
    duel: 'sellsword', flees: 0.25,
    hail: 'A low black hull with a full bank of oars, and no flag anybody flies on purpose.',
  },
  ironbornRaider: {
    name: 'An Ironborn Longship', hull: 125, crew: 36, ram: 24, bounty: 1800,
    duel: 'ironbornReaver', flees: 0.1,
    hail: 'Longship. Oars in time, shields on the rail, and nobody aboard her is going home poor.',
  },
  slaverGalley: {
    name: 'A Slaver of Astapor', hull: 140, crew: 44, ram: 20, bounty: 2600,
    duel: 'sellsword', flees: 0.3,
    hail: 'A slaver, riding low with the weight of what is chained below her deck.',
  },
  redwyneWarship: {
    name: 'A Redwyne Warship', hull: 180, crew: 58, ram: 34, bounty: 3400,
    duel: 'hedgeKnight', flees: 0.2,
    hail: 'Arbor colours, three banks, and a captain who has been told to stop you.',
  },
  royalGalley: {
    name: 'A Royal Galley', hull: 200, crew: 66, ram: 38, bounty: 4200,
    duel: 'manAtArms', flees: 0.15,
    hail: 'Crowned stag on the sail. Whoever holds the throne wants a word, at speed.',
  },
};

/** The fleets that sail a given water, and how likely each is to find you. */
/* ------------------------------------------------------------ the deep ----
 *
 * What is in the water, as opposed to what is on it.
 *
 * The seas had fleets and nothing else, so every crossing in the game was a
 * negotiation with another crew and the water itself was a floor. These come
 * up under the hull instead: they cannot be run down, boarded or bought off,
 * and unlike a fleet they can be taken alive. A hold with a kraken in it is
 * the best reason there has ever been to own a boat.
 *
 * Levels are what the sea is worth rather than what you are: the Shivering
 * Sea is the far end of the world and says so.
 */
export const SEA_BEASTS = {
  blackwaterBay: [
    { beast: 'silverfin', min: 20, max: 28, weight: 45 },
    { beast: 'krakenling', min: 22, max: 30, weight: 35 },
    { beast: 'crabcrag', min: 20, max: 27, weight: 20 },
  ],
  theGullet: [
    { beast: 'tridentide', min: 30, max: 38, weight: 40 },
    { beast: 'deepmaw', min: 32, max: 40, weight: 30 },
    { beast: 'crabcrag', min: 26, max: 34, weight: 30 },
  ],
  sunsetSea: [
    { beast: 'deepmaw', min: 34, max: 42, weight: 40 },
    { beast: 'krakenling', min: 24, max: 32, weight: 30 },
    { beast: 'tridentide', min: 30, max: 38, weight: 30 },
  ],
  stepstones: [
    { beast: 'crabcrag', min: 28, max: 36, weight: 40 },
    { beast: 'silverfin', min: 24, max: 32, weight: 30 },
    { beast: 'deepmaw', min: 34, max: 42, weight: 30 },
  ],
  shiveringSea: [
    { beast: 'deepmaw', min: 36, max: 44, weight: 40 },
    { beast: 'tridentide', min: 34, max: 42, weight: 35 },
    { beast: 'crabcrag', min: 30, max: 38, weight: 25 },
  ],
};

export const SEA_LANES = {
  blackwaterBay: [
    { fleet: 'pirateSkiff', weight: 40 },
    { fleet: 'royalGalley', weight: 25 },
    { fleet: 'pirateGalley', weight: 35 },
  ],
  theGullet: [
    { fleet: 'pirateGalley', weight: 45 },
    { fleet: 'pirateSkiff', weight: 30 },
    { fleet: 'redwyneWarship', weight: 25 },
  ],
  sunsetSea: [
    { fleet: 'ironbornRaider', weight: 55 },
    { fleet: 'pirateSkiff', weight: 25 },
    { fleet: 'redwyneWarship', weight: 20 },
  ],
  stepstones: [
    { fleet: 'pirateGalley', weight: 40 },
    { fleet: 'slaverGalley', weight: 30 },
    { fleet: 'pirateSkiff', weight: 30 },
  ],
  shiveringSea: [
    { fleet: 'ironbornRaider', weight: 40 },
    { fleet: 'pirateSkiff', weight: 60 },
  ],
};
