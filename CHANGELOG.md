# Changelog

All notable project changes will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and released versions will follow [Semantic Versioning](https://semver.org/) once a public application release exists.

## [Unreleased]

### Fixed

- Preserved the full Tablet community-card geometry at showdown, kept revealed
  player cards at their physical seats, enlarged those cards for the table,
  and moved the best-five explanation directly beneath the unchanged board.
- Made quiet-table status symbols seat-facing rather than counter-rotated for
  a screen spectator; corrected fullscreen-only iPad corner clearance, edge
  flush controls, and close-glyph centering.
- Forced the warm card system and diagnostics to retain the chosen table theme
  instead of accepting browser/OS dark-mode recolouring, and versioned the
  opaque iOS Home Screen icon URL so repaired shortcuts fetch a new source.

- Replaced browser-native Table-side Mode network errors with actionable relay recovery guidance, and blocked configured Pages publication when the selected relay fails DNS, health, exact-origin CORS, or invalid-token rejection checks.
- Rebuilt the approved Tablet quick controls with the exact short custom slider, continuous four-pixel gold thread, equal four-corner orientation, and centered complete secondary panel; removed the native-range artifact and incomplete strip that escaped the earlier interaction-only gate.
- Connected Tablet **Players & seats** and **Displays & pairing** to the real host administration surface and added a machine-enforced action inventory whose journeys invoke every available secondary action and assert its result.
- Added automatic player catch-up for new hands, an explicit refresh fallback, return-from-sit-out, and permanent credential-revoking leave; corrected the hand-end synchronization bug that could silently cancel a player's return choice.
- Prevented compact shown cards from overlapping on phones and marked the exact winning best five while unused cards recede.

- Reconnected configured host relay sockets and authenticated Player, Tablet,
  TV, and Public Table projections on foreground/online return; retained an
  explicit **Reconnect to table** fallback without claiming iOS background
  execution.
- Removed Host toolbar and administration-drawer overlaps that blocked dealer
  and close actions on iPhone-sized WebKit viewports.
- Replaced the generic Table-side Mode route failure with restart-aware instructions, and added a regression that refreshes the host's relay ticket and joins through the regenerated invitation after an in-memory Connection Service restart.
- Replaced the iPhone-only slide-to-peek gesture—which could accidentally publish a hand—with a one-tap **Reveal my cards privately** control, automatic cover on visibility loss, and a separate **Show cards to table** action.
- Serialized client recovery commits so overlapping table updates and `pagehide` cannot race into `Client recovery commit failed: revision-conflict`.
- Preserved a live client endpoint across restorable `pagehide` events and reconnect presence on `pageshow`, instead of converting every temporary mobile suspension into a forced disconnect.
- Removed unexplained red start-screen, board-rail, and moving cut-card ornaments that encoded no game state.
- Made dense Airplane offer QRs easier to scan with a one-click full-screen view, higher-resolution camera requests, and an independent bundled live-frame decoder fallback.
- Made the enlarged Airplane QR explicitly direct phones to the poker app's in-page scanner and reject the standalone Camera path that cannot interpret encrypted WebRTC offers.

### Changed

- Bumped the visible Phase 1 build identity to `0.1.5-phase1` for the
  fullscreen/tablet correction release.

- Adopted **Our Poker Table** as the canonical public product identity and migrated the public repository and GitHub Pages project-site routes to `Cai-Ruihe/our-poker-table`. The durable local `html-poker-app` workspace, root npm identifier, `@html-poker/*` package namespace, and protocol identifiers remain unchanged for compatibility.
- Recorded that the naming/route migration is not an application release: at migration read-back the renamed Pages route still served `0.1.3-phase1` from source revision `07cf6ede1fa1ddd4eda09059cfd3d64018cde297`.
- Bumped the visible Phase 1 build identity to `0.1.4-phase1` for the corrective UI, lifecycle, and QA release.

- Applied the approved dark-first visual system across Player, Host, Tablet,
  TV, and Public Table surfaces: synchronized Dark Green, Black Gold, and Deep
  Navy themes; dimensional old-school cards; quiet seat-state markers; and
  compact in-header Host tools.
- Kept the incomplete Digital Chips tracer behind the explicit
  `?experimental=digital-chips` development route so the default party path
  remains Phase 1 physical chips.
- Bumped the visible Phase 1 build identity to `0.1.3-phase1` and protocol 2 for
  synchronized theme state and incompatible-invitation rejection.
- Simplified the player decision surface to **Fold** or **Show cards to table**. The legacy Muck event remains replayable for older encrypted recovery state but is no longer emitted by current clients.
- Made the same-device host path explicit with **Join my own table on this device** and labeled ordinary player invitations for other devices only.
- Bumped the visible Phase 1 build identity to `0.1.2-phase1` so older table invitations fail compatibility checks instead of silently mixing the two player-decision interfaces.
- Bumped the visible Phase 1 build identity to `0.1.1-phase1`, added best-effort active-table screen wake locks, and verified Airplane replacement of a closed phone into the same active seat and cards.
- Added an owner-authorized GitHub Pages field-build deployment that runs only after the complete CI and browser journey gate succeeds.
- Added a CI-packaged `/table-side/` field build whose deploy-time configuration requires one exact WSS service origin and narrows browser connections to that origin.

### Added

- Added a fork-safe Table-side Mode self-hosting kit: locked multi-stage Connection Service image, hardened loopback-only Compose recipe, file-mounted private operator token, non-overwriting token generator, live relay doctor, deployed-config read-back, and symptom-based operator runbook.
- Added the repository-owned QA registry, feedback ledger, corrective specification, physical-device matrix, deterministic visual baselines, exact geometry checks, responsive/text-size checks, artifact performance budgets, and release-blocking Chromium/Mobile WebKit journeys.

- Added four equal Tablet corner entries, orientation-correct upper controls, a
  large Next card action, short guarded Next hand slider, and centered secondary
  controls that auto-dismiss after acknowledged play actions.
- Added repeatable cross-mode render capture hooks and Chromium/Mobile WebKit
  journeys for theme synchronization, dimensional cards, Tablet equality,
  touch-target access, and foreground Tablet catch-up.
- Added a single-page host-device flow: **Join my own table on this device** redeems an ordinary Player credential, then **Host Controls**, **My Hand**, and **Table View** switch among authority, private, and public projections without relying on a background iOS tab.
- Began Phase 2 with an optional Digital Chips profile: a deep accounting module, exact seat-private actions, betting-driven street progression, derived settlement proposals, host-confirmed balance updates, encrypted recovery, and a two-player browser tracer. This is development scope, not a Phase 2 release claim.
- Complete Phase 1 trusted-host dealer slice: two-to-ten seat capabilities, one-use/revocable invitations, Player/TV/Public Table/Tablet projections, hand lifecycle controls, seat replacement/reorder/dealer relocation, void/correction records, encrypted recovery, and redacted diagnostics.
- Table-side Mode route implementation with local browser channel, direct WebRTC after private signaling, card-blind private relay fallback, table-scoped four-hour relay tickets, host-side ticket renewal, and host-approved reverse display pairing.
- Standalone Airplane Mode artifact with fully bundled assets, restrictive offline CSP, two-way QR offer/answer pairing, local `iceServers: []` WebRTC, native saved-image detection plus bundled ZXing/jsQR fallbacks, and artifact request regression coverage.
- Phase 1 operations, runtime architecture, automated privacy-red-team, and local release-candidate records that distinguish demonstrated local evidence from device/network/release gates.
- Release provenance tooling for two-build artifact-digest reproducibility checks and a clean-worktree SHA-256 manifest.
- Modular Master, phase, and module PRD system with a machine-readable context manifest.
- Decision register, glossary, evidence index, and reusable PRD templates.
- Open-source contribution, security, governance, conduct, architecture-decision, quality, and release documentation.
- Deferred Phase 3 GTO-guided AI Trainer, style-transformation trace, and privacy-safe post-hand replay/export requirements.
- Strict TypeScript pnpm workspace with React, Vite, Vitest, Playwright, ESLint, Prettier, locked dependencies, and continuous-integration checks.
- Phase 1 local create/deal/show/end tracer slice with Web Crypto shuffling, role projections, typed command receipts, command idempotency, and persist-before-ack behavior.
- Responsive trusted-host table preview with public and seat-scoped views, bundled fonts, keyboard-visible controls, automated accessibility checks, and public-DOM privacy assertions.
- Automated documentation manifest, link, identifier, relationship, and document-budget validation.
- Workspace-boundary lint rules, peer-dependency checks, production dependency auditing, and weekly Dependabot configuration.
- Immutable commit pins for third-party GitHub Actions used by continuous integration.
- A non-root, health-checked Connection Service container recipe for owner-operated deployments.
- A production-artifact third-party licence bundle covering React and the bundled OFL fonts.

### Security

- Made an unconfigured fork explicitly relay-free and kept each deployer's public endpoint and private operator token isolated from Ruihe's service and repository configuration.
- Replaced static relay credential configuration with URL-only deployment configuration; a host operator token mints a table-scoped ticket locally and is not placed in player links.
- Added encrypted reverse-display pairing responses, relay table/host/protocol binding, relay-ticket expiry/renewal behavior, and browser evidence for direct/relay route behavior.
- Documented the Phase 1 Trusted Host limitation and mandatory Card Privacy Red Team gate.
- Kept custody state out of presentation interfaces and added negative tests for cross-seat and public projection leakage.
- Made custody state opaque outside its owning module, isolated projection arrays from authoritative state, required active Hand IDs on hand-scoped commands, rejected post-completion exposure, and made storage exceptions fail closed.
- Replayed the committed receipt for concurrent retries carrying the same idempotency key.
- Added browser red-team regression coverage for hostile names, cross-seat/public DOM isolation, transient browser storage, and runtime page errors.
- Added a restrictive static Content Security Policy and no-referrer policy for the Table-side preview; deployment headers remain a release concern.
