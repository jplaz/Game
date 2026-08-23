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

/* The world is sixty maps now and the last two seats are behind a warren and a
   ferry nobody advertises, so a run that plays the whole ladder needs longer
   than one that walked thirty-eight rooms. */
#define FRAME_CAP 1800000
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
static int portsSeen, sailed;
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
  if (scene < 0 || scene > SCENE_PORT) finding("scene is %d, which is not a scene", scene);
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

static int warpHere(int x, int y) {
  int i;
  for (i = 0; i < world->warpCount; i++) {
    if (world->warps[i].x == x && world->warps[i].y == y) return 1;
  }
  return 0;
}

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
      /* And never route through a door you did not mean to take. A cave mouth
         that happens to sit on the shortest line across a road swallowed the
         tester and spat it out one tile below, over and over: thirty-eight
         thousand doors and nineteen maps seen in a whole playthrough. */
      if (!(nx == gx && ny == gy) && warpHere(nx, ny)) continue;
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
static int craftsSeen, crafted, craftedHere;
static int wildsMet, snaresThrown;
static int doorsThisRung;
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

/* Whether there is a road from here to there at all - doors only, no ships.
   The tester will pay a fare to reach somewhere it cannot walk to and will not
   pay one to reach somewhere it can, which is what stops it spending a whole
   playthrough sailing back and forth between three ports on the same coast. */
