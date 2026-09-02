/* A model of the picture processor, so what the cartridge left in video memory
 * can be looked at. Not an emulator: no timing, no DMA, no BIOS. It applies the
 * mode 0 compositing rules this cartridge configures and nothing else.
 */
#ifndef THRONEBOUND_RENDER_H
#define THRONEBOUND_RENDER_H

#include <stdio.h>
#include <stdlib.h>

static const char *outDir = ".";

/* ------------------------------------------------------- the picture ----- */

/* The last thing the hardware does to a colour: the brightness blend.
 *
 * BLDCNT selects it and BLDY says how far, nought to sixteen. Mode two lifts
 * every channel toward white by BLDY sixteenths of what is left in it; mode
 * three takes that fraction away. It is the whole of every fade in this game -
 * the white flash and the darkness a duel opens through, the screen going out
 * when you are put down - and this renderer had never drawn a frame of any of
 * it. The two pictures of a duel opening were pictures of an ordinary snowy
 * morning, and had been for as long as there had been duels. */
static void toRgb(unsigned short c, unsigned char *out) {
  int r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
  unsigned mode = (REG_BLDCNT >> 6) & 3;
  int y = REG_BLDY & 31;
  if (y > 16) y = 16;
  if (mode == 2 && y) {
    r += (31 - r) * y / 16; g += (31 - g) * y / 16; b += (31 - b) * y / 16;
  } else if (mode == 3 && y) {
    r -= r * y / 16; g -= g * y / 16; b -= b * y / 16;
  }
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

/* One-dimensional mapping: the character tiles of an object run left to right
   and then down, so where a pixel is depends on how wide the object is. Reading
   this wrong makes a small sprite show the tiles of whatever was stored after
   it, which is exactly the kind of lie a picture is not allowed to tell. */
static unsigned char obj4(int tile, int wide, int x, int y) {
  int tx = x >> 3, ty = y >> 3;
  unsigned char byte = *((const unsigned char *)HW(0x06010000) + tile * 32
                         + (ty * wide + tx) * 32 + (y & 7) * 4 + ((x & 7) >> 1));
  return (x & 1) ? (byte >> 4) : (byte & 15);
}

/* Shape in attribute nought, size in attribute one, as the hardware reads them. */
static const unsigned char OBJ_W[3][4] = { { 8, 16, 32, 64 }, { 16, 32, 32, 64 }, { 8, 8, 16, 32 } };
static const unsigned char OBJ_H[3][4] = { { 8, 16, 32, 64 }, { 8, 8, 16, 32 }, { 16, 32, 32, 64 } };

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
          int oy, ox, tile, bank, px, py, idx;
          int shape = (a[0] >> 14) & 3, size = (a[1] >> 14) & 3;
          int sprW, sprH, boxW, boxH;
          if (!(a[0] & 0x0100) && (a[0] & 0x0200)) continue;      /* hidden */
          if (shape > 2) continue;                                 /* not a shape */
          sprW = OBJ_W[shape][size]; sprH = OBJ_H[shape][size];
          boxW = sprW; boxH = sprH;
          /* Affine and double-size together give the object twice the room to
             be drawn in, which is what stops a scaled-up body being clipped. */
          if ((a[0] & 0x0300) == 0x0300) { boxW = sprW * 2; boxH = sprH * 2; }
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
            px = ((pa * sx) >> 8) + sprW / 2;
            py = ((pd * sy) >> 8) + sprH / 2;
            if (px < 0 || px >= sprW || py < 0 || py >= sprH) continue;
          }
          idx = obj4(tile, sprW >> 3, px, py);
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
    printf("  shot %-22s scene %d  %s\n", name, scene, world ? world->name : "(none)");
  }
}


#endif
