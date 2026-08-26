import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBroadcastChannelAdapter,
  createConnectivityStrategy,
  createWebSocketRelayAdapter,
  type OpaqueEnvelope,
  type TransportAdapter,
  type TransportChannel,
} from "@html-poker/realtime-transport";

type StubListener = (event: { readonly data?: unknown }) => void;

class StubBroadcastChannel {
  static instances: StubBroadcastChannel[] = [];

  readonly listeners = new Set<StubListener>();
  closed = false;

  constructor(readonly name: string) {
    StubBroadcastChannel.instances.push(this);
  }

  addEventListener(type: string, listener: StubListener): void {
    if (type === "message") this.listeners.add(listener);
  }

  close(): void {
    this.closed = true;
  }

  postMessage(data: unknown): void {
    for (const channel of StubBroadcastChannel.instances) {
      if (!channel.closed && channel.name === this.name) {
        for (const listener of channel.listeners) listener({ data });
      }
    }
  }

  removeEventListener(type: string, listener: StubListener): void {
    if (type === "message") this.listeners.delete(listener);
  }
}

class StubWebSocket {
  static readonly OPEN = 1;
  static instances: StubWebSocket[] = [];

  readonly listeners = new Map<string, Set<StubListener>>();
  readonly sent: string[] = [];
  readyState = StubWebSocket.OPEN;

  constructor(readonly url: string) {
    StubWebSocket.instances.push(this);
    queueMicrotask(() => this.dispatch("open"));
  }

  addEventListener(
    type: string,
    listener: StubListener,
    options?: { readonly once?: boolean },
  ): void {
    const listeners = this.listeners.get(type) ?? new Set<StubListener>();
    if (options?.once) {
      const once: StubListener = (event) => {
        listeners.delete(once);
        listener(event);
      };
      listeners.add(once);
    } else {
      listeners.add(listener);
    }
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.readyState = 3;
  }

  dispatch(type: string, data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }

