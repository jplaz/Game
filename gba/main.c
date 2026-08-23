/* A Song of Ice and Monsters — the cartridge.
 *
 * Swear to a house, walk the North, and fight anyone who will draw on you. The
 * art, the maps, the people, the writing, the techniques and everyone's numbers
 * are exported out of the browser game by gba/export.mjs; this file is only the
 * machine that runs them.
 *
 * Mode 0 throughout. BG0 is the world, eight bits a pixel, hardware-scrolled,
 * with the map you are standing on resident in video memory and the rest in ROM.
 * BG1 is a text layer whose character tiles are drawn into at runtime. Everyone
 * on screen is an object, four bits a pixel with a palette bank apiece, which is
 * what lets a town's worth of different people be resident at once. */

#include "data.h"
#include "build.h"


typedef signed short   s16;
typedef signed int     s32;

/* --------------------------------------------------------------- hardware -- */

/* On the cartridge these are the hardware's own addresses. Built for the host
   test they are offsets into a stand-in for the same address space, so the very
   same code can be run and its output looked at without a handset. */
#ifdef HOST_TEST
extern unsigned char *gbaMem;             /* covers 0x04000000 .. 0x07000400 */
#define HW(a) ((void *)(gbaMem + ((unsigned)(a) - 0x04000000u)))
#else
#define HW(a) ((void *)(a))
#endif

#define REG16(a)  (*(volatile u16 *)HW(a))

#define REG_DISPCNT   REG16(0x04000000)
#define REG_VCOUNT    REG16(0x04000006)
#define REG_BG0CNT    REG16(0x04000008)
#define REG_BG1CNT    REG16(0x0400000A)
#define REG_BG0HOFS   REG16(0x04000010)
#define REG_BG0VOFS   REG16(0x04000012)
#define REG_BG1HOFS   REG16(0x04000014)
#define REG_BG1VOFS   REG16(0x04000016)
#define REG_BLDCNT    REG16(0x04000050)
#define REG_BLDY      REG16(0x04000054)
#define REG_KEYINPUT  REG16(0x04000130)

/* The four programmable sound generators. Direct Sound wants samples in ROM and
   a DMA feeding them; these four are just registers, which is what a cartridge
   this size can afford. */
#define REG_SND1_SWEEP REG16(0x04000060)
#define REG_SND1_ENV   REG16(0x04000062)
#define REG_SND1_FREQ  REG16(0x04000064)
#define REG_SND2_ENV   REG16(0x04000068)
#define REG_SND2_FREQ  REG16(0x0400006C)
#define REG_SND4_ENV   REG16(0x04000078)
#define REG_SND4_FREQ  REG16(0x0400007C)
#define REG_SNDCNT_L   REG16(0x04000080)
#define REG_SNDCNT_H   REG16(0x04000082)
#define REG_SNDCNT_X   REG16(0x04000084)

#define PAL_BG        ((volatile u16 *)HW(0x05000000))
#define PAL_OBJ       ((volatile u16 *)HW(0x05000200))
#define VRAM_BG_CHR   ((volatile u32 *)HW(0x06000000))   /* charblocks 0-1: the world */
#define VRAM_TXT_CHR  ((volatile u32 *)HW(0x06008000))   /* charblock 2: text tiles   */
#define VRAM_TXT_MAP  ((volatile u16 *)HW(0x0600D800))   /* screenblock 27            */
#define VRAM_BG_MAP   ((volatile u16 *)HW(0x0600E000))   /* screenblocks 28-31        */
#define VRAM_OBJ      ((volatile u32 *)HW(0x06010000))
#define OAM           ((volatile u16 *)HW(0x07000000))

#define KEY_A 1
#define KEY_B 2
#define KEY_SELECT 4
#define KEY_START 8
#define KEY_RIGHT 16
#define KEY_LEFT 32
#define KEY_UP 64
#define KEY_DOWN 128

#define SCREEN_W 240
#define SCREEN_H 160

/* The text layer's own palette bank, which is why the world's art is quantised
   into 239 colours and not 255. */
#define TXT_BANK 15
#define C_CLEAR 0
#define C_FILL  1
#define C_DEEP  2
#define C_EDGE  3
#define C_INK   4
#define C_SHADE 5
#define C_GOLD  6
#define C_HOUSE 7
#define C_TRIM  8
#define C_WELL  9
#define C_HURT  10
#define C_DYING 11
#define C_BACK  12
#define C_DIM   13
#define C_NIGHT 14
#define C_EARTH 15
#define C_RAIL 9      /* shares the healthy green; a rail is never red */

#define RGB15(r, g, b) ((u16)((r) | ((g) << 5) | ((b) << 10)))

#ifndef HOST_TEST
/* clang emits these for struct assignment and array clears even freestanding. */
void *memcpy(void *dst, const void *src, unsigned n) {
  u8 *d = dst; const u8 *s = src;
  while (n--) *d++ = *s++;
  return dst;
}
void *memset(void *dst, int c, unsigned n) {
  u8 *d = dst;
  while (n--) *d++ = (u8)c;
  return dst;
}
#endif

static void waitVBlank(void) {
#ifndef HOST_TEST
  while (REG_VCOUNT >= 160) { }
  while (REG_VCOUNT < 160) { }
#endif
}

/* Freestanding on an ARM7 there is no divide instruction and no library to call,
   so the two places that need one by a value not known at compile time get this. */
static u32 udiv(u32 n, u32 d) {
  u32 q = 0, bit = 1;
  if (!d) return 0;
  while (d < n && !(d & 0x80000000u)) { d <<= 1; bit <<= 1; }
  while (bit) {
    if (n >= d) { n -= d; q |= bit; }
    d >>= 1; bit >>= 1;
  }
  return q;
}

/* ------------------------------------------------------------------ luck --- */

static u32 seed = 0x1BADF00Du;

static u32 roll(u32 range) {
  seed = seed * 1664525u + 1013904223u;
  /* Multiply and shift rather than divide: there is no divide instruction. */
  return range ? (((seed >> 16) & 0xFFFFu) * range) >> 16 : 0;
}

/* ----------------------------------------------------------------- sound --- */
/* Four channels, no samples: square one carries the tune, square two the bass
   under it and any sting that wants a pitch, and the noise channel is every
   blow that lands and every drum. A sting borrows a channel for as long as it
   lasts and the tune goes quiet on that channel until it is done, which is the
   old trick and costs nothing.

   A rate is what the hardware wants instead of a frequency: 2048 - 131072/Hz.
   NOTES runs C3 up to B5; 254 holds the note already sounding, 255 rests. */

#define HOLD 254
#define REST 255

static const u16 NOTES[36] = {
  1046, 1102, 1155, 1205, 1253, 1297, 1340, 1379, 1417, 1452, 1486, 1517,
  1547, 1575, 1602, 1627, 1650, 1673, 1694, 1714, 1732, 1750, 1767, 1783,
  1798, 1812, 1825, 1837, 1849, 1860, 1871, 1881, 1890, 1899, 1907, 1915,
};

/* Scale degrees, so the tunes below read as music rather than as numbers. */
#define C3 0
#define D3 2
#define Eb3 3
#define F3 5
#define G3 7
#define Ab3 8
#define Bb3 10
#define C4 12
#define D4 14
#define Eb4 15
#define F4 17
#define G4 19
#define Ab4 20
#define Bb4 22
#define C5 24
#define D5 26
#define Eb5 27
#define G5 31

typedef struct {
  const u8 *tune;      /* square one */
  const u8 *under;     /* square two */
  const u8 *drum;      /* noise: 0 quiet, 1 tap, 2 hit */
  u8 steps;            /* how many entries before it comes round again */
  u8 frames;           /* frames a step lasts */
  u8 duty;             /* square wave duty, 0..3 */
} Tune;

/* Winterfell and the road: slow, in C minor, meant to be lived under rather
   than listened to. */
static const u8 ROAD_TUNE[32] = {
  G4, HOLD, Eb4, HOLD, C4, HOLD, Eb4, HOLD,
  F4, HOLD, Eb4, HOLD, D4, HOLD, HOLD, HOLD,
  Eb4, HOLD, G4, HOLD, Ab4, HOLD, G4, HOLD,
  F4, HOLD, D4, HOLD, C4, HOLD, HOLD, HOLD,
};
static const u8 ROAD_UNDER[32] = {
  C3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  F3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  Ab3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  G3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
};
static const u8 ROAD_DRUM[32] = {
  1, 0, 0, 0, 0, 0, 1, 0,  1, 0, 0, 0, 0, 0, 1, 0,
  1, 0, 0, 0, 0, 0, 1, 0,  1, 0, 0, 0, 1, 0, 1, 0,
};

/* Steel drawn: the same key, twice the speed, and it will not sit still. */
static const u8 DUEL_TUNE[32] = {
  C4, Eb4, G4, Eb4, C4, Eb4, G4, Bb4,
  C5, Bb4, G4, Eb4, C4, HOLD, HOLD, REST,
  F4, Ab4, C5, Ab4, F4, Ab4, C5, Eb4,
  D4, F4, Ab4, F4, D4, HOLD, HOLD, REST,
};
static const u8 DUEL_UNDER[32] = {
  C3, REST, C3, REST, C3, REST, C3, REST,
  Ab3, REST, Ab3, REST, G3, REST, G3, REST,
  F3, REST, F3, REST, F3, REST, F3, REST,
  D3, REST, D3, REST, G3, REST, G3, REST,
};
static const u8 DUEL_DRUM[32] = {
  2, 0, 1, 0, 2, 0, 1, 1,  2, 0, 1, 0, 2, 0, 1, 0,
  2, 0, 1, 0, 2, 0, 1, 1,  2, 0, 1, 0, 2, 1, 1, 1,
};

/* The title card: stately, and it takes its time. */
static const u8 HALL_TUNE[32] = {
  C4, HOLD, HOLD, HOLD, Eb4, HOLD, G4, HOLD,
  Ab4, HOLD, HOLD, G4, F4, HOLD, HOLD, REST,
  D4, HOLD, HOLD, HOLD, F4, HOLD, Ab4, HOLD,
  Bb4, HOLD, HOLD, Ab4, G4, HOLD, HOLD, REST,
};
static const u8 HALL_UNDER[32] = {
  C3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  F3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  Bb3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  G3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
};
static const u8 HALL_DRUM[32] = { 0 };

static const Tune TUNES[3] = {
  { ROAD_TUNE, ROAD_UNDER, ROAD_DRUM, 32, 11, 2 },
  { DUEL_TUNE, DUEL_UNDER, DUEL_DRUM, 32,  6, 1 },
  { HALL_TUNE, HALL_UNDER, HALL_DRUM, 32, 16, 2 },
};

#define TUNE_ROAD 0
#define TUNE_DUEL 1
#define TUNE_HALL 2

static int tunePlaying = -1, tuneStep, tuneWait;
static int stingLeft, drumLeft;

static void soundUp(void) {
  REG_SNDCNT_X = 0x0080;                     /* the sound hardware at all */
  REG_SNDCNT_L = (u16)(0x7700 | 0x0077);     /* both squares and the noise, both ears */
  REG_SNDCNT_H = 0x0002;                     /* the four generators at full */
  REG_SND1_SWEEP = 0;
}

/* A note on square one or two: duty, an envelope that decays, then the rate
   with the restart bit set. */
static void voice(int chan, int note, int duty, int vol, int decay) {
  u16 env = (u16)((duty << 6) | (vol << 12) | (decay << 8));
  u16 freq = (u16)(NOTES[note] | 0x8000);
  if (chan == 1) { REG_SND1_ENV = env; REG_SND1_FREQ = freq; }
  else { REG_SND2_ENV = env; REG_SND2_FREQ = freq; }
}

static void hush(int chan) {
  if (chan == 1) REG_SND1_ENV = 0;
  else if (chan == 2) REG_SND2_ENV = 0;
  else REG_SND4_ENV = 0;
}

/* The noise channel, which is every drum and every blow. */
static void knock(int hard) {
  REG_SND4_ENV = (u16)(hard ? (12 << 12) | (2 << 8) : (7 << 12) | (1 << 8));
  REG_SND4_FREQ = (u16)((hard ? 0x0034 : 0x0051) | 0x8000);
}

static void playTune(int which) {
  if (which == tunePlaying) return;
  tunePlaying = which;
  tuneStep = 0;
  tuneWait = 0;
  if (which < 0) { hush(1); hush(2); hush(4); }
}

/* Stings borrow a channel. The tune stays off it until the sting is spent, so
   a blow landing is never chopped in half by the next quaver. */
static const u8 SFX_WON[6]   = { C4, Eb4, G4, C5, G4, C5 };
static const u8 SFX_RANK[6]  = { G4, C5, Eb5, G5, Eb5, G5 };
static const u8 SFX_LOST[6]  = { G4, F4, Eb4, D4, C4, C4 };
static const u8 SFX_DOOR[2]  = { G4, C4 };
static const u8 SFX_YES[2]   = { C5, G5 };

static const u8 *sting;
static int stingLen, stingAt, stingWait, stingHold;

static void playSting(const u8 *notes, int len, int hold) {
  sting = notes; stingLen = len; stingAt = 0; stingWait = 0; stingHold = hold;
  stingLeft = len * hold;
}

static void sfxPick(void)  { REG_SND4_ENV = (u16)((5 << 12) | (1 << 8)); REG_SND4_FREQ = (u16)(0x0022 | 0x8000); drumLeft = 4; }
static void sfxYes(void)   { playSting(SFX_YES, 2, 5); }
static void sfxDoor(void)  { playSting(SFX_DOOR, 2, 7); }
static void sfxWon(void)   { playSting(SFX_WON, 6, 9); }
static void sfxRank(void)  { playSting(SFX_RANK, 6, 8); }
static void sfxLost(void)  { playSting(SFX_LOST, 6, 11); }
static void sfxHit(int hard) { knock(hard); drumLeft = hard ? 10 : 6; }

/* One frame of whatever is sounding. */
static void tickSound(void) {
  const Tune *t;

  if (stingLeft) {
    stingLeft--;
    if (!stingWait) {
      if (stingAt < stingLen) voice(2, sting[stingAt++], 2, 11, 2);
      stingWait = stingHold;
    }
    stingWait--;
    if (!stingLeft) hush(2);
  }
  if (drumLeft && !--drumLeft) hush(4);

  if (tunePlaying < 0) return;
  t = &TUNES[tunePlaying];
  if (tuneWait) { tuneWait--; return; }
  {
    u8 lead = t->tune[tuneStep];
    u8 low = t->under[tuneStep];
    u8 beat = t->drum[tuneStep];
    if (lead != HOLD) {
      if (lead == REST) hush(1);
      else voice(1, lead, t->duty, 9, 3);
    }
    if (!stingLeft && low != HOLD) {
      if (low == REST) hush(2);
      else voice(2, low, 3, 7, 4);
    }
    if (!drumLeft && beat) { knock(beat == 2); drumLeft = t->frames - 1; }
  }
  tuneWait = t->frames - 1;
  tuneStep++;
  if (tuneStep >= t->steps) tuneStep = 0;
}

/* ------------------------------------------------------------- the text ---- */
/* A page of 4bpp character tiles, drawn into directly rather than through a
   byte-per-pixel buffer, so pushing it to video memory is a straight copy. */

#define TXT_COLS 30
#define TXT_ROWS 14
#define TXT_W (TXT_COLS * 8)
#define TXT_H (TXT_ROWS * 8)
#define TXT_TILES (TXT_COLS * TXT_ROWS)

static u8 pageTiles[TXT_TILES][32];
static int dirtyLo = TXT_TILES, dirtyHi = -1;

static void touch(int tile) {
  if (tile < dirtyLo) dirtyLo = tile;
  if (tile > dirtyHi) dirtyHi = tile;
}

static void plot(int x, int y, u8 colour) {
  int tile, at;
  if (x < 0 || y < 0 || x >= TXT_W || y >= TXT_H) return;
  tile = (y >> 3) * TXT_COLS + (x >> 3);
  at = (y & 7) * 4 + ((x & 7) >> 1);
  if (x & 1) pageTiles[tile][at] = (u8)((pageTiles[tile][at] & 0x0F) | (colour << 4));
  else pageTiles[tile][at] = (u8)((pageTiles[tile][at] & 0xF0) | colour);
  touch(tile);
}

static void fillRect(int x, int y, int w, int h, u8 colour) {
  int iy, ix;
  for (iy = y; iy < y + h; iy++) for (ix = x; ix < x + w; ix++) plot(ix, iy, colour);
}

static void clearPage(void) {
  int i, j;
  for (i = 0; i < TXT_TILES; i++) for (j = 0; j < 32; j++) pageTiles[i][j] = 0;
  dirtyLo = 0; dirtyHi = TXT_TILES - 1;
}

static void clearRows(int y, int h) { fillRect(0, y, TXT_W, h, C_CLEAR); }

static void flushPage(void) {
  int i, w;
  if (dirtyHi < dirtyLo) return;
  for (i = dirtyLo; i <= dirtyHi; i++) {
    const u8 *src = pageTiles[i];
    volatile u32 *out = VRAM_TXT_CHR + (i + 1) * 8;      /* tile 0 stays blank */
    for (w = 0; w < 32; w += 4) {
      *out++ = (u32)src[w] | ((u32)src[w + 1] << 8)
             | ((u32)src[w + 2] << 16) | ((u32)src[w + 3] << 24);
    }
  }
  dirtyLo = TXT_TILES; dirtyHi = -1;
}

/* ---------------------------------------------------------------- glyphs --- */

static s8 glyphOf[128];

static void buildGlyphTable(void) {
  int i;
  for (i = 0; i < 128; i++) glyphOf[i] = 0;
  for (i = 0; i < FONT_COUNT; i++) {
    u8 c = (u8)font_chars[i];
    if (c < 128) glyphOf[c] = (s8)i;
  }
}

static int charWidth(char c) { return font_advance[(int)glyphOf[(u8)c & 127]]; }

static int textWidth(const char *s) {
  int w = 0;
  while (*s) w += charWidth(*s++);
  return w;
}

/* One pass for the drop shadow, then one for the ink, so a letter's shadow can
   never land on top of the letter before it. */
static void drawText(int x, int y, const char *s, u8 ink) {
  const char *p;
  int at, row, col, pass;
  for (pass = 0; pass < 2; pass++) {
    for (p = s, at = x; *p; p++) {
      int g = glyphOf[(u8)*p & 127];
      for (row = 0; row < FONT_ROWS; row++) {
        u16 bits = font_rows[g][row];
        for (col = 0; bits >> col; col++) {
          if (!((bits >> col) & 1)) continue;
          if (pass) plot(at + col, y + row, ink);
          else plot(at + col + 1, y + row + 1, C_SHADE);
        }
      }
      at += font_advance[g];
    }
  }
}

/* One letter, and how far the next one starts along. Text is typed out rather
   than stamped, so this is the piece the window actually uses. */
static int drawGlyph(int x, int y, char c, u8 ink) {
  int g = glyphOf[(u8)c & 127], row, col, pass;
  for (pass = 0; pass < 2; pass++) {
    for (row = 0; row < FONT_ROWS; row++) {
      u16 bits = font_rows[g][row];
      for (col = 0; bits >> col; col++) {
        if (!((bits >> col) & 1)) continue;
        if (pass) plot(x + col, y + row, ink);
        else plot(x + col + 1, y + row + 1, C_SHADE);
      }
    }
  }
  return font_advance[g];
}

static void centreText(int y, const char *s, u8 ink) {
  drawText((TXT_W - textWidth(s)) >> 1, y, s, ink);
}

/* A window built the way the handhelds build one: a dark keyline, a coloured
   band, a second keyline, then the panel — and the corners knocked off so it
   does not read as a rectangle drawn over the world. */
