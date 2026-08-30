// Naming a ship. The lettered keyboard again, on its own for a moment.
//
// Offered once, when she is new. A ship somebody has named is a ship they will
// be sorry to lose, which is the entire reason game/ship.js makes a hull a
// number that does not come back.

import { NamePad } from '../ui/namepad.js';
import { audio } from '../engine/audio.js';
import { shipName, nameShip, shipDef } from '../game/ship.js';

export class ShipName {
  /** config: { onEnd } */
  constructor(config = {}) {
    this.config = config;
    this.pad = new NamePad({
      prompt: 'What will you call her?',
      initial: '',
      fallback: shipDef()?.name ?? shipName(),
    });
  }

  update(dt) {
    const chosen = this.pad.update(dt);
    if (chosen === null) return;
    nameShip(chosen);
    audio.sfx('confirm');
    this.manager.transition(() => {
      this.manager.pop();
      this.config.onEnd?.(chosen);
    });
  }

  draw(ctx) {
    ctx.fillStyle = '#101c2c';        // a colder ground than the hall's
    ctx.fillRect(0, 0, 240, 160);
    this.pad.draw(ctx);
  }
}
