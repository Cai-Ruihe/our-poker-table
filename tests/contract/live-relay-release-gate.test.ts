import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const serviceRequire = createRequire(
  new URL("../../services/connection-service/package.json", import.meta.url),
);
const { WebSocketServer } = serviceRequire("ws") as {
  WebSocketServer: new (options: { noServer: boolean }) => {
    emit(event: string, ...args: unknown[]): void;
    handleUpgrade(
      request: unknown,
      socket: unknown,
      head: unknown,
      callback: (socket: unknown) => void,
    ): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
  };
};
const checker = new URL(
  "../../tools/release/check-live-relay.mjs",
  import.meta.url,
);
const servers: Server[] = [];
const temporaryRoots: string[] = [];

async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test listener.");
  }
  return address.port;
}

function relayServer(appOrigin: string, operatorToken: string): Server {
  const peers = new Map<string, { send(data: string): void }>();
  const server = createServer(async (request, response) => {
    response.setHeader("access-control-allow-origin", appOrigin);
    response.setHeader(
      "access-control-allow-headers",
      "authorization, content-type",
    );
    response.setHeader(
      "access-control-allow-methods",
      "GET, POST, PUT, OPTIONS",
    );
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (request.method === "POST" && request.url === "/v1/table-sessions") {
      if (request.headers.authorization !== `Bearer ${operatorToken}`) {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ code: "access-denied" }));
        return;
      }
      const body = await new Promise<string>((resolve, reject) => {
        let text = "";
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => {
          text += chunk;
        });
        request.once("end", () => resolve(text));
        request.once("error", reject);
      });
      const candidate = JSON.parse(body) as { readonly peerId?: unknown };
      if (typeof candidate.peerId !== "string") {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ code: "binding-mismatch" }));
        return;
      }
      response.writeHead(201, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          accessToken: `table-scoped-test-ticket-${candidate.peerId}`,
          expiresAt: Date.now() + 60_000,
          pairingWriteCapability: `pairing-capability-${candidate.peerId}`,
          peerId: candidate.peerId,
        }),
      );
      return;
    }
    response.writeHead(404).end();
  });
  const webSockets = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    if (request.headers.origin !== appOrigin) {
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      webSockets.emit("connection", webSocket, request);
    });
  });
  webSockets.on("connection", (socket) => {
    const relaySocket = socket as {
      on(event: "message", listener: (data: Buffer) => void): void;
      send(data: string): void;
    };
    relaySocket.on("message", (data) => {
      const frame = JSON.parse(data.toString()) as {
        readonly envelope?: {
          readonly messageId?: string;
          readonly recipientPeerId?: string;
        };
        readonly peerId?: string;
        readonly type?: string;
      };
      if (frame.type === "register" && typeof frame.peerId === "string") {
        peers.set(frame.peerId, relaySocket);
        relaySocket.send(
          JSON.stringify({ status: "registered", type: "receipt" }),
        );
        return;
      }
      if (
        frame.type === "envelope" &&
        frame.envelope?.recipientPeerId &&
        frame.envelope.messageId
      ) {
        peers.get(frame.envelope.recipientPeerId)?.send(data.toString());
        relaySocket.send(
          JSON.stringify({
            messageId: frame.envelope.messageId,
            status: "relayed",
            type: "receipt",
          }),
        );
      }
    });
  });
  return server;
}

afterEach(async () => {
  await Promise.all([
    ...servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
    ...temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  ]);
});

