// The dialogue window. Its methods return promises so cutscenes can be written
// as plain async functions:
//
//   await dialog.say('Winter is coming.');
//   if (await dialog.choose('Take the sword?', ['Yes', 'No']) === 0) ...

import { drawPanel, THEMES } from './panel.js';
import { drawText, wrapText, measure, LINE_HEIGHT } from '../engine/font.js';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';

const BOX = { x: 4, y: 110, w: 232, h: 46 };
const TEXT_X = BOX.x + 9;
const TEXT_Y = BOX.y + 9;
const TEXT_WIDTH = BOX.w - 18;
const LINES_PER_PAGE = 2;
const CHARS_PER_SECOND = 52;

export class Textbox {
  constructor() {
    this.pages = [];
    this.pageIndex = 0;
    this.revealed = 0;
    this.resolve = null;
    this.visible = false;
    this.blink = 0;
    this.theme = 'parchment';
    this.choice = null;
    this.autoCloseAfter = 0;
    // A "standing" message stays on screen but does not swallow input, so a
    // menu can be open over it.
    this.standing = false;
  }

  get busy() {
    return this.visible && !this.standing;
  }

  /** Queues a message. Resolves once the player has read every page. */
  /**
   * Lets go of whoever is waiting on the box before it is taken away.
   *
   * The box hands out one promise and remembers one resolve. Putting a second
   * message up over a first that nobody has answered used to overwrite that
   * resolve and leave the first promise pending for ever - and a script is
   * `await say(...)`, so the script never returned, `overworld.script` was
   * never cleared, and the overworld stayed busy for the rest of the session.
   * The player could not take a step. Talking to the miller in the house at
   * Winterfell did it.
   *
   * Settling is the only recovery there is: a line that has been replaced has
   * been read as far as the player is concerned, and a question that has been
   * taken away is a question cancelled. Either is better than a game that
   * stops answering the keys.
   */
  settle() {
    const resolve = this.resolve;
    const choose = this.choiceResolve;
    const cancel = this.pendingChoice?.cancelIndex ?? -1;
    this.resolve = null;
    this.choiceResolve = null;
    resolve?.();
    choose?.(cancel);
  }

  say(text, { theme = 'parchment', auto = 0 } = {}) {
    this.settle();
    const lines = wrapText(String(text), TEXT_WIDTH);
    this.pages = [];
    for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
      this.pages.push(lines.slice(i, i + LINES_PER_PAGE));
    }
    if (!this.pages.length) this.pages = [['']];
    this.pageIndex = 0;
    this.revealed = 0;
    this.visible = true;
    this.standing = false;
    this.theme = theme;
    this.choice = null;
    this.autoCloseAfter = auto;
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  /**
   * Shows a message and then a menu. Resolves with the chosen index, or with
   * `cancelIndex` if the player backs out with B.
   */
  choose(text, options, { theme = 'parchment', cancelIndex = options.length - 1 } = {}) {
    // The message's own promise is discarded: reading the prompt is not the
    // completion event here, picking an option is.
    this.say(text, { theme });
    this.resolve = null;
    this.pendingChoice = { options, cancelIndex, index: 0 };
    return new Promise((resolve) => { this.choiceResolve = resolve; });
  }

  /**
   * Displays a line immediately and leaves it on screen, with no promise and no
   * "press A" prompt. Used for the standing "What will X do?" battle prompt.
   */
  show(text, { theme = 'parchment' } = {}) {
    const lines = wrapText(String(text), TEXT_WIDTH).slice(0, LINES_PER_PAGE);
    this.pages = [lines];
    this.pageIndex = 0;
    this.revealed = Infinity;
    this.visible = true;
    this.standing = true;
    this.theme = theme;
    this.choice = null;
    this.pendingChoice = null;
    this.settle();
    this.autoCloseAfter = 0;
  }

  close() {
    this.visible = false;
    this.standing = false;
    this.choice = null;
    this.pendingChoice = null;
    this.settle();
  }

  update(dt) {
    if (!this.visible || this.standing) return;
    this.blink += dt;

    if (this.choice) {
      this.updateChoice();
      return;
    }

    const page = this.pages[this.pageIndex];
    const total = page.join('\n').length;
    const speed = input.held('a') || input.held('b') ? CHARS_PER_SECOND * 3 : CHARS_PER_SECOND;

    if (this.revealed < total) {
      this.revealed = Math.min(total, this.revealed + speed * dt);
      return;
    }

    if (this.autoCloseAfter > 0) {
      this.autoCloseAfter -= dt;
      if (this.autoCloseAfter <= 0) this.advance();
      return;
    }

    if (input.pressed('a') || input.pressed('b')) this.advance();
  }

  advance() {
    if (this.pageIndex < this.pages.length - 1) {
      this.pageIndex++;
      this.revealed = 0;
      audio.sfx('cursor');
      return;
    }
    if (this.pendingChoice) {
      this.choice = this.pendingChoice;
      this.pendingChoice = null;
      return;
    }
    this.close();
  }

  updateChoice() {
    const { options } = this.choice;
    if (input.repeat('up')) {
      this.choice.index = (this.choice.index - 1 + options.length) % options.length;
      audio.sfx('cursor');
    }
    if (input.repeat('down')) {
      this.choice.index = (this.choice.index + 1) % options.length;
      audio.sfx('cursor');
    }
    if (input.pressed('a')) {
      audio.sfx('confirm');
      this.finishChoice(this.choice.index);
    } else if (input.pressed('b')) {
      audio.sfx('cancel');
      this.finishChoice(this.choice.cancelIndex);
    }
  }

  finishChoice(index) {
    const resolve = this.choiceResolve;
    this.choiceResolve = null;
    this.visible = false;
    this.standing = false;
    this.choice = null;
    resolve?.(index);
  }

  draw(ctx) {
    if (!this.visible) return;
    const theme = drawPanel(ctx, BOX.x, BOX.y, BOX.w, BOX.h, this.theme);

    const page = this.pages[this.pageIndex];
    let budget = Math.floor(this.revealed);
    for (let i = 0; i < page.length; i++) {
      const line = page[i];
      if (budget <= 0) break;
      drawText(ctx, line.slice(0, budget), TEXT_X, TEXT_Y + i * LINE_HEIGHT, {
        color: theme.text,
        shadow: theme.textShadow,
      });
      budget -= line.length + 1; // +1 for the newline joining the lines
    }

    const done = Math.floor(this.revealed) >= page.join('\n').length;
    if (done && !this.standing && !this.choice && Math.floor(this.blink * 3) % 2 === 0) {
      drawText(ctx, '▾', BOX.x + BOX.w - 14, BOX.y + BOX.h - 14, {
        color: theme.text,
        shadow: theme.textShadow,
      });
    }

    if (this.choice) this.drawChoice(ctx);
  }

  drawChoice(ctx) {
    const { options, index } = this.choice;
    const width = Math.max(...options.map((o) => measure(o))) + 24;
    const height = options.length * LINE_HEIGHT + 10;
    const x = 236 - width;
    const y = BOX.y - height - 2;
    const theme = drawPanel(ctx, x, y, width, height, this.theme);

    options.forEach((option, i) => {
      const rowY = y + 5 + i * LINE_HEIGHT;
      if (i === index) {
        drawText(ctx, '▸', x + 5, rowY, { color: theme.text, shadow: theme.textShadow });
      }
      drawText(ctx, option, x + 14, rowY, { color: theme.text, shadow: theme.textShadow });
    });
  }
}

export const dialog = new Textbox();
export { BOX as DIALOG_BOX };
