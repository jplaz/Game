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
  'IN=B===B=B=I',
  'IKKK===KKK=I',
  'I==========I',
  'Ib=b====h==I',
  'I==T====T==I',
  'Ib=b=======I',
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
                    roof = 'R', ridge = 'r', house = 'H', banner = 'V', dressing = [],
                    encounters = [], warps = [], npcs = [], signs = [], items = [] }) {
  const W = wall;
  const g = floor;
  const R = roof;      // the body of a roof, in whatever this region roofs with
  const t = ridge;     // its capping course
  const H = house;     // and what the walls under it are built of
  const row = (...parts) => parts.join('');
  const fill = (n) => g.repeat(n);

  // Three buildings, three trades, three silhouettes. The region decides what
  // the Maester's Hall is roofed and walled with, and that is what makes a town
  // in the Reach look nothing like one on the Wall. The other two are the same
  // everywhere on purpose: a smithy is dressed stone under a tarred roof with a
  // chimney smoking over the ridge, and a keep is a crenellated block of
  // ashlar. Once you have found one of each you can find them in any town in
  // the world without walking up and trying the door.
  const A = 'A';       // dressed stone: the forge and the castle are built of it
  const M = 'M';       // and both are crowned with battlements
  const F = 'Z';       // a forge roofs in tarred board, never in thatch
  const f = 'z';
  const P = 'p';       // and a maester's hall is limewashed, wherever it stands
  const V = banner;

  const tiles = [
    W.repeat(11) + '-' + W.repeat(12),
    row(W, fill(10), '-', fill(11), W),
    row(W, fill(2), 'u', fill(7), '-', g, g, 'n', fill(8), W),
    row(W, fill(2), t.repeat(6), fill(2), '-', fill(2), f.repeat(6), fill(3), W),
    row(W, fill(2), R.repeat(6), fill(2), '-', fill(2), F.repeat(6), fill(3), W),
    row(W, fill(2), R.repeat(6), fill(2), '-', fill(2), F.repeat(6), fill(3), W),
    row(W, fill(2), P, 'e', P, 'D', P, 'w', fill(2), '-', fill(2), A, 'k', A, 'D', A, A, fill(3), W),
    row(W, fill(5), '-', fill(4), '-', fill(5), '-', fill(5), W),
    row(W, fill(2), '-'.repeat(18), fill(2), W),
    // The seat itself: two towers standing a course above a curtain wall, with
    // the house's banners hung either side of the gate. Every town used to have
    // a shed with a door in it here, which is not what a seat of a great house
    // looks like from the road.
    row(W, fill(2), M, fill(6), M, '-', fill(11), W),
    row(W, fill(2), A, M.repeat(6), A, '-', g, '!', fill(9), W),
    row(W, fill(2), A.repeat(8), '-', fill(11), W),
    row(W, fill(2), A, A, V, A, A, V, A, A, '-', fill(11), W),
    row(W, fill(2), A.repeat(8), '-', fill(11), W),
    row(W, fill(2), A, A, A, A, 'D', A, A, A, '-', fill(11), W),
    row(W, fill(6), '-', fill(3), '-', fill(11), W),
    row(W, fill(2), '-'.repeat(18), fill(2), W),
    row(W, fill(10), '-', fill(11), W),
    row(W, fill(10), '-', fill(11), W),
    W.repeat(11) + '-' + W.repeat(12),
  ];

  /* Whatever this particular town has that no other one does: a rose bed, a
     ruin, a pool. One plan drawn nine times is nine of the same town. */
  const grid = tiles.map((r) => [...r]);
  /* Never on open floor somebody is standing on, or a door leads to: a rose bed
     dropped on a fisherman walls him into the ground he is standing on, and the
     audit is the only thing that ever notices. */
  const taken = new Set([...npcs, ...signs, ...warps, ...items]
    .map((o) => `${o.x},${o.y}`));
  for (const [x, y, char] of dressing) {
    if (!grid[y] || grid[y][x] !== g || taken.has(`${x},${y}`)) continue;
    grid[y][x] = char;
  }
  const laid = grid.map((r) => r.join(''));

  return { name, music, ground, tiles: laid, encounters, warps, npcs, signs, items };
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

// ---------------------------------------------------------------------------
// King's Landing.
//
// The capital was a twenty-four tile square with four buildings in it, which is
// the same as a village with better walls. It is the largest map the hardware
// will hold now - thirty-two by thirty-two, which is as far as a screenblock
// reaches - and it is laid out as districts rather than as a plan: three hills,
// a market between them, a warren in the south-west that you have to find your
// way through, and the docks behind it.
//
// Built from a grid rather than typed out as rows, because a thirty-two wide
// map typed by hand is a map with a one-character mistake in it somewhere.
// ---------------------------------------------------------------------------
/* A maze carved rather than typed. Every route in this game has been a straight
   road down the middle of a rectangle, and a maze written out by hand is a maze
   with a wall in the wrong place: this carves a perfect one from a fixed seed,
   so it is the same warren every time you play and it is guaranteed to join up.
   `wide` and `tall` are in cells; the grid comes out (2*wide+1) by (2*tall+1). */
function warren(seed, wide, tall, floor = '=', wall = 'I') {
  let n = seed >>> 0;
  const roll = (k) => {
    n = (Math.imul(n ^ (n >>> 15), 2246822519) + 374761393) >>> 0;
    return (n >>> 9) % k;
  };
  const W = wide * 2 + 1, H = tall * 2 + 1;
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill(wall));
  const seen = new Array(wide * tall).fill(false);
  const stack = [[0, 0]];
  seen[0] = true;
  g[1][1] = floor;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const ways = [];
    if (cx > 0 && !seen[cy * wide + cx - 1]) ways.push([-1, 0]);
    if (cx < wide - 1 && !seen[cy * wide + cx + 1]) ways.push([1, 0]);
    if (cy > 0 && !seen[(cy - 1) * wide + cx]) ways.push([0, -1]);
    if (cy < tall - 1 && !seen[(cy + 1) * wide + cx]) ways.push([0, 1]);
    if (!ways.length) { stack.pop(); continue; }
    const [dx, dy] = ways[roll(ways.length)];
    const nx = cx + dx, ny = cy + dy;
    g[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = floor;
    g[ny * 2 + 1][nx * 2 + 1] = floor;
    seen[ny * wide + nx] = true;
    stack.push([nx, ny]);
  }
  /* A perfect maze has exactly one route between any two points, which is a
     puzzle rather than a place. Knock a few walls through so there are corners
     to double back into and more than one way down. */
  for (let i = 0; i < wide * tall / 3; i++) {
    const x = 1 + roll(W - 2), y = 1 + roll(H - 2);
    if ((x & 1) === (y & 1)) continue;
    g[y][x] = floor;
  }
  return g.map((r) => r.join(''));
}