static void drawFrame(int x, int y, int w, int h) {
  fillRect(x, y, w, h, C_DEEP);
  fillRect(x + 1, y + 1, w - 2, h - 2, C_EDGE);
  fillRect(x + 3, y + 3, w - 6, h - 6, C_DEEP);
  fillRect(x + 4, y + 4, w - 8, h - 8, C_FILL);
  plot(x, y, C_CLEAR); plot(x + w - 1, y, C_CLEAR);
  plot(x, y + h - 1, C_CLEAR); plot(x + w - 1, y + h - 1, C_CLEAR);
  plot(x + 1, y + 1, C_DEEP); plot(x + w - 2, y + 1, C_DEEP);
  plot(x + 1, y + h - 2, C_DEEP); plot(x + w - 2, y + h - 2, C_DEEP);
}

/* Which screen rows the fourteen page rows are shown on. */
#define TEXT_PLAY 0
#define TEXT_MIDDLE 1
#define TEXT_DUEL 2
#define TEXT_TOP 3

static void layoutTextRows(int mode) {
  int ty, tx;
  for (ty = 0; ty < 32; ty++) {
    for (tx = 0; tx < 32; tx++) {
      int buf = -1;
      if (mode == TEXT_MIDDLE) { if (ty >= 3 && ty < 17) buf = ty - 3; }
      else if (mode == TEXT_TOP) { if (ty < 14) buf = ty; }
      else if (mode == TEXT_DUEL) {
        /* Four rows of foe plate at the top, then the yard, then your own plate
           and what is being said. The yard used to get forty-eight pixels and
           the text box eighty, so a duel was a caption with two small figures
           over it. The yard gets sixty-four now, which is exactly the height of
           the two of you at full size. */
        if (ty < 4) buf = ty;
        else if (ty >= 12 && ty < 20) buf = ty - 8;
      } else {
        if (ty < 2) buf = ty;
        else if (ty >= 14 && ty < 20) buf = ty - 12;
      }
      VRAM_TXT_MAP[ty * 32 + tx] = (buf >= 0 && tx < TXT_COLS)
        ? (u16)((1 + buf * TXT_COLS + tx) | (TXT_BANK << 12)) : 0;
    }
  }
}

/* ---------------------------------------------------------------- words ---- */

#define MAX_LINES 20
#define LINE_CHARS 46

static char lines[MAX_LINES][LINE_CHARS];
static int lineCount, lineAt;
static const char *speaker;
static int windowOpen;
static int windowTop, windowRows;
static u32 frameClock;

static void wrapText(const char *s, int width) {
  char word[LINE_CHARS];
  int wordLen = 0, cur = 0;
  lineCount = 0;
  lines[0][0] = 0;

  for (;;) {
    char c = *s;
    if (c && c != ' ' && c != '\n') {
      if (wordLen < LINE_CHARS - 1) word[wordLen++] = c;
      s++;
      continue;
    }
    word[wordLen] = 0;
    if (wordLen) {
      int need = textWidth(word) + (cur ? charWidth(' ') : 0);
      if (cur && textWidth(lines[lineCount]) + need > width) {
        if (lineCount < MAX_LINES - 1) lineCount++;
        lines[lineCount][0] = 0;
        cur = 0;
      }
      {
        char *dst = lines[lineCount];
        int at = 0, i = 0;
        while (dst[at]) at++;
        if (at && at < LINE_CHARS - 2) dst[at++] = ' ';
        while (word[i] && at < LINE_CHARS - 1) dst[at++] = word[i++];
        dst[at] = 0;
        cur = at;
      }
      wordLen = 0;
    }
    if (!c) break;
    if (c == '\n' && lineCount < MAX_LINES - 1) {
      lineCount++;
      lines[lineCount][0] = 0;
      cur = 0;
    }
    s++;
  }
  lineCount++;
}

static int bodyRows(void) { return speaker ? 2 : 3; }

/* Where the next letter goes. */
static int typeLine, typeCol, typeX, typeY, typeDone, markerOn;

static void paintWindow(void) {
  clearRows(windowTop, windowRows * 8);
  drawFrame(2, windowTop, TXT_W - 4, windowRows * 8 - 1);
  typeY = windowTop + 7;
  if (speaker) { drawText(12, typeY, speaker, C_GOLD); typeY += 12; }
  typeLine = 0; typeCol = 0; typeX = 12; typeDone = 0; markerOn = 0;
}

/* The little wedge under the last line, which blinks while it waits for you. */
static void drawMarker(int on) {
  int wx = TXT_W - 18, wy = windowTop + windowRows * 8 - 9;
  fillRect(wx, wy, 7, 4, C_FILL);
  if (!on) return;
  fillRect(wx, wy, 7, 1, C_GOLD);
  fillRect(wx + 1, wy + 1, 5, 1, C_GOLD);
  fillRect(wx + 2, wy + 2, 3, 1, C_GOLD);
  fillRect(wx + 3, wy + 3, 1, 1, C_GOLD);
}

/* Lays down the next few letters. Returns 1 while there is still typing to do. */
static int typeOn(int letters) {
  while (letters-- > 0) {
    const char *line;
    if (typeDone) return 0;
    if (typeLine >= bodyRows() || lineAt + typeLine >= lineCount) { typeDone = 1; return 0; }
    line = lines[lineAt + typeLine];
    if (!line[typeCol]) {
      typeLine++; typeCol = 0; typeX = 12; typeY += 12;
      continue;
    }
    typeX += drawGlyph(typeX, typeY, line[typeCol], C_INK);
    typeCol++;
  }
  return 1;
}

static void finishPage(void) {
  while (typeOn(1)) { }
}

static void openWindowAt(const char *name, const char *body, int top, int rows) {
  speaker = (name && name[0]) ? name : 0;
  windowTop = top; windowRows = rows;
  wrapText(body, TXT_W - 22);
  lineAt = 0;
  windowOpen = 1;
  paintWindow();
}

static void openWindow(const char *name, const char *body) {
  openWindowAt(name, body, 16, 6);
}

/* A press either hurries the typing along or turns the page. */
static int advanceWindow(void) {
  if (!typeDone) { finishPage(); return 1; }
  lineAt += bodyRows();
  if (lineAt >= lineCount) {
    windowOpen = 0;
    clearRows(windowTop, windowRows * 8);
    return 0;
  }
  paintWindow();
  return 1;
}

/* Called every frame a window is up: types, then blinks. */
static void tickWindow(int hurry) {
  if (!windowOpen) return;
  if (typeOn(hurry ? 3 : 1)) return;
  if (lineAt + bodyRows() < lineCount) {
    int on = (frameClock >> 4) & 1;
    if (on != markerOn) { markerOn = on; drawMarker(on); }
  }
}

/* The pointer that sits beside whatever is chosen. */
static void drawCursor(int x, int y, u8 colour) {
  fillRect(x, y, 2, 7, colour);
  fillRect(x + 2, y + 1, 2, 5, colour);
  fillRect(x + 4, y + 2, 2, 3, colour);
  fillRect(x + 6, y + 3, 1, 1, colour);
}

/* Six rows of a list, with the chosen one kept in view. */
#define LIST_ROWS 6

static int listTop(int pick, int count) {
  int top = pick - (LIST_ROWS >> 1);
  if (top > count - LIST_ROWS) top = count - LIST_ROWS;
  if (top < 0) top = 0;
  return top;
}

/* ---------------------------------------------------------------- plate ---- */

static int plateTimer;

/* The name of wherever you have just walked into. It only has two rows of the
   page to live in, so it carries a thinner frame than a window does. */
static void drawPlate(int x, int y, int w, int h) {
  fillRect(x, y, w, h, C_DEEP);
  fillRect(x + 1, y + 1, w - 2, h - 2, C_EDGE);
  fillRect(x + 2, y + 2, w - 4, h - 4, C_FILL);
  plot(x, y, C_CLEAR); plot(x + w - 1, y, C_CLEAR);
  plot(x, y + h - 1, C_CLEAR); plot(x + w - 1, y + h - 1, C_CLEAR);
}

static void showPlate(const char *name) {
  int w = textWidth(name) + 18;
  clearRows(0, 16);
  drawPlate(3, 0, w, 16);
  drawText(12, 3, name, C_INK);
  plateTimer = 110;
}

/* --------------------------------------------------------------- objects --- */

static u16 oam[128 * 4];
static int objSlot;

static void hideAllObjects(void) {
  int i;
  for (i = 0; i < 128; i++) oam[i * 4] = 0x0200;   /* disabled */
  objSlot = 0;
}

/* A 16x32 body: eight character tiles, four bits a pixel, palette bank `bank`. */
static void placeObject(int slot, int x, int y, int tile, int bank) {
  if (x < -16 || x > SCREEN_W || y < -32 || y > SCREEN_H) { oam[slot * 4] = 0x0200; return; }
  oam[slot * 4 + 0] = (u16)((y & 0xFF) | 0x8000);              /* tall */
  oam[slot * 4 + 1] = (u16)((x & 0x1FF) | 0x8000);             /* size 2 => 16x32 */
  oam[slot * 4 + 2] = (u16)(tile | (1 << 10) | (bank << 12));
  oam[slot * 4 + 3] = 0;
}

/* The same body half again as large, for a duel, where the two of you are the
   whole scene. */
static void placeBigObject(int slot, int x, int y, int tile, int bank) {
  oam[slot * 4 + 0] = (u16)((y & 0xFF) | 0x8000 | 0x0100 | 0x0200); /* affine, double */
  oam[slot * 4 + 1] = (u16)((x & 0x1FF) | 0x8000);
  oam[slot * 4 + 2] = (u16)(tile | (1 << 10) | (bank << 12));
  oam[slot * 4 + 3] = 0;
}

/* The bubble that pops over somebody the moment they see you. Four character
   tiles at the top of object memory, written once at start-up. */
#define SPOT_TILE 896
#define SPOT_BANK 13

static const char *const SPOT_ART[16] = {
  "................",
  "..kkkkkkkkkkkk..",
  ".kwwwwwwwwwwwwk.",
  ".kwwwwwkkwwwwwk.",
  ".kwwwwwkkwwwwwk.",
  ".kwwwwwkkwwwwwk.",
  ".kwwwwwkkwwwwwk.",
  ".kwwwwwkkwwwwwk.",
  ".kwwwwwwwwwwwwk.",
  ".kwwwwwkkwwwwwk.",
  ".kwwwwwkkwwwwwk.",
  ".kwwwwwwwwwwwwk.",
  "..kkkkkkkkkkkk..",
  "...kwwk.........",
  "....kk..........",
  "................",
};

static void buildBubble(void) {
  int y, x;
  volatile u8 *out = (volatile u8 *)(VRAM_OBJ) + SPOT_TILE * 32;
  for (y = 0; y < 32 * 4; y++) out[y] = 0;
  for (y = 0; y < 16; y++) {
    for (x = 0; x < 16; x++) {
      char c = SPOT_ART[y][x];
      int v = c == 'k' ? 1 : c == 'w' ? 2 : 0;
      int tile = (y >> 3) * 2 + (x >> 3);
      int at = tile * 32 + (y & 7) * 4 + ((x & 7) >> 1);
      if (!v) continue;
      if (x & 1) out[at] = (u8)((out[at] & 0x0F) | (v << 4));
      else out[at] = (u8)((out[at] & 0xF0) | v);
    }
  }
  PAL_OBJ[SPOT_BANK * 16 + 1] = RGB15(3, 3, 5);
  PAL_OBJ[SPOT_BANK * 16 + 2] = RGB15(31, 31, 31);
}

/* The star that breaks over somebody the moment a blow lands. Four frames,
   built rather than drawn out: a diamond core that grows and then blows open,
   with four rays off it, in the bubble's own white and a gold added beside it. */
#define SPARK_TILE 912
#define SPARK_FRAMES 4
#define SPARK_SIDE 32            /* four frames of sixteen tiles apiece */

static void buildSpark(void) {
  static const u8 CORE[SPARK_FRAMES]  = { 4,  8, 12,  8 };
  static const u8 ARM[SPARK_FRAMES]   = { 11, 15, 15, 15 };
  static const u8 THICK[SPARK_FRAMES] = { 1,  2,  3,  1 };
  const int half = SPARK_SIDE / 2, wide = SPARK_SIDE / 8;
  int f, y, x;
  volatile u8 *out = (volatile u8 *)(VRAM_OBJ) + SPARK_TILE * 32;
  for (y = 0; y < 32 * wide * wide * SPARK_FRAMES; y++) out[y] = 0;
  for (f = 0; f < SPARK_FRAMES; f++) {
    for (y = 0; y < SPARK_SIDE; y++) {
      for (x = 0; x < SPARK_SIDE; x++) {
        int dx = x - half, dy = y - half;
        int ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
        int d = ax + ay, v = 0, tile, at;
        if (d <= CORE[f]) v = 2;
        else if (d <= CORE[f] + 3) v = 3;
        else if ((ax <= THICK[f] && ay <= ARM[f]) ||
                 (ay <= THICK[f] && ax <= ARM[f])) v = 3;
        /* The last frame is the one before it blown open: a ring, not a star. */
        if (f == SPARK_FRAMES - 1 && d <= CORE[f] - 4) v = 0;
        if (!v) continue;
        tile = f * wide * wide + (y >> 3) * wide + (x >> 3);
        at = tile * 32 + (y & 7) * 4 + ((x & 7) >> 1);
        if (x & 1) out[at] = (u8)((out[at] & 0x0F) | (v << 4));
        else out[at] = (u8)((out[at] & 0xF0) | v);
      }
    }
  }
  PAL_OBJ[SPOT_BANK * 16 + 3] = RGB15(31, 27, 12);
}

/* Weather. One eight by eight tile with a two by two dot in the middle of it,
   in white for snow and in the star's gold for leaves and embers - which is the
   whole of it, because a mote of anything is two pixels at this size and what
   makes it read is that it moves. Nothing at all happened in the overworld
   before this: people stood about and the sky was a flat colour. */
#define MOTE_TILE 976
#define MOTE_SNOW 0
#define MOTE_LEAF 1

static void buildMotes(void) {
  int f, y, x;
  volatile u8 *out = (volatile u8 *)(VRAM_OBJ) + MOTE_TILE * 32;
  for (y = 0; y < 32 * 2; y++) out[y] = 0;
  for (f = 0; f < 2; f++) {
    int ink = f ? 3 : 2;                       /* gold for leaves, white for snow */
    for (y = 3; y < 5; y++) {
      for (x = 3; x < 5; x++) {
        int at = f * 32 + y * 4 + (x >> 1);
        if (x & 1) out[at] = (u8)((out[at] & 0x0F) | (ink << 4));
        else out[at] = (u8)((out[at] & 0xF0) | ink);
      }
    }
  }
}

/* Grass closing over your boots. Two frames, drawn over the player whenever
   they are standing in cover, which is what makes tall grass feel like tall
   grass rather than a differently coloured floor. */
#define GRASS_TILE 900
#define GRASS_BANK 14
#define FROST_BANK 15

static const char *const GRASS_ART[2][16] = {
  {
    "................",
    "..l..h.....h..l.",
    "..l.mh...l.h..l.",
    ".lm.mm..lm.m.hl.",
    ".lm.mm.dlm.m.lh.",
    "dlmdmm.ddmdm.lm.",
    "dlmdmmddddmd.lm.",
    "ddmdmmddddmdddm.",
    "ddmdddddddddddm.",
    ".dddddddddddddd.",
    "..dd.dd..dd.dd..",
    "................",
    "................",
    "................",
    "................",
    "................",
  },
  {
    "....h.....h..l..",
    "...h.l...h.l.l..",
    ".h.m.ml.m.mm.ml.",
    ".hl.m.mlm.mm.ml.",
    ".ml.mdmdmdmmdml.",
    ".mldmdddmdmmdmld",
    ".mdddddddddmdmld",
    ".mdddddddddddddd",
    ".dddddddddddddd.",
    "..dd..dd..dd.dd.",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  },
};

static void buildGrass(void) {
  int f, y, x;
  for (f = 0; f < 2; f++) {
    volatile u8 *out = (volatile u8 *)(VRAM_OBJ) + (GRASS_TILE + f * 4) * 32;
    for (y = 0; y < 32 * 4; y++) out[y] = 0;
    for (y = 0; y < 16; y++) {
      for (x = 0; x < 16; x++) {
        char c = GRASS_ART[f][y][x];
        int v = c == 'd' ? 1 : c == 'm' ? 2 : c == 'l' ? 3 : c == 'h' ? 4 : 0;
        int tile = (y >> 3) * 2 + (x >> 3);
        int at = tile * 32 + (y & 7) * 4 + ((x & 7) >> 1);
        if (!v) continue;
        if (x & 1) out[at] = (u8)((out[at] & 0x0F) | (v << 4));
        else out[at] = (u8)((out[at] & 0xF0) | v);
      }
    }
  }
  PAL_OBJ[GRASS_BANK * 16 + 1] = RGB15(5, 11, 5);
  PAL_OBJ[GRASS_BANK * 16 + 2] = RGB15(7, 15, 6);
  PAL_OBJ[GRASS_BANK * 16 + 3] = RGB15(11, 20, 9);
  PAL_OBJ[GRASS_BANK * 16 + 4] = RGB15(14, 24, 11);
  /* The same blades under snow, for everything north of the Neck. */
  PAL_OBJ[FROST_BANK * 16 + 1] = RGB15(10, 14, 13);
  PAL_OBJ[FROST_BANK * 16 + 2] = RGB15(14, 18, 16);
  PAL_OBJ[FROST_BANK * 16 + 3] = RGB15(18, 22, 20);
  PAL_OBJ[FROST_BANK * 16 + 4] = RGB15(24, 28, 26);
}

static void placeGrass(int slot, int x, int y, int frame, int bank) {
  if (x < -16 || x > SCREEN_W || y < -16 || y > SCREEN_H) { oam[slot * 4] = 0x0200; return; }
  oam[slot * 4 + 0] = (u16)(y & 0xFF);
  oam[slot * 4 + 1] = (u16)((x & 0x1FF) | 0x4000);
  oam[slot * 4 + 2] = (u16)((GRASS_TILE + frame * 4) | (bank << 12));
  oam[slot * 4 + 3] = 0;
}

static void placeMote(int slot, int x, int y, int kind) {
  if (x < -8 || x > SCREEN_W || y < -8 || y > SCREEN_H) { oam[slot * 4] = 0x0200; return; }
  oam[slot * 4 + 0] = (u16)(y & 0xFF);                       /* square, size 0 */
  oam[slot * 4 + 1] = (u16)(x & 0x1FF);
  oam[slot * 4 + 2] = (u16)((MOTE_TILE + kind) | (SPOT_BANK << 12));
  oam[slot * 4 + 3] = 0;
}

static void placeSpark(int slot, int x, int y, int frame) {
  if (x < -32 || x > SCREEN_W || y < -32 || y > SCREEN_H) { oam[slot * 4] = 0x0200; return; }
  oam[slot * 4 + 0] = (u16)(y & 0xFF);                      /* square */
  oam[slot * 4 + 1] = (u16)((x & 0x1FF) | 0x8000);          /* size 2 => 32x32 */
  oam[slot * 4 + 2] = (u16)((SPARK_TILE + frame * 16) | (SPOT_BANK << 12));
  oam[slot * 4 + 3] = 0;
}

static void placeBubble(int slot, int x, int y) {
  if (x < -16 || x > SCREEN_W || y < -16 || y > SCREEN_H) { oam[slot * 4] = 0x0200; return; }
  oam[slot * 4 + 0] = (u16)(y & 0xFF);                       /* square */
  oam[slot * 4 + 1] = (u16)((x & 0x1FF) | 0x4000);           /* size 1 => 16x16 */
  oam[slot * 4 + 2] = (u16)(SPOT_TILE | (SPOT_BANK << 12));
  oam[slot * 4 + 3] = 0;
}

