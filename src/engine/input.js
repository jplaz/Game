// Action-based input. Physical keys are mapped to abstract actions so the rest
// of the game never mentions a key code, and the on-screen pad can feed the
// same actions on touch devices.

const KEY_MAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'a', Space: 'a', KeyJ: 'a',
  KeyX: 'b', KeyK: 'b', Backspace: 'b',
  Enter: 'start', Escape: 'start',
  ShiftLeft: 'select', ShiftRight: 'select',
  KeyR: 'ride',
};

// Menus feel wrong without key repeat: hold a direction and it should scroll.
const REPEAT_DELAY = 0.28;
const REPEAT_RATE = 0.09;

class Input {
  constructor() {
    this.down = new Set();
    this.justPressed = new Set();
    this.heldFor = new Map();
    this.repeated = new Set();
    this.anyKeyHit = false;
  }

  attach(target = window) {
    target.addEventListener('keydown', (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();
      if (!e.repeat) this.press(action);
    });
    target.addEventListener('keyup', (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();
      this.release(action);
    });
    // Losing focus mid-walk would otherwise leave a direction stuck down.
    target.addEventListener('blur', () => this.releaseAll());
  }

  /** Wires the DOM on-screen gamepad, if present. */
  attachTouch(root) {
    if (!root) return;
    for (const button of root.querySelectorAll('[data-key]')) {
      const action = KEY_MAP[keyCodeFor(button.dataset.key)];
      if (!action) continue;
      const start = (e) => { e.preventDefault(); this.press(action); };
      const end = (e) => { e.preventDefault(); this.release(action); };
      button.addEventListener('pointerdown', start);
      button.addEventListener('pointerup', end);
      button.addEventListener('pointerleave', end);
      button.addEventListener('pointercancel', end);
    }
  }

  press(action) {
    if (!this.down.has(action)) {
      this.down.add(action);
      this.justPressed.add(action);
      this.heldFor.set(action, 0);
    }
    this.anyKeyHit = true;
  }

  release(action) {
    this.down.delete(action);
    this.heldFor.delete(action);
  }

  releaseAll() {
    this.down.clear();
    this.heldFor.clear();
  }

  /** Advances repeat timers. Called once per fixed update, before scenes run. */
  tick(dt) {
    this.repeated.clear();
    for (const [action, elapsed] of this.heldFor) {
      const next = elapsed + dt;
      this.heldFor.set(action, next);
      if (elapsed < REPEAT_DELAY && next >= REPEAT_DELAY) {
        this.repeated.add(action);
      } else if (next >= REPEAT_DELAY) {
        const since = (next - REPEAT_DELAY) % REPEAT_RATE;
        if (since < dt) this.repeated.add(action);
      }
    }
  }

  /** Clears one-frame state. Called after scenes run. */
  endFrame() {
    this.justPressed.clear();
    this.anyKeyHit = false;
  }

  held(action) { return this.down.has(action); }
  pressed(action) { return this.justPressed.has(action); }
  /** True on the initial press and again while the key auto-repeats. */
  repeat(action) { return this.justPressed.has(action) || this.repeated.has(action); }

  /**
   * First held direction, for grid movement. Falls back to a direction that was
   * pressed and released within a single frame, so a quick tap still takes a
   * step instead of being swallowed.
   */
  direction() {
    for (const dir of ['up', 'down', 'left', 'right']) {
      if (this.down.has(dir)) return dir;
    }
    for (const dir of ['up', 'down', 'left', 'right']) {
      if (this.justPressed.has(dir)) return dir;
    }
    return null;
  }
}

function keyCodeFor(key) {
  if (key.length === 1) return /[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : key;
  if (key.startsWith('Arrow')) return key;
  return key;
}

export const input = new Input();
