(function(){
  'use strict';
  const {world,distance,clamp}=HandPhysics;
  const storageKey='hand-material-intent-v1';
  class IntentAssistant {
    constructor(onStatus){
      this.onStatus=onStatus;this.generation=1;this.epoch=0;this.scored=new Map();this.history=new Map();this.menuHistory=new Map();this.lastRequest=this.lastMenuRequest=-Infinity;
      this.settings={radius:56,pinch:.42,actions:0,successes:0};this.available=false;
      let saved;try{saved=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{}
      try{
        this.worker=new Worker('intent-worker.js');
        this.worker.onmessage=({data})=>{
          if(data.generation!==this.generation)return;
          if(data.type==='profile'){
            this.available=true;this.settings=data.settings;
            try{localStorage.setItem(storageKey,JSON.stringify(data.profile));}catch{}
            this.onStatus(this.settings);
          }
          if(data.type==='scores'&&data.epoch===this.epoch&&performance.now()-data.at<450){
            for(const group of data.groups)this.scored.set(group.id,{at:data.at,scores:group.scores});
          }
        };
        this.worker.onerror=()=>{this.available=false;this.onStatus(null);};
        this.worker.postMessage({type:'init',generation:this.generation,saved});
      }catch{this.onStatus(null);}
    }
    resetScene(){this.epoch++;this.scored.clear();this.history.clear();this.menuHistory.clear();}
    learn(sample){if(this.available)this.worker.postMessage({type:'learn',generation:this.generation,sample});}
    menuIntent(id,target,point,rect,now){
      const key=target.id||target.dataset.item||'control',previous=this.menuHistory.get(id),dt=previous?Math.max(.012,(now-previous.time)/1000):.03;
      const same=previous?.key===key,speed=previous&&same?distance(point,previous.point)/dt:900,hover=same?(previous.hover+dt):0;
      const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,centered=clamp(1-Math.hypot(point.x-cx,point.y-cy)/Math.max(24,Math.hypot(rect.width,rect.height)*.55),0,1);
      const features=[1,clamp(hover/.42,0,1),clamp(1-speed/760,0,1),centered,target.classList?.contains('item-button')?1:0,clamp(this.settings.successes/18,0,1)];
      this.menuHistory.set(id,{key,point:{...point},time:now,hover});const groupId='menu:'+id,scored=this.scored.get(groupId),confidence=scored&&now-scored.at<450?(scored.scores.find(s=>s.key===key)?.confidence||0):0;
      if(this.available&&now-this.lastMenuRequest>72){this.lastMenuRequest=now;this.worker.postMessage({type:'score',generation:this.generation,epoch:this.epoch,at:now,groups:[{id:groupId,candidates:[{key,kind:'menu',features}]}]});}
      return {features,confidence,hover};
    }
    targets(sim){
      const out=[];
      if(sim.banana){
        for(const strip of sim.banana.strips)if(!strip.detached&&!Array.from(sim.grabs.values()).some(g=>g.strip===strip))out.push({key:'peel-'+strip.index,kind:'peel',point:strip.active?strip.nodes[10].position:world(sim.banana.body,strip.tab),strip:strip.index});
        out.push({key:'body',kind:'body',point:sim.banana.body.position});
      }
      if(sim.bottle){
        if(!sim.bottle.open)out.push({key:'cap',kind:'cap',point:world(sim.bottle.body,{x:0,y:-148})});
        out.push({key:'body',kind:'body',point:sim.bottle.body.position});
      }
      return out;
    }
    update(actors,sim,now){
      const targets=this.targets(sim),groups=[];
      for(const actor of actors){
        actor.intent=null;actor.intentCandidates=[];
        if(actor.id==='pointer'||actor.uiActive||sim.grabs.has(actor.id))continue;
        const previous=this.history.get(actor.id);
        const dt=previous?Math.max(.012,(now-previous.time)/1000):.03;
        const otherHolding=Array.from(sim.grabs.entries()).some(([id,g])=>id!==actor.id&&g.kind==='body');
        actor.intentCandidates=targets.map(t=>{
          const reach=distance(actor.point,t.point),radius=t.kind==='body'?170:82;
          const before=previous?distance(previous.point,t.point):reach;
          const approaching=clamp((before-reach)/dt/280,-1,1);
          const near=reach<radius*.8;
          const hover=near&&previous?.near===t.key?previous.hover+dt:0;
          const features=[1,clamp(1-reach/radius,0,1),approaching,clamp(hover/.6,0,1),clamp(1-(actor.pinchRatio||0)/.9,0,1),otherHolding?1:0];
          return {...t,reach,hover,features,pinch:actor.pinchRatio};
        });
        const closest=[...actor.intentCandidates].sort((a,b)=>a.reach-b.reach)[0];
        this.history.set(actor.id,{point:{...actor.point},time:now,near:closest?.key,hover:closest?.hover||0});
        const scores=this.scored.get(actor.id);
        if(scores&&now-scores.at<450){
          const options=actor.intentCandidates.map(c=>({...c,confidence:scores.scores.find(s=>s.key===c.key)?.confidence||0})).filter(c=>c.reach<(c.kind==='body'?135:this.settings.radius+8));
          options.sort((a,b)=>b.confidence-a.confidence);
          const best=options[0];
          if(best?.confidence>.65)actor.intent={...best,radius:this.settings.radius};
        }
        groups.push({id:actor.id,candidates:actor.intentCandidates.map(c=>({key:c.key,kind:c.kind,features:c.features}))});
      }
      const ids=new Set(actors.map(a=>a.id));for(const id of this.history.keys())if(!ids.has(id)){this.history.delete(id);this.scored.delete(id);this.menuHistory.delete(id);this.scored.delete('menu:'+id);}
      if(this.available&&groups.length&&now-this.lastRequest>90){this.lastRequest=now;this.worker.postMessage({type:'score',generation:this.generation,epoch:this.epoch,at:now,groups});}
    }
  }
  window.IntentAssistant=IntentAssistant;
})();
