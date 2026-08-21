// Overworld people.
//
// A person is described rather than drawn: a build (man, woman, child, heavy),
// an outfit, a hairstyle and a palette. One routine turns that into four
// facings and a four-step walk cycle, so a new character is a few lines of data
// and armour can be swapped on the player without redrawing anything.

import { makeCanvas } from '../engine/sprites.js';

export const ACTOR_W = 16;
export const ACTOR_H = 32;
export const DIRECTIONS = ['down', 'up', 'left', 'right'];

const OUTLINE = '#20202c';

function rect(ctx, x, y, w, h, color) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// ----------------------------------------------------------------- builds --
// Every measurement the painter needs. Children are shorter with a
// proportionally larger head; heavy builds are wider in the shoulder and
// shorter in the leg.
const BUILDS = {
  man:   { headY: 5, headH: 11, headW: 11, torsoY: 16, torsoH: 11, torsoW: 10,
           legY: 25, legH: 6, legW: 3, legGap: 5, armW: 3, shoulder: 0 },
  woman: { headY: 6, headH: 10, headW: 10, torsoY: 16, torsoH: 11, torsoW: 9,
           legY: 25, legH: 6, legW: 3, legGap: 4, armW: 2, shoulder: -1 },
  child: { headY: 9, headH: 10, headW: 10, torsoY: 19, torsoH: 8, torsoW: 8,
           legY: 26, legH: 5, legW: 2, legGap: 4, armW: 2, shoulder: -1 },
  heavy: { headY: 4, headH: 11, headW: 12, torsoY: 15, torsoH: 13, torsoW: 13,
           legY: 27, legH: 4, legW: 4, legGap: 6, armW: 4, shoulder: 1 },
};

const centred = (w) => Math.round((ACTOR_W - w) / 2);

/** Leg swing per walk step: neutral, left forward, neutral, right forward. */
const LEG_STEPS = [
  { left: 0, right: 0 },
  { left: -1, right: 1 },
  { left: 0, right: 0 },
  { left: 1, right: -1 },
];

// --------------------------------------------------------------- outfits ---
// Each outfit decides how much leg shows and what shape the torso takes.
const OUTFITS = {
  tunic:    { skirt: 0, hem: 25, belt: true },
  leathers: { skirt: 0, hem: 25, belt: true, studs: true },
  cloak:    { skirt: 0, hem: 25, cape: true },
  robe:     { skirt: 0, hem: 31, long: true },      // covers the legs entirely
  gown:     { skirt: 5, hem: 31, long: true },      // flares out to the floor
  rags:     { skirt: 0, hem: 26, ragged: true },
  mail:     { skirt: 2, hem: 27, rings: true, belt: true },
  plate:    { skirt: 1, hem: 27, plated: true, pauldrons: true },
};

// ------------------------------------------------------------ hairstyles ---
const HAIR = {
  short: { cap: 5, sides: 4, back: 0 },
  crop:  { cap: 3, sides: 2, back: 0 },
  long:  { cap: 5, sides: 11, back: 0 },
  braid: { cap: 5, sides: 9, back: 0, tail: true },
  bun:   { cap: 5, sides: 3, back: 0, bun: true },
  bald:  { cap: 0, sides: 0, back: 0 },
  hood:  { cap: 0, sides: 0, back: 0, hood: true },
  helm:  { cap: 0, sides: 0, back: 0, helm: true },
};

// -------------------------------------------------------------- painting ---

function paintLegs(ctx, m, p, outfit, step, dir) {
  if (outfit.long) return;                        // a robe or gown hides them
  const swing = LEG_STEPS[step % LEG_STEPS.length];
  // Two legs spaced evenly about the centre line, the gap set by the build.
  const inner = centred(m.legGap);
  const legs = [
    { x: inner - m.legW + 1, dy: swing.left },
    { x: inner + m.legGap - 1, dy: swing.right },
  ];

  for (const leg of legs) {
    const h = m.legH + leg.dy;
    rect(ctx, leg.x - 1, m.legY, m.legW + 2, h + 1, OUTLINE);
    rect(ctx, leg.x, m.legY, m.legW, h - 1, p.legs);
    rect(ctx, leg.x, m.legY + h - 1, m.legW, 2, p.boots);
  }
}

