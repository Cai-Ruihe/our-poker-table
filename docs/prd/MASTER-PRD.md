---
id: PRD-000
kind: master
status: current
last_reconciled: 2026-08-17
decision_ids:
  - SCOPE-PLAY-MONEY
  - PHASE1-DEAL-ONLY
  - GOV-LICENCE
  - GOV-OFFICIAL-CORE
  - GOV-NO-ACCOUNTS
  - GOV-PRIORITY
  - AUTH-TRUSTED-HOST
  - AUTH-FUTURE-MENTAL-POKER
  - NET-ROUTE
  - NET-AIRPLANE
  - NET-CHINA
  - ACCOUNTING-PHASE-2
  - SKINS-PHASE-3
  - AI-PLAYER-PHASE-3
  - TOURNAMENT-MULTITABLE-VARIANTS
router: manifest.yaml
---

# Master PRD — Our Poker Table

## Context capsule

Build **Our Poker Table**, an elegant, account-free HTML Texas Hold'em table for nearby social play. Phones hold private cards; a tablet, TV, or computer may show and control the public table. The active browser host is the Phase 1 poker authority. Normal Mode connects through direct peer-to-peer, then the deployer's Cloudflare Workers/Durable Objects relay, then the deployer's Mac Connection Service fallback. Airplane Mode works from a preloaded standalone HTML artifact on a private local Wi-Fi network. Play chips never represent money.

