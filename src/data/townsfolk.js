import { ROAMERS } from './duellists.js';

// Who stands in the rooms that were built from a template.
//
// Every maester's hall in the realm was the same three people: a "Maester", a
// "Steward" and a "Kennelmaster" who said, word for word in fifteen towns,
// "Anything you cannot carry, I will board." Every inn grew an upstairs with
// "A Lodger" and "A Chambermaid" in it and a cellar with "A Cellarman", every
// common house an upstairs with "A Girl of the House" and "A Quiet Guest" -
// fifteen apiece, most of them saying the same sentence - and every hold you
// could take had two "Hall Guards", a "Corridor Watch" and a "Cook" who had
// cooked for whoever held the hall for nineteen years in nine different
// countries. Walk three towns and you had met everybody the game had.
//
// These are the same people, doing the same jobs, standing on the same tiles -
// so nothing about how a town works moves - with a name each and a thing of
// their own to say. Some of what they say is the story: the grey wagons, the
// ravens that stopped coming, the corn that is not for sale.
//
//   map id -> { the template name -> [[their name, what they say], ...] }
//
// A list, in the order the template put them down, because some rooms have
// two of one kind. A line left out keeps the one the template wrote, with
// the old name at its head swapped for the new one.

export const TOWNSFOLK = {
  // ------------------------------------------------------ the maesters' halls
  maesterHallWinterfell: {
    Maester: [['Acolyte Tomard', 'Maester Luwin keeps the rookery and I keep the fire. Sit them by it; the North is hard on anything that was not born here.']],
    Steward: [['Vayon Poole', 'Vayon Poole: Winterfell has stores for eight winters, and I count them twice a week. What is on the shelf is for sale. What is under it is for the siege.']],
    Kennelmaster: [['Farlen', 'Farlen: I have kept hounds for this house since before the young lords could walk. Leave me what you cannot carry and it will eat before mine do.']],
  },
  maesterHallCastleBlack: {
    Maester: [['Clydas', 'Maester Aemon cannot see the birds any more, so I tell him what they look like. Lately I tell him none came. Let me see to yours.']],
    Steward: [['Bowen Marsh', 'Bowen Marsh: Everything on these shelves was begged for. The Watch asks the south for bread every month, and the south sends boys and advice.']],
    Kennelmaster: [['Chett', 'Chett: Hounds, horses, and whatever you drag in off the ice. Board it here. I would rather mind animals than men, and the Wall has noticed.']],
  },
  maesterHallEyrie: {
    Maester: [['Acolyte Harlan', 'Six hundred steps, and I am the one they send down them with the salves. Sit. The climb is harder on them than on you.']],
    Steward: [['Steward Osric', 'Steward Osric: Everything up here came up the mountain on a mule, and the price says so. Do not argue with the price. Argue with the mountain.']],
    Kennelmaster: [['Mord', 'Mord: Sky cells for men, pens for beasts, and I keep both. The beasts complain less. Leave me what you cannot carry.']],
  },
  maesterHallHighgarden: {
    Maester: [['Acolyte Rolly', 'The Reach feeds the realm, and I feed the Reach\'s animals. Sit them down; there is honey in the salve.']],
    Steward: [['Steward Tomas', 'Steward Tomas: The granary tallies are short again. Not by much. Never by much. The wagons that take the difference do not stop to be counted.']],
    Kennelmaster: [['Old Brambles', 'Old Brambles: Hawks, hounds, and whatever you have brought me. Board it here, and it will eat better than the hawks, which is saying something in Highgarden.']],
  },
  maesterHallSunspear: {
    Maester: [['Acolyte Kedry', 'Dornish sun burns anything raised north of the mountains. Sit them in the shade and let me work.']],
    Steward: [['Ricasso', 'Ricasso: I have been seneschal of Sunspear forty years and blind for ten of them. Tell me what you want and I will tell you what it costs. I am never wrong about the second.']],
    Kennelmaster: [['Dagos', 'Dagos: Sand dogs, sand steeds, and one snake nobody will claim. Leave yours. They will be fed, and they will be cool, which in Dorne is the harder promise.']],
  },
  maesterHallStormsEnd: {
    Maester: [['Acolyte Denys', 'Storm-country beasts are hardy. Yours look as if they have been walked through three storms. Sit.']],
    Steward: [['Steward Brus', 'Steward Brus: The walls are forty feet thick and the storehouses are not. Buy what you need. The cellars are for the siege we all pretend is not coming.']],
    Kennelmaster: [['Bess', 'Bess: The storm puts the hounds off their food and the horses off their heads. Leave yours with me. I know what the sky will do before it does.']],
  },
  maesterHallDragonstone: {
    Maester: [['Maester Pylos', 'Maester Cressen says the island is too hot and the stone too black, and he is not wrong. Sit your creatures down; the floor is warm.']],
    Steward: [['Steward Alester', 'Steward Alester: Obsidian, salt fish and sulphur. Dragonstone sends out three things and brings in everything else, so everything else is dear.']],
    Kennelmaster: [['Ro', 'Ro: The old pits under the mountain are the warmest kennels in the realm. Leave yours. Nothing has eaten anything down there in a hundred and fifty years.']],
  },
  maesterHallMoat: {
    Maester: [['Wet Nan', 'No maester would live in this bog, so you have me. Moss for the wounds, mud for the fever, and a fire that is at least mostly dry.']],
    Steward: [['Gils', 'Gils: The last garrison left the stores behind and the frogs have had half. What is left is dry, and dry is dear in the Neck.']],
    Kennelmaster: [['Wyl the Frogcatcher', 'Wyl: Lizard-lions, bog cats, and once a thing I did not have a name for. Leave yours. The Neck keeps what it takes, but I give them back.']],
  },
  maesterHallRiverrun: {
    Maester: [['Acolyte Mollos', 'Rivers run, and so do errands. Maester Vyman is writing to somebody again. Sit down and let me see to them.']],
    Steward: [['Utherydes Wayn', 'Utherydes Wayn: Riverrun has stood through every war in the Riverlands, which is all of them. These are the prices of a castle that expects another.']],
    Kennelmaster: [['Delp', 'Delp: Board what you cannot carry. The trout-dogs of Riverrun swim better than they fetch, so do not expect yours back with a stick.']],
  },
  maesterHallLannisport: {
    Maester: [['Acolyte Lewys', 'Gold pays for good care at the Rock. You are not at the Rock, so it is free. Sit.']],
    Steward: [['Clerk Humfrey', 'Clerk Humfrey: Everything in Lannisport is weighed twice, once by the buyer and once by the Rock. I sell it once. That is the bargain.']],
    Kennelmaster: [['Wat', 'Wat: Lions eat first here, as you would expect, and then everything else. Board yours with me and I will see it is not last.']],
  },
  maesterHallPyke: {
    Maester: [['Maester Wendamyr']],
    Steward: [['Reeve Harl', 'Reeve Harl: We do not sow, so everything on this shelf was taken off somebody. The price includes their trouble.']],
    Kennelmaster: [['Old Sawane', 'Old Sawane: I keep what the raiders bring home alive, which is not much, and feed it on fish, which is everything. Leave yours.']],
  },
  maesterHallDreadfort: {
    Maester: [['Maester Uthor']],
    Steward: [['Steward Rhodry', 'Steward Rhodry: Lord Roose likes a quiet house and an honest ledger. The ledger is honest. Buy something, and keep your voice down.']],
    Kennelmaster: [['Sour Alyn', 'Sour Alyn: The kennel girls are fed, and they are not for you. Yours I will board. Keep your hands where the dogs can see them.']],
  },
  maesterHallKL: {
    Maester: [['Maester Frenken', 'The Grand Maester is busy. He is always busy, his door is always shut, and lately there is a man in grey sitting outside it. I am not busy. Let me see them.']],
    Steward: [['Pate the Clerk', 'Pate: The crown owes the Iron Bank, the Faith and half the city. I owe nobody, so my prices are the only honest ones on the hill.']],
    Kennelmaster: [['Rolf', 'Rolf: The king\'s hounds, the queen\'s hounds, and a pen of whatever the lords leave behind when they go home. Board yours. I know which is which.']],
  },
  maesterHallEastwatch: {
    Maester: [['Acolyte Rodrik', 'You are cold all the way through. Maester Harmune is up on the wall again, writing. He writes every day now. Sit by the fire.']],
    Steward: [['Steward Ulmer', 'Steward Ulmer: Three ships due this month and none of them come. What is on the shelf is what we have, and when it is gone we eat the shelf.']],
    Kennelmaster: [['Garth', 'Garth: Sled dogs, mostly, and a white bear cub the rangers will not stop feeding. Leave yours, and keep it out of the bear\'s way.']],
  },
  maesterHallTwins: {
    Maester: [['Maester Brenett', 'Nobody crosses that bridge without something aching. Sit down. Lord Walder will charge you for the chair, but I will not.']],
    Steward: [['Lame Lothar', 'Lame Lothar: The Freys have a price for everything, and I am the one who writes it down. Do not look at the number. Pay it.']],
    Kennelmaster: [['Petyr Frey', 'Petyr Frey: I am a Frey, so I am in charge of the dogs. There are ninety of us and the dogs are the best job. Leave yours.']],
  },

  // -------------------------------------------------- over the taprooms, and under
  winterfellInnRooms: {
    'A Lodger': [['Hodd the Drover', 'Hodd: I brought forty head down from the Last Hearth and sold thirty-nine. Winter is coming, they say. It has been coming my whole life, and this year I believe them.']],
    'A Chambermaid': [['Mylenda', 'Mylenda: Six rooms and six fires, and I lay every one before light. You would not believe what the southern guests leave in the grate.']],
  },
  winterfellInnCellar: {
    'A Cellarman': [['Tym', 'Tym: The good barrels are the ones with no mark on them. The best has a wolf scratched on the bottom, and it is not for sale at any price.']],
  },
  pykeInnRooms: {
    'A Lodger': [['Emrik', 'Emrik: I came in off a longship with two others out of forty. They are drinking. I am writing it down, so that somebody knows.']],
    'A Chambermaid': [['Gylla', 'Gylla: I scrub the salt out of the blankets every morning and the sea puts it back every night. Nobody on Pyke has ever beaten the sea.']],
  },
  pykeInnCellar: {
    'A Cellarman': [['Dagon', 'Dagon: Everything down here was taken at the iron price. That keg was taken from a man who took it from a man. I would drink it slowly.']],
  },
  pentosInnRooms: {
    'A Lodger': [['Tregar', 'Tregar: I came to Pentos to sell spice, and I have spent a month buying it back. The magisters have a way of making every bargain your own idea.']],
    'A Chambermaid': [['Seri', 'Seri: The magisters\' guests leave coins on the pillow here, always slightly too many. That is how you know you have been listened to.']],
  },
  pentosInnCellar: {
    'A Cellarman': [['Old Belicho', 'Belicho: Cheese at the front, and behind it the reason for the cheese. Do not ask me the reason. I was hired for my nose, not my mouth.']],
  },
  braavosInnRooms: {
    'A Lodger': [['Moredo', 'Moredo: I am a bravo between employments, which is a man with a sword and a room he cannot pay for. Fortunately the Ship does not ask.']],
    'A Chambermaid': [['Daena', 'Daena: The mummers sleep up here and rehearse in the halls, so I have heard every play in Braavos forty times. Most of them end with a poisoning.']],
  },
  braavosInnCellar: {
    'A Cellarman': [['Bartos', 'Bartos: The Iron Bank owns the building, the barrels and the boat. I own the key, which makes me the richest man in Braavos for an hour a day.']],
  },
  meereenInnRooms: {
    'A Lodger': [['Grazdan', 'Grazdan: My grandfather owned this whole pyramid. Now I rent the corner room of it. The queen says that is justice, and she is probably right, and the room is still small.']],
    'A Chambermaid': [['Qezza', 'Qezza: I was a slave in this building. Now I make the beds in it and I am paid. It is not the same work, whatever the old masters say at dinner.']],
  },
  meereenInnCellar: {
    'A Cellarman': [['Morghaz', 'Morghaz: Old Ghis buried its rich with their wine, and somebody has been unburying them. I only sell what I am given. I do not ask which tomb.']],
  },
  sunspearInnRooms: {
    'A Lodger': [['Gerold', 'Gerold: I came to Sunspear for the water gardens and stayed for the shade. Three months. My ship left without me and I have not once been sorry.']],
    'A Chambermaid': [['Jayne', 'Jayne: In Dorne you make the bed before the sun is up, or you make it in an oven. I have not been late once in eleven years.']],
  },
  sunspearInnCellar: {
    'A Cellarman': [['Ferrego', 'Ferrego: Cool down here. That is the whole of why Dorne digs. The strong red at the back is older than the last three Martell quarrels with the Tyrells.']],
  },
  theEyrieInnRooms: {
    'A Lodger': [['Hugh of the Vale', 'Hugh: I came up to petition the Lord of the Vale six weeks ago. The answer, I am told, is coming down the mountain on a mule.']],
    'A Chambermaid': [['Alys', 'Alys: The guests up here are knights, and knights sleep in their boots. I have given up on the sheets and started praying for the floors.']],
  },
  theEyrieInnCellar: {
    'A Cellarman': [['Oswell', 'Oswell: Everything down here came up six hundred steps on somebody\'s back, so we charge by the step. That cask is two hundred and eight.']],
  },
  volantisInnRooms: {
    'A Lodger': [['Qavo', 'Qavo: I bet on which of the elephants would win the election, and I bet wrong. The room is paid until the next one. I am hoping to be luckier with the tigers.']],
    'A Chambermaid': [['Tala', 'Tala: The red priests pray under the window all night. I do not mind. The fire keeps the room warm, and the prayers keep the guests from coming back drunk.']],
  },
  volantisInnCellar: {
    'A Cellarman': [['Varro', 'Varro: The fire wants feeding, and this is what it is fed: oil, pitch, and a very good vintage. The priests take the first two. I take the third.']],
  },
  dreadfortInnRooms: {
    'A Lodger': [['Ralf the Furrier', 'Ralf: I came to sell furs to Lord Bolton\'s steward. He bought them all, and then asked me very politely how long I meant to stay. I leave tomorrow.']],
    'A Chambermaid': [['Holly', 'Holly: I keep my head down and the rooms clean. In the Dreadfort that is not two jobs. It is one.']],
  },
  dreadfortInnCellar: {
    'A Cellarman': [['Old Skinner', 'Skinner: Lord Roose keeps his accounts down here, and his wine, and I do not go past the third arch. Nobody has ever told me why. Nobody has needed to.']],
  },
  stormsEndInnRooms: {
    'A Lodger': [['Ormund', 'Ormund: The wind took the roof off my house in the spring and the sea took the house in the summer. I am told I am lucky they left me the roof.']],
    'A Chambermaid': [['Bella', 'Bella: My mother always said my father was a great lord. Every girl on this coast says that. Mine has a stag on the inn sign to prove it.']],
  },
  stormsEndInnCellar: {
    'A Cellarman': [['Wendel', 'Wendel: Four hundred years of storms and this cellar has never been wet. The castle says magic. I say men who were very frightened of the sea.']],
  },
  eastwatchInnRooms: {
    'A Lodger': [['Iggo of Ib', 'Iggo: I am a whaler out of Ib, and the whales have gone south early, and so have the seals, and so has everything else with any sense.']],
    'A Chambermaid': [['Gerta', 'Gerta: I keep a fire in every room night and day, and every morning there is frost on the inside of the shutters. It was not like this last year.']],
  },
  eastwatchInnCellar: {
    'A Cellarman': [['Hobb', 'Hobb: Whatever the ships bring back from up the coast comes down here first. Lately they bring back less than they took.']],
  },
  highgardenInnRooms: {
    'A Lodger': [['Mathis of Horn Hill', 'Mathis: I was sent to buy seed corn for Horn Hill. There is corn in the Reach. There is simply none for sale, at any price, to anybody.']],
    'A Chambermaid': [['Rosamund', 'Rosamund: Fresh roses in every room, every morning. The Tyrells insist. Half the guests sneeze and the other half are too polite to.']],
  },
  highgardenInnCellar: {
    'A Cellarman': [['Lothor', 'Lothor: Three hundred casks of Arbor gold, and one of vinegar a lord once swore was the best wine he ever drank. I keep that one for lords.']],
  },
  crossroadsInnRooms: {
    'A Lodger': [['Willem the Carter', 'Willem: I carry for the gold road. Last month it was forty sacks of seed corn up to a dry working in the hills, paid in silver not to ask why. I am asking you instead.']],
    'A Chambermaid': [['Lota', 'Lota: Four armies have slept in these beds and not one of them made one. Carters are worse. They drink, they talk, and they leave the road on the sheets.']],
  },
  crossroadsInnCellar: {
    'A Cellarman': [['Old Robb', 'Old Robb: Mind the third step. It has had three people off it this year, and one of them was a knight, and the knight is the only one who complained.']],
  },
  lannisportInnRooms: {
    'A Lodger': [['Symond the Factor', 'Symond: I have waited eight days for gold from the Rock that was due in two. The Rock is never late. The Rock is late.']],
    'A Chambermaid': [['Willa', 'Willa: Lannister men tip in silver and complain in gold. I would rather they did it the other way round, but nobody asks the girl with the sheets.']],
  },
  lannisportInnCellar: {
    'A Cellarman': [['Bertram', 'Bertram: The Lannisters own the wine, the building and the harbour. They do not own the cellarman, and they are very welcome to try.']],
  },
  dragonstoneInnRooms: {
    'A Lodger': [['Silas of Driftmark', 'Silas: I came over from Driftmark to see the dragon skulls and was told they went to King\'s Landing a hundred years ago. I stayed for the warm floors.']],
    'A Chambermaid': [['Nessa', 'Nessa: The stone is warm under the beds. The guests love it until the third night, when they start dreaming about fire. Everybody dreams about fire here.']],
  },
  dragonstoneInnCellar: {
    'A Cellarman': [['Ormond', 'Ormond: Obsidian, all the way down, and the mountain keeps making more. Hold a piece to the lamp and tell me it is not warm. I dare you.']],
  },

  // ------------------------------------------ over the common houses
  winterfellHouseRooms: {
    'A Girl of the House': [['Sabine', 'Sabine: The men up here talk about the cold the way men in the south talk about their wives. Lately they talk about it as if they are frightened of it.']],
    'A Quiet Guest': [['Grey-Cloaked Guest', 'Grey-Cloaked Guest: You have not seen me. I have not seen you. I am told you ask a great many questions about ravens. I would stop.']],
  },
  pykeHouseRooms: {
    'A Girl of the House': [['Gwin', 'Gwin: Ironborn do not pay for what they can take, so the ones who come up here are the ones who cannot take anything. They tell the saddest stories.']],
    'A Quiet Guest': [['Silent Merchant', 'Silent Merchant: I buy what the raiders bring home and sell it back to the people they took it from. Neither side likes me. Both sides pay.']],
  },
  pentosHouseRooms: {
    'A Girl of the House': [['Lyssa of Lys', 'Lyssa: Every magister in Pentos has a secret, and every secret in Pentos sleeps here at least once a month. I do not sell them. I only keep them warm.']],
    'A Quiet Guest': [['Masked Magister', 'Masked Magister: A mask in Pentos means I am not here. You are not here either. We have never had this conversation, which is why it has gone so well.']],
  },
  braavosHouseRooms: {
    'A Girl of the House': [['Bethany', 'Bethany: Sailors tell you where they have been. This month every one of them has come back from the north with the same story about the ice.']],
    'A Quiet Guest': [['Banker on Holiday', 'Banker: The Iron Bank does not take holidays, so I am, strictly speaking, still at work. Your debts are in good order. For now.']],
  },
  meereenHouseRooms: {
    'A Girl of the House': [['Zaruna', 'Zaruna: The pit fighters come up here when they win, and their friends come up when they do not. The friends tip better.']],
    'A Quiet Guest': [['Yunkish Envoy', 'Yunkish Envoy: I am here to negotiate a peace. Very slowly. Every day it is not signed, my masters\' ships are a day closer.']],
  },
  sunspearHouseRooms: {
    'A Girl of the House': [['Fenna', 'Fenna: In Dorne nobody pretends. Men come up here to be listened to, and women too, and nobody writes home to their mothers about it.']],
    'A Quiet Guest': [['Veiled Lady', 'Veiled Lady: I am a guest of the prince, which means a hostage who is allowed to leave. I simply have not decided where to go.']],
  },
  volantisHouseRooms: {
    'A Girl of the House': [['The Merling Queen', 'Merling Queen: The fishscales, the pearls, the shell to sit on, and men pay to be told they are kings of the fish. Everybody in Volantis is pretending to be somebody.']],
    'A Quiet Guest': [['Off-Duty Tiger', 'Off-Duty Tiger: I am off duty, which in Volantis means a cloak without stripes and the hope that nobody knows me. You do not know me.']],
  },
  riverrunHouseRooms: {
    'A Girl of the House': [['Maudie', 'Maudie: Soldiers, fishermen, and the odd lord who lost his way to the castle. After two cups they all say the same: the river is lower than it has ever been.']],
    'A Quiet Guest': [['Frey Cousin', 'Frey Cousin: I am the ninety-first Frey, so nobody notices when I go missing. I notice things instead. Riverrun is full of men in grey who are nobody\'s men.']],
  },
  theEyrieHouseRooms: {
    'A Girl of the House': [['Bryony', 'Bryony: The knights come up the mountain for honour and come in here for the rest. Honour does not keep you warm six hundred steps up.']],
    'A Quiet Guest': [['Clan Hostage', 'Clan Hostage: The lords keep me here so my father will not burn their villages. My father has other sons. The lords have not worked that out.']],
  },
  dreadfortHouseRooms: {
    'A Girl of the House': [['Hawthorn', 'Hawthorn: In the Dreadfort nobody talks, so they pay me to listen to nothing. It is the easiest money in the North and the worst sleep.']],
    'A Quiet Guest': [['Bolton Clerk', 'Bolton Clerk: Lord Roose is interested in everybody. This month he is interested in who has been buying all the corn north of the Neck, and so am I.']],
  },
  stormsEndHouseRooms: {
    'A Girl of the House': [['Lorrie', 'Lorrie: When a storm comes in nobody can leave, so every storm is a festival up here. We pray for bad weather. Nobody else in the Stormlands does.']],
    'A Quiet Guest': [['Salvager', 'Salvager: I buy what the bay throws up. This year it has thrown up grain sacks, still sealed and still dry, and nobody has claimed a single one.']],
  },
  eastwatchHouseRooms: {
    'A Girl of the House': [['Hilde', 'Hilde: The Watch is sworn to no women, so the Watch comes up the back stairs. Lately they come up to sit by the fire and say nothing at all.']],
    'A Quiet Guest': [['Braavosi Captain', 'Braavosi Captain: I bring grain north for the Watch. This year I unloaded it at a warehouse in the Gift with grey shutters and was paid twice what was owed. I am not going back.']],
  },
  highgardenHouseRooms: {
    'A Girl of the House': [['Rosabel', 'Rosabel: Everybody in the Reach is somebody\'s cousin, so nobody up here uses their real name. I have been Lady Margaery four times this week.']],
    'A Quiet Guest': [['Citadel Novice', 'Citadel Novice: I am on my way to Oldtown to forge my first link. I have been on my way a year. Some links, I have learned, are not on the list.']],
  },
  lannisportHouseRooms: {
    'A Girl of the House': [['Marei', 'Marei: Lannister gold is the best gold in the realm, and Lannister men are the worst at knowing what to do with it. I help.']],
    'A Quiet Guest': [['Knight of the Crag', 'Knight of the Crag: I am waiting for my lord to die so that I can inherit his debts. It is taking longer than I was promised.']],
  },
  dragonstoneHouseRooms: {
    'A Girl of the House': [['Cerenna', 'Cerenna: The red priests say the fire shows them the future. I have seen the future too. It is mostly men from Driftmark asking if I have seen a dragon.']],
    'A Quiet Guest': [['Glass-Candle Man', 'Glass-Candle Man: I carry a candle of dragonglass that has not lit in a hundred years. Last week it lit. I came to find out why, and nobody here will say.']],
  },

  // ---------------------------------------------------- the taprooms, by name
  winterfellInn: { Drinker: [['Harwood']] },
  lannisportInn: { Drinker: [['Tomm']] },
  theEyrieInn: { Drinker: [['Lucas']] },
  highgardenInn: { Drinker: [['Merrit']] },
  sunspearInn: { Drinker: [['Qoren']] },
  stormsEndInn: { Drinker: [['Edric']] },
  dragonstoneInn: { Drinker: [['Bryen']] },
  braavosInn: { Drinker: [['Sloey']] },
  pentosInn: { Drinker: [['Ordello']] },
  volantisInn: { Drinker: [['Doniphos']] },
  meereenInn: { Drinker: [['Ghael']] },
  pykeInn: { Drinker: [['Dunstan']] },
  dreadfortInn: { Drinker: [['Hake']] },
  eastwatchInn: { Drinker: [['Old Tattersalt']] },
  crossroadsInn: { Drinker: [['Jonnel']] },

  // ---------------------------------------------- the hideouts under the towns
  theEyrieCellar: { Cellarman: [['Turnkey Beck']] },
  highgardenCellar: { Cellarman: [['Vintner Olyvar']] },
  sunspearCellar: { Cellarman: [['Digger Sarro']] },
  stormsEndCellar: { Cellarman: [['Old Dickon']] },
  dragonstoneCellar: { Cellarman: [['Glassman Pyl']] },
  braavosCellar: { Cellarman: [['Key-Keeper Nollo']] },
  pentosCellar: { Cellarman: [['Old Cheeseman']] },
  volantisCellar: { Cellarman: [['Temple Porter']] },
  meereenCellar: { Cellarman: [['Grave-Keeper Zhoq']] },
  pykeCellar: { Cellarman: [['Bilge Harrag']] },
  dreadfortCellar: { Cellarman: [['Accounts-Man Belis']] },
  eastwatchCellar: { Cellarman: [['Icehouse Tom', 'Icehouse Tom: Whatever they bring back from up the coast comes down here first. Lately it is less, and colder, and some of it moves.']] },

  // ------------------------------------------------ the holds you can take
  stoneCrowCave: {
    'Hall Guard': [['Timett\'s Man'], ['Shagga\'s Man']],
    'Corridor Watch': [['Cave Watch']],
    Cook: [['Old Gunthor', 'Old Gunthor: Take the larder. It is goat, mostly, and the goat\'s opinions. I have cooked for three chieftains in this cave and outlived two of them.']],
  },
  seaDragonVault: {
    'Hall Guard': [['Fire Warden'], ['Ember Warden']],
    'Corridor Watch': [['Vault Watch']],
    Cook: [['Ash-Cook Morra', 'Morra: The red priests eat what fire has touched and nothing else, so I burn everything, and they thank me. Take the larder. It is well done.']],
  },
  flayedHall: {
    'Hall Guard': [['Bolton Guard'], ['Flayed Guard']],
    'Corridor Watch': [['Kennel Watch']],
    Cook: [['Grisel', 'Grisel: I cook for the kennels and the kennelmen, and I do not ask which is which at supper. Take what you like.']],
  },
  sealordPalace: {
    'Hall Guard': [['Sealord\'s Guard'], ['Palace Bravo']],
    'Corridor Watch': [['Stair Watch']],
    Cook: [['Umma', 'Umma: The Sealord eats eels, and his guests eat what the Sealord does not. Take the larder. The eels are spoken for.']],
  },
  cheesemongerCellar: {
    'Hall Guard': [['Illyrio\'s Man'], ['Cellar Bravo']],
    'Corridor Watch': [['Door Watch']],
    Cook: [['Pelio', 'Pelio: The magister eats seven meals a day and I cook eight, in case. Take the eighth. He will not notice, and if he does he will blame the cheese.']],
  },
  elephantCourt: {
    'Hall Guard': [['Elephant Guard'], ['Court Guard']],
    'Corridor Watch': [['Court Watch']],
    Cook: [['Haleen', 'Haleen: The old blood eat off gold plates and never once ask who washed them. Take the larder. The plates stay.']],
  },
  pitMasterRooms: {
    'Hall Guard': [['Brazen Beast'], ['Pit Guard']],
    'Corridor Watch': [['Pit Watch']],
    Cook: [['Zhak', 'Zhak: I fed fighters before the pits opened and I will feed them after they close. A man about to die eats very well. Take what you need.']],
  },
  pavilionOfOranges: {
    'Hall Guard': [['Orange Guard'], ['Spear Guard']],
    'Corridor Watch': [['Garden Watch']],
    Cook: [['Daena of the Gardens', 'Daena: Blood oranges, snake, and peppers that make a Northman weep. Take the larder. Mind the peppers.']],
  },
  wreckersHall: {
    'Hall Guard': [['Wrecker'], ['Wrecker\'s Mate']],
    'Corridor Watch': [['Lamp Watch']],
    Cook: [['Ursa', 'Ursa: Everything in this larder came off a ship that did not make it into the bay. Take what you like. The sailors are not coming back for it.']],
  },
};

