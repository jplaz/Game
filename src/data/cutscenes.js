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
