// Move table.
//
// category: 'physical' | 'special' | 'status'
// effect:   optional rider applied after damage (or instead of it, for status)
//   { status }             inflicts burn/freeze/paralyze/poison/sleep
//   { stat, stages, target }  stat change ('atk'|'def'|'spa'|'spd'|'spe')
//   { heal }               fraction of max HP restored to the user
//   { drain }              fraction of damage dealt returned as HP
//   { recoil }             fraction of damage dealt taken by the user
//   { flinch }             chance the target loses its turn
//   { hits: [min, max] }   multi-hit
// chance: probability the effect fires (defaults to 1)

export const MOVES = {
  // ---------------------------------------------------------------- beast --
  tackle:      { name: 'Tackle', type: 'beast', category: 'physical', power: 40, accuracy: 100, pp: 35,
                 desc: 'A plain charge with the whole body.' },
  scratch:     { name: 'Scratch', type: 'beast', category: 'physical', power: 40, accuracy: 100, pp: 35,
                 desc: 'Rakes the foe with claws.' },
  bite:        { name: 'Bite', type: 'beast', category: 'physical', power: 60, accuracy: 100, pp: 25,
                 effect: { flinch: true }, chance: 0.2, desc: 'A sharp bite that may make the foe flinch.' },
  maul:        { name: 'Maul', type: 'beast', category: 'physical', power: 85, accuracy: 95, pp: 15,
                 desc: 'A savage mauling.' },
  rend:        { name: 'Rend', type: 'beast', category: 'physical', power: 70, accuracy: 100, pp: 15,
                 highCrit: true, desc: 'Tears at the foe. Critical hits land easily.' },
  quickfang:   { name: 'Quick Fang', type: 'beast', category: 'physical', power: 40, accuracy: 100, pp: 30,
                 priority: 1, desc: 'Always strikes first.' },
  howl:        { name: 'Howl', type: 'beast', category: 'status', power: 0, accuracy: 100, pp: 20,
                 effect: { stat: 'atk', stages: 1, target: 'self' }, desc: 'A rousing howl. Raises ATTACK.' },
  growl:       { name: 'Growl', type: 'beast', category: 'status', power: 0, accuracy: 100, pp: 30,
                 effect: { stat: 'atk', stages: -1, target: 'foe' }, desc: 'Cows the foe. Lowers its ATTACK.' },
  leer:        { name: 'Leer', type: 'beast', category: 'status', power: 0, accuracy: 100, pp: 30,
                 effect: { stat: 'def', stages: -1, target: 'foe' }, desc: 'A hard stare. Lowers DEFENCE.' },
  rally:       { name: 'Rally', type: 'beast', category: 'status', power: 0, accuracy: 100, pp: 10,
                 effect: { heal: 0.5 }, desc: 'Rests briefly and restores half of max HP.' },
  lastcharge:  { name: 'Last Charge', type: 'beast', category: 'physical', power: 120, accuracy: 100, pp: 5,
                 effect: { recoil: 0.33 }, desc: 'A reckless charge. The user is badly hurt too.' },

  // ---------------------------------------------------------------- frost --
  frostbite:   { name: 'Frost Bite', type: 'frost', category: 'special', power: 45, accuracy: 100, pp: 25,
                 effect: { status: 'freeze' }, chance: 0.1, desc: 'A biting chill that may freeze.' },
  coldsnap:    { name: 'Cold Snap', type: 'frost', category: 'special', power: 65, accuracy: 100, pp: 20,
                 effect: { stat: 'spe', stages: -1, target: 'foe' }, chance: 0.3, desc: 'Numbing cold that may slow the foe.' },
  wintersbite: { name: "Winter's Bite", type: 'frost', category: 'special', power: 95, accuracy: 90, pp: 10,
                 effect: { status: 'freeze' }, chance: 0.15, desc: 'The cold of the Long Night.' },
  whitewind:   { name: 'White Wind', type: 'frost', category: 'special', power: 55, accuracy: 95, pp: 20,
                 desc: 'A howling wind off the ice.' },
  hoarfrost:   { name: 'Hoarfrost', type: 'frost', category: 'status', power: 0, accuracy: 90, pp: 10,
                 effect: { status: 'freeze' }, desc: 'Encases the foe in ice.' },
  iceward:     { name: 'Ice Ward', type: 'frost', category: 'status', power: 0, accuracy: 100, pp: 20,
                 effect: { stat: 'def', stages: 2, target: 'self' }, desc: 'A wall of ice. Sharply raises DEFENCE.' },

  // ---------------------------------------------------------------- flame --
  ember:       { name: 'Ember', type: 'flame', category: 'special', power: 40, accuracy: 100, pp: 25,
                 effect: { status: 'burn' }, chance: 0.1, desc: 'A small flame that may burn.' },
  flamebreath: { name: 'Flame Breath', type: 'flame', category: 'special', power: 65, accuracy: 100, pp: 20,
                 effect: { status: 'burn' }, chance: 0.15, desc: 'A gout of fire from the throat.' },
  dragonfire:  { name: 'Dragonfire', type: 'flame', category: 'special', power: 100, accuracy: 90, pp: 8,
                 effect: { status: 'burn' }, chance: 0.2, desc: 'Fire hot enough to melt stone.' },
  wildfire:    { name: 'Wildfire', type: 'flame', category: 'special', power: 120, accuracy: 85, pp: 5,
                 effect: { recoil: 0.25 }, desc: 'Green flame that spares nothing, user included.' },
  kindle:      { name: 'Kindle', type: 'flame', category: 'status', power: 0, accuracy: 100, pp: 20,
                 effect: { stat: 'spa', stages: 1, target: 'self' }, desc: 'Stokes an inner fire. Raises SP.ATK.' },
  searingbrand:{ name: 'Searing Brand', type: 'flame', category: 'physical', power: 75, accuracy: 100, pp: 15,
                 effect: { status: 'burn' }, chance: 0.3, desc: 'A red-hot strike that often burns.' },

  // ----------------------------------------------------------------- tide --
  riptide:     { name: 'Riptide', type: 'tide', category: 'special', power: 45, accuracy: 100, pp: 25,
                 desc: 'A sudden pull of water.' },
  tidalsurge:  { name: 'Tidal Surge', type: 'tide', category: 'special', power: 70, accuracy: 100, pp: 20,
                 desc: 'A wall of cold river water.' },
  drownedfury: { name: 'Drowned Fury', type: 'tide', category: 'special', power: 95, accuracy: 90, pp: 10,
                 desc: 'What is dead may never die.' },
  undertow:    { name: 'Undertow', type: 'tide', category: 'physical', power: 60, accuracy: 100, pp: 20,
                 effect: { stat: 'spe', stages: -1, target: 'foe' }, chance: 0.3, desc: 'Drags the foe down. May lower SPEED.' },
  mistveil:    { name: 'Mist Veil', type: 'tide', category: 'status', power: 0, accuracy: 100, pp: 20,
                 effect: { stat: 'spd', stages: 2, target: 'self' }, desc: 'River mist. Sharply raises SP.DEF.' },

  // ----------------------------------------------------------------- wild --
  vinelash:    { name: 'Vine Lash', type: 'wild', category: 'physical', power: 45, accuracy: 100, pp: 25,
                 desc: 'A whipping creeper.' },
  thornfall:   { name: 'Thornfall', type: 'wild', category: 'special', power: 70, accuracy: 100, pp: 20,
                 desc: 'A rain of thorns.' },
  weirwrath:   { name: 'Weirwood Wrath', type: 'wild', category: 'special', power: 95, accuracy: 95, pp: 10,
                 desc: 'The old gods answer in red leaves.' },
  rootbind:    { name: 'Root Bind', type: 'wild', category: 'status', power: 0, accuracy: 90, pp: 20,
                 effect: { stat: 'spe', stages: -2, target: 'foe' }, desc: 'Roots grip the foe. Sharply lowers SPEED.' },
  drainroot:   { name: 'Drain Root', type: 'wild', category: 'special', power: 55, accuracy: 100, pp: 15,
                 effect: { drain: 0.5 }, desc: 'Drains life and heals the user.' },

  // ---------------------------------------------------------------- storm --
  spark:       { name: 'Spark', type: 'storm', category: 'special', power: 45, accuracy: 100, pp: 25,
                 effect: { status: 'paralyze' }, chance: 0.15, desc: 'A crackle of lightning. May paralyse.' },
  stormbolt:   { name: 'Storm Bolt', type: 'storm', category: 'special', power: 70, accuracy: 100, pp: 20,
                 effect: { status: 'paralyze' }, chance: 0.2, desc: 'A bolt out of Shipbreaker Bay.' },
  thunderhead: { name: 'Thunderhead', type: 'storm', category: 'special', power: 100, accuracy: 85, pp: 8,
                 effect: { status: 'paralyze' }, chance: 0.25, desc: 'Ours is the fury.' },
  staticfield: { name: 'Static Field', type: 'storm', category: 'status', power: 0, accuracy: 95, pp: 20,
                 effect: { status: 'paralyze' }, desc: 'Paralyses the foe outright.' },

  // ---------------------------------------------------------------- steel --
  steelfang:   { name: 'Steel Fang', type: 'steel', category: 'physical', power: 55, accuracy: 100, pp: 25,
                 desc: 'Bites with iron-hard teeth.' },
  valyrian:    { name: 'Valyrian Edge', type: 'steel', category: 'physical', power: 85, accuracy: 100, pp: 10,
                 highCrit: true, desc: 'A blade of rippled steel. Crits easily.' },
  ironclad:    { name: 'Ironclad', type: 'steel', category: 'status', power: 0, accuracy: 100, pp: 20,
                 effect: { stat: 'def', stages: 1, target: 'self' }, desc: 'Braces behind plate. Raises DEFENCE.' },
  shieldwall:  { name: 'Shield Wall', type: 'steel', category: 'physical', power: 70, accuracy: 100, pp: 15,
                 effect: { stat: 'def', stages: 1, target: 'self' }, chance: 0.4, desc: 'A shield charge that may raise DEFENCE.' },

  // --------------------------------------------------------------- shadow --
  shadetouch:  { name: 'Shade Touch', type: 'shadow', category: 'special', power: 45, accuracy: 100, pp: 25,
                 desc: 'A cold, creeping touch.' },
  nightterror: { name: 'Night Terror', type: 'shadow', category: 'special', power: 70, accuracy: 100, pp: 15,
                 effect: { status: 'sleep' }, chance: 0.2, desc: 'A waking nightmare that may put the foe to sleep.' },
  longnight:   { name: 'Long Night', type: 'shadow', category: 'special', power: 100, accuracy: 90, pp: 8,
                 desc: 'The night that never ends.' },
  wargbond:    { name: 'Warg Bond', type: 'shadow', category: 'status', power: 0, accuracy: 100, pp: 15,
                 effect: { stat: 'spa', stages: 2, target: 'self' }, desc: 'Slips into another skin. Sharply raises SP.ATK.' },
  soulleech:   { name: 'Soul Leech', type: 'shadow', category: 'special', power: 65, accuracy: 100, pp: 10,
                 effect: { drain: 0.5 }, desc: 'Steals warmth from the foe to heal.' },

  // ---------------------------------------------------------------- faith --
  prayer:      { name: 'Prayer', type: 'faith', category: 'status', power: 0, accuracy: 100, pp: 10,
                 effect: { heal: 0.5 }, desc: 'Restores half of the user\'s max HP.' },
  sevenlight:  { name: 'Light of Seven', type: 'faith', category: 'special', power: 75, accuracy: 100, pp: 15,
                 desc: 'A blaze of holy light.' },
  holyflame:   { name: 'Holy Flame', type: 'faith', category: 'special', power: 95, accuracy: 95, pp: 10,
                 effect: { status: 'burn' }, chance: 0.2, desc: 'The Lord of Light answers.' },
  wardsigil:   { name: 'Ward Sigil', type: 'faith', category: 'status', power: 0, accuracy: 100, pp: 20,
                 effect: { stat: 'spd', stages: 1, target: 'self' }, desc: 'A sigil of protection. Raises SP.DEF.' },

  // ---------------------------------------------------------------- venom --
  venomsting:  { name: 'Venom Sting', type: 'venom', category: 'physical', power: 35, accuracy: 100, pp: 30,
                 effect: { status: 'poison' }, chance: 0.35, desc: 'A stinger slick with poison.' },
  toxicfang:   { name: 'Toxic Fang', type: 'venom', category: 'physical', power: 65, accuracy: 100, pp: 20,
                 effect: { status: 'poison' }, chance: 0.3, desc: 'A venomous bite.' },
  scorpion:    { name: 'Scorpion Strike', type: 'venom', category: 'physical', power: 90, accuracy: 90, pp: 10,
                 desc: 'Unbowed, unbent, unbroken.' },
  wither:      { name: 'Wither', type: 'venom', category: 'status', power: 0, accuracy: 90, pp: 15,
                 effect: { status: 'poison' }, desc: 'Poisons the foe.' },

  // ---------------------------------------------------------------- stone --
  rocktoss:    { name: 'Rock Toss', type: 'stone', category: 'physical', power: 50, accuracy: 95, pp: 25,
                 desc: 'Hurls a jagged stone.' },
  landslide:   { name: 'Landslide', type: 'stone', category: 'physical', power: 75, accuracy: 90, pp: 15,
                 desc: 'Brings the hillside down.' },
  mountainfall:{ name: 'Mountain Fall', type: 'stone', category: 'physical', power: 110, accuracy: 80, pp: 5,
                 desc: 'The Rock itself falls on the foe.' },
  bulwark:     { name: 'Bulwark', type: 'stone', category: 'status', power: 0, accuracy: 100, pp: 20,
                 effect: { stat: 'def', stages: 1, target: 'self' }, desc: 'Hunkers down. Raises DEFENCE.' },

  // ----------------------------------------------------------------- wind --
  gust:        { name: 'Gust', type: 'wind', category: 'special', power: 40, accuracy: 100, pp: 30,
                 desc: 'A buffet of wind.' },
  wingslash:   { name: 'Wing Slash', type: 'wind', category: 'physical', power: 65, accuracy: 100, pp: 20,
                 desc: 'Slashes with a wing edge.' },
  skyfall:     { name: 'Skyfall', type: 'wind', category: 'physical', power: 95, accuracy: 90, pp: 10,
                 effect: { flinch: true }, chance: 0.2, desc: 'A stoop out of the sun.' },
  updraft:     { name: 'Updraft', type: 'wind', category: 'status', power: 0, accuracy: 100, pp: 20,
                 effect: { stat: 'spe', stages: 2, target: 'self' }, desc: 'Rides the wind. Sharply raises SPEED.' },
  ravenflock:  { name: 'Raven Flock', type: 'wind', category: 'physical', power: 20, accuracy: 90, pp: 20,
                 effect: { hits: [2, 5] }, desc: 'Strikes two to five times.' },
};

export function move(id) {
  const found = MOVES[id];
  if (!found) throw new Error(`Unknown move: ${id}`);
  return { id, ...found };
}

export const MOVE_IDS = Object.keys(MOVES);
