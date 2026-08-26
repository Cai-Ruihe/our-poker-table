# ADR-0006: Standalone Airplane Mode

- **Status:** Accepted
- **Date:** 2026-08-14
- **Decider:** Project Owner
- **Scope:** Phase 1; M04, M05, M09
- **Decision IDs:** `NET-AIRPLANE`, `JOIN-MANUAL-CODE`, `NET-BLUETOOTH`, `TEST-IOS-STANDALONE`

## Context

The game needs a worst-case path on an airplane or where internet services are unreachable. Participants can connect to the same private Wi-Fi/hotspot, but no web server, public signaling, SMS, file transfer, account, or Bluetooth Web API can be assumed.

## Evidence

### Facts

- Once devices share a non-isolating local network, local peer data paths may be possible without internet, subject to browser behavior and bootstrap exchange.
- A standalone browser artifact can package application assets but browser support for file loading, camera access, storage, backgrounding, and local connectivity varies by device.
- One QR code can carry one side's connection description; a two-way exchange can complete local pairing without a signaling server.

### Inference

A preloaded artifact plus two-way on-screen QR exchange is a more universal near-term bootstrap than relying on browser Bluetooth or awkward typed descriptions.

### Unknowns

iOS/iPadOS file origins, camera permissions, storage durability, multi-peer scaling, hotspot isolation, and TV-browser behavior require device tests.

## Decision

Ship an immutable, self-contained Airplane Mode artifact that is downloaded before travel. Devices join the same trusted, non-isolating local Wi-Fi/hotspot and exchange bootstrap data through two-way QR scanning. It uses the same Game Core, Card Custody, protocol, and presentation modules as Table-side Mode through different adapters. No external service is required during play.

## Consequences

Airplane play does not depend on public networks or the owner's infrastructure. Pairing is more deliberate than Table-side Mode, every device must have a compatible artifact, and unsupported browser/security policies may prevent operation. Manual typed code, connection files, and Bluetooth remain deferred rather than crowding the main design.

## Alternatives considered

- **Single hosted join URL:** unavailable without a reachable signaling path.
- **Six-digit connection description:** too little entropy/capacity for a complete secure two-way bootstrap without another service.
- **Bluetooth first:** deferred because web Bluetooth and background support are not universal, especially across iOS/TV browsers.
- **Bundled native app:** conflicts with the universal browser objective.

## Security and privacy effect

Local-network presence is not authorization. QR payloads must bind table, host key, role, protocol, expiry, and nonce; Seat Credentials protect reconnection. The hotspot can observe metadata but not hidden-card plaintext.

## Validation and revisit trigger

Run the complete journey on the supported iOS/iPadOS, Android, desktop, and tablet matrix with no internet; test hostile peers, replayed QR data, hotspot client isolation, refresh/resume, and incompatible artifacts. Revisit bootstrap only after measured failures show that an additional path materially improves support.
