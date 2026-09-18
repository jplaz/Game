/* A duel you can always get out of.
 *
 * The browser playtest twice reported the game sitting in a Duel for forty
 * thousand frames, and the second time it said what it saw: round nought, no
 * menu up, no box open, nothing waiting on the clock - the fight had not got
 * as far as its first question. This opens a roadside duel the way the
 * overworld does, through the manager's fade, and plays it with the
 * playtest's own duel hand until it ends or it plainly will not.
 *
 * Node only. Run it with: node tools/thedraw.mjs
 */
import { game, newGame } from '../src/game/state.js';
import { scenes } from '../src/engine/scenes.js';
import { input } from '../src/engine/input.js';
import { dialog } from '../src/ui/textbox.js';
import { rng } from '../src/engine/rng.js';
import { makeRoamer } from '../src/data/duellists.js';
import { Duel } from '../src/scenes/duel.js';

const rows = [];
const check = (what, ok) => rows.push([what, ok]);
const STEP = 1 / 60;

const frame = async () => {
  input.tick(STEP);
  scenes.update(STEP);
  input.endFrame();
  await new Promise((r) => { setTimeout(r, 0); });
};

/* The playtest's duel hand: a direction most frames, A once in twenty-four,
   never B. */
let a = 0x9e3779b9;
const roll = (n) => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) / 4294967296 * n) | 0; };
const ACTIONS = ['up', 'down', 'left', 'right', 'a', 'b'];
let holding = null;
const hold = (action) => {
  if (action === 'a' || action === 'b') {
    if (holding) input.release(holding);
    input.press(action);
    holding = action;
    return;
  }
  if (holding === action) return;
  if (holding) input.release(holding);
  if (action) input.press(action);
  holding = action;
};

/* One roadside duel, opened through the fade like startAmbush does. */
const openRoadDuel = (level, seed) => {
  game.state = newGame('A');
  rng.seed?.(seed);
  while (scenes.stack.length) scenes.pop();
  scenes.push({ name: 'floor' });
  const def = makeRoamer('bandit', level, (list) => rng.pick(list));
  let ended = null;
  scenes.transition(async () => {
    scenes.push(new Duel({ def, onEnd: (outcome) => { ended = outcome; } }));
  }, { color: '#1a1016' });
  return () => ended;
};

const state = () => {
  const d = scenes.current;
  if (!(d instanceof Duel)) return `not in a duel (${scenes.current?.constructor?.name ?? scenes.current?.name})`;
  return `round ${d.round}, menu ${d.menu ? d.menu.type : 'none'}, timer ${d.timer.toFixed(2)}, `
    + `box ${dialog.visible ? (dialog.standing ? 'standing' : 'open') : 'shut'}, outcome ${d.outcome}, `
    + `you ${d.you.hp}/${d.you.maxHp} wind ${d.you.wind}, foe ${d.foe.hp}`;
};

/* --- a hundred roadside duels, each played to an end ---------------------- */
let stalled = 0, longest = 0, first = null;
for (let n = 0; n < 100; n++) {
  const outcome = openRoadDuel(2 + (n % 5), 1000 + n);
  let f = 0, rounds = 0;
  for (; f < 20000; f++) {
    hold(f % 24 === 0 ? 'a' : ACTIONS[roll(4)]);
    await frame();
    if (scenes.current instanceof Duel) rounds = scenes.current.round;
    if (outcome() !== null && !(scenes.current instanceof Duel)) break;
  }
  hold(null);
  if (f > longest) longest = f;
  if (f >= 20000) {
    stalled++;
    if (!first) first = `duel ${n}: ${state()}, ${rounds} rounds`;
  }
}
check(`a hundred roadside duels each come to an end (longest ${longest} frames)`, stalled === 0);
if (first) console.log(`  stuck: ${first}`);

let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
process.exit(bad ? 1 : 0);
