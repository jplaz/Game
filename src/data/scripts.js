// NPC behaviour. Every script is an async function so dialogue, choices,
// battles and shops can be written in a straight line.
//
// api: { subject, npc, overworld, say, choose, battle, openShop, healParty,
//        setFlag, flag }

import {
  game, party, addCreature, giveItem, hasItem, addMoney, canAfford,
  sigilCount, hasSigil, dexCounts, swearTo, allegiance, standing, standingWord,
  changeStanding, recordChoice, choice,
} from '../game/state.js';
import { HOUSES, SWEARABLE } from './houses.js';
import { giveEgg } from '../game/eggs.js';
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
  async blackdread({ say, choose, npc, setFlag, flag }) {
    if (flag('blackdread_done')) {
      await say('The warmth is still here. Whatever left it has not come back.');
      npc.hidden = true;
      return;
    }
    await say('The heat here is wrong for a cave. The rock underfoot is warm as a hearthstone.');
    await say('Something enormous shifts in the dark, and opens one eye the colour of a forge.');
    await say('It does not attack. It watches you, the way you would watch a mouse cross a room.');
    await say('Behind it, banked in the ash, are three eggs.');

    const take = await choose('Take one?', ['Take an egg', 'Leave them be']);
    if (take !== 0) {
      recordChoice('dragonEgg', 'left');
      await say('You back out the way you came. The eye follows you the whole way and does not blink.');
      await say('Some part of you will wonder about that for the rest of your life.');
      setFlag('blackdread_done');
      npc.hidden = true;
      return;
    }

    await say('You lift the smallest. It is heavier than it looks and hot enough to hurt.');
    await say('The great head lowers until it is level with yours. Then it turns away.');
    recordChoice('dragonEgg', 'taken');
    giveEgg('emberling', { steps: 320, from: 'the Dragonmont' });
    audio.sfx('caught');
    await say('You are carrying a dragon egg.');
    await say('Maester Luwin said eggs like this hatch for the walking, not the waiting. So walk.');

    // Whoever still holds Dragonstone notices a stranger leaving with one.
    changeStanding('targaryen', -10);
    setFlag('blackdread_done');
    npc.hidden = true;
  },

  // --------------------------------------------------------- the endgame ---
  async gymThrone(api) {
    const { say, overworld, battle, setFlag, flag } = api;
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

    const { Credits } = await import('../scenes/credits.js');
    overworld.manager.push(new Credits());
  },
};
