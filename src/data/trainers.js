// Trainer battles. `sight` is how many tiles ahead the trainer notices you;
// omit it for people who only fight when spoken to.

export const TRAINERS = {
  // ------------------------------------------------------ Winterfell gym ---
  starkGuard1: {
    name: 'Guardsman Hallis', sprite: 'guard', sight: 4, reward: 320,
    intro: 'No one walks into the Great Keep unchallenged. Not even you.',
    defeat: 'You have the North in you. Go on up.',
    after: "Lord Rickard is waiting. He doesn't like to be kept.",
    party: [{ species: 'snowpup', level: 9 }, { species: 'bearcub', level: 10 }],
  },
  starkGuard2: {
    name: 'Guardsman Torrhen', sprite: 'guard', sight: 4, reward: 340,
    intro: 'Cold morning for a challenge. Good. It sharpens things.',
    defeat: 'Sharp enough, then.',
    after: 'Keep your creatures fed and they will keep you standing.',
    party: [{ species: 'ravenling', level: 10 }, { species: 'boartusk', level: 11 }],
  },
  gymStark: {
    name: 'Lord Eddard Stark', sprite: 'stark', reward: 1500, leader: true, sigil: 'wolf',
    intro: 'Lord Eddard Stark: Winter is coming, and it does not care how ready you are. Show me you are anyway.',
    defeat: 'Lord Eddard Stark: The wolf yields. You have earned the Wolf Sigil, and the road south with it.',
    after: 'Lord Eddard Stark: Ride to Riverrun. Catelyn holds the Trout Sigil, and she is a harder judge than I am.',
    party: [
      { species: 'bearcub', level: 12 },
      { species: 'boartusk', level: 12 },
      { species: 'direwolf', level: 15 },
    ],
  },

  // ------------------------------------------------------- the Wolfswood ---
  forager: {
    name: 'Forager Wyl', sprite: 'smallfolk', sight: 3, reward: 180,
    intro: 'You are standing on my mushrooms.',
    defeat: 'And now you have flattened my dignity too.',
    after: 'Tall grass hides more than mushrooms. Walk it with care.',
    party: [{ species: 'sapling', level: 6 }, { species: 'ravenling', level: 6 }],
  },
  ranger: {
    name: 'Ranger Jon', sprite: 'nightswatch', sight: 4, reward: 260,
    intro: 'The Watch takes all sorts. Let me see what sort you are.',
    defeat: 'A good sort. Better than most who come through here.',
    after: 'North of the Wall there are things that make a direwolf look friendly.',
    party: [{ species: 'ravenling', level: 8 }, { species: 'snowpup', level: 9 }],
  },
  wildling1: {
    name: 'Ygrid the Free', sprite: 'wildling', sight: 4, reward: 240,
    intro: 'You kneelers all fight the same. Prove me wrong.',
    defeat: 'Huh. You know something after all.',
    after: 'Free folk take what they need and nothing more. Remember it.',
    party: [{ species: 'boartusk', level: 8 }, { species: 'bearcub', level: 9 }],
  },

  // -------------------------------------------------------- Moat Cailin ----
  bogGuard: {
    name: 'Bog Guard Reed', sprite: 'guard', sight: 4, reward: 420,
    intro: 'The Neck has drowned three armies. It can spare a moment for you.',
    defeat: 'Pass, then. Mind the sink-holes.',
    after: 'The causeway is the only safe road. Everything else is water pretending to be ground.',
    party: [{ species: 'riverfry', level: 11 }, { species: 'krakenling', level: 12 }],
  },

  // -------------------------------------------------------- the Riverlands --
  fisher: {
    name: 'Fisher Edd', sprite: 'tully', sight: 4, reward: 480,
    intro: 'Caught nothing all morning. You will do.',
    defeat: 'Still nothing. Worse than nothing.',
    after: 'Trout run the Trident thick as coins in a Lannister purse.',
    party: [{ species: 'riverfry', level: 13 }, { species: 'riverfry', level: 14 }],
  },
  pedlar: {
    name: 'Pedlar Hoss', sprite: 'merchant', sight: 3, reward: 520,
    intro: 'Buy something. Or fight me. Either way you are stopping.',
    defeat: 'Fine. Fine! No sale.',
    after: 'Banners are cheaper in the North and dearer in the South. Stock up early.',
    party: [{ species: 'ravenling', level: 13 }, { species: 'cubmane', level: 14 }],
  },
  freerider: {
    name: 'Freerider Mors', sprite: 'guard', sight: 4, reward: 560,
    intro: 'I ride for whoever pays. Today nobody has, so this one is free.',
    defeat: 'Should have waited for a paying fight.',
    after: 'Sworn swords fight for honour. Freeriders fight for supper. Supper is more reliable.',
    party: [{ species: 'fawnhart', level: 14 }, { species: 'boartusk', level: 15 }],
  },

  // ---------------------------------------------------------- Riverrun gym --
  tullyKnight1: {
    name: 'Ser Edmure', sprite: 'tully', sight: 4, reward: 700,
    intro: 'My sister set me to guard this hall. I intend to do it well, for once.',
    defeat: 'Well enough is not well. I see that now.',
    after: 'Family, duty, honour. In that order, and the order matters.',
    party: [{ species: 'riverfry', level: 17 }, { species: 'silverfin', level: 18 }],
  },
  tullyKnight2: {
    name: 'Ser Brynden', sprite: 'tully', sight: 5, reward: 760,
    intro: 'They call me the Blackfish. Nothing swims past me.',
    defeat: 'Something swims past me. Go on.',
    after: 'Water wears down stone. Patience is a weapon, not a virtue.',
    party: [{ species: 'crabcrag', level: 18 }, { species: 'silverfin', level: 19 }],
  },
  gymTully: {
    name: 'Lady Catelyn Tully', sprite: 'tully', reward: 3000, leader: true, sigil: 'trout',
    intro: 'You come from Winterfell with a wolf on your banner. Show me it means something.',
    defeat: 'It means something. The Trout Sigil is yours, and my blessing with it.',
    after: 'Lannisport is south along the Gold Road. Ser Jaime holds the Lion Sigil. He will not be gentle.',
    party: [
      { species: 'crabcrag', level: 20 },
      { species: 'krakenling', level: 20 },
      { species: 'silverfin', level: 23 },
    ],
  },
  sellsword: {
    name: 'Sellsword Bronn', sprite: 'lannister', reward: 900,
    intro: 'I fight for coin. But I will make an exception for the practice.',
    defeat: 'Worth the practice. Barely.',
    after: 'A man who fights fair has already lost. Remember that when someone tells you otherwise.',
    party: [{ species: 'cubmane', level: 19 }, { species: 'sandviper', level: 20 }],
  },

  // --------------------------------------------------------- the Gold Road --
  goldCloak1: {
    name: 'Guardsman Tybalt', sprite: 'lannister', sight: 4, reward: 880,
    intro: 'The Gold Road is Lannister road. Toll or trial. Pick.',
    defeat: 'Trial it was. Go on through.',
    after: 'Everything west of here belongs to the Rock, including the weather.',
    party: [{ species: 'cubmane', level: 21 }, { species: 'sandviper', level: 21 }],
  },
  hedgeKnight: {
    name: 'Ser Duncan', sprite: 'lannister', sight: 5, reward: 940,
    intro: 'No lands, no lord, no coin. Just a shield and a bad habit of using it.',
    defeat: 'A good habit of yours beats a bad habit of mine.',
    after: 'A hedge knight sleeps under hedges. It is exactly as pleasant as it sounds.',
    party: [{ species: 'boartusk', level: 22 }, { species: 'falconet', level: 22 }],
  },
  caravanner: {
    name: 'Caravanner Illyn', sprite: 'merchant', sight: 4, reward: 1000,
    intro: 'Bandits, bad roads and now you. It has been a long month.',
    defeat: 'Add it to the list.',
    after: 'There is a barrow-cave off the west of the road. Nobody who goes in comes out cheerful.',
    party: [{ species: 'emberwisp', level: 22 }, { species: 'cubmane', level: 23 }],
  },

  // ---------------------------------------------------- Casterly Rock gym ---
  apprentice: {
    name: 'Apprentice Gendry', sprite: 'lannister', reward: 1050,
    intro: 'I make the steel. Sometimes I get to use it.',
    defeat: 'Back to the forge, then.',
    after: 'Valyrian steel cannot be made any more, only reforged. Nobody remembers how it was done.',
    party: [{ species: 'emberwisp', level: 24 }, { species: 'crabcrag', level: 24 }],
  },
  lionKnight1: {
    name: 'Ser Kevan', sprite: 'lannister', sight: 4, reward: 1200,
    intro: 'My nephew holds this hall. I hold the stair. Neither is negotiable.',
    defeat: 'The stair is yours. The hall is still his.',
    after: 'A Lannister always pays his debts. This one is paid.',
    party: [{ species: 'cubmane', level: 26 }, { species: 'goldmane', level: 27 }],
  },
  lionKnight2: {
    name: 'Ser Addam', sprite: 'lannister', sight: 5, reward: 1250,
    intro: 'You have come a long way to lose indoors.',
    defeat: 'Or to win indoors. My mistake.',
    after: 'The Rock has never been taken. Not once, in all the years.',
    party: [{ species: 'sandviper', level: 27 }, { species: 'goldmane', level: 28 }],
  },
  gymLannister: {
    name: 'Ser Jaime Lannister', sprite: 'lannister', reward: 5000, leader: true, sigil: 'lion',
    intro: 'Two sigils and a northern accent. Let us see whether you can back either of them.',
    defeat: 'You can. Take the Lion Sigil — I have never enjoyed giving one away more.',
    after: "King's Landing is south. What sits on that throne is not a lord any more. Be careful.",
    party: [
      { species: 'sandviper', level: 29 },
      { species: 'tuskrend', level: 30 },
      { species: 'goldmane', level: 33 },
    ],
  },

  // ---------------------------------------------------------- the Kingsroad --
  stormKnight1: {
    name: 'Ser Lyle', sprite: 'baratheon', sight: 4, reward: 1400,
    intro: 'Ours is the fury. Mostly mine, at present.',
    defeat: 'Fury spent. Ride on.',
    after: 'Storm knights train in the rain because the rain never asks if you are ready.',
    party: [{ species: 'fawnhart', level: 30 }, { species: 'crownstag', level: 31 }],
  },
  stormKnight2: {
    name: 'Ser Rolland', sprite: 'baratheon', sight: 5, reward: 1450,
    intro: 'The last one who passed me is still walking it off.',
    defeat: 'You will not need to walk anything off. Well fought.',
    after: 'Storm bolts strike the tall things first. Keep something small in reserve.',
    party: [{ species: 'falconet', level: 31 }, { species: 'skytalon', level: 32 }],
  },
  deserter: {
    name: 'Deserter Karl', sprite: 'nightswatch', sight: 4, reward: 1500,
    intro: 'I left the Wall. You would have too, if you had seen it.',
    defeat: 'Turn me in if you like. The rope is quicker than the cold.',
    after: 'They are coming. Everyone laughs until the night the horn goes three times.',
    party: [{ species: 'wightling', level: 31 }, { species: 'barrowlord', level: 33 }],
  },

  // ------------------------------------------------------- the Red Keep -----
  kingsguardTrainee: {
    name: 'Kingsguard Trainee', sprite: 'guard', reward: 1600,
    intro: 'The white cloak has to be earned. Every day, apparently.',
    defeat: 'Earned it tomorrow, then.',
    after: 'Seven swear the white. Only one of us is any good, and it is not me.',
    party: [{ species: 'falconet', level: 32 }, { species: 'goldmane', level: 33 }],
  },
  kingsguard1: {
    name: 'Ser Meryn', sprite: 'guard', sight: 5, reward: 2200,
    intro: 'The throne room is closed to northern errand-riders.',
    defeat: 'It appears to be open.',
    after: 'I only ever guarded the door. Nobody asked me to guard anything worth guarding.',
    party: [{ species: 'tuskrend', level: 35 }, { species: 'goldmane', level: 36 }],
  },
  kingsguard2: {
    name: 'Ser Boros', sprite: 'guard', sight: 5, reward: 2300,
    intro: 'Two sigils? Three? It makes no difference up here.',
    defeat: 'It made a difference.',
    after: 'The stair goes up. So does everything else in this city, until it comes down.',
    party: [{ species: 'crownstag', level: 36 }, { species: 'dornspine', level: 37 }],
  },
  kingsguard3: {
    name: 'Ser Preston', sprite: 'guard', sight: 5, reward: 2400,
    intro: 'Last door before the throne. I take it seriously.',
    defeat: 'So do you. Go up.',
    after: 'Whatever is on that throne, it was a boy once. Not any more.',
    party: [{ species: 'skytalon', level: 37 }, { species: 'deepmaw', level: 38 }],
  },
  gymThrone: {
    name: 'Queen Cersei', sprite: 'cersei', reward: 12000, leader: true, sigil: 'stag',
    intro: 'Cersei Lannister: Everyone who climbs this stair wants the chair. Nobody who has sat in it does.',
    defeat: 'Cersei Lannister: My beasts are finished. I am not. Draw your steel.',
    after: 'Cersei Lannister: The realm is yours to hold. Holding is the hard part. Nobody warned me either.',
    party: [
      { species: 'tuskrend', level: 40 },
      { species: 'deepmaw', level: 40 },
      { species: 'dornspine', level: 41 },
      { species: 'skytalon', level: 41 },
      { species: 'crownstag', level: 44 },
    ],
  },

  // -------------------------------------------------------------- the rival --
  rival1: {
    name: 'Joffrey', sprite: 'rival', reward: 600,
    intro: "You? Riding the Kingsroad on Winterfell's business? They must be desperate.",
    defeat: 'That proves nothing. Nothing!',
    after: 'Enjoy it. It will not happen twice.',
    party: [{ species: 'cubmane', level: 12 }, { species: 'sandviper', level: 13 }],
  },
  rival2: {
    name: 'Joffrey', sprite: 'rival', reward: 1800,
    intro: 'Two sigils. How quaint. I have men who collect things for me.',
    defeat: 'You cheated. Somehow. I will work out how.',
    after: 'Go south, then. See how far a wolf gets in a lion city.',
    party: [
      { species: 'sandviper', level: 26 },
      { species: 'falconet', level: 26 },
      { species: 'goldmane', level: 29 },
    ],
  },
  rival3: {
    name: 'Joffrey', sprite: 'rival', reward: 5000,
    intro: 'The throne is MINE. It was always going to be mine. Everyone says so.',
    defeat: 'They all said it was mine...',
    after: "I never wanted the chair. I wanted them to stop looking at me like that.",
    party: [
      { species: 'dornspine', level: 38 },
      { species: 'skytalon', level: 38 },
      { species: 'tuskrend', level: 39 },
      { species: 'goldmane', level: 42 },
    ],
  },

  // ---------------------------------------------------- the road to the Wall --
  northRanger: {
    name: 'Ranger Qhorin', sprite: 'nightswatch', sight: 4, reward: 900,
    intro: 'Ranger Qhorin: Nobody rides north for a good reason. Show me yours.',
    defeat: 'Ranger Qhorin: Good enough. The gate will open for you.',
    after: 'Ranger Qhorin: Past the Wall, the cold is the least of it.',
    party: [{ species: 'snowpup', level: 16 }, { species: 'direwolf', level: 18 }],
  },
  freeFolk: {
    name: 'Free Folk Raider', sprite: 'wildling', sight: 4, reward: 2600,
    intro: 'Raider: You are a long way from a fire, kneeler.',
    defeat: 'Raider: Aye. All right. Go where you like.',
    after: 'Raider: The dead do not care whose banner you carry. Remember it.',
    party: [{ species: 'bearhold', level: 32 }, { species: 'barrowlord', level: 34 }],
  },

  // ------------------------------------------------------------- the Vale --
  valeKnight: {
    name: 'Ser Vardis', sprite: 'arryn', sight: 4, reward: 1700,
    intro: 'Ser Vardis: The Bloody Gate has turned back armies. It can turn back one rider.',
    defeat: 'Ser Vardis: Pass, then. The climb will finish what I started.',
    after: 'Ser Vardis: As high as honour. And as cold.',
    party: [{ species: 'falconet', level: 24 }, { species: 'skytalon', level: 26 }],
  },

  // ------------------------------------------------------------ the Reach --
  reachKnight: {
    name: 'Ser Loras', sprite: 'tyrell', sight: 5, reward: 2100,
    intro: 'Ser Loras: The Knight of Flowers. I would apologise for the name, but I did win it.',
    defeat: 'Ser Loras: Beautifully done. I shall be insufferable about having fought you.',
    after: 'Ser Loras: Growing strong. It sounds gentler than it is.',
    party: [{ species: 'sapling', level: 29 }, { species: 'heartwarden', level: 31 }],
  },

  // ------------------------------------------------------------------ Dorne --
  dorneRider: {
    name: 'Sand Steed Rider', sprite: 'martell', sight: 4, reward: 2400,
    intro: 'Rider: Dorne was never conquered. People forget why. I will remind you.',
    defeat: 'Rider: Unbowed. Unbent. Somewhat broken. Go on.',
    after: 'Rider: Water is worth more than gold out here. Carry both.',
    party: [{ species: 'sandviper', level: 32 }, { species: 'dornspine', level: 34 }],
  },

  // ------------------------------------------------------------ Stormlands --
  stormKnight3: {
    name: 'Ser Cortnay', sprite: 'baratheon', sight: 4, reward: 2200,
    intro: "Ser Cortnay: Storm's End has never fallen. Neither have I, yet.",
    defeat: 'Ser Cortnay: First time for everything, then.',
    after: 'Ser Cortnay: The storm always passes. That is the whole trick of it.',
    party: [{ species: 'fawnhart', level: 31 }, { species: 'crownstag', level: 34 }],
  },
};

export function trainer(id) {
  const found = TRAINERS[id];
  if (!found) throw new Error(`Unknown trainer: ${id}`);
  return { id, ...found };
}
