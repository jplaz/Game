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
typedef struct { int frames; unsigned keys; const char *shot; int gx, gy; } Beat;
#define WALK_TO(f, x, y, shot) { f, 0, shot, x, y }

static const Beat script[] = {
  { 6, 0, "01-title", 0, 0 },
  { 2, KEY_START, 0, 0, 0 },
  { 6, 0, "02-swear", 0, 0 },
  { 2, KEY_RIGHT, 0, 0, 0 },
  { 4, 0, 0, 0, 0 },
  { 2, KEY_RIGHT, 0, 0, 0 },
  { 6, 0, "03-tully", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 10, 0, "04-winterfell", 0, 0 },
  /* The menu, the card, and the pouch. */
  { 2, KEY_START, 0, 0, 0 },
  { 6, 0, "05-menu", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, "06-sigil", 0, 0 },
  { 2, KEY_B, 0, 0, 0 },
  { 4, 0, 0, 0, 0 },
  { 2, KEY_DOWN, 0, 0, 0 },
  { 4, 0, 0, 0, 0 },
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
    const Beat *beat = &script[beatAt - 1];
    unsigned keys = beat->keys;
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
      for (i = 0; i < n + 4; i++) {
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
