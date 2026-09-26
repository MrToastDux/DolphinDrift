import { MASTERY } from './mastery.js';
import { routePrompt } from './routes.js';
import { Game, SURFBOARD_COST, SURFBOARD_SECONDS, POWERUP_DURATIONS, REVIVE_COST, MODES, DASH_CHARGE, BOSS_RECHARGE_SECONDS } from './game.js';
import { Renderer, getDistrict } from './renderer.js';
import { IslandAudio } from './audio.js';
import { createProfile, settleRun, getMissions, ACHIEVEMENTS, dailySeed, localDateKey, STYLES, levelProgress, prepareRun } from './progression.js';
import { MODIFIERS, SHOP_ITEMS, findItem } from './catalog.js';
import { createShop } from './shop-ui.js';
import { CONTRACTS, contractGoal, contractReward, TOUR_STAGES, bossVolley } from './tour.js';
import { CHAPTERS, CHARACTERS, CREW_RECORDS, characterUnlocked, characterById, weaponById, objectiveProgress } from './adventure.js';
import { createAdventureUI } from './adventure-ui.js';

const bossWeaponNames = Object.fromEntries([0, 1, 2].map(index => {
  const volley = bossVolley(index);
  return [volley.kind, volley.name];
}));

const elements = new Map();
const $ = id => {
  if (!elements.has(id)) elements.set(id, document.getElementById(id));
  return elements.get(id);
};
function setText(id, value) {
  const node = $(id), text = String(value);
  if (node.textContent !== text) node.textContent = text;
}
const powerMeters = Object.entries(POWERUP_DURATIONS).map(([power, duration]) => {
  const meter = $(`power-${power}`);
  return { power, duration, meter, bar: meter.querySelector('.power-progress'), label: meter.querySelector('strong') };
});
const game = new Game();
const renderer = new Renderer($('world'));
const audio = new IslandAudio();
const victoryCanvas = document.createElement('canvas');
victoryCanvas.className = 'victory-canvas'; victoryCanvas.setAttribute('aria-label', 'Crew victory dance');
$('modal-title').after(victoryCanvas);
const victoryRenderer = new Renderer(victoryCanvas);
victoryRenderer.setQuality('low'); victoryRenderer.camera = 1;
victoryRenderer.portrait = true;
const victoryGame = new Game({seed:'victory'});
victoryGame.objects = []; victoryGame.state = 'over'; victoryGame.completed = true;
const shell = $('game-shell');
const routeBanner = document.createElement('div'); routeBanner.className = 'route-banner'; routeBanner.setAttribute('role', 'status'); shell.append(routeBanner);
const celebration = document.createElement('div'); celebration.className = 'celebration'; celebration.setAttribute('role', 'status'); shell.append(celebration);
let celebrationSeconds = 0;
const debug = new URLSearchParams(location.search).has('debug');
let profile = createProfile();
let storedSettings = false;
try {
  if (!debug) {
    const stored = JSON.parse(localStorage.getItem('dolphin-drift-profile') || 'null');
    if (stored) { profile = createProfile(stored); storedSettings = Boolean(stored.settings); }
  }
} catch { /* Corrupt or disabled storage must never block a run. */ }
if (!storedSettings) profile.settings.reducedMotion = renderer.reducedMotion;
renderer.reducedMotion = profile.settings.reducedMotion;
renderer.style = profile.options.style;
renderer.setQuality(profile.preferences.quality);
const previewRenderer = new Renderer($('shop-preview'));
previewRenderer.setQuality('low');previewRenderer.camera=1;
const previewGame = new Game({seed:1});previewGame.state='playing';previewGame.objects=[];
function applyCosmetics() {
  if (game.state === 'ready') game.character = profile.loadout.character;
  previewGame.character = profile.loadout.character;
  for(const target of [renderer,previewRenderer]) {
    target.style=profile.options.style;
    target.masteryCharacter = profile.loadout.outfit === 'mastery' && profile.mastery[profile.loadout.character] >= MASTERY[profile.loadout.character].target ? profile.loadout.character : null;
    target.boardColor=findItem(profile.shop.equipped.board)?.color;
    target.boardId=profile.shop.equipped.board;
    target.hat=profile.shop.equipped.hat;
    target.trail=profile.shop.equipped.trail;
  }
}
applyCosmetics();
audio.musicVolume = profile.options.musicVolume;
audio.effectsVolume = profile.options.effectsVolume;
document.documentElement.classList.toggle('less-motion', renderer.reducedMotion);
let runBaseline = createProfile(profile);
let runSaved = false;
let runRewards = null;
let mode = 'endless';
let runDate = localDateKey();
let runMode = mode;
let best = 0;
try {
  const legacyBest = debug ? 0 : Number(localStorage.getItem('dolphin-drift-best'));
  best = Math.floor(Math.max(profile.bestDistance, Number.isFinite(legacyBest) ? Math.max(0, legacyBest) : 0));
} catch { /* Play works without storage. */ }
let lastState = '';
let previousTime = performance.now();
let elapsed = 0;
let savedFocus = null;
let audioWanted = false;
let radioChosen = profile.settings.muted;
function saveProfile() {
  if (debug) return;
  try { localStorage.setItem('dolphin-drift-profile', JSON.stringify(profile)); } catch { /* Session remains playable. */ }
}

function saveRun() {
  if (runSaved || game.elapsedTime <= 0) return;
  const settings = { ...profile.settings };
  const options = { ...profile.options };
  const preferences = { ...profile.preferences };
  const settlement = settleRun(runBaseline, game, { date: runDate, daily: runMode === 'daily' });
  profile = settlement.profile;
  runRewards = settlement.rewards;
  profile.settings = settings;
  profile.options = options;
  profile.preferences = preferences;
  runSaved = true;
  best = Math.max(best, Math.floor(profile.bestDistance));
  saveProfile();
}

