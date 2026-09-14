import { DolphinRig } from './dolphin.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 1;
    this.height = 1;
    this.camera = 0;
    this.time = 0;
    this.particles = [];
    this.dolphinRig = new DolphinRig();
    this.flyingRecords = [];
    this.flash = 0;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    this.width = bounds.width;
    this.height = bounds.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  project(x, y, z) {
    const scale = this.focal / Math.max(1.2, z + 7.5);
    return { x: this.center + x * scale, y: this.horizon + (this.cameraHeight - y) * scale, scale };
  }

  poly(points, fill, stroke, width = 1) {
    const c = this.ctx;
    c.beginPath();
    points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }

  line(points, color, width = 1) {
    const c = this.ctx;
    c.beginPath();
    points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }

  ellipse(x, y, rx, ry, color, angle = 0) {
    const c = this.ctx;
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), angle, 0, TAU);
    c.fill();
  }

  rect(x, y, w, h, radius, color) {
    const c = this.ctx;
    c.fillStyle = color;
    c.beginPath();
    c.roundRect(x, y, w, h, radius);
    c.fill();
  }

  quad(x1, x2, z1, z2, y, fill, stroke) {
    this.poly([this.project(x1, y, z1), this.project(x2, y, z1), this.project(x2, y, z2), this.project(x1, y, z2)], fill, stroke);
  }

  burst(type, game, event = {}) {
    if (type === 'crash') this.flash = .35;
    if (type === 'coin' && event.magnetic && event.from && !this.reducedMotion) {
      const origin = this.project(event.from.lane * 1.82, event.from.height ?? .85, event.from.z);
      this.flyingRecords.push({ x: origin.x, y: origin.y, life: .36, max: .36 });
    }
    if (!['coin', 'powerup', 'shield-break'].includes(type) || this.reducedMotion) return;
    const p = this.project(game.player.x * 1.82, 1.2 + game.player.jump, 0);
    const count = type === 'coin' ? 9 : 24;
    const color = type === 'shield-break' || event.power === 'shield' ? '#b9ffea' : event.power === 'magnet' ? '#ffc093' : '#ffdf86';
    for (let i = 0; i < count; i++) {
      const angle = i / count * TAU;
      this.particles.push({ x: p.x, y: p.y, vx: Math.cos(angle) * (40 + Math.random() * 80), vy: Math.sin(angle) * 90 - 35, life: .65, max: .65, color });
    }
  }

  draw(game, dt, elapsed) {
    const c = this.ctx, w = this.width, h = this.height;
    const running = game.state !== 'ready';
    this.camera = lerp(this.camera, running ? 1 : 0, 1 - Math.exp(-dt * 3));
    this.time = elapsed;
    this.center = w * lerp(w < 700 ? .70 : .665, .5, this.camera);
    this.horizon = h * lerp(w < 700 ? .52 : .36, .34, this.camera);
    this.focal = Math.min(h * 1.12, w * 1.05);
    this.cameraHeight = (h * .88 - this.horizon) * 7.5 / this.focal;
    this.background();
    this.road(game.distance);

    const entries = [];
    for (let i = 0; i < 6; i++) {
      const z = ((i * 39 + 20 - game.distance * .75) % 234 + 234) % 234;
      if (z > 3) entries.push({ kind: 'speaker', z, x: i % 2 ? -4.3 : 4.3 });
    }
    for (let i = 0; i < 3; i++) {
      const z = ((i * 88 + 42 - game.distance) % 264 + 264) % 264;
      if (z > 3) entries.push({ kind: 'bunting', z });
    }
    for (let i = 0; i < 12; i++) {
      let z = ((i * 20 + 5 - game.distance * .6) % 240 + 240) % 240;
      if (z < 2) continue;
      entries.push({ kind: 'palm', z, x: (i % 2 ? -1 : 1) * (4.35 + hash(i) * 1.6), seed: i });
    }
    for (let i = 0; i < 12; i++) {
      let z = ((i * 20 + 12 - game.distance) % 240 + 240) % 240;
      if (z > 1) entries.push({ kind: 'light', z, x: i % 2 ? -3.15 : 3.15 });
    }
    for (const object of game.objects) if (object.z > -3 && object.z < 210) entries.push({ ...object, kind: 'object' });
    entries.push({ kind: 'player', z: 0 });
    entries.sort((a, b) => b.z - a.z);
    for (const entry of entries) {
      if (entry.kind === 'palm') this.palm(entry);
      if (entry.kind === 'light') this.trackLight(entry);
      if (entry.kind === 'speaker') this.speaker(entry);
      if (entry.kind === 'bunting') this.bunting(entry.z);
      if (entry.kind === 'object') this.object(entry);
      if (entry.kind === 'player') this.dolphin(game);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 110 * dt;
      c.globalAlpha = p.life / p.max;
      this.ellipse(p.x, p.y, 3, 3, p.color || '#ffdf86');
    }
    c.globalAlpha = 1;
    const target = this.project(game.player.x * 1.82, 1 + game.player.jump, 0);
    for (let i = this.flyingRecords.length - 1; i >= 0; i--) {
      const record = this.flyingRecords[i];
      if (game.state === 'playing') record.life -= dt;
      if (record.life <= 0 || game.state === 'ready') { this.flyingRecords.splice(i, 1); continue; }
      const t = 1 - record.life / record.max, eased = t * t;
      const x = lerp(record.x, target.x, eased), y = lerp(record.y, target.y, eased) - Math.sin(t * Math.PI) * 30;
      this.line([{ x: lerp(record.x, target.x, Math.max(0, eased - .1)), y: lerp(record.y, target.y, Math.max(0, eased - .1)) }, { x, y }], '#ffe5a383', 2);
      this.ellipse(x, y, 5 + t * 3, 5 + t * 3, '#e7c267');
      this.ellipse(x, y, 2, 2, '#5e8b76');
    }
    if (this.flash > 0) {
      c.fillStyle = `rgba(249,155,117,${this.flash})`;
      c.fillRect(0, 0, w, h);
      this.flash = Math.max(0, this.flash - dt * 1.3);
    }
  }

  background() {
    const c = this.ctx, w = this.width, h = this.height, hz = this.horizon;
    const sky = c.createLinearGradient(0, 0, 0, hz + h * .15);
    sky.addColorStop(0, '#b7d7bd');
    sky.addColorStop(.55, '#dedaaf');
    sky.addColorStop(1, '#f4cea4');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);

    const sx = this.center + w * .04, sy = hz - h * .135, sr = Math.min(w * .078, h * .13);
    const halo = c.createRadialGradient(sx, sy, sr * .2, sx, sy, sr * 2.5);
    halo.addColorStop(0, '#ffedb57a'); halo.addColorStop(1, '#ffedb500');
    this.ellipse(sx, sy, sr * 2.5, sr * 2.5, halo);
    this.ellipse(sx, sy, sr, sr, '#fff0bf');
    c.save();
    c.beginPath(); c.ellipse(sx, sy, sr * 1.6, sr * .43, -.35, 0, TAU);
    c.strokeStyle = '#ffffde70'; c.lineWidth = 1; c.stroke();
    c.restore();

    // A distant island and a small, sun-bleached skyline.
    c.beginPath(); c.moveTo(0, hz + 6);
    for (let i = 0; i <= 32; i++) c.lineTo(w * i / 32, hz - h * (.009 + hash(i + 40) * .023));
    c.lineTo(w, hz + 12); c.closePath(); c.fillStyle = '#9bbba377'; c.fill();
    for (let i = 0; i < 28; i++) {
      const x = w * (.38 + i * .024);
      const bw = w * (.013 + hash(i + 2) * .016);
      const bh = h * (.025 + hash(i + 30) * .08);
      this.rect(x, hz - bh, bw, bh + 3, [bw * .35, bw * .35, 0, 0], '#8eaf9c53');
      c.fillStyle = '#e4e7bf66'; c.fillRect(x + bw * .2, hz - bh + 6, bw * .13, bh * .75);
    }
    this.tower(w * .83, hz, h * .25, w * .043, 0);
    this.tower(w * .90, hz + 4, h * .17, w * .038, 1);
    this.tower(w * .53, hz + 2, h * .13, w * .030, 2);
    this.tower(w * .98, hz, h * .30, w * .06, 3);
    // A silent sky tram and its fine aerial line.
    const tramX = this.center + w * .16 + Math.sin(this.time * .06) * w * .018;
    const tramY = hz - h * .11;
    this.line([{ x: w * .73, y: tramY + 8 }, { x: w, y: tramY + 8 }], '#698f7e30', 1);
    this.rect(tramX, tramY, w * .065, h * .016, 8, '#719b8a');
    this.rect(tramX + w * .007, tramY + 2, w * .047, h * .006, 5, '#e7e9bf');
    this.line([{ x: tramX + 6, y: tramY + h * .020 }, { x: tramX + w * .059, y: tramY + h * .020 }], '#b2f7d5', 2);

    const water = c.createLinearGradient(0, hz, 0, h);
    water.addColorStop(0, '#b2cdb1'); water.addColorStop(.12, '#9ec7b5'); water.addColorStop(.6, '#91c5b8'); water.addColorStop(1, '#76b6ad');
    c.fillStyle = water; c.fillRect(0, hz + 5, w, h - hz);
    for (let i = 0; i < 68; i++) {
      const depth = hash(i + 90);
      const y = hz + 9 + depth * depth * (h - hz);
      const x = hash(i + 20) * w + Math.sin(this.time * .27 + i) * 5;
      const len = (8 + hash(i + 18) * 70) * (.15 + depth);
      this.line([{ x, y }, { x: x + len, y }], i % 3 ? '#d9eccc33' : '#4c9e9a22', .7 + depth);
    }
    // Sunlight dissolves into the water.
    for (let i = 0; i < 20; i++) {
      const y = hz + 10 + i * i * .19;
      const length = sr * (.9 - i / 30) * (.4 + hash(i + 42));
      this.line([{ x: sx - length / 2, y }, { x: sx + length / 2, y }], '#ffebbd32', 2);
    }
    const haze = c.createLinearGradient(0, hz - 15, 0, hz + 40);
    haze.addColorStop(0, '#e4dfb900'); haze.addColorStop(.5, '#e4dfb98a'); haze.addColorStop(1, '#e4dfb900');
    c.fillStyle = haze; c.fillRect(0, hz - 15, w, 55);
    // Soft film falloff keeps the title readable without a panel.
    if (this.camera < 1) {
      const shade = c.createLinearGradient(0, 0, w * .6, 0);
      shade.addColorStop(0, `rgba(222,230,196,${.72 * (1 - this.camera)})`);
      shade.addColorStop(1, '#dce6c400');
      c.fillStyle = shade; c.fillRect(0, 0, w, h);
    }
  }

  tower(x, y, height, width, seed) {
    const c = this.ctx;
    const gradient = c.createLinearGradient(x, 0, x + width, 0);
    gradient.addColorStop(0, '#739d89'); gradient.addColorStop(.6, '#9db99d'); gradient.addColorStop(1, '#668e7b');
    this.rect(x, y - height, width, height, [width * .4, width * .4, 0, 0], gradient);
    this.rect(x + width * .12, y - height + 8, width * .19, height * .80, width * .08, '#c4d4ab65');
    for (let j = 1; j < 7; j++) {
      const yy = y - height + j * height / 8;
      this.rect(x - width * .04, yy, width * 1.08, 3, 2, '#5b8c7740');
      this.rect(x + width * .65, yy + 5, width * .20, 2, 1, '#e8e9b98a');
    }
    if (seed % 2 === 0) {
      const yy = y - height * .72;
      this.ellipse(x + width / 2, yy, width * .75, width * .14, '#719d86');
      this.line([{ x: x - width * .22, y: yy - 2 }, { x: x + width * 1.22, y: yy - 2 }], '#d9f1bd', 2);
    }
    this.line([{ x: x + width / 2, y: y - height - 12 }, { x: x + width / 2, y: y - height }], '#719c86', 1);
    this.ellipse(x + width / 2, y - height - 12, 2, 2, '#eef5c8');
  }

  road(distance) {
    const c = this.ctx;
    this.quad(-3.15, 3.15, -4, 240, -.22, '#538c7b');
    const pavement = c.createLinearGradient(0, this.horizon, 0, this.height);
    pavement.addColorStop(0, '#b5cdb3'); pavement.addColorStop(.35, '#86b7a0'); pavement.addColorStop(1, '#659e8c');
    this.quad(-2.95, 2.95, -4, 240, 0, pavement);
    this.quad(-.89, .89, -4, 240, .003, '#d8ead012');
    // Passing expansion joints give the walking pace a sense of motion.
    for (let i = 0; i < 45; i++) {
      const z = i * 6 - distance % 6;
      if (z < -3) continue;
      this.line([this.project(-2.94, .005, z), this.project(2.94, .005, z)], '#3f7e6e26', Math.max(.5, 7.5 / (z + 7.5)));
      if (i % 2 === 0) this.quad(-2.91, 2.91, z, z + 3, .005, '#e8f2d108');
    }
    for (const x of [-2.95, 2.95]) {
      this.quad(x - .042, x + .042, -4, 240, .02, '#ede4a0');
      this.quad(x - .085, x + .085, -4, 240, -.07, '#8ae1b18c');
    }
    for (const x of [-.91, .91]) {
      this.quad(x - .008, x + .008, -4, 240, .012, '#d1e9c44f');
      for (let i = 0; i < 22; i++) {
        const z = i * 12 - distance % 12;
        if (z > -2) this.quad(x - .017, x + .017, z, z + 3, .016, '#dcf1c99c');
      }
    }
    // Yellow inset wayfinding marks at the edge of the platform.
    for (let i = 0; i < 28; i++) {
      const z = i * 9 - distance % 9;
      if (z < -2) continue;
      for (const sign of [-1, 1]) {
        this.quad(sign * 2.63 - .07, sign * 2.63 + .07, z, z + .45, .025, '#edda8bba');
        this.quad(sign * 2.63 - .07, sign * 2.63 + .07, z + .55, z + .85, .025, '#d68764ba');
        this.quad(sign * 2.63 - .07, sign * 2.63 + .07, z + .95, z + 1.25, .025, '#a1cca0aa');
      }
    }
  }

  bunting(z) {
    const c = this.ctx;
    for (const x of [-3.25, 3.25]) this.line([this.project(x, 0, z), this.project(x, 4.9, z)], '#5d8c728a', Math.max(1, this.focal / (z + 7.5) * .025));
    const points = [];
    for (let i = 0; i <= 20; i++) {
      const x = -3.25 + i * 6.5 / 20;
      points.push(this.project(x, 4.9 - .5 * (1 - (x / 3.25) ** 2), z));
    }
    this.line(points, '#5b735f99', 1);
    for (let i = 0; i < 9; i++) {
      const x = -2.9 + i * .7;
      const y = 4.9 - .5 * (1 - (x / 3.25) ** 2);
      const flutter = this.reducedMotion ? 0 : Math.sin(this.time * 1.2 + i) * .06;
      this.poly([this.project(x - .25, y, z), this.project(x + .25, y, z), this.project(x + flutter, y - .49, z)], ['#c98461', '#e0be68', '#579067'][i % 3]);
    }
  }

  speaker({ x, z }) {
    const c = this.ctx, ground = this.project(x, 0, z);
    this.ellipse(ground.x, ground.y + ground.scale * .10, ground.scale * 1.15, ground.scale * .21, '#507c6129');
    this.box(x, z, 1.9, .16, 1.4, ['#788f6b', '#b7c59a', '#668665'], .02);
    this.box(x, z + .1, 1.20, 2.28, .65, ['#365c48', '#b39759', '#756d48'], .18);
    for (const [y, radius] of [[.70, .39], [1.53, .31]]) {
      const p = this.project(x, y, z + .09);
      const beat = this.musicOn && !this.reducedMotion ? Math.max(0, Math.sin(this.time * 78 / 60 * TAU)) * .035 : 0;
      this.ellipse(p.x, p.y, (radius + .035) * p.scale, (radius + .035) * p.scale, '#bcab69');
      this.ellipse(p.x, p.y, radius * p.scale, radius * p.scale, '#244337');
      this.ellipse(p.x, p.y, (radius * .76 + beat) * p.scale, (radius * .76 + beat) * p.scale, '#416150');
      this.ellipse(p.x, p.y, radius * .36 * p.scale, radius * .36 * p.scale, '#253f35');
      this.ellipse(p.x - radius * .09 * p.scale, p.y - radius * .12 * p.scale, radius * .12 * p.scale, radius * .07 * p.scale, '#92aa7766');
    }
    for (let i = 0; i < 3; i++) {
      this.poly([this.project(x - .49 + i * .33, 2.11, z + .085), this.project(x - .19 + i * .33, 2.11, z + .085), this.project(x - .19 + i * .33, 2.22, z + .085), this.project(x - .49 + i * .33, 2.22, z + .085)], ['#c47d59', '#dfbd62', '#70a173'][i]);
    }
  }

  trackLight({ x, z }) {
    const a = this.project(x, 0, z), b = this.project(x, .45, z);
    this.line([a, b], '#5a947f', Math.max(1, b.scale * .045));
    this.ellipse(b.x, b.y, b.scale * .09, b.scale * .035, '#e5f8c6');
  }

  palm({ x, z, seed }) {
    const c = this.ctx;
    const p = this.project(x, 0, z);
    const height = (4.7 + hash(seed) * 1.2) * p.scale;
    const lean = (x > 0 ? -1 : 1) * height * .15;
    const topX = p.x + lean, topY = p.y - height;
    this.ellipse(p.x, p.y + 3, p.scale * .9, p.scale * .19, '#447f6f22');
    this.ellipse(p.x, p.y, p.scale * .62, p.scale * .2, '#87b99c');
    c.beginPath(); c.moveTo(p.x, p.y); c.quadraticCurveTo(p.x + lean * .1, p.y - height * .5, topX, topY);
    c.strokeStyle = '#638f79'; c.lineWidth = Math.max(2, p.scale * .11); c.lineCap = 'round'; c.stroke();
    c.beginPath(); c.moveTo(p.x - p.scale * .025, p.y); c.quadraticCurveTo(p.x + lean * .1 - p.scale * .025, p.y - height * .5, topX - p.scale * .025, topY);
    c.strokeStyle = '#aac4a0'; c.lineWidth = Math.max(1, p.scale * .025); c.stroke();
    for (let i = 0; i < 7; i++) {
      const angle = -.25 + i / 6 * (Math.PI + .5);
      const side = Math.cos(angle), rise = Math.sin(angle);
      const length = height * (.32 + hash(seed * 9 + i) * .12);
      const sway = this.reducedMotion ? 0 : Math.sin(this.time * .7 + seed + i) * length * .026;
      const ex = topX + side * length + sway, ey = topY + length * (.25 - rise * .45);
      c.beginPath(); c.moveTo(topX, topY);
      c.quadraticCurveTo(topX + side * length * .62, topY - length * .52, ex, ey + length * .2);
      c.quadraticCurveTo(topX + side * length * .65, topY - length * .21, topX, topY + p.scale * .05);
      c.fillStyle = i % 2 ? '#497c63' : '#629775'; c.fill();
      c.beginPath(); c.moveTo(topX, topY); c.quadraticCurveTo(topX + side * length * .59, topY - length * .30, ex, ey + length * .2);
      c.strokeStyle = '#a8c99855'; c.lineWidth = .6; c.stroke();
    }
  }

  box(x, z, width, height, length, colors, base = 0) {
    const half = width / 2;
    const fl = this.project(x - half, base, z), fr = this.project(x + half, base, z);
    const tl = this.project(x - half, height + base, z), tr = this.project(x + half, height + base, z);
    const bl = this.project(x - half, height + base, z + length), br = this.project(x + half, height + base, z + length);
    const groundLeft = this.project(x - half, base, z + length), groundRight = this.project(x + half, base, z + length);
    this.poly([tl, tr, br, bl], colors[1]);
    this.poly([fl, tl, bl, groundLeft], colors[2]);
    this.poly([fr, tr, br, groundRight], colors[2]);
    this.poly([fl, fr, tr, tl], colors[0]);
    return { fl, fr, tl, tr, bl, br };
  }

  object(object) {
    const { lane, z, type } = object, x = lane * 1.82;
    const c = this.ctx, floor = this.project(x, .02, z);
    if (type === 'powerup') {
      const p = this.project(x, 1.05 + Math.sin(this.time * 2 + object.id) * .1, z);
      const radius = .43 * p.scale;
      const colors = { magnet: ['#f5a07c', '#815841'], shield: ['#a2e4d1', '#376e65'], double: ['#f1d57c', '#8a6d34'] };
      const [bright, ink] = colors[object.power] || colors.double;
      this.ellipse(floor.x, floor.y, radius * .9, radius * .19, '#547e6240');
      const glow = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 2);
      glow.addColorStop(0, bright + '69'); glow.addColorStop(1, bright + '00');
      this.ellipse(p.x, p.y, radius * 2, radius * 2, glow);
      c.save(); c.translate(p.x, p.y);
      c.rotate(Math.sin(this.time * 1.5 + object.id) * .05);
      this.rect(-radius, -radius, radius * 2, radius * 2, radius * .45, bright);
      c.strokeStyle = '#fff5d6c9'; c.lineWidth = Math.max(1, radius * .055);
      c.beginPath(); c.roundRect(-radius, -radius, radius * 2, radius * 2, radius * .45); c.stroke();
      c.lineCap = 'round'; c.lineJoin = 'round';
      if (object.power === 'magnet') {
        c.beginPath(); c.moveTo(-radius * .40, -radius * .40); c.lineTo(-radius * .40, radius * .05); c.arc(0, radius * .05, radius * .40, Math.PI, 0, true); c.lineTo(radius * .40, -radius * .40);
        c.strokeStyle = ink; c.lineWidth = radius * .20; c.stroke();
        c.strokeStyle = '#fff0cb'; c.lineWidth = radius * .23;
        for (const side of [-1, 1]) { c.beginPath(); c.moveTo(side * radius * .4, -radius * .43); c.lineTo(side * radius * .4, -radius * .24); c.stroke(); }
      } else if (object.power === 'shield') {
        c.beginPath(); c.moveTo(0, -radius * .58); c.lineTo(radius * .48, -radius * .35); c.lineTo(radius * .39, radius * .19); c.quadraticCurveTo(radius * .24, radius * .47, 0, radius * .6); c.quadraticCurveTo(-radius * .24, radius * .47, -radius * .39, radius * .19); c.lineTo(-radius * .48, -radius * .35); c.closePath();
        c.fillStyle = ink; c.fill();
        this.line([{ x: 0, y: -radius * .25 }, { x: 0, y: radius * .30 }], bright, radius * .1);
      } else {
        c.fillStyle = ink; c.font = `600 ${radius * 1.1}px Outfit, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('2×', 0, radius * .03);
      }
      if (p.scale > 24) {
        c.font = `600 ${Math.max(6, radius * .28)}px "DM Sans", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = ink;
        c.fillText(object.power === 'double' ? 'DOUBLE DUB' : object.power.toUpperCase(), 0, -radius * 1.35);
      }
      c.restore();
      return;
    }
    if (type === 'coin') {
      const p = this.project(x, .88 + Math.sin(this.time * 2.2 + object.id) * .045, z);
      const radius = .19 * p.scale;
      const spin = .72 + Math.sin(this.time * 1.8 + object.id * .15) * .18;
      this.ellipse(floor.x, floor.y, radius * .8, radius * .19, '#547e6240');
      this.ellipse(p.x, p.y, radius * 1.65, radius * 1.65, '#ffde7e15');
      c.save(); c.translate(p.x, p.y); c.scale(spin, 1);
      this.ellipse(2, 0, radius, radius, '#b48c39');
      const gold = c.createLinearGradient(-radius, -radius, radius, radius);
      gold.addColorStop(0, '#ffecaf'); gold.addColorStop(.4, '#e6c266'); gold.addColorStop(1, '#c89d47');
      this.ellipse(0, 0, radius, radius, gold);
      c.beginPath(); c.arc(0, 0, radius * .69, 0, TAU); c.strokeStyle = '#fff1b696'; c.lineWidth = Math.max(.5, radius * .04); c.stroke();
      c.beginPath(); c.arc(0, 0, radius * .50, 0, TAU); c.strokeStyle = '#af843d50'; c.stroke();
      this.ellipse(0, 0, radius * .23, radius * .23, '#759180');
      this.ellipse(0, 0, radius * .07, radius * .07, '#f0dea1');
      c.restore();
      return;
    }
    this.ellipse(floor.x, floor.y, floor.scale * .8, floor.scale * .14, '#295f5040');
    if (type === 'barrier') {
      const b = this.box(x, z, 1.38, .72, .4, ['#d38268', '#f0b68e', '#ae6d59']);
      this.poly([this.project(x - .64, .52, z - .006), this.project(x + .64, .52, z - .006), this.project(x + .64, .63, z - .006), this.project(x - .64, .63, z - .006)], '#ffe3a0');
      for (let i = 0; i < 4; i++) {
        const xx = x - .56 + i * .31;
        this.poly([this.project(xx, .11, z - .01), this.project(xx + .13, .11, z - .01), this.project(xx + .31, .4, z - .01), this.project(xx + .18, .4, z - .01)], '#ffe4a65e');
      }
      this.line([b.tl, b.tr], '#ffebba', Math.max(1, floor.scale * .018));
    } else if (type === 'gate') {
      this.box(x - .72, z, .11, 2.05, .12, ['#548f80', '#b3d0a6', '#397365']);
      this.box(x + .72, z, .11, 2.05, .12, ['#548f80', '#b3d0a6', '#397365']);
      this.box(x, z, 1.58, .37, .16, ['#69b3a0', '#a4dbb7', '#4b9685'], 1.42);
      this.line([this.project(x - .7, 1.48, z - .01), this.project(x + .7, 1.48, z - .01)], '#dcffc6', Math.max(1.5, floor.scale * .028));
      const p = this.project(x, 1.6, z - .01);
      c.save(); c.translate(p.x, p.y); c.strokeStyle = '#ecfbd2'; c.lineWidth = Math.max(1, floor.scale * .026); c.lineCap = 'round';
      const s = floor.scale * .09; c.beginPath(); c.moveTo(-s, -s / 3); c.lineTo(0, s / 2); c.lineTo(s, -s / 3); c.stroke(); c.restore();
    } else if (type === 'tram') {
      this.box(x, z, 1.45, 2.08, 5.5, ['#427f75', '#a0c4a8', '#568f7e'], .16);
      const win = [this.project(x - .57, 1.39, z - .012), this.project(x + .57, 1.39, z - .012), this.project(x + .52, 1.91, z - .012), this.project(x - .52, 1.91, z - .012)];
      this.poly(win, '#254f4e');
      this.poly([this.project(x - .49, 1.79, z - .015), this.project(x + .50, 1.79, z - .015), this.project(x + .52, 1.91, z - .015), this.project(x - .52, 1.91, z - .015)], '#8dc9b166');
      this.line([this.project(x - .57, .54, z - .015), this.project(x + .57, .54, z - .015)], '#e8edb9', Math.max(1, floor.scale * .038));
      this.line([this.project(x - .50, .20, z - .016), this.project(x + .50, .20, z - .016)], '#c1ffc5', Math.max(2, floor.scale * .035));
      const p = this.project(x, .97, z - .01);
      if (p.scale > 10) { c.fillStyle = '#c5ddad'; c.font = `${Math.max(5, p.scale * .1)}px sans-serif`; c.textAlign = 'center'; c.fillText('PALM 01', p.x, p.y); }
      for (let i = 0; i < 4; i++) {
        const zz = z + .6 + i * 1.12;
        for (const side of [-1, 1]) this.poly([this.project(x + side * .727, 1.30, zz), this.project(x + side * .727, 1.30, zz + .74), this.project(x + side * .727, 1.88, zz + .74), this.project(x + side * .727, 1.88, zz)], '#2f6960');
      }
    }
  }

  dolphin(game) {
    this.dolphinRig.draw(this, game);
  }
}
