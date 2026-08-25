import { spawn, type ChildProcess } from "node:child_process";
import { request as httpRequest } from "node:http";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { exerciseControl } from "./control-qa";

const relayPort = 18_787;
const macRelayPort = 18_789;
const relayToken = "phase-1-test-operator-token";
const appOrigin = `http://127.0.0.1:${process.env.HTML_POKER_TEST_PORT ?? "4173"}`;
let relay: ChildProcess | undefined;
let macRelay: ChildProcess | undefined;

test.describe.configure({ mode: "serial" });

function dataUrlFile(source: string, name: string) {
  const match = /^data:image\/png;base64,(.+)$/u.exec(source);
  if (!match?.[1]) throw new Error("Expected an inlined QR PNG.");
  return {
    buffer: Buffer.from(match[1], "base64"),
    mimeType: "image/png",
    name,
  };
}

async function waitForRelay(port: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // The bounded readiness loop retries while the service starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The test Connection Service did not become ready.");
}

async function startRelay(port: number): Promise<ChildProcess> {
  const relayProcess = spawn(
    process.execPath,
    ["services/connection-service/dist/server.js"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        POKER_CONNECTION_ACCESS_TOKEN: relayToken,
        POKER_CONNECTION_ALLOWED_ORIGIN: appOrigin,
        POKER_CONNECTION_HOST: "127.0.0.1",
        POKER_CONNECTION_PORT: String(port),
      },
      stdio: "ignore",
    },
  );
  await waitForRelay(port);
  return relayProcess;
}

async function stopRelay(
  relayProcess: ChildProcess | undefined,
): Promise<void> {
  if (!relayProcess || relayProcess.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 2_000);
    relayProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    relayProcess.kill("SIGTERM");
  });
}

async function rejectedWebSocketUpgrade(
  origin: string | undefined = "https://untrusted.example.invalid",
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      headers: {
        connection: "Upgrade",
        ...(origin ? { origin } : {}),
        "sec-websocket-key": Buffer.alloc(16, 7).toString("base64"),
        "sec-websocket-version": "13",
        upgrade: "websocket",
      },
      host: "127.0.0.1",
      method: "GET",
      path: "/",
      port: relayPort,
    });
    request.once("response", (response) => resolve(response.statusCode));
    request.once("upgrade", () => resolve(101));
    request.once("error", reject);
    request.end();
  });
}

async function preflightMethods(): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      headers: {
        "access-control-request-headers": "authorization, content-type",
        "access-control-request-method": "POST",
        origin: appOrigin,
      },
      host: "127.0.0.1",
      method: "OPTIONS",
      path: "/v1/table-sessions",
      port: relayPort,
    });
    request.once("response", (response) => {
      response.resume();
      resolve(response.headers["access-control-allow-methods"]);
    });
    request.once("error", reject);
    request.end();
  });
}

function skipInsecureLocalRelayOnMobileWebKit(testInfo: TestInfo): void {
  test.skip(
    testInfo.project.name === "mobile-webkit",
    "This local harness uses HTTP/WS. The production CSP correctly permits only HTTPS/WSS; direct WebRTC and hosted relay verification run in Chromium until a trusted TLS fixture is available.",
  );
}

async function configuredContext(
  browser: Browser,
  disableDirectWebRtc = false,
  relayUrls: {
    readonly cloudUrl?: string;
    readonly macUrl?: string;
  } = { macUrl: `ws://127.0.0.1:${relayPort}` },
): Promise<BrowserContext> {
  const context = await browser.newContext({ bypassCSP: true });
  await context.addInitScript(
    ({ cloudUrl, disableDirect, macUrl }) => {
      const configuredGlobal = globalThis as typeof globalThis & {
        __HTML_POKER_CONFIG__?: {
          cloudRelay?: { url: string };
          privateRelay?: { url: string };
        };
      };
      configuredGlobal.__HTML_POKER_CONFIG__ = {
        ...(cloudUrl ? { cloudRelay: { url: cloudUrl } } : {}),
        ...(macUrl ? { privateRelay: { url: macUrl } } : {}),
      };
      if (disableDirect) {
        Object.defineProperty(globalThis, "RTCPeerConnection", {
          configurable: true,
          value: undefined,
        });
      }
    },
    {
      disableDirect: disableDirectWebRtc,
      cloudUrl: relayUrls.cloudUrl,
      macUrl: relayUrls.macUrl,
    },
  );
  return context;
}

