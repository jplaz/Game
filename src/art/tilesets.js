// Hand-drawn tiles, one character per pixel.
//
// Ground used to be a flat fill with per-pixel random speckle over the top. At
// sixteen pixels square that reads as static, not as a field — the eye sees
// grain everywhere and no shape anywhere. What the Game Boy games actually do
// is keep the ground almost flat and put a small number of deliberate marks on
// it, then cycle between a handful of drawings so it does not visibly repeat.
//
// That is what these are. Each ground is a few complete 16x16 drawings, and the
// map picks between them by position, so there is variety without noise.
//
// Every drawing lights from the top left: highlights on top and left edges,
// shadow on the bottom and right. Objects carry a dark keyline so they sit on
// the ground instead of dissolving into it.

// ------------------------------------------------------------------ grass --

const GRASS_KEY = {
  g: '#5f9c42',  // the field
  l: '#74b455',  // catching the light
  d: '#4a7c34',  // a tuft in shade
  D: '#3d6629',  // the deepest crease
};

const GRASS = [
  [
    'gggggggggggggggg',
    'gggggggglgggggdg',
    'ggdggggglggggddg',
    'ggddgggggggggggg',
    'gggggggggggggggg',
    'gggggggggggggggg',
    'ggggggggggddgggg',
    'glgggggggdDdgggg',
    'glggggggggggggll',
    'gggggggggggggggg',
    'gggggggggggggggg',
    'gggdgggggggggggg',
    'ggdDdggggggglggg',
    'gggggggggggglggg',
    'gggggggggggggggg',
    'gggggggggggggggg',
  ],
  [
    'gggggggggggggggg',
    'ggggggggggggggll',
    'gggddggggggggggg',
    'ggdDdgggglgggggg',
    'ggggggggglgggggg',
    'gggggggggggggggg',
    'gllgggggggggggdg',
    'gggggggggggggddg',
    'gggggggggggggggg',
    'ggggggggddgggggg',
    'gggggggdDdggggll',
    'gggggggggggggggg',
    'gggggggggggggggg',
    'gglgggggggggdggg',
    'gglggggggggdDdgg',
    'gggggggggggggggg',
  ],
  [
    'gggggggggggggggg',
    'ggddgggggggggggg',
    'gdDdgggggggglggg',
    'gggggggggggglggg',
    'gggggggggggggggg',
    'ggggggllgggggggg',
    'gggggggggggggggg',
    'gggddggggggggggg',
    'gggggggggggddggg',
    'gllggggggggdDdgg',
    'gggggggggggggggg',
    'gggggggggggggggg',
    'ggggggglgggggggg',
    'ggggggglggggggdg',
    'gggggggggggggddg',
    'gggggggggggggggg',
  ],
  [
    'gggggggggggggggg',
    'gggggggggggggggg',
    'gglggggggddggggg',
    'gglggggggdDdgggg',
    'gggggggggggggggg',
    'ggggggggggggggll',
    'gdgggggggggggggg',
    'gddgggggggggggll',
    'gggggggggggggggg',
    'ggggggggggggdggg',
    'gggllggggggdDdgg',
    'gggggggggggggggg',
    'gggggggggggggggg',
    'ggggddgggggggggg',
    'gggdDdggggglgggg',
    'gggggggggggglggg',
  ],
];

// ------------------------------------------------------------------- snow --

const SNOW_KEY = {
  s: '#d4e0ee',  // settled snow
  h: '#e8f0fa',  // the sun on it
  d: '#bccadd',  // a dip
  D: '#a6b6cc',  // a footprint's shadow
};

const SNOW = [
  [
    'ssssssssssssssss',
    'sssshhssssssssss',
    'ssssssssssssdsss',
    'ssssssssssssDdss',
    'ssssssssssssssss',
    'ssssssssssssssss',
    'ssddsssssssshhss',
    'ssDdssssssssssss',
    'ssssssssssssssss',
    'ssssssssssdddsss',
    'sssssssssdDdssss',
    'sshhssssssssssss',
    'ssssssssssssssss',
    'sssssssssssssdds',
    'ssssssssssssdDds',
    'ssssssssssssssss',
  ],
  [
    'ssssssssssssssss',
    'sssssssssdddssss',
    'sshhsssssdDdssss',
    'ssssssssssssssss',
    'ssssssssssssssss',
    'sssddsssssssssss',
    'sssDdsssssssshhs',
    'ssssssssssssssss',
    'ssssssssssssssss',
    'sssssssssssssdds',
    'ssssssssssssdDds',
    'ssssshhsssssssss',
    'ssssssssssssssss',
    'ssdddsssssssssss',
    'ssdDdsssssssssss',
    'ssssssssssssssss',
  ],
  [
    'ssssssssssssssss',
    'ssssssssssssssss',
    'ssssddssssshhsss',
    'sssdDdssssssssss',
    'ssssssssssssssss',
    'ssssssssssssssss',
    'sshhsssssssssdds',
    'ssssssssssssdDds',
    'ssssssssssssssss',
    'ssssssssssssssss',
    'ssssssssdddsssss',
    'sssssssdDdsshhss',
    'ssssssssssssssss',
    'ssssssssssssssss',
    'sssddsssssssssss',
    'sssDdsssssssssss',
  ],
];

