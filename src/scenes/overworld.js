// The overworld: grid movement, collision, warps, NPCs, trainers, encounters.

import { TILE, tileCanvas, tileDef, TILE_GROUP, N, E, S, W } from '../art/tiles.js';
import { variantFor } from '../art/pixels.js';
import { drawActor, ACTOR_H } from '../art/actors.js';
import { playerAppearance } from '../game/player.js';
import { getMap, regionOf, tileAt } from '../data/maps.js';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { TRACKS } from '../data/music.js';
import { rng } from '../engine/rng.js';
import { makeRoamer, ROAMERS } from '../data/duellists.js';
import { challengeFor } from '../game/challenge.js';
import { cutscenesOn } from '../data/cutscenes.js';
import { duellist as getDuellist } from '../data/duellists.js';
import { creatureSpecies, displayName, wildCreature } from '../game/creature.js';
import { walkEggs, hatch, deepenBond, willCarry } from '../game/eggs.js';
import { activeCompanion, hasFallen, kill as killCompanion } from '../game/company.js';
import { ownsHoldfast, gather, INGREDIENTS } from '../game/holdfast.js';
import { creatureSprite, SPRITE_SIZE } from '../art/creatures.js';
import { dialog } from '../ui/textbox.js';
import { drawPanel } from '../ui/panel.js';
import { drawText, measure } from '../engine/font.js';
import {
  game, flag, setFlag, standingWord, setLocalRegion, isDead, recordChoice,
} from '../game/state.js';
import { SCRIPTS } from '../data/scripts.js';
import { TRAINERS } from '../data/trainers.js';

const SCREEN_W = 240;
const SCREEN_H = 160;
const WALK_TIME = 0.17;
const RUN_TIME = 0.095;
const RIDE_TIME = 0.075;
const ENCOUNTER_CHANCE = 0.11;
// Mounted you cover ground faster and trouble is likelier to let you pass.
const MOUNTED_ENCOUNTER_SCALE = 0.35;
// How often a roadside encounter turns out to be a whole company.
const WARBAND_CHANCE = 0.12;
// How often walking through cover turns up something for the larder instead.
const FORAGE_CHANCE = 0.07;
const FORAGE_BY_REGION = {
  'The North': ['venison', 'grain'],
  'The Neck': ['fish', 'venison'],
  'The Wall': ['venison'],
  'Beyond the Wall': ['venison'],
  'The Riverlands': ['fish', 'grain'],
  'The Vale': ['venison', 'honey'],
  'The Westerlands': ['grain', 'honey'],
  'The Reach': ['grain', 'honey', 'wine'],
  'Dorne': ['spice', 'wine'],
  'The Stormlands': ['venison', 'fish'],
  'The Crownlands': ['grain', 'wine'],
  'Dragonstone': ['fish'],
};
const MOUNT_SIZE = 30;
const RIDER_LIFT = 13;

export class Overworld {
  constructor() {
    this.map = null;
    this.player = {
      x: 0, y: 0, dir: 'down',
      moving: null, step: 0, animTimer: 0, sprite: 'hero',
    };
    this.npcs = [];
    this.camera = { x: 0, y: 0 };
    this.frameTimer = 0;
    this.animFrame = 0;
    this.script = null;
    this.turnDelay = 0;
    this.bumpCooldown = 0;
    this.pendingEncounter = null;
    this.mount = null;      // { creature, kind } while you are riding
    this.pendingHatch = null;
    // Where whoever rides with you is standing, a step behind.
    this.follower = null;
    // A dragon crossing the sky, and its shadow on the ground under it.
    this.skyDragon = null;
    this.skyTimer = rng.int(14, 40);
    this.cutscene = null;      // a scene playing out in the world around you
    this.cutsceneTimer = null;
    this.shake = 0;
    this.flash = null;
    this.alert = null;      // '!' bubble over a trainer who has spotted you
    this.approach = null;   // trainer walking toward the player
    this.onLoadScript = null;
  }

  enter() {
    this.loadMap(game.state.position.map, game.state.position);
  }

  resume() {
    audio.play(this.map?.music ?? 'town', TRACKS);
  }

  /** Swaps to a map and places the player. */
  loadMap(mapId, { x, y, dir }) {
    this.map = getMap(mapId);
    this.region = regionOf(mapId);
    setLocalRegion(this.region);
    // You leave the beast outside; it does not follow you through a doorway.
    if (this.map.indoor) this.mount = null;
    // Nor does a mount that has been taken out of your party or knocked down.
    if (this.mount && !game.state.party.includes(this.mount.creature)) this.mount = null;
    if (this.mount && this.mount.creature.hp <= 0) this.mount = null;
    // The companion arrives with you rather than walking the whole way.
    this.follower = activeCompanion() ? { x, y, dir, moving: null, step: 0 } : null;
    this.player.x = x;
    this.player.y = y;
    this.player.dir = dir ?? 'down';
    this.player.moving = null;
    this.player.sprite = game.state.player.sprite;
    this.frameTimer = 0;
    game.state.position = { map: mapId, x, y, dir: this.player.dir };

    this.npcs = (this.map.npcs ?? []).map((def, index) => ({
      ...def,
      id: `${mapId}:${index}`,
      homeX: def.x,
      homeY: def.y,
      startDir: def.dir,
      step: 0,
      moving: null,
      // Anyone you killed is gone from the world for good, on every map and
      // every reload.
      hidden: (def.hideIfFlag ? flag(def.hideIfFlag) : false)
        || (def.data?.trainer ? isDead(`trainer_${def.data.trainer}`) : false)
        || (def.data?.duel ? isDead(`duel_${def.data.duel}`) : false)
        || (def.data?.companion ? hasFallen(def.data.companion) : false),
    }));

    this.updateCamera(true);
    audio.play(this.map.music ?? 'town', TRACKS);

    // A map-entry script (used for the story beats) runs once on arrival.
    const entry = this.map.onEnter;
    if (entry && !flag(`entered_${mapId}`)) {
      setFlag(`entered_${mapId}`);
      this.runScript(entry, null);
    }
  }

