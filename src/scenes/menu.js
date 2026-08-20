// The pause menu: party, bag, bestiary, sigils, trainer card and saving.

import { drawPanel, drawBar, HP_COLORS } from '../ui/panel.js';
import { drawText, measure, LINE_HEIGHT } from '../engine/font.js';
import { dialog } from '../ui/textbox.js';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { creatureSprite, SPRITE_SIZE } from '../art/creatures.js';
import { typeColor, typeName } from '../data/types.js';
import { move as getMove } from '../data/moves.js';
import { item as getItem, ITEMS, POCKETS, POCKET_NAMES } from '../data/items.js';
import { SPECIES, SPECIES_IDS, species as getSpecies, dexNumber } from '../data/species.js';
import {
  creatureSpecies, displayName, maxHp, hpRatio, healBy, expForLevel, STAT_KEYS,
} from '../game/creature.js';
import {
  game, party, itemCount, takeItem, formatMoney, formatTime, dexCounts, SIGILS,
} from '../game/state.js';
import { saveGame } from '../game/save.js';

const ROOT_ITEMS = ['PARTY', 'BAG', 'BESTIARY', 'SIGILS', 'CARD', 'SAVE', 'CLOSE'];

const STAT_LABELS = { hp: 'HP', atk: 'ATTACK', def: 'DEFENCE', spa: 'SP.ATK', spd: 'SP.DEF', spe: 'SPEED' };

export class MainMenu {
  constructor() {
    this.transparent = true;
    this.view = 'root';
    this.index = 0;
    this.partyIndex = 0;
    this.pocketIndex = 0;
    this.bagIndex = 0;
    this.bagScroll = 0;
    this.dexIndex = 0;
    this.dexScroll = 0;
    this.script = null;
  }

  run(fn) {
    this.script = Promise.resolve().then(fn)
      .catch((err) => console.error('Menu action failed:', err))
      .finally(() => { this.script = null; });
  }

  update(dt) {
    dialog.update(dt);
    if (dialog.busy || this.script) return;

    switch (this.view) {
      case 'root': return this.updateRoot();
      case 'party': return this.updateParty();
      case 'summary': return this.updateSummary();
      case 'bag': return this.updateBag();
      case 'dex': return this.updateDex();
      case 'dexEntry': return this.updateDexEntry();
      case 'sigils':
      case 'card': return this.updateSimple();
      default: return undefined;
    }
  }

  back(to = 'root') {
    audio.sfx('cancel');
    this.view = to;
  }

  // ---------------------------------------------------------------- root --

  updateRoot() {
    if (input.repeat('up')) {
      this.index = (this.index - 1 + ROOT_ITEMS.length) % ROOT_ITEMS.length;
      audio.sfx('cursor');
    }
    if (input.repeat('down')) {
      this.index = (this.index + 1) % ROOT_ITEMS.length;
      audio.sfx('cursor');
    }
    if (input.pressed('b') || input.pressed('start')) {
      audio.sfx('cancel');
      this.manager.pop();
      return;
    }
    if (!input.pressed('a')) return;

    audio.sfx('confirm');
    const choice = ROOT_ITEMS[this.index];
    if (choice === 'PARTY') {
      if (!party().length) {
        this.run(() => dialog.say('You have no creatures yet.'));
        return;
      }
      this.partyIndex = 0;
      this.view = 'party';
    } else if (choice === 'BAG') {
      this.pocketIndex = 0;
      this.bagIndex = 0;
      this.view = 'bag';
    } else if (choice === 'BESTIARY') {
      this.dexIndex = 0;
      this.view = 'dex';
    } else if (choice === 'SIGILS') {
      this.view = 'sigils';
    } else if (choice === 'CARD') {
      this.view = 'card';
    } else if (choice === 'SAVE') {
      this.run(async () => {
        const ok = saveGame();
        audio.sfx(ok ? 'confirm' : 'cancel');
        await dialog.say(ok
          ? 'The maester copied your progress into the ledger.'
          : 'The ledger would not take it. Your browser may be blocking storage.');
      });
    } else {
      this.manager.pop();
    }
  }

  // --------------------------------------------------------------- party --

  updateParty() {
    const list = party();
    if (input.repeat('up')) {
      this.partyIndex = (this.partyIndex - 1 + list.length) % list.length;
      audio.sfx('cursor');
    }
    if (input.repeat('down')) {
      this.partyIndex = (this.partyIndex + 1) % list.length;
      audio.sfx('cursor');
    }
    if (input.pressed('b')) return this.back('root');
    if (input.pressed('a')) {
      audio.sfx('confirm');
      this.view = 'summary';
    }
    return undefined;
  }