static void pushObjects(void) {
  int i;
  for (i = 0; i < 128 * 4; i++) OAM[i] = oam[i];
  /* Affine set 0: a half in 8.8, which draws through it at twice size. A
     sixteen by thirty-two body becomes thirty-two by sixty-four, which is
     exactly the double-size box the hardware gives it - no clipping, and the
     two of you actually fill the yard you are fighting in. */
  OAM[3] = 0x0080; OAM[7] = 0; OAM[11] = 0; OAM[15] = 0x0080;
}

/* --------------------------------------------------------------- the cast -- */

typedef struct {
  s16 px, py;      /* pixel position of the tile the body stands on */
  u8 dir;          /* 0 down, 1 up, 2 left, 3 right */
  u8 stride;       /* which foot goes forward on this step */
  u8 walk;         /* pixels left in the step, 0 when standing */
  s8 dx, dy;
} Body;

static const s8 DIR_X[4] = { 0, 0, -1, 1 };
static const s8 DIR_Y[4] = { 1, -1, 0, 0 };

#define MAX_CROWD 12
static Body crowd[MAX_CROWD];
static u16 crowdTimer[MAX_CROWD];
static u8 crowdAlive[MAX_CROWD];
static int crowdCount;

static Body hero;
static int heroActor;
static int turnHold;
static int spotted = -1, spotTimer;
static u8 beaten[MAP_COUNT][MAX_CROWD];            /* the appearance of the house you swore to */

/* Who has been killed, so the road stays as you left it. */
static u8 slain[MAP_COUNT][MAX_CROWD];

/* Who has already pressed something into your hand. Kept in the record as well,
   or a save and a reload would be a way to be given it all over again. */
static u8 gifted[MAP_COUNT][MAX_CROWD];


/* --------------------------------------------------------------- the you --- */

#define NAME_MAX 10

typedef struct {
  int house;
  int level, exp, hp, gold;
  int kills;
  u8 weapon, armour, shield;      /* a ware index plus one; nothing is 0 */
  u8 bag[WARE_COUNT];
  char name[NAME_MAX + 1];        /* what people call you */
} You;

static You you;

/* --------------------------------------------------------------- sigils ---
   Nine seats, nine people sitting in them, and one bit each. This is the spine
   of the game: without it a player could wander the whole of Westeros without
   ever being told what they were meant to be doing, which is exactly what the
   game did.

   The order is not the same for everybody. Your own liege is the eighth fight
   rather than the first, so swearing to House Martell is a different route
   through the same world instead of the same route in orange. */
static u16 sigils;
static u8 atRung[LEADER_COUNT];   /* who stands on each rung of your ladder */
static u8 rungOf[LEADER_COUNT];   /* and which rung each of them stands on */

static void layLadder(void) {
  int i, n = 0, mine = -1;
  /* The throne is the last fight for everybody, so it is not looked at here -
     which also settles House Lannister, who would otherwise find two of their
     own on the ladder and neither of them last. */
  for (i = 0; i < LEADER_COUNT - 1; i++) {
    if (leaders[i].house == (u8)you.house) { mine = i; break; }
  }
  for (i = 0; i < LEADER_COUNT - 1; i++) if (i != mine) atRung[n++] = (u8)i;
  if (mine >= 0) atRung[n++] = (u8)mine;
  atRung[n++] = (u8)(LEADER_COUNT - 1);
  for (i = 0; i < LEADER_COUNT; i++) rungOf[atRung[i]] = (u8)i;
}

/* Which of the nine this duellist is, or -1 for anybody else on the road. */
static int leaderFor(int duellist) {
  int i;
  for (i = 0; i < LEADER_COUNT; i++) if (leaders[i].duellist == (u16)duellist) return i;
  return -1;
}

static int haveSigil(int lead) { return (sigils >> lead) & 1; }

static int countSigils(void) {
  int i, n = 0;
  for (i = 0; i < LEADER_COUNT; i++) n += haveSigil(i);
  return n;
}

/* The lowest rung nobody has taken yet: what the status card tells you to do. */
static int nextRung(void) {
  int i;
  for (i = 0; i < LEADER_COUNT; i++) if (!haveSigil(atRung[i])) return i;
  return -1;
}

/* What you are wearing decides which of the four bodies is resident. */
static int lookOf(void) {
  return you.armour ? wares[you.armour - 1].tier : 0;
}

/* Health rises faster than it used to. A fight that lasts five or six exchanges
   is a fight; one that ends in two is a coin toss, and a coin toss is not fun. */
static int vigourFor(int level) { return 30 + level * 9; }

static int mightFor(int level) {
  return 10 + level * 3 + (you.weapon ? wares[you.weapon - 1].might : 0);
}
static int guardFor(int level) {
  return 6 + level * 2
    + (you.armour ? wares[you.armour - 1].guard : 0)
    + (you.shield ? wares[you.shield - 1].guard : 0);
}
static int swiftFor(int level) {
  int s = 10 + level * 2;
  if (you.weapon) s += wares[you.weapon - 1].swiftness;
  if (you.armour) s += wares[you.armour - 1].swiftness;
  if (you.shield) s += wares[you.shield - 1].swiftness;
  return s < 1 ? 1 : s;
}

/* ------------------------------------------------------------- what they -- */
/* ------------------------------------------------------------- carry ------ */
/* Everybody on the road is carrying something, and what they are carrying is
   fixed to who they are rather than rolled when they fall. That is the whole
   point: a name is worth killing because of what is on them, the same blade is
   on the same knight every time, and a serjeant of the Watch is a better prize
   than a stableboy. You start with nothing at all, so the first few fights are
   how you get dressed.

   The purse a person's standing buys is their level times a bit, jittered by a
   hash of who they are, and they carry the best thing of one kind that the
   purse covers - usually. Sometimes they are a rung below it, which is what
   keeps it worth beating the same rank twice. */

#define KIT_NONE 255
#define KIT_CEILING 3600    /* what the dearest thing on any body may cost */

/* A weapon, a mail, a shield and maybe something to drink: everybody on the
   road is dressed the way you are, out of the same list you are, and fights in
   all of it. That symmetry is the whole balance of the thing - if they carried
   one piece and you wore three, beating them would arm you past them within an
   afternoon and the road south would be a walk. */
typedef struct { u8 arm, mail, shield, remedy; } Kit;

static u32 kitHash(int who) {
  u32 h = (u32)(who + 1) * 2654435761u;
  h ^= h >> 15; h *= 2246822519u; h ^= h >> 13; h *= 3266489917u; h ^= h >> 16;
  return h;
}

/* No divide instruction and no remainder either, so a fraction of a range is a
   multiply and a shift of the top sixteen bits of the hash.
   Rotate rather than shift to get at a different part of it: a shift throws
   bits away, and asking for one chance in eight out of what a shift of
   twenty-one leaves is asking a three-bit number for a sixteen-bit answer -
   which is nought, every single time. */
static u32 rot(u32 h, int k) { return (h << k) | (h >> (32 - k)); }

static int hashUpTo(u32 h, int range) {
  return range > 0 ? (int)(((h >> 16) & 0xFFFFu) * (u32)range >> 16) : 0;
}

/* The dearest thing of one kind their purse runs to, or the one below it. */
static u8 kitPiece(u32 h, int kind, int budget, int emptyIn) {
  int best = -1, second = -1, i;
  if (emptyIn > 0 && hashUpTo(h, emptyIn) == 0) return KIT_NONE;
  for (i = 0; i < WARE_COUNT; i++) {
    if (wares[i].kind != kind || wares[i].price > budget) continue;
    if (best < 0 || wares[i].price > wares[best].price) { second = best; best = i; }
    else if (second < 0 || wares[i].price > wares[second].price) second = i;
  }
  if (best < 0) return KIT_NONE;
  /* One in three is carrying the lesser thing, which is what keeps it worth
     beating the same rank of person twice. */
  return (u8)((second >= 0 && hashUpTo(rot(h, 11), 3) == 0) ? second : best);
}

static Kit kitOf(int who, int level) {
  u32 h = kitHash(who);
  /* Steep at the bottom on purpose. You go out of the gate with nothing, so the
     first people on the road have to have nothing either, or the first fight is
     a bare fist against a shield and there is no way into the game at all. It
     is level five before anybody has a knife and level ten before anybody has
     mail, by which time you have taken a few things off a few people. */
  int budget = level * level * 6 + level * 20 + hashUpTo(h, 1 + level * 40);
  Kit k;
  /* Nobody on the road is carrying the best things in the world. The road can
     arm you well; a smith's counter is still the only place the finest kit
     comes from, and gold is still worth having at the end of it. */
  if (budget > KIT_CEILING) budget = KIT_CEILING;

  k.arm    = kitPiece(rot(h, 3),  WARE_WEAPON, budget, 8);
  k.mail   = kitPiece(rot(h, 9),  WARE_ARMOUR, budget, 5);
  k.shield = kitPiece(rot(h, 17), WARE_SHIELD, budget, 3);
  k.remedy = KIT_NONE;
  /* One in eight is carrying something to drink. More than that and you can
     out-drink any duel, which is the same as not being able to lose one. */
  if (hashUpTo(rot(h, 23), 8) == 0) {
    int p = level / 14;
    k.remedy = (u8)(p > 3 ? 3 : p);
  }
  return k;
}

/* Your four techniques: whatever the blade in your hand teaches, and Guard,
   which anybody can do and which always keeps the last slot. */
static u8 myTechs[4];

/* The best thing standing itself has taught you by now, or -1 if you are not
   far enough along to have been taught anything. */
static int learnedBy(int level) {
  int i, best = -1;
  for (i = 0; i < LEARN_COUNT; i++) if (learned[i].level <= level) best = learned[i].tech;
  return best;
}

/* Which level, if any, teaches something exactly on reaching it. */
static int learnedAt(int level) {
  int i;
  for (i = 0; i < LEARN_COUNT; i++) if (learned[i].level == level) return learned[i].tech;
  return -1;
}

static void reckonTechniques(void) {
  int n = 0, i, mine = learnedBy(you.level);

  /* Your weapon teaches the first two slots. What you have learned by standing
     takes the third, so climbing visibly changes how you fight instead of
     moving two numbers you cannot see. */
  if (you.weapon) {
    const Ware *w = &wares[you.weapon - 1];
    for (i = 0; i < w->techCount && n < 2; i++) myTechs[n++] = w->tech[i];
  } else {
    while (n < 2) { myTechs[n] = player_techs[n]; n++; }
  }
  if (mine >= 0) {
    myTechs[2] = (u8)mine;
  } else if (you.weapon) {
    const Ware *w = &wares[you.weapon - 1];
    /* Nothing learned yet: a third blade technique if the weapon has one,
       otherwise swordplay anybody picks up. */
    myTechs[2] = (u8)(w->techCount > 2 ? w->tech[2] : armed_techs[2]);
  } else {
    myTechs[2] = player_techs[2];
  }
  myTechs[3] = player_techs[3];              /* Guard */
}

/* The ladder, and what a rung costs.
 *
 * A cube, the way the handhelds do it, tuned so that two or three fights buy a
 * level the whole way up rather than four early and fifteen later. Beating
 * somebody your own level is always worth about a third of the next rung. */
static int expForLevel(int level) { return level <= 1 ? 0 : 5 * level * level * level / 4; }

/* What a win is worth. This used to be a figure for the person you beat and
   nothing else, so a level thirty paid the same whether you were thirty
   yourself or five, and there was no reason to ever fight above your weight.
   The gap counts now: punching up pays a great deal more, and beating somebody
   far beneath you is barely worth the walk. */
static int expFrom(int foe, int mine) {
  int base = 24 + foe * foe * 2;
  int gap = foe - mine;
  int scale = 100 + (gap > 0 ? gap * 14 : gap * 9);
  if (scale < 10) scale = 10;
  if (scale > 400) scale = 400;
  return base * scale / 100;
}

/* How far along the current rung a given tally is, in hundredths. The rail is
   drawn from a figure that walks up to the real one rather than from the real
   one, so a win visibly fills it instead of snapping it along. */
static int shareOf(int exp) {
  int floorAt = expForLevel(you.level), next = expForLevel(you.level + 1);
  if (you.level >= 50 || next <= floorAt) return 100;
  {
    int into = exp - floorAt, rung = next - floorAt;
    if (into < 0) into = 0;
    if (into > rung) into = rung;
    return (int)udiv((u32)(into * 100), (u32)rung);
  }
}

static int expShare(void) { return shareOf(you.exp); }

/* ----------------------------------------------------------------- world --- */

static const Map *world;
static int worldId;
static int camX, camY;

static int solidAt(int x, int y) {
  if (x < 0 || y < 0 || x >= world->w || y >= world->h) return 1;
  return world->solid[y * world->w + x];
}

/* Tall grass and reeds. Nothing jumps you out of a cobbled street. */
static int coverAt(int x, int y) {
  if (x < 0 || y < 0 || x >= world->w || y >= world->h) return 0;
  return world->cover[y * world->w + x];
}

/* A drop. You can go over it southward and no other way, which is the oldest
   one-way valve in the genre. */
static int ledgeAt(int x, int y) {
  if (x < 0 || y < 0 || x >= world->w || y >= world->h) return 0;
  return world->ledge[y * world->w + x];
}

/* A body mid-step is standing on two tiles at once as far as everyone else is
   concerned: the one it left and the one it has claimed. */
static int bodyAt(const Body *b, int x, int y) {
  int bx = b->px >> 4, by = b->py >> 4;
  if (bx == x && by == y) return 1;
  if (b->walk) {
    if (((b->px + b->dx * b->walk) >> 4) == x
     && ((b->py + b->dy * b->walk) >> 4) == y) return 1;
    if (((b->px - b->dx * (16 - b->walk)) >> 4) == x
     && ((b->py - b->dy * (16 - b->walk)) >> 4) == y) return 1;
  }
  return 0;
}

static int occupied(int x, int y, int ignore) {
  int i;
  if (bodyAt(&hero, x, y)) return 1;
  for (i = 0; i < crowdCount; i++) {
    if (i == ignore || !crowdAlive[i]) continue;
    if (bodyAt(&crowd[i], x, y)) return 1;
  }
  return 0;
}

static void writeScreenblock(void) {
  int ty, tx;
  int tw = world->w * 2, th = world->h * 2;
  for (ty = 0; ty < 64; ty++) {
    volatile u16 *rowBase = VRAM_BG_MAP + ((ty >> 5) << 11) + ((ty & 31) << 5);
    for (tx = 0; tx < 64; tx++) {
      volatile u16 *cell = rowBase + ((tx >> 5) << 10) + (tx & 31);
      *cell = (tx < tw && ty < th) ? world->entries[ty * tw + tx] : 0;
    }
  }
}

/* The player's frames sit first in object memory; each resident appearance gets
   four facings and two steps after them. */
#define PLAYER_TILE_BASE 0
#define NPC_TILE_BASE (PLAYER_FRAMES * ACTOR_FRAME_TILES)
#define NPC_TILE_STRIDE (NPC_FRAMES * ACTOR_FRAME_TILES)

/* Just the player's own frames, for when the armour changes and the body has
   to change with it. */
static void loadPlayerBody(void) {
  int i, w;
  const u32 *src;
  heroActor = houses[you.house].looks[lookOf()];
  src = actors[heroActor].tiles;
  for (w = 0; w < PLAYER_FRAMES * ACTOR_FRAME_TILES * 8; w++) VRAM_OBJ[w] = src[w];
  for (i = 0; i < 16; i++) PAL_OBJ[i] = actors[heroActor].pal[i];
}

static void loadActors(void) {
  int i, d, w;
  const u32 *src = actors[heroActor].tiles;
  volatile u32 *out = VRAM_OBJ;
  /* The player, all four steps, because you look at them the whole game. */
  for (w = 0; w < PLAYER_FRAMES * ACTOR_FRAME_TILES * 8; w++) out[w] = src[w];
  for (i = 0; i < 16; i++) PAL_OBJ[i] = actors[heroActor].pal[i];

  for (i = 0; i < world->residentCount && i < 12; i++) {
    const Actor *a = &actors[world->residents[i]];
    volatile u32 *dst = VRAM_OBJ + (NPC_TILE_BASE + i * NPC_TILE_STRIDE) * 8;
    /* Two steps of each facing: standing, and one foot forward. */
    for (d = 0; d < 4; d++) {
      const u32 *from = a->tiles + (d * 4) * ACTOR_FRAME_TILES * 8;
      for (w = 0; w < 2 * ACTOR_FRAME_TILES * 8; w++) *dst++ = from[w];
    }
    for (w = 0; w < 16; w++) PAL_OBJ[(i + 1) * 16 + w] = a->pal[w];
  }
}

static void loadWorldTiles(void) {
  int i;
  for (i = 0; i < world->tileCount * 16; i++) VRAM_BG_CHR[i] = world->tiles[i];
}

/* ---------------------------------------------------------------- weather -- */
/* Sixteen motes blowing across the screen, wrapped rather than spawned, so it
   costs sixteen object slots and no book-keeping at all. Snow comes down and
   drifts west in the North; leaves come down and east under the trees; embers
   go up off Dragonstone. Everywhere else the air is still. */

#define MOTES 16
#define WEATHER_NONE 0
#define WEATHER_SNOW 1
#define WEATHER_LEAF 2
#define WEATHER_EMBER 3

static s16 moteX[MOTES], moteY[MOTES];
static u8 moteRate[MOTES];

static int weatherHere(void) {
  if (!world) return WEATHER_NONE;
  if (world->scene == 1) return WEATHER_SNOW;
  if (world->scene == 2) return WEATHER_LEAF;
  if (world->scene == 4) return WEATHER_EMBER;
  return WEATHER_NONE;
}

static void seedWeather(void) {
  int i;
  for (i = 0; i < MOTES; i++) {
    moteX[i] = (s16)roll(SCREEN_W);
    moteY[i] = (s16)roll(SCREEN_H);
    moteRate[i] = (u8)(1 + roll(3));
  }
}

static void tickWeather(void) {
  int kind = weatherHere(), i;
  if (kind == WEATHER_NONE) return;
  for (i = 0; i < MOTES; i++) {
    int fall = moteRate[i];
    if (kind == WEATHER_EMBER) {
      moteY[i] = (s16)(moteY[i] - fall);
      /* An ember wanders as it rises rather than falling in a line. */
      moteX[i] = (s16)(moteX[i] + (((frameClock >> 4) + i) & 1 ? 1 : -1));
      if (moteY[i] < -8) { moteY[i] = (s16)(SCREEN_H + 8); moteX[i] = (s16)roll(SCREEN_W); }
    } else {
      moteY[i] = (s16)(moteY[i] + fall);
      moteX[i] = (s16)(moteX[i] + (kind == WEATHER_SNOW ? -1 : 1));
      if (moteY[i] > SCREEN_H + 8) { moteY[i] = -8; moteX[i] = (s16)roll(SCREEN_W); }
    }
    if (moteX[i] < -8) moteX[i] = (s16)(SCREEN_W + 4);
    if (moteX[i] > SCREEN_W + 8) moteX[i] = -4;
  }
}

static void placeWeather(void) {
  int kind = weatherHere(), i;
  if (kind == WEATHER_NONE) return;
  for (i = 0; i < MOTES; i++) {
    placeMote(112 + i, moteX[i], moteY[i], kind == WEATHER_SNOW ? MOTE_SNOW : MOTE_LEAF);
  }
}

