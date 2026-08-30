// Tiles are painted once into 16x16 offscreen canvases at boot. Each painter
// gets a deterministic hash so the speckling is stable between runs — the same
// patch of grass looks the same every time you walk past it.

import { makeCanvas } from '../engine/sprites.js';
import { paintArt } from './pixels.js';
import {
  GROUND_ART, TALL_GRASS, CLUMP_KEY, SNOW_GRASS_KEY, LONE_TREE, TREE_KEY,
  FLOWERS, FLOWER_KEY,
  FOREST_KEY, FOREST_MASS, FOREST_CROWN, FOREST_FOOT,
  PINE_KEY, LONE_PINE, PINE_MASS, PINE_CROWN, PINE_FOOT,
  ROOF, ROOF_RIDGE, ROOF_EAVE, ROOF_KEY,
  SLATE_KEY, PITCH_KEY, CLAY_KEY, THATCH_KEY,
  THATCH, THATCH_RIDGE, THATCH_EAVE,
  WEIRWOOD, WEIRWOOD_KEY,
  CLIFF, CLIFF_TOP, CLIFF_KEY, WATER, WATER_KEY,
} from './tilesets.js';

export const TILE = 16;

function hash(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Fills the tile with `base`, then speckles it with the given colours. */
function speckle(ctx, base, specks, seed) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TILE, TILE);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = hash(x, y, seed);
      for (const { color, chance, size = 1 } of specks) {
        if (n < chance) {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, size, size);
          break;
        }
      }
    }
  }
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/**
 * Darkens what has already been painted, rather than covering it. A cast
 * shadow has to keep the material it falls across visible underneath it - daub
 * in shadow is still daub - so this multiplies instead of filling.
 */
/**
 * The shadow a roof's overhang throws down the wall beneath it. A wall tile
 * with no wall of its own above it has a roof above it, which is when this
 * falls. Nothing else does as much to stop a house reading as a rectangle of
 * roof stuck on a rectangle of wall: the roof has to be in front of the wall,
 * and a cast shadow is what says so.
 */
function eaveShadow(ctx, mask) {
  if (mask & N) return;
  shade(ctx, 0, 3, TILE, 2, 0.5);
  shade(ctx, 0, 5, TILE, 1, 0.34);
  shade(ctx, 0, 6, TILE, 1, 0.2);
  shade(ctx, 0, 7, TILE, 1, 0.09);
}

function shade(ctx, x, y, w, h, amount) {
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.fillStyle = '#1a1208';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/**
 * Paints one of a ground's hand-drawn variants. Everything that used to fill a
 * rectangle and speckle it goes through here instead.
 */
function ground(ctx, name, variant = 0) {
  const set = GROUND_ART[name] ?? GROUND_ART.grass;
  paintArt(ctx, set.rows[variant % set.rows.length], set.key);
}

// How deep the fringe bites along each of the sixteen pixels of an edge. A
// fixed pattern rather than a random one, so the boundary is wavy in a way that
// repeats predictably instead of shimmering.
const FRINGE = [1, 2, 1, 1, 2, 2, 1, 2, 2, 1, 1, 2, 1, 2, 1, 1];

/**
 * Softens the join where one ground meets another. Two grounds butting up
 * against each other in a straight line is the single most artificial thing a
 * tile map can do; a shallow uneven band along the open sides reads as one
 * surface giving way to the next.
 */
function fringeEdges(ctx, mask, shade, deep) {
  if (!(mask & N)) {
    for (let x = 0; x < TILE; x++) {
      const d = FRINGE[x];
      rect(ctx, x, 0, 1, d, shade);
      if (d > 1) rect(ctx, x, 0, 1, 1, deep);
    }
  }
  if (!(mask & S)) {
    for (let x = 0; x < TILE; x++) {
      const d = FRINGE[(x + 5) % TILE];
      rect(ctx, x, TILE - d, 1, d, shade);
      if (d > 1) rect(ctx, x, TILE - 1, 1, 1, deep);
    }
  }
  if (!(mask & W)) {
    for (let y = 0; y < TILE; y++) {
      const d = FRINGE[(y + 9) % TILE];
      rect(ctx, 0, y, d, 1, shade);
      if (d > 1) rect(ctx, 0, y, 1, 1, deep);
    }
  }
  if (!(mask & E)) {
    for (let y = 0; y < TILE; y++) {
      const d = FRINGE[(y + 3) % TILE];
      rect(ctx, TILE - d, y, d, 1, shade);
      if (d > 1) rect(ctx, TILE - 1, y, 1, 1, deep);
    }
  }
}

/**
 * A block of woodland. The mass is one seamless drawing; where the block ends,
 * the crown catches the light along the top, trunks show along the bottom, and
 * the open sides get a keyline so the wood has an edge rather than fading out.
 */
function canopy(ctx, mask, massArt, crownArt, footArt, key) {
  paintArt(ctx, massArt, key);
  if (!(mask & N)) paintArt(ctx, crownArt, key);
  if (!(mask & S)) paintArt(ctx, footArt, key, 0, TILE - footArt.length);
  const line = key.k;
  if (!(mask & W)) rect(ctx, 0, 0, 1, TILE, line);
  if (!(mask & E)) rect(ctx, TILE - 1, 0, 1, TILE, line);
}

/** How many drawings a ground has, so the map knows how far to vary it. */
export function groundVariants(name) {
  return (GROUND_ART[name] ?? GROUND_ART.grass).rows.length;
}

/* ------------------------------------------------------- a dragon, drawn --
 *
 * Forty-eight pixels square, which is exactly three tiles by three: a dragon
 * lying with its wings out, seen from above like everything else in this
 * world. The bestiary's own dragon was tried here first and was wrong for the
 * job — a creature is painted face-on for a duel screen, so dropped onto a
 * beach it read as a mask nailed to the ground rather than an animal lying on
 * it. Nothing that goes on a map can be borrowed from something that goes on
 * a portrait.
 *
 * Balerion's colours: near-black scale with the fire showing through the
 * wings, which is what everything on Dragonstone is the colour of.
 */
const D_EDGE = '#0d0a12';        // the keyline, and the bones in the wing
const D_SCALE = '#241d2e';       // its back
const D_SCALE_LIT = '#3a3049';   // and the light down the middle of it
const D_WING = '#6f1a14';        // the membrane
const D_WING_LIT = '#9e2a1c';    // where the sun is through it
const D_HORN = '#8b8296';        // horns, claws and the ridge of the spine
const D_FIRE = '#f0a830';        // an eye

/* Every part of it is a polygon or a tapering worm, rasterised here rather
   than by the canvas, because a canvas fill feathers its edges and a feathered
   edge is not a pixel: it costs colours, and the cartridge has fifteen per
   tile to spend. */
function dragonTools(ctx) {
  const fill = (pts, colour) => {
    const lo = Math.max(0, Math.min(...pts.map((q) => q[1])));
    const hi = Math.min(47, Math.max(...pts.map((q) => q[1])));
    for (let y = lo; y <= hi; y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const a = Math.round(xs[i]), b = Math.round(xs[i + 1]);
        if (b >= a) rect(ctx, a, y, b - a + 1, 1, colour);
      }
    }
  };
  const stroke = (pts, colour, shut = true) => {
    for (let i = 0; i < (shut ? pts.length : pts.length - 1); i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
      for (let s = 0; s <= steps; s++) {
        rect(ctx, Math.round(x0 + ((x1 - x0) * s) / steps),
                  Math.round(y0 + ((y1 - y0) * s) / steps), 1, 1, colour);
      }
    }
  };
  const dot = (cx, cy, r, colour) => {
    for (let y = Math.ceil(cy - r); y <= cy + r; y++) {
      for (let x = Math.ceil(cx - r); x <= cx + r; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r + 0.25) {
          rect(ctx, x, y, 1, 1, colour);
        }
      }
    }
  };
  /* A neck, a tail or a leg: a line of shrinking circles down a path. Cheaper
     to steer than a polygon, and a dragon is mostly things that taper. */
  const worm = (path, r0, r1, colour) => {
    let run = 0;
    const legs = [];
    for (let i = 0; i + 1 < path.length; i++) {
      const d = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
      legs.push(d); run += d;
    }
    let gone = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const steps = Math.max(1, Math.ceil(legs[i] * 2));
      for (let s = 0; s <= steps; s++) {
        const t = (gone + (legs[i] * s) / steps) / run;
        dot(path[i][0] + ((path[i + 1][0] - path[i][0]) * s) / steps,
            path[i][1] + ((path[i + 1][1] - path[i][1]) * s) / steps,
            r0 + (r1 - r0) * t, colour);
      }
      gone += legs[i];
    }
  };
  return { fill, stroke, dot, worm };
}

/* Curled on its own ground with its head up: an S of neck, a long body, the
   wings folded over the back and the tail coming round the front of it. Two
   straight wings out either side was tried first and read as a moth every
   time — nothing symmetrical about a vertical line is ever going to be an
   animal at this size. The curl is what makes it one. */
