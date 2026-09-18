const {test,expect}=require('@playwright/test');
test('real MediaPipe model initializes before requesting camera permission',async({page})=>{
  test.setTimeout(60000);
  await page.addInitScript(()=>{
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new Error('MODEL INITIALIZED — camera request reached');}});
  });
  await page.goto('/');await page.locator('#cameraButton').click();
  await expect(page.locator('#toast')).toContainText('MODEL INITIALIZED',{timeout:50000});
});
