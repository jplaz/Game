#!/bin/sh
# Builds the cartridge, then checks it three ways: the header a console reads,
# the data the game is made of, and the game itself played through to the end.
#
# No devkitARM here and no package mirror to fetch one from, so the toolchain is
# plain clang aimed at an ARM7TDMI, lld for the link, and llvm-objcopy to strip
# the ELF down to the raw image a Game Boy Advance actually boots.
set -e
cd "$(dirname "$0")"

# Nothing in the repository should have a shell metacharacter in its name.
#
# A file called "->kind == WARE_OATH) {|      ) {|" sat in the root for a
# fortnight and was committed with the rest: somebody piping a grep through
# something forgot to quote a ">", and the shell made a fifty-nine kilobyte
# file out of a fragment of main.c and the name of the pattern. Nothing
# referenced it and nothing would ever have noticed it. A name like that also
# will not check out on Windows at all, so the repository was quietly broken
# for anyone on one.
odd=$(cd .. && git ls-files | grep -E '[|<>*?`$\\]' || true)
if [ -n "$odd" ]; then
  echo "  a file is committed with a shell metacharacter in its name:"
  echo "$odd" | sed 's/^/    /'
  exit 1
fi

CFLAGS="--target=armv4t-none-eabi -mthumb -mcpu=arm7tdmi -O2 -fno-builtin
        -ffreestanding -fomit-frame-pointer
        -Wall -Wno-unused-variable -Wno-unused-parameter -std=c99"
HOSTFLAGS="-DHOST_TEST -O1 -Wall -Wno-unused-function"

# A stamp on the title screen, so a cartridge in somebody's hand can always be
# told from the one before it. Guessing which build a bug came from wastes
# everybody's time, and there was no way to tell them apart at all until now.
printf '#define BUILD_STAMP "%s"\n' "$(date -u +%Y-%m-%d\ %H:%M)" > build.h

# The two checks that cost a second here and half an hour at the far end, run
# BEFORE the export rather than after it -- they were below it, which is a
# perfectly good place to be told the world is broken twenty-five minutes after
# you could have been told.
#
# The audit at the end of this script finds both of these too, but wearing a
# disguise: it floods each map from the tile the house that lives there starts
# on, so three houses starting inside a wall came out as four unreachable
# chests, a seat with nothing on it, and a walkable tile with nothing to find --
# six problems, none of which mentioned a start position, all of them one bug.
node ../tools/checkmaps.mjs || exit 1
node ../tools/checkstarts.mjs || exit 1

# data.h is generated from the browser game's own painters and tables by
# export.mjs, which is not cheap and so is not run every time. Building without
# it when the sources have moved on silently tests the last world rather than
# this one - and that failure looks exactly like "nothing I changed mattered",
# which is the worst thing a test can say.
if [ ! -f data.h ] || [ -n "$(find ../src ../tools export.mjs -newer data.h 2>/dev/null | head -1)" ]; then
  echo "data.h is behind the sources. Re-exporting."
  # export.mjs serves the repository over http for the browser painters, so it
  # has to be run from the root rather than from here.
  # The heap: thirteen towns grew by half and Winterfell nearly tripled, and
  # the default eight gigabytes stopped being enough on the build that did it.
  ( cd .. && node --max-old-space-size=13000 gba/export.mjs )
fi