  // ------------------------------------------------------------- helpers --

  npcAt(x, y) {
    return this.npcs.find((npc) => !npc.hidden && npc.x === x && npc.y === y) ?? null;
  }

  itemAt(x, y) {
    return (this.map.items ?? []).find((it) => it.x === x && it.y === y && !flag(it.flag)) ?? null;
  }

  signAt(x, y) {
    return (this.map.signs ?? []).find((s) => s.x === x && s.y === y) ?? null;
  }

  warpAt(x, y) {
    return (this.map.warps ?? []).find((w) => w.x === x && w.y === y) ?? null;
  }

  blocked(x, y) {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return true;
    const def = tileDef(tileAt(this.map, x, y));
    // A swimming or flying mount carries you over water that would stop you on
    // foot; nothing carries you through a wall.
    const overWater = this.mount && (this.mount.kind === 'swim' || this.mount.kind === 'fly');
    if (def.kind === 'solid') return true;
    if (def.kind === 'water' && !overWater) return true;
    if (this.npcAt(x, y)) return true;
    if (this.itemAt(x, y)) return true;
    return false;
  }

  static delta(dir) {
    return { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] ?? [0, 0];
  }

  get busy() {
    return Boolean(this.script) || dialog.busy || Boolean(this.approach)
      || Boolean(this.cutscene) || this.manager.busy;
  }

  // -------------------------------------------------------------- update --

  update(dt) {
    this.frameTimer += dt;
    this.animFrame = Math.floor(this.frameTimer * 2.5) % 2;

    dialog.update(dt);
    game.state.player.playtime += dt;

    if (this.approach) {
      this.updateApproach(dt);
    } else if (!this.busy) {
      this.updateInput(dt);
    }

    this.updateMovement(dt);
    this.updateNpcs(dt);
    this.updateCamera(false);
  }

  updateInput() {
    if (input.pressed('start')) {
      audio.sfx('confirm');
      import('./menu.js').then(({ MainMenu }) => this.manager.push(new MainMenu()));
      return;
    }
    if (input.pressed('a')) {
      this.interact();
      return;
    }
    if (input.pressed('ride')) {
      this.toggleRide();
      return;
    }
    if (input.pressed('challenge')) {
      this.callSomeoneOut();
      return;
    }
    if (this.player.moving || this.turnDelay > 0) return;

    const dir = input.direction();
    if (!dir) {
      this.player.step = 0;
      return;
    }

    // Turning in place: the first press only changes facing, which is what
    // makes it possible to face a sign without walking into it.
    if (this.player.dir !== dir) {
      this.player.dir = dir;
      this.turnDelay = 0.08;
      this.player.step = 0;
      return;
    }

    const [dx, dy] = Overworld.delta(dir);
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    const targetTile = tileAt(this.map, nx, ny);

    // Ledges: you may hop down them, never up.
    if (tileDef(targetTile).kind === 'ledge' && this.mount?.kind === 'fly') {
      this.startMove(nx, ny, false);
      return;
    }
    if (tileDef(targetTile).kind === 'ledge' && dir === 'down') {
      this.startMove(nx, ny + 1, true);
      audio.sfx('bump');
      return;
    }

    if (this.blocked(nx, ny)) {
      if (!this.bumpCooldown) {
        audio.sfx('bump');
        this.bumpCooldown = 0.4;
      }
      return;
    }
    this.startMove(nx, ny, false);
  }

  /** The companion steps into the tile you are leaving. */
  moveFollower(fromX, fromY, duration) {
    if (!activeCompanion()) return;
    if (!this.follower) {
      this.follower = { x: fromX, y: fromY, dir: this.player.dir, moving: null, step: 0 };
      return;
    }
    if (this.follower.x === fromX && this.follower.y === fromY) return;
    const dx = fromX - this.follower.x;
    const dy = fromY - this.follower.y;
    this.follower.dir = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
    this.follower.moving = {
      fromX: this.follower.x, fromY: this.follower.y,
      toX: fromX, toY: fromY, t: 0, duration,
    };
  }

  updateFollower(dt) {
    const f = this.follower;
    if (!f) return;
    if (!activeCompanion()) { this.follower = null; return; }
    if (!f.moving) { f.step = 0; return; }
    f.moving.t += dt / f.moving.duration;
    f.step = 1 + (Math.floor(f.moving.t * 4) % 4);
    if (f.moving.t >= 1) {
      f.x = f.moving.toX;
      f.y = f.moving.toY;
      f.moving = null;
    }
  }

  startMove(x, y, hop) {
    const running = input.held('b') && !hop;
    let duration = hop ? 0.3 : (running ? RUN_TIME : WALK_TIME);
    if (this.mount && !hop) duration = RIDE_TIME;
    this.player.moving = {
      fromX: this.player.x, fromY: this.player.y,
      toX: x, toY: y,
      t: 0,
      duration,
      hop,
    };
  }

