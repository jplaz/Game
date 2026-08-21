// Holding court.
//
// One turn of a reign: what the realm looks like, what is being asked of you,
// and what it costs to answer. The screen is a ledger rather than a battle,
// because that is what the job turned out to be.

import { drawPanel, drawBar } from '../ui/panel.js';
import { drawText, measure, fitText } from '../engine/font.js';
import { dialog } from '../ui/textbox.js';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { TRACKS } from '../data/music.js';
import { rng } from '../engine/rng.js';
import { HOUSES, HOUSE_IDS } from '../data/houses.js';
import { PETITIONS, PETITION_IDS } from '../data/petitions.js';
import {
  realm, stability, treasury, changeStability, collect, spend, record,
  council, seat, seated, COUNCIL_SEATS, rebellions, inRevolt, checkRising,
  crushRising, buyOffRising, advanceTurn, realmWord, MAX_STABILITY, UNREST,
} from '../game/realm.js';
import { changeStanding, standing, recordChoice, formatMoney } from '../game/state.js';

export class Court {
  /** config: { onEnd } */
  constructor(config = {}) {
    this.config = config;
    this.menu = null;
    this.timer = 0;
    this.waitResolve = null;
    this.busy = true;
    this.done = false;
  }

  enter() {
    audio.play('battleBoss', TRACKS);
    this.run();
  }

  say(text, opts) { return dialog.say(text, { theme: 'royal', ...opts }); }

  openMenu(options, { columns = 1 } = {}) {
    return new Promise((resolve) => {
      this.menu = { options, columns, index: 0, resolve };
    });
  }

  wait(seconds) {
    return new Promise((resolve) => { this.timer = seconds; this.waitResolve = resolve; });
  }

  // ------------------------------------------------------------- the turn --

  async run() {
    const r = realm();
    await this.say(`Court, in the ${ordinal(r.turn)} turn of your reign.`);

    // Anyone in open revolt is the first business of the day.
    if (rebellions().length) {
      await this.handleRebellions();
      if (this.done) return;
    }

    await this.hearPetition();
    if (this.done) return;

    await this.councilBusiness();
    if (this.done) return;

    // The turn closes: taxes, the council's keep, and whatever the realm has
    // decided about you since last time.
    const summary = advanceTurn();
    await this.say(`Taxes bring in ${formatMoney(summary.taxes)}. The treasury holds `
      + `${formatMoney(summary.treasury)}.`);
    if (summary.revoltCost > 0) {
      await this.say(`Open revolt costs the realm ${summary.revoltCost} in steadiness.`);
    }
    await this.say(`The realm is ${realmWord().toLowerCase()}.`);

    // And then somebody may decide this is their moment.
    const rising = checkRising(() => rng.int(0, 1000) / 1000);
    if (rising) {
      audio.sfx('strong');
      record(`${HOUSES[rising].name} raised banners.`);
      await this.say(`${HOUSES[rising].full} has raised its banners against you.`,
        { theme: 'royal' });
    }

    if (stability() <= 0) {
      await this.say('The realm has stopped listening. The chair is only a chair.');
      recordChoice('reignEnded', 'deposed');
      this.finish('deposed');
      return;
    }

    this.finish('continue');
  }

  async handleRebellions() {
    for (const houseId of [...rebellions()]) {
      const def = HOUSES[houseId];
      await this.say(`${def.full} is in open revolt. Their banners are in the field.`);
      const cost = 2500 + standing(houseId) * -20;
      const choice = await this.openMenu([
        'Ride out and break them',
        `Buy them off (${formatMoney(cost)})`,
        'Leave them be for now',
      ]);

      if (choice === 0) {
        await this.say('You take the field yourself. It is the only argument they will hear.');
        const won = await this.fightRebellion(houseId);
        if (!won) return;
        crushRising(houseId);
        record(`${def.name}'s rising was broken.`);
        await this.say(`${def.full} bends the knee. The realm draws breath.`);
      } else if (choice === 1) {
        if (buyOffRising(houseId, cost)) {
          record(`${def.name} was paid off.`);
          await this.say('They take the gold and go home. Everyone watching learns the price.');
        } else {
          await this.say('The treasury will not stretch to it. They stay in the field.');
        }
      } else {
        changeStability(-4);
        await this.say('You let it stand. It does not improve on its own.');
      }
    }
  }

