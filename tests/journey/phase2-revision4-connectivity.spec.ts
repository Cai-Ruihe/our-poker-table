import { spawn, type ChildProcess } from "node:child_process";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const relayPort = 18_791;
const relayToken = "phase-2-revision4-test-token";
const defaultAppOrigin = `http://127.0.0.1:${process.env.HTML_POKER_TEST_PORT ?? "4173"}`;
let relay: ChildProcess | undefined;

function appOriginFor(testInfo: TestInfo): string {
  const baseURL = testInfo.project.use.baseURL;
  return baseURL ? new URL(baseURL).origin : defaultAppOrigin;
}

async function waitForRelay(): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${relayPort}/health`);
      if (response.ok) return;
    } catch {
      // The bounded readiness loop retries while the service starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The revision 4 relay did not become ready.");
}

async function startRelay(allowedOrigin: string): Promise<ChildProcess> {
  const childService = spawn(
    process.execPath,
    ["services/connection-service/dist/server.js"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        POKER_CONNECTION_ACCESS_TOKEN: relayToken,
        POKER_CONNECTION_ALLOWED_ORIGIN: allowedOrigin,
        POKER_CONNECTION_HOST: "127.0.0.1",
        POKER_CONNECTION_PORT: String(relayPort),
      },
      stdio: "ignore",
    },
  );
  await waitForRelay();
  return childService;
}

async function stopRelay(process: ChildProcess | undefined): Promise<void> {
  if (!process || process.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 2_000);
    process.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    process.kill("SIGTERM");
  });
}

async function configuredContext(
  browser: Browser,
  baseURL: string,
): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL, bypassCSP: true });
  await context.route("**/poker-config.js", (route) =>
    route.fulfill({
      body: `globalThis.__HTML_POKER_CONFIG__ = { privateRelay: { url: ${JSON.stringify(`ws://127.0.0.1:${relayPort}`)} } };`,
      contentType: "application/javascript",
    }),
  );
  await context.addInitScript(() => {
    const sockets = new Set<WebSocket>();
    const NativeWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, argumentsList) {
        const socket = Reflect.construct(target, argumentsList) as WebSocket;
        sockets.add(socket);
        socket.addEventListener("close", () => sockets.delete(socket), {
          once: true,
        });
        return socket;
      },
    });
    Object.defineProperty(globalThis, "__closeTestRelaySockets", {
      configurable: true,
      value: () => {
        for (const socket of sockets) socket.close(4000, "test transport loss");
      },
    });
  });
  return context;
}

async function createTable(host: Page, path: string): Promise<void> {
  await host.goto(path);
  await host.getByLabel("Connection Service host token").fill(relayToken);
  await host.getByRole("button", { name: "Create table" }).click();
}

test.beforeAll(async ({ browserName }, testInfo) => {
  test.skip(
    browserName === "webkit" || testInfo.project.name.includes("webkit"),
    "The local HTTP/WS relay is Chromium-only.",
  );
  relay = await startRelay(appOriginFor(testInfo));
});

test.afterAll(async () => {
  await stopRelay(relay);
});

test("healthy host polling keeps one relay socket and bounded loss recovery", async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name.includes("webkit"),
    "The local HTTP/WS relay is Chromium-only.",
  );
  test.setTimeout(60_000);
  const allowedOrigin = appOriginFor(testInfo);
  const context = await configuredContext(browser, allowedOrigin);
  const path = testInfo.project.name.startsWith("phase-release")
    ? "/multiplayer/"
    : "/";
  let socketCount = 0;
  let socketCloseCount = 0;
  let registrationCount = 0;
  try {
    const host = await context.newPage();
    host.on("websocket", (socket) => {
      socketCount += 1;
      socket.on("close", () => {
        socketCloseCount += 1;
      });
      socket.on("framereceived", ({ payload }) => {
        try {
          const message = JSON.parse(String(payload)) as {
            readonly status?: string;
            readonly type?: string;
          };
          if (message.type === "receipt" && message.status === "registered") {
            registrationCount += 1;
          }
        } catch {
          // Browser transport traces are diagnostic only.
        }
      });
    });

    await createTable(host, path);
    await expect.poll(() => registrationCount).toBe(1);

    // Three old four-second lifecycle ticks must not close or replace the
    // healthy authenticated socket.
    await host.waitForTimeout(12_500);
    expect(socketCount).toBe(1);
    expect(socketCloseCount).toBe(0);
    expect(registrationCount).toBe(1);

    // Keep the authenticated relay session alive while dropping only the
    // browser transport. Restarting the service would discard its in-memory
    // table ticket and test credential expiry instead of recovery.
    await host.evaluate(() => {
      const page = globalThis as typeof globalThis & {
        __closeTestRelaySockets?: () => void;
      };
      page.__closeTestRelaySockets?.();
    });
    await expect
      .poll(() => socketCloseCount, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(1);

    await expect
      .poll(() => registrationCount, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2);
    expect(socketCount).toBeLessThanOrEqual(3);
    expect(socketCloseCount).toBeLessThanOrEqual(2);
  } finally {
    await context.close();
  }
});
