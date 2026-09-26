import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';

test('retained modes keep the opening warm-up and intended obstacle spacing', () => {
  const hazards = new Set(['barrier', 'gate', 'tram', 'crate', 'buoy', 'cart', 'enemy']);
  const positions = mode => [...new Set(new Game({mode, random:()=>.5}).objects
    .filter(o=>hazards.has(o.type)).map(o=>o.z))].sort((a,b)=>a-b);
  for (const mode of ['endless', 'daily', 'tour', 'story']) {
    const rows = positions(mode);
    assert.equal(rows[0],80,'Keep the opening warm-up');
    // Compare rows before the intentionally obstacle-free fork approach.
    assert.ok(Math.abs((rows[3]-rows[0])/3-19.5/1.875)<1e-9);
  }
});

test('Story crab and manta keep the intended firing pressure in both phases', () => {
  const originalTravel = [1.35,1.15,1.3];
  for(let stage=0;stage<2;stage++) for(const phase of [1,2]) {
    const g=new Game({mode:'story',seed:7});g.chapterId=['breaker','manta'][stage];g.start();g.distance=g.chapter.length-340+(phase===2?145:10);
    g.reviveGrace=999;g._updateBoss(0);g.drainEvents();
    const fired=[];let maxShots=0;
    for(let frame=0;frame<120*12;frame++) {
      g._updateBoss(1/120);g._updateProjectiles(1/120);
      maxShots=Math.max(maxShots,g.projectiles.length);
      if(g.drainEvents().some(e=>e.type==='boss-fire'))fired.push(frame/120);
    }
    const previousInterval=originalTravel[stage]-(phase===2?.12:0)+(stage===1?.26:0)
      +(phase===2?.65:.9)+(phase===2?.65:1.05);
    assert.ok(fired.length>=5);
    for(let i=1;i<fired.length;i++)assert.ok(Math.abs(fired[i]-fired[i-1]-previousInterval/1.875)<.025);
    assert.ok(maxShots<=2*(stage+1),'Overlapping volleys remain bounded');
  }
});
