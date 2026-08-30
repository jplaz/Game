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
/* Every tile you can stand on, which is every tile the legend calls floor,
   encounter or ledge. Kept here rather than derived from the art so that the
   map layer does not have to load the painters to know where the ground is. */
const STANDABLE = new Set([...'.,S;-dsoi*L_=cb<%tmD']);

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
      /* The cages at the back. Six at your heel is all anybody can feed on the
         road, and everything you took alive past the sixth used to be turned
         loose on the spot. They are boarded here instead, and you can come and
         change your mind about which six you are travelling with. */
      { x: 9, y: 4, dir: 'down', sprite: 'oldman', name: 'Kennelmaster', script: 'kennel',
        data: { line: 'Kennelmaster: Anything you cannot carry, I will board. '
          + 'They are fed, they are exercised, and they are here when you want them.' } },
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
                    shut = [], quarter = 0, outskirts = null, gate = 13, outsiders = [],
                    core = null,
                    encounters = [], warps = [], npcs = [], signs = [], items = [] }) {
  const W = wall;
  const g = floor;
  const R = roof;      // the body of a roof, in whatever this region roofs with
  const t = ridge;     // its capping course
  const H = house;     // and what the walls under it are built of
  const row = (...parts) => parts.join('');
  const fill = (n) => g.repeat(n);

  /* How far west the maester's hall sits, which is the whole of what made
     every town's west half the same picture. Chosen from the town's own name
     so it is stable across builds and different between neighbours. */
  const shift = [0, 1, 2][[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 3];
  const lead = 2 - shift;               // ground west of the hall
  const trail = 2 + shift;              // and east of it, before the road
  const hallRow = (r) => {
    if (r === 2) {
      return row(W, fill(2), 'u', fill(Math.max(0, lead - 1)), 'n',
        fill(8 - lead - Math.max(0, lead - 1)), '-', g, g, 'n', fill(8), W);
    }
    const west = [t.repeat(6), R.repeat(6),
      row(P, 'w', P, 'w', P, 'w'), row(P, 'e', P, 'D', P, 'w')][r - 3];
    const east = [f.repeat(6), F.repeat(6),
      row(A, 'w', A, 'w', A, A), row(A, 'k', A, 'D', A, A)][r - 3];
    return row(W, fill(lead), west, fill(trail), '-', fill(2), east, fill(3), W);
  };

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
  const Y = 'Y';       // and the common houses are thatched, everywhere
  const y = 'y';
  const P = 'p';       // and a maester's hall is limewashed, wherever it stands
  const V = banner;

  /* A hand-drawn core, for the seats that are a place and not a town plan.
     Storm's End is one drum tower on a cliff; Pyke is broken across sea stacks;
     the Eyrie climbs a mountain. None of those is this template with a
     different roof on it, so those maps draw their own west half and say where
     their own doors ended up. Everything else — the outskirts, the dressing,
     the people, the gates — works the same either way. */
  const built = core
    ? core({ W, g, A, M, R, t, H, Z: F, z: f, Y, y, P, V })
    : null;

  const tiles = [
    W.repeat(11) + '-' + W.repeat(12),
    row(W, fill(10), '-', fill(11), W),
    /* Where the hall stands. Three towns in this world are laid out the same
       because one plan drew all eleven of them; the hall sits a little west,
       square on, or hard against the road depending on the town, and its door
       goes with it — a warp names its door now, so it can. */
    hallRow(2), hallRow(3), hallRow(4), hallRow(5), hallRow(6),
    row(W, fill(5), '-', fill(4), '-', fill(5), '-', fill(5), W),
    row(W, fill(2), '-'.repeat(18), fill(2), W),
    // The seat itself: two towers standing a course above a curtain wall, with
    // the house's banners hung either side of the gate. Every town used to have
    // a shed with a door in it here, which is not what a seat of a great house
    // looks like from the road.
    /* Ten across rather than eight, crowned the whole way, with towers standing
       proud at the corners, the house's banners on the face, arrow slits down
       the flanks — and a moat with a single causeway to the gate. The seat of a
       great house was an eight-by-six slab of ashlar with two banners and a
       door in it, which is a warehouse somebody has been sentimental about. The
       gate stays exactly where it was: every door in this plan is load-bearing
       for a warp somewhere. */
    row(W, M.repeat(10), '-', fill(11), W),
    row(W, M, A.repeat(8), M, '-', g, '!', fill(9), W),
    row(W, A.repeat(10), '-', fill(11), W),
    row(W, A, A, V, A, A, A, A, V, A, A, '-', fill(11), W),
    row(W, A, 'w', A, A, A, A, A, A, 'w', A, '-', fill(11), W),
    row(W, A.repeat(6), 'D', A.repeat(3), '-', fill(11), W),
    row(W, ':'.repeat(6), '-', ':'.repeat(3), '-', fill(11), W),
    row(W, fill(2), '-'.repeat(18), fill(2), W),
    row(W, fill(4), 'n', fill(5), '-', fill(4), 'n', fill(6), W),
    /* Below the keep, the part of a town people actually live in.
       Every settlement in this game had a maester, a smith and a lord, and
       nowhere at all that anybody went in the evening. Two thatched common
       houses face each other across the road here: the inn, the brothel and
       the only news there is. The town grows southward to hold them, so every
       door already written down is exactly where it was. */
    row(W, fill(2), y.repeat(5), fill(3), '-', fill(2), y.repeat(5), fill(4), W),
    row(W, fill(2), Y.repeat(5), fill(3), '-', fill(2), Y.repeat(5), fill(4), W),
    row(W, fill(2), H, 'w', H, 'w', H, fill(3), '-', fill(2), H, 'w', H, 'w', H, fill(4), W),
    row(W, fill(2), H, 'w', 'D', 'w', H, fill(3), '-', fill(2), H, 'w', 'D', 'w', H, fill(4), W),
    row(W, fill(4), '-', fill(5), '-', fill(4), '-', fill(6), W),
    row(W, fill(2), '-'.repeat(18), fill(2), W),
    row(W, fill(10), '-', fill(11), W),
    row(W, fill(10), '-', fill(11), W),
    W.repeat(11) + '-' + W.repeat(12),
  ];

  /*
   * The eastern quarter, and why no two towns look alike any more.
   *
   * The plan put four buildings down the west side and left eleven columns of
   * open floor down the east, in every settlement in the world - so every town
   * was the same town with a different roof on it. That ground is now a
   * quarter, and there are five of them: a market, a sept, a graveyard, a
   * training yard and a green. Underneath all five is the same thing, a stone
   * cellar with a door at seventeen, seventeen, because a town wants somewhere
   * worth breaking into and every town's door has to be in the same place for
   * the map it opens onto to know where to put you back.
   *
   * A space leaves whatever was there alone.
   */
  const QUARTERS = [
    [' KK     KK',
     '          ',
     ' KK     KK',
     '  K     K '],
    ['  pp p pp ',
     '  pF w Fp ',
     '  pp p pp ',
     '          '],
    [' U U   U U',
     '   W   W  ',
     ' U U   U U',
     '          '],
    [' ffff fff ',
     ' f  l   f ',
     ' f    a f ',
     ' fff fff  '],
    ['   ~~ ~~  ',
     '  ~~~ ~~~ ',
     '   ~~ ~~  ',
     '  *   *   '],
  ];
  /* The same stone cellar under all five quarters, because the door has to be
     in one place for the room it opens onto to know where to put you back. */
  const CELLAR = ['  zzzzz  ',
                  '  AAAAA  ',
                  '  AADAA  '];

  const grid = (built ? built.tiles : tiles).map((r) => [...r]);
  if (!built) {
    const plan = QUARTERS[quarter % QUARTERS.length];
    const stamp = (art, atY) => art.forEach((line, j) => {
      [...line].forEach((c, i) => {
        if (c === ' ') return;
        const x = 13 + i, y = atY + j;
        if (grid[y] && grid[y][x] !== undefined) grid[y][x] = c;
      });
    });
    /* The cellar sits above the quarter and below the keep's own row, clear of
       both of the town's cross-streets - putting it on one of them cut the
       eastern half of every settlement off from the western half. Every quarter
       leaves the column under its door open so there is a way down to it. */
    stamp(CELLAR, 9);
    stamp(plan, 12);

  }
  /* Never on open floor somebody is standing on, or a door leads to: a rose bed
     dropped on a fisherman walls him into the ground he is standing on, and the
     audit is the only thing that ever notices. */
  const taken = new Set([...npcs, ...signs, ...warps, ...items]
    .map((o) => `${o.x},${o.y}`));
  for (const [x, y, char] of dressing) {
    if (!grid[y] || grid[y][x] !== g || taken.has(`${x},${y}`)) continue;
    grid[y][x] = char;
  }
  /* A door with nothing behind it is worse than a wall: the player walks up to
     it, presses A, and the game says nothing at all. Towns that have no room to
     spare behind a given building get a shuttered window there instead. */
  const SHUT = built ? (built.doors || {}) : {
    hall: [lead + 4, 6], forge: [17, 6], keep: [7, 14],
    inn: [5, 21], house: [16, 21], cellar: [17, 11] };
  for (const which of shut) {
    const at = SHUT[which];
    if (at) grid[at[1]][at[0]] = 'w';
  }
  /* A way down from the cellar door to the street below it, cut last of all -
     after the quarter and after this town's own dressing, either of which will
     otherwise put a pool or a rose bed in front of the door and make it a door
     nobody can open. */
  if (!built) for (let y = 12; y <= 15; y++) if (grid[y]) grid[y][17] = g;

  /* And anybody the new quarter has built on top of. The cellar and its roof
     take three rows of ground that eleven towns had people standing on, and a
     shopkeeper inside a wall is a shopkeeper nobody ever meets. */
  const solidHere = (x, y) => {
    const c = grid[y] && grid[y][x];
    return c === undefined || !'.,S;-dso*i_=cb<%tm'.includes(c);
  };
  const nearestOpen = (x, y) => {
    for (let r = 1; r < 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (!grid[ny] || grid[ny][nx] === undefined) continue;
          if (!solidHere(nx, ny)) return [nx, ny];
        }
      }
    }
    return [x, y];
  };
  const movedNpcs = npcs.map((p) => {
    if (!solidHere(p.x, p.y)) return p;
    const at = nearestOpen(p.x, p.y);
    return { ...p, x: at[0], y: at[1] };
  });

  /* And whoever lives out past the east gate. Written without coordinates and
     put down here, on ground this function has just finished drawing: hand-
     placed people in the outskirts spent three rounds of this landing on market
     stalls, in canals and, twice, in the gateway itself with the whole district
     walled off behind them. Nothing that is placed by construction can do
     that. */
  if (outskirts && outsiders.length) {
    const spots = [], junctions = [];
    for (let y = 2; y < 25; y++) {
      for (let x = 25; x < 31; x++) {
        if (y === gate) continue;                     /* never in the gateway */
        if (solidHere(x, y)) continue;
        /* Somewhere with room to be spoken to from, and room to get past. */
        let open = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!solidHere(x + dx, y + dy)) open++;
        }
        if (open >= 2) spots.push([x, y]);
        /* A junction, by preference. A tile with exactly two ways off it is a
           corridor, and a person standing in a corridor is a wall across it —
           which in a maze walls off everything beyond them. Highgarden's
           gardener corked eighteen tiles of his own hedge maze that way. */
        if (open >= 3) junctions.push([x, y]);
      }
    }
    const where = junctions.length >= outsiders.length ? junctions : spots;
    outsiders.forEach((who, i) => {
      if (!where.length) return;
      const at = where[Math.floor(((i + 1) * where.length) / (outsiders.length + 1))];
      movedNpcs.push({ ...who, x: at[0], y: at[1] });
    });
  }

  /* ---------------------------------------------------------- the outskirts --
   * Every town in this game was the same twenty-four by twenty-seven box with a
   * different roof colour on it. Outside the east wall there is now half a town
   * again, and it is a different half in every one of them: a rose maze at
   * Highgarden, a shadow city at Sunspear, canals at Braavos, sea stacks at
   * Pyke, a switchback sky road under the Eyrie. It is twelve columns wide,
   * hand-drawn per town, and it holds no doors - what is out here is ground,
   * water, weather and people, so no town needs a dozen new rooms behind it.
   */
  if (outskirts) {
    grid.forEach((r, y) => {
      for (let x = 24; x < 32; x++) r[x] = y === 0 || y === 26 ? wall : ground === 'sand' ? 's' : g;
    });
    outskirts.forEach((line, y) => {
      [...line].forEach((c, i) => {
        if (c === ' ' || !grid[y]) return;
        grid[y][24 + i] = c;
      });
    });
    /* The far edge is the edge of the world and has to say so. Ground that runs
       off the side of a map is a place the player walks at and cannot leave. */
    for (let y = 0; y < grid.length; y++) {
      if (grid[y][31] !== '~') grid[y][31] = wall;
    }
    /* A gate through the old east wall, and a road to it. Clearing only the
       two tiles either side left three towns with the gate opening onto their
       own quarter's fish pond: the road has to run back far enough to meet
       ground the town itself can walk on. */
    for (let x = 18; x <= 24; x++) grid[gate][x] = g;
  }

  const laid = grid.map((r) => r.join(''));

  /* Where each door in this plan ended up. Every town's warps used to name the
     coordinates outright — six doors and two gates, at identical numbers in all
     eleven towns — which is precisely what made the west half of every
     settlement unchangeable: move a building and you break eight warps in
     eleven places. A warp can name the door instead, and then the plan is free
     to put that door wherever it likes. */
  const DOORS = built ? built.doors : {
    maester: [lead + 4, 6], forge: [17, 6], keep: [7, 14],
    cellar: [17, 11], inn: [5, 21], house: [16, 21],
    northGate: [11, 0], southGate: [11, 26],
  };
  const placedWarps = warps.map((w) => {
    if (w.door === undefined) return w;
    const at = DOORS[w.door];
    if (!at) throw new Error(`${name}: no door called "${w.door}" in this plan`);
    const { door, ...rest } = w;
    return { ...rest, x: at[0], y: at[1] };
  });

  return { name, music, ground, tiles: laid, encounters, warps: placedWarps,
           npcs: movedNpcs, signs, items };
}

/* The twelve outskirts, one per town, twelve columns by twenty-seven rows.
   A space means "leave whatever the ground is". */
const OUTSKIRTS = {
  /* Under the Eyrie: the sky road, which is a switchback cut into the side of
     a mountain with nothing at all on the outside of it. */
  eyrie: [
    'CCCCCCCC',
    'CC-CCC^^',
    'C--CCC^^',
    'C-CCCC^^',
    'C--CCC^^',
    'CC-CCC^^',
    'CC--CC^^',
    'CCC--C^^',
    'CCCC--^^',
    'CCCCC-^^',
    'CCCC--^^',
    'CCC--C^^',
    '----CCCC',
    '----CCCC',
    'CCC--CCC',
    'CCCC--CC',
    'CCCCC--C',
    'CCCCCC-C',
    'CCCCC--C',
    'CCCC--CC',
    'CCC--CCC',
    'CC--CCCC',
    'CC-CCCCC',
    'CC--CCCC',
    'CCC--CCC',
    'CCCC-CCC',
    'CCCCCCCC',
  ],
  /* Highgarden: a briar maze with a fountain at the middle of it, which is the
     only thing in the Reach anybody will tell you about twice. */
  roseMaze: [
    '########',
    '#*....*#',
    '#.###.##',
    '#.#.#.##',
    '#.#.#.##',
    '#.#...##',
    '#.###.##',
    '#...#.##',
    '#.#.####',
    '#.#**.##',
    '#.*~~*##',
    '#.*~~*##',
    '###**.##',
    '.......#',
    '#####.##',
    '#...#.##',
    '#.#.#.##',
    '#.#...##',
    '#.######',
    '#.#...##',
    '#.#.#.##',
    '#.#.#.##',
    '#.###.##',
    '#.....##',
    '#####.##',
    '#*....*#',
    '########',
  ],
  /* Sunspear: the shadow city, which is not a city and was not built. Ten
     thousand people living in mud brick against the outside of the walls. */
  shadowCity: [
    'MMMMMMMM',
    'ssssssss',
    'ssYYsYYs',
    'ssHHsHHs',
    'ssssssss',
    'ssYYsYYs',
    'ssHHsHHs',
    'ssssssss',
    'ssYYsYYs',
    'ssHHsHHs',
    'ssssssss',
    'ssYYsYYs',
    'ssHHsHHs',
    'ssssssss',
    'ssYYsYYs',
    'ssHHsHHs',
    'ssssssss',
    'ssYYsYYs',
    'ssHHsHHs',
    'ssssssss',
    'ssYYsYYs',
    'ssHHsHHs',
    'ssssssss',
    'ssYYsYYs',
    'ssHHsHHs',
    'ssssssss',
    'MMMMMMMM',
  ],
  /* Storm's End: the cliff, the sea, and a hull nobody got off. */
  seaCliff: [
    'CCCCCCCC',
    '....C~~~',
    '....C~~~',
    '....C~~~',
    '.U..C~~~',
    '....C~~~',
    '....C~~~',
    '....C~~~',
    '....C~~~',
    '....C~~~',
    '..U.C~~~',
    '....C~~~',
    '....C~~~',
    '.....~~~',
    '....C~~~',
    '....C~~~',
    '.U..C~~~',
    '....C~~~',
    '....C~~~',
    '....C~~~',
    '....C~~~',
    '..*.C~~~',
    '....C~~~',
    '....C~~~',
    '....C~~~',
    '....C~~~',
    'CCCCCCCC',
  ],
  /* Dragonstone: black sand and steam, and nothing growing on any of it. */
  smokingStrand: [
    'CCCCCCCC',
    'ddddC~~~',
    'dUddC~~~',
    'ddddC~~~',
    'ddddC~~~',
    'ddddC~~~',
    'dddUC~~~',
    'ddddC~~~',
    'ddddC~~~',
    'ddddC~~~',
    'ddddC~~~',
    'ddUdC~~~',
    'ddddC~~~',
    'ddddd~~~',
    'ddddC~~~',
    'ddddC~~~',
    'dddUC~~~',
    'ddddC~~~',
    'ddddC~~~',
    'ddddC~~~',
    'ddddC~~~',
    'dUddC~~~',
    'ddddC~~~',
    'ddddC~~~',
    'ddUdC~~~',
    'ddddC~~~',
    'CCCCCCCC',
  ],
  /* Braavos: canals, and bridges over them, and nowhere flat to build. */
  canals: [
    'MMMMMMMM',
    'ooo~~ooo',
    'ooo~~ooo',
    'ooottooo',
    'ooo~~ooo',
    'ooo~~ooo',
    '~t~~~~t~',
    '~t~~~~t~',
    'ooo~~ooo',
    'ooo~~ooo',
    'ooo~~ooo',
    'ooottooo',
    'ooo~~ooo',
    'ooo~~ooo',
    'ooo~~ooo',
    '~t~~~~t~',
    '~t~~~~t~',
    'ooo~~ooo',
    'ooo~~ooo',
    'ooo~~ooo',
    'ooottooo',
    'ooo~~ooo',
    'ooo~~ooo',
    '~t~~~~t~',
    '~t~~~~t~',
    'ooo~~ooo',
    'MMMMMMMM',
  ],
  /* Pentos: awnings, and every one of them selling something you have not
     heard of. */
  spiceMarket: [
    'MMMMMMMM',
    'oooooooo',
    'oKoKoKoo',
    'oooooooo',
    'oKoKoKoo',
    'oooooooo',
    'oKoKoKoo',
    'oooooooo',
    'oKoKoKoo',
    'oooooooo',
    'oKoKoKoo',
    'oooooooo',
    'oKoKoKoo',
    'oooooooo',
    'oKoKoKoo',
    'oooooooo',
    'oKoKoKoo',
    'oooooooo',
    'oKoKoKoo',
    'oooooooo',
    'oKoKoKoo',
    'oooooooo',
    'oKoKoKoo',
    'oooooooo',
    'oKoKoKoo',
    'oooooooo',
    'MMMMMMMM',
  ],
  /* Volantis: the Black Wall, which is older than anything else standing and
     which nobody without Valyrian blood may go behind. */
  blackWall: [
    'MMMMMMMM',
    'oooooooo',
    'AoAAAAAA',
    'AoAAAAAA',
    'oooooooo',
    'oKoooooo',
    'oooooooo',
    'AAAoAAAA',
    'AAAoAAAA',
    'oooooooo',
    'ooooooKo',
    'oooooooo',
    'AAAAAoAA',
    'oAAAAoAA',
    'oooooooo',
    'oKoooooo',
    'oooooooo',
    'AoAAAAAA',
    'AoAAAAAA',
    'oooooooo',
    'ooooooKo',
    'oooooooo',
    'AAAoAAAA',
    'AAAoAAAA',
    'oooooooo',
    'oooooooo',
    'MMMMMMMM',
  ],
  /* Meereen: stepped brick, all the way up, and a fighting pit under every
     one of them. */
  pyramids: [
    'MMMMMMMM',
    'ssssssss',
    'ssAAAAss',
    'ssAMMAss',
    'ssAAAAss',
    'ssssssss',
    'ssssssss',
    'ssssssss',
    'ssssssss',
    'ssAAAAss',
    'ssAMMAss',
    'ssAAAAss',
    'ssssssss',
    'ssssssss',
    'ssssssss',
    'ssssssss',
    'ssAAAAss',
    'ssAMMAss',
    'ssAAAAss',
    'ssssssss',
    'ssssssss',
    'ssssssss',
    'ssAAAAss',
    'ssAMMAss',
    'ssAAAAss',
    'ssssssss',
    'MMMMMMMM',
  ],
  /* Pyke: sea stacks with rope bridges between them, and a long way down. */
  seaStacks: [
    '~~~~~~~~',
    '~~~~~~~~',
    '~~~~~~~~',
    '~~~~oooo',
    'ooo~oooo',
    'ooomoooo',
    'ooo~oooo',
    'ooo~~m~~',
    '~m~~~m~~',
    '~m~~oooo',
    '~m~~oooo',
    'ooo~oooo',
    'ooo~oooo',
    'ooo~~~~~',
    'ooo~~~~~',
    'ooo~~~~~',
    '~m~~~~~~',
    '~m~~~~~~',
    '~m~~oooo',
    'ooo~oooo',
    'ooomoooo',
    'ooo~oooo',
    'ooo~oooo',
    'ooo~~~~~',
    '~~~~~~~~',
    '~~~~~~~~',
    '~~~~~~~~',
  ],
  /* The Dreadfort: bare ground, a great many posts, and crows on all of them. */
  flayedYard: [
    'MMMMMMMM',
    'dddddddd',
    'dfdfdfdd',
    'dddddddd',
    'ddUddddd',
    'dddddddd',
    'dfdfdfdd',
    'dddddddd',
    'dddddUdd',
    'dddddddd',
    'dfdfdfdd',
    'dddddddd',
    'dUdddddd',
    'dddddddd',
    'dfdfdfdd',
    'dddddddd',
    'ddddddUd',
    'dddddddd',
    'dfdfdfdd',
    'dddddddd',
    'dddUdddd',
    'dddddddd',
    'dfdfdfdd',
    'dddddddd',
    'dddddUdd',
    'dddddddd',
    'MMMMMMMM',
  ],
  /* Eastwatch: the shore, the ice, and a hull that came in on a tide and never
     went out again. */
  iceShore: [
    'MMMMMMMM',
    'SSSii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'SUSii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'SSSSi~~~',
    'SSSii~~~',
    'SSUii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'SUSii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'SSSii~~~',
    'MMMMMMMM',
  ],
};

/**
 * What is under the eastern quarter of every town.
 *
 * Once you are wearing the best of everything in the world there is nothing
 * left to open a chest for, and the game stops paying you for exploring at
 * exactly the point you have most of it left. A cellar is the answer: two rare
 * things in the dark, somebody who would rather you did not have them, and a
 * different pair in every town.
 */
function makeCellar({ town, name, keeper, keeperDuel, line, loot }) {
  return {
    name, indoor: true, music: 'wild', ground: 'cave',
    tiles: [
      '@@@@@@@@@@@@@',
      '@%%%%%%%%%%%@',
      '@%@@%%%%%@@%@',
      '@%@@%%%%%@@%@',
      '@%%%%%F%%%%%@',
      '@%@@%%%%%@@%@',
      '@%@@%%%%%@@%@',
      '@%%%%%%%%%%%@',
      '@@@@@@%%@@@@@',
      '@@@@@@%%@@@@@',
    ],
    warps: [
      { x: 6, y: 9, to: town, dir: 'down', back: true },
      { x: 7, y: 9, to: town, dir: 'down', back: true },
    ],
    npcs: [
      { x: 6, y: 1, dir: 'down', sprite: 'sellsword', name: keeper,
        script: 'duel', data: { duel: keeperDuel } },
      { x: 3, y: 7, dir: 'right', sprite: 'oldman', name: 'Cellarman',
        script: 'hideoutLocal', data: { line } },
    ],
    signs: [
      { x: 6, y: 8, text: `${name.toUpperCase()}\nSomebody has been counting what is down here,\nand recently.` },
    ],
    items: loot,
  };
}

/**
 * A stronghold: somebody else's walls, with somebody else's people behind them.
 *
 * Nine towns had a road running the whole length of the map and a gate at only
 * one end of it, so half the settlements in the world had a main street that
 * walked you up to the edge of the world and stopped. Rather than wall the
 * road off, the far gate now opens onto one of these - a curtain wall with a
 * garrison in the yard and a keep at the back that you have to fight your way
 * into and can strip once you have.
 *
 * The compound is twenty-four wide so it lines up with the town gate at
 * eleven, and the way out is the same two tiles you came in by.
 */
function makeHold({ name, town, townGate, hall, ground = 'grass', wall = '#',
                    floor = '.', banner = 'V', grass = ',', encounters = [],
                    npcs = [], signs = [], items = [] }) {
  const W = wall;    // whatever this part of the world is walled with
  const f = floor;   // and whatever grows outside the gate
  const A = 'A';     // dressed stone, because every hold in the world is
  const M = 'M';     // crenellated along the top course
  const d = 'd';     // a yard is beaten dirt wherever it stands
  const V = banner;
  const out = f.repeat(3);
  const wide = (inner) => W + out + 'A' + inner + 'A' + out + W;

  return {
    name, music: 'wild', ground, wall, encounters,
    tiles: [
      W.repeat(24),
      W + out + M.repeat(16) + out + W,
      wide(d.repeat(14)),
      wide('dd' + M.repeat(10) + 'dd'),
      wide('dd' + A.repeat(10) + 'dd'),
      wide('dd' + 'AA' + V + 'AAAA' + V + 'AA' + 'dd'),
      wide('dd' + A.repeat(10) + 'dd'),
      wide('dd' + 'AAAA' + 'DD' + 'AAAA' + 'dd'),
      wide(d.repeat(14)),
      wide(d.repeat(14)),
      wide('dF' + d.repeat(10) + 'Fd'),
      wide(d.repeat(14)),
      wide('ddTT' + d.repeat(6) + 'TTdd'),
      wide(d.repeat(14)),
      wide('dl' + d.repeat(10) + 'ld'),
      wide(d.repeat(14)),
      wide(d.repeat(14)),
      W + out + 'A'.repeat(7) + 'dd' + 'A'.repeat(7) + out + W,
      W + f.repeat(4) + grass.repeat(6) + 'dd' + grass.repeat(6) + f.repeat(4) + W,
      W + f.repeat(4) + grass.repeat(6) + 'dd' + grass.repeat(6) + f.repeat(4) + W,
      W + f.repeat(10) + 'dd' + f.repeat(10) + W,
      W.repeat(11) + 'dd' + W.repeat(11),
    ],
    warps: [
      { x: 11, y: 7, to: hall, tx: 7, ty: 11, dir: 'up' },
      { x: 12, y: 7, to: hall, tx: 8, ty: 11, dir: 'up' },
      { x: 11, y: 21, to: town, tx: townGate[0], ty: townGate[1], dir: townGate[2] },
      { x: 12, y: 21, to: town, tx: townGate[0], ty: townGate[1], dir: townGate[2] },
    ],
    npcs, signs, items,
  };
}

/**
 * What is behind the keep door: a hall with a high seat in it, two bedchambers,
 * two larders and a kitchen, all of them worth going through. Six rooms off one
 * corridor, so the fight comes to you a room at a time rather than all at once.
 */
/* `seat` is what somebody will take for the place once you have cleared it out,
   in hundreds of gold. Every stronghold hall is for sale to somebody who has
   already taken it by force, which is how most halls in this world changed
   hands anyway. */
function makeHoldHall({ name, hold, seat = 45, npcs = [], signs = [], items = [] }) {
  return {
    name, indoor: true, music: 'town', seat,
    tiles: [
      'IIIIIIIIIIIIIIIII',
      'I=bI=========Ib=I',
      'I==I====X====I==I',
      'I==I==TTTTT==I==I',
      'I=bI=========Ib=I',
      'II=IIIII=IIIII=II',
      'I===============I',
      'I===============I',
      'II=IIIII=IIIII=II',
      'I==I=========I==I',
      'I==I==h===h==I==I',
      'I==I=========I==I',
      'IIIIIII__IIIIIIII',
    ],
    warps: [
      { x: 7, y: 12, to: hold, tx: 11, ty: 8, dir: 'down' },
      { x: 8, y: 12, to: hold, tx: 12, ty: 8, dir: 'down' },
    ],
    npcs, signs, items,
  };
}

/** Standard door and exit coordinates for a makeTown map. */
export const TOWN = {
  hallDoor: [6, 6], hallStand: [6, 7],
  shopDoor: [17, 6], shopStand: [17, 7],
  keepDoor: [7, 14], keepStand: [7, 15],
  cellarDoor: [17, 11], cellarStand: [17, 12],
  innDoor: [5, 21], innStand: [5, 22],
  houseDoor: [16, 21], houseStand: [16, 22],
  north: [11, 0], northStand: [11, 1],
  south: [11, 26], southStand: [11, 25],
};

/**
 * A stretch of open country: walls down both sides, a road through the middle,
 * and stamped features. Hand-placing every tile of a dozen routes is where the
 * typos live, so the layout is described as regions instead.
 *
 * features: [{ type, x, y, w, h }] where type is one of
 *   grass | trees | water | cliff | ledge | flowers | sand | rubble
 */
/**
 * A road between two places.
 *
 * Every route in this game used to be a rectangle of open field with a straight
 * dirt line painted down the middle of it: you could see the far gate from the
 * near one and walk to it without turning. This carves instead. A trunk path
 * wanders down the map, jogging left and right, with dead-end spurs off it that
 * are worth walking because there is something at the end, clearings of long
 * grass where things are hiding, and - if the caller asks for one - a river
 * across the whole width with a plank bridge where the road meets it.
 *
 * It is carved from a fixed seed, so it is the same road every time you play
 * and every time the cartridge is built, and it is carved outwards from a
 * single connected line, so there is no such thing as a pocket you cannot reach.
 *
 * `features` still work: they are painted on afterwards over open ground only,
 * so a caller asking for a patch of ice gets ice where there is room for it and
 * never a wall across the road. Everything the caller places by coordinate -
 * people, signs, what is in the ground - is moved to the nearest tile that
 * makes sense, because a coordinate written for a rectangle is meaningless once
 * the rectangle has a forest in it.
 */
