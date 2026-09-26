import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { SHOP_ITEMS, itemPrice } from '../src/catalog.js';
import { CHARACTERS, CREW_RECORDS, characterUnlocked } from '../src/adventure.js';
import { CONTRACTS, contractGoal } from '../src/tour.js';
import { createProfile, finishRun, settleRun, getMissions, runCredits, runXP, prepareRun, purchase } from '../src/progression.js';

const shortRun = { mode: 'endless', distance: 250, score: 500, coins: 0, stats: { records: 20, stunts: 0 } };

test('early and later milestones pay reached tiers, without waiting for the whole track', () => {
  assert.equal(runCredits({}), 0);
  assert.equal(runXP({}), 0);
  assert.equal(runCredits(shortRun), 60);
  assert.equal(runXP(shortRun), 165);
  const almost = { distance: 249.99, stats: { records: 19, stunts: 1 } };
  assert.equal(runCredits(almost), 19);
  const reached = getMissions({ distance: 750, stats: { records: 50, stunts: 5 } });
  assert.deepEqual(reached.map(m => [m.reached, m.earned, m.target]), [[2,50,1500],[2,50,100],[2,50,10]]);
  const full = { distance: 1500, stats: { records: 100, stunts: 10 } };
  assert.equal(runCredits(full), 400);
  assert.ok(getMissions(full).every(m => m.complete && m.earned === 100));
  assert.equal(runCredits({ ...full, distance: 20000, coins: 1e6 }), 400, 'milestones have a per-run cap');
});

test('receipts reconcile collected records, milestones, contracts, bonuses and first clears', () => {
  const base = createProfile({ wallet: 41 });
  const game = { mode: 'story', chapterId: 'signal', completed: true, campaignEnded: true,
    distance: 450, stats: { records: 100, stunts: 2 }, bonusCredits: 10, coins: 0, score: 1000 };
  const { profile, rewards } = settleRun(base, game);
  assert.deepEqual(rewards, { collected: 100, bonuses: 10, milestones: 140, contracts: 60, chapter: 100, total: 410, xp: 495 });
  assert.equal(profile.wallet - base.wallet, rewards.total);
  assert.equal(profile.story.cleared, 1);
  assert.equal(settleRun(profile, game).rewards.chapter, 0, 'chapter replay never repays first clear');
  assert.deepEqual(settleRun(base, game).profile, profile, 'settlement has no side effects');
  const rich = settleRun(base, { ...shortRun, modifier: 'rich' });
  assert.equal(rich.rewards.collected, 40);
  assert.equal(rich.rewards.milestones, 40, 'Gold rush only doubles collected records');
});

test('short runs have attainable purchases and cumulative crew progress', () => {
  let profile = createProfile({ wallet: 0 });
  profile = finishRun(profile, shortRun);
  assert.equal(purchase(profile, 'magnet-upgrade').ok, false, 'first magnet now costs 90 records');
  for (let i = 1; i < 10; i++) profile = finishRun(profile, shortRun);
  assert.equal(profile.wallet, 740, 'ten 20-record runs bank 600 plus 140 in contracts');
  assert.equal(profile.totalRecords, 200);
  assert.equal(characterUnlocked(CHARACTERS[1], profile), true);
  assert.equal(characterUnlocked(CHARACTERS[2], profile), false);
});

test('receipts still reconcile at the wallet and XP storage safety caps', () => {
  const base = createProfile({ wallet: 1e12 - 10, xp: 1e12 - 5 });
  const { profile, rewards } = settleRun(base, shortRun);
  assert.equal(profile.wallet, 1e12);
  assert.equal(profile.xp, 1e12);
  assert.equal(rewards.total, 10);
  assert.equal(rewards.xp, 5);
  assert.equal(['collected','milestones','bonuses','chapter','contracts'].reduce((sum,key)=>sum+rewards[key],0),10);
});

test('legacy contract overflow pays once and never discards partial effort', () => {
  const legacy = { wallet: 80, contracts: { distance: { tier: 9, progress: 14000 } },
    shop: { owned: ['sunset'], upgrades: { 'surf-upgrade': 3 }, supplies: { 'supply-shield': 7 } },
    story: { cleared: 5, bests: { manta: 1234 } }, loadout: { character: 'turtle', weapon: 'lance' },
    xp: 1300, options: { style: 'gold' }, daily: { date: '2026-09-24', bestScore: 888, bestDistance: 600 },
    modeBests: { sprint: 999 }, history: [{ mode: 'sprint', score: 999 }] };
  const original = structuredClone(legacy), migrated = createProfile(legacy);
  assert.deepEqual(migrated.contracts.distance, { tier: 12, progress: 500 });
  assert.equal(migrated.wallet, 860);
  assert.deepEqual(createProfile(JSON.parse(JSON.stringify(migrated))), migrated);
  assert.deepEqual(legacy, original);
  assert.equal(migrated.shop.upgrades['surf-upgrade'], 3);
  assert.equal(migrated.shop.supplies['supply-shield'], 7);
  assert.deepEqual(migrated.shop.owned, ['sunset']);
  assert.deepEqual(migrated.loadout, { ...legacy.loadout, outfit: 'classic' });
  assert.equal(migrated.story.bests.manta, 1234);
  assert.equal(migrated.options.style, 'gold');
  assert.equal(migrated.xp, 1300);
  assert.deepEqual(migrated.daily, legacy.daily);
  assert.equal(migrated.history[0].mode, 'sprint');
  for (const contract of CONTRACTS) assert.equal(contractGoal(contract, 100), contract.target * 3);
});

