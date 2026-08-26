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
  "configure-table-side.mjs",
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
  const root = await mkdtemp(
    path.join(tmpdir(), "html-poker-table-side-config-"),
  );
  roots.push(root);
  const tableSide = path.join(root, "dist", "table-side");
  await mkdir(tableSide, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(tableSide, "index.html"),
      `<meta http-equiv="Content-Security-Policy" content="${baselineCsp}">`,
      "utf8",
    ),
    writeFile(
      path.join(tableSide, "poker-config.js"),
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

describe("Table-side release configuration", () => {
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
        TABLE_SIDE_CONNECTION_SERVICE_URL: "",
      },
    });

    const [html, config] = await Promise.all([
      readFile(path.join(root, "dist", "table-side", "index.html"), "utf8"),
      readFile(
        path.join(root, "dist", "table-side", "poker-config.js"),
        "utf8",
      ),
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
        TABLE_SIDE_CONNECTION_SERVICE_URL: "wss://relay.example.test",
      },
    });

    const [html, config] = await Promise.all([
      readFile(path.join(root, "dist", "table-side", "index.html"), "utf8"),
      readFile(
        path.join(root, "dist", "table-side", "poker-config.js"),
        "utf8",
      ),
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
        TABLE_SIDE_CONNECTION_SERVICE_URL: "",
        TABLE_SIDE_CLOUD_RELAY_URL: "wss://relay.example.test",
        TABLE_SIDE_MAC_RELAY_URL: "wss://mac-relay.example.test",
      },
    });

    const [html, config] = await Promise.all([
      readFile(path.join(root, "dist", "table-side", "index.html"), "utf8"),
      readFile(
        path.join(root, "dist", "table-side", "poker-config.js"),
        "utf8",
      ),
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

  it("uses the single-relay URL as the Mac fallback when the dedicated variable is absent", async () => {
    const root = await fixture();

    await execute(process.execPath, [configureScript], {
      cwd: root,
      env: {
        ...process.env,
        TABLE_SIDE_CLOUD_RELAY_URL: "",
        TABLE_SIDE_MAC_RELAY_URL: "",
        TABLE_SIDE_CONNECTION_SERVICE_URL: "wss://single-relay.example.test",
      },
    });

    const config = await readFile(
      path.join(root, "dist", "table-side", "poker-config.js"),
      "utf8",
    );
    expect(config).toContain(
      'privateRelay: { url: "wss://single-relay.example.test" }',
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
          TABLE_SIDE_CONNECTION_SERVICE_URL: "ws://relay.example.test",
        },
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("wss://"),
    });
  });

  it("rejects an artifact that would block a locally selected QR image", async () => {
    const root = await fixture();
    const indexPath = path.join(root, "dist", "table-side", "index.html");
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
          TABLE_SIDE_CONNECTION_SERVICE_URL: "wss://relay.example.test",
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
    const configure = workflow.indexOf("Configure hosted Table-side Mode");
    const liveGate = workflow.indexOf("Verify configured live relay");
    const deploy = workflow.indexOf("Deploy GitHub Pages");

    expect(configure).toBeGreaterThan(-1);
    expect(liveGate).toBeGreaterThan(configure);
    expect(deploy).toBeGreaterThan(liveGate);
    expect(workflow).toContain("pnpm qa:live-relay");
    expect(workflow).toContain(
      "TABLE_SIDE_APP_ORIGIN: ${{ vars.TABLE_SIDE_APP_ORIGIN || format('https://{0}.github.io', github.repository_owner) }}",
    );
    expect(workflow).toContain(
      "if: vars.TABLE_SIDE_CLOUD_RELAY_URL != '' || vars.TABLE_SIDE_MAC_RELAY_URL != '' || vars.TABLE_SIDE_CONNECTION_SERVICE_URL != ''",
    );
    expect(workflow).not.toContain("trycloudflare.com");
    expect(workflow).toContain(
      "cp apps/landing/root-redirect.html _site/index.html",
    );
    expect(workflow).toContain(
      "cp dist/airplane/poker-airplane.html _site/poker-airplane.html",
    );
    expect(workflow).not.toContain(
      "cp dist/airplane/poker-airplane.html _site/index.html",
    );
  });
});