function paintTorso(ctx, m, p, outfit, dir) {
  const w = m.torsoW + (outfit.pauldrons ? 2 : 0);
  const x = centred(w);
  const top = m.torsoY;
  const bottom = outfit.hem;

  // Silhouette, then fill inside it.
  rect(ctx, x - 1, top, w + 2, bottom - top, OUTLINE);
  rect(ctx, x, top, w, bottom - top - 1, p.cloakDark);
  rect(ctx, x, top, w, Math.max(2, (bottom - top) * 0.7), p.cloak);
  // Lit down the left, shadowed down the right.
  rect(ctx, x, top + 1, 1, bottom - top - 2, p.trim);
  rect(ctx, x + w - 1, top + 1, 1, bottom - top - 2, p.cloakDark);

  // A gown or robe widens toward the floor.
  if (outfit.skirt) {
    for (let i = 1; i <= outfit.skirt; i++) {
      const flare = Math.round((i / outfit.skirt) * (outfit.skirt + 1));
      const y = bottom - outfit.skirt + i - 1;
      rect(ctx, x - flare - 1, y, w + flare * 2 + 2, 1, OUTLINE);
      rect(ctx, x - flare, y, w + flare * 2, 1, p.cloak);
    }
  }

  if (outfit.rings) {
    // Mail reads as a dotted texture rather than individual rings.
    for (let y = top + 1; y < bottom - 2; y += 2) {
      for (let rx = x + 1; rx < x + w - 1; rx += 2) {
        rect(ctx, rx + ((y % 4) ? 1 : 0), y, 1, 1, p.trim);
      }
    }
  }
  if (outfit.plated) {
    rect(ctx, x + 1, top + 1, w - 2, 3, p.trim);           // breastplate shine
    rect(ctx, x + 1, top + 5, w - 2, 1, p.cloakDark);
    rect(ctx, centred(2), top + 1, 2, bottom - top - 4, p.trim);
  }
  if (outfit.pauldrons) {
    rect(ctx, x - 1, top, 4, 4, OUTLINE);
    rect(ctx, x, top, 3, 3, p.trim);
    rect(ctx, x + w - 3, top, 4, 4, OUTLINE);
    rect(ctx, x + w - 2, top, 3, 3, p.trim);
  }
  if (outfit.belt) {
    rect(ctx, x, top + Math.round((bottom - top) * 0.6), w, 2, p.boots);
    rect(ctx, centred(2), top + Math.round((bottom - top) * 0.6), 2, 2, p.trim);
  }
  if (outfit.studs) {
    for (let sy = top + 2; sy < bottom - 4; sy += 3) rect(ctx, x + 2, sy, 1, 1, p.trim);
  }
  if (outfit.ragged) {
    for (let i = 0; i < w; i += 2) rect(ctx, x + i, bottom - 2, 1, 2, OUTLINE);
  }
  if (outfit.cape && dir !== 'up') {
    rect(ctx, x - 2, top + 1, 2, bottom - top - 3, p.cloakDark);
    rect(ctx, x + w, top + 1, 2, bottom - top - 3, p.cloakDark);
  }

  // Collar / front seam, so facing reads at a glance.
  if (dir === 'down') {
    rect(ctx, centred(4), top, 4, 2, p.trim);
    rect(ctx, centred(2), top + 2, 2, bottom - top - 5, p.trim);
  } else if (dir === 'up') {
    rect(ctx, centred(2), top, 2, bottom - top - 2, p.cloakDark);
  } else {
    rect(ctx, x + 1, top + 1, 2, bottom - top - 4, p.trim);
  }
  return { x, w, top, bottom };
}

