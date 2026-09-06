/* The story gates, played: a scene that needs another must not fire first,
   one that can happen anywhere must find you off its own tile, and the
   answer you gave must be remembered as a flag. */
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
  const [i, s, st, b, m, c] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/game/state.js'),
    import('/src/ui/textbox.js'), import('/src/data/maps.js'), import('/src/data/cutscenes.js')]);
  window.__game = { input: i.input, scenes: s.scenes, state: st, dialog: b.dialog, MAPS: m.MAPS, CUTSCENES: c.CUTSCENES };
});
const out = await page.evaluate(async () => {
  const { input, scenes, state, dialog, CUTSCENES } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { window.__turn(n); await breathe(); };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;
  for (let i = 0; i < 400 && scene() !== 'Overworld'; i++) await tap(i % 2 ? 'a' : 'start');
  if (scene() !== 'Overworld') return { fail: `stuck on ${scene()}` };
  const ow = scenes.current;
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');

  /* A scene fires when you STEP onto the ground, so put the hero one tile
     off and walk them on. */
  const walkOnto = async (map, x, y) => {
    for (const [dx, dy, key] of [[0, -1, 'down'], [0, 1, 'up'], [-1, 0, 'right'], [1, 0, 'left']]) {
      ow.loadMap(map, { x: x + dx, y: y + dy, dir: key });
      await turn(20);
      if (ow.player.x !== x + dx || ow.player.y !== y + dy) continue;
      input.press(key); await turn(40); input.release(key); await turn(20);
      if (ow.player.x === x && ow.player.y === y) return true;
    }
    return false;
  };
  const play = async (id, at) => {
    const cs = CUTSCENES[id];
    let walked = await walkOnto(cs.map, at ? at[0] : cs.x, at ? at[1] : cs.y);
    /* If that tile will not take a step, any tile on the map will do for a
       scene that can happen anywhere. */
    if (!walked && cs.anywhere) {
      for (let r = 1; r <= 6 && !walked; r++) {
        for (let dy = -r; dy <= r && !walked; dy++) {
          for (let dx = -r; dx <= r && !walked; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            walked = await walkOnto(cs.map, cs.x + dx, cs.y + dy);
          }
        }
      }
    }
    for (let i = 0; i < 900 && (ow.busy || dialog.visible); i++) await tap('a');
    (res.walks ??= []).push({ id, walked, at: [ow.player.x, ow.player.y], map: ow.mapId,
      needs: cs.needs, hasNeed: Boolean(state.flag(cs.needs ?? '')), sig: state.sigilCount(),
      fired: Boolean(state.flag(cs.flag)) });
    return Boolean(state.flag(cs.flag));
  };

  const res = {};
  window.__res = res;
  /* Gated: it must refuse to fire before the flag it waits on is set. */
  res.gatedBefore = await play('whoPaidHim');
  /* Granted, rather than played: the scene it waits on can end in a fight,
     and a hero carried home from one is not standing on the road any more. */
  state.setFlag('theFollower_1');
  for (const h of ['stark', 'tully', 'arryn']) {
    if (!state.game.state.sigils.includes(h)) state.game.state.sigils.push(h);
  }
  res.gatedAfter = await play('whoPaidHim');
  /* Anywhere: fired well off its own tile. */
  {
    const cs = CUTSCENES.aWhisperInTheDark;
    let where = null;
    const ring = [];
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      if (Math.abs(dx) + Math.abs(dy) >= 3) ring.push([dx, dy]);
    }
    for (const [dx, dy] of ring) {
      if (await walkOnto(cs.map, cs.x + dx, cs.y + dy)) { where = [cs.x + dx, cs.y + dy]; break; }
    }
    res.anywhereWalked = Boolean(where);
    for (let i = 0; i < 900 && (ow.busy || dialog.visible); i++) await tap('a');
    res.anywhere = Boolean(state.flag(cs.flag));
    res.anywhereIsSet = Boolean(cs.anywhere);
    res.anywhereAt = where;
    res.stoodAt = [ow.player.x, ow.player.y, ow.mapId];
  }
  /* And a sigil gate holds while you hold nothing. */
  res.sigils = state.sigilCount();
  res.sigilGated = await play('theOfferInTheSept');   /* wants five, and holds at three */

  /* Last, because whichever answer is pressed this one can end in steel:
     whatever you say, the saying of it has to be remembered as a flag. */
  {
    const cs = CUTSCENES.theFollower;
    await walkOnto(cs.map, cs.x, cs.y);
    for (let i = 0; i < 900; i++) {
      await tap('a');
      if (!ow.busy && !dialog.visible && i > 6) break;
    }
    res.follower = Boolean(state.flag('cs_follower'));
    res.flagsSet = Object.keys(state.game.state.flags).filter((k) => /^theFollower_\d/.test(k));
    res.answerFlag = res.flagsSet.length >= 1;
  }
  return { res };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.res;
const rows = [
  ['a gated scene refuses to fire before its flag is set', r.gatedBefore === false],
  ['the scene it waits on plays', r.follower === true],
  ['the answer you gave is remembered as a flag', r.answerFlag === true],
  ['and then the gated scene fires', r.gatedAfter === true],
  ['a walk reached a tile that is not the scene\'s own', r.anywhereWalked === true],
  ['an "anywhere" scene finds you off its own tile', r.anywhere === true],
  [`a scene wanting five seats holds at ${r.sigils}`, r.sigilGated === false],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
for (const w of r.walks ?? []) console.log('  walk', JSON.stringify(w));
console.log('  follower flags:', JSON.stringify(r.flagsSet), 'anywhere target', JSON.stringify(r.anywhereAt), 'stood', JSON.stringify(r.stoodAt));
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
