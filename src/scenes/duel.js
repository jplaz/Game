// Duels: you, in person, against another person.
//
// This is about steel — your level, your weapon and your armour against theirs.
// Wind (stamina) is the pacing mechanism: heavy techniques cost more than you
// regain in a round, so you have to spend and recover rather than mash the
// biggest number.
//
// A beast fights beside you rather than instead of you. Calling it takes your
// action for the round, so it is a real trade: your blow, or its. It uses its
// own health, which does not come back when the duel ends, and it earns its own
// experience for the rounds it fought.

import {
  drawPanel, drawStatusBox, drawHpGauge, drawExpGauge, drawWindGauge, HP_COLORS, THEMES,
} from '../ui/panel.js';
import { drawText, fitText, measure, LINE_HEIGHT } from '../engine/font.js';
import { dialog } from '../ui/textbox.js';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { TRACKS } from '../data/music.js';
import { rng } from '../engine/rng.js';
import { drawActor, ACTOR_W, ACTOR_H } from '../art/actors.js';
import { creatureSprite, SPRITE_SIZE } from '../art/creatures.js';
import {
  createCreature, creatureSpecies, displayName, maxHp, gainExp, evolve, learnMove,
} from '../game/creature.js';
import { move as moveDef } from '../data/moves.js';
import { technique, gear } from '../data/gear.js';
import { duellist as getDuellist } from '../data/duellists.js';
import { item as getItem, ITEMS } from '../data/items.js';
import { attemptCatch } from '../game/combat.js';
import {
  playerStats, playerTechniques, maxVigour, gainPlayerExp, equipped,
  giveGear, expToNextLevel, expForPlayerLevel, playerAppearance,
} from '../game/player.js';
import {
  game, addMoney, setFlag, takeItem, itemCount, markCaught, changeStanding, standingWord,
} from '../game/state.js';
import { HOUSES } from '../data/houses.js';
import { deepenBond, bondWord } from '../game/eggs.js';

const PLAYER_POS = { x: 26, y: 44, scale: 2 };
const FOE_POS = { x: 172, y: 14, scale: 2 };
const FOE_HUD = { x: 10, y: 14, w: 106, h: 28 };
const FOE_HUD_BEAST = { x: 10, y: 12, w: 106, h: 40 };
const PLAYER_HUD = { x: 124, y: 52, w: 106, h: 52 };
const PLAYER_HUD_BEAST = { x: 124, y: 42, w: 106, h: 62 };
// A beast's health is a row inside its owner's plate rather than a plate of its
// own: four floating windows on a 240x160 screen leaves nowhere to stand.
const FOE_BEAST_POS = { x: 124, y: 6, size: 34 };
const YOUR_BEAST_POS = { x: 66, y: 62, size: 36 };

/**
 * A creature standing in a duel. It is described in the duel's own terms —
 * might against guard — so every blow in the fight runs through one formula
 * whether it comes from a sword or a set of teeth.
 */
function beastSide(creature, isPlayer) {
  const st = creature.stats;
  return {
    creature,
    isBeast: true,
    isPlayer,
    name: displayName(creature).toUpperCase(),
    level: creature.level,
    hp: creature.hp,
    maxHp: maxHp(creature),
    wind: 0,
    maxWind: 0,
    might: Math.max(1, Math.round(st.atk * 0.85)),
    guard: Math.max(1, Math.round(st.def * 1.1)),
    swiftness: st.spe,
    bleeding: 0, stunned: false, defending: false, guardBroken: false,
  };
}

/** A creature's move, described as a duel technique. */
function beastTechnique(slot) {
  const def = moveDef(slot.id);
  return {
    id: slot.id,
    name: def.name,
    power: def.power > 0 ? def.power : 0,
    accuracy: def.accuracy,
    stamina: 0,
    effect: def.power > 0 ? {} : { defend: true },
    slot,
  };
}

/** Damage: might against guard, softened so no single blow ends a duel. */
function computeDamage(attacker, defender, tech) {
  const raw = tech.power * (attacker.might / 45);
  const guard = defender.guardBroken ? defender.guard * 0.5 : defender.guard;
  const soak = guard / (guard + 55);
  const critical = rng.chance(tech.highCrit ? 0.15 : 0.06);
  let damage = raw * (1 - soak) * 0.6;
  if (critical) damage *= 1.8;
  if (defender.defending) damage *= 0.5;
  damage *= rng.int(88, 108) / 100;
  return { damage: Math.max(1, Math.round(damage)), critical };
}

