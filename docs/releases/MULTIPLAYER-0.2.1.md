# Multiplayer 0.2.1

## Scope and publication status

The owner approved local candidate `27aaf49` for publication. This record prepares
its bounded P0/P1 changes and the Phase 2 build identity `0.2.1`; publication,
cloud CI, and deployed read-back are pending. The final publication receipt must
be attached to the future [GitHub v0.2.1 release](https://github.com/Cai-Ruihe/our-poker-table/releases/tag/v0.2.1)
and bind the final source revision, successful workflow run, configured relay,
build version, and deployed file digests. This document does not establish those
external results. Existing Unreleased changelog entries are not included in this
bounded release claim.

## Changes

- Game Core rejects `SetSeatParticipation` for the digital Rules Profile before
  state or receipt persistence, closing the missed-deal return/top-up bypass.
  The guard remains effective after authority recovery. Immediate reload before
  a missed deal and Deal-Only sit-out/return remain supported.
- Six independently hand-derived, frozen accounting vectors cover nested side
  pots, folded dead money, uncalled excess, tied odd-chip order, cumulative short
  all-ins that reopen action, and a single short all-in that does not reopen.
  They check exact contributions, eligibility, proposed awards, unchanged
  pre-confirmation stacks, confirmed final stacks, rejected ineligible winners,
  duplicate confirmation, and conservation at every accepted transition.

Winners are stipulated ranking inputs, not independently evaluated cards. The
fixture preserves the independent author's arithmetic and provenance; expected
values do not come from production accounting. This is a bounded qualification
slice, not complete differential settlement or independent evaluator coverage.
No accounting runtime behavior is changed by the P1 tests.

## Local verification

Before version preparation, candidate `27aaf49` passed 178 contract/core tests
and 19 relay tests. Packaged browser checks passed 44 cases with one configured
skip; source browser checks passed 45 cases. Three isolated accounting mutants
(pot amount, folded eligibility, and odd-chip order) were detected by the frozen
vectors. Independent reviews found no unresolved Critical or Important finding
within the P0/P1 boundary. These are local results; publication CI must pass
independently on the final release revision.

Physical iOS/Android/TV, representative China networks, long-running live
sessions, Airplane qualification, and complete Phase 2 readiness remain outside
this evidence. Late joins, manual sit-out/return, wait-for-big-blind re-entry,
and correction/reopen remain incomplete.

## Compatibility and rollback

Finish existing games before refreshing to `0.2.1`, then create a fresh
Multiplayer table. Old `0.2.0` invitations are rejected and are not migrated.
The protocol remains version 2; Phase 1 build identity remains `0.1.6`.

Phase 1 remains selected from `phase1-retained-39d860d`, source
`39d860db04d481fd16584672746cbf70fce47fc7`, archive SHA-256
`bf745d5d243d8a6f4d748aee941ad5b2ffe55890aaf4cfd62577194530583d1f`.
All Phase 1 fields in `deploy/phase-channels.json` remain unchanged. Preserve the
previous deployed Multiplayer artifact before promotion; rollback selects its
bytes with the same retained Phase 1 pin after active games finish. Final
deployment and rollback receipts belong to the publication record above.
