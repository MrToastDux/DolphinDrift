// Crossing the fork commits the choice and enters the destination together.
export const DETOURS = [
  { id: 'reef', name: 'Reef tunnel', hint: 'Floaty jumps · coral hurdles', color: '#79e6ed', reward: 40 },
  { id: 'roof', name: 'Market rooftops', hint: 'Jump crates · roll under beams', color: '#ffc38b', reward: 50 },
  { id: 'dock', name: 'Cargo docks', hint: 'Weave between cargo stacks', color: '#b5a5ff', reward: 60 },
];

export function forkAt(index) {
  const start = index * 750 + 210;
  return { ...DETOURS[index % 3], index, start, decision: start, approach: start - 85, entranceEnd: start + 20, end: start + 270 };
}

export function updateRoutes(game) {
  if (game.mode === 'story') return;
  // Debug/practice jumps may skip whole districts; do not award skipped forks.
  game.forkIndex = Math.max(game.forkIndex, Math.floor(game.distance / 750));
  const fork = forkAt(game.forkIndex);
  if (game.distance >= fork.decision && !game.routeChoices.has(fork.index)) {
    const detour = game.player.lane === -1;
    game.routeChoices.set(fork.index, detour);
    game._events.push({ type: 'route-choice', text: detour ? `Entering ${fork.name}` : 'Main road selected' });
  }
  if (game.distance >= fork.end) {
    if (game.routeChoices.get(fork.index)) {
      game.bonusCredits += fork.reward;
      game._events.push({ type: 'milestone', text: `${fork.name} cleared · +${fork.reward} records` });
    }
    game.forkIndex++;
  }
}

export function routeAt(game, distance = game.distance) {
  if (game.mode === 'story') return null;
  const fork = forkAt(Math.floor(distance / 750));
  return distance >= fork.start && distance < fork.end && game.routeChoices.get(fork.index) ? fork : null;
}

export function routePrompt(game) {
  if (game.mode === 'story') return '';
  const fork = forkAt(game.forkIndex), remaining = fork.decision - game.distance;
  if (remaining > 0 && remaining <= 85) return `FORK ${Math.ceil(remaining)} m · LEFT: ${fork.name} (+${fork.reward}) · CENTRE / RIGHT: main road`;
  const route = routeAt(game);
  return route ? `${route.name} · ${route.hint} · ${Math.ceil(route.end - game.distance)} m` : '';
}
