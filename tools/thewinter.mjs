/* The Long Night, on the browser build.
 *
 * The cartridge has had a winter that climbs all game since it was written:
 * every seat taken, every step of the last act and every sixth grave push it
 * on, and once it meets the cold of the ground you are standing on, a share of
 * whatever comes out of the grass is not what lives there any more. This build
 * had none of it — the same three roads at the same strength from the first
 * morning to the last — so the two builds told different stories about the
 * same realm.
 *
 * Everything below fails without src/data/winter.js and the wiring that reads
 * it. Run it with: node tools/thewinter.mjs
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
}, 11);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const [i, s, st, b, m, w, c, td] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/game/state.js'),
    import('/src/ui/textbox.js'), import('/src/data/maps.js'), import('/src/data/winter.js'),
    import('/src/game/creature.js'), import('/src/art/tiles.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, dialog: b.dialog,
    MAPS: m.MAPS, tileAt: m.tileAt, regionOf: m.regionOf, winter: w, creature: c, tiles: td };
});

const out = await page.evaluate(async () => {
  const { input, scenes, state, dialog, MAPS, tileAt, regionOf, winter, creature, tiles } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { window.__turn(n); await breathe(); };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;
  for (let i = 0; i < 400 && scene() !== 'Overworld'; i++) await tap(i % 2 ? 'a' : 'start');
  if (scene() !== 'Overworld') return { fail: `stuck on ${scene()}` };
  const ow = scenes.current;
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');

  const res = {};
  const you = state.game.state.player;
  const setStage = (n) => { you.winter = n * winter.WINTER_STEP; state.clearRaven(); you.winterSaid = n; };

  /* ---- a fresh realm is a long summer, and nothing is walking ---------- */
  res.freshStage = state.winterStage();
  res.freshWord = state.seasonWord();

  const walksOn = (mapId, stage) => {
    setStage(stage);
    ow.loadMap(mapId, { x: 1, y: 1, dir: 'down' });
    return ow.theDeadWalkHere();
  };
  /* The North is cold 4: it takes three stages of winter to meet seven. */
  res.northAt2 = walksOn('kingsroadNorth', 2);
  res.northAt3 = walksOn('kingsroadNorth', 3);
  /* Beyond the Wall is cold 6 and gets there a stage sooner than the Wall. */
  res.wallAt2 = walksOn('castleBlack', 2);
  /* Dorne is cold 1 and only ever gets there in the Long Night itself. */
  res.dorneAt5 = walksOn('princesPass', 5);
  res.dorneAt6 = walksOn('princesPass', 6);
  /* And nothing is coming to Meereen, or into anybody's front room. */
  res.meereenAt6 = walksOn('meereen', 6);
  res.indoorsAt6 = walksOn('heroHouse', 6);

  /* ---- the clock climbs off the things the player does ---------------- */
  you.winter = 0; you.winterSaid = 0; you.kills = 0; state.clearRaven();
  state.game.state.sigils.length = 0;
  state.awardSigil('wolf');
  res.perSigil = you.winter;
  state.awardSigil('wolf');                 // the same seat twice is not two seats
  res.sigilTwice = you.winter;
  for (let i = 0; i < 6; i++) state.markDead(`nobody${i}`);
  res.perSixGraves = you.winter - 9;
  state.winterFalls(2);
  res.afterFalls = you.winter - 9;

  /* ---- one raven per stage, and never the same one twice -------------- */
  you.winter = 0; you.winterSaid = 0; state.clearRaven();
  res.quietRaven = state.takeRaven();        // nothing has happened yet
  state.deepenWinter(winter.WINTER_STEP * 3);
  res.ravenStage = state.takeRaven();        // the newest stage, once
  res.ravenAgain = state.takeRaven();        // and not again
  state.deepenWinter(winter.WINTER_STEP);
  res.ravenNext = state.takeRaven();
  /* A stage already reported does not report itself again after a fall. */
  state.winterFalls(winter.WINTER_STEP);
  state.deepenWinter(winter.WINTER_STEP);
  res.ravenReheard = state.takeRaven();

  /* ---- and the overworld says it out loud ----------------------------- */
  setStage(0);
  state.deepenWinter(winter.WINTER_STEP);
  ow.loadMap('kingsroadNorth', { x: 1, y: 1, dir: 'down' });
  res.ravenShown = ow.checkRaven();
  res.ravenText = (dialog.pages?.[0] ?? []).join(' ').slice(0, 40);
  res.ravenOnce = ow.checkRaven();

  /* ---- what walks out of the grass on cold ground --------------------- */
  /* Somebody to fight with. What the road decides is read off the fight it
     asks for rather than by sitting through four thousand of them: startBattle
     is stubbed so a sweep is arithmetic, and one real fight is played at the
     end to prove the other end of the wire. */
  state.game.state.party.length = 0;
  state.game.state.party.push(creature.createCreature('direwolf', 30));
  you.level = 30; you.wounded = false;

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

  const sweep = (mapId, stage, tries) => {
    setStage(stage);
    const spot = coverTile(mapId);
    if (!spot) return { skipped: true };
    ow.loadMap(mapId, spot);
    asked.length = 0;
    for (let i = 0; i < tries; i++) ow.checkEncounter();
    const dead = asked.filter((c) => winter.isOneOfTheDead(c.foe?.speciesId)).length;
    return { dead, fights: asked.length, stage: state.winterStage(), walk: ow.theDeadWalkHere(),
      region: ow.region };
  };
  /* The same road, twice: its own table already has a wight or two on it, so
     what the winter changes is not whether the dead are ever there but how
     much of the road they are. */
  res.coldSweep = sweep('kingsroadNorth', 5, 4000);
  res.warmSweep = sweep('kingsroadNorth', 0, 4000);

  /* And a road with nothing living on it at all. Without the winter reaching
     past an empty table this ground stays empty forever, which is most of the
     ground in the game worth being frightened of. */
  const bare = Object.keys(MAPS).find((id) => !MAPS[id].indoor && !(MAPS[id].encounters?.length)
    && winter.coldOf(regionOf(id), false) >= 5 && coverTile(id));
  res.bareRoad = bare ?? null;
  if (bare) {
    res.bareCold = sweep(bare, 6, 4000);
    res.bareWarm = sweep(bare, 0, 4000);
  }

  /* Nothing is coming to Meereen, at any stage, on any of its ground. */
  setStage(6);
  res.eastWalks = Object.keys(MAPS).filter((id) => {
    const r = regionOf(id);
    if (!['Braavos', 'Pentos', 'Volantis', 'Meereen', 'The Narrow Sea'].includes(r)) return false;
    ow.loadMap(id, { x: 1, y: 1, dir: 'down' });
    return ow.theDeadWalkHere();
  });

  /* ---- levels that are a fight rather than a wall --------------------- */
  setStage(6);
  ow.loadMap('hauntedForest', coverTile('hauntedForest') ?? { x: 1, y: 1, dir: 'down' });
  asked.length = 0;
  for (let i = 0; i < 400; i++) ow.rollTheDead();
  const levels = asked.map((c) => c.foe.level);
  res.rose = levels.length;
  res.worstOver = levels.length ? Math.max(...levels) - you.level : null;
  res.kinds = [...new Set(asked.map((c) => c.foe.speciesId))].sort();

  /* ---- and putting one down buys the winter back ---------------------- */
  /* One fight, played rather than counted. What the road decides is proved
     above; this is the other end of the wire — the Watch hearing about it.
     A wightling picked off the bottom of the ladder, because a fight this test
     can lose proves nothing either way. */
  ow.startBattle = real;
  setStage(4);
  state.game.state.party.length = 0;
  state.game.state.party.push(creature.createCreature('direwolf', 60));
  const before = you.winter;
  /* One box rather than a bare variable: the linter cannot see that a promise
     callback writes to it, and it is right not to try. */
  const box = { of: null };
  ow.startBattle({ kind: 'wild', foe: creature.createCreature('wightling', 3) })
    .then((o) => { box.of = o; });
  for (let i = 0; i < 6000 && box.of === null; i++) await tap('a');
  res.fought = box.of;
  res.backOut = scene();
  res.bought = before - you.winter;

  /* And a fight that was never one of them leaves the winter where it was. */
  const after = you.winter;
  box.of = null;
  ow.startBattle({ kind: 'wild', foe: creature.createCreature('snowpup', 3) })
    .then((o) => { box.of = o; });
  for (let i = 0; i < 6000 && box.of === null; i++) await tap('a');
  res.livingFight = box.of;
  res.boughtByLiving = after - you.winter;

  /* ---- a ranging, which is the only way back down ---------------------- */
  /* Who will send you north. A ranging is the one thing in the game that
     pushes the winter back, so it wants somebody standing in every place a
     player frightened by a raven would think to go. */
  const black = [];
  for (const [id, m] of Object.entries(MAPS)) {
    for (const n of m.npcs ?? []) if (ow.ranger(n)) black.push(`${id}:${n.name}`);
  }
  res.brothers = black;
  res.spokeTo = [];

  /* The live list rather than the written one: a map builds its crowd on
     arrival, so who is actually standing there is only knowable once you are. */
  const talkTo = async (mapId) => {
    ow.loadMap(mapId, { x: 1, y: 1, dir: 'down' });
    await turn(20);
    const n = ow.npcs.find((who) => !who.hidden && ow.ranger(who));
    if (!n) return null;
    const D = { up: [0, -1, 'down'], down: [0, 1, 'up'], left: [-1, 0, 'right'], right: [1, 0, 'left'] };
    const [dx, dy, face] = D[n.dir ?? 'down'];
    ow.player.x = n.x + dx; ow.player.y = n.y + dy; ow.player.dir = face;
    await turn(4);
    ow.interact();
    res.spokeTo.push(`${mapId}:${n.name}`);
    let said = '';
    for (let i = 0; i < 200 && ow.script; i++) {
      said += ' ' + (dialog.pages ?? []).flat().join(' ');
      await tap('a');
    }
    return said;
  };

  /* Too green for it. */
  setStage(3);
  you.rangeWant = 0; you.rangeGot = 0; you.rangings = 0; you.level = 4;
  res.greenSaid = await talkTo('castleBlack');
  res.greenTook = state.ranging().want;

  /* Old enough, and the count grows with the winter. */
  you.level = 30;
  res.tookSaid = await talkTo('castleBlack');
  res.tookWant = state.ranging().want;

  /* Not done yet. */
  res.midSaid = await talkTo('eastwatch');
  res.midWant = state.ranging().want;

  /* Put them down — and only the dead count. */
  for (let i = 0; i < 3; i++) state.countTowardRanging();
  const partWay = state.ranging().got;
  for (let i = 0; i < 20; i++) state.countTowardRanging();
  res.gotCap = state.ranging().got;
  res.partWay = partWay;

  /* And hand it in. */
  const purse = you.money;
  const cold = you.winter;
  res.doneSaid = await talkTo('castleBlack');
  res.paid = you.money - purse;
  res.thaw = cold - you.winter;
  res.doneCount = state.ranging().done;
  res.clear = state.ranging().want;
  /* Which is worth more when it is worse. */
  setStage(6);
  you.level = 30;
  await talkTo('castleBlack');
  res.deepWant = state.ranging().want;

  return { res };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.res;
