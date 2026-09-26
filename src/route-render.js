import { forkAt, routeAt } from './routes.js';

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t*t*(3-2*t); };
const FAR = 210;

// Use fixed world positions, not wrapping screen-relative props. Selected routes
// can be seen approaching and remain visible until their last surface is passed.
export function visibleRoutes(game) {
  if (game.mode === 'story') return [];
  const routes = [];
  for (let index = Math.floor(Math.max(0, game.distance - 24) / 750); index <= Math.floor((game.distance + FAR) / 750); index++) {
    if (!game.routeChoices?.get(index)) continue;
    const route = forkAt(index);
    if (route.start < game.distance + FAR && route.end > game.distance - 8) routes.push(route);
  }
  return routes;
}

export function routeEntries(game, routes = visibleRoutes(game)) {
  const entries = [];
  if (game.mode !== 'story') {
    const fork = forkAt(Math.floor(game.distance / 750)), z = fork.decision - game.distance;
    if (z > 0 && z < FAR) entries.push({ kind:'route', route:fork, z, absolute:fork.decision, part:'fork' });
  }
  for (const route of routes) {
    const spacing = route.id === 'reef' ? 24 : 22;
    for (let absolute = route.start; absolute < route.end; absolute += spacing) {
      const z = absolute-game.distance, length = Math.min(spacing-3, route.end-absolute);
      if (z >= FAR || z+length < -2) continue;
      // Each side is one depth-sorted object; do not paint a distant container
      // over a nearer one when the camera crosses a modulo wrap.
      if (route.id === 'reef') {
        if (z > 0) entries.push({ kind:'route', route, z, absolute, part:'arch' });
      } else for (const side of [-1,1]) entries.push({ kind:'route', route, z:Math.max(-2,z), originalZ:z, absolute, length:length+Math.min(0,z+2), side, part:'building' });
    }
    for (const absolute of [route.start,route.end]) {
      const z=absolute-game.distance;
      if(z>0 && z<FAR)entries.push({kind:'route',route,z,absolute,part:'sign',exit:absolute===route.end});
    }
  }
  return entries;
}

export function drawRouteAtmosphere(r, game) {
  const route = routeAt(game);
  if (route?.id !== 'reef') return;
  const strength = smooth((game.distance-route.start)/18)*smooth((route.end-game.distance)/18);
  if (!strength) return;
  const c=r.ctx;c.save();c.globalAlpha=strength;
  const water=c.createLinearGradient(0,0,0,r.height);
  water.addColorStop(0,'#073e5def');water.addColorStop(.55,'#196f8d99');water.addColorStop(1,'#248a9b22');
  c.fillStyle=water;c.fillRect(0,0,r.width,r.height);
  // Decorative bubbles stay outside the playable lanes, behind world objects.
  for(let i=0;i<(r.reducedMotion?0:12);i++) {
    const side=i%2?1:-1,x=r.width*(side<0?.06+.018*(i%5):.94-.018*(i%5));
    const y=((i*73-game.distance*1.5)%r.height+r.height)%r.height;
    c.strokeStyle='#b4fff46a';c.lineWidth=1;c.beginPath();c.arc(x,y,3+i%5,0,Math.PI*2);c.stroke();
  }
  c.restore();
}

export function drawRouteSurface(r, game, routes) {
  if (game.mode !== 'story') {
    const fork = forkAt(Math.floor(game.distance / 750));
    const start = Math.max(-4, fork.approach-game.distance), end = Math.min(FAR, fork.decision-game.distance);
    if (end > start) {
      r.quad(-2.9,-.94,start,end,.018,fork.color+'35');
      r.quad(-.88,2.9,start,end,.018,'#e9f3c520');
      for (const x of [-2.9,-.94,2.9]) r.quad(x-.025,x+.025,start,end,.025,fork.color);
      // Road arrows stay anchored in the world, including during pause.
      for (let absolute=fork.approach+8;absolute<fork.decision;absolute+=14) {
        const z=absolute-game.distance;
        if(z<2||z>FAR-4)continue;
        for(const x of [-1.82,.91])r.poly([
          r.project(x-.38,.04,z),r.project(x,.04,z+4),r.project(x+.38,.04,z),r.project(x,.04,z+1.2),
        ],x<0?fork.color:'#ecf6cf');
      }
    }
  }
  for(const route of routes) {
    const start=Math.max(-4,route.start-game.distance),end=Math.min(FAR,route.end-game.distance);
    if(end<=start)continue;
    const fill=route.id==='reef'?'#3e8d99':route.id==='roof'?'#b89279':'#596981';
    r.quad(-2.95,2.95,start,end,.006,fill);
    for(const x of [-2.94,2.94])r.quad(x-.025,x+.025,start,end,.02,route.color);
    for(const x of [-.91,.91])r.quad(x-.014,x+.014,start,end,.025,'#e4f6e899');
    // Planks/roof tiles are anchored to the route so they never slide or reset.
    for(let absolute=route.start;absolute<route.end;absolute+=8) {
      const z=absolute-game.distance;if(z<start||z>=end)continue;
      r.quad(-2.9,2.9,z,Math.min(z+.08,end),.012,'#e0f4ed40');
    }
  }
}

