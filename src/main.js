import { Game } from './game.js';
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
let messageTimer;
let tutorialTimer;
let previousTime = performance.now();
let elapsed = 0;
let savedFocus = null;
let audioWanted = false;
let radioChosen = false;
const powerupMessages = {
  magnet: 'Magnet on. Records come to you for 10s.',
  shield: 'Shield on. One hit covered for 12s.',
  double: 'Double records. Sweet rewards for 10s.',
};

function syncPowerups() {
  const remaining = {
    magnet: game.powerups?.magnet || 0,
    shield: game.powerups?.shield || 0,
    double: game.dubRemaining || 0,
  };
  const names = { magnet: 'Record magnet', shield: 'One-hit shield', double: 'Double records' };
  let active = false;
  for (const [power, seconds] of Object.entries(remaining)) {
    const badge = $(`power-${power}`);
    badge.classList.toggle('hidden', seconds <= 0);
    if (seconds > 0) {
      active = true;
      const label = `${Math.ceil(seconds)}s`;
      if (badge.querySelector('strong').textContent !== label || !badge.hasAttribute('aria-label')) {
        badge.querySelector('strong').textContent = label;
        badge.setAttribute('aria-label', `${names[power]}: ${Math.ceil(seconds)} seconds remaining`);
      }
    }
  }
  $('powerups').classList.toggle('hidden', !active);
  shell.classList.toggle('has-powerups', active);
}

function message(text, seconds = 2.8) {
  clearTimeout(messageTimer);
  $('run-message').textContent = text;
  $('run-message').classList.add('visible');
  messageTimer = setTimeout(() => $('run-message').classList.remove('visible'), seconds * 1000);
}

function start() {
  clearTimeout(tutorialTimer);
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
  message('Easy feet. Good beats.', 2.4);
  tutorialTimer = setTimeout(() => {
    if (game.state === 'playing') message('Follow the golden records ↗', 3);
  }, 4200);
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
    clearTimeout(tutorialTimer);
    $('run-message').classList.remove('visible');
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
$('home').addEventListener('click', () => {
  clearTimeout(tutorialTimer);
  clearTimeout(messageTimer);
  game.reset();
  renderer.particles = [];
  $('run-message').classList.remove('visible');
  syncState();
});

function syncRadio() {
  $('sound').setAttribute('aria-pressed', String(audio.enabled));
  $('sound').setAttribute('aria-label', audio.enabled ? 'Turn off island radio' : 'Turn on island radio');
  $('sound-label').textContent = audio.enabled ? 'Island radio' : 'Sound off';
  $('radio-card').classList.toggle('on-air', audio.enabled);
  $('radio-status').textContent = audio.enabled ? '/ ON AIR' : '/ 78 BPM';
}

$('sound').addEventListener('click', async () => {
  radioChosen = true;
  audioWanted = !audioWanted;
  if (audioWanted) {
    const enabled = await audio.enable();
    if (!enabled) { audioWanted = false; message('Radio is taking a breather. Try again.'); }
  } else audio.disable();
  syncRadio();
  if (game.state === 'playing') $('world').focus({ preventScroll: true });
});

const keyActions = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump', ArrowDown: 'slide', s: 'slide', S: 'slide' };
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

document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    game.action(button.dataset.action);
  });
  button.addEventListener('click', event => {
    if (event.detail === 0) game.action(button.dataset.action);
  });
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
      if (event.type === 'dub') message('Dub mode! Double the records. ♫', 3.2);
      if (event.type === 'powerup') message(powerupMessages[event.power] || 'Good vibes, powered up.', 3.2);
      if (event.type === 'shield-break') message('Shield saved you. Keep that rhythm.', 2.7);
    }
    syncState();
    $('distance').textContent = Math.floor(game.distance).toLocaleString();
    $('coins').textContent = game.coins;
    $('best').textContent = best.toLocaleString();
    const dub = game.dubRemaining > 0;
    $('flow-meter').classList.toggle('dub-active', dub);
    $('flow-title').textContent = dub ? 'DUB MODE · 2× RECORDS' : 'FIND YOUR RHYTHM';
    $('flow-count').textContent = dub ? `${Math.ceil(game.dubRemaining)}s` : `${game.flow}/8`;
    [...$('flow-bars').children].forEach((bar, i) => bar.classList.toggle('lit', dub ? i < Math.ceil(game.dubRemaining / 10 * 8) : i < game.flow));
    syncPowerups();
    renderer.musicOn = audio.enabled;
    renderer.draw(game, dt, elapsed);
  }
  requestAnimationFrame(frame);
}
syncState();
requestAnimationFrame(frame);
// An opt-in local inspection hook for browser smoke tests.
if (new URLSearchParams(location.search).has('debug')) window.__drift = { game, renderer, audio };
