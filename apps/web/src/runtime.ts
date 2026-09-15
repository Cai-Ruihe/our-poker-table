import { createCardCustody, type Street } from "@html-poker/card-custody";
import {
  createDiagnosticLog,
  createHandIdGenerator,
  type DiagnosticLog,
} from "@html-poker/diagnostics";
import {
  createTrustedHostAuthority,
  isBettingActionIntent,
  isRulesProfile,
  parsePublicTableHistory,
  type BettingActionIntent,
  type CardStyle,
  type CommandEnvelope,
  type PersistedAuthorityState,
  type PublicProjection,
  type PublicTableHistory,
  type PublicHistoryFrame,
  type RulesProfile,
  type SeatProjection,
  type TableTheme,
  type TrustedHostAuthority,
} from "@html-poker/game-core";
import {
  createRoomIdentity,
  type CapabilityRole,
  type Credential,
  type Invitation,
  type PeerBinding,
  type RedemptionResult,
  type RoomIdentity,
  type RoomIdentityRecoveryState,
  type RoomRoster,
  type RoomSeat,
} from "@html-poker/identity-capabilities";
import {
  acquireExclusiveHostLease,
  createIndexedDbTableStore,
  type AtomicTableStore,
  type ExclusiveHostLease,
} from "@html-poker/persistence";

import {
  acceptHostAirplaneOffer,
  airplaneAnswerOfferId,
  createHostAirplanePairing,
  type AirplanePresentationLanguage,
  type ClientAirplanePairing,
  type HostAirplanePairing,
} from "./airplane";
import {
  ConnectivityRecoveryCoordinator,
  ConnectivityRecoveryBackoffError,
  recordAuthenticatedLivenessMiss,
  resetAuthenticatedLiveness,
  type ConnectivityRecoveryTrigger,
} from "./connection-recovery";

export {
  CONNECTIVITY_RECOVERY_BACKOFF_MS,
  ConnectivityRecoveryBackoffError,
  ConnectivityRecoveryCoordinator,
  recordAuthenticatedLivenessMiss,
  resetAuthenticatedLiveness,
} from "./connection-recovery";
export type {
  AuthenticatedLivenessState,
  ConnectivityRecoveryOptions,
  ConnectivityRecoveryTrigger,
} from "./connection-recovery";

import {
  BUILD_VERSION,
  invitationReleaseIssue,
  IS_PHASE2_BUILD,
  phaseCryptoContext,
  phaseScopedName,
  PROTOCOL_VERSION,
} from "./release-channel";

export { BUILD_VERSION, PROTOCOL_VERSION } from "./release-channel";

const requestTimeoutMs = 7_500;
const invitationTtlMs = 15 * 60 * 1_000;

export type PlayerAction =
  | { readonly action: BettingActionIntent; readonly type: "betting" }
  | { readonly type: "fold" }
  | { readonly type: "undo-fold" }
  | { readonly type: "finalize-fold" }
  | { readonly type: "show" }
  | { readonly sittingOut: boolean; readonly type: "set-sitting-out" }
  | { readonly type: "leave" }
  | { readonly type: "disconnect" };

export type DealerAction =
  | { readonly street: Street; readonly type: "reveal-street" }
  | { readonly type: "end-hand" }
  | { readonly type: "prepare-settlement" }
  | { readonly type: "confirm-settlement" }
  | { readonly type: "start-next-hand" };

function isPlayerAction(value: unknown): value is PlayerAction {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    readonly action?: unknown;
    readonly sittingOut?: unknown;
    readonly type?: unknown;
  };
  if (candidate.type === "betting") {
    return isBettingActionIntent(candidate.action);
  }
  if (candidate.type === "set-sitting-out") {
    return typeof candidate.sittingOut === "boolean";
  }
  return [
    "fold",
    "undo-fold",
    "finalize-fold",
    "show",
    "leave",
    "muck",
    "disconnect",
  ].includes(String(candidate.type));
}

function isDealerAction(value: unknown): value is DealerAction {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    readonly street?: unknown;
    readonly type?: unknown;
  };
  if (candidate.type === "reveal-street") {
    return ["flop", "turn", "river"].includes(String(candidate.street));
  }
  return [
    "end-hand",
    "prepare-settlement",
    "confirm-settlement",
    "start-next-hand",
  ].includes(String(candidate.type));
}

interface JoinRequestMessage {
  readonly ciphertext: string;
  readonly invitationDigest: string;
  readonly iv: string;
  readonly kind: "join-request";
  readonly requestId: string;
}

interface JoinResponseMessage {
  readonly ciphertext: string;
  readonly iv: string;
  readonly kind: "join-response";
  readonly requestId: string;
}

interface CapabilityRequestMessage {
  readonly capabilityId: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly kind: "capability-request";
  readonly requestId: string;
}

interface CapabilityResponseMessage {
  readonly capabilityId: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly kind: "capability-response";
  readonly requestId: string;
}

interface LivenessRequestMessage {
  readonly capabilityId: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly kind: "liveness-request";
  readonly requestId: string;
}

interface LivenessResponseMessage {
  readonly capabilityId: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly kind: "liveness-response";
  readonly requestId: string;
}

interface TableChangedMessage {
  readonly kind: "table-changed";
  readonly revision: number;
}

interface RouteProbeMessage {
  readonly kind: "route-probe";
  readonly requestId: string;
}

interface RouteProbeAckMessage {
  readonly kind: "route-probe-ack";
  readonly requestId: string;
}

interface DirectOfferMessage {
  readonly connectionId: string;
  readonly description: RTCSessionDescriptionInit;
  readonly kind: "direct-offer";
}

interface DirectAnswerMessage {
  readonly connectionId: string;
  readonly description: RTCSessionDescriptionInit;
  readonly kind: "direct-answer";
}

interface DirectCandidateMessage {
  readonly candidate: RTCIceCandidateInit;
  readonly connectionId: string;
  readonly kind: "direct-candidate";
}

type DirectSignalMessage =
  DirectAnswerMessage | DirectCandidateMessage | DirectOfferMessage;

export type RoomMessage =
  | JoinRequestMessage
  | JoinResponseMessage
  | CapabilityRequestMessage
  | CapabilityResponseMessage
  | LivenessRequestMessage
  | LivenessResponseMessage
  | TableChangedMessage
  | RouteProbeMessage
  | RouteProbeAckMessage
  | DirectSignalMessage;

export type RoomRoute = "airplane" | "direct" | "private-relay" | "cloud-relay";
type RelayRoomRoute = "private-relay" | "cloud-relay";

/**
 * Table-side Mode projection refreshes can complete out of order when a table
 * change races a Player action response. A stale result must never replace
 * newer table state.
 */
export function acceptsProjectionRevision(
  currentRevision: number | undefined,
  incomingRevision: number,
): boolean {
  return currentRevision === undefined || incomingRevision >= currentRevision;
}

const logicalMessageIds = new WeakMap<object, string>();

function logicalMessageId(message: RoomMessage): string {
  if ("requestId" in message) return message.requestId;
  const existing = logicalMessageIds.get(message);
  if (existing) return existing;
  const created = makeId("message");
  logicalMessageIds.set(message, created);
  return created;
}

export interface SerialRouteSendResult {
  readonly messageId: string;
  readonly route: RoomRoute;
}

/**
 * Send one logical message through an ordered route list. A receipt timeout
 * can cause the next route to be tried after the first relay already
 * forwarded the frame, so every attempt must carry the same envelope ID.
 */
export async function sendWithSerialRouteFallback(
  message: RoomMessage,
  routes: readonly RoomRoute[],
  send: (
    route: RoomRoute,
    message: RoomMessage,
    messageId: string,
  ) => Promise<void>,
): Promise<SerialRouteSendResult> {
  const messageId = logicalMessageId(message);
  let lastError: unknown;
  for (const route of routes) {
    try {
      await send(route, message, messageId);
      return { messageId, route };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("No configured route could send the message.");
}

interface RoutedRoomMessage {
  readonly message: RoomMessage;
  readonly route: RoomRoute;
  readonly senderPeerId: string;
}

interface RoomWireFrame {
  readonly hostKey: string;
  readonly kind: "html-poker-room-frame";
  readonly message: RoomMessage;
  readonly protocolVersion: number;
  readonly recipientPeerId: string;
  readonly senderPeerId: string;
  readonly tableId: string;
}

interface RelayRuntimeConfig {
  readonly accessToken?: string;
  readonly expiresAt?: number;
  /** Peer identity this short-lived ticket is authorized to register. */
  readonly peerId?: string;
  readonly pairingWriteCapability?: string;
  readonly url: string;
}

/** A deployer-supplied endpoint. It must never contain a bearer credential. */
interface RelayServiceConfig {
  readonly url: string;
}

interface RelayRouteConfiguration {
  readonly cloudRelay?: RelayRuntimeConfig;
  readonly privateRelay?: RelayRuntimeConfig;
}

export interface PokerRuntimeConfig {
  readonly airplaneMode?: boolean;
  readonly cloudRelay?: RelayServiceConfig;
  readonly privateRelay?: RelayServiceConfig;
}

declare global {
  interface Window {
    __HTML_POKER_CONFIG__?: PokerRuntimeConfig;
  }
}

interface JoinRequestPayload {
  readonly binding: PeerBinding;
  readonly clientInstanceId: string;
  readonly displayName?: string;
  readonly invitationToken: string;
}

interface AcceptedJoinPayload {
  readonly credential: Credential;
  readonly role: CapabilityRole;
  readonly seat?: RoomSeat;
  readonly status: "accepted";
}

type JoinResponsePayload =
  AcceptedJoinPayload | { readonly code: string; readonly status: "rejected" };

type CapabilityRequestPayload =
  | {
      readonly clientInstanceId: string;
      readonly credentialToken: string;
      readonly type: "history-page";
      readonly afterRevision: number;
      readonly throughRevision?: number;
    }
  | {
      readonly clientInstanceId: string;
      readonly credentialToken: string;
      readonly type: "history-saved";
      readonly throughRevision: number;
    }
  | {
      readonly clientInstanceId: string;
      readonly credentialToken: string;
      readonly type: "projection";
    }
  | {
      readonly action: PlayerAction;
      readonly clientInstanceId: string;
      readonly credentialToken: string;
      readonly type: "player-action";
    }
  | {
      readonly action: DealerAction;
      readonly clientInstanceId: string;
      readonly credentialToken: string;
      readonly type: "dealer-action";
    };

interface LivenessRequestPayload {
  readonly clientInstanceId: string;
  readonly credentialToken: string;
  readonly type: "liveness";
}

type LivenessResponsePayload =
  | {
      readonly role: CapabilityRole;
      readonly status: "alive";
    }
  | {
      readonly code: string;
      readonly status: "rejected";
    };

type CapabilityResponsePayload =
  | {
      readonly status: "history-page";
      readonly history: PublicTableHistory;
      readonly throughRevision: number;
      readonly hasMore: boolean;
    }
  | { readonly status: "history-saved" }
  | {
      readonly futureSittingOut: boolean;
      readonly projection: SeatProjection;
      readonly relayRoutes?: RelayRouteConfiguration;
      readonly tableClosing?: boolean;
      readonly role: "player";
      readonly status: "projection";
    }
  | {
      readonly projection: PublicProjection;
      readonly relayRoutes?: RelayRouteConfiguration;
      readonly tableClosing?: boolean;
      readonly role: "public-table" | "tv" | "table-control";
      readonly status: "projection";
    }
  | {
      readonly cardStyle: CardStyle;
      readonly futureSittingOut?: boolean;
      readonly rulesProfileId: RulesProfile["id"];
      readonly tableClosing?: boolean;
      readonly role: CapabilityRole;
      readonly relayRoutes?: RelayRouteConfiguration;
      readonly seat?: RoomSeat;
      readonly status: "waiting";
      readonly tableTheme: TableTheme;
    }
  | { readonly code: string; readonly status: "rejected" };

interface SealedValue {
  readonly ciphertext: string;
  readonly iv: string;
}

interface HostRecoveryState {
  readonly historySavedAtRevision?: number;
  readonly historySavedBy?: readonly string[];
  readonly tableClosing?: boolean;
  readonly authorityEpoch: string;
  readonly binding: PeerBinding;
  readonly diagnosticSalt: string;
  readonly identity: RoomIdentityRecoveryState;
  readonly invitations: readonly Invitation[];
  readonly privacyClass: "host-recovery-secret";
  readonly relayRoutes?: RelayRouteConfiguration;
  readonly relayRoutesByInvitationToken?: Readonly<
    Record<string, RelayRouteConfiguration>
  >;
  readonly relayRoutesByPeerId?: Readonly<
    Record<string, RelayRouteConfiguration>
  >;
  readonly rulesProfile?: RulesProfile;
  readonly schemaVersion: 1;
}

interface ClientRecoveryState {
  readonly finalPublicHistory?: PublicTableHistory;
  readonly binding: PeerBinding;
  readonly clientInstanceId: string;
  readonly credential: Credential;
  readonly privacyClass: "client-recovery-secret";
  readonly relayRoutes?: RelayRouteConfiguration;
  readonly role: CapabilityRole;
  readonly schemaVersion: 1;
  readonly seat?: RoomSeat;
  readonly slotId: string;
}

function makeId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await globalThis.crypto.subtle.digest(
      "SHA-256",
      bytesToBuffer(new TextEncoder().encode(value)),
    ),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function messageKey(secret: string): Promise<CryptoKey> {
  const keyBytes = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytesToBuffer(
      new TextEncoder().encode(
        `${phaseCryptoContext("html-poker-room-v1")}\u0000${secret}`,
      ),
    ),
  );
  return globalThis.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function seal(
  secret: string,
  value: unknown,
  additionalData: string,
): Promise<SealedValue> {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    {
      additionalData: bytesToBuffer(
        new TextEncoder().encode(phaseCryptoContext(additionalData)),
      ),
      iv,
      name: "AES-GCM",
    },
    await messageKey(secret),
    bytesToBuffer(new TextEncoder().encode(JSON.stringify(value))),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

async function unseal<T>(
  secret: string,
  sealed: SealedValue,
  additionalData: string,
): Promise<T> {
  const plaintext = await globalThis.crypto.subtle.decrypt(
    {
      additionalData: bytesToBuffer(
        new TextEncoder().encode(phaseCryptoContext(additionalData)),
      ),
      iv: base64ToBytes(sealed.iv),
      name: "AES-GCM",
    },
    await messageKey(secret),
    bytesToBuffer(base64ToBytes(sealed.ciphertext)),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

function isRoomMessage(value: unknown): value is RoomMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { readonly kind?: unknown };
  return [
    "join-request",
    "join-response",
    "capability-request",
    "capability-response",
    "liveness-request",
    "liveness-response",
    "table-changed",
    "route-probe",
    "route-probe-ack",
    "direct-offer",
    "direct-answer",
    "direct-candidate",
  ].includes(String(candidate.kind));
}

function channelName(tableId: string, hostKey: string): string {
  return phaseScopedName("html-poker-room:" + tableId + ":" + hostKey);
}

function relayConfigForRoute(
  route: RelayRoomRoute,
  overrides?: RelayRouteConfiguration,
): RelayRuntimeConfig | undefined {
  const config = globalThis.window.__HTML_POKER_CONFIG__;
  const override =
    route === "private-relay" ? overrides?.privateRelay : overrides?.cloudRelay;
  if (override) return override;
  const configured =
    route === "private-relay" ? config?.privateRelay : config?.cloudRelay;
  // Static deployment configuration is deliberately URL-only. A configured
  // operator secret is ignored rather than becoming a shared table token.
  return configured ? { url: configured.url } : undefined;
}

function cloneRelayRoutes(
  relayRoutes?: RelayRouteConfiguration,
): RelayRouteConfiguration | undefined {
  if (!relayRoutes) return undefined;
  return {
    ...(relayRoutes.privateRelay
      ? { privateRelay: { ...relayRoutes.privateRelay } }
      : {}),
    ...(relayRoutes.cloudRelay
      ? { cloudRelay: { ...relayRoutes.cloudRelay } }
      : {}),
  };
}

function optionalRelayRoutes(relayRoutes?: RelayRouteConfiguration): {
  readonly relayRoutes?: RelayRouteConfiguration;
} {
  const cloned = cloneRelayRoutes(relayRoutes);
  return cloned ? { relayRoutes: cloned } : {};
}

function relayRouteRecord(
  entries: Iterable<readonly [string, RelayRouteConfiguration]>,
): Record<string, RelayRouteConfiguration> {
  const record: Record<string, RelayRouteConfiguration> = {};
  for (const [key, routes] of entries) {
    const cloned = cloneRelayRoutes(routes);
    if (cloned) record[key] = cloned;
  }
  return record;
}

function relayPeerIdForRoutes(
  relayRoutes: RelayRouteConfiguration | undefined,
  fallback: string,
): string {
  return (
    relayRoutes?.cloudRelay?.peerId ??
    relayRoutes?.privateRelay?.peerId ??
    fallback
  );
}

const tableSideDisplayPairingPrefix = "HTMLPOKER-TABLE-SIDE-DISPLAY-1:";
const tableSideDisplayPairingTtlMs = 5 * 60 * 1_000;

type TableSideDisplayRole = "public-table" | "tv";

interface TableSideDisplayPairingCode {
  readonly expiresAt: number;
  readonly formatVersion: 1;
  readonly requestId: string;
  readonly requestedRole: TableSideDisplayRole;
  readonly secret: string;
  /** Ordered service endpoints. Cloudflare is first; Mac is the fallback. */
  readonly serviceUrls?: readonly string[];
  /** Kept for display QR compatibility with the single-relay format. */
  readonly serviceUrl: string;
}

interface TableSideDisplayPairingResponse {
  readonly binding: PeerBinding;
  readonly invitationToken: string;
  readonly relayRoutes?: RelayRouteConfiguration;
  readonly role: TableSideDisplayRole;
}

export interface TableSideDisplayPairingRequest {
  readonly code: string;
  readonly expiresAt: number;
  readonly role: TableSideDisplayRole;
  cancel(): void;
  waitForInvitation(): Promise<InvitationDetails>;
}

function relayServiceEndpoint(
  relay: RelayRuntimeConfig,
  pathname: string,
): string | undefined {
  let serviceUrl: URL;
  try {
    serviceUrl = new URL(relay.url);
  } catch {
    return undefined;
  }
  if (serviceUrl.protocol === "ws:") serviceUrl.protocol = "http:";
  if (serviceUrl.protocol === "wss:") serviceUrl.protocol = "https:";
  if (!["http:", "https:"].includes(serviceUrl.protocol)) return undefined;
  serviceUrl.pathname = pathname;
  serviceUrl.search = "";
  serviceUrl.hash = "";
  return serviceUrl.toString().replace(/\/$/u, "");
}

function tableSideDisplayPairingServiceUrl(): string | undefined {
  return tableSideDisplayPairingServiceUrls()[0];
}

function tableSideDisplayPairingServiceUrls(): string[] {
  const services: string[] = [];
  for (const route of ["cloud-relay", "private-relay"] as const) {
    const relay = relayConfigForRoute(route);
    const serviceUrl = relay
      ? relayServiceEndpoint(relay, "/v1/display-pairings")
      : undefined;
    if (serviceUrl && !services.includes(serviceUrl)) services.push(serviceUrl);
  }
  return services;
}

export function tableSideDisplayPairingIsConfigured(): boolean {
  return Boolean(tableSideDisplayPairingServiceUrl());
}

export function tableSideRelayRequiresOperatorToken(): boolean {
  const relay =
    relayConfigForRoute("cloud-relay") ?? relayConfigForRoute("private-relay");
  return Boolean(relay?.url);
}

async function provisionHostRelayRoutes(
  binding: PeerBinding,
  operatorToken?: string,
  peerId = "host",
): Promise<RelayRouteConfiguration | undefined> {
  const configuredRoutes = (["cloud-relay", "private-relay"] as const).flatMap(
    (route) => {
      const relay = relayConfigForRoute(route);
      return relay?.url ? [{ relay, route }] : [];
    },
  );
  if (configuredRoutes.length === 0) return undefined;
  if (!operatorToken?.trim()) {
    throw new Error(
      "A Connection Service host token is required when a relay is configured.",
    );
  }
  const settled = await Promise.allSettled(
    configuredRoutes.map(async ({ relay, route }) => {
      const endpoint = relayServiceEndpoint(relay, "/v1/table-sessions");
      if (!endpoint) throw new Error("invalid endpoint");
      const controller = new AbortController();
      const timeout = globalThis.setTimeout(() => controller.abort(), 2_500);
      let response: Response;
      try {
        response = await fetch(endpoint, {
          body: JSON.stringify({
            hostKey: binding.hostKey,
            peerId,
            protocolVersion: binding.protocolVersion,
            tableId: binding.tableId,
          }),
          headers: {
            authorization: `Bearer ${operatorToken.trim()}`,
            "content-type": "application/json",
          },
          method: "POST",
          signal: controller.signal,
        });
      } finally {
        globalThis.clearTimeout(timeout);
      }
      if (!response.ok) throw new Error("ticket request rejected");
      const ticket = (await response.json()) as Partial<{
        accessToken: string;
        expiresAt: number;
        pairingWriteCapability: string;
        peerId: string;
      }>;
      if (
        typeof ticket.accessToken !== "string" ||
        ticket.accessToken.length < 16 ||
        ticket.accessToken.length > 512 ||
        typeof ticket.expiresAt !== "number" ||
        !Number.isSafeInteger(ticket.expiresAt) ||
        ticket.expiresAt <= Date.now() ||
        typeof ticket.pairingWriteCapability !== "string" ||
        ticket.pairingWriteCapability.length < 16 ||
        ticket.pairingWriteCapability.length > 512 ||
        ticket.peerId !== peerId
      ) {
        throw new Error("invalid relay ticket");
      }
      return {
        relay: {
          accessToken: ticket.accessToken,
          expiresAt: ticket.expiresAt,
          pairingWriteCapability: ticket.pairingWriteCapability,
          peerId,
          url: relay.url,
        } satisfies RelayRuntimeConfig,
        route,
      };
    }),
  );
  const successful = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  if (successful.length === 0) {
    if (configuredRoutes.length === 1) {
      throw new Error(
        "The Connection Service is unreachable. Table-side Mode needs its relay online. Ask the table owner to restore it, or use Airplane Mode.",
      );
    }
    throw new Error(
      "Neither the Cloudflare relay nor the Mac fallback could issue a table ticket.",
    );
  }
  return Object.fromEntries(
    successful.map(({ relay, route }) => [
      route === "cloud-relay" ? "cloudRelay" : "privateRelay",
      relay,
    ]),
  ) as RelayRouteConfiguration;
}

function encodeTableSideDisplayPairingCode(
  value: TableSideDisplayPairingCode,
): string {
  return `${tableSideDisplayPairingPrefix}${bytesToBase64(
    new TextEncoder().encode(JSON.stringify(value)),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "")}`;
}

function decodeTableSideDisplayPairingCode(
  value: string,
): TableSideDisplayPairingCode {
  if (
    !value.startsWith(tableSideDisplayPairingPrefix) ||
    value.length > 4_096
  ) {
    throw new Error("This is not a supported Table-side display pairing QR.");
  }
  const encoded = value.slice(tableSideDisplayPairingPrefix.length);
  const normalized = encoded
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), "=");
  let candidate: unknown;
  try {
    candidate = JSON.parse(
      new TextDecoder().decode(base64ToBytes(normalized)),
    ) as unknown;
  } catch {
    throw new Error("The Table-side display pairing QR is damaged.");
  }
  if (!candidate || typeof candidate !== "object") {
    throw new Error("The Table-side display pairing QR is invalid.");
  }
  const code = candidate as Partial<TableSideDisplayPairingCode>;
  if (
    code.formatVersion !== 1 ||
    typeof code.requestId !== "string" ||
    code.requestId.length < 16 ||
    code.requestId.length > 128 ||
    typeof code.secret !== "string" ||
    code.secret.length < 16 ||
    code.secret.length > 256 ||
    !["public-table", "tv"].includes(String(code.requestedRole)) ||
    typeof code.serviceUrl !== "string" ||
    typeof code.expiresAt !== "number" ||
    !Number.isSafeInteger(code.expiresAt)
  ) {
    throw new Error("The Table-side display pairing QR schema is invalid.");
  }
  try {
    const serviceUrl = new URL(code.serviceUrl);
    if (!["http:", "https:"].includes(serviceUrl.protocol)) {
      throw new Error("unsupported service protocol");
    }
  } catch {
    throw new Error("The Table-side display pairing QR service is invalid.");
  }
  if (code.serviceUrls !== undefined) {
    if (
      !Array.isArray(code.serviceUrls) ||
      code.serviceUrls.length < 1 ||
      code.serviceUrls.length > 2 ||
      code.serviceUrls.some((value) => typeof value !== "string")
    ) {
      throw new Error(
        "The Table-side display pairing QR services are invalid.",
      );
    }
    for (const value of code.serviceUrls) {
      try {
        const serviceUrl = new URL(value);
        if (!["http:", "https:"].includes(serviceUrl.protocol)) {
          throw new Error("unsupported service protocol");
        }
      } catch {
        throw new Error(
          "The Table-side display pairing QR service is invalid.",
        );
      }
    }
  }
  return code as TableSideDisplayPairingCode;
}

function validTableSideDisplayPairingResponse(
  value: unknown,
  expectedRole: TableSideDisplayRole,
): value is TableSideDisplayPairingResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TableSideDisplayPairingResponse>;
  const binding = candidate.binding;
  return (
    candidate.role === expectedRole &&
    typeof candidate.invitationToken === "string" &&
    candidate.invitationToken.length >= 16 &&
    Boolean(binding) &&
    typeof binding?.buildVersion === "string" &&
    typeof binding.hostKey === "string" &&
    typeof binding.tableId === "string" &&
    Number.isInteger(binding.protocolVersion) &&
    binding.protocolVersion >= 1
  );
}

export function createTableSideDisplayPairingRequest(
  role: TableSideDisplayRole,
): TableSideDisplayPairingRequest {
  const serviceUrls = tableSideDisplayPairingServiceUrls();
  const serviceUrl = serviceUrls[0];
  if (!serviceUrl) {
    throw new Error(
      "This deployment has no Connection Service configured for Table-side display pairing.",
    );
  }
  const code: TableSideDisplayPairingCode = {
    expiresAt: Date.now() + tableSideDisplayPairingTtlMs,
    formatVersion: 1,
    requestId: makeId("display-request"),
    requestedRole: role,
    secret: makeId("display-pair-secret"),
    ...(serviceUrls.length > 1 ? { serviceUrls } : {}),
    serviceUrl,
  };
  let cancelled = false;
  return {
    code: encodeTableSideDisplayPairingCode(code),
    expiresAt: code.expiresAt,
    role,
    cancel() {
      cancelled = true;
    },
    async waitForInvitation() {
      while (!cancelled && Date.now() < code.expiresAt) {
        let pending = false;
        for (const service of code.serviceUrls ?? [code.serviceUrl]) {
          let response: Response;
          const controller = new AbortController();
          const timeout = globalThis.setTimeout(
            () => controller.abort(),
            2_500,
          );
          try {
            response = await fetch(
              `${service}/${encodeURIComponent(code.requestId)}`,
              { cache: "no-store", signal: controller.signal },
            );
          } catch {
            globalThis.clearTimeout(timeout);
            continue;
          }
          globalThis.clearTimeout(timeout);
          if (response.status === 204) {
            pending = true;
            continue;
          }
          if (!response.ok) continue;
          const sealed = (await response.json()) as SealedValue & {
            readonly expiresAt?: unknown;
          };
          if (
            typeof sealed.expiresAt !== "number" ||
            sealed.expiresAt !== code.expiresAt
          ) {
            throw new Error(
              "The Table-side display pairing response did not match its request.",
            );
          }
          const invitation = await unseal<unknown>(
            code.secret,
            sealed,
            `display-pair:${code.requestId}`,
          );
          if (
            !validTableSideDisplayPairingResponse(
              invitation,
              code.requestedRole,
            )
          ) {
            throw new Error(
              "The Table-side display pairing response was rejected.",
            );
          }
          return {
            binding: invitation.binding,
            invitationToken: invitation.invitationToken,
            ...(invitation.relayRoutes
              ? { relayRoutes: invitation.relayRoutes }
              : {}),
            role: invitation.role,
          };
        }
        if (pending) {
          await new Promise<void>((resolve) => {
            globalThis.setTimeout(resolve, 350);
          });
        }
      }
      throw new Error(
        cancelled
          ? "The Table-side display pairing was cancelled."
          : "The Table-side display pairing QR expired before a host scanned it.",
      );
    },
  };
}

export function isAirplaneMode(): boolean {
  return globalThis.window.__HTML_POKER_CONFIG__?.airplaneMode === true;
}

function roomRouteLabel(route: RoomRoute): string {
  if (route === "airplane") return "Airplane · direct WebRTC";
  if (route === "private-relay") return "Private relay";
  if (route === "cloud-relay") return "Cloud relay";
  return "Direct browser channel";
}

function isDirectSignalMessage(
  message: RoomMessage,
): message is DirectSignalMessage {
  return ["direct-offer", "direct-answer", "direct-candidate"].includes(
    message.kind,
  );
}

function validDirectSignal(message: DirectSignalMessage): boolean {
  if (
    typeof message.connectionId !== "string" ||
    message.connectionId.length === 0 ||
    message.connectionId.length > 128
  ) {
    return false;
  }
  if (message.kind === "direct-candidate") {
    return (
      typeof message.candidate === "object" &&
      message.candidate !== null &&
      typeof message.candidate.candidate === "string" &&
      message.candidate.candidate.length <= 8_192
    );
  }
  return (
    typeof message.description === "object" &&
    message.description !== null &&
    message.description.type ===
      (message.kind === "direct-offer" ? "offer" : "answer") &&
    typeof message.description.sdp === "string" &&
    message.description.sdp.length > 0 &&
    message.description.sdp.length <= 32_768
  );
}

function validWireFrame(
  value: unknown,
  binding: PeerBinding,
  localPeerId: string,
): value is RoomWireFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<RoomWireFrame>;
  return (
    frame.kind === "html-poker-room-frame" &&
    frame.tableId === binding.tableId &&
    frame.hostKey === binding.hostKey &&
    frame.protocolVersion === binding.protocolVersion &&
    typeof frame.senderPeerId === "string" &&
    frame.senderPeerId.length > 0 &&
    (frame.recipientPeerId === localPeerId || frame.recipientPeerId === "*") &&
    isRoomMessage(frame.message)
  );
}

