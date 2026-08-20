// A small scene stack with screen fades. Scenes implement any of
// enter/exit/update/draw; `draw` on a stacked scene is called for every scene
// below it too, so menus can sit over the overworld.

export class SceneManager {
  constructor() {
    this.stack = [];
    this.fade = { active: false, alpha: 0, direction: 0, speed: 2.4, color: '#000000', onMid: null };
    this.pending = null;
  }

  get current() {
    return this.stack[this.stack.length - 1] ?? null;
  }

  push(scene) {
    this.current?.pause?.();
    this.stack.push(scene);
    scene.manager = this;
    scene.enter?.();
  }

  pop() {
    const scene = this.stack.pop();
    scene?.exit?.();
    this.current?.resume?.();
    return scene;
  }

  replace(scene) {
    while (this.stack.length) this.pop();
    this.push(scene);
  }

  /** Fades out, runs `action` at black, then fades back in. */
  transition(action, { color = '#000000', speed = 2.6 } = {}) {
    this.fade = { active: true, alpha: 0, direction: 1, speed, color, onMid: action };
  }

  get busy() {
    return this.fade.active;
  }

  update(dt) {
    if (this.fade.active) {
      this.fade.alpha += this.fade.direction * this.fade.speed * dt;
      if (this.fade.direction > 0 && this.fade.alpha >= 1) {
        this.fade.alpha = 1;
        this.fade.direction = -1;
        const action = this.fade.onMid;
        this.fade.onMid = null;
        action?.();
      } else if (this.fade.direction < 0 && this.fade.alpha <= 0) {
        this.fade.alpha = 0;
        this.fade.active = false;
      }
      // Scenes still tick during a fade so animations do not freeze, but they
      // do not receive input — scenes check `manager.busy` for that.
    }
    this.current?.update?.(dt);
  }

  draw(ctx) {
    // Find the lowest scene that paints a full background, and draw upward.
    let start = this.stack.length - 1;
    while (start > 0 && this.stack[start].transparent) start--;
    for (let i = start; i < this.stack.length; i++) {
      this.stack[i].draw?.(ctx);
    }

    if (this.fade.alpha > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.fade.alpha);
      ctx.fillStyle = this.fade.color;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
  }
}

export const scenes = new SceneManager();
