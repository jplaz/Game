/* The switch list with nobody on it.
 *
 * The random playtest sat in a wild fight for forty thousand frames with one
 * beast in its party. It had opened the switch list, picked the only beast it
 * had, been told it was already out there, and been handed the same list again
 * with the cursor back on that beast - a loop only B could break, and a hand
 * that never presses B never broke it. With nobody else fit to go out the
 * fight says so now, and when a pick is refused the cursor goes back to
 * somebody who can go.
 *
 * Run it with: node tools/theswitch.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, executablePath } = await import('./chromium.mjs');
// The repository root, wherever this clone happens to live.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
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
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--mute-audio'] });
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
}, 113);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const [i, s, st, b, c] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/game/state.js'),
    import('/src/ui/textbox.js'), import('/src/game/creature.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, dialog: b.dialog, creature: c };
});

const out = await page.evaluate(async () => {
  const { input, scenes, state, dialog, creature } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { for (let i = 0; i < n; i++) { window.__turn(1); await breathe(); } };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;
  for (let i = 0; i < 400 && scene() !== 'Overworld'; i++) await tap(i % 2 ? 'a' : 'start');
  if (scene() !== 'Overworld') return { fail: `stuck on ${scene()}` };
  const ow = scenes.current;
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');

  /* Into a wild fight with the party given, and on to the four choices. */
  const fight = async (party) => {
    state.game.state.party.length = 0;
    for (const p of party) state.game.state.party.push(p);
    ow.startBattle({ kind: 'wild', foe: creature.createCreature('snowpup', 2) });
    for (let i = 0; i < 400 && scene() !== 'Battle'; i++) await turn(1);
    const battle = scenes.current;
    for (let i = 0; i < 200 && battle.menu?.type !== 'action'; i++) {
      if (dialog.busy) await tap('a'); else await turn(1);
    }
    return battle;
  };
  /* SWEAR is the third of the four: down from FIGHT. */
  const toSwitch = async (battle) => {
    await tap('down');
    await tap('a');
    for (let i = 0; i < 120 && !dialog.busy && battle.menu?.type !== 'list'; i++) await turn(1);
  };
  const said = () => (dialog.pages ?? []).flat().join(' ');

  const res = {};
  {
    const battle = await fight([creature.createCreature('direwolf', 20)]);
    res.alone = { atChoices: battle.menu?.type === 'action' };
    await toSwitch(battle);
    res.alone.said = said();
    res.alone.listOpened = battle.menu?.type === 'list';
    for (let i = 0; i < 60 && battle.menu?.type !== 'action'; i++) {
      if (dialog.busy) await tap('a'); else await turn(1);
    }
    res.alone.backAtChoices = battle.menu?.type === 'action';
    battle.foe.creature.hp = 0;             // end it, and quickly
    battle.outcome = 'fled';
  }
  for (let i = 0; i < 2000 && scene() !== 'Overworld'; i++) await tap('a');
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');

  {
    const down = creature.createCreature('direwolf', 20);
    down.hp = 0;
    const out1 = creature.createCreature('direwolf', 20);
    const spare = creature.createCreature('direwolf', 20);
    const battle = await fight([down, out1, spare]);
    res.three = { atChoices: battle.menu?.type === 'action', outFirst: battle.player?.creature === out1 };
    await toSwitch(battle);
    res.three.listOpened = battle.menu?.type === 'list';
    res.three.cursorOnSpare = battle.menu?.index === 2;
    await tap('up'); await tap('up');       // to the one who fell
    res.three.onTheFallen = battle.menu?.index === 0;
    await tap('a');
    res.three.refused = /has no fight left/.test(said());
    for (let i = 0; i < 60 && battle.menu?.type !== 'list'; i++) {
      if (dialog.busy) await tap('a'); else await turn(1);
    }
    res.three.cursorBack = battle.menu?.type === 'list' && battle.menu?.index === 2;
  }
  return { res };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.res;
const rows = [
  ['with one beast, the fight reaches its four choices', r.alone.atChoices === true],
  ['switching says there is nobody else to send', /nobody else fit to send out/.test(r.alone.said ?? '')],
  ['instead of opening a list of one', r.alone.listOpened === false],
  ['and goes back to the four choices', r.alone.backAtChoices === true],
  ['with three, the first one standing goes out', r.three.atChoices === true && r.three.outFirst === true],
  ['the switch list opens on the one who can go', r.three.listOpened === true && r.three.cursorOnSpare === true],
  ['picking the one who fell is refused', r.three.onTheFallen === true && r.three.refused === true],
  ['and the cursor goes back to the one who can go', r.three.cursorBack === true],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
if (bad) console.log(JSON.stringify(r, null, 2));
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
