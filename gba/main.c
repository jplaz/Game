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
#define REG_TM0_COUNT  REG16(0x04000100)
#define REG_TM0_CTRL   REG16(0x04000102)
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
/* And the degrees the regions need. The three tunes this cartridge shipped
   with were all in C minor, which is why every place in the world sounded like
   the same place: a hundred and one of the hundred and fifty-seven maps asked
   for one track and got it. */
#define Db3 1
#define E3 4
#define Gb3 6
#define A3 9
#define B3 11
#define Db4 13
#define E4 16
#define Gb4 18
#define A4 21
#define B4 23
#define Db5 25
#define E5 28
#define F5 29
#define Gb5 30
#define A5 33
#define Bb5 34

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

/* ----------------------------------------------------------- the regions ---
 *
 * Three tunes for a hundred and fifty-seven maps, and a hundred and one of
 * those maps asked for the same one. Music does half the work of making a
 * place feel like somewhere, and the Wall, Dorne, Braavos and Winterfell were
 * all playing the road. These are the rest of them: same three voices, same
 * thirty-two steps, different country.
 */

/* The North above the Neck: fifths, no third to speak of, and a great deal of
   space between the notes. Cold is a tempo more than it is a key. */
static const u8 NORTH_TUNE[32] = {
  C4, HOLD, HOLD, HOLD, G4, HOLD, HOLD, HOLD,
  Eb4, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, REST,
  Bb3, HOLD, HOLD, HOLD, F4, HOLD, HOLD, HOLD,
  Eb4, HOLD, C4, HOLD, HOLD, HOLD, HOLD, REST,
};
static const u8 NORTH_UNDER[32] = {
  C3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  C3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  Bb3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  Ab3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
};
static const u8 NORTH_DRUM[32] = {
  1, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 0, 0,
  1, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 1, 0, 0, 0,
};

/* The Reach and the river country: major, and it moves. The richest ground in
   the world ought not to sound like a funeral. */
static const u8 REACH_TUNE[32] = {
  G4, HOLD, A4, B4, HOLD, A4, G4, HOLD,
  E4, HOLD, G4, A4, HOLD, HOLD, HOLD, REST,
  A4, HOLD, B4, C5, HOLD, B4, A4, HOLD,
  G4, HOLD, E4, D4, HOLD, HOLD, HOLD, REST,
};
static const u8 REACH_UNDER[32] = {
  C4, HOLD, HOLD, HOLD, G3, HOLD, HOLD, HOLD,
  C4, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  F3, HOLD, HOLD, HOLD, C4, HOLD, HOLD, HOLD,
  G3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
};
static const u8 REACH_DRUM[32] = {
  1, 0, 0, 1, 0, 0, 1, 0,  1, 0, 0, 1, 0, 0, 1, 0,
  1, 0, 0, 1, 0, 0, 1, 0,  1, 0, 1, 0, 1, 0, 1, 0,
};

/* Dorne and the cities across the water: a flattened second, which is the
   oldest shorthand there is for somewhere hot and a long way off. */
static const u8 DORNE_TUNE[32] = {
  A4, HOLD, Bb4, HOLD, A4, G4, F4, HOLD,
  E4, HOLD, F4, G4, HOLD, HOLD, HOLD, REST,
  A4, Bb4, C5, HOLD, Bb4, A4, HOLD, HOLD,
  G4, HOLD, F4, E4, HOLD, HOLD, HOLD, REST,
};
static const u8 DORNE_UNDER[32] = {
  D3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  D3, HOLD, HOLD, HOLD, Bb3, HOLD, HOLD, HOLD,
  D3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  A3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
};
static const u8 DORNE_DRUM[32] = {
  2, 0, 1, 1, 0, 1, 0, 1,  2, 0, 1, 1, 0, 1, 0, 1,
  2, 0, 1, 1, 0, 1, 0, 1,  2, 1, 1, 1, 0, 1, 1, 1,
};

/* Salt and slate: the Iron Islands and the coast that gets the weather. Heavy,
   modal, and it does not resolve because nothing out there ever does. */
static const u8 IRON_TUNE[32] = {
  D4, HOLD, HOLD, F4, HOLD, HOLD, G4, HOLD,
  A4, HOLD, HOLD, HOLD, G4, HOLD, F4, HOLD,
  D4, HOLD, HOLD, C4, HOLD, HOLD, D4, HOLD,
  F4, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, REST,
};
static const u8 IRON_UNDER[32] = {
  D3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  D3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  C3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  D3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
};
static const u8 IRON_DRUM[32] = {
  2, 0, 0, 0, 1, 0, 0, 0,  2, 0, 0, 0, 1, 0, 1, 0,
  2, 0, 0, 0, 1, 0, 0, 0,  2, 0, 1, 0, 2, 0, 1, 0,
};

/* Dragonstone, the Dragonmont, and the ground past the Wall: chromatic, and it
   keeps going down. Nothing here is meant to be comfortable. */
static const u8 ASH_TUNE[32] = {
  C4, HOLD, B3, HOLD, Bb3, HOLD, A3, HOLD,
  Ab3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, REST,
  Eb4, HOLD, D4, HOLD, Db4, HOLD, C4, HOLD,
  B3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, REST,
};
static const u8 ASH_UNDER[32] = {
  Ab3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  Ab3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  G3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  G3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
};
static const u8 ASH_DRUM[32] = {
  2, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 0, 0, 1, 0,
  2, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 1, 0, 1, 1,
};

/* Inside four walls, anywhere: a room with people in it, quieter than the road
   outside it. */
static const u8 TOWN_TUNE[32] = {
  Eb4, HOLD, G4, HOLD, F4, HOLD, Eb4, HOLD,
  D4, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, REST,
  C4, HOLD, Eb4, HOLD, G4, HOLD, F4, HOLD,
  Eb4, HOLD, D4, HOLD, C4, HOLD, HOLD, REST,
};
static const u8 TOWN_UNDER[32] = {
  C3, HOLD, HOLD, HOLD, G3, HOLD, HOLD, HOLD,
  Bb3, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD, HOLD,
  Ab3, HOLD, HOLD, HOLD, Eb3, HOLD, HOLD, HOLD,
  F3, HOLD, HOLD, HOLD, G3, HOLD, HOLD, HOLD,
};
static const u8 TOWN_DRUM[32] = {
  1, 0, 0, 0, 1, 0, 0, 0,  1, 0, 0, 0, 1, 0, 1, 0,
  1, 0, 0, 0, 1, 0, 0, 0,  1, 0, 0, 0, 1, 0, 1, 0,
};

/* Somebody who holds a seat. The duel tune, wound tighter and pitched up: a
   sigil-holder should not sound like a bandit on a road. */
static const u8 BOSS_TUNE[32] = {
  C5, Bb4, Ab4, G4, F4, Eb4, D4, C4,
  G4, HOLD, Ab4, HOLD, Bb4, HOLD, C5, REST,
  Db5, C5, Bb4, Ab4, G4, F4, Eb4, D4,
  Ab4, HOLD, Bb4, HOLD, C5, HOLD, Eb5, REST,
};
static const u8 BOSS_UNDER[32] = {
  C3, C3, C3, C3, C3, C3, C3, C3,
  Ab3, Ab3, Ab3, Ab3, G3, G3, G3, G3,
  Db3, Db3, Db3, Db3, Db3, Db3, Db3, Db3,
  Ab3, Ab3, G3, G3, C3, C3, C3, C3,
};
static const u8 BOSS_DRUM[32] = {
  2, 1, 1, 1, 2, 1, 1, 1,  2, 1, 1, 1, 2, 1, 2, 1,
  2, 1, 1, 1, 2, 1, 1, 1,  2, 1, 2, 1, 2, 2, 2, 2,
};

static const Tune TUNES[10] = {
  { ROAD_TUNE,  ROAD_UNDER,  ROAD_DRUM,  32, 11, 2 },
  { DUEL_TUNE,  DUEL_UNDER,  DUEL_DRUM,  32,  6, 1 },
  { HALL_TUNE,  HALL_UNDER,  HALL_DRUM,  32, 16, 2 },
  { NORTH_TUNE, NORTH_UNDER, NORTH_DRUM, 32, 14, 2 },
  { REACH_TUNE, REACH_UNDER, REACH_DRUM, 32,  9, 1 },
  { DORNE_TUNE, DORNE_UNDER, DORNE_DRUM, 32,  8, 0 },
  { IRON_TUNE,  IRON_UNDER,  IRON_DRUM,  32, 13, 2 },
  { ASH_TUNE,   ASH_UNDER,   ASH_DRUM,   32, 15, 3 },
  { TOWN_TUNE,  TOWN_UNDER,  TOWN_DRUM,  32, 10, 1 },
  { BOSS_TUNE,  BOSS_UNDER,  BOSS_DRUM,  32,  5, 1 },
};

#define TUNE_ROAD 0
#define TUNE_DUEL 1
#define TUNE_HALL 2
#define TUNE_NORTH 3
#define TUNE_REACH 4
#define TUNE_DORNE 5
#define TUNE_IRON 6
#define TUNE_ASH 7
#define TUNE_TOWN 8
#define TUNE_BOSS 9

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

/*
 * Keeping time.
 *
 * The music used to advance once per pass of the game loop, which meant the
 * tempo was the frame rate: every frame the loop missed was a quaver the tune
 * missed too, so it dragged and stuttered at exactly the moments the screen
 * did. Timer 0 free-runs at a sixteen-thousandth of a second whatever the CPU
 * is doing, and the tune is stepped from that instead - so a heavy frame costs
 * a frame of animation and nothing at all of the music.
 */
#define SOUND_HZ_TICKS 274        /* 16.78MHz / 1024, divided by sixty */

static u16 soundClockWas;
static int soundOwed;

static void startSoundClock(void) {
#ifndef HOST_TEST
  REG_TM0_CTRL = 0;
  REG_TM0_COUNT = 0;
  REG_TM0_CTRL = (u16)(3 | 0x0080);      /* prescaler 1024, running */
  soundClockWas = 0;
#endif
  soundOwed = 0;
}

static void soundClock(void) {
#ifdef HOST_TEST
  /* No hardware to read; the host runs the loop at a fixed rate anyway. */
  tickSound();
#else
  u16 now = REG_TM0_COUNT;
  soundOwed += (int)(u16)(now - soundClockWas);
  soundClockWas = now;
  /* Anything longer than a few frames is a map being loaded or a record being
     written, not the music falling behind. Catching that up would be a burst of
     notes rather than a tune. */
  if (soundOwed > SOUND_HZ_TICKS * 4) soundOwed = SOUND_HZ_TICKS;
  /* Bounded, so a long stall is never paid back as a burst of notes. */
  {
    int owed = 0;
    while (soundOwed >= SOUND_HZ_TICKS && owed < 4) {
      soundOwed -= SOUND_HZ_TICKS;
      owed++;
    }
    while (owed-- > 0) tickSound();
  }
#endif
}

/* ------------------------------------------------------------- the text ---- */
/* A page of 4bpp character tiles, drawn into directly rather than through a
   byte-per-pixel buffer, so pushing it to video memory is a straight copy. */

#define TXT_COLS 30
#define TXT_ROWS 14
#define TXT_W (TXT_COLS * 8)
#define TXT_H (TXT_ROWS * 8)
#define TXT_TILES (TXT_COLS * TXT_ROWS)

static u8 pageTiles[TXT_TILES][32] __attribute__((aligned(4)));
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

/*
 * A block of one colour, a tile at a time.
 *
 * This used to call plot() once per pixel, and plot() is a bounds check, a
 * multiply, two shifts and a read-modify-write of one nibble. Clearing the page
 * for a menu is two hundred and forty by a hundred and twelve of those - nearly
 * twenty-seven thousand calls, which on a sixteen megahertz ARM7 is something
 * like two and a half frames. That is why opening the pouch stuttered and why
 * every cursor move stuttered again: the menu was being redrawn from scratch
 * each time and the redraw did not fit in a frame.
 *
 * The page is stored as 4bpp tiles, so eight pixels of one colour on one row of
 * one tile is four identical bytes. Whole tiles are filled four bytes a row and
 * only the ragged edges go through plot(). A full-page clear is four hundred
 * and twenty tiles instead of twenty-seven thousand pixels.
 */
static void fillRect(int x, int y, int w, int h, u8 colour) {
  int x1, y1, ty, tx, tyEnd, txEnd;
  u8 pair;
  if (w <= 0 || h <= 0) return;
  if (x < 0) { w += x; x = 0; }
  if (y < 0) { h += y; y = 0; }
  x1 = x + w; y1 = y + h;
  if (x1 > TXT_W) x1 = TXT_W;
  if (y1 > TXT_H) y1 = TXT_H;
  if (x >= x1 || y >= y1) return;
  pair = (u8)(colour | (colour << 4));
  tyEnd = (y1 - 1) >> 3;
  txEnd = (x1 - 1) >> 3;

  for (ty = y >> 3; ty <= tyEnd; ty++) {
    int rowTop = ty << 3;
    int ry0 = y > rowTop ? y - rowTop : 0;
    int ry1 = y1 < rowTop + 8 ? y1 - rowTop : 8;
    for (tx = x >> 3; tx <= txEnd; tx++) {
      int colLeft = tx << 3;
      int rx0 = x > colLeft ? x - colLeft : 0;
      int rx1 = x1 < colLeft + 8 ? x1 - colLeft : 8;
      int at = ty * TXT_COLS + tx, j;
      u8 *tile = pageTiles[at];
      if (rx0 == 0 && rx1 == 8) {
        for (j = ry0; j < ry1; j++) {
          u8 *p = tile + (j << 2);
          p[0] = pair; p[1] = pair; p[2] = pair; p[3] = pair;
        }
      } else {
        for (j = ry0; j < ry1; j++) {
          u8 *p = tile + (j << 2);
          int i;
          for (i = rx0; i < rx1; i++) {
            if (i & 1) p[i >> 1] = (u8)((p[i >> 1] & 0x0F) | (colour << 4));
            else      p[i >> 1] = (u8)((p[i >> 1] & 0xF0) | colour);
          }
        }
      }
      touch(at);
    }
  }
}

static void clearPage(void) {
  int i, j;
  for (i = 0; i < TXT_TILES; i++) for (j = 0; j < 32; j++) pageTiles[i][j] = 0;
  dirtyLo = 0; dirtyHi = TXT_TILES - 1;
}

static void clearRows(int y, int h) { fillRect(0, y, TXT_W, h, C_CLEAR); }

static void applyLayout(void);

