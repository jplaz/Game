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

int hostFramesLeft;
static int frameNo;
static const char *outDir;

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
  { 6, 0, "02-swear-stark", 0, 0 },
  { 2, KEY_RIGHT, 0, 0, 0 },
  { 4, 0, 0, 0, 0 },
  { 2, KEY_RIGHT, 0, 0, 0 },
  { 6, 0, "03-swear-tully", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, "04-winterfell", 0, 0 },
  { 48, KEY_DOWN, "05-walking", 0, 0 },
  { 4, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, "06-luwin-speaks", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, 0, 0, 0 },
  { 2, KEY_SELECT, 0, 0, 0 },
  { 8, 0, "07-maester-will-not-fight", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, 0, 0, 0 },
  { 118, KEY_UP, "08-at-jory", 0, 0 },
  { 4, 0, 0, 0, 0 },
  { 2, KEY_SELECT, 0, 0, 0 },
  { 8, 0, "09-duel-begins", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, "10-choose-a-technique", 0, 0 },
  { 2, KEY_DOWN, 0, 0, 0 },
  { 6, 0, "11-menu-moves", 0, 0 },
  { 2, KEY_UP, 0, 0, 0 },
  { 4, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, "12-you-swing", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, "13-they-swing", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, "14-back-to-the-menu", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 6, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 6, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 6, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 6, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 6, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 6, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 6, 0, 0, 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, "15-blows-traded", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, "16-jory-is-gone", 0, 0 },
  { 2, KEY_START, 0, 0, 0 },
  { 8, 0, "17-status", 0, 0 },
  { 2, KEY_START, 0, 0, 0 },
  { 8, 0, 0, 0, 0 },
  /* Indoors, which is a different map and a different set of tiles. */
  WALK_TO(200, 12, 6, 0),
  { 30, 0, "17b-the-great-keep", 0, 0 },
  WALK_TO(140, 8, 13, 0),
  { 30, 0, "17c-back-outside", 0, 0 },
  /* Draw on somebody, then think better of it. */
  WALK_TO(240, 15, 15, 0),
  { 6, 0, 0, 0, 0 },
  { 2, KEY_DOWN, 0, 0, 0 },
  { 20, 0, 0, 0, 0 },
  { 2, KEY_SELECT, 0, 0, 0 },
  { 8, 0, "17d-drawn-on-theon", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, 0, 0, 0 },
  { 2, KEY_B, 0, 0, 0 },
  { 10, 0, "17e-broke-off", 0, 0 },
  { 2, KEY_A, 0, 0, 0 },
  { 8, 0, 0, 0, 0 },
  { 8, KEY_LEFT, "18a-step", 0, 0 },
  { 8, KEY_LEFT, "18b-step", 0, 0 },
  { 8, KEY_LEFT, "18c-step", 0, 0 },
  { 8, KEY_LEFT, "18d-step", 0, 0 },
  { 8, KEY_DOWN, "19a-down", 0, 0 },
  { 8, KEY_DOWN, "19b-down", 0, 0 },
  { 200, 0, "20-the-town-moves", 0, 0 },
  { 200, 0, "21-the-town-moves-again", 0, 0 },
  /* Out of the yard and south, to prove the roads actually join up. */
  WALK_TO(240, 12, 18, 0),
  WALK_TO(60,  12, 19, "22-through-the-gate"),
  WALK_TO(700, 10, 24, "23-the-wolfswood"),
  WALK_TO(300, 10, 25, "24-further-south"),
};

static int beatAt, beatLeft;

/* ------------------------------------------------------- the picture ----- */

static void toRgb(unsigned short c, unsigned char *out) {
  int r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
  out[0] = (unsigned char)((r << 3) | (r >> 2));
  out[1] = (unsigned char)((g << 3) | (g >> 2));
  out[2] = (unsigned char)((b << 3) | (b >> 2));
}

/* Mode 0 as this cartridge configures it: BG0 eight bits a pixel from
   charblock 0, BG1 four bits a pixel from charblock 2, objects four bits a pixel
   one-dimensionally mapped, some of them scaled through affine set 0. */

static unsigned char bg8(unsigned chr, int tile, int x, int y) {
  return *((const unsigned char *)HW(0x06000000u + chr * 0x4000u) + tile * 64 + y * 8 + x);
}

static unsigned char bg4(unsigned chr, int tile, int x, int y) {
  unsigned char byte = *((const unsigned char *)HW(0x06000000u + chr * 0x4000u)
                         + tile * 32 + y * 4 + (x >> 1));
  return (x & 1) ? (byte >> 4) : (byte & 15);
}

