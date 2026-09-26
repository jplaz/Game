/* The Grey Chain, played end to end.
 *
 * The story was a raven and a set of scenes that never referred to one
 * another: nobody ever said why the Wall's letters went unread, where the
 * burned villages' corn went, or who was paying the man in good boots. This
 * walks the thread that answers all three - the burned village, the old
 * working on the gold road, the carters at the Crossroads, the roost in the
 * whispering cave, the offer and the threat, the child taken to the robbers'
 * hole, the Spider, and the Grand Maester - and asks at each step that it
 * waits for what it should, fires when it should, carries on after its fight,
 * and remembers what you said.
 *
 * Every fight is won without being fought: what is being tested is the scene
 * on either side of it, and whether the scene is still there afterwards.
 *
 * Run it with: node tools/thechain.mjs
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
}, 211);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const [i, s, st, b, c, h] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/game/state.js'),
    import('/src/ui/textbox.js'), import('/src/data/cutscenes.js'), import('/src/data/houses.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, dialog: b.dialog, CUTSCENES: c.CUTSCENES,
    seatOf: h.seatOf };
});

const out = await page.evaluate(async () => {
  const { input, scenes, state, dialog, CUTSCENES, seatOf } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { window.__turn(n); await breathe(); };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;
  for (let i = 0; i < 400 && scene() !== 'Overworld'; i++) await tap(i % 2 ? 'a' : 'start');
  if (scene() !== 'Overworld') return { fail: `stuck on ${scene()}` };
  const ow = scenes.current;
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');

  /* Everything said is written down rather than read, every question is
     answered from the script, and every fight is won. */
  const said = [];
  let answers = [];
  dialog.say = async (text) => { said.push(String(text)); };
  dialog.choose = async (text, options) => {
    said.push(`? ${text} [${options.join(' / ')}]`);
    return answers.length ? answers.shift() : 0;
  };
  let fights = 0;
  ow.startAmbush = async () => { fights++; return 'won'; };
  /* Nobody on the road draws on you while the story is being walked: a
     guardsman who sees you on the way to the burned village is a fight the
     village never gets to. */
  ow.checkTrainers = () => false;

  const sigils = (n) => {
    const all = ['wolf', 'trout', 'lion', 'falcon', 'rose', 'kraken', 'viper', 'stag', 'dragon'];
    state.game.state.sigils = all.slice(0, n);
  };
  /* Onto a tile from the one beside it, the way a scene is walked into. */
  const walkOnto = async (map, x, y) => {
    for (const [dx, dy, key] of [[0, 1, 'up'], [0, -1, 'down'], [-1, 0, 'right'], [1, 0, 'left']]) {
      ow.loadMap(map, { x: x + dx, y: y + dy, dir: key });
      await turn(12);
      if (ow.player.x !== x + dx || ow.player.y !== y + dy) continue;
      input.press(key); await turn(30); input.release(key); await turn(12);
      if (ow.player.x === x && ow.player.y === y) return true;
    }
    return false;
  };
  /* Into a scene's map and onto its ground, and wait for whatever it does. */
  const visit = async (id, { at = null, pick = [] } = {}) => {
    const cs = CUTSCENES[id];
    said.length = 0;
    answers = [...pick];
    const fightsWere = fights;
    const map = cs.map === '@seat' ? seatOf(state.allegiance() ?? 'stark').map : cs.map;
    let walked = false;
    /* A scene pinned to its tile is walked onto that tile. One that can happen
       anywhere is walked onto its map - and walked again if another scene
       that was also waiting there went first, which is how a real visit goes
       too: the one that was owed first is the one you get. */
    const tries = at ? [at] : !cs.anywhere ? [[cs.x, cs.y]]
      : [[cs.x, cs.y - 1], [cs.x, cs.y], [cs.x + 1, cs.y], [cs.x - 1, cs.y]];
    for (let round = 0; round < 3 && !state.flag(cs.flag); round++) {
      for (const [x, y] of tries) {
        if (await walkOnto(map, x, y)) { walked = true; break; }
      }
      for (let i = 0; i < 600 && (ow.busy || ow.cutscene); i++) await turn(4);
      if (!cs.anywhere) break;
    }
    return {
      walked, fired: Boolean(state.flag(cs.flag)), fought: fights - fightsWere,
      said: said.join(' | '),
    };
  };

  const r = {};
  state.game.state.flags = {};
  sigils(0);

  /* The gold road: the village, then the old working. */
  r.hillEarly = await visit('intoTheHill');
  r.village = await visit('burnedVillage', { pick: [0] });
  r.wrenFlag = Boolean(state.flag('burnedVillage_0'));
  r.hill = await visit('intoTheHill', { pick: [2] });
  r.hillAnswer = Boolean(state.flag('intoTheHill_2'));

  /* The Crossroads, where Wren tells you about the birds. */
  r.carters = await visit('whatTheCartersSay');

  /* The roost waits for two seats. */
  r.roostEarly = await visit('theRoost');
  sigils(2);
  r.roost = await visit('theRoost', { pick: [0] });

  /* The man in good boots, from the follower to the threat - and the threat
     is on the road now, not in one street of Flea Bottom. */
  r.follower = await visit('theFollower', { pick: [2] });   /* walks away from him */
  sigils(3);
  r.whoPaid = await visit('whoPaidHim');
  r.secondEarly = await visit('theSecondOffer');
  sigils(7);
  r.second = await visit('theSecondOffer', { pick: [0] });  /* draws */
  r.threatened = Boolean(state.flag('theyThreatenedYou'));

  /* The price, collected, and the child brought home. */
  r.birdGone = await visit('theBirdIsGone');
  r.hole = await visit('theRobbersHole', { pick: [2] });

  /* The Spider, and the one man. */
  sigils(8);
  r.spider = await visit('theSpiderHimself');
  r.spiderFlag = Boolean(state.flag('metTheSpider'));

  /* All three endings, one after another. */
  r.endings = [];
  for (const pick of [0, 1, 2]) {
    delete state.game.state.flags.cs_grandMaester;
    r.endings.push(await visit('theGrandMaester', { pick: [pick] }));
    r.endings.at(-1).answer = Boolean(state.flag(`theGrandMaester_${pick}`));
  }

  /* And home, where your own maester is being taken away. */
  r.recalled = await visit('theMaesterRecalled', { pick: [2] });
  return { r };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.r;
