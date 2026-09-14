const hz = midi => 440 * 2 ** ((midi - 69) / 12);
const CHORDS = [[62, 65, 69, 72], [62, 65, 67, 70], [62, 65, 69, 70], [61, 64, 67, 69]];
// Sparse, syncopated bass phrases across Dm7 / Gm7 / Bbmaj7 / A7.
const BASS = [
  [[0, 38, .66], [3, 45, .28], [5, 48, .3], [6, 45, .23], [7, 41, .28]],
  [[0, 43, .68], [3, 50, .25], [5, 41, .3], [6, 43, .57]],
  [[0, 34, .7], [3, 41, .28], [5, 46, .34], [7, 45, .28]],
  [[0, 33, .62], [2, 40, .21], [3, 43, .31], [5, 45, .33], [7, 37, .27]],
];
const MELODY = new Map([
  [1, [74, .5]], [3, [77, .27]], [5, [79, .51]], [7, [77, .26]],
  [8, [74, .67]], [11, [70, .3]], [13, [67, .74]],
]);

/** An original, self-contained reggae instrumental, started only by enable(). */
export class IslandAudio {
  constructor() {
    this.enabled = false;
    this.context = null;
    this.playing = false;
    this.timer = null;
    this.suspendTimer = null;
    this.sources = new Set();
    this.step = 0;
    this.nextBeat = 0;
    this.eighth = 60 / 78 / 2;
    this.lastCoin = -Infinity;
  }

