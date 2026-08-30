// The ship you bought, seen from above.
//
// Four hulls, and they are meant to be told apart at a glance from the deck of
// somebody else's: a skiff is a splinter with one sail, a cog is a fat brown
// box, a longship is long and low with shields down the rail, and a war galley
// has three banks of oars and a bronze beak on the front of it. If they all
// looked the same there would be no reason to want a better one.
//
// Drawn thirty-two square rather than the forty-eight a creature gets, because
// object memory on the cartridge is thirty-two kilobytes shared between the
// player, the crowd and this, and a boat four times the area of the man
// standing in it is not worth four times the video memory.
//
// Two drawings each, bow-up and bow-left. The other two facings are those two
// flipped, which the hardware does for nothing, so a hull costs two kilobytes
// resident instead of four.

import { makeCanvas } from '../engine/sprites.js';

export const SHIP_SIZE = 32;

const HULLS = {
  skiff: {
    len: 19, beam: 7,
    deck: '#8a6a42', dark: '#3a2a18', trim: '#b9884c',
    sail: '#d8d2c0', sailDark: '#a8a294',
    shields: 0, beak: 0, mast: 1,
  },
  cog: {
    len: 24, beam: 13,
    deck: '#7a5a34', dark: '#33240f', trim: '#a87840',
    sail: '#e0d8c4', sailDark: '#b0a894',
    shields: 0, beak: 0, mast: 1, castle: 1,
  },
  longship: {
    len: 30, beam: 9,
    deck: '#6a4a28', dark: '#241a0e', trim: '#9a6b38',
    sail: '#8c2630', sailDark: '#5e161d',
    shields: 1, beak: 0, mast: 1,
  },
  galley: {
    len: 30, beam: 12,
    deck: '#6a5c4c', dark: '#2a231b', trim: '#a89880',
    sail: '#c8a24a', sailDark: '#8a6a2a',
    shields: 1, beak: 1, mast: 1, castle: 1,
  },
};

