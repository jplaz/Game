/* Children of the evening.
 *
 * Every town has a house with a red lamp over the door and this build has had
 * one since the towns were laid out - but it was an inn with a different sign
 * on it: you paid, you slept, you got a rumour. The cartridge has the rest.
 * Some while later word comes, or it does not; and from then on somebody in
 * that town is growing up with your chin and a bastard's name, and grown, they
 * will take your service.
 *
 * Run it with: node tools/thelamp.mjs
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
}, 31);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const [i, s, st, b, m, ba, hh] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/game/state.js'),
    import('/src/ui/textbox.js'), import('/src/data/maps.js'), import('/src/game/bastards.js'),
    import('/src/game/household.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, dialog: b.dialog,
    MAPS: m.MAPS, REGIONS: m.REGIONS, bast: ba, house: hh };
});

const out = await page.evaluate(async () => {
  const { input, scenes, state, dialog, MAPS, bast, house } = window.__game;
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
  /* Word comes on a roll of 0.55 or over, the way the cartridge reads it. */
  const always = () => 0.8;
  const never = () => 0.2;

  /* ---- there is a lamp in more than one town -------------------------- */
  const lamps = [];
  for (const [id, m] of Object.entries(MAPS)) {
    for (const n of m.npcs ?? []) if (n.script === 'redLamp') lamps.push(id);
  }
  res.lamps = [...new Set(lamps)];

  /* ---- a name off the ground it is born on ---------------------------- */
  res.names = {
    winterfell: bast.surnameHere('winterfell'),
    riverrun: bast.surnameHere('riverrun'),
    sunspear: bast.surnameHere('sunspear'),
    pyke: bast.surnameHere('pyke'),
    highgarden: bast.surnameHere('highgarden'),
    lannisport: bast.surnameHere('lannisport'),
    meereen: bast.surnameHere('meereen'),   // nobody holds it: a Waters
  };

  const wipe = () => {
    state.game.state.bastards = [];
    p.eveAt = 0; p.eveMap = null; p.fightsWon = 0;
    state.game.state.household = { sworn: [], children: [], spouse: null, betrothed: null };
    bast.clearLetter();
  };

  /* ---- nothing comes of nothing ---------------------------------------- */
  wipe();
  for (let i = 0; i < 200; i++) bast.bastardAfterWin(always);
  res.noEveningNoChild = state.game.state.bastards.length === 0
    && bast.takeLetter() === null;
  res.fightsCounted = p.fightsWon;

  /* ---- an evening, and word some fights later -------------------------- */
  wipe();
  bast.spendTheEvening('winterfell', always);
  const fuse = p.eveAt;
  for (let i = 0; i < fuse - 1; i++) bast.bastardAfterWin(always);
  res.fuse = fuse;
  res.quietMeanwhile = state.game.state.bastards.length === 0;
  bast.bastardAfterWin(always);
  res.born = state.game.state.bastards.length;
  res.letter = bast.takeLetter() ?? '';
  res.child = { ...(state.game.state.bastards[0] ?? {}) };

  /* ---- and sometimes you never hear anything at all -------------------- */
  wipe();
  bast.spendTheEvening('riverrun', never);
  for (let i = 0; i < 60; i++) bast.bastardAfterWin(never);
  res.silence = state.game.state.bastards.length === 0 && bast.takeLetter() === null;

  /* ---- the keeper knows whose children are whose ----------------------- */
  wipe();
  bast.spendTheEvening('winterfell', always);
  for (let i = 0, n = p.eveAt; i < n; i++) bast.bastardAfterWin(always);
  bast.takeLetter();
  const kid = bast.bastardHere('winterfell');
  res.knownHere = Boolean(kid);
  res.notKnownElsewhere = bast.bastardHere('riverrun') === null;
  res.tooYoung = kid ? bast.grown(kid) === false : null;
  /* Grown is a count of fights won, not of years nobody is keeping. */
  for (let i = 0; i < bast.BASTARD_GROWN; i++) bast.bastardAfterWin(never);
  res.grownNow = kid ? bast.grown(kid) === true : null;

  /* ---- and takes your service ------------------------------------------ */
  p.level = 30;
  res.tookHow = bast.takeBastard(kid);
  res.host = house.sworn().map((s) => `${s.name}@${s.level}`);
  res.takenOnce = bast.takeBastard(kid);
  res.goneFromTheFire = bast.bastardHere('winterfell') === null;

  /* ---- a full table has no place at it --------------------------------- */
  wipe();
  bast.spendTheEvening('sunspear', always);
  for (let i = 0, n = p.eveAt; i < n; i++) bast.bastardAfterWin(always);
  bast.takeLetter();
  const dornish = bast.bastardHere('sunspear');
  for (let i = 0; i < bast.BASTARD_GROWN; i++) bast.bastardAfterWin(never);
  for (let i = 0; i < 6; i++) {
    house.takeIntoService({ name: `Sword ${i}`, level: 10 }, `filler${i}`);
  }
  res.fullTable = bast.takeBastard(dornish);
  res.stillThere = bast.bastardHere('sunspear') !== null;

  /* ---- never more than three ------------------------------------------- */
  wipe();
  for (const town of ['winterfell', 'riverrun', 'sunspear', 'highgarden', 'pyke']) {
    bast.spendTheEvening(town, always);
    for (let i = 0, n = p.eveAt; i < n; i++) bast.bastardAfterWin(always);
    bast.takeLetter();
  }
  res.most = state.game.state.bastards.length;

  /* ---- and the letter waits for a quiet step --------------------------- */
  wipe();
  bast.spendTheEvening('winterfell', always);
  for (let i = 0, n = p.eveAt; i < n; i++) bast.bastardAfterWin(always);
  ow.loadMap('kingsroad', { x: 1, y: 1, dir: 'down' });
  res.shown = ow.checkLetter();
  res.shownText = (dialog.pages?.[0] ?? []).join(' ').slice(0, 40);
  res.shownOnce = ow.checkLetter();
  return { res };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.res;
