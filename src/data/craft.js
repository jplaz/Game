// What you can make out of what you take.
//
// Gold was the only thing loot was worth, and by the middle of the game there
// was more of it than there were things to spend it on. Materials are the other
// half: they come off the people and beasts you beat and out of the long grass,
// they are worth nothing at a counter, and the best kit in the game cannot be
// bought at any price - only forged.
//
// A recipe is claimed at a counter: `forge` at a smith, `brew` at a maester's
// hall. `needs` is a list of [material, count]; `gold` is what the smith wants
// for the work on top of it.

export const MATERIALS = {
  ashHaft: {
    name: 'Ash Haft', tier: 0,
    desc: 'Seasoned ash, straight-grained. Half of everything with an edge starts here.',
  },
  ironScrap: {
    name: 'Iron Scrap', tier: 0,
    desc: 'Broken mail and bent blades. A smith sees a bar of iron; you see a bad afternoon.',
  },
  boiledHide: {
    name: 'Boiled Hide', tier: 0,
    desc: 'Hardened in wax until it turns a glancing cut. Smells like a tannery for a month.',
  },
  greenbriar: {
    name: 'Greenbriar', tier: 0,
    desc: 'A creeping weed the maesters will not grow and will not be without.',
  },
  poppySeed: {
    name: 'Poppy Seed', tier: 1,
    desc: 'Sweet, grey, and the reason nobody screams in a maester’s hall.',
  },
  boarTusk: {
    name: 'Boar Tusk', tier: 1,
    desc: 'Yellow, curved and heavier than it looks. It was doing a job before you took it.',
  },
  direwolfPelt: {
    name: 'Direwolf Pelt', tier: 2,
    desc: 'Grey and thick as a hand. Whatever wore it did not give it up easily.',
  },
  dragonglass: {
    name: 'Dragonglass Shard', tier: 2,
    desc: 'Obsidian off the Dragonmont. It takes an edge nothing else will hold.',
  },
  fireblood: {
    name: 'Dragon’s Blood', tier: 3,
    desc: 'A stoppered vial, and it is warm. Nobody will say where it came from.',
  },
  valyrianShard: {
    name: 'Valyrian Shard', tier: 3,
    desc: 'A finger of rippled steel from a blade somebody broke. Nobody alive can make more.',
  },
};

export const MATERIAL_IDS = Object.keys(MATERIALS);

/**
 * What you throw over something to take it alive, and what you carry home from
 * a nest. These are wares like anything else - they sit in the same pouch and
 * the same record - but using one in a duel with an animal tries to take it
 * rather than to hurt it.
 */
export const SNARES = {
  snare: {
    name: 'Wire Snare', price: 150, hold: 24,
    desc: 'A noose on a springer. Good for a hare, and for a wolf if it is tired enough.',
  },
  netTrap: {
    name: 'Weighted Net', price: 600, hold: 46,
    desc: 'Lead beads round a hemp mesh. It goes where you throw it and stays there.',
  },
  greatNet: {
    name: 'Kraken Net', price: 2400, hold: 74,
    desc: 'Ironborn work, made for hauling something up that did not want to come.',
  },
};

export const EGG_ITEMS = {
  dragonEgg: {
    name: 'Dragon Egg', price: 0,
    desc: 'Heavy, scaled, and warm to the hand. Twelve fights of carrying it and it moves.',
  },
  direwolfPup: {
    name: 'Wolf Pup', price: 0,
    desc: 'Blind, grey, and complaining. Four fights of carrying it and it opens its eyes.',
  },
};

/**
 * What comes off somebody you beat, by how hard they were. One roll picks the
 * band, a second picks within it, so a fight is worth opening the pouch for at
 * every level rather than only at the end.
 */
export const SPOILS = [
  { upTo: 9,  drops: ['ashHaft', 'ironScrap', 'boiledHide', 'greenbriar'] },
  { upTo: 19, drops: ['ironScrap', 'boiledHide', 'boarTusk', 'ashHaft', 'poppySeed'] },
  { upTo: 29, drops: ['ironScrap', 'boiledHide', 'boarTusk', 'direwolfPelt', 'poppySeed'] },
  { upTo: 38, drops: ['ironScrap', 'direwolfPelt', 'dragonglass', 'boarTusk', 'poppySeed'] },
  { upTo: 99, drops: ['dragonglass', 'valyrianShard', 'fireblood', 'direwolfPelt', 'ironScrap'] },
];

/** And what is lying about in the long grass, which is mostly green things. */
export const FORAGE = ['greenbriar', 'ashHaft', 'poppySeed', 'boiledHide', 'greenbriar'];

