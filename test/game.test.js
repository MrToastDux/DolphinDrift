import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, SURFBOARD_COST, SURFBOARD_SECONDS, SURFBOARD_HEIGHT, POWERUP_DURATIONS } from '../src/game.js';

const HAZARDS = ['barrier', 'gate', 'tram', 'crate', 'buoy', 'cart'];

function advance(game, seconds) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 1 / 60) {
    game.update(Math.min(1 / 60, seconds - elapsed));
  }
}

function emptyGame() {
  const game = new Game({ random: () => 0.5 });
  game.start();
  game.objects = [];
  game._nextRow = 10000;
  game.drainEvents();
  return game;
}

test('ready, pause, resume, and reset preserve their invariants', () => {
  const game = new Game({ random: () => 0.5 });
  const ready = game.snapshot();
  game.update(0.1);
  assert.deepEqual(game.snapshot(), ready);
  assert.equal(game.action('jump'), false);
  game.start();
  assert.equal(game.state, 'playing');
  assert.deepEqual(game.drainEvents(), [{ type: 'start' }]);
  advance(game, 1);
  game.pause();
  const paused = game.snapshot();
  advance(game, 1);
  assert.equal(game.action('left'), false);
  assert.deepEqual(game.snapshot(), paused);
  game.resume();
  game.update(0.1);
  assert.ok(game.distance > paused.distance);
  game.reset();
  assert.deepEqual(game.snapshot(), ready);
  assert.deepEqual(game.drainEvents(), []);
});

test('track has a generous warmup and always leaves an obstacle-free lane', () => {
  for (const seedValue of [0, 0.1, 0.5, 0.9, 1]) {
    const game = new Game({ random: () => seedValue });
    assert.ok(Math.min(...game.objects.filter(object => object.type !== 'powerup').map(object => object.z)) > 12 * 6);
    const rows = new Map();
    for (const object of game.objects.filter(object => HAZARDS.includes(object.type))) {
      const lanes = rows.get(object.z) ?? new Set();
      lanes.add(object.lane);
      rows.set(object.z, lanes);
    }
    assert.ok(rows.size > 1);
    for (const lanes of rows.values()) assert.ok(lanes.size <= 2);
    assert.ok(game.objects.every(object => [-1, 0, 1].includes(object.lane)));
  }
});

test('lane changes are bounded, smooth, and use physical position for contact', () => {
  const game = emptyGame();
  game.action('right');
  assert.equal(game.player.lane, 1);
  assert.equal(game.player.x, 0);
  assert.equal(game.action('right'), false);
  advance(game, 0.25);
  assert.ok(game.player.x > 0.97 && game.player.x <= 1);
  game.objects = [{ id: 1, type: 'tram', lane: 0, z: 0.5 }];
  advance(game, 0.1);
  assert.equal(game.state, 'playing');
  game.action('left');
  game.action('left');
  assert.equal(game.player.lane, -1);
  assert.equal(game.action('left'), false);
});

test('barriers crash a grounded player and a well-timed jump clears them', () => {
  const grounded = emptyGame();
  grounded.objects = [{ id: 1, type: 'barrier', lane: 0, z: 4 }];
  advance(grounded, 0.5);
  assert.equal(grounded.state, 'over');
  assert.equal(grounded.drainEvents().filter(event => event.type === 'crash').length, 1);
  const frozen = grounded.snapshot();
  advance(grounded, 1);
  assert.deepEqual(grounded.snapshot(), frozen);

  const jumping = emptyGame();
  jumping.objects = [{ id: 1, type: 'barrier', lane: 0, z: 4 }];
  assert.equal(jumping.action('jump'), true);
  assert.equal(jumping.action('jump'), false);
  advance(jumping, 0.5);
  assert.equal(jumping.state, 'playing');
  assert.ok(jumping.player.jump > 1.9 && jumping.player.jump < 2.2);
  advance(jumping, 0.6);
  assert.equal(jumping.player.jump, 0);
});

