import { DIFFICULTY_PRESSURE } from './balance.js';

export const TOUR_LENGTH = 2250;
export const TOUR_STAGES = Object.freeze([
  { name: 'Palm Line', boss: 'Clawbreaker', kind: 'crab', title: 'THE BASS-POWERED CRAB', color: '#ffb05f', reward: 60, armor: 4 },
  { name: 'Sunset Market', boss: 'Scarlet Manta', kind: 'manta', title: 'PIRATE OF THE MARKET SKY', color: '#ff82ba', reward: 90, armor: 5 },
  { name: 'Neon Harbour', boss: 'Volt Kraken', kind: 'kraken', title: 'THE DEEP WAKES UP', color: '#78f4e6', reward: 150, armor: 6 },
]);

export function tourAt(distance) {
  const index = Math.min(2, Math.floor(Math.max(0, distance) / 750));
  const start = index * 750, end = start + 750;
  return { ...TOUR_STAGES[index], index, start, end, bossStart: end - 240,
    encounter: distance >= end - 240 && distance < end,
    remaining: Math.max(0, end - distance) };
}

// Shots lock on after a visible wind-up. Travel time is independent of run speed.
const VOLLEYS = [1, 2].map(phase => {
  const fury = phase === 2;
  return [
    { name: 'Bass cannon', kind: 'cannon', count: 1, spread: 0, stagger: 0, travel: 1.35, radius: .23 },
    { name: 'Twin missiles', kind: 'missile', count: 2, spread: 0, stagger: .26, travel: 1.15, radius: .15 },
    { name: 'Plasma fan', kind: 'plasma', count: 3, spread: .38, stagger: 0, travel: 1.3, radius: .13 },
  ].map(spec => ({ ...spec, windup: fury ? .65 : .9, cooldown: fury ? .65 : 1.05,
    travel: spec.travel - (fury ? .12 : 0) }))
    .map(spec => ({ ...spec, interval: (spec.windup + spec.travel + (spec.count - 1) * spec.stagger + spec.cooldown) / DIFFICULTY_PRESSURE }));
});
export function bossVolley(stage, phase = 1) {
  return VOLLEYS[phase === 2 ? 1 : 0][stage];
}

export const CONTRACTS = Object.freeze([
  { id: 'distance', name: 'Island mileage', unit: 'metres', target: 1500, reward: 80 },
  { id: 'records', name: 'Record label', unit: 'records', target: 100, reward: 60 },
  { id: 'stunts', name: 'Stunt school', unit: 'clean clears', target: 12, reward: 100 },
]);

export function contractGoal(contract, tier) {
  return contract.target * (1 + Math.min(2, tier));
}

export function contractReward(contract, tier) {
  return contract.reward + Math.min(9, tier) * 20;
}
