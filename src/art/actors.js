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

const OUTLINE = '#181420';

function rect(ctx, x, y, w, h, color) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/**
 * The light in this world comes from up and to the left, on every sprite,
 * always. A palette gives a garment two tones, which is enough to colour it and
 * not enough to give it a body; these derive the other two, so every character
 * gets a lit edge, a mid, a shaded side and a dark crease without anybody
 * having to pick eight colours by hand for forty people.
 */
function toneShift(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => {
    const v = amount > 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const lit = (hex) => toneShift(hex, 0.13);
const dim = (hex) => toneShift(hex, -0.22);
const deep = (hex) => toneShift(hex, -0.4);
/* Trousers and boots are painted near-black in the palettes, which is the
   right colour for cloth and the wrong colour next to a near-black keyline.
   This is the tone they are actually drawn in. */
const pale = (hex) => toneShift(hex, 0.32);

// ----------------------------------------------------------------- builds --
// Every measurement the painter needs. Children are shorter with a
// proportionally larger head; heavy builds are wider in the shoulder and
// shorter in the leg.
const BUILDS = {
  // Slimmer, and standing up straighter. A head eleven pixels across on a
  // sixteen-pixel sprite is two thirds of the width of the whole person, which
  // is a doll rather than a man. These are cut to a different rule: the head is
  // narrower than the shoulders, the shoulders are narrower than the sprite, and
  // the legs are two separate legs with daylight between them. `legGap` is that
  // daylight - the transparent channel between the two outlined legs - and not,
  // as it used to be, a spacing that left the two outlines touching and the
  // bottom third of everybody in the game a single black brick.
  man:   { headY: 4, headH: 9,  headW: 8,  torsoY: 14, torsoH: 10, torsoW: 8,
           legY: 24, legH: 7, legW: 2, legGap: 4, armW: 2, shoulder: 0 },
  woman: { headY: 5, headH: 8,  headW: 7,  torsoY: 14, torsoH: 10, torsoW: 7,
           legY: 24, legH: 7, legW: 2, legGap: 4, armW: 2, shoulder: -1 },
  child: { headY: 9, headH: 8,  headW: 7,  torsoY: 18, torsoH: 7,  torsoW: 7,
           legY: 25, legH: 6, legW: 2, legGap: 4, armW: 2, shoulder: -1 },
  heavy: { headY: 4, headH: 9,  headW: 9,  torsoY: 14, torsoH: 10, torsoW: 9,
           legY: 24, legH: 7, legW: 3, legGap: 4, armW: 2, shoulder: 1 },
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
// Hems come up with the shorter torso, so there is leg to see. A tunic that
// reaches the ankle on a slim figure is a nightshirt.
const OUTFITS = {
  tunic:    { skirt: 0, hem: 24, belt: true },
  leathers: { skirt: 0, hem: 24, belt: true, studs: true },
  cloak:    { skirt: 0, hem: 24, cape: true },
  robe:     { skirt: 0, hem: 31, long: true },      // covers the legs entirely
  gown:     { skirt: 5, hem: 31, long: true },      // flares out to the floor
  rags:     { skirt: 0, hem: 25, ragged: true },
  mail:     { skirt: 2, hem: 26, rings: true, belt: true },
  plate:    { skirt: 1, hem: 26, plated: true, pauldrons: true },
};

// ------------------------------------------------------------ hairstyles ---
const HAIR = {
  // Cut down with the head. A cap four rows deep on a nine-row head is a hat
  // pulled over the eyes.
  short: { cap: 3, sides: 3, back: 0 },
  crop:  { cap: 2, sides: 2, back: 0 },
  long:  { cap: 3, sides: 8, back: 0 },
  braid: { cap: 3, sides: 7, back: 0, tail: true },
  bun:   { cap: 3, sides: 3, back: 0, bun: true },
  bald:  { cap: 0, sides: 0, back: 0 },
  hood:  { cap: 0, sides: 0, back: 0, hood: true },
  helm:  { cap: 0, sides: 0, back: 0, helm: true },
};

// -------------------------------------------------------------- painting ---

function paintLegs(ctx, m, p, outfit, step, dir) {
  if (outfit.long) return;                        // a robe or gown hides them
  const swing = LEG_STEPS[step % LEG_STEPS.length];

  // Two legs with daylight between them. The channel has to survive `keyline`,
  // which rings anything solid in one pixel of near-black from both sides: a
  // two-pixel gap is entirely eaten and the legs weld back into one black brick,
  // which is what they had been doing. So the inner edges are left for the
  // keyline to draw, and `legGap` is measured between the two trouser legs
  // themselves - four pixels, of which the keyline takes two and two stay open.
  const span = m.legW * 2 + m.legGap + 2;
  const left = centred(span) + 1;
  const legs = [
    { x: left, dy: swing.left, outer: -1 },
    { x: left + m.legW + m.legGap, dy: swing.right, outer: m.legW },
  ];

  for (const leg of legs) {
    const h = m.legH + leg.dy;
    const shin = h - 2;                          // what is trouser, above the boot
    rect(ctx, leg.x + leg.outer, m.legY, 1, h + 1, OUTLINE);
    rect(ctx, leg.x, m.legY + h, m.legW, 1, OUTLINE);
    // The trouser is drawn a shade up from the palette colour, because the
    // palette leg colour and the keyline are near enough the same darkness that
    // a leg painted in it disappears into its own outline.
    rect(ctx, leg.x, m.legY, m.legW, shin, pale(p.legs));
    rect(ctx, leg.x + m.legW - 1, m.legY, 1, shin, p.legs);
    // The boot, and a line where the trouser ends and the leather starts.
    rect(ctx, leg.x, m.legY + shin, m.legW, 2, p.boots);
    rect(ctx, leg.x, m.legY + shin, m.legW - 1, 1, dim(p.legs));
  }
}

function paintTorso(ctx, m, p, outfit, dir) {
  const w = m.torsoW + (outfit.pauldrons ? 1 : 0);
  const x = centred(w);
  const top = m.torsoY;
  const bottom = outfit.hem;

  // Silhouette, then fill inside it.
  rect(ctx, x - 1, top, w + 2, bottom - top, OUTLINE);
  rect(ctx, x, top, w, bottom - top - 1, p.cloakDark);
  rect(ctx, x, top, w, Math.max(2, (bottom - top) * 0.82), p.cloak);

  // Shoulders are not square. Knocking the top two corners off is most of what
  // turns a coloured rectangle into somebody standing there.
  rect(ctx, x, top, 1, 1, OUTLINE);
  rect(ctx, x + w - 1, top, 1, 1, OUTLINE);

  // Four tones down the body, lit from up and to the left. One column each:
  // a lit edge, the garment's own colour across the middle, its shaded side,
  // and a crease down the far edge where the light does not reach.
  rect(ctx, x, top + 1, 1, bottom - top - 2, lit(p.cloak));
  rect(ctx, x + w - 2, top + 2, 1, bottom - top - 3, p.cloakDark);
  rect(ctx, x + w - 1, top + 1, 1, bottom - top - 2, deep(p.cloak));

  // The head throws a shadow across the top of the chest, which is what stops
  // a head reading as a ball resting on a box. One row, and not a black one.
  rect(ctx, x + 1, top, w - 2, 1, p.cloakDark);

  // A gown or robe widens toward the floor - but never past the edge of the
  // sprite, or the hem runs off into the next tile as a solid band.
  if (outfit.skirt) {
    // Two pixels of margin either side, always: a flare that runs to the edge
    // of the sprite is a black bar joining this person to the one beside them.
    const room = Math.max(0, Math.floor((ACTOR_W - 6 - w) / 2));
    for (let i = 1; i <= outfit.skirt; i++) {
      const flare = Math.min(room, Math.round((i / outfit.skirt) * (outfit.skirt + 1)));
      const y = bottom - outfit.skirt + i - 1;
      rect(ctx, x - flare - 1, y, w + flare * 2 + 2, 1, OUTLINE);
      rect(ctx, x - flare, y, w + flare * 2, 1, p.cloak);
      rect(ctx, x - flare, y, 1, 1, lit(p.cloak));
      rect(ctx, x + w + flare - 1, y, 1, 1, deep(p.cloak));
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
  /* Seen from behind, a cloak is the whole of somebody: it hangs off both
     shoulders, folds down the spine and swings at the hem. Drawn as a flat
     rectangle it read as a piece of card, which is what the player was looking
     at for the whole of every duel. */
  if (dir === 'up') {
    const cw = outfit.cape ? Math.min(w + 2, ACTOR_W - 4) : w;
    const cx = centred(cw);
    if (outfit.cape) {
      rect(ctx, cx - 1, top + 1, cw + 2, bottom - top - 1, OUTLINE);
      rect(ctx, cx, top + 1, cw, bottom - top - 2, p.cloakDark);
      rect(ctx, cx + 1, top + 1, cw - 2, bottom - top - 3, p.cloak);
    }
    // Two folds down the back, and the light off the left shoulder.
    rect(ctx, cx + 1, top + 2, 1, bottom - top - 5, lit(p.cloak));
    rect(ctx, centred(1), top + 2, 1, bottom - top - 5, p.cloakDark);
    rect(ctx, cx + cw - 3, top + 3, 1, bottom - top - 6, deep(p.cloak));
    // The hem, catching the light along its edge.
    rect(ctx, cx + 1, bottom - 3, cw - 2, 1, deep(p.cloak));
    rect(ctx, cx + 1, bottom - 2, cw - 2, 1, p.cloakDark);
    // A belt or a baldric across it, so the back is not one flat field.
    rect(ctx, cx, top + Math.round((bottom - top) * 0.55), cw, 2, p.boots);
    rect(ctx, cx, top + Math.round((bottom - top) * 0.55), cw, 1, p.legs);
  }

  // A collar, so facing reads at a glance. It used to run the whole length of
  // the torso, which on a floor-length gown is a white stripe from the throat
  // to the hem - the single worst thing about how these people looked.
  if (dir === 'down') {
    rect(ctx, centred(4), top, 4, 2, p.trim);
    rect(ctx, centred(2), top + 2, 2, Math.min(4, bottom - top - 5), p.trim);
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
    rect(ctx, torso.x + torso.w - 1, top + 2, armW, h - 2, p.cloakDark);
    rect(ctx, torso.x + torso.w - 1, handY, armW, 2, p.skin);
    return;
  }

  // An arm used to be a three-pixel box of keyline with one pixel of sleeve
  // inside it, which is why everybody in the game had two black bars down their
  // sides. It is now one column of keyline on the outside and sleeve for the
  // rest, so the arm reads as an arm and the silhouette stops being a slab.
  const nearFill = Math.max(3, torso.x - armW + 1);
  const farFill = Math.min(ACTOR_W - armW - 3, torso.x + torso.w - 1);

  rect(ctx, nearFill - 1, top, 1, h + 1, OUTLINE);
  rect(ctx, nearFill, top + h, armW, 1, OUTLINE);
  rect(ctx, nearFill, top, armW, h, p.cloakDark);
  rect(ctx, nearFill, top, 1, h, lit(p.cloak));      // light down the near sleeve

  rect(ctx, farFill + armW, top, 1, h + 1, OUTLINE);
  rect(ctx, farFill, top + h, armW, 1, OUTLINE);
  rect(ctx, farFill, top, armW, h, p.cloakDark);
  rect(ctx, farFill + armW - 1, top, 1, h, deep(p.cloak));

  if (dir === 'down') {
    rect(ctx, nearFill, handY, armW, 2, p.skin);
    rect(ctx, farFill, handY, armW, 2, p.skin);
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

  if (dir !== 'up') {
    rect(ctx, centred(4), y + h - 1, 4, 2, p.skinDark);
    rect(ctx, centred(4), y + h - 1, 3, 1, p.skin);
  }

  if (hair.hood) {
    // A hood swallows the whole head. The opening is the bottom half of it, so
    // there is a face in the shadow rather than a shadow where a face was.
    rect(ctx, x - 1, y, w + 2, h, p.cloakDark);
    rect(ctx, x, y, w, 1, deep(p.cloak));
    rect(ctx, x, y + 1, w, 3, p.cloak);
    rect(ctx, x + 1, y + 1, w - 3, 1, lit(p.cloak));
    if (dir !== 'up') {
      rect(ctx, x + 1, y + 4, w - 2, h - 5, '#1a1a22');
      const glow = p.eyeGlow ?? '#8fa2d8';
      rect(ctx, x + 2, y + 5, 2, 2, glow);
      rect(ctx, x + w - 4, y + 5, 2, 2, glow);
    }
    return;
  }

  if (hair.helm) {
    // A helm is a dome of steel, not a white bar. Lit across the crown, its own
    // colour down the middle, shadowed under the brow, with the corners knocked
    // off the top so it reads as round.
    const steel = p.trim;
    rect(ctx, x - 1, y + 1, w + 2, h - 5, deep(steel));
    rect(ctx, x, y + 1, w, h - 5, steel);
    rect(ctx, x, y, w, 1, deep(steel));
    rect(ctx, x + 1, y, w - 2, 1, steel);
    rect(ctx, x + 1, y + 1, w - 3, 2, lit(steel));
    rect(ctx, x + w - 1, y + 2, 1, h - 7, deep(steel));
    // The brow band, and the shadow it throws over the face beneath.
    rect(ctx, x - 1, y + h - 5, w + 2, 2, p.cloakDark);
    if (dir === 'up') {
      // From behind, everything below the brow band is aventail, not a bare
      // neck: a helm with a strip of skin under it reads as a man in a bucket.
      rect(ctx, x, y + h - 3, w, 3, p.cloakDark);
      rect(ctx, x + 1, y + h - 3, w - 3, 1, steel);
    }
    if (dir !== 'up') {
      rect(ctx, x + 2, y + 6, w - 4, 3, OUTLINE);        // visor slit
      rect(ctx, centred(2), y + 4, 2, h - 8, steel);     // nasal bar
      rect(ctx, centred(2), y + 4, 1, h - 8, lit(steel));
    }
    return;
  }

  if (hair.cap) {
    rect(ctx, x + 1, y + 1, w - 2, hair.cap, p.hair);
    rect(ctx, x, y + 3, w, Math.max(1, hair.cap - 2), p.hair);
    rect(ctx, x + 2, y + 1, w - 4, 2, p.hairLight);
  }
  /* From behind, the whole head is hair, and a flat block of it is the worst
     sprite in the game - it is on screen for every fight in it. Light the
     crown, shade the far side, and put a neck under it. */
  if (dir === 'up' && hair.cap) {
    rect(ctx, x + 1, y + 1, w - 2, 2, p.hairLight);
    rect(ctx, x + 2, y, w - 4, 1, p.hairLight);
    rect(ctx, x + w - 3, y + 2, 2, h - 5, OUTLINE);
    rect(ctx, x + w - 3, y + 2, 1, h - 5, p.hair);
    rect(ctx, x, y + 2, 1, h - 5, p.hairLight);
    // The nape, and the neck below it.
    rect(ctx, x + 2, y + h - 4, w - 4, 2, OUTLINE);
    rect(ctx, centred(4), y + h - 2, 4, 2, p.skinDark);
    rect(ctx, centred(4), y + h - 2, 4, 1, p.skin);
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

  /* Two pixels of eye, halfway down the face. Three tall and two wide with a
     white bar over them, on a head this size, is not a pair of eyes - it is a
     moustache, and that is what everybody in the game was wearing. */
  if (dir === 'down') {
    const eyeY = y + h - 4;
    rect(ctx, x + 1, eyeY, 2, 2, OUTLINE);
    rect(ctx, x + w - 3, eyeY, 2, 2, OUTLINE);
    rect(ctx, x + 1, eyeY, 1, 1, '#f4f4f8');
    rect(ctx, x + w - 3, eyeY, 1, 1, '#f4f4f8');
    return;
  }
  // Profile: one eye, and the nose breaking the line of the face.
  const eyeY = y + h - 4;
  rect(ctx, x + w - 4, eyeY, 2, 2, OUTLINE);
  rect(ctx, x + w - 4, eyeY, 1, 1, '#f4f4f8');
  rect(ctx, x + w, eyeY, 1, 2, OUTLINE);
  rect(ctx, x + w, eyeY, 1, 1, p.skin);
  if (hair.sides) rect(ctx, x, y + 2, 3, hair.sides, p.hair);
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

/**
 * Traces a hard keyline around whatever has been drawn.
 *
 * This is the single thing that most separates a Game Boy Advance overworld
 * sprite from a drawing that happens to be small: every character is ringed in
 * one near-black line, so a person reads as a person against grass, against
 * snow and against a stone floor without being redrawn for any of them. Doing
 * it from the silhouette rather than by hand means it is never missed on a
 * sleeve or the hem of a cloak.
 */
function keyline(ctx, w, h, colour) {
  const src = ctx.getImageData(0, 0, w, h);
  const solid = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < src.data.length; i += 4, p++) {
    solid[p] = src.data[i + 3] >= 128 ? 1 : 0;
  }
  ctx.fillStyle = colour;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid[y * w + x]) continue;
      const near = (x > 0 && solid[y * w + x - 1])
        || (x < w - 1 && solid[y * w + x + 1])
        || (y > 0 && solid[(y - 1) * w + x])
        || (y < h - 1 && solid[(y + 1) * w + x]);
      if (near) ctx.fillRect(x, y, 1, 1);
    }
  }
}

export function paintActorFrame(who, dir, step, combat = false) {
  const a = normalise(who);
  const m = BUILDS[a.build] ?? BUILDS.man;
  const outfit = OUTFITS[a.outfit] ?? OUTFITS.tunic;
  const hair = HAIR[a.hair] ?? HAIR.short;
  const p = a.palette;

  const { canvas, ctx } = makeCanvas(ACTOR_W, ACTOR_H);

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

  keyline(ctx, ACTOR_W, ACTOR_H, OUTLINE);

  // The contact shadow goes on last but underneath, so the keyline traces the
  // body and not the shadow it casts.
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = 'rgba(20,16,28,0.26)';
  ctx.fillRect(4, 30, 8, 2);
  ctx.fillRect(3, 31, 10, 1);
  ctx.globalCompositeOperation = 'source-over';

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
    palette: P('#6a4a2a', '#8a6438', '#dcae86', '#b4855e', '#a85a32', '#7a3e20', '#e0c088', '#4a4034', '#2f2820') },
  goodwife: { build: 'woman', outfit: 'gown', hair: 'bun',
    palette: P('#4a3a28', '#66503a', '#e0b48c', '#b88a62', '#4a6ea8', '#33507e', '#dfe3ea', '#4a4034', '#2f2820') },
  child: { build: 'child', outfit: 'tunic', hair: 'crop',
    palette: P('#c8a050', '#e0bc74', '#f0c8a0', '#c49a74', '#d8a838', '#a87c22', '#f4e0a8', '#5a4c3c', '#382e24') },
  girl: { build: 'child', outfit: 'gown', hair: 'long',
    palette: P('#6a4028', '#8a5a38', '#f0c8a0', '#c49a74', '#a06a80', '#744a5c', '#e0c0c8', '#5a4c3c', '#382e24') },
  oldman: { build: 'man', outfit: 'robe', hair: 'bald',
    palette: P('#d0d0c8', '#eaeae2', '#d4ae8c', '#a88266', '#6a6258', '#4a443c', '#9a9084', '#4a4438', '#2e2a22') },
  merchant: { build: 'man', outfit: 'cloak', hair: 'short',
    palette: P('#4a3a2a', '#665040', '#dcae86', '#b4855e', '#3f9a68', '#2b7048', '#e8d070', '#38443c', '#242c26') },

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
    palette: P('#3a2c20', '#554134', '#e0b48c', '#b88a62', '#6a4ea8', '#4a3478', '#e0c880', '#3a3050', '#221c30') },
  whitewalker: { build: 'man', outfit: 'robe', hair: 'hood',
    palette: { ...P('#cfe8f4', '#ffffff', '#b8d8e8', '#8ab4cc', '#3a4a5c', '#26323f', '#9fd8f0', '#2c3844', '#1c242c'),
      eyeGlow: '#4fd8ff' } },
};

export const BUILD_NAMES = Object.keys(BUILDS);
export const OUTFIT_NAMES = Object.keys(OUTFITS);
export const HAIR_NAMES = Object.keys(HAIR);
