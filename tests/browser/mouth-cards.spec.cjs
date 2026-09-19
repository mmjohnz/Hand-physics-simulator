const {test,expect}=require('@playwright/test');

function installTrackingFixtures(page){
  return page.addInitScript(()=>{
    const shape=[[0,.34],[-.13,.22],[-.23,.11],[-.32,0],[-.39,-.09],[-.16,0],[-.19,-.18],[-.2,-.33],[-.21,-.45],[0,-.015],[0,-.24],[0,-.41],[0,-.55],[.14,.02],[.17,-.2],[.18,-.36],[.19,-.48],[.26,.08],[.31,-.09],[.34,-.22],[.36,-.32]];
    window.handFixtures=[];
    const handAt=f=>{const tip=shape[8],nx=1-f.x/innerWidth,ny=f.y/innerHeight,flip=f.flip||1;const points=shape.map(([x,y])=>({x:nx+(x-tip[0])*.18*flip,y:ny+(y-tip[1])*.18,z:0}));if(f.pinch)points[4]={x:points[8].x+.002,y:points[8].y+.002,z:0};return points;};
    window.Hands=class{setOptions(){}onResults(cb){this.cb=cb;}async initialize(){}async send(){this.cb({multiHandLandmarks:window.handFixtures.map(handAt),multiHandedness:window.handFixtures.map((_,i)=>({label:i?'Right':'Left'}))});}};
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>new MediaStream()});HTMLMediaElement.prototype.play=async()=>{};Object.defineProperty(HTMLMediaElement.prototype,'readyState',{get:()=>2});
  });
}

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
  await page.screenshot({path:'.preview/hand-cards.png'});
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

