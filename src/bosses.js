import { DolphinRig } from './dolphin.js';
const TAU = Math.PI * 2;
const metal = [38, 57, 72], ivory = [255, 239, 186];
const colors = [[225, 119, 63], [186, 65, 119], [46, 131, 151]];
const lights = [[255, 192, 91], [255, 147, 206], [119, 255, 225]];

// Real XYZ joints, perspective projection and lit, depth-sorted mesh faces.
// Shares the dolphin's mesh primitives; no sprites or GPU requirement.
export class BossRig extends DolphinRig {
  transform([x, y, z]) {
    if (!this.rotation || this.rotation.yaw !== this.yaw || this.rotation.pitch !== this.pitch) {
      this.rotation = { yaw: this.yaw, pitch: this.pitch, cy: Math.cos(this.yaw), sy: Math.sin(this.yaw), cp: Math.cos(this.pitch), sp: Math.sin(this.pitch) };
    }
    const {cy,sy,cp,sp}=this.rotation;
    [x,z]=[x*cy+z*sy,z*cy-x*sy];
    [y,z]=[y*cp-z*sp,y*sp+z*cp];
    return [x,y,z];
  }
  face(vertices, color, twoSided=false, transformed=false) {
    const points=transformed?vertices:vertices.map(p=>this.transform(p));
    const p=points[0],a=points[1],b=points[2];
    const ax=a[0]-p[0],ay=a[1]-p[1],az=a[2]-p[2],bx=b[0]-p[0],by=b[1]-p[1],bz=b[2]-p[2];
    const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
    const length=Math.hypot(nx,ny,nz);
    if(length<.001) return;
    const facing=nx*-p[0]+ny*-p[1]+nz*(-850-p[2]);
    if(!twoSided && facing<=0) return;
    const light=Math.max(0,(nx*-.42+ny*.65-nz*.63)/length*(facing<0?-1:1));
    const brightness=.46+light*.66+Math.pow(light,18)*.22;
    this.faces.push({points:points.map(([x,y,z])=>({x:x*850/(850+z),y:-y*850/(850+z)})),
      depth:points.reduce((sum,p)=>sum+p[2],0)/points.length,
      fill:`rgb(${color.map(v=>Math.min(255,Math.round(v*brightness))).join(',')})`});
  }
  // Cylinders between arbitrary joints, including sideways crab legs.
  link(a,b,radius,color,endRadius=radius*.72) {
    const delta=b.map((v,i)=>v-a[i]),length=Math.hypot(...delta);
    if(length<.001)return;
    const d=delta.map(v=>v/length),ref=Math.abs(d[1])>.9?[1,0,0]:[0,1,0];
    let u=[d[1]*ref[2]-d[2]*ref[1],d[2]*ref[0]-d[0]*ref[2],d[0]*ref[1]-d[1]*ref[0]];
    const size=Math.hypot(...u);u=u.map(v=>v/size);
    const v=[d[1]*u[2]-d[2]*u[1],d[2]*u[0]-d[0]*u[2],d[0]*u[1]-d[1]*u[0]];
    const segments=this.lowDetail?5:8;
    const ring=(p,r)=>Array.from({length:segments},(_,i)=>this.transform(p.map((n,j)=>n+r*(u[j]*Math.cos(i*TAU/segments)+v[j]*Math.sin(i*TAU/segments)))));
    const front=ring(a,radius),back=ring(b,endRadius);
    for(let i=0;i<segments;i++)this.face([front[i],front[(i+1)%segments],back[(i+1)%segments],back[i]],color,true,true);
    this.face(back,color,true,true);
  }
  gem(center,size,color) {
    // Tiny reactor lights and tentacle nodes need eight faces, not a sphere's
    // dozens of nearly subpixel faces. Transform each shared vertex once.
    const vertex=(x,y,z)=>this.transform([center[0]+x*size[0],center[1]+y*size[1],center[2]+z*size[2]]);
    const top=vertex(0,1,0),bottom=vertex(0,-1,0);
    const ring=[vertex(1,0,0),vertex(0,0,1),vertex(-1,0,0),vertex(0,0,-1)];
    for(let i=0;i<4;i++) {
      this.face([top,ring[i],ring[(i+1)%4]],color,true,true);
      this.face([bottom,ring[(i+1)%4],ring[i]],color,true,true);
    }
  }
  build(stage,time,windup=0,hp=3,defeated=0,final=false) {
    this.faces.length=0;this.yaw=Math.sin(time*.7)*.24;this.pitch=-.16+Math.sin(time*1.1)*.055+defeated*.5;
    const armor=final?[122,78,158]:colors[stage],glow=final?[255,208,107]:lights[stage],orb=(p,s,c)=>Math.max(...s)<=8?this.gem(p,s,c):this.ellipsoid(p,s,c);
    if(stage===0) {
      for(const side of [-1,1]) {
        for(let i=0;i<3;i++) {
          const hip=[side*65,-8,20+i*19],knee=[side*(126+i*17),-10+Math.sin(time*3+i)*9,35-i*24],foot=[side*(164+i*14),-75,-15-i*19];
          this.link(hip,knee,11,armor);this.link(knee,foot,8,metal,3);orb(knee,[12,12,12],glow);
        }
        const elbow=[side*133,8+windup*24,-25],claw=[side*186,38+windup*36,-42];
        this.link([side*69,2,-7],elbow,19,metal);this.link(elbow,claw,21,armor);
        orb(elbow,[22,22,22],glow);orb(claw,[34,30,26],armor);
        for(const jaw of [-1,1]) {
          const open=14+windup*23;
          this.fin([[side*177,claw[1]+7,-65],[side*(190+jaw*open),claw[1]+47,-69],
            [side*(187+jaw*(open+10)),claw[1]+80,-52],[side*185,claw[1]+65,-48],
            [side*(181+jaw*8),claw[1]+29,-37]],10,jaw===1?armor:glow);
        }
        this.link([side*36,38,-20],[side*48,76,-26],7,metal);
        orb([side*48,78,-28],[20,13,14],metal);orb([side*48,79,-40],[12,6,5],ivory);
      }
      orb([0,0,12],[94,53,65],metal);orb([0,24,16],[91,43,58],armor);
      for(let i=0;i<hp;i++) {
        const x=(i-1)*43;
        this.fin([[x-21,34,-45],[x-18,57,-18],[x+18,57,-18],[x+21,34,-45],[x,17,-55]],8,glow);
      }
      for(const s of [-1,1])for(let i=0;i<3;i++)orb([s*(52+i*10),-6,-42],[3,13,4],glow);
    } else if(stage===1) {
      for(const side of [-1,1]) {
        const lift=Math.sin(time*2)*22+windup*27;
        const edge=[[side*26,24,9],[side*114,35,33],[side*274,63+lift,64],
          [side*247,-4+lift,-4],[side*140,-29,-51],[side*47,-27,-25]];
        this.fin(edge,12,armor);
        // Raised wing spars create distinct sloping surfaces under the light.
        const ridge=[side*143,18+lift*.25,-58];
        for(let i=0;i<edge.length;i++) {
          const front=p=>[p[0],p[1],p[2]-14];
          this.face([front(edge[i]),ridge,front(edge[(i+1)%edge.length])],i%2?armor:glow,true);
        }
        this.link([side*65,12,-49],ridge,3,ivory,2);
        this.link([side*83,-19,-13],[side*147,-16,-35],10,metal);
        orb([side*132,-25,-28],[22,22,38],metal);orb([side*132,-25,-62],[14,14,7],glow);
        if(hp>1)this.fin([[side*126,-4,-38],[side*141,2,-43],[side*147,-32,-54],[side*119,-32,-54]],4,armor);
      }
      this.link([0,-13,38],[0,-27,124],12,metal,5);
      this.link([0,-27,124],[Math.sin(time*2)*23,-3,192],5,glow,1);
      orb([0,3,0],[54,41,82],armor);this.fin([[-16,28,12],[0,99,61],[16,28,12]],8,glow);
      orb([0,19,-51],[34,20,31],metal);orb([0,24,-75],[26,7,9],ivory);
      if(hp===3)this.fin([[-40,11,-49],[0,5,-77],[40,11,-49],[24,-12,-66],[-24,-12,-66]],5,glow);
    } else {
      for(let arm=0;arm<8;arm++) {
        const angle=arm/8*TAU,side=Math.cos(angle);
        let previous=[side*40,-23,Math.sin(angle)*29];
        const joints=this.lowDetail?5:7;
        for(let j=1;j<=joints;j++) {
          const t=j/joints,joint=[side*(45+t*174),-35-Math.sin(t*Math.PI)*65+t*t*(92+windup*45)+Math.sin(time*2+arm+t*4)*14,
            Math.sin(angle)*(35+t*80)-t*24];
          this.link(previous,joint,16*(1-t)+3,j%2?armor:metal,13*(1-t)+2);
          if(j<joints)orb([joint[0],joint[1]-5,joint[2]-9],[5,5,4],glow);previous=joint;
        }
      }
      orb([0,29,12],[67,88,58],armor);
      for(let i=0;i<hp;i++) {
        const x=(i-1)*34;
        this.fin([[x-20,36,-44],[x-16,84,-22],[x,115,8],[x+16,84,-22],[x+20,36,-44]],7,[69,158,171]);
      }
      for(const side of [-1,1]) {
        orb([side*30,16,-42],[24,15,13],metal);
        this.fin([[side*9,24,-58],[side*52,34,-50],[side*40,12,-60],[side*17,10,-59]],2,glow);
      }
    }
    const coreY=stage===1?-20:-19,coreZ=stage===1?-77:-58;
    orb([0,coreY,coreZ],[29,29,11],metal);orb([0,coreY,coreZ-9],[22,22,8],glow);orb([0,coreY,coreZ-15],[12,12,6],ivory);
    for(let i=0;i<3;i++) {
      const a=time*.9+i*TAU/3;orb([Math.cos(a)*34,coreY+Math.sin(a)*34,coreZ-7],[4,4,5],glow);
    }
    if (final) {
      for (let i=-2;i<=2;i++) {
        this.fin([[i*23-12,80,-8],[i*25,128-Math.abs(i)*8,-4],[i*23+12,80,-8]],5,glow);
        this.gem([i*25,128-Math.abs(i)*8,-4],[6,8,6],ivory);
      }
      for(const side of [-1,1]) this.link([side*70,20,-10],[side*128,61,-20],12,armor);
    }
    this.faces.sort((a,b)=>b.depth-a.depth);return this.faces;
  }
}

