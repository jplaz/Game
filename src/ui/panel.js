// Emerald-style window frames: a dark outer keyline, a bright inner bevel and a
// two-tone fill. Everything else in the UI is drawn on top of these.

export const THEMES = {
  // Standard dialogue / menu window.
  parchment: {
    outline: '#20222e',
    bevelLight: '#f4efe2',
    bevelDark: '#b6a98c',
    fill: '#e9e2cf',
    fillAlt: '#ded5bd',
    text: '#3a3327',
    textShadow: '#bdb39a',
  },
  // Battle HUD and the deep-blue system menus.
  night: {
    outline: '#101320',
    bevelLight: '#5f6f9e',
    bevelDark: '#232b46',
    fill: '#313a5c',
    fillAlt: '#293150',
    text: '#f2f4ff',
    textShadow: '#151a2c',
  },
  // Used for the "you won" / important beats.
  royal: {
    outline: '#1d1220',
    bevelLight: '#c8a24a',
    bevelDark: '#5e3f1c',
    fill: '#7a2b33',
    fillAlt: '#6a232b',
    text: '#ffeec8',
    textShadow: '#3a1218',
  },
};

export function drawPanel(ctx, x, y, w, h, themeName = 'parchment') {
  const t = THEMES[themeName] ?? THEMES.parchment;

  ctx.fillStyle = t.outline;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = t.bevelDark;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

  ctx.fillStyle = t.bevelLight;
  ctx.fillRect(x + 1, y + 1, w - 3, h - 3);

  ctx.fillStyle = t.fill;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

  // A subtle horizontal banding keeps large panels from looking flat.
  ctx.fillStyle = t.fillAlt;
  for (let row = y + 4; row < y + h - 2; row += 4) {
    ctx.fillRect(x + 2, row, w - 4, 1);
  }
  return t;
}

/** Rounds off the four corner pixels — used for floating labels. */
export function drawTag(ctx, x, y, w, h, themeName = 'night') {
  const t = drawPanel(ctx, x, y, w, h, themeName);
  ctx.fillStyle = t.outline;
  ctx.clearRect(x, y, 1, 1);
  ctx.clearRect(x + w - 1, y, 1, 1);
  ctx.clearRect(x, y + h - 1, 1, 1);
  ctx.clearRect(x + w - 1, y + h - 1, 1, 1);
  return t;
}

/** Standard HP/EXP style bar with an outline and a fill that changes colour. */
export function drawBar(ctx, x, y, w, h, ratio, colors) {
  ctx.fillStyle = '#2a2c3a';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#67707f';
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
  if (ratio > 0.5) return { light: '#78e07a', dark: '#37a05a' };
  if (ratio > 0.2) return { light: '#f7d353', dark: '#c08a1c' };
  return { light: '#f07070', dark: '#b02f38' };
};

export const EXP_COLORS = { light: '#63c7f0', dark: '#2a74b8' };
