(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const {distance,clamp,angleDelta}=HandPhysics;
  const renderer=new HandRenderer($('stage'));
  const video=$('webcam'),overlay=$('handOverlay'),overlayCtx=overlay.getContext('2d');
  const config={
    glass:{title:'Fragile by nature.',description:'Strike the pane. Watch the fracture travel.',instructions:'Close your fist and strike through the pane. Fallen fragments have weight and can be picked up.',pointer:'Click the pane to strike it. Drag fallen fragments to pick them up.',hint:'A moving fist breaks the pane. A light touch does not.'},
    banana:{title:'One strip at a time.',description:'Hold the fruit. Pull. Let the peel fall.',instructions:'Grip the banana body with one hand. With the other, pinch one of the three tips at the stem and pull away. Repeat for each strip.',pointer:'Drag a stem tip away to peel one strip. Drag the body to hold it. Scroll while holding to rotate.',hint:'Hold with one hand; pinch and pull a stem tip with the other.'},
    bottle:{title:'Follow the water.',description:'Open the cap. Turn the bottle upside down.',instructions:'Hold the body with one hand. Pinch the cap with the other and turn your wrist to unscrew. Release the cap, grip the bottle and turn your wrist until its mouth points down.',pointer:'Drag the body to hold it. Scroll or press Q / E to rotate. Pinch the cap with the mouse and scroll down to unscrew. Then invert the open bottle.',hint:'Water pours from an open, downward-facing mouth. Lifting alone does not pour.'}
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
  }
  const sim=new HandPhysics.Simulation(effect);
  let cameraOn=false,starting=false,model=null,modelPromise=null,stream=null,session=0;
  let cameraActors=[],nextHandId=1,lastDetection=0,inferenceBusy=false;
  let pointer=null,toastTimer=0,oldStatus='';
  function showToast(message) {$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),5200);}
  function select(item) {
    sim.select(item);pointer=null;const c=config[item];
    $('sceneTitle').textContent=c.title;$('sceneDescription').textContent=c.description;
    $('sceneIndex').textContent='MATERIAL STUDY / 0'+({glass:1,banana:2,bottle:3}[item]);
    $('instructionsText').textContent=c.instructions;$('pointerHelp').textContent=c.pointer;$('interactionHint').textContent=c.hint;
    $('waterMeter').hidden=item!=='bottle';
    document.querySelectorAll('.item-button').forEach(button=>{const selected=button.dataset.item===item;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
    updateStatus();
  }
  function updateStatus() {
    const text=sim.status();if(text!==oldStatus){$('objectStatus').textContent=text;oldStatus=text;}
    if(sim.bottle)$('waterMeter').value=sim.bottle.amount;
  }
  function syncActors() {
    const active=cameraActors.filter(a=>performance.now()-a.seen<220);
    if(pointer)active.push(pointer);
    sim.setActors(active.slice(0,2));
    $('cameraCount').textContent=cameraActors.filter(a=>performance.now()-a.seen<220).length+' / 2 HANDS';
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
    const aspect=(video.videoHeight||720)/(video.videoWidth||1280);
    cameraActors=raw.map((r,index)=>{
      const previous=assignments.get(index),dt=previous?clamp((now-previous.seen)/1000,.012,.15):1/30;
      const mapped=r.pts.map(p=>({x:(1-p.x)*1200,y:42+p.y*1200*aspect,z:p.z||0}));
      const alpha=1-Math.exp(-dt*32);
      const points=mapped.map((p,i)=>previous?{x:previous.points[i].x+(p.x-previous.points[i].x)*alpha,y:previous.points[i].y+(p.y-previous.points[i].y)*alpha,z:p.z}:p);
      const palm=center(points),size=Math.max(.025,distance(r.pts[0],r.pts[9]));
      const ratio=distance(r.pts[4],r.pts[8])/size;
      const pinching=ratio<(previous?.pinching?.55:.35);
      const extended=[8,12,16,20].filter(t=>distance(r.pts[t],r.pts[0])>distance(r.pts[t-2],r.pts[0])*1.14).length;
      const fist=extended===0;
      const p={x:(points[4].x+points[8].x)/2,y:(points[4].y+points[8].y)/2};
      const direction=Math.atan2(points[9].y-points[0].y,points[9].x-points[0].x)+Math.PI/2;
      return {id:previous?.id||'hand-'+nextHandId++,label:r.label,rawCenter:r.center,rawSize:size,approachSpeed:previous?(size-previous.rawSize)*1200/dt:0,points,palm,point:p,pinching,gripping:fist,fist,angle:direction,
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
  async function loadModel() {
    if(modelPromise)return modelPromise;
    modelPromise=(async()=>{
      if(!window.Hands)await new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js';script.crossOrigin='anonymous';
        script.onload=resolve;script.onerror=()=>reject(new Error('Hand tracking could not download. Check your connection and try again.'));document.head.appendChild(script);
      });
      model=new window.Hands({locateFile:file=>'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/'+file});
      model.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:.65,minTrackingConfidence:.65,selfieMode:false});
      model.onResults(acceptResults);
      await model.initialize();
    })().catch(error=>{modelPromise=null;model=null;throw error;});
    return modelPromise;
  }
  async function cameraFrame(generation) {
    if(!cameraOn||generation!==session)return;
    if(!inferenceBusy&&video.readyState>=2) {
      inferenceBusy=true;
      try{await model.send({image:video});}
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
      $('systemText').textContent='TWO-HAND TRACKING';$('cameraButtonText').textContent='Disable camera';
      cameraFrame(session);
    }catch(error){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;$('cameraButtonText').textContent='Try camera again';showToast(error.message);}
    finally{starting=false;$('cameraButton').disabled=false;}
  }
  function stopCamera() {
    cameraOn=false;session++;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;cameraActors=[];
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
    audioReady();tone(430,.07,.1,'sine',600);button.classList.remove('pressed');void button.offsetWidth;button.classList.add('pressed');select(button.dataset.item);
  }));
  $('resetButton').addEventListener('click',()=>{audioReady();tone(320,.09);select(sim.item);});
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
    renderer.draw(sim);updateStatus();requestAnimationFrame(animate);
  }
  select('glass');
  requestAnimationFrame(animate);
})();