function paintArms(ctx, m, p, outfit, torso, dir) {
  const armW = m.armW;
  const top = torso.top + 2;
  const h = Math.min(8, torso.bottom - top - 2);
  const handY = top + h - 2;

  if (dir === 'left' || dir === 'right') {
    // Profile: one arm, forward.
    rect(ctx, torso.x + torso.w - 2, top + 1, armW + 1, h, OUTLINE);
    rect(ctx, torso.x + torso.w - 1, top + 2, armW - 1, h - 2, p.cloakDark);
    rect(ctx, torso.x + torso.w - 1, handY, armW - 1, 2, p.skin);
    return;
  }
  rect(ctx, torso.x - armW, top, armW + 1, h + 1, OUTLINE);
  rect(ctx, torso.x - armW + 1, top + 1, armW - 1, h - 1, p.cloakDark);
  rect(ctx, torso.x + torso.w - 1, top, armW + 1, h + 1, OUTLINE);
  rect(ctx, torso.x + torso.w, top + 1, armW - 1, h - 1, p.cloakDark);
  if (dir === 'down') {
    rect(ctx, torso.x - armW + 1, handY, armW - 1, 2, p.skin);
    rect(ctx, torso.x + torso.w, handY, armW - 1, 2, p.skin);
  }
}

function paintHead(ctx, m, p, hair, dir) {
  const w = m.headW;
  const x = centred(w);
  const y = m.headY;
  const h = m.headH;

  rect(ctx, x, y, w, h, OUTLINE);
  rect(ctx, x - 1, y + 2, w + 2, h - 4, OUTLINE);

  const faceColor = dir === 'up' && hair.cap ? p.hair : p.skin;
  const shadeColor = dir === 'up' && hair.cap ? p.hair : p.skinDark;
  rect(ctx, x + 1, y + 1, w - 2, h - 2, faceColor);
  rect(ctx, x, y + 3, w, h - 6, faceColor);
  // The turned-away side and under the jaw.
  rect(ctx, x + w - 2, y + 3, 2, h - 6, shadeColor);
  rect(ctx, x + 2, y + h - 3, w - 4, 1, shadeColor);

  if (hair.hood) {
    // A hood swallows the whole head and leaves a shadowed face.
    rect(ctx, x - 1, y, w + 2, h - 3, p.cloakDark);
    rect(ctx, x, y + 1, w, 3, p.cloak);
    if (dir !== 'up') {
      rect(ctx, x + 2, y + 5, w - 4, h - 8, '#1a1a22');
      rect(ctx, x + 3, y + 7, 2, 2, p.eyeGlow ?? '#8fa2d8');
      rect(ctx, x + w - 5, y + 7, 2, 2, p.eyeGlow ?? '#8fa2d8');
    }
    return;
  }
  if (hair.helm) {
    rect(ctx, x - 1, y, w + 2, h - 4, p.trim);
    rect(ctx, x, y + 1, w, 3, '#ffffff');
    rect(ctx, x - 1, y + h - 5, w + 2, 2, p.cloakDark);
    if (dir !== 'up') {
      rect(ctx, x + 2, y + 6, w - 4, 3, '#12121a');   // visor slit
      rect(ctx, centred(2), y + 4, 2, h - 8, p.trim); // nasal bar
    }
    return;
  }

  if (hair.cap) {
    rect(ctx, x + 1, y + 1, w - 2, hair.cap, p.hair);
    rect(ctx, x, y + 3, w, Math.max(1, hair.cap - 2), p.hair);
    rect(ctx, x + 2, y + 1, w - 4, 2, p.hairLight);
  }
  if (hair.sides) {
    rect(ctx, x, y + 3, 2, hair.sides, p.hair);
    rect(ctx, x + w - 2, y + 3, 2, hair.sides, p.hair);
  }
  if (hair.bun) {
    rect(ctx, x + w - 3, y - 1, 5, 5, OUTLINE);
    rect(ctx, x + w - 2, y, 3, 3, p.hair);
  }
  if (hair.tail && dir !== 'up') {
    rect(ctx, x - 2, y + 5, 2, 10, OUTLINE);
    rect(ctx, x - 2, y + 6, 2, 8, p.hair);
  }

  if (dir === 'up') return;

  if (dir === 'down') {
    const eyeY = y + Math.round(h * 0.55);
    rect(ctx, x + 2, eyeY, 2, 3, OUTLINE);
    rect(ctx, x + w - 4, eyeY, 2, 3, OUTLINE);
    rect(ctx, x + 2, eyeY, 2, 1, '#ffffff');
    rect(ctx, x + w - 4, eyeY, 2, 1, '#ffffff');
    rect(ctx, centred(2), y + h - 3, 2, 1, p.skinDark);
    return;
  }
  // Profile: one eye and a nose breaking the right-hand edge.
  const eyeY = y + Math.round(h * 0.55);
  rect(ctx, x + w - 4, eyeY, 2, 3, OUTLINE);
  rect(ctx, x + w - 4, eyeY, 2, 1, '#ffffff');
  rect(ctx, x + w, eyeY - 1, 2, 3, OUTLINE);
  rect(ctx, x + w, eyeY - 1, 1, 2, p.skin);
  rect(ctx, x + w - 4, y + h - 3, 3, 1, p.skinDark);
  if (hair.sides) rect(ctx, x, y + 3, 4, hair.sides, p.hair);
}