function makeRoute({ name, music = 'route', ground = 'grass', wall = '#', floor = '.',
                     grass = ',', road = 11, width = 24, height = 30, seed = 1,
                     river = 0, spurs = 4, indoor = false,
                     features = [], encounters = [], warps = [], npcs = [],
                     signs = [], items = [] }) {
  const CHAR = {
    grass, trees: wall, water: '~', cliff: 'C', ledge: 'L',
    flowers: '*', sand: 's', rubble: 'U', ice: 'i', snow: 'S', sign: '!',
    bridge: 't', sky: '^', floor,
  };

  let n = (seed * 2654435761) >>> 0;
  const roll = (k) => {
    n = (Math.imul(n ^ (n >>> 15), 2246822519) + 374761393) >>> 0;
    return (n >>> 9) % k;
  };

  const g = [];
  for (let y = 0; y < height; y++) g.push(new Array(width).fill(wall));

  // ---- the trunk ---------------------------------------------------------
  // A single connected centre line from the top gate to the bottom one. It is
  // widened afterwards rather than carved wide, which is what guarantees that
  // everything joins up.
  const line = [];
  const spine = [];                       // where the road tile itself goes
  let cx = road, y = 0, side = 1;
  for (; y < 3; y++) { line.push([road, y]); spine.push([road, y]); }
  while (y < height - 4) {
    const run = 2 + roll(4);
    for (let i = 0; i < run && y < height - 4; i++, y++) {
      line.push([cx, y]); spine.push([cx, y]);
    }
    if (y >= height - 4) break;
    // Jog. Alternating sides, so the road swings across the map instead of
    // wobbling about in one lane, and far enough each time to be a turn rather
    // than a stagger.
    side = -side;
    let want = side < 0 ? 3 + roll(Math.max(1, road - 4))
                        : road + 2 + roll(Math.max(1, width - road - 5));
    if (Math.abs(want - cx) < 4) want = cx + (side < 0 ? -4 : 4);
    want = Math.max(3, Math.min(width - 4, want));
    const step = want > cx ? 1 : -1;
    for (let x = cx; x !== want; x += step) { line.push([x, y]); spine.push([x, y]); }
    cx = want;
    line.push([cx, y]); spine.push([cx, y]);
    y++;
  }
  // Home to the far gate.
  {
    const step = road > cx ? 1 : -1;
    for (let x = cx; x !== road; x += step) { line.push([x, y]); spine.push([x, y]); }
    for (; y < height; y++) { line.push([road, y]); spine.push([road, y]); }
  }

  // ---- spurs -------------------------------------------------------------
  // Dead ends off the trunk. Each one finishes in a pocket, and the pockets are
  // where anything the caller buried in this route ends up.
  const pockets = [];
  for (let s = 0; s < spurs; s++) {
    const from = line[6 + roll(Math.max(1, line.length - 12))];
    const [sx, sy] = from;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const [dx, dy] = dirs[roll(4)];
    const len = 3 + roll(4);
    let px = sx, py = sy, ok = true;
    const run = [];
    for (let i = 0; i < len; i++) {
      px += dx; py += dy;
      if (px < 3 || px > width - 4 || py < 3 || py > height - 4) { ok = false; break; }
      run.push([px, py]);
    }
    if (!ok || run.length < 3) continue;
    for (const cell of run) line.push(cell);
    pockets.push([px, py]);
  }

  // ---- clearings ---------------------------------------------------------
  // Rooms hanging off the trunk. A route made only of corridors is a tunnel;
  // these are where the long grass goes and where anything comes at you from.
  const glades = [];
  for (let c = 0; c < 3; c++) {
    const [gx, gy] = line[8 + roll(Math.max(1, line.length - 16))];
    const w = 4 + roll(3), h = 3 + roll(3);
    const x0 = Math.max(2, Math.min(width - 2 - w, gx - (w >> 1)));
    const y0 = Math.max(2, Math.min(height - 2 - h, gy - (h >> 1)));
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) line.push([x0 + i, y0 + j]);
    glades.push([x0 + (w >> 1), y0 + (h >> 1)]);
  }

  // ---- widen -------------------------------------------------------------
  const open = (x, yy, ch) => {
    if (x < 1 || x > width - 2 || yy < 1 || yy > height - 2) return;
    g[yy][x] = ch;
  };
  for (const [x, yy] of line) {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) open(x + i, yy + j, floor);
  }
  // The two gates, which sit on the border rows the widener will not touch.
  g[0][road] = 'd';
  g[height - 1][road] = 'd';
  for (const [x, yy] of spine) if (yy > 0 && yy < height - 1) g[yy][x] = 'd';

  // ---- long grass --------------------------------------------------------
  // Along the shoulders, thickening at the dead ends: something worth beating
  // through rather than a lawn with a path mown across it.
  for (let yy = 2; yy < height - 2; yy++) {
    for (let x = 2; x < width - 2; x++) {
      if (g[yy][x] !== floor) continue;
      if (roll(100) < 34) g[yy][x] = grass;
    }
  }
  for (const [px, py] of pockets) {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      if (g[py + j] && g[py + j][px + i] === floor) g[py + j][px + i] = grass;
    }
  }

  // ---- a river, and the plank over it ------------------------------------
  if (river > 2 && river < height - 3) {
    const crossings = [];
    for (let x = 1; x < width - 1; x++) {
      const wasOpen = g[river][x] !== wall;
      g[river][x] = wasOpen ? 't' : '~';
      if (wasOpen) crossings.push(x);
    }
    // The banks either side of the plank, so the bridge has something to land
    // on rather than ending in a tree.
    for (const x of crossings) {
      if (g[river - 1][x] === wall) g[river - 1][x] = floor;
      if (g[river + 1][x] === wall) g[river + 1][x] = floor;
    }
  }

  // ---- features, painted over open ground only ---------------------------
  /* Softened at the edges rather than stamped square. A caller asks for a
     patch of reeds or a pond as a rectangle because a rectangle is what you
     can write down, and the map came out with three identical oblongs of long
     grass and a pond with four right angles in it - which reads as furniture
     somebody put there rather than as ground. The middle of a patch is kept;
     the rim is eaten into, hardest at the corners, so nothing outdoors has a
     straight edge on it any more. */
  for (const f of features) {
    const char = CHAR[f.type] ?? floor;
    const w = f.w ?? 1, h = f.h ?? 1;
    for (let yy = f.y; yy < f.y + h; yy++) {
      for (let x = f.x; x < f.x + w; x++) {
        if (yy <= 0 || yy >= height - 1 || x <= 0 || x >= width - 1) continue;
        const at = g[yy][x];
        // Never over the road, the water or a wall: a feature decorates the
        // ground somebody can already stand on.
        if (at !== floor && at !== grass) continue;
        // How far in from the rim this tile is, in both directions at once.
        const inX = Math.min(x - f.x, f.x + w - 1 - x);
        const inY = Math.min(yy - f.y, f.y + h - 1 - yy);
        const rim = Math.min(inX, inY);
        if (w > 2 && h > 2) {
          if (rim === 0 && roll(3) === 0) continue;          /* nibble the edge */
          if (inX === 0 && inY === 0 && roll(3) !== 0) continue;  /* and the corners */
        }
        g[yy][x] = char;
      }
    }
  }

  // ---- everything must join up -------------------------------------------
  // A feature can be asked for across ground the road needs - a caller writes
  // a lake by eye and does not know where the road went. Flood from the near
  // gate; anything walkable the flood does not reach is grown over, so there is
  // no such thing as a clearing you can see and cannot get to, and the map
  // refuses to build at all if the two gates have come apart.
  const WALKABLE = new Set([floor, grass, ...STANDABLE]);
  {
    const seen = new Array(width * height).fill(false);
    const queue = [[road, 0]];
    seen[road] = true;
    for (let head = 0; head < queue.length; head++) {
      const [qx, qy] = queue[head];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (seen[ny * width + nx] || !WALKABLE.has(g[ny][nx])) continue;
        seen[ny * width + nx] = true;
        queue.push([nx, ny]);
      }
    }
    if (!seen[(height - 1) * width + road]) {
      throw new Error(`${name}: the road does not reach the far gate`);
    }
    for (let yy = 1; yy < height - 1; yy++) {
      for (let x = 1; x < width - 1; x++) {
        if (WALKABLE.has(g[yy][x]) && !seen[yy * width + x]) g[yy][x] = wall;
      }
    }
  }

  // ---- putting the caller's coordinates somewhere real -------------------
  const inside = (x, yy) => x >= 1 && x < width - 1 && yy >= 1 && yy < height - 1;
  /** The nearest tile to (x, y) that `want` accepts, breadth-first. */
  const nearest = (x, yy, want) => {
    const seen = new Set([`${x},${yy}`]);
    const queue = [[Math.max(1, Math.min(width - 2, x)), Math.max(1, Math.min(height - 2, yy))]];
    for (let head = 0; head < queue.length; head++) {
      const [qx, qy] = queue[head];
      if (inside(qx, qy) && want(qx, qy)) return [qx, qy];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dx, ny = qy + dy;
        if (!inside(nx, ny) || seen.has(`${nx},${ny}`)) continue;
        seen.add(`${nx},${ny}`);
        queue.push([nx, ny]);
      }
    }
    return null;
  };
  const walkable = (x, yy) => WALKABLE.has(g[yy][x]);
  const shoulder = (x, yy) => walkable(x, yy) && g[yy][x] !== 'd' && g[yy][x] !== 't';

  // People stand at the side of the road, never in the middle of it: a person
  // on the centre line of a three-wide corridor is a toll gate. A warden is a
  // toll gate on purpose — that is the entire job — so they keep the tile they
  // were given and everybody else gets moved to the shoulder.
  const placedNpcs = npcs.map((p) => {
    if (p.warden) return p;
    const at = nearest(p.x, p.y, shoulder) ?? nearest(p.x, p.y, walkable);
    return at ? { ...p, x: at[0], y: at[1] } : p;
  });

  // A sign is read by facing it, so it wants to be a solid tile with open
  // ground beside it.
  const placedSigns = signs.map((s) => {
    const at = nearest(s.x, s.y, (x, yy) => g[yy][x] === wall
      && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
        inside(x + dx, yy + dy) && walkable(x + dx, yy + dy)));
    if (!at) return s;
    g[at[1]][at[0]] = '!';
    return { ...s, x: at[0], y: at[1] };
  });

  // What is buried here goes in a dead end, in the order the caller listed it,
  // because the reason to walk down a spur is that there is something at the
  // bottom of it.
  const placedItems = items.map((it, i) => {
    const aim = pockets[i % Math.max(1, pockets.length)] ?? [it.x, it.y];
    const at = nearest(aim[0], aim[1], (x, yy) => walkable(x, yy) && g[yy][x] !== 'd'
      && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
        inside(x + dx, yy + dy) && walkable(x + dx, yy + dy) && g[yy + dy][x + dx] !== 'j'));
    if (!at) return it;
    g[at[1]][at[0]] = 'j';
    return { ...it, x: at[0], y: at[1] };
  });

  // A door in the side of a route cannot be written down in advance either: the
  // caller says "a cave, about here", and here is wherever the carving left
  // ground. The two gates are fixed; everything else moves to meet the road.
  const placedWarps = warps.map((w) => {
    if (w.y === 0 || w.y === height - 1) return w;
    const at = nearest(w.x, w.y, shoulder) ?? nearest(w.x, w.y, walkable);
    if (!at) return w;
    if (w.cave) g[at[1]][at[0]] = '%';
    return { ...w, x: at[0], y: at[1] };
  });

  return {
    name, music, ground, indoor,
    tiles: g.map((r) => r.join('')),
    encounters, warps: placedWarps, npcs: placedNpcs,
    signs: placedSigns, items: placedItems,
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

  // --- the streets, last -----------------------------------------------------
  //
  // Last, because they were first and the warren was then drawn straight over
  // them. The great way south came out of that four tiles wide at the top of
  // the city and one tile wide at the bottom - a gap between a slum and a
  // wharf, at the far end of a map ten screens tall, with nothing anywhere
  // saying it was there. A player who could not find their way out of King's
  // Landing was not being careless. There was nothing to find.
  //
  // Nothing else in the city is allowed to build on a street now, and the two
  // great ways are four tiles across the whole length and breadth of it, so
  // that standing on one you can see it is a road and see which way it runs.
  const AVENUE = 14, AVENUE_W = 4;
  box(1, 10, W - 2, 2, '=');                        // the great east-west way
  box(1, 20, W - 2, 2, '=');                        // the lower way
  box(AVENUE, 1, AVENUE_W, 9, '=');                 // up to the hills
  box(AVENUE, 12, AVENUE_W, 8, '=');                // down through the market
  box(AVENUE, 22, AVENUE_W, 9, '=');                // and out of the Mud Gate

  // The gate itself, so that the end of the road looks like the end of a road:
  // a gatehouse either side of an opening you can walk four abreast through.
  box(AVENUE, 31, AVENUE_W, 1, '=');

  // The way down into Flea Bottom, put back on top of the street rather than
  // under it: it used to be drawn before the lower way and paved straight over.
  put(11, 21, 'D');

  // A few green things nobody has paved over yet.
  for (const [x, y] of [[13, 4], [13, 6], [18, 5], [18, 7], [12, 8], [19, 3]]) put(x, y, ',');

  return g.map((r) => r.join(''));
}


/* ---------------------------------------------------------------- rooms ---
 *
 * What is behind the two doors at the bottom of every town.
 *
 * A settlement in this game used to be a maester, a smith and a lord, and
 * nowhere at all that anybody went in the evening - which is the one thing
 * every place in Westeros has and this world had none of. Each town now has an
 * inn and a common house, generated from these two plans so that adding a town
 * adds both without anybody typing another room.
 *
 * They are not scenery. The innkeep sells food and mends you; the taproom has
 * somebody in it worth listening to and somebody in it worth fighting; and what
 * the smallfolk say in them is where the regional colour of this game actually
 * lives.
 */
const INN_TILES = [
  'IIIIIIIIIIIIII',
  'Ih=========N=I',
  'I==KKKKKK====I',
  'I============I',
  'I=T=T=T==b=b=I',
  'I=T=T=T======I',
  'I============I',
  'I=T=T=T==b=b=I',
  'I=T=T=T======I',
  'I=====F=F====I',
  'I============I',
  'IIIIII__IIIIII',
];

const HOUSE_TILES = [
  'IIIIIIIIIIIIII',
  'Ic==========cI',
  'I=cccccccccc=I',
  'I=cBc=F=cBc==I',
  'I=cccccccccc=I',
  'I==KKK===b=b=I',
  'I============I',
  'I=b=b====b=b=I',
  'I============I',
  'I=F=======F==I',
  'I============I',
  'IIIIII__IIIIII',
];

/**
 * An inn: a fire, a counter, tables, and beds upstairs that are drawn on the
 * same floor because a cartridge map has one storey.
 */
function makeInn({ town, name, region, keeper, keeperLine, drinkerLine,
                   fighter, fighterLine, stock }) {
  return {
    name, indoor: true, music: 'town', ground: 'stone',
    tiles: INN_TILES,
    warps: [
      { x: 6, y: 11, to: town, dir: 'down', back: true },
      { x: 7, y: 11, to: town, dir: 'down', back: true },
    ],
    npcs: [
      { x: 4, y: 1, dir: 'down', sprite: 'goodwife', name: keeper, script: 'innkeep',
        data: { line: keeperLine, stock } },
      { x: 4, y: 6, dir: 'up', sprite: 'smallfolk', name: 'Drinker', script: 'taproom',
        data: { line: drinkerLine } },
      { x: 10, y: 3, dir: 'left', sprite: 'sellsword', name: fighter, script: 'duel',
        data: { duel: fighterLine } },
    ],
    signs: [
      { x: 12, y: 1, text: `${region.toUpperCase()}\nA raven post, a fire and a bed.\nAsk at the counter.` },
    ],
  };
}

/**
 * And the common house across the road: warmer, louder, and where anyone who
 * knows anything about this town is sitting.
 */
function makeCommonHouse({ town, name, region, madam, madamLine, voices }) {
  return {
    name, indoor: true, music: 'town', ground: 'stone',
    tiles: HOUSE_TILES,
    warps: [
      { x: 6, y: 11, to: town, dir: 'down', back: true },
      { x: 7, y: 11, to: town, dir: 'down', back: true },
    ],
    npcs: [
      { x: 2, y: 5, dir: 'right', sprite: 'goodwife', name: madam, script: 'houseKeeper',
        data: { line: madamLine } },
      { x: 10, y: 1, dir: 'down', sprite: 'girl', name: voices[0].who, script: 'houseTalk',
        data: { line: voices[0].line } },
      { x: 3, y: 8, dir: 'right', sprite: 'smallfolk', name: voices[1].who, script: 'houseTalk',
        data: { line: voices[1].line } },
      { x: 10, y: 8, dir: 'left', sprite: 'noble', name: voices[2].who, script: 'houseTalk',
        data: { line: voices[2].line } },
    ],
    signs: [
      { x: 1, y: 1, text: `A red lamp in the window and nobody's name over the door.\n${region} has one of these in every town.` },
    ],
  };
}

/* ------------------------------------------------------------- Winterfell --
 *
 * Winterfell was a snowfield with four buildings on it inside one square wall,
 * twenty-four tiles by twenty, and so was every other seat in the game. This is
 * the castle as the show has it: a curtain wall with a winter town living
 * against its east face, the godswood south of the walls with a heart tree and
 * a black pool under it, the glass gardens warm against the south wall, the
 * practice yard, the kennels, the crypt stair, and the First Keep standing
 * broken where nobody has bothered to pull it down.
 *
 * The castle itself is exactly where it was, tile for tile, so every door,
 * every sign and every person already standing in it is still standing there.
 * The place grows east and south around them; nothing moves but two gates that
 * used to be the edge of the world and are now the way through it.
 */
function winterfellPlan() {
  const W = 32, H = 32;
  /* The castle, unchanged. Twenty-four wide and twenty tall, and every
     coordinate in it is one somebody is standing on. */
  const keep = [
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
    'MSSGGGGGGSSS-SSSHDHwSSS-',
    'vSSpepDpwSSS-SSSSSSSSSSv',
    'MSSSSS-SSSSS-SSSSSSSSSSM',
    'MSS------------------SSM',
    'MSSSSSSSSSSS-SSSSSSSSSSM',
    'MSS;;;W;;;SS-SSSSSSSSSSM',
    'MSS;;;;;;;SS-SSSSSSSSSSM',
    'MMMMMMMMMMMM-MMMMM-MMMMM',
  ];
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill('S'));
  keep.forEach((row, y) => [...row].forEach((c, x) => { g[y][x] = c; }));

  const put = (x, y, c) => { if (g[y] && g[y][x] !== undefined) g[y][x] = c; };
  const box = (x, y, w, h, c) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c);
  };
  const row = (x, y, text) => [...text].forEach((c, i) => put(x + i, y, c));

  /* ---- the winter town, east of the curtain wall ------------------------ */
  /* Half a hundred houses that stand empty most of the year and fill up when
     the snows come. The road in is the east gate the castle already had. */
  box(24, 0, 8, 1, 'M');
  box(31, 0, 1, 20, 'M');
  box(24, 19, 8, 1, 'M');
  put(28, 19, '-');                          // and out to the godswood road
  put(31, 12, '-');                          // and the east gate, onto the road
  put(30, 12, '-');

  /* The inn and the common house. Two tiles across is a shed; a building people
     sleep in wants a frontage wide enough to put a window either side of its
     own door. */
  row(25, 2, 'n');       row(29, 2, 'n');    // chimneys over the thatch
  row(24, 3, 'yyy');     row(28, 3, 'yyy');
  row(24, 4, 'YYY');     row(28, 4, 'YYY');
  row(24, 5, 'YYY');     row(28, 5, 'YYY');
  row(24, 6, 'wDH');     row(28, 6, 'DwH');  // the inn, and the common house
  box(25, 8, 6, 1, '-');                     // the market street
  put(25, 9, 'K'); put(26, 9, 'K');          // stalls down both sides of it
  put(29, 9, 'K'); put(30, 9, 'K');
  put(27, 10, '!');                          // and a board nailed up at the end
  row(24, 12, '-----');                      // the road in from the east gate
  row(25, 14, 'ggg');
  row(25, 15, 'GGG');
  row(25, 16, 'GGG');
  row(25, 17, 'HwH');                        // the granary, shuttered
  /* A paddock behind it, because the horses have to be somewhere. */
  row(29, 15, 'ff'); put(29, 16, 'f'); put(29, 17, 'f');   /* open on the east */

  /* ---- the godswood and the south grounds ------------------------------- */
  /* The wood is old and it is not laid out. Pines thick enough to lose the
     castle in, a heart tree in the middle of them, and a pool under it that
     does not freeze. */
  box(1, 20, 30, 11, 'S');
  box(0, 20, 1, 12, 'M');
  box(31, 20, 1, 12, 'M');
  box(0, 31, 32, 1, 'M');
  put(12, 31, '-');                          // the hunter's gate, out to the wood

  /* The road down from the castle's south gate, and the one from the town. */
  box(12, 20, 1, 11, '-');
  box(28, 20, 1, 4, '-');
  box(13, 23, 16, 1, '-');

  /* The godswood proper, west of the road. */
  box(2, 21, 9, 9, ';');
  for (const [x, y] of [[2, 22], [4, 21], [7, 21], [9, 22], [2, 26], [3, 29],
                        [6, 29], [9, 28], [10, 26], [1, 24], [10, 21], [1, 28]]) put(x, y, 'P');
  box(5, 25, 3, 3, '~');                     // the black pool, which never ices
  put(6, 24, 'W');                           // and the heart tree over it
  put(4, 24, 'P'); put(8, 24, 'P');
  put(3, 27, '*'); put(9, 27, '*');

  /* The castle stands above its own grounds, and the south gate has to come
     down to them. A flight that widens as it falls, so leaving the castle is a
     descent rather than a step over a threshold. */
  put(12, 20, '/');
  box(11, 21, 3, 4, '/');

  /* The glass gardens: a bed against the south face of the wall, kept warm by
     the hot springs under the castle and roofed in glass. Nothing else in the
     North grows in winter, and the panes are the only reason this does. */
  row(14, 20, 'pwwwwp');
  row(14, 21, 'w****w');
  row(14, 22, 'w*SS*w');
  row(14, 23, 'ppSSpp');

  /* The First Keep, on its island. Nobody has lived in it for six hundred
     years, and the ground around it was cut away long before that — what is
     left of the tower stands in its own water with one bridge to it. The stair
     down to the crypt goes from inside. */
  box(15, 25, 7, 1, ':');                    // the moat, the whole way round
  box(15, 30, 7, 1, ':');
  box(15, 26, 1, 4, ':'); box(21, 26, 1, 4, ':');
  put(15, 29, '+');                          // and the one way over it
  row(16, 26, 'UAAAU');                      // the ruin: ashlar, and what fell
  row(16, 27, 'AAAAA');
  row(16, 28, 'SADAS');
  row(16, 29, 'SSSSS');

  /* The practice yard: one pen with one gate, rather than two half-pens with a
     rack of arms floating in the gap between them. */
  box(23, 25, 5, 1, 'f');
  box(23, 29, 5, 1, 'f');
  box(23, 26, 1, 3, 'f'); box(27, 26, 1, 3, 'f');
  put(23, 27, 'S');                          // the gate, off the yard
  put(25, 26, 'l');                          // and the rack against the fence

  /* The kennels: you can hear them from the yard and you are not going in. */
  row(28, 26, 'zzz');
  row(28, 27, 'ZZZ');
  row(28, 28, 'HwH');                        // shuttered: there is no going in


  /* A few things to walk round rather than through — and only in open ground.
     A pine dropped into a one-tile gap does not read as scenery, it reads as a
     door that will not open. */
  for (const [x, y] of [[22, 21], [25, 21], [30, 22], [30, 24],
                        [13, 30]]) put(x, y, 'P');

  return g.map((r) => r.join(''));
}

/**
 * Flea Bottom. The cartridge drew the poorest quarter of the largest city in
 * the world as `warren()` — a procedural maze of dungeon wall and dungeon
 * floor, two doors in it and nothing else. Corridors of blank stone are not a
 * slum; they are not even a place.
 *
 * A warren is the right shape. A warren is made of houses. Four ranks of
 * tenements with the alleys between them offset rank to rank, so no line of
 * sight runs the length of it; the flea-channel down the middle carrying off
 * what the city is finished with, with one plank over it; and the pot that the
 * bowl of brown comes out of, boiling in the open where anyone can smell it.
 */
function fleaBottomPlan() {
  const W = 30, H = 20;
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill('d'));

  const put = (x, y, c) => { if (g[y] && g[y][x] !== undefined) g[y][x] = c; };
  const box = (x, y, w, h, c) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c);
  };
  const row = (x, y, text) => [...text].forEach((c, i) => put(x + i, y, c));

  /* One rank of tenement: roof, roof, and whatever frontage the alley will
     allow. Nothing down here has a door onto the street that is not barred, so
     the fronts are shutters and daub — the ways in are off courts the map does
     not show you. */
  const block = (x, y, front, roof = 'Z', cap = 'z') => {
    box(x, y, front.length, 1, cap);
    box(x, y + 1, front.length, 1, roof);
    row(x, y + 2, front);
  };

  // Walled in on every side by the backs of yet more of itself.
  box(0, 0, W, 1, 'Z');
  box(0, H - 2, W, 2, 'Z');
  box(0, 0, 1, H, 'Z');
  box(W - 1, 0, 1, H, 'Z');

  // Rank one, under the Hill of Rhaenys.
  block(1, 2, 'HwHHw');
  block(7, 2, 'wHHHwHH', 'Y', 'y');
  block(15, 2, 'HwHHHwH');
  block(23, 2, 'wHHHwH', 'Y', 'y');

  // Rank two. The gap at sixteen is not a building — it is the pot-shop, and
  // it is the only thing in Flea Bottom anybody gives directions by.
  block(1, 6, 'HHw', 'Y', 'y');
  block(5, 6, 'wHHHwH');
  block(12, 6, 'HwHH', 'Y', 'y');
  block(22, 6, 'wHHHHwH');

  // Rank three.
  block(1, 10, 'HHwH', 'Y', 'y');
  block(6, 10, 'wHHHHwH');
  block(14, 10, 'HwHHwH', 'Y', 'y');
  block(21, 10, 'wHHHw');
  block(27, 10, 'Hw');

  // Rank four, and the way out at the end of it.
  block(1, 14, 'HwHHHwH', 'Y', 'y');
  block(9, 14, 'wHHHwH');
  block(16, 14, 'HHwHw', 'Y', 'y');
  block(22, 14, 'wHHHHw');

  /* Three tenements that have been built up through what used to be an alley,
     joining one rank to the next. Without these the place is four terraces
     with three straight streets between them and you can see the far wall from
     anywhere; with them there is no line you can walk without turning, which
     is the whole of why Flea Bottom is somewhere people get lost. */
  const tall = (x, y, front, roof = 'Z', cap = 'z') => {
    box(x, y, front.length, 1, cap);
    box(x, y + 1, front.length, 5, roof);
    row(x, y + 6, front);
  };
  tall(8, 2, 'wHH');                          // rank one down into rank two
  tall(17, 10, 'HwH');                        // rank three down into rank four
  /* There was a third of these standing on the ninth row, and between it and
     the channel the plank became the only way from the north half of Flea
     Bottom to the south half. One person standing anywhere near it cut the map
     in two — which the passability check duly reported the moment somebody was
     given a reason to stand there after dark. A warren wants loops, not a
     single thread; the ninth row runs clear now and there are four ways down. */

  // Smoke, over the ones with a fire still in them.
  for (const [x, y] of [[3, 2], [10, 2], [18, 2], [25, 2], [7, 6], [24, 6],
                        [9, 10], [16, 10], [4, 14], [12, 14], [25, 14]]) put(x, y, 'n');

  /* The flea-channel: everything the city is done with, on its way to the bay,
     down the one alley wide enough to carry it. There is a plank over it in
     exactly one place, which is worth knowing before you need it. */
  box(17, 9, 5, 1, '~');
  put(20, 9, 't');

  /* The pot-shop. Not a building — a fire and a pot in the open, in the one
     court in Flea Bottom wide enough to hold a queue. The counter runs across
     the middle and the court runs round both ends of it, so the place can be
     walked through rather than backed out of. */
  row(17, 7, 'FKKK');                         // the fire, then the counter

  /* Tenements that came down and were never carted away. These go in the
     frontages, which are already walls — an alley down here is one tile wide,
     and anything dropped into one is not scenery, it is a road closed. */
  for (const [x, y] of [[2, 4], [10, 8], [24, 12], [18, 16], [27, 4]]) put(x, y, 'U');

  return g.map((r) => r.join(''));
}

/**
 * Pyke, which is not a village.
 *
 * It was drawn by the same generator as every other settlement — a hall, a
 * forge, a keep and two common houses on a crossroads — and the one thing that
 * makes Pyke Pyke, a castle broken across sea stacks with rope bridges strung
 * between the pieces, existed only as decoration down the right-hand edge. You
 * could walk the whole town and never cross water.
 *
 * Everything stands on a pillar of rock in open sea now, and every way from one
 * piece to the next is a rope bridge over nothing. Checked before it was wired
 * in: all eight doors reachable from the landward bridge, no stranded ground.
 */
function pykePlan() {
  const W = 32, H = 27;
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill('~'));

  const put = (x, y, c) => { if (g[y] && g[y][x] !== undefined) g[y][x] = c; };
  const row = (x, y, text) => [...text].forEach((c, i) => put(x + i, y, c));
  const span = (x, y, w, h, c) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c);
  };
  // A rope bridge draws the drop under itself, so a crossing is visibly over
  // nothing at all.
  const bridgeV = (x, y0, y1) => { for (let y = y0; y <= y1; y++) put(x, y, 'm'); };
  const bridgeH = (y, x0, x1) => { for (let x = x0; x <= x1; x++) put(x, y, 'm'); };

  // --- the gatehouse, and the only bridge to the land ----------------------
  bridgeV(12, 0, 0);
  row(10, 1, 'MMoMM');
  row(10, 2, 'MoooM');
  row(10, 3, 'MoooM');
  row(10, 4, 'MoooM');
  row(10, 5, 'ooooo');
  bridgeV(12, 6, 7);

  // --- the middle stack: the yard everything else hangs off ----------------
  span(9, 8, 7, 7, 'o');
  put(11, 10, 'F'); put(13, 10, 'F');       // braziers, because it is always dark

  // --- the Sea Tower, west: the maester's hall -----------------------------
  span(1, 8, 7, 7, 'o');
  put(3, 8, 'n');
  row(2, 9, 'zzzzz');
  row(2, 10, 'ZZZZZ');
  row(2, 11, 'AwAwA');
  row(2, 12, 'AeADA');                       // door at 5,12
  bridgeH(13, 8, 8);

  // --- the Bloody Keep, east: the forge ------------------------------------
  span(17, 8, 7, 7, 'o');
  put(21, 8, 'n');
  row(18, 9, 'zzzzz');
  row(18, 10, 'ZZZZZ');
  row(18, 11, 'AwAwA');
  row(18, 12, 'AkADA');                      // door at 21,12
  bridgeH(13, 16, 16);

  // --- the Great Keep, south: reached only across the water ----------------
  /* Walkways down both flanks, because the bridge lands on the north face and
     the gate is on the south one — without them the two halves of the stack are
     walled apart and the keep is a door you can see and never reach. */
  span(8, 17, 9, 7, 'o');
  row(9, 18, 'MMMMMMM');
  row(9, 19, 'MAAAAAM');
  row(9, 20, 'AAvAvAA');
  row(9, 21, 'AwAAAwA');
  row(9, 22, 'AAADAAA');                     // door at 12,22
  bridgeV(12, 15, 16);
  bridgeV(12, 24, 25);
  bridgeV(12, 26, 26);

  // --- the drowned vault, south-west --------------------------------------
  span(1, 17, 6, 5, 'o');
  row(2, 18, 'AAAA');
  row(2, 19, 'AADA');                        // door at 4,19
  bridgeV(4, 15, 16);

  // --- the two houses, out east on their own stacks ------------------------
  span(25, 8, 6, 7, 'o');
  put(27, 9, 'n');
  row(26, 10, 'yyyy');
  row(26, 11, 'YYYY');
  row(26, 12, 'ADAA');                       // inn door at 27,12
  bridgeH(13, 24, 24);

  span(25, 17, 6, 7, 'o');
  put(27, 18, 'n');
  row(26, 19, 'yyyy');
  row(26, 20, 'YYYY');
  row(26, 21, 'ADAA');                       // house door at 27,21
  bridgeV(27, 15, 16);

  return g.map((r) => r.join(''));
}

/**
 * The Eyrie: six hundred steps and a mule track, which the map did not have.
 *
 * It was the same crossroads village as everywhere else with cliffs painted
 * round the edge — the one castle in Westeros nobody has ever taken, drawn
 * flat. Four terraces cut into the side of the Giant's Lance now, joined by
 * stairs and with the drop on both sides of all of them: the seat at the top,
 * the hall and the armoury below it, everybody else below that, and the mule
 * track up from the Bloody Gate at the bottom.
 */
/* A blank twenty-four by twenty-seven core, and the helpers every hand-drawn
   town wants. The east eight columns are the outskirts and belong to makeTown,
   so a core never draws past x=23. */
function coreGrid(fill) {
  const G = [];
  for (let i = 0; i < 27; i++) G.push(new Array(24).fill(fill));
  const ok = (x, yy) => G[yy] && G[yy][x] !== undefined;
  return {
    put: (x, yy, c) => { if (ok(x, yy)) G[yy][x] = c; },
    row: (x, yy, s) => [...s].forEach((c, i) => { if (ok(x + i, yy)) G[yy][x + i] = c; }),
    span: (x, yy, w, h, c) => {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        if (ok(x + i, yy + j)) G[yy + j][x + i] = c;
      }
    },
    done: () => G.map((r) => r.join('')),
  };
}

/* Storm's End: one drum tower inside one unbroken curtain wall, on the cliff
   over Shipbreaker Bay. There is no town here and there never was — the wall is
   forty feet thick and jointed so smoothly the wind cannot get a grip on it,
   everything anybody needs is built against the inside of it, and the tower in
   the middle is the tallest thing in Westeros. Drawing that as a crossroads
   with four sheds around it was the worst thing this map table ever did. */
function stormsEndCore({ W, g, A, M, R, t, H, Z, z, Y, y, P, V }) {
  const { put, row, span, done } = coreGrid(W);

  // the curtain: two courses thick the whole way round, and the yard it holds
  span(3, 1, 18, 1, M);
  span(3, 2, 18, 1, A);
  span(3, 24, 18, 1, A);
  span(3, 25, 18, 1, M);
  for (let yy = 3; yy <= 23; yy++) { span(3, yy, 2, 1, A); span(19, yy, 2, 1, A); }
  span(5, 3, 14, 21, g);
  // the two gates, north to the storm lands and south to the wreckers
  for (const yy of [0, 1, 2, 24, 25, 26]) put(11, yy, g);

  // the maester and the forge, built against the inside of the north wall
  row(5, 3, t.repeat(5)); row(5, 4, R.repeat(5)); row(5, 5, P + 'wDw' + P);
  row(14, 3, z.repeat(5)); row(14, 4, Z.repeat(5)); row(14, 5, A + 'wDw' + A);

  /* The drum tower. Every window in it faces the sea, because for three hundred
     years the only thing worth watching for came off the sea. */
  row(9, 8, M.repeat(6));                          // corners cut, so it reads round
  [
    M + A.repeat(6) + M,
    A + 'w' + A.repeat(4) + 'w' + A,
    A.repeat(2) + V + A.repeat(2) + V + A.repeat(2),
    A + 'w' + A.repeat(4) + 'w' + A,
    A.repeat(8),
    A + 'w' + A.repeat(4) + 'w' + A,
  ].forEach((line, j) => row(8, 9 + j, line));
  row(9, 15, A.repeat(2) + 'D' + A.repeat(3));

  // and the rest of it against the south wall: an inn, a house, a cellar
  put(7, 17, 'n'); put(16, 17, 'n');
  row(5, 18, y.repeat(5)); row(5, 19, Y.repeat(5)); row(5, 20, H + 'wDw' + H);
  row(14, 18, y.repeat(5)); row(14, 19, Y.repeat(5)); row(14, 20, H + 'wDw' + H);
  row(10, 19, z.repeat(4)); row(10, 20, A + 'D' + A + A);

  return {
    tiles: done(),
    doors: {
      maester: [7, 5], forge: [16, 5], keep: [11, 15],
      cellar: [11, 20], inn: [7, 20], house: [16, 20],
      northGate: [11, 0], southGate: [11, 26],
    },
  };
}

/* Highgarden: two rings of white stone with the gardens in between, because the
   gardens are the reason anybody has ever heard of the place. Roses on low
   rails you walk between rather than look at, an orchard outside the wall, and
   the briar labyrinth down the east side — planted three hundred years ago as a
   joke, never cut down, and still the long way round. */
function highgardenCore({ W, g, A, M, R, t, H, Z, z, Y, y, P, V }) {
  const { put, row, span, done } = coreGrid(W);

  // ring one: the white garden wall, with the orchard crowding it outside
  span(1, 1, 22, 1, P);
  span(1, 25, 22, 1, P);
  for (let yy = 2; yy <= 24; yy++) { put(1, yy, P); put(22, yy, P); }
  span(2, 2, 20, 23, g);
  for (const yy of [0, 1, 25, 26]) put(11, yy, g);

  // the beds. Rails rather than hedges, so a rose is something you walk past.
  for (const yy of [3, 6]) {
    for (const x0 of [2, 8, 14]) { row(x0, yy, 'f'.repeat(5)); row(x0, yy + 1, '*'.repeat(5)); }
  }
  put(11, 3, g); put(11, 4, g); put(11, 6, g); put(11, 7, g);   // the walk to the gate
  put(19, 3, '#'); put(20, 6, '#');

  // ring two: the inner court, open to the south because that is the way in
  span(6, 8, 12, 1, P);
  for (let yy = 9; yy <= 18; yy++) { put(6, yy, P); put(17, yy, P); }

  /* The keep fills the court wall to wall. Drawn an inch narrower it left a
     one-tile slot down each flank, which is a dead end you can see into and a
     dead end anybody standing at its mouth seals — eighteen tiles of this
     castle were unreachable because two women were talking in the yard. */
  [
    M.repeat(10),
    A.repeat(10),
    A + 'w' + A + V + A.repeat(2) + V + A + 'w' + A,
    A.repeat(4) + 'D' + A.repeat(5),
  ].forEach((line, j) => row(7, 9 + j, line));

  row(7, 15, t.repeat(4)); row(7, 16, R.repeat(4)); row(7, 17, P + 'wD' + P);
  row(13, 15, z.repeat(4)); row(13, 16, Z.repeat(4)); row(13, 17, A + 'wD' + A);

  /* The labyrinth. A switchback, not a puzzle — a maze with dead ends in it is
     a maze the player walks into once and never enters again. */
  [[10, '###.'], [12, '.###'], [14, '###.'], [16, '.###'], [18, '###.']]
    .forEach(([yy, s]) => row(18, yy, s));

  // and the pavilions among the roses: an inn, a house, a cellar
  put(4, 19, 'n'); put(18, 19, 'n');
  row(2, 20, y.repeat(5)); row(2, 21, Y.repeat(5)); row(2, 22, H + 'wDw' + H);
  row(16, 20, y.repeat(5)); row(16, 21, Y.repeat(5)); row(16, 22, H + 'wDw' + H);
  row(8, 21, z.repeat(4)); row(8, 22, A + A + 'D' + A);

  return {
    tiles: done(),
    doors: {
      maester: [9, 17], forge: [15, 17], keep: [11, 12],
      cellar: [10, 22], inn: [4, 22], house: [18, 22],
      northGate: [11, 0], southGate: [11, 26],
    },
  };
}

