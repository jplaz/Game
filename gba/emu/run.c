/* A real Game Boy Advance, on this machine.
 *
 * Everything else that checks this cartridge checks the source: the audit reads
 * the tables, the sweeps compile the same C for x86 and drive it through its own
 * menus, and the renderer reimplements the compositing rules. None of that runs
 * one ARM instruction, so a bug that lives in what the hardware does with what
 * we wrote it - a register set wrong, memory scribbled on, a jump into nothing -
 * is invisible to all of it and shows up as a screen full of stripes in
 * somebody's hands.
 *
 * This runs the actual ROM image on mGBA's core, holds buttons for as long as a
 * person would, and writes out what the screen actually showed.
 *
 *   ./emu/run thronebound.gba            the opening, the menus, a minute in town
 *   ./emu/run thronebound.gba shots      the same, with a picture of every screen
 *   ./emu/run thronebound.gba shots 200000 7
 *
 * The last form goes on after the opening: two hundred thousand frames - close
 * to an hour of play - of a monkey with a controller, seeded with 7. It walks,
 * runs, talks to whoever is there, opens every menu, draws on people and flees,
 * and never follows a route, because a route is exactly what every other check
 * here already follows. On every frame it asks three things a console would
 * not tell you: has the processor jumped somewhere there is no code, has the
 * hardware refused a read or a write, and has the picture stopped changing
 * under fifteen seconds of button presses - which is what a soft-lock looks
 * like from the outside. Any of the three fails the run. */
#include <mgba/core/core.h>
#include <mgba/core/log.h>
#include <mgba/gba/core.h>
#include <mgba/internal/arm/arm.h>
#include <mgba-util/vfs.h>
#include <stdio.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>

#define KEY_A_ 0x001
#define KEY_B_ 0x002
#define KEY_SEL 0x004
#define KEY_STA 0x008
#define KEY_RGT 0x010
#define KEY_LFT 0x020
#define KEY_UP_ 0x040
#define KEY_DWN 0x080

static struct mCore *core;

/* mGBA says what the hardware refused to do but not who asked it to. The
   program counter is the whole answer, so it is printed alongside - once per
   distinct site, because a bad write inside a copy loop happens a thousand
   times and is one bug. */
#define SEEN_MAX 64
static unsigned seenPc[SEEN_MAX];
static int seenCount;

static void noteLog(struct mLogger *logger, int category, enum mLogLevel level,
                    const char *format, va_list args) {
  char line[512];
  unsigned pc;
  int i;
  (void)logger; (void)category; (void)level;
  vsnprintf(line, sizeof line, format, args);
  if (!strstr(line, "Cannot ") && !strstr(line, "Bad memory")) return;
  pc = core && core->cpu ? ((struct ARMCore *)core->cpu)->gprs[15] : 0;
  for (i = 0; i < seenCount; i++) if (seenPc[i] == pc) return;
  if (seenCount < SEEN_MAX) seenPc[seenCount++] = pc;
  printf("  !! %-46s from pc 0x%08x\n", line, pc);
}

static struct mLogger noteLogger = { .log = noteLog };
static color_t *fb;
static unsigned W, H;
static int frameNo;
static const char *shotDir;

/* Where the program counter may be: the BIOS, either RAM, or the cartridge.
   Anywhere else is a jump into nothing - a corrupted return address, a call
   through a pointer something wrote over - and a console would sit there
   executing open bus until somebody switched it off. */
static int pcSane(unsigned pc) {
  return pc < 0x00004000
      || (pc >= 0x02000000 && pc < 0x02040000)
      || (pc >= 0x03000000 && pc < 0x03008000)
      || (pc >= 0x08000000 && pc < 0x0A000000);
}
static int lostAt = -1;
static unsigned lostPc;

static unsigned keyOf(const char *name) {
  if (!strcmp(name, "A")) return KEY_A_;
  if (!strcmp(name, "B")) return KEY_B_;
  if (!strcmp(name, "SELECT")) return KEY_SEL;
  if (!strcmp(name, "START")) return KEY_STA;
  if (!strcmp(name, "RIGHT")) return KEY_RGT;
  if (!strcmp(name, "LEFT")) return KEY_LFT;
  if (!strcmp(name, "UP")) return KEY_UP_;
  if (!strcmp(name, "DOWN")) return KEY_DWN;
  return 0;
}

/* One frame, with whatever is held down. A real press is a few frames long and
   then a few frames of nothing, because a game that reads the pad once a frame
   will otherwise see one press as thirty. */
static void step(unsigned keys) {
  core->setKeys(core, keys);
  core->runFrame(core);
  frameNo++;
  if (lostAt < 0) {
    unsigned pc = ((struct ARMCore *)core->cpu)->gprs[15];
    if (!pcSane(pc)) { lostAt = frameNo; lostPc = pc; }
  }
}

static void tap(const char *name, int repeats) {
  int i, r;
  unsigned k = keyOf(name);
  for (r = 0; r < repeats; r++) {
    for (i = 0; i < 4; i++) step(k);
    for (i = 0; i < 8; i++) step(0);
  }
}

