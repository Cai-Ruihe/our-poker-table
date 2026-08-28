export interface HandIdGenerator {
  next(): string;
}

export interface HandIdGeneratorOptions {
  readonly now?: () => number;
  readonly randomBytes?: (length: number) => Uint8Array;
}

function secureRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function byteHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function formatUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map(byteHex).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createHandIdGenerator(
  options: HandIdGeneratorOptions = {},
): HandIdGenerator {
  const now = options.now ?? Date.now;
  const randomBytes = options.randomBytes ?? secureRandomBytes;
  let lastTimestamp = -1;
  let sequence = 0;
  const issued = new Set<string>();

  function next(): string {
    const random = randomBytes(10);
    if (random.length !== 10)
      throw new Error("Hand ID randomness must contain exactly 10 bytes.");
    let timestamp = Math.max(0, Math.floor(now()), lastTimestamp);
    if (timestamp > 0xffffffffffff) {
      throw new Error("The clock exceeds the UUIDv7 timestamp range.");
    }
    if (timestamp > lastTimestamp) {
      sequence = ((((random[0] ?? 0) << 8) | (random[1] ?? 0)) & 0x0fff) >>> 0;
    } else {
      sequence += 1;
      if (sequence > 0x0fff) {
        timestamp = lastTimestamp + 1;
        sequence =
          ((((random[0] ?? 0) << 8) | (random[1] ?? 0)) & 0x0fff) >>> 0;
      }
    }
    lastTimestamp = timestamp;
    const bytes = new Uint8Array(16);
    let remaining = BigInt(timestamp);
    for (let index = 5; index >= 0; index -= 1) {
      bytes[index] = Number(remaining & 0xffn);
      remaining >>= 8n;
    }
    bytes[6] = 0x70 | ((sequence >> 8) & 0x0f);
    bytes[7] = sequence & 0xff;
    bytes[8] = 0x80 | ((random[2] ?? 0) & 0x3f);
    for (let index = 9; index < 16; index += 1) {
      bytes[index] = random[index - 6] ?? 0;
    }
    const id = formatUuid(bytes);
    if (issued.has(id)) throw new Error("A duplicate Hand ID was rejected.");
    issued.add(id);
    return id;
  }

  return { next };
}

export type DiagnosticEventType =
  "command" | "lifecycle" | "recovery" | "route" | "support-export";
export type DiagnosticRoute =
  "local" | "direct" | "private-relay" | "cloud-relay" | "airplane";
export type DiagnosticResult = "accepted" | "rejected" | "error";
export type DiagnosticCapabilityScope =
  "trusted-host" | "player" | "public-table" | "tv" | "table-control";
/** Safe command label: command arguments, cards, names, seat IDs and secrets are excluded. */
export type DiagnosticCommandKind =
  | "CreateTable"
  | "StartHand"
  | "RevealStreet"
  | "FoldCards"
  | "RetractFold"
  | "FinalizeFold"
  | "ShowCards"
  | "MuckCards"
  | "EndHand"
  | "RelocateDealer"
  | "VoidHand"
  | "RegisterSeat"
  | "UnregisterSeat"
  | "SetSeatParticipation"
  | "RecordCorrection"
  | "SubmitBettingAction"
  | "PrepareSettlement"
  | "ConfirmSettlement"
  | "SetTableTheme"
  | "SetCardStyle";
export type DiagnosticHandPhase =
  | "lobby"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "settlement-pending"
  | "complete";

export interface DiagnosticEventInput {
  readonly actorPseudonym: string;
  readonly buildVersion: string;
  readonly capabilityScope: DiagnosticCapabilityScope;
  readonly commandId?: string;
  readonly commandKind?: DiagnosticCommandKind;
  readonly durationMs?: number;
  readonly errorClass?: string;
  readonly eventType: DiagnosticEventType;
  readonly handId?: string;
  readonly handPhase?: DiagnosticHandPhase;
  readonly protocolVersion: number;
  readonly result: DiagnosticResult;
  readonly revision?: number;
  readonly route: DiagnosticRoute;
  readonly tablePseudonym: string;
}

export interface DiagnosticEntry extends DiagnosticEventInput {
  readonly timestamp: number;
}

export interface DiagnosticLog {
  export(): string;
  pseudonymize(value: string): Promise<string>;
  record(
    event: DiagnosticEventInput,
  ):
    | { readonly status: "accepted" }
    | { readonly reason: "invalid-event"; readonly status: "dropped" };
}

