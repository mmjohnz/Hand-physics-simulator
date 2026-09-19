const {test,expect}=require('@playwright/test');
test('animated MMZ intro presents the simulator and clears automatically',async({page})=>{
  await page.goto('/');await expect(page.locator('.intro-title')).toContainText('HANDPHYSICSSIMULATOR');await expect(page.locator('.intro-credit')).toHaveText('MADE BY MMZ');
  await page.waitForTimeout(1100);await page.screenshot({path:'.preview/intro-mmz.png'});await expect(page.locator('.intro-screen')).toBeHidden({timeout:5000});
});
test('mouse can unscrew, lift, invert and partially empty the bottle',async({page})=>{
  await page.goto('/');await page.locator('[data-item="bottle"]').click();
  await page.waitForTimeout(1100);
  const scale=1160/1200,x=12,y=85+(960-85-40-760*scale)/2;
  const move=(px,py)=>page.mouse.move(x+px*scale,y+py*scale);
  await move(585,418);await page.mouse.down();
  for(let i=0;i<9;i++)await page.keyboard.press('e');
  await expect(page.locator('#objectStatus')).toContainText('cap removed');
  await move(760,390);await page.mouse.up();
  await move(585,580);await page.mouse.down();await move(570,355);await page.waitForTimeout(500);
  await expect(page.locator('#objectStatus')).toContainText('500 / 500 ml');
  for(let i=0;i<14;i++)await page.keyboard.press('e');
  await page.waitForTimeout(1800);
  const amount=Number((await page.locator('#objectStatus').textContent()).split(' / ')[0]);
  expect(amount).toBeGreaterThan(0);expect(amount).toBeLessThan(490);
  await page.screenshot({path:'.preview/pouring.png'});await page.mouse.up();
});
test('all three materials render; pane shatters through pointer input; mobile controls fit',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Fragile by nature.');
  // Convert logical stage position using the same documented 1200x760 viewport fit.
  const width=1440,height=960,scale=Math.min((width-256-24)/1200,(height-85-40)/760);
  const x=(width-256-1200*scale)/2,y=85+(height-85-40-760*scale)/2;
  await page.screenshot({path:'.preview/glass.png'});
  await page.mouse.click(x+590*scale,y+373*scale);
  await expect(page.locator('#objectStatus')).toContainText('physical shards');
  await page.waitForTimeout(600);await page.screenshot({path:'.preview/shattered.png'});
  await page.locator('[data-item="banana"]').click();
  await expect(page.locator('#objectStatus')).toContainText('0 / 3 peel strips removed');
  await page.waitForTimeout(800);await page.screenshot({path:'.preview/banana.png'});
  await page.locator('[data-item="bottle"]').click();
  await expect(page.locator('#objectStatus')).toContainText('500 / 500 ml');
  await page.waitForTimeout(600);await page.screenshot({path:'.preview/bottle.png'});
  await page.locator('#resetButton').click();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'.preview/mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  for(const selector of ['#cameraButton','#resetButton','#undoTears','[data-item="glass"]','[data-item="banana"]','[data-item="bottle"]']){
    const bounds=await page.locator(selector).boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(391);
  }
  expect(errors).toEqual([]);
});

test('two synthetic tracked hands produce articulated natural hands without runtime errors',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const base=[[0,.34],[-.13,.22],[-.23,.11],[-.32,0],[-.39,-.09],[-.16,0],[-.19,-.18],[-.2,-.33],[-.21,-.45],[0,-.015],[0,-.24],[0,-.41],[0,-.55],[.14,.02],[.17,-.2],[.18,-.36],[.19,-.48],[.26,.08],[.31,-.09],[.34,-.22],[.36,-.32]];
    const hand=(x,flip)=>base.map(([a,b])=>({x:x+a*.3*flip,y:.44+b*.42,z:0}));
    window.Hands=class {
      setOptions(o){window.trackerOptions=o;}onResults(cb){this.cb=cb;}async initialize(){}
      async send(){this.cb({multiHandLandmarks:[hand(.28,1),hand(.72,-1)],multiHandedness:[{label:'Left'},{label:'Right'}]});}
    };
    window.MediaPipeVision={FilesetResolver:{forVisionTasks:async()=>({})}};
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>new MediaStream()});
    HTMLMediaElement.prototype.play=async()=>{};
    Object.defineProperty(HTMLMediaElement.prototype,'readyState',{get:()=>2});
  });
  await page.goto('/');await page.locator('#cameraButton').click();
  await expect(page.locator('#cameraCount')).toHaveText('2 / 2 HANDS');
  expect(await page.evaluate(()=>window.trackerOptions.maxNumHands)).toBe(2);
  await page.waitForTimeout(1000);await page.screenshot({path:'.preview/hands.png'});
  await page.locator('#cameraButton').click();await expect(page.locator('#cameraCount')).toHaveText('0 / 2 HANDS');
  expect(errors).toEqual([]);
});
