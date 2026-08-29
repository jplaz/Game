/* Reads the cartridge's own data and says what is wrong with it.
 *
 * The playthrough proves the game can be finished. This proves the things a
 * playthrough cannot see: a door with no way back, a person nobody can stand
 * next to, a line with a letter the font has no glyph for, a name too long for
 * the plate it goes on, a duellist with impossible numbers.
 *
 *   cc -DHOST_TEST audit.c -o audit && ./audit
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

#define HOST_TEST 1
#define main gba_main
#include "main.c"
#undef main

unsigned char *gbaMem;
unsigned char hostSram[65536];
int hostFramesLeft;
void hostFrame(void) { }

static int problems, notes;

static void bad(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  printf("  PROBLEM  ");
  vprintf(fmt, ap);
  printf("\n");
  va_end(ap);
  problems++;
}

static void note(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  printf("  note     ");
  vprintf(fmt, ap);
  printf("\n");
  va_end(ap);
  notes++;
}

static int solidOn(const Map *m, int x, int y) {
  if (x < 0 || y < 0 || x >= m->w || y >= m->h) return 1;
  return m->solid[y * m->w + x];
}

/* Can anybody get within speaking distance? Counting a counter, since the game
   lets you lean over one - a shopkeeper walled in behind a full-width counter
   is exactly where the game wants them, not a fault. */
static int counterOn(const Map *m, int x, int y) {
  if (x < 0 || y < 0 || x >= m->w || y >= m->h) return 0;
  return m->counter[y * m->w + x];
}

static int walkableNeighbour(const Map *m, int x, int y) {
  int i;
  for (i = 0; i < 4; i++) {
    int nx = x + DIR_X[i], ny = y + DIR_Y[i];
    if (!solidOn(m, nx, ny)) return 1;
    if (counterOn(m, nx, ny) && !solidOn(m, nx + DIR_X[i], ny + DIR_Y[i])) return 1;
  }
  return 0;
}

static int ledgeOn(const Map *m, int x, int y) {
  if (x < 0 || y < 0 || x >= m->w || y >= m->h) return 0;
  return m->ledge[y * m->w + x];
}

/* Where a player can actually put their feet on one map. A ledge is not a tile
   you stand on and not a tile you climb: the only way across one is southward,
   off the edge and two tiles down, so the flood has to walk the same rules the
   cartridge does or it will call a walled-off corner reachable. */
static unsigned char standable[64 * 64];
static unsigned char spare[64 * 64];
static int floodQ[64 * 64];
static int blocked = -1;               /* one tile taken out of the map */

static void flood(const Map *m, int sx, int sy) {
  int head = 0, tail = 0, i;
  if (sx < 0 || sy < 0 || sx >= m->w || sy >= m->h) return;
  if (solidOn(m, sx, sy) || ledgeOn(m, sx, sy)) return;
  if (sy * m->w + sx == blocked) return;
  if (standable[sy * m->w + sx]) return;
  standable[sy * m->w + sx] = 1;
  floodQ[tail++] = sy * m->w + sx;
  while (head < tail) {
    int cur = floodQ[head++], cx = cur % m->w, cy = cur / m->w;
    for (i = 0; i < 5; i++) {
      int nx, ny;
      if (i < 4) {
        nx = cx + DIR_X[i]; ny = cy + DIR_Y[i];
        if (ledgeOn(m, nx, ny)) continue;
      } else {
        if (!ledgeOn(m, cx, cy + 1)) continue;
        nx = cx; ny = cy + 2;
      }
      if (nx < 0 || ny < 0 || nx >= m->w || ny >= m->h) continue;
      if (solidOn(m, nx, ny)) continue;
      if (ny * m->w + nx == blocked) continue;
      if (standable[ny * m->w + nx]) continue;
      standable[ny * m->w + nx] = 1;
      floodQ[tail++] = ny * m->w + nx;
    }
  }
}

/* The rules the cartridge uses to keep a roamer out of a place where standing
   still would shut the map: within one tile of a door, and in the gap through a
   line of ledges. Written out again here so the audit can check that between
   them they cover every tile that actually matters. */
static int nearWarpOn(const Map *m, int x, int y) {
  int i;
  for (i = 0; i < m->warpCount; i++) {
    int dx = m->warps[i].x - x, dy = m->warps[i].y - y;
    if (dx < 0) dx = -dx;
    if (dy < 0) dy = -dy;
    if (dx + dy <= 1) return 1;
  }
  return 0;
}

/* The cartridge's own corridor rule, so the audit judges the tiles a roamer can
   actually reach rather than every tile on the map. */
static int corridorOn(const Map *m, int x, int y) {
  return (solidOn(m, x - 1, y) && solidOn(m, x + 1, y))
      || (solidOn(m, x, y - 1) && solidOn(m, x, y + 1));
}

static int gateOn(const Map *m, int x, int y) {
  int i;
  if (corridorOn(m, x, y)) return 1;
  for (i = 0; i < 4; i++) if (corridorOn(m, x + DIR_X[i], y + DIR_Y[i])) return 1;
  return 0;
}

static int ledgeGateOn(const Map *m, int x, int y) {
  int d;
  for (d = -1; d <= 1; d++) if (ledgeOn(m, x - 1, y + d) && ledgeOn(m, x + 1, y + d)) return 1;
  return 0;
}

/* The one way into a map that the reachability flood starts from: where a house
   begins if this is somebody's seat, otherwise the first door that lands here. */
static int firstWayIn(const Map *mp, int m) {
  int i, j;
  for (i = 0; i < HOUSE_COUNT; i++) {
    if (houses[i].startMap == m) {
      flood(mp, houses[i].startX, houses[i].startY);
      return houses[i].startY * mp->w + houses[i].startX;
    }
  }
  for (i = 0; i < MAP_COUNT; i++) {
    for (j = 0; j < maps[i].warpCount; j++) {
      if (maps[i].warps[j].to == m) {
        flood(mp, maps[i].warps[j].tx, maps[i].warps[j].ty);
        return maps[i].warps[j].ty * mp->w + maps[i].warps[j].tx;
      }
    }
  }
  /* A berth is a way in that is not a door. Hardhome has no road to it at all
     - a ship out of Eastwatch is the only way anybody gets there, which is most
     of the point of the place - and without this the whole map read as ground
     nobody could stand on and everybody on it as unreachable. */
  for (i = 0; i < PORT_COUNT; i++) {
    if (ports[i].map == m) {
      flood(mp, ports[i].x, ports[i].y);
      return ports[i].y * mp->w + ports[i].x;
    }
  }
  return -1;
}

static int standNextTo(const Map *m, int x, int y) {
  int i;
  for (i = 0; i < 4; i++) {
    int nx = x + DIR_X[i], ny = y + DIR_Y[i];
    if (nx < 0 || ny < 0 || nx >= m->w || ny >= m->h) continue;
    if (standable[ny * m->w + nx]) return 1;
    /* Or across a counter, the way the game lets you: a stallholder stands
       behind theirs and is spoken to over it. Without this, giving a shop a
       counter that runs the width of the room reads as walling the shopkeeper
       in, which is exactly what it used to be. */
    if (m->counter[ny * m->w + nx]) {
      int bx = nx + DIR_X[i], by = ny + DIR_Y[i];
      if (bx >= 0 && by >= 0 && bx < m->w && by < m->h
          && standable[by * m->w + bx]) return 1;
    }
  }
  return 0;
}

static const Warp *warpOn(const Map *m, int x, int y) {
  int i;
  for (i = 0; i < m->warpCount; i++) if (m->warps[i].x == x && m->warps[i].y == y) return &m->warps[i];
  return 0;
}

/* Every character the cartridge will ever try to draw has to have a glyph, or
   it comes out as a hole in the middle of a word. */
static void checkText(const char *what, const char *s) {
  const char *p;
  for (p = s; *p; p++) {
    unsigned char c = (unsigned char)*p;
    if (c == '\n') continue;
    if (c > 126 || glyphOf[c & 127] == 0) {
      if (c == ' ') continue;
      bad("%s: no glyph for '%c' (%d) in \"%.44s\"", what, c >= 32 && c < 127 ? c : '?', c, s);
      return;
    }
  }
}

/* And it has to fit the window it is put in. */
static void checkFits(const char *what, const char *s, int rows) {
  speaker = 0;
  wrapText(s, TXT_W - 22);
  if (lineCount > MAX_LINES - 1) bad("%s: %d lines is more than the window can page", what, lineCount);
  (void)rows;
}

/* One duel, starting from the health you walk in with. Returns 1 if you win,
   and leaves what you have left in *hp. The cartridge's own arithmetic. */
static int duelOnce(int level, int who, int *hp) {
  const Duellist *d = &duellists[who];
  /* Whatever the cartridge would make of them where the player is standing:
     a leader on their rung, a named face at their own number, and everybody
     else shifted to the road you actually walked in on. Reading the baked
     numbers instead was reading a different game. */
  int lv = levelOf(who);
  Kit k = kitOf(who, lv);
  u8 piece[3];
  int j2, turn, first;

  mine.name = "you"; mine.level = level;
  mine.maxHp = vigourFor(level);
  mine.hp = *hp;
  mine.might = mightFor(level);
  mine.guard = guardFor(level);
  mine.swiftness = swiftFor(level);
  mine.tech = myTechs;
  mine.defending = 0;
  mine.maxWind = mine.wind = windFor(level);
  mine.stagger = mine.broken = mine.bleeding = mine.burning = 0;

  theirs.name = d->name; theirs.level = lv;
  theirs.maxHp = theirs.hp = scaleTo(d->vigour, d->level, lv);
  theirs.might = scaleTo(d->might, d->level, lv);
  theirs.guard = scaleTo(d->guard, d->level, lv);
  theirs.swiftness = scaleTo(d->swiftness, d->level, lv);
  theirs.tech = d->tech;
  theirs.defending = 0;
  theirs.maxWind = theirs.wind = windFor(lv);
  theirs.stagger = theirs.broken = theirs.bleeding = theirs.burning = 0;
  /* Weapon and mail only, the way the cartridge fights them: the shield is on
     their back until you take it off them. */
  piece[0] = k.arm; piece[1] = k.mail;
  piece[2] = (kitHash(who) & 1) ? k.shield : KIT_NONE;
  for (j2 = 0; j2 < 3; j2++) {
    if (piece[j2] == KIT_NONE) continue;
    theirs.might += wares[piece[j2]].might;
    theirs.guard += wares[piece[j2]].guard;
    theirs.swiftness += wares[piece[j2]].swiftness;
  }
  if (theirs.swiftness < 1) theirs.swiftness = 1;

  first = mine.swiftness >= theirs.swiftness;
  for (turn = 0; turn < 200 && mine.hp > 0 && theirs.hp > 0; turn++) {
    /* The best thing you have the wind for, and a guard when you have not the
       wind for anything. Picking the biggest number every single turn is what
       the wind was put in to punish, so a check that still does it is measuring
       a player nobody would be. */
    int mineTech = myTechs[3], best = -1, j3;
    for (j3 = 0; j3 < 3; j3++) {
      const Tech *tt = &techniques[myTechs[j3]];
      int score = tt->power * tt->accuracy;
      if (tt->wind > mine.wind) continue;
      if (score > best) { best = score; mineTech = myTechs[j3]; }
    }
    if (first) {
      if (swingQuiet(&mine, &theirs, mineTech)) break;
      if (swingQuiet(&theirs, &mine, d->tech[roll(4)])) break;
    } else {
      if (swingQuiet(&theirs, &mine, d->tech[roll(4)])) break;
      if (swingQuiet(&mine, &theirs, mineTech)) break;
    }
    roundEndsQuiet(&mine, &theirs);
    if (mine.hp <= 0 || theirs.hp <= 0) break;
  }
  *hp = mine.hp;
  return theirs.hp <= 0 && mine.hp > 0;
}

/* Fights one duellist `tries` times with a player of the given level carrying
   whatever `you` is carrying, and returns wins in a hundred. It is the
   cartridge's own swing(): same damage formula, same crits, same guard, same
   technique table, same kit on them. */
static int winRate(int level, int who, int tries) {
  int wins = 0, t;
  int wasLevel = you.level;
  u8 wasWeapon = you.WORN_WEAPON, wasArmour = you.WORN_ARMOUR, wasShield = you.WORN_SHIELD;
  const Duellist *d = &duellists[who];

  int lv = levelOf(who);

  you.level = level;
  reckonTechniques();
  for (t = 0; t < tries; t++) {
    int turn, first;
    Kit k = kitOf(who, lv);
    u8 piece[3];
    int j2;

    mine.name = "you"; mine.level = level;
    mine.maxHp = mine.hp = vigourFor(level);
    mine.might = mightFor(level);
    mine.guard = guardFor(level);
    mine.swiftness = swiftFor(level);
    mine.tech = myTechs;
    mine.defending = 0;
    mine.maxWind = mine.wind = windFor(level);
    mine.stagger = mine.broken = mine.bleeding = mine.burning = 0;

    theirs.name = d->name; theirs.level = lv;
    theirs.maxHp = theirs.hp = scaleTo(d->vigour, d->level, lv);
    theirs.might = scaleTo(d->might, d->level, lv);
    theirs.guard = scaleTo(d->guard, d->level, lv);
    theirs.swiftness = scaleTo(d->swiftness, d->level, lv);
    theirs.tech = d->tech;
    theirs.defending = 0;
    theirs.maxWind = theirs.wind = windFor(lv);
    theirs.stagger = theirs.broken = theirs.bleeding = theirs.burning = 0;
    piece[0] = k.arm; piece[1] = k.mail; piece[2] = k.shield;
    for (j2 = 0; j2 < 3; j2++) {
      if (piece[j2] == KIT_NONE) continue;
      theirs.might += wares[piece[j2]].might;
      theirs.guard += wares[piece[j2]].guard;
      theirs.swiftness += wares[piece[j2]].swiftness;
    }
    if (theirs.swiftness < 1) theirs.swiftness = 1;

    first = mine.swiftness >= theirs.swiftness;
    for (turn = 0; turn < 200 && mine.hp > 0 && theirs.hp > 0; turn++) {
      /* A player picks the best technique they have the wind for and guards
         when they have not; the foe picks at random, which is what the
         cartridge has them do. */
      int mineTech = myTechs[3], best = -1, j3;
      for (j3 = 0; j3 < 3; j3++) {
        const Tech *tt = &techniques[myTechs[j3]];
        int score = tt->power * tt->accuracy;
        if (tt->wind > mine.wind) continue;
        if (score > best) { best = score; mineTech = myTechs[j3]; }
      }
      if (first) {
        if (swingQuiet(&mine, &theirs, mineTech)) break;
        if (swingQuiet(&theirs, &mine, d->tech[roll(4)])) break;
      } else {
        if (swingQuiet(&theirs, &mine, d->tech[roll(4)])) break;
        if (swingQuiet(&mine, &theirs, mineTech)) break;
      }
      roundEndsQuiet(&mine, &theirs);
    }
    if (theirs.hp <= 0 && mine.hp > 0) wins++;
  }
  you.level = wasLevel;
  you.WORN_WEAPON = wasWeapon; you.WORN_ARMOUR = wasArmour; you.WORN_SHIELD = wasShield;
  reckonTechniques();
  return wins * 100 / tries;
}

