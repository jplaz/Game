// Places you can buy.
//
// The game had exactly one piece of property in it — a holdfast you take off a
// squatter with an axe — and everything else you could own was a consequence
// of a title somebody else granted you. Nothing was for sale.
//
// These are. None of them asks what your house is, whether you have a name
// worth the word, or who you swore to; the only question anybody asks is
// whether the gold is on the table. A room over a pot-shop in Flea Bottom is
// nine hundred and takes anybody's coin. The orchard outside Sunspear is
// twenty-two thousand and takes anybody's coin too.
//
//   price    what the deed costs, in gold
//   rent     gold a thousand steps, paid when you next sleep there
//   map      the interior, defined in maps.js
//   broker   the line the seller opens with
//   deed     what they say when the money changes hands
//   rest     what sleeping there is like

export const PROPERTIES = {
  fleaRoom: {
    name: 'A Room Off the Flea-Channel',
    where: 'Flea Bottom, King\'s Landing',
    price: 900,
    rent: 0,
    map: 'propFleaRoom',
    at: { x: 4, y: 6, dir: 'down' },
    summary: 'One room over the pot-shop. It smells of the pot-shop.',
    broker: 'Deed-Broker: A room. Over the pot-shop. It smells of the pot-shop, '
          + 'and I will not pretend otherwise — but it is a door that locks, in a city '
          + 'where that is worth more than the room.',
    deed: 'Deed-Broker: Nine hundred, and the key is yours. Nobody asks a landlord '
        + 'in Flea Bottom what his father was called.',
    poor: 'Deed-Broker: Nine hundred. Come back when you have it — the room will '
        + 'still be here, and so will the smell.',
    owned: 'Deed-Broker: Your room is where you left it. Nothing in Flea Bottom '
         + 'is worth stealing twice.',
    rest: 'You sleep with the pot-shop grumbling under the boards, and wake up '
        + 'alive and indoors, which is two things more than most of this street manages.',
  },

  riverCottage: {
    name: 'The Cottage at the Crossroads',
    where: 'The Riverlands',
    price: 3500,
    rent: 40,
    map: 'propRiverCottage',
    at: { x: 5, y: 7, dir: 'down' },
    summary: 'A cottage, a hearth, and enough land behind it to keep a goat honest.',
    broker: 'Widow Heddle: My husband built it and my husband is dead in a field '
          + 'somewhere south, and I am going to my sister in Maidenpool. Three thousand '
          + 'five hundred and it is yours, hearth and all.',
    deed: 'Widow Heddle: Then it is yours. The chimney draws badly when the wind is '
        + 'in the east. Everything else about it is honest.',
    poor: 'Widow Heddle: Three thousand five hundred. I have waited this long; '
        + 'I can wait for you.',
    owned: 'Widow Heddle: Still standing, then. Mind the chimney when the wind turns.',
    rest: 'A hearth, a roof that does not leak, and nobody in the world who knows '
        + 'to look for you here. You sleep like the dead and wake up like the living.',
  },

  braavosCounting: {
    name: 'A Counting-House on the Purple Harbour',
    where: 'Braavos',
    price: 9000,
    rent: 180,
    map: 'propBraavosCounting',
    at: { x: 6, y: 8, dir: 'down' },
    summary: 'A shopfront on the water. It earns whether you are in it or not.',
    broker: 'Factor of the Iron Bank: A counting-house. Two floors, a strongroom, '
          + 'and a frontage on the Purple Harbour. The Bank does not care what you are. '
          + 'The Bank cares that the sum is correct.',
    deed: 'Factor of the Iron Bank: Nine thousand, entered and witnessed. '
        + 'Braavos was built by escaped slaves, ser. Nobody here will ask you for a pedigree.',
    poor: 'Factor of the Iron Bank: Nine thousand. The Iron Bank will have its due, '
        + 'and until it does there is nothing further to discuss.',
    owned: 'Factor of the Iron Bank: Your ledger is in order. It generally is, '
         + 'when somebody else keeps it.',
    rest: 'You sleep over your own strongroom, listening to the harbour move, '
        + 'and somebody downstairs is making you money while you do it.',
  },

  valeWatchtower: {
    name: 'The Broken Watchtower',
    where: 'The Vale',
    price: 15000,
    rent: 90,
    map: 'propValeWatchtower',
    at: { x: 6, y: 9, dir: 'down' },
    summary: 'A tower on a shoulder of the mountain. Half a roof, all of the view.',
    broker: 'Mountain Steward: Nobody has held that tower since the clans came down '
          + 'in my grandfather\'s time. The Arryns will sell it to anyone fool enough '
          + 'to want the mountain looking at them all night.',
    deed: 'Mountain Steward: Fifteen thousand and the Eyrie washes its hands of it. '
        + 'You will want the roof seen to before winter. You will want a great deal '
        + 'seen to before winter.',
    poor: 'Mountain Steward: Fifteen thousand. It has stood four hundred years '
        + 'without you. It will manage another season.',
    owned: 'Mountain Steward: Your tower is still up the mountain, doing what towers do.',
    rest: 'The wind comes off the Giant\'s Lance all night and finds every gap in '
        + 'the stone. You sleep badly, and you sleep in a tower that is yours.',
  },

  dorneOrchard: {
    name: 'The Orchard House',
    where: 'Outside Sunspear, Dorne',
    price: 22000,
    rent: 260,
    map: 'propDorneOrchard',
    at: { x: 7, y: 9, dir: 'down' },
    summary: 'Walled orchard, a well that has never failed, and shade you can sit in.',
    broker: 'Orchard-Keeper: Blood oranges, four hundred trees, and a well that '
          + 'has not failed in ninety years. My lady is selling because she is old '
          + 'and her sons are dead. She does not care who buys it. Neither do I.',
    deed: 'Orchard-Keeper: Twenty-two thousand. In Dorne we ask what a man can do, '
        + 'not what his grandfather was. Welcome to the orchard.',
    poor: 'Orchard-Keeper: Twenty-two thousand. The trees are not going anywhere '
        + 'and neither is my lady.',
    owned: 'Orchard-Keeper: The trees are well. The well is well. All is well.',
    rest: 'You sleep in the shade of four hundred blood oranges with the well '
        + 'ticking in the dark, and for one night nobody in the world wants anything from you.',
  },
};

export const PROPERTY_IDS = Object.keys(PROPERTIES);

export function property(id) {
  const found = PROPERTIES[id];
  if (!found) throw new Error(`Unknown property: ${id}`);
  return { id, ...found };
}