  updateSummary() {
    const list = party();
    if (input.repeat('left')) {
      this.partyIndex = (this.partyIndex - 1 + list.length) % list.length;
      audio.sfx('cursor');
    }
    if (input.repeat('right')) {
      this.partyIndex = (this.partyIndex + 1) % list.length;
      audio.sfx('cursor');
    }
    if (input.pressed('b') || input.pressed('a')) this.back('party');
  }

  // ----------------------------------------------------------------- bag --

  bagRows() {
    const pocket = POCKETS[this.pocketIndex];
    return Object.keys(game.state.bag)
      .filter((id) => ITEMS[id]?.pocket === pocket && itemCount(id) > 0);
  }

  updateBag() {
    if (input.repeat('left')) {
      this.pocketIndex = (this.pocketIndex - 1 + POCKETS.length) % POCKETS.length;
      this.bagIndex = 0;
      audio.sfx('cursor');
    }
    if (input.repeat('right')) {
      this.pocketIndex = (this.pocketIndex + 1) % POCKETS.length;
      this.bagIndex = 0;
      audio.sfx('cursor');
    }

    const rows = this.bagRows();
    if (rows.length) {
      if (input.repeat('up')) {
        this.bagIndex = (this.bagIndex - 1 + rows.length) % rows.length;
        audio.sfx('cursor');
      }
      if (input.repeat('down')) {
        this.bagIndex = (this.bagIndex + 1) % rows.length;
        audio.sfx('cursor');
      }
    }
    this.bagScroll = Math.max(0, Math.min(this.bagScroll, Math.max(0, rows.length - 5)));
    if (this.bagIndex < this.bagScroll) this.bagScroll = this.bagIndex;
    if (this.bagIndex >= this.bagScroll + 5) this.bagScroll = this.bagIndex - 4;

    if (input.pressed('b')) return this.back('root');
    if (input.pressed('a') && rows.length) {
      audio.sfx('confirm');
      this.run(() => this.useItem(rows[this.bagIndex]));
    }
    return undefined;
  }

  async useItem(id) {
    const def = getItem(id);
    if (def.key) {
      await dialog.say(def.desc);
      return;
    }
    if (def.use?.kind === 'catch') {
      await dialog.say('Banners are only any use with a wild creature in front of you.');
      return;
    }

    const list = party();
    if (!list.length) {
      await dialog.say('You have no creatures to use that on.');
      return;
    }

    const labels = list.map((c) => `${displayName(c)} ${c.hp}/${maxHp(c)}`);
    const choice = await dialog.choose(`Use ${def.name} on which?`, [...labels, 'Cancel'],
      { cancelIndex: labels.length });
    if (choice >= labels.length) return;

    const target = list[choice];
    const use = def.use;

    if (use.kind === 'heal' || use.kind === 'fullHeal') {
      if (target.hp <= 0) {
        await dialog.say(`${displayName(target)} has fainted. It needs reviving first.`);
        return;
      }
      if (target.hp >= maxHp(target) && use.kind === 'heal') {
        await dialog.say(`${displayName(target)} is already at full strength.`);
        return;
      }
      const healed = healBy(target, use.kind === 'fullHeal' ? maxHp(target) : use.amount);
      if (use.kind === 'fullHeal') {
        target.status = null;
        target.statusCounter = 0;
      }
      takeItem(id);
      audio.sfx('heal');
      await dialog.say(`${displayName(target)} recovered ${healed} HP.`);
    } else if (use.kind === 'cure') {
      if (target.status !== use.status) {
        await dialog.say('It would have no effect.');
        return;
      }
      target.status = null;
      target.statusCounter = 0;
      takeItem(id);
      audio.sfx('heal');
      await dialog.say(`${displayName(target)} is itself again.`);
    } else if (use.kind === 'revive') {
      if (target.hp > 0) {
        await dialog.say('It would have no effect.');
        return;
      }
      target.hp = Math.max(1, Math.floor(maxHp(target) * use.ratio));
      takeItem(id);
      audio.sfx('heal');
      await dialog.say(`${displayName(target)} was brought back!`);
    }
  }

  // ------------------------------------------------------------ bestiary --

