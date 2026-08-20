// Window frames.
//
// The look follows the project's reference art: a navy message box inside a
// gold double border, a bone-white command box in the same border, and cream
// status plates outlined in dark green with a tab pointing back at whoever they
// describe. Everything in the UI is built from these.

export const THEMES = {
  // The message box: deep blue paper, gold frame, white text.
  parchment: {
    outline: '#2a2118',
    frame: '#c8a24a',
    frameDark: '#8a6a28',
    inner: '#16233d',
    fill: '#23406b',
    fillShade: '#1c3459',
    text: '#f4f6ff',
    textShadow: '#14203a',
    accent: '#e8c878',
  },
  // The command box: bone white in the same gold frame.
  command: {
    outline: '#2a2118',
    frame: '#c8a24a',
    frameDark: '#8a6a28',
    inner: '#b8b4a4',
    fill: '#eceade',
    fillShade: '#dcd9c8',
    text: '#33302a',
    textShadow: '#b4b0a0',
    accent: '#8a6a28',
  },
  // Battle status plates: cream, outlined dark green.
  bone: {
    outline: '#2b3f2c',
    frame: '#4a6b45',
    frameDark: '#33502f',
    inner: '#c9c6a4',
    fill: '#eae7c4',
    fillShade: '#d8d5ae',
    text: '#33352c',
    textShadow: '#b3b191',
    accent: '#4a6b45',
  },
  // Deep blue system menus, matching the message box.
  night: {
    outline: '#2a2118',
    frame: '#c8a24a',
    frameDark: '#8a6a28',
    inner: '#16233d',
    fill: '#23406b',
    fillShade: '#1c3459',
    text: '#f4f6ff',
    textShadow: '#14203a',
    accent: '#e8c878',
  },
  // The big story beats.
  royal: {
    outline: '#26121c',
    frame: '#e0bc60',
    frameDark: '#96712a',
    inner: '#3f1218',
    fill: '#73242c',
    fillShade: '#631d25',
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
  for (let i = 0; i < radius; i++) {
    const inset = radius - i - 1;
    ctx.fillRect(x + inset, y + i, radius - inset, 1);
    ctx.fillRect(x + w - radius, y + i, radius - inset, 1);
    ctx.fillRect(x + inset, y + h - 1 - i, radius - inset, 1);
    ctx.fillRect(x + w - radius, y + h - 1 - i, radius - inset, 1);
  }
}

/**
 * The standard window: dark keyline, gold band, a darker gold shadow along the
 * inside of it, then a thin dark line and the fill. The doubled gold edge is
 * what gives the frame its weight.
 */
export function drawPanel(ctx, x, y, w, h, themeName = 'parchment') {
  const t = THEMES[themeName] ?? THEMES.parchment;

  pixelRect(ctx, x, y, w, h, 3, t.outline);
  pixelRect(ctx, x + 1, y + 1, w - 2, h - 2, 2, t.frame);

  // Inner shadow on the gold, so the border reads as bevelled metal.
  ctx.fillStyle = t.frameDark;
  ctx.fillRect(x + 3, y + h - 4, w - 6, 1);
  ctx.fillRect(x + w - 4, y + 3, 1, h - 6);

  pixelRect(ctx, x + 3, y + 3, w - 6, h - 6, 1, t.outline);
  pixelRect(ctx, x + 4, y + 4, w - 8, h - 8, 1, t.fill);

  ctx.fillStyle = t.fillShade;
  ctx.fillRect(x + 4, y + h - 6, w - 8, 2);
  return t;
}

/** A compact tag with a single border — for small floating labels. */
export function drawTag(ctx, x, y, w, h, themeName = 'night') {
  const t = THEMES[themeName] ?? THEMES.night;
  pixelRect(ctx, x, y, w, h, 2, t.outline);
  pixelRect(ctx, x + 1, y + 1, w - 2, h - 2, 1, t.frame);
  pixelRect(ctx, x + 2, y + 2, w - 4, h - 4, 1, t.fill);
  return t;
}

/**
 * A battle status plate: a cream slab in a dark green outline with a tab that
 * points back toward the creature it belongs to.
 */
export function drawStatusBox(ctx, x, y, w, h, { notchLeft = false } = {}) {
  const t = THEMES.bone;

  // The tail first, so the plate's own border draws over where it joins.
  const tailW = 9;
  const tailY = y + h - 11;
  if (notchLeft) {
    ctx.fillStyle = t.outline;
    ctx.fillRect(x - tailW, tailY, tailW + 4, 7);
    ctx.fillStyle = t.fill;
    ctx.fillRect(x - tailW + 1, tailY + 1, tailW + 3, 5);
  } else {
    ctx.fillStyle = t.outline;
    ctx.fillRect(x + w - 4, tailY, tailW + 4, 7);
    ctx.fillStyle = t.fill;
    ctx.fillRect(x + w - 4, tailY + 1, tailW + 3, 5);
  }

  pixelRect(ctx, x, y, w, h, 3, t.outline);
  pixelRect(ctx, x + 1, y + 1, w - 2, h - 2, 2, t.frame);
  pixelRect(ctx, x + 2, y + 2, w - 4, h - 4, 2, t.fill);
  ctx.fillStyle = t.fillShade;
  ctx.fillRect(x + 3, y + h - 5, w - 6, 2);

  // Punch the plate's own border where the tail joins, so the two read as one
  // shape rather than a plate with a bar floating beside it.
  ctx.fillStyle = t.fill;
  ctx.fillRect(notchLeft ? x - 1 : x + w - 2, tailY + 1, 3, 5);
  return t;
}

/**
 * The HP gauge: a gold "HP" plate against a sunken track, with the fill
 * carrying a lighter run along its top edge.
 */
export function drawHpGauge(ctx, x, y, w, ratio) {
  const LABEL_W = 18;
  pixelRect(ctx, x, y - 1, LABEL_W, 9, 2, '#2b3f2c');

  ctx.fillStyle = '#f0c020';
  // H: two stems and a crossbar.
  ctx.fillRect(x + 2, y + 1, 2, 6);
  ctx.fillRect(x + 7, y + 1, 2, 6);
  ctx.fillRect(x + 4, y + 3, 3, 2);
  // P: a stem with a closed bowl.
  ctx.fillRect(x + 11, y + 1, 2, 6);
  ctx.fillRect(x + 13, y + 1, 3, 1);
  ctx.fillRect(x + 15, y + 2, 1, 2);
  ctx.fillRect(x + 13, y + 4, 3, 1);

  const trackX = x + LABEL_W + 2;
  const trackW = Math.max(4, w - (LABEL_W + 2));
  ctx.fillStyle = '#2b3f2c';
  ctx.fillRect(trackX - 1, y - 1, trackW + 2, 9);
  ctx.fillStyle = '#6d7a63';
  ctx.fillRect(trackX, y, trackW, 7);
  ctx.fillStyle = '#3a4a36';
  ctx.fillRect(trackX, y + 5, trackW, 2);

  const filled = Math.max(0, Math.min(trackW, Math.round(trackW * ratio)));
  if (filled > 0) {
    const c = HP_COLORS(ratio);
    ctx.fillStyle = c.dark;
    ctx.fillRect(trackX, y, filled, 7);
    ctx.fillStyle = c.light;
    ctx.fillRect(trackX, y + 1, filled, 3);
    ctx.fillStyle = c.shine;
    ctx.fillRect(trackX, y + 1, filled, 1);
  }
}

/** The experience gauge, with its own gold label, along the player's plate. */
export function drawExpGauge(ctx, x, y, w, ratio) {
  const LABEL_W = 20;
  ctx.fillStyle = '#2b3f2c';
  ctx.fillRect(x, y - 1, LABEL_W, 7);

  ctx.fillStyle = '#f0c020';
  // E
  ctx.fillRect(x + 2, y, 1, 5);
  ctx.fillRect(x + 3, y, 2, 1);
  ctx.fillRect(x + 3, y + 2, 2, 1);
  ctx.fillRect(x + 3, y + 4, 2, 1);
  // X
  ctx.fillRect(x + 7, y, 1, 1);
  ctx.fillRect(x + 10, y, 1, 1);
  ctx.fillRect(x + 8, y + 1, 1, 1);
  ctx.fillRect(x + 9, y + 1, 1, 1);
  ctx.fillRect(x + 8, y + 2, 2, 1);
  ctx.fillRect(x + 8, y + 3, 1, 1);
  ctx.fillRect(x + 9, y + 3, 1, 1);
  ctx.fillRect(x + 7, y + 4, 1, 1);
  ctx.fillRect(x + 10, y + 4, 1, 1);
  // P
  ctx.fillRect(x + 13, y, 1, 5);
  ctx.fillRect(x + 14, y, 2, 1);
  ctx.fillRect(x + 16, y + 1, 1, 1);
  ctx.fillRect(x + 14, y + 2, 2, 1);

  const trackX = x + LABEL_W + 2;
  const trackW = Math.max(4, w - (LABEL_W + 2));
  ctx.fillStyle = '#2b3f2c';
  ctx.fillRect(trackX - 1, y - 1, trackW + 2, 7);
  ctx.fillStyle = '#4c5a6a';
  ctx.fillRect(trackX, y, trackW, 5);
  const filled = Math.max(0, Math.min(trackW, Math.round(trackW * ratio)));
  if (filled > 0) {
    ctx.fillStyle = EXP_COLORS.dark;
    ctx.fillRect(trackX, y, filled, 5);
    ctx.fillStyle = EXP_COLORS.light;
    ctx.fillRect(trackX, y, filled, 2);
  }
}

/**
 * The wind (stamina) gauge for duels. Its label is drawn at five pixels tall
 * like the EXP one, because the font's seven-row glyphs will not fit the two
 * remaining rows of a duel plate without colliding with the bar below.
 */
export function drawWindGauge(ctx, x, y, w, ratio) {
  const LABEL_W = 21;
  ctx.fillStyle = '#2b3f2c';
  ctx.fillRect(x, y - 1, LABEL_W, 7);

  ctx.fillStyle = '#f0c020';
  // W
  ctx.fillRect(x + 2, y, 1, 5);
  ctx.fillRect(x + 6, y, 1, 5);
  ctx.fillRect(x + 4, y + 2, 1, 3);
  ctx.fillRect(x + 3, y + 4, 1, 1);
  ctx.fillRect(x + 5, y + 4, 1, 1);
  // I
  ctx.fillRect(x + 8, y, 1, 5);
  // N
  ctx.fillRect(x + 10, y, 1, 5);
  ctx.fillRect(x + 13, y, 1, 5);
  ctx.fillRect(x + 11, y + 1, 1, 2);
  ctx.fillRect(x + 12, y + 2, 1, 2);
  // D
  ctx.fillRect(x + 15, y, 1, 5);
  ctx.fillRect(x + 16, y, 2, 1);
  ctx.fillRect(x + 18, y + 1, 1, 3);
  ctx.fillRect(x + 16, y + 4, 2, 1);

  const trackX = x + LABEL_W + 2;
  const trackW = Math.max(4, w - (LABEL_W + 2));
  ctx.fillStyle = '#2b3f2c';
  ctx.fillRect(trackX - 1, y - 1, trackW + 2, 7);
  ctx.fillStyle = '#4c5a6a';
  ctx.fillRect(trackX, y, trackW, 5);
  const filled = Math.max(0, Math.min(trackW, Math.round(trackW * ratio)));
  if (filled > 0) {
    ctx.fillStyle = '#2f7fa8';
    ctx.fillRect(trackX, y, filled, 5);
    ctx.fillStyle = '#6fc0e0';
    ctx.fillRect(trackX, y, filled, 2);
  }
}

/** Generic bar, still used by the party and summary screens. */
export function drawBar(ctx, x, y, w, h, ratio, colors) {
  ctx.fillStyle = '#2a2c22';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#6d7a63';
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
  if (ratio > 0.5) return { light: '#78d858', dark: '#3a9838', shine: '#a8f078' };
  if (ratio > 0.2) return { light: '#f0c840', dark: '#b08018', shine: '#f8e888' };
  return { light: '#f07050', dark: '#a83028', shine: '#f8a888' };
};

export const EXP_COLORS = { light: '#7cc8f8', dark: '#3070c0' };