  /**
   * Calling out whoever you are facing. Anyone in the world can be fought at
   * any time — but they have to accept, and who they are and what they think of
   * you decides whether they do.
   */
  async callSomeoneOut() {
    const [dx, dy] = Overworld.delta(this.player.dir);
    const npc = this.npcAt(this.player.x + dx, this.player.y + dy);
    if (!npc || npc.hidden) {
      await dialog.say('There is nobody in front of you to call out.');
      return;
    }

    const def = challengeFor(npc);
    if (!def) {
      await dialog.say(`${npc.name}: I am not fighting you. Find somebody who wants to.`);
      return;
    }
    if (def.alreadyBeaten) {
      await dialog.say(`${npc.name}: We have done this. It went badly for me and I remember it.`);
      return;
    }

    const answer = await dialog.choose(`Call out ${npc.name}?`, ['Draw steel', 'Leave it']);
    if (answer !== 0) return;

    // Whether they take it. People who like you mostly will not.
    const word = def.house ? standingWord(def.house) : 'neutral';
    if (word === 'sworn' && !def.eager) {
      await dialog.say(`${npc.name}: You carry our banner. I will not draw on you and `
        + 'you should not have asked.');
      return;
    }
    await this.startAmbush(def.duellist);
  }

  // ----------------------------------------------------------------- riding --

  /**
   * The lead creature that will carry you. A grown beast simply will; a dragon
   * has to trust you first, and the reason it refuses is worth reporting.
   */
  rideable() {
    let refusal = null;
    for (const creature of game.state.party) {
      if (creature.hp <= 0) continue;
      const verdict = willCarry(creature);
      if (verdict.ok) return { creature, kind: verdict.kind };
      if (verdict.reason === 'untrusting' && !refusal) refusal = { creature, verdict };
    }
    return refusal ? { refused: refusal } : null;
  }

  async toggleRide() {
    if (this.mount) {
      // You cannot get down in the middle of water or thin air.
      const def = tileDef(tileAt(this.map, this.player.x, this.player.y));
      if (def.kind === 'water') {
        await dialog.say('Not here. Find dry land first.');
        return;
      }
      const name = displayName(this.mount.creature);
      this.mount = null;
      audio.sfx('cancel');
      await dialog.say(`You swing down from ${name}.`);
      return;
    }

    if (this.map.indoor) {
      await dialog.say('There is no room for that in here.');
      return;
    }
    const found = this.rideable();
    if (found?.refused) {
      const name = displayName(found.refused.creature);
      await dialog.say(`${name} shows you its teeth. It is grown enough to carry you `
        + 'and does not yet think enough of you to let you try.');
      return;
    }
    if (!found) {
      const party = game.state.party.filter((c) => c.hp > 0);
      await dialog.say(party.length
        ? 'Nothing you keep is grown enough to carry you yet.'
        : 'You have nothing to ride.');
      return;
    }
    this.mount = found;
    audio.sfx('confirm');
    const verb = { fly: 'climb onto', swim: 'wade out on', ground: 'swing up onto' }[found.kind];
    await dialog.say(`You ${verb} ${displayName(found.creature)}.`);
  }

  updateMovement(dt) {
    this.updateFollower(dt);
    this.updateSky(dt);

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    if (this.flash) {
      this.flash.time -= dt;
      if (this.flash.time <= 0) this.flash = null;
    }
    if (this.cutsceneTimer) {
      this.cutsceneTimer.left -= dt;
      if (this.cutsceneTimer.left <= 0) {
        const { resolve } = this.cutsceneTimer;
        this.cutsceneTimer = null;
        resolve();
      }
    }
    if (this.bumpCooldown > 0) this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    if (this.turnDelay > 0) this.turnDelay = Math.max(0, this.turnDelay - dt);

    const move = this.player.moving;
    if (!move) return;

    move.t += dt / move.duration;
    if (move.t < 1) {
      this.player.animTimer += dt;
      this.player.step = 1 + (Math.floor(this.player.animTimer * 8) % 4);
      return;
    }

    this.moveFollower(move.fromX, move.fromY, move.duration);
    this.player.x = move.toX;
    this.player.y = move.toY;
    this.player.moving = null;
    this.player.step = (this.player.step + 1) % 4;
    game.state.position = { map: this.map.id, x: this.player.x, y: this.player.y, dir: this.player.dir };
    game.state.player.steps++;

    // Eggs hatch because you carried them somewhere, not because you used them.
    const ready = walkEggs(1);
    if (ready.length) this.pendingHatch = ready[0];

    // Carrying you is how a mount comes to trust you, a little at a time.
    if (this.mount && game.state.player.steps % 24 === 0) {
      deepenBond(this.mount.creature, 1);
    }

    this.onArrive();
  }

  onArrive() {
    const warp = this.warpAt(this.player.x, this.player.y);
    if (warp) {
      this.doWarp(warp);
      return;
    }
    // An egg that finished on this step comes first: it is the reason you have
    // been walking, and nothing should interrupt it.
    if (this.pendingHatch) {
      this.doHatch();
      return;
    }
    if (this.checkCutscene()) return;
    if (this.checkTrainers()) return;
    this.checkEncounter();
  }

  /** Whether standing here starts something. Each scene fires once, ever. */
  checkCutscene() {
    for (const scene of cutscenesOn(this.map.id)) {
      if (scene.x !== this.player.x || scene.y !== this.player.y) continue;
      if (flag(scene.flag)) continue;
      setFlag(scene.flag);
      this.playCutscene(scene);
      return true;
    }
    return false;
  }

  /**
   * Plays a scene's beats in order. The overworld keeps drawing throughout, so
   * these happen in the world rather than cutting away from it.
   */
  async playCutscene(scene) {
    this.cutscene = { cast: new Map() };
    audio.sfx('cursor');

    try {
      for (const beat of scene.beats) {
        const [kind, ...args] = beat;
        await this.playBeat(kind, args, scene);
        if (!this.cutscene) return;   // a fight or a warp ended it early
      }
    } finally {
      // Anyone the scene brought on goes away with it.
      for (const actor of this.cutscene?.cast.values() ?? []) {
        const index = this.npcs.indexOf(actor);
        if (index >= 0) this.npcs.splice(index, 1);
      }
      this.cutscene = null;
    }
  }

