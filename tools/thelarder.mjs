/* Food you can actually eat.
 *
 * Five dishes, each with a healing value written on it from the day it was
 * authored, and no way in the game to ever eat one: cooking put a number in a
 * cupboard in your hall, and the only thing that number could do was be a
 * dish on a table at a feast. "It will keep until you need it," says the cook,
 * and you could never need it.
 *
 * Run it with: node tools/thelarder.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const ROOT = '/home/user/Game';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const target = join(ROOT, normalize(path === '/' ? '/index.html' : path));
  if (!target.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => { server.listen(0, r); });
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 480, height: 400 } });
const thrown = [];
page.on('pageerror', (e) => thrown.push(String(e.message).split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') thrown.push('console: ' + m.text().split('\n')[0]); });
await page.addInitScript((seed) => {
  let a = seed >>> 0;
  Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let now = 0; let waiting = [];
  window.requestAnimationFrame = (cb) => waiting.push(cb);
  window.cancelAnimationFrame = () => {};
  performance.now = () => now; Date.now = () => now;
  window.__turn = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 60; const due = waiting; waiting = []; for (const cb of due) cb(now); } };
}, 83);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const [i, s, st, b, hf, it] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/game/state.js'),
    import('/src/ui/textbox.js'), import('/src/game/holdfast.js'), import('/src/data/items.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, dialog: b.dialog,
    hf, ITEMS: it.ITEMS, POCKETS: it.POCKETS };
});

const out = await page.evaluate(async () => {
  const { input, scenes, state, hf, ITEMS, POCKETS } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { window.__turn(n); await breathe(); };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;
  for (let i = 0; i < 400 && scene() !== 'Overworld'; i++) await tap(i % 2 ? 'a' : 'start');
  if (scene() !== 'Overworld') return { fail: `stuck on ${scene()}` };
  const ow = scenes.current;
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');
  const res = {};

  /* Every dish is a thing you can hold, in a pouch of its own. */
  res.dishes = Object.keys(hf.DISHES);
  res.missing = res.dishes.filter((id) => !ITEMS[id]);
  res.healing = res.dishes.filter((id) => (ITEMS[id]?.use?.amount ?? 0) > 0);
  res.matches = res.dishes.every((id) => ITEMS[id]?.use?.amount === hf.DISHES[id].heal);
  res.pocket = POCKETS.includes('larder')
    && res.dishes.every((id) => ITEMS[id]?.pocket === 'larder');

  /* Cook one, and it is in your pack rather than in a cupboard. */
  hf.grantHoldfast('holdfast', 'Snowhome');
  hf.install('hearth');
  state.game.state.bag = {};
  for (const [what, n] of Object.entries({ venison: 5, spice: 1, wine: 1 })) hf.gather(what, n);
  res.canCook = hf.canCookDish('feastRoast');
  hf.cook('feastRoast');
  res.inPack = state.itemCount('feastRoast');
  /* A roast boar is three venison, so five in the larder leaves two. */
  res.larderSpent = hf.ingredientCount('venison');

  /* And eating one mends what you feed it to. Driven through the bag itself -
     open the menu, find the larder, pick the dish, pick who eats it - because
     the wiring being right in the data proves nothing about the pouch a player
     actually opens. */
  const { createCreature } = await import('/src/game/creature.js');
  const { maxHp } = await import('/src/game/creature.js');
  state.game.state.party.length = 0;
  const wolf = createCreature('direwolf', 20);
  wolf.hp = 5;
  state.game.state.party.push(wolf);
  const hungry = wolf.hp;
  const before = state.itemCount('feastRoast');

  await tap('start');
  for (let i = 0; i < 20 && scene() !== 'MainMenu'; i++) await turn(4);
  const menu = scenes.current;
  res.menuOpened = scene();
  /* BAG is the third entry. */
  for (let i = 0; i < 12 && menu.options?.[menu.index] !== 'BAG' && menu.index !== 2; i++) {
    await tap('down');
  }
  await tap('a');
  for (let i = 0; i < 20 && menu.view !== 'bag'; i++) await turn(4);
  res.inBag = menu.view;
  /* Walk the pockets round to the larder. */
  for (let i = 0; i < 8 && POCKETS[menu.pocketIndex] !== 'larder'; i++) await tap('right');
  res.pocketFound = POCKETS[menu.pocketIndex];
  res.rowsHere = menu.bagRows?.() ?? [];
  await tap('a');
  for (let i = 0; i < 40 && menu.view === 'bag' && !menu.script; i++) await turn(4);
  /* Whatever it asks - which creature, and confirm - answer yes. */
  for (let i = 0; i < 60 && (menu.script || menu.view !== 'bag'); i++) await tap('a');
  res.fed = wolf.hp > hungry;
  res.healedTo = wolf.hp;
  res.full = maxHp(wolf);
  res.eaten = before - state.itemCount('feastRoast');
  await tap('b'); await tap('b');
  for (let i = 0; i < 40 && scene() !== 'Overworld'; i++) await tap('b');

  /* A feast still works, and still takes the food off you. */
  state.game.state.bag = {};
  hf.gather('grain', 4);
  hf.cook('broth'); hf.cook('broth');
  res.twoBroths = state.itemCount('broth');
  const feast = hf.holdFeast(['stark'], ['broth']);
  res.feastWorth = feast?.worth ?? null;
  res.brothLeft = state.itemCount('broth');

  /* And a game saved before this had its dinner in the old cupboard. */
  state.game.state.bag = {};
  hf.holdfast().dishes = { lemonCakes: 2 };
  res.oldSaveCount = hf.dishCount('lemonCakes');
  res.movedAcross = state.itemCount('lemonCakes');
  res.cupboardEmptied = hf.holdfast().dishes.lemonCakes;
  return { res };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.res;
const rows = [
  ['every dish is something you can hold', r.missing?.length === 0],
  ['and every one of them feeds you', r.healing?.length === 5],
  ['by exactly what was written on it all along', r.matches === true],
  ['in a pouch of its own', r.pocket === true],
  ['cooking fills the pack, not a cupboard', r.canCook === true && r.inPack === 1],
  ['and spends the larder to do it', r.larderSpent === 2],
  ['the pouch has a larder in it with the food in',
    r.inBag === 'bag' && r.pocketFound === 'larder'
    && (r.rowsHere ?? []).includes('feastRoast')],
  ['and feeding one to a hungry beast mends it, and is eaten',
    r.fed === true && r.eaten === 1],
  ['a feast still serves, and still costs you the food',
    r.twoBroths === 2 && r.feastWorth === 1 && r.brothLeft === 1],
  ['and food saved under the old rules comes across',
    r.oldSaveCount === 2 && r.movedAcross === 2 && r.cupboardEmptied === 0],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
console.log('  dishes:', (r.dishes ?? []).join(' '));
console.log('  cooked', r.inPack, ' feast worth', r.feastWorth, ' old save moved', r.movedAcross);
console.log('  pouch:', r.pocketFound, JSON.stringify(r.rowsHere),
  ' fed to', r.healedTo, 'of', r.full, ' eaten', r.eaten);
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
