import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, BOSS_RECHARGE_SECONDS } from '../src/game.js';
import { bossVolley } from '../src/tour.js';

function arena(stage=0) {
  const g=new Game({mode:'story',seed:91});g.chapterId=['breaker','manta','finale'][stage];g.start();g.distance=g.chapter.length-330;
  g.objects=[];g._nextRow=Infinity;g.update(.01);if(stage===2)g.boss.volley=2;g.reviveGrace=0;g.drainEvents();return g;
}
function advance(g,seconds,step=.01) { for(let t=0;t<seconds-1e-9;t+=step)g.update(Math.min(step,seconds-t)); }
function shot(g,extra={}) {
  const value={id:100,volley:1,bossStage:g.boss.stage,kind:'cannon',targetX:0,targetY:.95,age:0,travel:.1,radius:.15,primary:true,muzzle:0,...extra};
  g.projectiles.push(value);return value;
}

test('all boss weapons telegraph, lock onto actual fractional position and stop tracking after launch',()=>{
  for(let stage=0;stage<3;stage++) {
    const g=arena(stage),spec=bossVolley(stage);
    g.player.lane=.31;g.player.x=.31;g.boss.cooldown=0;g.update(.01);
    assert.equal(g.boss.aiming,true);assert.equal(g.projectiles.length,0);
    advance(g,spec.windup+.01);
    assert.equal(g.projectiles.length,spec.count);assert.equal(g.boss.aiming,false);
    const targets=g.projectiles.map(s=>s.targetX);
    assert.ok(Math.abs(targets.reduce((a,b)=>a+b,0)/targets.length-.31)<1e-8);
    g.player.lane=-1;advance(g,.3);assert.deepEqual(g.projectiles.map(s=>s.targetX),targets);
    assert.equal(g.objects.some(o=>o.type==='pulse'),false);
  }
});

test('travel and collision use active seconds at different speeds and cannot tunnel on a long frame',()=>{
  for(const elapsed of [0,100,500]) {
    const g=arena();g.elapsedTime=elapsed;shot(g,{travel:.075});g.update(.1);
    assert.equal(g.state,'over');assert.equal(g.boss.damageTaken,1);
    assert.equal(g.drainEvents().filter(e=>e.type==='crash').length,1);
  }
});

test('jump, roll and steering evade locked shots; staying still gets hit',()=>{
  for(const action of ['jump','roll','left',null]) {
    const g=arena();shot(g,{travel:action==='left'?.5:.32});if(action)g.action(action);
    advance(g,.51);assert.equal(g.state,action?'playing':'over',String(action));
    assert.equal(g.combat.dodges,action?1:0);
  }
});

test('shield absorbs a volley once, ghost and dash protect, and protected passes do not farm dodge rewards',()=>{
  for(const protection of ['shield','ghost','dash','revive']) {
    const g=arena();
    if(protection==='dash')g.dashRemaining=2;else if(protection==='revive')g.reviveGrace=2;else g.powerups[protection]=2;
    shot(g);shot(g,{id:101});advance(g,.2);
    assert.equal(g.state,'playing');assert.equal(g.combat.dodges,0);
    assert.equal(g.stats.shieldsUsed,protection==='shield'?1:0);
    assert.equal(g.boss.damageTaken,protection==='shield'?1:0);
  }
});

test('deflections require proximity and timing, clear the whole volley, refund energy and pay once',()=>{
  for(const [eta,x,expected] of [[.3,0,true],[.7,0,false],[.06,0,false],[.3,1,false]]) {
    const g=arena();g.player.x=x;g.player.lane=x;
    shot(g,{travel:eta});shot(g,{id:101,travel:eta+.26,primary:false});
    assert.equal(g.counter(),true);assert.equal(g.boss.precisionShot,expected);
    assert.equal(g.boss.charge,expected?1:0);assert.equal(g.counter(),false);
    if(expected) {
      advance(g,.5);assert.equal(g.state,'playing');assert.equal(g.projectiles.length,0);
      assert.equal(g.combat.deflections,1);assert.equal(g.boss.hp,4);
      assert.equal(g.drainEvents().filter(e=>e.type==='perfect-counter').length,1);
      advance(g,.2);assert.equal(g.drainEvents().filter(e=>e.type==='perfect-counter').length,0);
    }
  }
});

test('energy regenerates, caps at three, and pause freezes aiming, shots and recharge',()=>{
  const g=arena();g.boss.charge=0;g.boss.cooldown=100;shot(g,{travel:20});
  advance(g,BOSS_RECHARGE_SECONDS+.01);assert.equal(g.boss.charge,1);
  g.pause();const before=g.snapshot();advance(g,8);assert.deepEqual(g.snapshot(),before);
  g.resume();advance(g,8);assert.equal(g.boss.charge,3);
  const snapshot=g.snapshot();snapshot.projectiles[0].targetX=500;assert.equal(g.projectiles[0].targetX,0);
});

test('dodges and grazes build streaks, charge dash, and award only once per volley',()=>{
  const g=arena();g.boss.cooldown=100;
  shot(g,{targetX:.7});advance(g,.15);
  assert.equal(g.combat.dodges,1);assert.equal(g.combat.streak,1);assert.equal(g.dashCharge,4);
  assert.equal(g.drainEvents().filter(e=>e.type==='graze').length,1);
  advance(g,.2);assert.equal(g.combat.dodges,1);
  shot(g,{targetX:1.1});advance(g,.15);assert.equal(g.combat.streak,2);assert.equal(g.dashCharge,6);
  g.powerups.shield=2;shot(g);advance(g,.15);assert.equal(g.combat.streak,0);assert.equal(g.combat.bestStreak,2);
});

test('overdrive starts at half armor and flawless loot is paid exactly once',()=>{
  for(const damaged of [false,true]) {
    const g=arena();g.boss.cooldown=100;if(damaged)g.boss.damageTaken=1;
    for(let i=0;i<g.boss.maxHP;i++){g.boss.charge=1;g.counter();advance(g,.42);}
    assert.equal(g.boss.phase,2);assert.equal(g.boss.defeated,true);
    assert.equal(g.bonusCredits,damaged?100:150);assert.equal(g.combat.flawless,damaged?0:1);
    advance(g,1);assert.equal(g.bonusCredits,damaged?100:150);
  }
});

test('revive, checkpoint and restart remove hostile rounds without losing boss damage',()=>{
  const g=arena();g.boss.hp=2;shot(g);advance(g,.15);g.coins=100;
  assert.equal(g.revive(),true);assert.equal(g.projectiles.length,0);assert.equal(g.boss.hp,2);
  shot(g,{travel:10});g.distance=g.chapter.length;g.update(.01);assert.equal(g.boss,null);assert.equal(g.projectiles.length,0);
  g.start();assert.equal(g.combat.deflections,0);assert.equal(g.projectiles.length,0);
});

test('avoiding the center of a fan while hitting its edge cannot award a clean dodge',()=>{
  const g=arena(2);g.player.x=.55;g.player.lane=.55;
  shot(g,{targetX:0,radius:.13});shot(g,{targetX:.38,radius:.13,primary:false});
  advance(g,.15);assert.equal(g.combat.dodges,0);assert.equal(g.state,'over');assert.equal(g.dashCharge,0);
});
