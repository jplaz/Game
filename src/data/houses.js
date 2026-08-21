// The great houses, and where you stand with each of them.
//
// Standing runs from -100 to +100. It moves when you kill a house's men on the
// road, when you beat one of their number in a duel, and when a story choice
// puts you on one side of something. It decides who greets you, who draws on
// you, and what a merchant charges.
//
// Swearing to a house at the start sets the opening positions: your own house
// thinks well of you, their rivals do not, and everyone else is indifferent.

export const HOUSES = {
  stark: {
    name: 'Stark', full: 'House Stark', seat: 'Winterfell',
    short: 'Stark',
    words: 'Winter is Coming',
    colour: '#8d97a6', accent: '#e4e9f2',
    rivals: ['lannister', 'bolton'], allies: ['tully'],
    sworn: 'You are of the North, and the North remembers.',
  },
  lannister: {
    name: 'Lannister', full: 'House Lannister', seat: 'Casterly Rock',
    short: 'Lannister',
    words: 'Hear Me Roar',
    colour: '#b8232f', accent: '#f0d878',
    rivals: ['stark', 'tully', 'martell'], allies: ['bolton'],
    sworn: 'A Lannister pays his debts. See that you can afford yours.',
  },
  tully: {
    name: 'Tully', full: 'House Tully', seat: 'Riverrun',
    short: 'Tully',
    words: 'Family, Duty, Honour',
    colour: '#2f6fa8', accent: '#c03434',
    rivals: ['lannister', 'greyjoy'], allies: ['stark'],
    sworn: 'Family first, then duty, then honour. In that order, always.',
  },
  baratheon: {
    name: 'Baratheon', full: 'House Baratheon', seat: 'Storm\'s End',
    short: 'Baratheon',
    words: 'Ours is the Fury',
    colour: '#d8a418', accent: '#241c14',
    rivals: ['targaryen', 'greyjoy'], allies: [],
    sworn: 'The stag does not ask leave. Neither will you.',
  },
  tyrell: {
    name: 'Tyrell', full: 'House Tyrell', seat: 'Highgarden',
    short: 'Tyrell',
    words: 'Growing Strong',
    colour: '#3f8f42', accent: '#e8d878',
    rivals: ['greyjoy'], allies: ['lannister'],
    sworn: 'Growing strong takes patience. You have none, so learn some.',
  },
  martell: {
    name: 'Martell', full: 'House Martell', seat: 'Sunspear',
    short: 'Dornish',
    words: 'Unbowed, Unbent, Unbroken',
    colour: '#d8701c', accent: '#c02020',
    rivals: ['lannister'], allies: [],
    sworn: 'Dorne was never conquered. Carry yourself accordingly.',
  },
  arryn: {
    name: 'Arryn', full: 'House Arryn', seat: 'the Eyrie',
    short: 'Vale',
    words: 'As High as Honour',
    colour: '#5c8fd0', accent: '#f0f4fa',
    rivals: [], allies: ['stark', 'tully'],
    sworn: 'As high as honour. The Vale watches how you climb.',
  },
  greyjoy: {
    name: 'Greyjoy', full: 'House Greyjoy', seat: 'Pyke',
    short: 'Ironborn',
    words: 'We Do Not Sow',
    colour: '#2c2f38', accent: '#c8a24a',
    rivals: ['tully', 'tyrell', 'baratheon'], allies: [],
    sworn: 'What is dead may never die. Pay the iron price and mean it.',
  },
  targaryen: {
    name: 'Targaryen', full: 'House Targaryen', seat: 'Dragonstone',
    short: 'Targaryen',
    words: 'Fire and Blood',
    colour: '#8b1a24', accent: '#1a1a1a',
    rivals: ['baratheon', 'lannister'], allies: [],
    sworn: 'Fire and blood. The realm forgot what that meant. Remind it.',
  },
  bolton: {
    name: 'Bolton', full: 'House Bolton', seat: 'the Dreadfort',
    short: 'Bolton',
    words: 'Our Blades are Sharp',
    colour: '#c8b8a8', accent: '#8b1a1a',
    rivals: ['stark'], allies: ['lannister'],
    sworn: 'A flayed man holds no secrets. Neither will your enemies.',
  },
  nightswatch: {
    name: 'the Watch', full: 'the Night\'s Watch', seat: 'Castle Black',
    short: 'Watch',
    words: 'I Am the Sword in the Darkness',
    colour: '#22262e', accent: '#8d97a6',
    rivals: ['freefolk'], allies: [],
    sworn: 'Night gathers, and now your watch begins.',
  },
  freefolk: {
    name: 'the Free Folk', full: 'the Free Folk', seat: 'beyond the Wall',
    short: 'Wildling',
    words: 'We Kneel to No One',
    colour: '#6a5a48', accent: '#c8d8e8',
    rivals: ['nightswatch'], allies: [],
    sworn: 'You kneel to no one now. Nobody will thank you for it.',
  },
};