static int walkableTo(int want) {
  int from[MAP_COUNT], q[MAP_COUNT], head = 0, tail = 0, i;
  for (i = 0; i < MAP_COUNT; i++) from[i] = 0;
  from[worldId] = 1;
  q[tail++] = worldId;
  while (head < tail) {
    int m = q[head++];
    if (m == want) return 1;
    for (i = 0; i < maps[m].warpCount; i++) {
      int to = maps[m].warps[i].to;
      if (from[to]) continue;
      from[to] = 1;
      q[tail++] = to;
    }
  }
  return 0;
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

/* ------------------------------------------------------------- the ladder --
   LADDER=1 plays the game the way somebody trying to finish it would, instead
   of the way a surveyor walks a field. It looks up which sigil it is short of,
   walks towards whoever holds it, stops in the long grass on the way if it is
   under the weight of that fight, spends its gold at the first smith it passes,
   and then goes and knocks. What it prints is the shape of the game: what level
   each rung was actually taken at, how long the walk was, and what was in your
   hands when you got there.

   A run that reaches the ninth rung is a game that can be finished. A run whose
   levels sag or spike between rungs is a game with a hole in it, and no amount
   of walking every map end to end will show you that. */
static int ladderMode, ladderRung = -1, ladderFrames, ladderFights;
static int wantShop;

static int leaderNpcOn(int m, int lead) {
  int i;
  for (i = 0; i < maps[m].npcCount && i < MAX_CROWD; i++) {
    if (maps[m].npcs[i].duellist == leaders[lead].duellist) return i;
  }
  return -1;
}

/* The nearest map with a counter on it, and the door out of here towards it. */
static int mapHasTrade(int m) {
  int i;
  for (i = 0; i < maps[m].npcCount && i < MAX_CROWD; i++) {
    if (maps[m].npcs[i].trade == 2) return 1;
  }
  return 0;
}

static int warpTowardTrade(void) {
  int from[MAP_COUNT], q[MAP_COUNT], head = 0, tail = 0, i, want = -1, at;
  for (i = 0; i < MAP_COUNT; i++) from[i] = -2;
  from[worldId] = -1;
  q[tail++] = worldId;
  while (head < tail) {
    int m = q[head++];
    if (m != worldId && mapHasTrade(m)) { want = m; break; }
    for (i = 0; i < maps[m].warpCount; i++) {
      int to = maps[m].warps[i].to;
      if (from[to] != -2) continue;
      from[to] = m;
      q[tail++] = to;
    }
  }
  if (want < 0) return -1;
  at = want;
  while (from[at] != worldId) { at = from[at]; if (at < 0) return -1; }
  for (i = 0; i < world->warpCount; i++) if (world->warps[i].to == at) return i;
  return -1;
}

/* The door out of here that gets nearest to a given map. */
static int warpTowardMap(int want) {
  int from[MAP_COUNT], q[MAP_COUNT], head = 0, tail = 0, i, at = want;
  if (want == worldId) return -1;
  for (i = 0; i < MAP_COUNT; i++) from[i] = -2;
  from[worldId] = -1;
  q[tail++] = worldId;
  while (head < tail) {
    int m = q[head++];
    for (i = 0; i < maps[m].warpCount; i++) {
      int to = maps[m].warps[i].to;
      if (from[to] != -2) continue;
      from[to] = m;
      q[tail++] = to;
    }
  }
  if (from[want] == -2) return -1;
  while (from[at] != worldId) { at = from[at]; if (at < 0) return -1; }
  for (i = 0; i < world->warpCount; i++) if (world->warps[i].to == at) return i;
  return -1;
}

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

/* What the ladder run wants next: the leader it is short of, the grass it needs
   to be worth fighting them, or the road in between. */
static void pickLadderGoal(void) {
  int at = nextRung(), lead, want, who, i;
  if (at < 0) {                                      /* nine sigils: finished */
    printf("      the realm is yours: nine sigils at level %d, %d gold\n",
      you.level, you.gold);
    hostFramesLeft = 0;
    return;
  }
  lead = atRung[at];
  want = leaderLevel[at];
  if (at != ladderRung) {
    ladderRung = at;
    /* One trip to a counter for each rung, armed when the rung changes rather
       than whenever the purse grows. Arming it on money turned the forge door
       into a revolving one - in, buy nothing, out, in again, forever. */
    wantShop = 1;
    printf("    rung %d  %-22s at %-18s wants about %2d\n",
      at + 1, leaders[lead].name, leaders[lead].seat, want);
  }
  /* Under the weight of that fight: go and earn it - but only where the ground
     is worth walking. Standing in the snow outside your own front door killing
     level threes at level thirty-nine is not levelling, it is arithmetic, and a
     player would have gone somewhere harder. */
  grindMode = 0;
  if (you.level + 1 < want) {
    int here = groundBy[you.house][worldId];
    if (here + 8 >= you.level && findCover(&grindX, &grindY)) {
      grindMode = 1;
      goalKind = GOAL_SIGN; goalIndex = 0;            /* borrow "walk to a tile" */
      return;
    }
  }
  /* Find a smith when there is money in your purse. Walking the whole ladder
     without ever opening a shop door is not playing the game - and it is what
     the run did, because the smiths are all one door off the road inside the
     forges and nothing was ever going in. */
  if (wantShop) {
    /* Arriving is the visit, whether or not the smith is still breathing. The
       tester duels everybody, so it kills smiths, and a dead one meant the trip
       was never counted as made: out of the forge, look for a forge, back into
       the forge, forever. */
    if (mapHasTrade(worldId)) wantShop = 0;
    for (i = 0; i < crowdCount; i++) {
      if (world->npcs[i].trade == 2 && crowdAlive[i]) {
        goalKind = GOAL_NPC; goalIndex = i; return;
      }
    }
    if (wantShop) {
      int door = warpTowardTrade();
      if (door >= 0) { goalKind = GOAL_WARP; goalIndex = door; return; }
      wantShop = 0;
    }
  }
  if (worldId == leaders[lead].map) {
    who = leaderNpcOn(worldId, lead);
    if (who >= 0 && crowdAlive[who]) { goalKind = GOAL_NPC; goalIndex = who; return; }
  }
  i = warpTowardMap(leaders[lead].map);
  if (i >= 0) { goalKind = GOAL_WARP; goalIndex = i; return; }
  /* No road from here to the person you want. Falling back to wandering put the
     run in a two-door loop it walked thirty-five thousand times, so say so and
     stop rather than pretend to be busy. */
  printf("      lost: no road from %s to %s at level %d\n",
    world->name, leaders[lead].seat, you.level);
  hostFramesLeft = 0;
}

/* Is there anywhere across the water that still owes something, and can the
   fare be paid? */
static int portOwesWork(void) {
  int i, j;
  for (i = 0; i < PORT_COUNT; i++) {
    int m = ports[i].map;
    if (m == worldId || (int)ports[i].fare > you.gold) continue;
    if (walkableTo(m)) continue;
    if (!mapDone(m)) return 1;
    for (j = 0; j < maps[m].warpCount; j++) if (!mapDone(maps[m].warps[j].to)) return 1;
  }
  return 0;
}

/* The harbourmaster on this map, if there is one. Worth speaking to more than
   once: the passage list is a road, and a road does not stop existing because
   you have walked down it. */
static int sailorHere(void) {
  int i;
  for (i = 0; i < crowdCount; i++) if (world->npcs[i].sails && crowdAlive[i]) return i;
  return -1;
}

/* The next thing worth doing on this map, or nothing left to do. */
static void pickGoal(void) {
  int i;
  /* Clearing the clock first, for everybody. The ladder branch used to return
     above this, so once one goal had timed out goalFrames stayed over the limit
     and every frame after it timed out instantly - a spin that ate the whole
     frame budget while the counter that reports how long the run took barely
     moved. It looked exactly like being stuck at a door. */
  goalKind = GOAL_NONE;
  goalFrames = 0;
  goalStage = 0;
  interacting = 0;
  if (ladderMode) { pickLadderGoal(); return; }

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
  /* Everything here is done. If the only unfinished ground is across water,
     go and find whoever sells passage; otherwise take a door. */
  if (portOwesWork()) {
    i = sailorHere();
    /* Not clearing npcTalked: the goal is set here directly, and clearing it
       counted the same conversation again every time - which is how a sweep
       came back having spoken to two hundred and sixty-four of two hundred
       and fifty-five people. */
    if (i >= 0) { goalKind = GOAL_NPC; goalIndex = i; return; }
  }
  i = warpTowardWork();
  if (i >= 0) { goalKind = GOAL_WARP; goalIndex = i; }
}

/* Whether that tile is a counter you can lean over. */
static int counterAt(int x, int y) {
  if (x < 0 || y < 0 || x >= world->w || y >= world->h) return 0;
  return world->counter[y * world->w + x];
}

/* Where to put your feet to speak to somebody: beside them, or on the near side
   of the counter they are standing behind. A stallholder is walled in on
   purpose, and a tester that only ever walks up alongside people never reaches
   a single shopkeeper - which is how twenty-two people stopped being visited
   the day the shops got counters that ran the width of the room. */
static void standTile(int gx, int gy, int *sx, int *sy) {
  int i;
  *sx = gx; *sy = gy;
  for (i = 0; i < 4; i++) if (!solidAt(gx + DIR_X[i], gy + DIR_Y[i])) return;
  for (i = 0; i < 4; i++) {
    int nx = gx + DIR_X[i], ny = gy + DIR_Y[i];
    int bx = nx + DIR_X[i], by = ny + DIR_Y[i];
    if (counterAt(nx, ny) && !solidAt(bx, by)) { *sx = bx; *sy = by; return; }
  }
}

static void goalTile(int *gx, int *gy) {
  if (goalKind == GOAL_NPC) { *gx = crowd[goalIndex].px >> 4; *gy = crowd[goalIndex].py >> 4; }
  else if (goalKind == GOAL_SIGN) { *gx = world->signs[goalIndex].x; *gy = world->signs[goalIndex].y; }
  else { *gx = world->warps[goalIndex].x; *gy = world->warps[goalIndex].y; }
}

static void completeGoal(void) {
  if (goalKind == GOAL_NPC) {
    if (goalStage == 0) {
      /* Once each. The ladder run walks back to the same shopkeeper a dozen
         times, and counting every visit made the tally read "568 of 161". */
      if (!npcTalked[worldId][goalIndex]) talked++;
      npcTalked[worldId][goalIndex] = 1;
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

  /* POSTCARDS=1 catches one picture of every map the tester walks into, drawn
     through the cartridge's own tiles and its own quantised palette. Building
     a town and then looking at a screenshot of a road somewhere else is how a
     roof gets shipped the wrong colour: this is a contact sheet of the whole
     world as the console will actually draw it. */
  if (shooting && getenv("POSTCARDS") && scene == SCENE_WORLD && world
      && !windowOpen && !hero.walk && !shift && frameNo > 8) {
    static unsigned char posted[MAP_COUNT];
    if (!posted[worldId]) {
      char name[80];
      posted[worldId] = 1;
      snprintf(name, sizeof name, "map-%02d-%s", worldId, world->name);
      for (char *c = name; *c; c++) if (*c == ' ' || *c == '\'' || *c == ',') *c = '-';
      snapshot(name);
    }
  }

  if (shooting) {
    if (scene == SCENE_TITLE) catchOnce(0, getenv("SAVED") ? "01-title-with-a-record" : "01-title");
    else if (scene == SCENE_NAME && nameLen == 3) catchOnce(23, "02b-your-name");
    else if (scene == SCENE_HOUSE) catchOnce(1, "02-swear-your-sword");
    else if (scene == SCENE_MENU) catchOnce(2, "05-the-menu");
    else if (scene == SCENE_STATUS) catchOnce(3, "06-your-sigil");
    else if (scene == SCENE_BAG) catchOnce(4, "07-the-pouch");
    else if (scene == SCENE_CRAFT) catchOnce(24, craftAt ? "12b-at-the-anvil" : "11b-at-the-bench");
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
    /* In a fight with an animal that is nearly down, reach for a net rather
       than for a drink: taking one alive is a whole half of the game and a
       tester that never throws one has not walked it. */
    if (bagInDuel && foeBeast >= 0 && theirs.hp * 3 < theirs.maxHp) {
      int have = carrying(), want = -1, i;
      for (i = 0; i < have; i++) {
        if (wares[nthCarried(i)].kind == WARE_SNARE) { want = i; break; }
      }
      if (want >= 0) {
        if (bagPick != want) keys = tap(bagPick < want ? KEY_DOWN : KEY_UP);
        else { keys = tap(KEY_A); if (keys) snaresThrown++; }
      } else keys = tap(KEY_B);
    }
    else keys = (carrying() && you.hp < vigourFor(you.level) && (roll(2) == 0))
      ? tap(KEY_A) : tap(KEY_B);
  } else if (scene == SCENE_SHOP) {
    shopsSeen++;
    if (ladderMode && !craftedHere) {
      /* Look behind the counter first: anything a smith will make out of what
         you are carrying is better than anything on the shelf, and it is the
         only way the last four pieces of kit in the game are ever seen. */
      craftedHere = 1;
      keys = tap(KEY_SELECT);
    }
    else if (ladderMode) {
      /* Buy the dearest thing on the counter that is better than what is in
         your hands and that the purse will stand, which is what somebody
         playing to finish would do. */
      const Stall *stall = &stalls[shopStall];
      int best = -1, i;
      for (i = 0; i < stall->count; i++) {
        int at = stall->ware[i];
        int had = wares[at].kind < WARE_KINDS ? you.worn[wares[at].kind] : 0;
        if (wares[at].kind == WARE_POTION) { if (you.bag[at] >= 4) continue; }
        else if (wares[at].kind == WARE_SNARE) { if (you.bag[at] >= 3) continue; }
        else if (had && wares[had - 1].price >= wares[at].price) continue;
        if (wares[at].price > you.gold) continue;
        if (best < 0 || wares[stall->ware[best]].price < wares[at].price) best = i;
      }
      if (best < 0) keys = tap(KEY_B);
      else if (shopPick != best) keys = tap(shopPick < best ? KEY_DOWN : KEY_UP);
      else { keys = tap(KEY_A); if (keys) bought++; }
    }
    else if (bought < 24 && roll(3) == 0) { keys = tap(KEY_A); if (keys) bought++; }
    else if (roll(4) == 0) keys = tap(KEY_DOWN);
    else keys = tap(KEY_B);
  } else if (scene == SCENE_CRAFT) {
    craftsSeen++;
    /* Make the dearest thing this bench can manage out of what is in the pouch,
       then go back to the counter. */
    {
      int have = craftCount(), best = -1, i;
      for (i = 0; i < have; i++) {
        const Recipe *r = &recipes[nthRecipe(i)];
        if (shortOf(r) || you.gold < r->gold) continue;
        /* A net first, always: without one there is no taking anything alive,
           and the run would never walk that half of the game. */
        if (wares[r->makes].kind == WARE_SNARE && you.bag[r->makes] < 2) { best = i; break; }
        if (best < 0 || recipes[nthRecipe(best)].gold < r->gold) best = i;
      }
      if (best < 0) keys = tap(KEY_SELECT);
      else if (craftPick != best) keys = tap(craftPick < best ? KEY_DOWN : KEY_UP);
      else { keys = tap(KEY_A); if (keys) crafted++; }
    }
  } else if (scene == SCENE_PORT) {
    /* A harbourmaster has just offered a berth. Take one to somewhere the run
       has not been - it is the only road to the Free Cities and there is no
       walking there - and otherwise stay ashore.

       Without this branch the tester stood on the King's Landing quay with the
       passage list open for one and three quarter million frames: seven maps
       seen in a whole playthrough, and every house ending up in the capital
       because that is where it was standing when the frames ran out. */
    int want = -1, i, j;
    portsSeen++;
    /* Somewhere there is no road to, that still owes something.
       "Somewhere new" was not enough: a city across the sea is a dead end on
       the door graph, so sailing there once, walking out through the sea gate
       and never opening the one door in it left four rooms unvisited for a
       whole sweep. "Anywhere unfinished" was too much: three of the berths are
       on the same coast and the tester spent the run sailing between them
       rather than walking. It is both - and only once this map is finished,
       because leaving in the middle of somewhere is how the first one
       happened. */
    for (i = 0; i < PORT_COUNT && want < 0; i++) {
      int m = ports[i].map;
      if (m == worldId || (int)ports[i].fare > you.gold) continue;
      if (walkableTo(m)) continue;
      if (!mapDone(m)) { want = i; continue; }
      for (j = 0; j < maps[m].warpCount; j++) {
        if (!mapDone(maps[m].warps[j].to)) { want = i; break; }
      }
    }
    (void)j;
    if (want < 0) keys = tap(KEY_B);
    else if (portPick != want) keys = tap(portPick < want ? KEY_DOWN : KEY_UP);
    else { keys = tap(KEY_A); if (keys) { sailed++; goalKind = GOAL_NONE; } }
  } else if (scene == SCENE_DUEL) {
    if (wasScene != SCENE_DUEL) {
      if (foeBeast >= 0) wildsMet++;
      duelTries = 0;
      runAway = ladderMode ? 0 : (duels % 5) == 4;
      if (ladderMode) ladderFights++;
    }
    if (windowOpen) keys = tap(KEY_A);
    else if (duelPhase == DUEL_TOP) {
      /* Fight most of the time; sometimes reach for the pouch, sometimes run. */
      /* Only reach for the pouch over an animal if there is actually a net in
         it. Without that check the tester opened the pouch, found nothing,
         shut it, and opened it again - four hundred thousand times. */
      int haveNet = 0, i2;
      for (i2 = 0; i2 < WARE_COUNT; i2++) {
        if (wares[i2].kind == WARE_SNARE && you.bag[i2]) { haveNet = 1; break; }
      }
      int want = runAway ? 3
        : (foeBeast >= 0 && haveNet && theirs.hp * 3 < theirs.maxHp) ? 1
        : (you.hp * 3 < vigourFor(you.level) && carrying() ? 1 : 0);
      /* And set the beast on them when there is one to set. */
      if (want == 0 && you.beast.kind != 255 && (roll(3) == 0)) want = 2;
      if ((want & 1) != (topPick & 1)) keys = tap((want & 1) ? KEY_RIGHT : KEY_LEFT);
      else if ((want & 2) != (topPick & 2)) keys = tap((want & 2) ? KEY_DOWN : KEY_UP);
      else keys = tap(KEY_A);
      if (++duelTries > 900) { finding("a duel that would not end"); duelTries = 0; }
    }
    else if (duelPhase == DUEL_MENU) {
      /* On the ladder, swing the hardest thing in your hands rather than a
         random one: this run is meant to measure the game, not the dice. */
      if (ladderMode) {
        int best = 0, i, score = -1;
        for (i = 0; i < 4; i++) {
          const Tech *t = &techniques[myTechs[i]];
          int s2 = t->power * t->accuracy;
          if (s2 > score) { score = s2; best = i; }
        }
        if ((best & 1) != (duelMenu & 1)) keys = tap((best & 1) ? KEY_RIGHT : KEY_LEFT);
        else if ((best & 2) != (duelMenu & 2)) keys = tap((best & 2) ? KEY_DOWN : KEY_UP);
        else { keys = tap(KEY_A); techUsed[duelMenu]++; }
      }
      else if (runAway) keys = tap(KEY_B);
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
      /* A room with a smith in it and money in your purse is a room you stop
         in. Armed one map at a time, so the ladder run does not walk past
         nine thousand gold's worth of counter on its way to a fight. */
      craftedHere = 0;
      /* A ladder run that takes hundreds of doors without taking a sigil is
         walking a two-map loop, not travelling. Say where, and stop. */
      if (ladderMode) {
        if (++doorsThisRung > 400) {
          printf("      walking in circles near %s at level %d, %d doors without "
                 "a sigil\n", world->name, you.level, doorsThisRung);
          hostFramesLeft = 0;
        }
      }
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
      /* Stop grinding the moment the fight is within reach. The grind branch
         returns before ever asking for a new goal, so without this a ladder run
         walks into the first patch of long grass it sees and stays there until
         the frame cap, which is precisely what it did. */
      if (ladderMode && grindMode) {
        int at = nextRung();
        if (at < 0 || you.level + 1 >= leaderLevel[at]) {
          grindMode = 0;
          goalKind = GOAL_NONE;
        }
      }
      if (grindMode) {
        /* Walk the grass and fight whatever comes out of it. */
        if (!findCover(&grindX, &grindY)) {
          printf("      stopped: nothing to fight in %s and still short of the "
                 "next rung (level %d)\n", world->name, you.level);
          hostFramesLeft = 0;
          return;
        }
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
        if (ladderMode) {
          printf("      stopped in %s at level %d: nothing it knows how to do "
                 "next\n", world->name, you.level);
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
        int sx = gx, sy = gy;
        for (i = 0; i < 4; i++) if (hx + DIR_X[i] == gx && hy + DIR_Y[i] == gy) facing = i;
        /* Or across their counter, which is the only way to reach a shopkeeper
           and exactly what the game allows. */
        if (facing < 0 && goalKind == GOAL_NPC) {
          for (i = 0; i < 4; i++) {
            if (hx + 2 * DIR_X[i] == gx && hy + 2 * DIR_Y[i] == gy
                && counterAt(hx + DIR_X[i], hy + DIR_Y[i])) facing = i;
          }
        }
        if (goalKind == GOAL_NPC) standTile(gx, gy, &sx, &sy);

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
          dir = stepToward(sx, sy);
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
  /* What the run actually felt like, printed the moment a sigil is taken. */
  if (ladderMode) {
    static int hadSigils;
    int now = countSigils();
    if (now != hadSigils) {
      hadSigils = now;
      printf("      took it at level %2d after %3d fights and %6d frames"
             "  |  %-18s %-18s %s  |  %d gold\n",
        you.level, ladderFights, frameNo - ladderFrames,
        you.WORN_WEAPON ? wares[you.WORN_WEAPON - 1].name : "bare hands",
        you.WORN_ARMOUR ? wares[you.WORN_ARMOUR - 1].name : "roughspun",
        you.WORN_SHIELD ? wares[you.WORN_SHIELD - 1].name : "no shield", you.gold);
      ladderFrames = frameNo;
      ladderFights = 0;
      doorsThisRung = 0;
    }
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
    /* Built from the house's own starting seat rather than from a map number
       and a pair of coordinates typed in by hand: map six stopped being the map
       it was the moment the world grew, and the resumed game woke up inside a
       wall with nowhere to walk. */
    r.house = 2;
    r.level = 14;
    r.worldId = houses[2].startMap;
    r.dir = houses[2].startDir;
    r.x = houses[2].startX; r.y = houses[2].startY;
    r.worn[WARE_WEAPON] = 3; r.worn[WARE_ARMOUR] = 2; r.worn[WARE_SHIELD] = 1;
    r.worn[WARE_HELM] = 4; r.worn[WARE_GLOVES] = 5;
    r.beastKind = 255;                          /* nothing at your heel */
    r.haven = 255;
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
  if (getenv("LADDER")) ladderMode = 1;
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
  printf("  passage list   opened %d times, sailed %d\n", portsSeen, sailed);
  printf("  spotted on the road %d times\n", spottings);
  printf("  menus / pouch / stalls  %d / %d / %d, bought %d things, saved %d times\n",
    menusSeen, bagsSeen, shopsSeen, bought, records);
  printf("  benches        %d looked at, %d things made\n", craftsSeen, crafted);
  printf("  the wild       %d animals met, %d nets thrown, %d taken alive\n",
    wildsMet, snaresThrown, you.tamed);
  if (you.beast.kind != 255) {
    printf("  at your heel   %s, level %d\n", beasts[you.beast.kind].name, you.beast.level);
  } else {
    printf("  at your heel   nothing\n");
  }
  printf("  carrying       ");
  { int n = 0, k; for (k = 0; k < WARE_COUNT; k++) if (you.bag[k]) { printf("%s x%d  ", wares[k].name, you.bag[k]); n++; }
    if (!n) printf("nothing"); printf("\n"); }
  printf("  wearing        %s, %s, %s\n",
    you.WORN_WEAPON ? wares[you.WORN_WEAPON - 1].name : "bare hands",
    you.WORN_ARMOUR ? wares[you.WORN_ARMOUR - 1].name : "roughspun",
    you.WORN_SHIELD ? wares[you.WORN_SHIELD - 1].name : "no shield");
  printf("  on head/hands %s, %s\n",
    you.WORN_HELM ? wares[you.WORN_HELM - 1].name : "nothing",
    you.WORN_GLOVES ? wares[you.WORN_GLOVES - 1].name : "bare hands");
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
