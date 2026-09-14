import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/journey",
  testMatch: [
    "phase2-preview.spec.ts",
    "phase2-history.spec.ts",
    "phase2-corner-parity.spec.ts",
  ],
  outputDir: "test-results/phase-release",
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:4174",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm --filter @html-poker/web exec vite preview --outDir ../../_site --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174/multiplayer/",
    reuseExistingServer: false,
  },
  projects: [
    { name: "phase-release-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "phase-release-mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "phase-release-mobile-webkit", use: { ...devices["iPhone 15"] } },
  ],
});