export class Duel {
  /**
   * config: { duellistId, onEnd } for a named opponent, or { def } for one
   * built on the spot — the people you run into on the road.
   */
  constructor(config) {
    this.config = config;
    this.def = config.def ?? getDuellist(config.duellistId);

    const stats = playerStats();
    this.you = {
      name: game.state.player.name,
      sprite: playerAppearance(),
      level: game.state.player.level,
      hp: Math.max(1, game.state.player.hp ?? stats.vigour),
      maxHp: stats.vigour,
      wind: stats.wind,
      maxWind: stats.wind,
      might: stats.might,
      guard: stats.guard,
      swiftness: stats.swiftness,
      techniques: playerTechniques(),
      bleeding: 0, stunned: false, defending: false, guardBroken: false,
      isPlayer: true,
    };

    const d = this.def;
    this.foe = {
      name: d.name,
      sprite: d.sprite,
      level: d.level,
      hp: d.vigour,
      maxHp: d.vigour,
      wind: d.wind ?? 20,
      maxWind: d.wind ?? 20,
      might: d.might,
      guard: d.guard,
      swiftness: d.swiftness,
      techniques: d.techniques.map((id) => technique(id)),
      bleeding: 0, stunned: false, defending: false, guardBroken: false,
      isPlayer: false,
    };

    // Beasts. Yours is whichever of your creatures is still standing; theirs is
    // written into the duellist, and only some of them keep one.
    const lead = game.state.party.find((c) => c.hp > 0);
    this.yourBeast = lead ? beastSide(lead, true) : null;
    this.foeBeast = d.beast
      ? beastSide(createCreature(d.beast.species, d.beast.level), false)
      : null;
    this.beastRounds = 0;

    this.hpShown = new Map([[this.you, this.you.hp], [this.foe, this.foe.hp]]);
    if (this.yourBeast) this.hpShown.set(this.yourBeast, this.yourBeast.hp);
    if (this.foeBeast) this.hpShown.set(this.foeBeast, this.foeBeast.hp);
    this.menu = null;
    this.timer = 0;
    this.waitResolve = null;
    this.outcome = 'ongoing';
    this.anim = { shake: 0, target: null, flash: 0, lungeFor: null, lunge: 0 };
    this.intro = 1;
    this.round = 0;
  }

  enter() {
    audio.play(this.def.boss ? 'battleBoss' : 'battleTrainer', TRACKS);
    this.run();
  }

  // ------------------------------------------------------------ utilities --

  wait(seconds) {
    return new Promise((resolve) => { this.timer = seconds; this.waitResolve = resolve; });
  }

  say(text, opts) { return dialog.say(text, opts); }

  openMenu(type, options, { columns = 1, cancellable = true } = {}) {
    return new Promise((resolve) => {
      this.menu = { type, options, columns, cancellable, index: 0, resolve };
    });
  }

  // ----------------------------------------------------------------- flow --

  async run() {
    await this.wait(0.8);
    await this.say(`${this.def.name} draws steel!`, { theme: this.def.boss ? 'royal' : 'parchment' });
    await this.say(this.def.intro, { theme: this.def.boss ? 'royal' : 'parchment' });

    while (this.outcome === 'ongoing') {
      this.round++;
      const action = await this.chooseAction();
      if (this.outcome !== 'ongoing') break;
      await this.resolveRound(action);
    }
    await this.finish();
  }

  async chooseAction() {
    while (true) {
      dialog.show(`${this.you.name} — what will you do?`);
      const choice = await this.openMenu('action', ['STRIKE', 'BEAST', 'PACK', 'YIELD'],
        { columns: 2, cancellable: false });

      if (choice === 0) {
        const tech = await this.chooseTechnique();
        if (tech) return { type: 'tech', tech };
      } else if (choice === 1) {
        const tech = await this.chooseBeastMove();
        if (tech) return { type: 'beast', tech };
      } else if (choice === 2) {
        const itemId = await this.chooseItem();
        if (itemId) return { type: 'item', itemId };
      } else if (choice === 3) {
        if (await this.tryYield()) return { type: 'yield' };
      }
    }
  }

  async chooseTechnique() {
    const labels = this.you.techniques.map((t) => t.name);
    const index = await this.openMenu('tech', labels, { columns: 2 });
    if (index < 0) return null;
    const tech = this.you.techniques[index];
    if (tech.stamina > this.you.wind) {
      await this.say(`You have not the wind left for ${tech.name}.`);
      return this.chooseTechnique();
    }
    return tech;
  }

  /** Set your beast on them. Taking this costs you your own blow for the round. */
  async chooseBeastMove() {
    if (!this.yourBeast) {
      await this.say('You have no beast at your side.');
      return null;
    }
    if (this.yourBeast.hp <= 0) {
      await this.say(`${this.yourBeast.name} is down and cannot answer you.`);
      return null;
    }
    const slots = this.yourBeast.creature.moves;
    const labels = slots.map((slot) => `${moveDef(slot.id).name} ${slot.pp}/${slot.maxPp}`);
    const index = await this.openMenu('beast', labels, { columns: 2 });
    if (index < 0) return null;
    if (slots[index].pp <= 0) {
      await this.say(`${this.yourBeast.name} has nothing left in that one.`);
      return this.chooseBeastMove();
    }
    return beastTechnique(slots[index]);
  }

