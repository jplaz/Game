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

  theirs.name = d->name; theirs.level = lv;
  theirs.maxHp = theirs.hp = scaleTo(d->vigour, d->level, lv);
  theirs.might = scaleTo(d->might, d->level, lv);
  theirs.guard = scaleTo(d->guard, d->level, lv);
  theirs.swiftness = scaleTo(d->swiftness, d->level, lv);
  theirs.tech = d->tech;
  theirs.defending = 0;
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
    int mineTech = myTechs[0], best = -1, j3;
    for (j3 = 0; j3 < 3; j3++) {
      const Tech *tt = &techniques[myTechs[j3]];
      int score = tt->power * tt->accuracy;
      if (score > best) { best = score; mineTech = myTechs[j3]; }
    }
    if (first) {
      if (swingQuiet(&mine, &theirs, mineTech)) break;
      if (swingQuiet(&theirs, &mine, d->tech[roll(4)])) break;
    } else {
      if (swingQuiet(&theirs, &mine, d->tech[roll(4)])) break;
      if (swingQuiet(&mine, &theirs, mineTech)) break;
    }
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
  u8 wasWeapon = you.weapon, wasArmour = you.armour, wasShield = you.shield;
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

    theirs.name = d->name; theirs.level = lv;
    theirs.maxHp = theirs.hp = scaleTo(d->vigour, d->level, lv);
    theirs.might = scaleTo(d->might, d->level, lv);
    theirs.guard = scaleTo(d->guard, d->level, lv);
    theirs.swiftness = scaleTo(d->swiftness, d->level, lv);
    theirs.tech = d->tech;
    theirs.defending = 0;
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
      /* A player picks their best technique; the foe picks at random, which is
         what the cartridge has them do. */
      int mineTech = myTechs[0], best = -1, j3;
      for (j3 = 0; j3 < 3; j3++) {
        const Tech *tt = &techniques[myTechs[j3]];
        int score = tt->power * tt->accuracy;
        if (score > best) { best = score; mineTech = myTechs[j3]; }
      }
      if (first) {
        if (swingQuiet(&mine, &theirs, mineTech)) break;
        if (swingQuiet(&theirs, &mine, d->tech[roll(4)])) break;
      } else {
        if (swingQuiet(&theirs, &mine, d->tech[roll(4)])) break;
        if (swingQuiet(&mine, &theirs, mineTech)) break;
      }
    }
    if (theirs.hp <= 0 && mine.hp > 0) wins++;
  }
  you.level = wasLevel;
  you.weapon = wasWeapon; you.armour = wasArmour; you.shield = wasShield;
  reckonTechniques();
  return wins * 100 / tries;
}

/* How many fights of your own standing you get through in a row, starting whole
   and getting a quarter of your wind back on each win, the way the cartridge
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
      hp += vigourFor(level) >> 3;
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
      u8 piece[3];
      int j2, has = 0;
      piece[0] = k.arm; piece[1] = k.mail; piece[2] = k.shield;
      for (j2 = 0; j2 < 3; j2++) {
        static const int WANT[3] = { WARE_WEAPON, WARE_ARMOUR, WARE_SHIELD };
        if (piece[j2] == KIT_NONE) continue;
        if (piece[j2] >= WARE_COUNT) {
          bad("%s carries ware %d", duellists[i].name, piece[j2]);
          continue;
        }
        if (wares[piece[j2]].kind != WANT[j2]) {
          bad("%s carries a %s where a %s belongs", duellists[i].name,
            wares[piece[j2]].name, j2 == 0 ? "weapon" : j2 == 1 ? "mail" : "shield");
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
    u8 wasW = you.weapon, wasA = you.armour, wasS = you.shield;
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
    you.weapon = 0; you.armour = 0; you.shield = 0;
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
    you.weapon = wasW; you.armour = wasA; you.shield = wasS;
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

  /* --- and does it stay a fight afterwards? ------------------------------- */
  /* Per-duel odds are the wrong question. You do not go into every fight whole:
     a win gives you back a quarter of your wind and nothing else, so what
     decides the road is how many fights you get through before somebody puts
     you down. Dress a player of each standing in what somebody of that standing
     carries and count the run. Ten in a row and the road is a walk; two and it
     is a wall. */
  {
    static const int AT[5] = { 5, 10, 15, 20, 25 };
    int a;
    for (a = 0; a < 5; a++) {
      int lv = AT[a], run;
      u8 wasW = you.weapon, wasA = you.armour, wasS = you.shield;
      Kit k = kitOf(lv * 7, lv);
      you.weapon = k.arm == KIT_NONE ? 0 : (u8)(k.arm + 1);
      you.armour = k.mail == KIT_NONE ? 0 : (u8)(k.mail + 1);
      you.shield = k.shield == KIT_NONE ? 0 : (u8)(k.shield + 1);
      run = runLength(lv, 300);
      you.weapon = wasW; you.armour = wasA; you.shield = wasS;
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
    if (w->kind > WARE_EGG) bad("%s is a kind of thing that does not exist", w->name);
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

  /* --- the record, written and read back ---------------------------------- */
  {
    int ok = 1;
    world = &maps[3];
    worldId = 3;
    hero.px = 5 * 16; hero.py = 7 * 16; hero.dir = 2;
    you.house = 2; you.level = 23; you.exp = 41000; you.gold = 7654;
    you.hp = 99; you.kills = 41;
    you.weapon = 6; you.armour = 12; you.shield = 17;
    for (i = 0; i < WARE_COUNT; i++) you.bag[i] = (u8)(i * 3 % 7);
    for (i = 0; i < MAP_COUNT; i++) for (j = 0; j < MAX_CROWD; j++) slain[i][j] = (u8)((i + j) & 1);
    keepRecord();

    you.house = 0; you.level = 1; you.exp = 0; you.gold = 0; you.hp = 1; you.kills = 0;
    you.weapon = you.armour = you.shield = 0;
    for (i = 0; i < WARE_COUNT; i++) you.bag[i] = 0;
    for (i = 0; i < MAP_COUNT; i++) for (j = 0; j < MAX_CROWD; j++) slain[i][j] = 0;

    if (!findRecord()) { bad("a record written and read straight back does not check out"); ok = 0; }
    if (ok) {
      takeUpRecord();
      if (you.house != 2 || you.level != 23 || you.exp != 41000 || you.gold != 7654
          || you.hp != 99 || you.kills != 41
          || you.weapon != 6 || you.armour != 12 || you.shield != 17
          || record.worldId != 3 || record.x != 5 || record.y != 7 || record.dir != 2) {
        bad("the record does not come back the way it went in");
      }
      for (i = 0; i < WARE_COUNT; i++) {
        if (you.bag[i] != (u8)(i * 3 % 7)) { bad("the pouch does not survive a save"); break; }
      }
      for (i = 0; i < MAP_COUNT; i++) {
        for (j = 0; j < MAX_CROWD; j++) {
          if (slain[i][j] != (u8)((i + j) & 1)) { bad("the dead do not survive a save"); i = MAP_COUNT; break; }
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
