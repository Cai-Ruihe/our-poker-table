# Multiplayer 0.2.0

## Scope and publication status

This candidate implements the owner-authorized interface and connection feedback
for `/multiplayer/`. Publication uses the existing GitHub Pages workflow after
its checks pass. This record is preparation evidence, not proof of deployment.
The application no longer displays development-phase or preview badges.
Physical-device qualification and complete roadmap delivery remain separate.

## Changes

- Default play chips are 1,000 with 5/10 blinds.
- Table and TV views place street status above community cards and the pot below.
  Contested winners reveal at their seats; fold winners remain private unless
  they choose Show. All-in markers, completed-hand controls, standard cards,
  history filters, secondary menus, icon spacing, and corner branding are fixed.
- Healthy connection checks reuse the socket. Recovery is single-flight, with
  bounded retries and backoff; transient automatic failures stay quiet before
  persistent failure feedback. Manual failure remains visible and actionable.
- Public history download and local replay remain available in secondary menus.
  Never-revealed cards are excluded.

## Verification

The [revision QA record](../quality/PHASE-2-REVISION4-QA.md) inherits the prior
quality checklist and adds feedback-specific regressions. Final local checks
passed with 164 contract/core and 19 relay tests. The inherited browser/security
run passed 249 cases with 80 configured skips; its sole failed menu screenshot
passed after a fix and exact retest without changing the visual baseline.
Packaged three-engine checks passed 44 cases with one configured skip. After
final manual-recovery and completed-control changes, rebuilt targeted checks
passed five cases with one configured skip. Independent Luna review closed
the connection findings. These are local results; cloud checks must independently
pass before deployment.

CSS is 131,017 raw bytes against an explicitly raised 132,000-byte ceiling
(previous ceiling 124,000); this is increased scope, not a performance gain.
Narrow portrait Table/TV layouts intentionally allow vertical scrolling.
Real iOS/Android/TV, representative China networks, long-running live sessions,
release signing, and complete physical qualification have not been established.

## Compatibility and rollback

Finish existing games before refreshing. The new build identity requires a
fresh Multiplayer table; old build invitations are not migrated. Phase 1 remains
selected from `phase1-retained-39d860d`, source
`39d860db04d481fd16584672746cbf70fce47fc7`, archive SHA-256
`bf745d5d243d8a6f4d748aee941ad5b2ffe55890aaf4cfd62577194530583d1f`.
Assembly verifies all 158 retained files before and after adding Multiplayer.
The root, introduction, Table-side, and Airplane routes are unchanged.

The preceding deployed source is
`25213a6ee1f2002fb8cf8691e5580eb7829a590a` (`v0.2.0-preview.3`).
Preserve its deployed artifact before promotion. A rollback selects those
Multiplayer bytes with the same retained Phase 1 pin; it must not mutate an
active table. Final publication evidence must bind the deployed source, build
version, configured relay, and file digests to the successful workflow run.
