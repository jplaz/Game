// The battle scene. The whole turn structure is written as one async function
// so the flow reads top to bottom; `update` only services timers, animations
// and whichever menu is currently open.

import { drawPanel, drawStatusBox, drawHpGauge, drawExpGauge, THEMES } from '../ui/panel.js';
import { drawText, fitText, measure, LINE_HEIGHT } from '../engine/font.js';
import { dialog } from '../ui/textbox.js';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { TRACKS } from '../data/music.js';
import { rng } from '../engine/rng.js';
import { creatureSprite, SPRITE_SIZE } from '../art/creatures.js';
import { typeColor, typeName } from '../data/types.js';
import { move as getMove } from '../data/moves.js';
import { item as getItem, ITEMS } from '../data/items.js';
import { trainer as getTrainer } from '../data/trainers.js';
import {
  createCreature, creatureSpecies, displayName, maxHp, isFainted,
  gainExp, evolve, learnMove, expForLevel, healBy,
} from '../game/creature.js';
import {
  makeCombatant, calcDamage, accuracyCheck, effectivenessText, applyStatus,
  statusBeforeMove, statusAfterTurn, moveOrder, expFor, attemptCatch,
  chooseFoeMove, changeStage, STATUSES,
} from '../game/combat.js';
import {
  game, party, addCreature, takeItem, itemCount, addMoney, setFlag,
  markSeen, markCaught, awardSigil,
} from '../game/state.js';

const FOE_SPRITE = { x: 154, y: 12, size: 56 };
const PLAYER_SPRITE = { x: 22, y: 44, size: 64 };
const FOE_HUD = { x: 10, y: 16, w: 106, h: 28 };
const PLAYER_HUD = { x: 124, y: 60, w: 106, h: 44 };

export class Battle {
  /**
   * config: { kind: 'wild'|'trainer', foe?, trainerId?, onEnd?, boss? }
   */
  constructor(config) {
    this.config = config;
    this.isTrainer = config.kind === 'trainer';
    this.trainer = this.isTrainer ? getTrainer(config.trainerId) : null;

    this.playerParty = party();
    this.foeParty = this.isTrainer
      ? this.trainer.party.map((entry) => createCreature(entry.species, entry.level))
      : [config.foe];

    this.foeIndex = 0;
    this.player = null;
    this.foe = null;

    this.participants = new Set();
    this.timer = 0;
    this.waitResolve = null;
    this.menu = null;
    this.anim = { shake: 0, flash: 0, target: null, ballY: -1, ballShakes: 0 };
    this.hpDisplay = new Map();
    this.outcome = 'ongoing';
    this.finished = false;
    this.intro = 1;
  }

  enter() {
    audio.play(this.musicTrack(), TRACKS);
    this.player = makeCombatant(this.firstHealthy(), 'player');
    this.foe = makeCombatant(this.foeParty[0], 'foe');
    this.participants.add(this.player.creature);
    this.hpDisplay.set(this.player.creature, this.player.creature.hp);
    this.hpDisplay.set(this.foe.creature, this.foe.creature.hp);
    markSeen(this.foe.creature.speciesId);
    this.run();
  }

  musicTrack() {
    if (!this.isTrainer) return 'battleWild';
    return this.trainer.leader ? 'battleBoss' : 'battleTrainer';
  }

  firstHealthy() {
    return this.playerParty.find((c) => c.hp > 0) ?? this.playerParty[0];
  }

  // ------------------------------------------------------------ utilities --

  wait(seconds) {
    return new Promise((resolve) => {
      this.timer = seconds;
      this.waitResolve = resolve;
    });
  }

  say(text, opts) {
    return dialog.say(text, opts);
  }

  /** Opens a menu and resolves with the chosen index (or -1 for cancel). */
  openMenu(type, options, { columns = 2, cancellable = true, index = 0 } = {}) {
    return new Promise((resolve) => {
      this.menu = { type, options, columns, cancellable, index, resolve };
    });
  }

  // ---------------------------------------------------------------- flow --

