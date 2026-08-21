// A hand-authored 5x7 proportional bitmap font. Each glyph is seven groups of
// five columns; '#' is an inked pixel. Leading/trailing empty columns are
// trimmed at compile time, which is what makes the font proportional rather
// than the blocky monospace a naive 5x7 grid would give.

const GLYPHS = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .###.',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# ##..# #.#.# #..## #...# #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# ##.## #...#',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',

  a: '..... ..... .###. ....# .#### #...# .####',
  b: '#.... #.... ####. #...# #...# #...# ####.',
  c: '..... ..... .###. #.... #.... #...# .###.',
  d: '....# ....# .#### #...# #...# #...# .####',
  e: '..... ..... .###. #...# ##### #.... .###.',
  f: '..##. .#..# .#... ###.. .#... .#... .#...',
  // Descenders are eight rows rather than seven; the compiler takes any row
  // count, and the extra row drops below the baseline where a tail belongs.
  g: '..... ..... .#### #...# #...# .#### ....# ####.',
  h: '#.... #.... ####. #...# #...# #...# #...#',
  i: '..#.. ..... .##.. ..#.. ..#.. ..#.. .###.',
  j: '..... ...#. ..... ...#. ...#. ...#. #..#. .##..',
  k: '#.... #.... #..#. #.#.. ##... #.#.. #..#.',
  l: '.##.. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  m: '..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#',
  n: '..... ..... ####. #...# #...# #...# #...#',
  o: '..... ..... .###. #...# #...# #...# .###.',
  p: '..... ..... ####. #...# #...# ####. #.... #....',
  q: '..... ..... .#### #...# #...# .#### ....# ....#',
  r: '..... ..... #.##. ##..# #.... #.... #....',
  s: '..... ..... .#### #.... .###. ....# ####.',
  t: '.#... .#... ####. .#... .#... .#..# ..##.',
  u: '..... ..... #...# #...# #...# #..## .##.#',
  v: '..... ..... #...# #...# #...# .#.#. ..#..',
  w: '..... ..... #...# #...# #.#.# #.#.# .#.#.',
  x: '..... ..... #...# .#.#. ..#.. .#.#. #...#',
  y: '..... ..... #...# #...# #...# .#### ....# .###.',
  z: '..... ..... ##### ...#. ..#.. .#... #####',

  0: '.###. #...# #..## #.#.# ##..# #...# .###.',
  1: '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  2: '.###. #...# ....# ..##. .#... #.... #####',
  3: '####. ....# ....# .###. ....# ....# ####.',
  4: '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  5: '##### #.... ####. ....# ....# #...# .###.',
  6: '..##. .#... #.... ####. #...# #...# .###.',
  7: '##### ....# ...#. ..#.. .#... .#... .#...',
  8: '.###. #...# #...# .###. #...# #...# .###.',
  9: '.###. #...# #...# .#### ....# ...#. .##..',

  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '?': '.###. #...# ....# ..##. ..#.. ..... ..#..',
  '.': '..... ..... ..... ..... ..... ..... ..#..',
  ',': '..... ..... ..... ..... ..... ..#.. .#...',
  "'": '..#.. ..#.. ..... ..... ..... ..... .....',
  '"': '.#.#. .#.#. ..... ..... ..... ..... .....',
  '-': '..... ..... ..... .###. ..... ..... .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  '/': '....# ...#. ..#.. ..#.. .#... #.... .....',
  ':': '..... ..#.. ..... ..... ..#.. ..... .....',
  ';': '..... ..#.. ..... ..... ..#.. ..#.. .#...',
  '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
  ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
  '[': '.###. .#... .#... .#... .#... .#... .###.',
  ']': '.###. ...#. ...#. ...#. ...#. ...#. .###.',
  '<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
  '>': '.#... ..#.. ...#. ....# ...#. ..#.. .#...',
  '=': '..... ..... ##### ..... ##### ..... .....',
  '*': '..... #.#.# .###. ##### .###. #.#.# .....',
  '%': '#...# #..#. ...#. ..#.. .#... .#..# #...#',
  '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#',
  '$': '..#.. .#### #.#.. .###. ..#.# ####. ..#..',
  '~': '..... ..... .#..# #.##. ..... ..... .....',
  '_': '..... ..... ..... ..... ..... ..... #####',
  '^': '..#.. .#.#. #...# ..... ..... ..... .....',
  // Typography the writing actually uses. Without these the font quietly draws
  // a space where a curly quote or a dash should be, and a name comes out with
  // a hole in the middle of it.
  '\u2018': '..##. .##.. ..... ..... ..... ..... .....',
  '\u2019': '.##.. ..##. ..... ..... ..... ..... .....',
  '\u201C': '##.## ##.## ..... ..... ..... ..... .....',
  '\u201D': '##.## ##.## ..... ..... ..... ..... .....',
  '\u2013': '..... ..... ..... .###. ..... ..... .....',
  '\u2014': '..... ..... ..... ##### ..... ..... .....',
  '\u2026': '..... ..... ..... ..... ..... ..... #.#.#',

  // Interface glyphs: cursor, "more text" arrow, star, heart, level marker.
  '▸': '#.... ##... ###.. ####. ###.. ##... #....',
  '▾': '..... ..... ##### .###. ..#.. ..... .....',
  '★': '..#.. ..#.. ##### .###. .#.#. #...# .....',
  '♥': '.#.#. ##### ##### ##### .###. ..#.. .....',
  '×': '..... ..... #...# .#.#. ..#.. .#.#. #...#',
};