/* Sunspear: the Winding Walls, and the three towers at the end of them. You do
   not walk into Sunspear — you walk along it, doubling back three times between
   walls too high to see over, which is how a castle with no moat and no hill
   has never been stormed. At the end of it the Tower of the Sun under its dome,
   the Spear Tower on the left, and the Sandship, which looks like a dromond
   that ran aground a thousand years ago and was built on where it lay. */
function sunspearCore({ W, g, A, M, R, t, H, Z, z, Y, y, P, V }) {
  const { put, row, span, done } = coreGrid(W);

  span(1, 1, 22, 1, P);
  span(1, 25, 22, 1, P);
  for (let yy = 2; yy <= 24; yy++) { put(1, yy, P); put(22, yy, P); }
  span(2, 2, 20, 23, g);
  for (const yy of [0, 1, 25, 26]) put(11, yy, g);

  /* The Winding Walls. Nobody stands in here and nothing is dressed in here:
     it is a lane one turn wide and anything left in it is a door that shuts. */
  span(2, 4, 17, 1, P);
  span(5, 7, 17, 1, P);

  // the Tower of the Sun, domed, and the great hall of Dorne under it
  row(8, 10, 'q'.repeat(8));
  row(8, 11, 'Q'.repeat(8));
  [
    A + 'w' + A + V + V + A + 'w' + A,
    A.repeat(8),
    A + 'w' + A.repeat(4) + 'w' + A,
    A.repeat(8),
    A.repeat(3) + 'D' + A.repeat(4),
  ].forEach((line, j) => row(8, 12 + j, line));

  // the Spear Tower, and the Sandship
  for (const [x0, doorAt] of [[2, 1], [18, 2]]) {
    row(x0, 11, 'q'.repeat(4));
    row(x0, 12, 'Q'.repeat(4));
    row(x0, 13, A + 'w' + A + A);
    row(x0, 14, A.repeat(4));
    row(x0, 15, A + 'w' + A + A);
    row(x0, 16, A.repeat(4));
    put(x0 + doorAt, 16, 'D');
  }

  // and the rest of it, south of the towers where the ground is flat
  row(2, 19, y.repeat(5)); row(2, 20, Y.repeat(5)); row(2, 21, H + 'wDw' + H);
  row(15, 19, y.repeat(5)); row(15, 20, Y.repeat(5)); row(15, 21, H + 'wDw' + H);
  row(9, 20, z.repeat(4)); row(9, 21, A + A + 'D' + A);

  return {
    tiles: done(),
    doors: {
      maester: [3, 16], forge: [20, 16], keep: [11, 16],
      cellar: [11, 21], inn: [4, 21], house: [17, 21],
      northGate: [11, 0], southGate: [11, 26],
    },
  };
}

/* Dragonstone: black stone that was shaped while it was still soft, under a
   mountain that has never gone out. The Dragonmont lies across the whole north
   of the map with its vents smoking, and there is a gate in the castle's back
   wall that goes straight into it. Below that the Stone Drum, and the Sea
   Dragon Tower and the Windwyrm standing off its shoulders. Nothing here is
   thatched, painted or grown — the whole island is one colour. */
function dragonstoneCore({ W, g, A, M, R, t, H, Z, z, Y, y, P, V }) {
  const { put, row, span, done } = coreGrid(W);

  // the mountain, and the one pass down through it
  span(2, 1, 20, 5, 'C');
  for (const [x, yy] of [[4, 3], [8, 2], [14, 4], [18, 3], [6, 5], [16, 2], [20, 4]]) put(x, yy, 'n');
  put(11, 0, g);
  span(11, 1, 2, 5, g);

  // the castle's back wall, with the gate into the Dragonmont standing in it
  span(2, 6, 20, 1, M);
  put(11, 6, g);
  put(5, 6, 'D');
  span(2, 7, 20, 18, g);          // the whole court, before anything stands on it

  /* The Stone Drum. Corners cut, because it is round, and because the only
     thing in this castle anybody remembers is that none of it has edges. */
  row(9, 9, M.repeat(6));
  [
    M + A.repeat(6) + M,
    A + 'w' + A + V + V + A + 'w' + A,
    A.repeat(8),
    A + 'w' + A.repeat(4) + 'w' + A,
    A.repeat(3) + 'D' + A.repeat(4),
  ].forEach((line, j) => row(8, 10 + j, line));

  // the Sea Dragon Tower and the Windwyrm, off its shoulders
  for (const [x0, doorAt] of [[2, 1], [18, 2]]) {
    row(x0, 9, M.repeat(4));
    row(x0, 10, A + 'w' + A + A);
    row(x0, 11, A.repeat(4));
    row(x0, 12, A + V + A + A);
    row(x0, 13, A.repeat(4));
    put(x0 + doorAt, 13, 'D');
  }
  // and the two places on this island where a fire is lit for a reason
  row(3, 17, z.repeat(5)); row(3, 18, Z.repeat(5)); row(3, 19, H + 'wDw' + H);
  row(15, 17, z.repeat(5)); row(15, 18, Z.repeat(5)); row(15, 19, H + 'wDw' + H);
  put(5, 16, 'n'); put(17, 16, 'n');

  span(2, 25, 20, 1, M);
  put(11, 25, g); put(11, 26, g);

  return {
    tiles: done(),
    doors: {
      maester: [11, 14], forge: [3, 13], keep: [5, 6],
      cellar: [20, 13], inn: [5, 19], house: [17, 19],
      northGate: [11, 0], southGate: [11, 26],
    },
  };
}

/* Braavos: a hundred islets and no ground between them. The streets are canals
   and every one of them has to be crossed on a bridge, so getting from the
   House of Black and White to the Iron Bank is a route rather than a walk. No
   walls, no gate, no keep — the Titan is the wall, and it is out in the lagoon
   where you cannot see it from inside your own city. */
function braavosCore({ W, g, A, M, R, t, H, Z, z, Y, y, P, V }) {
  const { put, row, span, done } = coreGrid(W);      // W is water here

  span(2, 1, 20, 25, g);                             // the islets, before cutting
  span(7, 1, 1, 24, W); span(16, 1, 1, 24, W);       // the two long canals
  span(2, 8, 20, 1, W); span(2, 17, 20, 1, W);       // and the two crossing them
  put(11, 0, g); put(11, 26, g);

  /* Every crossing is a bridge, and no two of them line up. A canal city where
     the bridges are all at the same x is a city with streets in it. */
  for (const [x, yy] of [[7, 6], [7, 13], [7, 21], [16, 7], [16, 14], [16, 20],
                         [4, 8], [11, 8], [19, 8], [3, 17], [12, 17], [20, 17]]) put(x, yy, 't');

  // the House of Black and White, which is built of exactly those two things
  row(2, 1, M.repeat(5));
  row(2, 2, A + P + A + P + A);
  row(2, 3, P + A + P + A + P);
  row(2, 4, A + P + A + P + A);
  row(2, 5, A + 'wDw' + A);                          // its door at 4,5

  // the Sealord's Palace, with the road out of the city running under it
  row(8, 1, M.repeat(3) + g + M.repeat(4));
  row(8, 2, A.repeat(3) + g + A.repeat(4));
  row(8, 3, A + 'w' + A + g + A + 'w' + A + A);
  row(8, 4, A.repeat(3) + g + A + V + A + A);
  row(8, 5, A.repeat(3) + g + A.repeat(4));

  // the Iron Bank, which will have its due
  row(17, 1, z.repeat(5));
  row(17, 2, Z.repeat(5));
  row(17, 3, A + 'w' + A + 'w' + A);
  row(17, 4, A.repeat(5));
  row(17, 5, A + 'wDw' + A);                         // its vault at 19,5

  // the Happy Port, and an inn across two canals from it
  row(2, 9, y.repeat(5)); row(2, 10, Y.repeat(5)); row(2, 11, H + 'wDw' + H);
  row(17, 9, y.repeat(5)); row(17, 10, Y.repeat(5)); row(17, 11, H + 'wDw' + H);
  put(4, 8, 't'); put(19, 8, 't');                   // (the roofs took the bridgeheads)

  /* The Moon Pool, in the middle, which is the one piece of water in this city
     that nobody has ever needed to cross. */
  span(10, 11, 4, 3, W);
  put(9, 10, 'F'); put(14, 14, 'F');

  return {
    tiles: done(),
    doors: {
      maester: [4, 5], cellar: [19, 5], inn: [19, 11], house: [4, 11],
      northGate: [11, 0], southGate: [11, 26],
    },
  };
}

// The Eyrie: four terraces cut into the Giant's Lance, each one cut back from
// the one below it, with Alyssa's Tears falling the whole height of the map
// down the west face and the drop widening on your right the whole climb.
function eyriePlan() {
  const W = 32, H = 27;
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill('^'));

  const put = (x, y, c) => { if (g[y] && g[y][x] !== undefined) g[y][x] = c; };
  const row = (x, y, text) => [...text].forEach((c, i) => put(x + i, y, c));
  const span = (x, y, w, h, c) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c);
  };

  /* Every walkway is two rows deep. One row is a corridor, and a corridor with
     anybody standing in it is a wall — five people on this map each cut a
     terrace in half the first time it was drawn. */
  const EDGE = [
    [0, 6, 19],    // the Eyrie itself
    [7, 7, 21],
    [8, 13, 23],   // the maester and the armoury
    [14, 14, 25],
    [15, 20, 27],  // where anybody who is not a lord lives
    [21, 21, 28],
    [22, 26, 29],  // the mule yard, and the long way down
  ];
  for (const [y0, y1, right] of EDGE) {
    for (let y = y0; y <= y1; y++) span(4, y, right - 3, 1, 'C');
  }
  // Alyssa's Tears, which have never once reached the ground.
  span(0, 0, 2, H, 'C');
  span(2, 0, 2, H, '~');

  // --- the top: the Eyrie, and the mountain road round its shoulder --------
  row(4, 1, 'MMMMMMMMMMMMM');
  row(4, 2, 'MAwAAAAAAAwAM');
  row(4, 3, 'MAAAvAAAvAAAM');
  row(4, 4, 'MAAAAADAAAAAM');          // keep door at 10,4
  put(18, 0, 'o');                     // the road on over the shoulder
  span(17, 1, 3, 6, 'o');
  span(4, 5, 16, 2, 'o');

  /* Six hundred steps. The flight runs the whole depth of the cliff and comes
     out between the maester's hall and the armoury. */
  span(10, 7, 3, 5, '/');

  // --- the second terrace: the maester's hall and the armoury -------------
  put(7, 8, 'n');
  row(5, 9, 'ggggg');
  row(5, 10, 'GGGGG');
  row(5, 11, 'pwDwp');                 // maester door at 7,11
  put(20, 8, 'n');
  row(18, 9, 'zzzzz');
  row(18, 10, 'ZZZZZ');
  row(18, 11, 'AwDwA');                // armoury door at 20,11
  span(4, 12, 20, 2, 'o');
  /* Braziers two columns clear of where anybody stands. A brazier on one row of
     a two-row walkway and a man on the other is a wall with a gap you can see
     through and not walk through. */
  put(12, 12, 'F'); put(18, 12, 'F');

  span(17, 14, 3, 5, '/');

  // --- the third terrace: the inn, a house, a cellar cut into the rock -----
  put(7, 15, 'n');
  row(5, 16, 'yyyyy');
  row(5, 17, 'YYYYY');
  row(5, 18, 'AwDwA');                 // inn door at 7,18
  put(14, 15, 'n');
  row(12, 16, 'ggggg');
  row(12, 17, 'GGGGG');
  row(12, 18, 'AwDwA');                // house door at 14,18
  put(24, 15, 'n');
  row(22, 16, 'ggggg');
  row(22, 17, 'GGGGG');
  row(22, 18, 'AwDwA');                // cellar door at 24,18
  span(4, 19, 24, 2, 'o');

  span(8, 21, 3, 1, '/');

  // --- the bottom: the mule yard, where the climb actually starts ----------
  span(4, 22, 26, 4, 'o');
  /* Pens, open at the front, because mules have to get out of them — and clear
     of x=8..10, which is where the last flight of steps lands. */
  row(14, 22, 'ffffffff');
  put(14, 23, 'f'); put(21, 23, 'f');
  // the winch house. Everything heavy that has ever gone up went up in it.
  row(24, 22, 'MMMMM');
  row(24, 23, 'MAvAM');
  row(24, 24, 'MAAAM');
  put(12, 23, 'F');
  /* One tile at the bottom: ground that runs off the side of a map is a place
     the player walks at and cannot leave, and a mule track is a mule track. */
  put(11, 26, 'o');

  return g.map((r) => r.join(''));
}

