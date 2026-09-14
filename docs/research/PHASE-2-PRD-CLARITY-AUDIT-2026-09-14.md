# Phase 2 PRD clarity audit

## FOUNDATION_RESEARCH_V1

**Basis ID:** FOUNDATION_RESEARCH_V1:PHASE2-ACCOUNTING:2026-09-14  
**As-of:** 2026-09-14  
**Repository snapshot:** /Users/ruihecai/Developer/html-poker-phase2-release at 1174e12f2a94d262e25ce115ec67ab7075617c72.  
**Scope:** Optional, local/in-person home-game Phase 2 accounting, same-roster sequential hands and between-hand top-ups; seat and chip lifecycle, correction/history boundaries, and preview qualification. This is not a remote-first, public matchmaking, AI, legal, or gambling-regulation review.  
**Prior basis reused:** docs/research/PHASE-2-ACCOUNTING-FOUNDATION.md and linked P2/M10/M01/M07 and DECISION-REGISTER.md decisions were rechecked against the pinned repository snapshot and refreshed with current public product, poker-rules, academic, and pinned-source-code evidence below.  
**Snapshot limitation:** The working tree had concurrent edits during this audit. Repo statements below come from git show HEAD:<path> at the commit above, not those uncommitted edits. Reconcile this baseline audit against the updated branch before treating its implementation comparison as current.

### Research tracks

**Industrial products and poker practice**