export function drawBoss(renderer,game) {
  const stage=game.tour,boss=game.boss;
  if(!stage || game.distance<stage.bossStart-70 || game.distance>=stage.end)return;
  const retreat=boss?.defeated?Math.max(0,1-boss.defeatTime/1.5):1;
  if(!retreat || (renderer.reducedMotion && boss?.defeated))return;
  const c=renderer.ctx,time=renderer.reducedMotion?0:renderer.time;
  const windup=boss?.aiming?Math.min(1,boss.aimTime/(boss.phase===2?.65:.9)):0;
  const approach=Math.min(1,Math.max(0,(game.distance-stage.bossStart+70)/70));
  const size=Math.min(renderer.width*.86,600,renderer.height*.79)/580*(.55+approach*.45)*retreat;
  const center=renderer.width/2,y=renderer.height*.36+(renderer.reducedMotion?0:Math.sin(time*1.8)*5);
  const rig=renderer.bossRig ||= new BossRig();rig.lowDetail=renderer.effectiveQuality==='low';
  const armorPlates=boss?Math.ceil(boss.hp/boss.maxHP*3):3;
  // One bounded raster cache; projectiles and player movement still draw every frame.
  const tick=Math.floor(time*(rig.lowDetail?20:30));
  const key=`${stage.index}:${Boolean(stage.final)}:${tick}:${armorPlates}:${rig.lowDetail}:${renderer.dpr}:${Boolean(boss?.defeated)}:${Boolean(boss?.aiming)}`;
  if(renderer.bossMeshKey!==key) {
    const faces=rig.build(stage.index,time,windup,armorPlates,boss?.defeated?boss.defeatTime:0,stage.final);
    const surface=renderer.bossSurface ||= document.createElement('canvas');
    const density=rig.lowDetail?1:Math.min(1.5,renderer.dpr);
    if(surface.width!==640*density || surface.height!==420*density){surface.width=640*density;surface.height=420*density;}
    const mesh=surface.getContext('2d');mesh.setTransform(density,0,0,density,320*density,210*density);mesh.clearRect(-320,-210,640,420);
    for(const face of faces){mesh.beginPath();for(let i=0;i<face.points.length;i++){const p=face.points[i];if(i)mesh.lineTo(p.x,p.y);else mesh.moveTo(p.x,p.y);}mesh.closePath();mesh.fillStyle=face.fill;mesh.fill();}
    renderer.bossMeshKey=key;
  }
  c.save();
  const halo=c.createRadialGradient(center,y,5,center,y,Math.max(1,260*size));
  halo.addColorStop(0,stage.color+'38');halo.addColorStop(1,stage.color+'00');
  c.fillStyle=halo;c.fillRect(center-300*size,y-240*size,600*size,480*size);
  renderer.ellipse(center,y+118*size,180*size,17*size,'#102c3945');
  c.translate(center,y);c.scale(size,size);
  if(!renderer.reducedMotion && boss?.hit>0)c.translate(Math.sin(boss.hit*38)*boss.hit*8,-boss.hit*12);
  c.drawImage(renderer.bossSurface,-320,-210,640,420);
  if(!renderer.reducedMotion && (boss?.hit>0 || boss?.defeated)) {
    const t=boss.defeated?boss.defeatTime:1-boss.hit/.65;
    c.globalAlpha=Math.max(0,1-t/1.5);c.strokeStyle=stage.color;c.lineWidth=3;
    c.beginPath();c.arc(0,0,35+t*160,0,TAU);c.stroke();
    for(let i=0;i<10;i++) {
      const a=i*TAU/10,r=80+t*160;c.save();c.translate(Math.cos(a)*r,Math.sin(a)*r);c.rotate(a+t*3);
      c.fillStyle=i%2?stage.color:'#fff5ce';c.fillRect(-5,-3,10,6);c.restore();
    }
  }
  c.restore();
  if(boss?.shot>0) {
    const from=renderer.project((boss.shotLane||0)*1.82,1.3+(game.player.altitude||0),0);
    const t=1-boss.shot/.4,px=from.x+(center-from.x)*t,py=from.y+(y-from.y)*t;
    c.save();c.strokeStyle=stage.color;c.lineWidth=4;c.lineCap='round';
    c.beginPath();c.moveTo(px+(from.x-center)*.15,py+(from.y-y)*.15);c.lineTo(px,py);c.stroke();
    renderer.ellipse(px,py,12,12,stage.color+'66');renderer.ellipse(px,py,5,5,'#fffbe2');
    c.beginPath();c.ellipse(px,py,16,7,-Math.atan2(center-from.x,y-from.y),0,TAU);c.stroke();c.restore();
  }
}
