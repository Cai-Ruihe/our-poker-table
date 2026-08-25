export const MAX_FRAME_BYTES = 65_536;
export const MAX_REQUEST_BYTES = 65_536;
export const DEFAULT_SESSION_TTL_MS = 4 * 60 * 60 * 1_000;
export const MAX_DISPLAY_PAIRING_TTL_MS = 15 * 60 * 1_000;
export const MAX_DISPLAY_PAIRINGS = 1_024;
export const MAX_DISPLAY_PAIRINGS_PER_CLIENT = 8;
export const MAX_DISPLAY_PAIRING_WRITES_PER_CLIENT = 32;
export const DISPLAY_PAIRING_RATE_WINDOW_MS = 60_000;
export const RELAY_DEDUPLICATION_WINDOW_MS = 2 * 60_000;

export interface OpaqueEnvelope {
  readonly ciphertext: string;
  readonly hostKey: string;
  readonly messageId: string;
  readonly protocolVersion: number;
  readonly recipientPeerId: string;
  readonly senderPeerId: string;
  readonly sequence: number;
  readonly tableId: string;
}

export interface RelayRegistration {
  readonly accessToken: string;
  readonly hostKey: string;
  readonly peerId: string;
  readonly protocolVersion: number;
  readonly tableId: string;
}

export interface DisplayPairingEnvelope {
  readonly ciphertext: string;
  readonly expiresAt: number;
  readonly iv: string;
}

export interface SessionBinding {
  readonly hostKey: string;
  readonly protocolVersion: number;
  readonly tableId: string;
}

export type RelayRejectionCode =
  | "access-denied"
  | "binding-mismatch"
  | "client-unknown"
  | "invalid-frame"
  | "oversized-frame"
  | "peer-conflict"
  | "recipient-unavailable"
  | "session-expired";

export function boundedString(
  value: unknown,
  maximum: number,
): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maximum
  );
}

export function validRegistration(registration: RelayRegistration): boolean {
  return (
    boundedString(registration.accessToken, 512) &&
    boundedString(registration.hostKey, 512) &&
    boundedString(registration.peerId, 128) &&
    boundedString(registration.tableId, 128) &&
    Number.isInteger(registration.protocolVersion) &&
    registration.protocolVersion >= 1
  );
}

export function sessionBindingMatches(
  left: SessionBinding & { readonly peerId: string },
  right: SessionBinding & { readonly peerId: string },
): boolean {
  return bindingMatches(left, right) && left.peerId === right.peerId;
}

export function validEnvelope(envelope: OpaqueEnvelope): boolean {
  return (
    boundedString(envelope.ciphertext, MAX_FRAME_BYTES) &&
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

export function validDisplayPairingRequest(value: string): boolean {
  return value.length >= 16 && value.length <= 128;
}

export function validDisplayPairingEnvelope(
  value: DisplayPairingEnvelope,
  now: number,
): boolean {
  return (
    boundedString(value.ciphertext, MAX_FRAME_BYTES) &&
    boundedString(value.iv, 512) &&
    Number.isSafeInteger(value.expiresAt) &&
    value.expiresAt > now &&
    value.expiresAt <= now + MAX_DISPLAY_PAIRING_TTL_MS
  );
}

export function peerKey(
  value: SessionBinding & { readonly peerId: string },
): string {
  return JSON.stringify([
    value.tableId,
    value.hostKey,
    value.protocolVersion,
    value.peerId,
  ]);
}

export function bindingMatches(
  left: SessionBinding,
  right: SessionBinding,
): boolean {
  return (
    left.tableId === right.tableId &&
    left.hostKey === right.hostKey &&
    left.protocolVersion === right.protocolVersion
  );
}

export function parseSessionTtl(raw: string | undefined): number {
  if (!raw) return DEFAULT_SESSION_TTL_MS;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 60_000
    ? parsed
    : DEFAULT_SESSION_TTL_MS;
}
