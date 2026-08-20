// Overworld people are drawn as a small paperdoll rather than hand-placed
// pixels: a head, a cloak and two legs, painted from a palette. That gives four
// facings and a four-step walk cycle for every NPC in the game from one
// routine, and a new character is just a new colour set.

import { makeCanvas } from '../engine/sprites.js';

export const ACTOR_W = 16;
export const ACTOR_H = 22;

export const ACTOR_PALETTES = {
  // The player: a ward of Winterfell in Stark grey.
  hero: { hair: '#5a3a20', hairLight: '#7a5230', skin: '#e8b88c', skinDark: '#c08f66',
          cloak: '#5c6472', cloakDark: '#414855', trim: '#c8cad2', legs: '#3d3a44', boots: '#2a2730' },
  heroine: { hair: '#3a2a1c', hairLight: '#54402c', skin: '#e8b88c', skinDark: '#c08f66',
             cloak: '#6a5a72', cloakDark: '#4c4054', trim: '#d0c6dc', legs: '#3d3a44', boots: '#2a2730' },
  maester: { hair: '#d8d8d0', hairLight: '#f0f0e8', skin: '#dcae86', skinDark: '#b4855e',
             cloak: '#7a6a4a', cloakDark: '#584c34', trim: '#c8b070', legs: '#4a4238', boots: '#2f2a22' },
  guard: { hair: '#2e2a26', hairLight: '#46403a', skin: '#d8a87c', skinDark: '#ac7f56',
           cloak: '#4a5568', cloakDark: '#333c4c', trim: '#9aa6bc', legs: '#37414f', boots: '#242a34' },
  stark: { hair: '#4a3728', hairLight: '#65503a', skin: '#e0b088', skinDark: '#b8845c',
           cloak: '#6d7480', cloakDark: '#4d535d', trim: '#dfe3ea', legs: '#3a3f47', boots: '#262a30' },
  lannister: { hair: '#d8b24a', hairLight: '#f0d070', skin: '#e8bc92', skinDark: '#c0906a',
               cloak: '#9c1f26', cloakDark: '#6f151b', trim: '#e8c460', legs: '#5a1c20', boots: '#3a1215' },
  tully: { hair: '#a04a28', hairLight: '#c46a3e', skin: '#e8bc92', skinDark: '#c0906a',
           cloak: '#2f6ea0', cloakDark: '#1f4d74', trim: '#b03040', legs: '#274a68', boots: '#1a3044' },
  baratheon: { hair: '#2a2622', hairLight: '#443e36', skin: '#dcae86', skinDark: '#b4855e',
               cloak: '#c8a83a', cloakDark: '#8f7522', trim: '#22262e', legs: '#4a4028', boots: '#2a2418' },
  targaryen: { hair: '#e8e4dc', hairLight: '#ffffff', skin: '#e8c0a0', skinDark: '#c09474',
               cloak: '#7c1f2c', cloakDark: '#55131d', trim: '#1a1a22', legs: '#4a1620', boots: '#2c0e14' },
  nightswatch: { hair: '#3a3a3a', hairLight: '#545454', skin: '#d8a87c', skinDark: '#ac7f56',
                 cloak: '#22242c', cloakDark: '#15161c', trim: '#4a4d58', legs: '#1c1e24', boots: '#121318' },
  smallfolk: { hair: '#6a4a2a', hairLight: '#8a6438', skin: '#dcae86', skinDark: '#b4855e',
               cloak: '#7a6a52', cloakDark: '#5a4c3a', trim: '#a89878', legs: '#4a4034', boots: '#2f2820' },
  merchant: { hair: '#4a3a2a', hairLight: '#665040', skin: '#dcae86', skinDark: '#b4855e',
              cloak: '#3f7a5a', cloakDark: '#2b5640', trim: '#d8c060', legs: '#38443c', boots: '#242c26' },
  wildling: { hair: '#8a5a2a', hairLight: '#ab7440', skin: '#d8a87c', skinDark: '#ac7f56',
              cloak: '#6a5240', cloakDark: '#4a382c', trim: '#c8b8a0', legs: '#4c3e30', boots: '#302620' },
  rival: { hair: '#d8c04a', hairLight: '#f2dc78', skin: '#e8bc92', skinDark: '#c0906a',
           cloak: '#8a1f28', cloakDark: '#5f151c', trim: '#e0c458', legs: '#4a1a1e', boots: '#2c1012' },
  whitewalker: { hair: '#cfe8f4', hairLight: '#ffffff', skin: '#b8d8e8', skinDark: '#8ab4cc',
                 cloak: '#3a4a5c', cloakDark: '#26323f', trim: '#9fd8f0', legs: '#2c3844', boots: '#1c242c' },
};

export const DIRECTIONS = ['down', 'up', 'left', 'right'];

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/**
 * Leg offsets per walk step. Step 0 and 2 are the neutral pose, 1 and 3 swing
 * opposite legs, which is the classic four-frame GBA cycle.
 */
const LEG_STEPS = [
  { left: 0, right: 0 },
  { left: -1, right: 1 },
  { left: 0, right: 0 },
  { left: 1, right: -1 },
];