test('changing lanes cannot pass through the gap between adjacent hazards', () => {
  for (const direction of [-1, 1]) {
    for (const type of HAZARDS) {
      const game = emptyGame();
      game.objects = [
        { id: 1, type, lane: 0, z: 0.6 },
        { id: 2, type, lane: direction, z: 0.6 },
      ];
      game.action(direction === 1 ? 'right' : 'left');
      game.update(0.05);
      assert.ok(Math.abs(game.player.x) > 0.43 && Math.abs(game.player.x) < 0.57);
      assert.equal(game.state, 'over', `${type} pair must block a move ${direction}`);
      assert.equal(game.drainEvents().filter(event => event.type === 'crash').length, 1);
    }
  }

  const coins = emptyGame();
  coins.objects = [
    { id: 1, type: 'coin', lane: 0, z: 0.6 },
    { id: 2, type: 'coin', lane: 1, z: 0.6 },
  ];
  coins.action('right');
  coins.update(0.05);
  assert.equal(coins.state, 'playing');
  assert.equal(coins.coins, 0, 'coin collection must keep its narrower radius');
});

test('without super jump, gates require sliding and trams cannot be jumped', () => {
  for (const action of [null, 'jump', 'slide']) {
    const game = emptyGame();
    game.objects = [{ id: 1, type: 'gate', lane: 0, z: 4 }];
    if (action) game.action(action);
    advance(game, 0.5);
    assert.equal(game.state, action === 'slide' ? 'playing' : 'over');
  }
  const game = emptyGame();
  game.objects = [{ id: 1, type: 'tram', lane: 0, z: 4 }];
  game.action('jump');
  advance(game, 0.5);
  assert.equal(game.state, 'over');
});

test('slides expire, do not stack, and cannot be combined with a jump', () => {
  const game = emptyGame();
  assert.equal(game.action('slide'), true);
  assert.equal(game.action('slide'), false);
  assert.equal(game.action('jump'), false);
  advance(game, 0.9);
  assert.equal(game.player.sliding, false);
  assert.equal(game.player.slideRemaining, 0);
  assert.equal(game.action('jump'), true);
  assert.equal(game.action('slide'), false);
});

test('coins require the matching lane and reachable height and collect once', () => {
  const game = emptyGame();
  game.objects = [
    { id: 1, type: 'coin', lane: 0, z: 1 },
    { id: 2, type: 'coin', lane: 1, z: 1 },
    { id: 3, type: 'coin', lane: 0, z: 1, height: 3 },
  ];
  advance(game, 0.5);
  assert.equal(game.coins, 1);
  assert.deepEqual(game.drainEvents(), [{ type: 'coin', id: 1 }]);
  advance(game, 1);
  assert.equal(game.coins, 1);
  assert.deepEqual(game.drainEvents(), []);

  const jumping = emptyGame();
  jumping.objects = [{ id: 1, type: 'coin', lane: 0, z: 6 }];
  jumping.action('jump');
  advance(jumping, 0.6);
  assert.equal(jumping.coins, 0);
});

test('long frames are capped, invalid deltas are ignored, and crossing cannot tunnel', () => {
  const game = emptyGame();
  const before = game.snapshot();
  for (const delta of [NaN, Infinity, -1, 0]) game.update(delta);
  assert.deepEqual(game.snapshot(), before);
  game.update(20);
  assert.ok(game.distance <= 1.21);
  game.objects = [{ id: 1, type: 'tram', lane: 0, z: 0.01 }];
  game.update(0.1);
  assert.equal(game.state, 'over');
});

test('records always count once, without a streak multiplier or double power-up', () => {
  const game = emptyGame();
  for (let id = 0; id < 24; id += 1) {
    game.objects = [{ id, type: 'coin', lane: 0, z: 0.1 }];
    game.update(0.02);
  }
  assert.equal(game.coins, 24);
  assert.equal(game.drainEvents().filter(event => event.type !== 'coin').length, 0);
  pickup(game, 'double');
  assert.deepEqual(game.drainEvents(), []);
  assert.equal('dubRemaining' in game.snapshot(), false);
  assert.equal('flow' in game.snapshot(), false);
});

test('restarting after a crash clears score, movement and pending events', () => {
  const game = emptyGame();
  game.coins = 7;
  game.objects = [{ id: 1, type: 'tram', lane: 0, z: 0.1 }];
  game.update(0.1);
  assert.equal(game.state, 'over');
  game.start();
  assert.equal(game.state, 'playing');
  assert.equal(game.coins, 0);
  assert.equal(game.distance, 0);
  assert.equal(game.speed, 12);
  assert.equal(game.player.x, 0);
  assert.deepEqual(game.drainEvents(), [{ type: 'start' }]);
});

function pickup(game, power) {
  game.objects = [{ id: 100, type: 'powerup', power, lane: 0, z: 0.1 }];
  game.update(0.02);
}