const n = r.names ?? {};
const rows = [
  ['there is a lamp in more than one town', (r.lamps?.length ?? 0) >= 5],
  ['a child is named off the ground it is born on',
    n.winterfell === 'Snow' && n.riverrun === 'Rivers' && n.sunspear === 'Sand'
    && n.pyke === 'Pyke' && n.highgarden === 'Flowers' && n.lannisport === 'Hill'],
  ['and a Waters where nobody holds the ground', n.meereen === 'Waters'],
  ['no evening, no child', r.noEveningNoChild === true],
  ['but every fight is still counted', r.fightsCounted === 200],
  ['an evening, and word some fights later', r.fuse >= 24 && r.fuse <= 39
    && r.quietMeanwhile === true && r.born === 1],
  ['the letter is unsigned and names the babe',
    /A letter, unsigned, from/.test(r.letter) && /Snow\./.test(r.letter)],
  ['and sometimes you never hear anything at all', r.silence === true],
  ['the keeper in that town knows, and no other keeper does',
    r.knownHere === true && r.notKnownElsewhere === true],
  ['too young at first, grown after twenty-five fights',
    r.tooYoung === true && r.grownNow === true],
  ['grown, they take your service four levels under you',
    r.tookHow === 'taken' && (r.host ?? []).some((s) => /Snow@26/.test(s))],
  ['and are not standing by the fire twice',
    r.takenOnce === 'already' && r.goneFromTheFire === true],
  ['a full table has no place at it', r.fullTable === 'full' && r.stillThere === true],
  ['and there are never more than three of them', r.most === 3],
  ['the letter waits for a quiet step, and comes once',
    r.shown === true && r.shownOnce === false && /letter/i.test(r.shownText)],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
console.log('  lamps:', (r.lamps ?? []).length, 'towns  names:', JSON.stringify(r.names));
console.log('  fuse', r.fuse, ' child', JSON.stringify(r.child), ' host', (r.host ?? []).join(', '));
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
