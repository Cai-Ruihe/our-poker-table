import type {
  DurableObjectStateLike,
  HibernatableWebSocketLike,
  RelayEnv,
  SqlRow,
} from "./cloudflare-types.js";
import {
  decryptTicket,
  encryptTicket,
  randomToken,
  sha256Base64Url,
} from "./crypto.js";
import {
  bindingMatches,
  boundedString,
  type DisplayPairingEnvelope,
  DISPLAY_PAIRING_RATE_WINDOW_MS,
  MAX_DISPLAY_PAIRINGS,
  MAX_DISPLAY_PAIRINGS_PER_CLIENT,
  MAX_DISPLAY_PAIRING_WRITES_PER_CLIENT,
  MAX_FRAME_BYTES,
  MAX_REQUEST_BYTES,
  RELAY_DEDUPLICATION_WINDOW_MS,
  parseSessionTtl,
  peerKey,
  type OpaqueEnvelope,
  type RelayRegistration,
  validDisplayPairingEnvelope,
  validDisplayPairingRequest,
  validEnvelope,
  validRegistration,
} from "./relay-contract.js";

interface SessionRow extends SqlRow {
  readonly ciphertext: unknown;
  readonly expires_at: unknown;
  readonly host_key: unknown;
  readonly iv: unknown;
  readonly peer_id: unknown;
  readonly protocol_version: unknown;
  readonly table_id: unknown;
  readonly token_hash: unknown;
}

interface PairingRow extends SqlRow {
  readonly ciphertext: unknown;
  readonly expires_at: unknown;
  readonly iv: unknown;
}

interface PairingCapabilityRow extends SqlRow {
  readonly ciphertext: unknown;
  readonly expires_at: unknown;
  readonly iv: unknown;
  readonly peer_id: unknown;
  readonly token_hash: unknown;
}

interface ActivePeer {
  readonly clientId: string;
  readonly registration: Omit<RelayRegistration, "accessToken">;
  readonly socket: HibernatableWebSocketLike;
}

interface WebSocketPairLike {
  readonly 0: WebSocket;
  readonly 1: HibernatableWebSocketLike;
}

interface SocketAttachment {
  readonly clientId: string;
  readonly registered: boolean;
  readonly registration?: Omit<RelayRegistration, "accessToken">;
  readonly registrationInFlight?: boolean;
}