  async playBeat(kind, args, scene) {
    const cast = this.cutscene.cast;
    const actorFor = (id) => (id === 'player' ? this.player : cast.get(id));

    switch (kind) {
      case 'say':
        await dialog.say(args[0], args[1]);
        break;
      case 'wait':
        await this.pause(args[0]);
        break;
      case 'shake':
        this.shake = args[0];
        await this.pause(args[0]);
        break;
      case 'flash':
        this.flash = { time: args[0], max: args[0], color: args[1] ?? '#ffffff' };
        await this.pause(args[0]);
        break;
      case 'sky':
        this.skyDragon = null;
        this.skyTimer = 0;
        this.updateSky(0.016);
        break;
      case 'flag':
        setFlag(args[0]);
        break;
      case 'spawn': {
        const [id, def] = args;
        const actor = {
          ...def, id: `cutscene:${id}`, step: 0, moving: null, hidden: false,
          script: 'generic', data: {},
        };
        cast.set(id, actor);
        this.npcs.push(actor);
        break;
      }
      case 'despawn': {
        const actor = cast.get(args[0]);
        if (actor) {
          const index = this.npcs.indexOf(actor);
          if (index >= 0) this.npcs.splice(index, 1);
          cast.delete(args[0]);
        }
        break;
      }
      case 'face': {
        const actor = actorFor(args[0]);
        if (actor) actor.dir = args[1];
        break;
      }
      case 'walk': {
        const [id, dir, steps] = args;
        const actor = actorFor(id);
        if (actor) await this.walkActor(actor, dir, steps);
        break;
      }
      case 'choose': {
        const [text, options, opts] = args;
        const picked = await dialog.choose(text, options);
        if (opts?.record) recordChoice(opts.record, options[picked] ?? options[0]);
        break;
      }
      case 'fight': {
        const foe = args[0];
        this.cutscene = null;
        await this.startAmbush(typeof foe === 'string' ? getDuellist(foe) : foe);
        break;
      }
      default:
        console.warn(`Cutscene "${scene.id}" has an unknown beat "${kind}"`);
    }
  }

  /** Walks an actor a number of tiles, waiting for each step to land. */
  walkActor(actor, dir, steps) {
    return new Promise((resolve) => {
      const [dx, dy] = Overworld.delta(dir);
      let left = steps;
      const step = () => {
        if (left <= 0) { actor.step = 0; resolve(); return; }
        actor.dir = dir;
        actor.moving = {
          fromX: actor.x, fromY: actor.y,
          toX: actor.x + dx, toY: actor.y + dy,
          t: 0, duration: 0.18, onDone: () => { left--; step(); },
        };
      };
      step();
    });
  }

  pause(seconds) {
    return new Promise((resolve) => { this.cutsceneTimer = { left: seconds, resolve }; });
  }

  doHatch() {
    const egg = this.pendingHatch;
    this.pendingHatch = null;
    const creature = hatch(egg);
    this.manager.transition(async () => {
      const { Hatch } = await import('./hatch.js');
      this.manager.push(new Hatch({
        creature,
        onEnd: () => audio.play(this.map.music ?? 'town', TRACKS),
      }));
    }, { color: '#1a1018' });
  }

  doWarp(warp) {
    audio.sfx('confirm');
    this.manager.transition(() => {
      this.loadMap(warp.to, { x: warp.tx, y: warp.ty, dir: warp.dir ?? 'down' });
    });
  }

  /**
   * Who steps out of the trees. The road is dangerous because of the people on
   * it, not because of the animals, so an encounter is always somebody who
   * means to fight you themselves — sometimes with a beast at their heel.
   */
  checkEncounter() {
    const def = tileDef(tileAt(this.map, this.player.x, this.player.y));
    if (def.kind !== 'encounter') return;
    if (!(this.map.encounters?.length)) return;
    if (game.state.player.wounded) return;
    // Cover is also where things grow and graze. If you hold a hall, some of
    // what you walk through ends up in its larder.
    if (ownsHoldfast() && rng.chance(FORAGE_CHANCE)) {
      const found = rng.pick(FORAGE_BY_REGION[this.region] ?? ['grain']);
      gather(found, 1);
      audio.sfx('confirm');
      dialog.say(`You gather ${INGREDIENTS[found].name} and send it back to the hall.`);
      return;
    }

    const chance = ENCOUNTER_CHANCE * (this.mount ? MOUNTED_ENCOUNTER_SCALE : 1);
    if (!rng.chance(chance)) return;

    const entry = rng.weighted(this.map.encounters);
    const level = rng.int(entry.min, entry.max);

    // Cover hides both kinds of trouble: somebody waiting for you, or something
    // that simply lives there.
    if (entry.beast) {
      if (!game.state.party.some((c) => c.hp > 0)) return;
      audio.sfx('encounter');
      this.startBattle({ kind: 'wild', foe: wildCreature(entry.beast, entry.min, entry.max) });
      return;
    }

    const foe = makeRoamer(entry.roamer, level, (list) => rng.pick(list));

    // Some of them travel with an animal, which is the only time you meet a
    // beast on the road rather than in someone's keeping.
    const companion = ROAMERS[entry.roamer].beast;
    if (companion && rng.chance(companion.chance)) {
      foe.beast = { species: companion.species, level: Math.max(2, level - 1) };
    }

    // Now and again it is not one of them. A warband is a proper fight: their
    // captain, better armed, with the rest at his back and no walking away.
    if (rng.chance(WARBAND_CHANCE)) {
      foe.name = `${foe.name}, Captain`;
      foe.level = Math.min(50, foe.level + 3);
      foe.vigour = Math.round(foe.vigour * 1.45);
      foe.might = Math.round(foe.might * 1.2);
      foe.guard = Math.round(foe.guard * 1.2);
      foe.wind = Math.round(foe.wind * 1.2);
      foe.reward = Math.round(foe.reward * 2.2);
      foe.exp = Math.round(foe.exp * 2);
      foe.boss = true;
      foe.canYield = false;
      foe.intro = `${foe.name}: We are a company, not a beggar on a road. `
        + 'Put it down or be put down.';
      if (!foe.beast && companion) {
        foe.beast = { species: companion.species, level: Math.max(2, level) };
      }
    }

    // Whose colours they are wearing decides whether this is a fight at all.
    // Men of a house that thinks well of you step aside; men of one you have
    // wronged come looking, and bring an extra year of training with them.
    if (foe.house) {
      const word = standingWord(foe.house);
      if (word === 'sworn' || (word === 'friendly' && rng.chance(0.6))) {
        this.greetOnRoad(foe);
        return;
      }
      if (word === 'hostile') {
        foe.level += 2;
        foe.vigour = Math.round(foe.vigour * 1.1);
        foe.might = Math.round(foe.might * 1.1);
        foe.intro = `${foe.name}: We know your banner. We have been waiting for it.`;
      }
    }

    audio.sfx('encounter');
    this.startAmbush(foe);
  }

