import { MASTERY } from './mastery.js';
import { SHOP_ITEMS, findItem, itemPrice, MODIFIERS } from './catalog.js';
import { CONTRACTS, contractGoal, contractReward } from './tour.js';
import { CHAPTERS, CHARACTERS, WEAPONS, chapterById, objectiveProgress, characterUnlocked } from './adventure.js';
// Only this small, version-independent shape is persisted. Never trust storage
// values: invalid numbers become zero and valid totals saturate before overflow.
const MAX_STAT = 1_000_000_000_000;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const amount = value => typeof value === 'number' && Number.isFinite(value)
  ? Math.min(MAX_STAT, Math.max(0, value)) : 0;
const count = value => Math.floor(amount(value));
const volume = value => typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : .75;
const MODE_IDS = ['endless', 'daily', 'tour', 'story'];
// Retain past scores and history without exposing retired modes as playable.
const SAVED_MODE_IDS = [...MODE_IDS, 'zen', 'sprint', 'hardcore'];
export const STYLES = Object.freeze([
  { id: 'classic', name: 'Island original', level: 1, color: '#74b8b7' },
  { id: 'coral', name: 'Coral club', level: 2, color: '#e99786' },
  { id: 'lagoon', name: 'Blue lagoon', level: 3, color: '#77afe5' },
  { id: 'orchid', name: 'Midnight orchid', level: 4, color: '#b497dc' },
  { id: 'gold', name: 'Golden hour', level: 6, color: '#e5c575' },
  { id: 'mint', name: 'Mint condition', level: 8, color: '#8ae1b0' },
]);
export function levelProgress(xp) {
  const total = count(xp);
  const level = Math.min(50, 1 + Math.floor(total / 250));
  return { level, current: level === 50 ? 250 : total % 250, target: 250 };
}
export function runXP(game) {
  const run = record(game), stats = record(run.stats);
  return count(Math.floor(amount(run.distance) / 10) + count(stats.records) * 2
    + getMissions(game).reduce((total, mission) => total + mission.earnedXP, 0));
}

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
  const options = record(source.options);
  const xp = count(source.xp);
  const cleared = Math.min(CHAPTERS.length, count(record(source.story).cleared));
  const loadout = record(source.loadout);
  const rawShop = record(source.shop);
  const owned = SHOP_ITEMS.filter(item => !['upgrade','supply'].includes(item.category) && Array.isArray(rawShop.owned) && rawShop.owned.includes(item.id)).map(item => item.id);
  const upgrades = Object.fromEntries(SHOP_ITEMS.filter(item => item.category === 'upgrade').map(item => [item.id, Math.min(item.max, count(record(rawShop.upgrades)[item.id]))]));
  const supplies = Object.fromEntries(SHOP_ITEMS.filter(item => item.category === 'supply').map(item => [item.id, Math.min(9, count(record(rawShop.supplies)[item.id]))]));
  const equipped = Object.fromEntries(['board','trail','hat'].map(category => {
    const id = record(rawShop.equipped)[category];
    return [category, owned.includes(id) && findItem(id)?.category === category ? id : 'default'];
  }));
  const style = STYLES.find(item => item.id === options.style && item.level <= levelProgress(xp).level)?.id
    || (owned.includes(options.style) && findItem(options.style)?.category === 'skin' ? options.style : 'classic');
  const profile = {
    mastery: Object.fromEntries(CHARACTERS.map(c => [c.id, Math.min(MASTERY[c.id].target, count(record(source.mastery)[c.id]))])),
    story: { cleared, bests: Object.fromEntries(CHAPTERS.map(chapter => [chapter.id, count(record(record(source.story).bests)[chapter.id])])) },
    loadout: {
      outfit: loadout.outfit === 'mastery' ? 'mastery' : 'classic',
      character: CHARACTERS.find(item => item.id === loadout.character && characterUnlocked(item, { story: { cleared }, totalRecords: count(source.totalRecords) }))?.id || 'dub',
      weapon: WEAPONS.find(item => item.id === loadout.weapon && item.chapter <= cleared)?.id || 'pulse',
    },
    tourWins: count(source.tourWins),
    tourStamps: Math.min(3, count(source.tourStamps)),
    contracts: Object.fromEntries(CONTRACTS.map(contract => {
      const saved = record(record(source.contracts)[contract.id]);
      const tier = count(saved.tier);
      // Accept the old, larger goal before settling any newly completed tiers.
      // Never truncate valid legacy effort to the new, shorter goal.
      return [contract.id, { tier, progress: Math.min(contract.target * (1 + Math.min(9, tier)) - 1, count(saved.progress)) }];
    })),
    wallet: source.wallet === undefined ? count(250 + count(source.totalRecords)) : count(source.wallet),
    shop: { owned, upgrades, supplies, equipped },
    preferences: {
      quality: ['auto','high','low'].includes(record(source.preferences).quality) ? source.preferences.quality : 'auto',
      modifier: Object.hasOwn(MODIFIERS, record(source.preferences).modifier) ? source.preferences.modifier : 'none',
      supply: findItem(record(source.preferences).supply)?.category === 'supply' ? source.preferences.supply : 'none',
    },
    modifiedBest: count(source.modifiedBest),
    xp,
    options: { style, touchControls: options.touchControls === true, musicVolume: volume(options.musicVolume), effectsVolume: volume(options.effectsVolume) },
    modeBests: Object.fromEntries(SAVED_MODE_IDS.map(mode => [mode, count(record(source.modeBests)[mode])])),
    history: (Array.isArray(source.history) ? source.history : []).slice(0, 8).map(item => {
      const entry = record(item);
      return { mode: SAVED_MODE_IDS.includes(entry.mode) ? entry.mode : 'endless', date: validDateKey(entry.date),
        score: count(entry.score), distance: count(entry.distance), records: count(entry.records), xp: count(entry.xp) };
    }),
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
  settleContracts(profile);
  return profile;
}