async function createConfiguredTable(host: Page): Promise<void> {
  await host.goto("/");
  await host.getByLabel("Connection Service host token").fill(relayToken);
  await host.getByRole("button", { name: "Create table" }).click();
}

async function joinPlayer(
  host: Page,
  context: BrowserContext,
  name: string,
): Promise<Page> {
  const link = await host.getByLabel("Player invitation link").inputValue();
  const player = await context.newPage();
  await player.goto(link);
  await player.getByLabel("Display name").fill(name);
  await player.getByRole("button", { name: "Join table" }).click();
  await expect(
    player.getByRole("heading", { name: "You have a seat" }),
  ).toBeVisible();
  return player;
}

test.beforeAll(async ({ browserName }, testInfo) => {
  void browserName;
  if (testInfo.project.name === "mobile-webkit") return;
  relay = await startRelay(relayPort);
  macRelay = await startRelay(macRelayPort);
});

test.afterAll(async () => {
  await Promise.all([stopRelay(relay), stopRelay(macRelay)]);
});

test("the configured Connection Service rejects a different WebSocket origin", async ({
  browserName,
}, testInfo) => {
  void browserName;
  skipInsecureLocalRelayOnMobileWebKit(testInfo);
  await expect(rejectedWebSocketUpgrade()).resolves.toBe(403);
  await expect(rejectedWebSocketUpgrade(undefined)).resolves.toBe(403);
});

test("the Connection Service allows its POST ticket preflight", async ({
  browserName,
}, testInfo) => {
  void browserName;
  skipInsecureLocalRelayOnMobileWebKit(testInfo);
  await expect(preflightMethods()).resolves.toContain("POST");
});

test("an unreachable Connection Service produces actionable host guidance", async ({
  browser,
}, testInfo) => {
  skipInsecureLocalRelayOnMobileWebKit(testInfo);
  const context = await browser.newContext({ bypassCSP: true });
  await context.addInitScript(() => {
    const configuredGlobal = globalThis as typeof globalThis & {
      __HTML_POKER_CONFIG__?: { privateRelay: { url: string } };
    };
    configuredGlobal.__HTML_POKER_CONFIG__ = {
      privateRelay: { url: "ws://127.0.0.1:18786" },
    };
  });
  try {
    const host = await context.newPage();
    await host.goto("/");
    await host.getByLabel("Connection Service host token").fill(relayToken);
    await host.getByRole("button", { name: "Create table" }).click();
    await expect(host.getByRole("alert")).toHaveText(
      "The Connection Service is unreachable. Normal Mode needs its relay online. Ask the table owner to restore it, or use Airplane Mode.",
    );
  } finally {
    await context.close();
  }
});

test("an expired relay ticket is rejected before the browser opens a client connection", async ({
  page,
}) => {
  let websocketOpened = false;
  page.on("websocket", () => {
    websocketOpened = true;
  });
  const parameters = new URLSearchParams({
    build: "0.1.0-phase1",
    host: "host-key-a",
    join: "one-use-invitation-token",
    protocol: "1",
    "relay-expires": String(Date.now() - 1),
    "relay-route": "private-relay",
    "relay-token": "scoped-relay-ticket",
    "relay-url": "wss://relay.example.test/v1/relay",
    role: "player",
    table: "table-a",
  });

  await page.goto(`/#${parameters.toString()}`);

  await expect(
    page.getByRole("heading", { name: "Create a table" }),
  ).toBeVisible();
  expect(websocketOpened).toBe(false);
});

test("a host can renew its table-scoped relay ticket without exposing the operator token", async ({
  browser,
}, testInfo) => {
  skipInsecureLocalRelayOnMobileWebKit(testInfo);
  const hostContext = await configuredContext(browser);
  const aliceContext = await configuredContext(browser);
  try {
    const host = await hostContext.newPage();
    await createConfiguredTable(host);
    await joinPlayer(host, aliceContext, "Alice");

    await host.getByLabel("Connection Service host token").fill(relayToken);
    await host.getByRole("button", { name: "Refresh relay ticket" }).click();
    await expect(
      host.getByText("Relay ticket refreshed", { exact: true }),
    ).toBeVisible();
    await expect(host.getByLabel("Player invitation link")).not.toHaveValue(
      new RegExp(relayToken),
    );
  } finally {
    await Promise.all([hostContext.close(), aliceContext.close()]);
  }
});

