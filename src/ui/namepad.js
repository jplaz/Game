// The lettered keyboard, shared by the two places a name gets typed: the rider
// at the start of the game, and a hatchling when it comes out of its egg.

import { drawPanel } from './panel.js';
import { drawText } from '../engine/font.js';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';

export const LETTER_ROWS = [
  'ABCDEFGHI',
  'JKLMNOPQR',
  'STUVWXYZ ',
  'abcdefghi',
  'jklmnopqr',
  'stuvwxyz-',
];

export const MAX_NAME = 10;

/**
 * A name being typed. `update` returns the finished name once the player
 * presses start, and null until then.
 */
export class NamePad {
  constructor({ prompt, initial = '', fallback = '' } = {}) {
    this.prompt = prompt;
    this.name = initial;
    this.fallback = fallback;
    this.cursor = { row: 0, col: 0 };
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    const rows = LETTER_ROWS;

    if (input.repeat('up')) {
      this.cursor.row = (this.cursor.row - 1 + rows.length) % rows.length;
      audio.sfx('cursor');
    }
    if (input.repeat('down')) {
      this.cursor.row = (this.cursor.row + 1) % rows.length;
      audio.sfx('cursor');
    }
    if (input.repeat('left')) {
      this.cursor.col = (this.cursor.col - 1 + rows[0].length) % rows[0].length;
      audio.sfx('cursor');
    }
    if (input.repeat('right')) {
      this.cursor.col = (this.cursor.col + 1) % rows[0].length;
      audio.sfx('cursor');
    }

    if (input.pressed('a')) {
      const char = rows[this.cursor.row][this.cursor.col];
      if (this.name.length < MAX_NAME) {
        this.name += char;
        audio.sfx('cursor');
      }
    }
    if (input.pressed('b')) {
      this.name = this.name.slice(0, -1);
      audio.sfx('cancel');
    }
    if (input.pressed('start')) {
      audio.sfx('confirm');
      return this.name.trim() || this.fallback;
    }
    return null;
  }

  draw(ctx) {
    drawPanel(ctx, 12, 10, 216, 30, 'night');
    drawText(ctx, this.prompt, 20, 14, { color: '#f0dca0', shadow: '#151a2c' });
    const shown = this.name + (Math.floor(this.time * 3) % 2 ? '_' : '');
    drawText(ctx, shown || '_', 20, 26, { color: '#f2f4ff', shadow: '#151a2c' });

    const grid = { x: 34, y: 46, cell: 19 };
    drawPanel(ctx, grid.x - 10, grid.y - 8, LETTER_ROWS[0].length * grid.cell + 20,
      LETTER_ROWS.length * 15 + 16, 'night');

    LETTER_ROWS.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const x = grid.x + c * grid.cell;
        const y = grid.y + r * 15;
        const selected = this.cursor.row === r && this.cursor.col === c;
        if (selected) {
          ctx.fillStyle = '#f0dca0';
          ctx.fillRect(x - 4, y - 2, 15, 13);
        }
        drawText(ctx, row[c], x, y,
          selected ? { color: '#20222e', shadow: null } : { color: '#f2f4ff', shadow: '#151a2c' });
      }
    });

    drawText(ctx, 'Z: add   X: delete   ENTER: done', 30, 146,
      { color: '#98a0bc', shadow: '#0a0d16' });
  }
}