/**
 * Names the template people on every map the table covers. Called once, by
 * the map file, after every room has been built.
 */
export function nameTheTownsfolk(maps) {
  let named = 0;
  for (const [mapId, roles] of Object.entries(TOWNSFOLK)) {
    const map = maps[mapId];
    if (!map) throw new Error(`the townsfolk table names people on ${mapId}, which is not a map`);
    for (const [was, people] of Object.entries(roles)) {
      const standing = (map.npcs ?? []).filter((n) => n.name === was);
      if (standing.length !== people.length) {
        throw new Error(`${mapId} has ${standing.length} "${was}", and the table names ${people.length}`);
      }
      standing.forEach((npc, i) => {
        const [name, line] = people[i];
        const said = line ?? npc.data?.line;
        npc.name = name;
        if (said) {
          npc.data = { ...(npc.data ?? {}),
            line: said.startsWith(`${was}:`) ? `${name}:${said.slice(was.length + 1)}` : said };
        }
        named++;
      });
    }
  }
  return named;
}

// ------------------------------------------------------ the people who fight
//
// A hundred and fifty people in this world fight you as a kind of person - a
// sellsword, a man-at-arms, a clansman - rather than as somebody with a name in
// the duel tables, and none of them had a word of their own. The browser gave
// all forty-six sellswords one opening line between them; the cartridge gave
// every one of the hundred and fifty "They have nothing to say to you", and
// then drew on you. Areo Hotah, Ser Loras, the Blackfish and Melisandre among
// them. And thirty more borrowed a named fighter outright - twenty-four inn
// and cellar toughs across the world were all Bronn, word for word, and when
// Bronn died on the Roseroad every one of them died with him.
//
// So each says something of their own, in the voice of where they stand, and
// the borrowers are the kind of person they look like.