test('power-ups begin with a center magnet, then cycle all four powers every fourth clear row', () => {
  const game = new Game({ random: () => 0.5 });
  game.start();
  const first = game.objects.find(object => object.type === 'powerup');
  assert.equal(first.power, 'magnet');
  assert.equal(first.lane, 0);
  assert.equal(first.z, 65);
  const seen = new Map([[first.id, first.power]]);
  const seenRows = new Map();
  for (let frame = 0; frame < 600; frame += 1) {
    for (const object of game.objects.filter(object => HAZARDS.includes(object.type))) {
      seenRows.set(object.id, Math.round((game.distance + object.z) * 1e6) / 1e6);
    }
    for (const object of game.objects) {
      if (object.type !== 'powerup' || seen.has(object.id)) continue;
      seen.set(object.id, object.power);
      const hazards = game.objects.filter(other => HAZARDS.includes(other.type)
        && Math.abs(other.z - object.z - 22) < 1e-7);
      assert.ok(hazards.length >= 1);
      assert.ok(hazards.every(hazard => hazard.lane !== object.lane));
      assert.ok(game.objects.some(other => other.type === 'coin' && other.lane === object.lane
        && Math.abs(other.z - object.z - 6) < 1e-7));
      const routeRow = Math.round((game.distance + object.z + 22) * 1e6) / 1e6;
      const rowIndex = [...new Set(seenRows.values())].sort((a, b) => a - b).indexOf(routeRow) + 1;
      assert.equal(rowIndex % 4, 0, 'regular pickups appear only on every fourth obstacle row');
    }
    game.update(0.1);
  }
  assert.equal(game.state, 'playing');
  assert.deepEqual([...seen.values()].slice(0, 6), ['magnet', 'shield', 'ghost', 'spring', 'magnet', 'shield']);
  assert.equal(seen.size, 1 + Math.floor(game._rowCount / 4));
  assert.ok([...seen.values()].every(power => power !== 'double'));
});

test('power-up pickups are harmless, require the right lane, and refresh their timers', () => {
  assert.deepEqual(POWERUP_DURATIONS, { magnet: 10, shield: 12, ghost: 6, spring: 12 });
  for (const [power, seconds] of Object.entries(POWERUP_DURATIONS)) {
    const game = emptyGame();
    game.objects = [{ id: 1, type: 'powerup', power, lane: 1, z: 0.1 }];
    game.update(0.02);
    assert.equal(game.state, 'playing');
    assert.deepEqual(game.drainEvents(), []);
    pickup(game, power);
    assert.equal(game.state, 'playing');
    assert.deepEqual(game.drainEvents(), [{ type: 'powerup', power }]);
    assert.equal(game.objects.length, 0);
    const timer = () => game.powerups[power];
    assert.ok(timer() > seconds - 0.02 && timer() <= seconds);
    advance(game, 1);
    pickup(game, power);
    assert.ok(timer() > seconds - 0.02 && timer() <= seconds, 'refreshes without stacking duration');
  }
});

test('magnet collects ground records across lanes and jump heights within 12 metres, then expires', () => {
  const game = emptyGame();
  pickup(game, 'magnet');
  game.drainEvents();
  game.action('jump');
  advance(game, 0.4);
  game.objects = [
    { id: 1, type: 'coin', lane: -1, z: 8 },
    { id: 2, type: 'coin', lane: 0, z: 10 },
    { id: 3, type: 'coin', lane: 1, z: 12, height: 2 },
    { id: 4, type: 'coin', lane: 1, z: 20 },
    { id: 5, type: 'coin', lane: 0, z: -1 },
  ];
  game.update(0.02);
  assert.equal(game.coins, 3);
  const collected = game.drainEvents().filter(event => event.type === 'coin');
  assert.deepEqual(collected.map(event => event.id), [1, 2, 3]);
  assert.ok(collected.every((event, index) => event.magnetic === true
    && event.from.lane === index - 1
    && event.from.z > 7 && event.from.z <= 12
    && event.from.height === (index === 2 ? 2 : 0.85)));
  game.objects = [];
  advance(game, 10);
  assert.equal(game.powerups.magnet, 0);
  game.objects = [{ id: 6, type: 'coin', lane: 1, z: 0.1 }];
  game.update(0.02);
  assert.equal(game.coins, 3);
});