const MILESTONE_REWARDS = [20, 30, 50];
const MISSION_TRACKS = [
  { id: 'distance', targets: [250, 750, 1500], title: target => `Travel ${target.toLocaleString()} m` },
  { id: 'records', targets: [20, 50, 100], title: target => `Collect ${target} records` },
  { id: 'stunts', targets: [2, 5, 10], title: target => `Clear ${target} hazards with jumps or rolls` },
];
/** Each track pays every reached milestone, even after a crash or early exit. */
export function getMissions(game) {
  const run = record(game);
  const stats = record(run.stats);
  return MISSION_TRACKS.map(track => {
    const value = count(track.id === 'distance' ? run.distance : stats[track.id]);
    const reached = track.targets.filter(target => value >= target).length;
    const index = Math.min(reached, track.targets.length - 1), target = track.targets[index];
    return { id: track.id, title: track.title(target), current: Math.min(value, target), target,
      complete: reached === track.targets.length, reached, reward: MILESTONE_REWARDS[index],
      earned: MILESTONE_REWARDS.slice(0, reached).reduce((sum, reward) => sum + reward, 0), earnedXP: reached * 50 };
  });
}

/** Bounded even for huge saves. Also migrates legacy contract overflow once. */
function settleContracts(profile) {
  const before = profile.wallet;
  for (const contract of CONTRACTS) {
    const saved = profile.contracts[contract.id];
    while (saved.tier < 9 && saved.progress >= contractGoal(contract, saved.tier)) {
      saved.progress -= contractGoal(contract, saved.tier);
      profile.wallet = count(profile.wallet + contractReward(contract, saved.tier));
      saved.tier++;
    }
    if (saved.tier >= 9) {
      const completed = Math.floor(saved.progress / contractGoal(contract, saved.tier));
      saved.progress %= contractGoal(contract, saved.tier);
      profile.wallet = count(profile.wallet + completed * contractReward(contract, saved.tier));
      saved.tier = count(saved.tier + completed);
    }
  }
  return profile.wallet - before;
}

