// Naming your hall. The lettered keyboard again, on its own for a moment.

import { NamePad } from '../ui/namepad.js';
import { audio } from '../engine/audio.js';
import { holdfast, renameHoldfast } from '../game/holdfast.js';

export class HallName {
  /** config: { onEnd } */
  constructor(config = {}) {
    this.config = config;
    const current = holdfast().name;
    this.pad = new NamePad({
      prompt: 'What is this hall called?',
      initial: '',
      fallback: current,
    });
  }

  update(dt) {
    const chosen = this.pad.update(dt);
    if (chosen === null) return;
    renameHoldfast(chosen);
    audio.sfx('confirm');
    this.manager.transition(() => {
      this.manager.pop();
      this.config.onEnd?.(chosen);
    });
  }

  draw(ctx) {
    ctx.fillStyle = '#141a2c';
    ctx.fillRect(0, 0, 240, 160);
    this.pad.draw(ctx);
  }
}