interface DirectPeerConnection {
  readonly connection: RTCPeerConnection;
  readonly connectionId: string;
  readonly peerId: string;
  readonly signalRoute: RelayRoomRoute;
  readonly queuedCandidates: RTCIceCandidateInit[];
  channel?: RTCDataChannel;
  remoteDescriptionSet: boolean;
}

function directConnectionKey(peerId: string, connectionId: string): string {
  return `${peerId}:${connectionId}`;
}

class RoomEndpoint {
  private readonly airplaneChannels = new Map<string, RTCDataChannel>();
  private readonly binding: PeerBinding;
  private readonly broadcast: BroadcastChannel;
  private closed = false;
  private readonly directChannels = new Map<string, RTCDataChannel>();
  private readonly directConnectionAttempts = new Map<
    string,
    Promise<boolean>
  >();
  private readonly directConnections = new Map<string, DirectPeerConnection>();
  private readonly directPendingCandidates = new Map<
    string,
    RTCIceCandidateInit[]
  >();
  private readonly listeners = new Set<(event: RoutedRoomMessage) => void>();
  private readonly localPeerId: string;
  private readonly peerRoutes = new Map<string, RoomRoute>();
  private readonly probeReceipts = new Map<string, () => void>();
  private readonly relayReceipts = new Map<
    string,
    (status: "relayed" | "rejected") => void
  >();
  private readonly relayConnections = new Map<
    RelayRoomRoute,
    Promise<WebSocket>
  >();
  private readonly relayRecovery = new Map<
    RelayRoomRoute,
    ConnectivityRecoveryCoordinator
  >();
  private readonly relaySockets = new Map<RelayRoomRoute, WebSocket>();
  private relayResumeFlight: Promise<boolean> | undefined;
  private relayRoutes: RelayRouteConfiguration | undefined;
  private selectedRoute: RoomRoute | undefined;
  private sequence = 0;

