// What time it is.
//
// The game had no clock at all: every town stood in the same permanent
// mid-morning from the first step to the last, and the smith was at his anvil
// at what would have been three in the morning because there was no three in
// the morning for him to not be at it.
//
// Time runs off steps walked rather than seconds elapsed, for two reasons. It
// does not pass while the game sits paused on a menu, so nobody loses a
// shopkeeper to a bathroom break; and it is already in the save record, so a
// clock built on it survives being put down and picked up a week later.

import { game } from './state.js';

/** Steps in a full turn of the day. About twenty minutes of ordinary walking. */
export const DAY_STEPS = 900;

/** Where we are in the day, 0 at first light and 1 at the next first light. */
export function dayFraction() {
  const steps = game.state.player?.steps ?? 0;
  return (steps % DAY_STEPS) / DAY_STEPS;
}

/**
 * The four parts of the day. Kept deliberately coarse: a cartridge that draws
 * eight-by-eight tiles cannot show the difference between half four and five,
 * and a schedule anybody can predict is worth more than one that is precise.
 */
export function dayPhase() {
  const f = dayFraction();
  if (f < 0.10) return 'dawn';
  if (f < 0.55) return 'day';
  if (f < 0.70) return 'dusk';
  return 'night';
}

export function isNight() {
  const p = dayPhase();
  return p === 'night' || p === 'dusk';
}

/** What the day is called, for anybody who wants to say it out loud. */
export function phaseName() {
  return { dawn: 'first light', day: 'daylight', dusk: 'dusk', night: 'night' }[dayPhase()];
}

/**
 * Whether somebody who keeps the given hours is about right now. `abroad` is
 * 'day' for people who work in daylight and go in when it gets dark, 'night'
 * for the ones who only come out once it has. Anything else is always there.
 */
export function aboutNow(abroad) {
  if (!abroad) return true;
  if (abroad === 'day') return !isNight();
  if (abroad === 'night') return isNight();
  return true;
}