static void enterMap(int id, int tx, int ty, int dir) {
  int i;
  u16 was = REG_DISPCNT;
  sfxDoor();
  worldId = id;
  world = &maps[id];
  hero.px = (s16)(tx * 16);
  hero.py = (s16)(ty * 16);
  hero.dir = (u8)dir;
  hero.walk = 0;

  spotted = -1;
  seedWeather();
  crowdCount = world->npcCount > MAX_CROWD ? MAX_CROWD : world->npcCount;
  for (i = 0; i < crowdCount; i++) {
    crowd[i].px = (s16)(world->npcs[i].x * 16);
    crowd[i].py = (s16)(world->npcs[i].y * 16);
    crowd[i].dir = world->npcs[i].dir;
    crowd[i].walk = 0;
    crowd[i].stride = 0;
    crowdTimer[i] = (u16)(20 + roll(140));
    crowdAlive[i] = (u8)!slain[id][i];
  }

  /* A door can put you down where somebody is already standing — their own
     doorstep, usually. Step them aside rather than letting the two of you share
     a tile, which looks exactly like walking through people. */
  for (i = 0; i < crowdCount; i++) {
    int d;
    if (!crowdAlive[i]) continue;
    if ((crowd[i].px >> 4) != tx || (crowd[i].py >> 4) != ty) continue;
    for (d = 0; d < 4; d++) {
      int nx = tx + DIR_X[d], ny = ty + DIR_Y[d];
      if (solidAt(nx, ny) || occupied(nx, ny, i)) continue;
      crowd[i].px = (s16)(nx * 16);
      crowd[i].py = (s16)(ny * 16);
      crowd[i].dir = (u8)d;
      break;
    }
  }

  /* Half of video memory changes at a warp, which does not fit in a blanking
     period, so hold the display off rather than showing the world half-changed. */
  REG_DISPCNT = (u16)(was | 0x0080);
  loadWorldTiles();
  writeScreenblock();
  loadActors();
  REG_DISPCNT = was;
  showPlate(world->name);
}

static const Sign *signAt(int x, int y) {
  int i;
  for (i = 0; i < world->signCount; i++) {
    if (world->signs[i].x == x && world->signs[i].y == y) return &world->signs[i];
  }
  return 0;
}

static const Warp *warpAt(int x, int y) {
  int i;
  for (i = 0; i < world->warpCount; i++) {
    if (world->warps[i].x == x && world->warps[i].y == y) return &world->warps[i];
  }
  return 0;
}

/* A doorway is often the only tile a gate is reachable through. Somebody
   wandering into it seals the map until they wander out again, so the crowd
   keeps clear of doors and of the ground in front of them. */
static int nearWarp(int x, int y) {
  int i;
  for (i = 0; i < world->warpCount; i++) {
    int dx = world->warps[i].x - x, dy = world->warps[i].y - y;
    if (dx < 0) dx = -dx;
    if (dy < 0) dy = -dy;
    if (dx + dy <= 1) return 1;
  }
  return 0;
}

/* The one tile through a line of ledges, and the tiles queueing up to it. A
   ledge cannot be climbed, so where a line of them has a single gap that gap is
   the only way north, and somebody idling in it seals half a map until they
   happen to wander off. They are kept out of it the way they are kept out of
   doorways. */
static int ledgeGate(int x, int y) {
  int d;
  for (d = -1; d <= 1; d++) if (ledgeAt(x - 1, y + d) && ledgeAt(x + 1, y + d)) return 1;
  return 0;
}

/* A tile with walls on both sides of it is a corridor, and somebody idling in a
   corridor shuts whatever is on the far side of it. The gate tunnel through the
   Wall is four such tiles in a row: a brother of the Watch wandering into it
   seals the road north until he wanders out again. Roamers are kept out of them
   the way they are kept out of doorways. */
static int corridorAt(int x, int y) {
  return (solidAt(x - 1, y) && solidAt(x + 1, y))
      || (solidAt(x, y - 1) && solidAt(x, y + 1));
}

/* And the mouth of one. Standing at the open end of the Wall's tunnel seals it
   just as surely as standing inside it does, and the tile at the mouth has open
   ground either side of it so the corridor test alone does not see it. */
static int gateAt(int x, int y) {
  int i;
  if (corridorAt(x, y)) return 1;
  for (i = 0; i < 4; i++) if (corridorAt(x + DIR_X[i], y + DIR_Y[i])) return 1;
  return 0;
}

static int crowdAt(int x, int y) {
  int i;
  for (i = 0; i < crowdCount; i++) {
    if (crowdAlive[i] && bodyAt(&crowd[i], x, y)) return i;
  }
  return -1;
}

/* ---------------------------------------------------------------- duels ---- */

typedef struct {
  const char *name;
  int level, hp, maxHp, might, guard, swiftness;
  int defending;
  const u8 *tech;
} Fighter;

static Fighter mine, theirs;
static const Duellist *foeDef;
static int foeSlot;              /* which of the crowd is being fought, or -1 */
static int foeBank;              /* which resident appearance they wear */
static int foeId;                /* which of the duellists, for what they carry */
static int duelMenu, duelPhase, duelOver;
static char scratch[288];

static void copyString(char *dst, const char *src, int room) {
  int i = 0;
  while (src[i] && i < room - 1) { dst[i] = src[i]; i++; }
  dst[i] = 0;
}

static void appendString(char *dst, const char *src, int room) {
  int i = 0;
  while (dst[i]) i++;
  while (*src && i < room - 1) dst[i++] = *src++;
  dst[i] = 0;
}

static void appendNumber(char *dst, int n, int room) {
  char digits[12];
  int at = 0, i = 0;
  if (n < 0) { appendString(dst, "-", room); n = -n; }
  /* Quotient and remainder of the same pair is a call to __aeabi_uidivmod,
     which is in libgcc and there is no libgcc here. One divide, then subtract
     it back out. */
  do {
    u32 q = udiv((u32)n, 10);
    digits[at++] = (char)('0' + (u32)n - q * 10);
    n = (int)q;
  } while (n);
  while (dst[i]) i++;
  while (at && i < room - 1) dst[i++] = digits[--at];
  dst[i] = 0;
}

/* Damage: might against guard, softened so no single blow ends a duel. The
   browser's formula, folded into whole numbers. */
static int computeDamage(const Fighter *a, const Fighter *d, const Tech *t, int *crit) {
  int dmg;
  if (!t->power) return 0;
  dmg = (int)udiv((u32)(t->power * a->might * 11), (u32)(15 * (d->guard + 55)));
  *crit = (int)roll(100) < (t->highCrit ? 15 : 6);
  if (*crit) dmg = dmg * 18 / 10;
  if (d->defending) dmg >>= 1;
  dmg = dmg * (88 + (int)roll(21)) / 100;
  return dmg < 1 ? 1 : dmg;
}

/* The experience rail: thinner than a health bar and a different colour, the
   way the handhelds draw it, so a fight visibly moves you along. */
static void drawRail(int x, int y, int w, int percent) {
  int filled = percent * w / 100;
  fillRect(x - 1, y - 1, w + 2, 4, C_DEEP);
  fillRect(x, y, w, 2, C_BACK);
  if (filled) fillRect(x, y, filled, 2, C_RAIL);
}

static void drawBar(int x, int y, int w, int hp, int max) {
  int filled, colour;
  if (max < 1) max = 1;
  if (hp < 0) hp = 0;
  filled = (int)udiv((u32)(hp * w), (u32)max);
  colour = hp * 4 <= max ? C_DYING : (hp * 2 <= max ? C_HURT : C_WELL);
  fillRect(x - 1, y - 1, w + 2, 6, C_DEEP);
  fillRect(x, y, w, 4, C_BACK);
  if (filled) fillRect(x, y, filled, 4, colour);
}

/* Both fighters' plates. The foe's is at the top of the page, yours below the
   middle, which is where the duel layout puts them on the screen. */
/* What the two bars and the rail are showing this frame. Each walks toward the
   figure it stands for rather than jumping to it, which is the whole difference
   between a number changing and a blow landing. */
static int shownMine, shownTheirs, shownExp;

static void paintDuelBars(void) {
  drawBar(12, 19, 132, shownTheirs, theirs.maxHp);
  drawBar(TXT_W - 148, 43, 132, shownMine, mine.maxHp);
  drawRail(TXT_W - 148, 51, 132, shareOf(shownExp));
}

static void paintDuelPlates(void) {
  clearRows(0, 32);
  clearRows(32, 24);

  drawPlate(4, 0, 152, 30);
  drawText(12, 4, theirs.name, C_INK);
  copyString(scratch, "Lv ", sizeof scratch);
  appendNumber(scratch, theirs.level, sizeof scratch);
  drawText(124, 4, scratch, C_DIM);
  /* Wholly inside the lower block of the page: a plate that starts one row
     higher would have its top edge drawn at the top of the screen instead. */
  drawPlate(TXT_W - 156, 32, 152, 24);
  drawText(TXT_W - 148, 34, mine.name, C_INK);
  copyString(scratch, "Lv ", sizeof scratch);
  appendNumber(scratch, mine.level, sizeof scratch);
  drawText(TXT_W - 36, 34, scratch, C_DIM);
  paintDuelBars();
}

#define DUEL_WINDOW_TOP 56
#define DUEL_WINDOW_ROWS 5

/* Two menus, one inside the other, the way the handhelds do it: what kind of
   thing you are about to do, and then which one. */
static int topPick;
static const char *const DUEL_TOP_ITEMS[4] = { "Fight", "Pouch", "Guard", "Flee" };

static void paintFrameOnly(void) {
  clearRows(DUEL_WINDOW_TOP, DUEL_WINDOW_ROWS * 8);
  drawFrame(3, DUEL_WINDOW_TOP + 1, TXT_W - 6, DUEL_WINDOW_ROWS * 8 - 2);
}

static void paintDuelTop(void) {
  int i;
  paintFrameOnly();
  for (i = 0; i < 4; i++) {
    int x = 24 + (i & 1) * 112;
    int y = DUEL_WINDOW_TOP + 10 + (i >> 1) * 16;
    if (i == topPick) drawCursor(x - 11, y + 1, C_GOLD);
    drawText(x, y, DUEL_TOP_ITEMS[i], i == topPick ? C_GOLD : C_INK);
  }
}

static void paintDuelMenu(void) {
  int i;
  paintFrameOnly();
  for (i = 0; i < 4; i++) {
    int x = 24 + (i & 1) * 112;
    int y = DUEL_WINDOW_TOP + 8 + (i >> 1) * 16;
    if (i == duelMenu) drawCursor(x - 11, y + 1, C_GOLD);
    drawText(x, y, techniques[mine.tech[i]].name, i == duelMenu ? C_GOLD : C_INK);
  }
  {
    /* What the highlighted technique does, in the strip of yard to the left of
       your own plate. It used to sit at the foot of the window, and the window
       is a good deal shorter than it was now that the fight has the room. */
    const Tech *t = &techniques[mine.tech[duelMenu]];
    fillRect(0, 32, 80, 24, C_CLEAR);
    if (t->power) {
      copyString(scratch, "Power ", sizeof scratch);
      appendNumber(scratch, t->power, sizeof scratch);
    } else {
      copyString(scratch, "No blow", sizeof scratch);
    }
    drawText(8, 34, scratch, C_DIM);
    copyString(scratch, "Lands ", sizeof scratch);
    appendNumber(scratch, t->accuracy, sizeof scratch);
    appendString(scratch, "/100", sizeof scratch);
    drawText(8, 45, scratch, C_DIM);
  }
}

static void duelSay(const char *who, const char *what) {
  openWindowAt(who, what, DUEL_WINDOW_TOP, DUEL_WINDOW_ROWS);
}

/* -------------------------------------------------------------- the blow -- */
/* A swing you can watch rather than read about. The one swinging leans in and
   comes back; the one struck is shaken about and flickers; a star breaks over
   them; and their health walks down behind it. Thirty-four frames, a bit over
   half a second, and the game will not take a button until it has played.

   FX_MISS is the same lean with nothing at the end of it, FX_GUARD is a step
   back rather than forward. */
#define FX_FRAMES 34
#define FX_MISS 0
#define FX_HIT 1
#define FX_CLEAN 2
#define FX_GUARD 3

static int fxLeft, fxOnMe, fxKind;
static int readHold;   /* frames a workaday duel line has been left up */

/* How far a beaten body has sunk out of the yard. Nobody stands there hale
   while the purse is being counted over them. */
static int sinkMine, sinkTheirs;

static void startFx(int onMe, int kind) {
  fxLeft = FX_FRAMES;
  fxOnMe = onMe;
  fxKind = kind;
}

/* How far forward this fighter is leaning, in pixels. Positive is toward the
   other one; a guard comes out negative, which is a step away. */
static int fxLean(int forMe) {
  int gone = FX_FRAMES - fxLeft;
  if (!fxLeft || fxOnMe == forMe || gone > 12) return 0;
  {
    int arc = (gone < 6 ? gone : 12 - gone) * 4;
    return fxKind == FX_GUARD ? -(arc >> 1) : arc;
  }
}

/* The shake on whoever was struck: eight frames of being thrown about, twice as
   far if it went clean through. */
static int fxShake(int forMe) {
  int gone = FX_FRAMES - fxLeft - 12;
  if (!fxLeft || fxOnMe != forMe || fxKind == FX_MISS || fxKind == FX_GUARD) return 0;
  if (gone < 0 || gone > 9) return 0;
  return ((gone & 1) ? -3 : 3) * (fxKind == FX_CLEAN ? 2 : 1);
}

/* Struck bodies flicker, two frames on and two off. It starts a few frames after
   the star does, so the star is seen breaking over somebody rather than over an
   empty patch of yard. */
static int fxHidden(int forMe) {
  int gone = FX_FRAMES - fxLeft - 17;
  if (!fxLeft || fxOnMe != forMe || fxKind == FX_MISS || fxKind == FX_GUARD) return 0;
  if (gone < 0 || gone > 13) return 0;
  return (gone >> 1) & 1;
}

/* Which frame of the star, or 0 for none. */
static int fxStar(void) {
  int gone = FX_FRAMES - fxLeft - 11;
  if (!fxLeft || fxKind == FX_MISS || fxKind == FX_GUARD) return 0;
  if (gone < 0 || gone >= SPARK_FRAMES * 3) return 0;
  return 1 + gone / 3;
}

/* ------------------------------------------------- how hard they fight ----
   The numbers baked into the cartridge were measured walking out of Winterfell,
   because something had to be. Everybody who is nobody in particular is shifted
   from that to the road you are actually on: three levels a door, counted from
   your own seat rather than the northern one. A Targaryen who has never left
   Dragonstone meets Dragonstone people; a Stark who walks all the way there
   meets the same people twenty levels higher, because they walked twenty doors.

   The nine sigil-holders are not on that scale at all. They are a ladder, and
   which rung each of them is on depends on the order your house fights them
   in - so the first leader is always a fight you can take, and your own liege
   is always nearly the last. */
static int shiftHere(void) {
  return 3 * ((int)strideBy[you.house][worldId] - (int)strideBy[0][worldId]);
}

static int scaleTo(int v, int from, int to) {
  return from > 0 ? (int)udiv((u32)v * (u32)to, (u32)from) : v;
}

static int levelOf(int duellist) {
  const Duellist *d = &duellists[duellist];
  int lead = leaderFor(duellist);
  int lv;
  if (lead >= 0) return leaderLevel[rungOf[lead]];
  if (d->fixed) return d->level;
  lv = (int)d->level + shiftHere();
  if (lv < 2) lv = 2;
  if (lv > 50) lv = 50;
  return lv;
}

static int foeLevel, foePurse;

static void beginDuel(int duellist, int bank, int slot) {
  foeSlot = slot;
  foeBank = bank;
  foeId = duellist;
  foeDef = &duellists[duellist];
  foeLevel = levelOf(duellist);
  foePurse = scaleTo(foeDef->reward, foeDef->level, foeLevel);

  mine.name = you.name[0] ? you.name : houses[you.house].name;
  mine.level = you.level;
  mine.maxHp = vigourFor(you.level);
  mine.hp = you.hp > mine.maxHp ? mine.maxHp : you.hp;
  mine.might = mightFor(you.level);
  mine.guard = guardFor(you.level);
  mine.swiftness = swiftFor(you.level);
  reckonTechniques();
  mine.tech = myTechs;
  mine.defending = 0;

  theirs.name = foeDef->name;
  theirs.level = foeLevel;
  theirs.hp = theirs.maxHp = scaleTo(foeDef->vigour, foeDef->level, foeLevel);
  theirs.might = scaleTo(foeDef->might, foeDef->level, foeLevel);
  theirs.guard = scaleTo(foeDef->guard, foeDef->level, foeLevel);
  theirs.swiftness = scaleTo(foeDef->swiftness, foeDef->level, foeLevel);
  theirs.tech = foeDef->tech;
  theirs.defending = 0;

  /* They fight in what they are carrying, and what they are carrying is what
     you will be taking off them. That is what keeps the road level as you climb
     it: the sword that is hurting you is the sword you are about to own, and
     the next person up the road has a better one. */
  {
    Kit k = kitOf(duellist, foeLevel);
    int i;
    u8 piece[3];
    /* They fight in their weapon and their mail. The shield is slung across
       their back until it is not their fight any more, which is where you get
       it from - and it is the one edge a scavenger has over everybody on the
       road: you are wearing all three of everything you ever took. */
    piece[0] = k.arm; piece[1] = k.mail;
    for (i = 0; i < 2; i++) {
      const Ware *w;
      if (piece[i] == KIT_NONE) continue;
      w = &wares[piece[i]];
      theirs.might += w->might;
      theirs.guard += w->guard;
      theirs.swiftness += w->swiftness;
    }
    if (theirs.swiftness < 1) theirs.swiftness = 1;
  }

  duelOver = 0;
  duelMenu = 0;
  topPick = 0;
  duelPhase = 0;
  fxLeft = 0;
  sinkMine = sinkTheirs = 0;
  shownMine = mine.hp;
  shownTheirs = theirs.hp;
  shownExp = you.exp;
  clearPage();
  layoutTextRows(TEXT_DUEL);
  paintDuelPlates();
  duelSay(theirs.name, foeDef->intro);
}

#ifdef HOST_TEST
/* The arithmetic of one swing, with nothing written and nothing drawn: the
   audit fights whole duels with this to find out whether the opening of the
   game is winnable at all. It is no use to the cartridge, which always has
   something to say about a swing, so it is not built into it. Returns 1 if the
   duel ended on it. */
static int swingQuiet(Fighter *actor, Fighter *target, int techId) {
  const Tech *t = &techniques[techId];
  int crit = 0, dmg;
  actor->defending = 0;
  if (t->defend) { actor->defending = 1; return 0; }
  if ((int)roll(100) >= t->accuracy) return 0;
  dmg = computeDamage(actor, target, t, &crit);
  target->hp -= dmg;
  if (target->hp < 0) target->hp = 0;
  return target->hp <= 0;
}
#endif