describe("live relay release gate", () => {
  it("accepts a reachable relay with health, CORS, and token rejection boundaries", async () => {
    const appOrigin = "https://EXAMPLE.test";
    const normalizedOrigin = new URL(appOrigin).origin;
    const port = await listen(
      createServer((request, response) => {
        response.setHeader("access-control-allow-origin", normalizedOrigin);
        response.setHeader(
          "access-control-allow-headers",
          "authorization, content-type",
        );
        response.setHeader(
          "access-control-allow-methods",
          "GET, POST, PUT, OPTIONS",
        );
        if (request.method === "GET" && request.url === "/health") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ status: "ok" }));
          return;
        }
        if (
          request.method === "OPTIONS" &&
          request.url === "/v1/table-sessions"
        ) {
          response.writeHead(204).end();
          return;
        }
        if (request.method === "POST" && request.url === "/v1/table-sessions") {
          response.writeHead(401, { "content-type": "application/json" });
          response.end(JSON.stringify({ code: "access-denied" }));
          return;
        }
        response.writeHead(404).end();
      }),
    );

    const result = await execute(process.execPath, [checker.pathname], {
      env: {
        ...process.env,
        NORMAL_APP_ORIGIN: appOrigin,
        NORMAL_CONNECTION_SERVICE_URL: `http://127.0.0.1:${port}`,
        RELAY_CHECK_ALLOW_HTTP_LOOPBACK: "1",
      },
    });

    expect(JSON.parse(result.stdout)).toMatchObject({
      cors: "ok",
      health: "ok",
      invalidTokenRejection: "ok",
      status: "ready",
    });
  });

  it("can verify the owner token from a local file without printing either credential", async () => {
    const appOrigin = "https://example.test";
    const operatorToken = "owner-test-token-kept-off-output";
    const root = await mkdtemp(path.join(tmpdir(), "relay-gate-token-"));
    temporaryRoots.push(root);
    const tokenFile = path.join(root, "operator-token");
    await writeFile(tokenFile, `${operatorToken}\n`, { mode: 0o600 });
    const port = await listen(relayServer(appOrigin, operatorToken));

    const result = await execute(process.execPath, [checker.pathname], {
      env: {
        ...process.env,
        NORMAL_APP_ORIGIN: appOrigin,
        NORMAL_CONNECTION_SERVICE_URL: `http://127.0.0.1:${port}`,
        RELAY_CHECK_ALLOW_HTTP_LOOPBACK: "1",
        RELAY_OPERATOR_TOKEN_FILE: tokenFile,
      },
    });

    expect(result.stdout).not.toContain(operatorToken);
    expect(result.stdout).not.toContain("table-scoped-test-ticket");
    expect(JSON.parse(result.stdout)).toMatchObject({
      operatorTokenAcceptance: "ok",
      status: "ready",
      webSocketRoundTrip: "ok",
    });
  });

  it("refuses redirects away from the configured relay origin", async () => {
    const appOrigin = "https://example.test";
    const targetPort = await listen(
      createServer((request, response) => {
        response.setHeader("access-control-allow-origin", appOrigin);
        response.setHeader(
          "access-control-allow-headers",
          "authorization, content-type",
        );
        response.setHeader(
          "access-control-allow-methods",
          "GET, POST, PUT, OPTIONS",
        );
        if (request.method === "GET" && request.url === "/health") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ status: "ok" }));
          return;
        }
        if (request.method === "OPTIONS") {
          response.writeHead(204).end();
          return;
        }
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ code: "access-denied" }));
      }),
    );
    const redirectPort = await listen(
      createServer((request, response) => {
        response.writeHead(307, {
          location: `http://127.0.0.1:${targetPort}${request.url ?? "/"}`,
        });
        response.end();
      }),
    );

    await expect(
      execute(process.execPath, [checker.pathname], {
        env: {
          ...process.env,
          NORMAL_APP_ORIGIN: appOrigin,
          NORMAL_CONNECTION_SERVICE_URL: `http://127.0.0.1:${redirectPort}`,
          RELAY_CHECK_ALLOW_HTTP_LOOPBACK: "1",
        },
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("redirect"),
    });
  });

  it("refuses a relay URL that contains credentials or an application path", async () => {
    await expect(
      execute(process.execPath, [checker.pathname], {
        env: {
          ...process.env,
          NORMAL_APP_ORIGIN: "https://example.test",
          NORMAL_CONNECTION_SERVICE_URL:
            "wss://embedded:credential@relay.example.test/private-path",
        },
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("only its secure origin"),
    });
  });
});
