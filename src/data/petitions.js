// What comes before the throne.
//
// Each petition is a decision with no clean answer: every option costs
// something  -  gold, the realm's steadiness, or a house's opinion of you. That
// is the whole of ruling, and it is why the postgame is a series of these
// rather than a series of fights.
//
//   requires   optional gate; a petition only comes up when it makes sense
//   options    [{ label, gold, stability, standing: {house: delta}, result }]

export const PETITIONS = {
  grainTax: {
    text: 'The Reach has had a poor harvest. Highgarden asks to be forgiven this '
        + "year's grain tax.",
    options: [
      {
        label: 'Forgive it',
        gold: -1200, stability: 4, standing: { tyrell: 18 },
        result: 'The granaries stay shut and the Reach remembers who let them.',
      },
      {
        label: 'Collect in full',
        gold: 1800, stability: -6, standing: { tyrell: -20 },
        result: 'The carts come north full. So do the reports of empty villages.',
      },
      {
        label: 'Halve it',
        gold: 600, stability: 1, standing: { tyrell: 4 },
        result: 'Nobody is pleased and nobody is ruined. Most of ruling looks like this.',
      },
    ],
  },

  wallRequest: {
    text: "The Night's Watch is down to a few hundred men and asks the crown for "
        + 'coin, arms, and anyone you can spare.',
    options: [
      {
        label: 'Send men and gold',
        gold: -2500, stability: -3, standing: { nightswatch: 30, freefolk: 6 },
        result: 'The Wall is held. Nobody south of it will ever know it mattered.',
      },
      {
        label: 'Send gold only',
        gold: -900, stability: 0, standing: { nightswatch: 10 },
        result: 'Coin does not stand a watch, but it buys boots, and boots help.',
      },
      {
        label: 'Refuse them',
        gold: 0, stability: -2, standing: { nightswatch: -25 },
        result: 'The raven goes back empty. You will hear from them again, or you will not.',
      },
    ],
  },

  ironbornRaids: {
    text: 'Ironborn longships are taking ships off the Reach coast. Pyke says '
        + 'they cannot control every captain.',
    options: [
      {
        label: 'Send the fleet',
        gold: -2000, stability: 6, standing: { greyjoy: -25, tyrell: 20 },
        result: 'Three ships burn in the Sunset Sea. The raids stop for a season.',
      },
      {
        label: 'Demand Pyke pay',
        gold: 1500, stability: -2, standing: { greyjoy: -15, tyrell: 8 },
        result: 'The iron price, paid in gold for once. Pyke will not forget the humiliation.',
      },
      {
        label: 'Let them settle it',
        gold: 0, stability: -8, standing: { tyrell: -18 },
        result: 'Two of your own lords now believe the crown does not answer them.',
      },
    ],
  },

  dornishMarriage: {
    text: 'Sunspear offers a marriage alliance. Casterly Rock has made it plain '
        + 'what they think of the idea.',
    options: [
      {
        label: 'Accept Dorne',
        gold: 800, stability: 4, standing: { martell: 28, lannister: -18 },
        result: 'Dorne is bound to you. The Rock is not, and says so at length.',
      },
      {
        label: 'Refuse politely',
        gold: 0, stability: -1, standing: { martell: -12, lannister: 10 },
        result: 'The Dornish party rides home. They were courteous about it, which is worse.',
      },
      {
        label: 'Stall them both',
        gold: 0, stability: -4, standing: { martell: -6, lannister: -6 },
        result: 'You have offended two houses by declining to offend either.',
      },
    ],
  },

  boltonFlaying: {
    text: 'The Dreadfort has been flaying men again. The North wants it stopped. '
        + 'The Boltons say it is their right under old custom.',
    options: [
      {
        label: 'Forbid it outright',
        gold: 0, stability: 5, standing: { bolton: -30, stark: 22 },
        result: 'The old custom is dead by royal decree. The Dreadfort goes very quiet.',
      },
      {
        label: 'Look the other way',
        gold: 600, stability: -7, standing: { bolton: 15, stark: -22 },
        result: 'A quiet arrangement, quietly paid for. The North hears about it anyway.',
      },
    ],
  },

  emptyTreasury: {
    text: 'The master of coin says the crown is spending faster than it collects. '
        + 'He suggests a levy.',
    requires: { treasuryBelow: 2000 },
    options: [
      {
        label: 'Raise the levy',
        gold: 3000, stability: -10, standing: {},
        result: 'The coffers fill. Every holdfast in the realm now has a grievance.',
      },
      {
        label: 'Cut the court instead',
        gold: 1000, stability: -3, standing: {},
        result: 'Fewer feasts, fewer singers, fewer friends.',
      },
      {
        label: 'Do nothing',
        gold: 0, stability: -5, standing: {},
        result: 'The master of coin writes it down, so that later he can point at it.',
      },
    ],
  },

  oldFriend: {
    text: 'A rider you once travelled with is in the black cells for killing a '
        + 'lord who deserved it.',
    options: [
      {
        label: 'Pardon them',
        gold: 0, stability: -6, standing: {},
        result: 'They walk out blinking. Half the court decides your justice can be bought by friendship.',
        choice: ['pardonedFriend', 'pardoned'],
      },
      {
        label: 'Let the law run',
        gold: 0, stability: 5, standing: {},
        result: 'The sentence is carried out. You are told it was the right thing several times.',
        choice: ['pardonedFriend', 'executed'],
      },
    ],
  },

  winterStores: {
    text: 'Winter is coming in hard. The North asks leave to hold back its grain '
        + 'rather than ship it south.',
    options: [
      {
        label: 'Let them keep it',
        gold: -700, stability: 3, standing: { stark: 20, lannister: -8 },
        result: 'The North will eat. The capital pays more for bread and says so.',
      },
      {
        label: 'Order it shipped',
        gold: 1200, stability: -6, standing: { stark: -24 },
        result: 'The carts roll south past people who watched them being loaded.',
      },
    ],
  },

  /* --- and what comes after the first year on the chair --------------------- */

  vanishedFleet: {
    text: 'Nine ships out of Gulltown have not come back. The Vale wants an '
        + 'escort. Pyke says the sea takes ships and always has.',
    options: [
      {
        label: 'Escort every convoy',
        gold: -1800, stability: 5, standing: { arryn: 24, greyjoy: -10 },
        result: 'The tenth convoy goes out under sail and comes back under sail. It costs what it costs.',
      },
      {
        label: 'Send a man to look',
        gold: -300, stability: 1, standing: { arryn: 6 },
        result: 'He comes back in a month with a report nobody reads and a name nobody expected.',
      },
      {
        label: 'Tell the Vale to arm its own ships',
        gold: 400, stability: -5, standing: { arryn: -20 },
        result: 'They do. Within a year the Vale has a fleet, and it does not answer to you.',
      },
    ],
  },

  theOldDebt: {
    text: 'The Iron Bank writes. The crown has owed them for three reigns and '
        + 'they would like to know which of those reigns you consider yours.',
    options: [
      {
        label: 'Pay it in full',
        gold: -4000, stability: 8, standing: {},
        result: 'The letter that comes back is two lines long and very warm. That is what four thousand buys.',
      },
      {
        label: 'Pay what this reign owes',
        gold: -1500, stability: 2, standing: {},
        result: 'A reasonable answer, and reasonable answers are filed rather than forgotten.',
      },
      {
        label: 'Repudiate the whole of it',
        gold: 0, stability: -12, standing: {},
        result: 'The Iron Bank does not threaten. It funds. Somebody, somewhere, has just become very well armed.',
      },
    ],
  },

  theBastardClaim: {
    text: "A boy in Storm's End is being called Robert's son by people who "
        + 'stand to gain by it. He is fourteen and has said nothing.',
    options: [
      {
        label: 'Legitimise him',
        gold: -600, stability: -6, standing: { baratheon: 26, lannister: -14 },
        result: 'The Stormlands have an heir and you have a claimant. Both of those are true at once.',
      },
      {
        label: 'Send him to the Wall',
        gold: 0, stability: 6, standing: { baratheon: -18 },
        result: 'He goes north without complaining, which is the part that stays with you.',
      },
      {
        label: 'Leave him where he is',
        gold: 0, stability: -3, standing: { baratheon: 4 },
        result: 'Nothing happens for two years. Then it does.',
      },
    ],
  },

  theRedTemple: {
    text: 'A red priestess has been preaching in the Street of Steel. Two septs '
        + 'have burned. She says she lit neither.',
    options: [
      {
        label: 'Expel her from the city',
        gold: 0, stability: 4, standing: { targaryen: -16 },
        result: 'She goes east without arguing. Her congregation stays, and now it has a grievance.',
      },
      {
        label: 'Let her preach',
        gold: 500, stability: -7, standing: { targaryen: 18 },
        result: 'The temple pays its tithe on time, every time, and the Faith writes you a long letter.',
      },
      {
        label: 'Have the fires looked into properly',
        gold: -400, stability: 2, standing: {},
        result: 'It was not her. It was a man with a grudge and a lamp. Nobody is pleased to hear it.',
      },
    ],
  },

  drySummer: {
    text: 'The Blackwater has run low and the wells in Flea Bottom are foul. '
        + 'The city will have a bad summer or a very bad one.',
    options: [
      {
        label: "Dig new wells at the crown's cost",
        gold: -2200, stability: 10, standing: {},
        result: 'It is the least glorious thing you will ever do and the one they will remember.',
      },
      {
        label: 'Have the guilds pay for them',
        gold: -400, stability: 2, standing: { lannister: -8 },
        result: 'The wells go in. So does the price of everything the guilds sell.',
      },
      {
        label: 'Ration the wells you have',
        gold: 0, stability: -9, standing: {},
        result: 'Queues, and then a queue that stops being a queue.',
      },
    ],
  },

  theDornishRoad: {
    text: 'Sunspear asks leave to build a road through the Boneway at the '
        + "crown's expense. The Marcher lords would rather it stayed a goat track.",
    options: [
      {
        label: 'Build it',
        gold: -2600, stability: 3, standing: { martell: 26, baratheon: -12 },
        result: 'Trade doubles in a year. So does the speed at which an army could come north.',
      },
      {
        label: 'Let Dorne build it themselves',
        gold: 0, stability: 0, standing: { martell: 8, baratheon: -4 },
        result: 'They do, slowly, and they own every yard of it when it is done.',
      },
      {
        label: 'Refuse',
        gold: 0, stability: -4, standing: { martell: -20 },
        result: 'The Boneway stays a goat track and Dorne stays Dorne, which is the point.',
      },
    ],
  },

  theTourney: {
    text: 'The court wants a tourney. It would cost a great deal and it would '
        + 'be the first happy thing in the capital in six years.',
    options: [
      {
        label: 'Hold it, and spare no expense',
        gold: -3000, stability: 12, standing: { tyrell: 14, baratheon: 10 },
        result: 'Eleven days of it. For a season afterwards people in the street look at each other.',
      },
      {
        label: 'A small one',
        gold: -900, stability: 5, standing: { tyrell: 4 },
        result: 'Modest, well run, and remembered fondly by everyone who was not competing.',
      },
      {
        label: 'There is nothing to celebrate',
        gold: 0, stability: -5, standing: { tyrell: -10 },
        result: 'You are right, and being right about this turns out to cost more than the tourney would have.',
      },
    ],
  },

  theSilentSister: {
    text: 'A woman has come from the Riverlands with a list of everyone your '
        + 'army killed on the way south, and she would like it read aloud.',
    options: [
      {
        label: 'Read it, all of it',
        gold: 0, stability: -8, standing: { tully: 28 },
        result: 'It takes four hours. Nobody in the hall moves. The Riverlands hear about it before the week is out.',
      },
      {
        label: 'Pay the families instead',
        gold: -2000, stability: 3, standing: { tully: 14 },
        result: 'Gold arrives at two hundred doors. At a hundred and ninety of them it is taken.',
      },
      {
        label: 'Have her removed',
        gold: 0, stability: 2, standing: { tully: -26 },
        result: 'She is put outside the gate and reads it there, to whoever is passing, every day for a month.',
      },
    ],
  },

  thePretender: {
    text: 'A boy across the narrow sea is calling himself a dragon and has '
        + "bought two thousand spears with somebody else's money.",
    options: [
      {
        label: 'Send men to kill him',
        gold: -2400, stability: 4, standing: { targaryen: -28 },
        result: 'It is done in Myr, quietly and badly, and everyone knows within the month who paid for it.',
      },
      {
        label: 'Offer him a place at court',
        gold: -800, stability: -4, standing: { targaryen: 22 },
        result: 'He comes. He is nineteen and frightened and rather clever, and now he is inside the walls.',
      },
      {
        label: 'Ignore him',
        gold: 0, stability: -7, standing: {},
        result: 'Two thousand spears becomes six thousand while nobody is counting.',
      },
    ],
  },

  theLongNight: {
    text: 'Eastwatch sends a raven with four words on it: they are coming south. '
        + 'The council would like to discuss whether it is genuine.',
    requires: {},
    options: [
      {
        label: 'Muster the realm',
        gold: -5000, stability: -10, standing: { stark: 30, nightswatch: 40 },
        result: 'Every lord in the Seven Kingdoms is told to march north in winter on the word of one raven. Some of them do.',
      },
      {
        label: 'Send the fleet to Eastwatch and see',
        gold: -1600, stability: 0, standing: { stark: 12, nightswatch: 18 },
        result: 'Nine ships go north. Six come back, and what the captains say is not written down.',
      },
      {
        label: 'It is four words on a scrap',
        gold: 0, stability: 5, standing: { stark: -26, nightswatch: -30 },
        result: 'The council is relieved. You are not, and you keep that to yourself, which is the job.',
      },
    ],
  },
};

export const PETITION_IDS = Object.keys(PETITIONS);
