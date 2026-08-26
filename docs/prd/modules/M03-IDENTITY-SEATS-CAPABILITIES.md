---
id: PRD-M03
kind: module
status: current
last_reconciled: 2026-08-16
decision_ids:
  - PHASE1-TABLE-SIZE
  - GOV-CUSTOM-HOST
  - GOV-NO-ACCOUNTS
  - AUTH-HOST-CAN-PLAY
  - NET-BOOTSTRAP
  - NET-DISPLAY-REVERSE-QR
  - NET-HOST-KEY-BINDING
  - JOIN-MANUAL-CODE
  - JOIN-WINDOW
  - JOIN-SEAT-CREDENTIAL
  - JOIN-MID-HAND
  - PLAYER-ONE-PRIVATE-CLIENT
  - RECOVERY-PLAYER
  - RECOVERY-DISCONNECT-SIT-OUT
  - MODE-TABLE-CONTROL
  - MODE-HOST-DEVICE-SWITCH
  - SEAT-AUTO-AND-DRAG
  - FOLD-SIT-OUT
router: ../manifest.yaml
---

# M03 — Identity, Seats, and Capabilities

## Context capsule

This module owns account-free, room-scoped identity: invitations, Join Window, Seat Credentials, seat replacement, sit-out state, and role-scoped player/display/control authority. It gives callers an authenticated actor/role without exposing how credentials are represented. Names are presentation only.

## Problem Statement

Account-free joining is simple, but copied URLs, duplicate names, device replacement, public displays, and no-approval dealer controls create security and recovery risks. A single room token would let a display become a player/controller or let an old phone keep a recovered seat.

## Solution and Interface

The interface opens/closes invitation scopes, redeems a one-use invitation into a scoped capability, authenticates a command actor, rotates/revokes a Seat Credential, and returns the current seat/role roster. Every credential is table-, role-, version-, expiry-, and host-key-bound.

### Owns

- Join Window lifecycle and high-entropy invitation redemption.
- Seat Credentials, recovery/replacement rotation, and active-client rule.
- Player, Public Table, TV, Tablet-Control, and host/admin scopes.
- Auto seat assignment, logical seat identity, sit-out/return state, and active connection roster.

### Does not own

- Visual seat placement ([M06](M06-PRESENTATION-INTERACTION.md)).
- Poker legality ([M01](M01-GAME-CORE.md)).
- Signaling/relay transport ([M04](M04-CONNECTIVITY-SERVICE.md)).
- Credential storage implementation ([M07](M07-PERSISTENCE-RECOVERY-HISTORY.md)).

## User Stories

1. As a player, I want to join by QR/full URL without an account.
2. As a host, I want closing the Join Window to invalidate unused invitations.
3. As a returning player, I want the same seat after refresh without relying on my display name.
4. As a player with a replacement phone, I want the host to issue a one-use replacement that revokes the old device.
5. As a display, I want only public state; as a controller, I want dealer controls without cards.
6. As a host-player, I want to take an ordinary player seat on the host device or another device while host authority and my Seat Credential remain separate.
7. As a table, we want disconnected players sitting out for later hands without revealing cards.
8. As a folded player, I want to mark myself sitting out for future hands immediately instead of waiting for the hand to end.
9. As an awkward-input display, I want to show a pairing QR that the host scans instead of typing a full table URL with a TV remote.

## Implementation Decisions

- Possession of an active invitation during the Join Window is the initial approval; do not add per-player prompts.
- New devices joining mid-hand observe/wait until next hand. Existing Seat Credential recovery may restore the current seat.
- One active private browser instance per seat is supported. Replacement revokes/rotates; no account-free system claims one physical human/device or prevents collusion.
- A player who has folded may set future-hand sit-out state immediately; the current hand remains folded and unchanged.
- Public/display capabilities cannot mint or self-upgrade into Table-Control. Control links are powerful short-lived bearer capabilities with roster visibility and immediate revoke/rotate.
- Table-side Mode may reverse the display bootstrap: an untrusted display request shows an ephemeral QR, and an authorized host/admin device scans it to issue only the selected Public, TV, or Table-Control capability. That scan is the bootstrap; mode switching later adds no approval prompt and no stronger authority.
- Join invitations bind the active host key independently of signaling. Typed codes/files remain deferred.
- Joining on the host device redeems the same ordinary one-use Player invitation and creates the same revocable Seat Credential as an external player. The host recovery URL may reference the local player slot, but the credential secret remains in encrypted browser recovery storage.
- Visual `displayPosition` never changes logical seat/dealer/blind order.

## Testing Decisions

Test wrong role/table/host/version, expired/replayed invitations, Join Window closure, duplicate names, reverse-display pairing, copied control link, capability confusion, replacement race, old-device return, simultaneous tabs, seat recovery, new mid-hand join, disconnect through hand end, and same- or separate-device host-player separation. Assert that no capability grants a stronger scope through UI mode switching and that Table View contains no private-card DOM.

## Out of Scope

Accounts, global identities, clubs, anti-collusion identity proof, biometrics/device fingerprinting, persistent social graphs, and automatic host transfer.

## Further Notes

An optional future local profile may remember a display name or personal history, but it cannot become required table identity without reopening `GOV-NO-ACCOUNTS`.