const D_NECK = [[24, 26], [20, 20], [16, 15], [14, 10], [15, 6]];
const D_TAIL = [[32, 32], [35, 38], [32, 43], [25, 46], [16, 46], [9, 42]];
const D_BODY = [
  [20, 21], [26, 18], [32, 20], [36, 25], [35, 31],
  [30, 35], [23, 35], [19, 30], [18, 25],
];
const D_HEAD = [[17, 9], [14, 4], [9, 2], [5, 4], [7, 8], [12, 11], [17, 12]];
/* The near wing, folded along the spine, and the far one showing over it. */
const D_WING_NEAR = [[23, 19], [30, 12], [38, 12], [44, 18], [45, 25], [38, 21], [30, 19]];
const D_WING_FAR = [[26, 17], [32, 8], [40, 6], [46, 11], [46, 16], [40, 12], [32, 14]];
const D_RIBS = [[[27, 18], [37, 13]], [[29, 19], [41, 16]], [[31, 20], [44, 21]]];

let dragonArt = null;
function dragonCanvas() {
  if (dragonArt) return dragonArt;
  const { canvas, ctx } = makeCanvas(48, 48);
  const { fill, stroke, dot, worm } = dragonTools(ctx);

  // Back to front, the way it would be built if it were standing there.
  fill(D_WING_FAR, D_EDGE); stroke(D_WING_FAR, D_EDGE);
  fill(D_WING_FAR.map(([x, y]) => [x, y + 1]), D_WING);

  worm(D_TAIL, 4.4, 1.8, D_EDGE);
  worm(D_TAIL, 3.4, 1.1, D_SCALE);
  // The spade on the end of it, pointing the way the tail was going.
  fill([[13, 43], [8, 37], [3, 39], [3, 44], [9, 46]], D_EDGE);
  fill([[12, 43], [8, 39], [5, 40], [5, 43], [9, 45]], D_WING);

  for (const [from, to] of [[[22, 28], [15, 32]], [[30, 33], [27, 39]]]) {
    worm([from, to], 3.2, 1.8, D_EDGE);
    worm([from, to], 2.4, 1.2, D_SCALE);
    /* Three claws, short and stubby. Drawn long and pale to begin with, which
       from a tile away was a white starburst rather than a foot. */
    for (let i = -1; i <= 1; i++) {
      rect(ctx, to[0] - 3, to[1] + i * 2, 3, 1, D_EDGE);
      rect(ctx, to[0] - 3, to[1] + i * 2, 2, 1, D_HORN);
    }
  }

  fill(D_BODY, D_SCALE); stroke(D_BODY, D_EDGE);
  // The light along the top of its back, where the sun would be on it.
  fill([[22, 22], [27, 20], [32, 22], [33, 26], [28, 28], [23, 27]], D_SCALE_LIT);

  fill(D_WING_NEAR, D_WING); stroke(D_WING_NEAR, D_EDGE);
  fill([[23, 19], [30, 12], [38, 12], [41, 15], [33, 16], [27, 19]], D_WING_LIT);
  for (const rib of D_RIBS) stroke(rib, D_EDGE, false);

  worm(D_NECK, 4.6, 2.6, D_EDGE);
  worm(D_NECK, 3.6, 1.8, D_SCALE);
  /* The ridge of the spine, off the back of the skull and down the neck. Plates
     rather than points: a one-radius circle is a plus sign, and six plus signs
     down an animal's back read as sparkles on it. */
  for (const [x, y] of [[17, 8], [17, 12], [19, 16], [22, 20], [25, 23], [29, 24]]) {
    rect(ctx, x, y, 2, 2, D_EDGE);
    rect(ctx, x, y, 2, 1, D_HORN);
  }

  fill(D_HEAD, D_SCALE); stroke(D_HEAD, D_EDGE);
  fill([[16, 9], [13, 5], [9, 3], [6, 5], [9, 8], [14, 10]], D_SCALE_LIT);
  stroke([[7, 7], [12, 10]], D_EDGE, false);              // the line of the jaw
  rect(ctx, 10, 5, 2, 2, D_FIRE);                          // and an eye in it
  rect(ctx, 11, 6, 1, 1, D_EDGE);
  rect(ctx, 5, 4, 1, 1, D_EDGE);                           // a nostril
  /* Horns, swept back off the skull. Two, thick, and short enough to belong to
     the head: three long pale ones made it a moth with antennae, which is the
     second time this drawing has gone that way. */
  for (const horn of [[[14, 4], [18, 1], [22, 1]], [[15, 8], [19, 6], [22, 7]]]) {
    worm(horn, 2.2, 0.6, D_EDGE);
    worm(horn, 1.4, 0.4, D_HORN);
  }

  dragonArt = canvas;
  return dragonArt;
}

/* One painter per ninth, named dragon1 to dragon9, reading left to right and
   top to bottom exactly as the nine characters do in a map row. */
const DRAGON_TILES = {};
for (let i = 0; i < 9; i++) {
  const col = i % 3, row = (i / 3) | 0;
  DRAGON_TILES[`dragon${i + 1}`] = (ctx, _frame, _mask, under = GROUNDS.stone, variant = 0) => {
    under(ctx, variant);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(dragonCanvas(), col * TILE, row * TILE, TILE, TILE, 0, 0, TILE, TILE);
  };
}

// ---------------------------------------------------------------- painters --

