// Owning the places in data/properties.js.
//
// Deliberately does not consult allegiance, title, sigils or the household.
// Owning a room over a pot-shop is a matter of nine hundred gold and nothing
// else, and staying landless is a way to play the game rather than a failure
// state to be locked out of content for.

import { game, formatMoney } from './state.js';
import { PROPERTIES } from '../data/properties.js';

/** Every deed you hold, oldest first. */
export function deeds() {
  return game.state.properties ?? [];
}

export function ownsProperty(id) {
  return deeds().includes(id);
}

export function ownsAnyProperty() {
  return deeds().length > 0;
}

/**
 * Buys a deed. Returns 'bought', 'already' or 'poor' rather than throwing, so
 * the calling script can say the right thing without repeating the arithmetic.
 */
export function buyProperty(id) {
  const def = PROPERTIES[id];
  if (!def) throw new Error(`Unknown property: ${id}`);
  if (ownsProperty(id)) return 'already';
  if (game.state.player.money < def.price) return 'poor';

  game.state.player.money -= def.price;
  if (!game.state.properties) game.state.properties = [];
  game.state.properties.push(id);
  // Rent starts accruing from the moment the deed changes hands, not from the
  // start of the game — otherwise the first night in a counting-house pays out
  // for every step you ever took before you owned it.
  if (!game.state.rentFrom) game.state.rentFrom = {};
  game.state.rentFrom[id] = game.state.player.steps ?? 0;
  return 'bought';
}

/**
 * What a property has earned since you last slept in it. Rent is per thousand
 * steps walked, so it rewards going away and doing something rather than
 * standing in the doorway pressing A.
 */
export function rentDue(id) {
  const def = PROPERTIES[id];
  if (!def?.rent || !ownsProperty(id)) return 0;
  const since = game.state.rentFrom?.[id] ?? 0;
  const walked = Math.max(0, (game.state.player.steps ?? 0) - since);
  return Math.floor((walked / 1000) * def.rent);
}

/** Takes the rent and resets the clock. Returns what was collected. */
export function collectRent(id) {
  const due = rentDue(id);
  if (due > 0) game.state.player.money += due;
  if (!game.state.rentFrom) game.state.rentFrom = {};
  game.state.rentFrom[id] = game.state.player.steps ?? 0;
  return due;
}

/** The line a steward says when handing over the takings. */
export function rentLine(id, amount) {
  if (amount <= 0) return null;
  return `Your steward has been keeping the books. ${formatMoney(amount)} is yours.`;
}
