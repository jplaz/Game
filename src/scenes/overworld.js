// The overworld: grid movement, collision, warps, NPCs, trainers, encounters.

import { TILE, tileCanvas, tileDef, TILE_GROUP, N, E, S, W } from '../art/tiles.js';
import { drawActor, ACTOR_H } from '../art/actors.js';
import { playerAppearance } from '../game/player.js';
import { getMap, regionOf, tileAt } from '../data/maps.js';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { TRACKS } from '../data/music.js';
import { rng } from '../engine/rng.js';
import { makeRoamer, ROAMERS } from '../data/duellists.js';
import { creatureSpecies, displayName } from '../game/creature.js';
import { creatureSprite, SPRITE_SIZE } from '../art/creatures.js';
import { dialog } from '../ui/textbox.js';
import { drawPanel } from '../ui/panel.js';
import { drawText, measure } from '../engine/font.js';
import { game, flag, setFlag } from '../game/state.js';
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
    // You leave the beast outside; it does not follow you through a doorway.
    if (this.map.indoor) this.mount = null;
    // Nor does a mount that has been taken out of your party or knocked down.
    if (this.mount && !game.state.party.includes(this.mount.creature)) this.mount = null;
    if (this.mount && this.mount.creature.hp <= 0) this.mount = null;
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
      hidden: def.hideIfFlag ? flag(def.hideIfFlag) : false,
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
    return Boolean(this.script) || dialog.busy || Boolean(this.approach) || this.manager.busy;
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

  // ----------------------------------------------------------------- riding --

  /** The lead creature that is grown enough to carry you, if any. */
  rideable() {
    for (const creature of game.state.party) {
      if (creature.hp <= 0) continue;
      const kind = creatureSpecies(creature).mount;
      if (kind) return { creature, kind };
    }
    return null;
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

    this.player.x = move.toX;
    this.player.y = move.toY;
    this.player.moving = null;
    this.player.step = (this.player.step + 1) % 4;
    game.state.position = { map: this.map.id, x: this.player.x, y: this.player.y, dir: this.player.dir };
    game.state.player.steps++;

    this.onArrive();
  }

  onArrive() {
    const warp = this.warpAt(this.player.x, this.player.y);
    if (warp) {
      this.doWarp(warp);
      return;
    }
    if (this.checkTrainers()) return;
    this.checkEncounter();
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
    const chance = ENCOUNTER_CHANCE * (this.mount ? MOUNTED_ENCOUNTER_SCALE : 1);
    if (!rng.chance(chance)) return;

    const entry = rng.weighted(this.map.encounters);
    const level = rng.int(entry.min, entry.max);
    const foe = makeRoamer(entry.roamer, level, (list) => rng.pick(list));

    // Some of them travel with an animal, which is the only time you meet a
    // beast on the road rather than in someone's keeping.
    const companion = ROAMERS[entry.roamer].beast;
    if (companion && rng.chance(companion.chance)) {
      foe.beast = { species: companion.species, level: Math.max(2, level - 1) };
    }

    audio.sfx('encounter');
    this.startAmbush(foe);
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
        npc.moving = null;
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

  async openSmithy(stock) {
    const { Smithy } = await import('./smithy.js');
    return new Promise((resolve) => {
      this.manager.push(new Smithy({ stock, onClose: resolve }));
    });
  }

  /** Defeat: you wake up back at the last Maester's Hall, whole but poorer. */
  async whiteout(personal = false) {
    const { healParty, game: g, addMoney } = await import('../game/state.js');
    const lost = Math.floor(g.state.player.money * 0.2);
    addMoney(-lost);
    healParty();
    const wound = personal
      ? 'You wake on a cot in a Maester\'s Hall, stitched and aching'
      : "You woke in a Maester's Hall with your creatures tended";
    await dialog.say(lost > 0 ? `${wound}... and ${lost} fewer gold dragons.` : `${wound}.`);
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

    const camX = Math.round(this.camera.x);
    const camY = Math.round(this.camera.y);
    const startX = Math.max(0, Math.floor(camX / TILE));
    const startY = Math.max(0, Math.floor(camY / TILE));
    const endX = Math.min(this.map.width - 1, Math.ceil((camX + SCREEN_W) / TILE));
    const endY = Math.min(this.map.height - 1, Math.ceil((camY + SCREEN_H) / TILE));

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const char = tileAt(this.map, x, y);
        ctx.drawImage(tileCanvas(char, this.animFrame, this.neighbourMask(char, x, y), this.map.ground),
          x * TILE - camX, y * TILE - camY);
      }
    }

    this.drawItems(ctx, camX, camY);
    this.drawEntities(ctx, camX, camY);
    this.drawGrassOverlay(ctx, camX, camY);
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
      const canvas = tileCanvas(char, this.animFrame, this.neighbourMask(char, tileX, tileY), this.map.ground);
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