const painters = {
  grass(ctx, _frame, mask = 15, _ground, variant = 0) {
    ground(ctx, 'grass', variant);
    fringeEdges(ctx, mask, '#4a7c34', '#3d6629');
  },

  tallGrass(ctx, frame = 0, _mask, _ground, variant = 0) {
    ground(ctx, 'grass', variant);
    // The sway is the clump leaning: two of the drawings, alternating.
    const rows = TALL_GRASS[(variant + frame) % TALL_GRASS.length];
    paintArt(ctx, rows, CLUMP_KEY);
  },

  snowGrass(ctx, frame = 0, _mask, _ground, variant = 0) {
    ground(ctx, 'snow', variant);
    const rows = TALL_GRASS[(variant + frame) % TALL_GRASS.length];
    paintArt(ctx, rows, SNOW_GRASS_KEY);
  },

  snow(ctx, _frame, mask = 15, _ground, variant = 0) {
    ground(ctx, 'snow', variant);
    fringeEdges(ctx, mask, '#bccadd', '#a6b6cc');
  },

  /** A country track: packed earth, wheel ruts, and loose gravel. */
  dirt(ctx, _frame, mask = 15, _ground, variant = 0) {
    ground(ctx, 'dirt', variant);
    fringeEdges(ctx, mask, '#8d7049', '#6f573a');
  },

  path(ctx, _frame, _mask, _ground, variant = 0) {
    ground(ctx, 'path', variant);
  },

  sand(ctx, _frame, mask = 15, _ground, variant = 0) {
    ground(ctx, 'sand', variant);
    fringeEdges(ctx, mask, '#c2a870', '#a68d58');
  },

  stone(ctx, _frame, mask = 15, _ground, variant = 0) {
    ground(ctx, 'stone', variant);
    fringeEdges(ctx, mask, '#74716a', '#4a4740');
  },

  water(ctx, frame, mask) {
    paintArt(ctx, WATER[frame % WATER.length], WATER_KEY);
    // Foam where the water meets land. Uneven along its length, or a pond ends
    // up looking like a tiled swimming bath.
    fringeEdges(ctx, mask, '#cfe8fa', '#7fb2e4');
  },

  ice(ctx, frame) {
    speckle(ctx, '#9fd0e8', [
      { color: '#c6e8f6', chance: 0.16 },
      { color: '#7fb4d4', chance: 0.2 },
    ], 67);
    const shine = frame ? 2 : 10;
    rect(ctx, shine, 3, 4, 1, '#eaf8ff');
    rect(ctx, shine + 1, 4, 2, 1, '#eaf8ff');
  },

  // Forest canopy. Interior tiles are seamless; edge tiles get a lit rim on
  // the open side and a trunk where the mass ends at the bottom.
  tree(ctx, _frame, mask, ground = painters.grass) {
    ground(ctx);

    // A tile with open sky above and below is a single tree, not a slice of
    // canopy — drawing it as canopy is what makes scattered woodland read as
    // random green bars.
    if (!(mask & N) && !(mask & S)) {
      painters.loneTree(ctx);
      return;
    }
    canopy(ctx, mask, FOREST_MASS, FOREST_CROWN, FOREST_FOOT, FOREST_KEY);
  },

  // A single round tree: canopy, highlight and trunk.
  /** A tree standing on its own, drawn pixel by pixel in tilesets.js. */
  loneTree(ctx) {
    paintArt(ctx, LONE_TREE, TREE_KEY);
  },

  pine(ctx, _frame, mask, ground = painters.snow) {
    ground(ctx);
    if (!(mask & N) && !(mask & S)) {
      paintArt(ctx, LONE_PINE, PINE_KEY);
      return;
    }
    canopy(ctx, mask, PINE_MASS, PINE_CROWN, PINE_FOOT, PINE_KEY);
  },

  // The heart tree of the North: bone-white bark, blood-red leaves.
  weirwood(ctx, _frame, _mask, ground = painters.grass) {
    ground(ctx);
    paintArt(ctx, WEIRWOOD, WEIRWOOD_KEY);
  },

  cliff(ctx, _frame, mask) {
    if (!(mask & N)) paintArt(ctx, CLIFF_TOP, CLIFF_KEY);
    else paintArt(ctx, CLIFF, CLIFF_KEY);
    if (!(mask & W)) rect(ctx, 0, 0, 1, TILE, CLIFF_KEY.k);
    if (!(mask & E)) rect(ctx, TILE - 1, 0, 1, TILE, CLIFF_KEY.k);
    if (!(mask & S)) rect(ctx, 0, TILE - 2, TILE, 2, '#2b261f');
  },

  wall(ctx, _frame, mask) { timberWall(ctx, mask, WALL_DAUB); },
  /* The same house, limewashed. Every trade building in every town was the
     identical daub-and-timber box, so a maester's hall could only be told from
     a granary by opening it. A hall is whitewashed and keeps its region's
     roof; a forge is dressed stone under tarred board. */
  wallPale(ctx, _frame, mask) { timberWall(ctx, mask, WALL_LIME); },


  /** Dressed castle stone: big coursed ashlar blocks, cool and heavy. */
  ashlar(ctx, _frame, mask) {
    rect(ctx, 0, 0, TILE, TILE, '#5b5b5f');
    const tones = ['#7e7e86', '#75757d', '#87878f', '#6e6e76'];
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const offset = row % 2 ? 4 : 0;
      for (let cell = -1; cell < 3; cell++) {
        const x = cell * 8 + offset;
        const tone = tones[(row * 2 + ((cell % 2) + 2) % 2) % 4];
        rect(ctx, x, y, 7, 3, tone);
        rect(ctx, x, y, 7, 1, '#93939c');
        rect(ctx, x, y + 2, 7, 1, '#535359');
      }
    }
    if (!(mask & W)) rect(ctx, 0, 0, 1, TILE, '#3a3a3f');
    if (!(mask & E)) rect(ctx, TILE - 1, 0, 1, TILE, '#3a3a3f');
    if (!(mask & S)) {
      rect(ctx, 0, TILE - 2, TILE, 2, '#3a3a3f');
      rect(ctx, 0, TILE - 2, TILE, 1, '#4a4a50');
    }
  },

  /** The crenellated top of a castle wall: merlons with shadowed embrasures. */
  battlement(ctx, _frame, mask) {
    painters.ashlar(ctx, 0, mask | N);
    // Merlons crown the topmost course only. Further down a wall run the tile
    // is plain ashlar, or the crenellations would repeat every sixteen pixels.
    if (mask & N) {
      if (!(mask & W)) rect(ctx, 0, 0, 1, TILE, '#3a3a3f');
      if (!(mask & E)) rect(ctx, TILE - 1, 0, 1, TILE, '#3a3a3f');
      return;
    }
    // Embrasures: the gaps between merlons show the shadowed far parapet.
    rect(ctx, 0, 0, TILE, 6, '#2f2f34');
    for (let cell = 0; cell < 2; cell++) {
      const x = cell * 8;
      rect(ctx, x, 0, 5, 6, '#7d7d86');
      rect(ctx, x, 0, 5, 1, '#9a9aa3');
      rect(ctx, x, 5, 5, 1, '#4d4d53');
      rect(ctx, x + 4, 0, 1, 6, '#4d4d53');
    }
    rect(ctx, 0, 6, TILE, 1, '#3a3a3f');
    if (!(mask & W)) rect(ctx, 0, 0, 1, TILE, '#3a3a3f');
    if (!(mask & E)) rect(ctx, TILE - 1, 0, 1, TILE, '#3a3a3f');
  },

  /** A house banner hung down a castle wall. */
  banner(ctx, _frame, _mask, _ground, cloth = '#8c2630', trim = '#e8c060',
         shade = '#5e161d') {
    painters.ashlar(ctx, 0, N | S | E | W);
    // The rail it hangs from, with a bracket at each end.
    rect(ctx, 1, 0, 14, 2, '#3a2c1c');
    rect(ctx, 1, 0, 14, 1, '#6d5738');
    rect(ctx, 1, 2, 1, 2, '#3a2c1c');
    rect(ctx, 14, 2, 1, 2, '#3a2c1c');

    // The cloth: full-width, edge-lit on the left and falling into shade.
    rect(ctx, 2, 2, 12, 12, shade);
    rect(ctx, 2, 2, 9, 12, cloth);
    rect(ctx, 2, 2, 1, 12, trim);
    rect(ctx, 13, 2, 1, 12, trim);
    rect(ctx, 2, 2, 12, 1, trim);

    // A charge in the centre, and the swallow-tailed hem.
    rect(ctx, 6, 5, 4, 1, trim);
    rect(ctx, 5, 6, 1, 3, trim);
    rect(ctx, 10, 6, 1, 3, trim);
    rect(ctx, 7, 6, 2, 5, trim);
    rect(ctx, 6, 9, 4, 1, trim);
    rect(ctx, 2, 14, 3, 2, cloth);
    rect(ctx, 11, 14, 3, 2, shade);
    rect(ctx, 7, 14, 2, 2, cloth);
    rect(ctx, 2, 14, 1, 2, trim);
    rect(ctx, 13, 14, 1, 2, trim);
  },

  bannerGrey(ctx, _frame, mask) {
    painters.banner(ctx, 0, mask, null, '#4a5364', '#dfe4ee', '#333a47');
  },

  roof(ctx, _frame, mask) { roofBody(ctx, mask, ROOF, ROOF_RIDGE, ROOF_EAVE, ROOF_KEY); },
  roofNorth(ctx, _frame, mask) { roofCap(ctx, mask, painters.roof, ROOF_KEY); },

  // The same house in the materials the rest of Westeros builds with. A town's
  // roofs are the largest block of colour on the screen, so this is most of
  // what makes the Wall not look like the Reach.
  roofSlate(ctx, _frame, mask) { roofBody(ctx, mask, ROOF, ROOF_RIDGE, ROOF_EAVE, SLATE_KEY); },
  roofSlateCap(ctx, _frame, mask) { roofCap(ctx, mask, painters.roofSlate, SLATE_KEY); },
  roofPitch(ctx, _frame, mask) { roofBody(ctx, mask, ROOF, ROOF_RIDGE, ROOF_EAVE, PITCH_KEY); },
  roofPitchCap(ctx, _frame, mask) { roofCap(ctx, mask, painters.roofPitch, PITCH_KEY); },
  roofClay(ctx, _frame, mask) { roofBody(ctx, mask, ROOF, ROOF_RIDGE, ROOF_EAVE, CLAY_KEY); },
  roofClayCap(ctx, _frame, mask) { roofCap(ctx, mask, painters.roofClay, CLAY_KEY); },
  roofThatch(ctx, _frame, mask) { roofBody(ctx, mask, THATCH, THATCH_RIDGE, THATCH_EAVE, THATCH_KEY); },
  roofThatchCap(ctx, _frame, mask) { roofCap(ctx, mask, painters.roofThatch, THATCH_KEY); },

  /* A forge chimney, standing above the ridge of the smithy roof.
     Every town's trade buildings were the same daub-and-timber house with the
     same roof, so a blacksmith was indistinguishable from a granary until you
     had walked up and opened the door. A stone stack with smoke coming out of
     it says "forge" from the far side of the square, which is the whole job. */
  chimney(ctx, frame, _mask, ground = painters.grass) {
    ground(ctx);
    // The stack: coursed stone, lit down the left, in shadow down the right.
    rect(ctx, 5, 7, 6, TILE - 7, '#5b5b5f');
    rect(ctx, 5, 7, 4, TILE - 7, '#75757d');
    rect(ctx, 5, 7, 1, TILE - 7, '#93939c');
    rect(ctx, 10, 7, 1, TILE - 7, '#3a3a3f');
    for (let y = 9; y < TILE; y += 3) rect(ctx, 5, y, 6, 1, '#535359');
    // A corbelled cap, a course proud of the stack on both sides.
    rect(ctx, 4, 5, 8, 3, '#6e6e76');
    rect(ctx, 4, 5, 8, 1, '#93939c');
    rect(ctx, 4, 7, 8, 1, '#3a3a3f');
    // The flue, dark, with the fire below showing in it.
    rect(ctx, 6, 5, 4, 2, '#241f1c');
    rect(ctx, 6, 6, 4, 1, '#100e0e');
    // Smoke, drifting east and thinning as it goes. Pale rather than stone
    // grey, or it reads as more chimney: two frames, so a working forge is the
    // one moving thing on a quiet street.
    const drift = frame ? 1 : 0;
    rect(ctx, 6 + drift, 2, 4, 3, '#dfe4ee');
    rect(ctx, 7 + drift, 1, 4, 2, '#dfe4ee');
    rect(ctx, 6 + drift, 4, 4, 1, '#93939c');
    rect(ctx, 10 + drift, 0, 4, 2, '#dfe4ee');
    rect(ctx, 10 + drift, 2, 3, 1, '#93939c');
    rect(ctx, 13 - drift, 0, 3, 1, '#93939c');
  },

  /* Hanging trade signs, bracketed off the wall beside a door. A town's
     buildings only told you what they were by being opened, which is no use
     from the other side of a square. */
  signSmith(ctx, _frame, mask) {
    painters.ashlar(ctx, 0, mask | N | E | S | W);
    shingle(ctx, '#c3b088', '#4a3820', (c) => {
      rect(c, 4, 9, 8, 2, '#2c2013');       // the anvil face
      rect(c, 3, 9, 2, 1, '#2c2013');       // its horn
      rect(c, 7, 11, 2, 1, '#2c2013');      // its waist
      rect(c, 5, 12, 6, 1, '#2c2013');      // and its foot
      rect(c, 7, 6, 5, 2, '#2c2013');       // the hammer head
      rect(c, 4, 7, 3, 1, '#7a5a30');       // and its haft
    });
  },
  signMaester(ctx, _frame, mask) {
    painters.wallPale(ctx, 0, mask | N | E | S | W);
    shingle(ctx, '#b0a894', '#5c5648', (c) => {
      // Five links of five metals, sagging the way a chain hangs.
      const metal = ['#c8c8d0', '#c8a24a', '#a8763c', '#8ca0b8', '#d8d8e0'];
      const sag = [7, 9, 10, 9, 7];
      for (let i = 0; i < 5; i++) {
        rect(c, 3 + i * 2, sag[i], 2, 2, '#5c5648');
        rect(c, 3 + i * 2, sag[i], 2, 1, metal[i]);
        rect(c, 3 + i * 2, sag[i] + 1, 1, 1, metal[i]);
      }
    });
  },

  /* ------------------------------------------------------ inside things ---
     Every trade building had the same room in it: a stone floor, a yellow
     counter and two crates. A forge should have a fire in it and something to
     beat steel on; a maester's hall should have beds and birds. All of it is
     drawn out of colours the palette already holds, because the palette is
     full. */

  /* An anvil on its oak block, the way one actually stands. */
  anvil(ctx) {
    painters.floorStone(ctx);
    rect(ctx, 4, 10, 8, 6, '#5b4023');        // the oak block it stands on
    rect(ctx, 4, 10, 8, 1, '#8a5f33');
    rect(ctx, 4, 15, 8, 1, '#2c2013');
    rect(ctx, 5, 12, 1, 3, '#3a2c1c');
    rect(ctx, 10, 12, 1, 3, '#3a2c1c');
    rect(ctx, 2, 5, 12, 4, '#3a3a3f');        // the face, wide and heavy
    rect(ctx, 2, 5, 12, 1, '#93939c');
    rect(ctx, 2, 8, 12, 1, '#100e0e');
    rect(ctx, 0, 5, 3, 3, '#3a3a3f');         // the horn, off the near end
    rect(ctx, 0, 5, 3, 1, '#75757d');
    rect(ctx, 5, 9, 6, 2, '#241f1c');         // and the waist under it
    rect(ctx, 5, 9, 6, 1, '#5b5b5f');
  },

  /* The forge fire itself: a stone hearth under a hood, with coals in it. */
  forgeHearth(ctx) {
    painters.ashlar(ctx, 0, N | E | W);
    rect(ctx, 1, 0, 14, 4, '#3a3a3f');        // the hood
    rect(ctx, 1, 3, 14, 1, '#5b5b5f');
    rect(ctx, 2, 4, 12, 9, '#241f1c');        // the firebox
    rect(ctx, 3, 5, 10, 7, '#100e0e');
    rect(ctx, 4, 8, 8, 4, '#e06a20');         // and the coals in it
    rect(ctx, 5, 9, 6, 3, '#f0a830');
    rect(ctx, 6, 10, 4, 1, '#f6de70');
    rect(ctx, 5, 6, 2, 2, '#e06a20');
    rect(ctx, 9, 6, 2, 2, '#e06a20');
    rect(ctx, 1, 13, 14, 3, '#6a5c4c');       // the hearthstone
    rect(ctx, 1, 13, 14, 1, '#938a78');
  },

  /* A rack of spears and blades stood against the wall. */
  armsRack(ctx) {
    painters.floorStone(ctx);
    rect(ctx, 0, 12, TILE, 3, '#4a3722');     // the trestle
    rect(ctx, 0, 12, TILE, 1, '#6b5334');
    rect(ctx, 0, 1, TILE, 2, '#4a3722');      // and the rail it leans on
    for (let i = 0; i < 4; i++) {
      const x = 2 + i * 4;
      rect(ctx, x, 2, 1, 11, '#5b4023');      // hafts
      rect(ctx, x, 2, 1, 4, '#93939c');       // heads
      rect(ctx, x - 1, 3, 3, 1, '#75757d');
    }
    rect(ctx, 0, 14, TILE, 2, '#2c2013');
  },

  /* A raven in a wicker cage: what a maester's hall has that nothing else does. */
  ravenCage(ctx) {
    painters.floorStone(ctx);
    rect(ctx, 2, 2, 12, 13, '#5b4023');
    rect(ctx, 3, 3, 10, 11, '#241f1c');
    rect(ctx, 2, 2, 12, 2, '#8a5f33');        // the hoop
    rect(ctx, 2, 13, 12, 2, '#8a5f33');
    rect(ctx, 5, 6, 6, 7, '#100e0e');         // the bird
    rect(ctx, 6, 4, 4, 3, '#100e0e');
    rect(ctx, 9, 5, 2, 1, '#f0a830');         // beak
    rect(ctx, 7, 5, 1, 1, '#f6de70');         // eye
    for (let x = 3; x < 13; x += 3) rect(ctx, x, 4, 1, 9, '#8a5f33');
  },

  /* A hearth, for the rooms people live in rather than work in. */
  hearth(ctx) {
    painters.ashlar(ctx, 0, N | E | W);
    rect(ctx, 2, 3, 12, 11, '#241f1c');
    rect(ctx, 3, 4, 10, 9, '#100e0e');
    rect(ctx, 4, 6, 3, 6, '#5b4023');         // logs
    rect(ctx, 9, 6, 3, 6, '#5b4023');
    rect(ctx, 4, 6, 3, 1, '#8a5f33');
    rect(ctx, 9, 6, 3, 1, '#8a5f33');
    rect(ctx, 5, 8, 6, 5, '#e06a20');         // and the fire between them
    rect(ctx, 6, 9, 4, 4, '#f0a830');
    rect(ctx, 7, 11, 2, 2, '#f6de70');
    rect(ctx, 1, 14, 14, 2, '#6a5c4c');
    rect(ctx, 1, 14, 14, 1, '#938a78');
  },

  /* A chest. Not a decoration: there is something in every one of them, and the
     lid stays up once you have had it. */
  chest(ctx, _frame, _mask, ground = painters.grass) {
    ground(ctx);
    rect(ctx, 1, 4, 14, 11, '#2c2013');          // the body, in shadow
    rect(ctx, 2, 5, 12, 9, '#6a4a2a');
    rect(ctx, 2, 5, 12, 1, '#8a6438');
    rect(ctx, 2, 12, 12, 2, '#4a3722');
    rect(ctx, 1, 2, 14, 4, '#2c2013');           // the lid
    rect(ctx, 2, 3, 12, 3, '#8a5f33');
    rect(ctx, 2, 3, 12, 1, '#b9884c');
    // Iron bands and a lockplate.
    rect(ctx, 4, 2, 2, 12, '#3a3a3f');
    rect(ctx, 10, 2, 2, 12, '#3a3a3f');
    rect(ctx, 4, 3, 1, 11, '#75757d');
    rect(ctx, 10, 3, 1, 11, '#75757d');
    rect(ctx, 6, 6, 4, 4, '#3a3a3f');
    rect(ctx, 7, 7, 2, 2, '#c8a24a');
    rect(ctx, 1, 14, 14, 2, '#1a1410');          // and what it stands in
  },

  /* A raven post over a maester's hall: the same silhouette in every town, so
     the place that patches you up can be found from across a square the way the
     forge can be found by its chimney. */
  ravenPost(ctx, frame, _mask, ground = painters.grass) {
    ground(ctx);
    rect(ctx, 7, 4, 2, 12, '#4a3722');           // the post
    rect(ctx, 7, 4, 1, 12, '#6b5334');
    rect(ctx, 3, 5, 10, 2, '#4a3722');           // the crossbar
    rect(ctx, 3, 5, 10, 1, '#6b5334');
    rect(ctx, 3, 7, 1, 2, '#3a2c1c');
    rect(ctx, 12, 7, 1, 2, '#3a2c1c');
    // Two birds on it, and one of them shifts.
    const hop = frame ? 1 : 0;
    rect(ctx, 3, 1 + hop, 3, 4, '#100e0e');
    rect(ctx, 2, 2 + hop, 2, 2, '#100e0e');
    rect(ctx, 5, 2 + hop, 1, 1, '#f0a830');
    rect(ctx, 10, 1, 3, 4, '#100e0e');
    rect(ctx, 12, 2, 2, 2, '#100e0e');
    rect(ctx, 9, 2, 1, 1, '#f0a830');
    // A maester's chain hung from the bar, which is the sign itself.
    const metal = ['#c8c8d0', '#c8a24a', '#a8763c', '#8ca0b8'];
    for (let i = 0; i < 4; i++) rect(ctx, 6 + i, 8 + (i & 1), 2, 2, metal[i]);
  },

  door(ctx) {
    painters.wall(ctx, 0, 0);
    // The frame: dressed stone jambs and a lintel, standing a little proud of
    // the daub, so the doorway is a hole in a wall rather than a brown patch
    // painted on one.
    rect(ctx, 1, 2, 14, 14, '#7d7466');
    rect(ctx, 1, 2, 14, 1, '#9d9484');
    rect(ctx, 1, 3, 1, 13, '#9d9484');
    rect(ctx, 14, 3, 1, 13, '#5d564b');
    // The reveal: the inside face of the frame, in shadow on the left.
    rect(ctx, 3, 4, 10, 12, '#241a10');
    // The door itself, set back into it.
    rect(ctx, 4, 5, 8, 11, '#6b4a2a');
    rect(ctx, 4, 5, 4, 11, '#7d5a34');
    rect(ctx, 4, 5, 8, 1, '#8a6740');
    rect(ctx, 8, 5, 1, 11, '#4d3620');
    rect(ctx, 11, 5, 1, 11, '#3d2a18');
    // Iron bands and a ring handle.
    rect(ctx, 4, 8, 8, 1, '#4a4038');
    rect(ctx, 4, 13, 8, 1, '#4a4038');
    rect(ctx, 10, 10, 2, 2, '#e0c060');
    // A worn step, so the door meets the ground instead of stopping at it.
    rect(ctx, 2, 15, 12, 1, '#8d8474');
    eaveShadow(ctx, 0);
  },

  window(ctx) {
    painters.wall(ctx, 0, 0);
    // Lintel above, sill below, and the glass set back behind both.
    rect(ctx, 2, 4, 12, 1, '#8d8474');
    rect(ctx, 3, 5, 10, 8, '#2c3446');
    rect(ctx, 4, 6, 8, 6, '#5f8fae');
    // Light comes from up and to the left, so that corner of the pane is sky
    // and the rest of it is the dark of a room.
    rect(ctx, 4, 6, 4, 3, '#8fbcd6');
    rect(ctx, 4, 6, 2, 2, '#b3d8ea');
    rect(ctx, 7, 5, 1, 8, '#2c3446');
    rect(ctx, 3, 8, 10, 1, '#2c3446');
    rect(ctx, 2, 13, 12, 2, '#9d9484');
    rect(ctx, 2, 14, 12, 1, '#6a6255');
    shade(ctx, 3, 15, 10, 1, 0.3);
    eaveShadow(ctx, 0);
  },

  sign(ctx, _frame, _mask, ground = painters.grass) {
    ground(ctx);
    rect(ctx, 7, 10, 2, 6, '#5b4023');
    rect(ctx, 2, 3, 12, 8, '#8a5f33');
    rect(ctx, 3, 4, 10, 6, '#b9884c');
    rect(ctx, 4, 5, 8, 1, '#7a5228');
    rect(ctx, 4, 7, 6, 1, '#7a5228');
  },

  flowers(ctx, _frame, _mask, ground = painters.grass, variant = 0) {
    ground(ctx, variant);
    paintArt(ctx, FLOWERS[variant % FLOWERS.length], FLOWER_KEY);
  },

  // Walk-off-only edge; the player hops south and cannot climb back up.
  ledge(ctx, _frame, _mask, ground = painters.grass) {
    ground(ctx);
    // A grassy lip, then the earth face you drop down.
    rect(ctx, 0, 5, TILE, 2, '#4f8c34');
    rect(ctx, 0, 7, TILE, 9, '#8a7550');
    rect(ctx, 0, 7, TILE, 1, '#ab9468');
    rect(ctx, 0, TILE - 2, TILE, 2, '#5d5136');
    for (let x = 2; x < TILE - 2; x += 6) {
      rect(ctx, x, 10, 3, 2, '#75623f');
      rect(ctx, x + 1, 9, 2, 1, '#9c885e');
    }
    // The little downward chevron that marks a one-way hop.
    rect(ctx, 6, 11, 4, 1, '#e8dcc0');
    rect(ctx, 7, 12, 2, 1, '#e8dcc0');
  },

  // A plank bridge. Water runs under it, so the painter lays the river down
  // first and then builds on top of it: a bridge tile dropped into a lake has
  // to look like a bridge over a lake and not a plank floating in a pond.
  bridge(ctx, frame, mask) {
    painters.water(ctx, frame, mask);
    // Deck.
    rect(ctx, 0, 3, TILE, 10, '#8a6238');
    rect(ctx, 0, 3, TILE, 1, '#ad7f4c');
    rect(ctx, 0, 12, TILE, 1, '#5d3f22');
    for (let x = 0; x < TILE; x += 4) rect(ctx, x, 3, 1, 10, '#6f4c29');
    // Handrails either side, so the deck has a near edge and a far one.
    rect(ctx, 0, 1, TILE, 2, '#6f4c29');
    rect(ctx, 0, 1, TILE, 1, '#9a7043');
    rect(ctx, 0, 13, TILE, 2, '#4a3018');
    for (let x = 2; x < TILE; x += 7) {
      rect(ctx, x, 0, 2, 4, '#7a5530');
      rect(ctx, x, 12, 2, 4, '#5d3f22');
    }
  },

  // A rope bridge over nothing at all - the Iron Islands hang these between
  // sea stacks, and looking down off one is most of the point of Pyke.
  ropeBridge(ctx, frame, mask) {
    painters.openSky(ctx, frame, mask);
    for (let x = 0; x < TILE; x += 5) {
      rect(ctx, x, 5, 3, 6, '#8a6238');
      rect(ctx, x, 5, 3, 1, '#ab8050');
    }
    rect(ctx, 0, 4, TILE, 1, '#c8b48c');       // the two ropes it hangs from
    rect(ctx, 0, 11, TILE, 1, '#96866a');
    for (let x = 1; x < TILE; x += 4) {
      rect(ctx, x, 1, 1, 3, '#a89878');
      rect(ctx, x, 12, 1, 3, '#7d6f56');
    }
  },

  // Open sky, off the edge of a mountain or a sea stack. Solid, because you
  // cannot walk on it, and moving, because otherwise a whole map edge of it
  // reads as a wall painted blue.
  openSky(ctx, frame) {
    speckle(ctx, '#8fb6d8', [
      { color: '#a3c6e2', chance: 0.1 },
      { color: '#7ba4c8', chance: 0.14 },
    ], 41);
    const drift = frame ? 3 : 0;
    for (const [x, y, w] of [[1, 3, 7], [9, 9, 6], [4, 12, 5]]) {
      rect(ctx, (x + drift) % TILE, y, w, 2, '#c8dcee');
      rect(ctx, (x + drift + 1) % TILE, y - 1, w - 2, 1, '#dceaf6');
    }
  },

  /* Post-and-rail, and it has to know its neighbours. Drawn without a mask
     every tile lays the same two horizontal rails, so a corner comes out as
     two runs of rail crossing in mid-air with nothing joining them, and a pen
     reads as loose sticks dropped in the snow. A post in every tile, rails
     only towards the neighbours that are actually there. */
  fence(ctx, _frame, mask, ground = painters.grass) {
    ground(ctx);
    const RAIL = '#8a6a3e', LIT = '#a8834f', DARK = '#5f4626', POST = '#9c7a48';
    const rail = (x, y, w, h) => {
      rect(ctx, x, y, w, h, RAIL);
      rect(ctx, x, y, w, 1, LIT);
      rect(ctx, x, y + h - 1, w, 1, DARK);
    };
    // Rails reach out to whichever sides continue the run. They stop at the
    // post rather than crossing it, so a corner shows one post with two rails
    // meeting on it.
    if (mask & W) { rail(0, 6, 9, 2); rail(0, 11, 9, 2); }
    if (mask & E) { rail(7, 6, 9, 2); rail(7, 11, 9, 2); }
    // A run going up and down the screen is seen end-on, so it is the posts
    // themselves that carry it. The post grows to meet its neighbours rather
    // than stopping short, or a vertical run comes out as a dashed line.
    const top = (mask & N) ? 0 : 2;
    const bottom = (mask & S) ? TILE : TILE - 1;
    rect(ctx, 6, top, 4, bottom - top, POST);
    rect(ctx, 6, top, 1, bottom - top, '#b8935c');
    rect(ctx, 9, top, 1, bottom - top, '#6d5231');
    // A cap, but only where the post actually ends.
    if (!(mask & N)) rect(ctx, 6, 2, 4, 1, '#c4a06a');
    if (!(mask & S)) rect(ctx, 6, TILE - 2, 4, 1, '#5f4626');
  },

  /* A flight of dressed steps, out of doors. A column of these reads as one
     long stair: the tread pattern repeats down the run, and only the ends get
     treated — a landing lip where the flight starts and a cast shadow where it
     lands. Walkable, so a stair is a way up rather than a wall you look at. */
  stoneStair(ctx, _frame, mask) {
    rect(ctx, 0, 0, TILE, TILE, '#9198a8');
    // Two steps to the tile, not four. Sixteen-pixel banding repeated down a
    // long flight reads as a grating; a step you could actually put a foot on
    // has to be deep enough to show the tread and the riser separately. And
    // the riser has to be properly dark: a flight drawn in four neighbouring
    // greys is a grey slab from any distance, whatever the treads are doing.
    for (let i = 0; i < 2; i++) {
      const y = i * 8;
      rect(ctx, 0, y, TILE, 5, '#b4bacb');       // the tread
      rect(ctx, 0, y, TILE, 2, '#dde2ee');       // catching the light along it
      rect(ctx, 0, y + 5, TILE, 3, '#474c5b');   // the riser it falls away to
      rect(ctx, 0, y + 5, TILE, 1, '#5e6373');
      rect(ctx, 4, y + 2, 8, 3, '#a7aec0');      // worn where every foot lands
    }
    // Kerbs down whichever sides are open, so the flight is a built thing with
    // edges rather than a patch of patterned ground.
    if (!(mask & W)) {
      rect(ctx, 0, 0, 3, TILE, '#767b8b');
      rect(ctx, 1, 0, 1, TILE, '#8e93a3');
      rect(ctx, 0, 0, 1, TILE, '#3b4049');
    }
    if (!(mask & E)) {
      rect(ctx, TILE - 3, 0, 3, TILE, '#767b8b');
      rect(ctx, TILE - 2, 0, 1, TILE, '#666b7b');
      rect(ctx, TILE - 1, 0, 1, TILE, '#3b4049');
    }
    if (!(mask & N)) {                            // the landing at the head
      rect(ctx, 0, 0, TILE, 4, '#c4cad8');
      rect(ctx, 0, 0, TILE, 1, '#e2e7f1');
      rect(ctx, 0, 4, TILE, 2, '#474c5b');
    }
    if (!(mask & S)) {                            // and the shadow at the foot
      rect(ctx, 0, TILE - 3, TILE, 3, '#3b4049');
      rect(ctx, 0, TILE - 3, TILE, 1, '#565b6a');
    }
  },

  /* A moat: deep, still and revetted. The water is the castle's, not a river's,
     so it is darker than open water and it is held in dressed stone wherever
     the channel ends. One tile of it still reads as a cut channel rather than a
     puddle, which is what lets a moat be a moat at this size. */
  moat(ctx, frame, mask) {
    painters.water(ctx, frame, 15);       // full mask: no shoreline foam
    ctx.fillStyle = 'rgba(14, 26, 48, 0.42)';
    ctx.fillRect(0, 0, TILE, TILE);
    const bank = (x, y, w, h) => {
      rect(ctx, x, y, w, h, '#6e6e76');
      rect(ctx, x, y, w, 1, '#8a8a94');
    };
    // The revetment, on every side the water does not continue.
    if (!(mask & N)) { bank(0, 0, TILE, 4); rect(ctx, 0, 4, TILE, 1, '#2a3a52'); }
    if (!(mask & S)) { bank(0, TILE - 3, TILE, 3); rect(ctx, 0, TILE - 4, TILE, 1, '#1d2c42'); }
    if (!(mask & W)) { bank(0, 0, 3, TILE); rect(ctx, 3, 0, 1, TILE, '#22314a'); }
    if (!(mask & E)) { bank(TILE - 3, 0, 3, TILE); rect(ctx, TILE - 4, 0, 1, TILE, '#22314a'); }
    // A little movement on the surface so a long channel is not a flat slab.
    const drift = frame ? 5 : 0;
    rect(ctx, (2 + drift) % TILE, 7, 4, 1, 'rgba(180, 214, 240, 0.30)');
    rect(ctx, (9 + drift) % TILE, 11, 3, 1, 'rgba(180, 214, 240, 0.22)');
  },

  /* The way across a moat. Heavy timber rather than the plank bridge that
     crosses a stream, with the chains still on it. */
  drawbridge(ctx, frame, mask) {
    painters.moat(ctx, frame, mask | 15);
    rect(ctx, 0, 2, TILE, 12, '#7a5732');
    rect(ctx, 0, 2, TILE, 1, '#a37c4a');
    rect(ctx, 0, 13, TILE, 1, '#4a3018');
    for (let x = 0; x < TILE; x += 5) rect(ctx, x, 2, 1, 12, '#63451f');
    // Bound with iron across the deck, and the hoist chains down either side.
    rect(ctx, 0, 6, TILE, 2, '#5a5f6d');
    rect(ctx, 0, 6, TILE, 1, '#7c8190');
    for (let y = 0; y < TILE; y += 4) {
      rect(ctx, 1, y, 2, 2, '#8a8f9d');
      rect(ctx, TILE - 3, y, 2, 2, '#8a8f9d');
    }
  },

  // ---- interiors ----
  floorWood(ctx) {
    speckle(ctx, '#a97b48', [
      { color: '#bb8a53', chance: 0.14 },
      { color: '#94693c', chance: 0.2 },
    ], 89);
    for (let y = 0; y < TILE; y += 8) rect(ctx, 0, y, TILE, 1, '#7d5730');
  },

  floorStone(ctx) {
    speckle(ctx, '#8e93a3', [
      { color: '#a2a7b6', chance: 0.14 },
      { color: '#787d8c', chance: 0.2 },
    ], 97);
    rect(ctx, 0, 0, TILE, 1, '#6d7180');
    rect(ctx, 0, 0, 1, TILE, '#6d7180');
  },

  carpet(ctx) {
    speckle(ctx, '#7d2f3a', [
      { color: '#8f3844', chance: 0.16 },
      { color: '#6a2630', chance: 0.2 },
    ], 101);
    rect(ctx, 0, 0, TILE, 1, '#c8a24a');
    rect(ctx, 0, 15, TILE, 1, '#c8a24a');
  },

  interiorWall(ctx) {
    speckle(ctx, '#5d5a72', [
      { color: '#6b6882', chance: 0.14 },
      { color: '#4c4a5e', chance: 0.2 },
    ], 103);
    rect(ctx, 0, 12, TILE, 4, '#3f3d4f');
    rect(ctx, 0, 12, TILE, 1, '#7a7794');
  },

  counter(ctx) {
    rect(ctx, 0, 0, TILE, TILE, '#c8a24a');
    rect(ctx, 0, 0, TILE, 3, '#e2c476');
    rect(ctx, 0, 13, TILE, 3, '#8e6c2a');
    rect(ctx, 0, 3, TILE, 10, '#b08a38');
  },

  table(ctx) {
    painters.floorWood(ctx);
    rect(ctx, 1, 2, 14, 12, '#6d4a28');
    rect(ctx, 2, 3, 12, 10, '#96683a');
    rect(ctx, 3, 4, 10, 2, '#a9784a');
  },

  bookshelf(ctx) {
    rect(ctx, 0, 0, TILE, TILE, '#5b3f24');
    rect(ctx, 1, 1, 14, 14, '#7a5730');
    for (let shelf = 0; shelf < 2; shelf++) {
      const y = 2 + shelf * 7;
      rect(ctx, 1, y + 5, 14, 2, '#5b3f24');
      const colors = ['#b03c3c', '#3c6ab0', '#3ca05c', '#b09a3c', '#8a3cb0'];
      for (let i = 0; i < 6; i++) {
        rect(ctx, 2 + i * 2, y, 2, 5, colors[(i + shelf) % colors.length]);
      }
    }
  },

  bed(ctx) {
    painters.floorWood(ctx);
    rect(ctx, 2, 1, 12, 14, '#6d4a28');
    rect(ctx, 3, 2, 10, 12, '#d8d2c4');
    rect(ctx, 3, 2, 10, 4, '#f2eee4');
    rect(ctx, 3, 7, 10, 7, '#5a7fa8');
    rect(ctx, 3, 7, 10, 1, '#7fa4cc');
  },

  stairs(ctx) {
    painters.floorStone(ctx);
    for (let i = 0; i < 4; i++) {
      const y = i * 4;
      rect(ctx, 0, y, TILE, 4, i % 2 ? '#7c8090' : '#9aa0b0');
      rect(ctx, 0, y, TILE, 1, '#5f6272');
    }
  },

  throne(ctx) {
    painters.floorStone(ctx);
    rect(ctx, 2, 1, 12, 15, '#4a4a54');
    rect(ctx, 3, 2, 10, 13, '#6a6a76');
    // A tangle of blades.
    for (let i = 0; i < 7; i++) {
      const x = 3 + i * 1.5;
      rect(ctx, Math.floor(x), 1 + (i % 3), 1, 6 + (i % 4), '#b8bcc8');
    }
    rect(ctx, 4, 9, 8, 5, '#3c3c46');
  },

  brazier(ctx) {
    painters.floorStone(ctx);
    rect(ctx, 5, 9, 6, 6, '#4a4038');
    rect(ctx, 4, 8, 8, 2, '#6a5c4c');
    rect(ctx, 6, 4, 4, 5, '#e06a20');
    rect(ctx, 7, 2, 2, 4, '#f0a830');
    rect(ctx, 7, 1, 1, 2, '#f6de70');
  },

  rubble(ctx) {
    painters.stone(ctx);
    rect(ctx, 2, 8, 6, 5, '#6a6a76');
    rect(ctx, 8, 6, 6, 7, '#7c7c88');
    rect(ctx, 3, 9, 3, 2, '#8c8c98');
  },

  /* -------------------------------------------------------- a dragon, drawn --
   *
   * There was not one anywhere in this world you could look at. There were
   * dragons in the bestiary, dragons on the wing in a cutscene and a dragon in
   * the dark under the Dragonmont that the map drew as a man in a red cloak,
   * and the island the whole house is named for had nothing on it but grey
   * floor. "No dragon" was the correct report.
   *
   * A creature is a forty-eight square and a tile is sixteen, which is exactly
   * three by three — so the animal the game already knows how to draw can be
   * laid straight into the ground it is standing on, one ninth per tile. It
   * costs no sprite, no object, no palette bank and not one line of the
   * cartridge's C: the exporter rasterises whatever a tile painter puts on the
   * canvas, so a dragon on a map is a dragon on the cartridge.
   *
   * Which is also why it is scenery rather than somebody to talk to. Nothing
   * here needs to be: it is four times the size of a man and it is in the way,
   * and both of those are the point.
   */
  ...DRAGON_TILES,

  caveFloor(ctx, _frame, _mask, _ground, variant = 0) {
    ground(ctx, 'cave', variant);
  },

  caveWall(ctx, _frame, mask) {
    rect(ctx, 0, 0, TILE, TILE, '#39364a');
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const n = hash(x, y, 109);
        if (n < 0.14) rect(ctx, x, y, 1, 1, '#484459');
        else if (n < 0.26) rect(ctx, x, y, 1, 1, '#2a2837');
      }
    }
    if (!(mask & N)) { rect(ctx, 0, 0, TILE, 2, '#5a5570'); rect(ctx, 0, 2, TILE, 1, '#46425a'); }
    if (!(mask & W)) rect(ctx, 0, 0, 1, TILE, '#211f2c');
    if (!(mask & E)) rect(ctx, TILE - 1, 0, 1, TILE, '#211f2c');
    if (!(mask & S)) rect(ctx, 0, TILE - 3, TILE, 3, '#191722');
  },
};