export const RECIPES = [
  // ------------------------------------------------------------ the forge ---
  { at: 'forge', makes: 'huntingKnife',      gold: 60,   needs: [['ironScrap', 1]] },
  { at: 'forge', makes: 'cudgel',            gold: 20,   needs: [['ashHaft', 2]] },
  { at: 'forge', makes: 'hideTarge',         gold: 40,   needs: [['boiledHide', 2]] },
  { at: 'forge', makes: 'ironSword',         gold: 220,  needs: [['ironScrap', 2], ['ashHaft', 1]] },
  { at: 'forge', makes: 'woodAxe',           gold: 260,  needs: [['ironScrap', 2], ['ashHaft', 2]] },
  { at: 'forge', makes: 'boiledLeather',     gold: 300,  needs: [['boiledHide', 3]] },
  { at: 'forge', makes: 'heaterShield',      gold: 240,  needs: [['ashHaft', 3], ['ironScrap', 1]] },
  { at: 'forge', makes: 'longsword',         gold: 480,  needs: [['ironScrap', 4], ['ashHaft', 1]] },
  { at: 'forge', makes: 'studdedBrigandine', gold: 500,  needs: [['boiledHide', 4], ['ironScrap', 2]] },
  { at: 'forge', makes: 'morningstar',       gold: 640,  needs: [['ironScrap', 5], ['boarTusk', 1]] },
  { at: 'forge', makes: 'ringmail',          gold: 760,  needs: [['ironScrap', 6]] },
  { at: 'forge', makes: 'boarSpear',         gold: 880,  needs: [['ironScrap', 3], ['ashHaft', 3], ['boarTusk', 2]] },
  { at: 'forge', makes: 'oakShield',         gold: 520,  needs: [['ashHaft', 4], ['ironScrap', 2]] },
  { at: 'forge', makes: 'castleForged',      gold: 1100, needs: [['ironScrap', 8], ['ashHaft', 1]] },
  { at: 'forge', makes: 'scaleArmour',       gold: 1300, needs: [['ironScrap', 8], ['boiledHide', 4]] },
  { at: 'forge', makes: 'warhammer',         gold: 1400, needs: [['ironScrap', 9], ['ashHaft', 2]] },
  { at: 'forge', makes: 'ironboundShield',   gold: 900,  needs: [['ashHaft', 5], ['ironScrap', 4]] },
  { at: 'forge', makes: 'dragonglassDagger', gold: 1200, needs: [['dragonglass', 3], ['ashHaft', 1]] },
  { at: 'forge', makes: 'greatsword',        gold: 1900, needs: [['ironScrap', 12], ['ashHaft', 2]] },
  { at: 'forge', makes: 'towerShield',       gold: 1500, needs: [['ashHaft', 6], ['ironScrap', 5]] },
  { at: 'forge', makes: 'splintMail',        gold: 2200, needs: [['ironScrap', 12], ['boiledHide', 5]] },
  { at: 'forge', makes: 'ironwoodTower',     gold: 2600, needs: [['ashHaft', 9], ['ironScrap', 8]] },
  { at: 'forge', makes: 'dragonboneBow',     gold: 2800, needs: [['dragonglass', 2], ['ashHaft', 4], ['direwolfPelt', 2]] },
  { at: 'forge', makes: 'knightPlate',       gold: 3200, needs: [['ironScrap', 16], ['boiledHide', 6]] },
  // The end of the ladder. None of these is on any counter in the world at any
  // price, which is the point: the last of your gear is made, not bought.
  { at: 'forge', makes: 'ancestralBlade',    gold: 5000, needs: [['ironScrap', 18], ['valyrianShard', 1], ['direwolfPelt', 3]] },
  { at: 'forge', makes: 'dragonscaleMail',   gold: 5400, needs: [['dragonglass', 6], ['boiledHide', 8], ['valyrianShard', 1]] },
  { at: 'forge', makes: 'valyrian',          gold: 9000, needs: [['valyrianShard', 5], ['dragonglass', 4], ['fireblood', 1]] },
  { at: 'forge', makes: 'kingsguardPlate',   gold: 8000, needs: [['valyrianShard', 3], ['ironScrap', 22], ['boiledHide', 10]] },

  // --------------------------------------------------------- the maester ---
  { at: 'brew', makes: 'maesterKit',  gold: 30,  needs: [['greenbriar', 1]] },
  { at: 'brew', makes: 'poppyMilk',   gold: 90,  needs: [['poppySeed', 2], ['greenbriar', 1]] },
  { at: 'brew', makes: 'weirwoodSap', gold: 240, needs: [['greenbriar', 4], ['poppySeed', 2]] },
  { at: 'brew', makes: 'kingsRansom', gold: 700, needs: [['fireblood', 1], ['greenbriar', 3], ['poppySeed', 2]] },

  // ------------------------------------------------------- what holds them ---
  { at: 'forge', makes: 'snare',     gold: 60,   needs: [['ironScrap', 1], ['ashHaft', 1]] },
  { at: 'forge', makes: 'netTrap',   gold: 300,  needs: [['ironScrap', 3], ['boiledHide', 2]] },
  { at: 'forge', makes: 'greatNet',  gold: 1400, needs: [['ironScrap', 8], ['boiledHide', 6], ['direwolfPelt', 2]] },
];
