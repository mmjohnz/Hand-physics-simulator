const {test,expect}=require('@playwright/test');
test('real MediaPipe model initializes before requesting camera permission',async({page})=>{
  test.setTimeout(60000);
  await page.addInitScript(()=>{
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new Error('MODEL INITIALIZED — camera request reached');}});
  });
  await page.goto('/');await page.locator('#cameraButton').click();
  await expect(page.locator('#toast')).toContainText('MODEL INITIALIZED',{timeout:50000});
});
test('real on-device Face Landmarker initializes for mouth tracking',async({page})=>{
  test.setTimeout(60000);
  await page.addInitScript(()=>{
    window.Hands=class{setOptions(){}onResults(cb){this.cb=cb;}async initialize(){}async send(){this.cb({multiHandLandmarks:[]});}};
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>new MediaStream()});HTMLMediaElement.prototype.play=async()=>{};Object.defineProperty(HTMLMediaElement.prototype,'readyState',{get:()=>2});
  });
  await page.goto('/');await page.locator('#cameraButton').click();
  await expect(page.locator('#trackedMouth')).toHaveAttribute('data-model','ready',{timeout:50000});
  expect(await page.evaluate(()=>document.querySelector('#trackedMouth').dataset.model)).toBe('ready');
});

test('real hand and face runtimes initialize together without colliding',async({page})=>{
  test.setTimeout(60000);const errors=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(()=>{
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>new MediaStream()});HTMLMediaElement.prototype.play=async()=>{};Object.defineProperty(HTMLMediaElement.prototype,'readyState',{get:()=>0});
  });
  await page.goto('/');await page.locator('#cameraButton').click();
  await expect.poll(()=>page.locator('#trackedMouth').getAttribute('data-model'),{timeout:50000}).not.toBe(null);
  if(await page.locator('#trackedMouth').getAttribute('data-model')==='error')throw new Error('Combined runtime console: '+errors.join(' | '));
  await expect(page.locator('#trackedMouth')).toHaveAttribute('data-model','ready',{timeout:50000});
  expect(errors.filter(message=>/Aborted|Mouth tracker failed/.test(message))).toEqual([]);
});