/* What a fighter says first, by where they are. Within one room nobody says
   the same thing as the person beside them. */
const VOICE_GROUPS = [
  { maps: ['theGift', 'castleBlackHall', 'eastwatchKeep', 'eastwatchCellar', 'crastersHall', 'eastwatchInn'],
    kinds: ['deserter'],
    lines: [
      'I said the words. Nobody told me the words would still hold when the dead got up and walked.',
      'Every man on the Wall is a thief or a bastard or worse. I am one of the worse ones. Draw.',
      'The Lord Commander says hold the gate. The gate is behind me, and you are in front of it.',
      'My watch has not ended. It has only got very much longer.',
      'No bread from the south since the harvest and no answer to a single raven. Forgive me if I am short with you.',
    ] },
  { maps: ['stoneCrowHold', 'stoneCrowCave'],
    lines: [
      'The valley lords took our fathers\' land and left us their gates to look at. Now we look at you.',
      'A halfman once gave the clans axes and a promise. We kept the axes.',
      'You walk the high road as if it were yours. Nothing up here is yours.',
      'The Burned Men burn a hand to show they fear no fire. What have you ever burned?',
      'A stranger in the mountains is meat or a guest, and you have not brought salt.',
      'The Moon Brothers pray to the moon. The moon has never once answered for what we did.',
      'Every knight who came up this pass left something behind. Mostly himself.',
    ] },
  { maps: ['theEyrie', 'bloodyGate', 'eyrieKeep', 'theEyrieInn', 'riverrunForge', 'highgardenKeep'],
    kinds: ['hedgeKnight'],
    lines: [
      'As high as honour. The steps are the easy part.',
      'A knight with no lord still has a sword and a code. Draw.',
      'I have ridden in eleven tourneys and won none of them. I am due.',
      'The Vale has not bled in a war for three hundred years. It keeps its swords sharp anyway.',
      'I sleep under hedges and I fight in the open. It keeps life simple.',
    ] },
  { maps: ['wreckersHold', 'wreckersHall', 'stormlands', 'wreckersCave'],
    lines: [
      'The bay puts things on the beach and we take them. You are on the beach.',
      'Lamps on the headland in a storm, and the ships think it is the harbour. It is us.',
      'Everything on this shore came off a ship. You look as if you came off one too.',
      'Lord Stannis hangs a wrecker a week. He has not caught me, and neither will you.',
      'Sealed corn came up the beach this spring, and men in grey came for it by night. Nobody on this coast saw a thing. Draw.',
      'A drowned man keeps his purse and loses his arguments. You still have both.',
      'The storm brought you, and the storm can take you back out.',
    ] },
  { maps: ['kennelHold', 'flayedHall', 'weepingWater', 'kingsroadNorth', 'dreadfortKeep', 'dreadfortInn'],
    lines: [
      'Lord Roose likes a quiet house. You are making noise in it.',
      'The girls have not been fed today. That is not an accident.',
      'Our blades are sharp. Ask anybody who has been on the wrong end of the flaying knife. Nobody can.',
      'A peaceful land, a quiet people. We keep it that way.',
      'The pink cloaks are for weddings. The red underneath is for everything else.',
      'The Boltons have held the Dreadfort for eight thousand years by never once raising their voice.',
      'Our sigil is a flayed man. Think about why for as long as you like. We have time.',
      'Lord Ramsay hunts when he is bored. He has been bored all week.',
    ] },
  { maps: ['braavos', 'sealordHold', 'sealordPalace', 'braavosInn', 'braavosCellar'],
    lines: [
      'My blade is Braavosi: thin, fast, and paid for. Show me yours.',
      'In Braavos we duel over the colour of a sleeve. Yours is an insult.',
      'The Sealord pays me to stand on this stair and to be the reason nobody climbs it.',
      'What do we say to the god of death? Not today. Say it with me, and then draw.',
      'A water dancer does not fight the sword. He fights the man, and you, I think, will be easy.',
      'The Titan of Braavos has bronze fists and a stone heart. I only have the second.',
      'Everybody in Braavos owes the Iron Bank. I collect in person.',
      'Quick is worth more than big in a narrow street, and every street here is narrow.',
    ] },
  { maps: ['fightingPits', 'pitMasterRooms', 'meereen', 'meereenInn', 'meereenCellar'],
    lines: [
      'The queen closed the pits and then opened them again. She learned what I learned: people want blood.',
      'I have fought forty men on this sand. I remember eleven of them.',
      'In the pits, a man who talks before he fights wants to be remembered. So remember me.',
      'The Harpy\'s sons wear masks. I do not need one. Nobody who sees my face lives to describe it.',
      'Freedman, slave or lord, on the sand everybody is the same weight.',
      'The crowd wants a death before the heat of the day. Mine or yours, they are not particular.',
      'I was bought for my arms and sold for my scars. Come and add one.',
      'Down here the gods are the pitmasters, and the pitmasters are watching.',
    ] },
  { maps: ['blackWallHold', 'elephantCourt', 'volantisInn', 'volantisCellar'],
    lines: [
      'The Black Wall keeps out everybody without old blood. I cannot see a drop of it in you.',
      'Tigers or elephants, the city votes, and the Triarchs pay us either way.',
      'I have not been off duty in eleven years. You picked a bad day to find out why.',
      'The old blood do not dirty their hands. That is what my hands are for.',
      'A tiger does not ask the elephant for leave. Neither do I.',
      'Volantis has five slaves for every free man, and the free men pay me to keep it that way.',
    ] },
  { maps: ['cheesemongerHold', 'cheesemongerCellar', 'pentosInn', 'pentosCellar'],
    lines: [
      'The magister pays well and asks one thing: nobody goes down those stairs. Nobody.',
      'In Pentos the cheese is soft and the knives are not.',
      'I am a hired blade, and you are a stranger in my employer\'s garden. The sums are simple.',
      'The magister has friends across the sea, and the sea has a long memory. Walk away.',
      'Magister Illyrio buys men the way he buys cheese: by weight, and to keep. I am very heavy.',
      'The Pentoshi hire other men to do their dying. I am the other men. You are about to meet the dying.',
      'There is a cellar under this house that is bigger than the house. You will not be seeing it.',
    ] },
  { maps: ['harrenhal', 'harrenhalHall'],
    lines: [
      'The Brave Companions. We are neither, but it looks well on a banner.',
      'Harrenhal has a curse on it, and we are the curse. Your purse or your sword.',
      'The Goat pays in gold and fingers, and I have plenty of both.',
      'Every lord who ever held Harrenhal died badly. We are only holding it for the next one.',
    ] },
  { maps: ['hardhome'], plain: true,
    lines: [
      'It does not speak. It turns its head towards you with the whole slow patience of a thing that has nowhere else to be.',
      'Its mouth opens and no sound comes out of it. The cold does.',
      'It was a man once. It still has a man\'s hands, and it reaches for you with them.',
      'It was a woman once, and the wind moves her hair, and nothing else about her moves at all until you do.',
    ] },
  { maps: ['seaDragonHold', 'seaDragonVault', 'stormsEndKeep', 'templeOfRhllor'],
    lines: [
      'The night is dark and full of terrors. I am one of them.',
      'The Lord of Light shows me the future in the flames. You are not in it for long.',
      'What burns is made clean. Stand still.',
      'R\'hllor gives and R\'hllor takes, and tonight I am his hand.',
    ] },
  { maps: ['waterGardens', 'pavilionOfOranges', 'princesPass', 'sunspear', 'sunspearKeep', 'sunspearInn', 'sunspearCellar'],
    lines: [
      'Unbowed, unbent, unbroken. Also unimpressed.',
      'The prince does not like his gardens bloodied. I will be careful of the flowers.',
      'In Dorne we fight in the heat of the day, because it is always the heat of the day.',
      'A northern sword in a southern garden. It will wilt before you do.',
      'Sand gets into everything. So does a Dornish spear.',
      'The Martells have outlasted dragons. They will not notice outlasting you.',
      'Dorne remembers the Young Dragon. He came with fifty thousand and left with a grave.',
      'We poison our spears in the Water Gardens, and we are not always careful which ones.',
    ] },
  { maps: ['theTwins', 'twinsHall', 'theGreenFork'],
    lines: [
      'Lord Walder has ninety heirs and one bridge. The bridge is worth more.',
      'Toll or steel. The Freys are not particular which.',
      'My grandfather is Lord of the Crossing. So is everybody\'s, round here.',
      'The Green Fork runs deep this time of year, and so does the grudge.',
    ] },
  { maps: ['crastersKeep', 'crastersHall', 'frostfangs', 'beyondTheWall', 'hauntedForest'],
    lines: [
      'Kneeler. You are a long way from your walls, and they are a long way from helping you.',
      'We come south because the cold comes behind us. Move or be moved.',
      'Craster gives his sons to the gods. He gives strangers to me.',
      'A spear, a fire, and no lord. That is freedom, and you are standing in it.',
      'The Thenns do not trade and do not talk. I am making an exception to the second.',
      'South of the Wall they keep lords the way we keep dogs. You smell of both.',
      'The cold is coming behind us, and it walks. We are only the ones who got here first.',
    ] },
  { maps: ['pyke', 'pykeInn', 'pykeCellar', 'mudGate', 'seaCave'],
    lines: [
      'We do not sow. We take. Today we take from you.',
      'What is dead may never die, but you may. Let us find out.',
      'The Drowned God gave me the sea and a sword. The sword is for landsmen.',
    ] },
  { maps: ['lannisportInn', 'lannisport', 'crossroadsInn', 'theCrossroads', 'harrenhal', 'mudGate'],
    kinds: ['sellsword', 'brotherhoodBowman', 'bandit'],
    lines: [
      'Someone paid me to be on this road. They did not say who for.',
      'Nothing personal. Coin is coin, and you are standing in the way of it.',
      'I have fought for four lords this year and been paid by two. Today I am fighting for myself.',
    ] },
];

