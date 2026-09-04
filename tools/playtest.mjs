/*
 * Plays the browser game.
 *
 * The cartridge has had a tester for a long time: it boots the ROM, presses the
 * buttons, walks the world and climbs to the chair as all nine houses, and
 * nearly every real fault in this project was found by it rather than by
 * anybody looking. The browser build - which is the same game, thirty thousand
 * lines of it - had nothing of the kind. Its tools check the tables, walk the
 * maps and draw pictures; not one of them had ever pressed a key. A scene that
 * threw on entry, a menu with no way out, a fight that could not end: none of
 * that is visible to a data checker, and all of it is visible here.
 *
 * It drives the shipped entry point rather than a copy of it. Time is the only
 * thing replaced: requestAnimationFrame and performance.now are swapped for a
 * clock this file turns by hand, so a run that would take an hour of wall time
 * takes as long as the machine needs and not a second more. Everything else -
 * index.html, main.js, the scene stack, the input map - is exactly what a
 * player loads.
 *
 *   node tools/playtest.mjs [frames] [seed]
 */
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = resolve(process.cwd());
const FRAMES = Number(process.argv[2] ?? 120000);
const SEED = Number(process.argv[3] ?? 1);

/* Every screen the game can put in front of you.
 *
 * Read out of the source rather than written down here. A run that reaches
 * four screens out of twelve and says only "scenes reached: Title, Overworld,
 * Duel, MainMenu" reads like a success, and the eight it never opened are
 * exactly the ones nothing has ever pressed a key on - which is where the
 * lock-up it did find was living. Listing what went unplayed makes that
 * silence say something, and a screen added later joins the list on its own. */
async function screensInSource() {
  const dir = new URL('../src/scenes/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.js'));
  const sources = await Promise.all(files.map((f) => readFile(new URL(f, dir), 'utf8')));
  return sources
    .flatMap((src) => [...src.matchAll(/^export class (\w+)/gm)].map((m) => m[1]))
    .sort();
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const target = join(ROOT, normalize(path === '/' ? '/index.html' : path));
  if (!target.startsWith(ROOT)) return void res.writeHead(403).end();
  try {
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
const SCREENS = await screensInSource();

await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 400 } });

/* Anything the page throws is a finding, whether it comes out of a scene, a
   frame, or a promise nobody awaited. */
const thrown = [];
page.on('pageerror', (e) => thrown.push(String(e.message).split('\n')[0]));
page.on('console', (m) => {
  if (m.type() === 'error') thrown.push('console: ' + m.text().split('\n')[0]);
});
page.on('requestfailed', (r) => thrown.push('never loaded: ' + r.url().replace(/^http:\/\/[^/]+/, '')));

/* The clock, installed before a line of the game runs. Nothing else about the
   page is touched: the game asks for a frame the way it always does and gets
   one when this file says so. */
await page.addInitScript((seed) => {
  /* The game's own dice, made to fall the same way twice.
   *
   * Twenty-one places reach for Math.random, and makeRng seeds itself from
   * Date.now, so two runs of the same seed went different ways and a finding
   * could not be looked at again. Both are answered here: a seeded stream for
   * Math.random, and a clock that starts at nought. */
  let a = (seed >>> 0) || 1;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let now = 0;
  let waiting = [];
  window.requestAnimationFrame = (cb) => waiting.push(cb);
  window.cancelAnimationFrame = () => {};
  performance.now = () => now;
  Date.now = () => now;
  window.__turn = (n) => {
    for (let i = 0; i < n; i++) {
      now += 1000 / 60;
      const due = waiting;
      waiting = [];
      for (const cb of due) cb(now);
    }
  };
}, SEED);

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });

/* The game's own singletons, by the same URLs main.js imported them from, so
   these are the very objects it is using and not a second copy. */
await page.evaluate(async () => {
  const [inputMod, sceneMod, stateMod, boxMod, mapMod] = await Promise.all([
    import('/src/engine/input.js'),
    import('/src/engine/scenes.js'),
    import('/src/game/state.js'),
    import('/src/ui/textbox.js'),
    import('/src/data/maps.js'),
  ]);
  window.__game = {
    input: inputMod.input, scenes: sceneMod.scenes,
    state: stateMod, dialog: boxMod.dialog, MAPS: mapMod.MAPS,
  };
});

