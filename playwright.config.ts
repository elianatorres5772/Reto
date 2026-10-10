import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e', testMatch:'**/*.spec.ts', fullyParallel:true,
  forbidOnly:!!process.env.CI, retries:process.env.CI?1:0, workers:2,
  timeout:30000, expect:{timeout:5000},
  reporter:[['list'],['html',{open:'never'}]],
  outputDir:'test-results',
  use:{baseURL:'http://127.0.0.1:3102',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome'],launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}}}],
  webServer:[
    {command:'tsx tests/e2e/server.ts original',url:'http://127.0.0.1:3101/api/health',reuseExistingServer:false,timeout:30000},
    {command:'tsx tests/e2e/server.ts prepared',url:'http://127.0.0.1:3102/api/health',reuseExistingServer:false,timeout:30000}
  ]
});
