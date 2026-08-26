import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { resolveOperatorAccessToken } from "@html-poker/connection-service/operator-config";

const execute = promisify(execFile);
const tokenTool = new URL(
  "../../tools/operations/create-relay-token.mjs",
  import.meta.url,
);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("Table-side Mode self-hosting kit", () => {
  it("creates a private operator-token file without printing its secret", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "our-poker-relay-token-"));
    temporaryRoots.push(root);
    const tokenPath = path.join(root, "private", "operator-token");

    const result = await execute(
      process.execPath,
      [tokenTool.pathname, "--", tokenPath],
      { cwd: root },
    );
    const token = (await readFile(tokenPath, "utf8")).trim();
    const metadata = await stat(tokenPath);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(metadata.mode & 0o777).toBe(0o600);
    expect(result.stdout).toContain(tokenPath);
    expect(result.stdout).not.toContain(token);
    await expect(stat(path.join(root, "--"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    await expect(
      execute(process.execPath, [tokenTool.pathname, "--", tokenPath]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Refusing to overwrite"),
    });
  });

  it("loads one operator token from a file without also requiring a secret environment value", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "our-poker-relay-config-"));
    temporaryRoots.push(root);
    const tokenPath = path.join(root, "operator-token");
    await writeFile(tokenPath, "operator-file-token-for-tests\n", {
      mode: 0o600,
    });

    expect(
      resolveOperatorAccessToken({
        POKER_CONNECTION_ACCESS_TOKEN_FILE: tokenPath,
      }),
    ).toBe("operator-file-token-for-tests");
    expect(() =>
      resolveOperatorAccessToken({
        POKER_CONNECTION_ACCESS_TOKEN: "operator-inline-token-for-tests",
        POKER_CONNECTION_ACCESS_TOKEN_FILE: tokenPath,
      }),
    ).toThrow("Set only one");
    expect(() => resolveOperatorAccessToken({})).toThrow(
      "POKER_CONNECTION_ACCESS_TOKEN_FILE",
    );
  });

  it("ships a deployer-owned container recipe with no project-owner endpoint or secret", async () => {
    const [composeSource, dockerfile] = await Promise.all([
      readFile(
        path.join(process.cwd(), "deploy", "table-side", "compose.yaml"),
        "utf8",
      ),
      readFile(
        path.join(
          process.cwd(),
          "services",
          "connection-service",
          "Dockerfile",
        ),
        "utf8",
      ),
    ]);
    const compose = parse(composeSource) as {
      secrets?: { operator_token?: { file?: string } };
      services?: {
        connection_service?: {
          build?: { context?: string; dockerfile?: string };
          environment?: Record<string, string>;
          ports?: string[];
          secrets?: string[];
        };
      };
    };
    const service = compose.services?.connection_service;

    expect(service?.build).toEqual({
      context: "../..",
      dockerfile: "services/connection-service/Dockerfile",
    });
    expect(service?.environment).toMatchObject({
      POKER_CONNECTION_ACCESS_TOKEN_FILE: "/run/secrets/operator_token",
      POKER_CONNECTION_ALLOWED_ORIGIN: "${TABLE_SIDE_APP_ORIGIN:?required}",
    });
    expect(service?.ports).toEqual([
      "127.0.0.1:${POKER_CONNECTION_PORT:-8787}:8787",
    ]);
    expect(service?.secrets).toContain("operator_token");
    expect(compose.secrets?.operator_token?.file).toBe(
      "${RELAY_OPERATOR_TOKEN_FILE:?required}",
    );
    expect(`${composeSource}\n${dockerfile}`).not.toMatch(
      /cai-ruihe|trycloudflare|operator-file-token/iu,
    );
    expect(dockerfile).toContain("AS build");
    expect(dockerfile).toContain("pnpm build:service");
    expect(dockerfile).toContain("USER node");
  });
});
