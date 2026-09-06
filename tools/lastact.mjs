/* The last act, played: the raven at nine seats, the hall the first time you
   climb it, and everything after the queen goes down - her champion, the
   chair, the crowning - none of which this build had ever shown. */
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
}, 5);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const [i, s, st, b, m] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/game/state.js'),
    import('/src/ui/textbox.js'), import('/src/data/maps.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, dialog: b.dialog, MAPS: m.MAPS };
});
const out = await page.evaluate(async () => {
  const { input, scenes, state, dialog, MAPS } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { window.__turn(n); await breathe(); };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;
  for (let i = 0; i < 400 && scene() !== 'Overworld'; i++) await tap(i % 2 ? 'a' : 'start');
  if (scene() !== 'Overworld') return { fail: `stuck on ${scene()}` };
  const ow = scenes.current;
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');
  const res = { seen: [] };

  /* Nine seats, and a hero who can win a fight. */
  for (const h of ['stark', 'tully', 'arryn', 'tyrell', 'lannister', 'martell',
                   'baratheon', 'targaryen', 'greyjoy']) {
    if (!state.game.state.sigils.includes(h)) state.game.state.sigils.push(h);
  }
  const you = state.game.state.player;
  you.level = 60; you.hp = you.maxHp = 900; you.might = 200; you.guard = 120; you.swiftness = 60;

  /* One driver for the lot: tap through whatever is on screen and write down
     every sequence that plays, until the test says stop. */
  const drive = async (until, budget) => {
    for (let i = 0; i < budget; i++) {
      if (scene() === 'Tale') {
        const id = scenes.current.id;
        if (res.seen[res.seen.length - 1] !== id) res.seen.push(id);
      }
      if (until()) return true;
      await tap('a');
    }
    return until();
  };
  const step = async () => {
    for (const d of ['down', 'up', 'left', 'right']) {
      input.press(d); await turn(30); input.release(d); await turn(20);
      if (scene() !== 'Overworld') return true;
    }
    return false;
  };

  /* The raven, wherever you are standing. */
  await step();
  await drive(() => scene() === 'Overworld' && res.seen.includes('summons'), 400);
  res.summons = res.seen.includes('summons');

  /* The hall, the first time you climb it. */
  ow.loadMap('redKeep', { x: 8, y: 21, dir: 'up' });
  await turn(30);
  await step();
  await drive(() => scene() === 'Overworld' && res.seen.includes('gate'), 400);
  res.gate = res.seen.includes('gate');

  /* And the chair. */
  const throne = (MAPS.redKeep.npcs ?? []).find((n) => n.script === 'gymThrone');
  res.foundThrone = Boolean(throne);
  if (throne) {
    const D = { up: [0, -1, 'down'], down: [0, 1, 'up'], left: [-1, 0, 'right'], right: [1, 0, 'left'] };
    const [dx, dy, face] = D[throne.dir ?? 'down'];
    ow.loadMap('redKeep', { x: throne.x + dx, y: throne.y + dy, dir: face });
    await turn(30);
    await tap('a');
    await drive(() => res.seen.includes('crowned') && scene() === 'Overworld', 8000);
    res.champion = state.flag('cerseiFell');
    res.crowned = state.flag('gameComplete');
  }
  return { res };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.res;
const told = [...new Set(r.seen)];
const rows = [
  ['the raven comes at nine seats', r.summons === true],
  ['the hall is told the first time you climb it', r.gate === true],
  ['the queen goes down', r.champion === true],
  ['and the chair is yours', r.crowned === true],
  ['all five sequences were told, in order', JSON.stringify(told)
    === JSON.stringify(['summons', 'gate', 'champion', 'throne', 'crowned'])],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
console.log('  told:', told.join(' ') || '(none)');
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