  async run() {
    await this.wait(0.9);

    if (this.isTrainer) {
      await this.say(`${this.trainer.name} wants to fight!`);
      await this.say(this.trainer.intro, { theme: this.trainer.leader ? 'royal' : 'parchment' });
      await this.say(`${this.trainer.name} sent out ${displayName(this.foe.creature)}!`);
    } else {
      await this.say(`A wild ${displayName(this.foe.creature)} appeared!`);
    }
    await this.say(`Go, ${displayName(this.player.creature)}!`);

    while (this.outcome === 'ongoing') {
      await this.playerTurn();
    }

    await this.finish();
  }

  async playerTurn() {
    const action = await this.chooseAction();
    if (this.outcome !== 'ongoing') return;

    if (action.type === 'move') {
      await this.resolveTurn(action);
    } else if (action.type === 'switch') {
      await this.doSwitch(action.index, true);
      if (this.outcome === 'ongoing') await this.foeOnlyTurn();
    } else if (action.type === 'item') {
      await this.useItem(action.itemId);
      if (this.outcome === 'ongoing') await this.foeOnlyTurn();
    } else if (action.type === 'run') {
      // handled inside chooseAction
    }
  }

  async chooseAction() {
    while (true) {
      dialog.show(`What will ${displayName(this.player.creature)} do?`);
      const choice = await this.openMenu('action', ['FIGHT', 'BAG', 'SWEAR', 'RUN'], { cancellable: false });

      if (choice === 0) {
        const moveIndex = await this.chooseMove();
        if (moveIndex >= 0) return { type: 'move', moveIndex };
      } else if (choice === 1) {
        const itemId = await this.chooseItem();
        if (itemId) return { type: 'item', itemId };
      } else if (choice === 2) {
        const index = await this.choosePartyMember(false);
        if (index >= 0) return { type: 'switch', index };
      } else if (choice === 3) {
        if (await this.tryRun()) return { type: 'run' };
      }
    }
  }

  async chooseMove() {
    const slots = this.player.creature.moves;
    const labels = slots.map((slot) => {
      const def = getMove(slot.id);
      return `${def.name}`;
    });
    const index = await this.openMenu('move', labels, { columns: 2 });
    if (index < 0) return -1;
    if (slots[index].pp <= 0) {
      await this.say('There is no strength left in that move!');
      return this.chooseMove();
    }
    return index;
  }

  async chooseItem() {
    const usable = Object.keys(game.state.bag)
      .filter((id) => ITEMS[id] && !ITEMS[id].key && itemCount(id) > 0)
      .filter((id) => this.isTrainer ? ITEMS[id].use?.kind !== 'catch' : true);

    if (!usable.length) {
      await this.say('Your pack is empty.');
      return null;
    }
    const labels = usable.map((id) => `${getItem(id).name} x${itemCount(id)}`);
    const index = await this.openMenu('list', labels, { columns: 1 });
    return index < 0 ? null : usable[index];
  }

  async choosePartyMember(forced) {
    const labels = this.playerParty.map((c) => {
      const tag = c.hp <= 0 ? 'FAINTED' : `${c.hp}/${maxHp(c)}`;
      return `${displayName(c)} Lv${c.level} ${tag}`;
    });
    while (true) {
      const index = await this.openMenu('list', labels, { columns: 1, cancellable: !forced });
      if (index < 0) return -1;
      const creature = this.playerParty[index];
      if (creature.hp <= 0) {
        await this.say(`${displayName(creature)} has no fight left.`);
        continue;
      }
      if (creature === this.player.creature) {
        await this.say(`${displayName(creature)} is already out there.`);
        continue;
      }
      return index;
    }
  }

  async tryRun() {
    if (this.isTrainer) {
      await this.say('There is no running from a sworn challenge!');
      return false;
    }
    const playerSpeed = this.player.creature.stats.spe;
    const foeSpeed = this.foe.creature.stats.spe;
    const odds = playerSpeed >= foeSpeed ? 0.9 : 0.45 + (playerSpeed / Math.max(1, foeSpeed)) * 0.4;
    if (rng.chance(odds)) {
      await this.say('You got away safely!');
      this.outcome = 'fled';
      return true;
    }
    await this.say("You couldn't get away!");
    await this.foeOnlyTurn();
    return false;
  }