export const MAPS = {
  // ------------------------------------------------ the winter town, inside --
  winterfellInn: makeInn({
    town: 'winterfell', name: 'The Smoking Log', region: 'The North',
    keeper: 'Ony', keeperLine: 'Ony: Brown ale, black bread, and a bed if you can pay for one. The fire does not go out between now and spring.',
    drinkerLine: 'Half the Rills is drinking in here because there is nothing to do on a farm under four feet of snow.',
    fighter: 'A Drunk Freerider', fighterLine: 'bandit',
    stock: 'north',
  }),

  winterfellHouse: makeCommonHouse({
    town: 'winterfell', name: 'The Long Night', region: 'The North',
    madam: 'Bessa', madamLine: 'Bessa: Winter town, winter trade. Everybody in the North ends up in this room eventually, and most of them talk.',
    voices: [
      { who: 'A Northern Girl', line: 'A Northern Girl: They say the Umbers came down the kingsroad three weeks ago and nobody has seen them since.' },
      { who: 'A Miller', line: 'A Miller: The lord takes a tenth. The maester writes it down. The winter takes the rest and writes nothing down at all.' },
      { who: 'A Man of the Rills', line: 'A Man of the Rills: There is a thing about the North. It is not the cold that gets you, it is how long the cold goes on.' },
    ],
  }),

  /* The crypt. Eight thousand years of Kings of Winter with iron swords across
     their knees, and it is the one room in Winterfell nobody keeps a light in. */
  winterfellCrypt: {
    name: 'The Crypts of Winterfell',
    indoor: true,
    music: 'wild',
    ground: 'cave',
    tiles: [
      '@@@@@@@@@@@@@@@@@',
      '@%%%%%%%%%%%%%%%@',
      '@%@@%%%@@@%%%@@%@',
      '@%@@%%%@@@%%%@@%@',
      '@%%%%%%%%%%%%%%%@',
      '@%@@%%%%%%%%%@@%@',
      '@%@@%%%@@@%%%@@%@',
      '@%%%%%%@@@%%%%%%@',
      '@%@@%%%%%%%%%@@%@',
      '@%@@%%%@@@%%%@@%@',
      '@%%%%%%@@@%%%%%%@',
      '@%@@%%%%%%%%%@@%@',
      '@%@@%%%%%%%%%@@%@',
      '@%%%%%%%%%%%%%%%@',
      '@@@@@@@@_@@@@@@@@',
    ],
    warps: [
      { x: 8, y: 14, to: 'winterfell', tx: 18, ty: 29, dir: 'down' },
    ],
    signs: [
      { x: 4, y: 1, text: 'BRANDON THE BUILDER\nHe raised the Wall, they say, and this castle, and half of what is north of the Neck.\nNobody knows which of that is true.' },
      { x: 12, y: 7, text: 'THE KINGS OF WINTER\nEach with an iron sword across his knees, to keep the vengeful spirits in.\nSomebody has been taking the swords.' },
    ],
    items: [
      { x: 8, y: 3, item: 'valyrianShard' },
      { x: 3, y: 11, item: 'ironScrap' },
    ],
    npcs: [
      { x: 4, y: 10, dir: 'down', sprite: 'oldman', name: 'The Lamplighter', script: 'townTalk',
        data: { line: 'The Lamplighter: I go down with a lamp and I come up with a lamp. What I do not do is stop and listen. You should not either.' } },
    ],
  },

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
    get tiles() { return winterfellPlan(); },
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
      { x: 12, y: 31, to: 'wolfswood', tx: 10, ty: 1, dir: 'down' },
      { x: 12, y: 0, to: 'kingsroadNorth', tx: 11, ty: 28, dir: 'up' },
      { x: 31, y: 12, to: 'weepingWater', tx: 11, ty: 28, dir: 'right' },
      { x: 25, y: 6, to: 'winterfellInn', tx: 6, ty: 10, dir: 'up' },
      { x: 28, y: 6, to: 'winterfellHouse', tx: 6, ty: 10, dir: 'up' },
      { x: 18, y: 28, to: 'winterfellCrypt', tx: 8, ty: 13, dir: 'up' },
    ],
    signs: [
      { x: 9, y: 7, text: 'THE GREAT KEEP OF WINTERFELL\nSeat of House Stark.\nSigil-holder: LORD RICKARD.' },
      { x: 6, y: 17, text: 'THE GODSWOOD\nA heart tree has watched this ground for ten thousand years.\nIt is still watching.' },
      { x: 26, y: 10, text: 'THE WOOL MARKET\nSix hundred fleeces off the Rills, and every one spoken for.\nCome back in spring.' },
      { x: 8, y: 25, text: 'THE HEART TREE\nThe old gods have no songs and no septons.\nYou come, and you say it, and you go.' },
      { x: 28, y: 10, text: 'THE WINTER TOWN\nEmpty in summer. Full when the snows come.\nIt has been full for two years.' },
      { x: 16, y: 20, text: 'THE GLASS GARDENS\nHot springs run under this ground.\nIt is the only place in the North where anything is green.' },
      { x: 17, y: 28, text: 'THE FIRST KEEP\nNobody has lived in it for six hundred years.\nThey cut the water round it before that, and never filled it in.\nThe stair down goes to the crypt.' },
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
      /* The winter town, which stands empty most of the year and is full now. */
      { x: 28, y: 16, dir: 'left', sprite: 'child', name: 'Stable Girl', abroad: 'day', script: 'townTalk',
        data: { line: 'Stable Girl: That grey is Lord Stark\'s and he does not like you. He does not like me either.' } },
      /* And the godswood, which people go into alone. */
      { x: 25, y: 27, dir: 'up', sprite: 'stark', name: 'Master-at-arms', script: 'duel',
        data: { duel: 'rodrikCassel' } },
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
            helm: ['paddedCoif', 'mailCoif', 'nasalHelm'],
            gloves: ['leatherGloves', 'paddedGloves', 'mailMittens'],
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
      { x: 7, y: 2, dir: 'down', sprite: 'stark', name: 'Alys Karstark', script: 'courtship',
        data: { match: 'alysKarstark',
                line: "Alys Karstark: My uncle wants me married to a man twice my age. You are not that, which is a start." } },
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
    seed: 0x31A7, spurs: 5,
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
      { x: 11, y: 0, to: 'castleBlack', tx: 11, ty: 18, dir: 'up' },
      { x: 11, y: 29, to: 'winterfell', tx: 12, ty: 1, dir: 'down' },
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
      'Ciiiiiiiiii-iiiiiiiiiiiC',
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
      { x: 11, y: 19, to: 'kingsroadNorth', tx: 11, ty: 1, dir: 'down' },
      { x: 20, y: 10, to: 'theGift', tx: 11, ty: 28, dir: 'right' },
      { x: 11, y: 0, to: 'beyondTheWall', tx: 11, ty: 28, dir: 'up' },
      { x: 4, y: 7, to: 'maesterHallCastleBlack', tx: 5, ty: 7, dir: 'up' },
      { x: 18, y: 7, to: 'castleBlackArmoury', tx: 5, ty: 6, dir: 'up' },
      { x: 5, y: 14, to: 'castleBlackHall', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 13, y: 10, text: 'CASTLE BLACK\nSeat of the Night\u2019s Watch.\nNorth of here the maps stop.' },
    ],
    npcs: [
      { x: 11, y: 5, dir: 'down', sprite: 'nightswatch', name: 'Watch of the Gate', abroad: 'night',
        script: 'townTalk',
        data: { line: 'Watch of the Gate: Nothing moves out there but the snow. That is the good sort of night, and I will take it.' } },
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
      'I===cccXccccc==II',
      'I===cccccccc===II',
      'I=B============II',
      'I=B====TT======II',
      'I======TT======II',
      'I==============II',
      'IIIIIII__IIIIIIII',
    ],
    warps: [
      { x: 7, y: 9, to: 'theEyrie', tx: 10, ty: 5, dir: 'down' },
      { x: 8, y: 9, to: 'theEyrie', tx: 10, ty: 5, dir: 'down' },
    ],
    npcs: [
      { x: 3, y: 2, dir: 'down', sprite: 'arryn', name: 'Mya Stone', script: 'courtship',
        data: { match: 'mya',
                line: "Mya Stone: I drive mules up a mountain and my father was a king. Nobody can decide which to treat me as." } },
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
      { x: 5, y: 7, to: 'dragonstone', tx: 3, ty: 14, dir: 'down' },
      { x: 6, y: 7, to: 'dragonstone', tx: 3, ty: 14, dir: 'down' },
    ],
    npcs: [
      { x: 5, y: 1, dir: 'down', sprite: 'smallfolk', name: 'Dragonsmith', script: 'smith',
        data: {
          line: 'Dragonsmith: The fires under this rock never went out. '
            + 'Neither has the steel they make.',
          stock: {
            weapon: ['ironSword', 'castleForged', 'warhammer'],
            armour: ['ringmail', 'scaleArmour', 'knightsPlate'],
            helm: ['nasalHelm', 'kettleHat', 'bascinet'],
            gloves: ['mailMittens', 'splintedGauntlets'],
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
            helm: ['nasalHelm', 'kettleHat', 'bascinet'],
            gloves: ['mailMittens', 'splintedGauntlets'],
            shield: ['buckler', 'oakShield'],
          },
        } },
    ],
  },

  beyondTheWall: makeRoute({
    seed: 0x9C11, spurs: 6,
    name: 'Beyond the Wall', ground: 'snow', wall: 'P', floor: 'S', grass: ';',
    music: 'wild',
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
      { roamer: 'wyverner', min: 32, max: 40, weight: 18 },
      { roamer: 'wildlingRaider', min: 26, max: 34, weight: 32 },
      { roamer: 'spearwife', min: 27, max: 35, weight: 28 },
      { roamer: 'gravedigger', min: 30, max: 39, weight: 22 },
      { beast: 'scaleflight', min: 32, max: 38, weight: 8 },
      { beast: 'direwolf', min: 28, max: 33, weight: 12 },
      { beast: 'palewalker', min: 34, max: 39, weight: 6 },
    ],
    warps: [
      { x: 11, y: 29, to: 'castleBlack', tx: 11, ty: 1, dir: 'down' },
      { x: 11, y: 0, to: 'hauntedForest', tx: 11, ty: 28, dir: 'up' },
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
    seed: 0x4D82, spurs: 4, river: 14,
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
      { x: 11, y: 29, to: 'riverlands', tx: 18, ty: 12, dir: 'down' },
      { x: 11, y: 0, to: 'theEyrie', tx: 11, ty: 25, dir: 'up' },
    ],
    signs: [
      { x: 8, y: 21, text: 'THE BLOODY GATE\n"You may not pass."\nSomeone has scratched: "unless"' },
    ],
    npcs: [
      { x: 11, y: 27, dir: 'down', sprite: 'arryn', name: "Knight of the Gate", warden: 3,
        script: 'warden',
        data: { line: "Knight of the Gate: You may pass the Bloody Gate when the Vale has a reason to let you.",
                hint: "Knight of the Gate: Three seats. The Rock is the one you are short of, and it is west of here." } },
      { x: 10, y: 27, dir: 'down', sprite: 'arryn', name: "Knight of the Gate", warden: 3,
        script: 'warden',
        data: { line: "Knight of the Gate: You may pass the Bloody Gate when the Vale has a reason to let you.",
                hint: "Knight of the Gate: Three seats. The Rock is the one you are short of, and it is west of here." } },
      { x: 12, y: 27, dir: 'down', sprite: 'arryn', name: "Knight of the Gate", warden: 3,
        script: 'warden',
        data: { line: "Knight of the Gate: You may pass the Bloody Gate when the Vale has a reason to let you.",
                hint: "Knight of the Gate: Three seats. The Rock is the one you are short of, and it is west of here." } },
      { x: 11, y: 10, dir: 'right', sprite: 'arryn', name: 'Ser Vardis', script: 'trainer',
        data: { trainer: 'valeKnight' } },
      { x: 13, y: 19, dir: 'left', sprite: 'brienne', name: 'Brienne of Tarth', script: 'duel',
        data: { duel: 'brienne' } },
    ],
    items: [
      { x: 3, y: 20, item: 'kingsRansom', count: 1, flag: 'item_vale_ransom' },
    ],
  }),

  theEyrie: {
    name: 'The Eyrie', music: 'town', ground: 'stone',
    get tiles() { return eyriePlan(); },
    encounters: [
      { roamer: 'clansman', min: 20, max: 28, weight: 55 },
      { roamer: 'hedgeKnight', min: 20, max: 28, weight: 45 },
    ],
    warps: [
      { x: 24, y: 18, to: 'theEyrieCellar', tx: 6, ty: 8, dir: 'up' },
      { x: 7, y: 18, to: 'theEyrieInn', tx: 6, ty: 10, dir: 'up' },
      { x: 14, y: 18, to: 'theEyrieHouse', tx: 6, ty: 10, dir: 'up' },
      { x: 11, y: 26, to: 'bloodyGate', tx: 11, ty: 1, dir: 'down' },
      { x: 18, y: 0, to: 'stoneCrowHold', tx: 11, ty: 20, dir: 'up' },
      { x: 7, y: 11, to: 'maesterHallEyrie', tx: 5, ty: 7, dir: 'up' },
      { x: 20, y: 11, to: 'eyrieArmoury', tx: 5, ty: 6, dir: 'up' },
      { x: 10, y: 4, to: 'eyrieKeep', tx: 7, ty: 8, dir: 'up' },
    ],
    signs: [
      { x: 9, y: 4, text: 'THE EYRIE\nSeat of House Arryn.\nAs High as Honour.' },
      { x: 26, y: 24, text: 'THE WINCH HOUSE\nSix hundred steps, and a mule track before that.\nAn army has never taken the Eyrie. An army has never got up here.' },
      { x: 3, y: 13, text: "ALYSSA'S TEARS\nShe wept for her murdered children and never stopped.\nThe fall is so long the water is gone to mist before it lands." },
    ],
    npcs: [
      { x: 7, y: 6, dir: 'down', sprite: 'arryn', name: 'Bronze Yohn Royce',
        script: 'trainer', data: { trainer: 'gymArryn' } },
      { x: 15, y: 13, dir: 'down', sprite: 'oldman', name: 'Mountain Steward', script: 'deedBroker',
        data: { property: 'valeWatchtower' } },
      { x: 5, y: 20, dir: 'right', sprite: 'guard', name: 'Sky Road Warden', script: 'townTalk',
        data: { line: 'Sky Road Warden: Six hundred steps and a mule track. In winter the mules will not do it, and neither will I.' } },
      { x: 17, y: 23, dir: 'left', sprite: 'smallfolk', name: 'A Mule Driver', script: 'townTalk',
        data: { line: 'A Mule Driver: Do not look left. There is nothing on the left but four thousand feet of nothing.' } },
      { x: 13, y: 25, dir: 'down', sprite: 'arryn', name: 'Knight of the Gate', script: 'townTalk',
        data: { line: 'Knight of the Gate: The Vale keeps its own counsel and its own passes. You are a guest here, and guests go up on foot.' } },
    ],
  },

  maesterHallEyrie: maesterHall({
    exitTo: 'theEyrie', exitX: 7, exitY: 12,
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
      { x: 5, y: 7, to: 'theEyrie', tx: 20, ty: 12, dir: 'down' },
      { x: 6, y: 7, to: 'theEyrie', tx: 20, ty: 12, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 1, dir: 'down', sprite: 'arryn', name: 'Armourer', script: 'smith',
        data: {
          line: 'Armourer: Falcon-etched and overpriced. It is the Vale, what did you expect.',
          stock: {
            weapon: ['castleForged', 'boarSpear', 'huntingBow'],
            armour: ['ringmail', 'scaleArmour'],
            helm: ['nasalHelm', 'kettleHat', 'bascinet'],
            gloves: ['mailMittens', 'splintedGauntlets'],
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
    seed: 0x7E05, spurs: 5, river: 19,
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
          { beast: 'courser', min: 26, max: 31, weight: 12 },
      { beast: 'cubmane', min: 27, max: 31, weight: 12 },
      { beast: 'emberwisp', min: 28, max: 32, weight: 10 },
    ],
    warps: [
      { x: 11, y: 0, to: 'lannisport', tx: 18, ty: 17, dir: 'down' },
      { x: 11, y: 29, to: 'highgarden', tx: 11, ty: 1, dir: 'down' },
      { x: 5, y: 16, to: 'stoneCrypt', tx: 7, ty: 13, dir: 'up', cave: true },
    ],
    signs: [
      { x: 8, y: 2, text: 'THE ROSEROAD\nSouth to Highgarden, and on to Dorne.\nGrowing strong.' },
    ],
    npcs: [
      { x: 11, y: 2, dir: 'down', sprite: 'tyrell', name: "Warden of the Roseroad", warden: 4,
        script: 'warden',
        data: { line: "Warden of the Roseroad: The Reach is not a shortcut. It is somewhere people are invited to.",
                hint: "Warden of the Roseroad: Four seats. The Vale holds one, and the Vale is behind you." } },
      { x: 10, y: 2, dir: 'down', sprite: 'tyrell', name: "Warden of the Roseroad", warden: 4,
        script: 'warden',
        data: { line: "Warden of the Roseroad: The Reach is not a shortcut. It is somewhere people are invited to.",
                hint: "Warden of the Roseroad: Four seats. The Vale holds one, and the Vale is behind you." } },
      { x: 12, y: 2, dir: 'down', sprite: 'tyrell', name: "Warden of the Roseroad", warden: 4,
        script: 'warden',
        data: { line: "Warden of the Roseroad: The Reach is not a shortcut. It is somewhere people are invited to.",
                hint: "Warden of the Roseroad: Four seats. The Vale holds one, and the Vale is behind you." } },
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
    outsiders: [
      { dir: 'down', sprite: 'goodwife', name: 'The Gardener', script: 'townTalk',
        data: { line: 'The Gardener: Forty years I have cut this maze and I still have to think at the third turn. Take the left hand every time and you will come out.' } },
      { dir: 'down', sprite: 'noble', name: 'A Lost Bannerman', script: 'townTalk',
        data: { line: 'A Lost Bannerman: I came in here at noon to think about something and I have entirely forgotten what it was.' } },
    ],
    outskirts: OUTSKIRTS.roseMaze, gate: 13,
    core: highgardenCore,
    banner: 'V',
    dressing: [[3, 10, '*'], [4, 13, '*'], [3, 16, '*'], [5, 11, '*'], [4, 9, '#'],
               [13, 20, '*'], [14, 23, '*'], [7, 19, '*'], [21, 21, '*'], [9, 24, '*']],
    roof: 'Y', ridge: 'y',
    name: 'Highgarden', ground: 'grass', music: 'town',
    warps: [
      { door: 'cellar', to: 'highgardenCellar', tx: 6, ty: 8, dir: 'up' },
      { door: 'inn', to: 'highgardenInn', tx: 6, ty: 10, dir: 'up' },
      { door: 'house', to: 'highgardenHouse', tx: 6, ty: 10, dir: 'up' },
      { door: 'keep', to: 'highgardenKeep', tx: 7, ty: 8, dir: 'up' },
      { door: 'northGate', to: 'roseroad', tx: 11, ty: 28, dir: 'up' },
      { door: 'southGate', to: 'princesPass', tx: 11, ty: 1, dir: 'down' },
      { door: 'maester', to: 'maesterHallHighgarden', tx: 5, ty: 7, dir: 'up' },
      { door: 'forge', to: 'highgardenArmoury', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 20, y: 10, text: 'THE BRIAR MAZE\nPlanted three hundred years ago as a joke and never cut down.\nThe fountain is in the middle. So are several people.' },
      { x: 10, y: 12, text: 'HIGHGARDEN\nSeat of House Tyrell.\nEvery hedge is deliberate.' },
      { x: 6, y: 12, text: 'THE WHITE WALLS\nTwo rings of it, and the gardens in between.\nNo other castle in the realm wastes that much ground on flowers.' },
    ],
    npcs: [
      { x: 12, y: 5, dir: 'down', sprite: 'tyrell', name: 'Highgarden Steward', script: 'quest',
        data: { quest: 'theGrainCount' } },
      { x: 8, y: 14, dir: 'down', sprite: 'goodwife', name: 'Lady Olenna', script: 'olenna' },
      { x: 13, y: 14, dir: 'left', sprite: 'starkLady', name: 'Margaery', script: 'margaery' },
      { x: 3, y: 12, dir: 'right', sprite: 'girl', name: 'Gardener\u2019s Girl', script: 'reachHint' },
    ],
  }),

  maesterHallHighgarden: maesterHall({
    exitTo: 'highgarden', exitX: 9, exitY: 18,
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
      { x: 5, y: 7, to: 'highgarden', tx: 15, ty: 18, dir: 'down' },
      { x: 6, y: 7, to: 'highgarden', tx: 15, ty: 18, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 1, dir: 'down', sprite: 'tyrell', name: 'Master Smith', script: 'smith',
        data: {
          line: 'Master Smith: Tourney plate, mostly. It still stops a sword.',
          stock: {
            weapon: ['castleForged', 'warhammer', 'boarSpear'],
            armour: ['scaleArmour', 'knightPlate'],
            helm: ['bascinet', 'greatHelm', 'sallet', 'armet'],
            gloves: ['splintedGauntlets', 'plateGauntlets'],
            shield: ['oakShield', 'towerShield'],
          },
        } },
    ],
  },

  // =========================================================================
  //  DORNE
  // =========================================================================
  princesPass: makeRoute({
    seed: 0xB3C9, spurs: 5,
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
          { beast: 'sandSteed', min: 30, max: 36, weight: 16 },
      { beast: 'dornspine', min: 34, max: 38, weight: 8 },
      { beast: 'crabcrag', min: 31, max: 35, weight: 12 },
    ],
    warps: [
      { x: 11, y: 0, to: 'highgarden', tx: 11, ty: 25, dir: 'up' },
      { x: 11, y: 29, to: 'sunspear', tx: 11, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 8, y: 2, text: "THE PRINCE'S PASS\nThe only easy road into Dorne.\nIt is not easy." },
    ],
    npcs: [
      { x: 11, y: 2, dir: 'down', sprite: 'martell', name: "Watcher of the Pass", warden: 5,
        script: 'warden',
        data: { line: "Watcher of the Pass: Dorne was never conquered, and it is not casually visited either.",
                hint: "Watcher of the Pass: Five. Highgarden is the one you want next, and it is at your back." } },
      { x: 10, y: 2, dir: 'down', sprite: 'martell', name: "Watcher of the Pass", warden: 5,
        script: 'warden',
        data: { line: "Watcher of the Pass: Dorne was never conquered, and it is not casually visited either.",
                hint: "Watcher of the Pass: Five. Highgarden is the one you want next, and it is at your back." } },
      { x: 12, y: 2, dir: 'down', sprite: 'martell', name: "Watcher of the Pass", warden: 5,
        script: 'warden',
        data: { line: "Watcher of the Pass: Dorne was never conquered, and it is not casually visited either.",
                hint: "Watcher of the Pass: Five. Highgarden is the one you want next, and it is at your back." } },
      { x: 6, y: 10, dir: 'right', sprite: 'martell', name: 'Sand Steed Rider', script: 'trainer',
        data: { trainer: 'dorneRider' } },
    ],
    items: [
      { x: 16, y: 19, item: 'kingsRansom', count: 1, flag: 'item_dorne_ransom' },
    ],
  }),

  sunspear: makeTown({
    outsiders: [
      { dir: 'down', sprite: 'martell', name: 'Orphan of the Greenblood', script: 'townTalk',
        data: { line: 'Orphan of the Greenblood: We are called orphans because we lost the mother Rhoyne. That was a thousand years ago. Dornishmen hold a grudge.' } },
      { dir: 'down', sprite: 'merchant', name: 'A Shade Seller', script: 'townTalk',
        data: { line: 'A Shade Seller: Water, shade, or somewhere to sit. In the shadow city all three cost the same and all three are worth it.' } },
    ],
    outskirts: OUTSKIRTS.shadowCity, gate: 18,
    core: sunspearCore,
    banner: 'V',
    /* Nothing solid on the two-row yard at 17-18: Oberyn stands on one row and
       a date palm on the row beside him is a wall across the whole west end. */
    dressing: [[3, 23, '#'], [7, 23, '#'], [16, 23, '#'], [20, 23, '#'],
               [8, 22, '*'], [14, 22, '*'], [10, 18, '*'], [12, 18, '*'],
               [6, 12, 'F'], [17, 12, 'F'],
               /* Cressets down the winding walls, all on one row of each lane
                  and three apart, so no two of them ever make a wall. */
               [5, 3, 'F'], [11, 3, 'F'], [17, 3, 'F'],
               [8, 6, 'F'], [14, 6, 'F'],
               [5, 8, 'F'], [11, 8, 'F'], [17, 8, 'F']],
    roof: 'Q', ridge: 'q',
    name: 'Sunspear', ground: 'sand', wall: 'C', floor: 's', music: 'town',
    warps: [
      { door: 'cellar', to: 'sunspearCellar', tx: 6, ty: 8, dir: 'up' },
      { door: 'inn', to: 'sunspearInn', tx: 6, ty: 10, dir: 'up' },
      { door: 'house', to: 'sunspearHouse', tx: 6, ty: 10, dir: 'up' },
      { door: 'keep', to: 'sunspearKeep', tx: 7, ty: 8, dir: 'up' },
      { door: 'northGate', to: 'princesPass', tx: 11, ty: 28, dir: 'up' },
      { door: 'southGate', to: 'waterGardens', tx: 11, ty: 20, dir: 'up' },
      { door: 'maester', to: 'maesterHallSunspear', tx: 5, ty: 7, dir: 'up' },
      { door: 'forge', to: 'sunspearArmoury', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 22, y: 19, text: 'THE SHADOW CITY\nTen thousand people living against the outside of the wall.\nNobody planned any of it and nobody ever will.' },
      { x: 10, y: 16, text: 'THE TOWER OF THE SUN\nSeat of House Martell.\nUnbowed. Unbent. Unbroken.' },
      { x: 12, y: 4, text: 'THE WINDING WALLS\nThree turns between walls you cannot see over.\nAn army that gets through the gate has got nowhere at all.' },
    ],
    npcs: [
      { x: 9, y: 18, dir: 'down', sprite: 'guard', name: 'Sunspear Guard', script: 'quest',
        data: { quest: 'theDornishHostage' } },
      { x: 13, y: 18, dir: 'down', sprite: 'martell', name: 'Orchard-Keeper', script: 'deedBroker',
        data: { property: 'dorneOrchard' } },
      { x: 6, y: 17, dir: 'right', sprite: 'martell', name: 'Oberyn Martell', script: 'duel',
        data: { duel: 'oberyn' } },
      { x: 17, y: 17, dir: 'left', sprite: 'oldman', name: 'Prince Doran', script: 'doran' },
      { x: 5, y: 23, dir: 'right', sprite: 'child', name: 'Orphan', script: 'dorneHint' },
    ],
  }),

  maesterHallSunspear: maesterHall({
    exitTo: 'sunspear', exitX: 3, exitY: 17,
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
      { x: 5, y: 7, to: 'sunspear', tx: 20, ty: 17, dir: 'down' },
      { x: 6, y: 7, to: 'sunspear', tx: 20, ty: 17, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 1, dir: 'down', sprite: 'martell', name: 'Bazaar Smith', script: 'smith',
        data: {
          line: 'Bazaar Smith: Light armour, long spears, and poison if you ask quietly.',
          stock: {
            weapon: ['boarSpear', 'huntingKnife', 'castleForged'],
            armour: ['boiledLeather', 'scaleArmour'],
            helm: ['nasalHelm', 'kettleHat', 'bascinet'],
            gloves: ['mailMittens', 'splintedGauntlets'],
            shield: ['buckler', 'oakShield'],
          },
        } },
    ],
  },

  // =========================================================================
  //  THE STORMLANDS
  // =========================================================================
  stormlands: makeRoute({
    seed: 0x2F60, spurs: 5, river: 12,
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
          { beast: 'courser', min: 30, max: 36, weight: 12 },
      { beast: 'krakenling', min: 29, max: 33, weight: 14 },
      { beast: 'riverfry', min: 28, max: 32, weight: 12 },
    ],
    warps: [
      { x: 11, y: 0, to: 'kingsroad', tx: 18, ty: 14, dir: 'down' },
      { x: 11, y: 29, to: 'stormsEnd', tx: 11, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 8, y: 2, text: 'THE STORMLANDS\nSouth to Storm\u2019s End.\nThe weather here has opinions.' },
    ],
    npcs: [
      { x: 11, y: 2, dir: 'down', sprite: 'baratheon', name: "Storm Lord's Outrider", warden: 7,
        script: 'warden',
        data: { line: "Storm Lord's Outrider: Storm's End answers to nobody with less than seven seats behind them.",
                hint: "Storm Lord's Outrider: Seven. Dorne and the Iron Islands are both still ahead of you." } },
      { x: 10, y: 2, dir: 'down', sprite: 'baratheon', name: "Storm Lord's Outrider", warden: 7,
        script: 'warden',
        data: { line: "Storm Lord's Outrider: Storm's End answers to nobody with less than seven seats behind them.",
                hint: "Storm Lord's Outrider: Seven. Dorne and the Iron Islands are both still ahead of you." } },
      { x: 12, y: 2, dir: 'down', sprite: 'baratheon', name: "Storm Lord's Outrider", warden: 7,
        script: 'warden',
        data: { line: "Storm Lord's Outrider: Storm's End answers to nobody with less than seven seats behind them.",
                hint: "Storm Lord's Outrider: Seven. Dorne and the Iron Islands are both still ahead of you." } },
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
    outsiders: [
      { dir: 'down', sprite: 'smallfolk', name: 'A Wrecker', script: 'townTalk',
        data: { line: 'A Wrecker: Everything on this shore came off a ship, including most of the people. Shipbreaker Bay is not a name somebody chose to be pretty.' } },
      { dir: 'down', sprite: 'oldman', name: 'The Bell Ringer', script: 'townTalk',
        data: { line: 'The Bell Ringer: When the bell goes, you are already too late to get off the cliff. I ring it anyway.' } },
    ],
    outskirts: OUTSKIRTS.seaCliff, gate: 13,
    core: stormsEndCore,
    banner: 'V',
    dressing: [[9, 16, 'F'], [13, 16, 'F'], [6, 22, 'U'], [17, 22, 'U'], [11, 22, 'U']],
    roof: 'G', ridge: 'g',
    name: "Storm's End", ground: 'grass', wall: 'C', music: 'town',
    warps: [
      { door: 'cellar', to: 'stormsEndCellar', tx: 6, ty: 8, dir: 'up' },
      { door: 'inn', to: 'stormsEndInn', tx: 6, ty: 10, dir: 'up' },
      { door: 'house', to: 'stormsEndHouse', tx: 6, ty: 10, dir: 'up' },
      { door: 'keep', to: 'stormsEndKeep', tx: 7, ty: 8, dir: 'up' },
      { door: 'northGate', to: 'stormlands', tx: 11, ty: 28, dir: 'up' },
      { door: 'southGate', to: 'wreckersHold', tx: 11, ty: 20, dir: 'up' },
      { door: 'maester', to: 'maesterHallStormsEnd', tx: 5, ty: 7, dir: 'up' },
      { door: 'forge', to: 'stormsEndArmoury', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 19, y: 12, text: 'SHIPBREAKER BAY\nThe wall on this side is forty feet thick.\nIt has to be.' },
      { x: 11, y: 8, text: "STORM'S END\nSeat of House Baratheon.\nNo storm has ever taken it. Many have tried." },
      { x: 4, y: 12, text: 'THE CURTAIN WALL\nOne unbroken ring, jointed so close the wind finds nothing to pull at.\nThere is no second wall. There has never needed to be.' },
    ],
    npcs: [
      { x: 7, y: 7, dir: 'down', sprite: 'redPriest', name: 'Melisandre', script: 'melisandre' },
      { x: 17, y: 7, dir: 'left', sprite: 'baratheon', name: 'Ser Davos', script: 'davos' },
      { x: 8, y: 22, dir: 'right', sprite: 'goodwife', name: 'Fisherwife', script: 'stormHint' },
    ],
  }),

  maesterHallStormsEnd: maesterHall({
    exitTo: "stormsEnd", exitX: 7, exitY: 6,
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
      { x: 5, y: 7, to: 'stormsEnd', tx: 16, ty: 6, dir: 'down' },
      { x: 6, y: 7, to: 'stormsEnd', tx: 16, ty: 6, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 1, dir: 'down', sprite: 'baratheon', name: 'Forgemaster', script: 'smith',
        data: {
          line: 'Forgemaster: Heavy work for heavy weather. Nothing pretty.',
          stock: {
            weapon: ['warhammer', 'castleForged', 'woodAxe'],
            armour: ['ringmail', 'scaleArmour', 'knightPlate'],
            helm: ['bascinet', 'greatHelm', 'sallet', 'armet'],
            gloves: ['splintedGauntlets', 'plateGauntlets'],
            shield: ['oakShield', 'towerShield'],
          },
        } },
    ],
  },

  // =========================================================================
  //  DRAGONSTONE
  // =========================================================================
  dragonstone: makeTown({
    outsiders: [
      { dir: 'down', sprite: 'targaryen', name: 'A Stone Cutter', script: 'townTalk',
        data: { line: 'A Stone Cutter: Nobody cut this castle. It was raised out of the rock while it was still soft, and nobody will say by what.' } },
      { dir: 'down', sprite: 'smallfolk', name: 'A Sulphur Gatherer', script: 'townTalk',
        data: { line: 'A Sulphur Gatherer: The ground is warm here in midwinter. That is not comforting once you have thought about why.' } },
    ],
    outskirts: OUTSKIRTS.smokingStrand, gate: 16,
    core: dragonstoneCore,
    banner: 'V',
    dressing: [[4, 21, 'U'], [8, 23, 'U'], [13, 21, 'U'], [18, 23, 'U'], [6, 8, 'U'],
               [16, 8, 'U'], [10, 22, 'n'], [14, 22, 'n'], [3, 23, 'n'], [20, 21, 'n']],
    roof: 'Z', ridge: 'z',
    name: 'Dragonstone', ground: 'stone', wall: 'C', floor: 'o', music: 'battleBoss',
    warps: [
      { door: 'cellar', to: 'dragonstoneCellar', tx: 6, ty: 8, dir: 'up' },
      { door: 'inn', to: 'dragonstoneInn', tx: 6, ty: 10, dir: 'up' },
      { door: 'house', to: 'dragonstoneHouse', tx: 6, ty: 10, dir: 'up' },
      { door: 'southGate', to: 'mudGate', tx: 9, ty: 7, dir: 'down' },
      { door: 'northGate', to: 'seaDragonHold', tx: 11, ty: 20, dir: 'up' },
      { door: 'maester', to: 'maesterHallDragonstone', tx: 5, ty: 7, dir: 'up' },
      { door: 'keep', to: 'dragonmont', tx: 8, ty: 14, dir: 'up' },
      { door: 'forge', to: 'dragonstoneArmoury', tx: 5, ty: 6, dir: 'up' },
    ],
    signs: [
      { x: 22, y: 17, text: 'THE SMOKING STRAND\nBlack sand, and steam coming out of it.\nNothing has grown on this beach in living memory.' },
      { x: 10, y: 14, text: 'THE STONE DRUM\nAncient seat of House Targaryen.\nThe stone here was shaped while it was still soft.' },
      { x: 6, y: 6, text: 'THE DRAGONMONT\nThe mountain has never gone out and the ground stays warm in midwinter.\nThat stops being comforting once you have thought about why.' },
    ],
    npcs: [
      { x: 8, y: 15, dir: 'down', sprite: 'unsullied', name: 'Grey Worm', script: 'duel',
        data: { duel: 'greyWorm' } },
      { x: 14, y: 15, dir: 'left', sprite: 'braavosi', name: 'Daario', script: 'duel',
        data: { duel: 'daario' } },
      { x: 11, y: 21, dir: 'up', sprite: 'targaryen', name: 'Daenerys Targaryen',
        script: 'gymTargaryen', data: { trainer: 'gymTargaryen' } },
      { x: 16, y: 23, dir: 'left', sprite: 'ironborn', name: 'Euron Greyjoy', script: 'duel',
        data: { duel: 'euron' } },
    ],
  }),

  maesterHallDragonstone: maesterHall({
    exitTo: 'dragonstone', exitX: 11, exitY: 15,
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
      { roamer: 'dragonmaster', min: 38, max: 45, weight: 28 },
      { roamer: 'dragonrider', min: 36, max: 44, weight: 20 },
      { roamer: 'redPriestess', min: 34, max: 42, weight: 28 },
      { roamer: 'ironbornReaver', min: 35, max: 44, weight: 24 },
      { beast: 'scaleflight', min: 36, max: 42, weight: 14 },
      { beast: 'dreadwyrm', min: 40, max: 45, weight: 10 },
      { beast: 'pyremaw', min: 40, max: 45, weight: 10 },
    ],
    warps: [
      { x: 8, y: 15, to: 'dragonstone', tx: 5, ty: 7, dir: 'down' },
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
      'I===cccXccccc==II',
      'I===cccccccc===II',
      'I=B============II',
      'I=B====TT======II',
      'I=F====TT=====FII',
      'I==============II',
      'IIIIIII__IIIIIIII',
    ],
    warps: [
      { x: 7, y: 9, to: 'highgarden', tx: 11, ty: 13, dir: 'down' },
      { x: 8, y: 9, to: 'highgarden', tx: 11, ty: 13, dir: 'down' },
    ],
    npcs: [
      { x: 3, y: 2, dir: 'down', sprite: 'tyrell', name: 'Willas', script: 'courtship',
        data: { match: 'willasTyrell',
                line: "Willas: I breed hounds and horses and read a great deal. My grandmother finds me difficult to place." } },
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
      'I===cccXccccc==II',
      'I===cccccccc===II',
      'I=B============II',
      'I=B====TT======II',
      'I=F====TT=====FII',
      'I==============II',
      'IIIIIII__IIIIIIII',
    ],
    warps: [
      { x: 7, y: 9, to: 'sunspear', tx: 11, ty: 17, dir: 'down' },
      { x: 8, y: 9, to: 'sunspear', tx: 11, ty: 17, dir: 'down' },
    ],
    npcs: [
      { x: 3, y: 2, dir: 'down', sprite: 'martell', name: 'Aryanne Sand', script: 'courtship',
        data: { match: 'aryanneMartell',
                line: "Aryanne Sand: I am a bastard of a bastard and have never once been ashamed of it." } },
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
      'I===cccXccccc==II',
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
      { x: 3, y: 2, dir: 'down', sprite: 'baratheon', name: 'Elena', script: 'courtship',
        data: { match: 'elenaBaratheon',
                line: "Elena: Everyone who comes to this castle wants something. You have not asked me for anything yet." } },
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
            helm: ['nasalHelm', 'kettleHat', 'bascinet'],
            gloves: ['mailMittens', 'splintedGauntlets'],
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
            helm: ['nasalHelm', 'kettleHat', 'bascinet'],
            gloves: ['mailMittens', 'splintedGauntlets'],
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
      'd.........d........d',
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
          { beast: 'palfrey', min: 8, max: 12, weight: 16 },
      { beast: 'ravenling', min: 8, max: 12, weight: 12 },
      { beast: 'boartusk', min: 9, max: 13, weight: 12 },
    ],
    warps: [
      { x: 10, y: 0, to: 'moatCailin', tx: 11, ty: 18, dir: 'up' },
      { x: 10, y: 24, to: 'riverrun', tx: 12, ty: 1, dir: 'down' },
      { x: 19, y: 12, to: 'bloodyGate', tx: 11, ty: 28, dir: 'right' },
      { x: 18, y: 20, to: 'theGreenFork', tx: 11, ty: 28, dir: 'right' },
      { x: 0, y: 12, to: 'ironCoast', tx: 11, ty: 1, dir: 'left' },
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
      { x: 3, y: 2, dir: 'down', sprite: 'tully', name: 'Jeyne', script: 'courtship',
        data: { match: 'jeyneTully',
                line: "Jeyne: Family, duty, honour, in that order. I should like to pick the family part myself." } },
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
          { beast: 'palfrey', min: 14, max: 18, weight: 16 },
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
      { x: 19, y: 17, to: 'roseroad', tx: 11, ty: 1, dir: 'right' },
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
      '#...%C....d....CC..#',
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
          { beast: 'palfrey', min: 20, max: 25, weight: 16 },
      { beast: 'falconet', min: 21, max: 26, weight: 12 },
      { beast: 'boartusk', min: 20, max: 24, weight: 12 },
    ],
    warps: [
      { x: 10, y: 0, to: 'lannisport', tx: 9, ty: 18, dir: 'up' },
      { x: 10, y: 22, to: 'kingsLanding', tx: 16, ty: 30, dir: 'up' },
      { x: 19, y: 14, to: 'stormlands', tx: 11, ty: 1, dir: 'right' },
      { x: 4, y: 15, to: 'hollowHill', tx: 8, ty: 15, dir: 'up' },
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
      { x: 2, y: 16, item: 'kingsRansom', count: 1, flag: 'item_kingsroad_ransom' },
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
    outsiders: [
      { dir: 'down', sprite: 'braavosi', name: 'A Bravo', script: 'duel',
        data: { duel: 'sellsword' } },
      { dir: 'down', sprite: 'merchant', name: 'A Canal Poler', script: 'townTalk',
        data: { line: 'A Canal Poler: There are no horses in Braavos. There is water, and there is me, and I am cheaper than a horse.' } },
    ],
    outskirts: OUTSKIRTS.canals, gate: 12,
    core: braavosCore,
    roof: 'G', ridge: 'g',
    dressing: [[9, 20, 'U'], [13, 23, 'U'], [4, 22, 'F'], [19, 22, 'F'],
               [10, 25, 'U'], [14, 19, 'F'], [3, 14, 'F'], [20, 14, 'F']],
    // Canals rather than walls, which is the one thing everybody knows
    // about Braavos and makes it read as somewhere else at a glance.
    name: 'Braavos', music: 'town', ground: 'stone', wall: '~', floor: 'o',
    npcs: [
      { x: 18, y: 6, dir: 'down', sprite: 'braavosi', name: 'Factor of the Iron Bank', script: 'deedBroker',
        data: { property: 'braavosCounting' } },
      { x: 3, y: 6, dir: 'down', name: 'Jaqen H\'ghar', sprite: 'braavosi',
        script: 'freeCityLocal', data: { line: "Jaqen H'ghar: A man was no one, and is someone again, "
          + 'and will be no one after. Valar morghulis.' } },
      { x: 5, y: 7, dir: 'down', name: 'Arya', sprite: 'girl',
        script: 'freeCityLocal', data: { line: 'Arya: I am no one. That is what they keep telling me. '
          + 'I am fairly sure I am still someone.' } },
      { x: 11, y: 15, dir: 'down', name: 'Iron Banker', sprite: 'merchant',
        script: 'shop', data: { line: 'Iron Banker: The Iron Bank will have its due. '
          + 'In the meantime, we also sell things.',
          stock: ['maesterKit', 'sigilBanner', 'warBanner', 'kingsguardBanner'] } },
      { x: 6, y: 20, dir: 'right', name: 'Water Dancer', sprite: 'braavosi',
        script: 'duel', data: { duel: 'syrio' } },
      { x: 17, y: 23, dir: 'left', name: 'Braavosi Bravo', sprite: 'sellsword',
        script: 'freeCityLocal', data: { line: 'Bravo: In Braavos we fight with the point. '
          + 'Hacking is for people who chop wood.' } },
    ],
    signs: [
      { x: 22, y: 12, text: 'THE CANALS\nA hundred islands and no ground between them.\nEverything here goes by water or it does not go.' },
      { x: 4, y: 4, text: 'THE HOUSE OF BLACK AND WHITE\nValar morghulis.\nThe door answers to two words and neither of them is a knock.' },
      { x: 19, y: 4, text: 'THE IRON BANK OF BRAAVOS\nThe Iron Bank will have its due.\nIt has outlived every king who decided otherwise.' },
      { x: 11, y: 4, text: 'THE SEALORD\u2019S PALACE\nBraavos has no king and never has.\nThe Titan is the wall, and it is out where you cannot see it.' }],
    warps: [
      { door: 'cellar', to: 'braavosCellar', tx: 6, ty: 8, dir: 'up' },
      { door: 'inn', to: 'braavosInn', tx: 6, ty: 10, dir: 'up' },
      { door: 'house', to: 'braavosHouse', tx: 6, ty: 10, dir: 'up' },
      { door: 'southGate', to: 'narrowSea', tx: 11, ty: 5, dir: 'down' },
      { door: 'northGate', to: 'sealordHold', tx: 11, ty: 20, dir: 'up' },
      { door: 'maester', to: 'houseOfBlackAndWhite', tx: 7, ty: 10, dir: 'up' },
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
      'IIIIII__IIIIII',
    ],
    npcs: [
      { x: 7, y: 5, dir: 'down', name: 'The Kindly Man', sprite: 'oldman',
        script: 'healer', data: { line: 'The Kindly Man: All men must serve. Shall I see to yours?' } },
    ],
    warps: [
      { x: 6, y: 11, to: 'braavos', tx: 6, ty: 7, dir: 'down' },
      { x: 7, y: 11, to: 'braavos', tx: 6, ty: 7, dir: 'down' },
    ],
  },

  pentos: makeTown({
    outsiders: [
      { dir: 'down', sprite: 'merchant', name: 'A Spice Factor', script: 'shopHint',
        data: { line: 'A Spice Factor: Pepper, saffron, cloves and things I will not name in front of a stranger. All of it came further than you did.' } },
      { dir: 'down', sprite: 'noble', name: 'A Magister\'s Man', script: 'townTalk',
        data: { line: 'A Magister\'s Man: Pentos has a prince. Every year they ask him to bless the fields, and every so often they cut his throat for a bad harvest.' } },
    ],
    outskirts: OUTSKIRTS.spiceMarket, gate: 13,
    quarter: 0,
    roof: 'Q', ridge: 'q', shut: ['hall', 'forge'],
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
    signs: [
      { x: 22, y: 12, text: 'THE SPICE MARKET\nPentos sells what everyone else grows.\nThat is the whole of the city, and it has made it very rich.' },{ x: 13, y: 10, text: 'PENTOS. NO WALLS WORTH THE NAME, AND NO NEED OF THEM YET.' }],
    warps: [
      { door: 'cellar', to: 'pentosCellar', tx: 6, ty: 8, dir: 'up' },
      { door: 'inn', to: 'pentosInn', tx: 6, ty: 10, dir: 'up' },
      { door: 'house', to: 'pentosHouse', tx: 6, ty: 10, dir: 'up' },
      { door: 'southGate', to: 'narrowSea', tx: 11, ty: 5, dir: 'down' },
      { door: 'northGate', to: 'cheesemongerHold', tx: 11, ty: 20, dir: 'up' },
      { door: 'keep', to: 'illyriosManse', tx: 7, ty: 10, dir: 'up' },
    ],
  }),

  volantis: makeTown({
    outsiders: [
      { dir: 'down', sprite: 'braavosi', name: 'A Tiger Cloak', script: 'townTalk',
        data: { line: 'A Tiger Cloak: Behind that wall live men who can trace their blood to Valyria. In front of it live the rest of us. Nobody crosses it.' } },
      { dir: 'down', sprite: 'smallfolk', name: 'A Marked Woman', script: 'townTalk',
        data: { line: 'A Marked Woman: Five slaves to every free man. You can read what a person does off their cheek here, which saves a good deal of conversation.' } },
    ],
    outskirts: OUTSKIRTS.blackWall, gate: 13,
    quarter: 1,
    roof: 'Q', ridge: 'q', shut: ['hall', 'forge'],
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
    signs: [
      { x: 22, y: 12, text: 'THE BLACK WALL\nTwo hundred feet high and fused from dragonstone.\nIt was old when Valyria fell.' },{ x: 13, y: 10, text: 'THE LONG BRIDGE. BUILT BY VALYRIA. NOBODY LEFT KNOWS HOW.' }],
    warps: [
      { door: 'cellar', to: 'volantisCellar', tx: 6, ty: 8, dir: 'up' },
      { door: 'inn', to: 'volantisInn', tx: 6, ty: 10, dir: 'up' },
      { door: 'house', to: 'volantisHouse', tx: 6, ty: 10, dir: 'up' },
      { door: 'southGate', to: 'narrowSea', tx: 11, ty: 5, dir: 'down' },
      { door: 'northGate', to: 'blackWallHold', tx: 11, ty: 20, dir: 'up' },
      { door: 'keep', to: 'templeOfRhllor', tx: 7, ty: 10, dir: 'up' },
    ],
  }),

  meereen: makeTown({
    outsiders: [
      { dir: 'down', sprite: 'unsullied', name: 'A Freed Spear', script: 'townTalk',
        data: { line: 'A Freed Spear: I was told I am free. I have not yet worked out what to do about it. In the meantime I stand here.' } },
      { dir: 'down', sprite: 'noble', name: 'A Son of the Harpy', script: 'duel',
        data: { duel: 'sellsword' } },
    ],
    outskirts: OUTSKIRTS.pyramids, gate: 13,
    quarter: 2,
    roof: 'Q', ridge: 'q', shut: ['hall', 'forge'],
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
    signs: [
      { x: 22, y: 12, text: 'THE GREAT PYRAMIDS\nEight hundred feet, and a family in every one.\nThe bricks are held together with blood, they say, and they may be right.' },{ x: 13, y: 10, text: 'THE GREAT PYRAMID OF MEEREEN. A DRAGON QUEEN SITS AT THE TOP OF IT.' }],
    warps: [
      { door: 'cellar', to: 'meereenCellar', tx: 6, ty: 8, dir: 'up' },
      { door: 'inn', to: 'meereenInn', tx: 6, ty: 10, dir: 'up' },
      { door: 'house', to: 'meereenHouse', tx: 6, ty: 10, dir: 'up' },
      { door: 'southGate', to: 'narrowSea', tx: 11, ty: 5, dir: 'down' },
      { door: 'northGate', to: 'fightingPits', tx: 11, ty: 20, dir: 'up' },
      { door: 'keep', to: 'greatPyramid', tx: 7, ty: 12, dir: 'up' },
    ],
  }),

  // Three rooms across the sea worth walking into, so a Free City is somewhere
  // you go rather than a postcard with four people standing in front of it.
  illyriosManse: {
    name: "Illyrio's Manse",
    indoor: true, music: 'town', ground: 'stone',
    tiles: [
      'IIIIIIIIIIIIIII',
      'I=cccccccccc==I',
      'I=cB======Bc==I',
      'I=c========c==I',
      'I=c==T==T==c==I',
      'I=c========c==I',
      'I=cF======Fc==I',
      'I=cccccccccc==I',
      'I=====KKK=====I',
      'I=============I',
      'IIIIIII_IIIIIII',
    ],
    warps: [{ x: 7, y: 10, to: 'pentos', tx: 7, ty: 15, dir: 'down' }],
    npcs: [
      { x: 7, y: 3, dir: 'down', sprite: 'merchant', name: 'Illyrio Mopatis', script: 'freeCityLocal',
        data: { line: 'Illyrio Mopatis: Sit. Eat. The candied figs are worth more than '
          + 'your sword and I will not hear otherwise.' } },
      { x: 4, y: 5, dir: 'right', sprite: 'guard', name: 'Ser Jorah', script: 'duel',
        data: { duel: 'bronn' } },
      { x: 10, y: 8, dir: 'left', sprite: 'merchant', name: 'Factor', script: 'shop',
        data: { line: 'Factor: Anything from anywhere, at a Pentoshi price.',
          stock: ['maesterKit', 'poppyMilk', 'weirwoodSap', 'kingsRansom', 'netTrap'] } },
    ],
    items: [
      { x: 2, y: 1, item: 'valyrianShard', count: 1, flag: 'item_illyrio_shard' },
    ],
  },

  templeOfRhllor: {
    name: 'The Temple of R\'hllor',
    indoor: true, music: 'hall', ground: 'stone',
    tiles: [
      'IIIIIIIIIIIIIII',
      'I=============I',
      'I===F=====F===I',
      'I=============I',
      'I==cccccccc===I',
      'I==cccFccccc==I',
      'I==cccccccc===I',
      'I=============I',
      'I===F=KKK=F===I',
      'I=============I',
      'IIIIIII_IIIIIII',
    ],
    warps: [{ x: 7, y: 10, to: 'volantis', tx: 7, ty: 15, dir: 'down' }],
    npcs: [
      { x: 7, y: 6, dir: 'down', sprite: 'redPriest', name: 'Kinvara', script: 'duel',
        data: { duel: 'redPriestess' } },
      { x: 4, y: 3, dir: 'right', sprite: 'redPriest', name: 'Red Priest', script: 'healer',
        data: { line: 'Red Priest: The night is dark and full of terrors. '
          + 'Come to the fire and be less afraid.' } },
      { x: 11, y: 8, dir: 'left', sprite: 'merchant', name: 'Temple Steward', script: 'shop',
        data: { line: 'Steward: Oil, resin, and things that burn a long time.',
          stock: ['maesterKit', 'poppyMilk', 'kingsRansom', 'warBanner'] } },
    ],
    items: [
      { x: 2, y: 1, item: 'fireblood', count: 1, flag: 'item_rhllor_blood' },
    ],
  },

  greatPyramid: {
    name: 'The Great Pyramid',
    indoor: true, music: 'hall', ground: 'stone',
    tiles: [
      'IIIIIIIIIIIIIII',
      'I=============I',
      'I=====FXF=====I',
      'I=============I',
      'I=c=========c=I',
      'I=c=========c=I',
      'I=====T=T=====I',
      'I=============I',
      'I=B=========B=I',
      'I=============I',
      'I=====KKK=====I',
      'I=============I',
      'IIIIII__IIIIIII',
    ],
    warps: [
      { x: 6, y: 12, to: 'meereen', tx: 7, ty: 15, dir: 'down' },
      { x: 7, y: 12, to: 'meereen', tx: 7, ty: 15, dir: 'down' },
    ],
    npcs: [
      { x: 7, y: 3, dir: 'down', sprite: 'targaryen', name: 'Daenerys Targaryen',
        script: 'duel', data: { duel: 'daenerys' } },
      { x: 4, y: 6, dir: 'right', sprite: 'unsullied', name: 'Grey Worm',
        script: 'duel', data: { duel: 'greyWorm' } },
      { x: 10, y: 6, dir: 'left', sprite: 'braavosi', name: 'Daario Naharis',
        script: 'duel', data: { duel: 'daario' } },
      { x: 10, y: 10, dir: 'left', sprite: 'merchant', name: 'Ghiscari Trader', script: 'shop',
        data: { line: 'Trader: The Queen has views about what may be sold. This is the rest.',
          stock: ['maesterKit', 'poppyMilk', 'kingsRansom', 'greatNet', 'kingsguardBanner'] } },
    ],
    items: [
      { x: 2, y: 1, item: 'dragonEgg', count: 1, flag: 'item_pyramid_egg' },
    ],
  },

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
        script: 'ship', data: { line: "Ship's Captain: I sail where the money is. Name a port." } },
      { x: 14, y: 8, dir: 'left', name: 'Deckhand', sprite: 'smallfolk',
        script: 'freeCityLocal', data: { line: 'Deckhand: Four days to Braavos with this wind. '
          + 'Longer if you keep asking.' } },
    ],
    signs: [{ x: 11, y: 6, text: 'SPEAK TO THE CAPTAIN TO NAME A PORT.' }],
    // The gangplank puts you back on the last shore you sailed from; the
    // captain's own passage list is what takes you anywhere new.
    warps: [{ x: 11, y: 3, to: 'kingsLanding', tx: 21, ty: 28, dir: 'down' }],
  },


  // ===================================================== the Iron Islands ==
  // The seventh kingdom. Greyjoy held a seat that was not on the cartridge: a
  // sworn ironborn began at Moat Cailin, in the Neck, in somebody else's bog.
  // The road west now runs out onto a stone coast, over three sea stacks joined
  // by rope bridges, and onto Pyke.
  ironCoast: makeRoute({
    seed: 0xA11E, spurs: 5, river: 21,
    name: 'The Stony Shore', ground: 'stone', wall: 'C', floor: 'o', grass: ',',
    music: 'wild',
    features: [
      { type: 'water', x: 2, y: 4, w: 4, h: 3 },
      { type: 'rubble', x: 17, y: 9, w: 4, h: 2 },
      { type: 'sand', x: 3, y: 24, w: 6, h: 3 },
      { type: 'water', x: 18, y: 25, w: 4, h: 3 },
    ],
    encounters: [
      { roamer: 'ironbornReaver', min: 22, max: 27, weight: 34 },
      { roamer: 'bandit', min: 21, max: 26, weight: 24 },
      { roamer: 'sellsword', min: 22, max: 27, weight: 20 },
      { beast: 'krakenling', min: 22, max: 27, weight: 18 },
      { beast: 'riverfry', min: 21, max: 25, weight: 16 },
      { beast: 'falconet', min: 22, max: 26, weight: 12 },
    ],
    warps: [
      { x: 11, y: 0, to: 'riverlands', tx: 1, ty: 12, dir: 'down' },
      { x: 11, y: 29, to: 'pykeBridge', tx: 8, ty: 1, dir: 'down' },
      { x: 4, y: 12, to: 'seaCave', tx: 8, ty: 15, dir: 'up', cave: true },
    ],
    signs: [
      { x: 9, y: 3, text: 'THE STONY SHORE\nWest to Pyke over the bridges.\nA sea cave gapes somewhere off the path.' },
    ],
    npcs: [
      { x: 8, y: 9, dir: 'down', sprite: 'ironborn', name: 'Reaver Dagmer', script: 'trainer',
        data: { trainer: 'ironReaver' } },
      { x: 14, y: 18, dir: 'left', sprite: 'ironborn', name: 'The Damphair', script: 'trainer',
        data: { trainer: 'drownedPriest' } },
      { x: 6, y: 25, dir: 'right', sprite: 'smallfolk', name: 'Salt Wife', script: 'shoreHint' },
    ],
    items: [
      { x: 4, y: 8, item: 'dragonglass', count: 2, flag: 'item_ironcoast_glass' },
      { x: 16, y: 22, item: 'weirwoodSap', count: 1, flag: 'item_ironcoast_sap' },
    ],
  }),

  // A smugglers' hole in the cliff, full of somebody else's cargo.
  seaCave: {
    name: "The Smugglers' Hole",
    indoor: true, music: 'wild', ground: 'cave',
    tiles: [
      '@@@@@@@@@@@@@@@@@',
      '@%%%%%%@@@%%%%%%@',
      '@%%@@%%@@@%%@@%%@',
      '@%%@@%%%%%%%@@%%@',
      '@%%%%%%%%%%%%%%%@',
      '@@@%%@@@%%%@@@%%@',
      '@%%%%@%%%%%%%%%%@',
      '@%%@@@%%@@@%%@@@@',
      '@%%%%%%%%@%%%%%%@',
      '@@@@%%@@@@%%%%@%@',
      '@%%%%%@%%%%%%%@%@',
      '@%%@%%@%%@@@%%%%@',
      '@%%@%%%%%@%%%%%@@',
      '@%%@@@@%%@%%@%%%@',
      '@%%%%%%%%%%%@@%%@',
      '@@@@@@@@%%@@@@@%@',
      '@@@@@@@@%%@@@@@@@',
    ],
    encounters: [
      { beast: 'krakenling', min: 24, max: 28, weight: 30 },
      { beast: 'sandviper', min: 23, max: 27, weight: 22 },
      { roamer: 'bandit', min: 24, max: 28, weight: 24 },
    ],
    warps: [
      { x: 8, y: 16, to: 'ironCoast', dir: 'down', back: true },
      { x: 9, y: 16, to: 'ironCoast', dir: 'down', back: true },
    ],
    npcs: [
      { x: 4, y: 6, dir: 'right', sprite: 'braavosi', name: 'Salladhor Saan', script: 'trainer',
        data: { trainer: 'smugglerCaptain' } },
      { x: 13, y: 12, dir: 'left', sprite: 'sellsword', name: 'Lookout', script: 'duel',
        data: { duel: 'bronn' } },
    ],
    signs: [
      { x: 3, y: 2, text: 'Crates. Somebody has painted over the marks on all of them.' },
    ],
    items: [
      { x: 2, y: 1, item: 'valyrianShard', count: 1, flag: 'item_seacave_shard' },
      { x: 14, y: 3, item: 'kingsRansom', count: 1, flag: 'item_seacave_ransom' },
      { x: 4, y: 14, item: 'dragonglass', count: 3, flag: 'item_seacave_glass' },
    ],
  },

  // Three sea stacks and the rope bridges between them, over open water and a
  // long drop. There is no other way onto Pyke.
  pykeBridge: {
    name: 'The Bridges of Pyke',
    music: 'wild', ground: 'stone',
    // Three sea stacks with two rope bridges between them. Everything here is
    // two tiles wide at its narrowest, because a bridge one tile across is a
    // bridge the first person standing on it closes: the audit walks this map
    // taking each person out in turn and asking what it strands.
    tiles: [
      '~~~~~~~~oo~~~~~~',
      '~~~~~oooooo~~~~~',
      '~~~~oo!ooooo~~~~',
      '~~~~oooooooo~~~~',
      '~~~~oommmmmmmm~~',
      '~~~~oommmmmmmm~~',
      '~~~~oooo~~~~ooo~',
      '~~~~oooo~~~~ooo~',
      '~~~~~~~~~~~~ooo~',
      '~~~~~~~~~~~oooo~',
      '~~~~~~~~~~~oojo~',
      '~~~~~mmmmmmoooo~',
      '~~~~~mmmmmmooo~~',
      '~~~oooooo~~~~~~~',
      '~~ooooooooo~~~~~',
      '~~ooooCoooo~~~~~',
      '~~~oooooooo~~~~~',
      '~~~~oooooo~~~~~~',
      '~~~~~oooo~~~~~~~',
      '~~~~~~oo~~~~~~~~',
    ],
    encounters: [
      { beast: 'falconet', min: 24, max: 28, weight: 26 },
      { beast: 'krakenling', min: 25, max: 29, weight: 24 },
      { roamer: 'ironbornReaver', min: 24, max: 29, weight: 30 },
    ],
    warps: [
      { x: 8, y: 0, to: 'ironCoast', tx: 11, ty: 28, dir: 'up' },
      { x: 9, y: 0, to: 'ironCoast', tx: 11, ty: 28, dir: 'up' },
      { x: 6, y: 19, to: 'pyke', tx: 12, ty: 1, dir: 'down' },
      { x: 7, y: 19, to: 'pyke', tx: 12, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 6, y: 2, text: 'THE BRIDGES OF PYKE\nWalk in the middle. The ropes are older than you are.' },
    ],
    npcs: [
      { x: 13, y: 9, dir: 'down', sprite: 'ironborn', name: 'Theon Greyjoy', script: 'duel',
        data: { duel: 'theonReturned' } },
      { x: 4, y: 16, dir: 'right', sprite: 'smallfolk', name: 'Bridgekeeper', script: 'bridgeHint' },
    ],
    items: [
      { x: 13, y: 10, item: 'greatNet', count: 1, flag: 'item_pykebridge_net' },
    ],
  },

  pyke: {
    name: 'Pyke', music: 'town', ground: 'stone',
    get tiles() { return pykePlan(); },
    encounters: [
      { roamer: 'ironbornReaver', min: 26, max: 34, weight: 60 },
      { roamer: 'sellsword', min: 26, max: 34, weight: 40 },
    ],
    warps: [
      { x: 4, y: 19, to: 'pykeCellar', tx: 6, ty: 8, dir: 'up' },
      { x: 27, y: 12, to: 'pykeInn', tx: 6, ty: 10, dir: 'up' },
      { x: 27, y: 21, to: 'pykeHouse', tx: 6, ty: 10, dir: 'up' },
      { x: 12, y: 0, to: 'pykeBridge', tx: 6, ty: 18, dir: 'up' },
      { x: 5, y: 12, to: 'maesterHallPyke', tx: 5, ty: 7, dir: 'up' },
      { x: 21, y: 12, to: 'pykeForge', tx: 5, ty: 6, dir: 'up' },
      { x: 12, y: 22, to: 'pykeKeep', tx: 7, ty: 12, dir: 'up' },
      { x: 12, y: 26, to: 'lordsportDocks', tx: 11, ty: 2, dir: 'down' },
    ],
    signs: [
      { x: 12, y: 21, text: 'THE GREAT KEEP\nSeat of House Greyjoy.\nWe Do Not Sow.' },
      { x: 12, y: 3, text: 'THE BRIDGE\nThe only one joined to land, and they watch it day and night.\nEverything else here you cross over water.' },
    ],
    npcs: [
      { x: 10, y: 5, dir: 'down', sprite: 'goodwife', name: 'A Woman of Fair Isle', script: 'quest',
        data: { quest: 'saltWivesOfPyke' } },
      { x: 11, y: 13, dir: 'down', sprite: 'ironborn', name: 'Yara Greyjoy',
        script: 'trainer', data: { trainer: 'gymGreyjoy' } },
      { x: 13, y: 17, dir: 'down', sprite: 'ironborn', name: 'Balon Greyjoy',
        script: 'duel', data: { duel: 'balon' } },
      { x: 10, y: 23, dir: 'up', sprite: 'goodwife', name: 'Salt Wife', script: 'pykeLocal',
        data: { line: 'Salt Wife: Rock wife or salt wife, the rock is the same. '
          + 'Cold, and it does not care.' } },
      { x: 28, y: 13, dir: 'left', sprite: 'child', name: 'Ironborn Boy', script: 'pykeLocal',
        data: { line: 'Ironborn Boy: I am going to be a captain. I have not been on a boat.' } },
      { x: 3, y: 13, dir: 'up', sprite: 'ironborn', name: 'Drowned Man', script: 'pykeLocal',
        data: { line: 'Drowned Man: We drown them and then we bring them back. '
          + 'Mostly we bring them back.' } },
    ],
  },

  maesterHallPyke: maesterHall({
    exitTo: 'pyke', exitX: 5, exitY: 13,
    stock: ['maesterKit', 'poppyMilk', 'weirwoodSap', 'snare', 'netTrap', 'sigilBanner'],
    healerLine: 'Maester Wendamyr: Salt in everything, including the wounds. '
      + 'Sit down and let me get at it.',
    merchantLine: 'Steward: What we have, we took. What we sell, we took twice.',
  }),

  pykeForge: {
    name: 'The Saltforge',
    indoor: true, music: 'town',
    tiles: [
      'IIIIIIIIIIII',
      'Ixx=a===l=lI',
      'I=====KKK==I',
      'I==========I',
      'I=a==h==a==I',
      'I==========I',
      'I=T=F==F=T=I',
      'IIIII__IIIII',
    ],
    warps: [
      { x: 5, y: 7, to: 'pyke', tx: 21, ty: 13, dir: 'down' },
      { x: 6, y: 7, to: 'pyke', tx: 21, ty: 13, dir: 'down' },
    ],
    npcs: [
      { x: 5, y: 1, dir: 'down', sprite: 'ironborn', name: 'Saltsmith', script: 'smith',
        data: {
          line: 'Saltsmith: Everything here rusts. So I make it heavy enough that '
            + 'it does not matter for a lifetime, and a lifetime here is short.',
          stock: {
            weapon: ['longsword', 'morningstar', 'warhammer', 'greatsword'],
            armour: ['ringmail', 'scaleArmour', 'splintMail'],
            helm: ['bascinet', 'greatHelm', 'sallet', 'armet'],
            gloves: ['splintedGauntlets', 'plateGauntlets'],
            shield: ['oakShield', 'ironboundShield', 'towerShield'],
          },
        } },
      { x: 3, y: 5, dir: 'right', sprite: 'ironborn', name: 'Hammerhand', script: 'bellowsHand',
        data: { line: 'Hammerhand: The iron price. You pay it, or somebody pays it for you.' } },
    ],
  },

  pykeKeep: {
    name: 'The Seastone Chair',
    indoor: true, music: 'hall', ground: 'stone',
    tiles: [
      'IIIIIIIIIIIIIII',
      'I=============I',
      'I=====FXF=====I',
      'I=============I',
      'I=B=========B=I',
      'I=============I',
      'I===T=====T===I',
      'I=============I',
      'I=v=========v=I',
      'I=============I',
      'I=====KKK=====I',
      'I=============I',
      'IIIIII__IIIIIII',
    ],
    warps: [
      { x: 6, y: 12, to: 'pyke', tx: 12, ty: 23, dir: 'down' },
      { x: 7, y: 12, to: 'pyke', tx: 12, ty: 23, dir: 'down' },
    ],
    npcs: [
      { x: 3, y: 2, dir: 'down', sprite: 'ironborn', name: 'Asha', script: 'courtship',
        data: { match: 'asharaGreyjoy',
                line: "Asha: I captain my own ship and I will go on captaining it. Say now if that is a difficulty." } },
      { x: 7, y: 3, dir: 'down', sprite: 'ironborn', name: 'Captain of the Iron Fleet',
        script: 'duel', data: { duel: 'euron' } },
      { x: 3, y: 6, dir: 'right', sprite: 'maester', name: 'Maester', script: 'healer',
        data: { line: 'Maester: The Seastone Chair is not comfortable. It was never meant to be.' } },
      { x: 10, y: 10, dir: 'left', sprite: 'merchant', name: 'Ship\'s Factor', script: 'shop',
        data: { line: 'Factor: Rope, tar, salt beef, and things nobody will admit to.',
          stock: ['maesterKit', 'poppyMilk', 'snare', 'netTrap', 'greatNet', 'warBanner'] } },
    ],
  },

  // The harbour under Pyke: longships, a quay, and a way east.
  lordsportDocks: {
    name: 'Lordsport',
    music: 'town', ground: 'stone',
    tiles: [
      '~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~oo~~~~~~~~~~~',
      '~~~~~~~~~~oooo~~~~~~~~~~',
      '~ooooooooooooooooooooo~~',
      '~oYYYo!ooooooooooYYYoo~~',
      '~oHwHooooooooooooHwHoo~~',
      '~ooooooooooooooooooooo~~',
      '~oo___________________~~',
      '~oo_~~~~~~~~~~~~~~~~~_~~',
      '~oo_~~~~~~~~~~~~~~~~~_~~',
      '~ooooooooooo_________~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~',
    ],
    encounters: [
      { roamer: 'ironbornReaver', min: 24, max: 29, weight: 30 },
    ],
    warps: [
      { x: 11, y: 2, to: 'pyke', tx: 12, ty: 25, dir: 'up' },
    ],
    signs: [
      { x: 6, y: 4, text: 'LORDSPORT\nThe fleet is out. It is always out.\nAsk the captain what a berth costs.' },
    ],
    npcs: [
      { x: 4, y: 7, dir: 'down', sprite: 'ironborn', name: 'Harbourmaster', script: 'ship',
        data: { line: 'Harbourmaster: Longships go where I say and come back when they like. '
          + 'Name a port.' } },
      { x: 18, y: 7, dir: 'down', sprite: 'merchant', name: 'Chandler', script: 'shop',
        data: { line: 'Chandler: Everything a ship needs and nothing a house does.',
          stock: ['maesterKit', 'poppyMilk', 'snare', 'netTrap', 'greatNet'] } },
      { x: 9, y: 6, dir: 'down', sprite: 'smallfolk', name: 'Netmender', script: 'pykeLocal',
        data: { line: 'Netmender: Mend a net, catch a fish. Mend a hundred, catch a hundred. '
          + 'It is not complicated work.' } },
    ],
    items: [
      { x: 20, y: 4, item: 'netTrap', count: 1, flag: 'item_lordsport_net' },
    ],
  },

  // ========================================================== the Dreadfort ==
  weepingWater: makeRoute({
    seed: 0xD3AD, spurs: 5, river: 16,
    name: 'The Weeping Water', ground: 'snow', wall: 'P', floor: 'S', grass: ';',
    music: 'wild',
    features: [
      { type: 'ice', x: 3, y: 6, w: 5, h: 2 },
      { type: 'ice', x: 15, y: 23, w: 5, h: 2 },
      { type: 'rubble', x: 17, y: 8, w: 3, h: 2 },
    ],
    encounters: [
      { roamer: 'manAtArms', min: 24, max: 29, weight: 30 },
      { roamer: 'deserter', min: 23, max: 28, weight: 26 },
      { roamer: 'poacher', min: 24, max: 28, weight: 20 },
      { beast: 'wightling', min: 24, max: 29, weight: 20 },
      { beast: 'direwolf', min: 24, max: 28, weight: 16 },
    ],
    warps: [
      { x: 11, y: 0, to: 'dreadfort', tx: 11, ty: 25, dir: 'up' },
      { x: 11, y: 29, to: 'winterfell', tx: 22, ty: 12, dir: 'down' },
    ],
    signs: [
      { x: 9, y: 4, text: 'THE WEEPING WATER\nNorth-east to the Dreadfort.\nSomebody has crossed out "welcome".' },
    ],
    npcs: [
      { x: 11, y: 5, dir: 'down', sprite: 'maester', name: 'Frightened Maester', script: 'quest',
        data: { quest: 'theBastardsLetter' } },
      { x: 8, y: 11, dir: 'right', sprite: 'bolton', name: 'Steward Walton', script: 'trainer',
        data: { trainer: 'boltonSteward' } },
      { x: 14, y: 22, dir: 'left', sprite: 'bolton', name: 'Kennelmaster', script: 'duel',
        data: { duel: 'reek' } },
    ],
    items: [
      { x: 5, y: 9, item: 'direwolfPelt', count: 2, flag: 'item_weeping_pelt' },
    ],
  }),

  dreadfort: makeTown({
    outsiders: [
      { dir: 'down', sprite: 'bolton', name: 'A Kennel Boy', script: 'townTalk',
        data: { line: 'A Kennel Boy: They are named after girls. He names them after the last one. You should not ask me anything else.' } },
      { dir: 'down', sprite: 'smallfolk', name: 'A Crow Counter', script: 'townTalk',
        data: { line: 'A Crow Counter: Nine on the posts this morning. There is no work to do here but count them, and I would rather not.' } },
    ],
    outskirts: OUTSKIRTS.flayedYard, gate: 13,
    quarter: 2,
    roof: 'Z', ridge: 'z', house: 'A', banner: 'v',
    name: 'The Dreadfort', music: 'town', ground: 'snow', wall: 'P', floor: 'S',
    dressing: [
      [3, 2, 'f'], [4, 2, 'f'], [19, 2, 'f'], [20, 2, 'f'],
      [3, 17, 'U'], [20, 17, 'U'], [2, 9, 'F'], [21, 9, 'F'],
    ],
    npcs: [
      { x: 11, y: 11, dir: 'down', sprite: 'bolton', name: 'Roose Bolton', script: 'trainer',
        data: { trainer: 'rooseBolton' } },
      { x: 15, y: 12, dir: 'left', sprite: 'bolton', name: 'Ramsay Bolton', script: 'duel',
        data: { duel: 'ramsay' } },
      { x: 8, y: 17, dir: 'up', sprite: 'smallfolk', name: 'Flayer', script: 'dreadfortLocal',
        data: { line: 'Flayer: A flayed man holds no secrets. Neither do the ones who watched.' } },
      { x: 16, y: 17, dir: 'up', sprite: 'goodwife', name: 'Kitchen Maid', script: 'dreadfortLocal',
        data: { line: 'Kitchen Maid: Do not ask what is in the pie. Do not ask.' } },
    ],
    signs: [
      { x: 22, y: 12, text: 'THE FLAYED YARD\nA very great many posts and nothing growing between them.\nThe crows here are fat and unafraid.' },
      { x: 11, y: 10, text: 'THE DREADFORT\nSeat of House Bolton.\nOur Blades are Sharp.' },
    ],
    warps: [
      { door: 'cellar', to: 'dreadfortCellar', tx: 6, ty: 8, dir: 'up' },
      { door: 'inn', to: 'dreadfortInn', tx: 6, ty: 10, dir: 'up' },
      { door: 'house', to: 'dreadfortHouse', tx: 6, ty: 10, dir: 'up' },
      { door: 'southGate', to: 'weepingWater', tx: 11, ty: 1, dir: 'down' },
      { door: 'northGate', to: 'kennelHold', tx: 11, ty: 20, dir: 'up' },
      { door: 'maester', to: 'maesterHallDreadfort', tx: 5, ty: 7, dir: 'up' },
      { door: 'forge', to: 'dreadfortForge', tx: 5, ty: 6, dir: 'up' },
      { door: 'keep', to: 'dreadfortKeep', tx: 7, ty: 12, dir: 'up' },
    ],
  }),

  maesterHallDreadfort: maesterHall({
    exitTo: 'dreadfort', exitX: 6, exitY: 7,
    stock: ['maesterKit', 'poppyMilk', 'weirwoodSap', 'kingsRansom', 'snare', 'warBanner'],
    healerLine: 'Maester Uthor: I mend what the household breaks. I am busy.',
    merchantLine: 'Steward: Take it and go. Lord Roose does not like people lingering.',
  }),

  dreadfortForge: {
    name: 'The Flayed Forge',
    indoor: true, music: 'town',
    tiles: [
      'IIIIIIIIIIII',
      'Ixx=a===l=lI',
      'I=====KKK==I',
      'I==========I',
      'I=a==h==a==I',
      'I==========I',
      'I=T=F==F=T=I',
      'IIIII__IIIII',
    ],
    warps: [
      { x: 5, y: 7, to: 'dreadfort', tx: 17, ty: 7, dir: 'down' },
      { x: 6, y: 7, to: 'dreadfort', tx: 17, ty: 7, dir: 'down' },
    ],
    npcs: [
      { x: 5, y: 1, dir: 'down', sprite: 'bolton', name: 'Bonewright', script: 'smith',
        data: {
          line: 'Bonewright: Sharp is a discipline. Everything else about this house '
            + 'is a hobby.',
          stock: {
            weapon: ['bastardSword', 'greatsword', 'warhammer', 'direWarhammer'],
            armour: ['splintMail', 'bandedMail', 'knightPlate'],
            helm: ['bascinet', 'greatHelm', 'sallet', 'armet'],
            gloves: ['splintedGauntlets', 'plateGauntlets'],
            shield: ['ironboundShield', 'kiteShield', 'towerShield'],
          },
        } },
      { x: 3, y: 5, dir: 'right', sprite: 'smallfolk', name: 'Apprentice', script: 'bellowsHand',
        data: { line: 'Apprentice: I keep the fire. I do not go upstairs. Ever.' } },
    ],
  },

  dreadfortKeep: {
    name: 'The Dreadfort Hall',
    indoor: true, music: 'hall', ground: 'stone',
    tiles: [
      'IIIIIIIIIIIIIII',
      'I=============I',
      'I=====FXF=====I',
      'I=============I',
      'I=v=========v=I',
      'I=============I',
      'I==T=======T==I',
      'I=============I',
      'I=B=========B=I',
      'I=============I',
      'I=====KKK=====I',
      'I=============I',
      'IIIIII__IIIIIII',
    ],
    warps: [
      { x: 6, y: 12, to: 'dreadfort', tx: 7, ty: 15, dir: 'down' },
      { x: 7, y: 12, to: 'dreadfort', tx: 7, ty: 15, dir: 'down' },
    ],
    npcs: [
      { x: 3, y: 2, dir: 'down', sprite: 'bolton', name: 'Domeric', script: 'courtship',
        data: { match: 'domericBolton',
                line: "Domeric: My family has a reputation, and I have spent nineteen years not being it." } },
      { x: 4, y: 6, dir: 'right', sprite: 'maester', name: 'Maester', script: 'healer',
        data: { line: 'Maester: I keep the ravens and I keep quiet. Both are a service.' } },
      { x: 10, y: 10, dir: 'left', sprite: 'merchant', name: 'Steward', script: 'shop',
        data: { line: 'Steward: The Dreadfort sells nothing it needs and needs very little.',
          stock: ['maesterKit', 'poppyMilk', 'kingsRansom', 'warBanner', 'kingsguardBanner'] } },
      { x: 7, y: 8, dir: 'down', sprite: 'bolton', name: 'Bastard\'s Man', script: 'duel',
        data: { duel: 'ramsay' } },
    ],
  },

  // =================================================== beyond the Wall =====
  // The Wall was a wall against a rumour. This is the rumour: a forest that
  // goes on past where the maps stop, a free folk host camped in it, and a
  // hill with something standing on it that dragonglass is the only answer to.
  hauntedForest: makeRoute({
    seed: 0x1CE0, spurs: 6,
    name: 'The Haunted Forest', ground: 'snow', wall: 'P', floor: 'S', grass: ';',
    music: 'wild',
    features: [
      { type: 'ice', x: 4, y: 8, w: 6, h: 3 },
      { type: 'ice', x: 14, y: 19, w: 5, h: 3 },
      { type: 'rubble', x: 6, y: 24, w: 4, h: 2 },
    ],
    encounters: [
      { roamer: 'wildlingRaider', min: 28, max: 33, weight: 30 },
      { roamer: 'spearwife', min: 28, max: 33, weight: 26 },
      { roamer: 'deserter', min: 27, max: 32, weight: 18 },
      { beast: 'wightling', min: 28, max: 33, weight: 24 },
      { beast: 'direwolf', min: 28, max: 32, weight: 20 },
      { beast: 'bearhold', min: 29, max: 33, weight: 14 },
    ],
    warps: [
      { x: 11, y: 29, to: 'beyondTheWall', tx: 11, ty: 1, dir: 'down' },
      { x: 11, y: 0, to: 'fistOfTheFirstMen', tx: 11, ty: 20, dir: 'up' },
    ],
    signs: [
      { x: 9, y: 26, text: 'A weirwood with a face cut into it.\nThe eyes have run, and not with sap.' },
    ],
    npcs: [
      { x: 8, y: 8, dir: 'right', sprite: 'wildlingWoman', name: 'Val', script: 'trainer',
        data: { trainer: 'spearwifeVal' } },
      { x: 14, y: 15, dir: 'left', sprite: 'wildling', name: 'Styr', script: 'trainer',
        data: { trainer: 'thennMagnar' } },
      { x: 10, y: 22, dir: 'down', sprite: 'wildling', name: 'Mance Rayder', script: 'duel',
        data: { duel: 'mance' } },
    ],
    items: [
      { x: 5, y: 12, item: 'dragonglass', count: 4, flag: 'item_haunted_glass' },
      { x: 16, y: 20, item: 'direwolfPelt', count: 3, flag: 'item_haunted_pelt' },
    ],
  }),

  fistOfTheFirstMen: {
    name: 'The Fist of the First Men',
    music: 'wild', ground: 'snow',
    tiles: [
      'PPPPPPPPPPPPPPPPPPPPPPPP',
      'PPPPPPCCCCCCCCCCPPPPPPPP',
      'PPPPCCiiiiiiiiiiCCPPPPPP',
      'PPPCCiiiiiiiiiiiiCCPPPPP',
      'PPCCiiiiCCCCCCiiiiCCPPPP',
      'PPCiiiiCCiiiiCCiiiiCPPPP',
      'PPCiiiCCiiiiiiCCiiiCPPPP',
      'PPCiiiCiiiiiiiiCiiiCPPPP',
      'PPCiiiCiiiiiiiiCiiiCPPPP',
      'PPCiiiCiiiiiiiiCiiiCPPPP',
      'PPCiiiCCiiiiiiCCiiiCPPPP',
      'PPCiiiiCCiiiiCCiiiiCPPPP',
      'PPCCiiiiCCiiCCiiiiCCPPPP',
      'PPPCCiiiiiiiiiiiiCCPPPPP',
      'PPPPCCiiiiiiiiiiCCPPPPPP',
      'PPPPPCCiiii!iiiCCPPPPPPP',
      'PPPPPPCCiiiiiiCCPPPPPPPP',
      'PPPPPPPCCiiiiCCPPPPPPPPP',
      'PPPPPPPPCCiiCCPPPPPPPPPP',
      'PPPPPPPPPPiiPPPPPPPPPPPP',
      'PPPPPPPPPPPiPPPPPPPPPPPP',
    ],
    encounters: [
      { beast: 'wightling', min: 32, max: 38, weight: 34 },
      { beast: 'barrowlord', min: 34, max: 39, weight: 24 },
      { beast: 'palewalker', min: 36, max: 40, weight: 10 },
      { roamer: 'deserter', min: 32, max: 37, weight: 14 },
    ],
    warps: [
      { x: 11, y: 20, to: 'hauntedForest', tx: 11, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 11, y: 15, text: 'A ring of stones older than the Wall.\nThe bodies inside it are arranged in a spiral.' },
    ],
    npcs: [
      { x: 11, y: 8, dir: 'down', sprite: 'whitewalker', name: 'The Night King',
        script: 'duel', data: { duel: 'nightKing' } },
      { x: 4, y: 8, dir: 'right', sprite: 'whitewalker', name: 'A Risen Man',
        script: 'duel', data: { duel: 'wightWalker' } },
      { x: 16, y: 8, dir: 'left', sprite: 'whitewalker', name: 'A Risen Man',
        script: 'duel', data: { duel: 'wightWalker' } },
      { x: 11, y: 13, dir: 'up', sprite: 'nightswatch', name: 'Jon Snow', script: 'duel',
        data: { duel: 'jonSnow' } },
    ],
    items: [
      { x: 4, y: 6, item: 'dragonglassDagger', count: 1, flag: 'item_fist_dagger' },
      { x: 18, y: 6, item: 'valyrianShard', count: 2, flag: 'item_fist_shard' },
    ],
  },

  // ============================================================ hideouts ====
  // Somewhere off every long road there is a hole in the ground with people in
  // it who did not expect company.
  hollowHill: {
    name: 'The Hollow Hill',
    indoor: true, music: 'wild', ground: 'cave',
    tiles: [
      '@@@@@@@@@@@@@@@@@@@',
      '@%%%%%%%%%%%%%%%%%@',
      '@%%@@@%%%F%%%@@@%%@',
      '@%%@@@%%%%%%%@@@%%@',
      '@%%%%%%%%%%%%%%%%%@',
      '@@@%%%@@@%%%@@@%%%@',
      '@%%%%%@%%%%%@%%%%%@',
      '@%%@%%@%%@%%@%%@%%@',
      '@%%@%%%%%@%%%%%@%%@',
      '@%%@@@%%@@@%%@@@%%@',
      '@%%%%%%%%%%%%%%%%%@',
      '@@@%%@@@%%%@@@%%@@@',
      '@%%%%%%%@%%%%%%%%%@',
      '@%%@@@%%@%%@@@%%%%@',
      '@%%%%%%%%%%%%%%@%%@',
      '@@@@@@@@%%@@@@@@@%@',
      '@@@@@@@@%%@@@@@@@@@',
    ],
    encounters: [
      { roamer: 'brotherhoodBowman', min: 24, max: 29, weight: 32 },
      { roamer: 'bandit', min: 23, max: 28, weight: 26 },
      { beast: 'emberwisp', min: 24, max: 28, weight: 18 },
    ],
    warps: [
      { x: 8, y: 16, to: 'kingsroad', tx: 4, ty: 16, dir: 'down' },
      { x: 9, y: 16, to: 'kingsroad', tx: 4, ty: 16, dir: 'down' },
    ],
    npcs: [
      { x: 9, y: 3, dir: 'down', sprite: 'redPriest', name: 'Thoros of Myr', script: 'trainer',
        data: { trainer: 'hollowBrother' } },
      { x: 4, y: 8, dir: 'right', sprite: 'brotherhood', name: 'Beric Dondarrion',
        script: 'duel', data: { duel: 'beric' } },
      { x: 14, y: 12, dir: 'left', sprite: 'brotherhood', name: 'Lem Lemoncloak',
        script: 'hideoutLocal', data: { line: 'Lem: We hang the ones who deserve it. '
          + 'The list is longer than the rope.' } },
    ],
    signs: [
      { x: 9, y: 2, text: 'A fire burning under a hill, and two hundred people around it.' },
    ],
    items: [
      { x: 2, y: 1, item: 'ancestralBlade', count: 1, flag: 'item_hollow_blade' },
      { x: 16, y: 1, item: 'kingsRansom', count: 2, flag: 'item_hollow_ransom' },
    ],
  },

  stoneCrypt: {
    name: 'The Roseroad Crypt',
    indoor: true, music: 'wild', ground: 'cave',
    tiles: [
      '@@@@@@@@@@@@@@@',
      '@%%%%%%%%%%%%%@',
      '@%@@@%%%%%@@@%@',
      '@%@@@%%%%%@@@%@',
      '@%%%%%%F%%%%%%@',
      '@@@%%@@@@@%%@@@',
      '@%%%%@%%%@%%%%@',
      '@%@%%@%%%@%%@%@',
      '@%@%%%%%%%%%@%@',
      '@%@@@%%@%%@@@%@',
      '@%%%%%%@%%%%%%@',
      '@@@@%%@@@%%@@@@',
      '@%%%%%%%%%%%%%@',
      '@@@@@@@%%@@@@@@',
      '@@@@@@@%%@@@@@@',
    ],
    encounters: [
      { roamer: 'gravedigger', min: 20, max: 25, weight: 30 },
      { beast: 'wightling', min: 20, max: 25, weight: 26 },
      { beast: 'sapling', min: 19, max: 24, weight: 18 },
    ],
    warps: [
      { x: 7, y: 14, to: 'roseroad', dir: 'down', back: true },
      { x: 8, y: 14, to: 'roseroad', dir: 'down', back: true },
    ],
    npcs: [
      { x: 7, y: 3, dir: 'down', sprite: 'oldman', name: 'Gravedigger', script: 'hideoutLocal',
        data: { line: 'Gravedigger: Big man came through. Did not say where he was going. '
          + 'Left the helm, though.' } },
      { x: 3, y: 8, dir: 'right', sprite: 'sellsword', name: 'Grave Robber', script: 'duel',
        data: { duel: 'bronn' } },
    ],
    signs: [
      { x: 7, y: 1, text: 'Names cut into the wall, all of them Tyrell, none of them recent.' },
    ],
    items: [
      { x: 2, y: 1, item: 'castleForged', count: 1, flag: 'item_crypt_sword' },
      { x: 12, y: 1, item: 'valyrianShard', count: 1, flag: 'item_crypt_shard' },
    ],
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
      { x: 14, y: 31, to: 'kingsroad', tx: 10, ty: 21, dir: 'up' },
      { x: 15, y: 31, to: 'kingsroad', tx: 10, ty: 21, dir: 'up' },
      { x: 16, y: 31, to: 'kingsroad', tx: 10, ty: 21, dir: 'up' },
      { x: 17, y: 31, to: 'kingsroad', tx: 10, ty: 21, dir: 'up' },
      { x: 6, y: 7, to: 'greatSept', tx: 8, ty: 9, dir: 'up' },
      { x: 25, y: 9, to: 'redKeep', tx: 8, ty: 21, dir: 'up' },
      { x: 6, y: 16, to: 'maesterHallKL', tx: 5, ty: 7, dir: 'up' },
      { x: 22, y: 16, to: 'klArmoury', tx: 5, ty: 6, dir: 'up' },
      { x: 27, y: 26, to: 'dragonpit', tx: 8, ty: 11, dir: 'up' },
      { x: 11, y: 21, to: 'fleaBottom', tx: 2, ty: 1, dir: 'down' },
    ],
    signs: [
      { x: 13, y: 11, text: "KING'S LANDING\nHalf a million people and one chair.\nMind your purse." },
      /* Signposts at both ends of the great way, because a city ten screens
         tall with one gate at the bottom of it needs to say so somewhere a
         player will actually be standing. */
      { x: 18, y: 11, text: 'THE GREAT WAY\nNorth: the Red Keep, and the Sept of Baelor.\nSouth: the market, the Mud Gate, and the road out.' },
      { x: 13, y: 20, text: 'THE HOOK\nStraight on, down the great way: the Mud Gate and the Kingsroad.\nRight, down the alleys: Flea Bottom.' },
      { x: 18, y: 26, text: 'THE MUD GATE\nAhead: out of the city, onto the Kingsroad.\nLeft, along the wharf: the harbourmaster, and a berth to anywhere.' },
      { x: 18, y: 20, text: 'THE HARBOUR ROAD\nThe Blackwater, and every hull on it.\nA captain will name you a price for Braavos.' },
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
      { x: 20, y: 30, dir: 'up', sprite: 'braavosi', name: 'Harbourmaster', script: 'ship',
        data: { line: 'Harbourmaster: Every hull on the Blackwater answers to this quay. '
          + 'Name a port and I will find you a berth.' } },
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
      { x: 9, y: 6, to: 'dragonstone', tx: 11, ty: 25, dir: 'up' },
    ],
    signs: [
      { x: 13, y: 12, text: 'THE MUD GATE\nA ferryman who does not give his name.\nHe will take you to the island, and he will not talk about it.' },
    ],
    npcs: [
      /* He is a ferryman. He had no way of ferrying anybody anywhere: the
         script he was given was the one the forge assistants use, so the only
         man on the quay said his line and stood there. */
      { x: 9, y: 5, dir: 'down', sprite: 'sellsword', name: 'Company Serjeant', script: 'quest',
        data: { quest: 'theSellswordsWage' } },
      { x: 8, y: 7, dir: 'up', sprite: 'braavosi', name: 'The Ferryman', script: 'ship',
        data: { line: 'The Ferryman: The island, then. Or further, if your purse runs to it. '
          + 'Say nothing to anyone about who rowed you.' } },
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
    get tiles() { return fleaBottomPlan(); },
    encounters: [
      { roamer: 'bandit', min: 28, max: 36, weight: 60 },
      { roamer: 'gravedigger', min: 28, max: 36, weight: 40 },
    ],
    warps: [
      { x: 1, y: 1, to: 'kingsLanding', tx: 11, ty: 20, dir: 'down' },
      { x: 28, y: 17, to: 'mudGate', tx: 18, ty: 5, dir: 'down' },
    ],
    signs: [
      { x: 12, y: 0, text: 'Somebody has scratched an arrow into the daub, and then scratched three more pointing other ways.' },
      { x: 19, y: 7, text: 'A pot the size of a bathtub, and nobody will say what went into it.\nA bowl is a copper. Nobody asks twice.' },
      { x: 12, y: 10, text: 'THE FLEA-CHANNEL\nEverything the city is finished with comes down here on its way to the bay.\nThere is one plank over it. Mind where you put your feet.' },
    ],
    npcs: [
      { x: 18, y: 6, dir: 'down', sprite: 'smallfolk', name: 'Bowl-of-Brown Man', script: 'bellowsHand',
        data: { line: 'Bowl-of-Brown Man: A copper the bowl. Do not ask what is in it and I will not have to lie to you.' } },
      { x: 9, y: 13, dir: 'down', sprite: 'smallfolk', name: 'Alley Knife', script: 'duel',
        data: { duel: 'alleyKnife' } },
      { x: 13, y: 9, dir: 'up', sprite: 'child', name: 'Barefoot Girl', script: 'bellowsHand',
        data: { line: 'Barefoot Girl: Follow the channel east and you come out by the Mud Gate. The gold cloaks have forgotten there is a way through.' } },
      { x: 19, y: 6, dir: 'down', sprite: 'oldman', name: 'Pot-Shop Cook', script: 'bellowsHand',
        data: { line: 'Pot-Shop Cook: Forty years I have kept that pot on the boil. It has never once been empty and never once been washed.' } },
      { x: 21, y: 8, dir: 'left', sprite: 'noble', name: 'Deed-Broker', script: 'deedBroker',
        data: { property: 'fleaRoom' } },
      { x: 18, y: 8, dir: 'up', sprite: 'smallfolk', name: 'A Man Not Buying Anything', abroad: 'night',
        script: 'townTalk',
        data: { line: 'A Man Not Buying Anything: You have been down here a while now. People notice a thing like that, and some of them charge for noticing.' } },
      { x: 25, y: 13, dir: 'left', sprite: 'goodwife', name: 'Washerwoman', abroad: 'day', script: 'bellowsHand',
        data: { line: 'Washerwoman: You want to keep your hand on your purse down here, and your purse where your hand is.' } },
    ],
  },

  /* ---------------------------------------------------- what you can buy --
     Five deeds, and not one of them asks your house. The interiors are small
     on purpose: a room you own outright is worth more than a hall somebody
     lends you, and the game should let you feel the difference between the
     nine-hundred-gold version and the twenty-two-thousand one. */
  propFleaRoom: {
    name: 'Your Room, Flea Bottom',
    indoor: true, music: 'town',
    tiles: [
      'IIIIIIIII',
      'I_b_____I',
      'I_______I',
      'I__T__j_I',
      'I_______I',
      'I_h_____I',
      'I_______I',
      'IIII__III',
    ],
    warps: [
      { x: 4, y: 7, to: 'fleaBottom', tx: 19, ty: 8, dir: 'down' },
      { x: 5, y: 7, to: 'fleaBottom', tx: 19, ty: 8, dir: 'down' },
    ],
    signs: [
      { x: 2, y: 0, text: 'Somebody who slept here before you scratched a tally into the beam.\nIt stops at forty-one.' },
    ],
    npcs: [
      { x: 3, y: 1, dir: 'down', sprite: 'child', name: 'Pot-Shop Boy', script: 'ownBed',
        data: { property: 'fleaRoom' } },
    ],
  },

  propRiverCottage: {
    name: 'Your Cottage, the Crossroads',
    indoor: true, music: 'town',
    tiles: [
      'IIIIIIIIIII',
      'I__b____B_I',
      'I_________I',
      'I__T___T__I',
      'I_________I',
      'I_h_____j_I',
      'I_________I',
      'I_________I',
      'IIIII__IIII',
    ],
    warps: [
      { x: 5, y: 8, to: 'theCrossroads', tx: 12, ty: 12, dir: 'down' },
      { x: 6, y: 8, to: 'theCrossroads', tx: 12, ty: 12, dir: 'down' },
    ],
    signs: [
      { x: 3, y: 0, text: 'A name and a date cut into the lintel, and a second name under it\nwith no date after it at all.' },
    ],
    npcs: [
      { x: 4, y: 1, dir: 'down', sprite: 'goodwife', name: 'Hired Girl', script: 'ownBed',
        data: { property: 'riverCottage' } },
    ],
  },

  propBraavosCounting: {
    name: 'Your Counting-House, Braavos',
    indoor: true, music: 'town',
    tiles: [
      'IIIIIIIIIIIII',
      'I_b____BBB__I',
      'I___________I',
      'I_KKKKK_____I',
      'I___________I',
      'I_j___T___j_I',
      'I___________I',
      'I_F_______F_I',
      'I___________I',
      'IIIIII__IIIII',
    ],
    warps: [
      { x: 6, y: 9, to: 'braavos', tx: 18, ty: 7, dir: 'down' },
      { x: 7, y: 9, to: 'braavos', tx: 18, ty: 7, dir: 'down' },
    ],
    signs: [
      { x: 5, y: 3, text: 'THE LEDGER\nEvery sum in it balances. The Iron Bank sent somebody once to check,\nand he is still here, and he still checks.' },
    ],
    npcs: [
      { x: 3, y: 1, dir: 'down', sprite: 'braavosi', name: 'Your Clerk', script: 'ownBed',
        data: { property: 'braavosCounting' } },
    ],
  },

  propValeWatchtower: {
    name: 'Your Watchtower, the Vale',
    indoor: true, music: 'town',
    tiles: [
      'IIIIIIIIIIIII',
      'I__b______l_I',
      'I___________I',
      'I_h_______j_I',
      'I___________I',
      'I____TTT____I',
      'I___________I',
      'I_F_______F_I',
      'I___________I',
      'I___________I',
      'IIIIII__IIIII',
    ],
    warps: [
      { x: 6, y: 10, to: 'theEyrie', tx: 11, ty: 22, dir: 'down' },
      { x: 7, y: 10, to: 'theEyrie', tx: 11, ty: 22, dir: 'down' },
    ],
    signs: [
      { x: 4, y: 0, text: 'THE BROKEN WATCHTOWER\nFour hundred years of garrisons have carved their names in this wall.\nThere is room left for one more.' },
    ],
    npcs: [
      { x: 5, y: 1, dir: 'down', sprite: 'oldman', name: 'Caretaker', script: 'ownBed',
        data: { property: 'valeWatchtower' } },
    ],
  },

  propDorneOrchard: {
    name: 'Your Orchard House, Dorne',
    indoor: true, music: 'town',
    tiles: [
      'IIIIIIIIIIIIIII',
      'I__b_______BB_I',
      'I_____________I',
      'I_h_________j_I',
      'I_____________I',
      'I___T_____T___I',
      'I_____________I',
      'I_j_________j_I',
      'I_____________I',
      'I_____________I',
      'IIIIIII__IIIIII',
    ],
    warps: [
      { x: 7, y: 10, to: 'sunspear', tx: 12, ty: 23, dir: 'down' },
      { x: 8, y: 10, to: 'sunspear', tx: 12, ty: 23, dir: 'down' },
    ],
    signs: [
      { x: 4, y: 0, text: 'THE ORCHARD HOUSE\nFour hundred trees, and a well that has not failed in ninety years.\nThe deed does not mention your father once.' },
    ],
    npcs: [
      { x: 5, y: 1, dir: 'down', sprite: 'martell', name: 'Orchard-Keeper', script: 'ownBed',
        data: { property: 'dorneOrchard' } },
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
  // ----------------------------------------- inns and common houses -----
  theEyrieInn: makeInn({
    town: 'theEyrie', name: 'The Gates of the Moon', region: 'The Vale',
    keeper: 'Mya Stone', keeperLine: 'Mya Stone: I take mules up that mountain and I bring them back. That is more than most men here manage.',
    drinkerLine: 'Drinker: Six hundred steps and they built an inn at the top. Somebody understood something.',
    fighter: 'Hedge Knight', fighterLine: 'bronn',
    stock: ['maesterKit', 'poppyMilk', 'weirwoodSap'],
  }),

  theEyrieHouse: makeCommonHouse({
    town: 'theEyrie', name: 'The Blue Lamp', region: 'The Vale',
    madam: 'Marei', madamLine: 'Marei: Up here the wind does the talking. Nobody minds a room with no window.',
    voices: [
      { who: 'Falconer', line: 'Falconer: The birds go where I send them and come back knowing things. I do not ask.' },
      { who: 'Stone Mason', line: 'Stone Mason: Six hundred steps. I cut two hundred of them and my father cut the rest.' },
      { who: 'Lord\'s Cousin', line: 'Lord\'s Cousin: As high as honour, they say. Nobody says how far the fall is.' },
    ],
  }),

  highgardenInn: makeInn({
    town: 'highgarden', name: 'The Rose and Thorn', region: 'The Reach',
    keeper: 'Goodwife Tarly', keeperLine: 'Goodwife Tarly: Bread, small beer and a bed with nothing living in it. That is the whole menu.',
    drinkerLine: 'Drinker: The Reach feeds the realm. The realm sends a thank-you note about once a century.',
    fighter: 'Tourney Knight', fighterLine: 'bronn',
    stock: ['maesterKit', 'poppyMilk', 'weirwoodSap'],
  }),

  highgardenHouse: makeCommonHouse({
    town: 'highgarden', name: 'The Gilded Bower', region: 'The Reach',
    madam: 'Alerie', madamLine: 'Alerie: Growing strong, my lord. Everybody grows strong here. It is the soil.',
    voices: [
      { who: 'Rose Girl', line: 'Rose Girl: The Queen of Thorns knows what happens in this room before it happens.' },
      { who: 'Vintner', line: 'Vintner: Arbor gold at the front and Arbor gold at the back, and they are not the same wine.' },
      { who: 'Second Son', line: 'Second Son: I have four older brothers. I am extremely good at cards.' },
    ],
  }),

  sunspearInn: makeInn({
    town: 'sunspear', name: 'The Shaded Court', region: 'Dorne',
    keeper: 'Areo\'s Widow', keeperLine: 'Areo\'s Widow: Sit in the shade. Drink the strong red. Nobody hurries in Dorne.',
    drinkerLine: 'Drinker: The heat is not the problem. The heat is honest. It is the shade you want to watch.',
    fighter: 'Sand Steed Rider', fighterLine: 'bronn',
    stock: ['maesterKit', 'poppyMilk', 'weirwoodSap'],
  }),

  sunspearHouse: makeCommonHouse({
    town: 'sunspear', name: 'The Water Gardens', region: 'Dorne',
    madam: 'Ellaria', madamLine: 'Ellaria: In Dorne we do not pretend. It saves everybody a great deal of time.',
    voices: [
      { who: 'Spear Maiden', line: 'Spear Maiden: Unbowed, unbent, unbroken. Also unmarried, and that is my own business.' },
      { who: 'Orphan of the Greenblood', line: 'Orphan: We live on the water. Nobody owns the water, whatever they write down.' },
      { who: 'Salty Dornishman', line: 'Salty Dornishman: Dorne was never conquered. We simply married everybody who tried.' },
    ],
  }),

  stormsEndInn: makeInn({
    town: 'stormsEnd', name: 'The Broken Anchor', region: 'The Stormlands',
    keeper: 'Widow Errol', keeperLine: 'Widow Errol: The roof has held four hundred years. Sit anywhere. It will hold tonight.',
    drinkerLine: 'Drinker: Ours is the fury. Mine is mostly at the weather.',
    fighter: 'Storm Knight', fighterLine: 'bronn',
    stock: ['maesterKit', 'poppyMilk', 'weirwoodSap'],
  }),

  stormsEndHouse: makeCommonHouse({
    town: 'stormsEnd', name: 'The Storm\'s Rest', region: 'The Stormlands',
    madam: 'Bess', madamLine: 'Bess: When it blows like this nobody goes home. That is not my doing, it is the wind\'s.',
    voices: [
      { who: 'Smuggler', line: 'Smuggler: Onions. That is all I brought in. Ask anybody.' },
      { who: 'Rain-Soaked Guard', line: 'Guard: Two shifts on that wall and I have forgotten what dry feels like.' },
      { who: 'Maester\'s Boy', line: 'Maester\'s Boy: He says the storms here are older than the castle. I say the castle agrees.' },
    ],
  }),

  dragonstoneInn: makeInn({
    town: 'dragonstone', name: 'The Black Sail', region: 'Dragonstone',
    keeper: 'Fisher\'s Wife', keeperLine: 'Fisher\'s Wife: Fish, black bread, and whatever the mountain has coughed up this week.',
    drinkerLine: 'Drinker: The stone here is warm at the bottom. Nobody has ever explained that to my satisfaction.',
    fighter: 'Dragonstone Man', fighterLine: 'bronn',
    stock: ['maesterKit', 'poppyMilk', 'weirwoodSap'],
  }),

  dragonstoneHouse: makeCommonHouse({
    town: 'dragonstone', name: 'The Smoking Glass', region: 'Dragonstone',
    madam: 'Kyra', madamLine: 'Kyra: The red woman burns things on the beach and everybody watches. We are the quieter entertainment.',
    voices: [
      { who: 'Glass Candler', line: 'Glass Candler: Obsidian off the Dragonmont. It cuts things nothing else touches.' },
      { who: 'Ferryman', line: 'Ferryman: Nobody advertises the crossing. That is the arrangement.' },
      { who: 'Old Valyrian', line: 'Old Valyrian: My family came here before the Doom. We have been waiting ever since.' },
    ],
  }),

  braavosInn: makeInn({
    town: 'braavos', name: 'The Ship', region: 'Braavos',
    keeper: 'Meralyn', keeperLine: 'Meralyn: Eat. Drink. Do not ask what the Titan is for, everybody asks and nobody likes the answer.',
    drinkerLine: 'Drinker: Valar morghulis. Valar dohaeris. And valar pay for their own wine.',
    fighter: 'Bravo', fighterLine: 'syrio',
    stock: ['maesterKit', 'poppyMilk', 'weirwoodSap'],
  }),

  braavosHouse: makeCommonHouse({
    town: 'braavos', name: 'The Happy Port', region: 'Braavos',
    madam: 'The Sailor\'s Wife', madamLine: 'The Sailor\'s Wife: I only lie with men who marry me. I have been married a great many times.',
    voices: [
      { who: 'Lanna', line: 'Lanna: The Iron Bank owns everything here except this room, and they are working on it.' },
      { who: 'Mummer', line: 'Mummer: We do the whole history of Westeros in an hour. It is mostly people falling over.' },
      { who: 'Keyholder', line: 'Keyholder: Braavos has no lords. It has men who behave exactly like lords and are called something else.' },
    ],
  }),

  pentosInn: makeInn({
    town: 'pentos', name: 'The Cheesemonger', region: 'Pentos',
    keeper: 'Vala', keeperLine: 'Vala: Everything here is honeyed, spiced or both. That includes the conversation.',
    drinkerLine: 'Drinker: Pentos has a prince. Every year they ask him if the harvest was good. It had better have been.',
    fighter: 'Sellsword', fighterLine: 'bronn',
    stock: ['maesterKit', 'poppyMilk', 'weirwoodSap'],
  }),

  pentosHouse: makeCommonHouse({
    town: 'pentos', name: 'The Silk House', region: 'Pentos',
    madam: 'Doreah', madamLine: 'Doreah: I was taught in the pleasure houses of Lys. Pentos is a step down and it pays better.',
    voices: [
      { who: 'Spice Girl', line: 'Spice Girl: Illyrio buys everything. Cheese, silk, kings. Mostly in that order.' },
      { who: 'Dothraki', line: 'Dothraki: A man who walks is a man with nothing under him. You all walk.' },
      { who: 'Magister', line: 'Magister: We have no walls. We simply pay whoever brings an army. It is cheaper than walls.' },
    ],
  }),

  volantisInn: makeInn({
    town: 'volantis', name: 'The Long Bridge', region: 'Volantis',
    keeper: 'Kinvara\'s Cousin', keeperLine: 'Kinvara\'s Cousin: The fire is lit, the pot is on and the night is dark. Sit down.',
    drinkerLine: 'Drinker: The bridge has been standing a thousand years and I still walk in the middle of it.',
    fighter: 'Tiger Cloak', fighterLine: 'bronn',
    stock: ['maesterKit', 'poppyMilk', 'weirwoodSap'],
  }),

  volantisHouse: makeCommonHouse({
    town: 'volantis', name: 'The Merling King', region: 'Volantis',
    madam: 'Sunset', madamLine: 'Sunset: Old Volantis, they call it. Old is a polite word for what it is.',
    voices: [
      { who: 'Slave\'s Daughter', line: 'Slave\'s Daughter: You can tell what a man does by his cheek. Mine is a teardrop. That is a slave.' },
      { who: 'Elephant Voter', line: 'Elephant Voter: Tigers want war, elephants want trade. The elephants have won every year of my life.' },
      { who: 'Widow of the Waterfront', line: 'Widow: Nobody leaves Volantis on my river without me knowing why.' },
    ],
  }),

  meereenInn: makeInn({
    town: 'meereen', name: 'The Broken Pyramid', region: 'Meereen',
    keeper: 'Missandei\'s Aunt', keeperLine: 'Missandei\'s Aunt: The Queen has views about what may be sold. Food is still allowed.',
    drinkerLine: 'Drinker: They freed us. Nobody has yet explained what we are supposed to eat.',
    fighter: 'Pit Fighter', fighterLine: 'greyWorm',
    stock: ['maesterKit', 'poppyMilk', 'weirwoodSap'],
  }),

  meereenHouse: makeCommonHouse({
    town: 'meereen', name: 'The Fighting Pits', region: 'Meereen',
    madam: 'Rhaella', madamLine: 'Rhaella: The pits are shut and everybody misses them and nobody will say so.',
    voices: [
      { who: 'Freedman', line: 'Freedman: I was a bedslave. Now I am a man with no work. Both are complicated.' },
      { who: 'Harpy\'s Man', line: 'Harpy\'s Man: The Sons come at night. You did not hear that from me.' },
      { who: 'Ghiscari Noble', line: 'Ghiscari Noble: Old Ghis was an empire when Valyria was a village. We remember.' },
    ],
  }),

  pykeInn: makeInn({
    town: 'pyke', name: 'The Drowned Man', region: 'The Iron Islands',
    keeper: 'Gwin', keeperLine: 'Gwin: Fish, ale, and a roof that mostly stays on. That is the whole of it.',
    drinkerLine: 'Drinker: What is dead may never die. What is drowned mostly does, whatever the priest says.',
    fighter: 'Reaver', fighterLine: 'bronn',
    stock: ['maesterKit', 'poppyMilk', 'weirwoodSap'],
  }),

  pykeHouse: makeCommonHouse({
    town: 'pyke', name: 'The Salt Wife', region: 'The Iron Islands',
    madam: 'Esgred', madamLine: 'Esgred: Rock wife or salt wife, we all end up looking at the same sea.',
    voices: [
      { who: 'Captain\'s Girl', line: 'Captain\'s Girl: He pays the iron price for everything except me. That took some arranging.' },
      { who: 'Netmender', line: 'Netmender: Mend a net, catch a fish. Mend a hundred, catch a hundred. Simple work.' },
      { who: 'Thrall', line: 'Thrall: They took me off a green shore. I have stopped counting the years.' },
    ],
  }),

  dreadfortInn: makeInn({
    town: 'dreadfort', name: 'The Flayed Man', region: 'The North',
    keeper: 'Goodwife Ryswell', keeperLine: 'Goodwife Ryswell: Eat what is put in front of you and do not ask about it. Truly.',
    drinkerLine: 'Drinker: Quiet land, quiet people. That is what Lord Roose says. He says it a lot.',
    fighter: 'Bolton Man', fighterLine: 'bronn',
    stock: ['maesterKit', 'poppyMilk', 'weirwoodSap'],
  }),

  dreadfortHouse: makeCommonHouse({
    town: 'dreadfort', name: 'The Kennel Row', region: 'The North',
    madam: 'Myranda', madamLine: 'Myranda: Everyone here is very careful. It gets tiring. Be careless with me.',
    voices: [
      { who: 'Kennel Girl', line: 'Kennel Girl: The girls are named after the last ones. There have been a lot of last ones.' },
      { who: 'Steward\'s Son', line: 'Steward\'s Son: I keep the accounts. I have learned to write very small numbers.' },
      { who: 'Northman', line: 'Northman: The North remembers. The Dreadfort remembers differently and writes it down.' },
    ],
  }),

  // ------------------------------------------ what is under the towns ----
  theEyrieCellar: makeCellar({
    town: 'theEyrie', name: 'Falcon Cellar',
    keeper: 'Sky Cell Keeper', keeperDuel: 'bronn',
    line: 'Cellarman: The sky cells are up there. This is the other kind of hole.',
    loot: [
      { x: 2, y: 1, item: 'valyrianShard', count: 1, flag: 'item_eyrie_shard' },
      { x: 10, y: 1, item: 'shadeOfTheEvening', count: 1, flag: 'item_eyrie_shade' },
    ],
  }),

  highgardenCellar: makeCellar({
    town: 'highgarden', name: 'Rose Cellar',
    keeper: 'Vintner-at-Arms', keeperDuel: 'bronn',
    line: 'Cellarman: Three hundred casks and one of them is not wine.',
    loot: [
      { x: 2, y: 1, item: 'weirwoodPaste', count: 1, flag: 'item_hg_paste' },
      { x: 10, y: 1, item: 'huntersDraught', count: 1, flag: 'item_hg_draught' },
    ],
  }),

  sunspearCellar: makeCellar({
    town: 'sunspear', name: 'Sand Vault',
    keeper: 'Shadow City Man', keeperDuel: 'bronn',
    line: 'Cellarman: Cool down here. That is the whole of why Dorne digs.',
    loot: [
      { x: 2, y: 1, item: 'wildfire', count: 1, flag: 'item_ss_fire' },
      { x: 10, y: 1, item: 'valyrianShard', count: 1, flag: 'item_ss_shard' },
    ],
  }),

  stormsEndCellar: makeCellar({
    town: 'stormsEnd', name: 'Storm Cellar',
    keeper: 'Storm Sergeant', keeperDuel: 'bronn',
    line: 'Cellarman: Four hundred years of weather and this room has never been wet.',
    loot: [
      { x: 2, y: 1, item: 'maestersSalts', count: 1, flag: 'item_se_salts' },
      { x: 10, y: 1, item: 'warhorn', count: 1, flag: 'item_se_horn' },
    ],
  }),

  dragonstoneCellar: makeCellar({
    town: 'dragonstone', name: 'The Glass Vault',
    keeper: 'Dragonstone Man', keeperDuel: 'bronn',
    line: 'Cellarman: Obsidian, all of it, and the mountain keeps making more.',
    loot: [
      { x: 2, y: 1, item: 'dragonglass', count: 1, flag: 'item_ds_glass' },
      { x: 10, y: 1, item: 'dragonHorn', count: 1, flag: 'item_ds_horn' },
    ],
  }),

  braavosCellar: makeCellar({
    town: 'braavos', name: 'The Iron Vault',
    keeper: 'Bank Guard', keeperDuel: 'syrio',
    line: 'Cellarman: The Iron Bank owns what is in here. It also owns what is not.',
    loot: [
      { x: 2, y: 1, item: 'valyrianMesh', count: 1, flag: 'item_br_mesh' },
      { x: 10, y: 1, item: 'kingsRansom', count: 1, flag: 'item_br_ransom' },
    ],
  }),

  pentosCellar: makeCellar({
    town: 'pentos', name: 'Spice Cellar',
    keeper: 'Cheesemonger Man', keeperDuel: 'bronn',
    line: 'Cellarman: Cheese at the front, and behind it the reason for the cheese.',
    loot: [
      { x: 2, y: 1, item: 'shadeOfTheEvening', count: 1, flag: 'item_pe_shade' },
      { x: 10, y: 1, item: 'huntersDraught', count: 1, flag: 'item_pe_draught' },
    ],
  }),

  volantisCellar: makeCellar({
    town: 'volantis', name: 'Temple Vault',
    keeper: 'Tiger Cloak', keeperDuel: 'bronn',
    line: 'Cellarman: The fire wants feeding and this is what it is fed.',
    loot: [
      { x: 2, y: 1, item: 'wildfire', count: 1, flag: 'item_vo_fire' },
      { x: 10, y: 1, item: 'fireblood', count: 1, flag: 'item_vo_blood' },
    ],
  }),

  meereenCellar: makeCellar({
    town: 'meereen', name: 'Pyramid Vault',
    keeper: 'Harpy\'s Man', keeperDuel: 'greyWorm',
    line: 'Cellarman: Old Ghis buried its rich. Somebody has been unburying them.',
    loot: [
      { x: 2, y: 1, item: 'dragonchain', count: 1, flag: 'item_me_chain' },
      { x: 10, y: 1, item: 'valyrianShard', count: 1, flag: 'item_me_shard' },
    ],
  }),

  pykeCellar: makeCellar({
    town: 'pyke', name: 'The Drowned Vault',
    keeper: 'Reaver Captain', keeperDuel: 'bronn',
    line: 'Cellarman: Everything down here was paid for at the iron price. Twice.',
    loot: [
      { x: 2, y: 1, item: 'greatNet', count: 1, flag: 'item_py_net' },
      { x: 10, y: 1, item: 'valyrianMesh', count: 1, flag: 'item_py_mesh' },
    ],
  }),

  dreadfortCellar: makeCellar({
    town: 'dreadfort', name: 'The Kennel Vault',
    keeper: 'Bolton Man', keeperDuel: 'ramsay',
    line: 'Cellarman: Lord Roose keeps his accounts down here. And other things.',
    loot: [
      { x: 2, y: 1, item: 'weirwoodPaste', count: 1, flag: 'item_df_paste' },
      { x: 10, y: 1, item: 'valyrianShard', count: 1, flag: 'item_df_shard' },
    ],
  }),

  redKeep: {
    name: 'The Red Keep',
    indoor: true,
    music: 'town',
    /* The Iron Throne itself. Once it is yours, standing in front of it and
       pressing A is how you hold court, which is the whole of what there is to
       do after the crowning. */
    court: { x: 9, y: 3 },
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

  maesterHallEastwatch: maesterHall({
    exitTo: 'eastwatch', exitX: 6, exitY: 7,
    stock: ['maesterKit', 'poppyMilk', 'frostTonic', 'weirwoodSap', 'kissOfFire'],
    healerLine: 'You are cold all the way through. Sit by it a while.',
    merchantLine: 'Watch stores. Everything here is issued, and I am pretending it is sold.',
  }),

  eastwatchArmoury: {
    name: 'The Eastwatch Armoury',
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
      { x: 5, y: 7, to: 'eastwatch', tx: 17, ty: 7, dir: 'down' },
      { x: 6, y: 7, to: 'eastwatch', tx: 17, ty: 7, dir: 'down' },
    ],
    npcs: [
      { x: 5, y: 1, dir: 'down', sprite: 'nightswatch', name: 'Watch Armourer', script: 'smith',
        data: {
          line: 'Watch Armourer: Black, and it fits nobody. Take what you can carry.',
          stock: {
            weapon: ['ironSword', 'longsword', 'boarSpear', 'castleForged'],
            armour: ['ringmail', 'scaleArmour', 'bandedMail'],
            helm: ['kettleHat', 'bascinet', 'greatHelm'],
            gloves: ['mailMittens', 'splintedGauntlets'],
            shield: ['oakShield', 'ironboundShield'],
          },
        } },
    ],
  },

  eastwatchKeep: {
    name: 'The Shieldhall',
    indoor: true, music: 'town',
    tiles: [
      'IIIIIIIIIIIIIIIII',
      'I==============II',
      'I===cccccccc===II',
      'I===cccXccccc==II',
      'I===cccccccc===II',
      'I=B============II',
      'I=B====TT======II',
      'I======TT======II',
      'I==============II',
      'IIIIIII__IIIIIIII',
    ],
    warps: [
      { x: 7, y: 9, to: 'eastwatch', tx: 7, ty: 15, dir: 'down' },
      { x: 8, y: 9, to: 'eastwatch', tx: 7, ty: 15, dir: 'down' },
    ],
    npcs: [
      { x: 9, y: 2, dir: 'down', sprite: 'nightswatch', name: 'The Lord Commander',
        script: 'duel', data: { duel: 'manAtArms', host: 4 } },
      { x: 6, y: 4, dir: 'down', sprite: 'maester', name: 'Maester Harmune',
        script: 'healer',
        data: { line: 'Maester Harmune: I wrote the raven you are carrying. '
          + 'I signed it, which was the only part that took courage.' } },
      { x: 3, y: 7, dir: 'right', sprite: 'nightswatch', name: 'Ranger', script: 'duel',
        data: { duel: 'deserter' } },
    ],
  },

  eastwatchInn: makeInn({
    town: 'eastwatch', name: 'The Last Warm Room', region: 'The Wall',
    keeper: 'Old Flea', keeperLine: 'Old Flea: Bed, broth, and no questions about the coast road.',
    drinkerLine: 'Drinker: Three ships due in this month. None of them came.',
    fighter: 'Sealed Brother', fighterLine: 'bronn',
    stock: ['maesterKit', 'frostTonic', 'poppyMilk'],
  }),

  eastwatchHouse: makeCommonHouse({
    town: 'eastwatch', name: 'The Salt House', region: 'The Wall',
    madam: 'Wenda', madamLine: 'Wenda: Black brothers are not supposed to come here. They come here.',
    voices: [
      { who: 'Sailor', line: 'Sailor: I have been up that coast. I will not go again for any money you have.' },
      { who: 'Steward', line: 'Steward: We keep counting the stores as if the counting were the problem.' },
      { who: 'Wildling Girl', line: 'Wildling Girl: Your side of the Wall is not safer. It is only further away.' },
    ],
  }),

  eastwatchCellar: makeCellar({
    town: 'eastwatch', name: 'The Ice Cellar',
    keeper: 'Watch Steward', keeperDuel: 'deserter',
    line: 'Cellarman: Whatever they bring back from up the coast, it comes down here first.',
    loot: [
      { x: 2, y: 1, item: 'dragonglass', count: 2, flag: 'item_ew_glass' },
      { x: 10, y: 1, item: 'maestersSalts', count: 1, flag: 'item_ew_salts' },
    ],
  }),

  /* ------------------------------------------------------- the river road ---
     The Riverlands had six maps and it is the crossroads of the continent.
     Three places everybody in this story passes through at least once: the
     bridge the Freys charge for, the inn where the roads meet, and the ruin
     that nobody who has held it has died well. */

  theGreenFork: makeRoute({
    seed: 0x6F0C, spurs: 5, river: 17,
    name: 'The Green Fork', ground: 'grass', wall: '#', floor: '.',
    music: 'route',
    features: [
      { type: 'water', x: 3, y: 6, w: 5, h: 3 },
      { type: 'flowers', x: 15, y: 10, w: 4, h: 2 },
      { type: 'rubble', x: 5, y: 22, w: 4, h: 2 },
    ],
    encounters: [
      { roamer: 'bandit', min: 10, max: 15, weight: 30 },
      { roamer: 'brotherhoodBowman', min: 11, max: 16, weight: 26 },
      { roamer: 'manAtArms', min: 10, max: 15, weight: 22 },
      { beast: 'riverfry', min: 10, max: 14, weight: 18 },
      { beast: 'palfrey', min: 10, max: 15, weight: 16 },
    ],
    warps: [
      { x: 11, y: 29, to: 'riverlands', tx: 18, ty: 20, dir: 'down' },
      { x: 11, y: 0, to: 'theTwins', tx: 11, ty: 20, dir: 'up' },
    ],
    signs: [
      { x: 9, y: 6, text: 'THE GREEN FORK\nNorth to the Twins.\nThe crossing is not free and never has been.' },
    ],
    npcs: [
      { x: 8, y: 14, dir: 'right', sprite: 'tully', name: 'River Serjeant',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 15, y: 20, dir: 'left', sprite: 'smallfolk', name: 'Ferryman',
        script: 'hideoutLocal',
        data: { line: 'Ferryman: I would row you across for a copper, but the Freys '
          + 'own the water as well as the bridge, and they count boats.' } },
    ],
    items: [
      { x: 6, y: 11, item: 'greenbriar', count: 3, flag: 'item_greenfork_briar' },
      { x: 16, y: 25, item: 'huntersDraught', count: 1, flag: 'item_greenfork_draught' },
    ],
  }),

  /* The Twins. Two castles and the only bridge for a hundred leagues, and a
     family whose entire fortune is that fact. */
  theTwins: {
    name: 'The Twins',
    music: 'town', ground: 'grass', wall: '#',
    tiles: [
      '########################',
      '#......................#',
      '#..MMMMM........MMMMM..#',
      '#..AAAAA........AAAAA..#',
      '#..AAVAA........AAVAA..#',
      '#..AAAAA........AAAAA..#',
      '#..AADAA........AADAA..#',
      '#....-..............-..#',
      '#....-..............-..#',
      '#....----------------..#',
      '#.......-..............#',
      '#~~~~~~~t~~~~~~~~~~~~~~#',
      '#~~~~~~~t~~~~~~~~~~~~~~#',
      '#.......-..............#',
      '#....----------------..#',
      '#....-..............-..#',
      '#..AADAA........AAAAA..#',
      '#..AAAAA........AAVAA..#',
      '#..AAVAA........AAAAA..#',
      '#..AAAAA........AAAAA..#',
      '#..MMMMM........MMMMM..#',
      '#..........-...........#',
      '###########-############',
    ],
    encounters: [],
    warps: [
      { x: 11, y: 22, to: 'theGreenFork', tx: 11, ty: 1, dir: 'down' },
      { x: 5, y: 6, to: 'twinsHall', tx: 8, ty: 9, dir: 'up' },
      { x: 18, y: 6, to: 'maesterHallTwins', tx: 5, ty: 7, dir: 'up' },
      { x: 5, y: 16, to: 'theCrossroads', tx: 11, ty: 1, dir: 'up' },
    ],
    signs: [
      { x: 10, y: 10, text: 'THE TWINS\nTwo castles, one bridge, and a toll.\nHouse Frey has grown very large on a very small idea.' },
      { x: 12, y: 13, text: 'The bridge is older than the castles.\nNobody knows who built it and the Freys do not encourage asking.' },
    ],
    npcs: [
      { x: 9, y: 10, dir: 'down', sprite: 'noble', name: 'Toll Collector',
        script: 'duel', data: { duel: 'manAtArms', host: 3 } },
      { x: 14, y: 13, dir: 'left', sprite: 'guard', name: 'Bridge Guard',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 8, y: 21, dir: 'up', sprite: 'goodwife', name: 'Frey Daughter',
        script: 'hideoutLocal',
        data: { line: 'Frey Daughter: There are a great many of us. '
          + 'Grandfather counts us the way other men count sheep, and about as fondly.' } },
      { x: 17, y: 8, dir: 'left', sprite: 'merchant', name: 'Waiting Trader',
        script: 'hideoutLocal',
        data: { line: 'Trader: Four days I have been waiting to cross. '
          + 'The toll goes up the longer you wait. That is not an accident.' } },
    ],
    items: [
      { x: 3, y: 10, item: 'ironScrap', count: 2, flag: 'item_twins_scrap' },
      { x: 20, y: 13, item: 'poppyMilk', count: 1, flag: 'item_twins_poppy' },
    ],
  },

  twinsHall: {
    seat: 80,
    name: 'The Hall of the Crossing',
    indoor: true, music: 'town',
    tiles: [
      'IIIIIIIIIIIIIIIII',
      'I==============II',
      'I===cccccccc===II',
      'I===cccXccccc==II',
      'I===cccccccc===II',
      'I=B====TT======II',
      'I=B====TT======II',
      'I==============II',
      'I==============II',
      'IIIIIII__IIIIIIII',
    ],
    warps: [
      { x: 7, y: 9, to: 'theTwins', tx: 5, ty: 7, dir: 'down' },
      { x: 8, y: 9, to: 'theTwins', tx: 5, ty: 7, dir: 'down' },
    ],
    npcs: [
      { x: 9, y: 2, dir: 'down', sprite: 'noble', name: 'Lord of the Crossing',
        script: 'duel', data: { duel: 'hedgeKnight', host: 5 } },
      { x: 5, y: 5, dir: 'right', sprite: 'guard', name: 'Frey Man-at-arms',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 12, y: 6, dir: 'left', sprite: 'septa', name: 'Septa of the Crossing',
        script: 'hideoutLocal',
        data: { line: 'Septa: Guest right is bread and salt. '
          + 'It is the oldest law there is, and it holds because everybody agrees it does.' } },
    ],
    items: [
      { x: 2, y: 8, item: 'kingsRansom', count: 1, flag: 'item_twinshall_ransom' },
    ],
  },

  maesterHallTwins: maesterHall({
    exitTo: 'theTwins', exitX: 18, exitY: 7,
    stock: ['maesterKit', 'poppyMilk', 'weirwoodSap', 'antidote', 'silverPurse'],
    healerLine: 'Sit. Nobody crosses that bridge without something aching.',
    merchantLine: 'Citadel goods, at the price the Freys let me charge for them.',
  }),

  theCrossroads: makeRoute({
    seed: 0xC205, spurs: 6,
    name: 'The Crossroads', ground: 'grass', wall: '#', floor: '.',
    music: 'route',
    features: [
      { type: 'flowers', x: 4, y: 8, w: 4, h: 2 },
      { type: 'water', x: 16, y: 18, w: 4, h: 3 },
      { type: 'rubble', x: 6, y: 24, w: 3, h: 2 },
    ],
    encounters: [
      { roamer: 'sellsword', min: 12, max: 18, weight: 30 },
      { roamer: 'bandit', min: 12, max: 17, weight: 26 },
      { roamer: 'brotherhoodBowman', min: 13, max: 19, weight: 24 },
      { beast: 'palfrey', min: 12, max: 17, weight: 16 },
      { beast: 'ravenling', min: 12, max: 16, weight: 14 },
    ],
    warps: [
      { x: 11, y: 0, to: 'theTwins', tx: 5, ty: 15, dir: 'down' },
      { x: 11, y: 29, to: 'harrenhal', tx: 11, ty: 20, dir: 'up' },
      { x: 17, y: 13, to: 'crossroadsInn', tx: 6, ty: 10, dir: 'up' },
    ],
    signs: [
      { x: 9, y: 8, text: 'THE CROSSROADS\nEvery road in the realm goes through here.\nSo does everybody on them.' },
    ],
    npcs: [
      { x: 11, y: 4, dir: 'down', sprite: 'goodwife', name: 'Widow Heddle', script: 'deedBroker',
        data: { property: 'riverCottage' } },
      { x: 8, y: 18, dir: 'right', sprite: 'brotherhood', name: 'Hooded Man',
        script: 'duel', data: { duel: 'brotherhoodBowman' } },
      { x: 14, y: 24, dir: 'left', sprite: 'smallfolk', name: 'Beggar',
        script: 'hideoutLocal',
        data: { line: 'Beggar: I have sat here eleven years. '
          + 'Everyone in the songs has walked past me and not one of them looked down.' } },
    ],
    items: [
      { x: 5, y: 15, item: 'stillwater', count: 2, flag: 'item_crossroads_water' },
      { x: 18, y: 6, item: 'ashHaft', count: 2, flag: 'item_crossroads_haft' },
    ],
  }),

  crossroadsInn: makeInn({
    town: 'theCrossroads', name: 'The Inn at the Crossroads', region: 'The Riverlands',
    keeper: 'Masha', keeperLine: 'Masha: Beds upstairs, board down here, and whatever you have heard on the road stays on it.',
    drinkerLine: 'Drinker: Four armies have drunk in this room. Not one of them paid.',
    fighter: 'Sellsword', fighterLine: 'bronn',
    stock: ['maesterKit', 'poppyMilk', 'stillwater', 'silverPurse'],
  }),

  /* Harrenhal. Built to be the largest castle ever raised and melted the day
     it was finished, and every family given it since has ended. */
  harrenhal: makeHold({
    name: 'Harrenhal', town: 'theCrossroads', townGate: [11, 28, 'up'],
    hall: 'harrenhalHall', ground: 'grass', wall: '#', floor: '.', banner: 'V',
    encounters: [
      { roamer: 'sellsword', min: 18, max: 25, weight: 28 },
      { roamer: 'bandit', min: 18, max: 24, weight: 24 },
      { beast: 'ravenling', min: 18, max: 24, weight: 18 },
    ],
    signs: [
      { x: 11, y: 16, text: 'HARRENHAL\nFive towers, melted at the tops like candles.\nEvery house given this castle has ended. Every one.' },
    ],
    npcs: [
      { x: 11, y: 15, dir: 'up', sprite: 'sellsword', name: 'Gate Sellsword',
        script: 'duel', data: { duel: 'sellsword', host: 3 } },
      { x: 7, y: 11, dir: 'right', roams: true, sprite: 'sellsword', name: 'Bloody Mummer',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 16, y: 11, dir: 'left', roams: true, sprite: 'mountain', name: "Mountain's Man",
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 9, y: 15, dir: 'up', roams: true, sprite: 'sellsword', name: 'Bloody Mummer',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 14, y: 15, dir: 'up', roams: true, sprite: 'guard', name: 'Garrison Man',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 18, y: 13, dir: 'left', sprite: 'child', name: 'Cupbearer',
        script: 'hideoutLocal',
        data: { line: 'Cupbearer: I pour for whoever is holding it this month. '
          + 'I have poured for three. I am very good at not being looked at.' } },
    ],
    items: [
      { x: 5, y: 9, item: 'ironScrap', count: 3, flag: 'item_harren_scrap' },
      { x: 18, y: 9, item: 'boiledHide', count: 2, flag: 'item_harren_hide' },
      { x: 5, y: 16, item: 'poppyMilk', count: 2, flag: 'item_harren_poppy' },
      { x: 18, y: 16, item: 'seaChest', count: 1, flag: 'item_harren_chest' },
    ],
  }),

  harrenhalHall: makeHoldHall({
    seat: 120,
    name: 'The Hall of a Hundred Hearths', hold: 'harrenhal',
    signs: [
      { x: 8, y: 7, text: 'THE HALL OF A HUNDRED HEARTHS\nThirty-five of them, in truth. Somebody exaggerated\nand the name stuck for three hundred years.' },
    ],
    npcs: [
      { x: 7, y: 2, dir: 'down', sprite: 'mountain', name: 'The Man Holding It',
        script: 'duel', data: { duel: 'manAtArms', host: 5 } },
      { x: 5, y: 3, dir: 'right', roams: true, sprite: 'sellsword', name: 'Bloody Mummer',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 11, y: 3, dir: 'left', roams: true, sprite: 'guard', name: 'Garrison Man',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 4, y: 7, dir: 'right', roams: true, sprite: 'sellsword', name: 'Sellsword',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 8, y: 10, dir: 'down', sprite: 'goodwife', name: 'Kitchen Woman',
        script: 'hideoutLocal',
        data: { line: 'Kitchen Woman: The stone sweats in summer. '
          + 'They say it is the dragon still in it. I say it is a badly built roof.' } },
    ],
    items: [
      { x: 1, y: 2, item: 'valyrianShard', count: 1, flag: 'item_harrenhall_shard' },
      { x: 15, y: 2, item: 'maestersSalts', count: 1, flag: 'item_harrenhall_salts' },
      { x: 1, y: 10, item: 'greenbriar', count: 3, flag: 'item_harrenhall_briar' },
      { x: 15, y: 10, item: 'boarTusk', count: 2, flag: 'item_harrenhall_tusk' },
      { x: 5, y: 10, item: 'stillwater', count: 2, flag: 'item_harrenhall_water' },
      { x: 11, y: 10, item: 'lordsWarrant', count: 1, flag: 'item_harrenhall_warrant' },
    ],
  }),

  /* ------------------------------------------------------------- the east ---
     The road along the Wall to Eastwatch, and what is past it.

     The raven that starts this whole story is signed at Eastwatch, and until
     now Eastwatch was a word in a letter: the Wall had exactly one gate on it
     and nothing to the east at all. Four days' ride of it now, a port at the
     end, and beyond that the two places everyone in the North says the name of
     quietly - Craster's, and Hardhome. */

  theGift: makeRoute({
    seed: 0x5E17, spurs: 5,
    name: 'The Gift', ground: 'snow', wall: 'P', floor: 'S', grass: ';',
    music: 'wild',
    features: [
      { type: 'rubble', x: 4, y: 7, w: 4, h: 3 },
      { type: 'ice', x: 16, y: 12, w: 5, h: 3 },
      { type: 'rubble', x: 15, y: 22, w: 4, h: 2 },
    ],
    encounters: [
      { roamer: 'deserter', min: 16, max: 21, weight: 30 },
      { roamer: 'wildlingRaider', min: 17, max: 22, weight: 26 },
      { roamer: 'bandit', min: 16, max: 20, weight: 20 },
      { beast: 'snowpup', min: 16, max: 21, weight: 18 },
      { beast: 'falconet', min: 17, max: 21, weight: 14 },
    ],
    warps: [
      { x: 11, y: 29, to: 'castleBlack', tx: 20, ty: 10, dir: 'down' },
      { x: 11, y: 0, to: 'eastwatch', tx: 11, ty: 25, dir: 'up' },
    ],
    signs: [
      { x: 9, y: 5, text: 'THE GIFT\nTwenty-five leagues the Watch was given to farm.\nNobody farms it now.' },
      { x: 13, y: 20, text: 'A holdfast, roofless.\nThe hearth is cold and has been for a long time.' },
    ],
    npcs: [
      { x: 7, y: 12, dir: 'right', sprite: 'nightswatch', name: 'Ranger of the Gift',
        script: 'duel', data: { duel: 'deserter' } },
      { x: 15, y: 8, dir: 'left', sprite: 'smallfolk', name: 'Last Farmer',
        script: 'hideoutLocal',
        data: { line: 'Last Farmer: Eleven families on this stretch when I was a boy. '
          + 'Now it is me, and I am only here because I have nowhere southward to be.' } },
    ],
    items: [
      { x: 6, y: 18, item: 'frostTonic', count: 1, flag: 'item_gift_tonic' },
      { x: 17, y: 25, item: 'ironScrap', count: 2, flag: 'item_gift_scrap' },
    ],
  }),

  eastwatch: makeTown({
    outsiders: [
      { dir: 'down', sprite: 'nightswatch', name: 'A Shore Watch', script: 'townTalk',
        data: { line: 'A Shore Watch: Ships came in here twice a moon once. The last one was in autumn and it came in on the tide with nobody aboard.' } },
      { dir: 'down', sprite: 'wildling', name: 'A Free Folk Woman', script: 'townTalk',
        data: { line: 'A Free Folk Woman: You southerners think we came through the Wall to raid you. We came through it to get away from what is behind us.' } },
    ],
    outskirts: OUTSKIRTS.iceShore, gate: 13,
    quarter: 3,
    roof: 'Z', ridge: 'z', house: 'A', banner: 'v',
    name: 'Eastwatch-by-the-Sea', music: 'town', ground: 'snow', wall: 'P', floor: 'S',
    dressing: [
      [3, 2, 'i'], [4, 2, 'i'], [20, 3, 'i'], [3, 18, 'i'], [20, 17, 'i'],
      [2, 9, 'U'], [21, 12, 'U'], [19, 24, 'U'],
    ],
    warps: [
      { door: 'cellar', to: 'eastwatchCellar', tx: 6, ty: 8, dir: 'up' },
      { door: 'inn', to: 'eastwatchInn', tx: 6, ty: 10, dir: 'up' },
      { door: 'house', to: 'eastwatchHouse', tx: 6, ty: 10, dir: 'up' },
      { door: 'southGate', to: 'theGift', tx: 11, ty: 1, dir: 'down' },
      { door: 'northGate', to: 'frostfangs', tx: 11, ty: 26, dir: 'up' },
      { door: 'maester', to: 'maesterHallEastwatch', tx: 5, ty: 7, dir: 'up' },
      { door: 'forge', to: 'eastwatchArmoury', tx: 5, ty: 6, dir: 'up' },
      { door: 'keep', to: 'eastwatchKeep', tx: 7, ty: 8, dir: 'up' },
    ],
    signs: [
      { x: 22, y: 12, text: 'THE ICE SHORE\nThe sea freezes here from the shore outward.\nWhat is on it in winter is not always ice.' },
      { x: 13, y: 10, text: 'EASTWATCH-BY-THE-SEA\nThe eastern end of the Wall.\nShips leave from here and some of them come back.' },
    ],
    npcs: [
      { x: 9, y: 9, dir: 'down', sprite: 'nightswatch', name: 'Cotter Pyke',
        script: 'duel', data: { duel: 'hedgeKnight', host: 3 } },
      { x: 14, y: 10, dir: 'left', sprite: 'nightswatch', name: 'Steward of Eastwatch',
        script: 'hideoutLocal',
        data: { line: 'Steward: We sent nine ravens south this year. Nine. '
          + 'Not one of them has been answered by anybody who could send men.' } },
      { x: 5, y: 17, dir: 'right', sprite: 'braavosi', name: 'Braavosi Captain',
        script: 'hideoutLocal',
        data: { line: 'Captain: I take cargo, not passengers, and not north. '
          + 'Whatever is up that coast has stopped buying and started taking.' } },
    ],
  }),

  frostfangs: makeRoute({
    seed: 0xF20F, spurs: 4,
    name: 'The Frostfangs', ground: 'snow', wall: 'C', floor: 'S', grass: ';',
    music: 'wild', height: 28,
    features: [
      { type: 'ice', x: 3, y: 5, w: 6, h: 3 },
      { type: 'ice', x: 14, y: 15, w: 6, h: 3 },
      { type: 'rubble', x: 16, y: 6, w: 3, h: 2 },
      { type: 'cliff', x: 4, y: 20, w: 4, h: 3 },
    ],
    encounters: [
      { roamer: 'wildlingRaider', min: 28, max: 34, weight: 30 },
      { roamer: 'spearwife', min: 28, max: 34, weight: 26 },
      { roamer: 'gravedigger', min: 30, max: 36, weight: 18 },
      { beast: 'wightling', min: 29, max: 35, weight: 22 },
      { beast: 'palewalker', min: 32, max: 38, weight: 10 },
    ],
    warps: [
      { x: 11, y: 27, to: 'eastwatch', tx: 11, ty: 1, dir: 'down' },
      { x: 11, y: 0, to: 'crastersKeep', tx: 11, ty: 20, dir: 'up' },
    ],
    signs: [
      { x: 10, y: 6, text: 'THE FROSTFANGS\nThere is no road. There is a way people have gone,\nand a great many who did not come back down it.' },
    ],
    npcs: [
      { x: 14, y: 12, dir: 'left', sprite: 'wildling', name: 'Thenn Scout',
        script: 'duel', data: { duel: 'wildlingRaider' } },
    ],
    items: [
      { x: 6, y: 9, item: 'dragonglass', count: 2, flag: 'item_frostfangs_glass' },
      { x: 16, y: 22, item: 'maestersSalts', count: 1, flag: 'item_frostfangs_salts' },
    ],
  }),

  crastersKeep: makeHold({
    name: "Craster's Keep", town: 'frostfangs', townGate: [11, 1, 'down'],
    hall: 'crastersHall', ground: 'snow', wall: 'P', floor: 'S', banner: 'v',
    grass: ';',
    encounters: [
      { roamer: 'wildlingRaider', min: 30, max: 38, weight: 28 },
      { roamer: 'spearwife', min: 30, max: 38, weight: 24 },
      { beast: 'wightling', min: 31, max: 39, weight: 18 },
    ],
    signs: [
      { x: 11, y: 16, text: "CRASTER'S KEEP\nA man who feeds what is out there, and is left alone for it.\nThe Watch have been guests here. It went badly." },
    ],
    npcs: [
      { x: 11, y: 15, dir: 'up', sprite: 'wildling', name: 'Gate Man', script: 'duel',
        data: { duel: 'wildlingRaider', host: 3 } },
      { x: 7, y: 11, dir: 'right', roams: true, sprite: 'wildling', name: "Craster's Man",
        script: 'duel', data: { duel: 'wildlingRaider' } },
      { x: 16, y: 11, dir: 'left', roams: true, sprite: 'wildling', name: "Craster's Man",
        script: 'duel', data: { duel: 'spearwife' } },
      { x: 9, y: 15, dir: 'up', roams: true, sprite: 'wildlingWoman', name: 'Wife',
        script: 'duel', data: { duel: 'spearwife' } },
      { x: 18, y: 13, dir: 'left', sprite: 'girl', name: 'Gilly',
        script: 'hideoutLocal',
        data: { line: 'Gilly: He gives the boys to them. Every one. '
          + 'If you have any thought of taking me out of here, have it quickly.' } },
    ],
    items: [
      { x: 5, y: 9, item: 'boiledHide', count: 2, flag: 'item_craster_hide' },
      { x: 18, y: 9, item: 'dragonglass', count: 1, flag: 'item_craster_glass' },
      { x: 5, y: 16, item: 'frostTonic', count: 2, flag: 'item_craster_tonic' },
      { x: 18, y: 16, item: 'direwolfPelt', count: 1, flag: 'item_craster_pelt' },
    ],
  }),

  crastersHall: makeHoldHall({
    seat: 35,
    name: "Craster's Longhall", hold: 'crastersKeep',
    signs: [
      { x: 8, y: 7, text: 'A longhall that stinks of smoke and pig.\nThere are nineteen women here and not one boy.' },
    ],
    npcs: [
      { x: 7, y: 2, dir: 'down', sprite: 'wildling', name: 'Craster', script: 'duel',
        data: { duel: 'wildlingRaider', host: 5 } },
      { x: 5, y: 3, dir: 'right', roams: true, sprite: 'wildlingWoman', name: 'Wife',
        script: 'duel', data: { duel: 'spearwife' } },
      { x: 11, y: 3, dir: 'left', roams: true, sprite: 'wildling', name: 'Guest of the Watch',
        script: 'duel', data: { duel: 'deserter' } },
      { x: 4, y: 7, dir: 'right', roams: true, sprite: 'nightswatch', name: 'Sworn Brother',
        script: 'duel', data: { duel: 'deserter' } },
      { x: 8, y: 10, dir: 'down', sprite: 'goodwife', name: 'Old Wife',
        script: 'hideoutLocal',
        data: { line: 'Old Wife: You are the fourth lot of southerners through that door. '
          + 'The other three ate his bread and made him promises. He is still here.' } },
    ],
    items: [
      { x: 1, y: 2, item: 'valyrianShard', count: 1, flag: 'item_crastershall_shard' },
      { x: 15, y: 2, item: 'poppyMilk', count: 2, flag: 'item_crastershall_poppy' },
      { x: 1, y: 10, item: 'ashHaft', count: 2, flag: 'item_crastershall_haft' },
      { x: 15, y: 10, item: 'boarTusk', count: 2, flag: 'item_crastershall_tusk' },
      { x: 5, y: 10, item: 'stillwater', count: 2, flag: 'item_crastershall_water' },
      { x: 11, y: 10, item: 'greatNet', count: 1, flag: 'item_crastershall_net' },
    ],
  }),

  /* Hardhome. There is no road here; a ship out of Eastwatch is the only way,
     and the only reason anybody sails it is that the Watch keep asking whether
     the people who lived here are still dead. */
  hardhome: {
    name: 'Hardhome',
    music: 'battleBoss', ground: 'snow', wall: 'C',
    tiles: [
      'CCCCCCCCCCCCCCCCCCCCCCCC',
      'CSSSSSSSSSSSSSSSSSSSSSSC',
      'CSUUSSSSUUSSSSSSUUSSSUSC',
      'CSSSSSSSSSSSSSSSSSSSSSSC',
      'CSSAAASSSSAAAASSSSAAASSC',
      'CSSAAASSSSAAAASSSSAAASSC',
      'CSSSSSSSSSSSSSSSSSSSSSSC',
      'CSUUSSSUUSSSSSUUSSSSSUSC',
      'CSSSSSSSSSSSSSSSSSSSSSSC',
      'CSSSSAAAASSSSSSAAAASSSSC',
      'CSSSSAAAASSSSSSAAAASSSSC',
      'CSSSSSSSSSSSSSSSSSSSSSSC',
      'CSUUSSSSSSUUSSSSSSUUSSSC',
      'CSSSSSSSSSSSSSSSSSSSSSSC',
      'CSSSAAASSSSSAAASSSSAAASC',
      'CSSSAAASSSSSAAASSSSAAASC',
      'CSSSSSSSSSSSSSSSSSSSSSSC',
      'CSSSSSSSSSSSSSSSSSSSSSSC',
      'CSSSSSSSSSSSSSSSSSSSSSSC',
      'CSSSSSSSSSSSSSSSSSSSSSSC',
      'CSSSSSSSSSSSSSSSSSSSSSSC',
      'CSSSSSSSSSSSSSSSSSSSSSSC',
      'CCCCCCCCCC~~~~CCCCCCCCCC',
    ],
    encounters: [
      { beast: 'wightling', min: 34, max: 42, weight: 34 },
      { beast: 'barrowlord', min: 36, max: 44, weight: 26 },
      { beast: 'palewalker', min: 38, max: 46, weight: 16 },
      { roamer: 'gravedigger', min: 34, max: 42, weight: 20 },
    ],
    warps: [],
    signs: [
      { x: 11, y: 6, text: 'HARDHOME\nSix thousand free folk lived here.\nThe Watch have counted them twice since and got the same number.' },
      { x: 6, y: 13, text: 'A cookfire, laid and never lit.\nThe wood is dry. Nobody has touched it in years.' },
    ],
    npcs: [
      { x: 11, y: 8, dir: 'down', sprite: 'whitewalker', name: 'A Walker',
        script: 'duel', data: { duel: 'gravedigger', host: 4 } },
      { x: 5, y: 11, dir: 'right', roams: true, sprite: 'wildling', name: 'What Was a Man',
        script: 'duel', data: { duel: 'gravedigger' } },
      { x: 18, y: 11, dir: 'left', roams: true, sprite: 'wildling', name: 'What Was a Man',
        script: 'duel', data: { duel: 'gravedigger' } },
      { x: 8, y: 17, dir: 'up', roams: true, sprite: 'wildlingWoman', name: 'What Was a Woman',
        script: 'duel', data: { duel: 'gravedigger' } },
      { x: 15, y: 17, dir: 'up', roams: true, sprite: 'wildling', name: 'What Was a Man',
        script: 'duel', data: { duel: 'gravedigger' } },
      /* The man who rowed you in. Hardhome has no road and no door: without
         somebody here who will take you off the beach, sailing to it once
         ended the cartridge, because the only way off a berth-only map is a
         person who sails and there was not one. */
      { x: 12, y: 21, dir: 'down', sprite: 'braavosi', name: 'The Boatman', script: 'ship',
        data: { line: 'The Boatman: I said I would wait until dark. I lied about that, '
          + 'but I am still here, and I will take you off this beach whenever you have had enough.' } },
      { x: 3, y: 19, dir: 'right', sprite: 'nightswatch', name: 'The Last Ranger',
        script: 'hideoutLocal',
        data: { line: 'The Last Ranger: I came up on the boat before yours. '
          + 'They do not come at you all at once. They wait until you have counted them.' } },
    ],
    items: [
      { x: 2, y: 5, item: 'dragonglass', count: 3, flag: 'item_hh_glass' },
      { x: 21, y: 5, item: 'valyrianShard', count: 1, flag: 'item_hh_shard' },
      { x: 2, y: 15, item: 'maestersSalts', count: 2, flag: 'item_hh_salts' },
      { x: 21, y: 15, item: 'dragonchain', count: 1, flag: 'item_hh_chain' },
      { x: 11, y: 20, item: 'weirwoodPaste', count: 1, flag: 'item_hh_paste' },
    ],
  },

  /* --------------------------------------------------------- strongholds ---
     Somebody else's walls. Nine towns had a main street that ran the whole
     length of the map with a gate at only one end of it, so half the
     settlements in the world walked you up to the edge of the world and
     stopped. The far gate now opens onto one of these instead: a garrison in
     a yard, a keep behind it, and six rooms inside worth going through. */

  stoneCrowHold: makeHold({
    grass: ';',
    encounters: [
      { roamer: 'clansman', min: 30, max: 40, weight: 26 },
      { roamer: 'wildlingRaider', min: 32, max: 42, weight: 22 },
      { beast: 'falconet', min: 30, max: 40, weight: 16 },
    ],
    name: 'The Stone Crow Camp', town: 'theEyrie', townGate: [18, 1, 'down'], hall: 'stoneCrowCave',
    ground: 'stone', wall: 'C', floor: 'o', banner: 'v',
    signs: [
      { x: 11, y: 16, text: 'THE STONE CROW CAMP\nThe clans hold the high ground above the Vale.\nThey did not ask leave, and will not give it.' },
    ],
    npcs: [
      { x: 11, y: 15, dir: 'up', sprite: 'wildling', name: 'Gate Sentry', script: 'duel',
        data: { duel: 'clansman', host: 3 } },
      { x: 7, y: 11, dir: 'right', roams: true, sprite: 'wildling', name: 'Garrison Man',
        script: 'duel', data: { duel: 'clansman' } },
      { x: 16, y: 11, dir: 'left', roams: true, sprite: 'wildling', name: 'Garrison Man',
        script: 'duel', data: { duel: 'clansman' } },
      { x: 9, y: 15, dir: 'up', roams: true, sprite: 'wildling', name: 'Yard Watch',
        script: 'duel', data: { duel: 'clansman' } },
      { x: 14, y: 15, dir: 'up', roams: true, sprite: 'wildling', name: 'Yard Watch',
        script: 'duel', data: { duel: 'clansman' } },
      { x: 18, y: 13, dir: 'left', sprite: 'guard', name: 'Captive Knight',
        script: 'hideoutLocal', data: { line: 'They took my horse, my sword and my name. Get the door at the back open and I will not be here when you come out.' } },
    ],
    items: [
      { x: 5, y: 9, item: 'ashHaft', count: 1, flag: 'item_stonecrowhold_0' },
      { x: 18, y: 9, item: 'ironScrap', count: 1, flag: 'item_stonecrowhold_1' },
      { x: 5, y: 16, item: 'snare', count: 1, flag: 'item_stonecrowhold_2' },
      { x: 18, y: 16, item: 'frostTonic', count: 1, flag: 'item_stonecrowhold_3' },
    ],
  }),

  stoneCrowCave: makeHoldHall({
    seat: 30,
    name: 'The Chieftain\'s Cave', hold: 'stoneCrowHold',
    signs: [
      { x: 8, y: 7, text: 'THE CHIEFTAIN\'S CAVE\nThe larders are down the far end and the beds are\nstill warm. Somebody left in a hurry.' },
    ],
    npcs: [
      { x: 7, y: 2, dir: 'down', sprite: 'wildling', name: 'Shagga son of Dolf', script: 'duel',
        data: { duel: 'clansman', host: 5 } },
      { x: 5, y: 3, dir: 'right', roams: true, sprite: 'wildling', name: 'Hall Guard',
        script: 'duel', data: { duel: 'clansman' } },
      { x: 11, y: 3, dir: 'left', roams: true, sprite: 'wildling', name: 'Hall Guard',
        script: 'duel', data: { duel: 'clansman' } },
      { x: 4, y: 7, dir: 'right', roams: true, sprite: 'wildling', name: 'Corridor Watch',
        script: 'duel', data: { duel: 'clansman' } },
      { x: 8, y: 10, dir: 'down', sprite: 'goodwife', name: 'Cook',
        script: 'hideoutLocal', data: { line: 'Cook: Take the larder. Take all of it. '
          + 'I have cooked for whoever held this hall for nineteen years and not one '
          + 'of them ever thanked me for it.' } },
    ],
    items: [
      { x: 1, y: 2, item: 'boiledHide', count: 1, flag: 'item_stonecrowhold_h0' },
      { x: 15, y: 2, item: 'poppyMilk', count: 1, flag: 'item_stonecrowhold_h1' },
      { x: 1, y: 10, item: 'stillwater', count: 1, flag: 'item_stonecrowhold_h2' },
      { x: 15, y: 10, item: 'boarTusk', count: 1, flag: 'item_stonecrowhold_h3' },
      { x: 5, y: 10, item: 'valyrianShard', count: 1, flag: 'item_stonecrowhold_h4' },
      { x: 11, y: 10, item: 'warPick', count: 1, flag: 'item_stonecrowhold_h5' },
    ],
  }),

  seaDragonHold: makeHold({
    grass: ',',
    encounters: [
      { roamer: 'redPriestess', min: 30, max: 40, weight: 26 },
      { roamer: 'ironbornReaver', min: 32, max: 42, weight: 22 },
      { beast: 'emberwisp', min: 30, max: 40, weight: 16 },
    ],
    name: 'The Sea Dragon Tower', town: 'dragonstone', townGate: [11, 1, 'down'], hall: 'seaDragonVault',
    ground: 'stone', wall: 'C', floor: 'o', banner: 'V',
    signs: [
      { x: 11, y: 16, text: 'THE SEA DRAGON TOWER\nDragonstone was raised by men who could work stone\nthe way a smith works iron. Nobody now knows how.' },
      { x: 6, y: 4, text: 'THE DRAGON\'S AERIE\nThere is still ash in the air.\nThere is always ash in the air.' },
      { x: 18, y: 4, text: 'THE THRONE OF FIRE\nOnce seated, a queen fears nothing.\nThe dragon sees to that.' },
    ],
    npcs: [
      { x: 11, y: 15, dir: 'up', sprite: 'redPriest', name: 'Gate Sentry', script: 'duel',
        data: { duel: 'redPriestess', host: 3 } },
      { x: 9, y: 15, dir: 'up', roams: true, sprite: 'redPriest', name: 'Yard Watch',
        script: 'duel', data: { duel: 'redPriestess' } },
      { x: 14, y: 15, dir: 'up', roams: true, sprite: 'redPriest', name: 'Yard Watch',
        script: 'duel', data: { duel: 'redPriestess' } },
      { x: 11, y: 10, dir: 'right', sprite: 'targaryen', name: 'Daenerys Targaryen',
        script: 'duel', data: { duel: 'daenerys' } },
      { x: 18, y: 13, dir: 'left', sprite: 'oldman', name: 'Tower Steward',
        script: 'hideoutLocal', data: { line: 'The dragon sleeps most days now. When Drogon wakes, the tower shakes. We bow, and we pray she remains content.' } },
    ],
    items: [
      { x: 5, y: 9, item: 'dragonglass', count: 1, flag: 'item_seadragonhold_0' },
      { x: 18, y: 9, item: 'fireblood', count: 2, flag: 'item_seadragonhold_1' },
      { x: 5, y: 16, item: 'burnSalve', count: 1, flag: 'item_seadragonhold_2' },
      { x: 18, y: 16, item: 'wildfire', count: 2, flag: 'item_seadragonhold_3' },
      { x: 12, y: 2, item: 'kissOfFire', count: 1, flag: 'item_seadragonhold_crown' },
    ],
  }),

  seaDragonVault: makeHoldHall({
    seat: 55,
    name: 'The Vault Beneath the Tower', hold: 'seaDragonHold',
    signs: [
      { x: 8, y: 7, text: 'THE VAULT BENEATH THE TOWER\nThe larders are down the far end and the beds are\nstill warm. Somebody left in a hurry.' },
    ],
    npcs: [
      { x: 7, y: 2, dir: 'down', sprite: 'guard', name: 'Ser Axell', script: 'duel',
        data: { duel: 'redPriestess', host: 5 } },
      { x: 5, y: 3, dir: 'right', roams: true, sprite: 'redPriest', name: 'Hall Guard',
        script: 'duel', data: { duel: 'redPriestess' } },
      { x: 11, y: 3, dir: 'left', roams: true, sprite: 'redPriest', name: 'Hall Guard',
        script: 'duel', data: { duel: 'redPriestess' } },
      { x: 4, y: 7, dir: 'right', roams: true, sprite: 'redPriest', name: 'Corridor Watch',
        script: 'duel', data: { duel: 'redPriestess' } },
      { x: 8, y: 10, dir: 'down', sprite: 'goodwife', name: 'Cook',
        script: 'hideoutLocal', data: { line: 'Cook: Take the larder. Take all of it. '
          + 'I have cooked for whoever held this hall for nineteen years and not one '
          + 'of them ever thanked me for it.' } },
    ],
    items: [
      { x: 1, y: 2, item: 'valyrianShard', count: 1, flag: 'item_seadragonhold_h0' },
      { x: 15, y: 2, item: 'kissOfFire', count: 1, flag: 'item_seadragonhold_h1' },
      { x: 1, y: 10, item: 'maestersSalts', count: 1, flag: 'item_seadragonhold_h2' },
      { x: 15, y: 10, item: 'dragonglass', count: 1, flag: 'item_seadragonhold_h3' },
      { x: 5, y: 10, item: 'netTrap', count: 1, flag: 'item_seadragonhold_h4' },
      { x: 11, y: 10, item: 'dragonscaleMail', count: 1, flag: 'item_seadragonhold_h5' },
    ],
  }),

  kennelHold: makeHold({
    grass: ';',
    encounters: [
      { roamer: 'manAtArms', min: 30, max: 40, weight: 26 },
      { roamer: 'deserter', min: 32, max: 42, weight: 22 },
      { beast: 'direwolf', min: 30, max: 40, weight: 16 },
    ],
    name: 'The Bolton Kennels', town: 'dreadfort', townGate: [11, 1, 'down'], hall: 'flayedHall',
    ground: 'snow', wall: 'P', floor: 'S', banner: 'v',
    signs: [
      { x: 11, y: 16, text: 'THE BOLTON KENNELS\nThe girls are fed on Thursdays.\nDo not be here on a Wednesday.' },
    ],
    npcs: [
      { x: 11, y: 15, dir: 'up', sprite: 'bolton', name: 'Gate Sentry', script: 'duel',
        data: { duel: 'manAtArms', host: 3 } },
      { x: 7, y: 11, dir: 'right', roams: true, sprite: 'bolton', name: 'Garrison Man',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 16, y: 11, dir: 'left', roams: true, sprite: 'bolton', name: 'Garrison Man',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 9, y: 15, dir: 'up', roams: true, sprite: 'bolton', name: 'Yard Watch',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 14, y: 15, dir: 'up', roams: true, sprite: 'bolton', name: 'Yard Watch',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 18, y: 13, dir: 'left', sprite: 'girl', name: 'Kennel Girl',
        script: 'hideoutLocal', data: { line: 'He names them after girls. When one of them stops answering to her name he gets another girl. Do not ask me any more than that.' } },
    ],
    items: [
      { x: 5, y: 9, item: 'direwolfPelt', count: 1, flag: 'item_kennelhold_0' },
      { x: 18, y: 9, item: 'boiledHide', count: 1, flag: 'item_kennelhold_1' },
      { x: 5, y: 16, item: 'greatNet', count: 1, flag: 'item_kennelhold_2' },
      { x: 18, y: 16, item: 'antidote', count: 1, flag: 'item_kennelhold_3' },
    ],
  }),

  flayedHall: makeHoldHall({
    seat: 60,
    name: 'The Flayed Man\'s Hall', hold: 'kennelHold',
    signs: [
      { x: 8, y: 7, text: 'THE FLAYED MAN\'S HALL\nThe larders are down the far end and the beds are\nstill warm. Somebody left in a hurry.' },
    ],
    npcs: [
      { x: 7, y: 2, dir: 'down', sprite: 'bolton', name: 'Kennelmaster Ben', script: 'duel',
        data: { duel: 'manAtArms', host: 5 } },
      { x: 5, y: 3, dir: 'right', roams: true, sprite: 'bolton', name: 'Hall Guard',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 11, y: 3, dir: 'left', roams: true, sprite: 'bolton', name: 'Hall Guard',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 4, y: 7, dir: 'right', roams: true, sprite: 'bolton', name: 'Corridor Watch',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 8, y: 10, dir: 'down', sprite: 'goodwife', name: 'Cook',
        script: 'hideoutLocal', data: { line: 'Cook: Take the larder. Take all of it. '
          + 'I have cooked for whoever held this hall for nineteen years and not one '
          + 'of them ever thanked me for it.' } },
    ],
    items: [
      { x: 1, y: 2, item: 'boarTusk', count: 1, flag: 'item_kennelhold_h0' },
      { x: 15, y: 2, item: 'poppyMilk', count: 1, flag: 'item_kennelhold_h1' },
      { x: 1, y: 10, item: 'frostTonic', count: 1, flag: 'item_kennelhold_h2' },
      { x: 15, y: 10, item: 'ironScrap', count: 1, flag: 'item_kennelhold_h3' },
      { x: 5, y: 10, item: 'flail', count: 1, flag: 'item_kennelhold_h4' },
      { x: 11, y: 10, item: 'splintMail', count: 1, flag: 'item_kennelhold_h5' },
    ],
  }),

  sealordHold: makeHold({
    grass: ',',
    encounters: [
      { roamer: 'sellsword', min: 30, max: 40, weight: 26 },
      { roamer: 'bandit', min: 32, max: 42, weight: 22 },
      { beast: 'krakenling', min: 30, max: 40, weight: 16 },
    ],
    name: 'The Sealord\'s Yard', town: 'braavos', townGate: [11, 1, 'down'], hall: 'sealordPalace',
    ground: 'stone', wall: '~', floor: 'o', banner: 'V',
    signs: [
      { x: 11, y: 16, text: 'THE SEALORD\'S YARD\nValar morghulis. The guard here says it back\nand keeps their hand where you can see it.' },
    ],
    npcs: [
      { x: 11, y: 15, dir: 'up', sprite: 'braavosi', name: 'Gate Sentry', script: 'duel',
        data: { duel: 'sellsword', host: 3 } },
      { x: 7, y: 11, dir: 'right', roams: true, sprite: 'braavosi', name: 'Garrison Man',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 16, y: 11, dir: 'left', roams: true, sprite: 'braavosi', name: 'Garrison Man',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 9, y: 15, dir: 'up', roams: true, sprite: 'braavosi', name: 'Yard Watch',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 14, y: 15, dir: 'up', roams: true, sprite: 'braavosi', name: 'Yard Watch',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 18, y: 13, dir: 'left', sprite: 'sellsword', name: 'Bravo',
        script: 'hideoutLocal', data: { line: 'A bravo fights for the shape of it, not the coin. Which is what a bravo says when nobody is paying him.' } },
    ],
    items: [
      { x: 5, y: 9, item: 'ironScrap', count: 1, flag: 'item_sealordhold_0' },
      { x: 18, y: 9, item: 'valyrianShard', count: 1, flag: 'item_sealordhold_1' },
      { x: 5, y: 16, item: 'stillwater', count: 1, flag: 'item_sealordhold_2' },
      { x: 18, y: 16, item: 'birdLime', count: 1, flag: 'item_sealordhold_3' },
    ],
  }),

  sealordPalace: makeHoldHall({
    seat: 110,
    name: 'The Sealord\'s Palace', hold: 'sealordHold',
    signs: [
      { x: 8, y: 7, text: 'THE SEALORD\'S PALACE\nThe larders are down the far end and the beds are\nstill warm. Somebody left in a hurry.' },
    ],
    npcs: [
      { x: 7, y: 2, dir: 'down', sprite: 'braavosi', name: 'First Sword of Braavos', script: 'duel',
        data: { duel: 'sellsword', host: 5 } },
      { x: 5, y: 3, dir: 'right', roams: true, sprite: 'braavosi', name: 'Hall Guard',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 11, y: 3, dir: 'left', roams: true, sprite: 'braavosi', name: 'Hall Guard',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 4, y: 7, dir: 'right', roams: true, sprite: 'braavosi', name: 'Corridor Watch',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 8, y: 10, dir: 'down', sprite: 'goodwife', name: 'Cook',
        script: 'hideoutLocal', data: { line: 'Cook: Take the larder. Take all of it. '
          + 'I have cooked for whoever held this hall for nineteen years and not one '
          + 'of them ever thanked me for it.' } },
    ],
    items: [
      { x: 1, y: 2, item: 'kingsRansom', count: 1, flag: 'item_sealordhold_h0' },
      { x: 15, y: 2, item: 'shadeOfTheEvening', count: 1, flag: 'item_sealordhold_h1' },
      { x: 1, y: 10, item: 'maestersSalts', count: 1, flag: 'item_sealordhold_h2' },
      { x: 15, y: 10, item: 'poppySeed', count: 1, flag: 'item_sealordhold_h3' },
      { x: 5, y: 10, item: 'bastardSword', count: 1, flag: 'item_sealordhold_h4' },
      { x: 11, y: 10, item: 'lamellar', count: 1, flag: 'item_sealordhold_h5' },
    ],
  }),

  cheesemongerHold: makeHold({
    grass: ',',
    encounters: [
      { roamer: 'sellsword', min: 30, max: 40, weight: 26 },
      { roamer: 'dornishOutrider', min: 32, max: 42, weight: 22 },
      { beast: 'sandviper', min: 30, max: 40, weight: 16 },
    ],
    name: 'The Slavers\' Compound', town: 'pentos', townGate: [11, 1, 'down'], hall: 'cheesemongerCellar',
    ground: 'sand', wall: 'C', floor: 's', banner: 'V',
    signs: [
      { x: 11, y: 16, text: 'THE SLAVERS\' COMPOUND\nPentos signed a treaty forbidding this.\nPentos signs a great many things.' },
    ],
    npcs: [
      { x: 11, y: 15, dir: 'up', sprite: 'merchant', name: 'Gate Sentry', script: 'duel',
        data: { duel: 'sellsword', host: 3 } },
      { x: 7, y: 11, dir: 'right', roams: true, sprite: 'merchant', name: 'Garrison Man',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 16, y: 11, dir: 'left', roams: true, sprite: 'merchant', name: 'Garrison Man',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 9, y: 15, dir: 'up', roams: true, sprite: 'merchant', name: 'Yard Watch',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 14, y: 15, dir: 'up', roams: true, sprite: 'merchant', name: 'Yard Watch',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 18, y: 13, dir: 'left', sprite: 'smallfolk', name: 'Freed Man',
        script: 'hideoutLocal', data: { line: 'There is a ledger in the back with names in it. Mine is in it. Take the ledger and I do not care what else you take.' } },
    ],
    items: [
      { x: 5, y: 9, item: 'poppySeed', count: 1, flag: 'item_cheesemongerhold_0' },
      { x: 18, y: 9, item: 'greenbriar', count: 1, flag: 'item_cheesemongerhold_1' },
      { x: 5, y: 16, item: 'wakingDraught', count: 1, flag: 'item_cheesemongerhold_2' },
      { x: 18, y: 16, item: 'snare', count: 1, flag: 'item_cheesemongerhold_3' },
    ],
  }),

  cheesemongerCellar: makeHoldHall({
    seat: 70,
    name: 'Illyrio\'s Undercellar', hold: 'cheesemongerHold',
    signs: [
      { x: 8, y: 7, text: 'ILLYRIO\'S UNDERCELLAR\nThe larders are down the far end and the beds are\nstill warm. Somebody left in a hurry.' },
    ],
    npcs: [
      { x: 7, y: 2, dir: 'down', sprite: 'sellsword', name: 'Slaver Captain', script: 'duel',
        data: { duel: 'sellsword', host: 5 } },
      { x: 5, y: 3, dir: 'right', roams: true, sprite: 'merchant', name: 'Hall Guard',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 11, y: 3, dir: 'left', roams: true, sprite: 'merchant', name: 'Hall Guard',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 4, y: 7, dir: 'right', roams: true, sprite: 'merchant', name: 'Corridor Watch',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 8, y: 10, dir: 'down', sprite: 'goodwife', name: 'Cook',
        script: 'hideoutLocal', data: { line: 'Cook: Take the larder. Take all of it. '
          + 'I have cooked for whoever held this hall for nineteen years and not one '
          + 'of them ever thanked me for it.' } },
    ],
    items: [
      { x: 1, y: 2, item: 'kingsRansom', count: 1, flag: 'item_cheesemongerhold_h0' },
      { x: 15, y: 2, item: 'shadeOfTheEvening', count: 1, flag: 'item_cheesemongerhold_h1' },
      { x: 1, y: 10, item: 'antidote', count: 1, flag: 'item_cheesemongerhold_h2' },
      { x: 15, y: 10, item: 'ashHaft', count: 1, flag: 'item_cheesemongerhold_h3' },
      { x: 5, y: 10, item: 'arakh', count: 1, flag: 'item_cheesemongerhold_h4' },
      { x: 11, y: 10, item: 'studdedBrigandine', count: 1, flag: 'item_cheesemongerhold_h5' },
    ],
  }),

  blackWallHold: makeHold({
    grass: ',',
    encounters: [
      { roamer: 'sellsword', min: 30, max: 40, weight: 26 },
      { roamer: 'redPriestess', min: 32, max: 42, weight: 22 },
      { beast: 'sandviper', min: 30, max: 40, weight: 16 },
    ],
    name: 'The Black Wall', town: 'volantis', townGate: [11, 1, 'down'], hall: 'elephantCourt',
    ground: 'sand', wall: 'C', floor: 's', banner: 'V',
    signs: [
      { x: 11, y: 16, text: 'THE BLACK WALL\nTwo hundred feet of fused dragonstone.\nOnly those of the old blood may pass within.' },
    ],
    npcs: [
      { x: 11, y: 15, dir: 'up', sprite: 'unsullied', name: 'Gate Sentry', script: 'duel',
        data: { duel: 'sellsword', host: 3 } },
      { x: 7, y: 11, dir: 'right', roams: true, sprite: 'unsullied', name: 'Garrison Man',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 16, y: 11, dir: 'left', roams: true, sprite: 'unsullied', name: 'Garrison Man',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 9, y: 15, dir: 'up', roams: true, sprite: 'unsullied', name: 'Yard Watch',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 14, y: 15, dir: 'up', roams: true, sprite: 'unsullied', name: 'Yard Watch',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 18, y: 13, dir: 'left', sprite: 'guard', name: 'Tiger Cloak',
        script: 'hideoutLocal', data: { line: 'Tigers want war and elephants want trade. The wall does not care either way. It has outlasted both of them twice.' } },
    ],
    items: [
      { x: 5, y: 9, item: 'fireblood', count: 1, flag: 'item_blackwallhold_0' },
      { x: 18, y: 9, item: 'dragonglass', count: 1, flag: 'item_blackwallhold_1' },
      { x: 5, y: 16, item: 'kissOfFire', count: 1, flag: 'item_blackwallhold_2' },
      { x: 18, y: 16, item: 'valyrianMesh', count: 1, flag: 'item_blackwallhold_3' },
    ],
  }),

  elephantCourt: makeHoldHall({
    seat: 95,
    name: 'The Elephant Court', hold: 'blackWallHold',
    signs: [
      { x: 8, y: 7, text: 'THE ELEPHANT COURT\nThe larders are down the far end and the beds are\nstill warm. Somebody left in a hurry.' },
    ],
    npcs: [
      { x: 7, y: 2, dir: 'down', sprite: 'guard', name: 'Tiger Cloak Captain', script: 'duel',
        data: { duel: 'sellsword', host: 5 } },
      { x: 5, y: 3, dir: 'right', roams: true, sprite: 'unsullied', name: 'Hall Guard',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 11, y: 3, dir: 'left', roams: true, sprite: 'unsullied', name: 'Hall Guard',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 4, y: 7, dir: 'right', roams: true, sprite: 'unsullied', name: 'Corridor Watch',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 8, y: 10, dir: 'down', sprite: 'goodwife', name: 'Cook',
        script: 'hideoutLocal', data: { line: 'Cook: Take the larder. Take all of it. '
          + 'I have cooked for whoever held this hall for nineteen years and not one '
          + 'of them ever thanked me for it.' } },
    ],
    items: [
      { x: 1, y: 2, item: 'valyrianShard', count: 1, flag: 'item_blackwallhold_h0' },
      { x: 15, y: 2, item: 'wildfire', count: 1, flag: 'item_blackwallhold_h1' },
      { x: 1, y: 10, item: 'burnSalve', count: 1, flag: 'item_blackwallhold_h2' },
      { x: 15, y: 10, item: 'ironScrap', count: 1, flag: 'item_blackwallhold_h3' },
      { x: 5, y: 10, item: 'dornishSpear', count: 1, flag: 'item_blackwallhold_h4' },
      { x: 11, y: 10, item: 'scaleArmour', count: 1, flag: 'item_blackwallhold_h5' },
    ],
  }),

  fightingPits: makeHold({
    grass: ',',
    encounters: [
      { roamer: 'sellsword', min: 30, max: 40, weight: 26 },
      { roamer: 'ironbornReaver', min: 32, max: 42, weight: 22 },
      { beast: 'boartusk', min: 30, max: 40, weight: 16 },
    ],
    name: 'The Fighting Pits', town: 'meereen', townGate: [11, 1, 'down'], hall: 'pitMasterRooms',
    ground: 'sand', wall: 'C', floor: 's', banner: 'V',
    signs: [
      { x: 11, y: 16, text: 'THE FIGHTING PITS OF MEEREEN\nThe sand is raked between bouts.\nIt is the only thing here anyone bothers to clean.' },
    ],
    npcs: [
      { x: 11, y: 15, dir: 'up', sprite: 'unsullied', name: 'Gate Sentry', script: 'duel',
        data: { duel: 'sellsword', host: 3 } },
      { x: 7, y: 11, dir: 'right', roams: true, sprite: 'unsullied', name: 'Garrison Man',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 16, y: 11, dir: 'left', roams: true, sprite: 'unsullied', name: 'Garrison Man',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 9, y: 15, dir: 'up', roams: true, sprite: 'unsullied', name: 'Yard Watch',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 14, y: 15, dir: 'up', roams: true, sprite: 'unsullied', name: 'Yard Watch',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 18, y: 13, dir: 'left', sprite: 'sellsword', name: 'Pit Fighter',
        script: 'hideoutLocal', data: { line: 'I have won eleven. The eleventh is the one that frightens me, because it means there has to be a twelfth.' } },
    ],
    items: [
      { x: 5, y: 9, item: 'boarTusk', count: 1, flag: 'item_fightingpits_0' },
      { x: 18, y: 9, item: 'boiledHide', count: 1, flag: 'item_fightingpits_1' },
      { x: 5, y: 16, item: 'huntersDraught', count: 1, flag: 'item_fightingpits_2' },
      { x: 18, y: 16, item: 'netTrap', count: 1, flag: 'item_fightingpits_3' },
    ],
  }),

  pitMasterRooms: makeHoldHall({
    seat: 85,
    name: 'The Pit Master\'s Rooms', hold: 'fightingPits',
    signs: [
      { x: 8, y: 7, text: 'THE PIT MASTER\'S ROOMS\nThe larders are down the far end and the beds are\nstill warm. Somebody left in a hurry.' },
    ],
    npcs: [
      { x: 7, y: 2, dir: 'down', sprite: 'merchant', name: 'Pit Master', script: 'duel',
        data: { duel: 'sellsword', host: 5 } },
      { x: 5, y: 3, dir: 'right', roams: true, sprite: 'unsullied', name: 'Hall Guard',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 11, y: 3, dir: 'left', roams: true, sprite: 'unsullied', name: 'Hall Guard',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 4, y: 7, dir: 'right', roams: true, sprite: 'unsullied', name: 'Corridor Watch',
        script: 'duel', data: { duel: 'sellsword' } },
      { x: 8, y: 10, dir: 'down', sprite: 'goodwife', name: 'Cook',
        script: 'hideoutLocal', data: { line: 'Cook: Take the larder. Take all of it. '
          + 'I have cooked for whoever held this hall for nineteen years and not one '
          + 'of them ever thanked me for it.' } },
    ],
    items: [
      { x: 1, y: 2, item: 'kingsRansom', count: 1, flag: 'item_fightingpits_h0' },
      { x: 15, y: 2, item: 'maestersSalts', count: 1, flag: 'item_fightingpits_h1' },
      { x: 1, y: 10, item: 'wakingDraught', count: 1, flag: 'item_fightingpits_h2' },
      { x: 15, y: 10, item: 'ashHaft', count: 1, flag: 'item_fightingpits_h3' },
      { x: 5, y: 10, item: 'poleaxe', count: 1, flag: 'item_fightingpits_h4' },
      { x: 11, y: 10, item: 'halfPlate', count: 1, flag: 'item_fightingpits_h5' },
    ],
  }),

  waterGardens: makeHold({
    grass: ',',
    encounters: [
      { roamer: 'dornishOutrider', min: 30, max: 40, weight: 26 },
      { roamer: 'sellsword', min: 32, max: 42, weight: 22 },
      { beast: 'dornspine', min: 30, max: 40, weight: 16 },
    ],
    name: 'The Water Gardens', town: 'sunspear', townGate: [11, 25, 'up'], hall: 'pavilionOfOranges',
    ground: 'sand', wall: 'C', floor: 's', banner: 'V',
    signs: [
      { x: 11, y: 16, text: 'THE WATER GARDENS\nChildren of every birth swim in the same pools here.\nThat was somebody\'s idea, once.' },
    ],
    npcs: [
      { x: 11, y: 15, dir: 'up', sprite: 'martell', name: 'Gate Sentry', script: 'duel',
        data: { duel: 'dornishOutrider', host: 3 } },
      { x: 7, y: 11, dir: 'right', roams: true, sprite: 'martell', name: 'Garrison Man',
        script: 'duel', data: { duel: 'dornishOutrider' } },
      { x: 16, y: 11, dir: 'left', roams: true, sprite: 'martell', name: 'Garrison Man',
        script: 'duel', data: { duel: 'dornishOutrider' } },
      { x: 9, y: 15, dir: 'up', roams: true, sprite: 'martell', name: 'Yard Watch',
        script: 'duel', data: { duel: 'dornishOutrider' } },
      { x: 14, y: 15, dir: 'up', roams: true, sprite: 'martell', name: 'Yard Watch',
        script: 'duel', data: { duel: 'dornishOutrider' } },
      { x: 18, y: 13, dir: 'left', sprite: 'goodwife', name: 'Sand Steward',
        script: 'hideoutLocal', data: { line: 'The prince sits and watches the children and everyone calls him idle. Unbowed, unbent, unbroken. He is doing the third one.' } },
    ],
    items: [
      { x: 5, y: 9, item: 'greenbriar', count: 1, flag: 'item_watergardens_0' },
      { x: 18, y: 9, item: 'poppySeed', count: 1, flag: 'item_watergardens_1' },
      { x: 5, y: 16, item: 'antidote', count: 1, flag: 'item_watergardens_2' },
      { x: 18, y: 16, item: 'birdLime', count: 1, flag: 'item_watergardens_3' },
    ],
  }),

  pavilionOfOranges: makeHoldHall({
    seat: 90,
    name: 'The Pavilion of Oranges', hold: 'waterGardens',
    signs: [
      { x: 8, y: 7, text: 'THE PAVILION OF ORANGES\nThe larders are down the far end and the beds are\nstill warm. Somebody left in a hurry.' },
    ],
    npcs: [
      { x: 7, y: 2, dir: 'down', sprite: 'martell', name: 'Areo Hotah', script: 'duel',
        data: { duel: 'dornishOutrider', host: 5 } },
      { x: 5, y: 3, dir: 'right', roams: true, sprite: 'martell', name: 'Hall Guard',
        script: 'duel', data: { duel: 'dornishOutrider' } },
      { x: 11, y: 3, dir: 'left', roams: true, sprite: 'martell', name: 'Hall Guard',
        script: 'duel', data: { duel: 'dornishOutrider' } },
      { x: 4, y: 7, dir: 'right', roams: true, sprite: 'martell', name: 'Corridor Watch',
        script: 'duel', data: { duel: 'dornishOutrider' } },
      { x: 8, y: 10, dir: 'down', sprite: 'goodwife', name: 'Cook',
        script: 'hideoutLocal', data: { line: 'Cook: Take the larder. Take all of it. '
          + 'I have cooked for whoever held this hall for nineteen years and not one '
          + 'of them ever thanked me for it.' } },
    ],
    items: [
      { x: 1, y: 2, item: 'valyrianShard', count: 1, flag: 'item_watergardens_h0' },
      { x: 15, y: 2, item: 'huntersDraught', count: 1, flag: 'item_watergardens_h1' },
      { x: 1, y: 10, item: 'stillwater', count: 1, flag: 'item_watergardens_h2' },
      { x: 15, y: 10, item: 'boarTusk', count: 1, flag: 'item_watergardens_h3' },
      { x: 5, y: 10, item: 'arakh', count: 1, flag: 'item_watergardens_h4' },
      { x: 11, y: 10, item: 'lamellar', count: 1, flag: 'item_watergardens_h5' },
    ],
  }),

  wreckersHold: makeHold({
    grass: ',',
    encounters: [
      { roamer: 'manAtArms', min: 30, max: 40, weight: 26 },
      { roamer: 'hedgeKnight', min: 32, max: 42, weight: 22 },
      { beast: 'crownstag', min: 30, max: 40, weight: 16 },
    ],
    name: 'Shipbreaker Cliffs', town: 'stormsEnd', townGate: [11, 25, 'up'], hall: 'wreckersHall',
    ground: 'grass', wall: 'C', floor: '.', banner: 'V',
    signs: [
      { x: 11, y: 16, text: 'SHIPBREAKER BAY\nEvery hull that ever came at this coast is under it.\nSomebody has been going down after them.' },
    ],
    npcs: [
      { x: 11, y: 15, dir: 'up', sprite: 'baratheon', name: 'Gate Sentry', script: 'duel',
        data: { duel: 'manAtArms', host: 3 } },
      { x: 7, y: 11, dir: 'right', roams: true, sprite: 'baratheon', name: 'Garrison Man',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 16, y: 11, dir: 'left', roams: true, sprite: 'baratheon', name: 'Garrison Man',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 9, y: 15, dir: 'up', roams: true, sprite: 'baratheon', name: 'Yard Watch',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 14, y: 15, dir: 'up', roams: true, sprite: 'baratheon', name: 'Yard Watch',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 18, y: 13, dir: 'left', sprite: 'smallfolk', name: 'Wrecker',
        script: 'hideoutLocal', data: { line: 'We do not sink them. The bay does that. We only go down after and ask what they were carrying.' } },
    ],
    items: [
      { x: 5, y: 9, item: 'ironScrap', count: 1, flag: 'item_wreckershold_0' },
      { x: 18, y: 9, item: 'ashHaft', count: 1, flag: 'item_wreckershold_1' },
      { x: 5, y: 16, item: 'frostTonic', count: 1, flag: 'item_wreckershold_2' },
      { x: 18, y: 16, item: 'warhorn', count: 1, flag: 'item_wreckershold_3' },
    ],
  }),

  wreckersHall: makeHoldHall({
    seat: 40,
    name: 'The Wreckers\' Hall', hold: 'wreckersHold',
    signs: [
      { x: 8, y: 7, text: 'THE WRECKERS\' HALL\nThe larders are down the far end and the beds are\nstill warm. Somebody left in a hurry.' },
    ],
    npcs: [
      { x: 7, y: 2, dir: 'down', sprite: 'sellsword', name: 'Wreck Captain', script: 'duel',
        data: { duel: 'manAtArms', host: 5 } },
      { x: 5, y: 3, dir: 'right', roams: true, sprite: 'baratheon', name: 'Hall Guard',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 11, y: 3, dir: 'left', roams: true, sprite: 'baratheon', name: 'Hall Guard',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 4, y: 7, dir: 'right', roams: true, sprite: 'baratheon', name: 'Corridor Watch',
        script: 'duel', data: { duel: 'manAtArms' } },
      { x: 8, y: 10, dir: 'down', sprite: 'goodwife', name: 'Cook',
        script: 'hideoutLocal', data: { line: 'Cook: Take the larder. Take all of it. '
          + 'I have cooked for whoever held this hall for nineteen years and not one '
          + 'of them ever thanked me for it.' } },
    ],
    items: [
      { x: 1, y: 2, item: 'valyrianShard', count: 1, flag: 'item_wreckershold_h0' },
      { x: 15, y: 2, item: 'maestersSalts', count: 1, flag: 'item_wreckershold_h1' },
      { x: 1, y: 10, item: 'poppyMilk', count: 1, flag: 'item_wreckershold_h2' },
      { x: 15, y: 10, item: 'boiledHide', count: 1, flag: 'item_wreckershold_h3' },
      { x: 5, y: 10, item: 'warhammer', count: 1, flag: 'item_wreckershold_h4' },
      { x: 11, y: 10, item: 'bandedMail', count: 1, flag: 'item_wreckershold_h5' },
    ],
  }),


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

/*
 * A door that puts you down on another door bounces you: you arrive, take one
 * step in any direction, and the tile you left sends you straight back. Nudge
 * any landing that has come to rest on a warp onto the ground beside it - in
 * the direction you were walking if that works, and whatever is open if not.
 */
function landClear() {
  for (const map of Object.values(MAPS)) {
    for (const w of map.warps ?? []) {
      const there = MAPS[w.to];
      if (!there) continue;
      const onADoor = (x, y) => (there.warps ?? []).some((d) => d.x === x && d.y === y);
      if (!onADoor(w.tx, w.ty)) continue;
      const AWAY = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
      const tries = [AWAY[w.dir] ?? [0, 1], [0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dx, dy] of tries) {
        const nx = w.tx + dx, ny = w.ty + dy;
        const tile = there.grid[ny]?.[nx];
        if (!tile || !STANDABLE.has(tile) || onADoor(nx, ny)) continue;
        w.tx = nx; w.ty = ny;
        break;
      }
    }
  }
}

/*
 * Doors go both ways.
 *
 * A carved road does not know where its own side doors ended up until it has
 * been carved, so a cave cannot be written with the coordinate of the mouth it
 * comes out of - somebody would have to read the generated map, copy a number
 * out of it, and copy it again every time the seed changed. A warp marked
 * `back` instead finds the door in the other map that leads here and lands on
 * it. Arriving on a warp tile is safe: a warp fires when a step finishes on it,
 * and being put down somewhere is not a step.
 */
for (const [id, map] of Object.entries(MAPS)) {
  for (const w of map.warps ?? []) {
    if (!w.back) continue;
    const there = MAPS[w.to];
    if (!there) throw new Error(`${id}: a way back to ${w.to}, which does not exist`);
    const door = (there.warps ?? []).find((d) => d.to === id);
    if (!door) throw new Error(`${id}: nothing in ${w.to} leads back here`);
    w.tx = door.x;
    w.ty = door.y;
  }
}
landClear();

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
  highgardenKeep: 'The Reach',
  maesterHallHighgarden: 'The Reach',
  princesPass: 'Dorne', sunspear: 'Dorne', sunspearArmoury: 'Dorne',
  sunspearKeep: 'Dorne',
  maesterHallSunspear: 'Dorne',
  stormlands: 'The Stormlands', stormsEnd: 'The Stormlands',
  stormsEndKeep: 'The Stormlands',
  stormsEndArmoury: 'The Stormlands', maesterHallStormsEnd: 'The Stormlands',
  kingsroad: 'The Crownlands', kingsLanding: 'The Crownlands',
  mudGate: 'The Crownlands', fleaBottom: 'The Crownlands',
  greatSept: 'The Crownlands', dragonpit: 'The Crownlands',
  klArmoury: 'The Crownlands', redKeep: 'The Crownlands',
  maesterHallKL: 'The Crownlands',
  ironCoast: 'The Iron Islands', seaCave: 'The Iron Islands',
  pykeBridge: 'The Iron Islands', pyke: 'The Iron Islands',
  maesterHallPyke: 'The Iron Islands', pykeForge: 'The Iron Islands',
  pykeKeep: 'The Iron Islands', lordsportDocks: 'The Iron Islands',
  weepingWater: 'The North', dreadfort: 'The North',
  maesterHallDreadfort: 'The North', dreadfortForge: 'The North',
  dreadfortKeep: 'The North',
  hauntedForest: 'Beyond the Wall', fistOfTheFirstMen: 'Beyond the Wall',
  hollowHill: 'The Crownlands', stoneCrypt: 'The Reach',
  illyriosManse: 'Pentos', templeOfRhllor: 'Volantis', greatPyramid: 'Meereen',
  /* The road east along the Wall, the port at the end of it, and the two
     places everyone in the North says the name of quietly. */
  theGift: 'The Wall', eastwatch: 'The Wall', maesterHallEastwatch: 'The Wall',
  eastwatchArmoury: 'The Wall', eastwatchKeep: 'The Wall',
  frostfangs: 'Beyond the Wall', crastersKeep: 'Beyond the Wall',
  crastersHall: 'Beyond the Wall',
  eastwatchCellar: 'The Wall',
  hardhome: 'Beyond the Wall',
  /* The river road: the bridge, the inn where the roads meet, and the ruin. */
  theGreenFork: 'The Riverlands', theTwins: 'The Riverlands',
  twinsHall: 'The Riverlands', maesterHallTwins: 'The Riverlands',
  theCrossroads: 'The Riverlands', crossroadsInn: 'The Riverlands',
  harrenhal: 'The Riverlands', harrenhalHall: 'The Riverlands',
  /* The strongholds, each in the region whose town gate opens onto it. */
  stoneCrowHold: 'The Vale', stoneCrowCave: 'The Vale',
  seaDragonHold: 'Dragonstone', seaDragonVault: 'Dragonstone',
  kennelHold: 'The North', flayedHall: 'The North',
  sealordHold: 'Braavos', sealordPalace: 'Braavos',
  cheesemongerHold: 'Pentos', cheesemongerCellar: 'Pentos',
  blackWallHold: 'Volantis', elephantCourt: 'Volantis',
  fightingPits: 'Meereen', pitMasterRooms: 'Meereen',
  waterGardens: 'Dorne', pavilionOfOranges: 'Dorne',
  wreckersHold: 'The Stormlands', wreckersHall: 'The Stormlands',
  dragonstone: 'Dragonstone', dragonmont: 'Dragonstone',
  dragonstoneArmoury: 'Dragonstone',
  maesterHallDragonstone: 'Dragonstone',
};

/* Every inn and common house sits in the town it opens off. */
for (const town of Object.keys(REGIONS)) {
  if (REGIONS[`${town}Inn`] === undefined && MAPS[`${town}Inn`]) {
    REGIONS[`${town}Inn`] = REGIONS[town];
    REGIONS[`${town}House`] = REGIONS[town];
  }
}

/** The region a map belongs to, or an empty string if it has none. */
export function regionOf(key) {
  return REGIONS[key] ?? '';
}
