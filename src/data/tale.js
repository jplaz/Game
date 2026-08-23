// The last act.
//
// Everything else in this game is a road with people on it. This is the one
// part that is told rather than walked: five sequences that fire at fixed
// points once you hold nine sigils, and that turn the tenth from a room with a
// woman in it into the end of a story.
//
// A page is a sky, an emblem drawn in silhouette, a heading and a body. The
// cartridge paints the sky in flat bands the way it paints a duel yard, draws
// the emblem on the text layer, and types the body underneath. `byHouse` is for
// the pages that must not read the same for a Stark as for a Greyjoy: the
// cartridge picks the line for the house you swore to.
//
// The order they fire in:
//
//   summons    the ninth sigil, wherever you are standing
//   gate       the first time you climb to the Red Keep holding nine
//   champion   Cersei falls, and the thing behind the throne stands up
//   throne     the champion falls, and there is nothing left between you and it
//   crowned    you sit down
//
// SKY: 0 open day, 1 snow, 2 forest dusk, 3 river haze, 4 dragonstone smoke,
//      5 indoors. MARK: 0 nothing, 1 the throne, 2 a raven, 3 a crown,
//      4 the Wall, 5 fire.

const SKY = { day: 0, snow: 1, dusk: 2, haze: 3, smoke: 4, indoors: 5 };
const MARK = { none: 0, throne: 1, raven: 2, crown: 3, wall: 4, fire: 5 };

/** Swearable houses, in the order the export lists them. */
export const TALE_HOUSES = ['stark', 'tully', 'arryn', 'tyrell', 'lannister',
                            'martell', 'baratheon', 'targaryen', 'greyjoy'];

/** Turns a { house: line } object into the array the cartridge indexes. */
const byHouse = (lines) => TALE_HOUSES.map((h) => {
  if (!lines[h]) throw new Error(`the last act has nothing to say to House ${h}`);
  return lines[h];
});

