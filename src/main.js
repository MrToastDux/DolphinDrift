import { Game, SURFBOARD_COST, SURFBOARD_SECONDS, POWERUP_DURATIONS, REVIVE_COST } from './game.js';
import { Renderer, getDistrict } from './renderer.js';
import { IslandAudio } from './audio.js';
import { createProfile, finishRun, getMissions, ACHIEVEMENTS, dailySeed, localDateKey } from './progression.js';

const $ = id => document.getElementById(id);
const game = new Game();
const renderer = new Renderer($('world'));
const audio = new IslandAudio();
const shell = $('game-shell');
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
document.documentElement.classList.toggle('less-motion', renderer.reducedMotion);
let runBaseline = createProfile(profile);
let runSaved = false;
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
  profile = finishRun(runBaseline, game, { date: runDate, daily: runMode === 'daily' });
  profile.settings = settings;
  runSaved = true;
  best = Math.max(best, Math.floor(profile.bestDistance));
  saveProfile();
}

function syncMode() {
  $('mode-endless').setAttribute('aria-pressed', String(mode === 'endless'));
  $('mode-daily').setAttribute('aria-pressed', String(mode === 'daily'));
  const date = localDateKey();
  const dailyBest = profile.daily.date === date ? profile.daily.bestScore : 0;
  $('mode-note').textContent = mode === 'daily'
    ? `${date} · Same seed all day · Best ${dailyBest.toLocaleString()} pts`
    : 'A fresh route. A little faster every second.';
}

