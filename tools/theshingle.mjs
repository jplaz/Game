/* The shingle at Hardhome.
 *
 * Hardhome has no road. You come by ship, and the only door on it is a jetty
 * down onto the Shivering Sea, which nobody without a keel of their own can
 * walk. A purse spent fighting your way across it used to leave you there for
 * good: the Boatman wanted eighteen hundred gold, or four hundred at the least,
 * and there was nothing left to take it off. He carries you for nothing now,
 * the way the cartridge's own captain always did. Anywhere with a road off it
 * still charges.
 *
 * Run it with: node tools/theshingle.mjs
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
}, 71);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const [i, s, st, m, sc, pt] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/game/state.js'),
    import('/src/data/maps.js'), import('/src/data/scripts.js'), import('/src/data/ports.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, MAPS: m.MAPS, SCRIPTS: sc.SCRIPTS,
    PORTS: pt.PORTS };
});

const out = await page.evaluate(async () => {
  const { input, scenes, state, MAPS, SCRIPTS, PORTS } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { window.__turn(n); await breathe(); };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;
  for (let i = 0; i < 400 && scene() !== 'Overworld'; i++) await tap(i % 2 ? 'a' : 'start');
  if (scene() !== 'Overworld') return { fail: `stuck on ${scene()}` };
  const ow = scenes.current;
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');
  const p = state.game.state.player;

  /* Ask the passage-seller on `mapId` for the first berth on his list, with
     `gold` in your purse, and see where you are standing afterwards. */
  const said = [];
  const ask = async (mapId, gold) => {
    const who = (MAPS[mapId].npcs ?? []).find((n) => n.script === 'ship');
    if (!who) return { missing: mapId };
    ow.loadMap(mapId, { x: 1, y: 1, dir: 'down' });
    p.money = gold;
    said.length = 0;
    const built = ow.makeScriptApi(who);
    built.say = async (text) => { said.push(String(text)); };
    built.choose = async (text, options) => { said.push(`${text} ${options.join(' / ')}`); return 0; };
    await SCRIPTS.ship(built);
    const first = PORTS.find((q) => q.map !== mapId);
    for (let i = 0; i < 240 && ow.map.id !== first.map; i++) await turn(1);
    for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');
    return { to: first.map, fare: first.fare, at: ow.map.id, left: p.money, said: said.join(' | ') };
  };

  const res = {};
  res.shingle = await ask('hardhome', 62);
  res.quayBroke = await ask('dragonstone', 62);
  res.quayPaid = await ask('dragonstone', 900);
  res.onlyWater = (MAPS.hardhome.warps ?? []).every((w) => MAPS[w.to]?.sea);
  return { res };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.res;
const rows = [
  ['every way off Hardhome on foot goes into open water', r.onlyWater === true],
  ['the Boatman says the passage is free', /\(free\)/.test(r.shingle.said ?? '')],
  ['and carries you off the shingle with sixty-two gold', r.shingle.at === r.shingle.to],
  ['without taking any of it', r.shingle.left === 62],
  ['a quay with a road off it still names its fare', /\(\d+g\)/.test(r.quayBroke.said ?? '')],
  ['and turns away a purse that cannot pay it', r.quayBroke.at === 'dragonstone' && r.quayBroke.left === 62],
  ['and takes the fare from one that can', r.quayPaid.at === r.quayPaid.to
    && r.quayPaid.left === 900 - r.quayPaid.fare],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
if (bad) console.log(JSON.stringify(r, null, 2));
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
