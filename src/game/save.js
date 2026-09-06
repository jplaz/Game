// Save data lives in localStorage. The state object is already plain JSON, so
// saving is a stringify — the only care needed is around a corrupt or
// older-format blob, which we discard rather than crash on.

import { game, setState, newGame } from './state.js';

const KEY = 'asoiam.save.v1';

export function hasSave() {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function saveGame() {
  try {
    localStorage.setItem(KEY, JSON.stringify(game.state));
    return true;
  } catch (err) {
    console.warn('Could not save:', err);
    return false;
  }
}

// ---------------------------------------------------------------- keeping --
//
// Saving worked and almost nothing used it.
//
// You could only write your progress down by opening the menu and choosing
// SAVE, or by taking a bed at an inn. Close the tab anywhere else — on a road,
// mid-quest, after an hour — and the hour was gone. The mechanism was fine;
// there was simply no path from a normal evening's play to it, which from
// where the player sits is the same thing as saving being broken.
//
// So the game keeps itself: whenever you arrive somewhere, and whenever the
// page goes away. One slot, the same one the menu writes, so nothing has to be
// chosen or managed.

/* Nothing is written until the world is actually up. The title screen has no
   game in it yet, and saving there would write a half-made state over a real
   one. */
let playing = false;

/** The world is up. Called by the overworld when it takes the screen. */
export function nowPlaying() {
  playing = true;
}

/**
 * Keeps the game without saying so. Safe to call often: it is a stringify of
 * about a kilobyte and a half, and it is never allowed to throw at a caller
 * who was doing something else.
 *
 * @returns {boolean} whether anything was written
 */
export function keep() {
  if (!playing) return false;
  return saveGame();
}

/* And the one that matters most: the tab closing, the phone locking, the
   browser being switched away from. `pagehide` is the event that actually
   fires on mobile Safari, where `beforeunload` does not. */
export function keepOnLeaving(target = globalThis) {
  if (!target?.addEventListener) return;
  const write = () => { keep(); };
  target.addEventListener('pagehide', write);
  target.addEventListener('beforeunload', write);
  target.addEventListener('visibilitychange', () => {
    if (globalThis.document?.visibilityState === 'hidden') write();
  });
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.party)) {
      console.warn('Save file is not readable; ignoring it.');
      return false;
    }
    // Merge over a fresh state so a save written by an older build still boots.
    setState({ ...newGame(parsed.player?.name ?? 'Snow'), ...parsed });
    return true;
  } catch (err) {
    console.warn('Could not load:', err);
    return false;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing to do */ }
}

/** Peeks at the save for the continue screen without loading it. */
export function saveSummary() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      name: parsed.player?.name ?? 'Snow',
      sigils: parsed.sigils?.length ?? 0,
      party: parsed.party?.length ?? 0,
      playtime: parsed.player?.playtime ?? 0,
      caught: Object.keys(parsed.dex?.caught ?? {}).length,
    };
  } catch {
    return null;
  }
}
