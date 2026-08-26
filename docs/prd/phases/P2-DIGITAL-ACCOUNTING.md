---
id: PRD-P2
kind: phase
status: current
last_reconciled: 2026-08-15
decision_ids:
  - SCOPE-PLAY-MONEY
  - ARCH-SHARED-CORE
  - ACCOUNTING-PHASE-2
  - PHASE2-NLHE-HOME-SESSION
  - PHASE2-HOUSE-POLICY-V1
  - REMOTE-PUBLIC-TABLE-P2
  - REMOTE-HUMAN-PLAY
  - AI-PLAYER-PHASE-3
  - TEST-ACCOUNTING
  - TEST-CORRECTION-REPLAY
router: ../manifest.yaml
---

# Phase 2 — Digital Play-Chip Accounting and History

## Context capsule

Add an optional single-table, home-session No-Limit Texas Hold'em profile in which the app owns play-chip actions, stacks, pots, settlement, and detailed histories. The feature is switchable; Phase 1 physical-chip play remains supported. Phase 2 also adds a remote Public Table View. Full remote human play requires a separate pivot gate.

## Participating modules

Participating modules: [M10 Digital Accounting](../modules/M10-DIGITAL-ACCOUNTING.md) is primary; the phase also integrates [M01 Game Core](../modules/M01-GAME-CORE.md), [M02 Card Custody](../modules/M02-CARD-CUSTODY-PRIVACY.md), [M03 Identity](../modules/M03-IDENTITY-SEATS-CAPABILITIES.md), [M04 Connectivity](../modules/M04-CONNECTIVITY-SERVICE.md), [M05 Airplane Mode](../modules/M05-AIRPLANE-MODE.md), [M06 Presentation](../modules/M06-PRESENTATION-INTERACTION.md), [M07 Persistence/History](../modules/M07-PERSISTENCE-RECOVERY-HISTORY.md), [M08 Diagnostics/Red Team](../modules/M08-DIAGNOSTICS-RED-TEAM.md), and [M09 Release](../modules/M09-RELEASE-DISTRIBUTION.md).

## Problem Statement

Players who do not have physical chips need the system to record every legal action and conserve virtual stacks correctly. They also need inspectable hand histories and session-level buy-in/balance summaries for reflection. Adding only a visual counter would be unsafe: no-limit betting, all-ins, side pots, ties, corrections, and settlement form one authoritative rules problem.

## Solution

At table creation, the host selects either the Phase 1 Deal-Only Profile or the Phase 2 digital No-Limit home-session profile. The digital profile exposes exact legal actions to each Seat Controller, records contributions in immutable events, derives pots and eligibility, proposes awards in `SettlementPending`, and changes balances only after the required confirmation. Histories have public and per-player privacy projections and export both human-readable and machine-readable formats.

## User Stories

1. As a host, I want digital chips to be optional so physical-chip games remain simple.
2. As a player, I want only legal check/call/bet/raise/fold/all-in actions with exact amounts.
3. As a player, I want buy-ins and top-ups counted only as play-chip ledger entries.
4. As a table, we want main/side-pot eligibility and ties explained before balances change.
5. As a dealer, I want explicit settlement confirmation so conversation and correction can finish first.
6. As a player, I want a private history containing public events plus only my own cards.
7. As a group, we want a public history containing shown cards but never folded, legacy-mucked, or never-revealed cards.
8. As a learner, I want versioned JSON plus a readable replay/report for later analysis.
9. As a remote observer/player, I want the public board available on my device when I cannot see the room's display.
10. As a future AI seat, I need an exact state, action history, and legal-action envelope.

## Implementation Decisions

- `PHASE2-NLHE-HOME-SESSION` is the initial profile; other betting structures and tournaments remain deferred behind Rules Profile seams.
- Accounting is event-derived. Corrections append adjustments/approvals; they never overwrite earlier actions.
- Street advance in digital mode requires `BettingRoundClosed`; Phase 1 continues to use an explicit dealer command.
- Settlement and chip mutation are separate states. `p2-house-1` requires explicit host confirmation, allocates odd chips clockwise beginning left of the dealer, uses blinds without antes/straddles, permits top-ups only between hands, and makes a returning player wait for the big blind.
- The ledger contains chips only—never currency, payment, cash-out, rake, or transferable value.
- Remote Public Table View is read-only and privacy-filtered. Supporting fully remote human play requires new target-user, latency, moderation, and recovery research.

## Testing Decisions

- Property tests enforce legal actions, non-negative stacks, total chip conservation, contribution accounting, and deterministic replay.
- Cover short all-ins, nested side pots, folds after contribution, split pots, odd chips, simultaneous all-ins, top-ups, sit-out/return, disconnect, and settlement correction.
- Differentially test hand evaluation and representative settlement vectors against an independent implementation.
- Prove public/personal/diagnostic exports obey distinct card policies.
- Re-run recovery and idempotency fault tests with balance events and `SettlementPending`.
- Run the digital profile through both Table-side and actual standalone Airplane artifacts without weakening the Phase 1 physical-chip profile.

## Out of Scope

Money, payment, rake, clubs, public matchmaking, tournament clocks/elimination/re-entry, multi-table balancing, remote-first play without a pivot, other poker variants, AI execution, and long-term managed accounts.

## Further Notes

Phase 2 is active as development work as of 2026-08-15. Its selector is absent
from the default Phase 1 party path and is exposed only by the explicit
`?experimental=digital-chips` query. The first implemented tracer covers one
heads-up Digital Chips hand through settlement confirmation and deliberately
rejects late new seats or a second hand. Multi-hand sessions,
multiway/short-all-in hardening, top-up/re-entry, corrections,
histories/exports, Remote Public Table qualification, recovery fault coverage,
and release evidence remain incomplete. It is not party-ready and is not a
Phase 2 release candidate. See the [Phase 2 accounting
foundation](../../research/PHASE-2-ACCOUNTING-FOUNDATION.md) and [current
architecture](../../architecture/PHASE-2-ACCOUNTING.md).