function previewItem(item) {
  applyCosmetics();
  if(item.category==='skin'){previewRenderer.style=item.id;previewRenderer.masteryCharacter=null;}
  if(item.category==='board'){previewRenderer.boardId=item.id;previewRenderer.boardColor=item.color;}
  if(item.category==='hat')previewRenderer.hat=item.id;
  if(item.category==='trail')previewRenderer.trail=item.id;
  const flying=item.category==='board';
  previewGame.surfRemaining=flying?20:0;previewGame.player.altitude=flying?4.2:0;
  $('preview-pose').textContent=flying?'Preview walking':'Preview board';
  setText('preview-label',`Trying on: ${item.name}`);
}
const shop = createShop({getProfile:()=>profile,setProfile:next=>{profile=next;saveProfile();syncKit();},game,onEquip:()=>{applyCosmetics();setText('preview-label','Your equipped look');},onPreview:previewItem});
const adventure = createAdventureUI({
  getProfile: () => profile,
  onLoadout: (key, value) => { profile.loadout[key] = value; saveProfile(); applyCosmetics(); syncMode(); },
  onLaunch: id => { mode = 'story'; game.chapterId = id; beginRun(); syncMode(); },
});
function syncKit() {
  $('modifier-select').replaceChildren(...Object.entries(MODIFIERS).map(([id,entry])=>new Option(entry.name,id)));
  $('modifier-select').value=profile.preferences.modifier;
  $('modifier-select').disabled=mode==='daily'||mode==='story';
  $('modifier-note').textContent=mode==='daily'?'Daily routes keep the same rules for everyone.':mode==='story'?'Story chapters use classic rules. Your crew, weapon and shop upgrades still apply.':MODIFIERS[profile.preferences.modifier].description;
  $('supply-select').replaceChildren(new Option('No starter supply','none'),...SHOP_ITEMS.filter(item=>item.category==='supply').map(item=>{
    const option=new Option(`${item.name} · ${profile.shop.supplies[item.id]} owned`,item.id);option.disabled=!profile.shop.supplies[item.id];return option;
  }));
  $('supply-select').value=profile.preferences.supply;
  $('supply-select').disabled=mode==='daily'||mode!=='story'&&profile.preferences.modifier==='pure';
  setText('kit-summary',mode==='daily'?'Daily rules':mode==='story'?'Story loadout':MODIFIERS[profile.preferences.modifier].name);
}

function syncMode() {
  syncKit();
  const character = characterById(mode === 'daily' ? 'dub' : profile.loadout.character);
  if (game.state === 'ready') game.character = character.id;
  setText('equipped-loadout', mode === 'story' ? `${character.name} / ${weaponById(profile.loadout.weapon).name}` : `${character.name} · ${character.ability}`);
  setText('crew-open-label', mode === 'story' ? 'Crew & armory' : 'Choose your runner');
  setText('crew-goal', nextCrewGoal(profile));
  $('combat-guide').classList.toggle('hidden', mode !== 'story');
  $('start').innerHTML = `${mode==='story'?'Open island map':'Let’s drift'} <span aria-hidden="true">↗</span>`;
  $('character-label').innerHTML = `<span class="label-line"></span><span>MEET ${character.name.toUpperCase()}<span class="character-subtitle">${character.species} · ${character.ability}</span></span>`;
  for (const name of Object.keys(MODES)) $('mode-' + name).setAttribute('aria-pressed', String(mode === name));
  const date = localDateKey();
  const dailyBest = profile.daily.date === date ? profile.daily.bestScore : 0;
  $('mode-note').textContent = mode === 'daily'
    ? `${date} · Same seed all day · Best ${dailyBest.toLocaleString()} pts`
    : `${MODES[mode].description}${profile.modeBests[mode] ? ` Best ${profile.modeBests[mode].toLocaleString()} pts.` : ''}`;
}

function nextCrewGoal(saved) {
  const next = CHARACTERS.find(character => !characterUnlocked(character, saved));
  return next ? `Next crew: ${next.name} · ${saved.totalRecords} / ${CREW_RECORDS[next.id]} lifetime records, or Story chapter ${next.chapter}`
    : 'Whole crew unlocked · Choose your favourite ability';
}

