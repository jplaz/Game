/* Plays the cartridge, on this machine, without a human.
 *
 * hosttest.c walks a route somebody wrote down. This walks the whole game: it
 * swears to a house, then for every map it can reach it paths to every person
 * on it, talks to them, reads every sign, draws on whoever will draw back, and
 * takes every door — and it checks, on every single frame, that the game has
 * not put itself somewhere impossible.
 *
 * It is the cartridge's own C, compiled for this machine with the hardware
 * addresses pointed at a stand-in for the GBA's address space. It is not an
 * emulator: it does not model timing, DMA or the BIOS, so it cannot tell you
 * the ROM runs on hardware. What it can tell you is whether the game is
 * reachable, finishable, and internally consistent.
 *
 *   cc -DHOST_TEST playtest.c -o playtest && ./playtest [house]
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

#define HOST_TEST 1
#define main gba_main
#include "main.c"
#undef main

#define MEM_SPAN 0x03000400u
unsigned char *gbaMem;
int hostFramesLeft;

#define FRAME_CAP 900000
#define GOAL_FRAMES 3000            /* how long one errand may take before it counts as stuck */
#define MAX_DUELS 40

/* ------------------------------------------------------------- findings --- */

#define MAX_FINDINGS 200
static char findings[MAX_FINDINGS][160];
static int findingCount;

static void finding(const char *fmt, ...) {
  va_list ap;
  int i;
  /* One of each: a bug repeated forty times is still one bug. */
  char line[160];
  va_start(ap, fmt);
  vsnprintf(line, sizeof line, fmt, ap);
  va_end(ap);
  for (i = 0; i < findingCount; i++) if (!strcmp(findings[i], line)) return;
  if (findingCount < MAX_FINDINGS) snprintf(findings[findingCount++], 160, "%s", line);
}

/* ------------------------------------------------------------- the tally -- */

static int frameNo;
static int mapSeen[MAP_COUNT];
static int npcTalked[MAP_COUNT][MAX_CROWD];
static int signRead[MAP_COUNT][8];
static int npcStuck[MAP_COUNT][MAX_CROWD];
static int talked, signs, duels, duelsWon, duelsLost, fled, warpsTaken, levels, kills;

/* ------------------------------------------------------------ invariants -- */

static void checkFrame(void) {
  int i;
  if (scene < 0 || scene > 4) finding("scene is %d, which is not a scene", scene);
  if (scene == SCENE_TITLE || scene == SCENE_HOUSE) return;

  if (worldId < 0 || worldId >= MAP_COUNT) {
    finding("worldId is %d with %d maps", worldId, MAP_COUNT);
    return;
  }
  {
    int hx = hero.px >> 4, hy = hero.py >> 4;
    if (hx < 0 || hy < 0 || hx >= world->w || hy >= world->h) {
      finding("%s: the player is off the map at %d,%d", world->name, hx, hy);
    } else if (!hero.walk && solidAt(hx, hy)) {
      finding("%s: the player is standing inside a wall at %d,%d", world->name, hx, hy);
    }
  }
  if (crowdCount > MAX_CROWD) finding("%s: %d in the crowd", world->name, crowdCount);
  for (i = 0; i < crowdCount; i++) {
    int cx, cy;
    if (!crowdAlive[i]) continue;
    cx = crowd[i].px >> 4; cy = crowd[i].py >> 4;
    if (cx < 0 || cy < 0 || cx >= world->w || cy >= world->h) {
      finding("%s: %s has walked off the map", world->name, world->npcs[i].name);
    } else if (!crowd[i].walk && solidAt(cx, cy)) {
      finding("%s: %s is standing inside a wall", world->name, world->npcs[i].name);
    }
  }
  if (windowOpen) {
    if (lineCount < 1 || lineCount > MAX_LINES) finding("a window with %d lines", lineCount);
    if (lineAt < 0 || lineAt > lineCount) finding("a window paged to %d of %d", lineAt, lineCount);
  }
  if (scene == SCENE_DUEL) {
    if (mine.hp > mine.maxHp || theirs.hp > theirs.maxHp) {
      finding("a duel with more health than it started with");
    }
    if (mine.hp < 0 || theirs.hp < 0) finding("a duel with health below nothing");
    if (duelMenu < 0 || duelMenu > 3) finding("the technique cursor is on %d", duelMenu);
  }
}

/* ------------------------------------------------------------- the walker - */
/* Breadth-first over the map's own collision, so the tester goes where a player
   could go and nowhere else. */

static int cameFrom[32 * 32];
static int queue[32 * 32];

