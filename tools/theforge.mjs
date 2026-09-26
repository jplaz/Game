/* The forge nobody could leave.
 *
 * The random playtest sat at Mikken's forge in Winterfell for forty thousand
 * frames, pressing every key there is, and the forge took none of them. One
 * press of A had done two things. It answered "Call out Mikken?" with "Draw
 * steel" - and then, the box being shut by then, the world read the same press
 * as speaking to Mikken, and his forge opened. The duel the answer had asked
 * for was pushed over the forge; the duel's first prompt cancelled the forge's
 * own question; and the forge, told to close, popped the top of the stack,
 * which was the duel. What was left was a forge at its first question with
 * nobody asking it.
 *
 * This plays that press, at the forge and at a maester's counter, and then the
 * two things that keep a screen like this from ever being a trap again: a
 * forge closing under another screen takes itself away and not the screen over
 * it, and a forge left at its first question asks it again.
 *
 * Run it with: node tools/theforge.mjs
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
}, 97);
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(async () => {
  const [i, s, b, sm] = await Promise.all([
    import('/src/engine/input.js'), import('/src/engine/scenes.js'), import('/src/ui/textbox.js'),
    import('/src/scenes/smithy.js')]);
  window.__game = { input: i.input, scenes: s.scenes, dialog: b.dialog, Smithy: sm.Smithy };
});

const out = await page.evaluate(async () => {
  const { input, scenes, dialog, Smithy } = window.__game;
  const breathe = () => new Promise((r) => { setTimeout(r, 0); });
  const turn = async (n) => { for (let i = 0; i < n; i++) { window.__turn(1); await breathe(); } };
  const tap = async (k) => { input.press(k); await turn(4); input.release(k); await turn(4); };
  const scene = () => scenes.current?.constructor?.name;
  const stack = () => scenes.stack.map((x) => x.constructor?.name ?? '?').join(' > ');
  for (let i = 0; i < 400 && scene() !== 'Overworld'; i++) await tap(i % 2 ? 'a' : 'start');
  if (scene() !== 'Overworld') return { fail: `stuck on ${scene()}` };
  const ow = scenes.current;
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');

  /* Stand beside somebody who keeps a counter, call them out, and answer
     "Draw steel" with one press of A. Then watch what the stack does. */
  const callOut = async (mapId, name, x, y, dir) => {
    ow.loadMap(mapId, { x, y, dir });
    await turn(2);
    const who = ow.npcs.find((n) => n.name === name);
    if (!who) return { missing: `${name} on ${mapId}` };
    await tap('challenge');
    /* The question is read first, and A on it brings the menu up. */
    for (let i = 0; i < 60 && !dialog.choice; i++) await tap('a');
    if (!dialog.choice) return { noQuestion: true, said: dialog.pages?.flat().join(' ') };
    const asked = dialog.pages?.flat().join(' ');
    await tap('a');
    let counterOpened = false;
    let duelled = false;
    let spokeTo = false;
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
      await turn(1);
      seen.add(stack());
      /* Their own greeting is the first thing speaking to them does, well
         before any forge opens - and on the old build the forge only opened
         after the duel, when that conversation picked up again. */
      if (dialog.visible && (dialog.pages ?? []).flat().join(' ').startsWith(`${name}:`)) spokeTo = true;
      if (scenes.stack.some((x) => ['Smithy', 'Shop'].includes(x.constructor?.name))) counterOpened = true;
      if (scenes.stack.some((x) => x.constructor?.name === 'Duel')) duelled = true;
    }
    return { asked, counterOpened, spokeTo, duelled, ended: stack(), seen: [...seen] };
  };

  const res = {};
  res.forge = await callOut('winterfellForge', 'Mikken', 6, 1, 'right');
  /* Out of the fight and back to the world, whichever way it went, before the
     next one. */
  for (let i = 0; i < 6000 && scene() !== 'Overworld'; i++) await tap(i % 3 ? 'a' : 'b');
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');
  res.counter = await callOut('maesterHallWinterfell', 'Vayon Poole', 9, 1, 'left');
  for (let i = 0; i < 6000 && scene() !== 'Overworld'; i++) await tap(i % 3 ? 'a' : 'b');
  for (let i = 0; i < 3000 && ow.busy; i++) await tap('a');

  /* A forge that closes while something else has been pushed over it. */
  {
    const forge = new Smithy({ stock: {}, onClose: () => {} });
    scenes.push(forge);
    for (let i = 0; i < 60 && !dialog.choice; i++) await tap('a');
    const over = { update() {}, draw() {} };
    scenes.push(over);
    dialog.show('Something else entirely.');   // cancels the forge's question
    await turn(4);
    res.closedUnder = { forgeGone: !scenes.stack.includes(forge), overKept: scenes.stack.includes(over) };
    scenes.remove?.(over);
    if (scenes.stack.includes(over)) scenes.stack.splice(scenes.stack.indexOf(over), 1);
    if (scenes.stack.includes(forge)) scenes.stack.splice(scenes.stack.indexOf(forge), 1);
    dialog.close();
    await turn(4);
  }

  /* A forge left at its first question with nothing asking it. */
  {
    const forge = new Smithy({ stock: {}, onClose: () => {} });
    scenes.push(forge);
    for (let i = 0; i < 60 && !dialog.choice; i++) await tap('a');
    await tap('b');                              // leave: the question is answered
    const gone = !scenes.stack.includes(forge);
    /* The state the playtest found: at the first question, nothing running,
       nothing on the box. Pushed as it stands rather than asked, which is
       exactly the forge the duel left behind. */
    const stale = new Smithy({ stock: {}, onClose: () => {} });
    stale.enter = () => {};
    scenes.push(stale);
    await turn(4);
    res.recovers = { leftWithB: gone, askedAgain: Boolean(stale.script) || dialog.busy };
    for (let i = 0; i < 10 && scenes.stack.includes(stale); i++) {
      for (let j = 0; j < 60 && !dialog.choice; j++) await tap('a');
      await tap('b');
    }
    res.recovers.leftAfter = !scenes.stack.includes(stale);
  }
  return { res };
});
await browser.close();
server.close();
if (out.fail) { console.log(out.fail); process.exit(1); }
const r = out.res;
const rows = [
  ['calling out Mikken asks the question', /Call out Mikken\?/.test(r.forge.asked ?? '')],
  ['answering it does not also speak to him', r.forge.spokeTo === false],
  ['or open his forge', r.forge.counterOpened === false],
  ['it starts the duel it asked for', r.forge.duelled === true],
  ['calling out the steward asks the question', /Call out Vayon Poole\?/.test(r.counter.asked ?? '')],
  ['answering it does not also speak to him', r.counter.spokeTo === false],
  ['or open his counter', r.counter.counterOpened === false],
  ['it starts the duel it asked for', r.counter.duelled === true],
  ['a forge closing under another screen takes itself away',
    r.closedUnder?.forgeGone === true],
  ['and leaves the screen over it where it was', r.closedUnder?.overKept === true],
  ['B at the forge\'s first question leaves', r.recovers?.leftWithB === true],
  ['a forge left at its first question asks it again', r.recovers?.askedAgain === true],
  ['and can then be left', r.recovers?.leftAfter === true],
];
let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
if (bad) console.log(JSON.stringify(r, null, 2).slice(0, 3000));
if (thrown.length) { console.log('\nthrown:'); for (const t of thrown) console.log('  ' + t); }
process.exit(bad || thrown.length ? 1 : 0);
