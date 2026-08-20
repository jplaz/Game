// Entry point: canvas setup, the fixed-timestep loop, and the first scene.

import { input } from './engine/input.js';
import { audio } from './engine/audio.js';
import { scenes } from './engine/scenes.js';
import { Title } from './scenes/title.js';

const WIDTH = 240;
const HEIGHT = 160;
const STEP = 1 / 60;
const MAX_FRAME = 0.25; // never simulate more than a quarter second at once

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

/** Scales the canvas to the largest whole multiple that fits the window. */
function resize() {
  const shellPadding = 20;
  const availableW = window.innerWidth - shellPadding;
  const availableH = window.innerHeight - (window.matchMedia('(pointer: coarse)').matches ? 210 : 80);
  const scale = Math.max(1, Math.floor(Math.min(availableW / WIDTH, availableH / HEIGHT)));
  canvas.style.width = `${WIDTH * scale}px`;
  canvas.style.height = `${HEIGHT * scale}px`;
}

window.addEventListener('resize', resize);
resize();

input.attach(window);
const touchPad = document.getElementById('touch');
input.attachTouch(touchPad);
// The on-screen pad is only useful without a keyboard.
touchPad.hidden = !window.matchMedia('(pointer: coarse)').matches;

// Audio can only start from a gesture, so arm it on the first input of any kind.
const armAudio = () => {
  audio.init();
  audio.resume();
};
for (const event of ['keydown', 'pointerdown', 'touchstart']) {
  window.addEventListener(event, armAudio, { once: true });
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    const muted = audio.toggleMute();
    console.log(muted ? 'Muted' : 'Unmuted');
  }
});

scenes.push(new Title());

let previous = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);

  const elapsed = Math.min(MAX_FRAME, (now - previous) / 1000);
  previous = now;
  accumulator += elapsed;

  while (accumulator >= STEP) {
    input.tick(STEP);
    scenes.update(STEP);
    input.endFrame();
    accumulator -= STEP;
  }

  audio.update();
  scenes.draw(ctx);
}

requestAnimationFrame(frame);

// Surface errors that would otherwise vanish into an async script.
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});
