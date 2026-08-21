# A Song of Ice and Monsters

A Game-of-Thrones-flavoured, Pokémon-Emerald-style monster-collecting RPG that runs
entirely in a browser. No engine, no build step, no assets to download — every sprite,
tile, note and glyph in the game is generated from source at load time.

## Playing it

**In a browser, with nothing installed.** Push this branch and GitHub Pages serves
it. In the repository: **Settings → Pages → Source: GitHub Actions**. The workflow in
`.github/workflows/pages.yml` deploys on every push and the game appears at
`https://<your-username>.github.io/<repository>/`. Nothing to build — it is plain ES
modules and the art is drawn at load time.

**On your own machine**, if you have Node:

```bash
git clone https://github.com/<your-username>/<repository>.git
cd <repository>
npm start          # serves on http://localhost:8080
```

ES modules need `http://`, so open it through the server rather than double-clicking
`index.html`. Any static host works.

**On a Game Boy Advance, or an emulator like Delta.** `gba/thronebound.gba` is a real
cartridge image: it boots, and a corner of the North — Winterfell, the Great Keep, the
forge, your chamber, the Wolfswood — can be walked around, with the same tiles, the
same people and the same lines as the browser game. It is only the walking-around
layer: no duels, no beasts, no houses, no sound. See [`gba/README.md`](gba/README.md)
for how it is built out of the browser game's own art, and how far it has and has not
been checked.

## Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | Walk (hold **X** to run) |
| **Z** / Space | Confirm, talk, advance text |
| **X** | Cancel, back |
| **R** | Mount or dismount your beast |
| **C** | Call out whoever you are facing |
| **Enter** | Pause menu |
| **M** | Mute |

Touch devices get an on-screen d-pad automatically.

## The game

You are a ward of Winterfell, sent south as Lord Eddard's errand-rider. Collect the
Great House sigils, and take the Iron Throne from Cersei — twice over, because she
does not concede the chair to someone who has only beaten her animals.

### You fight too

You have your own level track, stats and equipment, entirely separate from your
creatures. **Duels** are fought in person, steel against steel, and that is how the
knights, sellswords and Kingsguard of Westeros challenge you. Beasts still use the
creature battle system — people fight as themselves.

Your gear *is* your moveset. A longsword teaches Slash, Thrust and Riposte; a
warhammer teaches Crush and Sweep; a bow teaches Loose and Volley. Armour trades
swiftness for guard. **Wind** paces the exchange: heavy techniques cost more than a
round restores, so a duel is a rhythm of spending and recovering rather than
repeating the largest number. Bleed, stagger and broken guard give it texture.

Winning pays experience, coin and sometimes the loser's own gear. Losing wounds you
and costs a fifth of your purse. Commanding a creature battle also feeds your level,
at a third of the rate, so neither style of play shuts the other out.

### The cast

Ser Rodrik and Jory hold the Winterfell yard. Theon and Robb will spar. The roads
are held by Sandor Clegane, Bronn, Brienne of Tarth, Beric Dondarrion, Ygritte,
Tormund, Jon Snow, Syrio Forel, Ramsay Bolton, Oberyn Martell, Gregor Clegane,
Ser Jaime, the Kingsguard, Grey Worm, Daario and Euron Greyjoy. Melisandre, Davos,
Olenna, Margaery, Littlefinger, Prince Doran, Maester Aemon and Daenerys hold their
own ground and have things to say about yours.

### Westeros

**48 maps** across the regions, branching rather than running as a corridor:

| Region | Places |
| --- | --- |
| The North | Winterfell, the Wolfswood, Moat Cailin |
| The Wall | The Kingsroad North, Castle Black, Beyond the Wall |
| Riverlands | The Riverlands, Riverrun |
| The Vale | The Bloody Gate, the Eyrie |
| Westerlands | The Gold Road, Lannisport, Casterly Rock, the Barrow Deeps |
| The Reach | The Roseroad, Highgarden |
| Dorne | The Prince's Pass, Sunspear |
| Stormlands | The Stormlands, Storm's End |
| Crownlands | The Kingsroad, King's Landing, the Red Keep |
| Dragonstone | Dragonstone, the Dragonmont |

Every settlement has a Maester's Hall that heals and sells supplies, and most have a
forge that sells and fits arms and armour.

### Creatures

- **35 creatures** across 15 heraldic archetypes — direwolves, dragons, krakens,
  wights, heart trees — each with base stats, IVs, an EXP curve, learnsets and
  evolutions. Two legendaries hide at the ends of the world: Ghostfang beyond the
  Wall, Blackdread under the Dragonmont.
- **12 elemental types** (Beast, Frost, Flame, Tide, Wild, Storm, Steel, Shadow,
  Faith, Venom, Stone, Wind) on a chart close enough to the originals that type
  intuition transfers. Mundane Beast attacks pass straight through Shadow creatures.
- **63 moves** with burns, freezes, paralysis, poison, sleep, stat stages, drain,
  recoil, multi-hit, priority and high-crit.
- Turn-based battles using Gen-III damage, capture and EXP formulas.

Saving is to `localStorage`, and there is a bestiary, a sigil case, a gear page and
a trainer card in the pause menu.

## Layout

```
src/
  engine/    loop, input, audio, bitmap font, sprite compiler, scene stack, RNG
  art/       tile painters, character paperdoll, creature archetypes
  data/      types, moves, species, items, gear, maps, trainers, duellists,
             scripts, music
  game/      creature instances, combat maths, player stats, world state, saving
  ui/        window frames, dialogue box
  scenes/    title, overworld, battle, duel, menu, shop, smithy, credits
tools/
  validate.mjs   world-data integrity check
gba/
  export.mjs     runs the browser game's painters and writes data.h
  main.c         the cartridge: mode 0 backgrounds, objects, a dialogue window
  crt0.s         cartridge header, boot logo, .data copy, .bss clear
  hosttest.c     runs main.c on this machine and draws what the PPU would draw
  verify.mjs     the checks a console makes before it will run a cartridge
```

### How the art works

Nothing is loaded over the network. Tiles are painted into 16×16 offscreen canvases
with a deterministic hash, so the same patch of grass looks the same every run, and
they **autotile**: each tile knows which orthogonal neighbours share its group, so
forests grow lit rims and trunks at their edges, water gets foam where it meets land,
cliffs get a sunlit cap and roofs get eaves. A tile with open sky above and below
draws a whole tree rather than a slice of canopy, which is what stops scattered
woodland reading as green bars.

People are a paperdoll at Emerald's 16×32 proportions — head, cloak, two legs — which
yields four facings and a four-step walk cycle for every NPC from one routine, so a
new character is just a new palette. Creatures are drawn front-on like sigils on a
banner: a handful of archetype painters plus a six-colour palette each. Windows are
built the way the GBA builds them, from a dark keyline, a colour band, a bright inner
bevel and a fill, with stepped corners. The font is a hand-authored 5×7 proportional
bitmap with real descenders.

### Validation

```bash
npm run validate
```

`tools/validate.mjs` walks the world tables and catches the class of mistake a browser
only reveals when a player happens to step on it: a warp into a wall, an NPC standing
inside a tree or on a warp tile, a sign on a walkable tile that can never be faced, a
learnset naming a move that was renamed, a shop stocking an item that no longer
exists, a duellist with a technique their weapon cannot teach. It found twenty real
bugs the first time it ran, and another twenty when Westeros was built out.

## Licence

MIT. Written for fun; not affiliated with Nintendo, Game Freak, or HBO.
