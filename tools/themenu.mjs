/* A menu you can always close.
 *
 * The browser playtest sat in the main menu for forty thousand frames with
 * the log open: the log and the houses were drawn and never read, so no key
 * did anything in either of them and a player who opened one had opened it
 * for good. This opens the menu, goes into every page on it, and asks that B
 * brings you back and B again puts the menu away.
 *
 * Node only. Run it with: node tools/themenu.mjs
 */
import { game, newGame } from '../src/game/state.js';
import { scenes } from '../src/engine/scenes.js';
import { input } from '../src/engine/input.js';
import { dialog } from '../src/ui/textbox.js';
import { MainMenu } from '../src/scenes/menu.js';

const rows = [];
const check = (what, ok) => rows.push([what, ok]);
const STEP = 1 / 60;

const frame = async () => {
  input.tick(STEP);
  scenes.update(STEP);
  input.endFrame();
  await new Promise((r) => { setTimeout(r, 0); });
};
const tap = async (key, frames = 4) => {
  input.press(key);
  await frame();
  input.release(key);
  for (let i = 1; i < frames; i++) await frame();
};
/* Read whatever the box has to say, however many presses that takes. */
const readOut = async () => {
  for (let i = 0; i < 40 && dialog.busy; i++) await tap('a', 6);
};

const PAGES = ['PARTY', 'GEAR', 'BAG', 'LOG', 'HOUSES', 'BESTIARY', 'SIGILS', 'CARD'];

game.state = newGame('Tester');
for (let i = 0; i < PAGES.length; i++) {
  while (scenes.stack.length) scenes.pop();
  scenes.push({ name: 'floor' });
  const menu = new MainMenu();
  scenes.push(menu);
  await frame();
  for (let d = 0; d < i; d++) await tap('down');
  await tap('a');
  await readOut();                          /* "You have no creatures yet." and the like */
  const opened = menu.view;
  /* A page that would not open - the party, with nobody in it - says so and
     leaves you at the root, where one B is the door. */
  let backAtRoot = true;
  if (opened !== 'root') {
    await tap('b');
    await readOut();
    backAtRoot = scenes.current === menu && menu.view === 'root';
  }
  await tap('b');
  await frame();
  const shut = scenes.current !== menu;
  check(`${PAGES[i]}: ${opened === 'root' ? 'says why not' : `opens (${opened}), B brings you back`}, and B shuts the menu`,
    backAtRoot && shut);
}

let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
process.exit(bad ? 1 : 0);
