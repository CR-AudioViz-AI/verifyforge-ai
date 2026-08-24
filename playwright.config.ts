import { defineConfig, devices } from '@playwright/test';

/**
 * Henderson Standards E2E Configuration
 * 
 * This configuration ensures all CR AudioViz AI apps meet:
 * - Mobile-first design (375px viewport)
 * - 44px tap targets
 * - No horizontal scroll
 * - Brand color compliance
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60000,
  
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  // Start the app before the tests run. Without this, every page.goto('/') hit a
  // dead localhost:3000 and the suite failed at connection, not on a real
  // compliance issue. reuseExistingServer lets a local dev server be used when
  // present; CI always starts its own.
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  
  projects: [
    // Desktop - Standard viewport
    {
      name: 'desktop',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    // Mobile - Henderson Standards requirement
    {
      name: 'mobile',
      use: { 
        ...devices['iPhone 13'],
        viewport: { width: 375, height: 812 },
      },
    },
  ],
});
