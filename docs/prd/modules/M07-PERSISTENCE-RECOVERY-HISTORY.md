---
id: PRD-M07
kind: module
status: current
last_reconciled: 2026-08-14
decision_ids:
  - AUTH-HOST-DEATH
  - AUTHORITY-PERSIST-BEFORE-ACK
  - RECOVERY-PLAYER
  - RECOVERY-DISCONNECT-SIT-OUT
  - RECOVERY-HOST-REFRESH
  - BACKUP-HAND-END
  - BACKUP-NO-BATTERY
  - KEY-SEPARATION-RECOVERY
  - CORRECTION-LIVE-EVENTS
  - TEST-HOST-EXCLUSIVITY
  - TEST-STORAGE-KEYS
  - TEST-CORRECTION-REPLAY
router: ../manifest.yaml
---

# M07 — Persistence, Recovery, and History

## Context capsule

This module provides atomic local commit, deterministic replay, player/host recovery, optional opaque hand-end checkpoints, and privacy-filtered histories. Its interface commits one accepted transition with custody/revision/idempotency state and restores only a verified authoritative state. A snapshot accelerates replay; it never replaces event authority.

## Problem Statement

Browsers freeze, discard tabs, lose power, exhaust storage, and retry messages. If acknowledgment precedes durable state or recovery creates a second host, cards/actions can disappear, duplicate, or diverge. Cloud backup also risks preserving private cards longer than needed.

## Solution and Interface

Expose an atomic `commit accepted transition`, `load latest valid state`, `replay and verify`, and `write/read/export checkpoint` contract independent of storage technology. Player Seat Credentials and host authority recovery use separate paths. Every artifact declares table, hand, revision, epoch, rules/build version, integrity, and privacy class.

### Owns

- Atomic local events/custody/revision/idempotency receipts.
- Snapshots, deterministic replay, state digests, migration/version checks, and quota policy.
- Player resume data and same-browser exclusive host recovery.
- Optional encrypted completed-hand checkpoint and manual Save Log/export.
- Phase 2 public/personal histories and retention/export mechanisms.

### Does not own

- Transition legality ([M01](M01-GAME-CORE.md)).
- Card filtering/key policy ([M02](M02-CARD-CUSTODY-PRIVACY.md)).
- Credential authority ([M03](M03-IDENTITY-SEATS-CAPABILITIES.md)).
- Diagnostic retention ([M08](M08-DIAGNOSTICS-RED-TEAM.md)).

## User Stories

1. As a player, I want refresh/power loss to restore my current seat when my credential survives.
2. As a table, we want acknowledged actions never to vanish after a crash.
3. As a host, I want same-browser recovery to resume only one authority.
4. As a group, we accept that permanent host loss may end Phase 1 rather than risking two hosts.
5. As a host, I want optional encrypted hand-end backup and a visible remote-verified receipt.
6. As a troubleshooter, I want a manual Save Log even when no server is configured.
7. As a Phase 2 player, I want a public history plus a personal history that includes only my own private cards.

## Implementation Decisions

- Persist before acknowledgment/projection. On transaction/quota failure, reject and pause at the last committed revision.
- Stable command IDs return stored receipts on retry. Stale revision/epoch commands resynchronize instead of applying.
- Host recovery proves exclusivity, loads a valid snapshot, replays later events through the same reducer, and compares state digest. Uncertain exclusivity, corruption, missing custody, or unsupported version fails closed.
- Remote success appears only after exact server acknowledgment and ciphertext hash; distinguish local saved, remote pending, and remote verified.
- Completed-hand remote checkpoints strip folded/unrevealed cards, legacy-mucked cards, and active custody material. Recovery secret is separate from storage.
- Authenticated liveness probes and their retry counters are non-authoritative
  transient state: they do not write recovery, change a seat, or alter the
  authoritative event history. A genuine reconnect, disconnect, or accepted
  command retains its existing durable semantics.
- Diagnostic storage has a separate quota and may evict before authoritative recovery data.

## Testing Decisions

Fault every transaction boundary, ack race, quota exhaustion, browser freeze/discard, duplicate/reorder, snapshot point, stale checkpoint, corrupted/missing key, two-host resume, version migration, and remote timeout. Replay from genesis and every snapshot. Verify privacy class and secret scans for every export. Test replacement-device revocation and disconnect-through-hand-end sit-out. Verify that liveness-only traffic leaves recovery revision and authoritative state unchanged.

## Out of Scope

Guaranteed recovery after permanent host loss, server-held decryption keys, account-bound histories, silent rollback, and Phase 2 retention policy before its gate.

## Further Notes

Battery signals may produce warnings but never determine backup correctness. Active-hand custody recovery remains local in Phase 1; future cross-device host recovery is a separate authority/security decision.
