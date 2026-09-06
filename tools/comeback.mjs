/* Save, close it, come back.
 *
 * The one thing nothing here has ever tested. Every driver in this directory
 * boots a fresh game, does something, and throws the tab away. Whether what
 * you did is still there tomorrow was checked by nobody.
 *
 * Run it with: node tools/comeback.mjs
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
}, 67);
/* Everything below runs twice against the same tab: once to play and save,
   once after a reload, which is what closing the game and opening it again
   actually is. localStorage is what carries anything across. */
const wire = async () => page.evaluate(async () => {
  const [i, s, st, b, sv] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'),
    import('/src/game/state.js'), import('/src/ui/textbox.js'),
    import('/src/game/save.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, dialog: b.dialog, save: sv };
});

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await wire();

/* ---- the first sitting: start a game, do things, write it down ---------- */
const before = await page.evaluate(async () => {
  const { input, scenes, state, save } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { window.__turn(n); await breathe(); };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;

  /* A tab that has been played in before must not colour this. */
  try { localStorage.clear(); } catch { /* nothing to clear */ }

  for (let i = 0; i < 400 && scene() !== 'Overworld'; i++) await tap(i % 2 ? 'a' : 'start');
  if (scene() !== 'Overworld') return { fail: `stuck on ${scene()}` };
  const ow = scenes.current;
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');

  /* Something to lose. Deliberately spread across the state: the purse, the
     seats, a flag, the party, where you are standing and what the winter has
     got to - the last of which is new and had never been near a save file. */
  const p = state.game.state.player;
  p.money = 4242;
  p.winter = 71;
  p.winterSaid = 3;
  state.awardSigil('wolf');
  state.awardSigil('trout');
  state.setFlag('cs_summons');
  const { createCreature } = await import('/src/game/creature.js');
  state.game.state.party.length = 0;
  state.game.state.party.push(createCreature('direwolf', 24));
  ow.loadMap('riverrun', { x: 8, y: 12, dir: 'left' });
  await turn(10);
  /* Whatever arriving somewhere started - a scene, a letter, somebody on the
     road - has to finish before the pad means anything again. */
  for (let i = 0; i < 2000 && (ow.busy || scene() !== 'Overworld'); i++) await tap('a');

  const snap = () => ({
    money: state.game.state.player.money,
    winter: state.game.state.player.winter,
    sigils: [...state.game.state.sigils],
    flag: state.flag('cs_summons'),
    party: state.game.state.party.map((c) => `${c.speciesId}@${c.level}`),
    at: { ...state.game.state.position },
    stage: state.winterStage(),
  });
  const played = snap();

  /* And save it the way a player does: START, down to SAVE, A. */
  await tap('start');
  for (let i = 0; i < 20 && scene() !== 'MainMenu'; i++) await turn(4);
  const opened = scene();
  /* Walk the cursor to SAVE rather than counting on where it starts. */
  let onSave = -1;
  for (let i = 0; i < 12; i++) {
    if (scenes.current?.options?.[scenes.current.index] === 'SAVE'
        || (scenes.current?.index ?? -1) === 8) { onSave = scenes.current.index; break; }
    await tap('down');
  }
  if (onSave < 0) onSave = scenes.current?.index ?? -1;
  await tap('a');
  for (let i = 0; i < 200 && scenes.current?.script; i++) await turn(4);
  const said = String(window.__game.dialog.pages?.flat().join(' ') ?? '');
  await tap('a');

  let raw = null;
  try { raw = localStorage.getItem('asoiam.save.v1'); } catch { raw = null; }
  return { played, opened, onSave, said, wrote: raw ? raw.length : 0,
    summary: save.saveSummary() };
});
if (before.fail) { console.log(before.fail); await browser.close(); server.close(); process.exit(1); }

/* ---- close it and come back -------------------------------------------- */
await page.reload({ waitUntil: 'load' });
await wire();

const after = await page.evaluate(async () => {
  const { input, scenes, state, save } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { window.__turn(n); await breathe(); };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;

  const res = { stillThere: save.hasSave(), summary: save.saveSummary() };
  /* Whatever the title is showing, and whether it offers to take you back. */
  for (let i = 0; i < 200 && scene() !== 'Title'; i++) await turn(4);
  res.titleScene = scene();
  res.options = [...(scenes.current?.options ?? [])];

  /* Take the first entry, which is CONTINUE when there is a save. One press,
     and then let it get there: the world arrives through a dynamic import and
     a transition, and hammering A meanwhile picks things behind it. */
  await tap('a');
  for (let i = 0; i < 60 && scene() !== 'Overworld'; i++) await turn(20);
  res.landedOn = scene();
  if (scene() !== 'Overworld') return { res };
  const ow = scenes.current;
  for (let i = 0; i < 2000 && ow.busy; i++) await tap('a');
  res.came = {
    money: state.game.state.player.money,
    winter: state.game.state.player.winter,
    sigils: [...state.game.state.sigils],
    flag: state.flag('cs_summons'),
    party: state.game.state.party.map((c) => `${c.speciesId}@${c.level}`),
    at: { ...state.game.state.position },
    stage: state.winterStage(),
  };
  res.onMap = ow.mapId;
  return { res };
});

/* ---- and now the thing a player actually does: never touch SAVE --------- */
await page.reload({ waitUntil: 'load' });
await wire();
const walked = await page.evaluate(async () => {
  const { input, scenes, state } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { window.__turn(n); await breathe(); };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;
  try { localStorage.clear(); } catch { /* nothing to clear */ }
  for (let i = 0; i < 400 && scene() !== 'Overworld'; i++) await tap(i % 2 ? 'a' : 'start');
  if (scene() !== 'Overworld') return { fail: `stuck on ${scene()}` };
  const ow = scenes.current;
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');

  /* An hour's play, in the parts that matter, and not one deliberate save. */
  state.game.state.player.money = 777;
  state.awardSigil('lion');
  ow.loadMap('lannisport', { x: 6, y: 9, dir: 'down' });
  await turn(10);
  for (let i = 0; i < 2000 && (ow.busy || scene() !== 'Overworld'); i++) await tap('a');
  let afterDoor = 0;
  try { afterDoor = (localStorage.getItem('asoiam.save.v1') ?? '').length; } catch { afterDoor = 0; }

  /* And then something after the last door, with the tab going away. */
  state.game.state.player.money = 999;
  window.dispatchEvent(new Event('pagehide'));
  let afterHide = null;
  try { afterHide = JSON.parse(localStorage.getItem('asoiam.save.v1') ?? 'null'); } catch { afterHide = null; }
  return { afterDoor, hidMoney: afterHide?.player?.money ?? null,
    at: { ...state.game.state.position }, sigils: [...state.game.state.sigils] };
});

await page.reload({ waitUntil: 'load' });
await wire();
const returned = await page.evaluate(async () => {
  const { input, scenes, state } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { window.__turn(n); await breathe(); };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;
  for (let i = 0; i < 200 && scene() !== 'Title'; i++) await turn(4);
  const options = [...(scenes.current?.options ?? [])];
  await tap('a');
  for (let i = 0; i < 60 && scene() !== 'Overworld'; i++) await turn(20);
  return { options, landed: scene(),
    money: state.game.state.player.money,
    sigils: [...state.game.state.sigils],
    at: { ...state.game.state.position } };
});
await browser.close();
server.close();
const b = before;
const a = after.res;
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const rows = [
  ['the menu opens on START', b.opened === 'MainMenu'],
  ['and SAVE is where the cursor got to', b.onSave === 8],
  ['it says it wrote something down', /ledger|maester/i.test(b.said ?? '')],
  ['and something was actually written', b.wrote > 100],
  ['it is still there after the tab reloads', a.stillThere === true],
  ['the title offers to take you back', (a.options ?? [])[0] === 'CONTINUE'],
  ['and taking it puts you in the world', a.landedOn === 'Overworld'],
  ['on the map you left', a.came && a.came.at.map === b.played.at.map && a.onMap === b.played.at.map],
  ['standing where you left', a.came && a.came.at.x === b.played.at.x && a.came.at.y === b.played.at.y],
  ['with your purse', a.came && a.came.money === b.played.money],
  ['your seats', a.came && same(a.came.sigils, b.played.sigils)],
  ['what you had already been told', a.came && a.came.flag === b.played.flag],
  ['your beasts', a.came && same(a.came.party, b.played.party)],
  ['and the winter where you left it', a.came && a.came.winter === b.played.winter
    && a.came.stage === b.played.stage],
  /* The half that was missing: a player who never opens the menu. */
  ['walking through a door keeps the game on its own', walked.afterDoor > 100],
  ['and the tab going away keeps whatever came after it', walked.hidMoney === 999],
  ['coming back offers to take you on', (returned.options ?? [])[0] === 'CONTINUE'],
  ['and does, with nobody having chosen SAVE',
    returned.landed === 'Overworld' && returned.money === 999
    && returned.at.map === 'lannisport' && returned.sigils.includes('lion')],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
console.log('  played:', JSON.stringify(b.played));
console.log('  came  :', JSON.stringify(a.came ?? null));
console.log('  title :', JSON.stringify(a.options), ' wrote', b.wrote, 'bytes, said:', (b.said ?? '').slice(0, 60));
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
