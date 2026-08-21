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

  printf("\nAuditing %d maps, %d people, %d duellists, %d techniques.\n\n",
    MAP_COUNT, 0, DUELLIST_COUNT, TECH_COUNT);

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
    if (houses[i].actor >= ACTOR_COUNT) bad("%s has no appearance", houses[i].full);
    speaker = 0;
    wrapText(houses[i].sworn, TXT_W - 44);
    if (lineCount > 2) note("%s: the words at swearing run to %d lines, the card shows two", houses[i].full, lineCount);
  }

  /* --- where you start --------------------------------------------------- */
  if (solidOn(&maps[0], 12, 12)) bad("the game starts you inside a wall");
  if (warpOn(&maps[0], 12, 12)) bad("the game starts you on a doorway");

  printf("\n  %d maps (%d reachable), %d people, %d signs, %d doors\n",
    MAP_COUNT, reached, totalNpc, totalSign, totalWarp);
  printf("  %d problems, %d notes\n\n", problems, notes);
  return problems ? 1 : 0;
}
