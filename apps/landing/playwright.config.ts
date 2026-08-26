import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.HTML_POKER_LANDING_TEST_PORT ?? 4181);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  expect: { timeout: 5_000 },
  fullyParallel: true,
  outputDir: "../../test-results/landing",
  reporter: [["list"]],
  testDir: "../../tests/landing",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm --dir ../.. build:table-side && pnpm --dir ../.. build:airplane && pnpm build && HTML_POKER_LANDING_TEST_PORT=${port} pnpm preview:test`,
    reuseExistingServer: false,
    timeout: 30_000,
    url: `${baseURL}/intro/`,
  },
  workers: 1,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 15"] } },
  ],
});
