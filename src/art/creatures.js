// Creature battle sprites, 48x48, painted procedurally.
//
// Every creature is drawn facing the viewer like a house sigil on a banner. A
// handful of archetype painters cover the whole roster; a species picks an
// archetype and supplies a six-colour palette, so House Lannister's lion and
// the mountain lion of the Riverlands share a silhouette but nothing else.

import { makeCanvas } from '../engine/sprites.js';

export const SPRITE_SIZE = 48;
const MID = SPRITE_SIZE / 2;

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Draws a rect and its mirror image about the vertical centre line. */
function sym(ctx, x, y, w, h, color) {
  rect(ctx, x, y, w, h, color);
  rect(ctx, SPRITE_SIZE - x - w, y, w, h, color);
}

/** Filled pixel ellipse. */
function ell(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  for (let y = -ry; y <= ry; y++) {
    const span = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    if (span <= 0) continue;
    ctx.fillRect(Math.round(cx - span), Math.round(cy + y), span * 2, 1);
  }
}

/** A tapering spike from (x,y) upward/outward — antlers, horns, tentacles. */
function spike(ctx, x, y, dx, dy, len, thickness, color) {
  for (let i = 0; i < len; i++) {
    const t = Math.max(1, Math.round(thickness * (1 - i / len)));
    rect(ctx, x + dx * i, y + dy * i, t, t, color);
  }
}

function eyes(ctx, cx, y, spread, size, color, glint = '#ffffff') {
  sym(ctx, cx - spread - size, y, size, size, color);
  if (glint) sym(ctx, cx - spread - size, y, Math.max(1, size - 1), 1, glint);
}

// ------------------------------------------------------------- archetypes --
// Each painter receives (ctx, p) where p has: dark, body, light, belly, accent,
// eye. `dark` is the outline colour, `accent` the horns/claws/fins.

