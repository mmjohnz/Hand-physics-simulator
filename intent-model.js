/* Small online logistic classifiers. No images, landmark recordings, or network calls. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.HandIntent=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const priors={peel:[-3.8,4.8,.55,.8,1.2,.8],body:[-3.6,4.6,.35,.6,1,.1],cap:[-3.8,4.8,.4,.8,1.1,.8],menu:[-2.7,1.25,1.35,1.75,1.1,.65]};
  const validFeatures=x=>Array.isArray(x)&&x.length===6&&x.every(v=>Number.isFinite(v)&&Math.abs(v)<=1);
  class IntentModel {
    constructor(saved){
      this.weights=JSON.parse(JSON.stringify(priors));
      this.actions=0;this.successes=0;this.reachMean=28;this.reachVariance=100;this.pinchMean=.3;
      if(saved?.version===2&&Object.keys(priors).every(k=>Array.isArray(saved.weights?.[k])&&saved.weights[k].length===6&&saved.weights[k].every(v=>Number.isFinite(v)&&Math.abs(v)<=12))&&
        ['actions','successes','reachMean','reachVariance','pinchMean'].every(k=>Number.isFinite(saved[k]))) {
        this.weights=JSON.parse(JSON.stringify(saved.weights));
        this.actions=clamp(saved.actions,0,1e6);this.successes=clamp(saved.successes,0,this.actions);
        this.reachMean=clamp(saved.reachMean,0,72);this.reachVariance=clamp(saved.reachVariance,0,900);this.pinchMean=clamp(saved.pinchMean,.12,.48);
      }
    }
    score(kind,features){
      if(!this.weights[kind]||!validFeatures(features))return 0;
      const z=this.weights[kind].reduce((sum,w,i)=>sum+w*features[i],0);
      return 1/(1+Math.exp(-clamp(z,-20,20)));
    }
    learn(sample){
      if(!sample||!this.weights[sample.kind]||!validFeatures(sample.features)||typeof sample.success!=='boolean')return false;
      const prediction=this.score(sample.kind,sample.features),label=sample.success?1:0;
      // One bounded gradient update per completed action, never per video frame.
      this.weights[sample.kind]=this.weights[sample.kind].map((w,i)=>clamp(w+.16*(label-prediction)*sample.features[i]-.002*(w-priors[sample.kind][i]),-12,12));
      this.actions++;
      if(sample.success){
        this.successes++;
        if(Number.isFinite(sample.reach)){
          const d=clamp(sample.reach,0,72)-this.reachMean;
          this.reachMean+=d*.12;this.reachVariance=.88*this.reachVariance+.12*d*d;
        }
        if(Number.isFinite(sample.pinch))this.pinchMean+=.12*(clamp(sample.pinch,.12,.48)-this.pinchMean);
      }
      return true;
    }
    settings(){return {radius:clamp(this.reachMean+Math.sqrt(this.reachVariance)*1.6+12,46,72),pinch:clamp(this.pinchMean+.12,.38,.5),actions:this.actions,successes:this.successes};}
    export(){return {version:2,weights:JSON.parse(JSON.stringify(this.weights)),actions:this.actions,successes:this.successes,reachMean:this.reachMean,reachVariance:this.reachVariance,pinchMean:this.pinchMean};}
  }
  class MenuGate {
    constructor(){this.hands=new Map();this.cooldownUntil=0;}
    clear(){this.hands.clear();}
    update(id,target,point,pinching,now,confidence=0){
      let state=this.hands.get(id);
      if(!target){this.hands.delete(id);return {progress:0,activate:false};}
      if(!state||state.target!==target){state={target,entered:now,origin:{...point},wasPinching:pinching,fired:false};this.hands.set(id,state);}
      if(Math.hypot(point.x-state.origin.x,point.y-state.origin.y)>28&&!state.fired){state.entered=now;state.origin={...point};}
      const dwell=target==='resetButton'?1250:Math.round(820-clamp(confidence,0,1)*300);
      const elapsed=now-state.entered,edge=pinching&&!state.wasPinching;
      const clickDelay=confidence>.62?24:55;
      const activate=!state.fired&&now>=this.cooldownUntil&&((edge&&elapsed>=clickDelay)||(!pinching&&elapsed>=dwell));
      state.wasPinching=pinching;
      if(activate){state.fired=true;this.cooldownUntil=now+650;}
      return {progress:state.fired?1:clamp(elapsed/dwell,0,1),activate};
    }
  }
  return {IntentModel,MenuGate};
});
