const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('matter-js');
const P=require('../physics.js');
const actor=(id,p,extra={})=>({id,palm:p,point:p,pinching:true,gripping:false,fist:false,angle:0,velocity:{x:0,y:0},...extra});
const advance=(s,n=60)=>{for(let i=0;i<n;i++)s.step(1/60);};

test('gentle contact leaves glass intact; impact creates polygon shards which fall and collide',()=>{
  const s=new P.Simulation(),p={x:590,y:373};
  s.setActors([actor('a',p,{pinching:false,fist:true,velocity:{x:120,y:0}})]);
  assert.equal(s.pane.broken,false);
  s.setActors([actor('a',p,{pinching:false,fist:true,velocity:{x:750,y:0}})]);
  assert.equal(s.pane.broken,true);assert.ok(s.shards.length>60);
  const covered=s.shards.reduce((a,v)=>a+P.area(v.body.vertices),0);
  assert.ok(Math.abs(covered-s.pane.w*s.pane.h)<s.pane.w*s.pane.h*.02);
  advance(s,360);
  assert.ok(s.shards.every(v=>v.released));
  assert.ok(s.shards.every(v=>Number.isFinite(v.body.position.x)&&v.body.bounds.max.y<708));
  assert.ok(s.shards.some(v=>v.body.position.y>650));
});

test('cap requires twisting; lifting an open upright bottle cannot pour',()=>{
  const s=new P.Simulation();s.select('bottle');const b=s.bottle;
  M.Body.setStatic(b.body,true);
  const cap=P.world(b.body,{x:0,y:-148});
  for(let i=0;i<60;i++){s.setActors([actor('cap',cap)]);s.step();}
  assert.equal(b.capProgress,0);assert.equal(b.open,false);
  for(let i=0;i<10;i++)s.setActors([actor('cap',cap,{angle:i*.23})]);
  assert.equal(b.open,true);assert.ok(b.cap);
  s.setActors([]);M.Body.setPosition(b.body,{x:600,y:220});advance(s,120);
  assert.equal(b.amount,500);assert.equal(b.flow,0);
});

test('a forward fist strike uses hand approach speed, not only sideways motion',()=>{
  const s=new P.Simulation();
  s.setActors([actor('forward',{x:590,y:373},{pinching:false,fist:true,approachSpeed:550})]);
  assert.equal(s.pane.broken,true);assert.ok(s.shards.length>60);
});

test('inversion drains finite water; closed cap blocks flow; volume is conserved',()=>{
  const s=new P.Simulation();s.select('bottle');const b=s.bottle;
  M.Body.setStatic(b.body,true);M.Body.setPosition(b.body,{x:600,y:240});M.Body.setAngle(b.body,Math.PI);
  advance(s,60);assert.equal(b.amount,500);
  b.open=true;advance(s,120);assert.ok(b.amount<400&&b.amount>0);assert.ok(b.flow>0);
  assert.ok(Math.abs(b.amount+b.poured-500)<1e-6);
  M.Body.setAngle(b.body,0);const before=b.amount;advance(s,60);assert.equal(b.amount,before);
  M.Body.setAngle(b.body,Math.PI);advance(s,1800);assert.ok(b.amount<.05);assert.ok(b.amount>=0);
  assert.ok(Math.abs(b.amount+b.poured-500)<1e-6);
});

test('rotated fluid polygon preserves volume and a horizontal surface',()=>{
  const s=new P.Simulation();s.select('bottle');const b=s.bottle.body;
  const total=P.area(P.innerBottle);
  for(const angle of [0,.6,1.6,2.4,Math.PI,4.3]) {
    M.Body.setAngle(b,angle);const fluid=P.liquid(b,215);
    assert.ok(Math.abs(P.area(fluid.polygon)-total*.91*215/500)<.02);
    assert.ok(fluid.polygon.every(p=>p.y>=fluid.surface-.001));
  }
});

test('banana strips require pulling and detach independently, then fall as articulated chains',()=>{
  const s=new P.Simulation();s.select('banana');const b=s.banana;
  M.Body.setStatic(b.body,true);
  const first=b.strips[0],tab=P.world(b.body,first.tab);
  s.setActors([actor('peel',tab)]);advance(s,60);
  assert.equal(first.progress,0);assert.equal(b.peeled,0);
  const pulled={x:tab.x-145,y:tab.y+330};
  s.setActors([actor('peel',pulled)]);advance(s,90);
  assert.equal(first.detached,true);assert.equal(b.peeled,1);
  assert.equal(b.strips[1].progress,0);assert.equal(b.strips[2].progress,0);
  assert.equal(first.links.length,10);assert.equal(first.pins.length,0);
  s.setActors([]);advance(s,240);
  assert.ok(first.nodes.every(n=>Number.isFinite(n.position.x)&&n.position.y<710));
  for(let i=1;i<first.nodes.length;i++)assert.ok(P.distance(first.nodes[i-1].position,first.nodes[i].position)<70);
  for(const strip of b.strips.slice(1)) {
    const tip=P.world(b.body,strip.tab);
    s.setActors([actor('next',tip)]);
    s.setActors([actor('next',{x:tip.x+200,y:tip.y+300})]);advance(s,90);
    assert.equal(strip.detached,true);s.setActors([]);
  }
  assert.equal(b.peeled,3);
});

test('wrist rotation controls a held bottle and tracking loss releases the grab',()=>{
  const s=new P.Simulation();s.select('bottle');const b=s.bottle.body;
  M.Body.setPosition(b,{x:600,y:360});const p={...b.position};
  s.setActors([actor('hold',p)]);assert.equal(s.grabs.size,1);
  for(let i=0;i<90;i++){s.setActors([actor('hold',p,{angle:Math.PI*i/90})]);s.step();}
  assert.ok(Math.abs(P.angleDelta(b.angle,Math.PI))<.4);
  s.setActors([]);assert.equal(s.grabs.size,0);const start=b.position.y;advance(s,40);assert.ok(b.position.y>start);
});