test("isolated devices prefer a direct WebRTC channel after private signaling", async ({
  browser,
}, testInfo) => {
  skipInsecureLocalRelayOnMobileWebKit(testInfo);
  const hostContext = await configuredContext(browser);
  const aliceContext = await configuredContext(browser);
  const bobContext = await configuredContext(browser);
  try {
    const host = await hostContext.newPage();
    await createConfiguredTable(host);
    const alice = await joinPlayer(host, aliceContext, "Alice");
    const bob = await joinPlayer(host, bobContext, "Bob");

    await host.getByRole("button", { name: "Deal first hand" }).click();
    await expect(
      alice.getByRole("region", { name: "Your cards" }),
    ).toBeVisible();
    await expect(bob.getByRole("region", { name: "Your cards" })).toBeVisible();
    // Normal player surfaces intentionally expose the user-facing seat state
    // rather than the transport implementation. "Playing" proves the
    // private channel is connected; the relay/WebRTC mechanism is an
    // implementation detail and should not be a UI contract.
    for (const player of [alice, bob]) {
      const status = player.getByRole("region", { name: "Your table status" });
      await expect(status).toContainText("Playing");
      await expect(
        status.getByRole("img", { name: "Your table state: Playing" }),
      ).toBeVisible();
    }
    await expect(alice.locator("[data-private-card]")).toHaveCount(2);
    await expect(bob.locator("[data-private-card]")).toHaveCount(2);

    await host.getByRole("button", { name: "Deal the flop" }).click();
    await expect(alice.locator("[data-board-card]")).toHaveCount(3);
    await expect(bob.locator("[data-board-card]")).toHaveCount(3);
    await expect(host.locator("[data-private-card]")).toHaveCount(0);
  } finally {
    await Promise.all([
      hostContext.close(),
      aliceContext.close(),
      bobContext.close(),
    ]);
  }
});

test("isolated devices fall back to the operator private relay when direct WebRTC is unavailable", async ({
  browser,
}, testInfo) => {
  skipInsecureLocalRelayOnMobileWebKit(testInfo);
  const hostContext = await configuredContext(browser, true);
  const aliceContext = await configuredContext(browser, true);
  const bobContext = await configuredContext(browser, true);
  try {
    const host = await hostContext.newPage();
    await createConfiguredTable(host);
    const alice = await joinPlayer(host, aliceContext, "Alice");
    const bob = await joinPlayer(host, bobContext, "Bob");

    await host.getByRole("button", { name: "Deal first hand" }).click();
    await expect(
      alice.getByRole("region", { name: "Your cards" }),
    ).toBeVisible();
    await expect(bob.getByRole("region", { name: "Your cards" })).toBeVisible();
    // The fallback remains a transport assertion through this deliberately
    // relay-only context. Player UI exposes the user-facing seat state rather
    // than implementation names such as "Private relay".
    for (const player of [alice, bob]) {
      const status = player.getByRole("region", { name: "Your table status" });
      await expect(status).toContainText("Playing");
      await expect(
        status.getByRole("img", { name: "Your table state: Playing" }),
      ).toBeVisible();
      await expect(player.locator("[data-private-card]")).toHaveCount(2);
    }
  } finally {
    await Promise.all([
      hostContext.close(),
      aliceContext.close(),
      bobContext.close(),
    ]);
  }
});