  // ------------------------------------------------------------- the turn --

  async resolveTurn(action) {
    const playerSlot = this.player.creature.moves[action.moveIndex];
    const playerMove = getMove(playerSlot.id);
    const foeSlot = chooseFoeMove(this.foe, this.player);
    const foeMove = foeSlot ? getMove(foeSlot.id) : null;

    const order = moveOrder(this.player, this.foe, playerMove, foeMove);

    for (const attacker of order) {
      if (this.outcome !== 'ongoing') return;
      if (isFainted(attacker.creature)) continue;
      const defender = attacker === this.player ? this.foe : this.player;
      if (isFainted(defender.creature)) continue;

      const slot = attacker === this.player ? playerSlot : foeSlot;
      const def = attacker === this.player ? playerMove : foeMove;
      if (!slot || !def) {
        await this.say(`${displayName(attacker.creature)} has no moves left and flails helplessly!`);
        continue;
      }
      await this.performMove(attacker, defender, slot, def);
      if (await this.checkFaints()) return;
    }

    // End-of-turn chip damage.
    for (const combatant of order) {
      if (isFainted(combatant.creature)) continue;
      const tick = statusAfterTurn(combatant);
      if (tick) {
        await this.animateDamage(combatant);
        await this.say(tick.text);
      }
    }
    await this.checkFaints();
  }

  /** The foe attacks and the player does not — used after items and switches. */
  async foeOnlyTurn() {
    if (isFainted(this.foe.creature) || this.outcome !== 'ongoing') return;
    const slot = chooseFoeMove(this.foe, this.player);
    if (slot) {
      await this.performMove(this.foe, this.player, slot, getMove(slot.id));
    }
    const tick = statusAfterTurn(this.foe);
    if (tick) {
      await this.animateDamage(this.foe);
      await this.say(tick.text);
    }
    await this.checkFaints();
  }

  async performMove(attacker, defender, slot, def) {
    const gate = statusBeforeMove(attacker);
    if (gate.text) await this.say(gate.text);
    if (!gate.canAct) return;

    slot.pp = Math.max(0, slot.pp - 1);
    const who = attacker.side === 'player' ? '' : 'Foe ';
    await this.say(`${who}${displayName(attacker.creature)} used ${def.name}!`);

    if (!accuracyCheck(def)) {
      await this.say('The attack missed!');
      return;
    }

    if (def.category === 'status') {
      await this.applyEffect(attacker, defender, def, 0);
      return;
    }

    const hits = def.effect?.hits ? rng.int(def.effect.hits[0], def.effect.hits[1]) : 1;
    let total = 0;
    let effectiveness = 1;
    let critical = false;

    for (let i = 0; i < hits; i++) {
      if (isFainted(defender.creature)) break;
      const result = calcDamage(attacker, defender, def);
      effectiveness = result.effectiveness;
      critical = critical || result.critical;
      if (effectiveness === 0) break;

      defender.creature.hp = Math.max(0, defender.creature.hp - result.damage);
      total += result.damage;
      audio.sfx(effectiveness > 1 ? 'strong' : effectiveness < 1 ? 'weak' : 'hit');
      await this.animateDamage(defender);
    }

    if (effectiveness === 0) {
      await this.say(`It doesn't affect ${displayName(defender.creature)}.`);
      return;
    }
    if (critical) await this.say('A critical hit!');
    const note = effectivenessText(effectiveness);
    if (note) await this.say(note);
    if (hits > 1) await this.say(`Hit ${hits} times!`);

    await this.applyEffect(attacker, defender, def, total);
  }

