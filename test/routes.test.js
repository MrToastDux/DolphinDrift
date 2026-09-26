import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { forkAt, routeAt, routePrompt, updateRoutes } from '../src/routes.js';

test('fork approaches and entrances clear all lanes for either choice', () => {
  for (const mode of ['endless','daily','tour']) for (const chosen of [false,true]) for (const speed of [12,45,70]) {
    const g = new Game({mode,seed:23});
    for(let index=0;index<3;index++) {
      const fork=forkAt(index);
      g.distance=fork.approach-25;g.speed=speed;g._nextRow=g.distance;g.objects=[];
      g.routeChoices.set(index,chosen);g._fillTrack();
      const inside=g.objects.filter(o=>g.distance+o.z>=fork.approach && g.distance+o.z<fork.entranceEnd);
      assert.ok(inside.length>0);
      assert.ok(inside.every(o=>o.type==='coin'),'choice plaza must contain no hazards');
      assert.deepEqual([...new Set(inside.map(o=>o.lane))].sort(),[-1,0,1]);
    }
  }
});

test('generated powerups never overlap hazards in their pickup lane', () => {
  const hazards=new Set(['barrier','gate','tram','crate','buoy','cart','enemy']);
  for(const mode of ['endless','daily','tour','story'])for(let seed=0;seed<8;seed++) {
    const g=new Game({mode,seed});g.start();
    for(let frame=0;frame<1600 && g.state==='playing';frame++) {
      for(const power of g.objects.filter(o=>o.type==='powerup')) {
        assert.ok(g.objects.every(o=>!hazards.has(o.type)||o.lane!==power.lane||Math.abs(o.z-power.z)>=8), `${mode}: pickup overlaps ${power.power}`);
      }
      g.reviveGrace=10;g.update(.1);
    }
  }
});

test('detour rows always move the safe lane one step, including fast runs', () => {
  for (const speed of [12, 25, 45, 70]) for (const index of [0, 1, 2]) {
    const g = new Game({ mode: 'tour', seed: 42 });
    const route = forkAt(index);
    g.distance = route.start;
    g.speed = speed;
    g.routeChoices.set(index, true);
    g._nextRow = route.start;
    g.objects = [];
    g._fillTrack();
    const rows = new Map();
    for (const o of g.objects.filter(o => ['buoy', 'crate', 'gate', 'cart'].includes(o.type))) {
      const absolute = g.distance + o.z;
      if (absolute >= route.end) continue;
      if (!rows.has(absolute)) rows.set(absolute, []);
      rows.get(absolute).push(o.lane);
    }
    const safe = [...rows.values()].map(lanes => [-1, 0, 1].find(lane => !lanes.includes(lane)));
    assert.ok(safe.length >= 2);
    for (let i = 1; i < safe.length; i++) assert.equal(Math.abs(safe[i] - safe[i - 1]), 1);
    const exitHazards = g.objects.filter(o => o.type !== 'coin' && g.distance + o.z >= route.end);
    assert.ok(exitHazards.every(o => g.distance + o.z >= route.end + 20));
  }
});

test('route choice stays visible until entry and cannot change after commitment', () => {
  for (const lane of [-1, 0, 1]) {
    const g = new Game();
    g.distance = 210; g.player.lane = lane; updateRoutes(g);
    g.player.lane = lane === -1 ? 1 : -1;
    for (const distance of [211, 250, 299.9]) {
      g.distance = distance; updateRoutes(g);
      if (lane === -1) {
        assert.equal(routeAt(g)?.id, 'reef', 'the gateway must enter the destination immediately');
        assert.match(routePrompt(g), /Reef tunnel ·/);
      } else assert.equal(routeAt(g), null);
      assert.equal(g.routeChoices.get(0), lane === -1);
    }
  }
});

test('an unresolved fork behind the runner cannot stall future track generation', () => {
  const g = new Game();
  g.distance = 490; g._nextRow = 490; g.objects = [];
  g._fillTrack();
  assert.ok(g._nextRow >= 490 + 200);
  assert.ok(g.objects.some(o => o.z > 0));
});
