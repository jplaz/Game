// NPC behaviour. Every script is an async function so dialogue, choices,
// battles and shops can be written in a straight line.
//
// api: { subject, npc, overworld, say, choose, battle, openShop, healParty,
//        setFlag, flag }

import {
  game, party, addCreature, giveItem, hasItem, addMoney, canAfford,
  sigilCount, hasSigil, dexCounts,
} from '../game/state.js';
import { createCreature, displayName } from '../game/creature.js';
import { TRAINERS } from './trainers.js';
import { DUELLISTS } from './duellists.js';
import { item as getItem } from './items.js';
import { audio } from '../engine/audio.js';

const STARTERS = [
  { id: 'snowpup', blurb: 'A Wolfswood pup. Stubborn, quick, and loyal past sense.' },
  { id: 'emberling', blurb: 'A dragon the size of a cat. It has already burnt two tapestries.' },
  { id: 'riverfry', blurb: 'A Trident trout. Placid until it is not.' },
];

export const SCRIPTS = {
  // ------------------------------------------------------------- defaults --
  async generic({ say, npc }) {
    await say(`${npc?.name ?? 'Someone'} has nothing to say to you today.`);
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
  async healer({ say, choose, npc, healParty }) {
    const line = npc.data?.line ?? 'Shall I see to your creatures?';
    const answer = await choose(line, ['Yes, please', 'No, thank you']);
    if (answer !== 0) {
      await say('As you like. Come back when they are footsore.');
      return;
    }
    await say('Rest them here a moment...');
    healParty();
    await say('There. Fed, watered, and rather better tempered than you are.');
    game.state.respawn = { ...game.state.position, dir: 'down' };
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
  async duel({ say, npc, duel, setFlag, flag }) {
    const id = npc.data.duel;
    const def = DUELLISTS[id];
    if (flag(`duel_${id}`)) {
      await say(def.after);
      return;
    }
    const outcome = await duel(id);
    if (outcome === 'won') {
      setFlag(`duel_${id}`);
      await say(def.after);
    }
  },

  /** Blacksmiths sell arms and armour and will fit them for you. */
  async smith({ say, npc, openSmithy }) {
    if (npc.data?.line) await say(npc.data.line);
    await openSmithy(npc.data?.stock ?? {});
  },

  /** Every trainer battle funnels through here. */
  async trainer({ say, npc, battle, setFlag, flag }) {
    const id = npc.data.trainer;
    const def = TRAINERS[id];
    if (flag(`trainer_${id}`)) {
      await say(def.after);
      return;
    }
    await say(def.intro);
    const outcome = await battle({ kind: 'trainer', trainerId: id });
    if (outcome === 'won') {
      setFlag(`trainer_${id}`);
      await say(def.after);
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
    await say('You will need a creature of your own. I have three in my care. Choose.');

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
    const outcome = await battle({ kind: 'trainer', trainerId: 'gymStark' });
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
    const outcome = await battle({ kind: 'trainer', trainerId: 'rival1' });
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
    const outcome = await battle({ kind: 'trainer', trainerId: 'gymTully' });
    if (outcome === 'won') {
      setFlag('trainer_gymTully');
      await say(def.after);
      giveItem('kingsguardBanner', 2);
      await say('You also received two Kingsguard Banners.');
    }
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
    const outcome = await battle({ kind: 'trainer', trainerId: 'rival2' });
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
    const outcome = await battle({ kind: 'trainer', trainerId: 'gymLannister' });
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
    const outcome = await battle({ kind: 'trainer', trainerId: 'rival3' });
    if (outcome === 'won') {
      setFlag('trainer_rival3');
      await say(def.after);
      npc.hidden = true;
    }
  },

  // --------------------------------------------------------- the endgame ---
  async gymThrone({ say, overworld, battle, setFlag, flag }) {
    const def = TRAINERS.gymThrone;
    if (flag('trainer_gymThrone')) {
      await say(def.after);
      return;
    }
    if (sigilCount() < 3) {
      await say(`The Claimant: Three sigils buy you an audience. You have ${sigilCount()}. Come back when the realm knows your name.`);
      return;
    }
    await say(def.intro, { theme: 'royal' });
    const outcome = await battle({ kind: 'trainer', trainerId: 'gymThrone' });
    if (outcome !== 'won') return;

    setFlag('trainer_gymThrone');
    setFlag('gameComplete');
    await say(def.defeat, { theme: 'royal' });
    await say(def.after, { theme: 'royal' });
    await say('You sit. The blades are exactly as uncomfortable as everyone said.', { theme: 'royal' });

    const { Credits } = await import('../scenes/credits.js');
    overworld.manager.push(new Credits());
  },
};
