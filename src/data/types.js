// Twelve elemental types, renamed for the setting. The chart is deliberately
// close to a classic one so type intuition transfers, with one immunity:
// mundane Beast attacks pass straight through Shadow creatures.

export const TYPES = {
  beast:  { name: 'BEAST',  color: '#a8a090', dark: '#6f6a5e' },
  frost:  { name: 'FROST',  color: '#8fd4e8', dark: '#4a8fa8' },
  flame:  { name: 'FLAME',  color: '#e8783c', dark: '#a24a1c' },
  tide:   { name: 'TIDE',   color: '#5a9ae0', dark: '#2f5f9c' },
  wild:   { name: 'WILD',   color: '#68b45a', dark: '#3a7a34' },
  storm:  { name: 'STORM',  color: '#e8cc4a', dark: '#a8901c' },
  steel:  { name: 'STEEL',  color: '#b0bcc8', dark: '#6f7c88' },
  shadow: { name: 'SHADOW', color: '#8a6ac0', dark: '#503c78' },
  faith:  { name: 'FAITH',  color: '#f0dca0', dark: '#a8904c' },
  venom:  { name: 'VENOM',  color: '#a860b0', dark: '#6c3872' },
  stone:  { name: 'STONE',  color: '#c0a068', dark: '#806438' },
  wind:   { name: 'WIND',   color: '#a8c8e8', dark: '#5f7f9c' },
};

// attacker -> { defender: multiplier }. Anything unlisted is 1x.
const CHART = {
  beast:  { steel: 0.5, stone: 0.5, shadow: 0 },
  flame:  { wild: 2, steel: 2, frost: 2, tide: 0.5, stone: 0.5, flame: 0.5 },
  tide:   { flame: 2, stone: 2, wild: 0.5, tide: 0.5, storm: 0.5 },
  wild:   { tide: 2, stone: 2, flame: 0.5, wind: 0.5, venom: 0.5, wild: 0.5, steel: 0.5 },
  frost:  { wild: 2, wind: 2, beast: 2, flame: 0.5, steel: 0.5, frost: 0.5 },
  storm:  { tide: 2, wind: 2, steel: 2, wild: 0.5, stone: 0.5, storm: 0.5 },
  steel:  { frost: 2, stone: 2, faith: 2, flame: 0.5, steel: 0.5, storm: 0.5 },
  shadow: { faith: 2, beast: 2, steel: 0.5, shadow: 0.5 },
  faith:  { shadow: 2, venom: 2, steel: 0.5, faith: 0.5 },
  venom:  { wild: 2, faith: 2, steel: 0.5, stone: 0.5, venom: 0.5 },
  stone:  { flame: 2, wind: 2, storm: 2, tide: 0.5, wild: 0.5, steel: 0.5 },
  wind:   { wild: 2, beast: 2, storm: 0.5, stone: 0.5, steel: 0.5 },
};

/** Multiplier for one attacking type against a defender's (one or two) types. */
export function typeEffectiveness(attackType, defenderTypes) {
  const row = CHART[attackType] ?? {};
  let multiplier = 1;
  for (const defType of defenderTypes) {
    multiplier *= row[defType] ?? 1;
  }
  return multiplier;
}

/** Same-type attack bonus. */
export function stab(moveType, attackerTypes) {
  return attackerTypes.includes(moveType) ? 1.5 : 1;
}

export function typeColor(type) {
  return TYPES[type]?.color ?? '#a8a090';
}

export function typeName(type) {
  return TYPES[type]?.name ?? '???';
}