test('one shield absorbs simultaneous hazards and grants only a brief collision grace', () => {
  const game = emptyGame();
  pickup(game, 'shield');
  game.drainEvents();
  game.objects = [
    { id: 1, type: 'tram', lane: 0, z: 0.55 },
    { id: 2, type: 'gate', lane: 1, z: 0.55 },
  ];
  game.action('right');
  game.update(0.05);
  assert.equal(game.state, 'playing');
  assert.equal(game.powerups.shield, 0);
  assert.ok(game.shieldGrace > 0.99);
  assert.deepEqual(game.drainEvents(), [{ type: 'shield-break' }]);
  game.objects = [{ id: 3, type: 'tram', lane: 1, z: 0.1 }];
  advance(game, 0.1);
  assert.equal(game.state, 'playing');
  assert.deepEqual(game.drainEvents(), []);
  advance(game, 1);
  assert.equal(game.shieldGrace, 0);
  game.objects = [{ id: 4, type: 'tram', lane: 1, z: 0.1 }];
  game.update(0.02);
  assert.equal(game.state, 'over');
});

test('shield expires without a hit and does not get consumed by a cleared obstacle', () => {
  const game = emptyGame();
  pickup(game, 'shield');
  game.drainEvents();
  game.objects = [{ id: 1, type: 'barrier', lane: 0, z: 4 }];
  game.action('jump');
  advance(game, 0.5);
  assert.ok(game.powerups.shield > 11);
  assert.equal(game.drainEvents().some(event => event.type === 'shield-break'), false);
  advance(game, 12);
  assert.equal(game.powerups.shield, 0);
  game.objects = [{ id: 2, type: 'tram', lane: 0, z: 0.1 }];
  game.update(0.02);
  assert.equal(game.state, 'over');
});

test('all power-up timers and roll progress freeze while paused and reset with a new run', () => {
  const game = emptyGame();
  for (const power of Object.keys(POWERUP_DURATIONS)) pickup(game, power);
  game.shieldGrace = 0.8;
  game.ghostGrace = 0.6;
  assert.equal(game.action('roll'), true);
  assert.equal(game.player.rollProgress, 0);
  assert.equal(game.action('slide'), false);
  advance(game, 0.425);
  assert.ok(Math.abs(game.player.rollProgress - 0.5) < 1e-8);
  game.pause();
  const paused = game.snapshot();
  advance(game, 2);
  assert.deepEqual(game.snapshot(), paused);
  game.resume();
  advance(game, 0.5);
  assert.equal(game.player.sliding, false);
  assert.equal(game.player.rollProgress, 1);
  game.action('roll');
  assert.equal(game.player.rollProgress, 0);
  game.reset();
  assert.deepEqual(game.powerups, { magnet: 0, shield: 0, ghost: 0, spring: 0 });
  assert.equal(game.shieldGrace, 0);
  assert.equal(game.ghostGrace, 0);
  assert.equal(game.surfRemaining, 0);
  assert.equal(game.surfLandingGrace, 0);
  assert.equal(game.player.rollProgress, 0);
  assert.equal(game.player.springJump, false);
  const ready = game.snapshot();
  advance(game, 1);
  assert.deepEqual(game.snapshot(), ready);

  game.start();
  game.objects = [{ id: 1, type: 'tram', lane: 0, z: 0.1 }];
  game.powerups.magnet = 5;
  game.update(0.02);
  assert.equal(game.state, 'over');
  const over = game.snapshot();
  advance(game, 1);
  assert.deepEqual(game.snapshot(), over);
});

test('surfboard costs exactly 200 records and only purchases once during a playing run', () => {
  const game = new Game();
  game.coins = SURFBOARD_COST;
  assert.equal(game.buySurfboard(), false);
  assert.equal(game.coins, SURFBOARD_COST);
  game.start();
  game.coins = SURFBOARD_COST - 1;
  assert.equal(game.action('surfboard'), false);
  assert.equal(game.coins, SURFBOARD_COST - 1);
  game.coins = SURFBOARD_COST * 3;
  game.pause();
  assert.equal(game.buySurfboard(), false);
  game.resume();
  game.drainEvents();
  assert.equal(game.action('surfboard'), true);
  assert.equal(game.coins, SURFBOARD_COST * 2);
  assert.equal(game.surfRemaining, SURFBOARD_SECONDS);
  assert.equal(game.player.altitude, SURFBOARD_HEIGHT);
  assert.equal(game.buySurfboard(), false);
  assert.equal(game.coins, SURFBOARD_COST * 2);
  assert.deepEqual(game.drainEvents(), [{ type: 'surfboard' }]);
  game.reset();
  assert.equal(game.surfRemaining, 0);
  assert.equal(game.player.altitude, 0);
  assert.equal(game.objects.some(object => object.sky), false);
  game.state = 'over';
  game.coins = SURFBOARD_COST;
  assert.equal(game.buySurfboard(), false);
});