export function drawRouteEntry(r, entry) {
  const {route,z,part}=entry,c=r.ctx;
  c.save();c.globalAlpha=smooth((FAR-z)/25)*(part==='building'?1:smooth(z/3));
  if(part==='fork') {
    // A neon gateway marks the actual commitment line; its supports stay
    // outside the playable lanes and both sign panels sit above flight height.
    const frame=[r.project(-3.25,0,z),r.project(-3.25,6.6,z),r.project(3.25,6.6,z),r.project(3.25,0,z)];
    const scale=frame[0].scale;
    r.line(frame,'#183f50',Math.max(3,scale*.22));
    r.line(frame,route.color,Math.max(1,scale*.055));
    const sign=r.project(0,6,z),size=Math.min(18,Math.max(7,scale*.24));
    c.font=`800 ${size}px system-ui`;c.textAlign='center';
    const width=Math.max((c.measureText(route.name.toUpperCase()).width+24)*2,scale*6.2);
    r.rect(sign.x-width/2,sign.y-size,width,size*3,5,'#123342');
    r.line([{x:sign.x,y:sign.y-size*.7},{x:sign.x,y:sign.y+size*1.6}],route.color,1);
    for(const [side,label,detail,color] of [
      [-1,route.name.toUpperCase(),`LEFT · +${route.reward} RECORDS`,route.color],
      [1,'MAIN ROAD','CENTRE / RIGHT','#eaf4c8'],
    ]) {
      const p={x:sign.x+side*width*.25,y:sign.y};
      c.font=`800 ${size}px system-ui`;c.textAlign='center';
      c.fillStyle=color;c.fillText(label,p.x,p.y);
      c.font=`600 ${size*.65}px system-ui`;c.fillText(detail,p.x,p.y+size*1.1);
    }
    for(const side of [-1,1])for(let y=.5;y<5.5;y+=.9) {
      r.line([r.project(side*3.25,y,z),r.project(side*3.25,y+.35,z)],'#f5ffdc',Math.max(1,scale*.075));
    }
  } else if(part==='arch') {
    const points=[];
    // An actual world-space arch, tall enough to clear the runner and flight.
    for(let i=0;i<=24;i++) {
      const angle=Math.PI-i*Math.PI/24;
      points.push(r.project(Math.cos(angle)*3.5,1.2+Math.sin(angle)*6,z));
    }
    r.line([r.project(-3.5,0,z),...points,r.project(3.5,0,z)],'#205267',Math.max(2,points[0].scale*.12));
    r.line(points,'#91efe0',Math.max(1,points[0].scale*.035));
  } else if(part==='building') {
    // The road is painted before scenery. Mask its footprint so below-ground
    // walls and long side faces cannot paint back over the running surface.
    const road=[r.project(-3,0,-4),r.project(3,0,-4),r.project(3,0,FAR),r.project(-3,0,FAR)];
    c.beginPath();c.rect(0,0,r.width,r.height);
    c.moveTo(road[0].x,road[0].y);
    for(const point of road.slice(1))c.lineTo(point.x,point.y);
    c.closePath();c.clip('evenodd');
    const x=entry.side*5.25,length=Math.max(.01,entry.length);
    if(route.id==='roof') {
      // Roof decks sit at track height; walls descend below the running surface.
      drawSideBox(r,entry,x,4.1,5,length,['#986f68','#d8af8b','#765567'],-5);
      drawSideBox(r,entry,x,4.2,.12,length,['#d9b998','#f0d0aa','#b18a77'],-.12);
      r.line([r.project(entry.side*3.2,.45,z),r.project(entry.side*3.2,.45,z+length)],route.color,Math.max(1,r.focal/(z+7.5)*.025));
    } else {
      drawSideBox(r,entry,x,3.5,2.5,length,['#857fa6','#b0a5ce','#55576f']);
      // Ribbing belongs to the container, not its clipped near edge.
      for(let rib=entry.originalZ+2;rib<z+length;rib+=4) {
        if(rib<z)continue;
        r.line([r.project(x-entry.side*1.76,.15,rib),r.project(x-entry.side*1.76,2.35,rib)],'#c1c0d2',Math.max(1,r.focal/(rib+7.5)*.02));
      }
    }
  } else if(part==='sign') {
    // Signs stand off the track rather than covering incoming hazards.
    const p=r.project(-3.7,2.4,z),scale=p.scale;
    r.line([r.project(-3.7,0,z),p],route.color,Math.max(2,scale*.07));
    const label=entry.exit?'MAIN ROAD':route.name.toUpperCase();
    const size=Math.min(17,Math.max(7,scale*.19));c.font=`700 ${size}px system-ui`;c.textAlign='center';
    const width=c.measureText(label).width+14;
    r.rect(p.x-width/2,p.y-size-5,width,size+12,4,'#173e4a');
    c.fillStyle=route.color;c.fillText(label,p.x,p.y+1);
  }
  c.restore();
}

// These long buildings sit beside the camera. Drawing both side faces (as the
// small obstacle box helper does) lets the hidden outer wall cover the roof and
// the track-facing wall. Only draw faces facing the camera, and never invent a
// front cap where the near plane clipped a building already being passed.
function drawSideBox(r, entry, x, width, height, length, colors, base=0) {
  const {z,side}=entry, far=z+length, top=base+height;
  const left=x-width/2,right=x+width/2,inner=side<0?right:left;
  const p=(x,y,z)=>r.project(x,y,z);
  if(r.cameraHeight>top) r.poly([p(left,top,z),p(right,top,z),p(right,top,far),p(left,top,far)],colors[1]);
  r.poly([p(inner,base,z),p(inner,top,z),p(inner,top,far),p(inner,base,far)],colors[2]);
  if(entry.originalZ>=-2) r.poly([p(left,base,z),p(right,base,z),p(right,top,z),p(left,top,z)],colors[0]);
}
