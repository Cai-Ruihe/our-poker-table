# ADR-0005: Deployer-owned connectivity ladder

- **Status:** Accepted
- **Date:** 2026-08-14
- **Decider:** Project Owner
- **Scope:** Normal Mode; M03, M04, M07, M09
- **Decision IDs:** `SERVER-CONNECTION-ONLY`, `NET-ROUTE`, `NET-OWNER-ISOLATION`, `NET-BOOTSTRAP`, `NET-CHINA`

## Context

Devices may join across different networks, including while traveling, but the open-source project must not make Ruihe's desktop or cloud bill the default backend for other deployments. The desktop may later become a Mac mini and should provide connection help, not poker authority.

## Evidence

### Facts

- Browser WebRTC normally needs signaling and may require TURN relay when a direct route cannot traverse NAT/firewalls.
- A relay can forward encrypted traffic without running poker rules or receiving card plaintext.
- Network reachability, especially across providers and regions, is empirical and changes over time.

### Inference

Trying the cheapest/least-central route first while allowing deployer-specific fallbacks balances directness, reliability, and cost ownership.

### Unknowns

Direct-connect and relay success rates, latency, traffic cost, TV-browser support, and mainland-China reachability need current measurements.

## Decision

Normal Mode bootstraps with QR or the equivalent full URL through signaling. It
tries direct P2P first, then the deployer's Cloudflare Workers/Durable Objects
relay as the primary hosted path, and finally the deployer's Mac Connection
Service as the fallback path. Each relay receives its own table-scoped,
short-lived ticket. A host keeps one sticky active relay per peer: failover is
serial and happens after disconnect/timeout, never by sending one envelope over
both relays. Existing healthy sessions stay on their current relay; a new or
reconnecting session prefers Cloudflare when it is available. Each deployment
supplies its own endpoints and credentials. Connection services are card-blind
and never become the poker engine. A table pins its host identity, protocol,
rules profile, and compatible release.

## Consequences

Home users may operate a Windows desktop or Mac mini connection service, while public deployments can choose their own infrastructure. Some games will incur relay bandwidth and some networks will still fail. Configuration and status UX must make route and trust clear without cluttering ordinary play.

## Alternatives considered

- **Project-wide central service:** rejected due to recurring cost, dependency, and open-source abuse risk.
- **Direct P2P only:** rejected as insufficiently robust across NAT/firewall combinations.
- **Desktop as poker engine:** rejected because visiting players should not transmit card authority to infrastructure outside the active host device.

## Security and privacy effect

Invitations authenticate the active host independently of signaling. Relays receive encrypted envelopes only. Compromise may disrupt or observe metadata but must not reveal hidden cards or authorize game commands.

## Validation and revisit trigger

Run direct/Cloudflare/Mac fallback, serial failover with no duplicate action,
ICE restart, network-switch, service-compromise, multi-table isolation, and
representative mainland-China tests. A material route failure or
regulatory/hosting constraint triggers updated research and a superseding ADR.
