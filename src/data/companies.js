// Swords for hire, across the Narrow Sea.
//
// The Free Cities were four beautiful places with nothing in them you could not
// get at home. You sailed east, you looked at the canals, you sailed back. The
// counting-house in Braavos was the first thing over there worth owning, and
// one thing is not a reason for a continent.
//
// This is the reason. In Westeros a sword follows you because you knocked him
// down and put a purse in front of him afterwards - which means the only way to
// raise a company is to beat one man at a time, and gold is no use to you at
// all until somebody is already on their knees. Essos has never worked that
// way. In Essos a man with money buys an army before breakfast and nobody asks
// him what his father was called.
//
// So: four companies, one to a city, and the price climbs with what you are
// buying. None of them asks about your house, your sigil or your name. All four
// ask the same question, which is the question the whole continent asks.
//
//   kind    which roamer they turn out to have been, once sworn
//   level   what they are worth on the day they take your coin
//   price   in gold

export const COMPANIES = {
  purpleHarbour: {
    name: 'The Bravos of the Purple Harbour',
    where: 'Braavos',
    kind: 'sellsword',
    level: 14,
    price: 2600,
    pitch: 'Sellsword Captain: You want a sword. Everybody who comes down this '
         + 'quay wants a sword. Mine are water dancers and they are quick, and '
         + 'quick is worth more than big in a narrow street.',
    taken: 'Sellsword Captain: Paid and witnessed. He is yours until he is dead '
         + 'or you stop paying, and in Braavos those are the same contract.',
    poor: 'Sellsword Captain: That is the price. The Titan does not haggle and '
        + 'neither do I.',
    full: 'Sellsword Captain: Six already walk behind you. Feed those before you '
        + 'buy another mouth.',
  },

  secondSons: {
    name: 'The Second Sons',
    where: 'Pentos',
    kind: 'sellsword',
    level: 22,
    price: 5200,
    pitch: 'Sellsword Captain: We have fought for Pentos, against Pentos, and '
         + 'twice on both sides of the same afternoon. We are honest about it, '
         + 'which is more than the magisters manage.',
    taken: 'Sellsword Captain: Done. He will hold the line as long as the line '
         + 'is winning, and longer than most if you pay on time.',
    poor: 'Sellsword Captain: Come back with the rest of it. We are not going '
        + 'anywhere; there is a war on somewhere always.',
    full: 'Sellsword Captain: You have six. That is a company already. Go and '
        + 'lose some.',
  },

  fieryHand: {
    name: 'The Fiery Hand',
    where: 'Volantis',
    kind: 'redPriestess',
    level: 30,
    price: 9400,
    pitch: "Priest of the Red Temple: These are not sellswords. They are the "
         + "Lord's own, a thousand of them, slaves bought as children and given "
         + 'to the fire. One will come with you. The Lord of Light has an '
         + 'interest in what you are doing.',
    taken: 'Priest of the Red Temple: Go, then. The night is dark and full of '
         + 'terrors, and you are walking towards the longest one there has been.',
    poor: 'Priest of the Red Temple: The Lord gives freely. The temple does not.',
    full: 'Priest of the Red Temple: Six is what a man can lead. More is what a '
        + 'man is led by.',
  },

  pitFighters: {
    name: 'The Champions of the Pit',
    where: 'Meereen',
    kind: 'manAtArms',
    level: 38,
    price: 16000,
    pitch: 'Pit Master: Free men now, and they still fight, because it is the '
         + 'only trade anybody taught them. This one has been in that sand '
         + 'eleven years. Eleven years is a very long time to keep winning.',
    taken: 'Pit Master: He is yours. He will want to be told what the fight is '
         + 'for. Nobody has ever told him before, so anything will do.',
    poor: 'Pit Master: Sixteen thousand. He is worth it and he knows he is '
        + 'worth it, which is half of why.',
    full: 'Pit Master: Six behind you already. A seventh would only be somebody '
        + 'else to bury.',
  },
};

export const COMPANY_IDS = Object.keys(COMPANIES);
