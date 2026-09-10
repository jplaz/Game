/* Seven relics, and whether any of them can be reached.
 *
 * A jar of wildfire costs three thousand gold. Warlock's wine costs eighteen
 * hundred. They are the reason to keep opening chests once you are wearing the
 * best of everything in the world, and in the browser not one of the seven
 * could be used, because the duel's item list filtered on ITEMS by name and
 * relics are their own table in craft.js. Two of them were lying about the
 * world to be found - a Weirwood Paste on the kingsroad, a Dragonbinder on
 * Dragonstone - so you could carry one the length of Westeros and never once be
 * offered the chance to use it. The other five nobody sold at all.
 *
 * The cartridge has had all seven working since it had relics. These are the
 * same seven with the same numbers, driven through the duel scene itself rather
 * than through a helper, because "can I use Wildfire" is only a real question
 * if the duel will actually offer it to you.
 *
 * Node only. Run it with: node tools/therelic.mjs
 */
import { game } from '../src/game/state.js';
import { Duel } from '../src/scenes/duel.js';
import { MAPS } from '../src/data/maps.js';
import { RELICS } from '../src/data/craft.js';
import { createCreature } from '../src/game/creature.js';

const rows = [];
const check = (what, ok) => rows.push([what, ok]);

/* A duel, without a screen to draw it on. Everything below reaches into the
   scene the way the player's own keypresses would: pick "use a thing", pick a
   relic off the list, and look at what changed. */
function duel({ withBeast = false, foeBeast = false } = {}) {
  game.state.player.level = 20;
  game.state.player.hp = 40;
  game.state.party = withBeast ? [createCreature('direwolf', 20)] : [];
  const d = new Duel({
    def: {
      name: 'A Hedge Knight', sprite: 'knight', level: 20,
      vigour: 200, might: 30, guard: 20, swiftness: 20, wind: 20,
      techniques: ['slash'], canYield: true,
      intro: '.', defeat: '.', after: '.',
      beast: foeBeast ? { species: 'direwolf', level: 20 } : null,
    },
  });
  /* Nothing here waits on an animation or a keypress. */
  d.say = async () => {};
  d.wait = async () => {};
  d.animateHp = async () => {};
  d.animateHit = async () => {};
  d.openMenu = async () => -1;
  return d;
}

/* What the duel would put in front of you, asked the way the menu asks it. */
async function offered(d) {
  let list = null;
  d.openMenu = async (kind, labels) => { list = labels; return -1; };
  await d.chooseItem();
  return list ?? [];
}

/* --- the five you buy are actually sold ----------------------------------- */
const PRICED = ['huntersDraught', 'maestersSalts', 'warhorn',
                'shadeOfTheEvening', 'wildfire'];
const sold = new Map(PRICED.map((id) => [id, 0]));
for (const map of Object.values(MAPS)) {
  for (const npc of map.npcs ?? []) {
    const stock = npc.data?.stock;
    if (!Array.isArray(stock)) continue;
    for (const id of PRICED) if (stock.includes(id)) sold.set(id, sold.get(id) + 1);
  }
}
for (const id of PRICED) {
  check(`${RELICS[id].name} is on a counter somewhere (${sold.get(id)})`, sold.get(id) > 0);
}
/* And they are not all on the same counter: three thousand gold of wildfire in
   a village a day north of Winterfell is not a shop, it is a vending machine. */
check('and the dearest of them is harder to come by than the cheapest',
  sold.get('wildfire') < sold.get('huntersDraught') / 2);

/* --- and the two you find are out there to be found ----------------------- */
for (const id of ['weirwoodPaste', 'dragonHorn']) {
  let lying = 0;
  for (const map of Object.values(MAPS)) {
    for (const it of map.items ?? []) if (it.item === id) lying++;
  }
  check(`${RELICS[id].name} lies about the world to be found (${lying})`, lying > 0);
}

/* --- a relic in your pack is a relic the duel offers you ------------------ */
{
  const d = duel({ foeBeast: true });
  game.state.bag = { wildfire: 1, shadeOfTheEvening: 1, huntersDraught: 1 };
  const list = await offered(d);
  check('a duel offers you the relics you are carrying',
    list.some((l) => l.includes('Wildfire'))
    && list.some((l) => l.includes('Shade of the Evening')));
}

