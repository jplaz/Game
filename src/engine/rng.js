// Small deterministic RNG (mulberry32). Battles use a seeded stream so that a
// reloaded save behaves reproducibly, while the overworld uses the shared one.
export function makeRng(seed = Date.now() >>> 0) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float: next,
    /** Integer in [min, max] inclusive. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** True with probability p. */
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** Weighted pick from [{weight, ...}] entries. */
    weighted(entries) {
      const total = entries.reduce((sum, e) => sum + e.weight, 0);
      let roll = next() * total;
      for (const e of entries) {
        roll -= e.weight;
        if (roll <= 0) return e;
      }
      return entries[entries.length - 1];
    },
  };
}

export const rng = makeRng();