// --------------------------------------------------------------- registry --

/**
 * kind:
 *   'floor'      walkable
 *   'solid'      blocks movement
 *   'encounter'  walkable, rolls for wild creatures
 *   'ledge'      one-way hop to the south
 *   'water'      blocks movement (no surfing in this game)
 */
/* Two limewash-and-timber palettes, and one painter for both. */
const WALL_DAUB = { fill: '#c3b088', lit: '#d2c09b', dim: '#ac9a74',
                    beam: '#4a3722', beamLit: '#6b5334', beamDark: '#2c2013' };
const WALL_LIME = { fill: '#e4e0d4', lit: '#f2efe6', dim: '#c8c2b2',
                    beam: '#6b5334', beamLit: '#8a6f48', beamDark: '#4a3722' };

function timberWall(ctx, mask, key) {
  rect(ctx, 0, 0, TILE, TILE, key.fill);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = hash(x, y, 61);
      if (n < 0.08) rect(ctx, x, y, 1, 1, key.lit);
      else if (n < 0.15) rect(ctx, x, y, 1, 1, key.dim);
    }
  }
  // A post at each tile edge, so a run of wall reads as framed bays.
  rect(ctx, 0, 0, 3, TILE, key.beam);
  rect(ctx, TILE - 3, 0, 3, TILE, key.beam);
  rect(ctx, 0, 0, 1, TILE, key.beamDark);
  rect(ctx, TILE - 1, 0, 1, TILE, key.beamDark);
  rect(ctx, 2, 0, 1, TILE, key.beamLit);
  rect(ctx, TILE - 3, 0, 1, TILE, key.beamLit);
  // Top plate under the eaves.
  rect(ctx, 0, 0, TILE, 3, key.beam);
  rect(ctx, 0, 0, TILE, 1, key.beamDark);
  rect(ctx, 0, 2, TILE, 1, key.beamLit);
  // Stone footing along the ground.
  if (!(mask & S)) {
    rect(ctx, 0, TILE - 4, TILE, 4, '#938a78');
    rect(ctx, 0, TILE - 4, TILE, 1, '#6a6255');
    rect(ctx, 0, TILE - 1, TILE, 1, '#585044');
    rect(ctx, 5, TILE - 3, 1, 3, '#6a6255');
    rect(ctx, 12, TILE - 3, 1, 3, '#6a6255');
  } else {
    rect(ctx, 0, TILE - 3, TILE, 3, key.beam);
    rect(ctx, 0, TILE - 3, TILE, 1, key.beamDark);
  }
  eaveShadow(ctx, mask);
}