// -------------------------------------------------------- worn equipment ---

const STEEL = { blade: '#c8ccd8', edge: '#f0f4ff', dark: '#6f7684', wood: '#6a4a2a', leather: '#4a3524' };

/**
 * The weapon you are carrying, drawn on the sprite. In the overworld it is
 * sheathed or slung; in a duel it is up and ready.
 */
function paintWeapon(ctx, m, kind, dir, combat) {
  if (!kind || kind === 'none') return;
  const cx = ACTOR_W / 2;

  if (combat) {
    // Held out in front, on the side the character is facing.
    const bx = dir === 'up' ? cx + 4 : cx + 5;
    const by = m.torsoY + 1;
    if (kind === 'blade' || kind === 'dagger') {
      const len = kind === 'dagger' ? 6 : 11;
      rect(ctx, bx, by - len + 4, 2, len, OUTLINE);
      rect(ctx, bx, by - len + 5, 1, len - 2, STEEL.blade);
      rect(ctx, bx - 2, by + 4, 6, 2, STEEL.dark);      // crossguard
      rect(ctx, bx, by + 6, 2, 3, STEEL.leather);       // grip
    } else if (kind === 'axe') {
      rect(ctx, bx, by - 6, 2, 15, STEEL.wood);
      rect(ctx, bx - 3, by - 7, 7, 6, OUTLINE);
      rect(ctx, bx - 2, by - 6, 5, 4, STEEL.blade);
    } else if (kind === 'hammer') {
      rect(ctx, bx, by - 5, 2, 14, STEEL.wood);
      rect(ctx, bx - 3, by - 8, 8, 6, OUTLINE);
      rect(ctx, bx - 2, by - 7, 6, 4, STEEL.dark);
      rect(ctx, bx - 2, by - 7, 6, 1, STEEL.blade);
    } else if (kind === 'spear') {
      rect(ctx, bx, by - 6, 2, 18, STEEL.wood);
      rect(ctx, bx - 1, by - 10, 4, 5, OUTLINE);
      rect(ctx, bx, by - 9, 2, 4, STEEL.edge);
      rect(ctx, bx - 2, by, 6, 1, STEEL.dark);      // the crossbar below the head
    } else if (kind === 'bow') {
      for (let i = 0; i < 14; i++) {
        const curve = Math.round(Math.sin((i / 13) * Math.PI) * 3);
        rect(ctx, bx + curve, by - 6 + i, 2, 1, STEEL.wood);
      }
      rect(ctx, bx, by - 6, 1, 14, '#e8e0cc');
    }
    return;
  }

  // Sheathed / slung.
  if (kind === 'bow') {
    // Slung across the back: visible as an arc behind the shoulders.
    for (let i = 0; i < 12; i++) {
      const curve = Math.round(Math.sin((i / 11) * Math.PI) * 2);
      rect(ctx, cx - 6 - curve, m.torsoY + 1 + i, 2, 1, STEEL.wood);
    }
    return;
  }
  if (kind === 'axe' || kind === 'hammer' || kind === 'spear') {
    // A haft over the shoulder.
    const hx = dir === 'left' || dir === 'right' ? cx - 5 : cx + 4;
    rect(ctx, hx, m.torsoY - 4, 2, 12, STEEL.wood);
    rect(ctx, hx - 2, m.torsoY - 6, 6, 4, OUTLINE);
    rect(ctx, hx - 1, m.torsoY - 5, 4, 2, kind === 'hammer' ? STEEL.dark : STEEL.blade);
    return;
  }
  // Blades hang at the hip.
  const sx = dir === 'left' || dir === 'right' ? cx + 3 : cx + 5;
  const sy = m.torsoY + 6;
  const len = kind === 'dagger' ? 5 : 9;
  rect(ctx, sx, sy, 2, len, STEEL.leather);
  rect(ctx, sx, sy + len, 2, 1, STEEL.dark);
  rect(ctx, sx - 1, sy - 3, 4, 2, STEEL.dark);   // crossguard above the belt
  rect(ctx, sx, sy - 2, 2, 2, '#a8843c');        // pommel
}

