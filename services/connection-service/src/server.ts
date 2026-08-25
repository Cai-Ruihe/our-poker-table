import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { WebSocketServer, type RawData, type WebSocket } from "ws";

import {
  createConnectionBroker,
  createDisplayPairingMailbox,
  type RelayClient,
  type RelayRegistration,
} from "./index.js";
import { resolveOperatorAccessToken } from "./operator-config.js";

const accessToken = resolveOperatorAccessToken();
const port = Number.parseInt(process.env.POKER_CONNECTION_PORT ?? "8787", 10);
const host = process.env.POKER_CONNECTION_HOST ?? "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("POKER_CONNECTION_PORT must be a valid TCP port.");
}

const broker = createConnectionBroker({ accessToken });
const displayPairings = createDisplayPairingMailbox();
const configuredAllowedOrigin =
  process.env.POKER_CONNECTION_ALLOWED_ORIGIN?.trim();
if (configuredAllowedOrigin) {
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(configuredAllowedOrigin);
  } catch {
    throw new Error(
      "POKER_CONNECTION_ALLOWED_ORIGIN must be one exact HTTPS app origin.",
    );
  }
  if (
    parsedOrigin.origin !== configuredAllowedOrigin ||
    (parsedOrigin.protocol !== "https:" &&
      !(
        parsedOrigin.protocol === "http:" &&
        (parsedOrigin.hostname === "127.0.0.1" ||
          parsedOrigin.hostname === "localhost") &&
        host === "127.0.0.1" &&
        process.env.NODE_ENV !== "production"
      ))
  ) {
    throw new Error(
      "POKER_CONNECTION_ALLOWED_ORIGIN must be one exact HTTPS app origin, except controlled loopback development.",
    );
  }
}
const resolvedAllowedOrigin =
  configuredAllowedOrigin ||
  (host === "127.0.0.1" && process.env.NODE_ENV !== "production"
    ? "*"
    : undefined);
if (!resolvedAllowedOrigin) {
  throw new Error(
    "POKER_CONNECTION_ALLOWED_ORIGIN must be an exact HTTPS app origin outside controlled loopback development.",
  );
}
const allowedOrigin = resolvedAllowedOrigin;

function originIsAllowed(origin: string | undefined): boolean {
  return allowedOrigin === "*" || origin === allowedOrigin;
}

function rejectOrigin(response: ServerResponse): void {
  response.writeHead(403, { "cache-control": "no-store" });
  response.end("Origin not allowed");
}

function applyCors(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", allowedOrigin);
  response.setHeader(
    "access-control-allow-headers",
    "authorization, content-type",
  );
  response.setHeader("access-control-allow-methods", "GET, POST, PUT, OPTIONS");
  response.setHeader("vary", "Origin");
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
): void {
  applyCors(response);
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function parseJsonBody(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (Buffer.byteLength(body, "utf8") > 65_536) {
      throw new Error("request body too large");
    }
  }
  return JSON.parse(body);
}

async function handleDisplayPairing(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
): Promise<void> {
  if (request.method === "GET") {
    const result = displayPairings.take(requestId);
    if (result.status === "pending") {
      applyCors(response);
      response.writeHead(204).end();
      return;
    }
    writeJson(response, 200, result.envelope);
    return;
  }
  if (request.method !== "PUT") {
    writeJson(response, 405, { code: "method-not-allowed" });
    return;
  }
  const pairingWriteCapability = bearerToken(request);
  if (!pairingWriteCapability) {
    writeJson(response, 401, { code: "pairing-capability-required" });
    return;
  }
  const clientId = broker.validatePairingWriteCapability(
    pairingWriteCapability,
  );
  if (!clientId) {
    writeJson(response, 403, { code: "pairing-capability-invalid" });
    return;
  }
  try {
    const candidate = await parseJsonBody(request);
    if (!candidate || typeof candidate !== "object") {
      writeJson(response, 400, { code: "invalid-envelope" });
      return;
    }
    const envelope = candidate as {
      readonly ciphertext?: unknown;
      readonly expiresAt?: unknown;
      readonly iv?: unknown;
    };
    const result = displayPairings.put(
      requestId,
      {
        ciphertext:
          typeof envelope.ciphertext === "string" ? envelope.ciphertext : "",
        expiresAt:
          typeof envelope.expiresAt === "number" ? envelope.expiresAt : 0,
        iv: typeof envelope.iv === "string" ? envelope.iv : "",
      },
      clientId,
    );
    if (result.status === "rejected") {
      writeJson(
        response,
        result.code === "client-capacity" || result.code === "rate-limited"
          ? 429
          : 400,
        { code: result.code },
      );
      return;
    }
    applyCors(response);
    response.writeHead(204).end();
  } catch {
    writeJson(response, 400, { code: "invalid-envelope" });
  }
}

