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
 * person would, and writes out what the screen actually showed. */
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

int main(int argc, char **argv) {
  struct VFile *rom;
  const char *path = argc > 1 ? argv[1] : "thronebound.gba";
  shotDir = argc > 2 ? argv[2] : NULL;

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

  /* The title, and then a new game: past the logo, past the title's first
     entry, a house, and a name. */
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

  tap("START", 1); wait(120);
  look("after the name");
  shoot("emu-05-after-name");

  wait(240);
  look("four seconds later");
  shoot("emu-06-settled");

  /* And walk, which is the first thing anybody does. */
  tap("A", 2); wait(30);                  /* put the opening line away */
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

  /* The pouch. */
  tap("START", 1); wait(10);
  tap("DOWN", 1); tap("A", 1); wait(30);
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

  core->deinit(core);
  if (seenCount) {
    printf("\n  %d place%s where the hardware refused what the game asked of it.\n",
      seenCount, seenCount == 1 ? "" : "s");
    return 1;
  }
  printf("\n  the hardware took everything it was given.\n");
  return 0;
}
