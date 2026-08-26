---
id: RESEARCH-PRODUCT-RULES-SCOPE
kind: research
status: current
evidence_cutoff: 2026-08-14
authority: informative
update_trigger: remote-first, tournament-first, multi-table, real-money, account-required, or non-Texas-Hold'em product pivot
---

# Product and rules scope: evidence and architecture consequences

## Executive conclusion

The smallest coherent product remains a browser-based digital dealer for an in-person, play-money Texas Hold'em table:

- **Phase 1** deals cards and manages hand lifecycle while the group bets with physical chips. It must not invent stacks, pots, buy-ins, or settlement state that it cannot observe.
- **Phase 2** may add an optional, single-table, home-session **No-Limit Texas Hold'em** profile that owns legal betting actions, play-chip stacks, pots, settlement, and histories.
- Full remote human play, tournaments, multi-table orchestration, multiple boards, other betting structures, and other poker games remain deferred pivots. The architecture reserves versioned seams for them; it does not implement partial feature flags now.

No immediate owner question emerged from this audit. Existing decisions and convergent evidence settle the current phase boundary. Remaining uncertainties are either later pivots or empirical test gates.

This report is informative. Normative decisions live in the [Decision Register](../prd/reference/DECISION-REGISTER.md), [Master PRD](../prd/MASTER-PRD.md), [Phase 1 PRD](../prd/phases/P1-TRUSTED-HOST-DEALER.md), [Phase 2 PRD](../prd/phases/P2-DIGITAL-ACCOUNTING.md), and owning module PRDs.

## Research question and method

The audit asked which product/rules choices must be decided now so later accounting, remote presentation, AI Players, variants, and multiple-table operation can be added without rewriting the trusted-host core.

Evidence was separated into three tracks:

1. **Industrial practice:** first-party product documentation and current poker-rule sources.
2. **Open-source practice:** implementation and tests at immutable revisions, not README claims alone.
3. **Academic practice:** original work relevant to exact poker-game definitions and multivariant architecture.

Claims use these labels:

- **Fact:** directly supported by a cited source or a controlling repository decision.
- **Inference:** a project-specific conclusion drawn from facts.
- **Unknown:** evidence is absent, time-sensitive, or intentionally deferred.

Product popularity is not treated as proof of correctness. Competitor feature breadth is not treated as a requirement. No novelty claim is made.

## Evidence record

### Industrial products and rule authorities

