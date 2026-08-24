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
/**
 * What you put in front of somebody who has just lost to you.
 *
 * A net takes an animal. There was nothing at all that took a person, so every
 * road in the world was somebody to knock down and walk past, and the gold you
 * took off them piled up with nothing to spend it on. These are the other end
 * of that: a purse, a writ, a pardon under a seal. Used on somebody who has
 * yielded, they take an oath instead of a life, and whoever swears walks the
 * rest of the game behind you and swings when you swing.
 *
 * `hold` is how persuasive it is, on the same scale as a snare's.
 */
export const OATHS = {
  silverPurse: {
    name: 'Purse of Silver', price: 300, hold: 26,
    desc: 'Enough to make a hungry man reconsider who he is angry with.',
  },
  seaChest: {
    name: 'Sellsword\u2019s Chest', price: 1200, hold: 48,
    desc: 'A season\u2019s wages, counted out on the road. Most companies pay worse.',
  },
  lordsWarrant: {
    name: 'Lord\u2019s Warrant', price: 4000, hold: 68,
    desc: 'A writ of service under a seal. Refusing one is a thing with a name and a punishment.',
  },
  royalPardon: {
    name: 'Royal Pardon', price: 0, hold: 90,
    desc: 'Everything a man has done, struck out. Nobody sells these; they are given, and rarely.',
  },
};

export const SNARES = {
  birdLime: {
    name: 'Birdlime', price: 40, hold: 12,
    desc: 'Boiled holly bark on a stick. It will hold a small thing that is very tired.',
  },
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
  valyrianMesh: {
    name: 'Valyrian Mesh', price: 0, hold: 88,
    desc: 'Rippled steel drawn into wire. Nobody sells it and nobody living can make more.',
  },
  dragonchain: {
    name: 'Dragonchain', price: 0, hold: 96,
    desc: 'Links the Targaryens used on things that could otherwise leave. It has held worse than this.',
  },
};

/**
 * The end of the loot ladder.
 *
 * Every item in this game was gear, and gear stops mattering the moment you are
 * wearing the best of it - which by the end of the sigil ladder is a long time
 * before the game runs out. These are the things worth still opening a chest
 * for: they are used up rather than worn, they do things no piece of steel
 * does, and the best of them cannot be bought at any price.
 */