// ------------------------------------------------------------------- dirt --

const DIRT_KEY = {
  e: '#a8895e',  // packed earth
  l: '#bd9f74',  // a dry patch
  d: '#8d7049',  // a rut
  D: '#6f573a',  // a stone pressed in
};

const DIRT = [
  [
    'eeeeeeeeeeeeeeee',
    'eelleeeeeeeeeeee',
    'eeeeeeeeeedeeeee',
    'eeeeeeeeeeDdeeee',
    'eeeeeeeeeeeeeeee',
    'eddeeeeeeeeeelle',
    'eDdeeeeeeeeeeeee',
    'eeeeeeeeeeeeeeee',
    'eeeeeeelleeeeeee',
    'eeeeeeeeeeeeeeee',
    'eeeeeeeeeeeedDee',
    'eelleeeeeeeeddee',
    'eeeeeeeeeeeeeeee',
    'eeeeedDeeeeeeeee',
    'eeeeeddeeeelleee',
    'eeeeeeeeeeeeeeee',
  ],
  [
    'eeeeeeeeeeeeeeee',
    'eeeeeeeedDeeeeee',
    'eeeeeeeeddeeelle',
    'eeeeeeeeeeeeeeee',
    'eelleeeeeeeeeeee',
    'eeeeeeeeeeeeeeee',
    'eeeeeeeeeeeedDee',
    'eeeddeeeeeeeddee',
    'eeeDdeeeeeeeeeee',
    'eeeeeeeeeelleeee',
    'eeeeeeeeeeeeeeee',
    'eeeeeeeeeeeeeeee',
    'ellleeeeedDeeeee',
    'eeeeeeeeeddeeeee',
    'eeeeeeeeeeeeeeee',
    'eeeeeeeeeeeeeeee',
  ],
];

// ------------------------------------------------------------------- sand --

const SAND_KEY = {
  n: '#dcc48c',
  l: '#eedaa4',
  d: '#c2a870',
  D: '#a68d58',
};

const SAND = [
  [
    'nnnnnnnnnnnnnnnn',
    'nnllnnnnnnnnnnnn',
    'nnnnnnnnnndnnnnn',
    'nnnnnnnnnnDdnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnllnn',
    'nddnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnllnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnndDnn',
    'nnllnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnndnnnnnnnnnn',
    'nnnnnDdnnnnllnnn',
    'nnnnnnnnnnnnnnnn',
  ],
  [
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnndDnnnnnn',
    'nnnnnnnnnnnnnlln',
    'nnnnnnnnnnnnnnnn',
    'nnllnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnndDnn',
    'nnnddnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnllnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nlllnnnnndDnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnn',
  ],
];

// ------------------------------------------------------------ cobblestone --

const COBBLE_KEY = {
  m: '#5b5346',  // mortar between the stones
  s: '#9d937c',
  h: '#b6ab92',  // the lit top of a stone
  d: '#82795f',  // the shaded foot of one
};

// Stones of uneven size with mortar between them, drawn so the pattern runs on
// across the tile seam rather than stamping a grid every sixteen pixels.
const COBBLE = [
  [
    'mmmmmmmmmmmmmmmm',
    'mhhhhmhhhhhmhhhm',
    'msssdmsssssmsssm',
    'msssdmsssssmsssm',
    'mdddmmmdddmmmddm',
    'mmmmmmmmmmmmmmmm',
    'mhhhhhhmhhhmhhhm',
    'msssssdmsssmsssm',
    'mdddddmmmddmmddm',
    'mmmmmmmmmmmmmmmm',
    'mhhhmhhhhhmhhhhm',
    'msssmssssdmssssm',
    'msssmssssdmssssm',
    'mdddmmdddmmmdddm',
    'mmmmmmmmmmmmmmmm',
    'mhhhhhhhmhhhhhhm',
  ],
  [
    'mmmmmmmmmmmmmmmm',
    'mhhhmhhhhmhhhhhm',
    'msssmssssmsssssm',
    'mdddmssssmsssssm',
    'mmmmmmdddmmdddmm',
    'mhhhhhmmmmmmmmmm',
    'msssssmhhhhhmhhm',
    'msssssmssssdmssm',
    'mdddddmdddddmddm',
    'mmmmmmmmmmmmmmmm',
    'mhhhhmhhhmhhhhhm',
    'mssssmsssmsssssm',
    'mdddmmdddmmssssm',
    'mmmmmmmmmmmdddmm',
    'mhhhhhhmhhhmmmmm',
    'mssssssmsssmhhhm',
  ],
];

