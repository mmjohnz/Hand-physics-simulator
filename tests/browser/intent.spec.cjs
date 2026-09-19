const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.addInitScript(()=>{
    const base=[[0,.34],[-.13,.22],[-.23,.11],[-.32,0],[-.39,-.09],[-.16,0],[-.19,-.18],[-.2,-.33],[-.21,-.45],[0,-.015],[0,-.24],[0,-.41],[0,-.55],[.14,.02],[.17,-.2],[.18,-.36],[.19,-.48],[.26,.08],[.31,-.09],[.34,-.22],[.36,-.32]];
    window.handFixture={x:350,y:220,pinch:false,visible:true};
    window.Hands=class{
      setOptions(){}onResults(cb){this.cb=cb;}async initialize(){}
      async send(){
        const f=window.handFixture;
        const points=base.map(([x,y])=>({x:1-(f.x+(x-base[8][0])*220)/innerWidth,y:(f.y+(y-base[8][1])*240)/innerHeight,z:0}));
        if(f.pinch)points[4]={x:points[8].x+.003,y:points[8].y+.003,z:0};
        this.cb({multiHandLandmarks:f.visible?[points]:[],multiHandedness:[{label:'Right'}]});
      }
    };
    window.MediaPipeVision={FilesetResolver:{forVisionTasks:async()=>({})},FaceLandmarker:{createFromOptions:async()=>({detectForVideo:()=>({faceLandmarks:[]})})}};
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>new MediaStream()});
    HTMLMediaElement.prototype.play=async()=>{};
    Object.defineProperty(HTMLMediaElement.prototype,'readyState',{get:()=>2});
  });
});
async function pointAt(page,selector,pinch=false){
  const box=await page.locator(selector).boundingBox();
  await page.evaluate(({x,y,pinch})=>Object.assign(window.handFixture,{x,y,pinch}),{x:box.x+box.width/2,y:box.y+box.height/2,pinch});
}
test('camera fingertip selects all materials with no visible learning controls',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('#cameraButton').click();
  await expect(page.locator('#cameraCount')).toHaveText('1 / 2 HANDS');
  await expect(page.locator('#forgetLearning')).toHaveCount(0);
  await pointAt(page,'[data-item="banana"]');
  await expect(page.locator('[data-item="banana"]')).toHaveClass(/selected/);
  // A stationary hand must not repeatedly reset or click the same button.
  await page.evaluate(()=>{window.clicks=0;document.querySelector('[data-item="banana"]').addEventListener('click',()=>window.clicks++);});
  await page.waitForTimeout(1200);expect(await page.evaluate(()=>window.clicks)).toBe(0);
  await pointAt(page,'[data-item="bottle"]');
  await expect(page.locator('[data-item="bottle"]')).toHaveClass(/hand-hover/);
  await page.waitForTimeout(250);
  await page.evaluate(()=>window.handFixture.pinch=true);
  await expect(page.locator('[data-item="bottle"]')).toHaveClass(/selected/);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hand-material-intent-v1')).successes)).toBeGreaterThan(0);
  const clickSuccesses=await page.evaluate(()=>JSON.parse(localStorage.getItem('hand-material-intent-v1')).successes);
  await page.waitForTimeout(700);
  // Move the pinched tracked hand onto the settled bottle body, not through DOM clicks.
  const scale=1160/1200,y=85+(960-85-40-760*scale)/2;
  await page.evaluate(p=>Object.assign(window.handFixture,p),{x:12+585*scale,y:y+580*scale,pinch:true});
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hand-material-intent-v1')).successes)).toBeGreaterThan(clickSuccesses);
  await page.screenshot({path:'.preview/intent-hold.png'});
  const learned=await page.evaluate(()=>JSON.parse(localStorage.getItem('hand-material-intent-v1')));
  await page.evaluate(()=>{window.handFixture.visible=false;});
  await expect(page.locator('#cameraCount')).toHaveText('0 / 2 HANDS');
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hand-material-intent-v1')).successes)).toBe(learned.successes);
  await page.locator('#cameraButton').click();await pointAt(page,'[data-item="bottle"]');
  await expect(page.locator('[data-item="bottle"]')).toHaveClass(/selected/);
  await pointAt(page,'[data-item="glass"]');
  await expect(page.locator('[data-item="glass"]')).toHaveClass(/selected/);
  await page.screenshot({path:'.preview/hand-menu.png'});
  expect(errors).toEqual([]);
});
test('worker failure preserves basic materials and gesture menu',async({page})=>{
  await page.addInitScript(()=>{window.Worker=class{constructor(){throw new Error('Worker disabled');}};});
  await page.goto('/');await expect(page.locator('#forgetLearning')).toHaveCount(0);
  await page.locator('#cameraButton').click();await pointAt(page,'[data-item="banana"]');
  await expect(page.locator('[data-item="banana"]')).toHaveClass(/selected/);
  await expect(page.locator('#objectStatus')).toContainText('0 / 3 peel strips removed');
});