static void flushPage(void) {
  int i, w;
  /* Both halves of the text layer land together, in the blank between frames:
     the shape of it and what is written on it. */
  applyLayout();
  if (dirtyHi < dirtyLo) return;
  for (i = dirtyLo; i <= dirtyHi; i++) {
    /* Four-byte aligned by declaration, so a row of a tile is already a word:
       assembling each one out of four bytes and three shifts was work done
       twice, once here and once by whatever wrote the pixels. */
    const u32 *src = (const u32 *)(const void *)pageTiles[i];
    volatile u32 *out = VRAM_TXT_CHR + (i + 1) * 8;      /* tile 0 stays blank */
    for (w = 0; w < 8; w++) out[w] = src[w];
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

/* Which shape the text layer is in, and when it changes.
 *
 * This wrote a thousand and twenty-four map entries straight into video memory
 * the moment it was called, which is nearly always somewhere in the middle of a
 * frame being displayed - so opening the pouch visibly rearranged the screen
 * half way down it. The change is held and laid down in the blank between
 * frames instead, with the tiles it belongs to. */
static int layoutWant = -1;

static void layoutTextRows(int mode) { layoutWant = mode; }

static void applyLayout(void) {
  int ty, tx, mode = layoutWant;
  if (mode < 0) return;
  layoutWant = -1;
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
}

/* The matrix an enlarged body is drawn through.
 *
 * It lives in the fourth attribute of the first four objects - the hardware
 * interleaves the affine sets with object memory - and nothing in this file
 * had ever written it. Worse, every placer here cleared that attribute, so
 * whichever object was drawn into slot nought wiped the horizontal scale and
 * slot three wiped the vertical. What a duel looked like therefore depended on
 * which objects the world happened to have used a frame earlier, which is not
 * a thing a picture is allowed to depend on. On real hardware an affine object
 * with an undefined matrix is not "a bit off"; it is a rectangle of one colour.
 *
 * Screen to texture, so a number below one enlarges: 0x90 is a hundred and
 * forty-four two-hundred-and-fifty-sixths, near enough seven-quarters, which
 * fills the double-size box the two fighters are given without pushing an
 * elbow off the edge of it. */
#define DUEL_SCALE 0x0090

static void setDuelScale(void) {
  oam[3]  = DUEL_SCALE;   /* pa */
  oam[7]  = 0;            /* pb */
  oam[11] = 0;            /* pc */
  oam[15] = DUEL_SCALE;   /* pd */
}

/* The same body larger, for a duel, where the two of you are the whole scene. */
static void placeBigObject(int slot, int x, int y, int tile, int bank) {
  oam[slot * 4 + 0] = (u16)((y & 0xFF) | 0x8000 | 0x0100 | 0x0200); /* affine, double */
  oam[slot * 4 + 1] = (u16)((x & 0x1FF) | 0x8000);
  oam[slot * 4 + 2] = (u16)(tile | (1 << 10) | (bank << 12));
}

/* An animal, sixty-four pixels square, which is one object on this hardware.
   Two of them fit in object memory during a duel and nowhere else: the foe goes
   in the last resident appearance's room, and yours goes in the room the
   player's walking frames leave empty while nobody is walking. */
#define FOE_BEAST_TILE 832
#define FOE_BEAST_BANK 12
#define MY_BEAST_TILE  64
#define MY_BEAST_BANK  13

static void placeBeast(int slot, int x, int y, int tile, int bank) {
  if (x < -64 || x > SCREEN_W || y < -64 || y > SCREEN_H) { oam[slot * 4] = 0x0200; return; }
  oam[slot * 4 + 0] = (u16)(y & 0xFF);                        /* square */
  oam[slot * 4 + 1] = (u16)((x & 0x1FF) | 0xC000);            /* size 3 => 64x64 */
  oam[slot * 4 + 2] = (u16)(tile | (1 << 10) | (bank << 12));
}

static void loadBeastArt(int which, int tile, int bank) {
  volatile u32 *dst = VRAM_OBJ + tile * 8;
  const u32 *src = beasts[which].tiles;
  int i;
  for (i = 0; i < BEAST_TILES * 8; i++) dst[i] = src[i];
  for (i = 0; i < 16; i++) PAL_OBJ[bank * 16 + i] = beasts[which].pal[i];
}

/* The bubble that pops over somebody the moment they see you. Four character
   tiles at the top of object memory, written once at start-up. */
#define SPOT_TILE 896
#define SPOT_BANK 13

/* The bubble and the star share a palette bank, and a duel borrows it for your
   own beast, so putting it back is a named thing rather than three lines copied
   into whichever function last needed them. */
static void spotPalette(void) {
  PAL_OBJ[SPOT_BANK * 16 + 1] = RGB15(3, 3, 5);
  PAL_OBJ[SPOT_BANK * 16 + 2] = RGB15(31, 31, 31);
  PAL_OBJ[SPOT_BANK * 16 + 3] = RGB15(31, 27, 12);
}

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
  spotPalette();
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
  spotPalette();
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
}

static void placeMote(int slot, int x, int y, int kind) {
  if (x < -8 || x > SCREEN_W || y < -8 || y > SCREEN_H) { oam[slot * 4] = 0x0200; return; }
  oam[slot * 4 + 0] = (u16)(y & 0xFF);                       /* square, size 0 */
  oam[slot * 4 + 1] = (u16)(x & 0x1FF);
  oam[slot * 4 + 2] = (u16)((MOTE_TILE + kind) | (SPOT_BANK << 12));
}

static void placeSpark(int slot, int x, int y, int frame) {
  if (x < -32 || x > SCREEN_W || y < -32 || y > SCREEN_H) { oam[slot * 4] = 0x0200; return; }
  oam[slot * 4 + 0] = (u16)(y & 0xFF);                      /* square */
  oam[slot * 4 + 1] = (u16)((x & 0x1FF) | 0x8000);          /* size 2 => 32x32 */
  oam[slot * 4 + 2] = (u16)((SPARK_TILE + frame * 16) | (SPOT_BANK << 12));
}

static void placeBubble(int slot, int x, int y) {
  if (x < -16 || x > SCREEN_W || y < -16 || y > SCREEN_H) { oam[slot * 4] = 0x0200; return; }
  oam[slot * 4 + 0] = (u16)(y & 0xFF);                       /* square */
  oam[slot * 4 + 1] = (u16)((x & 0x1FF) | 0x4000);           /* size 1 => 16x16 */
  oam[slot * 4 + 2] = (u16)(SPOT_TILE | (SPOT_BANK << 12));
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

/* Which chests you have had the lid up on. */
static u8 emptied[MAP_COUNT][8];

/* Who has already pressed something into your hand. Kept in the record as well,
   or a save and a reload would be a way to be given it all over again. */
static u8 gifted[MAP_COUNT][MAX_CROWD];


/* --------------------------------------------------------------- the you --- */

#define NAME_MAX 10

/* What follows you about. One at a time: a beast you took alive or hatched, and
   it grows with you rather than being a thing you own. `kind` is 255 for
   nobody, which is how everybody starts. */
typedef struct { u8 kind, level; u16 exp; int hp; } Kept;

/* Six, the way a party has always been six. `lead` is the one at your heel and
   the one that fights beside you; the rest come along and can be swapped to the
   front at the menu. */
#define PARTY_MAX 6
/* Three pages of six at the kennels, and six swords behind you. Six because
   that is what fits on a card without a second page, and because a company you
   cannot read at a glance is a company you stop thinking about. */
#define HOLD_MAX 18
#define HOST_MAX 6

typedef struct {
  int house;
  int level, exp, hp, gold;
  int kills;
  /* What you have on, one slot per kind of thing: a ware index plus one, and
     nothing is 0. It used to be three named fields, which meant that adding a
     helm and a pair of gauntlets meant editing every line in the file that
     added a number up. */
  u8 worn[WARE_KINDS];
  u8 bag[WARE_COUNT];
  char name[NAME_MAX + 1];        /* what people call you */
  Kept party[PARTY_MAX];
  u8 lead;                        /* which of them is at your heel */
  /* What is boarded at the kennels, and who has sworn to you.
     Six is all anybody can feed on the road, so everything taken alive past
     the sixth used to be turned loose where it stood. The holdfast is where it
     goes instead, and the host is the same idea aimed at people: somebody who
     has yielded and been paid rather than finished. */
  Kept holdfast[HOLD_MAX];
  Kept host[HOST_MAX];
  u8 eggWins;                     /* fights won since you picked the egg up */
  u8 tamed;                       /* how many you have taken alive */
  /* Where somebody last put you back together. Going down used to send you all
     the way home to your own seat, which by the middle of the game was a walk
     of twenty doors and the single most tiresome thing in the game. */
  int haven, havenX, havenY;
  /* How far through the last act you are. 0 nothing yet, 1 the raven has come,
     2 you have stood in the throne room, 3 the chair is yours. */
  u8 story;
} You;

/* The animal currently at your heel. Everything that used to say `MY_BEAST`
   says this, so gaining a party of six did not mean rewriting every line that
   ever mentioned the one you had. */
#define MY_BEAST (you.party[you.lead])

/* The host and the kennels are written out further down, next to each other,
   because they are one idea aimed at two sorts of company. The record has to
   put a sworn sword's health back and a swing has to know what six of them add,
   and both of those come first in the file, so something has to be declared
   before it is written. */
/* Every flag a cutscene can set, and what you answered when one asked you
   something. Kept in the record: a scene that fired again after a reload would
   be worse than one that never fired at all. */
static u32 storyFlags[STORY_WORDS];

static int flagSet(int at) {
  return (int)((storyFlags[at >> 5] >> (at & 31)) & 1u);
}
static void setFlag(int at) { storyFlags[at >> 5] |= 1u << (at & 31); }

static int swornVigour(int kind, int level);
static int myHostBlow(void);
static int myHostGuard(void);
static int theirHostBlow(void);

#define WORN_WEAPON worn[WARE_WEAPON]
#define WORN_ARMOUR worn[WARE_ARMOUR]
#define WORN_SHIELD worn[WARE_SHIELD]
#define WORN_HELM   worn[WARE_HELM]
#define WORN_GLOVES worn[WARE_GLOVES]

static You you;

/* --------------------------------------------------------------- beasts ---
   An animal is not carrying anything, so what it is made of is all it is. The
   browser game keeps six numbers for a creature and this game fights with four,
   so these are the four, worked out at whatever level the animal happens to be
   the way every handheld game has done it: a base, doubled, scaled by level. */
/* Measured against a person of the same level rather than out of thin air. The
   first pass scaled a browser stat straight into this game's numbers and a
   direwolf at fourteen hit for two: the thing the player most wanted to use was
   the weakest thing in the world. A base of fifty-five is an average animal, so
   an average animal fights like an average person of its level and a direwolf
   fights rather better. */
static int beastVigour(int b, int lv) {
  return (int)udiv((u32)(30 + lv * 9) * (u32)beasts[b].hp, 55);
}
static int beastMight(int b, int lv) {
  /* A person's own arm before any steel is in it: an animal carries nothing, so
     it is measured against the bare figure and not against a man in plate. */
  return (int)udiv((u32)(10 + lv * 3) * (u32)beasts[b].atk, 55) + 4;
}
static int beastGuard(int b, int lv) {
  return (int)udiv((u32)(6 + lv * 2) * (u32)beasts[b].def, 55) + 3;
}
static int beastSwift(int b, int lv) {
  return (int)udiv((u32)(10 + lv * 2) * (u32)beasts[b].spe, 60) + 2;
}

/* What it takes to raise one a rung. Flatter than yours: a beast you took at
   six should be worth having at thirty, not left behind by the second town. */
static int beastExpFor(int lv) { return lv <= 1 ? 0 : lv * lv * lv; }

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
  return you.WORN_ARMOUR ? wares[you.WORN_ARMOUR - 1].tier : 0;
}

/* Health rises faster than it used to. A fight that lasts five or six exchanges
   is a fight; one that ends in two is a coin toss, and a coin toss is not fun. */
static int vigourFor(int level) { return 30 + level * 9; }

/* What everything you have on adds up to. Five slots read the same way, so a
   sixth would be a line in the ware table and nothing here. */
static int sumWorn(int which) {
  int k, total = 0;
  for (k = 0; k < WARE_KINDS; k++) {
    const Ware *w;
    if (!you.worn[k]) continue;
    w = &wares[you.worn[k] - 1];
    total += which == 0 ? w->might : which == 1 ? w->guard : w->swiftness;
  }
  return total;
}

static int mightFor(int level) { return 10 + level * 3 + sumWorn(0); }
static int guardFor(int level) { return 6 + level * 2 + sumWorn(1); }
static int swiftFor(int level) {
  int s = 10 + level * 2 + sumWorn(2);
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
typedef struct { u8 arm, mail, shield, helm, gloves, remedy; } Kit;

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
    /* Priced at nothing means it is not for sale and not on anybody: the four
       things at the end of the ladder are made and nothing else. A test for
       "costs no more than their purse" said yes to all of them, so a bandit on
       the first road could be wearing White Plate. */
    if (!wares[i].price) continue;
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
  /* And the two pieces everybody in this age actually wore and the game had no
     room for. They are cheap, so they turn up early and often, which is exactly
     right: a helm is the first thing anybody buys and the last thing they
     take off. */
  k.helm   = kitPiece(rot(h, 11), WARE_HELM,   budget, 4);
  k.gloves = kitPiece(rot(h, 27), WARE_GLOVES, budget, 3);
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
  if (you.WORN_WEAPON) {
    const Ware *w = &wares[you.WORN_WEAPON - 1];
    for (i = 0; i < w->techCount && n < 2; i++) myTechs[n++] = w->tech[i];
  } else {
    while (n < 2) { myTechs[n] = player_techs[n]; n++; }
  }
  if (mine >= 0) {
    myTechs[2] = (u8)mine;
  } else if (you.WORN_WEAPON) {
    const Ware *w = &wares[you.WORN_WEAPON - 1];
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
  /* Two facts about what is in this fighter's hands and what it is made of.
     Steel does almost nothing to something that is already dead; obsidian and
     Valyrian steel take it apart. It is the whole reason the Haunted Forest is
     worth walking. */
  int dead, obsidian;
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
/* Whether this blow is the right one for what is in front of you.
   Returns 1 when it tells, -1 when it barely marks them, 0 otherwise.

   This is the piece the fighting was missing. Every technique was a number, so
   the only choice was the biggest number and every duel was the same duel. A
   weight answers plate; a point answers somebody quick in leather; an edge is
   the honest middle. You can see which you are facing before you swing, because
   armoured people are drawn wearing it. */
static int biteTells(const Fighter *d, const Tech *t) {
  int bare = 6 + d->level * 2;
  if (t->bite == 1) return d->guard >= bare + 14 ? 1 : (d->guard <= bare + 3 ? -1 : 0);
  if (t->bite == 2) return d->guard <= bare + 4 ? 1 : (d->guard >= bare + 16 ? -1 : 0);
  return 0;
}

static int computeDamage(const Fighter *a, const Fighter *d, const Tech *t, int *crit) {
  int dmg, tells;
  if (!t->power) return 0;
  dmg = (int)udiv((u32)(t->power * a->might * 11), (u32)(15 * (d->guard + 55)));
  tells = biteTells(d, t);
  if (tells > 0) dmg = dmg * 15 / 10;
  else if (tells < 0) dmg = dmg * 7 / 10;
  /* The dead do not care about a sword. Steel goes through them and they keep
     coming; obsidian and Valyrian steel come apart in the wound and take them
     with it. This is why there is dragonglass lying about on the Dragonmont and
     in the snow north of the Wall, and why it is worth carrying home. */
  if (d->dead) dmg = a->obsidian ? dmg * 5 / 2 : dmg * 2 / 5;
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

/* Guard is already the fourth technique on the Fight menu, so the third slot up
   here was doing nothing that could not be done one press deeper. It is what
   you set on them, once you have something to set. */
static const char *topItem(int i) {
  if (i == 2 && MY_BEAST.kind != 255) return beasts[MY_BEAST.kind].name;
  return DUEL_TOP_ITEMS[i];
}

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
    drawText(x, y, topItem(i), i == topPick ? C_GOLD : C_INK);
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
  return (int)groundBy[you.house][worldId] - (int)groundBy[0][worldId];
}

static int scaleTo(int v, int from, int to) {
  return from > 0 ? (int)udiv((u32)v * (u32)to, (u32)from) : v;
}

/*
 * Meeting the player where they are.
 *
 * Difficulty used to be a property of the ground alone: level three at your own
 * gate and forty-four at the far end of the world, whoever you were and however
 * you had played. Walk two doors the wrong way at level twelve and everything
 * on the road was a wall; come back at forty and everything was furniture. And
 * the sigil-holders were worse, because their ladder is fixed: arrive at a seat
 * three rungs early and the fight was not hard, it was arithmetic with a
 * foregone answer.
 *
 * So the ground still says how hard a place OUGHT to be, and it still decides
 * which way the difference runs - the far end of the world is still the far end
 * of the world - but the number is pulled three quarters of the way toward you
 * and then held inside a band you can actually fight in. A road near your own
 * seat stays easier than you. A road at the other end stays harder. Neither is
 * ever a wall, and neither is ever furniture.
 */
static int nearYou(int ground, int floorAt, int over) {
  int want = ground;
  /* Never a wall: nothing in the world is ever more than `over` levels above
     you, whatever the ground says. */
  if (want > (int)you.level + over) want = (int)you.level + over;
  /* But only lift it off the floor where the story needs a fight to be a fight.
     Lifting everything toward you was the first attempt and it was worse than
     the problem: it turned the gentle ground round your own seat into a real
     fight too, so every road anywhere was the same slog and there was nowhere
     left to go and simply be better than the people on it. */
  if (floorAt >= 0 && want < (int)you.level + floorAt) want = (int)you.level + floorAt;
  if (want < 2) want = 2;
  if (want > 60) want = 60;
  return want;
}

static int levelOf(int duellist) {
  const Duellist *d = &duellists[duellist];
  int lead = leaderFor(duellist);
  if (lead >= 0) {
    /* A sigil-holder is always a harder fight than you are having anywhere
       else, and never an impossible one: one to six levels over you, in the
       order the ladder puts them, so the ninth is still worse than the first. */
    /* A sigil-holder is never a cliff - six levels over you at the very most,
       so arriving early is a hard fight rather than an impossible one. But no
       floor: what the ladder says is what they are, and if you have gone away
       and come back stronger than that, you are stronger than that. Holding
       them one level above you whatever you did made every seat the same fight
       forever and took away the oldest answer in the genre, which is to go and
       level up and come back. */
    return nearYou(leaderLevel[rungOf[lead]], -1, 6);
  }
  /* Somebody the story knows by name keeps their own weight - they are meant to
     be a step up - but not a cliff: eight over you at the very most. */
  if (d->fixed) return nearYou((int)d->level, -1, 8);
  return nearYou((int)d->level + shiftHere(), -1, 5);
}

static int foeLevel, foePurse;
static int foeBeast = -1;        /* which animal you are facing, or -1 for a person */
static int beastActed;           /* whether yours has already gone in this duel */
static int beastSwinging;        /* and whether it is the one swinging right now */
/* What a relic has left running. All three are spent inside the fight they were
   used in and cleared when the yard comes down, so nothing carries over into
   somebody else's duel. */
static int snareEdge;            /* a doused net, worth this much more */
static int theyBalk;             /* they lose their next go */
static int mySureShots;          /* this many of your blows cannot miss */
static int wildWanted = -1, wildLevel;   /* the animal a shift is carrying in */

/* The screen the fight is fought on, once both sides are built. */
static void openTheDuel(const char *intro) {
  snareEdge = 0;
  theyBalk = 0;
  mySureShots = 0;
  duelOver = 0;
  duelMenu = 0;
  topPick = 0;
  duelPhase = 0;
  fxLeft = 0;
  beastSwinging = 0;
  sinkMine = sinkTheirs = 0;
  shownMine = mine.hp;
  shownTheirs = theirs.hp;
  shownExp = you.exp;
  clearPage();
  layoutTextRows(TEXT_DUEL);
  paintDuelPlates();
  duelSay(theirs.name, intro);
}

/* You, as you walk into it. The same whoever is on the other side. */
static void readyYourself(void) {
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
  mine.dead = 0;
  mine.obsidian = you.WORN_WEAPON && wares[you.WORN_WEAPON - 1].obsidian;
  beastActed = 0;
  /* And whatever is at your heel, if the other side is not itself an animal -
     there is only room in object memory for two of them at once. */
  if (MY_BEAST.kind != 255 && foeBeast < 0) {
    loadBeastArt(MY_BEAST.kind, MY_BEAST_TILE, MY_BEAST_BANK);
  }
}

/* An animal out of the long grass. It carries nothing, it is worth nothing at a
   counter, and it is the only thing in the game you can end a fight by keeping
   rather than by killing. */
static void beginWild(int which, int level) {
  foeSlot = -1;
  foeBank = 0;
  foeId = -1;
  foeDef = 0;
  foeBeast = which;
  foeLevel = level < 2 ? 2 : level;
  foePurse = 6 + foeLevel * 4;

  theirs.name = beasts[which].name;
  theirs.level = foeLevel;
  theirs.hp = theirs.maxHp = beastVigour(which, foeLevel);
  theirs.might = beastMight(which, foeLevel);
  theirs.guard = beastGuard(which, foeLevel);
  theirs.swiftness = beastSwift(which, foeLevel);
  theirs.tech = beasts[which].tech;
  theirs.defending = 0;
  theirs.dead = beasts[which].dead;
  theirs.obsidian = 0;
  loadBeastArt(which, FOE_BEAST_TILE, FOE_BEAST_BANK);
  readyYourself();
  copyString(scratch, "A ", sizeof scratch);
  appendString(scratch, beasts[which].name, sizeof scratch);
  appendString(scratch, " comes out of the grass with its head down.", sizeof scratch);
  /* And whether there is any point reaching for the pouch. Taking things alive
     is half of what this game is and nothing anywhere ever mentioned it, so a
     player could walk the whole map killing everything without once learning
     that a net was a thing they could have bought. */
  if (beasts[which].tame) {
    int i, net = 0;
    for (i = 0; i < WARE_COUNT; i++) {
      if (wares[i].kind == WARE_SNARE && you.bag[i]) { net = 1; break; }
    }
    appendString(scratch, net
      ? "  Wear it down and there is a net in your pouch that would hold it."
      : "  It could be taken alive, with a net. Any maester's hall sells one.",
      sizeof scratch);
  }
  openTheDuel(scratch);
}

static void beginDuel(int duellist, int bank, int slot) {
  foeSlot = slot;
  foeBank = bank;
  foeId = duellist;
  foeBeast = -1;
  foeDef = &duellists[duellist];
  foeLevel = levelOf(duellist);
  foePurse = scaleTo(foeDef->reward, foeDef->level, foeLevel);

  readyYourself();

  theirs.name = foeDef->name;
  theirs.level = foeLevel;
  theirs.hp = theirs.maxHp = scaleTo(foeDef->vigour, foeDef->level, foeLevel);
  theirs.might = scaleTo(foeDef->might, foeDef->level, foeLevel);
  theirs.guard = scaleTo(foeDef->guard, foeDef->level, foeLevel);
  theirs.swiftness = scaleTo(foeDef->swiftness, foeDef->level, foeLevel);
  /* A sigil-holder is meant to be a wall, and on the numbers alone they were
     not: played properly, every one of them went down in a handful of exchanges
     because they were simply another person of about your level. They are the
     nine hardest fights in the game, so they fight like it. */
  if (leaderFor(duellist) >= 0) {
    theirs.hp = theirs.maxHp = theirs.maxHp + (theirs.maxHp >> 1);
    theirs.might += theirs.might / 5;
    theirs.guard += theirs.guard / 4;
  }
  theirs.tech = foeDef->tech;
  theirs.defending = 0;
  theirs.dead = foeDef->dead;
  theirs.obsidian = 0;

  /* They fight in what they are carrying, and what they are carrying is what
     you will be taking off them. That is what keeps the road level as you climb
     it: the sword that is hurting you is the sword you are about to own, and
     the next person up the road has a better one. */
  {
    Kit k = kitOf(duellist, foeLevel);
    int i;
    u8 piece[5];
    /* They fight in their weapon and their mail. The shield is slung across
       their back until it is not their fight any more, which is where you get
       it from - and it is the one edge a scavenger has over everybody on the
       road: you are wearing all three of everything you ever took. */
    piece[0] = k.arm; piece[1] = k.mail;
    /* And their shield, if they had the sense to get it off their back. Every
       one of them used to fight with it slung, which meant the player was the
       only person in Westeros wearing all three pieces they owned - and by the
       middle of the game that gap was worth twenty-eight fights in a row
       without going down. Half of them have it up now; you still take it off
       them either way. */
    piece[2] = (kitHash(duellist) & 1) ? k.shield : KIT_NONE;
    /* The helm and the gauntlets are always on. Nobody carries a helm. */
    piece[3] = k.helm; piece[4] = k.gloves;
    for (i = 0; i < 5; i++) {
      const Ware *w;
      if (piece[i] == KIT_NONE) continue;
      w = &wares[piece[i]];
      theirs.might += w->might;
      theirs.guard += w->guard;
      theirs.swiftness += w->swiftness;
    }
    if (theirs.swiftness < 1) theirs.swiftness = 1;
  }

  openTheDuel(foeDef->intro);
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
  /* Somebody who has drunk the shade sees the blow before it is thrown, and
     what you can see coming you do not miss. */
  if (isYou && mySureShots) mySureShots--;
  else if ((int)roll(100) >= t->accuracy) {
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
  {
    int tells = biteTells(target, t);
    if (tells > 0) {
      appendString(scratch, t->bite == 1 ? "  Steel is no help against weight."
                                         : "  Straight through the gap.", sizeof scratch);
    } else if (tells < 0) {
      appendString(scratch, t->bite == 1 ? "  Nothing there to break."
                                         : "  The point turns on the plate.", sizeof scratch);
    }
    /* And the one thing that matters north of the Wall. */
    if (target->dead) {
      appendString(scratch, actor->obsidian
        ? "  The obsidian goes in and stays in."
        : "  Steel barely marks it. Something else is needed.", sizeof scratch);
    }
  }
  /* And then the companies. Whoever is behind you comes in on the back of your
     blow rather than taking a turn of their own: a fight with six swords a side
     that took twelve turns to get through a round would be unreadable. */
  if (target->hp > 0) {
    int extra = (target == &theirs) ? myHostBlow() : theirHostBlow();
    /* Your own six stand in front of you when the other company comes on. */
    if (target == &mine && extra > 0) {
      extra -= myHostGuard();
      if (extra < 0) extra = 0;
    }
    if (extra > 0) {
      target->hp -= extra;
      if (target->hp < 0) target->hp = 0;
      appendString(scratch, target == &theirs ? "  Your swords come in behind it: "
                                              : "  Their swords come in behind it: ",
        sizeof scratch);
      appendNumber(scratch, extra, sizeof scratch);
      appendString(scratch, " more.", sizeof scratch);
    }
  }
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

  if (MY_BEAST.kind != 255) {
    copyString(scratch, "At your heel: ", sizeof scratch);
    appendString(scratch, beasts[MY_BEAST.kind].name, sizeof scratch);
    appendString(scratch, ", level ", sizeof scratch);
    appendNumber(scratch, MY_BEAST.level, sizeof scratch);
    drawText(16, 90, scratch, C_WELL);
  } else if (you.tamed) {
    drawText(16, 90, "Nothing at your heel just now.", C_DIM);
  } else {
    drawText(16, 90, "Take something alive with a snare, or hatch one.", C_DIM);
  }

  fillRect(16, 101, TXT_W - 32, 1, C_EDGE);
  /* What to do next, in words, on the one screen a lost player will open. The
     game had a spine and never mentioned it, which is the same as not having
     one. */
  {
    int at = nextRung();
    if (at < 0) {
      drawText(16, 105, you.story >= 3 ? "The Iron Throne is yours. Holding it is the rest."
                                       : "Every sigil taken. The Red Keep is open.", C_GOLD);
    } else {
      const Leader *l = &leaders[atRung[at]];
      copyString(scratch, "Next: ", sizeof scratch);
      appendString(scratch, l->name, sizeof scratch);
      drawText(16, 105, scratch, C_GOLD);
      copyString(scratch, "at ", sizeof scratch);
      appendString(scratch, l->seat, sizeof scratch);
      appendString(scratch, ", about level ", sizeof scratch);
      appendNumber(scratch, leaderLevel[at], sizeof scratch);
      drawText(16, 118, scratch, C_DIM);
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
/* "ICE3". The kennels, the host and then the cutscene flags each changed the
   shape of the record; an old save read as this one would put animals, sworn
   swords and scenes-already-seen in places they were never written to. */
#define RECORD_MAGIC 0x33454349u

typedef struct {
  u32 magic;
  u8 house, level, worldId, dir;
  u8 x, y, pad0, pad1;
  /* What you had on. One byte per kind of thing, which is how it is held in
     memory too, so a helm and a pair of gauntlets did not need a new record
     format - the two slots that were padding are what they went into. */
  u8 worn[WARE_KINDS];
  u8 pad2, pad3b, pad4b;
  u16 sigils, pad3;
  u8 eggWins, tamed, lead, pad4;
  /* All six of them. It used to be one kind, one level and one lot of
     experience, which is what a party of one needs. */
  u8 partyKind[PARTY_MAX], partyLevel[PARTY_MAX];
  u16 partyExp[PARTY_MAX];
  /* What is boarded at the kennels, and who has sworn to you. */
  u8 holdKind[HOLD_MAX], holdLevel[HOLD_MAX];
  u16 holdExp[HOLD_MAX];
  u8 hostKind[HOST_MAX], hostLevel[HOST_MAX];
  u8 haven, havenX, havenY, story;
  /* Which scenes have played and what you answered when one asked. A cutscene
     that fired again after a reload would be worse than one that never fired. */
  u32 storyFlags[STORY_WORDS];
  u8 emptied[MAP_COUNT][8];
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
  { int k; for (k = 0; k < WARE_KINDS; k++) record.worn[k] = you.worn[k]; }
  record.sigils = sigils;
  { int k;
    for (k = 0; k < PARTY_MAX; k++) {
      record.partyKind[k] = you.party[k].kind;
      record.partyLevel[k] = you.party[k].level;
      record.partyExp[k] = you.party[k].exp;
    }
    record.lead = you.lead;
    for (k = 0; k < HOLD_MAX; k++) {
      record.holdKind[k] = you.holdfast[k].kind;
      record.holdLevel[k] = you.holdfast[k].level;
      record.holdExp[k] = you.holdfast[k].exp;
    }
    for (k = 0; k < HOST_MAX; k++) {
      record.hostKind[k] = you.host[k].kind;
      record.hostLevel[k] = you.host[k].level;
    }
  }
  record.story = you.story;
  { int k; for (k = 0; k < STORY_WORDS; k++) record.storyFlags[k] = storyFlags[k]; }
  record.eggWins = you.eggWins;
  record.tamed = you.tamed;
  record.haven = (u8)(you.haven < 0 ? 255 : you.haven);
  record.havenX = (u8)you.havenX;
  record.havenY = (u8)you.havenY;
  for (m = 0; m < MAP_COUNT; m++) for (k = 0; k < 8; k++) record.emptied[m][k] = emptied[m][k];
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
  { int k; for (k = 0; k < WARE_KINDS; k++) you.worn[k] = record.worn[k]; }
  sigils = record.sigils;
  layLadder();
  { int k;
    for (k = 0; k < PARTY_MAX; k++) {
      you.party[k].kind = record.partyKind[k];
      you.party[k].level = record.partyLevel[k];
      you.party[k].exp = record.partyExp[k];
      you.party[k].hp = record.partyKind[k] == 255
        ? 0 : beastVigour(record.partyKind[k], record.partyLevel[k]);
    }
    you.lead = record.lead < PARTY_MAX ? record.lead : 0;
    for (k = 0; k < HOLD_MAX; k++) {
      you.holdfast[k].kind = record.holdKind[k];
      you.holdfast[k].level = record.holdLevel[k];
      you.holdfast[k].exp = record.holdExp[k];
      you.holdfast[k].hp = record.holdKind[k] == 255
        ? 0 : beastVigour(record.holdKind[k], record.holdLevel[k]);
    }
    for (k = 0; k < HOST_MAX; k++) {
      you.host[k].kind = record.hostKind[k];
      you.host[k].level = record.hostLevel[k];
      you.host[k].exp = 0;
      you.host[k].hp = record.hostKind[k] == 255
        ? 0 : swornVigour(record.hostKind[k], record.hostLevel[k]);
    }
  }
  you.story = record.story;
  { int k; for (k = 0; k < STORY_WORDS; k++) storyFlags[k] = record.storyFlags[k]; }
  you.eggWins = record.eggWins;
  you.tamed = record.tamed;
  you.haven = record.haven == 255 ? -1 : record.haven;
  you.havenX = record.havenX;
  you.havenY = record.havenY;
  for (m = 0; m < MAP_COUNT; m++) for (k = 0; k < 8; k++) emptied[m][k] = record.emptied[m][k];
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
/* Set when the person you just spoke to was a harbourmaster: the passage
   list opens once they have finished talking, the same way a counter does. */
static int afterPort;
/* Set when a kennelmaster has finished saying what they say, so the cages open
   as the window closes rather than needing a second press on the same person. */
static int afterHold;
static int portPick;
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
  int k;
  for (k = 0; k < WARE_KINDS; k++) if (you.worn[k] == at + 1) return 1;
  return 0;
}

/* One line about a thing, into scratch, for whichever list is showing it. The
   nudge to put it on belongs in the pouch and nowhere else. */
static void describeWare(int at, int inPouch) {
  const Ware *w = &wares[at];
  copyString(scratch, "", sizeof scratch);
  if (w->kind == WARE_STUFF) {
    int i, j;
    copyString(scratch, "Makings. Good for ", sizeof scratch);
    for (i = 0, j = 0; i < RECIPE_COUNT && j < 2; i++) {
      int k;
      for (k = 0; k < recipes[i].count; k++) {
        if (recipes[i].mat[k] != at) continue;
        if (j++) appendString(scratch, ", ", sizeof scratch);
        appendString(scratch, wares[recipes[i].makes].name, sizeof scratch);
        break;
      }
    }
    appendString(scratch, j ? " and more." : "nothing you have found yet.", sizeof scratch);
    return;
  }
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
  /* With five slots to fill, the useful thing to know standing over a helm is
     not what it is worth on its own - it is whether it beats the one on your
     head. */
  if (w->kind < WARE_KINDS && (w->kind == WARE_WEAPON || w->kind == WARE_ARMOUR
      || w->kind == WARE_SHIELD || w->kind == WARE_HELM || w->kind == WARE_GLOVES)) {
    if (worn(at)) {
      appendString(scratch, "   On you now.", sizeof scratch);
    } else if (you.worn[w->kind]) {
      const Ware *had = &wares[you.worn[w->kind] - 1];
      int step = (w->might + w->guard) - (had->might + had->guard);
      appendString(scratch, "   ", sizeof scratch);
      appendString(scratch, step > 0 ? "Better than your " : step < 0 ? "Worse than your "
                                                                     : "Same as your ", sizeof scratch);
      appendString(scratch, had->name, sizeof scratch);
    }
  }
  if (inPouch && !worn(at)) appendString(scratch, "   A to take it up", sizeof scratch);
}

/* Whether the pouch was opened standing at somebody's counter. */
static int atCounter;

/* What a counter will give you for something you are carrying.
 *
 * You could buy and never sell, so a pouch filled up with everything you had
 * ever taken off anybody and there was nothing to do with any of it. Half the
 * asking price, which is what anybody gets for second-hand steel, and nothing
 * at all for what you are wearing - a counter will not buy the shirt off your
 * back while you are standing in it. */
static int wareWorth(int at) {
  const Ware *w = &wares[at];
  if (!you.bag[at] || worn(at)) return 0;
  if (w->kind == WARE_STUFF) return 6 + wares[at].tier * 20;
  return w->price >> 1;
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
    if (wares[at].kind == WARE_POTION || wares[at].kind == WARE_STUFF
        || wares[at].kind == WARE_SNARE || wares[at].kind == WARE_EGG
        || wares[at].kind == WARE_OATH || wares[at].kind == WARE_RELIC) {
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
    /* At a counter the pouch is also where you sell, so it says what this is
       worth and which button takes it. */
    if (atCounter && have) {
      int worth = wareWorth(at);
      copyString(scratch, worth ? "SELECT: sell for " : "SELECT: they will not take that",
        sizeof scratch);
      if (worth) appendNumber(scratch, worth, sizeof scratch);
      drawText(TXT_W - 14 - textWidth(scratch), TXT_H - 18, scratch,
        worth ? C_GOLD : C_DIM);
    }
  }
}

/* Drinking something, or putting it on. Returns 1 if it did anything.
   Gear stays in the pouch when it is taken up: what you were wearing is still
   yours, and swapping back costs nothing but the walk to the menu. */
static int wearWare(int at) {
  const Ware *w = &wares[at];
  if (!you.bag[at] || worn(at)) return 0;
  if (w->kind == WARE_WEAPON) { you.WORN_WEAPON = (u8)(at + 1); reckonTechniques(); }
  else if (w->kind == WARE_ARMOUR) { you.WORN_ARMOUR = (u8)(at + 1); loadPlayerBody(); }
  else if (w->kind == WARE_SHIELD || w->kind == WARE_HELM || w->kind == WARE_GLOVES) {
    you.worn[w->kind] = (u8)(at + 1);
  } else return 0;
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
  /* Everything that is spent by using it stacks; steel does not, and a second
     sword is scrap.
     Relics and oaths were on the wrong side of this line. Both are used up the
     moment they work, and you could hold exactly one of each for the whole
     game - one horn, one jar of wildfire, one purse - so the things that make
     a hard fight winnable were rationed to a single use per trip to a counter.
     Worse, a counter refuses to sell what you already hold, so carrying one
     made every counter in the world say no to it forever. */
  if (w->kind == WARE_POTION || w->kind == WARE_STUFF
      || w->kind == WARE_SNARE || w->kind == WARE_EGG
      || w->kind == WARE_OATH || w->kind == WARE_RELIC) {
    if (you.bag[at] < 99) you.bag[at]++;
    return TOOK_KEPT;
  }
  if (you.bag[at]) {
    you.gold += w->price >> 4;      /* scrap, not the asking price */
    return TOOK_SOLD;
  }
  you.bag[at]++;
  {
    int had = w->kind < WARE_KINDS ? you.worn[w->kind] : 0;
    if (!had || wares[had - 1].price < w->price) { wearWare(at); return TOOK_WORN; }
  }
  return TOOK_KEPT;
}

/* ----------------------------------------------------------- taking one ---
   A net over an animal that is still fresh does nothing but annoy it. The
   further down it is the better your odds, and the better the net the better
   again - which is what makes the whole thing a fight you win by nearly
   winning rather than by winning. */
static int snareOdds(int snare) {
  int room = theirs.maxHp > 0 ? (int)udiv((u32)theirs.hp * 100, (u32)theirs.maxHp) : 100;
  int hurt = 100 - room;                       /* how far down it is, in hundredths */
  int base = 100 - beasts[foeBeast].hold;      /* how hard this kind is to hold */
  int odds = (wares[snare].hold + (hurt >> 1)) - (base >> 2) + snareEdge;
  /* A beast far above you knows what it is doing. */
  odds -= (theirs.level - you.level) * 2;
  if (odds < 3) odds = 3;
  if (odds > 92) odds = 92;
  return odds;
}

/* And the odds on a purse. Nobody swears to somebody who has not beaten them
   badly, so how far down they are counts for more here than it does with a net:
   a man on his feet takes the money and keeps fighting. */
static int oathOdds(int oath) {
  int room = theirs.maxHp > 0 ? (int)udiv((u32)theirs.hp * 100, (u32)theirs.maxHp) : 100;
  int hurt = 100 - room;
  int odds = wares[oath].hold + ((hurt * 3) >> 2) - 40 + snareEdge;
  /* Somebody far above you does not take orders from you at any price. */
  odds -= (theirs.level - you.level) * 3;
  if (odds < 2) odds = 2;
  if (odds > 90) odds = 90;
  return odds;
}

/* Puts it at your heel. Whatever you had walks away, and it is said out loud
   rather than swapped silently: losing one you raised should cost a sentence. */
/* How many are travelling with you. */
static int partyCount(void) {
  int i, n = 0;
  for (i = 0; i < PARTY_MAX; i++) if (you.party[i].kind != 255) n++;
  return n;
}

/* The first empty place in it, or -1 when six are already at your heel. */
static int partyRoom(void) {
  int i;
  for (i = 0; i < PARTY_MAX; i++) if (you.party[i].kind == 255) return i;
  return -1;
}

/* Puts one into the party. Returns 0 when there is no room for it - the caller
   says so; there is nothing sadder than a net thrown well and a beast that
   quietly does not appear anywhere. */
static int keepBeast(int which, int level) {
  int at = partyRoom();
  if (at < 0) return 0;
  you.party[at].kind = (u8)which;
  you.party[at].level = (u8)level;
  you.party[at].exp = (u16)beastExpFor(level);
  you.party[at].hp = beastVigour(which, level);
  /* The first one you ever take walks out in front. */
  if (MY_BEAST.kind == 255) you.lead = (u8)at;
  you.tamed++;
  return 1;
}

/* ------------------------------------------------------------ the kennels ---
   Six at your heel is all anybody can feed on the road. Everything past the
   sixth was turned loose on the spot, which meant a good net thrown well after
   your party was full was worth nothing at all. It is boarded here instead. */

static int holdCount(void) {
  int i, n = 0;
  for (i = 0; i < HOLD_MAX; i++) if (you.holdfast[i].kind != 255) n++;
  return n;
}

static int holdRoom(void) {
  int i;
  for (i = 0; i < HOLD_MAX; i++) if (you.holdfast[i].kind == 255) return i;
  return -1;
}

/* Boards one of your six. Returns 0 when the kennels are full. The one you
   were leading with is never the one that goes, so `lead` cannot end up
   pointing at an empty place. */
static int boardBeast(int at) {
  int room = holdRoom();
  if (at < 0 || at >= PARTY_MAX || you.party[at].kind == 255) return 0;
  if (room < 0) return 0;
  you.holdfast[room] = you.party[at];
  you.party[at].kind = 255;
  if (you.lead == (u8)at) {
    int i;
    you.lead = 0;
    for (i = 0; i < PARTY_MAX; i++) if (you.party[i].kind != 255) { you.lead = (u8)i; break; }
  }
  return 1;
}

/* And takes one back out. */
static int fetchBeast(int at) {
  int room = partyRoom();
  if (at < 0 || at >= HOLD_MAX || you.holdfast[at].kind == 255) return 0;
  if (room < 0) return 0;
  you.party[room] = you.holdfast[at];
  you.holdfast[at].kind = 255;
  if (MY_BEAST.kind == 255) you.lead = (u8)room;
  return 1;
}

/* --------------------------------------------------------------- the host ---
   What a purse buys you. Somebody who has yielded and been paid walks behind
   you afterwards and swings when you swing; enough of them and a fight at
   somebody's gate is a fight between two companies. */

/* A sworn sword's numbers at a level, read off the two the table carries.
   Everything about them is a straight line between level ten and level forty,
   which is what the generator that dresses them as opponents does too. */
static int swornStat(int low, int high, int level) {
  int span = high - low;
  if (level < 1) level = 1;
  if (level > 50) level = 50;
  return low + (span * (level - 10)) / 30;
}

static int swornMight(int kind, int level) {
  return swornStat(swornKinds[kind].might10, swornKinds[kind].might40, level);
}

static int swornGuard(int kind, int level) {
  return swornStat(swornKinds[kind].guard10, swornKinds[kind].guard40, level);
}

static int swornVigour(int kind, int level) {
  int v = swornStat(swornKinds[kind].vigour10, swornKinds[kind].vigour40, level);
  return v < 8 ? 8 : v;
}

static int hostCount(void) {
  int i, n = 0;
  for (i = 0; i < HOST_MAX; i++) if (you.host[i].kind != 255) n++;
  return n;
}

static int hostRoom(void) {
  int i;
  for (i = 0; i < HOST_MAX; i++) if (you.host[i].kind == 255) return i;
  return -1;
}

/* What your six add to a blow of yours. Each of them lands something small;
   together they are worth about as much again as you are, which is what four
   thousand gold and a fight you had to win first ought to buy. */
static int myHostBlow(void) {
  int i, total = 0;
  for (i = 0; i < HOST_MAX; i++) {
    int hit;
    if (you.host[i].kind == 255) continue;
    hit = swornMight(you.host[i].kind, you.host[i].level) / 6 - theirs.guard / 12;
    if (hit < 1) hit = 1;
    total += hit;
  }
  return total;
}

/* And what standing behind six shields is worth when the other company comes at
   you: they take some of it before it reaches you. */
static int myHostGuard(void) {
  int i, total = 0;
  for (i = 0; i < HOST_MAX; i++) {
    if (you.host[i].kind == 255) continue;
    total += swornGuard(you.host[i].kind, you.host[i].level) / 8;
  }
  return total;
}

/* And what theirs add, which is what makes a captain on his own gate a company
   rather than a man. */
static int theirHostBlow(void) {
  int n, kind, hit;
  if (!foeDef || foeBeast >= 0) return 0;
  n = foeDef->host;
  if (n <= 0) return 0;
  kind = foeDef->sworn < SWORN_KINDS ? foeDef->sworn : 0;
  hit = swornMight(kind, foeLevel) / 6 - mine.guard / 12;
  if (hit < 1) hit = 1;
  return hit * n;
}

/* What "you have nothing and nobody" actually means.
   Nought is a real animal and a real sort of sworn sword, so an array that has
   never been written to reads as full rather than empty: a new game began with
   eighteen snowpups boarded and six bandits already following you. These have
   to be written, not left as they were born. */
void newGameState(void) {
  int k;
  for (k = 0; k < PARTY_MAX; k++) you.party[k].kind = 255;
  for (k = 0; k < HOLD_MAX; k++) you.holdfast[k].kind = 255;
  for (k = 0; k < HOST_MAX; k++) you.host[k].kind = 255;
  you.lead = 0;
  for (k = 0; k < STORY_WORDS; k++) storyFlags[k] = 0;
}

/* Takes somebody's oath. Returns 0 when there is nobody left to take it. */
static int swearIn(int kind, int level) {
  int at = hostRoom();
  if (kind >= SWORN_KINDS || at < 0) return 0;
  you.host[at].kind = (u8)kind;
  you.host[at].level = (u8)level;
  you.host[at].exp = 0;
  you.host[at].hp = swornVigour(kind, level);
  return 1;
}

/* Why the last thing you reached for did nothing, if it did nothing. */
static const char *wareBalked;

static int useWare(int at) {
  int max = vigourFor(you.level), heal;
  wareBalked = 0;
  if (!you.bag[at]) return 0;
  if (wares[at].kind != WARE_POTION) return wearWare(at);
  heal = wares[at].heal >= 9999 ? max : wares[at].heal;
  if (you.hp >= max) {
    wareBalked = "There is nothing wrong with you. Keep it for when there is.";
    return 0;
  }
  you.hp += heal;
  if (you.hp > max) you.hp = max;
  you.bag[at]--;
  return 1;
}

/* ------------------------------------------------------------ the forge ----
   Gold was the only thing a win was worth, and by the middle of the game there
   was more of it than there were things to buy. Everything you beat now yields
   something a smith or a maester can use, and the best four pieces of kit in
   the world are on nobody's counter at any price - they are made, out of what
   you carried off people who were harder than you. */

static int craftPick, craftAt;      /* craftAt: 0 a maester's bench, 1 a forge */

/* How many of this recipe's list you are short of. Nought means make it. */
static int shortOf(const Recipe *r) {
  int i, missing = 0;
  for (i = 0; i < r->count; i++) {
    if (you.bag[r->mat[i]] < r->many[i]) missing++;
  }
  return missing;
}

static int craftCount(void) {
  int i, n = 0;
  for (i = 0; i < RECIPE_COUNT; i++) if (recipes[i].at == craftAt) n++;
  return n;
}

static int nthRecipe(int n) {
  int i;
  for (i = 0; i < RECIPE_COUNT; i++) {
    if (recipes[i].at != craftAt) continue;
    if (!n--) return i;
  }
  return 0;
}

/* Four rows, not six: this screen carries a line of makings under the list and
   a line of instructions under that, and six rows ran straight through both. */
#define CRAFT_ROWS 4

static void paintCraft(void) {
  int have = craftCount(), i;
  int top = craftPick - (CRAFT_ROWS >> 1);
  if (top > have - CRAFT_ROWS) top = have - CRAFT_ROWS;
  if (top < 0) top = 0;
  clearRows(0, TXT_H);
  drawFrame(4, 2, TXT_W - 8, TXT_H - 8);
  drawText(14, 6, craftAt ? "AT THE ANVIL" : "AT THE BENCH", C_GOLD);
  showGold(6);
  fillRect(14, 18, TXT_W - 28, 1, C_EDGE);

  for (i = 0; i < CRAFT_ROWS && top + i < have; i++) {
    const Recipe *r = &recipes[nthRecipe(top + i)];
    int y = 22 + i * 11, able = !shortOf(r) && you.gold >= r->gold;
    if (top + i == craftPick) drawCursor(14, y + 1, C_GOLD);
    drawText(24, y, wares[r->makes].name,
      !able ? C_DIM : (top + i == craftPick ? C_GOLD : C_INK));
    copyString(scratch, "", sizeof scratch);
    appendNumber(scratch, r->gold, sizeof scratch);
    drawText(TXT_W - 46, y, scratch, able ? C_GOLD : C_DIM);
  }
  {
    const Recipe *r = &recipes[nthRecipe(craftPick)];
    int i2;
    copyString(scratch, "", sizeof scratch);
    for (i2 = 0; i2 < r->count; i2++) {
      if (i2) appendString(scratch, ", ", sizeof scratch);
      appendNumber(scratch, r->many[i2], sizeof scratch);
      appendString(scratch, " ", sizeof scratch);
      appendString(scratch, wares[r->mat[i2]].name, sizeof scratch);
      appendString(scratch, " (", sizeof scratch);
      appendNumber(scratch, you.bag[r->mat[i2]], sizeof scratch);
      appendString(scratch, ")", sizeof scratch);
    }
    drawText(14, TXT_H - 32, scratch, C_INK);
    drawText(14, TXT_H - 18, craftAt ? "A: forge it    SELECT: the counter    B: go"
                                     : "A: brew it    SELECT: the counter    B: go", C_DIM);
  }
}

/* Where a ship will take you.
 *
 * The Free Cities have been in the browser game since the beginning and have
 * never been on the cartridge, because there was no way to get to them: the
 * captain was a man standing on a deck with a line of dialogue. This is the
 * line of dialogue turned into a berth list. The port you are standing in is
 * not on it, and neither is one you cannot pay for - or rather it is on it, in
 * grey, so you know what the next one costs.
 */
#define PORT_ROWS 5

static int portHere(void) {
  int i;
  for (i = 0; i < PORT_COUNT; i++) if (ports[i].map == worldId) return i;
  return -1;
}

static void paintPort(void) {
  int i, row = 0, mine = portHere();
  int top = portPick - (PORT_ROWS >> 1);
  if (top > PORT_COUNT - PORT_ROWS) top = PORT_COUNT - PORT_ROWS;
  if (top < 0) top = 0;
  clearRows(0, TXT_H);
  drawFrame(4, 2, TXT_W - 8, TXT_H - 8);
  drawText(14, 6, "PASSAGE", C_GOLD);
  showGold(6);
  fillRect(14, 18, TXT_W - 28, 1, C_EDGE);

  for (i = 0; i < PORT_COUNT && row < PORT_ROWS; i++) {
    int y, able;
    if (i < top) continue;
    y = 22 + row * 11;
    able = i != mine && you.gold >= (int)ports[i].fare;
    if (i == portPick) drawCursor(14, y + 1, C_GOLD);
    drawText(24, y, ports[i].name,
      !able ? C_DIM : (i == portPick ? C_GOLD : C_INK));
    if (i == mine) {
      drawText(TXT_W - 62, y, "you are here", C_DIM);
    } else {
      copyString(scratch, "", sizeof scratch);
      appendNumber(scratch, (int)ports[i].fare, sizeof scratch);
      drawText(TXT_W - 46, y, scratch, able ? C_GOLD : C_DIM);
    }
    row++;
  }
  drawText(14, TXT_H - 18, "A: sail    B: stay ashore", C_DIM);
}

/* Casts off, or says why not. */
static const char *sailTo(int which) {
  const Port *p = &ports[which];
  if (p->map == worldId) return "You are already tied up here.";
  /* Getting off a beach costs nothing.
     Somewhere with no road on it is somewhere you can only leave by water, and
     charging a fare to leave it means a purse spent fighting your way across it
     is a cartridge that has quietly ended: the sweep sailed to Hardhome, won
     every fight on it, and finished three of its nine playthroughs standing on
     the shingle with three hundred gold against an eighteen-hundred fare. The
     man who rowed you in wants to leave more than you do. He is not charging
     you for it. */
  if (!world->warpCount) {
    enterMap(p->map, p->x, p->y, p->dir);
    return 0;
  }
  if (you.gold < (int)p->fare) return "The captain looks at your purse and looks away.";
  you.gold -= (int)p->fare;
  enterMap(p->map, p->x, p->y, p->dir);
  return 0;
}

/* Hands over the work, or says why not. */
static const char *makeWare(int which) {
  const Recipe *r = &recipes[which];
  int i;
  if (shortOf(r)) return "You have not got the makings of that.";
  if (you.gold < r->gold) return "Not for what is in your purse.";
  you.gold -= r->gold;
  for (i = 0; i < r->count; i++) you.bag[r->mat[i]] -= r->many[i];
  {
    int how = takeWare(r->makes);
    copyString(scratch, craftAt ? "Hammered out and quenched: a "
                                : "Ground, steeped and stoppered: a ", sizeof scratch);
    appendString(scratch, wares[r->makes].name, sizeof scratch);
    appendString(scratch, how == TOOK_WORN ? ", and you put it on at once."
               : how == TOOK_SOLD ? ". You had one already; this one goes for scrap."
                                  : ", wrapped and handed over.", sizeof scratch);
  }
  return scratch;
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
    int mine = (wares[at].kind == WARE_POTION) ? 0 : worn(at);
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
    drawText(14, TXT_H - 30, scratch, C_DIM);
    /* Nobody would ever have found any of this by pressing buttons at a
       counter, so the counter says it outright. */
    drawText(14, TXT_H - 18, "A: buy    START: sell", C_GOLD);
    copyString(scratch, shopStall ? "SELECT: forge" : "SELECT: brew",
      sizeof scratch);
    drawText(TXT_W - 14 - textWidth(scratch), TXT_H - 18, scratch, C_GOLD);
  }
}

/* The same drink, in the middle of a fight. It costs you the turn. */
/* Set to the line a snare threw up, so the duel can say it, and whether it held. */
static const char *snareSaid;
static int snaredIt;

static int useInDuel(int at) {
  if (wares[at].kind == WARE_SNARE) {
    if (foeBeast < 0) {
      snareSaid = "A net is no way to settle a matter between people.";
      return 1;
    }
    if (!beasts[foeBeast].tame) {
      snareSaid = "Nothing you could throw would hold that, and it knows it.";
      return 1;
    }
    if (!you.bag[at]) return 0;
    you.bag[at]--;
    if ((int)roll(100) < snareOdds(at)) {
      int room = keepBeast(foeBeast, theirs.level);
      copyString(scratch, "The net holds. The ", sizeof scratch);
      appendString(scratch, beasts[foeBeast].name, sizeof scratch);
      appendString(scratch, " stops fighting it, and then stops fighting you.",
        sizeof scratch);
      if (!room) {
        /* Six is the whole party, and a net thrown well should never end with
           an animal quietly not appearing anywhere. It used to be cut loose on
           the spot; now it goes to the kennels, and is there when you next
           stand in a maester's hall. */
        int spare = holdRoom();
        if (spare >= 0) {
          you.holdfast[spare].kind = (u8)foeBeast;
          you.holdfast[spare].level = (u8)theirs.level;
          you.holdfast[spare].exp = (u16)beastExpFor(theirs.level);
          you.holdfast[spare].hp = beastVigour(foeBeast, theirs.level);
          you.tamed++;
          appendString(scratch, "  Six already walk with you, so it goes to the "
            "kennels. Any maester's hall will hand it back.", sizeof scratch);
        } else {
          appendString(scratch, "  Six walk with you and the kennels are full. "
            "You cut it loose.", sizeof scratch);
        }
      } else {
        appendString(scratch, "  That is ", sizeof scratch);
        appendNumber(scratch, partyCount(), sizeof scratch);
        appendString(scratch, " at your heel.", sizeof scratch);
      }
      snareSaid = scratch;
      theirs.hp = 0;                 /* the fight is over, and nothing died */
      snaredIt = 1;
    } else {
      copyString(scratch, "It tears out of the net and comes back angrier.",
        sizeof scratch);
      snareSaid = scratch;
    }
    return 1;
  }
  /* An oath. Everything about a road was somebody to knock down and walk past,
     and the gold you took off them piled up with nothing to spend it on. Put a
     purse in front of somebody who has already lost and they swear instead:
     they walk behind you afterwards and swing when you swing. */
  if (wares[at].kind == WARE_OATH) {
    if (foeBeast >= 0) {
      snareSaid = "An animal cannot swear anything, and would not keep it.";
      return 1;
    }
    if (!foeDef || foeDef->sworn >= SWORN_KINDS) {
      copyString(scratch, theirs.name, sizeof scratch);
      appendString(scratch, " is not for sale, at that price or any other.",
        sizeof scratch);
      snareSaid = scratch;
      return 1;
    }
    if (theirs.dead) {
      snareSaid = "It has nothing left to swear with.";
      return 1;
    }
    if (hostRoom() < 0) {
      snareSaid = "Six swords already follow you, and six is what you can pay.";
      return 1;
    }
    if (!you.bag[at]) return 0;
    you.bag[at]--;
    if ((int)roll(100) < oathOdds(at)) {
      swearIn(foeDef->sworn, theirs.level);
      copyString(scratch, theirs.name, sizeof scratch);
      appendString(scratch, " looks at what is on offer, looks at the ground, "
        "and takes it. That is ", sizeof scratch);
      appendNumber(scratch, hostCount(), sizeof scratch);
      appendString(scratch, hostCount() == 1 ? " sword behind you."
                                             : " swords behind you.", sizeof scratch);
      snareSaid = scratch;
      theirs.hp = 0;                 /* it is settled, and nobody died of it */
      snaredIt = 1;
    } else {
      copyString(scratch, theirs.name, sizeof scratch);
      appendString(scratch, " spits, and gets back up.", sizeof scratch);
      snareSaid = scratch;
    }
    return 1;
  }
  /* A relic. Seven of them, each doing one thing that no sword does, each used
     up doing it. This is what keeps a chest worth opening once you are already
     wearing the best of everything in the world. */
  if (wares[at].kind == WARE_RELIC && wares[at].relic) {
    you.bag[at]--;
    switch (wares[at].relic) {
      case 1:                                   /* Hunter's Draught */
        snareEdge = 25;
        copyString(scratch, "You douse the net. Whatever you throw it over is "
          "going to mind a good deal less.", sizeof scratch);
        break;
      case 2:                                   /* Ironwood Warhorn */
        theirs.defending = 0;
        theyBalk = 1;
        copyString(scratch, "One long note off the ironwood. They spend the next "
          "moment deciding whether to run, and lose it.", sizeof scratch);
        break;
      case 3:                                   /* Maester's Salts */
        if (MY_BEAST.kind == 255) {
          you.bag[at]++;
          return 0;
        }
        MY_BEAST.hp = beastVigour(MY_BEAST.kind, MY_BEAST.level);
        beastActed = 0;
        copyString(scratch, "Under its nose, and it gets up. All of it gets up.",
          sizeof scratch);
        break;
      case 4:                                   /* Shade of the Evening */
        mySureShots = 2;
        copyString(scratch, "Thick, blue, and it tastes of ink. You can see the "
          "next two blows before they are thrown.", sizeof scratch);
        break;
      case 5: {                                 /* Wildfire */
        int burn = 60 + you.level * 4;
        theirs.hp -= burn;
        if (theirs.hp < 0) theirs.hp = 0;
        copyString(scratch, "The jar goes over and the green takes hold. ", sizeof scratch);
        appendNumber(scratch, burn, sizeof scratch);
        appendString(scratch, " damage, and it is still burning.", sizeof scratch);
        break;
      }
      case 6:                                   /* Weirwood Paste */
        you.hp = vigourFor(you.level);
        mine.hp = you.hp;
        copyString(scratch, "You see a great deal at once and remember almost "
          "none of it. Everything that hurt has stopped.", sizeof scratch);
        break;
      default:                                  /* Dragonbinder */
        beastActed = 0;
        mySureShots = 3;
        copyString(scratch, "Six feet of Valyrian horn, and the note costs you "
          "something you will not miss until later.", sizeof scratch);
        break;
    }
    snareSaid = scratch;
    mine.hp = you.hp;
    paintDuelPlates();
    return 1;
  }
  if (!useWare(at)) return 0;
  snareSaid = 0;
  mine.hp = you.hp;
  paintDuelPlates();
  return 1;
}

/* Returns a line about what just happened at the counter. */
static const char *buyWare(int at) {
  const Ware *w = &wares[at];
  int how;
  if (you.gold < w->price) return "You cannot afford that, and it shows.";
  if (w->kind != WARE_POTION && w->kind != WARE_SNARE && w->kind != WARE_OATH
      && w->kind != WARE_RELIC && you.bag[at]) {
    return "You have one of those already.";
  }
  you.gold -= w->price;
  how = takeWare(at);
  if (you.hp > vigourFor(you.level)) you.hp = vigourFor(you.level);
  if (w->kind == WARE_POTION || w->kind == WARE_SNARE || w->kind == WARE_OATH
      || w->kind == WARE_RELIC) {
    return "Wrapped and handed over.";
  }
  /* Bought gear goes onto you only if it beats what you have, so a knife bought
     out of curiosity does not replace a good sword. */
  return how == TOOK_WORN ? "You put it on there and then."
                          : "Wrapped and handed over. Yours is still the better.";
}

static const char *sellWare(int at) {
  int worth = wareWorth(at);
  if (worn(at)) return "You are wearing that. Take it off first, or do not.";
  if (!worth) return "Nobody will give you anything for that.";
  you.bag[at]--;
  you.gold += worth;
  copyString(scratch, "Sold. ", sizeof scratch);
  appendNumber(scratch, worth, sizeof scratch);
  appendString(scratch, " gold, and no questions about where it came from.",
    sizeof scratch);
  return scratch;
}

/* ------------------------------------------------------------- the menu --- */

#define MENU_ENTRIES 7
static const char *const MENU[MENU_ENTRIES] =
  { "Sigil", "At Heel", "Swords", "Pouch", "Deeds", "Record", "Leave" };

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
#define SCENE_CRAFT 9
#define SCENE_PORT 10
#define SCENE_TALE 11
#define SCENE_PARTY 12
#define SCENE_HOLD  13    /* the cages at the back of a maester's hall */
#define SCENE_HOST  14    /* who has sworn to you */
#define SCENE_DEEDS 15    /* what you have walked into, and what you said */

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
  MY_BEAST.kind = 255;
  MY_BEAST.level = 0;
  MY_BEAST.exp = 0;
  you.eggWins = 0;
  you.tamed = 0;
  you.haven = -1;
  { int m, k; for (m = 0; m < MAP_COUNT; m++) for (k = 0; k < 8; k++) emptied[m][k] = 0; }
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

static int taleWaiting = -1, taleWaitingThen;  /* told once the duel lets go */
static int taleAt = -1;         /* which tale is playing, or -1 */
static int talePage;            /* and which page of it */
static int taleThen;            /* what to do when the last page turns over */

#define AFTER_NOTHING 0
#define AFTER_CHAMPION 1        /* Ser Gregor draws the moment the page turns */
#define AFTER_CROWN 2           /* and the crowning follows the sitting down  */

static void startTale(int which, int then);

static void endDuel(void) {
  scene = SCENE_WORLD;
  /* The yard borrows eleven of the world's palette entries and used to hand
     none of them back, so every colour between two hundred and two hundred and
     ten was a piece of sky until you next walked through a door. */
  copyPalettes();
  clearPage();
  layoutTextRows(TEXT_PLAY);
  loadWorldTiles();
  writeScreenblock();
  loadActors();
  PAL_BG[0] = bg_pal[0];
  REG_DISPCNT = (u16)(0x0040 | 0x0100 | 0x0200 | 0x1000);
  /* Anything the story wanted to say about that fight says it now, with the
     yard put away and the world back on the screen behind it. */
  if (taleWaiting >= 0) {
    int which = taleWaiting, then = taleWaitingThen;
    taleWaiting = -1;
    startTale(which, then);
  }
}

/* Whoever went down covering you, so the line about it can be read out after
   the line about waking up somewhere else. */
static const char *hostFell;

static void youFell(void) {
  int bare;
  sfxLost();
  /* Losing does NOT settle it. `beaten` is what stops somebody drawing on you
     twice, and it used to be set whoever won - so losing to a sigil-holder shut
     the only door to them: talking to them afterwards got a line and nothing
     else, and the ladder could not be climbed past the first bad fight. Somebody
     who has just put you on the floor is still willing to do it again. */
  you.hp = vigourFor(you.level);
  you.gold -= you.gold / 3;
  /* And somebody who swore to you does not walk away from it. A host that
     never thinned would be six swords you paid for once and then forgot. */
  {
    int i, last = -1;
    for (i = 0; i < HOST_MAX; i++) if (you.host[i].kind != 255) last = i;
    if (last >= 0) {
      hostFell = swornKinds[you.host[last].kind].name;
      you.host[last].kind = 255;
    } else {
      hostFell = 0;
    }
  }
  bare = !you.WORN_WEAPON;
  endDuel();
  /* Somebody carries you home. It costs you a third of your purse and the
     ground you had covered, which is enough of a lesson.

     And if you were beaten with nothing in your hands, there is a knife by the
     bed when you wake. Everything in this game is taken off somebody, which
     means a player with nothing who cannot win a fight has no way back in;
     this is the floor under that, and it is only ever laid once. */
  {
    /* Somebody carries you to the last maester who put you back together, and
       failing that to your own house's seat. Walking twenty doors back from
       Winterfell every time you lost a fight in Dorne was the least fun thing
       in the game. */
    int where = you.haven >= 0 ? you.haven : houses[you.house].startMap;
    int wx = you.haven >= 0 ? you.havenX : houses[you.house].startX;
    int wy = you.haven >= 0 ? you.havenY : houses[you.house].startY;
    enterMap(where, wx, wy, 0);
    copyString(scratch, "You go down. You wake in ", sizeof scratch);
    appendString(scratch, maps[where].name, sizeof scratch);
    appendString(scratch, ", wounds dressed and a third of your purse gone.",
      sizeof scratch);
  }
  if (hostFell) {
    appendString(scratch, "  Your ", sizeof scratch);
    appendString(scratch, hostFell, sizeof scratch);
    appendString(scratch, " stood over you while they took you off the field, "
      "and is not among the people who carried you back.", sizeof scratch);
    hostFell = 0;
  }
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
  u8 piece[5];
  int i, took = 0, worn = 0, scrap = 0;

  piece[0] = k.arm; piece[1] = k.mail; piece[2] = k.shield;
  piece[3] = k.helm; piece[4] = k.gloves;

  /* You take the lot. They were dressed out of the same list you are, and if
     you only took a piece at a time you would fall a rank behind everybody you
     beat and never climb back. Whatever beats what you have goes straight on;
     whatever you have already is stripped for what the metal is worth. */
  for (i = 0; i < 5; i++) {
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
/* Which of the things people say about you fits you now.
   The list runs from the mild to the rare, and the last one that fits is the
   one they say: a man with six sworn swords and nine seats should not be
   remarked upon for carrying one sigil. */
int regardOf(void) {
  int i, best = -1;
  for (i = 0; i < REGARD_COUNT; i++) {
    if (countSigils() < regard[i].sigils) continue;
    if (hostCount() < regard[i].host) continue;
    if (you.kills < regard[i].kills) continue;
    if (regard[i].needs != 255 && !flagSet(regard[i].needs)) continue;
    if (regard[i].denies != 255 && flagSet(regard[i].denies)) continue;
    best = i;
  }
  return best;
}

/* Whether a nest on this ground would give up what is in it, leaving the roll
   aside. Pulled out so the audit can ask the cartridge the question rather than
   restate the rule beside it and drift. */
int nestWouldGive(void) {
  return world->nest != 255 && !you.bag[world->nest];
}

static void findInGrass(void) {
  u32 h = roll(0xFFFF) | (roll(0xFFFF) << 16);
  int budget = 200 + you.level * 150;
  int kind, best = -1, i;

  if (budget > KIT_CEILING) budget = KIT_CEILING;

  /* And if there is a nest on this ground, what is in it - once. An egg is not
     a thing you find on the way to the shops; it is on the Dragonmont and in
     the barrows and beyond the Wall, and nowhere else in the world. */
  /* It used to want your heel to be empty as well, which sounds reasonable and
     is not: the game hands you a wolf pup out of the Wolfswood in the first
     hour, and from that moment on no nest in the world would ever give you
     anything again. Every dragon egg on the cartridge was behind that. All it
     asks now is that you are not already carrying one. */
  if (nestWouldGive() && hashUpTo(rot(h, 3), 100) < 30) {
    takeWare(world->nest);
    you.eggWins = 0;
    copyString(scratch, "Half buried, and warm: a ", sizeof scratch);
    appendString(scratch, wares[world->nest].name, sizeof scratch);
    appendString(scratch, ". Carry it and win enough fights and it will not stay one.",
      sizeof scratch);
    openWindow(0, scratch);
    return;
  }
  /* Green things, mostly: the grass is where a maester's bench gets stocked. */
  if (hashUpTo(h, 100) < 34) {
    int found = forage[hashUpTo(rot(h, 7), FORAGE_COUNT)];
    takeWare(found);
    copyString(scratch, "Growing in the grass: ", sizeof scratch);
    appendString(scratch, wares[found].name, sizeof scratch);
    appendString(scratch, ". Worth stooping for.", sizeof scratch);
    openWindow(0, scratch);
    return;
  }
  if (hashUpTo(h, 100) < 60) {
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
    if (!wares[i].price) continue;          /* the made things are never dropped */
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

/* What a win is worth to whatever is at your heel, and what it grows into. It
   climbs on the same fights you do, so the wolf you took out of the Wolfswood
   at level six is a direwolf by the Riverlands and a winterfang by the end -
   which is the whole reason to keep the one you caught. */
static void raiseBeast(void) {
  int b, was;
  if (MY_BEAST.kind == 255) {
    /* Nothing at your heel yet, but perhaps something under your arm. */
    int i;
    for (i = 0; i < EGG_COUNT; i++) {
      if (!you.bag[eggs[i].ware]) continue;
      if (++you.eggWins < eggs[i].wins) {
        appendString(scratch, "  Something shifts under your arm.", sizeof scratch);
        return;
      }
      if (partyRoom() < 0) {
        appendString(scratch, "  It is trying to hatch and there is no room at "
          "your heel for what comes out.", sizeof scratch);
        return;
      }
      you.bag[eggs[i].ware]--;
      you.eggWins = 0;
      keepBeast(eggs[i].beast, you.level < 5 ? 5 : you.level);
      appendString(scratch, "  And it opens. A ", sizeof scratch);
      appendString(scratch, beasts[eggs[i].beast].name, sizeof scratch);
      appendString(scratch, " looks at you and decides you will do.", sizeof scratch);
      sfxRank();
      return;
    }
    return;
  }
  /* All six of them come on. The one out in front did the work and takes the
     whole share; the rest walked the same road and take half. Six animals that
     only ever level while they are the one in front is five animals you can
     never afford to use, which is not a party - it is one beast and a cupboard.
     Each carries its own experience and its own level and grows up on its own
     schedule. */
  /* And the swords behind you get better at it too. They climb towards your
     own level and stop there: a company that outgrew its captain would fight
     the whole game for you. */
  {
    int i;
    for (i = 0; i < HOST_MAX; i++) {
      Kept *h = &you.host[i];
      if (h->kind == 255) continue;
      if (h->level < you.level && roll(3) == 0) {
        h->level++;
        h->hp = swornVigour(h->kind, h->level);
      }
    }
  }
  {
    int i, whole = 12 + foeLevel * 6;
    for (i = 0; i < PARTY_MAX; i++) {
      Kept *k = &you.party[i];
      int share = (i == you.lead) ? whole : whole >> 1;
      int wasLevel;
      if (k->kind == 255 || i == you.lead) continue;
      wasLevel = k->level;
      k->exp = (u16)(k->exp + share);
      while (k->level < 50 && k->exp >= beastExpFor(k->level + 1)) k->level++;
      /* And they grow up in the pack, quietly, whether or not you were
         watching. You find out on the card. */
      if (k->level != wasLevel && beasts[k->kind].into != 255
          && k->level >= beasts[k->kind].growAt) {
        k->kind = beasts[k->kind].into;
      }
      if (k->hp < 1) k->hp = beastVigour(k->kind, k->level);
    }
  }

  b = MY_BEAST.kind;
  was = MY_BEAST.level;
  MY_BEAST.exp += (u16)(12 + foeLevel * 6);
  while (MY_BEAST.level < 50 && MY_BEAST.exp >= beastExpFor(MY_BEAST.level + 1)) {
    MY_BEAST.level++;
  }
  if (MY_BEAST.level != was) {
    appendString(scratch, "  Your ", sizeof scratch);
    appendString(scratch, beasts[b].name, sizeof scratch);
    appendString(scratch, " is level ", sizeof scratch);
    appendNumber(scratch, MY_BEAST.level, sizeof scratch);
    appendString(scratch, " now.", sizeof scratch);
    if (beasts[b].into != 255 && MY_BEAST.level >= beasts[b].growAt) {
      MY_BEAST.kind = beasts[b].into;
      appendString(scratch, "  It has stopped being a ", sizeof scratch);
      appendString(scratch, beasts[b].name, sizeof scratch);
      appendString(scratch, ". What stands there now is a ", sizeof scratch);
      appendString(scratch, beasts[MY_BEAST.kind].name, sizeof scratch);
      appendString(scratch, ".", sizeof scratch);
      sfxRank();
    }
  }
}

/* Taken rather than killed. Worth half the experience of finishing it, because
   you did not, and worth a great deal more than that everywhere else. */
static void tookAlive(const char *said) {
  int won = expFrom(foeLevel, you.level) >> 1;
  sfxRank();
  you.exp += won;
  you.hp = mine.hp;
  duelPhase = DUEL_SPOILS;
  copyString(scratch, said ? said : "It stops fighting.", sizeof scratch);
  appendString(scratch, "  ", sizeof scratch);
  appendNumber(scratch, won, sizeof scratch);
  appendString(scratch, " experience for taking it whole.", sizeof scratch);
  duelSay(0, scratch);
}

/* A win is not over the moment they go down. You stay in the yard, the purse
   and the experience are read out, the rail fills up for it, and every rung it
   passes stops it long enough to say what that rung bought. Only then do you
   walk away. */
static void theyFell(void) {
  int won = expFrom(foeLevel, you.level);
  sfxWon();
  /* The last thing between anybody and the chair has just stopped being in the
     way. What follows is not a fight, so it does not belong here - it belongs
     the moment the yard comes down. */
  if (foeId == THRONE_CHAMPION && you.story < 3) {
    you.story = 3;
    taleWaiting = TALE_THRONE;
    taleWaitingThen = AFTER_CROWN;
  }
  you.gold += foePurse;
  you.exp += won;
  if (foeSlot >= 0) beaten[worldId][foeSlot] = 1;
  if (!foeDef || foeDef->mortal) {
    if (foeSlot >= 0) { slain[worldId][foeSlot] = 1; crowdAlive[foeSlot] = 0; }
    you.kills++;
  }
  /* You get some wind back after a win, so a road is walkable without a maester
     at the end of every field - a sixth of your wind and a little besides, not
     a quarter. A quarter was more than an ordinary fight cost you by the middle
     of the game, which meant the health bar climbed the longer you fought and
     twenty-six fights in a row was a normal afternoon. An eighth was the other
     way out: once levelling stopped putting you back to full, the audit's own
     run length said the middle of the game was two fights and a maester, which
     is a wall. A sixth is the road between the two. */
  you.hp = mine.hp + vigourFor(you.level) / 6 + 4;
  if (you.hp > vigourFor(you.level)) you.hp = vigourFor(you.level);
  mine.hp = you.hp;

  duelPhase = DUEL_SPOILS;
  copyString(scratch, foeDef ? foeDef->defeat : "It goes down in the grass and lies still.",
    sizeof scratch);
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
      /* The two turns of the last act that a fight can bring about: the ninth
         sigil is what makes the realm write to you, and the tenth is what
         wakes the thing standing behind the chair. */
      if (lead == LEADER_COUNT - 1) {
        taleWaiting = TALE_CHAMPION;
        taleWaitingThen = AFTER_CHAMPION;
      } else if (held == LEADER_COUNT - 1 && you.story < 1) {
        you.story = 1;
        taleWaiting = TALE_SUMMONS;
        taleWaitingThen = AFTER_NOTHING;
      }
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
  raiseBeast();
  takeTheirKit();
  /* And something a smith or a maester can use. Which band it comes out of is
     how hard they were, so a fight is worth stripping at every level rather
     than only for the steel. */
  {
    int band = 0, i;
    while (band < SPOIL_BANDS - 1 && foeLevel > spoils[band].upTo) band++;
    i = spoils[band].drop[roll(SPOIL_WIDE)];
    takeWare(i);
    appendString(scratch, "  You also take ", sizeof scratch);
    appendString(scratch, wares[i].name, sizeof scratch);
    appendString(scratch, " off them, which somebody will know what to do with.",
      sizeof scratch);
  }
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
    int wasMax = mine.maxHp;
    you.level++;
    mine.maxHp = vigourFor(you.level);
    mine.might = mightFor(you.level);
    mine.guard = guardFor(you.level);
    mine.swiftness = swiftFor(you.level);
    /* Levelling used to put you back to full, and at the bottom of the game you
       level after nearly every fight - so you began almost every duel whole, no
       matter what the last one cost, and a remedy could never do anything
       because you were never hurt when you reached for one. Growing gives you
       the difference it added and nothing else. */
    you.hp += mine.maxHp - wasMax;
    if (you.hp > mine.maxHp) you.hp = mine.maxHp;
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
    appendString(scratch, ".", sizeof scratch);
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

/* Your beast, on the turns it is the one going in. It cannot be hurt in your
   place - it is at your heel, not in front of you - so it has no health of its
   own here; what it has is its own reach and its own way of fighting, and
   spending your turn on it is the whole cost. */
static Fighter yours;

static void readyBeast(void) {
  int b = MY_BEAST.kind, lv = MY_BEAST.level;
  yours.name = beasts[b].name;
  yours.level = lv;
  yours.maxHp = yours.hp = 9999;
  yours.might = beastMight(b, lv);
  yours.guard = beastGuard(b, lv);
  yours.swiftness = beastSwift(b, lv);
  yours.tech = beasts[b].tech;
  yours.defending = 0;
  /* Your own animal is alive and has claws, not obsidian: it can hold a wight
     off and it will not put one down. That is the point of carrying glass. */
  yours.dead = beasts[b].dead;
  yours.obsidian = 0;
}

static void duelTurn(void) {
  /* Whichever of you is swinging on your side of it, and with what. */
  Fighter *me = beastSwinging ? &yours : &mine;
  /* A horn blown in somebody's face costs them the go they were about to
     take. It is spent the moment it is honoured. */
  if (theyBalk) {
    theyBalk = 0;
    copyString(scratch, theirs.name, sizeof scratch);
    appendString(scratch, " is still deciding whether to run, and the moment "
      "goes past.", sizeof scratch);
    duelSay(0, scratch);
    duelPhase = DUEL_TOP;
    beastSwinging = 0;
    return;
  }
  int myTech = beastSwinging ? beasts[MY_BEAST.kind].tech[roll(4)] : mine.tech[duelMenu];
  /* Both sides swing; who goes first is decided by swiftness. */
  if (duelPhase == DUEL_MINE) {
    int mineFirst = firstMover;
    Fighter *a = mineFirst ? me : &theirs;
    Fighter *d = mineFirst ? &theirs : &mine;
    int tech = mineFirst ? myTech : theirs.tech[roll(4)];
    if (swing(a, d, tech, mineFirst)) {
      duelPhase = DUEL_END;
      duelOver = (d == &mine) ? 2 : 1;
    } else {
      duelPhase = DUEL_THEIRS;
    }
  } else {
    int mineFirst = !firstMover;
    Fighter *a = mineFirst ? me : &theirs;
    Fighter *d = mineFirst ? &theirs : &mine;
    int tech = mineFirst ? myTech : theirs.tech[roll(4)];
    if (swing(a, d, tech, mineFirst)) {
      duelPhase = DUEL_END;
      duelOver = (d == &mine) ? 2 : 1;
    } else {
      duelPhase = DUEL_TOP;
      beastSwinging = 0;               /* one turn at a time, chosen each time */
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

/* One eight-by-eight of ground, speckled between the two courses so the floor of
   a duel is a floor and not two flat stripes. `spread` is how much of the lighter
   colour is in it, which is how the ground fades away towards the horizon. */
/* A hash that actually mixes.
   The old one multiplied a linear combination of x and y by a constant and took
   the top bits, which carries a period-two ripple along x. An even three-way
   split hid it; a hard threshold does not, and the far bank of every duel came
   out as a picket fence of alternating columns. Two rounds of xor-shift are
   enough to break it. */
static int grainHash(int x, int y, int tile, int salt) {
  u32 v = (u32)(x * 374761393 + y * 668265263 + tile * 1013904223 + salt);
  v ^= v >> 13;
  v *= 1274126177u;
  v ^= v >> 16;
  return (int)(v & 31u);
}

/* Which of the three tones a grain of ground takes.
   This used to be an even three-way split - a third light, a third mid, a
   third dark, decided per pixel - which at two hundred and forty pixels across
   is not ground, it is television static, and every fight in the game was
   fought standing on it. Ground is one tone with grain in it: the depth still
   decides which tone that is, and the other two are a few grains scattered
   through it. */
static int grainOf(int h, int spread, int dark, int mid, int light) {
  int base = spread >= 6 ? light : (spread >= 5 ? mid : dark);
  int grit = spread >= 6 ? mid : (spread >= 5 ? light : mid);
  if (h < 3) return grit;
  if (h == 3) return spread >= 5 ? dark : light;
  return base;
}

/* One eight-by-eight of ground.
 *
 * This layer is eight bits a pixel - four pixels to a word, two words to a row
 * - and this wrote four. It shifted a palette index of about two hundred into
 * a four-bit field, where it did not remotely fit, so every index spilled into
 * its neighbours and each pair of pixels was read back as one byte of whatever
 * the spill left behind. The ground of every duel in the game was that
 * arithmetic, which is why it looked like a fence: eight pixels of garbage,
 * repeated across two hundred and forty. The sky bands a few lines above got
 * this right all along, which is why they never striped. */
static void groundTile(int tile, int dark, int mid, int light, int spread) {
  int y, x;
  for (y = 0; y < 8; y++) {
    u32 lo = 0, hi = 0;
    for (x = 0; x < 8; x++) {
      /* A fixed hash. The same yard every time, which is what stops the ground
         crawling about while you are standing on it. */
      u32 c = (u32)grainOf(grainHash(x, y, tile, 0), spread, dark, mid, light);
      if (x < 4) lo |= c << (x * 8);
      else hi |= c << ((x - 4) * 8);
    }
    VRAM_BG_CHR[tile * 16 + y * 2] = lo;
    VRAM_BG_CHR[tile * 16 + y * 2 + 1] = hi;
  }
}

static void paintDuelGround(void) {
  int i, w, ty, tx;
  const u16 *sky = SKIES[world->scene < 6 ? world->scene : 0];
  /* Eight bands of sky, then the ground in three depths. The two courses the
     yard used to be drawn in were flat colour laid in stripes all the way to
     the bottom of the screen, which read as a test card rather than as ground. */
  for (i = 0; i < 11; i++) {
    PAL_BG[DUEL_PAL + i] = sky[i];
    for (w = 0; w < 16; w++) {
      VRAM_BG_CHR[(DUEL_BAND + i) * 16 + w] = 0x01010101u * (u32)(DUEL_PAL + i);
    }
  }
  /* A dark line where the ground meets the sky, and a lighter tone to speckle
     the earth with, both worked out from the two courses the scene already has. */
  PAL_BG[DUEL_PAL + 11] = (u16)(((sky[10] & 0x1F) >> 1)
    | ((((sky[10] >> 5) & 0x1F) >> 1) << 5) | ((((sky[10] >> 10) & 0x1F) >> 1) << 10));
  {
    int r = (sky[9] & 0x1F), g = (sky[9] >> 5) & 0x1F, b = (sky[9] >> 10) & 0x1F;
    r += (31 - r) >> 2; g += (31 - g) >> 2; b += (31 - b) >> 2;
    PAL_BG[DUEL_PAL + 12] = (u16)(r | (g << 5) | (b << 10));
  }
  /* Three courses of ground: bright and open at your feet, thinning away into
     the haze at the horizon. Palette entries 9, 10, 11 and 12 of the scene. */
  groundTile(DUEL_BAND + 12, DUEL_PAL + 10, DUEL_PAL + 9, DUEL_PAL + 12, 6);
  groundTile(DUEL_BAND + 13, DUEL_PAL + 10, DUEL_PAL + 9, DUEL_PAL + 12, 5);
  groundTile(DUEL_BAND + 14, DUEL_PAL + 11, DUEL_PAL + 10, DUEL_PAL + 9, 4);
  for (ty = 0; ty < 64; ty++) {
    int band;
    if (ty < 8) band = ty + 1;                 /* the sky, eight rows of it     */
    else if (ty == 8) band = 14;               /* the far bank, dark and hazy   */
    /* The seam used to be one row of the noisiest tile in the set, which drew a
       dotted line across the screen where the world met the sky. */
    else if (ty < 11) band = 13;               /* the middle distance           */
    else band = 12;                            /* and the ground you stand on   */
    {
      volatile u16 *rowBase = VRAM_BG_MAP + ((ty >> 5) << 11) + ((ty & 31) << 5);
      for (tx = 0; tx < 64; tx++) {
        volatile u16 *cell = rowBase + ((tx >> 5) << 10) + (tx & 31);
        /* Flip alternate columns only. Flipping on both axes made a chequer,
           which is a pattern rather than a texture. */
        *cell = (u16)((DUEL_BAND + band) | ((tx & 1) ? 0x0400 : 0));
      }
    }
  }
  REG_BG0HOFS = 0;
  REG_BG0VOFS = 0;
}

/* -------------------------------------------------------------- the party --
 *
 * Six animals, and which one is out in front.
 *
 * There was one, and no way to look at it except a line on the status card, so
 * everything you ever took alive after the first quietly replaced what you had.
 * This is the card the handhelds have always had: what is with you, how far
 * along each of them is, how much fight is left in it, and a press to send a
 * different one out.
 */
static int partyPick;

static void paintParty(void) {
  int i, shown = 0;
  clearRows(0, TXT_H);
  drawFrame(4, 2, TXT_W - 8, TXT_H - 8);
  drawText(14, 6, "AT YOUR HEEL", C_GOLD);
  copyString(scratch, "", sizeof scratch);
  appendNumber(scratch, partyCount(), sizeof scratch);
  appendString(scratch, " of 6", sizeof scratch);
  drawText(TXT_W - 14 - textWidth(scratch), 6, scratch, C_DIM);
  fillRect(14, 18, TXT_W - 28, 1, C_EDGE);

  for (i = 0; i < PARTY_MAX; i++) {
    int y = 24 + shown * 14, full;
    const Kept *k = &you.party[i];
    if (k->kind == 255) continue;
    if (i == partyPick) drawCursor(14, y + 2, C_GOLD);
    drawText(24, y, beasts[k->kind].name,
      i == partyPick ? C_GOLD : (i == you.lead ? C_WELL : C_INK));
    copyString(scratch, "Lv ", sizeof scratch);
    appendNumber(scratch, k->level, sizeof scratch);
    drawText(TXT_W - 108, y, scratch, C_DIM);
    full = beastVigour(k->kind, k->level);
    drawBar(TXT_W - 78, y + 2, 56, k->hp > full ? full : k->hp, full);
    if (i == you.lead) drawText(TXT_W - 78, y, "out in front", C_WELL);
    shown++;
  }
  if (!shown) {
    drawText(24, 34, "Nothing walks with you yet.", C_DIM);
    drawText(24, 48, "Wear one down and throw a net over it.", C_DIM);
  } else {
    const Kept *k = &you.party[partyPick];
    if (k->kind != 255) {
      int next = beastExpFor(k->level + 1) - beastExpFor(k->level);
      int got = (int)k->exp - beastExpFor(k->level);
      copyString(scratch, "Grows at ", sizeof scratch);
      if (beasts[k->kind].into != 255) {
        appendNumber(scratch, beasts[k->kind].growAt, sizeof scratch);
        appendString(scratch, " into ", sizeof scratch);
        appendString(scratch, beasts[beasts[k->kind].into].name, sizeof scratch);
      } else {
        copyString(scratch, "This is as far as it grows.", sizeof scratch);
      }
      drawText(14, TXT_H - 32, scratch, C_DIM);
      copyString(scratch, "", sizeof scratch);
      appendNumber(scratch, got < 0 ? 0 : got, sizeof scratch);
      appendString(scratch, " of ", sizeof scratch);
      appendNumber(scratch, next < 1 ? 1 : next, sizeof scratch);
      appendString(scratch, " to the next level", sizeof scratch);
      drawText(TXT_W - 14 - textWidth(scratch), TXT_H - 32, scratch, C_DIM);
    }
  }
  drawText(14, TXT_H - 18, "A: send it out    B: go", C_DIM);
}

/* Moves the cursor to the next one that is actually there. */
static void partyStep(int by) {
  int i, at = partyPick;
  for (i = 0; i < PARTY_MAX; i++) {
    /* Wrapped by hand. A remainder by six is a remainder by a constant and
       ought to compile to a multiply, and here it did not: it called out for
       __aeabi_uidivmod, which on an ARM7 with no divide instruction and no
       library behind it is a symbol that does not exist and a build that does
       not link. */
    at += by;
    if (at < 0) at = PARTY_MAX - 1;
    if (at >= PARTY_MAX) at = 0;
    if (you.party[at].kind != 255) { partyPick = at; return; }
  }
}

/* ------------------------------------------------------------ the kennels ---
   Two columns: the six walking with you, and the eighteen boarded. Left and
   right change which side you are on, A moves whatever is under the cursor to
   the other one. */

static int holdPick, holdSide;

static void paintHoldfast(void) {
  int i, top;
  clearRows(0, TXT_H);
  drawFrame(4, 2, TXT_W - 8, TXT_H - 8);
  drawText(14, 6, "THE KENNELS", C_GOLD);
  copyString(scratch, "", sizeof scratch);
  appendNumber(scratch, holdCount(), sizeof scratch);
  appendString(scratch, " boarded of 18", sizeof scratch);
  drawText(TXT_W - 14 - textWidth(scratch), 6, scratch, C_DIM);
  fillRect(14, 18, TXT_W - 28, 1, C_EDGE);

  drawText(24, 22, "WITH YOU", holdSide ? C_DIM : C_GOLD);
  drawText(TXT_W - 100, 22, "BOARDED", holdSide ? C_GOLD : C_DIM);

  for (i = 0; i < PARTY_MAX; i++) {
    int y = 36 + i * 11;
    const Kept *k = &you.party[i];
    if (!holdSide && i == partyPick) drawCursor(14, y + 1, C_GOLD);
    if (k->kind == 255) { drawText(24, y, "-", C_DIM); continue; }
    drawText(24, y, beasts[k->kind].name,
      (!holdSide && i == partyPick) ? C_GOLD : (i == you.lead ? C_WELL : C_INK));
    copyString(scratch, "", sizeof scratch);
    appendNumber(scratch, k->level, sizeof scratch);
    drawText(TXT_W - 122 - textWidth(scratch), y, scratch, C_DIM);
  }

  top = listTop(holdPick, HOLD_MAX);
  for (i = 0; i < LIST_ROWS && top + i < HOLD_MAX; i++) {
    int at = top + i, y = 36 + i * 11;
    const Kept *k = &you.holdfast[at];
    if (holdSide && at == holdPick) drawCursor(TXT_W - 110, y + 1, C_GOLD);
    if (k->kind == 255) { drawText(TXT_W - 100, y, "-", C_DIM); continue; }
    drawText(TXT_W - 100, y, beasts[k->kind].name,
      (holdSide && at == holdPick) ? C_GOLD : C_INK);
    copyString(scratch, "", sizeof scratch);
    appendNumber(scratch, k->level, sizeof scratch);
    drawText(TXT_W - 20 - textWidth(scratch), y, scratch, C_DIM);
  }
  drawText(14, TXT_H - 18,
    holdSide ? "A: take it out    B: go" : "A: board it    B: go", C_DIM);
}

/* ------------------------------------------------------------- the muster ---
   Who has sworn to you, and what each of them is worth when you swing. */

static int hostPick;

static void paintHost(void) {
  int i, shown = 0;
  clearRows(0, TXT_H);
  drawFrame(4, 2, TXT_W - 8, TXT_H - 8);
  drawText(14, 6, "YOUR OWN SWORDS", C_GOLD);
  copyString(scratch, "", sizeof scratch);
  appendNumber(scratch, hostCount(), sizeof scratch);
  appendString(scratch, " of 6", sizeof scratch);
  drawText(TXT_W - 14 - textWidth(scratch), 6, scratch, C_DIM);
  fillRect(14, 18, TXT_W - 28, 1, C_EDGE);

  for (i = 0; i < HOST_MAX; i++) {
    int y = 24 + shown * 12;
    const Kept *h = &you.host[i];
    if (h->kind == 255) continue;
    if (i == hostPick) drawCursor(14, y + 1, C_GOLD);
    drawText(24, y, swornKinds[h->kind].name, i == hostPick ? C_GOLD : C_INK);
    copyString(scratch, "Lv ", sizeof scratch);
    appendNumber(scratch, h->level, sizeof scratch);
    drawText(TXT_W - 116, y, scratch, C_DIM);
    copyString(scratch, "adds ", sizeof scratch);
    appendNumber(scratch, swornMight(h->kind, h->level) / 6, sizeof scratch);
    appendString(scratch, " to a blow", sizeof scratch);
    drawText(TXT_W - 14 - textWidth(scratch), y, scratch, C_DIM);
    shown++;
  }
  if (!shown) {
    drawText(24, 34, "Nobody has sworn to you.", C_DIM);
    drawText(24, 48, "Beat somebody on the road down to nearly nothing,", C_DIM);
    drawText(24, 60, "then put a purse in front of them instead of a sword.", C_DIM);
  } else {
    /* Their own numbers, not what they would do to whoever you last fought:
       `theirs` still holds the last opponent out here, and a card that read
       differently depending on who you happened to beat an hour ago would be
       a card nobody could trust. */
    int sum = 0;
    for (i = 0; i < HOST_MAX; i++) {
      if (you.host[i].kind == 255) continue;
      sum += swornMight(you.host[i].kind, you.host[i].level) / 6;
    }
    copyString(scratch, "Together they add about ", sizeof scratch);
    appendNumber(scratch, sum, sizeof scratch);
    appendString(scratch, " to every blow you land.", sizeof scratch);
    drawText(14, TXT_H - 32, scratch, C_WELL);
  }
  drawText(14, TXT_H - 18, "B: go", C_DIM);
}

/* --------------------------------------------------------------- the log ---
   What you have walked into and what you decided about it. A side quest whose
   answer is never mentioned again is a menu you clicked once; this is where
   they are written down. */

static int deedPick, deedTop;

static void paintDeeds(void) {
  int i, shown = 0, open = 0;
  clearRows(0, TXT_H);
  drawFrame(4, 2, TXT_W - 8, TXT_H - 8);
  drawText(14, 6, "WHAT YOU HAVE DONE", C_GOLD);
  fillRect(14, 18, TXT_W - 28, 1, C_EDGE);
  for (i = 0; i < CUT_COUNT; i++) if (flagSet(cuts[i].flag)) open++;
  copyString(scratch, "", sizeof scratch);
  appendNumber(scratch, open, sizeof scratch);
  appendString(scratch, " of ", sizeof scratch);
  appendNumber(scratch, CUT_COUNT, sizeof scratch);
  drawText(TXT_W - 14 - textWidth(scratch), 6, scratch, C_DIM);

  for (i = 0; i < CUT_COUNT && shown < LIST_ROWS; i++) {
    int y = 24 + shown * 12, seen = flagSet(cuts[i].flag);
    if (i < deedTop) continue;
    if (i == deedPick) drawCursor(14, y + 1, C_GOLD);
    drawText(24, y, seen ? cuts[i].name : "- - -",
      i == deedPick ? C_GOLD : (seen ? C_INK : C_DIM));
    drawText(TXT_W - 76, y, seen ? "settled" : "not yet", seen ? C_WELL : C_DIM);
    shown++;
  }
  drawText(14, TXT_H - 30,
    "Places worth stopping at, and what you said when you got there.", C_DIM);
  drawText(14, TXT_H - 18, "B: go", C_DIM);
}

/* ---------------------------------------------------------- the last act --
 *
 * The one part of this game that is told rather than walked. A page is a sky, a
 * silhouette and some writing: the sky goes down on the world layer in flat
 * bands the way a duel yard does, the silhouette is drawn on the text layer in
 * one dark tone so it reads against any of them, and the writing types itself
 * into a window at the bottom.
 *
 * It borrows the duel's tiles and the duel's eleven palette slots, because the
 * only time a tale plays there is no map on the screen to want them.
 */
/* Flat bands of one sky, edge to edge. The duel yard's painter draws ground
   under its horizon; a tale wants the whole screen in one weather. */
static void paintTaleSky(int which) {
  int i, w, ty, tx;
  const u16 *sky = SKIES[which < 6 ? which : 0];
  for (i = 0; i < 11; i++) {
    PAL_BG[DUEL_PAL + i] = sky[i];
    for (w = 0; w < 16; w++) {
      VRAM_BG_CHR[(DUEL_BAND + i) * 16 + w] = 0x01010101u * (u32)(DUEL_PAL + i);
    }
  }
  for (ty = 0; ty < 64; ty++) {
    int band = ty < 20 ? (ty >> 1) + 1 : 10;
    volatile u16 *rowBase = VRAM_BG_MAP + ((ty >> 5) << 11) + ((ty & 31) << 5);
    for (tx = 0; tx < 64; tx++) {
      volatile u16 *cell = rowBase + ((tx >> 5) << 10) + (tx & 31);
      *cell = (u16)(DUEL_BAND + (band > 10 ? 10 : band));
    }
  }
  REG_BG0HOFS = 0;
  REG_BG0VOFS = 0;
}

/* The silhouettes. Blocked out rather than drawn: at this size a shape that
   reads at a glance beats a shape with detail in it, and the throne is nine
   hundred swords whichever way you cut it. */
static void markThrone(int cx, int cy) {
  int i;
  fillRect(cx - 26, cy + 26, 52, 6, C_DEEP);              /* the dais         */
  fillRect(cx - 20, cy - 4, 40, 30, C_DEEP);              /* the seat itself  */
  for (i = 0; i < 11; i++) {                              /* blades, fanned   */
    int lean = (i - 5) * 3;
    int high = 30 - (i - 5) * (i - 5);
    fillRect(cx - 2 + lean * 2, cy - 4 - high, 3, high, C_DEEP);
    fillRect(cx - 2 + lean * 2, cy - 4 - high, 3, 2, C_EDGE);
  }
  fillRect(cx - 20, cy - 4, 40, 3, C_EDGE);               /* the lit top edge */
  fillRect(cx - 20, cy + 12, 40, 2, C_EDGE);
}

static void markRaven(int cx, int cy) {
  fillRect(cx - 5, cy - 6, 10, 16, C_DEEP);               /* body             */
  fillRect(cx - 3, cy - 12, 7, 7, C_DEEP);                /* head             */
  fillRect(cx + 4, cy - 10, 5, 3, C_DEEP);                /* beak             */
  fillRect(cx - 28, cy - 10, 24, 7, C_DEEP);              /* wings, spread    */
  fillRect(cx + 4, cy - 10, 24, 7, C_DEEP);
  fillRect(cx - 28, cy - 10, 24, 2, C_EDGE);
  fillRect(cx + 4, cy - 10, 24, 2, C_EDGE);
  fillRect(cx - 3, cy + 10, 6, 12, C_DEEP);               /* tail             */
}

static void markCrown(int cx, int cy) {
  int i;
  fillRect(cx - 26, cy + 6, 52, 10, C_DEEP);              /* the band         */
  fillRect(cx - 26, cy + 6, 52, 3, C_EDGE);
  for (i = 0; i < 5; i++) {                               /* five points      */
    int x = cx - 24 + i * 12;
    int h = (i == 2) ? 22 : (i == 1 || i == 3) ? 16 : 11;
    fillRect(x, cy + 6 - h, 6, h, C_DEEP);
    fillRect(x, cy + 6 - h, 6, 2, C_EDGE);
  }
}

static void markWall(int cx, int cy) {
  int i;
  fillRect(cx - 60, cy - 30, 120, 60, C_DEEP);
  for (i = 0; i < 7; i++) fillRect(cx - 60 + i * 18, cy - 30, 3, 60, C_EDGE);
  fillRect(cx - 60, cy - 30, 120, 3, C_EDGE);
  fillRect(cx - 8, cy + 10, 16, 20, C_CLEAR);            /* the tunnel        */
}

static void markFire(int cx, int cy) {
  int i;
  for (i = 0; i < 5; i++) {
    int x = cx - 32 + i * 16, h = 20 + ((i * 7) % 17);
    fillRect(x, cy + 16 - h, 10, h, C_DEEP);
    fillRect(x + 2, cy + 16 - h + 3, 6, h - 6, C_EDGE);
  }
  fillRect(cx - 36, cy + 14, 72, 5, C_DEEP);
}

static void paintTalePage(void) {
  const Page *p = &talePages[tales[taleAt].first + talePage];
  const char *body = p->byHouse ? p->byHouse[you.house] : p->body;
  paintTaleSky(p->sky);
  clearRows(0, TXT_H);
  switch (p->mark) {
    case 1: markThrone(TXT_W / 2, 44); break;
    case 2: markRaven(TXT_W / 2, 42); break;
    case 3: markCrown(TXT_W / 2, 40); break;
    case 4: markWall(TXT_W / 2, 40); break;
    case 5: markFire(TXT_W / 2, 40); break;
    default: break;
  }
  openWindowAt(p->title, body, 80, 8);
}

static void startTale(int which, int then) {
  taleAt = which;
  talePage = 0;
  taleThen = then;
  scene = SCENE_TALE;
  layoutTextRows(TEXT_PLAY);
  clearPage();
  paintTalePage();
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

/* ------------------------------------------------------------- cutscenes ---
 *
 * Step somewhere and something happens without you asking for it: a rider comes
 * up the road and reins in hard, a shadow goes over too fast to be cloud, a
 * sellsword who has been three days behind you stops bothering to hide.
 *
 * These were written a long time ago and never once reached the cartridge -
 * nothing in the exporter had ever imported the file - so the roads had five
 * things happening on them and the cartridge knew about none of them. A scene
 * is a run of beats and this steps them one at a time: it holds the player
 * still, says its lines, walks somebody on and off again, and sets a flag so it
 * never happens twice.
 */

/* A duel is started from inside a scene, and the machinery that starts one is
   written below this. */
static void callToArms(int duellist, int bank, int slot);

#define CUT_SLOTS CUT_PEOPLE

static int cutAt = -1;          /* which scene is playing, or -1 */
static int cutBeat;             /* how far through its beats */
static int cutTimer;            /* frames left on a wait, a shake or a flash */
static int cutShake, cutFlash;
static int cutPick, cutAsking, cutPainted;  /* the chooser, when a beat asks */
static Body cutBody[CUT_SLOTS];
static u8 cutBank[CUT_SLOTS], cutLive[CUT_SLOTS];
static int cutWalkLeft, cutWalkSlot, cutWalkDir;
/* What the answer you gave turned out to mean, and whoever has to be fought
   before it is settled. */
static const char *cutSaid;
static int cutFight = 0xFFFF;

/* Whether standing here starts something. Fires once, and never while a window
   is open or a fight is coming up. */
static int cutHere(int x, int y) {
  int i;
  if (cutAt >= 0 || windowOpen || shift || spotted >= 0) return -1;
  for (i = 0; i < CUT_COUNT; i++) {
    if (cuts[i].map != worldId || cuts[i].x != x || cuts[i].y != y) continue;
    if (flagSet(cuts[i].flag)) continue;
    /* And what has to have happened first. Five things that each happen once
       and never refer to one another is five things happening; a scene that
       only befalls somebody an earlier one befell is a story. */
    if (cuts[i].needs != 255 && !flagSet(cuts[i].needs)) continue;
    if (cuts[i].denies != 255 && flagSet(cuts[i].denies)) continue;
    if (countSigils() < cuts[i].sigils) continue;
    return i;
  }
  return -1;
}

static void endCut(void) {
  int i;
  for (i = 0; i < CUT_SLOTS; i++) cutLive[i] = 0;
  cutAt = -1;
  cutShake = cutFlash = cutTimer = 0;
  cutAsking = 0;
  cutSaid = 0;
  clearFade();
}

/* Draws the three lines of a question over the window that asked it. */
static void paintCutChoice(void) {
  const Choice *c = &choices[beats[cuts[cutAt].first + cutBeat].a];
  int i;
  fillRect(6, TXT_H - 44, TXT_W - 12, 40, C_FILL);
  drawFrame(4, TXT_H - 46, TXT_W - 8, 44);
  for (i = 0; i < c->count; i++) {
    int y = TXT_H - 40 + i * 12;
    if (i == cutPick) drawCursor(12, y + 1, C_GOLD);
    drawText(22, y, c->opt[i], i == cutPick ? C_GOLD : C_INK);
  }
}

/* Starts the beat the run is now on. Returns 0 when the scene has ended. */
static int openBeat(void) {
  const Cut *cut = &cuts[cutAt];
  const Beat *b;
  if (cutBeat >= cut->count) {
    setFlag(cut->flag);
    endCut();
    return 0;
  }
  b = &beats[cut->first + cutBeat];
  switch (b->kind) {
    case BEAT_SAY:
      openWindow(0, b->text);
      break;
    case BEAT_WAIT:
      cutTimer = b->a;
      break;
    case BEAT_SHAKE:
      cutTimer = b->a;
      cutShake = 1;
      break;
    case BEAT_FLASH:
      cutTimer = b->a;
      cutFlash = 1;
      break;
    case BEAT_SPAWN:
      if (b->slot < CUT_SLOTS) {
        cutBody[b->slot].px = (s16)(b->a << 4);
        cutBody[b->slot].py = (s16)(b->b << 4);
        cutBody[b->slot].dir = b->c;
        cutBody[b->slot].walk = 0;
        cutBody[b->slot].stride = 0;
        cutBank[b->slot] = b->bank;
        cutLive[b->slot] = 1;
      }
      break;
    case BEAT_WALK:
      if (b->slot < CUT_SLOTS && cutLive[b->slot]) {
        cutWalkSlot = b->slot;
        cutWalkDir = b->a;
        cutWalkLeft = b->b;
      }
      break;
    case BEAT_FACE:
      if (b->slot < CUT_SLOTS) cutBody[b->slot].dir = (u8)b->a;
      break;
    case BEAT_DESPAWN:
      if (b->slot < CUT_SLOTS) cutLive[b->slot] = 0;
      break;
    case BEAT_SKY:
      /* Something enormous goes over. The weather layer already knows how to
         put a shadow across the ground, so it is asked to do it now. */
      cutTimer = 90;
      cutShake = 1;
      break;
    case BEAT_FLAG:
      setFlag(b->a);
      break;
    case BEAT_CHOOSE:
      openWindow(0, choices[b->a].ask);
      cutPick = 0;
      cutAsking = 1;
      cutPainted = 0;
      break;
    default:
      break;
  }
  return 1;
}

static void startCut(int which) {
  int i;
  cutAt = which;
  cutBeat = 0;
  cutWalkLeft = 0;
  for (i = 0; i < CUT_SLOTS; i++) cutLive[i] = 0;
  hero.walk = 0;
  openBeat();
}

/* One frame of whatever is playing. */
static void tickCut(void) {
  const Cut *cut;
  const Beat *b;
  if (cutAt < 0) return;
  cut = &cuts[cutAt];
  b = &beats[cut->first + cutBeat];

  if (cutWalkLeft) {
    if (cutBody[cutWalkSlot].walk) {
      moveBody(&cutBody[cutWalkSlot], WALK_SPEED);
    } else if (--cutWalkLeft >= 0) {
      if (cutWalkLeft) stepBody(&cutBody[cutWalkSlot], cutWalkDir);
    }
    if (cutWalkLeft || cutBody[cutWalkSlot].walk) return;
  }
  if (cutTimer) {
    if (cutShake) camY += ((frameClock >> 1) & 1) ? 2 : -2;
    if (cutFlash) setFade(0, 16 - (cutTimer >> 2 > 16 ? 16 : cutTimer >> 2));
    if (!--cutTimer) { cutShake = cutFlash = 0; clearFade(); }
    else return;
  }
  if (cutAsking) {
    const Choice *c = &choices[b->a];
    int was = cutPick;
    if (!typeDone) return;
    if (!cutPainted) { cutPainted = 1; paintCutChoice(); }
    if (hit(KEY_UP) && cutPick > 0) cutPick--;
    if (hit(KEY_DOWN) && cutPick < c->count - 1) cutPick++;
    if (cutPick != was) { sfxPick(); paintCutChoice(); }
    if (hit(KEY_A)) {
      int said = cutPick;
      setFlag(c->flag[said]);
      sfxRank();
      cutAsking = 0;
      windowOpen = 0;
      clearRows(windowTop, windowRows * 8);
      /* What it costs you, what it pays, and what it turns out to have meant.
         A side quest whose answers all read the same is a menu, not a choice. */
      if (c->gold[said]) {
        you.gold += c->gold[said];
        if (you.gold < 0) you.gold = 0;
      }
      cutBeat++;
      if (c->said[said]) {
        cutSaid = c->said[said];
        cutFight = c->duel[said];
        openWindow(0, cutSaid);
      } else {
        cutFight = c->duel[said];
        openBeat();
      }
    }
    return;
  }
  if (windowOpen) return;         /* the line is still being read */
  /* And if the answer has to be argued with steel, it is argued now: the scene
     is over and whoever disagreed with you is standing there. */
  if (cutFight != 0xFFFF) {
    int who = cutFight;
    cutFight = 0xFFFF;
    setFlag(cut->flag);
    endCut();
    callToArms(who, 0, -1);
    return;
  }
  cutBeat++;
  openBeat();
}


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
    if (shiftDuellist < 0) { beginWild(wildWanted, wildLevel); wildWanted = -1; }
    else beginDuel(shiftDuellist, shiftBank, shiftSlot);
  } else setFade(1, 48 - t);
  if (!--shift) clearFade();
}

/* Whoever you are facing, counting a lean over a counter as facing them.
   A stallholder stands behind their own stall, so walking up to the front of
   one and pressing A found nothing at all: the only way to buy anything was to
   walk round the end of the counter and stand beside the person selling. */
static int facing(void) {
  int x = (hero.px >> 4) + DIR_X[hero.dir];
  int y = (hero.py >> 4) + DIR_Y[hero.dir];
  int who = crowdAt(x, y);
  if (who < 0 && x >= 0 && y >= 0 && x < world->w && y < world->h
      && world->counter[y * world->w + x]) {
    who = crowdAt(x + DIR_X[hero.dir], y + DIR_Y[hero.dir]);
  }
  return who;
}

/* ---------------------------------------------------------------- chests ---
   Something you walk up to and open, rather than a tile you happen to tread on
   and a line you may not have read. There is always something in one, and the
   further from anywhere it is the better that something is. */
static int chestFacing(int x, int y) {
  int i;
  for (i = 0; i < world->chestCount && i < 8; i++) {
    if (world->chests[i].x == x && world->chests[i].y == y) return i;
  }
  return -1;
}

static void openChest(int which) {
  const Chest *c = &world->chests[which];
  if (emptied[worldId][which]) {
    openWindow(0, "The lid is already up, and you were thorough.");
    return;
  }
  emptied[worldId][which] = 1;
  sfxRank();
  copyString(scratch, "The lid comes up.", sizeof scratch);
  if (c->gold) {
    you.gold += c->gold;
    appendString(scratch, "  ", sizeof scratch);
    appendNumber(scratch, c->gold, sizeof scratch);
    appendString(scratch, " gold, in a bag that has been there a while.", sizeof scratch);
  }
  if (c->ware != 255) {
    int how = takeWare(c->ware);
    appendString(scratch, "  And a ", sizeof scratch);
    appendString(scratch, wares[c->ware].name, sizeof scratch);
    appendString(scratch, how == TOOK_WORN ? ", which you put on there and then."
               : how == TOOK_SOLD ? ", which is worth nothing to you but scrap."
                                  : ", wrapped in oilcloth.", sizeof scratch);
  }
  /* And whatever a body this far out would have been carrying. */
  {
    int band = 0, i;
    int here = groundBy[you.house][worldId];
    while (band < SPOIL_BANDS - 1 && here > spoils[band].upTo) band++;
    i = spoils[band].drop[roll(SPOIL_WIDE)];
    takeWare(i);
    appendString(scratch, "  Underneath it, ", sizeof scratch);
    appendString(scratch, wares[i].name, sizeof scratch);
    appendString(scratch, ".", sizeof scratch);
  }
  openWindow(0, scratch);
}

static void tryTalk(void) {
  int fx = (hero.px >> 4) + DIR_X[hero.dir];
  int fy = (hero.py >> 4) + DIR_Y[hero.dir];
  int who = facing();
  {
    int box = chestFacing(fx, fy);
    if (box >= 0) { openChest(box); return; }
  }
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
    if (npc->heals) {
      /* And this is where they will carry you if you go down somewhere else. */
      you.haven = worldId;
      you.havenX = (hero.px >> 4);
      you.havenY = (hero.py >> 4);
      {
        /* Everybody who came in with you, not only the one out in front. It
           used to be you and your lead beast, so five of a party of six walked
           back out of a maester's hall exactly as hurt as they walked in, and
           the swords you had paid for were never mended at all. */
        int i, mended = you.hp < vigourFor(you.level);
        you.hp = vigourFor(you.level);
        for (i = 0; i < PARTY_MAX; i++) {
          Kept *k = &you.party[i];
          int full;
          if (k->kind == 255) continue;
          full = beastVigour(k->kind, k->level);
          if (k->hp < full) mended = 1;
          k->hp = full;
        }
        for (i = 0; i < HOST_MAX; i++) {
          Kept *h = &you.host[i];
          int full;
          if (h->kind == 255) continue;
          full = swornVigour(h->kind, h->level);
          if (h->hp < full) mended = 1;
          h->hp = full;
        }
        if (mended) {
          mine.hp = you.hp;
          openWindow(npc->name,
            "Sit. There. Whole again, you and everyone who walked in behind "
            "you, and no charge to a sworn sword of a great house. If you go "
            "down out there, they will bring you back here.");
          return;
        }
      }
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
    /* And what they make of you, when they make anything of you at all.
       Everybody in this game said the same sentence on the first morning and
       on the day the ninth seat bent, which is the largest single reason it
       did not feel like a story you were inside of. Not every time: a remark
       somebody makes about you now and then reads as being noticed, and the
       same remark on every conversation reads as a label stapled to you. */
    if (roll(100) < 38) {
      int at = regardOf();
      if (at >= 0) {
        appendString(scratch, "  ", sizeof scratch);
        appendString(scratch, regard[at].line, sizeof scratch);
      }
    }
    /* Somebody who fights but does not draw on their own account. Nothing in
       the game ever said which button starts a fight, so people who stood
       there after saying their piece read as people you were not allowed to
       fight at all. */
    if (npc->fights && !npc->challenges && !beaten[worldId][who]) {
      appendString(scratch, "   [SELECT to draw on them]", sizeof scratch);
    }
    openWindow(npc->name, scratch);
    if (npc->trade) { afterWindow = npc->trade; }
    if (npc->sails) { afterPort = 1; }
    if (npc->holds) { afterHold = 1; }
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
  int who = facing();
  if (who < 0) { openWindow(0, "There is nobody there to fight."); return; }
  if (!world->npcs[who].fights) {
    openWindow(world->npcs[who].name, "I will not draw on you, and you know it.");
    return;
  }
  callToArms(world->npcs[who].duellist, world->npcs[who].bank, who);
}

/* Something was already in the grass when you walked into it. Not always
   somebody: the encounter tables have said for a long time which animals live
   on which road, and the cartridge simply never read those rows. */
static void ambush(void) {
  int beastish = world->wildCount && (!world->ambushCount || (int)roll(100) < 45);
  if (beastish) {
    const Wild *w = &world->wilds[roll(world->wildCount)];
    /* An animal out of the grass meets you where you are, the same as a person
       on the road does. A wolf four levels over you is a fight; a wolf twenty
       over you is a wall you walked into by turning left. */
    wildWanted = w->beast;
    wildLevel = nearYou((int)w->level + shiftHere(), -1, 4);
    callToArms(-1, 0, -1);
    return;
  }
  {
    const Ambush *a = &world->ambushes[roll(world->ambushCount)];
    callToArms(a->duellist, a->bank, -1);
  }
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
/* Getting somebody out of your way. They step aside if there is anywhere at all
   to step; if there is not, the two of you change places, because a game that
   stops dead is worse than a guardsman who ends up where you were standing. */
static int shoveDir = -1, shoveHold;

static int shoveAside(int x, int y) {
  int who = crowdAt(x, y), d;
  if (who < 0 || crowd[who].walk || hero.walk) return 0;
  for (d = 0; d < 4; d++) {
    int tx = x + DIR_X[d], ty = y + DIR_Y[d];
    if (solidAt(tx, ty) || ledgeAt(tx, ty) || occupied(tx, ty, who)) continue;
    stepBody(&crowd[who], d);
    moveBody(&crowd[who], WALK_SPEED);
    crowdTimer[who] = 120;      /* and they stay out of it for a while */
    return 1;
  }
  crowd[who].px = hero.px;
  crowd[who].py = hero.py;
  crowd[who].dir = (u8)(hero.dir ^ 1);
  hero.px = (s16)(x << 4);
  hero.py = (s16)(y << 4);
  crowdTimer[who] = 120;
  return 1;
}

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

/* Whoever a place in the drawing order refers to: the crowd by index, the
   player at -1, and whoever a cutscene has put on the map below that. */
static const Body *bodyOf(int who) {
  if (who <= -2) return &cutBody[-2 - who];
  if (who < 0) return &hero;
  return &crowd[who];
}

/* Objects are handed to the hardware front to back, so whoever is lower on the
   screen is drawn over whoever is behind them. */
static void placeEveryone(void) {
  int order[MAX_CROWD + 1 + CUT_SLOTS], count = 0, i, j;
  hideAllObjects();

  for (i = 0; i < crowdCount; i++) if (crowdAlive[i]) order[count++] = i;
  order[count++] = -1;                              /* the player */
  /* And anybody a cutscene has walked onto the map, who sorts by depth with
     everyone else: somebody who always drew in front of you would read as
     standing on the road rather than on it. */
  for (i = 0; i < CUT_SLOTS; i++) if (cutLive[i]) order[count++] = -2 - i;

  for (i = 1; i < count; i++) {
    int key = order[i];
    int keyY = bodyOf(key)->py;
    for (j = i - 1; j >= 0; j--) {
      int otherY = bodyOf(order[j])->py;
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
    if (who <= -2) {
      int at = -2 - who, bank = cutBank[at];
      placeObject(slot, cutBody[at].px - camX, cutBody[at].py - camY - 16,
        NPC_TILE_BASE + bank * NPC_TILE_STRIDE + frameOf(&cutBody[at], 2) * ACTOR_FRAME_TILES,
        bank + 1);
    } else if (who < 0) {
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
  startSoundClock();
  newGameState();
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
    soundClock();
    /* One tune for the road, another once steel is out, and the title's own. */
    if (hit(KEY_A) && scene != SCENE_WORLD && scene != SCENE_DUEL) sfxYes();
    if (scene == SCENE_TITLE || scene == SCENE_HOUSE) playTune(TUNE_HALL);
    /* Somebody holding one of the nine seats does not get the same music as a
       bandit on a road. */
    else if (scene == SCENE_DUEL || (scene == SCENE_BAG && bagInDuel)) {
      playTune(leaderFor(foeId) >= 0 ? TUNE_BOSS : TUNE_DUEL);
    }
    else playTune(world->tune);

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
        { int k; for (k = 0; k < WARE_KINDS; k++) you.worn[k] = 0; }
        newGameState();
        you.story = 0;
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
          scene = SCENE_PARTY;
          partyPick = you.lead;
          if (you.party[partyPick].kind == 255) partyStep(1);
          clearPage();
          layoutTextRows(TEXT_TOP);
          paintParty();
        } else if (menuPick == 2) {
          scene = SCENE_HOST;
          hostPick = 0;
          while (hostPick < HOST_MAX && you.host[hostPick].kind == 255) hostPick++;
          if (hostPick >= HOST_MAX) hostPick = 0;
          clearPage();
          layoutTextRows(TEXT_TOP);
          paintHost();
        } else if (menuPick == 3) {
          scene = SCENE_BAG;
          bagInDuel = 0;
          bagPick = 0;
          clearPage();
          layoutTextRows(TEXT_TOP);
          paintBag();
        } else if (menuPick == 4) {
          scene = SCENE_DEEDS;
          deedPick = 0;
          deedTop = 0;
          clearPage();
          layoutTextRows(TEXT_TOP);
          paintDeeds();
        } else if (menuPick == 5) {
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
    } else if (scene == SCENE_HOST) {
      int was = hostPick, i;
      if (hit(KEY_UP)) {
        for (i = hostPick - 1; i >= 0; i--) if (you.host[i].kind != 255) { hostPick = i; break; }
      }
      if (hit(KEY_DOWN)) {
        for (i = hostPick + 1; i < HOST_MAX; i++) if (you.host[i].kind != 255) { hostPick = i; break; }
      }
      if (hostPick != was) { sfxPick(); paintHost(); }
      if (hit(KEY_B)) {
        scene = SCENE_MENU;
        clearPage();
        layoutTextRows(TEXT_TOP);
        paintMenu();
      }
    } else if (scene == SCENE_DEEDS) {
      int was = deedPick;
      if (hit(KEY_UP) && deedPick > 0) deedPick--;
      if (hit(KEY_DOWN) && deedPick < CUT_COUNT - 1) deedPick++;
      if (deedPick < deedTop) deedTop = deedPick;
      if (deedPick >= deedTop + LIST_ROWS) deedTop = deedPick - LIST_ROWS + 1;
      if (deedPick != was) { sfxPick(); paintDeeds(); }
      if (hit(KEY_B)) {
        scene = SCENE_MENU;
        clearPage();
        layoutTextRows(TEXT_TOP);
        paintMenu();
      }
    } else if (scene == SCENE_HOLD) {
      int wasPick = holdPick, wasSide = holdSide, wasParty = partyPick;
      if (hit(KEY_LEFT)) holdSide = 0;
      if (hit(KEY_RIGHT)) holdSide = 1;
      if (holdSide) {
        if (hit(KEY_UP) && holdPick > 0) holdPick--;
        if (hit(KEY_DOWN) && holdPick < HOLD_MAX - 1) holdPick++;
      } else {
        if (hit(KEY_UP) && partyPick > 0) partyPick--;
        if (hit(KEY_DOWN) && partyPick < PARTY_MAX - 1) partyPick++;
      }
      if (holdPick != wasPick || holdSide != wasSide || partyPick != wasParty) {
        sfxPick();
        paintHoldfast();
      }
      if (hit(KEY_A)) {
        int moved = holdSide ? fetchBeast(holdPick) : boardBeast(partyPick);
        if (moved) {
          sfxRank();
          /* Whatever is out in front is the art that is loaded, so moving one
             across can change what is walking behind you on the map. */
          if (MY_BEAST.kind != 255) {
            loadBeastArt(MY_BEAST.kind, MY_BEAST_TILE, MY_BEAST_BANK);
          }
        }
        paintHoldfast();
      }
      if (hit(KEY_B)) {
        scene = SCENE_WORLD;
        clearPage();
        layoutTextRows(TEXT_PLAY);
      }
    } else if (scene == SCENE_PARTY) {
      int was = partyPick;
      if (hit(KEY_UP)) partyStep(-1);
      if (hit(KEY_DOWN)) partyStep(1);
      if (partyPick != was) { sfxPick(); paintParty(); }
      if (hit(KEY_B)) {
        scene = SCENE_MENU;
        clearPage();
        layoutTextRows(TEXT_TOP);
        paintMenu();
      } else if (hit(KEY_A) && you.party[partyPick].kind != 255
                 && partyPick != you.lead) {
        you.lead = (u8)partyPick;
        sfxRank();
        /* The one out in front is the one drawn walking behind you, so its art
           has to be the art that is resident. */
        loadBeastArt(MY_BEAST.kind, MY_BEAST_TILE, MY_BEAST_BANK);
        paintParty();
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
        } else if (atCounter) {
          atCounter = 0;
          scene = SCENE_SHOP;
          layoutTextRows(TEXT_TOP);
          paintShop();
        } else {
          scene = SCENE_MENU;
          layoutTextRows(TEXT_TOP);
          paintMenu();
        }
      } else if (hit(KEY_SELECT) && have && atCounter) {
        int at = nthCarried(bagPick);
        const char *said = sellWare(at);
        sfxRank();
        if (bagPick >= carrying() && bagPick) bagPick--;
        if (!carrying()) {
          atCounter = 0;
          scene = SCENE_SHOP;
          clearPage();
          layoutTextRows(TEXT_TOP);
          paintShop();
          openWindow(0, said);
        } else {
          paintBag();
          showPlate(said);
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
          /* A net that held ends the fight where it stands; anything else costs
             you the turn and they take theirs. */
          if (snaredIt) { snaredIt = 0; tookAlive(snareSaid); }
          else {
            duelPhase = DUEL_THEIRS;
            if (snareSaid) duelSay(0, snareSaid);
            else {
              copyString(scratch, "You drink it down.", sizeof scratch);
              duelSay(0, scratch);
            }
          }
        } else if (worked) {
          clearPage();
          scene = SCENE_WORLD;
          layoutTextRows(TEXT_PLAY);
          openWindow(0, "Better. Not good, but better.");
        } else if (wareBalked) {
          /* It did nothing, and used to do nothing silently - which from the
             other side of the screen is indistinguishable from a remedy that
             is broken. */
          clearPage();
          scene = bagInDuel ? SCENE_DUEL : SCENE_WORLD;
          layoutTextRows(bagInDuel ? TEXT_DUEL : TEXT_PLAY);
          if (bagInDuel) { paintDuelPlates(); duelSay(0, wareBalked); }
          else openWindow(0, wareBalked);
        } else {
          paintBag();
        }
      }
    } else if (scene == SCENE_CRAFT) {
      int have = craftCount(), was = craftPick;
      if (hit(KEY_UP) && craftPick > 0) craftPick--;
      if (hit(KEY_DOWN) && craftPick < have - 1) craftPick++;
      if (craftPick != was) { sfxPick(); paintCraft(); }
      if (hit(KEY_B)) {
        scene = SCENE_WORLD;
        clearPage();
        layoutTextRows(TEXT_PLAY);
      } else if (hit(KEY_SELECT)) {
        scene = SCENE_SHOP;
        shopPick = 0;
        sfxPick();
        paintShop();
      } else if (hit(KEY_A)) {
        const char *said = makeWare(nthRecipe(craftPick));
        sfxRank();
        scene = SCENE_WORLD;
        clearPage();
        layoutTextRows(TEXT_PLAY);
        openWindow(0, said);
        afterWindow = shopStall + 1;
      }
    } else if (scene == SCENE_TALE) {
      if (hit(KEY_A) || hit(KEY_B)) {
        if (!advanceWindow()) {
          if (++talePage < tales[taleAt].count) {
            paintTalePage();
          } else {
            int then = taleThen;
            taleAt = -1;
            scene = SCENE_WORLD;
            taleThen = AFTER_NOTHING;
            if (then == AFTER_CROWN) {
              startTale(TALE_CROWNED, AFTER_NOTHING);
            } else {
              enterMap(worldId, hero.px >> 4, hero.py >> 4, hero.dir);
              layoutTextRows(TEXT_PLAY);
              if (then == AFTER_CHAMPION) callToArms(THRONE_CHAMPION, 0, -1);
            }
          }
        }
      } else {
        tickWindow(held(KEY_A));
      }
    } else if (scene == SCENE_PORT) {
      int was = portPick;
      if (hit(KEY_UP) && portPick > 0) portPick--;
      if (hit(KEY_DOWN) && portPick < PORT_COUNT - 1) portPick++;
      if (portPick != was) { sfxPick(); paintPort(); }
      if (hit(KEY_B)) {
        scene = SCENE_WORLD;
        clearPage();
        layoutTextRows(TEXT_PLAY);
      } else if (hit(KEY_A)) {
        const char *said = sailTo(portPick);
        scene = SCENE_WORLD;
        clearPage();
        layoutTextRows(TEXT_PLAY);
        if (said) openWindow(0, said);
        else sfxRank();
      }
    } else if (scene == SCENE_SHOP) {
      const Stall *stall = &stalls[shopStall];
      int was = shopPick;
      if (hit(KEY_START)) {
        /* Over to your own side of the counter, where things can be sold. */
        scene = SCENE_BAG;
        bagInDuel = 0;
        atCounter = 1;
        bagPick = 0;
        clearPage();
        layoutTextRows(TEXT_TOP);
        paintBag();
        continue;
      }
      if (hit(KEY_UP) && shopPick > 0) shopPick--;
      if (hit(KEY_DOWN) && shopPick < stall->count - 1) shopPick++;
      if (shopPick != was) { sfxPick(); paintShop(); }
      if (hit(KEY_SELECT)) {
        /* The bench behind the counter. A smith will make you what he has the
           makings of; a maester will steep you something. */
        craftAt = shopStall;
        craftPick = 0;
        scene = SCENE_CRAFT;
        sfxPick();
        paintCraft();
      } else if (hit(KEY_B)) {
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
          } else if (topPick == 2 && MY_BEAST.kind != 255) {
            /* Set it on them. It is your turn that is spent, so this is a
               choice and not a free hit: a well-raised beast hits harder than
               you do, and a neglected one wastes an exchange. */
            paintFrameOnly();
            mine.defending = 0;
            duelPhase = DUEL_MINE;
            readyBeast();
            beastSwinging = 1;
            beastActed = 1;
            duelTurn();
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
      /* Something is playing. It has the screen until it is done: a scene you
         can walk out of halfway through is not a scene. */
      if (cutAt >= 0) {
        if (windowOpen && !cutAsking && (hit(KEY_A) || hit(KEY_B))) advanceWindow();
        tickCut();
      } else if (windowOpen) {
        /* One press, one page. Only the press that reads the last page of what
           somebody said does anything else. */
        if (hit(KEY_A) || hit(KEY_B)) {
          if (!advanceWindow()) {
            if (afterDuel >= 0) {
              int who = afterDuel;
              afterDuel = -1;
              afterWindow = 0;
              callToArms(world->npcs[who].duellist, world->npcs[who].bank, who);
            } else if (afterHold) {
              afterHold = 0;
              holdPick = 0;
              holdSide = holdCount() && partyRoom() >= 0 ? 1 : 0;
              partyPick = 0;
              scene = SCENE_HOLD;
              clearPage();
              layoutTextRows(TEXT_TOP);
              paintHoldfast();
            } else if (afterPort) {
              int mine = portHere();
              afterPort = 0;
              portPick = (mine == 0 && PORT_COUNT > 1) ? 1 : 0;
              scene = SCENE_PORT;
              clearPage();
              layoutTextRows(TEXT_TOP);
              paintPort();
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
      } else if (!hero.walk && cutHere(hero.px >> 4, hero.py >> 4) >= 0) {
        startCut(cutHere(hero.px >> 4, hero.py >> 4));
      } else if (hero.walk) {
        moveBody(&hero, hopping ? 2 : (held(KEY_B) ? RUN_SPEED : WALK_SPEED));
        if (!hero.walk) hopping = 0;
        if (!hero.walk) {
          const Warp *warp = warpAt(hero.px >> 4, hero.py >> 4);
          /* The Red Keep is shut. It was a room you could walk into at level
             eight and lose in, which made the end of the game a door rather
             than an end: the Kingsguard hold the stair until nine seats have
             bent to you, and they say so. */
          if (warp && warp->to == THRONE_MAP && countSigils() < LEADER_COUNT - 1) {
            int short_by = (LEADER_COUNT - 1) - countSigils();
            copyString(scratch, "Two white cloaks put the flat of a hand on your chest. "
                                "\"Nine seats. You have ", sizeof scratch);
            appendNumber(scratch, countSigils(), sizeof scratch);
            appendString(scratch, ". Come back when you are ", sizeof scratch);
            appendNumber(scratch, short_by, sizeof scratch);
            appendString(scratch, " closer.\"", sizeof scratch);
            openWindow("The Kingsguard", scratch);
          } else if (warp) {
            int wasStory = you.story;
            enterMap(warp->to, warp->tx, warp->ty, hero.dir);
            /* And the first time you do climb it, the hall is worth a look
               before anybody in it says anything. */
            if (worldId == THRONE_MAP && wasStory < 2) {
              you.story = 2;
              startTale(TALE_GATE, AFTER_NOTHING);
            } else if (worldId == THRONE_MAP && wasStory == 2
                       && haveSigil(LEADER_COUNT - 1)) {
              /* The queen is beaten and the chair is not yours, which means the
                 thing behind it put you down. It is not standing on any map -
                 nobody can walk up to it - so without this the last fight in
                 the game could be lost exactly once and then never fought
                 again, and the story simply stopped there forever. It is
                 waiting in the same shadow every time you come back up. */
              startTale(TALE_CHAMPION, AFTER_CHAMPION);
            }
          }
          else if (world->ambushCount && coverAt(hero.px >> 4, hero.py >> 4)
                   && roll(100) < 12) ambush();
          else if (coverAt(hero.px >> 4, hero.py >> 4) && roll(100) < 4) findInGrass();
          /* Somewhere with a nest on it is worth searching whether or not
             anything grows there. The Dragonmont, the sea cave and the barrows
             have not one blade of grass between them, and finding what is in a
             nest was bound to standing in grass - so three of the four places
             in the world that hold a dragon egg could never hand one over. */
          else if (nestWouldGive() && roll(100) < 3) findInGrass();
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
            shoveHold = 0;
            stepBody(&hero, want);
            moveBody(&hero, held(KEY_B) ? RUN_SPEED : WALK_SPEED);
          } else if (!solidAt(nx, ny)) {
            /* Not a wall - a person. Somebody standing in a one-tile gap used
               to close the road for as long as they felt like standing there,
               and in a dead end with your own beast behind you it closed it for
               good. Lean on the direction and they give way. */
            if (shoveDir != want) { shoveDir = want; shoveHold = 0; }
            if (++shoveHold > 18) { shoveHold = 0; shoveAside(nx, ny); }
          } else {
            shoveHold = 0;
          }
        }
      }

      if (!windowOpen && cutAt < 0) {
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
      /* The matrix first, every frame. Object memory is shared between the
         objects and the affine sets, so anything the world drew a frame ago
         could have sat on it. */
      setDuelScale();
      /* The two of you, larger than life, facing each other across the yard.
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
        if (foeBeast >= 0) {
          placeBeast(1, foeX - 16, 8 + sinkTheirs, FOE_BEAST_TILE, FOE_BEAST_BANK);
        } else {
          placeBigObject(1, foeX, 32 + sinkTheirs,
            NPC_TILE_BASE + bank * NPC_TILE_STRIDE + 0 * ACTOR_FRAME_TILES, bank + 1);
        }
      }
      if (!fxHidden(1) && sinkMine < 70) {
        placeBigObject(2, myX, 32 + sinkMine,
          PLAYER_TILE_BASE + (1 * 4) * ACTOR_FRAME_TILES, 0);
      }
      /* And whatever is at your heel, standing a pace behind your shoulder. */
      if (MY_BEAST.kind != 255 && foeBeast < 0 && sinkMine < 70) {
        placeBeast(3, myX - 44 + (beastSwinging ? 20 : 0), 44 + sinkMine,
          MY_BEAST_TILE, MY_BEAST_BANK);
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
