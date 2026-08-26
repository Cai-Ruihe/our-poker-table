import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { OpaqueEnvelope } from "@html-poker/realtime-transport";

export interface RelayClient {
  readonly clientId: string;
  close(code: number, reason: string): void;
  send(frame: string): void;
}

export interface RelayRegistration {
  readonly accessToken: string;
  readonly hostKey: string;
  readonly peerId: string;
  readonly protocolVersion: number;
  readonly tableId: string;
}

export interface RelayMetadata {
  readonly byteLength: number;
  readonly recipientPeerId: string;
  readonly senderPeerId: string;
  readonly tableId: string;
  readonly timestamp: number;
}

export type BrokerResult =
  | { readonly status: "accepted" | "relayed" }
  | {
      readonly code:
        | "access-denied"
        | "binding-mismatch"
        | "client-unknown"
        | "invalid-frame"
        | "oversized-frame"
        | "peer-conflict"
        | "recipient-unavailable"
        | "session-expired";
      readonly status: "rejected";
    };

export interface RelaySessionRequest {
  readonly hostKey: string;
  readonly operatorToken: string;
  readonly peerId: string;
  readonly protocolVersion: number;
  readonly tableId: string;
}

export interface RelaySessionTicket {
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly pairingWriteCapability: string;
  readonly peerId: string;
}

export type RelaySessionResult =
  | { readonly status: "issued"; readonly ticket: RelaySessionTicket }
  | {
      readonly code: "access-denied" | "binding-mismatch";
      readonly status: "rejected";
    };

export interface ConnectionBroker {
  issueSession(request: RelaySessionRequest): RelaySessionResult;
  validatePairingWriteCapability(capability: string): string | undefined;
  receive(clientId: string, frame: string): BrokerResult;
  register(client: RelayClient, registration: RelayRegistration): BrokerResult;
  unregister(clientId: string): void;
}

export interface ConnectionBrokerOptions {
  readonly accessToken: string;
  readonly maxFrameBytes?: number;
  readonly now?: () => number;
  readonly onMetadata?: (metadata: RelayMetadata) => void;
  readonly sessionTtlMs?: number;
}

/**
 * An opaque response to an unpaired Table-side Mode display. The Connection
 * Service stores only this encrypted envelope; the display QR carries the
 * decryption secret and the host chooses the requested role by scanning it.
 */
export interface DisplayPairingEnvelope {
  readonly ciphertext: string;
  readonly expiresAt: number;
  readonly iv: string;
}

export type DisplayPairingPutResult =
  | { readonly status: "stored" }
  | {
      readonly code:
        | "capacity"
        | "client-capacity"
        | "expired"
        | "invalid-envelope"
        | "invalid-request"
        | "rate-limited";
      readonly status: "rejected";
    };

export type DisplayPairingTakeResult =
  | { readonly status: "pending" }
  | { readonly envelope: DisplayPairingEnvelope; readonly status: "answered" };

export interface DisplayPairingMailbox {
  put(
    requestId: string,
    envelope: DisplayPairingEnvelope,
    clientId: string,
  ): DisplayPairingPutResult;
  take(requestId: string): DisplayPairingTakeResult;
}

export interface DisplayPairingMailboxOptions {
  readonly maxEntriesPerClient?: number;
  readonly maxEntries?: number;
  readonly maxWritesPerClient?: number;
  readonly maxTtlMs?: number;
  readonly now?: () => number;
  readonly rateWindowMs?: number;
}

interface ActivePeer {
  readonly client: RelayClient;
  readonly registration: Omit<RelayRegistration, "accessToken">;
}

interface IssuedSession {
  expiresAt: number;
  readonly pairingWriteCapability: string;
  readonly registration: Omit<RelayRegistration, "accessToken">;
}

interface SeenEnvelope {
  readonly expiresAt: number;
  readonly frame: string;
}

const relayDeduplicationWindowMs = 2 * 60 * 1_000;

function hashPairingCapability(capability: string): string {
  return createHash("sha256").update(capability, "utf8").digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

function boundedString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maximum
  );
}

function validDisplayPairingRequest(value: string): boolean {
  return value.length >= 16 && value.length <= 128;
}

function validDisplayPairingEnvelope(
  value: DisplayPairingEnvelope,
  now: number,
  maxTtlMs: number,
): boolean {
  return (
    boundedString(value.ciphertext, 65_536) &&
    boundedString(value.iv, 512) &&
    Number.isSafeInteger(value.expiresAt) &&
    value.expiresAt > now &&
    value.expiresAt <= now + maxTtlMs
  );
}

