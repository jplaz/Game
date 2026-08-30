// Who will marry you.
//
// The game had no marriage in it at all — the petitions discussed marriage
// alliances and the styles discussed a household, and there was no spouse, no
// betrothal and no child anywhere in either build.
//
// One eligible match per great house, and every one of them will hear a
// landless nobody out: what they want is standing with their own house, which
// you earn by what you do rather than by what you were born. The price is the
// bride-gift, which is what this setting actually calls the money changing
// hands. Both a lady and a lord are listed for each seat, so the marriage does
// not assume anything about who you are.
//
//   needs   standing with their house before they will hear a proposal
//   price   the bride-gift, in gold
//   seat    the town their family holds, and where the wedding is

export const MATCHES = {
  alysKarstark: {
    id: 'alysKarstark',
    name: 'Alys Karstark', house: 'stark', seat: 'Winterfell',
    needs: 30, price: 2500,
    open: 'Alys Karstark: My uncle wants me married to a man twice my age with '
        + 'a keep that faces the wrong way. You are neither of those things, '
        + 'which is a start.',
    tooLow: 'Alys Karstark: I do not know you, and the North does not either. '
          + 'Come back when it does.',
    poor: 'Alys Karstark: There is a bride-gift, and my uncle counts it in front '
        + 'of the whole hall. Do not make me watch that go badly.',
    yes: 'Alys Karstark: Then it is agreed, and half the North will hear by spring. '
       + 'Come to Winterfell and we will do it properly.',
    wed: 'Alys Karstark: Well. That is done, and the hall did not fall in. '
       + 'Whatever comes next, it comes to both of us.',
    married: 'Alys Karstark: You are wanted at home more often than you manage it.',
  },

  domericBolton: {
    id: 'domericBolton',
    name: 'Domeric of the Weeping Water', house: 'bolton', seat: 'the Dreadfort',
    needs: 34, price: 3200,
    open: 'Domeric: My family has a reputation and I have spent nineteen years '
        + 'not being it. Marry me and you will find I am the dull one.',
    tooLow: 'Domeric: The Dreadfort would have to know you first, and the '
          + 'Dreadfort is slow about knowing people.',
    poor: 'Domeric: There is a gift expected. My father will make a great show '
        + 'of not minding if it is short, which is worse.',
    yes: 'Domeric: Then we are betrothed, and I shall write it down before '
       + 'anybody can be clever about it.',
    wed: 'Domeric: Married. My father smiled, which frightened everyone. '
       + 'Let us go somewhere else.',
    married: 'Domeric: You have been away. I have been reading. We are both content.',
  },

  jeyneTully: {
    id: 'jeyneTully',
    name: 'Jeyne of Riverrun', house: 'tully', seat: 'Riverrun',
    needs: 28, price: 2200,
    open: 'Jeyne: Family, duty, honour, in that order, and I have been told it '
        + 'every day of my life. I should like to pick the family part myself.',
    tooLow: 'Jeyne: The rivers have not decided about you. Neither have I.',
    poor: 'Jeyne: A bride-gift, and the Blackfish will look at it twice. '
        + 'He looks at everything twice.',
    yes: 'Jeyne: Then come to Riverrun, and mind the Blackfish. He is fond of me '
       + 'and suspicious of everybody.',
    wed: 'Jeyne: Family, duty, honour — and this time I chose the first one. '
       + 'That is the whole of what I wanted.',
    married: 'Jeyne: The rivers are high and you have been gone a while. Both mend.',
  },

  willasTyrell: {
    id: 'willasTyrell',
    name: 'Willas of Highgarden', house: 'tyrell', seat: 'Highgarden',
    needs: 32, price: 4000,
    open: 'Willas: I breed hounds and horses and I read a great deal, and my '
        + 'grandmother has decided this makes me difficult to place. '
        + 'She may be right.',
    tooLow: 'Willas: The Reach knows everybody worth knowing, and it does not '
          + 'yet know you. That is a solvable problem.',
    poor: 'Willas: There is a gift. My grandmother will price it to the copper '
        + 'and remember it for thirty years.',
    yes: 'Willas: Then it is settled, and the Queen of Thorns will pretend it '
       + 'was her idea. Let her.',
    wed: 'Willas: Married, and the roses held. Come and see the horses.',
    married: 'Willas: The hounds miss you. So, since you ask, do I.',
  },

  aryanneMartell: {
    id: 'aryanneMartell',
    name: 'Aryanne Sand', house: 'martell', seat: 'Sunspear',
    needs: 26, price: 2000,
    open: 'Aryanne Sand: I am a bastard of a bastard and I have never once been '
        + 'ashamed of it. In Dorne that is not an obstacle. Elsewhere it is all '
        + 'anybody can see. Which are you?',
    tooLow: 'Aryanne Sand: Dorne does not know you and Dorne is patient. '
          + 'I am rather less patient. Do something.',
    poor: 'Aryanne Sand: There is a gift, though in Dorne we are honest about '
        + 'calling it that. Come back with it.',
    yes: 'Aryanne Sand: Then we are promised, and half of Sunspear will have '
       + 'an opinion. Let them have it out loud.',
    wed: 'Aryanne Sand: Married in the Water Gardens with the children shrieking '
       + 'in the pools. I would not have had it anywhere else.',
    married: 'Aryanne Sand: You are brown as a Dornishman now. It suits you.',
  },

  elenaBaratheon: {
    id: 'elenaBaratheon',
    name: 'Elena of Storm\'s End', house: 'baratheon', seat: 'Storm\'s End',
    needs: 30, price: 2800,
    open: 'Elena: Everyone who comes to this castle wants something from the '
        + 'storm lords. You have not asked me for anything yet, which is either '
        + 'a strategy or a novelty.',
    tooLow: 'Elena: The Stormlands do not know your name. Ours is a short memory '
          + 'and a loud one — give it something to shout.',
    poor: 'Elena: A bride-gift, and the hall will see it carried in. '
        + 'Storm\'s End enjoys a spectacle rather too much.',
    yes: 'Elena: Then it is done, and the storm can do what it likes about it.',
    wed: 'Elena: Married with the sea going mad outside. Nobody heard a word '
       + 'of the vows. We said them anyway.',
    married: 'Elena: You were away in the worst of it. I listened to it for both of us.',
  },

  asharaGreyjoy: {
    id: 'asharaGreyjoy',
    name: 'Asha of Pyke', house: 'greyjoy', seat: 'Pyke',
    needs: 34, price: 1800,
    open: 'Asha: I captain my own ship and I will go on captaining it. '
        + 'If that is a difficulty for you, say so now and save us both.',
    tooLow: 'Asha: The islands do not reckon you anything yet. '
          + 'What is dead may never die, and what is nobody stays nobody.',
    poor: 'Asha: We pay the iron price for most things and the gold price for '
        + 'this one, which my uncles find very funny. Bring it anyway.',
    yes: 'Asha: Then we are promised. I have told the crew. They took it well, '
       + 'which is to say they are still drinking about it.',
    wed: 'Asha: Married on the deck with the priest shouting over the wind. '
       + 'My ship, my terms, and you agreed to both.',
    married: 'Asha: Landsick yet? You will be. Come out with me.',
  },

  mya: {
    id: 'mya',
    name: 'Mya Stone', house: 'arryn', seat: 'the Eyrie',
    needs: 24, price: 900,
    open: 'Mya Stone: I drive mules up a mountain for a living and my father was '
        + 'a king. Nobody in the Vale can decide which of those to treat me as. '
        + 'I have stopped waiting for them to work it out.',
    tooLow: 'Mya Stone: The Vale does not know you and I do not marry strangers. '
          + 'Go and be somebody for a while.',
    poor: 'Mya Stone: There is a gift, and it is small, because I am a bastard '
        + 'and everybody involved knows the rate. Bring it and we will not '
        + 'discuss it again.',
    yes: 'Mya Stone: Then that is that. Come up the mountain and we will do it '
       + 'in front of the mules.',
    wed: 'Mya Stone: Married six hundred steps up with the whole Vale below us. '
       + 'No lord came. I did not ask any.',
    married: 'Mya Stone: The track is clear this week. Come up, if you can still climb.',
  },
};

export const MATCH_IDS = Object.keys(MATCHES);

export function match(id) {
  const found = MATCHES[id];
  if (!found) throw new Error(`Unknown match: ${id}`);
  return { id, ...found };
}
