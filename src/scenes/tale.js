// The last act, told rather than walked.
//
// Five sequences fire at fixed points once you hold nine sigils, and they are
// what turn the tenth seat from a room with a woman in it into the end of a
// story. They have been on the cartridge since they were written and were
// never once shown here: this build climbed the whole ladder, beat the queen,
// and sat down without a word of it.
//
// A page is a sky, an emblem in silhouette, a heading and a body — the same
// four things the cartridge paints, in the same order, so the two builds tell
// the story the same way.

import { drawText, measure, LINE_HEIGHT } from '../engine/font.js';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { TRACKS } from '../data/music.js';
import { TALES, TALE_HOUSES } from '../data/tale.js';
import { game } from '../game/state.js';

const SCREEN_W = 240;
const SCREEN_H = 160;

/* The six skies, four bands apiece, darkest at the top. The cartridge paints
   these as flat courses on the background layer; flat is the point. */
const SKIES = [
  ['#5a8fd0', '#7fb0e2', '#a9cdee', '#cfe4f6'],   // 0 open day
  ['#6d7f96', '#93a5b8', '#bccbd8', '#e2ebf2'],   // 1 snow
  ['#3a3550', '#584a6a', '#7c6580', '#a58092'],   // 2 forest dusk
  ['#4a6a78', '#6d8f96', '#96b2b0', '#c2d4cb'],   // 3 river haze
  ['#2a1a1e', '#4a2420', '#6e3626', '#96502c'],   // 4 dragonstone smoke
  ['#241d28', '#33293a', '#42364a', '#4f4157'],   // 5 indoors
];

/* And the emblems, drawn as blocks rather than as art: at this size a crown is
   five rectangles and a raven is three, and anything more careful reads as
   noise on a hundred and sixty rows. */
const MARKS = [
  null,
  /* the throne */ (ctx, x, y, ink) => {
    ctx.fillStyle = ink;
    ctx.fillRect(x - 9, y + 4, 18, 3);
    ctx.fillRect(x - 7, y - 8, 3, 13);
    ctx.fillRect(x + 4, y - 8, 3, 13);
    ctx.fillRect(x - 3, y - 12, 2, 17);
    ctx.fillRect(x + 1, y - 10, 2, 15);
  },
  /* a raven */ (ctx, x, y, ink) => {
    ctx.fillStyle = ink;
    ctx.fillRect(x - 3, y - 4, 7, 5);
    ctx.fillRect(x - 10, y - 2, 8, 2);
    ctx.fillRect(x + 4, y - 2, 8, 2);
    ctx.fillRect(x + 3, y - 6, 3, 2);
    ctx.fillRect(x - 1, y + 1, 3, 5);
  },
  /* a crown */ (ctx, x, y, ink) => {
    ctx.fillStyle = ink;
    ctx.fillRect(x - 10, y + 2, 20, 4);
    ctx.fillRect(x - 10, y - 6, 3, 8);
    ctx.fillRect(x - 2, y - 9, 3, 11);
    ctx.fillRect(x + 7, y - 6, 3, 8);
  },
  /* the Wall */ (ctx, x, y, ink) => {
    ctx.fillStyle = ink;
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 12 + i * 7, y - 8, 5, 14);
    ctx.fillRect(x - 13, y + 6, 27, 2);
  },
  /* fire */ (ctx, x, y, ink) => {
    ctx.fillStyle = ink;
    ctx.fillRect(x - 2, y - 10, 4, 8);
    ctx.fillRect(x - 5, y - 4, 10, 6);
    ctx.fillRect(x - 7, y + 2, 14, 4);
  },
];

/** Folds a body into lines that fit the page. */
function wrap(text, width) {
  const out = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) > width && line) { out.push(line); line = word; }
    else line = next;
  }
  if (line) out.push(line);
  return out;
}

export class Tale {
  /**
   * @param {string} id     which of the five
   * @param {Function} then what to do when the last page turns over
   */
  constructor(id, then = null) {
    this.tale = TALES[id];
    this.id = id;
    this.then = then;
    this.page = 0;
    this.time = 0;
  }

  enter() {
    audio.play('battleBoss', TRACKS);
  }

  get body() {
    const page = this.tale.pages[this.page];
    /* The pages that must not read the same for a Stark as for a Greyjoy. */
    if (!page.byHouse) return page.body;
    const at = TALE_HOUSES.indexOf(game.state.player.house);
    return `${page.body} ${page.byHouse[at < 0 ? 0 : at]}`;
  }

  update(dt) {
    this.time += dt;
    if (this.manager.busy) return;
    if (!input.pressed('a') && !input.pressed('start')) return;
    audio.sfx('cursor');
    if (this.page + 1 < this.tale.pages.length) { this.page++; return; }
    const then = this.then;
    this.manager.pop();
    then?.();
  }

  draw(ctx) {
    const page = this.tale.pages[this.page];
    const sky = SKIES[page.sky] ?? SKIES[5];
    const band = Math.ceil(SCREEN_H / sky.length);
    for (let i = 0; i < sky.length; i++) {
      ctx.fillStyle = sky[i];
      ctx.fillRect(0, i * band, SCREEN_W, band);
    }

    /* The emblem sits in the upper third, in silhouette, with the page's
       heading under it and the body under that. */
    const mark = MARKS[page.mark];
    if (mark) mark(ctx, SCREEN_W / 2, 30, 'rgba(16,12,20,0.72)');

    const title = (this.tale.pages[this.page].title ?? '').toUpperCase();
    drawText(ctx, title, (SCREEN_W - measure(title)) / 2, 48, { color: '#f6efe0' });

    /* A plate under the words, because a body typed straight onto a sky is
       unreadable on half of them. */
    const lines = wrap(this.body, SCREEN_W - 32);
    const top = 62;
    ctx.fillStyle = 'rgba(16,12,20,0.62)';
    ctx.fillRect(10, top - 6, SCREEN_W - 20, lines.length * LINE_HEIGHT + 12);
    lines.forEach((line, i) => {
      drawText(ctx, line, 16, top + i * LINE_HEIGHT, { color: '#efe6d4' });
    });

    const last = this.page + 1 >= this.tale.pages.length;
    const hint = last ? 'A' : `${this.page + 1}/${this.tale.pages.length}`;
    if (Math.floor(this.time * 2) % 2 === 0) {
      drawText(ctx, hint, SCREEN_W - 14 - measure(hint), SCREEN_H - 12, { color: '#f6efe0' });
    }
  }
}
