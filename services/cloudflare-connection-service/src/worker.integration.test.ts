/// <reference types="@cloudflare/vitest-plugin/types" />

import { SELF, env, evictDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const OPERATOR_TOKEN = "local-integration-operator-token";
const ALLOWED_ORIGIN = "https://cai-ruihe.github.io";

type JsonRecord = Record<string, unknown>;

async function jsonBody(response: Response): Promise<JsonRecord> {
  return (await response.json()) as JsonRecord;
}

function tableBinding(tableId: string, peerId?: string): JsonRecord {
  return {
    hostKey: "host-integration",
    ...(peerId ? { peerId } : {}),
    protocolVersion: 1,
    tableId,
  };
}

async function issueTicket(
  tableId = "table-integration",
  peerId = "host-peer",
) {
  const response = await SELF.fetch("https://relay.test/v1/table-sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPERATOR_TOKEN}`,
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify(tableBinding(tableId, peerId)),
  });
  return { body: await jsonBody(response), response };
}

function pairingHeaders(capability: string): HeadersInit {
  return {
    authorization: `Bearer ${capability}`,
    origin: ALLOWED_ORIGIN,
    "content-type": "application/json",
  };
}

function issuedPairingCapability(issued: {
  readonly body: JsonRecord;
}): string {
  const capability = issued.body.pairingWriteCapability;
  if (typeof capability !== "string") {
    throw new Error("pairing capability was not issued");
  }
  return capability;
}

type WorkerWebSocketResponse = Response & { readonly webSocket?: WebSocket };

async function openRelayPeer(
  ticket: string,
  tableId: string,
  peerId: string,
): Promise<WebSocket> {
  const response = (await SELF.fetch("https://relay.test/relay", {
    headers: { origin: ALLOWED_ORIGIN, upgrade: "websocket" },
  })) as WorkerWebSocketResponse;
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) throw new Error("Workers test runtime did not expose webSocket");
  (socket as WebSocket & { accept?: () => void }).accept?.();
  const registered = waitForSocketMessage(socket, (message) => {
    const value = JSON.parse(message) as JsonRecord;
    return value.type === "receipt" && value.status === "registered";
  });
  socket.send(
    JSON.stringify({
      accessToken: ticket,
      hostKey: "host-integration",
      peerId,
      protocolVersion: 1,
      tableId,
      type: "register",
    }),
  );
  await registered;
  return socket;
}

function waitForSocketMessage(
  socket: WebSocket,
  predicate: (message: string) => boolean,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error("Timed out waiting for relay WebSocket message"));
    }, 2_000);
    const onMessage = (event: MessageEvent) => {
      const message = typeof event.data === "string" ? event.data : "";
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      resolve(message);
    };
    socket.addEventListener("message", onMessage);
  });
}

async function expectRelayPeerRejected(
  ticket: string,
  tableId: string,
  peerId: string,
): Promise<void> {
  const response = (await SELF.fetch("https://relay.test/relay", {
    headers: { origin: ALLOWED_ORIGIN, upgrade: "websocket" },
  })) as WorkerWebSocketResponse;
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) throw new Error("Workers test runtime did not expose webSocket");
  (socket as WebSocket & { accept?: () => void }).accept?.();
  const closed = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("close", onClose);
      reject(new Error("Relay accepted an unbound peer registration"));
    }, 2_000);
    const onClose = () => {
      clearTimeout(timeout);
      resolve();
    };
    socket.addEventListener("close", onClose, { once: true });
  });
  socket.send(
    JSON.stringify({
      accessToken: ticket,
      hostKey: "host-integration",
      peerId,
      protocolVersion: 1,
      tableId,
      type: "register",
    }),
  );
  await closed;
}

beforeEach(async () => {
  // `reset` is deliberately not used here: the integration suite verifies
  // that the same Durable Object state is shared by sequential requests.
  // Each test uses a unique table id instead.
  expect(env.RELAY_HUB).toBeDefined();
});