function validRegistration(registration: RelayRegistration): boolean {
  return (
    boundedString(registration.accessToken, 512) &&
    boundedString(registration.hostKey, 512) &&
    boundedString(registration.peerId, 128) &&
    boundedString(registration.tableId, 128) &&
    Number.isInteger(registration.protocolVersion) &&
    registration.protocolVersion >= 1
  );
}

function validEnvelope(envelope: OpaqueEnvelope): boolean {
  return (
    boundedString(envelope.ciphertext, 65_536) &&
    boundedString(envelope.hostKey, 512) &&
    boundedString(envelope.messageId, 128) &&
    boundedString(envelope.recipientPeerId, 128) &&
    boundedString(envelope.senderPeerId, 128) &&
    boundedString(envelope.tableId, 128) &&
    Number.isInteger(envelope.protocolVersion) &&
    envelope.protocolVersion >= 1 &&
    Number.isSafeInteger(envelope.sequence) &&
    envelope.sequence >= 0
  );
}

function peerKey(registration: {
  readonly hostKey: string;
  readonly peerId: string;
  readonly protocolVersion: number;
  readonly tableId: string;
}): string {
  return JSON.stringify([
    registration.tableId,
    registration.hostKey,
    registration.protocolVersion,
    registration.peerId,
  ]);
}

function sessionKey(
  registration: Omit<RelayRegistration, "accessToken">,
): string {
  return JSON.stringify([
    registration.tableId,
    registration.hostKey,
    registration.protocolVersion,
    registration.peerId,
  ]);
}

function envelopeKey(envelope: OpaqueEnvelope): string {
  return JSON.stringify([
    envelope.tableId,
    envelope.hostKey,
    envelope.protocolVersion,
    envelope.senderPeerId,
    envelope.recipientPeerId,
    envelope.messageId,
  ]);
}