/**
 * Typographic characters that have no glyph of their own. Text written with a
 * curly apostrophe or an em dash would otherwise render as a row of '?', which
 * is a hard mistake to spot in a data file and an obvious one on screen.
 */
const ALIASES = [
  [/[\u2018\u2019\u02bc]/g, "'"],
  [/[\u201c\u201d]/g, '"'],
  [/[\u2013\u2014]/g, '-'],
  [/\u2026/g, '...'],
  [/\u00a0/g, ' '],
];

/** Rewrites a string into characters the font actually has. */
export function normaliseText(text) {
  let out = String(text);
  for (const [pattern, replacement] of ALIASES) out = out.replace(pattern, replacement);
  return out;
}

export const GLYPH_HEIGHT = 7;
export const LINE_HEIGHT = 12;
const SPACE_ADVANCE = 3;

/** char -> { rows: number[] bitmask, width, advance } */
const compiled = new Map();

for (const [char, art] of Object.entries(GLYPHS)) {
  const lines = art.split(' ');
  let minCol = 5;
  let maxCol = -1;
  for (const line of lines) {
    for (let x = 0; x < 5; x++) {
      if (line[x] === '#') {
        if (x < minCol) minCol = x;
        if (x > maxCol) maxCol = x;
      }
    }
  }
  if (maxCol < 0) {
    compiled.set(char, { rows: [], width: 0, advance: SPACE_ADVANCE });
    continue;
  }
  const width = maxCol - minCol + 1;
  const rows = lines.map((line) => {
    let mask = 0;
    for (let x = minCol; x <= maxCol; x++) {
      if (line[x] === '#') mask |= 1 << (x - minCol);
    }
    return mask;
  });
  compiled.set(char, { rows, width, advance: width + 1 });
}

compiled.set(' ', { rows: [], width: 0, advance: SPACE_ADVANCE });

export function charWidth(char) {
  return (compiled.get(char) ?? compiled.get(' ')).advance;
}

export function measure(text) {
  let widest = 0;
  let line = 0;
  for (const char of normaliseText(text)) {
    if (char === '\n') {
      widest = Math.max(widest, line);
      line = 0;
      continue;
    }
    line += charWidth(char);
  }
  return Math.max(widest, line) - 1;
}

/**
 * Draws text. `shadow` paints a one-pixel offset copy first, the way the GBA
 * games do, which is what keeps light text readable over any background.
 */
export function drawText(ctx, text, x, y, {
  color = '#f8f8f8',
  shadow = '#585868',
  maxChars = Infinity,
} = {}) {
  let cursorX = x;
  let cursorY = y;
  let drawn = 0;

  for (const char of normaliseText(text)) {
    if (drawn >= maxChars) break;
    if (char === '\n') {
      cursorX = x;
      cursorY += LINE_HEIGHT;
      drawn++;
      continue;
    }
    const glyph = compiled.get(char) ?? compiled.get('?');
    if (glyph.width) {
      if (shadow) paintGlyph(ctx, glyph, cursorX + 1, cursorY + 1, shadow);
      paintGlyph(ctx, glyph, cursorX, cursorY, color);
    }
    cursorX += glyph.advance;
    drawn++;
  }
  return cursorX;
}

function paintGlyph(ctx, glyph, x, y, color) {
  ctx.fillStyle = color;
  for (let row = 0; row < glyph.rows.length; row++) {
    const mask = glyph.rows[row];
    if (!mask) continue;
    for (let col = 0; col < glyph.width; col++) {
      if (mask & (1 << col)) ctx.fillRect(x + col, y + row, 1, 1);
    }
  }
}

/**
 * Shortens a string until it fits a pixel width, ending it in a full stop so
 * the truncation reads as deliberate. Long names in a fixed HUD would otherwise
 * run into whatever is drawn beside them.
 */
export function fitText(text, maxWidth) {
  const clean = normaliseText(text);
  if (measure(clean) <= maxWidth) return clean;
  let cut = clean;
  while (cut.length > 1 && measure(`${cut}.`) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}.`;
}

/** Greedy word wrap to a pixel width, returning an array of lines. */
export function wrapText(text, maxWidth) {
  const lines = [];
  for (const paragraph of normaliseText(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}
