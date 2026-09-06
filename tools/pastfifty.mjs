/* What a fight is worth once there is nothing left to learn from one.
 *
 * Fifty is as high as the player's own level goes, and a run gets there with a
 * hundred maps still unwalked. Past that point `gainPlayerExp` returned early
 * and threw the experience away: every duel, every ambush and every leader in
 * the back half of the game paid the rider exactly nothing. The cartridge pays
 * gold instead, on the grounds that what you know is worth money to somebody.
 *
 * Node only - none of this touches a canvas. Run it with:
 *   node tools/pastfifty.mjs
 */
import { game } from '../src/game/state.js';
import {
  gainPlayerExp, expForPlayerLevel, MAX_PLAYER_LEVEL,
} from '../src/game/player.js';

const p = game.state.player;
const rows = [];
const check = (what, ok) => rows.push([what, ok]);

/* Below the cap, experience is experience. */
p.level = 10;
p.exp = expForPlayerLevel(10);
p.money = 100;
const climbing = gainPlayerExp(expForPlayerLevel(12) - p.exp);
check('below the cap a fight still teaches you',
  climbing.levels === 2 && climbing.paid === 0 && p.money === 100 && p.level === 12);

/* At the cap it stops teaching and starts paying. */
p.level = MAX_PLAYER_LEVEL;
p.exp = expForPlayerLevel(MAX_PLAYER_LEVEL);
p.money = 100;
const capped = gainPlayerExp(500);
check('at the cap it pays instead of teaching',
  capped.levels === 0 && capped.paid === 251 && p.money === 351);
check('and it is half of what the fight was worth, plus one',
  capped.paid === Math.floor(500 / 2) + 1);
check('the level does not move', p.level === MAX_PLAYER_LEVEL);

/* Every fight, not just the first: this is the whole back half of the game. */
p.money = 0;
for (let i = 0; i < 20; i++) gainPlayerExp(40);
check('and it pays every time, not once', p.money === 20 * 21);

/* The smallest scrap of a fight is still worth a coin rather than nothing. */
p.money = 0;
const scrap = gainPlayerExp(1);
check('even the smallest fight is worth something', scrap.paid === 1 && p.money === 1);

/* And a purse cannot be walked past its ceiling. */
p.money = 999999;
gainPlayerExp(500);
check('the purse still has a ceiling', p.money === 999999);

let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
process.exit(bad ? 1 : 0);