function cityGrid() {
  const W = 32, H = 32;
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill('o'));

  const put = (x, y, c) => { if (g[y] && g[y][x] !== undefined) g[y][x] = c; };
  const box = (x, y, w, h, c) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c);
  };
  const row = (x, y, text) => [...text].forEach((c, i) => put(x + i, y, c));

  // The city wall, all the way round.
  box(0, 0, W, 1, 'M'); box(0, H - 1, W, 1, 'M');
  box(0, 0, 1, H, 'M'); box(W - 1, 0, 1, H, 'M');

  // --- Visenya's Hill, north-west: the Great Sept of Baelor ----------------
  // Seven crystal towers, which at this size is a pale block with a battlement
  // over it and a great door in the middle of the south face.
  box(2, 2, 9, 1, 'M');
  box(2, 3, 9, 4, 'A');
  row(2, 7, 'AAppDppAA');
  put(4, 5, 'V'); put(8, 5, 'V');

  // --- Aegon's High Hill, north-east: the Red Keep --------------------------
  box(20, 2, 10, 1, 'M');
  box(20, 3, 10, 1, 'M');
  box(20, 4, 10, 5, 'A');
  row(20, 9, 'AAAAADAAAA');
  put(22, 6, 'V'); put(27, 6, 'V');
  put(20, 3, 'A'); put(29, 3, 'A');       // corner towers stand a course higher

  // --- the streets ---------------------------------------------------------
  box(1, 10, W - 2, 2, '=');              // the great east-west way
  box(15, 1, 2, 9, '=');                  // up to the hills
  box(15, 12, 2, 8, '=');                 // down through the market
  box(1, 20, W - 2, 1, '=');              // the lower way
  box(15, 21, 2, 10, '=');                // and out of the Mud Gate

  // --- the market, middle: the Maester's Hall and the Street of Steel ------
  box(3, 13, 8, 1, 'q'); box(3, 14, 8, 2, 'Q');
  row(3, 16, 'pepDpwpp');
  box(20, 12, 1, 1, 'n');
  box(19, 13, 7, 1, 'z'); box(19, 14, 7, 2, 'Z');
  row(19, 16, 'AAkDAAA');
  // Stalls and awnings in the square itself.
  for (const [x, y] of [[12, 13], [12, 17], [27, 13], [27, 17], [6, 18], [24, 18]]) {
    put(x, y, 'K'); put(x + 1, y, 'K');
  }

  // --- Rhaenys's Hill, east: the Dragonpit, burnt and open ----------------
  box(24, 22, 6, 1, 'U'); box(24, 23, 6, 3, 'A');
  row(24, 26, 'UAADAU');
  put(25, 24, 'U'); put(28, 24, 'U');

  // --- Flea Bottom, south-west: a warren you have to find your way through --
  // Nothing in here is on a grid. That is the point of it.
  warren(0x5EA51DE, 7, 5, 'd', 'H').forEach((line, j) => row(1, 21 + j, line));
  /* Two ways out onto the street. A warren with one door is not a district, it
     is a trap: coming back up out of Flea Bottom put you in the middle of it
     with the door you had just used as the only way anywhere. */
  put(15, 22, 'd'); put(15, 30, 'd');
  put(11, 21, 'D');                        // in off the lower way
  put(16, 31, '=');                        // the Mud Gate, out to the Kingsroad

  // The docks, south-east, behind the warren.
  box(22, 29, 8, 2, '~');
  box(20, 28, 10, 1, 's');
  put(21, 29, 's'); put(21, 30, 's');

  // A few green things nobody has paved over yet.
  for (const [x, y] of [[13, 4], [13, 6], [18, 5], [18, 7], [12, 8], [19, 3]]) put(x, y, ',');

  return g.map((r) => r.join(''));
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
      'MSSSSSSSSnSSSSSSSSSSSSSM',
      'MSSSSSSSSzzzMMMSSSSSSSSM',
      'MSSSSSSSSZZZAAASSSSSSSSM',
      'vSSSSSSSSZZZAAASSSSSSSSv',
      'MSSSSSSSSkDADAASSSSSSSSM',
      'MSSSSSSSS!--SSSSSSSSSSSM',
      'MSS------------------SSM',
      'MSSSSSSSSSSS-SSSSSSSSSSM',
      'MSSggggggSSS-SSSggggSSSM',
      'MSSGGGGGGSSS-SSSGGGGSSSM',
      'MSSGGGGGGSSS-SSSHDHwSSSM',
      'vSSpepDpwSSS-SSSSSSSSSSv',
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
          { beast: 'snowpup', min: 2, max: 4, weight: 16 },
      { beast: 'ravenling', min: 2, max: 4, weight: 14 },
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
      { x: 7, y: 16, dir: 'down', name: 'Landless Knight', sprite: 'noble',
        script: 'claimHoldfast', data: {} },
      { x: 15, y: 7, dir: 'down', name: 'Jory Cassel', sprite: 'stark',
        script: 'recruit', data: { companion: 'jory' } },
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
      'Ixx=a===l=lI',
      'I=====KKK==I',
      'I==========I',
      'I=a=====a==I',
      'I==========I',
      'I=T=F==F=T=I',
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
      { x: 8, y: 4, dir: 'down', sprite: 'stark', name: 'Lord Eddard', script: 'gymStark',
        data: { trainer: 'gymStark' } },
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
          { beast: 'snowpup', min: 12, max: 17, weight: 14 },
      { beast: 'wightling', min: 14, max: 18, weight: 12 },
      { beast: 'falconet', min: 13, max: 17, weight: 12 },
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

  // Castle Black is not a town with snow on it. It is a huddle of black timber
  // halls pressed against seven hundred feet of ice, with one tunnel through.
  // Laid out by hand for that reason: the template that builds the southern
  // towns puts a crossroads in the middle and two houses on it, and there is
  // nothing on this earth less like the Wall than a crossroads.
  castleBlack: {
    name: 'Castle Black',
    music: 'wild',
    ground: 'snow',
    tiles: [
      'CCCCCCCCCCC-CCCCCCCCCCCC',
      'CCCCCCCCCCC-CCCCCCCCCCCC',
      'CCCCCCCCCCC-CCCCCCCCCCCC',
      'iiiiiiiiiii-iiiiiiiiiiii',
      'PSSSSSSSSSS-SSSSSnSSSSSP',
      'PSSzzzzSSSS-SSSSzzzzzSSP',
      'PSSZZZZSSSS-SSSSZZZZZSSP',
      'PSSeDpwSSSS-SSSSAkDAASSP',
      'PSSSSSSSSSS-SSSSSSSSSSSP',
      'PSS------------------SSP',
      'PSSSSSSSS!S-SSSSSSSSSSSP',
      'PSSSSSSSSSS-SSSSSSSSSSSP',
      'PSSzzzzzzSS-SSSSSSSSSSSP',
      'PSSZZZZZZSS-SSSSSSSSSSSP',
      'PSSHwDHwHSS-SSSSSSSSSSSP',
      'PSSSSSSSSSS-SSSSSSSSSSSP',
      'PSSSSSSSSSS-SSSSSSSSSSSP',
      'PSS;;;;SSSS-SSSS;;;;SSSP',
      'PSS;;;;SSSS-SSSS;;;;SSSP',
      'PPPPPPPPPPP-PPPPPPPPPPPP',
    ],
    warps: [
      { x: 11, y: 19, to: 'kingsroadNorth', tx: 10, ty: 1, dir: 'down' },
      { x: 11, y: 0, to: 'beyondTheWall', tx: 10, ty: 22, dir: 'up' },
      { x: 4, y: 7, to: 'maesterHallCastleBlack', tx: 5, ty: 7, dir: 'up' },
      { x: 18, y: 7, to: 'castleBlackArmoury', tx: 5, ty: 6, dir: 'up' },
      { x: 5, y: 14, to: 'castleBlackHall', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 13, y: 10, text: 'CASTLE BLACK\nSeat of the Night\u2019s Watch.\nNorth of here the maps stop.' },
    ],
    npcs: [
      { x: 12, y: 4, dir: 'down', name: 'A Deserter', sprite: 'nightswatch',
        script: 'quest', data: { quest: 'deserterAtTheGate' } },
      { x: 8, y: 9, dir: 'down', sprite: 'nightswatch', name: 'Jon Snow', script: 'duel',
        data: { duel: 'jonSnow' } },
      { x: 14, y: 10, dir: 'left', sprite: 'wildling', name: 'Tormund', script: 'duel',
        data: { duel: 'tormund' } },
      { x: 5, y: 17, dir: 'right', sprite: 'child', name: 'Steward Boy', script: 'wallHint' },
      { x: 17, y: 17, dir: 'left', sprite: 'maester', name: 'Maester Aemon', script: 'aemon' },
    ],
  },

  // ---------------------------------------------- rooms behind real doors --
  // Three door tiles in the towns opened onto nothing at all: a player walks up
  // to a door and the world does not answer. Two of them now have halls behind
  // them, and the third is the forge Dragonstone never had - which matters, as
  // it is where a Targaryen begins.
  castleBlackHall: {
    name: 'The Common Hall',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIII',
      'I==========I',
      'I==TTTT====I',
      'I==TTTT==B=I',
      'I==========I',
      'I==TT==TT==I',
      'I==TT==TT==I',
      'IIIII__IIIII',
    ],
    warps: [
      { x: 5, y: 7, to: 'castleBlack', tx: 5, ty: 15, dir: 'down' },
      { x: 6, y: 7, to: 'castleBlack', tx: 5, ty: 15, dir: 'down' },
    ],
    npcs: [
      { x: 6, y: 5, dir: 'down', sprite: 'nightswatch', name: 'Hall Steward',
        script: 'wallHint',
        data: { line: 'Eat while it is hot. Nothing north of the Wall is hot.' } },
      { x: 7, y: 2, dir: 'left', sprite: 'nightswatch', name: 'Sworn Brother', script: 'duel',
        data: { duel: 'deserter' } },
    ],
  },

  eyrieKeep: {
    name: 'The High Hall',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIIIIIIII',
      'I==============II',
      'I===cccccccc===II',
      'I===cccXccc c==II',
      'I===cccccccc===II',
      'I=B============II',
      'I=B====TT======II',
      'I======TT======II',
      'I==============II',
      'IIIIIII__IIIIIIII',
    ],
    warps: [
      { x: 7, y: 9, to: 'theEyrie', tx: 7, ty: 15, dir: 'down' },
      { x: 8, y: 9, to: 'theEyrie', tx: 7, ty: 15, dir: 'down' },
    ],
    npcs: [
      { x: 9, y: 2, dir: 'down', sprite: 'arryn', name: 'Bronze Yohn Royce',
        script: 'gymArryn', data: { trainer: 'gymArryn' } },
      { x: 7, y: 4, dir: 'down', sprite: 'goodwife', name: 'Lady of the Vale',
        script: 'eyrieHint',
        data: { line: 'The Vale keeps its own counsel, and its own gate. '
          + 'Mind the Bloody Gate on your way out.' } },
      { x: 3, y: 7, dir: 'right', sprite: 'guard', name: 'Knight of the Gate', script: 'duel',
        data: { duel: 'hedgeKnight' } },
    ],
  },

  dragonstoneArmoury: {
    name: 'The Dragonpit Forge',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIII',
      'Ixx=a===l=lI',
      'I=====KKK==I',
      'I==========I',
      'I=a=====a==I',
      'I==========I',
      'I=T=F==F=T=I',
      'IIIII__IIIII',
    ],
    warps: [
      { x: 5, y: 7, to: 'dragonstone', tx: 17, ty: 7, dir: 'down' },
      { x: 6, y: 7, to: 'dragonstone', tx: 17, ty: 7, dir: 'down' },
    ],
    npcs: [
      { x: 5, y: 1, dir: 'down', sprite: 'smallfolk', name: 'Dragonsmith', script: 'smith',
        data: {
          line: 'Dragonsmith: The fires under this rock never went out. '
            + 'Neither has the steel they make.',
          stock: {
            weapon: ['ironSword', 'castleForged', 'warhammer'],
            armour: ['ringmail', 'scaleArmour', 'knightsPlate'],
            shield: ['oakShield', 'towerShield'],
          },
        } },
    ],
  },

  maesterHallCastleBlack: maesterHall({
    exitTo: 'castleBlack', exitX: 4, exitY: 8,
    stock: ['warBanner', 'kingsguardBanner', 'poppyMilk', 'weirwoodSap', 'frostTonic', 'kissOfFire'],
    healerLine: 'Cold does worse to a creature than any blade. Let me look.',
    merchantLine: 'The Watch has little, and shares it.',
  }),

  castleBlackArmoury: {
    name: 'The Watch Armoury',
    indoor: true, music: 'town',
    tiles: [
      'IIIIIIIIIIII',
      'Ixx=a===l=lI',
      'I=====KKK==I',
      'I==========I',
      'I=a=====a==I',
      'I==========I',
      'I=T=F==F=T=I',
      'IIIII__IIIII',
    ],
    warps: [
      { x: 5, y: 7, to: 'castleBlack', tx: 18, ty: 8, dir: 'down' },
      { x: 6, y: 7, to: 'castleBlack', tx: 18, ty: 8, dir: 'down' },
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
          { beast: 'wightling', min: 28, max: 34, weight: 18 },
      { beast: 'direwolf', min: 28, max: 33, weight: 12 },
      { beast: 'palewalker', min: 34, max: 39, weight: 6 },
    ],
    warps: [
      { x: 10, y: 23, to: 'castleBlack', tx: 11, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 8, y: 21, text: 'Somebody has driven a spear into the ice here.\nThere is no message. The message is the spear.' },
    ],
    npcs: [
      { x: 8, y: 10, dir: 'down', name: 'Ygritte', sprite: 'wildling',
        script: 'recruit', data: { companion: 'ygritte' } },
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
          { beast: 'falconet', min: 22, max: 27, weight: 16 },
      { beast: 'skytalon', min: 26, max: 30, weight: 8 },
      { beast: 'crabcrag', min: 23, max: 27, weight: 10 },
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
    banner: 'v',
    dressing: [[4, 1, 'i'], [5, 1, 'i'], [6, 1, 'i'], [17, 17, 'C'], [18, 17, 'C'],
               [5, 17, 'C'], [6, 18, 'C'], [19, 2, 'C'], [4, 2, 'i'], [18, 18, 'C'],
               [15, 12, 'C'], [16, 13, 'C'], [20, 9, 'C'], [3, 17, 'i']],
    roof: 'G', ridge: 'g',
    name: 'The Eyrie', ground: 'stone', wall: 'C', floor: 'o', music: 'town',
    warps: [
      { x: 11, y: 19, to: 'bloodyGate', tx: 10, ty: 1, dir: 'down' },
      { x: 6, y: 6, to: 'maesterHallEyrie', tx: 5, ty: 7, dir: 'up' },
      { x: 17, y: 6, to: 'eyrieArmoury', tx: 5, ty: 6, dir: 'up' },
      { x: 7, y: 14, to: 'eyrieKeep', tx: 7, ty: 8, dir: 'up' },
    ],
    signs: [
      { x: 13, y: 10, text: 'THE EYRIE\nSeat of House Arryn.\nAs high as honour, and a good deal colder.' },
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
      'Ixx=a===l=lI',
      'I=====KKK==I',
      'I==========I',
      'I=a=====a==I',
      'I==========I',
      'I=T=F==F=T=I',
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
          { beast: 'fawnhart', min: 26, max: 31, weight: 16 },
      { beast: 'cubmane', min: 27, max: 31, weight: 12 },
      { beast: 'emberwisp', min: 28, max: 32, weight: 10 },
    ],
    warps: [
      { x: 10, y: 0, to: 'lannisport', tx: 18, ty: 17, dir: 'down' },
      { x: 10, y: 23, to: 'highgarden', tx: 11, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 8, y: 2, text: 'THE ROSEROAD\nSouth to Highgarden, and on to Dorne.\nGrowing strong.' },
    ],
    npcs: [
      { x: 8, y: 16, dir: 'down', name: 'Maester Wyllis', sprite: 'maester',
        script: 'quest', data: { quest: 'maestersDebt' } },
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
    banner: 'V',
    dressing: [[4, 17, '*'], [5, 17, '*'], [6, 17, '*'], [7, 17, '*'], [4, 18, '*'],
               [5, 18, '*'], [6, 18, '*'], [15, 17, '*'], [16, 17, '*'], [17, 17, '*'],
               [16, 18, '*'], [17, 18, '*'], [14, 12, '#'], [17, 12, '#'], [15, 14, '#'],
               [19, 13, '#'], [13, 2, '*'], [20, 2, '*'], [2, 1, '*'], [21, 17, '#']],
    roof: 'Y', ridge: 'y',
    name: 'Highgarden', ground: 'grass', music: 'town',
    warps: [
      { x: 7, y: 14, to: 'highgardenKeep', tx: 7, ty: 8, dir: 'up' },
      { x: 11, y: 0, to: 'roseroad', tx: 10, ty: 22, dir: 'up' },
      { x: 11, y: 19, to: 'princesPass', tx: 10, ty: 1, dir: 'down' },
      { x: 6, y: 6, to: 'maesterHallHighgarden', tx: 5, ty: 7, dir: 'up' },
      { x: 17, y: 6, to: 'highgardenArmoury', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 13, y: 10, text: 'HIGHGARDEN\nSeat of House Tyrell.\nEvery hedge is deliberate.' },
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
      'Ixx=a===l=lI',
      'I=====KKK==I',
      'I==========I',
      'I=a=====a==I',
      'I==========I',
      'I=T=F==F=T=I',
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
          { beast: 'sandviper', min: 30, max: 35, weight: 18 },
      { beast: 'dornspine', min: 34, max: 38, weight: 8 },
      { beast: 'crabcrag', min: 31, max: 35, weight: 12 },
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
    banner: 'V',
    dressing: [[14, 12, '~'], [15, 12, '~'], [16, 12, '~'], [14, 13, '~'], [15, 13, '~'],
               [16, 13, '~'], [4, 17, '#'], [7, 17, '#'], [5, 18, '*'], [17, 17, '#'],
               [20, 17, '#'], [18, 18, '*'], [2, 1, '#'], [21, 2, '#'], [13, 17, '*'],
               [21, 12, '#'], [2, 12, '#'], [13, 2, '*'], [20, 13, '*']],
    roof: 'Q', ridge: 'q',
    name: 'Sunspear', ground: 'sand', wall: 'C', floor: 's', music: 'town',
    warps: [
      { x: 7, y: 14, to: 'sunspearKeep', tx: 7, ty: 8, dir: 'up' },
      { x: 11, y: 0, to: 'princesPass', tx: 10, ty: 22, dir: 'up' },
      { x: 6, y: 6, to: 'maesterHallSunspear', tx: 5, ty: 7, dir: 'up' },
      { x: 17, y: 6, to: 'sunspearArmoury', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 13, y: 10, text: 'SUNSPEAR\nSeat of House Martell.\nUnbowed. Unbent. Unbroken.' },
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
      'Ixx=a===l=lI',
      'I=====KKK==I',
      'I==========I',
      'I=a=====a==I',
      'I==========I',
      'I=T=F==F=T=I',
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
          { beast: 'crownstag', min: 33, max: 37, weight: 10 },
      { beast: 'krakenling', min: 29, max: 33, weight: 14 },
      { beast: 'riverfry', min: 28, max: 32, weight: 12 },
    ],
    warps: [
      { x: 10, y: 0, to: 'kingsroad', tx: 18, ty: 14, dir: 'down' },
      { x: 10, y: 23, to: 'stormsEnd', tx: 11, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 8, y: 2, text: 'THE STORMLANDS\nSouth to Storm\u2019s End.\nThe weather here has opinions.' },
    ],
    npcs: [
      { x: 8, y: 8, dir: 'down', name: 'Brienne of Tarth', sprite: 'brienne',
        script: 'recruit', data: { companion: 'brienne' } },
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
    banner: 'V',
    dressing: [[14, 17, '~'], [15, 17, '~'], [16, 17, '~'], [17, 17, '~'], [14, 18, '~'],
               [15, 18, '~'], [16, 18, '~'], [17, 18, '~'], [4, 17, 'U'], [5, 17, 'U'],
               [4, 18, 'U'], [20, 2, 'U'], [21, 3, 'U'], [2, 2, 'U'], [19, 12, 'U'],
               [13, 13, 'U'], [3, 1, 'U']],
    roof: 'G', ridge: 'g',
    name: "Storm's End", ground: 'grass', wall: 'C', music: 'town',
    warps: [
      { x: 7, y: 14, to: 'stormsEndKeep', tx: 7, ty: 8, dir: 'up' },
      { x: 11, y: 0, to: 'stormlands', tx: 10, ty: 22, dir: 'up' },
      { x: 6, y: 6, to: 'maesterHallStormsEnd', tx: 5, ty: 7, dir: 'up' },
      { x: 17, y: 6, to: 'stormsEndArmoury', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 13, y: 10, text: "STORM'S END\nSeat of House Baratheon.\nNo storm has ever taken it. Many have tried." },
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
      'Ixx=a===l=lI',
      'I=====KKK==I',
      'I==========I',
      'I=a=====a==I',
      'I==========I',
      'I=T=F==F=T=I',
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
    banner: 'V',
    dressing: [[14, 17, 'U'], [15, 17, 'U'], [16, 17, 'U'], [14, 18, 'U'], [17, 17, 'U'],
               [4, 17, 'U'], [5, 17, 'U'], [6, 18, 'U'], [4, 18, 'U'], [20, 2, 'C'],
               [21, 3, 'C'], [2, 1, 'C'], [3, 2, 'C'], [19, 12, 'C'], [13, 13, 'U'],
               [20, 13, 'C'], [13, 2, 'U']],
    roof: 'Z', ridge: 'z',
    name: 'Dragonstone', ground: 'stone', wall: 'C', floor: 'o', music: 'battleBoss',
    warps: [
      { x: 11, y: 19, to: 'mudGate', tx: 9, ty: 7, dir: 'down' },
      { x: 6, y: 6, to: 'maesterHallDragonstone', tx: 5, ty: 7, dir: 'up' },
      { x: 7, y: 14, to: 'dragonmont', tx: 8, ty: 14, dir: 'up' },
      { x: 17, y: 6, to: 'dragonstoneArmoury', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 13, y: 10, text: 'DRAGONSTONE\nAncient seat of House Targaryen.\nThe stone here was shaped while it was still soft.' },
    ],
    npcs: [
      { x: 8, y: 9, dir: 'down', sprite: 'unsullied', name: 'Grey Worm', script: 'duel',
        data: { duel: 'greyWorm' } },
      { x: 14, y: 10, dir: 'left', sprite: 'braavosi', name: 'Daario', script: 'duel',
        data: { duel: 'daario' } },
      { x: 5, y: 17, dir: 'right', sprite: 'targaryen', name: 'Daenerys Targaryen',
        script: 'gymTargaryen', data: { trainer: 'gymTargaryen' } },
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
          { roamer: 'dragonrider', min: 36, max: 44, weight: 14 },
      { beast: 'emberwisp', min: 34, max: 40, weight: 18 },
      { beast: 'pyremaw', min: 40, max: 45, weight: 10 },
      { beast: 'scaleflight', min: 36, max: 42, weight: 12 },
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

  highgardenKeep: {
    name: 'The Hall of Flowers',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIIIIIIII',
      'I==============II',
      'I===cccccccc===II',
      'I===cccXccc c==II',
      'I===cccccccc===II',
      'I=B============II',
      'I=B====TT======II',
      'I=F====TT=====FII',
      'I==============II',
      'IIIIIII__IIIIIIII',
    ],
    warps: [
      { x: 7, y: 9, to: 'highgarden', tx: 7, ty: 15, dir: 'down' },
      { x: 8, y: 9, to: 'highgarden', tx: 7, ty: 15, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 4, dir: 'down', sprite: 'tyrell', name: 'Lord Randyll Tarly',
        script: 'gymTyrell', data: { trainer: 'gymTyrell' } },
      { x: 3, y: 7, dir: 'right', sprite: 'guard', name: 'Household Guard', script: 'duel',
        data: { duel: 'hedgeKnight' } },
      { x: 12, y: 2, dir: 'left', sprite: 'goodwife', name: 'Steward of the Reach',
        script: 'reachHint',
        data: { line: 'Lord Tarly does not care who your father was. He cares whether you can hold a line.' } },
    ],
  },

  sunspearKeep: {
    name: 'The Tower of the Sun',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIIIIIIII',
      'I==============II',
      'I===cccccccc===II',
      'I===cccXccc c==II',
      'I===cccccccc===II',
      'I=B============II',
      'I=B====TT======II',
      'I=F====TT=====FII',
      'I==============II',
      'IIIIIII__IIIIIIII',
    ],
    warps: [
      { x: 7, y: 9, to: 'sunspear', tx: 7, ty: 15, dir: 'down' },
      { x: 8, y: 9, to: 'sunspear', tx: 7, ty: 15, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 4, dir: 'down', sprite: 'martell', name: 'Prince Oberyn',
        script: 'gymMartell', data: { trainer: 'gymMartell' } },
      { x: 3, y: 7, dir: 'right', sprite: 'sellsword', name: 'Spear of Dorne', script: 'duel',
        data: { duel: 'bronn' } },
      { x: 12, y: 2, dir: 'left', sprite: 'girl', name: 'Sand Snake', script: 'dorneHint',
        data: { line: 'My father fights with a spear and a smile. Watch the spear.' } },
    ],
  },

  stormsEndKeep: {
    name: 'The Round Hall',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIIIIIIII',
      'I==============II',
      'I===cccccccc===II',
      'I===cccXccc c==II',
      'I===cccccccc===II',
      'I=B============II',
      'I=B====TT======II',
      'I=F====TT=====FII',
      'I==============II',
      'IIIIIII__IIIIIIII',
    ],
    warps: [
      { x: 7, y: 9, to: 'stormsEnd', tx: 7, ty: 15, dir: 'down' },
      { x: 8, y: 9, to: 'stormsEnd', tx: 7, ty: 15, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 4, dir: 'down', sprite: 'baratheon', name: 'Stannis Baratheon',
        script: 'gymBaratheon', data: { trainer: 'gymBaratheon' } },
      { x: 3, y: 7, dir: 'right', sprite: 'redPriest', name: 'Melisandre', script: 'duel',
        data: { duel: 'redPriestess' } },
      { x: 12, y: 2, dir: 'left', sprite: 'guard', name: 'Ser Davos', script: 'stormHint',
        data: { line: 'He is a hard man and a fair one. Those are not the same thing, and he knows it.' } },
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
          { beast: 'snowpup', min: 3, max: 6, weight: 18 },
      { beast: 'bearcub', min: 4, max: 7, weight: 14 },
      { beast: 'sapling', min: 3, max: 6, weight: 12 },
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
      { x: 8, y: 6, dir: 'down', name: 'Villager', sprite: 'smallfolk',
        script: 'quest', data: { quest: 'brokenTower' } },
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
      '#..UU....d....UU.n.#',
      '#........d...zzzzzz#',
      '#...gggg.d...ZZZZZZ#',
      '#...GGGG.d...ZZZZZZ#',
      '#...eDpw.d...AkDAAA#',
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
          { beast: 'riverfry', min: 6, max: 9, weight: 16 },
      { beast: 'sapling', min: 6, max: 9, weight: 14 },
    ],
    warps: [
      { x: 9, y: 1, to: 'wolfswood', tx: 10, ty: 24, dir: 'up' },
      { x: 5, y: 7, to: 'maesterHallMoat', tx: 5, ty: 7, dir: 'up' },
      { x: 15, y: 7, to: 'moatCailinForge', tx: 5, ty: 6, dir: 'up' },
      { x: 11, y: 19, to: 'riverlands', tx: 10, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 15, y: 13, text: 'MOAT CAILIN\nThree towers still standing out of twenty.\nThe Neck swallowed the rest.' },
    ],
    npcs: [
      { x: 12, y: 10, dir: 'down', name: 'Meera Reed', sprite: 'wildlingWoman',
        script: 'recruit', data: { companion: 'meera' } },
      { x: 13, y: 10, dir: 'down', sprite: 'guard', name: 'Bog Guard', script: 'trainer',
        data: { trainer: 'bogGuard' } },
      { x: 4, y: 15, dir: 'right', sprite: 'goodwife', name: 'Crannogwoman', script: 'moatHint' },
      { x: 16, y: 9, dir: 'down', sprite: 'bolton', name: 'Ramsay Bolton', script: 'duel',
        data: { duel: 'ramsay' } },
      { x: 17, y: 10, dir: 'down', sprite: 'rival', name: 'Joffrey', script: 'rivalMoat',
        hideIfFlag: 'trainer_rival1' },
    ],
    items: [
      { x: 16, y: 2, item: 'poppyMilk', count: 1, flag: 'item_moat_poppy' },
    ],
  },

  // ------------------------------------------ the smithy in the ruins ------
  // Not the Winterfell forge with the furniture moved: a lean-to worked out of
  // a fallen tower, anvils where the floor is still sound and the bog coming in
  // at the north end.
  moatCailinForge: {
    name: 'The Bogforge',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIII',
      'Ixx=a===l=lI',
      'I=====KKK==I',
      'I==========I',
      'I=a=====a==I',
      'I==========I',
      'I=T=F==F=T=I',
      'IIIII__IIIII',
    ],
    warps: [
      { x: 5, y: 7, to: 'moatCailin', tx: 15, ty: 8, dir: 'down' },
      { x: 6, y: 7, to: 'moatCailin', tx: 15, ty: 8, dir: 'down' },
    ],
    npcs: [
      { x: 5, y: 1, dir: 'down', sprite: 'smallfolk', name: 'Bog Smith', script: 'smith',
        data: {
          line: 'Bog Smith: Crannogmen bring me iron out of the water. It has been '
            + 'down there a long while, and it holds an edge like nothing else.',
          stock: {
            weapon: ['huntingKnife', 'ironSword', 'boarSpear'],
            armour: ['gambeson', 'boiledLeather', 'ringmail'],
            shield: ['buckler', 'oakShield'],
          },
        } },
      { x: 3, y: 5, dir: 'right', sprite: 'smallfolk', name: 'Crannogman', script: 'bellowsHand',
        data: { line: 'He does not look up from the bellows. "Mind the floor by the '
          + 'north wall. It is not floor any more."' } },
    ],
  },

  // ------------------------------------------ the smithy at Riverrun -------
  // A river smithy: long, open to the water at one end, with the quenching
  // trough running the length of it.
  riverrunForge: {
    name: 'The Tully Armoury',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIII',
      'Ixx=a===l=lI',
      'I=====KKK==I',
      'I==========I',
      'I=a=====a==I',
      'I==========I',
      'I=T=F==F=T=I',
      'IIIII__IIIII',
    ],
    warps: [
      { x: 5, y: 7, to: 'riverrun', tx: 18, ty: 14, dir: 'down' },
      { x: 6, y: 7, to: 'riverrun', tx: 18, ty: 14, dir: 'down' },
    ],
    npcs: [
      { x: 3, y: 2, dir: 'down', sprite: 'merchant', name: 'Armourer Ryn', script: 'smith',
        data: {
          line: 'Ryn: River steel, and mail a man can swim in if he has to. '
            + 'Half of Riverrun has had to.',
          stock: {
            weapon: ['ironSword', 'woodAxe', 'huntingBow', 'castleForged'],
            armour: ['boiledLeather', 'ringmail', 'scaleArmour'],
            shield: ['oakShield', 'towerShield'],
          },
        } },
      { x: 8, y: 5, dir: 'left', sprite: 'tully', name: 'Hedge Knight', script: 'duel',
        data: { duel: 'hedgeKnight' } },
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
          { beast: 'riverfry', min: 8, max: 12, weight: 16 },
      { beast: 'ravenling', min: 8, max: 12, weight: 12 },
      { beast: 'boartusk', min: 9, max: 13, weight: 12 },
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
      { x: 12, y: 10, dir: 'down', name: 'Bronn', sprite: 'sellsword',
        script: 'recruit', data: { companion: 'bronn' } },
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
      '~..yyyyyy..-..yyyy....~~',
      '~..YYYYYY..-..YYYY....~~',
      '~..YYYYYY..-..HDHw....~~',
      '~..pepDpw..-..........~~',
      '~.....-....-..........~~',
      '~.....------------....~~',
      '~..........-.....n!...~~',
      '~..*.......-....zzzzzz~~',
      '~..........-....ZZZZZZ~~',
      '~...MMMMMMMMMMM.ZZZZZZ~~',
      '~...AAAAAAAAAAA.AkDAAA~~',
      '~...AAAAVAVAAAA.......~~',
      '~...AAAAAAAAAAA.......~~',
      '~...AAAAAADAAAA.......~~',
      '~..........-..........~~',
      '~..........-.......,,.~~',
      '~~~~~~~~~~~-~~~~~~~~~~~~',
    ],
    encounters: [
      { roamer: 'manAtArms', min: 12, max: 15, weight: 40 },
      { roamer: 'sellsword', min: 12, max: 15, weight: 30 },
      { roamer: 'bandit', min: 12, max: 14, weight: 30 },
          { beast: 'silverfin', min: 12, max: 15, weight: 18 },
      { beast: 'riverfry', min: 11, max: 14, weight: 14 },
    ],
    warps: [
      { x: 12, y: 0, to: 'riverlands', tx: 10, ty: 23, dir: 'up' },
      { x: 6, y: 6, to: 'maesterHallRiverrun', tx: 5, ty: 7, dir: 'up' },
      { x: 18, y: 13, to: 'riverrunForge', tx: 5, ty: 6, dir: 'up' },
      { x: 15, y: 5, to: 'riverrunInn', tx: 5, ty: 6, dir: 'up' },
      { x: 10, y: 16, to: 'riverrunKeep', tx: 8, ty: 14, dir: 'up' },
      { x: 11, y: 19, to: 'goldRoad', tx: 10, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 18, y: 9, text: 'RIVERRUN\nSeat of House Tully.\nSigil-holder: LADY CATELYN.' },
    ],
    npcs: [
      { x: 12, y: 6, dir: 'down', name: 'Smallfolk Woman', sprite: 'goodwife',
        script: 'quest', data: { quest: 'hangingTree' } },
      { x: 8, y: 10, dir: 'down', sprite: 'child', name: 'Squire', script: 'riverrunSquire' },
      { x: 17, y: 15, dir: 'left', sprite: 'oldman', name: 'Boatwright', script: 'riverrunHint' },
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
      'I=h======B=I',
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
      { x: 8, y: 4, dir: 'down', sprite: 'tullyLady', name: 'Lady Catelyn', script: 'gymTully',
        data: { trainer: 'gymTully' } },
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
          { beast: 'cubmane', min: 14, max: 18, weight: 16 },
      { beast: 'boartusk', min: 15, max: 19, weight: 14 },
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
          { beast: 'wightling', min: 18, max: 26, weight: 20 },
      { beast: 'barrowlord', min: 22, max: 30, weight: 10 },
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
      '#.o.........n....o.#',
      '#.o.rrrr...zzzz..o.#',
      '#.o.RRRR...ZZZZ..o.#',
      '#.o.eDpw...AAkD..o.#',
      '#.o..-........-..o.#',
      '#.o..----------..o.#',
      '#.o......-.......o.#',
      '#.o......-....!..o.#',
      '#.o..MMMMMMMM....o.#',
      '#.o..AAVAAVAA....o.#',
      '#.o..AAAAAAAA....o.#',
      '#.o..AAAADAAA....o.#',
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
      'Ixx=a===l=lI',
      'I=====KKK==I',
      'I==========I',
      'I=a=====a==I',
      'I==========I',
      'I=T=F==F=T=I',
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
      { x: 8, y: 3, dir: 'down', sprite: 'lannister', name: 'Ser Jaime', script: 'gymLannister',
        data: { trainer: 'gymLannister' } },
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
          { beast: 'fawnhart', min: 20, max: 25, weight: 14 },
      { beast: 'falconet', min: 21, max: 26, weight: 12 },
      { beast: 'boartusk', min: 20, max: 24, weight: 12 },
    ],
    warps: [
      { x: 10, y: 0, to: 'lannisport', tx: 9, ty: 18, dir: 'up' },
      { x: 10, y: 22, to: 'kingsLanding', tx: 16, ty: 30, dir: 'up' },
      { x: 19, y: 14, to: 'stormlands', tx: 10, ty: 1, dir: 'right' },
    ],
    signs: [
      { x: 9, y: 1, text: "THE KINGSROAD\nSouth to King's Landing.\nThe end of the road, one way or another." },
    ],
    npcs: [
      { x: 8, y: 14, dir: 'down', name: 'Samwell Tarly', sprite: 'nightswatch',
        script: 'recruit', data: { companion: 'sam' } },
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
  /**
   * Your own hall. Empty when you take it; what is in it afterwards is whatever
   * you paid to put there.
   */
  holdfast: {
    name: 'Your Hall', music: 'town', ground: 'stone', indoor: true, holdfast: true,
    tiles: [
      'IIIIIIIIIIIIIIII',
      'I==============I',
      'I==cccccccccc==I',
      'I==c========c==I',
      'I==c========c==I',
      'I==c========c==I',
      'I==c========c==I',
      'I==c========c==I',
      'I==cccccccccc==I',
      'I==============I',
      'I==============I',
      'IIIIIIID IIIIIII'.replace(' ', '='),
    ],
    npcs: [
      { x: 4, y: 3, dir: 'down', name: 'Steward', sprite: 'oldman',
        script: 'steward', data: {} },
      { x: 11, y: 3, dir: 'down', name: 'Cook', sprite: 'goodwife',
        script: 'cook', data: {} },
    ],
    signs: [],
    warps: [{ x: 7, y: 11, to: 'winterfell', tx: 7, ty: 15, dir: 'down' }],
  },

  // ======================================================= the Free Cities ==
  //
  // Across the Narrow Sea, reached by ship from King's Landing. Different
  // ground, different money, different people — and nobody out here cares which
  // Westerosi house you swore to, which is most of the point of going.

  braavos: makeTown({
    roof: 'G', ridge: 'g',
    // Canals rather than walls, which is the one thing everybody knows
    // about Braavos and makes it read as somewhere else at a glance.
    name: 'Braavos', music: 'town', ground: 'stone', wall: '~', floor: 'o',
    npcs: [
      { x: 7, y: 9, dir: 'down', name: 'Jaqen H\'ghar', sprite: 'braavosi',
        script: 'freeCityLocal', data: { line: "Jaqen H'ghar: A man was no one, and is someone again, "
          + 'and will be no one after. Valar morghulis.' } },
      { x: 15, y: 9, dir: 'down', name: 'Arya', sprite: 'girl',
        script: 'freeCityLocal', data: { line: 'Arya: I am no one. That is what they keep telling me. '
          + 'I am fairly sure I am still someone.' } },
      { x: 11, y: 16, dir: 'down', name: 'Iron Banker', sprite: 'merchant',
        script: 'shop', data: { line: 'Iron Banker: The Iron Bank will have its due. '
          + 'In the meantime, we also sell things.',
          stock: ['maesterKit', 'sigilBanner', 'warBanner', 'kingsguardBanner'] } },
      { x: 4, y: 9, dir: 'right', name: 'Water Dancer', sprite: 'braavosi',
        script: 'duel', data: { duel: 'syrio' } },
      { x: 18, y: 9, dir: 'left', name: 'Braavosi Bravo', sprite: 'sellsword',
        script: 'freeCityLocal', data: { line: 'Bravo: In Braavos we fight with the point. '
          + 'Hacking is for people who chop wood.' } },
    ],
    signs: [{ x: 13, y: 10, text: 'THE TITAN OF BRAAVOS STANDS BEHIND YOU. IT IS THE ONLY THING THAT DOES.' }],
    warps: [
      { x: 11, y: 19, to: 'narrowSea', tx: 11, ty: 5, dir: 'down' },
      { x: 6, y: 6, to: 'houseOfBlackAndWhite', tx: 7, ty: 10, dir: 'up' },
    ],
  }),

  houseOfBlackAndWhite: {
    name: 'House of Black and White', music: 'heal', ground: 'stone', indoor: true,
    tiles: [
      'IIIIIIIIIIIIII',
      'I============I',
      'I=BB=====BB==I',
      'I============I',
      'I===F====F===I',
      'I============I',
      'I============I',
      'I====KKKK====I',
      'I============I',
      'I============I',
      'I============I',
      'IIIIIID IIIIII'.replace(' ', '='),
    ],
    npcs: [
      { x: 7, y: 5, dir: 'down', name: 'The Kindly Man', sprite: 'oldman',
        script: 'healer', data: { line: 'The Kindly Man: All men must serve. Shall I see to yours?' } },
    ],
    warps: [{ x: 7, y: 11, to: 'braavos', tx: 6, ty: 7, dir: 'down' }],
  },

  pentos: makeTown({
    roof: 'Q', ridge: 'q',
    name: 'Pentos', music: 'town', ground: 'sand', wall: 'C', floor: 's',
    npcs: [
      { x: 7, y: 9, dir: 'down', name: 'Illyrio Mopatis', sprite: 'merchant',
        script: 'freeCityLocal', data: { line: 'Illyrio Mopatis: I am a merchant of cheese and spice. '
          + 'Also of kings, occasionally, when the market is right.' } },
      { x: 15, y: 9, dir: 'down', name: 'Ser Jorah', sprite: 'guard',
        script: 'freeCityLocal', data: { line: 'Ser Jorah Mormont: I was a lord in Bear Island once. '
          + 'Now I am a man who knows where the ships go.' } },
      { x: 11, y: 16, dir: 'down', name: 'Spice Merchant', sprite: 'merchant',
        script: 'shop', data: { line: 'Spice Merchant: From Qarth, Yi Ti and the Jade Sea. Mostly.',
          stock: ['maesterKit', 'poppyMilk', 'sigilBanner', 'warBanner'] } },
      { x: 4, y: 9, dir: 'right', name: 'Dothraki Rider', sprite: 'wildling',
        script: 'freeCityLocal', data: { line: 'Dothraki Rider: A khal who cannot ride is no khal. '
          + 'You walk everywhere. It is very strange.' } },
    ],
    signs: [{ x: 13, y: 10, text: 'PENTOS. NO WALLS WORTH THE NAME, AND NO NEED OF THEM YET.' }],
    warps: [{ x: 11, y: 19, to: 'narrowSea', tx: 11, ty: 5, dir: 'down' }],
  }),

  volantis: makeTown({
    roof: 'Q', ridge: 'q',
    name: 'Volantis', music: 'town', ground: 'sand', wall: 'C', floor: 's',
    npcs: [
      { x: 7, y: 9, dir: 'down', name: 'Red Priestess', sprite: 'redPriest',
        script: 'freeCityLocal', data: { line: 'Red Priestess: The night is dark and full of terrors. '
          + 'Volantis burns a fire against it every hour of every day.' } },
      { x: 15, y: 9, dir: 'down', name: 'Triarch', sprite: 'noble',
        script: 'freeCityLocal', data: { line: 'Triarch: Old Volantis was first. Everything since '
          + 'has been a copy, and a poor one.' } },
      { x: 11, y: 16, dir: 'down', name: 'Slaver', sprite: 'merchant',
        script: 'shop', data: { line: 'Slaver: I deal in cargo. You would not like my usual stock, '
          + 'so here is the other kind.',
          stock: ['maesterKit', 'poppyMilk', 'warBanner', 'kingsguardBanner'] } },
      { x: 4, y: 9, dir: 'right', name: 'Bridge Guard', sprite: 'unsullied',
        script: 'freeCityLocal', data: { line: 'Bridge Guard: The Long Bridge has stood a thousand '
          + 'years. Walk on the left.' } },
    ],
    signs: [{ x: 13, y: 10, text: 'THE LONG BRIDGE. BUILT BY VALYRIA. NOBODY LEFT KNOWS HOW.' }],
    warps: [{ x: 11, y: 19, to: 'narrowSea', tx: 11, ty: 5, dir: 'down' }],
  }),

  meereen: makeTown({
    roof: 'Q', ridge: 'q',
    name: 'Meereen', music: 'town', ground: 'sand', wall: 'C', floor: 's',
    npcs: [
      { x: 11, y: 6, dir: 'down', name: 'Daenerys Targaryen', sprite: 'targaryen',
        script: 'duel', data: { duel: 'daenerys' } },
      { x: 7, y: 9, dir: 'down', name: 'Missandei', sprite: 'targaryen',
        script: 'freeCityLocal', data: { line: 'Missandei: I speak nineteen languages. '
          + 'In all of them, this city is complicated.' } },
      { x: 15, y: 9, dir: 'down', name: 'Grey Worm', sprite: 'unsullied',
        script: 'duel', data: { duel: 'greyWorm' } },
      { x: 11, y: 16, dir: 'down', name: 'Ghiscari Trader', sprite: 'merchant',
        script: 'shop', data: { line: 'Ghiscari Trader: The Queen has views about what may be sold. '
          + 'These are the things that remain.',
          stock: ['maesterKit', 'poppyMilk', 'kingsguardBanner'] } },
      { x: 4, y: 9, dir: 'right', name: 'Daario Naharis', sprite: 'braavosi',
        script: 'duel', data: { duel: 'daario' } },
    ],
    signs: [{ x: 13, y: 10, text: 'THE GREAT PYRAMID OF MEEREEN. A DRAGON QUEEN SITS AT THE TOP OF IT.' }],
    warps: [{ x: 11, y: 19, to: 'narrowSea', tx: 11, ty: 5, dir: 'down' }],
  }),

  /** The crossing itself: a deck, and the sea going past. */
  narrowSea: {
    name: 'The Narrow Sea', music: 'route', ground: 'stone',
    tiles: [
      '~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~__________~~~~~~',
      '~~~~~~~_==========_~~~~~',
      '~~~~~~_============_~~~~',
      '~~~~~~_============_~~~~',
      '~~~~~~_====!=======_~~~~',
      '~~~~~~_============_~~~~',
      '~~~~~~_============_~~~~',
      '~~~~~~_============_~~~~',
      '~~~~~~~_==========_~~~~~',
      '~~~~~~~~__________~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~',
    ],
    npcs: [
      { x: 9, y: 5, dir: 'down', name: 'Ship\'s Captain', sprite: 'braavosi',
        script: 'ship', data: {} },
      { x: 14, y: 8, dir: 'left', name: 'Deckhand', sprite: 'smallfolk',
        script: 'freeCityLocal', data: { line: 'Deckhand: Four days to Braavos with this wind. '
          + 'Longer if you keep asking.' } },
    ],
    signs: [{ x: 11, y: 6, text: 'SPEAK TO THE CAPTAIN TO NAME A PORT.' }],
    // The gangplank puts you back on the last shore you sailed from; the
    // captain's own passage list is what takes you anywhere new.
    warps: [{ x: 11, y: 3, to: 'kingsLanding', tx: 11, ty: 21, dir: 'down' }],
  },

  kingsLanding: {
    name: "King's Landing",
    music: 'town',
    ground: 'stone',
    get tiles() { return cityGrid(); },
    /* No cutpurses out of the weeds here: a city has people standing in it
       instead, and the crowd is what the appearance budget goes on. What does
       come at you between the cobbles is the birds. */
    encounters: [
      { beast: 'ravenling', min: 28, max: 34, weight: 60 },
      { beast: 'corvarch', min: 30, max: 38, weight: 40 },
    ],
    warps: [
      { x: 16, y: 31, to: 'kingsroad', tx: 10, ty: 21, dir: 'up' },
      { x: 6, y: 7, to: 'greatSept', tx: 8, ty: 9, dir: 'up' },
      { x: 25, y: 9, to: 'redKeep', tx: 8, ty: 21, dir: 'up' },
      { x: 6, y: 16, to: 'maesterHallKL', tx: 5, ty: 7, dir: 'up' },
      { x: 22, y: 16, to: 'klArmoury', tx: 5, ty: 6, dir: 'up' },
      { x: 27, y: 26, to: 'dragonpit', tx: 8, ty: 11, dir: 'up' },
      { x: 11, y: 21, to: 'fleaBottom', tx: 2, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 14, y: 11, text: "KING'S LANDING\nHalf a million people and one chair.\nMind your purse." },
      { x: 17, y: 20, text: 'THE HOOK\nUp the hill: the Red Keep.\nDown the alleys: Flea Bottom, and whatever is left of you after it.' },
      { x: 23, y: 27, text: 'THE DRAGONPIT\nForty years shut. The roof came down on the last of them.\nSomething still nests in it.' },
    ],
    npcs: [
      { x: 13, y: 11, dir: 'down', sprite: 'guard', name: 'Gold Cloak Serjeant', script: 'klHint',
        data: { line: 'Keep to the main ways and you will keep your purse. Go down the Hook and you are on your own.' } },
      { x: 18, y: 11, dir: 'left', sprite: 'merchant', name: 'Pot-Shop Man', script: 'bellowsHand',
        data: { line: 'A bowl of brown, two coppers. Do not ask what is in it. Nobody asks.' } },
      { x: 12, y: 14, dir: 'down', sprite: 'goodwife', name: 'Fishwife Cass', script: 'bellowsHand',
        data: { line: 'Fresh off the Blackwater this morning. That is what I say to everyone.' } },
      { x: 27, y: 14, dir: 'left', sprite: 'smallfolk', name: 'Wine Seller', script: 'bellowsHand',
        data: { line: 'Dornish red, Arbor gold, and a barrel I will not name a price on.' } },
      { x: 24, y: 11, dir: 'up', sprite: 'septa', name: 'Septa Unella', script: 'bellowsHand',
        data: { line: 'The Sept of Baelor is open to anyone who walks in on their own feet.' } },
      { x: 9, y: 11, dir: 'right', sprite: 'child', name: 'Cutpurse Boy', script: 'bellowsHand',
        data: { line: 'Never seen you before. Nice cloak. Do not turn round.' } },
      { x: 6, y: 19, dir: 'down', sprite: 'sellsword', name: 'Bronn of the Blackwater', script: 'duel',
        data: { duel: 'bronn' } },
      { x: 21, y: 19, dir: 'left', sprite: 'kingsguard', name: 'Ser Meryn Trant', script: 'duel',
        data: { duel: 'meryn' } },
      { x: 26, y: 20, dir: 'down', sprite: 'brotherhood', name: 'Recruiter', script: 'blackBrother' },
      { x: 20, y: 30, dir: 'up', sprite: 'braavosi', name: 'Harbourmaster', script: 'bellowsHand',
        data: { line: 'Nothing sails to Dragonstone from this quay. Try the one nobody advertises.' } },
      { x: 2, y: 18, dir: 'right', sprite: 'oldman', name: 'Bald Beggar', script: 'bellowsHand',
        data: { line: 'I remember when there were dragons over that hill. Nobody believes me and I do not blame them.' } },
      { x: 29, y: 11, dir: 'left', sprite: 'noble', name: 'Lord of the Small Council', script: 'bellowsHand',
        data: { line: 'Power resides where men believe it resides. That is the whole of the trick.' } },
    ],
  },

  /* Behind the warren, and the only quay in Westeros that will take you across
     to Dragonstone. Nobody tells you it is here. */
  mudGate: {
    name: 'The Mud Gate',
    music: 'town',
    ground: 'sand',
    tiles: [
      '####################',
      '#ssssssssssssssssss#',
      '#ss~~~~~~~~~~~~~~ss#',
      '#ss~~~~~~~~~~~~~~ss#',
      '#sssssssssssssssss=#',
      '#ss=============ss=#',
      '#ss=sHHwHDHwHHs=ss=#',
      '#ss=sssssssssss=ss=#',
      '#ss=============ss=#',
      '#ssssssssssssssssss#',
      '#ss~~~~~~~~~~~~~~ss#',
      '#ss~~~~~~~~~~~~~~ss#',
      '#ssssssssssss=sssss#',
      '####################',
    ],
    warps: [
      { x: 18, y: 4, to: 'fleaBottom', tx: 20, ty: 13, dir: 'up' },
      { x: 9, y: 6, to: 'dragonstone', tx: 11, ty: 18, dir: 'up' },
    ],
    signs: [
      { x: 13, y: 12, text: 'THE MUD GATE\nA ferryman who does not give his name.\nHe will take you to the island, and he will not talk about it.' },
    ],
    npcs: [
      { x: 8, y: 7, dir: 'up', sprite: 'braavosi', name: 'The Ferryman', script: 'bellowsHand',
        data: { line: 'The island, then. Say nothing to anyone about who rowed you.' } },
      { x: 15, y: 9, dir: 'left', sprite: 'ironborn', name: 'Dock Thief', script: 'duel',
        data: { duel: 'ironbornReaver' } },
    ],
  },

  /* Flea Bottom: no plan, no straight line, and the way through is not the way
     it looks. Everything in the game before this was a corridor with scenery. */
  fleaBottom: {
    name: 'Flea Bottom',
    music: 'town',
    ground: 'earth',
    get tiles() {
      /* Eleven cells across and seven down: big enough to get lost in, and the
         way out is at the far corner from the way in. */
      const g = warren(0xF1EA, 11, 7, '=', 'I').map((r) => [...r]);
      g[1][1] = 'd';                 /* down from the city */
      g[13][21] = 'd';               /* and out to the docks, if you find it */
      return g.map((r) => r.join(''));
    },
    encounters: [
      { roamer: 'bandit', min: 28, max: 36, weight: 60 },
      { roamer: 'gravedigger', min: 28, max: 36, weight: 40 },
    ],
    warps: [
      { x: 1, y: 1, to: 'kingsLanding', tx: 11, ty: 20, dir: 'down' },
      { x: 21, y: 13, to: 'mudGate', tx: 18, ty: 5, dir: 'down' },
    ],
    signs: [
      { x: 11, y: 1, text: 'Somebody has scratched an arrow into the wall, and then scratched three more pointing other ways.' },
    ],
    npcs: [
      { x: 19, y: 1, dir: 'down', sprite: 'smallfolk', name: 'Bowl-of-Brown Man', script: 'bellowsHand',
        data: { line: 'Keep going down and east. Or do not. It is all the same to me.' } },
      { x: 3, y: 5, dir: 'down', sprite: 'wildling', name: 'Alley Knife', script: 'duel',
        data: { duel: 'bandit' } },
      { x: 13, y: 9, dir: 'up', sprite: 'child', name: 'Barefoot Girl', script: 'bellowsHand',
        data: { line: 'There is a gate at the far end that the gold cloaks have forgotten about.' } },
    ],
  },

  greatSept: {
    name: 'The Great Sept of Baelor',
    indoor: true,
    music: 'town',
    tiles: [
      'IIIIIIIIIIIIIIIII',
      'I===cccccccc====I',
      'I==ccccccccccc==I',
      'I==cccFccccFcc==I',
      'I==ccccccccccc==I',
      'I=B=ccccccccc=B=I',
      'I=B=ccc===ccc=B=I',
      'I===cc=====cc===I',
      'I======TTT======I',
      'I===============I',
      'IIIIIIII__IIIIIII',
    ],
    warps: [
      { x: 8, y: 10, to: 'kingsLanding', tx: 6, ty: 8, dir: 'down' },
      { x: 9, y: 10, to: 'kingsLanding', tx: 6, ty: 8, dir: 'down' },
    ],
    signs: [
      { x: 5, y: 8, text: 'THE SEVEN\nFather, Mother, Warrior, Maiden, Smith, Crone, Stranger.\nSix of them are looking at you.' },
    ],
    npcs: [
      { x: 8, y: 3, dir: 'down', sprite: 'septa', name: 'High Septon', script: 'bellowsHand',
        data: { line: 'The Father judges, the Warrior fights, and the Stranger comes for us all. Try to keep the first two in front of the third.' } },
      { x: 4, y: 6, dir: 'right', sprite: 'brotherhood', name: 'Sparrow', script: 'duel',
        data: { duel: 'beric' } },
    ],
  },

  /* The Dragonpit. The roof came down forty years ago and nobody has been in
     since, which is exactly why there is something in it worth having. */
  dragonpit: {
    name: 'The Dragonpit',
    indoor: true,
    music: 'wild',
    ground: 'cave',
    tiles: [
      '@@@@@@@@@@@@@@@@@',
      '@%%%%%%%%%%%%%%%@',
      '@%%@@%%%%%%%@@%%@',
      '@%%@@%%,,,%%@@%%@',
      '@%%%%%,,,,,%%%%%@',
      '@%%%%%,,,,,%%%%%@',
      '@%@@%%%,,,%%%@@%@',
      '@%@@%%%%%%%%%@@%@',
      '@%%%%%%%%%%%%%%%@',
      '@%%%%@@@%@@@%%%%@',
      '@%%%%%%%%%%%%%%%@',
      '@%%%%%%%%%%%%%%%@',
      '@@@@@@@@%@@@@@@@@',
    ],
    encounters: [
      { beast: 'emberwisp', min: 32, max: 40, weight: 40 },
      { beast: 'scaleflight', min: 34, max: 42, weight: 30 },
      { roamer: 'gravedigger', min: 32, max: 40, weight: 30 },
    ],
    warps: [
      { x: 8, y: 12, to: 'kingsLanding', tx: 27, ty: 27, dir: 'down' },
    ],
    signs: [
      { x: 5, y: 8, text: 'Bones the size of roof beams, and the sand is warm.' },
    ],
    npcs: [
      { x: 8, y: 4, dir: 'down', sprite: 'redPriest', name: 'Pit Watcher', script: 'bellowsHand',
        data: { line: 'They said the last of them died the size of a cat. They lied about a great deal.' } },
    ],
  },

  maesterHallKL: maesterHall({
    exitTo: 'kingsLanding', exitX: 6, exitY: 17,
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
      'Ixx=a===l=lI',
      'I=====KKK==I',
      'I==========I',
      'I=a=====a==I',
      'I==========I',
      'I=T=F==F=T=I',
      'IIIII__IIIII',
    ],
    warps: [
      { x: 5, y: 7, to: 'kingsLanding', tx: 22, ty: 17, dir: 'down' },
      { x: 6, y: 7, to: 'kingsLanding', tx: 22, ty: 17, dir: 'down' },
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
      { x: 8, y: 22, to: 'kingsLanding', tx: 25, ty: 10, dir: 'down' },
    ],
    npcs: [
      { x: 9, y: 4, dir: 'down', sprite: 'cersei', name: 'Queen Cersei', script: 'gymThrone',
        data: { trainer: 'gymThrone' } },
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
  holdfast: 'The North',
  braavos: 'Braavos', houseOfBlackAndWhite: 'Braavos',
  pentos: 'Pentos', volantis: 'Volantis', meereen: 'Meereen',
  narrowSea: 'The Narrow Sea',
  heroHouse: 'The North', winterfell: 'The North', winterfellForge: 'The North',
  greatKeep: 'The North', maesterHallWinterfell: 'The North', wolfswood: 'The North',
  kingsroadNorth: 'The North',
  castleBlack: 'The Wall', castleBlackArmoury: 'The Wall',
  maesterHallCastleBlack: 'The Wall', castleBlackHall: 'The Wall',
  beyondTheWall: 'Beyond the Wall',
  moatCailin: 'The Neck', maesterHallMoat: 'The Neck', moatCailinForge: 'The Neck',
  riverlands: 'The Riverlands', riverrun: 'The Riverlands',
  riverrunInn: 'The Riverlands', riverrunKeep: 'The Riverlands',
  maesterHallRiverrun: 'The Riverlands', riverrunForge: 'The Riverlands',
  bloodyGate: 'The Vale', theEyrie: 'The Vale', eyrieArmoury: 'The Vale',
  eyrieKeep: 'The Vale',
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
  dragonstoneArmoury: 'Dragonstone',
  maesterHallDragonstone: 'Dragonstone',
};

/** The region a map belongs to, or an empty string if it has none. */
export function regionOf(key) {
  return REGIONS[key] ?? '';
}
