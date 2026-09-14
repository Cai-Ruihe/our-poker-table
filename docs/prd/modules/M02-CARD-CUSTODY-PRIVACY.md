---
id: PRD-M02
kind: module
status: current
last_reconciled: 2026-09-14
decision_ids:
  - GOV-PRIORITY
  - AUTH-TRUSTED-HOST
  - AUTH-FUTURE-MENTAL-POKER
  - KEY-SEPARATION-RECOVERY
  - SHOW-IRREVERSIBLE
  - SHOWDOWN-CONCEDE
  - CORRECTION-DEAL-REPAIR
  - PRIVACY-PROJECTIONS
  - PRIVACY-TRUST-CLAIM
  - TEST-STORAGE-KEYS
  - TEST-REMOTE-COMPROMISE
  - TEST-MENTAL-POKER
router: ../manifest.yaml
---

# M02 — Card Custody and Privacy

## Context capsule

This module owns the shuffled deck, Hidden Card State, private delivery, reveal, and authority-side projections. Its small interface lets the Game Core request deal/reveal operations and lets callers request a projection for one role. It must keep cards out of public/control/diagnostic/other-seat data, while honestly treating the active Trusted Host as able to read the deck.

## Problem Statement

Transport encryption and UI hiding do not prevent card leaks if the host sends one oversized state object, stores secrets beside ciphertext, logs arbitrary objects, or runs compromised same-origin code. Privacy must be structural at the point where state is created.

## Solution and Interface

The interface provides custody initialization under a Rules Profile, deterministic deck progression from secure randomness, card operations authorized by Game Core transitions validated for the same atomic commit, and filtered projections for `seat`, `public`, `control`, and `diagnostic` roles. It exports only explicitly permitted recovery/history artifacts.

### Owns

- CSPRNG shuffle and deck/custody lifecycle.
- Per-seat private envelopes and public reveal facts.
- Irreversible exposure tracking and role-filtered projections.
- Purpose-separated custody, envelope, vault, and recovery keys.
- Replaceable future `CardCustody` seam for Mental Poker.

### Does not own

- Poker transition legality ([M01](M01-GAME-CORE.md)).
- Seat/capability issuance ([M03](M03-IDENTITY-SEATS-CAPABILITIES.md)).
- Transport encryption/routes ([M04](M04-CONNECTIVITY-SERVICE.md)).
- Durable persistence technology ([M07](M07-PERSISTENCE-RECOVERY-HISTORY.md)).

## User Stories

1. As a player, I want only my hole cards delivered to my private seat.
2. As a spectator/controller, I want useful table state without any hidden cards.
3. As a player who shows, I expect that exposure to remain public for the hand even if I flip my own screen down.
4. As a player who folds, I expect my cards never to appear in public history or completed-hand cloud backup.
5. As a deployer, I want relay/checkpoint administrators unable to decrypt card state.
6. As a future maintainer, I want Mental Poker replaceable without rewriting Game Core or UI.

## Implementation Decisions

- Generate projections from authoritative state; never send whole state and hide fields in CSS.
- Keep Hidden Card State out of DOM, generic application stores, URLs, analytics, crash text, and skin inputs. A dedicated worker/vault may reduce accidental exposure but cannot defeat host control.
- Digital Chips permits deliberate own-seat Show after betting closes and before settlement confirmation. Folded seats remain private; proposals reveal contested-pot winners, while an uncontested winner chooses whether to show. Recovery preserves this choice for older synthetic muck labels.
- Public Show is irreversible. A prematurely exposed community card remains recorded as exposed even when the rules repair/redeal the street.
- Completed-hand remote checkpoints remove folded/unrevealed cards, legacy-mucked cards, and finished shuffle/key material before encryption.
- The Connection Service receives no card keys. Recovery material is generated/exported separately from remote ciphertext.
- Static HTML contains no live secret. Same-origin/extension/OS compromise remains outside the Phase 1 protection claim.

## Testing Decisions

Use projection contracts and adversarial secret scans as the primary seams. For every state/event, assert exactly which fields each role receives. Test malicious names/skins/messages, wrong role, stale/replayed envelopes, key loss/rotation, checkpoint inspection, logs/crash dumps, and exposed-card repair. The Card Privacy Red Team must attempt host-page injection, dependency substitution, malicious peer payloads, and storage theft.

## Out of Scope

Protection from an actively malicious Trusted Host, quantified penetration claims before code exists, provider-side AI privacy, and a chosen Mental Poker protocol.

## Further Notes

Encryption protects transport/storage boundaries only when keys remain separate. It does not make data secret from code that must decrypt it on the active host.
