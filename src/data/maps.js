// World data.
//
// Each map is an ASCII grid using the legend in art/tiles.js. Rows are padded
// to a common width when the map is loaded, so a row that is a character short
// degrades into empty space instead of breaking the game.
//
// warps:  stepping onto {x,y} moves the player to another map
// npcs:   people; `script` names an entry in data/scripts.js
// signs:  readable text at a tile
// items:  ground pickups, remembered by flag id

// ---------------------------------------------------------------------------
// Shared interior: every settlement has a Maester's Hall that both heals your
// party and sells supplies. One layout, instantiated per town.
// ---------------------------------------------------------------------------
const MAESTER_HALL_TILES = [
  'IIIIIIIIIIII',
  'I=========BI',
  'IKKK===KKK=I',
  'I==========I',
  'I==========I',
  'I==T====T==I',
  'I==========I',
  'I==========I',
  'IIIII__IIIII',
];

function maesterHall({ exitTo, exitX, exitY, stock, healerLine, merchantLine, extraNpcs = [] }) {
  return {
    name: "Maester's Hall",
    indoor: true,
    music: 'town',
    tiles: MAESTER_HALL_TILES,
    warps: [
      { x: 5, y: 8, to: exitTo, tx: exitX, ty: exitY, dir: 'down' },
      { x: 6, y: 8, to: exitTo, tx: exitX, ty: exitY, dir: 'down' },
    ],
    npcs: [
      { x: 2, y: 1, dir: 'down', sprite: 'maester', name: 'Maester', script: 'healer',
        data: { line: healerLine } },
      { x: 8, y: 1, dir: 'down', sprite: 'merchant', name: 'Steward', script: 'shop',
        data: { stock } },
      ...extraNpcs,
    ],
  };
}

