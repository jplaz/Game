# The cartridge

A real Game Boy Advance ROM, built out of the browser game. It boots on hardware
and on any emulator — Delta, mGBA, VBA — from `thronebound.gba`.

## What is on it

**Swear to a house.** Stark, Lannister, Tully, Targaryen or Greyjoy. The one you
kneel to is the cloak you wear for the rest of the game.

**Nineteen maps of the North**, joined by their real warps: Winterfell and its
keep, forge, maester's hall and your own chamber; the Wolfswood; the Kingsroad;
Castle Black, its armoury and the land beyond the Wall; Moat Cailin; the
Riverlands; Riverrun, its inn and its keep; the Bloody Gate. You can walk from
the yard you start in to Riverrun without a loading screen you would notice.

**People who are doing something.** The crowd wanders — within a few tiles of
where they belong, around each other and around you — and turns to face you when
you speak to them. What they say is what they say in the browser game.

**Fight anyone.** SELECT draws on whoever you are facing. A maester or a septa
will tell you no; everybody else will oblige. Duels are the browser game's own
numbers — its damage formula, its techniques, its duellists' stats — fought over
a menu of four, with the swifter fighter swinging first. **Lose and you wake in
Winterfell lighter by a third of your purse. Win and they are dead**, and stay
dead, and the road remembers it.

**People on the road.** Out on a route, somebody steps out every twenty tiles or
so: bandits, deserters, sellswords, taken from the same encounter tables the
browser rolls, at the same levels.

Controls: D-pad walks, hold **B** to run. **A** talks and reads signs and turns
the page. **SELECT** challenges. **START** is your own card — house, level,
health, gold and how many people you have killed.

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

`verify.mjs` checks what a console checks before it will run a cartridge: the
entry branch, the boot logo byte for byte, the fixed 0x96, the header complement
and the image size.

That only proves it boots. `hosttest.c` compiles **the cartridge's own C** for
this machine, with the hardware addresses pointed at a stand-in for the GBA's
address space, drives it with a scripted run — swear to Tully, walk to the
maester, try to draw on him, kill Jory Cassel, read the status card, go into the
keep and out again, break off a duel with Theon, watch the town move, then walk
south to the Riverlands fighting whatever the road produces — and applies the
mode 0 compositing rules to whatever the code leaves in video memory. The frames
in `shots/` are that output: not screenshots of an emulator, but a drawing of
what the picture processor would have drawn.

It is not an emulator and it does not model timing, DMA, or the BIOS. Run it in
Delta or mGBA before believing it.