describe("Cloudflare Worker HTTP integration", () => {
  it("serves health and applies the exact Normal Mode CORS contract", async () => {
    const response = await SELF.fetch("https://relay.test/health", {
      headers: { origin: ALLOWED_ORIGIN },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      ALLOWED_ORIGIN,
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "authorization, content-type",
    );
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, PUT, OPTIONS",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });

    const preflight = await SELF.fetch("https://relay.test/v1/table-sessions", {
      method: "OPTIONS",
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("vary")).toBe("Origin");
  });

  it("rejects a missing or incorrect operator token without issuing a ticket", async () => {
    const request = {
      method: "POST",
      headers: {
        origin: ALLOWED_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify(tableBinding("table-invalid-token")),
    } as const;

    const missing = await SELF.fetch(
      "https://relay.test/v1/table-sessions",
      request,
    );
    expect(missing.status).toBe(401);
    expect(await jsonBody(missing)).toEqual({ code: "access-denied" });

    const incorrect = await SELF.fetch("https://relay.test/v1/table-sessions", {
      ...request,
      headers: {
        ...request.headers,
        authorization: "Bearer wrong-operator-token",
      },
    });
    expect(incorrect.status).toBe(401);
    expect(await jsonBody(incorrect)).toEqual({ code: "access-denied" });
  });

  it("requires the configured browser Origin for relay operations", async () => {
    const response = await SELF.fetch("https://relay.test/v1/table-sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${OPERATOR_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(tableBinding("table-no-origin")),
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Origin not allowed");
  });

  it("rejects a non-allowed origin before it reaches the Durable Object", async () => {
    const response = await SELF.fetch("https://relay.test/health", {
      headers: { origin: "https://not-our-poker-table.example" },
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Origin not allowed");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("issues a table-bound ticket and renews the same ticket after a Durable Object eviction", async () => {
    const first = await issueTicket("table-ticket-persistence");
    expect(first.response.status).toBe(201);
    expect(first.body.accessToken).toEqual(expect.any(String));
    expect(first.body.expiresAt).toEqual(expect.any(Number));

    const id = env.RELAY_HUB.idFromName("global");
    const stub = env.RELAY_HUB.get(id);
    await evictDurableObject(stub);

    const second = await issueTicket("table-ticket-persistence");
    expect(second.response.status).toBe(201);
    expect(second.body.accessToken).toBe(first.body.accessToken);
    expect(second.body.expiresAt).toBeGreaterThan(
      first.body.expiresAt as number,
    );
  });

  it("binds an issued ticket to one relay peer at the HTTP/WebSocket seam", async () => {
    const tableId = `table-peer-ticket-${crypto.randomUUID()}`;
    const issued = await issueTicket(tableId, "assigned-peer");
    expect(issued.response.status).toBe(201);
    const ticket = issued.body.accessToken;
    if (typeof ticket !== "string") throw new Error("ticket was not issued");

    await expectRelayPeerRejected(ticket, tableId, "different-peer");
  });

  it("rejects malformed or incomplete table bindings", async () => {
    const response = await SELF.fetch("https://relay.test/v1/table-sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${OPERATOR_TOKEN}`,
        origin: ALLOWED_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tableId: "missing-host-and-protocol" }),
    });

    expect(response.status).toBe(400);
    expect(await jsonBody(response)).toEqual({ code: "binding-mismatch" });
  });
});

describe("Cloudflare Worker display pairing integration", () => {
  it("rejects a display pairing write without a scoped pairing capability", async () => {
    const requestId = `pairing-capability-${crypto.randomUUID()}`;
    const response = await SELF.fetch(
      `https://relay.test/v1/display-pairings/${encodeURIComponent(requestId)}`,
      {
        method: "PUT",
        headers: {
          origin: ALLOWED_ORIGIN,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ciphertext: "attacker-write",
          expiresAt: Date.now() + 30_000,
          iv: "attacker-iv",
        }),
      },
    );

    expect(response.status).toBe(401);
    expect(await jsonBody(response)).toEqual({
      code: "pairing-capability-required",
    });
  });

  it("stores a pairing envelope and consumes it exactly once", async () => {
    const requestId = `pairing-integration-${crypto.randomUUID()}`;
    const capability = issuedPairingCapability(
      await issueTicket(`table-pairing-${crypto.randomUUID()}`),
    );
    const expiresAt = Date.now() + 30_000;
    const envelope = {
      ciphertext: "opaque-display-response",
      expiresAt,
      iv: "display-iv",
    };

    const put = await SELF.fetch(
      `https://relay.test/v1/display-pairings/${encodeURIComponent(requestId)}`,
      {
        method: "PUT",
        headers: pairingHeaders(capability),
        body: JSON.stringify(envelope),
      },
    );
    expect(put.status).toBe(204);

    const first = await SELF.fetch(
      `https://relay.test/v1/display-pairings/${encodeURIComponent(requestId)}`,
      { headers: { origin: ALLOWED_ORIGIN } },
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(envelope);

    const second = await SELF.fetch(
      `https://relay.test/v1/display-pairings/${encodeURIComponent(requestId)}`,
      { headers: { origin: ALLOWED_ORIGIN } },
    );
    expect(second.status).toBe(204);
    expect(await second.text()).toBe("");
  });

  it("does not retain an expired pairing envelope", async () => {
    const requestId = `pairing-expired-${crypto.randomUUID()}`;
    const capability = issuedPairingCapability(
      await issueTicket(`table-pairing-expired-${crypto.randomUUID()}`),
    );
    const put = await SELF.fetch(
      `https://relay.test/v1/display-pairings/${encodeURIComponent(requestId)}`,
      {
        method: "PUT",
        headers: pairingHeaders(capability),
        body: JSON.stringify({
          ciphertext: "expired",
          expiresAt: Date.now(),
          iv: "expired-iv",
        }),
      },
    );
    expect(put.status).toBe(400);
    expect(await jsonBody(put)).toEqual({ code: "expired" });
  });

  it("does not let a second table capability replace another host's pairing response", async () => {
    const requestId = `pairing-owner-${crypto.randomUUID()}`;
    const ownerCapability = issuedPairingCapability(
      await issueTicket(`table-pairing-owner-a-${crypto.randomUUID()}`),
    );
    const otherCapability = issuedPairingCapability(
      await issueTicket(`table-pairing-owner-b-${crypto.randomUUID()}`),
    );
    const endpoint = `https://relay.test/v1/display-pairings/${encodeURIComponent(requestId)}`;
    const envelope = {
      ciphertext: "owner-response",
      expiresAt: Date.now() + 30_000,
      iv: "owner-iv",
    };

    const initial = await SELF.fetch(endpoint, {
      method: "PUT",
      headers: pairingHeaders(ownerCapability),
      body: JSON.stringify(envelope),
    });
    expect(initial.status).toBe(204);

    const overwrite = await SELF.fetch(endpoint, {
      method: "PUT",
      headers: pairingHeaders(otherCapability),
      body: JSON.stringify({ ...envelope, ciphertext: "attacker-response" }),
    });
    expect(overwrite.status).toBe(403);
    expect(await jsonBody(overwrite)).toEqual({
      code: "pairing-owner-mismatch",
    });

    const read = await SELF.fetch(endpoint, {
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(await read.json()).toEqual(envelope);
  });

  it("bounds unconsumed pairing writes per host capability", async () => {
    const capability = issuedPairingCapability(
      await issueTicket(`table-pairing-capacity-${crypto.randomUUID()}`),
    );
    const headers = pairingHeaders(capability);
    for (let index = 0; index < 8; index += 1) {
      const response = await SELF.fetch(
        `https://relay.test/v1/display-pairings/${encodeURIComponent(`pairing-capacity-${crypto.randomUUID()}`)}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            ciphertext: `capacity-${index}`,
            expiresAt: Date.now() + 30_000,
            iv: `capacity-iv-${index}`,
          }),
        },
      );
      expect(response.status).toBe(204);
    }

    const limited = await SELF.fetch(
      `https://relay.test/v1/display-pairings/${encodeURIComponent(`pairing-capacity-${crypto.randomUUID()}`)}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          ciphertext: "one-too-many",
          expiresAt: Date.now() + 30_000,
          iv: "one-too-many-iv",
        }),
      },
    );
    expect(limited.status).toBe(429);
    expect(await jsonBody(limited)).toEqual({ code: "client-capacity" });
  });

  it("rate-limits repeated pairing writes from one host capability", async () => {
    const capability = issuedPairingCapability(
      await issueTicket(`table-pairing-rate-${crypto.randomUUID()}`),
    );
    const endpoint = `https://relay.test/v1/display-pairings/${encodeURIComponent(`pairing-rate-${crypto.randomUUID()}`)}`;
    for (let index = 0; index < 32; index += 1) {
      const response = await SELF.fetch(endpoint, {
        method: "PUT",
        headers: pairingHeaders(capability),
        body: JSON.stringify({
          ciphertext: `rate-${index}`,
          expiresAt: Date.now() + 30_000,
          iv: `rate-iv-${index}`,
        }),
      });
      expect(response.status).toBe(204);
    }

    const limited = await SELF.fetch(endpoint, {
      method: "PUT",
      headers: pairingHeaders(capability),
      body: JSON.stringify({
        ciphertext: "rate-limited",
        expiresAt: Date.now() + 30_000,
        iv: "rate-limited-iv",
      }),
    });
    expect(limited.status).toBe(429);
    expect(await jsonBody(limited)).toEqual({ code: "rate-limited" });
  });
});

describe("Cloudflare Worker opaque WebSocket relay integration", () => {
  it("registers two peers and relays an opaque envelope without interpreting it", async () => {
    const tableId = `table-websocket-${crypto.randomUUID()}`;
    const issued = await issueTicket(tableId, "host-peer");
    const ticket = issued.body.accessToken;
    if (typeof ticket !== "string") throw new Error("ticket was not issued");

    const host = await openRelayPeer(ticket, tableId, "host-peer");
    const playerIssued = await issueTicket(tableId, "player-peer");
    const playerTicket = playerIssued.body.accessToken;
    if (typeof playerTicket !== "string")
      throw new Error("player ticket was not issued");
    const player = await openRelayPeer(playerTicket, tableId, "player-peer");
    const envelope = {
      ciphertext: "opaque-ciphertext-without-card-plaintext",
      hostKey: "host-integration",
      messageId: "opaque-message-1",
      protocolVersion: 1,
      recipientPeerId: "player-peer",
      senderPeerId: "host-peer",
      sequence: 1,
      tableId,
    };

    const received = waitForSocketMessage(player, (message) => {
      const value = JSON.parse(message) as JsonRecord;
      return value.type === "envelope";
    });
    const receipt = waitForSocketMessage(host, (message) => {
      const value = JSON.parse(message) as JsonRecord;
      return (
        value.type === "receipt" &&
        value.status === "relayed" &&
        value.messageId === envelope.messageId
      );
    });
    host.send(JSON.stringify({ envelope, type: "envelope" }));
    expect(JSON.parse(await received)).toEqual({
      envelope,
      type: "envelope",
    });
    expect(JSON.parse(await receipt)).toEqual({
      messageId: envelope.messageId,
      status: "relayed",
      type: "receipt",
    });
    host.close();
    player.close();
  });

  it("deduplicates a receipt retry with the same opaque messageId", async () => {
    const tableId = `table-websocket-dedup-${crypto.randomUUID()}`;
    const hostIssued = await issueTicket(tableId, "host-peer");
    const hostTicket = hostIssued.body.accessToken;
    if (typeof hostTicket !== "string")
      throw new Error("host ticket was not issued");
    const playerIssued = await issueTicket(tableId, "player-peer");
    const playerTicket = playerIssued.body.accessToken;
    if (typeof playerTicket !== "string")
      throw new Error("player ticket was not issued");

    const host = await openRelayPeer(hostTicket, tableId, "host-peer");
    const player = await openRelayPeer(playerTicket, tableId, "player-peer");
    const envelope = {
      ciphertext: "opaque-receipt-delayed-frame",
      hostKey: "host-integration",
      messageId: "opaque-stable-retry-id",
      protocolVersion: 1,
      recipientPeerId: "player-peer",
      senderPeerId: "host-peer",
      sequence: 1,
      tableId,
    };
    let receivedCount = 0;
    const countEnvelopes = (event: MessageEvent) => {
      const value = JSON.parse(String(event.data)) as JsonRecord;
      if (value.type === "envelope") receivedCount += 1;
    };
    player.addEventListener("message", countEnvelopes);
    const firstReceipt = waitForSocketMessage(host, (message) => {
      const value = JSON.parse(message) as JsonRecord;
      return (
        value.type === "receipt" &&
        value.status === "relayed" &&
        value.messageId === envelope.messageId
      );
    });
    host.send(JSON.stringify({ envelope, type: "envelope" }));
    await firstReceipt;

    const retryReceipt = waitForSocketMessage(host, (message) => {
      const value = JSON.parse(message) as JsonRecord;
      return (
        value.type === "receipt" &&
        value.status === "relayed" &&
        value.messageId === envelope.messageId
      );
    });
    host.send(JSON.stringify({ envelope, type: "envelope" }));
    await retryReceipt;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(receivedCount).toBe(1);
    player.removeEventListener("message", countEnvelopes);
    host.close();
    player.close();
  });

  it("rebuilds the active peer index after Durable Object hibernation", async () => {
    const tableId = `table-websocket-eviction-${crypto.randomUUID()}`;
    const issued = await issueTicket(tableId, "host-peer");
    const ticket = issued.body.accessToken;
    if (typeof ticket !== "string") throw new Error("ticket was not issued");

    const host = await openRelayPeer(ticket, tableId, "host-peer");
    const playerIssued = await issueTicket(tableId, "player-peer");
    const playerTicket = playerIssued.body.accessToken;
    if (typeof playerTicket !== "string")
      throw new Error("player ticket was not issued");
    const player = await openRelayPeer(playerTicket, tableId, "player-peer");
    await evictDurableObject(
      env.RELAY_HUB.get(env.RELAY_HUB.idFromName("global")),
    );

    const envelope = {
      ciphertext: "opaque-after-hibernation",
      hostKey: "host-integration",
      messageId: "opaque-after-hibernation-1",
      protocolVersion: 1,
      recipientPeerId: "player-peer",
      senderPeerId: "host-peer",
      sequence: 2,
      tableId,
    };
    const received = waitForSocketMessage(player, (message) => {
      const value = JSON.parse(message) as JsonRecord;
      return value.type === "envelope";
    });
    host.send(JSON.stringify({ envelope, type: "envelope" }));
    expect(JSON.parse(await received)).toEqual({ envelope, type: "envelope" });
    host.close();
    player.close();
  });
});
