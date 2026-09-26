// Uses real movement inputs; never teleports or grants invulnerability.
export function dodgeShots(game, collect = false) {
  const incoming = game.projectiles.filter(s => !s.removed && s.travel - s.age < 1.15);
  if (collect && game.boss?.charge > 0 && !game.boss.shot) {
    const target = incoming.find(s => Math.abs(game.player.x-s.targetX)<.4 && Math.abs(game.playerHeight-s.targetY)<.7);
    if (target && target.travel-target.age > .12) {
      if (target.travel-target.age <= .44) game.counter();
      return;
    }
  }
  if (!incoming.length) {
    if (collect && game.boss && !game.boss.defeated) {
      const energy = game.objects.filter(o=>o.type==='energy' && o.z>0).sort((a,b)=>a.z-b.z)[0];
      if(energy?.lane<game.player.lane)game.action('left');
      if(energy?.lane>game.player.lane)game.action('right');
    }
    return;
  }
  const candidates = [-1, 0, 1].filter(lane => incoming.every(s => Math.abs(lane - s.targetX) > .6));
  const energy = collect && game.objects.filter(o=>o.type==='energy' && o.z>0).sort((a,b)=>a.z-b.z)[0];
  // Take safe collection opportunities even while another lane is under fire.
  candidates.sort((a,b) => (energy ? Math.abs(a-energy.lane)-Math.abs(b-energy.lane) : 0) || Math.abs(a-game.player.lane)-Math.abs(b-game.player.lane));
  const safe = candidates[0];
  if (safe < game.player.lane) game.action('left');
  if (safe > game.player.lane) game.action('right');
}
