// Title screen, new-game name entry and the continue slot.

import { drawPanel } from '../ui/panel.js';
import { drawText, measure, LINE_HEIGHT } from '../engine/font.js';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { TRACKS } from '../data/music.js';
import { creatureSprite, SPRITE_SIZE } from '../art/creatures.js';
import { species as getSpecies } from '../data/species.js';
import { newGame, setState, formatTime } from '../game/state.js';
import { hasSave, loadGame, saveSummary } from '../game/save.js';

const LETTER_ROWS = [
  'ABCDEFGHI',
  'JKLMNOPQR',
  'STUVWXYZ ',
  'abcdefghi',
  'jklmnopqr',
  'stuvwxyz-',
];
const MAX_NAME = 10;

export class Title {
  constructor() {
    this.view = 'title';
    this.index = 0;
    this.time = 0;
    this.name = '';
    this.cursor = { row: 0, col: 0 };
    this.options = [];
  }

  enter() {
    audio.play('title', TRACKS);
    this.refreshOptions();
  }

  refreshOptions() {
    this.summary = saveSummary();
    this.options = this.summary ? ['CONTINUE', 'NEW GAME'] : ['NEW GAME'];
    this.index = 0;
  }

  update(dt) {
    this.time += dt;
    if (this.view === 'title') this.updateTitle();
    else if (this.view === 'name') this.updateNameEntry();
  }

  updateTitle() {
    if (input.repeat('up')) {
      this.index = (this.index - 1 + this.options.length) % this.options.length;
      audio.sfx('cursor');
    }
    if (input.repeat('down')) {
      this.index = (this.index + 1) % this.options.length;
      audio.sfx('cursor');
    }
    if (!input.pressed('a')) return;

    audio.sfx('confirm');
    const choice = this.options[this.index];
    if (choice === 'CONTINUE') {
      if (loadGame()) {
        this.start();
      } else {
        this.refreshOptions();
      }
    } else {
      this.name = '';
      this.cursor = { row: 0, col: 0 };
      this.view = 'name';
    }
  }

  updateNameEntry() {
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
      const finalName = this.name.trim() || 'Snow';
      audio.sfx('confirm');
      setState(newGame(finalName));
      this.start();
    }
  }

  async start() {
    const { Overworld } = await import('./overworld.js');
    this.manager.transition(() => {
      this.manager.replace(new Overworld());
    });
  }

  // ---------------------------------------------------------------- draw --

  draw(ctx) {
    this.drawBackdrop(ctx);
    if (this.view === 'title') this.drawTitle(ctx);
    else this.drawNameEntry(ctx);
  }

  drawBackdrop(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, 160);
    sky.addColorStop(0, '#0d1220');
    sky.addColorStop(0.6, '#1c2438');
    sky.addColorStop(1, '#39304a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 240, 160);

    // Falling snow.
    ctx.fillStyle = 'rgba(230,240,255,0.7)';
    for (let i = 0; i < 46; i++) {
      const seed = i * 37.7;
      const x = (seed * 3.1 + this.time * (8 + (i % 5) * 4)) % 250 - 5;
      const y = (seed * 5.3 + this.time * (14 + (i % 7) * 6)) % 170 - 5;
      ctx.fillRect(Math.round(240 - x), Math.round(y), 1, 1);
    }

    // A silhouetted skyline of towers.
    ctx.fillStyle = '#0a0d16';
    ctx.fillRect(0, 128, 240, 32);
    const towers = [[10, 30], [34, 46], [60, 24], [88, 38], [150, 34], [186, 48], [214, 26]];
    for (const [x, h] of towers) {
      ctx.fillRect(x, 128 - h, 18, h);
      ctx.fillRect(x - 2, 128 - h, 22, 4);
    }
  }

  drawTitle(ctx) {
    // A dragon and a direwolf flanking the title.
    const wolf = creatureSprite(getSpecies('winterfang'));
    const dragon = creatureSprite(getSpecies('dreadwyrm'));
    const bob = Math.sin(this.time * 1.6) * 2;
    ctx.drawImage(wolf, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 8, 60 + bob, 56, 56);
    ctx.drawImage(dragon, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 176, 58 - bob, 56, 56);

    const title = 'A SONG OF';
    const title2 = 'ICE AND MONSTERS';
    drawText(ctx, title, 120 - measure(title) / 2, 22, { color: '#dfe8f6', shadow: '#0a0d16' });
    drawText(ctx, title2, 120 - measure(title2) / 2, 36, { color: '#f0dca0', shadow: '#5a1218' });

    const box = { x: 78, y: 62, w: 84, h: this.options.length * LINE_HEIGHT + 12 };
    const theme = drawPanel(ctx, box.x, box.y, box.w, box.h, 'night');
    this.options.forEach((label, i) => {
      const y = box.y + 6 + i * LINE_HEIGHT;
      if (i === this.index) {
        drawText(ctx, '▸', box.x + 7, y, { color: theme.text, shadow: theme.textShadow });
      }
      drawText(ctx, label, box.x + 18, y, { color: theme.text, shadow: theme.textShadow });
    });

    if (this.summary && this.options[this.index] === 'CONTINUE') {
      drawPanel(ctx, 62, 104, 116, 40, 'night');
      drawText(ctx, this.summary.name, 68, 108, { color: '#f0dca0', shadow: '#151a2c' });
      drawText(ctx, `Sigils ${this.summary.sigils}   Sworn ${this.summary.caught}`, 68, 120,
        { color: '#f2f4ff', shadow: '#151a2c' });
      drawText(ctx, `Time ${formatTime(this.summary.playtime)}`, 68, 132,
        { color: '#f2f4ff', shadow: '#151a2c' });
    } else if (Math.floor(this.time * 1.5) % 2 === 0) {
      const hint = 'Press Z';
      drawText(ctx, hint, 120 - measure(hint) / 2, 118, { color: '#98a0bc', shadow: '#0a0d16' });
    }
  }

  drawNameEntry(ctx) {
    drawPanel(ctx, 12, 10, 216, 30, 'night');
    drawText(ctx, 'What is your name, rider?', 20, 14, { color: '#f0dca0', shadow: '#151a2c' });
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