  /** Men of a friendly house let you by, and say why. */
  async greetOnRoad(foe) {
    const word = standingWord(foe.house);
    const line = word === 'sworn'
      ? `${foe.name}: Your banner is ours. The road is clear ahead — we swept it this morning.`
      : `${foe.name}: We have no quarrel with you. Keep to the road and keep your steel down.`;
    audio.sfx('cursor');
    await dialog.say(line, { theme: 'parchment' });
  }

  /** A roadside fight. Losing one still costs you, the same as any duel. */
  startAmbush(def) {
    return new Promise((resolve) => {
      const onEnd = async (outcome) => {
        if (outcome === 'lost') await this.whiteout(true);
        resolve(outcome);
      };
      this.manager.transition(async () => {
        const { Duel } = await import('./duel.js');
        this.manager.push(new Duel({ def, onEnd }));
      }, { color: '#1a1016' });
    });
  }

  /** Any trainer with line of sight to the player starts walking over. */
  checkTrainers() {
    for (const npc of this.npcs) {
      const trainerId = npc.data?.trainer;
      if (!trainerId || npc.hidden) continue;
      if (flag(`trainer_${trainerId}`)) continue;

      const sight = this.trainerSight(npc);
      if (sight === null) continue;

      this.alert = { npc, timer: 0.9 };
      this.approach = { npc, steps: sight, timer: 0, phase: 'alert' };
      audio.sfx('encounter');
      return true;
    }
    return false;
  }

  /** Distance to the player along the NPC's facing, or null if not in view. */
  trainerSight(npc) {
    const range = npc.data?.sightOverride ?? this.trainerRange(npc);
    if (!range) return null;
    const [dx, dy] = Overworld.delta(npc.dir);
    for (let step = 1; step <= range; step++) {
      const x = npc.x + dx * step;
      const y = npc.y + dy * step;
      if (this.player.x === x && this.player.y === y) return step - 1;
      const def = tileDef(tileAt(this.map, x, y));
      if (def.kind === 'solid' || def.kind === 'water') return null;
      if (this.npcAt(x, y)) return null;
    }
    return null;
  }

  trainerRange(npc) {
    const id = npc.data?.trainer;
    if (!id) return 0;
    return TRAINERS[id]?.sight ?? 0;
  }

  updateApproach(dt) {
    const state = this.approach;
    state.timer += dt;
    if (state.phase === 'alert') {
      if (state.timer > 0.8) {
        state.phase = 'walk';
        state.timer = 0;
      }
      return;
    }
    if (state.phase === 'walk') {
      if (state.steps <= 0) {
        state.phase = 'talk';
        this.approach.npc.dir = this.facingFrom(state.npc);
        this.startTrainerScript(state.npc);
        return;
      }
      if (!state.npc.moving) {
        const [dx, dy] = Overworld.delta(state.npc.dir);
        state.npc.moving = {
          fromX: state.npc.x, fromY: state.npc.y,
          toX: state.npc.x + dx, toY: state.npc.y + dy,
          t: 0, duration: 0.16,
        };
        state.steps--;
      }
    }
  }

  /**
   * Something crosses the sky now and again. Outdoors only, and it does not
   * interrupt anything — it is there to be looked at, and to make the world
   * feel like one with dragons in it.
   */
  updateSky(dt) {
    if (this.map?.indoor) { this.skyDragon = null; return; }

    if (this.skyDragon) {
      const d = this.skyDragon;
      d.x += d.vx * dt;
      d.t += dt;
      if (d.x < -80 || d.x > 320) this.skyDragon = null;
      return;
    }

    this.skyTimer -= dt;
    if (this.skyTimer > 0) return;
    this.skyTimer = rng.int(25, 70);

    // A dragon of your own flies over more often, because it is looking for you.
    const yours = game.state.party.find((c) => creatureSpecies(c).mount === 'fly');
    const rightToLeft = rng.chance(0.5);
    this.skyDragon = {
      x: rightToLeft ? 300 : -60,
      y: rng.int(8, 46),
      vx: (rightToLeft ? -1 : 1) * rng.int(26, 46),
      t: 0,
      size: yours ? 26 : rng.int(14, 22),
      mine: Boolean(yours),
    };
  }