function syncMissions() {
  const objective = game.chapter ? objectiveProgress(game) : null;
  const missions = objective ? [
    { title: objective.label, ...objective },
    { title: 'Reach the chapter exit', current: game.distance, target: game.chapter.length, complete: game.distance >= game.chapter.length },
  ] : [];
  missions.push(...getMissions(game));
  $('mission-list').replaceChildren(...missions.map(mission => {
    const row = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${mission.complete ? '✓' : '○'} ${mission.title}${mission.reward ? mission.complete ? ' · All 3 milestones!' : ` · next +${mission.reward} records` : ''}`;
    const value = document.createElement('strong');
    value.textContent = `${Math.min(mission.target, Math.floor(mission.current))} / ${mission.target}${mission.earned ? ` · +${mission.earned} earned` : ''}`;
    row.classList.toggle('complete', mission.complete);
    row.append(label, value);
    return row;
  }));
}

function syncLogbook() {
  setText('tour-passport', `${profile.tourWins} tours completed · ${profile.tourStamps} / 3 districts cleared`);
  $('tour-stamps').replaceChildren(...TOUR_STAGES.map((stage, index) => {
    const stamp = document.createElement('span');
    stamp.textContent = `${index < profile.tourStamps ? '✓' : '○'} ${stage.name}`;
    stamp.className = index < profile.tourStamps ? 'earned' : '';
    return stamp;
  }));
  $('contracts').replaceChildren(...CONTRACTS.map(contract => {
    const saved = profile.contracts[contract.id], goal = contractGoal(contract, saved.tier);
    const card = document.createElement('div'); card.className = 'contract';
    const title = document.createElement('strong'); title.textContent = `${contract.name} · ${saved.tier + 1}`;
    const detail = document.createElement('span'); detail.textContent = `${saved.progress.toLocaleString()} / ${goal.toLocaleString()} ${contract.unit} · +${contractReward(contract, saved.tier)} records`;
    const meter = document.createElement('progress'); meter.max = goal; meter.value = saved.progress;
    meter.setAttribute('aria-label', contract.name);
    card.append(title, detail, meter); return card;
  }));
  $('render-quality').value=profile.preferences.quality;
  setText('quality-status',renderer.effectiveQuality==='low'?'Performance active':'High detail active');
  const level = levelProgress(profile.xp);
  const ranks = ['Beach newcomer', 'Palm regular', 'Wave rider', 'Island explorer', 'Harbour hero', 'Reggae royalty'];
  setText('level-label', `Level ${level.level} · ${ranks[Math.min(ranks.length - 1, Math.floor((level.level - 1) / 2))]}`);
  setText('xp-label', level.level === 50 ? 'MAX LEVEL' : `${level.current} / ${level.target} XP`);
  $('xp-progress').value = level.current;
  $('mode-records').replaceChildren(...Object.entries(MODES).map(([id, entry]) => {
    const row = document.createElement('span');
    row.textContent = `${entry.name}: ${profile.modeBests[id].toLocaleString()} pts`;
    return row;
  }));
  $('run-history').replaceChildren(...profile.history.map(entry => {
    const row = document.createElement('li');
    row.textContent = `${MODES[entry.mode]?.name || 'Retired mode'} · ${entry.score.toLocaleString()} pts · ${entry.distance.toLocaleString()} m · +${entry.xp} XP`;
    const date = document.createElement('small'); date.textContent = entry.date;
    row.append(date); return row;
  }));
  if (!profile.history.length) $('run-history').textContent = 'Your next drift starts the story.';
  $('show-touch').checked = profile.options.touchControls;
  $('music-volume').value = Math.round(profile.options.musicVolume * 100);
  $('effects-volume').value = Math.round(profile.options.effectsVolume * 100);
  $('career-stats').replaceChildren(...[
    [profile.runs, 'RUNS'], [profile.bestScore, 'BEST SCORE'],
    [profile.totalRecords, 'RECORDS FOUND'], [profile.bestCombo, 'BEST STREAK'],
  ].map(([value, label]) => {
    const cell = document.createElement('div');
    const number = document.createElement('strong'); number.textContent = value.toLocaleString();
    const caption = document.createElement('span'); caption.textContent = label;
    cell.append(number, caption); return cell;
  }));
  $('achievements').replaceChildren(...ACHIEVEMENTS.map(achievement => {
    const row = document.createElement('div');
    const unlocked = profile.achievements.includes(achievement.id);
    row.className = `achievement${unlocked ? ' earned' : ''}`;
    const title = document.createElement('strong'); title.textContent = `${unlocked ? '✓' : '○'} ${achievement.title}`;
    const description = document.createElement('span'); description.textContent = achievement.description;
    row.append(title, description); return row;
  }));
  $('reduced-motion').checked = renderer.reducedMotion;
}

function syncRunHud() {
  const missions = getMissions(game);
  const next = missions.filter(mission => !mission.complete).sort((a,b) => b.current / b.target - a.current / a.target)[0];
  const earned = missions.reduce((sum, mission) => sum + mission.earned, 0);
  setText('mission-readout', next ? `${next.title} · ${next.current}/${next.target} · next +${next.reward}` : `All milestones reached · +${earned} banked`);
  setText('stunt-readout', game.stuntChain ? `${game.lastStunt} · stunt ×${game.stuntChain} · ${Math.ceil(game.stuntRemaining)}s` : 'Jump & roll hazards for stunt chains');
  const tour = game.tour;
  const route = game.routeStage;
  const chapter = game.chapter, character = characterById(game.character), weapon = weaponById(game.weapon);
  const activeRun = game.state === 'playing' || game.state === 'paused';
  $('story-status').classList.toggle('hidden', !chapter || !activeRun);
  shell.dataset.storyBoss = String(Boolean(chapter && tour));
  shell.dataset.combat = String(game.combatEnabled);
  if (chapter) {
    const objective = objectiveProgress(game);
    setText('story-title', `${CHAPTERS.indexOf(chapter)+1} / 6 · ${chapter.title}`);
    setText('story-objective', `${Math.min(objective.current,objective.target)} / ${objective.target} ${objective.label} · ${Math.max(0,Math.ceil(chapter.length-game.distance))} m to exit`);
    $('story-progress').max = chapter.length; $('story-progress').value = game.distance;
    setText('story-radio', game.distance > chapter.length*.22 && game.distance < chapter.length*.4 ? `${chapter.speaker}: ${chapter.radio}` : '');
  }
  setText('ability-name', `${character.ability} · C`);
  setText('ability-label', game.abilityRemaining>0?`${Math.ceil(game.abilityRemaining)}s`:game.abilityCooldown>0?`${Math.ceil(game.abilityCooldown)}s`:'READY');
  $('ability').disabled=game.state!=='playing'||game.abilityCooldown>0||game.surfRemaining>0;
  $('ability').title=`${character.description} Cooldown: ${character.cooldown} seconds.`;
  $('ability-progress').style.width=`${100*(1-game.abilityCooldown/character.cooldown)}%`;
  $('special').disabled=!game.combatEnabled||game.state!=='playing'||game.specialCharge<100;
  setText('special',game.specialCharge>=100?'Tidal blast · X':`Tidal blast · ${game.specialCharge}%`);
  shell.dataset.boss = String(Boolean(tour?.encounter));
  $('tour-status').classList.toggle('hidden', !route || !activeRun);
  if (route && !tour) {
    $('tour-status').classList.remove('boss-active');
    setText('tour-kicker', 'ISLAND TOUR / THREE DISTRICTS');
    setText('tour-title', `${route.index + 1} / 3 · ${route.name}`);
    setText('tour-detail', 'Follow the records. Find your rhythm.');
    setText('tour-reward', `${Math.ceil(route.remaining)} m to ${route.index === 2 ? 'finish' : 'checkpoint'} · +${route.reward} banked records`);
    $('tour-progress').max = route.end - route.start;
    $('tour-progress').value = game.distance - route.start;
  }
  if (tour) {
    setText('tour-title', tour.encounter ? `${tour.boss}${game.boss?.defeated?' · defeated':''}` : chapter ? `${tour.boss} ahead` : `Island Tour · ${tour.index + 1} / 3`);
    $('tour-status').classList.toggle('boss-active', tour.encounter);
    const incoming=game.incomingShot;
    setText('tour-detail', tour.encounter ? game.boss?.defeated ? `+${game.boss.reward} records · ${game.boss.damageTaken===0?'FLAWLESS!':'knockout!'}` : game.boss?.precisionTime>0 ? 'PERFECT DEFLECT · +500 × multiplier' : game.boss?.aiming ? 'Targeting you… move when the shot fires!' : incoming ? `${bossWeaponNames[incoming.kind]} · dodge, jump or roll!` : game.combat.feedbackTime>0 ? game.combat.feedback : 'Q / Fire · energy recharges automatically' : `${tour.name} · boss in ${Math.max(0, Math.ceil(tour.bossStart - game.distance))} m`);
    setText('tour-kicker',game.boss?.phase===2?'PHASE 02 / OVERDRIVE':'PHASE 01 / FIRST CONTACT');
    setText('tour-reward', tour.encounter && game.combat.streak ? `Dodge streak ×${game.combat.streak} · ${game.combat.deflections} deflections` : chapter ? 'Break every armor plate before the chapter exit.' : `${Math.ceil(tour.remaining)} m to ${tour.index === 2 ? 'finish' : 'checkpoint'} · +${tour.reward} banked records`);
    $('tour-progress').max = tour.end - tour.start;
    $('tour-progress').value = game.distance - tour.start;
  }
  $('boss-fight').classList.toggle('hidden',!tour?.encounter || !game.boss);
  $('combat-action').classList.toggle('hidden', !game.combatEnabled || !activeRun);
  $('boss-health').max=game.boss?.maxHP ?? 4;
  $('boss-health').value=game.boss?.hp ?? 4;
  $('boss-health').setAttribute('aria-valuetext',`${game.boss?.hp ?? 4} of ${game.boss?.maxHP ?? 4} armor remaining`);
  setText('boss-armor',`${game.boss?.phase===2?'FURY':'ARMOR'} ${game.boss?.hp ?? 4}/${game.boss?.maxHP ?? 4}`);
  const shotCost=game.weapon==='lance'?2:1;
  $('counter').disabled=game.state!=='playing'||!game.boss||game.boss.defeated||game.boss.charge<shotCost||game.boss.shot>0;
  setText('counter', game.boss?.defeated?'Knocked out':`Fire · ${game.boss?.charge ?? 0} ◆`);
  const threat=game.incomingShot, eta=threat?threat.travel-threat.age:Infinity;
  const canDeflect=game.boss?.charge>=shotCost && !game.boss.shot && eta>=.12 && eta<=.45
    && Math.abs(game.player.x-threat.targetX)<.5 && Math.abs(game.playerHeight-threat.targetY)<.8;
  $('counter').classList.toggle('deflect-ready',Boolean(canDeflect));
  if(canDeflect)setText('counter','Deflect! · Q');
  $('sonic-recharge').value=game.boss?.charge===3?BOSS_RECHARGE_SECONDS:game.boss?.recharge||0;
  setText('sonic-hint',game.boss?.defeated?'Fight complete':game.boss?.charge===3?'Energy full · Q / Fire':canDeflect?'FIRE NOW · refund + bonus':`Recharge ${Math.ceil(BOSS_RECHARGE_SECONDS-(game.boss?.recharge||0))}s · Q / Fire`);
  if (!tour?.encounter) {
    $('counter').disabled = !game.combatEnabled||game.state!=='playing'||game.fireCooldown>0;
    setText('counter','Fire · Q');
    setText('sonic-hint',weapon.name);
    $('sonic-recharge').max=weapon.cooldown;
    $('sonic-recharge').value=weapon.cooldown-game.fireCooldown;
  } else {
    $('sonic-recharge').max=BOSS_RECHARGE_SECONDS;
    if(game.weapon==='lance'&&!canDeflect&&!game.boss?.defeated)setText('sonic-hint',`Bass lance · costs 2 ◆ · ${game.boss?.charge||0} / 3 energy`);
  }
  setText('score', game.score.toLocaleString());
  setText('speed-value', game.speed.toFixed(1));
  setText('multiplier', `×${game.multiplier}`);
  setText('combo-label', game.combo ? `${game.combo} record streak` : 'find your flow');
  $('flow-progress').style.width = `${game.comboRemaining / game.comboDuration * 100}%`;
  $('flow-meter').setAttribute('aria-valuemax',game.comboDuration);
  $('flow-meter').setAttribute('aria-valuenow', game.comboRemaining.toFixed(1));
  const district = chapter ? {name:chapter.place} : getDistrict(game.distance);
  setText('district-name', `${runMode === 'daily' ? 'DAILY / ' : runMode !== 'endless' ? MODES[runMode].name.toUpperCase() + ' / ' : ''}${district.name.toUpperCase()}`);
  const chaseBest = runMode === 'daily' ? game.personalBest : best;
  setText('best-chase', game.modifier !== 'none' ? `${MODIFIERS[game.modifier].name} · Remix best ${profile.modifiedBest.toLocaleString()}` : !['endless', 'daily'].includes(runMode) ? `Mode best: ${profile.modeBests[runMode].toLocaleString()} pts` : chaseBest > 0
    ? game.distance > chaseBest ? 'Beyond your best' : `${Math.ceil(chaseBest - game.distance).toLocaleString()} m to your best`
    : 'Make your first mark');
  const dashActive = game.dashRemaining > 0;
  $('dash').disabled = game.state !== 'playing' || game.dashCharge < DASH_CHARGE || dashActive || game.surfRemaining > 0;
  setText('dash-label', dashActive ? `${Math.ceil(game.dashRemaining)}s` : game.dashCharge >= DASH_CHARGE ? 'READY' : `${game.dashCharge} / ${DASH_CHARGE}`);
  $('dash-progress').style.width = `${100 * (dashActive ? game.dashRemaining / game.dashDuration : game.dashCharge / DASH_CHARGE)}%`;
  $('dash').title = `Collect ${DASH_CHARGE} records, then press E for ${game.dashDuration} seconds of protection and record attraction`;
  $('touch-controls').classList.toggle('hidden', !profile.options.touchControls || game.state !== 'playing');
  $('bonus-status').classList.toggle('hidden',!game.bonus || game.state==='ready');
  if(game.bonus){
    setText('bonus-name',game.bonus.name);setText('bonus-detail',`${game.bonus.description} · +25 on exit`);
    $('bonus-progress').value=game.distance-game.bonus.start;
  }
}
function syncPowerups() {
  const names = { magnet: 'Magnet', shield: 'Shield', ghost: 'Ghost', spring: 'Super jump' };
  let active = false;
  for (const entry of powerMeters) {
    const { power, meter, bar, label: countdown } = entry;
    const duration=game.powerDuration(power);
    const seconds = game.powerups[power] || 0;
    if (seconds > 0) active = true;
    if (entry.remaining === seconds) continue;
    entry.remaining = seconds;
    meter.classList.toggle('hidden', seconds <= 0);
    bar.style.width = `${Math.min(1, seconds / duration) * 100}%`;
    meter.setAttribute('aria-valuenow', seconds.toFixed(1));
    meter.setAttribute('aria-valuemax', duration);
    if (seconds > 0) {
      active = true;
      const label = `${Math.ceil(seconds)}s`;
      if (countdown.textContent !== label || !meter.hasAttribute('aria-valuetext')) {
        countdown.textContent = label;
        meter.setAttribute('aria-valuetext', `${names[power]}: ${Math.ceil(seconds)} seconds remaining`);
      }
    }
  }
  $('powerups').classList.toggle('hidden', !active);
}

function syncSurfboard() {
  const riding = game.surfRemaining > 0;
  const affordable = game.coins >= SURFBOARD_COST;
  const button = $('surfboard');
  button.disabled = game.state !== 'playing' || riding || !affordable;
  $('surf-control').classList.toggle('riding', riding);
  $('surf-control').classList.toggle('affordable', affordable && !riding);
  setText('surf-price', riding ? `${Math.ceil(game.surfRemaining)}s` : `${SURFBOARD_COST}`);
  const progress = riding ? game.surfRemaining / game.surfDuration : Math.min(1, game.coins / SURFBOARD_COST);
  $('surf-progress').style.width = `${progress * 100}%`;
  $('surf-meter').setAttribute('aria-label', riding ? 'Surfboard flight remaining' : 'Records toward a surfboard');
  $('surf-meter').setAttribute('aria-valuemax', riding ? game.surfDuration : SURFBOARD_COST);
  $('surf-meter').setAttribute('aria-valuenow', riding ? game.surfRemaining.toFixed(1) : Math.min(game.coins, SURFBOARD_COST));
  const label = riding ? `Surfboard flight: ${Math.ceil(game.surfRemaining)} seconds remaining`
    : `Buy a ${game.surfDuration}-second surfboard flight for ${SURFBOARD_COST} records${affordable ? '' : `; ${SURFBOARD_COST - game.coins} more needed`}`;
  if (button.getAttribute('aria-label') !== label) {
    button.setAttribute('aria-label', label);
    button.title = riding ? label : `${label}. Click or press B.`;
  }
}

function start() {
  if (game.state === 'playing') return;
  if (mode === 'story' && !(game.state === 'over' && !game.completed)) { adventure.open(false); return; }
  beginRun();
}

function beginRun() {
  if (game.state === 'playing') return;
  $('control-guide').open = false;
  if (game.state !== 'ready') saveRun();
  $('run-kit').open=false;
  const prepared=prepareRun(profile,mode);
  profile=prepared.profile;
  game.modifier=prepared.modifier;game.upgrades=prepared.upgrades;game.supply=prepared.supply;
  game.character=prepared.character;game.weapon=prepared.weapon;
  saveProfile();
  runBaseline = createProfile(profile);
  runSaved = false;
  runRewards = null;
  runDate = localDateKey();
  runMode = mode;
  shell.dataset.mode = runMode;
  game.seed = mode === 'daily' ? dailySeed(runDate) : mode === 'story' ? `story:${game.chapterId}` : undefined;
  game.mode = mode;
  $('start').blur();
  game.personalBest = mode === 'daily' ? (profile.daily.date === runDate ? profile.daily.bestDistance : 0) : mode === 'endless' && prepared.modifier === 'none' ? best : 0;
  game.hasFiveCombo = profile.bestCombo >= 48;
  celebrationSeconds = 0;
  game.start();
  if (!radioChosen) {
    radioChosen = true;
    audioWanted = true;
    audio.enable().then(enabled => {
      if (!enabled) audioWanted = false;
      syncRadio();
    });
  }
  renderer.particles = [];
  renderer.flyingRecords = [];
  syncState();
  $('world').focus({ preventScroll: true });
}

function togglePause() {
  if (game.state === 'playing') game.pause();
  else if (game.state === 'paused') game.resume();
  syncState();
  if (game.state === 'playing') $('world').focus({ preventScroll: true });
}

function syncState() {
  if (lastState === game.state) return;
  const before = lastState;
  lastState = game.state;
  touchStart = null;
  shell.dataset.state = game.state;
  audio.setPlaying(game.state === 'playing');
  const isOverlay = game.state === 'paused' || game.state === 'over';
  $('overlay').classList.toggle('hidden', !isOverlay);
  $('intro').inert = game.state !== 'ready';
  $('pause').disabled = game.state === 'ready' || game.state === 'over';
  $('pause').setAttribute('aria-label', game.state === 'paused' ? 'Resume game' : 'Pause game');
  $('pause').innerHTML = game.state === 'paused'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6v12M15 6v12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  if (isOverlay) {
    savedFocus = document.activeElement;
    const over = game.state === 'over';
    const previousBest = best;
    if (over) saveRun();
    $('modal-eyebrow').textContent = over ? 'EVERY DRIFT IS A GOOD DRIFT' : 'TAKE A BREATHER';
    $('modal-title').textContent = over ? 'Another wave awaits.' : 'On island time.';
    $('modal-description').textContent = over ? 'A little bump. Still a whole lot of good vibes.' : 'Your next good wave can wait.';
    if (over && game.completed) {
      $('modal-eyebrow').textContent = 'THREE DISTRICTS. ONE SWEET RUN.';
      $('modal-title').textContent = 'Island Tour complete.';
      $('modal-description').textContent = 'All three checkpoints reached. Your passport and 300 checkpoint records are in the Logbook.';
    }
    if (game.chapter) {
      const chapter = game.chapter, goal = objectiveProgress(game);
      $('modal-eyebrow').textContent = over ? game.completed ? chapter.final ? 'NEO KINGSTON IS FREE' : 'FREQUENCY RESTORED' : 'THE CREW IS STILL WITH YOU' : 'YOUR MISSION';
      $('modal-title').textContent = over ? game.completed ? chapter.final ? 'The beat goes on.' : 'Chapter complete.' : game.campaignEnded ? 'One more try.' : 'Regroup and return.' : chapter.title;
      $('modal-description').textContent = over && game.completed ? chapter.outro : `${chapter.title}: ${goal.current} / ${goal.target} ${goal.label}. ${game.campaignEnded?'Reach the exit with the objective complete to unlock the next chapter.':'Your crew and unlocked chapters are safe.'}`;
    }
    $('results').classList.toggle('hidden', !over);
    $('result-distance').textContent = Math.floor(game.distance).toLocaleString();
    $('result-coins').textContent = (runRewards?.total || 0).toLocaleString();
    $('run-summary').classList.toggle('hidden', !over);
    $('run-summary').textContent = `${game.score.toLocaleString()} points · ${game.maxCombo} best streak · ${game.stats.nearMisses} close dodges · ${game.stats.stunts} stunts`;
    if(game.combatEnabled)$('run-summary').textContent += ` · ${game.combat.dodges} shots dodged · ${game.combat.deflections} deflections · ${game.combat.flawless} flawless bosses`;
    if(game.combatEnabled)$('run-summary').textContent += ` · ${game.stats.enemies} patrols defeated`;
    $('xp-earned').classList.toggle('hidden', !over);
    const previousLevel = levelProgress(runBaseline.xp).level, currentLevel = levelProgress(profile.xp).level;
    $('reward-receipt').classList.toggle('hidden', !over);
    if (over) {
      const rewards = runRewards || { total: 0, xp: 0 };
      $('xp-earned').textContent = `+${rewards.total.toLocaleString()} banked records · +${rewards.xp} XP${currentLevel > previousLevel ? ` · Level up! Now level ${currentLevel}` : ` · Level ${currentLevel}`}`;
      $('reward-breakdown').replaceChildren(...[
        [game.modifier === 'rich' ? 'Collected records · Gold rush ×2' : 'Collected records', rewards.collected], ['Run milestones', rewards.milestones],
        ['Route & boss bonuses', rewards.bonuses], ['Career contracts', rewards.contracts], ['First chapter clear', rewards.chapter],
      ].filter(([, value]) => value > 0).map(([label, value]) => {
        const row = document.createElement('div'), title = document.createElement('dt'), amount = document.createElement('dd');
        title.textContent = label; amount.textContent = `+${value.toLocaleString()}`; row.append(title, amount); return row;
      }));
      setText('reward-wallet', `Bank balance: ${profile.wallet.toLocaleString()} · Run spending never reduces these earnings.`);
      setText('reward-next', nextCrewGoal(profile));
    }
    syncMissions();
    const fresh = over ? ACHIEVEMENTS.filter(item => profile.achievements.includes(item.id) && !runBaseline.achievements.includes(item.id)) : [];
    const crew = over ? CHARACTERS.filter(item => characterUnlocked(item, profile) && !characterUnlocked(item, runBaseline)) : [];
    const styles = over ? STYLES.filter(item => item.level > previousLevel && item.level <= currentLevel) : [];
    const masteryUnlocks = CHARACTERS.filter(c => profile.mastery[c.id] >= MASTERY[c.id].target && runBaseline.mastery[c.id] < MASTERY[c.id].target);
    const unlocks = [over && masteryUnlocks.length ? 'Mastery outfits: '+masteryUnlocks.map(c=>MASTERY[c.id].outfit).join(', ') : '', crew.length ? `Crew joined: ${crew.map(item => item.name).join(', ')}` : '',
      styles.length ? `New looks: ${styles.map(item => item.name).join(', ')}` : '',
      fresh.length ? `Achievements: ${fresh.map(item => item.title).join(', ')}` : '',
      over && profile.story.cleared > runBaseline.story.cleared ? game.chapter.unlock : ''].filter(Boolean);
    $('unlocked').textContent = unlocks.join(' · ');
    $('unlocked').classList.toggle('hidden', !unlocks.length);
    $('revive').classList.toggle('hidden', !over || game.completed || game.campaignEnded || game.usedRevive || game.coins < REVIVE_COST);
    $('resume').innerHTML = `${over ? game.chapter ? game.completed ? 'Return to island map' : 'Retry chapter' : 'Drift again' : 'Keep drifting'} <span aria-hidden="true">↗</span>`;
    $('resume').focus({ preventScroll: true });
    if (over && game.modifier==='none' && ['endless', 'daily'].includes(runMode) && Math.floor(game.distance) > previousBest) {
      best = Math.floor(game.distance);
      $('modal-eyebrow').textContent = 'A FRESH PERSONAL BEST';
      if (!debug) try { localStorage.setItem('dolphin-drift-best', String(best)); } catch { /* Storage may be unavailable. */ }
    }
  } else if (before === 'paused' || before === 'over') {
    if (game.state === 'ready') $('start').focus({ preventScroll: true });
    else if (savedFocus instanceof HTMLElement && !savedFocus.closest('#overlay')) savedFocus.focus({ preventScroll: true });
    else $('resume').blur();
  }
}

$('start').addEventListener('click', start);
$('crew-open').addEventListener('click',()=>adventure.open(true));
$('shop-open').addEventListener('click',()=>{
  if(game.state==='playing')togglePause();
  shop.render();$('shop').showModal();previewRenderer.resize();applyCosmetics();setText('preview-label','Your equipped look');
});
$('shop-close').addEventListener('click',()=>$('shop').close());
$('preview-pose').addEventListener('click',()=>{
  const flying=previewGame.surfRemaining===0;previewGame.surfRemaining=flying?20:0;previewGame.player.altitude=flying?4.2:0;
  $('preview-pose').textContent=flying?'Preview walking':'Preview board';
});
for(const [id,key] of [['modifier-select','modifier'],['supply-select','supply']]) $(id).addEventListener('change',()=>{
  profile.preferences[key]=$(id).value;saveProfile();syncKit();
});
$('render-quality').addEventListener('change',()=>{
  profile.preferences.quality=$('render-quality').value;renderer.setQuality(profile.preferences.quality);saveProfile();syncLogbook();
});
$('resume').addEventListener('click', () => game.state === 'paused' ? togglePause() : start());
$('pause').addEventListener('click', togglePause);
$('surfboard').addEventListener('click', () => {
  game.buySurfboard();
  syncSurfboard();
  if (game.state === 'playing') $('world').focus({ preventScroll: true });
});
function returnHome() {
  saveRun();
  game.reset();
  renderer.particles = [];
  renderer.flyingRecords = [];
  syncState();
  syncMode();
}
$('home').addEventListener('click', returnHome);
document.querySelector('.brand').addEventListener('click', event => {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  returnHome();
});

$('revive').addEventListener('click', () => {
  if (!game.revive()) return;
  // Keep the crash checkpoint saved. The next finish is recalculated from the
  // original run baseline, so a continued run never counts twice.
  runSaved = false;
  syncState();
  $('world').focus({ preventScroll: true });
});
for (const name of Object.keys(MODES)) $('mode-' + name).addEventListener('click', () => { mode = name; syncMode(); });
$('dash').addEventListener('click', () => { game.dash(); $('world').focus({ preventScroll: true }); });
$('counter').addEventListener('click', () => { game.counter(); $('world').focus({ preventScroll: true }); });
$('ability').addEventListener('click', () => { game.action('ability'); $('world').focus({ preventScroll: true }); });
$('special').addEventListener('click', () => { game.action('special'); $('world').focus({ preventScroll: true }); });
for (const button of $('touch-controls').querySelectorAll('button')) button.addEventListener('click', () => {
  game.action(button.dataset.action); $('world').focus({ preventScroll: true });
});
$('show-touch').addEventListener('change', () => { profile.options.touchControls = $('show-touch').checked; saveProfile(); });
for (const [id, field] of [['music-volume', 'musicVolume'], ['effects-volume', 'effectsVolume']]) {
  $(id).addEventListener('input', () => {
    audio[field] = profile.options[field] = Number($(id).value) / 100;
    if (audio.context) {
      audio.setPlaying(game.state === 'playing');
      audio.fx.gain.setTargetAtTime(audio.effectsVolume, audio.context.currentTime, .05);
    }
    saveProfile();
  });
}
$('postcard').addEventListener('click', () => {
  const canvas = document.createElement('canvas');
  canvas.width = $('world').width; canvas.height = $('world').height;
  const context = canvas.getContext('2d');
  context.drawImage($('world'), 0, 0);
  const fontSize = Math.max(16, Math.round(canvas.width / 40));
  context.fillStyle = '#183e35dd'; context.fillRect(0, canvas.height - fontSize * 4, canvas.width, fontSize * 4);
  context.fillStyle = '#fffbe9'; context.font = `bold ${fontSize}px sans-serif`;
  context.fillText('DOLPHIN DRIFT / NEO KINGSTON', fontSize, canvas.height - fontSize * 2.3);
  context.font = `${fontSize * .7}px sans-serif`;
  context.fillText(`${MODES[runMode].name} · ${Math.floor(game.distance)} m · ${game.score} points`, fontSize, canvas.height - fontSize);
  canvas.toBlob(blob => {
    if (!blob) { setText('postcard-status', 'Could not create a postcard. Try again.'); return; }
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `dolphin-drift-${localDateKey()}.png`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setText('postcard-status', 'Postcard download requested.');
  }, 'image/png');
});
$('logbook-open').addEventListener('click', () => {
  if (game.state === 'playing') togglePause();
  syncLogbook();
  $('logbook').showModal();
});
$('logbook-close').addEventListener('click', () => $('logbook').close());
$('reduced-motion').addEventListener('change', () => {
  renderer.reducedMotion = $('reduced-motion').checked;
  profile.settings.reducedMotion = renderer.reducedMotion;
  document.documentElement.classList.toggle('less-motion', renderer.reducedMotion);
  renderer.particles = [];
  renderer.flyingRecords = [];
  saveProfile();
});
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  } catch { /* Browsers may disallow full screen in an embedded view. */ }
}
$('fullscreen').addEventListener('click', toggleFullscreen);
$('fullscreen').hidden = !document.fullscreenEnabled;

function syncRadio() {
  $('sound').setAttribute('aria-pressed', String(audio.enabled));
  $('sound').setAttribute('aria-label', audio.enabled ? 'Turn off island radio' : 'Turn on island radio');
  $('sound-label').textContent = audio.enabled ? 'Island radio' : 'Sound off';
}

$('sound').addEventListener('click', async () => {
  radioChosen = true;
  audioWanted = !audioWanted;
  profile.settings.muted = !audioWanted;
  saveProfile();
  if (audioWanted) {
    const enabled = await audio.enable();
    if (!enabled) audioWanted = false;
  } else audio.disable();
  syncRadio();
  if (game.state === 'playing') $('world').focus({ preventScroll: true });
});

const keyActions = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump', ArrowDown: 'slide', s: 'slide', S: 'slide', b: 'surfboard', B: 'surfboard', q: 'counter', Q: 'counter', c:'ability', C:'ability', x:'special', X:'special' };
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Escape' && $('control-guide').open) { $('control-guide').open = false; return; }
  if (event.key === ' ' && event.target.closest?.('summary')) return;
  if ($('logbook').open || $('shop').open || $('adventure').open || event.target.matches?.('select,input')) return;
  if (event.key.toLowerCase() === 'e') { event.preventDefault(); if (!event.repeat) game.action('dash'); return; }
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); if (!event.repeat) toggleFullscreen(); return; }
  if (event.key.toLowerCase() === 'r' && game.state === 'over') { event.preventDefault(); if (!event.repeat) start(); return; }
  if (event.key === 'Tab' && !$('overlay').classList.contains('hidden')) {
    const focusable = [$('revive'), $('resume'), $('home')].filter(button => !button.classList.contains('hidden'));
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    return;
  }
  if (event.key === 'Escape' || event.key.toLowerCase() === 'p') {
    event.preventDefault();
    if (!event.repeat) togglePause();
    return;
  }
  const action = keyActions[event.key];
  if (!action) return;
  // Space still activates a focused sound, pause, or dialog button normally.
  if (event.key === ' ' && document.activeElement instanceof HTMLButtonElement && document.activeElement !== $('start')) return;
  event.preventDefault();
  if (event.repeat) return;
  if (game.state === 'ready' && event.key === ' ') start();
  else if (game.state === 'playing') game.action(action);
});

let touchStart = null;
$('world').addEventListener('pointerdown', event => {
  $('control-guide').open = false;
  if (event.pointerType === 'mouse' || touchStart || game.state !== 'playing') return;
  touchStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  $('world').setPointerCapture(event.pointerId);
});
$('world').addEventListener('pointerup', event => {
  if (!touchStart || touchStart.pointerId !== event.pointerId) return;
  const dx = event.clientX - touchStart.x, dy = event.clientY - touchStart.y;
  touchStart = null;
  if (game.state !== 'playing') return;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) { game.action('jump'); return; }
  game.action(Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'jump' : 'slide');
});
for (const type of ['pointercancel', 'lostpointercapture']) $('world').addEventListener(type, event => {
  if (touchStart?.pointerId === event.pointerId) touchStart = null;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game.state === 'playing') { game.pause(); syncState(); }
    if (audio.enabled) audio.disable();
  } else {
    previousTime = performance.now();
    if (audioWanted) audio.enable().then(enabled => {
      if (!enabled) audioWanted = false;
      syncRadio();
    });
  }
});
window.addEventListener('blur', () => { if (game.state === 'playing') { game.pause(); syncState(); } });
new ResizeObserver(() => renderer.resize()).observe(shell);

function frame(now) {
  const dt = Math.min((now - previousTime) / 1000, .05);
  previousTime = now;
  if (!document.hidden) {
    const frameStart=performance.now();
    elapsed += dt;
    game.update(dt);
    for (const event of game.drainEvents()) {
      audio.effect(event.type);
      if (event.text) { celebration.textContent = event.text; celebrationSeconds = 3; }
      if (event.type === 'finish') { celebration.textContent = characterById(game.character).name+' celebrates!'; celebrationSeconds = 4; }
      renderer.burst(event.type, game, event);
    }
    audio.setIntensity(game);
    victoryCanvas.hidden = !(game.state === 'over' && game.completed);
    if (!victoryCanvas.hidden && victoryCanvas.clientWidth > 0) {
      victoryGame.character = game.character;
      victoryRenderer.reducedMotion = renderer.reducedMotion;
      victoryRenderer.style = renderer.style;
      victoryRenderer.hat = renderer.hat; victoryRenderer.boardId = renderer.boardId; victoryRenderer.boardColor = renderer.boardColor; victoryRenderer.trail = renderer.trail;
      victoryRenderer.masteryCharacter = renderer.masteryCharacter;
      victoryRenderer.resize(); victoryRenderer.draw(victoryGame, dt, elapsed);
    }
    if (game.state !== 'paused') celebrationSeconds = Math.max(0, celebrationSeconds - dt);
    celebration.classList.toggle('visible', celebrationSeconds > 0 && game.state !== 'ready');
    const routeText = game.state === 'playing' ? routePrompt(game) : '';
    if (routeBanner.textContent !== routeText) routeBanner.textContent = routeText;
    routeBanner.hidden = !routeText;
    const stateChanged = lastState !== game.state;
    syncState();
    // DOM meters need 20 Hz, while physics and aiming keep every animation frame.
    if(stateChanged || now-(frame.hudAt||0)>=50) {
      frame.hudAt=now;
      setText('distance', Math.floor(game.distance).toLocaleString());
      setText('coins', game.coins);
      setText('best', best.toLocaleString());
      syncRunHud();syncSurfboard();syncPowerups();
    }
    renderer.musicOn = audio.enabled;
    if($('shop').open){
      if(now-(frame.previewAt||0)>33){previewRenderer.resize();previewGame.distance+=.09;previewRenderer.draw(previewGame,.033,elapsed);frame.previewAt=now;}
    }else if(game.state==='playing' || game.state==='ready' || now-(frame.drawAt||0)>=200) {
      renderer.draw(game, dt, elapsed);frame.drawAt=now;
    }
    if(game.state==='playing')renderer.measureFrame(performance.now()-frameStart);
    document.documentElement.classList.toggle('performance-mode',renderer.effectiveQuality==='low');
  }
  requestAnimationFrame(frame);
}
syncState();
syncSurfboard();
syncMode();
syncRadio();
requestAnimationFrame(frame);
// An opt-in local inspection hook for browser smoke tests.
if (debug) window.__drift = { game, renderer, audio, get profile() { return profile; } };