  removeEventListener(type: string, listener: StubListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(frame: string): void {
    this.sent.push(frame);
  }
}

afterEach(() => {
  StubBroadcastChannel.instances = [];
  StubWebSocket.instances = [];
  vi.unstubAllGlobals();
});

function channel(route: TransportChannel["route"]): TransportChannel {
  return {
    close: vi.fn(),
    route,
    send: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
  };
}

function adapter(
  route: TransportAdapter["route"],
  connect: TransportAdapter["connect"],
): TransportAdapter {
  return { connect, route };
}

const session = {
  hostKey: "host-key-a",
  localPeerId: "peer-a",
  protocolVersion: 1,
  remotePeerId: "peer-b",
  tableId: "table-a",
} as const;

describe("Table-side Mode ConnectivityStrategy", () => {
  it("attempts direct, private relay, then cloud relay in the locked order", async () => {
    const calls: string[] = [];
    const privateChannel = channel("private-relay");
    const strategy = createConnectivityStrategy({
      adapters: [
        adapter("cloud-relay", async () => {
          calls.push("cloud-relay");
          return channel("cloud-relay");
        }),
        adapter("direct", async () => {
          calls.push("direct");
          throw new Error("direct path unavailable");
        }),
        adapter("private-relay", async () => {
          calls.push("private-relay");
          return privateChannel;
        }),
      ],
      timeoutMs: 100,
    });

    await expect(strategy.connect(session)).resolves.toMatchObject({
      attemptedRoutes: ["direct", "private-relay"],
      channel: privateChannel,
      route: "private-relay",
      status: "connected",
    });
    expect(calls).toEqual(["direct", "private-relay"]);
  });

  it("reports every failed route without silently changing table identity", async () => {
    const seenSessions: unknown[] = [];
    const strategy = createConnectivityStrategy({
      adapters: (["direct", "private-relay", "cloud-relay"] as const).map(
        (route) =>
          adapter(route, async (received) => {
            seenSessions.push(received);
            throw new Error(`${route} unavailable`);
          }),
      ),
      timeoutMs: 100,
    });

    await expect(strategy.connect(session)).resolves.toEqual({
      attemptedRoutes: ["direct", "private-relay", "cloud-relay"],
      failures: [
        { code: "connect-failed", route: "direct" },
        { code: "connect-failed", route: "private-relay" },
        { code: "connect-failed", route: "cloud-relay" },
      ],
      status: "disconnected",
    });
    expect(seenSessions).toEqual([session, session, session]);
  });

  it("carries only bounded opaque envelopes and rejects identity confusion", async () => {
    const connected = channel("direct");
    const strategy = createConnectivityStrategy({
      adapters: [adapter("direct", async () => connected)],
      timeoutMs: 100,
    });
    const result = await strategy.connect(session);
    if (result.status !== "connected") throw new Error("Expected connection.");
    const envelope: OpaqueEnvelope = {
      ciphertext: "base64:opaque-payload",
      hostKey: "host-key-a",
      messageId: "message-1",
      protocolVersion: 1,
      recipientPeerId: "peer-b",
      senderPeerId: "peer-a",
      sequence: 1,
      tableId: "table-a",
    };
    await expect(result.send(envelope)).resolves.toEqual({ status: "sent" });
    expect(connected.send).toHaveBeenCalledWith(envelope);

    await expect(
      result.send({ ...envelope, tableId: "other-table" }),
    ).resolves.toEqual({ code: "binding-mismatch", status: "rejected" });
    await expect(
      result.send({ ...envelope, ciphertext: "x".repeat(70_000) }),
    ).resolves.toEqual({ code: "oversized-envelope", status: "rejected" });
  });

  it("rejects malformed or failed outbound envelopes and filters malformed inbound frames", async () => {
    const connected = channel("direct");
    const strategy = createConnectivityStrategy({
      adapters: [adapter("direct", async () => connected)],
      timeoutMs: 100,
    });
    const result = await strategy.connect(session);
    if (result.status !== "connected") throw new Error("Expected connection.");
    const envelope: OpaqueEnvelope = {
      ciphertext: "opaque",
      hostKey: "host-key-a",
      messageId: "message-1",
      protocolVersion: 1,
      recipientPeerId: "peer-b",
      senderPeerId: "peer-a",
      sequence: 1,
      tableId: "table-a",
    };

    await expect(
      result.send({ ...envelope, messageId: "", sequence: -1 }),
    ).resolves.toEqual({ code: "invalid-envelope", status: "rejected" });
    vi.mocked(connected.send).mockRejectedValueOnce(new Error("socket closed"));
    await expect(result.send(envelope)).resolves.toEqual({
      code: "send-failed",
      status: "rejected",
    });

    const received = vi.fn();
    result.subscribe(received);
    const listener = vi.mocked(connected.subscribe).mock.calls[0]?.[0];
    if (!listener) throw new Error("Expected the channel subscription.");
    listener({ ...envelope, recipientPeerId: "wrong-peer" });
    listener({
      ...envelope,
      senderPeerId: "peer-b",
      recipientPeerId: "peer-a",
    });
    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({ senderPeerId: "peer-b" }),
    );
  });

  it("uses a scoped BroadcastChannel and ignores frames for another peer", async () => {
    vi.stubGlobal("BroadcastChannel", StubBroadcastChannel);
    const adapter = createBroadcastChannelAdapter({ channelPrefix: "phase-1" });
    const sender = await adapter.connect(session);
    const recipient = await adapter.connect({
      ...session,
      localPeerId: "peer-b",
      remotePeerId: "peer-a",
    });
    const received = vi.fn();
    recipient.subscribe(received);
    const envelope: OpaqueEnvelope = {
      ciphertext: "opaque",
      hostKey: "host-key-a",
      messageId: "message-1",
      protocolVersion: 1,
      recipientPeerId: "peer-b",
      senderPeerId: "peer-a",
      sequence: 1,
      tableId: "table-a",
    };

    await sender.send(envelope);
    await sender.send({ ...envelope, recipientPeerId: "another-peer" });
    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith(envelope);
    sender.close();
    recipient.close();
  });

  it("registers an opaque WebSocket route and ignores malformed relay input", async () => {
    vi.stubGlobal("WebSocket", StubWebSocket);
    const adapter = createWebSocketRelayAdapter({
      accessToken: "scoped-ticket",
      route: "private-relay",
      url: "wss://relay.example.test/v1/relay",
    });
    const connected = await adapter.connect(session);
    const socket = StubWebSocket.instances[0];
    if (!socket) throw new Error("Expected a relay socket.");
    expect(socket.url).toBe("wss://relay.example.test/v1/relay");
    expect(JSON.parse(socket.sent[0] ?? "{}")).toEqual({
      accessToken: "scoped-ticket",
      hostKey: "host-key-a",
      peerId: "peer-a",
      protocolVersion: 1,
      tableId: "table-a",
      type: "register",
    });

    const received = vi.fn();
    connected.subscribe(received);
    socket.dispatch("message", "not-json");
    socket.dispatch(
      "message",
      JSON.stringify({
        envelope: {
          ciphertext: "opaque",
          hostKey: "host-key-a",
          messageId: "message-1",
          protocolVersion: 1,
          recipientPeerId: "peer-a",
          senderPeerId: "peer-b",
          sequence: 1,
          tableId: "table-a",
        },
        type: "envelope",
      }),
    );
    expect(received).toHaveBeenCalledTimes(1);

    await connected.send({
      ciphertext: "opaque",
      hostKey: "host-key-a",
      messageId: "message-2",
      protocolVersion: 1,
      recipientPeerId: "peer-b",
      senderPeerId: "peer-a",
      sequence: 2,
      tableId: "table-a",
    });
    expect(JSON.parse(socket.sent[1] ?? "{}")).toMatchObject({
      type: "envelope",
    });
    socket.readyState = 0;
    await expect(
      connected.send({
        ciphertext: "opaque",
        hostKey: "host-key-a",
        messageId: "message-3",
        protocolVersion: 1,
        recipientPeerId: "peer-b",
        senderPeerId: "peer-a",
        sequence: 3,
        tableId: "table-a",
      }),
    ).rejects.toThrow("Relay is not open.");
    connected.close();
  });
});