  constructor(
    binding: PeerBinding,
    localPeerId: string,
    relayRoutes?: RelayRouteConfiguration,
  ) {
    this.binding = { ...binding };
    this.localPeerId = localPeerId;
    this.relayRoutes = cloneRelayRoutes(relayRoutes);
    this.broadcast = new BroadcastChannel(
      channelName(binding.tableId, binding.hostKey),
    );
    this.broadcast.addEventListener(
      "message",
      (event: MessageEvent<unknown>) => {
        if (!validWireFrame(event.data, this.binding, this.localPeerId)) return;
        this.handleIncoming(event.data, "direct");
      },
    );
    for (const route of ["cloud-relay", "private-relay"] as const) {
      if (relayConfigForRoute(route, this.relayRoutes)) {
        void this.relayRecoveryFor(route)
          .run("automatic")
          .catch(() => undefined);
      }
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
    this.probeReceipts.clear();
    this.relayReceipts.clear();
    this.broadcast.close();
    for (const channel of this.airplaneChannels.values()) channel.close();
    this.airplaneChannels.clear();
    for (const connection of this.directConnections.values()) {
      connection.channel?.close();
      connection.connection.close();
    }
    this.directChannels.clear();
    this.directConnections.clear();
    this.directConnectionAttempts.clear();
    this.directPendingCandidates.clear();
    for (const socket of this.relaySockets.values()) {
      socket.close(1000, "table route closed");
    }
    this.relaySockets.clear();
    this.relayConnections.clear();
    this.relayRecovery.clear();
    this.relayResumeFlight = undefined;
  }

  connectionLabel(): string {
    if (this.selectedRoute === "direct" && this.directChannels.size > 0) {
      return "Direct WebRTC";
    }
    return roomRouteLabel(this.selectedRoute ?? "direct");
  }

  updateRelayRoutes(relayRoutes?: RelayRouteConfiguration): void {
    const previous = this.relayRoutes;
    this.relayRoutes = cloneRelayRoutes(relayRoutes);
    for (const route of ["cloud-relay", "private-relay"] as const) {
      const previousConfig = relayConfigForRoute(route, previous);
      const nextConfig = relayConfigForRoute(route, this.relayRoutes);
      const changed =
        previousConfig?.accessToken !== nextConfig?.accessToken ||
        previousConfig?.url !== nextConfig?.url;
      if (changed) {
        this.relaySockets.get(route)?.close(1000, "relay ticket rotated");
        this.relaySockets.delete(route);
        this.relayConnections.delete(route);
        this.relayRecovery.delete(route);
      }
      if (nextConfig?.accessToken && !this.relayConnections.has(route)) {
        void this.relayRecoveryFor(route)
          .run("automatic")
          .catch(() => undefined);
      }
    }
  }

  /**
   * Re-register configured relay routes after a browser foreground transition.
   * Mobile browsers can preserve a document while silently retiring its
   * WebSocket. Replacing the socket is bounded to relay transports; Airplane
   * and already-open direct data channels remain available for probing.
   */
  async resume(
    trigger: ConnectivityRecoveryTrigger = "manual",
  ): Promise<boolean> {
    if (this.closed) throw new Error("The room route is closed.");
    if (this.relayResumeFlight) return this.relayResumeFlight;
    if (
      trigger === "automatic" &&
      typeof navigator !== "undefined" &&
      navigator.onLine === false
    ) {
      return false;
    }
    // Relay health must not gate a working local/direct host path.
    if (
      this.localPeerId !== "host" &&
      ((await this.probe("airplane")) || (await this.probe("direct", false)))
    ) {
      return true;
    }
    const routes = (["cloud-relay", "private-relay"] as const).filter((route) =>
      Boolean(relayConfigForRoute(route, this.relayRoutes)),
    );
    if (routes.length === 0) return true;
    const operation = Promise.allSettled(
      routes.map((route) => this.relayRecoveryFor(route).run(trigger)),
    )
      .then((results) => {
        if (results.every((result) => result.status === "rejected")) {
          const failureResult = results.find(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected" &&
              !(result.reason instanceof ConnectivityRecoveryBackoffError),
          );
          const fallbackResult = results.find(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected",
          );
          const failure = (failureResult ?? fallbackResult)?.reason;
          throw failure instanceof Error
            ? failure
            : new Error("The configured relay did not reconnect.");
        }
        return true;
      })
      .finally(() => {
        if (this.relayResumeFlight === operation)
          this.relayResumeFlight = undefined;
      });
    this.relayResumeFlight = operation;
    return operation;
  }

  attachAirplaneChannel(peerId: string, channel: RTCDataChannel): void {
    this.attachDataChannel(peerId, channel, "airplane");
  }

  private attachDataChannel(
    peerId: string,
    channel: RTCDataChannel,
    route: Extract<RoomRoute, "airplane" | "direct">,
  ): void {
    if (this.closed) {
      channel.close();
      return;
    }
    const channels =
      route === "airplane" ? this.airplaneChannels : this.directChannels;
    channels.get(peerId)?.close();
    channels.set(peerId, channel);
    channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "string") return;
      try {
        const frame = JSON.parse(event.data) as unknown;
        if (!validWireFrame(frame, this.binding, this.localPeerId)) return;
        this.handleIncoming(frame, route);
      } catch {
        // Invalid peer frames are ignored before protocol dispatch.
      }
    });
    channel.addEventListener("close", () => {
      if (channels.get(peerId) === channel) {
        channels.delete(peerId);
      }
      if (this.selectedRoute === route) this.selectedRoute = undefined;
    });
  }

  async broadcastChange(message: RoomMessage): Promise<void> {
    await this.sendOn("direct", message, "*").catch(() => undefined);
    await Promise.all(
      [...this.peerRoutes]
        .filter(([, route]) => route !== "direct")
        .map(([peerId, route]) =>
          this.sendToKnownPeer(route, message, peerId).catch(() => undefined),
        ),
    );
  }

  async send(
    message: RoomMessage,
    recipientPeerId: string,
  ): Promise<RoomRoute> {
    const route = await this.selectRoute();
    const messageId = logicalMessageId(message);
    try {
      await this.sendOn(route, message, recipientPeerId, messageId);
      return route;
    } catch {
      this.selectedRoute = undefined;
      const fallback = await this.selectRoute(route);
      await this.sendOn(fallback, message, recipientPeerId, messageId);
      return fallback;
    }
  }

  async sendOn(
    route: RoomRoute,
    message: RoomMessage,
    recipientPeerId: string,
    messageId = logicalMessageId(message),
  ): Promise<void> {
    if (this.closed) throw new Error("The room route is closed.");
    const frame: RoomWireFrame = {
      hostKey: this.binding.hostKey,
      kind: "html-poker-room-frame",
      message,
      protocolVersion: this.binding.protocolVersion,
      recipientPeerId,
      senderPeerId: this.localPeerId,
      tableId: this.binding.tableId,
    };
    if (route === "direct") {
      const directChannel = this.directChannels.get(recipientPeerId);
      if (directChannel) {
        await this.waitForDataChannel(directChannel, "Direct WebRTC");
        directChannel.send(JSON.stringify(frame));
        return;
      }
      this.broadcast.postMessage(frame);
      if (recipientPeerId === "*") {
        for (const channel of this.directChannels.values()) {
          if (channel.readyState === "open")
            channel.send(JSON.stringify(frame));
        }
      }
      return;
    }
    if (route === "airplane") {
      const channel = this.airplaneChannels.get(recipientPeerId);
      if (!channel) throw new Error("The Airplane peer is not paired.");
      await this.waitForDataChannel(channel, "Airplane");
      channel.send(JSON.stringify(frame));
      return;
    }
    const socket = await this.connectRelay(route);
    if (socket.readyState !== WebSocket.OPEN) {
      throw new Error("The configured relay is not open.");
    }
    this.sequence += 1;
    const receipt = this.waitForRelayReceipt(route, messageId);
    try {
      socket.send(
        JSON.stringify({
          envelope: {
            ciphertext: JSON.stringify(frame.message),
            hostKey: frame.hostKey,
            messageId,
            protocolVersion: frame.protocolVersion,
            recipientPeerId,
            senderPeerId: frame.senderPeerId,
            sequence: this.sequence,
            tableId: frame.tableId,
          },
          type: "envelope",
        }),
      );
    } catch (error) {
      this.completeRelayReceipt(route, messageId, "rejected");
      throw error;
    }
    await receipt;
  }

  subscribe(listener: (event: RoutedRoomMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private connectRelay(route: RelayRoomRoute): Promise<WebSocket> {
    const existing = this.relayConnections.get(route);
    if (existing) return existing;
    const config = relayConfigForRoute(route, this.relayRoutes);
    if (!config?.url || !config.accessToken) {
      return Promise.reject(new Error(`No ${route} is configured.`));
    }
    if (config.expiresAt && config.expiresAt <= Date.now()) {
      return Promise.reject(new Error(`${route} credential expired.`));
    }
    const connection = new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(config.url);
      let settled = false;
      const timeout = globalThis.setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(new Error(`${route} registration timed out.`));
      }, 2_500);
      const fail = () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        if (this.relayConnections.get(route) === connection) {
          this.relayConnections.delete(route);
        }
        reject(new Error(`${route} connection failed.`));
      };
      socket.addEventListener("error", fail, { once: true });
      socket.addEventListener(
        "open",
        () => {
          socket.send(
            JSON.stringify({
              accessToken: config.accessToken,
              hostKey: this.binding.hostKey,
              peerId: config.peerId ?? this.localPeerId,
              protocolVersion: this.binding.protocolVersion,
              tableId: this.binding.tableId,
              type: "register",
            }),
          );
        },
        { once: true },
      );
      socket.addEventListener("message", (event: MessageEvent<string>) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        if (parsed && typeof parsed === "object") {
          const receipt = parsed as {
            readonly envelope?: {
              readonly ciphertext?: string;
              readonly hostKey?: string;
              readonly protocolVersion?: number;
              readonly recipientPeerId?: string;
              readonly senderPeerId?: string;
              readonly tableId?: string;
            };
            readonly messageId?: string;
            readonly status?: string;
            readonly type?: string;
          };
          if (
            receipt.type === "receipt" &&
            receipt.status === "registered" &&
            !settled
          ) {
            settled = true;
            globalThis.clearTimeout(timeout);
            const currentConfig = relayConfigForRoute(route, this.relayRoutes);
            if (
              this.closed ||
              this.relayConnections.get(route) !== connection ||
              currentConfig?.accessToken !== config.accessToken ||
              currentConfig?.url !== config.url
            ) {
              socket.close(1000, "superseded registration");
              reject(new Error("Relay registration was superseded."));
              return;
            }
            this.relaySockets.set(route, socket);
            resolve(socket);
            return;
          }
          if (
            receipt.type === "receipt" &&
            typeof receipt.messageId === "string" &&
            (receipt.status === "relayed" || receipt.status === "rejected")
          ) {
            this.completeRelayReceipt(route, receipt.messageId, receipt.status);
            return;
          }
          if (receipt.type !== "envelope" || !receipt.envelope) return;
          const envelope = receipt.envelope;
          if (
            envelope.tableId !== this.binding.tableId ||
            envelope.hostKey !== this.binding.hostKey ||
            envelope.protocolVersion !== this.binding.protocolVersion ||
            envelope.recipientPeerId !== this.localPeerId ||
            typeof envelope.senderPeerId !== "string" ||
            typeof envelope.ciphertext !== "string"
          ) {
            return;
          }
          try {
            const message = JSON.parse(envelope.ciphertext) as unknown;
            if (!isRoomMessage(message)) return;
            this.handleIncoming(
              {
                hostKey: this.binding.hostKey,
                kind: "html-poker-room-frame",
                message,
                protocolVersion: this.binding.protocolVersion,
                recipientPeerId: this.localPeerId,
                senderPeerId: envelope.senderPeerId,
                tableId: this.binding.tableId,
              },
              route,
            );
          } catch {
            // Malformed relay ciphertext is ignored at the card-blind seam.
          }
        }
      });
      socket.addEventListener("close", () => {
        const wasCurrent =
          this.relaySockets.get(route) === socket ||
          this.relayConnections.get(route) === connection;
        if (this.relaySockets.get(route) === socket) {
          this.relaySockets.delete(route);
        }
        if (this.relayConnections.get(route) === connection) {
          this.relayConnections.delete(route);
        }
        if (!settled) fail();
        if (wasCurrent) {
          this.rejectRelayReceipts(route);
          if (this.selectedRoute === route) this.selectedRoute = undefined;
        }
      });
    });
    this.relayConnections.set(route, connection);
    void connection.catch(() => {
      if (this.relayConnections.get(route) === connection) {
        this.relayConnections.delete(route);
      }
    });
    return connection;
  }

  private relayRecoveryFor(
    route: RelayRoomRoute,
  ): ConnectivityRecoveryCoordinator {
    const existing = this.relayRecovery.get(route);
    if (existing) return existing;
    const recovery = new ConnectivityRecoveryCoordinator({
      checkHealthy: async () => this.probeRelaySocket(route),
      isHealthy: () => this.relaySocketIsHealthy(route),
      recover: async () => {
        await this.connectRelay(route);
      },
    });
    this.relayRecovery.set(route, recovery);
    return recovery;
  }

  private relaySocketIsHealthy(route: RelayRoomRoute): boolean {
    return this.relaySockets.get(route)?.readyState === WebSocket.OPEN;
  }

  /**
   * Confirm an open relay socket with a read-only receipt. A browser can leave
   * a WebSocket in OPEN while its underlying network path is half-open after a
   * sleep or network switch; an envelope receipt is the relay's bounded ack for
   * the current authenticated registration.
   */
  private async probeRelaySocket(route: RelayRoomRoute): Promise<boolean> {
    const socket = this.relaySockets.get(route);
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      await this.sendOn(
        route,
        { kind: "route-probe", requestId: makeId("relay-health") },
        this.localPeerId,
      );
      return (
        this.relaySockets.get(route) === socket &&
        socket.readyState === WebSocket.OPEN
      );
    } catch {
      this.invalidateRelaySocket(route, socket, "relay health check failed");
      return false;
    }
  }

  private invalidateRelaySocket(
    route: RelayRoomRoute,
    socket: WebSocket,
    reason: string,
  ): void {
    if (this.relaySockets.get(route) !== socket) return;
    this.relaySockets.delete(route);
    this.relayConnections.delete(route);
    if (this.selectedRoute === route) this.selectedRoute = undefined;
    try {
      socket.close(1000, reason);
    } catch {
      // A transport that already failed can reject close; recovery will still
      // create a fresh registration because the socket maps were cleared.
    }
  }

  private handleIncoming(frame: RoomWireFrame, route: RoomRoute): void {
    if (frame.senderPeerId === this.localPeerId) return;
    if (isDirectSignalMessage(frame.message)) {
      if (route === "private-relay" || route === "cloud-relay") {
        void this.handleDirectSignal(
          frame.message,
          frame.senderPeerId,
          route,
        ).catch(() => undefined);
      }
      return;
    }
    if (frame.message.kind === "route-probe") {
      if (this.localPeerId === "host") {
        void this.sendOn(
          route,
          { kind: "route-probe-ack", requestId: frame.message.requestId },
          frame.senderPeerId,
        ).catch(() => undefined);
      }
      return;
    }
    if (frame.message.kind === "route-probe-ack") {
      this.probeReceipts.get(frame.message.requestId)?.();
      return;
    }
    if (this.localPeerId === "host") this.selectedRoute = route;
    this.peerRoutes.set(frame.senderPeerId, route);
    for (const listener of this.listeners) {
      listener({
        message: frame.message,
        route,
        senderPeerId: frame.senderPeerId,
      });
    }
  }

  private async establishDirectPeer(peerId: string): Promise<boolean> {
    if (this.directChannels.get(peerId)?.readyState === "open") return true;
    const inFlight = this.directConnectionAttempts.get(peerId);
    if (inFlight) return inFlight;
    const signalRoute = await this.directSignalRoute();
    if (!signalRoute) return false;
    const attempt = this.createDirectOffer(peerId, signalRoute);
    this.directConnectionAttempts.set(peerId, attempt);
    try {
      return await attempt;
    } finally {
      if (this.directConnectionAttempts.get(peerId) === attempt) {
        this.directConnectionAttempts.delete(peerId);
      }
    }
  }

  private async createDirectOffer(
    peerId: string,
    signalRoute: RelayRoomRoute,
  ): Promise<boolean> {
    let peer: DirectPeerConnection | undefined;
    try {
      const connectionId = makeId("direct");
      const connection = new RTCPeerConnection({ iceServers: [] });
      peer = {
        connection,
        connectionId,
        peerId,
        queuedCandidates: [],
        remoteDescriptionSet: false,
        signalRoute,
      };
      this.directConnections.set(
        directConnectionKey(peerId, connectionId),
        peer,
      );
      this.installDirectConnectionEvents(peer);
      const channel = connection.createDataChannel(
        `html-poker-direct:${this.binding.tableId}:${connectionId}`,
        { ordered: true },
      );
      peer.channel = channel;
      this.attachDataChannel(peerId, channel, "direct");
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const description = connection.localDescription;
      if (!description?.sdp) {
        throw new Error("The browser did not create a direct WebRTC offer.");
      }
      await this.sendDirectSignal(peerId, signalRoute, {
        connectionId,
        description: { sdp: description.sdp, type: "offer" },
        kind: "direct-offer",
      });
      await this.waitForDataChannel(channel, "Direct WebRTC", 3_000);
      return true;
    } catch {
      if (peer) this.discardDirectPeer(peer);
      return false;
    }
  }

  private discardDirectPeer(peer: DirectPeerConnection): void {
    const key = directConnectionKey(peer.peerId, peer.connectionId);
    if (this.directConnections.get(key) === peer) {
      this.directConnections.delete(key);
    }
    if (peer.channel && this.directChannels.get(peer.peerId) === peer.channel) {
      this.directChannels.delete(peer.peerId);
    }
    peer.channel?.close();
    peer.connection.close();
  }

  private async directSignalRoute(): Promise<RelayRoomRoute | undefined> {
    for (const route of ["cloud-relay", "private-relay"] as const) {
      if (!relayConfigForRoute(route, this.relayRoutes)) continue;
      try {
        await this.connectRelay(route);
        return route;
      } catch {
        // A configured but unavailable relay remains a fallback candidate.
      }
    }
    return undefined;
  }

  private async handleDirectSignal(
    message: DirectSignalMessage,
    senderPeerId: string,
    signalRoute: RelayRoomRoute,
  ): Promise<void> {
    if (this.closed || !validDirectSignal(message)) return;
    const key = directConnectionKey(senderPeerId, message.connectionId);
    if (message.kind === "direct-offer") {
      if (this.localPeerId !== "host") return;
      const existing = this.directConnections.get(key);
      if (existing) this.discardDirectPeer(existing);
      const connection = new RTCPeerConnection({ iceServers: [] });
      const peer: DirectPeerConnection = {
        connection,
        connectionId: message.connectionId,
        peerId: senderPeerId,
        queuedCandidates: [],
        remoteDescriptionSet: false,
        signalRoute,
      };
      this.directConnections.set(key, peer);
      this.installDirectConnectionEvents(peer);
      await connection.setRemoteDescription(message.description);
      peer.remoteDescriptionSet = true;
      await this.flushDirectCandidates(peer);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      const description = connection.localDescription;
      if (!description?.sdp) {
        this.discardDirectPeer(peer);
        return;
      }
      await this.sendDirectSignal(senderPeerId, signalRoute, {
        connectionId: message.connectionId,
        description: { sdp: description.sdp, type: "answer" },
        kind: "direct-answer",
      });
      return;
    }
    const peer = this.directConnections.get(key);
    if (!peer || peer.signalRoute !== signalRoute) {
      if (message.kind === "direct-candidate") {
        const candidates = this.directPendingCandidates.get(key) ?? [];
        if (candidates.length < 64) candidates.push(message.candidate);
        this.directPendingCandidates.set(key, candidates);
      }
      return;
    }
    if (message.kind === "direct-answer") {
      if (this.localPeerId === "host") return;
      await peer.connection.setRemoteDescription(message.description);
      peer.remoteDescriptionSet = true;
      await this.flushDirectCandidates(peer);
      return;
    }
    if (!peer.remoteDescriptionSet) {
      if (peer.queuedCandidates.length < 64) {
        peer.queuedCandidates.push(message.candidate);
      }
      return;
    }
    await this.addDirectCandidate(peer, message.candidate);
  }

  private installDirectConnectionEvents(peer: DirectPeerConnection): void {
    peer.connection.addEventListener("datachannel", (event) => {
      peer.channel = event.channel;
      this.attachDataChannel(peer.peerId, event.channel, "direct");
    });
    peer.connection.addEventListener("icecandidate", (event) => {
      if (!event.candidate || this.closed) return;
      void this.sendDirectSignal(peer.peerId, peer.signalRoute, {
        candidate: event.candidate.toJSON(),
        connectionId: peer.connectionId,
        kind: "direct-candidate",
      }).catch(() => undefined);
    });
    peer.connection.addEventListener("connectionstatechange", () => {
      if (
        peer.connection.connectionState === "failed" ||
        peer.connection.connectionState === "closed"
      ) {
        this.discardDirectPeer(peer);
      }
    });
  }

  private async flushDirectCandidates(
    peer: DirectPeerConnection,
  ): Promise<void> {
    const key = directConnectionKey(peer.peerId, peer.connectionId);
    const candidates = [
      ...(this.directPendingCandidates.get(key) ?? []),
      ...peer.queuedCandidates,
    ];
    this.directPendingCandidates.delete(key);
    peer.queuedCandidates.length = 0;
    for (const candidate of candidates) {
      await this.addDirectCandidate(peer, candidate);
    }
  }

  private async addDirectCandidate(
    peer: DirectPeerConnection,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    try {
      await peer.connection.addIceCandidate(candidate);
    } catch {
      // An invalid or stale candidate cannot advance the room protocol.
    }
  }

  private async sendDirectSignal(
    peerId: string,
    route: RelayRoomRoute,
    message: DirectSignalMessage,
  ): Promise<void> {
    await this.sendOn(route, message, peerId);
  }

  /**
   * A relay confirms that it accepted and forwarded every opaque frame. If a
   * Cloudflare socket has become half-open, that bounded receipt wait fails
   * instead of silently losing a host broadcast. A state notification is safe
   * to retry through the other relay because receivers refresh by revision.
   */
  private async sendToKnownPeer(
    preferred: RoomRoute,
    message: RoomMessage,
    peerId: string,
  ): Promise<void> {
    const routes = [
      preferred,
      ...(["cloud-relay", "private-relay"] as const).filter(
        (route) => route !== preferred,
      ),
    ];
    try {
      const result = await sendWithSerialRouteFallback(
        message,
        routes,
        (route, logicalMessage, messageId) =>
          this.sendOn(route, logicalMessage, peerId, messageId),
      );
      if (result.route !== preferred) {
        this.peerRoutes.set(peerId, result.route);
      }
    } catch (error) {
      if (this.selectedRoute === preferred) this.selectedRoute = undefined;
      throw error;
    }
  }

  private relayReceiptKey(route: RelayRoomRoute, messageId: string): string {
    return `${route}:${messageId}`;
  }

  private waitForRelayReceipt(
    route: RelayRoomRoute,
    messageId: string,
  ): Promise<void> {
    const key = this.relayReceiptKey(route, messageId);
    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        this.relayReceipts.delete(key);
        reject(new Error(`${route} delivery receipt timed out.`));
      }, 900);
      this.relayReceipts.set(key, (status) => {
        globalThis.clearTimeout(timeout);
        this.relayReceipts.delete(key);
        if (status === "relayed") {
          resolve();
          return;
        }
        reject(new Error(`${route} rejected the opaque frame.`));
      });
    });
  }

  private completeRelayReceipt(
    route: RelayRoomRoute,
    messageId: string,
    status: "relayed" | "rejected",
  ): void {
    this.relayReceipts.get(this.relayReceiptKey(route, messageId))?.(status);
  }

  private rejectRelayReceipts(route: RelayRoomRoute): void {
    for (const [key, complete] of this.relayReceipts) {
      if (!key.startsWith(`${route}:`)) continue;
      complete("rejected");
    }
  }

  private async probe(route: RoomRoute, allowOffer = true): Promise<boolean> {
    if (route === "airplane" && this.airplaneChannels.size === 0) return false;
    if (route === "direct" && this.localPeerId !== "host" && allowOffer) {
      if (await this.establishDirectPeer("host")) return true;
    }
    if (route === "private-relay" || route === "cloud-relay") {
      try {
        await this.connectRelay(route);
      } catch {
        return false;
      }
    }
    const requestId = makeId("probe");
    return new Promise((resolve) => {
      const timeout = globalThis.setTimeout(
        () => {
          this.probeReceipts.delete(requestId);
          resolve(false);
        },
        route === "airplane"
          ? requestTimeoutMs
          : route === "direct"
            ? 220
            : 900,
      );
      this.probeReceipts.set(requestId, () => {
        globalThis.clearTimeout(timeout);
        this.probeReceipts.delete(requestId);
        resolve(true);
      });
      void this.sendOn(route, { kind: "route-probe", requestId }, "host").catch(
        () => {
          globalThis.clearTimeout(timeout);
          this.probeReceipts.delete(requestId);
          resolve(false);
        },
      );
    });
  }

  private async selectRoute(exclude?: RoomRoute): Promise<RoomRoute> {
    if (this.localPeerId === "host") return "direct";
    if (this.selectedRoute && this.selectedRoute !== exclude) {
      return this.selectedRoute;
    }
    for (const route of [
      "airplane",
      "direct",
      "cloud-relay",
      "private-relay",
    ] as const) {
      if (route === exclude) continue;
      if (await this.probe(route)) {
        this.selectedRoute = route;
        return route;
      }
    }
    throw new Error(
      "No route reached the Trusted Host. This table link may be stale after the host or Connection Service restarted. Ask the Trusted Host to refresh the relay ticket and share a new link, or create a new table.",
    );
  }

  private waitForDataChannel(
    channel: RTCDataChannel,
    transport: "Airplane" | "Direct WebRTC",
    timeoutMs = requestTimeoutMs,
  ): Promise<void> {
    if (channel.readyState === "open") return Promise.resolve();
    if (channel.readyState === "closing" || channel.readyState === "closed") {
      return Promise.reject(
        new Error(`The ${transport} data channel is closed.`),
      );
    }
    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        cleanup();
        reject(
          new Error(
            transport === "Airplane"
              ? "The Airplane peer did not connect. Confirm both QR scans and private Wi-Fi client isolation."
              : "The direct WebRTC peer did not connect. The table will try its configured relay.",
          ),
        );
      }, timeoutMs);
      const opened = () => {
        cleanup();
        resolve();
      };
      const closed = () => {
        cleanup();
        reject(
          new Error(`The ${transport} data channel closed before pairing.`),
        );
      };
      const cleanup = () => {
        globalThis.clearTimeout(timeout);
        channel.removeEventListener("open", opened);
        channel.removeEventListener("close", closed);
      };
      channel.addEventListener("open", opened, { once: true });
      channel.addEventListener("close", closed, { once: true });
    });
  }
}

