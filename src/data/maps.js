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

/**
 * A settlement laid out to one plan: a crossroads, a Maester's Hall on the
 * north-west corner, a shop or forge opposite, and a keep on the south side.
 * Building the towns from one template keeps every door, path and warp aligned,
 * which is where hand-drawn maps go wrong.
 *
 * Doors: hall (6,6) forge (17,6) keep (7,14)
 * Exits: north (11,0) south (11,19)
 */
function makeTown({ name, music = 'town', ground = 'grass', wall = '#', floor = '.',
                    encounters = [], warps = [], npcs = [], signs = [], items = [] }) {
  const W = wall;
  const g = floor;
  const row = (...parts) => parts.join('');
  const fill = (n) => g.repeat(n);

  const tiles = [
    W.repeat(11) + '-' + W.repeat(12),
    row(W, fill(10), '-', fill(11), W),
    row(W, fill(10), '-', fill(11), W),
    row(W, fill(2), 'rrrrrr', fill(2), '-', fill(2), 'rrrrrr', fill(3), W),
    row(W, fill(2), 'RRRRRR', fill(2), '-', fill(2), 'RRRRRR', fill(3), W),
    row(W, fill(2), 'RRRRRR', fill(2), '-', fill(2), 'RRRRRR', fill(3), W),
    row(W, fill(2), 'HwHDHw', fill(2), '-', fill(2), 'HwHDHw', fill(3), W),
    row(W, fill(5), '-', fill(4), '-', fill(5), '-', fill(5), W),
    row(W, fill(2), '-'.repeat(18), fill(2), W),
    row(W, fill(10), '-', fill(11), W),
    row(W, fill(8), '!', g, '-', fill(11), W),
    row(W, fill(2), 'rrrrrrrr', '-', fill(11), W),
    row(W, fill(2), 'RRRRRRRR', '-', fill(11), W),
    row(W, fill(2), 'RRRRRRRR', '-', fill(11), W),
    row(W, fill(2), 'HwHwDHwH', '-', fill(11), W),
    row(W, fill(6), '-', fill(3), '-', fill(11), W),
    row(W, fill(2), '-'.repeat(18), fill(2), W),
    row(W, fill(10), '-', fill(11), W),
    row(W, fill(10), '-', fill(11), W),
    W.repeat(11) + '-' + W.repeat(12),
  ];

  return { name, music, ground, tiles, encounters, warps, npcs, signs, items };
}

/** Standard door and exit coordinates for a makeTown map. */
export const TOWN = {
  hallDoor: [6, 6], hallStand: [6, 7],
  shopDoor: [17, 6], shopStand: [17, 7],
  keepDoor: [7, 14], keepStand: [7, 15],
  north: [11, 0], northStand: [11, 1],
  south: [11, 19], southStand: [11, 18],
};

/**
 * A stretch of open country: walls down both sides, a road through the middle,
 * and stamped features. Hand-placing every tile of a dozen routes is where the
 * typos live, so the layout is described as regions instead.
 *
 * features: [{ type, x, y, w, h }] where type is one of
 *   grass | trees | water | cliff | ledge | flowers | sand | rubble
 */
