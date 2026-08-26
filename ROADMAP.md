# Roadmap

This roadmap is ordered by capability and evidence gates, not calendar dates. A phase is complete only when its specified journeys and security gates pass on the supported device/browser/network matrix.

## Foundation — public repository and field build established; release gates remain

- Established modular product requirements, decision history, architecture records, contribution policy, governance, security policy, and release gates.
- Selected the strict TypeScript browser monorepo, browser baseline, test toolchain, and static Table-side build in [ADR-0007](docs/adr/0007-typescript-browser-monorepo-toolchain.md).
- Added locked dependencies, automated documentation checks, contract tests, real-browser journey tests, and a clean-build CI workflow.
- The canonical public project is **Our Poker Table** at [`Cai-Ruihe/our-poker-table`](https://github.com/Cai-Ruihe/our-poker-table), with production field builds at `https://ourpokertable.com/` and `/table-side/`. The local `html-poker-app` workspace and `@html-poker/*` package/protocol names deliberately remain compatibility identifiers.
- The repository/Pages rename is not an application release. Branch protection, release signing, a candidate-matched deployed manifest, physical/network qualification, and Official Release approval remain separate gates.

## Phase 1 — Trusted-Host dealer (local release candidate; external gates open)

Implemented locally with automated evidence:

- enforce two-to-ten seat capacity; issue/revoke/recover table-scoped credentials; and deny copied-seat tabs;
- deliver private hole-card/public projections across host, Player, Tablet Control, TV, and Public Table roles;
- support fold/undo/show/muck, streets, guarded end/next hand, seat reorder/replacement/dealer relocation, void/correction, and disconnect-to-sit-out;
- atomically persist authority state, validate deterministic same-browser host replay, and preserve encrypted player recovery;
- use direct WebRTC after relay signaling, operator-owned relay fallback with scoped/renewable tickets, and host-approved reverse TV/Public Table pairing; and
- build a standalone `file://` Airplane artifact with two-way QR pairing, no external requests, empty ICE-server list, and local direct-WebRTC test evidence.

The local candidate is not a release. Base external gates include hidden-card red teaming, actual device/browser coverage, WAN-removed Airplane tests, 2–10 physical devices plus public display, client-isolation checks, host/relay failure and network-switch tests, dependency/release signing review, and private disclosure-channel setup. Measured operation on representative mainland-China networks is a separate gate for “China-ready” and equivalent claims; it is currently unverified.

## Phase 2 — optional digital play-chip accounting

- Optional stacks, buy-ins, action timing, legal-action prompts, main/side pots, settlement confirmation, and correction events.
- Machine-readable hand histories and player/table summaries without exposing mucked or unrevealed cards.
- Remote Public Table View for people who cannot see the physical display.
- Revisit full remote human play only through pivot research because it changes latency, collusion, supervision, and continuity assumptions.

Release gates include property-based chip conservation, side-pot and all-in edge cases, explicit settlement confirmation, disconnect timing, privacy-safe export, and replay equivalence.

## Phase 3 — skins and AI training seats

- Validated, data-only community skins with replaceable cards, table styling, typography, and sound references.
- A provider-neutral SeatController interface for human and AI seats.
- Optional user-supplied API adapters and officially permitted local/subscription tooling adapters.
- Isolated AI Gateway on the user's own machine; AI remains optional and cannot receive other seats' private cards.
- Multiple AI play styles and reproducible training sessions where provider terms and privacy allow.
- A provider-neutral GTO Solver Adapter that supplies a truthfully labeled baseline before style-adjusted AI decisions.
- Post-hand replay/download showing the table timeline, solver result or unavailable status, style adjustment, bounded AI consideration note, and final action without exposing protected cards.

Release gates include non-executable skin validation, asset-rights review, accessibility and performance checks, AI prompt/projection isolation, provider failure behavior, cost disclosure, solver licence/accuracy/coverage evidence, deterministic privacy-safe replay/export, and proof that the base human game remains independent of AI.

## Recorded options, not scheduled commitments

- distributed Mental Poker to reduce trust in the host;
- automatic host migration;
- remote-first human games;
- tournaments and multi-table orchestration;
- multiple boards, additional betting structures, and other poker variants; and
- optional Bluetooth-assisted bootstrap where web-platform support becomes adequate.

These options reserve architectural seams. They must not appear as half-implemented production flags.
