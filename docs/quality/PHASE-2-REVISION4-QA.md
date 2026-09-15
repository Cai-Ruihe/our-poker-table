# Phase 2 revision 4 QA inheritance and acceptance checklist

**Status:** QA plan and evidence ledger, reconciled 2026-09-15. The revision-4
candidate is active for local QA. It is not a release, support, deployment, or
physical-device qualification claim. The appended current-run evidence table records observed local results. An
unfulfilled physical/deployed gate remains Pending; a prior preview receipt
does not carry forward automatically.

The retained Phase 1 artifact remains independently pinned at its existing
release path. Phase 2 revision 4 uses `/multiplayer/` as its working path. The
two paths, tables, invitations, manifests, storage namespaces, and rollback
receipts must remain independently verifiable.

## Evidence reading rule

**Fact:** The repository QA system requires source traceability, contract and
browser evidence, reviewed visual evidence, accessibility checks, privacy
negative tests, physical-device evidence, and deployed consumer read-back on
their respective surfaces. The round-4 owner feedback is an authorized repair
input, while the supplied round-4 observations are not a replacement for a
fresh candidate receipt.

**Inference:** Revision 4 is a bounded Phase 2 presentation, accounting,
history, and recovery candidate that inherits every Phase 1 release guard. The
new browser journey is an evidence route, not a pass assertion by itself.

**Unknown:** Physical-device qualification, Linux screenshot equivalence,
long-running live relay behavior, new deployed consumer read-back, and consumer
acceptance have not been established by the local revision-4 work. Browser
emulation and local relay receipts do not establish those outcomes.

**Blocker:** Nothing needed from the user for the authorized local repairs.
Formal release qualification remains incomplete until its physical/deployed
evidence exists; this document does not authorize publication.

## Inheritance and route counts

The machine-readable registry is the count authority. This checklist records
the following explicit inventory and routes:

| Inventory                      | Count / route                                                                                             | Current status                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Phase 1 authority documents    | Master PRD, P1 PRD, M01–M09 active module imports                                                         | Inherited; each route remains required                         |
| Stable decision IDs            | 131 in `DECISION-REGISTER.md`, including the 11 revision-4 decisions below                                | Imported by `qa-registry.yaml`; Pending candidate verification |
| Tablet UI IDs                  | 35 from the approved Tablet feedback document                                                             | Inherited through `visual-conformance.spec.ts`                 |
| Field-feedback IDs             | 73 from `FIELD-FEEDBACK-LEDGER.md`                                                                        | Inherited; none deleted or silently waived                     |
| Phase 2/M10 routes             | Contract accounting tests, existing Phase 2 preview journey, and `tests/journey/phase2-revision4.spec.ts` | Active candidate; Pending                                      |
| Cross-module revision-4 routes | M04, M06, M07, M09, physical matrix, registry and release records                                         | Pending; no layer substitutes for another                      |

`active_release: phase-2-revision-4` and `P2`/`M10` lifecycle `active` in the
registry mean that this is the current QA candidate. They do not change the
release-blocking gates or mark any evidence as passed.

## Phase 1 inherited checklist

The following rows are inherited by the Phase 2 candidate. “Pending” is a
deliberate evidence state, not a pass or an assumed failure.