// --------------------------------------------------------- keep flagstone --

const FLAG_KEY = {
  m: '#4a4740',
  s: '#8d8a80',
  h: '#a3a096',
  d: '#74716a',
};

const FLAGSTONE = [
  [
    'mmmmmmmmmmmmmmmm',
    'mhhhhhhhmhhhhhhm',
    'msssssssmsssssss',
    'msssssssmssssssm',
    'msssssssmssssssm',
    'msssssssmssssssm',
    'mddddddmmmdddddm',
    'mmmmmmmmmmmmmmmm',
    'mhhhhhhmhhhhhhhm',
    'mssssssmsssssssm',
    'mssssssmsssssssm',
    'mssssssmsssssssm',
    'mssssssmsssssssm',
    'mdddddmmmddddddm',
    'mmmmmmmmmmmmmmmm',
    'mhhhhhhhmhhhhhhm',
  ],
];

// ------------------------------------------------------------- cave floor --

const CAVE_KEY = {
  c: '#4e4a52',
  h: '#605c66',
  d: '#3c383f',
  D: '#2c2930',
};

const CAVE = [
  [
    'cccccccccccccccc',
    'cchhccccccccccdc',
    'ccccccccccccdDdc',
    'ccccccccccccccdc',
    'cccccccccccccccc',
    'cccddcccccccccch',
    'ccdDdccccccccccc',
    'cccccccccccccccc',
    'cccccccccchhcccc',
    'cccccccccccccccc',
    'ccccccccccccdccc',
    'cchccccccccddDdc',
    'cccccccccccccccc',
    'cccccccccccccccc',
    'ccccdDcccccccccc',
    'ccccddcccccchhcc',
  ],
];

// ------------------------------------------------------------------ index --

export const GROUND_ART = {
  grass: { rows: GRASS, key: GRASS_KEY },
  snow: { rows: SNOW, key: SNOW_KEY },
  dirt: { rows: DIRT, key: DIRT_KEY },
  sand: { rows: SAND, key: SAND_KEY },
  path: { rows: COBBLE, key: COBBLE_KEY },
  stone: { rows: FLAGSTONE, key: FLAG_KEY },
  cave: { rows: CAVE, key: CAVE_KEY },
};

// ------------------------------------------------------------- tall grass --

export const CLUMP_KEY = {
  '.': null,
  b: '#3d7c34',  // the body of the clump
  l: '#5aa348',  // blades catching light
  h: '#74c05c',  // the very tips
  d: '#2c5c28',  // where it meets the ground
};

// Cover you can be ambushed from. Drawn with an uneven top edge and open
// corners so a patch of it reads as undergrowth rather than as a row of
// identical stamped rectangles, which is what a filled block gives you.
export const TALL_GRASS = [
  [
    '................',
    '.....h....h.....',
    '..h..l..h.l...h.',
    '..l.blb.lblb..l.',
    '.blbbbbblbbbb.lb',
    'bbbbbbbbbbbbbbbb',
    'bbbllbbbbbllbbbb',
    'bbbbbbbbbbbbbbbb',
    'bblbbbbllbbbbbbb',
    'bbbbbbbbbbbbbbbb',
    'bbbbbbbbbbbllbbb',
    'bbllbbbbbbbbbbbb',
    'bbbbbbbbbbbbbbbb',
    'dbbbbbbbbbbbbbbd',
    'ddbdddbddddbdddd',
    '.dd..dd...dd..d.',
  ],
  [
    '................',
    '...h.....h......',
    '.h.l..h..l..h...',
    '.blb.lb.blb.lb..',
    'bbbbblbbbbbblbb.',
    'bbbbbbbbbbbbbbbb',
    'bbbbbllbbbbbbllb',
    'bbbbbbbbbbbbbbbb',
    'bllbbbbbbbllbbbb',
    'bbbbbbbbbbbbbbbb',
    'bbbbbbllbbbbbbbb',
    'bbbbbbbbbbbbbbbb',
    'bbbllbbbbbbbbllb',
    'dbbbbbbbbbbbbbbd',
    'dddbddddbdddbddd',
    '..d...dd...d..dd',
  ],
  [
    '................',
    '......h...h...h.',
    '...h..l.h.l.h.l.',
    '.b.lb.lbblblblb.',
    'blbbbbbbbbbbbbbb',
    'bbbbbbbbbbbbbbbb',
    'bbllbbbbbbbbllbb',
    'bbbbbbbbbbbbbbbb',
    'bbbbbllbbbbbbbbb',
    'bbbbbbbbbbbbbbbb',
    'bllbbbbbbbllbbbb',
    'bbbbbbbbbbbbbbbb',
    'bbbbbbbllbbbbbbb',
    'dbbbbbbbbbbbbbbd',
    'ddbdddbdddbddddb',
    '.dd...d..dd...d.',
  ],
];

