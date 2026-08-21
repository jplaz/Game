#!/bin/sh
# Builds the cartridge. No devkitARM here, so this is plain clang aimed at an
# ARM7TDMI, lld for the link, and llvm-objcopy to strip the ELF down to the
# raw image a Game Boy Advance actually boots.
set -e
cd "$(dirname "$0")"

CFLAGS="--target=armv4t-none-eabi -mthumb -mcpu=arm7tdmi -O2 -fno-builtin
        -ffreestanding -fomit-frame-pointer
        -Wall -Wno-unused-variable -Wno-unused-parameter -std=c99"

clang $CFLAGS -c main.c -o main.o
clang --target=armv4t-none-eabi -c crt0.s -o crt0.o -I.
ld.lld -T link.ld -o thronebound.elf crt0.o main.o
llvm-objcopy -O binary thronebound.elf thronebound.gba
node fix-header.mjs thronebound.gba
node verify.mjs thronebound.gba

# Compiling is not testing. Run the same C on this machine behind a stand-in for
# the GBA's address space and draw what the picture processor would have drawn,
# so a wrong screenblock or an off-screen window is caught here.
clang -DHOST_TEST -O1 -Wall -Wno-unused-function -o hosttest hosttest.c
mkdir -p shots
rm -f shots/*.ppm shots/*.png
./hosttest shots
node topng.mjs shots 3
