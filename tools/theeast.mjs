/* East of the Narrow Sea.
 *
 * Twelve of the most recognisable people in the story stood in the four Free
 * Cities sharing one script, and that script was `generic` with a nicer name:
 * it said their line and stopped. Jaqen, Arya, Illyrio, Jorah, the Red
 * Priestess, the Triarch, Missandei - every one of them furniture. And two of
 * the four cities had nowhere at all to mend: Braavos has the Kindly Man and
 * Volantis the Red Priest, and losing a fight in Pentos or Meereen left you
 * paying an innkeep for a bed.
 *
 * Run it with: node tools/theeast.mjs
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
}, 41);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const [i, s, st, b, m, hh, sc] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/game/state.js'),
    import('/src/ui/textbox.js'), import('/src/data/maps.js'), import('/src/game/household.js'),
    import('/src/data/scripts.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, dialog: b.dialog,
    MAPS: m.MAPS, REGIONS: m.REGIONS, house: hh, SCRIPTS: sc.SCRIPTS };
});

const out = await page.evaluate(async () => {
  const { input, scenes, state, MAPS, REGIONS, house, SCRIPTS } = window.__game;
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

  /* ---- nobody is left on the dead script ------------------------------ */
  res.stillGeneric = [];
  res.eastCast = [];
  const EAST = ['braavos', 'pentos', 'volantis', 'meereen', 'illyriosManse', 'narrowSea'];
  for (const id of EAST) {
    for (const n of MAPS[id].npcs ?? []) {
      if (n.script === 'freeCityLocal' || !n.script) res.stillGeneric.push(`${id}:${n.name}`);
      res.eastCast.push(`${id}:${n.name}:${n.script}`);
    }
  }
  res.hasScript = Object.keys(SCRIPTS);

  /* ---- every map is in a kingdom -------------------------------------- */
  res.regionless = Object.keys(MAPS).filter((id) => !REGIONS[id]);
  res.pykeIsGreyjoy = REGIONS.pykeCellar;

  /* ---- and every city has somewhere to mend --------------------------- */
  const CITY = {
    braavos: ['braavos', 'houseOfBlackAndWhite', 'sealordHold', 'braavosInn'],
    pentos: ['pentos', 'illyriosManse', 'cheesemongerHold', 'pentosInn'],
    volantis: ['volantis', 'templeOfRhllor', 'blackWallHold', 'volantisInn'],
    meereen: ['meereen', 'greatPyramid', 'fightingPits', 'meereenInn'],
  };
  const MENDS = ['healer', 'illyrio', 'missandei'];
  res.mends = {};
  for (const [city, ids] of Object.entries(CITY)) {
    res.mends[city] = ids.filter((id) => (MAPS[id]?.npcs ?? [])
      .some((n) => MENDS.includes(n.script)));
  }

  /* ---- each of them, talked to ---------------------------------------- */
  /* Everything a script needs to reach is on the api the overworld builds, so
     they are run through it rather than called bare. */
  const said = [];
  const api = (npc) => ({
    ...ow.makeScriptApi(npc),
    say: async (text) => { said.push(String(text)); },
    choose: async (text, options) => { said.push(String(text)); return api.pick ?? 0; },
  });
  const talk = async (mapId, name, pick = 0) => {
    ow.loadMap(mapId, { x: 1, y: 1, dir: 'down' });
    const npc = (MAPS[mapId].npcs ?? []).find((n) => n.name === name);
    if (!npc) return '(nobody of that name)';
    said.length = 0;
    api.pick = pick;
    const fn = SCRIPTS[npc.script];
    if (!fn) return '(no script)';
    const built = api(npc);
    built.choose = async (text, options) => { said.push(String(text)); return pick; };
    await fn(built);
    return said.join(' | ');
  };

  p.level = 20; p.money = 5000; p.wounded = true;
  state.game.state.party.length = 0;
  state.game.state.household = { sworn: [], children: [], spouse: null, betrothed: null };
  state.game.state.choices = {};
  state.game.state.dead = [];
  state.game.state.sigils.length = 0;

  /* Jaqen with nothing owed him, and then with somebody spared. */
  res.jaqenEmpty = await talk('braavos', "Jaqen H'ghar");
  state.recordChoice('spared_bronzeYohn', true);
  res.jaqenNamed = await talk('braavos', "Jaqen H'ghar", 0);
  res.jaqenKilled = state.isDead('bronzeYohn');
  res.jaqenTwice = await talk('braavos', "Jaqen H'ghar", 0);

  /* Arya reads back your own list. Jaqen has just added to it, so it is
     emptied first to see her with nothing to say. */
  state.game.state.dead = [];
  res.aryaEmpty = await talk('braavos', 'Arya');
  state.markDead('bronzeYohn');
  res.aryaList = await talk('braavos', 'Arya');

  /* Illyrio mends you, and pays on delivery. */
  p.wounded = true; p.money = 0;
  res.illyrioFed = await talk('pentos', 'Illyrio Mopatis', 0);
  res.mended = p.wounded === false;
  for (const h of ['wolf', 'trout']) state.awardSigil(h);
  res.illyrioPaid = await talk('pentos', 'Illyrio Mopatis', 1);
  res.purse = p.money;
  res.illyrioPaidTwice = await talk('pentos', 'Illyrio Mopatis', 1);
  res.purseAfter = p.money;

  /* Jorah takes your service. */
  res.jorahTook = await talk('pentos', 'Ser Jorah', 0);
  res.host = house.sworn().map((s) => s.name);
  res.jorahAgain = await talk('pentos', 'Ser Jorah', 0);

  /* The Dothraki sells you a horse. */
  p.money = 2000;
  res.horseBought = await talk('pentos', 'Dothraki Rider', 0);
  res.horse = state.game.state.party.map((c) => c.speciesId);
  res.horseAgain = await talk('pentos', 'Dothraki Rider', 0);

  /* The flames tell you where you stand. */
  p.winter = 60; p.winterSaid = 3;
  res.flames = await talk('volantis', 'Red Priestess');

  /* The Triarch sells a page out of his ledger. */
  p.money = 2000;
  res.freed = await talk('volantis', 'Triarch', 0);
  res.hostAfter = house.sworn().map((s) => s.name);

  /* The bridge is paid for, one way or another. */
  p.money = 2000;
  res.toll = await talk('volantis', 'Bridge Guard', 0);
  res.tollPaid = p.money;

  /* Missandei sends for a healer. */
  p.wounded = true;
  res.missandei = await talk('meereen', 'Missandei', 0);
  res.mendedEast = p.wounded === false;

  /* And the deckhand names what is out on the water. */
  res.deckhand = await talk('narrowSea', 'Deckhand');
  return { res };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.res;
