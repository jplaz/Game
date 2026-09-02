/* Runs the cartridge's own C on this machine, behind a stand-in for the GBA's
 * address space, and draws what the picture processor would have drawn.
 *
 * This is not an emulator and does not pretend to be one: it is the real game
 * code, driven by a scripted set of button presses, with the mode 0 compositing
 * rules applied to whatever that code left in video memory. It catches the
 * things that are invisible in a compiler's output — a screenblock addressed
 * wrongly, a palette index off by one, a window drawn off the bottom of the
 * screen — without needing hardware.
 *
 *   cc -DHOST_TEST hosttest.c -o hosttest && ./hosttest outdir
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define HOST_TEST 1
#define main gba_main
#include "main.c"
#undef main

#define MEM_SPAN 0x03000400u                  /* 0x04000000 .. 0x07000400 */
unsigned char *gbaMem;
unsigned char hostSram[65536];

int hostFramesLeft;
static int frameNo;

/* --------------------------------------------------------- the script ---- */
/* What is being held, frame by frame. Each entry is (frames, keys). */

/* A beat is either a set of buttons held for so many frames, or a tile to walk
   to — greedy, one axis at a time, which is enough for the corridors here and
   keeps a route from breaking every time somebody wanders across it. */
typedef struct { int frames; unsigned keys; const char *shot; int gx, gy; const char *who; } Step;   /* not the cartridge Beat: that one is a cutscene */
#define WALK_TO(f, x, y, shot) { f, 0, shot, x, y, 0 }

/* Go and find a particular person, wherever they have got to, and speak to
   them - or draw on them.
 *
 * These two beats used to be a tile: walk to twelve, sixteen and press A,
 * because that is where Maester Luwin is. It is where he starts. He roams, as
 * most of this cast does, so by the time a route two thousand frames long
 * arrives he is three tiles away and the button is pressed at a wall. The same
 * for Theon and the duel, which is nine of these pictures.
 *
 * Naming the person instead reads their tile off the crowd on the frame the
 * step is taken, so it is right however far they have wandered and stays right
 * when somebody moves them in the map data. */
#define TALK_TO(f, name, shot) { f, 0, shot, -2, 0, name }
#define FIGHT(f, name, shot)   { f, 0, shot, -3, 0, name }

/* Read whatever is on the screen and get back to the world, however long that
   takes, up to a limit.
 *
 * Every other beat here is a number of frames somebody counted once. That was
 * fine while the road between two screens was fixed; then beginning the game
 * grew an opening window and a cutscene at Winterfell, and every hard-counted
 * beat after it was pressed at a page of prose - so this route took nineteen
 * pictures of the same field and reported nothing wrong. A beat that waits for
 * a condition cannot be broken by somebody adding a paragraph. */
#define CLEAR(f) { f, 0, 0, -1, 0, 0 }

/* Read a window to its end and stop there, without leaving whatever it opens
   behind it. A shopkeeper says something and his counter opens as the window
   closes, so CLEAR - which gets you back to the world - shuts the counter
   again, and the picture of it was a picture of the floor. */
#define READ(f) { f, 0, 0, -4, 0, 0 }