/* The board a trade sign hangs on: a bracket, two rings, and a painted plank
   with whatever the trade is on it. */
function shingle(ctx, board, edge, draw) {
  rect(ctx, 2, 1, 12, 2, '#3a2c1c');
  rect(ctx, 2, 1, 12, 1, '#6d5738');
  rect(ctx, 4, 3, 1, 2, '#6d5738');
  rect(ctx, 11, 3, 1, 2, '#6d5738');
  rect(ctx, 2, 4, 12, 10, edge);
  rect(ctx, 3, 5, 10, 8, board);
  rect(ctx, 3, 5, 10, 1, '#d8c8a8');
  rect(ctx, 3, 12, 10, 1, '#6a5638');
  draw(ctx);
}

/* One roof, any material. The geometry says where the courses and the eave go;
   the key says what it is made of. */
function roofBody(ctx, mask, body, ridge, eave, key) {
  if (!(mask & N)) paintArt(ctx, ridge, key);
  else if (!(mask & S)) paintArt(ctx, eave, key);
  else paintArt(ctx, body, key);
  if (!(mask & W)) rect(ctx, 0, 0, 1, TILE, key.k);
  if (!(mask & E)) rect(ctx, TILE - 1, 0, 1, TILE, key.k);
}

/* The capping course along the very top of a roof, in the roof's own colours. */
function roofCap(ctx, mask, body, key) {
  body(ctx, 0, mask | S);
  rect(ctx, 0, 0, TILE, 5, key.k);
  rect(ctx, 0, 1, TILE, 3, key.l);
  rect(ctx, 0, 1, TILE, 1, key.h);
  rect(ctx, 0, 4, TILE, 1, key.d);
  for (let x = 2; x < TILE; x += 4) rect(ctx, x, 1, 1, 3, key.m);
  if (!(mask & W)) rect(ctx, 0, 0, 1, TILE, key.k);
  if (!(mask & E)) rect(ctx, TILE - 1, 0, 1, TILE, key.k);
}

