# A Song of Ice and Monsters

A Game-of-Thrones-flavoured, Pokémon-Emerald-style monster-collecting RPG that runs
entirely in a browser. No engine, no build step, no assets to download — every sprite,
tile, note and glyph in the game is generated from source at load time.

```bash
npm start          # serves on http://localhost:8080
```

ES modules need `http://`, so open it through the server rather than double-clicking
`index.html`. Any static host works too (GitHub Pages included).

## Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | Walk (hold **X** to run) |
| **Z** / Space | Confirm, talk, advance text |
| **X** | Cancel, back |
| **Enter** | Pause menu |
| **M** | Mute |

Touch devices get an on-screen d-pad automatically.

## The game

You are a ward of Winterfell, sent south as Lord Rickard's errand-rider. Collect the
four Great House sigils and claim the Iron Throne.

- **35 creatures** across 15 heraldic archetypes — direwolves, dragons, krakens, wights,
  heart trees — each with base stats, IVs, an EXP curve, learnsets and evolutions.
- **12 elemental types** (Beast, Frost, Flame, Tide, Wild, Storm, Steel, Shadow, Faith,
  Venom, Stone, Wind) on a chart close enough to the originals that type intuition
  transfers. Mundane Beast attacks pass straight through Shadow creatures.
- **63 moves** with burns, freezes, paralysis, poison, sleep, stat stages, drain,
  recoil, multi-hit, priority and high-crit.
- **23 maps** from Winterfell to the Red Keep: four gyms, an optional legendary in the
  Barrow Deeps, trainers with line-of-sight, shops, healing, ground loot and a rival who
  turns up three times.
- Turn-based battles using Gen-III damage, capture and EXP formulas.
- Saving to `localStorage`, a bestiary, a sigil case and a trainer card.

## Layout

```
src/
  engine/    loop, input, audio, bitmap font, sprite compiler, scene stack, RNG
  art/       tile painters, character paperdoll, creature archetypes
  data/      types, moves, species, items, maps, trainers, scripts, music
  game/      creature instances, combat maths, world state, saving
  ui/        window frames, dialogue box
  scenes/    title, overworld, battle, menu, shop, credits
tools/
  validate.mjs   world-data integrity check
```

### How the art works

Nothing is loaded over the network. Tiles are painted into 16×16 offscreen canvases
with a deterministic hash, so the same patch of grass looks the same every run.
People are a paperdoll — head, cloak, two legs — which yields four facings and a
four-step walk cycle for every NPC from one routine, so a new character is just a new
palette. Creatures are drawn front-on like sigils on a banner: a handful of archetype
painters plus a six-colour palette each. The font is a hand-authored 5×7 proportional
bitmap with real descenders.

### Validation

```bash
npm run validate
```

`tools/validate.mjs` walks the world tables and catches the class of mistake a browser
only reveals when a player happens to step on it: a warp into a wall, an NPC standing
inside a tree, a sign on a walkable tile that can never be faced, a learnset naming a
move that was renamed, a shop stocking an item that no longer exists. It found twenty
real bugs the first time it ran.

## Licence

MIT. Written for fun; not affiliated with Nintendo, Game Freak, or HBO.