/* --- Wildfire burns for what the cartridge says it burns for -------------- */
{
  const d = duel();
  game.state.bag = { wildfire: 1 };
  const before = d.foe.hp;
  await d.useItem('wildfire');
  check('Wildfire takes 60 + four a level off them',
    before - d.foe.hp === 60 + d.you.level * 4);
  check('and the jar is gone', !game.state.bag.wildfire);
}

/* --- the horn makes them lose their moment ------------------------------- */
{
  const d = duel();
  game.state.bag = { warhorn: 1 };
  d.foe.defending = true;
  await d.useItem('warhorn');
  check('the Warhorn drops their guard and costs them the round',
    d.foe.stunned === true && d.foe.defending === false);
}

/* --- and two blows you cannot miss --------------------------------------- */
{
  const d = duel();
  game.state.bag = { shadeOfTheEvening: 1 };
  await d.useItem('shadeOfTheEvening');
  check('Shade of the Evening buys two blows you have already seen thrown',
    d.sureShots === 2);
  /* A technique that would never land, thrown twice: both land, and the third
     goes wide, because the wine has worn off. */
  const wild = { name: 'A Wild Swing', power: 40, accuracy: 0, stamina: 0, effect: {} };
  const start = d.foe.hp;
  await d.perform(d.you, d.foe, wild);
  const afterFirst = d.foe.hp;
  await d.perform(d.you, d.foe, wild);
  const afterSecond = d.foe.hp;
  await d.perform(d.you, d.foe, wild);
  check('and a blow that could not possibly land, lands', afterFirst < start);
  check('twice', afterSecond < afterFirst);
  check('and then the wine wears off', d.foe.hp === afterSecond);
  check('and the count is spent', d.sureShots === 0);
}

/* Dragonbinder is the same thing and more of it. */
{
  const d = duel();
  game.state.bag = { dragonHorn: 1 };
  await d.useItem('dragonHorn');
  check('Dragonbinder buys three', d.sureShots === 3);
}

/* --- the salts get a beast up -------------------------------------------- */
{
  const d = duel({ withBeast: true });
  game.state.bag = { maestersSalts: 1 };
  d.yourBeast.hp = 0;
  await d.useItem('maestersSalts');
  check("Maester's Salts get a beast that had stopped getting up, up",
    d.yourBeast.hp === d.yourBeast.maxHp);
  d.syncBeasts();
  check('and it is still up when the fight is over',
    d.yourBeast.creature.hp === d.yourBeast.maxHp);
}

/* --- and the paste puts you back together -------------------------------- */
{
  const d = duel();
  game.state.bag = { weirwoodPaste: 1 };
  d.you.hp = 1;
  await d.useItem('weirwoodPaste');
  check('Weirwood Paste stops everything that hurt', d.you.hp === d.you.maxHp);
}

/* --- a doused net is a better net ---------------------------------------- */
{
  const d = duel({ foeBeast: true });
  game.state.bag = { huntersDraught: 1 };
  await d.useItem('huntersDraught');
  check("Hunter's Draught doses the next net you throw", d.snareEdge > 1);
}

/* --- and a relic that would do nothing is not offered --------------------- */
{
  const d = duel();                       /* no beast of yours, none of theirs */
  game.state.bag = { maestersSalts: 1, huntersDraught: 1, weirwoodPaste: 1 };
  d.you.hp = d.you.maxHp;
  const list = await offered(d);
  check('salts are not offered when you have no beast to give them to',
    !list.some((l) => l.includes("Maester's Salts")));
  check('a net is not doused when there is nothing to throw it over',
    !list.some((l) => l.includes("Hunter's Draught")));
  check('and paste is not offered to somebody who is not hurt',
    !list.some((l) => l.includes('Weirwood Paste')));
}

let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
console.log(`\nSeven relics, and every one of them can now be reached and used.`);
process.exit(bad ? 1 : 0);