export const RELICS = {
  huntersDraught: {
    name: "Hunter's Draught", price: 400, heal: 0, snareBoost: 25,
    desc: 'Doused over a net before you throw it. Whatever you are throwing at minds a great deal less.',
  },
  warhorn: {
    name: 'Ironwood Warhorn', price: 900, might: 0,
    desc: 'One blast and whatever you are fighting spends the next few moments deciding whether to run.',
  },
  maestersSalts: {
    name: "Maester's Salts", price: 650,
    desc: 'Under the nose of something that has stopped getting up. It gets up.',
  },
  shadeOfTheEvening: {
    name: 'Shade of the Evening', price: 1800,
    desc: "Warlock's wine, thick and blue. You see the next blow before it is thrown.",
  },
  wildfire: {
    name: 'Wildfire', price: 3000,
    desc: 'A jar of green that burns on water and will not go out. The Guild will not say how much they have.',
  },
  weirwoodPaste: {
    name: 'Weirwood Paste', price: 0,
    desc: 'Ground seed and something else. Nobody who eats it will say what they saw.',
  },
  dragonHorn: {
    name: 'Dragonbinder', price: 0,
    desc: 'Valyrian glyphs down a horn six feet long. Blowing it costs the blower something.',
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
  { upTo: 99, drops: ['dragonglass', 'valyrianShard', 'fireblood', 'direwolfPelt', 'valyrianShard'] },
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
  { at: 'forge', makes: 'castellanPlate',    gold: 11000, needs: [['valyrianShard', 4], ['ironScrap', 26], ['direwolfPelt', 4]] },
  { at: 'forge', makes: 'direWarhammer',     gold: 12000, needs: [['dragonglass', 8], ['valyrianShard', 2], ['ashHaft', 10]] },
  { at: 'forge', makes: 'bastardSword',      gold: 1700, needs: [['ironScrap', 10], ['ashHaft', 2]] },
  { at: 'forge', makes: 'bandedMail',        gold: 2100, needs: [['ironScrap', 11], ['boiledHide', 4]] },
  { at: 'forge', makes: 'kiteShield',        gold: 1800, needs: [['ashHaft', 6], ['ironScrap', 6], ['boiledHide', 3]] },

  // ------------------------------------------------- heads and hands -------
  { at: 'forge', makes: 'leatherCap',        gold: 30,   needs: [['boiledHide', 1]] },
  { at: 'forge', makes: 'woolMitts',         gold: 20,   needs: [['boiledHide', 1]] },
  { at: 'forge', makes: 'leatherGloves',     gold: 70,   needs: [['boiledHide', 2]] },
  { at: 'forge', makes: 'paddedCoif',        gold: 120,  needs: [['boiledHide', 2], ['ashHaft', 1]] },
  { at: 'forge', makes: 'paddedGloves',      gold: 160,  needs: [['boiledHide', 3]] },
  { at: 'forge', makes: 'mailCoif',          gold: 320,  needs: [['ironScrap', 3]] },
  { at: 'forge', makes: 'mailMittens',       gold: 380,  needs: [['ironScrap', 3], ['boiledHide', 2]] },
  { at: 'forge', makes: 'nasalHelm',         gold: 560,  needs: [['ironScrap', 4]] },
  { at: 'forge', makes: 'kettleHat',         gold: 780,  needs: [['ironScrap', 5]] },
  { at: 'forge', makes: 'splintedGauntlets', gold: 900,  needs: [['ironScrap', 6], ['boiledHide', 3]] },
  { at: 'forge', makes: 'bascinet',          gold: 1250, needs: [['ironScrap', 7], ['boiledHide', 2]] },
  { at: 'forge', makes: 'greatHelm',         gold: 1800, needs: [['ironScrap', 10]] },
  { at: 'forge', makes: 'plateGauntlets',    gold: 1700, needs: [['ironScrap', 9], ['boiledHide', 4]] },
  { at: 'forge', makes: 'sallet',            gold: 2400, needs: [['ironScrap', 12], ['boarTusk', 1]] },
  { at: 'forge', makes: 'armet',             gold: 3400, needs: [['ironScrap', 15], ['direwolfPelt', 1]] },
  // Made, never sold, like the rest of the last rung.
  { at: 'forge', makes: 'dragonscaleHelm',   gold: 4600, needs: [['dragonglass', 5], ['ironScrap', 10]] },
  { at: 'forge', makes: 'dragonscaleGrips',  gold: 3800, needs: [['dragonglass', 4], ['boiledHide', 6]] },
  { at: 'forge', makes: 'kingsguardHelm',    gold: 6800, needs: [['valyrianShard', 2], ['ironScrap', 18]] },
  { at: 'forge', makes: 'kingsguardGauntlets', gold: 5400, needs: [['valyrianShard', 1], ['ironScrap', 14], ['boiledHide', 6]] },

  // ------------------------------------------- the rest of the arms rack ---
  { at: 'forge', makes: 'quarterstaff',      gold: 40,   needs: [['ashHaft', 2]] },
  { at: 'forge', makes: 'handAxe',           gold: 180,  needs: [['ironScrap', 2], ['ashHaft', 1]] },
  { at: 'forge', makes: 'mace',              gold: 340,  needs: [['ironScrap', 4], ['ashHaft', 1]] },
  { at: 'forge', makes: 'warPick',           gold: 620,  needs: [['ironScrap', 5], ['ashHaft', 2]] },
  { at: 'forge', makes: 'flail',             gold: 980,  needs: [['ironScrap', 7], ['ashHaft', 2]] },
  { at: 'forge', makes: 'crossbow',          gold: 1400, needs: [['ashHaft', 5], ['ironScrap', 4], ['boiledHide', 2]] },
  { at: 'forge', makes: 'poleaxe',           gold: 2100, needs: [['ironScrap', 11], ['ashHaft', 5]] },
  { at: 'forge', makes: 'dornishSpear',      gold: 1900, needs: [['ashHaft', 7], ['ironScrap', 6], ['boarTusk', 2]] },
  { at: 'forge', makes: 'mailShirt',         gold: 300,  needs: [['ironScrap', 4]] },
  { at: 'forge', makes: 'lamellar',          gold: 1050, needs: [['ironScrap', 7], ['boiledHide', 4]] },
  { at: 'forge', makes: 'halfPlate',         gold: 3000, needs: [['ironScrap', 14], ['boiledHide', 6]] },
  { at: 'forge', makes: 'roundShield',       gold: 200,  needs: [['ashHaft', 3], ['ironScrap', 1]] },
  { at: 'forge', makes: 'targe',             gold: 800,  needs: [['ironScrap', 5], ['boiledHide', 2]] },
  { at: 'forge', makes: 'scutum',            gold: 2200, needs: [['ashHaft', 8], ['ironScrap', 7], ['boiledHide', 4]] },

  // --------------------------------------------------------- the maester ---
  { at: 'brew', makes: 'maesterKit',  gold: 30,  needs: [['greenbriar', 1]] },
  { at: 'brew', makes: 'poppyMilk',   gold: 90,  needs: [['poppySeed', 2], ['greenbriar', 1]] },
  { at: 'brew', makes: 'weirwoodSap', gold: 240, needs: [['greenbriar', 4], ['poppySeed', 2]] },
  { at: 'brew', makes: 'kingsRansom', gold: 700, needs: [['fireblood', 1], ['greenbriar', 3], ['poppySeed', 2]] },

  // ------------------------------------------------------- what holds them ---
  { at: 'forge', makes: 'snare',     gold: 60,   needs: [['ironScrap', 1], ['ashHaft', 1]] },
  { at: 'forge', makes: 'netTrap',   gold: 300,  needs: [['ironScrap', 3], ['boiledHide', 2]] },
  { at: 'forge', makes: 'greatNet',  gold: 1400, needs: [['ironScrap', 8], ['boiledHide', 6], ['direwolfPelt', 2]] },
  { at: 'forge', makes: 'birdLime',  gold: 15,   needs: [['greenbriar', 2]] },
  /* The last two are not for sale anywhere in the world. If you want to hold
     the things that cannot be held, you make the thing that holds them. */
  { at: 'forge', makes: 'valyrianMesh', gold: 4200,
    needs: [['valyrianShard', 2], ['ironScrap', 10], ['direwolfPelt', 3]] },
  { at: 'forge', makes: 'dragonchain',  gold: 7500,
    needs: [['valyrianShard', 3], ['dragonglass', 6], ['fireblood', 1]] },

  // ------------------------------------------------- what a maester keeps ---
  // The other half of why a chest is still worth opening at level forty: none
  // of this is worn, all of it is used up, and the last three cannot be bought.
  { at: 'brew', makes: 'huntersDraught',    gold: 180,  needs: [['greenbriar', 2], ['boarTusk', 1]] },
  { at: 'brew', makes: 'maestersSalts',     gold: 320,  needs: [['poppySeed', 3], ['greenbriar', 2]] },
  { at: 'forge', makes: 'warhorn',          gold: 450,  needs: [['ashHaft', 3], ['boarTusk', 2]] },
  { at: 'brew', makes: 'shadeOfTheEvening', gold: 900,  needs: [['poppySeed', 4], ['greenbriar', 5], ['dragonglass', 1]] },
  { at: 'brew', makes: 'wildfire',          gold: 1600, needs: [['fireblood', 1], ['dragonglass', 3], ['poppySeed', 2]] },
  { at: 'brew', makes: 'weirwoodPaste',     gold: 2600, needs: [['greenbriar', 8], ['direwolfPelt', 2], ['valyrianShard', 1]] },
  { at: 'forge', makes: 'dragonHorn',       gold: 9000, needs: [['valyrianShard', 4], ['fireblood', 2], ['dragonglass', 8]] },
];
