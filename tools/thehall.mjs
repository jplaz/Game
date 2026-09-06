/* A hall you can look at.
 *
 * You could buy seven things for your own hall and not one of them changed
 * anything you could see: a sixteen-by-twelve room with a carpet and two
 * people in it, before nine thousand gold and after it. A hall you cannot look
 * at is a spreadsheet with a door on it.
 *
 * Everything below is the other half: the pieces have tiles, the tiles go
 * where you put them, and the room is that shape from then on.
 *
 * Run it with: node tools/thehall.mjs
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
}, 71);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const [i, s, st, b, m, hf, sc] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/game/state.js'),
    import('/src/ui/textbox.js'), import('/src/data/maps.js'), import('/src/game/holdfast.js'),
    import('/src/data/scripts.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, dialog: b.dialog,
    MAPS: m.MAPS, hf, SCRIPTS: sc.SCRIPTS };
});

const out = await page.evaluate(async () => {
  const { input, scenes, state, MAPS, hf } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { window.__turn(n); await breathe(); };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;
  for (let i = 0; i < 400 && scene() !== 'Overworld'; i++) await tap(i % 2 ? 'a' : 'start');
  if (scene() !== 'Overworld') return { fail: `stuck on ${scene()}` };
  const ow = scenes.current;
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');
  const res = {};

  /* A hall, and the money to fill it. */
  hf.grantHoldfast('holdfast', 'Snowhome');
  state.game.state.player.money = 40000;
  ow.loadMap('holdfast', { x: 7, y: 10, dir: 'up' });
  await turn(10);
  const rows = () => MAPS.holdfast.grid.map((r) => r);
  res.bare = rows().join('|');
  res.plan = hf.planOf('holdfast')?.join('|') ?? null;

  /* Every piece has something to draw. That was the whole defect. */
  res.pieces = Object.entries(hf.FURNISHINGS).map(([id, d]) => `${id}:${d.tile ?? '-'}`);
  res.tileless = Object.entries(hf.FURNISHINGS).filter(([, d]) => !d.tile).map(([id]) => id);

  /* Buy one and put it down where a player would. */
  hf.install('longTable');
  res.boughtButUnplaced = rows().join('|') === res.bare;
  ow.startArranging('longTable');
  res.carrying = ow.arranging?.id ?? null;
  ow.arranging.x = 5; ow.arranging.y = 5;
  input.press('a'); await turn(4); input.release('a'); await turn(8);
  res.afterPlacing = MAPS.holdfast.grid[5];
  res.placedAt = hf.placedAt('longTable');
  res.modeEnded = ow.arranging === null;

  /* Move it, and the old one must not be left standing. */
  ow.startArranging('longTable');
  ow.arranging.x = 5; ow.arranging.y = 7;
  input.press('a'); await turn(4); input.release('a'); await turn(8);
  res.movedRow = MAPS.holdfast.grid[7];
  res.oldRowClear = MAPS.holdfast.grid[5];

  /* The room is walked on, so it has to be solid where the table is. */
  res.tableIsSolid = ow.blocked(5, 7) && ow.blocked(8, 7) && !ow.blocked(9, 7);

  /* The rules: off the floor, on the doorway, on top of something else, a
     banner in the middle of the room, and shutting the hall in half. */
  res.why = {
    offFloor: hf.whyNotHere(MAPS.holdfast, 'strongbox', 0, 0),
    doorway: hf.whyNotHere(MAPS.holdfast, 'strongbox', 7, 11),
    inFront: hf.whyNotHere(MAPS.holdfast, 'strongbox', 7, 10),
    onTop: hf.whyNotHere(MAPS.holdfast, 'strongbox', 6, 7),
    bannerAdrift: hf.whyNotHere(MAPS.holdfast, 'banners', 6, 5),
    bannerOnWall: hf.whyNotHere(MAPS.holdfast, 'banners', 3, 1),
    plainFloor: hf.whyNotHere(MAPS.holdfast, 'strongbox', 4, 3),
  };

  /* And the one that matters: a wall of furniture across the room is refused.
     The hall's floor runs x=1..14, so this lays pieces from 1 to 10, leaves the
     table for 11..14, and the table is the piece that would close it. */
  hf.install('armoury'); hf.place('armoury', 1, 6);
  hf.install('minstrelGallery'); hf.place('minstrelGallery', 3, 6);
  hf.install('ravenry'); hf.place('ravenry', 5, 6);
  hf.install('hearth'); hf.place('hearth', 6, 6);
  hf.install('banners'); hf.place('banners', 7, 6);
  hf.install('bed'); hf.place('bed', 9, 6);
  hf.install('strongbox'); hf.place('strongbox', 10, 6);
  /* Which leaves x=11..14 of that row, and the table is exactly four wide. */
  res.sealing = hf.whyNotHere(MAPS.holdfast, 'longTable', 11, 6);
  /* One row down leaves the way round it, and is allowed. */
  res.notSealing = hf.whyNotHere(MAPS.holdfast, 'longTable', 11, 8);

  /* Everything you own, drawn, after a fresh arrival. */
  hf.place('longTable', 5, 7);
  hf.place('bed', 12, 3);
  ow.loadMap('holdfast', { x: 7, y: 10, dir: 'up' });
  await turn(10);
  res.dressed = MAPS.holdfast.grid.join('|');
  const chars = new Set(res.dressed.replace(/\|/g, '').split(''));
  res.showing = ['T', 'l', 'B', 'u', 'h', 'V', 'b', 'j'].filter((c) => chars.has(c));

  /* ---- and the yard, which is the other half of owning somewhere -------- */
  hf.install('godswood'); hf.install('kennels'); hf.install('forge');
  res.indoorInYard = hf.whyNotHere(MAPS.holdfastYard, 'longTable', 5, 5);
  res.outdoorInHall = hf.whyNotHere(MAPS.holdfast, 'godswood', 5, 4);
  res.yardSpot = hf.whyNotHere(MAPS.holdfastYard, 'godswood', 4, 5);
  hf.place('godswood', 4, 5); hf.place('kennels', 12, 5); hf.place('forge', 12, 8);
  ow.loadMap('holdfastYard', { x: 9, y: 2, dir: 'down' });
  await turn(10);
  res.yard = MAPS.holdfastYard.grid.join('|');
  const outside = new Set(res.yard.replace(/\|/g, '').split(''));
  res.yardShowing = ['W', 'N', 'a'].filter((c) => outside.has(c));
  /* The hall is still the hall: the yard's things are not in it. */
  res.hallUnchanged = !MAPS.holdfast.grid.join('').includes('W');
  /* And you can walk from the road to the yard to the hall. */
  res.doors = {
    yardToHall: (MAPS.holdfastYard.warps ?? []).some((w) => w.to === 'holdfast'),
    yardToWood: (MAPS.holdfastYard.warps ?? []).some((w) => w.to === 'wolfswood'),
    woodToYard: (MAPS.wolfswood.warps ?? []).some((w) => w.to === 'holdfastYard'),
    hallToYard: (MAPS.holdfast.warps ?? []).some((w) => w.to === 'holdfastYard'),
  };

  /* And it survives being written down and read back. */
  const { saveGame, loadGame } = await import('/src/game/save.js');
  saveGame();
  hf.place('longTable', 2, 3);
  loadGame();
  res.afterReload = JSON.stringify(hf.placedAt('longTable'));
  return { res };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.res;