/**
 * The shield you are carrying: slung across the back when you are walking away,
 * strapped to the near arm otherwise. Sizes are clamped so a tower shield still
 * fits on a 16-pixel-wide sprite.
 */
function paintShield(ctx, m, kind, palette, dir) {
  if (!kind || kind === 'none') return;
  // Shields carry their own colours rather than the wearer's, so a shield on a
  // plated back still reads as a shield and not as more armour.
  const KIND = {
    buckler:     { size: 3, face: '#9aa2b0', rim: '#5c6270', boss: '#e0e6f0' },
    oakShield:   { size: 4, face: '#8a5a2e', rim: '#4a3018', boss: '#d8c060' },
    towerShield: { size: 5, face: '#6f4a7a', rim: '#3c2743', boss: '#e0d4b0' },
  };
  const look = KIND[kind] ?? KIND.oakShield;
  const size = look.size;
  const cx = ACTOR_W / 2;
  const face = look.face;
  const rim = look.rim;

  if (dir === 'up') {
    const w = Math.min(12, size * 2 + 2);
    const h = Math.min(13, size * 2 + 4);
    const x = Math.round(cx - w / 2);
    const y = m.torsoY + 2;
    rect(ctx, x - 1, y - 1, w + 2, h + 2, OUTLINE);
    rect(ctx, x, y, w, h, rim);
    rect(ctx, x + 1, y + 1, w - 2, h - 2, face);
    rect(ctx, x + Math.floor(w / 2) - 1, y + Math.floor(h / 2) - 1, 2, 2, look.boss);
    return;
  }
  const w = size + 1;
  const h = Math.min(13, size * 2 + 3);
  const x = Math.max(1, Math.round(cx - m.torsoW / 2) - w - 1);
  const y = m.torsoY + 2;
  rect(ctx, x - 1, y - 1, w + 2, h + 2, OUTLINE);
  rect(ctx, x, y, w, h, rim);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, face);
  rect(ctx, x + 1, y + Math.floor(h / 2) - 1, w - 2, 2, look.boss);
}

// ------------------------------------------------------------- assembling --

/** Fills in the defaults a descriptor leaves out. */
function normalise(who) {
  const preset = typeof who === 'string' ? (ACTOR_PALETTES[who] ?? ACTOR_PALETTES.smallfolk) : who;
  return {
    build: preset.build ?? 'man',
    outfit: preset.outfit ?? 'tunic',
    hair: preset.hair ?? 'short',
    weapon: preset.weapon ?? 'none',
    shield: preset.shield ?? 'none',
    palette: preset.palette ?? preset,
  };
}

export function paintActorFrame(who, dir, step, combat = false) {
  const a = normalise(who);
  const m = BUILDS[a.build] ?? BUILDS.man;
  const outfit = OUTFITS[a.outfit] ?? OUTFITS.tunic;
  const hair = HAIR[a.hair] ?? HAIR.short;
  const p = a.palette;

  const { canvas, ctx } = makeCanvas(ACTOR_W, ACTOR_H);

  // Contact shadow keeps the sprite planted on its tile.
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.fillRect(4, 30, 8, 2);
  ctx.fillRect(3, 31, 10, 1);

  if (dir === 'up') paintShield(ctx, m, a.shield, p, dir);
  if (dir === 'up') paintWeapon(ctx, m, a.weapon, dir, combat);

  paintLegs(ctx, m, p, outfit, step, dir);
  const torso = paintTorso(ctx, m, p, outfit, dir);
  paintArms(ctx, m, p, outfit, torso, dir);
  paintHead(ctx, m, p, hair, dir);

  if (dir !== 'up') {
    paintShield(ctx, m, a.shield, p, dir);
    paintWeapon(ctx, m, a.weapon, dir, combat);
  }

  // The profile is drawn facing right, so the left-facing frame is mirrored.
  if (dir === 'left') {
    const flipped = makeCanvas(ACTOR_W, ACTOR_H);
    flipped.ctx.translate(ACTOR_W, 0);
    flipped.ctx.scale(-1, 1);
    flipped.ctx.drawImage(canvas, 0, 0);
    return flipped.canvas;
  }
  return canvas;
}