function bearerToken(request: IncomingMessage): string | undefined {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return undefined;
  const token = authorization.slice("Bearer ".length);
  return token.length > 0 ? token : undefined;
}

async function handleTableSession(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    writeJson(response, 405, { code: "method-not-allowed" });
    return;
  }
  const operatorToken = bearerToken(request);
  if (!operatorToken) {
    writeJson(response, 401, { code: "access-denied" });
    return;
  }
  try {
    const candidate = await parseJsonBody(request);
    if (!candidate || typeof candidate !== "object") {
      writeJson(response, 400, { code: "binding-mismatch" });
      return;
    }
    const binding = candidate as {
      readonly hostKey?: unknown;
      readonly peerId?: unknown;
      readonly protocolVersion?: unknown;
      readonly tableId?: unknown;
    };
    const result = broker.issueSession({
      hostKey: typeof binding.hostKey === "string" ? binding.hostKey : "",
      operatorToken,
      peerId: typeof binding.peerId === "string" ? binding.peerId : "",
      protocolVersion:
        typeof binding.protocolVersion === "number"
          ? binding.protocolVersion
          : Number.NaN,
      tableId: typeof binding.tableId === "string" ? binding.tableId : "",
    });
    if (result.status === "rejected") {
      writeJson(response, result.code === "access-denied" ? 401 : 400, {
        code: result.code,
      });
      return;
    }
    writeJson(response, 201, result.ticket);
  } catch {
    writeJson(response, 400, { code: "binding-mismatch" });
  }
}

const server = createServer((request, response) => {
  const pathname = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? host}`,
  ).pathname;
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (!originIsAllowed(request.headers.origin)) {
    rejectOrigin(response);
    return;
  }
  if (request.method === "OPTIONS") {
    applyCors(response);
    response.writeHead(204).end();
    return;
  }
  if (pathname === "/v1/table-sessions") {
    void handleTableSession(request, response);
    return;
  }
  const pairingMatch = /^\/v1\/display-pairings\/([^/]+)$/u.exec(pathname);
  if (pairingMatch?.[1]) {
    void handleDisplayPairing(request, response, pairingMatch[1]);
    return;
  }
  response.writeHead(404).end();
});
const websocketServer = new WebSocketServer({
  maxPayload: 65_536,
  server,
  verifyClient(info, done) {
    if (originIsAllowed(info.origin)) {
      done(true);
      return;
    }
    done(false, 403, "Origin not allowed");
  },
});

function textFrame(data: RawData): string | undefined {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  return undefined;
}

websocketServer.on("connection", (socket: WebSocket) => {
  const clientId = randomUUID();
  const client: RelayClient = {
    clientId,
    close(code, reason) {
      socket.close(code, reason);
    },
    send(frame) {
      if (socket.readyState !== socket.OPEN) {
        throw new Error("recipient socket is not open");
      }
      socket.send(frame);
    },
  };
  let registered = false;
  socket.on("message", (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      socket.close(1003, "text frames only");
      return;
    }
    const frame = textFrame(data);
    if (!frame) {
      socket.close(1007, "invalid text frame");
      return;
    }
    if (!registered) {
      try {
        const parsed = JSON.parse(frame) as RelayRegistration & {
          readonly type?: string;
        };
        if (parsed.type !== "register") throw new Error("register first");
        const result = broker.register(client, parsed);
        if (result.status === "rejected") {
          socket.close(1008, result.code);
          return;
        }
        registered = true;
        socket.send(JSON.stringify({ status: "registered", type: "receipt" }));
      } catch {
        socket.close(1008, "invalid registration");
      }
      return;
    }
    let messageId: string | undefined;
    try {
      const parsed = JSON.parse(frame) as {
        readonly envelope?: { readonly messageId?: unknown };
      };
      messageId =
        typeof parsed.envelope?.messageId === "string"
          ? parsed.envelope.messageId
          : undefined;
    } catch {
      // The broker reports malformed frames using its normal rejection path.
    }
    const result = broker.receive(clientId, frame);
    if (result.status === "relayed") {
      socket.send(
        JSON.stringify({
          ...(messageId ? { messageId } : {}),
          status: "relayed",
          type: "receipt",
        }),
      );
      return;
    }
    if (result.status === "rejected") {
      socket.send(
        JSON.stringify({
          code: result.code,
          ...(messageId ? { messageId } : {}),
          status: "rejected",
          type: "receipt",
        }),
      );
    }
  });
  socket.on("close", () => broker.unregister(clientId));
});

server.listen(port, host, () => {
  process.stdout.write(`Connection Service listening on ${host}:${port}\n`);
});
