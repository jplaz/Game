# Running the cartridge on a Game Boy Advance

`run.c` boots `thronebound.gba` on mGBA's core, holds buttons the way a person
would, writes out what the screen actually showed, and reports every access the
hardware refused.

Everything else that checks this game checks the source. The audit reads the
tables it is made of. The sweeps compile the same C for this machine and drive
it through its own menus for hours. The renderer in `render.h` reimplements the
mode 0 compositing rules so screenshots can be looked at. None of the three
executes one ARM instruction, so none of them can see what the hardware does
with what we wrote.

Two bugs lived behind that gap for the whole life of the project:

- **Byte writes to video memory.** The GBA drops 8-bit writes to VRAM. It does
  not fault; the write simply does not happen. Four things here are assembled at
  start-up out of four-bit pixels — the bubble over somebody who has spotted
  you, the star that breaks over a landed blow, the grass round your boots and
  the snow in the North — and every one of them was written a byte at a time
  into memory that never accepted a single pixel. What the hardware drew was
  whatever had been left lying in object memory.

- **The stack meeting the variables.** Thirty-two kilobytes of fast memory, the
  stack growing down from the top of it and every global growing up from the
  bottom. The linker places the globals and has no idea where the stack is. They
  met, leaving thirty-six bytes of stack, and the first map load wrote over the
  end of the last array declared and then read a pointer back out of it.

## Building it

    git clone --depth 1 -b 0.10.5 https://github.com/mgba-emu/mgba.git
    cmake -S mgba -B mgba/build -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_QT=OFF -DBUILD_SDL=OFF -DBUILD_PYTHON=OFF \
      -DUSE_FFMPEG=OFF -DUSE_DISCORD_RPC=OFF -DUSE_LIBZIP=OFF \
      -DUSE_SQLITE3=OFF -DUSE_ELF=OFF -DBUILD_SHARED=OFF -DBUILD_STATIC=ON \
      -DUSE_EPOXY=OFF -DUSE_MINIZIP=OFF -DUSE_LZMA=OFF
    make -C mgba/build -j"$(nproc)" mgba

    gcc -O1 -o emu/run emu/run.c \
      -Imgba/include -Imgba/src -Imgba/build/include \
      mgba/build/libmgba.a -lm -lz -lpng -lpthread -ldl

`build.sh` runs it when the binary is there and says so when it is not.

## Reading what it says

Screens land in whatever directory is given as the second argument, as `.ppm`;
`node topng.mjs <dir> 3` turns them into PNGs worth looking at.

Every refused access is printed once per site with the program counter that
asked for it. To turn a program counter into a function:

    llvm-nm -C -n thronebound.elf | awk '$1 <= "0801f000"' | tail -3
    llvm-objdump -d --start-address=0x0801f000 --stop-address=0x0801f040 thronebound.elf

The run exits non-zero if the hardware refused anything at all.
