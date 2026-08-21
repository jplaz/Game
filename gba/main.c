/* A Song of Ice and Monsters — cartridge slice.
 *
 * A corner of Westeros, running on real hardware. The art, the map, the people
 * and the words are all exported out of the browser game by gba/export.mjs, so
 * this file is only the machine: tiles into VRAM, a body that walks a grid, and
 * a box that says what somebody said.
 *
 * Mode 0. BG0 is the world, 8bpp, hardware-scrolled. BG1 is the text layer,
 * whose tiles are drawn into at runtime. Everyone on screen is an object. */

#include "data.h"

typedef signed char    s8;
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
#define REG32(a)  (*(volatile u32 *)HW(a))

#define REG_DISPCNT   REG16(0x04000000)
#define REG_VCOUNT    REG16(0x04000006)
#define REG_BG0CNT    REG16(0x04000008)
#define REG_BG1CNT    REG16(0x0400000A)
#define REG_BG0HOFS   REG16(0x04000010)
#define REG_BG0VOFS   REG16(0x04000012)
#define REG_BG1HOFS   REG16(0x04000014)
#define REG_BG1VOFS   REG16(0x04000016)
#define REG_KEYINPUT  REG16(0x04000130)

#define PAL_BG        ((volatile u16 *)HW(0x05000000))
#define PAL_OBJ       ((volatile u16 *)HW(0x05000200))
#define VRAM_BG_CHR   ((volatile u32 *)HW(0x06000000))   /* charblock 0-1: the world */
#define VRAM_TXT_CHR  ((volatile u32 *)HW(0x06008000))   /* charblock 2: text tiles  */
#define VRAM_TXT_MAP  ((volatile u16 *)HW(0x0600D800))   /* screenblock 27           */
#define VRAM_BG_MAP   ((volatile u16 *)HW(0x0600E000))   /* screenblocks 28-31       */
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

/* Reserved palette slots. The exported art uses far fewer than 256 colours, so
   the interior of the window is painted from the top of the palette down. */
#define C_CLEAR   0
#define C_FILL    250
#define C_EDGE    251
#define C_INK     252
#define C_SHADE   253
#define C_GOLD    254
#define C_DEEP    249

#define RGB15(r, g, b) ((u16)((r) | ((g) << 5) | ((b) << 10)))

/* clang emits these for struct assignment and array clears even freestanding. */
#ifndef HOST_TEST
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

/* ------------------------------------------------------------- the text ---- */
/* A 240x64 scratch page of palette indices. Two tile rows of it are shown as a
   plate along the top; six are the window along the bottom. Packing it into
   character tiles and pushing it to VRAM only happens when the words change. */

#define TXT_COLS 30
#define TXT_ROWS 8
#define TXT_W (TXT_COLS * 8)
#define TXT_H (TXT_ROWS * 8)

static u8 page[TXT_H][TXT_W];
static int pageDirty;

static s8 glyphOf[128];

static void buildGlyphTable(void) {
  int i;
  for (i = 0; i < 128; i++) glyphOf[i] = 0;
  for (i = 0; i < FONT_COUNT; i++) {
    u8 c = (u8)font_chars[i];
    if (c < 128) glyphOf[c] = (s8)i;
  }
}

static int charWidth(char c) {
  return font_advance[(int)glyphOf[(u8)c & 127]];
}

static int textWidth(const char *s) {
  int w = 0;
  while (*s) w += charWidth(*s++);
  return w;
}

static void clearPage(void) {
  int y, x;
  for (y = 0; y < TXT_H; y++) for (x = 0; x < TXT_W; x++) page[y][x] = C_CLEAR;
  pageDirty = 1;
}

/* One pass for the drop shadow, then one for the ink, so a letter's shadow can
   never land on top of the letter before it. */
