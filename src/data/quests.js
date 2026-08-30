// Side quests.
//
// Not fetch errands. Each one is a situation with more than one defensible
// answer, where the answers cost different people different things — which is
// the only kind of side quest worth writing in this setting.
//
//   giver     the line that starts it
//   stages    what the log says while it is open
//   resolve   the options, each with what it does
//             `roamer` means the answer has to be argued with steel first

export const QUESTS = {
  hangingTree: {
    name: 'The Hanging Tree',
    region: 'The Riverlands',
    summary: 'Three men are to hang at a crossroads for stealing from a lord.',
    giver: 'Smallfolk woman: They took a pig. One pig, between three families, '
         + "and Ser Amory means to hang them for it. You've a sword. I've nothing.",
    open: 'Three men will hang at the crossroads for a stolen pig.',
    resolve: [
      {
        label: 'Cut them down',
        standing: { tully: 18, lannister: -20 },
        gold: 0,
        choice: ['hangingTree', 'saved'],
        favour: { tully: 10, lannister: -8 },
        result: 'You cut the ropes. They run without thanking you, which is sensible of them. '
              + 'The Riverlands will hear a stranger did it. So will the Rock.',
      },
      {
        label: 'Pay their fine',
        standing: { tully: 10, lannister: 4 },
        gold: -800,
        choice: ['hangingTree', 'paid'],
        favour: { tully: 6 },
        result: 'Eight hundred gold for one pig. The steward counts it twice, disappointed.',
      },
      {
        label: 'Ride on',
        standing: { tully: -10 },
        gold: 0,
        choice: ['hangingTree', 'ignored'],
        favour: { tully: -10 },
        result: 'You are half a mile away before the sound reaches you. It still reaches you.',
      },
    ],
  },

  brokenTower: {
    name: 'The Broken Tower',
    region: 'The North',
    summary: 'Something has been living in the ruined tower, and the village is frightened.',
    giver: 'Villager: Nobody goes up there since autumn. We hear it at night. '
         + 'The lads want to burn it out. I want somebody to look first.',
    open: 'Something is living in the ruined tower above the village.',
    resolve: [
      {
        label: 'Look first',
        standing: { stark: 14 },
        gold: 0,
        choice: ['brokenTower', 'looked'],
        favour: { stark: 6 },
        result: 'A she-wolf and four pups, and a dead ewe she did not take from anyone. '
              + 'You tell the village. They grumble, and they leave it alone.',
      },
      {
        label: 'Burn it out',
        standing: { stark: -14, freefolk: -8 },
        gold: 400,
        choice: ['brokenTower', 'burned'],
        favour: { stark: -6, lannister: 4 },
        result: 'The tower burns. Something screams in it for a while. The village pays you '
              + 'and does not meet your eye afterwards.',
      },
    ],
  },

  maestersDebt: {
    name: "A Maester's Debt",
    region: 'The Reach',
    summary: 'A maester has been selling Citadel medicines and cannot cover what he owes.',
    giver: 'Maester Wyllis: I sold what I should not have, to people who needed it. '
         + 'The debt is real. The men coming for it are realer.',
    open: 'A maester owes money to people who collect it personally.',
    resolve: [
      {
        label: 'Cover the debt',
        standing: { tyrell: 16 },
        gold: -1500,
        choice: ['maestersDebt', 'paid'],
        favour: { tyrell: 10 },
        result: 'He weeps, which is awkward for both of you. Highgarden hears of it, which is not.',
      },
      {
        label: 'Stand with him',
        standing: { tyrell: 8 },
        gold: 0,
        roamer: { id: 'sellsword', level: 22 },
        choice: ['maestersDebt', 'fought'],
        favour: { tyrell: 6, lannister: -6 },
        result: 'The collectors decide the debt is not worth this. Wyllis keeps his hands.',
      },
      {
        label: 'Let them have him',
        standing: { tyrell: -12 },
        gold: 300,
        choice: ['maestersDebt', 'abandoned'],
        favour: { tyrell: -10 },
        result: 'They pay you for the trouble of not being trouble. It spends the same as any coin.',
      },
    ],
  },

  deserterAtTheGate: {
    name: 'The Deserter',
    region: 'The Wall',
    summary: 'A man of the Watch has run, and says he ran because of what he saw.',
    giver: 'Deserter: I saw them. Blue eyes and no breath. I ran and I would run again. '
         + 'They will take my head for it and I will still have been right.',
    open: 'A deserter from the Watch says he ran from something worth running from.',
    resolve: [
      {
        label: 'Take him back',
        standing: { nightswatch: 20, freefolk: -6 },
        gold: 500,
        choice: ['deserterAtTheGate', 'returned'],
        favour: { stark: 8 },
        result: 'They thank you at Castle Black, and they take his head at dawn. '
              + 'Both of those are what the Watch is.',
      },
      {
        label: 'Believe him and let him go',
        standing: { nightswatch: -18, freefolk: 10 },
        gold: 0,
        choice: ['deserterAtTheGate', 'freed'],
        favour: { stark: -8, arryn: 4 },
        result: 'He goes south and you go north, and one of you is walking toward the thing he saw.',
      },
    ],
  },
  saltWivesOfPyke: {
    name: 'The Salt Wife',
    region: 'The Iron Islands',
    summary: 'A woman taken in a raid wants passage home. Her taker calls her his wife.',
    giver: 'A Woman of Fair Isle: He calls me salt wife. There is a word for it on '
         + 'the green lands and it is not wife. There is a boat at Lordsport and I '
         + 'cannot walk to it alone.',
    open: 'A woman taken in an ironborn raid wants passage off Pyke.',
    resolve: [
      {
        label: 'Put her on the boat',
        standing: { greyjoy: -22, lannister: 12, tully: 8 },
        gold: -300,
        choice: ['saltWivesOfPyke', 'freed'],
        favour: { greyjoy: -14, tully: 8 },
        result: 'Three hundred to a captain who asks nothing. The Iron Islands will '
              + 'work out who paid it, and the Iron Islands are not large.',
      },
      {
        label: 'Buy her from him',
        standing: { greyjoy: 8, tully: 4 },
        gold: -2500,
        choice: ['saltWivesOfPyke', 'bought'],
        favour: { greyjoy: 6 },
        result: 'He takes the iron price in gold and finds it very funny. '
              + 'She does not look at you once on the walk to the harbour, and she is right not to.',
      },
      {
        label: 'It is their law, not yours',
        standing: { greyjoy: 12, tully: -12 },
        gold: 0,
        choice: ['saltWivesOfPyke', 'refused'],
        favour: { greyjoy: 10, tully: -8 },
        result: 'You are a guest on these islands and guests do not rewrite the law. '
              + 'You tell yourself that on the boat out, several times.',
      },
    ],
  },

  theGrainCount: {
    name: 'The Grain Count',
    region: 'The Reach',
    summary: 'The granary tally is short, and the man who kept it has a family.',
    giver: 'Highgarden Steward: Four hundred bushels short and one set of books. '
         + 'The man who kept them has been here nineteen years. My lady wants a name '
         + 'by evening and I would rather give her the truth.',
    open: 'Four hundred bushels are missing from the Highgarden granary.',
    resolve: [
      {
        label: 'Name him',
        standing: { tyrell: 18, martell: -6 },
        gold: 600,
        choice: ['theGrainCount', 'named'],
        favour: { tyrell: 10 },
        result: 'The books were his and so was the shortfall. They take his hand and '
              + 'his post, and his wife stands in the yard and does not make a sound.',
      },
      {
        label: 'Make the shortfall good yourself',
        standing: { tyrell: 10 },
        gold: -1800,
        choice: ['theGrainCount', 'covered'],
        favour: { tyrell: 8, martell: 4 },
        result: 'You buy four hundred bushels at market and the tally balances. '
              + 'Nobody is named. The steward knows exactly what you did and says nothing.',
      },
      {
        label: 'It went to the winter town, and say so',
        standing: { tyrell: -10, stark: 14 },
        gold: 0,
        choice: ['theGrainCount', 'north'],
        favour: { tyrell: -8, stark: 12 },
        result: 'He had been sending it north for two years, a wagon at a time, '
              + 'because the North is starving and the Reach is not. '
              + 'You say so out loud, in the hall, and let them decide what that makes him.',
      },
    ],
  },

  theDornishHostage: {
    name: 'The Hostage',
    region: 'Dorne',
    summary: 'A Lannister boy has been a guest at Sunspear for eleven years.',
    giver: 'Sunspear Guard: The boy came here at seven as surety for a peace, '
         + 'and the peace held, and nobody sent for him. He is eighteen. '
         + 'He asks me every year and I have run out of answers.',
    open: 'A hostage at Sunspear has been forgotten by the house that sent him.',
    resolve: [
      {
        label: 'Take him back to the Rock',
        standing: { lannister: 20, martell: -14 },
        gold: 1200,
        choice: ['theDornishHostage', 'returned'],
        favour: { lannister: 12, martell: -10 },
        result: 'Casterly Rock pays the escort without asking his name. '
              + 'He looks at the Rock for a long time and asks if you can hear the sea from inside.',
      },
      {
        label: 'Tell him he is free to go anywhere',
        standing: { martell: 14, lannister: -12 },
        gold: 0,
        choice: ['theDornishHostage', 'freed'],
        favour: { martell: 12, lannister: -8 },
        result: 'Nobody has told him that in eleven years and it takes him a while. '
              + 'He goes east, in the end, to somewhere neither house has a claim on.',
      },
      {
        label: 'Leave it alone',
        standing: { martell: 4, lannister: 4 },
        gold: 0,
        choice: ['theDornishHostage', 'ignored'],
        favour: {},
        result: 'It is a peace, and peaces are made of things like him. '
              + 'You keep walking, and so does the twelfth year.',
      },
    ],
  },

  theBastardsLetter: {
    name: "The Bastard's Letter",
    region: 'The North',
    summary: 'A letter out of the Dreadfort wants an answer, and any answer costs somebody.',
    giver: 'Frightened Maester: It came under the Bolton seal and it names a village. '
         + 'If I send it on, the village burns. If I burn it, they will want to know why '
         + 'no raven came, and then I burn.',
    open: 'A letter from the Dreadfort names a village. Somebody has to decide what happens to it.',
    resolve: [
      {
        label: 'Burn the letter and take the blame',
        standing: { bolton: -24, stark: 18 },
        gold: 0,
        choice: ['theBastardsLetter', 'burned'],
        favour: { stark: 14, bolton: -16 },
        roamer: { id: 'manAtArms', level: 30 },
        result: 'The village stands. Two of theirs come looking for the maester and '
              + 'find you instead, which was the point of standing where you stood.',
      },
      {
        label: 'Ride and warn the village first',
        standing: { stark: 12, bolton: -8 },
        gold: -400,
        choice: ['theBastardsLetter', 'warned'],
        favour: { stark: 10, bolton: -6 },
        result: 'They are gone before the riders come — cattle, grain, roofs stripped. '
              + 'The Boltons burn an empty village, which they enjoy rather less.',
      },
      {
        label: 'Send it on',
        standing: { bolton: 16, stark: -18 },
        gold: 900,
        choice: ['theBastardsLetter', 'sent'],
        favour: { bolton: 12, stark: -14 },
        result: 'The raven goes. You are ninety miles away by the time it matters '
              + 'and you can still tell which direction it was, from the colour of the sky.',
      },
    ],
  },

  theSellswordsWage: {
    name: "The Sellsword's Wage",
    region: 'The Crownlands',
    summary: 'A company has not been paid, and is deciding what to do about it.',
    giver: 'Company Serjeant: Four months. Four. The crown says next moon and said '
         + 'that last moon. The lads are talking about taking it out of the nearest town, '
         + 'and the nearest town is that one.',
    open: 'An unpaid free company is deciding whether to sack the nearest town.',
    resolve: [
      {
        label: 'Pay them out of your own purse',
        standing: { baratheon: 14, tully: 8 },
        gold: -4000,
        choice: ['theSellswordsWage', 'paid'],
        favour: { baratheon: 10 },
        result: 'Four thousand buys one month and one month buys the town. '
              + 'The serjeant knows precisely what you have bought and how long it lasts.',
      },
      {
        label: 'Fight the serjeant for the company',
        standing: { baratheon: 8, lannister: -6 },
        gold: 0,
        choice: ['theSellswordsWage', 'took'],
        favour: { baratheon: 6 },
        roamer: { id: 'sellsword', level: 32 },
        result: 'You put him down in front of all of them and the company decides '
              + 'it would rather follow that than burn a town for wages. For now.',
      },
      {
        label: 'Warn the town instead',
        standing: { baratheon: -6, tully: 12 },
        gold: 0,
        choice: ['theSellswordsWage', 'warned'],
        favour: { tully: 10, baratheon: -6 },
        result: 'The town shuts its gates and puts everything it has on the wall. '
              + 'The company looks at that for a day and goes to find a softer one.',
      },
    ],
  },
};

export const QUEST_IDS = Object.keys(QUESTS);

export function quest(id) {
  const found = QUESTS[id];
  if (!found) throw new Error(`Unknown quest: ${id}`);
  return { id, ...found };
}