const has = (s, re) => typeof s === 'string' && re.test(s);
const rows = [
  ['nobody east is left on the dead script', r.stillGeneric?.length === 0],
  ['and every script they point at exists',
    (r.eastCast ?? []).every((row) => r.hasScript.includes(row.split(':')[2]))],
  ['every map in the game is in a kingdom', r.regionless?.length === 0],
  ['and Pyke is Greyjoy ground', r.pykeIsGreyjoy === 'The Iron Islands'],
  ['all four cities have somewhere to mend',
    Object.values(r.mends ?? {}).every((list) => list.length > 0)],
  ['Jaqen wants a name and has none to take', has(r.jaqenEmpty, /Come back when you have left/)],
  ['gives one, and takes it', has(r.jaqenNamed, /It is done/) && r.jaqenKilled === true],
  ['and never gives a second', has(r.jaqenTwice, /A man does not give two/)],
  ['Arya keeps no list until you give her one', has(r.aryaEmpty, /have not given me one/)],
  ['and reads yours back', has(r.aryaList, /Bronze Yohn|1 of them|You keep a list/)],
  ['Illyrio feeds you, which is how Pentos mends', has(r.illyrioFed, /honeyed figs/) && r.mended === true],
  ['and pays on delivery, once per seat',
    has(r.illyrioPaid, /pays on delivery/) && r.purse === 800 && r.purseAfter === 800],
  ['Jorah takes your service', has(r.jorahTook, /you have a bear/)
    && (r.host ?? []).includes('Ser Jorah Mormont')],
  ['and is not taken twice', has(r.jorahAgain, /I ride with you/)],
  ['the Dothraki sells you a horse', has(r.horseBought, /reins in your hand/)
    && (r.horse ?? []).includes('courser') && has(r.horseAgain, /You have a horse/)],
  ['the flames read the season and the ladder',
    has(r.flames, /the nights drawing in|hard autumn|winter/) && has(r.flames, /has not bent/)],
  ['the Triarch sells a page out of his ledger',
    has(r.freed, /five tears/) && (r.hostAfter ?? []).includes('A Freed Spear')],
  ['the bridge is paid for', has(r.toll, /Left\. I will not say it again/) && r.tollPaid === 1940],
  ['Missandei sends for a healer, which is how Meereen mends',
    has(r.missandei, /clean linen/) && r.mendedEast === true],
  ['and the deckhand names what is out on the water', has(r.deckhand, /out here/)],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
console.log('  mends:', JSON.stringify(r.mends));
if (r.stillGeneric?.length) console.log('  STILL GENERIC:', r.stillGeneric.join(', '));
console.log('  east cast:', (r.eastCast ?? []).join('  '));
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
