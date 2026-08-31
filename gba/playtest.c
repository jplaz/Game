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
/* How many frames of walking at somebody have gone nowhere, kept per person
   so it is not thrown away every time the run leaves the room. */
static unsigned short npcTries[MAP_COUNT][MAX_CROWD];
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
  if (scene < 0 || scene > SCENE_HIRE) finding("scene is %d, which is not a scene", scene);
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
      if (getenv("WHYWALL")) {
        static int said = 0;
        if (said++ < 3) {
          printf("      [wall] f%d on %s at %d,%d scene %d haven %d berth %d "
                 "story %d house %d\n", frameNo, world->name, hx, hy,
            scene, you.haven, (int)you.berthMap, you.story, you.house);
        }
      }
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

/* Whether to walk around the grass rather than through it.
 *
 * Every step into cover is a roll for whatever is living in it, and once the
 * dead have reached a road that is most of what is living in it. A player who
 * has just been carried home twice walks the bare tiles. Nothing in here did:
 * the route out of Winterfell went straight through the hedges by the gate,
 * so the run was jumped, lost, woke where it started, and set off through the
 * same hedges again, eight thousand times. */
static int dodgeCover;

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
      if (dodgeCover && coverAt(nx, ny) && !(nx == gx && ny == gy)) continue;
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
/* Trips out of one fight into a menu and back, and the foe's health when the
   last one started. A fight nobody is landing a blow in is not a fight. */
static int pouchTrips, wasFoeHp = -1;
static int wantHouse, runAway, statusChecks, sinceStatus, wantTech, techUsed[4];
static int menusSeen, bagsSeen, shopsSeen, bought, records, menuWant = -1;
static int mustersSeen, kennelsSeen, holdLooks, boarded, fetched, oathsOffered;
/* Campaigns actually put in the field, and rangings actually taken up. */
static int warsSent, rangesTaken, sworeIn, hostLost;
/* The sellsword halls of the Free Cities, and who was taken on in them. */
static int hiresSeen, companiesHired, hireHeld;
/* Trips made to a counter for a purse, so the errand cannot become the run. */
static int oathTrips;
/* Doors taken since the run last did a thing worth doing, and which door it
   was, so a two-map circle can be broken where it is made. */
static int doorsSinceWork, wasTalked, wasSigns, lastDoorMap = -1, lastDoorIndex = -1;
static int circlesBroken;
static const char *goalWhy = "-";
/* Set while a purse is being bought, so the shelf is not walked twice for one;
   cleared when the counter is left. */
static int oathWait;

/* Whether there is a purse in the pouch to put in front of somebody. */
static int carryingOath(void) {
  int i;
  for (i = 0; i < WARE_COUNT; i++) {
    if (you.bag[i] && wares[i].kind == WARE_OATH) return 1;
  }
  return 0;
}
/* How many times the run swapped steel for glass because the dead were out. */
static int glassDrawn;
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
/* Stop this run asking that map for anything ever again. */
static void giveUpOnMap(int m) {
  int i;
  if (m < 0 || m >= MAP_COUNT) return;
  for (i = 0; i < maps[m].npcCount && i < MAX_CROWD; i++) npcStuck[m][i] = 1;
  for (i = 0; i < maps[m].signCount && i < 8; i++) signRead[m][i] = 1;
}

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
/* Whether a sea is a road for you. Owning a hull is not enough: a hull at
   nought is a wreck, and the game will not let you stand on water in one -
   `solidAt` asks for both, and this asked for half. The crown save starts
   from a zeroed record, which makes hull zero (the skiff) with no timber left
   in her, so the router believed it could sail and the walk knew it could
   not: a run with all ten seats taken stepped onto the Sunset Sea and spent
   the rest of the game bouncing off Lordsport, four hundred doors without a
   sigil, one room from the chair. */
static int crossable(int m) {
  return !maps[m].sea || (ownShip() && you.shipHull > 0);
}

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
/* How many separate times a door has refused to be walked to from where it
   stands. One refusal is a body in the gateway; four is the door. Nailing it
   on the first was worse than never nailing it - a sweep gave up on Westeros
   after fifteen maps because three passers-by had been standing still. */
#define MAX_WARP_MARK 32
#define WARP_GIVE_UP 4
static unsigned char warpStuck[MAP_COUNT][MAX_WARP_MARK];

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
  if (getenv("WHYDOORS")) {
    static int said = 0;
    if (said++ > 2000 && said < 2016) {
      printf("      [work] on %-22s wants %-22s\n", world->name, maps[target].name);
    }
  }
  while (from[target] != worldId) target = from[target];
  /* And not a door this run has already proved it cannot walk to. That mark
     was being read by the router that goes somewhere named and ignored by the
     one that goes looking for work - so a sweep of Highgarden stood on
     Dragonstone for two and a half million frames wanting the Glass Vault,
     took eighty-one doors in a whole playthrough, and walked thirty-three
     maps. A door you cannot reach is not a road, whoever is asking. */
  {
    int firstAny = -1;
    for (i = 0; i < world->warpCount; i++) {
      if (world->warps[i].to != target) continue;
      if (firstAny < 0) firstAny = i;
      if (i < MAX_WARP_MARK && warpStuck[worldId][i] >= WARP_GIVE_UP) continue;
      return i;
    }
    if (firstAny >= 0 && !(firstAny < MAX_WARP_MARK
        && warpStuck[worldId][firstAny] >= WARP_GIVE_UP)) {
      return firstAny;
    }
  }
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
/* How many goal-picks the errand is allowed before the climb stops humouring
   it. Six is plenty for "spend your gold"; the trip that makes an obsidian
   edge is not a nicety, so it gets a much longer leash - it is the difference
   between a road you can walk in the last act and one you cannot. */
static int shopBudget = 6;
/* The map the climb is trying to reach, so that a harbourmaster can be asked
   for the berth that gets nearest it rather than the berth that happens to
   owe the surveyor a room. */
static int ladderWants = -1;
static int wantShop;
/* Whether this rung has already been sent back for a weapon. */
static int rearmed;
/* How many trips have been made for the makings of an obsidian edge. */
static int glassTries;

