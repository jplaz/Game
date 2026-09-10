/* What happens to a thing you pick up off the ground.
 *
 * Sixty pieces of gear lie about this world - a sellsword's blade in a nook
 * behind the Wall, ringmail in a Riverlands alcove - and every one of them used
 * to go into the pouch under its own name and stay there. Buying a sword at a
 * forge puts it on your rack; taking one off a beaten man puts it on your rack;
 * finding one on the ground did neither, so you could carry a blade from the
 * Wolfswood to the Iron Throne and never once be able to draw it.
 *
 * items.js said so outright and had done for a long time: "This build cannot
 * forge with a pelt or swing a bastard sword."
 *
 * Node only - none of this touches a canvas. Run it with:
 *   node tools/thefind.mjs
 */
import { game } from '../src/game/state.js';
import { equipped, ownedGear } from '../src/game/player.js';
import { slotOfGear } from '../src/data/gear.js';
import { SCRIPTS } from '../src/data/scripts.js';
import { MAPS } from '../src/data/maps.js';

const rows = [];
const check = (what, ok) => rows.push([what, ok]);

/* The pickup script wants somewhere to say things and somewhere to set flags.
   Neither matters here; what matters is where the thing ends up. */
const said = [];
const flags = new Set();
const pick = (subject) => SCRIPTS.pickup({
  subject,
  say: async (line) => { said.push(line); },
  setFlag: (f) => flags.add(f),
});

/* --- a sword found on the ground is a sword you can draw ------------------ */
const p = game.state.player;
p.gearOwned = { weapon: ['fists'], armour: ['roughspun'], shield: ['none'] };
p.equipment = { weapon: 'fists', armour: 'roughspun', shield: 'none' };
p.wear = {};

await pick({ x: 0, y: 0, item: 'sellswordBlade', flag: 'test_blade' });
check('a sword found on the ground goes on your rack',
  ownedGear('weapon').includes('sellswordBlade'));
check('and with nothing in your hands, straight into them',
  equipped('weapon').id === 'sellswordBlade');
check('and it is not left rattling in the pouch as an oddment',
  !game.state.bag.sellswordBlade);
check('and the ground remembers it is gone', flags.has('test_blade'));

/* --- and it does not shove aside what you are already carrying ------------ */
const before = equipped('weapon').id;
await pick({ x: 0, y: 0, item: 'cudgel', flag: 'test_cudgel' });
check('a second find is owned but does not take the sword out of your hand',
  ownedGear('weapon').includes('cudgel') && equipped('weapon').id === before);

/* --- things that are not gear still behave exactly as they did ------------ */
await pick({ x: 0, y: 0, item: 'ashHaft', count: 3, flag: 'test_haft' });
check('makings still go into the pouch, three of them',
  game.state.bag.ashHaft === 3);
check('and makings are not mistaken for gear', slotOfGear('ashHaft') === null);

/* --- a purse is coin rather than a thing ---------------------------------- */
const purse = game.state.player.money;
await pick({ x: 0, y: 0, gold: 240, flag: 'test_purse' });
check('a purse is counted rather than carried',
  game.state.player.money === purse + 240 && !game.state.bag.undefined);

/* --- and there is gear out there to find in the first place --------------- */
let onTheGround = 0;
for (const map of Object.values(MAPS)) {
  for (const it of map.items ?? []) if (it.item && slotOfGear(it.item)) onTheGround++;
}
check(`there is gear lying about the world to find (${onTheGround} pieces)`,
  onTheGround >= 50);

/* --- and what you make of what you find ----------------------------------
 *
 * Eighty-three recipes sat in craft.js with no way to reach any of them. The
 * forge is asked here through the smith script itself rather than through the
 * helper, because "can you make a cudgel" is only a real question if a smith
 * will actually offer you one. */
game.state.bag.ashHaft = 2;
p.money = 500;
p.gearOwned = { weapon: ['fists'], armour: ['roughspun'], shield: ['none'] };
p.equipment = { weapon: 'fists', armour: 'roughspun', shield: 'none' };
p.wear = {};

let offered = null;
const rackBefore = ownedGear('weapon');
await SCRIPTS.smith({
  say: async () => {},
  /* Take the first thing offered, then decline, so the loop ends. */
  choose: async (text, options) => {
    if (offered === null) { offered = options.slice(); return 0; }
    return options.length - 1;
  },
  npc: { data: {} },
  openSmithy: async () => {},
});

const rackAfter = ownedGear('weapon');
check('a smith offers to make what your materials allow',
  offered !== null && offered.some((o) => o.includes('Ash Haft')));
check('and what it offers is named by what it costs',
  offered !== null && offered.some((o) => /\+ \d+g$/.test(o)));
/* Dearest first, so the first thing offered is the quarterstaff rather than
   the cudgel - both are two hafts, and one is worth twice the other. */
check('the thing chosen is on the rack afterwards', rackAfter.length > rackBefore.length);
check('the ash it was made from is gone', !game.state.bag.ashHaft);
check('and it was paid for', p.money < 500);

/* Nothing offered when there is nothing to make it from. */
let secondAsk = null;
await SCRIPTS.smith({
  say: async () => {},
  choose: async (text, options) => { secondAsk = options.slice(); return options.length - 1; },
  npc: { data: {} },
  openSmithy: async () => {},
});
check('and an empty pack is not asked what it wants forged', secondAsk === null);

let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
console.log(`\n${onTheGround} pieces of gear lie about the world, and they can be worn.`);
process.exit(bad ? 1 : 0);