| ID    | Inherited gate                            | Concrete acceptance                                                                                                                                                                                                                                             | Evidence route                                                                        | Status                                       |
| ----- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| I-001 | Traceability and registry completeness    | Every Master/P1/P2 requirement, decision, Tablet UI item, and field-feedback ID has an existing source and evidence route; no stale path or missing import.                                                                                                     | `pnpm qa:registry`; `qa-registry.yaml`; PRD and ledger sources                        | Local route evidence recorded; formal gate remains separate |
| I-002 | Game Core and hand lifecycle              | Legal Phase 1 commands, explicit hand completion, idempotency, revision conflict handling, and no automatic hand end remain valid; Phase 2 commands use the same authority boundary.                                                                            | M01 contract tests; `tests/journey/phase2-preview.spec.ts`; revision-4 journey        | Local route evidence recorded; formal gate remains separate |
| I-003 | Card custody and privacy                  | Private cards remain seat/Trusted-Host scoped; public Table/TV/history projections contain only authorized revealed cards; exports and diagnostics contain no hidden cards, deck order, credentials, or recovery material.                                      | M02 contract/security tests; history journey; privacy red-team route                  | Local route evidence recorded; formal gate remains separate |
| I-004 | Identity, capability, and seat continuity | 2-, 6-, and 10-seat joins, replacement, stale invitation rejection, seat identity, and no capability upgrade across Host/Table/TV switching pass.                                                                                                               | M03 journeys/contracts; revision-4 role and capacity tests                            | Local route evidence recorded; formal gate remains separate |
| I-005 | Connectivity and route isolation          | Direct/relay/fallback route selection, ticket binding, serial failover, no duplicate delivery, stale-link guidance, and deployer-owned endpoint behavior remain intact.                                                                                         | M04 contract/journey routes; live relay gate                                          | Local route evidence recorded; formal gate remains separate |
| I-006 | Phase 1 host liveness rule                | The first two consecutive missed authenticated liveness attempts are silent/transient; only the third without an intervening valid Host frame may alert; any valid Host frame clears the warning.                                                               | M04 tests; revision-4 recovery journey; physical matrix                               | Local route evidence recorded; formal gate remains separate |
| I-007 | Recovery and foreground catch-up          | Host, Player, Table, TV, Public, refresh, bfcache, focus/online return, explicit reconnect, route restart, and credential/revision recovery reconcile authoritative state without guessing actions.                                                             | M03/M04/M07 journeys and contracts; physical matrix                                   | Local route evidence recorded; formal gate remains separate |
| I-008 | Phase 1 presentation and card privacy     | Quiet Table/TV remain card-first, edge-flush, role-oriented, accessible, and free of rejected labels/symbols; canonical cards and status glyphs remain intact.                                                                                                  | `QA-SYSTEM.md`; visual-conformance/feedback journeys; reviewed Darwin/Linux baselines | Local route evidence recorded; formal gate remains separate |
| I-009 | Corner asset and retained artifact        | The approved `symbol-gold.svg` rounded-fillet-and-dot asset is the Phase 2 corner authority; the retained Phase 1 artifact remains immutable and is checked separately by digest/receipt. A stale straight-L comparison is not evidence for the approved asset. | canonical asset check; retained Phase 1 digest; reviewed baseline                     | Local route evidence recorded; formal gate remains separate |
| I-010 | Responsive and accessibility gates        | Supported phone, tablet, desktop, and TV viewports have no hidden primary action, clipping, horizontal overflow, inaccessible name, undersized icon target, or reduced-motion regression.                                                                       | `QA-SYSTEM.md`; browser axe/geometry journeys; physical matrix                        | Local route evidence recorded; formal gate remains separate |
| I-011 | Airplane and offline boundary             | The standalone artifact remains self-contained and no-internet; Phase 2 changes do not add a required service, account, or external request.                                                                                                                    | Airplane journey; artifact checks; physical matrix                                    | Local route evidence recorded; formal gate remains separate |
| I-012 | Diagnostics and privacy red team          | Allowlisted diagnostics contain no secrets/cards, retention and deletion remain bounded, and each affected Phase 2 trust boundary has a negative disclosure test.                                                                                               | M08 contracts/security; red-team disposition                                          | Local route evidence recorded; formal gate remains separate |
| I-013 | Build, release, and phase isolation       | Clean build, reproducibility, budgets, dependency/audit checks, immutable manifests, rollback, and independent `/table-side/` preservation pass.                                                                                                                | M09/release checks; phase-site assembly; retained-file manifest                       | Local route evidence recorded; formal gate remains separate |
| I-014 | Physical and deployed evidence            | Named devices/browsers/networks, iOS/Android/iPad/TV, suspension, camera, route loss, and deployed consumer read-back are recorded with date, build, and minimized evidence.                                                                                    | `PHYSICAL-DEVICE-MATRIX.md`; release record; live read-back                           | Pending / Unknown                            |

The 73 field-feedback IDs are the inherited ledger inventory, not a count of
revision-4 owner-feedback items. The grouped inventory below is provided so a
revision-4 review can detect accidental omission; each continues to use the
ledger's route and disposition until a current receipt says otherwise.

