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
typedef struct { int frames; unsigned keys; const char *shot; int gx, gy; } Step;   /* not the cartridge Beat: that one is a cutscene */
#define WALK_TO(f, x, y, shot) { f, 0, shot, x, y }

/* Read whatever is on the screen and get back to the world, however long that
   takes, up to a limit.
 *
 * Every other beat here is a number of frames somebody counted once. That was
 * fine while the road between two screens was fixed; then beginning the game
 * grew an opening window and a cutscene at Winterfell, and every hard-counted
 * beat after it was pressed at a page of prose - so this route took nineteen
 * pictures of the same field and reported nothing wrong. A beat that waits for
 * a condition cannot be broken by somebody adding a paragraph. */
#define CLEAR(f) { f, 0, 0, -1, 0 }

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
  /* Somebody talking, caught mid-sentence. */
  WALK_TO(300, 12, 15, 0),
  { 6, KEY_DOWN, 0, 0, 0 },
  { 6, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 14, 0, "08-typing", 0, 0 },
  { 60, 0, "09-said", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 40, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 20, 0, 0, 0, 0 },
  /* Drawing on Theon, and the screen going with it. */
  WALK_TO(400, 15, 15, 0),
  { 6, KEY_DOWN, 0, 0, 0 },
  { 6, 0, 0, 0, 0 },
  { 2, KEY_SELECT, 0, 0, 0 },
  { 3, 0, "10-the-flash", 0, 0 },
  { 22, 0, "11-going-dark", 0, 0 },
  { 40, 0, "12-the-yard", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 40, 0, "13-what-to-do", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 10, 0, "14-which-blow", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 50, 0, "15-struck", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 50, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 50, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 50, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 50, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 50, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 60, 0, "16-after", 0, 0 },
  /* The forge, and what is on the counter. */
  WALK_TO(600, 10, 6, 0),
  { 40, 0, "17-the-forge", 0, 0 },
  WALK_TO(400, 7, 2, 0),
  { 6, KEY_UP, 0, 0, 0 },
  { 6, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 90, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 60, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 30, 0, "18-the-counter", 0, 0 },
  { 2, KEY_DOWN, 0, 0, 0 },
  { 6, 0, 0, 0, 0 },
  { 2, KEY_DOWN, 0, 0, 0 },
  { 10, 0, "19-armour", 0, 0 },
};

static int beatAt, beatLeft;

#include "render.h"

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
    if (beat->gx < 0) {
      /* Hold A through anything the game wants read, and end the moment the
         world is yours again rather than when a count runs out. */
      if (windowOpen || cutAt >= 0) {
        REG_KEYINPUT = (unsigned short)(~((frameNo & 3) ? 0u : KEY_A) & 0x03FF);
        beatLeft--;
        frameNo++;
        return;
      }
      beatLeft = 0;
      if (beat->shot) snapshot(beat->shot);
      REG_KEYINPUT = 0x03FF;
      frameNo++;
      return;
    }
    if (beat->gx || beat->gy) {
      static const unsigned KEYS[4] = { KEY_DOWN, KEY_UP, KEY_LEFT, KEY_RIGHT };
      int hx = hero.px >> 4, hy = hero.py >> 4;
      int wantV = beat->gy > hy ? 0 : (beat->gy < hy ? 1 : -1);
      int wantH = beat->gx < hx ? 2 : (beat->gx > hx ? 3 : -1);
      int want[8], n = 0, i;   /* two preferred directions, then all four */
      /* The longer leg first, then the other, then anywhere that is open —
         somebody wandering across the road should not end the journey. */
      if ((beat->gy > hy ? beat->gy - hy : hy - beat->gy)
        > (beat->gx > hx ? beat->gx - hx : hx - beat->gx)) {
        if (wantV >= 0) want[n++] = wantV;
        if (wantH >= 0) want[n++] = wantH;
      } else {
        if (wantH >= 0) want[n++] = wantH;
        if (wantV >= 0) want[n++] = wantV;
      }
      for (i = 0; i < 4; i++) want[n + i] = i;
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
       * `world` is null until the first map is loaded, and every one of these
       * tests reads it. A route that asks which way is open before the game
       * has put you anywhere is reading tile nought of nothing - which is what
       * this did the day the opening grew a step, because the script walked
       * the man out of a screen he was no longer standing on. */
      for (i = 0; world && i < n + 4; i++) {
        int d = want[i];
        int nx = hx + DIR_X[d], ny = hy + DIR_Y[d];
        if (solidAt(nx, ny) || occupied(nx, ny, -1)) continue;
        keys = KEYS[d];
        break;
      }
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
  printf("done\n");
  return 0;
}