# Every file the exporter reads, parsed before the browser gets near it. A
# broken quote in one of them used to surface twenty-five minutes into an export
# as "Unexpected identifier" from inside page.evaluate, with no file and no line;
# node --check names both in under a second.
for f in ../src/data/*.js ../src/art/*.js; do
  node --check "$f" || exit 1
done


# The font is indexed by byte, so a curly quote or an em dash in a line the game
# draws comes out as three wrong glyphs. Catch it before it is ever seen.
node -e '
const src = require("fs").readFileSync("main.c", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const bad = (src.match(/"(?:[^"\\\n]|\\.)*"/g) || []).filter((s) => /[^\x00-\x7e]/.test(s));
if (bad.length) { console.error("non-ASCII in a drawn string:\n  " + bad.join("\n  ")); process.exit(1); }
'

clang $CFLAGS -c main.c -o main.o
clang --target=armv4t-none-eabi -c crt0.s -o crt0.o -I.
ld.lld -T link.ld -o thronebound.elf crt0.o main.o
llvm-objcopy -O binary thronebound.elf thronebound.gba

# How much of the fast memory is left for the stack.
#
# A Game Boy Advance has thirty-two kilobytes of it and the stack grows down
# from the top; every variable the game declares grows up from the bottom. The
# linker places the variables and has no idea where the stack is, so the two
# can meet in silence - and they did. Thirty-two kilobytes and four hundred
# bytes of variables left thirty-six bytes of stack, and the game walked into a
# screen of stripes the moment it loaded its first map. Nothing that runs on
# this machine rather than on the hardware can see that.
node -e '
const { execSync } = require("child_process");
const out = execSync("llvm-readelf -S thronebound.elf").toString();
let top = 0;
for (const line of out.split("\n")) {
  const m = line.match(/\s(\.data|\.bss)\s+\S+\s+([0-9a-f]{8})\s+\S+\s+([0-9a-f]{6})/);
  if (m) top = Math.max(top, parseInt(m[2], 16) + parseInt(m[3], 16));
}
const stackTop = 0x03007f00;
const room = stackTop - top;
if (!top) { console.error("cannot read the memory map"); process.exit(1); }
console.log(`  fast memory: ${top - 0x03000000} bytes of variables, ${room} left for the stack`);
if (room < 8192) {
  console.error(`  only ${room} bytes of stack. Move something big to COLD_STORE.`);
  process.exit(1);
}
'

node fix-header.mjs thronebound.gba
node verify.mjs thronebound.gba

# And the cartridge, on a Game Boy Advance.
#
# Everything else here checks the source. The audit reads the tables, the
# sweeps compile the same C for this machine and drive it through its own
# menus, and the renderer reimplements the compositing rules - and not one of
# them executes a single ARM instruction. Byte writes to video memory, which
# the hardware silently drops, were invisible to all three for the whole life
# of this project: the star over a landed blow, the bubble over somebody who
# has seen you, the grass round your boots and every flake of snow in the North
# were assembled into memory that never took them.
#
# emu/run needs mGBA built to link against, which not every machine will have,
# so it runs when it is there and is skipped when it is not.
if [ -x emu/run ]; then
  ./emu/run thronebound.gba || exit 1
else
  echo "  (emu/run not built; see emu/README.md - the hardware was not checked)"
fi

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

# One sweep with every read and write watched.
#
# The game reads a lot of tables by index and nothing had ever checked that the
# indices were in them. When your ship goes down under you, foundering sets the
# hull to the no-ship sentinel and leaves the panel up for you to read what
# happened - and the panel read hull two hundred and fifty-five out of a table
# of six and drew whatever string was on the other side of it. That had been
# happening since ships went into the game. It never crashed, because whatever
# was over there happened to be readable, so nothing ever said a word; the day
# an unrelated change moved the tables about, the same line took the whole
# playthrough down.
#
# So one house is played through under the sanitiser, every run. It costs about
# fifteen seconds and it is the only thing here that can see a read that is
# wrong but survivable - which is the kind that sits in a game for a year and
# then takes it down on somebody else's console.
#
# The sanitiser runtimes ship with the system compiler here rather than with
# clang, so this one build uses cc. If neither has them the sweep is skipped
# with a word rather than failing the build on a missing library.
if cc -DHOST_TEST -O1 -g -fsanitize=address,undefined -fno-sanitize-recover=all \
      -w -o playtest-watched playtest.c 2>/dev/null; then
  SEED=7 ./playtest-watched 0 > /tmp/watched.txt 2>&1 || {
    echo "the watched sweep stopped:"
    grep -E "runtime error|ERROR: AddressSanitizer" /tmp/watched.txt | head -5
    sed -n '/#0 /,/#4 /p' /tmp/watched.txt | head -6
    exit 1
  }
  sed -n '/nothing went wrong/p;/thing to look at/,$p' /tmp/watched.txt | head -8
else
  echo "  (no sanitiser runtime here; the watched sweep was skipped)"
fi

: > /tmp/sweeps.txt
for h in 0 1 2 3 4 5 6 7 8; do
  SEED=$((h * 104729 + 7)) ./playtest "$h" > /tmp/sweep.$h.txt
  sed -n '2,13p' /tmp/sweep.$h.txt
  cat /tmp/sweep.$h.txt >> /tmp/sweeps.txt
done

# And the systems a sweep is the only thing that reaches.
#
# Each of these was reported as nought by every run this game had ever had -
# not because they were broken but because nothing pressed the buttons: a
# ranging handed in, a hall bought, a purse put in front of a beaten man, a
# company taken on in Essos, a host sent into the field. They are rare enough
# per run to be luck, so the line is drawn across all nine together: if a whole
# sweep of Westeros never once does one of these, it has stopped being played.
node -e '
const fs = require("fs");
const out = fs.readFileSync("/tmp/sweeps.txt", "utf8");
const sum = (re) => [...out.matchAll(re)].reduce((n, m) => n + parseInt(m[1], 10), 0);
const want = [
  ["rangings handed in",   sum(/the watch +\d+ taken, (\d+) handed in/g)],
  ["halls bought",         (out.match(/seat (?!none)\S/g) || []).length],
  ["purses taken",         sum(/swords sworn +(\d+) took the purse/g)],
  ["companies taken on",   sum(/sellsword halls walked into, (\d+) companies/g)],
  ["campaigns sent",       sum(/, (\d+) campaigns sent/g)],
  ["children sworn",       sum(/children born, (\d+) grown and sworn/g)],
];
let bad = 0;
for (const [what, n] of want) {
  console.log(`  ${String(n).padStart(3)} ${what}`);
  if (!n) { console.error(`  nothing in nine playthroughs ever did: ${what}`); bad = 1; }
}
process.exit(bad);
' || exit 1

# The pictures in shots/ come from the playthrough rather than from a written
# route: it catches each screen the first time it reaches one, so the crowd
# wandering about cannot make a screenshot miss what it was aimed at. Both are
# drawn through the mode 0 compositing rules by render.h.
mkdir -p shots
rm -f shots/*.ppm shots/*.png
SEED=31337 ./playtest 2 shots > /dev/null
# One more switch-on with a record already on the cartridge, which is the only
# way to reach the title's other two entries.
SAVED=1 SEED=5 ./playtest 0 shots > /dev/null
node topng.mjs shots 3

# All three of the title's entries, played out: take the record up, step past it
# and swear a new sword, and throw it away and swear a new sword. The complaint
# that started this was the game walking into the world without being asked.
for t in 1 2 3; do
  SAVED=$t SEED=5 ./playtest 3 | sed -n '/swore to/p;/nothing went wrong/p'
done

# And then the whole game, played to the end, as every house there is.
#
# The wandering sweep above proves the world is reachable. It does not prove
# the game can be won, and for most of this game's life nothing did: no run
# had ever passed the fourth rung of the ladder, so rungs five to ten - half
# the game - had never been played by anything at all. Each of these swears to
# a house, climbs all ten seats in order, and goes on to the chair. A build
# where any house cannot finish is a build that is broken, whatever else
# passes, so this is not allowed to fail quietly: every one of the nine has to
# say the realm is yours.
for h in 0 1 2 3 4 5 6 7 8; do
  out=$(LADDER=1 FRAMES=9000000 SEED=$((h * 104729 + 7)) ./playtest "$h")
  printf '%s\n' "$out" | sed -n '/realm is yours/p;/thing to look at/,$p'
  printf '%s\n' "$out" | grep -q 'realm is yours' || {
    printf '%s\n' "$out" | sed -n '/^ *rung /p;/sigils /p'
    echo "house $h could not finish the game" >&2
    exit 1
  }
done

# And the last act on its own, started one door from the Red Keep with the nine
# seats already bent: the climb above reaches it the long way, and this reaches
# it in ninety seconds every time, so a break in the ending is caught whether
# or not the climb that day happened to get there.
for h in 0 8; do
  CROWN=1 FRAMES=900000 SEED=7 ./playtest $h | sed -n '/the last act/p;/the court /p;/nothing went wrong/p;/thing to look at/,$p'
done

# And the same ending with an empty treasury. One of the eighteen petitions is
# only ever put to a crown carrying less than two thousand gold, and a king
# walking to his own throne room picks up purses on the way - so that one had
# never been asked, answered or read by anything in the life of this game. The
# fixture holds the purse at nought; the line below is what proves it worked.
POOR=1 CROWN=1 FRAMES=900000 SEED=7 ./playtest 4 \
  | sed -n '/the court /p;/nothing went wrong/p;/thing to look at/,$p'
POOR=1 CROWN=1 FRAMES=900000 SEED=7 ./playtest 4 \
  | grep -q '18 of 18 petitions heard' || {
  echo "the poor crown was not asked all eighteen petitions" >&2
  exit 1
}

# hosttest still walks one fixed route, as a second opinion.
clang $HOSTFLAGS -o hosttest hosttest.c
./hosttest /tmp > /dev/null
