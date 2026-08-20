// The bestiary. Every entry picks a drawing archetype plus a six-colour
// palette, so the art comes for free once the numbers are set.
//
// growth: 'fast' | 'medium' | 'slow' — controls the EXP curve.
// catchRate: 3 (legendary) .. 190 (route filler), same scale as the originals.

const P = (dark, body, light, belly, accent, eye) => ({ dark, body, light, belly, accent, eye });

export const SPECIES = {
  // ============================================================ wolf line ==
  snowpup: {
    name: 'Snowpup', types: ['beast'], archetype: 'wolf',
    base: { hp: 45, atk: 52, def: 43, spa: 40, spd: 45, spe: 60 },
    growth: 'medium', catchRate: 45, expYield: 64,
    palette: P('#4a4f5c', '#8d94a4', '#b9c0cd', '#e2e6ee', '#6c7385', '#3a4a6a'),
    learnset: [[1, 'tackle'], [1, 'growl'], [5, 'quickfang'], [9, 'howl'], [13, 'bite'],
               [18, 'coldsnap'], [23, 'rend'], [29, 'maul'], [36, 'lastcharge']],
    evolve: { level: 16, into: 'direwolf' },
    dex: 'The runt of a Wolfswood litter. It answers to a whistle, and to almost nothing else.',
  },
  direwolf: {
    name: 'Direwolf', types: ['beast'], archetype: 'wolf',
    base: { hp: 65, atk: 78, def: 62, spa: 55, spd: 62, spe: 80 },
    growth: 'medium', catchRate: 45, expYield: 142,
    palette: P('#3a3f4c', '#79808f', '#a8b0bd', '#dfe4ec', '#5a6172', '#6a86b8'),
    learnset: [[1, 'tackle'], [1, 'growl'], [1, 'quickfang'], [9, 'howl'], [13, 'bite'],
               [19, 'coldsnap'], [25, 'rend'], [32, 'maul'], [40, 'lastcharge']],
    evolve: { level: 34, into: 'winterfang' },
    dex: 'Beyond the size of any hound. Northern lords still take one as a sworn companion.',
  },
  winterfang: {
    name: 'Winterfang', types: ['beast', 'frost'], archetype: 'wolf',
    base: { hp: 85, atk: 104, def: 80, spa: 70, spd: 82, spe: 99 },
    growth: 'medium', catchRate: 45, expYield: 239,
    palette: P('#2e3440', '#c9d4e0', '#eef4fb', '#ffffff', '#7fa8c8', '#8fd4e8'),
    learnset: [[1, 'bite'], [1, 'howl'], [1, 'quickfang'], [25, 'rend'], [34, 'frostbite'],
               [40, 'maul'], [47, 'wintersbite'], [55, 'lastcharge']],
    dex: 'Its breath frosts the air. Where it walks, the first snow follows within the day.',
  },
  ghostfang: {
    name: 'Ghostfang', types: ['beast', 'frost'], archetype: 'wolf',
    base: { hp: 100, atk: 118, def: 90, spa: 85, spd: 95, spe: 112 },
    growth: 'slow', catchRate: 3, expYield: 300,
    palette: P('#3a4658', '#f2f6fa', '#ffffff', '#ffffff', '#c8d8e8', '#b02a34'),
    learnset: [[1, 'quickfang'], [1, 'howl'], [1, 'frostbite'], [50, 'rend'], [55, 'wintersbite'],
               [60, 'maul'], [65, 'lastcharge']],
    dex: 'White as new snow, silent as falling snow. The smallfolk say it only shows itself to the doomed.',
  },

  // ========================================================== dragon line ==
  emberling: {
    name: 'Emberling', types: ['flame'], archetype: 'dragon',
    base: { hp: 44, atk: 48, def: 45, spa: 62, spd: 50, spe: 56 },
    growth: 'medium', catchRate: 45, expYield: 65,
    palette: P('#5a2018', '#b34428', '#e0743c', '#f2c078', '#e8a038', '#f0d040'),
    learnset: [[1, 'scratch'], [1, 'leer'], [6, 'ember'], [10, 'kindle'], [15, 'wingslash'],
               [20, 'flamebreath'], [27, 'searingbrand'], [34, 'dragonfire'], [42, 'wildfire']],
    evolve: { level: 16, into: 'scaleflight' },
    dex: 'A dragon no bigger than a cat. It sleeps in the ashes of the hearth and wakes hungry.',
  },
  scaleflight: {
    name: 'Scaleflight', types: ['flame'], archetype: 'dragon',
    base: { hp: 62, atk: 66, def: 62, spa: 88, spd: 70, spe: 78 },
    growth: 'medium', catchRate: 45, expYield: 145,
    palette: P('#4c1a14', '#9c3822', '#cc6030', '#e8b060', '#d08c28', '#f2d848'),
    learnset: [[1, 'scratch'], [1, 'ember'], [1, 'kindle'], [15, 'wingslash'], [21, 'flamebreath'],
               [29, 'searingbrand'], [37, 'dragonfire'], [45, 'wildfire']],
    evolve: { level: 36, into: 'dreadwyrm' },
    dex: 'Its wings finally carry it. Riders are warned that a dragon is never truly tamed.',
  },
  dreadwyrm: {
    name: 'Dreadwyrm', types: ['flame', 'wind'], archetype: 'dragon',
    base: { hp: 84, atk: 90, def: 82, spa: 118, spd: 90, spe: 96 },
    growth: 'medium', catchRate: 45, expYield: 240,
    palette: P('#3c1210', '#8a2a1e', '#c04828', '#e8a048', '#2a2028', '#f2e050'),
    learnset: [[1, 'wingslash'], [1, 'flamebreath'], [1, 'kindle'], [29, 'searingbrand'],
               [38, 'skyfall'], [44, 'dragonfire'], [52, 'wildfire']],
    dex: 'Fire and blood. A grown wyrm can turn a keep to slag and be gone before the bells are rung.',
  },
  blackdread: {
    name: 'Blackdread', types: ['flame', 'shadow'], archetype: 'dragon',
    base: { hp: 105, atk: 105, def: 95, spa: 130, spd: 100, spe: 90 },
    growth: 'slow', catchRate: 3, expYield: 310,
    palette: P('#14101a', '#2c2434', '#4a3c50', '#c02818', '#e04020', '#f04828'),
    learnset: [[1, 'flamebreath'], [1, 'shadetouch'], [1, 'wargbond'], [50, 'longnight'],
               [56, 'dragonfire'], [62, 'wildfire']],
    dex: 'The Black Dread of old, or something wearing its shape. Its shadow alone withers grass.',
  },

  // ============================================================ fish line ==
  riverfry: {
    name: 'Riverfry', types: ['tide'], archetype: 'fish',
    base: { hp: 50, atk: 45, def: 50, spa: 58, spd: 58, spe: 47 },
    growth: 'medium', catchRate: 45, expYield: 63,
    palette: P('#1f4468', '#3f7ab0', '#6aa8d8', '#c8e4f4', '#8f4a3a', '#f0e070'),
    learnset: [[1, 'tackle'], [1, 'riptide'], [7, 'mistveil'], [12, 'undertow'], [17, 'tidalsurge'],
               [24, 'rocktoss'], [31, 'drownedfury'], [38, 'steelfang']],
    evolve: { level: 16, into: 'silverfin' },
    dex: 'Trout of the Trident. Tully children are given one to raise before they are given a name-day sword.',
  },
  silverfin: {
    name: 'Silverfin', types: ['tide'], archetype: 'fish',
    base: { hp: 70, atk: 62, def: 70, spa: 82, spd: 80, spe: 63 },
    growth: 'medium', catchRate: 45, expYield: 143,
    palette: P('#1a3c60', '#4a86bc', '#84bce0', '#e2f0fa', '#a03a44', '#f2e878'),
    learnset: [[1, 'riptide'], [1, 'mistveil'], [12, 'undertow'], [18, 'tidalsurge'],
               [26, 'rocktoss'], [34, 'drownedfury'], [41, 'steelfang']],
    evolve: { level: 36, into: 'tridentide' },
    dex: 'Its scales throw back the light like mail. Fishermen call a sighting a blessing on the season.',
  },
  tridentide: {
    name: 'Tridentide', types: ['tide', 'steel'], archetype: 'fish',
    base: { hp: 92, atk: 84, def: 100, spa: 108, spd: 104, spe: 72 },
    growth: 'medium', catchRate: 45, expYield: 241,
    palette: P('#16324f', '#5a90c0', '#9cc8e8', '#eef6fc', '#b8c4d0', '#f6f0a0'),
    learnset: [[1, 'tidalsurge'], [1, 'mistveil'], [1, 'undertow'], [26, 'steelfang'],
               [36, 'valyrian'], [44, 'drownedfury'], [52, 'mountainfall']],
    dex: 'Family, duty, honour. It guards the fords of the Trident and asks no leave of any lord.',
  },

  // =========================================================== raven line ==
  ravenling: {
    name: 'Ravenling', types: ['wind'], archetype: 'raven',
    base: { hp: 40, atk: 45, def: 40, spa: 50, spd: 42, spe: 70 },
    growth: 'fast', catchRate: 190, expYield: 52,
    palette: P('#14161e', '#2c303c', '#4a5060', '#6a7080', '#3a3a44', '#e0c040'),
    learnset: [[1, 'gust'], [1, 'leer'], [6, 'quickfang'], [11, 'wingslash'], [16, 'ravenflock'],
               [22, 'shadetouch'], [28, 'skyfall'], [34, 'nightterror']],
    evolve: { level: 22, into: 'corvarch' },
    dex: 'Maesters raise them by the hundred. This one learned three words and repeats them at the worst times.',
  },
  corvarch: {
    name: 'Corvarch', types: ['wind', 'shadow'], archetype: 'raven',
    base: { hp: 66, atk: 72, def: 62, spa: 84, spd: 68, spe: 106 },
    growth: 'fast', catchRate: 60, expYield: 168,
    palette: P('#0e1016', '#20232e', '#3c4250', '#5a6070', '#8a2028', '#f0d048'),
    learnset: [[1, 'gust'], [1, 'wingslash'], [1, 'ravenflock'], [24, 'shadetouch'],
               [31, 'skyfall'], [38, 'nightterror'], [46, 'longnight']],
    dex: 'A three-eyed thing in a rookery of two-eyed things. It watches doors nobody is watching.',
  },

  // ============================================================ lion line ==
  cubmane: {
    name: 'Cubmane', types: ['beast'], archetype: 'lion',
    base: { hp: 50, atk: 62, def: 48, spa: 42, spd: 44, spe: 58 },
    growth: 'medium', catchRate: 120, expYield: 62,
    palette: P('#6a4a18', '#d8a84c', '#f0cc7c', '#f8e8b8', '#a87a28', '#3c6a2a'),
    learnset: [[1, 'scratch'], [1, 'growl'], [7, 'bite'], [12, 'howl'], [18, 'rend'],
               [24, 'steelfang'], [31, 'maul'], [38, 'lastcharge']],
    evolve: { level: 28, into: 'goldmane' },
    dex: 'Bold out of all proportion to its size. It has never lost a fight it can remember.',
  },
  goldmane: {
    name: 'Goldmane', types: ['beast', 'steel'], archetype: 'lion',
    base: { hp: 82, atk: 108, def: 92, spa: 62, spd: 76, spe: 84 },
    growth: 'medium', catchRate: 45, expYield: 205,
    palette: P('#5a3a10', '#e8c058', '#f8e090', '#fff4cc', '#c02830', '#3c6a2a'),
    learnset: [[1, 'bite'], [1, 'howl'], [1, 'steelfang'], [28, 'rend'], [35, 'shieldwall'],
               [42, 'valyrian'], [50, 'maul'], [56, 'lastcharge']],
    dex: 'Hear it roar. Its mane is threaded with beaten gold that it did not ask anyone to give it.',
  },

  // ============================================================ stag line ==
  fawnhart: {
    name: 'Fawnhart', types: ['beast'], archetype: 'stag',
    base: { hp: 55, atk: 50, def: 52, spa: 48, spd: 55, spe: 62 },
    growth: 'medium', catchRate: 150, expYield: 58,
    palette: P('#4a3420', '#8a6238', '#b48a52', '#e0cba8', '#d8c078', '#2c1c12'),
    learnset: [[1, 'tackle'], [1, 'growl'], [6, 'leer'], [11, 'rocktoss'], [17, 'spark'],
               [23, 'landslide'], [30, 'stormbolt'], [37, 'maul']],
    evolve: { level: 26, into: 'crownstag' },
    dex: 'Skittish in the open, fearless in the trees. It follows travellers for miles without ever being seen.',
  },
  crownstag: {
    name: 'Crownstag', types: ['beast', 'storm'], archetype: 'stag',
    base: { hp: 90, atk: 96, def: 88, spa: 88, spd: 86, spe: 92 },
    growth: 'medium', catchRate: 45, expYield: 210,
    palette: P('#3a2818', '#6a4c2c', '#a07c46', '#e8dcc0', '#f0d850', '#e8cc4a'),
    learnset: [[1, 'tackle'], [1, 'spark'], [1, 'leer'], [26, 'stormbolt'], [34, 'staticfield'],
               [40, 'landslide'], [46, 'thunderhead'], [54, 'lastcharge']],
    dex: 'Ours is the fury. Storms follow its rutting season down the whole of the eastern coast.',
  },

  // ========================================================== kraken line ==
  krakenling: {
    name: 'Krakenling', types: ['tide'], archetype: 'kraken',
    base: { hp: 52, atk: 58, def: 48, spa: 60, spd: 46, spe: 50 },
    growth: 'medium', catchRate: 120, expYield: 66,
    palette: P('#2a1a3a', '#4a3060', '#6e4a88', '#c8a8d8', '#3a5a8a', '#f0e060'),
    learnset: [[1, 'riptide'], [1, 'leer'], [8, 'undertow'], [14, 'venomsting'], [20, 'tidalsurge'],
               [27, 'shadetouch'], [34, 'drownedfury'], [41, 'nightterror']],
    evolve: { level: 30, into: 'deepmaw' },
    dex: 'Pulled up in a crab pot off Pyke. It has been trying to pull something else down ever since.',
  },
  deepmaw: {
    name: 'Deepmaw', types: ['tide', 'shadow'], archetype: 'kraken',
    base: { hp: 88, atk: 96, def: 84, spa: 100, spd: 78, spe: 68 },
    growth: 'medium', catchRate: 45, expYield: 208,
    palette: P('#180f26', '#331f4a', '#553470', '#a888c8', '#22456e', '#f2e468'),
    learnset: [[1, 'undertow'], [1, 'tidalsurge'], [1, 'shadetouch'], [30, 'soulleech'],
               [38, 'drownedfury'], [46, 'longnight'], [54, 'mountainfall']],
    dex: 'We do not sow. Whole longships have been logged as lost to weather on nights it was hunting.',
  },

  // ========================================================= serpent line ==
  sandviper: {
    name: 'Sandviper', types: ['venom'], archetype: 'serpent',
    base: { hp: 44, atk: 60, def: 42, spa: 58, spd: 48, spe: 72 },
    growth: 'medium', catchRate: 120, expYield: 68,
    palette: P('#3a2a10', '#b09040', '#d8bc70', '#f0e0b0', '#9a4aa0', '#e05828'),
    learnset: [[1, 'scratch'], [1, 'leer'], [7, 'venomsting'], [13, 'bite'], [19, 'wither'],
               [25, 'toxicfang'], [32, 'rocktoss'], [40, 'scorpion']],
    evolve: { level: 30, into: 'dornspine' },
    dex: 'Dornish, and proud of it. It is not aggressive, but it does keep score.',
  },
  dornspine: {
    name: 'Dornspine', types: ['venom', 'stone'], archetype: 'serpent',
    base: { hp: 76, atk: 104, def: 82, spa: 92, spd: 78, spe: 100 },
    growth: 'medium', catchRate: 45, expYield: 206,
    palette: P('#2c2008', '#9c7c2c', '#c8a850', '#eedca0', '#c03848', '#f06030'),
    learnset: [[1, 'venomsting'], [1, 'bite'], [1, 'wither'], [30, 'toxicfang'],
               [38, 'landslide'], [46, 'scorpion'], [54, 'mountainfall']],
    dex: 'Unbowed, unbent, unbroken. Its venom has no known remedy and its patience has no known limit.',
  },

  // ============================================================ bear line ==
  bearcub: {
    name: 'Bearcub', types: ['beast'], archetype: 'bear',
    base: { hp: 62, atk: 60, def: 58, spa: 40, spd: 48, spe: 42 },
    growth: 'medium', catchRate: 150, expYield: 60,
    palette: P('#2a1c14', '#5a4030', '#7e5c44', '#c0a488', '#3a2a20', '#2c1c12'),
    learnset: [[1, 'tackle'], [1, 'growl'], [7, 'bite'], [13, 'ironclad'], [19, 'rend'],
               [26, 'frostbite'], [33, 'maul'], [41, 'lastcharge']],
    evolve: { level: 30, into: 'bearhold' },
    dex: 'Raised on Bear Island, where the women are said to be fiercer still.',
  },
  bearhold: {
    name: 'Bearhold', types: ['beast', 'frost'], archetype: 'bear',
    base: { hp: 108, atk: 106, def: 96, spa: 62, spd: 84, spe: 54 },
    growth: 'medium', catchRate: 45, expYield: 209,
    palette: P('#1e1610', '#453227', '#6a4f3c', '#cdb69c', '#9fc4d8', '#2c1c12'),
    learnset: [[1, 'bite'], [1, 'ironclad'], [1, 'rend'], [30, 'frostbite'], [38, 'whitewind'],
               [44, 'rally'], [50, 'maul'], [56, 'lastcharge']],
    dex: 'Here we stand. It will not give ground, and it does not understand why anyone would.',
  },

  // ========================================================== falcon line ==
  falconet: {
    name: 'Falconet', types: ['wind'], archetype: 'falcon',
    base: { hp: 42, atk: 52, def: 42, spa: 52, spd: 45, spe: 76 },
    growth: 'fast', catchRate: 150, expYield: 56,
    palette: P('#3a4450', '#7c8ea4', '#b0c0d0', '#eef2f8', '#e0c050', '#e8d040'),
    learnset: [[1, 'gust'], [1, 'leer'], [6, 'quickfang'], [12, 'wingslash'], [18, 'updraft'],
               [24, 'spark'], [31, 'skyfall'], [38, 'stormbolt']],
    evolve: { level: 26, into: 'skytalon' },
    dex: 'Hooded and jessed by the age of two moons. It resents the hood and forgives the jesses.',
  },
  skytalon: {
    name: 'Skytalon', types: ['wind', 'storm'], archetype: 'falcon',
    base: { hp: 70, atk: 92, def: 70, spa: 90, spd: 76, spe: 118 },
    growth: 'fast', catchRate: 45, expYield: 202,
    palette: P('#2c3644', '#6a7f98', '#a8bcd0', '#f4f8fc', '#f0d858', '#f2e050'),
    learnset: [[1, 'wingslash'], [1, 'updraft'], [1, 'spark'], [26, 'skyfall'],
               [34, 'stormbolt'], [44, 'thunderhead'], [52, 'ravenflock']],
    dex: 'As high as honour. It nests where the Eyrie ends and the sky has no more handholds.',
  },

  // ============================================================ boar line ==
  boartusk: {
    name: 'Boartusk', types: ['beast'], archetype: 'boar',
    base: { hp: 60, atk: 68, def: 56, spa: 34, spd: 44, spe: 50 },
    growth: 'medium', catchRate: 150, expYield: 61,
    palette: P('#241c18', '#4c3d34', '#6e5a4c', '#a89484', '#e8e0cc', '#3a2018'),
    learnset: [[1, 'tackle'], [1, 'leer'], [7, 'rocktoss'], [13, 'bite'], [20, 'landslide'],
               [26, 'bulwark'], [33, 'maul'], [40, 'lastcharge']],
    evolve: { level: 30, into: 'tuskrend' },
    dex: 'Kings have died of these. It was a very good boar and a very bad hunt.',
  },
  tuskrend: {
    name: 'Tuskrend', types: ['beast', 'stone'], archetype: 'boar',
    base: { hp: 100, atk: 116, def: 98, spa: 50, spd: 70, spe: 66 },
    growth: 'medium', catchRate: 45, expYield: 207,
    palette: P('#1a1410', '#3e322a', '#5e4c40', '#9c8878', '#f0e8d4', '#4a2018'),
    learnset: [[1, 'rocktoss'], [1, 'bite'], [1, 'bulwark'], [30, 'landslide'],
               [40, 'maul'], [48, 'mountainfall'], [56, 'lastcharge']],
    dex: 'A hillside with tusks. Hunters do not track it; they wait for it to finish with them.',
  },

  // =========================================================== wight line ==
  wightling: {
    name: 'Wightling', types: ['shadow', 'frost'], archetype: 'wight',
    base: { hp: 48, atk: 54, def: 50, spa: 56, spd: 50, spe: 44 },
    growth: 'slow', catchRate: 90, expYield: 70,
    palette: P('#12141c', '#3a4250', '#5c6878', '#8fa8bc', '#2a3240', '#2a6fd8'),
    learnset: [[1, 'shadetouch'], [1, 'leer'], [8, 'frostbite'], [14, 'nightterror'],
               [21, 'coldsnap'], [28, 'soulleech'], [36, 'wintersbite'], [44, 'longnight']],
    evolve: { level: 34, into: 'barrowlord' },
    dex: 'It was a man once, on the wrong side of the Wall, on the wrong night.',
  },
  barrowlord: {
    name: 'Barrowlord', types: ['shadow', 'frost'], archetype: 'wight',
    base: { hp: 86, atk: 92, def: 90, spa: 100, spd: 92, spe: 62 },
    growth: 'slow', catchRate: 45, expYield: 215,
    palette: P('#0d0f16', '#2c3442', '#4c5a6c', '#a8c4d8', '#1c2430', '#2a8ff0'),
    learnset: [[1, 'shadetouch'], [1, 'frostbite'], [1, 'nightterror'], [34, 'soulleech'],
               [42, 'wintersbite'], [50, 'longnight'], [58, 'hoarfrost']],
    dex: 'Crowned in the barrows of the First Men. It remembers a kingdom that no map still shows.',
  },
  palewalker: {
    name: 'Palewalker', types: ['frost', 'shadow'], archetype: 'wight',
    base: { hp: 95, atk: 100, def: 110, spa: 115, spd: 105, spe: 75 },
    growth: 'slow', catchRate: 3, expYield: 305,
    palette: P('#1a2630', '#c8e4f2', '#e8f6ff', '#ffffff', '#5f88a4', '#2ab0f0'),
    learnset: [[1, 'hoarfrost'], [1, 'wintersbite'], [1, 'longnight'], [55, 'iceward'],
               [60, 'soulleech'], [66, 'nightterror']],
    dex: 'Ice given a will. Steel shatters against it; only dragonglass and old fire leave a mark.',
  },

  // =========================================================== flame line ==
  emberwisp: {
    name: 'Emberwisp', types: ['flame'], archetype: 'flame',
    base: { hp: 42, atk: 38, def: 40, spa: 68, spd: 55, spe: 66 },
    growth: 'medium', catchRate: 150, expYield: 62,
    palette: P('#6a1c08', '#e05a18', '#f08c30', '#f8d878', '#f2b040', '#fff0b0'),
    learnset: [[1, 'ember'], [1, 'kindle'], [8, 'wardsigil'], [14, 'flamebreath'],
               [21, 'sevenlight'], [28, 'searingbrand'], [36, 'holyflame'], [44, 'dragonfire']],
    evolve: { level: 32, into: 'pyremaw' },
    dex: 'A flame that will not go out when the fire does. Red priests read futures in the shapes it makes.',
  },
  pyremaw: {
    name: 'Pyremaw', types: ['flame', 'faith'], archetype: 'flame',
    base: { hp: 78, atk: 66, def: 74, spa: 118, spd: 98, spe: 92 },
    growth: 'medium', catchRate: 45, expYield: 212,
    palette: P('#5a1204', '#e84a10', '#f88030', '#ffe8a0', '#ffd050', '#fff8d0'),
    learnset: [[1, 'flamebreath'], [1, 'kindle'], [1, 'sevenlight'], [32, 'wardsigil'],
               [40, 'holyflame'], [48, 'dragonfire'], [56, 'wildfire']],
    dex: 'The night is dark and full of terrors. It is neither, and it insists on saying so.',
  },

  // ======================================================== weirwood line ==
  sapling: {
    name: 'Sapling', types: ['wild'], archetype: 'treefolk',
    base: { hp: 58, atk: 46, def: 60, spa: 52, spd: 58, spe: 36 },
    growth: 'medium', catchRate: 150, expYield: 60,
    palette: P('#3a2a1a', '#7a5c38', '#a98858', '#6cb45e', '#4a8a44', '#c02830'),
    learnset: [[1, 'vinelash'], [1, 'growl'], [8, 'rootbind'], [14, 'drainroot'],
               [21, 'thornfall'], [29, 'wardsigil'], [37, 'weirwrath'], [45, 'prayer']],
    evolve: { level: 32, into: 'heartwarden' },
    dex: 'A weirwood shoot that pulled up its own roots one night and has been wandering since.',
  },
  heartwarden: {
    name: 'Heartwarden', types: ['wild', 'faith'], archetype: 'treefolk',
    base: { hp: 100, atk: 76, def: 108, spa: 96, spd: 106, spe: 44 },
    growth: 'medium', catchRate: 45, expYield: 214,
    palette: P('#2c1e12', '#e8e4dc', '#ffffff', '#d8474d', '#b82a30', '#d43a40'),
    learnset: [[1, 'drainroot'], [1, 'rootbind'], [1, 'thornfall'], [32, 'wardsigil'],
               [41, 'weirwrath'], [49, 'prayer'], [57, 'sevenlight']],
    dex: 'The old gods look out of its face. It has been listening at godswoods for ten thousand years.',
  },

  // ================================================================= misc ==
  crabcrag: {
    name: 'Crabcrag', types: ['tide', 'stone'], archetype: 'crab',
    base: { hp: 68, atk: 82, def: 100, spa: 44, spd: 62, spe: 40 },
    growth: 'medium', catchRate: 120, expYield: 96,
    palette: P('#5a2418', '#a8442a', '#cc6a44', '#f0c8a0', '#8a5a34', '#2a2a34'),
    learnset: [[1, 'rocktoss'], [1, 'leer'], [9, 'bulwark'], [15, 'undertow'], [22, 'riptide'],
               [29, 'landslide'], [37, 'tidalsurge'], [45, 'mountainfall']],
    dex: 'Crackclaw Point is named for the sound. Half the local shields are made from moulted shells.',
  },
};

export function species(id) {
  const found = SPECIES[id];
  if (!found) throw new Error(`Unknown species: ${id}`);
  return { id, ...found };
}

export const SPECIES_IDS = Object.keys(SPECIES);

/** Dex number, in declaration order. */
export function dexNumber(id) {
  return SPECIES_IDS.indexOf(id) + 1;
}
