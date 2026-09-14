# Phase 2 hosted preview

The owner authorized publishing a testable Phase 2 preview to GitHub and
`https://ourpokertable.com/multiplayer/` on 2026-09-14. This authorizes this
preview publication; it is not a claim that the complete Phase 2 roadmap or
physical-device qualification is finished.

## User-facing scope

The separate entry defaults to Digital Chips and identifies itself as a
preview. The feedback candidate (`0.2.0-preview.2`) adds consecutive hands with
the same seats after explicit settlement confirmation, host-controlled top-ups
between hands, remaining chips on every seat in both views, an acting-seat cue,
and a pot immediately below the community cards. The Digital Tablet controls
follow settlement instead of sending physical-chip end-hand/street commands.

Top-ups require a positive whole play-chip amount, review, and confirmation.
They cannot occur during a hand. An immediate reload after busting is allowed
before missing a deal; returning after a skipped deal, late joins, and manual
sit-out/return remain unavailable pending blind-aware re-entry. Corrections,
history export, and broader remote/physical-device qualification remain unfinished.
Chips have no monetary value.

The new preview uses a new build identity. Existing preview-1 tables/invitations
are not migrated across this version boundary. Finish the old test hand before
refreshing, then create a fresh table at `/multiplayer/`. Retained Phase 1 tables
and files are independent.

## Publication state

Preview 1 at source `1174e12f2a94d262e25ce115ec67ab7075617c72` passed
[GitHub CI and deployment](https://github.com/Cai-Ruihe/our-poker-table/actions/runs/34808835593).
The feedback candidate remains under verification until its own release evidence
below is complete; the old release's checks are not evidence for the new changes.

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
legacy private service directory; the operations guide incorrectly named a
`table-side-service` directory and has been corrected. No token rotation or
relay change was performed. The prior preview subsequently passed GitHub CI and live three-context consumer checks.
These are historical preview-1 results; preview-2 checks are recorded separately.
The publish worktree is `/Users/ruihecai/Developer/html-poker-phase2-release`.
The original dirty development workspace has been preserved; unrelated local
Codex media-management files are excluded from this publication.

## Feedback candidate verification

Local candidate checks on 2026-09-14:

- `pnpm check`: passed, 135 contract tests and 19 relay tests.
- Coverage thresholds passed: 88.03% statements, 84.64% branches.
- Production dependency audit: no known vulnerabilities.
- Six packaged journeys passed across desktop Chromium, mobile Chromium, and
  mobile WebKit. The feedback journey includes an encrypted runtime-record
  rollback at the first-deal commit boundary, a real old invitation delivered
  while authority recovery is suspended, locked roster recovery, chip/actor
  visibility, pot geometry, explicit settlement, top-up, reload, and next hand.
- Core regression verifies three hands with Alice → Bob → Alice dealer rotation,
  fresh custody, stale-hand rejection, atomic/idempotent top-up, numeric bounds,
  immediate reload, and rejected return after a missed deal.
- Independent review identified dealer rotation and stale join-window recovery;
  both received fixes and the targeted regression checks above. Inbound requests
  now wait until recovery reconciliation finishes, and failed initialization
  closes the endpoint without processing queued requests.
- The master visually inspected desktop and mobile table/player views.
- CSS grew from 99,978 to 102,696 raw bytes for the requested feedback UI. The
  enforced budget is now 103,500 bytes (804 bytes of headroom); JavaScript and
  standalone-artifact budgets remain unchanged. The hosted Phase 1 artifact is
  still the pinned retained archive, not this rebuilt development output.
- Exact-origin relay checks, private token acceptance and an actual WebSocket
  round trip passed. No credentials were printed or rotated.

GitHub CI/deployment and live consumer read-back must pass for this candidate
before a publication claim. The final source and hosted outcome will be linked
from the GitHub `v0.2.0-preview.2` release; local tests alone are not that claim.
See [the feedback ledger](../quality/PHASE-2-FEEDBACK.md) and
[research-backed PRD audit](../research/PHASE-2-PRD-CLARITY-AUDIT-2026-09-14.md).