// The same clump under snow, for the ground beyond the Neck.
export const SNOW_GRASS_KEY = {
  '.': null,
  b: '#6f8f84',
  l: '#93b0a4',
  h: '#c4dcd0',
  d: '#54706a',
};

// ------------------------------------------------------------------- tree --

export const TREE_KEY = {
  '.': null,
  k: '#183a22',  // keyline, so the tree sits on the ground
  d: '#255c33',  // shaded underside of the crown
  m: '#317a41',  // the mass of the leaves
  l: '#46a04f',  // lit side, up and to the left
  h: '#62c268',  // the highlight itself
  t: '#4a3520',  // trunk in shadow
  T: '#6b4d2c',  // trunk in light
};

// A single tree standing on its own. The old one was a flat dome with a stripe
// through it — this has a light source, a keyline, and a crown that is wider
// than its base so it reads as foliage rather than a lollipop.
export const LONE_TREE = [
  '.....kkkkk......',
  '...kkhhhllkk....',
  '..khhhlllllmk...',
  '.khhlllllmmmmk..',
  '.khlllllmmmmmdk.',
  'khlllmmmmmmmmddk',
  'khllmmmmmmmmmddk',
  'kdlmmmmmmmmmdddk',
  'kdmmmmmmmmmddddk',
  '.kdmmmmmmmdddkk.',
  '..kddmmmdddkk...',
  '...kkdddkkk.....',
  '.....kTtk.......',
  '.....kTtk.......',
  '....kkTttk......',
  '....kkkkkk......',
];

// ------------------------------------------------------------------- roof --

export const ROOF_KEY = {
  '.': null,
  k: '#4a1614',  // keyline and the gap under each course
  d: '#7c2b26',  // a tile in shadow
  m: '#9a3c34',  // the body of the tile
  l: '#b04a3e',  // its lit face
  h: '#c96353',  // the ridge of each tile, catching the sun
};

// Clay tiles in overlapping courses. The old roof was one flat lattice of
// identical shingles; these are staggered, and each course is a shade lighter
// toward the ridge, so a roof has a direction to it.
export const ROOF = [
  'hhlhhlhhlhhlhhlh',
  'mmlmmlmmlmmlmmlm',
  'mdmmdmmdmmdmmdmm',
  'kkkkkkkkkkkkkkkk',
  'lhhlhhlhhlhhlhhl',
  'lmmlmmlmmlmmlmml',
  'mmdmmdmmdmmdmmdm',
  'kkkkkkkkkkkkkkkk',
  'hhlhhlhhlhhlhhlh',
  'mmlmmlmmlmmlmmlm',
  'mdmmdmmdmmdmmdmm',
  'kkkkkkkkkkkkkkkk',
  'lhhlhhlhhlhhlhhl',
  'lmmlmmlmmlmmlmml',
  'mmdmmdmmdmmdmmdm',
  'kkkkkkkkkkkkkkkk',
];

// The ridge tile that caps a roof, lit along its very top.
export const ROOF_RIDGE = [
  'kkkkkkkkkkkkkkkk',
  'hhhhhhhhhhhhhhhh',
  'hhhhhhhhhhhhhhhh',
  'llllllllllllllll',
  'kkkkkkkkkkkkkkkk',
  'lhhlhhlhhlhhlhhl',
  'lmmlmmlmmlmmlmml',
  'mmdmmdmmdmmdmmdm',
  'kkkkkkkkkkkkkkkk',
  'hhlhhlhhlhhlhhlh',
  'mmlmmlmmlmmlmmlm',
  'mdmmdmmdmmdmmdmm',
  'kkkkkkkkkkkkkkkk',
  'lhhlhhlhhlhhlhhl',
  'lmmlmmlmmlmmlmml',
  'mmdmmdmmdmmdmmdm',
];

