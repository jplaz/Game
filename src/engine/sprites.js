// All artwork in this game is authored as strings of palette keys and compiled
// into offscreen canvases at load time. Nothing is fetched over the network, so
// the whole game is a handful of text files.

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/**
 * Compiles rows of palette keys into a canvas.
 * '.' and ' ' are transparent; every other character is looked up in `palette`.
 * With `mirror`, rows describe the left half of a symmetric sprite and the
 * right half is generated — which is how the creature templates stay compact.
 */
export function paintPixels(rows, palette, { scale = 1, mirror = false } = {}) {
  const halfWidth = Math.max(...rows.map((r) => r.length));
  const width = mirror ? halfWidth * 2 : halfWidth;
  const { canvas, ctx } = makeCanvas(width * scale, rows.length * scale);

  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < halfWidth; x++) {
      const key = rows[y][x] ?? '.';
      const color = palette[key];
      if (!color || key === '.' || key === ' ') continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
      if (mirror) ctx.fillRect((width - 1 - x) * scale, y * scale, scale, scale);
    }
  }
  return canvas;
}

/** Flips a canvas horizontally — used for the left/right walk frames. */
export function flipH(source) {
  const { canvas, ctx } = makeCanvas(source.width, source.height);
  ctx.translate(source.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/** Produces a flat silhouette of a sprite, for battle intro/faint effects. */
export function silhouette(source, color = '#12131c') {
  const { canvas, ctx } = makeCanvas(source.width, source.height);
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Lightens/darkens a #rrggbb string. `amount` is -1..1. */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (channel) => {
    const value = amount >= 0
      ? channel + (255 - channel) * amount
      : channel * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(value)));
  };
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Memoises expensive canvas builds by string key. */
export function cached(store, key, build) {
  let hit = store.get(key);
  if (!hit) {
    hit = build();
    store.set(key, hit);
  }
  return hit;
}