test("dual relay invitations carry Cloudflare first and Mac fallback tickets", async ({
  browser,
}, testInfo) => {
  skipInsecureLocalRelayOnMobileWebKit(testInfo);
  const relayUrls = {
    cloudUrl: `ws://127.0.0.1:${relayPort}`,
    macUrl: `ws://127.0.0.1:${macRelayPort}`,
  };
  const hostContext = await configuredContext(browser, true, relayUrls);
  const playerContext = await configuredContext(browser, true, relayUrls);
  try {
    const host = await hostContext.newPage();
    await createConfiguredTable(host);
    const invitation = await host
      .getByLabel("Player invitation link")
      .inputValue();
    const parameters = new URL(invitation).hash.slice(1);
    const parsed = new URLSearchParams(parameters);
    expect(parsed.get("cloud-relay-url")).toBe(`ws://127.0.0.1:${relayPort}`);
    expect(parsed.get("cloud-relay-token")).toBeTruthy();
    expect(parsed.get("private-relay-url")).toBe(
      `ws://127.0.0.1:${macRelayPort}`,
    );
    expect(parsed.get("private-relay-token")).toBeTruthy();

    const player = await playerContext.newPage();
    await player.goto(invitation);
    await player.getByLabel("Display name").fill("Dual relay probe");
    await player.getByRole("button", { name: "Join table" }).click();
    await expect(
      player.getByRole("heading", { name: "You have a seat" }),
    ).toBeVisible();
  } finally {
    await Promise.all([hostContext.close(), playerContext.close()]);
  }
});

test("a relay-only player continues through Mac after Cloudflare fails", async ({
  browser,
}, testInfo) => {
  skipInsecureLocalRelayOnMobileWebKit(testInfo);
  const relayUrls = {
    cloudUrl: `ws://127.0.0.1:${relayPort}`,
    macUrl: `ws://127.0.0.1:${macRelayPort}`,
  };
  const hostContext = await configuredContext(browser, true, relayUrls);
  const playerContext = await configuredContext(browser, true, relayUrls);
  const secondPlayerContext = await configuredContext(browser, true, relayUrls);
  let cloudStopped = false;
  try {
    const host = await hostContext.newPage();
    await createConfiguredTable(host);
    const player = await joinPlayer(host, playerContext, "Failover player");
    await joinPlayer(host, secondPlayerContext, "Failover partner");
    await host.getByRole("button", { name: "Deal first hand" }).click();
    await expect(player.locator("[data-private-card]")).toHaveCount(2);

    await stopRelay(relay);
    relay = undefined;
    cloudStopped = true;
    await player.getByRole("button", { name: "Fold" }).click();
    await host.getByRole("button", { name: "Deal the flop" }).click();
    await expect(player.locator("[data-board-card]")).toHaveCount(3);
  } finally {
    await Promise.all([
      hostContext.close(),
      playerContext.close(),
      secondPlayerContext.close(),
    ]);
    if (cloudStopped) relay = await startRelay(relayPort);
  }
});

test("the host sends a state change through Mac after Cloudflare fails", async ({
  browser,
}, testInfo) => {
  skipInsecureLocalRelayOnMobileWebKit(testInfo);
  const relayUrls = {
    cloudUrl: `ws://127.0.0.1:${relayPort}`,
    macUrl: `ws://127.0.0.1:${macRelayPort}`,
  };
  const hostContext = await configuredContext(browser, true, relayUrls);
  const playerContext = await configuredContext(browser, true, relayUrls);
  const secondPlayerContext = await configuredContext(browser, true, relayUrls);
  let cloudStopped = false;
  try {
    const host = await hostContext.newPage();
    await createConfiguredTable(host);
    const player = await joinPlayer(
      host,
      playerContext,
      "Host failover player",
    );
    await joinPlayer(host, secondPlayerContext, "Host failover partner");
    await host.getByRole("button", { name: "Deal first hand" }).click();
    await expect(player.locator("[data-private-card]")).toHaveCount(2);

    await stopRelay(relay);
    relay = undefined;
    cloudStopped = true;
    await host.getByRole("button", { name: "Deal the flop" }).click();
    await expect(player.locator("[data-board-card]")).toHaveCount(3);
  } finally {
    await Promise.all([
      hostContext.close(),
      playerContext.close(),
      secondPlayerContext.close(),
    ]);
    if (cloudStopped) relay = await startRelay(relayPort);
  }
});

