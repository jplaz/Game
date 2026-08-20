// The blacksmith: buy weapons, armour and shields, and equip them on the spot.
//
// Gear is bought once and kept forever, so the smithy shows what you already
// own rather than a quantity, and lets you swap between pieces for free.

import { drawPanel } from '../ui/panel.js';
import { drawText, measure, wrapText, LINE_HEIGHT } from '../engine/font.js';
import { dialog } from '../ui/textbox.js';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { gear, gearTable, GEAR_SLOTS } from '../data/gear.js';
import { game, addMoney, canAfford } from '../game/state.js';
import { equipped, equip, giveGear, ownsGear, playerStats } from '../game/player.js';

const SLOT_NAMES = { weapon: 'ARMS', armour: 'ARMOUR', shield: 'SHIELDS' };
const VISIBLE = 5;

export class Smithy {
  constructor({ stock, onClose }) {
    this.stock = stock;      // { weapon: [...], armour: [...], shield: [...] }
    this.onClose = onClose;
    this.transparent = true;
    this.mode = 'root';
    this.slotIndex = 0;
    this.index = 0;
    this.scroll = 0;
    this.script = null;
  }

  enter() { this.run(() => this.openRoot()); }

  run(fn) {
    this.script = Promise.resolve().then(fn)
      .catch((err) => console.error('Smithy failed:', err))
      .finally(() => { this.script = null; });
  }

  get slot() { return GEAR_SLOTS[this.slotIndex]; }

  /** Everything on offer here plus everything you already own in that slot. */
  rowsFor(slot) {
    const offered = this.stock?.[slot] ?? [];
    const owned = (game.state.player.gearOwned?.[slot] ?? []);
    return [...new Set([...offered, ...owned])]
      .filter((id) => gearTable(slot)[id])
      .sort((a, b) => (gearTable(slot)[a].tier ?? 0) - (gearTable(slot)[b].tier ?? 0));
  }

  async openRoot() {
    this.mode = 'root';
    const choice = await dialog.choose('The smith looks you over. What do you need?',
      ['Arms', 'Armour', 'Shields', 'Nothing']);
    if (choice === 3 || choice < 0) { this.close(); return; }
    this.slotIndex = choice;
    this.index = 0;
    this.scroll = 0;
    this.mode = 'list';
  }

  close() {
    this.manager.pop();
    this.onClose?.();
  }

  update(dt) {
    dialog.update(dt);
    if (dialog.busy || this.script) return;
    if (this.mode !== 'list') return;

    const rows = this.rowsFor(this.slot);
    if (!rows.length) { this.run(() => this.openRoot()); return; }

    if (input.repeat('up')) { this.index = (this.index - 1 + rows.length) % rows.length; audio.sfx('cursor'); }
    if (input.repeat('down')) { this.index = (this.index + 1) % rows.length; audio.sfx('cursor'); }
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + VISIBLE) this.scroll = this.index - VISIBLE + 1;
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, rows.length - VISIBLE)));

    if (input.pressed('b')) { audio.sfx('cancel'); this.run(() => this.openRoot()); return; }
    if (input.pressed('a')) { audio.sfx('confirm'); this.run(() => this.select(rows[this.index])); }
  }

  async select(id) {
    const slot = this.slot;
    const def = gear(slot, id);

    if (equipped(slot).id === id) {
      await dialog.say(`You are already carrying the ${def.name}.`);
      return;
    }
    if (ownsGear(slot, id)) {
      equip(slot, id);
      audio.sfx('confirm');
      await dialog.say(`You take up the ${def.name}.`);
      return;
    }
    if (def.unique) {
      await dialog.say('The smith shakes his head. "That one is not mine to sell."');
      return;
    }
    const answer = await dialog.choose(`${def.name} — ${def.price} gold dragons. Take it?`, ['Buy', 'Leave it']);
    if (answer !== 0) return;
    if (!canAfford(def.price)) {
      await dialog.say('"Come back when your purse is heavier."');
      return;
    }
    addMoney(-def.price);
    giveGear(slot, id);
    equip(slot, id);
    audio.sfx('money');
    await dialog.say(`You buy the ${def.name} and put it on at once.`);
  }

  // ---------------------------------------------------------------- draw --

  draw(ctx) {
    ctx.fillStyle = 'rgba(10,8,8,0.6)';
    ctx.fillRect(0, 0, 240, 160);

    const purse = `${game.state.player.money}g`;
    drawPanel(ctx, 152, 4, 84, 18, 'night');
    drawText(ctx, purse, 230 - measure(purse), 9, { color: '#f2f4ff', shadow: '#151a2c' });

    if (this.mode === 'list') this.drawList(ctx);
    dialog.draw(ctx);
  }

  drawList(ctx) {
    const slot = this.slot;
    const rows = this.rowsFor(slot);
    const box = { x: 6, y: 24, w: 228, h: 74 };
    const t = drawPanel(ctx, box.x, box.y, box.w, box.h, 'night');

    drawText(ctx, SLOT_NAMES[slot], box.x + 8, box.y - 18, { color: '#f0dca0', shadow: '#151a2c' });

    rows.slice(this.scroll, this.scroll + VISIBLE).forEach((id, i) => {
      const actual = this.scroll + i;
      const def = gear(slot, id);
      const y = box.y + 6 + i * LINE_HEIGHT;
      if (actual === this.index) drawText(ctx, '▸', box.x + 5, y, { color: t.text, shadow: t.textShadow });

      const worn = equipped(slot).id === id;
      const owned = ownsGear(slot, id);
      drawText(ctx, def.name, box.x + 14, y,
        { color: worn ? '#f0dca0' : t.text, shadow: t.textShadow });

      const tag = worn ? 'WORN' : owned ? 'OWNED' : def.unique ? '--' : `${def.price}g`;
      drawText(ctx, tag, box.x + box.w - measure(tag) - 8, y, { color: t.text, shadow: t.textShadow });
    });

    // What the highlighted piece would do to you, compared with what you wear.
    const selected = rows[this.index];
    if (!selected) return;
    const def = gear(slot, selected);
    const current = equipped(slot);
    drawPanel(ctx, 6, 100, 228, 34, 'parchment');

    const deltas = [];
    for (const [key, label] of [['might', 'MIGHT'], ['guard', 'GUARD'], ['swiftness', 'SWIFT']]) {
      const diff = (def[key] ?? 0) - (current[key] ?? 0);
      if (diff !== 0) deltas.push(`${label} ${diff > 0 ? '+' : ''}${diff}`);
    }
    drawText(ctx, deltas.length ? deltas.join('   ') : 'No change to your fighting.',
      13, 105, { color: '#3d3d47', shadow: '#b8bcc8' });
    // Wrap rather than truncate; a clipped sentence looks like a bug.
    const blurb = wrapText(def.desc, 206)[0] ?? '';
    drawText(ctx, blurb, 13, 117, { color: '#3d3d47', shadow: '#b8bcc8' });

    const stats = playerStats();
    const summary = `MIGHT ${stats.might}   GUARD ${stats.guard}   SWIFT ${stats.swiftness}`;
    drawPanel(ctx, 6, 136, measure(summary) + 20, 20, 'night');
    drawText(ctx, summary, 16, 142, { color: '#f0dca0', shadow: '#151a2c' });
  }
}
