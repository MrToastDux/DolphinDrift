const TAU = Math.PI * 2;

export function drawAdventureObject(r, object) {
  const c = r.ctx, x = object.lane * 1.82, z = object.z;
  if (object.type === 'rescue') {
    const p = r.project(x, 1.05, z), size = p.scale*.44;
    r.ellipse(p.x,p.y,size*1.6,size*1.6,'#b6ffd82b');
    c.strokeStyle='#b8ffcf';c.lineWidth=Math.max(2,size*.28);c.beginPath();c.arc(p.x,p.y,size,0,TAU);c.stroke();
    r.ellipse(p.x,p.y,size*.48,size*.6,'#f5dc91');
    r.ellipse(p.x-size*.17,p.y-size*.1,size*.07,size*.09,'#274849');
    r.ellipse(p.x+size*.17,p.y-size*.1,size*.07,size*.09,'#274849');
    if(p.scale>16){c.fillStyle='#e5ffdb';c.font=`bold ${Math.max(9,p.scale*.16)}px system-ui`;c.textAlign='center';c.fillText('RESCUE',p.x,p.y-size*1.5);}
    return true;
  }
  if (object.type !== 'enemy') return false;
  const color = object.hit>0 ? '#fff3cc' : object.kind==='sentry' ? '#dd91c2' : object.kind==='brute' ? '#edab71' : '#80d3d0';
  const p = r.project(x,object.kind==='drone' ? 1.05 : .85,z), s=p.scale;
  const floor=r.project(x,.03,z);r.ellipse(floor.x,floor.y,s*.5,s*.12,'#203c4940');
  if (object.kind === 'drone') {
    for (const side of [-1,1]) {
      r.line([r.project(x,.95,z),r.project(x+side*.6,1.1,z)],'#364d61',Math.max(2,s*.09));
      r.ellipse(p.x+side*s*.57,p.y-s*.07,s*.26,s*.08,'#e2f7e4');
    }
    r.ellipse(p.x,p.y,s*.34,s*.24,'#2a4456');r.ellipse(p.x,p.y,s*.21,s*.13,color);
  } else {
    r.box(x,z,.85,1.2,.7,['#354d60',color,'#23374b']);
    if(object.kind==='brute') for(const side of [-1,1]) r.box(x+side*.52,z,.25,.85,.55,[color,'#f6d4a0','#66475a']);
    else r.box(x,z-.35,.23,.85,.6,['#233a50',color,'#54717a'],.55);
    r.ellipse(p.x,p.y-s*.13,s*.23,s*.09,color);
  }
  for(let i=0;i<object.maxHP;i++) {
    c.fillStyle=i<object.hp?color:'#304452';c.fillRect(p.x+(i-object.maxHP/2)*s*.17,p.y-s*.7,s*.13,Math.max(2,s*.055));
  }
  if(object.aim>0 && !object.fired) {
    const target=r.project(object.targetX*1.82,object.targetY,0);
    c.save();c.setLineDash([4,7]);r.line([p,target],'#ffc2d780',1.2);c.setLineDash([]);
    c.strokeStyle='#ffb5cf';c.lineWidth=2;c.beginPath();c.arc(target.x,target.y,18-object.aim*5,0,TAU);c.stroke();c.restore();
  }
  return true;
}

export function drawAdventureEffects(r, game) {
  const c=r.ctx, from=r.project(game.player.x*1.82,game.playerHeight,0);
  c.save();
  for(const shot of game.sonicShots || []) {
    const t=1-shot.life/shot.max;
    const origin=r.project(shot.from*1.82,game.playerHeight,0);
    const targets=shot.targets.length?shot.targets:[{lane:shot.from,z:90}];
    for(const target of targets) {
      const to=r.project(target.lane*1.82,1,target.z);
      const x=origin.x+(to.x-origin.x)*t,y=origin.y+(to.y-origin.y)*t;
      r.line([{x:x+(origin.x-to.x)*.15,y:y+(origin.y-to.y)*.15},{x,y}],shot.color,4);
      r.ellipse(x,y,8*(1-t)+2,8*(1-t)+2,shot.color);
    }
  }
  for(const bolt of game.enemyBolts || []) {
    const t=Math.min(1,bolt.age/bolt.travel), origin=r.project(bolt.fromLane*1.82,1,bolt.fromZ);
    const target=r.project(bolt.targetX*1.82,bolt.targetY,0);
    const x=origin.x+(target.x-origin.x)*t*t,y=origin.y+(target.y-origin.y)*t*t;
    r.line([{x:x-(target.x-origin.x)*.09,y:y-(target.y-origin.y)*.09},{x,y}],'#ffafcf',4);
    r.ellipse(x,y,4+7*t,4+7*t,'#ffd4ea');
    c.strokeStyle='#ffafcf';c.lineWidth=2;c.beginPath();c.arc(target.x,target.y,15,-Math.PI/2,-Math.PI/2+TAU*(1-t));c.stroke();
  }
  if(game.grapple) {
    const target=r.project(game.grapple.lane*1.82,1,game.grapple.z);
    r.line([from,{x:(from.x+target.x)/2+25,y:(from.y+target.y)/2},target],'#ddb4ff',5);
  }
  if(game.blastRemaining>0) {
    const t=1-game.blastRemaining/.65;
    c.globalAlpha=1-t;c.strokeStyle='#bffff0';c.lineWidth=r.reducedMotion?3:8;
    c.beginPath();c.ellipse(from.x,from.y,(r.reducedMotion?80:40+t*r.width),30+t*100,0,0,TAU);c.stroke();
  }
  c.restore();
}