export const TILE_DEFS = {
  '.': { paint: painters.grass, kind: 'floor', varies: true, autotile: true },
  ',': { paint: painters.tallGrass, kind: 'encounter', frames: 2, rate: 0.55, varies: true },
  'S': { paint: painters.snow, kind: 'floor', varies: true, autotile: true },
  ';': { paint: painters.snowGrass, kind: 'encounter', frames: 2, rate: 0.55, varies: true },
  '-': { paint: painters.path, kind: 'floor', varies: true },
  'd': { paint: painters.dirt, kind: 'floor', varies: true, autotile: true },
  's': { paint: painters.sand, kind: 'floor', varies: true, autotile: true },
  'o': { paint: painters.stone, kind: 'floor', varies: true, autotile: true },
  '~': { paint: painters.water, kind: 'water', frames: 2, autotile: true },
  'i': { paint: painters.ice, kind: 'floor', frames: 2 },
  '#': { paint: painters.tree, kind: 'solid', autotile: true, grounded: true },
  'P': { paint: painters.pine, kind: 'solid', autotile: true, grounded: true },
  'W': { paint: painters.weirwood, kind: 'solid', grounded: true },
  'C': { paint: painters.cliff, kind: 'solid', autotile: true },
  'H': { paint: painters.wall, kind: 'solid', autotile: true },
  'A': { paint: painters.ashlar, kind: 'solid', autotile: true },
  'M': { paint: painters.battlement, kind: 'solid', autotile: true },
  'V': { paint: painters.banner, kind: 'solid' },
  'v': { paint: painters.bannerGrey, kind: 'solid' },
  'R': { paint: painters.roof, kind: 'solid', autotile: true },
  'r': { paint: painters.roofNorth, kind: 'solid', autotile: true },
  'G': { paint: painters.roofSlate, kind: 'solid', autotile: true },
  'g': { paint: painters.roofSlateCap, kind: 'solid', autotile: true },
  'Z': { paint: painters.roofPitch, kind: 'solid', autotile: true },
  'z': { paint: painters.roofPitchCap, kind: 'solid', autotile: true },
  'Q': { paint: painters.roofClay, kind: 'solid', autotile: true },
  'q': { paint: painters.roofClayCap, kind: 'solid', autotile: true },
  'Y': { paint: painters.roofThatch, kind: 'solid', autotile: true },
  'y': { paint: painters.roofThatchCap, kind: 'solid', autotile: true },
  'D': { paint: painters.door, kind: 'floor' },
  'w': { paint: painters.window, kind: 'solid' },
  'n': { paint: painters.chimney, kind: 'solid', frames: 2, grounded: true },
  'j': { paint: painters.chest, kind: 'solid', grounded: true },
  'u': { paint: painters.ravenPost, kind: 'solid', frames: 2, grounded: true },
  'k': { paint: painters.signSmith, kind: 'solid' },
  'e': { paint: painters.signMaester, kind: 'solid' },
  'p': { paint: painters.wallPale, kind: 'solid', autotile: true },
  '!': { paint: painters.sign, kind: 'solid', grounded: true },
  '*': { paint: painters.flowers, kind: 'floor', grounded: true, varies: true },
  'L': { paint: painters.ledge, kind: 'ledge', grounded: true },
  'f': { paint: painters.fence, kind: 'solid', grounded: true, autotile: true },
  '/': { paint: painters.stoneStair, kind: 'floor', autotile: true },
  ':': { paint: painters.moat, kind: 'water', frames: 2, autotile: true },
  '+': { paint: painters.drawbridge, kind: 'floor', frames: 2 },
  't': { paint: painters.bridge, kind: 'floor', frames: 2 },
  'm': { paint: painters.ropeBridge, kind: 'floor', frames: 2 },
  '^': { paint: painters.openSky, kind: 'solid', frames: 2 },
  '_': { paint: painters.floorWood, kind: 'floor' },
  '=': { paint: painters.floorStone, kind: 'floor' },
  'c': { paint: painters.carpet, kind: 'floor' },
  'I': { paint: painters.interiorWall, kind: 'solid' },
  'K': { paint: painters.counter, kind: 'solid' },
  'T': { paint: painters.table, kind: 'solid' },
  'B': { paint: painters.bookshelf, kind: 'solid' },
  'b': { paint: painters.bed, kind: 'floor' },
  '<': { paint: painters.stairs, kind: 'floor' },
  'X': { paint: painters.throne, kind: 'solid' },
  'F': { paint: painters.brazier, kind: 'solid' },
  'a': { paint: painters.anvil, kind: 'solid' },
  'x': { paint: painters.forgeHearth, kind: 'solid' },
  'l': { paint: painters.armsRack, kind: 'solid' },
  'N': { paint: painters.ravenCage, kind: 'solid' },
  'h': { paint: painters.hearth, kind: 'solid' },
  'U': { paint: painters.rubble, kind: 'solid' },
  '%': { paint: painters.caveFloor, kind: 'floor', varies: true },
  '@': { paint: painters.caveWall, kind: 'solid', autotile: true },
  /* The nine ninths of a dragon. Solid all the way round, including the two
     bottom corners where only wingtip reaches: the gap under a spread wing is
     not a gap you walk through, and a hole in the middle of an animal is worse
     to meet than a wall. */
  '1': { paint: painters.dragon1, kind: 'solid', grounded: true },
  '2': { paint: painters.dragon2, kind: 'solid', grounded: true },
  '3': { paint: painters.dragon3, kind: 'solid', grounded: true },
  '4': { paint: painters.dragon4, kind: 'solid', grounded: true },
  '5': { paint: painters.dragon5, kind: 'solid', grounded: true },
  '6': { paint: painters.dragon6, kind: 'solid', grounded: true },
  '7': { paint: painters.dragon7, kind: 'solid', grounded: true },
  '8': { paint: painters.dragon8, kind: 'solid', grounded: true },
  '9': { paint: painters.dragon9, kind: 'solid', grounded: true },
};

