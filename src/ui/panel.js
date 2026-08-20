// Emerald-style window frames.
//
// The GBA games build every window from 8x8 border tiles: a dark keyline, a
// coloured band, a bright inner highlight, then the fill. Corners are cut back
// by two pixels so the frame reads as rounded at 240x160. Everything in the UI
// is drawn on one of these.

export const THEMES = {
  // The standard dialogue / menu window: white paper in a blue frame.
  parchment: {
    outline: '#31314a',
    band: '#7b8fd0',
    bandDark: '#4d5da8',
    highlight: '#ffffff',
    fill: '#f8f8f8',
    fillShade: '#e4e8f4',
    text: '#3d3d47',
    textShadow: '#b8bcc8',
    accent: '#4d5da8',
  },
  // Battle HUD and status boxes: warm cream, as Emerald uses.
  bone: {
    outline: '#38383f',
    band: '#d8d0b0',
    bandDark: '#a89c78',
    highlight: '#fffff0',
    fill: '#f8f4e0',
    fillShade: '#e8e0c4',
    text: '#3d3a30',
    textShadow: '#bdb69a',
    accent: '#a89c78',
  },
  // Deep blue system menus.
  night: {
    outline: '#16182a',
    band: '#4a5a92',
    bandDark: '#26304f',
    highlight: '#8fa2d8',
    fill: '#2e3a63',
    fillShade: '#273154',
    text: '#f2f4ff',
    textShadow: '#161c30',
    accent: '#8fa2d8',
  },
  // Reserved for the big story beats.
  royal: {
    outline: '#26121c',
    band: '#a8823a',
    bandDark: '#6b4a1c',
    highlight: '#e8c878',
    fill: '#7a2b33',
    fillShade: '#68232b',
    text: '#ffeec8',
    textShadow: '#40161c',
    accent: '#e8c878',
  },
};

/** Fills a rect with its corner pixels stepped back, GBA-style. */
export function pixelRect(ctx, x, y, w, h, radius, color) {
  ctx.fillStyle = color;
  if (radius <= 0) {
    ctx.fillRect(x, y, w, h);
    return;
  }
  ctx.fillRect(x + radius, y, w - radius * 2, h);
  ctx.fillRect(x, y + radius, radius, h - radius * 2);
  ctx.fillRect(x + w - radius, y + radius, radius, h - radius * 2);
  // Step the corners in by one pixel per row rather than leaving them square.
  for (let i = 0; i < radius; i++) {
    const inset = radius - i - 1;
    ctx.fillRect(x + inset, y + i, radius - inset, 1);
    ctx.fillRect(x + w - radius, y + i, radius - inset, 1);
    ctx.fillRect(x + inset, y + h - 1 - i, radius - inset, 1);
    ctx.fillRect(x + w - radius, y + h - 1 - i, radius - inset, 1);
  }
}

/**
 * The standard window. Four concentric layers, the way the GBA frame tiles
 * stack: keyline, colour band, inner highlight, fill.
 */
export function drawPanel(ctx, x, y, w, h, themeName = 'parchment') {
  const t = THEMES[themeName] ?? THEMES.parchment;

  pixelRect(ctx, x, y, w, h, 3, t.outline);
  pixelRect(ctx, x + 1, y + 1, w - 2, h - 2, 2, t.band);
  pixelRect(ctx, x + 2, y + 2, w - 4, h - 4, 2, t.bandDark);
  pixelRect(ctx, x + 3, y + 3, w - 6, h - 6, 1, t.highlight);
  pixelRect(ctx, x + 4, y + 4, w - 8, h - 8, 1, t.fill);

  // A single soft shade along the bottom lifts the window off the background.
  ctx.fillStyle = t.fillShade;
  ctx.fillRect(x + 4, y + h - 6, w - 8, 2);

  return t;
}

/** A compact tag with no inner highlight — for small floating labels. */
export function drawTag(ctx, x, y, w, h, themeName = 'night') {
  const t = THEMES[themeName] ?? THEMES.night;
  pixelRect(ctx, x, y, w, h, 2, t.outline);
  pixelRect(ctx, x + 1, y + 1, w - 2, h - 2, 1, t.band);
  pixelRect(ctx, x + 2, y + 2, w - 4, h - 4, 1, t.fill);
  return t;
}

/**
 * Emerald's battle status box: a cream slab with a notched left edge, the
 * name and level along the top and the HP gauge beneath.
 */