static void drawText(int x, int y, const char *s, u8 ink) {
  const char *p;
  int at, row, col;
  u16 bits;

  for (p = s, at = x; *p; p++) {
    int g = glyphOf[(u8)*p & 127];
    for (row = 0; row < FONT_ROWS; row++) {
      bits = font_rows[g][row];
      for (col = 0; bits >> col; col++) {
        if (!((bits >> col) & 1)) continue;
        int px = at + col + 1, py = y + row + 1;
        if (px >= 0 && px < TXT_W && py >= 0 && py < TXT_H) page[py][px] = C_SHADE;
      }
    }
    at += font_advance[g];
  }

  for (p = s, at = x; *p; p++) {
    int g = glyphOf[(u8)*p & 127];
    for (row = 0; row < FONT_ROWS; row++) {
      bits = font_rows[g][row];
      for (col = 0; bits >> col; col++) {
        if (!((bits >> col) & 1)) continue;
        int px = at + col, py = y + row;
        if (px >= 0 && px < TXT_W && py >= 0 && py < TXT_H) page[py][px] = ink;
      }
    }
    at += font_advance[g];
  }
  pageDirty = 1;
}

static void fillRect(int x, int y, int w, int h, u8 colour) {
  int iy, ix;
  for (iy = y; iy < y + h; iy++) {
    if (iy < 0 || iy >= TXT_H) continue;
    for (ix = x; ix < x + w; ix++) {
      if (ix < 0 || ix >= TXT_W) continue;
      page[iy][ix] = colour;
    }
  }
  pageDirty = 1;
}

/* A window in the game's own manner: a dark field, a gold rule inside a dark
   border, and the corners knocked off so it does not read as a rectangle. */
static void drawFrame(int x, int y, int w, int h) {
  fillRect(x, y, w, h, C_DEEP);
  fillRect(x + 1, y + 1, w - 2, h - 2, C_EDGE);
  fillRect(x + 2, y + 2, w - 4, h - 4, C_FILL);
  page[y][x] = C_CLEAR; page[y][x + w - 1] = C_CLEAR;
  page[y + h - 1][x] = C_CLEAR; page[y + h - 1][x + w - 1] = C_CLEAR;
}

/* Packs the scratch page into character tiles and hands them to the hardware. */
static void flushPage(void) {
  int row, col, y, x;
  volatile u32 *out = VRAM_TXT_CHR + 16;      /* tile 0 stays blank */
  for (row = 0; row < TXT_ROWS; row++) {
    for (col = 0; col < TXT_COLS; col++) {
      for (y = 0; y < 8; y++) {
        const u8 *src = &page[row * 8 + y][col * 8];
        for (x = 0; x < 8; x += 4) {
          *out++ = (u32)src[x] | ((u32)src[x + 1] << 8)
                 | ((u32)src[x + 2] << 16) | ((u32)src[x + 3] << 24);
        }
      }
    }
  }
  pageDirty = 0;
}

/* Which screen rows the eight scratch rows are shown on. In play the plate
   wants the top of the screen and the window wants the bottom, with nothing
   between; on the title card the whole page sits in the middle. */
#define TEXT_PLAY 0
#define TEXT_MIDDLE 1

static void layoutTextRows(int mode) {
  int ty, tx;
  for (ty = 0; ty < 32; ty++) {
    for (tx = 0; tx < 32; tx++) {
      int buf = -1;
      if (mode == TEXT_MIDDLE) {
        if (ty >= 6 && ty < 14) buf = ty - 6;
      } else if (ty < 2) buf = ty;                    /* the location plate  */
      else if (ty >= 14 && ty < 20) buf = ty - 12;    /* the dialogue window */
      VRAM_TXT_MAP[ty * 32 + tx] =
        (buf >= 0 && tx < TXT_COLS) ? (u16)(1 + buf * TXT_COLS + tx) : 0;
    }
  }
}

static void centreText(int y, const char *s, u8 ink) {
  drawText((TXT_W - textWidth(s)) >> 1, y, s, ink);
}

/* ---------------------------------------------------------------- words ---- */

#define MAX_LINES 20
#define LINE_CHARS 46
#define BODY_ROWS 2

static char lines[MAX_LINES][LINE_CHARS];
static int lineCount;
static int lineAt;
static const char *speaker;
static int windowOpen;

/* Greedy wrap on spaces, honouring the newlines the writing already has. */
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
        int at = 0;
        while (dst[at]) at++;
        if (at && at < LINE_CHARS - 2) dst[at++] = ' ';
        int i = 0;
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