static int stepToward(int gx, int gy) {
  int head = 0, tail = 0, i, at, best = -1;
  int hx = hero.px >> 4, hy = hero.py >> 4;
  int w = world->w, h = world->h;
  if (hx == gx && hy == gy) return -1;
  for (i = 0; i < w * h; i++) cameFrom[i] = -2;
  cameFrom[hy * w + hx] = -1;
  queue[tail++] = hy * w + hx;
  while (head < tail) {
    int cur = queue[head++];
    int cx = cur % w, cy = cur / w;
    if (cx == gx && cy == gy) { best = cur; break; }
    for (i = 0; i < 4; i++) {
      int nx = cx + DIR_X[i], ny = cy + DIR_Y[i];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (cameFrom[ny * w + nx] != -2) continue;
      /* The goal tile itself may be a person or a sign; everything on the way
         has to be walkable. */
      if (solidAt(nx, ny) && !(nx == gx && ny == gy)) continue;
      if (occupied(nx, ny, -1) && !(nx == gx && ny == gy)) continue;
      cameFrom[ny * w + nx] = cur;
      queue[tail++] = ny * w + nx;
    }
  }
  if (best < 0) return -1;
  at = best;
  while (cameFrom[at] >= 0 && cameFrom[at] != hy * w + hx) at = cameFrom[at];
  if (cameFrom[at] != hy * w + hx) return -1;
  {
    int nx = at % w, ny = at / w;
    for (i = 0; i < 4; i++) if (hx + DIR_X[i] == nx && hy + DIR_Y[i] == ny) return i;
  }
  return -1;
}

/* ---------------------------------------------------------------- errands - */

#define GOAL_NONE 0
#define GOAL_NPC 1
#define GOAL_SIGN 2
#define GOAL_WARP 3

static int goalKind, goalIndex, goalFrames, goalStage;
static int npcDuelled[MAP_COUNT][MAX_CROWD];
static int interacting, duelTries, blocked;
static int wantHouse, runAway, statusChecks, sinceStatus, wantTech, techUsed[4];
static unsigned lastKeys;

/* A tap, not a hold: the game only acts on the frame a button goes down. */
static unsigned tap(unsigned key) {
  return (lastKeys & key) ? 0u : key;
}

/* Whether a map still owes the tester anything. */
static int mapDone(int m) {
  int i;
  if (!mapSeen[m]) return 0;
  for (i = 0; i < maps[m].npcCount && i < MAX_CROWD; i++) {
    if (!npcTalked[m][i] && !npcStuck[m][i]) return 0;
  }
  for (i = 0; i < maps[m].signCount && i < 8; i++) if (!signRead[m][i]) return 0;
  return 1;
}

/* The door to take from here to get nearer to a map that still owes something.
   Breadth-first over the warp graph, so the tester does not wander. */
static int warpTowardWork(void) {
  int from[MAP_COUNT], q[MAP_COUNT], head = 0, tail = 0, i, target = -1;
  for (i = 0; i < MAP_COUNT; i++) from[i] = -2;
  from[worldId] = -1;
  q[tail++] = worldId;
  while (head < tail) {
    int m = q[head++];
    if (!mapDone(m)) { target = m; break; }
    for (i = 0; i < maps[m].warpCount; i++) {
      int to = maps[m].warps[i].to;
      if (from[to] != -2) continue;
      from[to] = m;
      q[tail++] = to;
    }
  }
  if (target < 0 || target == worldId) return -1;
  while (from[target] != worldId) target = from[target];
  for (i = 0; i < world->warpCount; i++) if (world->warps[i].to == target) return i;
  return -1;
}

/* The next thing worth doing on this map, or nothing left to do. */
static void pickGoal(void) {
  int i;
  goalKind = GOAL_NONE;
  goalFrames = 0;
  goalStage = 0;
  interacting = 0;

  for (i = 0; i < crowdCount; i++) {
    if (!crowdAlive[i] || npcTalked[worldId][i] || npcStuck[worldId][i]) continue;
    goalKind = GOAL_NPC; goalIndex = i; return;
  }
  for (i = 0; i < world->signCount && i < 8; i++) {
    if (signRead[worldId][i]) continue;
    goalKind = GOAL_SIGN; goalIndex = i; return;
  }
  /* Everything here is done: head for wherever still owes something. */
  i = warpTowardWork();
  if (i >= 0) { goalKind = GOAL_WARP; goalIndex = i; }
}

