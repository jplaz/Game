/* A counter you can always walk away from.
 *
 * The browser playtest reported that the game sat in the Shop for forty
 * thousand frames with nothing blocking it, and that in a hundred and twenty
 * thousand frames of play it never once bought anything over a counter. A menu
 * that can hold on to a player who wants out is the one fault a data checker
 * cannot see and a tester pressing keys can, so this presses the keys.
 *
 * It drives the shipped scene through the shipped scene manager, one frame at
 * a time in the order main.js runs them: tick the input, update the scene, end
 * the frame. Three things are asked. That a scripted player can leave. That a
 * scripted player with money can actually buy something. And that the
 * playtest's own random policy - the one that got stuck - gets out, and how
 * long it takes to.
 *
 * Node only. Run it with: node tools/thecounter.mjs
 */
import { game, newGame, itemCount } from '../src/game/state.js';
import { scenes } from '../src/engine/scenes.js';
import { input } from '../src/engine/input.js';
import { dialog } from '../src/ui/textbox.js';
import { Shop } from '../src/scenes/shop.js';

const rows = [];
const check = (what, ok) => rows.push([what, ok]);
const STEP = 1 / 60;
const STOCK = ['maesterKit', 'poppyMilk', 'weirwoodSap', 'frostTonic'];

/* One frame, the way main.js turns one, and then a breath so that whatever the
   scene awaited gets to run: a script is a promise, and a promise does not
   settle while a loop is turning frames without ever yielding. */
const frame = async () => {
  input.tick(STEP);
  scenes.update(STEP);
  input.endFrame();
  await new Promise((r) => { setTimeout(r, 0); });
};

/* A button is pressed and let go; a direction is held for the frames given. */
const tap = async (key, frames = 4) => {
  input.press(key);
  await frame();
  input.release(key);
  for (let i = 1; i < frames; i++) await frame();
};

const openShop = (money) => {
  game.state = newGame('Tester');
  game.state.player.money = money;
  while (scenes.stack.length) scenes.pop();
  scenes.push({ name: 'floor' });                /* something to be under it */
  const shop = new Shop({ stock: STOCK });
  scenes.push(shop);
  return shop;
};
const inShop = () => scenes.current instanceof Shop;

/* Wait for the box to finish revealing its page, so a press is a press and
   not a skip: a tap that lands mid-reveal is spent showing the rest of the
   line, and every tap after it is then one step out. */
const settled = async () => {
  for (let i = 0; i < 400 && dialog.busy && !dialog.choice; i++) {
    const page = dialog.pages?.[dialog.pageIndex] ?? [];
    if (dialog.revealed >= page.join('\n').length) break;
    await frame();
  }
};

/* A question is two presses, not one: the prompt reveals, a press puts the
   menu up under it, and only then does a press pick. The first draft of this
   pressed once and every tap after it was one step out - which is worth
   knowing on its own, because it means leaving from the shelf is B, B, B. */
const read = async () => { await settled(); await tap('a'); };
const answer = async (index) => {
  await settled();
  await tap('a');                           /* the menu comes up */
  for (let i = 0; i < index; i++) await tap('down');
  await tap('a');
};

/* --- a scripted player, skint, walks in and walks out ---------------------- */
{
  const shop = openShop(5);
  await frame();
  await answer(0);           /* Buy */
  await tap('a');            /* the first thing on the shelf - cannot afford */
  await read();              /* "You cannot afford that." */
  await frame();
  check('a skint player who picks something is told so and given the list back',
    inShop() && shop.mode === 'list' && !shop.script);
  await tap('b');            /* back to "What do you need?" */
  await settled();
  await tap('b');            /* the menu comes up */
  await tap('b');            /* Leave */
  await frame();
  check('and B, B, B from the shelf is the door', !inShop());
}

/* --- a scripted player with money buys one of something -------------------- */
{
  const shop = openShop(3000);
  await frame();
  await answer(0);           /* Buy */
  await tap('a');            /* the first thing */
  await frame();
  check('picking something you can afford asks how many', shop.mode === 'quantity');
  await tap('a');            /* one, then */
  await read();              /* "A pleasure." */
  await frame();
  check('and one of it is in the pouch', itemCount(STOCK[0]) === 1);
  check('and it was paid for', game.state.player.money < 3000);
  await tap('b');
  await settled();
  await tap('b');
  await tap('b');
  await frame();
  check('and the door still works afterwards', !inShop());
}

/* --- the playtest's own hand ----------------------------------------------
 *
 * Exactly its policy: one key a frame, a button let go and pressed again
 * every frame, a direction kept held, and B one frame in six on top of the
 * six it rolls between. This is the hand that sat in the shop for forty
 * thousand frames. */
{
  let a = 0x9e3779b9;
  const roll = (n) => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) / 4294967296 * n) | 0; };
  const ACTIONS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];
  const BUTTON = new Set(['a', 'b', 'start', 'select']);
  let holding = null;
  const hold = (action) => {
    if (action && BUTTON.has(action)) {
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

  const shop = openShop(5);
  let left = -1;
  for (let f = 0; f < 40000; f++) {
    hold(roll(6) === 0 ? 'b' : ACTIONS[roll(6)]);
    await frame();
    if (!inShop()) { left = f; break; }
  }
  if (left < 0) {
    console.log('  stuck: mode', shop.mode, 'script', !!shop.script, 'dialog busy',
      dialog.busy, 'revealed', dialog.revealed, 'choice', !!dialog.choice,
      'pending', !!dialog.pendingChoice, 'visible', dialog.visible, 'standing', dialog.standing);
  }
  check(`the playtest's random hand gets out of a shop it cannot afford (${left < 0 ? 'never' : left + ' frames'})`,
    left >= 0);
  check('and does so inside a few seconds of play, not minutes', left >= 0 && left < 1800);
  hold(null);
}

let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
process.exit(bad ? 1 : 0);