static void paintWindow(void) {
  int i, y;
  fillRect(0, 16, TXT_W, 48, C_CLEAR);
  drawFrame(3, 17, TXT_W - 6, 46);

  y = 21;
  if (speaker) {
    drawText(10, y, speaker, C_GOLD);
    y += 12;
  }
  for (i = 0; i < BODY_ROWS + (speaker ? 0 : 1); i++) {
    int at = lineAt + i;
    if (at >= lineCount) break;
    drawText(10, y, lines[at], C_INK);
    y += 12;
  }

  /* The little wedge that means there is more of this. */
  if (lineAt + BODY_ROWS + (speaker ? 0 : 1) < lineCount) {
    int wx = TXT_W - 16, wy = 56;
    fillRect(wx, wy, 6, 1, C_GOLD);
    fillRect(wx + 1, wy + 1, 4, 1, C_GOLD);
    fillRect(wx + 2, wy + 2, 2, 1, C_GOLD);
  }
}

static void openWindow(const char *name, const char *body) {
  speaker = (name && name[0]) ? name : 0;
  wrapText(body, TXT_W - 22);
  lineAt = 0;
  windowOpen = 1;
  paintWindow();
}

/* Returns 1 while the window is still holding the screen. */
static int advanceWindow(void) {
  int shown = BODY_ROWS + (speaker ? 0 : 1);
  lineAt += shown;
  if (lineAt >= lineCount) {
    windowOpen = 0;
    fillRect(0, 16, TXT_W, 48, C_CLEAR);
    return 0;
  }
  paintWindow();
  return 1;
}

/* ---------------------------------------------------------------- plate ---- */

static int plateTimer;

static void showPlate(const char *name) {
  int w = textWidth(name) + 20;
  fillRect(0, 0, TXT_W, 16, C_CLEAR);
  drawFrame(4, 1, w, 14);
  drawText(4 + 10, 4, name, C_GOLD);
  plateTimer = 110;
}

static void hidePlate(void) {
  fillRect(0, 0, TXT_W, 16, C_CLEAR);
  plateTimer = 0;
}

/* --------------------------------------------------------------- objects --- */

static u16 oam[128 * 4];

static void hideAllObjects(void) {
  int i;
  for (i = 0; i < 128; i++) oam[i * 4] = 0x0200;   /* disabled */
}

/* A 16x32 body, eight character tiles, taken from frame `frame` of the sheet. */
static void placeObject(int slot, int x, int y, int frame, int priority) {
  if (x < -16 || x > SCREEN_W || y < -32 || y > SCREEN_H) {
    oam[slot * 4] = 0x0200;
    return;
  }
  oam[slot * 4 + 0] = (u16)((y & 0xFF) | 0x8000 | 0x2000);   /* tall, 256 colour */
  oam[slot * 4 + 1] = (u16)((x & 0x1FF) | 0x8000);           /* size 2 => 16x32  */
  oam[slot * 4 + 2] = (u16)((frame * FRAME_TILES * 2) | (priority << 10));
  oam[slot * 4 + 3] = 0;
}

static void pushObjects(void) {
  int i;
  for (i = 0; i < 128 * 4; i++) OAM[i] = oam[i];
}

/* ----------------------------------------------------------------- world --- */

static const Map *world;
static int worldId;
static int camX, camY;

