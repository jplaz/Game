import { MATERIALS, RELICS, SNARES, OATHS, EGG_ITEMS } from './craft.js';
import { WEAPONS, ARMOUR, SHIELDS, HELMS, GLOVES } from './gear.js';

// Bag items. `use` describes the effect declaratively so the bag menu and the
// battle scene can share one application routine.

export const ITEMS = {
  // ---- banners: thrown to swear a wild creature to your service -----------
  sigilBanner: {
    name: 'Sigil Banner', price: 200, pocket: 'banners', bonus: 1,
    use: { kind: 'catch' },
    desc: 'A plain banner. Wild creatures that respect it may swear to you.',
  },
  warBanner: {
    name: 'War Banner', price: 600, pocket: 'banners', bonus: 1.5,
    use: { kind: 'catch' },
    desc: 'Battle-worn colours. Noticeably better at winning a creature over.',
  },
  kingsguardBanner: {
    name: 'Kingsguard Banner', price: 1200, pocket: 'banners', bonus: 2,
    use: { kind: 'catch' },
    desc: 'White silk and gold thread. Few wild things refuse it.',
  },
  weirwoodBanner: {
    name: 'Weirwood Banner', price: 0, pocket: 'banners', bonus: 3.5,
    use: { kind: 'catch' },
    desc: 'Carved sigil of the old gods. Almost nothing refuses it.',
  },

  // ---- restoratives ------------------------------------------------------
  maesterKit: {
    name: "Maester's Kit", price: 300, pocket: 'medicine',
    use: { kind: 'heal', amount: 20 },
    desc: 'Bandages and boiled wine. Restores 20 HP.',
  },
  poppyMilk: {
    name: 'Milk of the Poppy', price: 700, pocket: 'medicine',
    use: { kind: 'heal', amount: 50 },
    desc: 'Dulls any pain. Restores 50 HP.',
  },
  weirwoodSap: {
    name: 'Weirwood Sap', price: 1500, pocket: 'medicine',
    use: { kind: 'heal', amount: 200 },
    desc: 'Sap from a heart tree. Restores 200 HP.',
  },
  kingsRansom: {
    name: "King's Ransom", price: 2500, pocket: 'medicine',
    use: { kind: 'fullHeal' },
    desc: 'Restores all HP and cures any affliction.',
  },
  antidote: {
    name: 'Antidote', price: 150, pocket: 'medicine',
    use: { kind: 'cure', status: 'poison' },
    desc: 'Draws out venom.',
  },
  burnSalve: {
    name: 'Burn Salve', price: 150, pocket: 'medicine',
    use: { kind: 'cure', status: 'burn' },
    desc: 'Cools a burn.',
  },
  frostTonic: {
    name: 'Frost Tonic', price: 150, pocket: 'medicine',
    use: { kind: 'cure', status: 'freeze' },
    desc: 'Thaws a frozen creature.',
  },
  wakingDraught: {
    name: 'Waking Draught', price: 150, pocket: 'medicine',
    use: { kind: 'cure', status: 'sleep' },
    desc: 'Rouses a sleeping creature.',
  },
  stillwater: {
    name: 'Stillwater', price: 150, pocket: 'medicine',
    use: { kind: 'cure', status: 'paralyze' },
    desc: 'Loosens locked muscles.',
  },
  kissOfFire: {
    name: 'Kiss of Fire', price: 1800, pocket: 'medicine',
    use: { kind: 'revive', ratio: 0.5 },
    desc: 'A red priest\'s blessing. Revives a fainted creature to half HP.',
  },

  // ---- key items ---------------------------------------------------------
  ravenScroll: {
    name: 'Raven Scroll', price: 0, pocket: 'key', key: true,
    desc: 'A sealed message from Maester Luwin. It names you his errand-rider.',
  },
  dragonglass: {
    name: 'Dragonglass Shard', price: 0, pocket: 'key', key: true,
    desc: 'Obsidian, worked to an edge. Cold things fear it.',
  },
  houseRing: {
    name: 'Signet Ring', price: 0, pocket: 'key', key: true,
    desc: 'Proof that you ride on Winterfell\'s business.',
  },
};

export const POCKETS = ['banners', 'medicine', 'key'];
export const POCKET_NAMES = { banners: 'BANNERS', medicine: 'REMEDIES', key: 'KEY ITEMS' };

/* Everything else the world can leave lying about.
 *
 * maps.js is shared with the cartridge, and the cartridge has systems this
 * build does not: crafting, relics, snares, oaths, and a gear ladder. So the
 * maps scatter forty-two kinds of thing across the world - a Direwolf Pelt in
 * the Weeping Barrow, a Bastard Sword in the Sealord's Palace - that are real
 * entries in craft.js and gear.js and were never in ITEMS. Picking any of them
 * up threw "Unknown item" out of the pickup script, and before the speech box
 * learned to let go of an abandoned promise that took the whole game with it.
 *
 * They go in the bag under their own name, in the pocket that holds whatever
 * has no pocket of its own. This build cannot forge with a pelt or swing a
 * bastard sword, but a thing you picked up should at least be a thing you
 * have, with the name the rest of the game calls it by. */
const ELSEWHERE = [MATERIALS, RELICS, SNARES, OATHS, EGG_ITEMS, WEAPONS, ARMOUR,
                   SHIELDS, HELMS, GLOVES];

export function item(id) {
  const found = ITEMS[id];
  if (found) return { id, ...found };
  for (const table of ELSEWHERE) {
    const other = table?.[id];
    if (other) return { id, pocket: 'key', price: 0, ...other };
  }
  throw new Error(`Unknown item: ${id}`);
}
