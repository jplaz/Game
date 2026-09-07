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
    /* The Vale sat out every war it could, which is not the same as having no
       enemies: the Lannisters killed the Hand who came from here and the
       mountain clans have been raiding down out of the Mountains of the Moon
       for three hundred years. A house with nobody to be wary of makes
       swearing to them a choice with no consequences at all. */
    rivals: ['lannister', 'greyjoy'], allies: ['stark', 'tully'],
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
export const SWEARABLE = ['stark', 'tully', 'arryn', 'tyrell', 'lannister',
                          'martell', 'baratheon', 'targaryen', 'greyjoy'];

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
/* ------------------------------------------------------- where you begin ---
 *
 * The nine seats, and the people standing in them when you wake up.
 *
 * These coordinates lived in gba/export.mjs and nowhere else, which meant the
 * cartridge did what the game says it does — swear to a house and begin at its
 * seat — and this build did not. Here you were put in a chamber in Winterfell
 * whichever banner you had just named, and told by Maester Luwin that Lord
 * Rickard wanted a rider, handed a scroll naming you Winterfell's rider, and
 * sent to earn the Wolf Sigil. Swear to Martell and the opening still called
 * you a Stark: the largest choice in the game, made in its first two minutes,
 * changed a colour and nothing else.
 *
 * So it is one table now, read by the exporter and by the opening alike, and
 * it carries the story as well as the coordinates: whose maester wakes you,
 * whose lord wants a rider, which sigil is theirs to give, and where they
 * point you when you leave.
 *
 * The coordinates are load-bearing and nothing else in the build checks them —
 * redraw a seat and three houses start the game standing inside a wall. See
 * tools/checkstarts.mjs.
 */
export const HOUSE_SEATS = {
  stark: {
    map: 'winterfell', x: 12, y: 12, dir: 0, level: 5,
    maester: 'Maester Luwin', lord: 'Lord Eddard', sigil: 'wolf',
    keep: 'the Great Keep', next: 'Moat Cailin first, and Riverrun beyond it',
  },
  lannister: {
    map: 'lannisport', x: 9, y: 15, dir: 0, level: 5,
    maester: 'Maester Creylen', lord: 'Ser Jaime', sigil: 'lion',
    keep: 'Casterly Rock', next: 'the gold road east, and the capital past it',
  },
  tully: {
    map: 'riverrun', x: 10, y: 17, dir: 1, level: 5,
    maester: 'Maester Vyman', lord: 'Lady Catelyn', sigil: 'trout',
    keep: 'the keep above the water gate', next: 'the crossroads, and whichever road you like from there',
  },
  targaryen: {
    map: 'dragonstone', x: 11, y: 18, dir: 1, level: 5,
    maester: 'Maester Cressen', lord: 'the Queen across the water', sigil: 'dragon',
    keep: 'the Painted Table', next: 'a ship, and the Crownlands shore',
  },
  greyjoy: {
    map: 'pyke', x: 11, y: 12, dir: 1, level: 5,
    maester: 'Maester Wendamyr', lord: 'Yara', sigil: 'kraken',
    keep: 'the sea tower', next: 'the iron coast, and the mainland beyond it',
  },
  arryn: {
    map: 'theEyrie', x: 11, y: 5, dir: 0, level: 5,
    maester: 'Maester Colemon', lord: 'Bronze Yohn', sigil: 'falcon',
    keep: 'the high hall', next: 'the Bloody Gate, and down out of the mountains',
  },
  tyrell: {
    map: 'highgarden', x: 11, y: 14, dir: 0, level: 5,
    maester: 'Maester Lomys', lord: 'Lord Randyll', sigil: 'rose',
    keep: 'the keep', next: 'the roseroad, and King\'s Landing at the end of it',
  },
  martell: {
    map: 'sunspear', x: 14, y: 9, dir: 0, level: 5,
    maester: 'Maester Caleotte', lord: 'Prince Oberyn', sigil: 'viper',
    keep: 'the Tower of the Sun', next: 'the Prince\'s Pass, and the Reach on the far side',
  },
  baratheon: {
    map: 'stormsEnd', x: 11, y: 17, dir: 0, level: 5,
    maester: 'Maester Jurne', lord: 'Stannis', sigil: 'stag',
    keep: 'the drum tower', next: 'the stormlands road, and the kingsroad past it',
  },
};

/** Where a house's rider wakes up, with Winterfell as the last resort. */
export function seatOf(houseId) {
  return HOUSE_SEATS[houseId] ?? HOUSE_SEATS.stark;
}

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
  /* Thirteen maps sat in the Iron Islands and this table did not mention them,
     so Pyke - a great house's own seat - was unheld ground: no house priced
     it, no standing applied on it, and nobody born there carried a name. */
  'The Iron Islands': 'greyjoy',
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