static int solidAt(int x, int y) {
  if (x < 0 || y < 0 || x >= world->w || y >= world->h) return 1;
  return world->solid[y * world->w + x];
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

/* ---------------------------------------------------------------- player --- */

typedef struct {
  int px, py;          /* pixel position of the tile the body stands on */
  int dir;             /* 0 down, 1 up, 2 left, 3 right */
  int step;            /* which leg is forward */
  int walk;            /* pixels left in the current step, 0 when standing */
  int dx, dy;
} Body;

static Body hero;

static const s8 DIR_X[4] = { 0, 0, -1, 1 };
static const s8 DIR_Y[4] = { 1, -1, 0, 0 };

static void enterMap(int id, int tx, int ty, int dir) {
  worldId = id;
  world = &maps[id];
  hero.px = tx * 16;
  hero.py = ty * 16;
  hero.dir = dir;
  hero.walk = 0;
  hero.step = 0;
  /* Four thousand map entries do not fit in a blanking period, so hold the
     display off while they go in rather than showing the world half-changed. */
  {
    u16 was = REG_DISPCNT;
    REG_DISPCNT = (u16)(was | 0x0080);
    writeScreenblock();
    REG_DISPCNT = was;
  }
  showPlate(world->name);
}

static int clampCamera(int want, int span, int screen) {
  if (span <= screen) return -((screen - span) >> 1);
  if (want < 0) return 0;
  if (want > span - screen) return span - screen;
  return want;
}

/* Somebody standing on this tile, or nobody. */
static const Npc *npcAt(int x, int y) {
  int i;
  for (i = 0; i < world->npcCount; i++) {
    if (world->npcs[i].x == x && world->npcs[i].y == y) return &world->npcs[i];
  }
  return 0;
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

/* --------------------------------------------------------------- start-up -- */

static void copyPalettes(void) {
  int i;
  for (i = 0; i < 256; i++) PAL_BG[i] = bg_pal[i];
  for (i = 0; i < 256; i++) PAL_OBJ[i] = obj_pal[i];
  /* The window's own colours, painted in above everything the art needed. */
  PAL_BG[C_DEEP]  = RGB15(2, 3, 6);
  PAL_BG[C_FILL]  = RGB15(3, 5, 10);
  PAL_BG[C_EDGE]  = RGB15(17, 13, 6);
  PAL_BG[C_INK]   = RGB15(30, 31, 31);
  PAL_BG[C_SHADE] = RGB15(4, 5, 9);
  PAL_BG[C_GOLD]  = RGB15(29, 25, 13);
}

static void copyGraphics(void) {
  int i;
  for (i = 0; i < BG_TILE_COUNT * 16; i++) VRAM_BG_CHR[i] = bg_tiles[i];
  for (i = 0; i < OBJ_TILE_COUNT * 16; i++) VRAM_OBJ[i] = obj_tiles[i];
  for (i = 0; i < 16; i++) VRAM_TXT_CHR[i] = 0;      /* the blank text tile */
}

static void setUpVideo(void) {
  REG_DISPCNT = 0x0080;                              /* forced blank while loading */
  copyPalettes();
  copyGraphics();
  layoutTextRows(TEXT_PLAY);
  REG_BG0CNT = (u16)(1 | 0x0080 | (28 << 8) | (3 << 14));   /* 8bpp, 64x64, behind */
  REG_BG1CNT = (u16)(0 | (2 << 2) | 0x0080 | (27 << 8));    /* 8bpp text, in front */
  REG_BG1HOFS = 0;
  REG_BG1VOFS = 0;
}

/* ------------------------------------------------------------------ play --- */

static u16 keysNow, keysWas;

#define held(k) (keysNow & (k))
#define hit(k)  ((keysNow & ~keysWas) & (k))

static void tryTalk(void) {
  int fx = (hero.px >> 4) + DIR_X[hero.dir];
  int fy = (hero.py >> 4) + DIR_Y[hero.dir];
  const Npc *who = npcAt(fx, fy);
  if (who) { openWindow(who->name, who->line); return; }
  {
    const Sign *sign = signAt(fx, fy);
    if (sign) openWindow(0, sign->text);
  }
}

static void walkOn(int speed);

static void startStep(int dir) {
  int nx, ny;
  hero.dir = dir;
  nx = (hero.px >> 4) + DIR_X[dir];
  ny = (hero.py >> 4) + DIR_Y[dir];
  if (solidAt(nx, ny) || npcAt(nx, ny)) return;
  hero.walk = 16;
  hero.dx = DIR_X[dir];
  hero.dy = DIR_Y[dir];
  hero.step = (hero.step + 1) & 3;
}

static void walkOn(int speed) {
  int move = speed;
  if (move > hero.walk) move = hero.walk;
  hero.px += hero.dx * move;
  hero.py += hero.dy * move;
  hero.walk -= move;
  if (!hero.walk) {
    const Warp *warp = warpAt(hero.px >> 4, hero.py >> 4);
    hero.step = 0;
    if (warp) enterMap(warp->to, warp->tx, warp->ty, hero.dir);
  }
}

#ifdef HOST_TEST
/* The harness drives these: how many frames to run, and what is being held. */
extern int hostFramesLeft;
extern void hostFrame(void);
#endif

/* The card the cartridge opens on. No art, on purpose: a dark field, the name,
   and the words underneath it, which is all the show ever put on screen either. */
static void titleCard(void) {
  clearPage();
  layoutTextRows(TEXT_MIDDLE);
  drawFrame(16, 2, TXT_W - 32, 60);
  centreText(6, "A SONG OF", C_INK);
  centreText(19, "ICE AND MONSTERS", C_GOLD);
  fillRect(70, 33, TXT_W - 140, 1, C_EDGE);
  centreText(38, "Winter is Coming", C_INK);
  centreText(51, "PRESS START", C_GOLD);
  flushPage();
}

int main(void) {
  buildGlyphTable();
  clearPage();
  hideAllObjects();
  setUpVideo();
  titleCard();
  REG_DISPCNT = (u16)(0 | 0x0040 | 0x0200);              /* the words, and nothing else */

  for (;;) {
#ifdef HOST_TEST
    hostFrame();
    if (--hostFramesLeft < 0) return 0;
#endif
    keysWas = keysNow;
    keysNow = (u16)(~REG_KEYINPUT & 0x03FF);
    if (hit(KEY_START) || hit(KEY_A)) break;
    waitVBlank();
  }

  clearPage();
  layoutTextRows(TEXT_PLAY);
  enterMap(0, 12, 12, 0);
  flushPage();
  pushObjects();
  REG_DISPCNT = (u16)(0 | 0x0040 | 0x0100 | 0x0200 | 0x1000);  /* mode 0, 1D objs */

  for (;;) {
    int i, slot;

#ifdef HOST_TEST
    hostFrame();
    if (--hostFramesLeft < 0) return 0;
#endif

    keysWas = keysNow;
    keysNow = (u16)(~REG_KEYINPUT & 0x03FF);

    if (windowOpen) {
      if (hit(KEY_A) || hit(KEY_B)) advanceWindow();
    } else if (hero.walk) {
      walkOn(held(KEY_B) ? 4 : 2);
    } else {
      if (hit(KEY_A)) {
        tryTalk();
      } else {
        int want = -1;
        if (held(KEY_UP)) want = 1;
        else if (held(KEY_DOWN)) want = 0;
        else if (held(KEY_LEFT)) want = 2;
        else if (held(KEY_RIGHT)) want = 3;
        if (want >= 0) {
          startStep(want);
          /* Move on the same frame the step is taken, so a tile is exactly
             eight frames rather than eight and a wasted one. */
          if (hero.walk) walkOn(held(KEY_B) ? 4 : 2);
        }
      }
    }

    if (plateTimer && !--plateTimer) hidePlate();

    camX = clampCamera(hero.px + 8 - (SCREEN_W >> 1), world->w * 16, SCREEN_W);
    camY = clampCamera(hero.py + 8 - (SCREEN_H >> 1), world->h * 16, SCREEN_H);

    /* Everyone on the map, then the player, sorted well enough by giving the
       player the same priority: overlap here is a step, never a stack. */
    hideAllObjects();
    slot = 1;
    for (i = 0; i < world->npcCount && slot < 32; i++) {
      const Npc *n = &world->npcs[i];
      placeObject(slot++, n->x * 16 - camX, n->y * 16 - camY - 16, n->slot, 1);
    }
    placeObject(0, hero.px - camX, hero.py - camY - 16,
      PLAYER_FRAME_BASE + hero.dir * 4 + (hero.walk ? hero.step : 0), 1);

    waitVBlank();
    REG_BG0HOFS = (u16)(camX & 0x01FF);
    REG_BG0VOFS = (u16)(camY & 0x01FF);
    pushObjects();
    if (pageDirty) flushPage();
  }
}

/* The ARM EABI helpers clang reaches for when it decides a copy or a clear is
   better done wholesale. Freestanding, there is no libgcc to supply them. */
#ifndef HOST_TEST
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