  async chooseItem() {
    // Banners are only worth carrying into a duel when there is a beast on the
    // other side to win over.
    const canClaim = this.foeBeast && this.foeBeast.hp > 0;
    const usable = Object.keys(game.state.bag)
      .filter((id) => ITEMS[id] && !ITEMS[id].key && itemCount(id) > 0
        && (ITEMS[id].use?.kind !== 'catch' || canClaim));
    if (!usable.length) {
      await this.say('Nothing in your pack will help here.');
      return null;
    }
    const labels = usable.map((id) => `${getItem(id).name} x${itemCount(id)}`);
    const index = await this.openMenu('list', labels, { columns: 1 });
    return index < 0 ? null : usable[index];
  }

  async tryYield() {
    if (!this.def.canYield) {
      await this.say(`${this.def.name} will not let you walk away from this.`);
      return false;
    }
    if (rng.chance(0.6)) {
      await this.say('You give ground and break off the fight.');
      this.outcome = 'fled';
      return true;
    }
    await this.say('They press you too hard to disengage!');
    await this.foeAct();
    return false;
  }

  async resolveRound(action) {
    this.you.defending = false;
    this.foe.defending = false;

    if (action.type === 'item') {
      await this.useItem(action.itemId);
      if (this.outcome === 'ongoing') await this.foeAct();
    } else if (action.type === 'beast') {
      // Your beast acts in your place, so it strikes on your initiative.
      const beast = this.yourBeast;
      const youFirst = beast.swiftness >= this.foe.swiftness;
      if (youFirst) {
        await this.beastStrike(beast, action.tech);
        if (this.checkDown()) return;
        await this.foeAct();
      } else {
        await this.foeAct();
        if (this.checkDown()) return;
        if (beast.hp > 0) await this.beastStrike(beast, action.tech);
      }
    } else {
      const foeTech = this.pickFoeTechnique();
      const youFirst = (action.tech.priority ?? 0) !== (foeTech?.priority ?? 0)
        ? (action.tech.priority ?? 0) > (foeTech?.priority ?? 0)
        : this.you.swiftness >= this.foe.swiftness;

      if (youFirst) {
        await this.perform(this.you, this.foe, action.tech);
        if (this.checkDown()) return;
        await this.foeAct(foeTech);
      } else {
        await this.foeAct(foeTech);
        if (this.checkDown()) return;
        await this.perform(this.you, this.foe, action.tech);
      }
    }
    if (this.checkDown()) return;
    await this.endOfRound();
  }

  /** Whichever of the enemy pair the beast should go for. */
  beastTarget(beast) {
    const theirBeast = beast.isPlayer ? this.foeBeast : this.yourBeast;
    if (theirBeast && theirBeast.hp > 0) return theirBeast;
    return beast.isPlayer ? this.foe : this.you;
  }

  async beastStrike(beast, tech) {
    if (beast.hp <= 0) return;
    this.beastRounds++;
    if (tech.slot && tech.slot.pp > 0) tech.slot.pp--;
    const target = this.beastTarget(beast);
    await this.perform(beast, target, tech);
  }

  /** The foe sets their own beast on you, when they have one still standing. */
  async foeBeastAct() {
    const beast = this.foeBeast;
    if (!beast || beast.hp <= 0 || this.outcome !== 'ongoing') return;
    const slots = beast.creature.moves.filter((slot) => slot.pp > 0);
    const slot = slots.length ? rng.pick(slots) : null;
    if (!slot) return;
    slot.pp--;
    await this.perform(beast, this.beastTarget(beast), beastTechnique(slot));
  }

  pickFoeTechnique() {
    const affordable = this.foe.techniques.filter((t) => t.stamina <= this.foe.wind);
    if (!affordable.length) return technique('guard');
    // Catch a breath when winded, otherwise favour the heavier blow.
    if (this.foe.wind < this.foe.maxWind * 0.3 && rng.chance(0.6)) return technique('guard');
    const scored = affordable.map((t) => ({ t, weight: Math.max(1, t.power) + (t.effect ? 15 : 0) }));
    return rng.weighted(scored).t;
  }

  async foeAct(preChosen) {
    if (this.foe.hp <= 0 || this.outcome !== 'ongoing') return;
    // With a beast at their side they will sometimes send it in instead, which
    // is the same trade you are making when you call yours.
    if (!preChosen && this.foeBeast?.hp > 0 && rng.chance(0.4)) {
      await this.foeBeastAct();
      return;
    }
    await this.perform(this.foe, this.you, preChosen ?? this.pickFoeTechnique());
  }

