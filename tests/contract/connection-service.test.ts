import { describe, expect, it, vi } from "vitest";

import {
  createConnectionBroker,
  createDisplayPairingMailbox,
  type RelayClient,
} from "@html-poker/connection-service";

function client(clientId: string): RelayClient {
  return {
    clientId,
    close: vi.fn(),
    send: vi.fn(),
  };
}

describe("card-blind Connection Service broker", () => {
  it("does not forward the same opaque messageId twice during a receipt retry", () => {
    const broker = createConnectionBroker({ accessToken: "operator-secret" });
    const host = client("host-socket");
    const player = client("player-socket");
    const hostIssued = broker.issueSession({
      hostKey: "host-key-a",
      operatorToken: "operator-secret",
      peerId: "host-peer",
      protocolVersion: 1,
      tableId: "table-a",
    });
    const playerIssued = broker.issueSession({
      hostKey: "host-key-a",
      operatorToken: "operator-secret",
      peerId: "player-peer",
      protocolVersion: 1,
      tableId: "table-a",
    });
    if (hostIssued.status !== "issued" || playerIssued.status !== "issued") {
      throw new Error("Expected relay tickets.");
    }
    for (const [peerId, relayClient] of [
      ["host-peer", host],
      ["player-peer", player],
    ] as const) {
      expect(
        broker.register(relayClient, {
          accessToken:
            peerId === "host-peer"
              ? hostIssued.ticket.accessToken
              : playerIssued.ticket.accessToken,
          hostKey: "host-key-a",
          peerId,
          protocolVersion: 1,
          tableId: "table-a",
        }),
      ).toEqual({ status: "accepted" });
    }

    const frame = JSON.stringify({
      envelope: {
        ciphertext: "opaque",
        hostKey: "host-key-a",
        messageId: "stable-message-id",
        protocolVersion: 1,
        recipientPeerId: "player-peer",
        senderPeerId: "host-peer",
        sequence: 1,
        tableId: "table-a",
      },
      type: "envelope",
    });

    expect(broker.receive(host.clientId, frame)).toEqual({
      status: "relayed",
    });
    expect(broker.receive(host.clientId, frame)).toEqual({
      status: "relayed",
    });
    expect(player.send).toHaveBeenCalledTimes(1);
  });

  it("relays opaque envelopes only within one bound table and host key", () => {
    const metadata: unknown[] = [];
    const broker = createConnectionBroker({
      accessToken: "operator-secret",
      onMetadata: (entry) => metadata.push(entry),
    });
    const host = client("host-socket");
    const player = client("player-socket");
    const issued = broker.issueSession({
      hostKey: "host-key-a",
      operatorToken: "operator-secret",
      peerId: "host-peer",
      protocolVersion: 1,
      tableId: "table-a",
    });
    const playerIssued = broker.issueSession({
      hostKey: "host-key-a",
      operatorToken: "operator-secret",
      peerId: "player-peer",
      protocolVersion: 1,
      tableId: "table-a",
    });
    if (playerIssued.status !== "issued")
      throw new Error("Expected a player relay ticket.");
    if (issued.status !== "issued") throw new Error("Expected a relay ticket.");
    expect(
      broker.register(host, {
        accessToken: issued.ticket.accessToken,
        hostKey: "host-key-a",
        peerId: "host-peer",
        protocolVersion: 1,
        tableId: "table-a",
      }),
    ).toEqual({ status: "accepted" });
    expect(
      broker.register(player, {
        accessToken: playerIssued.ticket.accessToken,
        hostKey: "host-key-a",
        peerId: "player-peer",
        protocolVersion: 1,
        tableId: "table-a",
      }),
    ).toEqual({ status: "accepted" });

    const opaqueCardCanary = "ciphertext-that-happens-to-contain-As";
    const frame = JSON.stringify({
      envelope: {
        ciphertext: opaqueCardCanary,
        hostKey: "host-key-a",
        messageId: "message-1",
        protocolVersion: 1,
        recipientPeerId: "player-peer",
        senderPeerId: "host-peer",
        sequence: 1,
        tableId: "table-a",
      },
      type: "envelope",
    });
    expect(broker.receive(host.clientId, frame)).toEqual({ status: "relayed" });
    expect(player.send).toHaveBeenCalledWith(frame);
    expect(JSON.stringify(metadata)).not.toContain(opaqueCardCanary);
    expect(metadata).toContainEqual(
      expect.objectContaining({
        byteLength: frame.length,
        recipientPeerId: "player-peer",
        senderPeerId: "host-peer",
        tableId: "table-a",
      }),
    );
  });

  it("rejects a frame when its registered recipient socket can no longer accept it", () => {
    const broker = createConnectionBroker({ accessToken: "operator-secret" });
    const host = client("host-socket");
    const unavailablePlayer: RelayClient = {
      clientId: "unavailable-player-socket",
      close: vi.fn(),
      send() {
        throw new Error("socket closed");
      },
    };
    const issued = broker.issueSession({
      hostKey: "host-key-a",
      operatorToken: "operator-secret",
      peerId: "host-peer",
      protocolVersion: 1,
      tableId: "table-a",
    });
    if (issued.status !== "issued") throw new Error("Expected a relay ticket.");
    const playerIssued = broker.issueSession({
      hostKey: "host-key-a",
      operatorToken: "operator-secret",
      peerId: "player-peer",
      protocolVersion: 1,
      tableId: "table-a",
    });
    if (playerIssued.status !== "issued")
      throw new Error("Expected a player relay ticket.");
    for (const [peerId, relayClient, ticket] of [
      ["host-peer", host, issued.ticket.accessToken],
      ["player-peer", unavailablePlayer, playerIssued.ticket.accessToken],
    ] as const) {
      expect(
        broker.register(relayClient, {
          accessToken: ticket,
          hostKey: "host-key-a",
          peerId,
          protocolVersion: 1,
          tableId: "table-a",
        }),
      ).toEqual({ status: "accepted" });
    }

    const frame = JSON.stringify({
      envelope: {
        ciphertext: "opaque",
        hostKey: "host-key-a",
        messageId: "recipient-unavailable",
        protocolVersion: 1,
        recipientPeerId: "player-peer",
        senderPeerId: "host-peer",
        sequence: 1,
        tableId: "table-a",
      },
      type: "envelope",
    });
    expect(broker.receive(host.clientId, frame)).toEqual({
      code: "recipient-unavailable",
      status: "rejected",
    });
  });

  it("rejects wrong access, cross-table routing, spoofed senders, and oversized frames", () => {
    const broker = createConnectionBroker({ accessToken: "operator-secret" });
    const first = client("first");
    const second = client("second");
    expect(
      broker.issueSession({
        hostKey: "host-key-a",
        operatorToken: "wrong",
        peerId: "peer-a",
        protocolVersion: 1,
        tableId: "table-a",
      }),
    ).toEqual({ code: "access-denied", status: "rejected" });
    const issued = broker.issueSession({
      hostKey: "host-key-a",
      operatorToken: "operator-secret",
      peerId: "peer-a",
      protocolVersion: 1,
      tableId: "table-a",
    });
    if (issued.status !== "issued") throw new Error("Expected a relay ticket.");
    const secondIssued = broker.issueSession({
      hostKey: "host-key-b",
      operatorToken: "operator-secret",
      peerId: "peer-b",
      protocolVersion: 1,
      tableId: "table-b",
    });
    if (secondIssued.status !== "issued") {
      throw new Error("Expected a separate relay ticket.");
    }
    broker.register(first, {
      accessToken: issued.ticket.accessToken,
      hostKey: "host-key-a",
      peerId: "peer-a",
      protocolVersion: 1,
      tableId: "table-a",
    });
    broker.register(second, {
      accessToken: secondIssued.ticket.accessToken,
      hostKey: "host-key-b",
      peerId: "peer-b",
      protocolVersion: 1,
      tableId: "table-b",
    });

    const envelope = {
      ciphertext: "opaque",
      hostKey: "host-key-a",
      messageId: "message-1",
      protocolVersion: 1,
      recipientPeerId: "peer-b",
      senderPeerId: "peer-a",
      sequence: 1,
      tableId: "table-a",
    };
    expect(
      broker.receive(
        first.clientId,
        JSON.stringify({ envelope, type: "envelope" }),
      ),
    ).toEqual({ code: "recipient-unavailable", status: "rejected" });
    expect(
      broker.receive(
        first.clientId,
        JSON.stringify({
          envelope: { ...envelope, senderPeerId: "spoofed" },
          type: "envelope",
        }),
      ),
    ).toEqual({ code: "binding-mismatch", status: "rejected" });
    expect(broker.receive(first.clientId, "x".repeat(70_000))).toEqual({
      code: "oversized-frame",
      status: "rejected",
    });
  });

  it("holds an encrypted reverse-display response once, then removes it", () => {
    let currentTime = 1_000;
    const mailbox = createDisplayPairingMailbox({ now: () => currentTime });
    const requestId = "display-request-123456789";
    const envelope = {
      ciphertext: "opaque-encrypted-invitation",
      expiresAt: currentTime + 30_000,
      iv: "base64-iv",
    } as const;

    expect(mailbox.take(requestId)).toEqual({ status: "pending" });
    expect(mailbox.put(requestId, envelope, "client-a")).toEqual({
      status: "stored",
    });
    expect(mailbox.take(requestId)).toEqual({ envelope, status: "answered" });
    expect(mailbox.take(requestId)).toEqual({ status: "pending" });

    currentTime += 31_000;
    expect(mailbox.put(requestId, envelope, "client-a")).toEqual({
      code: "expired",
      status: "rejected",
    });
  });

  it("issues a short-lived table-scoped relay credential", () => {
    let currentTime = 5_000;
    const broker = createConnectionBroker({
      accessToken: "operator-secret",
      now: () => currentTime,
      sessionTtlMs: 60_000,
    });
    const issued = broker.issueSession({
      hostKey: "host-key-a",
      operatorToken: "operator-secret",
      peerId: "peer-a",
      protocolVersion: 1,
      tableId: "table-a",
    });
    if (issued.status !== "issued") throw new Error("Expected a relay ticket.");
    expect(issued.ticket.expiresAt).toBe(65_000);
    const scopedClient = client("scoped-client");
    expect(
      broker.register(scopedClient, {
        accessToken: issued.ticket.accessToken,
        hostKey: "another-host",
        peerId: "peer-a",
        protocolVersion: 1,
        tableId: "table-a",
      }),
    ).toEqual({ code: "binding-mismatch", status: "rejected" });
    currentTime = 65_001;
    expect(
      broker.register(scopedClient, {
        accessToken: issued.ticket.accessToken,
        hostKey: "host-key-a",
        peerId: "peer-a",
        protocolVersion: 1,
        tableId: "table-a",
      }),
    ).toEqual({ code: "session-expired", status: "rejected" });
  });

  it("renews the same table ticket without changing its scoped capability", () => {
    let currentTime = 10_000;
    const broker = createConnectionBroker({
      accessToken: "operator-secret",
      now: () => currentTime,
      sessionTtlMs: 60_000,
    });
    const first = broker.issueSession({
      hostKey: "host-key-a",
      operatorToken: "operator-secret",
      peerId: "peer-a",
      protocolVersion: 1,
      tableId: "table-a",
    });
    if (first.status !== "issued") throw new Error("Expected a relay ticket.");

    currentTime = 50_000;
    const renewed = broker.issueSession({
      hostKey: "host-key-a",
      operatorToken: "operator-secret",
      peerId: "peer-a",
      protocolVersion: 1,
      tableId: "table-a",
    });
    if (renewed.status !== "issued") {
      throw new Error("Expected the scoped relay ticket to renew.");
    }
    expect(renewed.ticket).toEqual({
      accessToken: first.ticket.accessToken,
      expiresAt: 110_000,
      pairingWriteCapability: first.ticket.pairingWriteCapability,
      peerId: "peer-a",
    });

    currentTime = 75_000;
    expect(
      broker.register(client("renewed-client"), {
        accessToken: first.ticket.accessToken,
        hostKey: "host-key-a",
        peerId: "peer-a",
        protocolVersion: 1,
        tableId: "table-a",
      }),
    ).toEqual({ status: "accepted" });
  });

  it("fails closed for malformed broker input and duplicate peer registration", () => {
    expect(() => createConnectionBroker({ accessToken: "" })).toThrow(
      "operator access token",
    );
    expect(() =>
      createConnectionBroker({
        accessToken: "operator-secret",
        sessionTtlMs: 59_999,
      }),
    ).toThrow("at least one minute");

    const broker = createConnectionBroker({ accessToken: "operator-secret" });
    expect(broker.receive("unknown-client", "not-json")).toEqual({
      code: "client-unknown",
      status: "rejected",
    });
    expect(
      broker.issueSession({
        hostKey: "",
        operatorToken: "operator-secret",
        peerId: "peer-a",
        protocolVersion: 1,
        tableId: "table-a",
      }),
    ).toEqual({ code: "binding-mismatch", status: "rejected" });

    const issued = broker.issueSession({
      hostKey: "host-key-a",
      operatorToken: "operator-secret",
      peerId: "peer-a",
      protocolVersion: 1,
      tableId: "table-a",
    });
    if (issued.status !== "issued") throw new Error("Expected a relay ticket.");
    const first = client("first");
    const registration = {
      accessToken: issued.ticket.accessToken,
      hostKey: "host-key-a",
      peerId: "peer-a",
      protocolVersion: 1,
      tableId: "table-a",
    } as const;
    expect(broker.register(first, registration)).toEqual({
      status: "accepted",
    });
    expect(broker.register(first, registration)).toEqual({
      code: "peer-conflict",
      status: "rejected",
    });
    expect(
      broker.register(client("invalid"), { ...registration, peerId: "" }),
    ).toEqual({ code: "binding-mismatch", status: "rejected" });
  });

  it("bounds and expires display-pairing mail without leaking the envelope", () => {
    let currentTime = 2_000;
    const mailbox = createDisplayPairingMailbox({
      maxEntries: 1,
      maxTtlMs: 10_000,
      now: () => currentTime,
    });
    const firstRequest = "display-request-123456789";
    const secondRequest = "display-request-987654321";
    const envelope = {
      ciphertext: "opaque-encrypted-invitation",
      expiresAt: currentTime + 5_000,
      iv: "base64-iv",
    } as const;

    expect(mailbox.put("short", envelope, "client-a")).toEqual({
      code: "invalid-request",
      status: "rejected",
    });
    expect(
      mailbox.put(
        firstRequest,
        {
          ...envelope,
          expiresAt: currentTime + 20_000,
        },
        "client-a",
      ),
    ).toEqual({ code: "invalid-envelope", status: "rejected" });
    expect(mailbox.put(firstRequest, envelope, "client-a")).toEqual({
      status: "stored",
    });
    expect(mailbox.put(secondRequest, envelope, "client-a")).toEqual({
      code: "capacity",
      status: "rejected",
    });

    currentTime += 5_001;
    expect(mailbox.take(firstRequest)).toEqual({ status: "pending" });
  });
});