/* How many fights of your own standing you get through in a row, starting whole
   and getting a sixth of your wind back on each win, the way the cartridge
   gives it back. Averaged over `tries` runs. */
static int runLength(int level, int tries) {
  int total = 0, t;
  int wasLevel = you.level;
  you.level = level;
  reckonTechniques();
  for (t = 0; t < tries; t++) {
    int hp = vigourFor(level), run = 0, guard = 0;
    while (run < 40) {
      int who = -1, tried;
      /* Somebody of about your own standing, picked at random. */
      for (tried = 0; tried < 200 && who < 0; tried++) {
        int c = (int)roll(DUELLIST_COUNT);
        if (duellists[c].level >= level - 2 && duellists[c].level <= level + 2) who = c;
      }
      if (who < 0) break;
      if (!duelOnce(level, who, &hp)) break;
      run++;
      hp += vigourFor(level) / 6 + 4;
      if (hp > vigourFor(level)) hp = vigourFor(level);
      (void)guard;
    }
    total += run;
  }
  you.level = wasLevel;
  reckonTechniques();
  return total / tries;
}

int main(void) {
  int m, i, j, seen[MAP_COUNT], q[MAP_COUNT], head = 0, tail = 0, reached = 0, wayIn = -1;
  int totalNpc = 0, totalSign = 0, totalWarp = 0;

  gbaMem = calloc(0x03000400u, 1);
  buildGlyphTable();

  for (m = 0; m < MAP_COUNT; m++) totalNpc += maps[m].npcCount;
  printf("\nAuditing %d maps, %d people, %d duellists, %d techniques.\n\n",
    MAP_COUNT, totalNpc, DUELLIST_COUNT, TECH_COUNT);
  totalNpc = 0;

  /* --- can you get everywhere, and back again? ------------------------- */
  for (i = 0; i < MAP_COUNT; i++) seen[i] = 0;
  /* Every house begins at its own seat now, so the world has to be walkable
     from all five of them, not just from the Stark yard. */
  for (i = 0; i < HOUSE_COUNT; i++) {
    if (!seen[houses[i].startMap]) { seen[houses[i].startMap] = 1; q[tail++] = houses[i].startMap; }
  }
  while (head < tail) {
    const Map *cur = &maps[q[head++]];
    for (i = 0; i < cur->warpCount; i++) {
      int to = cur->warps[i].to;
      if (to < 0 || to >= MAP_COUNT) { bad("%s: a door leads to map %d", cur->name, to); continue; }
      if (!seen[to]) { seen[to] = 1; q[tail++] = to; }
    }
    /* Not every way through the world is a door. Standing anywhere there is a
       harbourmaster opens every berth on the passage list, which is the only
       reason the Free Cities are on the cartridge at all - there is no road to
       Braavos and there was never going to be one. */
    for (i = 0; i < cur->npcCount; i++) {
      if (!cur->npcs[i].sails) continue;
      for (j = 0; j < PORT_COUNT; j++) {
        int to = ports[j].map;
        if (to < 0 || to >= MAP_COUNT) { bad("a berth at map %d, which is not a map", to); continue; }
        if (!seen[to]) { seen[to] = 1; q[tail++] = to; }
      }
    }
  }
  for (i = 0; i < MAP_COUNT; i++) {
    if (seen[i]) reached++;
    else bad("%s cannot be reached from the yard you start in", maps[i].name);
  }

  for (m = 0; m < MAP_COUNT; m++) {
    const Map *map = &maps[m];
    totalNpc += map->npcCount;
    totalSign += map->signCount;
    totalWarp += map->warpCount;

    wayIn = -1;
    if (map->w * 2 > 64 || map->h * 2 > 64) bad("%s is %dx%d, too big for the screen map", map->name, map->w, map->h);
    if (map->tileCount > 512) bad("%s needs %d tiles, video memory holds 512", map->name, map->tileCount);
    if (map->residentCount > 12) bad("%s needs %d appearances resident", map->name, map->residentCount);
    if (map->npcCount > MAX_CROWD) bad("%s has %d people, the crowd holds %d", map->name, map->npcCount, MAX_CROWD);
    checkText("a map name", map->name);

    /* --- can you walk to everything on this map? ------------------------ */
    /* Flood from ONE way in, not from all of them at once.
       Flooding from every entrance hides exactly the fault that matters: a tile
       that cuts the map in two is invisible if each half still has a door of
       its own, because both halves stay reachable. That is how a brother of the
       Watch standing in the gate tunnel - which seals the road north - got past
       this check and into a playthrough. From one way in, a cut is a cut. */
    memset(standable, 0, sizeof standable);
    wayIn = firstWayIn(map, m);
    for (i = 0; i < map->npcCount; i++) {
      const Npc *n = &map->npcs[i];
      if (n->x < map->w && n->y < map->h && !standNextTo(map, n->x, n->y)) {
        bad("%s: there is no walking up to %s at %d,%d", map->name, n->name, n->x, n->y);
      }
    }
    for (i = 0; i < map->signCount; i++) {
      const Sign *g = &map->signs[i];
      if (g->x < map->w && g->y < map->h && !standNextTo(map, g->x, g->y)) {
        bad("%s: there is no walking up to the sign at %d,%d", map->name, g->x, g->y);
      }
    }
    for (i = 0; i < map->warpCount; i++) {
      const Warp *w = &map->warps[i];
      if (w->x < map->w && w->y < map->h && !standable[w->y * map->w + w->x]) {
        bad("%s: there is no walking to the door at %d,%d", map->name, w->x, w->y);
      }
    }

    /* --- tiles that would shut the map if somebody stood still on them ---- */
    /* Take each tile out of the map in turn and see what stops being reachable.
       Anything that cuts the map in two is a gateway, and a roamer idling in a
       gateway seals half the world until they happen to move. The cartridge
       keeps them out of doorways and ledge gaps; anything else that turns up
       here is a gateway nothing is keeping them out of. */
    {
      int whole = 0, x, y;
      (void)wayIn;
      for (i = 0; i < map->w * map->h; i++) if (standable[i]) whole++;
      for (y = 0; y < map->h; y++) for (x = 0; x < map->w; x++) {
        int again = 0, k, reachedFrom = -1;
        if (!standable[y * map->w + x]) continue;
        /* Taking out the tile the flood starts from floods nothing at all and
           reports the entire map as cut off, which is an artefact of the test
           rather than anything a person standing there would do. */
        if (y * map->w + x == wayIn) continue;
        if (nearWarpOn(map, x, y) || ledgeGateOn(map, x, y)
            || gateOn(map, x, y)) continue;
        /* Nobody roams more than three tiles from where they belong, so a tile
           no NPC can get to cannot be blocked by one. */
        for (k = 0; k < map->npcCount; k++) {
          int dx = map->npcs[k].x - x, dy = map->npcs[k].y - y;
          if (dx < 0) dx = -dx;
          if (dy < 0) dy = -dy;
          if (dx <= 3 && dy <= 3) { reachedFrom = k; break; }
        }
        if (reachedFrom < 0) continue;

        blocked = y * map->w + x;
        memcpy(spare, standable, sizeof spare);
        memset(standable, 0, sizeof standable);
        firstWayIn(map, m);
        for (k = 0; k < map->w * map->h; k++) if (standable[k]) again++;

        /* Cutting a broom cupboard off behind a counter costs nobody anything.
           What matters is whether anything you need is on the far side of them:
           a door, a sign, somebody to talk to, or simply a lot of map. */
        if (again < whole - 1) {
          int lostDoor = 0, lostFace = 0, j2;
          int lost = whole - 1 - again;
          for (j2 = 0; j2 < map->warpCount; j2++) {
            const Warp *w2 = &map->warps[j2];
            if (spare[w2->y * map->w + w2->x] && !standable[w2->y * map->w + w2->x]) lostDoor = 1;
          }
          for (j2 = 0; j2 < map->npcCount; j2++) {
            const Npc *n2 = &map->npcs[j2];
            if (j2 == reachedFrom) continue;
            if (n2->x < map->w && n2->y < map->h && !standNextTo(map, n2->x, n2->y)) lostFace = 1;
          }
          for (j2 = 0; j2 < map->signCount; j2++) {
            const Sign *g2 = &map->signs[j2];
            if (g2->x < map->w && g2->y < map->h && !standNextTo(map, g2->x, g2->y)) lostFace = 1;
          }
          if (lostDoor || lostFace || lost > 8) {
            bad("%s: %s can stand at %d,%d and shut %d tiles off%s",
              map->name, map->npcs[reachedFrom].name, x, y, lost,
              lostDoor ? ", a door among them" : lostFace ? ", and somebody with it" : "");
          }
        }
        blocked = -1;
        memcpy(standable, spare, sizeof spare);
      }
    }

    /* --- doors ---------------------------------------------------------- */
    for (i = 0; i < map->warpCount; i++) {
      const Warp *w = &map->warps[i];
      const Map *to = &maps[w->to];
      int back = 0;
      if (solidOn(map, w->x, w->y)) bad("%s: the door at %d,%d is inside a wall", map->name, w->x, w->y);
      if (solidOn(to, w->tx, w->ty)) {
        bad("%s: the door at %d,%d puts you inside a wall in %s", map->name, w->x, w->y, to->name);
      }
      if (warpOn(to, w->tx, w->ty)) {
        bad("%s: the door at %d,%d lands you on another door in %s", map->name, w->x, w->y, to->name);
      }
      for (j = 0; j < to->npcCount; j++) {
        if (to->npcs[j].x == w->tx && to->npcs[j].y == w->ty) {
          note("%s: the door at %d,%d lands on %s, who gets stepped aside",
            map->name, w->x, w->y, to->npcs[j].name);
        }
      }
      for (j = 0; j < to->warpCount; j++) if (to->warps[j].to == m) back = 1;
      if (!back) note("%s: the door at %d,%d into %s has no door back", map->name, w->x, w->y, to->name);
    }

    /* --- can one person standing still shut this map? --------------------- */
    /* Somebody idling in a one-tile alley of a warren cuts the map in two, and
       the flood above will not see it because the tile is walkable. Anybody who
       starts on a tile with two open sides and no way round is a blockage
       waiting to happen. */
    for (i = 0; i < map->npcCount; i++) {
      const Npc *n = &map->npcs[i];
      int ways = 0, j2;
      if (n->x >= map->w || n->y >= map->h) continue;
      for (j2 = 0; j2 < 4; j2++) {
        if (!solidOn(map, n->x + DIR_X[j2], n->y + DIR_Y[j2])) ways++;
      }
      if (ways != 2) continue;
      /* Two open sides is a corridor. Take the tile out and see what strands. */
      blocked = n->y * map->w + n->x;
      memset(standable, 0, sizeof standable);
      firstWayIn(map, m);
      blocked = -1;
      {
        int lost = 0, k2;
        memset(spare, 0, sizeof spare);
        for (k2 = 0; k2 < map->w * map->h; k2++) {
          if (solidOn(map, k2 % map->w, k2 / map->w) || standable[k2]) continue;
          if (k2 == n->y * map->w + n->x) continue;
          lost++;
        }
        if (lost > 3) {
          bad("%s: %s stands in a corridor, and standing there shuts %d tiles off",
            map->name, n->name, lost);
        }
      }
    }
    memset(standable, 0, sizeof standable);
    firstWayIn(map, m);

    /* --- is there room to get at every door? ----------------------------- */
    /* A door with exactly one tile you can stand on to use it is a door one
       person can shut. The Great Keep of Winterfell had its only approach
       occupied by Jory Cassel from the moment the game started, so the eighth
       sigil could not be reached at all - and nothing here said so, because the
       tile was walkable and the map was still connected. */
    for (i = 0; i < map->warpCount; i++) {
      const Warp *w = &map->warps[i];
      int ways = 0, j2, only = -1;
      for (j2 = 0; j2 < 4; j2++) {
        int nx = w->x + DIR_X[j2], ny = w->y + DIR_Y[j2];
        if (nx < 0 || ny < 0 || nx >= map->w || ny >= map->h) continue;
        if (solidOn(map, nx, ny) || ledgeOn(map, nx, ny)) continue;
        if (warpOn(map, nx, ny)) continue;
        ways++; only = ny * map->w + nx;
      }
      if (ways == 0) {
        bad("%s: the door at %d,%d has nowhere to stand to use it", map->name, w->x, w->y);
      } else if (ways == 1) {
        for (j2 = 0; j2 < map->npcCount; j2++) {
          if (map->npcs[j2].y * map->w + map->npcs[j2].x == only) {
            bad("%s: the only way to the door at %d,%d is the tile %s stands on",
              map->name, w->x, w->y, map->npcs[j2].name);
          }
        }
      }
    }

    /* --- people --------------------------------------------------------- */
    for (i = 0; i < map->npcCount; i++) {
      const Npc *n = &map->npcs[i];
      if (n->x >= map->w || n->y >= map->h) { bad("%s: %s stands off the map", map->name, n->name); continue; }
      if (solidOn(map, n->x, n->y)) bad("%s: %s stands inside a wall", map->name, n->name);
      if (warpOn(map, n->x, n->y)) bad("%s: %s stands in a doorway", map->name, n->name);
      if (!walkableNeighbour(map, n->x, n->y)) bad("%s: nobody can stand next to %s", map->name, n->name);
      if (n->bank >= map->residentCount) bad("%s: %s wears an appearance that is not loaded", map->name, n->name);
      if (n->duellist >= DUELLIST_COUNT) bad("%s: %s fights as duellist %d", map->name, n->name, n->duellist);
      if (!n->name[0]) bad("%s: somebody at %d,%d has no name", map->name, n->x, n->y);
      if (!n->line[0]) bad("%s: %s has nothing to say", map->name, n->name);
      if (strstr(n->line, "nothing to say to you today")) {
        bad("%s: %s still has the placeholder line", map->name, n->name);
      }
      checkText(n->name, n->name);
      checkText(n->name, n->line);
      checkFits(n->name, n->line, 2);
      if (textWidth(n->name) > TXT_W - 40) note("%s: the name \"%s\" is wide for its plate", map->name, n->name);
      for (j = 0; j < map->npcCount; j++) {
        if (j != i && map->npcs[j].x == n->x && map->npcs[j].y == n->y) {
          bad("%s: %s and %s stand on the same tile", map->name, n->name, map->npcs[j].name);
        }
      }
    }

    /* --- signs ---------------------------------------------------------- */
    for (i = 0; i < map->signCount; i++) {
      const Sign *g = &map->signs[i];
      if (g->x >= map->w || g->y >= map->h) { bad("%s: a sign is off the map", map->name); continue; }
      if (!solidOn(map, g->x, g->y)) note("%s: the sign at %d,%d can be walked over", map->name, g->x, g->y);
      if (!walkableNeighbour(map, g->x, g->y)) bad("%s: the sign at %d,%d cannot be read from anywhere", map->name, g->x, g->y);
      checkText("a sign", g->text);
      checkFits("a sign", g->text, 3);
    }
  }

  /* --- the people you fight --------------------------------------------- */
  for (i = 0; i < DUELLIST_COUNT; i++) {
    const Duellist *d = &duellists[i];
    if (d->level < 1 || d->level > 60) bad("%s is level %d", d->name, d->level);
    if (d->vigour < 1) bad("%s has no health", d->name);
    if (!d->might || !d->guard || !d->swiftness) bad("%s has a stat of nothing", d->name);
    for (j = 0; j < 4; j++) if (d->tech[j] >= TECH_COUNT) bad("%s knows technique %d", d->name, d->tech[j]);
    if (!d->intro[0] || !d->defeat[0]) bad("%s has no lines", d->name);
    checkText(d->name, d->name);
    checkText(d->name, d->intro);
    checkText(d->name, d->defeat);
    checkFits(d->name, d->intro, 2);
    checkFits(d->name, d->defeat, 2);
    if (textWidth(d->name) > 108) note("the duel plate is tight for \"%s\"", d->name);
  }

  /* --- what everybody is carrying ---------------------------------------- */
  /* You start with nothing, so the road has to dress you. Two things matter:
     that nobody is carrying something that does not exist, and that the people
     you meet first are carrying something at all - a bare-handed player who
     beats three knights and comes away with nothing has been left in a hole. */
  {
    int armsEarly = 0, early = 0, dearest = 0, dearestAt = -1, dearestWare = -1;
    int remedies = 0, pieces = 0;
    for (i = 0; i < DUELLIST_COUNT; i++) {
      Kit k = kitOf(i, duellists[i].level);
      u8 piece[5];
      int j2, has = 0;
      piece[0] = k.arm; piece[1] = k.mail; piece[2] = k.shield;
      piece[3] = k.helm; piece[4] = k.gloves;
      for (j2 = 0; j2 < 5; j2++) {
        static const int WANT[5] = { WARE_WEAPON, WARE_ARMOUR, WARE_SHIELD,
                                     WARE_HELM, WARE_GLOVES };
        static const char *CALLED[5] = { "weapon", "mail", "shield", "helm", "pair of gloves" };
        if (piece[j2] == KIT_NONE) continue;
        if (piece[j2] >= WARE_COUNT) {
          bad("%s carries ware %d", duellists[i].name, piece[j2]);
          continue;
        }
        if (wares[piece[j2]].kind != WANT[j2]) {
          bad("%s carries a %s where a %s belongs", duellists[i].name,
            wares[piece[j2]].name, CALLED[j2]);
        }
        if (wares[piece[j2]].price > dearest) {
          dearest = wares[piece[j2]].price; dearestAt = i; dearestWare = piece[j2];
        }
        has = 1;
        pieces++;
      }
      if (k.remedy != KIT_NONE) {
        if (k.remedy >= WARE_COUNT || wares[k.remedy].kind != WARE_POTION) {
          bad("%s carries ware %d to drink", duellists[i].name, k.remedy);
        } else remedies++;
      }
      if (duellists[i].level <= 5) { early++; if (has) armsEarly++; }
    }
    /* Low-level people having nothing is the point: bare fists against bare
       fists is a fight. What would sink the game is nobody near the start
       having a weapon at all, because then there is nothing to take. */
    {
      int firstBlade = 99, j3;
      for (j3 = 0; j3 < DUELLIST_COUNT; j3++) {
        Kit kk = kitOf(j3, duellists[j3].level);
        if (kk.arm != KIT_NONE && duellists[j3].level < firstBlade) firstBlade = duellists[j3].level;
      }
      note("%d of the first %d carry something; %d pieces over %d people; "
           "%d carry a remedy; the first weapon on anybody is at level %d",
        armsEarly, early, pieces, DUELLIST_COUNT, remedies, firstBlade);
      if (firstBlade > 10) {
        bad("the first weapon on anybody is at level %d: a player who starts with "
            "nothing has nothing to take for far too long", firstBlade);
      }
    }
    if (dearestAt >= 0) {
      note("the best thing on anybody is %s, on %s at level %d",
        wares[dearestWare].name, duellists[dearestAt].name, duellists[dearestAt].level);
    }
  }

  /* --- can somebody with nothing get started? ----------------------------- */
  /* The one number that decides whether the game has an opening at all: you go
     out of the gate bare-handed, so the people you meet first have to be
     beatable bare-handed. This fights every duellist a thousand times over,
     with the cartridge's own damage formula and the cartridge's own idea of
     what everybody is carrying, and says what a player of that standing would
     win. Anything under a third at the level you meet them is a wall, not a
     fight. */
  {
    int lv, worstAt = -1, worstWin = 101;
    for (i = 0; i < DUELLIST_COUNT; i++) {
      int wins;
      lv = duellists[i].level;
      if (lv > 8) continue;                  /* only the opening matters here */
      wins = winRate(lv < 5 ? 5 : lv, i, 400);
      if (wins < worstWin) { worstWin = wins; worstAt = i; }
    }
    if (worstAt >= 0) {
      note("bare-handed at their own level, the hardest of the first fights is "
           "%s at level %d: %d wins in a hundred",
        duellists[worstAt].name, duellists[worstAt].level, worstWin);
      /* Deliberately a note and not a failure. You go out of the gate with
         nothing while everybody on the road has a build and a kit, so a fighter
         of your own level is meant to be beyond you until you have taken
         something off somebody smaller. What has to hold is that there is
         somebody smaller - and that is the per-house check below, which fights
         the people actually within one door of each bed. */
    }
  }

  /* --- is the ground each house starts on winnable? ----------------------- */
  /* The check that was missing. Every house begins at its own seat, and the
     seats are not equally gentle: the weakest fighter within one door of
     Winterfell is level three and of Casterly Rock twenty-seven. A player who
     wakes up somewhere they cannot beat a single person has not been given a
     harder game, they have been given no game, and the balance figures for
     "your own standing" will never say so - the people by your bed are not of
     your standing. So this fights the ones who actually are by your bed. */
  for (m = 0; m < HOUSE_COUNT; m++) {
    const House *h = &houses[m];
    int near[MAP_COUNT], start = h->startMap, wins = 0, fights = 0, best = 0, lowest = 99;
    int j2, k;
    u8 wasW = you.WORN_WEAPON, wasA = you.WORN_ARMOUR, wasS = you.WORN_SHIELD;
    int wasHouse = you.house, wasWorld = worldId;
    /* Ask the question as this house, not as the North. Difficulty is measured
       from the player's own seat now, so reading the baked numbers here was
       asking whether a Dornishman could survive Winterfell's arithmetic while
       standing in Sunspear. */
    you.house = m; layLadder();
    for (j2 = 0; j2 < MAP_COUNT; j2++) near[j2] = (j2 == start);
    for (j2 = 0; j2 < MAP_COUNT; j2++) {
      for (k = 0; k < maps[j2].warpCount; k++) {
        if (j2 == start) near[maps[j2].warps[k].to] = 1;
        else if (maps[j2].warps[k].to == start) near[j2] = 1;
      }
    }
    /* Bare-handed, the way everybody actually starts. */
    you.WORN_WEAPON = 0; you.WORN_ARMOUR = 0; you.WORN_SHIELD = 0;
    for (j2 = 0; j2 < MAP_COUNT; j2++) {
      if (!near[j2]) continue;
      worldId = j2;
      for (k = 0; k < maps[j2].npcCount; k++) {
        int rate, at;
        if (!maps[j2].npcs[k].fights) continue;
        at = levelOf(maps[j2].npcs[k].duellist);
        if (at < lowest) lowest = at;
        rate = winRate(h->startLevel, maps[j2].npcs[k].duellist, 200);
        if (rate > best) best = rate;
        wins += rate; fights++;
      }
    }
    you.WORN_WEAPON = wasW; you.WORN_ARMOUR = wasA; you.WORN_SHIELD = wasS;
    if (fights) {
      /* The average is dragged about by whoever the hardest person nearby
         happens to be, and that is not the question. The question is whether
         there is somebody there you can start on, so the number that decides it
         is the easiest fight within one door of your own bed. */
      note("%s starts at level %d beside %d fighters from level %d up: %d in a "
           "hundred against the easiest of them bare-handed, %d on average",
        h->name, h->startLevel, fights, lowest, best, wins / fights);
      {
        int gentle = 0, j3, k3;
        for (j3 = 0; j3 < MAP_COUNT; j3++) {
          if (!near[j3]) continue;
          worldId = j3;
          for (k3 = 0; k3 < maps[j3].npcCount; k3++) {
            if (maps[j3].npcs[k3].fights
                && levelOf(maps[j3].npcs[k3].duellist) <= 8) gentle++;
          }
        }
        if (gentle < 2) {
          bad("%s wakes at %s with %d people of their own size within one door: "
              "a level five needs somebody to start on",
            h->name, maps[start].name, gentle);
        }
      }
      if (best < 45) {
        bad("%s wakes up at %s and beats even the easiest person within one door "
            "%d times in a hundred: there is nobody there they can start on",
          h->name, maps[start].name, best);
      }
    }
    you.house = wasHouse; worldId = wasWorld; layLadder();
  }

  /* --- can you get off every map you can be put down on? ------------------ */
  /* A map with no door on it is reached by ship and left by ship, and leaving
     by ship means talking to somebody who sails. Hardhome had a berth, no
     doors, and nobody on the beach who would take you off it - so sailing
     there once ended the cartridge, and the wandering run proved it by
     finishing every one of its playthroughs standing on that shingle.
     A map you can arrive at and not leave is the worst thing this game can do
     to a player, and nothing was checking for it. */
  for (m = 0; m < MAP_COUNT; m++) {
    int sailors = 0, k2, berth = 0;
    if (maps[m].warpCount) continue;
    for (k2 = 0; k2 < PORT_COUNT; k2++) if (ports[k2].map == m) berth = 1;
    if (!berth) {
      bad("%s has no door and no berth: nobody can reach it at all", maps[m].name);
      continue;
    }
    for (k2 = 0; k2 < maps[m].npcCount; k2++) if (maps[m].npcs[k2].sails) sailors++;
    if (!sailors) {
      bad("%s is reached by ship, has no door, and nobody on it will sail you "
          "off again: arriving there ends the game", maps[m].name);
    }
    /* And having somebody there is not enough if he wants paying. A purse
       spent fighting across the hardest ground in the world is the normal way
       to arrive at the far side of it. */
    {
      int wasWorld = worldId, wasGold = you.gold, out = 0;
      worldId = m;
      world = &maps[m];
      you.gold = 0;
      for (k2 = 0; k2 < PORT_COUNT; k2++) {
        if (ports[k2].map == m) continue;
        if (!sailTo(k2)) { out = 1; break; }
      }
      worldId = wasWorld;
      world = &maps[wasWorld];
      you.gold = wasGold;
      if (!out) {
        bad("%s can be left by ship only, and only by somebody who can still "
            "pay the fare", maps[m].name);
      }
    }
  }

  /* --- does the world ever notice you? ------------------------------------ */
  /* Every line people add about you has to be one somebody can actually earn,
     and the list has to be ordered mild to rare - the cartridge keeps the last
     one that fits, so a general line written after a specific one buries it
     and nobody ever reads the specific one again. */
  {
    int r, reachable = 0;
    int wasKills = you.kills, wasSig = sigils, k;
    for (r = 0; r < REGARD_COUNT; r++) {
      if (regard[r].sigils > LEADER_COUNT) {
        bad("a regard line wants %d sigils and there are only %d in the world",
          regard[r].sigils, LEADER_COUNT);
      }
      if (regard[r].host > HOST_MAX) {
        bad("a regard line wants %d sworn swords and only %d can follow you",
          regard[r].host, HOST_MAX);
      }
      if (regard[r].needs != 255 && regard[r].needs == regard[r].denies) {
        bad("a regard line needs and forbids the same thing");
      }
      /* Set everything this line asks for and nothing else, and see whether it
         is the one that gets said. If a later line is broader it will win here
         and this one is dead text. */
      for (k = 0; k < STORY_WORDS; k++) storyFlags[k] = 0;
      for (k = 0; k < HOST_MAX; k++) you.host[k].kind = 255;
      sigils = 0;
      for (k = 0; k < regard[r].sigils && k < LEADER_COUNT; k++) sigils |= (u16)(1u << k);
      for (k = 0; k < regard[r].host; k++) swearIn(0, 10);
      you.kills = regard[r].kills;
      if (regard[r].needs != 255) setFlag(regard[r].needs);
      if (regardOf() == r) reachable++;
      else {
        bad("nobody will ever say \"%s\": a broader line further down the list "
            "always wins", regard[r].line);
      }
    }
    for (k = 0; k < STORY_WORDS; k++) storyFlags[k] = 0;
    for (k = 0; k < HOST_MAX; k++) you.host[k].kind = 255;
    you.kills = wasKills;
    sigils = wasSig;
    note("%d of %d lines about you can actually be earned", reachable, REGARD_COUNT);
    if (!reachable) bad("the world never notices anything about you");
  }

  /* --- is the ladder actually climbable? ---------------------------------- */
  /* The one question nobody had ever asked in numbers. The ladder tells you
     what level each seat expects; this fights that leader a thousand times at
     exactly that level, in exactly what somebody of that level is carrying,
     with the same half-again health and heavier arm that the cartridge gives a
     sigil-holder. A rung you win one time in five is not a hard fight, it is
     the end of the game with the rest of it still written. */
  {
    int r, worstAt = -1, worst = 100;
    int wasW = you.WORN_WEAPON, wasA = you.WORN_ARMOUR, wasS = you.WORN_SHIELD;
    int wasLevel = you.level;
    for (r = 0; r < LEADER_COUNT; r++) {
      int lv = leaderLevel[r], odds;
      Kit k = kitOf(lv * 7, lv);
      you.WORN_WEAPON = k.arm == KIT_NONE ? 0 : (u8)(k.arm + 1);
      you.WORN_ARMOUR = k.mail == KIT_NONE ? 0 : (u8)(k.mail + 1);
      you.WORN_SHIELD = k.shield == KIT_NONE ? 0 : (u8)(k.shield + 1);
      odds = winRate(lv, leaders[r].duellist, 400);
      note("rung %2d  %-22s at level %2d: %d wins in a hundred",
        r + 1, leaders[r].name, lv, odds);
      if (odds < worst) { worst = odds; worstAt = r; }
    }
    you.WORN_WEAPON = (u8)wasW; you.WORN_ARMOUR = (u8)wasA; you.WORN_SHIELD = (u8)wasS;
    you.level = wasLevel;
    reckonTechniques();
    if (worst < 25) {
      bad("%s wins %d times in a hundred at the level the ladder sends you in "
          "at: that rung is where the game stops, not where it gets hard",
        leaders[worstAt].name, worst);
    }
  }

  /* --- and does it stay a fight afterwards? ------------------------------- */
  /* Per-duel odds are the wrong question. You do not go into every fight whole:
     a win gives you back a sixth of your wind and nothing else, so what
     decides the road is how many fights you get through before somebody puts
     you down. Dress a player of each standing in what somebody of that standing
     carries and count the run. Ten in a row and the road is a walk; two and it
     is a wall. */
  {
    static const int AT[5] = { 5, 10, 15, 20, 25 };
    int a;
    for (a = 0; a < 5; a++) {
      int lv = AT[a], run;
      u8 wasW = you.WORN_WEAPON, wasA = you.WORN_ARMOUR, wasS = you.WORN_SHIELD;
      Kit k = kitOf(lv * 7, lv);
      you.WORN_WEAPON = k.arm == KIT_NONE ? 0 : (u8)(k.arm + 1);
      you.WORN_ARMOUR = k.mail == KIT_NONE ? 0 : (u8)(k.mail + 1);
      you.WORN_SHIELD = k.shield == KIT_NONE ? 0 : (u8)(k.shield + 1);
      run = runLength(lv, 300);
      you.WORN_WEAPON = wasW; you.WORN_ARMOUR = wasA; you.WORN_SHIELD = wasS;
      note("at level %d, in what a level %d carries, you get through %d fights "
           "of your own standing before somebody puts you down", lv, lv, run);
      if (run < 3) bad("level %d is a wall: %d fights in a row before you go down", lv, run);
      if (run > 25) bad("level %d is a walk: %d fights in a row before you go down", lv, run);
    }
  }

  /* --- techniques, and the four you carry -------------------------------- */
  for (i = 0; i < TECH_COUNT; i++) {
    if (techniques[i].accuracy < 50 || techniques[i].accuracy > 100) {
      bad("%s lands %d%% of the time", techniques[i].name, techniques[i].accuracy);
    }
    if (techniques[i].power > 130) bad("%s hits for %d", techniques[i].name, techniques[i].power);
    checkText(techniques[i].name, techniques[i].name);
  }
  for (i = 0; i < 4; i++) if (player_techs[i] >= TECH_COUNT) bad("you carry technique %d", player_techs[i]);

  /* --- houses ------------------------------------------------------------ */
  for (i = 0; i < HOUSE_COUNT; i++) {
    checkText(houses[i].full, houses[i].full);
    checkText(houses[i].full, houses[i].words);
    checkText(houses[i].full, houses[i].sworn);
    checkText(houses[i].full, houses[i].seat);
    for (j = 0; j < 4; j++) {
      if (houses[i].looks[j] >= ACTOR_COUNT) bad("%s has no body for kit %d", houses[i].full, j);
    }
    speaker = 0;
    wrapText(houses[i].sworn, TXT_W - 44);
    if (lineCount > 2) note("%s: the words at swearing run to %d lines, the card shows two", houses[i].full, lineCount);
  }

  /* --- the beasts --------------------------------------------------------- */
  {
    int tamable = 0, grows = 0, wildOn = 0, nests = 0;
    for (i = 0; i < BEAST_COUNT; i++) {
      const Beast *b = &beasts[i];
      checkText("a beast's name", b->name);
      if (!b->hp || !b->atk) bad("%s has no numbers to fight with", b->name);
      if (b->into != 255 && b->into >= BEAST_COUNT) bad("%s grows into nothing", b->name);
      if (b->into != 255 && !b->growAt) bad("%s grows into something at level nought", b->name);
      for (j = 0; j < 4; j++) {
        if (b->tech[j] >= TECH_COUNT) bad("%s fights with a technique that does not exist", b->name);
      }
      tamable += b->tame;
      grows += b->into != 255;
    }
    for (m = 0; m < MAP_COUNT; m++) {
      wildOn += maps[m].wildCount > 0;
      nests += maps[m].nest != 255;
      for (i = 0; i < maps[m].wildCount; i++) {
        if (maps[m].wilds[i].beast >= BEAST_COUNT) {
          bad("%s has an animal on it that does not exist", maps[m].name);
        }
      }
    }
    if (!nests) bad("there is nowhere in the world an egg can be found");
    note("%d beasts, %d can be taken alive, %d grow into something else; "
         "wild on %d maps, %d nests", BEAST_COUNT, tamable, grows, wildOn, nests);
    /* A snare nobody can ever use is a shop item that lies to the player. */
    for (i = 0; i < WARE_COUNT; i++) {
      if (wares[i].kind == WARE_SNARE && !wares[i].hold) {
        bad("%s would never hold anything", wares[i].name);
      }
    }
  }

  /* --- what can be bought ------------------------------------------------- */
  for (i = 0; i < WARE_COUNT; i++) {
    const Ware *w = &wares[i];
    /* Makings are not sold, and neither are the four things that can only be
       made. A price of nought on anything on a counter is still a fault. */
    if (w->kind == WARE_STUFF || w->kind == WARE_EGG) continue;
    if (!w->price) {
      int j2, listed = 0;
      for (j2 = 0; j2 < stalls[0].count; j2++) if (stalls[0].ware[j2] == i) listed = 1;
      for (j2 = 0; j2 < stalls[1].count; j2++) if (stalls[1].ware[j2] == i) listed = 1;
      if (listed) bad("%s is on a counter at no price", w->name);
    }
    if (w->kind >= WARE_KINDS) bad("%s is a kind of thing that does not exist", w->name);
    if (w->kind == WARE_POTION && !w->heal) bad("%s heals nothing", w->name);
    if (w->kind == WARE_ARMOUR && w->tier > 3) bad("%s puts you in body %d", w->name, w->tier);
    for (j = 0; j < w->techCount; j++) {
      if (w->tech[j] >= TECH_COUNT) bad("%s teaches technique %d", w->name, w->tech[j]);
    }
    checkText(w->name, w->name);
    if (textWidth(w->name) > 150) note("\"%s\" is wide for a shop list", w->name);
  }
  for (i = 0; i < 2; i++) {
    if (!stalls[i].count) bad("a stall with nothing on it");
    for (j = 0; j < stalls[i].count; j++) {
      if (stalls[i].ware[j] >= WARE_COUNT) bad("a stall selling ware %d", stalls[i].ware[j]);
    }
  }
  if (START_WEAPON < 0 || START_WEAPON >= WARE_COUNT) bad("the starting blade does not exist");
  /* A net has to be on the shelf a player who wants to catch something would
     actually read. They were only ever on the armourer's, which is the one
     shelf somebody looking for a way to take an animal alive has no reason to
     look at, so the whole half of the game about catching things was filed
     under ARMS AND ARMOUR. */
  {
    int st, nets = 0;
    for (st = 0; st < STALL_COUNT; st++) {
      int here = 0;
      for (j = 0; j < stalls[st].count; j++) {
        if (wares[stalls[st].ware[j]].kind == WARE_SNARE) here++;
      }
      if (here) note("nets on the %s shelf: %d", stallName[st], here);
      if (st == 0) nets = here;
    }
    if (!nets) bad("the remedies shelf, which is where a player looks, sells no net");
  }

  /* --- six at your heel, and no seventh ------------------------------------ */
  /* The party is the one thing in this game a wandering run cannot prove: the
     tester has to buy a net, wear an animal down to a third and roll well, and
     over a whole playthrough it managed that once. So the rules are checked
     here directly - it fills up, it refuses a seventh, the front one can be
     changed, and what is at your heel is what the duel picks up. */
  {
    int k, tookAll = 1;
    for (k = 0; k < PARTY_MAX; k++) you.party[k].kind = 255;
    you.lead = 0;
    you.level = 20;
    if (partyCount() != 0) bad("an empty party counts %d", partyCount());
    for (k = 0; k < PARTY_MAX; k++) {
      if (!keepBeast(k % BEAST_COUNT, 10 + k)) tookAll = 0;
    }
    if (!tookAll) bad("six would not fit in a party of six");
    if (partyCount() != PARTY_MAX) {
      bad("six taken and %d counted", partyCount());
    }
    if (partyRoom() >= 0) bad("a full party still reports room at %d", partyRoom());
    if (keepBeast(0, 10)) bad("a seventh got into a party of six");
    if (MY_BEAST.kind != you.party[0].kind) {
      bad("the first one taken is not the one at your heel");
    }
    /* Sending a different one out in front. */
    you.lead = 3;
    if (MY_BEAST.kind != you.party[3].kind) {
      bad("sending the fourth out in front did not change what is at your heel");
    }
    if (MY_BEAST.level != you.party[3].level) {
      bad("the one out in front is carrying somebody else's level");
    }
    for (k = 0; k < PARTY_MAX; k++) you.party[k].kind = 255;
    you.lead = 0;
  }

  /* --- health, remedies and the counter ------------------------------------ */
  /* Three complaints that a wandering run will never catch, because the tester
     never notices that it is always whole: levelling used to heal you to full,
     which meant almost every duel began at full health and a remedy could never
     find anything to mend. These check the three directly. */
  {
    int at = -1, i2, before, maxAt5;
    /* Growing gives you the difference in your maximum and nothing more. */
    you.level = 5;
    maxAt5 = vigourFor(5);
    mine.maxHp = maxAt5;
    you.hp = maxAt5 / 4;
    you.exp = expForLevel(6);
    shownExp = expForLevel(6) - 1;
    before = you.hp;
    windowOpen = 0;
    tickSpoils();
    if (you.level != 6) bad("enough experience did not take a level");
    if (you.hp >= vigourFor(6)) {
      bad("levelling still heals you to full (%d of %d)", you.hp, vigourFor(6));
    }
    if (you.hp != before + (vigourFor(6) - maxAt5)) {
      bad("levelling gave %d health, not the %d it added to your maximum",
        you.hp - before, vigourFor(6) - maxAt5);
    }

    /* A remedy mends you when you are hurt, and says so when you are not. */
    for (i2 = 0; i2 < WARE_COUNT; i2++) {
      if (wares[i2].kind == WARE_POTION && wares[i2].heal > 0
          && wares[i2].heal < 9999) { at = i2; break; }
    }
    if (at < 0) {
      bad("there is no remedy on the cartridge that mends anything");
    } else {
      you.level = 20;
      you.bag[at] = 2;
      you.hp = 10;
      if (!useWare(at)) bad("a remedy would not go down on a hurt man");
      if (you.hp != 10 + wares[at].heal) {
        bad("%s mended %d, not the %d it promises", wares[at].name,
          you.hp - 10, wares[at].heal);
      }
      if (you.bag[at] != 1) bad("drinking a remedy did not use one up");
      you.hp = vigourFor(you.level);
      wareBalked = 0;
      if (useWare(at)) bad("a remedy went down on a man with nothing wrong");
      if (!wareBalked) bad("a remedy that did nothing said nothing about why");
      if (you.bag[at] != 1) bad("a remedy that did nothing was still used up");
      you.bag[at] = 0;
    }

    /* A counter buys back, at half, and will not take what you are standing in. */
    at = -1;
    for (i2 = 0; i2 < WARE_COUNT; i2++) {
      if (wares[i2].kind == WARE_WEAPON && wares[i2].price > 1) { at = i2; break; }
    }
    if (at < 0) {
      bad("there is no weapon with a price on it");
    } else {
      int purse;
      for (i2 = 0; i2 < WARE_KINDS; i2++) you.worn[i2] = 0;
      you.bag[at] = 1;
      you.gold = 100;
      purse = you.gold;
      if (wareWorth(at) != wares[at].price / 2) {
        bad("%s sells for %d, not half of %d", wares[at].name, wareWorth(at),
          wares[at].price);
      }
      if (!sellWare(at)) bad("selling said nothing");
      if (you.bag[at]) bad("something sold is still in the pouch");
      if (you.gold != purse + wares[at].price / 2) {
        bad("selling paid %d, not %d", you.gold - purse, wares[at].price / 2);
      }
      /* And again, wearing it. */
      you.bag[at] = 1;
      you.WORN_WEAPON = (u8)(at + 1);
      if (wareWorth(at)) bad("a counter offered to buy the sword out of your hand");
      you.gold = purse;
      sellWare(at);
      if (!you.bag[at]) bad("a counter took the sword out of your hand");
      if (you.gold != purse) bad("worn gear was paid for anyway");
      you.WORN_WEAPON = 0;
      you.bag[at] = 0;
    }
  }

  /* --- the kennels, and the swords behind you ------------------------------ */
  /* Neither of these is reachable by a wandering run: boarding an animal wants
     a full party and a maester's hall in the same afternoon, and taking an oath
     wants a purse, a person worn down to nothing and a good roll. So the rules
     are checked here, the same way the party's are. */
  {
    int k, n;
    for (k = 0; k < PARTY_MAX; k++) you.party[k].kind = 255;
    for (k = 0; k < HOLD_MAX; k++) you.holdfast[k].kind = 255;
    for (k = 0; k < HOST_MAX; k++) you.host[k].kind = 255;
    you.lead = 0;
    you.level = 25;

    if (holdCount()) bad("empty kennels count %d", holdCount());
    /* Nought is a real animal and a real sort of sworn sword, so an array that
       has never been written to reads as full rather than empty. A new game
       began with eighteen snowpups boarded and six bandits already following
       you, and neither the sweep nor the ladder ever looked. */
    {
      extern void newGameState(void);
      int j4;
      for (j4 = 0; j4 < HOLD_MAX; j4++) you.holdfast[j4].kind = 0;
      for (j4 = 0; j4 < HOST_MAX; j4++) you.host[j4].kind = 0;
      for (j4 = 0; j4 < PARTY_MAX; j4++) you.party[j4].kind = 0;
      newGameState();
      if (partyCount()) bad("a new game begins with %d at your heel", partyCount());
      if (holdCount()) bad("a new game begins with %d boarded", holdCount());
      if (hostCount()) bad("a new game begins with %d already sworn", hostCount());
    }
    for (k = 0; k < PARTY_MAX; k++) keepBeast(k % BEAST_COUNT, 10 + k);
    /* Board five of the six, leaving the one that was out in front. */
    for (k = 1; k < PARTY_MAX; k++) {
      if (!boardBeast(k)) bad("a beast would not board (place %d)", k);
    }
    if (holdCount() != 5) bad("five boarded and %d counted", holdCount());
    if (partyCount() != 1) bad("five of six boarded and %d left at your heel",
      partyCount());
    if (you.party[you.lead].kind == 255) {
      bad("boarding left you leading an empty place");
    }
    /* Board the last one too, and see that lead does not point at a ghost. */
    if (!boardBeast(you.lead)) bad("the last one at your heel would not board");
    if (partyCount()) bad("everything boarded and %d still at your heel", partyCount());
    if (holdCount() != 6) bad("six boarded and %d counted", holdCount());
    /* And back out again. */
    for (k = 0; k < 6; k++) {
      int spot = -1, j;
      for (j = 0; j < HOLD_MAX; j++) if (you.holdfast[j].kind != 255) { spot = j; break; }
      if (spot < 0) { bad("the kennels emptied early"); break; }
      if (!fetchBeast(spot)) bad("a boarded beast would not come back out");
    }
    if (partyCount() != 6) bad("six fetched and %d at your heel", partyCount());
    if (holdCount()) bad("everything fetched and %d still boarded", holdCount());
    if (you.party[you.lead].kind == 255) bad("fetching left you leading nobody");
    /* Eighteen is the whole kennel and there is no nineteenth place. */
    for (k = 0; k < PARTY_MAX; k++) you.party[k].kind = 255;
    for (k = 0; k < HOLD_MAX; k++) {
      you.holdfast[k].kind = (u8)(k % BEAST_COUNT);
      you.holdfast[k].level = 10;
    }
    if (holdRoom() >= 0) bad("full kennels still report room at %d", holdRoom());
    keepBeast(0, 10);
    if (boardBeast(0)) bad("a nineteenth got into kennels of eighteen");
    for (k = 0; k < HOLD_MAX; k++) you.holdfast[k].kind = 255;
    for (k = 0; k < PARTY_MAX; k++) you.party[k].kind = 255;

    /* The host: six swear, a seventh does not, and their numbers rise with
       their level rather than standing still. */
    if (hostCount()) bad("an empty host counts %d", hostCount());
    for (k = 0; k < HOST_MAX; k++) {
      if (!swearIn(k % SWORN_KINDS, 12 + k)) bad("a sword would not swear (place %d)", k);
    }
    if (hostCount() != HOST_MAX) bad("six sworn and %d counted", hostCount());
    if (hostRoom() >= 0) bad("a full host still reports room at %d", hostRoom());
    if (swearIn(0, 20)) bad("a seventh sword got into a host of six");
    for (k = 0; k < SWORN_KINDS; k++) {
      if (swornMight(k, 10) != swornKinds[k].might10) {
        bad("%s's might at ten is %d, not the %d in the table",
          swornKinds[k].name, swornMight(k, 10), swornKinds[k].might10);
      }
      if (swornMight(k, 40) != swornKinds[k].might40) {
        bad("%s's might at forty is %d, not the %d in the table",
          swornKinds[k].name, swornMight(k, 40), swornKinds[k].might40);
      }
      if (swornMight(k, 25) <= swornMight(k, 15)) {
        bad("%s does not get better with levels", swornKinds[k].name);
      }
      if (swornVigour(k, 1) < 8) bad("%s has no health at all at level one",
        swornKinds[k].name);
    }
    /* And what six of them are worth when you swing, which is the whole point
       of paying for them. */
    theirs.guard = 20;
    n = myHostBlow();
    if (n <= 0) bad("six sworn swords add nothing to a blow");
    for (k = 0; k < HOST_MAX; k++) you.host[k].kind = 255;
    if (myHostBlow()) bad("an empty host still adds %d to a blow", myHostBlow());
  }

  /* --- can a nest ever hand over what is in it? --------------------------- */
  /* Two things stood between every player and a dragon. Finding what is in a
     nest wanted your heel to be empty, and the game hands you a wolf pup in the
     first hour; and it was bound to standing in tall grass, and three of the
     four places that hold a dragon egg have not a blade of grass on them. Both
     of those are one line each and neither the sweep nor the ladder could see
     either, because a tester that never finds an egg looks exactly like a
     tester that never walked over one. */
  {
    int m2, nests = 0, bare = 0, i2, e2;
    int wasWorld = worldId;
    for (e2 = 0; e2 < EGG_COUNT; e2++) {
      int held = 0;
      for (m2 = 0; m2 < MAP_COUNT; m2++) if (maps[m2].nest == eggs[e2].ware) held++;
      if (!held) {
        bad("%s hatches into a %s and there is no nest in the world holding one",
          wares[eggs[e2].ware].name, beasts[eggs[e2].beast].name);
      }
    }
    for (m2 = 0; m2 < MAP_COUNT; m2++) {
      int cover = 0, x2, y2;
      if (maps[m2].nest == 255) continue;
      nests++;
      for (y2 = 0; y2 < maps[m2].h; y2++) {
        for (x2 = 0; x2 < maps[m2].w; x2++) {
          if (maps[m2].cover[y2 * maps[m2].w + x2]) cover++;
        }
      }
      if (!cover) bare++;
      /* And the rule itself, asked of the cartridge on that very map: a nest
         must give up what is in it whether or not anything walks with you.
         Wanting an empty heel is what put every dragon on this cartridge
         behind an animal the game gives you in the first hour. */
      {
        int k2, empty, carrying;
        worldId = m2;
        world = &maps[m2];
        for (k2 = 0; k2 < PARTY_MAX; k2++) you.party[k2].kind = 255;
        you.lead = 0;
        for (i2 = 0; i2 < WARE_COUNT; i2++) if (wares[i2].kind == WARE_EGG) you.bag[i2] = 0;
        empty = nestWouldGive();
        keepBeast(0, 10);
        carrying = nestWouldGive();
        for (k2 = 0; k2 < PARTY_MAX; k2++) you.party[k2].kind = 255;
        you.lead = 0;
        if (!empty) bad("the nest on %s gives up nothing at all", maps[m2].name);
        if (empty != carrying) {
          bad("the nest on %s only gives up what is in it when your heel is "
              "empty", maps[m2].name);
        }
      }
    }
    worldId = wasWorld;
    world = &maps[wasWorld];
    note("%d nests, %d of them on ground where nothing grows", nests, bare);
    if (nests < 4) bad("there are only %d nests in the world", nests);
  }

  /* --- what stacks must also be buyable twice ------------------------------ */
  /* A counter refuses to sell you something you already have, which is right
     for a sword and ruinous for anything spent by using it. An oath stacked
     nowhere and could not be re-bought, so a purse in your pouch made every
     counter in the world say no - and the directed climb spent nine million
     frames pressing A at one, which is how this was found at all. */
  {
    int i2;
    for (i2 = 0; i2 < WARE_COUNT; i2++) {
      int kind = wares[i2].kind, stacks, sellsAgain;
      if (!wares[i2].price) continue;
      for (j = 0; j < WARE_COUNT; j++) you.bag[j] = 0;
      you.gold = 1000000;
      for (j = 0; j < WARE_KINDS; j++) you.worn[j] = 0;
      takeWare(i2);
      takeWare(i2);
      stacks = you.bag[i2] > 1;
      for (j = 0; j < WARE_COUNT; j++) you.bag[j] = 0;
      buyWare(i2);
      buyWare(i2);
      sellsAgain = you.bag[i2] > 1;
      if (stacks != sellsAgain) {
        bad("%s %s in the pouch but a counter %s sell you a second",
          wares[i2].name, stacks ? "stacks" : "does not stack",
          sellsAgain ? "will" : "will not");
      }
      /* Anything used up the moment it works has to stack, or the game hands
         you one of it per walk back to a counter. */
      if ((kind == WARE_OATH || kind == WARE_RELIC || kind == WARE_SNARE
           || kind == WARE_POTION) && !stacks) {
        bad("%s is spent by using it and does not stack", wares[i2].name);
      }
    }
    for (j = 0; j < WARE_COUNT; j++) you.bag[j] = 0;
    for (j = 0; j < WARE_KINDS; j++) you.worn[j] = 0;
  }

  /* --- somebody worth swearing, and something to swear them with ----------- */
  {
    int i2, oaths = 0, sworn = 0, named = 0;
    for (i2 = 0; i2 < WARE_COUNT; i2++) if (wares[i2].kind == WARE_OATH) oaths++;
    if (oaths < 2) bad("only %d things in the world take somebody's oath", oaths);
    for (i2 = 0; i2 < WARE_COUNT; i2++) {
      if (wares[i2].kind == WARE_OATH && !wares[i2].hold) {
        bad("%s would persuade nobody of anything", wares[i2].name);
      }
    }
    for (i2 = 0; i2 < DUELLIST_COUNT; i2++) {
      if (duellists[i2].sworn < SWORN_KINDS) sworn++;
      if (duellists[i2].fixed && duellists[i2].sworn < SWORN_KINDS) named++;
    }
    if (!sworn) bad("nobody in the world can be taken into service");
    if (named) bad("%d people the story knows by name are for hire", named);
  }

  /* --- a house of your own ------------------------------------------------ */
  /* None of this is reachable by a wandering run either: buying a hall wants a
     stronghold cleared out and six thousand gold in the same afternoon, and a
     marriage wants a great house already knelt. So the rules are checked here,
     directly, the same way the party's and the host's are. */
  {
    int k, halls = 0, was, i2;
    extern void newGameState(void);

    /* Nought is a real charge, a real field and a real map, so an unwritten
       house reads as a full one: arms you never took, over a hall you never
       bought. */
    you.arms = 1; you.charge = 3; you.tincture = 2; you.saying = 9;
    seat.has = 1; seat.map = 7; seat.wed = 4; seat.heirs = 3; seat.coffers = 900;
    for (k = 0; k < VASSAL_WORDS; k++) seat.vassal[k] = 0xFF;
    newGameState();
    if (you.arms) bad("a new game begins with arms already taken");
    if (seat.has) bad("a new game begins holding %s", maps[seat.map].name);
    if (seat.wed) bad("a new game begins married");
    if (seat.heirs) bad("a new game begins with %d children", seat.heirs);
    if (seat.coffers) bad("a new game begins with %d gold in coffers", (int)seat.coffers);
    if (vassalCount()) bad("a new game begins with %d halls sworn to it", vassalCount());
    for (k = 0; k < OFFICE_COUNT; k++) {
      if (officeHolder(k) >= 0) bad("a new game begins with a %s", OFFICES[k]);
    }

    /* Somewhere to buy. A game with a house system and nothing for sale in it
       is a menu that never does anything. */
    for (k = 0; k < MAP_COUNT; k++) {
      if (!maps[k].seat) continue;
      halls++;
      /* A hall you cannot clear is a hall you can never buy, because the price
         is only asked of somebody who has already taken it. */
      {
        int f = 0, n = maps[k].npcCount > MAX_CROWD ? MAX_CROWD : maps[k].npcCount, j2;
        for (j2 = 0; j2 < n; j2++) if (maps[k].npcs[j2].fights) f++;
        if (!f) bad("%s is for sale and has nobody in it to take it from", maps[k].name);
      }
      /* And there has to be a way in, or the hall is a price on a page. */
      if (firstWayIn(&maps[k], k) < 0) {
        bad("%s is for sale and there is no way into it", maps[k].name);
      }
      if (maps[k].seat > 200) note("%s costs %d gold", maps[k].name, maps[k].seat * 100);
    }
    if (halls < 4) bad("only %d halls in the whole world are for sale", halls);
    note("%d halls can be bought", halls);

    /* mapCleared: no while anybody in it is still standing, yes once they are
       not, and never yes for somewhere with nobody in it to fight. */
    for (k = 0; k < MAP_COUNT; k++) {
      if (!maps[k].seat) continue;
      { int j2; for (j2 = 0; j2 < MAX_CROWD; j2++) beaten[k][j2] = 0; }
      if (mapCleared(k)) { bad("%s counts as cleared with everybody standing", maps[k].name); break; }
      { int j2; for (j2 = 0; j2 < MAX_CROWD; j2++) beaten[k][j2] = 1; }
      if (!mapCleared(k)) { bad("%s never counts as cleared", maps[k].name); break; }
      { int j2; for (j2 = 0; j2 < MAX_CROWD; j2++) beaten[k][j2] = 0; }
    }

    /* The vassal roll: every map id in and back out again, and a count that
       agrees with what went in. One byte holds eight halls, so an off-by-one
       here swears the hall next door instead of the one you paid for. */
    for (k = 0; k < VASSAL_WORDS; k++) seat.vassal[k] = 0;
    for (k = 0; k < MAP_COUNT; k++) {
      swearVassal(k);
      if (!isVassal(k)) { bad("map %d would not swear", k); break; }
      if (vassalCount() != 1) { bad("one hall sworn and %d counted", vassalCount()); break; }
      breakVassal(k);
      if (isVassal(k)) { bad("map %d would not be released", k); break; }
    }
    if (vassalCount()) bad("every hall released and %d still sworn", vassalCount());

    /* Standing goes up when you get something and never down. */
    for (k = 0; k < HOST_MAX; k++) you.host[k].kind = 255;
    you.story = 0;
    sigils = 0;
    was = standing();
    you.arms = 1;
    if (standing() <= was) bad("taking your own arms is worth nothing");
    was = standing();
    seat.has = 1; seat.map = 0;
    if (standing() <= was) bad("a hall of your own is worth nothing");
    was = standing();
    for (k = 0; k < HOST_MAX; k++) { you.host[k].kind = (u8)(k % SWORN_KINDS); you.host[k].level = 20; }
    turnOffice(0);
    if (officeHolder(0) < 0) bad("an office would not be filled from six sworn swords");
    if (standing() <= was) bad("appointing a steward is worth nothing");
    was = standing();
    seat.wed = 1;
    if (standing() <= was) bad("a marriage is worth nothing");
    was = standing();
    seat.heirs = 1;
    if (standing() <= was) bad("an heir is worth nothing");
    was = standing();
    swearVassal(1);
    if (standing() <= was) bad("a hall sworn to you is worth nothing");

    /* An office goes round every sworn sword and then back to vacant, and no
       two offices are ever held by the same person. */
    {
      int seen[HOST_MAX], vacancies = 0;
      for (k = 0; k < HOST_MAX; k++) seen[k] = 0;
      for (k = 0; k < OFFICE_COUNT; k++) seat.office[k] = 255;
      for (k = 0; k < (HOST_MAX + 1) * 2; k++) {
        int at;
        turnOffice(0);
        at = officeHolder(0);
        if (at < 0) vacancies++; else seen[at] = 1;
      }
      for (k = 0; k < HOST_MAX; k++) if (!seen[k]) bad("sworn sword %d can never hold an office", k);
      if (!vacancies) bad("an office once filled can never be left vacant again");
      /* Two offices cannot be the same person. */
      for (k = 0; k < OFFICE_COUNT; k++) seat.office[k] = 255;
      for (k = 0; k < OFFICE_COUNT; k++) turnOffice(k);
      for (k = 0; k < OFFICE_COUNT; k++) {
        for (i2 = k + 1; i2 < OFFICE_COUNT; i2++) {
          if (officeHolder(k) >= 0 && officeHolder(k) == officeHolder(i2)) {
            bad("one person holds both %s and %s", OFFICES[k], OFFICES[i2]);
          }
        }
      }
    }

    /* What the offices are actually for. A title with no consequence attached
       is furniture, and the card promises all three of them do something. */
    for (k = 0; k < OFFICE_COUNT; k++) seat.office[k] = 255;
    for (k = 0; k < VASSAL_WORDS; k++) seat.vassal[k] = 0;
    was = rentPerWin();
    swearVassal(2);
    if (rentPerWin() <= was) bad("a hall sworn to you pays nothing");
    was = rentPerWin();
    turnOffice(0);
    if (rentPerWin() <= was) bad("a steward is worth nothing in rent");
    theirs.guard = 0;
    was = myHostBlow();
    seat.office[1] = seat.office[0] == 1 ? 2 : 1;
    if (myHostBlow() <= was) bad("a master-at-arms is worth nothing in a fight");

    /* Rent arrives on a win, and only for somebody who has a hall. */
    seat.has = 0;
    seat.coffers = 0;
    houseAfterWin();
    if (seat.coffers) bad("rent comes in to somebody with no hall");
    seat.has = 1;
    houseAfterWin();
    if (!seat.coffers) bad("a win pays no rent into your own hall");

    /* Children: only once wed, on a schedule, and never more than four. */
    seat.wed = 0;
    seat.heirs = 0;
    seat.lastHeir = 0;
    you.kills = 500;
    for (k = 0; k < 40; k++) { you.kills++; houseAfterWin(); }
    if (seat.heirs) bad("an unwed lord has %d children", seat.heirs);
    seat.wed = 1;
    seat.lastHeir = (u16)you.kills;
    for (k = 0; k < HEIR_EVERY * (HEIR_MAX + 3); k++) { you.kills++; houseAfterWin(); }
    if (seat.heirs != HEIR_MAX) {
      bad("%d children after %d wins wed, not the %d there is room for",
        seat.heirs, HEIR_EVERY * (HEIR_MAX + 3), HEIR_MAX);
    }
    for (k = 0; k < seat.heirs; k++) {
      if (!seat.heirName[k][0]) bad("child %d of your house has no name", k);
    }

    /* And a raid: it picks a hall you hold, puts the people who were cleared
       out of it back in, and stops the moment you go and take it again. */
    seat.raidLive = 0;
    seat.raidAt = 0;
    for (k = 0; k < VASSAL_WORDS; k++) seat.vassal[k] = 0;
    /* Somewhere real, with people in it, so that refilling it means something. */
    { int pick = -1;
      for (k = 0; k < MAP_COUNT; k++) if (maps[k].seat) { pick = k; break; }
      if (pick < 0) bad("no hall to raid");
      else {
        int j2;
        swearVassal(pick);
        for (j2 = 0; j2 < MAX_CROWD; j2++) beaten[pick][j2] = 1;
        for (j2 = 0; j2 < 400 && !seat.raidLive; j2++) { you.kills++; houseAfterWin(); }
        if (!seat.raidLive) bad("nobody ever comes to burn a hall of yours");
        else {
          if (!isVassal(seat.raidMap)) bad("a raid landed on a hall you do not hold");
          if (mapCleared(seat.raidMap)) bad("a raided hall is still standing empty");
          /* Beat them, and it is yours again. */
          for (j2 = 0; j2 < MAX_CROWD; j2++) beaten[seat.raidMap][j2] = 1;
          worldId = seat.raidMap;
          world = &maps[worldId];
          windowOpen = 0;
          was = (int)seat.coffers;
          houseCheckRaid();
          if (seat.raidLive) bad("a hall taken back is still burning");
          if ((int)seat.coffers <= was) bad("taking a hall back is worth nothing");
        }
        /* And ignoring one loses it. */
        seat.raidLive = 1;
        seat.raidMap = (u8)pick;
        seat.raidAt = (u16)you.kills;
        swearVassal(pick);
        you.kills++;
        houseAfterWin();
        if (isVassal(pick)) bad("a hall left to burn is still sworn to you");
      }
    }

    /* Sending your swords at a hall: it costs, it takes a season, the odds are
       bounded either way, and a losing throw never empties the company. */
    newGameState();
    seat.has = 1;
    seat.map = 0;
    you.level = 25;
    you.gold = 999999;
    you.kills = 0;
    if (sendHost()) bad("swords were sent with nobody sworn to send");
    for (k = 0; k < HOST_MAX; k++) { you.host[k].kind = (u8)(k % SWORN_KINDS); you.host[k].level = 30; }
    for (k = 0; k < MAP_COUNT; k++) beenTo[k >> 3] = 0;
    if (warTarget() >= 0) bad("swords are sent at a hall nobody has found");
    for (k = 0; k < MAP_COUNT; k++) if (maps[k].seat) beenTo[k >> 3] |= (u8)(1u << (k & 7));
    {
      int m = warTarget();
      if (m < 0) bad("nowhere at all to send swords");
      else {
        int odds = warOddsOn(m), lean;
        if (odds < 12 || odds > 88) bad("the odds on a hall are %d in a hundred", odds);
        /* Better men, better odds. */
        for (k = 0; k < HOST_MAX; k++) you.host[k].level = 5;
        lean = warOddsOn(m);
        for (k = 0; k < HOST_MAX; k++) you.host[k].level = 45;
        if (warOddsOn(m) <= lean && lean < 88) {
          bad("six better swords are worth nothing on a wall: %d then %d", lean, warOddsOn(m));
        }
        was = you.gold;
        if (!sendHost()) bad("swords would not be sent with everything in hand");
        if (you.gold >= was) bad("putting a company in the field cost nothing");
        if (!seat.warLive) bad("swords were sent and are not in the field");
        if (sendHost()) bad("a second company was sent while the first was out");
        /* Nothing happens until the season is up, and then it happens once. */
        seat.warOdds = 100;
        for (k = 0; k < 200 && seat.warLive; k++) { you.kills++; houseAfterWin(); }
        if (seat.warLive) bad("swords sent out are still in the field after 200 fights");
        if (!mapCleared(m)) bad("a hall taken by your swords is not cleared");
        /* And a losing throw takes a man, but never the last one. */
        for (k = 0; k < MAP_COUNT; k++) {
          int j2;
          for (j2 = 0; j2 < MAX_CROWD; j2++) beaten[k][j2] = 0;
        }
        for (k = 0; k < HOST_MAX; k++) { you.host[k].kind = 255; }
        you.host[0].kind = 0; you.host[0].level = 30;
        you.host[1].kind = 1; you.host[1].level = 30;
        you.gold = 999999;
        for (i2 = 0; i2 < 6 && hostCount() > 1; i2++) {
          if (!sendHost()) break;
          seat.warOdds = 0;
          for (k = 0; k < 200 && seat.warLive; k++) { you.kills++; houseAfterWin(); }
        }
        if (!hostCount()) bad("a run of bad throws left you with no swords at all");
      }
    }

    /* A feast: only in your own hall, only if you can pay for it, and it puts
       everybody who walked in with you back on their feet. */
    newGameState();
    seat.has = 1;
    seat.map = 0;
    worldId = 1;
    world = &maps[worldId];
    you.gold = 999999;
    you.level = 20;
    you.hp = 1;
    if (holdFeast()) bad("a feast was held in somebody else's hall");
    if (you.hp != 1) bad("a feast held nowhere still mended you");
    worldId = 0;
    world = &maps[0];
    you.gold = 0;
    if (holdFeast()) bad("a feast was held with no money for it");
    you.gold = feastPrice();
    was = you.gold;
    for (k = 0; k < HOST_MAX; k++) { you.host[k].kind = 0; you.host[k].level = 15; you.host[k].hp = 1; }
    if (!holdFeast()) bad("a feast could not be held in your own hall with the price in hand");
    if (you.gold != was - feastPrice()) note("a feast's price moves with standing, which is intended");
    if (you.hp != vigourFor(you.level)) bad("a feast left you at %d of %d", you.hp, vigourFor(you.level));
    for (k = 0; k < HOST_MAX; k++) {
      if (you.host[k].hp != swornVigour(you.host[k].kind, you.host[k].level)) {
        bad("a feast left a sworn sword at %d", you.host[k].hp);
        break;
      }
    }

    /* And the style you are addressed by climbs, and never says nothing at the
       top of the game. */
    newGameState();
    sigils = 0;
    you.story = 0;
    if (yourStyle()) bad("somebody with nothing is addressed as \"%s\"", yourStyle());
    if (yourPrefix()[0]) bad("somebody with nothing has \"%s\" on their plate", yourPrefix());
    sigils = 1;
    if (!yourStyle()) bad("a seat has bent to you and nobody has a word for you");
    seat.has = 1;
    if (!yourStyle()) bad("a lord of a hall has no style");
    you.story = 3;
    if (!yourStyle() || !yourPrefix()[0]) bad("the crowned ruler of the realm has no style");

    /* Put everything back the way the rest of the audit expects it. */
    newGameState();
    you.kills = 0;
    sigils = 0;
    for (k = 0; k < MAP_COUNT; k++) {
      int j2;
      for (j2 = 0; j2 < MAX_CROWD; j2++) beaten[k][j2] = 0;
    }
  }

  /* --- holding the chair after you have taken it --------------------------- */
  /* Nothing in a wandering run ever sits the throne, and the crowning run stops
     the moment the crown goes on. So every rule of the postgame is checked
     here: that there is a postgame at all, that each answer costs what it says
     it costs, and that the realm can be neglected into trouble and put right
     again. */
  {
    int i2, k;
    extern void newGameState(void);
    newGameState();

    if (PETITION_COUNT < 8) bad("only %d petitions in the whole postgame", PETITION_COUNT);
    if (PETITION_COUNT > 32) {
      bad("%d petitions and only thirty-two bits to remember them by", PETITION_COUNT);
    }
    note("%d petitions, %d answers between them", PETITION_COUNT, ANSWER_COUNT);
    for (i2 = 0; i2 < PETITION_COUNT; i2++) {
      const Petition *p = &petitions[i2];
      if (p->count < 2) bad("petition %d has %d answers, which is not a decision", i2, p->count);
      if (p->first + p->count > ANSWER_COUNT) bad("petition %d runs off the end of the answers", i2);
      if (!p->text[0]) bad("petition %d says nothing", i2);
      for (k = 0; k < p->count; k++) {
        const Answer *a = &answers[p->first + k];
        if (!a->label[0]) bad("petition %d, answer %d has no label", i2, k);
        if (!a->result[0]) bad("petition %d, answer %d has no consequence", i2, k);
        if (a->houseA != 255 && a->houseA >= HOUSE_COUNT) {
          bad("petition %d, answer %d moves house %d, and there are %d",
            i2, k, a->houseA, HOUSE_COUNT);
        }
        if (a->houseB != 255 && a->houseB >= HOUSE_COUNT) {
          bad("petition %d, answer %d moves house %d, and there are %d",
            i2, k, a->houseB, HOUSE_COUNT);
        }
        /* An answer that costs nothing at all is not a decision either. */
        if (!a->gold && !a->steady && a->houseA == 255 && a->houseB == 255) {
          bad("petition %d, answer \"%s\" costs nothing whatever", i2, a->label);
        }
      }
    }

    /* There is a chair, and exactly one of them. */
    {
      int chairs = 0;
      for (i2 = 0; i2 < MAP_COUNT; i2++) {
        if (maps[i2].courtX == 255) continue;
        chairs++;
        if (maps[i2].courtX >= maps[i2].w || maps[i2].courtY >= maps[i2].h) {
          bad("%s puts its chair at %d,%d and is %dx%d", maps[i2].name,
            maps[i2].courtX, maps[i2].courtY, maps[i2].w, maps[i2].h);
        } else if (!solidOn(&maps[i2], maps[i2].courtX, maps[i2].courtY)) {
          /* You stand in front of it and press A. Ground you can walk onto is
             ground you walk over without ever facing it. */
          bad("%s's chair at %d,%d is somewhere you can stand", maps[i2].name,
            maps[i2].courtX, maps[i2].courtY);
        }
      }
      if (chairs != 1) bad("%d maps have an Iron Throne on them", chairs);
    }

    /* Every petition can be reached: pull them off the table one at a time and
       none of them should ever be unreachable except the one gated on an empty
       treasury, which needs an empty treasury. */
    crown.judged = 0;
    you.gold = 0;
    for (k = 0; k < PETITION_COUNT; k++) {
      int at = petitionWaiting();
      if (at < 0) { bad("the court ran dry after %d petitions of %d", k, PETITION_COUNT); break; }
      if (judged(at)) { bad("the court raised a petition it had already heard"); break; }
      crown.judged |= (u32)1u << at;
    }
    if (petitionWaiting() >= 0) bad("every petition heard and the court still has one");
    if (courtCount() != PETITION_COUNT) {
      bad("%d of %d petitions counted as heard", courtCount(), PETITION_COUNT);
    }
    /* A rich crown is never asked to fill an empty treasury. */
    crown.judged = 0;
    you.gold = 999999;
    for (k = 0; k < PETITION_COUNT * 8; k++) {
      int at = petitionWaiting();
      if (at < 0) break;
      if (petitions[at].needsPoor && you.gold >= (int)petitions[at].needsPoor) {
        bad("a crown with %d gold was asked about an empty treasury", you.gold);
        break;
      }
      crown.judged |= (u32)1u << at;
    }

    /* Answering one costs what the table says it costs, and never twice. */
    crown.judged = 0;
    crown.steady = 0;
    for (k = 0; k < HOUSE_COUNT; k++) crown.favour[k] = 0;
    you.gold = 50000;
    for (i2 = 0; i2 < PETITION_COUNT; i2++) {
      const Petition *p = &petitions[i2];
      const Answer *a;
      int wasGold, wasSteady, wasA;
      courtAt = i2;
      courtPick = 0;
      a = &answers[p->first];
      wasGold = you.gold;
      wasSteady = crown.steady;
      wasA = a->houseA < HOUSE_COUNT ? crown.favour[a->houseA] : 0;
      answerCourt();
      if (you.gold != wasGold + a->gold) {
        bad("petition %d moved the treasury by %d, not %d", i2, you.gold - wasGold, a->gold);
      }
      if (crown.steady != wasSteady + a->steady) {
        bad("petition %d moved the realm by %d, not %d", i2,
          crown.steady - wasSteady, a->steady);
      }
      if (a->houseA < HOUSE_COUNT && crown.favour[a->houseA] != wasA + a->shiftA) {
        bad("petition %d moved a house by %d, not %d", i2,
          crown.favour[a->houseA] - wasA, a->shiftA);
      }
      if (!judged(i2)) bad("petition %d was answered and is still on the table", i2);
    }
    if (courtCount() != PETITION_COUNT) bad("every petition answered and %d counted", courtCount());
    if (crown.courts != PETITION_COUNT) bad("%d courts held for %d petitions", crown.courts, PETITION_COUNT);

    /* Steadiness is bounded either way, so a hundred bad decisions cannot wrap
       it round into a quiet realm. */
    crown.steady = 0;
    for (k = 0; k < 200; k++) {
      crown.judged = 0;
      courtAt = 0;
      courtPick = 0;
      answerCourt();
    }
    if (crown.steady > 100 || crown.steady < -100) {
      bad("the realm's steadiness ran to %d", crown.steady);
    }

    /* Neglect it and somebody raises a banner; go and take it down and the
       realm settles. */
    newGameState();
    you.story = 3;
    crown.steady = -40;
    you.kills = 100;
    for (k = 0; k < 400 && !crown.riseLive; k++) { you.kills++; crownAfterWin(); }
    if (!crown.riseLive) bad("a realm left at -40 never produces a single rebel");
    else {
      int j2;
      if (mapCleared(crown.riseMap)) bad("a hall that has risen against you is standing empty");
      for (j2 = 0; j2 < MAX_CROWD; j2++) beaten[crown.riseMap][j2] = 1;
      worldId = crown.riseMap;
      world = &maps[worldId];
      windowOpen = 0;
      i2 = crown.steady;
      crownCheckRising();
      if (crown.riseLive) bad("a rising put down is still flying its banner");
      if (crown.steady <= i2) bad("putting down a rising does nothing for the realm");
    }
    /* And a realm nobody is neglecting stays where it is. */
    newGameState();
    you.story = 3;
    crown.steady = 80;
    you.kills = 0;
    for (k = 0; k < 200; k++) { you.kills++; crownAfterWin(); }
    if (crown.steady >= 80) bad("a realm nobody governs never slips at all");
    if (crown.riseLive) bad("a realm at 80 threw up a rebel anyway");
    /* Nothing at all happens to somebody who is not king. */
    newGameState();
    you.story = 2;
    crown.steady = 0;
    for (k = 0; k < 200; k++) { you.kills++; crownAfterWin(); }
    if (crown.steady || crown.riseLive) bad("the realm moves for somebody who does not rule it");

    newGameState();
    you.kills = 0;
    you.gold = 0;
    courtAt = -1;
    for (k = 0; k < MAP_COUNT; k++) {
      int j2;
      for (j2 = 0; j2 < MAX_CROWD; j2++) beaten[k][j2] = 0;
    }
  }

  /* --- a horse to somewhere you have already been -------------------------- */
  {
    int k, havens = 0;
    extern void newGameState(void);
    newGameState();

    for (k = 0; k < MAP_COUNT; k++) if (isHaven(k)) havens++;
    if (havens < 8) bad("only %d halls in the world have a maester in them", havens);
    note("%d halls a horse can be taken to", havens);

    /* Nowhere, until you have been somewhere. */
    worldId = 0;
    world = &maps[0];
    if (rideCount()) bad("a new game can already ride to %d places", rideCount());
    if (nthRide(0) >= 0) bad("a new game is offered a horse to map %d", nthRide(0));

    /* Walking into a hall is what puts it on the list, and the list never
       offers you the room you are standing in. */
    {
      int first = -1, second = -1;
      for (k = 0; k < MAP_COUNT; k++) {
        if (!isHaven(k)) continue;
        if (first < 0) first = k; else { second = k; break; }
      }
      if (second < 0) bad("fewer than two halls with a maester");
      else {
        /* Walked into the way an actual player walks into them: through the
           door, which is the only spot the game ever writes down. */
        int inA = firstWayIn(&maps[first], first);
        int inB = firstWayIn(&maps[second], second);
        if (inA < 0 || inB < 0) bad("a maester's hall with no way into it");
        enterMap(first, inA % maps[first].w, inA / maps[first].w, 0);
        enterMap(second, inB % maps[second].w, inB / maps[second].w, 0);
        if (rideCount() != 1) {
          bad("two halls walked into and %d offered from the second", rideCount());
        }
        if (nthRide(0) != first) bad("the horse is offered to the wrong hall");
        worldId = first;
        world = &maps[first];
        if (nthRide(0) != second) bad("the list does not turn round with you");
        /* And a horse costs, and cannot be taken without the coin. */
        you.level = 20;
        you.gold = rideCost() - 1;
        if (rideTo(second)) bad("a horse was taken with nothing to pay for it");
        you.gold = rideCost();
        if (!rideTo(second)) bad("a horse would not be taken with the price in hand");
        if (worldId != second) bad("the horse went to map %d, not %d", worldId, second);
        if (you.gold) bad("a horse cost %d less than it said", you.gold);
        /* Wherever it put you down has to be ground you can stand on: being set
           down inside a wall is worse than the walk. */
        if (solidOn(&maps[worldId], hero.px >> 4, hero.py >> 4)) {
          bad("%s sets you down inside a wall at %d,%d", maps[worldId].name,
            hero.px >> 4, hero.py >> 4);
        }
      }
    }

    /* Every hall with a maester in it: somewhere you can be put back down. */
    for (k = 0; k < MAP_COUNT; k++) {
      if (!isHaven(k)) continue;
      if (firstWayIn(&maps[k], k) < 0) {
        bad("%s has a maester in it and no way in", maps[k].name);
      }
    }

    newGameState();
    worldId = 0;
    world = &maps[0];
    you.gold = 0;
  }

  /* --- what a fight is made of -------------------------------------------- */
  /* Every one of these numbers has been on every technique in the game since
     the beginning and none of them had a field on the cartridge to arrive in,
     which is why the answer to every turn of every fight was the biggest number
     on the menu. A table of zeroes would look exactly like a table that had
     never been wired up, so it is checked rather than assumed. */
  {
    int k, costing = 0, stunning = 0, breaking = 0, bleeding = 0, quick = 0;
    for (k = 0; k < TECH_COUNT; k++) {
      const Tech *t = &techniques[k];
      if (t->wind) costing++;
      if (t->stun) stunning++;
      if (t->guardBreak) breaking++;
      if (t->bleed) bleeding++;
      if (t->first) quick++;
      if (t->wind > 15) bad("%s costs %d wind, and nobody has that much", t->name, t->wind);
      /* An effect with no chance of landing never lands, and a chance with no
         effect behind it is a number that does nothing. */
      if ((t->stun || t->guardBreak || t->bleed) && !t->chance) {
        bad("%s has an effect and no chance of it landing", t->name);
      }
      if (t->chance && !(t->stun || t->guardBreak || t->bleed)) {
        bad("%s has a %d in a hundred chance of nothing at all", t->name, t->chance);
      }
      if (t->chance > 100) bad("%s lands its effect %d times in a hundred", t->name, t->chance);
      if (t->defend && t->power) bad("%s both guards and swings", t->name);
    }
    if (costing < 10) bad("only %d of %d techniques cost anything to swing", costing, TECH_COUNT);
    if (!stunning) bad("nothing in the game puts anybody on the ground");
    if (!breaking) bad("nothing in the game breaks a guard");
    if (!bleeding) bad("nothing in the game makes anybody bleed");
    if (!quick) bad("nothing in the game goes first");
    note("%d techniques cost wind, %d stagger, %d break a guard, %d draw blood, %d go first",
      costing, stunning, breaking, bleeding, quick);

    /* Wind: it runs out if you keep swinging, and a guard gets it back. */
    {
      Fighter f;
      int heavy = -1;
      for (k = 0; k < TECH_COUNT; k++) if (techniques[k].wind > (heavy < 0 ? 0 : techniques[heavy].wind)) heavy = k;
      f.level = 20;
      f.maxWind = f.wind = windFor(20);
      if (f.maxWind < 8) bad("a level 20 fighter carries %d wind", f.maxWind);
      if (windFor(40) <= windFor(10)) bad("wind does not grow with the man");
      if (heavy >= 0) {
        int swings = 0;
        while (f.wind >= techniques[heavy].wind && swings < 99) { f.wind -= techniques[heavy].wind; swings++; }
        if (swings > 12) {
          bad("%s can be swung %d times on one lungful, which is not a cost",
            techniques[heavy].name, swings);
        }
        note("the heaviest swing in the game is %s at %d wind, %d of them on a full chest",
          techniques[heavy].name, techniques[heavy].wind, swings);
      }
    }

    /* And the ground: six of them, each with something to say. */
    for (k = 0; k < GROUND_KINDS; k++) {
      if (!grounds[k].word[0]) bad("ground %d says nothing about itself", k);
    }
    {
      int flat = 0;
      for (k = 0; k < GROUND_KINDS; k++) {
        if (!grounds[k].windCost && !grounds[k].windBack && !grounds[k].guardShift
            && !grounds[k].heavyShift && !grounds[k].pointShift && !grounds[k].aimShift) flat++;
      }
      if (flat > 1) bad("%d of the six grounds do nothing at all", flat);
    }
    /* Every map's ground is one of them. */
    for (k = 0; k < MAP_COUNT; k++) {
      if (maps[k].scene >= GROUND_KINDS) {
        bad("%s is fought on ground %d, and there are %d",
          maps[k].name, maps[k].scene, GROUND_KINDS);
      }
    }
  }

  /* --- where you stand with the nine --------------------------------------- */
  /* None of this existed on the cartridge until now: the rivalries, who holds
     which ground, whose colours a man on the road is in, and what any of it
     does to a price. A table of 255s and zeroes would look exactly like it
     still not existing, so it is checked rather than assumed. */
  {
    int k, j2, held = 0, coloured = 0, rivalled = 0, moved = 0;
    extern void newGameState(void);

    for (k = 0; k < HOUSE_COUNT; k++) {
      if (houses[k].rivals) rivalled++;
      if (houses[k].rivals & (1u << k)) bad("%s is its own rival", houses[k].name);
      if (houses[k].allies & (1u << k)) bad("%s is its own ally", houses[k].name);
      if (houses[k].rivals & houses[k].allies) {
        bad("%s counts somebody as both friend and enemy", houses[k].name);
      }
      if (houses[k].rivals >> HOUSE_COUNT) bad("%s has a rival past the ninth house", houses[k].name);
      if (houses[k].allies >> HOUSE_COUNT) bad("%s has an ally past the ninth house", houses[k].name);
    }
    if (rivalled < 5) bad("only %d of the nine have anybody they cannot stand", rivalled);

    for (k = 0; k < MAP_COUNT; k++) {
      if (maps[k].holder == 255) continue;
      held++;
      if (maps[k].holder >= HOUSE_COUNT) {
        bad("%s is held by house %d, and there are %d", maps[k].name, maps[k].holder, HOUSE_COUNT);
      }
    }
    if (held < 60) bad("only %d of %d maps are held by anybody", held, MAP_COUNT);
    note("%d of %d maps are somebody's ground", held, MAP_COUNT);

    for (k = 0; k < DUELLIST_COUNT; k++) {
      if (duellists[k].house == 255) continue;
      coloured++;
      if (duellists[k].house >= HOUSE_COUNT) {
        bad("%s wears the colours of house %d", duellists[k].name, duellists[k].house);
      }
    }
    if (coloured < 30) bad("only %d of %d fighters answer to anybody", coloured, DUELLIST_COUNT);
    note("%d of %d people on the road wear somebody's colours", coloured, DUELLIST_COUNT);

    /* Swearing a sword decides where you start with everybody. */
    for (k = 0; k < HOUSE_COUNT; k++) {
      int friends = 0, enemies = 0;
      seedFavour(k);
      if (favour[k] < 25) bad("%s does not think well of its own sworn sword", houses[k].name);
      for (j2 = 0; j2 < HOUSE_COUNT; j2++) {
        if (j2 == k) continue;
        if (favour[j2] > 0) friends++;
        if (favour[j2] < 0) enemies++;
      }
      if (!enemies) bad("swearing to %s makes nobody an enemy", houses[k].name);
      if (friends + enemies == 0) bad("swearing to %s moves nothing at all", houses[k].name);
    }

    /* It is bounded either way, and killing somebody's men costs you with them
       and gains you with the people who cannot stand them. */
    seedFavour(0);
    for (k = 0; k < 400; k++) tookOneOfTheirs(1, 6);
    if (favour[1] != -100) bad("four hundred dead Tullys and their standing is %d", favour[1]);
    for (k = 0; k < 400; k++) tookOneOfTheirs(1, -6);
    if (favour[1] != 100) bad("standing runs past the top: %d", favour[1]);
    seedFavour(0);
    {
      int rival = -1;
      for (j2 = 0; j2 < HOUSE_COUNT; j2++) if (houses[4].rivals & (1u << j2)) { rival = j2; break; }
      if (rival < 0) bad("house 4 has nobody who cannot stand it");
      else {
        int wasR = favour[rival], wasH = favour[4];
        tookOneOfTheirs(4, 9);
        if (favour[4] >= wasH) bad("killing their men costs nothing with them");
        if (favour[rival] <= wasR) bad("killing their men pleases nobody");
        moved = 1;
      }
    }
    if (!moved) bad("nothing at all moves when somebody goes down");

    /* And what it does at a counter. */
    seedFavour(0);
    favour[0] = 100;
    if (priceFactor(0) >= 100) bad("a house that loves you charges full price");
    favour[0] = -100;
    if (priceFactor(0) <= 100) bad("a house that hates you charges no more");
    if (priceFactor(-1) != 100) bad("ground nobody holds still has a price factor");
    /* The five words, and every one of them reachable. */
    {
      int bands = 0;
      static const int at[5] = { 80, 40, 0, -40, -80 };
      const char *seen[5];
      for (k = 0; k < 5; k++) {
        favour[0] = (s8)at[k];
        seen[k] = bandWord(0);
        bands++;
        for (j2 = 0; j2 < k; j2++) if (seen[j2] == seen[k]) bad("two of the five bands read the same");
      }
      if (bands != 5) bad("%d bands of standing", bands);
    }

    /* Every answer in the game moves somebody, or it is a menu. */
    {
      int dead = 0, alive = 0;
      for (k = 0; k < CHOICE_COUNT; k++) {
        for (j2 = 0; j2 < choices[k].count; j2++) {
          if (choices[k].houseA[j2] == 255 && choices[k].houseB[j2] == 255
              && !choices[k].gold[j2] && choices[k].duel[j2] == 0xFFFF) dead++;
          else alive++;
          if (choices[k].houseA[j2] != 255 && choices[k].houseA[j2] >= HOUSE_COUNT) {
            bad("an answer moves house %d", choices[k].houseA[j2]);
          }
          if (choices[k].houseA[j2] != 255 && !choices[k].shiftA[j2]) {
            bad("an answer names a house and moves it by nothing");
          }
        }
      }
      if (alive < 20) bad("only %d answers in the game do anything at all", alive);
      note("%d of %d answers move gold, steel or somebody's opinion",
        alive, alive + dead);
    }

    /* And no two answers anywhere share a flag, which is what made agreeing
       with a man in the Riverlands the same fact as agreeing with a man at the
       Wall. */
    {
      int clash = 0;
      for (k = 0; k < CHOICE_COUNT; k++) {
        for (j2 = 0; j2 < choices[k].count; j2++) {
          int m, n2;
          for (m = k; m < CHOICE_COUNT; m++) {
            for (n2 = (m == k ? j2 + 1 : 0); n2 < choices[m].count; n2++) {
              if (choices[k].flag[j2] == choices[m].flag[n2]) clash++;
            }
          }
        }
      }
      if (clash) bad("%d pairs of answers in the game set the same flag", clash);
    }

    seedFavour(0);
    newGameState();
  }

  /* --- is a fight still worth having at the top of the ladder? ------------- */
  {
    extern void newGameState(void);
    newGameState();
    you.level = 50;
    you.exp = expForLevel(50);
    you.gold = 0;
    /* Nothing in a wandering run ever reaches fifty inside the frame budget by
       any road but grinding, and every sweep of this game ends there with a
       hundred maps unwalked. From fifty on, a win used to pay nothing at all. */
    if (expShare() != 100) note("the rail at the cap reads %d", expShare());
    if (expForLevel(51) > expForLevel(50)) {
      note("there is a level 51 in the table; the cap is the game's, not the maths'");
    }
  }

  /* --- four shelves, and somebody standing at each ------------------------ */
  {
    extern void newGameState(void);
    int k, keeper[STALL_COUNT], anyone = 0;
    for (k = 0; k < STALL_COUNT; k++) keeper[k] = 0;
    for (i = 0; i < MAP_COUNT; i++) {
      for (j = 0; j < maps[i].npcCount; j++) {
        int t = maps[i].npcs[j].trade;
        if (t < 1 || t > STALL_COUNT) continue;
        keeper[t - 1]++;
        anyone++;
      }
    }
    if (!anyone) bad("nobody in the world keeps a counter");
    for (k = 0; k < STALL_COUNT; k++) {
      if (!stalls[k].count) bad("the %s shelf has nothing on it", stallName[k]);
      /* Every shelf is reachable from every counter now, so a shelf with
         nobody who opens on it is a shelf nobody sees first - worth saying,
         not worth failing over. */
      if (!keeper[k]) note("nobody opens on the %s shelf", stallName[k]);
      else note("%s: %d things, %d people open on it", stallName[k],
        stalls[k].count, keeper[k]);
    }
    /* And no thing is on two shelves, or the same sword is two entries in the
       one shop. */
    {
      int clash = 0, a, b, x, y;
      for (a = 0; a < STALL_COUNT; a++) {
        for (b = a + 1; b < STALL_COUNT; b++) {
          for (x = 0; x < stalls[a].count; x++) {
            for (y = 0; y < stalls[b].count; y++) {
              if (stalls[a].ware[x] == stalls[b].ware[y]) clash++;
            }
          }
        }
      }
      if (clash) bad("%d things are on two shelves at once", clash);
    }
    newGameState();
  }

  /* --- steel that wears out ------------------------------------------------
     Nothing should break in an afternoon and nothing should last forever. The
     numbers here are blows landed, which is roughly two or three a fight. */
  {
    extern void newGameState(void);
    int cheap = 0, dear = 0, k;
    newGameState();
    for (i = 0; i < WARE_COUNT; i++) {
      int life;
      if (wares[i].kind != WARE_WEAPON && wares[i].kind != WARE_ARMOUR
          && wares[i].kind != WARE_SHIELD && wares[i].kind != WARE_HELM
          && wares[i].kind != WARE_GLOVES) continue;
      life = gearLife(i);
      if (life < 25) bad("%s is done after %d blows", wares[i].name, life);
      if (!cheap || life < cheap) cheap = life;
      if (life > dear) dear = life;
    }
    note("gear lasts between %d and %d landed blows", cheap, dear);
    /* And it actually goes when it is used up, and goes off you rather than
       back into the pouch. */
    you.bag[START_WEAPON] = 1;
    wearWare(START_WEAPON);
    if (you.WORN_WEAPON != START_WEAPON + 1) bad("the starting sword will not go on");
    for (k = 0; k < 2000 && you.WORN_WEAPON; k++) wearOn(WARE_WEAPON, 1);
    if (you.WORN_WEAPON) bad("a sword swung two thousand times never breaks");
    if (you.bag[START_WEAPON]) bad("a broken sword is still in the pouch");
    note("the starting sword is good for %d blows", gearLife(START_WEAPON));
    /* And a counter will put it right before it goes. */
    newGameState();
    you.bag[START_ARMOUR] = 1;
    wearWare(START_ARMOUR);
    you.wear[WARE_ARMOUR] = 1;
    you.gold = 100000;
    if (!mendPrice()) bad("nearly ruined armour costs nothing to mend");
    mendAll();
    if (you.wear[WARE_ARMOUR] != (u16)gearLife(START_ARMOUR)) {
      bad("mending does not put a piece back to whole");
    }
    if (conditionWord(WARE_ARMOUR) == 0) bad("mended armour has no word for its state");
    newGameState();
  }

  /* --- choosing which of yours stands the fight --------------------------- */
  {
    extern void newGameState(void);
    int k, down;
    newGameState();
    for (k = 0; k < PARTY_MAX; k++) {
      you.party[k].kind = (u8)(k % BEAST_COUNT);
      you.party[k].level = 20;
      you.party[k].hp = beastVigour(you.party[k].kind, 20);
      you.party[k].exp = 0;
    }
    you.lead = 0;
    if (packHave() != PARTY_MAX) bad("a full pack does not count as full");
    /* One sent out has its own health and its own four techniques, which is
       the whole difference between an animal that fights and a button that
       gives you a free blow. */
    readyBeast();
    if (yours.maxHp < 2 || yours.maxHp > 9000) {
      bad("an animal sent out has %d health", yours.maxHp);
    }
    for (k = 0; k < 4; k++) {
      if (yours.tech[k] >= TECH_COUNT) bad("an animal has technique %d", yours.tech[k]);
    }
    /* And when it is spent it goes down without the duel going down with it. */
    beastOut = 1;
    yours.hp = 0;
    if (!beastFell()) bad("an animal on nought health does not go down");
    if (beastOut) bad("an animal that has gone down is still standing the fight");
    if (MY_BEAST.hp) bad("an animal that has gone down still has health");
    /* The rest of the pack is still there to send out. */
    down = 0;
    for (k = 0; k < PARTY_MAX; k++) if (you.party[k].hp <= 0) down++;
    if (down != 1) bad("%d of the pack went down when one did", down);
    newGameState();
  }

  /* --- the record, written and read back ---------------------------------- */
  {
    int ok = 1;
    world = &maps[3];
    worldId = 3;
    hero.px = 5 * 16; hero.py = 7 * 16; hero.dir = 2;
    you.house = 2; you.level = 23; you.exp = 41000; you.gold = 7654;
    you.hp = 99; you.kills = 41;
    you.WORN_WEAPON = 6; you.WORN_ARMOUR = 12; you.WORN_SHIELD = 17;
    you.WORN_HELM = 21; you.WORN_GLOVES = 25;
    for (i = 0; i < PARTY_MAX; i++) {
      you.party[i].kind = (u8)(i % BEAST_COUNT);
      you.party[i].level = (u8)(12 + i * 3);
      you.party[i].exp = (u16)(100 + i);
    }
    you.lead = 2;
    for (i = 0; i < WARE_COUNT; i++) you.bag[i] = (u8)(i * 3 % 7);
    for (i = 0; i < MAP_COUNT; i++) for (j = 0; j < MAX_CROWD; j++) slain[i][j] = (u8)((i + j) & 1);
    for (i = 0; i < MAP_COUNT; i++) {
      beenTo[i >> 3] |= (u8)(1u << (i & 7));
      backAtX[i] = 3;
      backAtY[i] = 4;
    }
    keepRecord();

    you.house = 0; you.level = 1; you.exp = 0; you.gold = 0; you.hp = 1; you.kills = 0;
    for (i = 0; i < PARTY_MAX; i++) you.party[i].kind = 255;
    you.lead = 0;
    for (i = 0; i < WARE_KINDS; i++) you.worn[i] = 0;
    for (i = 0; i < WARE_COUNT; i++) you.bag[i] = 0;
    for (i = 0; i < MAP_COUNT; i++) for (j = 0; j < MAX_CROWD; j++) slain[i][j] = 0;
    for (i = 0; i < BEEN_WORDS; i++) beenTo[i] = 0;
    for (i = 0; i < MAP_COUNT; i++) { backAtX[i] = 0; backAtY[i] = 0; }

    if (!findRecord()) { bad("a record written and read straight back does not check out"); ok = 0; }
    if (ok) {
      takeUpRecord();
      if (you.house != 2 || you.level != 23 || you.exp != 41000 || you.gold != 7654
          || you.hp != 99 || you.kills != 41
          || you.WORN_WEAPON != 6 || you.WORN_ARMOUR != 12 || you.WORN_SHIELD != 17
          || record.worldId != 3 || record.x != 5 || record.y != 7 || record.dir != 2) {
        bad("the record does not come back the way it went in");
      }
      for (i = 0; i < WARE_COUNT; i++) {
        if (you.bag[i] != (u8)(i * 3 % 7)) { bad("the pouch does not survive a save"); break; }
      }
      /* And all six of them, with the right one still out in front. */
      if (you.lead != 2) bad("the one out in front does not survive a save");
      for (i = 0; i < PARTY_MAX; i++) {
        if (you.party[i].kind != (u8)(i % BEAST_COUNT)
            || you.party[i].level != (u8)(12 + i * 3)
            || you.party[i].exp != (u16)(100 + i)) {
          bad("the party does not survive a save (place %d)", i);
          break;
        }
      }
      for (i = 0; i < MAP_COUNT; i++) {
        for (j = 0; j < MAX_CROWD; j++) {
          if (slain[i][j] != (u8)((i + j) & 1)) { bad("the dead do not survive a save"); i = MAP_COUNT; break; }
        }
      }
      /* And the roads you have walked, or a reload takes the horse away. */
      for (i = 0; i < MAP_COUNT; i++) {
        if (!haveBeen(i)) continue;
        if (backAtX[i] != 3 || backAtY[i] != 4) {
          bad("where a horse sets you down does not survive a save");
          break;
        }
      }
      hostSram[7] ^= 0xFF;
      if (findRecord()) bad("a damaged record is accepted");
    }
    if ((int)sizeof(Record) > 32768) bad("the record is bigger than the cartridge's memory");
    note("the record is %d bytes", (int)sizeof(Record));
  }

  /* --- where you start --------------------------------------------------- */
  for (i = 0; i < HOUSE_COUNT; i++) {
    const House *h = &houses[i];
    if (h->startMap >= MAP_COUNT) { bad("%s starts on map %d", h->name, h->startMap); continue; }
    if (solidOn(&maps[h->startMap], h->startX, h->startY)) {
      bad("%s starts inside a wall at %d,%d in %s", h->name, h->startX, h->startY,
        maps[h->startMap].name);
    }
    /* Nobody begins the game in a room. Picking a seat by its name without
       checking whether it is a building is how a Lannister came to wake up
       inside Casterly Rock, which is an interior map. */
    if (maps[h->startMap].scene == 5) {
      bad("%s starts indoors, in %s", h->name, maps[h->startMap].name);
    }
    /* And everybody begins at the same standing. The world is arranged around
       the player, not the player around the world. */
    if (h->startLevel != 5) {
      bad("%s starts at level %d; every house starts at five", h->name, h->startLevel);
    }
    note("%s begins at %s, on %s", h->name, h->seat, maps[h->startMap].name);
  }
  if (warpOn(&maps[0], 12, 12)) bad("the game starts you on a doorway");

  printf("\n  %d maps (%d reachable), %d people, %d signs, %d doors\n",
    MAP_COUNT, reached, totalNpc, totalSign, totalWarp);
  printf("  %d problems, %d notes\n\n", problems, notes);
  return problems ? 1 : 0;
}