function authorityStore(tableId: string) {
  return createIndexedDbTableStore<PersistedAuthorityState>({
    databaseName: phaseScopedName(`html-poker-host:${tableId}`),
    recordKey: "authority",
  });
}

function hostRecoveryStore(tableId: string) {
  return createIndexedDbTableStore<HostRecoveryState>({
    databaseName: phaseScopedName(`html-poker-host:${tableId}`),
    recordKey: "runtime",
  });
}

function clientRecoveryStore(
  tableId: string,
  role: CapabilityRole,
  slotId: string,
) {
  return createIndexedDbTableStore<ClientRecoveryState>({
    databaseName: phaseScopedName(`html-poker-client:${tableId}:${role}`),
    recordKey: `client:${slotId}`,
  });
}

async function acquireHostLease(
  tableId: string,
  retryUntilAvailable: boolean,
): Promise<ExclusiveHostLease> {
  const name = phaseScopedName(`html-poker-host:${tableId}`);
  const deadline = Date.now() + (retryUntilAvailable ? 2_500 : 0);
  let lease = await acquireExclusiveHostLease(name);
  while (!lease && Date.now() < deadline) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 75));
    lease = await acquireExclusiveHostLease(name);
  }
  if (lease) return lease;
  throw new Error(
    "Another tab controls this table. Close it before recovering here.",
  );
}

async function acquireClientLease(
  tableId: string,
  role: CapabilityRole,
  slotId: string,
  retryUntilAvailable: boolean,
): Promise<ExclusiveHostLease> {
  const name = phaseScopedName(
    `html-poker-client:${tableId}:${role}:${slotId}`,
  );
  const deadline = Date.now() + (retryUntilAvailable ? 2_500 : 0);
  let lease = await acquireExclusiveHostLease(name);
  while (!lease && Date.now() < deadline) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 75));
    lease = await acquireExclusiveHostLease(name);
  }
  if (lease) return lease;
  throw new Error("This private seat is already open in another tab.");
}

function sameBinding(left: PeerBinding, right: PeerBinding): boolean {
  return (
    left.buildVersion === right.buildVersion &&
    left.hostKey === right.hostKey &&
    left.protocolVersion === right.protocolVersion &&
    left.tableId === right.tableId
  );
}

function assertHostRecoveryState(
  state: HostRecoveryState,
  tableId: string,
): void {
  if (
    state.schemaVersion !== 1 ||
    state.privacyClass !== "host-recovery-secret" ||
    state.binding.tableId !== tableId ||
    state.binding.buildVersion !== BUILD_VERSION ||
    state.binding.protocolVersion !== PROTOCOL_VERSION ||
    state.identity.binding.tableId !== tableId ||
    !sameBinding(state.binding, state.identity.binding) ||
    !state.authorityEpoch ||
    !state.diagnosticSalt ||
    !isRulesProfile(state.rulesProfile ?? { id: "deal-only-v1" })
  ) {
    throw new Error("The saved Trusted Host state failed validation.");
  }
  const invitationTokens = new Set(
    state.identity.invitations.map((invitation) => invitation.token),
  );
  if (
    state.invitations.some(
      (invitation) =>
        !invitationTokens.has(invitation.token) ||
        invitation.expiresAt <= 0 ||
        !invitation.role,
    )
  ) {
    throw new Error("The saved invitation state failed validation.");
  }
}

function assertClientRecoveryState(
  state: ClientRecoveryState,
  details: ClientRecoveryDetails,
): void {
  if (
    state.schemaVersion !== 1 ||
    state.privacyClass !== "client-recovery-secret" ||
    state.role !== details.role ||
    !sameBinding(state.binding, details.binding) ||
    state.credential.role !== details.role ||
    state.slotId !== details.slotId ||
    !state.clientInstanceId ||
    !state.credential.token ||
    !state.credential.capabilityId
  ) {
    throw new Error("The saved seat or display credential failed validation.");
  }
}

export interface HostRuntimeSnapshot {
  readonly connectionLabel: string;
  readonly error?: string;
  readonly history: readonly {
    readonly eventId: string;
    readonly revision: number;
    readonly type: string;
  }[];
  readonly invitations: Readonly<Partial<Record<CapabilityRole, Invitation>>>;
  readonly projection?: PublicProjection;
  readonly relaySession?: {
    readonly expiresAt: number;
    readonly route: RelayRoomRoute;
  };
  readonly roster: RoomRoster;
  readonly stage: "lobby" | "table";
}

export interface AirplaneOfferDetails {
  readonly code: string;
  readonly expiresAt: number;
  readonly offerId: string;
  readonly role: CapabilityRole;
}

interface HostRuntimeOptions {
  readonly authorityEpoch: string;
  readonly binding: PeerBinding;
  readonly diagnosticSalt: string;
  readonly identity: RoomIdentity;
  readonly invitations: readonly Invitation[];
  readonly lease: ExclusiveHostLease;
  readonly operatorToken?: string;
  readonly relayRoutesByInvitationToken?: Readonly<
    Record<string, RelayRouteConfiguration>
  >;
  readonly relayRoutesByPeerId?: Readonly<
    Record<string, RelayRouteConfiguration>
  >;
  readonly relayRoutes?: RelayRouteConfiguration;
  readonly recoveryRevision: number;
  readonly recoveryStore: AtomicTableStore<HostRecoveryState>;
  readonly rulesProfile: RulesProfile;
}

export interface HostRuntimeCreateOptions {
  readonly operatorToken?: string;
  readonly rulesProfile?: RulesProfile;
}

export class HostTableRuntime {
  private tableClosing = false;
  private readonly historySavedBy = new Set<string>();
  private readonly cachedRequestFingerprints = new Map<string, string>();
  public exportPublicHistory(): PublicTableHistory {
    return (
      this.authority?.publicHistory() ?? {
        format: "our-poker-table-public-history",
        version: 1,
        tableId: this.tableId,
        exportedAt: new Date().toISOString(),
        completeFromFirstHand: true,
        frames: [],
      }
    );
  }
  readonly authorityEpoch: string;
  readonly binding: PeerBinding;
  readonly diagnostics: DiagnosticLog;
  readonly hostKey: string;
  readonly tableId: string;
  private authority: TrustedHostAuthority | undefined;
  private closed = false;
  private finishInitialization: () => void = () => undefined;
  private readonly initialized = new Promise<void>((resolve) => {
    this.finishInitialization = resolve;
  });
  private readonly airplanePairings = new Map<string, HostAirplanePairing>();
  private readonly capabilitySecrets = new Map<string, string>();
  private readonly cachedResponses = new Map<
    string,
    JoinResponseMessage | CapabilityResponseMessage
  >();
  private readonly endpoint: RoomEndpoint;
  private readonly diagnosticSalt: string;
  private connectivityError: string | undefined;
  private connectivityLivenessMisses = 0;
  private connectivityUnavailable = false;
  private error: string | undefined;
  private readonly handIds = createHandIdGenerator();
  private readonly identity: RoomIdentity;
  private readonly invitationByDigest = new Map<string, Invitation>();
  private readonly invitations = new Map<CapabilityRole, Invitation>();
  private readonly lease: ExclusiveHostLease;
  private readonly listeners = new Set<() => void>();
  /** Kept only in host memory; never persisted or sent to a client. */
  private operatorToken: string | undefined;
  private readonly relayRoutesByInvitationToken = new Map<
    string,
    RelayRouteConfiguration
  >();
  private readonly relayRoutesByPeerId = new Map<
    string,
    RelayRouteConfiguration
  >();
  private operationQueue: Promise<void> = Promise.resolve();
  private projection: PublicProjection | undefined;
  private recoveryRevision: number;
  private relayRouteConfiguration: RelayRouteConfiguration | undefined;
  private readonly recoveryStore: AtomicTableStore<HostRecoveryState>;
  readonly rulesProfile: RulesProfile;

  private constructor(options: HostRuntimeOptions) {
    this.authorityEpoch = options.authorityEpoch;
    this.binding = { ...options.binding };
    this.hostKey = options.binding.hostKey;
    this.tableId = options.binding.tableId;
    this.diagnosticSalt = options.diagnosticSalt;
    this.identity = options.identity;
    this.lease = options.lease;
    this.operatorToken = options.operatorToken?.trim() || undefined;
    this.relayRouteConfiguration = cloneRelayRoutes(options.relayRoutes);
    this.recoveryRevision = options.recoveryRevision;
    this.recoveryStore = options.recoveryStore;
    this.rulesProfile = structuredClone(options.rulesProfile);
    for (const [token, routes] of Object.entries(
      options.relayRoutesByInvitationToken ?? {},
    )) {
      const cloned = cloneRelayRoutes(routes);
      if (cloned) this.relayRoutesByInvitationToken.set(token, cloned);
    }
    for (const [peerId, routes] of Object.entries(
      options.relayRoutesByPeerId ?? {},
    )) {
      const cloned = cloneRelayRoutes(routes);
      if (cloned) this.relayRoutesByPeerId.set(peerId, cloned);
    }
    this.diagnostics = createDiagnosticLog({
      pseudonymSalt: options.diagnosticSalt,
    });
    for (const invitation of options.invitations) {
      this.invitations.set(invitation.role, { ...invitation });
    }
    for (const credential of this.identity.exportRecoveryState().credentials) {
      if (!credential.revoked) {
        this.capabilitySecrets.set(credential.capabilityId, credential.token);
      }
    }
    this.endpoint = new RoomEndpoint(this.binding, "host", this.relayRoutes);
    this.endpoint.subscribe((event) => {
      // Recovery must reconcile durable authority and identity before any inbound
      // request can redeem invitations, mutate seats, or expose a projection.
      void this.runExclusive(async () => {
        await this.initialized;
        if (this.closed) return;
        const message = event.message;
        if (message.kind === "join-request") {
          await this.handleJoin(message, event.senderPeerId, event.route);
        } else if (message.kind === "capability-request") {
          await this.handleCapabilityRequest(
            message,
            event.senderPeerId,
            event.route,
          );
        } else if (message.kind === "liveness-request") {
          await this.handleLivenessRequest(
            message,
            event.senderPeerId,
            event.route,
          );
        }
      }).catch((error) => this.captureError(error));
    });
  }

  get relayRoutes(): RelayRouteConfiguration | undefined {
    return cloneRelayRoutes(this.relayRouteConfiguration);
  }

  relayRoutesForInvitation(
    invitation: Invitation,
  ): RelayRouteConfiguration | undefined {
    return cloneRelayRoutes(
      this.relayRoutesByInvitationToken.get(invitation.token),
    );
  }

  static async createNew(
    options: HostRuntimeCreateOptions = {},
  ): Promise<HostTableRuntime> {
    const rulesProfile = options.rulesProfile ?? { id: "deal-only-v1" };
    if (!isRulesProfile(rulesProfile)) {
      throw new Error("The selected chip rules are invalid.");
    }
    const tableId = makeId("table");
    const binding: PeerBinding = {
      buildVersion: BUILD_VERSION,
      hostKey: makeId("host-key"),
      protocolVersion: PROTOCOL_VERSION,
      tableId,
    };
    const identity = createRoomIdentity({
      ...binding,
      secretFactory: () => makeId("secret"),
    });
    identity.openJoinWindow();
    const relayRoutes = await provisionHostRelayRoutes(
      binding,
      options.operatorToken,
    );
    const runtime = new HostTableRuntime({
      authorityEpoch: makeId("epoch"),
      binding,
      diagnosticSalt: makeId("diagnostic-salt"),
      identity,
      invitations: [],
      lease: await acquireHostLease(tableId, false),
      ...(options.operatorToken
        ? { operatorToken: options.operatorToken }
        : {}),
      ...(relayRoutes ? { relayRoutes } : {}),
      recoveryRevision: 0,
      recoveryStore: hostRecoveryStore(tableId),
      rulesProfile,
    });
    try {
      await runtime.issueInvitationInternal("player");
      await runtime.persistRecovery();
      runtime.recordDiagnostic("lifecycle", "accepted");
      runtime.finishInitialization();
      return runtime;
    } catch (error) {
      runtime.close();
      throw error;
    }
  }

  static async recover(tableId: string): Promise<HostTableRuntime> {
    const lease = await acquireHostLease(tableId, true);
    let runtime: HostTableRuntime | undefined;
    try {
      const recoveryStore = hostRecoveryStore(tableId);
      const saved = await recoveryStore.load();
      if (!saved) throw new Error("No saved Trusted Host table was found.");
      assertHostRecoveryState(saved.state, tableId);
      const identity = createRoomIdentity({
        ...saved.state.binding,
        recoveryState: saved.state.identity,
        secretFactory: () => makeId("secret"),
      });
      runtime = new HostTableRuntime({
        authorityEpoch: saved.state.authorityEpoch,
        binding: saved.state.binding,
        diagnosticSalt: saved.state.diagnosticSalt,
        identity,
        invitations: saved.state.invitations,
        lease,
        ...(saved.state.relayRoutes
          ? { relayRoutes: saved.state.relayRoutes }
          : {}),
        ...(saved.state.relayRoutesByInvitationToken
          ? {
              relayRoutesByInvitationToken:
                saved.state.relayRoutesByInvitationToken,
            }
          : {}),
        ...(saved.state.relayRoutesByPeerId
          ? { relayRoutesByPeerId: saved.state.relayRoutesByPeerId }
          : {}),
        recoveryRevision: saved.revision,
        recoveryStore,
        rulesProfile: saved.state.rulesProfile ?? { id: "deal-only-v1" },
      });
      await runtime.rebuildInvitationDigests();
      const recoveringRuntime = runtime;
      const authority = createTrustedHostAuthority({
        authorityEpoch: runtime.authorityEpoch,
        custody: createCardCustody(),
        handIdFactory: () => recoveringRuntime.handIds.next(),
        store: authorityStore(tableId),
        tableId,
      });
      const recovered = await authority.recover();
      if (recovered.status === "rejected") {
        runtime.close();
        throw new Error("The saved hand history failed recovery validation.");
      }
      if (recovered.status === "recovered") {
        runtime.authority = authority;
        runtime.refreshProjection();
        const phase = runtime.projection?.phase;
        if (runtime.rulesProfile.id === "nlhe-home-v1") {
          // Authority persistence may precede the runtime's join-window commit.
          // Recovered digital authority is already bound to its original roster.
          runtime.identity.closeJoinWindow();
          const invitation = runtime.invitations.get("player");
          if (invitation && !invitation.seatId)
            await runtime.removeInvitation(invitation);
          await runtime.persistRecovery();
        }
        const identityState = runtime.identity.exportRecoveryState();
        if (phase === "complete" && identityState.handActive) {
          await runtime.completeHandIdentity();
          await runtime.persistRecovery();
        } else if (
          phase &&
          !["lobby", "complete"].includes(phase) &&
          !identityState.handActive
        ) {
          runtime.identity.onHandStarted();
          await runtime.persistRecovery();
        }
      } else if (runtime.identity.exportRecoveryState().handActive) {
        runtime.close();
        throw new Error("The saved runtime and hand history disagree.");
      }
      runtime.tableClosing = saved.state.tableClosing ?? false;
      if (
        runtime.tableClosing &&
        saved.state.historySavedAtRevision ===
          (runtime.exportPublicHistory().frames.at(-1)?.revision ?? 0)
      ) {
        for (const id of saved.state.historySavedBy ?? [])
          if (typeof id === "string") runtime.historySavedBy.add(id);
      }
      await runtime
        .prepareAvailableSettlement()
        .catch((error) => runtime?.captureError(error));
      runtime.refreshProjection();
      runtime.recordDiagnostic("recovery", "accepted");
      runtime.finishInitialization();
      return runtime;
    } catch (error) {
      runtime?.close();
      lease.release();
      throw error;
    }
  }

  close(): void {
    this.closed = true;
    this.finishInitialization();
    for (const pairing of this.airplanePairings.values()) pairing.close();
    this.airplanePairings.clear();
    this.endpoint.close();
    this.lease.release();
  }

