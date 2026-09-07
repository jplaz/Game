// NPC behaviour. Every script is an async function so dialogue, choices,
// battles and shops can be written in a straight line.
//
// api: { subject, npc, overworld, say, choose, battle, openShop, healParty,
//        setFlag, flag }

import {
  game, party, addCreature, giveItem, hasItem, addMoney, canAfford,
  sigilCount, hasSigil, dexCounts, swearTo, allegiance, standing, 
  changeStanding, recordChoice, markDead, isDead, theDead, deepenWinter,
  ranging, takeRanging, handInRanging, seasonWord, deadReachWord,
} from '../game/state.js';
import {
  bastardHere, grown, takeBastard, spendTheEvening,
} from '../game/bastards.js';
import { HOUSES, SWEARABLE } from './houses.js';
import { giveEgg } from '../game/eggs.js';
import { beginReign, reigning } from '../game/realm.js';
import { QUESTS } from './quests.js';
import { PORTS } from './ports.js';
import { COMPANIES } from './companies.js';
import {
  holdfast, ownsHoldfast, FURNISHINGS, installed, install, seats, canCook,
  larder, INGREDIENTS, DISHES, canCookDish, cook as cookDish, dishCount,
  holdFeast, feastCount, grantHoldfast, placedAt, 
} from '../game/holdfast.js';
import { HOUSE_IDS } from './houses.js';
import { SHIPS, FLEETS } from './ships.js';
import { getMap, regionOf } from './maps.js';
import { settledOn } from '../game/swoop.js';
import {
  lane as seaLane,
  ship, ownsShip, buyShip, tradeIn, shipName, conditionWord,
  repairShip, repairCost, berth, tally, board, damageShip, sink,
  REFITS, refitCost, hasRefit, refit,
} from '../game/ship.js';
import { seaFight as runSeaFight } from '../game/seafight.js';
import { openQuest, closeQuest, isOpen, isClosed } from '../game/questlog.js';
import { COMPANIONS } from './companions.js';
import {
  willJoin, recruit as doRecruit, dismiss, activeCompanion, restCompanion,
} from '../game/company.js';
import { createCreature, displayName } from '../game/creature.js';
import { TRAINERS, trainerAsDuellist } from './trainers.js';
import { DUELLISTS, ROAMERS, makeRoamer } from './duellists.js';
import { item as getItem } from './items.js';
import { PROPERTIES } from './properties.js';
import {
  ownsProperty, buyProperty, collectRent, rentLine,
} from '../game/property.js';
import {
  maxVigour, mendCost, mendAll, wantsMending,
} from '../game/player.js';
import { asideFor } from '../game/regard.js';
import { MATCHES } from './matches.js';
import {
  willHear, betroth, wed, spouse, betrothed, bearChild, childDue,
  children, heir, ageWord, takeIntoService, hostSize, swornFull, hasSworn,
} from '../game/household.js';
import { audio } from '../engine/audio.js';

const STARTERS = [
  { id: 'snowpup', blurb: 'A Wolfswood pup. Stubborn, quick, and loyal past sense.' },
  { id: 'emberling', blurb: 'A dragon the size of a cat. It has already burnt two tapestries.' },
  { id: 'riverfry', blurb: 'A Trident trout. Placid until it is not.' },
];

/**
 * What you do with somebody you have beaten. Sparing them is free and they
 * remember it; killing them is permanent — they are gone from the world, and
 * whoever they answered to holds it against you for good.
 */
export async function settleFate({ say, choose, id, def }) {
  if (!def.mortal) return 'spared';
  /* A third answer. Beating somebody used to offer exactly two — put them in
     the ground, or let them walk — and there was nowhere in the world to put a
     person you had beaten and wanted. The regard table has had lines about two,
     four and six swords at your back since it was written, and no build could
     ever make one of them true. */
  const canTake = !swornFull() && def.canYield !== false && !def.boss;
  const options = canTake
    ? ['Spare them', 'Take them into your service', 'Finish it']
    : ['Spare them', 'Finish it'];
  const answer = await choose(`${def.name} is beaten and at your mercy.`, options);

  if (canTake && answer === 1) {
    const outcome = takeIntoService(def, id);
    if (outcome === 'full') {
      await say('You have as many swords behind you as you can feed.');
    } else if (outcome === 'already') {
      await say(`${def.name} already answers to you.`);
    } else {
      audio.sfx('confirm');
      await say(`${def.name} looks at the ground a while, and then at you, `
              + 'and says the words. There are now '
              + `${hostSize()} sworn to you.`);
      if (def.house) {
        await say(`Word of it will reach ${def.name}'s people, and they will not `
                + 'thank you for the arithmetic.');
      }
      recordChoice(`sworn_${id}`, true);
    }
    return 'spared';
  }

  const finish = canTake ? answer === 2 : answer !== 0;
  if (finish) {
    markDead(id);
    audio.sfx('faint');
    await say(`You finish it. ${def.name} does not get up.`, { theme: 'royal' });
    if (def.house) changeStanding(def.house, -22);
    recordChoice(`killed_${id}`, true);
    return 'killed';
  }
  await say(`You let them live. ${def.name} will remember which of you decided that.`);
  if (def.house) changeStanding(def.house, 8);
  recordChoice(`spared_${id}`, true);
  return 'spared';
}

/** A night at an inn: fifty dragons, everyone healed, and this is where you
    wake up next time you lose. Two innkeeps rent the same room. */
async function rentRoom({ say, healParty }) {
  /* Winterfell's own rider does not pay for a bed north of the Neck. The
     signet ring existed in the item table and did nothing at all - nobody gave
     it out and nothing looked for it - and this is the thing it says it is
     for: proof of whose business you are on, in the one part of the world
     where that business is worth anything. */
  const northern = ['The North', 'The Neck', 'The Wall', 'Beyond the Wall']
    .includes(regionOf(game.state.position.map));
  if (hasItem('houseRing') && northern) {
    audio.sfx('heal');
    healParty();
    game.state.respawn = { ...game.state.position, dir: 'down' };
    await say('The innkeep looks at the ring, looks at you, and does not put a '
      + 'hand out. A bed, a fire, and no charge for a rider on Winterfell\'s '
      + 'business. Everyone is rested.');
    return;
  }
  if (!canAfford(50)) {
    await say('Innkeep: Come back with coin.');
    return;
  }
  addMoney(-50);
  audio.sfx('heal');
  healParty();
  game.state.respawn = { ...game.state.position, dir: 'down' };
  await say('You slept until the noise downstairs became unbearable. Everyone is rested.');
}

/** What somebody was written to say, with their name on it if the author
    left it off. Six people had a line of their own in the map and a script
    that spoke as somebody else. */
function spoken(npc) {
  const line = npc?.data?.line;
  if (!line) return null;
  return /^[A-Z][^:]{0,40}: /.test(line) ? line : `${npc?.name ?? 'Someone'}: ${line}`;
}

/* Everything after the queen goes down: the thing standing behind the chair,
   and then the chair itself. Its own function because there are two ways into
   it - the climb that beats her, and every climb after one that beat you. */
async function finishTheChair(api, def) {
  const { say, setFlag, tale } = api;
  await tale('champion');
  const champion = await api.duel('throneChampion');
  if (champion !== 'won') {
    await say('You wake somewhere with a ceiling over you, and the hall is '
      + 'still up there, and so is it.', { theme: 'royal' });
    return;
  }
  /* The last thing between anybody and the chair has just stopped being in the
     way, and there is nothing at all left watching the north. */
  deepenWinter(24);
  await tale('throne');

  setFlag('gameComplete');
  await say(def.after, { theme: 'royal' });
  await say('You sit. The blades are exactly as uncomfortable as everyone said.',
    { theme: 'royal' });
  await tale('crowned');

  // Winning the chair is not the end of it. The realm you made on the way up
  // is the realm you now have to hold.
  beginReign();
  await say('And then the room fills with people who want things from you.', { theme: 'royal' });
  await say('Sit the throne again whenever you are ready to hold court.', { theme: 'royal' });
  await api.overworld.holdCourt();
}

