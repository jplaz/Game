// What comes before the throne.
//
// Each petition is a decision with no clean answer: every option costs
// something — gold, the realm's steadiness, or a house's opinion of you. That
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
};

export const PETITION_IDS = Object.keys(PETITIONS);
