const {test,expect}=require('@playwright/test');

function installTrackingFixtures(page){
  return page.addInitScript(()=>{
    const shape=[[0,.34],[-.13,.22],[-.23,.11],[-.32,0],[-.39,-.09],[-.16,0],[-.19,-.18],[-.2,-.33],[-.21,-.45],[0,-.015],[0,-.24],[0,-.41],[0,-.55],[.14,.02],[.17,-.2],[.18,-.36],[.19,-.48],[.26,.08],[.31,-.09],[.34,-.22],[.36,-.32]];
    window.handFixtures=[];window.mouthFixture={x:650,y:360,open:true,visible:true};
    const handAt=f=>{const tip=shape[8],nx=1-f.x/innerWidth,ny=f.y/innerHeight,flip=f.flip||1;const points=shape.map(([x,y])=>({x:nx+(x-tip[0])*.18*flip,y:ny+(y-tip[1])*.18,z:0}));if(f.pinch)points[4]={x:points[8].x+.002,y:points[8].y+.002,z:0};return points;};
    window.Hands=class{setOptions(){}onResults(cb){this.cb=cb;}async initialize(){}async send(){this.cb({multiHandLandmarks:window.handFixtures.map(handAt),multiHandedness:window.handFixtures.map((_,i)=>({label:i?'Right':'Left'}))});}};
    window.MediaPipeVision={FilesetResolver:{forVisionTasks:async()=>({})},FaceLandmarker:{createFromOptions:async()=>({detectForVideo:()=>{const f=window.mouthFixture;if(!f.visible)return {faceLandmarks:[]};const x=1-f.x/innerWidth,y=f.y/innerHeight,points=Array.from({length:468},()=>({x,y,z:0}));points[61]={x:x-.04,y,z:0};points[291]={x:x+.04,y,z:0};points[13]={x,y:y-(f.open?.009:.002),z:0};points[14]={x,y:y+(f.open?.009:.002),z:0};return {faceLandmarks:[points]};}})}};
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>new MediaStream()});HTMLMediaElement.prototype.play=async()=>{};Object.defineProperty(HTMLMediaElement.prototype,'readyState',{get:()=>2});
  });
}

test('tracked mouth appears while the mistaken virtual mouse system is gone',async({page})=>{
  await installTrackingFixtures(page);await page.goto('/');
  await expect(page.locator('#mouseIndicator')).toHaveCount(0);await expect(page.locator('#consumeZone')).toHaveCount(0);
  await page.locator('#cameraButton').click();await expect(page.locator('#trackedMouth')).toBeVisible();await expect(page.locator('#mouthStatus')).toHaveText('MOUTH OPEN');
  await expect(page.locator('#handLayer')).toHaveCSS('z-index','14');
});

test('two pinching camera hands tear a material card and Undo rebuilds it',async({page})=>{
  await installTrackingFixtures(page);await page.goto('/');await page.locator('#cameraButton').click();
  const box=await page.locator('[data-item="banana"]').boundingBox(),y=box.y+box.height/2;
  await page.evaluate(({left,right,y})=>{window.handFixtures=[{x:left,y,pinch:true},{x:right,y,pinch:true,flip:-1}];},{left:box.x+box.width*.27,right:box.x+box.width*.73,y});
  await page.waitForTimeout(350);
  await page.evaluate(({left,right,y})=>{window.handFixtures=[{x:left-95,y,pinch:true},{x:right+95,y,pinch:true,flip:-1}];},{left:box.x+box.width*.27,right:box.x+box.width*.73,y});
  await expect(page.locator('[data-item="banana"]')).toHaveClass(/torn/);await expect(page.locator('.torn-piece')).toHaveCount(2);await expect(page.locator('#undoTears')).toBeEnabled();
  await page.screenshot({path:'.preview/cards-torn.png'});
  await page.evaluate(()=>{window.handFixtures=[];});await page.locator('#undoTears').click();
  await expect(page.locator('[data-item="banana"]')).not.toHaveClass(/torn/);await expect(page.locator('.torn-piece')).toHaveCount(0);await expect(page.locator('#undoTears')).toBeDisabled();
  await page.screenshot({path:'.preview/mouth-cards.png'});
});

test('a grabbed card leaves the sidebar, crosses the stage, and stretches like rubber before tearing',async({page})=>{
  await installTrackingFixtures(page);await page.goto('/');await page.locator('#cameraButton').click();
  const box=await page.locator('[data-item="banana"]').boundingBox(),start={x:box.x+box.width/2,y:box.y+box.height/2};
  await page.evaluate(start=>{window.handFixtures=[{x:start.x,y:start.y,pinch:true}];},start);await page.waitForTimeout(250);
  await page.evaluate(y=>{window.handFixtures=[{x:650,y,pinch:true}];},start.y);
  await expect(page.locator('.floating-card')).toBeVisible();
  await expect.poll(async()=>{const b=await page.locator('.floating-card').boundingBox();return b.x+b.width/2;}).toBeLessThan(760);
  await page.evaluate(y=>{window.handFixtures=[{x:600,y,pinch:true},{x:700,y,pinch:true,flip:-1}];},start.y);await page.waitForTimeout(450);
  await page.evaluate(y=>{window.handFixtures=[{x:585,y,pinch:true},{x:715,y,pinch:true,flip:-1}];},start.y);await page.waitForTimeout(120);
  await expect(page.locator('.floating-card')).toHaveClass(/rubber-tension/);await page.screenshot({path:'.preview/free-card-rubber.png'});
  await page.evaluate(y=>{window.handFixtures=[{x:500,y,pinch:true},{x:800,y,pinch:true,flip:-1}];},start.y);
  await expect(page.locator('[data-item="banana"]')).toHaveClass(/torn/);await expect(page.locator('.torn-piece')).toHaveCount(2);
});

test('an open bottle brought to the open tracked mouth loses a real sip',async({page})=>{
  await installTrackingFixtures(page);await page.goto('/');await page.locator('[data-item="bottle"]').click();
  const scale=1160/1200,x=12,y=85+(960-85-40-760*scale)/2,move=(px,py)=>page.mouse.move(x+px*scale,y+py*scale);
  await move(585,418);await page.mouse.down();for(let i=0;i<9;i++)await page.keyboard.press('e');await page.mouse.up();
  await expect(page.locator('#objectStatus')).toContainText('cap removed');await page.locator('#cameraButton').click();await expect(page.locator('#mouthStatus')).toHaveText('MOUTH OPEN');
  await page.evaluate(()=>{window.mouthFixture={x:650,y:360,open:true,visible:true};window.handFixtures=[{x:577,y:681,pinch:true}];});await page.waitForTimeout(450);
  await page.evaluate(()=>{window.handFixtures=[{x:650,y:493,pinch:true}];});
  await expect(page.locator('#objectStatus')).toContainText('90 ml drunk',{timeout:5000});await expect(page.locator('#objectStatus')).toContainText('410 / 500 ml');
});