/* Whether this ware is something an obsidian edge is made out of, and you are
   still short of what the recipe asks for. The dagger that marks the dead is
   three dragonglass shards and an ash haft; the shards are three hundred and
   twenty apiece on the oddments shelf, and a run that never bought the third
   one carried two of them all the way to the ninth rung and fought the Long
   Night with a greatsword. */
static int glassMaking(int at) {
  int i, k;
  for (i = 0; i < RECIPE_COUNT; i++) {
    const Recipe *r = &recipes[i];
    if (wares[r->makes].kind != WARE_WEAPON || !wares[r->makes].obsidian) continue;
    for (k = 0; k < RECIPE_MAX_NEEDS; k++) {
      if (!r->many[k] || r->mat[k] != (u8)at) continue;
      if (you.bag[at] < r->many[k]) return 1;
    }
  }
  return 0;
}

/* Whether the hall you are standing in is one you could walk out owning. */
static int hallToBuy(void) {
  if (seat.has || !world) return 0;
  if (!maps[worldId].seat || !mapCleared(worldId)) return 0;
  return you.gold >= (int)maps[worldId].seat * 100;
}

/* Whether there is an obsidian edge anywhere on you, worn or packed. */
static int haveGlass(void) {
  int i;
  for (i = 0; i < WARE_COUNT; i++) {
    if (you.bag[i] && wares[i].kind == WARE_WEAPON && wares[i].obsidian) return 1;
  }
  return you.WORN_WEAPON && wares[you.WORN_WEAPON - 1].obsidian;
}
/* What the counter is being asked for, what was in the purse when the asking
   started, and how many times. A sale always takes gold. */
static int askedFor = -1, askedGold, askedTimes;
/* Where the last fight was fought, how many in a row have been lost there, and
   the maps that have proved they are not a place to train. */
static int duelMap = -1;
static u16 lostHere[MAP_COUNT];
static u8 badGround[MAP_COUNT];
/* Frames spent walking grass since the last fight actually started. */
static int grindQuiet;

/* An edge in the pouch that will mark the dead, when what is in your hand
   will not.
 *
 * Steel does two fifths of its damage to something already dead and obsidian
 * does two and a half times - a six-fold swing - and the game will never put
 * the glass on for you, because a dragonglass dagger is worth eighteen and
 * the greatsword it would replace is worth thirty. That is the right call
 * everywhere except in front of a wight, which by the last act is four
 * fights in five on every road north of the Neck. A player reads "steel
 * barely marks it", opens the pouch and changes weapons. Nothing in here
 * ever did, so the ninth rung cost seven and a half million frames and six
 * thousand four hundred losses. */
static int obsidianToDraw(void) {
  int i;
  if (winterStage() < 5) return -1;
  if (you.WORN_WEAPON && wares[you.WORN_WEAPON - 1].obsidian) return -1;
  for (i = 0; i < WARE_COUNT; i++) {
    if (you.bag[i] && wares[i].kind == WARE_WEAPON && wares[i].obsidian) return i;
  }
  return -1;
}

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
static int hopsBetween(int from, int want);