/* One side's swing, written out. Returns 1 if the duel ended on it. */
static int swing(Fighter *actor, Fighter *target, int techId, int isYou) {
  const Tech *t = &techniques[techId];
  int crit = 0, dmg;

  actor->defending = 0;
  copyString(scratch, isYou ? "You" : actor->name, sizeof scratch);

  if (t->defend) {
    sfxHit(0);
    startFx(isYou ? 0 : 1, FX_GUARD);
    actor->defending = 1;
    appendString(scratch, isYou ? " raise your guard and catch a breath."
                                : " raises a guard.", sizeof scratch);
    duelSay(0, scratch);
    return 0;
  }
  if ((int)roll(100) >= t->accuracy) {
    sfxHit(0);
    startFx(isYou ? 0 : 1, FX_MISS);
    appendString(scratch, isYou ? " swing " : " swings ", sizeof scratch);
    appendString(scratch, t->name, sizeof scratch);
    appendString(scratch, " and it goes wide.", sizeof scratch);
    duelSay(0, scratch);
    return 0;
  }
  dmg = computeDamage(actor, target, t, &crit);
  sfxHit(crit ? 1 : 0);
  startFx(target == &mine, crit ? FX_CLEAN : FX_HIT);
  target->hp -= dmg;
  if (target->hp < 0) target->hp = 0;
  appendString(scratch, isYou ? " land " : " lands ", sizeof scratch);
  appendString(scratch, t->name, sizeof scratch);
  appendString(scratch, crit ? " clean through it. " : ". ", sizeof scratch);
  appendNumber(scratch, dmg, sizeof scratch);
  appendString(scratch, " damage.", sizeof scratch);
  duelSay(0, scratch);
  paintDuelPlates();          /* the bars in it still show the old figures */
  return target->hp <= 0;
}

/* --------------------------------------------------------------- start-up -- */

/* The interface is built the way a Game Boy Advance role-playing game builds
   one: a pale panel with a dark keyline round it, dark text with a pale shadow
   under it, and the frame itself in whatever colour the wearer's house flies. */
static void copyPalettes(void) {
  int i;
  for (i = 0; i < 240; i++) PAL_BG[i] = bg_pal[i];
  PAL_BG[TXT_BANK * 16 + C_CLEAR] = 0;
  PAL_BG[TXT_BANK * 16 + C_FILL]  = RGB15(29, 28, 24);   /* parchment          */
  PAL_BG[TXT_BANK * 16 + C_DEEP]  = RGB15(5, 4, 3);      /* the keyline        */
  PAL_BG[TXT_BANK * 16 + C_EDGE]  = RGB15(17, 13, 6);    /* the frame, per house */
  PAL_BG[TXT_BANK * 16 + C_INK]   = RGB15(7, 5, 4);      /* the writing        */
  PAL_BG[TXT_BANK * 16 + C_SHADE] = RGB15(24, 22, 18);   /* its shadow         */
  PAL_BG[TXT_BANK * 16 + C_GOLD]  = RGB15(17, 5, 4);     /* whoever is speaking */
  PAL_BG[TXT_BANK * 16 + C_HOUSE] = RGB15(24, 24, 26);
  PAL_BG[TXT_BANK * 16 + C_TRIM]  = RGB15(28, 28, 30);
  PAL_BG[TXT_BANK * 16 + C_WELL]  = RGB15(9, 24, 8);
  PAL_BG[TXT_BANK * 16 + C_HURT]  = RGB15(29, 22, 5);
  PAL_BG[TXT_BANK * 16 + C_DYING] = RGB15(28, 7, 5);
  PAL_BG[TXT_BANK * 16 + C_BACK]  = RGB15(14, 12, 9);    /* an empty bar       */
  PAL_BG[TXT_BANK * 16 + C_DIM]   = RGB15(13, 10, 7);    /* the small print    */
  PAL_BG[TXT_BANK * 16 + C_NIGHT] = RGB15(5, 6, 10);     /* the air above a duel */
  PAL_BG[TXT_BANK * 16 + C_EARTH] = RGB15(10, 9, 7);     /* the ground under it  */
}

static void setUpVideo(void) {
  int i;
  REG_DISPCNT = 0x0080;                              /* forced blank while loading */
  copyPalettes();
  for (i = 0; i < 8; i++) VRAM_TXT_CHR[i] = 0;       /* the blank text tile */
  buildBubble();
  buildSpark();
  buildMotes();
  buildGrass();
  layoutTextRows(TEXT_MIDDLE);
  REG_BG0CNT = (u16)(1 | 0x0080 | (28 << 8) | (3 << 14));   /* 8bpp, 64x64, behind */
  REG_BG1CNT = (u16)(0 | (2 << 2) | (27 << 8));             /* 4bpp text, in front */
  REG_BG1HOFS = 0;
  REG_BG1VOFS = 0;
}

/* ------------------------------------------------------------------ play --- */

static u16 keysNow, keysWas;

#define held(k) (keysNow & (k))
#define hit(k)  ((keysNow & ~keysWas) & (k))

#define WALK_SPEED 1
#define RUN_SPEED 2

static void stepBody(Body *b, int dir) {
  b->dir = (u8)dir;
  b->walk = 16;
  b->dx = DIR_X[dir];
  b->dy = DIR_Y[dir];
  b->stride ^= 1;
}

/* Over the edge: two tiles south in one movement, with an arc on the way. */
static int hopping;

static void hopBody(Body *b) {
  b->dir = 0;
  b->dx = 0;
  b->dy = 1;
  b->walk = 32;
  b->stride ^= 1;
  hopping = 1;
}

/* How far off the ground the body is, part way through a hop. */
static int hopLift(const Body *b) {
  int gone;
  if (!hopping || !b->walk) return 0;
  gone = 32 - b->walk;
  return (gone * (32 - gone)) / 30;
}

static void moveBody(Body *b, int speed) {
  int move = speed > b->walk ? b->walk : speed;
  b->px = (s16)(b->px + b->dx * move);
  b->py = (s16)(b->py + b->dy * move);
  b->walk = (u8)(b->walk - move);
}

/* Standing still is the neutral frame; walking alternates feet, one per tile,
   which is what makes it read as walking rather than sliding. */
static int frameOf(const Body *b, int steps) {
  int step = b->walk ? (b->stride ? 1 : 3) : 0;
  if (steps == 2) step = b->walk ? 1 : 0;
  return b->dir * steps + step;
}

/* ------------------------------------------------------- the title card ---- */

static int houseChoice;

/* ------------------------------------------------------------ your name --- */
/* Twenty-eight cells of alphabet, the way a handheld asks. You were called
   after your house until now, which read oddly on your own duel plate: the
   person swinging the sword had the same name as the banner behind them. */

#define NAME_COLS 7
#define NAME_ROWS 4
static const char NAME_KEYS[NAME_COLS * NAME_ROWS + 1] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ-'";

/* Row and column rather than one index divided by seven. An ARM7 has no divide
   instruction and this is freestanding, so asking for a signed quotient and its
   remainder together is asking the linker for __aeabi_idivmod, which is not
   there. Two counters cost nothing and never need it. */
static int nameCol, nameRow, nameLen;
#define namePick (nameRow * NAME_COLS + nameCol)

static void paintNamer(void) {
  clearPage();
  drawFrame(6, 2, TXT_W - 12, TXT_H - 8);
  centreText(8, "WHAT ARE YOU CALLED?", C_GOLD);

  /* What you have spelled so far, on a ruled line, with a place marked for the
     next letter so an empty name still looks like somewhere to type. */
  fillRect(60, 30, TXT_W - 120, 1, C_EDGE);
  copyString(scratch, you.name, sizeof scratch);
  drawText(62, 19, scratch, C_INK);
  if (nameLen < NAME_MAX) fillRect(62 + textWidth(scratch), 26, 6, 1, C_GOLD);

  {
    int row, col;
    for (row = 0; row < NAME_ROWS; row++) {
      for (col = 0; col < NAME_COLS; col++) {
        int cx = 22 + col * 28, cy = 39 + row * 12;
        int here = (row == nameRow && col == nameCol);
        char one[2];
        one[0] = NAME_KEYS[row * NAME_COLS + col];
        one[1] = 0;
        if (here) drawCursor(cx - 9, cy + 1, C_GOLD);
        drawText(cx, cy, one, here ? C_GOLD : C_INK);
      }
    }
  }
  /* One line, inside the frame. Two would not fit: the frame ends at a hundred
     and six and a line of this font is ten tall, so the second was drawn under
     the bottom edge with half of it off the screen. */
  centreText(93, "A adds   B rubs out   START done", C_DIM);
}

static void paintHousePicker(void) {
  const House *h = &houses[houseChoice];
  int i, x, mid = TXT_W >> 1;
  clearPage();
  drawFrame(4, 2, TXT_W - 8, TXT_H - 6);
  centreText(5, "SWEAR YOUR SWORD", C_GOLD);
  fillRect(60, 17, TXT_W - 120, 1, C_EDGE);

  /* The house's own colours, hung as its banner. */
  PAL_BG[TXT_BANK * 16 + C_HOUSE] = h->colour;
  PAL_BG[TXT_BANK * 16 + C_TRIM] = h->accent;
  PAL_BG[TXT_BANK * 16 + C_EDGE] = h->colour;
  fillRect(mid - 14, 21, 28, 18, C_DEEP);
  fillRect(mid - 13, 22, 26, 16, C_HOUSE);
  fillRect(mid - 5, 27, 10, 6, C_TRIM);

  centreText(41, h->full, C_HOUSE);
  centreText(53, h->words, C_INK);
  copyString(scratch, "Seat: ", sizeof scratch);
  appendString(scratch, h->seat, sizeof scratch);
  centreText(65, scratch, C_DIM);

  {
    int y = 78, n;
    speaker = 0;
    wrapText(h->sworn, TXT_W - 44);
    for (n = 0; n < 2 && n < lineCount; n++) { centreText(y, lines[n], C_DIM); y += 10; }
  }

  /* How many houses there are, which one you are on, and which way to move. */
  for (i = 0; i < HOUSE_COUNT; i++) {
    x = mid - (HOUSE_COUNT * 9 >> 1) + i * 9;
    fillRect(x, 100, 6, 3, i == houseChoice ? C_GOLD : C_BACK);
  }
  for (i = 0; i < 3; i++) {
    fillRect(mid - 36 + i, 100 + (2 - i) / 2, 1, i + 1, C_GOLD);
    fillRect(mid + 35 - i, 100 + (2 - i) / 2, 1, i + 1, C_GOLD);
  }
}

static void paintStatus(void) {
  const House *h = &houses[you.house];
  clearRows(0, TXT_H);
  drawFrame(6, 2, TXT_W - 12, TXT_H - 6);
  drawText(16, 6, h->full, C_HOUSE);
  drawText(16, 19, h->words, C_DIM);
  fillRect(16, 32, TXT_W - 32, 1, C_EDGE);

  copyString(scratch, "Level ", sizeof scratch);
  appendNumber(scratch, you.level, sizeof scratch);
  drawText(16, 38, scratch, C_INK);

  copyString(scratch, "Gold ", sizeof scratch);
  appendNumber(scratch, you.gold, sizeof scratch);
  drawText(130, 38, scratch, C_GOLD);

  copyString(scratch, "Health ", sizeof scratch);
  appendNumber(scratch, you.hp, sizeof scratch);
  appendString(scratch, " / ", sizeof scratch);
  appendNumber(scratch, vigourFor(you.level), sizeof scratch);
  drawText(16, 51, scratch, C_INK);
  drawBar(140, 53, 76, you.hp, vigourFor(you.level));

  copyString(scratch, "Next level in ", sizeof scratch);
  appendNumber(scratch, expForLevel(you.level + 1) - you.exp, sizeof scratch);
  drawText(16, 64, scratch, C_DIM);
  drawRail(140, 68, 76, expShare());

  copyString(scratch, "Killed ", sizeof scratch);
  appendNumber(scratch, you.kills, sizeof scratch);
  drawText(16, 77, scratch, C_DIM);

  copyString(scratch, "Sigils ", sizeof scratch);
  appendNumber(scratch, countSigils(), sizeof scratch);
  appendString(scratch, " of ", sizeof scratch);
  appendNumber(scratch, LEADER_COUNT, sizeof scratch);
  drawText(130, 77, scratch, C_HOUSE);

  fillRect(16, 90, TXT_W - 32, 1, C_EDGE);
  /* What to do next, in words, on the one screen a lost player will open. The
     game had a spine and never mentioned it, which is the same as not having
     one. */
  {
    int at = nextRung();
    if (at < 0) {
      drawText(16, 94, "Nine sigils. The realm is yours.", C_GOLD);
    } else {
      const Leader *l = &leaders[atRung[at]];
      copyString(scratch, "Next: ", sizeof scratch);
      appendString(scratch, l->name, sizeof scratch);
      drawText(16, 94, scratch, C_GOLD);
      copyString(scratch, "at ", sizeof scratch);
      appendString(scratch, l->seat, sizeof scratch);
      appendString(scratch, ", about level ", sizeof scratch);
      appendNumber(scratch, leaderLevel[at], sizeof scratch);
      drawText(16, 107, scratch, C_DIM);
    }
  }
}

/* ------------------------------------------------------------ the record -- */
/* Battery-backed memory on the cartridge itself, which is where a Game Boy
   keeps a save. It answers a byte at a time and no wider, so everything is
   written out through a volatile byte pointer. The string is what tells an
   emulator the cartridge has any. */

__attribute__((used)) static const char SAVE_KIND[] = "SRAM_V113";

#ifdef HOST_TEST
extern unsigned char hostSram[65536];              /* the harness's stand-in */
#define SRAM ((volatile u8 *)hostSram)
#else
#define SRAM ((volatile u8 *)0x0E000000)
#endif
#define RECORD_MAGIC 0x31454349u          /* "ICE1" */

typedef struct {
  u32 magic;
  u8 house, level, worldId, dir;
  u8 x, y, weapon, armour;
  u8 shield, pad0, pad1, pad2;
  u16 sigils, pad3;
  u32 exp, gold, hp, kills;
  u8 bag[WARE_COUNT];
  char name[NAME_MAX + 1];
  u8 slain[MAP_COUNT][MAX_CROWD];
  u8 gifted[MAP_COUNT][MAX_CROWD];
  u32 sum;
} Record;

static Record record;

static u32 tally(const Record *r) {
  const u8 *p = (const u8 *)r;
  u32 n = sizeof(Record) - 4, sum = 0;
  while (n--) sum = sum * 31u + *p++;
  return sum;
}

static void keepRecord(void) {
  const u8 *p;
  u32 i;
  int m, k;
  for (i = 0; i < sizeof(Record); i++) ((u8 *)&record)[i] = 0;
  record.magic = RECORD_MAGIC;
  record.house = (u8)you.house;
  record.level = (u8)you.level;
  record.worldId = (u8)worldId;
  record.dir = hero.dir;
  record.x = (u8)(hero.px >> 4);
  record.y = (u8)(hero.py >> 4);
  record.weapon = you.weapon;
  record.armour = you.armour;
  record.shield = you.shield;
  record.sigils = sigils;
  record.exp = (u32)you.exp;
  record.gold = (u32)you.gold;
  record.hp = (u32)you.hp;
  record.kills = (u32)you.kills;
  for (i = 0; i < WARE_COUNT; i++) record.bag[i] = you.bag[i];
  for (i = 0; i <= NAME_MAX; i++) record.name[i] = you.name[i];
  for (m = 0; m < MAP_COUNT; m++) for (k = 0; k < MAX_CROWD; k++) {
    record.slain[m][k] = slain[m][k];
    record.gifted[m][k] = gifted[m][k];
  }
  record.sum = tally(&record);

  p = (const u8 *)&record;
  for (i = 0; i < sizeof(Record); i++) SRAM[i] = p[i];
}

/* Reads the record back. Returns 1 if there was one worth reading. */
static int findRecord(void) {
  u8 *p = (u8 *)&record;
  u32 i;
  for (i = 0; i < sizeof(Record); i++) p[i] = SRAM[i];
  return record.magic == RECORD_MAGIC && record.sum == tally(&record)
    && record.house < HOUSE_COUNT && record.worldId < MAP_COUNT
    && record.level >= 1 && record.level <= 50;
}

/* Wipes the magic, so the next boot finds nothing and asks who you are. */
static void forgetRecord(void) {
  u32 i;
  for (i = 0; i < 8; i++) SRAM[i] = 0;
}

static void takeUpRecord(void) {
  u32 i;
  int m, k;
  you.house = record.house;
  you.level = record.level;
  you.exp = (int)record.exp;
  you.gold = (int)record.gold;
  you.hp = (int)record.hp;
  you.kills = (int)record.kills;
  you.weapon = record.weapon;
  you.armour = record.armour;
  you.shield = record.shield;
  sigils = record.sigils;
  layLadder();
  for (i = 0; i < WARE_COUNT; i++) you.bag[i] = record.bag[i];
  for (i = 0; i <= NAME_MAX; i++) you.name[i] = record.name[i];
  for (m = 0; m < MAP_COUNT; m++) for (k = 0; k < MAX_CROWD; k++) {
    slain[m][k] = record.slain[m][k];
    gifted[m][k] = record.gifted[m][k];
  }
  reckonTechniques();
}

/* ------------------------------------------------------------ the pouch --- */
/* What you are carrying, what a stall has on it, and the two lists that show
   them. Both are the same shape: a title, six rows, a pointer, and a footer. */

static int menuPick, bagPick, shopPick, shopStall, bagInDuel;
static int afterWindow;
static int afterDuel = -1;   /* the slot to draw on once their line is read */

static int carrying(void) {
  int i, n = 0;
  for (i = 0; i < WARE_COUNT; i++) if (you.bag[i]) n++;
  return n;
}

static int nthCarried(int n) {
  int i;
  for (i = 0; i < WARE_COUNT; i++) if (you.bag[i] && !n--) return i;
  return -1;
}

static void showGold(int y) {
  copyString(scratch, "Gold ", sizeof scratch);
  appendNumber(scratch, you.gold, sizeof scratch);
  drawText(TXT_W - 14 - textWidth(scratch), y, scratch, C_GOLD);
}

static int worn(int at) {
  return you.weapon == at + 1 || you.armour == at + 1 || you.shield == at + 1;
}

/* One line about a thing, into scratch, for whichever list is showing it. The
   nudge to put it on belongs in the pouch and nowhere else. */
static void describeWare(int at, int inPouch) {
  const Ware *w = &wares[at];
  copyString(scratch, "", sizeof scratch);
  if (w->kind == WARE_POTION) {
    appendString(scratch, "Restores ", sizeof scratch);
    if (w->heal >= 9999) appendString(scratch, "everything.", sizeof scratch);
    else { appendNumber(scratch, w->heal, sizeof scratch); appendString(scratch, " health.", sizeof scratch); }
    return;
  }
  if (w->might) { appendString(scratch, "Might +", sizeof scratch); appendNumber(scratch, w->might, sizeof scratch); }
  if (w->guard) {
    if (scratch[0]) appendString(scratch, "  ", sizeof scratch);
    appendString(scratch, "Guard +", sizeof scratch); appendNumber(scratch, w->guard, sizeof scratch);
  }
  if (w->swiftness) {
    appendString(scratch, "  Swiftness ", sizeof scratch);
    appendNumber(scratch, w->swiftness, sizeof scratch);
  }
  if (inPouch && !worn(at)) appendString(scratch, "   A to take it up", sizeof scratch);
}

static void paintBag(void) {
  int have = carrying(), top = listTop(bagPick, have), i;
  clearRows(0, TXT_H);
  drawFrame(4, 2, TXT_W - 8, TXT_H - 8);
  drawText(14, 6, "WHAT YOU CARRY", C_GOLD);
  showGold(6);
  fillRect(14, 18, TXT_W - 28, 1, C_EDGE);

  if (!have) {
    drawText(20, 34, "Nothing but your own hands.", C_DIM);
    drawText(14, TXT_H - 18, "B to put it away", C_DIM);
    return;
  }
  for (i = 0; i < LIST_ROWS && top + i < have; i++) {
    int at = nthCarried(top + i);
    int y = 22 + i * 11;
    if (top + i == bagPick) drawCursor(14, y + 1, C_GOLD);
    drawText(24, y, wares[at].name, top + i == bagPick ? C_GOLD : C_INK);
    if (wares[at].kind == WARE_POTION) {
      copyString(scratch, "x", sizeof scratch);
      appendNumber(scratch, you.bag[at], sizeof scratch);
      drawText(TXT_W - 34, y, scratch, C_DIM);
    } else if (worn(at)) {
      drawText(TXT_W - 52, y, wares[at].kind == WARE_WEAPON ? "in hand" : "worn", C_WELL);
    }
  }
  {
    int at = nthCarried(bagPick);
    describeWare(at, 1);
    drawText(14, TXT_H - 18, scratch, C_DIM);
  }
}