  updateDex() {
    const count = SPECIES_IDS.length;
    if (input.repeat('up')) {
      this.dexIndex = (this.dexIndex - 1 + count) % count;
      audio.sfx('cursor');
    }
    if (input.repeat('down')) {
      this.dexIndex = (this.dexIndex + 1) % count;
      audio.sfx('cursor');
    }
    this.dexScroll = Math.max(0, Math.min(this.dexScroll, count - 7));
    if (this.dexIndex < this.dexScroll) this.dexScroll = this.dexIndex;
    if (this.dexIndex >= this.dexScroll + 7) this.dexScroll = this.dexIndex - 6;

    if (input.pressed('b')) return this.back('root');
    if (input.pressed('a')) {
      const id = SPECIES_IDS[this.dexIndex];
      if (game.state.dex.seen[id]) {
        audio.sfx('confirm');
        this.view = 'dexEntry';
      } else {
        audio.sfx('cancel');
      }
    }
    return undefined;
  }

  updateDexEntry() {
    if (input.pressed('a') || input.pressed('b')) this.back('dex');
  }

  updateSimple() {
    if (input.pressed('a') || input.pressed('b')) this.back('root');
  }

  // ---------------------------------------------------------------- draw --

  draw(ctx) {
    ctx.fillStyle = 'rgba(8,10,16,0.62)';
    ctx.fillRect(0, 0, 240, 160);

    switch (this.view) {
      case 'root': this.drawRoot(ctx); break;
      case 'party': this.drawParty(ctx); break;
      case 'summary': this.drawSummary(ctx); break;
      case 'bag': this.drawBag(ctx); break;
      case 'dex': this.drawDex(ctx); break;
      case 'dexEntry': this.drawDexEntry(ctx); break;
      case 'sigils': this.drawSigils(ctx); break;
      case 'card': this.drawCard(ctx); break;
      default: break;
    }
    dialog.draw(ctx);
  }

  drawRoot(ctx) {
    const w = 92;
    const h = ROOT_ITEMS.length * LINE_HEIGHT + 12;
    const x = 236 - w;
    const y = 6;
    const theme = drawPanel(ctx, x, y, w, h, 'night');
    ROOT_ITEMS.forEach((label, i) => {
      const rowY = y + 6 + i * LINE_HEIGHT;
      if (i === this.index) {
        drawText(ctx, '▸', x + 6, rowY, { color: theme.text, shadow: theme.textShadow });
      }
      drawText(ctx, label, x + 16, rowY, { color: theme.text, shadow: theme.textShadow });
    });
  }

  drawParty(ctx) {
    const list = party();
    drawPanel(ctx, 4, 4, 232, 152, 'night');
    drawText(ctx, 'YOUR BANNER', 12, 9, { color: '#f0dca0', shadow: '#151a2c' });

    list.forEach((creature, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 10 + col * 112;
      const y = 24 + row * 42;
      const selected = i === this.partyIndex;

      drawPanel(ctx, x, y, 106, 38, selected ? 'royal' : 'night');
      const theme = selected
        ? { text: '#ffeec8', shadow: '#3a1218' }
        : { text: '#f2f4ff', shadow: '#151a2c' };

      const sprite = creatureSprite(creatureSpecies(creature));
      ctx.drawImage(sprite, 0, 0, SPRITE_SIZE, SPRITE_SIZE, x + 3, y + 3, 32, 32);

      drawText(ctx, displayName(creature), x + 38, y + 4, theme);
      drawText(ctx, `Lv${creature.level}`, x + 38, y + 15, theme);

      const ratio = hpRatio(creature);
      drawBar(ctx, x + 38, y + 27, 60, 4, ratio, HP_COLORS(ratio));
      const hpLabel = `${creature.hp}/${maxHp(creature)}`;
      drawText(ctx, hpLabel, x + 100 - measure(hpLabel), y + 15, theme);
      if (creature.hp <= 0) drawText(ctx, 'DOWN', x + 76, y + 4, { color: '#f07070', shadow: '#151a2c' });
    });

    drawText(ctx, 'A: details   B: back', 12, 144, { color: '#98a0bc', shadow: '#151a2c' });
  }