export const TALES = {
  // ======================================================== the ninth sigil ==
  summons: {
    name: 'A Raven Comes',
    pages: [
      {
        sky: SKY.dusk, mark: MARK.raven,
        title: 'A Raven Comes',
        body: 'It finds you wherever you are standing. Ravens do. There is a '
            + 'ring of black wax on the scroll and no seal pressed into it, '
            + 'which tells you more than a seal would have.',
      },
      {
        sky: SKY.dusk, mark: MARK.raven,
        title: 'The Message',
        body: '"Nine seats have bent to you. Nine is not ten. Come to the Red '
            + 'Keep and be told no to your face, or stay where you are and be '
            + 'told no by every man who ever wanted what you have."',
      },
      {
        sky: SKY.smoke, mark: MARK.none,
        title: 'What It Means',
        body: 'Nine sigils is a count nobody has held living. Every lord in the '
            + 'realm now knows exactly where you are and precisely how much you '
            + 'are worth, and both of those are new problems.',
        byHouse: byHouse({
          stark: 'Nine sigils. The North has been quietly telling itself for a '
               + 'year that you would get this far, and quietly telling '
               + 'everybody else that you would not. Winterfell will hear of '
               + 'this before you have finished reading it.',
          tully: 'Nine sigils. Family, duty, honour - in that order, and you '
               + 'have just put all three on the same table in King\'s Landing '
               + 'and pushed them into the middle.',
          arryn: 'Nine sigils. The Vale has stayed out of every war it could '
               + 'and won every one it could not. They will want to know which '
               + 'of those this is before they say a word.',
          tyrell: 'Nine sigils. The Reach has fed every king who ever sat in '
               + 'that chair and been thanked by none of them. Highgarden will '
               + 'find this very funny and will not say so.',
          lannister: 'Nine sigils. A Lannister pays his debts, and the realm is '
               + 'about to find out what it owes you. Casterly Rock will be '
               + 'counting before the raven has landed.',
          martell: 'Nine sigils. Dorne was never conquered and never needed to '
               + 'take anything by the front door. Sunspear will want to know '
               + 'why you did.',
          baratheon: 'Nine sigils. Ours is the fury, and the fury has finally '
               + 'been pointed at something worth the trouble. Storm\'s End '
               + 'will not ask you to stop.',
          targaryen: 'Nine sigils. Every one of them taken from a house that '
               + 'helped pull your family off that chair. There is one seat '
               + 'left and it was yours before any of them were born.',
          greyjoy: 'Nine sigils, and not one of them paid for in gold. We do '
               + 'not sow. Pyke will be drinking about this for a week and '
               + 'will still say you did it the soft way.',
        }),
      },
      {
        sky: SKY.smoke, mark: MARK.throne,
        title: 'The Road South',
        body: 'The Red Keep sits on Aegon\'s High Hill with the whole city under '
            + 'it. Go up when you are ready. Nobody up there is going anywhere, '
            + 'and none of them will be pleased to see you.',
      },
    ],
  },

  // ======================================================== climbing the hill ==
  gate: {
    name: 'The Throne Room',
    pages: [
      {
        sky: SKY.indoors, mark: MARK.none,
        title: 'The Great Doors',
        body: 'Two men in white hold the doors and neither one looks at your '
            + 'face. They look at your hands, and at what is in them, and one '
            + 'of them steps aside a half-pace before the other does.',
      },
      {
        sky: SKY.indoors, mark: MARK.throne,
        title: 'The Hall',
        body: 'It is longer than it needs to be. That is the point of it: every '
            + 'man who has ever walked this floor has had a hundred paces to '
            + 'think about turning round, and the ones who did not turn round '
            + 'are the ones the chair remembers.',
      },
      {
        sky: SKY.indoors, mark: MARK.throne,
        title: 'The Iron Throne',
        body: 'A thousand blades, taken off a thousand men who had finished '
            + 'needing them, welded by dragonfire into something to sit on. It '
            + 'is not a chair. It is an argument, and it has been winning it '
            + 'for three hundred years.',
      },
      {
        sky: SKY.indoors, mark: MARK.crown,
        title: 'And Somebody In It',
        body: 'Cersei Lannister does not stand up. She has watched a great many '
            + 'people come down this hall and she has learned that standing up '
            + 'is what you do for people who matter.',
      },
    ],
  },

  // ===================================================== when the queen falls ==
  champion: {
    name: 'Her Champion',
    pages: [
      {
        sky: SKY.indoors, mark: MARK.crown,
        title: 'She Goes Down',
        body: '"There." She is on one knee on her own floor and her voice has '
            + 'not moved at all. "That is the part everybody rehearses. Now the '
            + 'part nobody does."',
      },
      {
        sky: SKY.indoors, mark: MARK.none,
        title: 'Something Moves',
        body: 'Behind the throne, where the light does not reach, something that '
            + 'has been standing still for the whole of this stands a little '
            + 'less still. It is eight feet of it and it is wearing everything '
            + 'a smith could hang on a man.',
      },
      {
        sky: SKY.indoors, mark: MARK.none,
        title: 'Ser Gregor Clegane',
        body: 'It does not speak. It has not spoken in some time. The last three '
            + 'people to see it up close are not available to say what it is '
            + 'like, and that is the only account anyone has of it.',
        byHouse: byHouse({
          stark: 'You have heard this name your whole life, at Winterfell, in '
               + 'the voice people use for things that happened to somebody '
               + 'else\'s family. Now it is in the room.',
          tully: 'The Riverlands know this one. It came through them twice and '
               + 'the second time there was less to come through.',
          arryn: 'The Vale has a mountain of its own and it has never done '
               + 'anything like this to anybody.',
          tyrell: 'The Reach sent men to stop this once. The Reach sent a great '
               + 'many men. It is a short story and it is not a good one.',
          lannister: 'Your own house made this. Fed it, armoured it, pointed it, '
               + 'and stopped asking questions about it a long while ago. It '
               + 'will not care whose colours you wear.',
          martell: 'Dorne has been waiting for this since a tourney in this city '
               + 'that nobody in Sunspear has ever agreed to stop talking about.',
          baratheon: 'Ours is the fury. Fury is a thing that runs out. This does '
               + 'not appear to.',
          targaryen: 'Your family had three dragons and this thing still ended '
               + 'up standing behind their chair. Some of the realm did not '
               + 'need conquering. Some of it needed burning.',
          greyjoy: 'The Iron Islands measure a man by what he can take. Nobody '
               + 'has ever worked out what this one could not.',
        }),
      },
    ],
  },

  // ====================================================== nothing left in the way ==
  throne: {
    name: 'The Chair',
    pages: [
      {
        sky: SKY.indoors, mark: MARK.none,
        title: 'It Falls',
        body: 'It goes down the way a building goes down: slowly, and then all '
            + 'at once, and the floor tells you about it through your boots. '
            + 'Then the hall is very quiet, and very long, and empty except for '
            + 'the chair at the end of it.',
      },
      {
        sky: SKY.indoors, mark: MARK.throne,
        title: 'The Last Hundred Paces',
        body: 'Nobody stops you. That is the strange part. You have spent a year '
            + 'being stopped and now there is a whole hall of nobody, and the '
            + 'only thing between you and the Iron Throne is the walk.',
      },
      {
        sky: SKY.indoors, mark: MARK.throne,
        title: 'Sitting Down',
        body: 'The barbs are exactly where the stories said. Aegon meant them. A '
            + 'king who is comfortable is a king who has stopped paying '
            + 'attention, he said, and then he welded a thousand swords into a '
            + 'seat to make sure nobody ever was.',
      },
      {
        sky: SKY.indoors, mark: MARK.crown,
        title: 'The Crown',
        body: 'It is heavier than it looks and it has been resized eleven times. '
            + 'Somebody has been keeping a small book of who wore it and for how '
            + 'long. Most of the entries are short.',
      },
    ],
  },

  // =============================================================== afterwards ==
  crowned: {
    name: 'What Holding It Costs',
    pages: [
      {
        sky: SKY.day, mark: MARK.crown,
        title: 'The Realm Hears',
        body: 'By morning it is in Oldtown. By the week\'s end it is in Braavos, '
            + 'and the Iron Bank has already worked out what you are worth and '
            + 'written it down in a ledger you will never be shown.',
        byHouse: byHouse({
          stark: 'The North does not cheer. The North sends one rider with one '
               + 'sentence: the North remembers, and it will hold you to that '
               + 'as hard as it ever held anyone.',
          tully: 'Riverrun rings its bells and then quietly sends a list. '
               + 'Family, duty, honour - and the family part has some names on '
               + 'it who would like positions.',
          arryn: 'The Vale sends congratulations, a very good horse, and no '
               + 'men. As high as honour, and honour is watching from up there '
               + 'to see what you do first.',
          tyrell: 'Highgarden sends grain, wine, roses and a bill, and the bill '
               + 'is phrased so beautifully that you almost do not notice it.',
          lannister: 'Casterly Rock sends nothing at all for eleven days, and '
               + 'then sends everything, which is how a Lannister tells you '
               + 'they have finished deciding.',
          martell: 'Sunspear sends a cask of the strong red and a note that '
               + 'reads: unbowed, unbent, unbroken - and still not yours. It '
               + 'is meant kindly. Mostly.',
          baratheon: 'Storm\'s End sends its banners and its fury and asks, '
               + 'immediately, who you would like it pointed at. That is the '
               + 'whole letter.',
          targaryen: 'The dragon is back on the chair and half the realm goes '
               + 'very still. The other half starts writing to the first half. '
               + 'You will hear about it within the month.',
          greyjoy: 'The Iron Fleet fires a salute, which is the first thing the '
               + 'ironborn have given anybody in living memory without being '
               + 'asked. Then they go back to sea, because we do not sow.',
        }),
      },
      {
        sky: SKY.day, mark: MARK.throne,
        title: 'The Small Council',
        body: 'Nine seats and a very long table. Everyone at it wants something '
            + 'and every one of those things is reasonable on its own. There is '
            + 'no combination of them that works, and they know it, and they '
            + 'have brought it to you anyway.',
      },
      {
        sky: SKY.snow, mark: MARK.wall,
        title: 'And the North',
        body: 'A raven from Castle Black, cold to the touch. Not a request for '
            + 'men. A count. The Watch has stopped asking for help and started '
            + 'writing down what is coming, which is a worse sign than the '
            + 'asking ever was.',
      },
      {
        sky: SKY.smoke, mark: MARK.crown,
        title: 'Thronebound',
        body: 'The chair does not let you lean back. That is the last thing '
            + 'Aegon built into it and the only part of it that everybody who '
            + 'has ever sat here agrees about. The realm is yours. Holding it '
            + 'is the rest of your life, and it starts now.',
      },
    ],
  },
};

export const TALE_ORDER = ['summons', 'gate', 'champion', 'throne', 'crowned'];
