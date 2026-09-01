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

  /* --------------------------------------------------------- and at home --
   *
   * Four of these stood in the Free Cities and nowhere else, behind a ship you
   * had to buy, on the far side of a sea. Which meant that for the whole first
   * half of a game the only way to put a man behind you was to beat him nearly
   * to death and then find out, from nothing and nobody, that a purse exists
   * and goes in your pouch. Somebody who has just started has no company and
   * no idea there is such a thing as one.
   *
   * So: four more, on this side of the water, at four places anybody walking
   * the roads goes past. They are cheaper and worse than the Essosi companies,
   * which is right - a hedge knight at a crossroads inn is not a water dancer -
   * and they are the difference between a system you meet in hour one and a
   * system you meet in hour thirty. */

  crossroadsSwords: {
    name: 'The Crossroads Men',
    where: 'The Crossroads',
    kind: 'hedgeKnight',
    level: 8,
    price: 700,
    pitch: 'Hedge Knight: There are four of us drinking here and none of us has '
         + 'been paid since the spring. We are not much. We are cheap, we are '
         + 'here, and we will stand where you put us.',
    taken: 'Hedge Knight: Right. He has a horse and most of a mail shirt, and '
         + 'he will not run off in the first hour. That is the whole promise.',
    poor: 'Hedge Knight: Seven hundred. It is not a fortune. It is four men and '
        + 'a winter.',
    full: 'Hedge Knight: Six already. You could not feed a seventh and you know it.',
  },

  riverSpears: {
    name: 'The Tumblestone Spears',
    where: 'Riverrun',
    kind: 'manAtArms',
    level: 14,
    price: 1500,
    pitch: 'Serjeant of Spears: River levies, and better than that sounds. Half '
         + 'of them held the fords in the last war and the other half are the '
         + 'sons of the ones who did not come back off them.',
    taken: 'Serjeant of Spears: Taken and counted. He fights in a line, so put '
         + 'him in one.',
    poor: 'Serjeant of Spears: Fifteen hundred, and that is the widows\u2019 share '
        + 'in it, not mine.',
    full: 'Serjeant of Spears: Six is a company. Seven is a crowd with a wage bill.',
  },

  stormRiders: {
    name: 'The Rainwood Riders',
    where: "Storm's End",
    kind: 'hedgeKnight',
    level: 20,
    price: 2800,
    pitch: 'Master-at-Arms: Landless knights, most of them second sons out of '
         + 'the rainwood. They ride well, they hold, and they have all been '
         + 'wet for so long that nothing about a campaign frightens them.',
    taken: 'Master-at-Arms: Then he is yours. He will want feeding and he will '
         + 'want telling, in that order.',
    poor: 'Master-at-Arms: Twenty-eight hundred buys a horse, a lance and the '
        + 'man on top of it. Come back when you have it.',
    full: 'Master-at-Arms: Six. That is what a man can turn round and count in '
        + 'the dark. Leave it there.',
  },

  sandSteeds: {
    name: 'The Sand Steeds',
    where: 'Sunspear',
    kind: 'dornishOutrider',
    level: 26,
    price: 4200,
    pitch: 'Captain of the Sands: Light horse. They will not stand in your line '
         + 'and they will not thank you for asking. What they will do is be '
         + 'somewhere else by the time the other man has turned round.',
    taken: 'Captain of the Sands: Done. Do not put him in a wall of shields and '
         + 'then complain about him.',
    poor: 'Captain of the Sands: Four thousand two hundred. The horse alone is '
        + 'worth half of it.',
    full: 'Captain of the Sands: Six. Dorne has never needed more than six of '
        + 'anything.',
  },
};

export const COMPANY_IDS = Object.keys(COMPANIES);