/* Drinking something, or putting it on. Returns 1 if it did anything.
   Gear stays in the pouch when it is taken up: what you were wearing is still
   yours, and swapping back costs nothing but the walk to the menu. */
static int wearWare(int at) {
  const Ware *w = &wares[at];
  if (!you.bag[at] || worn(at)) return 0;
  if (w->kind == WARE_WEAPON) { you.weapon = (u8)(at + 1); reckonTechniques(); }
  else if (w->kind == WARE_ARMOUR) { you.armour = (u8)(at + 1); loadPlayerBody(); }
  else if (w->kind == WARE_SHIELD) you.shield = (u8)(at + 1);
  else return 0;
  return 1;
}

/* Everything that comes into your hands goes through here: off a body, out of
   the grass, or over a counter. A second one of the same thing is no use to
   anybody, so it is stripped for what the metal is worth rather than sitting in
   the pouch forever; and a better thing than you have goes straight on, because
   nobody walks past a better sword to go and find a menu.

   Returns 0 kept and worn, 1 kept and not worn, 2 sold on the spot. */
#define TOOK_WORN 0
#define TOOK_KEPT 1
#define TOOK_SOLD 2

static int takeWare(int at) {
  const Ware *w = &wares[at];
  if (w->kind == WARE_POTION) {
    if (you.bag[at] < 99) you.bag[at]++;
    return TOOK_KEPT;
  }
  if (you.bag[at]) {
    you.gold += w->price >> 4;      /* scrap, not the asking price */
    return TOOK_SOLD;
  }
  you.bag[at]++;
  {
    int had = w->kind == WARE_WEAPON ? you.weapon
            : w->kind == WARE_ARMOUR ? you.armour : you.shield;
    if (!had || wares[had - 1].price < w->price) { wearWare(at); return TOOK_WORN; }
  }
  return TOOK_KEPT;
}

static int useWare(int at) {
  int max = vigourFor(you.level), heal;
  if (!you.bag[at]) return 0;
  if (wares[at].kind != WARE_POTION) return wearWare(at);
  heal = wares[at].heal >= 9999 ? max : wares[at].heal;
  if (you.hp >= max) return 0;
  you.hp += heal;
  if (you.hp > max) you.hp = max;
  you.bag[at]--;
  return 1;
}

static void paintShop(void) {
  const Stall *stall = &stalls[shopStall];
  int top = listTop(shopPick, stall->count), i;
  clearRows(0, TXT_H);
  drawFrame(4, 2, TXT_W - 8, TXT_H - 8);
  drawText(14, 6, shopStall ? "ARMS AND ARMOUR" : "REMEDIES", C_GOLD);
  showGold(6);
  fillRect(14, 18, TXT_W - 28, 1, C_EDGE);

  for (i = 0; i < LIST_ROWS && top + i < stall->count; i++) {
    int at = stall->ware[top + i];
    int y = 22 + i * 11;
    int mine = (wares[at].kind == WARE_POTION) ? 0
      : (you.weapon == at + 1 || you.armour == at + 1 || you.shield == at + 1);
    if (top + i == shopPick) drawCursor(14, y + 1, C_GOLD);
    drawText(24, y, wares[at].name,
      mine ? C_DIM : (top + i == shopPick ? C_GOLD : C_INK));
    copyString(scratch, "", sizeof scratch);
    appendNumber(scratch, wares[at].price, sizeof scratch);
    drawText(TXT_W - 24 - textWidth(scratch), y, scratch,
      you.gold >= wares[at].price ? C_INK : C_DYING);
  }
  {
    describeWare(stall->ware[shopPick], 0);
    drawText(14, TXT_H - 18, scratch, C_DIM);
  }
}

/* The same drink, in the middle of a fight. It costs you the turn. */
static int useInDuel(int at) {
  if (!useWare(at)) return 0;
  mine.hp = you.hp;
  paintDuelPlates();
  return 1;
}

/* Returns a line about what just happened at the counter. */
static const char *buyWare(int at) {
  const Ware *w = &wares[at];
  int how;
  if (you.gold < w->price) return "You cannot afford that, and it shows.";
  if (w->kind != WARE_POTION && you.bag[at]) return "You have one of those already.";
  you.gold -= w->price;
  how = takeWare(at);
  if (you.hp > vigourFor(you.level)) you.hp = vigourFor(you.level);
  if (w->kind == WARE_POTION) return "Wrapped and handed over.";
  /* Bought gear goes onto you only if it beats what you have, so a knife bought
     out of curiosity does not replace a good sword. */
  return how == TOOK_WORN ? "You put it on there and then."
                          : "Wrapped and handed over. Yours is still the better.";
}

/* ------------------------------------------------------------- the menu --- */

#define MENU_ENTRIES 4
static const char *const MENU[MENU_ENTRIES] = { "Sigil", "Pouch", "Record", "Leave" };

static void paintMenu(void) {
  int i;
  clearRows(0, TXT_H);
  drawFrame(TXT_W - 92, 2, 88, 14 + MENU_ENTRIES * 12);
  for (i = 0; i < MENU_ENTRIES; i++) {
    int y = 9 + i * 12;
    if (i == menuPick) drawCursor(TXT_W - 84, y + 1, C_GOLD);
    drawText(TXT_W - 74, y, MENU[i], i == menuPick ? C_GOLD : C_INK);
  }
}

static int hasRecord, titlePick;

/* What the title offers. With no record on the cartridge there is one thing to
   do and the cursor sits on it; with one there are three, and none of them
   happens on its own. Nothing takes you into the world that you did not pick. */
#define TITLE_ENTRIES (hasRecord ? 3 : 1)

static void paintTitle(void) {
  static const char *const PICK[3] = {
    "Take up the road", "Swear a new sword", "Forget that record",
  };
  int first = hasRecord ? 0 : 1, i, n = 0;

  clearPage();
  drawFrame(16, 4, TXT_W - 32, TXT_H - 16);
  centreText(10, "A SONG OF", C_INK);
  centreText(24, "ICE AND MONSTERS", C_GOLD);
  fillRect(70, 40, TXT_W - 140, 1, C_EDGE);

  /* Three entries with a record on the cartridge, one without, and the last
     line of the panel says which record it is. It all has to sit inside a
     frame ninety-six rows tall, which is what fixes these numbers. */
  for (i = first; i < 3; i++, n++) {
    int y = (hasRecord ? 46 : 56) + n * 13;
    int w = textWidth(PICK[i]);
    int here = (n == titlePick);
    if (here) drawCursor(((TXT_W - w) >> 1) - 12, y + 1, C_GOLD);
    centreText(y, PICK[i], here ? C_GOLD : C_INK);
  }
  if (hasRecord) {
    copyString(scratch, houses[record.house].full, sizeof scratch);
    appendString(scratch, ", level ", sizeof scratch);
    appendNumber(scratch, record.level, sizeof scratch);
    centreText(86, scratch, C_DIM);
  } else {
    centreText(80, "The North remembers.", C_DIM);
  }
  /* Which cartridge this is. Small, in the corner, and the first thing to ask
     for when somebody says the game did something it should not. */
  drawText(22, TXT_H - 14, BUILD_STAMP, C_DIM);
}

/* ------------------------------------------------------------ the status --- */

/* ---------------------------------------------------------------- scenes --- */

#define SCENE_TITLE 0
#define SCENE_HOUSE 1
#define SCENE_WORLD 2
#define SCENE_DUEL  3
#define SCENE_STATUS 4
#define SCENE_MENU 5
#define SCENE_BAG 6
#define SCENE_SHOP 7
#define SCENE_NAME 8

static int scene;

/* Waiting on the reader before the duel moves on. */
#define DUEL_INTRO 0
#define DUEL_MENU 1
#define DUEL_MINE 2
#define DUEL_THEIRS 3
#define DUEL_END 4
#define DUEL_TOP 5
#define DUEL_SPOILS 6            /* won, and the rail filling up for it */

static int firstMover;

static void enterWorld(int map, int x, int y, int dir) {
  scene = SCENE_WORLD;
  clearPage();
  layoutTextRows(TEXT_PLAY);
  heroActor = houses[you.house].looks[lookOf()];
  enterMap(map, x, y, dir);
}

/* Out of the gate and into the world, once a house has been sworn to and a name
   given. Lifted out of the house picker so the name screen can be the thing
   that starts the game. */
static void beginGame(void) {
  const House *h = &houses[you.house];
  sigils = 0;
  layLadder();
  enterWorld(h->startMap, h->startX, h->startY, h->startDir);
  REG_DISPCNT = (u16)(0x0040 | 0x0100 | 0x0200 | 0x1000);
  copyString(scratch, you.name, sizeof scratch);
  appendString(scratch, " goes out of the gate at ", sizeof scratch);
  appendString(scratch, maps[h->startMap].name, sizeof scratch);
  appendString(scratch, " with nothing but bare hands and one remedy. "
                        "Everything you fight in, you will take off somebody who "
                        "tried to stop you. Look in the long grass as well: "
                        "people lose things there.", sizeof scratch);
  /* And where they are going. Nine seats, nine sigils, and the first of them
     named out loud, because a player who is not told what the game is about
     will decide it is about nothing. */
  {
    int at = nextRung();
    if (at >= 0) {
      const Leader *l = &leaders[atRung[at]];
      appendString(scratch, "  Nine seats hold a sigil. Take all nine and the "
                            "realm is yours to argue over. Start with ", sizeof scratch);
      appendString(scratch, l->name, sizeof scratch);
      appendString(scratch, ", at ", sizeof scratch);
      appendString(scratch, l->seat, sizeof scratch);
      appendString(scratch, ".", sizeof scratch);
    }
  }
  openWindow(0, scratch);
}

static void endDuel(void) {
  scene = SCENE_WORLD;
  clearPage();
  layoutTextRows(TEXT_PLAY);
  loadWorldTiles();
  writeScreenblock();
  loadActors();
  PAL_BG[0] = bg_pal[0];
  REG_DISPCNT = (u16)(0x0040 | 0x0100 | 0x0200 | 0x1000);
}

static void youFell(void) {
  int bare;
  sfxLost();
  if (foeSlot >= 0) beaten[worldId][foeSlot] = 1;
  you.hp = vigourFor(you.level);
  you.gold -= you.gold / 3;
  bare = !you.weapon;
  endDuel();
  /* Somebody carries you home. It costs you a third of your purse and the
     ground you had covered, which is enough of a lesson.

     And if you were beaten with nothing in your hands, there is a knife by the
     bed when you wake. Everything in this game is taken off somebody, which
     means a player with nothing who cannot win a fight has no way back in;
     this is the floor under that, and it is only ever laid once. */
  {
    /* Somebody carries you home, and home is your own house's seat. */
    const House *h = &houses[you.house];
    enterMap(h->startMap, h->startX, h->startY, h->startDir);
  }
  copyString(scratch, "You go down. You wake at ", sizeof scratch);
  appendString(scratch, maps[houses[you.house].startMap].name, sizeof scratch);
  appendString(scratch, " with your wounds dressed, a third of your purse gone, "
                        "and a good deal of road to walk again.", sizeof scratch);
  if (bare) {
    takeWare(FLOOR_WEAPON);
    appendString(scratch, "  Somebody has left a Hunting Knife on the chest by "
                          "the bed. Nobody says who.", sizeof scratch);
  }
  openWindow(0, scratch);
}

/* What you strip off somebody who has gone down, appended to the line that is
   already being read out. A remedy goes in the pouch; the gear goes in the
   pouch too, and onto you if it is dearer than what you had, because nobody
   walks past a better sword to go and find a menu. */
static void takeTheirKit(void) {
  Kit k = kitOf(foeId, foeLevel);
  u8 piece[3];
  int i, took = 0, worn = 0, scrap = 0;

  piece[0] = k.arm; piece[1] = k.mail; piece[2] = k.shield;

  /* You take the lot. They were dressed out of the same list you are, and if
     you only took a piece at a time you would fall a rank behind everybody you
     beat and never climb back. Whatever beats what you have goes straight on;
     whatever you have already is stripped for what the metal is worth. */
  for (i = 0; i < 3; i++) {
    const Ware *w;
    int how;
    if (piece[i] == KIT_NONE) continue;
    w = &wares[piece[i]];
    how = takeWare(piece[i]);
    if (how == TOOK_SOLD) { scrap += w->price >> 4; continue; }
    if (took) appendString(scratch, took > 1 ? ", and " : ", ", sizeof scratch);
    else appendString(scratch, "  Off them you take ", sizeof scratch);
    appendString(scratch, w->name, sizeof scratch);
    if (how == TOOK_WORN) worn = 1;
    took++;
  }
  if (took) appendString(scratch, worn ? ", and put on what is better." : ".", sizeof scratch);
  if (scrap) {
    appendString(scratch, took ? "  The rest is scrap: " : "  All they had was scrap: ", sizeof scratch);
    appendNumber(scratch, scrap, sizeof scratch);
    appendString(scratch, " gold.", sizeof scratch);
    took++;
  }
  if (k.remedy != KIT_NONE) {
    takeWare(k.remedy);
    appendString(scratch, took ? "  There is a " : "  They were carrying a ", sizeof scratch);
    appendString(scratch, wares[k.remedy].name, sizeof scratch);
    appendString(scratch, took ? " on them as well." : ".", sizeof scratch);
    took++;
  }
  if (!took) appendString(scratch, "  They had nothing worth taking.", sizeof scratch);
}

/* Somebody dropped something in the reeds a long time ago, or lost it running.
   Mostly a remedy; now and then a piece of gear worth about what somebody of
   your own standing would be carrying, which is what keeps looking in the grass
   worth the walk however far along you are. */
static void findInGrass(void) {
  u32 h = roll(0xFFFF) | (roll(0xFFFF) << 16);
  int budget = 200 + you.level * 150;
  int kind, best = -1, i;

  if (budget > KIT_CEILING) budget = KIT_CEILING;

  if (hashUpTo(h, 100) < 40) {
    int p = you.level / 18;
    int found = p > 3 ? 3 : p;
    takeWare(found);
    copyString(scratch, "Something is lying in the grass: a ", sizeof scratch);
    appendString(scratch, wares[found].name, sizeof scratch);
    appendString(scratch, ", and nobody is coming back for it.", sizeof scratch);
    openWindow(0, scratch);
    return;
  }

  { int r = hashUpTo(rot(h, 5), 100);
    kind = r < 40 ? WARE_WEAPON : (r < 75 ? WARE_ARMOUR : WARE_SHIELD); }
  for (i = 0; i < WARE_COUNT; i++) {
    if (wares[i].kind != kind || wares[i].price > budget) continue;
    if (best < 0 || wares[i].price > wares[best].price) best = i;
  }
  if (best < 0) {
    takeWare(0);
    openWindow(0, "Something is lying in the grass: a Maester's Kit, still sealed.");
    return;
  }
  {
    int how = takeWare(best);
    copyString(scratch, "Something is lying in the grass: a ", sizeof scratch);
    appendString(scratch, wares[best].name, sizeof scratch);
    if (how == TOOK_WORN) {
      appendString(scratch, ", better than what you had. It is yours now.", sizeof scratch);
    } else if (how == TOOK_SOLD) {
      appendString(scratch, ". You have one, so it goes in the purse: ", sizeof scratch);
      appendNumber(scratch, wares[best].price >> 3, sizeof scratch);
      appendString(scratch, " gold the richer.", sizeof scratch);
    } else {
      appendString(scratch, ", worse than what you carry, but worth keeping.", sizeof scratch);
    }
  }
  openWindow(0, scratch);
}

/* A win is not over the moment they go down. You stay in the yard, the purse
   and the experience are read out, the rail fills up for it, and every rung it
   passes stops it long enough to say what that rung bought. Only then do you
   walk away. */
static void theyFell(void) {
  int won = expFrom(foeLevel, you.level);
  sfxWon();
  you.gold += foePurse;
  you.exp += won;
  if (foeSlot >= 0) beaten[worldId][foeSlot] = 1;
  if (foeDef->mortal) {
    if (foeSlot >= 0) { slain[worldId][foeSlot] = 1; crowdAlive[foeSlot] = 0; }
    you.kills++;
  }
  /* You get your wind back after a win: not all of it, but enough to keep
     walking, since there is no maester between here and the next town. The
     bar rises to it in front of you rather than being different afterwards. */
  you.hp = mine.hp + (vigourFor(you.level) >> 2);
  if (you.hp > vigourFor(you.level)) you.hp = vigourFor(you.level);
  mine.hp = you.hp;

  duelPhase = DUEL_SPOILS;
  copyString(scratch, foeDef->defeat, sizeof scratch);
  appendString(scratch, "  You take ", sizeof scratch);
  appendNumber(scratch, foePurse, sizeof scratch);
  appendString(scratch, " gold and ", sizeof scratch);
  appendNumber(scratch, won, sizeof scratch);
  appendString(scratch, " experience.", sizeof scratch);
  /* And if that was one of the nine, the sigil goes on your banner. It is the
     only thing in the game that is not gold or steel, and it is the only thing
     that says how far through it you are. */
  {
    int lead = leaderFor(foeId);
    if (lead >= 0 && !haveSigil(lead)) {
      int held;
      sigils |= (u16)(1 << lead);
      held = countSigils();
      sfxRank();
      appendString(scratch, "  You take the ", sizeof scratch);
      appendString(scratch, leaders[lead].sigil, sizeof scratch);
      appendString(scratch, " Sigil. That is ", sizeof scratch);
      appendNumber(scratch, held, sizeof scratch);
      appendString(scratch, " of ", sizeof scratch);
      appendNumber(scratch, LEADER_COUNT, sizeof scratch);
      appendString(scratch, ".", sizeof scratch);
    }
  }
  takeTheirKit();
  duelSay(0, scratch);
}

/* One frame of the rail filling. It waits for the line above it to finish
   typing, then climbs; each time it reaches the end of a rung it takes the
   level, empties, and says what the level was worth. */
static int spoilsDone(void) { return shownExp >= you.exp; }

static void tickSpoils(void) {
  int next;
  if (spoilsDone()) return;
  if (windowOpen && !typeDone) return;
  next = expForLevel(you.level + 1);
  shownExp += 1 + (you.exp - shownExp) / 20;
  if (shownExp > you.exp) shownExp = you.exp;
  if (you.level < 50 && shownExp >= next) {
    you.level++;
    mine.maxHp = vigourFor(you.level);
    mine.might = mightFor(you.level);
    mine.guard = guardFor(you.level);
    mine.swiftness = swiftFor(you.level);
    you.hp = mine.maxHp;
    mine.hp = you.hp;
    sfxRank();
    reckonTechniques();
    copyString(scratch, "You are level ", sizeof scratch);
    appendNumber(scratch, you.level, sizeof scratch);
    appendString(scratch, ".  Might ", sizeof scratch);
    appendNumber(scratch, mine.might, sizeof scratch);
    appendString(scratch, ", guard ", sizeof scratch);
    appendNumber(scratch, mine.guard, sizeof scratch);
    appendString(scratch, ", swiftness ", sizeof scratch);
    appendNumber(scratch, mine.swiftness, sizeof scratch);
    appendString(scratch, ", and whole again.", sizeof scratch);
    {
      int taught = learnedAt(you.level);
      if (taught >= 0) {
        appendString(scratch, "  You have learned ", sizeof scratch);
        appendString(scratch, techniques[taught].name, sizeof scratch);
        appendString(scratch, ".", sizeof scratch);
      }
    }
    duelSay(0, scratch);
    paintDuelPlates();
  }
  paintDuelBars();
}

