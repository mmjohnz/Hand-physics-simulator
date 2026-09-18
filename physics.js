/* Fixed-step rigid bodies and articulated peel/hand constraints. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('matter-js'));
  else root.HandPhysics = factory(root.Matter);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  const { Engine, Bodies, Body, Composite, Constraint, Vertices, Query, Sleeping } = M;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rotate = (p, a) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
  const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const chains = [[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20]];
  const bananaLine = t => ({ x: -32 + 91 * Math.sin(t * 2.65), y: -142 + t * 269 });
  const innerBottle = [{x:-19,y:-133},{x:19,y:-133},{x:19,y:-98},{x:44,y:-73},{x:46,y:112},{x:35,y:122},{x:-35,y:122},{x:-46,y:112},{x:-44,y:-73},{x:-19,y:-98}];
  function world(body, point) {
    const offset = body.plugin.origin || {x:0,y:0};
    const r = rotate(sub(point, offset), body.angle);
    return { x: body.position.x + r.x, y: body.position.y + r.y };
  }
  function local(body, point) {
    const r = rotate(sub(point, body.position), -body.angle);
    const o = body.plugin.origin || {x:0,y:0};
    return { x:r.x + o.x, y:r.y + o.y };
  }
  function area(poly) {
    let sum = 0;
    for (let i=0;i<poly.length;i++) { const a=poly[i], b=poly[(i+1)%poly.length]; sum += a.x*b.y-b.x*a.y; }
    return Math.abs(sum)/2;
  }
  // Clip convex polygon to nx*x + ny*y <= limit.
  function clip(poly, nx, ny, limit) {
    const out=[];
    for(let i=0;i<poly.length;i++) {
      const a=poly[i],b=poly[(i+1)%poly.length], da=a.x*nx+a.y*ny-limit, db=b.x*nx+b.y*ny-limit;
      if(da<=0) out.push(a);
      if((da<0)!==(db<0)) { const t=da/(da-db); out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}); }
    }
    return out;
  }
  function liquid(body, amount) {
    const polygon=innerBottle.map(p=>world(body,p));
    let low=Math.min(...polygon.map(p=>p.y)), high=Math.max(...polygon.map(p=>p.y));
    const target=area(polygon)*.91*clamp(amount/500,0,1);
    for(let i=0;i<22;i++) { const mid=(low+high)/2; if(area(clip(polygon,0,-1,-mid))>target) low=mid; else high=mid; }
    const surface=(low+high)/2;
    return { polygon:clip(polygon,0,-1,-surface), surface, mouth:world(body,{x:0,y:-139}) };
  }

  class Simulation {
    constructor(onEvent=()=>{}) {
      this.onEvent=onEvent;
      this.engine=Engine.create({enableSleeping:true,positionIterations:8,velocityIterations:8,constraintIterations:6});
      this.engine.gravity.y=1;
      this.rigs=new Map(); this.grabs=new Map(); this.actors=[]; this.time=0;
      this.select('glass');
    }
    add(object) { Composite.add(this.engine.world,object); return object; }
    remove(object) { if(object) Composite.remove(this.engine.world,object,true); }
    bodyOptions(extra={}) { return {friction:.55,frictionStatic:.8,restitution:.16,frictionAir:.012,collisionFilter:{category:1,mask:15},...extra}; }
    select(item) {
      Composite.clear(this.engine.world,false); Engine.clear(this.engine);
      this.rigs.clear(); this.grabs.clear(); this.actors=[];
      this.item=item; this.shards=[]; this.drops=[]; this.splashes=[]; this.puddle=0; this.flash=0; this.shake=0;
      this.banana=null; this.bottle=null; this.pane=null;
      this.floor=700;
      this.add([
        Bodies.rectangle(600,1000,1350,600,{isStatic:true,collisionFilter:{category:2,mask:15}}),
        Bodies.rectangle(-24,350,48,900,{isStatic:true,collisionFilter:{category:2,mask:15}}),
        Bodies.rectangle(1224,350,48,900,{isStatic:true,collisionFilter:{category:2,mask:15}})
      ]);
      if(item==='glass') {
        this.pane={x:405,y:158,w:370,h:430,broken:false,impact:null};
        this.pane.body=this.add(Bodies.rectangle(590,373,370,430,{isStatic:true,collisionFilter:{category:1,mask:4}}));
      }
      if(item==='banana') this.makeBanana();
      if(item==='bottle') this.makeBottle();
    }
    compound(parts, position, extra={}) {
      const body=Body.create(this.bodyOptions({parts,...extra}));
      body.plugin.origin={...body.position};
      Body.setPosition(body,position);
      return this.add(body);
    }
    makeBanana() {
      const parts=[];
      for(let i=0;i<=10;i++) {const p=bananaLine(i/10); parts.push(Bodies.circle(p.x,p.y,15+12*Math.sin(Math.PI*i/10)));}
      const body=this.compound(parts,{x:585,y:545},{density:.00065});
      this.banana={body,strips:[],peeled:0};
      for(let s=0;s<3;s++) this.banana.strips.push({index:s,progress:0,detached:false,nodes:[],pins:[],links:[],active:false,tab:{x:-32+(s-1)*8,y:-156}});
    }
    makeBottle() {
      const body=this.compound([
        Bodies.rectangle(0,22,102,210,{chamfer:{radius:17}}),
        Bodies.trapezoid(0,-87,94,38,.5),Bodies.rectangle(0,-124,46,46)
      ],{x:585,y:565},{density:.0012,restitution:.13});
      this.bottle={body,dryMass:body.mass*.3,waterMass:body.mass*.7,open:false,cap:null,capProgress:0,amount:500,poured:0,flow:0,liquid:liquid(body,500),slosh:0};
    }
    startPeel(strip) {
      const main=this.banana.body, group=Body.nextGroup(true);
      for(let i=0;i<11;i++) {
        const t=1-i/10, p=bananaLine(t); p.x+=(strip.index-1)*14;
        const wp=world(main,p);
        const node=this.add(Bodies.circle(wp.x,wp.y,7,this.bodyOptions({density:.00015,frictionAir:.035,collisionFilter:{category:8,mask:3,group}})));
        strip.nodes.push(node);
        strip.pins.push(this.add(Constraint.create({bodyA:main,pointA:rotate(sub(p,main.plugin.origin),main.angle),bodyB:node,length:0,stiffness:.9,damping:.12})));
        if(i) strip.links.push(this.add(Constraint.create({bodyA:strip.nodes[i-1],bodyB:node,length:distance(wp,strip.nodes[i-1].position),stiffness:.88,damping:.12})));
      }
      // The tip can be pulled; glued nodes release one by one as pulling progresses.
      this.remove(strip.pins[10]); strip.pins[10]=null; strip.active=true;
    }
    gripPoint(actor) { return actor.pinching ? actor.point : actor.palm; }
    attach(actor,body,point,kind='body',strip=null) {
      const rotatedOffset=sub(point,body.position);
      const joint=this.add(Constraint.create({pointA:{...point},bodyB:body,pointB:rotatedOffset,length:0,stiffness:.2,damping:.22}));
      const candidate=actor.intentCandidates?.find(c=>c.kind===kind&&(!strip||c.key==='peel-'+strip.index));
      const feedback=candidate?{kind,features:[...candidate.features],reach:candidate.reach,pinch:candidate.pinch}:null;
      this.grabs.set(actor.id,{body,joint,goal:{...point},kind,strip,angleOffset:body.angle-actor.angle,previousAngle:actor.angle,pull:0,
        offset:sub(point,this.gripPoint(actor)),started:this.time,feedback,learned:false,
        peelOrigin:strip?local(this.banana.body,point):null,startProgress:strip?.progress||0});
      body.collisionFilter.mask &= ~4;
      Sleeping.set(body,false);
    }
    confirm(grab,success) {
      if(!grab||grab.learned||!grab.feedback)return;
      grab.learned=true;this.onLearn?.({...grab.feedback,success});
    }
    release(id,abandoned=false) {
      const g=this.grabs.get(id); if(!g)return;
      if(abandoned&&this.time-g.started>.4)this.confirm(g,false);
      if(g.joint) this.remove(g.joint);
      if(g.body) g.body.collisionFilter.mask |= 4;
      this.grabs.delete(id);
    }
    tryGrab(actor) {
      const p=this.gripPoint(actor);
      if(this.item==='banana') {
        const radius=actor.intent?.kind==='peel'?clamp(actor.intent.radius,46,72):46;
        const ordered=[...this.banana.strips].sort((a,b)=>{
          const pa=a.active?a.nodes[10].position:world(this.banana.body,a.tab),pb=b.active?b.nodes[10].position:world(this.banana.body,b.tab);
          return distance(p,pa)-distance(p,pb);
        });
        for(const strip of ordered) {
          if(strip.detached)continue;
          const tab=strip.active ? strip.nodes[10].position : world(this.banana.body,strip.tab);
          if(actor.pinching && distance(p,tab)<radius && ![...this.grabs.values()].some(g=>g.strip===strip)) {
            if(!strip.active)this.startPeel(strip);
            this.attach(actor,strip.nodes[10],{...strip.nodes[10].position},'peel',strip);
            this.onEvent('peel'); return;
          }
        }
        if(![...this.grabs.values()].some(g=>g.kind==='body'&&g.body===this.banana.body)&&
          (distance(p,this.banana.body.position)<125 || Query.point([this.banana.body],p).length)) this.attach(actor,this.banana.body,p);
      }
      if(this.item==='bottle') {
        const b=this.bottle, mouth=world(b.body,{x:0,y:-148});
        const radius=actor.intent?.kind==='cap'?clamp(actor.intent.radius,40,65):40;
        if(!b.open && actor.pinching && distance(p,mouth)<radius && ![...this.grabs.values()].some(g=>g.kind==='cap')) {
          const candidate=actor.intentCandidates?.find(c=>c.kind==='cap');
          this.grabs.set(actor.id,{kind:'cap',body:b.body,previousAngle:actor.angle,angleOffset:actor.angle-b.body.angle,started:this.time,learned:false,
            feedback:candidate?{kind:'cap',features:[...candidate.features],reach:candidate.reach,pinch:candidate.pinch}:null});
          return;
        }
        if(b.cap && distance(p,b.cap.position)<34) {this.attach(actor,b.cap,p,'looseCap');return;}
        if(![...this.grabs.values()].some(g=>g.kind==='body'&&g.body===b.body)&&
          (Query.point([b.body],p).length || distance(p,b.body.position)<85)) this.attach(actor,b.body,p);
      }
      if(this.item==='glass' && this.pane.broken) {
        const hit=Query.point(this.shards.map(s=>s.body),p)[0];
        if(hit) this.attach(actor,hit,p,'shard');
      }
    }
    setActors(actors) {
      this.actors=actors.slice(0,2);
      const ids=new Set(this.actors.map(a=>a.id));
      for(const id of this.grabs.keys())if(!ids.has(id))this.release(id);
      for(const [id,rig] of this.rigs) if(!ids.has(id)) {this.remove(rig.composite);this.rigs.delete(id);}
      for(const actor of this.actors) {
        if(actor.uiActive){
          this.release(actor.id);const rig=this.rigs.get(actor.id);if(rig){this.remove(rig.composite);this.rigs.delete(actor.id);}continue;
        }
        if(actor.points) this.updateRig(actor);
        const holding=actor.pinching||actor.gripping;
        if(!holding)this.release(actor.id,true);
        else if(!this.grabs.has(actor.id))this.tryGrab(actor);
        const g=this.grabs.get(actor.id);
        if(g?.kind==='cap') {
          const b=this.bottle;
          const relative=actor.angle-b.body.angle;
          const twist=angleDelta(relative,g.angleOffset);
          // Real movement, never elapsed time, advances the screw thread.
          b.capProgress=clamp(b.capProgress+Math.max(0,twist)/1.6,0,1);
          g.angleOffset=relative;
          if(b.capProgress>=1) this.openCap(actor);
        } else if(g?.joint) {const p=this.gripPoint(actor);g.goal={x:p.x+g.offset.x,y:p.y+g.offset.y};}
        if(this.item==='glass'&&!this.pane.broken&&actor.fist&&(Math.hypot(actor.velocity.x,actor.velocity.y)>330||actor.approachSpeed>330)) {
          const box=this.pane, p=actor.palm, prev=actor.previousPalm||p;
          const swept=Query.ray([box.body],prev,p,32).length;
          if(swept || (p.x>box.x-20&&p.x<box.x+box.w+20&&p.y>box.y-20&&p.y<box.y+box.h+20)) this.breakGlass(p,actor.velocity);
        }
      }
    }
    updateRig(actor) {
      let rig=this.rigs.get(actor.id);
      if(!rig) {
        const composite=Composite.create(), nodes=[], targets=[];
        const width=distance(actor.points[5],actor.points[17]);
        for(let i=0;i<21;i++) {
          const p=actor.points[i],r=clamp(width*(i===0?.14:.075),4,11);
          const node=Bodies.circle(p.x,p.y,r,{density:.00035,friction:.25,collisionFilter:{category:4,mask:3}});
          const target=Constraint.create({pointA:{x:p.x,y:p.y},bodyB:node,length:0,stiffness:.68,damping:.18});
          nodes.push(node);targets.push(target);Composite.add(composite,[node,target]);
        }
        const links=[];
        for(const chain of chains) for(let i=1;i<chain.length;i++) {
          const a=chain[i-1],b=chain[i];
          const joint=Constraint.create({bodyA:nodes[a],bodyB:nodes[b],length:distance(nodes[a].position,nodes[b].position),stiffness:.65});
          links.push({joint,a,b});Composite.add(composite,joint);
        }
        this.add(composite);rig={composite,nodes,targets,links};this.rigs.set(actor.id,rig);
      }
      actor.points.forEach((p,i)=>{rig.targets[i].pointA={x:p.x,y:p.y}; Sleeping.set(rig.nodes[i],false);});
      for(const link of rig.links)link.joint.length=distance(actor.points[link.a],actor.points[link.b]);
    }
    openCap(actor) {
      const b=this.bottle; if(b.open)return;
      b.open=true;
      const pos=world(b.body,{x:0,y:-157});
      b.cap=this.add(Bodies.rectangle(pos.x,pos.y,51,24,this.bodyOptions({angle:b.body.angle,density:.00025,chamfer:{radius:4}})));
      this.confirm(this.grabs.get(actor.id),true);this.release(actor.id);this.attach(actor,b.cap,pos,'looseCap');this.onEvent('cap');
    }
    breakGlass(point,velocity={x:450,y:0}) {
      const pane=this.pane; if(!pane||pane.broken)return;
      pane.broken=true;this.remove(pane.body);pane.impact={x:clamp(point.x,pane.x,pane.x+pane.w),y:clamp(point.y,pane.y,pane.y+pane.h)};
      const impact=pane.impact;
      const seeds=[];
      for(let i=0;i<68;i++) seeds.push({x:pane.x+Math.random()*pane.w,y:pane.y+Math.random()*pane.h});
      for(let i=0;i<18;i++){const a=Math.random()*Math.PI*2,r=Math.random()*65;seeds.push({x:clamp(impact.x+Math.cos(a)*r,pane.x+1,pane.x+pane.w-1),y:clamp(impact.y+Math.sin(a)*r,pane.y+1,pane.y+pane.h-1)});}
      for(const seed of seeds) {
        let poly=[{x:pane.x,y:pane.y},{x:pane.x+pane.w,y:pane.y},{x:pane.x+pane.w,y:pane.y+pane.h},{x:pane.x,y:pane.y+pane.h}];
        for(const other of seeds) {
          if(seed===other)continue;
          poly=clip(poly,other.x-seed.x,other.y-seed.y,(other.x**2+other.y**2-seed.x**2-seed.y**2)/2);
          if(poly.length<3)break;
        }
        if(poly.length<3||area(poly)<5)continue;
        const c=Vertices.centre(poly), dist=distance(c,impact);
        const body=Bodies.fromVertices(c.x,c.y,[poly],this.bodyOptions({density:.0008,friction:.35,restitution:.28,frictionAir:.003}),false,.01,1);
        // Create dynamic first so Matter retains finite mass/inertia when unfreezing.
        Body.setStatic(body,true);
        this.add(body);
        const norm=Math.max(10,dist), strength=4+8*Math.exp(-dist/130);
        this.shards.push({body,releaseAt:this.time+.035+dist/2300,velocity:{x:(c.x-impact.x)/norm*strength+velocity.x*.002,y:(c.y-impact.y)/norm*strength-2+velocity.y*.001},spin:(Math.random()-.5)*.22,shade:Math.random(),released:false});
      }
      this.flash=.7;this.shake=9;this.onEvent('glass');
    }
    updatePeels() {
      const b=this.banana;if(!b)return;
      for(const g of this.grabs.values()) if(g.kind==='peel'&&!g.strip.detached) {
        const strip=g.strip, start=world(b.body,g.peelOrigin), pull=distance(g.joint.pointA,start);
        strip.progress=Math.max(strip.progress,clamp(g.startProgress+(pull-12)/180,0,1));
        if(strip.progress-g.startProgress>.12)this.confirm(g,true);
        const released=1+Math.floor(strip.progress*9);
        for(let i=10;i>=11-released;i--)if(strip.pins[i]){this.remove(strip.pins[i]);strip.pins[i]=null;}
        if(strip.progress>=1) {
          strip.detached=true;b.peeled++;
          for(const pin of strip.pins)this.remove(pin);strip.pins=[];
          this.onEvent('tear');
        }
      }
    }
    step(dt=1/60) {
      this.time+=dt;
      for(const g of this.grabs.values()) if(g.joint) {
        // Bound a hand target jump after a dropped camera frame to avoid explosive joint energy.
        const delta=sub(g.goal,g.joint.pointA), length=Math.hypot(delta.x,delta.y),fraction=Math.min(1,900*dt/Math.max(1,length));
        g.joint.pointA.x+=delta.x*fraction;g.joint.pointA.y+=delta.y*fraction;
      }
      for(const actor of this.actors) {
        const g=this.grabs.get(actor.id);
        if(g?.kind==='body') {
          if(this.time-g.started>.65)this.confirm(g,true);
          const target=actor.angle+g.angleOffset;
          const turn=clamp(angleDelta(target,g.body.angle)*.22-g.body.angularVelocity*.25,-.18,.18);
          Body.setAngularVelocity(g.body,g.body.angularVelocity+turn*.45);
        }
      }
      this.updatePeels();
      for(const shard of this.shards) if(!shard.released&&this.time>=shard.releaseAt) {
        shard.released=true;Body.setStatic(shard.body,false);Body.setVelocity(shard.body,shard.velocity);Body.setAngularVelocity(shard.body,shard.spin);
      }
      // Small substeps stabilize impacts and the articulated peel strands.
      Engine.update(this.engine,dt*500);
      Engine.update(this.engine,dt*500);
      this.flash=Math.max(0,this.flash-dt*4);this.shake*=Math.exp(-dt*13);
      if(this.bottle) this.updateWater(dt);
      this.updateDrops(dt);
    }
    updateWater(dt) {
      const b=this.bottle;
      b.liquid=liquid(b.body,b.amount);
      b.slosh+=(clamp(-b.body.velocity.x*.015,-.12,.12)-b.slosh)*.05;
      const down=-Math.cos(b.body.angle), head=b.liquid.mouth.y-b.liquid.surface;
      b.flow=b.open&&down>.08&&head>0&&b.amount>0 ? Math.min(b.amount/dt,clamp(18+Math.sqrt(head)*8,0,135)*down) : 0;
      const poured=b.flow*dt;
      b.amount=Math.max(0,b.amount-poured);b.poured+=poured;
      if(!b.body.isStatic&&poured>0)Body.setMass(b.body,b.dryMass+b.waterMass*b.amount/500);
      if(poured>0) {
        const mouth=b.liquid.mouth, axis=rotate({x:0,y:-1},b.body.angle);
        for(let i=0;i<2;i++) this.drops.push({x:mouth.x+(Math.random()-.5)*7,y:mouth.y,vx:axis.x*90+b.body.velocity.x*25+(Math.random()-.5)*18,vy:axis.y*90+b.body.velocity.y*25,r:2+Math.random()*2.5,amount:poured/2});
        if(Math.floor(this.time*4)!==Math.floor((this.time-dt)*4))this.onEvent('water');
      }
    }
    updateDrops(dt) {
      this.drops=this.drops.filter(d=>{
        d.vy+=980*dt;d.x+=d.vx*dt;d.y+=d.vy*dt;
        if(d.y>=this.floor) {
          this.puddle+=d.amount;
          for(let i=0;i<2;i++)this.splashes.push({x:d.x,y:this.floor-1,vx:(Math.random()-.5)*180,vy:-Math.random()*160,life:.4});
          return false;
        }
        return d.x>-150&&d.x<1350;
      });
      this.splashes=this.splashes.filter(d=>{d.vy+=980*dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.life-=dt;return d.life>0&&d.y<this.floor+2;});
    }
    status() {
      if(this.item==='glass')return this.pane.broken ? `${this.shards.length} physical shards` : 'Mounted glass pane · strike with a moving fist';
      if(this.item==='banana')return `${this.banana.peeled} / 3 peel strips removed`;
      return `${Math.round(this.bottle.amount)} / 500 ml · ${this.bottle.open ? 'cap removed' : `cap ${Math.round(this.bottle.capProgress*100)}% unscrewed`}`;
    }
  }
  return {Simulation,world,local,liquid,clip,area,bananaLine,innerBottle,chains,clamp,distance,angleDelta,rotate};
});