test('taking flight resets jumps and rolls, allows steering, and clears every ground hazard', () => {
  for (const action of ['jump', 'roll']) {
    const game = emptyGame();
    game.action(action);
    advance(game, 0.2);
    game.coins = SURFBOARD_COST;
    game.buySurfboard();
    assert.equal(game.player.jump, 0);
    assert.equal(game.player.sliding, false);
    assert.equal(game.player.slideRemaining, 0);
    assert.equal(game.player.rollProgress, 0);
    assert.equal(game._jumpVelocity, 0);
    assert.equal(game.action('jump'), false);
    assert.equal(game.action('roll'), false);
    assert.equal(game.action('right'), true);
    advance(game, 0.3);
    assert.ok(game.player.x > 0.99);
    game.powerups.shield = 10;
    game.objects = HAZARDS.map((type, id) => ({ id, type, lane: 1, z: 0.1 }));
    game.drainEvents();
    game.update(0.02);
    assert.equal(game.state, 'playing');
    assert.ok(game.powerups.shield > 9.9, 'ground hazards must not consume the shield while flying');
    assert.deepEqual(game.drainEvents(), []);
  }
});

test('flight and landing grace freeze on pause and landing allows time to dodge', () => {
  const game = emptyGame();
  game.coins = SURFBOARD_COST;
  game.buySurfboard();
  advance(game, 2);
  game.pause();
  const paused = game.snapshot();
  advance(game, 10);
  assert.deepEqual(game.snapshot(), paused);
  game.resume();
  advance(game, SURFBOARD_SECONDS - 2);
  assert.equal(game.surfRemaining, 0);
  assert.equal(game.player.altitude, 0);
  assert.ok(game.surfLandingGrace > 1.24);
  assert.equal(game.drainEvents().filter(event => event.type === 'surfboard-end').length, 1);
  game.objects = [{ id: 1, type: 'cart', lane: 0, z: 0.1 }];
  game.update(0.02);
  assert.equal(game.state, 'playing');
  game.pause();
  const landing = game.snapshot();
  advance(game, 2);
  assert.deepEqual(game.snapshot(), landing);
  game.resume();
  advance(game, 1.3);
  assert.equal(game.surfLandingGrace, 0);
  assert.equal(game.drainEvents().some(event => event.type === 'surfboard-end'), false);
  game.objects = [{ id: 2, type: 'cart', lane: 0, z: 0.1 }];
  game.update(0.02);
  assert.equal(game.state, 'over');
});

test('sky records require a surfboard and matching lane, and magnets never cross altitudes', () => {
  for (const flying of [false, true]) {
    for (const magnetic of [false, true]) {
      const game = emptyGame();
      if (flying) {
        game.coins = SURFBOARD_COST;
        game.buySurfboard();
      }
      game.powerups.magnet = magnetic ? 10 : 0;
      game.objects = [
        { id: 101, type: 'coin', lane: 0, z: 0.1 },
        { id: 102, type: 'coin', lane: 1, z: 0.1 },
        { id: 103, type: 'coin', sky: true, height: SURFBOARD_HEIGHT + 0.85, lane: 0, z: 0.1 },
        { id: 104, type: 'coin', sky: true, height: SURFBOARD_HEIGHT + 0.85, lane: -1, z: 0.1 },
      ];
      game.drainEvents();
      game.update(0.02);
      const collected = game.drainEvents().filter(event => event.type === 'coin').map(event => event.id);
      assert.deepEqual(collected, flying ? (magnetic ? [103, 104] : [103]) : (magnetic ? [101, 102] : [101]));
      assert.equal(game.coins, magnetic ? 2 : 1);
    }
  }
  const jumper = emptyGame();
  jumper.powerups.magnet = 10;
  jumper.action('jump');
  jumper.objects = [{ id: 1, type: 'coin', sky: true, height: SURFBOARD_HEIGHT + 0.85, lane: 0, z: 8 }];
  advance(jumper, 0.6);
  assert.equal(jumper.coins, 0);
});

