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

typedef struct { int frames; unsigned keys; const char *shot; } Beat;

static const Beat script[] = {
  { 6,  0,          "00-title" },
  { 2,  KEY_START,  0 },
  { 6,  0,          "01-winterfell" },
  { 24, KEY_DOWN,   "02-at-the-maester" },
  { 2,  0,          0 },
  { 2,  KEY_A,      0 },
  { 6,  0,          "03-luwin-speaks" },
  { 2,  KEY_A,      0 },
  { 6,  0,          "04-luwin-continues" },
  { 2,  KEY_A,      0 },
  { 6,  0,          "05-window-closed" },
  { 56, KEY_UP,     "06-stopped-by-jory" },
  { 2,  0,          0 },
  { 2,  KEY_A,      0 },
  { 6,  0,          "07-jory-speaks" },
  { 2,  KEY_A,      0 },
  { 6,  0,          0 },
  { 2,  KEY_A,      0 },
  { 6,  0,          "08-window-closed" },
  { 24, KEY_LEFT,   0 },
  { 4,  KEY_UP,     "09-facing-the-sign" },
  { 2,  KEY_A,      0 },
  { 6,  0,          "10-reading-the-sign" },
  { 2,  KEY_A,      0 },
  { 6,  0,          "11-sign-closed" },
  { 8,  KEY_RIGHT,  0 },
  { 16, KEY_UP,     "12-through-the-door" },
  { 24, 0,          "13-the-forge" },
  { 16, KEY_DOWN,   0 },
  { 2,  KEY_A,      0 },
  { 8,  0,          "14-the-smith" },
  { 2,  KEY_A,      0 },
  { 8,  0,          0 },
  { 2,  KEY_A,      0 },
  { 8,  0,          0 },
  { 40, KEY_DOWN,   "15-back-outside" },
  { 6,  0,          0 },
  { 16, KEY_RIGHT,  0 },
  { 4,  0,          0 },
  { 24, KEY_DOWN,   0 },
  { 8,  KEY_LEFT,   0 },
  { 24, KEY_DOWN,   0 },
  { 8,  KEY_RIGHT,  0 },
  { 16, KEY_DOWN,   "16-the-wolfswood" },
  { 48, KEY_DOWN,   "17-under-the-trees" },
};

static int beatAt, beatLeft;

/* ------------------------------------------------------- the picture ----- */

static void toRgb(unsigned short c, unsigned char *out) {
  int r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
  out[0] = (unsigned char)((r << 3) | (r >> 2));
  out[1] = (unsigned char)((g << 3) | (g >> 2));
  out[2] = (unsigned char)((b << 3) | (b >> 2));
}

static const unsigned char *charTile(unsigned base, int tile, int x, int y) {
  return (const unsigned char *)HW(0x06000000u + base * 0x4000u) + tile * 64 + y * 8 + x;
}

/* Mode 0, both backgrounds 8bpp, objects one-dimensionally mapped: exactly the
   configuration the cartridge sets up, and nothing else. */
static void snapshot(const char *name) {
  static unsigned char rgb[160][240][3];
  const unsigned short *palBg = (const unsigned short *)HW(0x05000000);
  const unsigned short *palObj = (const unsigned short *)HW(0x05000200);
  unsigned short dispcnt = REG_DISPCNT;
  int x, y, i;

  for (y = 0; y < 160; y++) {
    for (x = 0; x < 240; x++) {
      unsigned short colour = palBg[0];

      if (!(dispcnt & 0x0080)) {
        /* BG0: the world. 64x64 tiles, four screenblocks, hardware-scrolled. */
        if (dispcnt & 0x0100) {
          unsigned cnt = REG_BG0CNT;
          unsigned chr = (cnt >> 2) & 3, scr = (cnt >> 8) & 31;
          int sx = (x + REG_BG0HOFS) & 511, sy = (y + REG_BG0VOFS) & 511;
          int tx = sx >> 3, ty = sy >> 3;
          const unsigned short *map = (const unsigned short *)HW(0x06000000u + scr * 0x800u);
          unsigned short e = map[((ty >> 5) << 11) + ((tx >> 5) << 10) + ((ty & 31) << 5) + (tx & 31)];
          unsigned char idx = *charTile(chr, e & 0x3FF, sx & 7, sy & 7);
          if (idx) colour = palBg[idx];
        }
        /* Objects: everybody standing on it. */
        if (dispcnt & 0x1000) {
          for (i = 127; i >= 0; i--) {
            const unsigned short *a = (const unsigned short *)HW(0x07000000) + i * 4;
            int oy, ox, tile, px, py, tx2, ty2, idx;
            if (a[0] & 0x0200) continue;                      /* hidden */
            oy = a[0] & 0xFF; if (oy > 191) oy -= 256;
            ox = a[1] & 0x1FF; if (ox > 271) ox -= 512;
            if (x < ox || x >= ox + 16 || y < oy || y >= oy + 32) continue;
            tile = a[2] & 0x3FF;
            px = x - ox; py = y - oy;
            tx2 = px >> 3; ty2 = py >> 3;
            /* 8bpp, one-dimensional: 2 character tiles across, 4 down. */
            idx = *((const unsigned char *)HW(0x06010000) + tile * 32
                    + (ty2 * 2 + tx2) * 64 + (py & 7) * 8 + (px & 7));
            if (idx) colour = palObj[idx];
          }
        }
        /* BG1: the words, in front of everything. */
        if (dispcnt & 0x0200) {
          unsigned cnt = REG_BG1CNT;
          unsigned chr = (cnt >> 2) & 3, scr = (cnt >> 8) & 31;
          int tx = x >> 3, ty = y >> 3;
          const unsigned short *map = (const unsigned short *)HW(0x06000000u + scr * 0x800u);
          unsigned short e = map[ty * 32 + tx];
          unsigned char idx = *charTile(chr, e & 0x3FF, x & 7, y & 7);
          if (idx) colour = palBg[idx];
        }
      } else {
        colour = 0x7FFF;
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
    printf("  %-20s frame %4d  %-16s hero %2d,%2d dir %d walk %d  window %d (line %d/%d)\n",
      name, frameNo, world ? world->name : "(title)", hero.px >> 4, hero.py >> 4, hero.dir, hero.walk,
      windowOpen, lineAt, lineCount);
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
    REG_KEYINPUT = (unsigned short)(~beat->keys & 0x03FF);
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
