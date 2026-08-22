# The cartridge

A real Game Boy Advance ROM, built out of the browser game. It boots on hardware
and on any emulator — Delta, mGBA, VBA — from `thronebound.gba`.

## What is on it

**Swear to a house.** Stark, Lannister, Tully, Targaryen or Greyjoy. The one you
kneel to is the cloak you wear and the colour the interface is framed in.

**Nineteen maps of the North**, joined by their real doors: Winterfell and its
keep, forge, maester's hall and your own chamber; the Wolfswood; the Kingsroad;
Castle Black, its armoury and the land beyond the Wall; Moat Cailin; the
Riverlands; Riverrun, its inn and its keep; the Bloody Gate.

**A crowd that is doing something.** People wander within a few tiles of where
they belong, keep clear of doorways, and turn to face you when you speak. What
they say is what they say in the browser game, typed out a letter at a time with
a wedge that blinks when it wants a button.

**Somebody sees you coming.** A fighter facing down a road will spot you at
their own sight range, put an exclamation over their head, walk up, and draw.

**Grass you can be jumped in.** Encounters happen in tall grass and reeds and
nowhere else, at about one step in eight, and the screen cracks white and falls
to black before the fight rather than simply cutting to it.

**Duels** are the browser game's own numbers — its damage formula, its
techniques, its duellists' stats — over Fight / Pouch / Guard / Flee and then
four techniques with their power and accuracy shown. **Lose and you wake in
Winterfell a third of your purse lighter. Win and they are dead**, and stay dead,
and you are told exactly what the win was worth.

**Gold buys things.** A maester's hall sells remedies; a forge sells blades,
armour and shields. Better armour changes the body you walk around in. What a
blade teaches becomes the techniques you fight with.

**START opens a menu** — Sigil, Pouch, Record, Leave. **Record writes to the
cartridge's battery-backed memory**, and the title card offers to take up the
road again next time you switch on.

Controls: D-pad walks, hold **B** to run. **A** talks, reads signs and turns the
page. **SELECT** challenges whoever you are facing. **START** is the menu.

## What is not on it

No beasts, no eggs, no riding, no standing with houses, no court, no holdfast, no
Free Cities, no shops, no saving and no sound. The browser game is still where the
game is; this is the part of it that fits on a cartridge.

## How it is built

There is no devkitARM in this environment and no package mirror to fetch one
from, so the toolchain is plain LLVM:

```
clang --target=armv4t-none-eabi -mthumb -mcpu=arm7tdmi -ffreestanding -nostdlib
ld.lld -T link.ld
llvm-objcopy -O binary
```

`crt0.s` is the cartridge header and the boot code: the branch past the header,
the 156-byte logo the BIOS checks, the switch to system mode, the .data copy into
IWRAM and the .bss clear. `fix-header.mjs` patches the header complement at 0xBD,
which nothing before it can know, and pads the image to a power of two.

`main.c` runs in mode 0. BG0 is the world, eight bits a pixel, hardware-scrolled,
with the map you are standing on resident in video memory and the other eighteen
in ROM. BG1 is the text layer, four bits a pixel, whose character tiles are drawn
into at runtime and pushed across only where they changed. Everybody on screen is
an object, four bits a pixel with a palette bank apiece, which is what lets a
town's worth of different people be resident at once; in a duel the two of you
are the same sprites scaled up through an affine matrix. There is no divide
instruction on an ARM7 and no libgcc to supply one, so `udiv` and the two EABI
helpers are in here too.

Run `sh build.sh` to build, check and screenshot everything.

## Where the content comes from

`export.mjs` runs the browser game's own painters in a real browser, reads the
tiles and the people back pixel for pixel, quantises them into the palettes and
character tiles the hardware wants, and writes `data.h`. The maps, the collision,
the warps, the signs, the dialogue, the houses, the techniques, the duellists and
the encounter tables all come out of `src/data` the same way. The cartridge is
drawn from the same source of truth as the browser game rather than a hand-copied
approximation that drifts away from it.

It also enforces what the hardware will hold: no map may need more than 512
background tiles resident, and no map more than twelve appearances. Exceed either
and the export fails rather than the cartridge.

## How it is checked

Three ways, all of which run on every `sh build.sh`.

**`verify.mjs` — what a console checks before it will run a cartridge.** The
entry branch, the boot logo byte for byte, the fixed 0x96, the header complement
and the image size.

**`audit.c` — what the game is made of.** It reads the cartridge's own tables and
looks for the things a playthrough cannot see: a map nothing leads to, a door
that lands you inside a wall or on another door, a door with no door back,
somebody standing where nobody can stand next to them, two people on one tile, a
person with no name or no line, a line the window cannot page, a name too wide
for its plate, a duellist with impossible numbers, and — the one that actually
caught something — a letter the font has no glyph for.

**`playtest.c` — the game, played.** It is the cartridge's own C compiled for
this machine, driven by nobody: it swears to a house, then breadth-first paths
to every person on every map it can reach, talks to each of them, reads every
sign, draws on whoever will draw back, uses all four techniques, breaks off from
some duels and loses others, opens the status card, and takes every door. On
every single frame it checks the game has not put itself somewhere impossible —
the player inside a wall or off the map, somebody in the crowd inside a wall, a
window paged past its own end, a duel with more health than it started with.

A full run is about 35,000 frames, ten minutes of real play, and covers all 19
maps, all 64 people, all 12 signs and about 90 duels. The build runs one per
house; sixty runs across five houses and sixty different rolls of the dice
currently come back clean.

Between them these found: a fifth of Westeros mute, an NPC able to park in a
one-tile gateway and seal a map until they wandered off, and curly quotes and
em dashes in the writing that the font had no glyph for and would have drawn as
holes in the middle of words.

None of it is an emulator. It does not model timing, DMA, or the BIOS, so it
cannot tell you the ROM runs on hardware — only that the game is reachable,
finishable and internally consistent. **Nobody has played this on a handset.**
Run it in Delta or mGBA before believing it.
