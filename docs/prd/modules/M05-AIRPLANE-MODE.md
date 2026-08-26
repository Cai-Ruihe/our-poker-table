---
id: PRD-M05
kind: module
status: current
last_reconciled: 2026-08-14
decision_ids:
  - PHASE1-TABLE-SIZE
  - GOV-PRIORITY
  - NET-BLUETOOTH
  - JOIN-MANUAL-CODE
  - NET-AIRPLANE
  - UI-LOCALIZATION
  - NET-CHINA
  - NET-VERSION
  - HOST-CAPABILITY-PREFLIGHT
  - TEST-IOS-STANDALONE
  - TEST-TV-BROWSERS
  - TEST-WEBRTC-STAGING
router: ../manifest.yaml
---

# M05 — Airplane Mode

## Context capsule

Airplane Mode packages the same Phase 1 core as one preloaded standalone HTML artifact per device. Peers connect over private, non-isolating local Wi-Fi with two-way on-screen QR and direct local WebRTC, using no signaling, STUN, TURN, analytics, fonts, or other internet resource. It is the worst-case China/travel fallback, not a promise about every hotspot or browser.

## Problem Statement

Table-side web delivery and signaling can fail on aircraft, during travel, behind restrictive networks, or when private/cloud services are unreachable. A cached web app is insufficient if joining still needs a server or runtime assets.

## Solution and Interface

The module supplies a self-contained release artifact and a local pairing adapter that exchanges authenticated offer/answer payloads through two-way QR. It satisfies the same transport interface as Table-side Mode and exposes capability diagnostics before a table starts.

### Owns

- `poker-airplane.html` packaging contract and visible build identity/age.
- Two-way on-screen QR offer/answer exchange.
- Local WebRTC with no external ICE servers.
- Hotspot/client-isolation diagnostics and zero-external-request acceptance.
- Offline version compatibility and pre-travel verification guidance.

### Does not own

- Poker behavior ([M01](M01-GAME-CORE.md)).
- General Table-side Mode routing ([M04](M04-CONNECTIVITY-SERVICE.md)).
- Release signing/provenance ([M09](M09-RELEASE-DISTRIBUTION.md)).
- Typed-code, file-transfer, Bluetooth, or OS sharing paths.

## User Stories

1. As a traveler, I want to open a previously downloaded file with no internet.
2. As a host, I want another device to join through QR without typing long network data.
3. As a player, I want the same seat/privacy/interaction behavior as Table-side Mode.
4. As a group, we want a clear diagnosis when hotspot client isolation blocks peer traffic.
5. As a maintainer, I want mixed/incompatible files rejected before private delivery.
6. As a privacy reviewer, I want observed proof of zero external requests.

## Implementation Decisions

- Airplane and Table-side Modes share domain modules; only delivery/bootstrap/transport adapters change.
- Current initial bootstrap is two-way QR. Manual codes, pairing files, and copy/paste are deferred; Bluetooth is future-only.
- Pairing data binds format/protocol, table, authenticated host key, authority epoch, role, nonce, creation time, and expiry. Stale/replayed/wrong-host payloads fail before seat recovery.
- The artifact contains all runtime code/assets and never self-updates or expires online. Update it before travel; pin it during play.
- Airplane pairing may need one device to display while another scans in each direction; unsupported camera/display combinations fail clearly.
- Airplane shares the product's English/Simplified-Chinese presentation and
  device-local language override. Locale storage, Host defaults, and translated
  copy must remain entirely inside the artifact and may not create an online
  request, relay requirement, or pairing-field change.

## Testing Decisions

Run from the actual downloaded file—not a development server—on target iOS/iPadOS, Android, macOS, Windows, tablets, and selected TVs. Disable WAN, use `iceServers: []`, inspect network traffic, pair 2–10 player seats plus the host and at least one Public Table device, deny camera, enable client isolation, refresh/re-pair a player, test stale/wrong/mixed-version QR, background/freeze tabs, and import local host recovery where supported. Verify English/Simplified-Chinese switching and local override without an external request or changed pairing payload. Record the support matrix; do not generalize from one device.

## Out of Scope

Universal aircraft Wi-Fi support, online app delivery, cloud relay, typed six-digit exchange, file/AirDrop import, required Bluetooth, and automatic host migration.

## Further Notes

Airplane Mode is a release-blocking Phase 1 requirement. If the minimum support matrix cannot satisfy it, that failed Test Gate—not a preference interview—must drive a scoped product decision.
