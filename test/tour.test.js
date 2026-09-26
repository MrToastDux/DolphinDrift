import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { dodgeShots } from './combat-helper.js';
import { createProfile, finishRun, runCredits } from '../src/progression.js';
import { tourAt, contractGoal, CONTRACTS } from '../src/tour.js';

const hazards = new Set(['barrier','gate','tram','crate','buoy','cart','pulse']);
function empty(mode = 'endless') {
  const game = new Game({ mode, seed: 'tour-test' }); game.start();
  game.objects = []; game._nextRow = Infinity; return game;
}
function advance(game, seconds) { for (let t = 0; t < seconds - 1e-8; t += .05) game.update(.05); }
function hit(game, type) { game.objects.push({ id: 999, type, lane: 0, z: .01 }); game.update(.01); }

test('early rows are 9.07–11.73m apart with a coin-marked escape lane', () => {
  for (let seed=0; seed<40; seed++) {
    const game = new Game({seed});
    const rows = [...new Set(game.objects.filter(o=>hazards.has(o.type)).map(o=>o.z))].sort((a,b)=>a-b);
    assert.equal(rows[0], 80);
    for(let i=1;i<rows.length;i++) assert.ok(rows[i]-rows[i-1]>=17/1.875 && rows[i]-rows[i-1]<=22/1.875);
    for (const row of rows) {
      const blocked=game.objects.filter(o=>hazards.has(o.type)&&o.z===row).map(o=>o.lane);
      assert.ok(blocked.length<=2);
      const coins=game.objects.filter(o=>o.type==='coin' && o.z===row);
      assert.equal(coins.length,1); assert.ok(!blocked.includes(coins[0].lane));
    }
  }
});

test('tour boundaries and Story boss pickups leave a reachable route', () => {
  assert.equal(tourAt(509).encounter,false); assert.equal(tourAt(510).encounter,true);
  assert.equal(tourAt(750).index,1); assert.equal(tourAt(2250).encounter,false);
  for (let index=0;index<3;index++) {
    const game=empty('story'); game.chapterId=['breaker','manta','finale'][index]; game.distance=game.chapter.length-270; game.speed=30;
    game._nextRow=game.distance; game._fillTrack();
    assert.equal(game.objects.some(o=>o.type==='pulse'),false,'Boss arenas use aimed shots, not lane walls');
    const energy=game.objects.filter(o=>o.type==='energy');assert.ok(energy.length>=3);
    for(const pickup of energy) assert.ok([-1,0,1].includes(pickup.lane));
    assert.equal(game.objects.some(o=>o.bonus),false);
  }
});

test('three checkpoints reward once, tour finishes at exactly 2250m and resets', () => {
  const game=empty('tour');
  for(let index=0;index<3;index++) {
    game.distance=(index+1)*750-.01; game.update(.05);
    assert.equal(game.tourCleared,index+1); assert.equal(game.stats.bosses,0);
  }
  assert.equal(game.distance,2250); assert.equal(game.completed,true); assert.equal(game.state,'over');
  assert.equal(game.bonusCredits,300); game.update(.1); assert.equal(game.bonusCredits,300);
  game.coins=500; assert.equal(game.revive(),false);
  const profile=finishRun(createProfile(),game);
  assert.equal(profile.tourWins,1); assert.equal(profile.tourStamps,3); assert.ok(profile.modeBests.tour>0);
  assert.equal(profile.bestScore,0);
  game.start(); assert.equal(game.tourCleared,0); assert.equal(game.completed,false); assert.equal(game.bonusCredits,0);
});

test('full generated tours can be finished by steering through the clear lanes', () => {
  for(let seed=0;seed<10;seed++) {
    const game=new Game({mode:'tour',seed});game.start();
    for(let frame=0;frame<25000&&game.state==='playing';frame++) {
      const upcoming=game.objects.filter(o=>hazards.has(o.type)&&o.z>0).sort((a,b)=>a.z-b.z);
      const next=upcoming[0];
      if(next&&next.z/game.speed<.65) {
        const blocked=upcoming.filter(o=>Math.abs(o.z-next.z)<.01).map(o=>o.lane);
        const safe=[-1,0,1].filter(lane=>!blocked.includes(lane)).sort((a,b)=>Math.abs(a-game.player.lane)-Math.abs(b-game.player.lane))[0];
        if(safe<game.player.lane)game.action('left');
        if(safe>game.player.lane)game.action('right');
      }
      dodgeShots(game);game.update(1/60);
    }
    assert.equal(game.completed,true,`seed ${seed} stopped at ${game.distance}`);
    assert.equal(game.tourCleared,3);
  }
});

