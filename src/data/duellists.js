// People who will fight you themselves, with steel, rather than setting a beast
// on you. Stats are read directly by the duel scene.
//
//   vigour     health pool
//   might      damage dealt
//   guard      damage resisted
//   swiftness  strike order
//   wind       stamina pool
//   loot       [slot, gearId] taken from them on victory
//   beast      optional { species, level } that fights at their side

import { SPRITE_HOUSE, HOUSES } from './houses.js';

export const DUELLISTS = {
  // ------------------------------------------------------ Winterfell yard --
  rodrikCassel: {
    name: 'Ser Rodrik', sprite: 'stark', level: 3,
    vigour: 70, might: 16, guard: 10, swiftness: 12, wind: 18,
    house: 'stark',
    techniques: ['slash', 'guard'],
    reward: 150, exp: 60, canYield: true,
    intro: 'Ser Rodrik Cassel: Blunted steel, and I will still put you in the dirt. Guard up.',
    defeat: 'Ser Rodrik Cassel: Better. Your feet finally caught up with your hands.',
    after: 'Ser Rodrik Cassel: Practise the parry. Everything else follows from it.',
  },
  joryCassel: {
    name: 'Jory Cassel', sprite: 'stark', level: 6,
    vigour: 95, might: 22, guard: 15, swiftness: 17, wind: 20,
    house: 'stark',
    techniques: ['slash', 'riposte', 'guard'],
    reward: 320, exp: 110, canYield: true,
    loot: ['weapon', 'ironSword'],
    intro: 'Jory Cassel: Captain of the guard. If you can pass me, the road south is yours.',
    defeat: 'Jory Cassel: Well struck. Take my spare blade — you have more use for it than I do.',
    after: 'Jory Cassel: Keep to the kingsroad and keep your steel where you can reach it.',
  },
  theon: {
    name: 'Theon Greyjoy', sprite: 'ironborn', level: 9,
    vigour: 110, might: 26, guard: 14, swiftness: 26, wind: 22,
    house: 'greyjoy',
    techniques: ['loose', 'volley', 'quickCut', 'guard'],
    beast: { species: 'krakenling', level: 9 },
    reward: 480, exp: 170, canYield: true,
    intro: "Theon Greyjoy: Ward of Winterfell, same as you. Only I'm better at this. Watch.",
    defeat: "Theon Greyjoy: Lucky. That's all that was.",
    after: 'Theon Greyjoy: Ask me again when I have a proper bow and a proper reason.',
  },
  robb: {
    name: 'Robb Stark', sprite: 'stark', level: 12,
    vigour: 145, might: 33, guard: 22, swiftness: 24, wind: 24,
    house: 'stark',
    techniques: ['slash', 'thrust', 'shieldBash', 'guard'],
    beast: { species: 'direwolf', level: 12 },
    reward: 700, exp: 260, canYield: true,
    intro: 'Robb Stark: My father says a lord should never ask a man to do what he will not. So — me first.',
    defeat: 'Robb Stark: Gods. You will do. Ride south and do it there.',
    after: 'Robb Stark: Whatever you find down there, send a raven. I will come.',
  },

  // ------------------------------------------------------- the Kingsroad ---
  hound: {
    name: 'Sandor Clegane', sprite: 'hound', level: 20,
    vigour: 230, might: 52, guard: 34, swiftness: 22, wind: 26,
    techniques: ['cleave', 'slash', 'hook', 'guard'],
    reward: 1600, exp: 520, canYield: false,
    loot: ['armour', 'ringmail'],
    intro: "Sandor Clegane: Knights. Sers. Vows. You want a real fight, you fight a dog. Come on then.",
    defeat: 'Sandor Clegane: Hah. Take the mail off my back, you earned it. Now piss off.',
    after: 'Sandor Clegane: Still breathing? Good. Stay that way, it annoys people.',
  },
  syrio: {
    name: 'Syrio Forel', sprite: 'braavosi', level: 16,
    vigour: 140, might: 34, guard: 12, swiftness: 46, wind: 30,
    techniques: ['quickCut', 'riposte', 'thrust', 'guard'],
    reward: 900, exp: 380, canYield: true,
    loot: ['weapon', 'huntingKnife'],
    intro: 'Syrio Forel: The First Sword of Braavos does not dance with just anyone. Watch me. Just watch me.',
    defeat: 'Syrio Forel: Just so. You are not seeing with your eyes any more. This is the beginning.',
    after: 'Syrio Forel: What do we say to the God of Death? Not today.',
  },
  bronn: {
    name: 'Bronn', sprite: 'sellsword', level: 18,
    vigour: 175, might: 42, guard: 24, swiftness: 30, wind: 26,
    techniques: ['slash', 'quickCut', 'hook', 'guard'],
    reward: 1200, exp: 440, canYield: true,
    intro: 'Bronn: I fight for coin. But I will take a free swing at a northerner on principle.',
    defeat: 'Bronn: Right. You are worth hiring. Find me when you can afford it.',
    after: 'Bronn: A man who fights fair has already lost. Write that down.',
  },

  // ----------------------------------------------------------- Riverlands --
  brienne: {
    name: 'Brienne of Tarth', sprite: 'brienne', level: 24,
    vigour: 260, might: 55, guard: 42, swiftness: 20, wind: 26,
    house: 'baratheon',
    techniques: ['slash', 'thrust', 'shieldBash', 'guard'],
    reward: 2000, exp: 640, canYield: true,
    loot: ['shield', 'oakShield'],
    intro: 'Brienne of Tarth: I have no lands and no title. I have a sword, and I keep my oaths. Draw.',
    defeat: 'Brienne of Tarth: You fight honestly. That is rarer than skill. Take my shield.',
    after: 'Brienne of Tarth: When you sit that chair, remember who kept their word to you.',
  },
  beric: {
    name: 'Beric Dondarrion', sprite: 'brotherhood', level: 22,
    vigour: 205, might: 48, guard: 28, swiftness: 26, wind: 24,
    techniques: ['slash', 'riposte', 'sweep', 'guard'],
    beast: { species: 'emberwisp', level: 22 },
    reward: 1500, exp: 560, canYield: true,
    intro: 'Beric Dondarrion: The Brotherhood asks a toll of every armed man on this road. Or a fight.',
    defeat: 'Beric Dondarrion: The Lord of Light is not finished with either of us, it seems.',
    after: 'Beric Dondarrion: Every time I come back I bring less of myself. Remember that when you want more.',
  },

  // ---------------------------------------------------------- Westerlands --
  mountain: {
    name: 'Gregor Clegane', sprite: 'mountain', level: 32,
    vigour: 400, might: 78, guard: 52, swiftness: 12, wind: 24,
    house: 'lannister',
    techniques: ['crush', 'cleave', 'sweep', 'guard'],
    beast: { species: 'tuskrend', level: 32 },
    reward: 4000, exp: 1100, canYield: false, boss: true,
    loot: ['weapon', 'warhammer'],
    intro: 'Gregor Clegane says nothing at all. He simply lifts the greatsword and starts walking.',
    defeat: 'The Mountain goes down like a felled tower, and the yard is very quiet.',
    after: 'Nobody has moved the body. Nobody wants to.',
  },
  jaime: {
    name: 'Ser Jaime Lannister', sprite: 'lannister', level: 30,
    vigour: 300, might: 66, guard: 40, swiftness: 40, wind: 30,
    house: 'lannister',
    techniques: ['valyrianArc', 'thrust', 'riposte', 'guard'],
    beast: { species: 'goldmane', level: 30 },
    reward: 3500, exp: 980, canYield: false, boss: true,
    loot: ['armour', 'knightPlate'],
    intro: 'Ser Jaime Lannister: They call me Kingslayer and never ask how good I had to be to manage it. Guard.',
    defeat: 'Ser Jaime Lannister: Beaten fairly, by someone who has actually read the histories. Take the plate.',
    after: 'Ser Jaime Lannister: The things we do for love. And for thrones. Mostly thrones.',
  },

  // ---------------------------------------------------------------- Dorne --
  oberyn: {
    name: 'Oberyn Martell', sprite: 'martell', level: 34,
    vigour: 285, might: 70, guard: 26, swiftness: 52, wind: 34,
    house: 'martell',
    techniques: ['lunge', 'skewer', 'quickCut', 'guard'],
    beast: { species: 'sandviper', level: 34 },
    reward: 4200, exp: 1200, canYield: true, boss: true,
    loot: ['weapon', 'boarSpear'],
    intro: 'Oberyn Martell: I am not here for you. But I am here, and you are armed, and it would be rude not to.',
    defeat: 'Oberyn Martell: Ha! Good. Very good. Do not let it go to your head, it goes to everyone else\'s.',
    after: 'Oberyn Martell: When you meet the Mountain, do not talk. I talked.',
  },

  // ------------------------------------------------------------- the Wall --
  ygritte: {
    name: 'Ygritte', sprite: 'wildling', level: 15,
    vigour: 135, might: 32, guard: 12, swiftness: 38, wind: 28,
    house: 'freefolk',
    techniques: ['loose', 'volley', 'quickCut', 'guard'],
    beast: { species: 'falconet', level: 15 },
    reward: 800, exp: 340, canYield: true,
    loot: ['weapon', 'huntingBow'],
    intro: 'Ygritte: You know nothing. Let us find out how much nothing.',
    defeat: 'Ygritte: All right. You know one thing. Keep the bow, southron.',
    after: 'Ygritte: You are still a kneeler. But you are a kneeler who can shoot.',
  },
  tormund: {
    name: 'Tormund', sprite: 'wildling', level: 26,
    vigour: 300, might: 58, guard: 30, swiftness: 20, wind: 28,
    house: 'freefolk',
    techniques: ['cleave', 'hook', 'crush', 'guard'],
    beast: { species: 'bearhold', level: 26 },
    reward: 2200, exp: 720, canYield: true,
    intro: 'Tormund: Free folk do not kneel and do not queue. One fight, right now, and then we drink.',
    defeat: 'Tormund: HAH! Good. You will drink with me and you will not enjoy it.',
    after: 'Tormund: The dead are coming. Everything south of here is arguing about chairs.',
  },
  jonSnow: {
    name: 'Jon Snow', sprite: 'nightswatch', level: 28,
    vigour: 290, might: 62, guard: 38, swiftness: 34, wind: 30,
    house: 'nightswatch',
    techniques: ['valyrianArc', 'slash', 'riposte', 'guard'],
    beast: { species: 'ghostfang', level: 28 },
    reward: 3000, exp: 900, canYield: true, boss: true,
    intro: 'Jon Snow: I am not going to talk you out of this, am I. All right. Longclaw is heavier than it looks.',
    defeat: 'Jon Snow: Enough. You are better than me and we both need to be somewhere else.',
    after: 'Jon Snow: The war that matters is north of the Wall. Come find me when the chair bores you.',
  },

  // ---------------------------------------------------- King's Landing -----
  meryn: {
    name: 'Ser Meryn Trant', sprite: 'kingsguard', level: 27,
    vigour: 245, might: 54, guard: 40, swiftness: 22, wind: 24,
    house: 'lannister',
    techniques: ['slash', 'shieldBash', 'guard'],
    reward: 2400, exp: 780, canYield: false,
    intro: 'Ser Meryn Trant: The white cloak stops here. It stops everyone.',
    defeat: 'Ser Meryn Trant: You... you are not on the list...',
    after: 'Ser Meryn Trant: I only ever guarded doors.',
  },
  barristan: {
    name: 'Ser Barristan Selmy', sprite: 'kingsguard', level: 36,
    vigour: 330, might: 72, guard: 48, swiftness: 34, wind: 30,
    house: 'lannister',
    techniques: ['thrust', 'slash', 'riposte', 'guard'],
    reward: 5000, exp: 1400, canYield: true, boss: true,
    loot: ['armour', 'kingsguardPlate'],
    intro: 'Ser Barristan Selmy: Barristan the Bold, they called me, when I was young enough to enjoy it. Come.',
    defeat: 'Ser Barristan Selmy: I have served five kings. You are the first to put me on the ground. Take the white plate.',
    after: 'Ser Barristan Selmy: A knight protects. That is the whole of it. The rest is heraldry.',
  },
  ramsay: {
    name: 'Ramsay Bolton', sprite: 'bolton', level: 29,
    vigour: 265, might: 60, guard: 32, swiftness: 32, wind: 26,
    house: 'bolton',
    techniques: ['backstab', 'quickCut', 'hook', 'guard'],
    beast: { species: 'winterfang', level: 29 },
    reward: 2800, exp: 860, canYield: false,
    loot: ['weapon', 'huntingKnife'],
    intro: 'Ramsay Bolton: I do so love it when they still have some fight in them at the start.',
    defeat: 'Ramsay Bolton: No. No, this is not how the story goes—',
    after: 'The Bolton banners came down that same evening. Nobody put them back up.',
  },
  euron: {
    name: 'Euron Greyjoy', sprite: 'ironborn', level: 33,
    vigour: 310, might: 68, guard: 34, swiftness: 36, wind: 28,
    house: 'greyjoy',
    techniques: ['cleave', 'hook', 'quickCut', 'guard'],
    beast: { species: 'deepmaw', level: 33 },
    reward: 3800, exp: 1050, canYield: false, boss: true,
    intro: 'Euron Greyjoy: I have sailed further than any of you and come back with worse ideas. Shall we?',
    defeat: 'Euron Greyjoy: What is dead may never die. But it can certainly be inconvenienced.',
    after: 'The Iron Fleet weighed anchor without him and nobody sent word.',
  },
  cersei: {
    name: 'Cersei Lannister', sprite: 'cersei', level: 31,
    vigour: 250, might: 56, guard: 44, swiftness: 26, wind: 26,
    house: 'lannister',
    techniques: ['quickCut', 'hook', 'guard'],
    beast: { species: 'goldmane', level: 31 },
    reward: 4500, exp: 1000, canYield: false, boss: true,
    intro: 'Cersei Lannister: When you play the game of thrones, you win or you die. There is no middle ground.',
    defeat: 'Cersei Lannister: I did everything I did for my children. Remember that when they write it down.',
    after: 'Cersei Lannister: The chair is yours. It was never as comfortable as it looked from below.',
  },

  // -------------------------------------------------------- Dragonstone ---
  greyWorm: {
    name: 'Grey Worm', sprite: 'unsullied', level: 30,
    vigour: 285, might: 62, guard: 46, swiftness: 30, wind: 30,
    house: 'targaryen',
    techniques: ['lunge', 'skewer', 'shieldBash', 'guard'],
    reward: 3200, exp: 940, canYield: true,
    loot: ['shield', 'towerShield'],
    intro: 'Grey Worm: Unsullied do not duel for honour. We duel to know what you are. Begin.',
    defeat: 'Grey Worm: You are strong. The Queen will want to speak with you herself.',
    after: 'Grey Worm: We hold this beach. You may pass. Only you.',
  },
  daario: {
    name: 'Daario Naharis', sprite: 'braavosi', level: 27,
    vigour: 240, might: 56, guard: 26, swiftness: 42, wind: 30,
    house: 'targaryen',
    techniques: ['quickCut', 'riposte', 'backstab', 'guard'],
    reward: 2600, exp: 820, canYield: true,
    intro: 'Daario Naharis: You have the look of someone about to do something magnificent and stupid. I approve.',
    defeat: 'Daario Naharis: Beautiful. Truly. I shall tell it badly in every tavern from here to Meereen.',
    after: 'Daario Naharis: Fight for what you love, or do not fight. Anything else is just employment.',
  },
};