const report = await page.evaluate(
  async ({ frames, seed }) => {
    const { input, scenes, state, dialog, MAPS } = window.__game;
    const findings = [];
    const said = new Set();
    const finding = (s) => {
      if (said.has(s)) return;
      said.add(s);
      findings.push(s);
    };

    /* Its own dice, so a run can be repeated exactly. */
    let rng = seed >>> 0 || 1;
    const roll = (n) => {
      rng ^= rng << 13; rng >>>= 0;
      rng ^= rng >> 17;
      rng ^= rng << 5; rng >>>= 0;
      return rng % n;
    };

    const ACTIONS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];
    /* A direction is held, because walking is a thing you keep doing. A
       button is released and pressed again every time, because the game asks
       "was this pressed this frame" and a thumb resting on a key answers no
       after the first one. Getting that backwards is how the first run of this
       sat on the title screen for three thousand frames pressing A. */
    const BUTTON = new Set(['a', 'b', 'start', 'select', 'ride', 'challenge']);
    let holding = null;
    const hold = (action) => {
      if (action && BUTTON.has(action)) {
        if (holding) input.release(holding);
        input.press(action);
        holding = action;
        return;
      }
      if (holding === action) return;
      if (holding) input.release(holding);
      holding = action;
      if (action) input.press(action);
    };

    const sceneName = () => scenes.current?.constructor?.name ?? '(nothing)';

    /* Breadth-first from where we stand to where we are going, over the
       scene's own blocked(), and the answer is the first step of it. Stops at
       a few thousand tiles so a big map cannot cost a visible pause. */
    const DIRS = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
    const pathStep = (ow, sx, sy, gx, gy) => {
      if (sx === gx && sy === gy) return null;
      const w = ow.map?.width ?? 0, h = ow.map?.height ?? 0;
      if (!w || !h) return null;
      const from = new Int32Array(w * h).fill(-1);
      const queue = [sy * w + sx];
      from[sy * w + sx] = -2;
      let head = 0, seenTiles = 0;
      while (head < queue.length && seenTiles++ < 6000) {
        const at = queue[head++];
        const ax = at % w, ay = (at / w) | 0;
        if (ax === gx && ay === gy) {
          /* Walk the trail back to the tile beside where we started. */
          let cur = at;
          while (from[cur] >= 0 && from[from[cur]] !== -2) cur = from[cur];
          const cx = cur % w, cy = (cur / w) | 0;
          for (const [name, ddx, ddy] of DIRS) {
            if (sx + ddx === cx && sy + ddy === cy) return name;
          }
          return null;
        }
        for (const [, ddx, ddy] of DIRS) {
          const nx = ax + ddx, ny = ay + ddy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (from[ni] !== -1) continue;
          /* The goal itself may well be a wall - a door in one, or somebody
             standing on the only tile that reaches it - so it is always
             allowed as the last step. */
          if (!(nx === gx && ny === gy) && ow.blocked?.(nx, ny)) continue;
          from[ni] = at;
          queue.push(ni);
        }
      }
      return null;
    };

    /* The way out of here, towards somewhere we have not been.
     *
     * Choosing the nearest unvisited door is how this walked sixteen maps out
     * of two hundred and thirty-one and called it playing the game: every door
     * on the map you are standing in leads somewhere you have already been, so
     * it shrugs and takes one at random, and the corner of the world you
     * started in is the only corner you ever see. Doors are not the graph. The
     * world is: maps joined by warps. So search that, from the map underfoot
     * outwards, and the answer is which door on THIS map takes the first step
     * of the shortest way to ground nobody has stood on. It is the difference
     * between a wanderer and a crawler, and it is what puts a town, a shop and
     * a forge within reach of a run at all.
     *
     * Doors that did not open when aimed at - locked, conditional, or wanting
     * something we have not got - are passed in `shut` and left out of the
     * search, so one barred gate cannot swallow every route through it. */
    const routeOut = (from, visited, shut) => {
      const queue = [from];
      const cameFrom = new Map([[from, null]]);
      for (let head = 0; head < queue.length && head < 400; head++) {
        const id = queue[head];
        for (const w of MAPS[id]?.warps ?? []) {
          if (w.to === undefined || shut.has(`${id}:${w.x},${w.y}`)) continue;
          /* Found somewhere new. Walk the trail back to the first hop, which
             is a door on the map we are actually standing on. */
          if (!visited.has(w.to)) {
            let step = { id, warp: w };
            while (cameFrom.get(step.id)) step = cameFrom.get(step.id);
            return step.warp;
          }
          if (cameFrom.has(w.to)) continue;
          cameFrom.set(w.to, { id, warp: w });
          queue.push(w.to);
        }
      }
      return null;
    };

    const seen = {
      scenes: new Set(),
      maps: new Set(),
      battles: 0,
      duels: 0,
      talks: 0,
      goals: 0,
      counters: 0,
    };

    let lastScene = '';
    let sameFor = 0;
    let lastMap = '';
    let stillFor = 0;
    let lastX = -1, lastY = -1;
    let goal = null, goalMap = null, goalFor = 0;
    /* Which door we are walking at, and the ones that never let us in. */
    let aimed = null;
    const shut = new Set();

    /* Which script is running, when one is.
     *
     * runScript hangs its promise on this.script and clears it when the chain
     * settles, so a script that never settles leaves the overworld busy for
     * good and the player can never move again. Knowing that one is stuck is
     * no use without knowing which, so the tester wraps the call - passing
     * everything straight through - and remembers the name. */
    let lastScript = null;
    let patched = false;
    let stacked = 0;
    const patchScripts = (ow) => {
      if (patched || !ow) return;
      const proto = Object.getPrototypeOf(ow);
      const real = proto.runScript;
      if (typeof real !== 'function') return;
      proto.runScript = function (name, subject, extra) {
        const naming = `${name}${subject?.name ? ` (${subject.name})` : ''}`;
        /* A script started on top of one still running. The field only holds
           one, so the first one's chain is left pending for ever and whatever
           it was waiting on is never answered. */
        if (this.script) {
          finding(`the script "${naming}" started while "${lastScript}" was `
            + 'still running');
        }
        lastScript = naming;
        return real.call(this, name, subject, extra);
      };

      /* A speech box put up over one nobody has answered is no longer a
         fault: Textbox.settle lets the old promise go rather than abandoning
         it, so whoever was waiting is released instead of waiting for ever.
         It is worth counting, though - it means two things wanted to talk at
         once - so it is reported at the end rather than failing the run. */
      const realSay = dialog.say.bind(dialog);
      dialog.say = (text, opts) => {
        if (dialog.resolve || dialog.choiceResolve) stacked++;
        return realSay(text, opts);
      };
      patched = true;
    };

    /* The loop has to breathe.
     *
     * Scenes are pulled in with a dynamic import when they are first needed -
     * the title does it on the way to the overworld - and a promise waiting on
     * a module fetch cannot settle while this loop is turning frames without
     * ever yielding. The first version of this ran three thousand frames
     * without one, so the game finished its name pad and then sat for ever
     * with the overworld half imported, and the report said it never left the
     * title screen. */
    const breathe = () => new Promise((r) => setTimeout(r, 0));

    for (let f = 0; f < frames; f++) {
      window.__turn(1);
      if (f % 4 === 0) await breathe();

      const here = sceneName();
      seen.scenes.add(here);

      /* A scene that never gives way. The cartridge's tester has the same
         watch on it, and it is the one that catches a menu with no way out. */
      if (here === lastScene) sameFor++;
      else { sameFor = 0; lastScene = here; }
      if (sameFor === 40000) {
        /* Say what was holding it, not just that something was. A scene name
           on its own sends somebody back to watch an hour of it by hand. */
        const s2 = scenes.current ?? {};
        const why = [];
        if (s2.busy) why.push('busy');
        if (s2.script) why.push(`the script "${lastScript ?? 'unknown'}" never finished`);
        if (s2.cutscene) why.push('a cutscene is playing');
        if (s2.approach) why.push('somebody is walking up');
        if (s2.pendingEncounter) why.push('an encounter is pending');
        if (s2.player?.moving) why.push('the player is mid-step');
        if (s2.mount) why.push('mounted');
        if (dialog?.busy) {
          why.push(`a speech box is open (page ${dialog.pageIndex + 1} of `
            + `${dialog.pages?.length ?? '?'}, ${Math.floor(dialog.revealed ?? 0)} letters shown`
            + `${dialog.choice ? ', asking a question' : ''}`
            + `${dialog.autoCloseAfter > 0 ? ', closing itself' : ''})`);
        }
        const at = s2.player ? ` at ${s2.mapId} ${s2.player.x},${s2.player.y}` : '';
        finding(`the game sat in ${here}${at} for forty thousand frames`
          + (why.length ? ` (${why.join(', ')})` : ' with nothing blocking it'));
      }

      const st = state.game.state;
      if (st) {
        const where = st.position?.map;
        if (where) {
          seen.maps.add(where);
          if (where !== lastMap) { lastMap = where; stillFor = 0; }
        }
        /* Numbers that have stopped being numbers, which is what a divide by
           an empty party or a missing stat leaves behind. */
        if (Number.isNaN(st.player?.money)) finding('your purse is not a number any more');
        if (Number.isNaN(st.player?.hp)) finding('your own health is not a number any more');
        if (st.player && st.player.money < 0) finding('your purse has gone below nothing');
        for (const c of st.party ?? []) {
          if (c && Number.isNaN(c.hp)) finding(`${c.name ?? 'somebody'} has health that is not a number`);
          if (c && c.hp > c.maxHp) finding(`${c.name ?? 'somebody'} has more health than it can hold`);
        }
      }

      /* One button, chosen by where we are. Held for a few frames so the game
         sees it the way a thumb would, and the menus get their key repeat. */
      if (f % 6 !== 0) continue;

      switch (here) {
        /* A to get in, START to take the name it offers: the title puts a
           name pad up before it will start a game, and the pad ends on START
           with whatever has been typed or its own fallback. */
        case 'Title':
        case 'HallName':
        case 'ShipName':
          hold(roll(2) ? 'a' : 'start');
          break;

        case 'Credits':
        case 'Hatch':
          hold('a');
          break;

        case 'Battle':
          seen.battles++;
          hold('a');
          break;

        case 'Duel':
          seen.duels++;
          hold(f % 24 === 0 ? 'a' : ACTIONS[roll(4)]);
          break;

        case 'MainMenu':
        case 'Shop':
        case 'Smithy':
        case 'Court':
          /* Read a little of it, then leave. Nothing here should be able to
             hold on to a player who wants out. */
          hold(roll(6) === 0 ? 'b' : ACTIONS[roll(6)]);
          break;

        case 'Overworld': {
          const here2 = scenes.current;
          patchScripts(here2);
          /* Somebody is talking, or a cutscene is walking people about. You
             cannot move through that and neither can this: press on until the
             words are done. Holding a direction into an open speech box is how
             the first long run stood in Winterfell for forty thousand frames
             with a hundred and sixteen steps to its name. */
          if (here2.busy) { hold('a'); break; }
          const me = here2.player;
          const x = me?.x ?? -1, y = me?.y ?? -1;
          if (x === lastX && y === lastY) stillFor++;
          else { stillFor = 0; lastX = x; lastY = y; }

          /* Walk somewhere on purpose.
           *
           * A direction chosen at random and held is still not playing: over
           * twenty thousand frames it found two rooms and no fights, because
           * doors are small and a random walk does not look for them. So it
           * picks a door or a person on this map and steers, and takes a new
           * goal when it arrives, when it has been stuck against something for
           * a while, or when the map changes under it. */
          const doors = here2.map?.warps ?? [];
          const folk = here2.map?.npcs ?? [];
          const changed = here2.mapId !== goalMap;
          if (!goal || changed || goalFor <= 0 || stillFor > 20
              || (Math.abs(x - goal.x) + Math.abs(y - goal.y)) === 0) {
            /* A door leading somewhere new, for choice.
             *
             * Taking any door at random is how this spent twenty thousand
             * frames walking in and out of the same house: you step through,
             * and the nearest door on the other side is the one you just came
             * out of. Somewhere unvisited first, anywhere second. */
            /* A door we aimed at and never came through is a door that does
               not open for us. Remember it, or the route keeps sending us back
               to the same barred gate for the rest of the run. */
            if (aimed && !changed) shut.add(aimed);
            aimed = null;

            const onward = routeOut(here2.mapId, seen.maps, shut);
            const fresh = doors.filter((d) => !seen.maps.has(d.to));
            const pool = (roll(4) === 0 && folk.length) ? folk
              : onward ? [onward]
              : fresh.length ? fresh
              : doors.length ? doors : folk;
            goal = pool.length ? pool[roll(pool.length)] : null;
            if (goal?.to !== undefined) aimed = `${here2.mapId}:${goal.x},${goal.y}`;
            goalMap = here2.mapId;
            goalFor = 90;
            stillFor = 0;
            if (goal) seen.goals++;
          }
          goalFor--;

          if (!goal) { hold(['up', 'down', 'left', 'right'][roll(4)]); break; }

          /* The first step of the shortest way there, found with the game's
             own idea of what is walkable.
             *
             * Steering by "reduce the bigger of the two gaps" is not walking
             * through a castle, it is walking into the near wall of one and
             * staying there. The scene already knows what blocks a step, so
             * this asks it, and walks a real path. */
          const dx = goal.x - x, dy = goal.y - y;
          let want = pathStep(here2, x, y, goal.x, goal.y);
          if (!want) {
            const preferX = Math.abs(dx) > Math.abs(dy);
            if (preferX && dx !== 0) want = dx > 0 ? 'right' : 'left';
            else if (dy !== 0) want = dy > 0 ? 'down' : 'up';
            else if (dx !== 0) want = dx > 0 ? 'right' : 'left';
            else want = ['up', 'down', 'left', 'right'][roll(4)];
          }

          /* A door is walked onto; a person is stopped in front of. Treating
             the two the same left it standing beside every doorway in
             Winterfell pressing A at the frame, which is why twenty thousand
             frames found two rooms. */
          /* Into the menu now and then, which is a screen a player opens a
             hundred times a session and nothing here had ever looked at. */
          if (roll(60) === 0) { hold('start'); break; }
          const isDoor = goal.to !== undefined;
          /* A shopkeeper stands behind his counter, which is two tiles away
             and a wall in between. interact() knows that and reaches over a
             counter tile to find him; this did not, and only ever pressed A at
             arm's length. So in three hundred and eighty-six conversations
             across two thousand steps it had never once opened a shop or a
             forge - the two screens where you spend money, and the two the
             buying loop lives in. It would walk up to the counter, fail to
             arrive at a man it could not reach, give up and pick another goal.
             Reach across the counter the way the game does. */
          const sx = Math.sign(dx), sy = Math.sign(dy);
          const overCounter = Math.abs(dx) + Math.abs(dy) === 2 && (dx === 0 || dy === 0)
            && here2.map?.grid?.[y + sy]?.[x + sx] === 'K';
          if (!isDoor && (Math.abs(dx) + Math.abs(dy) <= 1 || overCounter)) {
            /* Talking happens down your nose: the first press of a direction
               only turns you. Walking into the counter faces you the right way
               already, but say it out loud rather than trust the approach. */
            if (overCounter && roll(3) === 0) { hold(want); break; }
            if (overCounter) seen.counters++;
            if (roll(5) === 0) { hold('challenge'); break; }
            seen.talks++;
            hold('a');
            break;
          }
          hold(want);
          break;
        }

        default:
          hold(roll(4) === 0 ? 'b' : 'a');
      }
    }
    hold(null);

    const st = state.game.state;
    return {
      findings,
      scenes: [...seen.scenes].sort(),
      maps: seen.maps.size,
      mapList: [...seen.maps],
      battles: seen.battles,
      duels: seen.duels,
      talks: seen.talks,
      goals: seen.goals,
      counters: seen.counters,
      stacked,
      level: st?.player?.level ?? null,
      money: st?.player?.money ?? null,
      sigils: st?.sigils?.length ?? null,
      party: st?.party?.length ?? null,
      map: st?.position?.map ?? null,
      steps: st?.player?.steps ?? null,
    };
  },
  { frames: FRAMES, seed: SEED },
);

