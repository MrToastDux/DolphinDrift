import { MASTERY } from './mastery.js';
const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const blend = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const sub = (a, b) => a.map((v, i) => v - b[i]);
const palette = {
  skin: [116, 184, 183], light: [157, 212, 202], fin: [76, 145, 150],
  belly: [206, 224, 192], green: [48, 105, 72], dark: [36, 65, 50],
  gold: [225, 189, 96], cream: [239, 233, 201], sole: [157, 180, 145],
};
const globalPalette = palette;
const sphereCache = new Map();
const skinColors = { coral:[233,151,134], lagoon:[119,175,229], orchid:[180,151,220], gold:[229,197,117], mint:[138,225,176], sunset:[239,172,136], abyss:[87,127,165], cherry:[220,115,152], lime:[183,217,103], pearl:[216,217,233], lava:[237,121,87] };
Object.assign(skinColors, { 'skin-orca':[39,53,72], 'skin-koi':[243,207,182], 'skin-cosmic':[121,92,186],
  'skin-cyber':[49,72,91], 'skin-ice':[164,229,243], 'skin-dragon':[242,136,180] });
const rgb = hex => [1,3,5].map(index => parseInt(hex.slice(index,index+2),16));

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
    if (!this.rotation || this.rotation.pitch !== this.pitch || this.rotation.yaw !== this.yaw || this.rotation.lean !== this.lean) {
      this.rotation = { pitch:this.pitch,yaw:this.yaw,lean:this.lean,cp:Math.cos(this.pitch),sp:Math.sin(this.pitch),cy:Math.cos(this.yaw),sy:Math.sin(this.yaw),cl:Math.cos(this.lean),sl:Math.sin(this.lean) };
    }
    // Forward rolls rotate around the transverse axis, rather than spinning a sprite.
    const {cp,sp,cy,sy,cl,sl} = this.rotation;
    [y, z] = [y * cp - z * sp, y * sp + z * cp];
    [x, z] = [x * cy + z * sy, z * cy - x * sy];
    [x, y] = [x * cl - y * sl, x * sl + y * cl];
    return [x, y + this.centerY + this.bob, z];
  }

  face(vertices, color, twoSided = false, transformed = false) {
    const points = transformed ? vertices : vertices.map(p => this.transform(p));
    const p=points[0],a=points[1],b=points[2];
    const ax=a[0]-p[0],ay=a[1]-p[1],az=a[2]-p[2],bx=b[0]-p[0],by=b[1]-p[1],bz=b[2]-p[2];
    const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
    const facing = ny * .36 - nz * .933;
    if (!twoSided && facing <= 0) return;
    const length = Math.hypot(nx,ny,nz);
    if (length < .001) return;
    const light = Math.max(0, (nx * -.42 + ny * .73 - nz * .53) / length * (facing < 0 ? -1 : 1));
    const brightness = .68 + light * .42 + Math.pow(light, 12) * .08;
    const fill = `rgb(${color.map(v => Math.round(Math.min(255, v * brightness))).join(',')})`;
    this.faces.push({
      points: points.map(([x, y, z]) => ({ x, y: -y * .933 - z * .36 })),
      depth: points.reduce((sum, p) => sum + p[2] * .933 - p[1] * .36, 0) / points.length,
      fill,
    });
  }

  ellipsoid(center, size, color, pitch = 0, latitude = Math.PI) {
    const detailed = Math.max(...size) > 30;
    const rows = this.lowDetail ? detailed ? 6 : 4 : detailed ? 8 : 5;
    const cols = this.lowDetail ? detailed ? 12 : 8 : detailed ? 16 : 10;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const key = `${rows}:${cols}:${latitude}`;
    if (!sphereCache.has(key)) sphereCache.set(key, Array.from({ length: rows + 1 }, (_, i) => Array.from({ length: cols + 1 }, (_, j) => {
      const a=i/rows*latitude,b=j/cols*TAU;return [Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)];
    })));
    // Reuse sphere topology and transform each shared vertex only once.
    const grid = sphereCache.get(key).map(row => row.map(([vx,vy,vz]) => {
      const x=vx*size[0],y=vy*size[1],z=vz*size[2];
      return this.transform([center[0]+x,center[1]+y*cp-z*sp,center[2]+y*sp+z*cp]);
    }));
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = grid[i][j], b = grid[i + 1][j], d = grid[i][j + 1], e = grid[i + 1][j + 1];
        // Outward-facing winding for the sphere parameterization.
        if (i === 0) this.face([b,d,e],color,false,true);
        else if (i === rows - 1 && latitude === Math.PI) this.face([a,d,b],color,false,true);
        else this.face([a,d,e,b],color,false,true);
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
    const segments = this.lowDetail ? 12 : 20;
    for (let i = 0; i < segments; i++) {
      const a = i / segments * TAU, b = (i + 1) / segments * TAU;
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
    const palette = this.masteryColor ? { ...globalPalette, skin: this.masteryColor, light: this.masteryColor.map(v=>Math.min(255,v+25)), green: [48,55,89], gold: [255,221,124] } : this.palette || globalPalette;
    this.faces.length = 0;
    this.boostOrigins = [];
    const p = game.player;
    const spring = (game.powerups?.spring ?? 0) > 0 || Boolean(p.springJump);
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
    if (game.completed && game.state === 'over') {
      const beat = time * 4;
      if (game.character === 'dub') { this.pitch = Math.sin(beat)*.18; this.bob = 12 + Math.abs(Math.sin(beat))*28; }
      else if (game.character === 'octo') { this.yaw = time*2; this.bob = 14; }
      else if (game.character === 'shark') { this.lean = Math.sin(beat)*.28; this.bob = Math.max(0, Math.sin(beat))*18; }
      else { this.yaw = Math.sin(beat*.5)*.65; this.bob = 5 + Math.abs(Math.sin(beat))*10; }
    }
    this.smokeOrigin = null;
    if (this.masteryColor) {
      this.band([0,115,0],[game.character === 'dub' ? 35 : 46, game.character === 'dub' ? 29 : 44],13,[42,48,77]);
      this.band([0,120,0],[game.character === 'dub' ? 36 : 47, game.character === 'dub' ? 30 : 45],3,[255,219,113]);
      this.ellipsoid([0,115,-(game.character === 'dub' ? 31 : 47)],[7,7,3],[255,219,113]);
    }
    if (surfing) this.buildBoard();
    if (game.character && game.character !== 'dub') {
      this.buildCrew(game.character, stride, tuck, time, game.abilityRemaining > 0);
      this.buildSkinMarks([1.2,1.05,1.35], game.character === 'turtle' ? -14 : 0);
      const anchor = game.character === 'octo' ? [0,157,0] : game.character === 'shark' ? [0,159,15] : [0,153,12];
      this.buildHat(([x,y,z]) => [x+anchor[0],y+anchor[1],z+anchor[2]]);
      return;
    }

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
      this.ellipsoid(shoe, [13, 9, 21], spring ? [185, 218, 230] : palette.cream, tuck * -.7);
      this.ellipsoid([shoe[0], shoe[1] - 5, shoe[2]], [13.5, 3.7, 21.5], spring ? [100, 167, 193] : palette.sole, tuck * -.7);
      this.ellipsoid([shoe[0], shoe[1] + 1, shoe[2] - 16], [8, 4, 3], palette.green, tuck * -.7);
      if (spring && !surfing) this.boostOrigins.push(this.transform([shoe[0], shoe[1] - 9, shoe[2]]));
    }

    // The tail curls up behind him during a roll, instead of stretching flat.
    const tailBase = blend([0, 72, -16], [0, 102, -20], tuck);
    const tailTip = blend([stride * 5, 63, -49], [0, 123, -35], tuck);
    this.tube(tailBase, tailTip, 9, palette.fin);
    for (const side of [-1, 1]) {
      this.fin([tailTip, [tailTip[0] + side * 37, tailTip[1] + 10, tailTip[2] - 8], [tailTip[0] + side * 27, tailTip[1] - 7, tailTip[2] - 11], [tailTip[0] + side * 5, tailTip[1] - 5, tailTip[2] + 2]], 2.2, palette.fin);
    }
    this.ellipsoid([0, 110, 0], blend([34, 53, 28], [35, 34, 31], tuck), palette.skin);
    this.buildSkinMarks();
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
    if(this.style==='skin-orca') for(const side of [-1,1])this.ellipsoid(atHead([side*26,7,-13]),[10,10,9],[229,242,234],headPitch);
    if(this.style==='skin-koi')this.ellipsoid(atHead([-12,8,-24]),[13,14,6],[232,124,66],headPitch);
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
    this.buildHat(atHead, headPitch);
  }

  buildHat(atHead, headPitch = 0) {
    if (this.hat === 'hat-crown') {
      this.fin([[-30,28,-24],[-30,52,-24],[-15,38,-24],[0,60,-24],[15,38,-24],[30,52,-24],[30,28,-24]].map(atHead),3,[237,196,84]);
      for (const x of [-22,0,22]) this.ellipsoid(atHead([x,34,-28]),[3,4,2],[106,224,207]);
    } else if (this.hat === 'hat-visor') {
      this.ellipsoid(atHead([0,27,-3]),[39,5,33],[103,241,210],headPitch);
      this.fin([[-31,20,-30],[31,20,-30],[25,8,-34],[-25,8,-34]].map(atHead),2,[62,103,121]);
    } else if (this.hat === 'hat-sailor') {
      this.ellipsoid(atHead([0,34,0]),[38,12,31],[236,239,218],headPitch);
      this.ellipsoid(atHead([0,26,0]),[40,4,33],[51,77,105],headPitch);
    } else if (this.hat === 'hat-flower') {
      for(let i=0;i<5;i++) this.ellipsoid(atHead([-25+Math.cos(i*TAU/5)*8,28+Math.sin(i*TAU/5)*8,-29]),[6,6,2],[240,138,178],headPitch);
      this.ellipsoid(atHead([-25,28,-32]),[4,4,2],[253,221,123]);
    } else if (this.hat === 'hat-pirate') {
      this.fin([[-53,27,-18],[-38,58,-15],[0,39,-32],[38,58,-15],[53,27,-18],[0,24,-40]].map(atHead),5,[70,44,57]);
      this.fin([[-42,32,-24],[0,29,-44],[42,32,-24],[0,35,-43]].map(atHead),1,[234,192,109]);
      this.ellipsoid(atHead([0,39,-39]),[7,8,2],[243,233,208]);
      for(const side of [-1,1])this.ellipsoid(atHead([side*3,40,-42]),[1.8,2,1],[51,39,53]);
    } else if (this.hat === 'hat-antenna') {
      for(const side of [-1,1]) {
        this.fin([[side*13,36,0],[side*24,66,0],[side*27,65,0],[side*17,35,0]].map(atHead),2,[63,111,91]);
        this.ellipsoid(atHead([side*25,69,0]),[9,9,9],[161,255,167],headPitch);
      }
    } else if (this.hat === 'hat-mohawk') {
      for(let i=0;i<6;i++)this.fin([[-5,37,-25+i*9],[0,61+Math.sin(i/5*Math.PI)*15,-22+i*9],[5,37,-18+i*9]].map(atHead),4,[252,123,175]);
    } else if (this.hat === 'hat-halo') {
      for(let i=0;i<16;i++) {
        const a=i/16*TAU,b=(i+1)/16*TAU;
        this.face([[32*Math.cos(a),62,26*Math.sin(a)],[38*Math.cos(a),62,31*Math.sin(a)],[38*Math.cos(b),62,31*Math.sin(b)],[32*Math.cos(b),62,26*Math.sin(b)]].map(atHead),[255,220,118],true);
      }
    } else if (this.hat === 'hat-horns') {
      for(const side of [-1,1]) {
        this.ellipsoid(atHead([side*29,30,0]),[12,10,12],[191,97,74],headPitch);
        this.fin([[side*26,32,-5],[side*48,42,-4],[side*52,70,1],[side*40,57,5],[side*34,37,7]].map(atHead),5,[236,220,182]);
      }
    } else if (this.hat === 'hat-jelly') {
      this.ellipsoid(atHead([0,35,0]),[46,31,39],[185,148,224],headPitch,Math.PI/2);
      this.ellipsoid(atHead([0,36,0]),[47,4,40],[223,188,247],headPitch);
      for(const side of [-1,1])for(let i=0;i<2;i++)this.fin([[side*(36+i*8),35,-10],[side*(40+i*7),10,-14],[side*(34+i*9),-5,-13],[side*(37+i*9),-4,-13],[side*(44+i*7),10,-14],[side*(40+i*8),35,-10]].map(atHead),1.5,[216,173,239]);
    }
  }

  buildSkinMarks(scale = [1,1,1], offsetZ = 0) {
    const point = ([x,y,z]) => [x*scale[0], 110+(y-110)*scale[1], z*scale[2]+offsetZ];
    const spot = (p,size,...args) => this.ellipsoid(point(p),size.map((v,i)=>v*scale[i]),...args);
    const mark = (points,thickness,...args) => this.fin(points.map(point),thickness,...args);
    if(this.style==='skin-koi') {
      for(const [x,y,z,s] of [[-15,126,-23,12],[18,99,-22,9],[-9,81,-19,7]])spot([x,y,z],[s,s*1.4,4],[228,113,57]);
    } else if(this.style==='skin-orca') {
      for(const side of [-1,1])spot([side*25,113,-13],[10,27,15],[222,237,232]);
    } else if(this.style==='skin-cyber') {
      for(const side of [-1,1])mark([[side*17,83,-22],[side*20,119,-25],[side*12,143,-23],[side*8,140,-27],[side*15,117,-29],[side*12,83,-25]],1,[122,255,213]);
    } else if(this.style==='skin-ice') {
      for(const side of [-1,1])mark([[side*17,135,-19],[side*35,151,-8],[side*38,128,-16],[side*29,112,-26]],3,[218,252,255]);
    } else if(this.style==='skin-cosmic'||this.style==='skin-dragon') {
      for(let i=0;i<9;i++){
        const x=Math.sin(i*2.4)*22,y=86+i*6,z=-Math.sqrt(Math.max(0,1-(x/35)**2))*28;
        if(this.style==='skin-dragon')spot([x,y,z],[2,3,1.7],[73,53,80]);
        else mark([[x,y+4,z-1],[x+2,y+1,z-1],[x+4,y,z-1],[x,y-4,z-1],[x-2,y-1,z-1],[x-4,y,z-1]],.4,[255,222,149]);
      }
    }
  }

  crewLimb(a, b, radius, color) {
    const d = sub(b, a), length = Math.hypot(...d);
    if (!length) return;
    const n = d.map(v => v / length), ref = Math.abs(n[1]) > .9 ? [1, 0, 0] : [0, 1, 0];
    const u = [n[1]*ref[2]-n[2]*ref[1], n[2]*ref[0]-n[0]*ref[2], n[0]*ref[1]-n[1]*ref[0]];
    const ul = Math.hypot(...u); for (let i = 0; i < 3; i++) u[i] /= ul;
    const v = [n[1]*u[2]-n[2]*u[1], n[2]*u[0]-n[0]*u[2], n[0]*u[1]-n[1]*u[0]];
    const ring = (p, r) => Array.from({length: 6}, (_, i) => p.map((q,j) => q+r*(u[j]*Math.cos(i*TAU/6)+v[j]*Math.sin(i*TAU/6))));
    const first = ring(a, radius), last = ring(b, radius*.8);
    for (let i = 0; i < 6; i++) this.face([first[i], first[(i+1)%6], last[(i+1)%6], last[i]], color, true);
  }

  buildCrew(id, stride, tuck, time, active) {
    const cream = [245,232,199], dark = [36,58,65], gold = [246,191,96];
    const color = this.masteryColor || skinColors[this.style] || (id === 'octo' ? [175,119,210] : id === 'shark' ? [121,154,185] : [150,184,100]);
    const tinted = Boolean(this.masteryColor || skinColors[this.style]);
    const light = color.map(v=>Math.min(255,v+30)), fin = color.map(v=>v*.72);
    if (id === 'octo') {
      this.ellipsoid([0,127,0], [42,58,37], color);
      this.ellipsoid([0,147,-25], [30,25,12], tinted ? light : [204,161,229]);
      for (let arm = 0; arm < 8; arm++) {
        const angle = arm*TAU/8;
        let prev = [Math.cos(angle)*23, 87, Math.sin(angle)*23];
        for (let segment = 1; segment <= 4; segment++) {
          const r = 23 + segment*9*(1-tuck*.4), wave = Math.sin(time*5+arm+segment*.6)*8;
          const next = [Math.cos(angle)*r, 87-segment*17 + (segment===4 ? 9+wave : wave*.3), Math.sin(angle)*r+stride*9];
          this.crewLimb(prev,next,11-segment*1.7,color);
          this.ellipsoid([next[0],next[1]-3,next[2]-3],[3,2,3],[238,195,223]); prev=next;
        }
      }
      // Radio headset and a small antenna identify Inky from behind.
      this.band([0,143,0],[42,37],8,dark);
      for (const side of [-1,1]) this.ellipsoid([side*43,143,0],[9,17,14],gold);
      this.crewLimb([26,172,0],[32,201,0],2,dark);this.ellipsoid([32,202,0],[6,6,6],[153,255,215]);
    } else {
      for (const side of [-1,1]) {
        const foot = [side*25,12+Math.max(0,stride*side)*16,stride*side*18];
        this.crewLimb([side*21,75,0],foot,11,color);
        this.ellipsoid(foot,[17,10,23],cream);
        this.ellipsoid([side*25,foot[1]-5,foot[2]],[18,4,24],dark);
      }
      if (id === 'shark') {
        this.ellipsoid([0,112,0],[42,59,32],color);
        this.ellipsoid([0,159,15],[41,29,52],color);
        this.ellipsoid([0,145,36],[33,12,32],cream);
        this.fin([[0,149,-26],[0,171,-66],[0,103,-35]],5,tinted ? fin : [75,112,149]);
        this.crewLimb([0,79,-20],[0,61,-54],12,color);
        this.fin([[0,61,-49],[0,98,-73],[0,65,-62],[0,35,-72]],5,tinted ? fin : [75,112,149]);
        for (const side of [-1,1]) {
          this.fin([[side*30,137,0],[side*(active?78:63),86+stride*side*7,-5],[side*35,100,17]],4,color);
          for(let i=0;i<3;i++) this.crewLimb([side*39,153-i*6,1],[side*40,152-i*6,15],1.6,dark);
          this.ellipsoid([side*35,166,27],[4,5,5],dark);
        }
        this.band([0,105,0],[43,33],12,[201,85,81]);
      } else {
        this.ellipsoid([0,105,0],[45,50,29],color);
        this.ellipsoid([0,153,12],[28,27,30],color);
        this.ellipsoid([0,107,-20],[49,56,27],tinted ? fin : [69,107,73]);
        this.band([0,104,0],[48,42],7,gold);
        for (let i=0;i<7;i++) {
          const a=i*TAU/6, x=i===6?0:Math.cos(a)*28, y=i===6?107:107+Math.sin(a)*35;
          this.ellipsoid([x,y,-43],[i===6?19:14,i===6?23:18,6],active?[197,235,144]:tinted ? color : [114,151,86]);
        }
        for (const side of [-1,1]) {
          this.crewLimb([side*34,125,0],[side*53,86+stride*side*8,8],10,color);
          this.ellipsoid([side*22,158,27],[5,6,5],dark);
        }
        this.band([0,158,12],[29,30],6,[246,192,101]);
      }
    }
  }

  buildBoard() {
    const base = this.palette || globalPalette;
    const palette = this.boardColor ? { ...base, cream:rgb(this.boardColor),green:rgb(this.boardColor).map(v=>v*.5),gold:this.boardColor==='#536276'?[131,242,204]:[252,239,190] } : base;
    const pose = { pitch: this.pitch, centerY: this.centerY, lean: this.lean };
    this.pitch = 0;
    this.centerY = 0;
    this.lean *= .45;
    // The board shares the rider's diagonal direction, with raised ends and a cream deck.
    this.ellipsoid([0, 104, 0], [45, 6, 145], palette.green);
    this.ellipsoid([0, 109, 0], [42, 3.6, 141], palette.cream);
    this.ellipsoid([0, 112, 0], [7, .8, 139], palette.gold);
    if(this.boardId==='board-rocket') {
      for(const side of [-1,1]) {
        this.ellipsoid([side*44,103,-30],[13,13,79],[61,71,86]);
        this.ellipsoid([side*44,104,-100],[10,10,8],[255,187,99]);
        this.fin([[side*30,106,-80],[side*74,111,-111],[side*44,104,-22]],2,[225,116,83]);
        this.fin([[side*36,103,-108],[side*44,100,-143],[side*52,103,-108]],1,[255,211,127]);
      }
    } else if(this.boardId==='board-manta') {
      for(const side of [-1,1])this.fin([[side*20,108,72],[side*98,112,-25],[side*79,110,-72],[side*24,109,-40]],3,[100,143,218]);
      this.ellipsoid([0,114,90],[15,3,25],[133,242,238]);
    } else if(this.boardId==='board-skeleton') {
      for(let z=-90;z<=90;z+=25)this.ellipsoid([0,115,z],[36,1.5,4],[255,246,212]);
      this.ellipsoid([0,115,105],[19,2,22],[250,239,203]);
      for(const side of [-1,1])this.ellipsoid([side*7,118,108],[4,1,5],[72,68,73]);
    } else if(this.boardId==='board-prism') {
      const colors=[[255,160,180],[255,202,126],[174,235,189],[139,211,255],[191,166,249]];
      for(let i=0;i<5;i++)this.fin([[-30,114,-100+i*43],[0,120,-120+i*43],[30,114,-100+i*43],[0,118,-80+i*43]],1,colors[i]);
    }
    for (const side of [-1, 1]) {
      this.ellipsoid([side * 14, 112, 0], [3.8, .7, 131], palette.green);
    }
    this.fin([[-10, 100, 94], [10, 100, 94], [0, 82, 112]], 1.8, palette.fin);
    this.ellipsoid([0, 99, -84], [30, 2, 24], [165, 231, 200]);
    this.ellipsoid([0, 99, 84], [30, 2, 24], [165, 231, 200]);
    Object.assign(this, pose);
  }

  drawMesh(renderer, ghost) {
    const c = renderer.ctx;
    if (!ghost) {
      for (const face of this.faces) {
        // Matching hairline strokes close subpixel seams between mesh faces.
        renderer.poly(face.points, face.fill, face.fill, .35);
      }
      return;
    }
    // Composite once so overlapping triangles retain an even, see-through opacity.
    if (!this.ghostLayer) this.ghostLayer = renderer.canvas.ownerDocument.createElement('canvas');
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const face of this.faces) for (const point of face.points) {
      left = Math.min(left, point.x); top = Math.min(top, point.y);
      right = Math.max(right, point.x); bottom = Math.max(bottom, point.y);
    }
    left = Math.floor(left - 4); top = Math.floor(top - 4);
    const width = Math.ceil(right - left + 4), height = Math.ceil(bottom - top + 4);
    const resolution = Math.max(1, Math.min(2.5, c.getTransform().a));
    const layer = this.ghostLayer;
    const pixelWidth = Math.ceil(width * resolution), pixelHeight = Math.ceil(height * resolution);
    if (layer.width !== pixelWidth || layer.height !== pixelHeight) { layer.width = pixelWidth; layer.height = pixelHeight; }
    const lc = layer.getContext('2d');
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(0, 0, layer.width, layer.height);
    lc.setTransform(resolution, 0, 0, resolution, -left * resolution, -top * resolution);
    for (const face of this.faces) {
      lc.beginPath();
      face.points.forEach((point, i) => i ? lc.lineTo(point.x, point.y) : lc.moveTo(point.x, point.y));
      lc.closePath(); lc.fillStyle = face.fill; lc.fill(); lc.strokeStyle = face.fill; lc.lineWidth = .35; lc.stroke();
    }
    lc.globalCompositeOperation = 'source-atop'; lc.fillStyle = '#e1d3f42b'; lc.fillRect(left, top, width, height); lc.globalCompositeOperation = 'source-over';
    c.save(); c.globalAlpha = .56; c.shadowColor = '#e9dcff'; c.shadowBlur = 5;
    c.drawImage(layer, left, top, width, height);
    c.restore();
  }

  draw(renderer, game) {
    if (this.style !== renderer.style) {
      this.style = renderer.style;
      const skin = skinColors[renderer.style];
      this.palette = skin ? { ...globalPalette, skin, light: skin.map(v => Math.min(255, v + 28)), fin: skin.map(v => v * .72), green: skin.map(v => v * .55), gold: skin } : globalPalette;
      if(this.style==='skin-orca')this.palette.belly=[231,242,237];
      if(this.style==='skin-dragon')this.palette.fin=[157,219,112];
    }
    this.masteryColor = renderer.masteryCharacter === game.character && game.mode !== 'daily' ? MASTERY[game.character]?.color : null;
    this.lowDetail = renderer.effectiveQuality === 'low';
    this.hat = renderer.hat;
    this.boardColor = renderer.boardColor;
    this.boardId = renderer.boardId;
    const c = renderer.ctx, p = game.player;
    const ground = renderer.project(p.x * 1.82, 0, 0);
    const altitude = renderer.flightCamera ?? p.altitude ?? 0;
    const surfing = game.surfRemaining > 0 || altitude > .08;
    const unit = Math.min(renderer.height * .00155, renderer.width * (surfing ? .00170 : .00235)) * (renderer.portrait ? 2.2 : 1);
    const jumpY = (p.jump + altitude) * renderer.focal / 7.5;
    const shadowSize = 1 - Math.min((p.jump + altitude) * .16, .55);
    renderer.ellipse(ground.x, ground.y + 3, 43 * unit * shadowSize, 10 * unit * shadowSize, '#285b4e30');
    this.build(game, renderer.reducedMotion ? 0 : renderer.time, surfing);

    const centerY = ground.y - jumpY - (surfing ? 45 : p.sliding ? 45 : 100) * unit;
    if (game.abilityProtected || (game.powerups?.shield ?? 0) > 0 || game.shieldGrace > 0 || game.surfLandingGrace > 0 || game.dashRemaining > 0 || game.reviveGrace > 0) {
      const radius = (surfing ? 153 : p.sliding ? 68 : 122) * unit;
      const bubble = c.createRadialGradient(ground.x - radius * .25, centerY - radius * .25, radius * .1, ground.x, centerY, radius);
      bubble.addColorStop(0, '#b7fbe309'); bubble.addColorStop(.80, '#90f2e020'); bubble.addColorStop(1, '#b6ffe85a');
      renderer.ellipse(ground.x, centerY, radius * (surfing ? 1 : .7), radius * (surfing ? .65 : 1), bubble);
      c.beginPath(); c.ellipse(ground.x, centerY, radius * (surfing ? 1 : .7), radius * (surfing ? .65 : 1), 0, 0, TAU);
      c.strokeStyle = '#cdfce696'; c.lineWidth = 1.8; c.stroke();
    }
    if ((game.powerups?.magnet ?? 0) > 0 || game.character === 'dub' && game.abilityRemaining > 0) {
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
    for (const [x, y, z] of this.boostOrigins) {
      const sy = -y * .933 - z * .36;
      const glow = c.createRadialGradient(x, sy, 1, x, sy, 23);
      glow.addColorStop(0, '#acdfff6b'); glow.addColorStop(1, '#acdfff00');
      renderer.ellipse(x, sy + 2, 24, 9, glow);
      if (p.jump > 0 && !renderer.reducedMotion) {
        const rise = Math.min(p.jump, 1) * (11 + Math.sin(renderer.time * 13) * 2);
        renderer.line([{ x: x - 5, y: sy + 3 }, { x: x - 5, y: sy + rise }], '#c2eaff99', 2);
        renderer.line([{ x: x + 5, y: sy + 3 }, { x: x + 5, y: sy + rise * .7 }], '#c2eaff77', 2);
      }
    }
    this.drawMesh(renderer, (game.powerups?.ghost ?? 0) > 0 || game.ghostGrace > 0);
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
