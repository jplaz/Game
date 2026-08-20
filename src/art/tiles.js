// Tiles are painted once into 16x16 offscreen canvases at boot. Each painter
// gets a deterministic hash so the speckling is stable between runs — the same
// patch of grass looks the same every time you walk past it.

import { makeCanvas } from '../engine/sprites.js';

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

// ---------------------------------------------------------------- painters --

const painters = {
  grass(ctx) {
    speckle(ctx, '#4e9a56', [
      { color: '#5fae62', chance: 0.16 },
      { color: '#41864b', chance: 0.26 },
    ], 11);
    // A few upright blades to break up the noise.
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(hash(i, 3, 7) * 15);
      const y = Math.floor(hash(i, 9, 7) * 14);
      rect(ctx, x, y, 1, 2, '#6cbd6c');
    }
  },

  tallGrass(ctx, frame) {
    painters.grass(ctx);
    const sway = frame ? 1 : 0;
    rect(ctx, 0, 10, TILE, 6, '#3d7d45');
    for (let i = 0; i < 8; i++) {
      const x = i * 2 + (i % 2 ? 0 : 1);
      const h = 5 + ((i * 3) % 4);
      const lean = ((i + sway) % 2) ? 0 : 1;
      rect(ctx, x + lean, TILE - h - 1, 1, h, i % 3 === 0 ? '#79c46f' : '#5aa458');
    }
    rect(ctx, 0, 15, TILE, 1, '#356c3c');
  },

  snowGrass(ctx, frame) {
    painters.snow(ctx);
    const sway = frame ? 1 : 0;
    for (let i = 0; i < 8; i++) {
      const x = i * 2 + (i % 2 ? 0 : 1);
      const h = 5 + ((i * 5) % 4);
      const lean = ((i + sway) % 2) ? 0 : 1;
      rect(ctx, x + lean, TILE - h - 1, 1, h, i % 3 === 0 ? '#9fd7c4' : '#7fb6a8');
    }
    rect(ctx, 0, 14, TILE, 2, '#dfe9f2');
  },

  snow(ctx) {
    speckle(ctx, '#e4ecf4', [
      { color: '#f6fbff', chance: 0.14 },
      { color: '#cbd8e6', chance: 0.24 },
    ], 23);
  },

  path(ctx) {
    speckle(ctx, '#c8b58c', [
      { color: '#d8c9a4', chance: 0.18 },
      { color: '#ac9770', chance: 0.24 },
    ], 31);
  },

  sand(ctx) {
    speckle(ctx, '#dfd097', [
      { color: '#efe3b3', chance: 0.15 },
      { color: '#c6b47b', chance: 0.2 },
    ], 41);
  },

  stone(ctx) {
    speckle(ctx, '#8d8d99', [
      { color: '#a0a0ad', chance: 0.15 },
      { color: '#767683', chance: 0.22 },
    ], 53);
    rect(ctx, 0, 0, TILE, 1, '#6f6f7c');
    rect(ctx, 0, 8, TILE, 1, '#6f6f7c');
    rect(ctx, 0, 0, 1, 8, '#6f6f7c');
    rect(ctx, 8, 8, 1, 8, '#6f6f7c');
  },

  water(ctx, frame) {
    speckle(ctx, '#3f6fc0', [
      { color: '#4d81d4', chance: 0.18 },
      { color: '#345da6', chance: 0.22 },
    ], 61);
    const offset = frame ? 4 : 0;
    for (let y = 2; y < TILE; y += 5) {
      const x = (y * 3 + offset) % TILE;
      rect(ctx, x, y, 5, 1, '#8fc4f0');
      rect(ctx, (x + 8) % TILE, y + 2, 3, 1, '#6fa8e4');
    }
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

  tree(ctx) {
    painters.grass(ctx);
    rect(ctx, 6, 11, 4, 5, '#5b4023');
    rect(ctx, 7, 11, 1, 5, '#75542f');
    // Canopy: overlapping blobs so a forest edge reads as organic.
    const blobs = [[3, 1, 10, 9], [1, 3, 14, 6], [4, 0, 8, 4]];
    for (const [x, y, w, h] of blobs) rect(ctx, x, y, w, h, '#2f6b39');
    rect(ctx, 4, 2, 8, 6, '#3d8546');
    rect(ctx, 5, 2, 5, 3, '#4d9c52');
    rect(ctx, 3, 8, 10, 2, '#27562f');
  },

  pine(ctx) {
    painters.snow(ctx);
    rect(ctx, 7, 12, 2, 4, '#4a3520');
    for (let i = 0; i < 3; i++) {
      const w = 6 + i * 3;
      const y = 2 + i * 4;
      rect(ctx, 8 - Math.floor(w / 2), y, w, 4, '#26543a');
      rect(ctx, 8 - Math.floor(w / 2), y, w, 1, '#e8f2f8');
    }
    rect(ctx, 7, 0, 2, 2, '#26543a');
  },

  // The heart tree of the North: bone-white bark, blood-red leaves.
  weirwood(ctx) {
    painters.grass(ctx);
    rect(ctx, 6, 9, 4, 7, '#e8e4dc');
    rect(ctx, 7, 9, 1, 7, '#fbf8f2');
    rect(ctx, 5, 12, 1, 4, '#d0ccc2');
    rect(ctx, 10, 12, 1, 4, '#d0ccc2');
    const blobs = [[2, 1, 12, 8], [1, 3, 14, 5]];
    for (const [x, y, w, h] of blobs) rect(ctx, x, y, w, h, '#8e1f26');
    rect(ctx, 3, 2, 10, 5, '#b62b31');
    rect(ctx, 5, 2, 5, 2, '#d4444a');
    // The carved face.
    rect(ctx, 6, 10, 1, 1, '#6b2020');
    rect(ctx, 9, 10, 1, 1, '#6b2020');
    rect(ctx, 7, 12, 2, 1, '#6b2020');
  },

  cliff(ctx) {
    speckle(ctx, '#6f6a63', [
      { color: '#847e75', chance: 0.16 },
      { color: '#575349', chance: 0.24 },
    ], 71);
    rect(ctx, 0, 0, TILE, 2, '#4a473f');
    rect(ctx, 0, 2, TILE, 1, '#918a80');
  },

  wall(ctx) {
    speckle(ctx, '#9a8f7e', [
      { color: '#ab9f8c', chance: 0.14 },
      { color: '#847a6a', chance: 0.2 },
    ], 79);
    for (let y = 0; y < TILE; y += 4) {
      rect(ctx, 0, y, TILE, 1, '#6f665a');
      const offset = (y / 4) % 2 ? 4 : 12;
      rect(ctx, offset, y, 1, 4, '#6f665a');
    }
  },

  roof(ctx) {
    speckle(ctx, '#8c3b3b', [
      { color: '#a04747', chance: 0.14 },
      { color: '#73302f', chance: 0.2 },
    ], 83);
    for (let y = 1; y < TILE; y += 4) {
      rect(ctx, 0, y, TILE, 1, '#632828');
      rect(ctx, 0, y + 1, TILE, 1, '#a75050');
    }
  },

  roofNorth(ctx) {
    painters.roof(ctx);
    rect(ctx, 0, 0, TILE, 3, '#4c1f20');
    rect(ctx, 0, 3, TILE, 1, '#b96060');
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

  sign(ctx) {
    painters.grass(ctx);
    rect(ctx, 7, 10, 2, 6, '#5b4023');
    rect(ctx, 2, 3, 12, 8, '#8a5f33');
    rect(ctx, 3, 4, 10, 6, '#b9884c');
    rect(ctx, 4, 5, 8, 1, '#7a5228');
    rect(ctx, 4, 7, 6, 1, '#7a5228');
  },

  flowers(ctx) {
    painters.grass(ctx);
    const spots = [[3, 4], [10, 3], [6, 10], [12, 11]];
    const colors = ['#e8d24a', '#e07a9a', '#e8d24a', '#c9a2e0'];
    spots.forEach(([x, y], i) => {
      rect(ctx, x, y, 3, 3, colors[i]);
      rect(ctx, x + 1, y + 1, 1, 1, '#fdf3c0');
    });
  },

  // Walk-off-only edge; the player hops south and cannot climb back up.
  ledge(ctx) {
    painters.grass(ctx);
    rect(ctx, 0, 6, TILE, 10, '#7a6b4a');
    rect(ctx, 0, 6, TILE, 2, '#a89468');
    rect(ctx, 0, 14, TILE, 2, '#5d5136');
    for (let x = 1; x < TILE; x += 5) rect(ctx, x, 9, 3, 3, '#8d7c56');
  },

  fence(ctx) {
    painters.grass(ctx);
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

  caveFloor(ctx) {
    speckle(ctx, '#4e4a58', [
      { color: '#5c5867', chance: 0.15 },
      { color: '#403d4a', chance: 0.22 },
    ], 107);
  },

  caveWall(ctx) {
    speckle(ctx, '#2c2a36', [
      { color: '#3a3746', chance: 0.16 },
      { color: '#221f2a', chance: 0.22 },
    ], 109);
    rect(ctx, 0, 0, TILE, 2, '#1a1822');
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
  '.': { paint: painters.grass, kind: 'floor' },
  ',': { paint: painters.tallGrass, kind: 'encounter', frames: 2, rate: 0.55 },
  'S': { paint: painters.snow, kind: 'floor' },
  ';': { paint: painters.snowGrass, kind: 'encounter', frames: 2, rate: 0.55 },
  '-': { paint: painters.path, kind: 'floor' },
  's': { paint: painters.sand, kind: 'floor' },
  'o': { paint: painters.stone, kind: 'floor' },
  '~': { paint: painters.water, kind: 'water', frames: 2 },
  'i': { paint: painters.ice, kind: 'floor', frames: 2 },
  '#': { paint: painters.tree, kind: 'solid' },
  'P': { paint: painters.pine, kind: 'solid' },
  'W': { paint: painters.weirwood, kind: 'solid' },
  'C': { paint: painters.cliff, kind: 'solid' },
  'H': { paint: painters.wall, kind: 'solid' },
  'R': { paint: painters.roof, kind: 'solid' },
  'r': { paint: painters.roofNorth, kind: 'solid' },
  'D': { paint: painters.door, kind: 'floor' },
  'w': { paint: painters.window, kind: 'solid' },
  '!': { paint: painters.sign, kind: 'solid' },
  '*': { paint: painters.flowers, kind: 'floor' },
  'L': { paint: painters.ledge, kind: 'ledge' },
  'f': { paint: painters.fence, kind: 'solid' },
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
  '%': { paint: painters.caveFloor, kind: 'floor' },
  '@': { paint: painters.caveWall, kind: 'solid' },
};

const rendered = new Map();

/** Returns the painted canvas for a tile char at a given animation frame. */
export function tileCanvas(char, frame = 0) {
  const def = TILE_DEFS[char] ?? TILE_DEFS['.'];
  const frameCount = def.frames ?? 1;
  const useFrame = frameCount > 1 ? frame % frameCount : 0;
  const key = `${char}:${useFrame}`;
  let canvas = rendered.get(key);
  if (!canvas) {
    const surface = makeCanvas(TILE, TILE);
    def.paint(surface.ctx, useFrame);
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
