---
id: PRD-M04
kind: module
status: current
last_reconciled: 2026-09-15
decision_ids:
  - PHASE1-ONE-TABLE-PER-HOST
  - SERVER-CONNECTION-ONLY
  - NET-ROUTE
  - NET-OWNER-ISOLATION
  - NET-BOOTSTRAP
  - NET-DISPLAY-REVERSE-QR
  - NET-HOST-KEY-BINDING
  - NET-CHINA
  - NET-VERSION
  - AI-GATEWAY-COLOCATION
  - TEST-CHINA-NETWORKS
  - TEST-WEBRTC-STAGING
  - TEST-REMOTE-COMPROMISE
  - RECOVERY-RECONNECT-STORM-CONTROL
  - PHASE2-RECOVERY-CANDIDATE-V1
router: ../manifest.yaml
---

# M04 — Connectivity and Connection Service

## Context capsule

This module keeps peers connected without becoming poker authority. The
client-side interface maintains one logical authenticated channel while Table-side
Mode attempts direct P2P, the deployer's Cloudflare Workers/Durable Objects
relay, then the deployer's Mac Connection Service fallback. Connection Services supply signaling, short-lived relay credentials, opaque
checkpoints, and redacted diagnostics only.

## Problem Statement

WebRTC needs signaling and often relay assistance. Same-Wi-Fi assumptions, browser suspension, network switching, China cross-border variability, and public open-source deployment make a single hard-coded backend unreliable and financially unsafe.

## Solution and Interface

The transport interface connects/reconnects an authenticated peer, sends/receives opaque protocol envelopes, reports route state, and closes/revokes. The Connection Service interface accepts strict signaling objects, issues short-lived relay credentials, stores opaque authenticated blobs, and accepts allowlisted redacted diagnostics. Neither interface interprets poker events or private card content.

### Owns

- Table-side Mode bootstrap transport and route state machine.
- Signaling, ICE/reconnect, network-change handling, and route visibility.
- Cloudflare-primary/Mac-fallback relay configuration and short-lived,
  endpoint-specific credentials.
- Card-blind Connection Service schemas, metadata retention, and table isolation.
- China network test strategy and deployer-specific configuration.

### Does not own

- Identity/capability policy ([M03](M03-IDENTITY-SEATS-CAPABILITIES.md)).
- Game authority ([M01](M01-GAME-CORE.md)) or card encryption keys ([M02](M02-CARD-CUSTODY-PRIVACY.md)).
- Airplane-specific packaging/pairing ([M05](M05-AIRPLANE-MODE.md)).
- Recovery semantics ([M07](M07-PERSISTENCE-RECOVERY-HISTORY.md)).

## User Stories

1. As a player, I want route changes to preserve my table/seat identity.
2. As a host, I want direct P2P preferred and relay paths used only when required.
3. As Ruihe, I want my Windows desktop or later Mac mini to be the primary private Connection Service.
4. As a traveler, I want the deployer's Cloudflare relay to remain available
   when the Mac Connection Service is asleep, with the Mac path available as a
   deployer-controlled fallback.
5. As an open-source deployer, I want my own infrastructure configuration and bill.
6. As a table, we want reconnection to reconcile authoritative revision rather than guess actions.

## Implementation Decisions

- The requested route order is a product `ConnectivityStrategy`; do not assume browser ICE automatically exposes that exact sequence.
- Authenticate the active host key through QR/full URL independently of signaling before seat activation/private delivery.
- For Table-side Mode reverse-display pairing, signaling carries the return path after the host scans the display's ephemeral request QR; the request itself grants no role or table authority.
- Long-lived TURN/provider secrets remain server-side; clients receive scoped short-lived credentials.
- Connection Service may observe IP, timing, size, table, and route metadata. “Card-blind” does not mean metadata-blind.
- Existing direct channels continue if a relay later fails. Each dependent peer reports its own path.
- Relay selection is sticky for an active peer. After a disconnect or bounded
  timeout, reconnect attempts serially try Cloudflare first and then Mac; the
  client never duplicates an envelope across both paths. A recovered relay
  does not interrupt healthy sessions.
- Table-side liveness is separate from catch-up projection retrieval. A client
  silently retries its first two consecutive missed authenticated liveness
  attempts. Only a third consecutive miss without any valid authenticated Host
  frame may present Host-unavailable guidance; any valid Host frame clears the
  miss count and guidance immediately. Explicit manual retries report their
  own failure; automatic alerts remain subject to this threshold.
