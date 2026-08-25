/*
 * Operator-owned runtime routing. Keep empty for same-browser development.
 *
 * Set only deployer-owned relay origins here, for example:
 *
 * globalThis.__HTML_POKER_CONFIG__ = {
 *   cloudRelay: { url: "wss://relay.example.invalid" },
 *   privateRelay: { url: "wss://mac-relay.example.invalid" },
 * };
 *
 * Never put POKER_CONNECTION_ACCESS_TOKEN, a relay ticket, or any player
 * invitation secret in this file. The host enters its operator token locally
 * to mint independent table-scoped, short-lived tickets for each configured
 * relay. A zero-config build remains unconfigured.
 */
globalThis.__HTML_POKER_CONFIG__ ??= {};