test('flying cannot collect ground power-ups', () => {
  const game = emptyGame();
  game.coins = SURFBOARD_COST;
  game.buySurfboard();
  game.drainEvents();
  for (const power of Object.keys(POWERUP_DURATIONS)) pickup(game, power);
  assert.ok(Object.values(game.powerups).every(timer => timer === 0));
  assert.deepEqual(game.drainEvents(), []);
});

test('sky trails are immediately visible, continue ahead, and form reachable finite routes at every speed', () => {
  for (const elapsedTime of [0, 75, 150]) {
    const game = emptyGame();
    game.elapsedTime = elapsedTime;
    game.update(1 / 120);
    game.coins = SURFBOARD_COST;
    game.buySurfboard();
    const firstRoute = game.objects.filter(object => object.sky).sort((a, b) => a.z - b.z);
    assert.ok(firstRoute.length > 12);
    assert.equal(firstRoute[0].lane, game.player.lane);
    assert.ok(firstRoute[0].z >= game.speed * 0.7);
    const initialIds = new Set(firstRoute.map(object => object.id));
    const allRecords = new Map();
    for (let frame = 0; frame < SURFBOARD_SECONDS * 60; frame += 1) {
      const ahead = game.objects.filter(object => object.sky && object.z > 0).sort((a, b) => a.z - b.z);
      for (const record of ahead) allRecords.set(record.id, { ...record, absoluteZ: game.distance + record.z });
      if (ahead[0]?.lane < game.player.lane) game.action('left');
      if (ahead[0]?.lane > game.player.lane) game.action('right');
      game.update(1 / 60);
    }
    assert.equal(game.state, 'playing');
    assert.ok(game.coins >= 40, `reachable sky route should reward steering at ${elapsedTime}s`);
    assert.ok(game.coins < SURFBOARD_COST, 'one flight cannot fund another flight');
    assert.ok(allRecords.size <= 96);
    assert.ok([...allRecords.keys()].some(id => !initialIds.has(id)), 'new records appear as the rider advances');
    const route = [...allRecords.values()].sort((a, b) => a.absoluteZ - b.absoluteZ);
    assert.ok(route.every(record => record.height === SURFBOARD_HEIGHT + 0.85));
    let turns = 0;
    for (let i = 1; i < route.length; i += 1) {
      if (route[i].lane === route[i - 1].lane) continue;
      turns += 1;
      assert.equal(Math.abs(route[i].lane - route[i - 1].lane), 1);
      assert.ok(route[i].absoluteZ - route[i - 1].absoluteZ >= 12, 'turns leave a reaction gap');
    }
    assert.ok(turns >= 4);
    assert.equal(game.surfRemaining, 0);
  }
});

test('crates and buoys can be jumped, while carts require a lane dodge', () => {
  for (const type of ['crate', 'buoy', 'cart']) {
    for (const action of [null, 'jump', 'roll', 'right']) {
      const game = emptyGame();
      game.objects = [{ id: 1, type, lane: 0, z: 4 }];
      if (action) game.action(action);
      advance(game, 0.5);
      assert.equal(game.state, action === 'right' || (action === 'jump' && type !== 'cart') ? 'playing' : 'over');
    }
  }
});

test('speed rises with playing time, reaches a cap, and freezes or resets with the run', () => {
  const game = emptyGame();
  game._nextRow = 100000;
  advance(game, 10);
  assert.ok(Math.abs(game.elapsedTime - 10) < 1e-8);
  assert.ok(Math.abs(game.speed - 13.2) < 1e-8);
  game.distance += 1000;
  game.update(1 / 120);
  assert.ok(game.speed < 13.21, 'speed is tied to playing time, not distance');
  game.pause();
  const paused = game.snapshot();
  advance(game, 10);
  assert.deepEqual(game.snapshot(), paused);
  game.resume();
  advance(game, 150);
  assert.equal(game.speed, 30);
  game.reset();
  assert.equal(game.speed, 12);
  assert.equal(game.elapsedTime, 0);
});

