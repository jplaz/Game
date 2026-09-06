// Children of the evening.
//
// Every town in this world has a house with a red lamp over the door, and this
// build has had one since the towns were laid out: you pay, you sleep, you get
// your health back and a rumour. That is an inn with a different sign on it.
//
// The cartridge has the rest of it. Some while later word comes — or it does
// not, and you never hear anything at all, which is also how these things went
// — and from then on there is somebody in that town growing up with your chin
// and a bastard's name. Grown, they will take your service, because they have
// your blood and nobody else is offering them anything.
//
// Named the way Westeros names them: by where they were born rather than by
// who fathered them. The surname does all the work — a Snow in a Winterfell
// common house and a Sand in a Shadow City one are different sentences.

import { game } from './state.js';
import { MAPS, REGIONS } from '../data/maps.js';
import { REGION_HOUSE } from '../data/houses.js';
import { takeIntoService, swornFull } from './household.js';

/**
 * Fights won between born and old enough to swear.
 *
 * The cartridge counts every mortal foe put down, and a run there gets through
 * hundreds. This build only counts a kill when you choose to finish somebody,
 * which is rare enough that a clock built on it would never come round — so
 * the clock here is fights won, and the number is set to land about two thirds
 * of the way up the ladder rather than after it.
 */
export const BASTARD_GROWN = 25;

/** How many you can have, ever. */
const MOST = 3;

const SURNAME = {
  stark: 'Snow',        // the North
  tully: 'Rivers',      // the Riverlands
  arryn: 'Stone',       // the Vale
  tyrell: 'Flowers',    // the Reach
  lannister: 'Hill',    // the Westerlands
  martell: 'Sand',      // Dorne
  baratheon: 'Storm',   // the Stormlands
  greyjoy: 'Pyke',      // the Iron Islands
  targaryen: 'Waters',  // the Crownlands, and anywhere nobody holds
};

const FIRST = ['Edric', 'Mya', 'Gendry', 'Bella', 'Cotter', 'Alys', 'Joss', 'Sarra'];

/** The surname a child born on this ground carries. */
export function surnameHere(mapId) {
  return SURNAME[REGION_HOUSE[REGIONS[mapId] ?? ''] ?? ''] ?? 'Waters';
}

/** The list, made on demand so an older save grows one. */
export function bastards() {
  const s = game.state;
  s.bastards = s.bastards ?? [];
  return s.bastards;
}

/* A letter, held until the screen is clear — the same terms as the raven. */
let letter = null;

/** The letter you are owed, taken once. */
export function takeLetter() {
  const said = letter;
  letter = null;
  return said;
}

/** Forgets any letter in flight — a new game or a load starts quiet. */
export function clearLetter() {
  letter = null;
}

/**
 * An evening bought. Word comes some fights later, or it does not.
 *
 * @param {string} mapId where you spent it
 */
export function spendTheEvening(mapId, roll = Math.random) {
  const p = game.state.player;
  p.eveMap = mapId;
  p.eveAt = 24 + Math.floor(roll() * 16);
}

/** Which of yours, if any, is growing up in this town. Newest first, so the
    keeper talks about the child you have not met rather than one you took. */
export function bastardHere(mapId) {
  const list = bastards();
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].taken && list[i].map === mapId) return list[i];
  }
  return null;
}

/** Old enough to hold something sharper than a spoon. */
export function grown(kid) {
  return (game.state.player.fightsWon ?? 0) - kid.born >= BASTARD_GROWN;
}

/** One tick per fight won, the same clock everything else runs on. */
export function bastardAfterWin(roll = Math.random) {
  const p = game.state.player;
  p.fightsWon = (p.fightsWon ?? 0) + 1;
  if (!p.eveAt) return;
  p.eveAt--;
  if (p.eveAt > 0) return;
  /* Word comes, or it does not, and you never hear anything at all. */
  if (roll() < 0.55 || bastards().length >= MOST) return;

  const at = p.eveMap;
  const first = FIRST[Math.floor(roll() * FIRST.length) % FIRST.length];
  const surname = surnameHere(at);
  bastards().push({ map: at, born: p.fightsWon, first, surname, taken: false });
  letter = `A letter, unsigned, from ${MAPS[at]?.name ?? at}: a child was born `
    + 'at the house with the red lamp, and the mother says there is no doubt '
    + `whose. They are calling the babe ${first} ${surname}.`;
}

/**
 * Takes a grown one into your service. Returns 'taken', 'full' or 'already'.
 */
export function takeBastard(kid) {
  if (!kid || kid.taken) return 'already';
  if (swornFull()) return 'full';
  const p = game.state.player;
  /* No house standing moves for this one: they are not somebody's man you have
     taken away, they are yours and everybody in the town already knew it. */
  takeIntoService({
    name: `${kid.first} ${kid.surname}`,
    sprite: 'sellsword',
    level: p.level > 8 ? p.level - 4 : 4,
    house: null,
  }, `bastard_${kid.map}_${kid.born}`);
  kid.taken = true;
  return 'taken';
}