  async perform(actor, target, tech) {
    if (actor.stunned) {
      actor.stunned = false;
      await this.say(`${actor.name} is still reeling and cannot answer!`);
      return;
    }
    actor.wind = Math.max(0, actor.wind - tech.stamina);
    await this.say(`${actor.name} uses ${tech.name}!`);

    if (tech.effect?.defend) {
      actor.defending = true;
      actor.wind = Math.min(actor.maxWind, actor.wind + 6);
      await this.say(`${actor.name} sets their guard and catches a breath.`);
      return;
    }

    if (rng.int(1, 100) > tech.accuracy) {
      await this.say('The blow goes wide!');
      return;
    }

    const hits = tech.effect?.hits ? rng.int(tech.effect.hits[0], tech.effect.hits[1]) : 1;
    let total = 0;
    let anyCrit = false;
    for (let i = 0; i < hits; i++) {
      if (target.hp <= 0) break;
      const { damage, critical } = computeDamage(actor, target, tech);
      anyCrit = anyCrit || critical;
      target.hp = Math.max(0, target.hp - damage);
      total += damage;
      audio.sfx(critical ? 'strong' : 'hit');
      this.anim.lungeFor = actor;
      this.anim.lunge = 0.25;
      await this.animateHit(target);
    }
    if (anyCrit) await this.say('It bites deep!');
    if (hits > 1) await this.say(`Struck ${hits} times!`);

    const effect = tech.effect ?? {};
    const fires = tech.chance === undefined || rng.chance(tech.chance);
    if (fires && effect.bleed && target.hp > 0 && !target.bleeding) {
      target.bleeding = 3;
      await this.say(`${target.name} is bleeding!`);
    }
    if (fires && effect.stun && target.hp > 0 && !target.stunned) {
      target.stunned = true;
      await this.say(`${target.name} staggers!`);
    }
    if (fires && effect.guardBreak && target.hp > 0 && !target.guardBroken) {
      target.guardBroken = true;
      await this.say(`${target.name}'s guard is broken open!`);
    }
    if (effect.drain && total > 0) {
      actor.hp = Math.min(actor.maxHp, actor.hp + Math.floor(total * effect.drain));
      await this.animateHp(actor);
    }
  }

  async endOfRound() {
    for (const side of [this.you, this.foe, this.yourBeast, this.foeBeast]) {
      if (!side) continue;
      if (side.hp <= 0) continue;
      if (side.bleeding > 0) {
        side.bleeding--;
        const damage = Math.max(1, Math.round(side.maxHp * 0.06));
        side.hp = Math.max(0, side.hp - damage);
        await this.animateHit(side);
        await this.say(`${side.name} loses blood.`);
      }
      // Everyone gets some wind back each round.
      side.wind = Math.min(side.maxWind, side.wind + 4 + Math.floor(side.level / 4));
    }
    await this.reportDownedBeasts();
    this.syncBeasts();
    this.checkDown();
  }

  /** A beast that has been put down says so once, then stays out of it. */
  async reportDownedBeasts() {
    for (const beast of [this.yourBeast, this.foeBeast]) {
      if (!beast || beast.hp > 0 || beast.reported) continue;
      beast.reported = true;
      await this.say(`${beast.name} is driven off and cannot fight on.`);
    }
  }

  /** Beast wounds are real: they are written back onto the creature itself. */
  syncBeasts() {
    if (this.yourBeast) this.yourBeast.creature.hp = Math.max(0, Math.round(this.yourBeast.hp));
  }

  checkDown() {
    if (this.foe.hp <= 0) { this.outcome = 'won'; return true; }
    if (this.you.hp <= 0) { this.outcome = 'lost'; return true; }
    return false;
  }

  async useItem(itemId) {
    const def = getItem(itemId);
    const use = def.use;
    if (use.kind === 'heal' || use.kind === 'fullHeal') {
      const amount = use.kind === 'fullHeal' ? this.you.maxHp : use.amount;
      const before = this.you.hp;
      this.you.hp = Math.min(this.you.maxHp, this.you.hp + amount);
      takeItem(itemId);
      audio.sfx('heal');
      await this.animateHp(this.you);
      await this.say(`You bind your wounds and recover ${this.you.hp - before}.`);
    } else if (use.kind === 'catch') {
      await this.claimBeast(itemId);
    } else if (use.kind === 'cure' || use.kind === 'revive') {
      takeItem(itemId);
      this.you.bleeding = 0;
      audio.sfx('heal');
      await this.say('You staunch the bleeding.');
    } else {
      await this.say('That is no use in a fight.');
    }
  }

