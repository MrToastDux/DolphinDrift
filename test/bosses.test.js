import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { SHOP_ITEMS } from '../src/catalog.js';
import { BossRig } from '../src/bosses.js';
import { dodgeShots } from './combat-helper.js';
import { createProfile, finishRun, purchase } from '../src/progression.js';

function encounter() {
  const game=new Game({mode:'story',seed:10});game.chapterId='breaker';game.start();
  game.distance=520;game.objects=[];game._nextRow=Infinity;game.update(.01);
  return game;
}
function advance(game,seconds) { for(let t=0;t<seconds-1e-8;t+=.05)game.update(.05); }

test('countershots consume energy, travel before hitting, reject spam and freeze with pause',()=>{
  const game=encounter();assert.equal(game.boss.hp,5);assert.equal(game.boss.charge,1);
  assert.equal(game.action('counter'),true);assert.equal(game.boss.hp,5);assert.equal(game.boss.charge,0);
  assert.equal(game.counter(),false);game.pause();const before=game.snapshot();advance(game,2);
  assert.deepEqual(game.snapshot(),before);assert.equal(game.counter(),false);
  game.resume();advance(game,.45);assert.equal(game.boss.hp,4);assert.equal(game.counter(),false);
  assert.equal(new Game().counter(),false);
});

test('energy diamonds require the correct lane, cannot harm the player, and cap at three shots',()=>{
  const game=encounter();game.boss.charge=0;
  game.objects=[{id:1,type:'energy',lane:-1,z:.01,bossStage:0}];game.update(.01);
  assert.equal(game.boss.charge,0);assert.equal(game.state,'playing');
  game.objects=Array.from({length:5},(_,i)=>({id:i,type:'energy',lane:0,z:.01,bossStage:0}));game.update(.01);
  assert.equal(game.boss.charge,3);assert.equal(game.coins,0);
  game.objects=[{id:8,type:'energy',lane:0,z:.01,bossStage:1}];game.boss.charge=0;game.update(.01);
  assert.equal(game.boss.charge,0);
});

test('breaking every armor segment knocks out a boss once, remove its attacks, preserve future bosses and bank bonus loot',()=>{
  const game=encounter();game.boss.charge=3;
  game.projectiles=[{id:1,travel:10,age:0,targetX:1,targetY:.95,bossStage:0}];
  game.objects=[{id:2,type:'energy',lane:1,z:1000,bossStage:1}];
  for(let i=0;i<game.boss.maxHP;i++){game.boss.charge=1;assert.equal(game.counter(),true);advance(game,.45);}
  assert.equal(game.boss.defeated,true);assert.equal(game.boss.hp,0);assert.equal(game.bossDefeats,1);
  assert.equal(game.bonusCredits,150);assert.equal(game.projectiles.length,0);
  assert.equal(game.objects.some(o=>o.bossStage===1),true);assert.equal(game.counter(),false);
  game._nextRow=game.distance+30;game._fillTrack();
  assert.equal(game.objects.some(o=>o.type==='pulse'&&o.bossStage===0),false);
  advance(game,1);assert.equal(game.bonusCredits,150);
  const baseline=createProfile(), saved=finishRun(baseline,game);
  assert.equal(finishRun(baseline,game).wallet,saved.wallet,'recalculation cannot duplicate the bonus');
});

test('reviving preserves boss damage; the next boss and a new run have fresh armor',()=>{
  const game=encounter();game.counter();advance(game,.45);
  game.objects=[{id:3,type:'tram',lane:0,z:.01}];game.update(.01);game.coins=100;
  assert.equal(game.state,'over');assert.equal(game.revive(),true);assert.equal(game.boss.hp,4);
  game.chapterId='manta';game.distance=620;game.objects=[];game._nextRow=Infinity;game.update(.01);
  assert.equal(game.boss.stage,1);assert.equal(game.boss.hp,6);assert.equal(game.boss.charge,1);
  game.reset();assert.equal(game.boss,null);assert.equal(game.bossDefeats,0);
});

