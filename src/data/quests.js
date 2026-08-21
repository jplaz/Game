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
        result: 'You cut the ropes. They run without thanking you, which is sensible of them. '
              + 'The Riverlands will hear a stranger did it. So will the Rock.',
      },
      {
        label: 'Pay their fine',
        standing: { tully: 10, lannister: 4 },
        gold: -800,
        choice: ['hangingTree', 'paid'],
        result: 'Eight hundred gold for one pig. The steward counts it twice, disappointed.',
      },
      {
        label: 'Ride on',
        standing: { tully: -10 },
        gold: 0,
        choice: ['hangingTree', 'ignored'],
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
        result: 'A she-wolf and four pups, and a dead ewe she did not take from anyone. '
              + 'You tell the village. They grumble, and they leave it alone.',
      },
      {
        label: 'Burn it out',
        standing: { stark: -14, freefolk: -8 },
        gold: 400,
        choice: ['brokenTower', 'burned'],
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
        result: 'He weeps, which is awkward for both of you. Highgarden hears of it, which is not.',
      },
      {
        label: 'Stand with him',
        standing: { tyrell: 8 },
        gold: 0,
        roamer: { id: 'sellsword', level: 22 },
        choice: ['maestersDebt', 'fought'],
        result: 'The collectors decide the debt is not worth this. Wyllis keeps his hands.',
      },
      {
        label: 'Let them have him',
        standing: { tyrell: -12 },
        gold: 300,
        choice: ['maestersDebt', 'abandoned'],
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
        result: 'They thank you at Castle Black, and they take his head at dawn. '
              + 'Both of those are what the Watch is.',
      },
      {
        label: 'Believe him and let him go',
        standing: { nightswatch: -18, freefolk: 10 },
        gold: 0,
        choice: ['deserterAtTheGate', 'freed'],
        result: 'He goes south and you go north, and one of you is walking toward the thing he saw.',
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
