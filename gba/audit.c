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

static int walkableNeighbour(const Map *m, int x, int y) {
  int i;
  for (i = 0; i < 4; i++) if (!solidOn(m, x + DIR_X[i], y + DIR_Y[i])) return 1;
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
static int floodQ[64 * 64];

static void flood(const Map *m, int sx, int sy) {
  int head = 0, tail = 0, i;
  if (sx < 0 || sy < 0 || sx >= m->w || sy >= m->h) return;
  if (solidOn(m, sx, sy) || ledgeOn(m, sx, sy)) return;
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
      if (standable[ny * m->w + nx]) continue;
      standable[ny * m->w + nx] = 1;
      floodQ[tail++] = ny * m->w + nx;
    }
  }
}

static int standNextTo(const Map *m, int x, int y) {
  int i;
  for (i = 0; i < 4; i++) {
    int nx = x + DIR_X[i], ny = y + DIR_Y[i];
    if (nx < 0 || ny < 0 || nx >= m->w || ny >= m->h) continue;
    if (standable[ny * m->w + nx]) return 1;
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

int main(void) {
  int m, i, j, seen[MAP_COUNT], q[MAP_COUNT], head = 0, tail = 0, reached = 0;
  int totalNpc = 0, totalSign = 0, totalWarp = 0;

  gbaMem = calloc(0x03000400u, 1);
  buildGlyphTable();

  for (m = 0; m < MAP_COUNT; m++) totalNpc += maps[m].npcCount;
  printf("\nAuditing %d maps, %d people, %d duellists, %d techniques.\n\n",
    MAP_COUNT, totalNpc, DUELLIST_COUNT, TECH_COUNT);
  totalNpc = 0;

  /* --- can you get everywhere, and back again? ------------------------- */
  for (i = 0; i < MAP_COUNT; i++) seen[i] = 0;
  seen[0] = 1; q[tail++] = 0;
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

    if (map->w * 2 > 64 || map->h * 2 > 64) bad("%s is %dx%d, too big for the screen map", map->name, map->w, map->h);
    if (map->tileCount > 512) bad("%s needs %d tiles, video memory holds 512", map->name, map->tileCount);
    if (map->residentCount > 12) bad("%s needs %d appearances resident", map->name, map->residentCount);
    if (map->npcCount > MAX_CROWD) bad("%s has %d people, the crowd holds %d", map->name, map->npcCount, MAX_CROWD);
    checkText("a map name", map->name);

    /* --- can you walk to everything on this map? ------------------------ */
    memset(standable, 0, sizeof standable);
    if (m == 0) flood(map, 12, 12);
    for (i = 0; i < MAP_COUNT; i++) {
      for (j = 0; j < maps[i].warpCount; j++) {
        if (maps[i].warps[j].to == m) flood(map, maps[i].warps[j].tx, maps[i].warps[j].ty);
      }
    }
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

  /* --- what can be bought ------------------------------------------------- */
  for (i = 0; i < WARE_COUNT; i++) {
    const Ware *w = &wares[i];
    if (!w->price) bad("%s is for sale at nothing", w->name);
    if (w->kind > WARE_SHIELD) bad("%s is a kind of thing that does not exist", w->name);
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
  if (solidOn(&maps[0], 12, 12)) bad("the game starts you inside a wall");
  if (warpOn(&maps[0], 12, 12)) bad("the game starts you on a doorway");

  printf("\n  %d maps (%d reachable), %d people, %d signs, %d doors\n",
    MAP_COUNT, reached, totalNpc, totalSign, totalWarp);
  printf("  %d problems, %d notes\n\n", problems, notes);
  return problems ? 1 : 0;
}