function makeRoute({ name, music = 'route', ground = 'grass', wall = '#', floor = '.',
                     grass = ',', road = 10, width = 20, height = 24,
                     features = [], encounters = [], warps = [], npcs = [],
                     signs = [], items = [] }) {
  const CHAR = {
    grass, trees: wall, water: '~', cliff: 'C', ledge: 'L',
    flowers: '*', sand: 's', rubble: 'U', ice: 'i', snow: 'S', sign: '!',
  };

  const grid = [];
  for (let y = 0; y < height; y++) {
    grid.push(new Array(width).fill(floor));
  }
  // Side walls and the road.
  for (let y = 0; y < height; y++) {
    grid[y][0] = wall;
    grid[y][width - 1] = wall;
    grid[y][road] = 'd';
  }
  // Sealed ends with a gap for the road.
  for (let x = 0; x < width; x++) {
    if (x !== road) { grid[0][x] = wall; grid[height - 1][x] = wall; }
  }

  for (const f of features) {
    const char = CHAR[f.type] ?? floor;
    for (let y = f.y; y < f.y + (f.h ?? 1); y++) {
      for (let x = f.x; x < f.x + (f.w ?? 1); x++) {
        // Never build over the road or the border; a feature that would block
        // the route is clipped rather than sealing the map.
        if (y <= 0 || y >= height - 1 || x <= 0 || x >= width - 1) continue;
        if (x === road) continue;
        grid[y][x] = char;
      }
    }
  }

  return {
    name, music, ground,
    tiles: grid.map((r) => r.join('')),
    encounters, warps, npcs, signs, items,
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
      { x: 7, y: 3, dir: 'left', sprite: 'goodwife', name: 'Old Nan', script: 'oldNan' },
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
    ground: 'snow',
    tiles: [
      'MMMMMMMMMMMM-MMMMMMMMMMM',
      'MSSSSSSSSSSSSSSSSSSSSSSM',
      'MSSSSSSSSSSSSSSSSSSSSSSM',
      'MSSSSSSSSrrrrrrSSSSSSSSM',
      'MSSSSSSSSRRRRRRSSSSSSSSM',
      'vSSSSSSSSRRRRRRSSSSSSSSv',
      'MSSSSSSSSHDHDHwSSSSSSSSM',
      'MSSSSSSSS!--SSSSSSSSSSSM',
      'MSS------------------SSM',
      'MSSSSSSSSSSS-SSSSSSSSSSM',
      'MSSrrrrrrSSS-SSSrrrrSSSM',
      'MSSRRRRRRSSS-SSSRRRRSSSM',
      'MSSRRRRRRSSS-SSSHDHwSSSM',
      'vSSHwHDHwSSS-SSSSSSSSSSv',
      'MSSSSS-SSSSS-SSSSSSSSSSM',
      'MSS------------------SSM',
      'MSSSSSSSSSSS-SSSSSSSSSSM',
      'MSS;;;W;;;SS-SSSSSSSSSSM',
      'MSS;;;;;;;SS-SSSSSSSSSSM',
      'MMMMMMMMMMMM-MMMMMMMMMMM',
    ],
    encounters: [
      { roamer: 'bandit', min: 2, max: 4, weight: 30 },
      { roamer: 'poacher', min: 2, max: 5, weight: 30 },
      { roamer: 'manAtArms', min: 3, max: 5, weight: 40 },
    ],
    warps: [
      { x: 17, y: 12, to: 'heroHouse', tx: 4, ty: 5, dir: 'up' },
      { x: 6, y: 13, to: 'maesterHallWinterfell', tx: 5, ty: 7, dir: 'up' },
      { x: 12, y: 6, to: 'greatKeep', tx: 8, ty: 13, dir: 'up' },
      { x: 10, y: 6, to: 'winterfellForge', tx: 5, ty: 6, dir: 'up' },
      { x: 12, y: 19, to: 'wolfswood', tx: 10, ty: 1, dir: 'down' },
      { x: 12, y: 0, to: 'kingsroadNorth', tx: 10, ty: 22, dir: 'up' },
    ],
    signs: [
      { x: 9, y: 7, text: 'THE GREAT KEEP OF WINTERFELL\nSeat of House Stark.\nSigil-holder: LORD RICKARD.' },
      { x: 6, y: 17, text: 'THE GODSWOOD\nA heart tree has watched this ground for ten thousand years.\nIt is still watching.' },
    ],
    npcs: [
      { x: 12, y: 16, dir: 'down', sprite: 'maester', name: 'Maester Luwin', script: 'starter' },
      { x: 9, y: 9, dir: 'down', sprite: 'stark', name: 'Jory Cassel', script: 'joryGate' },
      { x: 15, y: 16, dir: 'left', sprite: 'ironborn', name: 'Theon Greyjoy', script: 'duel',
        data: { duel: 'theon' } },
      { x: 19, y: 15, dir: 'left', sprite: 'child', name: 'Stable Boy', script: 'winterfellStable' },
      { x: 5, y: 17, dir: 'right', sprite: 'septa', name: 'Septa Mordane', script: 'winterfellSepta' },
      { x: 4, y: 8, dir: 'down', sprite: 'nightswatch', name: 'Recruiter', script: 'blackBrother' },
    ],
  },

  maesterHallWinterfell: maesterHall({
    exitTo: 'winterfell', exitX: 6, exitY: 14,
    stock: ['sigilBanner', 'maesterKit', 'antidote', 'burnSalve', 'frostTonic'],
    healerLine: 'Rest your creatures a while. The North is hard on them.',
    merchantLine: 'Winterfell\'s stores are open to you.',
    extraNpcs: [
      { x: 5, y: 5, dir: 'down', sprite: 'stark', name: 'Robb Stark', script: 'duel',
        data: { duel: 'robb' } },
    ],
  }),

  // ------------------------------------------------ the Winterfell armoury --
  winterfellForge: {
    name: 'The Winterfell Forge',
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
      { x: 5, y: 7, to: 'winterfell', tx: 10, ty: 7, dir: 'down' },
      { x: 6, y: 7, to: 'winterfell', tx: 10, ty: 7, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 1, dir: 'down', sprite: 'smallfolk', name: 'Mikken', script: 'smith',
        data: {
          line: 'Mikken: Northern steel. Plain, heavy and it will not let you down.',
          stock: {
            weapon: ['huntingKnife', 'ironSword', 'woodAxe'],
            armour: ['gambeson', 'boiledLeather'],
            shield: ['buckler'],
          },
        } },
      { x: 5, y: 4, dir: 'right', sprite: 'stark', name: 'Ser Rodrik', script: 'duel',
        data: { duel: 'rodrikCassel' } },
    ],
  },

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
      { x: 8, y: 4, dir: 'down', sprite: 'stark', name: 'Lord Eddard', script: 'gymStark' },
      { x: 5, y: 10, dir: 'right', sprite: 'guard', name: 'Hallis', script: 'trainer',
        data: { trainer: 'starkGuard1' } },
      { x: 11, y: 8, dir: 'left', sprite: 'guard', name: 'Torrhen', script: 'trainer',
        data: { trainer: 'starkGuard2' } },
      { x: 3, y: 13, dir: 'right', sprite: 'oldman', name: 'Steward', script: 'gymHintStark' },
    ],
  },


  // =========================================================================
  //  THE NORTH — the kingsroad up to the Wall
  // =========================================================================
  kingsroadNorth: makeRoute({
    name: 'The Kingsroad North', ground: 'snow', wall: 'P', floor: 'S', grass: ';',
    music: 'wild',
    features: [
      { type: 'grass', x: 2, y: 3, w: 5, h: 3 },
      { type: 'grass', x: 13, y: 6, w: 5, h: 3 },
      { type: 'trees', x: 3, y: 10, w: 3, h: 2 },
      { type: 'trees', x: 14, y: 11, w: 4, h: 2 },
      { type: 'grass', x: 2, y: 14, w: 6, h: 3 },
      { type: 'grass', x: 12, y: 15, w: 6, h: 3 },
      { type: 'ice', x: 4, y: 19, w: 5, h: 2 },
      { type: 'ice', x: 13, y: 19, w: 4, h: 2 },
    ],
    encounters: [
      { roamer: 'deserter', min: 12, max: 17, weight: 30 },
      { roamer: 'bandit', min: 12, max: 18, weight: 26 },
      { roamer: 'poacher', min: 13, max: 17, weight: 22 },
      { roamer: 'manAtArms', min: 14, max: 19, weight: 22 },
    ],
    warps: [
      { x: 10, y: 0, to: 'castleBlack', tx: 11, ty: 18, dir: 'up' },
      { x: 10, y: 23, to: 'winterfell', tx: 12, ty: 1, dir: 'down' },
    ],
    npcs: [
      { x: 6, y: 8, dir: 'right', sprite: 'nightswatch', name: 'Ranger', script: 'trainer',
        data: { trainer: 'northRanger' } },
      { x: 14, y: 17, dir: 'left', sprite: 'wildling', name: 'Ygritte', script: 'duel',
        data: { duel: 'ygritte' } },
      { x: 4, y: 21, dir: 'down', sprite: 'goodwife', name: 'Carter', script: 'northRoadHint' },
    ],
    items: [
      { x: 16, y: 3, item: 'weirwoodSap', count: 1, flag: 'item_kroadnorth_sap' },
    ],
  }),

  castleBlack: makeTown({
    name: 'Castle Black', ground: 'snow', wall: 'P', floor: 'S',
    music: 'wild',
    warps: [
      { x: 11, y: 19, to: 'kingsroadNorth', tx: 10, ty: 1, dir: 'down' },
      { x: 11, y: 0, to: 'beyondTheWall', tx: 10, ty: 22, dir: 'up' },
      { x: 6, y: 6, to: 'maesterHallCastleBlack', tx: 5, ty: 7, dir: 'up' },
      { x: 17, y: 6, to: 'castleBlackArmoury', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 9, y: 10, text: 'CASTLE BLACK\nSeat of the Night\u2019s Watch.\nNorth of here the maps stop.' },
    ],
    npcs: [
      { x: 8, y: 9, dir: 'down', sprite: 'nightswatch', name: 'Jon Snow', script: 'duel',
        data: { duel: 'jonSnow' } },
      { x: 14, y: 10, dir: 'left', sprite: 'wildling', name: 'Tormund', script: 'duel',
        data: { duel: 'tormund' } },
      { x: 5, y: 17, dir: 'right', sprite: 'child', name: 'Steward Boy', script: 'wallHint' },
      { x: 16, y: 17, dir: 'left', sprite: 'maester', name: 'Maester Aemon', script: 'aemon' },
    ],
  }),

  maesterHallCastleBlack: maesterHall({
    exitTo: 'castleBlack', exitX: 6, exitY: 7,
    stock: ['warBanner', 'kingsguardBanner', 'poppyMilk', 'weirwoodSap', 'frostTonic', 'kissOfFire'],
    healerLine: 'Cold does worse to a creature than any blade. Let me look.',
    merchantLine: 'The Watch has little, and shares it.',
  }),

  castleBlackArmoury: {
    name: 'The Watch Armoury',
    indoor: true, music: 'town',
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
      { x: 5, y: 7, to: 'castleBlack', tx: 17, ty: 7, dir: 'down' },
      { x: 6, y: 7, to: 'castleBlack', tx: 17, ty: 7, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 1, dir: 'down', sprite: 'nightswatch', name: 'Donal Noye', script: 'smith',
        data: {
          line: 'Donal Noye: One arm, one forge, and the best steel north of the Neck.',
          stock: {
            weapon: ['ironSword', 'woodAxe', 'huntingBow', 'castleForged'],
            armour: ['boiledLeather', 'ringmail'],
            shield: ['buckler', 'oakShield'],
          },
        } },
    ],
  },

  beyondTheWall: makeRoute({
    name: 'Beyond the Wall', ground: 'snow', wall: 'P', floor: 'S', grass: ';',
    music: 'wild', height: 24,
    features: [
      { type: 'sign', x: 8, y: 21 },
      { type: 'ice', x: 2, y: 2, w: 7, h: 3 },
      { type: 'ice', x: 12, y: 3, w: 6, h: 3 },
      { type: 'grass', x: 3, y: 7, w: 6, h: 3 },
      { type: 'grass', x: 12, y: 8, w: 6, h: 3 },
      { type: 'cliff', x: 2, y: 12, w: 4, h: 3 },
      { type: 'cliff', x: 14, y: 12, w: 4, h: 3 },
      { type: 'grass', x: 3, y: 16, w: 6, h: 4 },
      { type: 'grass', x: 12, y: 16, w: 6, h: 4 },
    ],
    encounters: [
      { roamer: 'wildlingRaider', min: 26, max: 34, weight: 38 },
      { roamer: 'spearwife', min: 27, max: 35, weight: 34 },
      { roamer: 'gravedigger', min: 30, max: 39, weight: 28 },
    ],
    warps: [
      { x: 10, y: 23, to: 'castleBlack', tx: 11, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 8, y: 21, text: 'Somebody has driven a spear into the ice here.\nThere is no message. The message is the spear.' },
    ],
    npcs: [
      { x: 10, y: 4, dir: 'down', sprite: 'whitewalker', name: '?', script: 'ghostfang',
        hideIfFlag: 'ghostfang_done' },
      { x: 6, y: 14, dir: 'right', sprite: 'wildling', name: 'Free Folk', script: 'trainer',
        data: { trainer: 'freeFolk' } },
    ],
    items: [
      { x: 15, y: 20, item: 'dragonglass', count: 1, flag: 'item_beyond_glass' },
    ],
  }),

  // =========================================================================
  //  THE VALE
  // =========================================================================
  bloodyGate: makeRoute({
    name: 'The Bloody Gate', ground: 'grass', wall: 'C', music: 'route',
    features: [
      { type: 'sign', x: 8, y: 21 },
      { type: 'cliff', x: 2, y: 2, w: 5, h: 4 },
      { type: 'cliff', x: 14, y: 2, w: 4, h: 4 },
      { type: 'grass', x: 3, y: 7, w: 5, h: 3 },
      { type: 'grass', x: 13, y: 7, w: 5, h: 3 },
      { type: 'cliff', x: 2, y: 11, w: 6, h: 3 },
      { type: 'cliff', x: 13, y: 11, w: 5, h: 3 },
      { type: 'ledge', x: 1, y: 15, w: 9, h: 1 },
      { type: 'ledge', x: 11, y: 15, w: 8, h: 1 },
      { type: 'grass', x: 3, y: 17, w: 6, h: 3 },
      { type: 'grass', x: 12, y: 17, w: 6, h: 3 },
    ],
    encounters: [
      { roamer: 'clansman', min: 21, max: 27, weight: 36 },
      { roamer: 'hedgeKnight', min: 23, max: 30, weight: 32 },
      { roamer: 'manAtArms', min: 22, max: 28, weight: 32 },
    ],
    warps: [
      { x: 10, y: 23, to: 'riverlands', tx: 18, ty: 12, dir: 'down' },
      { x: 10, y: 0, to: 'theEyrie', tx: 11, ty: 18, dir: 'up' },
    ],
    signs: [
      { x: 8, y: 21, text: 'THE BLOODY GATE\n"You may not pass."\nSomeone has scratched: "unless"' },
    ],
    npcs: [
      { x: 6, y: 10, dir: 'right', sprite: 'arryn', name: 'Ser Vardis', script: 'trainer',
        data: { trainer: 'valeKnight' } },
      { x: 13, y: 19, dir: 'left', sprite: 'brienne', name: 'Brienne of Tarth', script: 'duel',
        data: { duel: 'brienne' } },
    ],
    items: [
      { x: 3, y: 20, item: 'kingsRansom', count: 1, flag: 'item_vale_ransom' },
    ],
  }),

  theEyrie: makeTown({
    name: 'The Eyrie', ground: 'stone', wall: 'C', floor: 'o', music: 'town',
    warps: [
      { x: 11, y: 19, to: 'bloodyGate', tx: 10, ty: 1, dir: 'down' },
      { x: 6, y: 6, to: 'maesterHallEyrie', tx: 5, ty: 7, dir: 'up' },
      { x: 17, y: 6, to: 'eyrieArmoury', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 9, y: 10, text: 'THE EYRIE\nSeat of House Arryn.\nAs high as honour, and a good deal colder.' },
    ],
    npcs: [
      { x: 8, y: 9, dir: 'down', sprite: 'noble', name: 'Lord Baelish', script: 'littlefinger' },
      { x: 14, y: 10, dir: 'left', sprite: 'starkLady', name: 'Lady Arryn', script: 'lysa' },
      { x: 5, y: 17, dir: 'right', sprite: 'guard', name: 'Sky Cell Guard', script: 'eyrieHint' },
    ],
  }),

  maesterHallEyrie: maesterHall({
    exitTo: 'theEyrie', exitX: 6, exitY: 7,
    stock: ['warBanner', 'kingsguardBanner', 'poppyMilk', 'weirwoodSap', 'kissOfFire'],
    healerLine: 'The climb is hard on them. Sit a while.',
    merchantLine: 'Vale goods, at Vale prices. I do not set them.',
  }),

  eyrieArmoury: {
    name: 'The Eyrie Armoury',
    indoor: true, music: 'town',
    tiles: [
      'IIIIIIIIIIII',
      'I=BB=====B=I',
      'I=====KKK==I',
      'I==========I',
      'I=TT====TT=I',
      'I==========I',
      'I=F======F=I',
      'IIIII__IIIII',
    ],
    warps: [
      { x: 5, y: 7, to: 'theEyrie', tx: 17, ty: 7, dir: 'down' },
      { x: 6, y: 7, to: 'theEyrie', tx: 17, ty: 7, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 1, dir: 'down', sprite: 'arryn', name: 'Armourer', script: 'smith',
        data: {
          line: 'Armourer: Falcon-etched and overpriced. It is the Vale, what did you expect.',
          stock: {
            weapon: ['castleForged', 'boarSpear', 'huntingBow'],
            armour: ['ringmail', 'scaleArmour'],
            shield: ['oakShield'],
          },
        } },
      { x: 5, y: 4, dir: 'right', sprite: 'braavosi', name: 'Syrio Forel', script: 'duel',
        data: { duel: 'syrio' } },
    ],
  },

  // =========================================================================
  //  THE REACH
  // =========================================================================
  roseroad: makeRoute({
    name: 'The Roseroad', ground: 'grass', music: 'route',
    features: [
      { type: 'sign', x: 8, y: 2 },
      { type: 'flowers', x: 2, y: 2, w: 6, h: 2 },
      { type: 'flowers', x: 13, y: 2, w: 5, h: 2 },
      { type: 'grass', x: 2, y: 5, w: 7, h: 3 },
      { type: 'grass', x: 12, y: 5, w: 6, h: 3 },
      { type: 'trees', x: 3, y: 10, w: 4, h: 2 },
      { type: 'trees', x: 14, y: 10, w: 4, h: 2 },
      { type: 'grass', x: 2, y: 13, w: 7, h: 3 },
      { type: 'grass', x: 12, y: 13, w: 6, h: 3 },
      { type: 'flowers', x: 4, y: 18, w: 4, h: 2 },
      { type: 'water', x: 13, y: 18, w: 5, h: 3 },
    ],
    encounters: [
      { roamer: 'hedgeKnight', min: 26, max: 33, weight: 34 },
      { roamer: 'manAtArms', min: 26, max: 34, weight: 34 },
      { roamer: 'poacher', min: 27, max: 36, weight: 32 },
    ],
    warps: [
      { x: 10, y: 0, to: 'lannisport', tx: 18, ty: 17, dir: 'down' },
      { x: 10, y: 23, to: 'highgarden', tx: 11, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 8, y: 2, text: 'THE ROSEROAD\nSouth to Highgarden, and on to Dorne.\nGrowing strong.' },
    ],
    npcs: [
      { x: 6, y: 9, dir: 'right', sprite: 'tyrell', name: 'Ser Loras', script: 'trainer',
        data: { trainer: 'reachKnight' } },
      { x: 14, y: 16, dir: 'left', sprite: 'sellsword', name: 'Bronn', script: 'duel',
        data: { duel: 'bronn' } },
    ],
    items: [
      { x: 3, y: 21, item: 'kingsguardBanner', count: 2, flag: 'item_roseroad_banner' },
    ],
  }),

  highgarden: makeTown({
    name: 'Highgarden', ground: 'grass', music: 'town',
    warps: [
      { x: 11, y: 0, to: 'roseroad', tx: 10, ty: 22, dir: 'up' },
      { x: 11, y: 19, to: 'princesPass', tx: 10, ty: 1, dir: 'down' },
      { x: 6, y: 6, to: 'maesterHallHighgarden', tx: 5, ty: 7, dir: 'up' },
      { x: 17, y: 6, to: 'highgardenArmoury', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 9, y: 10, text: 'HIGHGARDEN\nSeat of House Tyrell.\nEvery hedge is deliberate.' },
    ],
    npcs: [
      { x: 8, y: 9, dir: 'down', sprite: 'goodwife', name: 'Lady Olenna', script: 'olenna' },
      { x: 14, y: 10, dir: 'left', sprite: 'starkLady', name: 'Margaery', script: 'margaery' },
      { x: 5, y: 17, dir: 'right', sprite: 'girl', name: 'Gardener\u2019s Girl', script: 'reachHint' },
    ],
  }),

  maesterHallHighgarden: maesterHall({
    exitTo: 'highgarden', exitX: 6, exitY: 7,
    stock: ['kingsguardBanner', 'kingsRansom', 'weirwoodSap', 'kissOfFire', 'poppyMilk'],
    healerLine: 'The Reach feeds the realm. It can certainly feed your creatures.',
    merchantLine: 'Everything here is grown, brewed or embroidered within a mile.',
  }),

  highgardenArmoury: {
    name: 'The Highgarden Forge',
    indoor: true, music: 'town',
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
      { x: 5, y: 7, to: 'highgarden', tx: 17, ty: 7, dir: 'down' },
      { x: 6, y: 7, to: 'highgarden', tx: 17, ty: 7, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 1, dir: 'down', sprite: 'tyrell', name: 'Master Smith', script: 'smith',
        data: {
          line: 'Master Smith: Tourney plate, mostly. It still stops a sword.',
          stock: {
            weapon: ['castleForged', 'warhammer', 'boarSpear'],
            armour: ['scaleArmour', 'knightPlate'],
            shield: ['oakShield', 'towerShield'],
          },
        } },
    ],
  },

  // =========================================================================
  //  DORNE
  // =========================================================================
  princesPass: makeRoute({
    name: "The Prince's Pass", ground: 'sand', wall: 'C', floor: 's', music: 'route',
    features: [
      { type: 'sign', x: 8, y: 2 },
      { type: 'cliff', x: 2, y: 2, w: 5, h: 3 },
      { type: 'cliff', x: 14, y: 2, w: 4, h: 3 },
      { type: 'grass', x: 3, y: 6, w: 5, h: 3 },
      { type: 'grass', x: 13, y: 6, w: 5, h: 3 },
      { type: 'cliff', x: 2, y: 11, w: 4, h: 3 },
      { type: 'cliff', x: 15, y: 11, w: 3, h: 3 },
      { type: 'grass', x: 3, y: 15, w: 6, h: 3 },
      { type: 'grass', x: 12, y: 15, w: 6, h: 3 },
      { type: 'water', x: 5, y: 20, w: 4, h: 2 },
    ],
    encounters: [
      { roamer: 'dornishOutrider', min: 30, max: 36, weight: 40 },
      { roamer: 'sellsword', min: 30, max: 35, weight: 30 },
      { roamer: 'bandit', min: 31, max: 38, weight: 30 },
    ],
    warps: [
      { x: 10, y: 0, to: 'highgarden', tx: 11, ty: 18, dir: 'up' },
      { x: 10, y: 23, to: 'sunspear', tx: 11, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 8, y: 2, text: "THE PRINCE'S PASS\nThe only easy road into Dorne.\nIt is not easy." },
    ],
    npcs: [
      { x: 6, y: 10, dir: 'right', sprite: 'martell', name: 'Sand Steed Rider', script: 'trainer',
        data: { trainer: 'dorneRider' } },
    ],
    items: [
      { x: 16, y: 19, item: 'kingsRansom', count: 1, flag: 'item_dorne_ransom' },
    ],
  }),

  sunspear: makeTown({
    name: 'Sunspear', ground: 'sand', wall: 'C', floor: 's', music: 'town',
    warps: [
      { x: 11, y: 0, to: 'princesPass', tx: 10, ty: 22, dir: 'up' },
      { x: 6, y: 6, to: 'maesterHallSunspear', tx: 5, ty: 7, dir: 'up' },
      { x: 17, y: 6, to: 'sunspearArmoury', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 9, y: 10, text: 'SUNSPEAR\nSeat of House Martell.\nUnbowed. Unbent. Unbroken.' },
    ],
    npcs: [
      { x: 8, y: 9, dir: 'down', sprite: 'martell', name: 'Oberyn Martell', script: 'duel',
        data: { duel: 'oberyn' } },
      { x: 14, y: 10, dir: 'left', sprite: 'oldman', name: 'Prince Doran', script: 'doran' },
      { x: 5, y: 17, dir: 'right', sprite: 'child', name: 'Orphan', script: 'dorneHint' },
    ],
  }),

  maesterHallSunspear: maesterHall({
    exitTo: 'sunspear', exitX: 6, exitY: 7,
    stock: ['kingsguardBanner', 'kingsRansom', 'antidote', 'weirwoodSap', 'kissOfFire'],
    healerLine: 'Dornish sun burns creatures raised in the North. Rest them.',
    merchantLine: 'Sun-dried, salt-cured and strong enough to strip paint.',
  }),

  sunspearArmoury: {
    name: 'The Sunspear Bazaar',
    indoor: true, music: 'town',
    tiles: [
      'IIIIIIIIIIII',
      'I=TT=====B=I',
      'I=====KKK==I',
      'I==========I',
      'I=TT====TT=I',
      'I==========I',
      'I=F======F=I',
      'IIIII__IIIII',
    ],
    warps: [
      { x: 5, y: 7, to: 'sunspear', tx: 17, ty: 7, dir: 'down' },
      { x: 6, y: 7, to: 'sunspear', tx: 17, ty: 7, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 1, dir: 'down', sprite: 'martell', name: 'Bazaar Smith', script: 'smith',
        data: {
          line: 'Bazaar Smith: Light armour, long spears, and poison if you ask quietly.',
          stock: {
            weapon: ['boarSpear', 'huntingKnife', 'castleForged'],
            armour: ['boiledLeather', 'scaleArmour'],
            shield: ['buckler', 'oakShield'],
          },
        } },
    ],
  },

  // =========================================================================
  //  THE STORMLANDS
  // =========================================================================
  stormlands: makeRoute({
    name: 'The Stormlands', ground: 'grass', music: 'route',
    features: [
      { type: 'sign', x: 8, y: 2 },
      { type: 'water', x: 2, y: 2, w: 5, h: 3 },
      { type: 'grass', x: 13, y: 2, w: 5, h: 3 },
      { type: 'trees', x: 2, y: 6, w: 4, h: 2 },
      { type: 'trees', x: 15, y: 6, w: 3, h: 2 },
      { type: 'grass', x: 2, y: 9, w: 7, h: 3 },
      { type: 'grass', x: 12, y: 9, w: 6, h: 3 },
      { type: 'ledge', x: 1, y: 13, w: 9, h: 1 },
      { type: 'ledge', x: 11, y: 13, w: 8, h: 1 },
      { type: 'grass', x: 3, y: 15, w: 6, h: 3 },
      { type: 'grass', x: 12, y: 15, w: 6, h: 3 },
      { type: 'water', x: 12, y: 19, w: 6, h: 3 },
    ],
    encounters: [
      { roamer: 'manAtArms', min: 28, max: 34, weight: 34 },
      { roamer: 'hedgeKnight', min: 29, max: 35, weight: 33 },
      { roamer: 'ironbornReaver', min: 30, max: 37, weight: 33 },
    ],
    warps: [
      { x: 10, y: 0, to: 'kingsroad', tx: 18, ty: 14, dir: 'down' },
      { x: 10, y: 23, to: 'stormsEnd', tx: 11, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 8, y: 2, text: 'THE STORMLANDS\nSouth to Storm\u2019s End.\nThe weather here has opinions.' },
    ],
    npcs: [
      { x: 6, y: 11, dir: 'right', sprite: 'brotherhood', name: 'Beric Dondarrion', script: 'duel',
        data: { duel: 'beric' } },
      { x: 14, y: 17, dir: 'left', sprite: 'baratheon', name: 'Storm Knight', script: 'trainer',
        data: { trainer: 'stormKnight3' } },
    ],
    items: [
      { x: 16, y: 3, item: 'kissOfFire', count: 2, flag: 'item_storm_revive' },
    ],
  }),

  stormsEnd: makeTown({
    name: "Storm's End", ground: 'grass', wall: 'C', music: 'town',
    warps: [
      { x: 11, y: 0, to: 'stormlands', tx: 10, ty: 22, dir: 'up' },
      { x: 6, y: 6, to: 'maesterHallStormsEnd', tx: 5, ty: 7, dir: 'up' },
      { x: 17, y: 6, to: 'stormsEndArmoury', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 9, y: 10, text: "STORM'S END\nSeat of House Baratheon.\nNo storm has ever taken it. Many have tried." },
    ],
    npcs: [
      { x: 8, y: 9, dir: 'down', sprite: 'redPriest', name: 'Melisandre', script: 'melisandre' },
      { x: 14, y: 10, dir: 'left', sprite: 'baratheon', name: 'Ser Davos', script: 'davos' },
      { x: 5, y: 17, dir: 'right', sprite: 'goodwife', name: 'Fisherwife', script: 'stormHint' },
    ],
  }),

  maesterHallStormsEnd: maesterHall({
    exitTo: "stormsEnd", exitX: 6, exitY: 7,
    stock: ['kingsguardBanner', 'kingsRansom', 'weirwoodSap', 'kissOfFire', 'stillwater'],
    healerLine: 'Storm-country creatures are hardy. Yours look tired all the same.',
    merchantLine: 'Salt, rope, and whatever the last wreck gave up.',
  }),

  stormsEndArmoury: {
    name: "The Storm's End Forge",
    indoor: true, music: 'town',
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
      { x: 5, y: 7, to: 'stormsEnd', tx: 17, ty: 7, dir: 'down' },
      { x: 6, y: 7, to: 'stormsEnd', tx: 17, ty: 7, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 1, dir: 'down', sprite: 'baratheon', name: 'Forgemaster', script: 'smith',
        data: {
          line: 'Forgemaster: Heavy work for heavy weather. Nothing pretty.',
          stock: {
            weapon: ['warhammer', 'castleForged', 'woodAxe'],
            armour: ['ringmail', 'scaleArmour', 'knightPlate'],
            shield: ['oakShield', 'towerShield'],
          },
        } },
    ],
  },

  // =========================================================================
  //  DRAGONSTONE
  // =========================================================================
  dragonstone: makeTown({
    name: 'Dragonstone', ground: 'stone', wall: 'C', floor: 'o', music: 'battleBoss',
    warps: [
      { x: 11, y: 19, to: 'kingsLanding', tx: 22, ty: 21, dir: 'down' },
      { x: 6, y: 6, to: 'maesterHallDragonstone', tx: 5, ty: 7, dir: 'up' },
      { x: 7, y: 14, to: 'dragonmont', tx: 8, ty: 14, dir: 'up' },
    ],
    signs: [
      { x: 9, y: 10, text: 'DRAGONSTONE\nAncient seat of House Targaryen.\nThe stone here was shaped while it was still soft.' },
    ],
    npcs: [
      { x: 8, y: 9, dir: 'down', sprite: 'unsullied', name: 'Grey Worm', script: 'duel',
        data: { duel: 'greyWorm' } },
      { x: 14, y: 10, dir: 'left', sprite: 'braavosi', name: 'Daario', script: 'duel',
        data: { duel: 'daario' } },
      { x: 5, y: 17, dir: 'right', sprite: 'targaryen', name: 'Daenerys', script: 'daenerys' },
      { x: 16, y: 17, dir: 'left', sprite: 'ironborn', name: 'Euron Greyjoy', script: 'duel',
        data: { duel: 'euron' } },
    ],
  }),

  maesterHallDragonstone: maesterHall({
    exitTo: 'dragonstone', exitX: 6, exitY: 7,
    stock: ['kingsguardBanner', 'kingsRansom', 'weirwoodSap', 'kissOfFire'],
    healerLine: 'The island is hot and the stone never cools. Rest them here.',
    merchantLine: 'Little trade reaches the island. What there is, is good.',
  }),

  dragonmont: {
    name: 'The Dragonmont',
    indoor: true, music: 'wild',
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
      { roamer: 'redPriestess', min: 34, max: 42, weight: 36 },
      { roamer: 'ironbornReaver', min: 35, max: 44, weight: 32 },
      { roamer: 'sellsword', min: 36, max: 48, weight: 32 },
    ],
    warps: [
      { x: 8, y: 15, to: 'dragonstone', tx: 7, ty: 15, dir: 'down' },
    ],
    npcs: [
      { x: 8, y: 7, dir: 'down', sprite: 'targaryen', name: '?', script: 'blackdread',
        hideIfFlag: 'blackdread_done' },
    ],
    items: [
      { x: 2, y: 1, item: 'dragonglass', count: 1, flag: 'item_dragonmont_glass' },
      { x: 14, y: 14, item: 'kingsRansom', count: 2, flag: 'item_dragonmont_ransom' },
    ],
  },

  // ============================================ route 1: the Wolfswood road ==
  wolfswood: {
    name: 'The Wolfswood',
    music: 'route',
    ground: 'grass',
    tiles: [
      'PPPPPPPPPPdPPPPPPPPP',
      'PSSSSSSSSSdS!SSSSSSP',
      'PSS;;;SSSSdSSS;;;SSP',
      'PSS;;;SSSSdSSS;;;SSP',
      'PSSSSSSSSSdSSSSSSSSP',
      'PSSSSSPPSSdSSPPSSSSP',
      'PSSSSSSSSSdSSSSSSSSP',
      'PSS;;;;;;SdS;;;;;SSP',
      'PSS;;;;;;SdS;;;;;SSP',
      'PSSSSSSSSSdSSSSSSSSP',
      'PSSSSSSSSSdSSSSSSSSP',
      'P.........d........P',
      'P#........d.......#P',
      'P.,,,,....d...,,,,.P',
      'P.,,,,....d...,,,,.P',
      'P.........d........P',
      'P..##.....d....##..P',
      'P.......!.d........P',
      'PLLLLLLLLLdLLLLLLLLP',
      'P.........d........P',
      'P.,,,,,,..d..,,,,,.P',
      'P.,,,,,,..d..,,,,,.P',
      'P.........d........P',
      'P#..##....d...##..#P',
      'P.........d........P',
      '##########d#########',
    ],
    encounters: [
      { roamer: 'bandit', min: 3, max: 6, weight: 34 },
      { roamer: 'poacher', min: 3, max: 7, weight: 34 },
      { roamer: 'deserter', min: 4, max: 7, weight: 32 },
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
      { x: 5, y: 22, dir: 'up', sprite: 'wildlingWoman', name: 'Wildling', script: 'trainer',
        data: { trainer: 'wildling1' } },
      { x: 16, y: 20, dir: 'left', sprite: 'oldman', name: 'Woodsman', script: 'wolfswoodHint' },
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
    ground: 'grass',
    tiles: [
      '####################',
      '#........d.........#',
      '#..UU....d....UU...#',
      '#..UU....d....UU...#',
      '#........d.........#',
      '#...rrrr.d.........#',
      '#...RRRR.d....UU...#',
      '#...HDHw.d....UU...#',
      '#....d...d.........#',
      '#....ddddddd.......#',
      '#....d.....d.......#',
      '#....d.....d.......#',
      '#..~~~~~~..d.......#',
      '#..~~~~~~..d...!...#',
      '#..~~~~~~..d.......#',
      '#..........d.......#',
      '#..,,,,....d...,,..#',
      '#..,,,,....d...,,..#',
      '#..........d.......#',
      '###########d########',
    ],
    encounters: [
      { roamer: 'bandit', min: 6, max: 9, weight: 34 },
      { roamer: 'clansman', min: 7, max: 10, weight: 33 },
      { roamer: 'poacher', min: 6, max: 9, weight: 33 },
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
      { x: 4, y: 15, dir: 'right', sprite: 'goodwife', name: 'Crannogwoman', script: 'moatHint' },
      { x: 16, y: 4, dir: 'down', sprite: 'bolton', name: 'Ramsay Bolton', script: 'duel',
        data: { duel: 'ramsay' } },
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
    ground: 'grass',
    tiles: [
      '##########d#########',
      '#........!d*.......#',
      '#..,,,,...d...,,,,.#',
      '#..,,,,...d...,,,,.#',
      '#.........d........#',
      '#..~~~~~..d..~~~~..#',
      '#..~~~~~..d..~~~~..#',
      '#..~~~~~..d..~~~~..#',
      '#.........d........#',
      '#....##...d...##...#',
      '#.........d........#',
      '#LLLLLLLLLdLLLLLLLL#',
      '#.........d........d',
      '#..,,,,,,.d.,,,,,,.#',
      '#..,,,,,,.d.,,,,,,.#',
      '#.........d........#',
      '#..~~~~...d...~~~~.#',
      '#..~~~~...d...~~~~.#',
      '#.........d........#',
      '#...**....d....**..#',
      '#.........d........#',
      '#..,,,,,..d..,,,,,.#',
      '#..,,,,,..d..,,,,,.#',
      '#.........d........#',
      '##########d#########',
    ],
    encounters: [
      { roamer: 'bandit', min: 8, max: 12, weight: 28 },
      { roamer: 'brotherhoodBowman', min: 9, max: 13, weight: 24 },
      { roamer: 'sellsword', min: 9, max: 12, weight: 24 },
      { roamer: 'manAtArms', min: 8, max: 12, weight: 24 },
    ],
    warps: [
      { x: 10, y: 0, to: 'moatCailin', tx: 11, ty: 18, dir: 'up' },
      { x: 10, y: 24, to: 'riverrun', tx: 12, ty: 1, dir: 'down' },
      { x: 19, y: 12, to: 'bloodyGate', tx: 10, ty: 22, dir: 'right' },
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
      { x: 14, y: 4, dir: 'down', sprite: 'girl', name: 'Traveller\u2019s Daughter', script: 'riverlandsHint' },
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
    ground: 'grass',
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
      { roamer: 'manAtArms', min: 12, max: 15, weight: 40 },
      { roamer: 'sellsword', min: 12, max: 15, weight: 30 },
      { roamer: 'bandit', min: 12, max: 14, weight: 30 },
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
      { x: 8, y: 10, dir: 'down', sprite: 'child', name: 'Squire', script: 'riverrunSquire' },
      { x: 17, y: 13, dir: 'left', sprite: 'oldman', name: 'Boatwright', script: 'riverrunHint' },
      { x: 4, y: 17, dir: 'right', sprite: 'goodwife', name: 'Fishwife', script: 'riverrunFishwife' },
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
      { x: 8, y: 5, dir: 'left', sprite: 'oldman', name: 'Drunk', script: 'innDrunk' },
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
      { x: 8, y: 4, dir: 'down', sprite: 'tullyLady', name: 'Lady Catelyn', script: 'gymTully' },
      { x: 4, y: 7, dir: 'right', sprite: 'tully', name: 'Ser Edmure', script: 'trainer',
        data: { trainer: 'tullyKnight1' } },
      { x: 12, y: 10, dir: 'left', sprite: 'tully', name: 'Ser Brynden', script: 'trainer',
        data: { trainer: 'tullyKnight2' } },
      { x: 3, y: 14, dir: 'right', sprite: 'goodwife', name: 'Steward', script: 'gymHintTully' },
    ],
  },

  // ==================================================== route 3: Gold Road ==
  goldRoad: {
    name: 'The Gold Road',
    music: 'route',
    ground: 'grass',
    tiles: [
      '##########d#########',
      '#........!ds.......#',
      '#..,,,,...d...,,,,.#',
      '#..,,,,...d...,,,,.#',
      '#.........d........#',
      '#..CC.....d.....CC.#',
      '#..CC.....d.....CC.#',
      '#.........d........#',
      '#....,,,,.d.,,,,...#',
      '#....,,,,.d.,,,,...#',
      '#.........d........#',
      '#LLLLLLLLLdLLLLLLLL#',
      '#.........d........#',
      '#..CCCC...d...CCCC.#',
      '#..CCCC...d...CCCC.#',
      '#.........d........#',
      '#..,,,,,,.d.,,,,,,.#',
      '#..,,,,,,.d.,,,,,,.#',
      '#.........d........#',
      '#...%%....d....%%..#',
      '#.........d........#',
      '#..,,,,,..d..,,,,,.#',
      '#.........d........#',
      '##########d#########',
    ],
    encounters: [
      { roamer: 'sellsword', min: 14, max: 18, weight: 30 },
      { roamer: 'manAtArms', min: 15, max: 19, weight: 28 },
      { roamer: 'bandit', min: 14, max: 18, weight: 24 },
      { roamer: 'gravedigger', min: 16, max: 19, weight: 18 },
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
      { x: 4, y: 4, dir: 'down', sprite: 'oldman', name: 'Miner', script: 'goldRoadHint' },
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
    ground: 'cave',
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
      { roamer: 'gravedigger', min: 18, max: 26, weight: 40 },
      { roamer: 'bandit', min: 18, max: 24, weight: 30 },
      { roamer: 'sellsword', min: 22, max: 30, weight: 30 },
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
    ground: 'grass',
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
      '#........-.........-',
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
      { x: 19, y: 17, to: 'roseroad', tx: 10, ty: 1, dir: 'right' },
    ],
    signs: [
      { x: 14, y: 10, text: 'LANNISPORT\nBeneath Casterly Rock.\nSigil-holder: SER JAIME.' },
    ],
    npcs: [
      { x: 6, y: 9, dir: 'down', sprite: 'lannister', name: 'Gold Cloak', script: 'lannisportGuard' },
      { x: 15, y: 17, dir: 'left', sprite: 'goodwife', name: 'Goldsmith', script: 'lannisportHint' },
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
      { x: 3, y: 16, dir: 'right', sprite: 'child', name: 'Page', script: 'gymHintLannister' },
      { x: 13, y: 3, dir: 'down', sprite: 'mountain', name: 'Gregor Clegane', script: 'duel',
        data: { duel: 'mountain' } },
      { x: 4, y: 3, dir: 'down', sprite: 'lannister', name: 'Ser Jaime', script: 'duel',
        data: { duel: 'jaime' } },
    ],
  },

  // =================================================== route 4: Kingsroad ==
  kingsroad: {
    name: 'The Kingsroad',
    music: 'route',
    ground: 'grass',
    tiles: [
      '##########d#########',
      '#........!ds.......#',
      '#..,,,,,..d..,,,,,.#',
      '#..,,,,,..d..,,,,,.#',
      '#.........d........#',
      '#..##.....d.....##.#',
      '#.........d........#',
      '#....~~~..d..~~~...#',
      '#....~~~..d..~~~...#',
      '#.........d........#',
      '#LLLLLLLLLdLLLLLLLL#',
      '#.........d........#',
      '#..,,,,,,.d.,,,,,,.#',
      '#..,,,,,,.d.,,,,,,.#',
      '#.........d........d',
      '#...CC....d....CC..#',
      '#.........d........#',
      '#..,,,,,..d..,,,,,.#',
      '#..,,,,,..d..,,,,,.#',
      '#.........d........#',
      '#...**....d....**..#',
      '#.........d........#',
      '##########d#########',
    ],
    encounters: [
      { roamer: 'goldCloak', min: 20, max: 25, weight: 28 },
      { roamer: 'sellsword', min: 20, max: 26, weight: 26 },
      { roamer: 'bandit', min: 20, max: 24, weight: 24 },
      { roamer: 'brotherhoodBowman', min: 21, max: 26, weight: 22 },
    ],
    warps: [
      { x: 10, y: 0, to: 'lannisport', tx: 9, ty: 18, dir: 'up' },
      { x: 10, y: 22, to: 'kingsLanding', tx: 12, ty: 1, dir: 'down' },
      { x: 19, y: 14, to: 'stormlands', tx: 10, ty: 1, dir: 'right' },
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
      { x: 14, y: 20, dir: 'left', sprite: 'septa', name: 'Pilgrim', script: 'kingsroadHint' },
      { x: 4, y: 20, dir: 'right', sprite: 'hound', name: 'Sandor Clegane', script: 'duel',
        data: { duel: 'hound' } },
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
    ground: 'stone',
    tiles: [
      'MMMMMMMMMMMMMMMMMMMMMMMM',
      'Moooooooooo-oooooooooooM',
      'MooooooooooooooooooooooM',
      'MooooooooooooooooooooooM',
      'MoooorrrroooorrrrooooooM',
      'VooooRRRRooooRRRRooooooV',
      'MooooHDHwooooHwHDooooooM',
      'Mooooo-ooooooooo-ooooooM',
      'Mooooo-----------ooooooM',
      'Mooooooooo-ooooooooooooM',
      'Mooooooooo-ooooo!ooooooM',
      'MooooooooooooooooooooooM',
      'MooooooooooooooooooooooM',
      'MoooooorrrrrrrrroooooooM',
      'VooooooRRRRRRRRRoooooooV',
      'MooooooRRRRRRRRRoooooooM',
      'MooooooHwHwDHwHwoooooooM',
      'Moooooooooo-oooooooooooM',
      'Moooooooooo-oooooooooooM',
      'Moooooooooo-oooooooooooM',
      'Moooooooooo-oooooooooooM',
      'Moooooooooo-oooooooooo--',
      'MMMMMMMMMMMMMMMMMMMMMMMM',
    ],
    encounters: [],
    warps: [
      { x: 11, y: 1, to: 'kingsroad', tx: 10, ty: 21, dir: 'up' },
      { x: 23, y: 21, to: 'dragonstone', tx: 11, ty: 18, dir: 'right' },
      { x: 6, y: 6, to: 'maesterHallKL', tx: 5, ty: 7, dir: 'up' },
      { x: 16, y: 6, to: 'klArmoury', tx: 5, ty: 6, dir: 'up' },
      { x: 11, y: 16, to: 'redKeep', tx: 8, ty: 21, dir: 'up' },
    ],
    signs: [
      { x: 16, y: 10, text: "KING'S LANDING\nThe Red Keep stands above.\nSigil-holder: THE IRON THRONE." },
    ],
    npcs: [
      { x: 8, y: 9, dir: 'down', sprite: 'guard', name: 'Gold Cloak', script: 'klGuard' },
      { x: 18, y: 19, dir: 'left', sprite: 'child', name: 'Beggar Boy', script: 'klHint' },
      { x: 4, y: 19, dir: 'right', sprite: 'nightswatch', name: 'Recruiter', script: 'klRecruiter' },
      { x: 14, y: 12, dir: 'down', sprite: 'redPriest', name: 'Stranger', script: 'klStranger' },
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
      { x: 9, y: 4, dir: 'down', sprite: 'cersei', name: 'Queen Cersei', script: 'gymThrone' },
      { x: 6, y: 9, dir: 'right', sprite: 'guard', name: 'Ser Meryn', script: 'trainer',
        data: { trainer: 'kingsguard1' } },
      { x: 12, y: 12, dir: 'left', sprite: 'guard', name: 'Ser Boros', script: 'trainer',
        data: { trainer: 'kingsguard2' } },
      { x: 6, y: 17, dir: 'right', sprite: 'guard', name: 'Ser Preston', script: 'trainer',
        data: { trainer: 'kingsguard3' } },
      { x: 9, y: 20, dir: 'up', sprite: 'rival', name: 'Joffrey', script: 'rivalThrone',
        hideIfFlag: 'trainer_rival3' },
      { x: 12, y: 17, dir: 'left', sprite: 'kingsguard', name: 'Ser Meryn', script: 'duel',
        data: { duel: 'meryn' } },
      { x: 6, y: 12, dir: 'right', sprite: 'kingsguard', name: 'Ser Barristan', script: 'duel',
        data: { duel: 'barristan' } },
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

/**
 * Which region of Westeros each map sits in. The location card names both, the
 * way Emerald's does, so you always know where in the world you are and not
 * just which gate you walked through.
 */
export const REGIONS = {
  heroHouse: 'The North', winterfell: 'The North', winterfellForge: 'The North',
  greatKeep: 'The North', maesterHallWinterfell: 'The North', wolfswood: 'The North',
  kingsroadNorth: 'The North',
  castleBlack: 'The Wall', castleBlackArmoury: 'The Wall',
  maesterHallCastleBlack: 'The Wall',
  beyondTheWall: 'Beyond the Wall',
  moatCailin: 'The Neck', maesterHallMoat: 'The Neck',
  riverlands: 'The Riverlands', riverrun: 'The Riverlands',
  riverrunInn: 'The Riverlands', riverrunKeep: 'The Riverlands',
  maesterHallRiverrun: 'The Riverlands',
  bloodyGate: 'The Vale', theEyrie: 'The Vale', eyrieArmoury: 'The Vale',
  maesterHallEyrie: 'The Vale',
  goldRoad: 'The Westerlands', barrowCave: 'The Westerlands',
  lannisport: 'The Westerlands', lannisportForge: 'The Westerlands',
  casterlyRock: 'The Westerlands', maesterHallLannisport: 'The Westerlands',
  roseroad: 'The Reach', highgarden: 'The Reach', highgardenArmoury: 'The Reach',
  maesterHallHighgarden: 'The Reach',
  princesPass: 'Dorne', sunspear: 'Dorne', sunspearArmoury: 'Dorne',
  maesterHallSunspear: 'Dorne',
  stormlands: 'The Stormlands', stormsEnd: 'The Stormlands',
  stormsEndArmoury: 'The Stormlands', maesterHallStormsEnd: 'The Stormlands',
  kingsroad: 'The Crownlands', kingsLanding: 'The Crownlands',
  klArmoury: 'The Crownlands', redKeep: 'The Crownlands',
  maesterHallKL: 'The Crownlands',
  dragonstone: 'Dragonstone', dragonmont: 'Dragonstone',
  maesterHallDragonstone: 'Dragonstone',
};

/** The region a map belongs to, or an empty string if it has none. */
export function regionOf(key) {
  return REGIONS[key] ?? '';
}