export const MAPS = {
  // =========================================================== hero's home ==
  heroHouse: {
    name: 'Your Chamber',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIII',
      'Ib__BB___I',
      'I________I',
      'I__TT____I',
      'I________I',
      'I________I',
      'IIII__IIII',
    ],
    warps: [
      { x: 4, y: 6, to: 'winterfell', tx: 17, ty: 13, dir: 'down' },
      { x: 5, y: 6, to: 'winterfell', tx: 17, ty: 13, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 3, dir: 'left', sprite: 'smallfolk', name: 'Old Nan', script: 'oldNan' },
    ],
    signs: [
      { x: 4, y: 1, text: 'Shelves of Maester Luwin\'s cast-off books. Most of them are about ravens.' },
      { x: 5, y: 1, text: 'A history of the Seven Kingdoms, with the interesting parts torn out.' },
    ],
  },

  // ============================================================= WINTERFELL ==
  winterfell: {
    name: 'Winterfell',
    music: 'town',
    tiles: [
      'PPPPPPPPPPPPPPPPPPPPPPPP',
      'PSSSSSSSSSSSSSSSSSSSSSSP',
      'PSSSSSSSSSSSSSSSSSSSSSSP',
      'PSSSSSSSSrrrrrrSSSSSSSSP',
      'PSSSSSSSSRRRRRRSSSSSSSSP',
      'PSSSSSSSSRRRRRRSSSSSSSSP',
      'PSSSSSSSSHwHDHwSSSSSSSSP',
      'PSSSSSSSSS!--SSSSSSSSSSP',
      'PSS------------------SSP',
      'PSSSSSSSSSSS-SSSSSSSSSSP',
      'PSSrrrrrrSSS-SSSrrrrSSSP',
      'PSSRRRRRRSSS-SSSRRRRSSSP',
      'PSSRRRRRRSSS-SSSHDHwSSSP',
      'PSSHwHDHwSSS-SSSSSSSSSSP',
      'PSSSSS-SSSSS-SSSSSSSSSSP',
      'PSS------------------SSP',
      'PSSSSSSSSSSS-SSSSSSSSSSP',
      'PSS;;;W;;;SS-SSSSSSSSSSP',
      'PSS;;;;;;;SS-SSSSSSSSSSP',
      'PPPPPPPPPPPP-PPPPPPPPPPP',
    ],
    encounters: [
      { species: 'snowpup', min: 2, max: 4, weight: 20 },
      { species: 'ravenling', min: 2, max: 4, weight: 30 },
      { species: 'sapling', min: 3, max: 5, weight: 25 },
      { species: 'bearcub', min: 3, max: 5, weight: 25 },
    ],
    warps: [
      { x: 17, y: 12, to: 'heroHouse', tx: 4, ty: 5, dir: 'up' },
      { x: 6, y: 13, to: 'maesterHallWinterfell', tx: 5, ty: 7, dir: 'up' },
      { x: 12, y: 6, to: 'greatKeep', tx: 8, ty: 13, dir: 'up' },
      { x: 12, y: 19, to: 'wolfswood', tx: 10, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 10, y: 7, text: 'THE GREAT KEEP OF WINTERFELL\nSeat of House Stark.\nSigil-holder: LORD RICKARD.' },
      { x: 6, y: 17, text: 'THE GODSWOOD\nA heart tree has watched this ground for ten thousand years.\nIt is still watching.' },
    ],
    npcs: [
      { x: 12, y: 16, dir: 'down', sprite: 'maester', name: 'Maester Luwin', script: 'starter' },
      { x: 9, y: 9, dir: 'down', sprite: 'guard', name: 'Guardsman', script: 'winterfellGuard' },
      { x: 19, y: 15, dir: 'left', sprite: 'smallfolk', name: 'Stablehand', script: 'winterfellStable' },
      { x: 5, y: 17, dir: 'right', sprite: 'stark', name: 'Septa', script: 'winterfellSepta' },
      { x: 4, y: 8, dir: 'down', sprite: 'nightswatch', name: 'Recruiter', script: 'blackBrother' },
    ],
  },

  maesterHallWinterfell: maesterHall({
    exitTo: 'winterfell', exitX: 6, exitY: 14,
    stock: ['sigilBanner', 'maesterKit', 'antidote', 'burnSalve', 'frostTonic'],
    healerLine: 'Rest your creatures a while. The North is hard on them.',
    merchantLine: 'Winterfell\'s stores are open to you.',
  }),

  // -------------------------------------------------- gym 1: the Great Keep --
  greatKeep: {
    name: 'The Great Keep',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIIIIIIII',
      'I===============I',
      'I==FF=======FF==I',
      'I===============I',
      'I=====ccccc=====I',
      'I=====ccccc=====I',
      'I=======c=======I',
      'I=======c=======I',
      'I==BB===c===BB==I',
      'I=======c=======I',
      'I=======c=======I',
      'I=======c=======I',
      'I==FF===c===FF==I',
      'I=======c=======I',
      'IIIIIIII_IIIIIIII',
    ],
    warps: [
      { x: 8, y: 14, to: 'winterfell', tx: 12, ty: 7, dir: 'down' },
    ],
    npcs: [
      { x: 8, y: 4, dir: 'down', sprite: 'stark', name: 'Lord Rickard', script: 'gymStark' },
      { x: 5, y: 10, dir: 'right', sprite: 'guard', name: 'Hallis', script: 'trainer',
        data: { trainer: 'starkGuard1' } },
      { x: 11, y: 8, dir: 'left', sprite: 'guard', name: 'Torrhen', script: 'trainer',
        data: { trainer: 'starkGuard2' } },
      { x: 3, y: 13, dir: 'right', sprite: 'smallfolk', name: 'Steward', script: 'gymHintStark' },
    ],
  },

  // ============================================ route 1: the Wolfswood road ==
  wolfswood: {
    name: 'The Wolfswood',
    music: 'route',
    tiles: [
      'PPPPPPPPPP-PPPPPPPPP',
      'PSSSSSSSSS-S!SSSSSSP',
      'PSS;;;SSSS-SSS;;;SSP',
      'PSS;;;SSSS-SSS;;;SSP',
      'PSSSSSSSSS-SSSSSSSSP',
      'PSSSSSPPSS-SSPPSSSSP',
      'PSSSSSSSSS-SSSSSSSSP',
      'PSS;;;;;;S-S;;;;;SSP',
      'PSS;;;;;;S-S;;;;;SSP',
      'PSSSSSSSSS-SSSSSSSSP',
      'PSSSSSSSSS-SSSSSSSSP',
      'P.........-........P',
      'P#........-.......#P',
      'P.,,,,....-...,,,,.P',
      'P.,,,,....-...,,,,.P',
      'P.........-........P',
      'P..##.....-....##..P',
      'P.......!.-........P',
      'PLLLLLLLLL-LLLLLLLLP',
      'P.........-........P',
      'P.,,,,,,..-..,,,,,.P',
      'P.,,,,,,..-..,,,,,.P',
      'P.........-........P',
      'P#..##....-...##..#P',
      'P.........-........P',
      '##########-#########',
    ],
    encounters: [
      { species: 'snowpup', min: 3, max: 6, weight: 18 },
      { species: 'ravenling', min: 3, max: 6, weight: 22 },
      { species: 'bearcub', min: 4, max: 7, weight: 18 },
      { species: 'sapling', min: 4, max: 6, weight: 16 },
      { species: 'fawnhart', min: 4, max: 7, weight: 16 },
      { species: 'boartusk', min: 5, max: 7, weight: 10 },
    ],
    warps: [
      { x: 10, y: 0, to: 'winterfell', tx: 12, ty: 18, dir: 'up' },
      { x: 10, y: 25, to: 'moatCailin', tx: 11, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 12, y: 1, text: 'THE WOLFSWOOD\nSouth to Moat Cailin.\nStay on the road after dark.' },
      { x: 8, y: 17, text: 'A drop, not a climb. You can jump down, but not back up.' },
    ],
    npcs: [
      { x: 6, y: 6, dir: 'right', sprite: 'smallfolk', name: 'Forager', script: 'trainer',
        data: { trainer: 'forager' } },
      { x: 14, y: 12, dir: 'left', sprite: 'nightswatch', name: 'Ranger Jon', script: 'trainer',
        data: { trainer: 'ranger' } },
      { x: 5, y: 22, dir: 'up', sprite: 'wildling', name: 'Wildling', script: 'trainer',
        data: { trainer: 'wildling1' } },
      { x: 16, y: 20, dir: 'left', sprite: 'smallfolk', name: 'Woodsman', script: 'wolfswoodHint' },
    ],
    items: [
      { x: 3, y: 3, item: 'sigilBanner', count: 3, flag: 'item_wolfswood_banners' },
      { x: 13, y: 16, item: 'maesterKit', count: 1, flag: 'item_wolfswood_kit' },
    ],
  },

  // ============================================================ MOAT CAILIN ==
  moatCailin: {
    name: 'Moat Cailin',
    music: 'town',
    tiles: [
      '####################',
      '#........-.........#',
      '#..UU....-....UU...#',
      '#..UU....-....UU...#',
      '#........-.........#',
      '#...rrrr.-.........#',
      '#...RRRR.-....UU...#',
      '#...HDHw.-....UU...#',
      '#....-...-.........#',
      '#....-------.......#',
      '#....-.....-.......#',
      '#....-.....-.......#',
      '#..~~~~~~..-.......#',
      '#..~~~~~~..-...!...#',
      '#..~~~~~~..-.......#',
      '#..........-.......#',
      '#..,,,,....-...,,..#',
      '#..,,,,....-...,,..#',
      '#..........-.......#',
      '###########-########',
    ],
    encounters: [
      { species: 'ravenling', min: 6, max: 9, weight: 25 },
      { species: 'riverfry', min: 6, max: 9, weight: 20 },
      { species: 'sapling', min: 6, max: 9, weight: 20 },
      { species: 'krakenling', min: 7, max: 10, weight: 15 },
      { species: 'wightling', min: 7, max: 10, weight: 20 },
    ],
    warps: [
      { x: 9, y: 1, to: 'wolfswood', tx: 10, ty: 24, dir: 'up' },
      { x: 5, y: 7, to: 'maesterHallMoat', tx: 5, ty: 7, dir: 'up' },
      { x: 11, y: 19, to: 'riverlands', tx: 10, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 15, y: 13, text: 'MOAT CAILIN\nThree towers still standing out of twenty.\nThe Neck swallowed the rest.' },
    ],
    npcs: [
      { x: 13, y: 10, dir: 'down', sprite: 'guard', name: 'Bog Guard', script: 'trainer',
        data: { trainer: 'bogGuard' } },
      { x: 4, y: 15, dir: 'right', sprite: 'smallfolk', name: 'Crannogman', script: 'moatHint' },
      { x: 14, y: 4, dir: 'down', sprite: 'rival', name: 'Joffrey', script: 'rivalMoat',
        hideIfFlag: 'trainer_rival1' },
    ],
    items: [
      { x: 16, y: 2, item: 'poppyMilk', count: 1, flag: 'item_moat_poppy' },
    ],
  },

  maesterHallMoat: maesterHall({
    exitTo: 'moatCailin', exitX: 5, exitY: 8,
    stock: ['sigilBanner', 'warBanner', 'maesterKit', 'antidote', 'wakingDraught', 'stillwater'],
    healerLine: 'The damp is unkind to creatures. Let me see to yours.',
    merchantLine: 'Not much passes through the Neck. What we have, you may buy.',
  }),

  // =================================================== route 2: Riverlands ==
  riverlands: {
    name: 'The Riverlands',
    music: 'route',
    tiles: [
      '##########-#########',
      '#........!-*.......#',
      '#..,,,,...-...,,,,.#',
      '#..,,,,...-...,,,,.#',
      '#.........-........#',
      '#..~~~~~..-..~~~~..#',
      '#..~~~~~..-..~~~~..#',
      '#..~~~~~..-..~~~~..#',
      '#.........-........#',
      '#....##...-...##...#',
      '#.........-........#',
      '#LLLLLLLLL-LLLLLLLL#',
      '#.........-........#',
      '#..,,,,,,.-.,,,,,,.#',
      '#..,,,,,,.-.,,,,,,.#',
      '#.........-........#',
      '#..~~~~...-...~~~~.#',
      '#..~~~~...-...~~~~.#',
      '#.........-........#',
      '#...**....-....**..#',
      '#.........-........#',
      '#..,,,,,..-..,,,,,.#',
      '#..,,,,,..-..,,,,,.#',
      '#.........-........#',
      '##########-#########',
    ],
    encounters: [
      { species: 'riverfry', min: 8, max: 12, weight: 22 },
      { species: 'fawnhart', min: 8, max: 12, weight: 18 },
      { species: 'sapling', min: 8, max: 12, weight: 16 },
      { species: 'ravenling', min: 9, max: 13, weight: 14 },
      { species: 'boartusk', min: 9, max: 13, weight: 14 },
      { species: 'cubmane', min: 10, max: 13, weight: 8 },
      { species: 'crabcrag', min: 10, max: 13, weight: 8 },
    ],
    warps: [
      { x: 10, y: 0, to: 'moatCailin', tx: 11, ty: 18, dir: 'up' },
      { x: 10, y: 24, to: 'riverrun', tx: 12, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 9, y: 1, text: 'THE RIVERLANDS\nSouth to Riverrun.\nMind the fords.' },
    ],
    npcs: [
      { x: 5, y: 10, dir: 'right', sprite: 'tully', name: 'Fisher Edd', script: 'trainer',
        data: { trainer: 'fisher' } },
      { x: 15, y: 15, dir: 'left', sprite: 'merchant', name: 'Pedlar', script: 'trainer',
        data: { trainer: 'pedlar' } },
      { x: 6, y: 20, dir: 'up', sprite: 'guard', name: 'Freerider', script: 'trainer',
        data: { trainer: 'freerider' } },
      { x: 14, y: 4, dir: 'down', sprite: 'smallfolk', name: 'Traveller', script: 'riverlandsHint' },
    ],
    items: [
      { x: 3, y: 19, item: 'warBanner', count: 2, flag: 'item_riverlands_banner' },
      { x: 17, y: 8, item: 'kissOfFire', count: 1, flag: 'item_riverlands_revive' },
    ],
  },

  // ============================================================== RIVERRUN ==
  riverrun: {
    name: 'Riverrun',
    music: 'town',
    tiles: [
      '~~~~~~~~~~~~-~~~~~~~~~~~',
      '~..........s-s.........~',
      '~..........--.........~~',
      '~..rrrrrr..-..rrrr....~~',
      '~..RRRRRR..-..RRRR....~~',
      '~..RRRRRR..-..HDHw....~~',
      '~..HwHDHw..-..........~~',
      '~.....-....-..........~~',
      '~.....------------....~~',
      '~..........-......!...~~',
      '~..*.......-..........~~',
      '~..........-..........~~',
      '~...rrrrrrrrrrr.......~~',
      '~...RRRRRRRRRRR.......~~',
      '~...RRRRRRRRRRR.......~~',
      '~...RRRRRRRRRRR.......~~',
      '~...HwHwHwDHwHw.......~~',
      '~..........-..........~~',
      '~..........-.......,,.~~',
      '~~~~~~~~~~~-~~~~~~~~~~~~',
    ],
    encounters: [
      { species: 'riverfry', min: 12, max: 15, weight: 40 },
      { species: 'crabcrag', min: 12, max: 15, weight: 30 },
      { species: 'ravenling', min: 12, max: 15, weight: 30 },
    ],
    warps: [
      { x: 12, y: 0, to: 'riverlands', tx: 10, ty: 23, dir: 'up' },
      { x: 6, y: 6, to: 'maesterHallRiverrun', tx: 5, ty: 7, dir: 'up' },
      { x: 15, y: 5, to: 'riverrunInn', tx: 5, ty: 6, dir: 'up' },
      { x: 10, y: 16, to: 'riverrunKeep', tx: 8, ty: 14, dir: 'up' },
      { x: 11, y: 19, to: 'goldRoad', tx: 10, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 18, y: 9, text: 'RIVERRUN\nSeat of House Tully.\nSigil-holder: LADY CATELYN.' },
    ],
    npcs: [
      { x: 8, y: 10, dir: 'down', sprite: 'tully', name: 'Squire', script: 'riverrunSquire' },
      { x: 17, y: 13, dir: 'left', sprite: 'smallfolk', name: 'Boatwright', script: 'riverrunHint' },
      { x: 4, y: 17, dir: 'right', sprite: 'merchant', name: 'Fishwife', script: 'riverrunFishwife' },
    ],
  },

  maesterHallRiverrun: maesterHall({
    exitTo: 'riverrun', exitX: 6, exitY: 7,
    stock: ['sigilBanner', 'warBanner', 'maesterKit', 'poppyMilk', 'antidote', 'kissOfFire'],
    healerLine: 'Rivers run, and so do errands. Rest here first.',
    merchantLine: 'Trident goods, honestly priced.',
  }),

  riverrunInn: {
    name: 'The Riverrun Inn',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIII',
      'I=========BI',
      'I=====KKKK=I',
      'I==========I',
      'I=TT====TT=I',
      'I==========I',
      'I=TT====TT=I',
      'IIIII__IIIII',
    ],
    warps: [
      { x: 5, y: 7, to: 'riverrun', tx: 15, ty: 6, dir: 'down' },
      { x: 6, y: 7, to: 'riverrun', tx: 15, ty: 6, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 1, dir: 'down', sprite: 'merchant', name: 'Innkeep', script: 'innkeep' },
      { x: 3, y: 3, dir: 'right', sprite: 'lannister', name: 'Sellsword', script: 'trainer',
        data: { trainer: 'sellsword' } },
      { x: 8, y: 5, dir: 'left', sprite: 'smallfolk', name: 'Drunk', script: 'innDrunk' },
    ],
  },

  // ------------------------------------------------ gym 2: Riverrun's keep --
  riverrunKeep: {
    name: 'Riverrun Keep',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIIIIIIII',
      'I===============I',
      'I====~~~~~~~====I',
      'I====~~~~~~~====I',
      'I======ccc======I',
      'I==~~==ccc==~~==I',
      'I==~~==ccc==~~==I',
      'I======ccc======I',
      'I==~~==ccc==~~==I',
      'I==~~==ccc==~~==I',
      'I======ccc======I',
      'I==~~==ccc==~~==I',
      'I==~~==ccc==~~==I',
      'I======ccc======I',
      'I===============I',
      'IIIIIIII_IIIIIIII',
    ],
    warps: [
      { x: 8, y: 15, to: 'riverrun', tx: 10, ty: 17, dir: 'down' },
    ],
    npcs: [
      { x: 8, y: 4, dir: 'down', sprite: 'tully', name: 'Lady Catelyn', script: 'gymTully' },
      { x: 4, y: 7, dir: 'right', sprite: 'tully', name: 'Ser Edmure', script: 'trainer',
        data: { trainer: 'tullyKnight1' } },
      { x: 12, y: 10, dir: 'left', sprite: 'tully', name: 'Ser Brynden', script: 'trainer',
        data: { trainer: 'tullyKnight2' } },
      { x: 3, y: 14, dir: 'right', sprite: 'smallfolk', name: 'Steward', script: 'gymHintTully' },
    ],
  },

  // ==================================================== route 3: Gold Road ==
  goldRoad: {
    name: 'The Gold Road',
    music: 'route',
    tiles: [
      '##########-#########',
      '#........!-s.......#',
      '#..,,,,...-...,,,,.#',
      '#..,,,,...-...,,,,.#',
      '#.........-........#',
      '#..CC.....-.....CC.#',
      '#..CC.....-.....CC.#',
      '#.........-........#',
      '#....,,,,.-.,,,,...#',
      '#....,,,,.-.,,,,...#',
      '#.........-........#',
      '#LLLLLLLLL-LLLLLLLL#',
      '#.........-........#',
      '#..CCCC...-...CCCC.#',
      '#..CCCC...-...CCCC.#',
      '#.........-........#',
      '#..,,,,,,.-.,,,,,,.#',
      '#..,,,,,,.-.,,,,,,.#',
      '#.........-........#',
      '#...%%....-....%%..#',
      '#.........-........#',
      '#..,,,,,..-..,,,,,.#',
      '#.........-........#',
      '##########-#########',
    ],
    encounters: [
      { species: 'cubmane', min: 14, max: 18, weight: 22 },
      { species: 'boartusk', min: 14, max: 18, weight: 18 },
      { species: 'sandviper', min: 15, max: 19, weight: 16 },
      { species: 'falconet', min: 14, max: 18, weight: 16 },
      { species: 'emberwisp', min: 15, max: 19, weight: 14 },
      { species: 'fawnhart', min: 15, max: 19, weight: 14 },
    ],
    warps: [
      { x: 10, y: 0, to: 'riverrun', tx: 11, ty: 18, dir: 'up' },
      { x: 10, y: 23, to: 'lannisport', tx: 11, ty: 1, dir: 'down' },
      { x: 5, y: 19, to: 'barrowCave', tx: 8, ty: 14, dir: 'up' },
    ],
    signs: [
      { x: 9, y: 1, text: 'THE GOLD ROAD\nSouth to Lannisport.\nA dark opening gapes to the west.' },
    ],
    npcs: [
      { x: 14, y: 6, dir: 'left', sprite: 'lannister', name: 'Guardsman', script: 'trainer',
        data: { trainer: 'goldCloak1' } },
      { x: 5, y: 15, dir: 'right', sprite: 'lannister', name: 'Hedge Knight', script: 'trainer',
        data: { trainer: 'hedgeKnight' } },
      { x: 15, y: 20, dir: 'up', sprite: 'merchant', name: 'Caravanner', script: 'trainer',
        data: { trainer: 'caravanner' } },
      { x: 4, y: 4, dir: 'down', sprite: 'smallfolk', name: 'Miner', script: 'goldRoadHint' },
    ],
    items: [
      { x: 18, y: 12, item: 'kingsguardBanner', count: 1, flag: 'item_goldroad_banner' },
      { x: 3, y: 8, item: 'weirwoodSap', count: 1, flag: 'item_goldroad_sap' },
    ],
  },

  // ----------------------------------------- optional cave: the Barrowlands --
  barrowCave: {
    name: 'The Barrow Deeps',
    indoor: true,
    music: 'wild',
    tiles: [
      '@@@@@@@@@@@@@@@@@',
      '@%%%%%%%%%%%%%%%@',
      '@%%@@@%%%%%@@@%%@',
      '@%%@@@%%%%%@@@%%@',
      '@%%%%%%%%%%%%%%%@',
      '@%%%%%@@@@@%%%%%@',
      '@%%%%%@%%%@%%%%%@',
      '@%%%%%@%%%@%%%%%@',
      '@%%%%%@%%%@%%%%%@',
      '@%%%%%@@%@@%%%%%@',
      '@%%%%%%%%%%%%%%%@',
      '@%%@@@%%%%%@@@%%@',
      '@%%@@@%%%%%@@@%%@',
      '@%%%%%%%%%%%%%%%@',
      '@%%%%%%%%%%%%%%%@',
      '@@@@@@@@%@@@@@@@@',
    ],
    encounters: [
      { species: 'wightling', min: 18, max: 24, weight: 34 },
      { species: 'krakenling', min: 18, max: 22, weight: 18 },
      { species: 'emberwisp', min: 18, max: 22, weight: 18 },
      { species: 'boartusk', min: 19, max: 24, weight: 18 },
      { species: 'barrowlord', min: 26, max: 30, weight: 12 },
    ],
    warps: [
      { x: 8, y: 15, to: 'goldRoad', tx: 5, ty: 20, dir: 'down' },
    ],
    npcs: [
      { x: 8, y: 7, dir: 'down', sprite: 'whitewalker', name: '?', script: 'palewalker',
        hideIfFlag: 'palewalker_done' },
    ],
    items: [
      { x: 2, y: 1, item: 'dragonglass', count: 1, flag: 'item_cave_dragonglass' },
      { x: 14, y: 14, item: 'kingsRansom', count: 1, flag: 'item_cave_ransom' },
    ],
  },

  // ============================================================ LANNISPORT ==
  lannisport: {
    name: 'Lannisport',
    music: 'town',
    tiles: [
      '####################',
      '#.........-........#',
      '#.oooooooooooooooo.#',
      '#.o..............o.#',
      '#.o.rrrr...rrrr..o.#',
      '#.o.RRRR...RRRR..o.#',
      '#.o.HDHw...HwHD..o.#',
      '#.o..-........-..o.#',
      '#.o..----------..o.#',
      '#.o......-.......o.#',
      '#.o......-....!..o.#',
      '#.o..rrrrrrrr....o.#',
      '#.o..RRRRRRRR....o.#',
      '#.o..RRRRRRRR....o.#',
      '#.o..HwHwDHwH....o.#',
      '#.o......-.......o.#',
      '#.oooooo.-.oooooooo#',
      '#........-.........#',
      '#........-.........#',
      '#########-##########',
    ],
    encounters: [],
    warps: [
      { x: 10, y: 1, to: 'goldRoad', tx: 10, ty: 22, dir: 'up' },
      { x: 5, y: 6, to: 'maesterHallLannisport', tx: 5, ty: 7, dir: 'up' },
      { x: 14, y: 6, to: 'lannisportForge', tx: 5, ty: 6, dir: 'up' },
      { x: 9, y: 14, to: 'casterlyRock', tx: 8, ty: 16, dir: 'up' },
      { x: 9, y: 19, to: 'kingsroad', tx: 10, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 14, y: 10, text: 'LANNISPORT\nBeneath Casterly Rock.\nSigil-holder: SER JAIME.' },
    ],
    npcs: [
      { x: 6, y: 9, dir: 'down', sprite: 'lannister', name: 'Gold Cloak', script: 'lannisportGuard' },
      { x: 15, y: 17, dir: 'left', sprite: 'merchant', name: 'Goldsmith', script: 'lannisportHint' },
      { x: 4, y: 17, dir: 'right', sprite: 'rival', name: 'Joffrey', script: 'rivalLannisport',
        hideIfFlag: 'trainer_rival2' },
    ],
  },

  maesterHallLannisport: maesterHall({
    exitTo: 'lannisport', exitX: 5, exitY: 7,
    stock: ['warBanner', 'kingsguardBanner', 'poppyMilk', 'weirwoodSap', 'kissOfFire', 'burnSalve'],
    healerLine: 'Gold pays for good care. Yours is free, of course.',
    merchantLine: 'The finest stock west of the Trident.',
  }),

  lannisportForge: {
    name: 'The Forge',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIII',
      'I=FF=====B=I',
      'I=====KKK==I',
      'I==========I',
      'I=TT====TT=I',
      'I==========I',
      'I=F======F=I',
      'IIIII__IIIII',
    ],
    warps: [
      { x: 5, y: 7, to: 'lannisport', tx: 14, ty: 7, dir: 'down' },
      { x: 6, y: 7, to: 'lannisport', tx: 14, ty: 7, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 1, dir: 'down', sprite: 'merchant', name: 'Armourer', script: 'shop',
        data: { stock: ['kingsguardBanner', 'kingsRansom', 'weirwoodSap', 'kissOfFire'] } },
      { x: 5, y: 4, dir: 'right', sprite: 'lannister', name: 'Apprentice', script: 'trainer',
        data: { trainer: 'apprentice' } },
    ],
  },

  // ------------------------------------------- gym 3: the halls of the Rock --
  casterlyRock: {
    name: 'Casterly Rock',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIIIIIIII',
      'I===============I',
      'I==FF=======FF==I',
      'I===============I',
      'I==@@@@@=@@@@@==I',
      'I==@@@@@=@@@@@==I',
      'I=======c=======I',
      'I==@@@=cc=@@@===I',
      'I==@@@=cc=@@@===I',
      'I=======c=======I',
      'I==@@@@@=@@@@@==I',
      'I==@@@@@=@@@@@==I',
      'I=======c=======I',
      'I==FF===c===FF==I',
      'I=======c=======I',
      'I=======c=======I',
      'I===============I',
      'IIIIIIII_IIIIIIII',
    ],
    warps: [
      { x: 8, y: 17, to: 'lannisport', tx: 9, ty: 15, dir: 'down' },
    ],
    npcs: [
      { x: 8, y: 3, dir: 'down', sprite: 'lannister', name: 'Ser Jaime', script: 'gymLannister' },
      { x: 6, y: 9, dir: 'right', sprite: 'lannister', name: 'Ser Kevan', script: 'trainer',
        data: { trainer: 'lionKnight1' } },
      { x: 11, y: 14, dir: 'left', sprite: 'lannister', name: 'Ser Addam', script: 'trainer',
        data: { trainer: 'lionKnight2' } },
      { x: 3, y: 16, dir: 'right', sprite: 'smallfolk', name: 'Steward', script: 'gymHintLannister' },
    ],
  },

  // =================================================== route 4: Kingsroad ==
  kingsroad: {
    name: 'The Kingsroad',
    music: 'route',
    tiles: [
      '##########-#########',
      '#........!-s.......#',
      '#..,,,,,..-..,,,,,.#',
      '#..,,,,,..-..,,,,,.#',
      '#.........-........#',
      '#..##.....-.....##.#',
      '#.........-........#',
      '#....~~~..-..~~~...#',
      '#....~~~..-..~~~...#',
      '#.........-........#',
      '#LLLLLLLLL-LLLLLLLL#',
      '#.........-........#',
      '#..,,,,,,.-.,,,,,,.#',
      '#..,,,,,,.-.,,,,,,.#',
      '#.........-........#',
      '#...CC....-....CC..#',
      '#.........-........#',
      '#..,,,,,..-..,,,,,.#',
      '#..,,,,,..-..,,,,,.#',
      '#.........-........#',
      '#...**....-....**..#',
      '#.........-........#',
      '##########-#########',
    ],
    encounters: [
      { species: 'fawnhart', min: 20, max: 24, weight: 18 },
      { species: 'cubmane', min: 20, max: 24, weight: 16 },
      { species: 'falconet', min: 20, max: 24, weight: 16 },
      { species: 'sandviper', min: 21, max: 25, weight: 14 },
      { species: 'boartusk', min: 21, max: 25, weight: 14 },
      { species: 'krakenling', min: 21, max: 25, weight: 12 },
      { species: 'emberwisp', min: 22, max: 26, weight: 10 },
    ],
    warps: [
      { x: 10, y: 0, to: 'lannisport', tx: 9, ty: 18, dir: 'up' },
      { x: 10, y: 22, to: 'kingsLanding', tx: 12, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 9, y: 1, text: "THE KINGSROAD\nSouth to King's Landing.\nThe end of the road, one way or another." },
    ],
    npcs: [
      { x: 5, y: 6, dir: 'right', sprite: 'baratheon', name: 'Ser Lyle', script: 'trainer',
        data: { trainer: 'stormKnight1' } },
      { x: 15, y: 12, dir: 'left', sprite: 'baratheon', name: 'Ser Rolland', script: 'trainer',
        data: { trainer: 'stormKnight2' } },
      { x: 6, y: 17, dir: 'up', sprite: 'nightswatch', name: 'Deserter', script: 'trainer',
        data: { trainer: 'deserter' } },
      { x: 14, y: 20, dir: 'left', sprite: 'smallfolk', name: 'Pilgrim', script: 'kingsroadHint' },
    ],
    items: [
      { x: 3, y: 15, item: 'kingsRansom', count: 1, flag: 'item_kingsroad_ransom' },
      { x: 18, y: 4, item: 'kingsguardBanner', count: 2, flag: 'item_kingsroad_banner' },
    ],
  },

  // ======================================================== KING'S LANDING ==
  kingsLanding: {
    name: "King's Landing",
    music: 'town',
    tiles: [
      '########################',
      '#..........-...........#',
      '#.oooooooooooooooooooo.#',
      '#.o..................o.#',
      '#.o..rrrr....rrrr....o.#',
      '#.o..RRRR....RRRR....o.#',
      '#.o..HDHw....HwHD....o.#',
      '#.o...-.........-....o.#',
      '#.o...-----------....o.#',
      '#.o.......-..........o.#',
      '#.o.......-.....!....o.#',
      '#.o.oooooooooooo.....o.#',
      '#.o.o..............o.o.#',
      '#.o.o..rrrrrrrrr...o.o.#',
      '#.o.o..RRRRRRRRR...o.o.#',
      '#.o.o..RRRRRRRRR...o.o.#',
      '#.o.o..HwHwDHwHw...o.o.#',
      '#.o.o......-.......o.o.#',
      '#.o.oooooo.-.oooooooo.o#',
      '#.o........-.........o.#',
      '#.oooooooo.-.ooooooooo.#',
      '#..........-...........#',
      '########################',
    ],
    encounters: [],
    warps: [
      { x: 11, y: 1, to: 'kingsroad', tx: 10, ty: 21, dir: 'up' },
      { x: 6, y: 6, to: 'maesterHallKL', tx: 5, ty: 7, dir: 'up' },
      { x: 16, y: 6, to: 'klArmoury', tx: 5, ty: 6, dir: 'up' },
      { x: 11, y: 16, to: 'redKeep', tx: 8, ty: 21, dir: 'up' },
    ],
    signs: [
      { x: 16, y: 10, text: "KING'S LANDING\nThe Red Keep stands above.\nSigil-holder: THE IRON THRONE." },
    ],
    npcs: [
      { x: 8, y: 9, dir: 'down', sprite: 'guard', name: 'Gold Cloak', script: 'klGuard' },
      { x: 18, y: 19, dir: 'left', sprite: 'smallfolk', name: 'Beggar', script: 'klHint' },
      { x: 4, y: 19, dir: 'right', sprite: 'nightswatch', name: 'Recruiter', script: 'klRecruiter' },
      { x: 14, y: 12, dir: 'down', sprite: 'targaryen', name: 'Stranger', script: 'klStranger' },
    ],
  },

  maesterHallKL: maesterHall({
    exitTo: 'kingsLanding', exitX: 6, exitY: 7,
    stock: ['kingsguardBanner', 'kingsRansom', 'weirwoodSap', 'kissOfFire', 'poppyMilk'],
    healerLine: 'The Grand Maester is busy. I am not. Let me see them.',
    merchantLine: 'Everything has a price in this city. Yours is fair.',
  }),

  klArmoury: {
    name: 'The Street of Steel',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIII',
      'I=FF=====B=I',
      'I=====KKK==I',
      'I==========I',
      'I=BB====BB=I',
      'I==========I',
      'I=TT====TT=I',
      'IIIII__IIIII',
    ],
    warps: [
      { x: 5, y: 7, to: 'kingsLanding', tx: 16, ty: 7, dir: 'down' },
      { x: 6, y: 7, to: 'kingsLanding', tx: 16, ty: 7, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 1, dir: 'down', sprite: 'merchant', name: 'Armourer', script: 'shop',
        data: { stock: ['kingsguardBanner', 'kingsRansom', 'weirwoodSap', 'kissOfFire'] } },
      { x: 5, y: 5, dir: 'right', sprite: 'guard', name: 'Kingsguard', script: 'trainer',
        data: { trainer: 'kingsguardTrainee' } },
    ],
  },

  // ----------------------------------------- the Red Keep: the final climb --
  redKeep: {
    name: 'The Red Keep',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIIIIIIIIII',
      'I=================I',
      'I=====F=====F=====I',
      'I========X========I',
      'I=======ccc=======I',
      'I=======ccc=======I',
      'I==@@@==ccc==@@@==I',
      'I==@@@==ccc==@@@==I',
      'I=======ccc=======I',
      'I=======ccc=======I',
      'I==@@@==ccc==@@@==I',
      'I==@@@==ccc==@@@==I',
      'I=======ccc=======I',
      'I=====F=ccc=F=====I',
      'I=======ccc=======I',
      'I==@@@==ccc==@@@==I',
      'I==@@@==ccc==@@@==I',
      'I=======ccc=======I',
      'I=======ccc=======I',
      'I=====F=ccc=F=====I',
      'I=======ccc=======I',
      'I=======ccc=======I',
      'IIIIIIII_IIIIIIIIII',
    ],
    warps: [
      { x: 8, y: 22, to: 'kingsLanding', tx: 11, ty: 17, dir: 'down' },
    ],
    npcs: [
      { x: 9, y: 4, dir: 'down', sprite: 'baratheon', name: 'The Claimant', script: 'gymThrone' },
      { x: 6, y: 9, dir: 'right', sprite: 'guard', name: 'Ser Meryn', script: 'trainer',
        data: { trainer: 'kingsguard1' } },
      { x: 12, y: 12, dir: 'left', sprite: 'guard', name: 'Ser Boros', script: 'trainer',
        data: { trainer: 'kingsguard2' } },
      { x: 6, y: 17, dir: 'right', sprite: 'guard', name: 'Ser Preston', script: 'trainer',
        data: { trainer: 'kingsguard3' } },
      { x: 9, y: 20, dir: 'up', sprite: 'rival', name: 'Joffrey', script: 'rivalThrone',
        hideIfFlag: 'trainer_rival3' },
    ],
  },
};

/** Normalises rows to a rectangle and precomputes width/height. */
function prepare(map) {
  const width = Math.max(...map.tiles.map((row) => row.length));
  map.grid = map.tiles.map((row) => row.padEnd(width, row.at(-1) ?? '#'));
  map.width = width;
  map.height = map.grid.length;
  return map;
}

for (const [id, map] of Object.entries(MAPS)) {
  map.id = id;
  prepare(map);
}

export function getMap(id) {
  const map = MAPS[id];
  if (!map) throw new Error(`Unknown map: ${id}`);
  return map;
}

export function tileAt(map, x, y) {
  if (x < 0 || y < 0 || y >= map.height || x >= map.width) return '#';
  return map.grid[y][x];
}
