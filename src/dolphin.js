const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const blend = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => a.map((v, i) => v - b[i]);
const palette = {
  skin: [116, 184, 183], light: [157, 212, 202], fin: [76, 145, 150],
  belly: [206, 224, 192], green: [48, 105, 72], dark: [36, 65, 50],
  gold: [225, 189, 96], cream: [239, 233, 201], sole: [157, 180, 145],
};

/** A tiny, depth-sorted 3D rig. +Z is forward along the track, +Y is up. */
export class DolphinRig {
  constructor() {
    this.faces = [];
    this.pitch = 0;
    this.yaw = 0;
    this.lean = 0;
    this.centerY = 105;
    this.bob = 0;
  }

  transform([x, y, z]) {
    y -= 105;
    // Forward rolls rotate around the transverse axis, rather than spinning a sprite.
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    [y, z] = [y * cp - z * sp, y * sp + z * cp];
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    [x, z] = [x * cy + z * sy, z * cy - x * sy];
    const cl = Math.cos(this.lean), sl = Math.sin(this.lean);
    [x, y] = [x * cl - y * sl, x * sl + y * cl];
    return [x, y + this.centerY + this.bob, z];
  }

  face(vertices, color, twoSided = false) {
    const points = vertices.map(p => this.transform(p));
    const normal = cross(sub(points[1], points[0]), sub(points[2], points[0]));
    const facing = normal[1] * .36 - normal[2] * .933;
    if (!twoSided && facing <= 0) return;
    const length = Math.hypot(...normal);
    if (length < .001) return;
    const light = Math.max(0, (normal[0] * -.42 + normal[1] * .73 - normal[2] * .53) / length * (facing < 0 ? -1 : 1));
    const brightness = .72 + light * .36;
    const fill = `rgb(${color.map(v => Math.round(Math.min(255, v * brightness))).join(',')})`;
    this.faces.push({
      points: points.map(([x, y, z]) => ({ x, y: -y * .933 - z * .36 })),
      depth: points.reduce((sum, p) => sum + p[2] * .933 - p[1] * .36, 0) / points.length,
      fill,
    });
  }

