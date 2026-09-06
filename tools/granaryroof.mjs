/* The dragon that comes down and stays.
 *
 * This build has had dragons crossing the sky since they were drawn, and one
 * in six of them stoops on you as you walk — weather that occasionally bites.
 * The cartridge has the other half and this build had none of it: once three
 * seats are broken one of them settles on a town's granary roof and eats,
 * every fight you spend elsewhere is a fight it eats through, and if nobody
 * comes the town burns and the house that held it remembers.
 *
 * Run it with: node tools/granaryroof.mjs
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
}, 23);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const [i, s, st, b, m, sw, c, td, hs] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/game/state.js'),
    import('/src/ui/textbox.js'), import('/src/data/maps.js'), import('/src/game/swoop.js'),
    import('/src/game/creature.js'), import('/src/art/tiles.js'), import('/src/data/houses.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, dialog: b.dialog,
    MAPS: m.MAPS, tileAt: m.tileAt, REGIONS: m.REGIONS, swoop: sw, creature: c, tiles: td, houses: hs };
});

const out = await page.evaluate(async () => {
  const { input, scenes, state, dialog, MAPS, tileAt, REGIONS, swoop, creature, tiles, houses } = window.__game;
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
  const roll = () => 0.5;                       // steered, so counts are exact
  const clear = () => {
    p.swoopMap = null; p.swoopAt = 0; p.swoopsBeaten = 0; p.swoopsBurned = 0;
    swoop.clearDragonNews();
  };

  /* ---- where one can settle ------------------------------------------- */
  res.towns = swoop.swoopTowns();
  /* Every one of them is southern, held, lived in, and has ground you can be
     jumped on: an errand you cannot reach is a town that burns on a timer. */
  res.allReachable = res.towns.every((id) => {
    const m = MAPS[id];
    return !m.indoor && (m.npcs?.length ?? 0) > 0
      && Boolean(houses.REGION_HOUSE[REGIONS[id] ?? ''])
      && (m.grid ?? []).some((row) => [...row].some((c) => tiles.tileDef(c).kind === 'encounter'));
  });
  res.noNorth = res.towns.filter((id) => /winterfell|castleBlack|wall|hardhome/i.test(id));
  res.noEssos = res.towns.filter((id) => /braavos|pentos|volantis|meereen/i.test(id));

  /* ---- they do not wake until the realm is tearing itself apart ------- */
  state.game.state.sigils.length = 0;
  clear();
  for (let i = 0; i < 200; i++) swoop.dragonAfterWin(roll);
  res.quietWhileWhole = p.swoopMap === null && swoop.takeDragonNews() === null;

  /* ---- three seats, and one comes down -------------------------------- */
  for (const h of ['wolf', 'trout', 'lion']) state.awardSigil(h);
  clear();
  let armed = 0;
  for (let i = 0; i < 200 && !p.swoopMap; i++) { swoop.dragonAfterWin(roll); armed++; }
  res.tookFights = armed;
  res.settledOn = swoop.settledOn();
  res.settleNews = swoop.takeDragonNews() ?? '';
  res.fuse = p.swoopAt;

  /* ---- and it eats through every fight you spend somewhere else ------- */
  const fuse = p.swoopAt;
  for (let i = 0; i < fuse - 1; i++) swoop.dragonAfterWin(roll);
  res.stillThere = swoop.settledOn();
  res.notYetSaid = swoop.takeDragonNews();

  /* ---- until nobody has come ------------------------------------------ */
  const town = swoop.settledOn();
  const holder = houses.REGION_HOUSE[REGIONS[town] ?? ''] ?? null;
  const before = holder ? state.standing(holder) : 0;
  swoop.dragonAfterWin(roll);
  res.burned = p.swoopsBurned;
  res.gone = swoop.settledOn();
  res.burnNews = swoop.takeDragonNews() ?? '';
  res.holderLost = holder ? before - state.standing(holder) : null;

  /* ---- go instead, and it is the dragon that is in the grass ---------- */
  clear();
  p.swoopMap = 'roseroad';
  p.swoopAt = 20;
  state.game.state.party.length = 0;
  state.game.state.party.push(creature.createCreature('direwolf', 30));
  p.level = 30; p.wounded = false; p.money = 0;

  const coverTile = (mapId) => {
    const m = MAPS[mapId];
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        if (tiles.tileDef(tileAt(m, x, y)).kind === 'encounter') return { x, y, dir: 'down' };
      }
    }
    return null;
  };
  const real = ow.startBattle.bind(ow);
  const asked = [];
  ow.startBattle = (config) => { asked.push(config); return Promise.resolve('won'); };
  ow.loadMap('roseroad', coverTile('roseroad'));
  for (let i = 0; i < 600; i++) ow.checkEncounter();
  res.overTown = { fights: asked.length,
    dragon: asked.filter((c) => c.foe?.speciesId === 'dreadwyrm').length };
  /* And on the road next door it is the road's own people again. */
  asked.length = 0;
  ow.loadMap('kingsroad', coverTile('kingsroad'));
  for (let i = 0; i < 600; i++) ow.checkEncounter();
  res.nextDoor = { fights: asked.length,
    dragon: asked.filter((c) => c.foe?.speciesId === 'dreadwyrm').length };
  ow.startBattle = real;

  /* ---- put it down, and the town remembers ---------------------------- */
  const holder2 = houses.REGION_HOUSE[REGIONS.roseroad ?? ''] ?? null;
  const stood = holder2 ? state.standing(holder2) : 0;
  p.money = 0;
  res.saidWhenBeaten = swoop.dragonBeaten('roseroad', 'dreadwyrm', roll) ?? '';
  res.purse = p.money;
  res.beaten = p.swoopsBeaten;
  res.clearedAfter = swoop.settledOn();
  res.holderGained = holder2 ? state.standing(holder2) - stood : null;
  /* Beating it somewhere it is not, or beating something else, changes nothing. */
  p.swoopMap = 'roseroad';
  res.wrongPlace = swoop.dragonBeaten('kingsroad', 'dreadwyrm', roll);
  res.wrongBeast = swoop.dragonBeaten('roseroad', 'direwolf', roll);
  res.stillSettled = swoop.settledOn();

  /* ---- and the word waits for a quiet step ---------------------------- */
  clear();
  p.swoopMap = null; p.swoopAt = 1;
  swoop.dragonAfterWin(roll);
  ow.loadMap('kingsroad', { x: 1, y: 1, dir: 'down' });
  res.newsShown = ow.checkDragonNews();
  res.newsText = (dialog.pages?.[0] ?? []).join(' ').slice(0, 40);
  res.newsOnce = ow.checkDragonNews();
  return { res };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.res;
