// NPC behaviour. Every script is an async function so dialogue, choices,
// battles and shops can be written in a straight line.
//
// api: { subject, npc, overworld, say, choose, battle, openShop, healParty,
//        setFlag, flag }

import {
  game, party, addCreature, giveItem, hasItem, addMoney, canAfford,
  sigilCount, hasSigil, dexCounts, swearTo, allegiance, standing, standingWord,
  changeStanding, recordChoice, choice, markDead, isDead,
} from '../game/state.js';
import { HOUSES, SWEARABLE } from './houses.js';
import { giveEgg } from '../game/eggs.js';
import { beginReign, reigning } from '../game/realm.js';
import { QUESTS } from './quests.js';
import { PORTS } from './ports.js';
import { COMPANIES } from './companies.js';
import {
  holdfast, ownsHoldfast, FURNISHINGS, installed, install, seats, canCook,
  larder, INGREDIENTS, DISHES, canCookDish, cook as cookDish, dishCount,
  holdFeast, feastCount, grantHoldfast, gather,
} from '../game/holdfast.js';
import { HOUSE_IDS } from './houses.js';
import { SHIPS } from './ships.js';
import {
  ship, ownsShip, buyShip, tradeIn, shipName, shipDef, conditionWord,
  repairShip, repairCost, berth, tally, board,
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
import { maxVigour } from '../game/player.js';
import { asideFor } from '../game/regard.js';
import { MATCHES } from './matches.js';
import {
  willHear, betroth, wed, isMarried, spouse, betrothed, bearChild, childDue,
  children, heir, ageWord, takeIntoService, sworn, hostSize, swornFull,
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
    for (;;) {
      const have = ship();
      const bill = repairCost();
      const opts = ['See the hulls', have ? 'Put her right' : null, 'Nothing today']
        .filter(Boolean);
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
  async redLamp({ say, choose, npc, healParty, saveGame }) {
    const line = npc.data?.line ?? `${npc.name}: You look like a long road. Come in off it.`;
    await say(line);
    const answer = await choose('What do you want?',
      ['A bed and a wash \u2014 60g', 'What is being said', 'Nothing']);

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
  async smith({ say, npc, openSmithy }) {
    if (npc.data?.line) await say(npc.data.line);
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
   * The gangplank at King's Landing. Everything east of here starts with
   * somebody at a dock asking whether you can pay.
   */
  async harbour({ say, choose, overworld }) {
    await say('Harbourmaster: Ships out to Braavos, Pentos, Volantis and Meereen. '
      + 'The captain sets the fare, not me.');
    const answer = await choose('Go aboard?', ['Go aboard', 'Stay ashore']);
    if (answer !== 0) {
      await say('Harbourmaster: Suit yourself. The sea will still be there.');
      return;
    }
    overworld.sailTo({ map: 'narrowSea', x: 11, y: 5, dir: 'down' });
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
        ['Furnish the hall', 'Hold a feast', 'Rename the hall', 'Nothing today']);
      if (pick === 0) await SCRIPTS.furnishHall({ say, choose });
      else if (pick === 1) await SCRIPTS.feastHall({ say, choose });
      else if (pick === 2) { await overworld.renameHall(); return; }
      else return;
    }
  },

  /** Buying things to put in the hall. */
  async furnishHall({ say, choose }) {
    const available = Object.keys(FURNISHINGS).filter((id) => !installed(id));
    if (!available.length) {
      await say('Steward: There is nothing left to add that would not be showing off.');
      return;
    }
    const labels = available.map((id) => `${FURNISHINGS[id].name} (${FURNISHINGS[id].cost}g)`);
    const pick = await choose('What shall we put in?', [...labels, 'Never mind']);
    if (pick < 0 || pick >= available.length) return;

    const id = available[pick];
    const def = FURNISHINGS[id];
    await say(def.desc);
    const confirm = await choose(`${def.cost} gold. Do it?`, ['Do it', 'Not yet']);
    if (confirm !== 0) return;
    if (!install(id)) {
      await say('Steward: We cannot afford that. I have checked twice.');
      return;
    }
    audio.sfx('confirm');
    await say(`Steward: ${def.name}. The hall is the better for it.`);
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
    await say(`Cook: ${DISHES[id].name}, done. It will keep until you need it.`);
  },

  /** Somebody standing in a Free City with something to say about it. */
  async freeCityLocal({ say, npc }) {
    await say(npc.data?.line ?? `${npc.name} has nothing to say to you today.`);
  },

  /**
   * Passage across the Narrow Sea. The captain will take you anywhere he has a
   * price for, and the price is the same in both directions.
   */
  async ship({ say, choose, overworld }) {
    const here = overworld.map.id;
    const ports = PORTS.filter((p) => p.map !== here);

    await say("Ship's Captain: I sail where the money is. Name a port.");
    const labels = ports.map((p) => `${p.name} (${p.fare}g)`);
    const pick = await choose('Where to?', [...labels, 'Nowhere yet']);
    if (pick < 0 || pick >= ports.length) {
      await say("Ship's Captain: Then get off my deck or make yourself useful.");
      return;
    }

    const port = ports[pick];
    /* A captain will not carry you somewhere you have not earned. The wardens
       hold the roads against anybody with too few seats behind them, and for a
       long time the sea held nothing at all -- so a full purse skipped the
       whole ladder. Gold is not an achievement. */
    const held = sigilCount();
    if ((port.needs ?? 0) > held) {
      await say(`Ship's Captain: ${port.name}? With ${held} seat${held === 1 ? '' : 's'} `
        + `behind you? They would have you off my deck and in the harbour. `
        + `Come back with ${port.needs}.`);
      return;
    }
    if (!canAfford(port.fare)) {
      await say(`Ship's Captain: ${port.fare} gold dragons. Come back when you have them.`);
      return;
    }
    addMoney(-port.fare);
    audio.sfx('confirm');
    await say(`Ship's Captain: ${port.name} it is. Find somewhere to sit and do not be sick `
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
    } else {
      await say('Jory Cassel: Again, when you have your wind back. The road will keep.');
    }
  },

  async winterfellGuard({ say, flag }) {
    if (!flag('gotStarter')) {
      await say('Maester Luwin is looking for you, down by the south road. Do not keep him.');
      return;
    }
    if (!hasSigil('wolf')) {
      await say('The Great Keep is up the north path. Lord Rickard does not hand out sigils to people who ask nicely.');
      return;
    }
    await say('Wolf Sigil already? The South will not know what hit it.');
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

  async gymStark({ say, npc, battle, setFlag, flag }) {
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

  async rivalMoat({ say, npc, battle, setFlag, flag }) {
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
    if (answer !== 0) return;
    if (!canAfford(50)) {
      await say('Innkeep: Come back with coin.');
      return;
    }
    addMoney(-50);
    audio.sfx('heal');
    healParty();
    game.state.respawn = { ...game.state.position, dir: 'down' };
    await say('You slept until the noise downstairs became unbearable. Everyone is rested.');
  },

  async innDrunk({ say }) {
    await say('Drunk: There is a cave off the Gold Road. Something walks in it that should not walk at all.');
    await say('Drunk: Bring fire. Bring dragonglass. Bring somebody else.');
  },

  async gymHintTully({ say }) {
    await say('Steward: TIDE creatures drown a fire and crush a stone. Storms and green things undo them.');
  },

  async gymTully({ say, battle, setFlag, flag }) {
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
  async innkeep({ say, npc, healParty }) {
    await say(npc.data?.line ?? 'Innkeep: Bed, board, and mind the step.');
    healParty?.();
    await say('You eat, you sleep, and you wake up in one piece.');
  },

  /** Somebody in the taproom who has been here a while. */
  async taproom({ say, npc }) {
    await say(npc.data?.line ?? 'They raise a cup at you and go back to it.');
  },

  /** The woman who runs the common house. */
  async houseKeeper({ say, npc }) {
    await say(npc.data?.line ?? 'She looks you over and decides you can afford it.');
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

  async lannisportHint({ say }) {
    await say('Goldsmith: STEEL turns aside frost and stone alike. Fire goes straight through it.');
  },

  async rivalLannisport({ say, npc, battle, setFlag, flag }) {
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

  async gymLannister({ say, battle, setFlag, flag }) {
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
  async klGuard({ say }) {
    if (sigilCount() >= 3) {
      await say('Gold Cloak: Three sigils. The Red Keep is yours to climb. Gods be with you.');
    } else {
      await say(`Gold Cloak: Three sigils to climb to the throne room. You have ${sigilCount()}.`);
    }
  },

  async klHint({ say }) {
    const counts = dexCounts();
    await say(`Beggar: You have met ${counts.seen} kinds of creature and won over ${counts.caught}. That is more than most lords manage.`);
  },

  async klRecruiter({ say }) {
    await say("Recruiter: Still short of men. The Wall does not garrison itself.");
    await say('Recruiter: They say something is stirring beyond it. They have said that for a hundred years, mind.');
  },

  async klStranger({ say }) {
    await say('Stranger: Fire and blood built this city and fire and blood will have it back.');
    await say('Stranger: When you sit in that chair, remember who was here before you. Everyone forgets. That is how it keeps happening.');
  },

  async rivalThrone({ say, npc, battle, setFlag, flag }) {
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

  async wallHint({ say }) {
    await say("Steward: The Watch holds the Wall with a tenth of the men it needs.");
    await say('Steward: Beyond it, the wights come in numbers. Bring fire, or dragonglass, or both.');
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

  async eyrieHint({ say }) {
    await say('Guard: Sky cells have three walls and a very persuasive fourth side.');
    await say('Guard: WIND creatures nest all over the mountain. Bring something that throws stones.');
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

  async reachHint({ say }) {
    await say('Gardener: WILD creatures thrive here. Fire and cold both undo them, and so does a good hard wing.');
  },

  // =========================================================================
  //  Dorne
  // =========================================================================
  async doran({ say }) {
    await say('Prince Doran: I am slow, and gouty, and I have outlived cleverer men than you.');
    await say('Prince Doran: Dorne remembers every slight. We simply take our time about them.');
  },

  async dorneHint({ say }) {
    await say('Orphan: VENOM creatures own the sands. Steel turns their fangs; nothing else does.');
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

  async stormHint({ say }) {
    await say('Fisherman: STORM creatures ride the front in off the bay. Stone weathers them best.');
  },

  // =========================================================================
  //  Dragonstone
  // =========================================================================
  async daenerys({ say }) {
    await say('Daenerys: I was born on this island in a storm, and I have not had a quiet day since.');
    await say('Daenerys: You want the chair. So does everyone. What I want to know is what you will do the morning after.');
    await say('Daenerys: Go into the Dragonmont if you are brave. Something down there is older than my house.');
  },

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
    const { say, overworld, battle, setFlag, flag } = api;
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

    setFlag('gameComplete');
    await say(def.after, { theme: 'royal' });
    await say('You sit. The blades are exactly as uncomfortable as everyone said.', { theme: 'royal' });

    // Winning the chair is not the end of it. The realm you made on the way up
    // is the realm you now have to hold.
    beginReign();
    await say('And then the room fills with people who want things from you.', { theme: 'royal' });
    await say('Sit the throne again whenever you are ready to hold court.', { theme: 'royal' });
    await overworld.holdCourt();
  },

  /** Returning to the chair. Every visit after the first is a turn of ruling. */
  async throne({ say, overworld, flag }) {
    if (!flag('gameComplete')) {
      await say('The chair is empty. It does not look like it wants company.');
      return;
    }
    if (!reigning()) {
      await say('They took the crown off you. The chair is somebody else\'s problem now.');
      return;
    }
    await overworld.holdCourt();
  },
  // ------------------------------------------------- the other eight seats ---
  // Five of these were written out longhand and the differences between them
  // were the name and the parting gift. One shape, nine seats: say your piece,
  // fight, hand over the sigil.
  ...Object.fromEntries(['gymArryn', 'gymTyrell', 'gymMartell', 'gymBaratheon', 'gymTargaryen']
    .map((id) => [id, async function ({ say, setFlag, flag }) {
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
