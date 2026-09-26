import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, MODES } from '../src/game.js';
import { fireWeapon, tidalBlast } from '../src/combat.js';
import { createProfile, finishRun } from '../src/progression.js';

test('only the four retained modes are selectable and removed modes fall back safely', () => {
  assert.deepEqual(Object.keys(MODES), ['endless', 'daily', 'tour', 'story']);
  for (const mode of ['zen', 'sprint', 'hardcore']) {
    const game = new Game({ mode });
    assert.equal(game.mode, 'endless');
    game.mode = mode; game.start();
    assert.equal(game.mode, 'endless');
  }
});

test('running modes never spawn combat, fire weapons, or charge a blast', () => {
  for (const mode of ['endless', 'daily', 'tour']) {
    const game = new Game({ mode, seed: 7 }); game.start();
    for (const distance of [0, 510, 740, 1260, 2010]) {
      game.distance = distance; game.objects = []; game._nextRow = distance + 20;
      game._fillTrack(); game._updateBoss(.01);
      assert.equal(game.boss, null); assert.equal(game.tour, null);
      assert.equal(game.objects.some(o => ['enemy', 'energy'].includes(o.type)), false);
      game.specialCharge = 100;
      assert.equal(game.counter(), false); assert.equal(game.action('special'), false);
      assert.equal(fireWeapon(game), false); assert.equal(tidalBlast(game), false);
      assert.equal(game.sonicShots.length, 0);
    }
    game.specialCharge = 0;
    game._collectCoin({ id: 900, type: 'coin', lane: 0, z: 0 });
    assert.equal(game.specialCharge, 0);
  }
});

test('Story still generates patrols, fires weapons, and runs its boss encounters', () => {
  const game = new Game({ mode: 'story', seed: 7 }); game.start();
  assert.ok(game.objects.some(o => o.type === 'enemy'));
  assert.equal(game.counter(), true);
  assert.equal(game.sonicShots.length, 1);
  game.specialCharge = 100; assert.equal(game.action('special'), true);
  game.state = 'over'; game.chapterId = 'breaker'; game.start();
  game.distance = game.chapter.length - 330; game.objects = []; game._nextRow = Infinity;
  game._updateBoss(.01);
  assert.equal(game.boss.maxHP, 5); assert.equal(game.counter(), true);
});

test('Island Tour retains all checkpoints and completion rewards without bosses', () => {
  const game = new Game({ mode: 'tour', seed: 7 }); game.start();
  game.objects = []; game._nextRow = Infinity;
  for (let index = 0; index < 3; index++) {
    game.distance = (index + 1) * 750 - .01; game.update(.05);
    assert.equal(game.tourCleared, index + 1); assert.equal(game.boss, null);
  }
  assert.equal(game.distance, 2250); assert.equal(game.completed, true);
  assert.equal(game.bossDefeats, 0); assert.equal(game.bonusCredits, 300);
  const saved = finishRun(createProfile(), game);
  assert.equal(saved.tourWins, 1); assert.equal(saved.tourStamps, 3);
});

test('existing saves retain their unlocks, currency, and accurately tagged history', () => {
  const profile = createProfile({ wallet: 1200, story: { cleared: 5 }, loadout: { character: 'turtle', weapon: 'lance' }, modeBests: { sprint: 3200 }, history: [{ mode: 'sprint', score: 3200 }] });
  assert.equal(profile.wallet, 1200); assert.equal(profile.loadout.character, 'turtle');
  assert.equal(profile.loadout.weapon, 'lance'); assert.equal(profile.story.cleared, 5);
  assert.equal(profile.modeBests.sprint, 3200); assert.equal(profile.history[0].mode, 'sprint');
});