test('crew unlocks use lifetime collection OR Story, without spending or skipping chapters', () => {
  for (const character of CHARACTERS.slice(1)) {
    const target = CREW_RECORDS[character.id];
    assert.equal(characterUnlocked(character, createProfile({ totalRecords: target - 1 })), false);
    const collected = createProfile({ totalRecords: target, wallet: 0, loadout: { character: character.id, weapon: 'lance' } });
    assert.equal(collected.loadout.character, character.id);
    assert.equal(collected.story.cleared, 0);
    assert.equal(collected.loadout.weapon, 'pulse');
    assert.equal(collected.wallet, 0);
    assert.deepEqual(createProfile(JSON.parse(JSON.stringify(collected))), collected);
    const story = createProfile({ story: { cleared: character.chapter }, loadout: { character: character.id } });
    assert.equal(story.loadout.character, character.id, 'existing chapter unlocks remain valid with no records');
  }
});

test('new prices preserve upgrade effects and enforce affordability, caps and supply consumption', () => {
  const totals = [];
  for (const item of SHOP_ITEMS.filter(item => item.category === 'upgrade')) {
    let profile = createProfile({ wallet: 1000 });
    const prices = [];
    for (let level = 0; level < 3; level++) {
      const price = itemPrice(item, profile.shop); prices.push(price);
      const poor = createProfile({ wallet: price - 1, shop: profile.shop });
      assert.equal(purchase(poor, item.id).ok, false);
      assert.equal(purchase(poor, item.id).profile.wallet, price - 1);
      const result = purchase(profile, item.id); assert.equal(result.ok, true); profile = result.profile;
    }
    assert.equal(purchase(profile, item.id).ok, false);
    assert.equal(profile.shop.upgrades[item.id], 3);
    totals.push(prices.reduce((a,b) => a+b, 0));
  }
  assert.deepEqual(totals, [450,495,585,428,563,428,630]);
  const profile = createProfile({ wallet: 20, preferences: { supply: 'supply-shield' } });
  const bought = purchase(profile, 'supply-shield').profile;
  assert.equal(bought.wallet, 0);
  assert.equal(prepareRun(bought, 'daily').profile.shop.supplies['supply-shield'], 1);
  assert.equal(prepareRun(bought, 'endless').profile.shop.supplies['supply-shield'], 0);
  assert.equal(purchase(createProfile({ wallet: 500, shop: { supplies: { 'supply-shield': 9 } } }), 'supply-shield').ok, false);
});

test('revive recalculation replaces the crash receipt, crew progress and contract payouts', () => {
  const baseline = createProfile({ wallet: 10, totalRecords: 80, contracts: { records: { tier: 0, progress: 80 } } });
  const crash = settleRun(baseline, shortRun);
  const continued = { ...shortRun, distance: 750, coins: 0, stats: { records: 50, stunts: 2 }, usedRevive: true };
  const final = settleRun(baseline, continued);
  assert.equal(crash.profile.totalRecords, 100);
  assert.equal(final.profile.totalRecords, 130);
  assert.equal(final.profile.runs, 1); assert.equal(final.profile.history.length, 1);
  assert.equal(final.rewards.contracts, 60);
  assert.deepEqual(final.profile.contracts.records, { tier: 1, progress: 30 });
  assert.equal(final.profile.wallet, baseline.wallet + final.rewards.total);
  assert.equal(final.profile.wallet - crash.profile.wallet, final.rewards.total - crash.rewards.total);
});

test('Daily simulation and scores are identical for new and fully upgraded profiles', () => {
  const newbie = createProfile();
  const veteran = createProfile({ wallet: 50000, xp: 5000, totalRecords: 10000, story: { cleared: 6 },
    loadout: { character: 'turtle', weapon: 'lance' }, preferences: { modifier: 'rich', supply: 'supply-dash' },
    shop: { upgrades: Object.fromEntries(SHOP_ITEMS.filter(item => item.category === 'upgrade').map(item => [item.id, item.max])), supplies: { 'supply-dash': 9 } } });
  const makeGame = profile => {
    const prepared = prepareRun(profile, 'daily');
    const game = new Game({ mode: 'daily', seed: '2026-09-24' });
    for (const key of ['character','weapon','modifier','supply','upgrades']) game[key] = prepared[key];
    game.start(); return game;
  };
  const a = makeGame(newbie), b = makeGame(veteran);
  assert.deepEqual(a.objects, b.objects);
  assert.equal(a.comboDuration, b.comboDuration);
  assert.equal(a.surfDuration, 20); assert.equal(b.powerDuration('magnet'), 10);
  assert.equal(b.dashDuration, 3);
  assert.equal(b.powerDuration('shield'), 12);
  assert.equal(b.powerDuration('ghost'), 6);
  assert.equal(b.powerDuration('spring'), 12);
  for (let frame = 0; frame < 1800; frame++) {
    const action = ['ability','left','jump','right','slide','dash'][Math.floor(frame / 60) % 6];
    if (frame % 60 === 0) { a.action(action); b.action(action); }
    a.update(1/60); b.update(1/60);
  }
  assert.deepEqual(a.snapshot(), b.snapshot());
  const before = a.snapshot();
  const first = settleRun(newbie, a, { daily: true, date: '2026-09-24' });
  const experienced = settleRun(veteran, b, { daily: true, date: '2026-09-24' });
  assert.deepEqual(first.profile.daily, experienced.profile.daily);
  assert.deepEqual(a.snapshot(), before, 'bank rewards cannot affect run score, balance or seed');
  assert.equal(experienced.profile.shop.supplies['supply-dash'], 9);
});
