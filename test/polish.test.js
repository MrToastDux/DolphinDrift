import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, SURFBOARD_COST } from '../src/game.js';
import { CHAPTERS, objectiveProgress } from '../src/adventure.js';
import { createProfile, finishRun } from '../src/progression.js';

test('every non-boss Story chapter generates enough objective pickups and enemies', () => {
  for (const chapter of CHAPTERS.filter(chapter => chapter.objective !== 'boss')) {
    for (const seed of [0, 1, 42, `story:${chapter.id}`]) {
      const game = new Game({ mode: 'story', seed });
      game.chapterId = chapter.id; game.start();
      const type = { records: 'coin', enemies: 'enemy', rescues: 'rescue' }[chapter.objective];
      const objectives = new Map();
      // Inspect the actual rolling generator, including late-chapter rows.
      game.powerups.ghost = 1000;
      while (game.state === 'playing') {
        for (const object of game.objects) {
          if (object.type === type && object.z + game.distance < chapter.length) objectives.set(object.id, object);
        }
        game.update(.1);
      }
      assert.ok(objectives.size >= chapter.target, `${chapter.id}, ${seed}: only ${objectives.size} of ${chapter.target} targets spawned`);
    }
  }
});

test('the generated rescue route can be completed and unlocks the next chapter once', () => {
  const game = new Game({ mode: 'story', seed: 'story:rescue' });
  game.chapterId = 'rescue'; game.start();
  const hazards = new Set(['barrier', 'gate', 'tram', 'crate', 'buoy', 'cart', 'enemy']);
  for (let frame = 0; frame < 6000 && game.state === 'playing'; frame++) {
    const next = game.objects.filter(o => hazards.has(o.type) && o.z > 0 && !o.collected).sort((a,b) => a.z-b.z)[0];
    if (next && next.z / game.speed < 1.4) {
      const blocked = game.objects.filter(o => hazards.has(o.type) && Math.abs(o.z-next.z) < .01).map(o => o.lane);
      const marker = game.objects.find(o => o.type === 'coin' && Math.abs(o.z - (next.z-6)) < .01);
      const lane = marker?.lane ?? [-1,0,1].find(lane => !blocked.includes(lane));
      if (lane < game.player.lane) game.action('left');
      if (lane > game.player.lane) game.action('right');
    }
    game.counter();
    game.update(1/60);
  }
  assert.equal(game.completed, true, `Stopped at ${game.distance} m, ${game.stats.rescues} rescues`);
  assert.equal(objectiveProgress(game).complete, true);
  const baseline = createProfile({ story: { cleared: 2 } });
  const saved = finishRun(baseline, game);
  assert.equal(saved.story.cleared, 3);
  const replay = finishRun(createProfile({ story: { cleared: 3 } }), game);
  assert.equal(replay.story.cleared, 3);
  assert.equal(saved.wallet - replay.wallet, game.chapter.reward);
});

test('boss defeat counts once, survives the exit, and resets on a new run', () => {
  const game = new Game({ mode: 'story' }); game.chapterId = 'breaker'; game.start();
  game.distance = 520; game._updateBoss(.01);
  game.damageBoss(99); game.damageBoss(99);
  assert.equal(game.stats.bosses, 1);
  assert.equal(game.bossDefeats, 1);
  game.distance = game.chapter.length; game._updateBoss(.01);
  assert.equal(game.stats.bosses, 1);
  game.reset(); assert.equal(game.stats.bosses, 0);
});

test('Story resets remix rules while Turbo starts at its actual running speed', () => {
  const story = new Game({ mode: 'story' }); story.modifier = 'pure'; story.start();
  assert.equal(story.modifier, 'none');
  assert.ok(story.objects.some(o => o.type === 'powerup'));
  const turbo = new Game(); turbo.modifier = 'turbo'; turbo.start();
  assert.ok(Math.abs(turbo.speed - 15.6) < 1e-9);
  const speed = turbo.speed; turbo.update(.001);
  assert.ok(turbo.speed - speed < .001);
});

test('sky records stop before landing and finite route exits, including upgraded Turbo flights', () => {
  for (const [mode, modifier, distance, upgrade] of [['endless','none',0,0], ['endless','turbo',0,3], ['tour','none',2200,0], ['story','none',420,2]]) {
    const game = new Game({ mode, seed: 42 }); game.modifier = modifier; game.upgrades = { 'surf-upgrade': upgrade }; game.start();
    game.distance = distance; game.objects = []; game._nextRow = Infinity; game.coins = SURFBOARD_COST;
    game.buySurfboard();
    const end = Math.min(game._skyEnd, game.chapter?.length ?? (mode === 'tour' ? 2250 : Infinity));
    let count = 0;
    while (game.state === 'playing' && game.surfRemaining > 0) {
      for (const object of game.objects.filter(o => o.sky)) {
        assert.ok(object.z + game.distance < end + 1e-8, `Unreachable record in ${mode}`); count++;
      }
      game.update(.05);
    }
    assert.ok(count > 0);
  }
});

test('combat snapshots cannot mutate live shot targets', () => {
  const game = new Game({ mode: 'story' }); game.start();
  game.objects = [{ id: 900, type: 'enemy', lane: 0, z: 30, hp: 3 }];
  game.counter();
  const snapshot = game.snapshot();
  snapshot.sonicShots[0].targets[0].id = -1;
  snapshot.sonicShots[0].targets.length = 0;
  assert.equal(game.sonicShots[0].targets[0].id, 900);
});
