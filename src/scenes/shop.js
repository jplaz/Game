// Buying and selling at a Maester's Hall counter.

import { drawPanel } from '../ui/panel.js';
import { drawText, measure, LINE_HEIGHT } from '../engine/font.js';
import { dialog } from '../ui/textbox.js';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { item as getItem, ITEMS } from '../data/items.js';
import { game, addMoney, canAfford, giveItem, takeItem, itemCount } from '../game/state.js';

const VISIBLE_ROWS = 5;

export class Shop {
  constructor({ stock, onClose }) {
    this.stock = stock;
    this.onClose = onClose;
    this.transparent = true;

    this.mode = 'root';   // 'root' | 'list' | 'quantity'
    this.buying = true;
    this.rows = [];
    this.index = 0;
    this.scroll = 0;
    this.quantity = 1;
    this.script = null;
  }

  enter() {
    this.run(() => this.openRoot());
  }

  run(fn) {
    this.script = Promise.resolve().then(fn)
      .catch((err) => console.error('Shop script failed:', err))
      .finally(() => { this.script = null; });
  }

  sellableIds() {
    return Object.keys(game.state.bag)
      .filter((id) => ITEMS[id] && !ITEMS[id].key && itemCount(id) > 0);
  }

  async openRoot() {
    this.mode = 'root';
    const choice = await dialog.choose('What do you need?', ['Buy', 'Sell', 'Leave']);

    if (choice === 0) {
      this.buying = true;
      this.rows = this.stock;
      this.enterList();
    } else if (choice === 1) {
      const sellable = this.sellableIds();
      if (!sellable.length) {
        await dialog.say('You have nothing worth selling.');
        return this.openRoot();
      }
      this.buying = false;
      this.rows = sellable;
      this.enterList();
    } else {
      this.close();
    }
    return undefined;
  }

  enterList() {
    this.mode = 'list';
    this.index = 0;
    this.scroll = 0;
  }

  close() {
    this.manager.pop();
    this.onClose?.();
  }

  /** Price of one unit of the highlighted item, in the current direction. */
  unitPrice(id) {
    const def = getItem(id);
    return this.buying ? def.price : Math.floor(def.price / 2);
  }

  /** Largest quantity the player could commit to right now. */
  quantityCap(id) {
    if (!this.buying) return Math.max(1, Math.min(99, itemCount(id)));
    const price = this.unitPrice(id);
    if (price <= 0) return 99;
    return Math.max(1, Math.min(99, Math.floor(game.state.player.money / price)));
  }

  update(dt) {
    dialog.update(dt);
    if (dialog.busy || this.script) return;

    if (this.mode === 'list') this.updateList();
    else if (this.mode === 'quantity') this.updateQuantity();
  }

  updateList() {
    const count = this.rows.length;
    if (!count) {
      this.run(() => this.openRoot());
      return;
    }

    if (input.repeat('up')) {
      this.index = (this.index - 1 + count) % count;
      audio.sfx('cursor');
    }
    if (input.repeat('down')) {
      this.index = (this.index + 1) % count;
      audio.sfx('cursor');
    }
    // Keep the cursor inside the visible window.
    this.scroll = Math.max(0, Math.min(this.scroll, count - VISIBLE_ROWS));
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + VISIBLE_ROWS) this.scroll = this.index - VISIBLE_ROWS + 1;
    this.scroll = Math.max(0, this.scroll);