export const ARCHETYPES = {
  wolf(ctx, p) {
    // ears
    sym(ctx, 10, 6, 8, 10, p.dark);
    sym(ctx, 12, 9, 4, 6, p.accent);
    // head
    ell(ctx, MID, 20, 15, 12, p.dark);
    ell(ctx, MID, 20, 13, 10, p.body);
    ell(ctx, MID, 24, 8, 7, p.light);
    // muzzle
    ell(ctx, MID, 28, 6, 5, p.belly);
    sym(ctx, 22, 26, 4, 2, p.dark);
    rect(ctx, MID - 2, 27, 4, 3, p.dark);
    // fangs
    sym(ctx, 20, 30, 2, 4, '#f2f0e6');
    eyes(ctx, MID, 17, 3, 4, p.eye);
    // ruff and chest
    sym(ctx, 6, 30, 10, 8, p.dark);
    ell(ctx, MID, 40, 16, 9, p.dark);
    ell(ctx, MID, 41, 14, 8, p.body);
    ell(ctx, MID, 44, 7, 5, p.belly);
    // fur spikes along the ruff
    for (let i = 0; i < 4; i++) sym(ctx, 6 + i * 4, 32 - (i % 2) * 3, 3, 6, p.light);
  },

  bear(ctx, p) {
    sym(ctx, 8, 8, 10, 10, p.dark);
    sym(ctx, 10, 10, 6, 6, p.accent);
    ell(ctx, MID, 22, 17, 14, p.dark);
    ell(ctx, MID, 22, 15, 12, p.body);
    ell(ctx, MID, 27, 9, 7, p.belly);
    rect(ctx, MID - 3, 25, 6, 4, p.dark);
    eyes(ctx, MID, 18, 4, 4, p.eye);
    ell(ctx, MID, 42, 18, 9, p.dark);
    ell(ctx, MID, 43, 16, 8, p.body);
    ell(ctx, MID, 45, 8, 5, p.light);
    sym(ctx, 6, 40, 6, 8, p.dark);
    sym(ctx, 7, 44, 4, 4, p.accent);
  },

  lion(ctx, p) {
    // mane: a ring of tapering rays
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const x = MID + Math.cos(angle) * 15 - 3;
      const y = 22 + Math.sin(angle) * 15 - 3;
      rect(ctx, x, y, 7, 7, i % 2 ? p.accent : p.dark);
    }
    ell(ctx, MID, 22, 15, 14, p.dark);
    ell(ctx, MID, 22, 13, 12, p.body);
    ell(ctx, MID, 26, 8, 7, p.light);
    ell(ctx, MID, 29, 5, 4, p.belly);
    rect(ctx, MID - 2, 26, 4, 3, p.dark);
    sym(ctx, 20, 30, 3, 3, '#f2f0e6');
    eyes(ctx, MID, 19, 3, 4, p.eye);
    ell(ctx, MID, 43, 12, 7, p.dark);
    ell(ctx, MID, 44, 10, 6, p.body);
  },

  stag(ctx, p) {
    // antlers
    for (const side of [-1, 1]) {
      const baseX = MID + side * 8;
      spike(ctx, baseX, 18, side * 1.1, -1.3, 12, 4, p.accent);
      spike(ctx, baseX + side * 5, 12, side * 1.6, -0.6, 6, 3, p.accent);
      spike(ctx, baseX + side * 8, 8, side * 1.2, -1.1, 5, 3, p.accent);
      spike(ctx, baseX + side * 2, 15, side * 1.8, -0.2, 5, 3, p.accent);
    }
    sym(ctx, 12, 16, 5, 8, p.dark);
    ell(ctx, MID, 26, 10, 13, p.dark);
    ell(ctx, MID, 26, 8, 11, p.body);
    ell(ctx, MID, 32, 5, 6, p.light);
    rect(ctx, MID - 3, 34, 6, 3, p.dark);
    eyes(ctx, MID, 22, 3, 4, p.eye);
    ell(ctx, MID, 44, 14, 8, p.dark);
    ell(ctx, MID, 45, 12, 7, p.body);
    ell(ctx, MID, 46, 6, 4, p.belly);
  },

  /* A horse, seen head-on the way everything else here is: the long head and
     the pricked ears do the work, because a horse in profile would be the only
     creature in the game not facing you. */
  horse(ctx, p) {
    // ears
    sym(ctx, 14, 4, 4, 9, p.dark);
    sym(ctx, 15, 6, 2, 6, p.accent);
    // the mane, falling either side of the crest
    sym(ctx, 12, 9, 4, 18, p.accent);
    rect(ctx, MID - 3, 5, 6, 9, p.accent);
    // the long head, narrowing to a muzzle
    ell(ctx, MID, 19, 10, 12, p.dark);
    ell(ctx, MID, 19, 8, 10, p.body);
    ell(ctx, MID, 28, 6, 8, p.dark);
    ell(ctx, MID, 28, 4, 7, p.light);
    rect(ctx, MID - 4, 34, 8, 2, p.dark);
    sym(ctx, MID - 4, 32, 2, 2, p.dark);
    eyes(ctx, MID, 16, 5, 3, p.eye);
    // chest and shoulders
    ell(ctx, MID, 42, 15, 9, p.dark);
    ell(ctx, MID, 42, 13, 8, p.body);
    ell(ctx, MID, 44, 6, 5, p.belly);
    // forelegs, and the white on them
    sym(ctx, 13, 40, 5, 8, p.dark);
    sym(ctx, 14, 45, 3, 3, p.belly);
  },

  dragon(ctx, p) {
    // wings
    for (const side of [-1, 1]) {
      ctx.fillStyle = p.dark;
      for (let i = 0; i < 20; i++) {
        const x = MID + side * (8 + i);
        const top = 8 + i * 0.9;
        const height = 22 - i * 0.7;
        rect(ctx, side < 0 ? x : x, top, 2, Math.max(2, height), p.dark);
      }
      for (let i = 0; i < 18; i++) {
        const x = MID + side * (9 + i);
        const top = 10 + i * 0.9;
        const height = 19 - i * 0.75;
        rect(ctx, x, top, 1, Math.max(1, height), p.accent);
      }
    }
    // neck and head
    ell(ctx, MID, 34, 10, 12, p.dark);
    ell(ctx, MID, 34, 8, 10, p.body);
    ell(ctx, MID, 20, 12, 11, p.dark);
    ell(ctx, MID, 20, 10, 9, p.body);
    ell(ctx, MID, 25, 6, 6, p.light);
    // horns
    for (const side of [-1, 1]) spike(ctx, MID + side * 8, 12, side * 0.8, -1.2, 8, 4, p.accent);
    // jaw
    rect(ctx, MID - 5, 26, 10, 4, p.dark);
    sym(ctx, 20, 29, 2, 3, '#f6f2e0');
    eyes(ctx, MID, 17, 3, 4, p.eye);
    ell(ctx, MID, 42, 8, 6, p.belly);
  },

  raven(ctx, p) {
    // folded wings
    for (const side of [-1, 1]) {
      for (let i = 0; i < 12; i++) {
        rect(ctx, MID + side * (6 + i) - (side < 0 ? 2 : 0), 18 + i * 1.6, 3, 12 - i * 0.6, i % 2 ? p.dark : p.body);
      }
    }
    ell(ctx, MID, 36, 11, 12, p.dark);
    ell(ctx, MID, 36, 9, 10, p.body);
    ell(ctx, MID, 18, 10, 10, p.dark);
    ell(ctx, MID, 18, 8, 8, p.body);
    // beak
    rect(ctx, MID - 3, 22, 6, 3, p.accent);
    rect(ctx, MID - 2, 25, 4, 4, p.accent);
    rect(ctx, MID - 1, 29, 2, 2, p.accent);
    eyes(ctx, MID, 15, 3, 4, p.eye);
    // crest
    sym(ctx, 18, 6, 4, 6, p.dark);
    sym(ctx, 14, 9, 4, 5, p.dark);
    // talons
    sym(ctx, 18, 44, 4, 4, p.accent);
  },

  fish(ctx, p) {
    // tail fin at the top, head at the bottom — a trout leaping
    for (const side of [-1, 1]) {
      spike(ctx, MID + side * 3, 10, side * 1.4, -0.9, 8, 5, p.accent);
    }
    ell(ctx, MID, 30, 13, 19, p.dark);
    ell(ctx, MID, 30, 11, 17, p.body);
    ell(ctx, MID, 34, 7, 11, p.belly);
    // scales
    for (let row = 0; row < 5; row++) {
      for (let col = -2; col <= 2; col++) {
        rect(ctx, MID + col * 5 - 2, 20 + row * 5, 4, 2, p.light);
      }
    }
    // side fins
    sym(ctx, 4, 30, 10, 6, p.dark);
    sym(ctx, 6, 31, 7, 4, p.accent);
    eyes(ctx, MID, 40, 4, 4, p.eye);
    rect(ctx, MID - 3, 45, 6, 2, p.dark);
  },

  kraken(ctx, p) {
    // tentacles
    for (let i = 0; i < 4; i++) {
      for (const side of [-1, 1]) {
        const startX = MID + side * (4 + i * 5);
        for (let j = 0; j < 14; j++) {
          const wobble = Math.sin(j * 0.6 + i) * 3 * side;
          rect(ctx, startX + wobble - 1, 30 + j * 1.3, 3, 3, j % 3 === 0 ? p.dark : p.accent);
        }
      }
    }
    ell(ctx, MID, 22, 15, 17, p.dark);
    ell(ctx, MID, 22, 13, 15, p.body);
    ell(ctx, MID, 16, 8, 7, p.light);
    eyes(ctx, MID, 26, 4, 6, p.eye, p.belly);
    // suckers along the mantle
    for (let i = 0; i < 3; i++) sym(ctx, 14 + i * 3, 34 + i * 2, 3, 3, p.belly);
  },

  serpent(ctx, p) {
    // coils
    for (let i = 0; i < 3; i++) {
      const y = 44 - i * 6;
      const r = 18 - i * 3;
      ell(ctx, MID, y, r, 5, p.dark);
      ell(ctx, MID, y, r - 2, 3, i % 2 ? p.body : p.light);
    }
    ell(ctx, MID, 18, 11, 12, p.dark);
    ell(ctx, MID, 18, 9, 10, p.body);
    ell(ctx, MID, 23, 6, 6, p.belly);
    // hood
    sym(ctx, 6, 12, 8, 14, p.dark);
    sym(ctx, 8, 15, 5, 9, p.accent);
    eyes(ctx, MID, 16, 3, 4, p.eye);
    // forked tongue
    rect(ctx, MID - 1, 28, 2, 5, p.accent);
    sym(ctx, MID - 4, 32, 3, 2, p.accent);
  },

  wight(ctx, p) {
    // hooded, gaunt humanoid
    ell(ctx, MID, 18, 13, 14, p.dark);
    ell(ctx, MID, 19, 11, 12, p.accent);
    ell(ctx, MID, 22, 8, 9, p.body);
    ell(ctx, MID, 24, 6, 6, p.light);
    // sunken eyes
    sym(ctx, 17, 20, 5, 5, '#0d1016');
    eyes(ctx, MID, 21, 4, 3, p.eye);
    // rictus
    rect(ctx, MID - 4, 29, 8, 3, '#0d1016');
    for (let i = 0; i < 4; i++) rect(ctx, MID - 4 + i * 2, 29, 1, 3, p.belly);
    // shoulders and ragged cloak
    ell(ctx, MID, 42, 17, 10, p.dark);
    ell(ctx, MID, 42, 15, 9, p.accent);
    for (let i = 0; i < 5; i++) sym(ctx, 8 + i * 4, 44 + (i % 2) * 3, 3, 4, p.dark);
    sym(ctx, 6, 34, 5, 10, p.body);
  },

  flame(ctx, p) {
    // a body of fire: stacked tongues
    ell(ctx, MID, 34, 14, 13, p.dark);
    ell(ctx, MID, 34, 12, 11, p.body);
    ell(ctx, MID, 36, 8, 8, p.light);
    ell(ctx, MID, 38, 4, 5, p.belly);
    for (let i = 0; i < 5; i++) {
      const x = MID - 12 + i * 6;
      const h = 12 + ((i * 5) % 9);
      rect(ctx, x, 22 - h + 12, 4, h, i % 2 ? p.accent : p.body);
      rect(ctx, x + 1, 24 - h + 12, 2, h - 4, p.light);
    }
    spike(ctx, MID - 2, 16, 0, -1, 10, 4, p.accent);
    eyes(ctx, MID, 32, 4, 4, p.eye, null);
  },

  treefolk(ctx, p) {
    // trunk
    rect(ctx, MID - 7, 24, 14, 24, p.dark);
    rect(ctx, MID - 5, 24, 10, 24, p.body);
    rect(ctx, MID - 2, 26, 3, 20, p.light);
    // roots
    sym(ctx, 8, 42, 8, 6, p.dark);
    sym(ctx, 10, 44, 5, 4, p.body);
    // canopy
    ell(ctx, MID, 14, 20, 13, p.dark);
    ell(ctx, MID, 14, 18, 11, p.accent);
    ell(ctx, MID, 11, 11, 6, p.belly);
    // the carved face
    eyes(ctx, MID, 28, 4, 4, p.eye);
    rect(ctx, MID - 3, 36, 6, 3, '#2a1a14');
    sym(ctx, 12, 20, 5, 4, p.belly);
  },

  boar(ctx, p) {
    ell(ctx, MID, 30, 18, 14, p.dark);
    ell(ctx, MID, 30, 16, 12, p.body);
    ell(ctx, MID, 20, 12, 11, p.dark);
    ell(ctx, MID, 20, 10, 9, p.body);
    ell(ctx, MID, 26, 7, 6, p.light);
    rect(ctx, MID - 4, 26, 8, 5, p.belly);
    sym(ctx, 20, 27, 2, 2, p.dark);
    // tusks
    for (const side of [-1, 1]) spike(ctx, MID + side * 7, 30, side * 0.5, -1.2, 7, 4, '#efe7d2');
    sym(ctx, 12, 8, 6, 8, p.dark);
    eyes(ctx, MID, 18, 4, 3, p.eye);
    // bristles
    for (let i = 0; i < 5; i++) sym(ctx, 12 + i * 3, 12 - (i % 2) * 2, 2, 6, p.accent);
    sym(ctx, 10, 42, 6, 6, p.dark);
  },

  falcon(ctx, p) {
    // spread wings
    for (const side of [-1, 1]) {
      for (let i = 0; i < 18; i++) {
        const x = MID + side * (7 + i);
        rect(ctx, x, 14 + i * 0.6, 2, Math.max(3, 16 - i * 0.6), i % 3 === 0 ? p.dark : p.body);
        rect(ctx, x, 14 + i * 0.6, 1, Math.max(2, 8 - i * 0.3), p.light);
      }
    }
    ell(ctx, MID, 26, 9, 12, p.dark);
    ell(ctx, MID, 26, 7, 10, p.body);
    ell(ctx, MID, 30, 5, 7, p.belly);
    ell(ctx, MID, 14, 9, 9, p.dark);
    ell(ctx, MID, 14, 7, 7, p.light);
    rect(ctx, MID - 2, 18, 4, 4, p.accent);
    rect(ctx, MID - 1, 22, 2, 2, p.accent);
    eyes(ctx, MID, 11, 3, 3, p.eye);
    sym(ctx, 18, 42, 4, 5, p.accent);
  },

  crab(ctx, p) {
    // pincers
    for (const side of [-1, 1]) {
      const x = MID + side * 18;
      ell(ctx, x, 22, 7, 8, p.dark);
      ell(ctx, x, 22, 5, 6, p.accent);
      rect(ctx, x - 3, 14, 6, 6, p.dark);
      rect(ctx, MID + side * 11, 26, 8, 4, p.dark);
    }
    // legs
    for (let i = 0; i < 3; i++) sym(ctx, 4, 34 + i * 4, 12, 3, p.dark);
    ell(ctx, MID, 32, 16, 11, p.dark);
    ell(ctx, MID, 32, 14, 9, p.body);
    ell(ctx, MID, 34, 9, 5, p.light);
    eyes(ctx, MID, 24, 4, 4, p.eye);
    sym(ctx, 18, 20, 3, 5, p.dark);
  },
};

const cache = new Map();

/** Paints (and caches) a species sprite at 1x. */
export function creatureSprite(species) {
  const key = species.id;
  let canvas = cache.get(key);
  if (canvas) return canvas;

  const surface = makeCanvas(SPRITE_SIZE, SPRITE_SIZE);
  const painter = ARCHETYPES[species.archetype] ?? ARCHETYPES.wolf;
  painter(surface.ctx, species.palette);
  canvas = surface.canvas;
  cache.set(key, canvas);
  return canvas;
}

/** A dark silhouette, used for the "Who's that?" style battle entrance. */
const shadowCache = new Map();
export function creatureShadow(species) {
  let canvas = shadowCache.get(species.id);
  if (canvas) return canvas;
  const source = creatureSprite(species);
  const surface = makeCanvas(SPRITE_SIZE, SPRITE_SIZE);
  surface.ctx.drawImage(source, 0, 0);
  surface.ctx.globalCompositeOperation = 'source-in';
  surface.ctx.fillStyle = '#171a26';
  surface.ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  canvas = surface.canvas;
  shadowCache.set(species.id, canvas);
  return canvas;
}
