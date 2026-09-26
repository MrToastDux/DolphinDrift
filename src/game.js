import { forkAt, routeAt, updateRoutes } from './routes.js';
import { MODIFIERS, bonusAt } from './catalog.js';
import { TOUR_LENGTH, tourAt, bossVolley } from './tour.js';
import { DIFFICULTY_PRESSURE } from './balance.js';
import { chapterById, characterById, weaponById, objectiveProgress } from './adventure.js';
import { fireWeapon, useAbility, tidalBlast, tickCombat, defeatEnemy } from './combat.js';
const LANES = [-1, 0, 1];
export const START_SPEED = 12;
export const MAX_SPEED = 9999999999;
export const SPEED_GAIN = 0.18;
const OBSTACLE_PRESSURE = 1.33;
export const REVIVE_COST = 150;
export const COMBO_SECONDS = 4;
export const DASH_CHARGE = 25;
export const DASH_SECONDS = 3;
export const BOSS_RECHARGE_SECONDS = 3.5;
export const MODES = Object.freeze({
  endless: { name: 'Endless', description: 'A fresh route. A little faster every second.' },
  daily: { name: 'Daily route', description: 'The same course all day.' },
  tour: { name: 'Island Tour', description: 'Three districts. Reach 2,250 m and earn 300 checkpoint records.' },
  story: { name: 'Story', description: 'Restore the island radio. Six chapters, one extraordinary crew.' },
});
export const SURFBOARD_COST = 200;
export const SURFBOARD_SECONDS = 20;
export const SURFBOARD_HEIGHT = 4.2;
export const POWERUP_DURATIONS = Object.freeze({ magnet: 10, shield: 12, ghost: 6, spring: 12 });
// One pickup per this many regular obstacle rows. Lower = more frequent.
export const POWERUP_EVERY_ROWS = 6;
const SURFBOARD_RECORD_LIMIT = 96;
const JUMP_VELOCITY = 8.2;
const SPRING_JUMP_VELOCITY = 10.8;
const AIR_ROLL_SPEED = 18;
const GRAVITY = 16;
const SLIDE_SECONDS = 0.85;
const FIRST_ROW = 80;
const LOOK_AHEAD = 210;
const MAX_FRAME = 0.1;
const STEP = 1 / 120;
const POWERS = Object.keys(POWERUP_DURATIONS);
const OBSTACLES = ['barrier', 'gate', 'tram', 'crate', 'buoy', 'cart'];
const MAGNET_RANGE = 12;

export function speedAtTime(seconds) {
  return Math.min(MAX_SPEED, START_SPEED + Math.max(0, seconds) * SPEED_GAIN);
}