test('stunts reward actual jump and roll clears, chain, charge dash and expire on active time', () => {
  const game=empty(); game.action('jump'); advance(game,.4); hit(game,'crate');
  assert.equal(game.stats.stunts,1); assert.equal(game.stuntChain,1); assert.equal(game.dashCharge,3);
  const first=game.score; game.update(.05); assert.ok(game.score-first<2,'passing the same hazard does not pay twice');
  advance(game,.7); game.action('roll'); hit(game,'gate');
  assert.equal(game.stats.stunts,2); assert.equal(game.stuntChain,2); assert.equal(game.lastStunt,'Limbo roll');
  assert.ok(game.score>=300); game.pause(); const remaining=game.stuntRemaining;
  advance(game,2); assert.equal(game.stuntRemaining,remaining); game.resume(); advance(game,5.1); assert.equal(game.stuntChain,0);
  game.reset(); assert.equal(game.stats.stunts,0); assert.equal(game.stuntChain,0);
});

test('protection, ordinary lane dodges and failed jumps cannot farm stunt chains', () => {
  for(const protection of ['ghost','dash','flight','none']) {
    const game=empty('endless');
    game.action('jump'); advance(game,.4);
    if(protection==='ghost')game.powerups.ghost=5;
    if(protection==='dash')game.dashRemaining=2;
    if(protection==='flight')game.surfRemaining=2;
    hit(game,protection==='none'?'tram':'crate'); assert.equal(game.stats.stunts,0);
  }
  const game=empty(); game.stuntChain=3; game.stuntRemaining=4; game.powerups.shield=2;
  hit(game,'tram'); assert.equal(game.stuntChain,0);
});

test('contracts accumulate across runs, pay automatically, carry excess and scale their next goal', () => {
  const baseline=createProfile({wallet:0});
  const run={distance:800,stats:{records:60,stunts:7},mode:'endless'};
  const first=finishRun(baseline,run);
  assert.equal(first.contracts.distance.progress,800); assert.equal(first.contracts.records.progress,60);
  const second=finishRun(first,run);
  assert.equal(second.wallet,runCredits(run)*2+240);
  assert.deepEqual(second.contracts.distance,{tier:1,progress:100});
  assert.deepEqual(second.contracts.records,{tier:1,progress:20});
  assert.deepEqual(second.contracts.stunts,{tier:1,progress:2});
  assert.equal(contractGoal(CONTRACTS[0],1),3000);
  assert.deepEqual(createProfile(JSON.parse(JSON.stringify(second))),second);
  assert.equal(baseline.contracts.records.progress,0);
});

test('contract migration handles corrupt saves, huge totals and revived run recalculation', () => {
  const baseline=createProfile({contracts:{records:{tier:Infinity,progress:-2},stunts:{tier:2,progress:Infinity}},tourStamps:50});
  assert.deepEqual(baseline.contracts.records,{tier:0,progress:0}); assert.equal(baseline.tourStamps,3);
  const run={distance:1600,stats:{records:120,stunts:15}};
  const first=finishRun(baseline,run);
  const revived=finishRun(baseline,{...run,stats:{records:130,stunts:15}});
  assert.equal(first.contracts.records.tier,revived.contracts.records.tier);
  assert.equal(revived.contracts.records.progress,30); assert.equal(revived.runs,1);
  const huge=finishRun(baseline,{distance:1e100,stats:{records:1e100,stunts:1e100}});
  assert.ok(Number.isFinite(huge.wallet));
  for(const contract of CONTRACTS) assert.ok(huge.contracts[contract.id].progress<contractGoal(contract,huge.contracts[contract.id].tier));
});
