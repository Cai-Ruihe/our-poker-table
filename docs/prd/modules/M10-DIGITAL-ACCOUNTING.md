---
id: PRD-M10
kind: module
status: current
last_reconciled: 2026-09-14
decision_ids:
  - SCOPE-PLAY-MONEY
  - ACCOUNTING-PHASE-2
  - PHASE2-NLHE-HOME-SESSION
  - PHASE2-HOUSE-POLICY-V1
  - TEST-RULES-PROFILE
  - TEST-ACCOUNTING
router: ../manifest.yaml
---

# M10 — Digital Play-Chip Accounting

## Context capsule

Phase 2's optional accounting module owns machine-readable No-Limit Hold'em actions, stacks, contributions, pots, awards, buy-in units, settlement, and exports. Its interface extends Game Core with exact legal actions and emits immutable accounting events. All units are play chips with no money, payment, cash-out, rake, or transfer value.

## Problem Statement

Playing without physical chips requires more than a counter. Calls, raises, short all-ins, side pots, ties, corrections, and settlement must conserve chips and remain understandable after disconnect/replay. An incorrect ledger would make the product unusable and undermine later AI training.

## Solution and Interface

Given committed public hand state and one player's private eligibility, expose exact legal action options and validate a selected amount. Record buy-in/top-up and contribution events, derive ordered pots/eligibility, propose awards, enter `SettlementPending`, and commit balances only through confirmed settlement.

### Owns

- Digital action legality/amounts, betting-round closure, stacks/contributions, pots and eligibility.
- Buy-in/top-up count and session balance ledger.
- Settlement proposal, confirmation, adjustment/correction, and chip conservation.
- Public/personal machine-readable history and human-readable result explanation.

### Does not own

- Card lifecycle/evaluation ([M01](M01-GAME-CORE.md)).
- Private-card projection ([M02](M02-CARD-CUSTODY-PRIVACY.md)).
- Persistence mechanics ([M07](M07-PERSISTENCE-RECOVERY-HISTORY.md)).
- Money/payment/club accounts.

## User Stories

1. As a player, I want exact legal actions and amounts so I cannot create an impossible pot.
2. As a short-stacked player, I want all-in and side-pot eligibility calculated correctly.
3. As a host, I want buy-ins/top-ups counted in play-chip units.
4. As a table, we want a readable pot-by-pot winning-hand explanation.
5. As a dealer, I want balances unchanged until settlement is confirmed.
6. As a player, I want corrections visible as new ledger events, not rewritten history.
7. As an analyst/AI adapter, I want versioned JSON preserving exact amounts/actions.

## Implementation Decisions

- Initial profile is single-table, home-session No-Limit Texas Hold'em. `BettingStructure` and `SessionPolicy` remain explicit axes.
- Phase 1 never instantiates this module or fake zero-valued accounting state.
- Derive pots from immutable contributions/eligibility; never mutate a pot total as the sole truth.
- Reopening is per player: short all-ins reopen a prior actor only when the cumulative increase faced reaches the last full bet/raise. Unacted players retain their raise option.
- A short big blind does not lower the nominal bring-in while multiple players can still bet. When only one player has chips, require only the outstanding actual contribution; when no response remains, run out the board. Reject zero-stack hand participants.
- Accounting snapshots version the per-player reopening state. Unsupported snapshots fail recovery closed rather than reconstructing unknown raise rights.
- Settlement proposal and balance mutation are separate. `p2-house-1` pins explicit host confirmation, clockwise odd-chip allocation beginning left of the dealer, blinds without antes/straddles, between-hand top-ups, and wait-for-big-blind re-entry.
- Every correction references original entries and preserves total conservation.
- Histories separate public facts, the player's own cards, and diagnostics; no all-card export.

## Testing Decisions

Use property/model-based tests at the accounting interface. Assert legal-action sets, min/max raises, non-negative stacks, total conservation, deterministic replay, and pot eligibility. Cover heads-up, folds after contribution, short calls, multiple side pots, simultaneous all-ins, ties, odd chips, top-up/sit-out, disconnect, duplicate actions, settlement rejection/reopen, and correction. Differentially verify representative vectors.

## Out of Scope

Real money, payments, rake, credit, clubs, tournament lifecycle, multi-table balancing, other betting structures in the first slice, and automated settlement without confirmation.

## Further Notes

The deep module and its first heads-up tracer are active development work. The
default Phase 1 party path does not expose it; the browser selector requires
`?experimental=digital-chips`. Reopening/blind edge vectors and seeded
conservation/replay sequences extend the local accounting evidence. Independent
differential qualification, top-up/re-entry, corrections, replayable exports,
physical devices, and release behavior remain required before the module can
be called complete or party-ready.
