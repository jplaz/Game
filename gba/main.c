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

static void layoutTextRows(int mode) {
  int ty, tx;
  for (ty = 0; ty < 32; ty++) {
    for (tx = 0; tx < 32; tx++) {
      int buf = -1;
      if (mode == TEXT_MIDDLE) { if (ty >= 3 && ty < 17) buf = ty - 3; }
      else if (mode == TEXT_DUEL) {
        if (ty < 4) buf = ty;
        else if (ty >= 10) buf = ty - 6;
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

static void paintWindow(void) {
  int i, y;
  clearRows(windowTop, windowRows * 8);
  drawFrame(2, windowTop, TXT_W - 4, windowRows * 8 - 1);

  y = windowTop + 7;
  if (speaker) { drawText(12, y, speaker, C_GOLD); y += 12; }
  for (i = 0; i < bodyRows(); i++) {
    int at = lineAt + i;
    if (at >= lineCount) break;
    drawText(12, y, lines[at], C_INK);
    y += 12;
  }
  if (lineAt + bodyRows() < lineCount) {
    int wx = TXT_W - 16, wy = windowTop + windowRows * 8 - 8;
    fillRect(wx, wy, 6, 1, C_GOLD);
    fillRect(wx + 1, wy + 1, 4, 1, C_GOLD);
    fillRect(wx + 2, wy + 2, 2, 1, C_GOLD);
  }
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

static int advanceWindow(void) {
  lineAt += bodyRows();
  if (lineAt >= lineCount) {
    windowOpen = 0;
    clearRows(windowTop, windowRows * 8);
    return 0;
  }
  paintWindow();
  return 1;
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

static void pushObjects(void) {
  int i;
  for (i = 0; i < 128 * 4; i++) OAM[i] = oam[i];
  /* Affine set 0: two thirds in 8.8, which draws through it at half again size. */
  OAM[3] = 0x00AB; OAM[7] = 0; OAM[11] = 0; OAM[15] = 0x00AB;
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
static int heroActor;            /* the appearance of the house you swore to */

/* Who has been killed, so the road stays as you left it. */
static u8 slain[MAP_COUNT][MAX_CROWD];

/* ----------------------------------------------------------------- world --- */

static const Map *world;
static int worldId;
static int camX, camY;

static int solidAt(int x, int y) {
  if (x < 0 || y < 0 || x >= world->w || y >= world->h) return 1;
  return world->solid[y * world->w + x];
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

static void enterMap(int id, int tx, int ty, int dir) {
  int i;
  u16 was = REG_DISPCNT;
  worldId = id;
  world = &maps[id];
  hero.px = (s16)(tx * 16);
  hero.py = (s16)(ty * 16);
  hero.dir = (u8)dir;
  hero.walk = 0;

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

static int crowdAt(int x, int y) {
  int i;
  for (i = 0; i < crowdCount; i++) {
    if (crowdAlive[i] && bodyAt(&crowd[i], x, y)) return i;
  }
  return -1;
}

/* --------------------------------------------------------------- the you --- */

typedef struct {
  int house;
  int level, exp, hp, gold;
  int kills;
} You;

static You you;

static int vigourFor(int level) { return 28 + level * 6; }
static int mightFor(int level)  { return 10 + level * 3 + 12; }   /* + a longsword */
static int guardFor(int level)  { return 6 + level * 2 + 6; }     /* + boiled leather */
static int swiftFor(int level)  { return 10 + level * 2; }

static int expForLevel(int level) { return level <= 1 ? 0 : 30 * (level - 1) * level; }

static int levelUp(void) {
  int gained = 0;
  while (you.level < 50 && you.exp >= expForLevel(you.level + 1)) {
    you.level++;
    you.hp = vigourFor(you.level);
    gained = 1;
  }
  return gained;
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
static int duelMenu, duelPhase, duelOver;
static char scratch[96];

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
  do { digits[at++] = (char)('0' + n % 10); n /= 10; } while (n);
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
static void paintDuelPlates(void) {
  clearRows(0, 32);
  clearRows(32, 24);

  drawPlate(4, 0, 152, 30);
  drawText(12, 4, theirs.name, C_INK);
  copyString(scratch, "Lv ", sizeof scratch);
  appendNumber(scratch, theirs.level, sizeof scratch);
  drawText(124, 4, scratch, C_DIM);
  drawBar(12, 19, 132, theirs.hp, theirs.maxHp);

  /* Wholly inside the lower block of the page: a plate that starts one row
     higher would have its top edge drawn at the top of the screen instead. */
  drawPlate(TXT_W - 156, 32, 152, 23);
  drawText(TXT_W - 148, 35, mine.name, C_INK);
  copyString(scratch, "Lv ", sizeof scratch);
  appendNumber(scratch, mine.level, sizeof scratch);
  drawText(TXT_W - 36, 35, scratch, C_DIM);
  drawBar(TXT_W - 148, 47, 132, mine.hp, mine.maxHp);
}

#define DUEL_WINDOW_TOP 56
#define DUEL_WINDOW_ROWS 7

static void paintDuelMenu(void) {
  int i;
  clearRows(DUEL_WINDOW_TOP, DUEL_WINDOW_ROWS * 8);
  drawFrame(3, DUEL_WINDOW_TOP + 1, TXT_W - 6, DUEL_WINDOW_ROWS * 8 - 2);
  for (i = 0; i < 4; i++) {
    int x = 16 + (i & 1) * 112;
    int y = DUEL_WINDOW_TOP + 8 + (i >> 1) * 16;
    drawText(x, y, techniques[mine.tech[i]].name, i == duelMenu ? C_GOLD : C_INK);
    if (i == duelMenu) {
      fillRect(x - 9, y + 2, 2, 5, C_GOLD);
      fillRect(x - 7, y + 3, 2, 3, C_GOLD);
      fillRect(x - 5, y + 4, 2, 1, C_GOLD);
    }
  }
  drawText(16, DUEL_WINDOW_TOP + 42, "B to break off", C_DIM);
}

static void duelSay(const char *who, const char *what) {
  openWindowAt(who, what, DUEL_WINDOW_TOP, DUEL_WINDOW_ROWS);
}

static void beginDuel(int duellist, int bank, int slot) {
  foeSlot = slot;
  foeBank = bank;
  foeDef = &duellists[duellist];

  mine.name = houses[you.house].name;
  mine.level = you.level;
  mine.maxHp = vigourFor(you.level);
  mine.hp = you.hp > mine.maxHp ? mine.maxHp : you.hp;
  mine.might = mightFor(you.level);
  mine.guard = guardFor(you.level);
  mine.swiftness = swiftFor(you.level);
  mine.tech = player_techs;
  mine.defending = 0;

  theirs.name = foeDef->name;
  theirs.level = foeDef->level;
  theirs.hp = theirs.maxHp = foeDef->vigour;
  theirs.might = foeDef->might;
  theirs.guard = foeDef->guard;
  theirs.swiftness = foeDef->swiftness;
  theirs.tech = foeDef->tech;
  theirs.defending = 0;

  duelOver = 0;
  duelMenu = 0;
  duelPhase = 0;
  clearPage();
  layoutTextRows(TEXT_DUEL);
  paintDuelPlates();
  duelSay(theirs.name, foeDef->intro);
}

/* One side's swing, written out. Returns 1 if the duel ended on it. */
static int swing(Fighter *actor, Fighter *target, int techId, int isYou) {
  const Tech *t = &techniques[techId];
  int crit = 0, dmg;

  actor->defending = 0;
  copyString(scratch, isYou ? "You" : actor->name, sizeof scratch);

  if (t->defend) {
    actor->defending = 1;
    appendString(scratch, isYou ? " raise your guard and catch a breath."
                                : " raises a guard.", sizeof scratch);
    duelSay(0, scratch);
    return 0;
  }
  if ((int)roll(100) >= t->accuracy) {
    appendString(scratch, isYou ? " swing " : " swings ", sizeof scratch);
    appendString(scratch, t->name, sizeof scratch);
    appendString(scratch, " and it goes wide.", sizeof scratch);
    duelSay(0, scratch);
    return 0;
  }
  dmg = computeDamage(actor, target, t, &crit);
  target->hp -= dmg;
  if (target->hp < 0) target->hp = 0;
  appendString(scratch, isYou ? " land " : " lands ", sizeof scratch);
  appendString(scratch, t->name, sizeof scratch);
  appendString(scratch, crit ? " clean through it. " : ". ", sizeof scratch);
  appendNumber(scratch, dmg, sizeof scratch);
  appendString(scratch, " damage.", sizeof scratch);
  duelSay(0, scratch);
  paintDuelPlates();
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

static void paintTitle(void) {
  clearPage();
  drawFrame(16, 8, TXT_W - 32, TXT_H - 24);
  centreText(16, "A SONG OF", C_INK);
  centreText(30, "ICE AND MONSTERS", C_GOLD);
  fillRect(70, 46, TXT_W - 140, 1, C_EDGE);
  centreText(54, "The North remembers.", C_DIM);
  centreText(74, "PRESS START", C_GOLD);
}

/* ------------------------------------------------------------ the status --- */

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

  copyString(scratch, "Killed ", sizeof scratch);
  appendNumber(scratch, you.kills, sizeof scratch);
  drawText(16, 77, scratch, C_DIM);

  fillRect(16, 90, TXT_W - 32, 1, C_EDGE);
  drawText(16, 94, "SELECT draws on whoever you face", C_GOLD);
}

/* ---------------------------------------------------------------- scenes --- */

#define SCENE_TITLE 0
#define SCENE_HOUSE 1
#define SCENE_WORLD 2
#define SCENE_DUEL  3
#define SCENE_STATUS 4

static int scene;

/* Waiting on the reader before the duel moves on. */
#define DUEL_INTRO 0
#define DUEL_MENU 1
#define DUEL_MINE 2
#define DUEL_THEIRS 3
#define DUEL_END 4

static int firstMover;

static void enterWorld(void) {
  scene = SCENE_WORLD;
  clearPage();
  layoutTextRows(TEXT_PLAY);
  heroActor = houses[you.house].actor;
  enterMap(0, 12, 12, 0);
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
  you.hp = vigourFor(you.level);
  you.gold -= you.gold / 3;
  endDuel();
  /* Somebody carries you home. It costs you a third of your purse and the
     ground you had covered, which is enough of a lesson. */
  enterMap(0, 12, 12, 0);
  openWindow(0, "You go down. You wake in Winterfell with your wounds dressed, "
                "a third of your purse gone, and a good deal of road to walk again.");
}

static void theyFell(void) {
  you.gold += foeDef->reward;
  you.exp += foeDef->exp;
  if (foeDef->mortal) {
    if (foeSlot >= 0) { slain[worldId][foeSlot] = 1; crowdAlive[foeSlot] = 0; }
    you.kills++;
  }
  /* You get your wind back after a win — not all of it, but enough to keep
     walking, since there is no maester between here and the next town. */
  you.hp = mine.hp + (vigourFor(you.level) >> 2);
  if (you.hp > vigourFor(you.level)) you.hp = vigourFor(you.level);
  copyString(scratch, foeDef->defeat, sizeof scratch);
  endDuel();
  if (levelUp()) {
    appendString(scratch, "  You are level ", sizeof scratch);
    appendNumber(scratch, you.level, sizeof scratch);
    appendString(scratch, " now, and whole again.", sizeof scratch);
  }
  openWindow(0, scratch);
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
      duelPhase = DUEL_MENU;
    }
  }
}

/* A duel is fought somewhere, not in front of a black rectangle. Two flat
   tiles and a horizon are enough to say "a yard, at dusk" — and they cost two
   tiles at the top of the map's own character memory, which no map reaches. */
#define DUEL_SKY_TILE 508
#define DUEL_EARTH_TILE 509

static void paintDuelGround(void) {
  int i, ty, tx;
  for (i = 0; i < 16; i++) {
    VRAM_BG_CHR[DUEL_SKY_TILE * 16 + i] = 0x01010101u * (TXT_BANK * 16 + C_NIGHT);
    VRAM_BG_CHR[DUEL_EARTH_TILE * 16 + i] = 0x01010101u * (TXT_BANK * 16 + C_EARTH);
  }
  for (ty = 0; ty < 64; ty++) {
    volatile u16 *rowBase = VRAM_BG_MAP + ((ty >> 5) << 11) + ((ty & 31) << 5);
    for (tx = 0; tx < 64; tx++) {
      volatile u16 *cell = rowBase + ((tx >> 5) << 10) + (tx & 31);
      *cell = (u16)(ty < 9 ? DUEL_SKY_TILE : DUEL_EARTH_TILE);
    }
  }
  REG_BG0HOFS = 0;
  REG_BG0VOFS = 0;
}

static void tryTalk(void) {
  int fx = (hero.px >> 4) + DIR_X[hero.dir];
  int fy = (hero.py >> 4) + DIR_Y[hero.dir];
  int who = crowdAt(fx, fy);
  if (who >= 0) {
    const Npc *npc = &world->npcs[who];
    /* Face whoever spoke to you; it is rude not to. */
    crowd[who].dir = (u8)(hero.dir ^ 1);
    crowd[who].walk = 0;
    if (npc->heals && you.hp < vigourFor(you.level)) {
      you.hp = vigourFor(you.level);
      openWindow(npc->name,
        "Sit. There. Whole again — and no charge to a sworn sword of a great house.");
      return;
    }
    openWindow(npc->name, npc->line);
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
  scene = SCENE_DUEL;
  duelPhase = DUEL_INTRO;
  paintDuelGround();
  REG_DISPCNT = (u16)(0x0040 | 0x0100 | 0x0200 | 0x1000);
  beginDuel(world->npcs[who].duellist, world->npcs[who].bank, who);
}

/* Somebody was already on this road when you got here. */
static void ambush(void) {
  const Ambush *a = &world->ambushes[roll(world->ambushCount)];
  scene = SCENE_DUEL;
  duelPhase = DUEL_INTRO;
  paintDuelGround();
  REG_DISPCNT = (u16)(0x0040 | 0x0100 | 0x0200 | 0x1000);
  beginDuel(a->duellist, a->bank, -1);
}

/* Everyone who is not waiting to say something has somewhere to be. */
static void moveCrowd(void) {
  int i;
  for (i = 0; i < crowdCount; i++) {
    if (!crowdAlive[i]) continue;
    if (crowd[i].walk) { moveBody(&crowd[i], WALK_SPEED); continue; }
    if (!world->npcs[i].roams) continue;
    if (crowdTimer[i]) { crowdTimer[i]--; continue; }
    crowdTimer[i] = (u16)(30 + roll(150));
    {
      int dir = (int)roll(4);
      int nx = (crowd[i].px >> 4) + DIR_X[dir];
      int ny = (crowd[i].py >> 4) + DIR_Y[dir];
      crowd[i].dir = (u8)dir;
      /* Nobody strays more than three tiles from where they belong. */
      if (nx > world->npcs[i].x + 3 || nx < world->npcs[i].x - 3) continue;
      if (ny > world->npcs[i].y + 3 || ny < world->npcs[i].y - 3) continue;
      if (solidAt(nx, ny) || occupied(nx, ny, i)) continue;
      if (nearWarp(nx, ny)) continue;
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

  /* A lower object number is drawn nearer the front, so the list — sorted with
     the furthest back first — is handed over in reverse. */
  for (i = 0; i < count; i++) {
    int who = order[i];
    int slot = count - 1 - i;
    if (who < 0) {
      placeObject(slot, hero.px - camX, hero.py - camY - 16,
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
  you.house = 0; you.level = 5; you.gold = 120;
  you.hp = vigourFor(you.level);
  you.exp = expForLevel(you.level);
  paintTitle();
  flushPage();
  pushObjects();
  scene = SCENE_TITLE;
  REG_DISPCNT = (u16)(0x0040 | 0x0200);

  for (;;) {
    HOST_TICK();
    keysWas = keysNow;
    keysNow = (u16)(~REG_KEYINPUT & 0x03FF);
    seed += keysNow + 1;

    if (scene == SCENE_TITLE) {
      if (hit(KEY_START) || hit(KEY_A)) {
        scene = SCENE_HOUSE;
        houseChoice = 0;
        paintHousePicker();
      }
    } else if (scene == SCENE_HOUSE) {
      if (hit(KEY_LEFT) && houseChoice > 0) { houseChoice--; paintHousePicker(); }
      if (hit(KEY_RIGHT) && houseChoice < HOUSE_COUNT - 1) { houseChoice++; paintHousePicker(); }
      if (hit(KEY_A)) {
        you.house = houseChoice;
        PAL_BG[TXT_BANK * 16 + C_HOUSE] = houses[you.house].colour;
        PAL_BG[TXT_BANK * 16 + C_TRIM] = houses[you.house].accent;
        PAL_BG[TXT_BANK * 16 + C_EDGE] = houses[you.house].colour;
        enterWorld();
        REG_DISPCNT = (u16)(0x0040 | 0x0100 | 0x0200 | 0x1000);
      }
    } else if (scene == SCENE_STATUS) {
      if (hit(KEY_START) || hit(KEY_B) || hit(KEY_A)) {
        scene = SCENE_WORLD;
        clearPage();
        layoutTextRows(TEXT_PLAY);
      }
    } else if (scene == SCENE_DUEL) {
      if (windowOpen) {
        if (hit(KEY_A) || hit(KEY_B)) {
          if (!advanceWindow()) {
            if (duelPhase == DUEL_INTRO) {
              firstMover = mine.swiftness >= theirs.swiftness;
              duelPhase = DUEL_MENU;
            } else if (duelPhase == DUEL_END) {
              if (duelOver == 2) youFell(); else theyFell();
            } else if (duelPhase == DUEL_MINE || duelPhase == DUEL_THEIRS) {
              /* Only a half-turn that is actually owed gets swung. Falling
                 through to here on the menu phase would hand out a free hit. */
              duelTurn();
            }
            if (scene == SCENE_DUEL && duelPhase == DUEL_MENU && !windowOpen) paintDuelMenu();
          }
        }
      } else if (duelPhase == DUEL_MENU) {
        int was = duelMenu;
        if (hit(KEY_LEFT) && (duelMenu & 1)) duelMenu--;
        if (hit(KEY_RIGHT) && !(duelMenu & 1)) duelMenu++;
        if (hit(KEY_UP) && duelMenu > 1) duelMenu -= 2;
        if (hit(KEY_DOWN) && duelMenu < 2) duelMenu += 2;
        if (duelMenu != was) paintDuelMenu();
        if (hit(KEY_B)) {
          if (roll(100) < 55) {
            you.hp = mine.hp;
            endDuel();
            openWindow(0, "You break off and put distance between you.");
          } else {
            duelSay(0, "There is nowhere to go. Finish it.");
            duelPhase = DUEL_MINE;
          }
        } else if (hit(KEY_A)) {
          clearRows(56, 48);
          mine.defending = 0;
          duelPhase = DUEL_MINE;
          duelTurn();
        }
      }
    } else {
      /* The world. */
      if (windowOpen) {
        if (hit(KEY_A) || hit(KEY_B)) advanceWindow();
      } else if (hero.walk) {
        moveBody(&hero, held(KEY_B) ? RUN_SPEED : WALK_SPEED);
        if (!hero.walk) {
          const Warp *warp = warpAt(hero.px >> 4, hero.py >> 4);
          if (warp) enterMap(warp->to, warp->tx, warp->ty, hero.dir);
          else if (world->ambushCount && roll(1000) < 38) ambush();
        }
      } else if (hit(KEY_START)) {
        scene = SCENE_STATUS;
        clearPage();
        layoutTextRows(TEXT_MIDDLE);
        paintStatus();
      } else if (hit(KEY_SELECT)) {
        tryChallenge();
      } else if (hit(KEY_A)) {
        tryTalk();
      } else {
        int want = -1;
        if (held(KEY_UP)) want = 1;
        else if (held(KEY_DOWN)) want = 0;
        else if (held(KEY_LEFT)) want = 2;
        else if (held(KEY_RIGHT)) want = 3;
        if (want >= 0) {
          int nx = (hero.px >> 4) + DIR_X[want];
          int ny = (hero.py >> 4) + DIR_Y[want];
          hero.dir = (u8)want;
          if (!solidAt(nx, ny) && !occupied(nx, ny, -1)) {
            stepBody(&hero, want);
            moveBody(&hero, held(KEY_B) ? RUN_SPEED : WALK_SPEED);
          }
        }
      }

      if (!windowOpen) moveCrowd();
      if (plateTimer && !--plateTimer) clearRows(0, 16);

      camX = clampCamera(hero.px + 8 - (SCREEN_W >> 1), world->w * 16, SCREEN_W);
      camY = clampCamera(hero.py + 8 - (SCREEN_H >> 1), world->h * 16, SCREEN_H);
      placeEveryone();
    }

    if (scene == SCENE_DUEL) {
      /* The two of you, half again life size, facing each other across the yard.
         They face you; you are seen from behind, which is the facing the walk
         sheet already has. */
      int bank = foeBank;
      hideAllObjects();
      placeBigObject(0, 150, 20,
        NPC_TILE_BASE + bank * NPC_TILE_STRIDE + 0 * ACTOR_FRAME_TILES, bank + 1);
      placeBigObject(1, 26, 22,
        PLAYER_TILE_BASE + (1 * 4) * ACTOR_FRAME_TILES, 0);
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