- Smart Dealer Poker’s current App Store listing describes a shared-screen plus players’ phones format for in-person social play, supports buy-ins/top-ups and hand replay, and says the product does not handle wagers, deposits, or withdrawals. Its developer response says a host can top up a stack when a player runs out. This is a close product precedent for optional play chips and reloads, though it also has accounts, clubs, multiple variants, and other features outside this scope. [App Store listing](https://apps.apple.com/us/app/smart-dealer-poker/id6472909251), inspected 2026-09-14, especially lines 53–58 and 76–87.
- Poker Now’s current product page says a private room can be created without sign-up or an account, supports play money without monetary value, and advertises a full session log/download, session buy-in/buy-out ledger, pause-before-next-hand, and hand replay. It demonstrates a second play-chip/session-ledger model, but is a remote online product with shared-room access and voice/video; its architecture is not equivalent to a host-authoritative in-person table. [Poker Now](https://www.pokernow.com/), inspected 2026-09-14, especially lines 36–54, 67–85, and 90–111.
- The Poker Tournament Directors Association (TDA) describes its rules as tournament rules. Its current rules page still advertises the 2024 document, while its official forum has a 2026 rules release post dated 2026-09-07 linking the 2026 files in Dropbox. The current 2026 file content was not inspectable through this audit, so no specific rule is attributed to it. A current TDA forum response says cash-game house rules vary and commonly require missed-blind posting or waiting for the big blind; that is a forum participant’s description of practice, not a binding or universal private-home rule. [TDA current rules page](https://www.pokertda.com/poker-tda-rules/), [2026 rules release post](https://www.pokertda.com/forum/index.php?topic=1759.msg14281), and [current forum cash-game discussion](https://www.pokertda.com/forum/index.php?topic=1758.msg14280), inspected 2026-09-14. The mismatch between the site’s 2024 page and its forum’s 2026 release is recorded as a source limitation, not a reason to reopen the owner’s house policy.
- WSOP Online’s currently accessible Texas Hold’em rules say chips may be added between hands; a busted all-in player must make up any missed blinds before rebuy and is not treated as a new player; and players who missed blinds can post them or wait for the big blind. This provides a clear product precedent for distinguishing a between-hand reload from re-entry after missed blinds. It is a real-money operator’s rule set, so it is supporting analogy rather than a rule imposed on this play-chip home game. [WSOP Online rules](https://www.wsoponline.com/nj/learn-to-play-poker/texas-holdem/rules/), inspected 2026-09-14, lines 82–84 and 167–182.

**Inspected open-source implementation**

- Reused and verified PokerKit at exact commit 5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb (detached checkout under /tmp/pokerkit-phase2-audit; git rev-parse HEAD matched). The inspected State constructs an individual hand state and initializes stacks from the supplied starting-stack list; cash-game and tournament modes are distinguished in that state model. Hand histories expose per-hand starting stacks, actions, finishing stacks, and winnings, and can reconstruct a hand state from those recorded starting stacks. The inspected hand-state and HandHistory surfaces do not define an app-level session top-up ledger, missed-blind/re-entry policy, or session-close policy. This is a bounded claim about the inspected code, not a claim that no other PokerKit module or application wrapper could provide those behaviors.
- Exact pinned code: [State](https://github.com/uoftcprg/pokerkit/blob/5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb/pokerkit/state.py#L705-L735), [cash-game/tournament mode](https://github.com/uoftcprg/pokerkit/blob/5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb/pokerkit/state.py#L1003-L1009), [stack initialization](https://github.com/uoftcprg/pokerkit/blob/5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb/pokerkit/state.py#L1238-L1262), [bet/raise amount validation](https://github.com/uoftcprg/pokerkit/blob/5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb/pokerkit/state.py#L4829-L4867), [pot pushing](https://github.com/uoftcprg/pokerkit/blob/5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb/pokerkit/state.py#L6134-L6200), [stack pull after awards](https://github.com/uoftcprg/pokerkit/blob/5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb/pokerkit/state.py#L6368-L6399), and [hand-history fields](https://github.com/uoftcprg/pokerkit/blob/5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb/pokerkit/notation.py#L73-L150) / [reconstruction from recorded starting stacks](https://github.com/uoftcprg/pokerkit/blob/5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb/pokerkit/notation.py#L946-L955).

**Academic evidence**

- Juho Kim’s PHH paper proposes a human-readable and machine-parsable hand-history format across poker variants, with a supplemental corpus of 10,088 hands across 11 variants. This supports versioned per-hand replay/interchange as a useful target; it does not specify home-game session accounting, reload, return, or correction semantics. [“Recording and Describing Poker Hands,” arXiv:2312.11753, v5 (2024)](https://arxiv.org/abs/2312.11753), inspected 2026-09-14, abstract and version information at lines 8–25.
- Kim’s PokerKit paper describes a flexible multi-variant simulation library and reports extensive doctest/unit-test coverage. It supports model-based and replay-oriented verification as engineering practice; it is not empirical evidence that any particular session or correction policy is preferable. [“PokerKit: A Comprehensive Python Library for Fine-Grained Multi-Variant Poker Game Simulations,” arXiv:2308.07327, v6 (2024)](https://arxiv.org/abs/2308.07327), inspected 2026-09-14, lines 8–24.
- No located academic study resolves private home-game seat-return policy, session closure, or post-settlement correction policy. Those gaps are either already decided by the owner or outside the present preview increment.

### Facts

- The decision register contains SCOPE-PLAY-MONEY (no money value/payment/cash-out/rake), PHASE2-HOUSE-POLICY-V1 (the p2-house-1 rule set), CORRECTION-LIVE-EVENTS, PHASE2-NLHE-HOME-SESSION, REMOTE-PUBLIC-TABLE-P2, REMOTE-HUMAN-PLAY, and test gates TEST-CORRECTION-REPLAY and TEST-ACCOUNTING. Relevant rows are at docs/prd/reference/DECISION-REGISTER.md lines 9–11, 89, 116–119, and 134–148 (snapshot commit above).
- The house-policy row specifies integer play chips, blinds only, explicit host-confirmed settlement, odd chips clockwise from the first eligible winner left of the dealer, between-hand top-ups, and wait-for-big-blind re-entry. The integration scope preserves these existing house rules; a runtime gap alone does not reopen them.
- The owner authorized repairing all collected feedback. The master selected fixed-roster consecutive hands as the bounded implementation needed to make the next-hand and top-up controls usable after settlement. Late joins, re-entry workflows, history corrections, and history/export remain deferred. This current task scope is not yet a new row in the pinned decision register; the classifications below retain it as a scoped, provisional alias.
- At the pinned repository baseline, P2 describes an optional local digital home-session, play-chip ledger, history, explicit settlement, and a future read-only remote table view (docs/prd/phases/P2-DIGITAL-ACCOUNTING.md, lines 25, 33–60). Its implementation-status section says the tracer handles one hand and rejects a second hand; multi-hand, top-up/re-entry, correction/history export, remote, and qualification work are incomplete (lines 77–87).
- At that baseline, GameCore rejects a second StartHand under nlhe-home-v1 after completion (packages/game-core/src/index.ts, lines 923–937); AccountingCommand has create/start/action/settlement commands but no top-up command (packages/accounting/src/index.ts, lines 58–86); and SetSeatParticipation can toggle sit-out/return without recording missed blinds or enforcing wait-for-big-blind (packages/game-core/src/index.ts, lines 1479–1509). Accounting UnregisterSeat is rejected (lines 1453–1465). Generic RecordCorrection appends a correction event but does not implement balance-adjustment semantics (lines 1406–1424). These describe only the pinned baseline.
- The baseline release note records authorization for a testable Phase 2 preview, while also stating at that snapshot that CI and live Phase 2 consumer read-back remained pending and that the record did not claim deployment (docs/releases/PHASE-2-PREVIEW.md, lines 3–15 and 56–73).

### Inferences

- The user-facing unit for the current preview should be a single table/session with sequential, confirmed hands and an unchanged seat roster. A same-roster, zero-stack seat that has remained seated and has not missed a deal can receive a host-recorded play-chip reload between confirmed hands before the next deal. This follows the existing “top-ups only between hands” policy, fits the bounded current authorization, and matches the product precedent of between-hand adds and reloads after running out.
- Wait-for-big-blind is a return rule after the player actually sat out/missed a blind or deal, not a penalty for a seated player whose stack reached zero in the immediately previous hand. WSOP Online’s public rules expressly distinguish busted-player rebuy from missed-blind re-entry; Smart Dealer also presents a top-up as the response to running out of chips. This is a RESEARCH-DEFAULT, not a new owner rule. If a seat has missed a deal, top-up alone must not restore eligibility; until missed-blind state and wait-BB behavior are implemented and tested, the current preview should disable/reject sit-out/return transitions.
- The roadmap’s correction, replay/export, session persistence, and broader device/remote qualification requirements should not be smuggled into this preview as policy decisions. Their lack of implementation belongs in deferred scope and test gates. A future session-close/archive/delete flow may need an explicit retention/lifecycle decision before persistent multi-session history is released; it does not block a same-session multi-hand preview without history/export.

### Unknown

- The 2026 TDA rule files are linked from the official forum but were not inspectable in the available public page view. The official rules page continues to expose the 2024 document, so no 2026 rules content is asserted.
- No empirical result here establishes whether users prefer a different reload cap or a different return position. Those are outside the supplied p2-house-1 rules; do not ask absent evidence of a real defect or owner-requested policy change.
- The current working-tree implementation and docs were not read in this audit; concurrent edits are outside the pinned-baseline evidence boundary.

### Blocker

Nothing. The audit can classify the current scope without user input. Any live publication or device-qualification claim still depends on separate release evidence gates, not on a policy choice.

## Decision reconciliation and question queue

Classification describes treatment in this audit: LOCKED means preserve the owner-set rule; RESEARCH-DEFAULT means adopt a supported default without asking; SOFT-SET means a task-scoped implementation assumption; DEFERRED means outside this increment; TEST-DO-NOT-ASK means resolve through empirical/release checks; OPEN-MAJOR means material user judgment remains. OPEN-MAJOR: none.

| Stable decision ID | Aliases and prior semantic search | Existing decision | Classification | Rationale and revisit trigger |
|---|---|---|---|---|
| SCOPE-PLAY-MONEY | Search: money, cash-out, payment, rake, transfer. Register ID is exact. | SCOPE-PLAY-MONEY: chips have no money value or payment/cash-out/rake. | LOCKED | No external payment or financial value enters this feature. Revisit only through an explicit product/business-model pivot. |
| PHASE2-HOUSE-POLICY-V1 | p2-house-1; search: integer, blinds, odd chip, settlement, top-up, re-entry, big blind. | Register status is research-default; the current repair scope preserves that settled research default. | LOCKED | Preserve the existing rules exactly. A missing runtime guard is an implementation/test issue. Revisit only if the owner explicitly changes the house policy. |
| P2-SAME-ROSTER-MULTIHAND-PREVIEW | Provisional audit alias; searched multi-hand, same roster, next hand, new seat, StartHand. | Master-selected scope under the authorized feedback repairs: several hands in one table/session for the same roster. No new seat or re-entry workflow. | SOFT-SET | Scope is bounded and authorized for this increment. Require settlement confirmation before the next hand, keep a stable seat roster, and verify hand/dealer progression. Revisit if late joins or variable active seating are explicitly added. |
| P2-BUSTED-SEAT-RELOAD-BEFORE-MISSED-DEAL | Provisional alias under PHASE2-HOUSE-POLICY-V1; searched top-up after bust, reload, rebuy, missed blind. | House rule allows top-ups only between hands and separately says a returning player waits for the big blind. | RESEARCH-DEFAULT | A seated player who busts and reloads before any missed deal/blind is a between-hand reload, not a return from sitting out. Allow only after settlement confirmation, before next deal, as a host-authorized integer play-chip event. Revisit if the owner adds a reload cap or expressly defines a different busted-player rule. |
| P2-SITOUT-RETURN-POLICY | Alias of PHASE2-HOUSE-POLICY-V1; register semantic search for sit out, return, missed blind, big blind. | A player who returns waits for the big blind. | LOCKED | Do not reinterpret this as immediate re-entry after a missed hand. Current preview should reject/disable return until missed-blind tracking and wait-BB enforcement exist. Revisit only with explicit policy change. |
| P2-SITOUT-RETURN-IMPLEMENTATION | TEST-ACCOUNTING; P2/M10 sit-out/return vectors; runtime SetSeatParticipation. | The baseline runtime allows toggles without enforcing the settled return policy. Late re-entry support is explicitly deferred in this task. | DEFERRED | Fixed-roster preview should keep these transitions unavailable. Reopen when wait-BB tracking is implemented and its state/recovery tests are ready. |
| P2-LATE-SEAT-ENTRY | Search: late join, late seat, RegisterSeat, join window. | First hand closes the Digital Chips join window at baseline; current task defers late joins. | DEFERRED | Not needed for same-roster hands. Reopen only as its own session-policy slice with stable history/seat identity semantics. |
| CORRECTION-LIVE-EVENTS | Register exact ID; search: correction, adjustment, append-only, history. | Accepted history remains append-only; corrections cite actor/reason/event IDs and cannot restore secret information. | RESEARCH-DEFAULT | Existing policy remains applicable; no reason to re-ask it. |
| P2-CORRECTION-ACCOUNTING-WORKFLOW | Alias of P2/M10 correction requirements plus TEST-CORRECTION-REPLAY. | Corrections may eventually affect accounting, but authorization/reopen/adjustment semantics and replay evidence are not complete. | DEFERRED | Not part of multi-hand/top-up preview. Revisit before applying any correction to confirmed balances or releasing corrected histories. |
| P2-HISTORY-EXPORT-AND-RETENTION | ACCOUNTING-PHASE-2, M10, M07; search: history, export, retention, privacy. | Phase 2 roadmap includes privacy-filtered histories and export; M07 defers retention qualification. | DEFERRED | No persistent multi-session/export feature is in the current slice. Revisit before history export or retention is enabled. |
| P2-SESSION-CLOSE-AND-ARCHIVE | No register row found; semantic search of decision register, P2/M10/M07, and architecture for session close/end/archive/delete/retention. | Session open/close/archive/delete behavior is not specifically settled in the pinned docs. | DEFERRED | This is an explicit lifecycle gap for a later persistent-history feature, not a blocker for a live same-roster table session without export. Reopen before adding session archive, deletion, cross-session summaries, or retention promises. |
| PHASE2-NLHE-HOME-SESSION | Register exact ID; alias single-table home-session. | First digital profile is single-table play-chip NLHE; other variants/tournament/multi-table remain deferred. | LOCKED | Does not imply remote human play or extra session lifecycle features. Revisit only via explicit scope pivot. |
| REMOTE-PUBLIC-TABLE-P2 / REMOTE-HUMAN-PLAY | Register exact IDs; semantic search: public table, remote, human play, pivot. | Remote public view is deferred; full remote human play requires a fresh remote-first pivot. | DEFERRED | Separate trust, latency, moderation, and recovery research is needed before widening the current in-person scope. |
| TEST-ACCOUNTING / TEST-CORRECTION-REPLAY | Register exact IDs; P2/M10 quality gates. | Chip conservation, action legality, replay, idempotency, privacy, settlement, corrections and exports are tests, not preference questions. | TEST-DO-NOT-ASK | Use model/property/recovery tests. If tests expose a true policy conflict, then reclassify only that conflict. |
| P2-PREVIEW-QUALIFICATION | PHASE2-PREVIEW, UI-QA-RELEASE-BLOCK, TEST-IOS-STANDALONE, TEST-TV-BROWSERS; search: preview, CI, read-back, Airplane, qualification. | A testable preview was authorized, while the pinned release record still showed CI and live consumer read-back pending; full Phase 2/device qualification was expressly not claimed. | TEST-DO-NOT-ASK | Verify the exact artifact and consumer state, browser/device behavior, and separate Phase 1 preservation. Do not turn evidence gaps into user policy questions or claim deployment from authorization alone. |

### QUESTION_ADMISSION_V1

No question is admitted. There is no material policy conflict to place before the user in this increment:

- The potential reload-versus-wait-for-big-blind edge is resolvable from the existing words: reload is a between-hand top-up before a missed deal; wait-BB applies after an actual sit-out/missed blind. First-party product rules and product examples show that distinction, but do not override the owner’s rule.
- Fixed-roster sequential hands and between-hand top-up are in the current authorized scope; late joins, missed-blind re-entry, corrections, and history/export are deferred.
- The absent session-close/archive policy is real but belongs to the future persistent-history/retention feature, not this preview.
- CI, consumer read-back, recovery, and device qualification are empirical acceptance gates.

## Baseline PRD text versus baseline implementation

The distinctions below are pinned to commit 1174e12f2a94d262e25ce115ec67ab7075617c72; they do not describe the concurrent uncommitted repair work.

| Area | PRD / release text at snapshot | Baseline implementation evidence | Audit reading |
|---|---|---|---|
| Multiple hands | P2 says the tracer handles one hand and rejects a second (P2-DIGITAL-ACCOUNTING.md:77–85); preview release says create a fresh table for another hand (PHASE-2-PREVIEW.md:10–15). | GameCore rejects StartHand from complete for nlhe-home-v1 (packages/game-core/src/index.ts:923–937). The accounting reducer itself accepts StartHand from complete (packages/accounting/src/index.ts:325–347), so the policy is enforced at a higher layer. | Accurate for baseline, but now superseded by the same-roster extension within the authorized repair scope. Updated PRD/release text should say same table, next hand after confirmed settlement, same roster; the implementation must preserve the invariant at the authority boundary. |
| Top-up / reload | P2 and M10 specify top-up as a ledger operation and between-hand policy (P2 lines 43, 58; M10 lines 28–35, 62–68), but the status text calls top-up/re-entry incomplete (P2 lines 81–83; M10 lines 76–82). | The baseline accounting command union contains no top-up operation (packages/accounting/src/index.ts:58–86). Zero-stack seats are excluded from StartHand (packages/accounting/src/index.ts:339–347). | The requirement is clear enough; runtime support is missing at baseline. Clarify in implementation/acceptance tests that the accepted top-up event is between confirmed hands and can reload a still-seated player before a missed deal. |
| Sit-out / return | P2/M10 test plans mention sit-out/return; p2-house-1 requires wait-BB return (P2 lines 58, 64–69; M10 lines 62, 68). | SetSeatParticipation toggles participation without missed-blind state/wait-BB enforcement (game-core/src/index.ts:1479–1509); accounting unregistration is already rejected (line 1453–1465). | Baseline has an invariant gap if multiple hands are enabled. Keep sit-out/return unavailable for this preview until the wait-BB policy can be enforced. A top-up does not itself restore eligibility for a seat that missed a deal. |
| Correction and session history | P2/M10 require append-only adjustments, histories, export, and correction verification; status sections state these are incomplete (P2 lines 56, 64–69, 82–87; M10 lines 34, 51–64, 76–82). | Generic baseline RecordCorrection appends CorrectionRecorded only (game-core/src/index.ts:1406–1424); no correction-driven accounting adjustment is visible in the inspected command interface. | No conflict in current preview because correction/history/export are deferred. Keep future requirements separate from available behavior; define balance/reopen and session lifecycle semantics before implementing them. |
| Preview qualification | The release record authorizes a testable preview but is explicit that it is not a completed Phase 2 or physical qualification claim (PHASE-2-PREVIEW.md:3–6). It lists local test evidence and pending CI/live consumer read-back (:56–73). | This is a release evidence state, not an implementation behavior inference. | Updated claims should be tied to actual CI, deployed artifact, live consumer read-back, and device evidence. No additional product decision is needed to resolve those gates. |

## Recommended current-slice wording

Use wording with these boundaries in the PRD/release scope:

> The preview supports a local play-chip home session with sequential hands for the same seated roster. The host may record a positive integer play-chip top-up for a seated player only between hands, after the preceding settlement is confirmed and before the next hand begins. A player who stayed seated and has not missed a deal may reload after reaching zero. This preview does not support late joins or sit-out/return transitions. If re-entry is later supported after a player misses a deal, the settled p2-house-1 wait-for-big-blind rule applies. Corrections to confirmed balances, persistent history/export, session archive/retention, remote human play, and broad physical/Airplane qualification remain separate deferred or test-gated work.

## Acceptance tests, not questions

1. Confirm settlement is required before top-up and before StartHand; reject top-up during a live hand or while settlement is pending.
2. Allow only host-authorized, positive integer play-chip top-up for a seat in the existing roster. Record one idempotent durable ledger event and preserve conservation between the session total and seat balances.
3. Verify the zero-stack, still-seated case: after confirmed settlement, a top-up before any missed deal makes the same seat eligible for the next hand without being treated as a new seat or re-entry.
4. Reject registering/unregistering seats and reject or disable sit-out/return transitions in this preview. Do not permit top-up alone to reactivate a seat that missed a deal.
5. Across at least three sequential hands, verify stable seat IDs, fresh, distinct hand IDs, dealer/button progression, legal active-seat selection, and carried-forward balances.
6. Crash/reload at settlement, after top-up, and before/after StartHand; replay must produce one settlement and one top-up, with no duplicate event and unchanged chip conservation.
7. Keep append-only balance corrections, history privacy/export, remote Public Table, actual standalone Airplane/iOS, and full preview release qualification on their existing deferred or empirical gates.

### Source index

All public pages above were opened or searched on 2026-09-14. Current public-source links:

- Smart Dealer Poker: https://apps.apple.com/us/app/smart-dealer-poker/id6472909251
- Poker Now: https://www.pokernow.com/
- TDA 2026 release post: https://www.pokertda.com/forum/index.php?topic=1759.msg14281
- TDA current rules page: https://www.pokertda.com/poker-tda-rules/
- TDA current forum cash discussion: https://www.pokertda.com/forum/index.php?topic=1758.msg14280
- WSOP Online Texas Hold’em rules: https://www.wsoponline.com/nj/learn-to-play-poker/texas-holdem/rules/
- PHH paper: https://arxiv.org/abs/2312.11753
- PokerKit paper: https://arxiv.org/abs/2308.07327
- PokerKit pinned source: https://github.com/uoftcprg/pokerkit/tree/5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb


## Master reconciliation of the repair candidate

The baseline findings above were checked against the repair branch on 2026-09-14.
P2, M10, README, architecture, and the preview record now separate implemented
fixed-roster hands/top-ups from deferred re-entry, correction, and export work.
The runtime rejects manual digital participation changes before identity mutation,
and skips physical-profile participation synchronization so a skipped seat's
status is not erased. The core rejects top-up after a missed deal. A separate
integration review and browser/release checks still control publication.

The master independently inspected the pinned PokerKit stack initialization and
history model, refreshed WSOP's between-hand and missed-blind rules, and verified
the PHH/PokerKit paper records (IEEE CoG 2024 and IEEE Transactions on Games).
No question passes OPEN—MAJOR for this increment. The lifecycle, correction, and
remote-play items above become candidates only when their named feature starts.