export interface DiagnosticLogOptions {
  readonly maxEntries?: number;
  readonly now?: () => number;
  readonly pseudonymSalt: string;
  readonly retentionMs?: number;
}

const allowedKeys = new Set<keyof DiagnosticEventInput>([
  "actorPseudonym",
  "buildVersion",
  "capabilityScope",
  "commandId",
  "commandKind",
  "durationMs",
  "errorClass",
  "eventType",
  "handId",
  "handPhase",
  "protocolVersion",
  "result",
  "revision",
  "route",
  "tablePseudonym",
]);

const eventTypes = new Set<DiagnosticEventType>([
  "command",
  "lifecycle",
  "recovery",
  "route",
  "support-export",
]);
const routes = new Set<DiagnosticRoute>([
  "local",
  "direct",
  "private-relay",
  "cloud-relay",
  "airplane",
]);
const results = new Set<DiagnosticResult>(["accepted", "rejected", "error"]);
const scopes = new Set<DiagnosticCapabilityScope>([
  "trusted-host",
  "player",
  "public-table",
  "tv",
  "table-control",
]);
const commandKinds = new Set<DiagnosticCommandKind>([
  "CreateTable",
  "StartHand",
  "RevealStreet",
  "FoldCards",
  "RetractFold",
  "FinalizeFold",
  "ShowCards",
  "MuckCards",
  "EndHand",
  "RelocateDealer",
  "VoidHand",
  "RegisterSeat",
  "UnregisterSeat",
  "SetSeatParticipation",
  "RecordCorrection",
  "SubmitBettingAction",
  "PrepareSettlement",
  "ConfirmSettlement",
  "SetTableTheme",
  "SetCardStyle",
]);
const handPhases = new Set<DiagnosticHandPhase>([
  "lobby",
  "preflop",
  "flop",
  "turn",
  "river",
  "showdown",
  "settlement-pending",
  "complete",
]);

function boundedString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maximum
  );
}

function validEvent(event: DiagnosticEventInput): boolean {
  if (
    Object.keys(event).some(
      (key) => !allowedKeys.has(key as keyof DiagnosticEventInput),
    )
  ) {
    return false;
  }
  return (
    boundedString(event.actorPseudonym, 64) &&
    boundedString(event.tablePseudonym, 64) &&
    boundedString(event.buildVersion, 64) &&
    eventTypes.has(event.eventType) &&
    routes.has(event.route) &&
    results.has(event.result) &&
    scopes.has(event.capabilityScope) &&
    Number.isInteger(event.protocolVersion) &&
    event.protocolVersion >= 1 &&
    (event.revision === undefined ||
      (Number.isInteger(event.revision) && event.revision >= 0)) &&
    (event.durationMs === undefined ||
      (Number.isFinite(event.durationMs) &&
        event.durationMs >= 0 &&
        event.durationMs <= 3_600_000)) &&
    (event.commandId === undefined || boundedString(event.commandId, 96)) &&
    (event.commandKind === undefined || commandKinds.has(event.commandKind)) &&
    (event.errorClass === undefined || boundedString(event.errorClass, 64)) &&
    (event.handId === undefined || boundedString(event.handId, 64)) &&
    (event.handPhase === undefined || handPhases.has(event.handPhase))
  );
}

function bytesToBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export function createDiagnosticLog(
  options: DiagnosticLogOptions,
): DiagnosticLog {
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? 500;
  const retentionMs = options.retentionMs ?? 30 * 24 * 60 * 60 * 1_000;
  const entries: DiagnosticEntry[] = [];

  function prune(): void {
    const cutoff = now() - retentionMs;
    while (entries[0] && entries[0].timestamp < cutoff) entries.shift();
    while (entries.length > maxEntries) entries.shift();
  }

  return {
    export() {
      prune();
      return JSON.stringify({
        entries: entries.map((entry) => ({ ...entry })),
        exportedAt: now(),
        privacyClass: "redacted-diagnostics",
        schemaVersion: 1,
      });
    },
    async pseudonymize(value) {
      const encoded = new TextEncoder().encode(
        `${options.pseudonymSalt}\u0000${value}`,
      );
      const digest = new Uint8Array(
        await globalThis.crypto.subtle.digest(
          "SHA-256",
          bytesToBuffer(encoded),
        ),
      );
      return [...digest.slice(0, 8)].map(byteHex).join("");
    },
    record(event) {
      if (!validEvent(event)) {
        return { reason: "invalid-event", status: "dropped" };
      }
      prune();
      entries.push({ ...event, timestamp: now() });
      prune();
      return { status: "accepted" };
    },
  };
}
