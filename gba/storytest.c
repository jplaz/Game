/* The story, on the cartridge: scenes with a fight in the middle of them.
 *
 * A fight used to end the scene it was in, on this cartridge and nowhere else.
 * Whatever the scene had left - the lines after the fight, the flags it set,
 * the people it walked off again - was skipped, so the melee at Harrenhal was
 * one bout rather than three and the story that runs through the caves could
 * not have been written at all. A scene is put aside for the fight now and
 * picked up again afterwards, and this plays the scenes that lean on that,
 * through the cartridge's own C:
 *
 *   - the old working on the gold road: an answer, a fight won, and the rest
 *   - the threat on the kingsroad: the answer that goes to steel, and what
 *     comes after it
 *   - the Grand Maester, taking the third of three roads - the one with the
 *     fight in it, which has to step over the other two
 *   - the melee at Harrenhal, three bouts where there used to be one
 *   - and the old working again with the fight lost: you are carried off,
 *     what was left of the scene is dropped, nobody from it is left standing
 *     where you wake, and the scene does not play a second time
 *
 * And one more loop a fight could shut you in: a dragon settled over the town
 * you wake in, whose clock only ran on fights won. Lose to it three times with
 * three fights left on its clock, and it has to have burned the town and gone.
 *
 * Every fight here is decided by the harness rather than fought: what is being
 * tested is the scene on either side of it.
 *
 *   cc -DHOST_TEST storytest.c -o storytest && ./storytest
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define HOST_TEST 1
#define main gba_main
#include "main.c"
#undef main

#define MEM_SPAN 0x03000400u
unsigned char *gbaMem;
unsigned char hostSram[65536];
int hostFramesLeft;

static int bad;
static void check(const char *what, int ok) {
  printf("%s %s\n", ok ? "ok  " : "BAD ", what);
  if (!ok) bad++;
}

static int sceneNamed(const char *name) {
  int i;
  for (i = 0; i < CUT_COUNT; i++) if (!strcmp(cuts[i].name, name)) return i;
  return -1;
}
/* The question a scene asks, if it asks one. */
static const Choice *choiceOf(int s) {
  int b;
  for (b = 0; b < cuts[s].count; b++) {
    const Beat *bt = &beats[cuts[s].first + b];
    if (bt->kind == BEAT_CHOOSE) return &choices[bt->a];
  }
  return 0;
}
static int fightsIn(int s) {
  int b, n = 0;
  for (b = 0; b < cuts[s].count; b++) if (beats[cuts[s].first + b].kind == BEAT_FIGHT) n++;
  return n;
}

/* ------------------------------------------------------------- the tests -- */
typedef struct {
  const char *scene;
  int answer;          /* which answer to give, if it asks */
  int win;             /* every fight goes your way, or none does */
  int fresh;           /* start from no story at all */
} Test;

static const Test tests[] = {
  { "Into the Hill", 2, 1, 0 },
  { "The Second Offer", 0, 1, 0 },
  { "The Grand Maester", 2, 1, 0 },
  { "The Melee", 0, 1, 0 },
  { "Into the Hill", 0, 0, 1 },
};
#define TESTS ((int)(sizeof tests / sizeof tests[0]))

static int cur = -1, phase, waited, target;
static int duels, resumed, deepest, heldAtFight, downs, wokeElsewhere;
static unsigned last;

static void press(unsigned keys) { REG_KEYINPUT = (u16)(~keys & 0x03FF); last = keys; }

static void judge(void) {
  const Test *t = &tests[cur];
  const Choice *c = choiceOf(target);
  char what[160];
  int left = cutAt < 0 && cutHeld < 0 && !cutLive[0] && !cutLive[1] && !cutLive[2];
  printf("-- %s (answer %d, fights %s)\n", t->scene, t->answer, t->win ? "won" : "lost");
  check("it plays", flagSet(cuts[target].flag));
  if (t->win) {
    snprintf(what, sizeof what, "every one of its fights is fought (%d of %d)", duels, fightsIn(target));
    check(what, duels == fightsIn(target));
    check("it is put aside for a fight rather than ended", heldAtFight);
    check("and picked up again afterwards", resumed);
    snprintf(what, sizeof what, "and played to its last beat (%d of %d)", deepest + 1, cuts[target].count);
    check(what, deepest >= cuts[target].count - 1);
    if (c) check("the answer given is the one remembered",
      flagSet(c->flag[t->answer])
      && (t->answer == 0 || !flagSet(c->flag[0]))
      && (c->count < 2 || t->answer == 1 || !flagSet(c->flag[1])));
    check("nobody from it is left standing afterwards", left);
  } else {
    check("losing the fight carries you off the map", duels >= 1 && wokeElsewhere);
    check("what was left of it is dropped, and nobody from it stands where you wake", left);
    check("it does not play again", flagSet(cuts[target].flag) && cutAt < 0);
  }
}