test("a Tablet surface catches up automatically after its browser returns online", async ({
  browser,
}, testInfo) => {
  skipInsecureLocalRelayOnMobileWebKit(testInfo);
  const hostContext = await configuredContext(browser, true);
  const aliceContext = await configuredContext(browser, true);
  const bobContext = await configuredContext(browser, true);
  const tabletContext = await configuredContext(browser, true);
  try {
    const host = await hostContext.newPage();
    await createConfiguredTable(host);
    await joinPlayer(host, aliceContext, "Alice");
    await joinPlayer(host, bobContext, "Bob");
    await host.getByRole("button", { name: "Deal first hand" }).click();
    await host.getByRole("button", { name: /^Players/ }).click();
    await host
      .getByRole("button", { name: "Create Tablet Control link" })
      .click();
    const tabletInvitation = await host
      .getByLabel("Tablet Control invitation link")
      .inputValue();
    const tablet = await tabletContext.newPage();
    await tablet.goto(tabletInvitation);
    await expect(tablet.locator("[data-table-corner]")).toHaveCount(4);
    await expect(tablet.locator(".table-surface")).toHaveAttribute(
      "data-theme",
      "dark-green",
    );

    await tabletContext.setOffline(true);
    await tablet.waitForTimeout(150);
    await host.getByRole("button", { name: "Black Gold" }).click();
    await tabletContext.setOffline(false);
    await tablet.evaluate(() => {
      globalThis.dispatchEvent(new Event("online"));
      globalThis.dispatchEvent(new Event("pageshow"));
    });

    await expect(tablet.locator(".table-surface")).toHaveAttribute(
      "data-theme",
      "black-gold",
    );
  } finally {
    await Promise.all([
      hostContext.close(),
      aliceContext.close(),
      bobContext.close(),
      tabletContext.close(),
    ]);
  }
});

test("an unpaired Normal TV receives its requested role only after host scan-pairing", async ({
  browser,
}, testInfo) => {
  skipInsecureLocalRelayOnMobileWebKit(testInfo);
  const hostContext = await configuredContext(browser);
  const tvContext = await configuredContext(browser);
  try {
    const host = await hostContext.newPage();
    const tv = await tvContext.newPage();
    await createConfiguredTable(host);
    await tv.goto("/");
    await exerciseControl(
      "home-pair-display",
      tv.locator('[data-qa-control="home-pair-display"]'),
      (target) => target.click(),
      () =>
        expect(tv.locator('[data-qa-control="display-pair-tv"]')).toBeVisible(),
    );
    await exerciseControl(
      "display-pair-cancel",
      tv.locator('[data-qa-control="display-pair-cancel"]'),
      (target) => target.click(),
      () =>
        expect(
          tv.getByRole("heading", { name: "Create a table" }),
        ).toBeVisible(),
    );
    await tv.locator('[data-qa-control="home-pair-display"]').click();
    await exerciseControl(
      "display-pair-public",
      tv.locator('[data-qa-control="display-pair-public"]'),
      (target) => target.click(),
      () =>
        expect(
          tv.getByAltText("Public Table display pairing QR code"),
        ).toBeVisible(),
    );
    await tv.goto("/");
    await tv.locator('[data-qa-control="home-pair-display"]').click();
    await exerciseControl(
      "display-pair-tv",
      tv.locator('[data-qa-control="display-pair-tv"]'),
      (target) => target.click(),
      () => expect(tv.getByAltText("TV display pairing QR code")).toBeVisible(),
    );
    const requestSource = await tv
      .getByAltText("TV display pairing QR code")
      .getAttribute("src");
    if (!requestSource) throw new Error("The display pairing QR is missing.");
    await expect
      .poll(() =>
        tv
          .getByAltText("TV display pairing QR code")
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(1_024);
    await expect(
      tv.getByText("Waiting for the host scan", { exact: true }),
    ).toBeVisible();
    await expect(tv.getByLabel("Dealer controls")).toHaveCount(0);

    await exerciseControl(
      "normal-display-pair-file",
      host.locator('[data-qa-control="normal-display-pair-file"]'),
      (target) =>
        target.setInputFiles(
          dataUrlFile(requestSource, "tv-pairing-request.png"),
        ),
      () =>
        expect(host.getByText("TV paired", { exact: true })).toBeVisible({
          timeout: 15_000,
        }),
    );
    await expect(
      tv.getByText("Connecting to the table", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(tv.getByLabel("Dealer controls")).toHaveCount(0);
  } finally {
    await Promise.all([hostContext.close(), tvContext.close()]);
  }
});