static void wait(int frames) { while (frames-- > 0) step(0); }

static void shoot(const char *name) {
  char path[512];
  unsigned x, y;
  FILE *f;
  if (!shotDir) return;
  snprintf(path, sizeof path, "%s/%s.ppm", shotDir, name);
  f = fopen(path, "wb");
  if (!f) { fprintf(stderr, "cannot write %s\n", path); return; }
  fprintf(f, "P6\n%u %u\n255\n", W, H);
  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      color_t c = fb[y * W + x];
      /* This build hands back a word per pixel with red in the low byte. */
      unsigned char px[3];
      px[0] = (unsigned char)(c & 0xFF);
      px[1] = (unsigned char)((c >> 8) & 0xFF);
      px[2] = (unsigned char)((c >> 16) & 0xFF);
      fwrite(px, 1, 3, f);
    }
  }
  fclose(f);
  printf("  shot %s at frame %d\n", name, frameNo);
}

/* Is the screen a wall of stripes? A real screen of this game has large flat
   runs of one colour - parchment, sky, grass. Garbage tile data has almost
   none, because every column differs from the one beside it. */
static void look(const char *what) {
  unsigned x, y, runs = 0, black = 0;
  for (y = 0; y < H; y++) {
    for (x = 1; x < W; x++) {
      if (fb[y * W + x] != fb[y * W + x - 1]) runs++;
    }
    for (x = 0; x < W; x++) if ((fb[y * W + x] & 0xFFFFFF) == 0) black++;
  }
  printf("  %-28s %5.1f changes a row, %4.1f%% black\n",
    what, (double)runs / H, 100.0 * black / (W * H));
}

/* A pixel as the screen shows it, red first. */
static unsigned rgbAt(unsigned x, unsigned y) {
  color_t c = fb[y * W + x];
  return ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF);
}

/* Is somebody talking? A text box - the world's or a duel's - puts its keyline
   and its parchment at the same places along the foot of the screen whatever
   is behind it, and nothing else in the game does. */
static int boxOpen(void) {
  return rgbAt(4, 156) == 0x636373 && rgbAt(8, 150) == 0xEFE7C6
      && rgbAt(232, 150) == 0xEFE7C6;
}

/* Turns the pages until nobody has said anything for a second and a half. The
   opening is several people's worth of lines with walking in between, typed
   out a letter at a time, and how many taps that takes is not a thing to guess
   at: a guess that was right in one build put every later screenshot a scene
   early in the next. */
static int pageAway(int most) {
  int taps = 0, quiet = 0;
  while (frameNo < most && quiet < 90) {
    if (boxOpen()) { tap("A", 1); wait(12); taps++; quiet = 0; }
    else { step(0); quiet++; }
  }
  return taps;
}

/* The whole picture, folded to a number, so two frames can be compared without
   keeping either. */
static unsigned screenHash(void) {
  unsigned h = 2166136261u, i, n = W * H;
  for (i = 0; i < n; i++) {
    h ^= fb[i] & 0xFFFFFF;
    h *= 16777619u;
  }
  return h;
}

/* The monkey. */
static unsigned rng;
static unsigned roll(unsigned n) {
  rng = rng * 1664525u + 1013904223u;
  return (rng >> 16) % n;
}

static int roam(int until, unsigned seed) {
  static const unsigned DIRS[4] = { KEY_DWN, KEY_LFT, KEY_UP_, KEY_RGT };
  /* The two most recent pictures that differed. A wedge blinking at the foot
     of a text box is two pictures for as long as you like; anything actually
     happening is a third one within a second. */
  unsigned seen1 = 0, seen2 = 0;
  int lastNew = frameNo, stalls = 0, shots = 0, nextShot = frameNo + 9000;
  int actions = 0;
  rng = seed ? seed : 1;
  printf("\n  roaming to frame %d, seeded %u\n", until, seed);
  while (frameNo < until && lostAt < 0) {
    unsigned r = roll(100), h;
    int i, n;
    actions++;
    if (r < 52) {
      /* Walk, and now and then run. Held long enough to cross a few tiles,
         because a tap in a new direction only turns on the spot. */
      unsigned keys = DIRS[roll(4)] | (roll(3) == 0 ? KEY_B_ : 0);
      n = 6 + (int)roll(54);
      for (i = 0; i < n; i++) step(keys);
    } else if (r < 72) {
      tap("A", 1 + (int)roll(3));
    } else if (r < 80) {
      tap("B", 1 + (int)roll(2));
    } else if (r < 88) {
      /* The menu, some way down it, and maybe into whatever is there. */
      tap("START", 1);
      for (n = (int)roll(8); n > 0; n--) tap("DOWN", 1);
      if (roll(2)) { tap("A", 1); wait(10); if (roll(2)) tap("RIGHT", 1); }
      if (roll(3)) tap("B", 1 + (int)roll(3));
    } else if (r < 94) {
      tap("SELECT", 1);
    } else {
      wait(10 + (int)roll(50));
    }

    h = screenHash();
    if (h != seen1 && h != seen2) { seen2 = seen1; seen1 = h; lastNew = frameNo; }
    if (frameNo - lastNew > 900) {
      char name[64];
      stalls++;
      printf("  !! the picture stopped changing at frame %d, %d actions in\n",
        frameNo, actions);
      snprintf(name, sizeof name, "roam-stalled-%02d", stalls);
      shoot(name);
      lastNew = frameNo;
      if (stalls >= 3) break;
    }
    if (frameNo >= nextShot) {
      char name[64];
      snprintf(name, sizeof name, "roam-%02d", ++shots);
      look(name);
      shoot(name);
      nextShot += 9000;
    }
  }
  printf("  roamed %d actions to frame %d\n", actions, frameNo);
  return stalls;
}

