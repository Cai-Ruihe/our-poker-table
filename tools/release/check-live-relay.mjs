import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { isIP } from "node:net";

// The checked-out Connection Service already owns the WebSocket client
// dependency used by the live gate. Resolving from that package keeps this
// operator script dependency-free at the workspace root while still letting
// it set the exact Origin header required by both relays.
const serviceRequire = createRequire(
  new URL("../../services/connection-service/package.json", import.meta.url),
);
const { WebSocket } = serviceRequire("ws");

const appOrigin = process.env.NORMAL_APP_ORIGIN?.trim();
const allowHttpLoopback = process.env.RELAY_CHECK_ALLOW_HTTP_LOOPBACK === "1";
const operatorTokenFile = process.env.RELAY_OPERATOR_TOKEN_FILE?.trim();
const timeoutCandidate = Number.parseInt(
  process.env.RELAY_CHECK_TIMEOUT_MS ?? "10000",
  10,
);
const timeoutMs =
  Number.isSafeInteger(timeoutCandidate) &&
  timeoutCandidate >= 1_000 &&
  timeoutCandidate <= 30_000
    ? timeoutCandidate
    : 10_000;

function fail(message) {
  throw new Error(`Live relay release gate failed: ${message}`);
}

function serviceUrl(relayValue, variableName, pathname) {
  if (!relayValue) fail(`${variableName} is required.`);
  let url;
  try {
    url = new URL(relayValue);
  } catch {
    fail(`${variableName} is invalid.`);
  }
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    fail(`${variableName} must contain only its secure origin.`);
  }
  if (url.protocol === "wss:") {
    url.protocol = "https:";
  } else if (
    allowHttpLoopback &&
    loopback &&
    (url.protocol === "ws:" || url.protocol === "http:")
  ) {
    url.protocol = "http:";
  } else {
    fail(
      "the relay must use wss:// (HTTP is allowed only for loopback tests).",
    );
  }
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

async function checkedFetch(url, init = {}) {
  try {
    return await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const primary = error instanceof Error ? error.message : "network error";
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? `: ${error.cause.message}`
        : "";
    const reason = `${primary}${cause}`;
    fail(`${url.hostname} is unreachable (${reason}).`);
  }
}

function headerTokens(response, name) {
  return (response.headers.get(name) ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function waitForWebSocketOpen(socket, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} WebSocket timed out while opening.`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("error", onError);
      socket.off("open", onOpen);
    };
    const onError = () => {
      cleanup();
      reject(new Error(`${label} WebSocket could not open.`));
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    socket.once("error", onError);
    socket.once("open", onOpen);
  });
}

function waitForWebSocketMessage(socket, label, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} WebSocket message timed out.`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("error", onError);
      socket.off("message", onMessage);
    };
    const onError = () => {
      cleanup();
      reject(new Error(`${label} WebSocket failed.`));
    };
    const onMessage = (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    };
    socket.on("error", onError);
    socket.on("message", onMessage);
  });
}

function closeWebSocket(socket) {
  if (!socket) return;
  try {
    socket.close();
  } catch {
    // The live check has already recorded the actionable failure.
  }
}

