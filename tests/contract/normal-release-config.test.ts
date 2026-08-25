import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { runInNewContext } from "node:vm";

import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const roots: string[] = [];
const configureScript = path.join(
  process.cwd(),
  "tools",
  "release",
  "configure-normal.mjs",
);
const baselineCsp =
  "connect-src 'self' https: wss:; font-src 'self'; form-action 'self'; img-src 'self' data: blob:;";
const cloudRelayWranglerConfig = path.join(
  process.cwd(),
  "services",
  "cloudflare-connection-service",
  "wrangler.toml",
);

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "html-poker-normal-config-"));
  roots.push(root);
  const normal = path.join(root, "dist", "normal");
  await mkdir(normal, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(normal, "index.html"),
      `<meta http-equiv="Content-Security-Policy" content="${baselineCsp}">`,
      "utf8",
    ),
    writeFile(
      path.join(normal, "poker-config.js"),
      "globalThis.__HTML_POKER_CONFIG__ ??= {};\n",
      "utf8",
    ),
  ]);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("Normal release configuration", () => {
  it("explicitly enables the public workers.dev endpoint for the Cloudflare relay", async () => {
    const wranglerConfig = await readFile(cloudRelayWranglerConfig, "utf8");

    expect(wranglerConfig).toMatch(/^workers_dev\s*=\s*true$/m);
  });

  it("keeps an unconfigured open-source deployment free of private relay routing", async () => {
    const root = await fixture();

    await execute(process.execPath, [configureScript], {
      cwd: root,
      env: {
        ...process.env,
        NORMAL_CONNECTION_SERVICE_URL: "",
      },
    });

    const [html, config] = await Promise.all([
      readFile(path.join(root, "dist", "normal", "index.html"), "utf8"),
      readFile(path.join(root, "dist", "normal", "poker-config.js"), "utf8"),
    ]);
    expect(config).toBe("globalThis.__HTML_POKER_CONFIG__ ??= {};\n");
    expect(config).not.toContain("wss://");
    expect(html).toContain(baselineCsp);
  });

  it("binds the static artifact to one exact HTTPS/WSS service origin", async () => {
    const root = await fixture();

    await execute(process.execPath, [configureScript], {
      cwd: root,
      env: {
        ...process.env,
        NORMAL_CONNECTION_SERVICE_URL: "wss://relay.example.test",
      },
    });

    const [html, config] = await Promise.all([
      readFile(path.join(root, "dist", "normal", "index.html"), "utf8"),
      readFile(path.join(root, "dist", "normal", "poker-config.js"), "utf8"),
    ]);
    expect(config).toContain(
      'privateRelay: { url: "wss://relay.example.test" }',
    );
    const browser = { globalThis: {} as Record<string, unknown> };
    runInNewContext(config, browser);
    expect(browser.globalThis).toEqual({
      __HTML_POKER_CONFIG__: {
        privateRelay: { url: "wss://relay.example.test" },
      },
    });
    expect(html).toContain(
      "connect-src 'self' https://relay.example.test wss://relay.example.test;",
    );
    expect(html).not.toContain("connect-src 'self' https: wss:;");
    expect(html).toContain("img-src 'self' data: blob:;");
  });

  it("configures Cloudflare as primary and Mac as an independent fallback", async () => {
    const root = await fixture();

    await execute(process.execPath, [configureScript], {
      cwd: root,
      env: {
        ...process.env,
        NORMAL_CONNECTION_SERVICE_URL: "",
        NORMAL_CLOUD_RELAY_URL: "wss://relay.example.test",
        NORMAL_MAC_RELAY_URL: "wss://mac-relay.example.test",
      },
    });

    const [html, config] = await Promise.all([
      readFile(path.join(root, "dist", "normal", "index.html"), "utf8"),
      readFile(path.join(root, "dist", "normal", "poker-config.js"), "utf8"),
    ]);
    expect(config).toContain('cloudRelay: { url: "wss://relay.example.test" }');
    expect(config).toContain(
      'privateRelay: { url: "wss://mac-relay.example.test" }',
    );
    const browser = { globalThis: {} as Record<string, unknown> };
    runInNewContext(config, browser);
    expect(browser.globalThis).toEqual({
      __HTML_POKER_CONFIG__: {
        cloudRelay: { url: "wss://relay.example.test" },
        privateRelay: { url: "wss://mac-relay.example.test" },
      },
    });
    expect(html).toContain(
      "connect-src 'self' https://relay.example.test wss://relay.example.test https://mac-relay.example.test wss://mac-relay.example.test;",
    );
  });

  it("keeps the legacy URL as the Mac fallback when the new variables are absent", async () => {
    const root = await fixture();

    await execute(process.execPath, [configureScript], {
      cwd: root,
      env: {
        ...process.env,
        NORMAL_CLOUD_RELAY_URL: "",
        NORMAL_MAC_RELAY_URL: "",
        NORMAL_CONNECTION_SERVICE_URL: "wss://legacy-relay.example.test",
      },
    });

    const config = await readFile(
      path.join(root, "dist", "normal", "poker-config.js"),
      "utf8",
    );
    expect(config).toContain(
      'privateRelay: { url: "wss://legacy-relay.example.test" }',
    );
    expect(config).not.toContain("cloudRelay");
  });

  it("rejects an insecure public Connection Service URL", async () => {
    const root = await fixture();

    await expect(
      execute(process.execPath, [configureScript], {
        cwd: root,
        env: {
          ...process.env,
          NORMAL_CONNECTION_SERVICE_URL: "ws://relay.example.test",
        },
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("wss://"),
    });
  });

  it("rejects an artifact that would block a locally selected QR image", async () => {
    const root = await fixture();
    const indexPath = path.join(root, "dist", "normal", "index.html");
    await writeFile(
      indexPath,
      `<meta http-equiv="Content-Security-Policy" content="${baselineCsp.replace(" blob:", "")}">`,
      "utf8",
    );

    await expect(
      execute(process.execPath, [configureScript], {
        cwd: root,
        env: {
          ...process.env,
          NORMAL_CONNECTION_SERVICE_URL: "wss://relay.example.test",
        },
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("blob:"),
    });
  });

  it("blocks Pages deployment until the configured live relay passes its release gate", async () => {
    const workflow = await readFile(
      path.join(process.cwd(), ".github", "workflows", "ci.yml"),
      "utf8",
    );
    const configure = workflow.indexOf("Configure hosted Normal Mode");
    const liveGate = workflow.indexOf("Verify configured live relay");
    const deploy = workflow.indexOf("Deploy GitHub Pages");

    expect(configure).toBeGreaterThan(-1);
    expect(liveGate).toBeGreaterThan(configure);
    expect(deploy).toBeGreaterThan(liveGate);
    expect(workflow).toContain("pnpm qa:live-relay");
    expect(workflow).toContain(
      "NORMAL_APP_ORIGIN: ${{ vars.NORMAL_APP_ORIGIN || format('https://{0}.github.io', github.repository_owner) }}",
    );
    expect(workflow).toContain(
      "if: vars.NORMAL_CLOUD_RELAY_URL != '' || vars.NORMAL_MAC_RELAY_URL != '' || vars.NORMAL_CONNECTION_SERVICE_URL != ''",
    );
    expect(workflow).not.toContain("trycloudflare.com");
  });
});
