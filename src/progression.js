// Only this small, version-independent shape is persisted. Never trust storage
// values: invalid numbers become zero and valid totals saturate before overflow.
const MAX_STAT = 1_000_000_000_000;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const amount = value => typeof value === 'number' && Number.isFinite(value)
  ? Math.min(MAX_STAT, Math.max(0, value)) : 0;
const count = value => Math.floor(amount(value));

export const ACHIEVEMENTS = Object.freeze([
  { id: 'first-run', title: 'First Splash', description: 'Finish your first run.' },
  { id: 'distance-750', title: 'Open Water', description: 'Travel 750 m in one run.' },
  { id: 'distance-2000', title: 'Horizon Chaser', description: 'Travel 2,000 m in one run.' },
  { id: 'records-50', title: 'Record Collector', description: 'Collect 50 records in one run.' },
  { id: 'records-500', title: 'Deep Collection', description: 'Collect 500 records across all runs.' },
  { id: 'near-misses-5', title: 'Close Call Artist', description: 'Make 5 near misses in one run.' },
  { id: 'first-flight', title: 'Taking Flight', description: 'Take a surfboard flight.' },
  { id: 'combo-10', title: 'Flow State', description: 'Reach a 10-record combo.' },
  { id: 'runs-10', title: 'Regular Rider', description: 'Finish 10 runs.' },
].map(achievement => Object.freeze(achievement)));

function validDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

/** Use the player's calendar date, not the UTC date, for the daily route. */
export function localDateKey(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '';
  const year = date.getFullYear();
  if (year < 0 || year > 9999) return '';
  return `${String(year).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** FNV-1a gives the same unsigned 32-bit seed in every browser. */
export function dailySeed(dateString) {
  const key = typeof dateString === 'string' ? dateString : '';
  let seed = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    seed = Math.imul(seed ^ key.charCodeAt(i), 16777619);
  }
  return seed >>> 0;
}

export function createProfile(raw = {}) {
  const source = record(raw);
  const daily = record(source.daily);
  const settings = record(source.settings);
  const date = validDateKey(daily.date);
  const savedAchievements = Array.isArray(source.achievements) ? new Set(source.achievements) : new Set();
  return {
    runs: count(source.runs),
    totalDistance: amount(source.totalDistance),
    totalRecords: count(source.totalRecords),
    bestScore: count(source.bestScore),
    bestCombo: count(source.bestCombo),
    bestDistance: amount(source.bestDistance),
    achievements: ACHIEVEMENTS.filter(achievement => savedAchievements.has(achievement.id)).map(achievement => achievement.id),
    daily: {
      date,
      bestDistance: date ? amount(daily.bestDistance) : 0,
      bestScore: date ? count(daily.bestScore) : 0,
    },
    settings: { reducedMotion: settings.reducedMotion === true, muted: settings.muted === true },
  };
}

/** Three independent, per-run goals; completing them never spends records. */
export function getMissions(game) {
  const run = record(game);
  const stats = record(run.stats);
  return [
    { id: 'distance', title: 'Travel 750 m', current: count(run.distance), target: 750 },
    { id: 'records', title: 'Collect 50 records', current: count(stats.records), target: 50 },
    { id: 'near-misses', title: 'Make 5 near misses', current: count(stats.nearMisses), target: 5 },
  ].map(mission => ({ ...mission, current: Math.min(mission.current, mission.target), complete: mission.current >= mission.target }));
}

/** Call once after each completed run. Returns a fresh profile for safe saving. */
export function finishRun(profile, game, { date, daily = false } = {}) {
  const next = createProfile(profile);
  const run = record(game);
  const stats = record(run.stats);
  const distance = amount(run.distance);
  const score = count(run.score);
  const maxCombo = Math.max(count(run.maxCombo), count(run.combo));
  const records = count(stats.records);
  next.runs = count(next.runs + 1);
  next.totalDistance = amount(next.totalDistance + distance);
  next.totalRecords = count(next.totalRecords + records);
  next.bestDistance = Math.max(next.bestDistance, distance);
  next.bestScore = Math.max(next.bestScore, score);
  next.bestCombo = Math.max(next.bestCombo, maxCombo);

  const day = validDateKey(date);
  if (daily === true && day) {
    const previous = next.daily.date === day ? next.daily : { bestDistance: 0, bestScore: 0 };
    next.daily = {
      date: day,
      bestDistance: Math.max(previous.bestDistance, distance),
      bestScore: Math.max(previous.bestScore, score),
    };
  }

  const earned = new Set(next.achievements);
  const conditions = {
    'first-run': next.runs >= 1,
    'distance-750': distance >= 750,
    'distance-2000': distance >= 2000,
    'records-50': records >= 50,
    'records-500': next.totalRecords >= 500,
    'near-misses-5': count(stats.nearMisses) >= 5,
    'first-flight': count(stats.flights) >= 1,
    'combo-10': maxCombo >= 10,
    'runs-10': next.runs >= 10,
  };
  next.achievements = ACHIEVEMENTS.filter(achievement => earned.has(achievement.id) || conditions[achievement.id])
    .map(achievement => achievement.id);
  return next;
}