test('track generates all new obstacle types and keeps reaction gaps at top speed', () => {
  const seen = new Set();
  for (const random of [0, 0.2, 0.4, 0.55, 0.72, 0.95]) {
    const game = new Game({ random: () => random });
    for (const object of game.objects) if (HAZARDS.includes(object.type)) seen.add(object.type);
    game.objects = [];
    game.speed = 30;
    game.elapsedTime = 150;
    game.distance = 4000;
    game._nextRow = game.distance + 40;
    game._fillTrack();
    const rows = new Map();
    for (const object of game.objects.filter(object => HAZARDS.includes(object.type))) {
      const lanes = rows.get(object.z) ?? new Set();
      lanes.add(object.lane);
      rows.set(object.z, lanes);
    }
    const positions = [...rows.keys()].sort((a, b) => a - b);
    for (let i = 1; i < positions.length; i += 1) assert.ok(positions[i] - positions[i - 1] >= 30 * 1.25);
    for (const lanes of rows.values()) assert.ok(lanes.size <= 2);
  }
  assert.deepEqual([...seen].sort(), [...HAZARDS].sort());
});

test('ghost passes through every ground hazard and leaves shields and record collection intact', () => {
  const game = emptyGame();
  pickup(game, 'shield');
  pickup(game, 'ghost');
  game.drainEvents();
  game.objects = [
    ...HAZARDS.map((type, id) => ({ id, type, lane: 0, z: 0.1 })),
    { id: 50, type: 'coin', lane: 0, z: 0.1 },
  ];
  game.update(0.02);
  assert.equal(game.state, 'playing');
  assert.ok(game.powerups.ghost > 5.9);
  assert.ok(game.powerups.shield > 11.9);
  assert.equal(game.shieldGrace, 0);
  assert.equal(game.coins, 1);
  assert.deepEqual(game.drainEvents(), [{ type: 'coin', id: 50 }]);

  const simultaneous = emptyGame();
  simultaneous.objects = [
    { id: 1, type: 'tram', lane: 0, z: 0.1 },
    { id: 2, type: 'powerup', power: 'ghost', lane: 0, z: 0.1 },
  ];
  simultaneous.update(0.02);
  assert.equal(simultaneous.state, 'playing', 'ghost pickup protects even when its hazard is listed first');
});

test('ghost expiry grants only a brief reaction grace, which pauses and refreshes safely', () => {
  const game = emptyGame();
  pickup(game, 'ghost');
  advance(game, game.powerups.ghost);
  assert.equal(game.powerups.ghost, 0);
  assert.ok(game.ghostGrace > 0.64 && game.ghostGrace <= 0.65);
  game.objects = [{ id: 1, type: 'cart', lane: 0, z: 0.1 }];
  game.update(0.02);
  assert.equal(game.state, 'playing');
  game.pause();
  const paused = game.snapshot();
  advance(game, 1);
  assert.deepEqual(game.snapshot(), paused);
  game.resume();
  pickup(game, 'ghost');
  assert.ok(game.powerups.ghost > 5.9);
  assert.equal(game.ghostGrace, 0, 'refresh starts a fresh ghost duration');
  advance(game, game.powerups.ghost + 0.7);
  assert.equal(game.powerups.ghost, 0);
  assert.equal(game.ghostGrace, 0);
  game.objects = [{ id: 2, type: 'cart', lane: 0, z: 0.1 }];
  game.update(0.02);
  assert.equal(game.state, 'over');
});

test('spring jumps rise higher and clear trams or carts only with enough height', () => {
  for (const type of ['tram', 'cart']) {
    for (const distance of [0.5, 4]) {
      const game = emptyGame();
      pickup(game, 'spring');
      game.objects = [{ id: 1, type, lane: 0, z: distance }];
      game.action('jump');
      advance(game, 0.5);
      assert.equal(game.state, distance === 4 ? 'playing' : 'over', 'super jumps still require timing');
      if (distance === 4) assert.ok(game.player.jump > 3.3);
    }
  }
  const peak = emptyGame();
  pickup(peak, 'spring');
  peak.action('jump');
  advance(peak, 0.675);
  assert.ok(peak.player.jump > 3.6 && peak.player.jump < 3.7);
  advance(peak, 0.7);
  assert.equal(peak.player.jump, 0);
  assert.equal(peak.player.springJump, false);
  assert.equal(peak.action('jump'), true, 'spring permits repeated jumps during its timer');
  assert.equal(peak.player.springJump, true);
});