function seededRandom(seed) {
  // Hash text too, so a calendar date makes a repeatable daily route.
  let state = 2166136261;
  for (const character of String(seed)) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/** Small, rendering-independent simulation. All distances are in metres. */
export class Game {
  constructor({ random = Math.random, seed, mode = 'endless' } = {}) {
    this.mode = Object.hasOwn(MODES, mode) ? mode : 'endless';
    this.seed = seed;
    this._providedRandom = random;
    this.reset();
  }

  reset() {
    this.mode = Object.hasOwn(MODES, this.mode) ? this.mode : 'endless';
    this.character = this.mode === 'daily' ? 'dub' : characterById(this.character).id;
    this.weapon = this.mode === 'daily' ? 'pulse' : weaponById(this.weapon).id;
    this.chapterId = chapterById(this.chapterId).id;
    this.abilityCooldown = 0; this.abilityRemaining = 0;
    this.fireCooldown = 0; this.specialCharge = 0; this.blastRemaining = 0;
    this.sonicShots = []; this.enemyBolts = []; this.grapple = null;
    this.campaignEnded = false;
    this.modifier = ['daily', 'story'].includes(this.mode) || !Object.hasOwn(MODIFIERS, this.modifier) ? 'none' : this.modifier;
    this.upgrades = this.mode === 'daily' ? {} : this.upgrades || {};
    this.bonus = null;
    this.forkIndex = 0; this.routeChoices = new Map();
    this._routeRows = new Map();
    this.celebratedDistance = false; this.celebratedCombo = false;
    this.bonusCredits = 0;
    this.bonusCompleted = 0;
    this.random = this.seed === undefined ? this._providedRandom : seededRandom(this.seed);
    // Flights must not consume the daily ground course's random choices.
    this._skyRandomSource = this.seed === undefined ? this._providedRandom : seededRandom(`${this.seed}:sky`);
    this.state = 'ready';
    this.distance = 0;
    this.coins = 0;
    this._score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboRemaining = 0;
    this.dashCharge = 0;
    this.dashRemaining = 0;
    this.completed = false;
    this.stuntChain = 0;
    this.stuntRemaining = 0;
    this.lastStunt = '';
    this.tourCleared = 0;
    this.boss = null;
    this.bossDefeats = 0;
    this.projectiles = [];
    this.combat = { dodges: 0, deflections: 0, flawless: 0, streak: 0, bestStreak: 0, feedback: '', feedbackTime: 0 };
    this.stats = { mastery: 0, records: 0, jumps: 0, rolls: 0, powerups: 0, nearMisses: 0, flights: 0, shieldsUsed: 0, stunts: 0, bosses: 0, enemies: 0, rescues: 0 };
    this.usedRevive = false;
    this.reviveGrace = 0;
    this.elapsedTime = 0;
    this.surfRemaining = 0;
    this.surfLandingGrace = 0;
    this.powerups = Object.fromEntries(POWERS.map(power => [power, 0]));
    this.shieldGrace = 0;
    this.ghostGrace = 0;
    this.speed = START_SPEED * (this.modifier === 'turbo' ? 1.3 : 1);
    this.player = {
      lane: 0,
      x: 0,
      jump: 0,
      springJump: false,
      altitude: 0,
      sliding: false,
      slideRemaining: 0,
      rollProgress: 0,
    };
    this.objects = [];
    this._events = [];
    this._jumpVelocity = 0;
    this._nextRow = FIRST_ROW;
    this._nextId = 1;
    this._rowCount = 0;
    this._nextPower = 1;
    this._nextSky = 0;
    this._skyEnd = 0;
    this._skyLane = 0;
    this._skyRecordCount = 0;
    this._nearMisses = [];
    if (this.modifier !== 'pure') this._add('powerup', 0, 65, { power: 'magnet' });
    this._fillTrack();
  }

  start() {
    if (this.state === 'playing') return false;
    this.reset();
    this.state = 'playing';
    if (this.mode !== 'daily' && this.modifier !== 'pure') {
      if (this.supply === 'dash') this.dashCharge = DASH_CHARGE;
      else if (POWERS.includes(this.supply)) this.powerups[this.supply] = this.powerDuration(this.supply);
    }
    this._events.push({ type: 'start' });
    return true;
  }

  pause() {
    if (this.state !== 'playing') return false;
    this.state = 'paused';
    return true;
  }

  resume() {
    if (this.state !== 'paused') return false;
    this.state = 'playing';
    return true;
  }

  get score() {
    return Math.floor(this._score);
  }

  get chapter() { return this.mode === 'story' ? chapterById(this.chapterId) : null; }
  tourAtDistance(distance) {
    const chapter = this.chapter;
    if (chapter?.boss === undefined) return null;
    const base = tourAt(chapter.boss * 750), bossStart = chapter.length - 340;
    return { ...base, start: 0, end: chapter.length, bossStart, armor: chapter.armor,
      name: chapter.place, boss: chapter.final ? 'Overlord Static' : base.boss,
      final: chapter.final, encounter: distance >= bossStart && distance < chapter.length,
      remaining: Math.max(0, chapter.length - distance) };
  }
  get tour() { return this.tourAtDistance(this.distance); }
  get routeStage() { return this.mode === 'tour' ? tourAt(this.distance) : this.tour; }
  sectionAt(distance) { return ['tour', 'story'].includes(this.mode) ? null : bonusAt(distance); }
  get abilityProtected() { return this.abilityRemaining > 0 && this.character !== 'dub'; }
  get combatEnabled() { return this.mode === 'story'; }

  get acceleration() {
    return SPEED_GAIN * (this.modifier === 'turbo' ? 1.3 : 1);
  }

  get comboDuration() { return (this.modifier === 'flow' ? 10 : COMBO_SECONDS) + (this.upgrades['flow-upgrade'] || 0); }
  get surfDuration() { return SURFBOARD_SECONDS + 2 * (this.upgrades['surf-upgrade'] || 0); }
  get dashDuration() { return DASH_SECONDS + .5 * (this.upgrades['dash-upgrade'] || 0); }
  get gravity() { return this.modifier === 'moon' || routeAt(this)?.id === 'reef' ? 11 : GRAVITY; }
  powerDuration(power) { return POWERUP_DURATIONS[power] + (power === 'ghost' ? 1 : 2) * (this.upgrades[`${power}-upgrade`] || 0); }

  get multiplier() {
    return Math.min(5, 1 + Math.floor(this.combo / 12))
      * (this.modifier === 'pure' ? 2 : this.modifier === 'turbo' ? 1.5 : 1) * (this.bonus?.id === 'rainbow' ? 2 : 1);
  }

  revive() {
    if (this.state !== 'over' || this.completed || this.campaignEnded || this.usedRevive || this.coins < REVIVE_COST) return false;
    this.coins -= REVIVE_COST;
    this.usedRevive = true;
    this.reviveGrace = 2;
    this.projectiles.length = 0;
    this.enemyBolts.length = 0;
    this.objects = this.objects.filter(object => !((OBSTACLES.includes(object.type) || object.type === 'enemy')
      && object.z >= 0 && object.z <= this.speed * 2));
    Object.assign(this.player, {
      jump: 0, springJump: false, sliding: false, slideRemaining: 0, rollProgress: 0,
    });
    this._jumpVelocity = 0;
    this.state = 'playing';
    this._events.push({ type: 'revive' });
    return true;
  }

  action(name) {
    if (this.state !== 'playing') return false;
    if (name === 'surfboard') return this.buySurfboard();
    if (name === 'dash') return this.dash();
    if (name === 'counter') return this.counter();
    if (name === 'ability') return useAbility(this);
    if (name === 'special') return this.combatEnabled && tidalBlast(this);
    const p = this.player;
    if (name === 'left' || name === 'right') {
      const lane = Math.max(-1, Math.min(1, p.lane + (name === 'left' ? -1 : 1)));
      if (lane === p.lane) return false;
      p.lane = lane;
      return true;
    }
    if (this.surfRemaining > 0) return false;
    if (name === 'jump' && p.jump === 0 && !p.sliding) {
      // Capture the launch power so its timer cannot change a jump in midair.
      p.springJump = this.powerups.spring > 0;
      this._jumpVelocity = p.springJump ? SPRING_JUMP_VELOCITY : JUMP_VELOCITY;
      // A tiny positive height distinguishes takeoff from standing still.
      p.jump = 0.0001;
      this.stats.jumps += 1;
      this._events.push({ type: 'jump' });
      return true;
    }
    if ((name === 'slide' || name === 'roll') && !p.sliding) {
      // Tuck immediately and dive back to the track, even during takeoff.
      if (p.jump > 0) this._jumpVelocity = Math.min(this._jumpVelocity, -AIR_ROLL_SPEED);
      p.sliding = true;
      p.slideRemaining = SLIDE_SECONDS;
      p.rollProgress = 0;
      this.stats.rolls += 1;
      this._events.push({ type: 'slide' });
      return true;
    }
    return false;
  }

  buySurfboard() {
    if (this.state !== 'playing' || this.coins < SURFBOARD_COST || this.surfRemaining > 0) return false;
    this.coins -= SURFBOARD_COST;
    this.surfRemaining = this.surfDuration;
    this.stats.flights += 1;
    this.surfLandingGrace = 0;
    Object.assign(this.player, {
      altitude: SURFBOARD_HEIGHT, jump: 0, springJump: false, sliding: false,
      slideRemaining: 0, rollProgress: 0,
    });
    this._jumpVelocity = 0;
    // A fresh route begins in the rider's lane, with time to see its first record.
    this.objects = this.objects.filter(object => !object.sky);
    this._nextSky = this.distance + Math.max(10, this.speed * 0.75);
    this._skyLane = this.player.lane;
    this._skyRecordCount = 0;
    // Fix the route's endpoint at takeoff. Recomputing it during the final
    // landing buffer would otherwise keep spawning records beyond the route.
    const seconds = Math.max(0, this.surfDuration - .2);
    const accelerating = this.acceleration === 0 ? seconds : Math.max(0, Math.min(seconds, (MAX_SPEED - this.speed) / this.acceleration));
    this._skyEnd = this.distance + this.speed * accelerating
      + this.acceleration * accelerating ** 2 / 2 + MAX_SPEED * (seconds - accelerating);
    this._fillSky();
    this._events.push({ type: 'surfboard' });
    return true;
  }

  dash() {
    if (this.state !== 'playing' || this.dashCharge < DASH_CHARGE || this.dashRemaining > 0 || this.surfRemaining > 0) return false;
    this.dashCharge = 0;
    this.dashRemaining = this.dashDuration;
    this._events.push({ type: 'dash' });
    return true;
  }

  counter() {
    if (!this.combatEnabled) return false;
    if (!this.tour?.encounter) return fireWeapon(this);
    if (this.state !== 'playing' || !this.tour?.encounter || !this.boss || this.boss.defeated
        || this.boss.charge < 1 || this.boss.shot > 0) return false;
    const cost = this.weapon === 'lance' ? 2 : 1;
    if (this.boss.charge < cost) return false;
    this.boss.charge -= cost;
    this.boss.shotDamage = this.weapon === 'lance' ? 2 : 1;
    this.boss.shot = .4;
    this.boss.shotLane = this.player.x;
    const threat = this.incomingShot;
    const eta = threat ? threat.travel - threat.age : Infinity;
    this.boss.precisionShot = eta >= .12 && eta <= .45
      && Math.abs(this.player.x - threat.targetX) < .5
      && Math.abs(this.playerHeight - threat.targetY) < .8;
    if (this.boss.precisionShot) {
      // Deflect the volley as a unit so twin missiles never punish a successful parry.
      for (const shot of this.projectiles) if (shot.volley === threat.volley) shot.removed = true;
      this.boss.charge = Math.min(3, this.boss.charge + cost);
      this.combat.deflections++;
      this.dashCharge = Math.min(DASH_CHARGE, this.dashCharge + 5);
      this._events.push({ type: 'deflect' });
    }
    this._events.push({ type: 'counter' });
    return true;
  }

  _updateBoss(dt) {
    const stage = this.tour;
    if (!stage?.encounter) { this.boss = null; this.projectiles.length = 0; return; }
    if (this.boss?.stage !== stage.index) {
      this.projectiles.length = 0;
      this.boss = { stage: stage.index, hp: stage.armor, maxHP: stage.armor, charge: 1, shot: 0, hit: 0, defeated: false, defeatTime: 0, precisionShot: false, precisionTime: 0, phase: 1,
        cooldown: 1.3 / DIFFICULTY_PRESSURE, aiming: false, aimTime: 0, targetX: this.player.x, targetY: this.playerHeight, recharge: 0, volley: 0, damageTaken: 0, reward: 100 };
      this.combat.streak = 0;
      this._events.push({ type: 'boss-arrive' });
    }
    const boss = this.boss;
    boss.hit = Math.max(0, boss.hit - dt);
    boss.precisionTime = Math.max(0, boss.precisionTime - dt);
    const phase = this.distance >= stage.bossStart + 138 || boss.hp <= boss.maxHP / 2 ? 2 : 1;
    if (phase > boss.phase && !boss.defeated) { boss.phase = phase; this._events.push({type:'boss-phase'}); }
    if (boss.defeated) { boss.defeatTime += dt; return; }
    if (boss.charge < 3) {
      boss.recharge += dt;
      if (boss.recharge >= BOSS_RECHARGE_SECONDS) {
        boss.recharge -= BOSS_RECHARGE_SECONDS; boss.charge++;
        this._events.push({ type: 'boss-charge' });
      }
    } else boss.recharge = 0;
    if (boss.shot > 0) {
      boss.shot = Math.max(0, boss.shot - dt);
      if (boss.shot <= 1e-9) {
        boss.shot = 0; this.damageBoss(boss.shotDamage || 1);
        if (boss.precisionShot) {
          this._score += 500 * this.multiplier;
          boss.precisionTime = 1.6;
          this._events.push({ type: 'perfect-counter' });
        }
      }
    }
    if (boss.defeated) return;
    const spec = bossVolley(stage.final ? boss.volley % 3 : stage.index, boss.phase);
    if (boss.aiming) {
      boss.aimTime += dt;
      boss.targetX = this.player.x;
      boss.targetY = this.playerHeight;
      if (boss.aimTime >= spec.windup) {
        boss.aiming = false; boss.volley++;
        for (let i = 0; i < spec.count; i++) this.projectiles.push({
          id: this._nextId++, volley: boss.volley, bossStage: stage.index, kind: spec.kind,
          targetX: boss.targetX + (i - (spec.count - 1) / 2) * spec.spread,
          targetY: boss.targetY, age: -i * spec.stagger, travel: spec.travel,
          radius: spec.radius, color: stage.color, primary: i === Math.floor(spec.count / 2),
          muzzle: spec.kind === 'missile' ? (i ? 1 : -1) : 0,
        });
        boss.cooldown = spec.interval - spec.windup;
        this._events.push({ type: 'boss-fire' });
      }
    } else {
      boss.cooldown -= dt;
      if (boss.cooldown <= 0) {
        boss.aiming = true; boss.aimTime = 0;
        boss.targetX = this.player.x; boss.targetY = this.playerHeight;
        this._events.push({ type: 'boss-lock' });
      }
    }
  }

  get playerHeight() { return this.player.altitude + this.player.jump + (this.player.sliding ? .32 : .95); }

  damageBoss(damage) {
    const boss = this.boss;
    if (!this.combatEnabled || !boss || boss.defeated) return;
    boss.hp = Math.max(0, boss.hp - damage); boss.hit = .65;
    this.specialCharge = Math.min(100, this.specialCharge + 8);
    this._events.push({ type: 'boss-hit' });
    if (boss.hp > 0) return;
    boss.defeated = true; this.bossDefeats++; this.stats.bosses++;
    if (boss.damageTaken === 0) { this.combat.flawless++; boss.reward = 150; }
    this.bonusCredits += boss.reward; this._score += 1500 * this.multiplier;
    this.projectiles.length = 0; boss.aiming = false;
    this._events.push({ type: 'boss-defeat' });
  }

  takeCombatHit() {
    if (!this.combatEnabled || this.state !== 'playing' || this.abilityProtected || this.reviveGrace > 0 || this.shieldGrace > 0 || this.dashRemaining > 0 || this.surfRemaining > 0 || this.surfLandingGrace > 0 || this.powerups.ghost > 0 || this.ghostGrace > 0) return;
    if (this.powerups.shield > 0) {
      this.powerups.shield = 0; this.shieldGrace = 1; this.stats.shieldsUsed++;
      this._events.push({ type: 'shield-break' });
    } else { this.state = 'over'; this._events.push({ type: 'crash', obstacle: 'patrol' }); }
  }

  get incomingShot() {
    let nearest = null, eta = Infinity;
    for (const shot of this.projectiles) {
      const remaining = shot.travel - shot.age;
      if (!shot.removed && remaining > 0 && remaining < eta) { nearest = shot; eta = remaining; }
    }
    return nearest;
  }

  _updateProjectiles(dt) {
    if (!this.combatEnabled) { this.projectiles.length = 0; return; }
    let write = 0;
    let dodge = null;
    const damageBefore = this.boss?.damageTaken;
    for (const shot of this.projectiles) {
      if (shot.removed) continue;
      shot.age += dt;
      if (shot.age < shot.travel) { this.projectiles[write++] = shot; continue; }
      const dx = Math.abs(this.player.x - shot.targetX), dy = Math.abs(this.playerHeight - shot.targetY);
      const protectedPlayer = this.abilityProtected || this.reviveGrace > 0 || this.shieldGrace > 0 || this.dashRemaining > 0
        || this.surfRemaining > 0 || this.surfLandingGrace > 0 || this.powerups.ghost > 0 || this.ghostGrace > 0;
      const hit = dx < .27 + shot.radius / 1.82 && dy < .4 + shot.radius;
      if (hit && this.character === 'turtle' && this.abilityRemaining > 0) {
        this.damageBoss(1); this._events.push({ type: 'deflect' });
        if (this.boss?.defeated) { write = 0; break; }
      }
      if (hit && !protectedPlayer) {
        if (this.boss) this.boss.damageTaken++;
        this.combat.streak = 0;
        if (this.powerups.shield > 0) {
          this.powerups.shield = 0; this.shieldGrace = 1; this.stats.shieldsUsed++;
          this._events.push({ type: 'shield-break' });
        } else if (this.state === 'playing') {
          this.state = 'over'; this._events.push({ type: 'crash', id: shot.id, obstacle: shot.kind });
        }
      } else if (!hit && !protectedPlayer && !this.powerups.shield && shot.primary && this.state === 'playing') {
        dodge = { graze: dx < .85 && dy < 1 };
      }
    }
    this.projectiles.length = write;
    // A fan's outer round may hit after its middle round was avoided this step.
    if (dodge && this.state === 'playing' && this.boss?.damageTaken === damageBefore) {
      this.combat.dodges++; this.combat.streak++;
      this.combat.bestStreak = Math.max(this.combat.bestStreak, this.combat.streak);
      const points = (dodge.graze ? 150 : 75) * Math.min(5, this.combat.streak) * this.multiplier;
      this.combat.feedback = `${dodge.graze ? 'CLOSE CALL' : 'CLEAN DODGE'} · +${points} · streak ×${this.combat.streak}`;
      this.combat.feedbackTime = 1;
      this._score += points;
      this.dashCharge = Math.min(DASH_CHARGE, this.dashCharge + (dodge.graze ? 4 : 2));
      this._events.push({ type: dodge.graze ? 'graze' : 'dodge', points });
    }
  }

  update(dt) {
    if (this.state !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    // A suspended browser must not propel the player into unseen obstacles.
    let remaining = Math.min(dt, MAX_FRAME);
    while (remaining > 1e-9 && this.state === 'playing') {
      const step = Math.min(STEP, remaining);
      this._step(step);
      remaining -= step;
    }
  }

  drainEvents() {
    return this._events.splice(0);
  }

  snapshot() {
    return {
      state: this.state,
      mode: this.mode,
      character: this.character, weapon: this.weapon, chapterId: this.chapterId,
      abilityCooldown: this.abilityCooldown, abilityRemaining: this.abilityRemaining,
      specialCharge: this.specialCharge, campaignEnded: this.campaignEnded,
      sonicShots: this.sonicShots.map(shot => ({ ...shot, targets: shot.targets.map(target => ({ ...target })) })), enemyBolts: this.enemyBolts.map(shot => ({ ...shot })),
      modifier: this.modifier,
      bonus: this.bonus ? { ...this.bonus } : null,
      bonusCredits: this.bonusCredits,
      bonusCompleted: this.bonusCompleted,
      completed: this.completed,
      tourCleared: this.tourCleared,
      boss: this.boss ? { ...this.boss } : null,
      bossDefeats: this.bossDefeats,
      projectiles: this.projectiles.map(shot => ({ ...shot })),
      combat: { ...this.combat },
      stuntChain: this.stuntChain,
      stuntRemaining: this.stuntRemaining,
      lastStunt: this.lastStunt,
      dashCharge: this.dashCharge,
      dashRemaining: this.dashRemaining,
      distance: this.distance,
      coins: this.coins,
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      multiplier: this.multiplier,
      comboRemaining: this.comboRemaining,
      stats: { ...this.stats },
      usedRevive: this.usedRevive,
      reviveGrace: this.reviveGrace,
      elapsedTime: this.elapsedTime,
      surfRemaining: this.surfRemaining,
      surfLandingGrace: this.surfLandingGrace,
      powerups: { ...this.powerups },
      shieldGrace: this.shieldGrace,
      ghostGrace: this.ghostGrace,
      speed: this.speed,
      player: { ...this.player },
      objects: this.objects.map(object => ({ ...object })),
    };
  }

  _step(dt) {
    const p = this.player;
    this.elapsedTime += dt;
    this.combat.feedbackTime = Math.max(0, this.combat.feedbackTime - dt);
    this.stuntRemaining = Math.max(0, this.stuntRemaining - dt);
    if (this.stuntRemaining === 0) this.stuntChain = 0;
    const wasDashing = this.dashRemaining > 0;
    this.dashRemaining = Math.max(0, this.dashRemaining - dt);
    if (wasDashing && this.dashRemaining <= 1e-9) {
      this.dashRemaining = 0;
      this.reviveGrace = Math.max(this.reviveGrace, .75);
    }
    this.comboRemaining = Math.max(0, this.comboRemaining - dt);
    if (this.comboRemaining < 1e-9) {
      this.comboRemaining = 0;
      this.combo = 0;
    }
    this.reviveGrace = Math.max(0, this.reviveGrace - dt);
    this.surfLandingGrace = Math.max(0, this.surfLandingGrace - dt);
    if (this.surfRemaining > 0) {
      this.surfRemaining = Math.max(0, this.surfRemaining - dt);
      if (this.surfRemaining < 1e-9) {
        this.surfRemaining = 0;
        this.surfLandingGrace = 1.25;
        p.altitude = 0;
        this._events.push({ type: 'surfboard-end' });
      }
    }
    this.ghostGrace = Math.max(0, this.ghostGrace - dt);
    for (const power of POWERS) {
      const wasActive = this.powerups[power] > 0;
      this.powerups[power] = Math.max(0, this.powerups[power] - dt);
      if (this.powerups[power] < 1e-9) this.powerups[power] = 0;
      if (power === 'ghost' && wasActive && this.powerups.ghost === 0) this.ghostGrace = 0.65;
    }
    this.shieldGrace = Math.max(0, this.shieldGrace - dt);
    // Smooth movement uses the actual lateral position for collisions.
    p.x += (p.lane - p.x) * (1 - Math.exp(-16 * dt));
    if (Math.abs(p.lane - p.x) < 0.0001) p.x = p.lane;

    if (p.jump > 0 || this._jumpVelocity > 0) {
      p.jump += this._jumpVelocity * dt - 0.5 * this.gravity * dt * dt;
      this._jumpVelocity -= this.gravity * dt;
      if (p.jump <= 0) {
        p.jump = 0;
        p.springJump = false;
        this._jumpVelocity = 0;
      }
    }
    if (p.sliding) {
      p.slideRemaining = Math.max(0, p.slideRemaining - dt);
      p.rollProgress = Math.min(1, 1 - p.slideRemaining / SLIDE_SECONDS);
      p.sliding = p.slideRemaining > 1e-9;
      if (!p.sliding) {
        p.slideRemaining = 0;
        p.rollProgress = 1;
      }
    }

    const startSpeed = START_SPEED * (this.modifier === 'turbo' ? 1.3 : 1);
    this.speed = Math.min(MAX_SPEED, startSpeed + this.elapsedTime * this.acceleration);
    const limit = this.chapter?.length ?? (this.mode === 'tour' ? TOUR_LENGTH : Infinity);
    const movement = Math.min(this.speed * dt, Math.max(0, limit - this.distance));
    this.distance += movement;
    updateRoutes(this);
    if (!this.celebratedDistance && this.personalBest > 0 && this.distance > this.personalBest) {
      this.celebratedDistance = true;
      this._events.push({ type: 'milestone', text: 'New personal distance record!' });
    }
    this._updateBoss(dt);
    tickCombat(this, dt);
    if (this.state !== 'playing') return;
    const previousBonus = this.bonus;
    this.bonus = this.sectionAt(this.distance);
    if (previousBonus && this.distance >= previousBonus.end) {
      this.bonusCompleted++;
      this.bonusCredits += 25;
      this.reviveGrace = Math.max(this.reviveGrace, 1.25);
      this._events.push({ type: 'bonus-end' });
    }
    if (this.bonus && this.bonus.index !== previousBonus?.index) this._events.push({ type: 'bonus-start' });
    this._score += movement * this.multiplier;
    for (const object of this.objects) object.z -= movement;
    const crossesPlayer = object => !object._passed && object.z <= 0 && object.z + movement > 0;

    // Resolve pickups first so their benefit is independent of object ordering.
    for (const object of this.objects) {
      if (object.type !== 'powerup' || !crossesPlayer(object)) continue;
      object._passed = true;
      if (this.modifier === 'pure' || this.surfRemaining > 0 || Math.abs(object.lane - p.x) >= 0.43 || !POWERS.includes(object.power)) continue;
      object.collected = true;
      this.stats.powerups += 1;
      this.powerups[object.power] = this.powerDuration(object.power);
      if (object.power === 'ghost') this.ghostGrace = 0;
      this._events.push({ type: 'powerup', power: object.power });
    }

    const nearMisses = this._nearMisses;
    nearMisses.length = 0;
    for (const object of this.objects) {
      if (object.type === 'powerup' || object._passed) continue;
      const reachableRecord = Boolean(object.sky) === (this.surfRemaining > 0);
      if (object.collected) continue;
      if (object.type === 'coin' && reachableRecord && (this.powerups.magnet > 0 || this.dashRemaining > 0 || this.character === 'dub' && this.abilityRemaining > 0)
          && object.z <= MAGNET_RANGE && object.z + movement > 0) {
        this._collectCoin(object, true);
        continue;
      }
      if (!crossesPlayer(object)) continue;
      object._passed = true;
      const laneDistance = Math.abs(object.lane - p.x);
      if (object.type === 'rescue') {
        if (laneDistance < .55 && this.surfRemaining === 0) { object.collected = true; this.stats.rescues++; this._events.push({ type: 'rescue' }); }
        continue;
      }
      if (object.type === 'enemy') {
        if (laneDistance < .55 && p.jump < 1.3 && !this.surfRemaining) {
          if (this.character === 'shark' && this.abilityRemaining > 0 || this.dashRemaining > 0) {
            object._passed = false; defeatEnemy(this, object); object._passed = true;
          } else this.takeCombatHit();
        }
        if (this.state !== 'playing') break;
        continue;
      }
      if (object.type === 'energy') {
        if (laneDistance < .43 && this.boss && !this.boss.defeated && object.bossStage === this.boss.stage) {
          object.collected = true;
          this.boss.charge = Math.min(3, this.boss.charge + 1);
          this._events.push({ type: 'boss-charge' });
        }
        continue;
      }
      if (object.type === 'coin') {
        const height = object.height ?? 0.85;
        if (reachableRecord && laneDistance < 0.43 && Math.abs(height - (0.85 + p.altitude + p.jump)) <= 0.85) {
          this._collectCoin(object);
        }
        continue;
      }
      // Neighbouring hazards overlap slightly so a lane change cannot squeeze
      // through a blocked pair. Coins retain their smaller collection radius.
      if (laneDistance >= 0.55) {
        if (laneDistance < 1.08 && OBSTACLES.includes(object.type) && !object.sky
            && p.jump === 0 && p.altitude === 0 && this.surfRemaining === 0 && this.surfLandingGrace === 0
            && this.powerups.ghost === 0 && this.ghostGrace === 0 && this.powerups.shield === 0
            && this.shieldGrace === 0 && this.reviveGrace === 0 && this.dashRemaining === 0 && !this.abilityProtected) nearMisses.push(object);
        continue;
      }
      if (this.abilityProtected && ['shark', 'turtle'].includes(this.character) && !this.surfRemaining && OBSTACLES.includes(object.type)) this.stats.mastery++;
      const cleared = this.abilityProtected || this.dashRemaining > 0 || this.reviveGrace > 0 || this.surfRemaining > 0 || this.surfLandingGrace > 0
        || this.powerups.ghost > 0 || this.ghostGrace > 0
        || (['barrier', 'crate', 'buoy'].includes(object.type) && p.jump >= 0.85)
        || (['tram', 'cart'].includes(object.type) && p.springJump && p.jump >= 2.3)
        // The green hurdle is 2.05m tall. A powered jump can go over it,
        // as well as a roll going underneath; it is not an infinite wall.
        || (object.type === 'gate' && p.springJump && p.jump >= 2.15)
        || (object.type === 'gate' && p.sliding && p.jump === 0);
      if (this.character === 'shark' && this.abilityRemaining > 0 && !this.surfRemaining && OBSTACLES.includes(object.type)) {
        object.collected = true; this._events.push({ type: 'smash' });
      }
      if (cleared && OBSTACLES.includes(object.type)
          && !this.dashRemaining && !this.reviveGrace && !this.surfRemaining && !this.surfLandingGrace
          && !this.powerups.ghost && !this.ghostGrace && !this.shieldGrace && !this.abilityProtected
          && (p.jump >= .85 || (object.type === 'gate' && p.sliding))) {
        this.stuntChain = Math.min(5, this.stuntChain + 1);
        this.stuntRemaining = 5;
        this.stats.stunts++;
        this.lastStunt = p.sliding ? 'Limbo roll' : p.springJump ? 'Super vault' : 'Clean vault';
        const points = 100 * this.stuntChain * this.multiplier;
        this._score += points;
        this.dashCharge = Math.min(DASH_CHARGE, this.dashCharge + 3);
        this._events.push({ type: 'stunt', points });
      }
      if (!cleared) {
        this.stuntChain = 0;
        this.stuntRemaining = 0;
        if (this.shieldGrace > 0) continue;
        if (this.powerups.shield > 0) {
          this.powerups.shield = 0;
          this.shieldGrace = 1;
          this.stats.shieldsUsed += 1;
          this._events.push({ type: 'shield-break' });
          continue;
        }
        this.state = 'over';
        this._events.push({ type: 'crash', id: object.id, obstacle: object.type });
        break;
      }
    }
    let live = 0;
    for (const object of this.objects) if (object.z > -10 && !object.collected) this.objects[live++] = object;
    this.objects.length = live;
    if (this.state === 'playing') this._updateProjectiles(dt);
    if (this.state === 'playing') {
      for (const object of nearMisses) {
        const bonus = 50 * this.multiplier;
        this._score += bonus;
        this.stats.nearMisses += 1;
        this._events.push({ type: 'near-miss', id: object.id, bonus });
      }
      this._fillTrack();
      if (this.surfRemaining > 0) this._fillSky();
      if (this.mode === 'tour') {
        while (this.tourCleared < 3 && this.distance >= (this.tourCleared + 1) * 750) {
          const stage = tourAt(this.tourCleared * 750);
          this.tourCleared++;
          this.bonusCredits += stage.reward;
          this._score += 1000 * this.multiplier;
          this.reviveGrace = Math.max(this.reviveGrace, 1.25);
          this._events.push({ type: 'checkpoint' });
        }
        if (this.distance >= TOUR_LENGTH) {
          this.completed = true;
          this.state = 'over';
          this._events.push({ type: 'finish' });
        }
      }
      if (this.chapter && this.distance >= this.chapter.length) {
        this.campaignEnded = true;
        this.completed = objectiveProgress(this).complete;
        this.state = 'over';
        this._events.push({ type: this.completed ? 'finish' : 'mission-failed' });
      }
    }
  }

  _collectCoin(object, magnetic = false) {
    object.collected = true;
    object._passed = true;
    if (object.pearl) { this.bonusCredits += 10; this._score += 100 * this.multiplier; }
    else { this.coins += this.modifier === 'rich' ? 2 : 1; this.stats.records += 1; }
    this.dashCharge = Math.min(DASH_CHARGE, this.dashCharge + 1);
    if (this.combatEnabled) this.specialCharge = Math.min(100, this.specialCharge + 1);
    if (this.abilityRemaining > 0 && ['dub', 'octo'].includes(this.character)) this.stats.mastery++;
    this.combo += 1;
    if (this.combo >= 48 && !this.celebratedCombo && !this.hasFiveCombo) {
      this.celebratedCombo = true;
      this._events.push({ type: 'milestone', text: 'Your first ×5 combo!' });
    }
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboRemaining = this.comboDuration;
    this._score += 10 * this.multiplier;
    const event = { type: 'coin', id: object.id };
    if (magnetic) {
      event.magnetic = true;
      event.from = { lane: object.lane, z: object.z, height: object.height ?? 0.85 };
    }
    this._events.push(event);
  }

  _random(source = this.random) {
    // Injected sources are clamped so even endpoint values produce valid lanes.
    const value = source();
    return Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0.5;
  }

  _add(type, lane, absoluteZ, extra = {}) {
    this.objects.push({ id: this._nextId++, type, lane, z: absoluteZ - this.distance, ...extra });
  }

  _fillTrack() {
    updateRoutes(this);
    while (this._nextRow < this.distance + LOOK_AHEAD) {
      const row = this._nextRow;
      if (this.mode !== 'story') {
        const fork = forkAt(Math.floor(row / 750));
        if (row >= fork.start && row < fork.end && !this.routeChoices.has(fork.index)) break;
        // A clear plaza lets players choose a branch without dodging through
        // the decision line. Keep all lanes open through the entrance too.
        if (row >= fork.approach && row < fork.entranceEnd) {
          for (const lane of LANES) this._add('coin', lane, row);
          this._nextRow = Math.min(fork.entranceEnd, row + 12);
          continue;
        }
        const route = routeAt(this, row);
        if (route) {
          // Count generated rows: distance-based beats skip lanes at high speed.
          const beat = this._routeRows.get(route.index) ?? 0;
          this._routeRows.set(route.index, beat + 1);
          const safe = [-1, 0, 1, 0][beat % 4];
          for (const lane of LANES) if (lane !== safe) {
            const type = route.id === 'reef' ? 'buoy' : route.id === 'roof' ? (beat % 2 ? 'gate' : 'crate') : 'cart';
            this._add(type, lane, row);
          }
          for (let i = 0; i < 6; i++) this._add('coin', safe, row - 10 + i * 2);
          // Optional aerial records reward jumping over the roof/reef hazards.
          if (route.id !== 'dock') this._add('coin', (safe + 2) % 3 - 1, row, { height: 1.85 });
          const arrivalSpeed = Math.min(MAX_SPEED,
            Math.sqrt(this.speed * this.speed + 2 * this.acceleration * Math.max(0, row - this.distance)));
          this._nextRow += Math.max(24, arrivalSpeed * 1.35);
          // Leave room to read the first main-road row after a detour.
          if (this._nextRow >= route.end) this._nextRow = Math.max(this._nextRow, route.end + 20);
          continue;
        }
      }
      if (this.mode === 'tour') {
        if (row >= TOUR_LENGTH) break;
        const stage = tourAt(row);
        if (stage.index > 0 && row < stage.start + 45) { this._nextRow = stage.start + 45; continue; }
      }
      if (this.chapter && row >= this.chapter.length) break;
      if (this.chapter?.boss !== undefined) {
        const stage = this.tourAtDistance(row);
        // Give every boss a readable entrance and each checkpoint a breather.
        if (row < stage.start + 45 && stage.index > 0) { this._nextRow = stage.start + 45; continue; }
        if (row >= stage.bossStart - 35 && row < stage.bossStart + 30) { this._nextRow = stage.bossStart + 30; continue; }
        if (stage.encounter) {
          const beat = Math.max(0, Math.floor((row - stage.bossStart - 30) / 36));
          const safeLane = [0, -1, 0, 1][beat % 4];
          const defeated = this.boss?.stage === stage.index && this.boss.defeated;
          if (!defeated) this._add('energy', safeLane, row - 10, { bossStage: stage.index, color: stage.color });
          for (let i = 0; i < 3; i++) this._add('coin', safeLane, row - 10 + i * 4);
          this._nextRow += Math.max(36, this.speed * 1.25);
          continue;
        }
      }
      const bonus = this.sectionAt(row);
      if (bonus) {
        const spacing = Math.max(6, this.speed * .24);
        for (let i = 0; i < 3; i++) {
          const z = row + i * spacing;
          if (z >= bonus.end) break;
          for (const lane of LANES) {
            this._add('coin', lane, z, { bonus: true, pearl: bonus.id === 'pearl' && lane === (Math.floor(row / 20) % 3) - 1 && i === 1 });
          }
        }
        this._nextRow += spacing * 3 + 6;
        continue;
      }
      if (this.sectionAt(row - 30)) { this._nextRow += Math.max(30, this.speed * 1.25); continue; }
      const safeLane = LANES[Math.floor(this._random() * LANES.length)];
      const candidates = LANES.filter(lane => lane !== safeLane);
      const primaryLane = candidates[Math.floor(this._random() * candidates.length)];
      const difficulty = Math.min(1, this.elapsedTime / 120);
      const obstacle = OBSTACLES[Math.floor(this._random() * OBSTACLES.length)];
      if (this.combatEnabled && row > 120 && this._rowCount % 4 === 0) {
        const kind = ['drone', 'sentry', 'brute'][Math.floor(this._rowCount / 4) % 3];
        const hp = kind === 'brute' ? 3 : kind === 'sentry' ? 2 : 1;
        this._add('enemy', primaryLane, row, { kind, hp, maxHP: hp });
      } else this._add(obstacle, primaryLane, row);
      // Expected hazards per row were 1 + (0.2 + difficulty * 0.2).
      // Keep the denser two-lane patterns and reserve a clear route.
      const secondObstacleChance = (1 + 0.2 + difficulty * 0.2) * OBSTACLE_PRESSURE - 1;
      if (this._random() < secondObstacleChance) {
        const otherLane = candidates.find(lane => lane !== primaryLane);
        this._add(OBSTACLES[Math.floor(this._random() * OBSTACLES.length)], otherLane, row);
      }
      // Every row reserves a clear, coin-marked lane.
      this._rowCount += 1;
      if (this.chapter?.objective === 'rescues' && this._rowCount % 7 === 0) this._add('rescue', safeLane, row - 5);
      if (this._rowCount % POWERUP_EVERY_ROWS === 0 && this.modifier !== 'pure') {
        // Keep the pickup on its own row's guaranteed safe lane. Offsetting
        // it backwards placed it inside the preceding row's obstacles.
        this._add('powerup', safeLane, row, { power: POWERS[this._nextPower] });
        this._nextPower = (this._nextPower + 1) % POWERS.length;
      }
      for (let i = 0; i < 4; i += 1) this._add('coin', safeLane, row - 9 + i * 3);
      // Keep rows closer together while scaling the reaction gap with speed.
      const arrivalSpeed = Math.min(MAX_SPEED,
        Math.sqrt(this.speed * this.speed + 2 * this.acceleration * (row - this.distance)));
      this._nextRow += (Math.max(17, arrivalSpeed * .82) + this._random() * 5) / DIFFICULTY_PRESSURE;
    }
  }

  _fillSky() {
    // Predict the remaining flight distance, including acceleration and its cap.
    const seconds = Math.max(0, this.surfRemaining - 0.2);
    const accelerating = this.acceleration === 0 ? seconds : Math.min(seconds, (MAX_SPEED - this.speed) / this.acceleration);
    const flightEnd = Math.min(this._skyEnd, this.chapter?.length ?? (this.mode === 'tour' ? TOUR_LENGTH : Infinity),
      this.distance + this.speed * accelerating
      + this.acceleration * accelerating * accelerating / 2 + MAX_SPEED * (seconds - accelerating));
    const horizon = Math.min(this.distance + Math.max(LOOK_AHEAD, this.speed * 6), flightEnd);
    while (this._nextSky < horizon && this._skyRecordCount < SURFBOARD_RECORD_LIMIT) {
      const arrivalSpeed = Math.min(MAX_SPEED,
        Math.sqrt(this.speed * this.speed + 2 * this.acceleration * (this._nextSky - this.distance)));
      const spacing = Math.max(3.4, arrivalSpeed * 0.23);
      for (let i = 0; i < 6 && this._skyRecordCount < SURFBOARD_RECORD_LIMIT; i += 1) {
        if (this._nextSky >= flightEnd) break;
        this._add('coin', this._skyLane, this._nextSky, { sky: true, height: SURFBOARD_HEIGHT + 0.85 });
        this._skyRecordCount += 1;
        this._nextSky += spacing;
      }
      // Every turn is one lane; leave a visible gap after each six-record run.
      this._nextSky += Math.max(12, arrivalSpeed * 0.9);
      this._skyLane = this._skyLane === 0 ? (this._random(this._skyRandomSource) < 0.5 ? -1 : 1) : 0;
    }
  }
}