export function drawStatusBox(ctx, x, y, w, h, { notchLeft = false } = {}) {
  const t = THEMES.bone;
  pixelRect(ctx, x, y, w, h, 3, t.outline);
  pixelRect(ctx, x + 1, y + 1, w - 2, h - 2, 2, t.highlight);
  pixelRect(ctx, x + 2, y + 2, w - 4, h - 4, 2, t.fill);
  ctx.fillStyle = t.fillShade;
  ctx.fillRect(x + 2, y + h - 5, w - 4, 2);

  // The angled tab that makes the boxes read as banners rather than rectangles.
  const tabW = 8;
  if (notchLeft) {
    ctx.fillStyle = t.outline;
    ctx.fillRect(x - tabW, y + h - 7, tabW, 3);
    ctx.fillStyle = t.fill;
    ctx.fillRect(x - tabW + 1, y + h - 6, tabW, 1);
  } else {
    ctx.fillStyle = t.outline;
    ctx.fillRect(x + w, y + h - 7, tabW, 3);
    ctx.fillStyle = t.fill;
    ctx.fillRect(x + w - 1, y + h - 6, tabW, 1);
  }
  return t;
}

/**
 * The HP gauge. Emerald puts "HP" in a small dark pill at the left of a sunken
 * track; the fill has a lighter run along its top edge.
 */
export function drawHpGauge(ctx, x, y, w, ratio) {
  // Label pill.
  ctx.fillStyle = '#38383f';
  pixelRect(ctx, x, y - 1, 15, 8, 2, '#38383f');
  ctx.fillStyle = '#f8d030';
  ctx.fillRect(x + 2, y + 1, 3, 4);
  ctx.fillRect(x + 2, y + 2, 5, 1);
  ctx.fillRect(x + 6, y + 1, 1, 4);
  ctx.fillRect(x + 9, y + 1, 1, 4);
  ctx.fillRect(x + 10, y + 1, 3, 1);
  ctx.fillRect(x + 12, y + 2, 1, 2);
  ctx.fillRect(x + 9, y + 3, 4, 1);

  // Sunken track.
  const trackX = x + 17;
  const trackW = w - 17;
  ctx.fillStyle = '#38383f';
  ctx.fillRect(trackX - 1, y - 1, trackW + 2, 8);
  ctx.fillStyle = '#606068';
  ctx.fillRect(trackX, y, trackW, 6);
  ctx.fillStyle = '#282830';
  ctx.fillRect(trackX, y + 4, trackW, 2);

  const filled = Math.max(0, Math.min(trackW, Math.round(trackW * ratio)));
  if (filled > 0) {
    const c = HP_COLORS(ratio);
    ctx.fillStyle = c.dark;
    ctx.fillRect(trackX, y, filled, 6);
    ctx.fillStyle = c.light;
    ctx.fillRect(trackX, y + 1, filled, 2);
  }
}

/** Thin blue experience gauge, drawn flush under the player's status box. */
export function drawExpGauge(ctx, x, y, w, ratio) {
  ctx.fillStyle = '#38383f';
  ctx.fillRect(x - 1, y - 1, w + 2, 5);
  ctx.fillStyle = '#606068';
  ctx.fillRect(x, y, w, 3);
  const filled = Math.max(0, Math.min(w, Math.round(w * ratio)));
  if (filled > 0) {
    ctx.fillStyle = EXP_COLORS.dark;
    ctx.fillRect(x, y, filled, 3);
    ctx.fillStyle = EXP_COLORS.light;
    ctx.fillRect(x, y, filled, 1);
  }
}

/** Generic bar, still used by the party and summary screens. */
export function drawBar(ctx, x, y, w, h, ratio, colors) {
  ctx.fillStyle = '#2a2c3a';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#606068';
  ctx.fillRect(x, y, w, h);
  const filled = Math.max(0, Math.min(w, Math.round(w * ratio)));
  if (filled > 0) {
    ctx.fillStyle = colors.dark;
    ctx.fillRect(x, y, filled, h);
    ctx.fillStyle = colors.light;
    ctx.fillRect(x, y, filled, Math.max(1, h - 2));
  }
}

export const HP_COLORS = (ratio) => {
  if (ratio > 0.5) return { light: '#70e058', dark: '#289830' };
  if (ratio > 0.2) return { light: '#f8d030', dark: '#c07818' };
  return { light: '#f86058', dark: '#a82028' };
};

export const EXP_COLORS = { light: '#68b8f8', dark: '#2868c0' };