- Liveness probes are small, authenticated, and read-only. They never create a
  poker event, change authority, or persist recovery state. Do not introduce a
  player-count-aware or globally coordinated polling algorithm. The current
  release has no retry randomization. The next-version requirement
  `RECOVERY-RECONNECT-STORM-CONTROL` adds independent reconnect
  backoff/jitter without changing this three-miss liveness policy.
- Revision 4 adopts the recovery backlog below for shared Table/TV/Host
  runtime. Healthy channels and valid tickets are reused; the existing
  three-miss authenticated liveness policy remains mandatory.
- A table invitation carries independent Cloudflare and Mac ticket material;
  it never carries the operator token. Each ticket is bound to the table,
  host, peer ID, endpoint, protocol, expiry, and nonce. A display-pairing
  request ID is not a write credential: only the host-held, short-lived pairing
  capability can write its encrypted response, subject to per-capability
  pending-entry and rate limits.
- The Windows/Mac Connection Service and future AI Gateway may share hardware only as separate least-privilege processes with separate identities, data, secrets, ports, and logs.
- China readiness remains a measured deployment claim. A desktop outside mainland China does not become mainland-hosted merely because a traveler connects, but reachability and legal obligations remain unproven.

## Testing Decisions

Use an in-memory transport adapter for protocol tests and real browser/network
adapters for compatibility. Test hostile signaling substitution, replay,
direct/Cloudflare/Mac fallback, independent-ticket issuance, serial failover
without duplicate delivery, UDP/TCP/TLS TURN, relay loss, network switching,
browser background/freeze, reconnect, route timeouts, credential theft/expiry,
oversized objects, table isolation, and Connection Service compromise. Measure
representative mainland networks before any readiness claim.

Liveness tests must prove that the first two missed attempts are silent, the
third without a valid Host frame is actionable, and any subsequent valid Host
event or projection clears the state immediately. Exercise two and ten players,
including a new mid-hand join, across direct and both relay routes; physical
devices must cover foreground/background Host scheduling.

## Next Table-side release backlog and Phase 2 revision-4 candidate

`RECOVERY-RECONNECT-STORM-CONTROL` addresses unnecessary registration,
signaling, relay envelopes, and database work after network loss, foreground
transitions, or repeated taps. Revision 4 inherits these requirements;
qualification still requires current evidence. The pinned Phase 1 artifact
and Airplane Mode retain their separate release boundaries.

- One client owns at most one reconnect flow. Manual, foreground, and `online`
  triggers coalesce; the control cannot start a concurrent duplicate flow.
- Offline state performs no connection attempt. An `online` transition schedules
  one coalesced recovery. Automatic retries use capped independent exponential
  backoff with jitter: nominally 1, 2, 5, 10, then 30 seconds maximum. A bounded
  retry count enters a 30-second cooldown before another bounded batch;
  manual retry is available. It must never tightly loop.
- Reuse an open healthy WebRTC DataChannel. While a table-bound relay ticket is
  valid, reuse it rather than issuing or rotating a ticket; only a genuine
  route/credential failure may perform the existing serial route recovery.
- Coalesce and rate-limit Host reconnect consequences: `table-changed`,
  projection refresh, and table-wide fan-out must not create an unbounded burst
  when several clients recover together.
- Add redacted deployer diagnostics for attempts, success rate, final route,
  backoff/cooldown count, relay-envelope count, and aggregated Cloudflare
  Durable Object row reads/writes. Client diagnostics must not claim to observe
  provider billing directly or contain cards, credentials, or personal data.
- Add deterministic weak-network, offline/online, lock-screen/foreground,
  repeat-tap, and simultaneous multi-client recovery tests. Include a stress
  seam that measures relay envelopes and Durable Object row operations.

Acceptance before implementation is complete: the per-client reconnect request
rate has an explicit tested upper bound; a client never has two recovery flows;
network restoration catches the table up; a valid ticket is not unnecessarily
rotated; and concurrent recovery has a measured bounded relay/database peak.

## Out of Scope

Central poker engine, built-in public relay subsidy, universal China guarantee, Airplane transport, provider AI invocation, and automatic host election.

## Further Notes

Airplane Mode remains the standalone no-internet fallback.
