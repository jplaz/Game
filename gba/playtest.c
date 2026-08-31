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
/* A hundred and eight maps is a bigger sweep than eighty-six was. */
#define FRAME_CAP 2600000
static int frameCap = FRAME_CAP;
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
static unsigned char entitled[MAP_COUNT];
/* And where any road at all leads, with every gate open. */
static unsigned char anyRoad[MAP_COUNT];
/* The most seats this run ever held while stood at a berth. */
static int seatsAtBerth;
static int portsSeen, sailed, talesSeen, crownRun;
static int yardsSeen, hullsBought, yardHeld;   /* the shipwright's */
static int landsSeen, deedsBought, roomsSeen, landHeld;  /* what is for sale */
static int seaFights, seaHeld, putToSeaCount;  /* and what is out on it */
static int partiesSeen, partyLooks, swaps;
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
  /* A box that ran out of lines and dropped the rest of what somebody said.
     This is what "the text after a battle gets cut off" looks like from in
     here, and nothing in the game ever said a word about it. */
  if (wrapLost) {
    finding("a window ran off the end of its lines and lost text");
    wrapLost = 0;
  }
  if (scene < 0 || scene > SCENE_LAND) finding("scene is %d, which is not a scene", scene);
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
#define GOAL_CHAIR 4                /* the Iron Throne, once it is yours */

static int goalKind, goalIndex, goalFrames, goalStage;
static int npcDuelled[MAP_COUNT][MAX_CROWD];
static int interacting, duelTries, blocked;
static int wantHouse, runAway, statusChecks, sinceStatus, wantTech, techUsed[4];
static int menusSeen, bagsSeen, shopsSeen, bought, records, menuWant = -1;
static int mustersSeen, kennelsSeen, holdLooks, boarded, fetched, oathsOffered;
static int oathWanted = -1;
static int deedsSeen, cutsPlayed, cutsChosen, courtsHeld, courtsAnswered;
/* The house card and the arms builder: how many times the run opened each, how
   far down the card it has walked this visit, and whether it ever took arms of
   its own, bought a hall, or married anybody. */
static int housesSeen, houseLooks, armsSeen, armsLooks, ridesSeen, rideLooks, rodeTo;
static unsigned char cutSeen[CUT_COUNT];
static int eggsFound, eggsHatched, dragonEgg;
static int boughtOf[WARE_COUNT];
static int craftsSeen, crafted, craftedHere;
static int wildsMet, snaresThrown;
static int shopHeld;   /* consecutive frames stood at a counter */
/* Whether the pack was ever used as a pack, and whether every shelf of every
   counter was ever read. */
static int beastsSentOut, beastsFelled, shelfSeen[STALL_COUNT], gearBroke;
/* The Long Night: how deep it got, how many of the dead were met on a road
   south of the Wall, and how many ravens actually reached the player. */
static int deepestWinter, deadMet, deadSouth, ravensRead, rangingsDone;
/* And the dragons: how many dropped on the road, how many towns were saved or
   lost while the tester was busy being a knight. */
static int dragonsMet, townsSaved, townsBurned;
static int eveningsSpent, childrenBorn, childrenSworn;
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
  /* The Red Keep is shut until nine seats have bent to you, and the two white
     cloaks on the stair will say so all day. Counting it as unfinished sent the
     tester to that door and left it there: two and a half million frames stood
     on one tile in King's Landing being told no. It owes nothing until it can
     be opened. */
  if (m == THRONE_MAP && countSigils() < LEADER_COUNT - 1) return 1;
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
/* Open water is not a road.
 *
 * The map graph joins Lannisport to Lordsport through the Sunset Sea, which is
 * three doors, while the road round by the Riverlands is a dozen. So every
 * router in here took the short way, walked out onto the sea, and stood on it -
 * because a sea is ground you steer across and there was no hull. That is why
 * no run had ever taken the fifth rung: Pyke is perfectly walkable, and nothing
 * ever walked to it. */
static int crossable(int m) { return !maps[m].sea || ownShip(); }

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
      if (from[to] || !crossable(to)) continue;
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
      if (from[to] != -2 || !crossable(to)) continue;
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
/* How many times this rung has gone looking for a counter. The errand is a
   nicety - it proves the run spends its gold - and a nicety is not allowed to
   stop the climb. Storm's End has a forge with no smith left alive in it, so
   the run stood inside a forge looking for a forge until the frames ran out,
   four rungs short of the throne. */
static int shopTries;
/* The map the climb is trying to reach, so that a harbourmaster can be asked
   for the berth that gets nearest it rather than the berth that happens to
   owe the surveyor a room. */
static int ladderWants = -1;
static int wantShop;
/* Whether this rung has already been sent back for a weapon. */
static int rearmed;
/* What the counter is being asked for, what was in the purse when the asking
   started, and how many times. A sale always takes gold. */
static int askedFor = -1, askedGold, askedTimes;
/* Where the last fight was fought, how many in a row have been lost there, and
   the maps that have proved they are not a place to train. */
static int duelMap = -1;
static u16 lostHere[MAP_COUNT];
static u8 badGround[MAP_COUNT];

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
      if (from[to] != -2 || !crossable(to)) continue;
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
      if (from[to] != -2 || !crossable(to)) continue;
      from[to] = m;
      q[tail++] = to;
    }
  }
  if (from[want] == -2) return -1;
  while (from[at] != worldId) { at = from[at]; if (at < 0) return -1; }
  for (i = 0; i < world->warpCount; i++) if (world->warps[i].to == at) return i;
  return -1;
}

static int sailorHere(void);

/* How many doors between two maps, or -1 if there is no road at all. */
static int hopsBetween(int from, int want) {
  int seen[MAP_COUNT], q[MAP_COUNT], dist[MAP_COUNT], head = 0, tail = 0, i;
  if (from == want) return 0;
  for (i = 0; i < MAP_COUNT; i++) seen[i] = 0;
  seen[from] = 1;
  dist[from] = 0;
  q[tail++] = from;
  while (head < tail) {
    int m = q[head++];
    for (i = 0; i < maps[m].warpCount; i++) {
      int to = maps[m].warps[i].to;
      if (seen[to] || !crossable(to)) continue;
      seen[to] = 1;
      dist[to] = dist[m] + 1;
      if (to == want) return dist[to];
      q[tail++] = to;
    }
  }
  return -1;
}

/* Which berth lands nearest the map we are trying to reach.
 *
 * Pyke is an island and the Iron Islands are the fifth rung of the ladder, so
 * a run that can only walk stops there - which is what happened, for every run
 * this game has ever had: rungs five to ten were never played by anything. A
 * player takes a passage. This is the tester learning to do the same. */
static int berthToward(int want) {
  int best = -1, bestHops = 1 << 30, i;
  int free = !world->warpCount;
  for (i = 0; i < PORT_COUNT; i++) {
    int hops;
    if (ports[i].map == worldId) continue;
    if ((int)ports[i].needs > countSigils()) continue;
    if (!free && (int)ports[i].fare > you.gold) continue;
    hops = ports[i].map == want ? 0 : hopsBetween(ports[i].map, want);
    if (hops < 0) continue;
    if (hops < bestHops) { bestHops = hops; best = i; }
  }
  return best;
}