/* People with names, who say what only they would say. */
const VOICES = {
  'sunspear:Areo Hotah': 'Areo Hotah: Serve. Protect. Obey. My axe is a Norvoshi wife, and she is jealous. Come no nearer the prince.',
  'pavilionOfOranges:Areo Hotah': 'Areo Hotah: The prince has asked for quiet in his gardens. My longaxe will see that he has it.',
  'theEyrie:Ser Vardis Egen': 'Ser Vardis Egen: I captain the guard of the Lord of the Vale. The Lord of the Vale is eight and frightened, and neither of those is your business.',
  'stormsEnd:Ser Cortnay Penrose': 'Ser Cortnay Penrose: I have held this castle against a king, his brother and a red woman\'s shadow. You are a much smaller problem.',
  'highgarden:Ser Loras': 'Ser Loras: The Knight of Flowers does not lose tourneys, and this is a tourney if I say it is.',
  'riverrun:Ser Brynden Tully': 'Ser Brynden Tully: They call me the Blackfish because I swim against the current. Swim, then. The river is right behind you.',
  'lannisport:Ser Lyle Crakehall': 'Ser Lyle Crakehall: Strongboar, they call me, and not for my table manners. Come and find out what they are for.',
  'eastwatch:Cotter Pyke': 'Cotter Pyke: I command at Eastwatch, and I do not command it by being polite. Say what you came to say, or draw.',
  'eastwatchKeep:The Lord Commander': 'The Lord Commander: Three ships lost and forty ravens gone this year, and now a stranger in my keep. I am in no mood. Draw.',
  'stoneCrowHold:Chella of the Black Ears': 'Chella: I wear the ears of my enemies on a string. There is room on it.',
  'stoneCrowCave:Shagga son of Dolf': 'Shagga: Shagga son of Dolf likes this axe. Shagga will feed what it takes off you to the goats.',
  'crastersHall:Craster': 'Craster: My keep, my wives, my daughters. You drink my ale, you keep your eyes on the floor. You did not.',
  'seaDragonVault:Ser Axell': 'Ser Axell: The Lord of Light has need of kings\' blood. Yours will do to be going on with.',
  'templeOfRhllor:Kinvara': 'Kinvara: The Red Temple waits for the one who was promised. You are not them. Kneel, or burn.',
  'stormsEndKeep:Melisandre': 'Melisandre: I have seen you in the flames, walking north through the snow with the realm behind you. Show me whether it was true.',
  'fightingPits:The Pitmaster': 'The Pitmaster: Nobody walks on to my sand without paying. You will pay in coin or in blood, and blood draws the bigger crowd.',
  'pitMasterRooms:Pit Master': 'Pit Master: I bought and sold fighters for thirty years. I know what you are worth, to the copper.',
  'sealordPalace:First Sword of Braavos': 'First Sword of Braavos: Syrio Forel held this post before me, and taught me the only lesson that matters: not today.',
  'elephantCourt:Tiger Cloak Captain': 'Tiger Cloak Captain: The tigers lost the election. We did not lose our swords.',
  'cheesemongerCellar:Slaver Captain': 'Slaver Captain: The magister owns the house. I own what is in the cellar, and I am not selling to you.',
  'wreckersHold:The Wreck Captain': 'The Wreck Captain: Every ship that breaks on this bay is mine by right of the lamp. So is anybody who comes asking about them.',
  'wreckersHall:Wreck Captain': 'Wreck Captain: Silk, wine, and last spring a whole hold of sealed corn nobody ever came to claim. The bay is generous. I am not.',
  'kennelHold:The Kennelmaster': 'The Kennelmaster: Lord Ramsay names his girls after the people he has hunted. There is room on the list.',
  'flayedHall:Kennelmaster Ben': 'Ben Bones: The girls like me. They do not like you. Let us see which of us is right.',
  'theTwins:Toll Collector': 'Toll Collector: Everything that crosses pays, and everything that argues pays twice.',
  'twinsHall:Lord of the Crossing': 'Lord of the Crossing: I am the fourteenth Frey to be called that this year. I intend to be the last.',
  'harrenhalHall:The Man Holding It': 'The Man Holding It: Eleven lords have held Harrenhal in my lifetime. I mean to be the twelfth for longer than a fortnight.',
  'hardhome:A Walker': 'It is taller than a man and thinner than one, and it does not speak. The air round it smells of snow, and the snow is falling upward.',
  'crossroadsInn:Sellsword': 'Sellsword: A man in very good boots pays me to sit in this inn and watch the carters. You are not a carter.',
};

