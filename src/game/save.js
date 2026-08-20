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
