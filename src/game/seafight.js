// A fight between two ships, which is not a fight between two people.
//
// The whole of it lives here rather than in data/scripts.js because it is a
// loop with arithmetic in it, and a script file should read like something
// somebody says. What scripts.js gets is one call.
//
// The shape of a sea fight:
//
//   You are found. You may run, stand off and trade rams, or go straight in
//   and board. Standing off is the safe half of the fight — hulls only — and
//   boarding is where it stops being about the ship and starts being about
//   whoever is holding the rail. A hull that reaches nothing goes down, and if
//   it is yours you lose the ship and half of what was in her hold.
//
// Nothing here asks your title. The sea does not care.

import { FLEETS } from '../data/ships.js';
import {
  ship, shipDef, shipName, condition, conditionWord, damageShip,
  exchange, taken, sink, shipStrength, fleetStrength,
} from './ship.js';
import { formatMoney } from './state.js';

/** Whether you could get away, and how likely. Oars beat weight. */
function outrun(fleetId) {
  const mine = shipDef();
  const f = FLEETS[fleetId];
  if (!mine || !f) return 1;
  /* A holed ship does not run well, and a heavy one never did. Draught stands
     in for how shallow you can go to shake somebody off. */
  const edge = (mine.draught <= 1 ? 0.25 : 0) + 0.35 * condition();
  const gap = (shipStrength() - fleetStrength(fleetId)) / 200;
  return Math.max(0.15, Math.min(0.9, 0.4 + edge + gap));
}

/**
 * Runs the whole encounter. `api` is the script api: say, choose, duel.
 * Returns 'fled', 'sunk-her', 'took-her', 'she-fled', 'sunk' or 'ashore'.
 */
export async function seaFight(api, fleetId) {
  const f = FLEETS[fleetId];
  const mine = shipDef();
  if (!f || !mine) return 'ashore';

  let enemyHull = f.hull;
  await api.say(f.hail);

  for (;;) {
    const s = ship();
    if (!s) return 'sunk';

    const choice = await api.choose(
      `${shipName()} is ${conditionWord()}. ${f.name} shows ${hullWord(enemyHull, f.hull)}.`,
      ['Stand off and trade', 'Go in and board', 'Come about and run']);

    // ------------------------------------------------------------- running --
    if (choice === 2) {
      if (Math.random() < outrun(fleetId)) {
        await api.say('You put the helm over and run for it. By the time they '
          + 'have their oars in time you are a sail on somebody else\'s horizon.');
        return 'fled';
      }
      /* Turning your stern to somebody with a ram is how ships are lost. */
      const hurt = Math.round(f.ram * (1.1 + Math.random() * 0.6));
      damageShip(hurt);
      await api.say(`They were waiting for that. She takes ${hurt} across the stern `
        + 'as you come about, and you are still here.');
      if ((ship()?.hull ?? 0) <= 0) return await goDown(api);
      continue;
    }

    // -------------------------------------------------------- trading rams --
    if (choice === 0) {
      const r = exchange(fleetId, enemyHull);
      if (!r) return 'ashore';
      enemyHull = r.enemyHull;
      await api.say(`You go in bow-first and take ${r.dealt} out of her. `
        + `She comes back and puts ${r.taken} into you.`);
      if (r.yours <= 0) return await goDown(api);
      if (enemyHull <= 0) {
        await api.say(`${f.name} opens along the waterline and goes down by the bow. `
          + 'Nobody aboard her is going to be picked up by you.');
        return 'sunk-her';
      }
      if (r.fled) {
        await api.say(`${f.name} has had enough. She turns and runs, low in the water, `
          + 'and you have better things to do than chase her.');
        return 'she-fled';
      }
      continue;
    }

    // ----------------------------------------------------------- boarding --
    /* Grapples across, and from here it is men rather than timber. Going in
       against a fresh hull with a small crew is how people die at sea; going in
       against one you have already opened up is how people get rich. */
    const odds = shipStrength() / (shipStrength() + fleetStrength(fleetId) * (enemyHull / f.hull));
    await api.say('Grapples across, and the rails come together with a noise you '
      + 'feel through the deck.');
    if (Math.random() > odds) {
      const hurt = Math.round(f.crew * (0.4 + Math.random() * 0.4));
      damageShip(hurt);
      await api.say('They come over first and in numbers. You get them back off '
        + `her, but she takes ${hurt} in the doing of it.`);
      if ((ship()?.hull ?? 0) <= 0) return await goDown(api);
      continue;
    }

    await api.say('Her deck is yours as far as the mast. Her captain is standing '
      + 'at the far end of it.');
    await api.duel(f.duel);
    const purse = taken(fleetId);
    await api.say(`${f.name} strikes. There is ${formatMoney(purse)} in her hold, `
      + 'and it is yours.');
    return 'took-her';
  }
}

function hullWord(left, max) {
  const c = left / max;
  if (c >= 0.95) return 'no damage at all';
  if (c >= 0.6) return 'a scarred bow';
  if (c >= 0.3) return 'a rail half gone';
  return 'water coming over her side';
}

async function goDown(api) {
  const name = shipName();
  const lost = sink();
  await api.say(`${name} goes down under you.`);
  await api.say('You come ashore on a spar, in the dark, with half your purse '
    + `at the bottom of the sea — ${formatMoney(lost)} gone — and your life, `
    + 'which the sea was under no obligation to leave you.');
  return 'sunk';
}
