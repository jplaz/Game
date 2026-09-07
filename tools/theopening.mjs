/* The opening beat, told nine ways.
 *
 * The largest choice in this game is made in its first two minutes, and until
 * now it changed a colour. Whatever banner you named, Maester Luwin told you
 * Lord Rickard wanted a rider, handed you a scroll naming you Winterfell's
 * rider, sent you to earn the Wolf Sigil, and pointed you at Moat Cailin — and
 * then you walked out of the chamber into Winterfell. Swear to Martell and the
 * opening still made you a Stark.
 *
 * Run it with: node tools/theopening.mjs
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
}, 97);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const [i, s, st, b, m, h, sc] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/game/state.js'),
    import('/src/ui/textbox.js'), import('/src/data/maps.js'), import('/src/data/houses.js'),
    import('/src/data/scripts.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, dialog: b.dialog,
    MAPS: m.MAPS, houses: h, SCRIPTS: sc.SCRIPTS };
});

const out = await page.evaluate(async () => {
  const { input, scenes, state, MAPS, houses, SCRIPTS } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { window.__turn(n); await breathe(); };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;
  for (let i = 0; i < 400 && scene() !== 'Overworld'; i++) await tap(i % 2 ? 'a' : 'start');
  if (scene() !== 'Overworld') return { fail: `stuck on ${scene()}` };
  const ow = scenes.current;
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');

  const res = { houses: {} };
  res.seats = Object.keys(houses.HOUSE_SEATS);
  res.swearable = [...houses.SWEARABLE];

  /* Every seat is a real map, and no two houses wake in the same bed. */
  res.realMaps = res.seats.every((id) => Boolean(MAPS[houses.HOUSE_SEATS[id].map]));
  res.distinct = new Set(res.seats.map((id) => houses.HOUSE_SEATS[id].map)).size;

  /* Play the opening, once per house, answering "yes" to everything. */
  for (let n = 0; n < res.swearable.length; n++) {
    const id = res.swearable[n];
    state.setState(state.newGame('Rider'));
    const said = [];
    const npc = { x: 4, y: 4, dir: 'down', name: 'A Maester' };
    const api = {
      npc,
      subject: npc,
      say: async (t) => { said.push(String(t)); },
      /* The house list, then confirm; then the first creature, then confirm. */
      choose: async (text, options) => {
        said.push(String(text));
        if (options.length > 4) return n;          // the nine banners
        return 0;                                   // yes to everything else
      },
      setFlag: state.setFlag,
      flag: state.flag,
    };
    await SCRIPTS.starter(api);
    const seat = houses.HOUSE_SEATS[id];
    const all = said.join(' ');
    res.houses[id] = {
      at: { ...state.game.state.position },
      wokeRight: state.game.state.position.map === seat.map
        && state.game.state.position.x === seat.x,
      respawnRight: state.game.state.respawn.map === seat.map,
      sworn: state.allegiance(),
      namesMyMaester: all.includes(seat.maester),
      namesMyLord: all.includes(seat.lord),
      namesMySeat: all.includes(houses.HOUSES[id].seat),
      namesMySigil: new RegExp(seat.sigil, 'i').test(all),
      pointsMeOn: all.includes(seat.next),
      /* And says nothing about somebody else's house. */
      strayStark: id !== 'stark'
        && /Luwin|Rickard|Winterfell's rider|Wolf Sigil/.test(all),
    };
  }
  /* ---- and the first beat of the story finds every one of them --------- */
  const cs = await import('/src/data/cutscenes.js');
  res.raven = {};
  for (const id of res.swearable) {
    state.setState(state.newGame('Rider'));
    state.swearTo(id);
    const seat = houses.HOUSE_SEATS[id];
    const here = cs.cutscenesOn(seat.map).map((x) => x.id);
    const elsewhere = cs.cutscenesOn(id === 'stark' ? 'sunspear' : 'winterfell')
      .map((x) => x.id);
    res.raven[id] = {
      atMySeat: here.includes('theRaven'),
      notAtSomebodyElses: !elsewhere.includes('theRaven'),
    };
  }

  /* And a line can name whoever is reading it. */
  state.setState(state.newGame('Rider'));
  state.swearTo('martell');
  res.spoken = cs.yours('Outrider: You are the rider out of {seat}. Turn back.');
  state.swearTo('greyjoy');
  res.spokenAgain = cs.yours('Outrider: You are the rider out of {seat}. Turn back.');
  res.leftAlone = cs.yours('A plain line with no braces in it.');
  return { res };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.res;
const each = (fn) => r.swearable.every((id) => fn(r.houses[id]));
const rows = [
  ['there is a seat for every house you can swear to',
    r.seats.length === 9 && r.swearable.every((id) => r.seats.includes(id))],
  ['every one of them is a real map', r.realMaps === true],
  ['and no two houses wake in the same bed', r.distinct === 9],
  ['swearing puts you at your own seat', each((h) => h.wokeRight)],
  ['and that is where you wake after a whiteout too', each((h) => h.respawnRight)],
  ['your own maester is the one who has been talking to you', each((h) => h.namesMyMaester)],
  ['your own lord is the one who wants a rider', each((h) => h.namesMyLord)],
  ['the scroll names your own seat', each((h) => h.namesMySeat)],
  ['the sigil you are sent for is your own', each((h) => h.namesMySigil)],
  ['and you are pointed at your own road', each((h) => h.pointsMeOn)],
  ['nobody but a Stark is told a word about Winterfell',
    r.swearable.filter((id) => id !== 'stark').every((id) => !r.houses[id].strayStark)],
  /* The first beat of the story: three words out of the Wall, and the reason
     any of the rest of it is happening. */
  ['the raven from the Wall finds every rider at their own seat',
    r.swearable.every((id) => r.raven[id].atMySeat)],
  ['and is not waiting in somebody else\'s yard',
    r.swearable.every((id) => r.raven[id].notAtSomebodyElses)],
  ['a scene can name whoever is reading it',
    /out of Sunspear/.test(r.spoken ?? '') && /out of Pyke/.test(r.spokenAgain ?? '')],
  ['and leaves a plain line alone',
    r.leftAlone === 'A plain line with no braces in it.'],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
for (const id of r.swearable) {
  const h = r.houses[id];
  console.log(`  ${id.padEnd(10)} wakes at ${h.at.map} ${h.at.x},${h.at.y}`,
    h.strayStark ? ' <- still told about Winterfell' : '');
}
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