function paintLegs(ctx, p, step, dir) {
  const swing = LEG_STEPS[step % LEG_STEPS.length];
  const legs = dir === 'left' || dir === 'right'
    // In profile the legs overlap, so one strides forward and one trails.
    ? [{ x: 5, dy: swing.left, w: 3 }, { x: 8, dy: swing.right, w: 3 }]
    : [{ x: 5, dy: swing.left, w: 3 }, { x: 8, dy: swing.right, w: 3 }];

  for (const leg of legs) {
    rect(ctx, leg.x, 17, leg.w, 4 + leg.dy, p.legs);
    rect(ctx, leg.x, 20 + leg.dy, leg.w, 2, p.boots);
  }
}

function paintCloak(ctx, p, dir) {
  // Torso block.
  rect(ctx, 3, 10, 10, 8, p.cloakDark);
  rect(ctx, 4, 10, 8, 7, p.cloak);

  if (dir === 'down') {
    rect(ctx, 7, 11, 2, 7, p.trim);      // clasp and front seam
    rect(ctx, 2, 11, 2, 6, p.cloakDark); // sleeves
    rect(ctx, 12, 11, 2, 6, p.cloakDark);
    rect(ctx, 2, 16, 2, 2, p.skin);      // hands
    rect(ctx, 12, 16, 2, 2, p.skin);
  } else if (dir === 'up') {
    rect(ctx, 4, 10, 8, 8, p.cloak);
    rect(ctx, 7, 10, 2, 8, p.cloakDark);
    rect(ctx, 2, 11, 2, 6, p.cloakDark);
    rect(ctx, 12, 11, 2, 6, p.cloakDark);
  } else {
    // Profile: narrower body, one visible arm swinging in front.
    rect(ctx, 4, 10, 8, 8, p.cloakDark);
    rect(ctx, 5, 10, 6, 7, p.cloak);
    rect(ctx, 9, 12, 3, 5, p.cloakDark);
    rect(ctx, 10, 16, 2, 2, p.skin);
    rect(ctx, 5, 11, 1, 6, p.trim);
  }
}

function paintHead(ctx, p, dir) {
  const outline = '#20202a';

  if (dir === 'down' || dir === 'up') {
    rect(ctx, 3, 1, 10, 10, outline);
    rect(ctx, 4, 2, 8, 8, dir === 'up' ? p.hair : p.skin);
    if (dir === 'down') {
      rect(ctx, 4, 2, 8, 3, p.hair);          // fringe
      rect(ctx, 4, 2, 8, 1, p.hairLight);
      rect(ctx, 3, 3, 1, 5, p.hair);          // side hair
      rect(ctx, 12, 3, 1, 5, p.hair);
      rect(ctx, 5, 6, 2, 2, outline);         // eyes
      rect(ctx, 9, 6, 2, 2, outline);
      rect(ctx, 5, 6, 1, 1, '#ffffff');
      rect(ctx, 9, 6, 1, 1, '#ffffff');
      rect(ctx, 7, 9, 2, 1, p.skinDark);      // mouth
    } else {
      rect(ctx, 4, 2, 8, 2, p.hairLight);
      rect(ctx, 4, 9, 8, 1, p.skinDark);      // neckline under the hair
    }
  } else {
    // Profile head: shifted forward, with a nose bump.
    rect(ctx, 3, 1, 10, 10, outline);
    rect(ctx, 4, 2, 8, 8, p.skin);
    rect(ctx, 4, 2, 8, 3, p.hair);
    rect(ctx, 4, 2, 8, 1, p.hairLight);
    rect(ctx, 4, 3, 2, 6, p.hair);            // hair falls at the back
    rect(ctx, 9, 6, 2, 2, outline);           // the single visible eye
    rect(ctx, 9, 6, 1, 1, '#ffffff');
    rect(ctx, 12, 6, 1, 2, p.skin);           // nose
    rect(ctx, 10, 9, 2, 1, p.skinDark);
  }
}

/** Paints one frame of one facing into a fresh canvas. */
export function paintActorFrame(palette, dir, step) {
  const { canvas, ctx } = makeCanvas(ACTOR_W, ACTOR_H);
  const p = palette;

  // Contact shadow keeps the sprite planted on the tile.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(4, 20, 8, 2);

  paintLegs(ctx, p, step, dir);
  paintCloak(ctx, p, dir);
  paintHead(ctx, p, dir);

  if (dir === 'right') {
    const flipped = makeCanvas(ACTOR_W, ACTOR_H);
    flipped.ctx.translate(ACTOR_W, 0);
    flipped.ctx.scale(-1, 1);
    flipped.ctx.drawImage(canvas, 0, 0);
    return flipped.canvas;
  }
  return canvas;
}

const sheets = new Map();

/** All four facings x four walk steps for a palette, built once and reused. */
export function actorSheet(paletteName) {
  let sheet = sheets.get(paletteName);
  if (sheet) return sheet;

  const palette = ACTOR_PALETTES[paletteName] ?? ACTOR_PALETTES.smallfolk;
  sheet = {};
  for (const dir of DIRECTIONS) {
    // 'right' reuses the 'left' drawing, mirrored inside paintActorFrame.
    sheet[dir] = LEG_STEPS.map((_, step) =>
      paintActorFrame(palette, dir === 'right' ? 'right' : dir, step));
  }
  sheets.set(paletteName, sheet);
  return sheet;
}

export function drawActor(ctx, paletteName, dir, step, x, y) {
  const sheet = actorSheet(paletteName);
  const frames = sheet[dir] ?? sheet.down;
  ctx.drawImage(frames[step % frames.length], Math.round(x), Math.round(y));
}