await browser.close();
server.close();

const say = (label, value) => console.log(`  ${label.padEnd(16)} ${value}`);
console.log(`\nPlayed ${FRAMES} frames of the browser game, seed ${SEED}.\n`);
say('scenes reached', report.scenes.join(', ') || 'none');
say('maps walked', report.maps);
say('battles', report.battles);
say('duels', report.duels);
say('people talked to', report.talks);
say('over a counter', report.counters ?? 0);
say('places aimed for', report.goals ?? '?');
say('boxes replaced', report.stacked ?? 0);
say('ended in', `${report.map ?? '(nowhere)'}, level ${report.level ?? '?'}, ${report.money ?? '?'} gold`);
say('party', report.party ?? '?');
say('steps walked', report.steps ?? '?');
say('sigils', report.sigils ?? '?');

/* Not a fault - one short run has no business opening every screen in the
   game, and failing on that would only teach us to ignore the failure. It is
   the honest other half of the line above it: here is what this run played,
   and here is what it left shut. */
const unplayed = SCREENS.filter((s) => !report.scenes.includes(s));
say('never opened', unplayed.join(', ') || 'nothing - every screen was played');

const all = [...report.findings, ...thrown];
if (!all.length) {
  console.log('\n  nothing went wrong.\n');
  process.exit(0);
}
console.log(`\n  ${all.length} thing${all.length === 1 ? '' : 's'} to look at:`);
for (const f of all.slice(0, 20)) console.log(`    - ${f}`);
console.log();
process.exit(1);
