import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { DolphinRig } from '../src/dolphin.js';
import { SHOP_ITEMS } from '../src/catalog.js';

test('every crew member renders every hat in running, rolling and flying poses', () => {
  for (const character of ['dub','octo','shark','turtle']) for (const pose of ['run','roll','fly']) {
    const game=new Game();game.character=character;
    game.player.sliding=pose==='roll';game.player.rollProgress=.4;game.surfRemaining=pose==='fly'?10:0;
    const rig=new DolphinRig();rig.lowDetail=true;rig.build(game,.3);
    const plain=rig.faces.length;
    for (const hat of SHOP_ITEMS.filter(item=>item.category==='hat')) {
      rig.hat=hat.id;rig.build(game,.3);
      assert.ok(rig.faces.length>plain,`${character} ${pose} ${hat.id} adds geometry`);
      assert.ok(rig.faces.every(face=>face.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))));
    }
  }
});

test('all skin colours and special patterns change the other crew meshes', () => {
  for(const character of ['octo','shark','turtle']) {
    const g=new Game();g.character=character;const rig=new DolphinRig();rig.lowDetail=true;rig.build(g,0);
    const original=JSON.stringify(rig.faces);
    for(const skin of SHOP_ITEMS.filter(item=>item.category==='skin')) {
      rig.style=skin.id;rig.build(g,0);
      assert.notEqual(JSON.stringify(rig.faces),original,`${character} ${skin.id}`);
    }
  }
});
