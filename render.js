(function () {
  'use strict';
  const P=window.HandPhysics;
  const {world,bananaLine,clamp,distance}=P;
  const path=(ctx,points,close=true)=>{
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(close)ctx.closePath();
  };
  function transformed(ctx,body,draw) {
    ctx.save();ctx.translate(body.position.x,body.position.y);ctx.rotate(body.angle);
    const o=body.plugin.origin||{x:0,y:0};ctx.translate(-o.x,-o.y);draw();ctx.restore();
  }
  function rounded(ctx,x,y,w,h,r) {ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function ribbon(ctx,points,width,color) {
    if(points.length<2)return;
    const left=[],right=[];
    points.forEach((p,i)=>{
      const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
      const len=Math.max(.001,distance(a,b)),nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len;
      const w=typeof width==='function'?width(i/(points.length-1)):width;
      left.push({x:p.x+nx*w/2,y:p.y+ny*w/2});right.push({x:p.x-nx*w/2,y:p.y-ny*w/2});
    });
    path(ctx,[...left,...right.reverse()]);ctx.fillStyle=color;ctx.fill();
  }
  function shadow(ctx,body,radius) {
    const height=700-body.position.y;
    ctx.save();ctx.fillStyle=`rgba(0,0,0,${clamp(.25-height*.0002,.04,.22)})`;
    ctx.filter='blur(9px)';ctx.beginPath();ctx.ellipse(body.position.x,704,radius+height*.08,5+height*.012,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function glassMaterial(ctx,vertices,shade=.5) {
    const xs=vertices.map(p=>p.x),ys=vertices.map(p=>p.y);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const grad=ctx.createLinearGradient(minX,minY,maxX,maxY);
    grad.addColorStop(0,`rgba(175,224,233,${.12+shade*.1})`);grad.addColorStop(.38,'rgba(220,246,248,.025)');grad.addColorStop(.5,'rgba(248,255,255,.25)');grad.addColorStop(.54,'rgba(154,205,219,.045)');grad.addColorStop(1,'rgba(82,139,153,.12)');
    path(ctx,vertices);ctx.fillStyle=grad;ctx.fill();ctx.strokeStyle='rgba(181,224,224,.63)';ctx.lineWidth=1.05;ctx.stroke();
    ctx.save();ctx.translate(1.7,1.8);path(ctx,vertices);ctx.strokeStyle='rgba(14,55,58,.85)';ctx.lineWidth=1;ctx.stroke();ctx.restore();
  }
  function drawGlass(ctx,sim) {
    const g=sim.pane;
    if(!g.broken) {
      const points=[{x:g.x,y:g.y},{x:g.x+g.w,y:g.y},{x:g.x+g.w,y:g.y+g.h},{x:g.x,y:g.y+g.h}];
      glassMaterial(ctx,points,.55);
      ctx.save();path(ctx,points);ctx.clip();
      ctx.strokeStyle='rgba(239,254,255,.11)';ctx.lineWidth=26;ctx.beginPath();ctx.moveTo(g.x-80,g.y+g.h);ctx.lineTo(g.x+190,g.y-50);ctx.stroke();
      ctx.lineWidth=4;ctx.strokeStyle='rgba(239,254,255,.24)';ctx.beginPath();ctx.moveTo(g.x+125,g.y+g.h+50);ctx.lineTo(g.x+405,g.y-20);ctx.stroke();
      ctx.restore();
    }
    for(const s of sim.shards)glassMaterial(ctx,s.body.vertices,s.shade);
    // Two metal clips explain why the intact pane is held upright.
    for(const x of [g.x+32,g.x+g.w-32]) {
      const grad=ctx.createLinearGradient(x-8,0,x+8,0);grad.addColorStop(0,'#33444c');grad.addColorStop(.48,'#bfccd0');grad.addColorStop(.65,'#788b92');grad.addColorStop(1,'#27363f');
      ctx.fillStyle=grad;rounded(ctx,x-9,g.y+g.h-13,18,115,3);ctx.fill();rounded(ctx,x-35,694,70,8,3);ctx.fill();
      ctx.fillStyle='#15232a';ctx.beginPath();ctx.arc(x,g.y+g.h+9,2.5,0,Math.PI*2);ctx.fill();
    }
  }
  function bananaSamples(start=0,end=1,offset=0) {
    return Array.from({length:36},(_,i)=>{const p=bananaLine(start+(end-start)*i/35);return {x:p.x+offset,y:p.y};});
  }
  function bananaWidth(t) { return 13+39*Math.pow(Math.sin(Math.PI*t),.6); }
  function bananaFrame(t) {
    const p=bananaLine(t),a=bananaLine(Math.max(0,t-.012)),b=bananaLine(Math.min(1,t+.012)),len=Math.max(.001,distance(a,b));
    return {p,nx:-(b.y-a.y)/len,ny:(b.x-a.x)/len};
  }
  function biteMark(ctx,mark) {
    const frame=bananaFrame(mark.t),width=bananaWidth(mark.t),side=mark.side,edge={x:frame.p.x+frame.nx*width*.48*side,y:frame.p.y+frame.ny*width*.48*side};
    const center={x:edge.x+frame.nx*width*.3*side,y:edge.y+frame.ny*width*.3*side},radius=width*.68;
    ctx.beginPath();ctx.arc(center.x,center.y,radius,0,Math.PI*2);ctx.fill();
    return {center,radius};
  }
  function drawBanana(ctx,sim) {
    const b=sim.banana;if(b.eaten)return;shadow(ctx,b.body,85);
    transformed(ctx,b.body,()=>{
      const flesh=ctx.createLinearGradient(-30,0,94,0);
      flesh.addColorStop(0,'#bdb284');flesh.addColorStop(.28,'#f7edc7');flesh.addColorStop(.6,'#fffae0');flesh.addColorStop(1,'#c6b78d');
      ribbon(ctx,bananaSamples(),bananaWidth,flesh);
      for(let s=0;s<3;s++) {
        const strip=b.strips[s]; if(strip.detached)continue;
        const start=strip.progress;
        const gradient=ctx.createLinearGradient(-45,0,100,0);
        gradient.addColorStop(0,'#74782b');gradient.addColorStop(.3,'#c9b847');gradient.addColorStop(.58,'#eed45b');gradient.addColorStop(.76,'#e2c545');gradient.addColorStop(1,'#987421');
        const pts=bananaSamples(start,1,(s-1)*13);
        ribbon(ctx,pts,t=>bananaWidth(start+(1-start)*t)*.43,gradient);
        ctx.strokeStyle='rgba(133,110,32,.28)';ctx.lineWidth=.8;path(ctx,pts,false);ctx.stroke();
      }
      if(b.strips.some(s=>!s.active)) {
        const stem=ctx.createLinearGradient(-43,0,-22,0);stem.addColorStop(0,'#5a6135');stem.addColorStop(.45,'#aaa664');stem.addColorStop(1,'#6c743d');
        ctx.fillStyle=stem;ctx.beginPath();ctx.moveTo(-42,-127);ctx.quadraticCurveTo(-42,-145,-40,-163);ctx.lineTo(-26,-166);ctx.quadraticCurveTo(-25,-145,-24,-128);ctx.closePath();ctx.fill();
        ctx.fillStyle='#574e30';ctx.beginPath();ctx.ellipse(-33,-164,7.5,2.4,-.15,0,Math.PI*2);ctx.fill();
      }
      // Stable freckles, not frame-random noise.
      for(let i=0;i<65;i++) {
        const t=((i*47)%67)/67,strip=b.strips[i%3];if(t<strip.progress)continue;
        const p=bananaLine(t),off=Math.sin(i*9.4)*bananaWidth(t)*.28;
        ctx.fillStyle=`rgba(86,66,20,${.12+(i%3)*.08})`;ctx.beginPath();ctx.ellipse(p.x+off,p.y,.7+(i%3)*.35,.6+(i%2)*.6,.4,0,Math.PI*2);ctx.fill();
      }
      const end=bananaLine(1);ctx.fillStyle='#695a2f';ctx.beginPath();ctx.ellipse(end.x,end.y,7,4,-.5,0,Math.PI*2);ctx.fill();
      if(b.biteMarks?.length){
        ctx.save();ctx.globalCompositeOperation='destination-out';
        for(const mark of b.biteMarks)biteMark(ctx,mark);
        ctx.restore();
        ctx.save();ctx.strokeStyle='rgba(255,239,184,.9)';ctx.lineWidth=2;
        for(const mark of b.biteMarks){const frame=bananaFrame(mark.t),width=bananaWidth(mark.t),side=mark.side,edge={x:frame.p.x+frame.nx*width*.48*side,y:frame.p.y+frame.ny*width*.48*side};ctx.beginPath();ctx.arc(edge.x,edge.y,width*.36,0,Math.PI*2);ctx.stroke();}
        ctx.restore();
      }
    });
    for(const strip of b.strips) {
      if(!strip.active)continue;
      const first=strip.detached?0:Math.max(0,10-Math.ceil(strip.progress*10)-1);
      const points=strip.nodes.slice(first).map(n=>n.position);
      if(points.length<2)continue;
      ribbon(ctx,points,15,'#a68c35');
      ribbon(ctx,points.map(p=>({x:p.x-1.2,y:p.y-.8})),11,'#e9d377');
      ctx.strokeStyle='rgba(119,89,37,.45)';ctx.lineWidth=.7;path(ctx,points,false);ctx.stroke();
    }
  }
  function bottlePath(ctx) {
    ctx.beginPath();ctx.moveTo(-22,-139);ctx.lineTo(22,-139);ctx.lineTo(22,-99);
    ctx.bezierCurveTo(23,-88,50,-84,51,-65);ctx.lineTo(51,107);ctx.quadraticCurveTo(51,129,30,132);
    ctx.lineTo(-30,132);ctx.quadraticCurveTo(-51,129,-51,107);ctx.lineTo(-51,-65);ctx.bezierCurveTo(-50,-84,-23,-88,-22,-99);ctx.closePath();
  }
  function cap(ctx,progress=0) {
    ctx.save();ctx.rotate(progress*.55);
    const grad=ctx.createLinearGradient(-27,0,27,0);grad.addColorStop(0,'#163c58');grad.addColorStop(.3,'#789ba9');grad.addColorStop(.6,'#b7c9ce');grad.addColorStop(1,'#2d5469');
    ctx.fillStyle=grad;ctx.strokeStyle='#163346';ctx.lineWidth=1;rounded(ctx,-26,-12,52,25,4);ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(12,40,59,.48)';ctx.lineWidth=1;for(let i=-22;i<24;i+=4){ctx.beginPath();ctx.moveTo(i,-8);ctx.lineTo(i,9);ctx.stroke();}ctx.restore();
  }
  function drawBottle(ctx,sim) {
    const b=sim.bottle;shadow(ctx,b.body,61);
    transformed(ctx,b.body,()=>{
      const tint=ctx.createLinearGradient(-51,0,51,0);tint.addColorStop(0,'rgba(185,216,224,.24)');tint.addColorStop(.2,'rgba(206,231,239,.075)');tint.addColorStop(.68,'rgba(195,224,232,.04)');tint.addColorStop(1,'rgba(159,194,208,.22)');
      bottlePath(ctx);ctx.fillStyle=tint;ctx.fill();
    });
    const fluid=b.liquid;
    if(b.amount>.01&&fluid.polygon.length>2) {
      ctx.save();path(ctx,fluid.polygon);ctx.clip();
      const water=ctx.createLinearGradient(0,fluid.surface,0,fluid.surface+220);water.addColorStop(0,'rgba(137,202,227,.4)');water.addColorStop(.45,'rgba(75,143,181,.31)');water.addColorStop(1,'rgba(26,90,132,.6)');
      ctx.fillStyle=water;ctx.fillRect(0,0,1200,760);
      ctx.strokeStyle='rgba(200,239,250,.72)';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(0,fluid.surface);ctx.lineTo(1200,fluid.surface);ctx.stroke();ctx.restore();
    }
    transformed(ctx,b.body,()=>{
      bottlePath(ctx);ctx.strokeStyle='rgba(179,219,231,.7)';ctx.lineWidth=1.5;ctx.stroke();
      ctx.save();bottlePath(ctx);ctx.clip();
      ctx.strokeStyle='rgba(230,249,255,.32)';ctx.lineWidth=1;
      for(let y=-51;y<=108;y+=24) {
        ctx.beginPath();ctx.moveTo(-48,y);ctx.bezierCurveTo(-18,y+6,18,y+6,48,y);ctx.stroke();
        ctx.strokeStyle='rgba(13,42,54,.35)';ctx.beginPath();ctx.moveTo(-48,y+3);ctx.bezierCurveTo(-18,y+9,18,y+9,48,y+3);ctx.stroke();ctx.strokeStyle='rgba(230,249,255,.32)';
      }
      ctx.strokeStyle='rgba(240,254,255,.54)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-32,-67);ctx.bezierCurveTo(-38,-25,-38,78,-32,113);ctx.stroke();
      ctx.strokeStyle='rgba(212,239,246,.13)';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(33,-54);ctx.lineTo(33,111);ctx.stroke();ctx.restore();
      ctx.strokeStyle='rgba(216,243,249,.67)';ctx.lineWidth=1;
      for(let y=-138;y<-112;y+=5){ctx.beginPath();ctx.moveTo(-24,y);ctx.lineTo(24,y-1);ctx.stroke();}
      ctx.fillStyle='rgba(180,222,237,.34)';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText('500 mL',0,64);
      if(!b.open){ctx.save();ctx.translate(0,-149-b.capProgress*10);cap(ctx,b.capProgress);ctx.restore();}
    });
    if(b.cap)transformed(ctx,b.cap,()=>cap(ctx));
  }

  function segment(ctx,a,b,r1,r2) {
    const d=distance(a,b);if(d<.1)return;
    const nx=-(b.y-a.y)/d,ny=(b.x-a.x)/d;
    const grad=ctx.createLinearGradient(a.x-nx*r1,a.y-ny*r1,a.x+nx*r1,a.y+ny*r1);
    grad.addColorStop(0,'#ae8270');grad.addColorStop(.2,'#cba18b');grad.addColorStop(.48,'#ddbaa3');grad.addColorStop(.75,'#d2ab94');grad.addColorStop(1,'#b78c77');
    ctx.fillStyle=grad;
    ctx.beginPath();ctx.moveTo(a.x+nx*r1,a.y+ny*r1);ctx.lineTo(b.x+nx*r2,b.y+ny*r2);
    ctx.quadraticCurveTo(b.x+(b.x-a.x)/d*r2,b.y+(b.y-a.y)/d*r2,b.x-nx*r2,b.y-ny*r2);
    ctx.lineTo(a.x-nx*r1,a.y-ny*r1);ctx.quadraticCurveTo(a.x-(b.x-a.x)/d*r1,a.y-(b.y-a.y)/d*r1,a.x+nx*r1,a.y+ny*r1);ctx.fill();
  }
  function drawDigit(ctx,points,width,thumb){
    const side=[],other=[],factor=thumb?1.12:1;
    points.forEach((p,i)=>{
      const a=points[Math.max(0,i-1)],b=points[Math.min(3,i+1)],d=Math.max(1,distance(a,b));
      const nx=-(b.y-a.y)/d,ny=(b.x-a.x)/d,r=width*[.131,.12,.106,.091][i]*factor;
      side.push({x:p.x+nx*r,y:p.y+ny*r});other.push({x:p.x-nx*r,y:p.y-ny*r});
    });
    const tip=points[3],dip=points[2],length=Math.max(1,distance(tip,dip)),base=points[0],next=points[1],baseLength=Math.max(1,distance(base,next));
    const contour=[...side,{x:tip.x+(tip.x-dip.x)/length*width*.105*factor,y:tip.y+(tip.y-dip.y)/length*width*.105*factor},...other.reverse(),
      {x:base.x-(next.x-base.x)/baseLength*width*.13,y:base.y-(next.y-base.y)/baseLength*width*.13}];
    const gradient=ctx.createLinearGradient(side[0].x,side[0].y,other[3].x,other[3].y);
    gradient.addColorStop(0,'#b78c77');gradient.addColorStop(.23,'#d0a98f');gradient.addColorStop(.52,'#dfb99e');gradient.addColorStop(.8,'#cea28a');gradient.addColorStop(1,'#b78b74');
    ctx.beginPath();
    contour.forEach((p,i)=>{
      const prev=contour[(i+contour.length-1)%contour.length],next=contour[(i+1)%contour.length];
      if(i===0)ctx.moveTo((prev.x+p.x)/2,(prev.y+p.y)/2);
      ctx.quadraticCurveTo(p.x,p.y,(next.x+p.x)/2,(next.y+p.y)/2);
    });
    ctx.closePath();ctx.fillStyle=gradient;ctx.fill();
  }
  function drawHand(ctx,actor,sim) {
    const rig=sim.rigs.get(actor.id);
    const pts=rig?rig.nodes.map(n=>n.position):actor.points;if(!pts)return;
    const width=clamp(distance(pts[5],pts[17]),25,280);
    const middle=pts[9],wrist=pts[0],len=Math.max(1,distance(wrist,middle));
    const ux=(middle.x-wrist.x)/len,uy=(middle.y-wrist.y)/len,nx=-uy,ny=ux;
    ctx.save();
    // Anatomical wrist and finger taper; no face or cartoon outline.
    segment(ctx,{x:wrist.x-ux*width*.55,y:wrist.y-uy*width*.55},wrist,width*.32,width*.34);
    const fingerOrder=[...P.chains].sort((a,b)=>(actor.points[b[4]]?.z||0)-(actor.points[a[4]]?.z||0));
    // Hull ordering works for either handedness; avoids a mirrored, self-crossing palm.
    const palm=Matter.Vertices.hull([
      {x:wrist.x-nx*width*.34,y:wrist.y-ny*width*.34},
      {x:wrist.x+nx*width*.34,y:wrist.y+ny*width*.34},
      {x:pts[1].x,y:pts[1].y},
      ...[5,9,13,17].flatMap(i=>[{x:pts[i].x+nx*width*.11,y:pts[i].y+ny*width*.11},{x:pts[i].x-nx*width*.11,y:pts[i].y-ny*width*.11}])
    ]);
    const gradient=ctx.createLinearGradient(wrist.x-nx*width*.55,wrist.y-ny*width*.55,wrist.x+nx*width*.55,wrist.y+ny*width*.55);
    gradient.addColorStop(0,'#b48a72');gradient.addColorStop(.3,'#cfaa92');gradient.addColorStop(.58,'#dcb69c');gradient.addColorStop(1,'#b98f79');
    ctx.beginPath();
    palm.forEach((p,i)=>{const prev=palm[(i+palm.length-1)%palm.length],next=palm[(i+1)%palm.length];const enter={x:p.x+(prev.x-p.x)*.15,y:p.y+(prev.y-p.y)*.15};if(i===0)ctx.moveTo(enter.x,enter.y);else ctx.lineTo(enter.x,enter.y);ctx.quadraticCurveTo(p.x,p.y,p.x+(next.x-p.x)*.15,p.y+(next.y-p.y)*.15);});ctx.closePath();ctx.fillStyle=gradient;ctx.fill();
    // Tendon/crease detail is deliberately subtle.
    ctx.save();ctx.clip();
    const pad={x:wrist.x+(pts[2].x-wrist.x)*.55,y:wrist.y+(pts[2].y-wrist.y)*.55};
    const flesh=ctx.createRadialGradient(pad.x-width*.04,pad.y-width*.05,0,pad.x,pad.y,width*.36);
    flesh.addColorStop(0,'rgba(243,207,181,.22)');flesh.addColorStop(.7,'rgba(210,157,126,.06)');flesh.addColorStop(1,'rgba(134,89,65,0)');
    ctx.fillStyle=flesh;ctx.beginPath();ctx.arc(pad.x,pad.y,width*.36,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.strokeStyle='rgba(115,69,52,.12)';ctx.lineWidth=.8;
    for(const index of [5,9,13,17]){const p=pts[index];ctx.beginPath();ctx.moveTo(wrist.x+(p.x-wrist.x)*.25,wrist.y+(p.y-wrist.y)*.25);ctx.quadraticCurveTo(p.x+nx*4,p.y-uy*len*.22,p.x,p.y);ctx.stroke();}
    for(const chain of fingerOrder)drawDigit(ctx,chain.slice(1).map(i=>pts[i]),width,chain[1]===1);
    for(const chain of P.chains) {
      const tip=pts[chain[4]],dip=pts[chain[3]],d=distance(tip,dip);
      if(d<width*.09)continue;
      const nailLength=Math.min(d*.45,width*.12),nailWidth=width*.115;
      ctx.save();ctx.translate(tip.x+(dip.x-tip.x)*.28,tip.y+(dip.y-tip.y)*.28);ctx.rotate(Math.atan2(tip.y-dip.y,tip.x-dip.x)+Math.PI/2);
      const nail=ctx.createLinearGradient(-nailWidth/2,0,nailWidth/2,0);nail.addColorStop(0,'#be9586');nail.addColorStop(.5,'#e6c7b7');nail.addColorStop(1,'#cfa394');
      ctx.fillStyle=nail;ctx.strokeStyle='rgba(118,77,60,.22)';ctx.lineWidth=.65;rounded(ctx,-nailWidth/2,-nailLength/2,nailWidth,nailLength,3);ctx.fill();ctx.stroke();ctx.restore();
      for(const joint of [chain[2],chain[3]]) {const p=pts[joint];ctx.strokeStyle='rgba(103,61,48,.16)';ctx.beginPath();ctx.moveTo(p.x-nx*width*.04,p.y-ny*width*.04);ctx.lineTo(p.x+nx*width*.04,p.y+ny*width*.04);ctx.stroke();}
    }
    ctx.restore();
  }
  class Renderer {
    constructor(canvas) {this.canvas=canvas;this.ctx=canvas.getContext('2d');this.resize();}
    resize() {
      this.width=innerWidth;this.height=innerHeight;const dpr=Math.min(devicePixelRatio||1,2);
      this.canvas.width=this.width*dpr;this.canvas.height=this.height*dpr;this.dpr=dpr;
      const right=this.width>850?256:0,top=85,bottom=this.width>850?40:210;
      this.scale=Math.max(.18,Math.min((this.width-right-24)/1200,(this.height-top-bottom)/760));
      this.x=(this.width-right-1200*this.scale)/2;this.y=top+(this.height-top-bottom-760*this.scale)/2;
    }
    toWorld(x,y) {return {x:(x-this.x)/this.scale,y:(y-this.y)/this.scale};}
    toScreen(p) {return {x:this.x+p.x*this.scale,y:this.y+p.y*this.scale};}
    draw(sim) {
      const ctx=this.ctx;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,this.width,this.height);
      ctx.translate(this.x,this.y);ctx.scale(this.scale,this.scale);
      const shake=sim.shake;ctx.translate(Math.sin(sim.time*117)*shake,Math.cos(sim.time*93)*shake*.5);
      // A grounded studio surface provides a visible collision plane.
      const floor=ctx.createLinearGradient(0,697,0,760);floor.addColorStop(0,'rgba(121,147,160,.13)');floor.addColorStop(1,'rgba(28,40,49,.04)');
      ctx.fillStyle=floor;ctx.fillRect(0,700,1200,60);ctx.strokeStyle='rgba(163,188,202,.19)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,700);ctx.lineTo(1200,700);ctx.stroke();
      if(sim.puddle>0) {ctx.fillStyle='rgba(102,170,197,.25)';ctx.beginPath();ctx.ellipse(600,703,Math.min(460,45+sim.puddle),3+sim.puddle*.015,0,0,Math.PI*2);ctx.fill();}
      if(sim.item==='glass')drawGlass(ctx,sim);
      if(sim.item==='banana')drawBanana(ctx,sim);
      if(sim.item==='bottle')drawBottle(ctx,sim);
      for(const actor of sim.actors){
        if(actor.intent&&!actor.uiActive&&!sim.grabs.has(actor.id)){
          const p=actor.intent.point;ctx.strokeStyle='rgba(177,226,242,.65)';ctx.lineWidth=1.5;
          ctx.beginPath();ctx.arc(p.x,p.y,18,0,Math.PI*2);ctx.stroke();
        }
      }
      for(const d of sim.drops){ctx.strokeStyle='rgba(169,219,239,.67)';ctx.lineWidth=d.r;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x-d.vx*.015,d.y-d.vy*.015);ctx.stroke();}
      for(const d of sim.splashes){ctx.fillStyle=`rgba(166,220,242,${d.life})`;ctx.beginPath();ctx.arc(d.x,d.y,1.8,0,Math.PI*2);ctx.fill();}
      if(sim.flash>0){ctx.fillStyle=`rgba(230,248,255,${sim.flash*.19})`;ctx.fillRect(0,0,1200,760);}
    }
    drawHands(sim,canvas) {
      const dpr=Math.min(devicePixelRatio||1,2),width=innerWidth,height=innerHeight;
      if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
      const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      ctx.translate(this.x,this.y);ctx.scale(this.scale,this.scale);
      for(const actor of sim.actors)if(actor.points)drawHand(ctx,actor,sim);
    }
  }
  window.HandRenderer=Renderer;
})();