/* The door towards the nearest map that has one. */
static int warpTowardSails(void) {
  int from[MAP_COUNT], q[MAP_COUNT], head = 0, tail = 0, i, k, want = -1, at;
  for (i = 0; i < MAP_COUNT; i++) from[i] = -2;
  from[worldId] = -1;
  q[tail++] = worldId;
  while (head < tail) {
    int m = q[head++];
    if (m != worldId) {
      for (k = 0; k < maps[m].npcCount; k++) {
        if (maps[m].npcs[k].sails) { want = m; break; }
      }
      if (want >= 0) break;
    }
    for (i = 0; i < maps[m].warpCount; i++) {
      int to = maps[m].warps[i].to;
      if (from[to] != -2 || !crossable(to)) continue;
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
    /* Every sigil taken. For an ordinary climb that is the end of the errand -
       but the last act begins after the last sigil, not with it, so a crown run
       keeps going until the chair has actually been sat in. */
    if (crownRun && you.story < 3) {
      /* Beaten by the thing behind the throne. Walk back up and try it again,
         which is what the game now lets a player do. */
      int back = worldId == THRONE_MAP ? -1 : warpTowardMap(THRONE_MAP);
      if (back >= 0) { goalKind = GOAL_WARP; goalIndex = back; return; }
      if (worldId == THRONE_MAP) {
        int door = warpTowardMap(THRONE_GATE_MAP);
        if (door >= 0) { goalKind = GOAL_WARP; goalIndex = door; return; }
      }
    }
    /* The chair is yours, and the game is not over: eighteen petitions are
       waiting on it and nothing else in the tester ever hears one. Taking the
       throne used to end the run on the spot, which is exactly the mistake the
       game itself used to make. */
    if (crownRun && you.story >= 3 && petitionWaiting() >= 0) {
      if (worldId == THRONE_MAP) { goalKind = GOAL_CHAIR; goalIndex = 0; return; }
      {
        int back = warpTowardMap(THRONE_MAP);
        if (back >= 0) { goalKind = GOAL_WARP; goalIndex = back; return; }
      }
    }
    printf("      the realm is yours: ten sigils at level %d, %d gold\n",
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
    /* The crown run is already carrying one of everything, so it has no
       errand at a counter - and sending it shopping sent it to the far end
       of the Stormlands instead of up the hill it was standing at. */
    wantShop = !crownRun;
    shopTries = 0;
    rearmed = 0;
    printf("    rung %d  %-22s at %-18s wants about %2d\n",
      at + 1, leaders[lead].name, leaders[lead].seat, want);
  }
  /* Empty hands. Gear wears through, and the rung's one trip to a counter is
     spent long before the sword that was bought on it snaps - so the seventh
     rung was fought, and won, with nothing in either hand, which is not a
     thing a player would ever have chosen to do. Go and buy another one.
     Once per rung: if the purse will not stretch to a weapon, asking again
     every frame turns the forge door into the revolving one all over again. */
  if (!you.WORN_WEAPON && !rearmed && you.gold >= 200) {
    rearmed = 1;
    wantShop = 1;
    shopTries = 0;
  }
  /* Under the weight of that fight: go and earn it - but only where the ground
     is worth walking. Standing in the snow outside your own front door killing
     level threes at level thirty-nine is not levelling, it is arithmetic, and a
     player would have gone somewhere harder. */
  grindMode = 0;
  if (you.level + 1 < want) {
    int here = groundBy[you.house][worldId];
    /* Grass with nothing in it is not a place to level up. King's Landing has
       cover all over it and no encounter rows at all - the capital is the one
       map whose crowd is so large there was no object memory left for roamers -
       so a run that went there to earn its ninth sigil stood in a hedge for
       nine million frames with six hundred thousand gold and level thirty-six. */
    if (here + 8 >= you.level && !badGround[worldId]
        && (world->ambushCount || world->wildCount)
        && findCover(&grindX, &grindY)) {
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
    if (wantShop && ++shopTries < 6) {
      int door = warpTowardTrade();
      if (door >= 0) { goalKind = GOAL_WARP; goalIndex = door; return; }
      wantShop = 0;
    }
    wantShop = 0;
  }
  if (worldId == leaders[lead].map) {
    who = leaderNpcOn(worldId, lead);
    if (who >= 0 && crowdAlive[who]) { goalKind = GOAL_NPC; goalIndex = who; return; }
  }
  ladderWants = leaders[lead].map;
  i = warpTowardMap(leaders[lead].map);
  if (i >= 0) { goalKind = GOAL_WARP; goalIndex = i; return; }
  /* No road, because there is no road: the fifth rung is on an island and the
     ninth is across a bay. A player takes a passage, and until now nothing in
     the tester did - so the back half of this game had never been played by
     anything at all, and every rung above the fourth was a guess. */
  {
    int sailor = sailorHere();
    int berth = berthToward(leaders[lead].map);
    if (sailor >= 0 && berth >= 0) { goalKind = GOAL_NPC; goalIndex = sailor; return; }
    i = warpTowardSails();
    if (i >= 0) { goalKind = GOAL_WARP; goalIndex = i; return; }
  }
  /* Falling back to wandering put the run in a two-door loop it walked
     thirty-five thousand times, so say so and stop rather than pretend to be
     busy. */
  printf("      lost: no road and no berth from %s to %s at level %d\n",
    world->name, leaders[lead].seat, you.level);
  hostFramesLeft = 0;
}

/* Is there anywhere across the water that still owes something, and can the
   fare be paid? */
static int portOwesWork(void) {
  int i, j;
  /* Getting off a beach costs nothing, and the cartridge means it: a map with
     no door on it waives the fare, because a purse spent fighting across such
     a place is the normal way to arrive at the far side of one. The tester was
     still applying the fare it would not be charged, so on Hardhome with a
     hundred and seventy-five gold it concluded there was nowhere it could
     afford to go, ran out of things to do, and ended the run standing there -
     which quietly cost the sweep a hundred maps of coverage. */
  int free = !world->warpCount;
  for (i = 0; i < PORT_COUNT; i++) {
    int m = ports[i].map;
    if (m == worldId) continue;
    if (!free && (int)ports[i].fare > you.gold) continue;
    /* And the seats. A beach waives the fare and waives nothing else: the
       captain refuses on the seats behind you whatever is in your purse, so a
       tester that only counted gold kept choosing berths it would be turned
       away from and lost the far side of the narrow sea entirely. */
    if ((int)ports[i].needs > countSigils()) continue;
    if (walkableTo(m)) continue;
    if (!mapDone(m)) return 1;
    for (j = 0; j < maps[m].warpCount; j++) if (!mapDone(maps[m].warps[j].to)) return 1;
  }
  /* And when there is no door at all, the boat is the only thing left to do
     whether or not anywhere else owes work: standing on a beach until the
     frames run out is not a playthrough. */
  return free;
}

/* The harbourmaster on this map, if there is one. Worth speaking to more than
   once: the passage list is a road, and a road does not stop existing because
   you have walked down it. */
static int sailorHere(void) {
  int i;
  for (i = 0; i < crowdCount; i++) if (world->npcs[i].sails && crowdAlive[i]) {
    /* The seats you had while you were actually stood in front of somebody who
       could take you somewhere. Counting the seats at the END of the run
       instead says a run that won its seventh sigil in the last minute, a
       thousand leagues from any harbour, was entitled to Volantis and simply
       did not bother -- which is a report about the frame budget wearing the
       costume of a report about the world. */
    if (countSigils() > seatsAtBerth) seatsAtBerth = countSigils();
    return i;
  }
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

  /* The chair, once it is yours and somebody is still waiting on it. Nothing
     else in the tester ever sits it, so without this the whole postgame is
     eighteen petitions nobody has ever read. */
  if (you.story >= 3 && world->courtX < 255 && petitionWaiting() >= 0) {
    goalKind = GOAL_CHAIR; goalIndex = 0; return;
  }

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
  else if (goalKind == GOAL_CHAIR) { *gx = world->courtX; *gy = world->courtY; }
  else { *gx = world->warps[goalIndex].x; *gy = world->warps[goalIndex].y; }
}

static void completeGoal(void) {
  if (goalKind == GOAL_NPC) {
    if (goalStage == 0) {
      /* Once each. The ladder run walks back to the same shopkeeper a dozen
         times, and counting every visit made the tally read "568 of 161". */
      if (!npcTalked[worldId][goalIndex]) talked++;
      npcTalked[worldId][goalIndex] = 1;
      /* Having been mended, ask him for a horse. */
      if (world->npcs[goalIndex].heals && ridesSeen < 40) {
        goalStage = 2;
        interacting = 0;
        return;
      }
      /* The keeper of the house. SELECT is the whole of the interaction -
         the evening, and later the grown child - and nothing else in a
         playthrough would ever press it here. */
      if (world->npcs[goalIndex].evening && eveningsSpent < 6) {
        goalStage = 2;
        interacting = 0;
        return;
      }
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
  else if (goalKind == GOAL_CHAIR) { courtsHeld++; }
  goalKind = GOAL_NONE;
}

/* ------------------------------------------------------------------ play -- */

/* Catch each interesting screen the first time the tester reaches it, so the
   pictures are of the game actually being played rather than of a route
   somebody wrote down and that the crowd has since wandered out of. */
static int caught[40];

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
  if (scene != SCENE_SHOP) shopHeld = 0;

  /* DRAGONS=1 hands the run three broken seats the moment it is in the world,
     because that is what wakes the dragons and a wandering run never climbs
     the ladder on its own. Without this no automated run would ever actually
     fight one - the clock was proven by the audit and the fight by nobody. */
  if (getenv("DRAGONS") && scene == SCENE_WORLD) {
    static int handed = 0;
    if (!handed) { handed = 1; sigils |= 7; }
  }

  /* Two things that happen inside the cartridge's own code and leave no other
     trace: an animal of yours going down while it was standing the fight, and
     a piece of your kit finally giving out. Both are watched from out here so
     the sweep can say whether either ever actually happened in a playthrough. */
  {
    static int wasOut = 0;
    static unsigned char hadWorn[WARE_KINDS];
    static int wornSeen = 0;
    int k;
    if (wasOut && !beastOut && MY_BEAST.hp <= 0) beastsFelled++;
    if (winterStage() > deepestWinter) deepestWinter = winterStage();
    { static int toldTo = 0;
      if (you.winterSaid > toldTo) { ravensRead++; toldTo = you.winterSaid; } }
    if (you.rangings > rangingsDone) rangingsDone = you.rangings;
    if (you.swoopsBeaten > townsSaved) townsSaved = you.swoopsBeaten;
    if (you.swoopsBurned > townsBurned) townsBurned = you.swoopsBurned;
    { static int hadEve = 0, hadKids = 0;
      if (you.eveAt && !hadEve) eveningsSpent++;
      hadEve = you.eveAt != 0;
      if (you.bastards > hadKids) { childrenBorn += you.bastards - hadKids; hadKids = you.bastards; }
    }
    { static int sworn = 0; int b, n = 0;
      for (b = 0; b < 3 && b < you.bastards; b++) if (you.bastTaken[b]) n++;
      if (n > sworn) { childrenSworn = n; sworn = n; } }
    wasOut = beastOut;
    if (wornSeen) {
      for (k = 0; k < WARE_KINDS; k++) {
        if (hadWorn[k] && !you.worn[k] && !you.bag[hadWorn[k] - 1]) gearBroke++;
      }
    }
    for (k = 0; k < WARE_KINDS; k++) hadWorn[k] = you.worn[k];
    wornSeen = 1;
    /* What you are wearing and what you are fighting with have to agree.
       The three numbers a duel uses are taken once, when it is readied, and
       anything that changed gear afterwards - putting armour on mid-fight,
       or a breastplate finally giving out - left them saying what you were
       worth before it happened. Armour you put on in a fight did nothing at
       all, and armour that broke went on protecting you. Neither showed. */
    if (scene == SCENE_DUEL && mine.guard != guardFor(you.level)) {
      finding("in a duel your guard is %d and what you have on is worth %d",
              mine.guard, guardFor(you.level));
    }
  }

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
    else if (scene == SCENE_STATUS) catchOnce(statusPage ? 35 : 3,
      statusPage ? "06b-where-you-stand" : "06-your-sigil");
    else if (scene == SCENE_SEAT) catchOnce(27, "08-your-own-house");
    else if (scene == SCENE_ARMS) catchOnce(26, "08b-your-own-arms");
    else if (scene == SCENE_BAG) catchOnce(4, "07-the-pouch");
    else if (scene == SCENE_CRAFT) catchOnce(24, craftAt ? "12b-at-the-anvil" : "11b-at-the-bench");
    else if (scene == SCENE_SHOP) {
      static const char *const SHELF_SHOT[4] = {
        "11-remedies", "12-arms", "12c-armour", "12d-oddments" };
      if (shopStall >= 0 && shopStall < 4) catchOnce(31 + shopStall, SHELF_SHOT[shopStall]);
    }
    else if (scene == SCENE_DUEL) {
      if (windowOpen && windowSays("Off them")) catchOnce(21, "21-what-they-carried");
      /* The star is up for twelve frames of a swing; catch it in the middle. */
      if (fxStar() == 2 && !fxOnMe) catchOnce(18, "18-the-blow-lands");
      else if (fxLean(1) > 8) catchOnce(19, "19-the-lunge");
      else if (duelPhase == DUEL_SPOILS && !spoilsDone() && shownExp > you.exp - 20)
        catchOnce(20, "20-the-rail-fills");
      else if (duelPhase == DUEL_PACK) catchOnce(28, "09b-who-comes-out");
      else if (beastOut && foeBeast >= 0 && !windowOpen)
        catchOnce(29, "09d-yours-against-a-wild-one");
      else if (beastOut && !windowOpen) catchOnce(30, "09c-yours-out-in-front");
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

  /* Nests were the thing that could not be proved by counting: an egg found is
     one window and an egg hatching is another, and a run that never saw either
     looked exactly like a run that never walked over a nest. */
  if (windowOpen) {
    if (windowSays("Half buried")) eggsFound = 1;
    if (windowSays("Dragon Egg")) dragonEgg = 1;
    if (windowSays("decides you will do")) eggsHatched = 1;
  }

  /* A cutscene has the screen. Read it, and answer when it asks: a run that
     walked over five scenes and never saw one would look exactly like a run
     that never walked over any. */
  /* And a petition, once the chair is yours: read it out, pick an answer, read
     what it cost. Nothing else in the tester ever answers one. */
  if (courtAsking) {
    if (roll(3) == 0 && courtPick < petitions[courtAt].count - 1) keys = tap(KEY_DOWN);
    else { keys = tap(KEY_A); if (keys) courtsAnswered++; }
    lastKeys = keys;
    REG_KEYINPUT = (unsigned short)(~keys & 0x03FF);
    frameNo++;
    return;
  }

  if (cutAt >= 0) {
    if (!cutSeen[cutAt]) { cutSeen[cutAt] = 1; cutsPlayed++; }
    if (cutAsking) {
      if (typeDone) { keys = tap(KEY_A); if (keys) cutsChosen++; }
    } else if (windowOpen) {
      keys = tap(KEY_A);
    }
    lastKeys = keys;
    REG_KEYINPUT = (unsigned short)(~keys & 0x03FF);
    frameNo++;
    return;
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
    /* The card has two pages and the tester only ever read the first, so the
       nine houses and the season were never once looked at by anything. */
    keys = (!statusPage && roll(2) == 0) ? tap(KEY_RIGHT) : tap(KEY_B);
  } else if (scene == SCENE_MENU) {
    menusSeen++;
    /* Look in the pouch about half the time, write the record now and then,
       and otherwise leave. */
    if (menuWant < 0) menuWant = (int)roll(MENU_ENTRIES);
    /* Leaving has to clear what it wanted too. Without this the first roll of
       "leave" sticks, and every menu after it is opened and shut again without
       the tester ever looking in the pouch. */
    if (menuWant == MENU_ENTRIES - 1) { keys = tap(KEY_B); if (keys) menuWant = -1; }
    else if (menuPick != menuWant) keys = tap(menuPick < menuWant ? KEY_DOWN : KEY_UP);
    else { keys = tap(KEY_A); if (keys) { if (menuWant == 6) records++; menuWant = -1; } }
  } else if (scene == SCENE_PARTY) {
    /* Read down whatever is at your heel, put a different one in front now and
       then, and go. */
    partiesSeen++;
    if (partyLooks < 3) { partyLooks++; keys = tap(KEY_DOWN); }
    else if (partyLooks == 3) { partyLooks++; keys = tap(KEY_A); if (keys) swaps++; }
    else { keys = tap(KEY_B); if (keys) partyLooks = 0; }
  } else if (scene == SCENE_SEAT) {
    /* Walk down the card pressing A on every line of it: take arms, try to buy
       whatever hall is underfoot, send for the rents, turn each office, and
       call for oaths. Every one of those is a line of the game that nothing
       else in the tester ever reaches. */
    housesSeen++;
    if (houseLooks < HOUSE_ROWS * 4) {
      /* A on every line, SELECT on every line as well, and then down one. The
         only line SELECT does anything on is the seat, and a feast is exactly
         the sort of thing nothing else in the tester would ever press. */
      int step = houseLooks - (houseLooks / 4) * 4;
      keys = step == 0 ? tap(KEY_A) : step == 1 ? tap(KEY_SELECT)
           : step == 2 ? tap(KEY_RIGHT) : tap(KEY_DOWN);
      if (keys) houseLooks++;
    } else { keys = tap(KEY_B); if (keys) houseLooks = 0; }
  } else if (scene == SCENE_ARMS) {
    /* Walk the four lines, change something on each, name the house, and take
       them. The interesting failure here is a shield drawn off the edge of the
       page or a charge index that runs past the end of the table. */
    armsSeen++;
    if (armsLooks < 8) { keys = (armsLooks & 1) ? tap(KEY_RIGHT) : tap(KEY_DOWN); if (keys) armsLooks++; }
    else if (armsLooks == 8) { keys = tap(KEY_A); if (keys) armsLooks++; }
    else { keys = tap(KEY_START); if (keys) armsLooks = 0; }
  } else if (scene == SCENE_RIDE) {
    /* Read the list, take a horse now and then, and go. A run that only ever
       walked would never once prove the horse puts you down somewhere you can
       stand - which is the only interesting thing about it. */
    ridesSeen++;
    if (rideLooks < 3) { rideLooks++; keys = tap(KEY_DOWN); }
    else if (rideLooks == 3 && rideCount() && you.gold >= rideCost()) {
      rideLooks++;
      keys = tap(KEY_A);
      if (keys) rodeTo++;
    } else { keys = tap(KEY_B); if (keys) rideLooks = 0; }
  } else if (scene == SCENE_DEEDS) {
    deedsSeen++;
    keys = tap(KEY_B);
  } else if (scene == SCENE_HOST) {
    /* Read the muster and go. There is nothing to press here but B. */
    mustersSeen++;
    keys = tap(KEY_B);
  } else if (scene == SCENE_HOLD) {
    /* Board what is at your heel, take it back out, and leave. Both ways round,
       because the interesting failure is the one where an animal goes in and
       does not come back. */
    kennelsSeen++;
    if (holdLooks == 0) { holdLooks++; keys = tap(KEY_LEFT); }
    else if (holdLooks == 1) { holdLooks++; keys = tap(KEY_A); if (keys) boarded++; }
    else if (holdLooks == 2) { holdLooks++; keys = tap(KEY_RIGHT); }
    else if (holdLooks == 3) { holdLooks++; keys = tap(KEY_A); if (keys) fetched++; }
    else { keys = tap(KEY_B); if (keys) holdLooks = 0; }
  } else if (scene == SCENE_BAG) {
    bagsSeen++;
    menuWant = -1;
    /* And against a person who is nearly finished, put a purse in front of them
       instead of a sword: a host is the other half of what a road is for, and a
       tester that never takes an oath has not walked that half. */
    oathWanted = -1;
    if (bagInDuel && foeBeast < 0 && foeDef && foeDef->sworn < SWORN_KINDS
        && hostRoom() >= 0 && theirs.hp * 4 < theirs.maxHp) {
      int have = pocketCount(bagPocket), i;
      for (i = 0; i < have; i++) {
        if (wares[nthInPocket(bagPocket, i)].kind == WARE_OATH) { oathWanted = i; break; }
      }
    }
    if (oathWanted >= 0) {
      if (bagPick != oathWanted) keys = tap(bagPick < oathWanted ? KEY_DOWN : KEY_UP);
      else { keys = tap(KEY_A); if (keys) oathsOffered++; }
    }
    else
    /* In a fight with an animal that is nearly down, reach for a net rather
       than for a drink: taking one alive is a whole half of the game and a
       tester that never throws one has not walked it. */
    if (bagInDuel && foeBeast >= 0 && theirs.hp * 3 < theirs.maxHp) {
      int have = pocketCount(bagPocket), want = -1, i;
      for (i = 0; i < have; i++) {
        if (wares[nthInPocket(bagPocket, i)].kind == WARE_SNARE) { want = i; break; }
      }
      if (want >= 0) {
        if (bagPick != want) keys = tap(bagPick < want ? KEY_DOWN : KEY_UP);
        else { keys = tap(KEY_A); if (keys) snaresThrown++; }
      } else keys = tap(KEY_B);
    }
    else keys = (carrying() && you.hp < vigourFor(you.level) && (roll(2) == 0))
      ? tap(KEY_A) : tap(KEY_B);
  } else if (scene == SCENE_SHOP) {
    /* A counter you cannot walk away from. The random walk always escaped the
       real one of these by luck - it flips shelves, and the trap was keyed to
       the shelf - so this is deliberate instead: a straight run of B presses,
       the way a person leaves a shop, and a finding if that does not work. */
    shopsSeen++;
    /* The counter asks how many now, for anything you can hold more than one
       of. A tester that does not know about the question answers it with the
       arrows - which change the number instead of the row - and stands at the
       counter forever. Say one and mean it. */
    if (shopMany) {
      keys = tap(KEY_A);
      if (keys) { bought++; }
      lastKeys = keys;
      REG_KEYINPUT = (unsigned short)(~keys & 0x03FF);
      return;
    }
    if (++shopHeld > 1200) {
      finding("a counter that %d frames of pressing B would not leave", shopHeld);
      shopHeld = 0;
    }
    if (shopHeld > 700) {
      keys = tap(KEY_B);
      lastKeys = keys;
      REG_KEYINPUT = (unsigned short)(~keys & 0x03FF);
      return;
    }
    if (shopStall >= 0 && shopStall < STALL_COUNT) shelfSeen[shopStall]++;
    /* And the smith's other trade, now it is on the shoulder. */
    if (!ladderMode && keeperMends() && roll(30) == 0) {
      keys = tap(KEY_SHOULDER_R);
      if (keys) {
        lastKeys = keys;
        REG_KEYINPUT = (unsigned short)(~keys & 0x03FF);
        return;
      }
    }
    /* Walk along the counter now and then, because three of the four shelves
       are otherwise never opened by anybody who is not already looking for
       them - which is exactly the complaint the shelves were built to fix. */
    if (!ladderMode && roll(4) == 0) {
      keys = tap(roll(2) ? KEY_RIGHT : KEY_LEFT);
      if (keys) {
        lastKeys = keys;
        REG_KEYINPUT = (unsigned short)(~keys & 0x03FF);
        return;
      }
    }
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
      /* The rows the counter is actually showing.
       *
       * A stall holds everything of its kind; the shelf shows only what this
       * far down the road is sold. Choosing out of the stall gave a row number
       * the cursor could never reach - row sixteen of a nine-row shelf - so the
       * run stood at the Storm's End counter with ten thousand gold pressing
       * DOWN against the end of the list, four rungs short of the throne. */
      const Stall *stall = &stalls[shopStall];
      int shelf = shelfCount(stall);
      int best = -1, i;
      for (i = 0; i < shelf; i++) {
        int at = shelfWare(stall, i);
        int had = wares[at].kind < WARE_KINDS ? you.worn[wares[at].kind] : 0;
        /* A counter will not sell you a second of anything that is not spent
           by using it, and a spare sword sits in the pouch unworn. So a run
           whose blade had snapped stood at the Storm's End counter choosing
           the bow it was already carrying and pressing A on it three hundred
           and forty thousand times: every refusal opens a window, and coming
           back through the window reset the tester's own patience. Ask for
           what the counter can actually sell. */
        if (wares[at].kind != WARE_POTION && wares[at].kind != WARE_SNARE
            && wares[at].kind != WARE_OATH && wares[at].kind != WARE_RELIC
            && wares[at].kind != WARE_STUFF && you.bag[at]) continue;
        if (wares[at].kind == WARE_POTION) { if (you.bag[at] >= 4) continue; }
        else if (wares[at].kind == WARE_SNARE) { if (you.bag[at] >= 3) continue; }
        else if (wares[at].kind == WARE_OATH) { if (you.bag[at] >= 2) continue; }
        else if (had && wares[had - 1].price >= wares[at].price) continue;
        if (wares[at].price > you.gold) continue;
        /* A net before anything else when there is none in the pouch. Buying
           the dearest thing on the counter is a reasonable way to shop and it
           meant a net was never once bought in a whole playthrough - the
           cheapest net is a hundred and fifty and the dearest sword is nine
           thousand - so the run threw no nets, took nothing alive, and the half
           of this game that is about animals went untested. */
        if (wares[at].kind == WARE_SNARE && !you.bag[at]) { best = i; break; }
        if (best < 0 || wares[shelfWare(stall, best)].price < wares[at].price) best = i;
      }
      /* Asking the same counter for the same thing over and over is not
         shopping, and until now the run only ever said so in the report it
         printed after the frames had run out - by which point it had pressed
         A on one bow three hundred and forty thousand times. A sale always
         takes gold, so gold that has not moved is a counter that has not
         sold. Say so while there are still frames left, and walk out. */
      if (best >= 0) {
        int at = shelfWare(stall, best);
        if (at != askedFor || you.gold != askedGold) {
          askedFor = at; askedGold = you.gold; askedTimes = 0;
        }
        if (++askedTimes > 40) {
          finding("a counter asked %d times for %s and never sold one",
            askedTimes, wares[at].name);
          askedFor = -1;
          best = -1;
        }
      }
      if (best < 0) keys = tap(KEY_B);
      else if (shopPick != best) keys = tap(shopPick < best ? KEY_DOWN : KEY_UP);
      else {
        keys = tap(KEY_A);
        if (keys) { bought++; boughtOf[shelfWare(stall, best)]++; }
      }
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
  } else if (scene == SCENE_TALE) {
    /* The last act reads itself. Nothing to decide, so hold A and let it. */
    talesSeen++;
    keys = tap(KEY_A);
  } else if (scene == SCENE_YARD) {
    /* Four hulls on the stocks. Buy the best one the purse will carry and get
       off the quay: a run that only ever looks at the list has not tested that
       the money comes off, the hull goes on, or that the man lets go of you
       afterwards. Nothing here moves the player, so it is safe to buy.
     *
     * Better than what is under you, not merely different. The stocks are
     * listed cheapest first, and taking the last affordable row meant a run
     * that owned the cog and could not yet afford the longship traded down to
     * the skiff, then back to the cog, then down again - burning half the
     * price each way and going to sea in the worst hull it had ever owned.
     * And a hull at nought is a run that cannot sail at all, so mending comes
     * before buying: the last row on the list is the one that keeps the game
     * finishable. */
    int want = -1, i;
    yardsSeen++;
    if (ownShip() && mendCost() && you.gold >= mendCost()) want = HULL_COUNT;
    else for (i = ownShip() ? you.shipKind + 1 : 0; i < HULL_COUNT; i++) {
      if ((int)hulls[i].price - tradeIn() <= you.gold) want = i;
    }
    if (++yardHeld > 900) {
      finding("a shipwright that %d frames of pressing B would not leave", yardHeld);
      yardHeld = 0;
      want = -1;
    }
    if (want < 0 || yardHeld > 500) keys = tap(KEY_B);
    else if (yardPick != want) keys = tap(yardPick < want ? KEY_DOWN : KEY_UP);
    else { keys = tap(KEY_A); if (keys) { hullsBought++; yardHeld = 0; } }
  } else if (scene == SCENE_LAND) {
    /* What is for sale. Buy the one this seller actually has if the purse will
       carry it, then walk out. A run that only ever reads the list has not
       tested that the gold comes off, the deed goes on, or that the room on the
       other side is somewhere you can stand and somewhere you can leave. */
    int want = -1, i;
    landsSeen++;
    for (i = 0; i < DEED_COUNT; i++) {
      if (!ownsLand(i) && i == landSeller && you.gold >= (int)deeds[i].price) want = i;
    }
    /* And once one is bought, go and stand in it. */
    if (want < 0) {
      for (i = 0; i < DEED_COUNT; i++) if (ownsLand(i) && i == landSeller) want = i;
    }
    if (++landHeld > 900) {
      finding("a deed-seller that %d frames of pressing B would not leave", landHeld);
      landHeld = 0;
      want = -1;
    }
    if (want < 0 || landHeld > 500) keys = tap(KEY_B);
    else if (landPick != want) keys = tap(landPick < want ? KEY_DOWN : KEY_UP);
    else {
      keys = tap(KEY_A);
      if (keys) { if (!ownsLand(want)) deedsBought++; else roomsSeen++; landHeld = 0; }
    }
  } else if (scene == SCENE_SEA) {
    /* Somebody has come over the horizon. Go in bow-first every time and read
       whatever comes of it: what is being tested is that the fight ends and
       hands the player back, not that the tester picks well. */
    if (wasScene != SCENE_SEA) { seaFights++; seaHeld = 0; }
    if (++seaHeld > 1200) {
      finding("a fight at sea that %d frames of pressing A would not finish", seaHeld);
      seaHeld = 0;
    }
    if (seaPick != 0) keys = tap(KEY_UP);
    else keys = tap(KEY_A);
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
    /* A climb knows where it is going, so it takes the berth that lands
       nearest - not the one that owes a surveyor a room. */
    if (ladderMode && ladderWants >= 0 && !walkableTo(ladderWants)) {
      want = berthToward(ladderWants);
      if (want >= 0) {
        if (portPick != want) keys = tap(portPick < want ? KEY_DOWN : KEY_UP);
        else { keys = tap(KEY_A); if (keys) { sailed++; goalKind = GOAL_NONE; } }
        return;
      }
      want = -1;
    }
    /* Somewhere there is no road to, that still owes something.
       "Somewhere new" was not enough: a city across the sea is a dead end on
       the door graph, so sailing there once, walking out through the sea gate
       and never opening the one door in it left four rooms unvisited for a
       whole sweep. "Anywhere unfinished" was too much: three of the berths are
       on the same coast and the tester spent the run sailing between them
       rather than walking. It is both - and only once this map is finished,
       because leaving in the middle of somewhere is how the first one
       happened. */
    /* The same waiver the cartridge gives: a map with no door on it charges
       nothing to leave. Applying a fare here that will not be charged is what
       left the run standing on Hardhome with the passage list open and every
       berth greyed out in its own head. */
    for (i = 0; i < PORT_COUNT && want < 0; i++) {
      int m = ports[i].map;
      if (m == worldId) continue;
      if (world->warpCount && (int)ports[i].fare > you.gold) continue;
      if ((int)ports[i].needs > countSigils()) continue;
      if (walkableTo(m)) continue;
      if (!mapDone(m)) { want = i; continue; }
      for (j = 0; j < maps[m].warpCount; j++) {
        if (!mapDone(maps[m].warps[j].to)) { want = i; break; }
      }
    }
    (void)j;
    /* And if there is nowhere that owes work, a beach is still not somewhere to
       stand until the frames run out: take any berth at all rather than none. */
    if (want < 0 && !world->warpCount) {
      for (i = 0; i < PORT_COUNT && want < 0; i++) {
        if (ports[i].map == worldId || (int)ports[i].needs > countSigils()) continue;
        want = i;
      }
    }
    /* Your own keel, when there is one and there is water off this quay. It
       sits above the paid berths at -1. Nothing else in the tester ever puts
       out, so without this the five open seas are ground the cartridge holds
       and no run has ever stood on. */
    if (canPutToSea() && want < 0) {
      if (portPick != -1) keys = tap(KEY_UP);
      else { keys = tap(KEY_A); if (keys) { putToSeaCount++; goalKind = GOAL_NONE; } }
    }
    else if (want < 0) keys = tap(KEY_B);
    else if (portPick != want) keys = tap(portPick < want ? KEY_DOWN : KEY_UP);
    else { keys = tap(KEY_A); if (keys) { sailed++; goalKind = GOAL_NONE; } }
  } else if (scene == SCENE_DUEL) {
    duelMap = worldId;
    if (wasScene != SCENE_DUEL) {
      if (getenv("DBG")) {
        printf("      duel: foeId %d beast %d level %d (you %d, story %d, hp %d)\n",
          foeId, foeBeast, foeLevel, you.level, you.story, you.hp);
      }
      if (foeBeast >= 0) wildsMet++;
      /* Something that was already dead, and whether it was met somewhere the
         encounter table for that road never mentioned one - which is the whole
         of what the winter does to the map. */
      if (foeBeast >= 0 && beasts[foeBeast].dead) {
        deadMet++;
        if (world && world->cold < 5) deadSouth++;
      }
      if (foeBeast == BEAST_DRAKE || foeBeast == BEAST_WYRM) dragonsMet++;
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
      /* And send one of yours out when there is one to send, or whistle it
         back once it has taken enough. */
      if (want == 0 && beastOut && yours.hp * 3 < yours.maxHp) want = 2;
      else if (want == 0 && !beastOut && packHave() && (roll(3) == 0)) want = 2;
      if ((want & 1) != (topPick & 1)) keys = tap((want & 1) ? KEY_RIGHT : KEY_LEFT);
      else if ((want & 2) != (topPick & 2)) keys = tap((want & 2) ? KEY_DOWN : KEY_UP);
      else keys = tap(KEY_A);
      if (++duelTries > 900) { finding("a duel that would not end"); duelTries = 0; }
    }
    else if (duelPhase == DUEL_PACK) {
      /* Send out the healthiest one that is not already standing there; if
         there is nothing to send, back out rather than sitting on the list. */
      int want = -1, i2, best = 0;
      for (i2 = 0; i2 < PARTY_MAX; i2++) {
        const Kept *k2 = &you.party[i2];
        if (k2->kind == 255 || k2->hp <= 0) continue;
        if (beastOut && i2 == you.lead) continue;
        if (k2->hp > best) { best = k2->hp; want = i2; }
      }
      if (want < 0) keys = tap(KEY_B);
      else if ((want & 1) != (packPick & 1)) keys = tap((want & 1) ? KEY_RIGHT : KEY_LEFT);
      else if (packPick < want) keys = tap(KEY_DOWN);
      else if (packPick > want) keys = tap(KEY_UP);
      else { keys = tap(KEY_A); if (keys) beastsSentOut++; }
      if (++duelTries > 900) { finding("a pack list that would not close"); duelTries = 0; }
    }
    else if (duelPhase == DUEL_MENU) {
      /* On the ladder, swing the hardest thing in your hands rather than a
         random one: this run is meant to measure the game, not the dice. The
         crown run fights the same way, because the champion at the top of the
         game is a real fight, and a tester swinging at random lost it thirteen
         times in a row on one seed and ran the frame budget out standing in
         the Red Keep. */
      if (ladderMode || crownRun) {
        int best = 0, i, score = -1;
        for (i = 0; i < 4; i++) {
          const Tech *t = &techniques[nearSide()->tech[i]];
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
        if (!(world->ambushCount || world->wildCount)
            || !findCover(&grindX, &grindY)) {
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
        } else if (goalKind == GOAL_CHAIR) {
          finding("%s: could not reach the chair at %d,%d", world->name, gx, gy);
          you.story = 2;                          /* stop trying to sit it */
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
          } else if (goalStage == 2) {
            /* A maester. SELECT at one asks about a horse, which is the only
               way into the ride list and so the only way it is ever tested. */
            keys = tap(KEY_SELECT);
            if (keys) interacting = 1;
          } else {
            keys = tap(KEY_A);
            if (keys) interacting = 1;
          }
        } else if (hx == gx && hy == gy && goalKind != GOAL_WARP) {
          /* A door can put you down on the very thing it sent you to: the
             stair into the Iron Vault lands you standing on its sign. There
             is no tile to face it from until you step off it, so step off. */
          for (i = 0; i < 4; i++) {
            int nx = hx + DIR_X[i], ny = hy + DIR_Y[i];
            if (nx < 0 || ny < 0 || nx >= world->w || ny >= world->h) continue;
            if (solidAt(nx, ny) || ledgeAt(nx, ny)) continue;
            if (occupied(nx, ny, -1) || warpHere(nx, ny)) continue;
            keys = KEYS[i];
            blocked = 0;
            break;
          }
        } else {
          dir = stepToward(sx, sy);
          if (dir >= 0) { keys = KEYS[dir]; blocked = 0; }
          else if (++blocked < 900) {
            keys = 0;      /* somebody is in the doorway; wait for them to move */
          } else {
            blocked = 0;
            /* Whether that is a fault depends on the ground, not on the walk.
               A goal with somewhere open to stand beside it is one the player
               can reach and this run could not -- a body on a one-tile bridge
               in a canal city will do it, and Braavos is nothing but one-tile
               bridges. A goal with nowhere at all beside it is a fault in the
               world, and stays a finding. */
            {
              int k3, open = 0;
              for (k3 = 0; k3 < 4; k3++) {
                int nx = gx + DIR_X[k3], ny = gy + DIR_Y[k3];
                if (nx < 0 || ny < 0 || nx >= world->w || ny >= world->h) continue;
                if (solidAt(nx, ny) || ledgeAt(nx, ny) || warpHere(nx, ny)) continue;
                open = 1; break;
              }
              if (open) {
                printf("      never got to: %s %d,%d, which has open ground "
                       "beside it\n", world->name, gx, gy);
              } else {
                finding("%s: no way through to %d,%d", world->name, gx, gy);
              }
            }
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
    /* Ground that keeps beating you is not ground to level up on.
     *
     * The ninth sigil is taken at Winterfell, and by the ninth sigil the
     * Long Night is on the whole of the North: the run stood in the same
     * snow it had trained in at level nine and lost eleven thousand eight
     * hundred fights in a row, a third of the purse each time, until it was
     * level forty with three gold and a hunting knife. Losing is meant to
     * cost - it is the lesson - but a player takes the lesson after the
     * third one and walks somewhere else. So does this now. */
    if (duelMap >= 0 && duelMap < MAP_COUNT) {
      if (mine.hp <= 0) {
        if (++lostHere[duelMap] >= 5 && !badGround[duelMap]) {
          badGround[duelMap] = 1;
          if (ladderMode) {
            printf("      %s is beating you: five in a row, going elsewhere\n",
              maps[duelMap].name);
          }
        }
      } else if (theirs.hp <= 0) lostHere[duelMap] = 0;
    }
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
  if (frameNo > frameCap) {
    finding("the playthrough ran out of frames in %s: scene %d, goal %d/%d, "
            "stage %d, %d frames on it, window %d, phase %d, at %d,%d",
            world ? world->name : "nowhere", scene, goalKind, goalIndex, goalStage, goalFrames,
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
  /* CROWN=1: the last act, on its own.
     The wandering sweep never collects nine sigils and the directed climb is a
     day and a half of frames, so neither of them ever reaches the end of the
     story - which meant the whole of it was written and none of it had ever
     run. This starts a game one door from the Red Keep with the nine seats
     already bent, so the gate, the queen, her champion, the chair and the
     crowning are all played through in a couple of minutes. */
  if (getenv("CROWN")) {
    Record r;
    unsigned k;
    int i;
    titleWant = 0;                              /* take the record up */
    for (k = 0; k < sizeof r; k++) ((unsigned char *)&r)[k] = 0;
    r.magic = RECORD_MAGIC;
    r.house = (u8)house;
    r.level = 44;
    r.worldId = (u8)THRONE_GATE_MAP;
    r.dir = 0;
    r.x = (u8)THRONE_GATE_X; r.y = (u8)THRONE_GATE_Y;
    r.sigils = (u16)((1u << (LEADER_COUNT - 1)) - 1u);   /* nine of ten */
    { int q; for (q = 0; q < PARTY_MAX; q++) r.partyKind[q] = 255; }
    r.haven = NO_MAP;
    r.exp = (unsigned)expForLevel(44);
    r.gold = 40000; r.hp = 9999; r.kills = 200;
    /* Dressed for it: the best of everything the road can hand over - and
       actually wearing it, whole. The record used to carry one of everything
       and wear none of it, so the champion fight at the top of the game was
       measured bare-handed and won on luck; and once steel could wear out, a
       worn slot with no life written next to it broke on the first blow. */
    for (i = 0; i < WARE_COUNT; i++) if (wares[i].kind != WARE_STUFF) r.bag[i] = 1;
    { int k2, best[WARE_KINDS];
      for (k2 = 0; k2 < WARE_KINDS; k2++) best[k2] = -1;
      for (i = 0; i < WARE_COUNT; i++) {
        int kd = wares[i].kind;
        if (kd != WARE_WEAPON && kd != WARE_ARMOUR && kd != WARE_SHIELD
            && kd != WARE_HELM && kd != WARE_GLOVES) continue;
        if (best[kd] < 0 || wares[i].price > wares[best[kd]].price) best[kd] = i;
      }
      for (k2 = 0; k2 < WARE_KINDS; k2++) {
        if (best[k2] < 0) continue;
        r.worn[k2] = (u8)(best[k2] + 1);
        r.wear[k2] = (u16)gearLife(best[k2]);
      }
    }
    r.sum = tally(&r);
    for (k = 0; k < sizeof r; k++) hostSram[k] = ((unsigned char *)&r)[k];
    crownRun = 1;
    /* Nine sigils in hand means the ladder has exactly one rung left, so the
       directed climb walks straight at it instead of wandering the capital. */
    ladderMode = 1;
  }

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
    { int q; for (q = 0; q < PARTY_MAX; q++) r.partyKind[q] = 255; }
    r.haven = NO_MAP;
    r.exp = (unsigned)expForLevel(14) + 40;
    r.gold = 1180; r.hp = 140; r.kills = 9;
    r.sum = tally(&r);
    for (k = 0; k < sizeof r; k++) hostSram[k] = ((unsigned char *)&r)[k];
  }
  hostFramesLeft = FRAME_CAP + 8;
  if (getenv("FRAMES")) { frameCap = atoi(getenv("FRAMES")); hostFramesLeft = frameCap + 8; }
  wantHouse = house;
  if (getenv("SEED")) seed = (unsigned)atoi(getenv("SEED"));
  if (getenv("STORY")) { storyEvery = atoi(getenv("STORY")); storyFor = storyEvery * 40; }
  if (getenv("GRIND")) { grindMode = 1; hostFramesLeft = atoi(getenv("GRIND")); }
  if (getenv("LADDER")) ladderMode = 1;
  if (argc > 2) { shooting = 1; outDir = argv[2]; }

  gba_main();

  /* Which maps the seats this run earned actually entitle it to see.
   *
   * The throne room has been excused on exactly this reasoning since it was
   * written: a wandering run does not collect nine sigils, so a shut door is
   * the game working rather than a fault. The ferry is gated the same way now
   * -- with four seats behind you no captain will carry you to Meereen -- so
   * Meereen, and everything behind Meereen's own doors, needs the same excuse
   * for the same reason. Without it a sweep that behaved perfectly reported
   * sixty-six holes in the world.
   *
   * Everything the run did reach is entitled by definition; so is any berth
   * it held the seats for; so is anything either of those opens a door onto.
   * What is left outside that closure is ground the game meant to keep shut. */
  {
    int q[MAP_COUNT], head = 0, tail = 0, j, s, k;
    for (i = 0; i < MAP_COUNT; i++) {
      entitled[i] = (unsigned char)(mapSeen[i] != 0);
      if (entitled[i]) q[tail++] = i;
    }
    for (i = 0; i < PORT_COUNT; i++) {
      int m = ports[i].map;
      if ((int)ports[i].needs > seatsAtBerth) continue;
      if (m >= 0 && m < MAP_COUNT && !entitled[m]) { entitled[m] = 1; q[tail++] = m; }
    }
    while (head < tail) {
      int a = q[head++];
      for (j = 0; j < maps[a].warpCount; j++) {
        int b = maps[a].warps[j].to;
        if (b >= 0 && b < MAP_COUNT && !entitled[b]) { entitled[b] = 1; q[tail++] = b; }
      }
      /* And the water off this shore. Nothing in the world warps onto a sea --
         you put out from a quay in a hull you bought -- so a sea is open the
         moment any coast on it is, and the quays are written on the sea's own
         side, which is why this reads them backwards. */
      for (s = 0; s < MAP_COUNT; s++) {
        if (!maps[s].sea || entitled[s]) continue;
        for (k = 0; k < maps[s].warpCount; k++) {
          if (maps[s].warps[k].to != a) continue;
          entitled[s] = 1; q[tail++] = s; break;
        }
      }
    }
    /* And the same walk again with every gate wide open: what a player who
       held all nine seats could get to. Three verdicts, and each of them says
       something different and true. Nothing leads here at all is a hole in the
       world; the seats did not open it is the gate working; and everything
       else is a gap in this one walk, which is a fact about the frame budget
       and not about the map table. */
    head = tail = 0;
    for (i = 0; i < MAP_COUNT; i++) anyRoad[i] = (unsigned char)(mapSeen[i] != 0);
    for (i = 0; i < PORT_COUNT; i++) {
      int m = ports[i].map;
      if (m >= 0 && m < MAP_COUNT) anyRoad[m] = 1;
    }
    /* A room you have bought is not reached on foot and never will be: the way
       in is the deed, bought in front of the person selling it, which is a
       door no warp records. */
    for (i = 0; i < DEED_COUNT; i++) {
      int m = deeds[i].map;
      if (m >= 0 && m < MAP_COUNT) anyRoad[m] = 1;
    }
    for (i = 0; i < MAP_COUNT; i++) if (anyRoad[i]) q[tail++] = i;
    while (head < tail) {
      int a = q[head++];
      for (j = 0; j < maps[a].warpCount; j++) {
        int b = maps[a].warps[j].to;
        if (b >= 0 && b < MAP_COUNT && !anyRoad[b]) { anyRoad[b] = 1; q[tail++] = b; }
      }
      for (s = 0; s < MAP_COUNT; s++) {
        if (!maps[s].sea || anyRoad[s]) continue;
        for (k = 0; k < maps[s].warpCount; k++) {
          if (maps[s].warps[k].to != a) continue;
          anyRoad[s] = 1; q[tail++] = s; break;
        }
      }
    }
  }
  for (i = 0; i < MAP_COUNT; i++) {
    if (mapSeen[i]) seenMaps++;
    /* The throne room is meant to be shut. A wandering run does not collect
       nine sigils, so not reaching it is the game working rather than a fault -
       the LADDER run is what proves that door opens. */
    else if (i == THRONE_MAP && countSigils() < LEADER_COUNT - 1) seenMaps++;
    /* A directed climb goes where the ladder sends it and nowhere else, so
       what it did not visit is not a fault in the world. Only the wandering
       sweep is a coverage check. */
    /* Nothing anywhere leads here: not a door in the world, not a berth. That
       is a hole in the map table and it is a fault whatever any one run did. */
    else if (!anyRoad[i]) finding("%s is never reachable on foot", maps[i].name);
    else if (ladderMode) seenMaps += 0;
    /* Behind a gate this run never earned the right to open. */
    else if (!entitled[i]) seenMaps++;
    else {
      /* "Never reachable on foot" and "never got round to" are not the same
         sentence, and only one of them is a fault in the world. Braavos has a
         door onto the House of Black and White; a sweep that stood in Braavos,
         did not open it, and then reported the place unreachable was saying
         something untrue about a map that is fine. What has a door from ground
         the run stood on is a gap in the walk; what has a door from nowhere at
         all is a gap in the world, and that is still a finding. */
      seenMaps++;
      printf("      never opened: %s, which has a door from ground the run "
             "walked on\n", maps[i].name);
    }
    totalNpcs += maps[i].npcCount;
    totalSigns += maps[i].signCount;
  }

  printf("\n  played %d frames, about %d minutes of real play\n", frameNo, frameNo / 3600);
  printf("  maps reached   %d of %d\n", seenMaps, MAP_COUNT);
  printf("  people spoken  %d of %d\n", talked, totalNpcs);
  /* And who, by name. "524 of 533" every single run is nine people standing
     somewhere nobody can get to, and the report never said which nine, so
     nobody ever went and looked. */
  if (talked < totalNpcs) {
    int m, k, shown = 0;
    printf("      never reached:");
    for (m = 0; m < MAP_COUNT && shown < 14; m++) {
      int n = maps[m].npcCount > MAX_CROWD ? maps[m].npcCount : maps[m].npcCount;
      if (n > MAX_CROWD) n = MAX_CROWD;
      if (!mapSeen[m]) continue;
      for (k = 0; k < n && shown < 14; k++) {
        if (npcTalked[m][k]) continue;
        printf(" %s at %s(%d,%d);", maps[m].npcs[k].name[0] ? maps[m].npcs[k].name : "somebody",
          maps[m].name, maps[m].npcs[k].x, maps[m].npcs[k].y);
        shown++;
      }
    }
    printf("\n");
  }
  printf("  signs read     %d of %d\n", signs, totalSigns);
  if (signs < totalSigns) {
    int m, k, shown = 0;
    printf("      never read:");
    for (m = 0; m < MAP_COUNT && shown < 8; m++) {
      if (!mapSeen[m]) continue;
      for (k = 0; k < maps[m].signCount && k < 8 && shown < 8; k++) {
        if (signRead[m][k]) continue;
        printf(" %s(%d,%d);", maps[m].name, maps[m].signs[k].x, maps[m].signs[k].y);
        shown++;
      }
    }
    printf("\n");
  }
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
  printf("  the stocks     %d visits, %d hulls bought, put to sea %d, %d fought at sea\n",
    yardsSeen, hullsBought, putToSeaCount, seaFights);
  printf("  what is for sale  %d visits, %d deeds bought, %d walked into\n",
    landsSeen, deedsBought, roomsSeen);
  printf("  the last act   %d pages read, story at %d\n", talesSeen, you.story);
  printf("  the party card %d visits, %d sent out in front\n", partiesSeen, swaps);
  if (crownRun && you.story < 3) {
    finding("the last act stopped at stage %d: the chair was never taken", you.story);
  }
  printf("  spotted on the road %d times\n", spottings);
  printf("  menus / pouch / stalls  %d / %d / %d, bought %d things, saved %d times\n",
    menusSeen, bagsSeen, shopsSeen, bought, records);
  printf("  benches        %d looked at, %d things made\n", craftsSeen, crafted);
  printf("  the wild       %d animals met, %d nets thrown, %d taken alive\n",
    wildsMet, snaresThrown, you.tamed);
  printf("  the pack       %d sent out in a fight, %d went down standing it\n",
    beastsSentOut, beastsFelled);
  printf("  the long night deepest %s, %d of the dead met (%d of them south "
    "of the Wall), %d ravens\n",
    seasonWord(), deadMet, deadSouth, ravensRead);
  printf("  the watch      %d rangings finished, %d still out (%d of %d down)\n",
    rangingsDone, you.rangeWant ? 1 : 0, you.rangeGot, you.rangeWant);
  printf("  the dragons    %d met on the road, %d towns saved, %d burned%s\n",
    dragonsMet, townsSaved, townsBurned,
    you.swoopMap != NO_MAP ? ", one still settled" : "");
  printf("  the red lamp   %d evenings, %d children born, %d grown and sworn\n",
    eveningsSpent, childrenBorn, childrenSworn);
  {
    int st, unread = 0;
    for (st = 0; st < STALL_COUNT; st++) if (!shelfSeen[st]) unread++;
    printf("  the counter    %d of %d shelves read, %d pieces of kit worn out\n",
      STALL_COUNT - unread, STALL_COUNT, gearBroke);
    for (st = 0; st < WARE_KINDS; st++) {
      int at = you.worn[st];
      if (!at) continue;
      printf("  your kit       %s, %d of %d left (%s)\n", wares[at - 1].name,
        you.wear[st], gearLife(at - 1), conditionWord(st));
    }
  }
  {
    int b, top = -1;
    for (b = 0; b < WARE_COUNT; b++) {
      if (top < 0 || boughtOf[b] > boughtOf[top]) top = b;
    }
    if (top >= 0 && boughtOf[top] > 40) {
      printf("  counter        pressed A on %s %d times, which is not shopping\n",
        wares[top].name, boughtOf[top]);
    }
  }
  printf("  scenes         %d of %d played, %d answered, log opened %d times\n",
    cutsPlayed, CUT_COUNT, cutsChosen, deedsSeen);
  /* And why the rest did not. A scene fires when you stand on one named tile of
     one named map with its gates open, so there are exactly two ways to miss
     one: the gates were shut, or you never stood on the tile. Which of the two
     it is decides whether the story is gated wrongly or simply hidden in a
     corner, and guessing between them is how you fix the wrong one. */
  {
    int c2, shutOut = 0, neverStood = 0, wrongMap = 0;
    for (c2 = 0; c2 < CUT_COUNT; c2++) {
      if (flagSet(cuts[c2].flag)) continue;
      if ((cuts[c2].needs != 255 && !flagSet(cuts[c2].needs))
          || countSigils() < cuts[c2].sigils) { shutOut++; continue; }
      if (!mapSeen[cuts[c2].map]) { wrongMap++; continue; }
      neverStood++;
    }
    printf("  scenes missed  %d still gated, %d on a map never walked, "
           "%d walked past on the map itself\n", shutOut, wrongMap, neverStood);
    if (getenv("SCENES")) {
      for (c2 = 0; c2 < CUT_COUNT; c2++) {
        const char *why;
        if (flagSet(cuts[c2].flag)) continue;
        if (cuts[c2].needs != 255 && !flagSet(cuts[c2].needs)) why = "waiting on an earlier scene";
        else if (countSigils() < cuts[c2].sigils) why = "not enough seats yet";
        else if (!mapSeen[cuts[c2].map]) why = "never went to the map";
        else why = "walked the map, missed the tile";
        printf("      %-22s %-20s %s\n", cuts[c2].name, maps[cuts[c2].map].name, why);
      }
    }
  }
  printf("  nests          %s found, %s hatched, dragon egg %s\n",
    eggsFound ? "an egg" : "nothing", eggsHatched ? "one" : "none",
    dragonEgg ? "yes" : "not this run");
  printf("  the kennels    %d visits, %d boarded, %d fetched, %d still there\n",
    kennelsSeen, boarded, fetched, holdCount());
  if (you.story >= 3 || courtsHeld) {
    printf("  the court       %d sittings, %d answered, %d of %d petitions heard, "
           "realm %d, treasury %d\n",
      courtsHeld, courtsAnswered, courtCount(), PETITION_COUNT, crown.steady, you.gold);
    if (crownRun && !courtsAnswered) {
      finding("the chair was taken and not one petition was ever heard");
    }
    {
      /* And whether the crowning had anything to say about how you got here. */
      int k, with = 0, against = 0;
      for (k = 0; k < HOUSE_COUNT; k++) {
        if (favour[k] >= 25) with++;
        if (favour[k] <= -25) against++;
      }
      printf("      %d houses stood for it, %d stayed away\n", with, against);
    }
  }
  {
    /* Where the nine ended up, which is the whole of what a run of choices and
       a few hundred dead men adds up to. */
    int k;
    printf("  the nine       ");
    for (k = 0; k < HOUSE_COUNT; k++) {
      printf("%s %d%s", houses[k].name, favour[k], k == HOUSE_COUNT - 1 ? "\n" : "  ");
    }
  }
  printf("  the road       %d ride lists read, %d horses taken, %d halls to ride to\n",
    ridesSeen, rodeTo, rideCount());
  printf("  your swords    %s\n", seat.warLive ? maps[seat.warMap].name
                                                : "at home, or nowhere to send them");
  printf("  your own house %d cards read, %d arms screens, arms %s, seat %s\n",
    housesSeen, armsSeen, you.arms ? "taken" : "none",
    seat.has ? maps[seat.map].name : "none");
  printf("  the host       %d musters read, %d purses offered, %d sworn\n",
    mustersSeen, oathsOffered, hostCount());
  if (MY_BEAST.kind != 255) {
    int q;
    printf("  at your heel   %s, level %d\n", beasts[MY_BEAST.kind].name, MY_BEAST.level);
    printf("  the party      ");
    for (q = 0; q < PARTY_MAX; q++) {
      if (you.party[q].kind == 255) continue;
      printf("%s%s lv%d", q == you.lead ? "*" : "",
        beasts[you.party[q].kind].name, you.party[q].level);
      printf("  ");
    }
    printf("\n");
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