function syncMissions() {
  $('mission-list').replaceChildren(...getMissions(game).map(mission => {
    const row = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${mission.complete ? '✓' : '○'} ${mission.title}`;
    const value = document.createElement('strong');
    value.textContent = `${Math.min(mission.target, Math.floor(mission.current))} / ${mission.target}`;
    row.classList.toggle('complete', mission.complete);
    row.append(label, value);
    return row;
  }));
}

function syncLogbook() {
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
  $('score').textContent = game.score.toLocaleString();
  $('speed-value').textContent = game.speed.toFixed(1);
  $('multiplier').textContent = `×${game.multiplier}`;
  $('combo-label').textContent = game.combo ? `${game.combo} record streak` : 'find your flow';
  $('flow-progress').style.width = `${game.comboRemaining / 6 * 100}%`;
  $('flow-meter').setAttribute('aria-valuenow', game.comboRemaining.toFixed(1));
  const district = getDistrict(game.distance);
  $('district-name').textContent = `${runMode === 'daily' ? 'DAILY / ' : ''}${district.name.toUpperCase()}`;
  $('best-chase').textContent = best > 0
    ? game.distance > best ? 'Beyond your best' : `${Math.ceil(best - game.distance).toLocaleString()} m to your best`
    : 'Make your first mark';
}
function syncPowerups() {
  const names = { magnet: 'Magnet', shield: 'Shield', ghost: 'Ghost', spring: 'Super jump' };
  let active = false;
  for (const [power, duration] of Object.entries(POWERUP_DURATIONS)) {
    const seconds = game.powerups[power] || 0;
    const meter = $(`power-${power}`);
    meter.classList.toggle('hidden', seconds <= 0);
    meter.querySelector('.power-progress').style.width = `${Math.min(1, seconds / duration) * 100}%`;
    meter.setAttribute('aria-valuenow', seconds.toFixed(1));
    meter.setAttribute('aria-valuemax', duration);
    if (seconds > 0) {
      active = true;
      const label = `${Math.ceil(seconds)}s`;
      if (meter.querySelector('strong').textContent !== label || !meter.hasAttribute('aria-valuetext')) {
        meter.querySelector('strong').textContent = label;
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
  $('surf-price').textContent = riding ? `${Math.ceil(game.surfRemaining)}s` : `${SURFBOARD_COST}`;
  const progress = riding ? game.surfRemaining / SURFBOARD_SECONDS : Math.min(1, game.coins / SURFBOARD_COST);
  $('surf-progress').style.width = `${progress * 100}%`;
  $('surf-meter').setAttribute('aria-label', riding ? 'Surfboard flight remaining' : 'Records toward a surfboard');
  $('surf-meter').setAttribute('aria-valuemax', riding ? SURFBOARD_SECONDS : SURFBOARD_COST);
  $('surf-meter').setAttribute('aria-valuenow', riding ? game.surfRemaining.toFixed(1) : Math.min(game.coins, SURFBOARD_COST));
  const label = riding ? `Surfboard flight: ${Math.ceil(game.surfRemaining)} seconds remaining`
    : `Buy a ${SURFBOARD_SECONDS}-second surfboard flight for ${SURFBOARD_COST} records${affordable ? '' : `; ${SURFBOARD_COST - game.coins} more needed`}`;
  if (button.getAttribute('aria-label') !== label) {
    button.setAttribute('aria-label', label);
    button.title = riding ? label : `${label}. Click or press B.`;
  }
}

function start() {
  if (game.state === 'playing') return;
  if (game.state !== 'ready') saveRun();
  runBaseline = createProfile(profile);
  runSaved = false;
  runDate = localDateKey();
  runMode = mode;
  game.seed = mode === 'daily' ? dailySeed(runDate) : undefined;
  $('start').blur();
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
    $('results').classList.toggle('hidden', !over);
    $('result-distance').textContent = Math.floor(game.distance).toLocaleString();
    $('result-coins').textContent = game.coins;
    $('run-summary').classList.toggle('hidden', !over);
    $('run-summary').textContent = `${game.score.toLocaleString()} points · ${game.maxCombo} best streak · ${game.stats.nearMisses} close dodges`;
    syncMissions();
    const fresh = over ? ACHIEVEMENTS.filter(item => profile.achievements.includes(item.id) && !runBaseline.achievements.includes(item.id)) : [];
    $('unlocked').textContent = fresh.length ? `Unlocked: ${fresh.map(item => item.title).join(' · ')}` : '';
    $('unlocked').classList.toggle('hidden', !fresh.length);
    $('revive').classList.toggle('hidden', !over || game.usedRevive || game.coins < REVIVE_COST);
    $('resume').innerHTML = `${over ? 'Drift again' : 'Keep drifting'} <span aria-hidden="true">↗</span>`;
    $('resume').focus({ preventScroll: true });
    if (over && Math.floor(game.distance) > previousBest) {
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
$('resume').addEventListener('click', () => game.state === 'paused' ? togglePause() : start());
$('pause').addEventListener('click', togglePause);
$('surfboard').addEventListener('click', () => {
  game.buySurfboard();
  syncSurfboard();
  if (game.state === 'playing') $('world').focus({ preventScroll: true });
});
$('home').addEventListener('click', () => {
  saveRun();
  game.reset();
  renderer.particles = [];
  syncState();
  syncMode();
});

$('revive').addEventListener('click', () => {
  if (!game.revive()) return;
  // Keep the crash checkpoint saved. The next finish is recalculated from the
  // original run baseline, so a continued run never counts twice.
  runSaved = false;
  syncState();
  $('world').focus({ preventScroll: true });
});
for (const name of ['endless', 'daily']) $('mode-' + name).addEventListener('click', () => { mode = name; syncMode(); });
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

const keyActions = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump', ArrowDown: 'slide', s: 'slide', S: 'slide', b: 'surfboard', B: 'surfboard' };
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if ($('logbook').open) return;
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
  if (event.pointerType === 'mouse') return;
  touchStart = { x: event.clientX, y: event.clientY };
  $('world').setPointerCapture(event.pointerId);
});
$('world').addEventListener('pointerup', event => {
  if (!touchStart) return;
  const dx = event.clientX - touchStart.x, dy = event.clientY - touchStart.y;
  touchStart = null;
  if (game.state !== 'playing') return;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) { game.action('jump'); return; }
  game.action(Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'jump' : 'slide');
});
$('world').addEventListener('pointercancel', () => { touchStart = null; });

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
    elapsed += dt;
    game.update(dt);
    for (const event of game.drainEvents()) {
      audio.effect(event.type);
      renderer.burst(event.type, game, event);
    }
    syncState();
    $('distance').textContent = Math.floor(game.distance).toLocaleString();
    $('coins').textContent = game.coins;
    $('best').textContent = best.toLocaleString();
    syncRunHud();
    syncSurfboard();
    syncPowerups();
    renderer.musicOn = audio.enabled;
    renderer.draw(game, dt, elapsed);
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