/* The bars and the rail catching up with what the numbers already say. */
static void tickDuelBars(void) {
  int step, moved = 0;
  step = 1 + mine.maxHp / 48;
  if (shownMine < mine.hp) { shownMine += step; if (shownMine > mine.hp) shownMine = mine.hp; moved = 1; }
  else if (shownMine > mine.hp) { shownMine -= step; if (shownMine < mine.hp) shownMine = mine.hp; moved = 1; }
  step = 1 + theirs.maxHp / 48;
  if (shownTheirs < theirs.hp) { shownTheirs += step; if (shownTheirs > theirs.hp) shownTheirs = theirs.hp; moved = 1; }
  else if (shownTheirs > theirs.hp) { shownTheirs -= step; if (shownTheirs < theirs.hp) shownTheirs = theirs.hp; moved = 1; }
  if (moved) paintDuelBars();
}

static void duelTurn(void) {
  /* Both sides swing; who goes first is decided by swiftness. */
  if (duelPhase == DUEL_MINE) {
    Fighter *a = firstMover ? &mine : &theirs;
    Fighter *d = firstMover ? &theirs : &mine;
    int tech = firstMover ? mine.tech[duelMenu] : theirs.tech[roll(4)];
    if (swing(a, d, tech, a == &mine)) {
      duelPhase = DUEL_END;
      duelOver = (d == &mine) ? 2 : 1;
    } else {
      duelPhase = DUEL_THEIRS;
    }
  } else {
    Fighter *a = firstMover ? &theirs : &mine;
    Fighter *d = firstMover ? &mine : &theirs;
    int tech = firstMover ? theirs.tech[roll(4)] : mine.tech[duelMenu];
    if (swing(a, d, tech, a == &mine)) {
      duelPhase = DUEL_END;
      duelOver = (d == &mine) ? 2 : 1;
    } else {
      duelPhase = DUEL_TOP;
    }
  }
}

/* A duel is fought somewhere, not in front of a black rectangle. Two flat
   tiles and a horizon are enough to say "a yard, at dusk" — and they cost two
   tiles at the top of the map's own character memory, which no map reaches. */
#define DUEL_BAND 496            /* eleven flat tiles, above anything a map uses */
#define DUEL_PAL 200             /* and eleven colours, above anything the art uses */

/* Dusk over a yard, banded from a deep blue overhead down to a low sun, then
   two courses of trodden earth. Eleven flat tiles and eleven palette entries —
   which is how a handheld draws a gradient, since it has no such thing. */
/* Nine bands of sky and two courses of ground apiece. Every duel in the game
   was fought under the same dusk, which made the screen a player sees more than
   any other the one screen that never changed. Where you are standing when you
   draw decides which of these you fight under. */
static const u16 SKIES[6][11] = {
  /* dusk over a yard, which is what the rest of the world still gets */
  { RGB15(3,4,11), RGB15(4,5,12), RGB15(6,6,13), RGB15(8,7,13), RGB15(11,8,12),
    RGB15(14,9,11), RGB15(18,10,10), RGB15(22,12,9), RGB15(26,15,9),
    RGB15(12,10,7), RGB15(9,8,6) },
  /* the North and the Wall: a cold white sky coming down onto snow */
  { RGB15(6,9,15), RGB15(8,11,17), RGB15(10,13,19), RGB15(13,16,21), RGB15(16,19,23),
    RGB15(19,22,25), RGB15(22,24,27), RGB15(25,27,29), RGB15(27,29,31),
    RGB15(24,26,29), RGB15(21,23,27) },
  /* under the trees: light through a canopy, onto leaf mould */
  { RGB15(4,7,6), RGB15(5,9,7), RGB15(6,11,8), RGB15(8,13,8), RGB15(10,15,9),
    RGB15(12,17,10), RGB15(14,19,11), RGB15(16,21,12), RGB15(18,23,13),
    RGB15(10,9,6), RGB15(8,7,5) },
  /* the Riverlands and the Vale: open blue over a green bank */
  { RGB15(6,12,22), RGB15(8,14,24), RGB15(10,16,25), RGB15(12,18,26), RGB15(15,20,27),
    RGB15(18,22,28), RGB15(21,24,29), RGB15(24,26,30), RGB15(27,28,31),
    RGB15(12,17,9), RGB15(10,14,7) },
  /* Dragonstone: an old fire under a black sky, and ash to stand on */
  { RGB15(2,1,2), RGB15(4,2,3), RGB15(6,2,3), RGB15(9,3,3), RGB15(12,4,4),
    RGB15(15,5,4), RGB15(19,6,4), RGB15(23,8,5), RGB15(27,11,6),
    RGB15(8,7,7), RGB15(6,5,5) },
  /* indoors: no sky at all, torchlight down a stone wall onto flagstone */
  { RGB15(3,3,4), RGB15(4,4,5), RGB15(5,5,6), RGB15(6,6,7), RGB15(8,7,8),
    RGB15(9,8,9), RGB15(11,10,10), RGB15(13,11,11), RGB15(15,13,12),
    RGB15(13,12,10), RGB15(10,9,8) },
};

static void paintDuelGround(void) {
  int i, w, ty, tx;
  const u16 *sky = SKIES[world->scene < 6 ? world->scene : 0];
  for (i = 0; i < 11; i++) {
    PAL_BG[DUEL_PAL + i] = sky[i];
    for (w = 0; w < 16; w++) {
      VRAM_BG_CHR[(DUEL_BAND + i) * 16 + w] = 0x01010101u * (u32)(DUEL_PAL + i);
    }
  }
  for (ty = 0; ty < 64; ty++) {
    /* Nine bands of sky over the top nine rows, then the ground. */
    int band = ty < 8 ? ty + 1 : (ty & 1) ? 9 : 10;
    volatile u16 *rowBase = VRAM_BG_MAP + ((ty >> 5) << 11) + ((ty & 31) << 5);
    for (tx = 0; tx < 64; tx++) {
      volatile u16 *cell = rowBase + ((tx >> 5) << 10) + (tx & 31);
      *cell = (u16)(DUEL_BAND + band);
    }
  }
  REG_BG0HOFS = 0;
  REG_BG0VOFS = 0;
}

/* ------------------------------------------------------------ drawing on -- */
/* A fight does not simply appear. The screen cracks white twice, falls to
   black, and comes up again in the yard — which is what the handhelds do, and
   what stops a duel reading as the game having glitched. */

static int shift, shiftDuellist, shiftBank, shiftSlot;

static void setFade(int black, int amount) {
  REG_BLDCNT = (u16)(0x003F | (black ? (3 << 6) : (2 << 6)));
  REG_BLDY = (u16)(amount < 0 ? 0 : amount > 16 ? 16 : amount);
}

static void clearFade(void) { REG_BLDCNT = 0; REG_BLDY = 0; }

static void callToArms(int duellist, int bank, int slot) {
  shiftDuellist = duellist;
  shiftBank = bank;
  shiftSlot = slot;
  shift = 48;
}

static void tickShift(void) {
  int t = 48 - shift;
  if (t < 4) setFade(0, 16);
  else if (t < 8) setFade(0, 0);
  else if (t < 12) setFade(0, 16);
  else if (t < 16) setFade(0, 0);
  else if (t < 32) setFade(1, t - 16);
  else if (t == 32) {
    setFade(1, 16);
    scene = SCENE_DUEL;
    duelPhase = DUEL_INTRO;
    paintDuelGround();
    REG_DISPCNT = (u16)(0x0040 | 0x0100 | 0x0200 | 0x1000);
    beginDuel(shiftDuellist, shiftBank, shiftSlot);
  } else setFade(1, 48 - t);
  if (!--shift) clearFade();
}

static void tryTalk(void) {
  int fx = (hero.px >> 4) + DIR_X[hero.dir];
  int fy = (hero.py >> 4) + DIR_Y[hero.dir];
  int who = crowdAt(fx, fy);
  if (who >= 0) {
    const Npc *npc = &world->npcs[who];
    /* Face whoever spoke to you; it is rude not to. */
    /* Somebody spoken to mid-stride finishes the step first. Stopping them
       where they stand leaves them straddling two tiles: drawn on one, standing
       on the other, and walked through as if they were not there. */
    if (crowd[who].walk) {
      crowd[who].px = (s16)(crowd[who].px + crowd[who].dx * crowd[who].walk);
      crowd[who].py = (s16)(crowd[who].py + crowd[who].dy * crowd[who].walk);
      crowd[who].walk = 0;
    }
    crowd[who].dir = (u8)(hero.dir ^ 1);
    if (npc->heals && you.hp < vigourFor(you.level)) {
      you.hp = vigourFor(you.level);
      openWindow(npc->name,
        "Sit. There. Whole again, and no charge to a sworn sword of a great house.");
      return;
    }
    /* Everybody has something for somebody who stops to speak to them, once.
       The road was full of people who said a line and gave nothing, so there
       was no reason to talk to any of them twice, or often once. What they give
       is what they would have: a smallfolk a handful of coin, a maester
       something to drink, and now and then somebody has a piece of kit they no
       longer need. */
    copyString(scratch, npc->line, sizeof scratch);
    if (!gifted[worldId][who]) {
      int rank = duellists[npc->duellist].level;
      int roll100 = (int)roll(100);
      gifted[worldId][who] = 1;
      if (npc->heals || roll100 < 22) {
        int p = rank / 16;
        int remedy = p > 3 ? 3 : p;
        takeWare(remedy);
        appendString(scratch, "  They press a ", sizeof scratch);
        appendString(scratch, wares[remedy].name, sizeof scratch);
        appendString(scratch, " on you.", sizeof scratch);
      } else if (roll100 < 30) {
        /* Something off a shelf they have no use for any more. Deliberately
           behind the curve: a gift should be a nudge, never a shortcut past
           the smith. */
        int budget = 80 + rank * 40, best = -1, i;
        int kind = roll100 < 26 ? WARE_WEAPON : WARE_ARMOUR;
        if (budget > KIT_CEILING) budget = KIT_CEILING;
        for (i = 0; i < WARE_COUNT; i++) {
          if (wares[i].kind != kind || wares[i].price > budget) continue;
          if (best < 0 || wares[i].price > wares[best].price) best = i;
        }
        if (best >= 0) {
          int how = takeWare(best);
          appendString(scratch, "  They dig out a ", sizeof scratch);
          appendString(scratch, wares[best].name, sizeof scratch);
          appendString(scratch, how == TOOK_WORN ? " and make you put it on."
                                                 : " and press it on you.", sizeof scratch);
        }
      } else {
        int coin = 5 + rank * 2 + (int)roll(1 + rank);
        you.gold += coin;
        appendString(scratch, "  They press ", sizeof scratch);
        appendNumber(scratch, coin, sizeof scratch);
        appendString(scratch, " gold into your hand.", sizeof scratch);
      }
    }
    openWindow(npc->name, scratch);
    if (npc->trade) { afterWindow = npc->trade; }
    /* Somebody whose whole purpose is to fight you draws once they have said
       their piece. SELECT still challenges anybody at all; this is so that a
       lord in his own hall does not simply stand there after speaking. */
    if (npc->challenges && npc->fights && !beaten[worldId][who]) afterDuel = who;
    return;
  }
  {
    const Sign *sign = signAt(fx, fy);
    if (sign) openWindow(0, sign->text);
  }
}

static void tryChallenge(void) {
  int fx = (hero.px >> 4) + DIR_X[hero.dir];
  int fy = (hero.py >> 4) + DIR_Y[hero.dir];
  int who = crowdAt(fx, fy);
  if (who < 0) { openWindow(0, "There is nobody there to fight."); return; }
  if (!world->npcs[who].fights) {
    openWindow(world->npcs[who].name, "I will not draw on you, and you know it.");
    return;
  }
  callToArms(world->npcs[who].duellist, world->npcs[who].bank, who);
}

/* Somebody was already in the grass when you walked into it. */
static void ambush(void) {
  const Ambush *a = &world->ambushes[roll(world->ambushCount)];
  callToArms(a->duellist, a->bank, -1);
}

/* ------------------------------------------------------------- spotted ---- */
/* Somebody who fights and who is facing your way will see you coming, put an
   exclamation over their head, walk up, and draw. This is the single most
   recognisable thing a handheld role-playing game does, and the road is a
   different place with it. */

static void lookForTrouble(void) {
  int i, step;
  if (spotted >= 0 || shift || windowOpen) return;
  for (i = 0; i < crowdCount; i++) {
    const Npc *npc = &world->npcs[i];
    int x, y;
    if (!crowdAlive[i] || !npc->sight || !npc->fights) continue;
    if (beaten[worldId][i] || crowd[i].walk) continue;
    x = crowd[i].px >> 4;
    y = crowd[i].py >> 4;
    for (step = 1; step <= npc->sight; step++) {
      x += DIR_X[crowd[i].dir];
      y += DIR_Y[crowd[i].dir];
      if (solidAt(x, y)) break;
      if ((hero.px >> 4) == x && (hero.py >> 4) == y && !hero.walk) {
        spotted = i;
        spotTimer = 44;
        return;
      }
    }
  }
}

/* Once they have seen you they close the distance, then say their piece. */
static void tickSpotted(void) {
  Body *them = &crowd[spotted];
  int tx, ty, hx, hy;
  if (spotTimer > 0) { spotTimer--; return; }
  if (them->walk) { moveBody(them, WALK_SPEED); return; }

  tx = them->px >> 4; ty = them->py >> 4;
  hx = hero.px >> 4; hy = hero.py >> 4;
  if ((tx == hx && (ty == hy - 1 || ty == hy + 1))
   || (ty == hy && (tx == hx - 1 || tx == hx + 1))) {
    int who = spotted;
    them->dir = (u8)(tx == hx ? (ty < hy ? 0 : 1) : (tx < hx ? 3 : 2));
    hero.dir = (u8)(tx == hx ? (ty < hy ? 1 : 0) : (tx < hx ? 2 : 3));
    beaten[worldId][who] = 1;
    spotted = -1;
    callToArms(world->npcs[who].duellist, world->npcs[who].bank, who);
    return;
  }
  {
    int dir = (tx != hx) ? (tx < hx ? 3 : 2) : (ty < hy ? 0 : 1);
    int nx = tx + DIR_X[dir], ny = ty + DIR_Y[dir];
    if (solidAt(nx, ny) || occupied(nx, ny, spotted)) {
      dir = (ty != hy) ? (ty < hy ? 0 : 1) : (tx < hx ? 3 : 2);
      nx = tx + DIR_X[dir]; ny = ty + DIR_Y[dir];
      if (solidAt(nx, ny) || occupied(nx, ny, spotted)) { spotted = -1; return; }
    }
    stepBody(them, dir);
  }
}

/* Everyone who is not waiting to say something has somewhere to be. */
static void moveCrowd(void) {
  int i;
  for (i = 0; i < crowdCount; i++) {
    if (!crowdAlive[i]) continue;
    if (crowd[i].walk) { moveBody(&crowd[i], WALK_SPEED); continue; }
    if (!world->npcs[i].roams) continue;
    if (crowdTimer[i]) { crowdTimer[i]--; continue; }
    /* Somebody who happens to be standing on a doorstep moves on sooner, so a
       door is never blocked for long. */
    crowdTimer[i] = (nearWarp(crowd[i].px >> 4, crowd[i].py >> 4)
                     || ledgeGate(crowd[i].px >> 4, crowd[i].py >> 4)
                     || gateAt(crowd[i].px >> 4, crowd[i].py >> 4))
      ? (u16)(10 + roll(30)) : (u16)(30 + roll(150));
    {
      int dir = (int)roll(4);
      int nx = (crowd[i].px >> 4) + DIR_X[dir];
      int ny = (crowd[i].py >> 4) + DIR_Y[dir];
      crowd[i].dir = (u8)dir;
      /* Nobody strays more than three tiles from where they belong. */
      if (nx > world->npcs[i].x + 3 || nx < world->npcs[i].x - 3) continue;
      if (ny > world->npcs[i].y + 3 || ny < world->npcs[i].y - 3) continue;
      if (solidAt(nx, ny) || occupied(nx, ny, i)) continue;
      if (nearWarp(nx, ny) || ledgeAt(nx, ny) || ledgeGate(nx, ny)
          || gateAt(nx, ny)) continue;
      stepBody(&crowd[i], dir);
    }
  }
}

/* Objects are handed to the hardware front to back, so whoever is lower on the
   screen is drawn over whoever is behind them. */
static void placeEveryone(void) {
  int order[MAX_CROWD + 1], count = 0, i, j;
  hideAllObjects();

  for (i = 0; i < crowdCount; i++) if (crowdAlive[i]) order[count++] = i;
  order[count++] = -1;                              /* the player */

  for (i = 1; i < count; i++) {
    int key = order[i];
    int keyY = key < 0 ? hero.py : crowd[key].py;
    for (j = i - 1; j >= 0; j--) {
      int otherY = order[j] < 0 ? hero.py : crowd[order[j]].py;
      if (otherY >= keyY) break;
      order[j + 1] = order[j];
    }
    order[j + 1] = key;
  }

  if (coverAt(hero.px >> 4, hero.py >> 4)) {
    placeGrass(MAX_CROWD + 1, hero.px - camX, hero.py - camY,
      hero.walk ? (int)((frameClock >> 2) & 1) : 0,
      world->frost ? FROST_BANK : GRASS_BANK);
  }
  if (spotted >= 0 && spotTimer > 0) {
    placeBubble(MAX_CROWD + 2, crowd[spotted].px - camX,
      crowd[spotted].py - camY - 30);
  }

  /* A lower object number is drawn nearer the front, so the list — sorted with
     the furthest back first — is handed over in reverse. */
  for (i = 0; i < count; i++) {
    int who = order[i];
    int slot = count - 1 - i;
    if (who < 0) {
      placeObject(slot, hero.px - camX, hero.py - camY - 16 - hopLift(&hero),
        PLAYER_TILE_BASE + frameOf(&hero, 4) * ACTOR_FRAME_TILES, 0);
    } else {
      int bank = world->npcs[who].bank;
      placeObject(slot, crowd[who].px - camX, crowd[who].py - camY - 16,
        NPC_TILE_BASE + bank * NPC_TILE_STRIDE + frameOf(&crowd[who], 2) * ACTOR_FRAME_TILES,
        bank + 1);
    }
  }
}

static int clampCamera(int want, int span, int screen) {
  if (span <= screen) return -((screen - span) >> 1);
  if (want < 0) return 0;
  if (want > span - screen) return span - screen;
  return want;
}

#ifdef HOST_TEST
extern int hostFramesLeft;
extern void hostFrame(void);
#define HOST_TICK() do { hostFrame(); if (--hostFramesLeft < 0) return 0; } while (0)
#else
#define HOST_TICK() do { } while (0)
#endif