const has = (v, re) => re.test(v?.said ?? '');
const [expose, bargain, draw] = r.endings;
const rows = [
  ['the old working waits for the burned village', r.hillEarly.fired === false],
  ['the burned village plays, and Wren is in it', r.village.fired && has(r.village, /^Wren:|\| Wren:/)],
  ['and what you said to her is remembered', r.wrenFlag === true],
  ['the old working plays after it', r.hill.fired === true],
  ['it has a fight in it', r.hill.fought === 1],
  ['and it carries on after the fight', has(r.hill, /goes down without a sound.*Lords burn corn/)],
  ['what you chose to do with the corn is remembered', r.hillAnswer === true],
  ['Wren is at the Crossroads afterwards', r.carters.fired && has(r.carters, /Whispering Cave/)],
  ['the roost waits for two seats', r.roostEarly.fired === false],
  ['then plays, fights, and reads you the letters', r.roost.fired && r.roost.fought === 1
    && has(r.roost, /NOT YET/)],
  ['the follower plays', r.follower.fired === true],
  ['walking away from him no longer loses the rest of the story', r.whoPaid.fired === true],
  ['the threat waits for seven seats', r.secondEarly.fired === false],
  ['then finds you on the kingsroad', r.second.fired === true],
  ['drawing on him is a fight, and the scene goes on after it', r.second.fought === 1
    && has(r.second, /is simply not there any more|is not there any more/)],
  ['the threat is remembered even though it ended in steel', r.threatened === true],
  ['the child is gone from Riverrun afterwards', r.birdGone.fired && has(r.birdGone, /ROBBERS' HOLE/)],
  ['the robbers\' hole: a fight, then the child names the seal', r.hole.fired && r.hole.fought === 1
    && has(r.hole, /Grand Maester's seal/)],
  ['the Spider names the man', r.spider.fired && has(r.spider, /Grand Maester keeps his rooms/)],
  ['and is remembered', r.spiderFlag === true],
  ['the Grand Maester explains himself', has(expose, /choosing who comes out of it/)],
  ['taking his books to court ends it one way', expose.answer && has(expose, /every rookery/)
    && !has(expose, /keeping a book on you|empty cup/)],
  ['sending the corn north ends it another', bargain.answer && has(bargain, /keeping a book on you/)
    && !has(bargain, /every rookery|empty cup/)],
  ['drawing is a fight, and the scene goes on after it', draw.answer && draw.fought === 1
    && has(draw, /empty cup/) && !has(draw, /every rookery|keeping a book/)],
  ['every ending closes on Wren going north', r.endings.every((e) => has(e, /count it off the wagons/))],
  ['your own maester is recalled, at home', r.recalled.fired && has(r.recalled, /recalled me/)],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
if (bad) {
  for (const [k, v] of Object.entries(r)) {
    const one = Array.isArray(v) ? v : [v];
    for (const e of one) if (e && typeof e === 'object') console.log(`  ${k}: fired=${e.fired} fought=${e.fought} walked=${e.walked} :: ${(e.said ?? '').slice(0, 300)}`);
  }
}
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
