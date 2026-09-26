/* The seats.
 *
 * Ten people in this game hold a sigil, and every one of them is fought in
 * person, in a duel. Only the creature battle ever handed a sigil over, and
 * nothing in the game starts a creature battle against a lord - so in the
 * browser build nobody ever took a sigil. The wardens at the Bloody Gate, the
 * Roseroad, the Prince's Pass and the Stormlands never stood aside, the
 * leaders who want another's sigil first waited for ever, and the queen never
 * sent for you. The drivers that play the ending put the sigils in your hand
 * themselves, so none of them could see it.
 *
 * This fights each of the ten through the duel the game really opens - made
 * easy, since what is being tested is what happens after the win - and asks
 * whether the sigil is yours at the end of it.
 *
 * Node only. Run it with: node tools/theseats.mjs
 */
import { game, newGame } from '../src/game/state.js';
import { scenes } from '../src/engine/scenes.js';
import { input } from '../src/engine/input.js';
import { TRAINERS, trainerAsDuellist } from '../src/data/trainers.js';
import { Duel } from '../src/scenes/duel.js';

/* The same fight every run: a driver that passes on some runs and not others
   says nothing about the game. */
{
  let a = 173;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rows = [];
const check = (what, ok) => rows.push([what, ok]);
const STEP = 1 / 60;

const frame = async () => {
  input.tick(STEP);
  scenes.update(STEP);
  input.endFrame();
  await new Promise((r) => { setTimeout(r, 0); });
};

/* A press is a press: down for a few frames, then up. */
const tap = async (key) => {
  input.press(key);
  for (let i = 0; i < 3; i++) await frame();
  input.release(key);
  for (let i = 0; i < 3; i++) await frame();
};

const leaders = Object.entries(TRAINERS).filter(([, t]) => t.sigil);
check(`ten people hold a sigil (${leaders.length})`, leaders.length === 10);

game.state = newGame('A');
for (const [id, t] of leaders) {
  while (scenes.stack.length) scenes.pop();
  scenes.push({ name: 'floor' });
  /* The leader as the game builds them, with the fight taken out of them. */
  const def = { ...trainerAsDuellist(id), vigour: 1, guard: 0 };
  const ended = { outcome: null };
  scenes.push(new Duel({ def, onEnd: (outcome) => { ended.outcome = outcome; } }));
  for (let f = 0; f < 6000 && ended.outcome === null; f++) await tap('a');
  check(`beating ${t.name} ends the duel in your favour`, ended.outcome === 'won');
  check(`and ${t.name}'s ${t.sigil} sigil is yours`, game.state.sigils.includes(t.sigil));
}
check(`all ten sigils taken (${game.state.sigils.join(' ')})`, game.state.sigils.length === 10);

let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
process.exit(bad ? 1 : 0);
