# The cartridge

A real Game Boy Advance ROM, built out of the browser game. It boots on hardware
and on any emulator — Delta, mGBA, VBA — from `thronebound.gba`.

## What is on it

**Swear to a house.** Stark, Lannister, Tully, Targaryen or Greyjoy. The one you
kneel to is the cloak you wear and the colour the interface is framed in. The
title asks before it does anything: with a record on the cartridge it offers to
take up the road, to swear a new sword instead, or to throw that record away, and
none of the three happens on its own. If an emulator's save file ever leaves you
starting in Winterfell without being asked, holding SELECT while it switches on
ignores the record entirely.

**Twenty-one maps of the North**, joined by their real doors: Winterfell and its
keep, forge, maester's hall and your own chamber; the Wolfswood; the Kingsroad;
Castle Black, its armoury and the land beyond the Wall; Moat Cailin and the
Bogforge; the Riverlands; Riverrun, the Tully Armoury, its inn and its keep;
the Bloody Gate.

**Every settlement is built of what its region builds with, and no two are laid
out alike.** Winterfell is grey northern slate on snow behind battlements.
Riverrun is thatch and green water. Moat Cailin is a ruin in a bog, slate over
what is left of its towers. Castle Black is black tarred timber pressed against
seven hundred feet of ice with one tunnel through it - hand-laid for that reason,
since the template that builds the southern towns puts a crossroads in the middle
and there is nothing less like the Wall than a crossroads. Four roof materials,
one geometry apiece for slate, tarred timber and clay, and a combed-down bundle
texture of its own for thatch.

**Somewhere to buy a sword in every town.** The Winterfell Forge, the Watch
Armoury, the Bogforge in the ruins of Moat Cailin and the Tully Armoury by the
water at Riverrun - the last two written for this, because until now half the
map had nowhere at all to buy a weapon.

**A crowd that is doing something.** People wander within a few tiles of where
they belong, keep clear of doorways, and turn to face you when you speak. What
they say is what they say in the browser game, typed out a letter at a time with
a wedge that blinks when it wants a button.

**Somebody sees you coming.** A fighter facing down a road will spot you at
their own sight range, put an exclamation over their head, walk up, and draw.

**Grass you can be jumped in.** Encounters happen in tall grass and reeds and
nowhere else, at about one step in eight, and the screen cracks white and falls
to black before the fight rather than simply cutting to it. Blades rustle at your
boots while you are in it, in green on the road and in frost north of Winterfell.

**Walking that feels like walking.** Facing a new way takes a beat before you go
that way, so you can turn on the spot to speak to somebody beside you. Hold B and
you run. Ledges are one-way: press down at one and you drop two tiles south in a
single arc, and you cannot climb back up.

**A ladder to climb.** Experience for every duel won, on a curve that gets steeper
as you go. A win does not end the moment they go down: you stay in the yard, the
purse and the experience are read out, and the thin green rail under your health
fills up in front of you. Each rung it passes stops it long enough to say what
that rung bought - might, guard, swiftness, and whole again. A beeline through the
North ends around level 16-26; an hour in the grass will take you further.

**A yard at dusk.** A duel is fought against a banded sky: eleven flat tiles and
eleven palette entries running deep blue down to a low sun and then two courses of
trodden earth, which is how a handheld draws a gradient when it has no room for a
picture.

**A swing you can watch.** The one swinging leans in and comes back; the one
struck is shaken about, flickers, and has a star break over them; the health bar
walks down behind it instead of jumping; and a beaten body sinks out of the yard.
The game will not take a button until the swing has played.

**Duels** are the browser game's own numbers — its damage formula, its
techniques, its duellists' stats — over Fight / Pouch / Guard / Flee and then
four techniques with their power and accuracy shown. **Lose and you wake in
Winterfell a third of your purse lighter. Win and they are dead**, and stay dead,
and you are told exactly what the win was worth.

**You start with nothing.** Bare hands and one remedy, and Jab, Grapple and
Headbutt to fight with. Everything you wear, you take off somebody who tried to
stop you.

**Everybody on the road is carrying something, and it is fixed to who they are.**
A weapon, a mail, sometimes a shield, sometimes a remedy, drawn from a purse
their standing buys and jittered by a hash of their name - so the same knight has
the same blade on him every time, a serjeant of the Watch is a better prize than
a stableboy, and the road can be read. They fight in their weapon and their mail;
the shield is on their back until you take it off them, which is the one edge a
scavenger has over everybody else. Beat them and you take the lot: whatever beats
what you have goes straight on, whatever you have already is stripped for what
the metal is worth. Nobody on the road carries the very best things in the world -
those are still only at a forge, and gold is still worth having.

**And things are lying about.** One step in twenty-five through long grass turns
something up: usually a remedy, now and then a piece of gear worth about what
somebody of your own standing would be carrying.

**A floor under all of it.** Everything comes off somebody, so a player with
nothing who cannot win a fight would have no way back in. Go down bare-handed and
there is a Hunting Knife on the chest when you wake. Nobody says who left it.

**Gold buys things.** A maester's hall sells remedies; a forge sells blades,
armour and shields. Bought gear goes in the pouch and onto you only if it beats
what you have. Better armour changes the body you walk around in. What a blade
teaches becomes the techniques you fight with - and with nothing in your hands,
you fight with your hands.

