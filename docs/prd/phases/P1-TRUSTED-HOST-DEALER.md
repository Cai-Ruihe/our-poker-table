---
id: PRD-P1
kind: phase
status: current
last_reconciled: 2026-08-16
decision_ids:
  - SCOPE-PLAY-MONEY
  - PHASE1-DEAL-ONLY
  - PHASE1-TABLE-SIZE
  - GOV-NO-ACCOUNTS
  - GOV-RED-TEAM
  - GOV-PRIORITY
  - AUTH-TRUSTED-HOST
  - AUTH-HOST-DEATH
  - AUTH-HOST-CAN-PLAY
  - MODE-HOST-DEVICE-SWITCH
  - ARCH-SHARED-CORE
  - NET-ROUTE
  - NET-AIRPLANE
  - NET-CHINA
  - HOST-CAPABILITY-PREFLIGHT
  - HAND-END-EXPLICIT
  - TEST-RULES-PROFILE
  - TEST-IOS-STANDALONE
router: ../manifest.yaml
---

# Phase 1 — Trusted-Host Digital Dealer

## Context capsule

Deliver the smallest complete in-person product: one Trusted Host deals digital Texas Hold'em cards while people bet with physical chips. Players join without accounts; separate Player, Tablet, TV, and Public Table presentations use privacy-filtered state. Table-side Mode and Airplane Mode are first-phase requirements. Digital chip truth, remote-first play, skins, AI, and host blindness are excluded.

## Participating modules

Participating modules: [M01](../modules/M01-GAME-CORE.md), [M02](../modules/M02-CARD-CUSTODY-PRIVACY.md), [M03](../modules/M03-IDENTITY-SEATS-CAPABILITIES.md), [M04](../modules/M04-CONNECTIVITY-SERVICE.md), [M05](../modules/M05-AIRPLANE-MODE.md), [M06](../modules/M06-PRESENTATION-INTERACTION.md), [M07](../modules/M07-PERSISTENCE-RECOVERY-HISTORY.md), [M08](../modules/M08-DIAGNOSTICS-RED-TEAM.md), and [M09](../modules/M09-RELEASE-DISTRIBUTION.md).

## Problem Statement

Home poker loses time to shuffling and dealing, while native app requirements and fragile connectivity exclude otherwise usable phones, computers, tablets, and TVs. A browser replacement must feel like a deck—not an online poker client—while keeping unrevealed cards away from every device and service that does not need them.

## Solution

A capable browser creates one table, owns the shuffled deck, and commits an ordered event history. Players join through QR or an equivalent full URL during a Join Window and receive revocable Seat Credentials. The host sends only role-appropriate projections. A nearby tablet can use scoped dealer controls; a TV uses a non-touch layout. Table-side Mode changes routes without changing game identity. Airplane Mode uses the same core from a standalone artifact over private local Wi-Fi.

## User Stories

1. As a host, I want a capability check before creating a table so that an unsuitable browser fails before cards are dealt.
2. As a player, I want QR/full-URL joining without an account or per-player approval prompt.
3. As a host who is also playing, I want a separate Player credential and private view on this device or another device so my role does not leak cards or authority.
4. As a player, I want private reveal, Fold with guarded undo, and irreversible Show without a second concession action to interpret.
5. As a dealer, I want explicit street advance and guarded End Hand, including when everyone folds.
6. As a group, we want the Public Table to evaluate available shown hands without forcing folded players to reveal.
7. As a dealer, I want auto seating, movable visual positions, and separate dealer relocation without charging blinds or dealing.
8. As a returning player, I want refresh, temporary power loss, or route change to recover my seat.
9. As a group, we want a disconnected player to become sitting out for future hands after current-hand end.
10. As a traveler, I want two-way QR Airplane pairing and zero internet dependency.
11. As a troubleshooter, I want a visible Hand ID, redacted diagnostics, and a manual Save Log action.

## Implementation Decisions

- `PHASE1-DEAL-ONLY`: do not model stacks, bets, pots, buy-ins, or settlement. Dealer/blind positions may be displayed, but chip truth remains physical.
- The command path is authenticate → validate table/hand/actor/epoch/revision/idempotency → atomically persist → project/acknowledge.
- A new player waits for the next hand; a recovered Seat Credential may resume the current hand.
- Show is irreversible. Fold undo ends at the first dependent progression. A correction appends an event and never erases exposure.
- A Public Table/display permission cannot become Table-Control. A valid control capability can reveal streets and run guarded dealer operations without card access.
- A host device may redeem an ordinary Player invitation, then switch within one active document among Host Controls, its credential-filtered My Hand, and card-blind Table View. The switch changes presentation, never authority.
- Table-side route order is direct → deployer Cloudflare Workers/Durable Objects relay → deployer Mac Connection Service fallback. Relay selection is sticky per active peer and failover is serial after disconnect/timeout; the host key is authenticated independently of signaling.
- Host death may end the game. Same-browser host refresh resumes only after exclusive authority and deterministic replay succeed.
- Optional completed-hand remote checkpoints exclude never-revealed/folded cards, legacy-mucked cards, and active custody material.

## Testing Decisions

- End-to-end: create → join 2–10 seats → deal → privately reveal/fold/show → reveal board → explicit end → next hand.
- Exercise heads-up, six-max, ten-player layout, all-fold, one-show/rest-fold, tie evaluation, accidental fold, premature deal, duplicate control, player replacement, and disconnect past hand end.
- Fault every persistence boundary and prove no success/private projection precedes commit.
- Run direct/Cloudflare/Mac path, independent-ticket issuance, serial failover without duplicate actions, network switch, hostile signaling, replayed invitation, and reconnect tests.
- Run actual iOS/iPadOS, Android, desktop, tablet, and selected TV matrices.
- Exercise same-device host-player join, all three host-device views, private-card DOM isolation, refresh recovery, and iOS/iPadOS foreground/background behavior.
- Airplane acceptance requires WAN removed, `iceServers` empty, 2–10 player seats plus the host and at least one Public Table device, two-way QR, client-isolation failure, refresh recovery, version mismatch, and observed zero external requests.
- Complete the Phase 1 Card Privacy Red Team before release.

## Out of Scope

Digital betting/accounting, real money, remote-first human play, tournaments, variants, multiple tables per Trusted Host, skins, AI Players, automatic host migration, typed-code/file bootstrap, Bluetooth dependency, and Mental Poker.

## Further Notes

China readiness, standalone browser support, storage-key protection, and compromise resistance remain Test Gates—not release claims. Interaction timing and exact button placement remain soft-set until prototypes validate the minimal surface.
