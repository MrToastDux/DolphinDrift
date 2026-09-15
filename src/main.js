import { Game, SURFBOARD_COST, SURFBOARD_SECONDS, POWERUP_DURATIONS } from './game.js';
import { Renderer } from './renderer.js';
import { IslandAudio } from './audio.js';

const $ = id => document.getElementById(id);
const game = new Game();
const renderer = new Renderer($('world'));
const audio = new IslandAudio();
const shell = $('game-shell');
let best = 0;
try { best = Math.max(0, Number(localStorage.getItem('dolphin-drift-best')) || 0); } catch { /* Play works without storage. */ }
let lastState = '';
let previousTime = performance.now();
let elapsed = 0;
let savedFocus = null;
let audioWanted = false;
let radioChosen = false;
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
    $('modal-eyebrow').textContent = over ? 'EVERY DRIFT IS A GOOD DRIFT' : 'TAKE A BREATHER';
    $('modal-title').textContent = over ? 'Another wave awaits.' : 'On island time.';
    $('modal-description').textContent = over ? 'A little bump. Still a whole lot of good vibes.' : 'Your next good wave can wait.';
    $('results').classList.toggle('hidden', !over);
    $('result-distance').textContent = Math.floor(game.distance).toLocaleString();
    $('result-coins').textContent = game.coins;
    $('resume').innerHTML = `${over ? 'Drift again' : 'Keep drifting'} <span aria-hidden="true">↗</span>`;
    $('resume').focus({ preventScroll: true });
    if (over && Math.floor(game.distance) > best) {
      best = Math.floor(game.distance);
      $('modal-eyebrow').textContent = 'A FRESH PERSONAL BEST';
      try { localStorage.setItem('dolphin-drift-best', String(best)); } catch { /* Storage may be unavailable. */ }
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
  game.reset();
  renderer.particles = [];
  syncState();
});

function syncRadio() {
  $('sound').setAttribute('aria-pressed', String(audio.enabled));
  $('sound').setAttribute('aria-label', audio.enabled ? 'Turn off island radio' : 'Turn on island radio');
  $('sound-label').textContent = audio.enabled ? 'Island radio' : 'Sound off';
}

$('sound').addEventListener('click', async () => {
  radioChosen = true;
  audioWanted = !audioWanted;
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
  if (event.key === 'Tab' && !$('overlay').classList.contains('hidden')) {
    const focusable = [$('resume'), $('home')];
    const first = focusable[0], last = focusable[1];
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
    syncSurfboard();
    syncPowerups();
    renderer.musicOn = audio.enabled;
    renderer.draw(game, dt, elapsed);
  }
  requestAnimationFrame(frame);
}
syncState();
syncSurfboard();
requestAnimationFrame(frame);
// An opt-in local inspection hook for browser smoke tests.
if (new URLSearchParams(location.search).has('debug')) window.__drift = { game, renderer, audio };
