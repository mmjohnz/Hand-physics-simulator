const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'tests/browser',workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1440,height:960},headless:true,launchOptions:{channel:'chrome'}},
  webServer:{command:'node server.js',url:'http://127.0.0.1:4173',reuseExistingServer:true}
});