const rows = [
  ['every piece has something to draw', r.tileless?.length === 0],
  ['a bought piece is not standing anywhere until you put it down',
    r.boughtButUnplaced === true],
  ['picking one up hands the hall to the pad', r.carrying === 'longTable'],
  ['putting it down changes the room', /TTTT/.test(r.afterPlacing ?? '')
    && r.placedAt?.x === 5 && r.placedAt?.y === 5 && r.modeEnded === true],
  ['moving it leaves nothing behind',
    /TTTT/.test(r.movedRow ?? '') && !/T/.test(r.oldRowClear ?? '')],
  ['and you cannot walk through it', r.tableIsSolid === true],
  ['a piece will not go outside the hall', Boolean(r.why?.offFloor)],
  ['nor in the doorway, nor in front of it',
    Boolean(r.why?.doorway) && Boolean(r.why?.inFront)],
  ['nor on top of something else', /already there/.test(r.why?.onTop ?? '')],
  ['a banner wants a wall behind it',
    /wants a wall/.test(r.why?.bannerAdrift ?? '') && r.why?.bannerOnWall === null],
  ['and plain floor is simply allowed', r.why?.plainFloor === null],
  ['you cannot shut off half your own hall',
    /shut off/.test(r.sealing ?? '') && r.notSealing === null],
  ['everything you own is standing there when you walk back in',
    (r.showing ?? []).length === 8],
  ['and it is still there after a save and a load', r.afterReload === '{"x":5,"y":7}'],
  /* The yard: your own ground, walked to rather than asked for. */
  ['the yard is reachable from the road, and the hall from the yard',
    r.doors?.woodToYard === true && r.doors?.yardToHall === true
    && r.doors?.yardToWood === true && r.doors?.hallToYard === true],
  ['a table will not go in the yard, nor a heart tree in the hall',
    /out in the yard|belongs indoors/.test(r.outdoorInHall ?? '')
    && /belongs indoors|out in the yard/.test(r.indoorInYard ?? '')],
  ['but a heart tree in the yard is simply allowed', r.yardSpot === null],
  ['and the yard shows what you put on it', (r.yardShowing ?? []).length === 3],
  ['without any of it turning up indoors', r.hallUnchanged === true],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
console.log('  showing:', (r.showing ?? []).join(' '), ' why:', JSON.stringify(r.why));
console.log('  the hall:');
for (const row of (r.dressed ?? '').split('|')) console.log('    ' + row);
console.log('  the yard:');
for (const row of (r.yard ?? '').split('|')) console.log('    ' + row);
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
