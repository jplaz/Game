// An egg opening. The one moment in the game that stops everything else.

import { drawPanel } from '../ui/panel.js';
import { drawText, measure } from '../engine/font.js';
import { NamePad } from '../ui/namepad.js';
import { dialog } from '../ui/textbox.js';
import { audio } from '../engine/audio.js';
import { TRACKS } from '../data/music.js';
import { creatureSprite, SPRITE_SIZE } from '../art/creatures.js';
import { pixelOval } from '../art/pixels.js';
import { creatureSpecies } from '../game/creature.js';
import { addCreature, markCaught, game } from '../game/state.js';

export class Hatch {
  /** config: { creature, onEnd } */
  constructor(config) {
    this.config = config;
    this.creature = config.creature;
    this.view = 'opening';
    this.time = 0;
    this.shake = 0;
    this.flash = 0;
    this.namePad = null;
  }

  enter() {
    audio.play('victory', TRACKS);
    this.run();
  }

  wait(seconds) {
    return new Promise((resolve) => { this.timer = seconds; this.waitResolve = resolve; });
  }

  async run() {
    const def = creatureSpecies(this.creature);
    await dialog.say('The egg is moving.', { theme: 'royal' });
    this.shake = 1.6;
    await this.wait(1.6);
    await dialog.say('Something inside is answering you.', { theme: 'royal' });
    this.flash = 1.2;
    audio.sfx('levelup');
    await this.wait(1.2);
    this.view = 'hatched';
    await dialog.say(`A ${def.name} hatched!`, { theme: 'royal' });

    if (game.state.party.length >= 6) {
      await dialog.say('Your party is full. It waits with the maester until you have room.');
      this.finish(false);
      return;
    }

    const answer = await dialog.choose('Will you give it a name?', ['Yes', 'No']);
    if (answer !== 0) {
      await dialog.say(`${def.name} will answer to nothing but itself, then.`, { theme: 'royal' });
      this.finish(true);
      return;
    }
    this.namePad = new NamePad({
      prompt: `What will you call it?`,
      fallback: def.name,
    });
    this.view = 'naming';
  }

  update(dt) {
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);

    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0 && this.waitResolve) {
        const resolve = this.waitResolve;
        this.waitResolve = null;
        resolve();
      }
      return;
    }

    if (this.view === 'naming') {
      const chosen = this.namePad.update(dt);
      if (chosen !== null) {
        const def = creatureSpecies(this.creature);
        this.creature.nickname = chosen === def.name ? null : chosen;
        this.view = 'named';
        this.run2();
      }
      return;
    }

    dialog.update(dt);
  }

  async run2() {
    const name = this.creature.nickname ?? creatureSpecies(this.creature).name;
    await dialog.say(`${name}. It knows the sound already.`, { theme: 'royal' });
    this.finish(true);
  }

  finish(keep) {
    if (keep) {
      addCreature(this.creature);
      markCaught(this.creature.speciesId);
    }
    this.manager.transition(() => {
      this.manager.pop();
      this.config.onEnd?.(keep ? this.creature : null);
    });
  }

  draw(ctx) {
    // A dark hall with one light in it.
    const sky = ctx.createLinearGradient(0, 0, 0, 160);
    sky.addColorStop(0, '#1a1018');
    sky.addColorStop(0.6, '#3a1c22');
    sky.addColorStop(1, '#5a2c22');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 240, 160);

    if (this.view === 'naming') {
      this.namePad.draw(ctx);
      return;
    }

    const wobble = this.shake > 0 ? Math.sin(this.time * 40) * 2 : 0;
    const cx = 120 + wobble;
    const cy = 74;

    if (this.view === 'opening') {
      this.drawEgg(ctx, cx, cy);
    } else {
      const sprite = creatureSprite(creatureSpecies(this.creature));
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, 0, 0, SPRITE_SIZE, SPRITE_SIZE, cx - 32, cy - 34, 64, 64);
      ctx.restore();

      const name = this.creature.nickname ?? creatureSpecies(this.creature).name;
      drawPanel(ctx, 60, 14, 120, 20, 'royal');
      drawText(ctx, name, 120 - Math.floor(measure(name) / 2), 19,
        { color: '#ffeec8', shadow: '#3a1218' });
    }

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 236, 200, ${Math.min(1, this.flash)})`;
      ctx.fillRect(0, 0, 240, 160);
    }

    dialog.draw(ctx);
  }

  /** The egg itself: a scaled shell with a light coming through the cracks. */
  drawEgg(ctx, cx, cy) {
    // The heat coming off it, in two hard steps rather than a soft gradient.
    const pulse = Math.sin(this.time * 5);
    ctx.save();
    ctx.globalAlpha = 0.30 + pulse * 0.10;
    pixelOval(ctx, cx, cy, 34, 40, '#f0a040');
    ctx.globalAlpha = 0.34 + pulse * 0.12;
    pixelOval(ctx, cx, cy, 27, 33, '#f8c060');
    ctx.restore();

    pixelOval(ctx, cx, cy, 21, 27, '#2a1410');   // keyline
    pixelOval(ctx, cx, cy, 19, 25, '#7c3a2a');   // shell
    pixelOval(ctx, cx - 4, cy - 5, 12, 16, '#a8543a');  // lit side
    pixelOval(ctx, cx - 7, cy - 11, 5, 7, '#c47048');   // the highlight itself

    // Scales, and a crack that widens as it goes on.
    ctx.fillStyle = '#5c2a1e';
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 4; col++) {
        const x = cx - 14 + col * 8 + (row % 2 ? 4 : 0);
        const y = cy - 20 + row * 7;
        if ((x - cx) ** 2 / 361 + (y - cy) ** 2 / 625 > 0.8) continue;
        ctx.fillRect(x, y, 5, 2);
      }
    }
    const crack = Math.min(18, (1.6 - this.shake) * 14);
    if (crack > 0) {
      ctx.fillStyle = '#ffd890';
      ctx.fillRect(cx - 1, cy - crack / 2, 2, crack);
      ctx.fillRect(cx - 5, cy - 2, 4, 2);
      ctx.fillRect(cx + 2, cy + 3, 5, 2);
    }
  }
}
