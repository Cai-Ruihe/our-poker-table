/**
 * The relay deliberately keeps its Cloudflare surface small. These local
 * structural types let the package typecheck without adding a runtime or
 * root-lockfile dependency; Wrangler supplies the concrete bindings.
 */
export interface SqlRow {
  readonly [key: string]: unknown;
}

export interface SqlCursor<Row extends SqlRow = SqlRow> {
  toArray(): Row[];
}

export interface SqlStorageLike {
  exec<Row extends SqlRow = SqlRow>(
    statement: string,
    ...bindings: readonly unknown[]
  ): SqlCursor<Row>;
}

export interface DurableObjectStateLike {
  readonly storage: { readonly sql: SqlStorageLike };
  acceptWebSocket(
    socket: HibernatableWebSocketLike,
    tags?: readonly string[],
  ): void;
  getWebSockets(tag?: string): HibernatableWebSocketLike[];
}

/**
 * The hibernation API extends the WebSocket standard with per-connection
 * attachments. Keeping this structural avoids depending on Wrangler's global
 * declarations in the relay's source package.
 */
export interface HibernatableWebSocketLike extends WebSocket {
  deserializeAttachment(): unknown;
  serializeAttachment(value: unknown): void;
}

export interface DurableObjectIdLike {
  readonly toString: () => string;
}

export interface DurableObjectStubLike {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): DurableObjectStubLike;
}

export interface RelayEnv {
  readonly RELAY_HUB: DurableObjectNamespaceLike;
  readonly RELAY_OPERATOR_TOKEN: string;
  readonly RELAY_ALLOWED_ORIGIN?: string;
  readonly RELAY_SESSION_TTL_MS?: string;
}