static void goalTile(int *gx, int *gy) {
  if (goalKind == GOAL_NPC) { *gx = crowd[goalIndex].px >> 4; *gy = crowd[goalIndex].py >> 4; }
  else if (goalKind == GOAL_SIGN) { *gx = world->signs[goalIndex].x; *gy = world->signs[goalIndex].y; }
  else { *gx = world->warps[goalIndex].x; *gy = world->warps[goalIndex].y; }
}

static void completeGoal(void) {
  if (goalKind == GOAL_NPC) {
    if (goalStage == 0) {
      npcTalked[worldId][goalIndex] = 1;
      talked++;
      /* Having heard them out, draw on them — but only up to a quota, or the
         whole of Westeros ends up dead before it has been walked. */
      if (world->npcs[goalIndex].fights && duels < MAX_DUELS
          && !npcDuelled[worldId][goalIndex]) {
        goalStage = 1;
        interacting = 0;
        return;
      }
    } else {
      npcDuelled[worldId][goalIndex] = 1;
    }
  } else if (goalKind == GOAL_SIGN) { signRead[worldId][goalIndex] = 1; signs++; }
  goalKind = GOAL_NONE;
}

/* ------------------------------------------------------------------ play -- */

void hostFrame(void) {
  unsigned keys = 0;
  static int wasScene = -1, wasMap = -1, wasLevel = 0, wasKills = 0;

  checkFrame();

  if (scene == SCENE_TITLE) {
    keys = tap(KEY_START);
  } else if (scene == SCENE_HOUSE) {
    /* The game resets the picker when it opens, so the house has to be walked
       to rather than set — which is also what a player does. */
    keys = houseChoice < wantHouse ? tap(KEY_RIGHT) : tap(KEY_A);
  } else if (scene == SCENE_STATUS) {
    keys = tap(KEY_B);
  } else if (scene == SCENE_DUEL) {
    if (wasScene != SCENE_DUEL) { duelTries = 0; runAway = (duels % 5) == 4; }
    if (windowOpen) keys = tap(KEY_A);
    else if (duelPhase == DUEL_MENU) {
      /* Mostly fight; every fifth duel, try to break off instead, so that path
         is walked too. And move the cursor about, so Guard and the rest are
         used and not only the technique that happens to sit first. */
      if (runAway) keys = tap(KEY_B);
      else if ((wantTech & 1) != (duelMenu & 1)) {
        keys = tap((wantTech & 1) ? KEY_RIGHT : KEY_LEFT);
      } else if ((wantTech & 2) != (duelMenu & 2)) {
        keys = tap((wantTech & 2) ? KEY_DOWN : KEY_UP);
      } else {
        keys = tap(KEY_A);
        techUsed[duelMenu]++;
        wantTech = (int)(roll(4));
      }
      if (++duelTries > 400) { finding("a duel that would not end"); duelTries = 0; }
    }
  } else {
    if (wasMap != worldId) {
      if (wasMap >= 0) warpsTaken++;
      wasMap = worldId;
      mapSeen[worldId]++;
      goalKind = GOAL_NONE;
    }
    if (you.level > wasLevel) { levels++; wasLevel = you.level; }
    if (you.kills > wasKills) { kills = you.kills; wasKills = you.kills; }

    if (windowOpen) {
      keys = tap(KEY_A);
    } else if (!hero.walk && ++sinceStatus > 150) {
      sinceStatus = 0;
      keys = tap(KEY_START);
      statusChecks++;
    } else if (interacting) {
      /* The window has been read to the end. */
      completeGoal();
      interacting = 0;
    } else if (hero.walk) {
      keys = 0;                                  /* a step finishes itself */
    } else {
      int gx, gy, dir;
      if (goalKind == GOAL_NONE) pickGoal();
      if (goalKind == GOAL_NONE) { hostFramesLeft = 0; return; }
      goalTile(&gx, &gy);

      if (++goalFrames > GOAL_FRAMES) {
        if (goalKind == GOAL_NPC) {
          npcStuck[worldId][goalIndex] = 1;
          finding("%s: could not reach %s at %d,%d", world->name,
            world->npcs[goalIndex].name, world->npcs[goalIndex].x, world->npcs[goalIndex].y);
        } else if (goalKind == GOAL_SIGN) {
          signRead[worldId][goalIndex] = 1;
          finding("%s: could not reach the sign at %d,%d", world->name, gx, gy);
        } else {
          finding("%s: could not reach the door at %d,%d", world->name, gx, gy);
          mapSeen[world->warps[goalIndex].to]++;   /* stop trying for this one */
        }
        goalKind = GOAL_NONE;
        return;
      }

      {
        static const unsigned KEYS[4] = { KEY_DOWN, KEY_UP, KEY_LEFT, KEY_RIGHT };
        int hx = hero.px >> 4, hy = hero.py >> 4, i, facing = -1;
        for (i = 0; i < 4; i++) if (hx + DIR_X[i] == gx && hy + DIR_Y[i] == gy) facing = i;

        /* A door has to be stepped on. A person or a sign only has to be stood
           next to — walking into them forever is how the last tester spent an
           afternoon. */
        if (goalKind != GOAL_WARP && facing >= 0) {
          if (hero.dir != facing) {
            keys = KEYS[facing];
          } else if (goalStage == 1) {
            keys = tap(KEY_SELECT);
            if (keys) { duels++; interacting = 1; }
          } else {
            keys = tap(KEY_A);
            if (keys) interacting = 1;
          }
        } else {
          dir = stepToward(gx, gy);
          if (dir >= 0) { keys = KEYS[dir]; blocked = 0; }
          else if (++blocked < 400) {
            keys = 0;      /* somebody is in the doorway; wait for them to move */
          } else {
            blocked = 0;
            finding("%s: no way through to %d,%d", world->name, gx, gy);
            if (goalKind == GOAL_NPC) npcStuck[worldId][goalIndex] = 1;
            else if (goalKind == GOAL_SIGN) signRead[worldId][goalIndex] = 1;
            goalKind = GOAL_NONE;
            return;
          }
        }
      }
    }
  }

  if (wasScene == SCENE_DUEL && scene != SCENE_DUEL) {
    if (theirs.hp <= 0) duelsWon++;
    else if (mine.hp <= 0) duelsLost++;
    else fled++;
  }
  wasScene = scene;

  if (getenv("TRACE") && frameNo < atoi(getenv("TRACE"))) {
    printf("f%-5d sc%d %-14s hero %2d,%2d walk%2d dir%d win%d goal%d/%d gf%-4d keys %03x\n",
      frameNo, scene, world ? world->name : "-", hero.px >> 4, hero.py >> 4, hero.walk,
      hero.dir, windowOpen, goalKind, goalIndex, goalFrames, keys);
  }
  lastKeys = keys;
  REG_KEYINPUT = (unsigned short)(~keys & 0x03FF);
  frameNo++;
  if (frameNo > FRAME_CAP) { finding("the playthrough ran out of frames"); hostFramesLeft = 0; }
}

