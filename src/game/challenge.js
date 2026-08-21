// Calling somebody out.
//
// Anyone standing in the world can be fought. Some of them are already written
// as fighters — trainers, duellists, companions — and those fight as they are
// written. Everybody else gets built on the spot from how they are dressed and
// what they do, so a shopkeeper defends their counter rather than being
// unfightable for want of a stat block.

import { flag, isDead, standing } from './state.js';
import { TRAINERS, trainerAsDuellist } from '../data/trainers.js';
import { DUELLISTS, duellist, makeRoamer, ROAMERS } from '../data/duellists.js';
import { COMPANIONS } from '../data/companions.js';
import { SPRITE_HOUSE } from '../data/houses.js';
import { rng } from '../engine/rng.js';
import { game } from './state.js';

/** What an ordinary person of this sort fights like, if they must. */
const BYSTANDER_ROLE = {
  guard: 'manAtArms',
  stark: 'manAtArms',
  lannister: 'goldCloak',
  tully: 'manAtArms',
  baratheon: 'manAtArms',
  tyrell: 'manAtArms',
  arryn: 'hedgeKnight',
  martell: 'dornishOutrider',
  bolton: 'manAtArms',
  ironborn: 'ironbornReaver',
  nightswatch: 'deserter',
  wildling: 'wildlingRaider',
  wildlingWoman: 'spearwife',
  kingsguard: 'hedgeKnight',
  unsullied: 'manAtArms',
  sellsword: 'sellsword',
  brotherhood: 'brotherhoodBowman',
  braavosi: 'sellsword',
  smallfolk: 'bandit',
  goodwife: 'bandit',
  merchant: 'bandit',
  oldman: 'gravedigger',
  noble: 'hedgeKnight',
  brienne: 'hedgeKnight',
  mountain: 'wildlingRaider',
  hound: 'sellsword',
  rival: 'manAtArms',
  targaryen: 'manAtArms',
  redPriest: 'redPriestess',
  cersei: 'goldCloak',
  starkLady: 'spearwife',
  tullyLady: 'spearwife',
  heroine: 'sellsword',
  hero: 'sellsword',
};

/** Nobody expects a child or a maester to draw on you, and they will not. */
const WILL_NOT_FIGHT = new Set(['child', 'girl', 'septa', 'maester', 'whitewalker']);

/**
 * What happens if you call this person out. Returns null when they simply will
 * not fight, or { duellist, house, alreadyBeaten } when they will.
 */
export function challengeFor(npc) {
  const sprite = npc.sprite;
  if (WILL_NOT_FIGHT.has(sprite)) return null;

  // Somebody already written as a fight.
  const trainerId = npc.data?.trainer;
  if (trainerId && TRAINERS[trainerId]) {
    const built = trainerAsDuellist(trainerId);
    return {
      duellist: built,
      house: built.house,
      eager: true,
      alreadyBeaten: flag(`trainer_${trainerId}`) || isDead(`trainer_${trainerId}`),
    };
  }

  const duelId = npc.data?.duel;
  if (duelId && DUELLISTS[duelId]) {
    const built = duellist(duelId);
    return {
      duellist: { ...built, mortal: built.mortal ?? !built.boss },
      house: built.house,
      eager: true,
      alreadyBeaten: flag(`duel_${duelId}`) || isDead(`duel_${duelId}`),
    };
  }

  // A companion you could have travelling with you. Fighting them is possible
  // and a poor idea; they fight as they are written.
  const companionId = npc.data?.companion;
  if (companionId && COMPANIONS[companionId]) {
    const def = COMPANIONS[companionId];
    return {
      duellist: {
        id: `companion_${companionId}`,
        name: def.name,
        sprite: def.sprite,
        house: def.house,
        level: def.level,
        vigour: def.vigour, might: def.might, guard: def.guard,
        swiftness: 10 + def.level * 2, wind: 12 + def.level,
        techniques: ['slash', 'riposte', 'guard'],
        reward: 0,
        exp: def.level * 18,
        canYield: true,
        mortal: true,
        intro: `${def.name}: You are sure about this? Say so plainly, then.`,
        defeat: `${def.name}: Enough. You have made whatever point that was.`,
        after: `${def.name}: We will not speak of it.`,
      },
      house: def.house,
      alreadyBeaten: false,
    };
  }

  // Anybody else. They fight like the sort of person they look like, at a level
  // that keeps up with you rather than one written in advance.
  const role = BYSTANDER_ROLE[sprite];
  if (!role || !ROAMERS[role]) return null;

  const level = Math.max(2, Math.min(50, (game.state.player.level ?? 1) + rng.int(-2, 2)));
  const built = makeRoamer(role, level, (list) => list[0]);
  built.name = npc.name ?? built.name;
  built.house = SPRITE_HOUSE[sprite] ?? built.house;
  built.mortal = true;
  built.intro = `${built.name}: You are calling me out? Here? Fine.`;
  built.defeat = `${built.name}: All right. All right! You have made your point.`;
  built.after = `${built.name}: Keep away from me.`;
  return { duellist: built, house: built.house, alreadyBeaten: false };
}

/** Whether calling this person out would be seen as an outrage by their house. */
export function challengeCost(houseId) {
  if (!houseId) return 0;
  return standing(houseId) > 25 ? -10 : -4;
}