const rows = [
  ['there is somewhere for one to come down', (r.towns?.length ?? 0) >= 5],
  ['and every one of them can actually be fought on', r.allReachable === true],
  ['none of them north of the Neck', r.noNorth?.length === 0],
  ['and none of them across the Narrow Sea', r.noEssos?.length === 0],
  ['nothing comes down while the realm is whole', r.quietWhileWhole === true],
  ['three seats broken and one settles', Boolean(r.settledOn)
    && /settled on the granary roof/.test(r.settleNews)],
  ['with a couple of dozen fights on the clock', r.fuse >= 22 && r.fuse <= 34],
  ['it is still there the fight before', Boolean(r.stillThere) && r.notYetSaid === null],
  ['and the town burns when nobody comes',
    r.burned === 1 && r.gone === null && /has gone out, and so has the town/.test(r.burnNews)],
  ['the house that held it minds', r.holderLost === 6],
  ['over the town it settled on, the grass is the dragon',
    r.overTown?.fights > 20 && r.overTown.dragon === r.overTown.fights],
  ['and on the next road it is the road again',
    r.nextDoor?.fights > 20 && r.nextDoor.dragon === 0],
  ['driving it off pays the granary men', r.purse === 260 + 30 * 6
    && /labours up off/.test(r.saidWhenBeaten)],
  ['and the house that holds the ground saw who came',
    r.beaten === 1 && r.clearedAfter === null && r.holderGained === 10],
  ['beating it where it is not changes nothing',
    r.wrongPlace === null && r.wrongBeast === null && r.stillSettled === 'roseroad'],
  ['the word waits for a quiet step, and comes once',
    r.newsShown === true && r.newsOnce === false && /dragon/i.test(r.newsText)],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
console.log('  towns:', (r.towns ?? []).join(' '));
console.log('  armed after', r.tookFights, 'fights, fuse', r.fuse,
  ' over town', JSON.stringify(r.overTown), ' next door', JSON.stringify(r.nextDoor),
  ' purse', r.purse);
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