  async dissolve(): Promise<void> {
    if (IS_PHASE2_BUILD) {
      // Let clients fetch while the queue is free; waiting inside runExclusive
      // would deadlock the history requests needed to acknowledge delivery.
      const recipients = await this.runExclusive(async () => {
        await this.assertExclusiveAuthority();
        this.tableClosing = true;
        this.identity.closeJoinWindow();
        await this.persistRecovery();
        const history = this.exportPublicHistory();
        const archive = createIndexedDbTableStore<PublicTableHistory>({
          databaseName: phaseScopedName("html-poker-public-archives"),
          recordKey: this.tableId,
        });
        const previous = await archive.load();
        const saved = await archive.commit(previous?.revision ?? 0, {
          revision: (previous?.revision ?? 0) + 1,
          state: history,
        });
        if (saved.status !== "committed")
          throw new Error(
            "Final public history could not be saved; keep this page open and retry.",
          );
        const connected = new Set(
          this.identity
            .roster()
            .seats.filter((seat) => seat.connected)
            .map((seat) => seat.seatId),
        );
        return this.identity
          .exportRecoveryState()
          .credentials.filter(
            (credential) =>
              !credential.revoked &&
              credential.role === "player" &&
              credential.seatId &&
              connected.has(credential.seatId),
          )
          .map((credential) => credential.capabilityId);
      });
      this.broadcastChange();
      const deadline = Date.now() + 15000;
      while (
        recipients.some((id) => !this.historySavedBy.has(id)) &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (recipients.some((id) => !this.historySavedBy.has(id)))
        throw new Error(
          "Some connected players have not saved the final record yet. Keep this page open and retry dissolving the table.",
        );
    }
    await this.runExclusive(async () => {
      await this.assertExclusiveAuthority();
      this.identity.closeJoinWindow();
      for (const credential of this.identity.exportRecoveryState()
        .credentials) {
        if (!credential.revoked) this.identity.revoke(credential.capabilityId);
      }
      this.invitations.clear();
      this.invitationByDigest.clear();
      this.capabilitySecrets.clear();
      this.broadcastChange();
      await Promise.all([
        this.recoveryStore.remove(),
        authorityStore(this.tableId).remove(),
      ]);
      this.recordDiagnostic("lifecycle", "accepted", "table-dissolved");
    });
  }

  async createAirplaneOffer(
    role: CapabilityRole,
    presentationLanguage?: AirplanePresentationLanguage,
  ): Promise<AirplaneOfferDetails> {
    return this.runExclusive(async () => {
      let invitation = this.invitations.get(role);
      if (!invitation) {
        await this.issueInvitationInternal(role);
        await this.persistRecovery();
        invitation = this.invitations.get(role);
      }
      if (!invitation)
        throw new Error("The pairing invitation is unavailable.");
      const pairing = await createHostAirplanePairing({
        binding: this.binding,
        invitation,
        ...(presentationLanguage ? { presentationLanguage } : {}),
      });
      this.airplanePairings.set(pairing.offerId, pairing);
      this.emit();
      return {
        code: pairing.offerCode,
        expiresAt: pairing.expiresAt,
        offerId: pairing.offerId,
        role: pairing.role,
      };
    });
  }

  async pairTableSideDisplay(
    requestCode: string,
  ): Promise<TableSideDisplayRole> {
    return this.runExclusive(async () => {
      const request = decodeTableSideDisplayPairingCode(requestCode);
      const configuredServiceUrls = tableSideDisplayPairingServiceUrls();
      const requestServiceUrls = request.serviceUrls ?? [request.serviceUrl];
      const candidateServices = (
        ["cloud-relay", "private-relay"] as const
      ).flatMap((route) => {
        const relay = relayConfigForRoute(route, this.relayRouteConfiguration);
        const serviceUrl = relay
          ? relayServiceEndpoint(relay, "/v1/display-pairings")
          : undefined;
        if (
          !relay ||
          !serviceUrl ||
          !configuredServiceUrls.includes(serviceUrl) ||
          !requestServiceUrls.includes(serviceUrl) ||
          !relay.pairingWriteCapability
        ) {
          return [];
        }
        return [{ capability: relay.pairingWriteCapability, serviceUrl }];
      });
      if (candidateServices.length === 0) {
        throw new Error(
          "This display pairing QR belongs to a different Connection Service.",
        );
      }
      if (request.expiresAt <= Date.now()) {
        throw new Error("This display pairing QR has expired.");
      }
      await this.issueInvitationInternal(request.requestedRole);
      const invitation = this.invitations.get(request.requestedRole);
      if (!invitation) {
        throw new Error(
          "The display capability invitation could not be created.",
        );
      }
      const invitationRelayRoutes = this.relayRoutesByInvitationToken.get(
        invitation.token,
      );
      const sealed = await seal(
        request.secret,
        {
          binding: { ...this.binding },
          invitationToken: invitation.token,
          ...(invitationRelayRoutes
            ? { relayRoutes: cloneRelayRoutes(invitationRelayRoutes) }
            : {}),
          role: request.requestedRole,
        },
        `display-pair:${request.requestId}`,
      );
      let paired = false;
      for (const { capability, serviceUrl } of candidateServices) {
        const controller = new AbortController();
        const timeout = globalThis.setTimeout(() => controller.abort(), 2_500);
        try {
          const response = await fetch(
            `${serviceUrl}/${encodeURIComponent(request.requestId)}`,
            {
              body: JSON.stringify({ ...sealed, expiresAt: request.expiresAt }),
              headers: {
                authorization: `Bearer ${capability}`,
                "content-type": "application/json",
              },
              method: "PUT",
              signal: controller.signal,
            },
          );
          globalThis.clearTimeout(timeout);
          if (response.ok) {
            paired = true;
            break;
          }
        } catch {
          globalThis.clearTimeout(timeout);
          // Cloudflare being unavailable must not prevent the Mac relay from
          // receiving the same one-shot display pairing response.
        }
      }
      if (!paired) {
        throw new Error(
          "The Connection Service did not accept this display pairing response.",
        );
      }
      await this.persistRecovery();
      this.emit();
      return request.requestedRole;
    });
  }

  async acceptAirplaneAnswer(answerCode: string): Promise<void> {
    await this.runExclusive(async () => {
      const offerId = airplaneAnswerOfferId(answerCode);
      const pairing = this.airplanePairings.get(offerId);
      if (!pairing) {
        throw new Error("This answer does not match an active pairing QR.");
      }
      const accepted = await pairing.acceptAnswer(answerCode);
      this.endpoint.attachAirplaneChannel(
        accepted.clientPeerId,
        accepted.channel,
      );
      this.recordDiagnostic("lifecycle", "accepted");
      this.emit();
    });
  }

  exportDiagnostics(): string {
    this.recordDiagnostic("support-export", "accepted");
    return this.diagnostics.export();
  }

  async issueInvitation(role: CapabilityRole): Promise<void> {
    await this.runExclusive(async () => {
      if (role === "player" && !this.identity.roster().joinWindowOpen) return;
      await this.issueInvitationInternal(role);
      await this.persistRecovery();
      this.emit();
    });
  }

  async issuePlayerReplacement(seatId: string): Promise<void> {
    await this.runExclusive(async () => {
      if (
        !this.identity.roster().seats.some((seat) => seat.seatId === seatId)
      ) {
        throw new Error("The replacement seat no longer exists.");
      }
      await this.issueInvitationInternal("player", seatId);
      await this.persistRecovery();
      this.emit();
    });
  }

  async setJoinWindow(open: boolean): Promise<void> {
    await this.runExclusive(async () => {
      if (open && this.rulesProfile.id === "nlhe-home-v1" && this.authority) {
        throw new Error(
          "New Digital Chips seats after the first deal are not available in this tracer.",
        );
      }
      if (open) {
        this.identity.openJoinWindow();
        if (this.identity.roster().seats.length < 10) {
          await this.issueInvitationInternal("player");
        }
      } else {
        this.identity.closeJoinWindow();
        this.invitations.delete("player");
      }
      await this.persistRecovery();
      this.emit();
    });
  }

  async setDisplayPosition(
    seatId: string,
    displayPosition: number,
  ): Promise<void> {
    await this.runExclusive(async () => {
      const result = this.identity.setDisplayPosition({
        displayPosition,
        seatId,
      });
      if (result.status === "rejected") {
        throw new Error(`Seat move rejected: ${result.code}`);
      }
      await this.persistRecovery();
      this.refreshProjection();
      this.broadcastChange();
    });
  }

  async revokeCapability(capabilityId: string): Promise<void> {
    await this.runExclusive(async () => {
      const result = this.identity.revoke(capabilityId);
      if (result.status === "rejected") {
        throw new Error(`Capability revoke rejected: ${result.code}`);
      }
      await this.persistRecovery();
      this.broadcastChange();
    });
  }

  async refreshRelaySession(operatorToken: string): Promise<void> {
    await this.runExclusive(async () => {
      this.operatorToken = operatorToken.trim() || undefined;
      const relayRoutes = await provisionHostRelayRoutes(
        this.binding,
        operatorToken,
        "host",
      );
      if (!relayRoutes) {
        throw new Error("No Connection Service is configured for this table.");
      }
      this.relayRouteConfiguration = cloneRelayRoutes(relayRoutes);
      this.endpoint.updateRelayRoutes(this.relayRouteConfiguration);
      for (const invitation of this.invitations.values()) {
        const existingRoutes = this.relayRoutesByInvitationToken.get(
          invitation.token,
        );
        const peerId = relayPeerIdForRoutes(
          existingRoutes,
          `invite-${await digest(invitation.token)}`,
        );
        const routes = await provisionHostRelayRoutes(
          this.binding,
          operatorToken,
          peerId,
        );
        if (routes)
          this.relayRoutesByInvitationToken.set(invitation.token, routes);
      }
      for (const peerId of this.relayRoutesByPeerId.keys()) {
        const routes = await provisionHostRelayRoutes(
          this.binding,
          operatorToken,
          peerId,
        );
        if (routes) this.relayRoutesByPeerId.set(peerId, routes);
      }
      // The supplied token remains only for this live host document.
      await this.persistRecovery();
      // Existing connected clients refresh a sealed capability response and
      // receive the renewed ticket expiry without exposing it to the relay.
      this.broadcastChange();
    });
  }

  async resumeConnectivity(
    trigger: ConnectivityRecoveryTrigger = "manual",
  ): Promise<void> {
    try {
      const resumed = await this.endpoint.resume(trigger);
      if (!resumed) return;
      const wasUnavailable = this.connectivityUnavailable;
      const previousConnectivityError = this.connectivityError;
      this.connectivityLivenessMisses = 0;
      this.connectivityUnavailable = false;
      this.connectivityError = undefined;
      if (
        previousConnectivityError &&
        this.error === previousConnectivityError
      ) {
        this.error = undefined;
      }
      if (wasUnavailable || previousConnectivityError) this.broadcastChange();
    } catch (error) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (trigger === "manual") throw error;
        return;
      }
      // A polling tick inside the bounded backoff window is not a new
      // authenticated liveness miss. The last real failure remains quiet
      // until the next permitted probe.
      if (error instanceof ConnectivityRecoveryBackoffError) return;
      // Host-side relay health is a transport counter, not peer liveness.
      this.connectivityLivenessMisses = Math.min(
        this.connectivityLivenessMisses + 1,
        3,
      );
      this.connectivityUnavailable = this.connectivityLivenessMisses >= 3;
      if (!this.connectivityUnavailable && trigger === "automatic") return;
      const message =
        error instanceof Error
          ? `Host connection did not resume: ${error.message}`
          : "Host connection did not resume.";
      this.connectivityError = message;
      this.captureError(new Error(message));
      throw error;
    }
  }

  async relocateDealer(dealerSeatId: string): Promise<void> {
    await this.runExclusive(async () => {
      const receipt = await this.submitHostInternal({
        dealerSeatId,
        type: "RelocateDealer",
      });
      if (receipt.status === "rejected") {
        throw new Error(`Dealer relocation rejected: ${receipt.code}`);
      }
    });
  }

  async setTableTheme(tableTheme: TableTheme): Promise<void> {
    await this.runExclusive(async () => {
      const receipt = await this.submitHostInternal({
        tableTheme,
        type: "SetTableTheme",
      });
      if (receipt.status === "rejected") {
        throw new Error(`Table theme rejected: ${receipt.code}`);
      }
    });
  }

  async setCardStyle(cardStyle: CardStyle): Promise<void> {
    await this.runExclusive(async () => {
      const receipt = await this.submitHostInternal({
        cardStyle,
        type: "SetCardStyle",
      });
      if (receipt.status === "rejected") {
        throw new Error(`Card style rejected: ${receipt.code}`);
      }
    });
  }

  async voidHand(reason: string): Promise<void> {
    await this.runExclusive(async () => {
      const receipt = await this.submitHostInternal(
        { reason: reason.trim(), type: "VoidHand" },
        true,
      );
      if (receipt.status === "rejected") {
        throw new Error(`Void rejected: ${receipt.code}`);
      }
      await this.completeHandIdentity();
      await this.persistRecovery();
      this.refreshProjection();
      this.broadcastChange();
    });
  }

  async recordCorrection(eventId: string, reason: string): Promise<void> {
    await this.runExclusive(async () => {
      const receipt = await this.submitHostInternal({
        correctedEventIds: [eventId],
        reason: reason.trim(),
        type: "RecordCorrection",
      });
      if (receipt.status === "rejected") {
        throw new Error(`Correction rejected: ${receipt.code}`);
      }
    });
  }

  snapshot(): HostRuntimeSnapshot {
    const cloudRelay = this.relayRouteConfiguration?.cloudRelay;
    const privateRelay = this.relayRouteConfiguration?.privateRelay;
    const relay = cloudRelay ?? privateRelay;
    return {
      connectionLabel: this.endpoint.connectionLabel(),
      ...(this.error ? { error: this.error } : {}),
      history:
        this.authority?.history().map(({ eventId, revision, type }) => ({
          eventId,
          revision,
          type,
        })) ?? [],
      invitations: Object.fromEntries(
        [...this.invitations.entries()].map(([role, invitation]) => [
          role,
          { ...invitation },
        ]),
      ),
      ...(this.projection
        ? { projection: structuredClone(this.projection) }
        : {}),
      ...(relay?.expiresAt
        ? {
            relaySession: {
              expiresAt: relay.expiresAt,
              route: cloudRelay ? "cloud-relay" : "private-relay",
            },
          }
        : {}),
      roster: this.identity.roster(),
      stage: this.authority ? "table" : "lobby",
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async startTable(): Promise<void> {
    await this.runExclusive(async () => {
      if (this.authority) return;
      await this.assertExclusiveAuthority();
      const seats = this.identity.roster().seats;
      if (seats.length < 2) {
        throw new Error("At least two players must join before dealing.");
      }
      const authority = createTrustedHostAuthority({
        authorityEpoch: this.authorityEpoch,
        custody: createCardCustody(),
        handIdFactory: () => this.handIds.next(),
        store: authorityStore(this.tableId),
        tableId: this.tableId,
      });
      const create = await authority.submit({
        actor: { actorId: "host", kind: "trusted-host" },
        authorityEpoch: this.authorityEpoch,
        commandId: makeId("command"),
        expectedRevision: 0,
        payload: {
          dealerSeatId: seats[0]?.seatId ?? "",
          rulesProfile: this.rulesProfile,
          seats: seats.map(({ displayName, seatId }) => ({
            displayName,
            seatId,
          })),
          type: "CreateTable",
        },
        tableId: this.tableId,
      });
      if (create.status === "rejected") {
        throw new Error(`Create failed: ${create.code}`);
      }
      this.authority = authority;
      const start = await this.submitHostInternal({ type: "StartHand" });
      if (start.status === "rejected") {
        throw new Error(`First deal failed: ${start.code}`);
      }
      if (this.rulesProfile.id === "nlhe-home-v1") {
        this.identity.closeJoinWindow();
        this.invitations.delete("player");
      }
      this.identity.onHandStarted();
      await this.persistRecovery();
      this.refreshProjection();
      this.broadcastChange();
      this.recordDiagnostic("lifecycle", "accepted");
    });
  }

  async revealStreet(street: Street): Promise<void> {
    await this.runExclusive(async () => {
      const receipt = await this.submitHostInternal(
        { street, type: "RevealStreet" },
        true,
      );
      if (receipt.status === "rejected") {
        throw new Error(`Street reveal rejected: ${receipt.code}`);
      }
    });
  }

  async endHand(): Promise<void> {
    await this.runExclusive(async () => {
      const receipt = await this.submitHostInternal({ type: "EndHand" }, true);
      if (receipt.status === "rejected") {
        throw new Error(`End hand rejected: ${receipt.code}`);
      }
      await this.completeHandIdentity();
      await this.persistRecovery();
      this.refreshProjection();
      this.broadcastChange();
    });
  }

  async prepareSettlement(): Promise<void> {
    await this.runExclusive(async () => {
      const receipt = await this.submitHostInternal(
        { type: "PrepareSettlement" },
        true,
      );
      if (receipt.status === "rejected") {
        throw new Error(`Settlement review rejected: ${receipt.code}`);
      }
    });
  }

  async confirmSettlement(): Promise<void> {
    await this.runExclusive(async () => {
      const receipt = await this.submitHostInternal(
        { type: "ConfirmSettlement" },
        true,
      );
      if (receipt.status === "rejected") {
        throw new Error(`Settlement confirmation rejected: ${receipt.code}`);
      }
      await this.completeHandIdentity();
      await this.persistRecovery();
      this.refreshProjection();
      this.broadcastChange();
    });
  }

  async topUpChips(seatId: string, amount: number): Promise<void> {
    await this.runExclusive(async () => {
      const receipt = await this.submitHostInternal({
        type: "TopUpChips",
        seatId,
        amount,
      });
      if (receipt.status === "rejected") {
        throw new Error(`Chip top-up rejected: ${receipt.code}`);
      }
      // submitHostInternal has already atomically persisted the chip ledger
      // and published the committed projection. No identity state changed.
      // A second unrelated recovery write could misreport a committed top-up.
    });
  }

  async startNextHand(): Promise<void> {
    await this.runExclusive(async () => {
      const receipt = await this.submitHostInternal({ type: "StartHand" });
      if (receipt.status === "rejected") {
        throw new Error(`Next deal rejected: ${receipt.code}`);
      }
      this.identity.onHandStarted();
      await this.persistRecovery();
      this.refreshProjection();
      this.broadcastChange();
    });
  }

  private async assertExclusiveAuthority(): Promise<void> {
    if (!(await this.lease.isHeld())) {
      throw new Error(
        "Exclusive Trusted Host control was lost. This tab is now read-only.",
      );
    }
  }

  private broadcastChange(): void {
    void this.endpoint.broadcastChange({
      kind: "table-changed",
      revision: this.projection?.revision ?? 0,
    } satisfies TableChangedMessage);
    this.emit();
  }

  private captureError(error: unknown): void {
    this.error = error instanceof Error ? error.message : "Room action failed.";
    this.recordDiagnostic("command", "error", this.error);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private async handleJoin(
    message: JoinRequestMessage,
    senderPeerId: string,
    route: RoomRoute,
  ): Promise<void> {
    const replayKey = `join:${message.invitationDigest}:${message.requestId}`;
    const cachedResponse = this.cachedResponse(replayKey);
    if (cachedResponse) {
      await this.endpoint.sendOn(route, cachedResponse, senderPeerId);
      return;
    }
    if (this.tableClosing) return;
    const invitation = this.invitationByDigest.get(message.invitationDigest);
    if (!invitation) return;
    const invitationRelayRoutes = this.relayRoutesByInvitationToken.get(
      invitation.token,
    );
    const aad = `join:${this.tableId}:${message.requestId}`;
    let payload: JoinRequestPayload;
    try {
      payload = await unseal<JoinRequestPayload>(
        invitation.token,
        message,
        aad,
      );
    } catch {
      return;
    }
    let response: JoinResponsePayload;
    const redeemed: RedemptionResult =
      this.rulesProfile.id === "nlhe-home-v1" &&
      this.authority &&
      invitation.role === "player" &&
      !invitation.seatId
        ? { code: "join-window-closed", status: "rejected" }
        : this.identity.redeem({
            binding: payload.binding,
            clientInstanceId: payload.clientInstanceId,
            ...(payload.displayName
              ? { displayName: payload.displayName }
              : {}),
            invitationToken: payload.invitationToken,
          });
    if (redeemed.status === "accepted") {
      if (
        redeemed.role === "player" &&
        redeemed.seat &&
        this.authority &&
        !invitation.seatId
      ) {
        const receipt = await this.submitHostInternal({
          seat: {
            displayName: redeemed.seat.displayName,
            seatId: redeemed.seat.seatId,
          },
          type: "RegisterSeat",
        });
        if (receipt.status === "rejected") {
          this.identity.revoke(redeemed.credential.capabilityId);
          response = { code: receipt.code, status: "rejected" };
        } else {
          response = this.acceptedJoin(redeemed);
        }
      } else {
        response = this.acceptedJoin(redeemed);
      }
    } else {
      response = { code: redeemed.code, status: "rejected" };
    }

    if (response.status === "accepted") {
      if (invitationRelayRoutes) {
        this.relayRoutesByPeerId.set(
          senderPeerId,
          cloneRelayRoutes(invitationRelayRoutes) as RelayRouteConfiguration,
        );
      }
      await this.removeInvitation(invitation);
      this.relayRoutesByInvitationToken.delete(invitation.token);
      if (
        invitation.role === "player" &&
        this.identity.roster().seats.length < 10
      ) {
        await this.issueInvitationInternal("player");
      }
      await this.persistRecovery();
    }
    const sealed = {
      ...(await seal(invitation.token, response, aad)),
      kind: "join-response",
      requestId: message.requestId,
    } satisfies JoinResponseMessage;
    this.rememberResponse(replayKey, sealed);
    await this.endpoint.sendOn(route, sealed, senderPeerId);
    this.refreshProjection();
    this.emit();
  }

  private acceptedJoin(redeemed: RedemptionResult): AcceptedJoinPayload {
    if (redeemed.status !== "accepted") {
      throw new Error("An accepted capability grant was expected.");
    }
    this.capabilitySecrets.set(
      redeemed.credential.capabilityId,
      redeemed.credential.token,
    );
    return {
      credential: redeemed.credential,
      role: redeemed.role,
      ...(redeemed.seat ? { seat: redeemed.seat } : {}),
      status: "accepted",
    };
  }

  private async handleCapabilityRequest(
    message: CapabilityRequestMessage,
    senderPeerId: string,
    route: RoomRoute,
  ): Promise<void> {
    const replayKey = `capability:${message.capabilityId}:${message.requestId}`;
    const secret = this.capabilitySecrets.get(message.capabilityId);
    if (!secret) return;
    const aad = `cap:${this.tableId}:${message.capabilityId}:${message.requestId}`;
    let request: CapabilityRequestPayload;
    try {
      request = await unseal<CapabilityRequestPayload>(secret, message, aad);
    } catch {
      return;
    }
    const authenticated = this.identity.authenticate({
      binding: this.binding,
      clientInstanceId: request.clientInstanceId,
      credentialToken: request.credentialToken,
    });
    const requestFingerprint = await digest(JSON.stringify(request));
    const cachedResponse = this.cachedResponse(replayKey);
    const fingerprintMatches =
      this.cachedRequestFingerprints.get(replayKey) === requestFingerprint;
    if (
      authenticated.status === "accepted" &&
      cachedResponse &&
      fingerprintMatches
    ) {
      await this.endpoint.sendOn(route, cachedResponse, senderPeerId);
      return;
    }
    let response: CapabilityResponsePayload;
    if (authenticated.status === "rejected") {
      response = { code: authenticated.code, status: "rejected" };
    } else if (cachedResponse && !fingerprintMatches) {
      response = { code: "request-id-conflict", status: "rejected" };
    } else if (request.type === "history-page") {
      const history = this.exportPublicHistory();
      const latestRevision = history.frames.at(-1)?.revision ?? 0;
      const throughRevision = request.throughRevision ?? latestRevision;
      if (
        authenticated.role !== "player" ||
        !Number.isSafeInteger(request.afterRevision) ||
        request.afterRevision < 0 ||
        !Number.isSafeInteger(throughRevision) ||
        throughRevision < request.afterRevision ||
        throughRevision > latestRevision
      ) {
        response = { code: "invalid-history-request", status: "rejected" };
      } else {
        const remaining = history.frames.filter(
          (frame) =>
            frame.revision > request.afterRevision &&
            frame.revision <= throughRevision,
        );
        const frames: PublicHistoryFrame[] = [];
        let bytes = 0;
        let oversized = false;
        for (const frame of remaining) {
          const size = new TextEncoder().encode(JSON.stringify(frame)).length;
          if (bytes + size > 24000) {
            oversized = frames.length === 0;
            break;
          }
          frames.push(frame);
          bytes += size;
          if (frames.length >= 10) break;
        }
        response = oversized
          ? { status: "rejected", code: "history-frame-too-large" }
          : {
              status: "history-page",
              history: { ...history, frames },
              throughRevision,
              hasMore: frames.length < remaining.length,
            };
      }
    } else if (request.type === "history-saved") {
      if (
        authenticated.role !== "player" ||
        !this.tableClosing ||
        request.throughRevision !==
          (this.exportPublicHistory().frames.at(-1)?.revision ?? 0)
      ) {
        response = { code: "invalid-history-ack", status: "rejected" };
      } else {
        this.historySavedBy.add(authenticated.capabilityId);
        try {
          await this.persistRecovery();
        } catch (error) {
          this.historySavedBy.delete(authenticated.capabilityId);
          throw error;
        }
        response = { status: "history-saved" };
      }
    } else if (this.tableClosing && request.type !== "projection") {
      response = { code: "table-closing", status: "rejected" };
    } else if (
      request.type === "player-action" &&
      (authenticated.role !== "player" || !authenticated.seatId)
    ) {
      response = { code: "role-mismatch", status: "rejected" };
    } else if (
      request.type === "dealer-action" &&
      authenticated.role !== "table-control"
    ) {
      response = { code: "role-mismatch", status: "rejected" };
    } else if (
      request.type === "player-action" &&
      !isPlayerAction(request.action)
    ) {
      response = { code: "invalid-action", status: "rejected" };
    } else if (
      request.type === "dealer-action" &&
      !isDealerAction(request.action)
    ) {
      response = { code: "invalid-action", status: "rejected" };
    } else if (
      this.rulesProfile.id === "nlhe-home-v1" &&
      request.type === "player-action" &&
      (request.action.type === "leave" ||
        request.action.type === "set-sitting-out")
    ) {
      // The preview retains its original seats until blind-aware re-entry exists.
      // Reject before changing identity participation or the chip ledger.
      response = { code: "command-not-allowed", status: "rejected" };
    } else {
      if (authenticated.role === "player") {
        this.identity.setConnected({
          connected: true,
          credentialToken: request.credentialToken,
        });
      }
      if (request.type === "player-action" && authenticated.seatId) {
        await this.applyPlayerAction(
          authenticated.seatId,
          authenticated.capabilityId,
          request.credentialToken,
          request.action,
        );
      } else if (request.type === "dealer-action") {
        await this.applyDealerAction(request.action);
      }
      response = this.capabilityProjection(
        authenticated.role,
        authenticated.seatId,
        senderPeerId,
      );
      if (this.tableClosing && response.status !== "rejected")
        response = {
          ...response,
          tableClosing: true,
        } as CapabilityResponsePayload;
      await this.persistRecovery();
      this.emit();
    }
    let sealed = {
      ...(await seal(secret, response, aad)),
      capabilityId: message.capabilityId,
      kind: "capability-response",
      requestId: message.requestId,
    } satisfies CapabilityResponseMessage;
    if (new TextEncoder().encode(JSON.stringify(sealed)).length > 60000) {
      sealed = {
        ...(await seal(
          secret,
          { status: "rejected", code: "response-too-large" },
          aad,
        )),
        capabilityId: message.capabilityId,
        kind: "capability-response",
        requestId: message.requestId,
      };
    }
    this.cachedRequestFingerprints.set(replayKey, requestFingerprint);
    this.rememberResponse(replayKey, sealed);
    await this.endpoint.sendOn(route, sealed, senderPeerId);
  }

  private async handleLivenessRequest(
    message: LivenessRequestMessage,
    senderPeerId: string,
    route: RoomRoute,
  ): Promise<void> {
    const secret = this.capabilitySecrets.get(message.capabilityId);
    if (!secret) return;
    const aad = `liveness:${this.tableId}:${message.capabilityId}:${message.requestId}`;
    let request: LivenessRequestPayload;
    try {
      request = await unseal<LivenessRequestPayload>(secret, message, aad);
    } catch {
      return;
    }
    if (
      request.type !== "liveness" ||
      typeof request.clientInstanceId !== "string" ||
      typeof request.credentialToken !== "string"
    ) {
      return;
    }
    const authenticated = this.identity.authenticate({
      binding: this.binding,
      clientInstanceId: request.clientInstanceId,
      credentialToken: request.credentialToken,
    });
    const responsePayload: LivenessResponsePayload =
      authenticated.status === "rejected"
        ? { code: authenticated.code, status: "rejected" }
        : { role: authenticated.role, status: "alive" };
    const response = await seal(secret, responsePayload, aad);
    await this.endpoint.sendOn(
      route,
      {
        ...response,
        capabilityId: message.capabilityId,
        kind: "liveness-response",
        requestId: message.requestId,
      } satisfies LivenessResponseMessage,
      senderPeerId,
    );
  }

  private capabilityProjection(
    role: CapabilityRole,
    seatId?: string,
    relayPeerId?: string,
  ): CapabilityResponsePayload {
    const relayRoutes = relayPeerId
      ? this.relayRoutesByPeerId.get(relayPeerId)
      : undefined;
    const tableTheme = this.authority
      ? this.authority.project({ kind: "public" }).tableTheme
      : "dark-green";
    const cardStyle = this.authority
      ? this.authority.project({ kind: "public" }).cardStyle
      : "classic";
    if (role === "player") {
      const seat = this.identity
        .roster()
        .seats.find((candidate) => candidate.seatId === seatId);
      if (!seat || !seatId) {
        return { code: "seat-unknown", status: "rejected" };
      }
      if (!this.authority) {
        return {
          futureSittingOut: seat.futureSittingOut,
          ...optionalRelayRoutes(relayRoutes),
          role,
          seat,
          status: "waiting",
          rulesProfileId: this.rulesProfile.id,
          cardStyle,
          tableTheme,
        };
      }
      try {
        const projection = this.orderProjection(
          this.authority.project({ kind: "seat", seatId }),
        );
        if (projection.view !== "seat") {
          return { code: "role-mismatch", status: "rejected" };
        }
        return {
          futureSittingOut: seat.futureSittingOut,
          projection,
          ...optionalRelayRoutes(relayRoutes),
          role,
          status: "projection",
        };
      } catch {
        return {
          futureSittingOut: seat.futureSittingOut,
          ...optionalRelayRoutes(relayRoutes),
          role,
          seat,
          status: "waiting",
          rulesProfileId: this.rulesProfile.id,
          cardStyle,
          tableTheme,
        };
      }
    }
    if (!this.authority) {
      return {
        ...optionalRelayRoutes(relayRoutes),
        role,
        status: "waiting",
        rulesProfileId: this.rulesProfile.id,
        cardStyle,
        tableTheme,
      };
    }
    const projection = this.orderProjection(
      this.authority.project({ kind: "public" }),
    );
    if (projection.view !== "public") {
      return { code: "role-mismatch", status: "rejected" };
    }
    return {
      projection,
      ...optionalRelayRoutes(relayRoutes),
      role,
      status: "projection",
    };
  }

  private async applyDealerAction(action: DealerAction): Promise<void> {
    if (action.type === "reveal-street") {
      const receipt = await this.submitHostInternal(
        { street: action.street, type: "RevealStreet" },
        true,
      );
      if (receipt.status === "rejected") {
        throw new Error(`Tablet action rejected: ${receipt.code}`);
      }
    } else if (action.type === "end-hand") {
      const receipt = await this.submitHostInternal({ type: "EndHand" }, true);
      if (receipt.status === "rejected") {
        throw new Error(`Tablet action rejected: ${receipt.code}`);
      }
      await this.completeHandIdentity();
    } else if (action.type === "prepare-settlement") {
      const receipt = await this.submitHostInternal(
        { type: "PrepareSettlement" },
        true,
      );
      if (receipt.status === "rejected") {
        throw new Error(`Tablet action rejected: ${receipt.code}`);
      }
    } else if (action.type === "confirm-settlement") {
      const receipt = await this.submitHostInternal(
        { type: "ConfirmSettlement" },
        true,
      );
      if (receipt.status === "rejected") {
        throw new Error(`Tablet action rejected: ${receipt.code}`);
      }
      await this.completeHandIdentity();
    } else {
      const receipt = await this.submitHostInternal({ type: "StartHand" });
      if (receipt.status === "rejected") {
        throw new Error(`Tablet action rejected: ${receipt.code}`);
      }
      this.identity.onHandStarted();
    }
  }

  private async applyPlayerAction(
    seatId: string,
    capabilityId: string,
    credentialToken: string,
    action: PlayerAction,
  ): Promise<void> {
    if (action.type === "disconnect") {
      this.identity.setConnected({ connected: false, credentialToken });
      this.emit();
      return;
    }
    if (action.type === "set-sitting-out") {
      this.identity.setFutureParticipation({
        credentialToken,
        sittingOut: action.sittingOut,
      });
      if (this.authority) {
        const receipt = await this.submitPlayerInternal(seatId, {
          seatId,
          sittingOut: action.sittingOut,
          type: "SetSeatParticipation",
        });
        if (receipt.status === "rejected") {
          throw new Error(`Seat participation rejected: ${receipt.code}`);
        }
      }
      return;
    }
    if (action.type === "leave") {
      const seatsBefore = new Set(
        this.identity.roster().seats.map((seat) => seat.seatId),
      );
      this.identity.setFutureParticipation({
        credentialToken,
        sittingOut: true,
      });
      if (this.authority) {
        const receipt = await this.submitPlayerInternal(seatId, {
          seatId,
          sittingOut: true,
          type: "SetSeatParticipation",
        });
        if (receipt.status === "rejected") {
          throw new Error(`Leave participation rejected: ${receipt.code}`);
        }
      }
      this.identity.setConnected({ connected: false, credentialToken });
      // Digital Accounting owns its own immutable seat ledger. This physical-
      // chip flow may release a position, immediately between hands or at the
      // next hand boundary, without renumbering anyone else.
      if (this.rulesProfile.id === "deal-only-v1") {
        const released = this.identity.releaseSeat({ credentialToken });
        if (released.status === "rejected") {
          throw new Error(`Leave rejected: ${released.code}`);
        }
        if (released.releasedImmediately) {
          await this.reconcileReleasedSeats(seatsBefore);
        } else {
          const revoked = this.identity.revoke(capabilityId);
          if (revoked.status === "rejected") {
            throw new Error(`Leave rejected: ${revoked.code}`);
          }
        }
      } else {
        const revoked = this.identity.revoke(capabilityId);
        if (revoked.status === "rejected") {
          throw new Error(`Leave rejected: ${revoked.code}`);
        }
      }
      return;
    }
    if (action.type === "betting") {
      const receipt = await this.submitPlayerInternal(
        seatId,
        { action: action.action, type: "SubmitBettingAction" },
        true,
      );
      if (receipt.status === "rejected") {
        throw new Error(`Betting action rejected: ${receipt.code}`);
      }
      return;
    }
    const payloadByAction = {
      "finalize-fold": { type: "FinalizeFold" },
      fold: { type: "FoldCards" },
      show: { type: "ShowCards" },
      "undo-fold": { type: "RetractFold" },
    } as const;
    const receipt = await this.submitPlayerInternal(
      seatId,
      payloadByAction[action.type],
      true,
    );
    if (receipt.status === "rejected") {
      throw new Error(`Player action rejected: ${receipt.code}`);
    }
  }

  private async issueInvitationInternal(
    role: CapabilityRole,
    seatId?: string,
  ): Promise<void> {
    let relayRoutes: RelayRouteConfiguration | undefined;
    let relayPeerId: string | undefined;
    if (this.relayRouteConfiguration) {
      if (!this.operatorToken) {
        throw new Error(
          "A host operator token is required to issue a new Table-side Mode invitation.",
        );
      }
      // Allocate the relay ticket before mutating identity. A transient relay
      // outage must not revoke the previous invitation and leave the join
      // window with a link that has no authorized peer ticket.
      relayPeerId = makeId("invite-peer");
      relayRoutes = await provisionHostRelayRoutes(
        this.binding,
        this.operatorToken,
        relayPeerId,
      );
      if (!relayRoutes) throw new Error("No Connection Service is configured.");
    }
    const invitation = this.identity.issueInvitation({
      role,
      ...(seatId ? { seatId } : {}),
      ttlMs: invitationTtlMs,
    });
    this.invitations.set(role, invitation);
    this.invitationByDigest.set(await digest(invitation.token), invitation);
    if (relayRoutes && relayPeerId) {
      this.relayRoutesByInvitationToken.set(invitation.token, relayRoutes);
    }
  }

  private async persistRecovery(): Promise<void> {
    await this.assertExclusiveAuthority();
    const nextRevision = this.recoveryRevision + 1;
    const result = await this.recoveryStore.commit(this.recoveryRevision, {
      revision: nextRevision,
      state: {
        authorityEpoch: this.authorityEpoch,
        binding: { ...this.binding },
        diagnosticSalt: this.diagnosticSalt,
        tableClosing: this.tableClosing,
        ...(this.tableClosing
          ? {
              historySavedBy: [...this.historySavedBy],
              historySavedAtRevision:
                this.exportPublicHistory().frames.at(-1)?.revision ?? 0,
            }
          : {}),
        identity: this.identity.exportRecoveryState(),
        invitations: [...this.invitations.values()].map((invitation) => ({
          ...invitation,
        })),
        privacyClass: "host-recovery-secret",
        ...(this.relayRouteConfiguration
          ? { relayRoutes: this.relayRouteConfiguration }
          : {}),
        ...(this.relayRoutesByInvitationToken.size > 0
          ? {
              relayRoutesByInvitationToken: relayRouteRecord(
                this.relayRoutesByInvitationToken,
              ),
            }
          : {}),
        ...(this.relayRoutesByPeerId.size > 0
          ? {
              relayRoutesByPeerId: relayRouteRecord(this.relayRoutesByPeerId),
            }
          : {}),
        rulesProfile: structuredClone(this.rulesProfile),
        schemaVersion: 1,
      },
    });
    if (result.status !== "committed") {
      throw new Error(`Trusted Host recovery commit failed: ${result.status}`);
    }
    this.recoveryRevision = nextRevision;
  }

  private recordDiagnostic(
    eventType: "command" | "lifecycle" | "recovery" | "support-export",
    result: "accepted" | "rejected" | "error",
    errorClass?: string,
    commandKind?: CommandEnvelope["payload"]["type"],
  ): void {
    this.diagnostics.record({
      actorPseudonym: "trusted-host",
      buildVersion: BUILD_VERSION,
      capabilityScope: "trusted-host",
      ...(commandKind ? { commandKind } : {}),
      ...(errorClass ? { errorClass: errorClass.slice(0, 64) } : {}),
      eventType,
      ...(this.projection?.handId ? { handId: this.projection.handId } : {}),
      ...(this.projection ? { handPhase: this.projection.phase } : {}),
      protocolVersion: PROTOCOL_VERSION,
      result,
      ...(this.projection ? { revision: this.projection.revision } : {}),
      route: "direct",
      tablePseudonym: this.tableId.slice(-36),
    });
  }

  private async rebuildInvitationDigests(): Promise<void> {
    for (const invitation of this.invitations.values()) {
      this.invitationByDigest.set(await digest(invitation.token), invitation);
    }
  }

  private cachedResponse(
    key: string,
  ): JoinResponseMessage | CapabilityResponseMessage | undefined {
    return this.cachedResponses.get(key);
  }

  private rememberResponse(
    key: string,
    response: JoinResponseMessage | CapabilityResponseMessage,
  ): void {
    this.cachedResponses.set(key, response);
    while (this.cachedResponses.size > 512) {
      const oldestKey = this.cachedResponses.keys().next().value;
      if (typeof oldestKey !== "string") return;
      this.cachedResponses.delete(oldestKey);
      this.cachedRequestFingerprints.delete(oldestKey);
    }
  }

  private async removeInvitation(invitation: Invitation): Promise<void> {
    this.invitations.delete(invitation.role);
    this.invitationByDigest.delete(await digest(invitation.token));
  }

  private refreshProjection(): void {
    if (!this.authority) return;
    const projection = this.authority.project({ kind: "public" });
    if (projection.view !== "public") {
      throw new Error("The Trusted Host requires a public projection.");
    }
    this.projection = this.orderProjection(projection);
  }

  /**
   * A permanent departure may be requested mid-hand, but the current hand must
   * retain its original actors until it ends. Reconcile the identity roster
   * with Game Core only at that safe boundary.
   */
  private async completeHandIdentity(): Promise<void> {
    const seatsBefore = new Set(
      this.identity.roster().seats.map((seat) => seat.seatId),
    );
    this.identity.onHandEnded();
    await this.reconcileReleasedSeats(seatsBefore);
    await this.syncParticipation();
  }

  private async reconcileReleasedSeats(
    seatsBefore: ReadonlySet<string>,
  ): Promise<void> {
    if (!this.authority) return;
    const seatsNow = this.identity.roster().seats;
    const activeSeatIds = new Set(seatsNow.map((seat) => seat.seatId));
    const releasedSeatIds = [...seatsBefore].filter(
      (seatId) => !activeSeatIds.has(seatId),
    );
    for (const seatId of releasedSeatIds) {
      const receipt = await this.submitHostInternal({
        seatId,
        type: "UnregisterSeat",
      });
      if (receipt.status === "rejected") {
        throw new Error(`Seat release rejected: ${receipt.code}`);
      }
    }
    if (
      releasedSeatIds.length > 0 &&
      this.identity.roster().joinWindowOpen &&
      seatsNow.length < 10 &&
      !this.invitations.get("player")
    ) {
      await this.issueInvitationInternal("player");
    }
  }

  private orderProjection<T extends PublicProjection | SeatProjection>(
    projection: T,
  ): T {
    const roster = this.identity.roster();
    const positions = new Map(
      roster.seats.map((seat) => [seat.seatId, seat.displayPosition]),
    );
    const connections = new Map(
      roster.seats.map((seat) => [seat.seatId, seat.connected]),
    );
    const activeSeatIds = new Set(positions.keys());
    return {
      ...structuredClone(projection),
      seats: [...projection.seats]
        .filter((seat) => activeSeatIds.has(seat.seatId))
        .map((seat) => ({
          ...seat,
          connected: connections.get(seat.seatId) ?? false,
          displayPosition: positions.get(seat.seatId),
        }))
        .sort(
          (left, right) =>
            (positions.get(left.seatId) ?? Number.MAX_SAFE_INTEGER) -
            (positions.get(right.seatId) ?? Number.MAX_SAFE_INTEGER),
        ),
    };
  }

  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(task);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async prepareAvailableSettlement(): Promise<void> {
    if (!IS_PHASE2_BUILD || this.tableClosing || !this.authority) return;
    const projection = this.authority.project({ kind: "public" });
    if (
      projection.view !== "public" ||
      projection.phase !== "showdown" ||
      projection.accounting?.phase !== "showdown" ||
      !projection.handId
    )
      return;
    // Called inside initialization or the existing operation queue. Preparing
    // awards is durable; applying them still requires an explicit host command.
    const receipt = await this.authority.submit({
      actor: { actorId: "host", kind: "trusted-host" },
      authorityEpoch: this.authorityEpoch,
      commandId: `auto-settlement-${projection.handId}`,
      expectedRevision: projection.revision,
      handId: projection.handId,
      payload: { type: "PrepareSettlement" },
      tableId: this.tableId,
    });
    this.recordDiagnostic(
      "command",
      receipt.status === "accepted" ? "accepted" : "rejected",
      receipt.status === "rejected" ? receipt.code : undefined,
      "PrepareSettlement",
    );
    if (receipt.status === "rejected")
      throw new Error(`Settlement review rejected: ${receipt.code}`);
  }

  private async submitHostInternal(
    payload: CommandEnvelope["payload"],
    handScoped = false,
  ) {
    await this.assertExclusiveAuthority();
    if (this.tableClosing)
      throw new Error(
        "The table is closing; only history downloads are available.",
      );
    if (!this.authority) throw new Error("The table has not started.");
    const projection = this.authority.project({ kind: "public" });
    const commandId = makeId("command");
    const receipt = await this.authority.submit({
      actor: { actorId: "host", kind: "trusted-host" },
      authorityEpoch: this.authorityEpoch,
      commandId,
      expectedRevision: projection.revision,
      ...(handScoped && projection.handId ? { handId: projection.handId } : {}),
      payload,
      tableId: this.tableId,
    });
    this.recordDiagnostic(
      "command",
      receipt.status === "accepted" ? "accepted" : "rejected",
      receipt.status === "rejected" ? receipt.code : undefined,
      payload.type,
    );
    if (receipt.status === "accepted") {
      // A proposal failure must not turn an already committed player/host action
      // into a reported rejection. The manual review control remains available.
      await this.prepareAvailableSettlement().catch((error) =>
        this.captureError(error),
      );
      this.refreshProjection();
      this.broadcastChange();
    }
    return receipt;
  }

  private async submitPlayerInternal(
    seatId: string,
    payload: CommandEnvelope["payload"],
    handScoped = false,
  ) {
    await this.assertExclusiveAuthority();
    if (this.tableClosing)
      throw new Error(
        "The table is closing; only history downloads are available.",
      );
    if (!this.authority) throw new Error("The table has not started.");
    const projection = this.authority.project({ kind: "public" });
    const receipt = await this.authority.submit({
      actor: { kind: "seat", seatId },
      authorityEpoch: this.authorityEpoch,
      commandId: makeId("command"),
      expectedRevision: projection.revision,
      ...(handScoped && projection.handId ? { handId: projection.handId } : {}),
      payload,
      tableId: this.tableId,
    });
    this.recordDiagnostic(
      "command",
      receipt.status === "accepted" ? "accepted" : "rejected",
      receipt.status === "rejected" ? receipt.code : undefined,
      payload.type,
    );
    if (receipt.status === "accepted") {
      // A proposal failure must not turn an already committed player/host action
      // into a reported rejection. The manual review control remains available.
      await this.prepareAvailableSettlement().catch((error) =>
        this.captureError(error),
      );
      this.refreshProjection();
      this.broadcastChange();
    }
    return receipt;
  }

  private async syncParticipation(): Promise<void> {
    // The digital preview has no manual participation changes. Preserve Core's
    // skipped-deal status so a later top-up cannot bypass blind-aware re-entry.
    if (!this.authority || this.rulesProfile.id === "nlhe-home-v1") return;
    for (const seat of this.identity.roster().seats) {
      await this.submitHostInternal({
        seatId: seat.seatId,
        // The authority flag describes the *next* hand. A seat can be sitting
        // out of the current hand while having already opted back in. Folding
        // the current state into this value would silently undo that choice at
        // hand end and strand the player for another hand.
        sittingOut: seat.futureSittingOut,
        type: "SetSeatParticipation",
      });
    }
  }
}

export interface ClientRuntimeSnapshot {
  readonly tableDissolved?: boolean;
  readonly rulesProfileId?: RulesProfile["id"];
  readonly cardStyle: CardStyle;
  readonly connectionLabel: string;
  readonly error?: string;
  readonly futureSittingOut: boolean;
  readonly projection?: PublicProjection | SeatProjection;
  readonly role: CapabilityRole;
  readonly seat?: RoomSeat;
  readonly status: "joining" | "waiting" | "playing" | "rejected";
  readonly tableTheme: TableTheme;
}

export interface InvitationDetails {
  readonly binding: PeerBinding;
  readonly invitationToken: string;
  readonly relayRoutes?: RelayRouteConfiguration;
  readonly role: CapabilityRole;
}

export interface ClientRecoveryDetails {
  readonly binding: PeerBinding;
  readonly role: CapabilityRole;
  readonly slotId: string;
}

export interface ClientRuntimeLaunchOptions {
  readonly recoveryNavigation?: "client" | "embedded-host";
}

interface ClientRuntimeOptions {
  readonly airplanePairing?: ClientAirplanePairing;
  readonly binding: PeerBinding;
  readonly clientInstanceId: string;
  readonly credential?: Credential;
  readonly invitationToken?: string;
  readonly lease?: ExclusiveHostLease;
  readonly relayRoutes?: RelayRouteConfiguration;
  readonly recoveryRevision: number;
  readonly recoveryNavigation?: "client" | "embedded-host";
  readonly role: CapabilityRole;
  readonly seat?: RoomSeat;
  readonly slotId: string;
}

export class TableClientRuntime {
  private finalPublicHistory: PublicTableHistory | undefined;
  private historyDownload: Promise<PublicTableHistory> | undefined;
  private savingFinalHistory = false;
  readonly binding: PeerBinding;
  readonly role: CapabilityRole;
  private readonly airplanePairing: ClientAirplanePairing | undefined;
  private readonly clientInstanceId: string;
  private credential: Credential | undefined;
  private readonly endpoint: RoomEndpoint;
  private error: string | undefined;
  private futureSittingOut = false;
  private rulesProfileId: RulesProfile["id"] | undefined;
  private readonly invitationToken: string | undefined;
  private lease: ExclusiveHostLease | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Map<
    string,
    (
      message:
        | JoinResponseMessage
        | CapabilityResponseMessage
        | LivenessResponseMessage,
    ) => void
  >();
  private refreshFlight: Promise<void> | undefined;
  private refreshTrigger: ConnectivityRecoveryTrigger = "automatic";
  private refreshRequestedRevision = 0;
  private routeRecoveryMisses = 0;
  private routeRecoveryError: string | undefined;
  private hostLivenessMisses = 0;
  private hostUnavailable = false;
  private presencePaused = false;
  private projection: PublicProjection | SeatProjection | undefined;
  private recoveryCommitTail: Promise<void> = Promise.resolve();
  private readonly recoveryNavigation: "client" | "embedded-host";
  private recoveryRevision: number;
  private readonly recoveryStore: AtomicTableStore<ClientRecoveryState>;
  private relayRoutes: RelayRouteConfiguration | undefined;
  private seat: RoomSeat | undefined;
  private readonly slotId: string;
  private status: ClientRuntimeSnapshot["status"] = "joining";
  private tableTheme: TableTheme = "dark-green";
  private cardStyle: CardStyle = "classic";

  private constructor(options: ClientRuntimeOptions) {
    this.airplanePairing = options.airplanePairing;
    this.binding = { ...options.binding };
    this.role = options.role;
    this.clientInstanceId = options.clientInstanceId;
    this.credential = options.credential;
    this.invitationToken = options.invitationToken;
    this.lease = options.lease;
    this.relayRoutes = cloneRelayRoutes(options.relayRoutes);
    this.recoveryNavigation = options.recoveryNavigation ?? "client";
    this.recoveryRevision = options.recoveryRevision;
    this.slotId = options.slotId;
    this.recoveryStore = clientRecoveryStore(
      options.binding.tableId,
      options.role,
      options.slotId,
    );
    this.seat = options.seat;
    this.status = options.credential ? "waiting" : "joining";
    this.endpoint = new RoomEndpoint(
      this.binding,
      relayPeerIdForRoutes(this.relayRoutes, this.clientInstanceId),
      this.relayRoutes,
    );
    if (options.airplanePairing) {
      this.endpoint.attachAirplaneChannel(
        "host",
        options.airplanePairing.channel,
      );
    }
    this.endpoint.subscribe((event) => {
      const message = event.message;
      if (
        this.credential &&
        (message.kind === "capability-response" ||
          message.kind === "liveness-response")
      ) {
        void this.observeAuthenticatedHostFrame(message);
      }
      if (
        (message.kind === "join-response" ||
          message.kind === "capability-response" ||
          message.kind === "liveness-response") &&
        this.pending.has(message.requestId)
      ) {
        this.pending.get(message.requestId)?.(message);
      } else if (
        message.kind === "table-changed" &&
        this.credential &&
        !this.presencePaused
      ) {
        if (this.finalPublicHistory)
          void this.acknowledgeFinalHistory().catch(() => undefined);
        else
          void this.refresh("automatic", message.revision).catch((error) =>
            this.captureError(error),
          );
      }
    });
  }

  static fromInvitation(
    details: InvitationDetails,
    options: ClientRuntimeLaunchOptions = {},
  ): TableClientRuntime {
    if (invitationReleaseIssue(details.binding) !== undefined) {
      throw new Error(
        "This invitation belongs to a different version of Our Poker Table.",
      );
    }
    return new TableClientRuntime({
      binding: details.binding,
      clientInstanceId: makeId("client"),
      invitationToken: details.invitationToken,
      ...(details.relayRoutes ? { relayRoutes: details.relayRoutes } : {}),
      recoveryRevision: 0,
      ...options,
      role: details.role,
      slotId: makeId("slot"),
    });
  }

  static async fromAirplaneOffer(offerCode: string): Promise<{
    readonly answerCode: string;
    readonly presentationLanguage?: AirplanePresentationLanguage;
    readonly runtime: TableClientRuntime;
  }> {
    const pairing = await acceptHostAirplaneOffer(offerCode);
    if (
      pairing.binding.buildVersion !== BUILD_VERSION ||
      pairing.binding.protocolVersion !== PROTOCOL_VERSION
    ) {
      pairing.close();
      throw new Error(
        "The two Airplane files use incompatible build or protocol versions.",
      );
    }
    const runtime = new TableClientRuntime({
      airplanePairing: pairing,
      binding: pairing.binding,
      clientInstanceId: pairing.clientPeerId,
      invitationToken: pairing.invitation.token,
      recoveryRevision: 0,
      role: pairing.invitation.role,
      slotId: makeId("slot"),
    });
    return {
      answerCode: pairing.answerCode,
      ...(pairing.presentationLanguage
        ? { presentationLanguage: pairing.presentationLanguage }
        : {}),
      runtime,
    };
  }

  static async recover(
    details: ClientRecoveryDetails,
    options: ClientRuntimeLaunchOptions = {},
  ): Promise<TableClientRuntime> {
    const lease = await acquireClientLease(
      details.binding.tableId,
      details.role,
      details.slotId,
      true,
    );
    try {
      const store = clientRecoveryStore(
        details.binding.tableId,
        details.role,
        details.slotId,
      );
      const saved = await store.load();
      if (!saved) {
        throw new Error("No saved seat or display credential was found.");
      }
      assertClientRecoveryState(saved.state, details);
      const runtime = new TableClientRuntime({
        binding: saved.state.binding,
        clientInstanceId: saved.state.clientInstanceId,
        credential: saved.state.credential,
        lease,
        ...(saved.state.relayRoutes
          ? { relayRoutes: saved.state.relayRoutes }
          : {}),
        recoveryRevision: saved.revision,
        ...options,
        role: saved.state.role,
        ...(saved.state.seat ? { seat: saved.state.seat } : {}),
        slotId: saved.state.slotId,
      });
      if (saved.state.finalPublicHistory) {
        runtime.finalPublicHistory = parsePublicTableHistory(
          JSON.stringify(saved.state.finalPublicHistory),
        );
        runtime.status = "waiting";
      } else {
        await runtime.refresh();
      }
      return runtime;
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  close(): void {
    this.endpoint.close();
    this.airplanePairing?.close();
    this.lease?.release();
    this.lease = undefined;
  }

  recoveryDetails(): ClientRecoveryDetails {
    return {
      binding: { ...this.binding },
      role: this.role,
      slotId: this.slotId,
    };
  }

  async reconnect(
    trigger: ConnectivityRecoveryTrigger = "manual",
  ): Promise<void> {
    await this.resumeConnectivity(trigger);
  }

  /**
   * Probe the relay and then perform the existing authenticated projection
   * catch-up. Relay health is read-only and never replaces a healthy socket;
   * the projection request remains here because liveness does not carry a
   * revision and a quiet page can miss a host broadcast.
   */
  async resumeConnectivity(
    trigger: ConnectivityRecoveryTrigger = "automatic",
  ): Promise<void> {
    if (this.finalPublicHistory || !this.credential) return;
    let resumed: boolean;
    try {
      resumed = await this.endpoint.resume(trigger);
    } catch (error) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (trigger === "manual") throw error;
        return;
      }
      // A backoff poll is deliberately quiet; it did not perform a new
      // authenticated probe and must not advance the three-miss policy.
      if (error instanceof ConnectivityRecoveryBackoffError) {
        if (trigger === "automatic") return;
        // A manual caller may share an automatic flight rejected during
        // backoff. No retry happened, so it must not report success.
        this.routeRecoveryError =
          "Connection did not resume. Check the network and choose Reconnect to table.";
        this.captureError(new Error(this.routeRecoveryError));
        throw error;
      }
      this.routeRecoveryMisses = Math.min(this.routeRecoveryMisses + 1, 3);
      if (this.routeRecoveryMisses < 3 && trigger === "automatic") return;
      this.routeRecoveryError =
        "Connection did not resume. Check the network and choose Reconnect to table.";
      this.captureError(new Error(this.routeRecoveryError));
      throw error;
    }
    if (!resumed) return;
    try {
      await this.refresh(trigger);
    } catch (error) {
      // refresh() owns the first-two quiet liveness misses and throws on the
      // third. Only that durable connectivity state gets an emitted error;
      // an authenticated projection command failure remains caller-owned.
      if (this.hostUnavailable)
        this.captureError(
          new Error(
            "Connection did not resume. Check the network and choose Reconnect to table.",
          ),
        );
      throw error;
    }
  }

  async join(displayName?: string): Promise<void> {
    if (!this.invitationToken) {
      throw new Error("The invitation is unavailable.");
    }
    if (!this.lease) {
      this.lease = await acquireClientLease(
        this.binding.tableId,
        this.role,
        this.slotId,
        false,
      );
    }
    const requestId = makeId("request");
    const aad = `join:${this.binding.tableId}:${requestId}`;
    const payload: JoinRequestPayload = {
      binding: this.binding,
      clientInstanceId: this.clientInstanceId,
      ...(displayName?.trim() ? { displayName: displayName.trim() } : {}),
      invitationToken: this.invitationToken,
    };
    const sealed = await seal(this.invitationToken, payload, aad);
    const message = await this.waitForResponse<JoinResponseMessage>(
      requestId,
      async () => {
        const invitationDigest = await digest(this.invitationToken ?? "");
        await this.endpoint.send(
          {
            ...sealed,
            invitationDigest,
            kind: "join-request",
            requestId,
          } satisfies JoinRequestMessage,
          "host",
        );
      },
    );
    const response = await unseal<JoinResponsePayload>(
      this.invitationToken,
      message,
      aad,
    );
    if (response.status === "rejected") {
      this.error = response.code;
      this.status = "rejected";
      this.lease.release();
      this.lease = undefined;
      this.emit();
      return;
    }
    if (response.role !== this.role) {
      this.error = "role-mismatch";
      this.status = "rejected";
      this.emit();
      return;
    }
    this.credential = response.credential;
    this.seat = response.seat;
    this.status = "waiting";
    await this.persistRecovery();
    if (this.recoveryNavigation === "client") {
      replaceWithClientRecoveryUrl(
        globalThis.location,
        this.binding,
        this.role,
        this.slotId,
      );
    }
    this.emit();
    await this.refresh();
  }

  downloadPublicHistory(): Promise<PublicTableHistory> {
    if (this.finalPublicHistory)
      return Promise.resolve(structuredClone(this.finalPublicHistory));
    if (this.role !== "player")
      return Promise.reject(new Error("A Player credential is required."));
    if (this.historyDownload) return this.historyDownload;
    this.historyDownload = this.fetchPublicHistory().finally(() => {
      this.historyDownload = undefined;
    });
    return this.historyDownload;
  }

  private async fetchPublicHistory(): Promise<PublicTableHistory> {
    let afterRevision = 0;
    let throughRevision: number | undefined;
    const frames: PublicHistoryFrame[] = [];
    let downloadedBytes = 1;
    for (let page = 0; page < 100000; page++) {
      const response = await this.exchangeCapabilityRequest({
        type: "history-page",
        clientInstanceId: this.clientInstanceId,
        credentialToken: this.credential?.token ?? "",
        afterRevision,
        ...(throughRevision !== undefined ? { throughRevision } : {}),
      });
      if (response.status !== "history-page")
        throw new Error(
          "The host could not provide this table's public history.",
        );
      if (
        response.history.tableId !== this.binding.tableId ||
        (throughRevision !== undefined &&
          response.throughRevision !== throughRevision)
      )
        throw new Error("The history snapshot changed during download.");
      throughRevision = response.throughRevision;
      // Joining pages removes one array delimiter per page. Count the final
      // combined array, rather than rejecting a valid near-limit export.
      downloadedBytes +=
        new TextEncoder().encode(JSON.stringify(response.history.frames))
          .length - 1;
      if (
        downloadedBytes > 20 * 1024 * 1024 ||
        frames.length + response.history.frames.length > 100000
      )
        throw new Error("This history exceeds the supported download size.");
      frames.push(...response.history.frames);
      if (!response.hasMore)
        return parsePublicTableHistory(
          JSON.stringify({ ...response.history, frames }),
        );
      const next = frames.at(-1)?.revision ?? 0;
      if (next <= afterRevision)
        throw new Error("The history download did not progress.");
      afterRevision = next;
    }
    throw new Error("The history download exceeded its supported size.");
  }

  private async saveFinalHistory(): Promise<void> {
    if (this.historyDownload) await this.historyDownload.catch(() => undefined);
    const history = await this.fetchPublicHistory();
    this.finalPublicHistory = history;
    try {
      await this.persistRecovery();
    } catch (error) {
      this.finalPublicHistory = undefined;
      throw error;
    }
    this.emit();
    await this.acknowledgeFinalHistory();
  }

  private async acknowledgeFinalHistory(): Promise<void> {
    if (!this.finalPublicHistory) return;
    const response = await this.exchangeCapabilityRequest({
      type: "history-saved",
      clientInstanceId: this.clientInstanceId,
      credentialToken: this.credential?.token ?? "",
      throughRevision: this.finalPublicHistory.frames.at(-1)?.revision ?? 0,
    });
    if (response.status !== "history-saved")
      throw new Error(
        "The record is saved here, but the host has not acknowledged delivery. Keep this page open while the host retries closing.",
      );
  }

  async performPlayer(action: PlayerAction): Promise<void> {
    if (this.role !== "player")
      throw new Error("A Player credential is required.");
    await this.capabilityRequest({
      action,
      clientInstanceId: this.clientInstanceId,
      credentialToken: this.credential?.token ?? "",
      type: "player-action",
    });
  }

  /**
   * Best-effort lifecycle signal for a Player page. The host treats a later
   * authenticated projection request as a reconnection, so a normal refresh
   * restores presence without giving the client a separate authority path.
   */
  async setPresence(
    connected: boolean,
    trigger: ConnectivityRecoveryTrigger = "manual",
  ): Promise<void> {
    if (this.finalPublicHistory) return;
    if (this.role !== "player" || !this.credential) return;
    if (connected) {
      this.presencePaused = false;
      await this.resumeConnectivity(trigger);
      return;
    }
    this.presencePaused = true;
    await this.performPlayer({ type: "disconnect" });
  }

  async performDealer(action: DealerAction): Promise<void> {
    if (this.role !== "table-control") {
      throw new Error("A Tablet Control credential is required.");
    }
    await this.capabilityRequest({
      action,
      clientInstanceId: this.clientInstanceId,
      credentialToken: this.credential?.token ?? "",
      type: "dealer-action",
    });
  }

  snapshot(): ClientRuntimeSnapshot {
    return {
      ...(this.finalPublicHistory ? { tableDissolved: true } : {}),
      connectionLabel: this.endpoint.connectionLabel(),
      cardStyle: this.cardStyle,
      ...(this.error ? { error: this.error } : {}),
      futureSittingOut: this.futureSittingOut,
      ...(this.rulesProfileId ? { rulesProfileId: this.rulesProfileId } : {}),
      ...(this.projection
        ? { projection: structuredClone(this.projection) }
        : {}),
      role: this.role,
      ...(this.seat ? { seat: { ...this.seat } } : {}),
      status: this.status,
      tableTheme: this.tableTheme,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async exchangeCapabilityRequest(
    payload: CapabilityRequestPayload,
  ): Promise<CapabilityResponsePayload> {
    if (!this.lease || !(await this.lease.isHeld())) {
      throw new Error("Exclusive control of this seat or display was lost.");
    }
    const credential = this.credential;
    if (!credential) throw new Error("The capability has not joined.");
    const requestId = makeId("request");
    const aad = `cap:${this.binding.tableId}:${credential.capabilityId}:${requestId}`;
    const sealed = await seal(credential.token, payload, aad);
    const message = await this.waitForResponse<CapabilityResponseMessage>(
      requestId,
      async () => {
        await this.endpoint.send(
          {
            ...sealed,
            capabilityId: credential.capabilityId,
            kind: "capability-request",
            requestId,
          } satisfies CapabilityRequestMessage,
          "host",
        );
      },
    );
    return unseal<CapabilityResponsePayload>(credential.token, message, aad);
  }

  private async capabilityRequest(
    payload: CapabilityRequestPayload,
  ): Promise<void> {
    const response = await this.exchangeCapabilityRequest(payload);
    if (
      response.status === "history-page" ||
      response.status === "history-saved"
    )
      return;
    this.resetHostLiveness();
    if (response.status === "rejected") {
      this.error = response.code;
      this.status = "rejected";
    } else {
      if (
        !this.airplanePairing &&
        response.status === "projection" &&
        !acceptsProjectionRevision(
          this.projection?.revision,
          response.projection.revision,
        )
      ) {
        return;
      }
      this.error = undefined;
      if (response.role !== this.role) {
        this.error = "role-mismatch";
        this.status = "rejected";
        this.emit();
        return;
      }
      if (response.relayRoutes) this.updateRelayRoutes(response.relayRoutes);
      if (response.status === "waiting") {
        this.rulesProfileId = response.rulesProfileId;
        this.seat = response.seat;
        this.tableTheme = response.tableTheme;
        this.cardStyle = response.cardStyle;
        this.futureSittingOut =
          response.role === "player"
            ? (response.futureSittingOut ??
              response.seat?.futureSittingOut ??
              false)
            : false;
        this.projection = undefined;
        this.status = "waiting";
      } else {
        this.rulesProfileId = response.projection.rulesProfileId;
        this.tableTheme = response.projection.tableTheme;
        this.cardStyle = response.projection.cardStyle;
        this.futureSittingOut =
          response.role === "player" ? response.futureSittingOut : false;
        this.projection = response.projection;
        this.status = "playing";
      }
    }
    if (this.credential) await this.persistRecovery();
    this.emit();
    if (
      response.status !== "rejected" &&
      response.tableClosing &&
      this.role === "player" &&
      !this.savingFinalHistory &&
      !this.finalPublicHistory
    ) {
      this.savingFinalHistory = true;
      void this.saveFinalHistory()
        .catch((error) => this.captureError(error))
        .finally(() => {
          this.savingFinalHistory = false;
        });
    }
  }

  private async livenessRequest(): Promise<void> {
    const credential = this.credential;
    if (!credential) throw new Error("The capability has not joined.");
    const requestId = makeId("liveness");
    const aad = `liveness:${this.binding.tableId}:${credential.capabilityId}:${requestId}`;
    const sealed = await seal(
      credential.token,
      {
        clientInstanceId: this.clientInstanceId,
        credentialToken: credential.token,
        type: "liveness",
      } satisfies LivenessRequestPayload,
      aad,
    );
    const message = await this.waitForResponse<LivenessResponseMessage>(
      requestId,
      async () => {
        await this.endpoint.send(
          {
            ...sealed,
            capabilityId: credential.capabilityId,
            kind: "liveness-request",
            requestId,
          } satisfies LivenessRequestMessage,
          "host",
        );
      },
    );
    const response = await unseal<LivenessResponsePayload>(
      credential.token,
      message,
      aad,
    );
    if (response.status === "rejected") {
      this.error = response.code;
      this.status = "rejected";
      this.emit();
      return;
    }
    if (response.role !== this.role) {
      throw new Error("The Trusted Host liveness response was invalid.");
    }
    this.resetHostLiveness();
  }

  private async observeAuthenticatedHostFrame(
    message: CapabilityResponseMessage | LivenessResponseMessage,
  ): Promise<void> {
    const credential = this.credential;
    if (!credential) return;
    const aadPrefix = message.kind === "liveness-response" ? "liveness" : "cap";
    const aad = `${aadPrefix}:${this.binding.tableId}:${credential.capabilityId}:${message.requestId}`;
    try {
      await unseal<unknown>(credential.token, message, aad);
    } catch {
      return;
    }
    this.resetHostLiveness();
  }

  private captureError(error: unknown): void {
    this.error =
      error instanceof Error ? error.message : "The table did not respond.";
    this.emit();
  }

  private resetHostLiveness(): void {
    const state = resetAuthenticatedLiveness();
    const wasUnavailable = this.hostUnavailable;
    const hadRouteError =
      this.routeRecoveryError !== undefined &&
      this.error === this.routeRecoveryError;
    this.routeRecoveryMisses = 0;
    this.routeRecoveryError = undefined;
    this.hostLivenessMisses = state.consecutiveMisses;
    this.hostUnavailable = state.unavailable;
    if (!wasUnavailable && !hadRouteError) return;
    this.error = undefined;
    this.emit();
  }

  private recordHostLivenessMiss(): boolean {
    const state = recordAuthenticatedLivenessMiss({
      consecutiveMisses: this.hostLivenessMisses,
      unavailable: this.hostUnavailable,
    });
    this.hostLivenessMisses = state.consecutiveMisses;
    this.hostUnavailable = state.unavailable;
    return state.unavailable;
  }

  private updateRelayRoutes(relayRoutes: RelayRouteConfiguration): void {
    this.relayRoutes = cloneRelayRoutes(relayRoutes);
    this.endpoint.updateRelayRoutes(this.relayRoutes);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private persistRecovery(): Promise<void> {
    if (!this.credential) return Promise.resolve();
    const commit = this.recoveryCommitTail.then(async () => {
      if (!this.credential) return;
      const nextRevision = this.recoveryRevision + 1;
      const result = await this.recoveryStore.commit(this.recoveryRevision, {
        revision: nextRevision,
        state: {
          binding: { ...this.binding },
          clientInstanceId: this.clientInstanceId,
          credential: { ...this.credential },
          privacyClass: "client-recovery-secret",
          ...(this.finalPublicHistory
            ? { finalPublicHistory: this.finalPublicHistory }
            : {}),
          ...(this.relayRoutes ? { relayRoutes: this.relayRoutes } : {}),
          role: this.role,
          schemaVersion: 1,
          ...(this.seat ? { seat: { ...this.seat } } : {}),
          slotId: this.slotId,
        },
      });
      if (result.status !== "committed") {
        throw new Error(`Client recovery commit failed: ${result.status}`);
      }
      this.recoveryRevision = nextRevision;
    });
    this.recoveryCommitTail = commit.catch(() => undefined);
    return commit;
  }

  private refresh(
    trigger: ConnectivityRecoveryTrigger = "automatic",
    requestedRevision = 0,
  ): Promise<void> {
    this.refreshRequestedRevision = Math.max(
      this.refreshRequestedRevision,
      requestedRevision,
    );
    if (this.refreshFlight) {
      if (trigger === "manual") this.refreshTrigger = "manual";
      return this.refreshFlight;
    }
    this.refreshTrigger = trigger;
    const operation = Promise.resolve()
      .then(async () => {
        let before: number;
        do {
          before = this.projection?.revision ?? -1;
          await this.refreshOnce();
        } while (
          this.status !== "rejected" &&
          (this.projection?.revision ?? -1) < this.refreshRequestedRevision &&
          (this.projection?.revision ?? -1) > before
        );
      })
      .finally(() => {
        if (this.refreshFlight === operation) this.refreshFlight = undefined;
      });
    this.refreshFlight = operation;
    return operation;
  }

  private async refreshOnce(): Promise<void> {
    if (this.finalPublicHistory || !this.credential) return;
    if (!this.airplanePairing) {
      try {
        await this.livenessRequest();
      } catch (error) {
        if (
          !this.recordHostLivenessMiss() &&
          this.refreshTrigger === "automatic"
        )
          return;
        throw error;
      }
      if (this.status === "rejected") return;
    }
    await this.capabilityRequest({
      clientInstanceId: this.clientInstanceId,
      credentialToken: this.credential.token,
      type: "projection",
    });
  }

  private waitForResponse<
    T extends
      JoinResponseMessage | CapabilityResponseMessage | LivenessResponseMessage,
  >(requestId: string, send: () => Promise<void>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("The Trusted Host did not respond."));
      }, requestTimeoutMs);
      this.pending.set(requestId, (message) => {
        globalThis.clearTimeout(timeout);
        this.pending.delete(requestId);
        resolve(message as T);
      });
      void send().catch((error: unknown) => {
        globalThis.clearTimeout(timeout);
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error("The route failed."));
      });
    });
  }
}