type JsonObject = Record<string, unknown>;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,
    host_key TEXT NOT NULL,
    peer_id TEXT NOT NULL,
    table_id TEXT NOT NULL,
    protocol_version INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS display_pairings (
    request_id TEXT PRIMARY KEY,
    ciphertext TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    iv TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS display_pairing_capabilities (
    token_hash TEXT PRIMARY KEY,
    ciphertext TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    host_key TEXT NOT NULL,
    peer_id TEXT NOT NULL,
    table_id TEXT NOT NULL,
    protocol_version INTEGER NOT NULL,
    iv TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS display_pairing_capabilities_binding
    ON display_pairing_capabilities(host_key, table_id, protocol_version, peer_id);
  CREATE TABLE IF NOT EXISTS display_pairing_owners (
    request_id TEXT PRIMARY KEY,
    client_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS display_pairing_write_limits (
    client_hash TEXT PRIMARY KEY,
    window_started_at INTEGER NOT NULL,
    write_count INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS relay_receipts (
    table_id TEXT NOT NULL,
    host_key TEXT NOT NULL,
    protocol_version INTEGER NOT NULL,
    sender_peer_id TEXT NOT NULL,
    recipient_peer_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    frame_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (
      table_id,
      host_key,
      protocol_version,
      sender_peer_id,
      recipient_peer_id,
      message_id
    )
  );
`;

function ensureSessionSchema(state: DurableObjectStateLike): void {
  const columns = state.storage.sql
    .exec<{ readonly name: unknown }>("PRAGMA table_info(sessions)")
    .toArray();
  if (!columns.some((column) => column.name === "peer_id")) {
    // A table-only ticket cannot be safely rebound to a peer. Invalidate old
    // tickets while upgrading the Durable Object schema.
    state.storage.sql.exec("DROP INDEX IF EXISTS sessions_binding");
    state.storage.sql.exec(
      "ALTER TABLE sessions ADD COLUMN peer_id TEXT NOT NULL DEFAULT ''",
    );
    state.storage.sql.exec("DELETE FROM sessions");
  }
  state.storage.sql.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS sessions_binding ON sessions(host_key, table_id, protocol_version, peer_id)",
  );
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const maximum = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < maximum; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function jsonResponse(
  value: unknown,
  status: number,
  allowedOrigin: string,
): Response {
  return withCors(
    new Response(JSON.stringify(value), {
      headers: { "content-type": "application/json" },
      status,
    }),
    allowedOrigin,
  );
}

function withCors(response: Response, allowedOrigin: string): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", allowedOrigin);
  headers.set("access-control-allow-headers", "authorization, content-type");
  headers.set("access-control-allow-methods", "GET, POST, PUT, OPTIONS");
  headers.set("vary", "Origin");
  headers.set("cache-control", "no-store");
  return new Response(response.body, { headers, status: response.status });
}

function originNotAllowed(): Response {
  return new Response("Origin not allowed", {
    headers: { "cache-control": "no-store" },
    status: 403,
  });
}

function configuredOrigin(env: RelayEnv): string | undefined {
  const value = env.RELAY_ALLOWED_ORIGIN?.trim();
  if (!value) return undefined;
  try {
    const origin = new URL(value);
    return origin.protocol === "https:" && origin.origin === value
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function methodNotAllowed(allowedOrigin: string): Response {
  return jsonResponse({ code: "method-not-allowed" }, 405, allowedOrigin);
}

function invalidEnvelope(allowedOrigin: string): Response {
  return jsonResponse({ code: "invalid-envelope" }, 400, allowedOrigin);
}

function bindingMismatch(allowedOrigin: string): Response {
  return jsonResponse({ code: "binding-mismatch" }, 400, allowedOrigin);
}

function pairingCapabilityRequired(
  request: Request,
  allowedOrigin: string,
): Response {
  return jsonResponse(
    {
      code: bearerToken(request)
        ? "pairing-capability-invalid"
        : "pairing-capability-required",
    },
    bearerToken(request) ? 403 : 401,
    allowedOrigin,
  );
}

function pairingCapacityExceeded(
  code: "capacity" | "client-capacity" | "rate-limited",
  allowedOrigin: string,
): Response {
  return jsonResponse({ code }, 429, allowedOrigin);
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.body) return JSON.parse(await request.text());
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_REQUEST_BYTES) throw new Error("request body too large");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function bearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return undefined;
  const token = authorization.slice("Bearer ".length);
  return token.length > 0 ? token : undefined;
}

function tableBinding(value: unknown):
  | {
      readonly hostKey: string;
      readonly peerId: string;
      readonly protocolVersion: number;
      readonly tableId: string;
    }
  | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as JsonObject;
  if (
    typeof candidate.hostKey !== "string" ||
    typeof candidate.peerId !== "string" ||
    typeof candidate.tableId !== "string" ||
    typeof candidate.protocolVersion !== "number"
  ) {
    return undefined;
  }
  const binding = {
    hostKey: candidate.hostKey,
    peerId: candidate.peerId,
    protocolVersion: candidate.protocolVersion,
    tableId: candidate.tableId,
  };
  return boundedString(binding.hostKey, 512) &&
    boundedString(binding.peerId, 128) &&
    boundedString(binding.tableId, 128) &&
    Number.isInteger(binding.protocolVersion) &&
    binding.protocolVersion >= 1
    ? binding
    : undefined;
}

function rowString(row: SqlRow, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" ? value : undefined;
}

function rowNumber(row: SqlRow, key: string): number | undefined {
  const value = row[key];
  return typeof value === "number" ? value : undefined;
}

export class RelayHub {
  private readonly state: DurableObjectStateLike;

  private readonly env: RelayEnv;

  private readonly peersByClient = new Map<string, ActivePeer>();

  private readonly clientsByPeer = new Map<string, ActivePeer>();

  public constructor(state: DurableObjectStateLike, env: RelayEnv) {
    this.state = state;
    this.env = env;
    this.state.storage.sql.exec(SCHEMA);
    ensureSessionSchema(this.state);
    this.rehydrateWebSocketIndex();
  }

  public async fetch(request: Request): Promise<Response> {
    const allowedOrigin = configuredOrigin(this.env);
    if (!allowedOrigin) {
      return new Response("Relay origin is not configured", {
        headers: { "cache-control": "no-store" },
        status: 503,
      });
    }
    if (request.headers.get("origin") !== allowedOrigin) {
      return originNotAllowed();
    }
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), allowedOrigin);
    }
    const upgrade = request.headers.get("upgrade");
    if (request.method === "GET" && upgrade?.toLowerCase() === "websocket") {
      return this.acceptWebSocket();
    }
    const pathname = new URL(request.url).pathname;
    if (pathname === "/v1/table-sessions") {
      return this.handleTableSession(request, allowedOrigin);
    }
    const pairingMatch = /^\/v1\/display-pairings\/([^/]+)$/u.exec(pathname);
    if (pairingMatch?.[1]) {
      return this.handleDisplayPairing(request, pairingMatch[1], allowedOrigin);
    }
    return withCors(new Response(null, { status: 404 }), allowedOrigin);
  }

  /**
   * Hibernation reconstructs the Durable Object instance while keeping the
   * accepted WebSockets alive. Rebuild the in-memory lookup indexes from the
   * serialized attachment on every construction so relay continues after an
   * eviction without trusting stale process memory.
   */
  private restoreWebSocketIndex(): void {
    for (const socket of this.state.getWebSockets()) {
      const attachment = this.socketAttachment(socket);
      if (!attachment?.registered || !attachment.registration) continue;
      if (
        !validRegistration({
          ...attachment.registration,
          accessToken: "restored",
        })
      ) {
        socket.close(1008, "invalid registration");
        continue;
      }
      const active: ActivePeer = {
        clientId: attachment.clientId,
        registration: attachment.registration,
        socket,
      };
      const key = peerKey(active.registration);
      if (
        this.peersByClient.has(active.clientId) ||
        this.clientsByPeer.has(key)
      ) {
        // Preserve the one-active-peer policy even if the runtime hands us a
        // duplicated hibernated connection during reconstruction.
        socket.close(1008, "peer conflict");
        continue;
      }
      this.peersByClient.set(active.clientId, active);
      this.clientsByPeer.set(key, active);
    }
  }

  /**
   * The in-memory indexes are only an optimization. Durable Object
   * hibernation can evict this instance while keeping the sockets alive, so
   * rebuild both indexes from the socket attachments before using them after
   * an eviction (or if a callback arrives before constructor state is warm).
   */
  private rehydrateWebSocketIndex(): void {
    this.peersByClient.clear();
    this.clientsByPeer.clear();
    this.restoreWebSocketIndex();
  }

  private socketAttachment(
    socket: HibernatableWebSocketLike,
  ): SocketAttachment | undefined {
    const value = socket.deserializeAttachment();
    if (!value || typeof value !== "object") return undefined;
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.clientId !== "string" ||
      typeof candidate.registered !== "boolean"
    ) {
      return undefined;
    }
    const registration =
      candidate.registration && typeof candidate.registration === "object"
        ? (candidate.registration as SocketAttachment["registration"])
        : undefined;
    const registrationInFlight = candidate.registrationInFlight === true;
    return {
      clientId: candidate.clientId,
      registered: candidate.registered,
      ...(registration ? { registration } : {}),
      ...(registrationInFlight ? { registrationInFlight: true } : {}),
    };
  }

  private sessionTtlMs(): number {
    return parseSessionTtl(this.env.RELAY_SESSION_TTL_MS);
  }

  private sweep(currentTime: number): void {
    this.state.storage.sql.exec(
      "DELETE FROM sessions WHERE expires_at <= ?",
      currentTime,
    );
    this.state.storage.sql.exec(
      "DELETE FROM display_pairings WHERE expires_at <= ?",
      currentTime,
    );
    this.state.storage.sql.exec(
      "DELETE FROM display_pairing_capabilities WHERE expires_at <= ?",
      currentTime,
    );
    this.state.storage.sql.exec(
      `DELETE FROM display_pairing_owners
        WHERE request_id NOT IN (SELECT request_id FROM display_pairings)`,
    );
    this.state.storage.sql.exec(
      "DELETE FROM relay_receipts WHERE expires_at <= ?",
      currentTime,
    );
  }

  private sessionForBinding(binding: {
    readonly hostKey: string;
    readonly peerId: string;
    readonly protocolVersion: number;
    readonly tableId: string;
  }): SessionRow | undefined {
    return this.state.storage.sql
      .exec<SessionRow>(
        `SELECT token_hash, ciphertext, iv, host_key, peer_id, table_id,
                protocol_version, expires_at
           FROM sessions
          WHERE host_key = ? AND peer_id = ? AND table_id = ? AND protocol_version = ?
          LIMIT 1`,
        binding.hostKey,
        binding.peerId,
        binding.tableId,
        binding.protocolVersion,
      )
      .toArray()[0];
  }

  private async pairingCapabilityForBinding(
    binding: {
      readonly hostKey: string;
      readonly peerId: string;
      readonly protocolVersion: number;
      readonly tableId: string;
    },
    expiresAt: number,
  ): Promise<string> {
    const existing = this.state.storage.sql
      .exec<PairingCapabilityRow>(
        `SELECT token_hash, ciphertext, expires_at, iv
           FROM display_pairing_capabilities
          WHERE host_key = ? AND peer_id = ? AND table_id = ? AND protocol_version = ?
          LIMIT 1`,
        binding.hostKey,
        binding.peerId,
        binding.tableId,
        binding.protocolVersion,
      )
      .toArray()[0];
    if (existing) {
      const tokenHash = rowString(existing, "token_hash");
      const ciphertext = rowString(existing, "ciphertext");
      const iv = rowString(existing, "iv");
      const currentExpiry = rowNumber(existing, "expires_at");
      if (tokenHash && ciphertext && iv && currentExpiry !== undefined) {
        const capability = await decryptTicket(this.env.RELAY_OPERATOR_TOKEN, {
          ciphertext,
          iv,
        });
        if (capability && currentExpiry > Date.now()) return capability;
        this.state.storage.sql.exec(
          "DELETE FROM display_pairing_capabilities WHERE token_hash = ?",
          tokenHash,
        );
      }
    }
    const capability = randomToken();
    const tokenHash = await sha256Base64Url(capability);
    const encrypted = await encryptTicket(
      this.env.RELAY_OPERATOR_TOKEN,
      capability,
    );
    this.state.storage.sql.exec(
      `INSERT INTO display_pairing_capabilities
         (token_hash, ciphertext, expires_at, host_key, peer_id, table_id,
          protocol_version, iv)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(host_key, table_id, protocol_version, peer_id) DO UPDATE SET
         token_hash = excluded.token_hash,
         ciphertext = excluded.ciphertext,
         expires_at = excluded.expires_at,
         iv = excluded.iv`,
      tokenHash,
      encrypted.ciphertext,
      expiresAt,
      binding.hostKey,
      binding.peerId,
      binding.tableId,
      binding.protocolVersion,
      encrypted.iv,
    );
    return capability;
  }

  private async pairingClientHash(
    capability: string | undefined,
    currentTime: number,
  ): Promise<string | undefined> {
    if (!capability || !boundedString(capability, 512)) return undefined;
    const tokenHash = await sha256Base64Url(capability);
    const row = this.state.storage.sql
      .exec<PairingCapabilityRow>(
        `SELECT token_hash, ciphertext, expires_at, iv
           FROM display_pairing_capabilities
          WHERE token_hash = ?
          LIMIT 1`,
        tokenHash,
      )
      .toArray()[0];
    const expiresAt = row ? rowNumber(row, "expires_at") : undefined;
    if (!row || expiresAt === undefined || expiresAt <= currentTime) {
      return undefined;
    }
    return tokenHash;
  }

  private async handleTableSession(
    request: Request,
    allowedOrigin: string,
  ): Promise<Response> {
    if (request.method !== "POST") return methodNotAllowed(allowedOrigin);
    const suppliedToken = bearerToken(request);
    if (
      !suppliedToken ||
      !boundedString(this.env.RELAY_OPERATOR_TOKEN, 512) ||
      !safeEqual(suppliedToken, this.env.RELAY_OPERATOR_TOKEN)
    ) {
      return jsonResponse({ code: "access-denied" }, 401, allowedOrigin);
    }
    let binding: ReturnType<typeof tableBinding>;
    try {
      binding = tableBinding(await readJson(request));
    } catch {
      return bindingMismatch(allowedOrigin);
    }
    if (!binding) return bindingMismatch(allowedOrigin);
    const currentTime = Date.now();
    this.sweep(currentTime);
    const expiresAt = currentTime + this.sessionTtlMs();
    const existing = this.sessionForBinding(binding);
    if (existing) {
      const tokenHash = rowString(existing, "token_hash");
      const ciphertext = rowString(existing, "ciphertext");
      const iv = rowString(existing, "iv");
      if (tokenHash && ciphertext && iv) {
        const token = await decryptTicket(this.env.RELAY_OPERATOR_TOKEN, {
          ciphertext,
          iv,
        });
        if (token) {
          const pairingWriteCapability = await this.pairingCapabilityForBinding(
            binding,
            expiresAt,
          );
          this.state.storage.sql.exec(
            "UPDATE sessions SET expires_at = ? WHERE token_hash = ?",
            expiresAt,
            tokenHash,
          );
          return jsonResponse(
            {
              accessToken: token,
              expiresAt,
              pairingWriteCapability,
              peerId: binding.peerId,
            },
            201,
            allowedOrigin,
          );
        }
        this.state.storage.sql.exec(
          "DELETE FROM sessions WHERE token_hash = ?",
          tokenHash,
        );
      }
    }
    const accessToken = randomToken();
    const tokenHash = await sha256Base64Url(accessToken);
    const encrypted = await encryptTicket(
      this.env.RELAY_OPERATOR_TOKEN,
      accessToken,
    );
    this.state.storage.sql.exec(
      `INSERT INTO sessions
         (token_hash, ciphertext, iv, host_key, peer_id, table_id, protocol_version, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(host_key, table_id, protocol_version, peer_id) DO UPDATE SET
         token_hash = excluded.token_hash,
         ciphertext = excluded.ciphertext,
         iv = excluded.iv,
         expires_at = excluded.expires_at`,
      tokenHash,
      encrypted.ciphertext,
      encrypted.iv,
      binding.hostKey,
      binding.peerId,
      binding.tableId,
      binding.protocolVersion,
      expiresAt,
    );
    const pairingWriteCapability = await this.pairingCapabilityForBinding(
      binding,
      expiresAt,
    );
    return jsonResponse(
      {
        accessToken,
        expiresAt,
        pairingWriteCapability,
        peerId: binding.peerId,
      },
      201,
      allowedOrigin,
    );
  }

  private async handleDisplayPairing(
    request: Request,
    requestId: string,
    allowedOrigin: string,
  ): Promise<Response> {
    let decodedRequestId: string;
    try {
      decodedRequestId = decodeURIComponent(requestId);
    } catch {
      return jsonResponse({ code: "invalid-request" }, 400, allowedOrigin);
    }
    const currentTime = Date.now();
    this.sweep(currentTime);
    if (request.method === "GET") {
      if (!validDisplayPairingRequest(decodedRequestId)) {
        return withCors(new Response(null, { status: 204 }), allowedOrigin);
      }
      const row = this.state.storage.sql
        .exec<PairingRow>(
          "SELECT ciphertext, expires_at, iv FROM display_pairings WHERE request_id = ?",
          decodedRequestId,
        )
        .toArray()[0];
      if (!row)
        return withCors(new Response(null, { status: 204 }), allowedOrigin);
      const ciphertext = rowString(row, "ciphertext");
      const iv = rowString(row, "iv");
      const expiresAt = rowNumber(row, "expires_at");
      this.state.storage.sql.exec(
        "DELETE FROM display_pairings WHERE request_id = ?",
        decodedRequestId,
      );
      if (!ciphertext || !iv || expiresAt === undefined) {
        return withCors(new Response(null, { status: 204 }), allowedOrigin);
      }
      return jsonResponse({ ciphertext, expiresAt, iv }, 200, allowedOrigin);
    }
    if (request.method !== "PUT") return methodNotAllowed(allowedOrigin);
    if (!validDisplayPairingRequest(decodedRequestId)) {
      return jsonResponse({ code: "invalid-request" }, 400, allowedOrigin);
    }
    const clientHash = await this.pairingClientHash(
      bearerToken(request),
      currentTime,
    );
    if (!clientHash) return pairingCapabilityRequired(request, allowedOrigin);
    let candidate: unknown;
    try {
      candidate = await readJson(request);
    } catch {
      return invalidEnvelope(allowedOrigin);
    }
    if (!candidate || typeof candidate !== "object") {
      return invalidEnvelope(allowedOrigin);
    }
    const value = candidate as JsonObject;
    const envelope: DisplayPairingEnvelope = {
      ciphertext: typeof value.ciphertext === "string" ? value.ciphertext : "",
      expiresAt: typeof value.expiresAt === "number" ? value.expiresAt : 0,
      iv: typeof value.iv === "string" ? value.iv : "",
    };
    if (!validDisplayPairingEnvelope(envelope, currentTime)) {
      return jsonResponse(
        {
          code:
            envelope.expiresAt <= currentTime ? "expired" : "invalid-envelope",
        },
        400,
        allowedOrigin,
      );
    }
    const existing = this.state.storage.sql
      .exec<{ readonly request_id: unknown }>(
        "SELECT request_id FROM display_pairings WHERE request_id = ?",
        decodedRequestId,
      )
      .toArray()[0];
    const owner = this.state.storage.sql
      .exec<{ readonly client_hash: unknown }>(
        "SELECT client_hash FROM display_pairing_owners WHERE request_id = ?",
        decodedRequestId,
      )
      .toArray()[0];
    const ownerHash = owner ? rowString(owner, "client_hash") : undefined;
    if (existing && ownerHash !== clientHash) {
      // A request can be refreshed by the host that created it, but a second
      // valid table capability must not overwrite another host's pairing
      // response merely by guessing the request id.
      return jsonResponse(
        { code: "pairing-owner-mismatch" },
        403,
        allowedOrigin,
      );
    }
    if (!existing) {
      const count = this.state.storage.sql
        .exec<{ readonly count: unknown }>(
          "SELECT COUNT(*) AS count FROM display_pairings",
        )
        .toArray()[0];
      if (
        typeof count?.count === "number" &&
        count.count >= MAX_DISPLAY_PAIRINGS
      ) {
        return pairingCapacityExceeded("capacity", allowedOrigin);
      }
      const ownedCount = this.state.storage.sql
        .exec<{ readonly count: unknown }>(
          "SELECT COUNT(*) AS count FROM display_pairing_owners WHERE client_hash = ?",
          clientHash,
        )
        .toArray()[0];
      if (
        typeof ownedCount?.count === "number" &&
        ownedCount.count >= MAX_DISPLAY_PAIRINGS_PER_CLIENT
      ) {
        return pairingCapacityExceeded("client-capacity", allowedOrigin);
      }
    }
    const limit = this.state.storage.sql
      .exec<{
        readonly window_started_at: unknown;
        readonly write_count: unknown;
      }>(
        `SELECT window_started_at, write_count
           FROM display_pairing_write_limits
          WHERE client_hash = ?`,
        clientHash,
      )
      .toArray()[0];
    const windowStartedAt = limit
      ? rowNumber(limit, "window_started_at")
      : undefined;
    const writeCount = limit ? rowNumber(limit, "write_count") : undefined;
    const activeWindow =
      windowStartedAt !== undefined &&
      windowStartedAt + DISPLAY_PAIRING_RATE_WINDOW_MS > currentTime;
    if (
      activeWindow &&
      writeCount !== undefined &&
      writeCount >= MAX_DISPLAY_PAIRING_WRITES_PER_CLIENT
    ) {
      return pairingCapacityExceeded("rate-limited", allowedOrigin);
    }
    this.state.storage.sql.exec(
      `INSERT INTO display_pairing_write_limits
         (client_hash, window_started_at, write_count)
       VALUES (?, ?, ?)
       ON CONFLICT(client_hash) DO UPDATE SET
         window_started_at = excluded.window_started_at,
         write_count = excluded.write_count`,
      clientHash,
      activeWindow && windowStartedAt !== undefined
        ? windowStartedAt
        : currentTime,
      activeWindow && writeCount !== undefined ? writeCount + 1 : 1,
    );
    this.state.storage.sql.exec(
      `INSERT INTO display_pairings(request_id, ciphertext, expires_at, iv)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(request_id) DO UPDATE SET
         ciphertext = excluded.ciphertext,
         expires_at = excluded.expires_at,
         iv = excluded.iv`,
      decodedRequestId,
      envelope.ciphertext,
      envelope.expiresAt,
      envelope.iv,
    );
    this.state.storage.sql.exec(
      `INSERT INTO display_pairing_owners(request_id, client_hash)
       VALUES (?, ?)
       ON CONFLICT(request_id) DO UPDATE SET client_hash = excluded.client_hash`,
      decodedRequestId,
      clientHash,
    );
    return withCors(new Response(null, { status: 204 }), allowedOrigin);
  }

  private acceptWebSocket(): Response {
    const WebSocketPairConstructor = (
      globalThis as unknown as {
        readonly WebSocketPair: new () => WebSocketPairLike;
      }
    ).WebSocketPair;
    const pair = new WebSocketPairConstructor();
    const client = pair[0];
    const server = pair[1];
    const clientId = crypto.randomUUID();
    // Do not call server.accept() here. That opts into the standard WebSocket
    // event API and prevents Durable Object hibernation. The state API wires
    // messages and close/error events to the handlers below.
    this.state.acceptWebSocket(server, [clientId]);
    server.serializeAttachment({ clientId, registered: false });
    return new Response(null, {
      status: 101,
      headers: { "cache-control": "no-store" },
      webSocket: client,
    } as ResponseInit & { readonly webSocket: WebSocket });
  }

  public async webSocketMessage(
    socket: HibernatableWebSocketLike,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const attachment = this.socketAttachment(socket);
    if (!attachment) {
      socket.close(1008, "invalid connection");
      return;
    }
    if (attachment.registered && !this.peersByClient.has(attachment.clientId)) {
      this.rehydrateWebSocketIndex();
    }
    await this.handleSocketMessage(socket, attachment, message);
  }

  public webSocketClose(socket: HibernatableWebSocketLike): void {
    const attachment = this.socketAttachment(socket);
    if (attachment) this.unregister(attachment.clientId);
  }

  public webSocketError(socket: HibernatableWebSocketLike): void {
    const attachment = this.socketAttachment(socket);
    if (attachment) this.unregister(attachment.clientId);
  }

  private async handleSocketMessage(
    socket: HibernatableWebSocketLike,
    attachment: SocketAttachment,
    data: unknown,
  ): Promise<void> {
    if (typeof data !== "string") {
      socket.close(1003, "text frames only");
      return;
    }
    if (new TextEncoder().encode(data).byteLength > MAX_FRAME_BYTES) {
      socket.send(
        JSON.stringify({
          code: "oversized-frame",
          status: "rejected",
          type: "receipt",
        }),
      );
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      socket.close(1007, "invalid text frame");
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      socket.close(1008, "invalid registration");
      return;
    }
    if (!attachment.registered) {
      if (attachment.registrationInFlight) {
        socket.close(1008, "registration in progress");
        return;
      }
      const candidate = parsed as JsonObject;
      if (candidate.type !== "register") {
        socket.close(1008, "register first");
        return;
      }
      const registration = candidate as unknown as RelayRegistration;
      socket.serializeAttachment({
        clientId: attachment.clientId,
        registered: false,
        registrationInFlight: true,
      });
      let result: Awaited<ReturnType<RelayHub["register"]>>;
      try {
        result = await this.register(socket, attachment.clientId, registration);
      } catch {
        socket.close(1011, "relay registration failed");
        return;
      }
      if (result.status === "rejected") {
        socket.close(1008, result.code);
        return;
      }
      socket.serializeAttachment({
        clientId: attachment.clientId,
        registered: true,
        registration: {
          hostKey: registration.hostKey,
          peerId: registration.peerId,
          protocolVersion: registration.protocolVersion,
          tableId: registration.tableId,
        },
      });
      socket.send(JSON.stringify({ status: "registered", type: "receipt" }));
      return;
    }
    const candidate = parsed as JsonObject;
    const envelope = candidate.envelope;
    if (
      candidate.type !== "envelope" ||
      !envelope ||
      typeof envelope !== "object"
    ) {
      this.sendRejection(socket, "invalid-frame");
      return;
    }
    const result = await this.receive(
      attachment.clientId,
      data,
      envelope as OpaqueEnvelope,
    );
    const messageId =
      typeof (envelope as OpaqueEnvelope).messageId === "string"
        ? (envelope as OpaqueEnvelope).messageId
        : undefined;
    if (result !== "relayed") {
      this.sendRejection(socket, result, messageId);
      return;
    }
    socket.send(
      JSON.stringify({
        ...(messageId ? { messageId } : {}),
        status: "relayed",
        type: "receipt",
      }),
    );
  }

  private async register(
    socket: HibernatableWebSocketLike,
    clientId: string,
    registration: RelayRegistration,
  ): Promise<
    | { readonly status: "accepted" }
    | { readonly code: string; readonly status: "rejected" }
  > {
    if (!validRegistration(registration)) {
      return { code: "binding-mismatch", status: "rejected" };
    }
    const currentTime = Date.now();
    this.sweep(currentTime);
    const tokenHash = await sha256Base64Url(registration.accessToken);
    const session = this.state.storage.sql
      .exec<SessionRow>(
        `SELECT token_hash, ciphertext, iv, host_key, peer_id, table_id,
                protocol_version, expires_at
           FROM sessions
          WHERE token_hash = ?
          LIMIT 1`,
        tokenHash,
      )
      .toArray()[0];
    if (!session) return { code: "access-denied", status: "rejected" };
    const expiresAt = rowNumber(session, "expires_at");
    const sessionBinding = {
      hostKey: rowString(session, "host_key") ?? "",
      peerId: rowString(session, "peer_id") ?? "",
      protocolVersion: rowNumber(session, "protocol_version") ?? 0,
      tableId: rowString(session, "table_id") ?? "",
    };
    if (expiresAt === undefined || expiresAt <= currentTime) {
      this.state.storage.sql.exec(
        "DELETE FROM sessions WHERE token_hash = ?",
        tokenHash,
      );
      return { code: "session-expired", status: "rejected" };
    }
    if (
      !bindingMatches(sessionBinding, registration) ||
      sessionBinding.peerId !== registration.peerId
    ) {
      return { code: "binding-mismatch", status: "rejected" };
    }
    const key = peerKey(registration);
    if (this.peersByClient.has(clientId) || this.clientsByPeer.has(key)) {
      return { code: "peer-conflict", status: "rejected" };
    }
    const active: ActivePeer = {
      clientId,
      registration: {
        hostKey: registration.hostKey,
        peerId: registration.peerId,
        protocolVersion: registration.protocolVersion,
        tableId: registration.tableId,
      },
      socket,
    };
    this.peersByClient.set(clientId, active);
    this.clientsByPeer.set(key, active);
    return { status: "accepted" };
  }

  private async receive(
    clientId: string,
    frame: string,
    candidateEnvelope: OpaqueEnvelope,
  ): Promise<
    | "relayed"
    | "invalid-frame"
    | "binding-mismatch"
    | "recipient-unavailable"
    | "oversized-frame"
    | "client-unknown"
  > {
    const sender = this.peersByClient.get(clientId);
    if (!sender) {
      this.rehydrateWebSocketIndex();
    }
    const restoredSender = this.peersByClient.get(clientId);
    if (!restoredSender) return "client-unknown";
    if (new TextEncoder().encode(frame).byteLength > MAX_FRAME_BYTES) {
      return "oversized-frame";
    }
    if (!validEnvelope(candidateEnvelope)) return "invalid-frame";
    if (
      candidateEnvelope.senderPeerId !== restoredSender.registration.peerId ||
      !bindingMatches(candidateEnvelope, restoredSender.registration)
    ) {
      return "binding-mismatch";
    }
    const currentTime = Date.now();
    this.sweep(currentTime);
    const frameHash = await sha256Base64Url(frame);
    const existingReceipt = this.state.storage.sql
      .exec<{ readonly frame_hash: unknown }>(
        `SELECT frame_hash
           FROM relay_receipts
          WHERE table_id = ?
            AND host_key = ?
            AND protocol_version = ?
            AND sender_peer_id = ?
            AND recipient_peer_id = ?
            AND message_id = ?
          LIMIT 1`,
        candidateEnvelope.tableId,
        candidateEnvelope.hostKey,
        candidateEnvelope.protocolVersion,
        candidateEnvelope.senderPeerId,
        candidateEnvelope.recipientPeerId,
        candidateEnvelope.messageId,
      )
      .toArray()[0];
    if (existingReceipt) {
      return existingReceipt.frame_hash === frameHash
        ? "relayed"
        : "invalid-frame";
    }
    const recipientKey = peerKey({
      hostKey: candidateEnvelope.hostKey,
      peerId: candidateEnvelope.recipientPeerId,
      protocolVersion: candidateEnvelope.protocolVersion,
      tableId: candidateEnvelope.tableId,
    });
    let recipient = this.clientsByPeer.get(recipientKey);
    if (!recipient) {
      // The map is rebuilt in the constructor after hibernation. This scan is
      // a defensive recovery path for an event that arrives while a runtime
      // is restoring attachments; it remains table-bound and never trusts
      // client supplied socket identifiers.
      for (const candidate of this.state.getWebSockets()) {
        const attachment = this.socketAttachment(candidate);
        if (!attachment?.registered || !attachment.registration) continue;
        if (peerKey(attachment.registration) !== recipientKey) continue;
        recipient = {
          clientId: attachment.clientId,
          registration: attachment.registration,
          socket: candidate,
        };
        this.peersByClient.set(recipient.clientId, recipient);
        this.clientsByPeer.set(recipientKey, recipient);
        break;
      }
    }
    if (!recipient) return "recipient-unavailable";
    this.state.storage.sql.exec(
      `INSERT INTO relay_receipts(
         table_id, host_key, protocol_version, sender_peer_id,
         recipient_peer_id, message_id, frame_hash, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(
         table_id, host_key, protocol_version, sender_peer_id,
         recipient_peer_id, message_id
       ) DO NOTHING`,
      candidateEnvelope.tableId,
      candidateEnvelope.hostKey,
      candidateEnvelope.protocolVersion,
      candidateEnvelope.senderPeerId,
      candidateEnvelope.recipientPeerId,
      candidateEnvelope.messageId,
      frameHash,
      currentTime + RELAY_DEDUPLICATION_WINDOW_MS,
    );
    const reservedReceipt = this.state.storage.sql
      .exec<{ readonly frame_hash: unknown }>(
        `SELECT frame_hash
           FROM relay_receipts
          WHERE table_id = ?
            AND host_key = ?
            AND protocol_version = ?
            AND sender_peer_id = ?
            AND recipient_peer_id = ?
            AND message_id = ?
          LIMIT 1`,
        candidateEnvelope.tableId,
        candidateEnvelope.hostKey,
        candidateEnvelope.protocolVersion,
        candidateEnvelope.senderPeerId,
        candidateEnvelope.recipientPeerId,
        candidateEnvelope.messageId,
      )
      .toArray()[0];
    if (reservedReceipt?.frame_hash !== frameHash) {
      return "invalid-frame";
    }
    try {
      recipient.socket.send(frame);
    } catch {
      this.state.storage.sql.exec(
        `DELETE FROM relay_receipts
          WHERE table_id = ?
            AND host_key = ?
            AND protocol_version = ?
            AND sender_peer_id = ?
            AND recipient_peer_id = ?
            AND message_id = ?`,
        candidateEnvelope.tableId,
        candidateEnvelope.hostKey,
        candidateEnvelope.protocolVersion,
        candidateEnvelope.senderPeerId,
        candidateEnvelope.recipientPeerId,
        candidateEnvelope.messageId,
      );
      return "recipient-unavailable";
    }
    return "relayed";
  }

  private sendRejection(
    socket: HibernatableWebSocketLike,
    code: string,
    messageId?: string,
  ): void {
    socket.send(
      JSON.stringify({
        code,
        ...(messageId ? { messageId } : {}),
        status: "rejected",
        type: "receipt",
      }),
    );
  }

  private unregister(clientId: string): void {
    const active = this.peersByClient.get(clientId);
    if (!active) return;
    this.peersByClient.delete(clientId);
    this.clientsByPeer.delete(peerKey(active.registration));
  }
}