// The overhanging eave, with the shadow it throws on the wall beneath.
export const ROOF_EAVE = [
  'hhlhhlhhlhhlhhlh',
  'mmlmmlmmlmmlmmlm',
  'mdmmdmmdmmdmmdmm',
  'kkkkkkkkkkkkkkkk',
  'lhhlhhlhhlhhlhhl',
  'lmmlmmlmmlmmlmml',
  'mmdmmdmmdmmdmmdm',
  'kkkkkkkkkkkkkkkk',
  'hhlhhlhhlhhlhhlh',
  'mmlmmlmmlmmlmmlm',
  'mdmmdmmdmmdmmdmm',
  'hhhhhhhhhhhhhhhh',
  'llllllllllllllll',
  'kkkkkkkkkkkkkkkk',
  'kdkkdkkdkkdkkdkk',
  'kkkkkkkkkkkkkkkk',
];

// ------------------------------------------------------------------ cliff --

export const CLIFF_KEY = {
  '.': null,
  k: '#3a342b',  // the crack between blocks
  d: '#5f5648',  // a block face turned away
  m: '#7d7362',  // the block itself
  l: '#948972',  // its lit top edge
  h: '#b0a488',  // the very top of the cliff, in the sun
};

// Cut stone in courses, each block lit along its top and shaded down its right,
// so a cliff face has depth instead of being a speckled wall with lines on it.
export const CLIFF = [
  'llllllllllllllll',
  'mmmmmdmmmmmmmmdm',
  'mmmmmdmmmmmmmmdm',
  'dddddkddddddddkd',
  'kkkkkkkkkkkkkkkk',
  'llllllllllllllll',
  'mmdmmmmmmdmmmmmm',
  'mmdmmmmmmdmmmmmm',
  'ddkdddddddkddddd',
  'kkkkkkkkkkkkkkkk',
  'llllllllllllllll',
  'mmmmmmmdmmmmmmdm',
  'mmmmmmmdmmmmmmdm',
  'dddddddkddddddkd',
  'kkkkkkkkkkkkkkkk',
  'llllllllllllllll',
];

// The lip where a cliff meets the sky above it.
export const CLIFF_TOP = [
  'hhhhhhhhhhhhhhhh',
  'hhhhhhhhhhhhhhhh',
  'llllllllllllllll',
  'kkkkkkkkkkkkkkkk',
  'llllllllllllllll',
  'mmmmmdmmmmmmmmdm',
  'mmmmmdmmmmmmmmdm',
  'dddddkddddddddkd',
  'kkkkkkkkkkkkkkkk',
  'llllllllllllllll',
  'mmdmmmmmmdmmmmmm',
  'mmdmmmmmmdmmmmmm',
  'ddkdddddddkddddd',
  'kkkkkkkkkkkkkkkk',
  'llllllllllllllll',
  'mmmmmmmdmmmmmmdm',
];

// ------------------------------------------------------------------ water --

export const WATER_KEY = {
  '.': null,
  D: '#26509c',  // the deep
  m: '#3868c0',  // open water
  l: '#4a7cd4',  // a swell catching light
  h: '#7dabe8',  // a glint on the surface
};

// Two drawings the map alternates between, so the surface moves. The ripples
// are drawn as broken horizontal strokes rather than scattered pixels, which is
// what makes water read as water rather than as blue noise.
export const WATER = [
  [
    'mmmmmmmmmmmmmmmm',
    'mmmhhhmmmmmmmmmm',
    'mmmmmmmmmmhhhmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'DDmmmmmmmDDDmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmhhhmmmmmmmmm',
    'mmmmmmmmmmmmmhhh',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmDDDmmmmmmmm',
    'DDmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmhhhmmmmmmmhhmm',
    'mmmmmmmmmmmmmmmm',
  ],
  [
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmhhhmmmmm',
    'mmmmmmmmmmmmmmmm',
    'hhhmmmmmmmmmmhhh',
    'mmmmmmmmmmmmmmmm',
    'mmmmmDDDmmmmmmDD',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmhhhmmmm',
    'mmhhhmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmmmmDDDmmm',
    'mmmmmmmDDmmmmmmm',
    'mmmmmmmmmmmmmmmm',
    'mmmmmmmhhhmmmmmm',
    'mmmmmmmmmmmmmmmm',
  ],
];