  /** The dragon itself, and the shadow it drags across the ground. */
  drawSky(ctx) {
    const d = this.skyDragon;
    if (!d) return;
    const flap = Math.sin(d.t * 6);
    const x = Math.round(d.x);
    const y = Math.round(d.y + Math.sin(d.t * 1.4) * 2);
    const s = d.size;
    const body = d.mine ? '#4a1a1e' : '#2c2a34';
    const wing = d.mine ? '#6b2228' : '#3d3a48';

    // The shadow first, on the ground, offset and flattened.
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#000000';
    const sy = y + 70;
    ctx.fillRect(x - Math.round(s * 0.6), sy, Math.round(s * 1.2), 3);
    ctx.fillRect(x - Math.round(s * 0.25), sy - 1, Math.round(s * 0.5), 5);
    ctx.restore();

    // Wings, which is nearly all of a dragon at this distance.
    const span = Math.round(s * (0.7 + flap * 0.25));
    ctx.fillStyle = wing;
    ctx.fillRect(x - s, y - Math.round(flap * 3), span, 2);
    ctx.fillRect(x + s - span, y - Math.round(flap * 3), span, 2);
    ctx.fillStyle = body;
    ctx.fillRect(x - 2, y - 1, 5, 4);
    ctx.fillRect(x + (d.vx > 0 ? 3 : -4), y, 2, 2);          // head
    ctx.fillRect(x - (d.vx > 0 ? 8 : -6), y + 1, 6, 1);      // tail
  }

  facingFrom(npc) {
    const dx = this.player.x - npc.x;
    const dy = this.player.y - npc.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }

  startTrainerScript(npc) {
    this.alert = null;
    this.approach = null;
    // Face the trainer.
    this.player.dir = { up: 'down', down: 'up', left: 'right', right: 'left' }[npc.dir] ?? 'down';
    this.runScript('trainer', npc);
  }

  updateNpcs(dt) {
    for (const npc of this.npcs) {
      if (!npc.moving) continue;
      npc.moving.t += dt / npc.moving.duration;
      npc.step = 1 + (Math.floor(npc.moving.t * 4) % 4);
      if (npc.moving.t >= 1) {
        npc.x = npc.moving.toX;
        npc.y = npc.moving.toY;
        const done = npc.moving.onDone;
        npc.moving = null;
        done?.();
      }
    }
    if (this.alert) {
      this.alert.timer -= dt;
      if (this.alert.timer <= 0) this.alert = null;
    }
  }

  updateCamera(snap) {
    const px = this.playerPixel();
    let camX = px.x + TILE / 2 - SCREEN_W / 2;
    let camY = px.y + TILE / 2 - SCREEN_H / 2;

    const mapW = this.map.width * TILE;
    const mapH = this.map.height * TILE;
    camX = mapW <= SCREEN_W ? (mapW - SCREEN_W) / 2 : Math.max(0, Math.min(mapW - SCREEN_W, camX));
    camY = mapH <= SCREEN_H ? (mapH - SCREEN_H) / 2 : Math.max(0, Math.min(mapH - SCREEN_H, camY));

    if (snap) {
      this.camera.x = camX;
      this.camera.y = camY;
    } else {
      this.camera.x = camX;
      this.camera.y = camY;
    }
  }

  playerPixel() {
    const move = this.player.moving;
    if (!move) return { x: this.player.x * TILE, y: this.player.y * TILE, lift: 0 };
    const t = Math.min(1, move.t);
    const x = (move.fromX + (move.toX - move.fromX) * t) * TILE;
    const y = (move.fromY + (move.toY - move.fromY) * t) * TILE;
    const lift = move.hop ? Math.sin(t * Math.PI) * 10 : 0;
    return { x, y, lift };
  }

  // ------------------------------------------------------------ interact --

  interact() {
    if (this.player.moving) return;
    const [dx, dy] = Overworld.delta(this.player.dir);
    let x = this.player.x + dx;
    let y = this.player.y + dy;

    // Counters are talked across: check the tile behind them too.
    let npc = this.npcAt(x, y);
    if (!npc && tileAt(this.map, x, y) === 'K') {
      npc = this.npcAt(x + dx, y + dy);
    }
    if (npc) {
      npc.dir = this.facingFrom(npc);
      this.runScript(npc.script ?? 'generic', npc);
      return;
    }

    const item = this.itemAt(x, y);
    if (item) {
      this.runScript('pickup', item);
      return;
    }

    const sign = this.signAt(x, y);
    if (sign) {
      audio.sfx('cursor');
      this.script = dialog.say(sign.text).then(() => { this.script = null; });
      return;
    }

    // Reading the tile you are standing on covers beds, thrones and the like.
    const here = tileAt(this.map, x, y);
    if (here === 'W') {
      this.script = dialog.say(
        'A heart tree. The face carved into it is weeping red sap, the way it has for ten thousand years.',
      ).then(() => { this.script = null; });
    }
  }

  runScript(name, subject) {
    const fn = SCRIPTS[name] ?? SCRIPTS.generic;
    const api = this.makeScriptApi(subject);
    this.script = Promise.resolve()
      .then(() => fn(api))
      .catch((err) => console.error(`Script "${name}" failed:`, err))
      .then(() => { this.script = null; });
  }

  makeScriptApi(subject) {
    return {
      subject,
      npc: subject,
      overworld: this,
      say: (text, opts) => dialog.say(text, opts),
      choose: (text, options, opts) => dialog.choose(text, options, opts),
      battle: (config) => this.startBattle(config),
      duel: (duellistId) => this.startDuel(duellistId),
      holdCourt: () => this.holdCourt(),
      openShop: (stock) => this.openShop(stock),
      openSmithy: (stock) => this.openSmithy(stock),
      healParty: () => this.healAtHall(),
      setFlag,
      flag,
    };
  }

  // -------------------------------------------------------------- battles --

  startBattle(config) {
    return new Promise((resolve) => {
      const onEnd = async (outcome) => {
        if (outcome === 'lost') await this.whiteout();
        resolve(outcome);
      };
      this.manager.transition(async () => {
        const { Battle } = await import('./battle.js');
        this.manager.push(new Battle({ ...config, onEnd }));
      }, { color: '#101018' });
    });
  }