    if (input.pressed('b')) {
      audio.sfx('cancel');
      this.run(() => this.openRoot());
      return;
    }
    if (input.pressed('a')) {
      const id = this.rows[this.index];
      if (this.buying && !canAfford(this.unitPrice(id))) {
        this.run(async () => { await dialog.say('You cannot afford that.'); });
        return;
      }
      audio.sfx('confirm');
      this.quantity = 1;
      this.mode = 'quantity';
    }
  }

  updateQuantity() {
    const id = this.rows[this.index];
    const cap = this.quantityCap(id);

    if (input.repeat('up')) {
      this.quantity = this.quantity >= cap ? 1 : this.quantity + 1;
      audio.sfx('cursor');
    }
    if (input.repeat('down')) {
      this.quantity = this.quantity <= 1 ? cap : this.quantity - 1;
      audio.sfx('cursor');
    }
    if (input.pressed('b')) {
      audio.sfx('cancel');
      this.mode = 'list';
      return;
    }
    if (input.pressed('a')) {
      audio.sfx('confirm');
      this.run(() => this.confirm(id));
    }
  }

  async confirm(id) {
    const def = getItem(id);
    const total = this.unitPrice(id) * this.quantity;

    if (this.buying) {
      if (!canAfford(total)) {
        await dialog.say('You cannot afford that.');
        this.mode = 'list';
        return;
      }
      addMoney(-total);
      giveItem(id, this.quantity);
      audio.sfx('money');
      await dialog.say(`${this.quantity} ${def.name} for ${total} gold dragons. A pleasure.`);
      this.mode = 'list';
      return;
    }

    takeItem(id, this.quantity);
    addMoney(total);
    audio.sfx('money');
    await dialog.say(`Sold ${this.quantity} ${def.name} for ${total} gold dragons.`);

    this.rows = this.sellableIds();
    if (!this.rows.length) {
      await this.openRoot();
      return;
    }
    this.index = Math.min(this.index, this.rows.length - 1);
    this.mode = 'list';
  }

  // ---------------------------------------------------------------- draw --

  draw(ctx) {
    ctx.fillStyle = 'rgba(10,12,18,0.55)';
    ctx.fillRect(0, 0, 240, 160);

    const purse = `${game.state.player.money}g`;
    drawPanel(ctx, 152, 4, 84, 18, 'night');
    drawText(ctx, purse, 230 - measure(purse), 9, { color: '#f2f4ff', shadow: '#151a2c' });

    if (this.mode !== 'root') this.drawList(ctx);
    if (this.mode === 'quantity') this.drawQuantity(ctx);

    dialog.draw(ctx);
  }

  drawList(ctx) {
    if (!this.rows.length) return;
    const box = { x: 6, y: 26, w: 228, h: 74 };
    const theme = drawPanel(ctx, box.x, box.y, box.w, box.h, 'night');
    const visible = this.rows.slice(this.scroll, this.scroll + VISIBLE_ROWS);

    visible.forEach((id, i) => {
      const def = getItem(id);
      const actual = this.scroll + i;
      const y = box.y + 6 + i * LINE_HEIGHT;
      if (actual === this.index) {
        drawText(ctx, '▸', box.x + 5, y, { color: theme.text, shadow: theme.textShadow });
      }
      drawText(ctx, def.name, box.x + 14, y, { color: theme.text, shadow: theme.textShadow });
      const price = this.buying
        ? `${def.price}g`
        : `${Math.floor(def.price / 2)}g  (${itemCount(id)})`;
      drawText(ctx, price, box.x + box.w - measure(price) - 8, y,
        { color: theme.text, shadow: theme.textShadow });
    });

    if (this.rows.length > VISIBLE_ROWS) {
      drawText(ctx, '▾', box.x + box.w - 12, box.y + box.h - 12,
        { color: theme.text, shadow: theme.textShadow });
    }

    const selected = this.rows[this.index];
    if (selected) {
      drawPanel(ctx, 6, 102, 228, 26, 'parchment');
      const info = getItem(selected).desc;
      const trimmed = info.length > 62 ? `${info.slice(0, 59)}...` : info;
      drawText(ctx, trimmed, 12, 108, { color: '#3a3327', shadow: '#bdb39a' });
    }
  }

  drawQuantity(ctx) {
    const id = this.rows[this.index];
    const label = `x${this.quantity}   ${this.unitPrice(id) * this.quantity}g`;
    const w = measure(label) + 26;
    drawPanel(ctx, 236 - w, 130, w, 22, 'night');
    drawText(ctx, label, 248 - w, 136, { color: '#f2f4ff', shadow: '#151a2c' });
  }
}
