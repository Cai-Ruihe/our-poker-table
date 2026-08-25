---
id: PRD-M04
kind: module
status: current
last_reconciled: 2026-08-14
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
router: ../manifest.yaml
---

# M04 — Connectivity and Connection Service

## Context capsule

This module keeps peers connected without becoming poker authority. The
client-side interface maintains one logical authenticated channel while Normal
Mode attempts direct P2P, the deployer's Cloudflare Workers/Durable Objects
relay, then the deployer's Mac Connection Service fallback. The optional
Connection Services supply signaling, short-lived relay credentials, opaque
checkpoints, and redacted diagnostics only.

## Problem Statement

WebRTC needs signaling and often relay assistance. Same-Wi-Fi assumptions, browser suspension, network switching, China cross-border variability, and public open-source deployment make a single hard-coded backend unreliable and financially unsafe.

## Solution and Interface

The transport interface connects/reconnects an authenticated peer, sends/receives opaque protocol envelopes, reports route state, and closes/revokes. The Connection Service interface accepts strict signaling objects, issues short-lived relay credentials, stores opaque authenticated blobs, and accepts allowlisted redacted diagnostics. Neither interface interprets poker events or private card content.

### Owns

- Normal Mode bootstrap transport and route state machine.
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
- For Normal Mode reverse-display pairing, signaling carries the return path after the host scans the display's ephemeral request QR; the request itself grants no role or table authority.
- Long-lived TURN/provider secrets remain server-side; clients receive scoped short-lived credentials.
- Connection Service may observe IP, timing, size, table, and route metadata. “Card-blind” does not mean metadata-blind.
- Existing direct channels continue if a relay later fails. Each dependent peer reports its own path.
- Relay selection is sticky for an active peer. After a disconnect or bounded
  timeout, reconnect attempts serially try Cloudflare first and then Mac; the
  client never duplicates an envelope across both paths. A recovered relay
  does not interrupt healthy sessions.
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

## Out of Scope

Central poker engine, built-in public relay subsidy, universal China guarantee, Airplane transport, provider AI invocation, and automatic host election.

## Further Notes

Airplane Mode is the no-internet fallback and has its own PRD. Normal Mode must remain optional enough that failure of all services never invalidates the standalone product direction.
