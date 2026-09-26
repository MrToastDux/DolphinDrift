import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { createProfile, settleRun } from '../src/progression.js';
import { routeAt, updateRoutes, routePrompt } from '../src/routes.js';
import { IslandAudio } from '../src/audio.js';
import { DolphinRig } from '../src/dolphin.js';
import { MASTERY } from '../src/mastery.js';

test('fork commits the selected lane, creates different routes, pays once and survives revive', () => {
  for (let index=0;index<3;index++) for (const lane of [-1,0,1]) {
    const g=new Game({mode:'tour',seed:42});g.start();g.distance=index*750+200;g.player.lane=lane;
    updateRoutes(g);assert.match(routePrompt(g),/FORK/);
    g.distance=index*750+211;updateRoutes(g);
    g.distance=index*750+310;g.objects=[];g._nextRow=g.distance+20;g._fillTrack();
    assert.equal(routeAt(g)?.id ?? null,lane===-1?['reef','roof','dock'][index]:null);
    if(lane===-1) {
      assert.equal(g.gravity,index===0?11:16);
      const obstacles=g.objects.filter(o=>['buoy','gate','crate','cart','tram','barrier'].includes(o.type));
      assert.ok(obstacles.length>0);
      const allowed=index===0?['buoy']:index===1?['gate','crate']:['cart'];
      assert.ok(obstacles.filter(o=>o.z<150).every(o=>allowed.includes(o.type)));
    }
    const before=g.bonusCredits;g.distance=index*750+481;updateRoutes(g);updateRoutes(g);
    assert.equal(g.bonusCredits-before,lane===-1?40+10*index:0);
    g.state='over';g.coins=100;g.revive();updateRoutes(g);
    assert.equal(g.bonusCredits-before,lane===-1?40+10*index:0);
  }
});

test('mastery counts actual ability effects, persists and cannot double pay on revive', () => {
  for(const character of Object.keys(MASTERY)) {
    const g=new Game();g.character=character;g.start();g.objects=[];g._nextRow=Infinity;
    if(['dub','octo'].includes(character)) {
      g.objects=[{id:999,type:'coin',lane:0,z:1}];g.action('ability');g.update(.1);
    } else {
      g.action('ability');g.objects=[{id:999,type:'crate',lane:0,z:.01}];g.update(.01);
    }
    assert.equal(g.stats.mastery,1,character);
    const baseline=createProfile({mastery:{[character]:MASTERY[character].target-1}});
    const saved=settleRun(baseline,g).profile;
    assert.equal(saved.mastery[character],MASTERY[character].target);
    assert.deepEqual(createProfile(JSON.parse(JSON.stringify(saved))),saved);
    assert.deepEqual(settleRun(baseline,g).profile,saved);
    assert.equal(settleRun(baseline,{...g,mode:'daily'}).profile.mastery[character],MASTERY[character].target-1);
  }
});

test('distance and first ×5 celebration fire once and freeze with pause', () => {
  const g=new Game();g.personalBest=1;g.start();g.objects=[];g._nextRow=Infinity;g.drainEvents();g.update(.1);
  assert.equal(g.drainEvents().filter(e=>e.type==='milestone').length,1);
  for(let i=0;i<60;i++)g._collectCoin({id:i,type:'coin',lane:0,z:0});
  assert.equal(g.drainEvents().filter(e=>e.type==='milestone').length,1);
  g.pause();const snapshot=g.snapshot();g.update(1);assert.deepEqual(g.snapshot(),snapshot);
  g.resume();g.update(.1);assert.equal(g.drainEvents().filter(e=>e.type==='milestone').length,0);
});

test('reactive music adds layers and drops them on pause; all four victory poses animate', () => {
  const a=new IslandAudio(),calls=[];a.tone=(...args)=>calls.push(args);a.noise=(...args)=>calls.push(args);
  a.setIntensity({state:'playing',combo:0});a.beat(0,0);const base=calls.length;calls.length=0;
  a.setIntensity({state:'playing',combo:48,boss:{defeated:false}});a.beat(0,0);assert.ok(calls.length>base);
  a.setIntensity({state:'paused',combo:48,boss:{}});assert.equal(a.intensity,0);assert.equal(a.bossMusic,false);
  const rig=new DolphinRig(),poses=[];
  for(const character of Object.keys(MASTERY)) {
    const g=new Game();g.character=character;g.completed=true;g.state='over';
    rig.build(g,.3);const before=[rig.pitch,rig.yaw,rig.lean,rig.bob];rig.build(g,.8);
    const after=[rig.pitch,rig.yaw,rig.lean,rig.bob];assert.notDeepEqual(before,after);poses.push(after.join(','));
  }
  assert.equal(new Set(poses).size,4);
});