  drawSummary(ctx) {
    const creature = party()[this.partyIndex];
    if (!creature) return;
    const def = creatureSpecies(creature);

    drawPanel(ctx, 4, 4, 232, 152, 'night');
    const sprite = creatureSprite(def);
    ctx.drawImage(sprite, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 10, 12, 56, 56);

    drawText(ctx, displayName(creature), 74, 10, { color: '#f0dca0', shadow: '#151a2c' });
    drawText(ctx, `No.${String(dexNumber(def.id)).padStart(3, '0')}  Lv${creature.level}`, 74, 22,
      { color: '#f2f4ff', shadow: '#151a2c' });

    def.types.forEach((type, i) => {
      const x = 74 + i * 40;
      ctx.fillStyle = typeColor(type);
      ctx.fillRect(x, 34, 36, 9);
      drawText(ctx, typeName(type), x + 3, 35, { color: '#20222e', shadow: null });
    });

    const ratio = hpRatio(creature);
    drawText(ctx, `HP ${creature.hp}/${maxHp(creature)}`, 74, 48,
      { color: '#f2f4ff', shadow: '#151a2c' });
    drawBar(ctx, 74, 60, 100, 4, ratio, HP_COLORS(ratio));

    // Stats column.
    STAT_KEYS.forEach((key, i) => {
      const y = 74 + i * 11;
      drawText(ctx, STAT_LABELS[key], 12, y, { color: '#98a0bc', shadow: '#151a2c' });
      const value = String(creature.stats[key]);
      drawText(ctx, value, 92 - measure(value), y, { color: '#f2f4ff', shadow: '#151a2c' });
    });

    // Moves column.
    drawText(ctx, 'MOVES', 108, 74, { color: '#f0dca0', shadow: '#151a2c' });
    creature.moves.forEach((slot, i) => {
      const m = getMove(slot.id);
      const y = 86 + i * 13;
      ctx.fillStyle = typeColor(m.type);
      ctx.fillRect(108, y + 1, 5, 6);
      drawText(ctx, m.name, 117, y, { color: '#f2f4ff', shadow: '#151a2c' });
      const pp = `${slot.pp}/${slot.maxPp}`;
      drawText(ctx, pp, 230 - measure(pp), y, { color: '#98a0bc', shadow: '#151a2c' });
    });

    const nextLevel = expForLevel(def.growth, creature.level + 1);
    drawText(ctx, `EXP to next: ${Math.max(0, nextLevel - creature.exp)}`, 12, 142,
      { color: '#98a0bc', shadow: '#151a2c' });
  }

  drawBag(ctx) {
    drawPanel(ctx, 4, 4, 232, 152, 'night');
    POCKETS.forEach((pocket, i) => {
      const x = 12 + i * 74;
      const active = i === this.pocketIndex;
      if (active) {
        ctx.fillStyle = '#f0dca0';
        ctx.fillRect(x - 4, 8, 70, 12);
      }
      drawText(ctx, POCKET_NAMES[pocket], x, 9,
        active ? { color: '#20222e', shadow: null } : { color: '#98a0bc', shadow: '#151a2c' });
    });

    const rows = this.bagRows();
    if (!rows.length) {
      drawText(ctx, 'Nothing here.', 16, 40, { color: '#98a0bc', shadow: '#151a2c' });
    } else {
      rows.slice(this.bagScroll, this.bagScroll + 5).forEach((id, i) => {
        const actual = this.bagScroll + i;
        const y = 30 + i * LINE_HEIGHT;
        const def = getItem(id);
        if (actual === this.bagIndex) {
          drawText(ctx, '▸', 12, y, { color: '#f2f4ff', shadow: '#151a2c' });
        }
        drawText(ctx, def.name, 22, y, { color: '#f2f4ff', shadow: '#151a2c' });
        if (!def.key) {
          const count = `x${itemCount(id)}`;
          drawText(ctx, count, 226 - measure(count), y, { color: '#98a0bc', shadow: '#151a2c' });
        }
      });

      const selected = rows[this.bagIndex];
      if (selected) {
        drawPanel(ctx, 8, 96, 224, 40, 'parchment');
        const info = getItem(selected).desc;
        const lines = info.match(/.{1,54}(\s|$)/g) ?? [info];
        lines.slice(0, 2).forEach((line, i) => {
          drawText(ctx, line.trim(), 14, 102 + i * LINE_HEIGHT,
            { color: '#3a3327', shadow: '#bdb39a' });
        });
      }
    }

    drawText(ctx, 'Left/Right: pockets   B: back', 12, 142, { color: '#98a0bc', shadow: '#151a2c' });
  }

