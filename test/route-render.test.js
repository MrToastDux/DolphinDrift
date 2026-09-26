import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Renderer } from '../src/renderer.js';
import { forkAt, routeAt } from '../src/routes.js';
import { visibleRoutes, routeEntries, drawRouteAtmosphere, drawRouteEntry } from '../src/route-render.js';

test('side buildings mask the road, cull hidden walls, and keep clipped container ribs anchored', () => {
  for (const index of [1,2]) for (const side of [-1,1]) {
    const route=forkAt(index), polygons=[],ribs=[],clips=[];
    const r={width:375,height:620,focal:400,cameraHeight:5,
      project:(x,y,z)=>({x,y,z}),poly:(points,color)=>polygons.push({points,color}),
      line:points=>ribs.push(points),
      ctx:{save(){},restore(){},beginPath(){},rect(){},moveTo(){},lineTo(){},closePath(){},clip:rule=>clips.push(rule)}};
    drawRouteEntry(r,{route,side,z:-2,originalZ:-9,length:12,part:'building'});
    assert.deepEqual(clips,['evenodd'],'building walls must not overpaint the road');
    assert.equal(polygons.length,index===1?4:2,'only top and inner wall remain after clipping');
    for(const {points} of polygons) {
      if(points.every(p=>p.x===points[0].x))assert.ok(Math.abs(points[0].x)<5.25,'outer wall must be culled');
    }
    if(index===2)assert.deepEqual(ribs.map(points=>points[0].z),[1,5,9],'rib positions retain their original world coordinates');
  }
});

test('route scenery is visible before entry, stays anchored, and ends at the actual exit', () => {
  for (let index=0;index<3;index++) {
    const g=new Game({mode:'tour'}),route=forkAt(index);g.routeChoices.set(index,true);
    g.distance=route.start-45;assert.equal(visibleRoutes(g)[0]?.id,route.id);
    const before=routeEntries(g);g.distance+=.5;
    const after=routeEntries(g);
    for(const entry of before.filter(e=>e.z>1&&e.z<180)) {
      const next=after.find(e=>e.absolute===entry.absolute&&e.part===entry.part&&e.side===entry.side);
      assert.ok(next);assert.ok(Math.abs(next.z-entry.z+.5)<1e-9,'Props move with world distance');
    }
    assert.ok(after.every(e=>e.absolute>=route.start&&e.absolute<=route.end));
    g.distance=route.end-1;assert.ok(routeEntries(g).some(e=>e.exit));
    g.distance=route.end+24;assert.deepEqual(routeEntries(g),[]);
    g.distance=route.start+50;g.routeChoices.set(index,false);assert.deepEqual(visibleRoutes(g),[]);
    g.routeChoices.set(index,true);g.mode='story';assert.deepEqual(visibleRoutes(g),[]);
  }
});

test('reef atmosphere fades at both boundaries and uses a full-height gradient', () => {
  const g=new Game(),alphas=[];g.routeChoices.set(0,true);
  const r={width:375,height:620,ctx:{save(){},restore(){},set globalAlpha(v){alphas.push(v)},
    createLinearGradient(x,y,x2,y2){assert.equal(y2,620);return {addColorStop(){}}},fillRect(){},beginPath(){},arc(){},stroke(){}}};
  const route=forkAt(0);
  for(const distance of [route.start+.01,route.start+18,route.end-18,route.end-.01]){g.distance=distance;drawRouteAtmosphere(r,g);}
  assert.ok(alphas[0]<.001);assert.equal(alphas[1],1);assert.equal(alphas[2],1);assert.ok(alphas[3]<.001);
});

test('bonus signs only advertise zones enabled by the simulation', () => {
  for (const mode of ['endless', 'daily', 'tour', 'story']) {
    const game = new Game({ mode });
    game.chapterId = 'rescue';
    game.distance = 480;
    const labels = [];
    const renderer = {
      ctx: { save() {}, restore() {}, fillText: text => labels.push(text) },
      quad() {}, line() {}, project: () => ({ x: 0, y: 0, scale: 1 }),
    };
    Renderer.prototype.bonusScenery.call(renderer, game);
    assert.deepEqual(labels, ['endless', 'daily'].includes(mode) ? ['RECORD REEF', 'BONUS +25'] : []);
  }
});

function canvas(width,height) {
  const gradient={addColorStop(offset){assert.ok(offset>=0&&offset<=1)}};
  const ctx=new Proxy({globalAlpha:1,measureText:text=>({width:String(text).length*7}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient}, {
    get(target,key){if(key in target)return target[key];return (...args)=>{
      for(const n of args.flat(2))if(typeof n==='number')assert.ok(Number.isFinite(n),`${String(key)} received ${n}`);
      if(key==='drawImage')assert.ok(args[0].width>0&&args[0].height>0);
    };},
  });
  return {width,height,getContext:()=>ctx,getBoundingClientRect:()=>({width,height}),ownerDocument:{createElement:()=>canvas(width,height)}};
}

test('all route transitions render in depth order on desktop/mobile, flight, and reduced effects', () => {
  globalThis.matchMedia=()=>({matches:false});globalThis.devicePixelRatio=1;
  try {
    for(const width of [375,1100])for(const index of [0,1,2])for(const flight of [false,true])for(const reduced of [false,true]) {
      const r=new Renderer(canvas(width,620));r.camera=1;r.setQuality(reduced?'low':'high');r.reducedMotion=reduced;
      const g=new Game({mode:'tour',seed:7}),route=forkAt(index);g.start();g.routeChoices.set(index,true);
      g.surfRemaining=flight?20:0;g.player.altitude=flight?4.2:0;r.flightCamera=g.player.altitude;
      for(const offset of [-175,-130,-91,-45,-.1,0,.1,24,75,177,179.9,180,180.1,185,205]) {
        g.distance=route.start+offset;g.objects=[{type:'coin',lane:0,z:20,id:1},{type:'gate',lane:1,z:35,id:2}];
        r.draw(g,0,0);
        for(let i=1;i<r.renderEntries.length;i++)assert.ok(r.renderEntries[i-1].z>=r.renderEntries[i].z);
        for(const entry of r.renderEntries.filter(e=>['palm','market','bunting','speaker','light'].includes(e.kind)))assert.equal(routeAt(g,g.distance+entry.z),null,'Street scenery must not occupy detours');
        assert.ok(r.renderEntries.some(e=>e.kind==='player'));assert.equal(r.renderEntries.filter(e=>e.kind==='object').length,2);
      }
      const previous=r.renderEntries.map(e=>[e.kind,e.z]);g.state='paused';r.draw(g,.05,1);
      assert.deepEqual(r.renderEntries.map(e=>[e.kind,e.z]),previous,'Pausing cannot move scenery');
    }
  } finally {delete globalThis.matchMedia;delete globalThis.devicePixelRatio;}
});
