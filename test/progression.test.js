import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, createProfile, dailySeed, finishRun, getMissions, localDateKey } from '../src/progression.js';

function run(overrides = {}) {
  return {
    distance: 800.5, score: 1500, combo: 2, maxCombo: 12, coins: 3,
    stats: { records: 53, nearMisses: 5, flights: 1 },
    ...overrides,
  };
}

test('new profiles have independent defaults and preserve only supported storage fields', () => {
  const expected = {
    runs: 0, totalDistance: 0, totalRecords: 0, bestScore: 0, bestCombo: 0, bestDistance: 0,
    achievements: [], daily: { date: '', bestDistance: 0, bestScore: 0 },
    settings: { reducedMotion: false, muted: false },
  };
  for (const input of [undefined, null, false, 'profile', [], 73]) assert.deepEqual(createProfile(input), expected);
  const first = createProfile();
  first.achievements.push('first-run');
  first.settings.muted = true;
  first.daily.date = '2026-09-16';
  assert.deepEqual(createProfile(), expected);
  assert.deepEqual(createProfile({ ignored: 'discard', settings: { unknown: 2 } }), expected);
});

test('profile sanitation rejects malformed numbers and bounds huge values without coercion', () => {
  const profile = createProfile({
    runs: -3, totalDistance: Infinity, totalRecords: '200', bestScore: NaN,
    bestCombo: 8.9, bestDistance: Number.MAX_VALUE,
    settings: { muted: 'true', reducedMotion: true },
  });
  assert.equal(profile.runs, 0);
  assert.equal(profile.totalDistance, 0);
  assert.equal(profile.totalRecords, 0);
  assert.equal(profile.bestScore, 0);
  assert.equal(profile.bestCombo, 8);
  assert.equal(profile.bestDistance, 1_000_000_000_000);
  assert.deepEqual(profile.settings, { muted: false, reducedMotion: true });
  assert.equal(createProfile({ totalDistance: 12.75 }).totalDistance, 12.75);
  assert.equal(createProfile({ runs: true }).runs, 0);
});

test('profiles filter unknown achievements, deduplicate known ones, and detach nested data', () => {
  const source = {
    achievements: ['first-flight', '__proto__', 'first-run', 'first-flight', null],
    daily: { date: '2026-09-16', bestDistance: 250.5, bestScore: 900.9 },
    settings: { muted: true, reducedMotion: false },
  };
  const profile = createProfile(source);
  assert.deepEqual(profile.achievements, ['first-run', 'first-flight']);
  assert.deepEqual(profile.daily, { date: '2026-09-16', bestDistance: 250.5, bestScore: 900 });
  profile.daily.bestScore = 0;
  profile.settings.muted = false;
  profile.achievements.push('records-50');
  assert.equal(source.daily.bestScore, 900.9);
  assert.equal(source.settings.muted, true);
  assert.equal(source.achievements.length, 5);
});

test('daily profile dates require real ISO calendar dates and invalid records are cleared', () => {
  for (const date of ['', '2026-02-30', '2026-2-01', '2026-13-01', 'yesterday', 123, null]) {
    assert.deepEqual(createProfile({ daily: { date, bestDistance: 400, bestScore: 800 } }).daily,
      { date: '', bestDistance: 0, bestScore: 0 });
  }
  assert.equal(createProfile({ daily: { date: '2024-02-29' } }).daily.date, '2024-02-29');
  assert.equal(createProfile({ daily: { date: '2025-02-29' } }).daily.date, '');
});