  drawDex(ctx) {
    drawPanel(ctx, 4, 4, 232, 152, 'night');
    const counts = dexCounts();
    drawText(ctx, `BESTIARY  seen ${counts.seen}  sworn ${counts.caught}`, 12, 9,
      { color: '#f0dca0', shadow: '#151a2c' });

    const visible = SPECIES_IDS.slice(this.dexScroll, this.dexScroll + 7);
    visible.forEach((id, i) => {
      const actual = this.dexScroll + i;
      const y = 26 + i * 15;
      const seen = game.state.dex.seen[id];
      const caught = game.state.dex.caught[id];
      if (actual === this.dexIndex) {
        drawText(ctx, '▸', 12, y, { color: '#f2f4ff', shadow: '#151a2c' });
      }
      const number = String(actual + 1).padStart(3, '0');
      drawText(ctx, number, 22, y, { color: '#98a0bc', shadow: '#151a2c' });
      drawText(ctx, seen ? SPECIES[id].name : '-----', 50, y,
        { color: seen ? '#f2f4ff' : '#6a7088', shadow: '#151a2c' });
      if (caught) drawText(ctx, '★', 130, y, { color: '#f0dca0', shadow: '#151a2c' });

      if (seen) {
        const sprite = creatureSprite(getSpecies(id));
        ctx.drawImage(sprite, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 150, y - 3, 16, 16);
      }
    });

    drawText(ctx, 'A: entry   B: back', 12, 142, { color: '#98a0bc', shadow: '#151a2c' });
  }

  drawDexEntry(ctx) {
    const id = SPECIES_IDS[this.dexIndex];
    const def = getSpecies(id);
    drawPanel(ctx, 4, 4, 232, 152, 'night');

    ctx.drawImage(creatureSprite(def), 0, 0, SPRITE_SIZE, SPRITE_SIZE, 12, 14, 64, 64);
    drawText(ctx, `No.${String(dexNumber(id)).padStart(3, '0')}  ${def.name}`, 86, 14,
      { color: '#f0dca0', shadow: '#151a2c' });

    def.types.forEach((type, i) => {
      const x = 86 + i * 40;
      ctx.fillStyle = typeColor(type);
      ctx.fillRect(x, 28, 36, 9);
      drawText(ctx, typeName(type), x + 3, 29, { color: '#20222e', shadow: null });
    });

    const total = STAT_KEYS.reduce((sum, key) => sum + def.base[key], 0);
    drawText(ctx, `Base total ${total}`, 86, 44, { color: '#98a0bc', shadow: '#151a2c' });
    drawText(ctx, game.state.dex.caught[id] ? 'Sworn to your banner' : 'Seen, not sworn', 86, 56,
      { color: '#98a0bc', shadow: '#151a2c' });

    const lines = def.dex.match(/.{1,52}(\s|$)/g) ?? [def.dex];
    lines.slice(0, 4).forEach((line, i) => {
      drawText(ctx, line.trim(), 14, 92 + i * LINE_HEIGHT, { color: '#f2f4ff', shadow: '#151a2c' });
    });
  }

  drawSigils(ctx) {
    drawPanel(ctx, 4, 4, 232, 152, 'night');
    drawText(ctx, 'SIGILS EARNED', 12, 9, { color: '#f0dca0', shadow: '#151a2c' });

    SIGILS.forEach((sigil, i) => {
      const earned = game.state.sigils.includes(sigil.id);
      const y = 26 + i * 30;
      drawPanel(ctx, 10, y, 220, 26, earned ? 'royal' : 'night');
      const theme = earned
        ? { color: '#ffeec8', shadow: '#3a1218' }
        : { color: '#6a7088', shadow: '#151a2c' };
      drawText(ctx, earned ? `★ House ${sigil.house}` : `? House ${sigil.house}`, 18, y + 4, theme);
      drawText(ctx, earned ? sigil.motto : '- not yet earned -', 18, y + 14, theme);
      drawText(ctx, sigil.town, 224 - measure(sigil.town), y + 9, theme);
    });
  }

  drawCard(ctx) {
    drawPanel(ctx, 4, 4, 232, 152, 'royal');
    const p = game.state.player;
    const theme = { color: '#ffeec8', shadow: '#3a1218' };
    drawText(ctx, 'RIDER OF WINTERFELL', 14, 12, theme);
    drawText(ctx, `Name      ${p.name}`, 14, 34, theme);
    drawText(ctx, `Sigils    ${game.state.sigils.length} of ${SIGILS.length}`, 14, 48, theme);
    drawText(ctx, `Purse     ${formatMoney(p.money)}`, 14, 62, theme);
    drawText(ctx, `Time      ${formatTime(p.playtime)}`, 14, 76, theme);
    drawText(ctx, `Steps     ${p.steps}`, 14, 90, theme);
    const counts = dexCounts();
    drawText(ctx, `Bestiary  ${counts.caught} sworn of ${SPECIES_IDS.length}`, 14, 104, theme);
    drawText(ctx, game.state.flags.gameComplete ? 'The realm is yours.' : 'The road goes on.', 14, 126, theme);
  }
}