static unsigned char obj4(int tile, int x, int y) {
  /* 16x32, one-dimensional: two character tiles across, four down. */
  int tx = x >> 3, ty = y >> 3;
  unsigned char byte = *((const unsigned char *)HW(0x06010000) + tile * 32
                         + (ty * 2 + tx) * 32 + (y & 7) * 4 + ((x & 7) >> 1));
  return (x & 1) ? (byte >> 4) : (byte & 15);
}

static void snapshot(const char *name) {
  static unsigned char rgb[160][240][3];
  const unsigned short *palBg = (const unsigned short *)HW(0x05000000);
  const unsigned short *palObj = (const unsigned short *)HW(0x05000200);
  const unsigned short *oamHw = (const unsigned short *)HW(0x07000000);
  unsigned short dispcnt = REG_DISPCNT;
  int x, y, i;

  for (y = 0; y < 160; y++) {
    for (x = 0; x < 240; x++) {
      unsigned short colour = palBg[0];

      if (dispcnt & 0x0080) { colour = 0x7FFF; toRgb(colour, rgb[y][x]); continue; }

      if (dispcnt & 0x0100) {                       /* BG0: the world */
        unsigned cnt = REG_BG0CNT;
        unsigned chr = (cnt >> 2) & 3, scr = (cnt >> 8) & 31;
        int sx = (x + REG_BG0HOFS) & 511, sy = (y + REG_BG0VOFS) & 511;
        int tx = sx >> 3, ty = sy >> 3;
        const unsigned short *map = (const unsigned short *)HW(0x06000000u + scr * 0x800u);
        unsigned short e = map[((ty >> 5) << 11) + ((tx >> 5) << 10) + ((ty & 31) << 5) + (tx & 31)];
        unsigned char idx = bg8(chr, e & 0x3FF, sx & 7, sy & 7);
        if (idx) colour = palBg[idx];
      }

      if (dispcnt & 0x1000) {                       /* objects: everybody */
        for (i = 127; i >= 0; i--) {
          const unsigned short *a = oamHw + i * 4;
          int oy, ox, tile, bank, px, py, idx, boxW = 16, boxH = 32;
          if (!(a[0] & 0x0100) && (a[0] & 0x0200)) continue;      /* hidden */
          if ((a[0] & 0x0300) == 0x0300) { boxW = 32; boxH = 64; }
          oy = a[0] & 0xFF; if (oy > 191) oy -= 256;
          ox = a[1] & 0x1FF; if (ox > 271) ox -= 512;
          if (x < ox || x >= ox + boxW || y < oy || y >= oy + boxH) continue;
          tile = a[2] & 0x3FF;
          bank = (a[2] >> 12) & 15;
          px = x - ox; py = y - oy;
          if (a[0] & 0x0100) {
            /* Affine set 0, which is all this cartridge uses. */
            int pa = (short)oamHw[3], pd = (short)oamHw[15];
            int sx = px - boxW / 2, sy = py - boxH / 2;
            px = ((pa * sx) >> 8) + 8;
            py = ((pd * sy) >> 8) + 16;
            if (px < 0 || px >= 16 || py < 0 || py >= 32) continue;
          }
          idx = obj4(tile, px, py);
          if (idx) colour = palObj[bank * 16 + idx];
        }
      }

      if (dispcnt & 0x0200) {                       /* BG1: the words, in front */
        unsigned cnt = REG_BG1CNT;
        unsigned chr = (cnt >> 2) & 3, scr = (cnt >> 8) & 31;
        int tx = x >> 3, ty = y >> 3;
        const unsigned short *map = (const unsigned short *)HW(0x06000000u + scr * 0x800u);
        unsigned short e = map[ty * 32 + tx];
        unsigned char idx = bg4(chr, e & 0x3FF, x & 7, y & 7);
        if (idx) colour = palBg[((e >> 12) & 15) * 16 + idx];
      }

      toRgb(colour, rgb[y][x]);
    }
  }

  {
    char path[512];
    FILE *f;
    snprintf(path, sizeof path, "%s/%s.ppm", outDir, name);
    f = fopen(path, "wb");
    if (!f) { perror(path); exit(1); }
    fprintf(f, "P6\n240 160\n255\n");
    fwrite(rgb, 1, sizeof rgb, f);
    fclose(f);
    printf("  %-26s f%-4d scene %d  %-14s hero %2d,%2d  win %d  duel %d  hp %d/%d\n",
      name, frameNo, scene, world ? world->name : "(none)", hero.px >> 4, hero.py >> 4,
      windowOpen, duelPhase, mine.hp, theirs.hp);
  }
}

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
