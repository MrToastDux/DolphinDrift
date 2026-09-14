import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';

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
    for (const object of game.objects.filter(object => ['barrier', 'gate', 'tram'].includes(object.type))) {
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
    for (const type of ['barrier', 'gate', 'tram']) {
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

test('gates require sliding and trams cannot be jumped', () => {
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

test('eight consecutive records unlock a timed double-record bonus, with pause and reset safety', () => {
  const game = emptyGame();
  const collect = id => {
    game.objects = [{ id, type: 'coin', lane: 0, z: 0.1 }];
    game.update(0.02);
  };
  for (let i = 0; i < 7; i++) collect(i);
  assert.equal(game.flow, 7);
  assert.equal(game.dubRemaining, 0);
  collect(7);
  assert.equal(game.coins, 8);
  assert.ok(game.dubRemaining > 9.9);
  assert.equal(game.drainEvents().filter(event => event.type === 'dub').length, 1);
  collect(8);
  assert.equal(game.coins, 10);
  game.pause();
  const paused = game.dubRemaining;
  advance(game, 2);
  assert.equal(game.dubRemaining, paused);
  game.resume();
  advance(game, 10.1);
  assert.equal(game.dubRemaining, 0);
  collect(9);
  assert.equal(game.coins, 11);
  assert.equal(game.flow, 1);
  game.objects = [{ id: 10, type: 'coin', lane: 1, z: .1 }];
  game.update(.02);
  assert.equal(game.flow, 0, 'missing a record breaks the streak');
  game.start();
  game.reset();
  assert.equal(game.flow, 0);
  assert.equal(game.dubRemaining, 0);
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

test('power-ups begin with a center magnet and cycle on clear coin routes', () => {
  const game = new Game({ random: () => 0.5 });
  game.start();
  const first = game.objects.find(object => object.type === 'powerup');
  assert.equal(first.power, 'magnet');
  assert.equal(first.lane, 0);
  assert.equal(first.z, 65);
  const seen = new Map([[first.id, first.power]]);
  for (let frame = 0; frame < 400; frame += 1) {
    for (const object of game.objects) {
      if (object.type !== 'powerup' || seen.has(object.id)) continue;
      seen.set(object.id, object.power);
      const hazards = game.objects.filter(other => ['barrier', 'gate', 'tram'].includes(other.type)
        && Math.abs(other.z - object.z - 22) < 1e-7);
      assert.ok(hazards.length >= 1);
      assert.ok(hazards.every(hazard => hazard.lane !== object.lane));
      assert.ok(game.objects.some(other => other.type === 'coin' && other.lane === object.lane
        && Math.abs(other.z - object.z - 6) < 1e-7));
    }
    game.update(0.1);
  }
  assert.equal(game.state, 'playing');
  assert.deepEqual([...seen.values()].slice(0, 5), ['magnet', 'shield', 'double', 'magnet', 'shield']);
});

test('power-up pickups are harmless, require the right lane, and refresh their timers', () => {
  for (const [power, seconds] of [['magnet', 10], ['shield', 12], ['double', 10]]) {
    const game = emptyGame();
    game.objects = [{ id: 1, type: 'powerup', power, lane: 1, z: 0.1 }];
    game.update(0.02);
    assert.equal(game.state, 'playing');
    assert.deepEqual(game.drainEvents(), []);
    pickup(game, power);
    assert.equal(game.state, 'playing');
    assert.deepEqual(game.drainEvents(), [{ type: 'powerup', power }]);
    assert.equal(game.objects.length, 0);
    const timer = () => power === 'double' ? game.dubRemaining : game.powerups[power];
    assert.ok(timer() > seconds - 0.02 && timer() <= seconds);
    advance(game, 1);
    pickup(game, power);
    assert.ok(timer() > seconds - 0.02 && timer() <= seconds, 'refreshes without stacking duration');
  }
});

test('magnet collects all lanes and heights within 12 metres, then expires', () => {
  const game = emptyGame();
  pickup(game, 'magnet');
  game.drainEvents();
  game.action('jump');
  advance(game, 0.4);
  game.objects = [
    { id: 1, type: 'coin', lane: -1, z: 8 },
    { id: 2, type: 'coin', lane: 0, z: 10 },
    { id: 3, type: 'coin', lane: 1, z: 12, height: 5 },
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
    && event.from.height === (index === 2 ? 5 : 0.85)));
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

test('double pickup shares the streak bonus and cannot multiply records beyond two', () => {
  const game = emptyGame();
  game.flow = 7;
  pickup(game, 'double');
  assert.equal(game.flow, 0);
  assert.deepEqual(game.drainEvents(), [{ type: 'powerup', power: 'double' }]);
  pickup(game, 'double');
  game.objects = [{ id: 1, type: 'coin', lane: 0, z: 0.1 }];
  game.update(0.02);
  assert.equal(game.coins, 2);
  assert.equal(game.flow, 0);
  game.powerups.magnet = 10;
  game.objects = [{ id: 2, type: 'coin', lane: 1, z: 10 }];
  game.update(0.02);
  assert.equal(game.coins, 4);
  advance(game, 10.1);
  game.objects = [{ id: 3, type: 'coin', lane: 0, z: 0.1 }];
  game.update(0.02);
  assert.equal(game.coins, 5);
  assert.equal(game.flow, 1);
});

test('all power-up timers and roll progress freeze while paused and reset with a new run', () => {
  const game = emptyGame();
  for (const power of ['magnet', 'shield', 'double']) pickup(game, power);
  game.shieldGrace = 0.8;
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
  assert.deepEqual(game.powerups, { magnet: 0, shield: 0 });
  assert.equal(game.shieldGrace, 0);
  assert.equal(game.dubRemaining, 0);
  assert.equal(game.player.rollProgress, 0);
  const ready = game.snapshot();
  advance(game, 1);
  assert.deepEqual(game.snapshot(), ready);

  game.start();
  game.objects = [{ id: 1, type: 'tram', lane: 0, z: 0.1 }];
  game.powerups.magnet = 5;
  game.dubRemaining = 5;
  game.update(0.02);
  assert.equal(game.state, 'over');
  const over = game.snapshot();
  advance(game, 1);
  assert.deepEqual(game.snapshot(), over);
});