  /** A duel: you, in person, against a named opponent. */
  startDuel(duellistId) {
    return new Promise((resolve) => {
      const onEnd = async (outcome) => {
        if (outcome === 'lost') await this.whiteout(true);
        resolve(outcome);
      };
      this.manager.transition(async () => {
        const { Duel } = await import('./duel.js');
        this.manager.push(new Duel({ duellistId, onEnd }));
      }, { color: '#1a1016' });
    });
  }

  /** Naming your own hall, on the same keyboard you named yourself with. */
  renameHall() {
    return new Promise((resolve) => {
      this.manager.transition(async () => {
        const { HallName } = await import('./hallname.js');
        this.manager.push(new HallName({ onEnd: resolve }));
      });
    });
  }

  /** Carries you across the Narrow Sea and puts you ashore where you paid to go. */
  sailTo(port) {
    this.manager.transition(() => {
      this.loadMap(port.map, { x: port.x, y: port.y, dir: port.dir ?? 'down' });
    }, { color: '#12243c' });
  }

  /** A turn of ruling, held from the chair. */
  holdCourt() {
    return new Promise((resolve) => {
      this.manager.transition(async () => {
        const { Court } = await import('./court.js');
        this.manager.push(new Court({
          onEnd: async (outcome) => {
            audio.play(this.map.music ?? 'town', TRACKS);
            if (outcome === 'deposed') {
              const { Credits } = await import('./credits.js');
              this.manager.push(new Credits());
            }
            resolve(outcome);
          },
        }));
      }, { color: '#1a1016' });
    });
  }

  async openSmithy(stock) {
    const { Smithy } = await import('./smithy.js');
    return new Promise((resolve) => {
      this.manager.push(new Smithy({ stock, onClose: resolve }));
    });
  }

  /** Defeat: you wake up back at the last Maester's Hall, whole but poorer. */
  /**
   * Losing. Going down in a fight in this world is meant to cost something you
   * feel: gold, a wound that follows you, and sometimes the person who was
   * standing beside you when it happened.
   */
  async whiteout(personal = false) {
    const { healParty, game: g, addMoney } = await import('../game/state.js');
    const lost = Math.floor(g.state.player.money * (personal ? 0.35 : 0.2));
    addMoney(-lost);
    healParty();

    g.state.player.deaths = (g.state.player.deaths ?? 0) + 1;

    const wound = personal
      ? "You wake on a cot in a Maester's Hall, stitched and aching"
      : "You woke in a Maester's Hall with your creatures tended";
    await dialog.say(lost > 0 ? `${wound}... and ${lost} fewer gold dragons.` : `${wound}.`);

    // Somebody has to have carried you off the field, and it is not always
    // someone who survives doing it.
    const ally = activeCompanion();
    if (personal && ally && rng.chance(0.35)) {
      const name = ally.name;
      killCompanion();
      audio.sfx('faint');
      await dialog.say(`${name} carried you out. ${name} did not come back for the second trip.`,
        { theme: 'royal' });
      if (ally.house) {
        const { changeStanding } = await import('../game/state.js');
        changeStanding(ally.house, -12);
      }
    }

    const spot = g.state.respawn;
    this.manager.transition(() => {
      this.loadMap(spot.map, { x: spot.x, y: spot.y, dir: spot.dir ?? 'down' });
    });
  }

  async openShop(stock) {
    const { Shop } = await import('./shop.js');
    return new Promise((resolve) => {
      this.manager.push(new Shop({ stock, onClose: resolve }));
    });
  }

  async healAtHall() {
    audio.sfx('heal');
    const { healParty } = await import('../game/state.js');
    healParty();
  }

  // ----------------------------------------------------------------- draw --

