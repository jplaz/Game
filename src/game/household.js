// Your household: the swords that follow you, who you marry, and the children
// of that marriage.
//
// Three things the game talked about and never had.
//
// The sworn swords are the plainest gap. data/regard.js has lines for two,
// four and six swords at your back — they have been written since the world
// was, and no browser build could ever make one of them true, because there
// was nowhere to put a person you had beaten except in the ground or back on
// the road. Beating somebody offered you exactly two answers: spare them, or
// finish it.
//
// The marriage is the larger one. The petitions talk about marriage alliances,
// the styles talk about a household, and neither the browser nor the cartridge
// had a spouse, a betrothal or a child anywhere in them.

import { game, changeStanding, standing } from './state.js';

const MAX_SWORN = 6;

/** The household record, made on demand so old saves grow one. */
export function household() {
  const s = game.state;
  s.household = s.household ?? {};
  s.household.sworn = s.household.sworn ?? [];
  s.household.children = s.household.children ?? [];
  s.household.spouse = s.household.spouse ?? null;
  s.household.betrothed = s.household.betrothed ?? null;
  return s.household;
}

// ------------------------------------------------------------- the swords --

export function sworn() {
  return household().sworn;
}

export function hostSize() {
  return sworn().length;
}

export function swornFull() {
  return sworn().length >= MAX_SWORN;
}

export function hasSworn(id) {
  return sworn().some((s) => s.id === id);
}

/**
 * Takes somebody you have beaten into your service. Returns 'taken', 'full' or
 * 'already'. Their house holds it against you a little — you have taken one of
 * theirs — but far less than killing them would.
 */
export function takeIntoService(def, id) {
  if (hasSworn(id)) return 'already';
  if (swornFull()) return 'full';
  sworn().push({
    id,
    name: def.name,
    sprite: def.sprite ?? 'sellsword',
    level: def.level ?? 1,
    house: def.house ?? null,
  });
  if (def.house) changeStanding(def.house, -6);
  return 'taken';
}

export function dismissSworn(id) {
  const list = sworn();
  const at = list.findIndex((s) => s.id === id);
  if (at >= 0) list.splice(at, 1);
}

/**
 * What the household adds to you in a fight. Deliberately small and flat: six
 * swords should be worth having and should not turn every duel into a
 * formality, because the duel is the game.
 */
export function hostBonus() {
  return { might: hostSize(), guard: Math.floor(hostSize() / 2) };
}

// ------------------------------------------------------------ the marriage --

export function spouse() {
  return household().spouse;
}

export function betrothed() {
  return household().betrothed;
}

export function isMarried() {
  return Boolean(household().spouse);
}

/**
 * Whether a match will hear a proposal at all. Nobody marries a stranger, and
 * nobody marries into a house that despises them — but nothing here asks
 * whether you hold a seat, because a landless sword marrying up is a story
 * this setting tells constantly.
 */
export function willHear(match) {
  if (isMarried()) return 'married';
  if (betrothed()) return 'betrothed';
  if (standing(match.house) < match.needs) return 'standing';
  if (game.state.player.money < match.price) return 'poor';
  return 'yes';
}

/** Agrees the match. The wedding itself is a separate visit. */
export function betroth(match) {
  const answer = willHear(match);
  if (answer !== 'yes') return answer;
  game.state.player.money -= match.price;
  household().betrothed = { id: match.id, name: match.name, house: match.house };
  changeStanding(match.house, 14);
  return 'yes';
}

/** The wedding. Turns a betrothal into a marriage. */
export function wed() {
  const b = betrothed();
  if (!b) return false;
  household().spouse = { ...b, since: game.state.player.steps ?? 0 };
  household().betrothed = null;
  changeStanding(b.house, 10);
  return true;
}

// ------------------------------------------------------------ the children --

/** Steps between one child and the next being possible. */
const CHILD_STEPS = 1600;

const BOY_NAMES = ['Edric', 'Domeric', 'Cregan', 'Torrhen', 'Willem', 'Beron',
  'Artos', 'Harrold', 'Lucas', 'Rickard'];
const GIRL_NAMES = ['Alys', 'Meera', 'Jeyne', 'Wylla', 'Barbrey', 'Elenei',
  'Serena', 'Alysanne', 'Joanna', 'Lyra'];

/** Whether the marriage is due another child yet. */
export function childDue() {
  if (!isMarried()) return false;
  const h = household();
  const since = h.lastChild ?? h.spouse.since ?? 0;
  return ((game.state.player.steps ?? 0) - since) >= CHILD_STEPS;
}

/**
 * A child is born. Returns the child, or null if none was due. The name is
 * drawn from the list unless the caller supplies one — the scripts let you
 * name your own.
 */
export function bearChild(name = null) {
  if (!childDue()) return null;
  const h = household();
  const boy = Math.random() < 0.5;
  const pool = boy ? BOY_NAMES : GIRL_NAMES;
  const taken = new Set(h.children.map((c) => c.name));
  const free = pool.filter((n) => !taken.has(n));
  const child = {
    name: name || (free.length ? free[Math.floor(Math.random() * free.length)]
                               : pool[Math.floor(Math.random() * pool.length)]),
    boy,
    born: game.state.player.steps ?? 0,
  };
  h.children.push(child);
  h.lastChild = child.born;
  return child;
}

export function children() {
  return household().children;
}

/** Your heir: the eldest child, if there is one. */
export function heir() {
  const list = children();
  if (!list.length) return null;
  return list.reduce((a, b) => (a.born <= b.born ? a : b));
}

/**
 * How old a child is, in the game's own units. A child born a thousand steps
 * ago is a baby; one born fifteen thousand steps ago is old enough to be sent
 * somewhere as a ward.
 */
export function ageOf(child) {
  return (game.state.player.steps ?? 0) - child.born;
}

export function ageWord(child) {
  const age = ageOf(child);
  if (age < 2000) return 'in arms';
  if (age < 6000) return 'walking';
  if (age < 12000) return 'half-grown';
  return 'grown';
}