int main(int argc, char **argv) {
  struct VFile *rom;
  const char *path = argc > 1 ? argv[1] : "thronebound.gba";
  int roamFrames = argc > 3 ? atoi(argv[3]) : 0;
  unsigned seed = argc > 4 ? (unsigned)strtoul(argv[4], NULL, 10) : 7;
  int stalls = 0, bad = 0;
  shotDir = argc > 2 && argv[2][0] && strcmp(argv[2], "-") ? argv[2] : NULL;

  mLogSetDefaultLogger(&noteLogger);
  core = GBACoreCreate();
  if (!core) { fprintf(stderr, "no core\n"); return 1; }
  core->init(core);
  mCoreInitConfig(core, NULL);
  core->desiredVideoDimensions(core, &W, &H);
  fb = malloc(W * H * sizeof(color_t));
  core->setVideoBuffer(core, fb, W);

  rom = VFileOpen(path, O_RDONLY);
  if (!rom || !core->loadROM(core, rom)) {
    fprintf(stderr, "cannot load %s\n", path);
    return 1;
  }
  core->reset(core);
  printf("running %s at %ux%u\n", path, W, H);

  /* The title, and then a new game: past the logo, past the title's one
     entry, a house, a name, and your own arms. */
  wait(240);
  look("the title screen");
  shoot("emu-01-title");

  tap("A", 1); wait(60);
  look("after the title");
  shoot("emu-02-house-picker");

  tap("A", 1); wait(60);
  look("after swearing a house");
  shoot("emu-03-after-house");

  /* The name: a few letters and then confirm. The name screen wants a letter
     picked with A and finishing with START. */
  tap("A", 3); wait(30);
  look("three letters in");
  shoot("emu-04-name-typed");

  /* START finishes the name and opens the arms - charge, field and words -
     and a second START takes those as they stand and begins. */
  tap("START", 1); wait(120);
  look("your own arms");
  shoot("emu-05-your-arms");

  tap("START", 1); wait(240);
  look("in the world");
  shoot("emu-06-in-the-world");

  /* And walk, which is the first thing anybody does. */
  printf("  %d pages of opening put away\n", pageAway(frameNo + 6000));
  { int i; for (i = 0; i < 40; i++) step(KEY_DWN); }
  wait(30);
  look("after walking");
  shoot("emu-07-walked");

  /* The menu, the card, and both its pages: the screens a player lives in,
     drawn by the console rather than by anything on this machine. */
  tap("START", 1); wait(30);
  look("the menu");
  shoot("emu-08-menu");
  tap("A", 1); wait(30);
  look("the status card");
  shoot("emu-09-status");
  tap("RIGHT", 1); wait(30);
  look("where you stand");
  shoot("emu-10-standing");
  tap("B", 2); wait(20);

  /* The pouch: Sigil, At Heel, Swords, Pouch - fourth down. */
  tap("START", 1); wait(10);
  tap("DOWN", 3); tap("A", 1); wait(30);
  look("the pouch");
  shoot("emu-11-pouch");
  tap("B", 2); wait(20);

  /* And a minute of just playing: walk about, talk to whoever answers, and
     make sure the world does not fall over while it is being lived in. */
  { int i, d;
    for (d = 0; d < 8; d++) {
      unsigned dirs[4] = { KEY_DWN, KEY_LFT, KEY_UP_, KEY_RGT };
      for (i = 0; i < 24; i++) step(dirs[d & 3]);
      tap("A", 2); wait(20);
      tap("B", 2); wait(10);
    }
  }
  wait(30);
  look("after a minute in the town");
  shoot("emu-12-lived-in");

  if (roamFrames > frameNo) stalls = roam(roamFrames, seed);

  core->deinit(core);
  if (lostAt >= 0) {
    printf("\n  the processor jumped to 0x%08x at frame %d, where there is no code.\n",
      lostPc, lostAt);
    bad = 1;
  }
  if (stalls) {
    printf("\n  the picture stopped changing %d time%s under fifteen seconds of buttons.\n",
      stalls, stalls == 1 ? "" : "s");
    bad = 1;
  }
  if (seenCount) {
    printf("\n  %d place%s where the hardware refused what the game asked of it.\n",
      seenCount, seenCount == 1 ? "" : "s");
    bad = 1;
  }
  if (bad) return 1;
  printf("\n  the hardware took everything it was given.\n");
  return 0;
}