/** One settlement produces both the saved profile and its displayed receipt. */
export function settleRun(profile, game, { date, daily = false } = {}) {
  const next = createProfile(profile);
  const walletBefore = next.wallet;
  const run = record(game);
  const stats = record(run.stats);
  const distance = amount(run.distance);
  const score = count(run.score);
  const maxCombo = Math.max(count(run.maxCombo), count(run.combo));
  const records = count(stats.records);
  const mode = daily ? 'daily' : MODE_IDS.includes(run.mode) ? run.mode : 'endless';
  const xp = runXP(run);
  if (mode !== 'daily' && Object.hasOwn(MASTERY, run.character)) next.mastery[run.character] = Math.min(MASTERY[run.character].target, next.mastery[run.character] + count(stats.mastery));
  const rewards = { ...runEarnings(run), contracts: 0, chapter: 0, xp };
  // Receipts report actual credited amounts, even at the storage safety cap.
  for (const key of ['collected', 'milestones', 'bonuses']) {
    const before = next.wallet;
    next.wallet = count(next.wallet + rewards[key]);
    rewards[key] = next.wallet - before;
  }
  if (mode === 'story' && run.completed === true && run.campaignEnded === true && objectiveProgress(run).complete) {
    const chapter = chapterById(run.chapterId), index = CHAPTERS.indexOf(chapter);
    if (distance >= chapter.length && index <= next.story.cleared) {
      next.story.bests[chapter.id] = Math.max(next.story.bests[chapter.id], score);
      if (index === next.story.cleared) {
        next.story.cleared++;
        const before = next.wallet;
        next.wallet = count(next.wallet + chapter.reward);
        rewards.chapter = next.wallet - before;
      }
    }
  }
  if (mode === 'tour') {
    next.tourStamps = Math.max(next.tourStamps, Math.min(3, count(run.tourCleared)));
    if (run.completed === true) next.tourWins = count(next.tourWins + 1);
  }
  for (const contract of CONTRACTS) {
    const saved = next.contracts[contract.id];
    saved.progress += contract.id === 'distance' ? count(distance) : count(stats[contract.id]);
  }
  rewards.contracts = settleContracts(next);
  const xpBefore = next.xp;
  next.xp = count(next.xp + xp);
  rewards.xp = next.xp - xpBefore;
  const modified = run.modifier && run.modifier !== 'none';
  if (modified) next.modifiedBest = Math.max(next.modifiedBest, score);
  else next.modeBests[mode] = Math.max(next.modeBests[mode], score);
  next.history.unshift({ mode, date: validDateKey(date), score, distance: count(distance), records, xp });
  next.history = next.history.slice(0, 8);
  next.runs = count(next.runs + 1);
  next.totalDistance = amount(next.totalDistance + distance);
  next.totalRecords = count(next.totalRecords + records);
  if (!modified && (mode === 'endless' || mode === 'daily')) {
    next.bestDistance = Math.max(next.bestDistance, distance);
    next.bestScore = Math.max(next.bestScore, score);
  }
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
  rewards.total = next.wallet - walletBefore;
  return { profile: next, rewards };
}

/** Recalculate revives from the original run baseline, never the crash payout. */
export function finishRun(profile, game, options) {
  return settleRun(profile, game, options).profile;
}

export function runEarnings(game) {
  const run = record(game), stats = record(run.stats);
  const collected = count(count(stats.records) * (run.modifier === 'rich' ? 2 : 1));
  const bonuses = count(run.bonusCredits);
  const milestones = getMissions(run).reduce((total, mission) => total + mission.earned, 0);
  return { collected, bonuses, milestones, total: count(collected + bonuses + milestones) };
}
export const runCredits = game => runEarnings(game).total;

export function purchase(profile, id) {
  const next = createProfile(profile), item = findItem(id);
  if (!item) return { profile: next, ok: false, message: 'Item unavailable.' };
  const price = itemPrice(item, next.shop);
  if (item.category === 'upgrade' && next.shop.upgrades[id] >= item.max) return { profile: next, ok: false, message: 'Already fully upgraded.' };
  if (item.category === 'supply' && next.shop.supplies[id] >= 9) return { profile: next, ok: false, message: 'You can hold nine of each supply.' };
  if (next.shop.owned.includes(id)) return { profile: next, ok: false, message: 'Already owned.' };
  if (next.wallet < price) return { profile: next, ok: false, message: `Need ${price - next.wallet} more records.` };
  next.wallet -= price;
  if (item.category === 'upgrade') next.shop.upgrades[id]++;
  else if (item.category === 'supply') next.shop.supplies[id]++;
  else next.shop.owned.push(id);
  return { profile: next, ok: true, message: `${item.name} purchased.` };
}

export function prepareRun(profile, mode) {
  const next = createProfile(profile);
  const daily = mode === 'daily', modifier = daily || mode === 'story' ? 'none' : next.preferences.modifier;
  const id = next.preferences.supply;
  const supply = !daily && modifier !== 'pure' && next.shop.supplies[id] > 0 ? findItem(id)?.power : null;
  if (supply) next.shop.supplies[id]--;
  return { profile: next, modifier, supply, upgrades: daily ? {} : { ...next.shop.upgrades },
    character: daily ? 'dub' : next.loadout.character, weapon: daily ? 'pulse' : next.loadout.weapon };
}