| Source | Dated evidence used | Relevance | Limit |
|---|---|---|---|
| [Bold Poker Help](https://boldpoker.net/help) | Accessed 2026-08-14 | Describes a digital dealer for nearby friends, one private player device per person, a public host/board, and physical chips. It explicitly says app-managed betting would add blind, buy-in, and rebuy complexity. | Closed product; authority, recovery, and protocol internals are not public. |
| [Smart Dealer Poker](https://smartdealer.poker/) | Accessed 2026-08-14 | Separates private player phones from a browser table; manages cards, blinds, chips, side pots, ring games, tournaments, and named variants. | Centrally hosted product; its architecture and policies do not establish local-first behavior. |
| [Cardamoo FAQ](https://cardamoo.com/faq) | Accessed 2026-08-14 | Demonstrates browser guest play, private tables, configurable home-game blinds/buy-in, and virtual chips with no real-world value or cash-out. | Its broader gamification and account model are not project defaults. |
| [PokerStars Texas Hold'em rules](https://www.pokerstars.com/poker/games/texas-holdem/) | Accessed 2026-08-14 | Defines the shared Hold'em deal and distinguishes fixed-limit, pot-limit, no-limit, and mixed betting rules. | Commercial online-room rules are not automatically home-game policy. |
| [2024 Poker TDA rules](https://www.pokertda.com/view-poker-tda-rules/) | Current published version checked 2026-08-14 | Shows that tournament procedure, substantial action, misdeals, exposure, seating, and table balancing form a specialized rule set. | TDA rules govern tournaments and supplement house rules; they are precedent, not mandatory Phase 1 behavior. |

### Pinned open-source implementation evidence

| Project and revision | Inspected evidence | Consequence for this project |
|---|---|---|
| [PokerKit `5841c0a`](https://github.com/uoftcprg/pokerkit/tree/5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb) | Separate [`FixedLimitTexasHoldem` and `NoLimitTexasHoldem`](https://github.com/uoftcprg/pokerkit/blob/5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb/pokerkit/games.py#L532-L646), a separate [cash-game/tournament `Mode`](https://github.com/uoftcprg/pokerkit/blob/5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb/pokerkit/games.py#L82-L149), and distinct [Short Deck and Pot-Limit Omaha classes](https://github.com/uoftcprg/pokerkit/blob/5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb/pokerkit/games.py#L913-L1080). | Betting structure, session policy, and card-game variant are independent axes. Keep them explicit and versioned. |
| [LONICERA `012da2f`](https://github.com/Evostructs/LONICERA/tree/012da2f9d21a5dc05087bd02841c25456d730e2b) | Its tests cover heads-up blinds, side pots, odd refunds, chip conservation, random play, and replay; cash/tournament behavior is represented explicitly. | Digital accounting needs model/property tests and cannot be reduced to a visible counter. Do not reuse its source-available code or its broad completed-hand card history. |
| [Tehes/poker `8452681`](https://github.com/Tehes/poker/tree/8452681391b4753089cb8e74bee79d89ef6f0e67) | Implements shared and per-seat views plus remote actions, bots, and side pots. Its protocol also places cards in URLs and lacks adequate seat authorization. | Remote presentation and digital actions are separable product capabilities. Recreate the projection boundary, not this protocol or source-available implementation. |

### Academic evidence

- [PokerKit: A Comprehensive Python Library for Fine-Grained Multivariant Poker Game Simulations](https://doi.org/10.1109/TG.2023.3325637) supports explicit, fine-grained game definitions rather than UI-level variant flags.
- [DeepStack](https://doi.org/10.1126/science.aam6960) evaluates heads-up no-limit Hold'em, while [Pluribus](https://doi.org/10.1126/science.aay2400) evaluates six-player no-limit Hold'em. These are exact-game results, not evidence for a generic “poker AI.” Future AI evaluation must pin rules, player count, stacks, blinds, and action abstraction.

Academic evidence does not decide whether this home product should prioritize tournaments, remote play, or additional variants. Those are product-scope choices, not scientific facts.

## Scope findings

### 1. Phase 1 is a deal-only product

**Facts**

- `PHASE1-DEAL-ONLY` is locked in the Decision Register.
- Bold Poker demonstrates that digital dealing with physical betting is a coherent product rather than an incomplete online poker room.
- A physical-chip app cannot know calls, raises, all-ins, side pots, buy-ins, or the final physical settlement unless users enter every action.

**Inference**

Phase 1 should model only state it can authoritatively know: table/seat eligibility, dealer position, shuffled cards, streets, Fold/Show, available hand evaluation, and explicit hand end. Betting-round completion is communicated by an explicit dealer control, not inferred from chip movement or a timer. The older Muck event remains a recovery-compatibility state, not a current player action.

**Accepted result:** **LOCKED**. Phase 1 must contain no fake zero-valued stack, bet, pot, buy-in, or settlement fields. A missing digital accounting module means “not known,” not zero.

### 2. “Texas Hold'em” does not select a digital betting structure

**Facts**

- The common deal is two private cards, five community cards, and the best five-card high hand.
- Fixed-limit, pot-limit, and no-limit Hold'em impose materially different legal bet/raise rules.
- Current industrial, open-source, and academic references treat No-Limit Hold'em as a distinct named rules profile.

**Inference**

Phase 1 can remain neutral about the group's physical betting structure because it does not validate amounts. Once Phase 2 owns actions, it must select one exact structure. No-Limit Hold'em is the best-supported initial default, but it must live behind a `BettingStructure` seam rather than become an implicit assumption throughout UI code.

**Accepted result:** standard high Texas Hold'em dealing is **LOCKED**; the first Phase 2 digital structure is No-Limit Hold'em as a **RESEARCH-DEFAULT**. Fixed-limit, pot-limit, and mixed betting remain **DEFERRED**.

### 3. Home-session and tournament modes are different rule systems

**Facts**

- The requested Phase 2 outcomes are optional play-chip balances, buy-in/top-up counts, hand histories, settlement proposals, and later reflection.
- Smart Dealer and PokerKit model cash/ring-style and tournament play separately.
- Tournament practice adds blind schedules, elimination, late registration/re-entry, seat balancing, table breaking, and event-level administration.

**Inference**

The first Phase 2 profile should be a single-table home session with play-chip units. “Home/ring-style” describes stack and join/leave behavior only; it never means the chips represent money. Tournament lifecycle would create a second product surface and should not leak into the first accounting slice.

**Accepted result:** `PHASE2-NLHE-HOME-SESSION` is a **RESEARCH-DEFAULT**. Tournament and multi-table operation are **DEFERRED**.

### 4. Internet-capable transport is not full remote play

**Facts**

- Table-side Mode can connect devices that are not on one Wi-Fi network.
- Phase 1 still relies on physical betting and an in-room settlement conversation.
- A remote Public Table View is already reserved for Phase 2, but it is read-only and contains no private cards.

**Inference**

Transport reachability should remain location-neutral, but Phase 1 must not be advertised as a complete remote poker room. A remote participant cannot make authoritative digital bets until Phase 2 supplies legal actions and accounting. Full remote play would also introduce latency, timers, moderation, communication, absence, and recovery assumptions not required by the in-person product.

**Accepted result:** in-person Phase 1 is **LOCKED**; remote Public Table is **DEFERRED to Phase 2**; full remote human play is a **DEFERRED PIVOT** requiring refreshed research.

### 5. Private client, player identity, and host-as-player

**Facts**

- Bold Poker and Smart Dealer converge on a private device for each player's hole cards and a distinct public table.
- `AUTH-HOST-CAN-PLAY` requires the host operator to join from another device as an ordinary player.
- The project intentionally has no managed account system.

**Inference**

The supported privacy boundary is one active private browser instance per seat. A replacement flow rotates/revokes the old Seat Credential. Host authority, public/table controls, and the host operator's player seat remain separate capabilities and surfaces.

The system cannot honestly enforce “one physical human owns one physical device.” A person can use multiple browsers/profiles or share credentials. Preventing that would require accounts, invasive fingerprinting, or stronger identity proof and would still not eliminate collusion.

**Accepted result:** `PLAYER-ONE-PRIVATE-CLIENT` is a **RESEARCH-DEFAULT**; host-as-player is **LOCKED**; anti-collusion identity proof is out of scope.

### 6. One table now; isolation seams for later

**Facts**

- The product is designed around one social table of 2–10 seats.
- A card-blind Connection Service can relay several unrelated tables without becoming their game authority.
- Multi-table tournaments require event-level seating, balancing, table breaking, and authority coordination.

**Inference**

One Trusted Host runtime should own one table in Phase 1. Every capability, command, event, checkpoint, and diagnostic record still carries a `tableId`, so a deployer's connection service can safely multiplex isolated tables. A single host UI controlling several tables is not a Phase 1 requirement.

**Accepted result:** one table per Trusted Host is a **RESEARCH-DEFAULT**; multi-table orchestration is **DEFERRED**.

### 7. Reserve variants without implementing a plug-in ecosystem

**Facts**

- Bold Poker and several broader products support Omaha or other variants.
- PokerKit shows that deck, hole-card count, hand evaluator, betting structure, board policy, and session mode can differ independently.
- Each additional combination multiplies custody, showdown, history, settlement, projection, and test states.

**Inference**

Competitor breadth is not evidence that this project should implement variants now. The core needs a pinned `rulesProfileId` and versioned evaluator/deal ports, not partially functional booleans or executable rules plug-ins.

**Accepted result:** standard, one-board, high Texas Hold'em is current scope. Omaha, Short Deck, multiple boards, Run It Twice, mixed games, and other optional rule packs are **DEFERRED**.

## Architecture reservation

The central seam is who may authorize street progression:

```text
Deal-Only Profile
  physical betting occurs outside the app
  -> authorized dealer explicitly requests AdvanceStreet
  -> Game Core validates hand, revision, and lifecycle

Digital No-Limit Profile
  Accounting validates and records every betting action
  -> BettingRoundClosed authorizes AdvanceStreet
  -> SettlementPending separates proposed awards from balance mutation
```

Both profiles reuse card custody, dealing, Fold/Show, explicit hand end, projections, transport, persistence, and recovery. Phase 2 adds typed betting/accounting events; it does not reinterpret Phase 1's absent chip state.

A conceptual Rules Profile needs independent, pinned axes like these:

```yaml
cardGame: texas_holdem_high
deckPolicy: standard_52
boardPolicy: single_board
bettingAuthority: external_physical | digital
bettingStructure: absent | no_limit
sessionPolicy: physical_untracked | home_session
rulesVersion: <immutable version>
housePolicyVersion: <immutable version>
```

This is an architecture constraint, not a stable wire-schema commitment. Unsupported combinations fail before table creation, and a live table never changes its Rules Profile.

## Corner-case catalogue

| Situation | Required behavior | Status/source |
|---|---|---|
| Physical betting appears complete | Only an authorized dealer command advances the street; the app never infers completion from time or cards remaining. | `PHASE1-DEAL-ONLY` |
| Physical all-in or side pot exists | Phase 1 records no amount or pot truth and does not claim to allocate chips. Players settle physically before explicit End Hand. | `PHASE1-DEAL-ONLY`, `HAND-END-EXPLICIT` |
| Everyone folds | Mark the remaining player as awardable, but do not end or settle automatically. | `HAND-END-EXPLICIT` |
| One contender shows and others Fold | Evaluate only from available shown cards. Hidden losing hands remain Unknown and private. | `SHOWDOWN-CONCEDE` |
| Heads-up play | Dealer/small-blind position and pre/post-flop order must be covered by profile tests, not UI assumptions copied from larger tables. | `TEST-RULES-PROFILE` |
| Short all-in creates side pots | Phase 2 derives pots from immutable contributions and eligibility; balances remain unchanged until confirmed settlement. | `TEST-ACCOUNTING` |
| Tie leaves an odd chip | Do not guess. Pin a house policy when Phase 2 begins and include it in replay and explanation. | Deferred Phase 2 house policy |
| Player disconnects during a hand | Preserve the seat and current hand; after explicit hand end, apply the locked future-hand sit-out rule. | `RECOVERY-DISCONNECT-SIT-OUT` |
| Replacement device joins | Issue/restore only the same seat and revoke/rotate the old credential; never use display name as identity. | `JOIN-SEAT-CREDENTIAL` |
| One browser tries to control two private seats | Reject unsupported multi-seat private-client composition. Do not claim this prevents a person using another browser/device. | `PLAYER-ONE-PRIVATE-CLIENT` |
| Remote user can see the public board | Public viewing does not grant a player seat, private cards, or digital betting capability. | `REMOTE-PUBLIC-TABLE-P2` |
| Two tables share one Connection Service | Scope all credentials/state by table and prove cross-table isolation; the service still receives no game truth or cards. | `PHASE1-ONE-TABLE-PER-HOST`, `TEST-RULES-PROFILE` |
| Peer presents a different Rules Profile/version | Fail before seating/dealing; never coerce or update a live table. | `RULES-VERSIONED-PROFILE`, `NET-VERSION` |
| Optional rule combination is not implemented | Reject the profile. Do not silently ignore an option or approximate its settlement/history effects. | `TOURNAMENT-MULTITABLE-VARIANTS` |
| Future AI seat acts | Provide the exact pinned profile, public state, own authorized cards, and engine-issued legal actions. Never ask a model to infer the game variant. | `AI-SEAT-ADAPTER`, Phase 3 tests |

## Accepted defaults and deferred pivots

### Current accepted decisions

| Decision ID | Disposition | Practical consequence |
|---|---|---|
| `SCOPE-PLAY-MONEY` | **LOCKED** | No currency, payment, cash-out, rake, transferable value, or gambling account. |
| `PHASE1-DEAL-ONLY` | **LOCKED** | Phase 1 owns cards and lifecycle, not chip truth. |
| `RULES-VERSIONED-PROFILE` | **RESEARCH-DEFAULT** | Pin one supported rules/version combination per table. |
| `PHASE1-ONE-TABLE-PER-HOST` | **RESEARCH-DEFAULT** | One authority runtime per table; blind infrastructure may multiplex isolated tables. |
| `PLAYER-ONE-PRIVATE-CLIENT` | **RESEARCH-DEFAULT** | One active private browser instance per seat, with credential rotation on replacement. |
| `AUTH-HOST-CAN-PLAY` | **LOCKED** | Host operator uses a separate ordinary Player device/capability. |
| `PHASE2-NLHE-HOME-SESSION` | **RESEARCH-DEFAULT** | First digital profile is single-table, home-session No-Limit Hold'em with play chips. |

### Deferred changes that require a new gate

| Deferred item | Why it is not asked now | Reopen trigger |
|---|---|---|
| Full remote human play | Public viewing and internet reach do not supply betting, latency, absence, moderation, or recovery policy. | Explicit remote-first product direction after Phase 2 foundations. |
| Tournament lifecycle | Adds clock, blind schedule, elimination, entry/re-entry, seating, and event administration. | Tournament-first or tournament roadmap decision. |
| Multi-table orchestration | Adds cross-table authority, balancing, table breaking, and director workflow. | Supported event requires more than one table. |
| Fixed-limit, pot-limit, or mixed Hold'em | Changes legal action and raise rules. | Named demand plus full rules/accounting test plan. |
| Omaha, Short Deck, other poker games | Changes card custody, evaluation, showdown, history, and tests. | Explicit non-Hold'em roadmap expansion. |
| Multiple boards / Run It Twice / bounties / straddles | Creates rule interactions and settlement/history effects. | Phase 2 house-policy research admits a specific option. |
| Shared-device accessibility exception | May expose multiple private seats and complicate recovery. | Concrete accessibility need with a privacy-preserving interaction design. |

Real-money value is not merely deferred. It is outside the product boundary and would invalidate this research, licensing assumptions, risk model, and core PRDs.

## Test gates

### `TEST-RULES-PROFILE`

Before Phase 1 release and whenever a profile changes, verify:

- deal-only events and projections contain no invented stacks, amounts, pots, buy-ins, or settlement;
- the standard 52-card, two-hole-card, one-board high-hand profile handles heads-up, six-player, and ten-player tables;
- duplicate, stale, reordered, unauthorized, and cross-table commands cannot advance lifecycle;
- incompatible profile/build/protocol versions fail before seating or dealing;
- digital-mode street advance requires a committed `BettingRoundClosed`, while deal-only mode requires an explicit authorized dealer command;
- replay under the pinned rules/reducer version reconstructs the same state; and
- two tables using one Connection Service cannot read or mutate one another's capabilities, events, or projections.

### `TEST-ACCOUNTING`

Before Phase 2 activation, use table-driven, property/model-based, differential, and fault-injection tests for:

- exact legal check/call/bet/raise/fold/all-in actions and min/max raise amounts;
- non-negative stacks and total play-chip conservation;
- folds after contribution, short calls, simultaneous all-ins, nested side pots, ties, and odd chips;
- buy-in/top-up, sit-out/return, disconnect, duplicate action, and retry behavior;
- separation of `SettlementPending`, confirmation, balance mutation, rejection/reopen, and append-only correction;
- deterministic human-readable and machine-readable replay; and
- distinct public, per-player, and diagnostic history projections with no all-card export.

Unknown house rules—confirmation authority/timing, odd-chip allocation, straddles, antes, and missed blinds—must be researched and pinned before their fixtures are accepted. They are not implementation guesses or Phase 1 owner questions.

## Question-admission result

No candidate is currently `OPEN—MAJOR`:

- The Phase 1/Phase 2 boundary is already explicit and has direct product precedent.
- No-Limit Hold'em is a well-supported, reversible first digital profile behind a versioned seam.
- Tournament, multi-table, remote-first, and variant expansion are target/product pivots that are not needed to implement the current phase.
- One-human/one-device enforcement conflicts with the locked no-account direction and cannot be made truthful through UI preference.
- Accounting correctness and browser/table isolation are empirical test obligations, not stakeholder preferences.

## Fact / Inference / Unknown summary

### Facts

- The normative repository locks play-money Texas Hold'em, Phase 1 physical betting, explicit hand end, host-as-player through a separate device, no required accounts, and Phase 2 accounting deferral.
- Current primary rules and pinned code distinguish betting structure, session mode, player count, and card-game variant.
- Comparable products repeatedly separate private player devices from a public table.
- Digital no-chip play requires legal action, contribution, pot, settlement, and correction logic—not a standalone counter.

### Inferences

- Deal-only Phase 1 plus one NLHE home-session Phase 2 profile is the smallest scope consistent with the intended physical-table experience and future AI training.
- Orthogonal, pinned Rules Profile axes preserve future options without carrying their complexity into Phase 1.
- Internet connectivity should remain location-neutral, but complete remote play should not be claimed before its separate product and test gates.

### Unknowns

- Future demand and detailed policies for tournaments, remote-first play, variants, multiple boards, multi-table events, and shared-device accessibility.
- Phase 2 house policies for odd chips, straddles, antes, missed blinds, and settlement confirmation.
- Real-world correctness, usability, and recovery until the named tests run on the implemented system.

## Evidence limitations and refresh policy

- Product documentation establishes advertised behavior, not hidden architecture or measured reliability.
- The open-source references were inspected at the pinned revisions above; later changes do not update this report automatically.
- TDA material is tournament precedent and must not be silently imported into a relaxed home game.
- Academic poker results apply to their exact game definitions and do not validate this browser, networking, privacy, or AI-provider architecture.
- Recheck first-party sources and run a new `PIVOT_RESEARCH_V1` before any update trigger in the front matter changes the product direction.
