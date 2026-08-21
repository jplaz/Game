// The quest log: what you have been asked to do, and what you decided.
//
// A quest is open once you have been told about it and closed once you have
// answered it. Closed entries keep the answer, because the point of these is
// that you can look back at what you chose.

import { game } from './state.js';
import { QUESTS } from '../data/quests.js';

export function questLog() {
  game.state.quests = game.state.quests ?? { open: [], closed: {} };
  return game.state.quests;
}

export function openQuest(id) {
  const log = questLog();
  if (log.closed[id] || log.open.includes(id)) return false;
  log.open.push(id);
  return true;
}

export function isOpen(id) {
  return questLog().open.includes(id);
}

export function isClosed(id) {
  return Boolean(questLog().closed[id]);
}

/** Closes a quest with the label of the option you took. */
export function closeQuest(id, answer) {
  const log = questLog();
  const index = log.open.indexOf(id);
  if (index >= 0) log.open.splice(index, 1);
  log.closed[id] = answer;
}

/** Everything for the log page: open first, then what you settled and how. */
export function questEntries() {
  const log = questLog();
  const open = log.open.map((id) => ({
    id, name: QUESTS[id].name, region: QUESTS[id].region,
    text: QUESTS[id].open, done: false,
  }));
  const closed = Object.entries(log.closed).map(([id, answer]) => ({
    id, name: QUESTS[id].name, region: QUESTS[id].region,
    text: answer, done: true,
  }));
  return [...open, ...closed];
}

export function questCounts() {
  const log = questLog();
  return { open: log.open.length, done: Object.keys(log.closed).length };
}
