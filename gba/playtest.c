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

#include "render.h"

#define MEM_SPAN 0x03000400u
unsigned char *gbaMem;
unsigned char hostSram[65536];
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

/* Nobody here can hear it, so the next best thing: watch the four sound
   generators being written, and shout if the game ever falls silent. */
static int soundNotes, soundWas, soundSilent;

static void checkSound(void) {
  unsigned freq = REG_SND1_FREQ;
  if (!(REG_SNDCNT_X & 0x0080)) finding("the sound hardware is switched off");
  if (freq != (unsigned)soundWas) { soundNotes++; soundWas = (int)freq; soundSilent = 0; }
  else if (++soundSilent > 600) {
    finding("nothing has sounded for ten seconds");
    soundSilent = 0;
  }
}

static void checkFrame(void) {
  int i;
  checkSound();
  if (scene < 0 || scene > SCENE_NAME) finding("scene is %d, which is not a scene", scene);
  /* Nothing is standing anywhere yet on the screens that come before the
     world, and there is no map to be standing on. */
  if (scene == SCENE_TITLE || scene == SCENE_HOUSE || scene == SCENE_NAME) return;

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
  if (!hero.walk && ((hero.px & 15) || (hero.py & 15))) {
    finding("%s: the player came to rest between two tiles", world->name);
  }
  for (i = 0; i < crowdCount; i++) {
    if (!crowdAlive[i]) continue;
    if (!crowd[i].walk && ((crowd[i].px & 15) || (crowd[i].py & 15))) {
      finding("%s: %s came to rest between two tiles", world->name, world->npcs[i].name);
    }
    if (bodyAt(&hero, crowd[i].px >> 4, crowd[i].py >> 4)
        && !hero.walk && !crowd[i].walk) {
      finding("%s: the player is on top of %s at %d,%d (spotted %d, shift %d, f%d)",
        world->name, world->npcs[i].name, crowd[i].px >> 4, crowd[i].py >> 4,
        spotted, shift, frameNo);
    }
  }
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
    for (i = 0; i < 5; i++) {
      int nx, ny;
      if (i < 4) {
        nx = cx + DIR_X[i]; ny = cy + DIR_Y[i];
        /* A ledge is scenery you drop off, never a tile you stand on. */
        if (ny >= 0 && ny < h && nx >= 0 && nx < w && ledgeAt(nx, ny)) continue;
      } else {
        /* The fifth way out of a tile: south over a ledge, landing two down. */
        if (!ledgeAt(cx, cy + 1)) continue;
        nx = cx; ny = cy + 2;
      }
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
    /* Two tiles south in one move means the route goes over a ledge, and the
       key that takes it is the same one that would walk there. */
    if (nx == hx && ny == hy + 2) return 0;
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
static int menusSeen, bagsSeen, shopsSeen, bought, records, menuWant = -1;
static int spottings, spottedBy, shooting, titleWant;
static const char *startedAt = "nowhere";
static int storyEvery, storyFor;
static int startedLevel;
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
    if (m == worldId && !crowdAlive[i]) continue;      /* dead and dealt with */
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

/* Somewhere in the grass, for when the tester is meant to be levelling rather
   than sightseeing. */
static int grindMode, grindX, grindY;

static int findCover(int *gx, int *gy) {
  int x, y, best = 1 << 30, hx = hero.px >> 4, hy = hero.py >> 4, found = 0;
  for (y = 0; y < world->h; y++) {
    for (x = 0; x < world->w; x++) {
      int d;
      if (!world->cover[y * world->w + x]) continue;
      if (x == hx && y == hy) continue;
      d = (x > hx ? x - hx : hx - x) + (y > hy ? y - hy : hy - y);
      if (d < best) { best = d; *gx = x; *gy = y; found = 1; }
    }
  }
  return found;
}

/* The next thing worth doing on this map, or nothing left to do. */
static void pickGoal(void) {
  int i;
  goalKind = GOAL_NONE;
  goalFrames = 0;
  goalStage = 0;
  interacting = 0;

  for (i = 0; i < crowdCount; i++) {
    /* Anyone who drew on you from across the road and lost is dealt with,
       whether or not there was ever a conversation. */
    if (!crowdAlive[i] && !npcTalked[worldId][i]) { npcTalked[worldId][i] = 1; talked++; }
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
      /* Somebody a great deal better than you is a fight a player would not
         pick, and a tester that picks it measures its own stupidity rather than
         the game. It still happens now and then, because the game lets it. */
      if (world->npcs[goalIndex].fights && duels < MAX_DUELS
          && !npcDuelled[worldId][goalIndex]
          && (duellists[world->npcs[goalIndex].duellist].level <= you.level + 5
              || roll(6) == 0)) {
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

/* Catch each interesting screen the first time the tester reaches it, so the
   pictures are of the game actually being played rather than of a route
   somebody wrote down and that the crowd has since wandered out of. */
static int caught[32];

/* Is that phrase anywhere in the window that is open? Used to catch the screens
   that only exist for one particular thing having happened. */
static int windowSays(const char *what) {
  int i, rows = bodyRows();
  if (!typeDone) return 0;                    /* wait until the page is written */
  for (i = lineAt; i < lineAt + rows && i < lineCount && i < MAX_LINES; i++) {
    if (strstr(lines[i], what)) return 1;
  }
  return 0;
}

static void catchOnce(int slot, const char *name) {
  if (!shooting || caught[slot]) return;
  caught[slot] = 1;
  snapshot(name);
}

void hostFrame(void) {
  unsigned keys = 0;
  static int wasScene = -1, wasMap = -1, wasLevel = 0, wasKills = 0;

  checkFrame();

  if (shooting) {
    if (scene == SCENE_TITLE) catchOnce(0, getenv("SAVED") ? "01-title-with-a-record" : "01-title");
    else if (scene == SCENE_NAME && nameLen == 3) catchOnce(23, "02b-your-name");
    else if (scene == SCENE_HOUSE) catchOnce(1, "02-swear-your-sword");
    else if (scene == SCENE_MENU) catchOnce(2, "05-the-menu");
    else if (scene == SCENE_STATUS) catchOnce(3, "06-your-sigil");
    else if (scene == SCENE_BAG) catchOnce(4, "07-the-pouch");
    else if (scene == SCENE_SHOP) catchOnce(shopStall ? 5 : 6,
      shopStall ? "12-arms-and-armour" : "11-remedies");
    else if (scene == SCENE_DUEL) {
      if (windowOpen && windowSays("Off them")) catchOnce(21, "21-what-they-carried");
      /* The star is up for twelve frames of a swing; catch it in the middle. */
      if (fxStar() == 2 && !fxOnMe) catchOnce(18, "18-the-blow-lands");
      else if (fxLean(1) > 8) catchOnce(19, "19-the-lunge");
      else if (duelPhase == DUEL_SPOILS && !spoilsDone() && shownExp > you.exp - 20)
        catchOnce(20, "20-the-rail-fills");
      else if (duelPhase == DUEL_TOP) catchOnce(7, "09-what-to-do");
      else if (duelPhase == DUEL_MENU) catchOnce(8, "10-which-blow");
      else if (windowOpen && !typeDone) catchOnce(9, "08-the-duel-opens");
    } else if (scene == SCENE_WORLD) {
      if (shift > 40) catchOnce(10, "13-the-flash");
      else if (shift > 20 && shift < 30) catchOnce(11, "14-going-dark");
      else if (spotted >= 0 && spotTimer > 20) catchOnce(12, "15-spotted");
      else if (windowOpen && !typeDone && frameNo > 400) catchOnce(13, "04-mid-sentence");
      else if (hopping && hero.walk > 8 && hero.walk < 26) catchOnce(16, "17-over-the-ledge");
      else if (!windowOpen && coverAt(hero.px >> 4, hero.py >> 4) && hero.walk)
        catchOnce(17, "16-in-the-grass");
      else if (windowOpen && windowSays("in the grass")) catchOnce(22, "22-lying-in-the-grass");
      else if (!windowOpen && frameNo > 60 && frameNo < 400) catchOnce(14, "03-winterfell");
      /* One picture of each settlement, so the four of them can be put side by
         side and told apart, which is the whole point of building them out of
         different materials. */
      else if (!windowOpen && !hero.walk) {
        if (worldId == 7) catchOnce(23, "23-castle-black");
        else if (worldId == 11) catchOnce(24, "24-moat-cailin");
        else if (worldId == 15) catchOnce(25, "25-riverrun");
      }
    }
  }

  if (scene == SCENE_TITLE) {
    /* Walk the cursor onto the entry this run is meant to take, then choose it,
       so a run can prove the record is taken up and a run can prove it is
       stepped past into swearing a new sword. */
    keys = (titlePick < titleWant && titlePick < TITLE_ENTRIES - 1)
      ? tap(KEY_DOWN) : tap(KEY_START);
  } else if (scene == SCENE_NAME) {
    /* Types a short name and confirms it, so the run gets past the screen and
       the name actually ends up on the duel plate where it can be checked. */
    if (nameLen < 4) keys = tap(KEY_A);
    else keys = tap(KEY_START);
  } else if (scene == SCENE_HOUSE) {
    /* The game resets the picker when it opens, so the house has to be walked
       to rather than set — which is also what a player does. */
    keys = houseChoice < wantHouse ? tap(KEY_RIGHT) : tap(KEY_A);
  } else if (scene == SCENE_STATUS) {
    keys = tap(KEY_B);
  } else if (scene == SCENE_MENU) {
    menusSeen++;
    /* Look in the pouch about half the time, write the record now and then,
       and otherwise leave. */
    if (menuWant < 0) menuWant = (int)roll(4);
    /* Leaving has to clear what it wanted too. Without this the first roll of
       "leave" sticks, and every menu after it is opened and shut again without
       the tester ever looking in the pouch. */
    if (menuWant == 3) { keys = tap(KEY_B); if (keys) menuWant = -1; }
    else if (menuPick != menuWant) keys = tap(menuPick < menuWant ? KEY_DOWN : KEY_UP);
    else { keys = tap(KEY_A); if (keys) { if (menuWant == 2) records++; menuWant = -1; } }
  } else if (scene == SCENE_BAG) {
    bagsSeen++;
    menuWant = -1;
    /* Drink something if it would help, otherwise put it away. */
    keys = (carrying() && you.hp < vigourFor(you.level) && (roll(2) == 0))
      ? tap(KEY_A) : tap(KEY_B);
  } else if (scene == SCENE_SHOP) {
    shopsSeen++;
    if (bought < 24 && roll(3) == 0) { keys = tap(KEY_A); if (keys) bought++; }
    else if (roll(4) == 0) keys = tap(KEY_DOWN);
    else keys = tap(KEY_B);
  } else if (scene == SCENE_DUEL) {
    if (wasScene != SCENE_DUEL) { duelTries = 0; runAway = (duels % 5) == 4; }
    if (windowOpen) keys = tap(KEY_A);
    else if (duelPhase == DUEL_TOP) {
      /* Fight most of the time; sometimes reach for the pouch, sometimes run. */
      int want = runAway ? 3 : (you.hp * 3 < vigourFor(you.level) && carrying() ? 1 : 0);
      if ((want & 1) != (topPick & 1)) keys = tap((want & 1) ? KEY_RIGHT : KEY_LEFT);
      else if ((want & 2) != (topPick & 2)) keys = tap((want & 2) ? KEY_DOWN : KEY_UP);
      else keys = tap(KEY_A);
      if (++duelTries > 900) { finding("a duel that would not end"); duelTries = 0; }
    }
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
    }
  } else {
    if (wasMap != worldId) {
      /* The very first map the game puts you on, which is the thing the player
         says is wrong. */
      if (wasMap < 0) { startedAt = world->name; startedLevel = you.level; }
      if (wasMap >= 0) warpsTaken++;
      wasMap = worldId;
      mapSeen[worldId]++;
      goalKind = GOAL_NONE;
    }
    if (you.level > wasLevel) { levels++; wasLevel = you.level; }
    if (you.kills > wasKills) { kills = you.kills; wasKills = you.kills; }

    /* A window comes first, always. Somebody walking up to draw on you does not
       move while one is open - the game holds them until it is read - so waiting
       for them with a window up is waiting for something that cannot happen. */
    if (spotted < 0) spottedBy = 0;
    if (windowOpen) {
      keys = tap(KEY_A);
    } else if (spotted >= 0) {
      if (!spottedBy) spottedBy = 1, spottings++;
      keys = 0;
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
      if (grindMode) {
        /* Walk the grass and fight whatever comes out of it. */
        if (!findCover(&grindX, &grindY)) { hostFramesLeft = 0; return; }
        goalKind = GOAL_SIGN;          /* borrow the "walk to a tile" behaviour */
        goalIndex = 0;
        gx = grindX; gy = grindY;
        if ((hero.px >> 4) == gx && (hero.py >> 4) == gy) {
          static const unsigned STEP[4] = { KEY_DOWN, KEY_UP, KEY_LEFT, KEY_RIGHT };
          keys = STEP[roll(4)];
          lastKeys = keys;
          REG_KEYINPUT = (unsigned short)(~keys & 0x03FF);
          frameNo++;
          return;
        }
        dir = stepToward(gx, gy);
        if (dir >= 0) {
          static const unsigned STEP[4] = { KEY_DOWN, KEY_UP, KEY_LEFT, KEY_RIGHT };
          keys = STEP[dir];
        }
        lastKeys = keys;
        REG_KEYINPUT = (unsigned short)(~keys & 0x03FF);
        frameNo++;
        return;
      }
      if (goalKind == GOAL_NONE) pickGoal();
      if (goalKind == GOAL_NONE) {
        if (getenv("WHY")) {
          int m, k;
          printf("nothing left to do, standing in %s\n", world->name);
          for (m = 0; m < MAP_COUNT; m++) {
            printf("  %-24s seen %d done %d  npcs:", maps[m].name, mapSeen[m], mapDone(m));
            for (k = 0; k < maps[m].npcCount && k < MAX_CROWD; k++) {
              printf(" %d%s", npcTalked[m][k], npcStuck[m][k] ? "s" : "");
            }
            printf("  warps:");
            for (k = 0; k < maps[m].warpCount; k++) printf(" %s", maps[maps[m].warps[k].to].name);
            printf("\n");
          }
        }
        hostFramesLeft = 0;
        return;
      }
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
          else if (++blocked < 900) {
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

  if (getenv("TRACE") && frameNo > atoi(getenv("FROM") ? getenv("FROM") : "0")
      && frameNo < atoi(getenv("TRACE"))) {
    printf("f%-5d sc%d %-14s hero %2d,%2d walk%2d dir%d win%d spot%d goal%d/%d gf%-4d keys %03x\n",
      frameNo, scene, world ? world->name : "-", hero.px >> 4, hero.py >> 4, hero.walk,
      hero.dir, windowOpen, spotted, goalKind, goalIndex, goalFrames, keys);
  }
  lastKeys = keys;
  REG_KEYINPUT = (unsigned short)(~keys & 0x03FF);
  frameNo++;
  /* STORY=n snapshots every n frames, so the opening of the game can be looked
     at as a strip in the order a player meets it rather than as a handful of
     screens caught whenever the tester happened to reach them. */
  if (shooting && storyEvery && (frameNo % storyEvery) == 0 && frameNo <= storyFor) {
    char name[64];
    snprintf(name, sizeof name, "story-%03d", frameNo / storyEvery);
    snapshot(name);
  }
  if (getenv("TRACE") && (frameNo % 25000) == 0) {
    fprintf(stderr, "f%7d %-18s scene %d phase %d win %d typed %d line %d/%d shift %d spot %d at %2d,%2d\n",
      frameNo, world ? world->name : "-", scene, duelPhase, windowOpen,
      typeDone, lineAt, lineCount, shift, spotted, hero.px >> 4, hero.py >> 4);
  }
  if (frameNo > FRAME_CAP) {
    finding("the playthrough ran out of frames in %s: scene %d, goal %d/%d, "
            "stage %d, %d frames on it, window %d, phase %d, at %d,%d",
            world->name, scene, goalKind, goalIndex, goalStage, goalFrames,
            windowOpen, duelPhase, hero.px >> 4, hero.py >> 4);
    hostFramesLeft = 0;
  }
}

int main(int argc, char **argv) {
  int i, seenMaps = 0, totalNpcs = 0, totalSigns = 0, house = argc > 1 ? atoi(argv[1]) : 0;
  gbaMem = calloc(MEM_SPAN, 1);
  if (!gbaMem) return 1;
  REG_KEYINPUT = 0x03FF;
  /* With SAVED set, the cartridge is switched on with a record already on it,
     which is the only way to see the title's other two entries. */
  if (getenv("SAVED")) {
    Record r;
    titleWant = atoi(getenv("SAVED")) - 1;      /* 1 continue, 2 new, 3 forget */
    unsigned k;
    for (k = 0; k < sizeof r; k++) ((unsigned char *)&r)[k] = 0;
    r.magic = RECORD_MAGIC;
    r.house = 2; r.level = 14; r.worldId = 6; r.dir = 0;
    r.x = 10; r.y = 8; r.weapon = 3; r.armour = 2; r.shield = 1;
    r.exp = (unsigned)expForLevel(14) + 40;
    r.gold = 1180; r.hp = 140; r.kills = 9;
    r.sum = tally(&r);
    for (k = 0; k < sizeof r; k++) hostSram[k] = ((unsigned char *)&r)[k];
  }
  hostFramesLeft = FRAME_CAP + 8;
  wantHouse = house;
  if (getenv("SEED")) seed = (unsigned)atoi(getenv("SEED"));
  if (getenv("STORY")) { storyEvery = atoi(getenv("STORY")); storyFor = storyEvery * 40; }
  if (getenv("GRIND")) { grindMode = 1; hostFramesLeft = atoi(getenv("GRIND")); }
  if (argc > 2) { shooting = 1; outDir = argv[2]; }

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
  /* The spine, and whether a player walking the world the way this one does
     actually finds it. Nine sigils is the whole game; a run that ends holding
     none of them has not been playing it. */
  {
    int i;
    printf("  sigils         %d of %d:", countSigils(), LEADER_COUNT);
    for (i = 0; i < LEADER_COUNT; i++) {
      printf(" %s%s", leaders[atRung[i]].sigil, haveSigil(atRung[i]) ? "*" : "-");
    }
    printf("\n");
  }
  printf("  status card    opened %d times\n", statusChecks);
  printf("  spotted on the road %d times\n", spottings);
  printf("  menus / pouch / stalls  %d / %d / %d, bought %d things, saved %d times\n",
    menusSeen, bagsSeen, shopsSeen, bought, records);
  printf("  carrying       ");
  { int n = 0, k; for (k = 0; k < WARE_COUNT; k++) if (you.bag[k]) { printf("%s x%d  ", wares[k].name, you.bag[k]); n++; }
    if (!n) printf("nothing"); printf("\n"); }
  printf("  wearing        %s, %s, %s\n",
    you.weapon ? wares[you.weapon - 1].name : "bare hands",
    you.armour ? wares[you.armour - 1].name : "roughspun",
    you.shield ? wares[you.shield - 1].name : "no shield");
  printf("  techniques     ");
  for (i = 0; i < 4; i++) printf("%s x%d  ", techniques[myTechs[i]].name, techUsed[i]);
  printf("\n");

  printf("  started at     %s, level %d, called \"%s\"\n", startedAt, startedLevel, you.name);
  printf("  sound          %d notes sounded\n", soundNotes);

  if (!findingCount) {
    printf("\n  nothing went wrong.\n");
    return 0;
  }
  printf("\n  %d thing%s to look at:\n", findingCount, findingCount == 1 ? "" : "s");
  for (i = 0; i < findingCount; i++) printf("    - %s\n", findings[i]);
  return 1;
}