const rendered = new Map();

/**
 * Neighbour mask bits, used by the autotiling painters. A tile knows which of
 * its four orthogonal neighbours belong to the same visual group, which is what
 * lets a block of trees read as one canopy with lit top edges and shadowed
 * bottoms rather than a grid of identical stamps.
 */
export const N = 1, E = 2, S = 4, W = 8;

/** Tiles that autotile, and the group each belongs to. */
export const TILE_GROUP = {
  // Grounds, so that where two of them meet gets a softened edge rather than a
  // ruled line. Tall grass belongs to the field it grows in, so there is no
  // seam between a meadow and the cover in it.
  '.': 'grassland', ',': 'grassland', '*': 'grassland',
  'S': 'snowfield', ';': 'snowfield', 'i': 'snowfield',
  'd': 'earth',
  's': 'shore',
  'o': 'paved', '=': 'paved',
  '#': 'forest', 'P': 'forest', 'W': 'forest',
  'C': 'rock', 'U': 'rock',
  '~': 'water',
  '@': 'cave',
  // A fence knows its own run, so corners meet on a post instead of crossing
  // in mid-air. A stair knows its flight, so only the ends get a landing and a
  // shadow. A moat knows its channel, so the revetment lines the cut and not
  // every tile of the water.
  'f': 'fence',
  '/': 'stair',
  ':': 'moat', '+': 'moat',
  'H': 'building', 'w': 'building', 'D': 'building',
  'e': 'plaster', 'p': 'plaster',
  'A': 'castle', 'M': 'castle', 'V': 'castle', 'v': 'castle', 'k': 'castle',
  'R': 'roof', 'r': 'roof',
  'G': 'slate', 'g': 'slate',
  'Z': 'pitch', 'z': 'pitch',
  'Q': 'clay', 'q': 'clay',
  'Y': 'thatch', 'y': 'thatch',
};

