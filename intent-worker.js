'use strict';
importScripts('intent-model.js');
let model=new HandIntent.IntentModel();
let generation=0;
self.onmessage=({data})=>{
  if(data.type==='init'){generation=data.generation;model=new HandIntent.IntentModel(data.saved);self.postMessage({type:'profile',generation,profile:model.export(),settings:model.settings()});}
  if(data.generation!==generation)return;
  if(data.type==='score'){
    self.postMessage({type:'scores',generation,epoch:data.epoch,at:data.at,groups:data.groups.map(group=>({id:group.id,scores:group.candidates.map(c=>({key:c.key,kind:c.kind,confidence:model.score(c.kind,c.features)}))}))});
  }
  if(data.type==='learn'&&model.learn(data.sample))self.postMessage({type:'profile',generation,profile:model.export(),settings:model.settings()});
};