const rect = (ctx, x, y, w, h, c) => {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/* How wide she is, as a fraction of the beam, at a fraction `t` of the way
   from the stem to the transom.
 *
 * The first draft listed six numbers for a bow and four for a stern and left
 * the whole middle at full beam. Both ends came out blunt, the widest row of
 * the bow was already four pixels across, and the stern went back OUT at the
 * last row - so all four hulls rendered as brown lozenges with a white stripe
 * on them. From above, the one thing that says boat is a long fine entry
 * running back to a beam well aft of the middle, and then a narrow transom. */
const ENTRY = 0.28;              /* the run of the bow */
const SHOULDER = 0.66;           /* where she starts to draw in again */
function profile(t) {
  /* Straight sides to the entry, so the bow is a wedge. Curving it - u squared
     or worse - keeps her two pixels wide for the first five or six rows, and a
     two-pixel dark stalk on the front of a boat is a chimney. */
  if (t < ENTRY) return t / ENTRY;
  if (t < SHOULDER) return 1;
  const u = (t - SHOULDER) / (1 - SHOULDER);
  return 1 - 0.5 * u * u;                    /* to a transom of half the beam */
}

/** The hull, bow up, drawn about the middle of a thirty-two square. */
function drawUp(ctx, h) {
  const mid = SHIP_SIZE / 2;
  const top = Math.round((SHIP_SIZE - h.len) / 2);
  /* Two pixels at the stem, never one. A one-pixel bow run out over six rows
     of a fine entry is not a bow, it is an aerial: the first cut of this drew
     a wire sticking out of the front of all four hulls. */
  const wAt = (i) => Math.max(2,
    Math.round(profile(h.len < 2 ? 0 : i / (h.len - 1)) * h.beam));
  const leftAt = (i) => mid - (wAt(i) >> 1);

  /* No oars. Two drafts of this had them, four and six a side, and at thirty-
     two pixels a rank of matched spines either side of a brown body is a
     centipede however carefully they are spaced. What a galley has that a cog
     does not is length, a bronze beak and men on the rail, and those three
     say it without turning the thing into an insect. */

  // The planking: a dark keyline the width of each row, deck inside where
  // there is room for one. Up at the stem there is not, so the bow is a spike.
  for (let i = 0; i < h.len; i++) {
    const y = top + i, w = wAt(i), x = leftAt(i);
    const bronze = h.beak && i < 5;          // the ram is the first of the hull
    rect(ctx, x, y, w, 1, bronze ? '#8a6a2a' : h.dark);
    if (w >= 4) rect(ctx, x + 1, y, w - 2, 1, bronze ? '#c8a24a' : h.deck);
  }
  // The rail: one lighter plank inside the keyline down the length of her.
  for (let i = 3; i < h.len - 1; i++) {
    const w = wAt(i), x = leftAt(i);
    if (w < 5) continue;
    rect(ctx, x + 1, top + i, 1, 1, h.trim);
    rect(ctx, x + w - 2, top + i, 1, 1, h.trim);
  }
  // Thwarts. Four benches across her, which is the whole of what stops a hull
  // seen from above from reading as a filled rectangle.
  const sailRow = Math.round(h.len * 0.38);
  for (let i = Math.round(h.len * 0.26); i < h.len - 5; i += 4) {
    const w = wAt(i), x = leftAt(i);
    if (w < 6 || (i >= sailRow - 2 && i <= sailRow + 5)) continue;
    rect(ctx, x + 2, top + i, w - 4, 1, h.dark);
  }

  if (h.castle) {
    // Raised at the stern, where whoever is shouting stands.
    const i = h.len - 6, w = wAt(i), x = leftAt(i);
    rect(ctx, x + 1, top + i, w - 2, 5, h.dark);
    rect(ctx, x + 2, top + i + 1, w - 4, 3, h.trim);
  }
  if (h.shields) {
    /* Shields hung outboard on the rail, one at a time with daylight between
       them, so they break the line of the hull rather than painting a stripe
       along it. Two pixels each: any smaller and they are noise. */
    for (let i = Math.round(h.len * 0.36); i < h.len - 7; i += 4) {
      const w = wAt(i), x = leftAt(i);
      if (w < 6) continue;
      rect(ctx, x - 1, top + i, 1, 2, h.sail);
      rect(ctx, x + w, top + i, 1, 2, h.sailDark);
    }
  }
  if (h.mast) {
    /* The yard across, the sail bellied out under it, and one pixel of mast
       below. From straight above that is most of what you see of a ship under
       way - but it has to leave deck showing either side of it, or the canvas
       becomes the boat. */
    const w = wAt(sailRow);
    const sw = Math.max(3, Math.round(w * 0.6));
    const sx = mid - (sw >> 1), sy = top + sailRow;
    rect(ctx, sx - 1, sy - 1, sw + 2, 1, h.dark);          // the yard
    rect(ctx, sx, sy, sw, 4, h.sail);                      // the canvas
    rect(ctx, sx, sy + 3, sw, 1, h.sailDark);
    /* One pixel of mast, and only below the sail. Two pixels of it drawn over
       the canvas split every sail in the game into a matching pair of white
       rectangles, which from a tile away is a pair of eyes. */
    rect(ctx, mid, sy + 4, 1, 3, h.dark);
  }
}

const cache = new Map();

/**
 * One hull, one facing. `way` is 'up' or 'left'; down and right are those two
 * flipped and the cartridge's hardware does that for nothing.
 */
export function shipSprite(id, way = 'up') {
  const key = `${id}:${way}`;
  const had = cache.get(key);
  if (had) return had;
  const h = HULLS[id] ?? HULLS.skiff;
  const { canvas, ctx } = makeCanvas(SHIP_SIZE, SHIP_SIZE);
  ctx.save();
  if (way === 'left') {
    /* Turned a quarter, about the middle. Drawing the same boat twice by hand
       is two chances to draw it differently. */
    ctx.translate(SHIP_SIZE / 2, SHIP_SIZE / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.translate(-SHIP_SIZE / 2, -SHIP_SIZE / 2);
  }
  ctx.imageSmoothingEnabled = false;
  drawUp(ctx, h);
  ctx.restore();
  cache.set(key, canvas);
  return canvas;
}

export const SHIP_IDS = Object.keys(HULLS);
