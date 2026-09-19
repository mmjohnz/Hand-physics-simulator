const {defineConfig}=require('@playwright/test');
const port=Number(process.env.PLAYWRIGHT_PORT)||4173;
module.exports=defineConfig({
  testDir:'tests/browser',workers:1,timeout:30000,
  use:{baseURL:`http://127.0.0.1:${port}`,viewport:{width:1440,height:960},headless:true,launchOptions:{channel:'chrome'}},
  webServer:{command:'node server.js',url:`http://127.0.0.1:${port}`,reuseExistingServer:true,env:{...process.env,PORT:String(port)}}
});
