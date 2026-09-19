(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const {distance,clamp,angleDelta,world}=HandPhysics;
  const renderer=new HandRenderer($('stage')),handLayer=$('handLayer');
  const video=$('webcam'),overlay=$('handOverlay'),overlayCtx=overlay.getContext('2d');
  const config={
    glass:{title:'Fragile by nature.',description:'Strike the pane. Watch the fracture travel.',instructions:'Close your fist and strike through the pane. Pinch a shard carefully—bringing it to your tracked mouth leaves a small blood mark.',pointer:'Click the pane to strike it. Drag fallen fragments to pick them up.',hint:'A moving fist breaks the pane. Keep sharp shards away from your mouth.'},
    banana:{title:'One strip at a time.',description:'Hold the fruit. Pull. Let the peel fall.',instructions:'Peel at least one strip, hold the fruit, then bring it to your open tracked mouth. Move away and return for each bite.',pointer:'Drag a stem tip away to peel one strip. Mouse drag still works as a simple fallback.',hint:'Peel, grip the fruit, open your mouth and bring the fruit to it.'},
    bottle:{title:'Follow the water.',description:'Open the cap. Turn the bottle upside down.',instructions:'Unscrew the cap, hold the bottle, open your mouth and bring the bottle opening to it. Move away and return for another sip.',pointer:'Drag the body to hold it. Scroll or use Q / E while holding to rotate.',hint:'Open the bottle, then bring its opening to your tracked mouth.'}
  };
  let audio=null,master=null,noise=null,muted=false;
  let lastWaterSound=0;
  function audioReady() {
    if(!audio) {
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return false;
      audio=new Audio();master=audio.createGain();master.gain.value=muted?0:.38;master.connect(audio.destination);
      noise=audio.createBuffer(1,audio.sampleRate,audio.sampleRate);
      const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    }
    if(audio.state==='suspended')audio.resume().catch(()=>{});
    return true;
  }
  function tone(hz,duration,volume=.14,type='sine',end=hz) {
    if(!audio||muted)return;
    const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;
    o.type=type;o.frequency.setValueAtTime(hz,t);o.frequency.exponentialRampToValueAtTime(end,t+duration);
    g.gain.setValueAtTime(.001,t);g.gain.linearRampToValueAtTime(volume,t+.005);g.gain.exponentialRampToValueAtTime(.001,t+duration);
    o.connect(g).connect(master);o.start(t);o.stop(t+duration+.01);o.onended=()=>{o.disconnect();g.disconnect();};
  }
  function noiseSound(hz,duration,volume,kind='bandpass') {
    if(!audio||muted)return;
    const source=audio.createBufferSource(),f=audio.createBiquadFilter(),g=audio.createGain(),t=audio.currentTime;
    source.buffer=noise;f.type=kind;f.frequency.value=hz;f.Q.value=.7;
    g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);
    source.connect(f).connect(g).connect(master);source.start(t);source.stop(t+duration);
    source.onended=()=>{source.disconnect();f.disconnect();g.disconnect();};
  }
  function effect(kind) {
    if(kind==='glass') {
      noiseSound(2500,.85,.7,'highpass');tone(135,.14,.35,'sine',46);
      [1740,2610,3480,4570].forEach(f=>tone(f,.55,.065));
    }
    if(kind==='peel')noiseSound(1500,.12,.14);
    if(kind==='tear')noiseSound(2200,.23,.26);
    if(kind==='cap'){noiseSound(3800,.06,.2);tone(470,.11,.12,'sine',260);}
    if(kind==='water'&&performance.now()-lastWaterSound>190){lastWaterSound=performance.now();noiseSound(1350,.32,.13);tone(160+Math.random()*100,.12,.06);}
    if(kind==='bite'){noiseSound(520,.07,.08);tone(220,.11,.12,'triangle',160);}
    if(kind==='drink'){noiseSound(1180,.2,.11);tone(330,.1,.08,'sine',220);}
    if(kind==='mouthcut'){noiseSound(1850,.18,.2,'highpass');tone(115,.18,.12,'sawtooth',70);}
    if(kind==='cardtear'){noiseSound(2100,.26,.24);tone(180,.08,.08,'square',90);}
  }
  const sim=new HandPhysics.Simulation(effect);
  const assistant=new IntentAssistant(()=>{});
  sim.onLearn=sample=>assistant.learn(sample);
  const menuGate=new HandIntent.MenuGate(),cursors=new Map(),cardGrips=new Map(),tornCards=new Map(),liftedCards=new Map(),floatingSources=new WeakMap(),cardPinchConsumed=new Set();
  let pairStarts=new WeakMap();
  let cameraOn=false,starting=false,model=null,modelKind='',modelPromise=null,faceModel=null,facePromise=null,visionRuntimePromise=null,stream=null,session=0;
  let cameraActors=[],nextHandId=1,lastDetection=0,inferenceBusy=false,faceBusy=false,lastHandSend=0,lastFaceSend=0;
  let mouth=null,mouthBloody=false,mouthContact=false,mouthBiteArmed=false;
  let pointer=null,toastTimer=0,oldStatus='';
  function showToast(message) {$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),5200);}
  function select(item) {
    sim.select(item);assistant.resetScene();pointer=null;mouthBloody=false;mouthContact=false;mouthBiteArmed=false;$('trackedMouth').classList.remove('bloody','near','feeding');const c=config[item];
    $('sceneTitle').textContent=c.title;$('sceneDescription').textContent=c.description;
    $('sceneIndex').textContent='MATERIAL STUDY / 0'+({glass:1,banana:2,bottle:3}[item]);
    $('instructionsText').textContent=c.instructions;$('pointerHelp').textContent=c.pointer;$('interactionHint').textContent=c.hint;
    $('waterMeter').hidden=item!=='bottle';
    document.querySelectorAll('.materials .item-button').forEach(button=>{const selected=button.dataset.item===item;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
    updateStatus();
  }
  function updateStatus() {
    const text=sim.status();if(text!==oldStatus){$('objectStatus').textContent=text;oldStatus=text;}
    if(sim.bottle)$('waterMeter').value=sim.bottle.amount;
  }
  function updateTrackedMouth(){
    const el=$('trackedMouth'),fresh=mouth&&performance.now()-mouth.seen<450;
    if(!fresh){el.hidden=true;return;}
    const visualWidth=clamp(mouth.width*1.55,112,230),visualHeight=clamp(mouth.width*.78,76,150),lip=clamp(mouth.width*.31,28,54);
    el.hidden=false;el.style.left=mouth.x+'px';el.style.top=mouth.y+'px';el.style.width=visualWidth+'px';el.style.height=visualHeight+'px';el.style.setProperty('--mouth-lip',lip+'px');
    el.style.setProperty('--mouth-open',clamp(5+mouth.ratio*visualHeight*1.35,6,58)+'px');el.classList.toggle('bloody',mouthBloody);el.classList.toggle('feeding',mouthBiteArmed);
    $('mouthStatus').textContent=mouthBiteArmed?'BANANA IN MOUTH — CLOSE TO BITE':mouth.open?(mouthBloody?'MOUTH HURT':'MOUTH OPEN'):'OPEN YOUR MOUTH';
  }
  function acceptFaceResults(results){
    if(!cameraOn)return;const points=results.multiFaceLandmarks?.[0],now=performance.now();
    if(!points){updateTrackedMouth();return;}
    const left=points[61],right=points[291],upper=points[13],lower=points[14];
    const x=(1-(left.x+right.x)/2)*innerWidth,y=(upper.y+lower.y)/2*innerHeight;
    const width=Math.hypot((right.x-left.x)*innerWidth,(right.y-left.y)*innerHeight),lipGap=Math.hypot((lower.x-upper.x)*innerWidth,(lower.y-upper.y)*innerHeight);
    const ratio=lipGap/Math.max(1,width),alpha=mouth?.seen?0.42:1;
    mouth={x:mouth?mouth.x+(x-mouth.x)*alpha:x,y:mouth?mouth.y+(y-mouth.y)*alpha:y,width:mouth?mouth.width+(width-mouth.width)*alpha:width,ratio,open:ratio>.105,seen:now};updateTrackedMouth();
  }
  function updateMouthInteraction(){
    if(!mouth||performance.now()-mouth.seen>450){mouthContact=false;mouthBiteArmed=false;updateTrackedMouth();return;}
    const radius=clamp(mouth.width*1.32,72,160);let closest=Infinity,action=null;
    for(const [actorId,grab] of [...sim.grabs]){
      let point=null,kind='';
      if(sim.item==='banana'&&grab.kind==='body'&&grab.body===sim.banana?.body){point=world(grab.body,HandPhysics.bananaLine(.93));kind='banana';}
      if(sim.item==='bottle'&&grab.kind==='body'&&grab.body===sim.bottle?.body){point=world(grab.body,{x:0,y:-139});kind='bottle';}
      if(sim.item==='glass'&&grab.kind==='shard'){point=grab.body.position;kind='glass';}
      if(!point)continue;const screen=renderer.toScreen(point),d=Math.hypot(screen.x-mouth.x,screen.y-mouth.y);
      if(d<closest){closest=d;action={actorId,kind};}
    }
    const near=closest<radius*1.25;$('trackedMouth').classList.toggle('near',near);
    if(!near){mouthContact=false;mouthBiteArmed=false;updateTrackedMouth();return;}
    if(action?.kind==='banana'){
      if(mouth.open&&!mouthContact){mouthBiteArmed=true;mouthContact=true;showToast('Banana is in your mouth — close your mouth to take a bite.');}
      if(mouthBiteArmed&&!mouth.open){const result=sim.eatBanana();mouthBiteArmed=false;mouthContact=true;if(result)showToast(result.message);}
      updateTrackedMouth();return;
    }
    if(!action||closest>=radius||!mouth.open||mouthContact){updateTrackedMouth();return;}
    mouthContact=true;let result;
    if(action.kind==='bottle')result=sim.drinkBottle();
    if(action.kind==='glass'){mouthBloody=true;effect('mouthcut');result={message:'Ouch — the glass cut your mouth.'};}
    if(result)showToast(result.message);updateTrackedMouth();
  }
  function syncActors() {
    const now=performance.now(),active=cameraActors.filter(a=>now-a.seen<220);
    updateHandMenu(active,now);
    if(pointer)active.push(pointer);
    assistant.update(active,sim,now);
    sim.setActors(active.slice(0,2));
    $('cameraCount').textContent=cameraActors.filter(a=>performance.now()-a.seen<220).length+' / 2 HANDS';
  }
  function liftCard(button){
    let lift=liftedCards.get(button);if(lift){lift.element.classList.remove('returning');return lift;}
    const rect=button.getBoundingClientRect(),element=button.cloneNode(true);
    element.classList.remove('pressed','hand-hover','card-grabbed','torn');element.classList.add('floating-card');element.removeAttribute('data-item');element.removeAttribute('aria-pressed');element.disabled=false;
    Object.assign(element.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});
    $('tornPieces').append(element);button.classList.add('card-lifted');lift={element,rect,translation:{x:0,y:0},rotation:0};liftedCards.set(button,lift);floatingSources.set(element,button);return lift;
  }
  function returnLiftedCard(button){
    const lift=liftedCards.get(button);if(!lift)return;lift.element.classList.remove('rubber-tension','card-grabbed');lift.element.classList.add('returning');lift.element.style.setProperty('--tension','0');lift.element.style.transform='translate(0px,0px) rotate(0deg) scale(1)';
    setTimeout(()=>{if(liftedCards.get(button)!==lift||[...cardGrips.values()].some(g=>g.button===button)||tornCards.has(button))return;lift.element.remove();liftedCards.delete(button);button.classList.remove('card-lifted','card-grabbed');},360);
  }
  function beginCardGrip(actor,button,point,now,menuInfo){
    const lift=liftCard(button),rect=lift.rect,grip={actorId:actor.id,button,start:{...point},current:{...point},started:now,releaseAt:0,rect,menuFeatures:menuInfo?.features,menuLearned:false};cardGrips.set(actor.id,grip);
    button.classList.add('card-grabbed');lift.element.classList.add('card-grabbed');
    const state=menuGate.update(actor.id,button.id||button.dataset.item,point,actor.pinching,now,menuInfo?.confidence||0);
    if(state.activate&&grip.menuFeatures){assistant.learn({kind:'menu',features:grip.menuFeatures,success:true});grip.menuLearned=true;}
    return state.activate;
  }
  function releaseTornPiece(grip){
    const torn=tornCards.get(grip.button),piece=torn?.pieces.find(p=>p.actorId===grip.actorId);if(!piece||piece.released)return;
    piece.released=true;piece.element.classList.add('released');const dx=grip.current.x-piece.anchor.x,side=piece.side==='left'?-1:1;
    piece.element.style.transform=`translate(${dx+side*120}px,${innerHeight-piece.rect.top+100}px) rotate(${side*42}deg) ${piece.baseTransform}`;
  }
  function finishCardGrip(id,now,allowClick){
    const grip=cardGrips.get(id);if(!grip)return null;cardGrips.delete(id);
    if(tornCards.has(grip.button)){releaseTornPiece(grip);return null;}
    const remaining=[...cardGrips.values()].some(g=>g.button===grip.button);if(!remaining){grip.button.classList.remove('card-grabbed');pairStarts.delete(grip.button);returnLiftedCard(grip.button);}
    const moved=Math.hypot(grip.current.x-grip.start.x,grip.current.y-grip.start.y),click=allowClick&&moved<28&&now-grip.started<950&&!grip.button.classList.contains('selected');
    if(grip.menuFeatures&&!grip.menuLearned&&(click||moved>28))assistant.learn({kind:'menu',features:grip.menuFeatures,success:click});
    return click?grip.button:null;
  }
  function tearCard(button,grips){
    if(tornCards.has(button))return;const lift=liftedCards.get(button);if(!lift)return;const source=lift.element,rect=lift.rect,visualRect=source.getBoundingClientRect(),baseTransform=source.style.transform,ordered=[...grips].sort((a,b)=>a.current.x-b.current.x);
    const pieces=['left','right'].map((side,index)=>{
      const clone=source.cloneNode(true);clone.classList.remove('floating-card','selected','pressed','hand-hover','card-grabbed','rubber-tension','returning');clone.classList.add('torn-piece',side,'tear-pop');clone.removeAttribute('aria-pressed');clone.disabled=false;
      Object.assign(clone.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',transform:baseTransform});$('tornPieces').append(clone);
      const grip=ordered[index];return {side,element:clone,actorId:grip?.actorId,released:false,anchor:{...grip.current},baseTransform,rect:visualRect};
    });
    const burst=document.createElement('span');burst.className='tear-burst';burst.style.left=visualRect.left+visualRect.width/2+'px';burst.style.top=visualRect.top+visualRect.height/2+'px';$('tornPieces').append(burst);setTimeout(()=>burst.remove(),650);
    source.remove();liftedCards.delete(button);tornCards.set(button,{button,pieces,rect});button.classList.remove('card-grabbed','card-lifted');button.classList.add('torn');button.disabled=true;$('undoTears').disabled=false;
    effect('cardtear');showToast('Material card torn apart. Use Undo torn cards to rebuild it.');
  }
  function updateCardTransforms(actors){
    const actorMap=new Map(actors.map(actor=>[actor.id,actor])),buttons=new Set([...cardGrips.values()].map(g=>g.button));
    for(const button of buttons){
      const grips=[...cardGrips.values()].filter(g=>g.button===button);
      if(tornCards.has(button)){
        const torn=tornCards.get(button);
        for(const piece of torn.pieces){const grip=grips.find(g=>g.actorId===piece.actorId),actor=grip&&actorMap.get(grip.actorId);if(!grip||!actor?.pinching||piece.released)continue;const dx=grip.current.x-piece.anchor.x,dy=grip.current.y-piece.anchor.y,side=piece.side==='left'?-1:1;piece.element.style.transform=`translate(${dx+side*18}px,${dy}px) rotate(${side*(8+Math.abs(dx)*.025)}deg) ${piece.baseTransform}`;}
        continue;
      }
      const lift=liftedCards.get(button);if(!lift)continue;
      if(grips.length===1){const g=grips[0],dx=g.current.x-g.start.x,dy=g.current.y-g.start.y;lift.translation={x:dx,y:dy};lift.rotation=clamp(dx/18,-8,8);lift.element.classList.remove('rubber-tension');lift.element.style.setProperty('--tension','0');lift.element.style.transform=`translate(${dx}px,${dy}px) rotate(${lift.rotation}deg)`;continue;}
      if(grips.length>=2){
        const pair=grips.slice(0,2).sort((a,b)=>a.actorId.localeCompare(b.actorId)),key=pair.map(g=>g.actorId).join('|');
        const currentSep=Math.hypot(pair[1].current.x-pair[0].current.x,pair[1].current.y-pair[0].current.y),currentAngle=Math.atan2(pair[1].current.y-pair[0].current.y,pair[1].current.x-pair[0].current.x);
        const center={x:(pair[0].current.x+pair[1].current.x)/2,y:(pair[0].current.y+pair[1].current.y)/2};let start=pairStarts.get(button);
        if(!start||start.key!==key){start={key,sep:Math.max(1,currentSep),angle:currentAngle,center:{...center},translation:{...lift.translation},rotation:lift.rotation};pairStarts.set(button,start);}
        const threshold=Math.max(78,pair[0].rect.width*.34),stretch=Math.max(0,currentSep-start.sep),tension=clamp(stretch/threshold,0,1.2),dx=start.translation.x+center.x-start.center.x,dy=start.translation.y+center.y-start.center.y,rotation=start.rotation+(currentAngle-start.angle)*180/Math.PI,wobble=Math.sin(performance.now()*.035)*tension*2.6;
        lift.translation={x:dx,y:dy};lift.rotation=rotation;lift.element.classList.toggle('rubber-tension',tension>.04);lift.element.style.setProperty('--tension',String(tension));lift.element.style.transform=`translate(${dx}px,${dy}px) rotate(${rotation+wobble}deg) scaleX(${1+tension*.5}) scaleY(${1-Math.min(.14,tension*.12)}) skewY(${wobble*.45}deg)`;
        if(tension>=1)tearCard(button,pair);
      }
    }
  }
  function undoTornCards(){
    for(const torn of tornCards.values()){torn.button.classList.remove('torn','card-grabbed','card-lifted');torn.button.disabled=false;for(const piece of torn.pieces)piece.element.remove();}
    for(const [id,grip] of [...cardGrips])if(tornCards.has(grip.button))cardGrips.delete(id);
    tornCards.clear();pairStarts=new WeakMap();$('undoTears').disabled=true;audioReady();tone(360,.12,.11,'sine',520);showToast('All material cards rebuilt.');
  }
  function updateHandMenu(actors,now){
    document.querySelectorAll('.hand-hover').forEach(el=>{el.classList.remove('hand-hover');el.style.removeProperty('--hand-progress');});
    const present=new Set(actors.map(actor=>actor.id)),activations=[];
    for(const id of [...cardGrips.keys()])if(!present.has(id))finishCardGrip(id,now,false);
    for(const actor of actors){
      if(!actor.pinching)cardPinchConsumed.delete(actor.id);
      const tip=renderer.toScreen(actor.points[8]),under=document.elementFromPoint(tip.x,tip.y),floating=under?.closest('.floating-card');
      const held=sim.grabs.has(actor.id),item=floating?floatingSources.get(floating):under?.closest('.materials .item-button:not(.torn)'),existing=cardGrips.get(actor.id),menuInfo=item?assistant.menuIntent(actor.id,item,tip,(floating||item).getBoundingClientRect(),now):null;let button=null,hoverElement=null,state={progress:0,activate:false};
      if(existing){
        actor.uiActive=true;existing.current={...tip};
        if(actor.pinching)existing.releaseAt=0;
        else if(!existing.releaseAt)existing.releaseAt=now;
        else if(now-existing.releaseAt>140){const click=finishCardGrip(actor.id,now,true);if(click)activations.push(click);}
      }else if(!held&&!actor.fist&&actor.pinching&&!cardPinchConsumed.has(actor.id)&&item&&!item.disabled){
        actor.uiActive=true;
        if(beginCardGrip(actor,item,tip,now,menuInfo)){cardPinchConsumed.add(actor.id);activations.push(item);finishCardGrip(actor.id,now,false);}
      }else{
        actor.uiActive=!held&&!actor.fist&&Boolean(floating||under?.closest('.materials,.top-actions'));
        button=actor.uiActive?(floating?floatingSources.get(floating):under?.closest('.materials .item-button:not(.torn),#resetButton,#undoTears,#soundButton')):null;hoverElement=floating||button;
        const target=button&&!button.disabled?(button.id||button.dataset.item):null;state=menuGate.update(actor.id,target,tip,actor.pinching,now,menuInfo?.confidence||0);
        if(button&&state.activate){if(menuInfo)assistant.learn({kind:'menu',features:menuInfo.features,success:true});activations.push(button);}
      }
      let cursor=cursors.get(actor.id);
      if(!cursor){cursor=document.createElement('div');cursor.className='hand-cursor';$('handCursors').append(cursor);cursors.set(actor.id,cursor);}
      cursor.style.left=tip.x+'px';cursor.style.top=tip.y+'px';cursor.style.opacity=actor.uiActive?'1':'.35';
      cursor.style.setProperty('--hand-progress',state.progress);cursor.classList.toggle('pinched',actor.pinching);
      cursor.classList.toggle('intent-lock',Boolean(menuInfo&&menuInfo.confidence>.62));
      if(hoverElement){
        hoverElement.classList.add('hand-hover');
        hoverElement.style.setProperty('--hand-progress',Math.max(state.progress,Number(hoverElement.style.getPropertyValue('--hand-progress'))||0));
      }
    }
    updateCardTransforms(actors);
    for(const [id,cursor] of cursors)if(!present.has(id)){cursor.remove();cursors.delete(id);menuGate.hands.delete(id);cardPinchConsumed.delete(id);}
    for(const button of activations)if(!button.classList.contains('selected'))button.click();
  }
  function center(points) {
    const ids=[0,5,9,13,17];return ids.reduce((p,i)=>({x:p.x+points[i].x/5,y:p.y+points[i].y/5}),{x:0,y:0});
  }
  function acceptResults(results) {
    if(!cameraOn)return;
    const now=performance.now(),detections=(results.multiHandLandmarks||[]).slice(0,2);
    const raw=detections.map((pts,index)=>({pts,label:results.multiHandedness?.[index]?.label||'',center:center(pts)}));
    const old=[...cameraActors],used=new Set(),assignments=new Map();
    // Match both sets globally by distance instead of treating model array order as identity.
    const pairs=[];
    raw.forEach((r,i)=>old.forEach((o,j)=>pairs.push({i,j,cost:distance(r.center,o.rawCenter)+(r.label&&o.label&&r.label!==o.label?.18:0)})));
    pairs.sort((a,b)=>a.cost-b.cost);
    for(const pair of pairs)if(pair.cost<.65&&!assignments.has(pair.i)&&!used.has(pair.j)){assignments.set(pair.i,old[pair.j]);used.add(pair.j);}
    cameraActors=raw.map((r,index)=>{
      const previous=assignments.get(index),dt=previous?clamp((now-previous.seen)/1000,.012,.15):1/30;
      const mapped=r.pts.map(p=>({...renderer.toWorld((1-p.x)*innerWidth,p.y*innerHeight),z:p.z||0}));
      const alpha=1-Math.exp(-dt*32);
      const points=mapped.map((p,i)=>previous?{x:previous.points[i].x+(p.x-previous.points[i].x)*alpha,y:previous.points[i].y+(p.y-previous.points[i].y)*alpha,z:p.z}:p);
      const palm=center(points),size=Math.max(.025,distance(r.pts[0],r.pts[9]));
      const ratio=distance(r.pts[4],r.pts[8])/size;
      const threshold=assistant.settings.pinch;
      const releaseAt=ratio>threshold+.22?(previous?.releaseAt||now):0;
      const pinching=previous?.pinching?(!releaseAt||now-releaseAt<90):ratio<threshold;
      const extended=[8,12,16,20].filter(t=>distance(r.pts[t],r.pts[0])>distance(r.pts[t-2],r.pts[0])*1.14).length;
      const fist=extended===0;
      const p={x:(points[4].x+points[8].x)/2,y:(points[4].y+points[8].y)/2};
      const direction=Math.atan2(points[9].y-points[0].y,points[9].x-points[0].x)+Math.PI/2;
      return {id:previous?.id||'hand-'+nextHandId++,label:r.label,rawCenter:r.center,rawSize:size,approachSpeed:previous?(size-previous.rawSize)*1200/dt:0,points,palm,point:p,pinching,pinchRatio:ratio,releaseAt,gripping:fist,fist,angle:direction,
        velocity:previous?{x:(palm.x-previous.palm.x)/dt,y:(palm.y-previous.palm.y)/dt}:{x:0,y:0},previousPalm:previous?.palm||palm,seen:now};
    });
    lastDetection=now;syncActors();drawOverlay(detections);
  }
  function drawOverlay(hands) {
    const rect=overlay.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    if(overlay.width!==Math.round(rect.width*dpr)){overlay.width=Math.round(rect.width*dpr);overlay.height=Math.round(rect.height*dpr);}
    overlayCtx.setTransform(dpr,0,0,dpr,0,0);overlayCtx.clearRect(0,0,rect.width,rect.height);
    const aspect=(video.videoWidth||1280)/(video.videoHeight||720);
    const w=Math.min(rect.width,rect.height*aspect),h=w/aspect,ox=(rect.width-w)/2,oy=(rect.height-h)/2;
    overlayCtx.lineWidth=.7;overlayCtx.strokeStyle='rgba(207,235,238,.65)';
    hands.forEach(points=>HandPhysics.chains.forEach(chain=>{overlayCtx.beginPath();chain.forEach((id,i)=>{const p=points[id],x=ox+p.x*w,y=oy+p.y*h;if(i)overlayCtx.lineTo(x,y);else overlayCtx.moveTo(x,y);});overlayCtx.stroke();}));
  }
  async function loadVisionRuntime(){
    if(visionRuntimePromise)return visionRuntimePromise;
    visionRuntimePromise=(async()=>{
      const runtimeVersion='0.10.35',cdnBase='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+runtimeVersion,unpkgBase='https://unpkg.com/@mediapipe/tasks-vision@'+runtimeVersion;
      const local={bundle:new URL('./node_modules/@mediapipe/tasks-vision/vision_bundle.mjs',location.href).href,wasm:new URL('./node_modules/@mediapipe/tasks-vision/wasm',location.href).href};
      const remote=[{bundle:cdnBase+'/vision_bundle.mjs',wasm:cdnBase+'/wasm'},{bundle:unpkgBase+'/vision_bundle.mjs',wasm:unpkgBase+'/wasm'}];
      const sources=location.hostname.endsWith('github.io')?remote:[local,...remote];
      let lastError;
      for(const source of sources) {
        try {
          const vision=window.MediaPipeVision||await import(source.bundle+'?v='+runtimeVersion);
          const files=await vision.FilesetResolver.forVisionTasks(source.wasm);
          if(files.wasmLoaderPath)files.wasmLoaderPath+=(files.wasmLoaderPath.includes('?')?'&':'?')+'v='+runtimeVersion;
          if(files.wasmBinaryPath)files.wasmBinaryPath+=(files.wasmBinaryPath.includes('?')?'&':'?')+'v='+runtimeVersion;
          return {vision,files};
        } catch(error) { lastError=error; }
      }
      throw lastError||new Error('MediaPipe runtime could not be loaded.');
    })().catch(error=>{visionRuntimePromise=null;throw error;});
    return visionRuntimePromise;
  }
  async function loadModel() {
    if(modelPromise)return modelPromise;
    modelPromise=(async()=>{
      if(window.Hands){
        modelKind='legacy-test-adapter';model=new window.Hands();model.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:.65,minTrackingConfidence:.65,selfieMode:false});model.onResults(acceptResults);await model.initialize();return;
      }
      const {vision,files}=await loadVisionRuntime();modelKind='tasks';
      model=await vision.HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.65,minHandPresenceConfidence:.6,minTrackingConfidence:.65});
      const probe=document.createElement('canvas');probe.width=16;probe.height=16;model.detectForVideo(probe,1);
    })().catch(error=>{modelPromise=null;model=null;throw error;});
    return modelPromise;
  }
  async function loadFaceModel(){
    if(facePromise)return facePromise;
    facePromise=(async()=>{
      const {vision,files}=await loadVisionRuntime();
      faceModel=await vision.FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.6,minFacePresenceConfidence:.6,minTrackingConfidence:.6,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
      const probe=document.createElement('canvas');probe.width=16;probe.height=16;faceModel.detectForVideo(probe,1);
      $('trackedMouth').dataset.model='ready';
    })().catch(error=>{facePromise=null;faceModel=null;$('trackedMouth').dataset.model='error';throw error;});
    return facePromise;
  }
  async function cameraFrame(generation) {
    if(!cameraOn||generation!==session)return;
    const frameTime=performance.now();
    if(faceModel&&!faceBusy&&video.readyState>=2&&frameTime-lastFaceSend>80){
      faceBusy=true;lastFaceSend=frameTime;
      try{const result=faceModel.detectForVideo(video,frameTime);acceptFaceResults({multiFaceLandmarks:result.faceLandmarks||[]});}
      catch{faceModel=null;mouth=null;$('trackedMouth').hidden=true;showToast('Mouth tracking stopped; hand controls still work.');}
      finally{faceBusy=false;}
    }
    if(!inferenceBusy&&video.readyState>=2&&frameTime-lastHandSend>28) {
      inferenceBusy=true;
      lastHandSend=frameTime;
      try{
        if(modelKind==='tasks'){
          const result=model.detectForVideo(video,frameTime),handedness=result.handedness||result.handednesses||[];
          acceptResults({multiHandLandmarks:result.landmarks||[],multiHandedness:handedness.map(categories=>({label:categories?.[0]?.categoryName||categories?.[0]?.displayName||''}))});
        }else await model.send({image:video});
      }
      catch(error){stopCamera();showToast('Tracking stopped: '+error.message);}
      finally{inferenceBusy=false;}
    }
    if(cameraOn&&generation===session)requestAnimationFrame(()=>cameraFrame(generation));
  }
  async function startCamera() {
    if(cameraOn){stopCamera();return;}if(starting)return;
    audioReady();starting=true;$('cameraButton').disabled=true;$('cameraButtonText').textContent='Loading hand tracking…';
    try {
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Open this page on localhost or HTTPS to use the camera.');
      await loadModel();
      stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'user'},audio:false});
      video.srcObject=stream;await video.play();cameraOn=true;session++;
      $('cameraPlaceholder').classList.add('hidden');video.classList.add('visible');$('systemDot').classList.add('active');
      $('systemText').textContent='TWO HANDS + MOUTH';$('cameraButtonText').textContent='Disable camera';
      loadFaceModel().catch(error=>{console.error('Mouth tracker failed',error);showToast('Mouth tracking could not start. Refresh once and try again; hand controls still work.');});
      cameraFrame(session);
    }catch(error){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;$('cameraButtonText').textContent='Try camera again';showToast(error.message);}
    finally{starting=false;$('cameraButton').disabled=false;}
  }
  function stopCamera() {
    cameraOn=false;session++;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;cameraActors=[];mouth=null;mouthContact=false;mouthBiteArmed=false;faceBusy=false;$('trackedMouth').hidden=true;
    syncActors();drawOverlay([]);$('cameraPlaceholder').classList.remove('hidden');video.classList.remove('visible');$('systemDot').classList.remove('active');$('systemText').textContent='CAMERA OFF';$('cameraButtonText').textContent='Enable camera';
  }

  const canvas=$('stage');
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||cameraOn)return;
    audioReady();canvas.setPointerCapture(event.pointerId);const p=renderer.toWorld(event.clientX,event.clientY);
    if(sim.item==='glass'&&!sim.pane.broken&&p.x>sim.pane.x&&p.x<sim.pane.x+sim.pane.w&&p.y>sim.pane.y&&p.y<sim.pane.y+sim.pane.h){sim.breakGlass(p,{x:520,y:-160});return;}
    pointer={id:'pointer',palm:p,point:p,pinching:true,gripping:false,fist:false,angle:0,velocity:{x:0,y:0},seen:performance.now()};syncActors();
  });
  canvas.addEventListener('pointermove',event=>{
    if(!pointer)return;const p=renderer.toWorld(event.clientX,event.clientY),dt=Math.max(.008,(performance.now()-pointer.seen)/1000);
    pointer.velocity={x:(p.x-pointer.palm.x)/dt,y:(p.y-pointer.palm.y)/dt};pointer.palm=p;pointer.point=p;pointer.seen=performance.now();syncActors();
  });
  const releasePointer=()=>{pointer=null;syncActors();};
  canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);canvas.addEventListener('lostpointercapture',releasePointer);
  canvas.addEventListener('wheel',event=>{if(!pointer)return;event.preventDefault();pointer.angle+=Math.sign(event.deltaY)*.24;syncActors();},{passive:false});
  addEventListener('keydown',event=>{
    if(event.target.matches('input,textarea,select'))return;
    if(pointer&&(event.code==='KeyQ'||event.code==='KeyE')){pointer.angle+=event.code==='KeyE'?.22:-.22;syncActors();}
    if(event.code==='KeyR'){select(sim.item);audioReady();tone(470,.08);}
  });
  addEventListener('blur',()=>{pointer=null;cameraActors=[];syncActors();});
  document.querySelectorAll('.item-button').forEach(button=>button.addEventListener('click',()=>{
    audioReady();tone(430,.07,.1,'sine',600);button.classList.remove('pressed','intent-click');void button.offsetWidth;button.classList.add('pressed','intent-click');setTimeout(()=>button.classList.remove('intent-click'),520);select(button.dataset.item);
  }));
  $('resetButton').addEventListener('click',()=>{audioReady();tone(320,.09);select(sim.item);});
  $('undoTears').addEventListener('click',undoTornCards);
  $('cameraButton').addEventListener('click',startCamera);
  $('soundButton').addEventListener('click',()=>{muted=!muted;audioReady();if(master)master.gain.setTargetAtTime(muted?0:.38,audio.currentTime,.02);$('soundButton').textContent=muted?'Sound off':'Sound on';$('soundButton').setAttribute('aria-pressed',String(!muted));});
  $('fullscreenButton').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{showToast('Fullscreen is unavailable in this browser.');}});
  document.addEventListener('fullscreenchange',()=>{$('fullscreenButton').textContent=document.fullscreenElement?'Exit fullscreen ↙':'Fullscreen ↗';document.body.classList.toggle('fullscreen-mode',Boolean(document.fullscreenElement));renderer.resize();});
  addEventListener('resize',()=>renderer.resize());
  addEventListener('pagehide',stopCamera);
  let previous=performance.now(),accumulator=0;
  function animate(time) {
    accumulator+=Math.min(.08,(time-previous)/1000);previous=time;
    if(cameraActors.length&&time-lastDetection>220){cameraActors=[];syncActors();drawOverlay([]);}
    while(accumulator>=1/60){sim.step(1/60);accumulator-=1/60;}
    renderer.draw(sim);renderer.drawHands(sim,handLayer);updateMouthInteraction();updateStatus();requestAnimationFrame(animate);
  }
  select('glass');
  requestAnimationFrame(animate);
})();
