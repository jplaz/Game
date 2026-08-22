#!/bin/sh
# Builds the cartridge, then checks it three ways: the header a console reads,
# the data the game is made of, and the game itself played through to the end.
#
# No devkitARM here and no package mirror to fetch one from, so the toolchain is
# plain clang aimed at an ARM7TDMI, lld for the link, and llvm-objcopy to strip
# the ELF down to the raw image a Game Boy Advance actually boots.
set -e
cd "$(dirname "$0")"

CFLAGS="--target=armv4t-none-eabi -mthumb -mcpu=arm7tdmi -O2 -fno-builtin
        -ffreestanding -fomit-frame-pointer
        -Wall -Wno-unused-variable -Wno-unused-parameter -std=c99"
HOSTFLAGS="-DHOST_TEST -O1 -Wall -Wno-unused-function"

clang $CFLAGS -c main.c -o main.o
clang --target=armv4t-none-eabi -c crt0.s -o crt0.o -I.
ld.lld -T link.ld -o thronebound.elf crt0.o main.o
llvm-objcopy -O binary thronebound.elf thronebound.gba
node fix-header.mjs thronebound.gba
node verify.mjs thronebound.gba

# Compiling is not testing.
#
# audit reads the data the cartridge is made of and says what is wrong with it:
# a door with no way back, somebody nobody can stand next to, a line with a
# letter the font has no glyph for.
clang $HOSTFLAGS -o audit audit.c
./audit

# playtest runs the cartridge's own C on this machine and plays the whole game:
# it swears to a house, paths to every person on every map it can reach, talks
# to them, reads every sign, draws on whoever will draw back, takes every door,
# and checks on every frame that the game has not put itself somewhere
# impossible. Five houses, five different rolls of the dice.
clang $HOSTFLAGS -o playtest playtest.c
for h in 0 1 2 3 4; do
  SEED=$((h * 104729 + 7)) ./playtest "$h" | sed -n '2,12p'
done

# The pictures in shots/ come from the playthrough rather than from a written
# route: it catches each screen the first time it reaches one, so the crowd
# wandering about cannot make a screenshot miss what it was aimed at. Both are
# drawn through the mode 0 compositing rules by render.h.
mkdir -p shots
rm -f shots/*.ppm shots/*.png
SEED=31337 ./playtest 2 shots > /dev/null
node topng.mjs shots 3

# hosttest still walks one fixed route, as a second opinion.
clang $HOSTFLAGS -o hosttest hosttest.c
./hosttest /tmp > /dev/null
