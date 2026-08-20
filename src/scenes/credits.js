// End credits: a slow scroll over the throne room, then back to the game so
// the player can keep filling out the bestiary.

import { drawText, measure, LINE_HEIGHT } from '../engine/font.js';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { TRACKS } from '../data/music.js';
import { creatureSprite, SPRITE_SIZE } from '../art/creatures.js';
import { species as getSpecies } from '../data/species.js';
import { game, dexCounts, formatTime } from '../game/state.js';
import { saveGame } from '../game/save.js';

export class Credits {
  constructor() {
    this.scroll = 0;
    this.time = 0;
    this.done = false;
  }

  enter() {
    audio.play('victory', TRACKS);
    saveGame();
    const counts = dexCounts();
    const p = game.state.player;

    this.lines = [
      '', '',
      'A SONG OF ICE AND MONSTERS',
      '',
      '',
      `${p.name} of Winterfell`,
      'sat the Iron Throne.',
      '',
      'The realm held its breath,',
      'the way it always does,',
      'and then got on with things.',
      '',
      '',
      '-- YOUR REIGN --',
      '',
      `Sigils earned    ${game.state.sigils.length}`,
      `Creatures sworn  ${counts.caught}`,
      `Creatures seen   ${counts.seen}`,
      `Gold dragons     ${p.money}`,
      `Steps walked     ${p.steps}`,
      `Time in the saddle  ${formatTime(p.playtime)}`,
      '',
      '',
      '-- THE ROAD BEHIND --',
      '',
      'Winterfell',
      'The Wolfswood',
      'Moat Cailin',
      'The Riverlands',
      'Riverrun',
      'The Gold Road',
      'The Barrow Deeps',
      'Lannisport',
      'Casterly Rock',
      'The Kingsroad',
      "King's Landing",
      'The Red Keep',
      '',
      '',
      'Winter is still coming.',
      'It always is.',
      '',
      '',
      'Thank you for playing.',
      '',
      '',
      'Press Z to return',
      '', '', '',
    ];
  }

  update(dt) {
    this.time += dt;
    const speed = input.held('a') || input.held('b') ? 46 : 16;
    this.scroll += speed * dt;

    const total = this.lines.length * LINE_HEIGHT;
    if (this.scroll > total + 20) this.done = true;

    if (this.done && input.pressed('a')) {
      audio.sfx('confirm');
      this.manager.transition(() => this.manager.pop());
    }
  }

  draw(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, 160);
    sky.addColorStop(0, '#180d14');
    sky.addColorStop(1, '#3a1d20');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 240, 160);

    // Embers drifting upward.
    ctx.fillStyle = 'rgba(240,170,80,0.6)';
    for (let i = 0; i < 30; i++) {
      const seed = i * 53.3;
      const x = (seed * 2.7) % 240;
      const y = (200 - (seed + this.time * (12 + (i % 5) * 5))) % 180;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 2);
    }

    const dragon = creatureSprite(getSpecies('blackdread'));
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.drawImage(dragon, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 84, 40, 72, 72);
    ctx.restore();

    this.lines.forEach((line, i) => {
      const y = 168 + i * LINE_HEIGHT - this.scroll;
      if (y < -LINE_HEIGHT || y > 160) return;
      drawText(ctx, line, 120 - measure(line) / 2, Math.round(y),
        { color: '#f4e2c0', shadow: '#2a1012' });
    });
  }
}
