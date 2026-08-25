import type { RelayEnv } from "./cloudflare-types.js";
import { RelayHub } from "./relay-hub.js";

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

export default {
  async fetch(request: Request, env: RelayEnv): Promise<Response> {
    const allowedOrigin = configuredOrigin(env);
    if (!allowedOrigin) {
      return new Response("Relay origin is not configured", {
        headers: { "cache-control": "no-store" },
        status: 503,
      });
    }
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      if (
        request.headers.get("origin") &&
        request.headers.get("origin") !== allowedOrigin
      ) {
        return originNotAllowed();
      }
      return jsonResponse({ status: "ok" }, 200, allowedOrigin);
    }
    if (request.headers.get("origin") !== allowedOrigin) {
      return originNotAllowed();
    }
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), allowedOrigin);
    }
    if (
      url.pathname !== "/v1/table-sessions" &&
      !/^\/v1\/display-pairings\/[^/]+$/u.test(url.pathname) &&
      request.headers.get("upgrade")?.toLowerCase() !== "websocket"
    ) {
      return withCors(new Response(null, { status: 404 }), allowedOrigin);
    }
    const id = env.RELAY_HUB.idFromName("global");
    const stub = env.RELAY_HUB.get(id);
    return stub.fetch(request);
  },
};

export { RelayHub };