  /**
   * Throwing your banner at the beast on the other side. A hurt animal comes
   * over more easily than a fresh one, so this is worth doing late rather than
   * opening with it.
   */
  async claimBeast(itemId) {
    const beast = this.foeBeast;
    const def = getItem(itemId);
    takeItem(itemId);
    await this.say(`You raise the ${def.name} at ${beast.name}!`);

    // The beast side carries the real creature, which is what the roll reads.
    const result = attemptCatch(beast, def.bonus ?? 1);
    audio.sfx('ball');
    await this.wait(0.7);

    if (!result.caught) {
      await this.say(`${beast.name} will not leave its master's side.`);
      return;
    }
    if (game.state.party.length >= 6) {
      await this.say(`${beast.name} comes to you — but you have no room for it.`);
      return;
    }

    const creature = beast.creature;
    creature.hp = Math.max(1, Math.round(beast.hp));
    creature.originalTrainer = game.state.player.name;
    game.state.party.push(creature);
    markCaught(creature.speciesId);
    beast.hp = 0;
    beast.reported = true;
    audio.sfx('caught');
    await this.say(`${beast.name} swears itself to you!`);
    await this.say(`${this.def.name}: My own beast. Turned. You will pay for that.`);
  }

  // -------------------------------------------------------------- endgame --

  async finish() {
    game.state.player.hp = Math.max(0, this.you.hp);
    this.syncBeasts();

    if (this.outcome === 'won') {
      game.state.player.duelsWon++;
      audio.play('victory', TRACKS);
      await this.say(this.def.defeat, { theme: this.def.boss ? 'royal' : 'parchment' });

      const exp = this.def.exp ?? Math.round(this.def.level * 18);
      const result = gainPlayerExp(exp);
      await this.say(`You gained ${exp} experience.`);
      if (result.levels > 0) {
        audio.sfx('levelup');
        await this.say(`You are now level ${game.state.player.level}! You feel steadier on your feet.`);
      }
      if (this.def.reward) {
        addMoney(this.def.reward);
        audio.sfx('money');
        await this.say(`You take ${this.def.reward} gold dragons from the field.`);
      }
      // A beast that actually fought is trained by the fighting, and trusts
      // you a little more for having stood beside you in it.
      if (this.yourBeast && this.beastRounds > 0) {
        const creature = this.yourBeast.creature;
        const bondBefore = bondWord(creature);
        deepenBond(creature, Math.min(4, 1 + Math.floor(this.beastRounds / 3)));
        if (bondWord(creature) !== bondBefore) {
          await this.say(`${this.yourBeast.name} looks at you differently. ${bondWord(creature)}.`);
        }
        const share = Math.max(1, Math.round(exp * 0.6));
        const before = creature.level;
        const result = gainExp(creature, share);
        await this.say(`${this.yourBeast.name} gained ${share} experience.`);
        if (creature.level > before) {
          audio.sfx('levelup');
          await this.say(`${this.yourBeast.name} grew to level ${creature.level}!`);
        }
        for (const moveId of result.learned) await this.teachMove(creature, moveId);
        if (result.evolveTo) await this.doEvolve(creature, result.evolveTo);
      }
      if (this.def.loot) {
        const [slot, id] = this.def.loot;
        giveGear(slot, id);
        audio.sfx('confirm');
        await this.say(`You claim their ${gear(slot, id).name}!`);
      }
      if (!this.def.roamer) setFlag(`duel_${this.def.id}`);
    } else if (this.outcome === 'lost') {
      game.state.player.duelsLost++;
      game.state.player.wounded = true;
      game.state.player.hp = 0;
      await this.say(`${this.def.name} stands over you. The world goes grey at the edges.`);
    }

    this.manager.transition(() => {
      this.manager.pop();
      this.config.onEnd?.(this.outcome);
    });
  }

  async teachMove(creature, moveId) {
    const def = moveDef(moveId);
    if (creature.moves.length < 4) {
      learnMove(creature, moveId);
      audio.sfx('confirm');
      await this.say(`${displayName(creature)} learned ${def.name}!`);
      return;
    }
    const keep = await dialog.choose(
      `${displayName(creature)} wants to learn ${def.name}, but already knows four. Replace one?`,
      ['Yes', 'No'],
    );
    if (keep !== 0) {
      await this.say(`${displayName(creature)} did not learn ${def.name}.`);
      return;
    }
    const labels = creature.moves.map((slot) => moveDef(slot.id).name);
    const index = await this.openMenu('list', labels, { columns: 1, cancellable: true });
    if (index < 0) {
      await this.say(`${displayName(creature)} did not learn ${def.name}.`);
      return;
    }
    const replaced = moveDef(creature.moves[index].id).name;
    learnMove(creature, moveId, index);
    audio.sfx('confirm');
    await this.say(`${displayName(creature)} forgot ${replaced} and learned ${def.name}!`);
  }

  async doEvolve(creature, intoId) {
    const oldName = displayName(creature);
    await this.say(`What? ${oldName} is changing!`);
    audio.sfx('levelup');
    this.anim.flash = 1.2;
    await this.wait(1.2);
    evolve(creature, intoId);
    markCaught(intoId);
    await this.say(`${oldName} became ${creatureSpecies(creature).name}!`);
  }