| Area                                   | Inherited IDs                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Airplane, join, privacy, recovery      | `AIRPLANE-QR-USABLE-001`, `AIRPLANE-CAMERA-001`, `AIRPLANE-VISUAL-NOISE-001`, `PRIVATE-REVEAL-001`, `RECOVERY-REVISION-001`, `TOKEN-PORTABILITY-001`, `RELAY-STALE-LINK-001`, `JOIN-DEFAULT-001`, `RECOVERY-FOREGROUND-001`, `SEAT-VACANCY-REUSE-001`, `HOME-ICON-OPAQUE-001`                                                                                                                                                                                                       |
| Host/player/table lifecycle            | `HOST-PLAYER-SAME-DEVICE-001`, `HOST-TABLE-SAME-DEVICE-001`, `HOST-SAME-DEVICE-DISPLAYS-001`, `HOST-ROOT-CONTROL-001`, `HOST-DISSOLVE-TABLE-001`, `SIT-OUT-RECOVERY-001`, `PLAYER-LIVE-SYNC-001`, `PLAYER-RECONNECT-FEEDBACK-001`, `PLAYER-TABLE-STATUS-001`, `PLAYER-LEAVE-DRAWER-001`, `MUCK-REMOVED-001`, `FOLDED-STATUS-CLARITY-001`, `ACTIVE-SEAT-POSITIONS-001`                                                                                                               |
| Tablet quiet/quick/secondary           | `TABLET-FOUR-CORNERS-001`, `TABLET-CARD-FIRST-001`, `TABLET-CONTROLS-001`, `TABLET-THEMES-001`, `TABLET-FULLSCREEN-001`, `TABLET-CLOSE-CENTRE-001`, `TABLET-SLIDER-CONFORMANCE-001`, `TABLET-SECONDARY-MENU-CONFORMANCE-001`, `TABLET-PLAYER-MANAGEMENT-001`, `TABLET-NEXT-HAND-COMBINED-001`, `TABLET-STATUS-UPRIGHT-001`, `TABLET-SAFARI-EXIT-CLEARANCE-001`, `TABLET-IPAD-EDGE-GEOMETRY-001`                                                                                     |
| Cards and showdown                     | `COMPACT-CARD-OVERFLOW-001`, `COMPACT-CARD-STYLE-002`, `SHOWDOWN-BEST-FIVE-001`, `SHOWDOWN-CARD-SELECTION-003`, `SHOWDOWN-HOLE-BEST-FIVE-002`, `TABLET-FULL-FACE-RANK-001`, `TABLET-TEN-SHOWN-HANDS-001`, `TABLET-SHOWDOWN-STABILITY-001`, `TABLE-SIDE-FULL-CARD-ASSETS-001`, `PHONE-COMPACT-VECTOR-001`, `PHONE-CROSS-BROWSER-CARD-001`, `PLAYER-PHONE-HAND-LAYOUT-001`, `PLAYER-SHOW-GUARD-001`, `QUIET-SHOWN-HAND-SCALE-001`, `HOST-COMPACT-CARD-003`, `HOST-WINNER-OUTLINE-001` |
| TV and names                           | `TV-WALL-ORIENTATION-001`, `TABLE-TV-PLAYER-NAMES-001`, `SYSTEM-APPEARANCE-LOCK-001`, `DECK-APPEARANCE-001`, `DEVELOPER-NAVY-CONTRAST-001`, `UI-CHINESE-LOCALIZATION-001`                                                                                                                                                                                                                                                                                                           |
| QA process and release                 | `QA-PHYSICAL-DESIGN-GATE-001`, `QA-INDEPENDENT-SYSTEM-001`, `QA-TRACEABILITY-COMPLETE-001`, `QA-VISUAL-BASELINE-001`, `QA-NO-CONTEXT-DEPENDENCE-001`, `QA-RELEASE-BLOCK-001`, `QA-SECONDARY-ACTION-COVERAGE-001`, `QA-VISUAL-STATE-COVERAGE-001`, `OPEN-SOURCE-RELAY-ISOLATION-001`, `RELAY-LIVE-DEPLOY-GATE-002`, `RECONNECT-STORM-CONTROL-001`, `HOST-LIVENESS-FALSE-POSITIVE-001`                                                                                                |
| Published identity and host management | `PUBLISHED-PHASE-LABELS-001`, `PLAYER-MANAGEMENT-SPATIAL-001`                                                                                                                                                                                                                                                                                                                                                                                                                       |

The list above is de-duplicated. The registry remains the authoritative
de-duplication and evidence-route check.

## Changed inherited items

These rows change the Phase 2 candidate's acceptance or evidence state while
preserving the underlying Phase 1 guard.