export function duellist(id) {
  const found = DUELLISTS[id];
  if (!found) throw new Error(`Unknown duellist: ${id}`);
  return { id, ...found };
}

// ============================================================== roamers ====
//
// The people you meet on the road. These are not named characters — they are
// the bandits, deserters and raiders who make travelling dangerous — so they
// are described as archetypes and built to whatever level the region calls for
// rather than written out one by one.
//
//   build      multipliers on the level-scaled base
//   sprites    the looks this kind of person comes in, picked at random
//   beast      { species, chance } for the ones who travel with an animal

const ROAMER_BUILDS = {
  brute:   { vigour: 1.30, might: 1.15, guard: 1.10, swiftness: 0.80, wind: 0.95 },
  soldier: { vigour: 1.05, might: 1.00, guard: 1.20, swiftness: 0.95, wind: 1.05 },
  skirmisher: { vigour: 0.85, might: 0.95, guard: 0.80, swiftness: 1.35, wind: 1.15 },
  archer:  { vigour: 0.80, might: 1.05, guard: 0.75, swiftness: 1.20, wind: 1.00 },
  ruffian: { vigour: 0.95, might: 1.00, guard: 0.90, swiftness: 1.05, wind: 1.00 },
};

export const ROAMERS = {
  bandit: {
    title: 'Bandit', build: 'ruffian',
    sprites: ['smallfolk', 'wildling', 'goodwife'],
    techniques: ['quickCut', 'slash', 'guard'],
    beast: { species: 'snowpup', chance: 0.15 },
    lines: [
      'Purse or throat. Choose quickly, it is cold.',
      'This road belongs to us now. Toll is everything you carry.',
    ],
  },
  deserter: {
    title: 'Deserter', build: 'soldier', house: 'nightswatch',
    sprites: ['nightswatch', 'guard'],
    techniques: ['slash', 'riposte', 'guard'],
    lines: [
      'I took the black. I am taking it off again. Do not try to stop me.',
      'They hang deserters. So I have nothing left to lose and you do.',
    ],
  },
  sellsword: {
    title: 'Sellsword', build: 'skirmisher',
    sprites: ['sellsword', 'braavosi'],
    techniques: ['quickCut', 'backstab', 'guard'],
    lines: [
      'Someone paid me to be on this road. They did not say who for.',
      'Nothing personal. Coin is coin and you are in the way of it.',
    ],
  },
  hedgeKnight: {
    title: 'Hedge Knight', build: 'soldier',
    sprites: ['guard', 'noble', 'brienne'],
    techniques: ['slash', 'shieldBash', 'guard'],
    lines: [
      'A hedge knight with no lord still has a sword and a code. Draw.',
      'I have no castle and no lands. I have this. Come and test it.',
    ],
  },
  poacher: {
    title: 'Poacher', build: 'archer',
    sprites: ['smallfolk', 'wildlingWoman'],
    techniques: ['loose', 'volley', 'guard'],
    beast: { species: 'ravenling', chance: 0.25 },
    lines: [
      'You saw nothing. Best keep it that way, or you saw your last thing.',
      'These woods feed my family. They do not feed strangers.',
    ],
  },
  wildlingRaider: {
    title: 'Raider', build: 'brute',
    sprites: ['wildling', 'smallfolk'],
    techniques: ['cleave', 'hook', 'guard'],
    beast: { species: 'bearcub', chance: 0.3 },
    lines: [
      'Kneeler. You are a long way from your walls.',
      'We come south because the cold comes behind us. Move or be moved.',
    ],
  },
  spearwife: {
    title: 'Spearwife', build: 'skirmisher',
    sprites: ['wildlingWoman', 'goodwife'],
    techniques: ['lunge', 'skewer', 'guard'],
    beast: { species: 'snowpup', chance: 0.25 },
    lines: [
      'You fight like a man who has only ever fought men.',
      'Free folk do not ask leave. Not of you, not of anyone.',
    ],
  },
  clansman: {
    title: 'Clansman', build: 'brute',
    sprites: ['smallfolk', 'wildling'],
    techniques: ['crush', 'sweep', 'guard'],
    lines: [
      'The mountains are ours. The roads through them too.',
      'Stone Crows take what the valley will not give.',
    ],
  },
  goldCloak: {
    title: 'Gold Cloak', build: 'soldier', house: 'lannister',
    sprites: ['guard', 'lannister'],
    techniques: ['thrust', 'shieldBash', 'guard'],
    lines: [
      'City Watch. You are being detained. Struggling is traditional.',
      'The Queen pays us to notice people like you.',
    ],
  },
  ironbornReaver: {
    title: 'Reaver', build: 'brute',
    sprites: ['ironborn'],
    techniques: ['cleave', 'crush', 'guard'],
    beast: { species: 'krakenling', chance: 0.25 },
    lines: [
      'We do not sow. We take. Today we take from you.',
      'What is dead may never die. You have no such comfort.',
    ],
  },
  dornishOutrider: {
    title: 'Outrider', build: 'skirmisher',
    sprites: ['martell', 'sellsword'],
    techniques: ['lunge', 'quickCut', 'guard'],
    beast: { species: 'sandviper', chance: 0.3 },
    lines: [
      'Dorne was never conquered. Do not mistake courtesy for weakness.',
      'The sun is on my side. Everything here is.',
    ],
  },
  manAtArms: {
    title: 'Man-at-arms', build: 'soldier',
    sprites: ['tyrell', 'arryn', 'tully', 'baratheon', 'lannister', 'bolton'],
    techniques: ['slash', 'thrust', 'guard'],
    lines: [
      'My lord holds this ground and I hold it for him.',
      'State your business, then state it again with steel.',
    ],
  },
  brotherhoodBowman: {
    title: 'Bowman', build: 'archer',
    sprites: ['brotherhood', 'smallfolk'],
    techniques: ['loose', 'volley', 'guard'],
    lines: [
      'We are the brotherhood without banners. We ask the poor for nothing.',
      'Lower your hands. I have not decided about you yet.',
    ],
  },
  redPriestess: {
    title: 'Red Priestess', build: 'skirmisher',
    sprites: ['redPriest'],
    techniques: ['quickCut', 'backstab', 'guard'],
    beast: { species: 'emberwisp', chance: 0.4 },
    lines: [
      'The night is dark and full of terrors. You are one of the smaller ones.',
      'The Lord of Light has shown me your face. It was on fire.',
    ],
  },
  gravedigger: {
    title: 'Grave-robber', build: 'ruffian',
    sprites: ['smallfolk', 'oldman'],
    techniques: ['crush', 'quickCut', 'guard'],
    beast: { species: 'wightling', chance: 0.35 },
    lines: [
      'The barrows keep their gold and I keep mine. Walk on.',
      'Dead kings do not need what they were buried with. I do.',
    ],
  },
};