  draw(ctx) {
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    // A scene can rattle the whole view, which is the cheapest way to make
    // something feel like it is happening to you rather than near you.
    const jolt = this.shake > 0 ? Math.round(Math.sin(this.shake * 60) * 2) : 0;
    const camX = Math.round(this.camera.x) + jolt;
    const camY = Math.round(this.camera.y);
    const startX = Math.max(0, Math.floor(camX / TILE));
    const startY = Math.max(0, Math.floor(camY / TILE));
    const endX = Math.min(this.map.width - 1, Math.ceil((camX + SCREEN_W) / TILE));
    const endY = Math.min(this.map.height - 1, Math.ceil((camY + SCREEN_H) / TILE));

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const char = tileAt(this.map, x, y);
        ctx.drawImage(tileCanvas(char, this.animFrame, this.neighbourMask(char, x, y), this.map.ground,
          variantFor(x, y, 4)),
          x * TILE - camX, y * TILE - camY);
      }
    }

    this.drawItems(ctx, camX, camY);
    this.drawEntities(ctx, camX, camY);
    this.drawGrassOverlay(ctx, camX, camY);
    this.drawSky(ctx);
    if (this.flash) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, this.flash.time / this.flash.max));
      ctx.fillStyle = this.flash.color;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
      ctx.restore();
    }
    this.drawAlert(ctx, camX, camY);
    this.drawLocationBanner(ctx);
    dialog.draw(ctx);
  }

  /**
   * Which of a tile's four neighbours share its visual group. Tiles outside the
   * map count as matching, so a forest that runs off the edge of the map stays
   * closed rather than growing a lit rim against the void.
   */
  neighbourMask(char, x, y) {
    const group = TILE_GROUP[char];
    if (!group) return 0;
    // Off-map counts as matching for masses that should stay closed at the
    // border (water, caves). Woodland does not: a single row of trees along the
    // map edge should read as trees, not as a sliced-off canopy.
    const outsideMatches = group !== 'forest';
    const same = (nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= this.map.width || ny >= this.map.height) return outsideMatches;
      return TILE_GROUP[tileAt(this.map, nx, ny)] === group;
    };
    return (same(x, y - 1) ? N : 0)
         | (same(x + 1, y) ? E : 0)
         | (same(x, y + 1) ? S : 0)
         | (same(x - 1, y) ? W : 0);
  }

  drawItems(ctx, camX, camY) {
    for (const item of this.map.items ?? []) {
      if (flag(item.flag)) continue;
      const x = item.x * TILE - camX;
      const y = item.y * TILE - camY;
      // A small strongbox.
      ctx.fillStyle = '#4a3a20';
      ctx.fillRect(x + 3, y + 5, 10, 8);
      ctx.fillStyle = '#8a6a34';
      ctx.fillRect(x + 4, y + 6, 8, 6);
      ctx.fillStyle = '#e0c060';
      ctx.fillRect(x + 7, y + 8, 2, 3);
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(x + 3, y + 9, 10, 1);
    }
  }

  drawEntities(ctx, camX, camY) {
    const drawables = [];

    for (const npc of this.npcs) {
      if (npc.hidden) continue;
      let x = npc.x * TILE;
      let y = npc.y * TILE;
      if (npc.moving) {
        const t = Math.min(1, npc.moving.t);
        x = (npc.moving.fromX + (npc.moving.toX - npc.moving.fromX) * t) * TILE;
        y = (npc.moving.fromY + (npc.moving.toY - npc.moving.fromY) * t) * TILE;
      }
      drawables.push({ y, draw: () => drawActor(ctx, npc.sprite, npc.dir, npc.moving ? npc.step : 0,
        x - camX, y - camY - (ACTOR_H - TILE)) });
    }

    const ally = activeCompanion();
    if (ally && this.follower) {
      const f = this.follower;
      let fx = f.x * TILE;
      let fy = f.y * TILE;
      if (f.moving) {
        const t = Math.min(1, f.moving.t);
        fx = (f.moving.fromX + (f.moving.toX - f.moving.fromX) * t) * TILE;
        fy = (f.moving.fromY + (f.moving.toY - f.moving.fromY) * t) * TILE;
      }
      drawables.push({
        y: fy,
        draw: () => drawActor(ctx, ally.sprite, f.dir, f.moving ? f.step : 0,
          fx - camX, fy - camY - (ACTOR_H - TILE)),
      });
    }

    const px = this.playerPixel();
    // Built fresh each frame so equipping armour shows up immediately; the
    // sprite sheets themselves are cached by appearance inside drawActor.
    const look = playerAppearance();
    const mount = this.mount;
    drawables.push({
      y: px.y,
      draw: () => {
        // Mounted, the beast is drawn first and you sit above it, so a rider
        // reads as one figure rather than a sprite standing on another.
        const lift = mount ? RIDER_LIFT : 0;
        if (mount) {
          const sprite = creatureSprite(creatureSpecies(mount.creature));
          const size = MOUNT_SIZE;
          const bob = this.player.moving ? Math.sin(this.player.moving.t * Math.PI * 2) : 0;
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          // Seated so the beast's feet land on the tile it occupies.
          ctx.drawImage(sprite, 0, 0, SPRITE_SIZE, SPRITE_SIZE,
            Math.round(px.x - camX + (TILE - size) / 2),
            Math.round(px.y - camY + TILE - size + 2 - px.lift + bob),
            size, size);
          ctx.restore();
        }
        drawActor(ctx, look, this.player.dir, mount ? 0 : this.player.step,
          px.x - camX, px.y - camY - (ACTOR_H - TILE) - px.lift - lift);
      },
    });

    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();
  }

  /** Redraws the top of tall grass over anyone standing in it. */
  drawGrassOverlay(ctx, camX, camY) {
    const check = (tileX, tileY, pixelX, pixelY) => {
      const char = tileAt(this.map, tileX, tileY);
      if (tileDef(char).kind !== 'encounter') return;
      const canvas = tileCanvas(char, this.animFrame, this.neighbourMask(char, tileX, tileY),
        this.map.ground, variantFor(tileX, tileY, 4));
      ctx.drawImage(canvas, 0, 8, TILE, 8, pixelX, pixelY + 8, TILE, 8);
    };
    const px = this.playerPixel();
    check(this.player.x, this.player.y, px.x - camX, px.y - camY);
    for (const npc of this.npcs) {
      if (npc.hidden) continue;
      check(npc.x, npc.y, npc.x * TILE - camX, npc.y * TILE - camY);
    }
  }

  drawAlert(ctx, camX, camY) {
    if (!this.alert) return;
    const npc = this.alert.npc;
    const x = npc.x * TILE - camX;
    const y = npc.y * TILE - camY - 18;
    drawPanel(ctx, x + 3, y, 11, 14, 'parchment');
    drawText(ctx, '!', x + 6, y + 3, { color: '#8a2028', shadow: null });
  }

  /** A short location card when the map changes: the place, then the region. */
  drawLocationBanner(ctx) {
    if (this.map.indoor) return;
    if (this.frameTimer > 3) return;
    const alpha = this.frameTimer > 2.4 ? 1 - (this.frameTimer - 2.4) / 0.6 : 1;
    // Some places share their name with the region they are in; naming it
    // twice on the same card reads as a mistake.
    const region = this.region && this.region !== this.map.name ? this.region : '';
    const width = Math.max(measure(this.map.name), measure(region)) + 22;
    const height = region ? 32 : 20;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    const t = drawPanel(ctx, 6, 6, width, height, 'night');
    drawText(ctx, this.map.name, 15, 12, { color: t.text, shadow: t.textShadow });
    if (region) {
      // A gold rule between the two lines, the way a signboard is scored.
      ctx.fillStyle = t.accent;
      ctx.fillRect(13, 22, width - 26, 1);
      drawText(ctx, region, 15, 24, { color: t.accent, shadow: t.textShadow });
    }
    ctx.restore();
  }
}
