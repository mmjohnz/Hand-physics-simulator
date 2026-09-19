const {test}=require('node:test');
const assert=require('node:assert/strict');
const {IntentModel,MenuGate}=require('../intent-model.js');
const features=[1,.7,.2,.8,.7,1];
test('confirmed and abandoned actions update confidence in the correct direction',()=>{
  const m=new IntentModel(),before=m.score('peel',features);
  assert.equal(m.learn({kind:'peel',features,success:true,reach:43,pinch:.39}),true);
  assert.ok(m.score('peel',features)>before);
  const after=m.score('peel',features);
  m.learn({kind:'peel',features,success:false});
  assert.ok(m.score('peel',features)<after);
  assert.equal(m.actions,2);assert.equal(m.successes,1);
  for(let i=0;i<100;i++)m.score('peel',features);
  assert.equal(m.actions,2,'inference must not train itself');
});
test('profiles round-trip only numeric learning state and reject malformed data',()=>{
  const m=new IntentModel();m.learn({kind:'cap',features,success:true,reach:50,pinch:.4});
  assert.deepEqual(new IntentModel(m.export()).export(),m.export());
  assert.deepEqual(new IntentModel({version:1,weights:{peel:[NaN]}}).export(),new IntentModel().export());
  assert.equal(m.learn({kind:'peel',features:[1,Infinity],success:true}),false);
  assert.equal(m.learn({kind:'unknown',features,success:true}),false);
  assert.deepEqual(Object.keys(m.export()).sort(),['version','weights','actions','successes','reachMean','reachVariance','pinchMean'].sort());
  for(let i=0;i<250;i++)m.learn({kind:'peel',features,success:true,reach:10000,pinch:99});
  assert.ok(m.settings().radius<=72);assert.ok(m.settings().pinch<=.5);
});
test('menu dwell activates once; a quick pinch clicks without holding',()=>{
  const gate=new MenuGate(),p={x:100,y:100};
  assert.equal(gate.update('a','banana',p,false,0).activate,false);
  assert.equal(gate.update('a','banana',p,false,700).activate,false);
  assert.equal(gate.update('a','banana',p,false,821).activate,true);
  assert.equal(gate.update('a','banana',p,false,3000).activate,false);
  gate.update('a','bottle',p,false,3100);
  assert.equal(gate.update('a','bottle',p,true,3160,.8).activate,true);
});
test('traversing controls, held pinches, tracking loss, and two-hand cooldown are safe',()=>{
  const gate=new MenuGate(),p={x:10,y:10};
  gate.update('a','glass',p,true,0);
  assert.equal(gate.update('a','glass',p,true,2000).activate,false);
  gate.update('a',null,p,false,2100);gate.update('a','glass',p,false,2200);
  assert.equal(gate.update('a','glass',{x:50,y:10},false,3100).activate,false);
  gate.update('b','banana',p,false,3100);
  assert.equal(gate.update('a','glass',{x:50,y:10},false,4101).activate,true);
  assert.equal(gate.update('b','banana',p,false,4101).activate,false);
  gate.update('a','resetButton',p,false,5000);
  assert.equal(gate.update('a','resetButton',p,false,6100).activate,false);
  assert.equal(gate.update('a','resetButton',p,false,6401).activate,true);
});