test('boss meshes have depth, animated poses, removable armor and bounded low-detail geometry',()=>{
  const rig=new BossRig();
  for(let stage=0;stage<3;stage++) {
    const full=structuredClone(rig.build(stage,1,0,3));
    assert.ok(full.length>100);
    assert.ok(Math.max(...full.map(f=>f.depth))-Math.min(...full.map(f=>f.depth))>40);
    assert.ok(full.every((f,i)=>!i || full[i-1].depth>=f.depth));
    assert.ok(full.every(f=>f.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))));
    assert.notDeepEqual(rig.build(stage,2,1,3),full,'joints must move in the attack pose');
    assert.ok(rig.build(stage,1,0,1).length<full.length,'damage removes armor geometry');
    rig.lowDetail=true;assert.ok(rig.build(stage,1,0,3).length<full.length);rig.lowDetail=false;
  }
});

test('Story bosses can be defeated in their generated arenas by dodging, collecting and firing',()=>{
  const types=new Set(['pulse','barrier','gate','tram','crate','buoy','cart']);
  for(let seed=0;seed<3;seed++) for(const chapterId of ['breaker','manta','finale']) {
    const game=new Game({mode:'story',seed});game.chapterId=chapterId;game.start();
    game.distance=game.chapter.length-330;game.objects=[];game._nextRow=game.distance+30;game._fillTrack();
    for(let frame=0;frame<20000&&game.state==='playing';frame++) {
      const upcoming=game.objects.filter(o=>types.has(o.type)&&o.z>0).sort((a,b)=>a.z-b.z),next=upcoming[0];
      if(next&&next.z/game.speed<1) {
        const blocked=upcoming.filter(o=>Math.abs(o.z-next.z)<.01).map(o=>o.lane);
        const diamond=game.objects.find(o=>o.type==='energy'&&Math.abs(o.z-(next.z-10))<.01);
        const safe=diamond?.lane ?? [-1,0,1].filter(l=>!blocked.includes(l)).sort((a,b)=>Math.abs(a-game.player.lane)-Math.abs(b-game.player.lane))[0];
        if(safe<game.player.lane)game.action('left');if(safe>game.player.lane)game.action('right');
      }
      dodgeShots(game,true);
      // Save one energy for a timed deflection in the denser volley pattern.
      if (game.boss?.charge > 1 || game.chapter.length - game.distance < 15) game.counter();
      game.update(1/60);
    }
    assert.equal(game.completed,true,`seed ${seed} stopped at ${game.distance}`);
    assert.equal(game.bossDefeats,1,`seed ${seed} failed to knock out all bosses`);
    assert.equal(game.bonusCredits,150);
  }
});

test('20 new cosmetics can be bought, equipped and round-tripped without losing existing items',()=>{
  const newIds=['skin-orca','skin-koi','skin-cosmic','skin-cyber','skin-ice','skin-dragon','board-rocket','board-manta','board-skeleton','board-prism','hat-pirate','hat-antenna','hat-mohawk','hat-halo','hat-horns','hat-jelly','trail-flames','trail-notes','trail-petals','trail-pixels'];
  assert.equal(new Set(SHOP_ITEMS.map(item=>item.id)).size,SHOP_ITEMS.length);
  let profile=createProfile({wallet:20000,shop:{owned:['hat-crown']}});
  for(const id of newIds) {
    const item=SHOP_ITEMS.find(item=>item.id===id),before=profile.wallet;
    assert.ok(item);const result=purchase(profile,id);assert.equal(result.ok,true);profile=result.profile;
    assert.equal(profile.wallet,before-item.price);assert.equal(purchase(profile,id).ok,false);
    if(item.category==='skin')profile.options.style=id;else profile.shop.equipped[item.category]=id;
    const loaded=createProfile(JSON.parse(JSON.stringify(profile)));
    assert.equal(item.category==='skin'?loaded.options.style:loaded.shop.equipped[item.category],id);
  }
  assert.equal(profile.shop.owned.length,21);assert.ok(profile.shop.owned.includes('hat-crown'));
  assert.equal(purchase(createProfile({wallet:0}),'hat-pirate').ok,false);
  assert.equal(createProfile({options:{style:'skin-orca'}}).options.style,'classic');
});

