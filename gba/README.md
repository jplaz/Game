# The cartridge

A slice of the game, built as a real Game Boy Advance ROM. It boots on hardware
and on any emulator — Delta, mGBA, VBA — from `thronebound.gba`.

## What is on it

A corner of the North you can walk around: **Winterfell**, your chamber, the
Great Keep, the Winterfell forge, and the Wolfswood. The people standing in it
are the ones who stand there in the browser game, saying what they say there,
and the tiles under your feet are the same hand-drawn tiles.

- Move with the D-pad, hold **B** to run.
- **A** talks to whoever you are facing, and reads signs.
- **A** again turns the page; the window closes on the last one.
- Doors warp, walls stop you, and so do people.

## What is not on it

Everything else. No duels, no beasts, no houses, no standing, no court, no
ships, no sound. This is the walking-around layer only — the browser game is
still where the game is.

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
IWRAM and the .bss clear. `fix-header.mjs` patches the header complement at
0xBD, which nothing before it can know, and pads the image to a power of two.

Run `sh build.sh` to build everything.

## Where the content comes from

`export.mjs` runs the browser game's own painters in a real browser, reads the
tiles and the people back pixel for pixel, quantises them into the palettes and
character tiles the hardware wants, and writes `data.h`. The map, the collision,
the warps, the signs and the dialogue come out of `src/data/` the same way. The
cartridge is therefore drawn from the same source of truth as the browser game
rather than a hand-copied approximation that drifts away from it.

## How it is checked

`verify.mjs` checks what a console checks before it will run a cartridge: the
entry branch, the boot logo byte for byte, the fixed 0x96, the header complement
and the image size.

That only proves it boots. `hosttest.c` compiles **the cartridge's own C** for
this machine, with the hardware addresses pointed at a stand-in for the GBA's
address space, drives it with a scripted set of button presses, and applies the
mode 0 compositing rules to whatever the code left in video memory. The frames
in `shots/` are that output: not screenshots of an emulator, but a drawing of
what the picture processor would have drawn.

It is not an emulator and it does not model timing, DMA, or the BIOS. **Nobody
has played this on hardware.** Run it in Delta or mGBA before believing it.