test('local dates use calendar components and reject invalid date inputs', () => {
  assert.equal(localDateKey(new Date(2026, 0, 2, 0, 1)), '2026-01-02');
  assert.equal(localDateKey(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  assert.equal(localDateKey(new Date('invalid')), '');
  assert.equal(localDateKey(null), '');
  assert.equal(localDateKey('2026-09-16'), '');
  assert.match(localDateKey(), /^\d{4}-\d{2}-\d{2}$/);
});

test('daily seeds are repeatable unsigned integers and distinguish adjacent dates', () => {
  const seed = dailySeed('2026-09-16');
  assert.equal(seed, dailySeed('2026-09-16'));
  assert.notEqual(seed, dailySeed('2026-09-17'));
  assert.notEqual(seed, dailySeed('2027-09-16'));
  assert.equal(dailySeed(''), 2166136261, 'the fixed FNV basis prevents accidental nondeterminism');
  assert.equal(dailySeed('a'), 3826002220, 'fixed vector protects the saved route seed contract');
  assert.equal(dailySeed(null), dailySeed(''));
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
});

test('missions track total collected records independently of remaining currency', () => {
  const missions = getMissions(run({ coins: 0 }));
  assert.equal(missions.length, 3);
  assert.deepEqual(missions.map(mission => [mission.id, mission.current, mission.target, mission.complete]), [
    ['distance', 750, 750, true], ['records', 50, 50, true], ['near-misses', 5, 5, true],
  ]);
  const unfinished = getMissions(run({ distance: 749.99, coins: 300, stats: { records: 49, nearMisses: 4 } }));
  assert.deepEqual(unfinished.map(mission => mission.current), [749, 49, 4]);
  assert.ok(unfinished.every(mission => !mission.complete));
  assert.ok(getMissions(null).every(mission => mission.current === 0 && !mission.complete));
  assert.ok(getMissions({ distance: Infinity, stats: { records: NaN, nearMisses: '5' } })
    .every(mission => mission.current === 0 && !mission.complete));
});

test('completed runs accumulate stats, preserve maxima and settings, and do not mutate inputs', () => {
  const original = createProfile({ runs: 2, totalDistance: 300, totalRecords: 80, bestScore: 1700,
    bestCombo: 3, bestDistance: 400, settings: { muted: true, reducedMotion: true } });
  const before = structuredClone(original);
  const game = run();
  const gameBefore = structuredClone(game);
  const result = finishRun(original, game);
  assert.equal(result.runs, 3);
  assert.equal(result.totalDistance, 1100.5);
  assert.equal(result.totalRecords, 133, 'records already spent on flight still count');
  assert.equal(result.bestScore, 1700);
  assert.equal(result.bestDistance, 800.5);
  assert.equal(result.bestCombo, 12, 'highest combo survives a broken combo at the end');
  assert.deepEqual(result.settings, original.settings);
  assert.deepEqual(original, before);
  assert.deepEqual(game, gameBefore);
  assert.deepEqual(result.achievements, ['first-run', 'distance-750', 'records-50', 'near-misses-5', 'first-flight', 'combo-10']);
});

test('daily runs preserve same-day maxima, reset on rollover, and never leak from free runs', () => {
  const initial = createProfile({ daily: { date: '2026-09-16', bestDistance: 1500, bestScore: 5000 } });
  const sameDay = finishRun(initial, run(), { date: '2026-09-16', daily: true });
  assert.deepEqual(sameDay.daily, initial.daily);
  const better = finishRun(sameDay, run({ distance: 2200, score: 4000 }), { date: '2026-09-16', daily: true });
  assert.deepEqual(better.daily, { date: '2026-09-16', bestDistance: 2200, bestScore: 5000 });
  const tomorrow = finishRun(better, run(), { date: '2026-09-17', daily: true });
  assert.deepEqual(tomorrow.daily, { date: '2026-09-17', bestDistance: 800.5, bestScore: 1500 });
  for (const options of [{ date: '2026-09-18' }, { daily: true }, { daily: true, date: '2026-02-30' }]) {
    assert.deepEqual(finishRun(tomorrow, run({ distance: 9000, score: 99999 }), options).daily, tomorrow.daily);
  }
});

test('achievement thresholds distinguish run milestones from cumulative milestones', () => {
  const almost = finishRun(createProfile({ runs: 8, totalRecords: 449 }), run({
    distance: 749, maxCombo: 9, stats: { records: 49, nearMisses: 4, flights: 0 },
  }));
  assert.deepEqual(almost.achievements, ['first-run']);
  const complete = finishRun(almost, run({ distance: 2000, stats: { records: 50, nearMisses: 5, flights: 1 } }));
  assert.equal(ACHIEVEMENTS.length, 9);
  assert.deepEqual(complete.achievements, ACHIEVEMENTS.map(achievement => achievement.id));
  const repeated = finishRun(complete, run({ distance: 2200 }));
  assert.deepEqual(repeated.achievements, complete.achievements);
  assert.equal(new Set(repeated.achievements).size, 9);
});

test('malformed run values cannot poison saved totals or award run milestones', () => {
  const result = finishRun(null, {
    distance: Infinity, score: '9999', maxCombo: -1, combo: NaN, coins: 99999,
    stats: { records: Infinity, nearMisses: '5', flights: -1 },
  });
  assert.equal(result.runs, 1);
  assert.equal(result.totalDistance, 0);
  assert.equal(result.totalRecords, 0);
  assert.equal(result.bestScore, 0);
  assert.equal(result.bestCombo, 0);
  assert.deepEqual(result.achievements, ['first-run']);
  const saturated = finishRun(createProfile({ runs: Number.MAX_VALUE, totalDistance: Number.MAX_VALUE,
    totalRecords: Number.MAX_VALUE }), run({ distance: Number.MAX_VALUE, stats: { records: Number.MAX_VALUE } }));
  for (const field of ['runs', 'totalDistance', 'totalRecords', 'bestDistance']) {
    assert.equal(saturated[field], 1_000_000_000_000);
    assert.ok(Number.isFinite(saturated[field]));
  }
});