static const Step script[] = {
  { 6, 0, "01-title", 0, 0 },
  { 2, KEY_START, 0, 0, 0 },
  { 6, 0, "02-swear", 0, 0 },
  { 2, KEY_RIGHT, 0, 0, 0 },
  { 4, 0, 0, 0, 0 },
  { 2, KEY_RIGHT, 0, 0, 0 },
  { 6, 0, "03-tully", 0, 0 },
  /* And back to Stark before committing. The two presses above are there for
     the picture of somebody else's shield; every tile this route walks to
     afterwards is a tile in Winterfell, so it has to actually start there. */
  { 2, KEY_LEFT, 0, 0, 0 },
  { 4, 0, 0, 0, 0 },
  { 2, KEY_LEFT, 0, 0, 0 },
  { 4, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  /* Then your name, and then your arms, before a foot goes on any road.
   *
   * Swearing your sword used to be the last thing between the title and the
   * world, and this route pressed A and expected to be standing in a yard.
   * Two screens went in between and nothing here was told: every beat after
   * this one held its buttons at the letter grid, all nineteen pictures were
   * of the same screen, and the walk beats asked which way was open on a map
   * that had never been loaded, which is how a fixed route ends in a
   * segmentation fault instead of a report. */
  { 8, 0, "02c-your-name", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },              /* one letter, so the name is yours */
  { 4, 0, 0, 0, 0 },
  { 2, KEY_START, 0, 0, 0 },
  { 8, 0, "02d-your-arms", 0, 0 },
  { 2, KEY_RIGHT, 0, 0, 0 },          /* a charge that is not the default */
  { 4, 0, 0, 0, 0 },
  { 2, KEY_START, 0, 0, 0 },
  { 10, 0, "04-winterfell", 0, 0 },
  /* Whatever the first morning has to say, read and dismissed. Beginning the
     game puts a window up, and START into a window is not a menu: every beat
     below this one used to be pressed at a page of text nobody had turned. */
  CLEAR(900),
  /* Twice, with a pause between: the opening window is up the moment the game
     begins, and Winterfell's own scene does not fire until a frame or two
     after that. Clearing once cleared the window and walked straight into the
     cutscene. */
  { 60, 0, 0, 0, 0 },
  CLEAR(900),
  { 10, 0, 0, 0, 0 },
  /* The menu, the card, and the pouch. */
  { 2, KEY_START, 0, 0, 0 },
  { 6, 0, "05-menu", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, "06-sigil", 0, 0 },
  { 2, KEY_B, 0, 0, 0 },
  { 4, 0, 0, 0, 0 },
  /* Down to the pouch, which is the fourth line and used to be the second:
     "At Heel" and "Swords" went in above it and this route kept pressing down
     once and photographing whatever it landed on. */
  { 2, KEY_DOWN, 0, 0, 0 }, { 4, 0, 0, 0, 0 },
  { 2, KEY_DOWN, 0, 0, 0 }, { 4, 0, 0, 0, 0 },
  { 2, KEY_DOWN, 0, 0, 0 }, { 4, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, "07-pouch", 0, 0 },
  { 2, KEY_B, 0, 0, 0 },
  { 4, 0, 0, 0, 0 },
  { 2, KEY_B, 0, 0, 0 },
  { 6, 0, 0, 0, 0 },
  /* Somebody talking, caught mid-sentence. The maester, wherever he has got
     to - he roams, like most of this cast, and the tile he starts on stopped
     being where he is about two thousand frames ago. */
  TALK_TO(900, "Maester Luwin", 0),
  { 14, 0, "08-typing", 0, 0 },
  { 60, 0, "09-said", 0, 0 },
  CLEAR(600),
  /* Drawing on Theon, and the screen going with it. */
  FIGHT(900, "Theon Greyjoy", 0),
  /* The transition, at the two instants it is actually doing something. It
     runs to a written-down clock: white for four frames, dark for four, white
     again, and then sixteen frames fading to black before the duel. Both of
     these used to be counted from a guess and both landed in the gaps between
     - two pictures of an ordinary snowy morning. */
  { 1, 0, "10-the-flash", 0, 0 },     /* t = 2: the white */
  { 28, 0, "11-going-dark", 0, 0 },   /* t = 30: nearly out */
  { 14, 0, "12-the-yard", 0, 0 },     /* t = 44: the yard, and him in it */
  /* Whatever he has to say first, read to its end. A duel opens on a speech
     several pages long, and a fixed chain of A presses spent all of them in
     it: the three pictures below, of the menu and the blows and a blow
     landing, were three more pictures of Theon talking. */
  READ(600),
  { 6, 0, "13-what-to-do", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 10, 0, "14-which-blow", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 40, 0, "15-struck", 0, 0 },
  /* However long the rest of the fight takes. A fixed count of A presses is a
     guess at how many exchanges a duel runs to, and it was six. */
  CLEAR(4000),
  { 30, 0, "16-after", 0, 0 },
  /* The forge, and what is on the counter. */
  WALK_TO(900, 10, 6, 0),
  CLEAR(300),
  { 40, 0, "17-the-forge", 0, 0 },
  CLEAR(300),
  /* Mikken stands behind his own counter and is spoken to over it, which the
     game allows and a walk-up-alongside does not: pressing A at a counter
     leans across it. Naming him gets the route to the near side of it. */
  TALK_TO(900, "Mikken", 0),
  READ(600),
  { 30, 0, "18-the-counter", 0, 0 },
  { 2, KEY_DOWN, 0, 0, 0 },
  { 6, 0, 0, 0, 0 },
  { 2, KEY_DOWN, 0, 0, 0 },
  { 10, 0, "19-armour", 0, 0 },
};

static int beatAt, beatLeft;

#include "render.h"

static const unsigned WALK_KEYS[4] = { KEY_DOWN, KEY_UP, KEY_LEFT, KEY_RIGHT };

/* A beat that ran out of frames without doing what it was for.
 *
 * Everything that went wrong with this route went wrong quietly: a button
 * pressed at a wall, a walk to a tile nobody was standing on any more, a wait
 * for a window that never came. The run finished, said nothing, and wrote
 * nineteen pictures of the wrong thing. A beat that gives up now says so, so
 * the next person to move somebody in the map data finds out here rather than
 * from a folder of screenshots of a field. */
static int gaveUpCount;
static void gaveUp(const char *what, int frames) {
  gaveUpCount++;
  if (frames) printf("  GAVE UP  after %d frames trying to %s\n", frames, what ? what : "?");
  else printf("  GAVE UP  there is nobody here called %s\n", what ? what : "?");
}

/* Whichever of the people on this map is called that, and still standing. */
static int namedCrowd(const char *name) {
  int i;
  if (!name || !world) return -1;
  for (i = 0; i < crowdCount && i < MAX_CROWD; i++) {
    if (!crowdAlive[i]) continue;
    if (!strcmp(world->npcs[i].name, name)) return i;
  }
  return -1;
}

/* Where to put your feet to speak to somebody, and which way to face.
 *
 * Beside them, usually. Behind a counter, on the near side of it: a smith
 * stands behind his own and is leaned across, which the game allows and a
 * walk-up-alongside cannot - there is no walkable tile next to Mikken at all,
 * so a route that only knew how to stand beside people stood in the doorway of
 * the forge pressing A at nothing, and two of these pictures were of a floor.
 *
 * The nearest of the candidates, so the walk does not cross the room to reach
 * the far side of somebody standing in the open. */
static void standNear(int tx, int ty, int *sx, int *sy, int *face) {
  int hx = hero.px >> 4, hy = hero.py >> 4, d, best = -1, bestAt = 1 << 20;
  *sx = tx; *sy = ty; *face = 0;
  for (d = 0; d < 4; d++) {
    int nx = tx + DIR_X[d], ny = ty + DIR_Y[d], far;
    /* Only a wall disqualifies a spot. Asking `occupied` here rejected the
       tile the hero is already standing on - so arriving beside somebody made
       the route decide there was nowhere beside them, and it went looking for
       a counter that was not there. Anybody else in the way walks off. */
    if (solidAt(nx, ny)) {
      /* Across a counter: one further, and still facing back at them. */
      int bx = nx + DIR_X[d], by = ny + DIR_Y[d];
      if (nx < 0 || ny < 0 || nx >= world->w || ny >= world->h) continue;
      if (!world->counter[ny * world->w + nx]) continue;
      if (solidAt(bx, by)) continue;
      nx = bx; ny = by;
    }
    far = (nx > hx ? nx - hx : hx - nx) + (ny > hy ? ny - hy : hy - ny);
    if (far >= bestAt) continue;
    bestAt = far; best = d;
    *sx = nx; *sy = ny;
    *face = d ^ 1;                        /* back the way you came, at them */
  }
  if (best < 0) { *sx = hx; *sy = hy; }   /* nowhere to stand; do not wander */
}

/* One step of the greedy walk toward a tile: the longer leg first, then the
   other, then anywhere at all that is open. Shared by the beat that walks to a
   tile and the two that walk to a person. */
static unsigned stepToward(int tx, int ty) {
  int hx = hero.px >> 4, hy = hero.py >> 4;
  int wantV = ty > hy ? 0 : (ty < hy ? 1 : -1);
  int wantH = tx < hx ? 2 : (tx > hx ? 3 : -1);
  int want[8], n = 0, i;
  if (!world) return 0;
  if ((ty > hy ? ty - hy : hy - ty) > (tx > hx ? tx - hx : hx - tx)) {
    if (wantV >= 0) want[n++] = wantV;
    if (wantH >= 0) want[n++] = wantH;
  } else {
    if (wantH >= 0) want[n++] = wantH;
    if (wantV >= 0) want[n++] = wantV;
  }
  for (i = 0; i < 4; i++) want[n + i] = i;
  for (i = 0; i < n + 4; i++) {
    int d = want[i], nx = hx + DIR_X[d], ny = hy + DIR_Y[d];
    if (solidAt(nx, ny) || occupied(nx, ny, -1)) continue;
    return WALK_KEYS[d];
  }
  return 0;
}

/* Called at the top of every frame of the cartridge's own loop. */
void hostFrame(void) {
  while (beatLeft <= 0) {
    if (beatAt >= (int)(sizeof script / sizeof script[0])) { hostFramesLeft = 0; return; }
    beatLeft = script[beatAt].frames;
    beatAt++;
  }
  {
    const Step *beat = &script[beatAt - 1];
    unsigned keys = beat->keys;
    if (beat->gx == -1 || beat->gx == -4) {
      /* Two waits, both ending on a condition rather than on a count.
       *
       * CLEAR gets you back to the world, whatever is in the way: windows are
       * read with A, other screens are left with B, a duel is fought out with
       * A. READ only reads a window, and stops the moment it is done - because
       * a shopkeeper's line opens his counter as it closes, and CLEAR would
       * dutifully press B and shut the thing the next picture is of.
       *
       * The first version of CLEAR knew about windows and nothing else. The
       * maester who tells you something also sells remedies, so a second press
       * of A at him opened his counter, which this waited politely for until
       * the count ran out; everything after it was pressed at a shelf of
       * medicines, and the duel nine of these pictures are of never happened. */
      int reading = beat->gx == -4;
      int done = reading ? !windowOpen
                         : (scene == SCENE_WORLD && !windowOpen && cutAt < 0);
      unsigned k;
      if (done || beatLeft <= 1) {
        if (!done) gaveUp(reading ? "read a window to its end"
                                  : "get back to the world", beat->frames);
        beatLeft = 0;
        if (beat->shot) snapshot(beat->shot);
        REG_KEYINPUT = 0x03FF;
        frameNo++;
        return;
      }
      /* Tapped rather than held: every one of these presses is edge-triggered
         in the game, so a button held down is a button pressed once. */
      k = (frameNo & 3) ? 0u
        : (reading || scene == SCENE_DUEL || windowOpen) ? KEY_A
        : scene != SCENE_WORLD ? KEY_B : KEY_A;
      REG_KEYINPUT = (unsigned short)(~k & 0x03FF);
      beatLeft--;
      frameNo++;
      return;
    }
    if (beat->gx == -2 || beat->gx == -3) {
      /* Walk up to somebody by name and press the button. Ends the moment the
         press has done something - a window, a duel, any screen but the world
         - so whatever follows is measured from that and not from a count. */
      unsigned want = beat->gx == -2 ? KEY_A : KEY_SELECT;
      int who = namedCrowd(beat->who);
      unsigned k = 0;
      if (windowOpen || scene != SCENE_WORLD || shift || who < 0 || beatLeft <= 1) {
        if (who < 0) gaveUp(beat->who, 0);
        else if (beatLeft <= 1 && scene == SCENE_WORLD && !windowOpen && !shift) {
          gaveUp(beat->who, beat->frames);
        }
        beatLeft = 0;
        if (beat->shot) snapshot(beat->shot);
        REG_KEYINPUT = 0x03FF;
        frameNo++;
        return;
      }
      {
        int hx = hero.px >> 4, hy = hero.py >> 4;
        int tx = crowd[who].px >> 4, ty = crowd[who].py >> 4;
        int sx, sy, face;
        standNear(tx, ty, &sx, &sy, &face);
        if (hx == sx && hy == sy) {
          /* On the spot. Turn to face them if you are not, and then speak - on
             alternate frames, because a press held down is one press, and a
             press that landed on the wrong facing has to be made again. */
          if (hero.dir != (u8)face) k = WALK_KEYS[face];
          else if (!(frameNo & 1)) k = want;
        } else if (!hero.walk) {
          k = stepToward(sx, sy);
        }
      }
      REG_KEYINPUT = (unsigned short)(~k & 0x03FF);
      beatLeft--;
      frameNo++;
      return;
    }
    if (beat->gx || beat->gy) {
      keys = 0;
      /* A road you are walking has people on it. Fight whatever steps out, so
         the journey is a journey and not a single duel, and read whatever it
         leaves on the screen afterwards. */
      if (scene == 3 || windowOpen) {
        REG_KEYINPUT = (unsigned short)(~((frameNo & 3) ? 0u : KEY_A) & 0x03FF);
        beatLeft--;
        if (!beatLeft && beat->shot) snapshot(beat->shot);
        frameNo++;
        return;
      }
      /* Only once there is somewhere to walk.
       *
       * `world` is null until the first map is loaded, and every tile test
       * reads it. A route that asks which way is open before the game has put
       * you anywhere is reading tile nought of nothing - which is what this
       * did the day the opening grew a step, because the script walked the man
       * out of a screen he was no longer standing on. */
      if (world) keys = stepToward(beat->gx, beat->gy);
    }
    REG_KEYINPUT = (unsigned short)(~keys & 0x03FF);
    beatLeft--;
    if (!beatLeft && beat->shot) snapshot(beat->shot);
  }
  if (getenv("TRACE")) {
    printf("f%-4d keys %03x  px %3d py %3d dir %d walk %2d win %d\n",
      frameNo, script[beatAt - 1].keys, hero.px, hero.py, hero.dir, hero.walk, windowOpen);
  }
  frameNo++;
}

int main(int argc, char **argv) {
  int total = 0, i;
  outDir = argc > 1 ? argv[1] : ".";
  gbaMem = calloc(MEM_SPAN, 1);
  if (!gbaMem) { fprintf(stderr, "out of memory\n"); return 1; }
  REG_KEYINPUT = 0x03FF;

  for (i = 0; i < (int)(sizeof script / sizeof script[0]); i++) total += script[i].frames;
  hostFramesLeft = total + 2;

  printf("running %d frames of the cartridge\n", total);
  gba_main();
  if (gaveUpCount) {
    printf("%d beats gave up: the pictures above are not of what they say\n",
      gaveUpCount);
    return 1;
  }
  printf("done\n");
  return 0;
}
