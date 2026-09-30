import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',testMatch:'**/*.spec.ts',workers:1,timeout:180000,
 use:{baseURL:process.env.RACETRACK_TEST_URL??'http://127.0.0.1:5190',browserName:'chromium',channel:'chrome'},
});