const sheets = new Map();

function keyFor(who, combat) {
  if (typeof who === 'string') return `${who}:${combat ? 'c' : 'o'}`;
  const a = normalise(who);
  return `${a.build}|${a.outfit}|${a.hair}|${a.weapon}|${a.shield}|`
    + `${a.palette.cloak}${a.palette.hair}${a.palette.skin}${a.palette.trim}|${combat ? 'c' : 'o'}`;
}

/** All four facings x four walk steps, built once per appearance. */
export function actorSheet(who, combat = false) {
  const key = keyFor(who, combat);
  let sheet = sheets.get(key);
  if (sheet) return sheet;
  sheet = {};
  for (const dir of DIRECTIONS) {
    sheet[dir] = LEG_STEPS.map((_, step) => paintActorFrame(who, dir, step, combat));
  }
  sheets.set(key, sheet);
  return sheet;
}

export function drawActor(ctx, who, dir, step, x, y, { combat = false } = {}) {
  const sheet = actorSheet(who, combat);
  const frames = sheet[dir] ?? sheet.down;
  ctx.drawImage(frames[step % frames.length], Math.round(x), Math.round(y));
}

// ------------------------------------------------------------- the cast ----
// Colours, then who wears what. Keeping these together makes it obvious at a
// glance that a town has men, women and children in it rather than one body in
// fifteen colours.

const P = (hair, hairLight, skin, skinDark, cloak, cloakDark, trim, legs, boots) =>
  ({ hair, hairLight, skin, skinDark, cloak, cloakDark, trim, legs, boots });