  async applyEffect(attacker, defender, def, damageDealt) {
    const effect = def.effect;
    if (!effect) return;
    if (effect.chance !== undefined && !rng.chance(effect.chance)) return;
    if (def.chance !== undefined && !rng.chance(def.chance)) return;

    if (effect.heal) {
      const healed = healBy(attacker.creature, Math.floor(maxHp(attacker.creature) * effect.heal));
      audio.sfx('heal');
      await this.animateHp(attacker);
      await this.say(healed > 0
        ? `${displayName(attacker.creature)} recovered its strength.`
        : `${displayName(attacker.creature)} is already at full strength.`);
    }
    if (effect.drain && damageDealt > 0) {
      healBy(attacker.creature, Math.floor(damageDealt * effect.drain));
      audio.sfx('heal');
      await this.animateHp(attacker);
      await this.say(`${displayName(defender.creature)}'s strength was drained away.`);
    }
    if (effect.recoil && damageDealt > 0) {
      const recoil = Math.max(1, Math.floor(damageDealt * effect.recoil));
      attacker.creature.hp = Math.max(0, attacker.creature.hp - recoil);
      await this.animateDamage(attacker);
      await this.say(`${displayName(attacker.creature)} is hurt by the recoil!`);
    }
    if (effect.status && !isFainted(defender.creature)) {
      const text = applyStatus(defender, effect.status);
      if (text) await this.say(text);
    }
    if (effect.stat) {
      const target = effect.target === 'self' ? attacker : defender;
      if (!isFainted(target.creature)) {
        const result = changeStage(target, effect.stat, effect.stages);
        await this.say(result.text);
      }
    }
    if (effect.flinch && !isFainted(defender.creature)) {
      defender.flinched = true;
    }
  }

  // ------------------------------------------------------------- fainting --

  async checkFaints() {
    if (isFainted(this.foe.creature)) {
      audio.sfx('faint');
      await this.animateFaint(this.foe);
      await this.say(`${this.isTrainer ? 'Foe ' : 'The wild '}${displayName(this.foe.creature)} fainted!`);
      await this.awardExp();
      if (!(await this.nextFoe())) return true;
      return true;
    }
    if (isFainted(this.player.creature)) {
      audio.sfx('faint');
      await this.animateFaint(this.player);
      await this.say(`${displayName(this.player.creature)} fainted!`);
      if (!(await this.nextPlayer())) return true;
      return true;
    }
    return false;
  }

  async nextFoe() {
    this.foeIndex++;
    if (this.foeIndex >= this.foeParty.length) {
      this.outcome = 'won';
      return false;
    }
    this.foe = makeCombatant(this.foeParty[this.foeIndex], 'foe');
    this.hpDisplay.set(this.foe.creature, this.foe.creature.hp);
    markSeen(this.foe.creature.speciesId);
    await this.say(`${this.trainer.name} sent out ${displayName(this.foe.creature)}!`);
    return true;
  }

  async nextPlayer() {
    if (!this.playerParty.some((c) => c.hp > 0)) {
      this.outcome = 'lost';
      return false;
    }
    const index = await this.choosePartyMember(true);
    await this.doSwitch(index, false);
    return true;
  }

  async doSwitch(index, voluntary) {
    const incoming = this.playerParty[index];
    if (voluntary) {
      await this.say(`Come back, ${displayName(this.player.creature)}!`);
    }
    this.player = makeCombatant(incoming, 'player');
    this.participants.add(incoming);
    this.hpDisplay.set(incoming, incoming.hp);
    await this.say(`Go, ${displayName(incoming)}!`);
  }

  // ------------------------------------------------------------------ exp --

  async awardExp() {
    const alive = [...this.participants].filter((c) => c.hp > 0);
    if (!alive.length) return;
    const amount = expFor(this.foe, alive.length, this.isTrainer);

    // Commanding a fight teaches you something too, at a third of the rate a
    // duel would, so neither play style locks you out of the other.
    const { gainPlayerExp } = await import('../game/player.js');
    const yours = Math.max(1, Math.round(amount / 3));
    const mine = gainPlayerExp(yours);
    if (mine.levels > 0) {
      audio.sfx('levelup');
      await this.say(`You reached level ${game.state.player.level}!`);
    }

    for (const creature of alive) {
      const result = gainExp(creature, amount);
      await this.say(`${displayName(creature)} gained ${amount} experience.`);

      if (result.levels > 0) {
        audio.sfx('levelup');
        await this.say(`${displayName(creature)} grew to level ${creature.level}!`);
      }
      for (const moveId of result.learned) {
        await this.teachMove(creature, moveId);
      }
      if (result.evolveTo) {
        await this.doEvolve(creature, result.evolveTo);
      }
    }
  }

