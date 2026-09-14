const LANES = [-1, 0, 1];
const START_SPEED = 12;
const MAX_SPEED = 22;
const JUMP_VELOCITY = 8.2;
const GRAVITY = 16;
const SLIDE_SECONDS = 0.85;
const FIRST_ROW = 100;
const LOOK_AHEAD = 210;
const MAX_FRAME = 0.1;
const STEP = 1 / 120;
const POWERS = ['magnet', 'shield', 'double'];
const MAGNET_RANGE = 12;

/** Small, rendering-independent simulation. All distances are in metres. */
export class Game {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.reset();
  }

  reset() {
    this.state = 'ready';
    this.distance = 0;
    this.coins = 0;
    this.flow = 0;
    this.dubRemaining = 0;
    this.powerups = { magnet: 0, shield: 0 };
    this.shieldGrace = 0;
    this.speed = START_SPEED;
    this.player = {
      lane: 0,
      x: 0,
      jump: 0,
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

  action(name) {
    if (this.state !== 'playing') return false;
    const p = this.player;
    if (name === 'left' || name === 'right') {
      const lane = Math.max(-1, Math.min(1, p.lane + (name === 'left' ? -1 : 1)));
      if (lane === p.lane) return false;
      p.lane = lane;
      return true;
    }
    if (name === 'jump' && p.jump === 0 && !p.sliding) {
      this._jumpVelocity = JUMP_VELOCITY;
      // A tiny positive height distinguishes takeoff from standing still.
      p.jump = 0.0001;
      this._events.push({ type: 'jump' });
      return true;
    }
    if ((name === 'slide' || name === 'roll') && p.jump === 0 && !p.sliding) {
      p.sliding = true;
      p.slideRemaining = SLIDE_SECONDS;
      p.rollProgress = 0;
      this._events.push({ type: 'slide' });
      return true;
    }
    return false;
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
      flow: this.flow,
      dubRemaining: this.dubRemaining,
      powerups: { ...this.powerups },
      shieldGrace: this.shieldGrace,
      speed: this.speed,
      player: { ...this.player },
      objects: this.objects.map(object => ({ ...object })),
    };
  }

  _step(dt) {
    const p = this.player;
    this.dubRemaining = Math.max(0, this.dubRemaining - dt);
    this.powerups.magnet = Math.max(0, this.powerups.magnet - dt);
    this.powerups.shield = Math.max(0, this.powerups.shield - dt);
    this.shieldGrace = Math.max(0, this.shieldGrace - dt);
    // Smooth movement uses the actual lateral position for collisions.
    p.x += (p.lane - p.x) * (1 - Math.exp(-16 * dt));
    if (Math.abs(p.lane - p.x) < 0.0001) p.x = p.lane;

    if (p.jump > 0 || this._jumpVelocity > 0) {
      p.jump += this._jumpVelocity * dt - 0.5 * GRAVITY * dt * dt;
      this._jumpVelocity -= GRAVITY * dt;
      if (p.jump <= 0) {
        p.jump = 0;
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

    this.speed = Math.min(MAX_SPEED, START_SPEED + this.distance / 700);
    const movement = this.speed * dt;
    this.distance += movement;
    for (const object of this.objects) object.z -= movement;
    const crossesPlayer = object => !object._passed && object.z <= 0 && object.z + movement > 0;

    // Resolve pickups first so their benefit is independent of object ordering.
    for (const object of this.objects) {
      if (object.type !== 'powerup' || !crossesPlayer(object)) continue;
      object._passed = true;
      if (Math.abs(object.lane - p.x) >= 0.43) continue;
      object.collected = true;
      if (object.power === 'double') {
        this.dubRemaining = 10;
        this.flow = 0;
      } else if (object.power === 'magnet') this.powerups.magnet = 10;
      else if (object.power === 'shield') this.powerups.shield = 12;
      this._events.push({ type: 'powerup', power: object.power });
    }

    for (const object of this.objects) {
      if (object.type === 'powerup' || object._passed) continue;
      if (object.type === 'coin' && this.powerups.magnet > 0
          && object.z <= MAGNET_RANGE && object.z + movement > 0) {
        this._collectCoin(object, true);
        continue;
      }
      if (!crossesPlayer(object)) continue;
      object._passed = true;
      const laneDistance = Math.abs(object.lane - p.x);
      if (object.type === 'coin') {
        const height = object.height ?? 0.85;
        if (laneDistance < 0.43 && Math.abs(height - (0.85 + p.jump)) <= 0.85) {
          this._collectCoin(object);
        } else if (this.dubRemaining === 0) {
          this.flow = 0;
        }
        continue;
      }
      // Neighbouring hazards overlap slightly so a lane change cannot squeeze
      // through a blocked pair. Coins retain their smaller collection radius.
      if (laneDistance >= 0.55) continue;
      const cleared = (object.type === 'barrier' && p.jump >= 0.85)
        || (object.type === 'gate' && p.sliding);
      if (!cleared) {
        if (this.shieldGrace > 0) continue;
        if (this.powerups.shield > 0) {
          this.powerups.shield = 0;
          this.shieldGrace = 1;
          this._events.push({ type: 'shield-break' });
          continue;
        }
        this.state = 'over';
        this._events.push({ type: 'crash', id: object.id, obstacle: object.type });
        break;
      }
    }
    this.objects = this.objects.filter(object => object.z > -10 && !object.collected);
    if (this.state === 'playing') this._fillTrack();
  }

  _collectCoin(object, magnetic = false) {
    object.collected = true;
    object._passed = true;
    this.coins += this.dubRemaining > 0 ? 2 : 1;
    const event = { type: 'coin', id: object.id };
    if (magnetic) {
      event.magnetic = true;
      event.from = { lane: object.lane, z: object.z, height: object.height ?? 0.85 };
    }
    this._events.push(event);
    if (this.dubRemaining === 0) {
      this.flow += 1;
      if (this.flow === 8) {
        this.flow = 0;
        this.dubRemaining = 10;
        this._events.push({ type: 'dub' });
      }
    }
  }

  _random() {
    // Injected sources are clamped so even endpoint values produce valid lanes.
    const value = this.random();
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
      const difficulty = Math.min(1, this.distance / 1400);
      const types = ['barrier', 'gate', 'tram'];
      this._add(types[Math.floor(this._random() * types.length)], primaryLane, row);
      if (this._random() < 0.12 + difficulty * 0.2) {
        const otherLane = candidates.find(lane => lane !== primaryLane);
        this._add(types[Math.floor(this._random() * types.length)], otherLane, row);
      }
      // Every row reserves a clear, coin-marked lane, with a long reaction gap.
      this._rowCount += 1;
      if (this._rowCount % 3 === 0) {
        this._add('powerup', safeLane, row - 22, { power: POWERS[this._nextPower] });
        this._nextPower = (this._nextPower + 1) % POWERS.length;
      }
      for (let i = 0; i < 4; i += 1) this._add('coin', safeLane, row - 16 + i * 6);
      this._nextRow += 35 + this._random() * 13;
    }
  }
}