test('super jumps clear green hurdles on ascent and descent at every running speed', () => {
  for (const elapsedTime of [0, 75, 150]) {
    for (const contactTime of [0.4, 0.95]) {
      for (const [frameTime, shield] of [[1 / 60, 0], [0.1, 0], [1 / 60, 12], [0.1, 12]]) {
        const game = emptyGame();
        game.elapsedTime = elapsedTime;
        game.update(1 / 120);
        // Expire before the hurdle to exercise the captured power of this jump.
        game.powerups.spring = 0.15;
        game.powerups.shield = shield;
        const z = game.speed * contactTime;
        game.objects = [{ id: 1, type: 'gate', lane: 0, z }];
        game.action('jump');
        for (let t = 0; t < contactTime + 0.1; t += frameTime) game.update(frameTime);
        assert.equal(game.state, 'playing', `hurdle at ${elapsedTime}s / contact ${contactTime}s / frame ${frameTime}s`);
        assert.equal(game.powerups.spring, 0);
        if (shield) assert.ok(game.powerups.shield > 10, 'a cleared hurdle must not consume a shield');
        assert.ok(!game.drainEvents().some(event => ['crash', 'shield-break'].includes(event.type)));
      }
    }
  }
});

test('super jump still collides with a hurdle when the dolphin is below its top', () => {
  for (const contactTime of [0.1, 1.25]) {
    const game = emptyGame();
    game.powerups.spring = 12;
    game.objects = [{ id: 1, type: 'gate', lane: 0, z: game.speed * contactTime }];
    game.action('jump');
    advance(game, contactTime + 0.1);
    assert.equal(game.state, 'over', 'jumping too late or landing too early should still collide');
  }
});

test('harder runs contain 33% more obstacles on average with clear lanes and the same pickup cadence', () => {
  for (const elapsedTime of [0, 60, 120]) {
    let seed = 71283;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const game = new Game({ random });
    game.elapsedTime = elapsedTime;
    game.speed = Math.min(30, 12 + elapsedTime * 0.12);
    game.objects = [];
    game._rowCount = 0;
    game._nextRow = 100;
    let hazards = 0, rows = 0, powers = 0;
    while (rows < 10000) {
      game.distance = game._nextRow - 1;
      game._fillTrack();
      const generated = new Map();
      for (const object of game.objects) {
        if (object.type === 'powerup') powers++;
        if (!HAZARDS.includes(object.type)) continue;
        hazards++;
        const lanes = generated.get(object.z) ?? new Set();
        lanes.add(object.lane);
        generated.set(object.z, lanes);
      }
      for (const lanes of generated.values()) {
        assert.ok(lanes.size >= 1 && lanes.size <= 2, 'every row must keep a clear lane');
      }
      rows += generated.size;
      game.objects = [];
    }
    const previousHazardsPerRow = 1.2 + Math.min(1, elapsedTime / 120) * 0.2;
    const ratio = hazards / rows / previousHazardsPerRow;
    assert.ok(Math.abs(ratio - 1.33) < 0.015, `${elapsedTime}s: expected about 1.33 times as many hazards, got ${ratio}`);
    assert.equal(powers, Math.floor(rows / 4), 'harder rows must not make powerups more frequent');
  }
});

test('a spring-powered takeoff remains powered after expiry, then later jumps return to normal', () => {
  const game = emptyGame();
  pickup(game, 'spring');
  game.powerups.spring = 0.2;
  game.objects = [{ id: 1, type: 'tram', lane: 0, z: 7 }];
  game.action('jump');
  advance(game, 0.1);
  game.pause();
  const paused = game.snapshot();
  advance(game, 1);
  assert.deepEqual(game.snapshot(), paused);
  game.resume();
  advance(game, 0.6);
  assert.equal(game.powerups.spring, 0);
  assert.equal(game.player.springJump, true);
  assert.equal(game.state, 'playing');
  advance(game, 0.7);
  assert.equal(game.player.springJump, false);
  game.objects = [{ id: 2, type: 'cart', lane: 0, z: 4 }];
  game.action('jump');
  assert.equal(game.player.springJump, false);
  advance(game, 0.5);
  assert.equal(game.state, 'over');
});

test('spring still respects sky record access and surfboard takeoff clears the captured jump', () => {
  const game = emptyGame();
  pickup(game, 'spring');
  game.action('jump');
  game.objects = [{ id: 1, type: 'coin', sky: true, height: SURFBOARD_HEIGHT + 0.85, lane: 0, z: 8 }];
  advance(game, 0.7);
  assert.equal(game.coins, 0, 'spring cannot collect the flight-only records even near their height');
  assert.equal(game.player.springJump, true);
  game.coins = SURFBOARD_COST;
  game.buySurfboard();
  assert.equal(game.player.springJump, false);
  assert.equal(game.player.jump, 0);
  assert.equal(game.player.altitude, SURFBOARD_HEIGHT);
  assert.equal(game.action('jump'), false);
});