export const ACTOR_PALETTES = {
  // --- the player -----------------------------------------------------------
  hero: { build: 'man', outfit: 'tunic', hair: 'short',
    palette: P('#5a3a20', '#7a5230', '#e8b88c', '#c08f66', '#5c6472', '#414855', '#c8cad2', '#3d3a44', '#2a2730') },
  heroine: { build: 'woman', outfit: 'tunic', hair: 'braid',
    palette: P('#3a2a1c', '#54402c', '#e8b88c', '#c08f66', '#6a5a72', '#4c4054', '#d0c6dc', '#3d3a44', '#2a2730') },

  // --- Winterfell and the North --------------------------------------------
  maester: { build: 'man', outfit: 'robe', hair: 'bald',
    palette: P('#d8d8d0', '#f0f0e8', '#dcae86', '#b4855e', '#7a6a4a', '#584c34', '#c8b070', '#4a4238', '#2f2a22') },
  guard: { build: 'man', outfit: 'mail', hair: 'helm',
    palette: P('#2e2a26', '#46403a', '#d8a87c', '#ac7f56', '#4a5568', '#333c4c', '#9aa6bc', '#37414f', '#242a34') },
  stark: { build: 'man', outfit: 'cloak', hair: 'short',
    palette: P('#4a3728', '#65503a', '#e0b088', '#b8845c', '#6d7480', '#4d535d', '#dfe3ea', '#3a3f47', '#262a30') },
  starkLady: { build: 'woman', outfit: 'gown', hair: 'long',
    palette: P('#7a4a2a', '#9c6438', '#e8c09a', '#bd9270', '#5f6b7a', '#414b58', '#dfe3ea', '#3a3f47', '#262a30') },
  septa: { build: 'woman', outfit: 'robe', hair: 'hood',
    palette: P('#8a8a84', '#a4a49c', '#dcae86', '#b4855e', '#c8c4b8', '#9a968a', '#f0ece0', '#8a8680', '#54504a') },
  nightswatch: { build: 'man', outfit: 'cloak', hair: 'crop',
    palette: P('#3a3a3a', '#545454', '#d8a87c', '#ac7f56', '#22242c', '#15161c', '#4a4d58', '#1c1e24', '#121318') },
  wildling: { build: 'man', outfit: 'rags', hair: 'long',
    palette: P('#8a5a2a', '#ab7440', '#d8a87c', '#ac7f56', '#6a5240', '#4a382c', '#c8b8a0', '#4c3e30', '#302620') },
  wildlingWoman: { build: 'woman', outfit: 'rags', hair: 'long',
    palette: P('#b4501e', '#d4703a', '#e4b48c', '#b8875f', '#5f4a3a', '#3f3128', '#c0ac92', '#463a2e', '#2c231c') },

  // --- smallfolk, in some variety ------------------------------------------
  smallfolk: { build: 'man', outfit: 'tunic', hair: 'short',
    palette: P('#6a4a2a', '#8a6438', '#dcae86', '#b4855e', '#7a6a52', '#5a4c3a', '#a89878', '#4a4034', '#2f2820') },
  goodwife: { build: 'woman', outfit: 'gown', hair: 'bun',
    palette: P('#4a3a28', '#66503a', '#e0b48c', '#b88a62', '#8a7a5c', '#645842', '#c0b08c', '#4a4034', '#2f2820') },
  child: { build: 'child', outfit: 'tunic', hair: 'crop',
    palette: P('#c8a050', '#e0bc74', '#f0c8a0', '#c49a74', '#9a8a6a', '#74684e', '#c8bc98', '#5a4c3c', '#382e24') },
  girl: { build: 'child', outfit: 'gown', hair: 'long',
    palette: P('#6a4028', '#8a5a38', '#f0c8a0', '#c49a74', '#a06a80', '#744a5c', '#e0c0c8', '#5a4c3c', '#382e24') },
  oldman: { build: 'man', outfit: 'robe', hair: 'bald',
    palette: P('#d0d0c8', '#eaeae2', '#d4ae8c', '#a88266', '#6a6258', '#4a443c', '#9a9084', '#4a4438', '#2e2a22') },
  merchant: { build: 'man', outfit: 'cloak', hair: 'short',
    palette: P('#4a3a2a', '#665040', '#dcae86', '#b4855e', '#3f7a5a', '#2b5640', '#d8c060', '#38443c', '#242c26') },

  // --- the great houses -----------------------------------------------------
  lannister: { build: 'man', outfit: 'plate', hair: 'short',
    palette: P('#d8b24a', '#f0d070', '#e8bc92', '#c0906a', '#9c1f26', '#6f151b', '#e8c460', '#5a1c20', '#3a1215') },
  tully: { build: 'man', outfit: 'mail', hair: 'short',
    palette: P('#a04a28', '#c46a3e', '#e8bc92', '#c0906a', '#2f6ea0', '#1f4d74', '#b03040', '#274a68', '#1a3044') },
  tullyLady: { build: 'woman', outfit: 'gown', hair: 'long',
    palette: P('#b4552c', '#d4753e', '#e8c49c', '#bd9670', '#3a7fb0', '#265a80', '#c04050', '#2a5070', '#1a3044') },
  baratheon: { build: 'man', outfit: 'plate', hair: 'crop',
    palette: P('#2a2622', '#443e36', '#dcae86', '#b4855e', '#c8a83a', '#8f7522', '#22262e', '#4a4028', '#2a2418') },
  targaryen: { build: 'woman', outfit: 'gown', hair: 'long',
    palette: P('#e8e4dc', '#ffffff', '#e8c0a0', '#c09474', '#7c1f2c', '#55131d', '#e0d4c8', '#4a1620', '#2c0e14') },
  rival: { build: 'man', outfit: 'plate', hair: 'short',
    palette: P('#d8c04a', '#f2dc78', '#e8bc92', '#c0906a', '#8a1f28', '#5f151c', '#e0c458', '#4a1a1e', '#2c1012') },
  tyrell: { build: 'man', outfit: 'cloak', hair: 'long',
    palette: P('#5a4028', '#7a5a38', '#e4b892', '#bb8c64', '#3f8a4a', '#296030', '#e8d878', '#356a3a', '#1f4224') },
  arryn: { build: 'man', outfit: 'mail', hair: 'short',
    palette: P('#6a5a48', '#8a7a64', '#dcae86', '#b4855e', '#5a86b8', '#3a5c86', '#e8f0fa', '#3a5570', '#243546') },
  martell: { build: 'man', outfit: 'leathers', hair: 'long',
    palette: P('#2e2620', '#483c30', '#c8905e', '#9a6a40', '#c85a20', '#8f3c12', '#f0c860', '#7a3a14', '#4a220c') },
  bolton: { build: 'man', outfit: 'leathers', hair: 'short',
    palette: P('#3a3028', '#544838', '#d0a078', '#a07452', '#7c2020', '#4e1212', '#e0d8cc', '#3a2a2a', '#221818') },
  ironborn: { build: 'man', outfit: 'leathers', hair: 'crop',
    palette: P('#2f2a24', '#4a4238', '#d4a678', '#a87f52', '#2b3a44', '#1b262e', '#6f8894', '#232f38', '#151d24') },
  cersei: { build: 'woman', outfit: 'gown', hair: 'long',
    palette: P('#d8c070', '#f0dc9c', '#e8c49c', '#bd9670', '#6f1f2c', '#48131c', '#d8b040', '#4a1a22', '#2c0f14') },

  // --- fighters -------------------------------------------------------------
  hound: { build: 'heavy', outfit: 'plate', hair: 'long',
    palette: P('#3a3430', '#524a44', '#c89878', '#8f6244', '#4a4a4e', '#2e2e32', '#8a8a90', '#33333a', '#1e1e24') },
  mountain: { build: 'heavy', outfit: 'plate', hair: 'helm',
    palette: P('#2a2622', '#3e3934', '#c09070', '#8f6248', '#6a2a2a', '#421818', '#9a9aa4', '#3a2424', '#241414') },
  braavosi: { build: 'man', outfit: 'leathers', hair: 'long',
    palette: P('#54483c', '#6f6050', '#d8a87c', '#ac7f56', '#5c4a6c', '#3e3049', '#c8b46a', '#413350', '#281f33') },
  sellsword: { build: 'man', outfit: 'leathers', hair: 'crop',
    palette: P('#4a4038', '#665a4c', '#d4a678', '#a87f52', '#5c5348', '#3e3830', '#9a8c74', '#443c34', '#2a251f') },
  brienne: { build: 'heavy', outfit: 'plate', hair: 'crop',
    palette: P('#e0cc84', '#f4e4a8', '#e4b892', '#bb8c64', '#8fa2c0', '#5f7290', '#e8eef8', '#4a5568', '#2c3442') },
  brotherhood: { build: 'man', outfit: 'cloak', hair: 'hood',
    palette: P('#6a3a28', '#8a5238', '#d8a87c', '#ac7f56', '#7a3020', '#4f1e14', '#e8a040', '#4a3024', '#2c1c14') },
  kingsguard: { build: 'man', outfit: 'plate', hair: 'helm',
    palette: P('#4a4238', '#655c4e', '#dcae86', '#b4855e', '#e8e8ec', '#b4b4bc', '#f8f8ff', '#a0a0a8', '#5c5c64') },
  unsullied: { build: 'man', outfit: 'mail', hair: 'helm',
    palette: P('#1e1a18', '#332c28', '#a87048', '#7a4e30', '#3a4048', '#242a30', '#8a9098', '#2c3238', '#1a1e24') },
  redPriest: { build: 'woman', outfit: 'robe', hair: 'long',
    palette: P('#a83a30', '#c85a48', '#e0b494', '#b4886a', '#a02020', '#6a1212', '#f0a840', '#5a1818', '#360e0e') },
  noble: { build: 'man', outfit: 'cloak', hair: 'short',
    palette: P('#3a2c20', '#554134', '#e0b48c', '#b88a62', '#4a3c6a', '#312848', '#c8b070', '#3a3050', '#221c30') },
  whitewalker: { build: 'man', outfit: 'robe', hair: 'hood',
    palette: { ...P('#cfe8f4', '#ffffff', '#b8d8e8', '#8ab4cc', '#3a4a5c', '#26323f', '#9fd8f0', '#2c3844', '#1c242c'),
      eyeGlow: '#4fd8ff' } },
};

export const BUILD_NAMES = Object.keys(BUILDS);
export const OUTFIT_NAMES = Object.keys(OUTFITS);
export const HAIR_NAMES = Object.keys(HAIR);
