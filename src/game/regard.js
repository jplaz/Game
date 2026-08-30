// Choosing what somebody notices about you.
//
// data/regard.js has been sitting in the repository being read by exactly one
// thing: the cartridge exporter. Nothing in src/ ever imported it, so in the
// browser build every person in the world said their one line at you forever,
// whether you had walked in off the road that morning or were carrying nine
// seats and six swords.
//
// The rule is the cartridge's rule, kept deliberately identical so the two
// builds behave the same: walk the whole list, keep the LAST entry that fits,
// so the specific beats the general. And it does not fire every time — a
// remark somebody makes about you now and then reads as being noticed; the
// same remark on every conversation reads as a label stapled to your chest.

import { game, sigilCount, flag, choice } from './state.js';
import { REGARD } from '../data/regard.js';
import { activeCompanion } from './company.js';

/**
 * How many sworn swords are at your back. The retinue is a cartridge feature —
 * main.c keeps a host, the browser keeps one companion — so in this build the
 * count is nought or one, and the REGARD lines that want two or more simply
 * never fire here. That is the honest answer rather than inventing a number to
 * unlock lines the browser cannot make true.
 */
function hostSize() {
  return activeCompanion() ? 1 : 0;
}

/** How many people you have put in the ground. */
function killCount() {
  return (game.state.dead ?? []).length;
}

/**
 * The line this person would add, or null. Pass `always` to skip the dice —
 * used by the places that have decided they want it, like a lord's first
 * greeting.
 */
export function regardLine({ always = false } = {}) {
  // Roughly one conversation in three carries a remark. Often enough to feel
  // like the world is keeping score; rare enough that it stays a remark.
  if (!always && Math.random() > 0.34) return null;

  const sigils = sigilCount();
  const host = hostSize();
  const kills = killCount();

  let best = null;
  for (const r of REGARD) {
    if ((r.sigils ?? 0) > sigils) continue;
    if ((r.host ?? 0) > host) continue;
    if ((r.kills ?? 0) > kills) continue;
    if (r.needs && !flag(r.needs)) continue;
    if (r.unless && flag(r.unless)) continue;
    best = r;                       // last one that fits wins
  }
  return best?.line ?? null;
}

/**
 * What people remember you deciding. The quest answers were already being
 * written into state.choices and then never read by anybody except the quest
 * that wrote them, so a decision that was supposed to cost you something
 * socially cost you nothing at all once you had walked out of the room.
 *
 * Each entry is [quest, answer, what people say about it afterwards].
 */
const REMEMBERED = [
  ['hangingTree', 'saved', 'They mention the crossroads, and the three men who are not hanging at it.'],
  ['hangingTree', 'paid', 'Somebody paid a lord eight hundred gold for one pig. They think that is very funny.'],
  ['hangingTree', 'ignored', 'They do not bring up the hanging tree. They think about it, though.'],
  ['brokenTower', 'burned', 'The tower went up and they still argue about whether it needed to.'],
  ['maestersDebt', 'fought', 'You drew on men collecting for the Citadel. That story has legs on it.'],
  ['deserterAtTheGate', 'freed', 'You let the crow go. Half of them think you a fool and the other half do not say.'],
  ['deserterAtTheGate', 'returned', 'You walked a man back to the block. They are careful with you.'],
  ['saltWivesOfPyke', 'freed', 'A woman got off Pyke on somebody else\'s coin. The islands have not forgotten who.'],
  ['saltWivesOfPyke', 'refused', 'You left her where she was because it was their law. They heard.'],
  ['theGrainCount', 'north', 'You stood in Highgarden\'s hall and said where the grain had gone. That travelled.'],
  ['theGrainCount', 'named', 'A man lost his hand over four hundred bushels and they know who named him.'],
  ['theDornishHostage', 'freed', 'The Lannister boy went east instead of home, and somebody told him he could.'],
  ['theBastardsLetter', 'burned', 'A raven never left, and a village is still standing. The Dreadfort is counting.'],
  ['theBastardsLetter', 'sent', 'The raven went. They have worked out who let it.'],
  ['theSellswordsWage', 'paid', 'You paid another man\'s army out of your own purse. Nobody can decide what that makes you.'],
  ['theSellswordsWage', 'warned', 'A town shut its gates in time because somebody rode ahead of the company.'],
];

/** A line about something you decided, or null. Rarer than plain regard. */
export function memoryLine() {
  if (Math.random() > 0.22) return null;
  const carried = REMEMBERED.filter(([q, a]) => choice(q) === a);
  if (!carried.length) return null;
  return carried[Math.floor(Math.random() * carried.length)][2];
}

/**
 * What this person adds after their own line, if anything. At most one remark:
 * two in a row stops being someone noticing you and becomes a dossier.
 */
export function asideFor() {
  return memoryLine() ?? regardLine();
}