| ID    | Change                       | Concrete acceptance                                                                                                                                                                                                                                                                                                    | Evidence status                                                        |
| ----- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| C-001 | Phase 2 default values       | New digital tables visibly and authoritatively use 1,000 starting chips, 5 small blind, and 10 big blind; totals and pot reflect those values after the first deal. Existing explicit accounting vectors remain test fixtures, not defaults.                                                                           | Local targeted pass; physical/deployed claims remain separate |
| C-002 | Published product copy       | User-facing Home, Host, Table, TV, Player, errors, and history surfaces use Our Poker Table language and contain no internal Phase 1/2/3 or preview/development wording. Technical paths and test IDs may remain internal.                                                                                             | Local targeted pass; physical/deployed claims remain separate |
| C-003 | Canonical corner asset       | Phase 2 must match the approved `symbol-gold.svg` rounded-fillet-and-dot asset. The retained Phase 1 artifact and digest remain unchanged and are verified separately; the prior straight-L comparison is not carried forward as a pass because the round-4 report failed and used a stale candidate.                  | Local targeted pass; physical/deployed claims remain separate |
| C-004 | Recovery implementation      | The new heartbeat/single-flight/backoff candidate is additive to the locked three-miss suppression rule; it cannot replace it with a four-second timer, player-count polling, or a noisy one/two-miss alert.                                                                                                           | Local targeted pass; physical/deployed claims remain separate |
| C-005 | Settlement winner projection | Remove duplicate settlement cards. Show a public winner's cards once at the winning seat; keep a fold-win winner's cards private until deliberate Show.                                                                                                                                                                | Local targeted pass; physical/deployed claims remain separate |
| C-006 | History action placement     | Download and import/replay remain in the established Table secondary-menu path; the host Table projection does not advertise a leave action without an explicit lifecycle callback, while the Player menu retains the leave action. Existing control IDs are retained and relocated rather than renamed or duplicated. | Local targeted pass; physical/deployed claims remain separate |

## New revision-4 acceptance items

| ID    | New feedback item           | Concrete acceptance and evidence                                                                                                                                                                                                                                                                 | Status                                                                     |
| ----- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| N-001 | Host/Table/TV tabs          | Host device exposes Host Controls, Table View, and TV View; each tab reports its active state and correct projection; Table/TV cannot expose private cards or grant authority.                                                                                                                   | Local targeted pass; see current-run evidence |
| N-002 | Street above board          | In both Table and TV, street/status is above the community board at all tested streets and hand-complete states; no overlay or ordering ambiguity.                                                                                                                                               | Local targeted pass; see current-run evidence |
| N-003 | 2/6/10 seat capacity        | For synthetic 2-, 6-, and 10-seat tables, every occupied player is visible in Table and TV. Seat cards, board, names, D/SB/BB tokens, stacks, all-in markers, and status glyphs do not overlap or clip.                                                                                          | Local targeted pass; see current-run evidence |
| N-004 | Hand-complete alignment     | After settlement, Table and TV agree on complete street, pot, winners, stacks, and next-hand availability; refreshing either view preserves the same state.                                                                                                                                      | Completed-hand alignment delta check; see current-run evidence |
| N-005 | All-in marker               | All-in is represented by a larger red triangle, with no collision against seat text, stacks, cards, board, or adjacent markers at 2/6/10 seats. Exact dimensions come from reviewed candidate evidence.                                                                                          | Local targeted pass; see current-run evidence |
| N-006 | Canonical history cards     | Replay board uses the existing full-face card component; history seats use the existing compact card component; card rank/suit remains vector/canonical and readable across supported widths.                                                                                                    | Local targeted pass; see current-run evidence |
| N-007 | Replay filter layout        | Player-card/time filter boxes, clear/search actions, hand selector, and step controls do not overlap, clip, or create horizontal overflow at phone and desktop widths.                                                                                                                           | Local targeted pass; see current-run evidence |
| N-008 | Secondary-menu history path | The Table secondary menu keeps download and import/replay in the established layer; a host menu without a page-leave callback remains free of a misleading leave control, and the Player menu exercises the available leave action with a resulting-state assertion.                             | Local targeted pass; see current-run evidence |
| N-009 | Host tool spacing           | Host tools use the established rounded controls, readable spacing, and non-overlapping hit regions in Host/Table/TV management states.                                                                                                                                                           | Local targeted pass; see current-run evidence |
| N-010 | Icon padding                | Icon-only controls retain accessible names and at least the existing 44×44 target (52×52 for Tablet corners/utilities); padding does not cause clipping or accidental overlap.                                                                                                                   | Local targeted pass; see current-run evidence |
| N-011 | Heartbeat recovery          | Recovery is heartbeat-driven and read-only; there is no forced fixed four-second reconnect. Recovery is single-flight per client, coalesces manual/foreground/online triggers, uses capped independently jittered backoff, suppresses offline attempts, and reuses healthy channel/valid ticket. | Local targeted pass; see current-run evidence |
| N-012 | Three-miss suppression      | A valid Host frame between misses clears the transient state immediately; the first two automatic misses remain silent, and only the third consecutive miss may show unsolicited guidance. Explicit manual retry reports failure without claiming recovery.                                                                                                                  | Local targeted pass; see current-run evidence |
| N-013 | Full-face replay card frame | A replay board full-face card has no inherited cream-frame padding or border; computed padding and border are zero, the background is transparent, and the approved SVG face fills the card bounds within one CSS pixel.                                                                         | Local targeted pass; see current-run evidence |

