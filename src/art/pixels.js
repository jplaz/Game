// Pixel art authored as text.
//
// The rest of the art in this project was drawn by code — fill a rectangle,
// scatter some noise, hope it reads as grass. It does not. Random per-pixel
// speckle looks like television static, rectangles have no light in them, and
// nothing generated that way has the deliberate placement that makes pixel art
// read at sixteen pixels square.
//
// So tiles and sprites are written out here instead, one character per pixel,
// the same way the font already is. A row of text is a row of pixels, and the
// key says what colour each character means. It is more typing and it is the
// only thing that actually looks hand-drawn.
//
//   art([
//     'ggggllll',
//     'ggglllll',
//   ], { g: '#68a048', l: '#7cb45c' })
//
// '.' and ' ' are transparent, always.

import { makeCanvas } from '../engine/sprites.js';

const TRANSPARENT = new Set(['.', ' ']);

/**
 * Paints text art onto a context at an offset. Characters with no entry in the
 * key are skipped, so a single drawing can be painted in passes — colour in one
 * key, shadow in another — without rewriting the rows.
 */
export function paintArt(ctx, rows, key, offsetX = 0, offsetY = 0) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const char = row[x];
      if (TRANSPARENT.has(char)) continue;
      const color = key[char];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(offsetX + x, offsetY + y, 1, 1);
    }
  }
}

/** Text art compiled to its own canvas, sized to the rows. */
export function art(rows, key) {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const { canvas, ctx } = makeCanvas(width, height);
  paintArt(ctx, rows, key);
  return canvas;
}

/**
 * A stable choice from a list, keyed on a map position. Ground gets several
 * hand-drawn variants and picks between them by where the tile is, which breaks
 * up repetition without the noise that caused it in the first place.
 */
export function variantFor(x, y, count) {
  if (count <= 1) return 0;
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) % count;
}

/**
 * The shadow every standing thing casts. Sprites that lack one look pasted onto
 * the map rather than standing on it, which was true of every actor here.
 */
export function drawContactShadow(ctx, centreX, baseY, width) {
  const half = Math.max(2, Math.round(width / 2));
  ctx.save();
  ctx.globalAlpha = 0.26;
  ctx.fillStyle = '#101018';
  ctx.fillRect(centreX - half, baseY - 1, half * 2, 2);
  ctx.fillRect(centreX - half + 1, baseY - 2, half * 2 - 2, 1);
  ctx.fillRect(centreX - half + 1, baseY + 1, half * 2 - 2, 1);
  ctx.restore();
}

/**
 * A filled ellipse made of whole pixels. The canvas `ellipse` path is
 * anti-aliased, which puts soft grey fringes on everything and is exactly the
 * thing this project is trying not to look like.
 */
export function pixelOval(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  for (let y = -ry; y <= ry; y++) {
    const span = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    if (span <= 0) continue;
    ctx.fillRect(Math.round(cx - span), Math.round(cy + y), span * 2, 1);
  }
}
