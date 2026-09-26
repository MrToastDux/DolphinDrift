import { characterById, weaponById } from './adventure.js';

export function defeatEnemy(game, enemy, damage = 99) {
  if (!game.combatEnabled || enemy.collected || enemy._passed) return;
  enemy.hp -= damage;
  enemy.hit = .2;
  if (enemy.hp > 0) return;
  enemy.collected = true;
  game.stats.enemies++;
  game._score += 150 * game.multiplier;
  game.bonusCredits += 5;
  game.specialCharge = Math.min(100, game.specialCharge + 20);
  game._events.push({ type: 'enemy-defeat' });
}

export function fireWeapon(game) {
  if (!game.combatEnabled || game.state !== 'playing' || game.fireCooldown > 0) return false;
  const spec = weaponById(game.weapon);
  const targets = game.objects.filter(o => o.type === 'enemy' && !o.collected && !o._passed && o.z > 0 && o.z < 100).sort((a, b) => a.z - b.z);
  game.fireCooldown = spec.cooldown;
  const selected = spec.id === 'scatter' ? targets.slice(0, 3) : spec.id === 'lance' ? targets.filter(o => o.lane === targets[0]?.lane) : targets.slice(0, 1);
  // Resolve a visible travelling shot, so changing lanes cannot retarget it later.
  game.sonicShots.push({ life: .24, max: .24, from: game.player.x, color: spec.color, targets: selected.map(o => ({ id: o.id, lane: o.lane, z: o.z })), damage: spec.damage });
  game._events.push({ type: 'counter' });
  return true;
}

export function useAbility(game) {
  if (game.state !== 'playing' || game.abilityCooldown > 0 || game.surfRemaining > 0) return false;
  const spec = characterById(game.character);
  game.abilityCooldown = spec.cooldown;
  game.abilityRemaining = spec.id === 'shark' ? 3 : spec.id === 'turtle' ? 5 : spec.id === 'octo' ? 1.2 : 4;
  if (spec.id === 'dub') {
    game.dashCharge = Math.min(25, game.dashCharge + 5);
  } else if (spec.id === 'octo') {
    const target = game.combatEnabled && game.objects.filter(o => o.type === 'enemy' && o.z > 0 && o.z < 45 && !o.collected).sort((a,b) => a.z-b.z)[0];
    if (target) {
      game.grapple = { lane: target.lane, z: target.z, life: .5 };
      defeatEnemy(game, target);
    }
    for (const object of game.objects) if (object.type === 'coin' && !object.sky && !object.collected && !object._passed && object.z > 0 && object.z < 28) game._collectCoin(object, true);
    game.player.sliding = false; game.player.slideRemaining = 0;
    game.player.jump = Math.max(.001, game.player.jump); game.player.springJump = true; game._jumpVelocity = 10.8;
  }
  game._events.push({ type: 'ability' });
  return true;
}

export function tidalBlast(game) {
  if (!game.combatEnabled || game.state !== 'playing' || game.specialCharge < 100) return false;
  game.specialCharge = 0;
  game.blastRemaining = .65;
  game.reviveGrace = Math.max(game.reviveGrace, 1);
  for (const enemy of game.objects) if (enemy.type === 'enemy' && enemy.z > 0 && enemy.z < 100) defeatEnemy(game, enemy);
  game.enemyBolts.length = 0;
  game.projectiles.length = 0;
  if (game.boss && !game.boss.defeated) game.damageBoss(3);
  game.specialCharge = 0;
  game._events.push({ type: 'blast' });
  return true;
}

export function tickCombat(game, dt) {
  game.fireCooldown = Math.max(0, game.fireCooldown - dt);
  game.abilityCooldown = Math.max(0, game.abilityCooldown - dt);
  const wasActive = game.abilityRemaining > 0;
  game.abilityRemaining = Math.max(0, game.abilityRemaining - dt);
  if (wasActive && !game.abilityRemaining && game.character !== 'dub') game.reviveGrace = Math.max(game.reviveGrace, .7);
  game.blastRemaining = Math.max(0, game.blastRemaining - dt);
  if (game.grapple) { game.grapple.life -= dt; if (game.grapple.life <= 0) game.grapple = null; }
  if (!game.combatEnabled) {
    game.sonicShots.length = 0; game.enemyBolts.length = 0;
    game.specialCharge = 0; game.blastRemaining = 0;
    return;
  }
  for (const shot of game.sonicShots) {
    shot.life -= dt;
    if (shot.life > 0) continue;
    for (const target of shot.targets) {
      const enemy = game.objects.find(o => o.id === target.id);
      if (enemy) defeatEnemy(game, enemy, shot.damage);
    }
  }
  game.sonicShots = game.sonicShots.filter(shot => shot.life > 0);
  for (const enemy of game.objects) {
    if (enemy.type !== 'enemy' || enemy.collected || enemy._passed) continue;
    enemy.hit = Math.max(0, (enemy.hit || 0) - dt);
    if (enemy.kind !== 'sentry' || enemy.z > 65 || enemy.z < 8 || enemy.fired) continue;
    enemy.aim = (enemy.aim || 0) + dt;
    if (enemy.aim < 1) { enemy.targetX = game.player.x; enemy.targetY = game.playerHeight; }
    else {
      enemy.fired = true;
      game.enemyBolts.push({ fromLane: enemy.lane, fromZ: enemy.z, targetX: enemy.targetX, targetY: enemy.targetY, age: 0, travel: 1.15 });
      game._events.push({ type: 'enemy-fire' });
    }
  }
  for (const bolt of game.enemyBolts) {
    bolt.age += dt;
    if (bolt.age < bolt.travel) continue;
    if (Math.abs(game.player.x - bolt.targetX) < .4 && Math.abs(game.playerHeight - bolt.targetY) < .6) {
      if (game.character === 'turtle' && game.abilityRemaining > 0) {
        const enemy = game.objects.find(o => o.type === 'enemy' && o.lane === bolt.fromLane && !o.collected && o.z > 0);
        if (enemy) defeatEnemy(game, enemy);
        game._events.push({ type: 'deflect' });
      } else game.takeCombatHit();
    }
  }
  game.enemyBolts = game.enemyBolts.filter(bolt => bolt.age < bolt.travel);
}