## Intentionally out of scope / N/A for this candidate

These items remain tracked by their governing PRD or gate and must not be
silently turned into Phase 2 claims:

| ID     | N/A boundary                                                                                                                | Required treatment                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| NA-001 | Real-money, payment, rake, cash-out, transferable value, or gambling account behavior                                       | Not applicable; retain the play-chip-only guard and negative search.                                    |
| NA-002 | Remote human play, public matchmaking, tournament/multi-table behavior, and Phase 3 AI/skins                                | Deferred by decision register; no Phase 2 revision-4 UI or qualification claim.                         |
| NA-003 | Exact pixel sizes for the new “larger triangle,” spacing, or feedback screenshots where no approved measurement is recorded | Choose reversible candidate dimensions, then inspect rendered geometry before accepting them. |
| NA-004 | China readiness, long-term uptime, closed-browser notification delivery, and unsupported future browsers                    | Remain Unknown/field-gated; local browser success cannot convert them to Pass.                          |

## Planned evidence sequence

1. Run registry/documentation validation after the owner implementation settles;
   confirm the active-release and lifecycle changes did not weaken any existing
   route.
2. Run the new revision-4 browser journey in the configured Phase 2 release
   project. Inspect the actual screenshots and any diff images; do not accept a
   green locator-only result for a visual item.
3. Run the canonical corner-asset verification and independently check the
   retained Phase 1 artifact digest. A failure in either route remains a
   release blocker; neither route may substitute for the other.
4. Run the full repository checks (`pnpm check`), coverage (`pnpm test:coverage`),
   full browser/security journeys (`pnpm qa:browser`), and the configured
   packaged-release tests sequentially after the focused journey is stable.
   Include `tests/contract/revision4-connectivity.test.ts`; keep accounting
   vectors with explicit 100/1/2 fixtures separate from the new 1,000/5/10
   default assertion.
5. Record named physical-device and deployed consumer receipts in the matrix
   and release record. Until then, the corresponding rows stay Pending or
   Unknown.

The owning test draft is [`tests/journey/phase2-revision4.spec.ts`](../../tests/journey/phase2-revision4.spec.ts).

## Measured CSS budget reconciliation

The revision-4 source build contains 131,017 raw CSS bytes (23,676 gzip),
including the new menu/replay/settlement styles and the retained compact-card
standard. The old 124,000-byte ceiling failed. The ceiling is now 132,000
bytes, under 1% headroom above measurement. This is an explicit 8,000-byte
budget increase, not a performance improvement claim. Removing used compact
card styles to fit the previous ceiling caused a regression and was reversed.
The retained deployed Phase 1 artifact remains independently pinned.


## Responsive capacity scope

Digital Table/TV on narrow portrait screens uses canonical compact rank/suit
faces for revealed seat hands and a scrollable 60rem minimum table height.
This avoids compressing all seat metadata and settlement into a phone viewport;
it is not a claim that all ten seats are simultaneously above the fold.
Desktop/landscape keeps full SVG seat faces. Digital TV uses the existing
corner menu for Host/language controls, avoiding duplicate buttons over cards.

The capacity journey now reaches showdown through real all-in actions from
every seat. This also exercises all-in badges during the worst occupied-seat
layout. Street-by-street action sequencing remains covered by the separate
history/winner journeys. The serial ten-WebKit-client check/call fixture timed
out at 120 seconds during the flop; that timeout is recorded, not a pass or a
change to the product's interaction timeout.


## Regressions found during this implementation