int main(int argc, char **argv) {
  int i, seenMaps = 0, totalNpcs = 0, totalSigns = 0, house = argc > 1 ? atoi(argv[1]) : 0;
  gbaMem = calloc(MEM_SPAN, 1);
  if (!gbaMem) return 1;
  REG_KEYINPUT = 0x03FF;
  hostFramesLeft = FRAME_CAP + 8;
  wantHouse = house;
  if (getenv("SEED")) seed = (unsigned)atoi(getenv("SEED"));

  gba_main();

  for (i = 0; i < MAP_COUNT; i++) {
    if (mapSeen[i]) seenMaps++;
    else finding("%s is never reachable on foot", maps[i].name);
    totalNpcs += maps[i].npcCount;
    totalSigns += maps[i].signCount;
  }

  printf("\n  played %d frames, about %d minutes of real play\n", frameNo, frameNo / 3600);
  printf("  maps reached   %d of %d\n", seenMaps, MAP_COUNT);
  printf("  people spoken  %d of %d\n", talked, totalNpcs);
  printf("  signs read     %d of %d\n", signs, totalSigns);
  printf("  doors taken    %d\n", warpsTaken);
  printf("  duels          %d (%d won, %d lost, %d broken off)\n", duels, duelsWon, duelsLost, fled);
  printf("  killed         %d\n", kills);
  printf("  ended          level %d, %d gold, %d/%d health, in %s\n",
    you.level, you.gold, you.hp, vigourFor(you.level), world ? world->name : "(nowhere)");
  printf("  swore to       %s\n", houses[you.house].full);
  printf("  status card    opened %d times\n", statusChecks);
  printf("  techniques     ");
  for (i = 0; i < 4; i++) printf("%s x%d  ", techniques[player_techs[i]].name, techUsed[i]);
  printf("\n");

  if (!findingCount) {
    printf("\n  nothing went wrong.\n");
    return 0;
  }
  printf("\n  %d thing%s to look at:\n", findingCount, findingCount == 1 ? "" : "s");
  for (i = 0; i < findingCount; i++) printf("    - %s\n", findings[i]);
  return 1;
}
