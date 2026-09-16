const LANES = [-1, 0, 1];
export const START_SPEED = 12;
export const MAX_SPEED = 100;
export const SPEED_GAIN = 0.18;
const OBSTACLE_PRESSURE = 1.33;
export const REVIVE_COST = 75;
export const COMBO_SECONDS = 6;
export const SURFBOARD_COST = 200;
export const SURFBOARD_SECONDS = 20;
export const SURFBOARD_HEIGHT = 4.2;
export const POWERUP_DURATIONS = Object.freeze({ magnet: 10, shield: 12, ghost: 6, spring: 12 });
const SURFBOARD_RECORD_LIMIT = 96;
const JUMP_VELOCITY = 8.2;
const SPRING_JUMP_VELOCITY = 10.8;
const GRAVITY = 16;
const SLIDE_SECONDS = 0.85;
const FIRST_ROW = 100;
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
  constructor({ random = Math.random, seed } = {}) {
    this.seed = seed;
    this._providedRandom = random;
    this.reset();
  }

  reset() {
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
    this.stats = { records: 0, jumps: 0, rolls: 0, powerups: 0, nearMisses: 0, flights: 0, shieldsUsed: 0 };
    this.usedRevive = false;
    this.reviveGrace = 0;
    this.elapsedTime = 0;
    this.surfRemaining = 0;
    this.surfLandingGrace = 0;
    this.powerups = Object.fromEntries(POWERS.map(power => [power, 0]));
    this.shieldGrace = 0;
    this.ghostGrace = 0;
    this.speed = START_SPEED;
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
    this._skyLane = 0;
    this._skyRecordCount = 0;
    this._add('powerup', 0, 65, { power: 'magnet' });
    this._fillTrack();
  }

  start() {
    if (this.state === 'playing') return false;
    this.reset();
    this.state = 'playing';
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

  get multiplier() {
    return Math.min(5, 1 + Math.floor(this.combo / 12));
  }

  revive() {
    if (this.state !== 'over' || this.usedRevive || this.coins < REVIVE_COST) return false;
    this.coins -= REVIVE_COST;
    this.usedRevive = true;
    this.reviveGrace = 2;
    this.objects = this.objects.filter(object => !(OBSTACLES.includes(object.type)
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
    if ((name === 'slide' || name === 'roll') && p.jump === 0 && !p.sliding) {
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
    this.surfRemaining = SURFBOARD_SECONDS;
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
    this._fillSky();
    this._events.push({ type: 'surfboard' });
    return true;
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
      p.jump += this._jumpVelocity * dt - 0.5 * GRAVITY * dt * dt;
      this._jumpVelocity -= GRAVITY * dt;
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

    this.speed = speedAtTime(this.elapsedTime);
    const movement = this.speed * dt;
    this.distance += movement;
    this._score += movement * this.multiplier;
    for (const object of this.objects) object.z -= movement;
    const crossesPlayer = object => !object._passed && object.z <= 0 && object.z + movement > 0;

    // Resolve pickups first so their benefit is independent of object ordering.
    for (const object of this.objects) {
      if (object.type !== 'powerup' || !crossesPlayer(object)) continue;
      object._passed = true;
      if (this.surfRemaining > 0 || Math.abs(object.lane - p.x) >= 0.43 || !POWERS.includes(object.power)) continue;
      object.collected = true;
      this.stats.powerups += 1;
      this.powerups[object.power] = POWERUP_DURATIONS[object.power];
      if (object.power === 'ghost') this.ghostGrace = 0;
      this._events.push({ type: 'powerup', power: object.power });
    }

    const nearMisses = [];
    for (const object of this.objects) {
      if (object.type === 'powerup' || object._passed) continue;
      const reachableRecord = Boolean(object.sky) === (this.surfRemaining > 0);
      if (object.type === 'coin' && reachableRecord && this.powerups.magnet > 0
          && object.z <= MAGNET_RANGE && object.z + movement > 0) {
        this._collectCoin(object, true);
        continue;
      }
      if (!crossesPlayer(object)) continue;
      object._passed = true;
      const laneDistance = Math.abs(object.lane - p.x);
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
            && this.shieldGrace === 0 && this.reviveGrace === 0) nearMisses.push(object);
        continue;
      }
      const cleared = this.reviveGrace > 0 || this.surfRemaining > 0 || this.surfLandingGrace > 0
        || this.powerups.ghost > 0 || this.ghostGrace > 0
        || (['barrier', 'crate', 'buoy'].includes(object.type) && p.jump >= 0.85)
        || (['tram', 'cart'].includes(object.type) && p.springJump && p.jump >= 2.3)
        // The green hurdle is 2.05m tall. A powered jump can go over it,
        // as well as a roll going underneath; it is not an infinite wall.
        || (object.type === 'gate' && p.springJump && p.jump >= 2.15)
        || (object.type === 'gate' && p.sliding);
      if (!cleared) {
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
    this.objects = this.objects.filter(object => object.z > -10 && !object.collected);
    if (this.state === 'playing') {
      for (const object of nearMisses) {
        const bonus = 50 * this.multiplier;
        this._score += bonus;
        this.stats.nearMisses += 1;
        this._events.push({ type: 'near-miss', id: object.id, bonus });
      }
      this._fillTrack();
      if (this.surfRemaining > 0) this._fillSky();
    }
  }

  _collectCoin(object, magnetic = false) {
    object.collected = true;
    object._passed = true;
    this.coins += 1;
    this.stats.records += 1;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboRemaining = COMBO_SECONDS;
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
    while (this._nextRow < this.distance + LOOK_AHEAD) {
      const row = this._nextRow;
      const safeLane = LANES[Math.floor(this._random() * LANES.length)];
      const candidates = LANES.filter(lane => lane !== safeLane);
      const primaryLane = candidates[Math.floor(this._random() * candidates.length)];
      const difficulty = Math.min(1, this.elapsedTime / 120);
      this._add(OBSTACLES[Math.floor(this._random() * OBSTACLES.length)], primaryLane, row);
      // Expected hazards per row were 1 + (0.2 + difficulty * 0.2).
      // Increase that total by 33%, keeping the reserved lane and row spacing.
      const secondObstacleChance = (1 + 0.2 + difficulty * 0.2) * OBSTACLE_PRESSURE - 1;
      if (this._random() < secondObstacleChance) {
        const otherLane = candidates.find(lane => lane !== primaryLane);
        this._add(OBSTACLES[Math.floor(this._random() * OBSTACLES.length)], otherLane, row);
      }
      // Every row reserves a clear, coin-marked lane, with a long reaction gap.
      this._rowCount += 1;
      if (this._rowCount % 4 === 0) {
        this._add('powerup', safeLane, row - 22, { power: POWERS[this._nextPower] });
        this._nextPower = (this._nextPower + 1) % POWERS.length;
      }
      for (let i = 0; i < 4; i += 1) this._add('coin', safeLane, row - 16 + i * 6);
      // At top speed, preserve at least 1.25 seconds between hazard rows.
      const arrivalSpeed = Math.min(MAX_SPEED,
        Math.sqrt(this.speed * this.speed + 2 * SPEED_GAIN * (row - this.distance)));
      this._nextRow += Math.max(31, arrivalSpeed * 1.25) + this._random() * 10;
    }
  }

  _fillSky() {
    // Predict the remaining flight distance, including acceleration and its cap.
    const seconds = Math.max(0, this.surfRemaining - 0.2);
    const accelerating = Math.min(seconds, (MAX_SPEED - this.speed) / SPEED_GAIN);
    const flightEnd = this.distance + this.speed * accelerating
      + SPEED_GAIN * accelerating * accelerating / 2 + MAX_SPEED * (seconds - accelerating);
    const horizon = Math.min(this.distance + Math.max(LOOK_AHEAD, this.speed * 6), flightEnd);
    while (this._nextSky < horizon && this._skyRecordCount < SURFBOARD_RECORD_LIMIT) {
      const arrivalSpeed = Math.min(MAX_SPEED,
        Math.sqrt(this.speed * this.speed + 2 * SPEED_GAIN * (this._nextSky - this.distance)));
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
