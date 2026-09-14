# Phase 2 hosted preview

The owner authorized publishing a testable Phase 2 preview to GitHub and
`https://ourpokertable.com/multiplayer/` on 2026-09-14. This authorizes this
preview publication; it is not a claim that the complete Phase 2 roadmap or
physical-device qualification is finished.

## User-facing scope

The separate entry defaults to Digital Chips and identifies itself as a
preview. It supports the implemented single-hand no-limit play-chip flow,
including betting, all-ins, side pots, and explicit settlement confirmation.
Create a fresh table to test another hand. Multi-hand sessions, top-ups,
re-entry, correction/history export, and broader remote/physical-device
qualification remain unfinished. Chips have no monetary value.

## Retained Phase 1

The live Phase 1 manifest identifies source
`39d860db04d481fd16584672746cbf70fce47fc7`, build `0.1.6`, protocol `2`.
Its original GitHub Actions artifact had expired. The existing deployed files
were therefore captured directly: all 115 files listed by the live Phase 1
manifest passed their SHA-256 checks; the root, manifest, and introduction
files bring the retained inventory to 158 files. The retained GitHub release
asset digest was read back after upload.

`deploy/phase-channels.json` pins the retained archive and Phase 2 identity;
`deploy/phase1-retained-files.json` records each retained file's exact bytes.
The assembler verifies the archive before extraction and the full inventory
before and after copying the new Phase 2 folder. It fails on a missing or
modified retained file, unexpected file, symlink, or incorrect Phase 2 bundle.
The root, `/intro/`, `/table-side/`, the Airplane file, and Phase 1 manifest
remain selected from the retained archive. Neither Phase 1 client storage nor
its deployed relay is migrated by this release.

## Release and rollback

The existing CI verification job remains required before deployment. The
deployment job builds/configures only the new `/multiplayer/` bundle, downloads
the digest-pinned retained archive, assembles both phases, and tests the actual
packaged paths before uploading the Pages artifact. Each new phase artifact
receives a `multiplayer/release-manifest.json` with its source revision and
file hashes.

Before the first preview, rollback means redeploying the retained Phase 1
archive alone, removing the new preview path without changing Phase 1 files.
For subsequent previews, retain the preceding successful Pages artifact and
select its Phase 2 files alongside the same Phase 1 pin. Stop/roll back if
consumer read-back differs from either selected manifest, Phase 1 recovery
changes, or a cross-phase join accesses another phase's private state.

No future Phase 1 promotion is implied by a main-branch Phase 2 update. To
release a new Phase 1 version, explicitly select a separately verified
artifact and update its pin; never silently rebuild it from current source.

## Evidence status

Local verification passed: 124 contract tests, 19 relay tests, type checking,
formatting, documentation checks, production build, performance budgets, and
dependency audit. Core coverage is 87.59% statements and 83.75% branches.
The packaged release passed six journeys across desktop Chromium, mobile
Chromium, and mobile WebKit, covering independent phase recovery, cross-phase
invitation rejection, betting, and settlement recovery. These local journeys
use the browser channel; they do not attest the live relay. The mobile preview
homepage was also visually inspected.

The public live-relay probe passed health, origin, and invalid-token checks.
The private positive-token gate also passed token acceptance and an actual
WebSocket round trip on 2026-09-14. The existing token was found under the
legacy `normal-service` directory; the operations guide incorrectly named a
`table-side-service` directory and has been corrected. No token rotation or
relay change was performed. GitHub CI and live Phase 2 consumer verification remain pending;
this record does not claim Phase 2 is deployed.
The publish worktree is `/Users/ruihecai/Developer/html-poker-phase2-release`.
The original dirty development workspace has been preserved; unrelated local
Codex media-management files are excluded from this publication.