| Observed failure | Preventive check retained |
| --- | --- |
| Replay inherited the generic card padding, creating a cream frame. | N-013 checks zero padding/border and SVG-to-container bounds; root inspected the actual local replay. |
| Removing existing compact-card styles to meet a CSS byte ceiling broke canonical cards. | Restore the baseline rules; retain compact-card browser journeys and record any measured budget increase explicitly. |
| New icon padding leaked into physical-mode screenshots. | Scope new padding to digital accounting; keep Phase 1 snapshots unchanged. |
| Wrapping the legacy Save Log action added 12px to its row. | Preserve the one-action margin and rerun the existing exact secondary-menu snapshot. |
| Phone six/ten revealed seats collided despite desktop passes. | N-003 runs Table and TV on desktop Chromium, Pixel Chromium, and iPhone WebKit; inspect rendered screenshots and document portrait scrolling. |
| Manual reconnect inherited a quiet automatic retry trigger; stale probes could invalidate newer relay registrations. | Explicit manual trigger promotion, socket identity guards, read-only recovery review, and local relay journey. |
| A direct-route heartbeat attempted fresh offers every tick when no channel existed. | Heartbeat direct probe cannot start offers; recovery remains single-flight with backoff. |
| A test requested All-in when the rules exposed only Call for an equal remaining stack. | The capacity fixture waits for legal actions, shoves when legal, otherwise calls; product legality is not weakened to accommodate a test. |

Tests and test repairs are not production success receipts. Failed and interrupted
runs remain retained in the local evidence directory; only final completed runs
can support the corresponding local acceptance status.

The WebKit trace also showed one background-page navigation waiting roughly
44 seconds for the full load event. The fixture now waits for DOM readiness
and then explicitly verifies the usable Join UI. Per-action assertions and
the product timeout remain unchanged.


## Current-run evidence (2026-09-15)

The final evidence bundle is kept outside the source checkout at
`/Users/ruihecai/.codex/visualizations/2026/09/13/01a09b73-f564-7a23-b650-04f175f14891/phase2-revision4/`.
`source-manifest.json` records the exact Git base and SHA-256 hashes of the
changed source files. The full packaged run is followed by the narrowly scoped
manual-recovery and completed-hand alignment delta check.

| Evidence | Observed local outcome | Scope / limits |
| --- | --- | --- |
| Repository checks | Final `pnpm check` log in bundle | Formatting, lint, types, docs, brand assets, registry, controls, dependencies, contracts, relay tests, builds, and budgets. |
| Contract and relay tests | 164 core/contract tests; 19 relay tests pass | Includes the final manual-backoff regression; no physical network qualification. |
| Coverage | 91.04% lines; 85.15% branches | Coverage scope is the existing core packages/services; browser runtime is not included. |
| Production dependency audit | No known production vulnerabilities at audit time | Dependency lockfile unchanged; not a general security guarantee. |
| Inherited browser/security suite | 249 pass, 80 configured skips, 1 screenshot failure; the exact failed case then passes after the margin fix | Final secondary-menu baseline was preserved, not regenerated. Last deltas are scoped to digital controls/manual reconnect. |
| Packaged release-path journey | 44 pass, 1 configured skip | Desktop Chromium, Pixel Chromium, iPhone WebKit; includes 2/6/10 all-in shown-seat layouts in Table and TV, history, privacy, tabs, controls, canonical corner and retained Phase 1 checks. |
| Final delta journey | 5 pass, 1 configured skip; see `delta-final.log` | Rebuilt manual-backoff code, healthy socket/loss recovery, winner/fold privacy, and completed-hand control alignment. |
| Reviewed visuals | Root inspected the local replay in CUA, desktop 10-seat Table/TV, and narrow-screen TV screenshots | Replay cream frame removed; portrait tables intentionally scroll; screenshots use synthetic cards/players. |
| Retained Phase 1 | 158 retained files validated during assembly | Pinned source/archive remains unchanged; no public site update performed. |
| Recovery review | Original four findings and final P2 manual-backoff edge resolved | Independent Luna read-only review; execution evidence remains root-owned. |

Inherited I-001 through I-013 have local evidence on their recorded routes;
this is **partial inherited qualification**, not wholesale Pass. Physical
matrix I-014, live relay/consumer receipts, Linux screenshot equivalence and
release reproducibility/rollback qualification are not completed by this local
repair task. Skipped tests retain their configured reasons in the raw log.
