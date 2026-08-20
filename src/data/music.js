// Chiptune patterns. Every pattern is 32 steps (eight bars of four), written in
// groups of four so the phrasing is easy to read and edit.
// "-" is a rest, "." holds the previous note.

export const TRACKS = {
  title: {
    tempo: 76,
    voices: {
      lead:    'd4 .  .  .  a4 .  .  .  f4 .  .  .  e4 .  .  .  d4 .  .  .  f4 .  a4 .  g4 .  .  .  a4 .  .  .',
      harmony: 'a3 .  .  .  f3 .  .  .  d3 .  .  .  c4 .  .  .  a3 .  .  .  d4 .  .  .  bb3 . .  .  e4 .  .  .',
      bass:    'd2 .  .  .  d2 .  .  .  bb1 . .  .  a1 .  .  .  d2 .  .  .  f2 .  .  .  g2 .  .  .  a2 .  .  .',
    },
  },

  // Winterfell and the other settlements: warm, a little wistful.
  town: {
    tempo: 104,
    voices: {
      lead:    'd4 .  .  .  f4 .  a4 .  g4 .  f4 .  e4 .  .  .  d4 .  .  .  e4 .  g4 .  f4 .  e4 .  d4 .  .  .',
      harmony: 'a3 .  .  .  a3 .  .  .  bb3 . .  .  g3 .  .  .  f3 .  .  .  g3 .  .  .  a3 .  .  .  f3 .  .  .',
      bass:    'd2 .  .  .  d2 .  .  .  bb1 . .  .  g2 .  .  .  f2 .  .  .  c2 .  .  .  d2 .  .  .  a1 .  .  .',
    },
  },

  // Open road: a marching cadence.
  route: {
    tempo: 138,
    voices: {
      lead:    'a4 -  c5 -  e5 -  d5 -  c5 -  a4 -  b4 -  c5 -  d5 -  c5 -  b4 -  a4 -  g4 -  a4 -  e4 -  -  -',
      harmony: 'e4 -  -  -  a4 -  -  -  e4 -  -  -  f4 -  -  -  f4 -  -  -  e4 -  -  -  d4 -  -  -  c4 -  -  -',
      bass:    'a2 -  a2 -  a2 -  a2 -  f2 -  f2 -  f2 -  f2 -  d2 -  d2 -  d2 -  d2 -  e2 -  e2 -  e2 -  e2 -',
    },
  },

  // The Wolfswood and the lands beyond the Wall: sparse and cold.
  wild: {
    tempo: 88,
    voices: {
      lead:    'e4 .  .  .  g4 .  .  .  b4 .  .  .  a4 .  .  .  g4 .  .  .  e4 .  .  .  f4 .  .  .  e4 .  .  .',
      harmony: 'b3 .  .  .  b3 .  .  .  e4 .  .  .  e4 .  .  .  c4 .  .  .  c4 .  .  .  b3 .  .  .  b3 .  .  .',
      bass:    'e2 .  .  .  e2 .  .  .  c2 .  .  .  c2 .  .  .  a1 .  .  .  a1 .  .  .  b1 .  .  .  b1 .  .  .',
    },
  },

  battleWild: {
    tempo: 156,
    voices: {
      lead:    'd5 -  d5 -  c5 -  a4 -  d5 -  f5 -  e5 -  d5 -  c5 -  c5 -  bb4 - g4 -  c5 -  e5 -  d5 -  c5 -',
      harmony: 'a4 -  -  -  f4 -  -  -  a4 -  -  -  bb4 - -  -  g4 -  -  -  e4 -  -  -  g4 -  -  -  a4 -  -  -',
      bass:    'd2 d2 d2 d2 d2 d2 d2 d2 bb1 bb1 bb1 bb1 bb1 bb1 bb1 bb1 c2 c2 c2 c2 c2 c2 c2 c2 a1 a1 a1 a1 a1 a1 a1 a1',
    },
  },

  battleTrainer: {
    tempo: 168,
    voices: {
      lead:    'a4 -  e5 -  d5 -  c5 -  a4 -  c5 -  e5 -  a5 -  g5 -  e5 -  d5 -  c5 -  b4 -  d5 -  c5 -  a4 -',
      harmony: 'e4 -  -  -  a4 -  -  -  e4 -  -  -  c5 -  -  -  b4 -  -  -  a4 -  -  -  g4 -  -  -  e4 -  -  -',
      bass:    'a2 a2 a2 a2 a2 a2 a2 a2 f2 f2 f2 f2 f2 f2 f2 f2 c2 c2 c2 c2 c2 c2 c2 c2 e2 e2 e2 e2 e2 e2 e2 e2',
    },
  },

  // Great House lords and the Iron Throne itself.
  battleBoss: {
    tempo: 176,
    voices: {
      lead:    'd5 -  eb5 - f5 -  eb5 - d5 -  c5 -  bb4 - a4 -  d5 -  f5 -  a5 -  g5 -  f5 -  eb5 - d5 -  d5 -',
      harmony: 'a4 -  bb4 - a4 -  g4 -  f4 -  g4 -  f4 -  e4 -  a4 -  d5 -  f5 -  eb5 - d5 -  c5 -  bb4 - a4 -',
      bass:    'd2 d2 a2 a2 d2 d2 a2 a2 bb1 bb1 f2 f2 bb1 bb1 f2 f2 g2 g2 d2 d2 g2 g2 d2 d2 a1 a1 e2 e2 a1 a1 a2 a2',
    },
  },

  victory: {
    tempo: 150,
    voices: {
      lead:    'd5 -  d5 -  d5 -  g5 .  .  .  f5 -  g5 -  a5 .  .  .  .  .  -  -  d5 -  f5 -  a5 .  .  .  .  .',
      harmony: 'bb4 - bb4 - bb4 - d5 .  .  .  c5 -  d5 -  f5 .  .  .  .  .  -  -  bb4 - d5 -  f5 .  .  .  .  .',
      bass:    'g2 -  g2 -  g2 -  g2 .  .  .  bb2 - bb2 - d3 .  .  .  .  .  -  -  g2 -  g2 -  d3 .  .  .  .  .',
    },
  },

  heal: {
    tempo: 120,
    voices: {
      lead:    'c5 .  e5 .  g5 .  c6 .  .  .  .  .  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -',
      harmony: 'g4 .  c5 .  e5 .  g5 .  .  .  .  .  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -',
      bass:    'c3 .  .  .  c3 .  .  .  .  .  .  .  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -',
    },
  },
};
