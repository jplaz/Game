/* Steel that wears out.
 *
 * A sword bought at Winterfell was the same sword at the Iron Throne, in the
 * same condition, nine hundred fights later. Nothing in this build ever wore
 * out — which quietly turned seventeen smiths into seventeen shops, because a
 * forge whose only trade is selling you a newer sword is a shop with an anvil
 * in it.
 *
 * The cartridge has had this since the gear ladder was written. This is that,
 * with the same numbers.
 *
 * Run it with: node tools/thewear.mjs
 */
import { game } from '../src/game/state.js';
import {
  gearLife, lifeLeft, wearOn, conditionWord, mendCost, mendAll, neverWears,
  wantsMending, equip, equipped, giveGear, playerStats,
} from '../src/game/player.js';
import { gear } from '../src/data/gear.js';

const rows = [];
const check = (what, ok) => rows.push([what, ok]);
const p = game.state.player;
const fresh = () => {
  p.level = 20;
  p.gearOwned = { weapon: [], armour: [], helm: [], gloves: [], shield: [] };
  p.equipment = { weapon: 'fists', armour: 'roughspun', shield: 'none',
                  helm: 'bareHead', gloves: 'bareHands' };
  p.wear = {};
  p.money = 20000;
};

/* ---- life is worth what the thing cost, up to a ceiling ----------------- */
fresh();
check('a dearer piece lasts longer',
  gearLife('weapon', 'ironSword') > gearLife('weapon', 'huntingKnife'));
check('and nothing lasts more than a hundred and forty',
  gearLife('weapon', 'ironSword') <= 140 && gearLife('armour', 'ringmail') <= 140);

/* ---- and what cannot be replaced cannot be destroyed --------------------- */
const PRICELESS = [['weapon', 'valyrian'], ['weapon', 'direWarhammer'],
  ['weapon', 'dragonglassDagger'], ['armour', 'castellanPlate'],
  ['armour', 'kingsguardPlate'], ['helm', 'dragonscaleHelm'],
  ['helm', 'kingsguardHelm'], ['gloves', 'dragonscaleGrips'],
  ['gloves', 'kingsguardGauntlets']];
check('nothing you cannot buy again can ever be worn out',
  PRICELESS.every(([slot, id]) => neverWears(slot, id)));
fresh();
giveGear('weapon', 'valyrian');
equip('weapon', 'valyrian');
for (let i = 0; i < 500; i++) wearOn('weapon', 1);
check('five hundred blows and Valyrian steel is exactly as it was',
  equipped('weapon').id === 'valyrian' && conditionWord('weapon') === 'sound'
  && wantsMending() === false);

/* ---- your bare hands do not wear out ------------------------------------ */
fresh();
const bare = wearOn('weapon', 1);
check('there is nothing to wear out about your fists',
  bare.broke === null && lifeLeft('weapon') === gearLife('weapon', 'fists'));

/* ---- a real blade dulls, blow by blow ----------------------------------- */
fresh();
giveGear('weapon', 'ironSword');
equip('weapon', 'ironSword');
const full = gearLife('weapon', 'ironSword');
check('a new sword is sound', lifeLeft('weapon') === full && conditionWord('weapon') === 'sound');
for (let i = 0; i < Math.ceil(full / 4) + 1; i++) wearOn('weapon', 1);
check('and stops being sound once you have used it', conditionWord('weapon') !== 'sound');
const words = new Set();
fresh();
giveGear('weapon', 'ironSword');
equip('weapon', 'ironSword');
for (let i = 0; i < full; i++) { words.add(conditionWord('weapon')); wearOn('weapon', 1); }
check('and passes through every word on the way down',
  ['sound', 'worn', 'notched', 'about to go'].every((w) => words.has(w)));

/* ---- and then it goes ---------------------------------------------------- */
fresh();
giveGear('weapon', 'ironSword');
equip('weapon', 'ironSword');
let went = null;
for (let i = 0; i <= full; i++) { const r = wearOn('weapon', 1); if (r.broke) { went = r; break; } }
check('it breaks, at the life it was given', went?.broke === 'ironSword');
check('and does not go back in the pack',
  !(p.gearOwned.weapon ?? []).includes('ironSword'));
check('with nothing spare, you are down to your hands',
  equipped('weapon').id === 'fists' && went.drew === null);

/* ---- a spare is drawn because the first one broke ------------------------ */
fresh();
giveGear('weapon', 'ironSword');
giveGear('weapon', 'huntingKnife');
equip('weapon', 'ironSword');
const wasWorth = playerStats().might;
went = null;
for (let i = 0; i <= full; i++) { const r = wearOn('weapon', 1); if (r.broke) { went = r; break; } }
check('carrying a spare, it is in your hand before the other hits the ground',
  went?.drew === 'huntingKnife' && equipped('weapon').id === 'huntingKnife');
check('and the spare is whole', lifeLeft('weapon') === gearLife('weapon', 'huntingKnife'));
check('and you are worth less with the lesser blade in your hand',
  playerStats().might === wasWorth - gear('weapon', 'ironSword').might
    + gear('weapon', 'huntingKnife').might);

/* ---- the best spare, not the first ---------------------------------------- */
fresh();
giveGear('weapon', 'huntingKnife');
giveGear('weapon', 'castleForged');
giveGear('weapon', 'ironSword');
equip('weapon', 'ironSword');
for (let i = 0; i <= full; i++) if (wearOn('weapon', 1).broke) break;
check('and it is the best one you own, not the first in the list',
  equipped('weapon').id === 'castleForged');

/* ---- putting a piece on gives you its own condition ---------------------- */
fresh();
giveGear('armour', 'ringmail');
equip('armour', 'ringmail');
wearOn('armour', 5);
const part = lifeLeft('armour');
equip('armour', 'roughspun');
equip('armour', 'ringmail');
check('a slot you have changed comes back whole rather than half-dead',
  lifeLeft('armour') === gearLife('armour', 'ringmail') && part < gearLife('armour', 'ringmail'));

/* ---- and a smith puts it right -------------------------------------------- */
fresh();
giveGear('weapon', 'ironSword');
equip('weapon', 'ironSword');
check('nothing to mend on a fresh kit', wantsMending() === false && mendCost() === 0);
wearOn('weapon', 10);
check('a used blade wants a smith', wantsMending() === true && mendCost() > 0);
const dearer = mendCost();
wearOn('weapon', 20);
check('and the further gone it is the more it costs', mendCost() > dearer);
mendAll();
check('mending puts every piece back to sound',
  wantsMending() === false && conditionWord('weapon') === 'sound'
  && lifeLeft('weapon') === gearLife('weapon', 'ironSword'));

/* ---- an older save has no wear record at all ------------------------------ */
fresh();
giveGear('weapon', 'ironSword');
p.equipment.weapon = 'ironSword';
delete p.wear;
check('a save written before any of this reads back sound',
  conditionWord('weapon') === 'sound' && lifeLeft('weapon') === full);

let bad = 0;
for (const [what, ok] of rows) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'BAD '} ${what}`); }
console.log(`  an iron sword has ${full} blows in it;`,
  `a hunting knife ${gearLife('weapon', 'huntingKnife')};`,
  `valyrian steel ${gearLife('weapon', 'valyrian')}`);
process.exit(bad ? 1 : 0);
