/* The dragon over the town you wake in.
 *
 * A settled dragon's clock ran on fights won and nothing else. One you could
 * not beat was one you kept losing to, so it never burned the town and never
 * left - and settled over the town you wake in, that was a loop with no way
 * out of it: go down to it, be carried home, walk into the grass, meet it
 * again, for as long as you kept playing. Every fight lost to it costs the
 * town now, the same as a fight spent anywhere else.
 *
 * Node only. Run it with: node tools/thedragon.mjs
 */
import { game, newGame } from '../src/game/state.js';
import { dragonAfterLoss, settledOn } from '../src/game/swoop.js';

const rows = [];
const check = (what, ok) => rows.push([what, ok]);

game.state = newGame('A');
game.state.sigils = ['wolf', 'trout', 'lion'];
const p = game.state.player;
p.swoopMap = 'riverrun';
p.swoopAt = 3;
p.swoopsBurned = 0;

dragonAfterLoss('kingsroad', 'dreadwyrm');
check('going down to a dragon somewhere else does not touch this one', p.swoopAt === 3);
dragonAfterLoss('riverrun', 'direwolf');
check('nor does going down to something else over the town', p.swoopAt === 3);
dragonAfterLoss('riverrun', 'dreadwyrm');
dragonAfterLoss('riverrun', 'scaleflight');
check('going down to it over its town runs its clock down', p.swoopAt === 1 && settledOn() === 'riverrun');
dragonAfterLoss('riverrun', 'dreadwyrm');
check('and when the clock runs out, the town burns', p.swoopsBurned === 1);
check('and it is gone, rather than waiting there for ever', settledOn() === null);

let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
process.exit(bad ? 1 : 0);