/**
 * The ground a map's scenery stands on. Signs, fences and lone trees paint this
 * underneath themselves, so the same tile reads correctly in a snowfield and in
 * a summer meadow without needing separate characters for each.
 */
export const GROUNDS = {
  grass: (ctx, variant) => painters.grass(ctx, 0, 0, null, variant),
  snow: (ctx, variant) => painters.snow(ctx, 0, 0, null, variant),
  sand: (ctx, variant) => painters.sand(ctx, 0, 0, null, variant),
  stone: (ctx, variant) => painters.stone(ctx, 0, 0, null, variant),
  // A map laid on bare earth had no ground of its own here, so every grounded
  // thing standing on it — chimneys, fences, signs, lone trees — fell through
  // to the grass default and came up sitting on a bright green square in the
  // middle of a mud alley.
  earth: (ctx, variant) => painters.dirt(ctx, 0, 0, null, variant),
  cave: (ctx, variant) => painters.caveFloor(ctx, 0, 0, null, variant),
};

/** Returns the painted canvas for a tile at a given frame, mask and ground. */
export function tileCanvas(char, frame = 0, mask = 0, ground = 'grass', variant = 0) {
  const def = TILE_DEFS[char] ?? TILE_DEFS['.'];
  const frameCount = def.frames ?? 1;
  const useFrame = frameCount > 1 ? frame % frameCount : 0;
  const useMask = def.autotile ? mask : 0;
  const useGround = def.grounded ? ground : '-';
  // Only the drawings that actually vary need the variant in their cache key.
  const useVariant = def.varies ? variant : 0;
  const key = `${char}:${useFrame}:${useMask}:${useGround}:${useVariant}`;
  let canvas = rendered.get(key);
  if (!canvas) {
    const surface = makeCanvas(TILE, TILE);
    def.paint(surface.ctx, useFrame, useMask, GROUNDS[ground] ?? GROUNDS.grass, useVariant);
    canvas = surface.canvas;
    rendered.set(key, canvas);
  }
  return canvas;
}

export function tileDef(char) {
  return TILE_DEFS[char] ?? TILE_DEFS['.'];
}

export function isSolid(char) {
  const kind = tileDef(char).kind;
  return kind === 'solid' || kind === 'water';
}