async function main() {
  if (!appOrigin) fail("NORMAL_APP_ORIGIN is required.");
  let applicationUrl;
  try {
    applicationUrl = new URL(appOrigin);
  } catch {
    fail("NORMAL_APP_ORIGIN must be one exact HTTPS origin.");
  }
  if (
    applicationUrl.protocol !== "https:" ||
    applicationUrl.username ||
    applicationUrl.password ||
    applicationUrl.pathname !== "/" ||
    applicationUrl.search ||
    applicationUrl.hash
  ) {
    fail("NORMAL_APP_ORIGIN must be one exact HTTPS origin.");
  }
  const origin = applicationUrl.origin;
  const configuredRelays = [
    ["NORMAL_CLOUD_RELAY_URL", process.env.NORMAL_CLOUD_RELAY_URL?.trim()],
    ["NORMAL_MAC_RELAY_URL", process.env.NORMAL_MAC_RELAY_URL?.trim()],
  ];
  if (!configuredRelays.some(([, value]) => value)) {
    configuredRelays.push([
      "NORMAL_CONNECTION_SERVICE_URL",
      process.env.NORMAL_CONNECTION_SERVICE_URL?.trim(),
    ]);
  }
  const activeRelays = configuredRelays.filter(([, value]) => value);
  if (activeRelays.length === 0) {
    fail(
      "one of NORMAL_CLOUD_RELAY_URL, NORMAL_MAC_RELAY_URL, or NORMAL_CONNECTION_SERVICE_URL is required.",
    );
  }

  async function checkRelay(variableName, relayValue) {
    const healthUrl = serviceUrl(relayValue, variableName, "/health");
    if (isIP(healthUrl.hostname) === 0 && healthUrl.hostname !== "localhost") {
      try {
        await lookup(healthUrl.hostname);
      } catch {
        fail(`${variableName}: ${healthUrl.hostname} does not resolve in DNS.`);
      }
    }

    const healthResponse = await checkedFetch(healthUrl, {
      headers: { accept: "application/json" },
    });
    if (!healthResponse.ok) {
      fail(
        `${variableName}: GET /health returned HTTP ${healthResponse.status}.`,
      );
    }
    const health = await healthResponse.json().catch(() => undefined);
    if (health?.status !== "ok") {
      fail(`${variableName}: GET /health did not return { status: "ok" }.`);
    }

    const sessionsUrl = serviceUrl(
      relayValue,
      variableName,
      "/v1/table-sessions",
    );
    const preflight = await checkedFetch(sessionsUrl, {
      headers: {
        "access-control-request-headers": "authorization,content-type",
        "access-control-request-method": "POST",
        origin,
      },
      method: "OPTIONS",
    });
    if (preflight.status !== 204) {
      fail(
        `${variableName}: table-session preflight returned HTTP ${preflight.status}.`,
      );
    }
    const allowedOrigin = preflight.headers.get("access-control-allow-origin");
    const allowedHeaders = headerTokens(
      preflight,
      "access-control-allow-headers",
    );
    const allowedMethods = headerTokens(
      preflight,
      "access-control-allow-methods",
    );
    if (allowedOrigin !== origin) {
      fail(
        `${variableName}: CORS allows ${allowedOrigin ?? "no origin"}, not ${origin}.`,
      );
    }
    if (
      !allowedHeaders.includes("authorization") ||
      !allowedHeaders.includes("content-type") ||
      !allowedMethods.includes("post")
    ) {
      fail(`${variableName}: CORS does not allow the table-session request.`);
    }

    const rejection = await checkedFetch(sessionsUrl, {
      body: JSON.stringify({
        hostKey: `release-gate-host-${randomUUID()}`,
        protocolVersion: 2,
        tableId: `release-gate-table-${randomUUID()}`,
      }),
      headers: {
        authorization: "Bearer release-gate-intentionally-invalid-token",
        "content-type": "application/json",
        origin,
      },
      method: "POST",
    });
    const rejectionBody = await rejection.json().catch(() => undefined);
    if (rejection.status !== 401 || rejectionBody?.code !== "access-denied") {
      fail(
        `${variableName}: the relay did not reject an invalid operator token with HTTP 401.`,
      );
    }

    let operatorTokenAcceptance;
    let webSocketRoundTrip;
    if (operatorTokenFile) {
      const tokenMetadata = await stat(operatorTokenFile).catch(
        () => undefined,
      );
      if (!tokenMetadata?.isFile()) {
        fail("RELAY_OPERATOR_TOKEN_FILE is not a readable regular file.");
      }
      if ((tokenMetadata.mode & 0o077) !== 0) {
        fail(
          "RELAY_OPERATOR_TOKEN_FILE must not be accessible by group or others.",
        );
      }
      const operatorToken = (await readFile(operatorTokenFile, "utf8")).trim();
      if (operatorToken.length < 16 || operatorToken.length > 512) {
        fail("the operator token file has an invalid value.");
      }
      const hostKey = `release-gate-host-${randomUUID()}`;
      const tableId = `release-gate-table-${randomUUID()}`;
      async function issueTicket(peerId) {
        const acceptance = await checkedFetch(sessionsUrl, {
          body: JSON.stringify({
            hostKey,
            peerId,
            protocolVersion: 2,
            tableId,
          }),
          headers: {
            authorization: `Bearer ${operatorToken}`,
            "content-type": "application/json",
            origin,
          },
          method: "POST",
        });
        const ticket = await acceptance.json().catch(() => undefined);
        if (
          acceptance.status !== 201 ||
          typeof ticket?.accessToken !== "string" ||
          ticket.accessToken.length < 16 ||
          ticket.accessToken.length > 512 ||
          typeof ticket?.pairingWriteCapability !== "string" ||
          ticket.pairingWriteCapability.length < 16 ||
          ticket.pairingWriteCapability.length > 512 ||
          ticket.peerId !== peerId ||
          !Number.isSafeInteger(ticket.expiresAt) ||
          ticket.expiresAt <= Date.now()
        ) {
          fail(
            `${variableName}: the relay did not accept the operator token and issue a peer-bound valid ticket.`,
          );
        }
        return ticket;
      }
      const hostPeerId = `release-gate-host-peer-${randomUUID()}`;
      const playerPeerId = `release-gate-player-peer-${randomUUID()}`;
      const hostTicket = await issueTicket(hostPeerId);
      const playerTicket = await issueTicket(playerPeerId);
      operatorTokenAcceptance = "ok";

      const relayWebSocketUrl = new URL(relayValue);
      let hostSocket;
      let playerSocket;
      try {
        hostSocket = new WebSocket(relayWebSocketUrl, { headers: { origin } });
        playerSocket = new WebSocket(relayWebSocketUrl, {
          headers: { origin },
        });
        await Promise.all([
          waitForWebSocketOpen(hostSocket, `${variableName} host`),
          waitForWebSocketOpen(playerSocket, `${variableName} player`),
        ]);
        const registeredHost = waitForWebSocketMessage(
          hostSocket,
          `${variableName} host registration`,
          (message) =>
            message?.type === "receipt" && message?.status === "registered",
        );
        hostSocket.send(
          JSON.stringify({
            accessToken: hostTicket.accessToken,
            hostKey,
            peerId: hostPeerId,
            protocolVersion: 2,
            tableId,
            type: "register",
          }),
        );
        const registeredPlayer = waitForWebSocketMessage(
          playerSocket,
          `${variableName} player registration`,
          (message) =>
            message?.type === "receipt" && message?.status === "registered",
        );
        playerSocket.send(
          JSON.stringify({
            accessToken: playerTicket.accessToken,
            hostKey,
            peerId: playerPeerId,
            protocolVersion: 2,
            tableId,
            type: "register",
          }),
        );
        await Promise.all([registeredHost, registeredPlayer]);

        const messageId = `release-gate-message-${randomUUID()}`;
        const frame = {
          envelope: {
            ciphertext: "release-gate-opaque-probe",
            hostKey,
            messageId,
            protocolVersion: 2,
            recipientPeerId: playerPeerId,
            senderPeerId: hostPeerId,
            sequence: 1,
            tableId,
          },
          type: "envelope",
        };
        const received = waitForWebSocketMessage(
          playerSocket,
          `${variableName} player delivery`,
          (message) =>
            message?.type === "envelope" &&
            message?.envelope?.messageId === messageId,
        );
        const receipt = waitForWebSocketMessage(
          hostSocket,
          `${variableName} host receipt`,
          (message) =>
            message?.type === "receipt" &&
            message?.status === "relayed" &&
            message?.messageId === messageId,
        );
        hostSocket.send(JSON.stringify(frame));
        await Promise.all([received, receipt]);
        webSocketRoundTrip = "ok";
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown error";
        fail(
          `${variableName}: WebSocket registration/relay check failed (${detail}).`,
        );
      } finally {
        closeWebSocket(hostSocket);
        closeWebSocket(playerSocket);
      }
    }

    return {
      cors: "ok",
      health: "ok",
      invalidTokenRejection: "ok",
      ...(operatorTokenAcceptance ? { operatorTokenAcceptance } : {}),
      ...(webSocketRoundTrip ? { webSocketRoundTrip } : {}),
      relayOrigin: healthUrl.origin,
      variableName,
    };
  }

  const routes = [];
  for (const [variableName, relayValue] of activeRelays) {
    routes.push(await checkRelay(variableName, relayValue));
  }
  const firstRoute = routes[0];
  process.stdout.write(
    `${JSON.stringify({
      ...firstRoute,
      relayOrigin: firstRoute.relayOrigin,
      routes,
      status: "ready",
    })}\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown failure.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