/* Whether the hero could put a foot on that tile from where they stand. */
static int canWalkTo(int gx, int gy) {
  int hx = hero.px >> 4, hy = hero.py >> 4;
  if (hx == gx && hy == gy) return 1;
  return stepToward(gx, gy) >= 0;
}

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
  /* Of the doors that go that way, one you can actually walk to.
   *
   * There are eight places in this world where a shipless player is put down
   * on open water with a single dry tile under them - the door they came in
   * by. The router would pick the far door on the shortest road, the walk
   * would find no route to it because the route is water, and the run would
   * report that it could not reach a tile while standing thirty yards from
   * it across the sea. A crown run stepped onto the Sunset Sea with all ten
   * seats taken and spent nine hundred thousand frames on that. */
  {
    int firstAny = -1;
    for (i = 0; i < world->warpCount; i++) {
      if (world->warps[i].to != at) continue;
      if (firstAny < 0) firstAny = i;
      if (i < MAX_WARP_MARK && warpStuck[worldId][i] >= WARP_GIVE_UP) continue;
      return i;
    }
    /* Every door on the shortest road has already refused to be walked to.
     *
     * That is not a bad guess about one frame - a roamer standing in a gateway
     * makes any door look unreachable for a moment, and choosing a different
     * one on that basis is how a run ends up crossing the same two maps four
     * hundred times. It is the give-up flag: nine hundred frames of trying and
     * failing to reach that tile. When all of them carry it, the shortest road
     * is not a road, and any door you can actually reach that still gets there
     * is better than the one you have proved you cannot. */
    {
      int best = -1, bestHops = 1 << 30;
      for (i = 0; i < world->warpCount; i++) {
        int to = world->warps[i].to, near;
        if (!crossable(to)) continue;
        if (i < MAX_WARP_MARK && warpStuck[worldId][i] >= WARP_GIVE_UP) continue;
        if (!canWalkTo(world->warps[i].x, world->warps[i].y)) continue;
        near = to == want ? 0 : hopsBetween(to, want);
        if (near < 0 || near >= bestHops) continue;
        bestHops = near; best = i;
      }
      if (best >= 0) return best;
    }
    /* Every door that way has been nailed shut by a circle this run already
       walked. Saying so is better than walking it again: "no road" sends the
       caller to look for a berth, or to say plainly that it is stuck, and
       both of those are progress. */
    if (firstAny >= 0 && !(firstAny < MAX_WARP_MARK
        && warpStuck[worldId][firstAny] >= WARP_GIVE_UP)) {
      return firstAny;
    }
  }
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
    /* Ten sigils is not the end of this game; the chair is. A directed climb
       that stopped at the tenth sigil left the last fight in the game - the
       thing standing behind the throne - to a run that was handed nine seats
       in its save file and never earned one. */
    if ((crownRun || ladderMode) && you.story < 3) {
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
    shopBudget = 6;
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
    shopBudget = 6;
  }
  /* And a forge is also where the bench is. Once the dead are past the Neck
     and there is no glass anywhere on you, the errand is worth making again
     for its own sake: the shard has been in the pouch since Dragonstone and
     the thing that turns it into an edge is behind the smith. */
  if (winterStage() >= 5 && !haveGlass() && you.gold >= 2400 && !wantShop
      && glassTries < 60) {
    glassTries++;
    wantShop = 1;
    shopTries = 0;
    shopBudget = 60;
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
    if (wantShop && ++shopTries < shopBudget) {
      int door = warpTowardTrade();
      if (door >= 0) { goalKind = GOAL_WARP; goalIndex = door; return; }
      wantShop = 0;
    }
    wantShop = 0;
  }
  if (worldId == leaders[lead].map) {
    who = leaderNpcOn(worldId, lead);
    if (who >= 0 && crowdAlive[who]) {
      /* A seat you have not taken is a fight you have not finished.
       *
       * "Draw on somebody once" is the right rule for the road - it stops a
       * sweep killing the whole of Westeros - and it was being applied to the
       * ten people the whole climb is about. Lose to a leader and the run
       * would walk back to them, say hello, walk away, and do that until the
       * frames ran out: three million of them at Casterly Rock with twelve
       * thousand gold in its purse and six of the ten seats still standing.
       * The quota is for strangers. */
      npcDuelled[worldId][who] = 0;
      goalKind = GOAL_NPC; goalIndex = who; return;
    }
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
    goalWhy = "chair"; goalKind = GOAL_CHAIR; goalIndex = 0; return;
  }

  /* What this map still owes, before any errand of your own.
   *
   * The errands below came first for one build and the sweep stopped being a
   * sweep: it walked all two hundred and thirty-one maps and read fifteen
   * signs, played two of the thirty-two scenes, and spoke to nobody twice
   * over. A run that is buying purses is not walking Westeros. Finish the
   * room you are standing in; the errands are what a finished room is for. */
  for (i = 0; i < crowdCount; i++) {
    /* Anyone who drew on you from across the road and lost is dealt with,
       whether or not there was ever a conversation. */
    if (!crowdAlive[i] && !npcTalked[worldId][i]) { npcTalked[worldId][i] = 1; talked++; }
    if (!crowdAlive[i] || npcTalked[worldId][i] || npcStuck[worldId][i]) continue;
    goalWhy = "crowd"; goalKind = GOAL_NPC; goalIndex = i; return;
  }
  for (i = 0; i < world->signCount && i < 8; i++) {
    if (signRead[worldId][i]) continue;
    goalWhy = "sign"; goalKind = GOAL_SIGN; goalIndex = i; return;
  }

  /* Back to the house with the red lamp, when the child is grown.
   *
   * The evening is one conversation and taking them into your service is
   * another, years of fights later, with the same keeper. The sweep speaks to
   * everybody exactly once, so nine playthroughs spent eighteen evenings,
   * fathered a dozen children, and not one of them was ever grown and sworn:
   * the whole back half of that feature had never happened. */
  {
    int kid = bastardHere(worldId);
    if (kid >= 0 && bastardGrown(kid)) {
      for (i = 0; i < crowdCount; i++) {
        if (!crowdAlive[i] || npcStuck[worldId][i]) continue;
        if (!world->npcs[i].evening) continue;
        goalWhy = "the child"; goalKind = GOAL_NPC; goalIndex = i;
        goalStage = 2;                     /* SELECT is the whole of it */
        return;
      }
    }
    /* And the road back to the town they were born in. Fifty fights is a long
       way from wherever the evening was spent, and a sweep never once
       happened to be standing in the right doorway on the right day. */
    if (kid < 0) {
      int b, want = -1;
      for (b = 0; b < 3 && b < (int)you.bastards; b++) {
        if (you.bastTaken[b] || !bastardGrown(b)) continue;
        if (you.bastMap[b] >= MAP_COUNT || !mapSeen[you.bastMap[b]]) continue;
        want = you.bastMap[b];
        break;
      }
      if (want >= 0 && want != worldId) {
        i = warpTowardMap(want);
        if (i >= 0) { goalWhy = "the child, far"; goalKind = GOAL_WARP; goalIndex = i; return; }
      }
    }
  }

  /* Back to a brother in black with the count.
   *
   * A ranging is the one lever in this game that pushes the winter the other
   * way, and finishing one needs two conversations with the same man: he
   * sends you north, and you come back and tell him. The sweep speaks to
   * everybody exactly once, so it took a ranging in eight runs out of nine
   * and handed one in exactly once - by luck, when the wandering happened to
   * cross the same brother twice.
   *
   * The goal is set here directly rather than by clearing the flag that says
   * he has been spoken to. Clearing it counts the same conversation again
   * every time, which is how a sweep came back having spoken to a hundred and
   * seventy thousand of seven hundred and seven people. */
  if (you.rangeWant && you.rangeGot >= you.rangeWant) {
    for (i = 0; i < crowdCount; i++) {
      if (!crowdAlive[i] || npcStuck[worldId][i]) continue;
      if (!world->npcs[i].ranges) continue;
      goalWhy = "handin"; goalKind = GOAL_NPC; goalIndex = i; return;
    }
    /* And across the map for him if he is not on this one: a count that is
       made and never reported is worse than never having gone. */
    {
      int m, want = -1, k;
      for (m = 0; m < MAP_COUNT && want < 0; m++) {
        if (!mapSeen[m]) continue;
        for (k = 0; k < maps[m].npcCount; k++) {
          if (maps[m].npcs[k].ranges) { want = m; break; }
        }
      }
      if (want >= 0 && want != worldId) {
        i = warpTowardMap(want);
        if (i >= 0) { goalWhy = "handin-far"; goalKind = GOAL_WARP; goalIndex = i; return; }
      }
    }
  }

  /* A counter, when the purse that buys a sword is not in the pouch. The
     sweep opens a counter only by talking to whoever stands behind one, and
     then leaves - about two hundred frames of a whole playthrough - so it
     never carried the one thing that turns a beaten man into a sworn one. */
  if (hostRoom() >= 0 && !carryingOath() && you.gold >= 1500 && oathTrips < 20) {
    for (i = 0; i < crowdCount; i++) {
      if (!crowdAlive[i] || npcStuck[worldId][i]) continue;
      if (world->npcs[i].trade != 2) continue;
      oathTrips++;
      goalWhy = "purse"; goalKind = GOAL_NPC; goalIndex = i; return;
    }
  }

  /* A hall of your own, once one you have already emptied is affordable.
   *
   * Twelve halls in this world can be bought and they are all at the back of a
   * stronghold, so whether a wandering run ever stood in one with the money in
   * its purse was pure chance: one playthrough in nine. And without a seat
   * there is nowhere to send swords from, which is why the campaign had never
   * been fought. Go back for it - the map is already cleared, so this is a
   * walk down a road the run has walked, not a detour into new country. */
  if (!seat.has) {
    int m, want = -1;
    for (m = 0; m < MAP_COUNT; m++) {
      if (!maps[m].seat || !mapCleared(m)) continue;
      if (you.gold < (int)maps[m].seat * 100) continue;
      want = m;
      break;
    }
    if (want >= 0 && want != worldId) {
      i = warpTowardMap(want);
      if (i >= 0) { goalWhy = "hall"; goalKind = GOAL_WARP; goalIndex = i; return; }
    }
  }

  /* Out on a ranging and short of the count: go where the dead are.
   *
   * Seven sweeps in nine took a ranging and every one of them came back with
   * nought of three put down, because the dead only walk cold ground and a
   * wandering run crosses it and keeps going. So the one lever in this game
   * that pushes the winter back was pulled seven times and turned nothing:
   * the Watch was an errand board nobody ever collected from. Stand in the
   * snow and wait for them, the way the man in black asked. */
  if (you.rangeWant && you.rangeGot < you.rangeWant) {
    if (world->cold && world->cold + winterStage() >= 7
        && findCover(&grindX, &grindY)) {
      grindMode = 1;
      goalWhy = "ranging-grind"; goalKind = GOAL_SIGN; goalIndex = 0;
      return;
    }
    {
      int m, want = -1, best = 0;
      for (m = 0; m < MAP_COUNT; m++) {
        if (!mapSeen[m] || !maps[m].cold) continue;
        if (maps[m].cold + winterStage() < 7) continue;
        if (maps[m].cold > best) { best = maps[m].cold; want = m; }
      }
      if (want >= 0 && want != worldId) {
        i = warpTowardMap(want);
        if (i >= 0) { goalWhy = "ranging-north"; goalKind = GOAL_WARP; goalIndex = i; return; }
      }
    }
  }

  /* Everything here is done. If the only unfinished ground is across water,
     go and find whoever sells passage; otherwise take a door. */
  if (portOwesWork()) {
    i = sailorHere();
    /* Not clearing npcTalked: the goal is set here directly, and clearing it
       counted the same conversation again every time - which is how a sweep
       came back having spoken to two hundred and sixty-four of two hundred
       and fifty-five people. */
    if (i >= 0) { goalWhy = "sailor"; goalKind = GOAL_NPC; goalIndex = i; return; }
  }
  i = warpTowardWork();
  if (i >= 0) { goalWhy = "work"; goalKind = GOAL_WARP; goalIndex = i; }
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
      /* The leader of the rung this climb is on is never one of the strangers:
         no quota, and no "somebody better than you" second thoughts, because
         beating them is the errand. */
      int isRung = ladderMode && leaderFor(world->npcs[goalIndex].duellist) >= 0;
      if (world->npcs[goalIndex].fights
          && (isRung || (duels < MAX_DUELS && !npcDuelled[worldId][goalIndex]
              && (duellists[world->npcs[goalIndex].duellist].level <= you.level + 5
                  || roll(6) == 0)))) {
        goalStage = 1;
        interacting = 0;
        return;
      }
    } else {
      npcDuelled[worldId][goalIndex] = 1;
    }
  } else if (goalKind == GOAL_SIGN) {
    /* Grinding borrows this goal to mean "walk to that tile", so counting it
       as a sign read had a run come back having read three hundred thousand
       of a hundred and ninety-two signs. A borrowed errand is not the errand
       it borrowed. */
    if (!grindMode) { signRead[worldId][goalIndex] = 1; signs++; }
  }
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

  /* A conversation that opens a screen is still a conversation.
   *
   * `completeGoal` is called from the world, once the window has been read to
   * the end - and a harbourmaster does not open a window, he opens the passage
   * list. So every port in this world was spoken to hundreds of times and
   * never counted as spoken to, its map owed work forever, and every router in
   * the tester kept sending the run back for it: that is what the coastal
   * circles were, at Lordsport, at Dragonstone, at Braavos, at Hardhome, in
   * every sweep this game has ever had. Whoever opened this screen, you have
   * met them. */
  if (goalKind == GOAL_NPC && interacting && goalIndex < crowdCount
      && scene != SCENE_WORLD && scene != SCENE_DUEL && scene != SCENE_BAG
      && scene != SCENE_TITLE && scene != SCENE_HOUSE && scene != SCENE_NAME
      && !npcTalked[worldId][goalIndex]) {
    npcTalked[worldId][goalIndex] = 1;
    talked++;
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
    /* The pouch, deliberately, when there is glass in it and steel in your
       hand and the dead on the road outside. */
    if (obsidianToDraw() >= 0) menuWant = 3;
    /* And the house card, deliberately, while standing in a hall that is for
       sale and empty of whoever used to hold it.
     *
       Twelve halls in this world can be bought, from three thousand gold to
       twelve, and not one has ever been bought by anything: the card is opened
       often enough, but almost never in the one room where its second line
       does anything. No seat means no rents, no feast, no marriage, and
       nowhere to send swords from - four more systems behind one door. */
    else if (hallToBuy()) menuWant = 4;
    else if (menuWant < 0) menuWant = (int)roll(MENU_ENTRIES);
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
    /* Out of the snow and into your hand: the pouch was opened to change
       weapons, so walk to the right pocket, find the glass and put it on. */
    if (!bagInDuel && obsidianToDraw() >= 0) {
      int at = obsidianToDraw(), pocket = pocketOf(wares[at].kind);
      if (bagPocket != pocket) keys = tap(KEY_RIGHT);
      else {
        int have = pocketCount(bagPocket), want = -1, i;
        for (i = 0; i < have; i++) if (nthInPocket(bagPocket, i) == at) { want = i; break; }
        if (want < 0) keys = tap(KEY_B);
        else if (bagPick != want) keys = tap(bagPick < want ? KEY_DOWN : KEY_UP);
        else { keys = tap(KEY_A); if (keys) glassDrawn++; }
      }
    }
    else if (oathWanted >= 0) {
      if (bagPick != oathWanted) keys = tap(bagPick < oathWanted ? KEY_DOWN : KEY_UP);
      else { keys = tap(KEY_A); if (keys) oathsOffered++; }
    }
    else
    /* In a fight with an animal that is nearly down, reach for a net rather
       than for a drink: taking one alive is a whole half of the game and a
       tester that never throws one has not walked it. */
    /* A net is for something that can be held. A wight cannot: the game says
       so and does not even spend the net on it, and the tester threw one at
       every wight it met with a third of its life left - opened the pouch,
       was refused, shut it, opened it again, half a million times in one
       fight, which is where the last three houses of a nine-house run went. */
    if (bagInDuel && foeBeast >= 0 && beasts[foeBeast].tame
        && theirs.hp * 3 < theirs.maxHp) {
      int have = pocketCount(bagPocket), want = -1, i;
      for (i = 0; i < have; i++) {
        if (wares[nthInPocket(bagPocket, i)].kind == WARE_SNARE) { want = i; break; }
      }
      if (want >= 0) {
        if (bagPick != want) keys = tap(bagPick < want ? KEY_DOWN : KEY_UP);
        else { keys = tap(KEY_A); if (keys) snaresThrown++; }
      } else keys = tap(KEY_B);
    }
    else if (bagInDuel && you.hp < vigourFor(you.level)) {
      /* The row with a remedy on it, rather than whichever row the cursor
         happened to land on. */
      int have = pocketCount(bagPocket), want = -1, i2;
      for (i2 = 0; i2 < have; i2++) {
        if (wares[nthInPocket(bagPocket, i2)].heal) { want = i2; break; }
      }
      if (want < 0) keys = tap(KEY_B);
      else if (bagPick != want) keys = tap(bagPick < want ? KEY_DOWN : KEY_UP);
      else keys = tap(KEY_A);
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
    /* A purse, whichever kind of run this is.
     *
     * The pouch has known how to put one in front of a beaten man since the
     * host was built, and the wandering sweep never carried one: it buys
     * whatever row the cursor happens to be on, and the odds of that being an
     * oath are what they are. So across every run this game has ever had, not
     * one purse was offered, not one sword was sworn, and everything standing
     * behind a host - a company in the field, a hall worth defending - had
     * never been reached by anything. */
    /* A climb buys a purse out of what is left after the armour, never
       instead of it: sending the run shopping for one at every forge with its
       last four hundred gold cost three houses their tenth seat. */
    if (!oathWait && hostRoom() >= 0 && !carryingOath()
        && (!ladderMode || you.gold >= 3000)) {
      /* Purses are on the remedies shelf and a smith's counter opens on the
         arms shelf, so wanting one means walking along the counter first -
         which the directed climb never did, because it had no reason to. */
      int want = -1, i, st2, onShelf = -1;
      for (st2 = 0; st2 < STALL_COUNT && onShelf < 0; st2++) {
        int shelf = shelfCount(&stalls[st2]);
        for (i = 0; i < shelf; i++) {
          int at = shelfWare(&stalls[st2], i);
          if (wares[at].kind != WARE_OATH || you.bag[at]) continue;
          if (askingPrice(at) > you.gold) continue;
          onShelf = st2; want = i; break;
        }
      }
      if (onShelf >= 0 && onShelf != shopStall) keys = tap(KEY_RIGHT);
      else if (onShelf >= 0 && shopPick != want) {
        keys = tap(shopPick < want ? KEY_DOWN : KEY_UP);
      } else if (onShelf >= 0) {
        keys = tap(KEY_A);
        if (keys) oathWait = 1;
      }
      if (onShelf >= 0) {
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
        /* What this counter is charging, not what the table says. A house
           that dislikes you marks everything up, so a run that checked the
           list price kept choosing a mace it could not quite afford and
           pressing A on it forty times against a shopkeeper saying no. */
        if (askingPrice(at) > you.gold) continue;
        /* A net before anything else when there is none in the pouch. Buying
           the dearest thing on the counter is a reasonable way to shop and it
           meant a net was never once bought in a whole playthrough - the
           cheapest net is a hundred and fifty and the dearest sword is nine
           thousand - so the run threw no nets, took nothing alive, and the half
           of this game that is about animals went untested. */
        if (wares[at].kind == WARE_SNARE && !you.bag[at]) { best = i; break; }
        /* And a purse, for the same reason: the cheapest is three hundred and
           the dearest sword is nine thousand, so "buy the dearest thing on the
           counter" never once bought one. */
        if (wares[at].kind == WARE_OATH && !you.bag[at] && hostRoom() >= 0) {
          best = i; break;
        }
        /* And the makings of an obsidian edge before anything else, once the
           dead are past the Neck and there is none on you. */
        if (winterStage() >= 5 && !haveGlass() && glassMaking(at)) { best = i; break; }
        if (best < 0 || wares[shelfWare(stall, best)].price < wares[at].price) best = i;
      }
      /* Asking the same counter for the same thing over and over is not
         shopping, and until now the run only ever said so in the report it
         printed after the frames had run out - by which point it had pressed
         A on one bow three hundred and forty thousand times. A sale always
         takes gold, so gold that has not moved is a counter that has not
         sold. Say so while there are still frames left, and walk out. */
      if (best >= 0 && shopPick == best) {
        int at = shelfWare(stall, best);
        if (at != askedFor || you.gold != askedGold) {
          askedFor = at; askedGold = you.gold; askedTimes = 0;
        }
        /* Only frames the run is actually asking on. Counting the walk down
           the shelf as well made a sixteen-row counter look like a shopkeeper
           refusing to sell. */
        if (++askedTimes > 80) {
          finding("a counter asked %d times for %s and never sold one "
                  "(gold %d, asking %d, in the pouch %d, worn %d)",
            askedTimes, wares[at].name, you.gold, askingPrice(at),
            (int)you.bag[at],
            wares[at].kind < WARE_KINDS ? (int)you.worn[wares[at].kind] : -1);
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
        /* And dragonglass before anything else once the dead are over the
           Wall. Steel does two fifths of its damage to something that is
           already dead and obsidian does two and a half times, which is a
           six-fold swing - so a run carrying the best steel in the game and
           no glass loses three fights in four on every cold road, and the
           shard needed to fix that has been in its pouch the whole time. */
        if (wares[r->makes].kind == WARE_WEAPON && wares[r->makes].obsidian
            && winterStage() >= 3 && !you.bag[r->makes]) { best = i; break; }
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
  } else if (scene == SCENE_HIRE) {
    /* A captain in the Free Cities with a company standing behind him.
     *
     * The tester had no idea this screen existed - it did not even count as a
     * scene - so a run that walked into a sellsword hall in Braavos stood in
     * it until the frames ran out, which is also why nobody in Braavos could
     * ever be reached. It is the shortest road to a host in the game: gold
     * for swords, no fight and no purse, which is the entire point of Essos.
     * Take the one this captain actually speaks for, then leave. */
    int want = -1, i;
    hiresSeen++;
    for (i = 0; i < COMPANY_COUNT; i++) {
      if (i != hireSeller) continue;
      if (hostRoom() < 0 || you.gold < (int)companies[i].price) continue;
      want = i;
    }
    if (++hireHeld > 900) {
      finding("a sellsword captain that %d frames of pressing B would not leave",
        hireHeld);
      hireHeld = 0;
      want = -1;
    }
    if (want < 0 || hireHeld > 500) keys = tap(KEY_B);
    else if (hirePick != want) keys = tap(hirePick < want ? KEY_DOWN : KEY_UP);
    else { keys = tap(KEY_A); if (keys) { companiesHired++; hireHeld = 0; } }
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
    if (wasScene != SCENE_DUEL) {
    }
    duelMap = worldId;
    grindQuiet = 0;
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
      /* Re-entering the same fight from a menu is not a new fight.
       *
       * duelTries was cleared here, on every entry - and a bounce out to the
       * pouch and back IS an entry, so the one check meant to catch "a duel
       * that would not end" was reset by the exact loop it was built for. It
       * sat silent through half a million round trips. Count the trips into
       * one fight instead, and let go of the pouch after a few of them. */
      if (theirs.hp == wasFoeHp && wasScene != SCENE_WORLD) pouchTrips++;
      else pouchTrips = 0;
      wasFoeHp = theirs.hp;
      if (pouchTrips == 300) {
        finding("a fight left and re-entered %d times without a blow landing",
          pouchTrips);
      }
      runAway = ladderMode ? 0 : (duels % 5) == 4;
      if (ladderMode) ladderFights++;
    }
    if (windowOpen) keys = tap(KEY_A);
    else if (duelPhase == DUEL_TOP) {
      /* Fight most of the time; sometimes reach for the pouch, sometimes run. */
      /* Only reach for the pouch over an animal if there is actually a net in
         it. Without that check the tester opened the pouch, found nothing,
         shut it, and opened it again - four hundred thousand times. */
      int haveNet = 0, haveCure = 0, haveOath = 0, i2;
      for (i2 = 0; i2 < WARE_COUNT; i2++) {
        if (!you.bag[i2]) continue;
        if (wares[i2].kind == WARE_SNARE) haveNet = 1;
        if (wares[i2].kind == WARE_OATH) haveOath = 1;
        if (wares[i2].heal) haveCure = 1;
      }
      /* And the same rule for a drink as for a net. "Carrying anything at all"
         is not "carrying something that will help": once the remedies ran out
         a hurt run opened the pouch on every single turn of every fight,
         found five and forty pieces of spare armour in it, shut it, and opened
         it again - three quarters of a million times in one playthrough, one
         sigil short of the throne. */
      /* A purse in front of somebody who has already lost, which is the only
         way anybody in this world ever ends up behind you.
       *
         The pouch knew how to offer one and nothing ever opened the pouch to
         do it: across nine sweeps and nine climbs, with thousands of musters
         read, not one oath was ever offered and not one sword ever sworn - so
         nobody ever had a host, so nobody could ever send one anywhere, and
         three whole systems sat unplayed behind a menu nothing pressed. */
      int want = pouchTrips > 6 ? 0
        : runAway ? 3
        : (foeBeast < 0 && foeDef && foeDef->sworn < SWORN_KINDS && haveOath
           && hostRoom() >= 0 && !theirs.dead
           && theirs.hp * 4 < theirs.maxHp) ? 1
        : (foeBeast >= 0 && beasts[foeBeast].tame && haveNet
           && theirs.hp * 3 < theirs.maxHp) ? 1
        : (you.hp * 3 < vigourFor(you.level) && haveCure ? 1 : 0);
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
      /* Doors taken since the run last did anything.
       *
       * The wandering sweep had no circle-detector - the directed climb has
       * one, and the sweep is the run that actually needs it. Measured: a
       * sweep took twelve thousand doors and walked ninety-one maps, because
       * ten thousand of them were Lordsport and the Sunset Sea, one after the
       * other, each map's router insisting the way on lay through the other.
       * That is most of a playthrough's frames and it is why half the scenes
       * in this game had never fired. When a door has been taken two hundred
       * times over without a word spoken, a sign read or a new map walked,
       * the door is the problem: nail it shut and let the router find
       * another. */
      if (mapSeen[worldId] == 1 || talked != wasTalked || signs != wasSigns) {
        doorsSinceWork = 0;
        wasTalked = talked;
        wasSigns = signs;
      } else if (++doorsSinceWork > 200) {
        doorsSinceWork = 0;
        /* Nailing the door was not enough: the run went back through another
           one. What it is actually doing is walking to a map it can never
           finish - a person who died before it spoke to them stops counting
           as dealt with the moment you leave, so the map owes work forever
           and every router in the tester keeps sending you back for it. Write
           the pair off and let the sweep get on with Westeros. */
        {
          int m2 = lastDoorMap >= 0 ? lastDoorMap : worldId, k2, owed = -1;
          if (mapDone(m2)) m2 = worldId;
          for (k2 = 0; k2 < maps[m2].npcCount && k2 < MAX_CROWD; k2++) {
            if (!npcTalked[m2][k2] && !npcStuck[m2][k2]) { owed = k2; break; }
          }
          /* Once is the detector doing its job and the run carrying on;
             say it and move on. Three times in one playthrough is the run
             spending its life in circles, and that is worth stopping for. */
          printf("      %s and %s: two hundred doors between them, and %s still "
                 "owes %s\n",
            lastDoorMap >= 0 ? maps[lastDoorMap].name : "nowhere",
            world->name, maps[m2].name,
            owed >= 0 ? maps[m2].npcs[owed].name : "a sign nobody can read");
          if (++circlesBroken >= 3) {
            finding("%d two-map circles in one playthrough", circlesBroken);
          }
        }
        giveUpOnMap(worldId);
        if (lastDoorMap >= 0 && lastDoorMap < MAP_COUNT) giveUpOnMap(lastDoorMap);
      }
      if (getenv("WHYDOORS")) {
        static int said = 0;
        if (said++ > 3000 && said < 3020) {
          printf("      [door] into %-22s why %-14s goal %d/%d\n",
            world->name, goalWhy, goalKind, goalIndex);
        }
      }
      lastDoorMap = wasMap;
      lastDoorIndex = goalKind == GOAL_WARP ? goalIndex : -1;
      goalKind = GOAL_NONE;
      /* A room with a smith in it and money in your purse is a room you stop
         in. Armed one map at a time, so the ladder run does not walk past
         nine thousand gold's worth of counter on its way to a fight. */
      craftedHere = 0;
      oathWait = 0;
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
      /* And the moment this ground is written off, whatever the level.
         Grinding latches: the goal is set to a tile, so the errand picker
         that decides whether to grind at all is never asked again until the
         level is reached. The run was therefore told eight times over that
         Winterfell was beating it, wrote the map off, and went on standing
         in the same two tiles of hedge losing to the same barrowlord six
         thousand times, because nothing ever unlatched the grind. */
      if (ladderMode && grindMode) {
        int at = nextRung();
        if (at < 0 || you.level + 1 >= leaderLevel[at] || badGround[worldId]) {
          grindMode = 0;
          goalKind = GOAL_NONE;
        }
      }
      /* A sweep only ever stands still for a ranging, so the count being made
         is what lets it go. Grinding latches, and a latch with nothing to
         release it is how the last one of these ate a playthrough. */
      if (!ladderMode && grindMode
          && (!you.rangeWant || you.rangeGot >= you.rangeWant
              || badGround[worldId])) {
        grindMode = 0;
        goalKind = GOAL_NONE;
      }
      if (grindMode) {
        /* Grass that never gives you a fight is not grass to train in.
         *
         * The run levelled up by walking the same six tiles of hedge in the
         * capital, where the game had no way to put anything in them, and it
         * did that for eleven million frames without noticing that no fight
         * had ever started. Ground that has beaten you is already given up
         * on; ground that will not even meet you belongs in the same list. */
        if (++grindQuiet > 40000) {
          grindQuiet = 0;
          badGround[worldId] = 1;
          printf("      %s will not give you a fight: %d frames in the grass, "
                 "going elsewhere\n", world->name, 40000);
          grindMode = 0;
          goalKind = GOAL_NONE;
          return;
        }
        /* Walk the grass and fight whatever comes out of it - or, if there is
           no grass here and nothing in it, go and find some.
         *
         * This used to end the run outright, and eight of the nine houses
         * begin in a walled seat with no encounter rows at all: the Eyrie,
         * Highgarden, Lannisport, Sunspear, Dragonstone, Pyke. So eight of
         * nine playthroughs stopped dead at level five inside their own front
         * gate, and the only house whose whole game had ever been played was
         * the one that happens to start at Winterfell. A player walks out to
         * the road. Write the map off and carry on towards the rung; the
         * grind picks up again on the first road that has anything on it. */
        if (!(world->ambushCount || world->wildCount)
            || !findCover(&grindX, &grindY)) {
          badGround[worldId] = 1;
          grindMode = 0;
          goalKind = GOAL_NONE;
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
        dodgeCover = badGround[worldId];
        dir = stepToward(gx, gy);
        if (dir < 0 && dodgeCover) { dodgeCover = 0; dir = stepToward(gx, gy); }
        dodgeCover = 0;
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
          /* Marking the far side "seen" was how this stopped trying the same
             door - and it is also how the headline number lied. A map you
             could not reach the door of is a map you have not walked, and a
             run that reported two hundred and thirty-one of two hundred and
             thirty-one had in fact never stood on ten of the maps its own
             scene report then blamed itself for missing. The door is what to
             give up on, so give up on the door. */
          if (goalIndex < MAX_WARP_MARK) warpStuck[worldId][goalIndex] = WARP_GIVE_UP;
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
        } else if (hx == gx && hy == gy) {
          /* A door can put you down on the very thing it sent you to: the
             stair into the Iron Vault lands you standing on its sign. There
             is no tile to face it from until you step off it, so step off.
           *
           * And a door can put you down on ITSELF, which is the same problem
           * wearing a hat. A warp fires when you step onto its tile, so
           * arriving through one leaves you standing on the way back without
           * it firing - and the router, told to take that door, found it was
           * already there, had nothing to walk, and reported that it could
           * not reach a tile it was standing on. Eight places in this world
           * put a shipless player down on open water with exactly one door
           * they can walk to, the one under their feet: the crown run stepped
           * onto the Sunset Sea with the realm won and spent nine hundred
           * thousand frames failing to walk to where it stood. Step off, and
           * the path back onto it opens the door. */
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
          dodgeCover = badGround[worldId];
          dir = stepToward(sx, sy);
          if (dir < 0 && dodgeCover) { dodgeCover = 0; dir = stepToward(sx, sy); }
          dodgeCover = 0;
          if (dir >= 0) {
            keys = KEYS[dir];
            blocked = 0;
            /* A step toward them is progress, so the tally starts again. It
               counts frames on which there was no step to take at all, not
               frames since the run first tried: a roamer who stands in a
               doorway now and then blocks the way a hundred times over a
               playthrough without ever being unreachable, and writing those
               people off cost the sweep half of Dragonstone. */
            if (goalKind == GOAL_NPC && goalIndex < MAX_CROWD) {
              npcTries[worldId][goalIndex] = 0;
            }
          }
          else if (goalKind == GOAL_NPC && ++npcTries[worldId][goalIndex] > 1200) {
            /* A tally that survives leaving the room.
             *
             * `blocked` is one number for the whole run and it resets on any
             * step anywhere, so a person the walk can never reach was only
             * ever written off if the run happened to stand there for nine
             * hundred unbroken frames - and a run that gets warped off the
             * map every few hundred frames never does. So the same three
             * people were walked at, given up on halfway, and walked at again
             * for a whole playthrough. Count it against the person, not
             * against the moment: the tally survives leaving the room. */
            npcStuck[worldId][goalIndex] = 1;
            finding("%s: twelve hundred frames at %s without one step to take",
              world->name, world->npcs[goalIndex].name);
            goalKind = GOAL_NONE;
            blocked = 0;
          }
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
            /* And a door, which was the one kind of goal this branch gave up
               on without writing anything down. Nine hundred frames of not
               reaching it, then the same door again, then the same door
               again: a sweep of Highgarden stood on Dragonstone wanting the
               Glass Vault for two and a half million frames and took
               eighty-one doors in the whole playthrough. */
            else if (goalKind == GOAL_WARP && goalIndex < MAX_WARP_MARK) {
              warpStuck[worldId][goalIndex]++;
            }
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
      /* A running tally rather than a streak. At a one-in-four win rate a
         run wins often enough to keep resetting a "five in a row" counter
         while still being beaten senseless, which is exactly what happened:
         the ninth rung cost seven and a half million frames and six thousand
         losses on ground the tester had already been told to leave. Losses
         push it up, wins pull it back, and eight clear of the wins is a map
         that is beating you. */
      if (mine.hp <= 0) {
        if (++lostHere[duelMap] >= 8 && !badGround[duelMap]) {
          badGround[duelMap] = 1;
          if (ladderMode) {
            printf("      %s is beating you: eight more losses than wins, "
                   "going elsewhere\n", maps[duelMap].name);
          }
        }
      } else if (theirs.hp <= 0 && lostHere[duelMap]) lostHere[duelMap]--;
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
  /* POOR=1 keeps the purse empty, not merely starts it empty.
   *
   * One of the eighteen petitions is only put to a crown carrying less than
   * two thousand gold, and a king walking to his own throne room picks up
   * purses on the way, so the treasury was over the line before the first
   * sitting and that petition had never been asked in the life of this game:
   * seventeen of eighteen, every run. This is a fixture and says so - it
   * holds the crown poor so the writing for a poor crown gets read. */
  if (getenv("POOR")) you.gold = 0;

  /* Two things that happen inside a menu the tester only ever presses at, so
     the only honest way to count them is to watch the state change. */
  {
    static int hadWar, hadRange, hadHost;
    int now = hostCount();
    if (seat.warLive && !hadWar) warsSent++;
    if (you.rangeWant && !hadRange) rangesTaken++;
    if (now > hadHost) sworeIn += now - hadHost;
    else if (now < hadHost) hostLost += hadHost - now;
    hadWar = seat.warLive;
    hadRange = you.rangeWant != 0;
    hadHost = now;
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
    fprintf(stderr, "f%7d %-18s scene %d phase %d win %d typed %d line %d/%d shift %d spot %d at %2d,%2d goal %d/%d stage %d gf %d rung %d lvl %d gold %d\n",
      frameNo, world ? world->name : "-", scene, duelPhase, windowOpen,
      typeDone, lineAt, lineCount, shift, spotted, hero.px >> 4, hero.py >> 4,
      goalKind, goalIndex, goalStage, goalFrames, ladderRung, you.level, you.gold);
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
  int i, seenMaps = 0, walkedMaps = 0, totalNpcs = 0, totalSigns = 0;
  int house = argc > 1 ? atoi(argv[1]) : 0;
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
    /* A zeroed record owns hull zero with no timber in her, which is a wreck
       nobody sold you. A new game says 255 and so does this. */
    r.shipKind = 255;
    r.berthMap = NO_MAP;                 /* nought is Winterfell, not "none" */
    r.exp = (unsigned)expForLevel(44);
    /* POOR=1 crowns a king with nothing in the treasury.
     *
     * One of the eighteen petitions is only ever put to a crown that has run
     * out of money, and the crown run starts with forty thousand gold and
     * earns more, so that one had never been asked, answered or read by
     * anything: seventeen of eighteen, every run, for the life of the
     * postgame. A king with empty hands is a different king, and the writing
     * knows it. */
    r.gold = getenv("POOR") ? 0 : 40000;
    r.hp = 9999; r.kills = 200;
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
    r.shipKind = 255;
    r.berthMap = NO_MAP;
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
    if (mapSeen[i]) { seenMaps++; walkedMaps++; }
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
  /* Two numbers, because they are two different facts and one of them was
     wearing the other's name. "Reached" counted every map the run stood on
     AND every map it had a good excuse for - behind a gate it never earned,
     the shut throne room - and printed the total as if it had walked them.
     So a run would say it had reached all two hundred and thirty-one and then
     its own scene report would blame it for missing ten scenes on maps it had
     never set foot on. Both sentences were true; only one of them was the one
     being read. */
  printf("  maps reached   %d walked, %d shut to this run, of %d\n",
    walkedMaps, seenMaps - walkedMaps, MAP_COUNT);
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
  printf("  the glass      drawn out of the pouch %d times, %s in your hand\n",
    glassDrawn,
    you.WORN_WEAPON && wares[you.WORN_WEAPON - 1].obsidian ? "obsidian" : "steel");
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
  printf("  your swords    %s, %d campaigns sent\n",
    seat.warLive ? maps[seat.warMap].name : "at home, or nowhere to send them",
    warsSent);
  printf("  your own house %d cards read, %d arms screens, arms %s, seat %s\n",
    housesSeen, armsSeen, you.arms ? "taken" : "none",
    seat.has ? maps[seat.map].name : "none");
  printf("  the host       %d musters read, %d purses offered, %d sworn\n",
    mustersSeen, oathsOffered, hostCount());
  printf("  swords sworn   %d took the purse, %d fell, %d still behind you\n",
    sworeIn, hostLost, hostCount());
  printf("  the free cities %d sellsword halls walked into, %d companies taken on\n",
    hiresSeen, companiesHired);
  printf("  the watch      %d taken, %d handed in\n", rangesTaken, you.rangings);
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
