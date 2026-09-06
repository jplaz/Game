/* The Signet Ring.
 *
 * It sat in the item table saying it was proof you rode on Winterfell's
 * business. Nobody handed it over and nothing looked for it: a key item that
 * was neither a key nor an item anybody could hold. Jory gives it now, at the
 * moment you are cleared to ride south, and north of the Neck it is what an
 * innkeep looks at instead of your purse.
 *
 * Run it with: node tools/thering.mjs
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
}, 53);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const [i, s, st, b, m, sc] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/game/state.js'),
    import('/src/ui/textbox.js'), import('/src/data/maps.js'), import('/src/data/scripts.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, dialog: b.dialog,
    MAPS: m.MAPS, regionOf: m.regionOf, SCRIPTS: sc.SCRIPTS };
});

const out = await page.evaluate(async () => {
  const { input, scenes, state, MAPS, regionOf, SCRIPTS } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { window.__turn(n); await breathe(); };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;
  for (let i = 0; i < 400 && scene() !== 'Overworld'; i++) await tap(i % 2 ? 'a' : 'start');
  if (scene() !== 'Overworld') return { fail: `stuck on ${scene()}` };
  const ow = scenes.current;
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');
  const res = {};
  const p = state.game.state.player;

  /* A harness that runs one script and writes down what was said. */
  const said = [];
  const run = async (mapId, npc, pick = 0, duelOutcome = 'won') => {
    ow.loadMap(mapId, { x: 1, y: 1, dir: 'down' });
    said.length = 0;
    const built = ow.makeScriptApi(npc);
    built.say = async (text) => { said.push(String(text)); };
    built.choose = async (text, options) => { said.push(String(text)); return pick; };
    built.duel = async () => duelOutcome;
    built.healParty = () => { for (const c of state.game.state.party) c.hp = 999; };
    await SCRIPTS[npc.script](built);
    return said.join(' | ');
  };
  const jory = (MAPS.winterfell.npcs ?? []).find((n) => n.script === 'joryGate');
  const innkeep = (MAPS.winterfellInn.npcs ?? []).find((n) => n.script === 'townInnkeep');
  const southInn = (MAPS.sunspearInn.npcs ?? []).find((n) => n.script === 'townInnkeep');
  res.foundThem = Boolean(jory) && Boolean(innkeep) && Boolean(southInn);
  if (!res.foundThem) return { res };

  /* Nobody has it to start with. */
  state.game.state.bag = {};
  state.game.state.flags = {};
  p.money = 500;
  res.startsWithout = state.itemCount('houseRing');

  /* And Jory does not hand it over until you have beaten him. */
  res.beforeStarter = await run('winterfell', jory);
  res.stillWithout = state.itemCount('houseRing');

  /* Beat him, and he does. */
  state.setFlag('gotStarter');
  res.won = await run('winterfell', jory, 0, 'won');
  res.hasRing = state.itemCount('houseRing');

  /* And not twice. */
  res.again = await run('winterfell', jory, 0, 'won');
  res.oneRing = state.itemCount('houseRing');

  /* North of the Neck the innkeep does not put a hand out. */
  p.money = 500;
  res.northWithRing = await run('winterfellInn', innkeep, 0);
  res.northCost = 500 - p.money;
  res.northRegion = regionOf('winterfellInn');

  /* South of it, a bed is fifty gold, ring or no ring. */
  p.money = 500;
  res.southWithRing = await run('sunspearInn', southInn, 0);
  res.southCost = 500 - p.money;
  res.southRegion = regionOf('sunspearInn');

  /* And without it, the North charges like everywhere else. */
  state.takeItem('houseRing', 1);
  p.money = 500;
  res.northWithout = await run('winterfellInn', innkeep, 0);
  res.northCostWithout = 500 - p.money;
  return { res };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.res;
const has = (s, re) => typeof s === 'string' && re.test(s);
const rows = [
  ['Jory, an inn north and an inn south are all where they should be', r.foundThem === true],
  ['you do not start with the ring', r.startsWithout === 0],
  ['and Jory keeps it until he has seen you fight',
    has(r.beforeStarter, /Maester Luwin wants you/) && r.stillWithout === 0],
  ['beat him and he hands it over', has(r.won, /Lord Rickard's signet/) && r.hasRing === 1],
  ['and there is only ever one of it', r.oneRing === 1],
  ['north of the Neck the innkeep does not put a hand out',
    has(r.northWithRing, /does not put a hand out/) && r.northCost === 0],
  ['south of it a bed is fifty gold, ring or no ring',
    has(r.southWithRing, /noise downstairs/) && r.southCost === 50],
  ['and without the ring the North charges like everywhere else', r.northCostWithout === 50],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
console.log(`  north (${r.northRegion}) cost ${r.northCost}, south (${r.southRegion}) cost ${r.southCost},`,
  `north without the ring ${r.northCostWithout}`);
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
