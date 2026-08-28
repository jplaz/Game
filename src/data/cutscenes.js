// Cutscenes.
//
// Step somewhere and something happens without you asking for it: a rider comes
// up the road, a shadow goes over, somebody is standing where nobody was. Each
// one fires once, sets a flag, and never runs again.
//
// A scene is a list of beats the overworld plays in order:
//
//   ['say', text, opts]           a line of dialogue
//   ['wait', seconds]             hold
//   ['shake', seconds]            rattle the screen
//   ['flash', seconds, colour]    wash the screen
//   ['spawn', id, {x,y,dir,sprite,name}]   put somebody on the map
//   ['walk', id, dir, steps]      walk them
//   ['face', id, dir]             turn them
//   ['despawn', id]               take them off again
//   ['sky']                       send a dragon over, now
//   ['flag', name]                set a story flag
//   ['choose', text, [labels], { record }]  a decision, remembered
//   ['fight', duellistOrRoamer]   it turns into a fight
//
// 'player' is a valid id for walk and face.

export const CUTSCENES = {
  /* ---------------------------------------------------------------- the arc --
   *
   * These five were written as five things that happen. They are now the middle
   * of one thing that happens, because a scene can say what has to have
   * befallen you first: `needs` names a flag another scene set, `unless` names
   * one that closes it off, and `sigils` holds it back until you have taken
   * that many seats. So the fourth of these only ever happens to somebody the
   * second one happened to, which is the whole difference between a road with
   * events on it and a story.
   *
   * The thread: a raven comes south, nobody who matters will hear it, and every
   * league you walk to take a seat is a league the thing behind it walks too.
   */

  /* ----------------------------------------------------- one place each ---
   *
   * A region that has no moment of its own is a corridor with a different
   * green on it. One scene apiece, in the place that region is actually about,
   * so that arriving somewhere new is an event rather than a change of
   * scenery. None of these are on the road to anything: they are the reason to
   * go and look.
   */

  /** The Westerlands: what the gold is actually for. */
  theGoldenTooth: {
    map: 'goldRoad', x: 10, y: 12, flag: 'cs_goldenTooth', name: 'The Golden Tooth',
    beats: [
      ['say', 'The hills here have had the insides taken out of them. '
            + 'The spoil heaps are older than the road and taller than the trees.'],
      ['spawn', 'miner', { x: 10, y: 15, dir: 'up', sprite: 'smallfolk',
        name: 'Pit Man' }],
      ['walk', 'miner', 'up', 2],
      ['say', 'Pit Man: Three generations of us down that shaft. '
            + 'Not one of us has ever held a gold coin for longer than it took to hand it over.'],
      ['say', 'Pit Man: They say a Lannister always pays his debts. '
            + 'Nobody ever asks who to.'],
      ['despawn', 'miner'],
      ['flag', 'sawTheGold'],
    ],
  },

  /** Dorne: the pass, and the reason nobody has ever taken it. */
  theBoneway: {
    map: 'princesPass', x: 10, y: 9, flag: 'cs_boneway', name: 'The Boneway',
    beats: [
      ['say', 'The pass narrows until two men cannot ride abreast, and the '
            + 'rocks above it are stacked in a way that rocks do not stack.'],
      ['wait', 0.8],
      ['say', 'There are bones set into the cliff on both sides, at intervals, '
            + 'for as far up the road as you can see. Not buried. Set.'],
      ['say', 'Every army that has come this way is still here, and Dorne has '
            + 'never once had to win a battle to arrange it.'],
      ['flag', 'sawTheBoneway'],
    ],
  },

  /** The Stormlands: the weather that the place is named after. */
  stormsComing: {
    map: 'stormlands', x: 11, y: 16, flag: 'cs_storm', name: "Storm's Coming",
    beats: [
      ['say', 'The light goes out of the day in about the time it takes to '
            + 'notice that it is going.'],
      ['flash', 0.4, '#ffffff'],
      ['shake', 1.1],
      ['say', 'The rain arrives sideways and all at once, and somewhere behind '
            + 'it the sea is making a sound you can feel in your teeth.'],
      ['say', 'They build the walls round here forty feet thick and curved, so '
            + 'the weather has nothing flat to push against. Now you know why.'],
      ['flag', 'sawTheStorm'],
    ],
  },

  /** The Reach: what the richest country in the world looks like from a road. */
  theHarvest: {
    map: 'roseroad', x: 11, y: 10, flag: 'cs_harvest', name: 'The Harvest',
    beats: [
      ['say', 'The road runs between fields that go all the way to the edge of '
            + 'sight in both directions, and every one of them is being worked.'],
      ['spawn', 'reaper', { x: 14, y: 12, dir: 'left', sprite: 'goodwife',
        name: 'Reaper' }],
      ['say', 'Reaper: Fourth cutting. There will be a fifth. '
            + 'My mother saw seven in one year and nobody believed her either.'],
      ['say', 'Reaper: Every war in the last two hundred years has been fed '
            + 'out of this county. Not fought here. Fed.'],
      ['despawn', 'reaper'],
      ['flag', 'sawTheHarvest'],
    ],
  },

  /** The Iron Islands: the price, said out loud. */
  saltAndIron: {
    map: 'ironCoast', x: 11, y: 14, flag: 'cs_saltIron', name: 'The Iron Price',
    beats: [
      ['say', 'Nothing grows here. Not nothing much - nothing. '
            + 'The soil is four inches deep and it is mostly ash and shell.'],
      ['spawn', 'reaver', { x: 11, y: 17, dir: 'up', sprite: 'ironborn',
        name: 'Old Reaver' }],
      ['walk', 'reaver', 'up', 2],
      ['say', 'Old Reaver: You are standing there working out how we eat. '
            + 'Everyone does. We take it. That is the whole of it.'],
      ['choose', 'He is not ashamed and he is not boasting.',
        ['That is theft', 'That is survival', 'Say nothing'],
        { record: 'saltAndIron' }],
      ['despawn', 'reaver'],
      ['flag', 'heardTheIronPrice'],
    ],
  },

  /** Dragonstone: what is under it. */
  underTheMountain: {
    map: 'dragonmont', x: 8, y: 8, flag: 'cs_dragonmont', name: 'Under the Mountain',
    beats: [
      ['say', 'The tunnel is not cut. Nothing with a chisel made this. '
            + 'The walls are smooth the way a candle is smooth.'],
      ['wait', 0.9],
      ['shake', 0.7],
      ['say', 'It is warm. Twenty feet down, in winter, on an island in the '
            + 'sea, and it is warm enough to want your cloak off.'],
      ['say', 'Something lived down here long enough to shape the rock around '
            + 'itself, and the Targaryens built a castle on the lid of it and '
            + 'called that a conquest.'],
      ['flag', 'sawUnderTheMountain'],
    ],
  },

  /** The Riverlands: the ford, and what the river carries. */
  theRubyFord: {
    map: 'theCrossroads', x: 11, y: 20, flag: 'cs_rubyFord', name: 'The Ruby Ford',
    beats: [
      ['say', 'The water here is shallow enough to walk and slow enough to see '
            + 'the bottom of, which is how people keep finding things in it.'],
      ['spawn', 'wader', { x: 13, y: 21, dir: 'left', sprite: 'child',
        name: 'Wading Boy' }],
      ['say', 'Wading Boy: Rubies. Off a breastplate. A prince died here and '
            + 'they came off him into the water and we are still picking them up.'],
      ['say', 'Wading Boy: My grandfather found two. My father found one. '
            + 'I have found none, and I have looked more than either of them.'],
      ['despawn', 'wader'],
      ['flag', 'sawTheFord'],
    ],
  },

  /* --------------------------------------------------- somebody is asking ---
   *
   * A story you walk into is not the same as a story that comes and finds you.
   * These five do the finding: they are held back by how many seats have bent
   * to you rather than by where you happen to be standing, so the same person
   * keeps turning up as you climb, and what he wants from you changes each
   * time. The last one is who has been doing it.
   */

  /** Somebody has started asking after you, and the asking has reached you. */
  aWhisperInTheDark: {
    map: 'riverrun', x: 12, y: 10, flag: 'cs_whisper', name: 'Somebody Is Asking',
    sigils: 1,
    beats: [
      ['say', 'A child you have not noticed is suddenly walking beside you at '
            + 'exactly your pace, looking straight ahead.'],
      ['say', 'Little Bird: A man came through asking what you look like. '
            + 'He paid in silver and he did not write anything down.'],
      ['say', 'Little Bird: He asked which way you went. I told him. '
            + 'He would have found out anyway and then I would have nothing.'],
      ['choose', 'The child is waiting to see what you are.',
        ['Pay her more than he did', 'Ask what he looked like', 'Say nothing and walk on'],
        { record: 'aWhisperInTheDark' }],
      ['flag', 'somebodyIsAsking'],
    ],
  },

  /** The offer, made politely, in the holiest room in the realm. */
  theOfferInTheSept: {
    map: 'greatSept', x: 8, y: 6, flag: 'cs_septOffer', name: 'The Offer',
    needs: 'theyAreWatching', sigils: 5,
    beats: [
      ['say', 'The Sept is enormous and almost empty, which is how a place '
            + 'built for seven thousand people sounds when forty are in it.'],
      ['spawn', 'agent', { x: 8, y: 3, dir: 'down', sprite: 'noble',
        name: 'A Man in Good Boots' }],
      ['walk', 'agent', 'down', 2],
      ['say', 'A Man in Good Boots: Five. Nobody expected five. '
            + 'My employer would like to stop being surprised by you.'],
      ['say', 'A Man in Good Boots: A seat of your own, a wife you would '
            + 'actually like, and the four you have not taken left standing. '
            + 'All of it today, and you stop walking.'],
      ['choose', 'He has not blinked once.',
        ['I will take the other four', 'Name your employer', 'Tell me what happens if I refuse'],
        { record: 'theOfferInTheSept' }],
      ['say', 'A Man in Good Boots: Then I will see you again, and I will be '
            + 'less pleasant about it, and neither of those is my choice.'],
      ['walk', 'agent', 'up', 3],
      ['despawn', 'agent'],
      ['flag', 'refusedTheOffer'],
    ],
  },

  /** And the offer, made again, without the manners. */
  theSecondOffer: {
    map: 'fleaBottom', x: 8, y: 10, flag: 'cs_secondOffer', name: 'The Second Offer',
    needs: 'refusedTheOffer', sigils: 7,
    beats: [
      ['say', 'Flea Bottom at dusk. Somebody steps out of a doorway behind you '
            + 'and two more do not step out of the one opposite, which is worse.'],
      ['spawn', 'agent', { x: 8, y: 7, dir: 'down', sprite: 'noble',
        name: 'A Man in Good Boots' }],
      ['walk', 'agent', 'down', 2],
      ['shake', 0.6],
      ['say', 'A Man in Good Boots: Seven. I am told to say that the offer '
            + 'stands and that the price has changed, and I am told to say the '
            + 'second part slowly.'],
      ['say', 'A Man in Good Boots: There is a maester at Eastwatch who signed '
            + 'his name to something. There is a child in Riverrun who took '
            + 'your silver. Neither of them is difficult to reach.'],
      ['choose', 'The two who did not step out are still not stepping out.',
        ['Draw', 'Tell him where to find me', 'Agree to anything and mean none of it'],
        { record: 'theSecondOffer' }],
      ['despawn', 'agent'],
      ['flag', 'theyThreatenedYou'],
    ],
  },

  /** Who has been doing it, on the steps of the place it was all for. */
  theSpiderHimself: {
    map: 'redKeep', x: 9, y: 20, flag: 'cs_spider', name: 'The Spider',
    needs: 'theyThreatenedYou', sigils: 8,
    beats: [
      ['say', 'A soft man in a soft robe is standing on the carpet inside the '
            + 'doors of the Red Keep as if he has been there since the '
            + 'building went up.'],
      ['spawn', 'spider', { x: 9, y: 17, dir: 'down', sprite: 'noble',
        name: 'The Spider' }],
      ['say', 'The Spider: I have had eleven men watch you and nine of them '
            + 'came back saying you were nobody. It is a very good disguise. '
            + 'I could not have done better and I have had practice.'],
      ['say', 'The Spider: I did not want you stopped. I wanted you slowed, '
            + 'so I could see what you were for. A man who wants the chair '
            + 'takes the shortest road to it. You went north.'],
      ['choose', 'He is smiling and it does not reach anything.',
        ['I went north because the letter was true', 'I want the chair',
         'You will find out with everyone else'],
        { record: 'theSpiderHimself' }],
      ['say', 'The Spider: Then go up. I serve the realm, and for the first '
            + 'time in some years I am not certain which of you that means.'],
      ['despawn', 'spider'],
      ['flag', 'metTheSpider'],
    ],
  },

  /** The man who signed the raven, at the end of the road it came down. */
  theHandThatWroteIt: {
    map: 'eastwatch', x: 11, y: 20, flag: 'cs_wroteIt', name: 'The Hand That Wrote It',
    beats: [
      ['say', 'The gate here is smaller than the one at Castle Black and there '
            + 'are half as many men on it, and every one of them watches the sea '
            + 'rather than the ice.'],
      ['say', 'A maester comes down off the wall to meet you, which maesters do '
            + 'not do, and he is looking at your hands rather than your face.'],
      ['say', 'Maester Harmune: You have come up the Gift in winter. Nobody does '
            + 'that for trade. So you read it, and you believed enough of it to walk.'],
      ['choose', 'He is waiting.',
        ['I came to see for myself', 'Who else did you write to?', 'Tell me what you saw'],
        { record: 'theHandThatWroteIt' }],
      ['say', 'Maester Harmune: Then you are the first, and you are four hundred '
            + 'leagues from anybody who could send you help. Walk carefully.'],
      ['flag', 'metTheWatch'],
      ['flag', 'heardTheRaven'],
    ],
  },

  /** Hardhome, which is what all of it has been about. */
  whatIsLeftOfHardhome: {
    map: 'hardhome', x: 11, y: 19, flag: 'cs_hardhome', name: 'What Is Left of Hardhome',
    needs: 'metTheWatch',
    beats: [
      ['say', 'The boat puts you on a shingle beach and the man rowing it does '
            + 'not tie up. He says he will wait until dark. He is lying.'],
      ['wait', 0.9],
      ['say', 'Six thousand people lived here. The houses are standing. '
            + 'The cookfires are laid and never lit. Nothing has been looted.'],
      ['shake', 1.0],
      ['say', 'And then, further up the beach, something that was a woman turns '
            + 'its head towards you with the whole slow patience of a thing that '
            + 'has nowhere else to be.'],
      ['flag', 'sawHardhome'],
    ],
  },

  /** The raven that starts it, in the yard you woke up in. */
  theRaven: {
    map: 'winterfell', x: 12, y: 16, flag: 'cs_raven', name: 'The Raven',
    beats: [
      ['say', 'A maester comes across the yard too fast for a man his age, '
            + 'with a scrap of paper held out in front of him like it is hot.'],
      ['say', 'Maester: From the Wall. Not the usual count of stores and cold. '
            + 'It is signed by a man I buried a rumour about last winter.'],
      ['say', 'Maester: Three words. THEY ARE COMING. No number, no name, '
            + 'nothing a lord could act on, which is what frightens me about it.'],
      ['choose', 'What do you make of it?',
        ['A frightened man in the cold', 'Somebody wants us looking north',
         'I believe it'],
        { record: 'theRaven' }],
      ['say', 'Maester: Then go and be useful about it. Nobody south of the Neck '
            + 'will move for three words and a stranger. Give them nine sigils '
            + 'and they will move for anything you like.'],
      ['flag', 'heardTheRaven'],
    ],
  },

  /** Somebody has come a long way to say the same thing, and is nearly dead. */
  theCrowsCall: {
    /* No `needs` on this one on purpose. The raven reaches you in the Stark
       yard, and eight of the nine houses do not wake up in it - gating the rest
       of the thread behind a scene most players can never stand on would hide
       the whole story from them. Two sigils is sequence enough, and this sets
       the same flag, so whichever of the two you meet first opens the road to
       the rest. */
    map: 'riverlands', x: 10, y: 14, flag: 'cs_crowsCall', name: "A Crow's Call",
    sigils: 2,
    beats: [
      ['say', 'There is a black heap at the side of the road that turns out, '
            + 'when it moves, to be a man in the cloak of the Night\u2019s Watch.'],
      ['spawn', 'crow', { x: 10, y: 17, dir: 'up', sprite: 'nightswatch',
        name: 'A Sworn Brother' }],
      ['say', 'A Sworn Brother: Eastwatch. Nine of us started. Do not go north '
            + 'of the Fist, whatever they offer you.'],
      ['say', 'A Sworn Brother: It is not wildlings. I could fight wildlings. '
            + 'They come at night and the ones you knew come with them.'],
      ['choose', 'He cannot walk another mile.',
        ['Get him to a maester', 'Give him what coin you have', 'You have your own road'],
        { record: 'theCrowsCall' }],
      ['despawn', 'crow'],
      ['flag', 'metTheWatch'],
      ['flag', 'heardTheRaven'],
    ],
  },

  /** The sellsword's paymaster, once you have asked who he was. */
  whoPaidHim: {
    map: 'kingsroad', x: 10, y: 24, flag: 'cs_whoPaid', name: 'Who Paid Him',
    needs: 'theFollower_1', sigils: 3,
    beats: [
      ['say', 'The name he gave you has been sitting behind your teeth for a '
            + 'week, and here is a man wearing that name\u2019s colours, waiting.'],
      ['spawn', 'agent', { x: 10, y: 20, dir: 'down', sprite: 'noble',
        name: 'A Man in Good Boots' }],
      ['walk', 'agent', 'down', 2],
      ['say', 'A Man in Good Boots: You were meant to die on this road. You are '
            + 'instead collecting seats, which is worse, and now everybody is '
            + 'interested.'],
      ['say', 'A Man in Good Boots: Nobody sent me to stop you. They sent me to '
            + 'find out what you want. That is the more expensive question.'],
      ['choose', 'What do you tell him?',
        ['The chair', 'The North warned and armed', 'Nothing at all'],
        { record: 'whoPaidHim' }],
      ['walk', 'agent', 'up', 3],
      ['despawn', 'agent'],
      ['flag', 'theyAreWatching'],
    ],
  },

  /** What the Watch has, once you have stood under the Wall. */
  whatTheySaw: {
    map: 'castleBlack', x: 9, y: 11, flag: 'cs_whatTheySaw', name: 'What They Saw',
    needs: 'sawTheWall', sigils: 5,
    beats: [
      ['say', 'They take you down a stair that is colder than the yard, which '
            + 'you would not have thought the world allowed.'],
      ['wait', 0.8],
      ['flash', 0.5, '#8fb6e8'],
      ['say', 'A shape under sailcloth, chained at the wrists to a ring in the '
            + 'floor. It has been chained there since before the last thaw.'],
      ['say', 'Lord Commander: It does not rot. It does not sleep. It stops '
            + 'moving when we bring a torch near and starts again when we take '
            + 'it away. Steel does nothing. We have tried steel.'],
      ['choose', 'What do you say to that?',
        ['Burn it', 'Keep it, and show every lord in the realm', 'Cut it loose and see'],
        { record: 'whatTheySaw' }],
      ['flag', 'sawOneOfThem'],
    ],
  },

  /** The north goes quiet, on the doorstep of the last act. */
  theLastRaven: {
    map: 'kingsLanding', x: 16, y: 24, flag: 'cs_lastRaven', name: 'The Last Raven',
    needs: 'heardTheRaven', sigils: 8,
    beats: [
      ['say', 'A bird comes down out of a white sky into the middle of the '
            + 'street and does not get up again. There is a scrap on its leg.'],
      ['wait', 0.7],
      ['say', 'It is from Eastwatch, and it is not words. It is a list of names '
            + 'with a line drawn through every one of them, and then the line '
            + 'stops in the middle of a name.'],
      ['shake', 0.9],
      ['say', 'Nothing has come south of the Neck for eleven days. Not a rider, '
            + 'not a trader, not a raven. Eleven days ago there were four a day.'],
      ['choose', 'And the chair is one door away.',
        ['Take it. Then take everything north', 'Turn round now', 'Say nothing and keep walking'],
        { record: 'theLastRaven' }],
      ['flag', 'theNorthIsSilent'],
    ],
  },

  /** Leaving Winterfell for the first time. Somebody has an opinion about it. */
  ridingSouth: {
    map: 'kingsroadNorth', x: 10, y: 21, flag: 'cs_ridingSouth',
    beats: [
      ['say', 'A rider comes up the road at a canter, and reins in hard when he sees you.'],
      ['spawn', 'rider', { x: 10, y: 17, dir: 'down', sprite: 'stark', name: 'Outrider' }],
      ['walk', 'rider', 'down', 3],
      ['say', 'Outrider: You are the one from Winterfell. Turn back.'],
      ['say', 'Outrider: There are men on this road who are not taking tolls any more. '
            + 'They are taking whatever they like.'],
      ['choose', 'What do you say?', ['I am going south', 'How many of them?'],
        { record: 'ridingSouth' }],
      ['say', 'Outrider: Then keep your steel where your hand is. Gods keep you.'],
      ['walk', 'rider', 'up', 4],
      ['despawn', 'rider'],
    ],
  },

  /** The first dragon you see, before you have any idea what to do about it. */
  firstDragon: {
    map: 'riverlands', x: 10, y: 4, flag: 'cs_firstDragon',
    beats: [
      ['say', 'The light changes. Not clouds — the shadow moves too fast for clouds.'],
      ['sky'],
      ['shake', 0.8],
      ['wait', 1.2],
      ['say', 'Something enormous goes over, high up and heading east, and the horses '
            + 'in the field below scream until it is gone.'],
      ['say', 'Nobody in Westeros has seen one in a hundred and fifty years. '
            + 'You have now.'],
      ['flag', 'sawADragon'],
    ],
  },

  /** The Wall, seen for the first time. */
  theWallItself: {
    map: 'castleBlack', x: 9, y: 17, flag: 'cs_theWall',
    beats: [
      ['say', 'You come round the tower and stop, because your body stops before you decide to.'],
      ['wait', 0.8],
      ['flash', 0.6, '#dfeaf8'],
      ['say', 'Seven hundred feet of ice, running east and west until the weather takes it.'],
      ['say', 'Men built this. That is the part nobody manages to explain.'],
      ['flag', 'sawTheWall'],
    ],
  },

  /** Somebody has been following you, and stops bothering to hide it. */
  theFollower: {
    map: 'kingsroad', x: 10, y: 16, flag: 'cs_follower',
    beats: [
      ['say', 'A twig goes, somewhere behind and to the left. Then nothing, which is worse.'],
      ['wait', 0.9],
      ['spawn', 'shadow', { x: 10, y: 20, dir: 'up', sprite: 'sellsword', name: 'A Sellsword' }],
      ['walk', 'shadow', 'up', 2],
      ['say', 'A Sellsword: Three days I have been on you. You never once looked back.'],
      ['choose', 'What do you do?',
        ['Draw on him', 'Ask who paid him', 'Walk away'],
        { record: 'theFollower' }],
    ],
  },

  /** A village that has already had its visit from somebody. */
  burnedVillage: {
    map: 'goldRoad', x: 10, y: 8, flag: 'cs_burned',
    beats: [
      ['say', 'The smell reaches you before the turn in the road does.'],
      ['wait', 0.7],
      ['say', 'Eleven houses. Nine of them still standing, in the sense that walls are standing.'],
      ['say', 'Whoever did it went through in a morning and was somewhere else by evening. '
            + 'They took the grain and left the people.'],
      ['flag', 'sawTheBurning'],
    ],
  },
};

export const CUTSCENE_IDS = Object.keys(CUTSCENES);

/** Every cutscene that could fire on a given map. */
export function cutscenesOn(mapId) {
  return CUTSCENE_IDS
    .filter((id) => CUTSCENES[id].map === mapId)
    .map((id) => ({ id, ...CUTSCENES[id] }));
}