const capabilityRoles = new Set<CapabilityRole>([
  "player",
  "public-table",
  "tv",
  "table-control",
]);

function bindingFromParameters(
  parameters: URLSearchParams,
): PeerBinding | undefined {
  const tableId = parameters.get("table");
  const hostKey = parameters.get("host");
  const buildVersion = parameters.get("build");
  const protocol = Number(parameters.get("protocol"));
  if (
    !tableId ||
    !hostKey ||
    !buildVersion ||
    !Number.isInteger(protocol) ||
    protocol < 1
  ) {
    return undefined;
  }
  return { buildVersion, hostKey, protocolVersion: protocol, tableId };
}

function relayRoutesFromParameters(
  parameters: URLSearchParams,
): RelayRouteConfiguration | null | undefined {
  const parseRoute = (
    prefix: "cloud-relay" | "private-relay",
  ): RelayRuntimeConfig | null | undefined => {
    const url = parameters.get(`${prefix}-url`);
    const accessToken = parameters.get(`${prefix}-token`);
    const expiresAt = parameters.get(`${prefix}-expires`);
    const peerId = parameters.get(`${prefix}-peer`);
    if (!url && !accessToken && !expiresAt) return undefined;
    if (!url || !accessToken || accessToken.length > 512) return null;
    try {
      const relayUrl = new URL(url);
      if (!["ws:", "wss:"].includes(relayUrl.protocol)) return null;
    } catch {
      return null;
    }
    if (
      expiresAt &&
      (!Number.isSafeInteger(Number(expiresAt)) ||
        Number(expiresAt) <= Date.now())
    ) {
      return null;
    }
    return {
      accessToken,
      ...(expiresAt ? { expiresAt: Number(expiresAt) } : {}),
      ...(peerId ? { peerId } : {}),
      url,
    };
  };
  const cloudRelay = parseRoute("cloud-relay");
  const privateRelay = parseRoute("private-relay");
  if (cloudRelay === null || privateRelay === null) return null;
  if (cloudRelay || privateRelay) {
    return {
      ...(cloudRelay ? { cloudRelay } : {}),
      ...(privateRelay ? { privateRelay } : {}),
    };
  }

  // Parse the original single-relay invitation format for old links.
  const route = parameters.get("relay-route");
  const url = parameters.get("relay-url");
  const accessToken = parameters.get("relay-token");
  const expiresAt = parameters.get("relay-expires");
  const peerId = parameters.get("relay-peer");
  if (!route && !url && !accessToken && !expiresAt) return undefined;
  if (
    (route !== "private-relay" && route !== "cloud-relay") ||
    !url ||
    !accessToken ||
    accessToken.length > 512
  ) {
    return null;
  }
  try {
    const relayUrl = new URL(url);
    if (!["ws:", "wss:"].includes(relayUrl.protocol)) return null;
  } catch {
    return null;
  }
  if (
    expiresAt &&
    (!Number.isSafeInteger(Number(expiresAt)) ||
      Number(expiresAt) <= Date.now())
  ) {
    return null;
  }
  const relay: RelayRuntimeConfig = {
    accessToken,
    ...(expiresAt ? { expiresAt: Number(expiresAt) } : {}),
    ...(peerId ? { peerId } : {}),
    url,
  };
  return route === "private-relay"
    ? { privateRelay: relay }
    : { cloudRelay: relay };
}