void hostFrame(void) {
  unsigned keys = 0;
  if (cur < 0) {
    /* Straight into the world as a Stark, past the title and the name, and
       wait there until the first morning has had its say. */
    if (phase == 0) {
      you.house = 0;
      you.name[0] = 'A'; you.name[1] = 0;
      beginGame();
      phase = 1;
      press(0);
      return;
    }
    if (cutAt >= 0 && cutAsking) keys = typeDone && !(last & KEY_A) ? KEY_A : 0;
    else if (windowOpen) keys = !(last & KEY_A) ? KEY_A : 0;
    else if (scene == SCENE_WORLD && cutAt < 0 && ++waited > 60) { cur = 0; phase = 0; }
    press(keys);
    return;
  }
  if (cur >= TESTS) {
    /* The dragon over the town you wake in. */
    static int stage, losses, burnedWas, lastScene;
    if (stage == 0) {
      sigils = 0xFF;                       /* the dragons are loose */
      you.swoopMap = (MapId)worldId;
      you.swoopAt = 3;
      burnedWas = you.swoopsBurned;
      stage = 1;
      press(0);
      return;
    }
    if (stage == 1 && scene == SCENE_WORLD && !windowOpen && cutAt < 0 && !shift) {
      if (losses >= 3 || you.swoopMap == NO_MAP) {
        printf("-- a dragon settled over the town you wake in\n");
        check("going down to it three times runs its clock out",
          losses == 3 && you.swoopMap == NO_MAP);
        check("and the town burns, so it is gone rather than waiting for ever",
          you.swoopsBurned == burnedWas + 1);
        hostFramesLeft = 0;
        press(0);
        return;
      }
      /* Out of the sun, over the town, and far too big for you. */
      you.swoopMap = (MapId)worldId;
      you.hp = vigourFor(you.level);
      wildWanted = BEAST_WYRM;
      wildLevel = 50;
      callToArms(-1, 0, -1);
      press(0);
      return;
    }
    if (scene == SCENE_DUEL) {
      if (mine.hp > 1) mine.hp = 1;
      theirs.hp = 999;
    }
    if (lastScene == SCENE_DUEL && scene != SCENE_DUEL) losses++;
    lastScene = scene;
    {
      unsigned k = 0;
      if (windowOpen || scene == SCENE_DUEL) { if (!(last & KEY_A)) k = KEY_A; }
      else if (scene != SCENE_WORLD) { if (!(last & KEY_B)) k = KEY_B; }
      press(k);
    }
    return;
  }

  if (phase == 0) {
    const Test *t = &tests[cur];
    target = sceneNamed(t->scene);
    if (target < 0) { printf("BAD there is no scene called %s\n", t->scene); bad++; cur++; return; }
    if (t->fresh) { int k; for (k = 0; k < STORY_WORDS; k++) storyFlags[k] = 0; }
    if (cuts[target].needs != 255) setFlag(cuts[target].needs);
    /* Only the scene under test is left waiting on its map: anything else
       owed there would be played first, and answered with this test's
       answer. */
    { int i;
      for (i = 0; i < CUT_COUNT; i++) {
        if (i != target && cuts[i].map == cuts[target].map && cuts[i].flag != cuts[target].flag) setFlag(cuts[i].flag);
      } }
    endCut();
    cutHeld = -1;
    sigils = 0xFF;
    you.hp = vigourFor(you.level);
    waited = duels = resumed = deepest = heldAtFight = wokeElsewhere = 0;
    deepest = -1;
    downs = t->answer;
    windowOpen = 0;
    enterMap(cuts[target].map, cuts[target].x, cuts[target].y, 0);
    phase = 1;
    press(0);
    return;
  }

  waited++;
  {
    static int inDuel;
    if (scene == SCENE_DUEL) {
      if (!inDuel) {
        duels++;
        inDuel = 1;
        if (getenv("TRACE")) printf("   duel %d: cut %d held %d target %d\n", duels, cutAt, cutHeld, target);
      }
      if (cutHeld == target) heldAtFight = 1;
      if (tests[cur].win) { if (theirs.hp > 1) theirs.hp = 1; }
      else { if (mine.hp > 1) mine.hp = 1; theirs.hp = 999; }
    } else {
      inDuel = 0;
    }
  }
  if (cutAt == target) {
    if (duels) resumed = 1;
    if (cutBeat > deepest) deepest = cutBeat;
  }
  if (duels && scene == SCENE_WORLD && worldId != cuts[target].map) wokeElsewhere = 1;

  if (cutAt >= 0 && cutAsking) {
    if (typeDone && !(last & (KEY_DOWN | KEY_A))) {
      if (downs > 0) { keys = KEY_DOWN; downs--; } else keys = KEY_A;
      if (getenv("TRACE")) printf("   asked in cut %d (%s): pick %d, pressing %s\n", cutAt, cuts[cutAt].name, cutPick, keys == KEY_A ? "A" : "down");
    }
  } else if (windowOpen || scene == SCENE_DUEL) {
    if (!(last & KEY_A)) keys = KEY_A;
  } else if (scene != SCENE_WORLD) {
    if (!(last & KEY_B)) keys = KEY_B;
  } else if (cutAt < 0 && cutHeld < 0 && flagSet(cuts[target].flag) && waited > 30) {
    judge();
    cur++;
    phase = 0;
  }
  if (waited > 30000) {
    printf("-- %s never finished (scene %d, cut %d, held %d)\n", tests[cur].scene, scene, cutAt, cutHeld);
    judge();
    cur++;
    phase = 0;
  }
  press(keys);
}

int main(void) {
  gbaMem = calloc(MEM_SPAN, 1);
  if (!gbaMem) { fprintf(stderr, "out of memory\n"); return 1; }
  REG_KEYINPUT = 0x03FF;
  hostFramesLeft = 400000;
  gba_main();
  if (cur < TESTS) { printf("BAD ran out of frames at test %d\n", cur); bad++; }
  if (bad) printf("%d wrong\n", bad);
  return bad ? 1 : 0;
}