  ellipsoid(center, size, color, pitch = 0, latitude = Math.PI) {
    const detailed = Math.max(...size) > 30;
    const rows = detailed ? 9 : 6, cols = detailed ? 18 : 12;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const vertex = (i, j) => {
      const a = i / rows * latitude, b = j / cols * TAU;
      const x = size[0] * Math.sin(a) * Math.cos(b);
      const y = size[1] * Math.cos(a), z = size[2] * Math.sin(a) * Math.sin(b);
      return [center[0] + x, center[1] + y * cp - z * sp, center[2] + y * sp + z * cp];
    };
    const grid = Array.from({ length: rows + 1 }, (_, i) => Array.from({ length: cols + 1 }, (_, j) => vertex(i, j)));
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = grid[i][j], b = grid[i + 1][j], d = grid[i][j + 1], e = grid[i + 1][j + 1];
        // Outward-facing winding for the sphere parameterization.
        if (i > 0) this.face([a, d, b], color);
        if (i < rows - 1 || latitude < Math.PI) this.face([b, d, e], color);
      }
    }
  }

  tube(a, b, radius, color) {
    const mid = a.map((v, i) => (v + b[i]) / 2);
    const delta = sub(b, a), length = Math.hypot(...delta);
    // Limbs only bend through the Y/Z plane; hips stay at their natural width.
    this.ellipsoid(mid, [radius, length / 2 + radius, radius], color, Math.atan2(delta[2], delta[1]));
  }

  band(center, radius, height, color) {
    const [x, y, z] = center, [rx, rz] = radius;
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU, b = (i + 1) / 28 * TAU;
      this.face([[x + rx * Math.cos(a), y - height / 2, z + rz * Math.sin(a)], [x + rx * Math.cos(a), y + height / 2, z + rz * Math.sin(a)], [x + rx * Math.cos(b), y + height / 2, z + rz * Math.sin(b)], [x + rx * Math.cos(b), y - height / 2, z + rz * Math.sin(b)]], color);
    }
  }

  fin(vertices, thickness, color) {
    const front = vertices.map(([x, y, z]) => [x, y, z - thickness]);
    const back = vertices.map(([x, y, z]) => [x, y, z + thickness]);
    this.face(front, color, true);
    this.face(back, color, true);
    for (let i = 0; i < vertices.length; i++) {
      const next = (i + 1) % vertices.length;
      this.face([front[i], back[i], back[next], front[next]], color, true);
    }
  }

  build(game, time, surfing = game.surfRemaining > 0) {
    this.faces.length = 0;
    const p = game.player;
    const rolling = p.sliding && !surfing;
    const progress = rolling ? (p.rollProgress ?? (1 - p.slideRemaining / .85)) : 0;
    const tuck = rolling ? smooth(Math.min(progress / .16, (1 - progress) / .16)) : 0;
    this.pitch = surfing ? -Math.PI / 2 : rolling ? TAU * smooth((progress - .08) / .84) : 0;
    this.centerY = surfing ? 38 : mix(105, 50, tuck);
    const phase = game.state === 'ready' ? time * 3 : game.distance * 1.45;
    const stride = p.jump > 0 || surfing ? 0 : Math.sin(phase) * (1 - tuck);
    this.bob = surfing ? Math.sin(time * 2) * 2 : rolling || p.jump > 0 ? 0 : Math.abs(Math.cos(phase)) * 2;
    this.yaw = (surfing ? -1.05 : 0) + (p.lane - p.x) * .25;
    this.lean = (p.lane - p.x) * -.16 + stride * .025;
    this.smokeOrigin = null;
    if (surfing) this.buildBoard();

    // Shoes point down-track; their heels and alternating raised soles face the camera.
    for (const side of [-1, 1]) {
      const swing = stride * side;
      const hip = [side * 17, 64, 0];
      const knee = surfing ? [side * 18, 43, 18 + side * 4] : blend([side * 20, 39 + Math.max(0, swing) * 7, swing * 12], [side * 27, 90, 28], tuck);
      const ankle = surfing ? [side * 14, 16, 4] : blend([side * 20, 13 + Math.max(0, swing) * 15, swing * 18], [side * 23, 78, -14], tuck);
      this.tube(hip, knee, 8, palette.skin);
      this.tube(knee, ankle, 7, palette.light);
      const shoe = [ankle[0], ankle[1] - 5, ankle[2] + 7];
      this.ellipsoid([ankle[0], ankle[1] + 4, ankle[2]], [8, 9, 8], palette.cream);
      this.band([ankle[0], ankle[1] + 7, ankle[2]], [8.2, 8.2], 3, palette.gold);
      this.ellipsoid(shoe, [13, 9, 21], palette.cream, tuck * -.7);
      this.ellipsoid([shoe[0], shoe[1] - 5, shoe[2]], [13.5, 3.7, 21.5], palette.sole, tuck * -.7);
      this.ellipsoid([shoe[0], shoe[1] + 1, shoe[2] - 16], [8, 4, 3], palette.green, tuck * -.7);
    }

    // The tail curls up behind him during a roll, instead of stretching flat.
    const tailBase = blend([0, 72, -16], [0, 102, -20], tuck);
    const tailTip = blend([stride * 5, 63, -49], [0, 123, -35], tuck);
    this.tube(tailBase, tailTip, 9, palette.fin);
    for (const side of [-1, 1]) {
      this.fin([tailTip, [tailTip[0] + side * 37, tailTip[1] + 10, tailTip[2] - 8], [tailTip[0] + side * 27, tailTip[1] - 7, tailTip[2] - 11], [tailTip[0] + side * 5, tailTip[1] - 5, tailTip[2] + 2]], 2.2, palette.fin);
    }
    this.ellipsoid([0, 110, 0], blend([34, 53, 28], [35, 34, 31], tuck), palette.skin);
    this.ellipsoid([0, 108, 20], blend([25, 44, 13], [25, 29, 16], tuck), palette.belly);
    // Central dorsal fin is visible from behind and preserves the dolphin silhouette.
    this.fin([[0, 142, -24], [0, 127, surfing ? -34 : -52], [7, 104, -31], [-7, 104, -31]], 2.5, palette.fin);

    for (const side of [-1, 1]) {
      const shoulder = [side * 28, 136, 0];
      const finEnd = surfing ? [side * 39, side === 1 ? 158 : 99, side === 1 ? -8 : 23] : blend([side * (45 + Math.abs(stride) * 4), 96, -stride * side * 15], [side * 26, 91, 34], tuck);
      this.tube(shoulder, finEnd, 7, palette.skin);
      this.ellipsoid(finEnd, [9, 18, 5], palette.fin, -.1 + tuck * 1.1);
      if (side === -1) this.ellipsoid(blend([side * 43, 104, -stride * side * 13], [side * 26, 99, 27], tuck), [9.5, 3, 6], palette.gold);
    }

    const head = blend([0, 173, 9], [0, 123, 27], tuck);
    const headPitch = tuck * 1.1;
    const atHead = ([x, y, z]) => [head[0] + x, head[1] + y * Math.cos(headPitch) - z * Math.sin(headPitch), head[2] + y * Math.sin(headPitch) + z * Math.cos(headPitch)];
    this.ellipsoid(head, [35, 33, 29], palette.light, headPitch);
    this.ellipsoid(atHead([0, -5, 36]), [14, 10, 28], palette.skin, headPitch);
    this.ellipsoid(atHead([0, -9, 37]), [12, 4, 27], palette.belly, headPitch);
    if (surfing) {
      // The snout faces upward as he rests on his back; a small cigarette sits in his mouth.
      this.ellipsoid(atHead([0, -7, 72]), [2.5, 2.5, 12], palette.cream);
      this.ellipsoid(atHead([0, -7, 62]), [2.6, 2.6, 4], [187, 134, 77]);
      this.ellipsoid(atHead([0, -7, 84]), [2.8, 2.8, 2.4], [221, 109, 68]);
      this.smokeOrigin = this.transform(atHead([0, -7, 87]));
    }
    for (const side of [-1, 1]) {
      this.ellipsoid(atHead([side * 27, 0, 18]), [3, surfing ? 1.6 : 4, 3], palette.dark, headPitch);
      if (!surfing) this.ellipsoid(atHead([side * 28, 1, 18.5]), [1, 1.1, 1], palette.cream, headPitch);
      this.ellipsoid(atHead([side * 35, -2, -2]), [8, 14, 12], palette.gold, headPitch);
      this.ellipsoid(atHead([side * 40, -2, -2]), [4, 11, 9], palette.dark, headPitch);
    }
    // Cap and flag rotate together with the tucked head.
    this.ellipsoid(atHead([0, 20, 0]), [37, 24, 30], palette.green, headPitch, Math.PI / 2);
    // Head-local band vertices keep the hat attached through a complete somersault.
    for (const [height, width, color] of [[20, 8, palette.dark], [22, 3.5, palette.gold]]) {
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * TAU, b = (i + 1) / 24 * TAU;
        this.face([[37 * Math.cos(a), height - width / 2, 30 * Math.sin(a)], [37 * Math.cos(a), height + width / 2, 30 * Math.sin(a)], [37 * Math.cos(b), height + width / 2, 30 * Math.sin(b)], [37 * Math.cos(b), height - width / 2, 30 * Math.sin(b)]].map(atHead), color);
      }
    }
    const flag = [[-9, 27, -29.5], [9, 27, -29.5], [9, 17, -30.8], [-9, 17, -30.8]];
    this.face(flag.map(atHead), palette.green, true);
    this.face([[-9, 27, -30], [0, 22, -31.2], [-9, 17, -31.2]].map(atHead), palette.dark, true);
    this.face([[9, 27, -30], [0, 22, -31.2], [9, 17, -31.2]].map(atHead), palette.dark, true);
    this.face([[-9, 27, -31.3], [-9, 25, -31.3], [9, 17, -31.3], [9, 19, -31.3]].map(atHead), palette.gold, true);
    this.face([[-9, 17, -31.4], [-9, 19, -31.4], [9, 27, -31.4], [9, 25, -31.4]].map(atHead), palette.gold, true);
  }

  buildBoard() {
    const pose = { pitch: this.pitch, centerY: this.centerY, lean: this.lean };
    this.pitch = 0;
    this.centerY = 0;
    this.lean *= .45;
    // The board shares the rider's diagonal direction, with raised ends and a cream deck.
    this.ellipsoid([0, 104, 0], [45, 6, 145], palette.green);
    this.ellipsoid([0, 109, 0], [42, 3.6, 141], palette.cream);
    this.ellipsoid([0, 112, 0], [7, .8, 139], palette.gold);
    for (const side of [-1, 1]) {
      this.ellipsoid([side * 14, 112, 0], [3.8, .7, 131], palette.green);
    }
    this.fin([[-10, 100, 94], [10, 100, 94], [0, 82, 112]], 1.8, palette.fin);
    this.ellipsoid([0, 99, -84], [30, 2, 24], [165, 231, 200]);
    this.ellipsoid([0, 99, 84], [30, 2, 24], [165, 231, 200]);
    Object.assign(this, pose);
  }

  draw(renderer, game) {
    const c = renderer.ctx, p = game.player;
    const ground = renderer.project(p.x * 1.82, 0, 0);
    const altitude = renderer.flightCamera ?? p.altitude ?? 0;
    const surfing = game.surfRemaining > 0 || altitude > .08;
    const unit = Math.min(renderer.height * .00155, renderer.width * (surfing ? .00170 : .00235));
    const jumpY = (p.jump + altitude) * renderer.focal / 7.5;
    const shadowSize = 1 - Math.min((p.jump + altitude) * .16, .55);
    renderer.ellipse(ground.x, ground.y + 3, 43 * unit * shadowSize, 10 * unit * shadowSize, '#285b4e30');
    this.build(game, renderer.reducedMotion ? 0 : renderer.time, surfing);

    const centerY = ground.y - jumpY - (surfing ? 45 : p.sliding ? 45 : 100) * unit;
    if ((game.powerups?.shield ?? 0) > 0 || game.shieldGrace > 0 || game.surfLandingGrace > 0) {
      const radius = (surfing ? 153 : p.sliding ? 68 : 122) * unit;
      const bubble = c.createRadialGradient(ground.x - radius * .25, centerY - radius * .25, radius * .1, ground.x, centerY, radius);
      bubble.addColorStop(0, '#b7fbe309'); bubble.addColorStop(.80, '#90f2e020'); bubble.addColorStop(1, '#b6ffe85a');
      renderer.ellipse(ground.x, centerY, radius * (surfing ? 1 : .7), radius * (surfing ? .65 : 1), bubble);
      c.beginPath(); c.ellipse(ground.x, centerY, radius * (surfing ? 1 : .7), radius * (surfing ? .65 : 1), 0, 0, TAU);
      c.strokeStyle = '#cdfce696'; c.lineWidth = 1.8; c.stroke();
    }
    if ((game.powerups?.magnet ?? 0) > 0) {
      c.save();
      for (let i = 0; i < 3; i++) {
        const phase = (renderer.time * .8 + i / 3) % 1;
        c.beginPath(); c.ellipse(ground.x, ground.y - jumpY - 6, (35 + phase * 70) * unit, (9 + phase * 20) * unit, 0, 0, TAU);
        c.strokeStyle = `rgba(252,182,129,${(1 - phase) * .55})`; c.lineWidth = 1.5; c.stroke();
      }
      c.restore();
    }
    if (surfing) {
      const deckY = ground.y - jumpY;
      const glow = c.createRadialGradient(ground.x, deckY, 3, ground.x, deckY, 145 * unit);
      glow.addColorStop(0, '#ceffd654'); glow.addColorStop(1, '#ceffd600');
      renderer.ellipse(ground.x, deckY + 8 * unit, 145 * unit, 30 * unit, glow);
      for (let i = 0; i < 3; i++) {
        const flow = renderer.reducedMotion ? .4 : (renderer.time * 1.6 + i / 3) % 1;
        const x = ground.x - (30 + i * 30) * unit;
        renderer.line([{ x, y: deckY + (8 + i * 8) * unit }, { x: x + (38 + flow * 60) * unit, y: deckY + (13 + i * 8) * unit }], `rgba(221,255,221,${(1 - flow) * .5})`, 2 * unit);
      }
    }

    c.save();
    c.translate(ground.x, ground.y - jumpY);
    c.scale(unit, unit);
    this.faces.sort((a, b) => b.depth - a.depth);
    for (const face of this.faces) {
      // Matching hairline strokes close subpixel seams between mesh faces.
      renderer.poly(face.points, face.fill, face.fill, .35);
    }
    if (this.smokeOrigin) {
      const [x, y, z] = this.smokeOrigin;
      const sy = -y * .933 - z * .36;
      c.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const phase = renderer.reducedMotion ? .35 + i * .19 : (renderer.time * .35 + i / 3) % 1;
        const rise = phase * 60;
        const drift = Math.sin(phase * 5 + i) * (4 + phase * 8);
        c.beginPath(); c.moveTo(x + drift, sy - rise);
        c.bezierCurveTo(x + drift - 9, sy - rise - 10, x + drift + 10, sy - rise - 17, x + drift + 3, sy - rise - 28);
        c.strokeStyle = `rgba(242,244,218,${(1 - phase) * .75})`; c.lineWidth = 2.4 + phase * 3; c.stroke();
      }
    }
    c.restore();
    if (p.sliding && !surfing && !renderer.reducedMotion) {
      c.save();
      c.strokeStyle = '#d9f0c987'; c.lineWidth = 2;
      const progress = p.rollProgress ?? 0;
      for (const side of [-1, 1]) {
        c.beginPath(); c.ellipse(ground.x + side * 50 * unit, centerY, 12 * unit, 32 * unit, side * .2, progress * TAU, progress * TAU + Math.PI * 1.05); c.stroke();
      }
      c.restore();
    }
  }
}