**Sound.** Three tunes on the sound hardware's own square and noise generators —
one for the road, one for a title card, and a faster one in C minor once steel is
out — with a cursor tick, a door, a blow landing, a level-up flourish and a sting
for winning and for going down.

**START opens a menu** — Sigil, Pouch, Record, Leave. **Record writes to the
cartridge's battery-backed memory**, and the title card offers to take up the
road again next time you switch on.

Controls: D-pad walks, hold **B** to run. **A** talks, reads signs and turns the
page. **SELECT** challenges whoever you are facing. **START** is the menu.

## What is not on it

No beasts, no eggs, no riding, no standing with houses, no court, no holdfast and
no Free Cities. There is no ending: the road stops at the Bloody Gate and nothing
declares you finished. The browser game is still where the whole of it is; this is
the part that fits on a cartridge.

## How it is drawn

Every ground palette is deliberately narrow. A field, a snowfield, a road and a
river are the quietest things on the screen, not the loudest: the speckle and
grain are all still there, drawn in shades close enough together that they stop
competing with the people standing on them. Water came down off a flat saturated
blue toward slate, and the tree canopies came down off highlighter green, for the
same reason.

Light comes from up and to the left, on everything, always. A garment's palette
gives two colours; the painter derives a lit edge and a deep crease from them, so
every one of the forty-odd people gets four tones down the body without anybody
choosing eight colours by hand for each. The head throws a shadow across the top
of the chest, the shoulders have their corners knocked off, and a leg is shaded
down one side so it reads as a cylinder. A four-bit object palette holds fifteen
colours and a hole, so those derived tones are spent deliberately - the shaded
side of a leg borrows the boot colour rather than inventing a new one.

Roofs overhang, and the overhang throws a shadow down the wall beneath it. That
one thing does more than anything else to stop a house reading as a rectangle of
roof stuck on a rectangle of wall. Doors sit in dressed stone frames with a worn
step; windows have a lintel and a sill.

`node tools/closeup.mjs out.png 10 grass ".yyyyyy." ".YYYYYY." ".HwHDHw."` renders
one patch of map very large, and `"cast:hero,guard,goodwife"` renders people in
all four facings, so a change to a painter is looked at rather than guessed at
from a screenshot of the whole screen. Two of the worst things in the art were
found that way: a near-white collar that ran the full length of the torso, which
on a floor-length gown was a white stripe from the throat to the hem, and a helm
drawn as a flat white bar across the whole head.

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
window paged past its own end, a duel with more health than it started with,
somebody at rest between two tiles, the player standing on top of somebody else,
and the sound hardware switched off or silent for ten seconds together. Three more
runs switch the cartridge on with a record already written, and play out each of
the title's three entries in turn.

**And the audit fights.** Balance is not something to have an opinion about when
the arithmetic is right there: the audit runs the cartridge's own damage formula,
with the cartridge's own idea of what everybody is carrying, over thousands of
duels. It asks the two questions that decide whether the game has a shape - can
somebody who starts with nothing beat the people they meet first (the hardest of
those fights is 83 wins in a hundred), and does it stay a fight afterwards
(dressed in what your own standing carries, you get through eleven to twenty
fights of your own standing before somebody puts you down). Under three in a row
is a wall and over twenty-five is a walk, and it fails the build either way. It
also reports the first level at which anybody carries a weapon, since a player
who starts with nothing needs something to take.

A full run is about 35,000 frames, ten minutes of real play, and covers all 19
maps, all 64 people, all 12 signs and about 90 duels. The build runs one per
house; sixty runs across five houses and sixty different rolls of the dice
currently come back clean.

Between them these found: a fifth of Westeros mute, an NPC able to park in a
one-tile gateway and seal a map until they wandered off, curly quotes and em
dashes in the writing that the font had no glyph for and would have drawn as holes
in the middle of words, a door at Winterfell that put you down on top of Jory
Cassel, a technique swung for free after a window closed, and — the newest — a
ledge that the tester walked north into for a quarter of a million frames because
its pathfinder did not know ledges only go one way, and a model of the picture
processor that drew every object as sixteen by thirty-two whatever its size bits
said, so a small sprite showed the tiles of whatever was stored after it. That
last one was a lie in the screenshots rather than a bug in the cartridge, which
is worse.

Latest: two of the four rolls that decide what somebody is carrying were dead.
`hashUpTo` reads the top sixteen bits of what it is handed, and it was being
handed a hash shifted twenty-one places - three bits, asked for a sixteen-bit
answer, which is nought every single time. Everybody carried a remedy and nobody
ever carried the lesser thing. Rotating instead of shifting fixed it, and the
audit's own tally of who carries what is what showed it up: eighty-eight of
eighty-eight, which is not what one in eight looks like.

Also: a roamer could stand in the one gap through a line of ledges and shut the
Riverlands in half. They are kept out of it the way they are kept out of
doorways, and the audit now takes every tile out of every map in turn to find
which ones cut it in two - reporting only the cuts that strand a door, a person,
a sign, or more than eight tiles, since shutting a broom cupboard costs nobody
anything. Taking the guard back out proves the check works: it finds Brienne of
Tarth able to shut a hundred and eighty-five tiles off at the Bloody Gate.

None of it is an emulator. It does not model timing, DMA, or the BIOS, so it
cannot tell you the ROM runs on hardware — only that the game is reachable,
finishable and internally consistent. **Nobody has played this on a handset.**
Run it in Delta or mGBA before believing it.