export const SCRIPTS = {
  /**
   * A shipwright. Sells hulls, takes your old one in trade at half what he
   * charged you for it, and puts right whatever the sea has done to the one you
   * have. Asks nothing at all about your house, because a keel does not care.
   */
  async shipwright({ say, choose, npc, overworld }) {
    /* Where she is tied up when you buy her. A ship berthed nowhere is a ship
       you can never board, so the man who sells her says where she is. */
    const home = npc?.data?.berth;
    if (npc?.data?.line) await say(npc.data.line);
    for (;;) {
      const have = ship();
      const bill = repairCost();
      const opts = ['See the hulls', have ? 'Put her right' : null,
        have ? 'Have work done on her' : null, 'Nothing today'].filter(Boolean);
      const opened = have
        ? `Shipwright: ${shipName()}, and she is ${conditionWord()}.`
          + (bill ? ` I can have that off her for ${bill}g.` : ' Nothing wants doing to her.')
        : 'Shipwright: You have no ship. That is a thing I can put right, for money.';
      const pick = await choose(opened, opts);
      if (opts[pick] === 'Nothing today') {
        await say('Shipwright: The tide will still be there tomorrow.');
        return;
      }

      if (opts[pick] === 'Put her right') {
        if (!bill) { await say('Shipwright: She is sound. Go and ruin her properly first.'); continue; }
        const yes = await choose(`${bill}g to make her whole. Do it?`, ['Pay him', 'Leave it']);
        if (yes !== 0) continue;
        if (!repairShip()) {
          audio.sfx('cancel');
          await say('Shipwright: I work in gold, not in good intentions.');
          continue;
        }
        audio.sfx('confirm');
        await say(`Shipwright: Caulked, pitched and re-planked. ${conditionWord()} again.`);
        continue;
      }

      /* Work that stays on her, as against work that undoes what the sea has
         done. Buying a bigger boat was the only way a hull ever improved, so
         the one you learned the water in was scrap the day you could afford
         the next. Three of these apiece and the skiff is worth keeping. */
      if (opts[pick] === 'Have work done on her') {
        const left = REFITS.filter((r) => !hasRefit(r.id));
        if (!left.length) {
          await say('Shipwright: There is nothing left to do to her that would not '
            + 'be me inventing work. She is as much ship as she is going to be.');
          continue;
        }
        const labels = left.map((r) => `${r.name} — ${refitCost(r.id)}g`);
        const which = await choose(
          `Shipwright: ${shipName()} will take more than she is carrying. What do you want on her?`,
          [...labels, 'Not today']);
        if (which < 0 || which >= left.length) continue;
        const done = refit(left[which].id);
        if (done === 'poor') {
          audio.sfx('cancel');
          await say('Shipwright: Timber costs what timber costs. Come back with it.');
          continue;
        }
        audio.sfx('confirm');
        await say(left[which].done);
        continue;
      }

      const ids = Object.keys(SHIPS);
      const trade = tradeIn();
      const labels = ids.map((id) => {
        const d = SHIPS[id];
        if (have?.id === id) return `${d.name} — yours already`;
        return `${d.name} — ${Math.max(0, d.price - trade)}g`;
      });
      const which = await choose(
        trade ? `He will put ${trade}g towards a new one for the hull you have.`
              : 'Shipwright: Four of them on the stocks. Take your time.',
        [...labels, 'Not today']);
      if (which === labels.length) continue;

      const id = ids[which];
      const def = SHIPS[id];
      await say(def.broker);
      const owed = Math.max(0, def.price - (have?.id === id ? 0 : trade));
      const buy = await choose(`${def.name}\n${def.summary}\n${owed}g. Take her?`,
        ['Pay him', 'Think about it']);
      if (buy !== 0) continue;

      const outcome = buyShip(id);
      if (outcome === 'already') { await say('Shipwright: You are standing on her.'); continue; }
      if (outcome === 'poor') { audio.sfx('cancel'); await say(def.poor); continue; }
      audio.sfx('confirm');
      if (outcome === 'sold') {
        await say(`Shipwright: And I will take the old one off you — ${trade}g against her, `
          + 'and no questions asked about the state of her bilges.');
      }
      await say(def.bought);
      /* Naming her. Offered once, when she is new, because a ship somebody has
         named is a ship they will be sorry to lose — which is the whole reason
         game/ship.js makes a hull a number that does not come back. */
      const name = await choose('What will you call her?',
        ['Name her', `Leave her "${def.name}"`]);
      if (name === 0) {
        await overworld.nameShip();
        await say(`Shipwright: ${shipName()}, then. She will answer to it.`);
      }
      if (home) {
        board(home.map, home.x, home.y);
        game.state.ship.aboard = false;
        await say(`Shipwright: She is tied up at ${npc?.data?.where ?? 'the quay'}. `
          + 'Walk off the stones into the water and she is under you.');
      }
      return;
    }
  },

  /**
   * A harbourmaster. Says where your ship is, which is the one thing a player
   * genuinely cannot work out for themselves.
   */
  async harbourmaster({ say, npc, overworld }) {
    if (!ownsShip()) {
      await say(npc?.data?.line ?? 'Harbourmaster: No ship of yours on my book. '
        + 'The shipwright is the man you want, and he is not cheap.');
      return;
    }
    const b = berth();
    const took = tally();
    await say(b && b.map === overworld.mapId
      ? `Harbourmaster: ${shipName()} is tied up here, and she is ${conditionWord()}.`
      : `Harbourmaster: ${shipName()} is not in this harbour. You will have left her `
        + 'wherever you last stepped off her.');
    if (took) {
      await say(`Harbourmaster: ${took} hull${took === 1 ? '' : 's'} taken, they tell me. `
        + 'That gets about a good deal faster than you do.');
    }
  },

  /** Somebody has found you out on the water. The rest is in game/seafight.js. */
  async seaFight(api) {
    const fleet = api.data?.fleet;
    if (!fleet || !ownsShip()) return;
    audio.sfx('encounter');
    await runSeaFight(api, fleet);
  },

  /**
   * Something in the water rather than something on it.
   *
   * A fleet can be run down, boarded, sunk or bought off. This cannot be any
   * of those: it is under you, it does not want your cargo, and the only two
   * answers are the rail and the sail. It is also the one thing at sea that
   * can be taken alive, which is the whole reason to go looking.
   */
  async seaBeast(api) {
    const { say, choose, battle, data } = api;
    const row = data?.beast;
    if (!row || !ownsShip()) return;
    audio.sfx('encounter');
    const level = Math.max(4, Math.round(row.min + Math.random() * (row.max - row.min)));
    await say('The water off the bow goes flat and dark, the way water does when '
      + 'something large has just gone under it.');
    const pick = await choose('Whatever it is, it is keeping pace with you.',
      ['Stand to the rail', 'Put on all sail']);
    if (pick === 1) {
      /* Running from something that swims better than you sail is a wager,
         and the stake is the hull. */
      if (Math.random() < 0.55) {
        await say('It loses interest, or it finds something better. The water '
          + 'closes and the sea is only the sea again.');
        return;
      }
      const hurt = 6 + Math.floor(Math.random() * 12);
      damageShip(hurt);
      await say(`It comes up under the quarter as you turn. ${shipName()} takes `
        + `${hurt} and every loose thing on deck goes over the side.`);
      if ((ship()?.hull ?? 0) > 0) return;
      sink();
      await say('She goes down under you, and you are in the water with the rest '
        + 'of it. Somebody fishes you out. You are not sure who.');
      return;
    }
    if (!party().some((c) => c.hp > 0)) {
      await say('There is nothing at your heel that swims, and nothing on deck '
        + 'that would help. You hold on and hope.');
      const hurt = 4 + Math.floor(Math.random() * 8);
      damageShip(hurt);
      if ((ship()?.hull ?? 0) <= 0) sink();
      return;
    }
    await battle({ kind: 'wild', foe: createCreature(row.beast, level) });
  },

  // ------------------------------------------------------------- defaults --
  async generic({ say, npc }) {
    // Even a nobody notices you if you have become somebody.
    await say(`${npc?.name ?? 'Someone'} has nothing to say to you today.`);
    const aside = asideFor();
    if (aside) await say(aside);
  },

  /**
   * Somebody in a town with a line to say. This script was named by
   * twenty-two people across the world and had never been written: every one
   * of them fell through to `generic` and said "has nothing to say to you
   * today" while the line somebody had authored for them sat in their data
   * unread.
   */
  async townTalk({ say, npc }) {
    await say(npc?.data?.line ?? `${npc?.name ?? 'Someone'} nods, and goes back to it.`);
    const aside = asideFor();
    if (aside) await say(aside);
  },

  /**
   * A ranging.
   *
   * You take one from anybody in black, you go north and put down what you
   * find, and you come back. It is the one thing in this world that pushes the
   * winter back instead of watching it come: everything else a player does —
   * every house broken, every step of the last act — is a garrison that will
   * not be relieved. A threat nobody can answer is weather rather than a
   * story, so this has to be somebody you can walk up to, and there is one
   * standing in every place a player who has just been frightened by a raven
   * would think to go.
   */
  async ranging(api) {
    const { say, npc } = api;
    const who = npc?.name ?? 'A brother in black';
    /* The steward at Castle Black has the speech about how thin the Watch is
       stretched, which is the lead-in to this rather than a rival to it. He
       says his piece and then sends you north. */
    if (npc?.script === 'wallHint') await SCRIPTS.wallHint(api);
    const out = ranging();

    /* Back with it done. */
    if (out.want && out.got >= out.want) {
      const paid = handInRanging();
      addMoney(paid);
      audio.sfx('money');
      await say(`${who}: That is the count, and more than most bring back. `
        + `${paid} gold out of the Watch's own chest, and the cold over the `
        + `Wall has gone back a step because of it. The season is `
        + `${seasonWord()} now.`);
      return;
    }

    /* Out on one and not done. */
    if (out.want) {
      await say(`${who}: You are still out on the last one. ${out.got} of `
        + `${out.want} put down. Go back over the Wall, or go north far enough `
        + 'that it comes to you — and it is coming further south every month '
        + 'you leave it.');
      return;
    }

    /* Nobody is sent over the Wall in a gambeson. */
    if (game.state.player.level < 12) {
      await say(`${who}: You are no use to us yet. Come back with some years `
        + 'on you and something better than that in your hand, and I will send '
        + 'you north.');
      return;
    }

    const want = takeRanging();
    audio.sfx('confirm');
    await say(`${who}: Then take a ranging. Put down ${want} of the dead — `
      + 'anywhere they walk, and they walk further south every year — and come '
      + `back to any brother in black. ${deadReachWord()}`);
  },

  /** Ground pickups. */
  async pickup({ subject, say, setFlag }) {
    const def = getItem(subject.item);
    giveItem(subject.item, subject.count ?? 1);
    setFlag(subject.flag);
    audio.sfx('confirm');
    const count = subject.count ?? 1;
    await say(count > 1
      ? `You found ${count} ${def.name}s!`
      : `You found a ${def.name}!`);
  },

  /** Maester's Hall healer. */
  /* The cages at the back of a maester's hall. The cartridge opens its own
     holdfast screen here; in the browser this is a line and nothing more. */
  /**
   * A company across the Narrow Sea. West of the water a sword follows you
   * because you knocked him down first; east of it he follows the money, which
   * is the only thing the Free Cities have that Westeros has not.
   *
   * The cartridge keeps a household of six sworn swords and this fills a place
   * in it. The browser has companions rather than a household, so here the deal
   * is struck and remembered - who you have paid for, and what it cost - and
   * the console is where they draw a sword.
   */
  async sellswords({ say, choose, npc }) {
    const id = npc.data?.company;
    const def = COMPANIES[id];
    if (!def) { await say('There is nobody here selling anything.'); return; }
    game.state.hired = game.state.hired ?? [];
    if (game.state.hired.includes(id)) {
      await say(`${def.name} has your coin already. They are waiting on a war.`);
      return;
    }
    const pick = await choose(def.pitch, [`Pay ${def.price}g`, 'Walk away']);
    if (pick !== 0) {
      await say('The captain shrugs. There is a war on somewhere always.');
      return;
    }
    if (!canAfford(def.price)) { await say(def.poor); return; }
    addMoney(-def.price);
    game.state.hired.push(id);
    await say(def.taken);
  },

  async kennel({ say, npc }) {
    await say(npc.data?.line
      ?? 'Kennelmaster: Anything you cannot carry, I will board.');
  },

  async healer({ say, choose, npc, healParty, saveGame }) {
    const line = npc.data?.line ?? 'How can the maester serve?';
    const answer = await choose(line, ['Heal my creatures', 'Save my progress', 'Nothing']);
    if (answer === 2) {
      await say('Come back when you are weary.');
      return;
    }
    if (answer === 1) {
      const ok = saveGame();
      if (ok) {
        await say('Your progress has been entered into the ledger. You may return to this page at any time.');
      } else {
        await say('The ledger would not take it. Your browser may be blocking storage.');
      }
      return;
    }
    await say('Rest them here a moment...');
    healParty();
    // Whoever rides with you gets seen to as well — while they are still alive
    // to be seen to.
    const ally = activeCompanion();
    if (ally && ally.hp < ally.maxHp) {
      restCompanion();
      await say(`${ally.name} is patched up too, and complains about it throughout.`);
    }
    await say('There. Fed, watered, and rather better tempered than you are.');
    game.state.respawn = { ...game.state.position, dir: 'down' };
  },

  /**
   * Selling a deed. Nothing in here reads allegiance, sigils, title or house:
   * the only question is whether the gold is on the table, which is the whole
   * point of the property being here.
   */
  async deedBroker({ say, choose, npc, overworld }) {
    const id = npc.data.property;
    const def = PROPERTIES[id];

    if (ownsProperty(id)) {
      const go = await choose(def.owned, ['Take me there', 'Later']);
      if (go === 0) overworld.sailTo({ map: def.map, ...def.at });
      return;
    }

    await say(def.broker);
    const answer = await choose(`${def.name} — ${def.price}g. Buy the deed?`,
      ['Pay for it', 'Walk away']);
    if (answer !== 0) {
      await say('The deed goes back in the box. It is not going anywhere.');
      return;
    }

    const outcome = buyProperty(id);
    if (outcome === 'poor') {
      audio.sfx('cancel');
      await say(def.poor);
      return;
    }
    audio.sfx('confirm');
    await say(def.deed);
    await say(`(${def.name} is yours.)`);
    const go = await choose('Go there now?', ['Yes', 'Not yet']);
    if (go === 0) overworld.sailTo({ map: def.map, ...def.at });
  },

  /**
   * Your own bed, in a place you paid for. Sleeping heals you, moves where you
   * wake after a whiteout, and collects whatever the place has earned while
   * you were not in it.
   */
  async ownBed({ say, choose, npc, healParty, saveGame }) {
    const id = npc.data.property;
    const def = PROPERTIES[id];
    if (!ownsProperty(id)) {
      await say('Somebody else\'s bed, in somebody else\'s room.');
      return;
    }
    const answer = await choose('Sleep here?', ['Sleep', 'Stay up']);
    if (answer !== 0) return;

    await say(def.rest);
    healParty();
    const ally = activeCompanion();
    if (ally && ally.hp < ally.maxHp) restCompanion();
    game.state.player.hp = maxVigour();
    game.state.player.wounded = false;

    const taken = collectRent(id);
    const line = rentLine(id, taken);
    if (line) await say(line);

    // Your own roof is where you wake up if the next thing goes badly.
    game.state.respawn = { ...game.state.position, dir: 'down' };
    if (saveGame && saveGame()) await say('(Your progress is written down.)');
  },

  /**
   * Somebody you could marry, and then the marriage itself. One person handles
   * the whole of it — the asking, the wedding, and afterwards the household —
   * because a seat can only hold twelve appearances in object memory and three
   * separate people per match would have cost twenty-four of them.
   *
   * Nothing in here asks whether you hold a seat or carry a name. What a match
   * wants is standing with their own house, which is earned by what you do. A
   * landless sword marrying up is a story this setting tells constantly and the
   * game could not tell at all.
   */
  async courtship({ say, choose, npc }) {
    const def = MATCHES[npc.data.match];
    const mine = spouse();

    // --- already married, to them or to somebody else --------------------
    if (mine) {
      if (mine.id !== def.id) {
        await say(`${def.name}: You are married. I am many things and I am not that.`);
        return;
      }
      if (childDue()) {
        await say(`${def.name}: There is something you should be told, and I would `
                + 'rather tell you than have you hear it in a hall.');
        const child = bearChild();
        audio.sfx('confirm');
        await say(`A ${child.boy ? 'son' : 'daughter'}. ${child.name}. `
                + `${def.name} is well, and says you look worse than she does.`);
        return;
      }
      await say(def.married);
      const kids = children();
      if (kids.length) {
        await say(kids.map((c) => `${c.name}, ${c.boy ? 'son' : 'daughter'}, ${ageWord(c)}`)
          .join('. ') + '.');
        const first = heir();
        if (first) await say(`${first.name} is the eldest, and what you hold goes there.`);
      } else {
        await say('No children yet. These things take the time they take.');
      }
      if (hostSize()) await say(`${hostSize()} swords answer to you as well now.`);
      return;
    }

    // --- promised --------------------------------------------------------
    const b = betrothed();
    if (b && b.id !== def.id) {
      await say(`${def.name}: You are promised to somebody else. Go and sort that out.`);
      return;
    }
    if (b) {
      const now = await choose(`Wed ${def.name} today, here at ${def.seat}?`,
        ['Say the words', 'Not yet']);
      if (now !== 0) { await say(`${def.name}: Another day, then. I am not going anywhere.`); return; }
      wed();
      audio.sfx('confirm');
      await say(def.wed);
      await say(`(You are married to ${def.name}.)`);
      return;
    }

    // --- the asking ------------------------------------------------------
    await say(def.open);
    const answer = await choose(`Ask for ${def.name}'s hand? The bride-gift is ${def.price}g.`,
      ['Ask', 'Not today']);
    if (answer !== 0) { await say('You leave it unsaid. It stays sayable.'); return; }

    const verdict = willHear(def);
    if (verdict === 'standing') { audio.sfx('cancel'); await say(def.tooLow); return; }
    if (verdict === 'poor') { audio.sfx('cancel'); await say(def.poor); return; }

    betroth(def);
    audio.sfx('confirm');
    await say(def.yes);
    await say(`(You are betrothed. Come back to ${def.name} to be wed.)`);
  },

  /**
   * The house with the red lamp over the door. One has stood in every town in
   * this game since the towns were built, as a room with people in it and
   * nothing you could do. What the place is for in this setting is that it is
   * where the talk is, and where somebody will let you sit down and stop
   * bleeding for a while.
   */
  async redLamp({ say, choose, npc, healParty, saveGame, overworld }) {
    const here = overworld?.mapId ?? game.state.position.map;
    /* The keeper knows what an evening costs, and knows better than anybody in
       town whose children are whose. That is the whole of the trade. */
    const kid = bastardHere(here);
    if (kid && grown(kid)) {
      await say(`${npc.name}: That one by the fire, with your chin? Grown now, `
        + 'and good with their hands. They know whose blood they carry — '
        + 'everybody in this town knows. Nobody else is offering them anything.');
      const yes = await choose(`Take ${kid.first} ${kid.surname} into your service?`,
        ['Yes', 'Not today']);
      if (yes !== 0) {
        await say(`${npc.name}: They will still be here. That is rather the trouble.`);
        return;
      }
      const how = takeBastard(kid);
      if (how === 'full') {
        await say('Your company is full. Six swords is what one table feeds; '
          + 'come back when there is a place at it.');
        return;
      }
      audio.sfx('confirm');
      await say('They put their cup down, look at you the way you look at '
        + `yourself in still water, and kneel. ${kid.surname} rides with you `
        + 'now, and fights behind you like it settles something. Perhaps it '
        + 'does.', { theme: 'royal' });
      return;
    }
    if (kid) {
      await say(`${npc.name}: The child is well. Growing. Asks about you, which `
        + 'I neither encourage nor prevent. Come back when they are old enough '
        + 'to hold something sharper than a spoon.');
      return;
    }

    const line = npc.data?.line ?? `${npc.name}: You look like a long road. Come in off it.`;
    await say(line);
    const evening = 40 + game.state.player.level * 2;
    const answer = await choose('What do you want?',
      ['A bed and a wash \u2014 60g', 'What is being said',
       `The evening \u2014 ${evening}g`, 'Nothing']);

    if (answer === 2) {
      if (!canAfford(evening)) {
        audio.sfx('cancel');
        await say(`${npc.name}: The keeper looks at your purse and pours you `
          + 'water. Come back solvent.');
        return;
      }
      addMoney(-evening);
      spendTheEvening(here);
      audio.sfx('confirm');
      await say('Wine downstairs, company upstairs, and nobody writes anything '
        + 'down. You leave before it is properly light.');
      /* Nobody in this world minds this except one person, and only if there
         is one - which is precisely how much the story minds it. */
      if (spouse()) {
        await say('Word of it will get home before you do. It always does.');
        recordChoice('strayed', true);
      }
      return;
    }

    if (answer === 1) {
      const rumours = [
        'Half the men who come through here are running from somebody, '
        + 'and the other half are the somebody.',
        'Coin has been moving through this town that nobody will put a name to.',
        'A man was asking after somebody of your description. He paid to be '
        + 'forgotten, and I have a poor memory for anything but faces.',
        'Everybody tells this room things they would not tell a septon. '
        + 'That is the whole of the trade, whatever anybody says it is.',
      ];
      await say(`${npc.name}: ${rumours[Math.floor(Math.random() * rumours.length)]}`);
      const aside = asideFor();
      if (aside) await say(aside);
      return;
    }
    if (answer !== 0) { await say(`${npc.name}: Suit yourself. The door does not lock.`); return; }


    if (!canAfford(60)) {
      audio.sfx('cancel');
      await say(`${npc.name}: Sixty. I do not run a charity and you do not want one.`);
      return;
    }
    addMoney(-60);
    healParty();
    game.state.player.hp = maxVigour();
    game.state.player.wounded = false;
    const ally = activeCompanion();
    if (ally && ally.hp < ally.maxHp) restCompanion();
    audio.sfx('confirm');
    await say('Hot water, a bed with nothing living in it, and nobody asking your '
            + 'name. You sleep like something that has stopped being hunted.');
    game.state.respawn = { ...game.state.position, dir: 'down' };
    if (saveGame && saveGame()) await say('(Your progress is written down.)');
  },

  /**
   * Somebody standing in the road who will not let you past yet.
   *
   * The ten seats are a ladder and the world is wide open, so a new player is
   * dropped into a map of Westeros with no idea which way is next and every
   * way available. A warden on the road is the oldest fix in the genre: they
   * stand on the one tile you have to cross, they tell you exactly what you
   * are missing, and they are gone the moment you have it.
   *
   * `npc.warden` is the number of seats that must have bent to you. The
   * overworld hides them the instant you have enough, so this script only ever
   * runs while they are still in your way.
   */
  async warden({ say, npc }) {
    const have = sigilCount();
    const want = npc.warden;
    await say(npc.data?.line ?? `${npc.name}: This road is closed to you.`);
    await say(`${npc.name}: ${have} of the great seats have bent to you. `
            + `This road wants ${want}.`);
    if (npc.data?.hint) await say(npc.data.hint);
  },

  /** Any counter merchant. */
  async shop({ say, npc, openShop }) {
    const stock = npc.data?.stock ?? [];
    if (npc.data?.line) await say(npc.data.line);
    await openShop(stock);
  },

  /**
   * Duels. People fight you as themselves — steel against steel — rather than
   * setting a creature on you. Beasts still use the creature battle system.
   */
  async duel({ say, choose, npc, duel, setFlag, flag }) {
    const id = npc.data.duel;
    /* A hundred and twenty-two people in this world name a roaming archetype
       here — "sellsword", "manAtArms", "clansman" — where a named duellist was
       meant. duellist() threw on every one of them, the catch around scripts
       swallowed it, and talking to any of them did nothing at all, silently,
       for the whole game. An archetype is a perfectly good opponent: build one
       at your level and let it keep the name the map gave it. */
    const def = DUELLISTS[id]
      ?? (ROAMERS[id]
        ? { ...makeRoamer(id, Math.max(4, game.state.player.level + 1), (l) => l[0]),
            name: npc.name ?? undefined }
        : null);
    if (!def) {
      await say('They have nothing to say to you.');
      return;
    }
    if (flag(`duel_${id}`)) {
      await say(def.after);
      return;
    }
    const outcome = await duel(DUELLISTS[id] ? id : def);
    if (outcome === 'won') {
      setFlag(`duel_${id}`);
      await say(def.after);
      // Anyone the story does not still need can be finished here.
      const fate = await settleFate({
        say, choose, id: `duel_${id}`,
        def: { ...def, mortal: def.mortal ?? !def.boss },
      });
      if (fate === 'killed') npc.hidden = true;
    }
  },

  /** Blacksmiths sell arms and armour and will fit them for you. */
  async smith({ say, choose, npc, openSmithy }) {
    if (npc.data?.line) await say(npc.data.line);
    /* Mending, before selling. Steel wears now, and a forge that will sell you
       a new sword but not put an edge back on the one you have is a shop with
       an anvil in it. This is what seventeen smiths are for. */
    while (wantsMending()) {
      const cost = mendCost();
      const pick = await choose(`Your kit wants a night on the wheel. ${cost}g for `
        + 'the lot.', [`Mend it — ${cost}g`, 'Look at the rack']);
      if (pick !== 0) break;
      if (!canAfford(cost)) {
        await say('Smith: Come back with the coin and I will come back with the '
          + 'grindstone.');
        break;
      }
      addMoney(-cost);
      mendAll();
      audio.sfx('confirm');
      await say('Sparks, water, and a long unpleasant noise. Every piece you '
        + 'have on is sound again.');
    }
    await openSmithy(npc.data?.stock ?? {});
  },

  /**
   * Every trainer fight funnels through here. They fight you themselves, with
   * whichever of their creatures was strongest standing beside them.
   */
  async trainer({ say, choose, npc, overworld, setFlag, flag }) {
    const id = npc.data.trainer;
    const def = TRAINERS[id];
    if (flag(`trainer_${id}`)) {
      await say(isDead(`trainer_${id}`) ? 'Nobody stands here now.' : def.after);
      return;
    }
    const outcome = await overworld.startAmbush(trainerAsDuellist(id));
    if (outcome === 'won') {
      setFlag(`trainer_${id}`);
      await say(def.after);
      const fate = await settleFate({ say, choose, id: `trainer_${id}`, def: trainerAsDuellist(id) });
      if (fate === 'killed') npc.hidden = true;
    }
  },

  // ------------------------------------------------------ the opening beat --
  async starter({ say, choose, npc, setFlag, flag }) {
    if (flag('gotStarter')) {
      if (!flag('luwinAdvice2')) {
        setFlag('luwinAdvice2');
        await say('Tall grass hides wild creatures. Raise a banner at a weakened one and it may swear to you.');
      } else {
        await say('South, then. Moat Cailin first, and Riverrun beyond it. Ride safely.');
      }
      return;
    }

    await say('Maester Luwin: There you are. Lord Rickard wants a rider for the southern roads, and every other candidate is either too old or too Bolton.');

    // Whose banner you ride under. Every house in the realm forms an opinion
    // from this moment, and they all remember it.
    await say('Before any of that. A rider carries somebody\'s banner, and the roads read banners before they read faces.');
    let houseId = null;
    while (!houseId) {
      const labels = SWEARABLE.map((id) => HOUSES[id].full);
      const pick = await choose('Whose banner will you carry?', [...labels, 'Tell me again']);
      if (pick < 0 || pick >= SWEARABLE.length) {
        await say('Maester Luwin: The house you name is the house that answers for you. Their friends open doors. Their enemies open throats.');
        continue;
      }
      const candidate = SWEARABLE[pick];
      const def = HOUSES[candidate];
      await say(`${def.full}. "${def.words}." Their seat is ${def.seat}.`);
      const confirm = await choose(`Swear to ${def.full}?`, ['I swear it', 'Let me think']);
      if (confirm === 0) houseId = candidate;
    }

    swearTo(houseId);
    recordChoice('allegiance', houseId);
    audio.sfx('levelup');
    const sworn = HOUSES[houseId];
    await say(`You are sworn to ${sworn.full}.`);
    await say(`Maester Luwin: ${sworn.sworn}`);
    await say('Their rivals will have heard by the time you reach the gate. That is how it works.');

    await say('Now. You will need a creature of your own. I have three in my care. Choose.');

    let index = -1;
    while (index < 0) {
      const pick = await choose('Which will you take?',
        ['Snowpup', 'Emberling', 'Riverfry', 'Ask again']);
      if (pick === 3) {
        await say('Take your time. It is the only one of these decisions you get to make slowly.');
        continue;
      }
      const starter = STARTERS[pick];
      await say(starter.blurb);
      const confirm = await choose('Take this one?', ['Yes', 'Let me look again']);
      if (confirm === 0) index = pick;
    }

    const chosen = STARTERS[index];
    const creature = createCreature(chosen.id, 5, { originalTrainer: game.state.player.name });
    addCreature(creature);
    audio.sfx('caught');
    setFlag('gotStarter');
    await say(`You received ${displayName(creature)}!`);

    giveItem('sigilBanner', 5);
    giveItem('maesterKit', 3);
    giveItem('ravenScroll', 1);
    await say('Take five Sigil Banners and some bandages. And this scroll — it names you Winterfell\'s rider, so the gate guards will let you pass.');
    await say('Lord Rickard holds the Wolf Sigil in the Great Keep. Earn it from him before you ride south. He will insist.');

    // Luwin steps out of the road.
    npc.x = 11;
    npc.dir = 'right';
  },

  /**
   * Asking someone to ride with you. Most of them want their house to think
   * well of you first, one wants paying, and none of them come back from the
   * dead — so this is also where the game tells you plainly that they can die.
   */
  async recruit({ say, choose, npc }) {
    const id = npc.data.companion;
    const def = COMPANIONS[id];
    const verdict = willJoin(id);

    if (verdict.reason === 'dead') {
      await say(`Nobody has seen ${def.name} since. Nobody expects to.`);
      return;
    }
    if (verdict.reason === 'already') {
      const line = def.lines[Math.floor(Math.random() * def.lines.length)];
      await say(line);
      const part = await choose('Send them on their way?', ['No', 'Yes, we part here']);
      if (part === 1) {
        dismiss();
        await say(`${def.name} takes their leave. No hard words about it.`);
      }
      return;
    }
    if (verdict.reason === 'occupied') {
      await say(`${def.name}: You already ride with ${verdict.current}. `
        + 'Two is a party. Three is an argument on horseback.');
      return;
    }
    if (verdict.reason === 'standing') {
      await say(def.refuse);
      return;
    }

    if (def.cost) {
      if (!canAfford(def.cost)) {
        await say(`${def.name}: ${def.cost} gold dragons. You do not have it.`);
        return;
      }
      const pay = await choose(`${def.name} wants ${def.cost} gold. Pay?`, ['Pay', 'Not today']);
      if (pay !== 0) {
        await say(def.refuse);
        return;
      }
      addMoney(-def.cost);
    }

    await say(def.recruit);
    await say('They can die out there, and if they do that is the end of them. '
      + 'No maester brings a person back.');
    const confirm = await choose(`Take ${def.name} with you?`, ['Yes', 'No']);
    if (confirm !== 0) {
      await say(`${def.name}: Wiser than you look. Find me when you change your mind.`);
      return;
    }
    doRecruit(id);
    recordChoice(`recruited_${id}`, true);
    audio.sfx('confirm');
    await say(`${def.name} rides with you.`);
  },

  /**
   * A side quest. The first time you speak to them they put the situation to
   * you; after that you answer it, and every answer costs somebody something.
   */
  async quest({ say, choose, npc, overworld }) {
    const id = npc.data.quest;
    const def = QUESTS[id];

    if (isClosed(id)) {
      await say(`They have nothing more to ask of you about ${def.name.toLowerCase()}.`);
      return;
    }
    if (!isOpen(id)) {
      await say(def.giver);
      openQuest(id);
      audio.sfx('confirm');
      await say('(Added to your log.)');
      return;
    }

    await say(def.summary);
    const labels = def.resolve.map((o) => o.label);
    const pick = await choose('What will you do?', [...labels, 'Not yet']);
    if (pick < 0 || pick >= def.resolve.length) {
      await say('You leave it as it stands. It will not stay that way forever.');
      return;
    }
    const option = def.resolve[pick];

    // Some answers have to be argued with steel first.
    if (option.roamer) {
      const foe = makeRoamer(option.roamer.id, option.roamer.level, (list) => list[0]);
      foe.canYield = false;
      const outcome = await overworld.startAmbush(foe);
      if (outcome !== 'won') {
        await say('It goes badly. Whatever you meant to settle here is still unsettled.');
        return;
      }
    }

    if (option.gold) addMoney(option.gold);
    for (const [house, delta] of Object.entries(option.standing ?? {})) {
      changeStanding(house, delta);
    }
    if (option.choice) recordChoice(option.choice[0], option.choice[1]);
    closeQuest(id, option.label);
    audio.sfx('confirm');
    await say(option.result);
  },

  /**
   * The deed to a ruined holdfast. Somebody is squatting in it, which is the
   * usual condition of anywhere worth having.
   */
  async claimHoldfast({ say, choose, overworld, npc, setFlag, flag }) {
    if (ownsHoldfast()) {
      const h = holdfast();
      const go = await choose(`Landless Knight: ${h.name} is half a day north. Ride out?`,
        ['Take me there', 'Not now']);
      if (go === 0) overworld.sailTo({ map: 'holdfast', x: 7, y: 10, dir: 'up' });
      return;
    }
    if (!flag('claim_offered')) {
      setFlag('claim_offered');
      await say('Landless Knight: There is a holdfast half a day north. Roof mostly on. '
        + 'Nobody has held it since the winter before last.');
      await say('Landless Knight: I would take it myself, but the man sitting in it '
        + 'objects, and he objects with an axe.');
      return;
    }

    const answer = await choose('Take the holdfast?', ['Go and take it', 'Not yet']);
    if (answer !== 0) {
      await say('Landless Knight: It will still be there. So will he.');
      return;
    }

    const squatter = makeRoamer('wildlingRaider', Math.max(8, game.state.player.level + 2),
      (list) => list[0]);
    squatter.name = 'The Squatter';
    squatter.canYield = false;
    squatter.mortal = true;
    squatter.intro = 'The Squatter: My roof. My walls. My axe. Which part is unclear?';
    squatter.defeat = 'The Squatter: Fine. Fine! It leaks anyway.';

    const outcome = await overworld.startAmbush(squatter);
    if (outcome !== 'won') return;

    grantHoldfast('holdfast', 'the Holdfast');
    recordChoice('tookHoldfast', true);
    audio.sfx('levelup');
    await say('The hall is yours. It is cold, it is empty, and it is yours.', { theme: 'royal' });
    await say('Landless Knight: I will send you a steward. He is dull and he is honest, '
      + 'which is the correct order to want those in.');
    await say('Landless Knight: Come to me when you want carrying up there.');
  },

  /**
   * Your steward. Everything about the hall that is not food goes through him:
   * naming it, furnishing it, and sitting people down at it.
   */
  async steward({ say, choose, overworld }) {
    if (!ownsHoldfast()) {
      await say('Steward: This hall has no lord. If you mean to change that, take it up '
        + 'with whoever holds the deed.');
      return;
    }
    const h = holdfast();
    await say(`Steward: ${h.name}. ${seats()} seats, ${h.furnishings.length} improvements, `
      + `${feastCount()} feasts held.`);

    while (true) {
      const pick = await choose('Steward: What needs doing?',
        ['Furnish the hall', 'Move something', 'Hold a feast', 'Rename the hall',
         'Nothing today']);
      if (pick === 0) { if (await SCRIPTS.furnishHall({ say, choose, overworld })) return; }
      else if (pick === 1) { if (await SCRIPTS.arrangeHall({ say, choose, overworld })) return; }
      else if (pick === 2) await SCRIPTS.feastHall({ say, choose });
      else if (pick === 3) { await overworld.renameHall(); return; }
      else return;
    }
  },

  /**
   * Picking a piece up and carrying it somewhere else. Hands the hall over to
   * the pad rather than to another menu: choosing a spot by walking a cursor
   * round the room you are standing in is the whole point of it being yours.
   *
   * @returns {boolean} whether the hall has been handed over, so the steward
   *   stops talking rather than asking again over the top of it
   */
  async arrangeHall({ say, choose, overworld }) {
    const standing = holdfast().furnishings.filter((id) => FURNISHINGS[id]?.tile);
    if (!standing.length) {
      await say('Steward: There is nothing in here to move. That is rather the '
        + 'problem with it.');
      return false;
    }
    const labels = standing.map((id) => {
      const at = placedAt(id);
      return at ? FURNISHINGS[id].name : `${FURNISHINGS[id].name} (still in the yard)`;
    });
    const pick = await choose('Steward: Move what?', [...labels, 'Nothing']);
    if (pick < 0 || pick >= standing.length) return false;
    overworld.startArranging(standing[pick]);
    return true;
  },

  /** Buying things to put in the hall. */
  async furnishHall({ say, choose, overworld }) {
    const available = Object.keys(FURNISHINGS).filter((id) => !installed(id));
    if (!available.length) {
      await say('Steward: There is nothing left to add that would not be showing off.');
      return false;
    }
    const labels = available.map((id) => `${FURNISHINGS[id].name} (${FURNISHINGS[id].cost}g)`);
    const pick = await choose('What shall we put in?', [...labels, 'Never mind']);
    if (pick < 0 || pick >= available.length) return false;

    const id = available[pick];
    const def = FURNISHINGS[id];
    await say(def.desc);
    const confirm = await choose(`${def.cost} gold. Do it?`, ['Do it', 'Not yet']);
    if (confirm !== 0) return false;
    if (!install(id)) {
      await say('Steward: We cannot afford that. I have checked twice.');
      return false;
    }
    audio.sfx('confirm');
    await say(`Steward: ${def.name}. Now show the men where you want it.`);
    /* Bought and then put down by hand, in that order. A thing you have paid
       for and cannot see is the defect this whole business exists to fix, so
       the placing follows the buying rather than waiting to be found in a
       second menu. */
    overworld.startArranging(id);
    return true;
  },

  /** Sitting houses down at your table and feeding them. */
  async feastHall({ say, choose }) {
    const cooked = Object.keys(DISHES).filter((id) => dishCount(id) > 0);
    if (!cooked.length) {
      await say('Steward: You cannot feast people on an empty table. See the cook.');
      return;
    }

    // Who you can plausibly invite: anybody not actively hostile.
    const invitable = HOUSE_IDS.filter((id) => standing(id) > -60);
    if (!invitable.length) {
      await say('Steward: Nobody in the realm would sit at your table. That is a sentence '
        + 'I did not expect to have to say.');
      return;
    }

    const room = seats();
    const guests = [];
    while (guests.length < room) {
      const left = invitable.filter((id) => !guests.includes(id));
      if (!left.length) break;
      const labels = left.slice(0, 4).map((id) => HOUSES[id].full);
      const pick = await choose(`Seat ${guests.length + 1} of ${room}. Who?`,
        [...labels, guests.length ? 'That will do' : 'Never mind']);
      if (pick < 0 || pick >= labels.length) break;
      guests.push(left[pick]);
    }
    if (!guests.length) return;

    const dishLabels = cooked.map((id) => `${DISHES[id].name} x${dishCount(id)}`);
    const dishPick = await choose('What goes on the table?', [...dishLabels, 'Never mind']);
    if (dishPick < 0 || dishPick >= cooked.length) return;

    const result = holdFeast(guests, [cooked[dishPick]]);
    audio.sfx('levelup');
    await say('The hall fills. There is more shouting than you expected and less blood '
      + 'than there might have been.');
    for (const r of result.results) {
      const house = HOUSES[r.house].full;
      if (r.rivalsPresent > 0) {
        await say(`${house} sat opposite people they hate. They noticed. `
          + `Their regard for you moves by ${r.gain}.`);
      } else {
        await say(`${house} ate well and said so. Their regard for you rises by ${r.gain}.`);
      }
    }
  },

  /** The cook. Everything you gathered on the road turns into food here. */
  async cook({ say, choose }) {
    if (!canCook()) {
      await say('Cook: There is no hearth in this hall. I can chop things and glare at them, '
        + 'and that is all.');
      return;
    }
    const stock = Object.entries(larder()).filter(([, n]) => n > 0);
    if (!stock.length) {
      await say('Cook: The larder is empty. Bring me something and I will make it worth eating.');
      return;
    }
    await say(`Cook: ${stock.map(([id, n]) => `${INGREDIENTS[id].name} x${n}`).join(', ')}.`);

    const makeable = Object.keys(DISHES).filter((id) => canCookDish(id));
    if (!makeable.length) {
      await say('Cook: Not enough of anything to make anything. Such is cooking.');
      return;
    }
    const labels = makeable.map((id) => DISHES[id].name);
    const pick = await choose('What shall I make?', [...labels, 'Nothing now']);
    if (pick < 0 || pick >= makeable.length) return;

    const id = makeable[pick];
    cookDish(id);
    audio.sfx('heal');
    await say(DISHES[id].desc);
    await say(`Cook: ${DISHES[id].name}, done. Wrapped, and in your pack — it `
      + 'will keep until you need it, and you will.');
  },

  /** Somebody standing in a Free City with something to say about it. */
  /* -------------------------------------------------- east of the sea ----
   *
   * Twelve of the most recognisable people in the story stood in the four
   * Free Cities sharing one script, and that script was `generic` with a
   * nicer name: it said their line and stopped. Jaqen, Arya, Illyrio, Jorah,
   * the Red Priestess, the Triarch, Missandei — every one of them furniture.
   * Worse, two of the four cities had nowhere at all to mend: Braavos has the
   * Kindly Man and Volantis the Red Priest, and if you lost a fight in Pentos
   * or Meereen your only answer was to pay an innkeep fifty gold for a bed.
   *
   * Nobody new has been added to any of those maps. The people who were
   * already standing there do the things they are known for instead.
   */

  /** A man gives a name. Once, and it is not taken back. */
  async jaqen({ say, choose, npc }) {
    await say(npc.data?.line ?? 'Valar morghulis.');
    if (game.state.choices?.jaqenPaid) {
      await say('Jaqen H\'ghar: A man gave a man a name, and the name was '
        + 'taken. A man does not give two. Valar dohaeris.');
      return;
    }
    /* Everyone you beat and let live. The list is your own play read back to
       you, which is the only list he could possibly be offering. */
    const spared = Object.keys(game.state.choices ?? {})
      .filter((k) => k.startsWith('spared_'))
      .map((k) => k.slice(7))
      .filter((id) => !isDead(id));
    if (!spared.length) {
      await say('Jaqen H\'ghar: A man owes the Red God three deaths, and a girl '
        + 'has taken none of them from him. Come back when you have left '
        + 'somebody standing that you would rather had not been left.');
      return;
    }
    const names = spared.slice(0, 3);
    const pick = await choose('Jaqen H\'ghar: Speak a name.',
      [...names.map((id) => DUELLISTS[id]?.name ?? id), 'No name today']);
    if (pick < 0 || pick >= names.length) {
      await say('Jaqen H\'ghar: Then a man waits. A man is very good at waiting.');
      return;
    }
    const id = names[pick];
    const who = DUELLISTS[id]?.name ?? id;
    markDead(id);
    recordChoice('jaqenPaid', true);
    recordChoice(`named_${id}`, true);
    const house = DUELLISTS[id]?.house;
    if (house) changeStanding(house, -18);
    audio.sfx('faint');
    await say(`Jaqen H'ghar: It is done. A man does not ask when, and a girl `
      + `does not ask how. ${who} will not be at the next feast, and everyone `
      + 'at it will notice.', { theme: 'royal' });
  },

  /** The list, which is your own list whether you meant to keep one or not. */
  async aryaList({ say, npc }) {
    await say(npc.data?.line ?? 'Arya: I am no one.');
    /* The ids in that list come from three places - a duellist, `duel_<id>`
       from a fight you finished, `trainer_<id>` from a leader you finished -
       so all three are unwrapped before the name is looked up, and anything
       still unrecognised is read out as it is written rather than dropped.
       Arya of all people does not forget a name because it was filed oddly. */
    const PREFIX = ['duel_', 'trainer_'];
    const nameOf = (raw) => {
      const cut = PREFIX.find((one) => raw.startsWith(one));
      const id = cut ? raw.slice(cut.length) : raw;
      return DUELLISTS[id]?.name ?? TRAINERS[id]?.name
        ?? id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
    };
    const dead = [...new Set(theDead().map(nameOf))];
    if (!dead.length) {
      await say('Arya: I say the names every night before I sleep. You have not '
        + 'given me one yet. That is either very good of you or very dull.');
      return;
    }
    await say(`Arya: You keep a list too, then. ${dead.length} of them.`);
    /* Three at a time, the way she says them. */
    for (let i = 0; i < dead.length && i < 9; i += 3) {
      await say(`Arya: ${dead.slice(i, i + 3).join('. ')}.`);
    }
    if (dead.length > 9) await say(`Arya: And ${dead.length - 9} more. You are ahead of me.`);
    await say('Arya: Saying them out loud is the whole of it. You should try it.');
  },

  /** A bravo does not haggle; he asks whether you can use the point. */
  async bravo({ say, choose, npc, overworld }) {
    await say(npc.data?.line ?? 'Bravo: We fight with the point here.');
    const pick = await choose('He is standing rather closer than he was.',
      ['Draw', 'Bow and walk on']);
    if (pick !== 0) {
      await say('Bravo: A pity. Braavos is full of people who will not, and I '
        + 'have met all of them.');
      return;
    }
    const level = Math.max(6, game.state.player.level + 1);
    const foe = makeRoamer('sellsword', level, (list) => list[0]);
    foe.name = 'A Braavosi Bravo';
    foe.intro = 'Bravo: The point, ser. Only ever the point.';
    foe.defeat = 'Bravo: Ha! The point. Everyone learns eventually.';
    const how = await overworld.startAmbush(foe);
    if (how !== 'won') return;
    addMoney(120);
    audio.sfx('money');
    await say('Bravo: The point. I said so. A hundred and twenty for the '
      + 'lesson, and you may keep the lesson.');
  },

  /**
   * A merchant of cheese and spice, and of kings when the market is right.
   * He feeds you — which is how Pentos got somewhere to mend — and he pays a
   * retainer on every seat you have taken since he last saw you, because a man
   * backing a claimant pays by results.
   */
  async illyrio({ say, choose, npc, healParty }) {
    await say(npc.data?.line ?? 'Illyrio Mopatis: Sit. Eat.');
    const paidFor = game.state.player.illyrioPaid ?? 0;
    const owed = Math.max(0, sigilCount() - paidFor);
    const options = ['Sit and eat'];
    if (owed) options.push(`Speak of the realm (${owed} seat${owed > 1 ? 's' : ''})`);
    options.push('Nothing');
    const pick = await choose('Illyrio Mopatis: What is it to be?', options);

    if (pick === 0) {
      healParty();
      game.state.player.hp = maxVigour();
      game.state.player.wounded = false;
      const ally = activeCompanion();
      if (ally && ally.hp < ally.maxHp) restCompanion();
      audio.sfx('heal');
      await say('Duck, honeyed figs, a Myrish physician who does not ask what '
        + 'the cut was from, and a bed in a room with no lock on the outside. '
        + 'You leave mended and slightly heavier.');
      return;
    }
    if (owed && pick === 1) {
      const paid = owed * 400;
      addMoney(paid);
      game.state.player.illyrioPaid = sigilCount();
      audio.sfx('money');
      await say(`Illyrio Mopatis: ${owed === 1 ? 'A seat' : 'Seats'} taken. I `
        + 'am a merchant, and a merchant pays on delivery. '
        + `${paid} gold, and do not tell me what it is for.`, { theme: 'royal' });
      return;
    }
    await say('Illyrio Mopatis: Then eat something on your way out. You look '
      + 'like a man who is about to do something expensive.');
  },

  /** An exile with nowhere to be. He has been looking for somebody to follow. */
  async jorah({ say, choose, npc }) {
    await say(npc.data?.line ?? 'Ser Jorah Mormont: I was a lord once.');
    if (hasSworn('jorah')) {
      await say('Ser Jorah: I ride with you. You need not ask me twice, and I '
        + 'would rather you did not.');
      return;
    }
    if (swornFull()) {
      await say('Ser Jorah: You have as many swords as one table feeds. I have '
        + 'sat at tables like that. Come back when there is a place.');
      return;
    }
    const pick = await choose('Ser Jorah: I am a exile with a sword and no one '
      + 'to point it at. That is a poor way to end.', ['Come with me', 'Not now']);
    if (pick !== 0) {
      await say('Ser Jorah: Then I will be here. I am always here.');
      return;
    }
    takeIntoService({ name: 'Ser Jorah Mormont', sprite: 'knight',
      level: Math.max(12, game.state.player.level), house: null }, 'jorah');
    audio.sfx('confirm');
    await say(`Ser Jorah: Then you have a bear. There are now ${hostSize()} `
      + 'sworn to you, and one of them has been exiled for slaving, which you '
      + 'will hear about from somebody eventually.', { theme: 'royal' });
  },

  /** A khal who cannot ride is no khal, and you walk everywhere. */
  async dothraki({ say, choose, npc }) {
    await say(npc.data?.line ?? 'Dothraki Rider: You walk everywhere.');
    const price = 900;
    if (party().some((c) => c.speciesId === 'courser')) {
      await say('Dothraki Rider: You have a horse. Ride it, then, instead of '
        + 'standing next to it talking to me.');
      return;
    }
    const pick = await choose(`A courser, broken to the saddle. ${price}g.`,
      ['Buy the horse', 'Walk']);
    if (pick !== 0) {
      await say('Dothraki Rider: Then walk. It is what you are for, apparently.');
      return;
    }
    if (!canAfford(price)) {
      await say('Dothraki Rider: You cannot buy a horse with that. You could '
        + 'buy a look at one.');
      return;
    }
    addMoney(-price);
    const horse = createCreature('courser', Math.max(8, game.state.player.level - 2));
    const where = addCreature(horse);
    audio.sfx('confirm');
    await say(`He puts the reins in your hand and does not let go of them for a `
      + `moment. ${displayName(horse)} is ${where === 'party' ? 'yours, and at your heel' : 'sent on to your holdfast'}.`);
  },

  /**
   * The flames, which are the only thing in the game that will tell you plainly
   * where you stand: what the season is, how far south the dead have walked,
   * which seat is next, and whether something has come down on a town.
   */
  async redPriestess({ say, npc }) {
    await say(npc.data?.line ?? "Red Priestess: The night is dark and full of terrors.");
    await say(`Red Priestess: I see the season. It is ${seasonWord()}. `
      + deadReachWord());
    /* The nine seats, read off the leaders who hold them rather than out of a
       second list that could disagree with the first. */
    const next = Object.values(TRAINERS)
      .find((t) => t.leader && t.sigil && t.sigil !== 'crown' && !hasSigil(t.sigil));
    if (next) {
      await say(`Red Priestess: I see a seat that has not bent, and ${next.name} `
        + 'sitting in it. That is the one in front of you.');
    } else {
      await say('Red Priestess: I see nine seats bent and a tenth that is only '
        + 'a chair with a woman in it. Go and sit down.');
    }
    const town = settledOn();
    if (town) {
      await say('Red Priestess: And I see fire that is not mine, over '
        + `${getMap(town).name}. It is eating. It will not stop being hungry `
        + 'because you are busy.', { theme: 'royal' });
    }
  },

  /** Old Volantis was first, and Old Volantis still keeps a ledger of men. */
  async triarch({ say, choose, npc }) {
    await say(npc.data?.line ?? 'Triarch: Old Volantis was first.');
    if (hasSworn('volanteneFreedman')) {
      await say('Triarch: You bought one. He works for you now rather than for '
        + 'me, which I am told is a great difference.');
      return;
    }
    const price = 700;
    if (swornFull()) {
      await say('Triarch: You have no room at your table. A man with no room '
        + 'is no use to a man with too many men.');
      return;
    }
    const pick = await choose('Triarch: There is a man in my ledger with five '
      + `tears on his cheek and a sword hand. ${price} gold buys the page he is `
      + 'written on. What you do with the page is your affair.',
    ['Buy the page and burn it', 'Leave him in the ledger']);
    if (pick !== 0) {
      await say('Triarch: As you like. He will still be in it.');
      return;
    }
    if (!canAfford(price)) {
      await say('Triarch: Not at that price you do not.');
      return;
    }
    addMoney(-price);
    takeIntoService({ name: 'A Freed Spear', sprite: 'sellsword',
      level: Math.max(10, game.state.player.level - 3), house: null },
    'volanteneFreedman');
    recordChoice('freedAMan', true);
    audio.sfx('confirm');
    await say('He looks at the ashes a long moment, and then at you, and picks '
      + `up a spear. There are now ${hostSize()} sworn to you, and one of them `
      + 'has five tears on his cheek and intends to keep them.', { theme: 'royal' });
  },

  /** The Long Bridge has stood a thousand years and has always been paid for. */
  async bridgeToll({ say, choose, npc, overworld }) {
    await say(npc.data?.line ?? 'Bridge Guard: Walk on the left.');
    if (game.state.choices?.bridgePaid) {
      await say('Bridge Guard: You have paid this month. Walk on the left.');
      return;
    }
    const toll = 60;
    const pick = await choose(`Bridge Guard: ${toll} for a foreigner, and you `
      + 'are about as foreign as they come.', [`Pay ${toll}g`, 'Refuse']);
    if (pick === 0) {
      if (!canAfford(toll)) {
        await say('Bridge Guard: Then walk round. It is four hundred miles.');
        return;
      }
      addMoney(-toll);
      recordChoice('bridgePaid', true);
      await say('Bridge Guard: Left. I will not say it again.');
      return;
    }
    await say('Bridge Guard: Everybody refuses once.');
    const level = Math.max(8, game.state.player.level);
    const guard = makeRoamer('goldCloak', level, (list) => list[0]);
    guard.name = 'A Bridge Guard';
    guard.intro = 'Bridge Guard: Everybody refuses once.';
    guard.defeat = 'Bridge Guard: ...walk on the left.';
    const how = await overworld.startAmbush(guard);
    if (how !== 'won') return;
    recordChoice('bridgePaid', true);
    recordChoice('bridgeFought', true);
    await say('He sits down heavily against the parapet and waves you across '
      + 'with the hand that still works. Nobody asks you for a toll in Volantis '
      + 'again.');
  },

  /**
   * Nineteen languages, and the queen's household. Meereen's answer to a
   * maester, which is what it did not have.
   */
  async missandei({ say, choose, npc, healParty, saveGame }) {
    await say(npc.data?.line ?? 'Missandei: This city is complicated.');
    const pick = await choose('Missandei: The Queen keeps healers, and the '
      + 'Queen is not here. Shall I send for one?',
    ['See to my creatures', 'Write my progress down', 'Nothing']);
    if (pick === 1) {
      const ok = saveGame();
      await say(ok
        ? 'Missandei: Written, in three languages, so that it cannot be '
          + 'misunderstood by anybody.'
        : 'Missandei: It will not take. Your browser may be refusing it.');
      return;
    }
    if (pick !== 0) {
      await say('Missandei: Then be careful. This city is not fond of visitors '
        + 'who are careful, and much less fond of the others.');
      return;
    }
    healParty();
    game.state.player.hp = maxVigour();
    game.state.player.wounded = false;
    const ally = activeCompanion();
    if (ally && ally.hp < ally.maxHp) restCompanion();
    audio.sfx('heal');
    await say('Cool water, clean linen, and a woman who tells you exactly what '
      + 'she is doing before she does it. You and yours are mended.');
  },

  /** Four days to Braavos with this wind, and here is what is in the way. */
  async deckhand({ say, npc, overworld }) {
    await say(npc.data?.line ?? 'Deckhand: Four days with this wind.');
    const rows = seaLane(overworld?.mapId ?? game.state.position.map);
    if (!rows?.length) {
      await say('Deckhand: Nothing out here but water and the occasional bad '
        + 'idea. Mostly ours.');
      return;
    }
    const names = rows.map((row) => FLEETS[row.fleet]?.name).filter(Boolean);
    await say(`Deckhand: What is out here? ${[...new Set(names)].join(', ')}. `
      + 'Any of them will come alongside if the captain looks tired.');
  },

  /**
   * Passage across the Narrow Sea. The captain will take you anywhere he has a
   * price for, and the price is the same in both directions.
   */
  async ship({ say, choose, npc, overworld }) {
    const here = overworld.map.id;
    const ports = PORTS.filter((p) => p.map !== here);
    const who = npc?.name ?? "Ship's Captain";

    /* Eleven harbours wrote their own captain and the script spoke over all of
       them with the same line, and then went on as "Ship's Captain" to a man
       the map calls The Harbourmaster. Their line first, and their name on
       everything after it. */
    await say(npc?.data?.line ?? `${who}: I sail where the money is. Name a port.`);
    const labels = ports.map((p) => `${p.name} (${p.fare}g)`);
    const pick = await choose('Where to?', [...labels, 'Nowhere yet']);
    if (pick < 0 || pick >= ports.length) {
      await say(`${who}: Then get off my deck or make yourself useful.`);
      return;
    }

    const port = ports[pick];
    /* A captain will not carry you somewhere you have not earned. The wardens
       hold the roads against anybody with too few seats behind them, and for a
       long time the sea held nothing at all -- so a full purse skipped the
       whole ladder. Gold is not an achievement. */
    const held = sigilCount();
    if ((port.needs ?? 0) > held) {
      await say(`${who}: ${port.name}? With ${held} seat${held === 1 ? '' : 's'} `
        + `behind you? They would have you off my deck and in the harbour. `
        + `Come back with ${port.needs}.`);
      return;
    }
    if (!canAfford(port.fare)) {
      await say(`${who}: ${port.fare} gold dragons. Come back when you have them.`);
      return;
    }
    addMoney(-port.fare);
    audio.sfx('confirm');
    await say(`${who}: ${port.name} it is. Find somewhere to sit and do not be sick `
      + 'anywhere I can see.');
    await say('The crossing takes days. You sleep badly and eat worse.');
    overworld.sailTo(port);
  },

  // ---------------------------------------------------------- Winterfell ----
  async oldNan({ say }) {
    const lines = [
      'Old Nan: In the long night, the cold came down and the sun hid its face for a generation.',
      'Old Nan: The Others rode dead horses, and what they killed got up again and walked behind them.',
      'Old Nan: You think it is a story. Everyone thinks it is a story, right up until it is not.',
    ];
    for (const line of lines) await say(line);
  },

  /** Jory holds the gate until you have proved you can hold a sword. */
  async joryGate({ say, npc, duel, setFlag, flag }) {
    if (flag('duel_joryCassel')) {
      await say(DUELLISTS.joryCassel.after);
      return;
    }
    if (!flag('gotStarter')) {
      await say('Jory Cassel: Maester Luwin wants you, down by the south road. Go on.');
      return;
    }
    await say('Jory Cassel: Lord Rickard will not send a rider south who cannot hold a blade. Humour me.');
    const outcome = await duel('joryCassel');
    if (outcome === 'won') {
      setFlag('duel_joryCassel');
      await say(DUELLISTS.joryCassel.after);
      /* And the thing that says whose rider you are, handed over at the moment
         you are allowed to be one. */
      giveItem('houseRing');
      audio.sfx('confirm');
      await say('Jory Cassel: Take this. Lord Rickard\'s signet. Every inn '
        + 'between here and the Neck knows it, and none of them will take your '
        + 'coin while you carry it.', { theme: 'royal' });
    } else {
      await say('Jory Cassel: Again, when you have your wind back. The road will keep.');
    }
  },

  async winterfellStable({ say }) {
    await say('Stablehand: Hold B while you walk and you will move a good deal faster. Saves the boots.');
  },

  async winterfellSepta({ say }) {
    await say('Septa: The old gods have no septs and no songs. They have that tree, and they have never needed more.');
    await say('Septa: Stand before a heart tree and you may feel watched. You are.');
  },

  async blackBrother({ say, choose }) {
    await say("Recruiter: The Night's Watch is short of men. Always has been. Interested?");
    const answer = await choose('Take the black?', ['Yes', 'No']);
    if (answer === 0) {
      await say('Recruiter: Good lad. Wrong answer, but good lad. Come back when you have seen the South and hated it.');
    } else {
      await say('Recruiter: Sensible. Cold up there. Cold and getting colder.');
    }
  },

  async gymHintStark({ say }) {
    await say('Steward: Lord Rickard fights with BEAST creatures. Frost bites them hard, and so does a good wing.');
  },

  async gymStark({ say, npc, overworld, setFlag, flag }) {
    const def = TRAINERS.gymStark;
    if (flag('trainer_gymStark')) {
      await say(def.after);
      return;
    }
    if (party().length === 0) {
      await say('Lord Rickard: Come back when you have something to fight with.');
      return;
    }
    await say(def.intro);
    const outcome = await overworld.startAmbush(trainerAsDuellist('gymStark'));
    if (outcome === 'won') {
      setFlag('trainer_gymStark');
      await say(def.after);
      giveItem('warBanner', 3);
      await say('You also received three War Banners.');
    }
  },

  async wolfswoodHint({ say }) {
    await say('Woodsman: See that drop? You can jump down it, but you will be walking the long way round to get back.');
  },

  // ---------------------------------------------------------- Moat Cailin --
  async moatHint({ say }) {
    await say('Crannogman: Water that looks like ground has drowned better travellers than you. Stay on the causeway.');
  },

  async rivalMoat({ say, npc, overworld, setFlag, flag }) {
    const def = TRAINERS.rival1;
    if (flag('trainer_rival1')) {
      await say(def.after);
      return;
    }
    await say(def.intro);
    const outcome = await overworld.startAmbush(trainerAsDuellist('rival1'));
    if (outcome === 'won') {
      setFlag('trainer_rival1');
      await say(def.after);
      npc.hidden = true;
    }
  },

  // ---------------------------------------------------------- Riverlands ---
  async riverlandsHint({ say }) {
    await say('Traveller: A creature that is asleep or frozen is far easier to win over. Weaken it, then raise your banner.');
  },

  // ------------------------------------------------------------- Riverrun --
  async riverrunSquire({ say }) {
    await say('Squire: Lady Catelyn holds the Trout Sigil in the keep, south of the square.');
    await say('Squire: She fights with TIDE creatures. Bring something green, or something that crackles.');
  },

  async riverrunHint({ say }) {
    await say('Boatwright: Every creature has two types, most of them. Hit both badly and it hardly matters how strong it is.');
  },

  async riverrunFishwife({ say, choose }) {
    if (hasItem('weirwoodBanner')) {
      await say('Fishwife: Use that weirwood banner well. There is not another.');
      return;
    }
    await say('Fishwife: You have the look of someone who has been kind to a creature or two.');
    const answer = await choose('She offers you something wrapped in cloth. Take it?', ['Yes', 'No']);
    if (answer === 0) {
      giveItem('weirwoodBanner', 1);
      audio.sfx('confirm');
      await say('You received a Weirwood Banner! Almost nothing refuses it.');
    } else {
      await say('Fishwife: It will keep.');
    }
  },

  async innkeep({ say, choose, healParty }) {
    const answer = await choose('Innkeep: A room is 50 gold dragons, and your creatures eat free.',
      ['Take a room', 'Not tonight']);
    if (answer === 0) await rentRoom({ say, healParty });
  },

  async innDrunk({ say }) {
    await say('Drunk: There is a cave off the Gold Road. Something walks in it that should not walk at all.');
    await say('Drunk: Bring fire. Bring dragonglass. Bring somebody else.');
  },

  async gymHintTully({ say }) {
    await say('Steward: TIDE creatures drown a fire and crush a stone. Storms and green things undo them.');
  },

  async gymTully({ say, overworld, setFlag, flag }) {
    const def = TRAINERS.gymTully;
    if (flag('trainer_gymTully')) {
      await say(def.after);
      return;
    }
    if (!hasSigil('wolf')) {
      await say('Lady Catelyn: You carry no sigil at all. Earn one in the North first, and then we will talk.');
      return;
    }
    await say(def.intro);
    const outcome = await overworld.startAmbush(trainerAsDuellist('gymTully'));
    if (outcome === 'won') {
      setFlag('trainer_gymTully');
      await say(def.after);
      giveItem('kingsguardBanner', 2);
      await say('You also received two Kingsguard Banners.');
    }
  },

  // ----------------------------------------------------- the Iron Islands --
  async shoreHint({ say }) {
    await say('Salt Wife: There is a hole in the cliff off the path. Smugglers use it.');
    await say('Salt Wife: They will not thank you for finding it. Nothing here thanks anybody.');
  },

  async bridgeHint({ say }) {
    await say('Bridgekeeper: Three stacks, two bridges, one rope apiece that anybody has checked.');
    await say('Bridgekeeper: Do not look down. That is not superstition, it is advice.');
  },

  /** Somebody on Pyke or at Lordsport with something to say about the rock. */
  async pykeLocal({ say, npc }) {
    await say(npc.data?.line ?? `${npc.name} looks at the sea instead of at you.`);
  },

  /** And somebody in the Dreadfort, saying as little as they can get away with. */
  async dreadfortLocal({ say, npc }) {
    await say(npc.data?.line ?? `${npc.name} does not look up.`);
  },

  /** Somebody in a hole in the ground who did not expect company. */
  async hideoutLocal({ say, npc }) {
    await say(npc.data?.line ?? `${npc.name} keeps one hand on a knife the whole time.`);
  },

  // ------------------------------------------------- inns and common houses --
  /** The innkeep: a bed, a meal, and a counter with remedies on it. */
  /* The keeper of a town inn built by makeInn.
   *
   * This was a second "innkeep", and the second key in an object literal wins:
   * it silently replaced the one above, so Riverrun's inn stopped charging for
   * a room and stopped setting where you wake up when you lose. It also threw
   * away the shelf: thirteen inns were written with a stock list, and this
   * read the keeper's line and nothing else. Its own name now, the room the
   * original inn rents, and the shelf the author stocked. */
  async townInnkeep({ say, choose, npc, healParty, openShop }) {
    await say(npc.data?.line ?? 'Innkeep: Bed, board, and mind the step.');
    const stock = Array.isArray(npc.data?.stock) ? npc.data.stock : [];
    const wants = stock.length
      ? ['Take a room', 'See the shelf', 'Not tonight']
      : ['Take a room', 'Not tonight'];
    const pick = await choose('Innkeep: A room is 50 gold dragons, and your creatures eat free.', wants);
    if (pick === 0) await rentRoom({ say, healParty });
    else if (stock.length && pick === 1) await openShop(stock);
  },

  /** Somebody in the taproom who has been here a while. */
  async taproom({ say, npc }) {
    await say(npc.data?.line ?? 'They raise a cup at you and go back to it.');
  },

  /** And whoever else is in it, which is where the town's news lives. */
  async houseTalk({ say, npc }) {
    await say(npc.data?.line ?? `${npc.name} has better things to do.`);
  },

  // ------------------------------------------------------------ Gold Road --
  async goldRoadHint({ say }) {
    await say('Miner: The barrow-cave west of the road goes deeper than anyone has mapped.');
    await say('Miner: Something down there is older than the road, the Rock, and probably the gods.');
  },

  /** The optional legendary. */
  async palewalker({ say, npc, battle, setFlag, flag }) {
    if (flag('palewalker_done')) {
      npc.hidden = true;
      return;
    }
    await say('The cold here is wrong. It is not weather. It is attention.');
    await say('Something pale unfolds out of the dark and looks at you with eyes like a winter sky.');
    const foe = createCreature('palewalker', 42);
    const outcome = await battle({ kind: 'wild', foe });
    if (outcome === 'caught' || outcome === 'won') {
      setFlag('palewalker_done');
      npc.hidden = true;
      if (outcome === 'won') {
        await say('It came apart into a drift of frost, and the cave was only a cave again.');
      }
    } else {
      await say('It watches you go. It is in no hurry.');
    }
  },

  // ----------------------------------------------------------- Lannisport --
  async lannisportGuard({ say }) {
    await say('Gold Cloak: Casterly Rock is up the stair. Ser Jaime holds the Lion Sigil and gives it to almost nobody.');
  },

  async rivalLannisport({ say, npc, overworld, setFlag, flag }) {
    const def = TRAINERS.rival2;
    if (flag('trainer_rival2')) {
      await say(def.after);
      return;
    }
    await say(def.intro);
    const outcome = await overworld.startAmbush(trainerAsDuellist('rival2'));
    if (outcome === 'won') {
      setFlag('trainer_rival2');
      await say(def.after);
      npc.hidden = true;
    }
  },

  async gymHintLannister({ say }) {
    await say('Steward: Ser Jaime fields BEAST and STEEL. Flame melts one; a good hard hit settles the other.');
  },

  async gymLannister({ say, overworld, setFlag, flag }) {
    const def = TRAINERS.gymLannister;
    if (flag('trainer_gymLannister')) {
      await say(def.after);
      return;
    }
    if (!hasSigil('trout')) {
      await say('Ser Jaime: Two sigils to climb the Rock. You are one short. Riverrun is that way.');
      return;
    }
    await say(def.intro);
    const outcome = await overworld.startAmbush(trainerAsDuellist('gymLannister'));
    if (outcome === 'won') {
      setFlag('trainer_gymLannister');
      await say(def.after);
      giveItem('kingsRansom', 2);
      await say("You also received two King's Ransoms.");
    }
  },

  // ------------------------------------------------------------ Kingsroad --
  async kingsroadHint({ say }) {
    await say('Pilgrim: Three sigils on your banner and the Red Keep will open its doors.');
    await say('Pilgrim: Whether you walk back out of it is between you and the gods.');
  },

  // -------------------------------------------------------- King's Landing --
  async klHint({ say, npc }) {
    const counts = dexCounts();
    if (npc?.data?.line) await say(spoken(npc));
    await say(`${npc?.name ?? 'Beggar'}: You have met ${counts.seen} kinds of creature and won over ${counts.caught}. That is more than most lords manage.`);
  },

  async klRecruiter({ say }) {
    await say("Recruiter: Still short of men. The Wall does not garrison itself.");
    await say('Recruiter: They say something is stirring beyond it. They have said that for a hundred years, mind.');
  },

  async klStranger({ say }) {
    await say('Stranger: Fire and blood built this city and fire and blood will have it back.');
    await say('Stranger: When you sit in that chair, remember who was here before you. Everyone forgets. That is how it keeps happening.');
  },

  async rivalThrone({ say, npc, overworld, setFlag, flag }) {
    const def = TRAINERS.rival3;
    if (flag('trainer_rival3')) {
      await say(def.after);
      return;
    }
    await say(def.intro);
    const outcome = await overworld.startAmbush(trainerAsDuellist('rival3'));
    if (outcome === 'won') {
      setFlag('trainer_rival3');
      await say(def.after);
      npc.hidden = true;
    }
  },


  // =========================================================================
  //  The North and the Wall
  // =========================================================================
  async northRoadHint({ say }) {
    await say('Carter: Road keeps going north till it runs out of road. Then it is just the Wall.');
    await say('Carter: Wrap up. And do not talk to anything that talks back.');
  },

  async wallHint({ say, npc }) {
    const who = npc?.name ?? 'Steward';
    if (npc?.data?.line) await say(spoken(npc));
    await say(`${who}: The Watch holds the Wall with a tenth of the men it needs.`);
    await say(`${who}: Beyond it, the wights come in numbers. Bring fire, or dragonglass, or both.`);
  },

  async aemon({ say }) {
    await say('Maester Aemon: I am blind, old, and a Targaryen. Two of those I can do nothing about.');
    await say('Maester Aemon: Kill the boy and let the man be born. It is the only advice worth the raven.');
  },

  /** The white direwolf beyond the Wall. */
  async ghostfang({ say, npc, battle, setFlag, flag }) {
    if (flag('ghostfang_done')) { npc.hidden = true; return; }
    await say('The snow ahead is moving. Not blown — walking.');
    await say('A direwolf the colour of the drifts steps out and looks straight through you.');
    const foe = createCreature('ghostfang', 46);
    const outcome = await battle({ kind: 'wild', foe });
    if (outcome === 'caught' || outcome === 'won') {
      setFlag('ghostfang_done');
      npc.hidden = true;
      if (outcome === 'won') await say('It turns and is gone into the white, unhurried.');
    } else {
      await say('It watches you leave. It does not follow. That is somehow worse.');
    }
  },

  /* --------------------------------------------------- something living --
   *
   * One script for every animal that stands in the world and waits: the three
   * wild dragons, the sea dragon on her beach, and whatever is at the bottom
   * of each cave. Everything that differs between them is written on the map -
   * which animal, how big, and what it says - and a cave that has nothing
   * particular to say falls through to lines that suit anything with teeth.
   *
   * Beating one does not kill it. It breaks off, climbs, and is back on the
   * same rock the next time you walk in - so the fight can be lost, learnt
   * from and come back to, and taking one alive is a thing you choose to do
   * rather than a roll you get one of. Only catching it empties the place.
   */
  async wildBeast({ say, choose, npc, battle, setFlag, flag }) {
    const d = npc.data;
    if (flag(d.taken)) { npc.hidden = true; return; }

    const waking = d.waking ?? [
      'Something at the back of the chamber moves, and goes on moving for '
      + 'longer than a thing that size ought to need.',
    ];
    for (const line of waking) await say(line);
    /* Nothing at heel that can stand up is not a hard fight, it is a battle
       screen with nobody on your side of it: the drawing reaches for a
       creature that is not there and the game stops. Every other way into a
       wild fight already checks this; this one is reached by walking up to
       something and pressing a button, which is the easiest of all of them to
       do with an empty party. */
    if (!party().some((c) => c.hp > 0)) {
      await say('You have nothing on its feet to put between you and that. '
        + 'Whatever this is going to be, it is not going to be today.');
      return;
    }
    const pick = await choose(
      flag(d.met) ? 'It knows you now. It is waiting to see what you do.'
        : 'It has not decided about you yet.',
      ['Stand your ground', 'Back away slowly'],
    );
    if (pick === 1) {
      await say(d.spared ?? 'You go back the way you came, slowly. It lets you, '
        + 'which is an answer of a kind.');
      return;
    }
    setFlag(d.met);

    const outcome = await battle({ kind: 'wild', foe: createCreature(d.species, d.level) });
    if (outcome === 'caught') {
      setFlag(d.taken);
      npc.hidden = true;
      await say(d.taking ?? `${npc.name} comes with you, which is not something `
        + 'anybody who knows this place would have believed.');
      return;
    }
    if (outcome === 'won') {
      // Driven off, not killed, and only until you leave and come back.
      npc.hidden = true;
      await say(d.driven ?? 'It breaks off and goes deeper, and the dark closes '
        + 'over the sound of it. It will be here again.');
      return;
    }
    await say(d.lost ?? 'It does not follow you out. It does not need to.');
  },

  // =========================================================================
  //  The Vale
  // =========================================================================
  async littlefinger({ say }) {
    await say('Lord Baelish: Chaos is a ladder. Most people never look up long enough to notice.');
    await say('Lord Baelish: You have collected sigils. Good. Collect debts next — they last longer.');
  },

  async lysa({ say }) {
    await say('Lady Arryn: The Vale has stayed out of every war since the Conquest. That is not cowardice, it is arithmetic.');
    await say('Lady Arryn: Do not ask me for knights. Ask me for a bed and I might say yes.');
  },

  /** Somebody with nothing to do but say the one line written on them. */
  async bellowsHand({ say, npc }) {
    await say(npc?.data?.line ?? 'They have nothing to say to you.');
    const aside = asideFor();
    if (aside) await say(aside);
  },

  async eyrieHint({ say, npc }) {
    const who = npc?.name ?? 'Guard';
    if (npc?.data?.line) await say(spoken(npc));
    await say(`${who}: Sky cells have three walls and a very persuasive fourth side.`);
    await say(`${who}: WIND creatures nest all over the mountain. Bring something that throws stones.`);
  },

  // =========================================================================
  //  The Reach
  // =========================================================================
  async olenna({ say }) {
    await say('Lady Olenna: You are the northern one everybody is talking about. You are shorter than the stories.');
    await say('Lady Olenna: A word of advice, since it costs me nothing: the throne is a chair. Chairs can be moved.');
  },

  async margaery({ say }) {
    await say('Margaery: The smallfolk will love you if you let them see you. That is most of ruling.');
    await say('Margaery: The rest is knowing which of your friends is counting your guards.');
  },

  async reachHint({ say, npc }) {
    if (npc?.data?.line) await say(spoken(npc));
    await say(`${npc?.name ?? 'Gardener'}: WILD creatures thrive here. Fire and cold both undo them, and so does a good hard wing.`);
  },

  // =========================================================================
  //  Dorne
  // =========================================================================
  async doran({ say }) {
    await say('Prince Doran: I am slow, and gouty, and I have outlived cleverer men than you.');
    await say('Prince Doran: Dorne remembers every slight. We simply take our time about them.');
  },

  async dorneHint({ say, npc }) {
    if (npc?.data?.line) await say(spoken(npc));
    await say(`${npc?.name ?? 'Orphan'}: VENOM creatures own the sands. Steel turns their fangs; nothing else does.`);
  },

  // =========================================================================
  //  The Stormlands
  // =========================================================================
  async melisandre({ say, choose }) {
    await say('Melisandre: The night is dark and full of terrors. You already knew that, or you would not be armed.');
    const answer = await choose('She offers to look into the flames for you. Let her?', ['Yes', 'No']);
    if (answer === 0) {
      await say('Melisandre: I see snow, and a chair made of swords, and a shadow with wings.');
      await say('Melisandre: The flames do not lie. They simply do not explain.');
    } else {
      await say('Melisandre: Wise. Most people do not like what looks back.');
    }
  },

  async davos({ say }) {
    await say('Ser Davos: I was a smuggler before I was a ser. The king took my fingertips and gave me a title.');
    await say('Ser Davos: Whatever you become, keep somebody near you who will tell you when you are wrong.');
  },

  async stormHint({ say, npc }) {
    if (npc?.data?.line) await say(spoken(npc));
    await say(`${npc?.name ?? 'Fisherman'}: STORM creatures ride the front in off the bay. Stone weathers them best.`);
  },

  // =========================================================================
  //  Dragonstone
  // =========================================================================
  /** The Black Dread, sleeping under Dragonstone. */
  /**
   * The nest under the Dragonmont. You do not fight what lives here — you
   * could not — you decide whether to take something from it.
   */
  /* The keeper who tends it, rather than the animal.
     This was the animal: an NPC with no name and a red cloak standing in the
     middle of a three-tile chamber, and every word written here — enormous,
     an eye the colour of a forge, a head that comes down level with yours —
     was contradicted by the man-shaped sprite saying it. The dragon is drawn
     into the floor of the roost now and needs nobody to describe it, so this
     is the one person in Westeros who is not afraid of it. It also means it
     does not have to vanish afterwards: a dragon leaving because you took an
     egg was only ever a way of getting a wrong picture off the screen. */
  async blackdread({ say, choose, npc, setFlag, flag }) {
    if (flag('blackdread_done')) {
      await say('Dragonkeeper: Two left in the ash, and neither of them is yours. Go and walk the '
        + 'one you have — they hatch for the walking, not the waiting.');
      return;
    }
    await say('Dragonkeeper: Stop there. It has seen you, and it will decide about you in its '
      + 'own time and not in yours.');
    await say('The heat in here is wrong for a cave. The rock underfoot is warm as a hearthstone.');
    await say('The great head comes round, and one eye the colour of a forge opens on you.');
    await say('It does not attack. It watches you the way you would watch a mouse cross a room.');

    // It knows a Targaryen banner when it sees one, which is the whole of what
    // being one is worth.
    const dragonblood = allegiance() === 'targaryen';
    if (dragonblood) {
      await say('Then it puts its head down, level with yours, and breathes out — hot, and '
        + 'not at you.');
      await say('Dragonkeeper: Well. It has not done that for anybody in my lifetime.');
      await say('Whatever your banner means to the men who fight under it, it means '
        + 'something older down here.');
    }
    await say('Dragonkeeper: Behind it, banked in the ash. Three of them.');

    const take = await choose('Take one?', ['Take an egg', 'Leave them be']);
    if (take !== 0) {
      recordChoice('dragonEgg', 'left');
      await say('You back out the way you came. The eye follows you the whole way and does not blink.');
      await say('Some part of you will wonder about that for the rest of your life.');
      setFlag('blackdread_done');
      return;
    }

    await say('You lift the smallest. It is heavier than it looks and hot enough to hurt.');
    await say('The great head lowers until it is level with yours. Then it turns away.');
    recordChoice('dragonEgg', 'taken');

    // A Targaryen is not stealing. It hatches sooner for them, and Dragonstone
    // thinks better of them for it rather than worse.
    giveEgg('emberling', {
      steps: dragonblood ? 180 : 320,
      from: 'the Dragonmont',
    });
    audio.sfx('caught');
    await say('You are carrying a dragon egg.');
    if (dragonblood) {
      await say('It is already warm against your ribs. It knows whose blood is carrying it.');
      changeStanding('targaryen', 12);
    } else {
      await say('Maester Luwin said eggs like this hatch for the walking, not the waiting. So walk.');
      // Whoever still holds Dragonstone notices a stranger leaving with one.
      changeStanding('targaryen', -10);
    }
    setFlag('blackdread_done');
  },

  // --------------------------------------------------------- the endgame ---
  async gymThrone(api) {
    const { say, overworld, setFlag, flag } = api;
    const def = TRAINERS.gymThrone;
    // Once the chair is yours, sitting it again is a turn of ruling rather than
    // a repeat of the fight that won it.
    if (flag('gameComplete')) {
      if (!reigning()) {
        await say('They took the crown off you. The chair is somebody else\'s problem now.');
        return;
      }
      await overworld.holdCourt();
      return;
    }
    /* The queen is beaten and the chair is not yours, which means the thing
       behind it put you down. It is not standing on any map - nobody can walk
       up to it - so without this the last fight in the game could be lost
       exactly once and then never fought again, and the story stopped there
       forever. It is waiting in the same shadow every time you come back up. */
    if (flag('cerseiFell') && !flag('gameComplete')) {
      await finishTheChair(api, def);
      return;
    }
    if (flag('trainer_gymThrone')) {
      await say(def.after);
      return;
    }
    if (sigilCount() < 3) {
      await say(`The Claimant: Three sigils buy you an audience. You have ${sigilCount()}. Come back when the realm knows your name.`);
      return;
    }
    await say(def.intro, { theme: 'royal' });
    const outcome = await overworld.startAmbush(trainerAsDuellist('gymThrone'));
    if (outcome !== 'won') return;

    setFlag('trainer_gymThrone');
    await say(def.defeat, { theme: 'royal' });

    // She does not concede the chair to someone who only beat her animals.
    const duelOutcome = await api.duel('cersei');
    if (duelOutcome !== 'won') {
      await say('Cersei Lannister: Come back when you can finish what you start.', { theme: 'royal' });
      return;
    }

    /* And the thing standing behind the chair, which has been there the whole
       time. The queen going down is not the end of the game: it is the moment
       the last of it stands up. This build used to hand over the throne here,
       so the fight the cartridge has always finished on never happened, and
       neither did the two sequences either side of it. */
    setFlag('cerseiFell');
    await finishTheChair(api, def);

  },


  // ------------------------------------------------- the other eight seats ---
  // Five of these were written out longhand and the differences between them
  // were the name and the parting gift. One shape, nine seats: say your piece,
  // fight, hand over the sigil.
  ...Object.fromEntries(['gymArryn', 'gymTyrell', 'gymMartell', 'gymBaratheon', 'gymTargaryen']
    .map((id) => [id, async function ({ say, overworld, setFlag, flag }) {
      const def = TRAINERS[id];
      if (flag(`trainer_${id}`)) { await say(def.after); return; }
      await say(def.intro);
      const outcome = await overworld.startAmbush(trainerAsDuellist(id));
      if (outcome === 'won') {
        setFlag(`trainer_${id}`);
        await say(def.after);
        giveItem('kingsRansom', 1);
        await say("You also received a King's Ransom.");
      }
    }])),
};