  // ------------------------------------------------------------ animation --

  animateHp(side) {
    return new Promise((resolve) => {
      this.hpTween = { side, resolve, speed: Math.max(24, side.maxHp * 1.6) };
    });
  }

  async animateHit(side) {
    this.anim.shake = 0.3;
    this.anim.target = side;
    await this.animateHp(side);
  }

  update(dt) {
    if (this.intro > 0) this.intro = Math.max(0, this.intro - dt * 1.6);
    if (this.anim.shake > 0) this.anim.shake = Math.max(0, this.anim.shake - dt);
    if (this.anim.lunge > 0) this.anim.lunge = Math.max(0, this.anim.lunge - dt);

    if (this.hpTween) {
      const { side, speed, resolve } = this.hpTween;
      const shown = this.hpShown.get(side) ?? side.hp;
      const step = speed * dt;
      let next = shown;
      if (shown < side.hp) next = Math.min(side.hp, shown + step);
      else if (shown > side.hp) next = Math.max(side.hp, shown - step);
      this.hpShown.set(side, next);
      if (Math.abs(next - side.hp) < 0.5) {
        this.hpShown.set(side, side.hp);
        this.hpTween = null;
        resolve();
      }
      return;
    }

    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const resolve = this.waitResolve;
        this.waitResolve = null;
        resolve?.();
      }
      return;
    }

    dialog.update(dt);
    if (dialog.busy) return;
    if (this.menu) this.updateMenu();
  }

  updateMenu() {
    const menu = this.menu;
    const count = menu.options.length;
    const cols = menu.columns;
    const move = (delta) => {
      menu.index = (menu.index + delta + count) % count;
      audio.sfx('cursor');
    };

    if (cols === 1) {
      if (input.repeat('up')) move(-1);
      if (input.repeat('down')) move(1);
    } else {
      if (input.repeat('left') && menu.index % cols > 0) move(-1);
      if (input.repeat('right') && menu.index % cols < cols - 1 && menu.index + 1 < count) move(1);
      if (input.repeat('up') && menu.index - cols >= 0) move(-cols);
      if (input.repeat('down') && menu.index + cols < count) move(cols);
    }

    if (input.pressed('a')) {
      audio.sfx('confirm');
      const { resolve, index } = menu;
      this.menu = null;
      resolve(index);
    } else if (input.pressed('b') && menu.cancellable) {
      audio.sfx('cancel');
      const { resolve } = menu;
      this.menu = null;
      resolve(-1);
    }
  }

  // ---------------------------------------------------------------- draw --

  draw(ctx) {
    this.drawBackdrop(ctx);
    this.drawBeast(ctx, this.foeBeast, FOE_BEAST_POS);
    this.drawFighter(ctx, this.foe, FOE_POS, 'left');
    this.drawBeast(ctx, this.yourBeast, YOUR_BEAST_POS);
    this.drawFighter(ctx, this.you, PLAYER_POS, 'right');
    this.drawHud(ctx, this.foe, this.foeBeast ? FOE_HUD_BEAST : FOE_HUD, false);
    this.drawHud(ctx, this.you, this.yourBeast ? PLAYER_HUD_BEAST : PLAYER_HUD, true);
    dialog.draw(ctx);
    if (this.menu) this.drawMenu(ctx);
  }

  drawBackdrop(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, 160);
    sky.addColorStop(0, this.def.boss ? '#2a1a2c' : '#4a4258');
    sky.addColorStop(0.55, this.def.boss ? '#54313a' : '#8a7f88');
    sky.addColorStop(1, '#6a5c4c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 240, 160);

    // A packed-earth yard with a scuffed circle in the middle.
    ctx.fillStyle = '#7a6446';
    ctx.fillRect(0, 96, 240, 64);
    ctx.fillStyle = '#8a7350';
    ctx.beginPath();
    ctx.ellipse(120, 126, 108, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6a563c';
    for (let i = 0; i < 26; i++) {
      const x = (i * 79) % 236;
      const y = 100 + ((i * 37) % 52);
      ctx.fillRect(x, y, 3, 1);
    }
  }

  drawFighter(ctx, side, pos, facing) {
    const scale = pos.scale;
    let x = pos.x;
    if (this.intro > 0) x += (side.isPlayer ? -1 : 1) * this.intro * 50;
    if (this.anim.shake > 0 && this.anim.target === side) {
      x += Math.round(Math.sin(this.anim.shake * 60) * 3);
    }
    if (this.anim.lunge > 0 && this.anim.lungeFor === side) {
      x += (side.isPlayer ? 1 : -1) * Math.round(this.anim.lunge * 24);
    }

    const w = ACTOR_W * scale;
    const h = ACTOR_H * scale;
    const drawY = pos.y;

    ctx.save();
    ctx.globalAlpha = side.hp <= 0 ? 0.35 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, drawY + h - 2, w * 0.4, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // The sheet is drawn to an offscreen canvas first so it can be scaled up
    // without smoothing.
    const step = this.anim.lunge > 0 && this.anim.lungeFor === side ? 1 : 0;
    const surface = document.createElement('canvas');
    surface.width = ACTOR_W;
    surface.height = ACTOR_H;
    const sctx = surface.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    // Weapons are drawn raised in a duel rather than sheathed.
    drawActor(sctx, side.sprite, facing, step, 0, 0, { combat: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(surface, 0, 0, ACTOR_W, ACTOR_H, Math.round(x), Math.round(drawY), w, h);
    ctx.restore();
  }

  /**
   * One line inside a fighter's plate for the beast standing with them: who it
   * is, and how much fight it has left.
   */
  drawBeastRow(ctx, beast, box, y, t, reserve = 0) {
    if (!beast) return;
    const down = beast.hp <= 0;
    const NAME_W = 56;
    drawText(ctx, fitText(beast.name, NAME_W), box.x + 8, y,
      { color: down ? '#8d9080' : t.text, shadow: t.textShadow });

    const barX = box.x + 8 + NAME_W + 3;
    const barW = Math.max(8, box.w - (NAME_W + 11) - 16 - reserve);
    ctx.fillStyle = '#2b3f2c';
    ctx.fillRect(barX - 1, y + 1, barW + 2, 6);
    ctx.fillStyle = '#6d7a63';
    ctx.fillRect(barX, y + 2, barW, 4);

    const shown = this.hpShown.get(beast) ?? beast.hp;
    const ratio = Math.max(0, shown / beast.maxHp);
    const filled = Math.max(0, Math.min(barW, Math.round(barW * ratio)));
    if (filled > 0) {
      const c = HP_COLORS(ratio);
      ctx.fillStyle = c.dark;
      ctx.fillRect(barX, y + 2, filled, 4);
      ctx.fillStyle = c.light;
      ctx.fillRect(barX, y + 2, filled, 2);
    }
  }

  /** The beast itself, standing at its owner's shoulder. */
  drawBeast(ctx, beast, pos) {
    if (!beast || beast.hp <= 0) return;
    const sprite = creatureSprite(creatureSpecies(beast.creature));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(pos.x + pos.size / 2, pos.y + pos.size - 3, pos.size * 0.32, pos.size * 0.09,
      0, 0, Math.PI * 2);
    ctx.fill();
    // The player's beast faces the foe; the foe's faces back.
    if (beast.isPlayer) {
      ctx.drawImage(sprite, 0, 0, SPRITE_SIZE, SPRITE_SIZE, pos.x, pos.y, pos.size, pos.size);
    } else {
      ctx.translate(pos.x + pos.size, pos.y);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 0, 0, pos.size, pos.size);
    }
    ctx.restore();
  }

  drawHud(ctx, side, box, isPlayer) {
    const beast = isPlayer ? this.yourBeast : this.foeBeast;
    const t = drawStatusBox(ctx, box.x, box.y, box.w, box.h, { notchLeft: isPlayer });
    const lvl = `Lv${side.level}`;
    const lvlW = measure(lvl);
    const name = fitText(side.name.toUpperCase(), box.w - lvlW - 22);
    drawText(ctx, name, box.x + 8, box.y + 3, { color: t.text, shadow: t.textShadow });
    drawText(ctx, lvl, box.x + box.w - lvlW - 9, box.y + 3,
      { color: t.text, shadow: t.textShadow });

    const shown = this.hpShown.get(side) ?? side.hp;
    drawHpGauge(ctx, box.x + 7, box.y + 15, box.w - 15, Math.max(0, shown / side.maxHp));

    // Condition flags sit under the gauge, sharing the row with the beast when
    // there is one, which is why the beast bar reserves room for them.
    const marks = [];
    if (side.bleeding > 0) marks.push(['BLEED', '#c83c3c']);
    if (side.stunned) marks.push(['STUN', '#e8c040']);
    if (side.guardBroken) marks.push(['BROKEN', '#9060c0']);
    const shownMarks = marks.slice(0, beast ? 1 : 2);
    let markWidth = 0;
    shownMarks.forEach(([label, color], i) => {
      const w = measure(label) + 4;
      const mx = beast
        ? box.x + box.w - 9 - w
        : box.x + 7 + i * (w + 3);
      const my = box.y + 24;
      ctx.fillStyle = '#2b3f2c';
      ctx.fillRect(mx - 1, my - 1, w + 2, 9);
      ctx.fillStyle = color;
      ctx.fillRect(mx, my, w, 7);
      drawText(ctx, label, mx + 2, my, { color: '#241a1a', shadow: null });
      markWidth = w + 4;
    });

    if (!isPlayer) {
      if (beast) this.drawBeastRow(ctx, beast, box, box.y + 25, t, markWidth);
      return;
    }

    const hpLabel = `${Math.round(shown)}/${side.maxHp}`;
    drawText(ctx, hpLabel, box.x + box.w - measure(hpLabel) - 9, box.y + 24,
      { color: t.text, shadow: t.textShadow });

    // Wind, then the experience bar, both inside the plate.
    drawWindGauge(ctx, box.x + 7, box.y + 34, box.w - 15,
      Math.max(0, Math.min(1, side.wind / side.maxWind)));

    const p = game.state.player;
    const cur = expForPlayerLevel(p.level);
    const next = expForPlayerLevel(p.level + 1);
    const ratio = next > cur ? (p.exp - cur) / (next - cur) : 0;
    drawExpGauge(ctx, box.x + 7, box.y + 43, box.w - 15, Math.max(0, Math.min(1, ratio)));

    if (beast) this.drawBeastRow(ctx, beast, box, box.y + 52, t);
  }

  drawMenu(ctx) {
    const menu = this.menu;
    if (menu.type === 'action') {
      const box = { x: 136, y: 106, w: 100, h: 50 };
      const t = drawPanel(ctx, box.x, box.y, box.w, box.h, 'command');
      menu.options.forEach((label, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = box.x + 15 + col * 44;
        const y = box.y + 9 + row * 17;
        if (i === menu.index) drawText(ctx, '▸', x - 9, y, { color: t.accent, shadow: null });
        drawText(ctx, label, x, y, { color: t.text, shadow: t.textShadow });
      });
      return;
    }

    if (menu.type === 'tech') {
      const box = { x: 4, y: 104, w: 232, h: 52 };
      const t = drawPanel(ctx, box.x, box.y, box.w, box.h, 'night');
      this.you.techniques.forEach((tech, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = box.x + 14 + col * 96;
        const y = box.y + 6 + row * 14;
        if (i === menu.index) drawText(ctx, '▸', x - 9, y, { color: t.text, shadow: t.textShadow });
        const affordable = tech.stamina <= this.you.wind;
        drawText(ctx, tech.name, x, y,
          { color: affordable ? t.text : '#8a8fa4', shadow: t.textShadow });
      });
      const sel = this.you.techniques[menu.index];
      if (sel) {
        const infoY = box.y + 36;
        drawText(ctx, `WIND ${sel.stamina}`, box.x + 10, infoY, { color: t.text, shadow: t.textShadow });
        drawText(ctx, sel.power > 0 ? `POW ${sel.power}` : 'DEFENSIVE', box.x + 66, infoY,
          { color: t.text, shadow: t.textShadow });
        drawText(ctx, `ACC ${sel.accuracy}`, box.x + 140, infoY, { color: t.text, shadow: t.textShadow });
      }
      return;
    }

    if (menu.type === 'beast') {
      const box = { x: 4, y: 104, w: 232, h: 52 };
      const t = drawPanel(ctx, box.x, box.y, box.w, box.h, 'night');
      const slots = this.yourBeast.creature.moves;
      slots.forEach((slot, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = box.x + 14 + col * 96;
        const y = box.y + 6 + row * 14;
        if (i === menu.index) drawText(ctx, '▸', x - 9, y, { color: t.text, shadow: t.textShadow });
        drawText(ctx, moveDef(slot.id).name, x, y,
          { color: slot.pp > 0 ? t.text : '#8a8fa4', shadow: t.textShadow });
      });
      const slot = slots[menu.index];
      if (slot) {
        const def = moveDef(slot.id);
        const infoY = box.y + 36;
        drawText(ctx, `PP ${slot.pp}/${slot.maxPp}`, box.x + 10, infoY,
          { color: t.text, shadow: t.textShadow });
        drawText(ctx, def.power > 0 ? `POW ${def.power}` : 'STATUS', box.x + 78, infoY,
          { color: t.text, shadow: t.textShadow });
        drawText(ctx, `ACC ${def.accuracy}`, box.x + 150, infoY,
          { color: t.text, shadow: t.textShadow });
      }
      return;
    }

    const width = Math.max(120, Math.max(...menu.options.map((o) => measure(o))) + 26);
    const height = menu.options.length * LINE_HEIGHT + 10;
    const x = 236 - width;
    const y = Math.max(4, 106 - height);
    const t = drawPanel(ctx, x, y, width, height, 'night');
    menu.options.forEach((label, i) => {
      const rowY = y + 5 + i * LINE_HEIGHT;
      if (i === menu.index) drawText(ctx, '▸', x + 5, rowY, { color: t.text, shadow: t.textShadow });
      drawText(ctx, label, x + 14, rowY, { color: t.text, shadow: t.textShadow });
    });
  }
}
