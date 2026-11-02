import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4321' },
  webServer: [
    {
      command: 'npm run build && npm run preview -- --port 4321',
      url: 'http://localhost:4321',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // the same site built as a preview (PUBLIC_PHOENIX_VOICE is "true" there), for tests/voice.spec.ts
      command: 'CF_PAGES_BRANCH=voice-test npx astro build --outDir dist-voice && npx astro preview --outDir dist-voice --port 4322',
      url: 'http://localhost:4322',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      testIgnore: /voice-ios\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } },
    },
    {
      // WebKit on an iPhone 15 profile: only the iOS audio checks (the preview-mode build on :4322)
      name: 'webkit-iphone',
      testMatch: /voice-ios\.spec\.ts/,
      use: { ...devices['iPhone 15'], baseURL: 'http://localhost:4322' },
    },
  ],
});