/* The people who were somebody else in a fight, and who they are instead. */
const RECAST = {
  'sunspearKeep:Spear of Dorne': ['dornishOutrider'],
  'braavos:Water Dancer': ['sellsword'],
  'illyriosManse:Ser Jorah': ['hedgeKnight', 'Ser Jorah: I served a queen across the sea and was sent away from her. I have nothing left to lose, which makes me dangerous.'],
  'seaCave:Lookout': ['ironbornReaver'],
  'dreadfortKeep:Bastard\'s Man': ['manAtArms'],
  'stoneCrypt:Grave Robber': ['gravedigger', 'Grave Robber: The dead in this crypt left their rings on. It would be a shame to let them go to waste. Yours too.'],
  'greatSept:Sparrow': ['manAtArms', 'Sparrow: The Faith Militant is risen again, and the Seven have need of hard men. You are soft.'],
  'theEyrieInn:Hedge Knight': ['hedgeKnight'],
  'highgardenInn:Tourney Knight': ['hedgeKnight', 'Tourney Knight: I lost to Ser Loras three times this year. I am practising on you.'],
  'sunspearInn:Sand Steed Rider': ['dornishOutrider'],
  'stormsEndInn:Storm Knight': ['hedgeKnight', 'Storm Knight: Ours is the fury, and I have had a great deal to drink. Draw.'],
  'dragonstoneInn:Dragonstone Man': ['sellsword', 'Dragonstone Man: The island has been out of favour with every king since the last dragon. So have I.'],
  'braavosInn:Bravo': ['sellsword'],
  'pentosInn:Sellsword': ['sellsword'],
  'volantisInn:Tiger Cloak': ['sellsword'],
  'meereenInn:Pit Fighter': ['sellsword'],
  'pykeInn:Reaver': ['ironbornReaver'],
  'dreadfortInn:Bolton Man': ['manAtArms'],
  'theEyrieCellar:Sky Cell Keeper': ['sellsword', 'Sky Cell Keeper: The cells upstairs have no fourth wall. This cellar has no way out but past me.'],
  'highgardenCellar:Vintner-at-Arms': ['sellsword', 'Vintner-at-Arms: I guard the Arbor gold. Nobody has ever stolen a cask, and I would like to keep the record.'],
  'sunspearCellar:Shadow City Man': ['dornishOutrider'],
  'stormsEndCellar:Storm Sergeant': ['manAtArms', 'Storm Sergeant: These cellars have held through four hundred years of storms. They will hold through you.'],
  'dragonstoneCellar:Dragonstone Man': ['sellsword', 'Dragonstone Man: The glass down here is worth more than the castle over it, so nobody is taking any.'],
  'braavosCellar:Bank Guard': ['sellsword', 'Bank Guard: The Iron Bank will have its due. Today its due is you, face down on its floor.'],
  'pentosCellar:Cheesemonger Man': ['sellsword'],
  'volantisCellar:Tiger Cloak': ['sellsword'],
  'meereenCellar:Harpy\'s Man': ['sellsword'],
  'pykeCellar:Reaver Captain': ['ironbornReaver'],
  'eastwatchInn:Sealed Brother': ['deserter'],
  'crossroadsInn:Sellsword': ['sellsword'],
};

function hashOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Gives every fighter a voice, and every borrowed fighter their own kind.
 * Called once by the map file, after every room has been built and named.
 */
export function giveFightersVoices(maps) {
  const used = new Set();
  let voiced = 0;
  /* How far each pool has got, across the whole world rather than room by
     room: the lines go round in turn, so a room never hears the same one
     twice and the realm hears each as seldom as the pool allows. */
  const said = new Map();
  for (const [mapId, map] of Object.entries(maps)) {
    for (const npc of map.npcs ?? []) {
      if (npc.script !== 'duel' || !npc.data?.duel) continue;
      const key = `${mapId}:${npc.name}`;
      const recast = RECAST[key];
      if (recast) {
        used.add(`recast ${key}`);
        if (!ROAMERS[recast[0]]) throw new Error(`${key} is recast as ${recast[0]}, which is not a kind of person`);
        npc.data = { ...npc.data, duel: recast[0] };
        if (recast[1]) npc.data.line = recast[1];
      }
      if (!ROAMERS[npc.data.duel] || npc.data.line) continue;
      let line = VOICES[key];
      if (line) used.add(`voice ${key}`);
      else {
        const group = VOICE_GROUPS.find((g) => g.maps.includes(mapId)
          && (!g.kinds || g.kinds.includes(npc.data.duel)))
          ?? VOICE_GROUPS.find((g) => g.kinds?.includes(npc.data.duel));
        if (!group) throw new Error(`${key} fights as a ${npc.data.duel} and has nothing to say`);
        const n = said.get(group) ?? 0;
        said.set(group, n + 1);
        const pick = group.lines[(hashOf(group.lines[0]) + n) % group.lines.length];
        line = group.plain ? pick : `${npc.name}: ${pick}`;
      }
      npc.data = { ...npc.data, line };
      voiced++;
    }
  }
  for (const key of Object.keys(VOICES)) {
    if (!used.has(`voice ${key}`)) throw new Error(`the voice for ${key} belongs to nobody`);
  }
  for (const key of Object.keys(RECAST)) {
    if (!used.has(`recast ${key}`)) throw new Error(`${key} is recast, and nobody is standing there`);
  }
  return voiced;
}