  /** A rebellion is put down in person, like everything else in this game. */
  async fightRebellion(houseId) {
    const { makeRoamer } = await import('../data/duellists.js');
    const level = Math.min(50, 30 + realm().turn);
    const foe = makeRoamer('manAtArms', level, (list) => list[0]);
    foe.name = `${HOUSES[houseId].short} Rebel Captain`;
    foe.house = houseId;
    foe.boss = true;
    foe.canYield = false;
    foe.intro = `${foe.name}: You sit a chair you took. We are here to take it back.`;
    foe.defeat = `${foe.name}: The field is yours. So is the crown, gods help you.`;
    foe.reward = 0;

    return new Promise((resolve) => {
      this.manager.transition(async () => {
        const { Duel } = await import('./duel.js');
        this.manager.push(new Duel({
          def: foe,
          onEnd: (outcome) => {
            audio.play('battleBoss', TRACKS);
            if (outcome !== 'won') {
              changeStability(-12);
              this.say('You are carried from the field. The realm hears about that too.')
                .then(() => resolve(false));
            } else {
              resolve(true);
            }
          },
        }));
      }, { color: '#1a1016' });
    });
  }

  async hearPetition() {
    const available = PETITION_IDS.filter((id) => {
      const p = PETITIONS[id];
      if (p.requires?.treasuryBelow && treasury() >= p.requires.treasuryBelow) return false;
      return true;
    });
    const id = rng.pick(available);
    const petition = PETITIONS[id];

    await this.say(petition.text);
    const choice = await this.openMenu(petition.options.map((o) => o.label));
    const option = petition.options[Math.max(0, choice)];

    if (option.gold) {
      if (option.gold > 0) collect(option.gold);
      else if (!spend(-option.gold)) {
        await this.say('The treasury cannot bear it. The decision makes itself.');
        changeStability(-5);
        return;
      }
    }
    if (option.stability) changeStability(option.stability);
    for (const [house, delta] of Object.entries(option.standing ?? {})) {
      changeStanding(house, delta);
    }
    if (option.choice) recordChoice(option.choice[0], option.choice[1]);

    record(option.label);
    audio.sfx('confirm');
    await this.say(option.result);
  }

  async councilBusiness() {
    if (council().length >= COUNCIL_SEATS) return;
    const open = HOUSE_IDS.filter((h) => !seated(h) && !inRevolt(h) && standing(h) > -25);
    if (!open.length) return;

    const answer = await this.openMenu(['Fill a council seat', 'Not this turn']);
    if (answer !== 0) return;

    const shortlist = open
      .sort((a, b) => standing(b) - standing(a))
      .slice(0, 4);
    const pick = await this.openMenu(shortlist.map((h) => HOUSES[h].full));
    if (pick < 0) return;
    const houseId = shortlist[pick];
    seat(houseId);
    record(`${HOUSES[houseId].name} took a council seat.`);
    audio.sfx('levelup');
    await this.say(`${HOUSES[houseId].full} takes a seat on your council. `
      + 'Their enemies noticed before the ink was dry.');
  }

  finish(outcome) {
    this.done = true;
    this.manager.transition(() => {
      this.manager.pop();
      this.config.onEnd?.(outcome);
    });
  }

  // ------------------------------------------------------------- plumbing --