export function createConnectionBroker(
  options: ConnectionBrokerOptions,
): ConnectionBroker {
  if (!boundedString(options.accessToken, 512)) {
    throw new Error("A non-empty operator access token is required.");
  }
  const maxFrameBytes = options.maxFrameBytes ?? 65_536;
  const now = options.now ?? Date.now;
  const sessionTtlMs = options.sessionTtlMs ?? 4 * 60 * 60 * 1_000;
  if (!Number.isSafeInteger(sessionTtlMs) || sessionTtlMs < 60_000) {
    throw new Error(
      "Connection Service session TTL must be at least one minute.",
    );
  }
  const peersByClient = new Map<string, ActivePeer>();
  const clientsByPeer = new Map<string, ActivePeer>();
  const sessionsByToken = new Map<string, IssuedSession>();
  const sessionsByPairingCapability = new Map<string, IssuedSession>();
  const sessionTokensByBinding = new Map<string, string>();
  const seenEnvelopes = new Map<string, SeenEnvelope>();

  function sweepSessions(currentTime: number): void {
    for (const [token, session] of sessionsByToken) {
      if (session.expiresAt <= currentTime) {
        sessionsByToken.delete(token);
        sessionsByPairingCapability.delete(session.pairingWriteCapability);
        const key = sessionKey(session.registration);
        if (sessionTokensByBinding.get(key) === token) {
          sessionTokensByBinding.delete(key);
        }
      }
    }
  }

  function sweepSeenEnvelopes(currentTime: number): void {
    for (const [key, entry] of seenEnvelopes) {
      if (entry.expiresAt <= currentTime) seenEnvelopes.delete(key);
    }
  }

  return {
    issueSession(request) {
      if (!safeEqual(request.operatorToken, options.accessToken)) {
        return { code: "access-denied", status: "rejected" };
      }
      if (
        !boundedString(request.hostKey, 512) ||
        !boundedString(request.peerId, 128) ||
        !boundedString(request.tableId, 128) ||
        !Number.isInteger(request.protocolVersion) ||
        request.protocolVersion < 1
      ) {
        return { code: "binding-mismatch", status: "rejected" };
      }
      const currentTime = now();
      sweepSessions(currentTime);
      const registration = {
        hostKey: request.hostKey,
        peerId: request.peerId,
        protocolVersion: request.protocolVersion,
        tableId: request.tableId,
      };
      const key = sessionKey(registration);
      const previousToken = sessionTokensByBinding.get(key);
      const previous = previousToken
        ? sessionsByToken.get(previousToken)
        : undefined;
      const expiresAt = currentTime + sessionTtlMs;
      if (previousToken && previous) {
        previous.expiresAt = expiresAt;
        return {
          status: "issued",
          ticket: {
            accessToken: previousToken,
            expiresAt,
            pairingWriteCapability: previous.pairingWriteCapability,
            peerId: request.peerId,
          },
        };
      }
      const accessToken = randomBytes(32).toString("base64url");
      const pairingWriteCapability = randomBytes(32).toString("base64url");
      const session = {
        expiresAt,
        pairingWriteCapability,
        registration,
      } satisfies IssuedSession;
      sessionsByToken.set(accessToken, session);
      sessionsByPairingCapability.set(pairingWriteCapability, session);
      sessionTokensByBinding.set(key, accessToken);
      return {
        status: "issued",
        ticket: {
          accessToken,
          expiresAt,
          pairingWriteCapability,
          peerId: request.peerId,
        },
      };
    },
    validatePairingWriteCapability(capability) {
      if (!boundedString(capability, 512)) return undefined;
      const currentTime = now();
      sweepSessions(currentTime);
      const session = sessionsByPairingCapability.get(capability);
      if (!session || session.expiresAt <= currentTime) return undefined;
      return hashPairingCapability(capability);
    },
    receive(clientId, frame) {
      const currentTime = now();
      sweepSessions(currentTime);
      sweepSeenEnvelopes(currentTime);
      if (Buffer.byteLength(frame, "utf8") > maxFrameBytes) {
        return { code: "oversized-frame", status: "rejected" };
      }
      const sender = peersByClient.get(clientId);
      if (!sender) return { code: "client-unknown", status: "rejected" };
      let parsed: unknown;
      try {
        parsed = JSON.parse(frame);
      } catch {
        return { code: "invalid-frame", status: "rejected" };
      }
      if (!parsed || typeof parsed !== "object") {
        return { code: "invalid-frame", status: "rejected" };
      }
      const candidate = parsed as {
        readonly envelope?: OpaqueEnvelope;
        readonly type?: string;
      };
      if (
        candidate.type !== "envelope" ||
        !candidate.envelope ||
        !validEnvelope(candidate.envelope)
      ) {
        return { code: "invalid-frame", status: "rejected" };
      }
      const envelope = candidate.envelope;
      const senderRegistration = sender.registration;
      if (
        envelope.senderPeerId !== senderRegistration.peerId ||
        envelope.tableId !== senderRegistration.tableId ||
        envelope.hostKey !== senderRegistration.hostKey ||
        envelope.protocolVersion !== senderRegistration.protocolVersion
      ) {
        return { code: "binding-mismatch", status: "rejected" };
      }
      const deduplicationKey = envelopeKey(envelope);
      const seen = seenEnvelopes.get(deduplicationKey);
      if (seen) {
        return seen.frame === frame
          ? { status: "relayed" }
          : { code: "invalid-frame", status: "rejected" };
      }
      const recipient = clientsByPeer.get(
        peerKey({
          hostKey: envelope.hostKey,
          peerId: envelope.recipientPeerId,
          protocolVersion: envelope.protocolVersion,
          tableId: envelope.tableId,
        }),
      );
      if (!recipient) {
        return { code: "recipient-unavailable", status: "rejected" };
      }
      try {
        recipient.client.send(frame);
      } catch {
        clientsByPeer.delete(peerKey(recipient.registration));
        peersByClient.delete(recipient.client.clientId);
        return { code: "recipient-unavailable", status: "rejected" };
      }
      seenEnvelopes.set(deduplicationKey, {
        expiresAt: currentTime + relayDeduplicationWindowMs,
        frame,
      });
      try {
        options.onMetadata?.({
          byteLength: Buffer.byteLength(frame, "utf8"),
          recipientPeerId: envelope.recipientPeerId,
          senderPeerId: envelope.senderPeerId,
          tableId: envelope.tableId,
          timestamp: now(),
        });
      } catch {
        // Diagnostics failure never blocks the opaque relay.
      }
      return { status: "relayed" };
    },
    register(client, registration) {
      if (!validRegistration(registration)) {
        return { code: "binding-mismatch", status: "rejected" };
      }
      const currentTime = now();
      const session = sessionsByToken.get(registration.accessToken);
      sweepSessions(currentTime);
      if (!session) {
        return { code: "access-denied", status: "rejected" };
      }
      if (session.expiresAt <= currentTime) {
        sessionsByToken.delete(registration.accessToken);
        return { code: "session-expired", status: "rejected" };
      }
      if (
        session.registration.peerId !== registration.peerId ||
        session.registration.tableId !== registration.tableId ||
        session.registration.hostKey !== registration.hostKey ||
        session.registration.protocolVersion !== registration.protocolVersion
      ) {
        return { code: "binding-mismatch", status: "rejected" };
      }
      const key = peerKey(registration);
      if (peersByClient.has(client.clientId) || clientsByPeer.has(key)) {
        return { code: "peer-conflict", status: "rejected" };
      }
      const active: ActivePeer = {
        client,
        registration: {
          hostKey: registration.hostKey,
          peerId: registration.peerId,
          protocolVersion: registration.protocolVersion,
          tableId: registration.tableId,
        },
      };
      peersByClient.set(client.clientId, active);
      clientsByPeer.set(key, active);
      return { status: "accepted" };
    },
    unregister(clientId) {
      const active = peersByClient.get(clientId);
      if (!active) return;
      peersByClient.delete(clientId);
      clientsByPeer.delete(peerKey(active.registration));
    },
  };
}

