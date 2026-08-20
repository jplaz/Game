// Overworld people are drawn as a small paperdoll rather than hand-placed
// pixels: a head, a cloak and two legs, painted from a palette. That gives four
// facings and a four-step walk cycle for every NPC in the game from one
// routine, and a new character is just a new colour set.

import { makeCanvas } from '../engine/sprites.js';

export const ACTOR_W = 16;
export const ACTOR_H = 32;

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

const OUTLINE = '#20202c';

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/**
 * Leg positions per walk step. Steps 0 and 2 are the neutral stance; 1 and 3
 * swing opposite legs, which is the four-frame cycle the GBA games use.
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
    // In profile one leg strides forward and the other trails behind it.
    ? [{ x: 5, dy: swing.left }, { x: 8, dy: swing.right }]
    : [{ x: 4, dy: swing.left }, { x: 9, dy: swing.right }];

  for (const leg of legs) {
    const top = 25;
    const height = 5 + leg.dy;
    rect(ctx, leg.x - 1, top, 5, height + 1, OUTLINE);
    rect(ctx, leg.x, top, 3, height - 1, p.legs);
    rect(ctx, leg.x, top + height - 1, 3, 2, p.boots);
  }
}

function paintBody(ctx, p, dir) {
  // Silhouette first, then the fill inside it — cheaper than tracing an outline
  // and it guarantees the sprite reads against any tile.
  rect(ctx, 2, 16, 12, 11, OUTLINE);
  rect(ctx, 3, 17, 10, 9, p.cloakDark);
  rect(ctx, 3, 17, 10, 7, p.cloak);
  rect(ctx, 4, 17, 8, 2, p.cloak);

  if (dir === 'down') {
    rect(ctx, 7, 18, 2, 8, p.trim);          // front seam
    rect(ctx, 6, 17, 4, 2, p.trim);          // collar
    rect(ctx, 1, 18, 3, 8, OUTLINE);         // sleeves
    rect(ctx, 12, 18, 3, 8, OUTLINE);
    rect(ctx, 2, 19, 2, 6, p.cloakDark);
    rect(ctx, 12, 19, 2, 6, p.cloakDark);
    rect(ctx, 2, 24, 2, 3, p.skin);          // hands
    rect(ctx, 12, 24, 2, 3, p.skin);
  } else if (dir === 'up') {
    rect(ctx, 3, 17, 10, 9, p.cloak);
    rect(ctx, 7, 17, 2, 9, p.cloakDark);     // the seam down the back
    rect(ctx, 1, 18, 3, 8, OUTLINE);
    rect(ctx, 12, 18, 3, 8, OUTLINE);
    rect(ctx, 2, 19, 2, 7, p.cloakDark);
    rect(ctx, 12, 19, 2, 7, p.cloakDark);
  } else {
    rect(ctx, 3, 17, 10, 9, p.cloakDark);
    rect(ctx, 4, 17, 7, 8, p.cloak);
    rect(ctx, 4, 18, 2, 7, p.trim);          // cloak edge catching the light
    rect(ctx, 9, 19, 5, 7, OUTLINE);         // leading arm
    rect(ctx, 10, 20, 3, 5, p.cloakDark);
    rect(ctx, 10, 24, 3, 3, p.skin);
  }
}

function paintHead(ctx, p, dir) {
  // Emerald heads are large and rounded, roughly two fifths of the sprite.
  rect(ctx, 2, 3, 12, 14, OUTLINE);
  rect(ctx, 1, 5, 14, 10, OUTLINE);

  if (dir === 'up') {
    rect(ctx, 3, 4, 10, 12, p.hair);
    rect(ctx, 2, 6, 12, 9, p.hair);
    rect(ctx, 4, 4, 8, 3, p.hairLight);
    rect(ctx, 3, 14, 10, 2, p.hairDark ?? p.hair);
    return;
  }

  if (dir === 'down') {
    rect(ctx, 3, 5, 10, 11, p.skin);         // face
    rect(ctx, 2, 7, 12, 8, p.skin);
    rect(ctx, 3, 4, 10, 5, p.hair);          // hair cap
    rect(ctx, 2, 6, 12, 3, p.hair);
    rect(ctx, 4, 4, 8, 2, p.hairLight);
    rect(ctx, 2, 8, 2, 4, p.hair);           // sideburns
    rect(ctx, 12, 8, 2, 4, p.hair);
    rect(ctx, 4, 11, 2, 3, OUTLINE);         // eyes
    rect(ctx, 10, 11, 2, 3, OUTLINE);
    rect(ctx, 4, 11, 2, 1, '#ffffff');
    rect(ctx, 10, 11, 2, 1, '#ffffff');
    rect(ctx, 7, 14, 2, 1, p.skinDark);      // mouth
    rect(ctx, 3, 14, 2, 2, p.skinDark);      // jaw shading
    rect(ctx, 11, 14, 2, 2, p.skinDark);
    return;
  }

  // Profile: hair falls at the back, a nose breaks the front edge.
  rect(ctx, 3, 5, 10, 11, p.skin);
  rect(ctx, 2, 7, 12, 8, p.skin);
  rect(ctx, 3, 4, 10, 5, p.hair);
  rect(ctx, 2, 6, 12, 3, p.hair);
  rect(ctx, 2, 6, 5, 8, p.hair);
  rect(ctx, 4, 4, 6, 2, p.hairLight);
  rect(ctx, 9, 11, 2, 3, OUTLINE);           // the single visible eye
  rect(ctx, 9, 11, 2, 1, '#ffffff');
  rect(ctx, 13, 10, 2, 3, OUTLINE);          // nose
  rect(ctx, 13, 10, 1, 2, p.skin);
  rect(ctx, 10, 14, 3, 1, p.skinDark);
}

/** Paints one frame of one facing into a fresh canvas. */
export function paintActorFrame(palette, dir, step) {
  const { canvas, ctx } = makeCanvas(ACTOR_W, ACTOR_H);
  const p = palette;

  // Contact shadow, so the sprite sits on the tile rather than floating.
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.fillRect(3, 30, 10, 2);
  ctx.fillRect(2, 31, 12, 1);

  paintLegs(ctx, p, step, dir);
  paintBody(ctx, p, dir);
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
    sheet[dir] = LEG_STEPS.map((_, step) => paintActorFrame(palette, dir, step));
  }
  sheets.set(paletteName, sheet);
  return sheet;
}

export function drawActor(ctx, paletteName, dir, step, x, y) {
  const sheet = actorSheet(paletteName);
  const frames = sheet[dir] ?? sheet.down;
  ctx.drawImage(frames[step % frames.length], Math.round(x), Math.round(y));
}
