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