export const HOUSE_IDS = Object.keys(HOUSES);

/** The houses you may swear to at the start, in the order they are offered. */
export const SWEARABLE = ['stark', 'lannister', 'tully', 'targaryen', 'greyjoy'];

/**
 * Which house a person on the road belongs to, read from how they are dressed.
 * Outlaws and hedge knights answer to nobody, and killing them costs you
 * nothing with anyone.
 */
export const SPRITE_HOUSE = {
  stark: 'stark', starkLady: 'stark',
  lannister: 'lannister', cersei: 'lannister', mountain: 'lannister',
  tully: 'tully', tullyLady: 'tully',
  baratheon: 'baratheon',
  tyrell: 'tyrell',
  martell: 'martell',
  arryn: 'arryn',
  ironborn: 'greyjoy',
  targaryen: 'targaryen', unsullied: 'targaryen',
  bolton: 'bolton',
  nightswatch: 'nightswatch',
  wildling: 'freefolk', wildlingWoman: 'freefolk',
};

export const MIN_STANDING = -100;
export const MAX_STANDING = 100;

/** A word for where you stand, used everywhere standing is shown or checked. */
export function standingBand(value) {
  if (value >= 60) return 'sworn';
  if (value >= 25) return 'friendly';
  if (value > -25) return 'neutral';
  if (value > -60) return 'wary';
  return 'hostile';
}

export const BAND_LABEL = {
  sworn: 'Sworn',
  friendly: 'Friendly',
  neutral: 'Neutral',
  wary: 'Wary',
  hostile: 'Hostile',
};

export const BAND_COLOUR = {
  sworn: '#78d858',
  friendly: '#a8d868',
  neutral: '#d8d8c8',
  wary: '#f0c840',
  hostile: '#f07050',
};

export function house(id) {
  const found = HOUSES[id];
  if (!found) throw new Error(`Unknown house: ${id}`);
  return { id, ...found };
}

/**
 * Who holds each region. Standing with the house that holds the ground you are
 * standing on is what a merchant there is reading when they name a price.
 */
export const REGION_HOUSE = {
  'The North': 'stark',
  'The Neck': 'stark',
  'The Wall': 'nightswatch',
  'Beyond the Wall': 'freefolk',
  'The Riverlands': 'tully',
  'The Vale': 'arryn',
  'The Westerlands': 'lannister',
  'The Reach': 'tyrell',
  'Dorne': 'martell',
  'The Stormlands': 'baratheon',
  'The Crownlands': 'lannister',
  'Dragonstone': 'targaryen',
  // Across the Narrow Sea nobody cares which Westerosi banner you carry, which
  // is most of the reason to go: no house holds this ground, so no house prices
  // it either.
  'Braavos': null,
  'Pentos': null,
  'Volantis': null,
  'Meereen': null,
  'The Narrow Sea': null,
};

/**
 * What a house's opinion does to a price. Being hated is expensive; being sworn
 * to the people who hold the town gets you their rate.
 */
export const PRICE_FACTOR = {
  sworn: 0.8,
  friendly: 0.9,
  neutral: 1,
  wary: 1.15,
  hostile: 1.35,
};