  async enable() {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return false;
    clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
    try {
      if (!this.context) this.createGraph(new AudioContext());
      this.enabled = true;
      await this.context.resume();
      if (!this.enabled) return false;
      if (this.context.state !== 'running') {
        this.enabled = false;
        return false;
      }
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.36, now, 0.08);
      if (this.timer === null) {
        this.nextBeat = now + 0.08;
        this.schedule();
        this.timer = setInterval(() => this.schedule(), 90);
      }
      return true;
    } catch {
      this.disable();
      return false;
    }
  }

  disable() {
    this.enabled = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    clearTimeout(this.suspendTimer);
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.012);
    for (const source of this.sources) {
      try { source.stop(now + 0.055); } catch { /* Already finished. */ }
    }
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      if (!this.enabled) this.context.suspend().catch(() => {});
    }, 70);
  }

  setPlaying(playing) {
    this.playing = Boolean(playing);
    if (this.context) {
      this.music.gain.setTargetAtTime(this.playing ? 0.78 : 0.56, this.context.currentTime, 0.3);
    }
  }

  createGraph(context) {
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -15;
    limiter.knee.value = 16;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.22;
    this.master.connect(limiter);
    limiter.connect(context.destination);

    this.music = context.createGain();
    this.music.gain.value = this.playing ? 0.78 : 0.56;
    this.music.connect(this.master);
    this.fx = context.createGain();
    this.fx.gain.value = 0.75;
    this.fx.connect(this.master);

    const wave = harmonics => context.createPeriodicWave(
      new Float32Array(harmonics.length), new Float32Array(harmonics),
    );
    this.waves = {
      organ: wave([0, 1, .3, .36, .08, .13, .04, .04]),
      guitar: wave([0, 1, .54, .28, .16, .09, .035]),
      reed: wave([0, 1, .14, .43, .06, .17, .025, .055]),
    };

    this.echo = context.createGain();
    this.echo.gain.value = 0.22;
    const delay = context.createDelay(2);
    delay.delayTime.value = this.eighth * 1.5;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1650;
    const feedback = context.createGain();
    feedback.gain.value = 0.31;
    this.echo.connect(delay);
    delay.connect(filter);
    filter.connect(this.music);
    filter.connect(feedback);
    feedback.connect(delay);

    this.noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.4), context.sampleRate);
    const samples = this.noiseBuffer.getChannelData(0);
    // Repeatable noise keeps the music fully self contained.
    let seed = 7331;
    for (let i = 0; i < samples.length; i++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      samples[i] = (seed / 4294967296) * 2 - 1;
    }
  }

  track(source, nodes) {
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  tone(frequency, time, duration, volume, options = {}) {
    const context = this.context;
    const oscillator = context.createOscillator();
    if (options.wave) oscillator.setPeriodicWave(this.waves[options.wave]);
    else oscillator.type = options.type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, time);
    if (options.detune) oscillator.detune.value = options.detune;
    if (options.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, time + duration);
    }
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.cutoff || 1800, time);
    if (options.endCutoff) {
      filter.frequency.exponentialRampToValueAtTime(options.endCutoff, time + duration);
    }
    const envelope = context.createGain();
    const attack = Math.min(options.attack || 0.012, duration * 0.2);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(volume, time + attack);
    if (options.sustain) {
      const release = Math.min(options.release || .14, duration * .35);
      envelope.gain.exponentialRampToValueAtTime(volume * options.sustain, time + duration - release);
    }
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(filter);
    filter.connect(envelope);
    const ownedNodes = [filter, envelope];
    const output = options.fx ? this.fx : this.music;
    if (options.pan && context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = options.pan;
      envelope.connect(panner);
      panner.connect(output);
      ownedNodes.push(panner);
    } else envelope.connect(output);
    if (options.echo) envelope.connect(this.echo);
    if (options.vibrato) {
      const vibrato = context.createOscillator();
      vibrato.frequency.value = 5.1;
      const depth = context.createGain();
      depth.gain.setValueAtTime(0, time);
      depth.gain.linearRampToValueAtTime(frequency * .003, time + Math.min(.2, duration * .5));
      vibrato.connect(depth);
      depth.connect(oscillator.frequency);
      this.track(vibrato, [depth]);
      vibrato.start(time);
      vibrato.stop(time + duration);
    }
    this.track(oscillator, ownedNodes);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  noise(time, duration, volume, frequency, type = 'highpass', fx = false) {
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.6;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(volume, time + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(fx ? this.fx : this.music);
    this.track(source, [filter, envelope]);
    source.start(time);
    source.stop(time + duration + 0.01);
  }

  schedule() {
    if (!this.enabled || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    // A background tab can wake much later; never schedule a burst of missed beats.
    if (this.nextBeat < now) this.nextBeat = now + 0.035;
    while (this.nextBeat < now + 0.2) {
      this.beat(this.step++, this.nextBeat);
      this.nextBeat += this.eighth;
    }
  }

  beat(step, time) {
    const beat = step % 8;
    const bar = Math.floor(step / 8) % 4;
    const laidBack = time + .009;

    // Upstroke guitar and a warm organ answer on each offbeat. The quiet
    // strum and slightly late timing give the groove some breathing room.
    if (beat % 2 === 1) {
      const accent = beat === 3 || beat === 7 ? 1 : .86;
      for (const [index, note] of CHORDS[bar].entries()) {
        this.tone(hz(note), laidBack + index * .004, .18, .041 * accent, {
          wave: 'organ', cutoff: 2100, endCutoff: 1000, attack: .006,
          pan: -.16, echo: beat === 7,
        });
        this.tone(hz(note + 12), laidBack + .012 + (3 - index) * .004, .105, .024 * accent, {
          wave: 'guitar', cutoff: 2400, endCutoff: 650, attack: .004,
          pan: .2, echo: true,
        });
      }
    }

    // A little organ "bubble" between the main chops, kept well below them.
    if (beat === 2 || beat === 6) {
      for (const note of CHORDS[bar].slice(0, 2)) {
        this.tone(hz(note), time + this.eighth * .72, .075, .012, {
          wave: 'organ', cutoff: 1000, attack: .006, pan: -.2,
        });
      }
    }

    const bass = BASS[bar].find(note => note[0] === beat);
    if (bass) {
      const [, note, duration] = bass;
      this.tone(hz(note), time, duration, .27, {
        cutoff: 380, attack: .019, sustain: .48, release: .12,
      });
      this.tone(hz(note), time, duration * .8, .055, {
        type: 'triangle', cutoff: 550, endCutoff: 220, attack: .012,
      });
    }

    this.noise(time, beat % 2 ? .066 : .037, beat % 2 ? .022 : .012, 6800);
    this.noise(time + this.eighth * .53, .037, .011, 4400, 'bandpass');

    // One-drop: kick and woody cross-stick meet on the third beat.
    if (beat === 4) {
      this.tone(105, time, .2, .21, { endFrequency: 45, cutoff: 220, attack: .006 });
      this.tone(1740, laidBack, .026, .085, { endFrequency: 1450, cutoff: 2900, attack: .002 });
      this.tone(830, laidBack, .041, .035, { cutoff: 2100, attack: .002 });
      this.noise(laidBack, .045, .045, 2200, 'bandpass');
      this.noise(laidBack + .008, .12, .025, 1350, 'bandpass');
    }
    if (bar === 3 && beat === 7) {
      this.noise(time + this.eighth * .5, .047, .026, 1550, 'bandpass');
    }

    // An original two-bar melodica phrase, then six bars of instrumental space.
    const melody = MELODY.get(step % 64);
    if (melody) {
      const [note, duration] = melody;
      this.tone(hz(note), laidBack + .015, duration, .057, {
        wave: 'reed', cutoff: 2100, attack: .034, sustain: .63,
        release: .13, pan: .1, vibrato: true, echo: true,
      });
    }
  }

  effect(name) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime + 0.005;
    if (name === 'coin') {
      if (now - this.lastCoin < 0.06) return;
      this.lastCoin = now;
      this.tone(880, now, 0.13, 0.08, { fx: true });
      this.tone(1320, now + 0.045, 0.18, 0.06, { fx: true });
    } else if (name === 'jump') {
      this.tone(220, now, 0.2, 0.095, { endFrequency: 520, fx: true });
    } else if (name === 'slide' || name === 'roll') {
      this.noise(now, 0.22, 0.045, 900, 'bandpass', true);
      this.tone(260, now, .24, .047, { endFrequency: 160, pan: -.16, fx: true });
    } else if (name === 'powerup') {
      const chord = CHORDS[Math.floor(this.step / 8) % 4];
      [chord[0], chord[2], chord[0] + 12].forEach((note, index) => {
        this.tone(hz(note), now + index * .085, .4, .09, {
          wave: 'organ', cutoff: 2300, attack: .008, sustain: .28,
          pan: (index - 1) * .35, echo: true, fx: true,
        });
      });
    } else if (name === 'shield-break') {
      this.noise(now, .16, .045, 1700, 'bandpass', true);
      this.tone(523.25, now, .3, .075, { endFrequency: 392, pan: -.3, fx: true });
      this.tone(659.25, now + .07, .3, .055, { pan: .3, echo: true, fx: true });
    } else if (name === 'crash') {
      this.tone(145, now, 0.33, 0.19, { endFrequency: 48, fx: true });
      this.noise(now, 0.24, 0.075, 650, 'lowpass', true);
    } else if (name === 'start') {
      [440, 523.25, 659.25].forEach((frequency, index) => {
        this.tone(frequency, now + index * 0.095, 0.4, 0.075, { fx: true });
      });
    } else if (name === 'dub') {
      const chord = CHORDS[Math.floor(this.step / 8) % 4];
      [...chord, chord[0] + 12, chord[1] + 12].forEach((note, index) => {
        this.tone(hz(note), now + index * .105, .42, .09, {
          wave: 'reed', cutoff: 2350, attack: .012, sustain: .35,
          pan: index % 2 ? .22 : -.22, fx: true, echo: true,
        });
      });
    }
  }
}