  async teachMove(creature, moveId) {
    const def = getMove(moveId);
    if (creature.moves.length < 4) {
      learnMove(creature, moveId);
      audio.sfx('confirm');
      await this.say(`${displayName(creature)} learned ${def.name}!`);
      return;
    }
    const keep = await dialog.choose(
      `${displayName(creature)} wants to learn ${def.name}, but already knows four moves. Replace one?`,
      ['Yes', 'No'],
    );
    if (keep !== 0) {
      await this.say(`${displayName(creature)} did not learn ${def.name}.`);
      return;
    }
    const labels = creature.moves.map((slot) => getMove(slot.id).name);
    const index = await this.openMenu('list', labels, { columns: 1, cancellable: true });
    if (index < 0) {
      await this.say(`${displayName(creature)} did not learn ${def.name}.`);
      return;
    }
    const replaced = getMove(creature.moves[index].id).name;
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

  // -------------------------------------------------------------- items --

  async useItem(itemId) {
    const def = getItem(itemId);
    const use = def.use;

    if (use.kind === 'catch') {
      await this.throwBanner(def);
      return;
    }

    const targetIndex = await this.choosePartyMemberForItem(use);
    if (targetIndex < 0) return;
    const target = this.playerParty[targetIndex];

    if (use.kind === 'heal' || use.kind === 'fullHeal') {
      const amount = use.kind === 'fullHeal' ? maxHp(target) : use.amount;
      const healed = healBy(target, amount);
      if (use.kind === 'fullHeal') {
        target.status = null;
        target.statusCounter = 0;
      }
      takeItem(itemId);
      audio.sfx('heal');
      if (target === this.player.creature) await this.animateHp(this.player);
      await this.say(`${displayName(target)} recovered ${healed} HP.`);
    } else if (use.kind === 'cure') {
      if (target.status !== use.status) {
        await this.say('It would have no effect.');
        return;
      }
      target.status = null;
      target.statusCounter = 0;
      takeItem(itemId);
      audio.sfx('heal');
      await this.say(`${displayName(target)} is itself again.`);
    } else if (use.kind === 'revive') {
      if (target.hp > 0) {
        await this.say('It would have no effect.');
        return;
      }
      target.hp = Math.max(1, Math.floor(maxHp(target) * use.ratio));
      takeItem(itemId);
      audio.sfx('heal');
      await this.say(`${displayName(target)} was brought back!`);
    }
  }

  async choosePartyMemberForItem() {
    const labels = this.playerParty.map((c) => {
      const tag = c.hp <= 0 ? 'FAINTED' : `${c.hp}/${maxHp(c)}`;
      return `${displayName(c)} Lv${c.level} ${tag}`;
    });
    return this.openMenu('list', labels, { columns: 1, cancellable: true });
  }

  async throwBanner(def) {
    takeItem(def.id);
    await this.say(`You raised the ${def.name}!`);
    audio.sfx('ball');
    this.anim.ballY = 0;
    await this.wait(0.7);

    const result = attemptCatch(this.foe, def.bonus);
    for (let i = 0; i < result.shakes; i++) {
      this.anim.ballShakes = 1;
      audio.sfx('cursor');
      await this.wait(0.55);
    }

    if (result.caught) {
      audio.sfx('caught');
      const creature = this.foe.creature;
      creature.originalTrainer = game.state.player.name;
      creature.caughtAt = game.state.position.map;
      const where = addCreature(creature);
      await this.say(`${displayName(creature)} swore itself to your banner!`);
      if (where === 'box') {
        await this.say(`Your party is full, so ${displayName(creature)} was sent to the kennels.`);
      }
      this.outcome = 'caught';
      this.anim.ballY = -1;
      return;
    }

    this.anim.ballY = -1;
    const lines = [
      'It broke free at once!',
      'It slipped the banner!',
      'So close — it got away!',
      'Almost had it!',
    ];
    await this.say(lines[Math.min(result.shakes, lines.length - 1)]);
    await this.foeOnlyTurn();
  }

  // ------------------------------------------------------------- endgame --

  async finish() {
    if (this.outcome === 'won') {
      audio.play('victory', TRACKS);
      if (this.isTrainer) {
        await this.say(`${this.trainer.name} was defeated!`);
        await this.say(this.trainer.defeat, { theme: this.trainer.leader ? 'royal' : 'parchment' });
        addMoney(this.trainer.reward);
        audio.sfx('money');
        await this.say(`You collected ${this.trainer.reward} gold dragons.`);
        setFlag(`trainer_${this.trainer.id}`);
        if (this.trainer.sigil) {
          awardSigil(this.trainer.sigil);
          await this.say(`You received the ${this.trainer.sigil.toUpperCase()} SIGIL!`, { theme: 'royal' });
        }
      }
    } else if (this.outcome === 'lost') {
      await this.say('You have no creatures left standing...');
    }

    this.finished = true;
    this.manager.transition(() => {
      this.manager.pop();
      this.config.onEnd?.(this.outcome);
    });
  }

  // -------------------------------------------------------- animation ---

  async animateDamage(combatant) {
    this.anim.shake = 0.35;
    this.anim.target = combatant;
    await this.animateHp(combatant);
  }

  /** Slides the displayed HP toward the real value. */
  animateHp(combatant) {
    return new Promise((resolve) => {
      this.hpTween = { combatant, resolve, speed: Math.max(20, maxHp(combatant.creature) * 1.4) };
    });
  }

  async animateFaint(combatant) {
    this.anim.faint = { combatant, t: 0 };
    await this.wait(0.75);
    this.anim.faint = null;
  }

  // ---------------------------------------------------------------- tick --

  update(dt) {
    if (this.intro > 0) this.intro = Math.max(0, this.intro - dt * 1.6);

    if (this.anim.shake > 0) this.anim.shake = Math.max(0, this.anim.shake - dt);
    if (this.anim.flash > 0) this.anim.flash = Math.max(0, this.anim.flash - dt);
    if (this.anim.faint) this.anim.faint.t += dt;
    if (this.anim.ballY >= 0) this.anim.ballY += dt;

    // HP bar tween.
    if (this.hpTween) {
      const { combatant, speed, resolve } = this.hpTween;
      const actual = combatant.creature.hp;
      const shown = this.hpDisplay.get(combatant.creature) ?? actual;
      const step = speed * dt;
      let next = shown;
      if (shown < actual) next = Math.min(actual, shown + step);
      else if (shown > actual) next = Math.max(actual, shown - step);
      this.hpDisplay.set(combatant.creature, next);
      if (Math.abs(next - actual) < 0.5) {
        this.hpDisplay.set(combatant.creature, actual);
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
    const columns = menu.columns;
    const count = menu.options.length;

    const moveBy = (delta) => {
      menu.index = (menu.index + delta + count) % count;
      audio.sfx('cursor');
    };

    if (columns === 1) {
      if (input.repeat('up')) moveBy(-1);
      if (input.repeat('down')) moveBy(1);
    } else {
      if (input.repeat('left') && menu.index % columns > 0) moveBy(-1);
      if (input.repeat('right') && menu.index % columns < columns - 1 && menu.index + 1 < count) moveBy(1);
      if (input.repeat('up') && menu.index - columns >= 0) moveBy(-columns);
      if (input.repeat('down') && menu.index + columns < count) moveBy(columns);
    }

    if (input.pressed('a')) {
      audio.sfx('confirm');
      const resolve = menu.resolve;
      const index = menu.index;
      this.menu = null;
      resolve(index);
    } else if (input.pressed('b') && menu.cancellable) {
      audio.sfx('cancel');
      const resolve = menu.resolve;
      this.menu = null;
      resolve(-1);
    }
  }

  // ---------------------------------------------------------------- draw --

  draw(ctx) {
    this.drawBackground(ctx);

    const shakeX = this.anim.shake > 0 ? Math.round(Math.sin(this.anim.shake * 60) * 3) : 0;

    this.drawCreature(ctx, this.foe, FOE_SPRITE, shakeX);
    this.drawCreature(ctx, this.player, PLAYER_SPRITE, shakeX);

    if (this.anim.ballY >= 0) this.drawBanner(ctx);

    this.drawHud(ctx, this.foe, FOE_HUD, false);
    this.drawHud(ctx, this.player, PLAYER_HUD, true);

    if (this.anim.flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.anim.flash);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 240, 160);
      ctx.restore();
    }

    dialog.draw(ctx);
    if (this.menu) this.drawMenu(ctx);
  }

  drawBackground(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, 160);
    sky.addColorStop(0, this.isTrainer ? '#38324e' : '#4a6ea8');
    sky.addColorStop(1, this.isTrainer ? '#6a5a68' : '#a8c4d8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 240, 160);

    // Two ground discs, one under each combatant.
    const disc = (cx, cy, rx, ry, color, edge) => {
      ctx.fillStyle = edge;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 1, rx - 2, ry - 2, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    disc(182, 66, 46, 12, '#7c9a54', '#5c7a3c');
    disc(54, 110, 54, 13, '#7c9a54', '#5c7a3c');

    ctx.fillStyle = 'rgba(30,40,30,0.18)';
    ctx.fillRect(0, 132, 240, 28);
  }

  drawCreature(ctx, combatant, layout, shakeX) {
    const fainting = this.anim.faint?.combatant === combatant;
    // Once the drop animation is over, a fainted creature is simply gone.
    if (isFainted(combatant.creature) && !fainting) return;

    const sprite = creatureSprite(creatureSpecies(combatant.creature));
    let { x, y, size } = layout;
    let alpha = 1;

    if (fainting) {
      const t = Math.min(1, this.anim.faint.t / 0.7);
      y += t * 24;
      alpha = 1 - t;
    }
    if (this.intro > 0) {
      const slide = this.intro * 60;
      x += combatant.side === 'foe' ? slide : -slide;
      alpha = 1 - this.intro * 0.6;
    }
    if (this.anim.shake > 0 && this.anim.target === combatant) x += shakeX;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x + size / 2, y + size - 4, size * 0.34, size * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(sprite, 0, 0, SPRITE_SIZE, SPRITE_SIZE, Math.round(x), Math.round(y), size, size);
    ctx.restore();
  }

  drawBanner(ctx) {
    const t = this.anim.ballY;
    const startX = 70;
    const endX = FOE_SPRITE.x + 20;
    const progress = Math.min(1, t / 0.7);
    const x = startX + (endX - startX) * progress;
    const y = 110 - Math.sin(progress * Math.PI) * 60 - progress * 40;
    const wobble = this.anim.ballShakes ? Math.sin(t * 30) * 2 : 0;

    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(Math.round(x + wobble), Math.round(y), 2, 12);
    ctx.fillStyle = '#b8323c';
    ctx.fillRect(Math.round(x + wobble) + 2, Math.round(y), 9, 7);
    ctx.fillStyle = '#e8d060';
    ctx.fillRect(Math.round(x + wobble) + 4, Math.round(y) + 2, 3, 3);
  }

  drawHud(ctx, combatant, box, isPlayer) {
    const creature = combatant.creature;
    const t = drawStatusBox(ctx, box.x, box.y, box.w, box.h, { notchLeft: isPlayer });

    const levelLabel = `Lv${creature.level}`;
    const levelW = measure(levelLabel);
    const name = fitText(displayName(creature).toUpperCase(), box.w - levelW - 22);
    drawText(ctx, name, box.x + 8, box.y + 4, { color: t.text, shadow: t.textShadow });
    drawText(ctx, levelLabel, box.x + box.w - levelW - 9, box.y + 4,
      { color: t.text, shadow: t.textShadow });

    const shown = this.hpDisplay.get(creature) ?? creature.hp;
    const ratio = Math.max(0, shown / maxHp(creature));
    drawHpGauge(ctx, box.x + 7, box.y + 16, box.w - 15, ratio);

    if (creature.status) {
      const s = STATUSES[creature.status];
      const tagW = 20;
      const tagX = box.x + 7;
      const tagY = box.y + 25;
      ctx.fillStyle = '#2b3f2c';
      ctx.fillRect(tagX - 1, tagY - 1, tagW + 2, 9);
      ctx.fillStyle = s.color;
      ctx.fillRect(tagX, tagY, tagW, 7);
      drawText(ctx, s.name, tagX + 2, tagY, { color: '#2a2a30', shadow: null });
    }

    if (isPlayer) {
      const hpLabel = `${Math.round(shown)}/${maxHp(creature)}`;
      drawText(ctx, hpLabel, box.x + box.w - measure(hpLabel) - 9, box.y + 27,
        { color: t.text, shadow: t.textShadow });

      const def = creatureSpecies(creature);
      const current = expForLevel(def.growth, creature.level);
      const next = expForLevel(def.growth, creature.level + 1);
      const progress = next > current ? (creature.exp - current) / (next - current) : 0;
      drawExpGauge(ctx, box.x + 7, box.y + box.h - 9, box.w - 15,
        Math.max(0, Math.min(1, progress)));
    }
  }

  drawMenu(ctx) {
    const menu = this.menu;
    if (menu.type === 'action') return this.drawActionMenu(ctx);
    if (menu.type === 'move') return this.drawMoveMenu(ctx);
    return this.drawListMenu(ctx);
  }

  drawActionMenu(ctx) {
    const box = { x: 136, y: 106, w: 100, h: 50 };
    const theme = drawPanel(ctx, box.x, box.y, box.w, box.h, 'command');
    this.menu.options.forEach((label, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = box.x + 15 + col * 44;
      const y = box.y + 9 + row * 17;
      if (i === this.menu.index) {
        drawText(ctx, '\u25b8', x - 9, y, { color: theme.accent, shadow: null });
      }
      drawText(ctx, label, x, y, { color: theme.text, shadow: theme.textShadow });
    });
  }

  drawMoveMenu(ctx) {
    const box = { x: 4, y: 104, w: 232, h: 52 };
    const theme = drawPanel(ctx, box.x, box.y, box.w, box.h, 'night');
    const slots = this.player.creature.moves;

    slots.forEach((slot, i) => {
      const def = getMove(slot.id);
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = box.x + 14 + col * 96;
      const y = box.y + 6 + row * 14;
      if (i === this.menu.index) {
        drawText(ctx, '▸', x - 9, y, { color: theme.text, shadow: theme.textShadow });
      }
      const dim = slot.pp <= 0 ? '#8a8fa4' : theme.text;
      drawText(ctx, def.name, x, y, { color: dim, shadow: theme.textShadow });
    });

    // Detail strip for the highlighted move.
    const selected = slots[this.menu.index];
    if (!selected) return;
    const def = getMove(selected.id);
    const infoY = box.y + 36;
    ctx.fillStyle = typeColor(def.type);
    ctx.fillRect(box.x + 8, infoY, 34, 9);
    drawText(ctx, typeName(def.type), box.x + 10, infoY + 1, { color: '#20222e', shadow: null });
    drawText(ctx, `PP ${selected.pp}/${selected.maxPp}`, box.x + 50, infoY,
      { color: theme.text, shadow: theme.textShadow });
    const power = def.power > 0 ? `POW ${def.power}` : 'STATUS';
    drawText(ctx, power, box.x + 110, infoY, { color: theme.text, shadow: theme.textShadow });
    drawText(ctx, `ACC ${def.accuracy}`, box.x + 168, infoY, { color: theme.text, shadow: theme.textShadow });
  }

  drawListMenu(ctx) {
    const menu = this.menu;
    const width = Math.max(120, Math.max(...menu.options.map((o) => measure(o))) + 26);
    const height = menu.options.length * LINE_HEIGHT + 10;
    const x = 236 - width;
    const y = Math.max(4, 106 - height);
    const theme = drawPanel(ctx, x, y, width, height, 'night');
    menu.options.forEach((label, i) => {
      const rowY = y + 5 + i * LINE_HEIGHT;
      if (i === menu.index) {
        drawText(ctx, '▸', x + 5, rowY, { color: theme.text, shadow: theme.textShadow });
      }
      drawText(ctx, label, x + 14, rowY, { color: theme.text, shadow: theme.textShadow });
    });
  }
}
