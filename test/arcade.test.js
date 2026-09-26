import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, DASH_CHARGE, DASH_SECONDS } from '../src/game.js';
import { createProfile, finishRun, levelProgress, runXP } from '../src/progression.js';

function gameFor(mode = 'endless') {
  const game = new Game({ mode, seed: 42 }); game.start();
  game.objects = []; game._nextRow = Infinity;
  return game;
}
function advance(game, seconds) { for (let t = 0; t < seconds - 1e-8; t += .05) game.update(.05); }
function hazard(game) { game.objects.push({ id: 900, type: 'tram', lane: 0, z: .01 }); game.update(.01); }
function records(game, count) {
  for (let i = 0; i < count; i++) game.objects.push({ id: i, type: 'coin', lane: 0, z: .01 });
  game.update(.01);
}

test('dash charges from actual pickups without spending records, blocks hazards, attracts records and freezes on pause', () => {
  const game = gameFor();
  assert.equal(game.dash(), false);
  records(game, DASH_CHARGE);
  assert.equal(game.dashCharge, DASH_CHARGE);
  assert.equal(game.action('dash'), true);
  assert.equal(game.coins, DASH_CHARGE);
  assert.equal(game.dashRemaining, DASH_SECONDS);
  assert.equal(game.dash(), false);
  game.objects.push({ id: 801, type: 'coin', lane: -1, z: 5 });
  hazard(game);
  assert.equal(game.state, 'playing');
  assert.equal(game.coins, DASH_CHARGE + 1);
  game.pause(); const paused = game.snapshot(); advance(game, 1);
  assert.deepEqual(game.snapshot(), paused);
  game.resume(); advance(game, 3);
  assert.equal(game.dashRemaining, 0);
  assert.ok(game.reviveGrace > 0);
  advance(game, 1); hazard(game);
  assert.equal(game.state, 'over');
  game.start(); assert.equal(game.dashCharge, 0);
});

test('dash cannot activate in the air and does not collect sky records while on foot', () => {
  const game = gameFor(); game.coins = 200; game.dashCharge = 25;
  game.buySurfboard(); assert.equal(game.dash(), false);
  game.surfRemaining = 0; game.player.altitude = 0;
  game.dash(); game.objects = [{ id: 33, type: 'coin', lane: 0, z: 2, sky: true, height: 5 }];
  game.update(.01); assert.equal(game.stats.records, 0);
});

test('flight route predictions respect the retained modes', () => {
  for (const mode of ['endless', 'tour']) {
    const game = gameFor(mode); game.coins = 200; game.buySurfboard();
    const flightDistance = game.speed * 19.8 + game.acceleration * 19.8 ** 2 / 2;
    const records = new Map();
    for (let step = 0; step < 400; step++) {
      for (const object of game.objects.filter(object => object.sky)) records.set(object.id, object.z + game.distance);
      game.update(.05);
    }
    assert.ok(records.size > 20);
    assert.ok([...records.values()].every(z => z < flightDistance));
    assert.equal(game.surfRemaining, 0);
  }
});

test('new modes have isolated scores while career XP, missions and history still accumulate', () => {
  const run = { mode: 'story', distance: 800, score: 10000, stats: { records: 50, nearMisses: 5 } };
  const profile = finishRun(createProfile({ bestScore: 42, bestDistance: 10 }), run, { date: '2026-09-20' });
  assert.equal(profile.bestScore, 42); assert.equal(profile.bestDistance, 10);
  assert.equal(profile.modeBests.story, 10000); assert.equal(profile.xp, 380);
  assert.equal(runXP(run), 380); assert.equal(levelProgress(profile.xp).level, 2);
  assert.equal(profile.history[0].date, '2026-09-20');
  let many = profile;
  for (let i = 0; i < 12; i++) many = finishRun(many, { ...run, score: i });
  assert.equal(many.history.length, 8); assert.equal(many.history[0].score, 11);
  assert.equal(profile.history.length, 1);
});

test('profile migration validates cosmetics, volumes, XP and history without trusting storage', () => {
  const profile = createProfile({ xp: -5, options: { style: 'gold', musicVolume: NaN, effectsVolume: -2 }, history: [null, { mode: '__proto__', score: Infinity }] });
  assert.equal(profile.xp, 0); assert.equal(profile.options.style, 'classic');
  assert.equal(profile.options.musicVolume, .75); assert.equal(profile.options.effectsVolume, 0);
  assert.equal(profile.history[1].mode, 'endless'); assert.equal(profile.history[1].score, 0);
  assert.equal(createProfile({ xp: 1250, options: { style: 'gold' } }).options.style, 'gold');
  assert.deepEqual(levelProgress(Infinity), { level: 1, current: 0, target: 250 });
  assert.equal(levelProgress(1e12).level, 50);
});

test('recomputing a revived run from its baseline awards XP and history only once', () => {
  const baseline = createProfile({ xp: 100 });
  const game = gameFor(); records(game, 80); hazard(game);
  const first = finishRun(baseline, game);
  assert.equal(game.revive(), true); advance(game, 3); records(game, 10); hazard(game);
  const final = finishRun(baseline, game);
  assert.equal(final.runs, 1); assert.equal(final.history.length, 1);
  assert.equal(final.xp, 100 + runXP(game)); assert.ok(final.xp > first.xp);
});