/** Level-scaled opposition, before the archetype's own build is applied. */
function roamerBase(level) {
  return {
    vigour: Math.round(30 + level * 6.5),
    might: Math.round(8 + level * 2.6),
    guard: Math.round(5 + level * 1.8),
    swiftness: Math.round(8 + level * 1.9),
    wind: Math.round(12 + level * 1.2),
  };
}

/**
 * Builds one of the roaming people as a duellist at the given level. `pick` is
 * the caller's random source, so the overworld and the tests can both drive it.
 */
export function makeRoamer(id, level, pick) {
  const def = ROAMERS[id];
  if (!def) throw new Error(`Unknown roamer: ${id}`);
  const build = ROAMER_BUILDS[def.build];
  const base = roamerBase(level);
  const sprite = pick(def.sprites);
  const line = pick(def.lines);
  // Who answers for them, read from how they are dressed. Outlaws answer to
  // nobody, and killing them costs you nothing with anyone.
  const houseId = def.house ?? SPRITE_HOUSE[sprite] ?? null;

  const roamer = {
    id: `roamer_${id}`,
    roamer: true,
    name: houseId ? `${HOUSES[houseId].short} ${def.title}` : def.title,
    sprite,
    level,
    vigour: Math.max(12, Math.round(base.vigour * build.vigour)),
    might: Math.max(3, Math.round(base.might * build.might)),
    guard: Math.max(1, Math.round(base.guard * build.guard)),
    swiftness: Math.max(1, Math.round(base.swiftness * build.swiftness)),
    wind: Math.max(8, Math.round(base.wind * build.wind)),
    techniques: def.techniques,
    reward: Math.round(30 + level * 26),
    exp: Math.round(24 + level * 14),
    house: houseId,
    canYield: true,
    intro: `${def.title}: ${line}`,
    defeat: `${def.title}: Enough! Take the road, it is not worth my life.`,
    after: `${def.title}: Go on, then.`,
  };
  return roamer;
}

/** The roaming archetypes a region throws at you, as a weighted table. */
export const ROAMER_TABLES = {
  'The North': ['bandit', 'poacher', 'deserter', 'manAtArms'],
  'The Wall': ['deserter', 'wildlingRaider', 'spearwife'],
  'Beyond the Wall': ['wildlingRaider', 'spearwife', 'gravedigger'],
  'The Neck': ['bandit', 'poacher', 'clansman'],
  'The Riverlands': ['bandit', 'brotherhoodBowman', 'sellsword', 'manAtArms'],
  'The Vale': ['clansman', 'hedgeKnight', 'manAtArms'],
  'The Westerlands': ['sellsword', 'manAtArms', 'gravedigger', 'bandit'],
  'The Reach': ['hedgeKnight', 'manAtArms', 'poacher'],
  'Dorne': ['dornishOutrider', 'sellsword', 'bandit'],
  'The Stormlands': ['manAtArms', 'hedgeKnight', 'ironbornReaver'],
  'The Crownlands': ['goldCloak', 'sellsword', 'bandit', 'brotherhoodBowman'],
  'Dragonstone': ['redPriestess', 'ironbornReaver', 'sellsword'],
};
