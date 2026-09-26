/* One person's fate, not their whole kind's.
 *
 * Forty-six people in this world fight as the "sellsword" archetype - a drunk
 * in Lannisport's inn, a bravo in Braavos, a son of the Harpy in Meereen, a
 * captain on the Stepstones - and what happened to one of them was kept under
 * "sellsword". Beat the drunk and the other forty-five met you with "Go on,
 * then"; kill him and all forty-six were gone from the world. Each is kept as
 * themselves now, and anything that reads the dead back to you - Arya's list,
 * Jaqen's offer - reads them by name.
 *
 * Run it with: node tools/thefates.mjs
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
}, 131);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const [i, s, st, sc] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/game/state.js'),
    import('/src/data/scripts.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, SCRIPTS: sc.SCRIPTS };
});

const out = await page.evaluate(async () => {
  const { input, scenes, state, SCRIPTS } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { for (let i = 0; i < n; i++) { window.__turn(1); await breathe(); } };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;
  for (let i = 0; i < 400 && scene() !== 'Overworld'; i++) await tap(i % 2 ? 'a' : 'start');
  if (scene() !== 'Overworld') return { fail: `stuck on ${scene()}` };
  const ow = scenes.current;
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');

  /* Somebody of a kind, found live on their map, spoken to with a fight that
     always goes your way and a last question that always finishes it. */
  const said = [];
  const meet = async (mapId, name, finish) => {
    ow.loadMap(mapId, { x: 1, y: 1, dir: 'down' });
    await turn(2);
    const person = ow.npcs.find((n) => n.name === name);
    if (!person) return { missing: `${name} on ${mapId}` };
    said.length = 0;
    const api = ow.makeScriptApi(person);
    let fought = false;
    api.say = async (text) => { said.push(String(text)); };
    api.choose = async (text, options) => { said.push(String(text)); return finish ? options.length - 1 : 0; };
    api.duel = async () => { fought = true; return 'won'; };
    if (!person.hidden) await SCRIPTS[person.script](api);
    return { hidden: Boolean(person.hidden), fought, said: said.join(' | '), id: person.id };
  };

  state.game.state.flags = {};
  state.game.state.dead = [];
  const res = {};
  res.drunk = await meet('lannisportInn', 'A Drunk Sellsword', true);
  res.bravo = await meet('braavos', 'A Bravo', false);
  res.bravoAgain = await meet('braavos', 'A Bravo', false);
  res.drunkAgain = await meet('lannisportInn', 'A Drunk Sellsword', false);

  /* And Arya reads the dead back by name. */
  const { MAPS } = await import('/src/data/maps.js');
  let aryaAt = null;
  for (const [id, m] of Object.entries(MAPS)) {
    const k = (m.npcs ?? []).findIndex((n) => n.script === 'aryaList');
    if (k >= 0) { aryaAt = [id, m.npcs[k].name]; break; }
  }
  if (aryaAt) {
    ow.loadMap(aryaAt[0], { x: 1, y: 1, dir: 'down' });
    await turn(2);
    const her = ow.npcs.find((n) => n.name === aryaAt[1]);
    said.length = 0;
    const api = ow.makeScriptApi(her);
    api.say = async (text) => { said.push(String(text)); };
    await SCRIPTS.aryaList(api);
    res.arya = said.join(' | ');
  }
  res.dead = [...(state.game.state.dead ?? [])];
  return { res };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.res;
const rows = [
  ['the drunk sellsword in Lannisport fights and is finished', r.drunk.fought === true],
  ['the bravo in Braavos, the same kind of man, is still there', r.bravo.hidden === false],
  ['and still fights you', r.bravo.fought === true],
  ['having beaten him, he says so', r.bravoAgain.fought === false],
  ['and the drunk stays dead', r.drunkAgain.hidden === true],
  ['only the one of them is on the list of the dead', r.dead.length === 1],
  ['Arya reads him back by his own name', /A Drunk Sellsword/.test(r.arya ?? '')],
  ['and not as the kind he was filed under', !/Arya: Sellsword\b|duel_/.test(r.arya ?? '')],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
if (bad) console.log(JSON.stringify(r, null, 2));
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
