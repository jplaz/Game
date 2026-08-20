// Tiles are painted once into 16x16 offscreen canvases at boot. Each painter
// gets a deterministic hash so the speckling is stable between runs — the same
// patch of grass looks the same every time you walk past it.

import { makeCanvas } from '../engine/sprites.js';
import { paintArt } from './pixels.js';
import {
  GROUND_ART, TALL_GRASS, CLUMP_KEY, SNOW_GRASS_KEY, LONE_TREE, TREE_KEY,
  ROOF, ROOF_RIDGE, ROOF_EAVE, ROOF_KEY,
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

/** How many drawings a ground has, so the map knows how far to vary it. */
export function groundVariants(name) {
  return (GROUND_ART[name] ?? GROUND_ART.grass).rows.length;
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
    const dark = '#1f5230', mid = '#2f7340', lit = '#419a4c', rim = '#5cb85e';

    // A tile with open sky above and below is a single tree, not a slice of
    // canopy — drawing it as canopy is what makes scattered woodland read as
    // random green bars.
    if (!(mask & N) && !(mask & S)) {
      painters.loneTree(ctx);
      return;
    }

    rect(ctx, 0, 0, TILE, TILE, mid);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const n = hash(x, y, 17);
        if (n < 0.16) rect(ctx, x, y, 1, 1, lit);
        else if (n < 0.28) rect(ctx, x, y, 1, 1, dark);
      }
    }
    // Four crowns per tile, each a small dome with a lit cap and a shadowed
    // gutter beneath, so the mass breaks up into individual trees.
    for (let cy = 0; cy < 2; cy++) {
      for (let cx = 0; cx < 2; cx++) {
        const ox = cx * 8;
        const oy = cy * 8;
        rect(ctx, ox, oy + 6, 8, 2, dark);        // gutter between crowns
        rect(ctx, ox + 1, oy, 6, 6, mid);
        rect(ctx, ox + 2, oy, 4, 2, lit);
        rect(ctx, ox + 1, oy + 1, 2, 2, lit);
        rect(ctx, ox + 3, oy + 4, 3, 2, dark);
        rect(ctx, ox, oy, 1, 6, dark);            // trunk shadow at the join
      }
    }

    if (!(mask & N)) { rect(ctx, 0, 0, TILE, 2, rim); rect(ctx, 0, 2, TILE, 1, lit); }
    if (!(mask & W)) rect(ctx, 0, 0, 1, TILE, dark);
    if (!(mask & E)) rect(ctx, TILE - 1, 0, 1, TILE, dark);
    if (!(mask & S)) {
      rect(ctx, 0, TILE - 4, TILE, 4, dark);
      rect(ctx, 6, TILE - 5, 4, 5, '#5b4023');   // trunk
      rect(ctx, 7, TILE - 5, 1, 5, '#7a5a32');
      rect(ctx, 0, TILE - 1, TILE, 1, '#1a3f26');
    }
  },

  // A single round tree: canopy, highlight and trunk.
  /** A tree standing on its own, drawn pixel by pixel in tilesets.js. */
  loneTree(ctx) {
    paintArt(ctx, LONE_TREE, TREE_KEY);
  },

  pine(ctx, _frame, mask) {
    painters.snow(ctx);
    const dark = '#173d2c', mid = '#245139', lit = '#356b48', snow = '#e8f2f8';

    if (!(mask & N) && !(mask & S)) {
      // A lone conifer: stacked skirts under a snow cap.
      rect(ctx, 7, 12, 2, 4, '#452f1c');
      for (let i = 0; i < 3; i++) {
        const w = 5 + i * 3;
        const y = 2 + i * 4;
        const x = 8 - Math.floor(w / 2);
        rect(ctx, x, y, w, 4, dark);
        rect(ctx, x + 1, y + 1, w - 2, 3, mid);
        rect(ctx, x + 1, y, w - 2, 1, snow);
      }
      rect(ctx, 7, 0, 2, 3, dark);
      rect(ctx, 7, 0, 2, 1, snow);
      return;
    }

    rect(ctx, 0, 0, TILE, TILE, dark);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const n = hash(x, y, 29);
        if (n < 0.14) rect(ctx, x, y, 1, 1, lit);
      }
    }
    // Two conifer tops per tile, stepped like a fir and dusted with snow.
    for (let cy = 0; cy < 2; cy++) {
      for (let cx = 0; cx < 2; cx++) {
        const ox = cx * 8;
        const oy = cy * 8;
        for (let tier = 0; tier < 3; tier++) {
          const w = 2 + tier * 2;
          const x = ox + 4 - Math.floor(w / 2);
          const y = oy + tier * 2 + 1;
          rect(ctx, x, y, w, 2, mid);
          rect(ctx, x, y, w, 1, snow);
          rect(ctx, x, y + 1, 1, 1, dark);
        }
        rect(ctx, ox, oy + 7, 8, 1, dark);
      }
    }
    if (!(mask & N)) { rect(ctx, 0, 0, TILE, 3, snow); rect(ctx, 0, 3, TILE, 1, '#b9cddc'); }
    if (!(mask & W)) rect(ctx, 0, 0, 1, TILE, dark);
    if (!(mask & E)) rect(ctx, TILE - 1, 0, 1, TILE, dark);
    if (!(mask & S)) {
      rect(ctx, 0, TILE - 4, TILE, 4, dark);
      rect(ctx, 7, TILE - 5, 2, 5, '#452f1c');
      rect(ctx, 0, TILE - 1, TILE, 1, '#0f2a1d');
    }
  },

  // The heart tree of the North: bone-white bark, blood-red leaves.
  weirwood(ctx, _frame, _mask, ground = painters.grass) {
    ground(ctx);
    // A dark keyline first: the bark is bone-white, and without an outline the
    // whole tree disappears against snow.
    const line = '#5a4a44';
    rect(ctx, 5, 8, 6, 8, line);
    rect(ctx, 6, 9, 4, 7, '#efece4');
    rect(ctx, 7, 9, 1, 7, '#ffffff');
    rect(ctx, 4, 12, 2, 4, line);
    rect(ctx, 10, 12, 2, 4, line);
    rect(ctx, 4, 13, 1, 3, '#d8d4cc');
    rect(ctx, 11, 13, 1, 3, '#d8d4cc');

    const blobs = [[2, 0, 12, 9], [1, 2, 14, 6]];
    for (const [x, y, w, h] of blobs) rect(ctx, x, y, w, h, '#5e1218');
    rect(ctx, 2, 1, 12, 7, '#8e1f26');
    rect(ctx, 3, 2, 10, 5, '#b62b31');
    rect(ctx, 5, 2, 5, 2, '#d4444a');
    rect(ctx, 1, 8, 14, 1, '#4a0e14');

    // The carved face, weeping sap.
    rect(ctx, 6, 10, 1, 2, '#6b2020');
    rect(ctx, 9, 10, 1, 2, '#6b2020');
    rect(ctx, 7, 13, 2, 1, '#6b2020');
    rect(ctx, 6, 12, 1, 2, '#a83038');
  },

  cliff(ctx, _frame, mask) {
    if (!(mask & N)) paintArt(ctx, CLIFF_TOP, CLIFF_KEY);
    else paintArt(ctx, CLIFF, CLIFF_KEY);
    if (!(mask & W)) rect(ctx, 0, 0, 1, TILE, CLIFF_KEY.k);
    if (!(mask & E)) rect(ctx, TILE - 1, 0, 1, TILE, CLIFF_KEY.k);
    if (!(mask & S)) rect(ctx, 0, TILE - 2, TILE, 2, '#2b261f');
  },

  wall(ctx, _frame, mask) {
    // A timber-framed house: daub panels between dark posts, on a stone footing.
    rect(ctx, 0, 0, TILE, TILE, '#c3b088');
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const n = hash(x, y, 61);
        if (n < 0.08) rect(ctx, x, y, 1, 1, '#d2c09b');
        else if (n < 0.15) rect(ctx, x, y, 1, 1, '#ac9a74');
      }
    }
    const beam = '#4a3722';
    const beamLit = '#6b5334';
    const beamDark = '#2c2013';

    // A post at each tile edge, so a run of wall reads as framed bays.
    rect(ctx, 0, 0, 3, TILE, beam);
    rect(ctx, TILE - 3, 0, 3, TILE, beam);
    rect(ctx, 0, 0, 1, TILE, beamDark);
    rect(ctx, TILE - 1, 0, 1, TILE, beamDark);
    rect(ctx, 2, 0, 1, TILE, beamLit);
    rect(ctx, TILE - 3, 0, 1, TILE, beamLit);

    // Top plate under the eaves.
    rect(ctx, 0, 0, TILE, 3, beam);
    rect(ctx, 0, 0, TILE, 1, beamDark);
    rect(ctx, 0, 2, TILE, 1, beamLit);

    // Stone footing along the ground.
    if (!(mask & S)) {
      rect(ctx, 0, TILE - 4, TILE, 4, '#938a78');
      rect(ctx, 0, TILE - 4, TILE, 1, '#6a6255');
      rect(ctx, 0, TILE - 1, TILE, 1, '#585044');
      rect(ctx, 5, TILE - 3, 1, 3, '#6a6255');
      rect(ctx, 12, TILE - 3, 1, 3, '#6a6255');
    } else {
      rect(ctx, 0, TILE - 3, TILE, 3, beam);
      rect(ctx, 0, TILE - 3, TILE, 1, beamDark);
    }
  },

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

  roof(ctx, _frame, mask) {
    // A course of tiles, capped where the roof ends and overhanging where it
    // meets the wall below.
    if (!(mask & N)) paintArt(ctx, ROOF_RIDGE, ROOF_KEY);
    else if (!(mask & S)) paintArt(ctx, ROOF_EAVE, ROOF_KEY);
    else paintArt(ctx, ROOF, ROOF_KEY);
    if (!(mask & W)) rect(ctx, 0, 0, 1, TILE, ROOF_KEY.k);
    if (!(mask & E)) rect(ctx, TILE - 1, 0, 1, TILE, ROOF_KEY.k);
  },

  // The ridge tile that caps a roof.
  roofNorth(ctx, _frame, mask) {
    painters.roof(ctx, 0, mask | S);
    // The ridge cap along the top of the roof.
    rect(ctx, 0, 0, TILE, 5, '#411614');
    rect(ctx, 0, 1, TILE, 3, '#b8544a');
    rect(ctx, 0, 1, TILE, 1, '#d4796b');
    rect(ctx, 0, 4, TILE, 1, '#6d2724');
    for (let x = 2; x < TILE; x += 4) rect(ctx, x, 1, 1, 3, '#8b3630');
    if (!(mask & W)) rect(ctx, 0, 0, 1, TILE, '#411614');
    if (!(mask & E)) rect(ctx, TILE - 1, 0, 1, TILE, '#411614');
  },

  door(ctx) {
    painters.wall(ctx);
    rect(ctx, 3, 3, 10, 13, '#3a2b1c');
    rect(ctx, 4, 4, 8, 12, '#6b4a2a');
    rect(ctx, 5, 5, 3, 10, '#7d5a34');
    rect(ctx, 8, 5, 1, 10, '#4d3620');
    rect(ctx, 10, 9, 2, 2, '#e0c060');
  },

  window(ctx) {
    painters.wall(ctx);
    rect(ctx, 3, 4, 10, 8, '#2c3446');
    rect(ctx, 4, 5, 8, 6, '#79b6d8');
    rect(ctx, 4, 5, 3, 3, '#a9dcf0');
    rect(ctx, 7, 4, 1, 8, '#2c3446');
    rect(ctx, 3, 7, 10, 1, '#2c3446');
  },

  sign(ctx, _frame, _mask, ground = painters.grass) {
    ground(ctx);
    rect(ctx, 7, 10, 2, 6, '#5b4023');
    rect(ctx, 2, 3, 12, 8, '#8a5f33');
    rect(ctx, 3, 4, 10, 6, '#b9884c');
    rect(ctx, 4, 5, 8, 1, '#7a5228');
    rect(ctx, 4, 7, 6, 1, '#7a5228');
  },

  flowers(ctx, _frame, _mask, ground = painters.grass) {
    ground(ctx);
    const spots = [[3, 4], [10, 3], [6, 10], [12, 11]];
    const colors = ['#e8d24a', '#e07a9a', '#e8d24a', '#c9a2e0'];
    spots.forEach(([x, y], i) => {
      rect(ctx, x, y, 3, 3, colors[i]);
      rect(ctx, x + 1, y + 1, 1, 1, '#fdf3c0');
    });
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

  fence(ctx, _frame, _mask, ground = painters.grass) {
    ground(ctx);
    rect(ctx, 0, 6, TILE, 2, '#8a6a3e');
    rect(ctx, 0, 11, TILE, 2, '#8a6a3e');
    rect(ctx, 3, 3, 2, 13, '#a07e4c');
    rect(ctx, 11, 3, 2, 13, '#a07e4c');
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
  'P': { paint: painters.pine, kind: 'solid', autotile: true },
  'W': { paint: painters.weirwood, kind: 'solid', grounded: true },
  'C': { paint: painters.cliff, kind: 'solid', autotile: true },
  'H': { paint: painters.wall, kind: 'solid', autotile: true },
  'A': { paint: painters.ashlar, kind: 'solid', autotile: true },
  'M': { paint: painters.battlement, kind: 'solid', autotile: true },
  'V': { paint: painters.banner, kind: 'solid' },
  'v': { paint: painters.bannerGrey, kind: 'solid' },
  'R': { paint: painters.roof, kind: 'solid', autotile: true },
  'r': { paint: painters.roofNorth, kind: 'solid', autotile: true },
  'D': { paint: painters.door, kind: 'floor' },
  'w': { paint: painters.window, kind: 'solid' },
  '!': { paint: painters.sign, kind: 'solid', grounded: true },
  '*': { paint: painters.flowers, kind: 'floor', grounded: true },
  'L': { paint: painters.ledge, kind: 'ledge', grounded: true },
  'f': { paint: painters.fence, kind: 'solid', grounded: true },
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
  'U': { paint: painters.rubble, kind: 'solid' },
  '%': { paint: painters.caveFloor, kind: 'floor', varies: true },
  '@': { paint: painters.caveWall, kind: 'solid', autotile: true },
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
  'H': 'building', 'w': 'building', 'D': 'building',
  'A': 'castle', 'M': 'castle', 'V': 'castle', 'v': 'castle',
  'R': 'roof', 'r': 'roof',
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
