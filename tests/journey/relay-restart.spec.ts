import { spawn, type ChildProcess } from "node:child_process";

import { expect, test, type Browser, type TestInfo } from "@playwright/test";

import { exerciseControl } from "./control-qa";

const relayPort = 18_788;
const relayToken = "phase-1-restart-probe-token";
const appOrigin = `http://127.0.0.1:${process.env.HTML_POKER_TEST_PORT ?? "4173"}`;
let relay: ChildProcess | undefined;

test.use({ screenshot: "off", trace: "off", video: "off" });

function skipInsecureLocalRelayOnMobileWebKit(testInfo: TestInfo): void {
  test.skip(
    testInfo.project.name === "mobile-webkit",
    "This restart harness uses HTTP/WS. Hosted iPhone relay validation needs the production HTTPS/WSS fixture.",
  );
}

async function waitForRelay(): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${relayPort}/health`);
      if (response.ok) return;
    } catch {
      // Retry while the isolated service starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The isolated Connection Service did not become ready.");
}

async function startRelay(): Promise<void> {
  relay = spawn(
    process.execPath,
    ["services/connection-service/dist/server.js"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        POKER_CONNECTION_ACCESS_TOKEN: relayToken,
        POKER_CONNECTION_ALLOWED_ORIGIN: appOrigin,
        POKER_CONNECTION_HOST: "127.0.0.1",
        POKER_CONNECTION_PORT: String(relayPort),
      },
      stdio: "ignore",
    },
  );
  await waitForRelay();
}

async function stopRelay(): Promise<void> {
  const processToStop = relay;
  relay = undefined;
  if (!processToStop || processToStop.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    processToStop.once("exit", () => resolve());
    processToStop.kill("SIGTERM");
  });
}

async function configuredContext(browser: Browser) {
  const context = await browser.newContext({ bypassCSP: true });
  await context.addInitScript(
    ({ url }) => {
      const configuredGlobal = globalThis as typeof globalThis & {
        __HTML_POKER_CONFIG__?: { privateRelay: { url: string } };
      };
      configuredGlobal.__HTML_POKER_CONFIG__ = { privateRelay: { url } };
      Object.defineProperty(globalThis, "RTCPeerConnection", {
        configurable: true,
        value: undefined,
      });
    },
    { url: `ws://127.0.0.1:${relayPort}` },
  );
  return context;
}

test.afterAll(async () => stopRelay());

test("a stale invitation explains Connection Service recreation", async ({
  browser,
}, testInfo) => {
  skipInsecureLocalRelayOnMobileWebKit(testInfo);
  await startRelay();
  const hostContext = await configuredContext(browser);
  const playerContext = await configuredContext(browser);
  try {
    const host = await hostContext.newPage();
    await host.goto("/");
    await host.getByLabel("Connection Service host token").fill(relayToken);
    await host.getByRole("button", { name: "Create table" }).click();
    const invitation = await host
      .getByLabel("Player invitation link")
      .inputValue();

    await stopRelay();
    await startRelay();

    const player = await playerContext.newPage();
    await player.goto(invitation);
    await player.getByLabel("Display name").fill("Restart probe");
    await player.getByRole("button", { name: "Join table" }).click();
    await expect(player.getByRole("alert")).toHaveText(
      "No route reached the Trusted Host. This table link may be stale after the host or Connection Service restarted. Ask the Trusted Host to refresh the relay ticket and share a new link, or create a new table.",
    );

    await host.getByLabel("Connection Service host token").fill(relayToken);
    await exerciseControl(
      "relay-ticket-refresh",
      host.locator('[data-qa-control="relay-ticket-refresh"]'),
      (target) => target.click(),
      () =>
        expect(
          host.getByText("Relay ticket refreshed", { exact: true }),
        ).toBeVisible(),
    );
    const refreshedInvitation = await host
      .getByLabel("Player invitation link")
      .inputValue();
    expect(refreshedInvitation).not.toBe(invitation);

    await player.close();
    const recoveredPlayer = await playerContext.newPage();
    await recoveredPlayer.goto(refreshedInvitation);
    await recoveredPlayer.getByLabel("Display name").fill("Restart probe");
    await recoveredPlayer.getByRole("button", { name: "Join table" }).click();
    await expect(
      recoveredPlayer.getByRole("heading", { name: "You have a seat" }),
    ).toBeVisible();
  } finally {
    await Promise.all([hostContext.close(), playerContext.close()]);
  }
});