This document routes work. Load the relevant [Phase PRD](#roadmap) and [Module PRD](#module-map) for details.

## Problem Statement

Bold Poker demonstrates an excellent physical-table interaction, but native-device, network, hosting, extensibility, and long-term availability constraints limit who can join and how the product can evolve. A browser implementation must preserve the low-attention physical-table experience while supporting computers and TVs, internet-independent Airplane Mode, optional deployer-owned connection infrastructure, later digital chip accounting, replaceable skins, and AI training players.

A single giant PRD would consume agent context and drift as later phases grow. The product therefore needs a routed specification whose documents have clear ownership and small interfaces.

## Solution

Create one authoritative event-driven poker core with replaceable seams for Card Custody, transport, persistence, accounting, presentation, release packaging, skins, and Seat Controllers. Phase 1 is a deal-only digital dealer used with physical chips. Phase 2 optionally adds digital play-chip actions, accounting, history, and remote public presentation. Phase 3 adds data-only skins and optional provider-neutral AI Players.

Hidden-card privacy is the security floor. Within that floor, Airplane Mode, China operation, and robustness take priority over exotic protocols. Phase 1 honestly trusts the active host; future Mental Poker remains a separate option.

## User Stories

1. As a host, I want to create a table from an ordinary browser so that no native app or account is required.
2. As a player, I want to join by QR or equivalent full URL and privately receive my cards.
3. As a group, we want a tablet, TV, or computer to show the public table in a layout suited to that device.
4. As a dealer, I want the common hand flow to stay minimal while exceptional administration remains available off the main surface.
5. As a traveler, I want a preloaded Airplane Mode that works over private local Wi-Fi without internet.
6. As a deployer, I want my own signaling and relay configuration so that no open-source user consumes Ruihe's infrastructure.
7. As a returning player, I want refresh or temporary disconnection to restore my seat without an account.
8. As a future digital-chip player, I want accurate play-chip actions, pots, settlement, and histories without real-money features.
9. As a learner, I want later AI seats with different models and play styles while preserving human and card privacy boundaries.
10. As a maintainer, I want each task to load only the phase, module, and decisions it needs.

## Roadmap

| Phase | Outcome | PRD |
|---|---|---|
| Phase 1 | Trusted-Host digital dealer with physical chips, Normal Mode, Airplane Mode, recovery, and privacy baseline | [PRD-P1](phases/P1-TRUSTED-HOST-DEALER.md) |
| Phase 2 | Optional digital play-chip accounting, machine-readable actions/history, and remote Public Table View | [PRD-P2](phases/P2-DIGITAL-ACCOUNTING.md) |
| Phase 3 | Safe Community Skins and optional multi-model AI training players | [PRD-P3](phases/P3-SKINS-AND-AI.md) |

Deferred roadmap options include Mental Poker, remote-first human play, tournaments, multi-table orchestration, multiple boards, other betting structures, and non-Texas-Hold'em variants. They are seams, not partially implemented flags.

## Module map

| ID | Module | Owns |
|---|---|---|
| M01 | [Game Core](modules/M01-GAME-CORE.md) | Rules profile, commands, events, hand lifecycle, evaluation |
| M02 | [Card Custody & Privacy](modules/M02-CARD-CUSTODY-PRIVACY.md) | Shuffle, hidden state, role projections, reveal rules |
| M03 | [Identity, Seats & Capabilities](modules/M03-IDENTITY-SEATS-CAPABILITIES.md) | Join Window, Seat Credentials, roles, scoped authority |
| M04 | [Connectivity & Connection Service](modules/M04-CONNECTIVITY-SERVICE.md) | Bootstrap, P2P/relay route, card-blind services, China tests |
| M05 | [Airplane Mode](modules/M05-AIRPLANE-MODE.md) | Standalone offline artifact and local two-way QR pairing |
| M06 | [Presentation & Interaction](modules/M06-PRESENTATION-INTERACTION.md) | Player, Tablet, TV, Public Table, gestures and accessibility |
| M07 | [Persistence, Recovery & History](modules/M07-PERSISTENCE-RECOVERY-HISTORY.md) | Commit/replay, reconnect, checkpoints and histories |
| M08 | [Diagnostics & Red Team](modules/M08-DIAGNOSTICS-RED-TEAM.md) | Redacted diagnostics and phase security attacks |
| M09 | [Release & Distribution](modules/M09-RELEASE-DISTRIBUTION.md) | Public identity/routes, static hosting, immutable builds, version/update trust |
| M10 | [Digital Accounting](modules/M10-DIGITAL-ACCOUNTING.md) | Play-chip actions, pots, settlement and exports |
| M11 | [Community Skins](modules/M11-COMMUNITY-SKINS.md) | Data-only appearance packages and validation |
| M12 | [AI Players](modules/M12-AI-PLAYERS.md) | SeatController, GTO-guided trainer/replay, AI Gateway, styles and provider gates |

## Implementation Decisions

- One Trusted Host accepts authenticated commands and commits authoritative events. Transport and public displays never become poker authority.
- Interfaces remain narrow: Game Core accepts commands and exposes committed outcomes; adapters handle transport, storage, presentation, custody, and future providers.
- Every table pins a compatible build, protocol, and Rules Profile for its lifetime.
- Public, control, diagnostic, and per-seat private projections are generated at authority; secrets are never merely hidden with CSS.
- All infrastructure is deployer-owned and optional. The base human game has no required account, analytics, AI, or central poker engine.
- The public product/repository identity is **Our Poker Table** at `Cai-Ruihe/our-poker-table`; the established local workspace, npm workspace identifier, `@html-poker/*` package namespace, and protocol identifiers remain compatibility names. M09 owns the exact public routes and release-claim boundary.
- Apache-2.0 is the intended project-code licence; only owner-approved changes become Official Core releases.

## Testing Decisions

- Test through module interfaces and complete user journeys, not internal implementation.
- Every phase has a Card Privacy Red Team gate.
- Phase 1 cannot claim China readiness, Airplane support, recovery, or host hardening until the named device/network/fault tests pass.
- Phase 2 must prove chip conservation, legal actions, side-pot correctness, explicit settlement, and privacy-safe histories.
- Phase 3 must prove skin non-executability and AI seat/provider isolation without making human play depend on AI.

## Out of Scope

Real money, payment, cash-out, rake, gambling accounts, public matchmaking, casino/club administration, automatic host migration in Phase 1, and any claim that the active Trusted Host cannot inspect or alter its deck.

## Further Notes

Use [manifest.yaml](manifest.yaml) to build a minimal task context. Decisions are indexed in [DECISION-REGISTER.md](reference/DECISION-REGISTER.md); terminology is controlled by [GLOSSARY.md](reference/GLOSSARY.md); cross-cutting rationale is indexed in the [ADRs](../adr/README.md). Interaction inspiration may follow Bold Poker behavior, but artwork, branding, and exact interface expression must be original.