export function createDisplayPairingMailbox(
  options: DisplayPairingMailboxOptions = {},
): DisplayPairingMailbox {
  const entries = new Map<
    string,
    { readonly clientId: string; readonly envelope: DisplayPairingEnvelope }
  >();
  const writesByClient = new Map<
    string,
    { count: number; windowStartedAt: number }
  >();
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? 1_024;
  const maxEntriesPerClient = options.maxEntriesPerClient ?? 8;
  const maxWritesPerClient = options.maxWritesPerClient ?? 32;
  const maxTtlMs = options.maxTtlMs ?? 15 * 60 * 1_000;
  const rateWindowMs = options.rateWindowMs ?? 60_000;

  function sweep(currentTime: number): void {
    for (const [requestId, entry] of entries) {
      if (entry.envelope.expiresAt <= currentTime) entries.delete(requestId);
    }
  }

  return {
    put(requestId, envelope, clientId) {
      const currentTime = now();
      sweep(currentTime);
      if (!validDisplayPairingRequest(requestId)) {
        return { code: "invalid-request", status: "rejected" };
      }
      if (!boundedString(clientId, 128)) {
        return { code: "rate-limited", status: "rejected" };
      }
      if (!validDisplayPairingEnvelope(envelope, currentTime, maxTtlMs)) {
        return {
          code:
            envelope.expiresAt <= currentTime ? "expired" : "invalid-envelope",
          status: "rejected",
        };
      }
      const existing = entries.get(requestId);
      if (existing && existing.clientId !== clientId) {
        return { code: "rate-limited", status: "rejected" };
      }
      if (!existing && entries.size >= maxEntries) {
        return { code: "capacity", status: "rejected" };
      }
      if (!existing) {
        let activeForClient = 0;
        for (const entry of entries.values()) {
          if (entry.clientId === clientId) activeForClient += 1;
        }
        if (activeForClient >= maxEntriesPerClient) {
          return { code: "client-capacity", status: "rejected" };
        }
      }
      const previousWindow = writesByClient.get(clientId);
      const windowStartedAt = previousWindow?.windowStartedAt ?? currentTime;
      const windowActive = currentTime - windowStartedAt < rateWindowMs;
      const nextCount = windowActive ? (previousWindow?.count ?? 0) + 1 : 1;
      if (nextCount > maxWritesPerClient) {
        return { code: "rate-limited", status: "rejected" };
      }
      writesByClient.set(clientId, {
        count: nextCount,
        windowStartedAt: windowActive ? windowStartedAt : currentTime,
      });
      entries.set(requestId, { clientId, envelope: { ...envelope } });
      return { status: "stored" };
    },
    take(requestId) {
      const currentTime = now();
      sweep(currentTime);
      if (!validDisplayPairingRequest(requestId)) return { status: "pending" };
      const entry = entries.get(requestId);
      if (!entry) return { status: "pending" };
      entries.delete(requestId);
      return { envelope: { ...entry.envelope }, status: "answered" };
    },
  };
}
