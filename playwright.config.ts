import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const testPort = Number(process.env.HTML_POKER_TEST_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      // Geometry and semantic checks remain exact. Darwin and Linux use
      // separate reviewed Chromium baselines; this narrow tolerance absorbs
      // only subpixel antialiasing inside the same platform baseline.
      maxDiffPixelRatio: 0.001,
      threshold: 0.2,
    },
  },
  fullyParallel: true,
  outputDir: "test-results/playwright",
  ...(process.env.HTML_POKER_PRESERVE_OUTPUT === "1"
    ? { preserveOutput: "always" as const }
    : {}),
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  snapshotPathTemplate: `{testDir}/{testFilePath}-snapshots/{arg}-${process.platform}-{projectName}{ext}`,
  testDir: "tests",
  testMatch: ["journey/**/*.spec.ts", "security/**/*.spec.ts"],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm build && pnpm --filter @html-poker/web preview --host 127.0.0.1 --port ${testPort}`,
    // Reusing an arbitrary process on this port can make QA validate a stale
    // build. Opt-in reuse is allowed for interactive development only; release
    // and default local runs always start and therefore identify the candidate.
    reuseExistingServer: process.env.HTML_POKER_REUSE_SERVER === "1",
    stderr: "pipe",
    stdout: "pipe",
    timeout: 30_000,
    url: baseURL,
  },
  // Serialize hardware-sensitive WebRTC/QR journeys and revision assertions.
  // The suite is small enough that deterministic scheduling is preferable to
  // parallel resource contention on both laptops and shared CI runners.
  workers: 1,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 15"] } },
  ],
});
