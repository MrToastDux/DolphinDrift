import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { createProfile, purchase, prepareRun } from '../src/progression.js';

const additions = ['shield-upgrade','ghost-upgrade','spring-upgrade','dash-upgrade'];
function upgradedGame(mode = 'endless', level = 3, supply = null) {
  const game = new Game({ seed: 42, mode });
  game.upgrades = Object.fromEntries(additions.map(id => [id, level]));
  game.supply = supply; game.start(); game.objects = []; game._nextRow = Infinity;
  return game;
}

test('old saves keep their purchases and new upgrades default to zero', () => {
  const old = { wallet: 123, shop: { owned: ['sunset'], upgrades: { 'magnet-upgrade': 2, 'surf-upgrade': 3 } } };
  const profile = createProfile(old);
  assert.equal(profile.wallet, 123);
  assert.equal(profile.shop.upgrades['magnet-upgrade'], 2);
  assert.equal(profile.shop.upgrades['surf-upgrade'], 3);
  assert.deepEqual(additions.map(id => profile.shop.upgrades[id]), [0,0,0,0]);
  let bought = createProfile({ ...old, wallet: 5000 });
  for (const id of additions) for (let level = 0; level < 3; level++) {
    const result = purchase(bought, id); assert.equal(result.ok, true); bought = result.profile;
  }
  assert.deepEqual(createProfile(JSON.parse(JSON.stringify(bought))), bought);
  const corrupt = createProfile({ shop: { upgrades: { 'shield-upgrade': 99, 'ghost-upgrade': -1, 'spring-upgrade': Infinity, 'dash-upgrade': '3' } } });
  assert.deepEqual(additions.map(id => corrupt.shop.upgrades[id]), [3,0,0,0]);
});

test('every new power level affects real pickups and starter supplies in running modes', () => {
  for (const mode of ['endless','tour','story']) for (const level of [1,2,3]) {
    for (const [power,base,step] of [['shield',12,2],['ghost',6,1],['spring',12,2]]) {
      const game = upgradedGame(mode,level);
      game.objects = [{ id: 999, type: 'powerup', power, lane: 0, z: .01 }];
      game.update(.01);
      assert.ok(Math.abs(game.powerups[power] - (base + step * level)) < .02, `${mode} ${power} level ${level}`);
      const supplied = upgradedGame(mode,level,power);
      assert.equal(supplied.powerups[power], base + step * level);
    }
  }
});

test('longer shields still absorb just one hit, and longer Super jump preserves height', () => {
  const shield = upgradedGame('endless',3,'shield');
  shield.objects = [{ id: 998, type: 'tram', lane: 0, z: .01 }]; shield.update(.01);
  assert.equal(shield.state,'playing'); assert.equal(shield.powerups.shield,0);
  assert.equal(shield.stats.shieldsUsed,1);
  const ordinary = upgradedGame('endless',0,'spring'), extended = upgradedGame('endless',3,'spring');
  ordinary.action('jump'); extended.action('jump');
  for (let i=0;i<60;i++) {
    ordinary.update(1/60); extended.update(1/60);
    assert.equal(ordinary.player.jump,extended.player.jump);
  }
});

test('dash duration upgrades retain charge cost, pause correctly and expire', () => {
  for (const level of [1,2,3]) {
    const game = upgradedGame('endless',level);
    game.dashCharge=24; assert.equal(game.dash(),false);
    game.dashCharge=25; assert.equal(game.dash(),true);
    assert.equal(game.dashRemaining,3+.5*level); assert.equal(game.dashCharge,0);
    game.pause(); const snapshot=game.snapshot(); game.update(.1); assert.deepEqual(game.snapshot(),snapshot);
    game.resume();
    for(let i=0;i<100;i++)game.update(.05);
    assert.equal(game.dashRemaining,0);
  }
});

test('Daily resets every new effect and does not consume a selected supply', () => {
  const profile=createProfile({shop:{upgrades:Object.fromEntries(additions.map(id=>[id,3])),supplies:{'supply-shield':1}},preferences:{supply:'supply-shield'}});
  const prepared=prepareRun(profile,'daily');
  assert.deepEqual(prepared.upgrades,{}); assert.equal(prepared.supply,null);
  assert.equal(prepared.profile.shop.supplies['supply-shield'],1);
  const game=upgradedGame('daily',3,'shield');
  assert.deepEqual(game.upgrades,{}); assert.equal(game.powerups.shield,0);
  assert.equal(game.powerDuration('shield'),12); assert.equal(game.powerDuration('ghost'),6);
  assert.equal(game.powerDuration('spring'),12);
  game.dashCharge=25; game.dash(); assert.equal(game.dashRemaining,3);
});