const rows = [
  ['a fresh realm is a long summer', r.freshStage === 0 && r.freshWord === 'a long summer'],
  ['the North is quiet two stages in', r.northAt2 === false],
  ['and they are on it at three', r.northAt3 === true],
  ['the Wall goes first', r.wallAt2 === true],
  ['Dorne holds out until the Long Night', r.dorneAt5 === false && r.dorneAt6 === true],
  ['nothing is coming to Meereen', r.meereenAt6 === false],
  ['nor into anybody\'s front room', r.indoorsAt6 === false],
  ['a seat taken is nine of winter', r.perSigil === 9],
  ['the same seat twice is not', r.sigilTwice === 9],
  ['and every sixth grave is one more', r.perSixGraves === 1],
  ['putting one of them down buys it back', r.afterFalls === -1],
  ['no raven until something happens', r.quietRaven === -1],
  ['then one, for the stage it reached', r.ravenStage === 3],
  ['and not the same one twice', r.ravenAgain === -1 && r.ravenReheard === -1],
  ['the next stage writes again', r.ravenNext === 4],
  ['the overworld hands it over once', r.ravenShown === true && r.ravenOnce === false],
  ['and it reads like a letter', /raven/i.test(r.ravenText)],
  ['the dead are most of a cold road', r.coldSweep.fights > 40
    && r.coldSweep.dead / r.coldSweep.fights > 0.4],
  ['and a much smaller share of the same road before it reaches there',
    r.warmSweep.fights > 40 && r.warmSweep.dead / r.warmSweep.fights
      < r.coldSweep.dead / r.coldSweep.fights - 0.3],
  ['and none of Essos at all, at any stage', r.eastWalks?.length === 0],
  ['the dead reach a road with no table of its own',
    Boolean(r.bareRoad) && r.bareCold?.dead > 40 && r.bareCold.dead === r.bareCold.fights],
  ['and that road is empty until they do', r.bareWarm?.fights === 0],
  ['never more than five levels over you', r.worstOver !== null && r.worstOver <= 5],
  ['and it is a walker in the Long Night', r.kinds?.includes('palewalker')],
  ['putting one down in a real fight buys the winter back',
    r.fought === 'won' && r.backOut === 'Overworld' && r.bought === 2],
  ['and killing something that was alive does not',
    r.livingFight === 'won' && r.boughtByLiving === 0],
  ['there is a brother in black to walk up to, in more than one place',
    (r.brothers?.length ?? 0) >= 5],
  ['a green boy is not sent over the Wall',
    /no use to us yet/.test(r.greenSaid ?? '') && r.greenTook === 0],
  ['a ranging asks for three and the winter\'s own count',
    /take a ranging/.test(r.tookSaid ?? '') && r.tookWant === 6],
  ['and asks for more when it is worse', r.deepWant === 9],
  ['any brother remembers you are out on one',
    /still out on the last one/.test(r.midSaid ?? '') && r.midWant === 6],
  ['the count runs up and stops where they asked',
    r.partWay === 3 && r.gotCap === 6],
  ['handing it in pays, and pushes the winter back',
    /that is the count/i.test(r.doneSaid ?? '') && r.paid === 750 && r.thaw === 34],
  ['and leaves you free to take another', r.doneCount === 1 && r.clear === 0],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
console.log('  cold road:', JSON.stringify(r.coldSweep), ' warm:', JSON.stringify(r.warmSweep));
console.log(`  ${r.bareRoad} (no table of its own): cold`, JSON.stringify(r.bareCold),
  ' warm', JSON.stringify(r.bareWarm));
console.log('  worst over you:', r.worstOver, ' kinds:', (r.kinds ?? []).join(' '),
  ' rose:', r.rose, ' fight:', r.fought, r.backOut, 'bought', r.bought,
  ' living:', r.livingFight, r.boughtByLiving);
console.log('  brothers in black:', (r.brothers ?? []).join(', '));
console.log('  spoke to:', (r.spokeTo ?? []).join(', '));
console.log('  ranging:', r.tookWant, '->', r.gotCap, 'paid', r.paid, 'thaw', r.thaw,
  ' deepest asks', r.deepWant);
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