export function parseInvitation(hash: string): InvitationDetails | undefined {
  const parameters = new URLSearchParams(hash.replace(/^#/, ""));
  const invitationToken = parameters.get("join");
  const role = parameters.get("role") as CapabilityRole | null;
  const binding = bindingFromParameters(parameters);
  const relayRoutes = relayRoutesFromParameters(parameters);
  if (
    !invitationToken ||
    !role ||
    !capabilityRoles.has(role) ||
    !binding ||
    relayRoutes === null
  ) {
    return undefined;
  }
  return {
    binding,
    invitationToken,
    ...(relayRoutes ? { relayRoutes } : {}),
    role,
  };
}

export function parseClientRecovery(
  hash: string,
): ClientRecoveryDetails | undefined {
  const parameters = new URLSearchParams(hash.replace(/^#/, ""));
  if (parameters.get("resume") !== "client") return undefined;
  const role = parameters.get("role") as CapabilityRole | null;
  const slotId = parameters.get("slot");
  const binding = bindingFromParameters(parameters);
  if (!role || !capabilityRoles.has(role) || !binding || !slotId) {
    return undefined;
  }
  return { binding, role, slotId };
}

export function parseHostRecovery(hash: string): string | undefined {
  const parameters = new URLSearchParams(hash.replace(/^#/, ""));
  if (parameters.get("resume") !== "host") return undefined;
  return parameters.get("table") ?? undefined;
}

export function parseHostPlayerRecovery(
  hash: string,
  binding: PeerBinding,
): ClientRecoveryDetails | undefined {
  const parameters = new URLSearchParams(hash.replace(/^#/, ""));
  const slotId = parameters.get("player-slot");
  if (
    parameters.get("resume") !== "host" ||
    parameters.get("table") !== binding.tableId ||
    !slotId
  ) {
    return undefined;
  }
  return { binding: { ...binding }, role: "player", slotId };
}

export function invitationUrl(
  location: Location,
  runtime: HostTableRuntime,
  invitation: Invitation,
): string {
  const url = new URL(location.href);
  url.search = "";
  const parameters = new URLSearchParams({
    build: runtime.binding.buildVersion,
    host: runtime.hostKey,
    join: invitation.token,
    protocol: String(runtime.binding.protocolVersion),
    role: invitation.role,
    table: runtime.tableId,
  });
  const relayRoutes = runtime.relayRoutesForInvitation(invitation);
  const cloudRelay = relayRoutes?.cloudRelay;
  const privateRelay = relayRoutes?.privateRelay;
  const routes = [
    ...(cloudRelay?.accessToken
      ? [{ relay: cloudRelay, route: "cloud-relay" as const }]
      : []),
    ...(privateRelay?.accessToken
      ? [{ relay: privateRelay, route: "private-relay" as const }]
      : []),
  ];
  const onlyRoute = routes[0];
  if (onlyRoute && routes.length === 1) {
    const { relay, route } = onlyRoute;
    if (!relay.accessToken) throw new Error("The relay ticket is unavailable.");
    parameters.set("relay-route", route);
    parameters.set("relay-url", relay.url);
    parameters.set("relay-token", relay.accessToken);
    if (relay.peerId) parameters.set("relay-peer", relay.peerId);
    if (relay.expiresAt)
      parameters.set("relay-expires", String(relay.expiresAt));
  } else {
    for (const { relay, route } of routes) {
      if (!relay.accessToken) continue;
      const prefix = route === "cloud-relay" ? "cloud-relay" : "private-relay";
      parameters.set(`${prefix}-url`, relay.url);
      parameters.set(`${prefix}-token`, relay.accessToken);
      if (relay.peerId) parameters.set(`${prefix}-peer`, relay.peerId);
      if (relay.expiresAt) {
        parameters.set(`${prefix}-expires`, String(relay.expiresAt));
      }
    }
  }
  url.hash = parameters.toString();
  return url.toString();
}

export function replaceWithHostRecoveryUrl(
  location: Location,
  tableId: string,
  playerSlotId?: string,
): void {
  const url = new URL(location.href);
  url.search = "";
  const parameters = new URLSearchParams({ resume: "host", table: tableId });
  if (playerSlotId) parameters.set("player-slot", playerSlotId);
  url.hash = parameters.toString();
  globalThis.history.replaceState(null, "", url);
}

function replaceWithClientRecoveryUrl(
  location: Location,
  binding: PeerBinding,
  role: CapabilityRole,
  slotId: string,
): void {
  const url = new URL(location.href);
  url.search = "";
  url.hash = new URLSearchParams({
    build: binding.buildVersion,
    host: binding.hostKey,
    protocol: String(binding.protocolVersion),
    resume: "client",
    role,
    slot: slotId,
    table: binding.tableId,
  }).toString();
  globalThis.history.replaceState(null, "", url);
}