int main(void) {
  buildGlyphTable();
  hideAllObjects();
  setUpVideo();
  soundUp();
  you.house = 0; you.level = 5; you.gold = 220;
  you.hp = vigourFor(you.level);
  you.exp = expForLevel(you.level);
  hasRecord = findRecord();
  /* The belt and braces: hold SELECT while it switches on and the record is
     ignored, whatever an emulator has kept in its save file. */
  if ((~REG_KEYINPUT & KEY_SELECT) != 0) hasRecord = 0;
  paintTitle();
  flushPage();
  pushObjects();
  scene = SCENE_TITLE;
  playTune(TUNE_HALL);
  REG_DISPCNT = (u16)(0x0040 | 0x0200);

  for (;;) {
    HOST_TICK();
    keysWas = keysNow;
    keysNow = (u16)(~REG_KEYINPUT & 0x03FF);
    seed += keysNow + 1;
    frameClock++;
    tickSound();
    /* One tune for the road, another once steel is out, and the title's own. */
    if (hit(KEY_A) && scene != SCENE_WORLD && scene != SCENE_DUEL) sfxYes();
    if (scene == SCENE_TITLE || scene == SCENE_HOUSE) playTune(TUNE_HALL);
    else if (scene == SCENE_DUEL || (scene == SCENE_BAG && bagInDuel)) playTune(TUNE_DUEL);
    else playTune(TUNE_ROAD);

    if (shift) {
      tickShift();
      keysNow = 0;                      /* the buttons are held while it plays */
      if (scene == SCENE_DUEL) { waitVBlank(); pushObjects(); flushPage(); continue; }
    }

    if (scene == SCENE_TITLE) {
      int was = titlePick;
      if (hit(KEY_UP) && titlePick) titlePick--;
      if (hit(KEY_DOWN) && titlePick < TITLE_ENTRIES - 1) titlePick++;
      if (titlePick != was) { sfxPick(); paintTitle(); }
      if (hit(KEY_START) || hit(KEY_A)) {
        /* With no record the one entry is "swear a new sword", so the cursor
           position means the same thing either way once it is offset. */
        int chose = hasRecord ? titlePick : 1;
        if (chose == 0) {
          takeUpRecord();
          PAL_BG[TXT_BANK * 16 + C_HOUSE] = houses[you.house].colour;
          PAL_BG[TXT_BANK * 16 + C_TRIM] = houses[you.house].accent;
          PAL_BG[TXT_BANK * 16 + C_EDGE] = houses[you.house].colour;
          enterWorld(record.worldId, record.x, record.y, record.dir);
          REG_DISPCNT = (u16)(0x0040 | 0x0100 | 0x0200 | 0x1000);
        } else if (chose == 1) {
          scene = SCENE_HOUSE;
          houseChoice = 0;
          paintHousePicker();
        } else {
          /* Somebody who wants the old save gone should be able to be rid of
             it without going looking for a file on a telephone. */
          forgetRecord();
          hasRecord = 0;
          titlePick = 0;
          paintTitle();
        }
      }
    } else if (scene == SCENE_HOUSE) {
      if (hit(KEY_LEFT) && houseChoice > 0) { houseChoice--; sfxPick(); paintHousePicker(); }
      if (hit(KEY_RIGHT) && houseChoice < HOUSE_COUNT - 1) { houseChoice++; sfxPick(); paintHousePicker(); }
      if (hit(KEY_A)) {
        you.house = houseChoice;
        /* Where you begin decides what you begin as. The seats are not equally
           gentle ground, so the level you walk out at is set to the one you are
           standing on rather than to five for everybody. */
        you.level = houses[you.house].startLevel;
        you.exp = expForLevel(you.level);
        you.hp = vigourFor(you.level);
        /* You are sent out of the yard with your bare hands and one remedy.
           Everything you fight in, you take off somebody. */
        you.weapon = 0;
        you.armour = 0;
        you.shield = 0;
        you.bag[START_POTION] = 1;
        reckonTechniques();
        PAL_BG[TXT_BANK * 16 + C_HOUSE] = houses[you.house].colour;
        PAL_BG[TXT_BANK * 16 + C_TRIM] = houses[you.house].accent;
        PAL_BG[TXT_BANK * 16 + C_EDGE] = houses[you.house].colour;
        /* Who you are before where you are. */
        scene = SCENE_NAME;
        nameCol = 0;
        nameRow = 0;
        nameLen = 0;
        you.name[0] = 0;
        layoutTextRows(TEXT_TOP);
        paintNamer();
      }
    } else if (scene == SCENE_NAME) {
      int was = namePick;
      if (hit(KEY_LEFT) && nameCol) nameCol--;
      if (hit(KEY_RIGHT) && nameCol < NAME_COLS - 1) nameCol++;
      if (hit(KEY_UP) && nameRow) nameRow--;
      if (hit(KEY_DOWN) && nameRow < NAME_ROWS - 1) nameRow++;
      if (namePick != was) { sfxPick(); paintNamer(); }

      if (hit(KEY_A) && nameLen < NAME_MAX) {
        you.name[nameLen++] = NAME_KEYS[namePick];
        you.name[nameLen] = 0;
        paintNamer();
      } else if (hit(KEY_SELECT) && nameLen && nameLen < NAME_MAX) {
        you.name[nameLen++] = ' ';
        you.name[nameLen] = 0;
        paintNamer();
      } else if (hit(KEY_B) && nameLen) {
        you.name[--nameLen] = 0;
        sfxPick();
        paintNamer();
      } else if (hit(KEY_START)) {
        /* Somebody who will not be told keeps their house's name. */
        if (!nameLen) copyString(you.name, houses[you.house].name, sizeof you.name);
        beginGame();
      }
    } else if (scene == SCENE_STATUS) {
      if (hit(KEY_START) || hit(KEY_B) || hit(KEY_A)) {
        scene = SCENE_MENU;
        clearPage();
        layoutTextRows(TEXT_TOP);
        paintMenu();
      }
    } else if (scene == SCENE_MENU) {
      int was = menuPick;
      if (hit(KEY_UP) && menuPick > 0) menuPick--;
      if (hit(KEY_DOWN) && menuPick < MENU_ENTRIES - 1) menuPick++;
      if (menuPick != was) { sfxPick(); paintMenu(); }
      if (hit(KEY_B) || hit(KEY_START)) {
        scene = SCENE_WORLD;
        clearPage();
        layoutTextRows(TEXT_PLAY);
      } else if (hit(KEY_A)) {
        if (menuPick == 0) {
          scene = SCENE_STATUS;
          clearPage();
          layoutTextRows(TEXT_MIDDLE);
          paintStatus();
        } else if (menuPick == 1) {
          scene = SCENE_BAG;
          bagInDuel = 0;
          bagPick = 0;
          clearPage();
          layoutTextRows(TEXT_TOP);
          paintBag();
        } else if (menuPick == 2) {
          keepRecord();
          clearPage();
          layoutTextRows(TEXT_PLAY);
          scene = SCENE_WORLD;
          openWindow(0, "Your record is written down. The maesters keep worse ones.");
        } else {
          scene = SCENE_WORLD;
          clearPage();
          layoutTextRows(TEXT_PLAY);
        }
      }
    } else if (scene == SCENE_BAG) {
      int have = carrying(), was = bagPick;
      if (hit(KEY_UP) && bagPick > 0) bagPick--;
      if (hit(KEY_DOWN) && bagPick < have - 1) bagPick++;
      if (bagPick != was) { sfxPick(); paintBag(); }
      if (hit(KEY_B)) {
        clearPage();
        if (bagInDuel) {
          scene = SCENE_DUEL;
          layoutTextRows(TEXT_DUEL);
          paintDuelPlates();
          paintDuelMenu();
        } else {
          scene = SCENE_MENU;
          layoutTextRows(TEXT_TOP);
          paintMenu();
        }
      } else if (hit(KEY_A) && have) {
        int at = nthCarried(bagPick);
        int worked = bagInDuel ? useInDuel(at) : useWare(at);
        if (bagPick >= carrying() && bagPick) bagPick--;
        if (bagInDuel && worked) {
          clearPage();
          scene = SCENE_DUEL;
          layoutTextRows(TEXT_DUEL);
          paintDuelPlates();
          duelPhase = DUEL_THEIRS;
          copyString(scratch, "You drink it down.", sizeof scratch);
          duelSay(0, scratch);
        } else if (worked) {
          clearPage();
          scene = SCENE_WORLD;
          layoutTextRows(TEXT_PLAY);
          openWindow(0, "Better. Not good, but better.");
        } else {
          paintBag();
        }
      }
    } else if (scene == SCENE_SHOP) {
      const Stall *stall = &stalls[shopStall];
      int was = shopPick;
      if (hit(KEY_UP) && shopPick > 0) shopPick--;
      if (hit(KEY_DOWN) && shopPick < stall->count - 1) shopPick++;
      if (shopPick != was) { sfxPick(); paintShop(); }
      if (hit(KEY_B)) {
        scene = SCENE_WORLD;
        clearPage();
        layoutTextRows(TEXT_PLAY);
      } else if (hit(KEY_A)) {
        const char *said = buyWare(stall->ware[shopPick]);
        paintShop();
        scene = SCENE_WORLD;
        clearPage();
        layoutTextRows(TEXT_PLAY);
        openWindow(0, said);
        afterWindow = shopStall + 1;
      }
    } else if (scene == SCENE_DUEL) {
      /* No button is taken while a swing is still playing or while the rail is
         still filling: you see the blow land and the bar climb before the game
         will let you skip past them. */
      int busy = fxLeft || (duelPhase == DUEL_SPOILS && !spoilsDone());
      /* A swing reads itself out. Every blow used to need a button press of its
         own, so a duel of ten exchanges was twenty presses of A on twenty
         near-identical screens, which is most of what made fighting a chore.
         The workaday half-turns now carry on by themselves once the line has
         finished typing and been left up long enough to read; A still skips
         ahead at once for anybody faster than that. Everything that actually
         matters - who you are facing, somebody going down, what you took off
         them - still waits to be dismissed. */
      if (windowOpen && !busy && typeDone
          && (duelPhase == DUEL_MINE || duelPhase == DUEL_THEIRS)) {
        if (++readHold > 70) keysNow |= KEY_A;
      } else if (!windowOpen) {
        readHold = 0;
      }
      if (windowOpen) {
        if (!busy && (hit(KEY_A) || hit(KEY_B))) {
          readHold = 0;
          if (!advanceWindow()) {
            if (duelPhase == DUEL_INTRO) {
              firstMover = mine.swiftness >= theirs.swiftness;
              duelPhase = DUEL_TOP;
            } else if (duelPhase == DUEL_END) {
              if (duelOver == 2) youFell(); else theyFell();
            } else if (duelPhase == DUEL_SPOILS) {
              /* The purse is counted, the rail is full: away you go. */
              endDuel();
            } else if (duelPhase == DUEL_MINE || duelPhase == DUEL_THEIRS) {
              /* Only a half-turn that is actually owed gets swung. Falling
                 through to here on the menu phase would hand out a free hit. */
              duelTurn();
            }
            if (scene == SCENE_DUEL && duelPhase == DUEL_TOP && !windowOpen) paintDuelTop();
          }
        }
      } else if (duelPhase == DUEL_TOP) {
        int was = topPick;
        if (hit(KEY_LEFT) && (topPick & 1)) topPick--;
        if (hit(KEY_RIGHT) && !(topPick & 1)) topPick++;
        if (hit(KEY_UP) && topPick > 1) topPick -= 2;
        if (hit(KEY_DOWN) && topPick < 2) topPick += 2;
        if (topPick != was) { sfxPick(); paintDuelTop(); }
        if (hit(KEY_A)) {
          if (topPick == 0) { duelPhase = DUEL_MENU; paintDuelMenu(); }
          else if (topPick == 1) {
            scene = SCENE_BAG;
            bagInDuel = 1;
            bagPick = 0;
            clearPage();
            layoutTextRows(TEXT_TOP);
            paintBag();
          } else if (topPick == 2) {
            duelMenu = 3;                      /* Guard always keeps the last slot */
            paintFrameOnly();
            mine.defending = 0;
            duelPhase = DUEL_MINE;
            duelTurn();
          } else {
            if (roll(100) < 55) {
              you.hp = mine.hp;
              endDuel();
              openWindow(0, "You break off and put distance between you.");
            } else {
              duelSay(0, "There is nowhere to go. Finish it.");
              duelPhase = DUEL_MINE;
            }
          }
        }
      } else if (duelPhase == DUEL_MENU) {
        int was = duelMenu;
        if (hit(KEY_LEFT) && (duelMenu & 1)) duelMenu--;
        if (hit(KEY_RIGHT) && !(duelMenu & 1)) duelMenu++;
        if (hit(KEY_UP) && duelMenu > 1) duelMenu -= 2;
        if (hit(KEY_DOWN) && duelMenu < 2) duelMenu += 2;
        if (duelMenu != was) { sfxPick(); paintDuelMenu(); }
        if (hit(KEY_B)) { duelPhase = DUEL_TOP; paintDuelTop(); }
        else if (hit(KEY_A)) {
          paintFrameOnly();
          mine.defending = 0;
          duelPhase = DUEL_MINE;
          duelTurn();
        }
      }
    } else {
      /* The world. */
      if (windowOpen) {
        /* One press, one page. Only the press that reads the last page of what
           somebody said does anything else. */
        if (hit(KEY_A) || hit(KEY_B)) {
          if (!advanceWindow()) {
            if (afterDuel >= 0) {
              int who = afterDuel;
              afterDuel = -1;
              afterWindow = 0;
              callToArms(world->npcs[who].duellist, world->npcs[who].bank, who);
            } else if (afterWindow) {
              shopStall = afterWindow - 1;
              afterWindow = 0;
              shopPick = 0;
              scene = SCENE_SHOP;
              clearPage();
              layoutTextRows(TEXT_TOP);
              paintShop();
            }
          }
        }
      } else if (spotted >= 0) {
        /* Nothing to do but wait for them. */
      } else if (hero.walk) {
        moveBody(&hero, hopping ? 2 : (held(KEY_B) ? RUN_SPEED : WALK_SPEED));
        if (!hero.walk) hopping = 0;
        if (!hero.walk) {
          const Warp *warp = warpAt(hero.px >> 4, hero.py >> 4);
          if (warp) enterMap(warp->to, warp->tx, warp->ty, hero.dir);
          else if (world->ambushCount && coverAt(hero.px >> 4, hero.py >> 4)
                   && roll(100) < 12) ambush();
          else if (coverAt(hero.px >> 4, hero.py >> 4) && roll(100) < 4) findInGrass();
        }
      } else if (hit(KEY_START)) {
        scene = SCENE_MENU;
        menuPick = 0;
        clearPage();
        layoutTextRows(TEXT_TOP);
        paintMenu();
      } else if (hit(KEY_SELECT)) {
        tryChallenge();
      } else if (hit(KEY_A)) {
        tryTalk();
      } else if (turnHold) {
        /* Facing a new way takes a beat before you go that way, which is what
           lets you turn on the spot to talk to somebody beside you. */
        turnHold--;
      } else {
        int want = -1;
        if (held(KEY_UP)) want = 1;
        else if (held(KEY_DOWN)) want = 0;
        else if (held(KEY_LEFT)) want = 2;
        else if (held(KEY_RIGHT)) want = 3;
        if (want >= 0 && hero.dir != want) {
          hero.dir = (u8)want;
          turnHold = 6;
        } else if (want >= 0) {
          int nx = (hero.px >> 4) + DIR_X[want];
          int ny = (hero.py >> 4) + DIR_Y[want];
          if (ledgeAt(nx, ny)) {
            /* Southward only, and it carries you clear of the drop. */
            if (want == 0 && !solidAt(nx, ny + 1) && !occupied(nx, ny + 1, -1)) {
              hopBody(&hero);
              moveBody(&hero, 2);
            }
          } else if (!solidAt(nx, ny) && !occupied(nx, ny, -1)) {
            stepBody(&hero, want);
            moveBody(&hero, held(KEY_B) ? RUN_SPEED : WALK_SPEED);
          }
        }
      }

      if (!windowOpen) {
        if (spotted >= 0) tickSpotted();
        else { moveCrowd(); lookForTrouble(); }
      }
      if (plateTimer && !--plateTimer) clearRows(0, 16);

      camX = clampCamera(hero.px + 8 - (SCREEN_W >> 1), world->w * 16, SCREEN_W);
      camY = clampCamera(hero.py + 8 - (SCREEN_H >> 1), world->h * 16, SCREEN_H);
      tickWeather();
      placeEveryone();
      placeWeather();          /* after, since placeEveryone clears every slot */
    }

    tickWindow(held(KEY_A) || held(KEY_B));

    if (scene == SCENE_DUEL) {
      /* The two of you, half again life size, facing each other across the yard.
         They face you; you are seen from behind, which is the facing the walk
         sheet already has. Where they stand this frame is where the swing that
         is playing has put them. */
      int bank = foeBank;
      int star = fxStar();
      int foeX = 150 - fxLean(0) + fxShake(0);
      int myX = 26 + fxLean(1) + fxShake(1);
      if (fxLeft) fxLeft--;
      if (theirs.hp <= 0 && shownTheirs <= 0 && sinkTheirs < 70) sinkTheirs += 3;
      if (mine.hp <= 0 && shownMine <= 0 && sinkMine < 70) sinkMine += 3;
      if (duelPhase == DUEL_SPOILS) tickSpoils();
      tickDuelBars();

      hideAllObjects();
      /* The star takes the front slot: a lower object number is drawn nearer
         the viewer, and a blow that lands behind somebody is no blow at all. */
      if (star) {
        placeSpark(0, (fxOnMe ? myX : foeX) + 16 - (SPARK_SIDE / 2),
                      32 + 26 - (SPARK_SIDE / 2), star - 1);
      }
      if (!fxHidden(0) && sinkTheirs < 70) {
        placeBigObject(1, foeX, 32 + sinkTheirs,
          NPC_TILE_BASE + bank * NPC_TILE_STRIDE + 0 * ACTOR_FRAME_TILES, bank + 1);
      }
      if (!fxHidden(1) && sinkMine < 70) {
        placeBigObject(2, myX, 32 + sinkMine,
          PLAYER_TILE_BASE + (1 * 4) * ACTOR_FRAME_TILES, 0);
      }
    }

    waitVBlank();
    if (scene == SCENE_WORLD) {
      REG_BG0HOFS = (u16)(camX & 0x01FF);
      REG_BG0VOFS = (u16)(camY & 0x01FF);
    }
    pushObjects();
    flushPage();
  }
}

#ifndef HOST_TEST
/* An ARM7 has no divide instruction, so the compiler calls out for one wherever
   the divisor is not a constant it can turn into a multiply. Freestanding there
   is no libgcc to answer, so these do. */
unsigned __aeabi_uidiv(unsigned n, unsigned d) { return udiv(n, d); }
int __aeabi_idiv(int n, int d) {
  int sign = (n < 0) ^ (d < 0);
  unsigned q = udiv((unsigned)(n < 0 ? -n : n), (unsigned)(d < 0 ? -d : d));
  return sign ? -(int)q : (int)q;
}

/* The ARM EABI helpers clang reaches for when it decides a copy or a clear is
   better done wholesale. Freestanding, there is no libgcc to supply them. */
void *__aeabi_memcpy(void *d, const void *s, unsigned n) { return memcpy(d, s, n); }
void *__aeabi_memcpy4(void *d, const void *s, unsigned n) { return memcpy(d, s, n); }
void *__aeabi_memcpy8(void *d, const void *s, unsigned n) { return memcpy(d, s, n); }
void *__aeabi_memset(void *d, unsigned n, int c) { return memset(d, c, n); }
void *__aeabi_memset4(void *d, unsigned n, int c) { return memset(d, c, n); }
void *__aeabi_memset8(void *d, unsigned n, int c) { return memset(d, c, n); }
void *__aeabi_memclr(void *d, unsigned n) { return memset(d, 0, n); }
void *__aeabi_memclr4(void *d, unsigned n) { return memset(d, 0, n); }
void *__aeabi_memclr8(void *d, unsigned n) { return memset(d, 0, n); }
#endif