  update(dt) {
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const resolve = this.waitResolve;
        this.waitResolve = null;
        resolve?.();
      }
      return;
    }
    dialog.update(dt);
    if (dialog.busy) return;
    if (this.menu) this.updateMenu();
  }

  updateMenu() {
    const menu = this.menu;
    if (input.repeat('up')) {
      menu.index = (menu.index - 1 + menu.options.length) % menu.options.length;
      audio.sfx('cursor');
    }
    if (input.repeat('down')) {
      menu.index = (menu.index + 1) % menu.options.length;
      audio.sfx('cursor');
    }
    if (input.pressed('a')) {
      audio.sfx('confirm');
      const { resolve, index } = menu;
      this.menu = null;
      resolve(index);
    }
  }

  // ----------------------------------------------------------------- draw --

  draw(ctx) {
    // The hall: dark stone, a shaft of light, and the chair.
    const wall = ctx.createLinearGradient(0, 0, 0, 160);
    wall.addColorStop(0, '#1c1620');
    wall.addColorStop(0.6, '#2e2029');
    wall.addColorStop(1, '#3a2a26');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, 240, 160);
    this.drawThrone(ctx, 132, 62);

    this.drawLedger(ctx);
    dialog.draw(ctx);
    if (this.menu) this.drawMenu(ctx);
  }

  /** The realm at a glance: steadiness, treasury, council, who is in revolt. */
  drawLedger(ctx) {
    const t = drawPanel(ctx, 4, 4, 108, 52, 'night');
    const r = realm();
    drawText(ctx, `Turn ${r.turn}`, 10, 8, { color: '#f0dca0', shadow: t.textShadow });

    const value = stability();
    const band = value >= 80 ? '#78d858'
      : value >= 60 ? '#a8d868'
      : value >= UNREST ? '#f0c840'
      : value >= 15 ? '#f0a050' : '#f07050';
    drawText(ctx, fitText(realmWord(), 96), 10, 19, { color: band, shadow: t.textShadow });
    drawBar(ctx, 10, 29, 94, 4, value / MAX_STABILITY, { light: band, dark: '#3a4a36' });

    const gold = formatMoney(treasury());
    drawText(ctx, gold, 106 - measure(gold), 36, { color: '#f0dca0', shadow: t.textShadow });
    drawText(ctx, 'Treasury', 10, 36, { color: '#98a0bc', shadow: t.textShadow });

    // Council seats, as small house-coloured marks.
    drawText(ctx, 'Council', 10, 45, { color: '#98a0bc', shadow: t.textShadow });
    let x = 62;
    for (let i = 0; i < COUNCIL_SEATS; i++) {
      const houseId = council()[i];
      ctx.fillStyle = '#151a2c';
      ctx.fillRect(x - 1, 45, 12, 7);
      ctx.fillStyle = houseId ? HOUSES[houseId].colour : '#3a4058';
      ctx.fillRect(x, 46, 10, 5);
      if (houseId) {
        ctx.fillStyle = HOUSES[houseId].accent;
        ctx.fillRect(x, 46, 10, 2);
      }
      x += 14;
    }

    // Anyone in the field against you.
    const revolt = rebellions();
    if (revolt.length) {
      const label = revolt.map((id) => HOUSES[id].name).join(', ');
      drawPanel(ctx, 116, 4, 120, 20, 'royal');
      drawText(ctx, fitText(`In revolt: ${label}`, 108), 122, 9,
        { color: '#ffc0a0', shadow: '#3a1218' });
    }
  }

  /**
   * A seat made of swords. Blades of uneven length fanned above a dark mass,
   * with a small figure sitting in the middle of it — the picture the whole
   * postgame is about.
   */
  drawThrone(ctx, cx, baseY) {
    // The fan of blades, tallest in the middle.
    for (let i = 0; i < 21; i++) {
      const offset = i - 10;
      const bx = cx + offset * 3;
      const lean = Math.round(offset * 0.6);
      const h = 30 - Math.abs(offset) * 1.8 + ((i * 7) % 5);
      if (h <= 2) continue;
      const top = baseY - 6 - h;
      ctx.fillStyle = '#3b3e48';
      ctx.fillRect(bx + lean, top, 2, h);
      ctx.fillStyle = '#7b8090';
      ctx.fillRect(bx + lean, top, 1, h);
      // A hilt where the blade meets the seat.
      ctx.fillStyle = '#5a4a32';
      ctx.fillRect(bx + lean - 1, baseY - 8, 4, 2);
    }

    // The body of the chair.
    ctx.fillStyle = '#15121a';
    ctx.fillRect(cx - 28, baseY - 8, 56, 24);
    ctx.fillStyle = '#2a2730';
    ctx.fillRect(cx - 26, baseY - 6, 52, 20);
    ctx.fillStyle = '#3d3a46';
    ctx.fillRect(cx - 26, baseY - 6, 52, 2);
    ctx.fillStyle = '#0f0d13';
    ctx.fillRect(cx - 30, baseY + 16, 60, 4);

    // Whoever is sitting in it.
    ctx.fillStyle = '#5a2a30';
    ctx.fillRect(cx - 7, baseY - 4, 14, 14);   // robe
    ctx.fillStyle = '#74373d';
    ctx.fillRect(cx - 7, baseY - 4, 14, 2);
    ctx.fillStyle = '#d9a882';
    ctx.fillRect(cx - 4, baseY - 12, 8, 8);    // head
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(cx - 5, baseY - 13, 10, 3);   // hair
    ctx.fillStyle = '#c8a24a';
    ctx.fillRect(cx - 5, baseY - 15, 10, 2);   // crown
    ctx.fillStyle = '#e8c878';
    ctx.fillRect(cx - 5, baseY - 15, 10, 1);
    ctx.fillRect(cx - 3, baseY - 17, 2, 2);
    ctx.fillRect(cx + 1, baseY - 17, 2, 2);
  }

  drawMenu(ctx) {
    const menu = this.menu;
    const width = Math.max(120, Math.max(...menu.options.map((o) => measure(o))) + 26);
    const height = menu.options.length * 12 + 10;
    const x = 236 - width;
    const y = Math.max(4, 102 - height);
    const t = drawPanel(ctx, x, y, width, height, 'night');
    menu.options.forEach((label, i) => {
      const rowY = y + 5 + i * 12;
      if (i === menu.index) drawText(ctx, '▸', x + 5, rowY, { color: t.text, shadow: t.textShadow });
      drawText(ctx, label, x + 14, rowY, { color: t.text, shadow: t.textShadow });
    });
  }
}

function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}
